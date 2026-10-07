-- ===========================================================================
-- fork_85 — Bautraeger-Paket v2, Block D: Maengel-Workflow, Fristen, Verlauf
-- ===========================================================================
-- Auftrag vom 07.10.2026, Abschnitte C und D. Baut auf fork_84.
--
--   * projekte: Einstellungen fuer den Workflow — Standardfrist, Gewerke-
--     Liste und der Schalter „Mahnung automatisch senden" (Vorgabe: aus; die
--     Mahnung ist sonst ein Entwurf zur Freigabe).
--   * Verlauf: jeder Statuswechsel eines Mangels landet per Trigger in
--     projekt_maengel.verlauf — auch, wenn jemand den Status direkt in der
--     Oberflaeche aendert. Die Edge Functions haengen ihre Eintraege
--     (Erinnerung, Rueckfrage, Mail) ueber mangel_verlauf_anhaengen an.
--   * Glocke: projekt_glocke() schreibt einen Eintrag in aktivitaeten
--     (zielgruppe makler), den die Benachrichtigungsglocke der Vorlage
--     schon anzeigt. Kein zweiter Benachrichtigungsweg.
--   * To-do-Vorlage „Maengelbeseitigung" je Mandant: vier Schritte
--     (beauftragt -> Erinnerung -> Pruefung -> ggf. Mahnung). Sie wird
--     angelegt, wenn der erste Mangel mit Frist entsteht, nicht hier fuer
--     alle Mandanten auf Vorrat — ein Mandant ohne Neubau braucht sie nicht.
--   * Cron: maengel-fristen taeglich 06:20 — Erinnerung drei Tage vor der
--     Frist, zweite Erinnerung plus To-do „Mahnung" danach.
--
-- RUECKNAHME: drop trigger projekt_maengel_verlauf_trg; drop function der
-- vier Funktionen; cron.unschedule('maengel-fristen-taeglich'); alter table
-- projekte drop column mahnung_automatisch, frist_standard_tage, gewerke.
-- ===========================================================================

alter table public.projekte
  add column if not exists mahnung_automatisch boolean not null default false,
  add column if not exists frist_standard_tage integer not null default 14,
  add column if not exists gewerke             text[] not null default '{}';
comment on column public.projekte.mahnung_automatisch is
  'Auftrag D: Mahnung mit Nachfrist geht automatisch an den Handwerker. Aus = Entwurf zur Freigabe durch die Verwaltung.';
comment on column public.projekte.gewerke is
  'Feste Gewerk-Auswahl des Projekts. Leer = Standardliste der Oberflaeche plus die Gewerke aus projekt_kontakte.';

-- --- Verlauf -------------------------------------------------------------------
create or replace function public.mangel_verlauf_anhaengen(p_mangel uuid, p_wer text, p_was text, p_text text default null)
 returns void
 language sql
 security invoker
 set search_path = public
as $$
  update public.projekt_maengel
     set verlauf = coalesce(verlauf, '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'am', now(), 'wer', p_wer, 'was', p_was, 'text', p_text))),
         bearbeitet_am = now()
   where id = p_mangel
$$;
grant execute on function public.mangel_verlauf_anhaengen(uuid, text, text, text) to authenticated;
-- Rechte: anon darf nichts in public rufen (tests/funktionsrechte.sql); Trigger-Funktionen braucht niemand direkt.
revoke all on function public.mangel_verlauf_anhaengen(uuid, text, text, text) from public, anon;

create or replace function public.projekt_maengel_verlauf_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $$
declare wer text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Wer: der angemeldete Nutzer, sonst „system" (Dienstschluessel, Cron).
    select coalesce(p.name, p.email) into wer from public.profiles p where p.id = auth.uid();
    new.verlauf := coalesce(new.verlauf, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'am', now(), 'wer', coalesce(wer, 'system'), 'was', 'status', 'von', old.status, 'nach', new.status));
    new.bearbeitet_am := now();
    if new.status = 'gemeldet_erledigt' and new.gemeldet_erledigt_am is null then new.gemeldet_erledigt_am := now(); end if;
    if new.status in ('geprueft_erledigt', 'abgelehnt') and new.geprueft_am is null then
      new.geprueft_am := now(); new.geprueft_von := auth.uid();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists projekt_maengel_verlauf_trg on public.projekt_maengel;
create trigger projekt_maengel_verlauf_trg before update on public.projekt_maengel
  for each row execute function public.projekt_maengel_verlauf_trg();
revoke all on function public.projekt_maengel_verlauf_trg() from public, anon;

-- Ein Mangel schliesst sein To-do, wenn er geprueft ist — die Verwaltung soll
-- nicht zweimal abhaken.
create or replace function public.projekt_maengel_todo_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $$
begin
  if new.todo_id is not null and new.status in ('geprueft_erledigt', 'abgelehnt')
     and old.status is distinct from new.status then
    update public.todos set status = 'erledigt', erledigt_am = now(),
           ergebnis = coalesce(ergebnis, '') || case when new.status = 'abgelehnt' then 'Mangel abgelehnt.' else 'Mangel geprueft und erledigt.' end
     where id = new.todo_id and status <> 'erledigt';
  end if;
  return new;
end $$;
drop trigger if exists projekt_maengel_todo_trg on public.projekt_maengel;
create trigger projekt_maengel_todo_trg after update on public.projekt_maengel
  for each row execute function public.projekt_maengel_todo_trg();
revoke all on function public.projekt_maengel_todo_trg() from public, anon;

-- --- Glocke --------------------------------------------------------------------------
-- Eintrag fuer die Benachrichtigungsglocke der Verwaltung. p_empfaenger null =
-- alle im Haus (die Glocke der Vorlage zeigt Eintraege ohne Empfaenger jedem).
create or replace function public.projekt_glocke(p_mandant uuid, p_typ text, p_titel text, p_text text,
                                                 p_ref_tabelle text default null, p_ref_id uuid default null,
                                                 p_empfaenger uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path = public
as $$
declare neu uuid;
begin
  if p_mandant is null then raise exception 'projekt_glocke: Mandant fehlt' using errcode = '22023'; end if;
  -- Nur fuer den eigenen Mandanten oder fuer den Dienstschluessel.
  if auth.uid() is not null and p_mandant <> public.mandant_id_schreiben() then
    raise exception 'projekt_glocke: fremder Mandant' using errcode = '42501';
  end if;
  insert into public.aktivitaeten (mandant_id, zielgruppe, empfaenger_user_id, typ, titel, text, ref_tabelle, ref_id)
  values (p_mandant, 'makler', p_empfaenger, p_typ, left(p_titel, 200), p_text, p_ref_tabelle, p_ref_id)
  returning id into neu;
  return neu;
end $$;
grant execute on function public.projekt_glocke(uuid, text, text, text, text, uuid, uuid) to authenticated;
revoke all on function public.projekt_glocke(uuid, text, text, text, text, uuid, uuid) from public, anon;

-- --- To-do-Vorlage „Maengelbeseitigung" ---------------------------------------------------
create or replace function public.maengel_vorlage_sicherstellen(p_mandant uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path = public
as $$
declare v uuid;
begin
  if p_mandant is null then raise exception 'maengel_vorlage_sicherstellen: Mandant fehlt' using errcode = '22023'; end if;
  if auth.uid() is not null and p_mandant <> public.mandant_id_schreiben() then
    raise exception 'maengel_vorlage_sicherstellen: fremder Mandant' using errcode = '42501';
  end if;
  select id into v from public.todo_vorlage where mandant_id = p_mandant and name = 'Mängelbeseitigung' limit 1;
  if v is not null then return v; end if;
  insert into public.todo_vorlage (mandant_id, name, beschreibung, bezug_typ, aktiv, sortierung)
  values (p_mandant, 'Mängelbeseitigung',
          'Auftrag an den Handwerker, Erinnerung vor der Frist, Prüfung der Erledigung, bei Überschreitung Mahnung mit Nachfrist. Wird je Mangel aus der Abnahme oder dem Kundenportal gestartet.',
          'mangel', true, 90)
  returning id into v;
  insert into public.todo_vorlage_schritt (mandant_id, vorlage_id, nr, titel, beschreibung, rolle, offset_tage, offset_ab, vorgaenger_nr, prioritaet) values
    (p_mandant, v, 1, 'Handwerker beauftragt', 'Sammelmail mit Token-Link ist raus; Auftrag im Verlauf des Mangels.', 'verwaltung', 0, 'start', null, 'normal'),
    (p_mandant, v, 2, 'Erinnerung an den Handwerker', 'Drei Tage vor der Frist ohne Rückmeldung — automatisch durch maengel-fristen.', 'verwaltung', -3, 'start', 1, 'normal'),
    (p_mandant, v, 3, 'Erledigung prüfen', 'Handwerker hat „erledigt“ mit Foto gemeldet — vor Ort oder am Foto prüfen, dann geprüft_erledigt oder zurück.', 'bauleitung', 0, 'vorgaenger', 2, 'wichtig'),
    (p_mandant, v, 4, 'Mahnung mit Nachfrist', 'Frist überschritten — Mahnung als Entwurf zur Freigabe (oder automatisch, je Projekteinstellung).', 'verwaltung', 1, 'start', 2, 'dringend');
  return v;
end $$;
grant execute on function public.maengel_vorlage_sicherstellen(uuid) to authenticated;
revoke all on function public.maengel_vorlage_sicherstellen(uuid) from public, anon;

-- --- Cron: Fristen taeglich -----------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'maengel-fristen-taeglich') then
    perform cron.unschedule('maengel-fristen-taeglich');
  end if;
  perform cron.schedule('maengel-fristen-taeglich', '20 6 * * *',
    $cron$select net.http_post(url := public.eigene_funktions_url('maengel-fristen'),
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
      body := '{}'::jsonb, timeout_milliseconds := 60000)$cron$);
end $$;

-- --- KI: Diktat -> Mangeltext (mangel-text) --------------------------------------------------
-- Ein Credit je Aufruf als Vorgabe; der Betreiber aendert den Preis im
-- Plattform-Bereich. Notschalter und Modell ebenfalls dort.
insert into public.plattform_credit_preise (aktion, name, credits, beschreibung, sortierung, aktiv)
values ('mangel_text', 'Mangeltext aus Diktat', 1, 'Formuliert aus dem Diktat bei der Abnahme Titel und Beschreibung eines Mangels und schlaegt das Gewerk vor', 91, true)
on conflict (aktion) do nothing;
insert into public.plattform_ki_einstellungen (funktion, name, anbieter, modell)
values ('mangel_text', 'Mangeltext aus Diktat', 'anthropic', 'claude-sonnet-4-6')
on conflict (funktion) do nothing;
