-- ===========================================================================
-- Fork-eigene Migration 04 — konto_id auf allen Mandantentabellen
--
-- Die Einstufung jeder Tabelle steht in public.mandanten_einstufung, nicht in
-- einem Skript daneben: so kann tests/mandant-einstufung.py sie gegen das
-- Schema pruefen, und wer eine Tabelle hinzufuegt, ohne sie einzustufen,
-- faellt auf.
--
-- Vier Gruppen:
--   MANDANT  Daten eines Kunden. Bekommt konto_id, Fremdschluessel, Index.
--   GLOBAL   Fuer alle gleich (Behoerdenadressen, Postleitzahlen).
--   DIENST   Nur service_role, RLS an, keine Richtlinie (siehe fork_01).
--   GRENZE   Die Struktur selbst.
--
-- Die Voreinstufung ist MANDANT, und zwar mit Absicht: eine Tabelle, die
-- faelschlich eine konto_id bekommt, kostet eine Spalte. Eine, die keine
-- bekommt, obwohl sie eine braucht, ist ein Leck. Wer eine neue Tabelle
-- anders eingestuft haben will, traegt sie hier ein.
--
-- Noch NICHT in dieser Migration: NOT NULL und die Richtlinien. NOT NULL geht
-- erst nach dem Backfill, und der braucht ein erstes Konto. Die Richtlinien
-- sind ein eigener Schritt — 351 Stueck umzustellen ist nichts, was nebenbei
-- in einer Migration passiert, die Spalten anlegt.
-- ===========================================================================

create table public.mandanten_einstufung (
  tabelle text primary key,
  gruppe  text not null check (gruppe in ('MANDANT','GLOBAL','DIENST','GRENZE')),
  grund   text not null
);
comment on table public.mandanten_einstufung is
  'Fuer jede Tabelle in public: braucht sie eine konto_id? Die Einstufung steht hier und nicht in einem Skript daneben, damit tests/mandant-einstufung.py sie gegen das Schema pruefen kann und nichts auseinanderlaeuft.';
alter table public.mandanten_einstufung enable row level security;
create policy "einstufung_lesen" on public.mandanten_einstufung
  for select to authenticated using (true);

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('amt_adressen','GLOBAL','Behoerdenadressen — dieselben fuer jeden Makler'),
  ('amt_vorlage','GLOBAL','Vorlagen fuer Unterlagen-Anforderungen, Katalog'),
  ('amt_zusaetzliche_regionen','GLOBAL','Zuordnung Behoerde zu Region, Katalog'),
  ('plz_region','GLOBAL','Postleitzahl zu Region, Katalog'),
  ('mandanten_einstufung','GLOBAL','diese Tabelle selbst'),
  ('ea_accounts','DIENST','Rest einer Energieausweis-Anbindung, unbenutzt'),
  ('ea_events','DIENST','wie ea_accounts'),
  ('ea_orders','DIENST','wie ea_accounts'),
  ('eigentuemer_benachrichtigung_queue','DIENST','Warteschlange einer Edge Function'),
  ('immobilie_datei_geloescht','DIENST','Merkliste fuer den onOffice-Abgleich'),
  ('onoffice_expose_pruefung','DIENST','Merkliste des onOffice-Expose-Abgleichs'),
  ('waechter_status','DIENST','Zustand des Waechters ueber die Hintergrundjobs'),
  ('suchkriterien_lauf','DIENST','Zeitstempel des letzten Laufs'),
  ('expose_debug','DIENST','Diagnoseausgabe der Expose-Erzeugung'),
  ('geo_cache','DIENST','Adresse zu Koordinaten. BEWUSST kein Mandantenbezug, aber auch kein Lesezugriff fuer Nutzer: der Schluessel ist die Adresse, und wer den Cache lesen darf, sieht, welche Adressen andere Mandanten nachgeschlagen haben. Als gemeinsamer Cache sinnvoll, als lesbare Tabelle ein Leck.'),
  ('konten','GRENZE','ist die Grenze'),
  ('gesellschaften','GRENZE','traegt konto_id bereits'),
  ('profiles','GRENZE','traegt konto_id bereits'),
  ('firma_stammdaten','GRENZE','traegt konto_id bereits');

-- Alles Uebrige ist Mandantendatum. Das ist die sichere Richtung: eine
-- Tabelle, die faelschlich eine konto_id bekommt, kostet eine Spalte. Eine,
-- die keine bekommt, obwohl sie eine braucht, ist ein Leck.
insert into public.mandanten_einstufung (tabelle, gruppe, grund)
select c.relname, 'MANDANT', 'Daten eines Kunden (Voreinstufung)'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and not exists (select 1 from public.mandanten_einstufung e where e.tabelle = c.relname);

-- konto_id auf jede MANDANT-Tabelle, dazu ein Index. Noch nicht NOT NULL:
-- das geht erst nach dem Backfill, und der braucht ein erstes Konto.
do $$
declare r record; n int := 0;
begin
  for r in select tabelle from public.mandanten_einstufung
            where gruppe = 'MANDANT' order by tabelle loop
    execute format('alter table public.%I add column if not exists konto_id uuid '
                   'references public.konten(id) on delete cascade', r.tabelle);
    execute format('create index if not exists %I on public.%I (konto_id)',
                   r.tabelle || '_konto_idx', r.tabelle);
    n := n + 1;
  end loop;
  raise notice 'konto_id auf % Tabellen gesetzt', n;
end $$;
