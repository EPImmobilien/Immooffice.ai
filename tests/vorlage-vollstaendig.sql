-- Ist die Vorlage vollstaendig uebernommen?
--
-- Die Zahlen rechts sind im Quellprojekt gemessen (Stand 26.09.2026). Der Test
-- vergleicht sie mit dem, was die Migrationen auf einer leeren Instanz
-- tatsaechlich erzeugen. Er sagt nichts darueber, ob das Verhalten stimmt —
-- nur, dass nichts auf dem Weg verloren gegangen ist. Das ist genau die Frage,
-- die bei einem Export ueber eine Textschnittstelle offen bleibt.
--
-- Abweichungen, die so gewollt sind:
--   Buckets 25 -> 22   drei Schrift-Buckets zu einem, shop-tv entfaellt
--   Storage-Richtlinien 63 -> 59   vier fuer shop-tv entfallen
--   Cron-Jobs 43 -> 42   jotform-sync entfaellt
--   Funktionen 103 -> 104  eigene_funktions_url kommt hinzu
--
-- Tabellen mit RLS ist von 166 auf 187 gestiegen: alle 20 neuen Tabellen haben
-- RLS, und der Befund suchkriterien_lauf ist in der Vorlage behoben.
--
-- Storage gehoert nicht zum Schema public und wandert beim Verschieben des
-- Altbestands nicht mit. Deshalb zaehlen die beiden Storage-Zeilen die fuenf
-- Buckets und zwanzig Richtlinien des Altbestands heraus — sonst wuerde der
-- Test bei einer Instanz mit Altbestand anders ausgehen als bei einer ohne.
-- Die Liste stand zuerst auf drei Buckets und dreizehn Richtlinien; beim
-- Abgleich gegen das laufende Projekt kamen 'branding' (vier Richtlinien) und
-- 'importe' (drei) dazu. Nicht zu verwechseln mit dem eigenen Bucket
-- 'branding-assets' der Vorlage, dessen Richtlinien branding_lesen,
-- branding_schreiben und branding_loeschen heissen.

\set ON_ERROR_STOP on
\pset pager off

-- AB PHASE 2 waechst der Fork ueber die Vorlage hinaus. Der Test bleibt
-- trotzdem scharf: er vergleicht nicht mehr gegen eine feste Zahl, sondern
-- gegen "Vorlage plus angemeldeter Zuwachs". Wer etwas hinzufuegt, traegt es
-- unten in `zuwachs` ein, mit Grund. Wer etwas verliert, faellt weiterhin auf.
--
-- Ohne diese Trennung haette der Test zwei schlechte Enden: entweder man hebt
-- die Zahl bei jeder Aenderung an, dann prueft er nichts mehr, oder man
-- schaltet ihn ab, dann erst recht nicht.

-- Einfacher und lesbarer als eine Prozedur: eine Tabelle mit Soll und Ist.
-- Sie wird EINMAL gebildet; Ausgabe und Abbruchbedingung lesen beide daraus.
-- Vorher standen die Zahlen zweimal in dieser Datei — in der Tabelle und
-- noch einmal hartcodiert im do-Block darunter. Am 28.09.2026 liefen die
-- beiden Fassungen auseinander: die Tabelle meldete fuenfzehnmal ok, der
-- do-Block brach trotzdem ab.
create temporary table pruefung as
with vorlage(bereich, soll) as (values
  ('Tabellen', 187), ('Sichten', 5), ('Sequenzen', 6),
  ('Funktionen', 104), ('Trigger', 64), ('Richtlinien', 344),
  ('Primaer- und Eindeutigkeitsschluessel', 232), ('Pruefbedingungen', 98),
  ('Fremdschluessel', 302), ('Indizes ohne Constraint', 266),
  ('Tabellen mit RLS', 187), ('Buckets', 22), ('Storage-Richtlinien', 59),
  ('Cron-Jobs', 42), ('Spalten', 2791)
),
-- Angemeldeter Zuwachs des Forks gegenueber der Vorlage.
zuwachs(bereich, mehr, grund) as (values
  ('Richtlinien', 2, 'fork_01: amt_vorlage — Team liest, Chef pflegt'),
  -- fork_02: konten und gesellschaften, dazu die Verweise nach oben.
  ('Tabellen', 2, 'fork_02: konten, gesellschaften'),
  ('Tabellen mit RLS', 2, 'fork_02: dieselben beiden'),
  ('Richtlinien', 4, 'fork_02: je zwei fuer konten und gesellschaften'),
  ('Funktionen', 1, 'fork_02: aktuelle_konto_id()'),
  ('Spalten', 24, 'fork_02: konten 11, gesellschaften 10, '
                  'firma_stammdaten +konto_id +gesellschaft_id, profiles +konto_id'),
  ('Fremdschluessel', 4, 'fork_02: gesellschaften->konten, firma_stammdaten->konten, '
                         'firma_stammdaten->gesellschaften, profiles->konten'),
  ('Primaer- und Eindeutigkeitsschluessel', 3,
     'fork_02: zwei Primaerschluessel, konten.slug eindeutig'),
  ('Pruefbedingungen', 1, 'fork_02: konten.abo_status'),
  -- fork_03: das Bundesland des Standorts.
  ('Spalten', 1, 'fork_03: firma_stammdaten.bundesland'),
  ('Pruefbedingungen', 1, 'fork_03: bundesland aus den 16 Kuerzeln'),
  ('Indizes ohne Constraint', 1, 'fork_03: firma_stammdaten_bundesland_idx'),
  ('Indizes ohne Constraint', 5,
     'fork_02: gesellschaften_ein_standard, gesellschaften_konto_idx, '
     'firma_stammdaten_konto_idx, firma_stammdaten_gesellschaft_idx, profiles_konto_idx')
),
soll(bereich, soll) as (
  select v.bereich,
         v.soll + coalesce((select sum(z.mehr) from zuwachs z
                             where z.bereich = v.bereich), 0)
    from vorlage v
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
                where id not in ('branding', 'importe', 'marke', 'objektbilder',
                                 'objektdokumente'))),
  ('Storage-Richtlinien', (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
                            join pg_namespace n on n.oid=c.relnamespace
                           where n.nspname='storage'
                             and pol.polname not in (
      'branding_delete', 'branding_insert', 'branding_read', 'branding_update',
      'importe_anlegen', 'importe_lesen', 'importe_loeschen',
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
from soll s join ist i using (bereich);

select ergebnis, bereich, ist, soll from pruefung
order by case when ergebnis = 'ok  ' then 1 else 0 end, bereich;

do $$
declare
  abweichungen int;
  liste text;
begin
  select count(*), string_agg(bereich || ': ist ' || ist || ', soll ' || soll, '; ')
    into abweichungen, liste
    from pruefung where ist <> soll;
  if abweichungen > 0 then
    raise exception 'Vorlage nicht vollstaendig: % Kennzahl(en) weichen ab — %',
      abweichungen, liste;
  end if;
end;
$$;
