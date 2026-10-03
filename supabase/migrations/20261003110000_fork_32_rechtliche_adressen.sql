-- ===========================================================================
-- Fork-eigene Migration 32 — Impressum, Datenschutz und AGB je Mandant
--
-- Die Vorlage hatte diese drei Adressen im Quelltext: als Konstanten in
-- expose-freigabe und objekt-landing, als Links in den Fusszeilen der
-- Kundenseiten, im Newsletter und in zwei PDF-Texten. Nach der
-- Neutralisierung zeigen sie auf immooffice.example — eine Domain, die
-- niemandem gehoert. Fuer jeden Mandanten ist das ein toter Link an einer
-- Stelle, die rechtlich etwas leisten soll:
--
--   - Die Expose-Freigabe laesst den Interessenten die AGB BESTAETIGEN und
--     verlinkt sie dabei. Ein Haken auf nicht lesbare AGB ist nichts wert.
--   - Der Datenschutzhinweis nennt die Hinweise "abrufbar unter: …".
--   - Die Fusszeile der Objektseite fuehrt Impressum und Datenschutz.
--
-- Deshalb drei Spalten, dort wo die uebrigen Pflichtangaben schon stehen:
-- neben Registergericht, HRB, USt-IdNr. und Geschaeftsfuehrer. Sie sind
-- bewusst FREI (kein Vorgabewert): aus web + "/impressum" zu raten waere
-- falsch, denn jede Seite legt ihre Rechtsseiten anders ab.
--
-- Was die aufrufenden Stellen daraus machen, steht dort: ohne Eintrag wird
-- der Link WEGGELASSEN, nicht auf ein Nichts gesetzt. Dieselbe Regel wie bei
-- immoFirmenName und immoMarke — eine fehlende Angabe faellt auf, eine
-- falsche nicht.
-- ===========================================================================

alter table public.firma_stammdaten
  add column if not exists url_impressum   text,
  add column if not exists url_datenschutz text,
  add column if not exists url_agb         text;

comment on column public.firma_stammdaten.url_impressum is
  'Vollstaendige Adresse der Impressumsseite des Mandanten. Leer = kein Link; die aufrufende Stelle laesst ihn dann weg.';
comment on column public.firma_stammdaten.url_datenschutz is
  'Vollstaendige Adresse der Datenschutzhinweise. Leer = kein Link. Wird in Expose-Freigabe, Objektseite, Newsletter und zwei PDF-Texten verwendet.';
comment on column public.firma_stammdaten.url_agb is
  'Vollstaendige Adresse der AGB. Leer = kein Link — und damit auch kein Haken, der ihre Kenntnis bestaetigt.';
