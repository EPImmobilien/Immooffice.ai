-- Row-Level-Security und Tabellenrechte der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: 45-rls-und-rechte.sql
--
-- RLS fuer 166 Tabellen. Die 167. — suchkriterien_lauf — hat in der
-- Vorlage kein RLS; hier ist die Zeile auskommentiert und als Befund
-- gekennzeichnet, weil das Einschalten ohne passende Richtlinie jeden
-- Zugriff sperrt. Entscheidung dazu steht in docs/STATUS.md, Abschnitt 6.


-- Row-Level-Security einschalten.
--
-- 166 der 167 Tabellen der Vorlage haben RLS. Die Ausnahme ist unten benannt
-- und ist ein Sicherheitsbefund, keine Absicht: anon hat in einem
-- Supabase-Projekt volle Tabellenrechte, der Schutz haengt allein an RLS.

alter table public.akq_aktivitaeten enable row level security;
alter table public.akq_automation_lauf enable row level security;
alter table public.akq_automationen enable row level security;
alter table public.akq_eingang_log enable row level security;
alter table public.akq_einstellungen enable row level security;
alter table public.akq_kampagnen enable row level security;
alter table public.akq_lead_historie enable row level security;
alter table public.akq_leads enable row level security;
alter table public.akq_mail_leads enable row level security;
alter table public.akq_mail_regeln enable row level security;
alter table public.akq_pipelines enable row level security;
alter table public.akq_quellen enable row level security;
alter table public.akq_stufen enable row level security;
alter table public.akq_vorlagen enable row level security;
alter table public.aktivitaeten enable row level security;
alter table public.aktivitaets_log enable row level security;
alter table public.amt_adressen enable row level security;
alter table public.amt_vorlage enable row level security;
alter table public.amt_zusaetzliche_regionen enable row level security;
alter table public.arbeitszeit_modelle enable row level security;
alter table public.arbeitszeit_stempel enable row level security;
alter table public.arbeitszeit_tage enable row level security;
alter table public.aufgaben enable row level security;
alter table public.bewerber_antworten enable row level security;
alter table public.bewerber_einladungen enable row level security;
alter table public.bewertungen enable row level security;
alter table public.briefe enable row level security;
alter table public.checkliste_items enable row level security;
alter table public.checkliste_vorlagen enable row level security;
alter table public.checkliste_vorlagen_items enable row level security;
alter table public.dashboard_gesehen enable row level security;
alter table public.dokumente enable row level security;
alter table public.ea_accounts enable row level security;
alter table public.ea_events enable row level security;
alter table public.ea_orders enable row level security;
alter table public.eigentuemer enable row level security;
alter table public.eigentuemer_benachrichtigung_queue enable row level security;
alter table public.eigentuemer_dokumente enable row level security;
alter table public.eigentuemer_einladungen enable row level security;
alter table public.eigentuemer_nachrichten enable row level security;
alter table public.eigentuemer_objekte enable row level security;
alter table public.eigentuemer_personen enable row level security;
alter table public.energieausweis_anfragen enable row level security;
alter table public.expose_debug enable row level security;
alter table public.expose_entwuerfe enable row level security;
alter table public.expose_freigaben enable row level security;
alter table public.external_credentials enable row level security;
alter table public.external_credentials_audit enable row level security;
alter table public.fehler_protokoll enable row level security;
alter table public.finanzierungs_annahmen enable row level security;
alter table public.firma_kennzahlen enable row level security;
alter table public.firma_stammdaten enable row level security;
alter table public.geo_cache enable row level security;
alter table public.immobilie_datei enable row level security;
alter table public.immobilie_eigentuemer enable row level security;
alter table public.immobilie_fahrt_cache enable row level security;
alter table public.immobilie_grundstueck enable row level security;
alter table public.immobilie_kosten_einstellung enable row level security;
alter table public.immobilie_kosten_position enable row level security;
alter table public.immobilie_onedrive enable row level security;
alter table public.immobilie_portal_status enable row level security;
alter table public.immobilie_wissen enable row level security;
alter table public.immobilien enable row level security;
alter table public.jotform_formulare enable row level security;
alter table public.ki_bildbearbeitung_log enable row level security;
alter table public.ki_pruefungen enable row level security;
alter table public.kontakt_objekt enable row level security;
alter table public.kontakte enable row level security;
alter table public.kosten_saetze enable row level security;
alter table public.liquid_imports enable row level security;
alter table public.liquid_kategorisierung enable row level security;
alter table public.liquid_konten enable row level security;
alter table public.liquid_settings enable row level security;
alter table public.liquid_szenarien enable row level security;
alter table public.liquid_transaktionen enable row level security;
alter table public.mail_absender_onedrive enable row level security;
alter table public.mail_abwesenheit_log enable row level security;
alter table public.mail_blockierte_absender enable row level security;
alter table public.mail_eigene_ordner enable row level security;
alter table public.mail_eingang enable row level security;
alter table public.mail_kategorien enable row level security;
alter table public.mail_ki_log enable row level security;
alter table public.mail_ordner enable row level security;
alter table public.mail_postfaecher enable row level security;
alter table public.mail_regeln enable row level security;
alter table public.mail_versendet enable row level security;
alter table public.mail_vorlagen enable row level security;
alter table public.marketing enable row level security;
alter table public.marketing_print_vorlagen enable row level security;
alter table public.mietanfragen enable row level security;
alter table public.mietvertraege enable row level security;
alter table public.mietvertrag_ordner enable row level security;
alter table public.mpe_bausteine enable row level security;
alter table public.news_briefings enable row level security;
alter table public.notar_laufzettel enable row level security;
alter table public.notiz_tags enable row level security;
alter table public.notizen enable row level security;
alter table public.objektaufnahme_fotos enable row level security;
alter table public.objektaufnahmen enable row level security;
alter table public.objektnachweise enable row level security;
alter table public.onoffice_adressen enable row level security;
alter table public.onoffice_diagnose enable row level security;
alter table public.onoffice_export_log enable row level security;
alter table public.onoffice_feld_werte enable row level security;
alter table public.onoffice_felder enable row level security;
alter table public.onoffice_import_log enable row level security;
alter table public.onoffice_objekte enable row level security;
alter table public.onoffice_schreib_felder enable row level security;
alter table public.onoffice_sync_log enable row level security;
alter table public.plz_region enable row level security;
alter table public.portal_diagnose enable row level security;
alter table public.portal_zugaenge enable row level security;
alter table public.profiles enable row level security;
alter table public.projekt_aktivitaeten enable row level security;
alter table public.projekt_anfragen enable row level security;
alter table public.projekt_dateien enable row level security;
alter table public.projekt_einheiten enable row level security;
alter table public.projekt_kontakte enable row level security;
alter table public.projekt_kunden_dateien enable row level security;
alter table public.projekt_maengel enable row level security;
alter table public.projekt_merkliste enable row level security;
alter table public.projekt_nachrichten enable row level security;
alter table public.projekt_ordner enable row level security;
alter table public.projekt_updates enable row level security;
alter table public.projekt_zahlungsplan enable row level security;
alter table public.projekt_zugaenge enable row level security;
alter table public.projekte enable row level security;
alter table public.provision_tracker enable row level security;
alter table public.push_einstellungen enable row level security;
alter table public.push_geraete enable row level security;
alter table public.push_log enable row level security;
alter table public.push_termin_erinnerungen enable row level security;
alter table public.radar_aktivitaeten enable row level security;
alter table public.radar_historie enable row level security;
alter table public.radar_objekte enable row level security;
alter table public.radar_suchauftraege enable row level security;
alter table public.rechnung_kunden enable row level security;
alter table public.rechnung_nummern_sequence enable row level security;
alter table public.rechnung_positionen enable row level security;
alter table public.rechnungen enable row level security;
alter table public.rechnungen_audit enable row level security;
alter table public.reservierungen_neubau enable row level security;
alter table public.rundgaenge enable row level security;
alter table public.rundgang_hotspots enable row level security;
alter table public.rundgang_szenen enable row level security;
alter table public.signatur_empfaenger enable row level security;
alter table public.signatur_events enable row level security;
alter table public.signatur_vorgaenge enable row level security;
-- alter table public.suchkriterien_lauf enable row level security;  -- BEFUND: in der Vorlage aus, siehe docs/STATUS.md
alter table public.suchkriterien_treffer enable row level security;
alter table public.termin_einladungen enable row level security;
alter table public.termine enable row level security;
alter table public.todo_kommentar enable row level security;
alter table public.todo_schritt enable row level security;
alter table public.todo_verknuepfung enable row level security;
alter table public.todo_vorgang enable row level security;
alter table public.todo_vorlage enable row level security;
alter table public.todo_vorlage_schritt enable row level security;
alter table public.todos enable row level security;
alter table public.uebergabeprotokoll enable row level security;
alter table public.upload_benachrichtigungen enable row level security;
alter table public.urlaub_hinweise enable row level security;
alter table public.verbrauchsausweis_antraege enable row level security;
alter table public.vermerke enable row level security;
alter table public.vertraege enable row level security;
alter table public.waechter_status enable row level security;
alter table public.web_leads enable row level security;

-- Tabellenrechte wie in der Vorlage (Supabase-Standard). Der Zugriffsschutz
-- liegt vollstaendig in den Richtlinien, nicht in diesen Rechten.
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
