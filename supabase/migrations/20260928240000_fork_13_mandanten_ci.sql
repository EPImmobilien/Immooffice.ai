-- ===========================================================================
-- Fork-eigene Migration 13 — Mandanten-CI: Farben und Schrift je Standort
--
-- docs/NEUTRALITAET.md Abschnitt 4 schreibt die Herkunft der Firmenangaben
-- zur Laufzeit fest. Drei Zeilen davon waren nicht gebaut:
--
--   | Primaer-/Akzentfarbe, Schrift | firma_stammdaten.ci_primaer,
--   |                               | ci_akzent, ci_font                |
--
-- Das Logo gibt es schon: firma_stammdaten.logo_pfad zeigt in den Eimer
-- branding-assets, und die PDF-Funktionen der Vorlage lesen es von dort
-- (reservierung-pdf-erzeugen, akq-wertindikation-pdf). Nur die Oberflaeche
-- kannte es nicht.
--
-- WARUM AM STANDORT und nicht am Mandanten: die Vorlage haengt Logo, Anschrift
-- und Briefkopf an firma_stammdaten, und ein Mandant mit zwei Gesellschaften
-- hat zwei Briefkoepfe. Eine zweite Ablage am Mandanten haette zwei Wahrheiten
-- ergeben. Der Angemeldete bekommt die seines Standorts.
--
-- FEHLEN DIE WERTE, GILT DIE PLATTFORM-CI. So steht es in NEUTRALITAET.md, und
-- genau so verhaelt sich die Oberflaeche: null heisst "nichts einstellen",
-- nicht "weiss".
-- ===========================================================================

alter table public.firma_stammdaten
  add column if not exists ci_primaer text,
  add column if not exists ci_akzent  text,
  add column if not exists ci_font    text;

-- Nur echte Hex-Farben. Eine krumme Angabe faellt hier auf und nicht erst als
-- unlesbare Schrift auf unlesbarem Grund.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'firma_stammdaten_ci_farben_check') then
    alter table public.firma_stammdaten add constraint firma_stammdaten_ci_farben_check
      check (
        (ci_primaer is null or ci_primaer ~ '^#[0-9A-Fa-f]{6}$') and
        (ci_akzent  is null or ci_akzent  ~ '^#[0-9A-Fa-f]{6}$')
      );
  end if;
end $$;

comment on column public.firma_stammdaten.ci_primaer is
  'Primaerfarbe des Mandanten als #rrggbb. Leer = Plattform-CI. '
  'docs/NEUTRALITAET.md Abschnitt 4.';
comment on column public.firma_stammdaten.ci_akzent is
  'Akzentfarbe des Mandanten als #rrggbb. Leer = Plattform-CI.';
comment on column public.firma_stammdaten.ci_font is
  'Name einer Schriftfamilie. Leer = die der Plattform. Geladen wird sie '
  'nicht — eingetragen wird, was auf den Geraeten vorhanden ist oder was die '
  'Plattform ohnehin laedt.';
