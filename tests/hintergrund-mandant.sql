-- Verkuppeln die Hintergrundjobs zwei Mandanten?
--
-- Die Cron-Jobs laufen als postgres, RLS greift dort nicht, und die
-- SECURITY-DEFINER-Funktionen, die sie rufen, hatten keine
-- Mandantenbedingung. tests/funktionen-mandant.sql prueft die ARGUMENTE einer
-- Funktion; dieser Test prueft, was sie INNEN verknuepft.
--
-- Aufbau: zwei Mandanten, je ein Objekt und ein Interessent, dessen Suchprofil
-- auf BEIDE Objekte passen wuerde. Danach wird der Abgleich gefahren. Jeder
-- Treffer, der ueber die Grenze geht, ist ein Fehler.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('hgalpha', 'hgbeta');
delete from auth.users where email like '%@hg.example';

do $$
declare
  a uuid; b uuid;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ia uuid; ib uuid; ka uuid; kb uuid;
  profil jsonb := jsonb_build_object(
    'vermarktungsart', jsonb_build_array('kauf'),
    'objektarten', jsonb_build_array('Haus'),
    'preis_bis', 1000000);
begin
  insert into public.mandanten (name, slug) values ('HG Alpha', 'hgalpha') returning id into a;
  insert into public.mandanten (name, slug) values ('HG Beta',  'hgbeta')  returning id into b;
  insert into auth.users (id, email) values (ua, 'a@hg.example'), (ub, 'b@hg.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'Chef A', 'a@hg.example', 'chef', a),
    (ub, 'Chef B', 'b@hg.example', 'chef', b);

  insert into public.immobilien (bezeichnung, vertragsart, objektart, angebotspreis, status, mandant_id, zustaendig_id)
    values ('Haus Alpha', 'verkauf', 'Haus', 500000, 'vermarktung', a, ua) returning id into ia;
  insert into public.immobilien (bezeichnung, vertragsart, objektart, angebotspreis, status, mandant_id, zustaendig_id)
    values ('Haus Beta',  'verkauf', 'Haus', 500000, 'vermarktung', b, ub) returning id into ib;

  -- Beide Suchprofile wuerden auf BEIDE Objekte passen. Nur die
  -- Mandantenbedingung darf das verhindern.
  insert into public.kontakte (nachname, aktiv, such_profil, mandant_id)
    values ('Interessent Alpha', true, profil, a) returning id into ka;
  insert into public.kontakte (nachname, aktiv, such_profil, mandant_id)
    values ('Interessent Beta',  true, profil, b) returning id into kb;

  create temporary table wer (was text primary key, wert uuid);
  insert into wer values ('mandant_a',a), ('mandant_b',b), ('objekt_a',ia), ('objekt_b',ib),
                         ('kontakt_a',ka), ('kontakt_b',kb), ('nutzer_a',ua), ('nutzer_b',ub);
  grant all on wer to public;
end $$;

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;

-- Der volle Abgleich, wie ihn der Cron-Job faehrt: ohne Anmeldung, als
-- Eigentuemer der Funktion.
select public.suchkriterien_abgleich(null, null);

insert into befund (pruefung, bestanden, bemerkung)
select 'Kein Treffer ueber die Mandantengrenze',
       count(*) = 0,
       count(*) || ' grenzueberschreitende(r) Treffer'
  from public.suchkriterien_treffer t
  join public.immobilien o on o.id = t.immobilie_id
  join public.kontakte k on k.id = t.kontakt_id
 where o.mandant_id <> k.mandant_id;

-- Und die Gegenprobe: innerhalb eines Mandanten muss er weiterhin finden.
-- Ein Abgleich, der nichts mehr findet, ist kein Datenschutz, sondern ein
-- Ausfall.
insert into befund (pruefung, bestanden, bemerkung)
select 'Innerhalb eines Mandanten findet er weiterhin',
       count(*) >= 2,
       count(*) || ' Treffer innerhalb der eigenen Grenzen'
  from public.suchkriterien_treffer t
  join public.immobilien o on o.id = t.immobilie_id
  join public.kontakte k on k.id = t.kontakt_id
 where o.mandant_id = k.mandant_id;

-- Auch ueber den Knopf in der Oberflaeche, also angemeldet: Alphas Objekt darf
-- keine Treffer mit Betas Interessenten erzeugen.
do $$
declare n int;
begin
  delete from public.suchkriterien_treffer;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='nutzer_a'))::text, true);
  perform public.suchkriterien_abgleich((select wert from wer where was='objekt_a'), null);
  select count(*) into n
    from public.suchkriterien_treffer t
    join public.kontakte k on k.id = t.kontakt_id
   where k.mandant_id = (select wert from wer where was='mandant_b');
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Angemeldet: Alphas Objekt trifft keinen Kontakt von Beta', n = 0,
            n || ' Treffer mit Betas Kontakten');
end $$;

-- Die Terminerinnerung verknuepft ueber den NAMEN. Zwei Mandanten mit
-- gleichnamigen Mitarbeitern duerfen sich nicht gegenseitig erinnern.
do $$
declare n int; ta uuid;
begin
  update public.profiles set name = 'Thomas Mustermann'
   where id in ((select wert from wer where was='nutzer_a'), (select wert from wer where was='nutzer_b'));
  insert into public.termine (titel, datum, uhrzeit, art, teilnehmer, mandant_id, ersteller_id)
    values ('Besichtigung Alpha', (now() at time zone 'Europe/Berlin')::date,
            ((now() at time zone 'Europe/Berlin') + interval '30 minutes')::time,
            'Besichtigung', array['Thomas Mustermann'],
            (select wert from wer where was='mandant_a'),
            (select wert from wer where was='nutzer_a'))
    returning id into ta;

  -- Die Funktion selbst laesst sich hier nicht fahren: sie ruft net.http_post
  -- und steigt ohne das Vault-Geheimnis vorher aus. Geprueft wird deshalb ihre
  -- Auswahl, Wort fuer Wort aus ihrem Quelltext geholt — nicht eine hier
  -- nachgebaute Abfrage. Der erste Entwurf dieses Tests hat genau das getan
  -- und deshalb auch ohne fork_15 gruen geleuchtet.
  select count(*) into n from pg_proc pr
    join pg_namespace ns on ns.oid = pr.pronamespace
   where ns.nspname = 'public' and pr.proname = 'push_termin_erinnerungen_senden'
     and pr.prosrc like '%p.mandant_id = t.mandant_id%';
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Terminerinnerung waehlt nur Profile desselben Mandanten', n = 1,
            case when n = 1 then 'p.mandant_id = t.mandant_id steht in der Auswahl'
                 else 'die Bedingung fehlt in push_termin_erinnerungen_senden' end);

  -- Und die Rueckfallebene der Expose-Nachfassaufgabe, die sonst den
  -- aeltesten Chef der ganzen Datenbank nimmt.
  select count(*) into n from pg_proc pr
    join pg_namespace ns on ns.oid = pr.pronamespace
   where ns.nspname = 'public' and pr.proname = 'expose_nachfass_aufgaben'
     and pr.prosrc like '%mandant_id = v.mandant_id%';
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Expose-Nachfassen faellt nicht auf einen fremden Chef zurueck', n = 1,
            case when n = 1 then 'die Rueckfallebene ist auf den Mandanten begrenzt'
                 else 'der aelteste Chef der ganzen Datenbank waere zustaendig' end);
end $$;

-- Der Newsletter: ohne Anmeldung durfte niemand die Empfaengerliste sehen,
-- und ein angemeldeter Chef nur die des eigenen Mandanten. Beides war offen.
do $$
declare n int;
begin
  insert into public.newsletter_anmeldungen (email, name, bestaetigt_am, mandant_id)
  values ('interessent@alpha.example', 'Anna Alpha', now(), (select wert from wer where was='mandant_a')),
         ('interessent@beta.example',  'Bert Beta',  now(), (select wert from wer where was='mandant_b'));

  -- 1) Ohne Anmeldung: gar nichts.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.newsletter_empfaenger(null, null);
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Ohne Anmeldung keine Newsletter-Empfaenger', n = 0, n || ' Empfaenger sichtbar');

  -- 2) Als Chef von Alpha: nur die eigenen.
  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated',
                      'sub', (select wert from wer where was='nutzer_a'))::text, true);
  select count(*) into n from public.newsletter_empfaenger(null, null)
   where email like '%@beta.example';
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Alphas Chef sieht keine Empfaenger von Beta', n = 0,
            n || ' fremde(r) Empfaenger sichtbar');

  select count(*) into n from public.newsletter_empfaenger(null, null)
   where email like '%@alpha.example';
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Alphas Chef sieht seine eigenen Empfaenger', n = 1,
            n || ' eigene(r) Empfaenger sichtbar');
  perform set_config('request.jwt.claims', '', true);
end $$;

select nr, case when bestanden then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where not bestanden;
  if n > 0 then
    raise exception 'Hintergrundjobs verkuppeln Mandanten: % von % gescheitert — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Hintergrundjobs halten die Grenze: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
