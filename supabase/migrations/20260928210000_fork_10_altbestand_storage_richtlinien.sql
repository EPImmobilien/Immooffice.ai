-- ===========================================================================
-- Fork-eigene Migration 10 — sechzehn tote Richtlinien auf storage.objects
--
-- BEFUND: Der geparkte Greenfield-Stand hatte eigene Storage-Richtlinien
-- hinterlassen. Sie rufen intern.aktueller_mandant(), intern.darf_schreiben(),
-- intern.ist_verwaltung(), intern.bild_im_web_expose() und
-- intern.dokument_im_web_expose() auf. Diese Funktionen lesen aus
-- public.benutzer beziehungsweise public.web_expose — beide sind in
-- 20260914210000_altbestand_verschieben.sql nach altbestand gewandert.
--
-- FOLGE: Jeder angemeldete Zugriff auf storage.objects lief in
--   ERROR: relation "public.benutzer" does not exist
--   CONTEXT: SQL function "aktueller_mandant" during startup
-- und zwar auch im Livebetrieb, nicht nur im Test. Aufgefallen ist es erst,
-- als tests/mandant.sql den Dateispeicher mitgeprueft hat.
--
-- ENTSCHEIDUNG: loeschen statt reparieren. Die Richtlinien betreffen vier
-- Eimer — importe, marke, objektbilder, objektdokumente —, die kein einziger
-- Aufruf der Vorlage anfasst (geprueft gegen src/ und alle 139 Edge
-- Functions). Sie gehoeren zum geparkten Stand, nicht zum Produkt. Was
-- bleibt: die 59 Richtlinien der Vorlage und die restriktive Trennung aus
-- fork_09. Die acht Dateien in den vier Eimern bleiben liegen; sie sind nach
-- fork_08 ins Mandantenverzeichnis umgezogen und nur noch ueber die
-- service_role erreichbar. Begruendung in docs/ENTSCHEIDUNGEN.md.
--
-- Das Schema intern selbst bleibt unberuehrt: 204 Richtlinien auf
-- altbestand-Tabellen haengen daran. Dort ist der Fehler folgenlos, weil
-- altbestand nicht exponiert ist und ein Fehler ohnehin sperrt statt oeffnet.
-- Vermerkt in docs/OFFEN.md.
-- ===========================================================================

drop policy if exists "importe_anlegen"           on storage.objects;
drop policy if exists "importe_lesen"             on storage.objects;
drop policy if exists "importe_loeschen"          on storage.objects;
drop policy if exists "marke_aendern"             on storage.objects;
drop policy if exists "marke_anlegen"             on storage.objects;
drop policy if exists "marke_loeschen"            on storage.objects;
drop policy if exists "objektbilder_aendern"      on storage.objects;
drop policy if exists "objektbilder_anlegen"      on storage.objects;
drop policy if exists "objektbilder_lesen"        on storage.objects;
drop policy if exists "objektbilder_loeschen"     on storage.objects;
drop policy if exists "objektbilder_web_expose"   on storage.objects;
drop policy if exists "objektdokumente_aendern"   on storage.objects;
drop policy if exists "objektdokumente_anlegen"   on storage.objects;
drop policy if exists "objektdokumente_lesen"     on storage.objects;
drop policy if exists "objektdokumente_loeschen"  on storage.objects;
drop policy if exists "objektdokumente_web_expose" on storage.objects;

-- Wachposten: keine Richtlinie auf storage.objects darf mehr auf das geparkte
-- Schema zeigen. Wer eine neue anlegt, faellt hier auf.
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual,'') || coalesce(with_check,'')) like '%intern.%';
  if n > 0 then
    raise exception 'Noch % Storage-Richtlinie(n) rufen das geparkte Schema intern auf', n;
  end if;
end $$;
