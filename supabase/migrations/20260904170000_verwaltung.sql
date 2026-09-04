-- ===========================================================================
-- Verwaltung (docs/FUNKTIONSABGLEICH.md F1/N1, Referenz-Kachel „Admin" und
-- „Arbeitszeit"): Mitarbeiterprofil (Titel, Foto, Signaturbild, Eintritt,
-- Urlaubskontingent), Arbeitszeit (Wochenmodell, Stempeluhr, Tage), Urlaub
-- (Antraege, Hinweise), Firmenkennzahlen, Finanzierungsannahmen, Bewerber-
-- Einstellungstest (laut Masterprompt ersatzlos — auf Weisung 1:1, streichbar),
-- Selbstkuendigung des Mandanten, globale Suche, Aktivitaetsprotokoll.
-- ===========================================================================

-- --- Mitarbeiterprofil ---------------------------------------------------------------
alter table public.benutzer
  add column titel            text,
  add column signatur_pfad    text,
  add column eintritt         date,
  add column urlaubstage_jahr numeric(4,1) not null default 30 check (urlaubstage_jahr between 0 and 60),
  add column urlaub_uebertrag numeric(4,1) not null default 0 check (urlaub_uebertrag between 0 and 60),
  -- Staffel je Jahr: {"2026": 28, "2027": 30}
  add column urlaub_staffel   jsonb not null default '{}'::jsonb,
  add column bundesland       text check (bundesland is null or bundesland ~ '^[A-Z]{2}$');

-- Urlaubs-/Arbeitszeitfelder darf nur die Verwaltung aendern (Selbstaenderung bleibt fuer Profilfelder moeglich)
create or replace function intern.benutzer_kontingent_schutz()
returns trigger language plpgsql as $$
begin
  if (new.eintritt is distinct from old.eintritt or new.urlaubstage_jahr is distinct from old.urlaubstage_jahr
      or new.urlaub_uebertrag is distinct from old.urlaub_uebertrag or new.urlaub_staffel is distinct from old.urlaub_staffel)
     and not intern.ist_verwaltung() and auth.role() <> 'service_role' then
    raise exception 'Urlaubskontingent und Eintritt aendert nur die Verwaltung.';
  end if;
  return new;
end $$;
create trigger benutzer_kontingent before update on public.benutzer
  for each row execute function intern.benutzer_kontingent_schutz();

-- --- Arbeitszeit ---------------------------------------------------------------------
create table public.arbeitszeit_modelle (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  benutzer_id  uuid not null references public.benutzer(id) on delete cascade,
  gueltig_ab   date not null,
  stunden_mo   numeric(4,2) not null default 8 check (stunden_mo between 0 and 24),
  stunden_di   numeric(4,2) not null default 8 check (stunden_di between 0 and 24),
  stunden_mi   numeric(4,2) not null default 8 check (stunden_mi between 0 and 24),
  stunden_do   numeric(4,2) not null default 8 check (stunden_do between 0 and 24),
  stunden_fr   numeric(4,2) not null default 8 check (stunden_fr between 0 and 24),
  stunden_sa   numeric(4,2) not null default 0 check (stunden_sa between 0 and 24),
  stunden_so   numeric(4,2) not null default 0 check (stunden_so between 0 and 24),
  notiz        text,
  erstellt_am  timestamptz not null default now(),
  unique (benutzer_id, gueltig_ab)
);
alter table public.arbeitszeit_modelle enable row level security;
create policy az_modelle_lesen on public.arbeitszeit_modelle
  for select using (mandant_id = intern.aktueller_mandant() and (benutzer_id = auth.uid() or intern.ist_verwaltung()));
create policy az_modelle_schreiben on public.arbeitszeit_modelle
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

create table public.arbeitszeit_stempel (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  benutzer_id uuid not null references public.benutzer(id) on delete cascade,
  datum       date not null,
  richtung    text not null check (richtung in ('kommen', 'gehen')),
  zeitpunkt   timestamptz not null default now(),
  quelle      text not null default 'uhr' check (quelle in ('uhr', 'nachtrag', 'verwaltung')),
  erstellt_am timestamptz not null default now()
);
create index az_stempel_idx on public.arbeitszeit_stempel (benutzer_id, datum);
alter table public.arbeitszeit_stempel enable row level security;
create policy az_stempel_lesen on public.arbeitszeit_stempel
  for select using (mandant_id = intern.aktueller_mandant() and (benutzer_id = auth.uid() or intern.ist_verwaltung()));
create policy az_stempel_anlegen on public.arbeitszeit_stempel
  for insert with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (benutzer_id = auth.uid() or intern.ist_verwaltung()));
create policy az_stempel_loeschen on public.arbeitszeit_stempel
  for delete using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (benutzer_id = auth.uid() and datum >= current_date - 1 or intern.ist_verwaltung()));

create table public.arbeitszeit_tage (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  benutzer_id uuid not null references public.benutzer(id) on delete cascade,
  datum       date not null,
  art         text not null default 'arbeit' check (art in ('arbeit', 'urlaub', 'krank', 'feiertag', 'frei', 'fortbildung')),
  stunden     numeric(4,2) check (stunden is null or stunden between 0 and 24),
  von         time,
  bis         time,
  bemerkung   text,
  erfasst_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  unique (benutzer_id, datum)
);
alter table public.arbeitszeit_tage enable row level security;
create policy az_tage_lesen on public.arbeitszeit_tage
  for select using (mandant_id = intern.aktueller_mandant() and (benutzer_id = auth.uid() or intern.ist_verwaltung()));
create policy az_tage_schreiben on public.arbeitszeit_tage
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (benutzer_id = auth.uid() or intern.ist_verwaltung()))
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (benutzer_id = auth.uid() or intern.ist_verwaltung()));

/** Stempeln: naechste Richtung automatisch (kommen/gehen), doppelte Richtung wird abgewiesen. */
create or replace function public.stempeln(p_richtung text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_mandant uuid := intern.aktueller_mandant(); v_letzte text; v_richtung text; v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if v_mandant is null or not intern.darf_schreiben() then raise exception 'Kein Schreibrecht.'; end if;
  select richtung into v_letzte from public.arbeitszeit_stempel where benutzer_id = auth.uid() and datum = v_heute order by zeitpunkt desc limit 1;
  v_richtung := coalesce(p_richtung, case when v_letzte = 'kommen' then 'gehen' else 'kommen' end);
  if v_richtung not in ('kommen', 'gehen') then raise exception 'Unbekannte Richtung.'; end if;
  if v_letzte = v_richtung then return jsonb_build_object('ok', false, 'grund', 'doppelt', 'richtung', v_letzte); end if;
  insert into public.arbeitszeit_stempel (mandant_id, benutzer_id, datum, richtung) values (v_mandant, auth.uid(), v_heute, v_richtung);
  return jsonb_build_object('ok', true, 'richtung', v_richtung, 'zeitpunkt', now());
end $$;
grant execute on function public.stempeln(text) to authenticated;

-- --- Urlaub ---------------------------------------------------------------------------
create table public.urlaubsantraege (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  benutzer_id   uuid not null references public.benutzer(id) on delete cascade,
  von           date not null,
  bis           date not null,
  arbeitstage   numeric(4,1) not null check (arbeitstage >= 0),
  status        text not null default 'beantragt' check (status in ('beantragt', 'genehmigt', 'abgelehnt', 'storniert')),
  bemerkung     text,
  antwort       text,
  entschieden_von uuid references public.benutzer(id) on delete set null,
  entschieden_am  timestamptz,
  termin_id     uuid references public.termine(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  constraint urlaub_zeitraum check (bis >= von)
);
create index urlaubsantraege_idx on public.urlaubsantraege (mandant_id, benutzer_id, von);
create trigger urlaubsantraege_geaendert before update on public.urlaubsantraege
  for each row execute function intern.setze_geaendert_am();
alter table public.urlaubsantraege enable row level security;
-- Alle im Unternehmen sehen genehmigte Abwesenheiten (Planung); eigene und Verwaltung sehen alles
create policy urlaub_lesen on public.urlaubsantraege
  for select using (mandant_id = intern.aktueller_mandant() and (benutzer_id = auth.uid() or intern.ist_verwaltung() or status = 'genehmigt'));
create policy urlaub_anlegen on public.urlaubsantraege
  for insert with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (benutzer_id = auth.uid() or intern.ist_verwaltung()));
create policy urlaub_aendern on public.urlaubsantraege
  for update using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and (benutzer_id = auth.uid() or intern.ist_verwaltung()))
  with check (mandant_id = intern.aktueller_mandant());

-- Entscheiden darf nur die Verwaltung; der Antragsteller darf nur stornieren
create or replace function intern.urlaub_aenderung_pruefen()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.status is distinct from old.status then
    if new.status = 'storniert' then
      if old.benutzer_id <> auth.uid() and not intern.ist_verwaltung() then raise exception 'Nur der Antragsteller oder die Verwaltung storniert.'; end if;
    elsif not intern.ist_verwaltung() then
      raise exception 'Urlaub entscheidet die Verwaltung.';
    else
      new.entschieden_von := auth.uid(); new.entschieden_am := now();
    end if;
  end if;
  if old.status <> 'beantragt' and (new.von <> old.von or new.bis <> old.bis or new.arbeitstage <> old.arbeitstage) and not intern.ist_verwaltung() then
    raise exception 'Ein entschiedener Antrag laesst sich nicht mehr aendern.';
  end if;
  return new;
end $$;
create trigger urlaubsantraege_pruefen before update on public.urlaubsantraege
  for each row execute function intern.urlaub_aenderung_pruefen();

create table public.urlaub_hinweise (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  benutzer_id uuid not null references public.benutzer(id) on delete cascade,
  jahr        integer not null,
  art         text not null default 'resturlaub' check (art in ('resturlaub', 'verfall')),
  resttage    numeric(4,1) not null default 0,
  frist       date,
  gesendet_von uuid references public.benutzer(id) on delete set null,
  gesendet_am timestamptz not null default now(),
  aufgabe_id  uuid references public.aufgaben(id) on delete set null
);
alter table public.urlaub_hinweise enable row level security;
create policy urlaub_hinweise_lesen on public.urlaub_hinweise
  for select using (mandant_id = intern.aktueller_mandant() and (benutzer_id = auth.uid() or intern.ist_verwaltung()));
create policy urlaub_hinweise_schreiben on public.urlaub_hinweise
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

-- --- Firmenkennzahlen, Finanzierungsannahmen -----------------------------------------------
create table public.firma_kennzahlen (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  jahr          integer not null check (jahr between 2000 and 2100),
  objekte_vermittelt integer check (objekte_vermittelt is null or objekte_vermittelt >= 0),
  erzielungsquote numeric(5,2) check (erzielungsquote is null or erzielungsquote between 0 and 200),
  vermarktungsdauer_schnitt integer check (vermarktungsdauer_schnitt is null or vermarktungsdauer_schnitt >= 0),
  google_anzahl integer check (google_anzahl is null or google_anzahl >= 0),
  google_schnitt numeric(3,2) check (google_schnitt is null or google_schnitt between 0 and 5),
  fakten        text[] not null default '{}',
  aktiv         boolean not null default true,
  geaendert_am  timestamptz not null default now(),
  unique (mandant_id, jahr)
);
create trigger firma_kennzahlen_geaendert before update on public.firma_kennzahlen
  for each row execute function intern.setze_geaendert_am();
alter table public.firma_kennzahlen enable row level security;
create policy firma_kennzahlen_lesen on public.firma_kennzahlen
  for select using (mandant_id = intern.aktueller_mandant());
create policy firma_kennzahlen_schreiben on public.firma_kennzahlen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

create table public.finanzierungs_annahmen (
  mandant_id    uuid primary key references public.mandanten(id) on delete cascade,
  zinssatz      numeric(5,2) not null default 3.8 check (zinssatz between 0 and 25),
  tilgung       numeric(5,2) not null default 2 check (tilgung between 0 and 20),
  eigenkapital_prozent numeric(5,2) not null default 20 check (eigenkapital_prozent between 0 and 100),
  notar_prozent numeric(4,2) not null default 2 check (notar_prozent between 0 and 10),
  grunderwerbsteuer_prozent numeric(4,2) not null default 6 check (grunderwerbsteuer_prozent between 0 and 10),
  hinweis       text,
  geaendert_am  timestamptz not null default now()
);
create trigger finanzierungs_annahmen_geaendert before update on public.finanzierungs_annahmen
  for each row execute function intern.setze_geaendert_am();
alter table public.finanzierungs_annahmen enable row level security;
create policy finanzierung_lesen on public.finanzierungs_annahmen
  for select using (mandant_id = intern.aktueller_mandant());
create policy finanzierung_schreiben on public.finanzierungs_annahmen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

-- --- Bewerber (Masterprompt: entfaellt; auf Weisung 1:1 — streichbar) -----------------------
create table public.bewerbungen (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  vorname       text not null,
  nachname      text not null,
  email         text not null check (position('@' in email) > 1),
  position      text,
  token_hash    text not null unique,
  status        text not null default 'offen' check (status in ('offen', 'gestartet', 'abgeschlossen')),
  gestartet_am  timestamptz,
  abgeschlossen_am timestamptz,
  antworten     jsonb,
  punkte        integer,
  max_punkte    integer,
  empfehlung    text check (empfehlung is null or empfehlung in ('sehr_gut', 'gespraech', 'kein_match')),
  freitext      text,
  chef_note     numeric(2,1) check (chef_note is null or chef_note between 1 and 6),
  chef_kommentar text,
  gueltig_bis   timestamptz not null default (now() + interval '30 days'),
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now()
);
alter table public.bewerbungen enable row level security;
create policy bewerber_lesen on public.bewerbungen
  for select using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());
create policy bewerber_schreiben on public.bewerbungen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

/** Test oeffnen (anon, Token): Kandidat, Unternehmen, Status. */
create or replace function public.bewerbung_oeffnen(p_token text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare b public.bewerbungen;
begin
  if p_token is null or p_token !~ '^[a-z0-9]{16,64}$' then return jsonb_build_object('zustand', 'unbekannt'); end if;
  select * into b from public.bewerbungen where token_hash = intern.portal_token_hash(p_token) and gueltig_bis > now();
  if not found then return jsonb_build_object('zustand', 'unbekannt'); end if;
  if b.status = 'offen' then update public.bewerbungen set status = 'gestartet', gestartet_am = now() where id = b.id; end if;
  return jsonb_build_object('zustand', case when b.status = 'abgeschlossen' then 'fertig' else 'ok' end,
    'vorname', b.vorname, 'nachname', b.nachname, 'position', b.position,
    'unternehmen', (select name from public.mandanten where id = b.mandant_id));
end $$;
grant execute on function public.bewerbung_oeffnen(text) to anon, authenticated;

/** Test abgeben (anon, Token): Antworten und Auswertung ablegen — nur einmal. */
create or replace function public.bewerbung_abgeben(p_token text, p_antworten jsonb, p_punkte integer, p_max integer, p_empfehlung text, p_freitext text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare b public.bewerbungen;
begin
  select * into b from public.bewerbungen where token_hash = intern.portal_token_hash(coalesce(p_token, '')) and gueltig_bis > now();
  if not found then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;
  if b.status = 'abgeschlossen' then return jsonb_build_object('ok', false, 'grund', 'fertig'); end if;
  update public.bewerbungen
     set status = 'abgeschlossen', abgeschlossen_am = now(), antworten = coalesce(p_antworten, '{}'::jsonb),
         punkte = p_punkte, max_punkte = p_max, empfehlung = p_empfehlung, freitext = left(p_freitext, 4000)
   where id = b.id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.bewerbung_abgeben(text, jsonb, integer, integer, text, text) to anon, authenticated;

-- --- Selbstkuendigung des Mandanten -------------------------------------------------------
alter table public.mandanten
  add column gekuendigt_am     timestamptz,
  add column kuendigungsgrund  text;

/** Inhaber kuendigt: Loeschung in 30 Tagen, Abo endet zum Laufzeitende (Stripe ueber Rueckruf). */
create or replace function public.mandant_kuendigen(p_grund text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_mandant uuid := intern.aktueller_mandant(); v_am timestamptz := now() + interval '30 days';
begin
  if v_mandant is null or intern.aktuelle_rolle() <> 'inhaber' then raise exception 'Nur der Unternehmensinhaber kann kuendigen.'; end if;
  update public.mandanten set gekuendigt_am = now(), kuendigungsgrund = left(p_grund, 1000), loeschung_geplant_am = v_am where id = v_mandant;
  perform public.audit_schreiben('mandant_gekuendigt', 'mandant', v_mandant::text, jsonb_build_object('loeschung_am', v_am));
  return jsonb_build_object('ok', true, 'loeschung_am', v_am);
end $$;
grant execute on function public.mandant_kuendigen(text) to authenticated;

create or replace function public.mandant_kuendigung_zuruecknehmen()
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_mandant uuid := intern.aktueller_mandant();
begin
  if v_mandant is null or intern.aktuelle_rolle() <> 'inhaber' then raise exception 'Nur der Unternehmensinhaber kann die Kuendigung zuruecknehmen.'; end if;
  update public.mandanten set gekuendigt_am = null, kuendigungsgrund = null,
         loeschung_geplant_am = case when abo_status in ('aktiv', 'zahlung_offen') then null else loeschung_geplant_am end
   where id = v_mandant;
  perform public.audit_schreiben('mandant_kuendigung_zurueckgenommen', 'mandant', v_mandant::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.mandant_kuendigung_zuruecknehmen() to authenticated;

-- --- Globale Suche (RLS-treu: security invoker) -------------------------------------------
create or replace function public.global_suche(p_text text, p_limit integer default 8)
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare q text := '%' || replace(replace(trim(coalesce(p_text, '')), '%', ''), '_', '') || '%'; n integer := least(greatest(coalesce(p_limit, 8), 1), 25);
begin
  if length(trim(coalesce(p_text, ''))) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(t) from (
      (select 'objekt' as art, o.id::text as id, o.objektnummer || ' · ' || o.bezeichnung as titel, concat_ws(', ', o.strasse, o.ort) as untertitel, '/objekte/' || o.id as pfad
         from public.objekte o where o.geloescht_am is null and (o.bezeichnung ilike q or o.objektnummer ilike q or o.strasse ilike q or o.ort ilike q or o.titel ilike q) order by o.geaendert_am desc limit n)
      union all
      (select 'kontakt', k.id::text, concat_ws(' ', k.vorname, k.nachname) || coalesce(' · ' || k.firma, ''), concat_ws(', ', k.email, k.ort), '/kontakte/' || k.id
         from public.kontakte k where k.geloescht_am is null and (k.nachname ilike q or k.vorname ilike q or k.firma ilike q or k.email ilike q or k.ort ilike q) order by k.geaendert_am desc limit n)
      union all
      (select 'projekt', p.id::text, p.name, coalesce(p.ort, ''), '/projekte/' || p.id
         from public.projekte p where p.geloescht_am is null and (p.name ilike q or p.ort ilike q) limit n)
      union all
      (select 'vertrag', v.id::text, v.titel, v.art::text || ' · ' || v.status::text, '/vertraege/' || v.id
         from public.vertraege v where v.titel ilike q limit n)
      union all
      (select 'aufgabe', a.id::text, a.titel, coalesce(to_char(a.faellig_am, 'DD.MM.YYYY'), ''), '/aufgaben'
         from public.aufgaben a where a.erledigt_am is null and a.titel ilike q limit n)
      union all
      (select 'termin', t.id::text, t.titel, to_char(t.beginnt_am at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'), '/kalender/' || t.id
         from public.termine t where t.abgesagt_am is null and t.titel ilike q order by t.beginnt_am desc limit n)
      union all
      (select 'rechnung', r.id::text, coalesce(r.rechnungsnummer, 'Entwurf') || ' · ' || coalesce(r.empfaenger_name, ''), r.status::text, '/rechnungen/' || r.id
         from public.rechnungen r where r.empfaenger_name ilike q or r.rechnungsnummer ilike q limit n)
      union all
      (select 'kunde', k.id::text, k.anzeigename, k.art || ' · ' || k.email, '/kundenbereich/' || k.id
         from public.portal_kunden k where k.geloescht_am is null and (k.anzeigename ilike q or k.email ilike q) limit n)
    ) t
  ), '[]'::jsonb);
end $$;
grant execute on function public.global_suche(text, integer) to authenticated;
