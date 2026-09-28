-- Fuellt der Wachposten den Mandanten aus dem Elternsatz — und nur dort, wo
-- er soll?
--
-- Drei Fragen, und die dritte ist die wichtigste:
--   1. Entsteht eine Zeile OHNE mandant_id mit dem Mandanten ihrer Eltern?
--   2. Bleibt eine Zeile MIT mandant_id unveraendert?
--   3. Laesst sich der Wachposten missbrauchen, um eine Zeile in einen
--      FREMDEN Mandanten zu schreiben?
--
-- Zu 3: Postgres wertet die WITH-CHECK-Bedingung einer Richtlinie NACH den
-- BEFORE-Triggern aus. Traegt ein angemeldeter Nutzer ein Kind eines fremden
-- Elternsatzes ein, setzt der Trigger den fremden Mandanten — und genau
-- daran weist die restriktive Richtlinie aus fork_07 die Zeile ab. Waere es
-- andersherum, waere der Wachposten ein Tunnel statt einer Ergaenzung.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('elt-a', 'elt-b');
delete from auth.users where email like '%@eltern.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;

do $$
declare
  m_a uuid; m_b uuid; p_a uuid; p_b uuid; i_a uuid;
  u_a uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Alpha GmbH', 'elt-a') returning id into m_a;
  insert into public.mandanten (name, slug) values ('Beta GmbH',  'elt-b') returning id into m_b;

  insert into public.projekte (name, slug, mandant_id) values ('Hof Alpha', 'hof-a', m_a) returning id into p_a;
  insert into public.projekte (name, slug, mandant_id) values ('Hof Beta',  'hof-b', m_b) returning id into p_b;
  insert into public.immobilien (mandant_id, vertragsart) values (m_a, 'verkauf') returning id into i_a;

  insert into auth.users (id, email) values (u_a, 'a@eltern.example');
  insert into public.profiles (id, name, email, role, mandant_id)
    values (u_a, 'Alpha Chefin', 'a@eltern.example', 'chef', m_a);

  insert into wer values ('m_a', m_a), ('m_b', m_b), ('p_a', p_a), ('p_b', p_b),
                         ('i_a', i_a), ('u_a', u_a);
end $$;

-- --- 1) Ohne Mandanten: kommt er vom Projekt? ------------------------------
do $$
declare neu uuid; gesetzt uuid;
begin
  insert into public.projekt_aktivitaeten (projekt_id, typ)
  values ((select wert from wer where was='p_a'), 'pruefung') returning id into neu;
  select mandant_id into gesetzt from public.projekt_aktivitaeten where id = neu;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Projektaktivitaet erbt den Mandanten ihres Projekts',
          gesetzt = (select wert from wer where was='m_a'),
          coalesce(gesetzt::text, '(leer)'));
end $$;

-- --- 2) Auch ueber die Immobilie, und zwei Stufen tief ---------------------
-- Erst die Freigabe (Kind der Immobilie), dann die Frage daran. Beide muessen
-- beim Mandanten des Objekts landen.
do $$
declare frg uuid; frage_id uuid; g1 uuid; g2 uuid;
begin
  insert into public.expose_freigaben (token, immobilie_id, email)
  values ('prf-' || gen_random_uuid()::text, (select wert from wer where was='i_a'),
          'interessent@eltern.example') returning id into frg;
  select mandant_id into g1 from public.expose_freigaben where id = frg;

  insert into public.landing_fragen (immobilie_id, freigabe_id, frage)
  values ((select wert from wer where was='i_a'), frg, 'Ist der Keller trocken?')
  returning id into frage_id;
  select mandant_id into g2 from public.landing_fragen where id = frage_id;

  insert into befund (pruefung, bestanden, bemerkung)
  values ('Expose-Freigabe erbt den Mandanten des Objekts',
          g1 = (select wert from wer where was='m_a'), coalesce(g1::text, '(leer)')),
         ('Frage auf der Objektseite erbt den Mandanten des Objekts',
          g2 = (select wert from wer where was='m_a'), coalesce(g2::text, '(leer)'));
end $$;

-- --- 3) Ein gesetzter Mandant wird nicht ueberschrieben ---------------------
-- Absichtlich der FALSCHE: waere der Trigger ein Korrektor statt einer
-- Ergaenzung, stuende hinterher m_a da. Er soll aber nur fuellen.
do $$
declare neu uuid; gesetzt uuid;
begin
  insert into public.projekt_aktivitaeten (projekt_id, typ, mandant_id)
  values ((select wert from wer where was='p_a'), 'pruefung',
          (select wert from wer where was='m_b')) returning id into neu;
  select mandant_id into gesetzt from public.projekt_aktivitaeten where id = neu;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Ein gesetzter Mandant bleibt stehen',
          gesetzt = (select wert from wer where was='m_b'),
          coalesce(gesetzt::text, '(leer)'));
end $$;

-- --- 4) Ohne Elternsatz bleibt die Zeile ohne Mandanten --------------------
-- Ein Vermerk kann an einer Immobilie oder an einem Kontakt haengen — oder an
-- nichts. Dann raet der Wachposten nicht, sondern laesst die Zeile leer.
-- Lieber sichtbar unvollstaendig als falsch zugeordnet.
do $$
declare neu uuid; gesetzt uuid;
begin
  insert into public.vermerke (typ, titel) values ('notiz', 'herrenlos') returning id into neu;
  select mandant_id into gesetzt from public.vermerke where id = neu;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Ohne Elternsatz wird nicht geraten', gesetzt is null,
          coalesce(gesetzt::text, '(leer)'));
end $$;

-- --- 4b) Mit dem zweiten Elternteil, wenn der erste leer ist ---------------
-- Der Vermerk haengt nur an einem Kontakt. Das Paar (immobilie_id, immobilien)
-- greift nicht, (kontakt_id, kontakte) schon.
do $$
declare k uuid; neu uuid; gesetzt uuid;
begin
  insert into public.kontakte (mandant_id, vorname, nachname)
  values ((select wert from wer where was='m_a'), 'Probe', 'Kontakt') returning id into k;
  insert into public.vermerke (typ, titel, kontakt_id) values ('notiz', 'am Kontakt', k)
  returning id into neu;
  select mandant_id into gesetzt from public.vermerke where id = neu;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Das zweite Elternpaar greift, wenn das erste leer ist',
          gesetzt = (select wert from wer where was='m_a'), coalesce(gesetzt::text, '(leer)'));
end $$;

-- --- 5) Der Wachposten ist kein Tunnel -------------------------------------
-- Die Chefin von Alpha versucht, eine Aktivitaet an Betas Projekt zu haengen.
-- Der Trigger setzt pflichtgemaess Betas Mandanten — und die restriktive
-- Richtlinie weist die Zeile genau deshalb ab.
do $$
declare meldung text; zustand text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='u_a'))::text, true);
  set local role authenticated;
  begin
    insert into public.projekt_aktivitaeten (projekt_id, typ)
    values ((select wert from wer where was='p_b'), 'einschleusen');
    insert into befund (pruefung, bestanden, bemerkung)
    values ('Kein Kind an einem fremden Elternsatz', false, 'ging durch');
  exception when others then
    get stacked diagnostics meldung = message_text, zustand = returned_sqlstate;
    insert into befund (pruefung, bestanden, bemerkung)
    values ('Kein Kind an einem fremden Elternsatz', zustand = '42501',
            'SQLSTATE ' || zustand || ': ' || left(meldung, 50));
  end;
  reset role;
end $$;

-- --- 6) Haengen die Wachposten ueberall, wo sie sollen? --------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'Neunzehn Tabellen tragen den Wachposten', count(*) = 19, count(*)::text
  from pg_trigger where tgname = 'mandant_aus_eltern' and not tgisinternal;

-- --- 7) Die Aktivitaet nimmt das erste gefuellte Elternpaar ---------------
-- Drei Paare in einer Reihenfolge: Eigentuemer, Vertrag, Empfaenger. Das ist
-- keine Wahl zwischen Gleichrangigen, sondern eine Reihenfolge — und deshalb
-- immer dieselbe Antwort.
do $$
declare eig uuid; neu uuid; g1 uuid; g2 uuid;
begin
  insert into public.eigentuemer (mandant_id, nachname, email)
  values ((select wert from wer where was='m_a'), 'Probe', 'eig@eltern.example')
  returning id into eig;

  insert into public.aktivitaeten (zielgruppe, typ, titel, eigentuemer_id)
  values ('makler', 'pruefung', 'ueber den Eigentuemer', eig) returning id into neu;
  select mandant_id into g1 from public.aktivitaeten where id = neu;

  insert into public.aktivitaeten (zielgruppe, typ, titel, empfaenger_user_id)
  values ('makler', 'pruefung', 'ueber den Empfaenger',
          (select wert from wer where was='u_a')) returning id into neu;
  select mandant_id into g2 from public.aktivitaeten where id = neu;

  insert into befund (pruefung, bestanden, bemerkung)
  values ('Aktivitaet erbt ueber den Eigentuemer',
          g1 = (select wert from wer where was='m_a'), coalesce(g1::text, '(leer)')),
         ('Aktivitaet erbt ueber den Empfaenger, wenn kein Eigentuemer dranhaengt',
          g2 = (select wert from wer where was='m_a'), coalesce(g2::text, '(leer)'));
end $$;

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Der Mandant vom Elternsatz stimmt nicht: % von % — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Mandant aus dem Elternsatz: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
