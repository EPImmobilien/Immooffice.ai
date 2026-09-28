-- Markierte Felder in der eigenen Vorlage: haelt das Modell, was es soll?
--
-- Die Markierung ist das Bindeglied zwischen dem, was der Makler in seinem
-- Word- oder PDF-Dokument sieht, und dem, was die Anwendung dort einsetzt.
-- Geht dabei etwas still daneben — ein halber Zeiger, ein Feldname, den die
-- Erzeugung nicht kennt, dasselbe Feld zweimal —, merkt es niemand, bis ein
-- Vertrag mit einer leeren Stelle beim Eigentuemer liegt. Deshalb weist die
-- Datenbank jeden dieser Faelle ab, statt sie zu schlucken.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('vf-a', 'vf-b');
delete from auth.users where email like '%@vfelder.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;

do $$
declare m_a uuid; m_b uuid; v_word uuid; v_pdf uuid; v_b uuid;
        u_a uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Alpha GmbH', 'vf-a') returning id into m_a;
  insert into public.mandanten (name, slug) values ('Beta GmbH',  'vf-b') returning id into m_b;

  insert into public.vertragsvorlagen (mandant_id, art, storage_pfad, dateiformat)
    values (m_a, 'maklervertrag', 'vorlagen/mv.docx', 'docx') returning id into v_word;
  insert into public.vertragsvorlagen (mandant_id, art, storage_pfad, dateiformat)
    values (m_a, 'reservierung', 'vorlagen/res.pdf', 'pdf') returning id into v_pdf;
  insert into public.vertragsvorlagen (mandant_id, art, storage_pfad, dateiformat)
    values (m_b, 'maklervertrag', 'vorlagen/mv-b.docx', 'docx') returning id into v_b;

  insert into auth.users (id, email) values (u_a, 'a@vfelder.example');
  insert into public.profiles (id, name, email, role, mandant_id)
    values (u_a, 'Alpha Chefin', 'a@vfelder.example', 'chef', m_a);

  insert into wer values ('m_a', m_a), ('m_b', m_b), ('v_word', v_word),
                         ('v_pdf', v_pdf), ('v_b', v_b), ('u_a', u_a);
end $$;

-- --- 1) Eine Textstelle im Word ------------------------------------------
do $$
declare neu uuid; m uuid;
begin
  insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, suchtext, vorkommen)
  values ((select wert from wer where was='v_word'), 'laufzeit_monate', 'textstelle',
          'Dauer von 6 Monaten', 1) returning id into neu;
  select mandant_id into m from public.vorlagen_felder where id = neu;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Textstelle im Word laesst sich markieren', neu is not null, 'angelegt'),
         ('Der Mandant kommt von der Vorlage', m = (select wert from wer where was='m_a'),
          coalesce(m::text, '(leer)'));
end $$;

-- --- 2) Ein Rechteck im PDF ----------------------------------------------
do $$
declare neu uuid;
begin
  insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, seite, x, y, breite, hoehe)
  values ((select wert from wer where was='v_pdf'), 'kaufpreis', 'rechteck', 0, 72, 640, 180, 18)
  returning id into neu;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Rechteck im PDF laesst sich markieren', neu is not null, 'angelegt');
end $$;

-- --- 3) Ein halber Zeiger wird abgewiesen ---------------------------------
-- Ein Rechteck ohne Koordinaten waere eine Markierung, die beim Erzeugen
-- stumm nichts tut.
do $$
declare meldung text;
begin
  begin
    insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, seite)
    values ((select wert from wer where was='v_pdf'), 'projektname', 'rechteck', 0);
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Rechteck ohne Koordinaten wird abgewiesen', false, 'ging durch');
  exception when check_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Rechteck ohne Koordinaten wird abgewiesen', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Rechteck ohne Koordinaten wird abgewiesen', false, left(meldung, 60));
  end;

  begin
    insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, suchtext)
    values ((select wert from wer where was='v_word'), 'provision', 'textstelle', '   ');
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Textstelle ohne Suchtext wird abgewiesen', false, 'ging durch');
  exception when check_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Textstelle ohne Suchtext wird abgewiesen', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Textstelle ohne Suchtext wird abgewiesen', false, left(meldung, 60));
  end;
end $$;

-- --- 4) Ein Feldname, den die Art nicht kennt -----------------------------
-- "wohneinheit_nr" gehoert zur Reservierung, nicht zum Maklervertrag.
do $$
declare meldung text;
begin
  begin
    insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, suchtext)
    values ((select wert from wer where was='v_word'), 'wohneinheit_nr', 'textstelle', 'WE 16');
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Feld einer fremden Dokumentart wird abgewiesen', false, 'ging durch');
  exception when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Feld einer fremden Dokumentart wird abgewiesen',
              meldung like '%kennt eine Vorlage%', left(meldung, 70));
  end;
end $$;

-- --- 5) Dasselbe Feld zweimal an derselben Vorlage ------------------------
do $$
declare meldung text;
begin
  begin
    insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, suchtext)
    values ((select wert from wer where was='v_word'), 'laufzeit_monate', 'textstelle', 'noch mal');
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Ein Feld nur einmal je Vorlage', false, 'ging durch');
  exception when unique_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Ein Feld nur einmal je Vorlage', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Ein Feld nur einmal je Vorlage', false, left(meldung, 60));
  end;
end $$;

-- --- 6) Eine unbrauchbare Schriftgroesse ----------------------------------
do $$
declare meldung text;
begin
  begin
    insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, seite, x, y, breite, hoehe, schriftgroesse)
    values ((select wert from wer where was='v_pdf'), 'etage', 'rechteck', 0, 10, 10, 50, 12, 0.5);
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unlesbare Schriftgroesse wird abgewiesen', false, 'ging durch');
  exception when check_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unlesbare Schriftgroesse wird abgewiesen', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unlesbare Schriftgroesse wird abgewiesen', false, left(meldung, 60));
  end;
end $$;

-- --- 7) Der Katalog kennt beide Seiten ------------------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'Der Katalog liefert je Art eine Liste',
       jsonb_array_length(public.vorlagen_feld_katalog('maklervertrag')) > 5
   and jsonb_array_length(public.vorlagen_feld_katalog('objektnachweis')) > 5
   and jsonb_array_length(public.vorlagen_feld_katalog('reservierung')) > 5
   and jsonb_array_length(public.vorlagen_feld_katalog('quatsch')) = 0,
       'Maklervertrag: ' || jsonb_array_length(public.vorlagen_feld_katalog('maklervertrag'))::text
       || ', Objektnachweis: ' || jsonb_array_length(public.vorlagen_feld_katalog('objektnachweis'))::text
       || ', Reservierung: ' || jsonb_array_length(public.vorlagen_feld_katalog('reservierung'))::text;

-- --- 8) Die Markierungen des einen gehen den anderen nichts an ------------
do $$
declare gesehen int; meldung text; zustand text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='u_a'))::text, true);
  set local role authenticated;
  select count(*) into gesehen from public.vorlagen_felder;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Alpha sieht nur die eigenen Markierungen', gesehen = 2, 'gesehen: ' || gesehen::text);

  begin
    insert into public.vorlagen_felder (vorlage_id, feld, zeiger_art, suchtext)
    values ((select wert from wer where was='v_b'), 'provision', 'textstelle', 'fremd');
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Keine Markierung an der Vorlage eines fremden Mandanten', false, 'ging durch');
  exception when others then
    get stacked diagnostics meldung = message_text, zustand = returned_sqlstate;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Keine Markierung an der Vorlage eines fremden Mandanten', zustand = '42501',
              'SQLSTATE ' || zustand || ': ' || left(meldung, 45));
  end;
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
    raise exception 'Die markierten Felder stimmen nicht: % von % — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Markierte Felder: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
