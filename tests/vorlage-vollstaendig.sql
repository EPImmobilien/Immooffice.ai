-- Ist die Vorlage vollstaendig uebernommen?
--
-- Die Zahlen rechts sind im Quellprojekt gemessen (Stand 14.09.2026). Der Test
-- vergleicht sie mit dem, was die Migrationen auf einer leeren Instanz
-- tatsaechlich erzeugen. Er sagt nichts darueber, ob das Verhalten stimmt —
-- nur, dass nichts auf dem Weg verloren gegangen ist. Das ist genau die Frage,
-- die bei einem Export ueber eine Textschnittstelle offen bleibt.
--
-- Abweichungen, die so gewollt sind:
--   Buckets 25 -> 22   drei Schrift-Buckets zu einem, shop-tv entfaellt
--   Storage-Richtlinien 63 -> 59   vier fuer shop-tv entfallen
--   Cron-Jobs 34 -> 33   jotform-sync entfaellt
--   Funktionen 84 -> 85   eigene_funktions_url kommt hinzu
--
-- Storage gehoert nicht zum Schema public und wandert beim Verschieben des
-- Altbestands nicht mit. Deshalb zaehlen die beiden Storage-Zeilen die drei
-- Buckets und dreizehn Richtlinien des Altbestands heraus — sonst wuerde der
-- Test bei einer Instanz mit Altbestand anders ausgehen als bei einer ohne.

\set ON_ERROR_STOP on
\pset pager off

-- Einfacher und lesbarer als eine Prozedur: eine Tabelle mit Soll und Ist.
with soll(bereich, soll) as (values
  ('Tabellen', 167), ('Sichten', 4), ('Sequenzen', 5),
  ('Funktionen', 85), ('Trigger', 54), ('Richtlinien', 320),
  ('Primaer- und Eindeutigkeitsschluessel', 211), ('Pruefbedingungen', 94),
  ('Fremdschluessel', 273), ('Indizes ohne Constraint', 243),
  ('Tabellen mit RLS', 166), ('Buckets', 22), ('Storage-Richtlinien', 59),
  ('Cron-Jobs', 33), ('Spalten', 2538)
), ist(bereich, ist) as (values
  ('Tabellen', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relkind='r')),
  ('Sichten', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relkind='v')),
  ('Sequenzen', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relkind='S')),
  ('Funktionen', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.prokind in ('f','p'))),
  ('Trigger', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and not t.tgisinternal)),
  ('Richtlinien', (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
                    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public')),
  ('Primaer- und Eindeutigkeitsschluessel',
     (select count(*) from pg_constraint con join pg_class r on r.oid=con.conrelid
       join pg_namespace n on n.oid=r.relnamespace
       where n.nspname='public' and con.contype in ('p','u'))),
  ('Pruefbedingungen',
     (select count(*) from pg_constraint con join pg_class r on r.oid=con.conrelid
       join pg_namespace n on n.oid=r.relnamespace
       where n.nspname='public' and con.contype='c')),
  ('Fremdschluessel',
     (select count(*) from pg_constraint con join pg_class r on r.oid=con.conrelid
       join pg_namespace n on n.oid=r.relnamespace
       where n.nspname='public' and con.contype='f')),
  ('Indizes ohne Constraint',
     (select count(*) from pg_index x join pg_class c on c.oid=x.indrelid
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public'
         and not exists (select 1 from pg_constraint con where con.conindid = x.indexrelid))),
  ('Tabellen mit RLS', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relkind='r' and c.relrowsecurity)),
  ('Buckets', (select count(*) from storage.buckets
                where id not in ('marke', 'objektbilder', 'objektdokumente'))),
  ('Storage-Richtlinien', (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
                            join pg_namespace n on n.oid=c.relnamespace
                           where n.nspname='storage'
                             and pol.polname not in (
      'marke_aendern', 'marke_anlegen', 'marke_loeschen',
      'objektbilder_aendern', 'objektbilder_anlegen', 'objektbilder_lesen',
      'objektbilder_loeschen', 'objektbilder_web_expose',
      'objektdokumente_aendern', 'objektdokumente_anlegen', 'objektdokumente_lesen',
      'objektdokumente_loeschen', 'objektdokumente_web_expose'))),
  ('Cron-Jobs', (select count(*) from cron.job)),
  ('Spalten', (select count(*) from information_schema.columns where table_schema='public'))
)
select case when s.soll = i.ist then 'ok  ' else 'FEHL' end as ergebnis,
       s.bereich, i.ist, s.soll
from soll s join ist i using (bereich)
order by case when s.soll = i.ist then 1 else 0 end, s.bereich;

do $$
declare abweichungen int;
begin
  select count(*) into abweichungen from (
    select 1 where (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relkind='r') <> 167
    union all
    select 1 where (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
                     join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') <> 320
    union all
    select 1 where (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.prokind in ('f','p')) <> 85
    union all
    select 1 where (select count(*) from information_schema.columns where table_schema='public') <> 2538
    union all
    select 1 where (select count(*) from pg_constraint con join pg_class r on r.oid=con.conrelid
                     join pg_namespace n on n.oid=r.relnamespace
                     where n.nspname='public' and con.contype='f') <> 273
    union all
    select 1 where (select count(*) from cron.job) <> 33
  ) x;
  if abweichungen > 0 then
    raise exception 'Vorlage nicht vollstaendig: % Kennzahl(en) weichen ab', abweichungen;
  end if;
end;
$$;
