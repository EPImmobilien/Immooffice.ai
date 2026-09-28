-- ===========================================================================
-- Fork-eigene Migration 20 — onOffice abschalten
--
-- ANWEISUNG vom 28.09.2026: "Bitte löse onoffice erstmal komplett raus, wir
-- wissen ja nicht, mit welcher ursprünglichen Software die neuen Kunden
-- arbeiten."
--
-- Das ist richtig und betrifft mehr als eine Abschaltung: onOffice war in der
-- Vorlage DIE Anbindung, nicht EINE. 21 Edge Functions, 14 Cron-Jobs, 13
-- Tabellen und 191 Stellen in der Oberflaeche. Ein Mandant, der mit einer
-- anderen Software arbeitet, sieht davon nichts als tote Knoepfe — und die
-- Cron-Jobs laufen alle zehn Minuten in
--     "onoffice-termine-sync: ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt."
--
-- CLAUDE.md sagt bisher: "Bleibt im Code, hinter Funktionsschalter aus, bis
-- Phase 2b: CRM-Sync". Die Anweisung des Auftraggebers ist juenger und gilt.
-- Vermerkt in docs/ENTSCHEIDUNGEN.md.
--
-- WAS DIESE MIGRATION TUT: die 14 Cron-Jobs abbestellen. Mehr nicht — das ist
-- der Teil, der gerade Schaden anrichtet.
--
-- WAS SIE NICHT TUT: die 13 Tabellen loeschen. Sie sind alle leer (geprueft),
-- aber sie zu loeschen waere unumkehrbar, und "erstmal" heisst nicht
-- "endgueltig". Sie bleiben liegen wie der geparkte Greenfield-Stand. Wenn
-- onOffice spaeter EIN Anbieter unter mehreren wird — Abschnitt 4b des
-- Auftrags beschreibt genau so eine Adapter-Schicht fuer Postfaecher —, steht
-- das Schema noch.
-- ===========================================================================

do $$
declare j record; n int := 0;
begin
  for j in select jobname from cron.job where jobname like '%onoffice%' loop
    perform cron.unschedule(j.jobname);
    n := n + 1;
  end loop;
  raise notice 'onOffice: % Cron-Job(s) abbestellt.', n;
end $$;

-- --- Wachposten -----------------------------------------------------------
-- Kommt ein onOffice-Job zurueck, faellt es hier auf. Wer ihn bewusst wieder
-- will, streicht diesen Block mit.
do $$
declare n int;
begin
  select count(*) into n from cron.job where jobname like '%onoffice%';
  if n > 0 then
    raise exception 'Es laufen wieder % onOffice-Cron-Job(s).', n;
  end if;
end $$;
