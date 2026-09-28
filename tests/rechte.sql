-- Greifen Sichtbarkeitsbereich und Modulrechte wirklich in der Datenbank?
--
-- Abschnitt 1b des Auftrags gibt jedem Mitarbeiter einen Sichtbarkeitsbereich
-- und ein eigenes Recht "Export". Die Vorlage kennt beides nur in der
-- Oberflaeche; CLAUDE.md verlangt die Durchsetzung in der Datenbank. Dieser
-- Test fragt nicht, ob ein Knopf ausgegraut ist, sondern ob die Zeile
-- ankommt, wenn man die Schnittstelle direkt anspricht.
--
-- Aufbau: EIN Mandant, EINE Gesellschaft, ZWEI Standorte, vier Mitarbeiter mit
-- je einem eigenen Kontakt — je Sichtbarkeitsstufe einer. Danach meldet sich
-- jeder an und zaehlt, was er sieht.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug = 'rechtepruefung';
delete from auth.users where email like '%@rechte.example';

do $$
declare
  m uuid; g uuid; s1 uuid; s2 uuid;
  u_chef uuid := gen_random_uuid();
  u_kon  uuid := gen_random_uuid();
  u_ges  uuid := gen_random_uuid();
  u_sta  uuid := gen_random_uuid();
  u_eig  uuid := gen_random_uuid();
  u_and  uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Rechte GmbH', 'rechtepruefung')
    returning id into m;
  insert into public.gesellschaften (mandant_id, name) values (m, 'Rechte Holding')
    returning id into g;

  -- Zwei Standorte derselben Gesellschaft.
  insert into public.firma_stammdaten (firma_name, mandant_id, gesellschaft_id, sortierung)
    values ('Standort Nord', m, g, 1) returning id into s1;
  insert into public.firma_stammdaten (firma_name, mandant_id, gesellschaft_id, sortierung)
    values ('Standort Sued', m, g, 2) returning id into s2;

  insert into auth.users (id, email) values
    (u_chef,'chef@rechte.example'), (u_kon,'konto@rechte.example'),
    (u_ges,'gesellschaft@rechte.example'), (u_sta,'standort@rechte.example'),
    (u_eig,'eigene@rechte.example'), (u_and,'anderer@rechte.example');

  -- Vier Mitarbeiter am Standort Nord, einer am Standort Sued, dazu der Chef.
  insert into public.profiles (id, name, email, role, mandant_id, firma_id, sichtbarkeit, rechte) values
    (u_chef,'Chef',        'chef@rechte.example',        'chef',        m, s1, 'eigene',       '{}'::jsonb),
    (u_kon, 'Weitblick',   'konto@rechte.example',       'mitarbeiter', m, s1, 'konto',        '{}'::jsonb),
    (u_ges, 'Gesellschaft','gesellschaft@rechte.example','mitarbeiter', m, s1, 'gesellschaft', '{}'::jsonb),
    (u_sta, 'Standort',    'standort@rechte.example',    'mitarbeiter', m, s1, 'standort',     '{}'::jsonb),
    (u_eig, 'Scheuklappe', 'eigene@rechte.example',      'mitarbeiter', m, s1, 'eigene',       '{}'::jsonb),
    (u_and, 'Sued',        'anderer@rechte.example',     'mitarbeiter', m, s2, 'konto',        '{}'::jsonb);

  -- Je Mitarbeiter ein Kontakt, dazu einer ohne Zustaendigen.
  insert into public.kontakte (nachname, mandant_id, zustaendig_id) values
    ('Kontakt Chef',        m, u_chef),
    ('Kontakt Weitblick',   m, u_kon),
    ('Kontakt Gesellschaft',m, u_ges),
    ('Kontakt Standort',    m, u_sta),
    ('Kontakt Scheuklappe', m, u_eig),
    ('Kontakt Sued',        m, u_and),
    ('Kontakt herrenlos',   m, null);

  create temporary table wer (rolle text primary key, nutzer uuid, mandant uuid);
  insert into wer values ('chef',u_chef,m), ('konto',u_kon,m), ('gesellschaft',u_ges,m),
                         ('standort',u_sta,m), ('eigene',u_eig,m), ('sued',u_and,m);
  grant all on wer to public;
end $$;

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;

-- Der Standort Sued gehoert derselben Gesellschaft, deshalb sieht
-- 'gesellschaft' auch ihn. Erwartet wird jeweils inklusive des herrenlosen
-- Kontakts und des eigenen.
create temporary table erwartung (rolle text, soll int, warum text);
insert into erwartung values
  ('chef',         7, 'Chef sieht den ganzen Mandanten, auch mit sichtbarkeit=eigene'),
  ('konto',        7, 'Konto: alle sechs Zustaendigen plus der herrenlose'),
  ('gesellschaft', 7, 'Beide Standorte gehoeren derselben Gesellschaft'),
  ('standort',     6, 'Standort Nord: fuenf Zustaendige, ohne Sued, plus herrenlos'),
  ('eigene',       2, 'Nur der eigene und der herrenlose');
grant all on erwartung to public;

do $$
declare r record; n int;
begin
  for r in select * from erwartung loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select nutzer from wer where rolle = r.rolle))::text, true);
    set local role authenticated;
    select count(*) into n from public.kontakte;
    reset role;
    insert into befund (pruefung, bestanden, bemerkung)
    values (format('Sichtbarkeit %s sieht %s Kontakte', r.rolle, r.soll),
            n = r.soll, format('gesehen: %s — %s', n, r.warum));
  end loop;
end $$;

-- Wer nur die eigenen sehen darf, darf auch keinen fremden Kontakt anlegen.
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select nutzer from wer where rolle='eigene'))::text, true);
  set local role authenticated;
  begin
    insert into public.kontakte (nachname, mandant_id, zustaendig_id)
    values ('Eingeschmuggelt',
            (select mandant from wer where rolle='eigene'),
            (select nutzer from wer where rolle='sued'));
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Scheuklappe legt keinen Kontakt fuer Sued an', false, 'Einfuegen ging durch');
  exception
    when insufficient_privilege or check_violation then
      insert into befund (pruefung, bestanden, bemerkung)
        values ('Scheuklappe legt keinen Kontakt fuer Sued an', true, 'abgewiesen');
  end;
  reset role;
end $$;

-- --- Das Recht "Export" ---------------------------------------------------
-- rechte = {} bedeutet in der Oberflaeche: alles ausser finanzen, admin,
-- rechnungen, posteingang. Die SQL-Fassung muss dasselbe sagen.
do $$
declare r record;
begin
  for r in select * from (values
      ('chef','finanzen',true,  'Chef darf alles'),
      ('chef','export',  true,  'Chef darf alles'),
      ('konto','export', true,  'leere Rechte: alles ausser den vier gesperrten'),
      ('konto','finanzen',false,'leere Rechte: finanzen bleibt gesperrt'),
      ('konto','admin',   false,'leere Rechte: admin bleibt gesperrt'),
      ('konto','rechnungen',false,'leere Rechte: rechnungen bleibt gesperrt'),
      ('konto','posteingang',false,'leere Rechte: posteingang bleibt gesperrt')
    ) v(rolle, modul, soll, warum)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select nutzer from wer where rolle = r.rolle))::text, true);
    set local role authenticated;
    insert into befund (pruefung, bestanden, bemerkung)
    select format('hat_recht(%s) fuer %s ist %s', r.modul, r.rolle, r.soll),
           public.hat_recht(r.modul) = r.soll,
           format('ist %s — %s', public.hat_recht(r.modul), r.warum);
    reset role;
  end loop;
end $$;

-- Einzelhaeckchen schlagen die Vorlage: export ausdruecklich aus.
update public.profiles set rechte = '{"immobilien": true, "export": false}'::jsonb
 where id = (select nutzer from wer where rolle='konto');
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select nutzer from wer where rolle='konto'))::text, true);
  set local role authenticated;
  insert into befund (pruefung, bestanden, bemerkung)
  select 'Einzelhaeckchen export=false sticht die Vorlage',
         public.darf_exportieren() = false,
         format('darf_exportieren() ist %s', public.darf_exportieren());
  insert into befund (pruefung, bestanden, bemerkung)
  select 'Einzelhaeckchen immobilien=true gilt weiter',
         public.hat_recht('immobilien') = true,
         format('hat_recht(immobilien) ist %s', public.hat_recht('immobilien'));
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
    raise exception 'Rechte greifen nicht: % von % Pruefungen gescheitert — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Rechte greifen: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
