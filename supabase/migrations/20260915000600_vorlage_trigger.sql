-- Trigger der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: 40-trigger.sql
--
-- 54 Trigger.


CREATE TRIGGER akq_aktivitaeten_touch BEFORE UPDATE ON public.akq_aktivitaeten FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_automation_lauf_touch BEFORE UPDATE ON public.akq_automation_lauf FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_automationen_touch BEFORE UPDATE ON public.akq_automationen FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_einstellungen_touch BEFORE UPDATE ON public.akq_einstellungen FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_kampagnen_touch BEFORE UPDATE ON public.akq_kampagnen FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_leads_touch BEFORE UPDATE ON public.akq_leads FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_mail_leads_touch BEFORE UPDATE ON public.akq_mail_leads FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_mail_regeln_touch BEFORE UPDATE ON public.akq_mail_regeln FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_pipelines_touch BEFORE UPDATE ON public.akq_pipelines FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_quellen_touch BEFORE UPDATE ON public.akq_quellen FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_stufen_touch BEFORE UPDATE ON public.akq_stufen FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER akq_vorlagen_touch BEFORE UPDATE ON public.akq_vorlagen FOR EACH ROW EXECUTE FUNCTION akq_touch_updated_at();
CREATE TRIGGER arbeitszeit_tage_stempel_tr BEFORE UPDATE ON public.arbeitszeit_tage FOR EACH ROW EXECUTE FUNCTION arbeitszeit_tage_stempel();
CREATE TRIGGER trg_cli_updated BEFORE UPDATE ON public.checkliste_items FOR EACH ROW EXECUTE FUNCTION set_checkliste_items_updated_at();
CREATE TRIGGER trg_eigentuemer_updated BEFORE UPDATE ON public.eigentuemer FOR EACH ROW EXECUTE FUNCTION set_eigentuemer_updated_at();
CREATE TRIGGER trg_eigentuemer_dokument_queue AFTER INSERT ON public.eigentuemer_dokumente FOR EACH ROW EXECUTE FUNCTION eigentuemer_dokument_queue_handler();
CREATE TRIGGER trg_eigentuemer_dokumente_updated BEFORE UPDATE ON public.eigentuemer_dokumente FOR EACH ROW EXECUTE FUNCTION set_eigentuemer_dokumente_updated_at();
CREATE TRIGGER trg_eigentuemer_personen_updated BEFORE UPDATE ON public.eigentuemer_personen FOR EACH ROW EXECUTE FUNCTION set_eigentuemer_personen_updated_at();
CREATE TRIGGER trg_expose_entwuerfe_updated_at BEFORE UPDATE ON public.expose_entwuerfe FOR EACH ROW EXECUTE FUNCTION set_expose_entwuerfe_updated_at();
CREATE TRIGGER trg_expose_freigabe_vermerk AFTER UPDATE ON public.expose_freigaben FOR EACH ROW EXECUTE FUNCTION expose_freigabe_vermerk();
CREATE TRIGGER trg_expose_freigabe_vermerk_neu AFTER INSERT ON public.expose_freigaben FOR EACH ROW EXECUTE FUNCTION expose_freigabe_vermerk_neu();
CREATE TRIGGER trg_external_credentials_updated_at BEFORE UPDATE ON public.external_credentials FOR EACH ROW EXECUTE FUNCTION update_external_credentials_timestamp();
CREATE TRIGGER trg_immobilie_datei_werbebild BEFORE INSERT ON public.immobilie_datei FOR EACH ROW EXECUTE FUNCTION immobilie_datei_werbebild_erkennen();
CREATE TRIGGER immobilien_updated_at BEFORE UPDATE ON public.immobilien FOR EACH ROW EXECUTE FUNCTION trg_immobilien_updated_at();
CREATE TRIGGER trg_immo_nr_setzen BEFORE INSERT ON public.immobilien FOR EACH ROW EXECUTE FUNCTION immo_nr_setzen();
CREATE TRIGGER trg_kontakt_objekt_suchkriterium AFTER INSERT OR UPDATE OF rolle ON public.kontakt_objekt FOR EACH ROW EXECUTE FUNCTION suchkriterium_erfuellt_setzen();
CREATE TRIGGER trg_kontakte_updated_at BEFORE UPDATE ON public.kontakte FOR EACH ROW EXECUTE FUNCTION kontakte_updated_at();
CREATE TRIGGER mao_updated_at BEFORE UPDATE ON public.mail_absender_onedrive FOR EACH ROW EXECUTE FUNCTION mao_set_updated_at();
CREATE TRIGGER mail_eingang_portal_importbericht AFTER INSERT ON public.mail_eingang FOR EACH ROW EXECUTE FUNCTION trg_portal_importbericht();
CREATE TRIGGER trg_mail_anfrage_vermerk AFTER UPDATE OF anfrage_status ON public.mail_eingang FOR EACH ROW EXECUTE FUNCTION mail_anfrage_vermerk();
CREATE TRIGGER trg_mail_eingang_anfrage_vorfilter BEFORE INSERT ON public.mail_eingang FOR EACH ROW EXECUTE FUNCTION mail_eingang_anfrage_vorfilter();
CREATE TRIGGER trg_mail_eingang_push AFTER INSERT ON public.mail_eingang FOR EACH ROW EXECUTE FUNCTION mail_eingang_push();
CREATE TRIGGER trg_mail_eingang_regeln BEFORE INSERT ON public.mail_eingang FOR EACH ROW EXECUTE FUNCTION mail_regeln_anwenden();
CREATE TRIGGER trg_mail_postfaecher_updated_at BEFORE UPDATE ON public.mail_postfaecher FOR EACH ROW EXECUTE FUNCTION set_updated_at_mail_postfaecher();
CREATE TRIGGER trg_marketing_print_vorlagen_updated_at BEFORE UPDATE ON public.marketing_print_vorlagen FOR EACH ROW EXECUTE FUNCTION set_marketing_print_vorlagen_updated_at();
CREATE TRIGGER trg_mietanfragen_updated_at BEFORE UPDATE ON public.mietanfragen FOR EACH ROW EXECUTE FUNCTION set_updated_at_mietanfragen();
CREATE TRIGGER trg_notar_laufzettel_updated_at BEFORE UPDATE ON public.notar_laufzettel FOR EACH ROW EXECUTE FUNCTION set_notar_laufzettel_updated_at();
CREATE TRIGGER trg_notiz_wiederholung AFTER UPDATE ON public.notizen FOR EACH ROW EXECUTE FUNCTION notiz_wiederholung_anlegen();
CREATE TRIGGER trg_objektaufnahmen_updated BEFORE UPDATE ON public.objektaufnahmen FOR EACH ROW EXECUTE FUNCTION objektaufnahmen_set_updated_at();
CREATE TRIGGER profiles_schutz_privilegien_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_schutz_privilegien();
CREATE TRIGGER radar_objekte_touch BEFORE UPDATE ON public.radar_objekte FOR EACH ROW EXECUTE FUNCTION radar_touch();
CREATE TRIGGER trg_rechnung_kunden_updated BEFORE UPDATE ON public.rechnung_kunden FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pos_summen_neu AFTER INSERT OR DELETE OR UPDATE ON public.rechnung_positionen FOR EACH ROW EXECUTE FUNCTION rechnung_positionen_aenderung();
CREATE TRIGGER trg_position_unveraenderlich BEFORE INSERT OR DELETE OR UPDATE ON public.rechnung_positionen FOR EACH ROW EXECUTE FUNCTION rechnung_position_unveraenderlich_check();
CREATE TRIGGER trg_rechnung_delete_check BEFORE DELETE ON public.rechnungen FOR EACH ROW EXECUTE FUNCTION rechnung_delete_check();
CREATE TRIGGER trg_rechnung_unveraenderlich BEFORE UPDATE ON public.rechnungen FOR EACH ROW EXECUTE FUNCTION rechnung_unveraenderlich_check();
CREATE TRIGGER trg_reservierung_status_sync AFTER INSERT OR UPDATE OF status ON public.reservierungen_neubau FOR EACH ROW EXECUTE FUNCTION reservierung_status_sync();
CREATE TRIGGER trg_reservierungen_updated_at BEFORE UPDATE ON public.reservierungen_neubau FOR EACH ROW EXECUTE FUNCTION set_updated_at_reservierungen();
CREATE TRIGGER trg_rundgaenge_updated_at BEFORE UPDATE ON public.rundgaenge FOR EACH ROW EXECUTE FUNCTION set_rundgaenge_updated_at();
CREATE TRIGGER trg_signatur_reservierung_abschluss AFTER INSERT OR UPDATE OF status ON public.signatur_vorgaenge FOR EACH ROW EXECUTE FUNCTION signatur_reservierung_abschluss();
CREATE TRIGGER trg_todo_nach_erledigung AFTER UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION todo_nach_erledigung();
CREATE TRIGGER trg_todos_touch BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION todos_touch();
CREATE TRIGGER trg_uebergabeprotokoll_updated_at BEFORE UPDATE ON public.uebergabeprotokoll FOR EACH ROW EXECUTE FUNCTION set_uebergabeprotokoll_updated_at();
CREATE TRIGGER trg_va_antraege_touch BEFORE UPDATE ON public.verbrauchsausweis_antraege FOR EACH ROW EXECUTE FUNCTION va_antraege_touch();
