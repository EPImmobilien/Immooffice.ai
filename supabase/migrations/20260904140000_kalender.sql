-- ===========================================================================
-- Kalender-Ausbau (docs/FUNKTIONSABGLEICH.md K1/K2, Referenz-Kachel
-- „Kalender"): Serientermine, Teilnehmer, Ganztagstermine, private Termine,
-- Erinnerung vor dem Termin, Nachfassen nach Besichtigungen, Fahrzeiten,
-- Terminbestaetigung, Abgleich mit Google-/Microsoft-Kalendern, ICS-Abo je
-- Benutzer, persoenliche Kalender-Einstellungen, Geokodierungs-Cache.
-- ===========================================================================

-- --- Termine ------------------------------------------------------------------------
alter table public.termine
  add column ganztags            boolean not null default false,
  add column serie_id            uuid,
  add column serie_regel         jsonb,
  add column teilnehmer          uuid[] not null default '{}',
  add column privat              boolean not null default false,
  -- Minuten vor Beginn; null = keine Erinnerung
  add column erinnerung_minuten  integer check (erinnerung_minuten is null or erinnerung_minuten between 0 and 20160),
  add column erinnert_am         timestamptz,
  add column nachfassen          boolean not null default true,
  add column nachgefasst_am      timestamptz,
  -- {hin: {min, km, von, aus_termin, quelle}, rueck: {...}, basis, puffer_min, berechnet_am}
  add column fahrzeit            jsonb,
  add column bestaetigt_am       timestamptz,
  add column bestaetigung_nachricht_id uuid references public.nachrichten(id) on delete set null,
  -- Abgleich mit fremden Kalendern
  add column extern_quelle       text check (extern_quelle is null or extern_quelle in ('google', 'microsoft')),
  add column extern_id           text,
  add column postfach_id         uuid references public.postfaecher(id) on delete set null,
  add column extern_geaendert_am timestamptz,
  add column geloescht_am        timestamptz;

create index termine_serie_idx on public.termine (serie_id) where serie_id is not null;
create index termine_erinnerung_idx on public.termine (beginnt_am) where erinnerung_minuten is not null and erinnert_am is null and abgesagt_am is null and geloescht_am is null;
create unique index termine_extern_idx on public.termine (postfach_id, extern_id) where extern_id is not null;

comment on column public.termine.teilnehmer is 'Benutzer-IDs der Teilnehmer; der Zustaendige ist immer dabei.';
comment on column public.termine.geloescht_am is 'Weiches Loeschen — noetig, damit der Kalender-Abgleich die Loeschung an Google/Microsoft weitergeben kann.';

-- Private Termine sieht nur, wer beteiligt ist; Verwaltung sieht alles.
-- Die bisherige Schreib-Policy „for all" wirkte auch beim Lesen — deshalb getrennt.
drop policy termine_lesen on public.termine;
drop policy termine_schreiben on public.termine;
create policy termine_lesen on public.termine
  for select using (
    mandant_id = intern.aktueller_mandant()
    and (not privat or intern.ist_verwaltung() or zustaendig_id = auth.uid() or erstellt_von = auth.uid() or auth.uid() = any(teilnehmer))
  );
create policy termine_anlegen on public.termine
  for insert with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());
create policy termine_aendern on public.termine
  for update using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben()
    and (not privat or intern.ist_verwaltung() or zustaendig_id = auth.uid() or erstellt_von = auth.uid() or auth.uid() = any(teilnehmer)))
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());
create policy termine_loeschen on public.termine
  for delete using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben()
    and (not privat or intern.ist_verwaltung() or zustaendig_id = auth.uid() or erstellt_von = auth.uid()));

-- Teilnehmer muessen zum Mandanten gehoeren
create or replace function intern.termin_teilnehmer_pruefen()
returns trigger language plpgsql as $$
begin
  if array_length(new.teilnehmer, 1) is not null and exists (
    select 1 from unnest(new.teilnehmer) t(id) where not exists (select 1 from public.benutzer b where b.id = t.id and b.mandant_id = new.mandant_id)
  ) then
    raise exception 'Ein Teilnehmer gehoert nicht zu diesem Mandanten.';
  end if;
  if new.postfach_id is not null and not exists (select 1 from public.postfaecher p where p.id = new.postfach_id and p.mandant_id = new.mandant_id) then
    raise exception 'Das Postfach gehoert nicht zu diesem Mandanten.';
  end if;
  -- Zustaendiger ist immer Teilnehmer
  if new.zustaendig_id is not null and not (new.zustaendig_id = any(new.teilnehmer)) then
    new.teilnehmer := array_append(new.teilnehmer, new.zustaendig_id);
  end if;
  return new;
end $$;
create trigger termine_teilnehmer before insert or update on public.termine
  for each row execute function intern.termin_teilnehmer_pruefen();

-- --- Benutzer: Kalender-Einstellungen und ICS-Abo ----------------------------------------
alter table public.benutzer
  add column start_adresse          text,
  add column besichtigung_dauer_min integer not null default 60 check (besichtigung_dauer_min between 15 and 480),
  add column fahrzeit_puffer_min    integer not null default 5 check (fahrzeit_puffer_min between 0 and 60),
  add column fahrzeit_aktiv         boolean not null default true,
  add column kalender_farbe         text check (kalender_farbe is null or kalender_farbe ~ '^#[0-9A-Fa-f]{6}$'),
  add column kalender_token         text unique default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48);

-- Der Token ist ein Geheimnis: nur der eigene Benutzer liest ihn (ueber die Funktion).
create or replace function public.kalender_token_lesen(p_erneuern boolean default false)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  if p_erneuern then
    update public.benutzer set kalender_token = substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48) where id = auth.uid();
  end if;
  select kalender_token into v from public.benutzer where id = auth.uid();
  if v is null then
    update public.benutzer set kalender_token = substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48) where id = auth.uid() returning kalender_token into v;
  end if;
  return v;
end $$;
revoke all on function public.kalender_token_lesen(boolean) from public;
grant execute on function public.kalender_token_lesen(boolean) to authenticated;

-- Abo-Feed: Termine eines Benutzers ueber den Token (Dienstrolle, ohne Sitzung)
create or replace function public.kalender_feed(p_token text)
returns table (id uuid, titel text, art public.terminart, beginnt_am timestamptz, endet_am timestamptz, ganztags boolean, ort text, notiz text, abgesagt_am timestamptz, geaendert_am timestamptz, benutzer_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.titel, t.art, t.beginnt_am, t.endet_am, t.ganztags, t.ort, t.notiz, t.abgesagt_am, t.geaendert_am, b.name
    from public.benutzer b
    join public.termine t on t.mandant_id = b.mandant_id and t.geloescht_am is null
     and (t.zustaendig_id = b.id or b.id = any(t.teilnehmer) or (not t.privat and t.erstellt_von = b.id))
   where b.kalender_token = p_token and b.aktiv and length(p_token) >= 32
     and t.beginnt_am > now() - interval '90 days' and t.beginnt_am < now() + interval '400 days'
   order by t.beginnt_am
$$;
revoke all on function public.kalender_feed(text) from public;
grant execute on function public.kalender_feed(text) to service_role;

-- --- Postfaecher: Kalender-Abgleich -----------------------------------------------------
alter table public.postfaecher
  add column kalender_sync    boolean not null default false,
  add column kalender_zustand jsonb;

-- --- Erinnerungen und Nachfassen (Tagesarbeiten, Dienstrolle) ---------------------------
create or replace function public.termine_erinnerungen_faellig(p_max integer default 50)
returns table (id uuid, mandant_id uuid, titel text, art public.terminart, beginnt_am timestamptz, endet_am timestamptz, ganztags boolean, ort text, notiz text, empfaenger text[])
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.mandant_id, t.titel, t.art, t.beginnt_am, t.endet_am, t.ganztags, t.ort, t.notiz,
         coalesce((select array_agg(distinct b.email) from public.benutzer b where b.mandant_id = t.mandant_id and b.aktiv and (b.id = any(t.teilnehmer) or b.id = t.zustaendig_id)), '{}')
    from public.termine t
   where t.erinnerung_minuten is not null and t.erinnert_am is null and t.abgesagt_am is null and t.geloescht_am is null
     and t.beginnt_am - make_interval(mins => t.erinnerung_minuten) <= now()
     and t.beginnt_am > now() - interval '1 hour'
   order by t.beginnt_am
   limit greatest(1, least(p_max, 200))
$$;
revoke all on function public.termine_erinnerungen_faellig(integer) from public;
grant execute on function public.termine_erinnerungen_faellig(integer) to service_role;

create or replace function public.termin_erinnert(p_termin uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.termine set erinnert_am = now() where id = p_termin;
$$;
revoke all on function public.termin_erinnert(uuid) from public;
grant execute on function public.termin_erinnert(uuid) to service_role;

-- Nach einer Besichtigung entsteht am Folgetag eine Nachfass-Aufgabe fuer den Zustaendigen.
create or replace function public.besichtigungen_nachfassen()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer := 0; r record;
begin
  for r in
    select x.id, x.mandant_id, x.titel, x.objekt_id, x.kontakt_id, x.zustaendig_id, x.endet_am
      from public.termine x
     where x.art = 'besichtigung' and x.nachfassen and x.nachgefasst_am is null and x.abgesagt_am is null and x.geloescht_am is null
       and x.endet_am < now() - interval '18 hours' and x.endet_am > now() - interval '14 days'
     order by x.endet_am
     limit 100
  loop
    insert into public.aufgaben (mandant_id, titel, beschreibung, prioritaet, faellig_am, objekt_id, kontakt_id, zustaendig_id, termin_id, quelle)
    values (r.mandant_id, left('Nachfassen: ' || r.titel, 300), 'Wie war die Besichtigung? Rückmeldung einholen, nächsten Schritt vereinbaren.', 'mittel', current_date, r.objekt_id, r.kontakt_id, r.zustaendig_id, r.id, 'termin');
    update public.termine set nachgefasst_am = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.besichtigungen_nachfassen() from public;
grant execute on function public.besichtigungen_nachfassen() to service_role;

-- --- Serie: diesen oder alle folgenden Termine loeschen ----------------------------------
create or replace function public.termin_loeschen(p_termin uuid, p_folgende boolean default false)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m uuid := intern.aktueller_mandant(); r record; n integer;
begin
  if v_m is null or not intern.darf_schreiben() then raise exception 'Nicht erlaubt.'; end if;
  select * into r from public.termine where id = p_termin and mandant_id = v_m and geloescht_am is null;
  if r.id is null then raise exception 'Unbekannter Termin.'; end if;
  if p_folgende and r.serie_id is not null then
    with u as (
      update public.termine set geloescht_am = now()
       where mandant_id = v_m and serie_id = r.serie_id and beginnt_am >= r.beginnt_am and geloescht_am is null
      returning 1)
    select count(*) into n from u;
  else
    update public.termine set geloescht_am = now() where id = r.id;
    n := 1;
  end if;
  return n;
end $$;
revoke all on function public.termin_loeschen(uuid, boolean) from public;
grant execute on function public.termin_loeschen(uuid, boolean) to authenticated, service_role;

-- --- Geokodierungs-Cache (nur Adressen → Koordinaten, kein Personenbezug) --------------
create table public.geokodierung (
  adresse     text primary key,
  lat         double precision not null,
  lon         double precision not null,
  erstellt_am timestamptz not null default now()
);
alter table public.geokodierung enable row level security;
-- Keine Policies: Zugriff nur ueber die beiden Funktionen.
create or replace function public.geokodierung_holen(p_adresse text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('lat', lat, 'lon', lon) from public.geokodierung where adresse = lower(regexp_replace(trim(p_adresse), '\s+', ' ', 'g'))
$$;
create or replace function public.geokodierung_merken(p_adresse text, p_lat double precision, p_lon double precision)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.geokodierung (adresse, lat, lon) values (lower(regexp_replace(trim(p_adresse), '\s+', ' ', 'g')), p_lat, p_lon)
  on conflict (adresse) do update set lat = excluded.lat, lon = excluded.lon
$$;
revoke all on function public.geokodierung_holen(text) from public;
revoke all on function public.geokodierung_merken(text, double precision, double precision) from public;
grant execute on function public.geokodierung_holen(text) to authenticated, service_role;
grant execute on function public.geokodierung_merken(text, double precision, double precision) to authenticated, service_role;
