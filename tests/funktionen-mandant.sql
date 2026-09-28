-- Halten die Funktionen die Mandantengrenze?
--
-- Die restriktiven Richtlinien aus fork_07 schuetzen Tabellen. Sie schuetzen
-- NICHT, was in einer SECURITY-DEFINER-Funktion passiert: die laeuft mit den
-- Rechten ihres Eigentuemers, und RLS greift dort nicht. Genau deshalb hat
-- tests/mandant.sql den Befund nicht gefunden — er prueft Tabellen.
--
-- Dieser Test macht es andersherum: zwei Mandanten, und Alpha ruft jede
-- Funktion mit einer Kennung von Beta auf. Jede muss abweisen.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('fnalpha', 'fnbeta');
delete from auth.users where email like '%@fn.example';

do $$
declare
  a uuid; b uuid;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ra uuid; rb uuid; ia uuid; ib uuid;
begin
  insert into public.mandanten (name, slug) values ('FN Alpha', 'fnalpha') returning id into a;
  insert into public.mandanten (name, slug) values ('FN Beta',  'fnbeta')  returning id into b;
  insert into auth.users (id, email) values (ua, 'a@fn.example'), (ub, 'b@fn.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'Chef A', 'a@fn.example', 'chef', a),
    (ub, 'Chef B', 'b@fn.example', 'chef', b);

  insert into public.firma_stammdaten (firma_name, mandant_id, rechnung_nummer_praefix, rechnung_nummer_mit_jahr, typ)
    values ('Firma A', a, 'RA', true, 'firma') returning id into fa;
  insert into public.firma_stammdaten (firma_name, mandant_id, rechnung_nummer_praefix, rechnung_nummer_mit_jahr, typ)
    values ('Firma B', b, 'RB', true, 'firma') returning id into fb;

  insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values ('Objekt A', 'verkauf', a) returning id into ia;
  insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values ('Objekt B', 'verkauf', b) returning id into ib;

  insert into public.rechnungen (empfaenger_name, mandant_id, absender_firma_id, status)
    values ('Kunde A', a, fa, 'entwurf') returning id into ra;
  insert into public.rechnungen (empfaenger_name, mandant_id, absender_firma_id, status)
    values ('Kunde B', b, fb, 'entwurf') returning id into rb;

  create temporary table wer (was text primary key, wert uuid);
  insert into wer values ('nutzer_a', ua), ('nutzer_b', ub),
                         ('firma_a', fa), ('firma_b', fb),
                         ('objekt_a', ia), ('objekt_b', ib),
                         ('rechnung_a', ra), ('rechnung_b', rb),
                         ('mandant_a', a), ('mandant_b', b);
  grant all on wer to public;
end $$;

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;

-- Alpha meldet sich an und greift nach Betas Sachen.
do $$
declare
  r record;
  meldung text;
  zustand text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='nutzer_a'))::text, true);
  set local role authenticated;

  for r in
    select * from (values
      ('naechste_rechnungsnummer',
       $q$select public.naechste_rechnungsnummer((select wert from wer where was='firma_b'))$q$),
      ('rechnung_startnummer_info',
       $q$select public.rechnung_startnummer_info((select wert from wer where was='firma_b'))$q$),
      ('rechnung_startnummer_setzen',
       $q$select public.rechnung_startnummer_setzen((select wert from wer where was='firma_b'), 500)$q$),
      ('rechnung_stellen',
       $q$select public.rechnung_stellen((select wert from wer where was='rechnung_b'))$q$),
      ('rechnung_stornieren',
       $q$select public.rechnung_stornieren((select wert from wer where was='rechnung_b'), 'Test')$q$),
      ('rechnung_bezahlt_markieren',
       $q$select public.rechnung_bezahlt_markieren((select wert from wer where was='rechnung_b'), current_date, 1)$q$),
      ('delete_mitarbeiter',
       $q$select public.delete_mitarbeiter((select wert from wer where was='nutzer_b'))$q$),
      ('objekt_kosten_berechnen',
       $q$select public.objekt_kosten_berechnen((select wert from wer where was='objekt_b'))$q$),
      ('suchkriterien_abgleich',
       $q$select public.suchkriterien_abgleich((select wert from wer where was='objekt_b'), null)$q$)
    ) v(name, aufruf)
  loop
    begin
      execute r.aufruf;
      insert into befund (pruefung, bestanden, bemerkung)
        values (r.name || ' weist Betas Kennung ab', false, 'Aufruf ging durch');
    exception when others then
      get stacked diagnostics meldung = message_text, zustand = returned_sqlstate;
      insert into befund (pruefung, bestanden, bemerkung)
        values (r.name || ' weist Betas Kennung ab',
                zustand = '42501',
                'SQLSTATE ' || zustand || ': ' || left(meldung, 60));
    end;
  end loop;
  reset role;
end $$;

-- Gegenprobe: mit der EIGENEN Kennung muss es weiterhin gehen. Ein Waechter,
-- der alles abweist, ist kein Waechter, sondern ein Ausfall.
do $$
declare nummer text; meldung text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='nutzer_a'))::text, true);
  set local role authenticated;
  begin
    select public.naechste_rechnungsnummer((select wert from wer where was='firma_a')) into nummer;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Alpha bekommt seine eigene Rechnungsnummer', nummer like 'RA-%', 'erhalten: ' || coalesce(nummer, '(nichts)'));
  exception when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Alpha bekommt seine eigene Rechnungsnummer', false, 'abgewiesen: ' || left(meldung, 60));
  end;
  reset role;
end $$;

-- Und die beiden SQL-Funktionen geben leer zurueck statt Auskunft.
do $$
declare n int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='nutzer_a'))::text, true);
  set local role authenticated;
  select count(*) into n from public.eigentuemer_ansprechpartner_info(gen_random_uuid());
  insert into befund (pruefung, bestanden, bemerkung)
    values ('eigentuemer_ansprechpartner_info gibt nichts preis', n = 0, n || ' Zeile(n)');
  reset role;
end $$;

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Funktionen halten die Mandantengrenze nicht: % von % gescheitert — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Funktionen halten die Mandantengrenze: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
