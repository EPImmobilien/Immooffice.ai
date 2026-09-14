-- Richtlinien der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: 50-richtlinien-01..04.sql
--
-- 320 Richtlinien, unveraendert uebernommen. Das bekannte Loch bei
-- signatur_* (jeder Angemeldete liest fremde Token) ist hier bewusst
-- NICHT geflickt: der Fork soll zuerst nachweisbar dasselbe tun wie die
-- Vorlage. Geschlossen wird es in Phase 2.3, wie im Auftrag verlangt.


create policy akq_aktivitaeten_team on public.akq_aktivitaeten for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_automation_lauf_team on public.akq_automation_lauf for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_automationen_team on public.akq_automationen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_eingang_log_team on public.akq_eingang_log for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_einstellungen_team on public.akq_einstellungen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_kampagnen_team on public.akq_kampagnen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_lead_historie_team on public.akq_lead_historie for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_leads_team on public.akq_leads for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_mail_leads_team on public.akq_mail_leads for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_mail_regeln_team on public.akq_mail_regeln for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_pipelines_team on public.akq_pipelines for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_quellen_team on public.akq_quellen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_stufen_team on public.akq_stufen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akq_vorlagen_team on public.akq_vorlagen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy akt_eigentuemer_eigen on public.aktivitaeten for select to public using (((eigentuemer_id = aktueller_eigentuemer_id()) AND (zielgruppe = ANY (ARRAY['eigentuemer'::text, 'beide'::text]))));
create policy akt_eigentuemer_insert on public.aktivitaeten for insert to public with check ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy akt_eigentuemer_update on public.aktivitaeten for update to public using (((eigentuemer_id = aktueller_eigentuemer_id()) AND (zielgruppe = ANY (ARRAY['eigentuemer'::text, 'beide'::text]))));
create policy akt_makler_alles on public.aktivitaeten for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy aktivitaets_log_delete on public.aktivitaets_log for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy aktivitaets_log_insert on public.aktivitaets_log for insert to authenticated with check ((auth.uid() IS NOT NULL));
create policy aktivitaets_log_select on public.aktivitaets_log for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy azm_lesen on public.arbeitszeit_modelle for select to public using (((profil_id = auth.uid()) OR ist_chef()));
create policy azm_schreiben on public.arbeitszeit_modelle for all to public using (ist_chef()) with check (ist_chef());
create policy azs_lesen on public.arbeitszeit_stempel for select to public using (((profil_id = auth.uid()) OR ist_chef()));
create policy azs_schreiben on public.arbeitszeit_stempel for all to public using (((profil_id = auth.uid()) OR ist_chef())) with check (((profil_id = auth.uid()) OR ist_chef()));
create policy azt_lesen on public.arbeitszeit_tage for select to public using (((profil_id = auth.uid()) OR ist_chef()));
create policy azt_schreiben on public.arbeitszeit_tage for all to public using (((profil_id = auth.uid()) OR ist_chef())) with check (((profil_id = auth.uid()) OR ist_chef()));
create policy aufgaben_team on public.aufgaben for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy bewerber_antworten_chef on public.bewerber_antworten for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy bewerber_einladungen_chef on public.bewerber_einladungen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy bewertungen_all_authenticated on public.bewertungen for all to authenticated using (true) with check (true);
create policy bewertungen_delete on public.bewertungen for delete to authenticated using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy makler_briefe on public.briefe for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy cli_eigentuemer_lesen on public.checkliste_items for select to public using ((EXISTS ( SELECT 1
   FROM eigentuemer_objekte eo
  WHERE ((eo.maklervertrag_id = checkliste_items.maklervertrag_id) AND (eo.eigentuemer_id = aktueller_eigentuemer_id())))));
create policy cli_eigentuemer_update on public.checkliste_items for update to public using ((EXISTS ( SELECT 1
   FROM eigentuemer_objekte eo
  WHERE ((eo.maklervertrag_id = checkliste_items.maklervertrag_id) AND (eo.eigentuemer_id = aktueller_eigentuemer_id())))));
create policy cli_makler_alles on public.checkliste_items for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy clv_chef_schreiben on public.checkliste_vorlagen for all to public using ((aktuelle_rolle() = 'chef'::text)) with check ((aktuelle_rolle() = 'chef'::text));
create policy clv_lesen on public.checkliste_vorlagen for select to public using ((auth.role() = 'authenticated'::text));
create policy clvi_chef_schreiben on public.checkliste_vorlagen_items for all to public using ((aktuelle_rolle() = 'chef'::text)) with check ((aktuelle_rolle() = 'chef'::text));
create policy clvi_lesen on public.checkliste_vorlagen_items for select to public using ((auth.role() = 'authenticated'::text));
create policy dashboard_gesehen_eigene on public.dashboard_gesehen for all to public using ((benutzer_id = auth.uid())) with check ((benutzer_id = auth.uid()));
create policy dokumente_all_authenticated on public.dokumente for all to authenticated using (true) with check (true);
create policy eigentuemer_eigen_lesen on public.eigentuemer for select to public using (((user_id = auth.uid()) OR (id = ( SELECT eigentuemer_personen.eigentuemer_id
   FROM eigentuemer_personen
  WHERE ((eigentuemer_personen.user_id = auth.uid()) AND (eigentuemer_personen.aktiv = true))
 LIMIT 1))));
create policy eigentuemer_makler_aendern on public.eigentuemer for update to public using (((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])) OR (user_id = auth.uid())));
create policy eigentuemer_makler_lesen on public.eigentuemer for select to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy eigentuemer_makler_loeschen on public.eigentuemer for delete to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy eigentuemer_makler_schreiben on public.eigentuemer for insert to public with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy ed_eigentuemer_eigen_aendern on public.eigentuemer_dokumente for update to public using (((eigentuemer_id = aktueller_eigentuemer_id()) AND (hochgeladen_von_typ = 'eigentuemer'::text)));
create policy ed_eigentuemer_eigen_lesen on public.eigentuemer_dokumente for select to public using ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy ed_eigentuemer_eigen_schreiben on public.eigentuemer_dokumente for insert to public with check (((eigentuemer_id = aktueller_eigentuemer_id()) AND (hochgeladen_von_typ = 'eigentuemer'::text)));
create policy ed_eigentuemer_freigabe_update on public.eigentuemer_dokumente for update to public using ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy ed_eigentuemer_loeschen on public.eigentuemer_dokumente for delete to public using ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy ed_makler_alles on public.eigentuemer_dokumente for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy einladung_makler_alles on public.eigentuemer_einladungen for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy en_eigentuemer_lesen on public.eigentuemer_nachrichten for select to authenticated using ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy en_makler_lesen on public.eigentuemer_nachrichten for select to authenticated using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy eo_eigentuemer_eigen_lesen on public.eigentuemer_objekte for select to public using ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy eo_makler_alles on public.eigentuemer_objekte for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy ep_eigene_aendern on public.eigentuemer_personen for update to public using ((user_id = auth.uid()));
create policy ep_eigene_lesen on public.eigentuemer_personen for select to public using ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy ep_makler_alles on public.eigentuemer_personen for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy ea_anfragen_aendern on public.energieausweis_anfragen for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy ea_anfragen_lesen on public.energieausweis_anfragen for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy expose_debug_team_read on public.expose_debug for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE (p.id = auth.uid()))));
create policy expose_entwuerfe_delete on public.expose_entwuerfe for delete to public using (((auth.uid() = user_id) OR aktueller_user_ist_chef()));
create policy expose_entwuerfe_insert on public.expose_entwuerfe for insert to public with check ((auth.uid() = user_id));
create policy expose_entwuerfe_select on public.expose_entwuerfe for select to public using ((auth.uid() IS NOT NULL));
create policy expose_entwuerfe_update on public.expose_entwuerfe for update to public using (((auth.uid() = user_id) OR aktueller_user_ist_chef())) with check (((auth.uid() = user_id) OR aktueller_user_ist_chef()));
create policy expose_freigaben_team on public.expose_freigaben for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy credentials_chef_schreiben on public.external_credentials for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))));
create policy credentials_makler_lesen on public.external_credentials for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy credentials_audit_chef_lesen on public.external_credentials_audit for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))));
create policy fehler_protokoll_aendern on public.fehler_protokoll for update to authenticated using (true) with check (true);
create policy fehler_protokoll_lesen on public.fehler_protokoll for select to authenticated using (true);
create policy fehler_protokoll_melden on public.fehler_protokoll for insert to authenticated with check (((benutzer_id IS NULL) OR (benutzer_id = auth.uid())));
create policy fin_annahmen_lesen on public.finanzierungs_annahmen for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy fin_annahmen_schreiben on public.finanzierungs_annahmen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy firma_kennzahlen_lesen on public.firma_kennzahlen for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy firma_kennzahlen_schreiben on public.firma_kennzahlen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy firma_stammdaten_chef on public.firma_stammdaten for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))));
create policy firma_stammdaten_lesen on public.firma_stammdaten for select to authenticated using (((typ = 'standort'::text) OR (inhaber_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy firma_stammdaten_persoenlich_insert on public.firma_stammdaten for insert to authenticated with check (((typ = 'persoenlich'::text) AND (inhaber_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy firma_stammdaten_persoenlich_update on public.firma_stammdaten for update to authenticated using (((typ = 'persoenlich'::text) AND (inhaber_user_id = auth.uid()))) with check (((typ = 'persoenlich'::text) AND (inhaber_user_id = auth.uid())));
create policy geo_cache_team on public.geo_cache for select to authenticated using (true);
create policy immobilie_datei_alle on public.immobilie_datei for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilie_eigentuemer_alle on public.immobilie_eigentuemer for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilie_fahrt_cache_team on public.immobilie_fahrt_cache for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilie_grundstueck_lesen on public.immobilie_grundstueck for select to authenticated using (true);
create policy immobilie_grundstueck_schreiben on public.immobilie_grundstueck for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilie_kosten_einstellung_team on public.immobilie_kosten_einstellung for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilie_kosten_position_team on public.immobilie_kosten_position for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilie_onedrive_team on public.immobilie_onedrive for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilie_portal_status_team on public.immobilie_portal_status for all to authenticated using (true) with check (true);
create policy immobilie_wissen_team on public.immobilie_wissen for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilien_alle_lesen on public.immobilien for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy immobilien_alle_schreiben on public.immobilien for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy jf_makler_alles on public.jotform_formulare for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy ki_bildbearbeitung_log_delete on public.ki_bildbearbeitung_log for delete to authenticated using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy ki_bildbearbeitung_log_insert on public.ki_bildbearbeitung_log for insert to authenticated with check ((auth.uid() IS NOT NULL));
create policy ki_bildbearbeitung_log_select on public.ki_bildbearbeitung_log for select to authenticated using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy ki_pruefungen_team on public.ki_pruefungen for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy kontakt_objekt_team on public.kontakt_objekt for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy kontakte_team on public.kontakte for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy kosten_saetze_chef on public.kosten_saetze for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy kosten_saetze_lesen on public.kosten_saetze for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy liquid_imports_insert on public.liquid_imports for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_imports_select on public.liquid_imports for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_kat_delete on public.liquid_kategorisierung for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_kat_insert on public.liquid_kategorisierung for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_kat_select on public.liquid_kategorisierung for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_kat_update on public.liquid_kategorisierung for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_konten_delete on public.liquid_konten for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_konten_insert on public.liquid_konten for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_konten_select on public.liquid_konten for select to authenticated using (true);
create policy liquid_konten_update on public.liquid_konten for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_settings_select on public.liquid_settings for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_settings_update on public.liquid_settings for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_szen_delete on public.liquid_szenarien for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_szen_insert on public.liquid_szenarien for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_szen_select on public.liquid_szenarien for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_szen_update on public.liquid_szenarien for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_trans_delete on public.liquid_transaktionen for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_trans_insert on public.liquid_transaktionen for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_trans_select on public.liquid_transaktionen for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy liquid_trans_update on public.liquid_transaktionen for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy mao_delete on public.mail_absender_onedrive for delete to public using ((auth.uid() = user_id));
create policy mao_insert on public.mail_absender_onedrive for insert to public with check ((auth.uid() = user_id));
create policy mao_select on public.mail_absender_onedrive for select to public using ((auth.uid() = user_id));
create policy mao_update on public.mail_absender_onedrive for update to public using ((auth.uid() = user_id));
create policy mal_lesen on public.mail_abwesenheit_log for select to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher mp
  WHERE ((mp.id = mail_abwesenheit_log.postfach_id) AND ((mp.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))))))));
create policy mba_einfuegen on public.mail_blockierte_absender for insert to public with check (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mba_lesen on public.mail_blockierte_absender for select to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mba_loeschen on public.mail_blockierte_absender for delete to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy meo_aendern on public.mail_eigene_ordner for update to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy meo_einfuegen on public.mail_eigene_ordner for insert to public with check (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy meo_lesen on public.mail_eigene_ordner for select to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy meo_loeschen on public.mail_eigene_ordner for delete to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mail_eingang_aendern on public.mail_eingang for update to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher mp
  WHERE ((mp.id = mail_eingang.postfach_id) AND ((mp.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))))))));
create policy mail_eingang_einfuegen on public.mail_eingang for insert to public with check (true);
create policy mail_eingang_lesen on public.mail_eingang for select to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher mp
  WHERE ((mp.id = mail_eingang.postfach_id) AND ((mp.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))))))));
create policy mail_eingang_loeschen on public.mail_eingang for delete to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher mp
  WHERE ((mp.id = mail_eingang.postfach_id) AND ((mp.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))))))));
create policy mka_aendern on public.mail_kategorien for update to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mka_einfuegen on public.mail_kategorien for insert to public with check (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mka_lesen on public.mail_kategorien for select to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mka_loeschen on public.mail_kategorien for delete to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mail_ki_log_lesen on public.mail_ki_log for select to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mail_ordner_delete on public.mail_ordner for delete to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher p
  WHERE ((p.id = mail_ordner.postfach_id) AND (p.benutzer_id = auth.uid())))));
create policy mail_ordner_insert on public.mail_ordner for insert to public with check ((EXISTS ( SELECT 1
   FROM mail_postfaecher p
  WHERE ((p.id = mail_ordner.postfach_id) AND (p.benutzer_id = auth.uid())))));
create policy mail_ordner_select on public.mail_ordner for select to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher p
  WHERE ((p.id = mail_ordner.postfach_id) AND ((p.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles pr
          WHERE ((pr.id = auth.uid()) AND (pr.role = 'chef'::text)))))))));
create policy mail_ordner_update on public.mail_ordner for update to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher p
  WHERE ((p.id = mail_ordner.postfach_id) AND (p.benutzer_id = auth.uid())))));
create policy mailpf_aendern on public.mail_postfaecher for update to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mailpf_einfuegen on public.mail_postfaecher for insert to public with check (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mailpf_lesen on public.mail_postfaecher for select to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mailpf_loeschen on public.mail_postfaecher for delete to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mre_aendern on public.mail_regeln for update to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mre_einfuegen on public.mail_regeln for insert to public with check (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mre_lesen on public.mail_regeln for select to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mre_loeschen on public.mail_regeln for delete to public using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mailvers_einfuegen on public.mail_versendet for insert to public with check (true);
create policy mailvers_lesen on public.mail_versendet for select to public using (((versendet_von_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM mail_postfaecher
  WHERE ((mail_postfaecher.id = mail_versendet.postfach_id) AND (mail_postfaecher.benutzer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mailvers_loeschen on public.mail_versendet for delete to public using (((versendet_von_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM mail_postfaecher
  WHERE ((mail_postfaecher.id = mail_versendet.postfach_id) AND (mail_postfaecher.benutzer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mail_vorlagen_delete on public.mail_vorlagen for delete to authenticated using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy mail_vorlagen_insert on public.mail_vorlagen for insert to authenticated with check ((benutzer_id = auth.uid()));
create policy mail_vorlagen_select on public.mail_vorlagen for select to authenticated using (((benutzer_id = auth.uid()) OR (geteilt = true) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy mail_vorlagen_update on public.mail_vorlagen for update to authenticated using (((benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy marketing_all_authenticated on public.marketing for all to authenticated using (true) with check (true);
create policy marketing_print_vorlagen_delete on public.marketing_print_vorlagen for delete to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy marketing_print_vorlagen_insert on public.marketing_print_vorlagen for insert to public with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy marketing_print_vorlagen_select on public.marketing_print_vorlagen for select to public using ((auth.role() = 'authenticated'::text));
create policy marketing_print_vorlagen_update on public.marketing_print_vorlagen for update to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy mietanfragen_aendern on public.mietanfragen for update to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy mietanfragen_lesen on public.mietanfragen for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy mietanfragen_loeschen on public.mietanfragen for delete to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))));
create policy mietanfragen_schreiben on public.mietanfragen for insert to public with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy "mietvertraege delete auth" on public.mietvertraege for delete to authenticated using (true);
create policy "mietvertraege insert auth" on public.mietvertraege for insert to authenticated with check (true);
create policy "mietvertraege select all auth" on public.mietvertraege for select to authenticated using (true);
create policy "mietvertraege update auth" on public.mietvertraege for update to authenticated using (true) with check (true);
create policy mietvertraege_delete on public.mietvertraege for delete to authenticated using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy "mietvertrag_ordner delete team" on public.mietvertrag_ordner for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy "mietvertrag_ordner insert team" on public.mietvertrag_ordner for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy "mietvertrag_ordner select team" on public.mietvertrag_ordner for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy "mietvertrag_ordner update team" on public.mietvertrag_ordner for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy mpe_bausteine_lesen on public.mpe_bausteine for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy mpe_bausteine_schreiben on public.mpe_bausteine for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy news_briefings_makler_lesen on public.news_briefings for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy notar_laufzettel_all on public.notar_laufzettel for all to public using ((auth.role() = 'authenticated'::text)) with check ((auth.role() = 'authenticated'::text));
create policy notiz_tags_delete_own on public.notiz_tags for delete to public using ((user_id = auth.uid()));
create policy notiz_tags_insert_own on public.notiz_tags for insert to public with check ((user_id = auth.uid()));
create policy notiz_tags_select_own on public.notiz_tags for select to public using ((user_id = auth.uid()));
create policy notiz_tags_update_own on public.notiz_tags for update to public using ((user_id = auth.uid()));
create policy notizen_delete_own on public.notizen for delete to public using ((user_id = auth.uid()));
create policy notizen_insert_own on public.notizen for insert to public with check ((user_id = auth.uid()));
create policy notizen_select_own on public.notizen for select to public using ((user_id = auth.uid()));
create policy notizen_update_own on public.notizen for update to public using ((user_id = auth.uid()));
create policy oaf_delete on public.objektaufnahme_fotos for delete to authenticated using (true);
create policy oaf_insert on public.objektaufnahme_fotos for insert to authenticated with check (true);
create policy oaf_select on public.objektaufnahme_fotos for select to authenticated using (true);
create policy oaf_update on public.objektaufnahme_fotos for update to authenticated using (true) with check (true);
create policy oa_delete on public.objektaufnahmen for delete to authenticated using (true);
create policy oa_insert on public.objektaufnahmen for insert to authenticated with check (true);
create policy oa_select on public.objektaufnahmen for select to authenticated using (true);
create policy oa_update on public.objektaufnahmen for update to authenticated using (true) with check (true);
create policy objektnachweise_all_authenticated on public.objektnachweise for all to authenticated using (true) with check (true);
create policy objektnachweise_delete on public.objektnachweise for delete to authenticated using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy onoffice_adressen_team on public.onoffice_adressen for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy diagnose_lesen on public.onoffice_diagnose for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy onoffice_export_log_team_select on public.onoffice_export_log for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy onoffice_feld_werte_team_select on public.onoffice_feld_werte for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy onoffice_felder_lesen on public.onoffice_felder for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy import_log_lesen on public.onoffice_import_log for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy onoffice_objekte_makler_lesen on public.onoffice_objekte for select to authenticated using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy onoffice_schreib_felder_team_select on public.onoffice_schreib_felder for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy onoffice_sync_log_makler_lesen on public.onoffice_sync_log for select to authenticated using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy portal_diagnose_insert on public.portal_diagnose for insert to authenticated with check (true);
create policy portal_diagnose_select on public.portal_diagnose for select to authenticated using (true);
create policy portal_zugaenge_chef on public.portal_zugaenge for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy "Nutzer kann eigene PPTX-Vorlage lesen" on public.profiles for select to authenticated using ((auth.uid() = id));
create policy "Nutzer kann eigene PPTX-Vorlage ändern" on public.profiles for update to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy profiles_delete_chef on public.profiles for delete to authenticated using (is_chef());
create policy profiles_insert_self on public.profiles for insert to authenticated with check ((auth.uid() = id));
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_chef on public.profiles for update to public using (is_chef()) with check (is_chef());
create policy profiles_update_self on public.profiles for update to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy makler_lesen_aktivitaeten on public.projekt_aktivitaeten for select to authenticated using (true);
create policy makler_lesen_anfragen on public.projekt_anfragen for select to authenticated using (true);
create policy makler_schreiben_anfragen on public.projekt_anfragen for all to authenticated using (true) with check (true);
create policy makler_lesen_dateien on public.projekt_dateien for select to authenticated using (true);
create policy makler_schreiben_dateien on public.projekt_dateien for all to authenticated using (true) with check (true);
create policy makler_lesen_einheiten on public.projekt_einheiten for select to authenticated using (true);
create policy makler_schreiben_einheiten on public.projekt_einheiten for all to authenticated using (true) with check (true);
create policy makler_lesen_kontakte on public.projekt_kontakte for select to authenticated using (true);
create policy makler_schreiben_kontakte on public.projekt_kontakte for all to authenticated using (true) with check (true);
create policy makler_lesen_kunden_dateien on public.projekt_kunden_dateien for select to authenticated using (true);
create policy makler_schreiben_kunden_dateien on public.projekt_kunden_dateien for all to authenticated using (true) with check (true);
create policy makler_lesen_maengel on public.projekt_maengel for select to authenticated using (true);
create policy makler_schreiben_maengel on public.projekt_maengel for all to authenticated using (true) with check (true);
create policy makler_lesen_merkliste on public.projekt_merkliste for select to authenticated using (true);
create policy makler_schreiben_merkliste on public.projekt_merkliste for all to authenticated using (true) with check (true);
create policy makler_lesen_nachrichten on public.projekt_nachrichten for select to authenticated using (true);
create policy makler_schreiben_nachrichten on public.projekt_nachrichten for all to authenticated using (true) with check (true);
create policy makler_lesen_ordner on public.projekt_ordner for select to authenticated using (true);
create policy makler_schreiben_ordner on public.projekt_ordner for all to authenticated using (true) with check (true);
create policy makler_lesen_updates on public.projekt_updates for select to authenticated using (true);
create policy makler_schreiben_updates on public.projekt_updates for all to authenticated using (true) with check (true);
create policy makler_lesen_zahlungsplan on public.projekt_zahlungsplan for select to authenticated using (true);
create policy makler_schreiben_zahlungsplan on public.projekt_zahlungsplan for all to authenticated using (true) with check (true);
create policy makler_lesen_zugaenge on public.projekt_zugaenge for select to authenticated using (true);
create policy makler_schreiben_zugaenge on public.projekt_zugaenge for all to authenticated using (true) with check (true);
create policy makler_lesen_projekte on public.projekte for select to authenticated using (true);
create policy makler_schreiben_projekte on public.projekte for all to authenticated using (true) with check (true);
create policy provision_tracker_delete on public.provision_tracker for delete to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy provision_tracker_insert on public.provision_tracker for insert to public with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy provision_tracker_select on public.provision_tracker for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy provision_tracker_update on public.provision_tracker for update to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy push_einstellungen_chef on public.push_einstellungen for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))));
create policy push_einstellungen_lesen on public.push_einstellungen for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy push_geraete_eigene on public.push_geraete for all to public using ((profile_id = auth.uid())) with check ((profile_id = auth.uid()));
create policy push_log_lesen on public.push_log for select to public using (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy push_termin_erinnerungen_lesen on public.push_termin_erinnerungen for select to authenticated using (true);
create policy radar_aktivitaeten_all on public.radar_aktivitaeten for all to authenticated using (true) with check (true);
create policy radar_historie_all on public.radar_historie for all to authenticated using (true) with check (true);
create policy radar_objekte_all on public.radar_objekte for all to authenticated using (true) with check (true);
create policy radar_suchauftraege_all on public.radar_suchauftraege for all to authenticated using (true) with check (true);
create policy kunden_delete on public.rechnung_kunden for delete to authenticated using (true);
create policy kunden_insert on public.rechnung_kunden for insert to authenticated with check (true);
create policy kunden_select on public.rechnung_kunden for select to authenticated using (true);
create policy kunden_update on public.rechnung_kunden for update to authenticated using (true) with check (true);
create policy rechnung_seq_lesen on public.rechnung_nummern_sequence for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))));
create policy rechnung_positionen_makler on public.rechnung_positionen for all to authenticated using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))) OR (EXISTS ( SELECT 1
   FROM rechnungen r
  WHERE ((r.id = rechnung_positionen.rechnung_id) AND ((r.ersteller_id = auth.uid()) OR (r.absender_firma_id IN ( SELECT firma_stammdaten.id
           FROM firma_stammdaten
          WHERE (firma_stammdaten.inhaber_user_id = auth.uid()))))))))) with check (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))) OR (EXISTS ( SELECT 1
   FROM rechnungen r
  WHERE ((r.id = rechnung_positionen.rechnung_id) AND ((r.ersteller_id = auth.uid()) OR (r.absender_firma_id IN ( SELECT firma_stammdaten.id
           FROM firma_stammdaten
          WHERE (firma_stammdaten.inhaber_user_id = auth.uid())))))))));
create policy rechnungen_chef_delete on public.rechnungen for delete to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))));
create policy rechnungen_makler_insert on public.rechnungen for insert to authenticated with check (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))) OR ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'mitarbeiter'::text)))) AND (ersteller_id = auth.uid()))));
create policy rechnungen_makler_lesen on public.rechnungen for select to authenticated using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))) OR (ersteller_id = auth.uid()) OR (absender_firma_id IN ( SELECT firma_stammdaten.id
   FROM firma_stammdaten
  WHERE (firma_stammdaten.inhaber_user_id = auth.uid())))));
create policy rechnungen_makler_update on public.rechnungen for update to authenticated using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))) OR (ersteller_id = auth.uid()) OR (absender_firma_id IN ( SELECT firma_stammdaten.id
   FROM firma_stammdaten
  WHERE (firma_stammdaten.inhaber_user_id = auth.uid())))));
create policy rechnungen_audit_lesen on public.rechnungen_audit for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy res_aendern on public.reservierungen_neubau for update to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy res_lesen on public.reservierungen_neubau for select to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy res_loeschen on public.reservierungen_neubau for delete to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))));
create policy res_schreiben on public.reservierungen_neubau for insert to public with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy rundgaenge_alle on public.rundgaenge for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy rundgang_hotspots_alle on public.rundgang_hotspots for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy rundgang_szenen_alle on public.rundgang_szenen for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy signatur_empfaenger_all_authenticated on public.signatur_empfaenger for all to authenticated using (true) with check (true);
create policy signatur_events_all_authenticated on public.signatur_events for all to authenticated using (true) with check (true);
create policy signatur_vorgaenge_all_authenticated on public.signatur_vorgaenge for all to authenticated using (true) with check (true);
create policy suchkriterien_treffer_aendern on public.suchkriterien_treffer for update to authenticated using (true) with check (true);
create policy suchkriterien_treffer_lesen on public.suchkriterien_treffer for select to authenticated using (true);
create policy termin_einladungen_lesen on public.termin_einladungen for select to authenticated using (true);
create policy termin_einladungen_schreiben on public.termin_einladungen for all to authenticated using (true) with check (true);
create policy termine_all_authenticated on public.termine for all to authenticated using (true) with check (true);
create policy termine_delete on public.termine for delete to authenticated using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy todo_kommentar_alle on public.todo_kommentar for all to authenticated using (todo_sichtbar(todo_id)) with check (todo_sichtbar(todo_id));
create policy todo_schritt_alle on public.todo_schritt for all to authenticated using (todo_sichtbar(todo_id)) with check (todo_sichtbar(todo_id));
create policy todo_verknuepfung_alle on public.todo_verknuepfung for all to authenticated using (todo_sichtbar(todo_id)) with check (todo_sichtbar(todo_id));
create policy todo_vorgang_alle on public.todo_vorgang for all to authenticated using (ist_team()) with check (ist_team());
create policy todo_vorlage_schreiben on public.todo_vorlage for all to authenticated using (ist_chef()) with check (ist_chef());
create policy todo_vorlage_select on public.todo_vorlage for select to authenticated using (ist_team());
create policy todo_vorlage_schritt_schreiben on public.todo_vorlage_schritt for all to authenticated using (ist_chef()) with check (ist_chef());
create policy todo_vorlage_schritt_select on public.todo_vorlage_schritt for select to authenticated using (ist_team());
create policy todos_delete on public.todos for delete to authenticated using (((ersteller_id = auth.uid()) OR ist_chef()));
create policy todos_insert on public.todos for insert to authenticated with check (ist_team());
create policy todos_select on public.todos for select to authenticated using (((ersteller_id = auth.uid()) OR (zustaendig_id = auth.uid()) OR (team_sichtbar AND ist_team()) OR ist_chef()));
create policy todos_update on public.todos for update to authenticated using (((ersteller_id = auth.uid()) OR (zustaendig_id = auth.uid()) OR (team_sichtbar AND ist_team()) OR ist_chef()));
create policy uebergabeprotokoll_delete on public.uebergabeprotokoll for delete to public using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy uebergabeprotokoll_insert on public.uebergabeprotokoll for insert to public with check ((ersteller_id = auth.uid()));
create policy uebergabeprotokoll_select on public.uebergabeprotokoll for select to public using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy uebergabeprotokoll_update on public.uebergabeprotokoll for update to public using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy ub_eigentuemer_eigen on public.upload_benachrichtigungen for all to public using ((eigentuemer_id = aktueller_eigentuemer_id())) with check ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy ub_makler_alles on public.upload_benachrichtigungen for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy urlaub_hinweise_team on public.urlaub_hinweise for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy va_eigentuemer_delete on public.verbrauchsausweis_antraege for delete to public using (((eigentuemer_id = aktueller_eigentuemer_id()) AND (status = 'in_arbeit'::text)));
create policy va_eigentuemer_insert on public.verbrauchsausweis_antraege for insert to public with check ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy va_eigentuemer_lesen on public.verbrauchsausweis_antraege for select to public using ((eigentuemer_id = aktueller_eigentuemer_id()));
create policy va_eigentuemer_update on public.verbrauchsausweis_antraege for update to public using (((eigentuemer_id = aktueller_eigentuemer_id()) AND (status = ANY (ARRAY['in_arbeit'::text, 'eingereicht'::text]))));
create policy va_makler_alles on public.verbrauchsausweis_antraege for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy vermerke_team on public.vermerke for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy vertraege_all_authenticated on public.vertraege for all to authenticated using (true) with check (true);
create policy vertraege_delete on public.vertraege for delete to authenticated using (((ersteller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy vertraege_eigentuemer_lesen on public.vertraege for select to public using ((EXISTS ( SELECT 1
   FROM eigentuemer_objekte eo
  WHERE ((eo.maklervertrag_id = vertraege.id) AND (eo.eigentuemer_id = aktueller_eigentuemer_id())))));
create policy web_leads_mitarbeiter on public.web_leads for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
