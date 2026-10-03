-- ===========================================================================
-- Fork-eigene Migration 31k — fortschritt ist ein Objekt, kein Text
--
-- In fork_31a hatte grundriss_ki_auftraege.fortschritt den Typ text. Das war
-- falsch geraten: die Oberflaeche liest
--
--     if (a && a.fortschritt && a.fortschritt.zeichen) ...
--
-- also ein Feld IN einem Objekt. Mit text waere a.fortschritt eine
-- Zeichenkette und a.fortschritt.zeichen immer undefined — der Nutzer saehe
-- waehrend der ein bis drei Minuten nur "Die KI sieht sich den Plan an …"
-- und keinen Fortschritt.
--
-- Die Spalte ist noch leer (die Funktion dazu entsteht erst jetzt), ein
-- Umbau der Daten ist also nicht noetig. using bleibt trotzdem stehen,
-- damit die Migration auch gegen eine Datenbank mit Zeilen laeuft.
-- ===========================================================================

alter table public.grundriss_ki_auftraege
  alter column fortschritt type jsonb using
    case when fortschritt is null then null
         else jsonb_build_object('text', fortschritt) end;

comment on column public.grundriss_ki_auftraege.fortschritt is
  'Was der Auftrag gerade tut, als JSON. Die Oberflaeche liest zeichen (Zahl der Zeichen, die die KI schon geschrieben hat) und zeigt sie waehrend des Laufs an.';
