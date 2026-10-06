-- ===========================================================================
-- fork_58 — die letzten beiden Markenfarben der Referenz standen im Schema
-- ===========================================================================
-- `mail_eigene_ordner.farbe` und `mail_kategorien.farbe` tragen als
-- Standardwert das Gold der Referenz. CLAUDE.md nennt den Standardwert
-- ausdruecklich unter dem, worin kein Kennzeichen der Referenz stehen darf —
-- und eine Spaltenvorgabe ist genau das: jeder neue Ordner, den ein Mandant
-- anlegt, bekaeme die Farbe der Referenz, ohne dass sie irgendwo im Quelltext
-- stuende.
--
-- Getauscht wird gegen das Gold der Plattform-CI (CLAUDE.md). Bestehende
-- Zeilen bleiben unberuehrt: am 06.10.2026 traegt keine einzige den alten
-- Wert, und waere es anders, waere es die Farbwahl eines Mandanten und nicht
-- unsere.
--
-- Die Migration von damals wird NICHT umgeschrieben. Eine angewendete
-- Migration ist ein Protokoll, keine Arbeitsdatei.
-- ===========================================================================

alter table public.mail_eigene_ordner alter column farbe set default '#B5934F';
alter table public.mail_kategorien    alter column farbe set default '#B5934F';

comment on column public.mail_eigene_ordner.farbe is
  'Farbe des Ordners als #rrggbb. Vorgabe ist das Gold der Plattform-CI.';
comment on column public.mail_kategorien.farbe is
  'Farbe der Kategorie als #rrggbb. Vorgabe ist das Gold der Plattform-CI.';
