-- Trennt die Datenbank zwei Mandanten wirklich?
--
-- Das ist die Frage, auf die Phase 2 hinauslaeuft, und sie laesst sich nur so
-- beantworten: zwei Mandanten anlegen, sich als der eine ausgeben und
-- versuchen, an die Daten des anderen zu kommen. Lesen, Einfuegen, Aendern,
-- Loeschen — jede Richtung einzeln.
--
-- Geprueft wird per SQL, nicht ueber die Oberflaeche. Ein ausgeblendetes
-- Bedienelement ist keine Trennung; wer die Schnittstelle direkt anspricht,
-- sieht davon nichts.
--
-- Der Nachbau setzt request.jwt.claims genauso wie PostgREST auf Supabase,
-- und `set role authenticated` sorgt dafuer, dass die Richtlinien ueberhaupt
-- greifen: fuer den Eigentuemer einer Tabelle gelten sie nicht.

\set ON_ERROR_STOP on
\pset pager off

-- Reste eines abgebrochenen Laufs wegraeumen. Ein Test, der beim zweiten Mal
-- an sich selbst scheitert, wird irgendwann nicht mehr ausgefuehrt.
delete from public.mandanten where slug in ('alpha', 'beta');
delete from auth.users where email in ('chef@alpha.example', 'chef@beta.example');

-- --- Zwei Mandanten mit je einem Nutzer und einem Objekt ------------------
do $$
declare a uuid; b uuid; ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Alpha GmbH', 'alpha') returning id into a;
  insert into public.mandanten (name, slug) values ('Beta GmbH',  'beta')  returning id into b;

  insert into auth.users (id, email) values (ua, 'chef@alpha.example'), (ub, 'chef@beta.example');

  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'Chef Alpha', 'chef@alpha.example', 'chef', a),
    (ub, 'Chef Beta',  'chef@beta.example',  'chef', b);

  insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values ('Objekt Alpha', 'verkauf', a);
  insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values ('Objekt Beta', 'verkauf', b);

  -- Fuer die spaeteren Abschnitte merken.
  create temporary table wer (rolle text primary key, nutzer uuid, mandant uuid);
  insert into wer values ('alpha', ua, a), ('beta', ub, b);
end $$;

create temporary table befund (nr int generated always as identity, pruefung text, bestanden boolean, bemerkung text);
-- Die beiden Hilfstabellen gehoeren der Migrationsrolle. Nach `set role
-- authenticated` waeren sie sonst unzugaenglich, und der Test schiene an
-- der Trennung zu scheitern, obwohl er an sich selbst scheitert.
grant all on befund to public;
grant all on wer to public;

-- --- Als Alpha anmelden ---------------------------------------------------
select set_config('request.jwt.claims',
       json_build_object('sub', (select nutzer from wer where rolle='alpha'))::text, false);
set role authenticated;

-- 1) Lesen: nur die eigenen Objekte
insert into befund (pruefung, bestanden, bemerkung)
select 'Alpha liest nur eigene Objekte',
       count(*) = 1 and min(bezeichnung) = 'Objekt Alpha',
       'gesehen: ' || coalesce(string_agg(bezeichnung, ', '), '(nichts)')
  from public.immobilien;

-- 2) Einfuegen fuer einen fremden Mandanten muss scheitern
do $$
declare fremd uuid;
begin
  select mandant from wer where rolle='beta' into fremd;
  begin
    insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values ('Eingeschmuggelt', 'verkauf', fremd);
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Alpha kann nicht fuer Beta einfuegen', false, 'Einfuegen ging durch');
  exception when insufficient_privilege or check_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Alpha kann nicht fuer Beta einfuegen', true, 'abgewiesen: ' || sqlerrm);
  end;
end $$;

-- 3) Aendern fremder Zeilen trifft nichts
with versuch as (
  update public.immobilien set bezeichnung = 'uebernommen' where bezeichnung = 'Objekt Beta' returning 1
)
insert into befund (pruefung, bestanden, bemerkung)
select 'Alpha aendert keine Zeile von Beta', count(*) = 0,
       count(*) || ' Zeile(n) getroffen' from versuch;

-- 4) Loeschen fremder Zeilen trifft nichts
with versuch as (
  delete from public.immobilien where bezeichnung = 'Objekt Beta' returning 1
)
insert into befund (pruefung, bestanden, bemerkung)
select 'Alpha loescht keine Zeile von Beta', count(*) = 0,
       count(*) || ' Zeile(n) getroffen' from versuch;

-- 5) Auch die Profile des anderen bleiben verborgen
insert into befund (pruefung, bestanden, bemerkung)
select 'Alpha sieht nur eigene Profile', count(*) = 1,
       'gesehen: ' || coalesce(string_agg(email, ', '), '(nichts)')
  from public.profiles;

-- --- Als Beta anmelden ----------------------------------------------------
reset role;
select set_config('request.jwt.claims',
       json_build_object('sub', (select nutzer from wer where rolle='beta'))::text, false);
set role authenticated;

insert into befund (pruefung, bestanden, bemerkung)
select 'Beta liest nur eigene Objekte',
       count(*) = 1 and min(bezeichnung) = 'Objekt Beta',
       'gesehen: ' || coalesce(string_agg(bezeichnung, ', '), '(nichts)')
  from public.immobilien;

-- 6) Ohne Anmeldung ist gar nichts zu sehen
reset role;
select set_config('request.jwt.claims', '', false);
set role authenticated;
insert into befund (pruefung, bestanden, bemerkung)
select 'Ohne Anmeldung kein Objekt sichtbar', count(*) = 0,
       count(*) || ' Zeile(n) sichtbar' from public.immobilien;

reset role;

select nr, case when bestanden then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where not bestanden;
  if n > 0 then
    raise exception 'Mandantentrennung nicht dicht: % von % Pruefungen gescheitert — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Mandantentrennung dicht: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
