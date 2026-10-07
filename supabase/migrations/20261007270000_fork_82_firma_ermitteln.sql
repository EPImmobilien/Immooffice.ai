-- ===========================================================================
-- fork_82 — Firmendaten aus der Website: Preis und KI-Einstellung
-- ===========================================================================
-- Die Function firma-ermitteln rechnet ueber die Beilage _credits ab, damit
-- Notschalter, Tageslimit und Modellwahl des Betreibers greifen. Sie kostet
-- den Kunden nichts (0 Credits — Einrichtung ist kostenlos), steht aber im
-- Ledger. RUECKNAHME: delete from plattform_credit_preise where aktion =
-- 'firma_ermitteln'; delete from plattform_ki_einstellungen where funktion
-- = 'firma_ermitteln'.
-- ===========================================================================
insert into public.plattform_credit_preise (aktion, name, credits, beschreibung, sortierung, aktiv)
values ('firma_ermitteln', 'Firmendaten aus der Website', 0, 'Liest Startseite und Impressum der eigenen Website und schlaegt die Firmendaten vor (Einrichtung, kostenlos)', 90, true)
on conflict (aktion) do nothing;
insert into public.plattform_ki_einstellungen (funktion, name, anbieter, modell)
values ('firma_ermitteln', 'Firmendaten aus der Website', 'anthropic', 'claude-sonnet-4-6')
on conflict (funktion) do nothing;
