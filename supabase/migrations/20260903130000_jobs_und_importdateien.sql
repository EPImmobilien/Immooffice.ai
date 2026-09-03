-- ===========================================================================
-- ImmoOffice.ai — Auftragswarteschlange mit Waechter, Importdateien
--
-- ARCHITECTURE.md Abschnitt 3 (Job-Verarbeitung), Funktionsprompt
-- Grundprinzip „Hintergrundjobs mit Waechter", docs/AUTONOMIE.md 5.1
-- (scheduler). Entscheidung E-2026-09-03-16: Die Warteschlange ist die
-- Tabelle selbst (FOR UPDATE SKIP LOCKED), keine Erweiterung.
--
-- Garantien:
--   - Zustand jedes Auftrags ist abfragbar (Plattform-Admin, Abschnitt 15)
--   - Wiederholung mit wachsendem Abstand, Verlauf je Versuch
--   - Waechter: ein Arbeiter, der nicht zurueckmeldet, blockiert nichts —
--     nach Ablauf der Sperre wird der Auftrag freigegeben oder endgueltig
--     als gescheitert markiert
--   - reservierte Credits werden beim endgueltigen Scheitern freigegeben
--     (Abschnitt 14), beim Erfolg eingeloest
--
-- Beanspruchen, Abschliessen und Scheitern duerfen nur Arbeiter mit der
-- Dienstrolle; Einstellen und Lesen laufen im Mandantenkontext.
-- ===========================================================================

create type public.job_status as enum ('offen', 'laeuft', 'fertig', 'fehler', 'abgebrochen');

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  -- Welcher Arbeiter zustaendig ist (src/lib/jobs/worker.ts). Die Liste ist
  -- eng, damit kein Auftrag mit unbekannter Art in der Schlange liegen bleibt.
  art           text not null check (art in ('sync', 'ki_text', 'ki_bild', 'mail', 'export')),
  nutzlast      jsonb not null default '{}'::jsonb,

  status        public.job_status not null default 'offen',
  prioritaet    smallint not null default 5 check (prioritaet between 1 and 9),
  versuche      integer not null default 0 check (versuche >= 0),
  max_versuche  integer not null default 3 check (max_versuche between 1 and 10),
  naechster_versuch_am timestamptz not null default now(),

  -- Sichtbarkeitsfrist: Solange sie laeuft, gehoert der Auftrag dem Arbeiter.
  sperre_bis    timestamptz,
  arbeiter      text,
  gestartet_am  timestamptz,
  beendet_am    timestamptz,

  ergebnis      jsonb,
  fehler_text   text,
  -- Verlauf je Versuch: [{versuch, zeit, fehler}]
  fehler_verlauf jsonb not null default '[]'::jsonb,

  -- Reservierte Credits (Abschnitt 14): beim Scheitern freigeben, beim Erfolg einloesen.
  credit_vorgang_id uuid references public.credit_vorgaenge(id) on delete set null,

  erstellt_von  uuid references auth.users(id) on delete set null,
  erstellt_am   timestamptz not null default now()
);

create index jobs_offen_idx on public.jobs(naechster_versuch_am, prioritaet)
  where status = 'offen';
create index jobs_laeuft_idx on public.jobs(sperre_bis) where status = 'laeuft';
create index jobs_mandant_idx on public.jobs(mandant_id, erstellt_am desc);

comment on table public.jobs is
  'Auftragswarteschlange. Einstellen ueber job_einstellen(); beanspruchen, abschliessen und scheitern nur ueber die Dienstrolle.';

alter table public.jobs enable row level security;

-- Alle im Mandanten sehen die Auftraege des Mandanten (Zustand der eigenen
-- Abgleiche, KI-Auftraege). Kein Schreiben per Policy.
create policy jobs_lesen on public.jobs
  for select using (mandant_id = intern.aktueller_mandant());

-- Bezug zwischen Sync-Lauf und Auftrag.
alter table public.sync_laeufe
  add column job_id uuid references public.jobs(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Einstellen (Mandantenkontext)
-- ---------------------------------------------------------------------------

create or replace function public.job_einstellen(
  p_art        text,
  p_nutzlast   jsonb default '{}'::jsonb,
  p_prioritaet smallint default 5,
  p_credit_vorgang uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_id uuid;
begin
  if v_mandant is null then
    raise exception 'Kein Mandant in der Sitzung.';
  end if;
  if not intern.darf_schreiben() then
    raise exception 'Nur-Lese-Zugaenge koennen keine Auftraege einstellen.';
  end if;

  -- Ein Credit-Vorgang darf nur an einen Auftrag desselben Mandanten haengen.
  if p_credit_vorgang is not null and not exists (
    select 1 from public.credit_vorgaenge
     where id = p_credit_vorgang and mandant_id = v_mandant and status = 'reserviert'
  ) then
    raise exception 'Der Credit-Vorgang gehoert nicht zu diesem Mandanten oder ist nicht reserviert.';
  end if;

  insert into public.jobs (mandant_id, art, nutzlast, prioritaet, credit_vorgang_id, erstellt_von)
  values (v_mandant, p_art, coalesce(p_nutzlast, '{}'::jsonb), coalesce(p_prioritaet, 5), p_credit_vorgang, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.job_einstellen(text, jsonb, smallint, uuid) from public, anon;
grant execute on function public.job_einstellen(text, jsonb, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Credits aus dem Arbeiter heraus (ohne Sitzung)
--
-- credits_einloesen() und credits_freigeben() lesen den Mandanten aus der
-- Sitzung — der Arbeiter hat keine. Diese Fassung nimmt den Mandanten aus
-- dem Vorgang selbst. Sie liegt in `intern`, ist ueber die Schnittstelle
-- nicht erreichbar und wird nur von den Auftragsfunktionen aufgerufen.
-- ---------------------------------------------------------------------------

create or replace function intern.credit_vorgang_beenden(
  p_vorgang uuid,
  p_erfolg  boolean,
  p_grund   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vorgang public.credit_vorgaenge%rowtype;
  v_buchung record;
begin
  select * into v_vorgang from public.credit_vorgaenge
   where id = p_vorgang and status = 'reserviert'
   for update;
  if v_vorgang.id is null then
    return;  -- bereits abgeschlossen: nichts zu tun
  end if;

  for v_buchung in
    select konto_id, menge from public.credit_buchungen
     where vorgang_id = p_vorgang and richtung = 'reservierung'
  loop
    if p_erfolg then
      update public.credit_konto
         set reserviert = reserviert - v_buchung.menge,
             verbraucht = verbraucht + v_buchung.menge
       where id = v_buchung.konto_id;
      insert into public.credit_buchungen (mandant_id, konto_id, vorgang_id, richtung, menge)
      values (v_vorgang.mandant_id, v_buchung.konto_id, p_vorgang, 'verbrauch', v_buchung.menge);
    else
      update public.credit_konto
         set reserviert = reserviert - v_buchung.menge
       where id = v_buchung.konto_id;
      insert into public.credit_buchungen (mandant_id, konto_id, vorgang_id, richtung, menge, bemerkung)
      values (v_vorgang.mandant_id, v_buchung.konto_id, p_vorgang, 'freigabe', v_buchung.menge, p_grund);
    end if;
  end loop;

  update public.credit_vorgaenge
     set status = case when p_erfolg then 'eingeloest'::public.vorgang_status else 'freigegeben'::public.vorgang_status end,
         beendet_am = now(),
         grund = case when p_erfolg then grund else p_grund end
   where id = p_vorgang;
end;
$$;

revoke all on function intern.credit_vorgang_beenden(uuid, boolean, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Waechter (Dienstrolle)
--
-- Auftraege, deren Sperre abgelaufen ist, gehoeren niemandem mehr. Sie gehen
-- zurueck in die Schlange — oder sind endgueltig gescheitert, wenn die
-- Versuche aufgebraucht sind. Dann werden reservierte Credits freigegeben.
-- ---------------------------------------------------------------------------

create or replace function public.jobs_waechter()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
  v_anzahl integer := 0;
begin
  for v_job in
    select * from public.jobs
     where status = 'laeuft' and sperre_bis is not null and sperre_bis < now()
     for update skip locked
  loop
    v_anzahl := v_anzahl + 1;
    if v_job.versuche >= v_job.max_versuche then
      update public.jobs
         set status = 'fehler',
             beendet_am = now(),
             sperre_bis = null,
             arbeiter = null,
             fehler_text = 'Der Arbeiter hat nicht zurueckgemeldet; keine weiteren Versuche.',
             fehler_verlauf = fehler_verlauf || jsonb_build_object(
               'versuch', v_job.versuche, 'zeit', now(),
               'fehler', 'Sperre abgelaufen ohne Rueckmeldung')
       where id = v_job.id;
      if v_job.credit_vorgang_id is not null then
        perform intern.credit_vorgang_beenden(v_job.credit_vorgang_id, false, 'Auftrag endgueltig gescheitert (Waechter)');
      end if;
    else
      update public.jobs
         set status = 'offen',
             sperre_bis = null,
             arbeiter = null,
             naechster_versuch_am = now(),
             fehler_verlauf = fehler_verlauf || jsonb_build_object(
               'versuch', v_job.versuche, 'zeit', now(),
               'fehler', 'Sperre abgelaufen ohne Rueckmeldung')
       where id = v_job.id;
    end if;
  end loop;
  return v_anzahl;
end;
$$;

-- ---------------------------------------------------------------------------
-- Beanspruchen (Dienstrolle)
--
-- FOR UPDATE SKIP LOCKED: Mehrere Arbeiter koennen gleichzeitig greifen,
-- ohne sich denselben Auftrag zu nehmen. Der Waechter laeuft davor, damit
-- haengengebliebene Auftraege nicht auf einen eigenen Zeitplan warten.
-- ---------------------------------------------------------------------------

create or replace function public.jobs_beanspruchen(
  p_arbeiter        text,
  p_anzahl          integer default 5,
  p_sperre_sekunden integer default 300
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.jobs_waechter();

  return query
    with kandidaten as (
      select id from public.jobs
       where status = 'offen' and naechster_versuch_am <= now()
       order by prioritaet, erstellt_am
       for update skip locked
       limit greatest(1, least(coalesce(p_anzahl, 5), 50))
    )
    update public.jobs j
       set status = 'laeuft',
           versuche = j.versuche + 1,
           arbeiter = p_arbeiter,
           gestartet_am = now(),
           sperre_bis = now() + make_interval(secs => greatest(30, coalesce(p_sperre_sekunden, 300)))
      from kandidaten k
     where j.id = k.id
    returning j.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- Abschliessen und Scheitern (Dienstrolle)
-- ---------------------------------------------------------------------------

create or replace function public.job_abschliessen(
  p_id       uuid,
  p_ergebnis jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs where id = p_id for update;
  if v_job.id is null then
    raise exception 'Auftrag nicht gefunden.';
  end if;
  if v_job.status <> 'laeuft' then
    raise exception 'Auftrag ist nicht in Arbeit (Status %).', v_job.status;
  end if;

  update public.jobs
     set status = 'fertig', beendet_am = now(), sperre_bis = null,
         ergebnis = p_ergebnis, fehler_text = null
   where id = p_id;

  if v_job.credit_vorgang_id is not null then
    perform intern.credit_vorgang_beenden(v_job.credit_vorgang_id, true);
  end if;
end;
$$;

-- Scheitern: Wiederholung mit wachsendem Abstand (1, 2, 4, 8 … Minuten);
-- nach dem letzten Versuch endgueltig, mit Freigabe der Credits.
create or replace function public.job_fehlgeschlagen(
  p_id     uuid,
  p_fehler text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs where id = p_id for update;
  if v_job.id is null then
    raise exception 'Auftrag nicht gefunden.';
  end if;
  if v_job.status <> 'laeuft' then
    raise exception 'Auftrag ist nicht in Arbeit (Status %).', v_job.status;
  end if;

  if v_job.versuche >= v_job.max_versuche then
    update public.jobs
       set status = 'fehler', beendet_am = now(), sperre_bis = null, arbeiter = null,
           fehler_text = left(coalesce(p_fehler, 'unbekannter Fehler'), 2000),
           fehler_verlauf = fehler_verlauf || jsonb_build_object(
             'versuch', v_job.versuche, 'zeit', now(), 'fehler', left(coalesce(p_fehler, ''), 2000))
     where id = p_id;
    if v_job.credit_vorgang_id is not null then
      perform intern.credit_vorgang_beenden(v_job.credit_vorgang_id, false, 'Auftrag endgueltig gescheitert');
    end if;
  else
    update public.jobs
       set status = 'offen', sperre_bis = null, arbeiter = null,
           naechster_versuch_am = now() + make_interval(mins => power(2, v_job.versuche)::integer),
           fehler_text = left(coalesce(p_fehler, 'unbekannter Fehler'), 2000),
           fehler_verlauf = fehler_verlauf || jsonb_build_object(
             'versuch', v_job.versuche, 'zeit', now(), 'fehler', left(coalesce(p_fehler, ''), 2000))
     where id = p_id;
  end if;
end;
$$;

-- Die Arbeiterfunktionen bekommt ausschliesslich die Dienstrolle. Ein
-- angemeldeter Benutzer koennte sonst fremde Auftraege beanspruchen oder
-- als erledigt markieren.
revoke all on function public.jobs_waechter() from public, anon, authenticated;
revoke all on function public.jobs_beanspruchen(text, integer, integer) from public, anon, authenticated;
revoke all on function public.job_abschliessen(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.job_fehlgeschlagen(uuid, text) from public, anon, authenticated;
grant execute on function public.jobs_waechter() to service_role;
grant execute on function public.jobs_beanspruchen(text, integer, integer) to service_role;
grant execute on function public.job_abschliessen(uuid, jsonb) to service_role;
grant execute on function public.job_fehlgeschlagen(uuid, text) to service_role;

-- Ein Mandant darf einen noch offenen eigenen Auftrag abbrechen.
create or replace function public.job_abbrechen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs
   where id = p_id and mandant_id = intern.aktueller_mandant()
   for update;
  if v_job.id is null then
    raise exception 'Auftrag nicht gefunden.';
  end if;
  if not intern.ist_verwaltung() and v_job.erstellt_von is distinct from auth.uid() then
    raise exception 'Nur die Verwaltung oder der Ersteller kann einen Auftrag abbrechen.';
  end if;
  if v_job.status <> 'offen' then
    raise exception 'Nur offene Auftraege lassen sich abbrechen.';
  end if;

  update public.jobs set status = 'abgebrochen', beendet_am = now() where id = p_id;
  if v_job.credit_vorgang_id is not null then
    perform intern.credit_vorgang_beenden(v_job.credit_vorgang_id, false, 'Auftrag abgebrochen');
  end if;
end;
$$;

revoke all on function public.job_abbrechen(uuid) from public, anon;
grant execute on function public.job_abbrechen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Importdateien (OpenImmo-Pakete): privater Bucket, nur eigener Mandantenordner
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('importe', 'importe', false, 104857600,
        array['application/zip', 'application/x-zip-compressed', 'application/octet-stream',
              'text/xml', 'application/xml'])
on conflict (id) do nothing;

create policy importe_anlegen on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'importe'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.ist_verwaltung()
  );

create policy importe_lesen on storage.objects
  for select to authenticated
  using (
    bucket_id = 'importe'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.ist_verwaltung()
  );

create policy importe_loeschen on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'importe'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.ist_verwaltung()
  );
