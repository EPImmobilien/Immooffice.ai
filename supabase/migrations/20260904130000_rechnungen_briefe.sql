-- ===========================================================================
-- Rechnungen und Geschaeftsbriefe (docs/FUNKTIONSABGLEICH.md R1, Referenz-
-- Kacheln „Rechnungen" und „Geschaeftsbriefe"):
--   Absender (Firma oder persoenlich) mit Steuer- und Bankangaben und eigenem
--   Nummernkreis (Praefix, Jahr, Startnummer — gesperrt, sobald die erste
--   Rechnung gestellt ist); Kunden; Rechnungen mit Positionen, Netto/USt/Brutto
--   per Trigger, Festschreiben mit fortlaufender Nummer (GoBD: danach
--   unveraenderlich), Storno ueber eine Storno-Rechnung, bezahlt, Test-
--   Rechnungen; Briefe im Briefpapier.
-- ===========================================================================

-- --- Absender ---------------------------------------------------------------------
create table public.rechnungs_absender (
  id               uuid primary key default gen_random_uuid(),
  mandant_id       uuid not null references public.mandanten(id) on delete cascade,
  typ              text not null default 'firma' check (typ in ('firma', 'persoenlich')),
  benutzer_id      uuid references public.benutzer(id) on delete set null,
  name             text not null check (length(trim(name)) between 1 and 200),
  zusatz           text,
  strasse          text not null,
  hausnummer       text,
  plz              text not null,
  ort              text not null,
  land             text not null default 'Deutschland',
  email            text,
  telefon          text,
  web              text,
  steuernummer     text,
  ust_id           text check (ust_id is null or ust_id ~ '^[A-Z]{2}[A-Z0-9]{2,12}$'),
  kleinunternehmer boolean not null default false,
  bank_name        text,
  iban             text,
  bic              text,
  praefix          text not null default 'RE' check (praefix ~ '^[A-Za-z0-9]{1,8}$'),
  mit_jahr         boolean not null default true,
  naechste_nummer  integer not null default 1 check (naechste_nummer between 1 and 999999),
  zahlungsziel_tage integer not null default 14 check (zahlungsziel_tage between 0 and 120),
  standard_mwst    numeric(4,2) not null default 19 check (standard_mwst in (0, 7, 19)),
  einleitung       text not null default E'Sehr geehrte Damen und Herren,\n\nhiermit stellen wir Ihnen folgende Leistungen in Rechnung:',
  schluss          text,
  aktiv            boolean not null default true,
  sortierung       integer not null default 0,
  erstellt_am      timestamptz not null default now(),
  geaendert_am     timestamptz not null default now()
);
create index rechnungs_absender_mandant on public.rechnungs_absender (mandant_id, typ, sortierung);
create trigger rechnungs_absender_geaendert before update on public.rechnungs_absender
  for each row execute function intern.setze_geaendert_am();
alter table public.rechnungs_absender enable row level security;
create policy rechnungs_absender_lesen on public.rechnungs_absender
  for select using (mandant_id = intern.aktueller_mandant());
-- Firmen-Absender verwaltet die Verwaltung; einen persoenlichen Absender pflegt jeder selbst.
create policy rechnungs_absender_schreiben on public.rechnungs_absender
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (intern.ist_verwaltung() or (typ = 'persoenlich' and benutzer_id = auth.uid())))
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (intern.ist_verwaltung() or (typ = 'persoenlich' and benutzer_id = auth.uid())));

-- --- Kunden ------------------------------------------------------------------------
create table public.rechnungskunden (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  kontakt_id  uuid references public.kontakte(id) on delete set null,
  anrede      text,
  name        text not null check (length(trim(name)) between 1 and 200),
  zusatz      text,
  strasse     text,
  plz         text,
  ort         text,
  land        text not null default 'Deutschland',
  email       text,
  ust_id      text,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);
create index rechnungskunden_mandant on public.rechnungskunden (mandant_id, name);
create trigger rechnungskunden_geaendert before update on public.rechnungskunden
  for each row execute function intern.setze_geaendert_am();
alter table public.rechnungskunden enable row level security;
create policy rechnungskunden_lesen on public.rechnungskunden
  for select using (mandant_id = intern.aktueller_mandant());
create policy rechnungskunden_schreiben on public.rechnungskunden
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Rechnungen ----------------------------------------------------------------------
create table public.rechnungen (
  id               uuid primary key default gen_random_uuid(),
  mandant_id       uuid not null references public.mandanten(id) on delete cascade,
  absender_id      uuid references public.rechnungs_absender(id) on delete restrict,
  kunde_id         uuid references public.rechnungskunden(id) on delete set null,
  kontakt_id       uuid references public.kontakte(id) on delete set null,
  objekt_id        uuid references public.objekte(id) on delete set null,
  vertrag_id       uuid references public.vertraege(id) on delete set null,
  typ              text not null default 'rechnung' check (typ in ('rechnung', 'storno')),
  storno_von_id    uuid references public.rechnungen(id) on delete set null,
  storniert_durch_id uuid references public.rechnungen(id) on delete set null,
  rechnungsnummer  text,
  status           text not null default 'entwurf' check (status in ('entwurf', 'gestellt', 'bezahlt', 'storniert')),
  ist_test         boolean not null default false,
  -- Empfaenger als Schnappschuss: eine gestellte Rechnung zeigt die Anschrift von damals
  empfaenger_anrede  text,
  empfaenger_name    text not null default '',
  empfaenger_zusatz  text,
  empfaenger_strasse text,
  empfaenger_plz     text,
  empfaenger_ort     text,
  empfaenger_land    text not null default 'Deutschland',
  empfaenger_email   text,
  empfaenger_ust_id  text,
  ausstellungsdatum  date not null default current_date,
  leistung_von       date,
  leistung_bis       date,
  zahlungsziel_tage  integer not null default 14 check (zahlungsziel_tage between 0 and 120),
  faellig_am         date,
  einleitung         text,
  schluss            text,
  netto              numeric(12,2) not null default 0,
  mwst               numeric(12,2) not null default 0,
  brutto             numeric(12,2) not null default 0,
  bezahlt_am         date,
  bezahlt_betrag     numeric(12,2),
  gestellt_am        timestamptz,
  gestellt_von       uuid references public.benutzer(id) on delete set null,
  storno_grund       text,
  -- Absender-Schnappschuss beim Festschreiben (Anschrift, Steuer, Bank)
  absender_snapshot  jsonb,
  pdf_pfad           text,
  notiz              text,
  erstellt_von       uuid references public.benutzer(id) on delete set null,
  erstellt_am        timestamptz not null default now(),
  geaendert_am       timestamptz not null default now(),
  constraint rechnung_nummer_je_mandant unique (mandant_id, rechnungsnummer)
);
create index rechnungen_mandant on public.rechnungen (mandant_id, status, ausstellungsdatum desc);
create index rechnungen_kontakt on public.rechnungen (kontakt_id);
create index rechnungen_objekt on public.rechnungen (objekt_id);
create trigger rechnungen_geaendert before update on public.rechnungen
  for each row execute function intern.setze_geaendert_am();
alter table public.rechnungen enable row level security;
create policy rechnungen_lesen on public.rechnungen
  for select using (mandant_id = intern.aktueller_mandant());
create policy rechnungen_schreiben on public.rechnungen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.rechnungspositionen (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  rechnung_id     uuid not null references public.rechnungen(id) on delete cascade,
  position        integer not null default 1,
  beschreibung    text not null check (length(trim(beschreibung)) between 1 and 1000),
  menge           numeric(10,3) not null default 1 check (menge <> 0),
  einheit         text,
  einzelpreis_netto numeric(12,2) not null default 0,
  mwst_satz       numeric(4,2) not null default 19 check (mwst_satz in (0, 7, 19)),
  netto           numeric(12,2) generated always as (round(menge * einzelpreis_netto, 2)) stored,
  erstellt_am     timestamptz not null default now()
);
create index rechnungspositionen_rechnung on public.rechnungspositionen (rechnung_id, position);
alter table public.rechnungspositionen enable row level security;
create policy rechnungspositionen_lesen on public.rechnungspositionen
  for select using (mandant_id = intern.aktueller_mandant());
create policy rechnungspositionen_schreiben on public.rechnungspositionen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Verweise mandantenrein
create or replace function intern.rechnung_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'rechnungspositionen' then
    if not exists (select 1 from public.rechnungen r where r.id = new.rechnung_id and r.mandant_id = new.mandant_id) then
      raise exception 'Die Rechnung gehoert nicht zu diesem Mandanten.';
    end if;
    if exists (select 1 from public.rechnungen r where r.id = new.rechnung_id and r.status <> 'entwurf') then
      raise exception 'Eine gestellte Rechnung ist unveraenderlich (GoBD).';
    end if;
    return new;
  end if;
  if tg_table_name = 'rechnungskunden' then
    if new.kontakt_id is not null and not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.mandant_id = new.mandant_id) then
      raise exception 'Der Kontakt gehoert nicht zu diesem Mandanten.';
    end if;
    return new;
  end if;
  if tg_table_name = 'rechnungs_absender' then
    if new.benutzer_id is not null and not exists (select 1 from public.benutzer b where b.id = new.benutzer_id and b.mandant_id = new.mandant_id) then
      raise exception 'Der Benutzer gehoert nicht zu diesem Mandanten.';
    end if;
    -- Startnummer nur aenderbar, solange keine Rechnung gestellt ist
    if tg_op = 'UPDATE' and (new.naechste_nummer <> old.naechste_nummer or new.praefix <> old.praefix or new.mit_jahr <> old.mit_jahr)
       and coalesce(current_setting('intern.nummer_vergabe', true), '') <> '1'
       and exists (select 1 from public.rechnungen r where r.absender_id = new.id and r.status <> 'entwurf') then
      raise exception 'Nummernkreis ist gesperrt, sobald eine Rechnung gestellt wurde (GoBD).';
    end if;
    return new;
  end if;
  -- rechnungen
  if new.absender_id is not null and not exists (select 1 from public.rechnungs_absender a where a.id = new.absender_id and a.mandant_id = new.mandant_id) then
    raise exception 'Der Absender gehoert nicht zu diesem Mandanten.';
  end if;
  if new.kunde_id is not null and not exists (select 1 from public.rechnungskunden k where k.id = new.kunde_id and k.mandant_id = new.mandant_id) then
    raise exception 'Der Kunde gehoert nicht zu diesem Mandanten.';
  end if;
  if new.kontakt_id is not null and not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.mandant_id = new.mandant_id) then
    raise exception 'Der Kontakt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.objekt_id is not null and not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.vertrag_id is not null and not exists (select 1 from public.vertraege v where v.id = new.vertrag_id and v.mandant_id = new.mandant_id) then
    raise exception 'Der Vertrag gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger rechnungspositionen_verweise before insert or update on public.rechnungspositionen
  for each row execute function intern.rechnung_verweise_pruefen();
create trigger rechnungskunden_verweise before insert or update on public.rechnungskunden
  for each row execute function intern.rechnung_verweise_pruefen();
create trigger rechnungs_absender_verweise before insert or update on public.rechnungs_absender
  for each row execute function intern.rechnung_verweise_pruefen();
create trigger rechnungen_verweise before insert or update on public.rechnungen
  for each row execute function intern.rechnung_verweise_pruefen();

-- Gestellte Rechnungen sind unveraenderlich: nur Bezahlt-Felder, Storno-Verweis, PDF-Pfad und Notiz duerfen sich aendern
create or replace function intern.rechnung_festschreibung()
returns trigger language plpgsql as $$
begin
  if old.status = 'entwurf' then return new; end if;
  if new.rechnungsnummer is distinct from old.rechnungsnummer or new.typ <> old.typ or new.absender_id is distinct from old.absender_id
     or new.empfaenger_name <> old.empfaenger_name or new.empfaenger_anrede is distinct from old.empfaenger_anrede or new.empfaenger_zusatz is distinct from old.empfaenger_zusatz
     or new.empfaenger_strasse is distinct from old.empfaenger_strasse or new.empfaenger_plz is distinct from old.empfaenger_plz or new.empfaenger_ort is distinct from old.empfaenger_ort
     or new.empfaenger_land <> old.empfaenger_land or new.ausstellungsdatum <> old.ausstellungsdatum or new.leistung_von is distinct from old.leistung_von or new.leistung_bis is distinct from old.leistung_bis
     or new.zahlungsziel_tage <> old.zahlungsziel_tage or new.einleitung is distinct from old.einleitung or new.schluss is distinct from old.schluss
     or new.netto <> old.netto or new.mwst <> old.mwst or new.brutto <> old.brutto or new.absender_snapshot is distinct from old.absender_snapshot
     or new.gestellt_am is distinct from old.gestellt_am or new.ist_test <> old.ist_test then
    raise exception 'Eine gestellte Rechnung ist unveraenderlich (GoBD). Bitte stornieren und neu stellen.';
  end if;
  if old.status = 'storniert' and new.status <> 'storniert' then
    raise exception 'Eine stornierte Rechnung bleibt storniert.';
  end if;
  if new.status = 'entwurf' then
    raise exception 'Eine gestellte Rechnung wird nicht wieder zum Entwurf.';
  end if;
  return new;
end $$;
create trigger rechnungen_festschreibung before update on public.rechnungen
  for each row execute function intern.rechnung_festschreibung();

create or replace function intern.rechnung_loeschschutz()
returns trigger language plpgsql as $$
begin
  if old.status <> 'entwurf' and not old.ist_test then
    raise exception 'Gestellte Rechnungen werden nicht geloescht (GoBD) — bitte stornieren.';
  end if;
  return old;
end $$;
create trigger rechnungen_loeschschutz before delete on public.rechnungen
  for each row execute function intern.rechnung_loeschschutz();

-- Summen aus den Positionen
create or replace function intern.rechnung_summen()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := coalesce(new.rechnung_id, old.rechnung_id); v_netto numeric; v_mwst numeric;
begin
  select coalesce(sum(netto), 0), coalesce(sum(round(netto * mwst_satz / 100, 2)), 0) into v_netto, v_mwst from public.rechnungspositionen where rechnung_id = v_id;
  update public.rechnungen set netto = v_netto, mwst = v_mwst, brutto = v_netto + v_mwst where id = v_id and status = 'entwurf';
  return null;
end $$;
create trigger rechnungspositionen_summen after insert or update or delete on public.rechnungspositionen
  for each row execute function intern.rechnung_summen();

-- --- Festschreiben mit fortlaufender Nummer -------------------------------------------
create or replace function public.rechnung_stellen(p_rechnung uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m uuid := intern.aktueller_mandant(); r record; a record; v_nr text; v_n integer;
begin
  if v_m is null or not intern.darf_schreiben() then raise exception 'Nicht erlaubt.'; end if;
  select * into r from public.rechnungen where id = p_rechnung and mandant_id = v_m for update;
  if r.id is null then raise exception 'Unbekannte Rechnung.'; end if;
  if r.status <> 'entwurf' then raise exception 'Die Rechnung ist bereits gestellt.'; end if;
  if r.absender_id is null then raise exception 'Bitte einen Absender waehlen.'; end if;
  if coalesce(trim(r.empfaenger_name), '') = '' then raise exception 'Bitte einen Empfaenger angeben.'; end if;
  if not exists (select 1 from public.rechnungspositionen where rechnung_id = r.id) then raise exception 'Die Rechnung hat keine Positionen.'; end if;
  select * into a from public.rechnungs_absender where id = r.absender_id for update;
  if r.ist_test then
    v_nr := 'TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  else
    v_n := a.naechste_nummer;
    v_nr := a.praefix || '-' || case when a.mit_jahr then to_char(r.ausstellungsdatum, 'YYYY') || '-' else '' end || lpad(v_n::text, 3, '0');
    perform set_config('intern.nummer_vergabe', '1', true);
    update public.rechnungs_absender set naechste_nummer = v_n + 1 where id = a.id;
    perform set_config('intern.nummer_vergabe', '', true);
  end if;
  update public.rechnungen
     set rechnungsnummer = v_nr, status = 'gestellt', gestellt_am = now(), gestellt_von = auth.uid(),
         faellig_am = r.ausstellungsdatum + r.zahlungsziel_tage,
         einleitung = coalesce(r.einleitung, a.einleitung), schluss = coalesce(r.schluss, a.schluss),
         absender_snapshot = jsonb_build_object('name', a.name, 'zusatz', a.zusatz, 'strasse', a.strasse, 'hausnummer', a.hausnummer, 'plz', a.plz, 'ort', a.ort, 'land', a.land,
           'email', a.email, 'telefon', a.telefon, 'web', a.web, 'steuernummer', a.steuernummer, 'ust_id', a.ust_id, 'kleinunternehmer', a.kleinunternehmer,
           'bank_name', a.bank_name, 'iban', a.iban, 'bic', a.bic)
   where id = r.id;
  return v_nr;
end $$;
revoke all on function public.rechnung_stellen(uuid) from public;
grant execute on function public.rechnung_stellen(uuid) to authenticated, service_role;

-- --- Storno: Gegenrechnung mit negativen Positionen ---------------------------------------
create or replace function public.rechnung_stornieren(p_rechnung uuid, p_grund text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m uuid := intern.aktueller_mandant(); r record; v_neu uuid; v_nr text;
begin
  if v_m is null or not intern.darf_schreiben() then raise exception 'Nicht erlaubt.'; end if;
  select * into r from public.rechnungen where id = p_rechnung and mandant_id = v_m for update;
  if r.id is null then raise exception 'Unbekannte Rechnung.'; end if;
  if r.status not in ('gestellt', 'bezahlt') then raise exception 'Nur gestellte oder bezahlte Rechnungen lassen sich stornieren.'; end if;
  if r.typ = 'storno' then raise exception 'Eine Storno-Rechnung wird nicht storniert.'; end if;
  insert into public.rechnungen (mandant_id, absender_id, kunde_id, kontakt_id, objekt_id, vertrag_id, typ, storno_von_id, ist_test,
      empfaenger_anrede, empfaenger_name, empfaenger_zusatz, empfaenger_strasse, empfaenger_plz, empfaenger_ort, empfaenger_land, empfaenger_email, empfaenger_ust_id,
      ausstellungsdatum, leistung_von, leistung_bis, zahlungsziel_tage, einleitung, schluss, storno_grund, erstellt_von)
    values (v_m, r.absender_id, r.kunde_id, r.kontakt_id, r.objekt_id, r.vertrag_id, 'storno', r.id, r.ist_test,
      r.empfaenger_anrede, r.empfaenger_name, r.empfaenger_zusatz, r.empfaenger_strasse, r.empfaenger_plz, r.empfaenger_ort, r.empfaenger_land, r.empfaenger_email, r.empfaenger_ust_id,
      current_date, r.leistung_von, r.leistung_bis, 0, 'Storno zur Rechnung ' || coalesce(r.rechnungsnummer, '') || coalesce(': ' || p_grund, ''), 'Der Betrag wird nicht faellig bzw. erstattet.', p_grund, auth.uid())
    returning id into v_neu;
  insert into public.rechnungspositionen (mandant_id, rechnung_id, position, beschreibung, menge, einheit, einzelpreis_netto, mwst_satz)
    select v_m, v_neu, position, 'Storno: ' || beschreibung, -menge, einheit, einzelpreis_netto, mwst_satz from public.rechnungspositionen where rechnung_id = r.id order by position;
  v_nr := public.rechnung_stellen(v_neu);
  update public.rechnungen set status = 'storniert', storniert_durch_id = v_neu, storno_grund = p_grund where id = r.id;
  return v_neu;
end $$;
revoke all on function public.rechnung_stornieren(uuid, text) from public;
grant execute on function public.rechnung_stornieren(uuid, text) to authenticated, service_role;

create or replace function public.rechnung_bezahlt(p_rechnung uuid, p_am date default current_date, p_betrag numeric default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m uuid := intern.aktueller_mandant(); r record;
begin
  if v_m is null or not intern.darf_schreiben() then raise exception 'Nicht erlaubt.'; end if;
  select * into r from public.rechnungen where id = p_rechnung and mandant_id = v_m for update;
  if r.id is null then raise exception 'Unbekannte Rechnung.'; end if;
  if r.status <> 'gestellt' then raise exception 'Nur gestellte Rechnungen lassen sich als bezahlt vermerken.'; end if;
  update public.rechnungen set status = 'bezahlt', bezahlt_am = p_am, bezahlt_betrag = coalesce(p_betrag, r.brutto) where id = r.id;
end $$;
revoke all on function public.rechnung_bezahlt(uuid, date, numeric) from public;
grant execute on function public.rechnung_bezahlt(uuid, date, numeric) to authenticated, service_role;

create or replace function public.rechnung_startnummer_info(p_absender uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'gestellt', (select count(*) from public.rechnungen r where r.absender_id = p_absender and r.status <> 'entwurf' and r.mandant_id = intern.aktueller_mandant()),
    'editierbar', not exists (select 1 from public.rechnungen r where r.absender_id = p_absender and r.status <> 'entwurf' and r.mandant_id = intern.aktueller_mandant()),
    'naechste', (select naechste_nummer from public.rechnungs_absender a where a.id = p_absender and a.mandant_id = intern.aktueller_mandant()))
$$;
revoke all on function public.rechnung_startnummer_info(uuid) from public;
grant execute on function public.rechnung_startnummer_info(uuid) to authenticated, service_role;

-- --- Geschaeftsbriefe ------------------------------------------------------------------
create table public.briefe (
  id                 uuid primary key default gen_random_uuid(),
  mandant_id         uuid not null references public.mandanten(id) on delete cascade,
  absender_id        uuid references public.rechnungs_absender(id) on delete set null,
  kontakt_id         uuid references public.kontakte(id) on delete set null,
  objekt_id          uuid references public.objekte(id) on delete set null,
  vorlage            text,
  empfaenger_name    text not null check (length(trim(empfaenger_name)) between 1 and 200),
  empfaenger_zusatz  text,
  empfaenger_strasse text,
  empfaenger_plz     text,
  empfaenger_ort     text,
  empfaenger_email   text,
  datum              date not null default current_date,
  betreff            text not null check (length(trim(betreff)) between 1 and 300),
  anrede             text not null default 'Sehr geehrte Damen und Herren,',
  text               text not null default '',
  grussformel        text not null default 'Mit freundlichen Grüßen',
  unterzeichner      text,
  unterzeichner_funktion text,
  status             text not null default 'entwurf' check (status in ('entwurf', 'erstellt', 'versendet')),
  versendet_am       timestamptz,
  pdf_pfad           text,
  erstellt_von       uuid references public.benutzer(id) on delete set null,
  erstellt_am        timestamptz not null default now(),
  geaendert_am       timestamptz not null default now()
);
create index briefe_mandant on public.briefe (mandant_id, erstellt_am desc);
create index briefe_kontakt on public.briefe (kontakt_id);
create index briefe_objekt on public.briefe (objekt_id);
create trigger briefe_geaendert before update on public.briefe
  for each row execute function intern.setze_geaendert_am();
alter table public.briefe enable row level security;
create policy briefe_lesen on public.briefe
  for select using (mandant_id = intern.aktueller_mandant());
create policy briefe_schreiben on public.briefe
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create or replace function intern.brief_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if new.absender_id is not null and not exists (select 1 from public.rechnungs_absender a where a.id = new.absender_id and a.mandant_id = new.mandant_id) then
    raise exception 'Der Absender gehoert nicht zu diesem Mandanten.';
  end if;
  if new.kontakt_id is not null and not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.mandant_id = new.mandant_id) then
    raise exception 'Der Kontakt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.objekt_id is not null and not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger briefe_verweise before insert or update on public.briefe
  for each row execute function intern.brief_verweise_pruefen();
