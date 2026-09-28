-- Laufzeit, Provision und Fristen: gilt am Ende der richtige Wert?
--
-- Vier Stufen, die innerste gewinnt — eingebaut, Vorgaben des Mandanten,
-- Vorlage des Mandanten, Vorlage der Gesellschaft. Geprueft wird jede Stufe
-- einzeln UND die Reihenfolge, denn eine Stufe, die die falsche sticht, faellt
-- sonst erst auf, wenn ein Vertrag mit fremden Zahlen beim Kunden liegt.
--
-- Die wichtigste Pruefung ist die vorletzte: zwei Mandanten duerfen einander
-- nicht ueberschreiben. Bis zum 28.09.2026 konnten sie das — der
-- Primaerschluessel von portal_einstellungen war (schluessel) allein, und die
-- Oberflaeche schreibt mit upsert darauf.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('vg-a', 'vg-b');
delete from auth.users where email like '%@vorgaben.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;

do $$
declare m_a uuid; m_b uuid; g_a uuid; u_a uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Alpha GmbH', 'vg-a') returning id into m_a;
  insert into public.mandanten (name, slug) values ('Beta GmbH',  'vg-b') returning id into m_b;
  insert into public.gesellschaften (mandant_id, name) values (m_a, 'Alpha Nord') returning id into g_a;
  insert into auth.users (id, email) values (u_a, 'a@vorgaben.example');
  insert into public.profiles (id, name, email, role, mandant_id)
    values (u_a, 'Alpha Chefin', 'a@vorgaben.example', 'chef', m_a);
  insert into wer values ('m_a', m_a), ('m_b', m_b), ('g_a', g_a), ('u_a', u_a);
end $$;

-- --- 1) Ohne alles gilt das eingebaute Verhalten ---------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'Ohne Einstellung gilt das bisherige Verhalten',
       public.vorlage_vorgaben('maklervertrag') = '{"laufzeit_monate":"6","provision":"3,57","provisionsmodell":"teilung"}'::jsonb,
       public.vorlage_vorgaben('maklervertrag')::text;

insert into befund (pruefung, bestanden, bemerkung)
select 'Objektnachweis und Reservierung haben eigene Felder',
       public.vorlage_vorgaben('objektnachweis') = '{"provision":"3,00"}'::jsonb
   and public.vorlage_vorgaben('reservierung') ? 'zahlungsfrist_werktage',
       public.vorlage_vorgaben('reservierung')::text;

-- --- 2) Die Vorgaben des Mandanten stechen das Eingebaute ------------------
insert into public.portal_einstellungen (mandant_id, schluessel, wert) values
  ((select wert from wer where was='m_a'), 'laufzeit_monate_standard', '"9"'::jsonb),
  ((select wert from wer where was='m_a'), 'provision_verkaeufer_standard', '"2,38"'::jsonb);

do $$
declare v jsonb;
begin
  -- Unter RLS, nicht daneben: sonst saehe vorlage_vorgaben die Vorlagen
  -- ALLER Mandanten und suchte sich die hoechste Fassung daraus. Genau das
  -- ist am 28.09.2026 passiert, als eine zweite Pruefung Zeilen anderer
  -- Mandanten hinterliess — die Pruefung war bis dahin gruen, weil nichts
  -- anderes in der Tabelle stand.
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='u_a'))::text, true);
  set local role authenticated;
  v := public.vorlage_vorgaben('maklervertrag');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Vorgaben des Mandanten stechen das Eingebaute',
          v->>'laufzeit_monate' = '9' and v->>'provision' = '2,38'
          and v->>'provisionsmodell' = 'teilung', v::text);
end $$;

-- --- 2b) Auch die Reservierung hat Vorgaben --------------------------------
insert into public.portal_einstellungen (mandant_id, schluessel, wert) values
  ((select wert from wer where was='m_a'), 'reservierung_gebuehr_standard', '"2500"'::jsonb),
  ((select wert from wer where was='m_a'), 'reservierung_dauer_tage_standard', '"45"'::jsonb);

do $$
declare v jsonb;
begin
  -- Unter RLS, nicht daneben: sonst saehe vorlage_vorgaben die Vorlagen
  -- ALLER Mandanten und suchte sich die hoechste Fassung daraus. Genau das
  -- ist am 28.09.2026 passiert, als eine zweite Pruefung Zeilen anderer
  -- Mandanten hinterliess — die Pruefung war bis dahin gruen, weil nichts
  -- anderes in der Tabelle stand.
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='u_a'))::text, true);
  set local role authenticated;
  v := public.vorlage_vorgaben('reservierung');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Reservierung: Gebuehr und Dauer aus den Vorgaben, Frist eingebaut',
          v->>'reservierungsgebuehr_brutto' = '2500'
      and v->>'reservierungsdauer_tage' = '45'
      and v->>'zahlungsfrist_werktage' = '5', v::text);
end $$;

-- --- 3) Die Vorlage des Mandanten sticht seine Vorgaben --------------------
insert into public.vertragsvorlagen (mandant_id, art, storage_pfad, vorgaben)
values ((select wert from wer where was='m_a'), 'maklervertrag', 'vorlagen/mv.docx',
        '{"laufzeit_monate":"12"}'::jsonb);

do $$
declare v jsonb;
begin
  -- Unter RLS, nicht daneben: sonst saehe vorlage_vorgaben die Vorlagen
  -- ALLER Mandanten und suchte sich die hoechste Fassung daraus. Genau das
  -- ist am 28.09.2026 passiert, als eine zweite Pruefung Zeilen anderer
  -- Mandanten hinterliess — die Pruefung war bis dahin gruen, weil nichts
  -- anderes in der Tabelle stand.
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='u_a'))::text, true);
  set local role authenticated;
  v := public.vorlage_vorgaben('maklervertrag');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Die Vorlage sticht die Vorgaben — aber nur in ihrem Feld',
          v->>'laufzeit_monate' = '12' and v->>'provision' = '2,38', v::text);
end $$;

-- --- 4) Die Vorlage der Gesellschaft sticht die des Mandanten --------------
insert into public.vertragsvorlagen (mandant_id, gesellschaft_id, art, storage_pfad, vorgaben)
values ((select wert from wer where was='m_a'), (select wert from wer where was='g_a'),
        'maklervertrag', 'vorlagen/mv-nord.docx', '{"laufzeit_monate":"3","provision":"3,00"}'::jsonb);

do $$
declare v jsonb; ohne jsonb;
begin
  -- Unter RLS, nicht daneben: sonst saehe vorlage_vorgaben die Vorlagen
  -- ALLER Mandanten und suchte sich die hoechste Fassung daraus. Genau das
  -- ist am 28.09.2026 passiert, als eine zweite Pruefung Zeilen anderer
  -- Mandanten hinterliess — die Pruefung war bis dahin gruen, weil nichts
  -- anderes in der Tabelle stand.
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(select wert from wer where was='u_a'))::text, true);
  set local role authenticated;
  v    := public.vorlage_vorgaben('maklervertrag', (select wert from wer where was='g_a'));
  ohne := public.vorlage_vorgaben('maklervertrag');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Die Gesellschaft sticht den Mandanten',
          v->>'laufzeit_monate' = '3' and v->>'provision' = '3,00', v::text),
         ('Ohne Gesellschaft bleibt es bei der Vorlage des Mandanten',
          ohne->>'laufzeit_monate' = '12', ohne::text);
end $$;

-- --- 5) Zwei Mandanten ueberschreiben einander nicht -----------------------
-- Genau der Fehler, den der alte Primaerschluessel zugelassen hat.
insert into public.portal_einstellungen (mandant_id, schluessel, wert) values
  ((select wert from wer where was='m_b'), 'laufzeit_monate_standard', '"24"'::jsonb);

-- Gelesen wird hier OHNE Mandantenbrille: die Frage ist, ob beide Zeilen
-- nebeneinander existieren, nicht ob Alpha die von Beta sehen darf. Das
-- darf Alpha ausdruecklich nicht — Pruefung 7 in tests/vorlagen-felder.sql
-- haelt das fest.
do $$
declare a text; b text;
begin
  a := (select wert #>> '{}' from public.portal_einstellungen
         where mandant_id = (select wert from wer where was='m_a')
           and schluessel = 'laufzeit_monate_standard');
  b := (select wert #>> '{}' from public.portal_einstellungen
         where mandant_id = (select wert from wer where was='m_b')
           and schluessel = 'laufzeit_monate_standard');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Zwei Mandanten fuehren denselben Schluessel nebeneinander',
          a = '9' and b = '24', 'Alpha: ' || coalesce(a,'(leer)') || ', Beta: ' || coalesce(b,'(leer)'));
end $$;

-- --- 6) Ein Tippfehler im Feldnamen wird abgewiesen ------------------------
-- Eine Angabe, die nie greift, vermisst niemand — deshalb faengt die
-- Pruefbedingung sie ab, statt sie still zu schlucken.
do $$
declare meldung text;
begin
  begin
    insert into public.vertragsvorlagen (mandant_id, art, storage_pfad, vorgaben)
    values ((select wert from wer where was='m_a'), 'maklervertrag', 'vorlagen/tipp.docx',
            '{"laufzeit_monat":"12"}'::jsonb);
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unbekannter Feldname wird abgewiesen', false, 'ging durch');
  exception when check_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unbekannter Feldname wird abgewiesen', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Unbekannter Feldname wird abgewiesen', false, 'anderer Fehler: ' || left(meldung, 60));
  end;
end $$;

-- --- 7) Ein Feld der falschen Art wird abgewiesen --------------------------
do $$
declare meldung text;
begin
  begin
    insert into public.vertragsvorlagen (mandant_id, art, storage_pfad, vorgaben)
    values ((select wert from wer where was='m_a'), 'vollmacht', 'vorlagen/vm.docx',
            '{"laufzeit_monate":"12"}'::jsonb);
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Eine Vollmacht kennt keine Laufzeit', false, 'ging durch');
  exception when check_violation then
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Eine Vollmacht kennt keine Laufzeit', true, 'abgewiesen');
  when others then
    get stacked diagnostics meldung = message_text;
    insert into befund (pruefung, bestanden, bemerkung)
      values ('Eine Vollmacht kennt keine Laufzeit', false, 'anderer Fehler: ' || left(meldung, 60));
  end;
end $$;

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Die Vorgaben der Vorlagen stimmen nicht: % von % — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Vorgaben der Vorlagen: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
