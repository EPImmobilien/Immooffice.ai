-- Legt die Selbstregistrierung einen vollstaendigen Mandanten an — und nur
-- einen?
--
-- Acht Fragen:
--   1. Ohne Anmeldung: abgewiesen.
--   2. Ohne bestaetigte E-Mail-Adresse: abgewiesen.
--   3. Mit bestaetigter Adresse: Mandant, Profil als chef, Standort und die
--      vier Einstellungszeilen — alles da.
--   4. Ein zweiter Aufruf legt NICHTS Neues an.
--   5. Ein eingeladener Mitarbeiter bleibt Mitarbeiter und bekommt keinen
--      eigenen Mandanten.
--   6. Zwei Firmen gleichen Namens bekommen verschiedene Kuerzel.
--   7. Der neue Chef sieht unter RLS nur seinen eigenen Mandanten.
--   8. Steht der Schalter `registrierung_offen` auf false, kommt niemand
--      Neues mehr durch — wer schon ein Profil hat, aber weiterhin.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug like 'reg-test%'
   or name in ('Testmakler GmbH', 'Ganz Andere AG', 'Zu GmbH');
delete from auth.users where email like '%@reg.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;

-- --- 1) Ohne Anmeldung ----------------------------------------------------
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claims', '', true);
  set local role authenticated;
  begin
    perform public.registrierung_abschliessen('Irgendwer GmbH');
    ok := false;
  exception when insufficient_privilege then
    ok := true;
  when others then
    ok := false;
  end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Ohne Anmeldung wird abgewiesen', ok,
          case when ok then 'abgewiesen (42501)' else 'durchgelassen' end);
end $$;

-- --- Konten anlegen -------------------------------------------------------
do $$
declare
  u_neu uuid := gen_random_uuid();
  u_unbestaetigt uuid := gen_random_uuid();
  u_zweiter uuid := gen_random_uuid();
  u_mitarbeiter uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (u_neu,          'neu@reg.example',          now()),
    (u_zweiter,      'zweiter@reg.example',      now()),
    (u_mitarbeiter,  'mitarbeiter@reg.example',  now());
  insert into auth.users (id, email) values (u_unbestaetigt, 'offen@reg.example');
  insert into wer values ('neu', u_neu), ('unbestaetigt', u_unbestaetigt),
                         ('zweiter', u_zweiter), ('mitarbeiter', u_mitarbeiter);
end $$;

-- --- 2) Ohne bestaetigte Adresse -----------------------------------------
do $$
declare ok boolean; meldung text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='unbestaetigt'),
                      'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.registrierung_abschliessen('Unbestaetigt GmbH');
    ok := false;
  exception when insufficient_privilege then
    ok := true;
  when others then
    get stacked diagnostics meldung = message_text;
    ok := false;
  end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Ohne bestaetigte E-Mail-Adresse wird abgewiesen', ok,
          case when ok then 'abgewiesen' else coalesce(meldung, 'durchgelassen') end);
end $$;

-- --- 3) und 4) Der gute Fall ---------------------------------------------
do $$
declare
  m1 uuid; m2 uuid;
  n_profil int; n_standort int; n_einst int; rolle text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='neu'),
                      'role', 'authenticated')::text, true);
  set local role authenticated;
  m1 := public.registrierung_abschliessen('Testmakler GmbH', 'Nina Neu');
  m2 := public.registrierung_abschliessen('Ganz andere GmbH', 'Nina Neu');
  reset role;

  insert into wer values ('mandant_neu', m1);

  select count(*), max(role) into n_profil, rolle from public.profiles
   where id = (select wert from wer where was='neu');
  select count(*) into n_standort from public.firma_stammdaten
   where mandant_id = m1 and slug = 'standard';
  select (select count(*) from public.push_einstellungen where mandant_id = m1)
       + (select count(*) from public.kosten_saetze      where mandant_id = m1)
       + (select count(*) from public.liquid_settings    where mandant_id = m1)
       + (select count(*) from public.akq_einstellungen  where mandant_id = m1)
    into n_einst;

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Der Mandant entsteht', m1 is not null, coalesce(m1::text, '(nichts)')),
    ('Das Profil ist chef dieses Mandanten', n_profil = 1 and rolle = 'chef',
     format('%s Profil(e), Rolle %s', n_profil, coalesce(rolle, '-'))),
    ('Ein Standort "standard" ist da', n_standort = 1, n_standort || ' Zeile(n)'),
    ('Die vier Einstellungszeilen sind da', n_einst = 4, n_einst || ' von 4'),
    ('Ein zweiter Aufruf legt nichts Neues an', m2 = m1,
     case when m2 = m1 then 'derselbe Mandant zurueck' else 'ZWEITER Mandant entstanden' end);
end $$;

-- --- 5) Ein eingeladener Mitarbeiter --------------------------------------
do $$
declare m uuid; rolle text;
begin
  insert into public.profiles (id, name, email, role, mandant_id)
  values ((select wert from wer where was='mitarbeiter'), 'Max Mitarbeiter',
          'mitarbeiter@reg.example', 'mitarbeiter',
          (select wert from wer where was='mandant_neu'));

  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='mitarbeiter'),
                      'role', 'authenticated')::text, true);
  set local role authenticated;
  m := public.registrierung_abschliessen('Eigene Firma GmbH');
  reset role;

  select role into rolle from public.profiles
   where id = (select wert from wer where was='mitarbeiter');

  insert into befund (pruefung, bestanden, bemerkung)
  values ('Ein eingeladener Mitarbeiter bekommt keinen eigenen Mandanten',
          m = (select wert from wer where was='mandant_neu') and rolle = 'mitarbeiter',
          format('Mandant %s, Rolle %s',
                 case when m = (select wert from wer where was='mandant_neu')
                      then 'unveraendert' else 'NEU' end, rolle));
end $$;

-- --- 6) Zwei Firmen gleichen Namens ---------------------------------------
do $$
declare m2 uuid; s1 text; s2 text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='zweiter'),
                      'role', 'authenticated')::text, true);
  set local role authenticated;
  m2 := public.registrierung_abschliessen('Testmakler GmbH', 'Zoe Zweit');
  reset role;

  select slug into s1 from public.mandanten where id = (select wert from wer where was='mandant_neu');
  select slug into s2 from public.mandanten where id = m2;

  insert into befund (pruefung, bestanden, bemerkung)
  values ('Zwei Firmen gleichen Namens bekommen verschiedene Kuerzel',
          s1 is distinct from s2 and s2 is not null, format('%s / %s', s1, s2));
end $$;

-- --- 7) Unter RLS sieht der neue Chef nur seinen Mandanten ----------------
do $$
declare sichtbar int; fremd int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='neu'),
                      'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into sichtbar from public.firma_stammdaten;
  select count(*) into fremd from public.firma_stammdaten
   where mandant_id is distinct from (select wert from wer where was='mandant_neu');
  reset role;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Der neue Chef sieht nur seinen eigenen Standort',
          sichtbar = 1 and fremd = 0,
          format('sichtbar=%s davon fremd=%s', sichtbar, fremd));
end $$;

-- --- 8) Der Schalter registrierung_offen wirkt ----------------------------
-- fork_57: Ein Schalter, der nichts tut, ist schlimmer als kein Schalter.
-- Geprueft wird beides: dass er zumacht, und dass er Bestandskunden
-- nicht mit aussperrt.
do $$
declare
  u_zu uuid := gen_random_uuid();
  vorher jsonb;
  zu_abgewiesen boolean;
  bestand uuid;
  meldung text;
begin
  insert into auth.users (id, email, email_confirmed_at)
    values (u_zu, 'geschlossen@reg.example', now());

  select wert into vorher from public.plattform_werte
   where schluessel = 'registrierung_offen';
  update public.plattform_werte set wert = 'false'::jsonb
   where schluessel = 'registrierung_offen';

  -- a) Ein Konto ohne Profil wird abgewiesen.
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_zu, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.registrierung_abschliessen('Zu GmbH', 'Konrad Zu');
    zu_abgewiesen := false;
    meldung := 'durchgelassen';
  exception when insufficient_privilege then
    zu_abgewiesen := true;
    meldung := 'abgewiesen (42501)';
  when others then
    zu_abgewiesen := false;
    meldung := 'falscher Fehler: ' || sqlerrm;
  end;
  reset role;

  -- b) Wer schon ein Profil hat, bekommt weiterhin seine Mandantenkennung.
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was='neu'),
                      'role', 'authenticated')::text, true);
  set local role authenticated;
  bestand := public.registrierung_abschliessen('Testmakler GmbH', 'Nina Neu');
  reset role;

  update public.plattform_werte set wert = coalesce(vorher, 'true'::jsonb)
   where schluessel = 'registrierung_offen';

  insert into befund (pruefung, bestanden, bemerkung)
  values ('Geschlossene Registrierung weist ein neues Konto ab',
          zu_abgewiesen, meldung),
         ('Geschlossene Registrierung sperrt Bestandskunden nicht aus',
          bestand is not distinct from (select wert from wer where was='mandant_neu'),
          coalesce(bestand::text, 'nichts zurueckbekommen')),
         ('Die geschlossene Registrierung legt nichts an',
          not exists (select 1 from public.profiles where id = u_zu)
            and not exists (select 1 from public.mandanten where name = 'Zu GmbH'),
          format('%s Profil(e), %s Mandant(en) namens "Zu GmbH"',
                 (select count(*) from public.profiles where id = u_zu),
                 (select count(*) from public.mandanten where name = 'Zu GmbH')));
end $$;

delete from public.mandanten where slug like 'testmakler%' or slug like 'ganz-andere%'
   or name = 'Zu GmbH';
delete from auth.users where email like '%@reg.example';

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Selbstregistrierung: % von % nicht bestanden — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Selbstregistrierung: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
