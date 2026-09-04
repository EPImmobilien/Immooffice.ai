-- ===========================================================================
-- Kalender, Paket 16b (docs/FUNKTIONSINVENTAR.md, Kachel Termine):
--   - Nachfass-Vorschlaege mit Mailentwurf und Freigabe auf der Startseite
--     (statt einer stillen Aufgabe), uebersprungen wenn der Kunde sich gemeldet hat
--   - Kundenerinnerung: Mail an den Kontakt etwa sechs Stunden vorher,
--     bei Fruehterminen am Vorabend, entfaellt bei kurzfristiger Vereinbarung
--   - Lead-Bezug am Termin (In der Akquise als Lead anlegen)
--   - gespeicherter Bestaetigungstext (KI-Vorschlag, editierbar)
--   - Credit-Preis fuer den KI-Bestaetigungstext
-- ===========================================================================
begin;

alter table public.termine
  add column if not exists lead_id                 uuid references public.akquise_leads(id) on delete set null,
  add column if not exists erinnerung_kunde        boolean not null default true,
  add column if not exists erinnerung_kunde_am     timestamptz,
  add column if not exists erinnerung_kunde_grund  text,
  add column if not exists bestaetigung_text       text;
comment on column public.termine.erinnerung_kunde is 'Kontakt etwa 6 h vorher per Mail erinnern (Referenz); Vorabend 18 Uhr bei Fruehterminen; entfaellt bei kurzfristiger Vereinbarung';
comment on column public.termine.erinnerung_kunde_grund is 'Warum keine Kundenerinnerung ging: kurzfristig, keine E-Mail, privat';

-- --- Nachfass-Vorschlaege ----------------------------------------------------------------
create table public.nachfass_vorschlaege (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  termin_id      uuid not null unique references public.termine(id) on delete cascade,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  objekt_id      uuid references public.objekte(id) on delete set null,
  zustaendig_id  uuid references public.benutzer(id) on delete set null,
  betreff        text not null,
  text           text not null,
  status         text not null default 'offen' check (status in ('offen', 'gesendet', 'uebersprungen', 'verworfen')),
  grund          text,
  faellig_am     date not null default current_date,
  nachricht_id   uuid,
  erstellt_am    timestamptz not null default now(),
  entschieden_am timestamptz,
  entschieden_von uuid references public.benutzer(id) on delete set null
);
create index nachfass_offen_idx on public.nachfass_vorschlaege(mandant_id, status) where status = 'offen';
alter table public.nachfass_vorschlaege enable row level security;
create policy nachfass_lesen on public.nachfass_vorschlaege
  for select using (mandant_id = intern.aktueller_mandant());
create policy nachfass_schreiben on public.nachfass_vorschlaege
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());
comment on table public.nachfass_vorschlaege is 'Nachfassen nach Besichtigung: Mailentwurf, Freigabe auf der Startseite (senden, ueberspringen, verwerfen)';

-- Nach einer Besichtigung entsteht nach drei Tagen ein Nachfass-Vorschlag mit
-- Mailentwurf. Hat sich der Kunde seit dem Termin per Mail gemeldet, wird er
-- als uebersprungen abgelegt (Referenz: „Kunde hat sich gemeldet").
create or replace function public.besichtigungen_nachfassen()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer := 0; r record; v_anrede text; v_text text; v_betreff text; v_gemeldet boolean; v_firma text;
begin
  for r in
    select x.id, x.mandant_id, x.titel, x.objekt_id, x.kontakt_id, x.zustaendig_id, x.endet_am,
           k.anrede, k.vorname, k.nachname, k.email,
           o.bezeichnung as objekt_bezeichnung, o.strasse, o.hausnummer, o.ort,
           b.name as makler
      from public.termine x
      left join public.kontakte k on k.id = x.kontakt_id
      left join public.objekte o on o.id = x.objekt_id
      left join public.benutzer b on b.id = x.zustaendig_id
     where x.art = 'besichtigung' and x.nachfassen and x.nachgefasst_am is null and x.abgesagt_am is null and x.geloescht_am is null
       and x.endet_am < now() - interval '3 days' and x.endet_am > now() - interval '21 days'
     order by x.endet_am
     limit 100
  loop
    if r.kontakt_id is null then
      -- ohne Kontakt kein Mailentwurf: schlichte Aufgabe wie bisher
      insert into public.aufgaben (mandant_id, titel, beschreibung, prioritaet, faellig_am, objekt_id, zustaendig_id, termin_id, quelle)
      values (r.mandant_id, left('Nachfassen: ' || r.titel, 300), 'Wie war die Besichtigung? Rückmeldung einholen, nächsten Schritt vereinbaren.', 'mittel', current_date, r.objekt_id, r.zustaendig_id, r.id, 'termin');
      update public.termine set nachgefasst_am = now() where id = r.id;
      n := n + 1;
      continue;
    end if;
    select exists (
      select 1 from public.nachrichten m
       where m.mandant_id = r.mandant_id and m.ordner = 'eingang' and m.kontakt_id = r.kontakt_id and m.gesendet_am > r.endet_am
    ) into v_gemeldet;
    select coalesce(mb.firmenname, ma.name) into v_firma from public.mandanten ma left join public.mandant_branding mb on mb.mandant_id = ma.id where ma.id = r.mandant_id;
    v_anrede := case when r.anrede = 'Frau' and r.nachname is not null then 'Sehr geehrte Frau ' || r.nachname || ','
                     when r.anrede = 'Herr' and r.nachname is not null then 'Sehr geehrter Herr ' || r.nachname || ','
                     when r.vorname is not null and r.nachname is not null then 'Guten Tag ' || r.vorname || ' ' || r.nachname || ','
                     else 'Sehr geehrte Damen und Herren,' end;
    v_betreff := 'Wie hat Ihnen die Besichtigung gefallen?' || case when r.objekt_bezeichnung is not null then ' – ' || r.objekt_bezeichnung else '' end;
    v_text := v_anrede || E'\n\nvielen Dank, dass Sie sich die Zeit für die Besichtigung'
      || case when r.strasse is not null then ' in der ' || r.strasse || coalesce(' ' || r.hausnummer, '') || coalesce(' in ' || r.ort, '') else '' end
      || E' genommen haben.\n\nWie ist Ihr Eindruck? Gern beantworte ich offene Fragen, stelle weitere Unterlagen zusammen oder vereinbare einen zweiten Termin.\n\nIch freue mich auf Ihre Rückmeldung.\n\nMit freundlichen Grüßen\n'
      || coalesce(r.makler, '') || E'\n' || coalesce(v_firma, '');
    insert into public.nachfass_vorschlaege (mandant_id, termin_id, kontakt_id, objekt_id, zustaendig_id, betreff, text, status, grund, faellig_am)
    values (r.mandant_id, r.id, r.kontakt_id, r.objekt_id, r.zustaendig_id, v_betreff, v_text,
            case when v_gemeldet then 'uebersprungen' else 'offen' end,
            case when v_gemeldet then 'Kunde hat sich seit dem Termin gemeldet' else null end, current_date)
    on conflict (termin_id) do nothing;
    update public.termine set nachgefasst_am = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- --- Kundenerinnerung -------------------------------------------------------------------
-- Faellig: etwa 6 h vorher; bei Terminen vor 12 Uhr bereits am Vorabend ab 18 Uhr.
create or replace function public.termine_kundenerinnerung_faellig(p_max integer default 50)
returns table (id uuid, mandant_id uuid, titel text, art public.terminart, beginnt_am timestamptz, endet_am timestamptz, ganztags boolean, ort text,
               kontakt_email text, kontakt_anrede text, kontakt_vorname text, kontakt_nachname text,
               objekt_strasse text, objekt_hausnummer text, objekt_plz text, objekt_ort text, makler text, firma text, kurzfristig boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.mandant_id, t.titel, t.art, t.beginnt_am, t.endet_am, t.ganztags, t.ort,
         k.email, k.anrede, k.vorname, k.nachname,
         o.strasse, o.hausnummer, o.plz, o.ort, b.name,
         coalesce(mb.firmenname, ma.name),
         (t.erstellt_am > t.beginnt_am - interval '6 hours') as kurzfristig
    from public.termine t
    join public.kontakte k on k.id = t.kontakt_id
    left join public.objekte o on o.id = t.objekt_id
    left join public.benutzer b on b.id = t.zustaendig_id
    join public.mandanten ma on ma.id = t.mandant_id
    left join public.mandant_branding mb on mb.mandant_id = ma.id
   where t.erinnerung_kunde and t.erinnerung_kunde_am is null and t.abgesagt_am is null and t.geloescht_am is null and not t.privat and not t.ganztags
     and k.email is not null and k.email <> ''
     and t.beginnt_am > now()
     and (
       t.beginnt_am - interval '6 hours' <= now()
       or (extract(hour from t.beginnt_am at time zone 'Europe/Berlin') < 12
           and ((date_trunc('day', t.beginnt_am at time zone 'Europe/Berlin') - interval '6 hours') at time zone 'Europe/Berlin') <= now())
     )
   order by t.beginnt_am
   limit greatest(1, least(p_max, 200))
$$;
revoke all on function public.termine_kundenerinnerung_faellig(integer) from public;
grant execute on function public.termine_kundenerinnerung_faellig(integer) to service_role;

create or replace function public.termin_kunde_erinnert(p_termin uuid, p_grund text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.termine set erinnerung_kunde_am = now(), erinnerung_kunde_grund = p_grund where id = p_termin;
$$;
revoke all on function public.termin_kunde_erinnert(uuid, text) from public;
grant execute on function public.termin_kunde_erinnert(uuid, text) to service_role;

-- --- Credits: Terminbestaetigung als KI-Text -------------------------------------------
insert into public.credit_preise (aktion, bezeichnung, credits) values
  ('ki_terminbestaetigung', 'Terminbestätigung als KI-Text formulieren', 1)
on conflict (aktion) do nothing;

commit;
