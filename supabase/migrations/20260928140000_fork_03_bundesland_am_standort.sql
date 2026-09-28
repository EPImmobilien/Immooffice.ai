-- ===========================================================================
-- Fork-eigene Migration 03 — Bundesland am Standort
--
-- Die Vorlage rechnet Urlaubstage und Nachfassfristen mit den Feiertagen
-- Mecklenburg-Vorpommerns — dem Sitz der Referenz, fest im Quelltext. Ein
-- Mandant in Bayern bekaeme damit zwei Feiertage zu wenig (Heilige Drei
-- Koenige, Fronleichnam, Allerheiligen) und einen zu viel (Frauentag), und
-- niemand saehe es: die Zahl sieht plausibel aus.
--
-- Das Bundesland gehoert an den Standort, nicht an das Konto: ein Mandant mit
-- Bueros in Rostock und Muenchen hat zwei verschiedene Feiertagskalender.
--
-- Null heisst "noch nicht hinterlegt". Dann gelten die neun bundesweiten
-- Feiertage — lieber zu wenige als falsche, und die Oberflaeche weist darauf
-- hin. Ein erfundener Vorgabewert waere hier besonders heikel: er erzeugte
-- falsche Urlaubsbilanzen, die wie richtige aussehen.
-- ===========================================================================

alter table public.firma_stammdaten
  add column bundesland text
    check (bundesland is null or bundesland in
      ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH'));

comment on column public.firma_stammdaten.bundesland is
  'Amtliches Kuerzel des Bundeslandes dieses Standorts. Bestimmt die '
  'gesetzlichen Feiertage fuer Urlaubsberechnung und Nachfassfristen. Null '
  'heisst: noch nicht hinterlegt — dann gelten nur die neun bundesweiten '
  'Feiertage, und die Oberflaeche weist darauf hin.';

create index firma_stammdaten_bundesland_idx on public.firma_stammdaten (bundesland)
  where bundesland is not null;
