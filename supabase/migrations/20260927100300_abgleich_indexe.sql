-- Abgleich mit der Vorlage: Indexe vom 26.09.2026
--
-- 23 neue Indexe, keiner geaendert, keiner ueberzaehlig.
--
-- newsletter_anmeldungen hat in der Vorlage zwei Indexe mit demselben Inhalt
-- (kontakt_id): einmal ..._kontakt_id_idx, einmal ..._kontakt_idx. Das ist
-- Doppelarbeit, aber der Auftrag sagt „Funktionsumfang = Vorlage Stand heute";
-- deshalb bleiben beide. Wenn die Vorlage einen davon loescht, folgt der Fork.
create index besichtigung_absagen_eig_kontakt_idx on public.besichtigung_absagen using btree (eigentuemer_kontakt_id);
create index besichtigung_absagen_immobilie_idx on public.besichtigung_absagen using btree (immobilie_id);
create index eigentuemer_personen_kontakt_id_idx on public.eigentuemer_personen using btree (kontakt_id);
create index idx_oev_offen on public.onoffice_expose_versand using btree (bestaetigt_am, ignoriert, gesendet_am desc);
create index kontakt_emails_email_idx on public.kontakt_emails using btree (lower(email));
create unique index kontakt_emails_eindeutig on public.kontakt_emails using btree (kontakt_id, lower(email));
create index landing_faq_immobilie_idx on public.landing_faq using btree (immobilie_id, aktiv, sortierung);
create unique index landing_faq_katalog_je_objekt on public.landing_faq using btree (immobilie_id, katalog_schluessel);
create index landing_fragen_immobilie_idx on public.landing_fragen using btree (immobilie_id, created_at desc);
create index landing_fragen_offen_idx on public.landing_fragen using btree (created_at) where (weitergeleitet and (makler_info_am is null));
create index landing_wuensche_immobilie_idx on public.landing_besichtigungswuensche using btree (immobilie_id, status);
create index mail_termineinladungen_mail_idx on public.mail_termineinladungen using btree (mail_id);
create index mail_termineinladungen_uid_idx on public.mail_termineinladungen using btree (uid);
create index newsletter_anmeldungen_email_idx on public.newsletter_anmeldungen using btree (lower(email));
create index newsletter_anmeldungen_kontakt_id_idx on public.newsletter_anmeldungen using btree (kontakt_id);
create index newsletter_anmeldungen_kontakt_idx on public.newsletter_anmeldungen using btree (kontakt_id);
create unique index newsletter_anmeldungen_token_idx on public.newsletter_anmeldungen using btree (abmelde_token);
create index newsletter_versand_kampagne_idx on public.newsletter_versand using btree (kampagne_id);
create index notar_laufzettel_immobilie_id_idx on public.notar_laufzettel using btree (immobilie_id);
create index projekt_datei_freigaben_offen_idx on public.projekt_datei_freigaben using btree (benachrichtigt, created_at);
create index projekt_zugaenge_kontakt_idx on public.projekt_zugaenge using btree (kontakt_id);
create index reservierungen_neubau_immobilie_id_idx on public.reservierungen_neubau using btree (immobilie_id);
create index termine_eigentuemer_kontakt_idx on public.termine using btree (eigentuemer_kontakt_id) where (eigentuemer_kontakt_id is not null);
