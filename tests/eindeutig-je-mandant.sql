-- Darf der zweite Mandant dieselben Namen fuehren wie der erste?
--
-- Die Vorlage war einmandantig. Ihre Eindeutigkeitsregeln gelten deshalb
-- global: EINE Rechnungsnummer "RE-2026-001", EIN Standort "standard", EINE
-- Akquisequelle "website". Das faellt erst auf, wenn ein zweiter Mandant
-- dazukommt — und dann als Fehlermeldung, die nichts erklaert.
--
-- Dieser Test legt beide Mandanten an und laesst sie dieselben Namen fuehren.
-- Jede Kollision ist ein Fehler.
--
-- WICHTIG, aus Schaden gelernt: Der erste Entwurf hat die Einfuegungen in
-- einer Schleife per format() gebaut. Der Bezeichner `wert` war dabei
-- mehrdeutig (Hilfstabelle und Variable), alle zehn sind aus dem FALSCHEN
-- Grund gescheitert, und ein "when others"-Zweig hat das als bestanden
-- gezaehlt. Deshalb steht hier jede Einfuegung ausgeschrieben, mit allen
-- Pflichtfeldern, und nur unique_violation zaehlt als Kollision.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('eindalpha', 'eindbeta');

create temporary table paar (rolle text primary key, mandant uuid);
grant all on paar to public;

do $$
declare a uuid; b uuid;
begin
  insert into public.mandanten (name, slug) values ('Eind Alpha', 'eindalpha') returning id into a;
  insert into public.mandanten (name, slug) values ('Eind Beta',  'eindbeta')  returning id into b;
  insert into paar values ('a', a), ('b', b);
end $$;

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;

-- Jede Einfuegung legt DENSELBEN Namen fuer beide Mandanten an. Geht das
-- durch, ist die Eindeutigkeit je Mandant; scheitert es mit unique_violation,
-- gilt sie noch global.
create or replace function pg_temp.probe(was text, anweisung text) returns void
language plpgsql as $$
declare meldung text;
begin
  execute anweisung;
  insert into befund (pruefung, bestanden, bemerkung)
    values (was, true, 'beide Mandanten angelegt');
exception
  when unique_violation then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values (was, false, 'KOLLISION: ' || left(meldung, 70));
  when others then
    get stacked diagnostics meldung = message_text;
    -- Alles andere ist ein Fehler im Test, nicht im Schema — und wird auch so
    -- gezaehlt. Ein Testfall, der nicht laeuft, darf nicht gruen leuchten.
    insert into befund (pruefung, bestanden, bemerkung)
      values (was, false, 'Testfall lief nicht: ' || left(meldung, 60));
end $$;

-- Das Gegenstueck: hier IST die globale Eindeutigkeit gewollt. Geht die
-- zweite Zeile durch, ist die Regel weg — und die oeffentliche Adresse
-- mehrdeutig.
create or replace function pg_temp.probe_global(was text, anweisung text) returns void
language plpgsql as $$
declare meldung text;
begin
  execute anweisung;
  insert into befund (pruefung, bestanden, bemerkung)
    values (was, false, 'zweimal angelegt — die Adresse waere mehrdeutig');
exception
  when unique_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values (was, true, 'der zweite wird abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values (was, false, 'Testfall lief nicht: ' || left(meldung, 60));
end $$;

do $$
declare a uuid := (select mandant from paar where rolle='a');
        b uuid := (select mandant from paar where rolle='b');
begin
  perform pg_temp.probe('Standort "standard"', format(
    $q$insert into public.firma_stammdaten (firma_name, slug, mandant_id)
       values ('Alpha GmbH', 'standard', %L), ('Beta GmbH', 'standard', %L)$q$, a, b));

  perform pg_temp.probe('Akquisequelle "website"', format(
    $q$insert into public.akq_quellen (name, art, slug, mandant_id)
       values ('Website', 'online', 'website', %L), ('Website', 'online', 'website', %L)$q$, a, b));

  perform pg_temp.probe('Checklisten-Vorlage "Eigentumswohnung"', format(
    $q$insert into public.checkliste_vorlagen (name, mandant_id)
       values ('Eigentumswohnung', %L), ('Eigentumswohnung', %L)$q$, a, b));

  perform pg_temp.probe('Portalzugang "immoscout"', format(
    $q$insert into public.portal_zugaenge (portal, ftp_host, ftp_user, ftp_passwort, mandant_id)
       values ('immoscout', 'ftp.example', 'u', 'p', %L),
              ('immoscout', 'ftp.example', 'u', 'p', %L)$q$, a, b));

  perform pg_temp.probe('Anbindung "onoffice"', format(
    $q$insert into public.external_credentials (service, label, url, username, password_obfuscated, mandant_id)
       values ('onoffice', 'onOffice', 'https://example.test', 'u', 'x', %L),
              ('onoffice', 'onOffice', 'https://example.test', 'u', 'x', %L)$q$, a, b));

  perform pg_temp.probe('Geschaeftsjahr 2026', format(
    $q$insert into public.firma_kennzahlen (jahr, mandant_id) values (2026, %L), (2026, %L)$q$, a, b));

  perform pg_temp.probe('Briefing vom selben Tag', format(
    $q$insert into public.news_briefings (briefing_datum, zusammenfassung, mandant_id)
       values ('2026-09-28', 'Text', %L), ('2026-09-28', 'Text', %L)$q$, a, b));

  -- projekte.slug ist seit fork_29 WIEDER plattformweit eindeutig — mit
  -- Absicht: er ist die oeffentliche Adresse des Neubauportals und wird ohne
  -- Anmeldung aufgerufen. Geprueft wird deshalb das Gegenteil: dass zwei
  -- Mandanten denselben Slug NICHT beide bekommen.
  perform pg_temp.probe_global('Projektkuerzel "neubau-nord" bleibt plattformweit vergeben', format(
    $q$insert into public.projekte (slug, name, mandant_id)
       values ('neubau-nord', 'Neubau Nord', %L), ('neubau-nord', 'Neubau Nord', %L)$q$, a, b));

  perform pg_temp.probe('Buchungsregel "miete"', format(
    $q$insert into public.liquid_kategorisierung (match_key, kategorie, mandant_id)
       values ('miete', 'Einnahmen', %L), ('miete', 'Einnahmen', %L)$q$, a, b));

  perform pg_temp.probe('Rechnungsnummer "RE-2026-001"', format(
    $q$insert into public.rechnungen (empfaenger_name, rechnungsnummer, mandant_id)
       values ('Kunde', 'RE-2026-001', %L), ('Kunde', 'RE-2026-001', %L)$q$, a, b));
end $$;

-- Gegenprobe: INNERHALB eines Mandanten muss die Eindeutigkeit weiter greifen.
-- Ein Index, der alles durchlaesst, ist keine Eindeutigkeit.
do $$
declare a uuid := (select mandant from paar where rolle='a'); meldung text;
begin
  begin
    execute format(
      $q$insert into public.akq_quellen (name, art, slug, mandant_id)
         values ('Doppelt', 'online', 'doppelt', %L),
                ('Doppelt', 'online', 'doppelt', %L)$q$, a, a);
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Im selben Mandanten bleibt der Name eindeutig', false, 'zweimal ging durch');
  exception when unique_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Im selben Mandanten bleibt der Name eindeutig', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Im selben Mandanten bleibt der Name eindeutig', false,
              'Testfall lief nicht: ' || left(meldung, 60));
  end;
end $$;

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Der zweite Mandant kollidiert mit dem ersten: % von % — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Zwei Mandanten koennen dieselben Namen fuehren: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
