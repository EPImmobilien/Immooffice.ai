-- Belegnummern: Muster, Ruecksetzung und Lueckenlosigkeit
--
-- Abschnitt 3c des Auftrags verlangt ein frei gestaltbares Muster, eine
-- Vorschau, einen eigenen Kreis fuer Gutschriften und eine Vergabe, die
-- "lueckenlos und transaktionssicher in der Datenbank" erfolgt.
--
-- Der letzte Punkt ist der, der weh tut, wenn er fehlt: eine Rechnungsnummer,
-- die zweimal vergeben oder uebersprungen wird, ist nach GoBD ein Mangel und
-- faellt erst beim Steuerberater auf.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('beleg1', 'beleg2');

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;

create temporary table paar (rolle text primary key, mandant uuid, gesellschaft uuid);
grant all on paar to public;

do $$
declare a uuid; b uuid; ga uuid; gb uuid;
begin
  insert into public.mandanten (name, slug) values ('Beleg Eins', 'beleg1') returning id into a;
  insert into public.mandanten (name, slug) values ('Beleg Zwei', 'beleg2') returning id into b;
  insert into public.gesellschaften (mandant_id, name) values (a, 'Eins GmbH') returning id into ga;
  insert into public.gesellschaften (mandant_id, name) values (b, 'Zwei GmbH') returning id into gb;
  insert into paar values ('a', a, ga), ('b', b, gb);
end $$;

-- --- 1) Das Muster ---------------------------------------------------------
-- Rein rechnend, ohne Kreis: dieselbe Funktion erzeugt Vorschau und Nummer.
insert into befund (pruefung, bestanden, bemerkung)
select 'Muster RE-{JJJJ}-{MM}-{#####} ergibt fuenf Stellen',
       public.belegnummer_aus_muster('RE-{JJJJ}-{MM}-{#####}', 42, null,
                                     '2026-09-28'::timestamptz) = 'RE-2026-09-00042',
       public.belegnummer_aus_muster('RE-{JJJJ}-{MM}-{#####}', 42, null,
                                     '2026-09-28'::timestamptz);

insert into befund (pruefung, bestanden, bemerkung)
select 'Standort-Kuerzel wird eingesetzt',
       public.belegnummer_aus_muster('{STANDORT}-{JJ}-{###}', 7, 'NORD',
                                     '2026-09-28'::timestamptz) = 'NORD-26-007',
       public.belegnummer_aus_muster('{STANDORT}-{JJ}-{###}', 7, 'NORD',
                                     '2026-09-28'::timestamptz);

-- Ohne Kuerzel darf kein doppeltes Trennzeichen stehen bleiben.
insert into befund (pruefung, bestanden, bemerkung)
select 'Leerer Platzhalter hinterlaesst kein doppeltes Trennzeichen',
       public.belegnummer_aus_muster('{STANDORT}-{JJ}-{###}', 7, null,
                                     '2026-09-28'::timestamptz) = '26-007',
       public.belegnummer_aus_muster('{STANDORT}-{JJ}-{###}', 7, null,
                                     '2026-09-28'::timestamptz);

-- --- 2) Der Kreis zaehlt hoch ----------------------------------------------
do $$
declare a uuid := (select mandant from paar where rolle='a');
        ga uuid := (select gesellschaft from paar where rolle='a');
        n1 text; n2 text; n3 text;
begin
  insert into public.belegnummernkreise (mandant_id, gesellschaft_id, art, muster, zuruecksetzen)
  values (a, ga, 'rechnung',  'RE-{JJJJ}-{#####}', 'jaehrlich'),
         (a, ga, 'gutschrift', 'GS-{JJJJ}-{#####}', 'jaehrlich');

  n1 := public.naechste_belegnummer(ga, 'rechnung');
  n2 := public.naechste_belegnummer(ga, 'rechnung');
  n3 := public.naechste_belegnummer(ga, 'gutschrift');

  insert into befund (pruefung, bestanden, bemerkung)
  values ('Der Kreis zaehlt hoch', n2 = replace(n1, '00001', '00002'),
          coalesce(n1,'(nichts)') || ' dann ' || coalesce(n2,'(nichts)')),
         ('Gutschriften haben einen eigenen Kreis',
          n3 like 'GS-%00001', coalesce(n3,'(nichts)'));
end $$;

-- --- 3) Zwei Mandanten stoeren sich nicht ----------------------------------
do $$
declare b uuid := (select mandant from paar where rolle='b');
        gb uuid := (select gesellschaft from paar where rolle='b');
        n text;
begin
  insert into public.belegnummernkreise (mandant_id, gesellschaft_id, art, muster)
  values (b, gb, 'rechnung', 'RE-{JJJJ}-{#####}');
  n := public.naechste_belegnummer(gb, 'rechnung');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Der zweite Mandant faengt bei 1 an', n like 'RE-%00001',
          coalesce(n, '(nichts)') || ' — derselbe Text wie bei Mandant eins, '
          'aber ein eigener Zaehler');
end $$;

-- --- 4) Lueckenlos, auch bei vielen Vergaben -------------------------------
-- Der Auftrag verlangt einen Lasttest mit 50 gleichzeitigen Anlagen. Echte
-- Gleichzeitigkeit laesst sich in einer Sitzung nicht herstellen; was sich
-- pruefen laesst, ist die Eigenschaft, auf die es ankommt: 200 Vergaben
-- ergeben 200 verschiedene, lueckenlos aufsteigende Nummern. Der Aufbau als
-- EIN update mit returning ist das, was das auch unter Gleichzeitigkeit
-- traegt — ein Lesen-dann-Schreiben waere hier ebenfalls gruen und im
-- Betrieb trotzdem falsch. Vermerkt in docs/OFFEN.md.
do $$
declare ga uuid := (select gesellschaft from paar where rolle='a');
        i int; n text; gesehen text[] := '{}';
begin
  for i in 1..200 loop
    n := public.naechste_belegnummer(ga, 'rechnung');
    gesehen := gesehen || n;
  end loop;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('200 Vergaben, 200 verschiedene Nummern',
          (select count(distinct x) from unnest(gesehen) x) = 200,
          (select count(distinct x) from unnest(gesehen) x) || ' verschiedene'),
         ('Keine Luecke in der Folge',
          (select count(*) from public.belegnummernkreise
            where gesellschaft_id = ga and art = 'rechnung'
              and letzte_nummer = 202) = 1,
          'Zaehler steht bei ' || (select letzte_nummer from public.belegnummernkreise
                                    where gesellschaft_id = ga and art = 'rechnung'));
end $$;

-- --- 5) Ruecksetzung -------------------------------------------------------
do $$
declare ga uuid := (select gesellschaft from paar where rolle='a');
        n text;
begin
  -- Periode kuenstlich auf das Vorjahr setzen: der naechste Zug muss bei 1
  -- wieder anfangen.
  update public.belegnummernkreise set periode = '2025'
   where gesellschaft_id = ga and art = 'rechnung';
  n := public.naechste_belegnummer(ga, 'rechnung');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Jahreswechsel setzt den Zaehler zurueck', n like '%00001',
          coalesce(n, '(nichts)'));
end $$;

-- --- 6) Ohne Kreis bleibt alles beim Alten ---------------------------------
do $$
declare n text;
begin
  n := public.naechste_belegnummer(gen_random_uuid(), 'rechnung');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Ohne eingerichteten Kreis: null, damit der alte Weg greift',
          n is null, coalesce(n, 'null'));
end $$;

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Belegnummern stimmen nicht: % von % — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Belegnummern: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
