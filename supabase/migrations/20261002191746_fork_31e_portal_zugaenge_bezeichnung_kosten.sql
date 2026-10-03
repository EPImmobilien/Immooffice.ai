-- ===========================================================================
-- Fork-eigene Migration 31e — zwei Spalten an portal_zugaenge
--
-- Stufe 120/121 der Vorlage: Admin -> Portale zeigt je Zugang eine freie
-- Bezeichnung und die Kosten je Monat; letztere fliessen in Admin -> Kosten
-- ein. Beide Spalten fehlten, weil der Export der Vorlage nur die
-- Oberflaeche enthaelt — aufgefallen ist es, als portale_liste() sie lesen
-- wollte und die Migration mit "column z.bezeichnung does not exist" abbrach.
-- ===========================================================================

alter table public.portal_zugaenge add column if not exists bezeichnung text;
alter table public.portal_zugaenge add column if not exists kosten_monat numeric(12,2);

comment on column public.portal_zugaenge.bezeichnung is
  'Freie Bezeichnung des Zugangs. Leer: die Oberflaeche nimmt den Portalnamen.';
comment on column public.portal_zugaenge.kosten_monat is
  'Portalgebuehr je Monat. Fliesst in Admin -> Kosten ein (Stufe 121).';
