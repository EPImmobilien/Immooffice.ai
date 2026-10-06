-- Darf ein Plattform-Administrator in fremde Mandanten sehen — und nur so,
-- wie es vorgesehen ist?
--
-- Das ist die heikelste Frage dieses Forks. Die Mandantentrennung haengt an
-- EINER Funktion, `aktuelle_mandant_id()`, und fork_54 hat sie veraendert.
-- Wenn dabei etwas schiefgeht, sieht jeder alles — und zwar lautlos.
--
-- Geprueft wird deshalb in beide Richtungen:
--
--   OHNE Sitzung sieht ein Plattform-Administrator genau so viel wie jeder
--   andere: seinen eigenen Mandanten. Kein automatischer Zugriff, sagt
--   CLAUDE.md, und das heisst: ueberhaupt keiner.
--
--   MIT Sitzung sieht er den einen Mandanten, um den es geht — und nur den.
--   Er kann dort nichts aendern, solange die Sitzung nicht ausdruecklich
--   zum Schreiben angelegt wurde. Nach Ablauf sieht er wieder nichts. Wird
--   ihm das Plattform-Recht entzogen, endet die Sitzung sofort.
--
--   Und: wer KEIN Plattform-Administrator ist, kommt mit einer Zeile in
--   support_sitzungen nirgendwohin.
\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('sup-a', 'sup-b', 'sup-platt');
delete from auth.users where email like '%@sup.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;

-- --- Aufbau ---------------------------------------------------------------
do $$
declare
  v_a uuid; v_b uuid; v_p uuid;
  v_chef_a uuid := gen_random_uuid();
  v_chef_b uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Alpha', 'sup-a') returning id into v_a;
  insert into public.mandanten (name, slug) values ('Beta',  'sup-b') returning id into v_b;
  insert into public.mandanten (name, slug) values ('Platt', 'sup-platt') returning id into v_p;

  insert into auth.users (id, email) values
    (v_chef_a, 'a@sup.example'), (v_chef_b, 'b@sup.example'), (v_admin, 'admin@sup.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (v_chef_a, 'Chef A', 'a@sup.example', 'chef', v_a),
    (v_chef_b, 'Chef B', 'b@sup.example', 'chef', v_b),
    (v_admin,  'Admin',  'admin@sup.example', 'chef', v_p);

  insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values
    ('Haus Alpha', 'verkauf', v_a), ('Haus Beta', 'verkauf', v_b);

  insert into public.plattform_admins (benutzer_id, notiz) values (v_admin, 'Pruefung');

  insert into wer values ('a', v_a), ('b', v_b), ('p', v_p),
                         ('chef_a', v_chef_a), ('chef_b', v_chef_b), ('admin', v_admin);
end $$;

-- --- 1. Ohne Sitzung: nichts Fremdes --------------------------------------
do $$
declare v_admin uuid := (select wert from wer where was='admin');
        v_n int; v_eigen uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  select count(*) into v_n from public.immobilien;
  select public.aktuelle_mandant_id() into v_eigen;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ohne Sitzung sieht der Admin keine fremde Immobilie', v_n = 0, v_n::text),
    ('…und aktuelle_mandant_id() nennt seinen eigenen',
     v_eigen = (select wert from wer where was='p'), coalesce(v_eigen::text,'null'));
end $$;

-- --- 2. Mit Sitzung: genau einer ------------------------------------------
do $$
declare v_admin uuid := (select wert from wer where was='admin');
        v_a uuid := (select wert from wer where was='a');
        v_sicht uuid; v_n_a int; v_n_b int; v_schreiben uuid;
begin
  insert into public.support_sitzungen (admin_id, mandant_id, grund, gueltig_bis)
    values (v_admin, v_a, 'Kunde meldet fehlende Bilder', now() + interval '30 minutes');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  select public.aktuelle_mandant_id() into v_sicht;
  select public.mandant_id_schreiben() into v_schreiben;
  select count(*) into v_n_a from public.immobilien where bezeichnung = 'Haus Alpha';
  select count(*) into v_n_b from public.immobilien where bezeichnung = 'Haus Beta';
  reset role;

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Mit Sitzung sieht er den Mandanten der Sitzung', v_sicht = v_a, coalesce(v_sicht::text,'null')),
    ('…dessen Immobilie auch', v_n_a = 1, v_n_a::text),
    ('…aber die des DRITTEN nicht', v_n_b = 0, v_n_b::text),
    ('Schreiben bleibt beim eigenen Mandanten',
     v_schreiben = (select wert from wer where was='p'), coalesce(v_schreiben::text,'null'));
end $$;

-- --- 3. Lesen ja, aendern nein --------------------------------------------
do $$
declare v_admin uuid := (select wert from wer where was='admin');
        v_ok_aendern boolean := false; v_ok_anlegen boolean := false;
        v_ok_loeschen boolean := false; v_n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;

  begin
    update public.immobilien set bezeichnung = 'gekapert' where bezeichnung = 'Haus Alpha';
    get diagnostics v_n = row_count;
    v_ok_aendern := v_n > 0;
  exception when others then v_ok_aendern := false; end;

  begin
    insert into public.immobilien (bezeichnung, vertragsart, mandant_id)
      values ('Eingeschmuggelt', 'verkauf', (select wert from wer where was='a'));
    v_ok_anlegen := true;
  exception when others then v_ok_anlegen := false; end;

  begin
    delete from public.immobilien where bezeichnung = 'Haus Alpha';
    get diagnostics v_n = row_count;
    v_ok_loeschen := v_n > 0;
  exception when others then v_ok_loeschen := false; end;

  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Eine Lese-Sitzung aendert nichts', not v_ok_aendern, ''),
    ('…legt nichts an', not v_ok_anlegen, ''),
    ('…und loescht nichts', not v_ok_loeschen, '');
end $$;

-- Die Immobilie muss unversehrt dastehen — sonst war oben etwas doch
-- durchgegangen, und das Zaehlen allein haette es nicht gezeigt.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.immobilien
   where bezeichnung = 'Haus Alpha' and mandant_id = (select wert from wer where was='a');
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Die fremde Immobilie steht unveraendert da', v_n = 1, v_n::text);
end $$;

-- --- 4. Mit Schreibrecht geht es, aber nur dort ---------------------------
do $$
declare v_admin uuid := (select wert from wer where was='admin');
        v_a uuid := (select wert from wer where was='a');
        v_b uuid := (select wert from wer where was='b');
        v_ok boolean := false; v_fremd boolean := false; v_n int;
begin
  update public.support_sitzungen set beendet_am = now() where admin_id = v_admin;
  insert into public.support_sitzungen (admin_id, mandant_id, grund, schreiben, gueltig_bis)
    values (v_admin, v_a, 'Datensatz auf Wunsch des Kunden berichtigen', true,
            now() + interval '30 minutes');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  begin
    update public.immobilien set bezeichnung = 'Haus Alpha (berichtigt)'
     where bezeichnung = 'Haus Alpha';
    get diagnostics v_n = row_count;
    v_ok := v_n > 0;
  exception when others then v_ok := false; end;
  begin
    insert into public.immobilien (bezeichnung, vertragsart, mandant_id)
      values ('Beim Dritten', 'verkauf', v_b);
    v_fremd := true;
  exception when others then v_fremd := false; end;
  reset role;

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Eine Schreib-Sitzung aendert im Mandanten der Sitzung', v_ok, ''),
    ('…aber nicht bei einem dritten', not v_fremd, '');
end $$;

-- --- 5. Abgelaufen ist abgelaufen -----------------------------------------
do $$
declare v_admin uuid := (select wert from wer where was='admin');
        v_sicht uuid; v_n int;
begin
  update public.support_sitzungen set beendet_am = now() where admin_id = v_admin;
  insert into public.support_sitzungen (admin_id, mandant_id, grund, begonnen_am, gueltig_bis)
    values (v_admin, (select wert from wer where was='a'), 'Laengst vorbei',
            now() - interval '3 hours', now() - interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  select public.aktuelle_mandant_id() into v_sicht;
  select count(*) into v_n from public.immobilien where bezeichnung like 'Haus Alpha%';
  reset role;

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Eine abgelaufene Sitzung gilt nicht mehr',
     v_sicht = (select wert from wer where was='p'), coalesce(v_sicht::text,'null')),
    ('…und zeigt nichts mehr', v_n = 0, v_n::text);
end $$;

-- --- 6. Beendet ist beendet -----------------------------------------------
do $$
declare v_admin uuid := (select wert from wer where was='admin'); v_sicht uuid;
begin
  delete from public.support_sitzungen where admin_id = v_admin;
  insert into public.support_sitzungen (admin_id, mandant_id, grund, gueltig_bis, beendet_am)
    values (v_admin, (select wert from wer where was='a'), 'Von Hand beendet',
            now() + interval '1 hour', now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  select public.aktuelle_mandant_id() into v_sicht;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Eine beendete Sitzung gilt nicht mehr',
     v_sicht = (select wert from wer where was='p'), coalesce(v_sicht::text,'null'));
end $$;

-- --- 7. Ohne Plattform-Recht nuetzt die Zeile nichts ----------------------
-- Der gefaehrlichste Fall: jemand bekommt eine Zeile in support_sitzungen,
-- ist aber kein Plattform-Administrator (mehr).
do $$
declare v_chef_b uuid := (select wert from wer where was='chef_b');
        v_admin uuid := (select wert from wer where was='admin');
        v_sicht uuid; v_n int; v_nach uuid;
begin
  delete from public.support_sitzungen;
  insert into public.support_sitzungen (admin_id, mandant_id, grund, gueltig_bis)
    values (v_chef_b, (select wert from wer where was='a'), 'Unbefugter Versuch',
            now() + interval '1 hour');
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_b)::text, true);
  set local role authenticated;
  select public.aktuelle_mandant_id() into v_sicht;
  select count(*) into v_n from public.immobilien where bezeichnung like 'Haus Alpha%';
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ohne Plattform-Recht wirkt die Sitzung nicht',
     v_sicht = (select wert from wer where was='b'), coalesce(v_sicht::text,'null')),
    ('…und zeigt nichts', v_n = 0, v_n::text);

  -- Und die Gegenprobe: dem echten Admin das Recht entziehen, waehrend eine
  -- Sitzung laeuft.
  delete from public.support_sitzungen;
  insert into public.support_sitzungen (admin_id, mandant_id, grund, gueltig_bis)
    values (v_admin, (select wert from wer where was='a'), 'Laeuft noch',
            now() + interval '1 hour');
  delete from public.plattform_admins where benutzer_id = v_admin;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  select public.aktuelle_mandant_id() into v_nach;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ein entzogenes Recht beendet die laufende Sitzung sofort',
     v_nach = (select wert from wer where was='p'), coalesce(v_nach::text,'null'));
  insert into public.plattform_admins (benutzer_id, notiz) values (v_admin, 'Pruefung');
end $$;

-- --- 8. Die Sitzung ist nicht heimlich ------------------------------------
-- Der betroffene Mandant muss nachlesen koennen, wer bei ihm war.
do $$
declare v_chef_a uuid := (select wert from wer where was='chef_a');
        v_chef_b uuid := (select wert from wer where was='chef_b');
        v_a int; v_b int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_a)::text, true);
  set local role authenticated;
  select count(*) into v_a from public.support_sitzungen;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_b)::text, true);
  set local role authenticated;
  select count(*) into v_b from public.support_sitzungen;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Der betroffene Mandant sieht den Zugriff', v_a >= 1, v_a::text),
    ('Ein unbeteiligter sieht ihn nicht', v_b = 0, v_b::text);
end $$;

-- --- 9. Die Grenzen der Sitzung selbst ------------------------------------
do $$
declare v_admin uuid := (select wert from wer where was='admin');
        v_ohne_grund boolean := true; v_zu_lang boolean := true;
begin
  begin
    insert into public.support_sitzungen (admin_id, mandant_id, grund, gueltig_bis)
      values (v_admin, (select wert from wer where was='a'), 'x', now() + interval '10 minutes');
  exception when others then v_ohne_grund := false; end;
  begin
    insert into public.support_sitzungen (admin_id, mandant_id, grund, gueltig_bis)
      values (v_admin, (select wert from wer where was='a'), 'Ein ordentlicher Grund',
              now() + interval '2 days');
  exception when others then v_zu_lang := false; end;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ohne ordentlichen Grund keine Sitzung', not v_ohne_grund, ''),
    ('Laenger als vier Stunden geht nicht', not v_zu_lang, '');
end $$;

-- --- Aufraeumen und Urteil -------------------------------------------------
delete from public.mandanten where slug in ('sup-a', 'sup-b', 'sup-platt');
delete from auth.users where email like '%@sup.example';

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as stand,
       pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Supportzugriff nicht dicht: % von % Pruefungen gescheitert — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Supportzugriff: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
