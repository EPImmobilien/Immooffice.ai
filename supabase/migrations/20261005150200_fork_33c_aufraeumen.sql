-- ===========================================================================
-- Fork-eigene Migration 33c — die entfernenden Schritte zu fork_33a/33b
--
-- Getrennt, weil das Werkzeug jedes drop und revoke einzeln freigeben
-- laesst. Inhaltlich gehoert alles zu 33a (Aufmass) und 33b (Sicherheit).
-- ===========================================================================

-- 33a: zwei Annahmen aus fork_31a, die die Vorlage nicht kennt. Die Vorlage
-- erlaubt mehrere Gesamtscans je Geschoss (etwa vor und nach einem Umbau);
-- die Oberflaeche setzt raum beim Gesamtscan ohnehin auf null. Beide fallen
-- weg, damit der Fork nichts ablehnt, was die Vorlage annimmt.
drop index if exists public.aufmass_scan_gesamt_uniq;
alter table public.aufmass_scan drop constraint if exists aufmass_scan_gesamt_ohne_raum;
-- Die Vorlage verlangt umfang ausdruecklich, ohne Vorgabewert.
alter table public.aufmass_scan alter column umfang drop default;

-- 33a: Fotos in der Scan-Ablage (Stufe 157). 'aufmass' und 'sonstiges' aus
-- fork_31a bleiben erlaubt, damit nichts abgelehnt wird, was der Fork
-- bisher angenommen hat.
alter table public.scan_ablage drop constraint if exists scan_ablage_art_check;
alter table public.scan_ablage add constraint scan_ablage_art_check
  check (art in ('raumscan', 'punktwolke', 'foto', 'aufmass', 'sonstiges'));

-- 33b: Trigger-Funktionen nicht per API aufrufbar (die Trigger feuern weiterhin).
revoke execute on function public.immobilie_datei_freigabe_sync() from public, anon, authenticated;
revoke execute on function public.immobilie_wissen_freigabe_sync() from public, anon, authenticated;
