-- Ist jede Tabelle eingestuft, und traegt jede Mandantentabelle ihre Spalte?
--
-- Die Einstufung in public.mandanten_einstufung entscheidet, ob eine Tabelle
-- eine mandant_id bekommt und damit ueberhaupt getrennt werden kann. Wer eine
-- Tabelle anlegt und hier nicht eintraegt, baut ein Leck — und zwar eines,
-- das niemand sieht, weil die Anwendung funktioniert.
--
-- Geprueft wird beides: dass die Liste vollstaendig ist UND dass sie zum
-- Schema passt. Eine Liste, die etwas behauptet, was nicht stimmt, ist
-- schlimmer als keine.

\set ON_ERROR_STOP on
\pset pager off

create temporary table einstufung_pruefung as
with tabellen as (
  select c.relname as tabelle
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
), befund as (
  select 'nicht eingestuft' as art, t.tabelle
    from tabellen t
    left join public.mandanten_einstufung e on e.tabelle = t.tabelle
   where e.tabelle is null
  union all
  select 'eingestuft, aber nicht vorhanden', e.tabelle
    from public.mandanten_einstufung e
    left join tabellen t on t.tabelle = e.tabelle
   where t.tabelle is null
  union all
  select 'MANDANT ohne mandant_id', e.tabelle
    from public.mandanten_einstufung e
   where e.gruppe = 'MANDANT'
     and not exists (select 1 from information_schema.columns k
                      where k.table_schema = 'public' and k.table_name = e.tabelle
                        and k.column_name = 'mandant_id')
  union all
  select 'MANDANT ohne Index auf mandant_id', e.tabelle
    from public.mandanten_einstufung e
   where e.gruppe = 'MANDANT'
     and not exists (select 1 from pg_indexes i
                      where i.schemaname = 'public' and i.tablename = e.tabelle
                        and i.indexdef like '%(mandant_id)%')
  union all
  -- Die Gegenrichtung: eine Tabelle, die KEINE Mandantentabelle sein soll,
  -- aber eine mandant_id traegt, ist entweder falsch eingestuft oder die
  -- Spalte gehoert weg. Beides will gesehen werden.
  select 'nicht MANDANT, traegt aber mandant_id', e.tabelle
    from public.mandanten_einstufung e
   where e.gruppe in ('GLOBAL', 'DIENST')
     and exists (select 1 from information_schema.columns k
                  where k.table_schema = 'public' and k.table_name = e.tabelle
                    and k.column_name = 'mandant_id')
  union all
  -- Ohne Vorgabewert traegt jede neue Zeile mandant_id = null. Unter RLS ist
  -- sie damit fuer jeden unsichtbar — kein Sicherheitsloch, aber stiller
  -- Datenverlust, und der faellt erst auf, wenn jemand seine Daten sucht.
  select 'MANDANT ohne Vorgabewert auf mandant_id', e.tabelle
    from public.mandanten_einstufung e
   where e.gruppe = 'MANDANT'
     and exists (select 1 from information_schema.columns k
                  where k.table_schema = 'public' and k.table_name = e.tabelle
                    and k.column_name = 'mandant_id'
                    and coalesce(k.column_default, '') <> 'aktuelle_mandant_id()')
)
select * from befund;

select gruppe, count(*) as tabellen
  from public.mandanten_einstufung group by gruppe order by count(*) desc;

select art, tabelle from einstufung_pruefung order by art, tabelle;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(art || ': ' || tabelle, '; ')
    into n, liste from einstufung_pruefung;
  if n > 0 then
    raise exception 'Einstufung passt nicht zum Schema: % Befund(e) — %', n, liste;
  end if;
  raise notice 'Jede Tabelle ist eingestuft, jede Mandantentabelle traegt mandant_id und einen Index.';
end $$;
