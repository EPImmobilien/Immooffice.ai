-- Betreiber, Schritt 2 (fork_69): Metadaten ja, Inhalte nein — und Credits
-- abziehen ohne negativen Saldo, aelteste zuerst.
\set ON_ERROR_STOP on
set client_min_messages to warning;
create temp table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temp table wer (was text, wert uuid);

do $$
declare v_m uuid; v_admin uuid := gen_random_uuid(); v_chef uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Metahaus', 'meta-x') returning id into v_m;
  insert into auth.users (id, email) values (v_admin, 'admin@meta.example'), (v_chef, 'chef@meta.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (v_admin, 'Admin', 'admin@meta.example', 'chef', v_m),
    (v_chef, 'Chef', 'chef@meta.example', 'chef', v_m);
  insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz) values (v_admin, 'admin', true, 'Pruefung');
  insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values
    ('Geheimes Objekt', 'verkauf', v_m), ('Zweites Objekt', 'verkauf', v_m);
  -- Zwei Toepfe: der aeltere laeuft frueher ab.
  insert into public.credit_konten (mandant_id, quelle, credits, gueltig_bis, referenz) values
    (v_m, 'paket', 30, now() + interval '10 days', 'meta-alt'),
    (v_m, 'paket', 50, now() + interval '100 days', 'meta-neu');
  insert into wer values ('m', v_m), ('admin', v_admin), ('chef', v_chef);
end $$;

-- 1. Der Betreiber bekommt Zahlen — und keine Inhalte.
do $$
declare v uuid := (select wert from wer where was='admin'); m uuid := (select wert from wer where was='m');
        r jsonb; txt text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select public.plattform_mandant_metadaten(m) into r;
  reset role;
  txt := r::text;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Metadaten: zwei Objekte gezaehlt', (r->'zaehlwerte'->>'objekte')::int = 2, r->'zaehlwerte'->>'objekte'),
    ('Metadaten: das Onboarding kennt das erste Objekt', (r->'onboarding'->>'objekt_am') is not null, ''),
    ('Metadaten: KEIN Inhalt einer Fachtabelle in der Antwort', position('Geheimes Objekt' in txt) = 0, '');
end $$;

-- 2. Ein chef bekommt gar nichts.
do $$
declare v uuid := (select wert from wer where was='chef'); m uuid := (select wert from wer where was='m');
        ok boolean := false; r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  begin
    select public.plattform_mandant_metadaten(m) into r;
  exception when others then ok := sqlstate = '42501';
  end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('chef: Metadaten verweigert (42501)', ok, '');
end $$;

-- 3. Abziehen: aelteste zuerst, nie unter null.
do $$
declare m uuid := (select wert from wer where was='m'); v uuid := (select wert from wer where was='admin');
        alt int; neu int; saldo int; ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  perform public.credits_abziehen(m, 40, 'Pruefung: Fehlbuchung korrigiert', 'meta-abzug-1');
  reset role;
  select verbraucht into alt from public.credit_konten where referenz = 'meta-alt';
  select verbraucht into neu from public.credit_konten where referenz = 'meta-neu';
  select public.credits_saldo(m) into saldo;
  begin
    perform public.credits_abziehen(m, 500, 'Pruefung: zu viel', 'meta-abzug-2');
  exception when others then ok := sqlstate = '22023';
  end;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Abzug nimmt zuerst den aelteren Topf ganz (30)', alt = 30, alt::text),
    ('…und den Rest aus dem neueren (10)', neu = 10, neu::text),
    ('Saldo danach 40', saldo = 40, saldo::text),
    ('Abzug ueber den Saldo hinaus wird verweigert', ok, ''),
    ('Jede Buchung traegt Quelle betreiber und Grund',
      (select count(*) from public.credit_buchungen where mandant_id = m and aktion = 'betreiber_abzug'
         and quelle = 'betreiber' and notiz like 'Pruefung%') = 2, '');
end $$;

-- 4. support darf nicht abziehen.
do $$
declare m uuid := (select wert from wer where was='m'); v uuid := (select wert from wer where was='admin');
        ok boolean := false;
begin
  update public.plattform_admins set rolle = 'support' where benutzer_id = v;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  begin
    perform public.credits_abziehen(m, 1, 'Pruefung: support', 'meta-abzug-3');
  exception when others then ok := sqlstate = '42501';
  end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values ('support zieht keine Credits ab', ok, '');
end $$;

-- Aufraeumen — nur das Betreiberrecht. Das Credit-Ledger ist append-only
-- (fork_47), und zwar auch fuer eine Probe: der Mandant 'meta-x' bleibt mit
-- seinen Buchungen im Pruefbestand stehen. Der wird vor jedem Lauf neu
-- gebaut; herrenlos ist dabei nichts (alles traegt seinen Mandanten).
delete from public.plattform_admins where benutzer_id = (select wert from wer where was='admin');

select nr, case when bestanden then 'ok' else 'FEHLER' end as ergebnis, pruefung, bemerkung from befund order by nr;
do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then raise exception 'Betreiber-Metadaten: % Pruefung(en) nicht bestanden.', n; end if;
  raise notice 'Betreiber-Metadaten: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
