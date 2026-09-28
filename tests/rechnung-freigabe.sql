-- Zahlungsbedingungen und Rechnungsfreigabe
--
-- Abschnitt 3c: "Ist jemand gesetzt, gehen Rechnungen erst nach dessen
-- Freigabe raus." Die Frage, auf die es ankommt, ist nicht, ob der Knopf in
-- der Oberflaeche ausgegraut ist, sondern ob rechnung_stellen() die Rechnung
-- ohne Freigabe abweist — und ob jemand anderes als der Benannte freigeben
-- kann.
--
-- Dazu die Gegenprobe: OHNE eingerichteten Verantwortlichen muss alles
-- bleiben, wie es war. Eine Freigabe, die immer noetig ist, waere eine
-- Verhaltensaenderung fuer jeden bestehenden Mandanten.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('frei1');
delete from auth.users where email like '%@frei.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;

do $$
declare
  m uuid; g uuid; f uuid;
  u_chef uuid := gen_random_uuid();
  u_buch uuid := gen_random_uuid();
  r_klein uuid; r_gross uuid; r_ohne uuid;
begin
  insert into public.mandanten (name, slug) values ('Freigabe GmbH', 'frei1') returning id into m;
  insert into public.gesellschaften (mandant_id, name) values (m, 'Haupt GmbH') returning id into g;
  insert into public.firma_stammdaten (firma_name, mandant_id, gesellschaft_id, slug,
                                       rechnung_nummer_praefix, rechnung_nummer_mit_jahr)
    values ('Haupt GmbH', m, g, 'haupt', 'RE', true) returning id into f;

  insert into auth.users (id, email) values (u_chef, 'chef@frei.example'), (u_buch, 'buch@frei.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (u_chef, 'Chefin', 'chef@frei.example', 'chef', m),
    (u_buch, 'Buchhaltung', 'buch@frei.example', 'mitarbeiter', m);

  -- Drei Rechnungen: eine kleine, eine grosse, eine fuer den Fall ohne
  -- Verantwortlichen.
  insert into public.rechnungen (empfaenger_name, mandant_id, absender_firma_id, status, bruttobetrag)
    values ('Kunde klein', m, f, 'entwurf', 100) returning id into r_klein;
  insert into public.rechnungen (empfaenger_name, mandant_id, absender_firma_id, status, bruttobetrag)
    values ('Kunde gross', m, f, 'entwurf', 5000) returning id into r_gross;
  insert into public.rechnungen (empfaenger_name, mandant_id, absender_firma_id, status, bruttobetrag)
    values ('Kunde ohne', m, f, 'entwurf', 5000) returning id into r_ohne;
  insert into public.rechnung_positionen (rechnung_id, beschreibung, menge, einzelpreis_netto, mwst_satz, mandant_id)
    values (r_klein, 'Leistung', 1, 100, 19, m),
           (r_gross, 'Leistung', 1, 5000, 19, m),
           (r_ohne,  'Leistung', 1, 5000, 19, m);

  insert into wer values ('mandant', m), ('gesellschaft', g), ('firma', f),
                         ('chef', u_chef), ('buch', u_buch),
                         ('r_klein', r_klein), ('r_gross', r_gross), ('r_ohne', r_ohne);
end $$;

-- --- 1) Ohne Verantwortlichen bleibt alles beim Alten ---------------------
do $$
declare n text; meldung text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='chef'))::text, true);
  set local role authenticated;
  begin
    n := public.rechnung_stellen((select wert from wer where was='r_ohne'));
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Ohne Verantwortlichen stellt ein Entwurf wie bisher', n is not null,
              'Nummer: ' || coalesce(n, '(keine)'));
  exception when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Ohne Verantwortlichen stellt ein Entwurf wie bisher', false, left(meldung, 70));
  end;
  reset role;
end $$;

-- --- Ab hier mit Verantwortlichem, ab 1000 Euro ---------------------------
insert into public.rechnung_einstellungen (mandant_id, gesellschaft_id, freigabe_durch, freigabe_ab_betrag)
values ((select wert from wer where was='mandant'), (select wert from wer where was='gesellschaft'),
        (select wert from wer where was='buch'), 1000);

-- --- 2) Unter der Grenze weiterhin ohne Freigabe --------------------------
do $$
declare n text; meldung text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='chef'))::text, true);
  set local role authenticated;
  begin
    n := public.rechnung_stellen((select wert from wer where was='r_klein'));
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unter der Betragsgrenze braucht es keine Freigabe', n is not null,
              'Nummer: ' || coalesce(n, '(keine)'));
  exception when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unter der Betragsgrenze braucht es keine Freigabe', false, left(meldung, 70));
  end;
  reset role;
end $$;

-- --- 3) Ueber der Grenze: ohne Freigabe geht nichts -----------------------
do $$
declare meldung text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='chef'))::text, true);
  set local role authenticated;
  begin
    perform public.rechnung_stellen((select wert from wer where was='r_gross'));
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Ueber der Grenze wird ein Entwurf abgewiesen', false, 'ging durch');
  exception when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Ueber der Grenze wird ein Entwurf abgewiesen',
              meldung like '%Freigabe%', left(meldung, 70));
  end;
  reset role;
end $$;

-- --- 4) Auch die Chefin darf nicht freigeben, wenn sie es nicht ist -------
do $$
declare meldung text; zustand text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='chef'))::text, true);
  set local role authenticated;
  perform public.rechnung_zur_freigabe((select wert from wer where was='r_gross'));
  begin
    perform public.rechnung_freigeben((select wert from wer where was='r_gross'));
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Nur der Benannte gibt frei, auch nicht die Chefin', false, 'ging durch');
  exception when others then
    get stacked diagnostics meldung = message_text, zustand = returned_sqlstate;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Nur der Benannte gibt frei, auch nicht die Chefin',
              zustand = '42501', 'SQLSTATE ' || zustand || ': ' || left(meldung, 50));
  end;
  reset role;
end $$;

-- --- 5) Der Benannte gibt frei, dann geht die Rechnung raus ---------------
do $$
declare n text; meldung text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='buch'))::text, true);
  set local role authenticated;
  perform public.rechnung_freigeben((select wert from wer where was='r_gross'));
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='chef'))::text, true);
  set local role authenticated;
  begin
    n := public.rechnung_stellen((select wert from wer where was='r_gross'));
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Nach der Freigabe geht die Rechnung raus', n is not null,
              'Nummer: ' || coalesce(n, '(keine)'));
  exception when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Nach der Freigabe geht die Rechnung raus', false, left(meldung, 70));
  end;
  reset role;
end $$;

-- --- 6) Jeder Schritt steht im Protokoll ----------------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'Zur Freigabe und Freigabe stehen im Protokoll',
       count(*) filter (where aktion = 'zur_freigabe') = 1
   and count(*) filter (where aktion = 'freigegeben') = 1,
       string_agg(aktion, ', ' order by created_at)
  from public.rechnungen_audit
 where rechnung_id = (select wert from wer where was='r_gross');

-- --- 7) Der Text der Zahlungsbedingung ------------------------------------
do $$
declare z1 uuid; z2 uuid;
begin
  insert into public.zahlungsbedingungen (mandant_id, gesellschaft_id, name, netto_tage)
  values ((select wert from wer where was='mandant'), (select wert from wer where was='gesellschaft'),
          '14 Tage netto', 14) returning id into z1;
  insert into public.zahlungsbedingungen (mandant_id, gesellschaft_id, name, netto_tage,
                                          skonto_prozent, skonto_tage)
  values ((select wert from wer where was='mandant'), (select wert from wer where was='gesellschaft'),
          '7 Tage 2 % Skonto', 30, 2, 7) returning id into z2;

  insert into befund (pruefung, bestanden, bemerkung)
  values ('Text ohne Skonto', public.zahlungsbedingung_text(z1) =
          'Zahlbar innerhalb von 14 Tagen ohne Abzug.', public.zahlungsbedingung_text(z1)),
         ('Text mit Skonto', public.zahlungsbedingung_text(z2) =
          'Zahlbar innerhalb von 7 Tagen mit 2 % Skonto, innerhalb von 30 Tagen ohne Abzug.',
          public.zahlungsbedingung_text(z2));
end $$;

-- --- 8) Ein Skontoziel nach der Faelligkeit wird abgewiesen ---------------
do $$
declare meldung text;
begin
  begin
    insert into public.zahlungsbedingungen (mandant_id, name, netto_tage, skonto_prozent, skonto_tage)
    values ((select wert from wer where was='mandant'), 'Unsinn', 7, 2, 30);
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Skontoziel nach der Faelligkeit wird abgewiesen', false, 'ging durch');
  exception when check_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Skontoziel nach der Faelligkeit wird abgewiesen', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Skontoziel nach der Faelligkeit wird abgewiesen', false,
              'anderer Fehler: ' || left(meldung, 50));
  end;
end $$;

select nr, case when bestanden then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where not bestanden;
  if n > 0 then
    raise exception 'Freigabe oder Zahlungsbedingungen stimmen nicht: % von % — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Freigabe und Zahlungsbedingungen: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
