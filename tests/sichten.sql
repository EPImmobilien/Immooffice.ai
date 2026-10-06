-- Halten die Sichten die Mandantengrenze — oder heben sie sie auf?
--
-- `tests/mandant.sql`, `tests/mandant-rundumschlag.sql` und `tests/rechte.sql`
-- pruefen TABELLEN. Sichten hat bis zum 06.10.2026 keiner von ihnen
-- angesehen, und genau dort stand das Loch:
--
-- In PostgreSQL laeuft eine Sicht ohne `security_invoker` mit den Rechten
-- ihres EIGNERS. Eigner ist `postgres`, und `postgres` ist Eigner der
-- Basistabellen. Ein Tabelleneigner ist von Row-Level-Security befreit,
-- solange `force row level security` aus ist. Fuenf Sichten hoben damit die
-- restriktive Richtlinie `mandant_trennung` auf — zwei davon auch fuers
-- Schreiben, weil PostgreSQL sie als `is_updatable` einstuft.
--
-- Zwei Fragen, und die zweite ist die wichtigere:
--
--   1. Steht jede Sicht in `public` auf `security_invoker`? Und hat `anon`
--      nichts und `authenticated` nur SELECT?
--   2. Und wirkt das? Zwei Mandanten, einer liest und schreibt durch die
--      Sicht auf die Daten des anderen.
--
-- Die erste Frage faengt die naechste neue Sicht, die zweite beweist, dass
-- die Einstellung tut, was ihr Name sagt.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('sicht-a', 'sicht-b');
delete from auth.users where email like '%@sicht.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (rolle text primary key, nutzer uuid, mandant uuid);
grant all on wer to public;

-- --- 1) Jede Sicht steht auf security_invoker ----------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'Jede Sicht in public steht auf security_invoker',
       count(*) filter (where nicht_invoker) = 0,
       case when count(*) filter (where nicht_invoker) = 0
            then format('%s Sichten, alle', count(*))
            else 'offen: ' || string_agg(relname, ', ') filter (where nicht_invoker) end
  from (
    select c.relname,
           coalesce((select o from unnest(c.reloptions) o
                      where o = 'security_invoker=true'), '') = ''
             as nicht_invoker
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  ) s;

-- --- 2) anon hat auf keiner Sicht ein Recht ------------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'anon hat auf keiner Sicht ein Recht', count(*) = 0,
       left(coalesce(string_agg(distinct table_name || ':' || privilege_type, ', '),
                     'kein Recht'), 90)
  from information_schema.role_table_grants g
 where g.table_schema = 'public' and g.grantee = 'anon'
   and g.table_name in (select c.relname from pg_class c
                          join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname='public' and c.relkind='v');

-- --- 3) authenticated darf lesen und sonst nichts ------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'authenticated hat auf Sichten nur SELECT', count(*) = 0,
       left(coalesce(string_agg(distinct table_name || ':' || privilege_type, ', '),
                     'nur SELECT'), 90)
  from information_schema.role_table_grants g
 where g.table_schema = 'public' and g.grantee = 'authenticated'
   and g.privilege_type <> 'SELECT'
   and g.table_name in (select c.relname from pg_class c
                          join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname='public' and c.relkind='v');

-- --- Zwei Mandanten mit je einer Bewertung und einem Radar-Objekt --------
do $$
declare a uuid; b uuid; ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Sicht A GmbH', 'sicht-a') returning id into a;
  insert into public.mandanten (name, slug) values ('Sicht B GmbH', 'sicht-b') returning id into b;
  insert into auth.users (id, email) values (ua, 'a@sicht.example'), (ub, 'b@sicht.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'Chef A', 'a@sicht.example', 'chef', a),
    (ub, 'Chef B', 'b@sicht.example', 'chef', b);

  insert into public.bewertungen (titel, ersteller_id, mandant_id)
    values ('Bewertung A', ua, a), ('Bewertung B', ub, b);
  insert into public.radar_objekte
    (fingerprint, quelle, vermarktungsart, telefon, mandant_id) values
    ('fp-a', 'test', 'kauf', '040 000000', a),
    ('fp-b', 'test', 'kauf', '040 000000', b);

  insert into wer values ('a', ua, a), ('b', ub, b);
end $$;

-- --- 4) Lesen durch die Sicht bleibt beim eigenen Mandanten --------------
select set_config('request.jwt.claims',
       json_build_object('sub', (select nutzer from wer where rolle='a'),
                         'role', 'authenticated')::text, false);
set role authenticated;

insert into befund (pruefung, bestanden, bemerkung)
select 'A sieht durch akq_mpe_uebersicht nur die eigene Bewertung',
       count(*) = 1 and min(titel) = 'Bewertung A',
       'gesehen: ' || coalesce(string_agg(titel, ', '), '(nichts)')
  from public.akq_mpe_uebersicht where titel like 'Bewertung %';

insert into befund (pruefung, bestanden, bemerkung)
select 'A sieht durch radar_uebersicht nur das eigene Objekt',
       count(*) = 1 and min(fingerprint) = 'fp-a',
       'gesehen: ' || coalesce(string_agg(fingerprint, ', '), '(nichts)')
  from public.radar_uebersicht where fingerprint like 'fp-%';

-- --- 5) Schreiben durch die Sicht erreicht den Fremden nicht -------------
-- Beide Sichten sind is_updatable: ohne security_invoker waere das hier
-- eine Aenderung an den Daten des anderen Mandanten.
do $$
declare n int;
begin
  update public.akq_mpe_uebersicht set titel = 'Gekapert' where titel = 'Bewertung B';
  get diagnostics n = row_count;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('A aendert durch die Sicht keine Bewertung von B', n = 0,
          format('%s Zeile(n) getroffen', n));
exception when insufficient_privilege then
  insert into befund (pruefung, bestanden, bemerkung)
  values ('A aendert durch die Sicht keine Bewertung von B', true,
          'abgewiesen: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  delete from public.radar_uebersicht where fingerprint = 'fp-b';
  get diagnostics n = row_count;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('A loescht durch die Sicht kein Radar-Objekt von B', n = 0,
          format('%s Zeile(n) getroffen', n));
exception when insufficient_privilege then
  insert into befund (pruefung, bestanden, bemerkung)
  values ('A loescht durch die Sicht kein Radar-Objekt von B', true,
          'abgewiesen: ' || sqlerrm);
end $$;

reset role;
select set_config('request.jwt.claims', '', false);

-- Nachsehen, dass B noch unangetastet ist — ein Test, der nur Zeilenzahlen
-- zaehlt, uebersieht eine Aenderung, die 0 zurueckmeldet und doch wirkte.
insert into befund (pruefung, bestanden, bemerkung)
select 'Bs Daten sind unveraendert',
       (select count(*) from public.bewertungen where titel = 'Bewertung B') = 1
         and (select count(*) from public.bewertungen where titel = 'Gekapert') = 0
         and (select count(*) from public.radar_objekte where fingerprint = 'fp-b') = 1,
       format('Bewertung B: %s, Gekapert: %s, fp-b: %s',
              (select count(*) from public.bewertungen where titel = 'Bewertung B'),
              (select count(*) from public.bewertungen where titel = 'Gekapert'),
              (select count(*) from public.radar_objekte where fingerprint = 'fp-b'));

delete from public.mandanten where slug in ('sicht-a', 'sicht-b');
delete from auth.users where email like '%@sicht.example';

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis,
       pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Sichten: % von % nicht bestanden — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Sichten: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
