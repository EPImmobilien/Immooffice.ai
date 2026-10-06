-- ===========================================================================
-- fork_49 — der Dollarkurs gehört in den Plattform-Admin, nicht in den Code
-- ===========================================================================
-- Manche KI-Anbieter rechnen in Dollar (Replicate), das Credit-Ledger führt
-- Euro. Damit `credit_buchungen.ki_kosten_eur` stimmt, muss irgendwo ein Kurs
-- stehen — und zwar an EINER Stelle, die der Betreiber ändern kann.
--
-- CLAUDE.md: „Alle Preise, Limits und Credit-Werte über den Plattform-Admin
-- konfigurierbar — nicht an vielen Stellen im Code verdrahten."
--
-- Der eingetragene Wert ist ein Startwert, kein Versprechen. Er ist der
-- Umrechnungskurs, mit dem der Betreiber rechnet, und er gehört gepflegt wie
-- jeder andere Satz. Steht hier nichts Brauchbares, rechnet credits.ts NICHT
-- um und lässt die Kostenspalte leer — lieber keine Zahl als eine falsche.
-- ===========================================================================

insert into public.plattform_werte (schluessel, wert, beschreibung)
values ('usd_eur_kurs', '0.92'::jsonb,
        'Umrechnungskurs USD → EUR für Anbieterkosten. Vom Betreiber zu '
        'pflegen; ohne gültigen Wert bleibt ki_kosten_eur leer.')
on conflict (schluessel) do nothing;
