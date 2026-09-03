-- ===========================================================================
-- Vermietung (docs/FUNKTIONSABGLEICH.md, Paket M1): Mietanfragen mit
-- Selbstauskunft-Formular und Antwortvorlagen, Mietvertraege, Reservierungen
-- fuer den Bestand.
-- ===========================================================================

-- --- Verweise mandantenrein (Objekt und Kontakt) ----------------------------
create or replace function intern.vermietung_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if new.objekt_id is not null and not exists (
    select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.kontakt_id is not null and not exists (
    select 1 from public.kontakte k where k.id = new.kontakt_id and k.mandant_id = new.mandant_id) then
    raise exception 'Der Kontakt gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;

-- --- Mietanfragen ----------------------------------------------------------
create table public.mietanfragen (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  objekt_id      uuid references public.objekte(id) on delete set null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  quelle         text not null default 'manuell'
    check (quelle in ('manuell', 'email', 'web', 'selbstauskunft')),
  status         text not null default 'neu'
    check (status in ('neu', 'in_pruefung', 'besichtigung_geplant', 'besichtigung_erfolgt',
                      'unterlagen_angefordert', 'zusage', 'absage', 'vertrag')),
  anrede         text,
  vorname        text,
  nachname       text not null check (length(trim(nachname)) between 1 and 200),
  email          text,
  telefon        text,
  personen_anzahl smallint check (personen_anzahl is null or personen_anzahl between 1 and 20),
  einzug_ab      date,
  beruf          text,
  arbeitgeber    text,
  einkommen_netto numeric(10,2) check (einkommen_netto is null or einkommen_netto >= 0),
  schufa_vorhanden boolean,
  kann_kaution_leisten boolean,
  haustiere      text,
  raucher        boolean,
  derzeitiger_vermieter text,
  mietverhaeltnis_seit text,
  mitteilung     text,
  bewertung      smallint check (bewertung is null or bewertung between 1 and 5),
  notizen        text,
  datenschutz_einwilligung boolean not null default false,
  angaben_bestaetigt boolean not null default false,
  besichtigung_am timestamptz,
  -- Verlauf der Antworten: [{zeitpunkt, vorlage, betreff, weg}]
  antwort_verlauf jsonb not null default '[]'::jsonb,
  -- Ursprung bei E-Mail: {absender, betreff, datum, nachricht_id}
  email_eingang  jsonb,
  eingegangen_am timestamptz not null default now(),
  erstellt_von   uuid references public.benutzer(id) on delete set null,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now()
);

create index mietanfragen_mandant on public.mietanfragen (mandant_id, eingegangen_am desc);
create index mietanfragen_objekt on public.mietanfragen (objekt_id);
create index mietanfragen_status on public.mietanfragen (mandant_id, status);

create trigger mietanfragen_geaendert before update on public.mietanfragen
  for each row execute function intern.setze_geaendert_am();
create trigger mietanfragen_verweise before insert or update on public.mietanfragen
  for each row execute function intern.vermietung_verweise_pruefen();

alter table public.mietanfragen enable row level security;
create policy mietanfragen_lesen on public.mietanfragen
  for select using (mandant_id = intern.aktueller_mandant());
create policy mietanfragen_schreiben on public.mietanfragen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Selbstauskunft-Formular (oeffentlich ueber Token) -------------------------
create table public.selbstauskunft_links (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  objekt_id    uuid references public.objekte(id) on delete cascade,
  bezeichnung  text not null check (length(trim(bezeichnung)) between 1 and 120),
  token        text not null unique check (token ~ '^[a-z0-9]{16,64}$'),
  aktiv        boolean not null default true,
  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);
create index selbstauskunft_links_mandant on public.selbstauskunft_links (mandant_id);
alter table public.selbstauskunft_links enable row level security;
create policy selbstauskunft_links_lesen on public.selbstauskunft_links
  for select using (mandant_id = intern.aktueller_mandant());
create policy selbstauskunft_links_schreiben on public.selbstauskunft_links
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());
create or replace function intern.objekt_verweis_pruefen()
returns trigger language plpgsql as $$
begin
  if new.objekt_id is not null and not exists (
    select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger selbstauskunft_links_verweise before insert or update on public.selbstauskunft_links
  for each row execute function intern.objekt_verweis_pruefen();

-- Oeffentlich: Was zeigt das Formular? Nur Firmenname und Objekt-Kurzangaben.
create or replace function public.selbstauskunft_oeffnen(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare l public.selbstauskunft_links; o public.objekte; b public.mandant_branding;
begin
  select * into l from public.selbstauskunft_links where token = p_token and aktiv;
  if not found then return jsonb_build_object('zustand', 'unbekannt'); end if;
  select * into b from public.mandant_branding where mandant_id = l.mandant_id;
  if l.objekt_id is not null then
    select * into o from public.objekte where id = l.objekt_id and geloescht_am is null;
  end if;
  return jsonb_build_object(
    'zustand', 'ok',
    'firma', coalesce(b.firmenname, (select name from public.mandanten where id = l.mandant_id)),
    'datenschutz', b.datenschutztext,
    'objekt', case when o.id is null then null else jsonb_build_object(
      'bezeichnung', coalesce(o.titel, o.bezeichnung), 'ort', o.ort, 'plz', o.plz,
      'kaltmiete', o.kaltmiete, 'wohnflaeche', o.wohnflaeche, 'zimmer', o.zimmer) end
  );
end $$;
revoke all on function public.selbstauskunft_oeffnen(text) from public;
grant execute on function public.selbstauskunft_oeffnen(text) to anon, authenticated;

-- Oeffentlich: Selbstauskunft einreichen (25 je Link und Tag).
create or replace function public.selbstauskunft_einreichen(p_token text, p_daten jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare l public.selbstauskunft_links; v_heute integer; v_id uuid;
  v_nachname text := nullif(btrim(coalesce(p_daten->>'nachname', '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_daten->>'email', '')), ''));
begin
  select * into l from public.selbstauskunft_links where token = p_token and aktiv;
  if not found then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;
  if v_nachname is null or v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'grund', 'eingabe');
  end if;
  if coalesce((p_daten->>'datenschutz')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'grund', 'datenschutz');
  end if;
  select count(*) into v_heute from public.mietanfragen
   where mandant_id = l.mandant_id and quelle = 'selbstauskunft' and eingegangen_am > now() - interval '1 day';
  if v_heute >= 100 then return jsonb_build_object('ok', false, 'grund', 'zu_viele'); end if;

  insert into public.mietanfragen (mandant_id, objekt_id, quelle, anrede, vorname, nachname, email, telefon,
    personen_anzahl, einzug_ab, beruf, arbeitgeber, einkommen_netto, schufa_vorhanden, kann_kaution_leisten,
    haustiere, raucher, derzeitiger_vermieter, mietverhaeltnis_seit, mitteilung, datenschutz_einwilligung, angaben_bestaetigt)
  values (l.mandant_id, l.objekt_id, 'selbstauskunft',
    left(nullif(btrim(coalesce(p_daten->>'anrede', '')), ''), 20),
    left(nullif(btrim(coalesce(p_daten->>'vorname', '')), ''), 200),
    left(v_nachname, 200), v_email,
    left(nullif(btrim(coalesce(p_daten->>'telefon', '')), ''), 60),
    nullif(p_daten->>'personen_anzahl', '')::smallint,
    nullif(p_daten->>'einzug_ab', '')::date,
    left(nullif(btrim(coalesce(p_daten->>'beruf', '')), ''), 200),
    left(nullif(btrim(coalesce(p_daten->>'arbeitgeber', '')), ''), 200),
    nullif(replace(p_daten->>'einkommen_netto', ',', '.'), '')::numeric,
    (p_daten->>'schufa_vorhanden')::boolean,
    (p_daten->>'kann_kaution_leisten')::boolean,
    left(nullif(btrim(coalesce(p_daten->>'haustiere', '')), ''), 200),
    (p_daten->>'raucher')::boolean,
    left(nullif(btrim(coalesce(p_daten->>'derzeitiger_vermieter', '')), ''), 200),
    left(nullif(btrim(coalesce(p_daten->>'mietverhaeltnis_seit', '')), ''), 60),
    left(nullif(btrim(coalesce(p_daten->>'mitteilung', '')), ''), 4000),
    true, coalesce((p_daten->>'angaben_bestaetigt')::boolean, false))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
exception when others then
  return jsonb_build_object('ok', false, 'grund', 'eingabe');
end $$;
revoke all on function public.selbstauskunft_einreichen(text, jsonb) from public;
grant execute on function public.selbstauskunft_einreichen(text, jsonb) to anon, authenticated;

-- --- Mietvertraege ----------------------------------------------------------
create table public.mietvertraege (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  objekt_id      uuid references public.objekte(id) on delete set null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  mietanfrage_id uuid references public.mietanfragen(id) on delete set null,
  -- Der unterschriebene Text lebt als Vertrag (art mietvertrag)
  vertrag_id     uuid references public.vertraege(id) on delete set null,
  bezeichnung    text not null check (length(trim(bezeichnung)) between 1 and 200),
  ordner         text,
  status         text not null default 'entwurf'
    check (status in ('entwurf', 'zur_unterschrift', 'unterzeichnet', 'beendet')),
  -- {typ, personen:[{anrede,name,strasse,plz,ort,email}]}
  vermieter      jsonb not null default '{}'::jsonb,
  mieter         jsonb not null default '{}'::jsonb,
  -- {strasse, plz, ort, lage, raeume, wohnflaeche, zustand, ausstattung}
  objekt         jsonb not null default '{}'::jsonb,
  mietbeginn     date,
  befristet_bis  date,
  grundmiete     numeric(10,2) not null default 0 check (grundmiete >= 0),
  bk_kalt        numeric(10,2) not null default 0 check (bk_kalt >= 0),
  bk_warm        numeric(10,2) not null default 0 check (bk_warm >= 0),
  stellplatz     numeric(10,2) not null default 0 check (stellplatz >= 0),
  gesamtmiete    numeric(10,2) generated always as (grundmiete + bk_kalt + bk_warm + stellplatz) stored,
  kaution        numeric(10,2) not null default 0 check (kaution >= 0),
  kuendigungsausschluss_monate smallint not null default 0 check (kuendigungsausschluss_monate between 0 and 48),
  neubau_klausel boolean not null default false,
  -- {kontoinhaber, iban, bic, institut}
  bank           jsonb not null default '{}'::jsonb,
  besondere_vereinbarungen text,
  erstellt_von   uuid references public.benutzer(id) on delete set null,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now()
);
create index mietvertraege_mandant on public.mietvertraege (mandant_id, erstellt_am desc);
create index mietvertraege_objekt on public.mietvertraege (objekt_id);
create trigger mietvertraege_geaendert before update on public.mietvertraege
  for each row execute function intern.setze_geaendert_am();
create trigger mietvertraege_verweise before insert or update on public.mietvertraege
  for each row execute function intern.vermietung_verweise_pruefen();
alter table public.mietvertraege enable row level security;
create policy mietvertraege_lesen on public.mietvertraege
  for select using (mandant_id = intern.aktueller_mandant());
create policy mietvertraege_schreiben on public.mietvertraege
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Reservierungen (Bestand) ---------------------------------------------------
create table public.reservierungen (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  objekt_id       uuid not null references public.objekte(id) on delete cascade,
  kontakt_id      uuid references public.kontakte(id) on delete set null,
  vertrag_id      uuid references public.vertraege(id) on delete set null,
  status          text not null default 'angefragt'
    check (status in ('angefragt', 'aktiv', 'abgelaufen', 'aufgehoben', 'abgeschlossen')),
  reserviert_bis  date,
  gebuehr         numeric(10,2) not null default 0 check (gebuehr >= 0),
  gebuehr_anrechenbar boolean not null default true,
  gebuehr_bezahlt_am date,
  notizen         text,
  aufgehoben_am   timestamptz,
  aufhebungsgrund text,
  erstellt_von    uuid references public.benutzer(id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now()
);
create index reservierungen_mandant on public.reservierungen (mandant_id, erstellt_am desc);
create index reservierungen_objekt on public.reservierungen (objekt_id) where status = 'aktiv';
create trigger reservierungen_geaendert before update on public.reservierungen
  for each row execute function intern.setze_geaendert_am();
create trigger reservierungen_verweise before insert or update on public.reservierungen
  for each row execute function intern.vermietung_verweise_pruefen();
alter table public.reservierungen enable row level security;
create policy reservierungen_lesen on public.reservierungen
  for select using (mandant_id = intern.aktueller_mandant());
create policy reservierungen_schreiben on public.reservierungen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Eine aktive Reservierung je Objekt; Objektstatus folgt der Reservierung.
create unique index reservierungen_eine_aktive on public.reservierungen (objekt_id) where status = 'aktiv';

create or replace function intern.reservierung_objektstatus()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'aktiv' and (tg_op = 'INSERT' or old.status is distinct from 'aktiv') then
    update public.objekte set status = 'reserviert' where id = new.objekt_id and status in ('aktiv', 'vorbereitung');
  elsif new.status in ('abgelaufen', 'aufgehoben') and old.status = 'aktiv' then
    update public.objekte set status = 'aktiv' where id = new.objekt_id and status = 'reserviert'
      and not exists (select 1 from public.reservierungen r where r.objekt_id = new.objekt_id and r.status = 'aktiv' and r.id <> new.id);
  end if;
  return new;
end $$;
create trigger reservierungen_objektstatus after insert or update of status on public.reservierungen
  for each row execute function intern.reservierung_objektstatus();

-- Abgelaufene Reservierungen im Tageslauf schliessen (Dienstrolle).
create or replace function public.reservierungen_ablaufen()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  with u as (
    update public.reservierungen set status = 'abgelaufen'
     where status = 'aktiv' and reserviert_bis is not null and reserviert_bis < current_date
    returning 1)
  select count(*) into n from u;
  return n;
end $$;
revoke all on function public.reservierungen_ablaufen() from public;
grant execute on function public.reservierungen_ablaufen() to service_role;

-- --- Antwortvorlagen (Mietanfragen) ------------------------------------------------
create table public.antwortvorlagen (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  schluessel   text not null,
  bezeichnung  text not null check (length(trim(bezeichnung)) between 1 and 120),
  betreff      text not null,
  text         text not null,
  mit_termin   boolean not null default false,
  reihenfolge  integer not null default 0,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  unique (mandant_id, schluessel)
);
create trigger antwortvorlagen_geaendert before update on public.antwortvorlagen
  for each row execute function intern.setze_geaendert_am();
alter table public.antwortvorlagen enable row level security;
create policy antwortvorlagen_lesen on public.antwortvorlagen
  for select using (mandant_id = intern.aktueller_mandant());
create policy antwortvorlagen_schreiben on public.antwortvorlagen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());
