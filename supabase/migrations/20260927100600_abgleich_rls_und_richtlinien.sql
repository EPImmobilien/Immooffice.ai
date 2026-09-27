-- Abgleich mit der Vorlage: RLS, Rechte und Richtlinien vom 26.09.2026
--
-- 21 Tabellen bekommen RLS, 31 Richtlinien werden gesetzt.
--
-- Darunter suchkriterien_lauf: in 20260915000700_vorlage_rls_und_rechte.sql
-- stand die Zeile auskommentiert, weil die Vorlage dort kein RLS hatte und
-- Einschalten ohne Richtlinie jeden Zugriff gesperrt haette. Der Befund ist in
-- der Vorlage inzwischen behoben — RLS an, Richtlinie suchkriterien_lauf_team.
-- Der naechtliche Lauf funktioniert weiter, weil suchkriterien_abgleich_lauf()
-- security definer ist.
--
-- immobilie_datei_geloescht und onoffice_expose_pruefung bekommen RLS ohne
-- Richtlinie. Das ist so gewollt: damit kommt nur service_role heran, und
-- genau so steht es in der Vorlage.
--
-- Fuer mail_eingang und mail_versendet werden die bestehenden Richtlinien
-- ersetzt (Namen gleich, Inhalt geaendert), deshalb dort vorher ein drop.

-- ------------------------------------------------------------ RLS einschalten
alter table public.akq_vorlagen_sicherung enable row level security;
alter table public.besichtigung_absagen enable row level security;
alter table public.immobilie_datei_geloescht enable row level security;
alter table public.immobilie_titelbild_wahl enable row level security;
alter table public.kontakt_emails enable row level security;
alter table public.landing_besichtigungswuensche enable row level security;
alter table public.landing_faq enable row level security;
alter table public.landing_fragen enable row level security;
alter table public.mail_rechnung_ziele enable row level security;
alter table public.mail_termineinladungen enable row level security;
alter table public.newsletter_anmeldungen enable row level security;
alter table public.newsletter_kampagnen enable row level security;
alter table public.newsletter_versand enable row level security;
alter table public.objekt_status_vorschlag enable row level security;
alter table public.onoffice_benutzer_zuordnung enable row level security;
alter table public.onoffice_expose_pruefung enable row level security;
alter table public.onoffice_expose_versand enable row level security;
alter table public.onoffice_status_log enable row level security;
alter table public.portal_einstellungen enable row level security;
alter table public.projekt_datei_freigaben enable row level security;
alter table public.suchkriterien_lauf enable row level security;

-- ------------------------------------------------------------------- Rechte
-- Die 20 neuen Tabellen erben ihre Rechte aus den Vorgaben in
-- 20260915000700_vorlage_rls_und_rechte.sql. Eine Ausnahme: in der Vorlage hat
-- anon auf akq_vorlagen_sicherung keine Rechte. Nachgezogen.
revoke all on public.akq_vorlagen_sicherung from anon;

-- ---------------------------------------------------------------- Richtlinien
drop policy if exists mail_eingang_aendern on public.mail_eingang;
drop policy if exists mail_eingang_einfuegen on public.mail_eingang;
drop policy if exists mail_eingang_lesen on public.mail_eingang;
drop policy if exists mail_eingang_loeschen on public.mail_eingang;
drop policy if exists mailvers_einfuegen on public.mail_versendet;
drop policy if exists mailvers_lesen on public.mail_versendet;
drop policy if exists mailvers_loeschen on public.mail_versendet;

create policy akq_vorlagen_sicherung_team_lesen on public.akq_vorlagen_sicherung as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy amt_adressen_lesen on public.amt_adressen as permissive for select to authenticated using (true);
create policy amt_zusaetzliche_regionen_lesen on public.amt_zusaetzliche_regionen as permissive for select to authenticated using (true);
create policy besichtigung_absagen_makler on public.besichtigung_absagen as permissive for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy immobilie_titelbild_wahl_team on public.immobilie_titelbild_wahl as permissive for all to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy kontakt_emails_team on public.kontakt_emails as permissive for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy landing_wuensche_team on public.landing_besichtigungswuensche as permissive for all to public using ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy landing_faq_team on public.landing_faq as permissive for all to public using ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy landing_fragen_team on public.landing_fragen as permissive for all to public using ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy mail_eingang_aendern on public.mail_eingang as permissive for update to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher mp
  WHERE ((mp.id = mail_eingang.postfach_id) AND ((mp.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))))))));
create policy mail_eingang_einfuegen on public.mail_eingang as permissive for insert to authenticated with check (true);
create policy mail_eingang_lesen on public.mail_eingang as permissive for select to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher mp
  WHERE ((mp.id = mail_eingang.postfach_id) AND ((mp.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))))))));
create policy mail_eingang_loeschen on public.mail_eingang as permissive for delete to public using ((EXISTS ( SELECT 1
   FROM mail_postfaecher mp
  WHERE ((mp.id = mail_eingang.postfach_id) AND ((mp.benutzer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text)))))))));
create policy mail_rechnung_ziele_team on public.mail_rechnung_ziele as permissive for all to authenticated using (true) with check (true);
create policy mail_termineinladungen_team on public.mail_termineinladungen as permissive for all to public using ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy mailvers_einfuegen on public.mail_versendet as permissive for insert to authenticated with check (true);
create policy mailvers_lesen on public.mail_versendet as permissive for select to public using (((versendet_von_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM mail_postfaecher
  WHERE ((mail_postfaecher.id = mail_versendet.postfach_id) AND (mail_postfaecher.benutzer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy mailvers_loeschen on public.mail_versendet as permissive for delete to public using (((versendet_von_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM mail_postfaecher
  WHERE ((mail_postfaecher.id = mail_versendet.postfach_id) AND (mail_postfaecher.benutzer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'chef'::text))))));
create policy newsletter_anmeldungen_team on public.newsletter_anmeldungen as permissive for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy newsletter_kampagnen_team on public.newsletter_kampagnen as permissive for all to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))) with check ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy newsletter_versand_team on public.newsletter_versand as permissive for select to public using ((aktuelle_rolle() = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy osv_lesen on public.objekt_status_vorschlag as permissive for select to authenticated using (true);
create policy onoffice_benutzer_zuordnung_lesen on public.onoffice_benutzer_zuordnung as permissive for select to public using ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy onoffice_benutzer_zuordnung_schreiben on public.onoffice_benutzer_zuordnung as permissive for all to public using ((COALESCE(aktuelle_rolle(), ''::text) = 'chef'::text)) with check ((COALESCE(aktuelle_rolle(), ''::text) = 'chef'::text));
create policy oev_team on public.onoffice_expose_versand as permissive for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy osl_lesen on public.onoffice_status_log as permissive for select to authenticated using (true);
create policy plz_region_lesen on public.plz_region as permissive for select to authenticated using (true);
create policy portal_einstellungen_chef on public.portal_einstellungen as permissive for all to public using ((COALESCE(aktuelle_rolle(), ''::text) = 'chef'::text)) with check ((COALESCE(aktuelle_rolle(), ''::text) = 'chef'::text));
create policy portal_einstellungen_lesen on public.portal_einstellungen as permissive for select to public using ((COALESCE(aktuelle_rolle(), ''::text) = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])));
create policy projekt_datei_freigaben_team on public.projekt_datei_freigaben as permissive for all to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));
create policy suchkriterien_lauf_team on public.suchkriterien_lauf as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['chef'::text, 'mitarbeiter'::text]))))));