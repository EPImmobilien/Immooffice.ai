-- ===========================================================================
-- fork_81 — Tarifmerkmale sagen, was die Tarife wirklich unterscheidet
-- ===========================================================================
-- Die Merkmale aus fork_47 staffeln Module: „Akquise ab Professional",
-- „Arbeitszeit ab Business", „Ein Postfach" im Starter. Durchgesetzt wird
-- davon nichts — die Funktionsschalter (fork_73) sind bis auf den
-- Claude-Connector in jedem Tarif an. Die Website und die Tarifwahl in der
-- Anwendung versprachen also eine Staffel, die es nicht gibt.
--
-- Was die Tarife tatsächlich trennt: Nutzer, Credits, Claude-Connector,
-- Support. Genau das steht jetzt da.
--
-- Rücknahme: die Merkmale aus fork_47 wieder eintragen.
-- ===========================================================================

update public.plattform_tarife set merkmale = '["Alle Module, ohne Abstriche", "Objekte, Exposés, Portale und Akquise", "Postfächer, Termine und Verträge", "Eigentümer- und Käuferportal"]'::jsonb
 where schluessel = 'starter';

update public.plattform_tarife set merkmale = '["Alles aus Starter", "Bis zu drei Nutzer", "Dreifaches Credit-Kontingent", "Claude-Connector (MCP)"]'::jsonb
 where schluessel = 'professional';

update public.plattform_tarife set merkmale = '["Alles aus Professional", "Bis zu acht Nutzer", "Doppeltes Credit-Kontingent von Professional", "Für mehrere Standorte und Gesellschaften", "Vorrangiger Support"]'::jsonb
 where schluessel = 'business';
