-- Bautraeger-Paket v2 (fork_84–86): tun Verlauf, To-do-Kopplung, Ratenregel
-- und Richtlinien, was der Auftrag verlangt — und bleibt der Mandant dicht?
--
-- Zwei Mandanten mit je einem Chef. In Alpha: Projekt, Einheit, Kaeufer,
-- Handwerker, Protokoll, Mangel, Zahlungsplan mit Bauabschnitten. Geprueft
-- wird in der Datenbank, nicht in der Oberflaeche: ein Statuswechsel schreibt
-- den Verlauf, geprueft_erledigt schliesst das To-do, der letzte Bauabschnitt
-- macht die Rate anforderbar und legt genau einen Glockeneintrag an, Beta
-- sieht nichts davon, und ein Neubau-Protokoll ohne Projekt wird abgewiesen.
\set ON_ERROR_STOP on
\pset pager off
create temporary table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public; grant all on befund to public; grant all on sequence befund_nr_seq to public;
do $$
declare a uuid; b uuid; ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); k text := substr(gen_random_uuid()::text, 1, 8);
begin
  insert into public.mandanten (name, slug) values ('Bau Alpha', 'bt-a-' || k) returning id into a;
  insert into public.mandanten (name, slug) values ('Bau Beta',  'bt-b-' || k) returning id into b;
  insert into auth.users (id, email) values (ua, 'a-' || k || '@bt.example'), (ub, 'b-' || k || '@bt.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'Chefin Alpha', 'a-' || k || '@bt.example', 'chef', a), (ub, 'Chef Beta', 'b-' || k || '@bt.example', 'chef', b);
  insert into wer values ('a', a), ('b', b), ('ua', ua), ('ub', ub);
end $$;

-- --- Als Chefin Alpha: Projekt, Einheit, Kaeufer, Handwerker, Protokoll, Mangel ---------------
select set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was = 'ua'), 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare a uuid := (select wert from wer where was = 'a'); ua uuid := (select wert from wer where was = 'ua');
        p uuid; e uuid; z uuid; hk uuid; pr uuid; m uuid; t uuid; zp uuid; vid uuid; ok boolean; n int; v jsonb; st text; tst text;
begin
  insert into public.projekte (name, slug, vermarktungsart, status, frist_standard_tage) values ('Seequartier', 'seequartier-' || substr(a::text, 1, 6), 'kauf', 'aktiv', 10) returning id into p;
  insert into public.projekt_einheiten (projekt_id, we_nr, status) values (p, '3', 'verkauft') returning id into e;
  insert into public.projekt_zugaenge (projekt_id, einheit_id, email, anzeigename, rolle, token) values (p, e, 'kaeufer-' || substr(a::text, 1, 6) || '@bt.example', 'Familie Test', 'kaeufer', gen_random_uuid()::text) returning id into z;
  insert into public.projekt_kontakte (projekt_id, gewerk, firma, email) values (p, 'Maler', 'Malerei Muster', 'maler@bt.example') returning id into hk;
  insert into wer values ('p', p), ('e', e), ('z', z), ('hk', hk);
  -- QR-Token kommt von selbst
  insert into befund (pruefung, bestanden, bemerkung) select 'Einheit bekommt einen QR-Token', qr_token ~ '^[0-9a-f]{24}$', qr_token from public.projekt_einheiten where id = e;
  -- Neubau-Protokoll ohne Projekt: abgewiesen
  begin
    insert into public.uebergabeprotokoll (ersteller_id, protokoll_typ, uebergabe_datum, objekt_adresse, vermieter_name, mieter_name, schluessel, zaehler, raeume, kontext)
    values (ua, 'neubau_abnahme', current_date, 'Seeweg 1', 'Bau Alpha', 'Familie Test', '[]', '[]', '[]', 'verkauf');
    ok := false;
  exception when check_violation then ok := true; end;
  insert into befund values (default, 'Neubau-Protokoll ohne Projekt wird abgewiesen', ok, null);
  -- Mit Projekt: geht, und das Team liest es
  insert into public.uebergabeprotokoll (ersteller_id, protokoll_typ, uebergabe_datum, objekt_adresse, vermieter_name, mieter_name, schluessel, zaehler, raeume, kontext, projekt_id, einheit_id, zugang_id, frist_standard_tage)
  values (ua, 'neubau_abnahme', current_date, 'Seeweg 1', 'Bau Alpha', 'Familie Test', '[]', '[]', '[{"id":1,"name":"Bad","notizen":"","maengel":[{"id":"x","titel":"Fuge offen"}]}]', 'verkauf', p, e, z, 10) returning id into pr;
  insert into wer values ('pr', pr);
  -- Mangel aus der Abnahme, beauftragt, mit To-do
  insert into public.todos (titel, typ, status, prioritaet, ersteller_id, zustaendig_id, team_sichtbar) values ('Mangel: Fuge offen', 'aufgabe', 'laeuft', 'normal', ua, ua, true) returning id into t;
  insert into public.projekt_maengel (projekt_id, einheit_id, zugang_id, quelle, protokoll_id, raum, gewerk, projekt_kontakt_id, frist, titel, status, handwerker_token, todo_id, erstellt_von)
  values (p, e, z, 'abnahme', pr, 'Bad', 'Maler', hk, current_date + 10, 'Fuge offen', 'beauftragt', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', t, ua) returning id into m;
  insert into wer values ('m', m), ('t', t);
  -- Statuswechsel -> Verlauf
  update public.projekt_maengel set status = 'termin_geplant', termin_am = current_date + 3 where id = m;
  select verlauf, status into v, st from public.projekt_maengel where id = m;
  insert into befund values (default, 'Statuswechsel schreibt den Verlauf (von/nach, wer)', jsonb_array_length(v) = 1 and v->0->>'von' = 'beauftragt' and v->0->>'nach' = 'termin_geplant' and v->0->>'wer' = 'Chefin Alpha', v::text);
  perform public.mangel_verlauf_anhaengen(m, 'Malerei Muster', 'rueckfrage', 'Welche Farbe?');
  select verlauf into v from public.projekt_maengel where id = m;
  insert into befund values (default, 'Verlauf laesst sich anhaengen', jsonb_array_length(v) = 2 and v->1->>'was' = 'rueckfrage', null);
  -- geprueft_erledigt -> To-do erledigt, geprueft_von gesetzt
  update public.projekt_maengel set status = 'gemeldet_erledigt' where id = m;
  update public.projekt_maengel set status = 'geprueft_erledigt' where id = m;
  select status into tst from public.todos where id = t;
  insert into befund (pruefung, bestanden, bemerkung) select 'Gepruefter Mangel schliesst sein To-do und merkt sich den Pruefer', tst = 'erledigt' and geprueft_von = ua and geprueft_am is not null and gemeldet_erledigt_am is not null, tst from public.projekt_maengel where id = m;
  -- Quelle und Status sind geprueft
  begin insert into public.projekt_maengel (projekt_id, titel, quelle) values (p, 'x', 'nachbar'); ok := false; exception when check_violation then ok := true; end;
  insert into befund values (default, 'Unbekannte Quelle wird abgewiesen', ok, null);
  -- To-do-Vorlage einmal je Mandant
  select public.maengel_vorlage_sicherstellen(a) into vid;
  select count(*) into n from public.todo_vorlage_schritt s where s.vorlage_id = vid;
  insert into befund values (default, 'To-do-Vorlage „Maengelbeseitigung“ entsteht einmal, mit vier Schritten',
    vid = public.maengel_vorlage_sicherstellen(a) and n = 4, format('%s Schritte, Vorlage %s', n, vid));
  -- Zahlungsplan: Rate 2 buendelt Abschnitte 2 und 3
  insert into public.projekt_zahlungsplan (projekt_id, zugang_id, einheit_id, position, bezeichnung, prozent, betrag, abschnitte) values (p, z, e, 2, 'Rohbau und Dach', 33.6, 100800, '{2,3}') returning id into zp;
  insert into wer values ('zp', zp);
  insert into befund values (default, 'Rate ohne erreichte Abschnitte ist nicht anforderbar', not exists (select 1 from public.rate_anforderbar(p)), null);
  insert into public.projekt_bautenstand (projekt_id, einheit_id, abschnitt) values (p, null, 2);
  insert into befund values (default, '…auch nicht mit einem von zwei Abschnitten', not exists (select 1 from public.rate_anforderbar(p)), null);
  insert into public.projekt_bautenstand (projekt_id, einheit_id, abschnitt) values (p, e, 3);
  select count(*) into n from public.rate_anforderbar(p) r where r.id = zp;
  insert into befund values (default, 'Alle Abschnitte erreicht (Haus + Einheit) -> Rate anforderbar', n = 1, n::text);
  select count(*) into n from public.aktivitaeten where typ = 'rate_anforderbar' and ref_id = zp;
  insert into befund values (default, 'Genau ein Glockeneintrag „Rate anforderbar“', n = 1, n::text);
  insert into public.projekt_bautenstand (projekt_id, einheit_id, abschnitt) values (p, e, 4);
  select count(*) into n from public.aktivitaeten where typ = 'rate_anforderbar' and ref_id = zp;
  insert into befund values (default, '…und beim naechsten Bautenstand kein zweiter', n = 1, n::text);
  begin insert into public.projekt_bautenstand (projekt_id, einheit_id, abschnitt) values (p, e, 14); ok := false; exception when check_violation then ok := true; end;
  insert into befund values (default, 'Bauabschnitt 14 gibt es nicht', ok, null);
  -- Adressabgleich
  insert into public.immobilien (strasse, hausnummer, plz, ort, objekttitel, vertragsart, immo_nr) values ('Seeweg', '1', '18055', 'Rostock', 'Haus am See', 'verkauf', 'BT-' || substr(a::text, 1, 8));
  select count(*) into n from public.objekte_zu_adresse('Seeweg 1, 18055 Rostock');
  insert into befund values (default, 'Adressabgleich findet das Objekt zur Adresse', n = 1, n::text);
  select count(*) into n from public.objekte_zu_adresse('Kirchstr. 9');
  insert into befund values (default, '…und nichts zu einer fremden Adresse', n = 0, n::text);
  -- fork_87: eine persoenliche Kaeuferdatei kann nie ueber den QR-Code gehen
  begin
    insert into public.projekt_dateien (projekt_id, zugang_id, name, pfad, kategorie, sichtbarkeit, qr_sichtbar) values (p, z, 'Privat.pdf', 'x/privat.pdf', 'sonstiges', 'kaeufer', true);
    ok := false;
  exception when check_violation then ok := true; end;
  insert into befund values (default, 'QR-Freigabe einer persoenlichen Kaeuferdatei wird abgewiesen', ok, null);
  insert into public.projekt_dateien (projekt_id, einheit_id, name, pfad, kategorie, sichtbarkeit, qr_sichtbar) values (p, e, 'Bauzeitenplan.pdf', 'gewerke/x.pdf', 'sonstiges', 'ausgewaehlt', true);
  insert into befund values (default, 'Unterlage fuer die Gewerke laesst sich fuer den QR-Code freigeben', (select count(*) from public.projekt_dateien where projekt_id = p and qr_sichtbar) = 1, null);
  begin update public.projekt_einheiten set sonderleistungen = '{"a":1}'::jsonb where id = e; ok := false; exception when check_violation then ok := true; end;
  insert into befund values (default, 'Sonderleistungen muessen eine Liste sein', ok, null);
  update public.projekt_maengel set grundriss_position = '{"x":0.42,"y":0.17}'::jsonb where id = m;
  insert into befund (pruefung, bestanden) select 'Mangel merkt sich seine Stelle im Grundriss', (grundriss_position->>'x')::numeric = 0.42 from public.projekt_maengel where id = m;
  -- Glocke fuer den fremden Mandanten: abgewiesen
  begin perform public.projekt_glocke((select wert from wer where was = 'b'), 'x', 'x', 'x'); ok := false; exception when insufficient_privilege then ok := true; end;
  insert into befund values (default, 'Glocke fuer einen fremden Mandanten wird abgewiesen', ok, null);
end $$;
reset role;
select set_config('request.jwt.claims', '', false);

-- --- Als Chef Beta: nichts davon sichtbar ----------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was = 'ub'), 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare n1 int; n2 int; n3 int; n4 int; n5 int;
begin
  select count(*) into n1 from public.uebergabeprotokoll where id = (select wert from wer where was = 'pr');
  select count(*) into n2 from public.projekt_maengel where id = (select wert from wer where was = 'm');
  select count(*) into n3 from public.projekt_bautenstand where projekt_id = (select wert from wer where was = 'p');
  select count(*) into n4 from public.rate_anforderbar((select wert from wer where was = 'p'));
  select count(*) into n5 from public.objekte_zu_adresse('Seeweg 1, 18055 Rostock');
  insert into befund values (default, 'Beta sieht weder Protokoll noch Mangel noch Bautenstand noch Rate noch Objekt', n1 = 0 and n2 = 0 and n3 = 0 and n4 = 0 and n5 = 0, format('%s/%s/%s/%s/%s', n1, n2, n3, n4, n5));
end $$;
reset role;
select set_config('request.jwt.claims', '', false);

-- --- Team-Richtlinie: ein Mitarbeiter von Alpha liest das Projekt-Protokoll --------------------------
do $$
declare um uuid := gen_random_uuid(); a uuid := (select wert from wer where was = 'a');
begin
  insert into auth.users (id, email) values (um, 'm-' || substr(a::text, 1, 8) || '@bt.example');
  insert into public.profiles (id, name, email, role, mandant_id) values (um, 'Mitarbeiter Alpha', 'm-' || substr(a::text, 1, 8) || '@bt.example', 'mitarbeiter', a);
  insert into wer values ('um', um);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was = 'um'), 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.uebergabeprotokoll where id = (select wert from wer where was = 'pr');
  insert into befund values (default, 'Mitarbeiter des Hauses liest das Neubau-Protokoll (nicht nur Ersteller und Chef)', n = 1, n::text);
end $$;
reset role;
select set_config('request.jwt.claims', '', false);

-- --- Aufraeumen und Urteil ---------------------------------------------------------------------------
delete from public.mandanten where id in (select wert from wer where was in ('a', 'b'));
delete from auth.users where id in (select wert from wer where was in ('ua', 'ub', 'um'));
select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as stand, pruefung, bemerkung from befund order by nr;
do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung, '; ') into n, liste from befund where bestanden is not true;
  if n > 0 then raise exception 'Bautraeger: % nicht bestanden — %', n, liste; end if;
end $$;
