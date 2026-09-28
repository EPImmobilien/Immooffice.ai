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
-- Die zwanzig herausgezaehlten Storage-Richtlinien sind seit fork_10 ohnehin
-- geloescht — bis auf die vier des Buckets 'branding'. Die Liste bleibt
-- trotzdem stehen: sie macht den Test unabhaengig davon, ob er gegen eine
-- frisch migrierte Instanz oder gegen ein Projekt laeuft, in dem fork_10 noch
-- nicht angewendet ist.
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
  -- Gemessen gegen das laufende Projekt nach fork_05. Eine Zeile je Kennzahl,
  -- damit sie nicht in Teilbetraegen auseinanderlaeuft; welche Migration was
  -- beigetragen hat, steht im Kopf der jeweiligen Datei.
  ('Tabellen', 3, 'mandanten, gesellschaften, mandanten_einstufung'),
  ('Tabellen mit RLS', 3, 'dieselben drei'),
  ('Richtlinien', 7, 'amt_vorlage 2, mandanten 2, gesellschaften 2, einstufung 1'),
  ('Richtlinien', 174, 'fork_07: eine restriktive Mandantentrennung je '
                       'MANDANT-Tabelle (171), dazu gesellschaften, '
                       'firma_stammdaten und profiles'),
  ('Funktionen', 1, 'aktuelle_mandant_id()'),
  ('Spalten', 199, 'mandanten 11, gesellschaften 10, mandanten_einstufung 3, '
                   'firma_stammdaten +mandant_id +gesellschaft_id +bundesland, '
                   'profiles +mandant_id, mandant_id auf 171 Mandantentabellen'),
  ('Fremdschluessel', 175, 'mandant_id -> mandanten auf 171 Tabellen, dazu '
                           'gesellschaften, firma_stammdaten (zweimal), profiles'),
  ('Primaer- und Eindeutigkeitsschluessel', 4,
     'drei Primaerschluessel, mandanten.slug eindeutig'),
  ('Pruefbedingungen', 3, 'mandanten.abo_status, bundesland, einstufung.gruppe'),
  ('Indizes ohne Constraint', 180, 'je ein Index auf mandant_id, dazu '
                                   'gesellschaft_id, bundesland, ein Standard'),
  -- fork_08: Ruestzeug fuer den Umzug der Storage-Pfade.
  ('Tabellen', 1, 'fork_08: storage_umzug_token'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'storage_umzug_token.token'),
  ('Spalten', 2, 'storage_umzug_token: token, erstellt_am'),
  ('Funktionen', 1, 'fork_08: storage_ohne_mandant()'),
  -- fork_09: die harte Grenze im Dateispeicher.
  ('Storage-Richtlinien', 1, 'fork_09: mandant_trennung, restriktiv'),
  -- fork_11: Abschnitt 1b, Sichtbarkeitsbereich und das Recht "Export".
  ('Spalten', 1, 'fork_11: profiles.sichtbarkeit'),
  ('Pruefbedingungen', 1, 'fork_11: profiles_sichtbarkeit_check'),
  ('Funktionen', 3, 'fork_11: sichtbare_mitarbeiter(), hat_recht(), '
                    'darf_exportieren()'),
  ('Richtlinien', 6, 'fork_11: sichtbarkeitsbereich auf den sechs Tabellen '
                     'mit zustaendig_id'),
  -- fork_12: eigene Vertragsvorlagen je Mandant.
  ('Tabellen', 1, 'fork_12: vertragsvorlagen'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Spalten', 12, 'vertragsvorlagen: zwoelf Spalten'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'vertragsvorlagen.id'),
  ('Pruefbedingungen', 1, 'vertragsvorlagen_art_check'),
  ('Fremdschluessel', 3, 'mandant_id, gesellschaft_id, hochgeladen_von'),
  ('Indizes ohne Constraint', 2, 'vertragsvorlagen: mandant_id und die Suche'),
  ('Richtlinien', 3, 'fork_12: lesen, pflegen, mandant_trennung'),
  ('Buckets', 1, 'fork_12: vertragsvorlagen'),
  ('Storage-Richtlinien', 2, 'fork_12: Datei lesen und pflegen'),
  -- fork_13: Mandanten-CI an firma_stammdaten.
  ('Spalten', 3, 'fork_13: ci_primaer, ci_akzent, ci_font'),
  ('Pruefbedingungen', 1, 'firma_stammdaten_ci_farben_check'),
  -- fork_14: die Mandantengrenze in den Funktionen.
  ('Funktionen', 2, 'fork_14: mandant_sichern(), mandant_grenze_gilt()'),
  -- fork_17: zehn Eindeutigkeitsregeln werden je Mandant statt global. Die
  -- Regel verschwindet (und mit ihr ihr Index), ein eigener Index kommt.
  ('Primaer- und Eindeutigkeitsschluessel', -10, 'fork_17: zehn Regeln '
     'ersetzt durch Indizes ueber (mandant_id, Spalte)'),
  ('Indizes ohne Constraint', 10, 'fork_17: dieselben zehn als eigener Index'),
  -- fork_18: frei gestaltbare Belegnummern.
  ('Tabellen', 1, 'fork_18: belegnummernkreise'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Spalten', 10, 'belegnummernkreise: zehn Spalten'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'belegnummernkreise.id'),
  ('Pruefbedingungen', 2, 'art und zuruecksetzen'),
  ('Fremdschluessel', 2, 'mandant_id, gesellschaft_id'),
  ('Indizes ohne Constraint', 2, 'belegnummernkreise: eindeutig und mandant_id'),
  ('Richtlinien', 3, 'fork_18: lesen, pflegen, mandant_trennung'),
  ('Funktionen', 2, 'fork_18: belegnummer_aus_muster(), naechste_belegnummer()'),
  -- fork_19: Zahlungsbedingungen und Rechnungsfreigabe.
  ('Tabellen', 2, 'fork_19: zahlungsbedingungen, rechnung_einstellungen'),
  ('Tabellen mit RLS', 2, 'dieselben zwei'),
  ('Spalten', 20, 'zahlungsbedingungen 13, rechnung_einstellungen 6, '
                  'rechnungen.zahlungsbedingung_id'),
  ('Primaer- und Eindeutigkeitsschluessel', 2, 'je ein Primaerschluessel'),
  ('Pruefbedingungen', 2, 'zahlungsbedingungen: Tage und Skonto'),
  ('Fremdschluessel', 6, 'je mandant_id und gesellschaft_id, freigabe_durch, '
                         'rechnungen.zahlungsbedingung_id'),
  ('Indizes ohne Constraint', 4, 'je mandant_id, Standard-Bedingung, '
                                 'Eindeutigkeit der Einstellungen'),
  ('Richtlinien', 6, 'fork_19: je lesen, pflegen, mandant_trennung'),
  ('Funktionen', 5, 'fork_19: zahlungsbedingung_text(), '
                    'rechnung_braucht_freigabe(), rechnung_zur_freigabe(), '
                    'rechnung_freigeben(), rechnung_faelligkeit()'),
  -- fork_20: onOffice abgeschaltet. Vierzehn Cron-Jobs weniger — das ist eine
  -- Abnahme, kein Zuwachs, deshalb eine negative Zahl.
  ('Cron-Jobs', -14, 'fork_20: die onOffice-Jobs sind abbestellt'),
  -- fork_21: der Zahlungstext, damit die Oberflaeche ihn vor dem Speichern
  -- zeigen kann, ohne ihn ein zweites Mal zu bauen.
  ('Funktionen', 1, 'fork_21: zahlungsbedingung_text_aus()'),
  -- fork_22: ein Wachposten, der mandant_id aus dem Elternsatz fuellt, an
  -- sechzehn Tabellen. Sechzehn Trigger, eine Funktion.
  ('Funktionen', 1, 'fork_22: mandant_aus_eltern()'),
  ('Trigger', 16, 'fork_22: mandant_aus_eltern an sechzehn Tabellen')
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
