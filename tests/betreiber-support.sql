-- Betreiberbereich, Schritt 8 (fork_77): Support-Anfragen und das Protokoll
-- einer freigegebenen Sitzung.
--
-- Die Freigabe selbst prueft tests/supportzugriff.sql (Block 8a). Hier:
--   * ein Mitarbeiter stellt eine Anfrage und sieht nur die seines Hauses,
--   * ein anderes Haus sieht sie nicht, auch nicht die Antworten,
--   * der Mandant kann sich nicht als Betreiber ausgeben (von_betreiber),
--   * die Antwort des Betreibers bewegt die Anfrage (erste Antwort, Stand),
--   * waehrend einer freigegebenen Schreib-Sitzung landet jede Aenderung im
--     Protokoll des Mandanten — und der Mandant liest es, der Admin nicht,
--   * Kennzahlen: support darf, chef nicht.
\set ON_ERROR_STOP on
create temporary table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temporary table wer (was text, wert uuid);

do $$
declare v_a uuid; v_b uuid; v_p uuid;
        v_chef_a uuid := gen_random_uuid(); v_mit_a uuid := gen_random_uuid();
        v_chef_b uuid := gen_random_uuid(); v_sup uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Alpha S', 'bs-a') returning id into v_a;
  insert into public.mandanten (name, slug) values ('Beta S', 'bs-b') returning id into v_b;
  insert into public.mandanten (name, slug) values ('Platt S', 'bs-p') returning id into v_p;
  insert into auth.users (id, email) values (v_chef_a, 'chefa@bs.example'), (v_mit_a, 'mita@bs.example'),
    (v_chef_b, 'chefb@bs.example'), (v_sup, 'sup@bs.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (v_chef_a, 'Chef A', 'chefa@bs.example', 'chef', v_a),
    (v_mit_a, 'Mit A', 'mita@bs.example', 'mitarbeiter', v_a),
    (v_chef_b, 'Chef B', 'chefb@bs.example', 'chef', v_b),
    (v_sup, 'Support', 'sup@bs.example', 'chef', v_p);
  insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz) values (v_sup, 'support', true, 'P');
  insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values ('Haus S-Alpha', 'verkauf', v_a);
  insert into wer values ('a', v_a), ('b', v_b), ('p', v_p), ('chef_a', v_chef_a), ('mit_a', v_mit_a),
    ('chef_b', v_chef_b), ('sup', v_sup);
end $$;

-- --- 1. Anfragen: eigenes Haus ja, fremdes nein ----------------------------
do $$
declare v_mit_a uuid := (select wert from wer where was='mit_a');
        v_chef_b uuid := (select wert from wer where was='chef_b');
        v_id uuid; n_a int; n_b int; v_fake boolean := false; v_fremd boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_mit_a)::text, true);
  set local role authenticated;
  insert into public.support_anfragen (betreff, text, kategorie, prioritaet)
    values ('Bilder fehlen', 'Im Expose 12 fehlen die Bilder.', 'fehler', 'hoch') returning id into v_id;
  select count(*) into n_a from public.support_anfragen;
  -- Als Betreiber ausgeben geht nicht.
  begin
    insert into public.support_antworten (anfrage_id, text, von_betreiber) values (v_id, 'Ich bin der Support', true);
  exception when others then v_fake := true; end;
  -- Eigene Antwort geht.
  insert into public.support_antworten (anfrage_id, text) values (v_id, 'Nachtrag: auch Expose 13.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_b)::text, true);
  set local role authenticated;
  select count(*) into n_b from public.support_anfragen;
  begin
    insert into public.support_antworten (anfrage_id, text, mandant_id)
      values (v_id, 'Fremde Antwort', (select wert from wer where was='a'));
  exception when others then v_fremd := true; end;
  reset role;
  insert into wer values ('anfrage', v_id);
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Mitarbeiter sieht die Anfrage seines Hauses', n_a = 1, n_a::text),
    ('Mandant kann sich nicht als Betreiber ausgeben', v_fake, ''),
    ('Ein anderes Haus sieht die Anfrage nicht', n_b = 0, n_b::text),
    ('…und kann nicht hineinantworten', v_fremd, ''),
    ('Die Anfrage traegt den Mandanten aus der Sitzung',
     (select mandant_id = (select wert from wer where was='a') from public.support_anfragen where id = v_id), '');
end $$;

-- --- 2. Die Antwort des Betreibers bewegt die Anfrage ----------------------
do $$
declare v_id uuid := (select wert from wer where was='anfrage'); r record; v_fremd boolean := false;
begin
  -- Der Betreiber schreibt mit dem Dienstschluessel (plattform-admin).
  insert into public.support_antworten (anfrage_id, mandant_id, von_betreiber, autor_id, autor_name, text)
    values (v_id, (select wert from wer where was='a'), true, (select wert from wer where was='sup'), 'Support', 'Wir schauen nach.');
  select * into r from public.support_anfragen where id = v_id;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Erste Antwort wird gestempelt', r.erste_antwort_am is not null, ''),
    ('Stand wechselt auf wartet_kunde', r.status = 'wartet_kunde', r.status);
  -- Der Kunde antwortet: wieder offen.
  perform set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was='mit_a'))::text, true);
  set local role authenticated;
  insert into public.support_antworten (anfrage_id, text) values (v_id, 'Danke.');
  reset role;
  select * into r from public.support_anfragen where id = v_id;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Antwort des Kunden setzt wieder auf offen', r.status = 'offen', r.status);
  -- Der Kunde schliesst selbst; ein anderes Haus kann das nicht.
  perform set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was='chef_b'))::text, true);
  set local role authenticated;
  begin perform public.support_anfrage_schliessen(v_id); v_fremd := false;
  exception when others then v_fremd := sqlstate = '42501'; end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values ('Fremdes Haus schliesst nicht', v_fremd, '');
  perform set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was='chef_a'))::text, true);
  set local role authenticated;
  perform public.support_anfrage_schliessen(v_id);
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Der Kunde schliesst seine Anfrage', (select status = 'geschlossen' from public.support_anfragen where id = v_id), '');
end $$;

-- --- 3. Das Protokoll der freigegebenen Sitzung ----------------------------
do $$
declare v_sup uuid := (select wert from wer where was='sup');
        v_a uuid := (select wert from wer where was='a');
        v_chef_a uuid := (select wert from wer where was='chef_a');
        v_id uuid; n_aend int; n_seite int; n_chef int; n_admin int; n_b int;
begin
  insert into public.support_sitzungen (admin_id, mandant_id, grund, schreiben, dauer_minuten, gueltig_bis)
    values (v_sup, v_a, 'Kunde bittet um Korrektur', true, 60, now() + interval '60 minutes') returning id into v_id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_a)::text, true);
  set local role authenticated;
  perform public.support_zugriff_entscheiden(v_id, true);
  reset role;
  -- Der Administrator arbeitet in der Sitzung: eine Seite, eine Aenderung.
  perform set_config('request.jwt.claims', json_build_object('sub', v_sup)::text, true);
  set local role authenticated;
  perform public.support_seite_protokollieren('#/objekte/123');
  update public.immobilien set bezeichnung = 'Haus S-Alpha (korrigiert)' where bezeichnung = 'Haus S-Alpha';
  select count(*) into n_admin from public.support_protokoll;
  reset role;
  select count(*) into n_aend from public.support_protokoll where sitzung_id = v_id and art = 'aenderung' and tabelle = 'immobilien' and was = 'update';
  select count(*) into n_seite from public.support_protokoll where sitzung_id = v_id and art = 'seite' and was = '#/objekte/123';
  -- Der Chef liest es; ein anderes Haus nicht.
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_a)::text, true);
  set local role authenticated;
  select count(*) into n_chef from public.support_protokoll where sitzung_id = v_id;
  perform public.support_zugriff_beenden(v_id);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was='chef_b'))::text, true);
  set local role authenticated;
  select count(*) into n_b from public.support_protokoll;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Die Aenderung steht im Protokoll (Tabelle, Vorgang — kein Inhalt)', n_aend = 1, n_aend::text),
    ('Der Seitenaufruf steht im Protokoll', n_seite = 1, n_seite::text),
    ('Der Chef liest das Protokoll', n_chef >= 2, n_chef::text),
    ('Der Administrator liest es nicht als eigenes', n_admin = 0, n_admin::text),
    ('Ein anderes Haus sieht nichts', n_b = 0, n_b::text),
    ('Der Chef hat die Sitzung beendet', (select beendet_am is not null and beendet_von = v_chef_a from public.support_sitzungen where id = v_id), ''),
    ('Ohne Sitzung schreibt der Trigger nichts',
     (select count(*) from public.support_protokoll where sitzung_id = v_id) = (select count(*) from public.support_protokoll), '');
end $$;

-- --- 4. Kennzahlen: support ja, chef nein ------------------------------------
do $$
declare ok_sup boolean := false; ok_chef boolean := false; k jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was='sup'))::text, true);
  set local role authenticated;
  begin select public.plattform_support_kennzahlen() into k; ok_sup := (k->>'offen') is not null; exception when others then ok_sup := false; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', (select wert from wer where was='chef_a'))::text, true);
  set local role authenticated;
  begin select public.plattform_support_kennzahlen() into k; exception when others then ok_chef := sqlstate = '42501'; end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('support liest die Kennzahlen', ok_sup, coalesce(k::text, '')),
    ('chef nicht (42501)', ok_chef, '');
end $$;

-- --- Aufraeumen und Urteil ---------------------------------------------------
delete from public.mandanten where slug in ('bs-a', 'bs-b', 'bs-p');
delete from auth.users where email like '%@bs.example';

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as stand, pruefung, bemerkung from befund order by nr;
do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung, '; ') into n, liste from befund where bestanden is not true;
  if n > 0 then raise exception 'Betreiber-Support: % nicht bestanden — %', n, liste; end if;
end $$;
