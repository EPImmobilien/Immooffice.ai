-- ===========================================================================
-- Fork-eigene Migration 31m — die Werte von privat_status richtigstellen
--
-- In fork_31i stand im Kommentar eine geratene Liste
-- ("offen, geprueft, fund, uebernommen, zurueckgesetzt"). Jetzt ist die
-- Funktion bild-privat-retusche geschrieben, und damit ist die Liste
-- nachlesbar: die Oberflaeche verzweigt in EpPrivatBadge namentlich auf
-- diese Werte, und was sie nicht kennt, zeigt sie als Fund an. Ein
-- Kommentar, der etwas anderes behauptet als der Code, ist schlimmer als
-- keiner.
--
-- Eine Pruefbedingung kommt bewusst NICHT dazu: die Werte stehen in einer
-- Edge Function und in der Oberflaeche, nicht in der Datenbank. Eine
-- Bedingung hier wuerde bei der naechsten Stufe der Vorlage einen
-- Schreibfehler erzeugen, statt einen Zustand zu verhindern.
-- ===========================================================================

comment on column public.immobilie_datei.privat_status is
  'Stand der Pruefung auf private Details. Leer = nie geprueft. '
  'offen = eingereiht, laeuft = KI arbeitet, ok = geprueft und nichts '
  'gefunden, vorschlag = Fund mit Retusche-Vorschlag (privat_vorschlag_pfad), '
  'uebernommen = der Vorschlag ist das aktive Bild, verworfen = der Nutzer '
  'behaelt das Original, fehler = Pruefung oder Retusche fehlgeschlagen.';

comment on column public.immobilie_datei.privat_befund is
  'Was die KI gefunden hat, als JSON: funde[{art, beschreibung, ort}], '
  'sicherheit, anweisung (die englische Retusche-Anweisung), geprueft_am. '
  'Nach dem Uebernehmen zusaetzlich original_pfad und ki_bearbeitet_vorher — '
  'daran haengt "Original wiederherstellen". Bei einem Fehler fehler.';
