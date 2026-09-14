-- Buckets und Storage-Richtlinien der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: 60-storage.sql
--
-- 25 Buckets der Vorlage werden 22: die drei Schrift-Buckets mit
-- Leerzeichen im Namen sind zu "schriften" zusammengelegt, shop-tv
-- entfaellt nach Phase 1.4 samt seiner vier Richtlinien.


-- Buckets und Storage-Richtlinien der Vorlage.
--
-- Befund beim Export: die Richtlinien sprechen von zwei Buckets, die es im
-- Projekt nicht gibt — 'marketing-print-vorlagen' und 'uebergabeprotokolle'.
-- Sie sind hier unveraendert uebernommen; ob die Buckets angelegt werden
-- muessen oder die Richtlinien Reste sind, entscheidet sich beim Sichten der
-- Oberflaeche. Vermerkt in docs/OFFEN.md.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('bewertungen', 'bewertungen', false, null, null),
  ('branding-assets', 'branding-assets', false, null, null),
  ('briefe-pdf', 'briefe-pdf', false, null, null),
  ('dokumente', 'dokumente', false, null, null),
  ('eigentuemer-dokumente', 'eigentuemer-dokumente', false, null, null),
  ('energieausweis', 'energieausweis', false, null, null),
  ('immobilie-dateien', 'immobilie-dateien', true, null, null),
  ('ki-bilder', 'ki-bilder', true, 10485760, '{image/jpeg,image/png,image/webp}'::text[]),
  ('ki-bilder-temp', 'ki-bilder-temp', false, 20971520, '{image/jpeg,image/png,image/webp,image/gif}'::text[]),
  ('mail-anhaenge', 'mail-anhaenge', false, null, null),
  ('maklervertraege-pdf', 'maklervertraege-pdf', false, null, null),
  ('marketing', 'marketing', false, null, null),
  ('schriften', 'schriften', false, null, null),
  ('mietanfragen-uploads', 'mietanfragen-uploads', false, null, null),
  ('notar-anhaenge', 'notar-anhaenge', false, null, null),
  ('objektaufnahme-fotos', 'objektaufnahme-fotos', false, null, null),
  ('pptx-vorlagen', 'pptx-vorlagen', false, null, null),
  ('profile-fotos', 'profile-fotos', false, null, null),
  ('projekt-dateien', 'projekt-dateien', false, null, null),
  ('rechnungen-pdf', 'rechnungen-pdf', false, null, null),
  ('reservierungen-pdf', 'reservierungen-pdf', false, null, null),
  ('web-assets', 'web-assets', true, 10485760, null)
on conflict (id) do nothing;

create policy "Chef kann alle PPTX-Vorlagen sehen" on storage.objects for select to authenticated using (((bucket_id = 'pptx-vorlagen'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy "Maklervertraege PDF delete" on storage.objects for delete to authenticated using (((bucket_id = 'maklervertraege-pdf'::text) AND (aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))));
create policy "Maklervertraege PDF insert" on storage.objects for insert to authenticated with check (((bucket_id = 'maklervertraege-pdf'::text) AND (aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))));
create policy "Maklervertraege PDF read" on storage.objects for select to authenticated using (((bucket_id = 'maklervertraege-pdf'::text) AND (aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))));
create policy "Maklervertraege PDF update" on storage.objects for update to authenticated using (((bucket_id = 'maklervertraege-pdf'::text) AND (aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))));
create policy "Nutzer kann aus eigenen PPTX-Vorlagen-Ordner lesen" on storage.objects for select to authenticated using (((bucket_id = 'pptx-vorlagen'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Nutzer kann eigene PPTX-Vorlagen löschen" on storage.objects for delete to authenticated using (((bucket_id = 'pptx-vorlagen'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Nutzer kann in eigenen PPTX-Vorlagen-Ordner schreiben" on storage.objects for insert to authenticated with check (((bucket_id = 'pptx-vorlagen'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "bewertungen all auth" on storage.objects for all to authenticated using ((bucket_id = 'bewertungen'::text)) with check ((bucket_id = 'bewertungen'::text));
create policy branding_lesen on storage.objects for select to public using (((bucket_id = 'branding-assets'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy branding_loeschen on storage.objects for delete to public using (((bucket_id = 'branding-assets'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy branding_schreiben on storage.objects for insert to public with check (((bucket_id = 'branding-assets'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy eigentuemer_dokumente_storage_delete on storage.objects for delete to authenticated using ((bucket_id = 'eigentuemer-dokumente'::text));
create policy eigentuemer_dokumente_storage_insert on storage.objects for insert to authenticated with check ((bucket_id = 'eigentuemer-dokumente'::text));
create policy eigentuemer_dokumente_storage_select on storage.objects for select to authenticated using ((bucket_id = 'eigentuemer-dokumente'::text));
create policy eigentuemer_dokumente_storage_update on storage.objects for update to authenticated using ((bucket_id = 'eigentuemer-dokumente'::text));
create policy immobilie_dateien_delete on storage.objects for delete to public using (((bucket_id = 'immobilie-dateien'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy immobilie_dateien_insert on storage.objects for insert to public with check (((bucket_id = 'immobilie-dateien'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy immobilie_dateien_read on storage.objects for select to public using ((bucket_id = 'immobilie-dateien'::text));
create policy immobilie_dateien_update on storage.objects for update to public using (((bucket_id = 'immobilie-dateien'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy "ki-bilder-temp service delete" on storage.objects for delete to service_role using ((bucket_id = 'ki-bilder-temp'::text));
create policy "ki-bilder-temp service insert" on storage.objects for insert to service_role with check ((bucket_id = 'ki-bilder-temp'::text));
create policy "ki-bilder-temp service read" on storage.objects for select to service_role using ((bucket_id = 'ki-bilder-temp'::text));
create policy ki_bilder_delete on storage.objects for delete to authenticated using (((bucket_id = 'ki-bilder'::text) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))))));
create policy ki_bilder_insert on storage.objects for insert to authenticated with check ((bucket_id = 'ki-bilder'::text));
create policy ki_bilder_select on storage.objects for select to public using ((bucket_id = 'ki-bilder'::text));
create policy "mail-anhaenge-delete" on storage.objects for delete to public using (((bucket_id = 'mail-anhaenge'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "mail-anhaenge-insert" on storage.objects for insert to public with check (((bucket_id = 'mail-anhaenge'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "mail-anhaenge-select" on storage.objects for select to public using (((bucket_id = 'mail-anhaenge'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy marketing_print_hochladen on storage.objects for insert to public with check (((bucket_id = 'marketing-print-vorlagen'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy marketing_print_lesen on storage.objects for select to public using (((bucket_id = 'marketing-print-vorlagen'::text) AND (auth.role() = 'authenticated'::text)));
create policy marketing_print_loeschen on storage.objects for delete to public using (((bucket_id = 'marketing-print-vorlagen'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text))))));
create policy mietanfr_uploads_lesen on storage.objects for select to public using (((bucket_id = 'mietanfragen-uploads'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy mietanfr_uploads_schreiben on storage.objects for insert to public with check ((bucket_id = 'mietanfragen-uploads'::text));
create policy notar_anhaenge_hochladen on storage.objects for insert to public with check (((bucket_id = 'notar-anhaenge'::text) AND (auth.role() = 'authenticated'::text)));
create policy notar_anhaenge_lesen on storage.objects for select to public using (((bucket_id = 'notar-anhaenge'::text) AND (auth.role() = 'authenticated'::text)));
create policy notar_anhaenge_loeschen on storage.objects for delete to public using (((bucket_id = 'notar-anhaenge'::text) AND (auth.role() = 'authenticated'::text)));
create policy oaf_storage_delete on storage.objects for delete to authenticated using ((bucket_id = 'objektaufnahme-fotos'::text));
create policy oaf_storage_insert on storage.objects for insert to authenticated with check ((bucket_id = 'objektaufnahme-fotos'::text));
create policy oaf_storage_select on storage.objects for select to authenticated using ((bucket_id = 'objektaufnahme-fotos'::text));
create policy oaf_storage_update on storage.objects for update to authenticated using ((bucket_id = 'objektaufnahme-fotos'::text));
create policy "profile-fotos all auth" on storage.objects for all to authenticated using ((bucket_id = 'profile-fotos'::text)) with check ((bucket_id = 'profile-fotos'::text));
create policy projekt_dateien_lesen on storage.objects for select to authenticated using ((bucket_id = 'projekt-dateien'::text));
create policy projekt_dateien_loeschen on storage.objects for delete to authenticated using ((bucket_id = 'projekt-dateien'::text));
create policy projekt_dateien_update on storage.objects for update to authenticated using ((bucket_id = 'projekt-dateien'::text)) with check ((bucket_id = 'projekt-dateien'::text));
create policy projekt_dateien_upload on storage.objects for insert to authenticated with check ((bucket_id = 'projekt-dateien'::text));
create policy rechnungen_pdf_lesen on storage.objects for select to public using (((bucket_id = 'rechnungen-pdf'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy rechnungen_pdf_schreiben on storage.objects for insert to public with check (((bucket_id = 'rechnungen-pdf'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy res_pdf_lesen on storage.objects for select to public using (((bucket_id = 'reservierungen-pdf'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy res_pdf_schreiben on storage.objects for insert to public with check (((bucket_id = 'reservierungen-pdf'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))));
create policy storage_authenticated_delete_dokumente on storage.objects for delete to authenticated using ((bucket_id = 'dokumente'::text));
create policy storage_authenticated_delete_marketing on storage.objects for delete to authenticated using ((bucket_id = 'marketing'::text));
create policy storage_authenticated_insert_dokumente on storage.objects for insert to authenticated with check ((bucket_id = 'dokumente'::text));
create policy storage_authenticated_insert_marketing on storage.objects for insert to authenticated with check ((bucket_id = 'marketing'::text));
create policy storage_authenticated_select_dokumente on storage.objects for select to authenticated using ((bucket_id = 'dokumente'::text));
create policy storage_authenticated_select_marketing on storage.objects for select to authenticated using ((bucket_id = 'marketing'::text));
create policy uebergabeprotokolle_hochladen on storage.objects for insert to public with check (((bucket_id = 'uebergabeprotokolle'::text) AND (auth.role() = 'authenticated'::text)));
create policy uebergabeprotokolle_lesen on storage.objects for select to public using (((bucket_id = 'uebergabeprotokolle'::text) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))))));
create policy uebergabeprotokolle_loeschen on storage.objects for delete to public using (((bucket_id = 'uebergabeprotokolle'::text) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'chef'::text)))))));
