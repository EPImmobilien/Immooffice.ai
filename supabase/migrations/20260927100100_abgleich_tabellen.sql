-- Abgleich mit der Vorlage: Tabellen und Spalten vom 26.09.2026
--
-- Der Stand 14.09. steckt in den Migrationen 20260915*. Seither hat die Vorlage
-- 20 Tabellen und 39 Spalten dazubekommen — nichts entfernt, nichts umbenannt.
-- Deshalb ist dies eine reine Ergaenzung und keine Neufassung.
--
-- Wie der Rueckstand gefunden wurde, steht in docs/ABGLEICH.md: je Objekt ein
-- kurzer Hash auf beiden Seiten, verglichen im Quellprojekt, im Volltext geholt
-- wird nur, was sich unterscheidet.

-- ------------------------------------------------------------------ Sequenz
create sequence if not exists public.onoffice_status_log_id_seq as bigint start with 1 increment by 1;

-- ------------------------------------------------------- 20 neue Tabellen
create table public.akq_vorlagen_sicherung (
  id uuid default gen_random_uuid() not null,
  kanal text not null,
  name text not null,
  betreff text,
  inhalt text,
  anlass_tag text,
  aktiv boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  gesichert_am timestamp with time zone default now() not null
);

create table public.besichtigung_absagen (
  id uuid default gen_random_uuid() not null,
  termin_id uuid,
  datum date not null,
  uhrzeit time without time zone,
  ende time without time zone,
  ganztags boolean default false not null,
  immobilie_id uuid,
  eigentuemer_kontakt_id uuid,
  interessent text,
  makler text,
  eigentuemer_informiert boolean default false not null,
  abgesagt_am timestamp with time zone default now() not null,
  abgesagt_von uuid,
  abgesagt_von_name text
);

create table public.immobilie_datei_geloescht (
  immobilie_id uuid not null,
  onoffice_datei_id text not null,
  geloescht_am timestamp with time zone default now() not null
);

create table public.immobilie_titelbild_wahl (
  immobilie_id uuid not null,
  datei_id uuid,
  quelle text default 'manuell'::text not null,
  gesetzt_von uuid,
  gesetzt_am timestamp with time zone default now() not null
);

create table public.kontakt_emails (
  id uuid default gen_random_uuid() not null,
  kontakt_id uuid not null,
  email text not null,
  bezeichnung text,
  created_at timestamp with time zone default now() not null
);

create table public.landing_besichtigungswuensche (
  id uuid default gen_random_uuid() not null,
  freigabe_id uuid not null,
  immobilie_id uuid not null,
  kontakt_id uuid,
  termine jsonb default '[]'::jsonb not null,
  telefon text,
  anmerkung text,
  status text default 'offen'::text not null,
  termin_id uuid,
  bearbeitet_von uuid,
  bearbeitet_am timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.landing_faq (
  id uuid default gen_random_uuid() not null,
  immobilie_id uuid,
  frage text not null,
  antwort text not null,
  sortierung integer default 0 not null,
  aktiv boolean default true not null,
  erstellt_von uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  kategorie text,
  quelle text default 'team'::text not null,
  sicher boolean default true not null,
  quellen jsonb default '[]'::jsonb not null,
  katalog_schluessel text,
  erzeugt_am timestamp with time zone,
  geprueft_von uuid,
  geprueft_am timestamp with time zone
);

create table public.landing_fragen (
  id uuid default gen_random_uuid() not null,
  freigabe_id uuid not null,
  immobilie_id uuid not null,
  kontakt_id uuid,
  frage text not null,
  antwort text,
  antwort_quelle text,
  quellen jsonb,
  weitergeleitet boolean default false not null,
  beantwortet_von uuid,
  beantwortet_am timestamp with time zone,
  antwort_gesendet_am timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  makler_info_am timestamp with time zone
);

create table public.mail_rechnung_ziele (
  id uuid default gen_random_uuid() not null,
  absender_muster text not null,
  name_muster text,
  ziel_email text not null,
  bezeichnung text,
  aktiv boolean default true not null,
  reihenfolge integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid
);

create table public.mail_termineinladungen (
  id uuid default gen_random_uuid() not null,
  mail_id uuid,
  uid text not null,
  methode text not null,
  sequence integer default 0,
  antwort text,
  termin_id uuid,
  organizer_email text,
  beantwortet_am timestamp with time zone,
  beantwortet_von uuid,
  antwort_mail_ok boolean,
  fehler text,
  created_at timestamp with time zone default now()
);

create table public.newsletter_anmeldungen (
  id uuid default gen_random_uuid() not null,
  kontakt_id uuid,
  email text not null,
  name text,
  quelle text default 'expose_download'::text not null,
  immobilie_id uuid,
  immo_nr text,
  objektart text,
  vertragsart text,
  freigabe_id uuid,
  angemeldet_am timestamp with time zone default now() not null,
  widerrufen_am timestamp with time zone,
  widerruf_quelle text,
  abmelde_token uuid default gen_random_uuid() not null,
  ip text,
  created_at timestamp with time zone default now() not null,
  einwilligung_text text,
  bestaetigt_am timestamp with time zone,
  bestaetigung_token uuid default gen_random_uuid() not null
);

create table public.newsletter_kampagnen (
  id uuid default gen_random_uuid() not null,
  titel text not null,
  betreff text,
  vorschau_text text,
  postfach_id uuid,
  zielgruppe jsonb default '{"objektarten": [], "vertragsart": "alle"}'::jsonb not null,
  bloecke jsonb default '[]'::jsonb not null,
  html text,
  status text default 'entwurf'::text not null,
  test_an text,
  test_gesendet_am timestamp with time zone,
  gesendet_am timestamp with time zone,
  empfaenger_anzahl integer,
  gesendet_anzahl integer,
  fehler_anzahl integer,
  erstellt_von uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.newsletter_versand (
  id uuid default gen_random_uuid() not null,
  kampagne_id uuid,
  anmeldung_id uuid,
  email text not null,
  name text,
  status text default 'gesendet'::text not null,
  fehler text,
  resend_id text,
  gesendet_am timestamp with time zone default now() not null
);

create table public.objekt_status_vorschlag (
  immobilie_id uuid not null,
  immo_nr text,
  adresse text,
  status_alt text,
  vorschlag text,
  letzte_aktivitaet timestamp with time zone,
  signale text,
  erstellt_am timestamp with time zone default now(),
  angewendet_am timestamp with time zone
);

create table public.onoffice_benutzer_zuordnung (
  onoffice_benutzer text not null,
  profil_id uuid,
  bemerkung text,
  updated_at timestamp with time zone default now() not null
);

create table public.onoffice_expose_pruefung (
  onoffice_adresse_id bigint not null,
  geprueft_am timestamp with time zone default now() not null
);

create table public.onoffice_expose_versand (
  id uuid default gen_random_uuid() not null,
  agentslog_id bigint not null,
  onoffice_adresse_id bigint not null,
  onoffice_objekt_id bigint,
  kontakt_id uuid,
  immobilie_id uuid,
  email text,
  name text,
  gesendet_am timestamp with time zone not null,
  bestaetigt_am timestamp with time zone,
  heruntergeladen_am timestamp with time zone,
  benutzer text,
  portal_freigabe_id uuid,
  erinnerung_am timestamp with time zone,
  ignoriert boolean default false not null,
  zuletzt_geprueft timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
);

create table public.onoffice_status_log (
  id bigint default nextval('onoffice_status_log_id_seq'::regclass) not null,
  lauf text,
  immobilie_id uuid,
  onoffice_id text,
  immo_nr text,
  world_status text,
  oo_status text,
  oo_status2 text,
  ok boolean,
  meldung text,
  created_at timestamp with time zone default now()
);

create table public.portal_einstellungen (
  schluessel text not null,
  wert jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.projekt_datei_freigaben (
  id uuid default gen_random_uuid() not null,
  projekt_id uuid not null,
  datei_id uuid not null,
  zugang_id uuid not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  benachrichtigt boolean default false not null
);

alter sequence public.onoffice_status_log_id_seq owned by public.onoffice_status_log.id;

-- --------------------------------------------- 39 neue Spalten, 16 Tabellen
alter table public.checkliste_vorlagen add column if not exists objektart text;
alter table public.eigentuemer_dokumente add column if not exists immobilie_datei_id uuid;
alter table public.eigentuemer_einladungen add column if not exists erinnert_am timestamp with time zone;
alter table public.eigentuemer_einladungen add column if not exists erinnerungen integer default 0 not null;
alter table public.eigentuemer_einladungen add column if not exists versandweg text;
alter table public.eigentuemer_einladungen add column if not exists letzter_fehler text;
alter table public.eigentuemer_personen add column if not exists kontakt_id uuid;
alter table public.expose_freigaben add column if not exists landing boolean default false not null;
alter table public.expose_freigaben add column if not exists abgesagt_am timestamp with time zone;
alter table public.expose_freigaben add column if not exists absage_grund text;
alter table public.expose_freigaben add column if not exists widerrufen_am timestamp with time zone;
alter table public.expose_freigaben add column if not exists absage_text text;
alter table public.immobilie_datei add column if not exists titel_quelle text;
alter table public.immobilie_datei add column if not exists bild_gruppe text;
alter table public.immobilie_wissen add column if not exists interessenten_freigabe boolean default false not null;
alter table public.kontakte add column if not exists newsletter_opt_in_am timestamp with time zone;
alter table public.kontakte add column if not exists newsletter_quelle text;
alter table public.kontakte add column if not exists personen_typ text default 'einzel'::text not null;
alter table public.kontakte add column if not exists weitere_personen jsonb default '[]'::jsonb not null;
alter table public.mail_ordner add column if not exists geprueft_am timestamp with time zone;
alter table public.mail_ordner add column if not exists rueckstand_uid bigint;
alter table public.mail_versendet add column if not exists automatisch boolean default false not null;
alter table public.notar_laufzettel add column if not exists immobilie_id uuid;
alter table public.notar_laufzettel add column if not exists kontakt_ids uuid[] default '{}'::uuid[] not null;
alter table public.profiles add column if not exists kalender_farbe text;
alter table public.profiles add column if not exists signatur text;
alter table public.projekt_dateien add column if not exists freigegeben boolean default true not null;
alter table public.projekt_dateien add column if not exists freigegeben_am timestamp with time zone;
alter table public.projekt_dateien add column if not exists freigegeben_von uuid;
alter table public.projekt_zugaenge add column if not exists kontakt_id uuid;
alter table public.projekt_zugaenge add column if not exists notiz text;
alter table public.projekt_zugaenge add column if not exists zurueckgetreten_am timestamp with time zone;
alter table public.projekt_zugaenge add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.termine add column if not exists eigentuemer_kontakt_id uuid;
alter table public.termine add column if not exists eigentuemer_sichtbar boolean default true not null;
alter table public.termine add column if not exists eigentuemer_bestaetigung_am timestamp with time zone;
alter table public.termine add column if not exists eigentuemer_bestaetigung_mail_id uuid;
alter table public.todos add column if not exists kontakt_telefon text;
alter table public.todos add column if not exists kontakt_email text;

-- Nachtrag: die sechs neutralisierten Tabellen waren zunaechst aus dem
-- Spaltenvergleich ausgeschlossen. Nachgeprueft, sieben Spalten fehlten.
-- Keine Marken-Inhalte: alle sieben ohne Vorgabewert oder mit leerem Array.
alter table public.firma_stammdaten add column if not exists marken_name text;
alter table public.firma_stammdaten add column if not exists fax text;
alter table public.firma_stammdaten add column if not exists kammer text;
alter table public.firma_stammdaten add column if not exists aufsichtsbehoerde text;
alter table public.firma_stammdaten add column if not exists rechtshinweis text;
alter table public.reservierungen_neubau add column if not exists immobilie_id uuid;
alter table public.reservierungen_neubau add column if not exists kaeufer_kontakt_ids uuid[] default '{}'::uuid[] not null;
