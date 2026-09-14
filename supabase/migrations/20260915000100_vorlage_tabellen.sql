-- Tabellen und Sequenzen der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: reference/schema/05-sequenzen.sql, 10-tabellen-01..06.sql
--
-- 167 Tabellen, 5 Sequenzen. Die Standardwerte mit Firmenangaben der
-- Vorlage sind entfernt oder durch Platzhalter ersetzt — siehe
-- scripts/neutralisieren.py, Abschnitt MARKE.


create sequence public.amt_adressen_id_seq as integer start with 1 increment by 1;
create sequence public.amt_vorlage_id_seq as integer start with 1 increment by 1;
create sequence public.amt_zusaetzliche_regionen_id_seq as integer start with 1 increment by 1;
create sequence public.expose_debug_id_seq as bigint start with 1 increment by 1;
create sequence public.plz_region_id_seq as integer start with 1 increment by 1;

create table public.akq_aktivitaeten (
  id uuid default gen_random_uuid() not null,
  lead_id uuid not null,
  typ text not null,
  betreff text,
  notiz text,
  faellig_am timestamp with time zone,
  erledigt_am timestamp with time zone,
  prioritaet text default 'normal'::text not null,
  zustaendig_id uuid,
  automation_id uuid,
  termin_id uuid,
  wiederholung_tage integer,
  erstellt_von uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_automation_lauf (
  id uuid default gen_random_uuid() not null,
  lead_id uuid not null,
  automation_id uuid,
  geplant_fuer timestamp with time zone default now() not null,
  ausgefuehrt_am timestamp with time zone,
  status text default 'geplant'::text not null,
  fehler text,
  kanal text,
  betreff text,
  inhalt text,
  mail_versendet_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_automationen (
  id uuid default gen_random_uuid() not null,
  pipeline_id uuid,
  stufe_id uuid,
  quelle_id uuid,
  vorlage_id uuid,
  kanal text not null,
  name text,
  verzoegerung_stunden numeric default 0 not null,
  aktiv boolean default true not null,
  bedingungen jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_eingang_log (
  id uuid default gen_random_uuid() not null,
  ip_hash text,
  email text,
  ergebnis text not null,
  created_at timestamp with time zone default now() not null
);

create table public.akq_einstellungen (
  id boolean default true not null,
  provision_satz numeric default 3.57 not null,
  startpreis_faktor numeric default 0.85 not null,
  spanne_prozent numeric default 10 not null,
  verlustgruende text[] default ARRAY['Anderer Makler beauftragt'::text, 'Privat verkauft'::text, 'Verkauf verschoben'::text, 'Kein Verkauf mehr geplant'::text, 'Preisvorstellung zu hoch'::text, 'Kein Kontakt herstellbar'::text, 'Fake-Lead'::text, 'Sonstiges'::text] not null,
  tags text[] default ARRAY['Erbfall'::text, 'Scheidung'::text, 'Kapitalanlage'::text, 'Zeitdruck'::text, 'Vermietet'::text, 'Sanierungsbedarf'::text] not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_kampagnen (
  id uuid default gen_random_uuid() not null,
  name text not null,
  campaign_id text,
  art text,
  source text,
  budget numeric,
  ausgaben numeric default 0 not null,
  start date,
  ende date,
  aktiv boolean default true not null,
  notiz text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_lead_historie (
  id uuid default gen_random_uuid() not null,
  lead_id uuid not null,
  feld text not null,
  alt text,
  neu text,
  user_id uuid,
  user_name text,
  created_at timestamp with time zone default now() not null
);

create table public.akq_leads (
  id uuid default gen_random_uuid() not null,
  kontakt_id uuid,
  immobilie_id uuid,
  radar_objekt_id uuid,
  tippgeber_kontakt_id uuid,
  pipeline_id uuid,
  stufe_id uuid,
  quelle_id uuid,
  zustaendig_id uuid,
  tags text[] default '{}'::text[] not null,
  status text default 'offen'::text not null,
  verlustgrund text,
  titel text,
  strasse text,
  hausnummer text,
  plz text,
  ort text,
  lat double precision,
  lon double precision,
  objektart text,
  wohnflaeche numeric,
  grundstueck numeric,
  zimmer numeric,
  baujahr integer,
  zustand text,
  verkaufszeitraum text,
  wert_schaetzung numeric,
  wert_min numeric,
  wert_max numeric,
  startpreis numeric,
  provision_satz numeric,
  provision_erwartet numeric,
  naechster_schritt_am date,
  notiz text,
  dsgvo_ok boolean default false not null,
  gewonnen_am timestamp with time zone,
  verloren_am timestamp with time zone,
  erstellt_von uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  bewertung_id uuid
);

create table public.akq_mail_leads (
  id uuid default gen_random_uuid() not null,
  mail_eingang_id uuid not null,
  regel_id uuid,
  quelle_id uuid,
  absender_email text,
  betreff text,
  gesendet_am timestamp with time zone,
  status text default 'offen'::text not null,
  konfidenz integer,
  daten jsonb default '{}'::jsonb not null,
  hinweis text,
  dublette_kontakt_id uuid,
  dublette_lead_id uuid,
  lead_id uuid,
  bearbeitet_von uuid,
  bearbeitet_am timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_mail_regeln (
  id uuid default gen_random_uuid() not null,
  name text not null,
  absender_muster text,
  betreff_muster text,
  quelle_id uuid,
  aktiv boolean default true not null,
  sortierung integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_pipelines (
  id uuid default gen_random_uuid() not null,
  name text not null,
  art text not null,
  beschreibung text,
  verknuepfte_pipeline_id uuid,
  aktiv boolean default true not null,
  sortierung integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_quellen (
  id uuid default gen_random_uuid() not null,
  name text not null,
  art text not null,
  slug text,
  kampagne_id uuid,
  aktiv boolean default true not null,
  sortierung integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_stufen (
  id uuid default gen_random_uuid() not null,
  pipeline_id uuid not null,
  name text not null,
  zusatz text,
  sortierung integer default 0 not null,
  ist_gewonnen boolean default false not null,
  ist_verloren boolean default false not null,
  wahrscheinlichkeit numeric,
  farbe text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.akq_vorlagen (
  id uuid default gen_random_uuid() not null,
  kanal text not null,
  name text not null,
  betreff text,
  inhalt text,
  anlass_tag text,
  aktiv boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.aktivitaeten (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  zielgruppe text not null,
  empfaenger_user_id uuid,
  eigentuemer_id uuid,
  maklervertrag_id uuid,
  typ text not null,
  titel text not null,
  text text,
  ref_tabelle text,
  ref_id uuid,
  gelesen_am timestamp with time zone,
  gelesen_von_user_id uuid
);

create table public.aktivitaets_log (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  user_id uuid,
  user_name text default ''::text,
  user_role text default ''::text,
  aktion text not null,
  objekt_typ text not null,
  objekt_id text default ''::text,
  objekt_label text default ''::text,
  details jsonb default '{}'::jsonb
);

create table public.amt_adressen (
  id integer default nextval('amt_adressen_id_seq'::regclass) not null,
  unterlagentyp text not null,
  region text not null,
  region_kanonisch text,
  behoerdenname text not null,
  strasse text,
  plz text,
  ort text,
  postanschrift text,
  telefon text,
  fax text,
  email text,
  webseite text,
  online_portal text,
  zustaendig_fuer text,
  hinweise text,
  aktualisiert_am date default CURRENT_DATE
);

create table public.amt_vorlage (
  id integer default nextval('amt_vorlage_id_seq'::regclass) not null,
  unterlagentyp text not null,
  vorlage_typ text not null,
  betreff text,
  text text not null,
  hinweis text,
  benoetigte_anlagen text,
  aktualisiert_am date default CURRENT_DATE
);

create table public.amt_zusaetzliche_regionen (
  id integer default nextval('amt_zusaetzliche_regionen_id_seq'::regclass) not null,
  amt_id integer,
  region text not null
);

create table public.arbeitszeit_modelle (
  id uuid default gen_random_uuid() not null,
  profil_id uuid not null,
  gueltig_ab date not null,
  stunden_mo numeric(4,2) default 0 not null,
  stunden_di numeric(4,2) default 0 not null,
  stunden_mi numeric(4,2) default 0 not null,
  stunden_do numeric(4,2) default 0 not null,
  stunden_fr numeric(4,2) default 0 not null,
  stunden_sa numeric(4,2) default 0 not null,
  stunden_so numeric(4,2) default 0 not null,
  notiz text,
  created_at timestamp with time zone default now() not null
);

create table public.arbeitszeit_stempel (
  id uuid default gen_random_uuid() not null,
  profil_id uuid not null,
  datum date not null,
  richtung text not null,
  zeitpunkt timestamp with time zone default now() not null,
  quelle text default 'dashboard'::text not null,
  notiz text,
  created_at timestamp with time zone default now() not null
);

create table public.arbeitszeit_tage (
  id uuid default gen_random_uuid() not null,
  profil_id uuid not null,
  datum date not null,
  art text default 'arbeit'::text not null,
  von time without time zone,
  bis time without time zone,
  stunden numeric(5,2),
  bemerkung text,
  erfasst_von uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  gestempelt boolean default false not null
);

create table public.aufgaben (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  typ text not null,
  status text default 'offen'::text not null,
  titel text not null,
  beschreibung text,
  kontakt_id uuid,
  immobilie_id uuid,
  termin_id uuid,
  zustaendig_id uuid,
  faellig_am date,
  entwurf_betreff text,
  entwurf_text text,
  empfaenger_email text,
  empfaenger_name text,
  daten jsonb default '{}'::jsonb not null,
  erledigt_am timestamp with time zone,
  erledigt_von uuid,
  ergebnis text,
  mail_versendet_id uuid,
  lead_id uuid
);

create table public.bewerber_antworten (
  id uuid default gen_random_uuid() not null,
  einladung_id uuid not null,
  antworten jsonb not null,
  punkte_auto jsonb,
  ki_bewertung jsonb,
  gesamt_punkte numeric,
  max_punkte numeric,
  ko_sorgfalt boolean default false not null,
  empfehlung text,
  chef_note text,
  chef_kommentar text,
  erstellt_am timestamp with time zone default now() not null
);
create table public.bewerber_einladungen (
  id uuid default gen_random_uuid() not null,
  erstellt_am timestamp with time zone default now() not null,
  erstellt_von uuid,
  vorname text not null,
  nachname text not null,
  email text,
  quereinsteiger boolean default false not null,
  token text not null,
  status text default 'offen'::text not null,
  gestartet_am timestamp with time zone,
  abgeschlossen_am timestamp with time zone,
  gueltig_bis timestamp with time zone default (now() + '14 days'::interval) not null,
  katalog_version integer default 2 not null,
  notiz text
);

create table public.bewertungen (
  id uuid default gen_random_uuid() not null,
  ersteller_id uuid,
  ersteller_name text,
  created_at timestamp with time zone default now(),
  daten jsonb default '{}'::jsonb,
  titel text,
  immobilie_id uuid,
  akq_lead_id uuid
);

create table public.briefe (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  created_by_name text,
  absender_firma_id uuid,
  empfaenger_name text default ''::text not null,
  empfaenger_zusatz text,
  empfaenger_strasse text,
  empfaenger_plz_ort text,
  datum date default CURRENT_DATE not null,
  ansprechpartner text,
  betreff text default ''::text not null,
  brieftext text default ''::text not null,
  grussformel text default 'Mit freundlichen Grüßen'::text not null,
  unterzeichner text,
  unterzeichner_funktion text,
  status text default 'entwurf'::text not null
);

create table public.checkliste_items (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  maklervertrag_id uuid not null,
  sortierung integer default 0 not null,
  titel text not null,
  beschreibung text,
  passende_kategorie text,
  pflicht boolean default true not null,
  status text default 'offen'::text not null,
  erledigt_am timestamp with time zone,
  erledigt_durch_dokument_id uuid,
  unterlagentyp text,
  anfrage_status text default 'nicht_angefragt'::text,
  anfrage_behoerde_id integer,
  anfrage_gesendet_am timestamp with time zone,
  anfrage_erhalten_am timestamp with time zone,
  anfrage_mail_id uuid,
  anfrage_notiz text
);

create table public.checkliste_vorlagen (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  name text not null,
  vertragsart text default 'verkauf'::text not null,
  beschreibung text,
  aktiv boolean default true not null
);

create table public.checkliste_vorlagen_items (
  id uuid default gen_random_uuid() not null,
  vorlage_id uuid not null,
  sortierung integer default 0 not null,
  titel text not null,
  beschreibung text,
  passende_kategorie text,
  pflicht boolean default true not null
);

create table public.dashboard_gesehen (
  id uuid default gen_random_uuid() not null,
  benutzer_id uuid not null,
  code text not null,
  ref text not null,
  gesehen_am timestamp with time zone default now() not null
);

create table public.dokumente (
  id uuid default gen_random_uuid() not null,
  name text not null,
  storage_path text not null,
  type text,
  size_bytes bigint,
  kategorie text default 'Allgemein'::text,
  uploader_id uuid,
  uploader_name text,
  created_at timestamp with time zone default now()
);

create table public.ea_accounts (
  id uuid not null,
  email text not null,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.ea_events (
  id text not null,
  claimed_at timestamp with time zone default now() not null
);

create table public.ea_orders (
  id uuid not null,
  order_number text,
  status text,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.eigentuemer (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  anrede text,
  vorname text,
  nachname text,
  firma text,
  email text not null,
  telefon text,
  strasse text,
  plz text,
  ort text,
  letzter_login timestamp with time zone,
  aktiv boolean default true not null,
  tutorial_step integer default 0,
  tutorial_completed_at timestamp with time zone,
  passwort_geaendert boolean default false,
  portal_typ text,
  archiviert_am timestamp with time zone,
  archiviert_von uuid,
  titel text
);

create table public.eigentuemer_benachrichtigung_queue (
  id uuid default gen_random_uuid() not null,
  eigentuemer_id uuid not null,
  ausloeser text default 'neue_dokumente'::text not null,
  anzahl_dokumente integer default 1 not null,
  erstes_ereignis_am timestamp with time zone default now() not null,
  letztes_ereignis_am timestamp with time zone default now() not null,
  versendet_am timestamp with time zone,
  fehler text,
  versuche integer default 0 not null
);

create table public.eigentuemer_dokumente (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  eigentuemer_id uuid not null,
  maklervertrag_id uuid,
  name text not null,
  pfad text not null,
  groesse bigint,
  content_type text,
  kategorie text default 'sonstiges'::text not null,
  hochgeladen_von_user_id uuid,
  hochgeladen_von_typ text default 'eigentuemer'::text not null,
  ki_auswertung jsonb,
  ki_ausgewertet_am timestamp with time zone,
  notiz text,
  checkliste_item_id uuid,
  onedrive_pfad text,
  onedrive_uebertragen_am timestamp with time zone,
  freigabe_status text default 'nicht_relevant'::text,
  freigabe_am timestamp with time zone,
  freigabe_durch_user_id uuid,
  freigabe_anmerkungen text,
  antwort_auf_dokument_id uuid,
  ki_dateiname_vorschlag text,
  ki_umbenennung_status text default 'offen'::text,
  ki_umbenennung_fehler text,
  nachricht text
);

create table public.eigentuemer_einladungen (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  token text default encode(gen_random_bytes(24), 'hex'::text) not null,
  email text not null,
  vorname text,
  nachname text,
  status text default 'offen'::text not null,
  maklervertrag_id uuid,
  eigentuemer_id uuid,
  abgelaufen_am timestamp with time zone default (now() + '30 days'::interval) not null,
  angenommen_am timestamp with time zone
);

create table public.eigentuemer_nachrichten (
  id uuid default gen_random_uuid() not null,
  eigentuemer_id uuid not null,
  absender_typ text not null,
  absender_user_id uuid,
  absender_name text,
  text text not null,
  created_at timestamp with time zone default now() not null,
  anhaenge jsonb default '[]'::jsonb not null
);

create table public.eigentuemer_objekte (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  eigentuemer_id uuid not null,
  maklervertrag_id uuid not null,
  ansprechpartner_id uuid,
  notiz text
);

create table public.eigentuemer_personen (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  eigentuemer_id uuid not null,
  user_id uuid,
  anrede text,
  vorname text,
  nachname text,
  email text not null,
  telefon text,
  ist_hauptperson boolean default false not null,
  erhaelt_emails boolean default true not null,
  letzter_login timestamp with time zone,
  aktiv boolean default true not null,
  passwort_geaendert boolean default false not null
);

create table public.energieausweis_anfragen (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  name text,
  email text,
  telefon text,
  anschrift text,
  anlass text,
  daten jsonb default '{}'::jsonb not null,
  dateien jsonb default '[]'::jsonb not null,
  unterschrift_pfad text,
  preis text,
  sofortiger_beginn boolean default false not null,
  ip_hash text,
  status text default 'neu'::text not null,
  mail_ergebnis jsonb
);

create table public.expose_debug (
  id bigint default nextval('expose_debug_id_seq'::regclass) not null,
  lauf_id uuid not null,
  schritt text not null,
  detail text,
  ts timestamp with time zone default now() not null
);

create table public.expose_entwuerfe (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  user_id uuid,
  user_name text default ''::text,
  titel text default 'Unbenannter Entwurf'::text not null,
  kategorie text default 'haus'::text not null,
  textart text default 'objekt'::text not null,
  text_inhalt text default ''::text not null,
  daten jsonb default '{}'::jsonb not null,
  maklervertrag_id uuid,
  eigentuemer_wunsch text,
  eigentuemer_wunsch_von_dokument_id uuid
);

create table public.expose_freigaben (
  id uuid default gen_random_uuid() not null,
  token text not null,
  immobilie_id uuid not null,
  kontakt_id uuid,
  email text not null,
  name text,
  provisionsmodell text default 'kaeufer'::text not null,
  provision_text text,
  firma_slug text,
  erstellt_von uuid,
  created_at timestamp with time zone default now() not null,
  gueltig_bis timestamp with time zone default (now() + '90 days'::interval) not null,
  geoeffnet_am timestamp with time zone,
  bestaetigt_am timestamp with time zone,
  ip text,
  user_agent text,
  bestaetigungen jsonb,
  newsletter boolean default false,
  expose_datei_id uuid,
  downloads integer default 0 not null,
  letzter_download_am timestamp with time zone,
  bestaetigungsmail_am timestamp with time zone,
  erinnerung_am timestamp with time zone,
  erinnerung_fehler text,
  dokument_ids uuid[]
);

create table public.external_credentials (
  id uuid default gen_random_uuid() not null,
  service text not null,
  label text not null,
  url text not null,
  username text not null,
  password_obfuscated text not null,
  hinweis text,
  aktiv boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.external_credentials_audit (
  id uuid default gen_random_uuid() not null,
  credential_id uuid,
  user_id uuid,
  user_name text,
  aktion text not null,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone default now() not null
);
create table public.fehler_protokoll (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  benutzer_id uuid,
  benutzer_name text,
  schluessel text,
  meldung text not null,
  stack text,
  quelle text default 'fenster'::text not null,
  url text,
  ansicht text,
  browser text,
  app text,
  version text,
  online boolean,
  status text default 'offen'::text not null,
  erledigt_von uuid,
  erledigt_am timestamp with time zone
);

create table public.finanzierungs_annahmen (
  id uuid default gen_random_uuid() not null,
  zinssatz numeric default 3.9 not null,
  tilgung numeric default 2.0 not null,
  eigenkapital_prozent numeric default 20 not null,
  notar_prozent numeric default 2.0 not null,
  hinweis text default 'Unverbindliche Beispielrechnung, keine Finanzierungsberatung. Konditionen abhaengig von Bonitaet und Anbieter.'::text,
  aktiv boolean default true not null,
  updated_at timestamp with time zone default now() not null
);

create table public.firma_kennzahlen (
  id uuid default gen_random_uuid() not null,
  jahr integer not null,
  objekte_vermittelt integer,
  erzielungsquote numeric,
  vermarktungsdauer_schnitt numeric,
  google_anzahl integer,
  google_schnitt numeric,
  fakten jsonb default '[]'::jsonb,
  aktiv boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.firma_stammdaten (
  firma_name text default 'Musterhaus Immobilien GmbH'::text not null,
  strasse text,
  plz text,
  ort text,
  land text default 'DE'::text,
  email text,
  telefon text,
  web text,
  registergericht text,
  hrb text,
  geschaeftsfuehrer text,
  steuernummer text,
  ust_id text,
  bank_name text,
  bank_iban text,
  bank_bic text,
  rechnung_einleitung text default (('Sehr geehrte Damen und Herren,'::text || '

'::text) || 'hiermit stellen wir Ihnen folgende Leistungen in Rechnung:'::text),
  rechnung_schluss text default (((('Vielen Dank fuer Ihr Vertrauen!'::text || '

'::text) || 'Mit freundlichen Gruessen'::text) || '
'::text) || 'Musterhaus Immobilien GmbH'::text),
  zahlungsziel_tage integer default 30 not null,
  standard_mwst_satz numeric(5,2) default 19.00 not null,
  updated_at timestamp with time zone default now() not null,
  id uuid default gen_random_uuid() not null,
  slug text,
  nummernkreis_prefix text default 'Rechnung'::text,
  nummernkreis_mit_jahr boolean default true,
  aktiv boolean default true,
  sortierung integer default 0,
  logo_pfad text,
  rechnung_nummer_praefix text default 'RE'::text,
  rechnung_nummer_mit_jahr boolean default true,
  typ text default 'standort'::text not null,
  inhaber_user_id uuid,
  kleinunternehmer boolean default false not null
);

create table public.geo_cache (
  adresse_norm text not null,
  adresse text not null,
  lat double precision,
  lon double precision,
  gefunden boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table public.immobilie_datei (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid not null,
  name text not null,
  doktyp text,
  mime_type text,
  size_bytes bigint,
  speicher_typ text not null,
  storage_path text,
  onedrive_drive_id text,
  onedrive_item_id text,
  onedrive_web_url text,
  external_url text,
  quelle text,
  mail_eingang_id uuid,
  notizen text,
  created_at timestamp with time zone default now(),
  ersteller_id uuid,
  kategorie text default 'dokument'::text not null,
  titel text,
  sortierung integer default 0 not null,
  oeffentlich boolean default false not null,
  ki_bearbeitet boolean default false not null,
  onoffice_datei_id text,
  expose_ausschliessen boolean default false not null,
  expose_final boolean default false not null,
  interessenten_freigabe boolean default false not null
);

create table public.immobilie_eigentuemer (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid not null,
  eigentuemer_id uuid not null,
  rolle text default 'eigentuemer'::text,
  created_at timestamp with time zone default now()
);

create table public.immobilie_fahrt_cache (
  immobilie_id uuid not null,
  km_einfach numeric,
  minuten_einfach numeric,
  koordinaten jsonb,
  quelle text,
  manuell boolean default false not null,
  ermittelt_am timestamp with time zone default now() not null
);

create table public.immobilie_grundstueck (
  immobilie_id uuid not null,
  grz text,
  gfz text,
  erschliessung text,
  erschliessungskosten numeric,
  bebaubar_nach text,
  bebaubar_mit text[],
  teilbar_ab numeric,
  quelle text default 'portal'::text not null,
  updated_at timestamp with time zone default now() not null
);

create table public.immobilie_kosten_einstellung (
  immobilie_id uuid not null,
  energieausweis_beschafft boolean default false not null,
  provision_erwartet numeric,
  notiz text,
  aktualisiert_am timestamp with time zone default now() not null,
  aktualisiert_von uuid
);

create table public.immobilie_kosten_position (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid not null,
  datum date default CURRENT_DATE not null,
  typ text not null,
  beschreibung text,
  minuten numeric,
  km numeric,
  betrag numeric default 0 not null,
  mitarbeiter_id uuid,
  quelle text default 'manuell'::text not null,
  quelle_ref text,
  created_at timestamp with time zone default now() not null,
  ersteller_id uuid
);

create table public.immobilie_onedrive (
  immobilie_id uuid not null,
  drive_id text not null,
  item_id text not null,
  pfad text,
  web_url text,
  gesetzt_von uuid,
  updated_at timestamp with time zone default now() not null
);

create table public.immobilie_portal_status (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid not null,
  portal text not null,
  status text default 'nie_uebertragen'::text not null,
  meldung text,
  uebertragen_am timestamp with time zone,
  portal_url text,
  quelle text,
  manuell boolean default false not null
);

create table public.immobilie_wissen (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid not null,
  quelle_typ text default 'datei'::text not null,
  quelle_name text,
  quelle_ref text,
  dokument_typ text,
  zusammenfassung text,
  fakten jsonb default '[]'::jsonb not null,
  warnungen jsonb default '[]'::jsonb not null,
  ausgewertet_am timestamp with time zone default now() not null,
  erstellt_von uuid,
  created_at timestamp with time zone default now() not null
);

create table public.immobilien (
  id uuid default gen_random_uuid() not null,
  bezeichnung text,
  strasse text,
  hausnummer text,
  plz text,
  ort text,
  vertragsart text not null,
  objektart text,
  status text default 'akquise'::text not null,
  wohnflaeche numeric,
  grundstueck numeric,
  zimmer numeric,
  baujahr integer,
  angebotspreis numeric,
  verkaufspreis numeric,
  zustaendig_id uuid,
  hauptbild_url text,
  notizen text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  ersteller_id uuid,
  immo_nr text,
  stammobjekt_id uuid,
  wohnungsnr text,
  etage text,
  etagen_gesamt integer,
  objekttyp text,
  nutzungsart text,
  objekttitel text,
  beschreibung_objekt text,
  beschreibung_lage text,
  beschreibung_ausstattung text,
  beschreibung_sonstiges text,
  nutzflaeche numeric,
  kaltmiete numeric,
  nebenkosten numeric,
  heizkosten numeric,
  kaution text,
  provision_aussen text,
  provision_innen text,
  verfuegbar_ab text,
  auftragsart text,
  auftrag_bis date,
  verkauft_am date,
  energieausweis_typ text,
  energie_kennwert numeric,
  energie_klasse text,
  energie_traeger text,
  energie_baujahr_anlage integer,
  energie_warmwasser boolean,
  schlafzimmer numeric,
  badezimmer numeric,
  anzahl_balkone integer,
  anzahl_terrassen integer,
  provisionsfrei boolean default false not null,
  marktwert numeric,
  ueberschrift_objektbeschreibung text,
  ueberschrift_lage text,
  beschreibung_ausstattung_expose text,
  website_veroeffentlichen boolean default false not null,
  website_top_angebot boolean default false not null,
  referenz boolean default false not null,
  adresse_freigeben boolean default false not null,
  shoptv_veroeffentlichen boolean default false not null,
  expose_slogan text,
  expose_highlights jsonb,
  lage_distanzen jsonb,
  raumaufteilung jsonb,
  expose_qr_url text,
  stellplatz_art text,
  stellplatz_anzahl integer,
  energie_gueltig_bis date,
  lage_koordinaten jsonb,
  heizungsart text,
  fenster text,
  fensterbaujahr integer,
  fenster_verglasung text,
  fenster_baujahr integer,
  hausgeld numeric,
  hausgeld_nicht_umlagefaehig numeric,
  miete_ist numeric,
  miete_soll numeric,
  vermietet boolean default false,
  grunderwerbsteuer_satz numeric,
  expose_rendite boolean default false,
  expose_nebenkosten boolean default true,
  onoffice_id text,
  quelle text default 'eigen'::text not null,
  onoffice_synced_at timestamp with time zone,
  onoffice_gesperrt boolean default false not null,
  onoffice_bilder_am timestamp with time zone,
  expose_titelbild_id uuid,
  befeuerung text,
  unterkellert text,
  zustand text,
  wintergarten boolean default false not null,
  versteckt boolean default false not null,
  warmwasser_in_heizkosten boolean,
  kaution_monate numeric(3,1),
  stellplatzmiete numeric,
  rundgang_url text
);

create table public.jotform_formulare (
  id uuid default gen_random_uuid() not null,
  form_id text not null,
  kategorie text not null,
  bezeichnung text not null,
  aktiv boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.ki_bildbearbeitung_log (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  user_id uuid,
  user_name text default ''::text,
  funktion text not null,
  parameter jsonb default '{}'::jsonb,
  storage_path text not null,
  result_name text default ''::text,
  modell text default ''::text,
  kosten_usd numeric(10,4) default 0,
  status text default 'ok'::text,
  fehler_meldung text default ''::text,
  final_prompt text
);

create table public.ki_pruefungen (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid,
  typ text default 'expose'::text not null,
  status text default 'fertig'::text not null,
  modell text,
  gesamturteil text,
  zusammenfassung text,
  befunde jsonb default '[]'::jsonb not null,
  eingabe_info jsonb default '{}'::jsonb not null,
  fehler text,
  erstellt_von uuid,
  created_at timestamp with time zone default now() not null,
  checkliste jsonb default '{}'::jsonb not null,
  ampel text
);

create table public.kontakt_objekt (
  id uuid default gen_random_uuid() not null,
  kontakt_id uuid not null,
  immobilie_id uuid not null,
  rolle text default 'interessent'::text not null,
  notiz text,
  created_at timestamp with time zone default now() not null,
  ersteller_id uuid
);

create table public.kontakte (
  id uuid default gen_random_uuid() not null,
  anrede text,
  vorname text,
  nachname text,
  firma text,
  rollen text[] default '{}'::text[] not null,
  email text,
  telefon text,
  mobil text,
  strasse text,
  plz text,
  ort text,
  land text default 'Deutschland'::text,
  beruf text,
  notiz text,
  such_profil jsonb,
  eigentuemer_id uuid,
  quelle text default 'manuell'::text,
  aktiv boolean default true not null,
  ersteller_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  onoffice_id text,
  zustaendig_id uuid,
  titel text,
  werbung_opt_out boolean default false not null,
  newsletter_opt_in boolean default false not null,
  such_profil_weitere jsonb
);

create table public.kosten_saetze (
  id integer default 1 not null,
  km_satz numeric default 0.30 not null,
  fahrzeit_faktor numeric default 1.0 not null,
  telefon_modus text default 'minuten'::text not null,
  telefon_pauschale_je_anruf numeric default 2.50 not null,
  telefon_pauschale_je_objekt_monat numeric default 15.00 not null,
  telefon_minuten_ohne_dauer integer default 5 not null,
  pauschale_objektaufbereitung numeric default 150 not null,
  pauschale_bilder numeric default 250 not null,
  pauschale_expose numeric default 120 not null,
  pauschale_energieausweis numeric default 100 not null,
  pauschale_portal_inserat_monat numeric default 30 not null,
  minuten_je_mail integer default 5 not null,
  firmen_adresse text default ''::text not null,
  firmen_koordinaten jsonb default '{}'::jsonb not null,
  aktualisiert_am timestamp with time zone default now() not null,
  aktualisiert_von uuid
);

create table public.liquid_imports (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  user_id uuid,
  user_name text default ''::text,
  konto_id uuid,
  konto_name text default ''::text,
  firma text default ''::text,
  bank text default ''::text,
  dateiname text default ''::text,
  anzahl_buchungen_gesamt integer default 0,
  anzahl_buchungen_neu integer default 0,
  anzahl_duplikate integer default 0,
  zeitraum_von date,
  zeitraum_bis date,
  fehler text default ''::text
);

create table public.liquid_kategorisierung (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  match_key text not null,
  kategorie text not null,
  unterkategorie text default ''::text,
  treffer_anzahl integer default 1 not null
);

create table public.liquid_konten (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  firma text not null,
  bank text not null,
  konto_name text not null,
  iban text not null,
  aktiv boolean default true not null,
  notiz text default ''::text,
  ist_ruecklage boolean default false not null,
  ruecklage_art text default ''::text,
  manual_saldo numeric(14,2),
  manual_saldo_datum date,
  manual_saldo_notiz text default ''::text
);
create table public.liquid_settings (
  id integer default 1 not null,
  kritische_schwelle numeric(14,2) default 50000,
  prognose_monate integer default 12,
  prognose_basis_monate integer default 6,
  updated_at timestamp with time zone default now() not null
);

create table public.liquid_szenarien (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  name text not null,
  beschreibung text default ''::text,
  aktiv boolean default true not null,
  szenario_typ text not null,
  monatlicher_betrag numeric(14,2),
  start_monat date,
  end_monat date,
  einmal_betrag numeric(14,2),
  einmal_datum date,
  prozent_einnahmen numeric(6,2),
  prozent_ausgaben numeric(6,2),
  firma text default ''::text,
  konto_id uuid,
  notiz text default ''::text
);

create table public.liquid_transaktionen (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  konto_id uuid not null,
  firma text not null,
  bank text not null,
  buchungsdatum date not null,
  wertstellung date,
  betrag numeric(14,2) not null,
  waehrung text default 'EUR'::text not null,
  gegenpartei text default ''::text,
  gegenpartei_iban text default ''::text,
  verwendungszweck text default ''::text,
  zahlungsart text default ''::text,
  kategorie text default ''::text,
  unterkategorie text default ''::text,
  kategorie_quelle text default 'auto'::text,
  ist_umbuchung_intern boolean default false,
  umbuchung_partner_id uuid,
  externe_id text default ''::text,
  dedup_hash text not null,
  rohdaten jsonb default '{}'::jsonb,
  status text default 'abgerechnet'::text,
  notiz text default ''::text,
  saldo_nach_buchung numeric(14,2)
);

create table public.mail_absender_onedrive (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  absender_email text not null,
  onedrive_drive_id text not null,
  onedrive_item_id text not null,
  onedrive_pfad text not null,
  letzte_verwendung_am timestamp with time zone default now(),
  verwendung_count integer default 1,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table public.mail_abwesenheit_log (
  id uuid default gen_random_uuid() not null,
  postfach_id uuid not null,
  absender_email text not null,
  gesendet_am timestamp with time zone default now() not null
);

create table public.mail_blockierte_absender (
  id uuid default gen_random_uuid() not null,
  benutzer_id uuid not null,
  email text not null,
  created_at timestamp with time zone default now() not null
);

create table public.mail_eigene_ordner (
  id uuid default gen_random_uuid() not null,
  benutzer_id uuid not null,
  name text not null,
  farbe text default '#D4A567'::text not null,
  reihenfolge integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.mail_eingang (
  id uuid default gen_random_uuid() not null,
  postfach_id uuid,
  message_id text not null,
  imap_uid bigint,
  imap_folder text default 'INBOX'::text,
  absender_email text,
  absender_name text,
  empfaenger_email text,
  betreff text,
  text text,
  html text,
  cc text,
  bcc text,
  anhaenge jsonb default '[]'::jsonb,
  gesendet_am timestamp with time zone,
  abgerufen_am timestamp with time zone default now() not null,
  quelle text default 'mail'::text not null,
  gelesen boolean default false not null,
  archiviert boolean default false not null,
  mietanfrage_id uuid,
  created_at timestamp with time zone default now() not null,
  ordner_id uuid,
  ordner text default 'posteingang'::text not null,
  onedrive_uploads jsonb default '[]'::jsonb,
  anhaenge_status text default 'unbekannt'::text,
  anhaenge_extrahiert_am timestamp with time zone,
  anhaenge_fehler text,
  immobilie_id uuid,
  immobilie_id_ki_vorschlag uuid,
  immobilie_id_ki_konfidenz integer,
  kategorien text[] default '{}'::text[] not null,
  markiert boolean default false not null,
  kontakt_id uuid,
  kontakt_email text,
  kontakt_name text,
  anfrage_daten jsonb,
  anfrage_status text,
  anfrage_verarbeitet_am timestamp with time zone,
  rechnung_status text,
  rechnung_weitergeleitet_am timestamp with time zone,
  rechnung_info jsonb
);

create table public.mail_kategorien (
  id uuid default gen_random_uuid() not null,
  benutzer_id uuid not null,
  name text not null,
  farbe text default '#D4A567'::text not null,
  reihenfolge integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.mail_ki_log (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  benutzer_id uuid not null,
  mail_eingang_id uuid,
  eingabe_zeichen integer,
  ausgabe_zeichen integer,
  model text,
  input_tokens integer,
  output_tokens integer,
  geschaetzte_kosten_eur numeric(10,6) generated always as (((((COALESCE(input_tokens, 0))::numeric * 0.000003) * 0.92) + (((COALESCE(output_tokens, 0))::numeric * 0.000015) * 0.92))) stored
);

create table public.mail_ordner (
  id uuid default gen_random_uuid() not null,
  postfach_id uuid not null,
  name text not null,
  anzeige_name text not null,
  typ text default 'custom'::text not null,
  parent_id uuid,
  ungelesen_anzahl integer default 0,
  gesamt_anzahl integer default 0,
  letzte_uid bigint,
  pull_aktiv boolean default true,
  reihenfolge integer default 0,
  erstellt_am timestamp with time zone default now() not null
);

create table public.mail_postfaecher (
  id uuid default gen_random_uuid() not null,
  benutzer_id uuid not null,
  absender_name text not null,
  email_adresse text not null,
  smtp_server text not null,
  smtp_port integer default 587 not null,
  smtp_security text default 'starttls'::text not null,
  smtp_user text not null,
  smtp_passwort_verschluesselt text,
  signatur text,
  aktiv boolean default true not null,
  letzter_test_ok boolean,
  letzter_test_am timestamp with time zone,
  letzter_test_fehler text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  imap_server text,
  imap_port integer default 993,
  imap_security text default 'ssl'::text,
  imap_user text,
  imap_passwort_verschluesselt text,
  imap_aktiv boolean default false,
  imap_letzte_uid bigint default 0,
  imap_letzter_pull timestamp with time zone,
  reihenfolge integer default 0,
  standard_zum_senden boolean default false,
  ist_standard boolean default false not null,
  abwesend_aktiv boolean default false not null,
  abwesend_von timestamp with time zone,
  abwesend_bis timestamp with time zone,
  abwesend_betreff text,
  abwesend_text text
);

create table public.mail_regeln (
  id uuid default gen_random_uuid() not null,
  benutzer_id uuid not null,
  postfach_id uuid,
  name text default ''::text not null,
  aktiv boolean default true not null,
  bedingung_feld text default 'absender'::text not null,
  bedingung_operator text default 'enthaelt'::text not null,
  bedingung_wert text not null,
  aktion_ordner text,
  aktion_gelesen boolean default false not null,
  aktion_markieren boolean default false not null,
  aktion_kategorie text,
  reihenfolge integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.mail_versendet (
  id uuid default gen_random_uuid() not null,
  postfach_id uuid,
  versendet_von_user_id uuid,
  absender_email text not null,
  absender_name text,
  empfaenger_email text not null,
  empfaenger_name text,
  cc text,
  bcc text,
  betreff text not null,
  body_text text,
  body_html text,
  mietanfrage_id uuid,
  status text default 'gesendet'::text not null,
  fehler_text text,
  smtp_message_id text,
  gesendet_am timestamp with time zone default now() not null
);

create table public.mail_vorlagen (
  id uuid default gen_random_uuid() not null,
  benutzer_id uuid not null,
  titel text not null,
  kategorie text,
  betreff text,
  text text default ''::text not null,
  html text,
  geteilt boolean default false not null,
  sortierung integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  onoffice_id text
);

create table public.marketing (
  id uuid default gen_random_uuid() not null,
  name text not null,
  storage_path text not null,
  type text,
  uploader_id uuid,
  uploader_name text,
  created_at timestamp with time zone default now(),
  vorlage text default ''::text,
  vorlage_daten jsonb,
  quelle text default 'upload'::text,
  ordner text
);

create table public.marketing_print_vorlagen (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  name text not null,
  kategorie text default 'sonstiges'::text not null,
  beschreibung text,
  pdf_pfad text not null,
  vorschau_pfad text,
  feld_mapping jsonb default '{}'::jsonb not null,
  bestell_link text,
  bestell_hinweis text,
  aktiv boolean default true not null,
  sortierung integer default 0 not null
);

create table public.mietanfragen (
  id uuid default gen_random_uuid() not null,
  anrede text,
  vorname text,
  nachname text,
  email text,
  telefon text,
  geburtsdatum date,
  beruf text,
  einkommen_netto numeric(10,2),
  haushaltsgroesse integer,
  haustier text,
  raucher boolean,
  schufa_vorhanden boolean,
  einzug_ab date,
  objekt_strasse text,
  objekt_plz text,
  objekt_ort text,
  objekt_kaltmiete numeric(10,2),
  quelle text default 'manuell'::text,
  eingegangen_am timestamp with time zone default now() not null,
  status text default 'neu'::text not null,
  besichtigung_datum timestamp with time zone,
  besichtigung_termin_alt jsonb default '[]'::jsonb,
  besichtigung_ort text,
  bewertung_score integer,
  bewertung_notiz text,
  letzte_antwort_am timestamp with time zone,
  letzte_antwort_typ text,
  antwort_historie jsonb default '[]'::jsonb,
  notiz text,
  mietvertrag_id uuid,
  vertrag_id uuid,
  created_by uuid,
  created_by_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  mieter1_geburtsdatum date,
  mieter1_strasse text,
  mieter1_hausnummer text,
  mieter1_plz text,
  mieter1_stadt text,
  mieter1_bundesland text,
  mieter1_telefon text,
  mieter1_email text,
  mieter1_arbeitgeber text,
  mieter1_arbeitgeber_seit text,
  mieter1_beruf text,
  mieter1_einkommen_netto numeric(10,2),
  mieter1_unterschrift_url text,
  mieter2_vorname text,
  mieter2_nachname text,
  mieter2_geburtsdatum date,
  mieter2_strasse text,
  mieter2_hausnummer text,
  mieter2_plz text,
  mieter2_stadt text,
  mieter2_bundesland text,
  mieter2_telefon text,
  mieter2_arbeitgeber text,
  mieter2_arbeitgeber_seit text,
  mieter2_beruf text,
  mieter2_einkommen_netto numeric(10,2),
  mieter2_unterschrift_url text,
  aktuelles_mietverhaeltnis_seit text,
  derzeitiger_vermieter text,
  kann_miete_zahlen boolean,
  eidesstattliche_versicherung boolean,
  kann_kaution_leisten boolean,
  angaben_wahrheitsgemaess boolean,
  datenschutz_einwilligung boolean,
  datenschutz_kenntnis boolean,
  mitteilung_text text,
  unterlagen jsonb default '[]'::jsonb,
  jotform_submission_id text,
  jotform_form_id text,
  jotform_raw_payload jsonb,
  email_message_id text,
  email_eingang_postfach text,
  email_eingang_absender text,
  email_eingang_betreff text,
  email_eingang_text text,
  email_eingang_html text,
  email_eingang_datum timestamp with time zone,
  email_imap_uid bigint,
  immobilie_id uuid,
  wohnung_interesse text
);

create table public.mietvertraege (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  ersteller_id uuid,
  ersteller_name text,
  vermieter_typ text default 'eheleute'::text not null,
  vermieter_name text,
  vermieter_strasse text,
  vermieter_plz text,
  vermieter_ort text,
  vermieter_land text default 'Deutschland'::text,
  vermieter_erben jsonb default '[]'::jsonb,
  mieter_typ text default 'frau'::text not null,
  mieter_name text,
  mieter_strasse text,
  mieter_plz text,
  mieter_ort text,
  mieter_land text default 'Deutschland'::text,
  mieter_erben jsonb default '[]'::jsonb,
  objekt_strasse text,
  objekt_plz text,
  objekt_ort text,
  objekt_lage text,
  objekt_raeume text,
  objekt_wohnflaeche text,
  objekt_zustand text,
  schluessel text default '3 Wohnungs-/Haustürschlüssel, 2 Briefkastenschlüssel'::text,
  mietbeginn text,
  kuendigungsausschluss_monate text default '24'::text,
  miete_grundmiete text,
  miete_stellplatz text,
  miete_bk_kalt text,
  miete_bk_warm text,
  miete_gesamt text,
  bank_kontoinhaber text,
  bank_iban text,
  bank_bic text,
  bank_institut text,
  kaution_betrag text,
  ordner_id uuid,
  neubau_klausel boolean default false not null
);

create table public.mietvertrag_ordner (
  id uuid default gen_random_uuid() not null,
  name text not null,
  sortierung integer default 0 not null,
  ersteller_id uuid,
  created_at timestamp with time zone default now() not null
);

create table public.mpe_bausteine (
  id uuid default gen_random_uuid() not null,
  name text not null,
  layout text default 'bild'::text not null,
  tag text,
  titel text,
  inhalt text,
  bild_pfad text,
  quelle text,
  nach text default 'vergleich'::text not null,
  standard boolean default false not null,
  aktiv boolean default true not null,
  sortierung integer default 100 not null,
  created_at timestamp with time zone default now() not null
);

create table public.news_briefings (
  id uuid default gen_random_uuid() not null,
  briefing_datum date not null,
  zusammenfassung text not null,
  themen jsonb default '[]'::jsonb not null,
  quellen jsonb default '[]'::jsonb not null,
  anzahl_artikel integer default 0 not null,
  modell text,
  created_at timestamp with time zone default now() not null
);

create table public.notar_laufzettel (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  bezeichnung text,
  objekt_adresse text,
  status text default 'entwurf'::text not null,
  maklervertrag_id uuid,
  objektnachweis_id uuid,
  immobilie jsonb default '{}'::jsonb not null,
  verkaeufer jsonb default '[]'::jsonb not null,
  kaeufer jsonb default '[]'::jsonb not null,
  kaufvertrag jsonb default '{}'::jsonb not null,
  sonstiges jsonb default '{}'::jsonb not null,
  anhaenge jsonb default '[]'::jsonb not null,
  onedrive_drive_id text,
  onedrive_item_id text,
  onedrive_ordner_pfad text
);

create table public.notiz_tags (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  farbe text default '#5b8def'::text not null,
  erstellt_am timestamp with time zone default now() not null
);

create table public.notizen (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  text text not null,
  erledigt boolean default false not null,
  faellig_am date,
  prio text default 'normal'::text,
  quelle text default 'text'::text,
  erstellt_am timestamp with time zone default now() not null,
  erledigt_am timestamp with time zone,
  tags text[] default '{}'::text[],
  wiederholung text,
  verknuepft_typ text,
  verknuepft_id uuid,
  verknuepft_label text,
  mail_id uuid,
  ki_zusammenfassung text,
  ki_todos jsonb,
  ki_termine jsonb
);

create table public.objektaufnahme_fotos (
  id uuid default gen_random_uuid() not null,
  objektaufnahme_id uuid not null,
  abschnitt text not null,
  pfad text not null,
  dateiname text,
  groesse integer,
  content_type text,
  bemerkung text,
  hochgeladen_von_user_id uuid,
  created_at timestamp with time zone default now()
);

create table public.objektaufnahmen (
  id uuid default gen_random_uuid() not null,
  maklervertrag_id uuid,
  bewertung_id uuid,
  erstellt_von_user_id uuid,
  erstellt_von_name text,
  status text default 'in_arbeit'::text,
  objektart text,
  objektadresse text,
  ansprechpartner_eigentuemer text,
  telefon_email text,
  eigentuemer_seit_jahr integer,
  verkauf_zeitrahmen text,
  ortsteil_wohnlage text,
  infrastruktur text,
  einkauf_schulen_oepnv text,
  besondere_lagevorteile text,
  grundstuecksgroesse_m2 numeric,
  erschliessung text,
  zufahrt text,
  bebauungsplan_vorhanden boolean,
  grundbuchblatt_nr text,
  flur_flurstueck text,
  baujahr integer,
  bauweise text,
  modernisierungen_sanierungen text,
  dach text,
  keller text,
  geschosse text,
  fenster text,
  wohnflaeche_m2 numeric,
  nutzflaeche_m2 numeric,
  anzahl_zimmer numeric,
  anzahl_schlafzimmer integer,
  anzahl_badezimmer integer,
  badezimmer_mit_fenster integer,
  gaeste_wc boolean,
  balkon_terrasse boolean,
  garage_stellplatz_carport text,
  bodenbelaege text[],
  heizung_energietraeger text,
  heizungsbaujahr integer,
  energieausweis_vorhanden boolean,
  energiekennwert_kwh_m2_a numeric,
  besonderheiten text[],
  einbauten_massmoebel text,
  allgemeiner_zustand text,
  bekannte_maengel text,
  letzte_renovierung text,
  nutzungssituation text,
  nettokaltmiete_monat_eur numeric,
  mietvertrag_seit text,
  doc_grundriss boolean default false,
  doc_flurkarte_lageplan boolean default false,
  doc_energieausweis boolean default false,
  doc_grundbuchauszug boolean default false,
  doc_bauplaene_baubeschreibung boolean default false,
  doc_wohnflaechenberechnung boolean default false,
  doc_teilungserklaerung boolean default false,
  doc_protokolle_eigentuemerversammlung boolean default false,
  doc_abrechnungen_wirtschaftsplan boolean default false,
  besonderheiten_hinweise text,
  einschaetzung_marktwert_eur numeric,
  vermarktungshinweise text,
  empfohlene_massnahmen text,
  termin_objektfotos text,
  ansprechpartner_besichtigungen text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  immobilie_id uuid
);

create table public.objektnachweise (
  id uuid default gen_random_uuid() not null,
  angebotsdatum text,
  k1_anrede text,
  k1_vorname text,
  k1_nachname text not null,
  k1_strasse text,
  k1_plz text,
  k1_ort text,
  k1_geburt text,
  k1_staat text default 'Deutsch'::text,
  k1_ausweis text,
  k2_anrede text,
  k2_vorname text,
  k2_nachname text,
  k2_strasse text,
  k2_plz text,
  k2_ort text,
  k2_geburt text,
  k2_staat text default 'Deutsch'::text,
  k2_ausweis text,
  objekt_bezeichnung text not null,
  objekt_adresse text,
  kaufpreis text,
  provision text default '2,00'::text,
  ersteller_id uuid,
  ersteller_name text,
  created_at timestamp with time zone default now(),
  standort text,
  objekt_strasse text,
  objekt_plz text,
  objekt_ort text,
  kaeufer jsonb default '[]'::jsonb,
  notar_name text,
  notar_adresse text,
  anzahl_kaeufer integer default 1,
  maklervertrag_id uuid
);

create table public.onoffice_adressen (
  onoffice_id text not null,
  kdnr text,
  anrede text,
  titel text,
  vorname text,
  nachname text,
  zusatz1 text,
  email text,
  telefon1 text,
  telefon2 text,
  strasse text,
  plz text,
  ort text,
  land text,
  art_daten text,
  status text,
  bemerkung text,
  herkunft text,
  dsgvo text,
  roh jsonb,
  synced_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.onoffice_diagnose (
  id uuid default gen_random_uuid() not null,
  lauf_at timestamp with time zone default now() not null,
  test text not null,
  errorcode text,
  meldung text,
  treffer integer,
  beispiel jsonb
);
create table public.onoffice_export_log (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid,
  onoffice_id text,
  aktion text default 'create'::text not null,
  erfolg boolean default false not null,
  kern_ok boolean,
  felder_ok text[] default '{}'::text[],
  felder_fehler text[] default '{}'::text[],
  meldung text,
  ausgeloest_von uuid,
  created_at timestamp with time zone default now() not null
);

create table public.onoffice_feld_werte (
  feld text not null,
  oo_key text not null,
  label text,
  aktualisiert_at timestamp with time zone default now() not null
);

create table public.onoffice_felder (
  feld text not null,
  gueltig boolean not null,
  geprueft_at timestamp with time zone default now() not null
);

create table public.onoffice_import_log (
  id uuid default gen_random_uuid() not null,
  gestartet_at timestamp with time zone default now() not null,
  beendet_at timestamp with time zone,
  objekte_neu integer default 0 not null,
  objekte_aktualisiert integer default 0 not null,
  bilder_geladen integer default 0 not null,
  bilder_uebersprungen integer default 0 not null,
  fehler jsonb default '[]'::jsonb not null,
  status text default 'laeuft'::text not null
);

create table public.onoffice_objekte (
  onoffice_id text not null,
  objektnr_extern text,
  titel text,
  objektart text,
  vermarktungsart text,
  strasse text,
  hausnummer text,
  plz text,
  ort text,
  kaufpreis numeric,
  kaltmiete numeric,
  wohnflaeche numeric,
  grundstueck numeric,
  zimmer numeric,
  baujahr integer,
  status_code text,
  veroeffentlicht boolean,
  hauptbild_url text,
  roh jsonb,
  aktiv boolean default true not null,
  synced_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  intern_notiz text,
  intern_aktualisiert_am timestamp with time zone,
  intern_aktualisiert_von uuid,
  auf_webseite boolean default false not null
);

create table public.onoffice_schreib_felder (
  feld text not null,
  schreibbar boolean not null,
  letzte_meldung text,
  geprueft_at timestamp with time zone default now() not null
);

create table public.onoffice_sync_log (
  id uuid default gen_random_uuid() not null,
  gestartet_am timestamp with time zone default now() not null,
  beendet_am timestamp with time zone,
  gelesen integer,
  neu integer,
  aktualisiert integer,
  deaktiviert integer,
  fehler text,
  ausgeloest_von uuid
);

create table public.plz_region (
  id integer default nextval('plz_region_id_seq'::regclass) not null,
  plz text not null,
  ort text not null,
  region text not null,
  bemerkung text
);

create table public.portal_diagnose (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  user_id uuid,
  bereich text,
  meldung text,
  detail jsonb
);

create table public.portal_zugaenge (
  id uuid default gen_random_uuid() not null,
  portal text not null,
  anbieter_nr text,
  ftp_host text not null,
  ftp_user text not null,
  ftp_passwort text not null,
  ftp_ordner text default '.'::text,
  format text default 'openimmo_127'::text,
  aktiv boolean default true not null,
  created_at timestamp with time zone default now()
);

create table public.profiles (
  id uuid not null,
  name text not null,
  email text not null,
  role text default 'mitarbeiter'::text not null,
  must_change_password boolean default false,
  created_at timestamp with time zone default now(),
  funktion text,
  telefon text,
  foto_url text,
  tile_order jsonb default '[]'::jsonb,
  tile_hidden jsonb default '[]'::jsonb,
  tutorial_completed_at timestamp with time zone,
  tutorial_step integer default 0 not null,
  pptx_vorlage_einwertung text,
  pptx_vorlage_einwertung_updated_at timestamp with time zone,
  firma_id uuid,
  stufe text,
  rechte jsonb default '{}'::jsonb not null,
  titel text,
  urlaubstage_jahr integer default 30 not null,
  urlaub_uebertrag integer default 0 not null,
  eintritt date,
  urlaub_staffel jsonb default '{}'::jsonb not null,
  start_adresse text,
  fahrzeit_aktiv boolean default true not null,
  besichtigung_dauer_min integer default 60 not null,
  fahrzeit_puffer_min integer default 5 not null,
  zuletzt_geoeffnet jsonb default '[]'::jsonb not null,
  stundensatz numeric default 45 not null,
  push_mails boolean default true not null,
  push_stumm_von time without time zone,
  push_stumm_bis time without time zone,
  push_termine boolean default true not null,
  push_treffer boolean default true not null
);

create table public.projekt_aktivitaeten (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  zugang_id uuid,
  typ text not null,
  details jsonb,
  created_at timestamp with time zone default now() not null
);

create table public.projekt_anfragen (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  zugang_id uuid not null,
  einheit_id uuid not null,
  typ text default 'reservierung'::text not null,
  status text default 'offen'::text not null,
  nachricht text,
  created_at timestamp with time zone default now() not null,
  bearbeitet_von uuid,
  bearbeitet_am timestamp with time zone
);

create table public.projekt_dateien (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  einheit_id uuid,
  name text not null,
  pfad text not null,
  content_type text,
  groesse bigint,
  kategorie text default 'sonstiges'::text not null,
  sichtbarkeit text default 'kaeufer'::text not null,
  hochgeladen_von uuid,
  created_at timestamp with time zone default now() not null,
  benachrichtigt boolean default false not null,
  ordner_id uuid,
  zugang_id uuid
);

create table public.projekt_einheiten (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  we_nr text not null,
  zimmer numeric,
  geschoss text,
  geschoss_index integer default 0,
  wohnflaeche numeric,
  kaufpreis numeric,
  miete numeric,
  ausrichtung text,
  status text default 'verfuegbar'::text not null,
  grundriss_datei text,
  immobilie_id uuid,
  sortierung integer default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  hausgeld numeric
);

create table public.projekt_kontakte (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  gewerk text not null,
  firma text,
  name text,
  telefon text,
  email text,
  info text,
  fuer_kunden boolean default true not null,
  sortierung integer default 0,
  created_at timestamp with time zone default now()
);

create table public.projekt_kunden_dateien (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  zugang_id uuid not null,
  name text not null,
  pfad text not null,
  content_type text,
  groesse bigint,
  created_at timestamp with time zone default now() not null
);

create table public.projekt_maengel (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  zugang_id uuid not null,
  einheit_id uuid,
  titel text not null,
  beschreibung text,
  foto_pfade text[] default '{}'::text[] not null,
  status text default 'offen'::text not null,
  antwort text,
  created_at timestamp with time zone default now() not null,
  bearbeitet_am timestamp with time zone
);

create table public.projekt_merkliste (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  zugang_id uuid not null,
  einheit_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.projekt_nachrichten (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  zugang_id uuid not null,
  richtung text not null,
  text text not null,
  absender_user_id uuid,
  absender_name text,
  gelesen boolean default false not null,
  created_at timestamp with time zone default now()
);

create table public.projekt_ordner (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  name text not null,
  sichtbarkeit text default 'interessent'::text not null,
  sortierung integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.projekt_updates (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  titel text not null,
  text text,
  bilder jsonb default '[]'::jsonb,
  sichtbarkeit text default 'kaeufer'::text not null,
  created_at timestamp with time zone default now() not null,
  benachrichtigt boolean default false not null,
  erstellt_von uuid
);

create table public.projekt_zahlungsplan (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  zugang_id uuid not null,
  einheit_id uuid,
  "position" integer default 1 not null,
  bezeichnung text not null,
  prozent numeric,
  betrag numeric,
  status text default 'offen'::text not null,
  faellig_am date,
  bezahlt_am date,
  created_at timestamp with time zone default now() not null
);

create table public.projekt_zugaenge (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  einheit_id uuid,
  email text not null,
  anzeigename text,
  rolle text default 'interessent'::text not null,
  token text default encode(gen_random_bytes(24), 'hex'::text) not null,
  aktiv boolean default true not null,
  eingeladen_am timestamp with time zone,
  letzter_login_am timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  passwort_hash text,
  passwort_gesetzt_am timestamp with time zone,
  session_token text,
  session_gueltig_bis timestamp with time zone,
  fortschritt_stufe integer default 1 not null,
  fortschritt_notiz text,
  telefon text,
  quelle text,
  ansprechpartner_id uuid,
  reset_token text,
  reset_gueltig_bis timestamp with time zone
);

create table public.projekte (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  untertitel text,
  ort text,
  strasse text,
  plz text,
  vermarktungsart text default 'kauf'::text not null,
  beschreibung text,
  status text default 'aktiv'::text not null,
  oeffentliche_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.provision_tracker (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  mitarbeiter text default ''::text not null,
  monat text,
  objektvolumen numeric default 0 not null,
  provisionsumsatz numeric default 0 not null,
  auszahlung numeric default 0 not null,
  prov_verkauf numeric default 0 not null,
  prov_vermietung numeric default 0 not null,
  prov_zufuehrung numeric default 0 not null,
  auslegung text,
  notiz text,
  details jsonb
);

create table public.push_einstellungen (
  id integer default 1 not null,
  aktiv boolean default true not null,
  aktualisiert_am timestamp with time zone default now() not null,
  aktualisiert_von uuid
);

create table public.push_geraete (
  id uuid default gen_random_uuid() not null,
  profile_id uuid not null,
  token text not null,
  plattform text default 'ios'::text not null,
  geraetename text,
  app_version text,
  aktiv boolean default true not null,
  created_at timestamp with time zone default now() not null,
  zuletzt_gesehen timestamp with time zone default now() not null
);

create table public.push_log (
  id uuid default gen_random_uuid() not null,
  profile_id uuid,
  token text,
  typ text default 'mail'::text not null,
  ref_id uuid,
  status text not null,
  fehler text,
  gesendet_am timestamp with time zone default now() not null
);

create table public.push_termin_erinnerungen (
  termin_id uuid not null,
  profile_id uuid not null,
  gesendet_am timestamp with time zone default now() not null
);

create table public.radar_aktivitaeten (
  id uuid default gen_random_uuid() not null,
  objekt_id uuid not null,
  art text default 'notiz'::text not null,
  datum timestamp with time zone default now() not null,
  inhalt text,
  benutzer uuid,
  created_at timestamp with time zone default now() not null
);

create table public.radar_historie (
  id uuid default gen_random_uuid() not null,
  objekt_id uuid not null,
  gesehen_am date default CURRENT_DATE not null,
  preis numeric,
  aenderung text,
  quelle text,
  quelle_url text,
  rohtext text,
  created_at timestamp with time zone default now() not null
);

create table public.radar_objekte (
  id uuid default gen_random_uuid() not null,
  fingerprint text not null,
  quelle text default 'manuell'::text not null,
  quelle_url text,
  vermarktungsart text default 'kauf'::text not null,
  objektart text,
  strasse text,
  plz text,
  ort text,
  ortsteil text,
  lat double precision,
  lon double precision,
  wohnflaeche numeric,
  grundstueck numeric,
  zimmer numeric,
  baujahr integer,
  preis numeric,
  preis_pro_qm numeric generated always as (
CASE
    WHEN ((wohnflaeche > (0)::numeric) AND (preis IS NOT NULL)) THEN round((preis / wohnflaeche), 2)
    ELSE NULL::numeric
END) stored,
  anbieter_typ text default 'unbekannt'::text,
  anbieter_name text,
  telefon text,
  email text,
  titel text,
  beschreibung text,
  merkmale jsonb default '{}'::jsonb,
  rohtext text,
  erstmals_gesehen date default CURRENT_DATE not null,
  zuletzt_gesehen date default CURRENT_DATE not null,
  aktiv boolean default true not null,
  status text default 'neu'::text not null,
  prioritaet integer default 0,
  notiz text,
  zugeordnet_an uuid,
  erfasst_von uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.radar_suchauftraege (
  id uuid default gen_random_uuid() not null,
  name text not null,
  benutzer uuid,
  filter jsonb default '{}'::jsonb not null,
  mail_taeglich boolean default false not null,
  aktiv boolean default true not null,
  letzter_lauf timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.rechnung_kunden (
  id uuid default gen_random_uuid() not null,
  anrede text,
  name text not null,
  zusatz text,
  strasse text,
  plz text,
  ort text,
  land text default 'Deutschland'::text,
  email text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.rechnung_nummern_sequence (
  jahr integer not null,
  letzte_nummer integer default 0 not null,
  firma_id uuid not null
);

create table public.rechnung_positionen (
  id uuid default gen_random_uuid() not null,
  rechnung_id uuid not null,
  reihenfolge integer default 0 not null,
  beschreibung text not null,
  menge numeric(10,3) default 1 not null,
  einheit text,
  einzelpreis_netto numeric(12,2) default 0 not null,
  mwst_satz numeric(5,2) default 19.00 not null,
  position_netto numeric(12,2) generated always as ((menge * einzelpreis_netto)) stored,
  created_at timestamp with time zone default now() not null
);

create table public.rechnungen (
  id uuid default gen_random_uuid() not null,
  rechnungsnummer text,
  status text default 'entwurf'::text not null,
  empfaenger_anrede text,
  empfaenger_name text not null,
  empfaenger_zusatz text,
  empfaenger_strasse text,
  empfaenger_plz text,
  empfaenger_ort text,
  empfaenger_land text default 'Deutschland'::text,
  empfaenger_email text,
  ausstellungsdatum date,
  leistungszeitraum_von date,
  leistungszeitraum_bis date,
  faelligkeitsdatum date,
  zahlungsziel_tage integer default 30,
  einleitungstext text,
  schlusstext text,
  vertrag_id uuid,
  storniert_durch uuid,
  storno_fuer uuid,
  nettobetrag numeric(12,2) default 0 not null,
  mwst_betrag numeric(12,2) default 0 not null,
  bruttobetrag numeric(12,2) default 0 not null,
  bezahlt_am date,
  bezahlt_betrag numeric(12,2),
  pdf_pfad text,
  pdf_erzeugt_am timestamp with time zone,
  ersteller_id uuid,
  gestellt_am timestamp with time zone,
  gestellt_durch uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  absender_firma_id uuid,
  ist_test boolean default false not null,
  objektnachweis_id uuid,
  rechnungstyp text default 'frei'::text,
  rechnung_typ text default 'frei'::text
);

create table public.rechnungen_audit (
  id uuid default gen_random_uuid() not null,
  rechnung_id uuid,
  user_id uuid,
  user_name text,
  aktion text not null,
  alte_daten jsonb,
  neue_daten jsonb,
  created_at timestamp with time zone default now() not null
);

create table public.reservierungen_neubau (
  id uuid default gen_random_uuid() not null,
  reservierungsnummer text,
  absender_firma_id uuid,
  kaeufer_typ text default 'einzelperson'::text not null,
  kaeufer_name text not null,
  kaeufer_strasse text,
  kaeufer_plz text,
  kaeufer_ort text,
  kaeufer_land text default 'Deutschland'::text,
  kaeufer_email text,
  kaeufer_telefon text,
  projektname text,
  wohneinheit_nr text,
  etage text,
  wohnflaeche_m2 numeric(8,2),
  objektart text default 'eigentumswohnung'::text,
  objekt_strasse text not null,
  objekt_plz text not null,
  objekt_ort text not null,
  kaufpreis numeric(12,2) not null,
  reservierungsgebuehr_brutto numeric(10,2) not null,
  reservierungsdauer_bis date not null,
  zahlungsfrist_werktage integer default 5 not null,
  ort_unterzeichnung text,
  datum_unterzeichnung date default CURRENT_DATE not null,
  status text default 'entwurf'::text not null,
  rechnung_id uuid,
  notiz text,
  created_by uuid,
  created_by_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  projekt_id uuid,
  projekt_zugang_id uuid,
  projekt_anfrage_id uuid,
  projekt_einheit_id uuid
);

create table public.rundgaenge (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid not null,
  titel text default 'Rundgang'::text not null,
  status text default 'entwurf'::text not null,
  share_token text,
  start_szene_id uuid,
  autorotate boolean default false not null,
  logo_anzeigen boolean default true not null,
  ersteller_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  grundriss_pfad text
);

create table public.rundgang_hotspots (
  id uuid default gen_random_uuid() not null,
  szene_id uuid not null,
  typ text default 'szene'::text not null,
  ziel_szene_id uuid,
  yaw real default 0 not null,
  pitch real default 0 not null,
  text text,
  ziel_yaw real,
  created_at timestamp with time zone default now() not null
);

create table public.rundgang_szenen (
  id uuid default gen_random_uuid() not null,
  rundgang_id uuid not null,
  name text default 'Szene'::text not null,
  sortierung integer default 0 not null,
  pfad_original text,
  pfad_web text,
  pfad_thumb text,
  breite integer,
  hoehe integer,
  start_yaw real default 0 not null,
  start_pitch real default 0 not null,
  start_hfov real default 100 not null,
  nord_offset real default 0 not null,
  grundriss_x real,
  grundriss_y real,
  etage text,
  created_at timestamp with time zone default now() not null
);

create table public.signatur_empfaenger (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  vorgang_id uuid not null,
  eigentuemer_person_id uuid,
  user_id uuid,
  email text not null,
  anzeigename text not null,
  rolle text not null,
  reihenfolge integer default 1 not null,
  status text default 'wartend'::text not null,
  token text default encode(gen_random_bytes(32), 'hex'::text) not null,
  eingeladen_am timestamp with time zone,
  geoeffnet_am timestamp with time zone,
  unterschrieben_am timestamp with time zone,
  unterschrift_bild text,
  klarname text,
  client_meta jsonb,
  bestaetigungen jsonb
);

create table public.signatur_events (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  vorgang_id uuid not null,
  empfaenger_id uuid,
  event_typ text not null,
  details jsonb
);

create table public.signatur_vorgaenge (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  vertrag_id uuid not null,
  dokument_typ text not null,
  status text default 'offen'::text not null,
  unsigned_pdf_pfad text,
  unsigned_pdf_hash text,
  signed_pdf_pfad text,
  versendet_am timestamp with time zone,
  abgeschlossen_am timestamp with time zone,
  ablauf_am timestamp with time zone,
  begleittext text,
  inkl_vollmacht boolean default false,
  unterschrift_positionen jsonb
);

create table public.suchkriterien_lauf (
  id integer default 1 not null,
  zuletzt timestamp with time zone,
  letzter_voll timestamp with time zone
);

create table public.suchkriterien_treffer (
  kontakt_id uuid not null,
  immobilie_id uuid not null,
  punkte integer not null,
  gruende text[] default '{}'::text[] not null,
  gefunden_am timestamp with time zone default now() not null,
  aktualisiert_am timestamp with time zone default now() not null,
  ausgeblendet boolean default false not null,
  expose_gesendet_am timestamp with time zone,
  newsletter_am timestamp with time zone,
  gemeldet_am timestamp with time zone
);

create table public.termin_einladungen (
  id uuid default gen_random_uuid() not null,
  termin_id uuid not null,
  email text not null,
  name text,
  art text default 'extern'::text not null,
  sequence integer default 0 not null,
  status text default 'eingeladen'::text not null,
  gesendet_am timestamp with time zone,
  gesendet_von uuid,
  antwort_am timestamp with time zone,
  mail_id uuid,
  fehler text,
  created_at timestamp with time zone default now() not null
);

create table public.termine (
  id uuid default gen_random_uuid() not null,
  titel text not null,
  datum date not null,
  uhrzeit time without time zone,
  ort text,
  art text,
  ersteller_id uuid,
  ersteller_name text,
  created_at timestamp with time zone default now(),
  immobilie_id uuid,
  ende time without time zone,
  datum_ende date,
  ganztags boolean default false not null,
  teilnehmer text[] default '{}'::text[] not null,
  notiz text,
  privat boolean default false not null,
  status text default 'aktiv'::text not null,
  quelle text default 'portal'::text not null,
  onoffice_id text,
  onoffice_modified timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  kontakt_id uuid,
  nachfassen boolean default true not null,
  nachfass_status text,
  nachfass_am timestamp with time zone,
  bestaetigung_gesendet_am timestamp with time zone,
  bestaetigung_mail_id uuid,
  erinnerung boolean default true not null,
  erinnerung_status text,
  erinnerung_am timestamp with time zone,
  erinnerung_mail_id uuid,
  erinnerung_fehler text,
  urlaub_status text,
  urlaub_arbeitstage numeric,
  urlaub_entschieden_von uuid,
  urlaub_entschieden_am timestamp with time zone,
  urlaub_kommentar text,
  fahrzeit_hin_min integer,
  fahrzeit_rueck_min integer,
  fahrt_von text,
  fahrt_nach text,
  fahrt_hin_km numeric,
  fahrt_rueck_km numeric,
  fahrzeit_berechnet_am timestamp with time zone,
  fahrzeit_quelle text,
  fahrt_zu_termin_id uuid,
  fahrt_richtung text,
  serie_id uuid,
  serie_regel jsonb,
  serie_index integer
);

create table public.todo_kommentar (
  id uuid default gen_random_uuid() not null,
  todo_id uuid not null,
  text text not null,
  system boolean default false not null,
  user_id uuid,
  user_name text,
  created_at timestamp with time zone default now() not null
);

create table public.todo_schritt (
  id uuid default gen_random_uuid() not null,
  todo_id uuid not null,
  titel text not null,
  erledigt boolean default false not null,
  erledigt_am timestamp with time zone,
  sortierung integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.todo_verknuepfung (
  id uuid default gen_random_uuid() not null,
  todo_id uuid not null,
  objekt_typ text not null,
  objekt_id uuid not null,
  label text,
  verwaist boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.todo_vorgang (
  id uuid default gen_random_uuid() not null,
  vorlage_id uuid,
  name text,
  bezug_typ text,
  bezug_id uuid,
  bezug_label text,
  start_am date default CURRENT_DATE not null,
  status text default 'laeuft'::text not null,
  gestartet_von uuid,
  created_at timestamp with time zone default now() not null
);

create table public.todo_vorlage (
  id uuid default gen_random_uuid() not null,
  name text not null,
  beschreibung text,
  bezug_typ text,
  aktiv boolean default true not null,
  sortierung integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.todo_vorlage_schritt (
  id uuid default gen_random_uuid() not null,
  vorlage_id uuid not null,
  nr integer not null,
  titel text not null,
  beschreibung text,
  rolle text default 'makler'::text not null,
  offset_tage integer default 0 not null,
  offset_ab text default 'start'::text not null,
  vorgaenger_nr integer,
  prioritaet text default 'normal'::text not null,
  checkliste jsonb
);

create table public.todos (
  id uuid default gen_random_uuid() not null,
  titel text not null,
  beschreibung text,
  typ text default 'aufgabe'::text not null,
  status text default 'offen'::text not null,
  prioritaet text default 'normal'::text not null,
  faellig_am date,
  faellig_zeit time without time zone,
  erledigt_am timestamp with time zone,
  ergebnis text,
  ersteller_id uuid,
  zustaendig_id uuid,
  team_sichtbar boolean default false not null,
  tags text[] default '{}'::text[] not null,
  wiederholung text,
  quelle text default 'manuell'::text not null,
  sortierung integer,
  vorgang_id uuid,
  vorlage_schritt_id uuid,
  wartet_auf_todo_id uuid,
  entwurf_betreff text,
  entwurf_text text,
  empfaenger_email text,
  empfaenger_name text,
  mail_versendet_id uuid,
  daten jsonb,
  ki_zusammenfassung text,
  ki_todos jsonb,
  ki_termine jsonb,
  erinnert_am timestamp with time zone,
  digest_am date,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.uebergabeprotokoll (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  ersteller_id uuid not null,
  protokoll_typ text not null,
  uebergabe_datum date not null,
  uebergabe_uhrzeit text,
  objekt_adresse text not null,
  objekt_etage text,
  objekt_lage text,
  vermieter_name text not null,
  vermieter_anschrift text,
  vermieter_anwesend boolean default true not null,
  mieter_name text not null,
  mieter_anschrift text,
  mieter_anwesend boolean default true not null,
  schluessel jsonb default '[]'::jsonb not null,
  zaehler jsonb default '[]'::jsonb not null,
  raeume jsonb default '[]'::jsonb not null,
  rauchmelder_typ text,
  rauchmelder_anzahl integer,
  rauchmelder_funktioniert boolean,
  schimmel_check boolean,
  hausordnung_uebergeben boolean,
  bedienungsanleitungen_uebergeben boolean,
  sonderabreden text,
  bemerkungen text,
  unterschrift_vermieter text,
  unterschrift_mieter text,
  status text default 'entwurf'::text not null,
  kontext text default 'vermietung'::text not null
);

create table public.upload_benachrichtigungen (
  id uuid default gen_random_uuid() not null,
  eigentuemer_id uuid not null,
  ansprechpartner_id uuid,
  letzter_upload_at timestamp with time zone default now() not null,
  bereit_ab timestamp with time zone default (now() + '00:05:00'::interval) not null,
  upload_anzahl integer default 1 not null,
  versendet_am timestamp with time zone,
  fehler text,
  created_at timestamp with time zone default now() not null,
  versuche integer default 0 not null
);

create table public.urlaub_hinweise (
  id uuid default gen_random_uuid() not null,
  profil_id uuid not null,
  jahr integer not null,
  art text not null,
  resttage numeric not null,
  frist date not null,
  gesendet_am timestamp with time zone default now() not null,
  gesendet_von uuid,
  mail_versendet_id uuid,
  text text,
  aufgabe_id uuid
);

create table public.verbrauchsausweis_antraege (
  id uuid default gen_random_uuid() not null,
  eigentuemer_id uuid,
  maklervertrag_id uuid,
  erstellt_von_user_id uuid,
  erstellt_von_typ text,
  status text default 'in_arbeit'::text,
  antragsteller_anrede text,
  antragsteller_vorname text,
  antragsteller_nachname text,
  antragsteller_strasse text,
  antragsteller_plz text,
  antragsteller_ort text,
  antragsteller_telefon text,
  antragsteller_email text,
  objekt_strasse text,
  objekt_plz text,
  objekt_ort text,
  gebaeudetyp text,
  baujahr_gebaeude integer,
  baujahr_heizung integer,
  baujahr_warmwasser integer,
  anzahl_wohneinheiten integer default 1,
  anzahl_vollgeschosse integer,
  wohnflaeche numeric,
  gebaeudenutzflaeche numeric,
  beheiztes_volumen numeric,
  sanierung_fassade boolean default false,
  sanierung_fassade_jahr integer,
  sanierung_dach boolean default false,
  sanierung_dach_jahr integer,
  sanierung_kellerdecke boolean default false,
  sanierung_kellerdecke_jahr integer,
  sanierung_fenster boolean default false,
  sanierung_fenster_jahr integer,
  sanierung_freitext text,
  heizung_energietraeger text,
  heizung_energietraeger_sonstiges text,
  warmwasser_zentral boolean default true,
  warmwasser_energietraeger text,
  warmwasser_messung text,
  warmwasser_temperatur numeric,
  lueftungsanlage boolean default false,
  lueftungsanlage_art text,
  solarthermie boolean default false,
  solarthermie_art text,
  photovoltaik boolean default false,
  photovoltaik_kwp numeric,
  verbrauch_jahr_1_von date,
  verbrauch_jahr_1_bis date,
  verbrauch_jahr_1_heizung_kwh numeric,
  verbrauch_jahr_1_heizung_einheit text default 'kWh'::text,
  verbrauch_jahr_1_warmwasser_kwh numeric,
  verbrauch_jahr_1_leerstand_monate numeric default 0,
  verbrauch_jahr_2_von date,
  verbrauch_jahr_2_bis date,
  verbrauch_jahr_2_heizung_kwh numeric,
  verbrauch_jahr_2_heizung_einheit text default 'kWh'::text,
  verbrauch_jahr_2_warmwasser_kwh numeric,
  verbrauch_jahr_2_leerstand_monate numeric default 0,
  verbrauch_jahr_3_von date,
  verbrauch_jahr_3_bis date,
  verbrauch_jahr_3_heizung_kwh numeric,
  verbrauch_jahr_3_heizung_einheit text default 'kWh'::text,
  verbrauch_jahr_3_warmwasser_kwh numeric,
  verbrauch_jahr_3_leerstand_monate numeric default 0,
  ki_endenergie_kwh_m2_a numeric,
  ki_energieklasse text,
  ki_plausibilitaet text,
  ki_zuletzt_geschaetzt_am timestamp with time zone,
  bemerkungen text,
  uploaded_documents jsonb default '[]'::jsonb,
  zip_dokument_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table public.vermerke (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  immobilie_id uuid,
  kontakt_id uuid,
  typ text not null,
  titel text not null,
  text text,
  benutzer_id uuid,
  ref_tabelle text,
  ref_id uuid,
  richtung text,
  rufnummer text,
  begonnen_am timestamp with time zone,
  dauer_minuten integer,
  quelle text
);

create table public.vertraege (
  id uuid default gen_random_uuid() not null,
  verkaeufer_name text not null,
  verkaeufer_strasse text,
  verkaeufer_plz text,
  verkaeufer_ort text,
  objekt_bezeichnung text not null,
  objekt_adresse text,
  angebotspreis text,
  laufzeit_monate text default '6'::text,
  provision text default '3,57'::text,
  ersteller_id uuid,
  ersteller_name text,
  created_at timestamp with time zone default now(),
  standort text,
  vertragsart text default 'verkauf'::text,
  verkaeufer_typ text default 'eheleute'::text,
  erben jsonb default '[]'::jsonb,
  eigentum text default 'allein'::text,
  verbraucher text default 'ja'::text,
  objekt_strasse text,
  objekt_plz text,
  objekt_ort text,
  onedrive_drive_id text,
  onedrive_item_id text,
  onedrive_ordner_pfad text,
  original_pdf_pfad text,
  absender_firma_id uuid,
  vollmacht_mitgenerieren boolean default false,
  immobilie_id uuid,
  verkaeufer_vertreter text,
  verkaeufer_register text,
  provisionsmodell text default 'teilung'::text
);

create table public.waechter_status (
  id integer default 1 not null,
  letzte_mail timestamp with time zone,
  letzter_hash text,
  updated_at timestamp with time zone default now()
);

create table public.web_leads (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  quelle text default 'lp-wertermittlung'::text not null,
  objektart text,
  adresse text,
  name text,
  telefon text,
  email text,
  anlass text,
  nachricht text,
  gclid text,
  utm jsonb,
  seite text,
  user_agent text,
  ip text,
  kontakt_id uuid,
  status text default 'neu'::text not null,
  bearbeitet_von uuid,
  bearbeitet_am timestamp with time zone,
  notiz text,
  verkaufszeitpunkt text,
  eigentuemer text,
  schritt2_am timestamp with time zone,
  mail_am timestamp with time zone
);

alter sequence public.amt_adressen_id_seq owned by public.amt_adressen.id;
alter sequence public.amt_vorlage_id_seq owned by public.amt_vorlage.id;
alter sequence public.amt_zusaetzliche_regionen_id_seq owned by public.amt_zusaetzliche_regionen.id;
alter sequence public.expose_debug_id_seq owned by public.expose_debug.id;
alter sequence public.plz_region_id_seq owned by public.plz_region.id;
