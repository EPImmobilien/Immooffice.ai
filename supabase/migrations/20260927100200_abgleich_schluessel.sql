-- Abgleich mit der Vorlage: Schluessel, Pruefungen, Fremdschluessel vom 26.09.2026
--
-- Gehoert zu 20260927100100_abgleich_tabellen.sql. Drei bestehende
-- Pruefbedingungen haben sich inhaltlich geaendert — nur bei diesen dreien wird
-- vorher geloescht, sonst wird ausschliesslich ergaenzt.
--
-- akq_vorlagen_sicherung hat auch in der Vorlage keine Schluessel; das ist eine
-- Sicherungstabelle und bleibt so.

-- -------------------------------------------------- Primaer- und Eindeutigkeit
alter table public.besichtigung_absagen add constraint besichtigung_absagen_pkey primary key (id);
alter table public.immobilie_datei_geloescht add constraint immobilie_datei_geloescht_pkey primary key (immobilie_id, onoffice_datei_id);
alter table public.immobilie_titelbild_wahl add constraint immobilie_titelbild_wahl_pkey primary key (immobilie_id);
alter table public.kontakt_emails add constraint kontakt_emails_pkey primary key (id);
alter table public.landing_besichtigungswuensche add constraint landing_besichtigungswuensche_pkey primary key (id);
alter table public.landing_faq add constraint landing_faq_pkey primary key (id);
alter table public.landing_fragen add constraint landing_fragen_pkey primary key (id);
alter table public.mail_rechnung_ziele add constraint mail_rechnung_ziele_pkey primary key (id);
alter table public.mail_termineinladungen add constraint mail_termineinladungen_pkey primary key (id);
alter table public.newsletter_anmeldungen add constraint newsletter_anmeldungen_pkey primary key (id);
alter table public.newsletter_kampagnen add constraint newsletter_kampagnen_pkey primary key (id);
alter table public.newsletter_versand add constraint newsletter_versand_pkey primary key (id);
alter table public.objekt_status_vorschlag add constraint objekt_status_vorschlag_pkey primary key (immobilie_id);
alter table public.onoffice_benutzer_zuordnung add constraint onoffice_benutzer_zuordnung_pkey primary key (onoffice_benutzer);
alter table public.onoffice_expose_pruefung add constraint onoffice_expose_pruefung_pkey primary key (onoffice_adresse_id);
alter table public.onoffice_expose_versand add constraint onoffice_expose_versand_pkey primary key (id);
alter table public.onoffice_status_log add constraint onoffice_status_log_pkey primary key (id);
alter table public.portal_einstellungen add constraint portal_einstellungen_pkey primary key (schluessel);
alter table public.projekt_datei_freigaben add constraint projekt_datei_freigaben_pkey primary key (id);

alter table public.onoffice_expose_versand add constraint onoffice_expose_versand_agentslog_id_key unique (agentslog_id);
alter table public.projekt_datei_freigaben add constraint projekt_datei_freigaben_datei_id_zugang_id_key unique (datei_id, zugang_id);

-- ------------------------------------------------------------- neue Pruefungen
alter table public.immobilie_titelbild_wahl add constraint immobilie_titelbild_wahl_quelle_check check ((quelle = any (array['manuell'::text, 'onoffice'::text])));
alter table public.kontakte add constraint kontakte_personen_typ_check check ((personen_typ = any (array['einzel'::text, 'eheleute'::text, 'erben'::text, 'firma'::text])));
alter table public.kontakte add constraint kontakte_weitere_personen_check check (((jsonb_typeof(weitere_personen) = 'array'::text) and (jsonb_array_length(weitere_personen) <= 8)));
alter table public.profiles add constraint profiles_kalender_farbe_form check (((kalender_farbe is null) or (kalender_farbe ~ '^#[0-9a-fA-F]{6}$'::text)));

-- ------------------------------------------------ drei erweiterte Pruefungen
-- mail_eingang.ordner nimmt jetzt zusaetzlich 'imap:%' an — die Vorlage holt
-- Ordner nicht mehr nur ueber Exchange, sondern auch ueber IMAP.
alter table public.mail_eingang drop constraint if exists mail_eingang_ordner_check;
alter table public.mail_eingang add constraint mail_eingang_ordner_check check (((ordner = any (array['posteingang'::text, 'gesendet'::text, 'entwuerfe'::text, 'archiv'::text, 'spam'::text, 'papierkorb'::text])) or (ordner like 'eo:%'::text) or (ordner like 'imap:%'::text)));

-- projekt_dateien.sichtbarkeit kennt jetzt 'ausgewaehlt' — dazu die neue
-- Tabelle projekt_datei_freigaben.
alter table public.projekt_dateien drop constraint if exists projekt_dateien_sichtbarkeit_check;
alter table public.projekt_dateien add constraint projekt_dateien_sichtbarkeit_check check ((sichtbarkeit = any (array['oeffentlich'::text, 'interessent'::text, 'kaeufer'::text, 'ausgewaehlt'::text])));

-- projekt_zugaenge.rolle kennt jetzt 'zurueckgetreten' — dazu die neue Spalte
-- zurueckgetreten_am.
alter table public.projekt_zugaenge drop constraint if exists projekt_zugaenge_rolle_check;
alter table public.projekt_zugaenge add constraint projekt_zugaenge_rolle_check check ((rolle = any (array['interessent'::text, 'reserviert'::text, 'kaeufer'::text, 'zurueckgetreten'::text])));

-- --------------------------------------------------------- neue Fremdschluessel
alter table public.eigentuemer_dokumente add constraint eigentuemer_dokumente_immobilie_datei_id_fkey foreign key (immobilie_datei_id) references public.immobilie_datei(id) on delete set null;
alter table public.eigentuemer_personen add constraint eigentuemer_personen_kontakt_id_fkey foreign key (kontakt_id) references public.kontakte(id) on delete set null;
alter table public.immobilie_datei_geloescht add constraint immobilie_datei_geloescht_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete cascade;
alter table public.immobilie_titelbild_wahl add constraint immobilie_titelbild_wahl_datei_id_fkey foreign key (datei_id) references public.immobilie_datei(id) on delete set null;
alter table public.immobilie_titelbild_wahl add constraint immobilie_titelbild_wahl_gesetzt_von_fkey foreign key (gesetzt_von) references public.profiles(id) on delete set null;
alter table public.immobilie_titelbild_wahl add constraint immobilie_titelbild_wahl_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete cascade;
alter table public.kontakt_emails add constraint kontakt_emails_kontakt_id_fkey foreign key (kontakt_id) references public.kontakte(id) on delete cascade;
alter table public.landing_besichtigungswuensche add constraint landing_besichtigungswuensche_freigabe_id_fkey foreign key (freigabe_id) references public.expose_freigaben(id) on delete cascade;
alter table public.landing_besichtigungswuensche add constraint landing_besichtigungswuensche_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete cascade;
alter table public.landing_faq add constraint landing_faq_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete cascade;
alter table public.landing_fragen add constraint landing_fragen_freigabe_id_fkey foreign key (freigabe_id) references public.expose_freigaben(id) on delete cascade;
alter table public.landing_fragen add constraint landing_fragen_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete cascade;
alter table public.mail_rechnung_ziele add constraint mail_rechnung_ziele_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.mail_termineinladungen add constraint mail_termineinladungen_beantwortet_von_fkey foreign key (beantwortet_von) references public.profiles(id) on delete set null;
alter table public.mail_termineinladungen add constraint mail_termineinladungen_mail_id_fkey foreign key (mail_id) references public.mail_eingang(id) on delete cascade;
alter table public.mail_termineinladungen add constraint mail_termineinladungen_termin_id_fkey foreign key (termin_id) references public.termine(id) on delete set null;
alter table public.newsletter_anmeldungen add constraint newsletter_anmeldungen_kontakt_id_fkey foreign key (kontakt_id) references public.kontakte(id) on delete set null;
alter table public.newsletter_versand add constraint newsletter_versand_kampagne_id_fkey foreign key (kampagne_id) references public.newsletter_kampagnen(id) on delete cascade;
alter table public.notar_laufzettel add constraint notar_laufzettel_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete set null;
alter table public.objekt_status_vorschlag add constraint objekt_status_vorschlag_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete cascade;
alter table public.onoffice_benutzer_zuordnung add constraint onoffice_benutzer_zuordnung_profil_id_fkey foreign key (profil_id) references public.profiles(id) on delete set null;
alter table public.onoffice_expose_versand add constraint onoffice_expose_versand_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete set null;
alter table public.onoffice_expose_versand add constraint onoffice_expose_versand_kontakt_id_fkey foreign key (kontakt_id) references public.kontakte(id) on delete set null;
alter table public.onoffice_expose_versand add constraint onoffice_expose_versand_portal_freigabe_id_fkey foreign key (portal_freigabe_id) references public.expose_freigaben(id) on delete set null;
alter table public.projekt_datei_freigaben add constraint projekt_datei_freigaben_datei_id_fkey foreign key (datei_id) references public.projekt_dateien(id) on delete cascade;
alter table public.projekt_datei_freigaben add constraint projekt_datei_freigaben_projekt_id_fkey foreign key (projekt_id) references public.projekte(id) on delete cascade;
alter table public.projekt_datei_freigaben add constraint projekt_datei_freigaben_zugang_id_fkey foreign key (zugang_id) references public.projekt_zugaenge(id) on delete cascade;
alter table public.projekt_zugaenge add constraint projekt_zugaenge_kontakt_id_fkey foreign key (kontakt_id) references public.kontakte(id) on delete set null;
alter table public.reservierungen_neubau add constraint reservierungen_neubau_immobilie_id_fkey foreign key (immobilie_id) references public.immobilien(id) on delete set null;
