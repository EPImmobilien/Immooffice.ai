-- Betreiberbereich, Schritt 9 (fork_78): KI-Schranke, System-Mails,
-- Rechtstexte mit Zustimmung, Ankuendigungen mit Ziel.
--
--   * Notschalter: aktiv=false -> credits_reservieren wirft KI001, nichts reserviert
--   * Tageslimit: Credits von heute zaehlen, gestern nicht; Ueberschreitung KI002;
--     eine Ausnahme je Mandant schlaegt den globalen Wert
--   * system_mail_rendern setzt Platzhalter ein, laesst unbekannte stehen
--   * Rechtstexte: nur veroeffentlichte sind lesbar; rechtstexte_offen() nennt
--     dem chef die neue Fassung; nach Zustimmung nicht mehr; ein Mitarbeiter
--     kann nicht zustimmen; ein fremdes Haus nicht fuer dieses
--   * Ankuendigungen: Ziel nach Tarif trifft nur den passenden Mandanten
\set ON_ERROR_STOP on
create temporary table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temporary table wer (was text, wert uuid);

do $$
declare v_a uuid; v_b uuid; v_chef_a uuid := gen_random_uuid(); v_mit_a uuid := gen_random_uuid(); v_chef_b uuid := gen_random_uuid();
        -- Ledger und Nutzer bleiben nach dem Lauf (append-only); eindeutige Kennungen,
        -- damit der Test auch auf einer schon benutzten Datenbank laeuft.
        k text := substr(gen_random_uuid()::text, 1, 8);
begin
  insert into public.mandanten (name, slug, abo_status) values ('Alpha St', 'bst-a-' || k, 'aktiv') returning id into v_a;
  insert into public.mandanten (name, slug, abo_status) values ('Beta St', 'bst-b-' || k, 'test') returning id into v_b;
  insert into auth.users (id, email) values (v_chef_a, 'chefa-' || k || '@bst.example'), (v_mit_a, 'mita-' || k || '@bst.example'), (v_chef_b, 'chefb-' || k || '@bst.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (v_chef_a, 'Chef A', 'chefa-' || k || '@bst.example', 'chef', v_a), (v_mit_a, 'Mit A', 'mita-' || k || '@bst.example', 'mitarbeiter', v_a),
    (v_chef_b, 'Chef B', 'chefb-' || k || '@bst.example', 'chef', v_b);
  insert into public.mandant_abo (mandant_id, tarif, intervall, status) values (v_a, 'professional', 'monat', 'aktiv');
  -- Credits: ein Topf mit 100
  insert into public.credit_konten (mandant_id, quelle, credits, gueltig_von) values (v_a, 'tarif', 100, now() - interval '1 day');
  insert into wer values ('a', v_a), ('b', v_b), ('chef_a', v_chef_a), ('mit_a', v_mit_a), ('chef_b', v_chef_b);
end $$;

-- --- 1. Notschalter -----------------------------------------------------------
do $$
declare v_a uuid := (select wert from wer where was='a'); code text := ''; msg text := ''; v uuid; n int;
begin
  update public.plattform_ki_einstellungen set aktiv = false, hinweis = 'Textdienst gestoert' where funktion = 'ki_text';
  begin
    select public.credits_reservieren('ki_text', 'probe', v_a, null) into v;
  exception when others then code := sqlstate; msg := sqlerrm; end;
  select count(*) into n from public.credit_buchungen where mandant_id = v_a;
  update public.plattform_ki_einstellungen set aktiv = true, hinweis = null where funktion = 'ki_text';
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Notschalter: Reservierung wirft KI001', code = 'KI001', code || ' ' || msg),
    ('…mit dem Hinweis des Betreibers im Text', msg like '%Textdienst gestoert%', ''),
    ('…und nichts steht im Ledger', n = 0, n::text);
  -- Eingeschaltet geht es.
  select public.credits_reservieren('ki_text', 'probe', v_a, null) into v;
  perform public.credits_buchen(v, 0.02, 'probe');
  insert into befund (pruefung, bestanden, bemerkung) values ('Eingeschaltet reserviert es', v is not null, '');
end $$;

-- --- 2. Tageslimit ---------------------------------------------------------------
do $$
declare v_a uuid := (select wert from wer where was='a'); kosten int := public.credits_kosten('ki_text');
        code text := ''; v uuid; code2 text := ''; code3 text := '';
begin
  -- Gestern: viel Verbrauch, zaehlt nicht. (Ledger ist unveraenderlich -> direkt mit alter Zeit einfuegen.)
  insert into public.credit_buchungen (vorgang_id, mandant_id, aktion, credits, quelle, status, zeitpunkt)
    values (gen_random_uuid(), v_a, 'ki_text', 50, 'tarif', 'gebucht', now() - interval '1 day');
  -- Limit: heute sind `kosten` (aus Block 1) verbraucht; Limit = 2*kosten erlaubt genau eine weitere.
  update public.plattform_werte set wert = to_jsonb(2 * kosten) where schluessel = 'ki_tageslimit_credits';
  select public.credits_reservieren('ki_text', 'probe2', v_a, null) into v;
  perform public.credits_buchen(v, 0.02, 'probe');
  begin
    select public.credits_reservieren('ki_text', 'probe3', v_a, null) into v;
  exception when others then code := sqlstate; end;
  -- Ausnahme fuer das Haus: 0 = kein Limit -> geht wieder.
  insert into public.mandant_ki_limits (mandant_id, credits_tag) values (v_a, 0);
  begin
    select public.credits_reservieren('ki_text', 'probe4', v_a, null) into v; code2 := 'ok';
  exception when others then code2 := sqlstate; end;
  -- Kostenfreie Aktion ist nie betroffen.
  delete from public.mandant_ki_limits where mandant_id = v_a;
  begin
    select public.credits_reservieren('pdf_export', 'probe5', v_a, null) into v; code3 := 'ok';
  exception when others then code3 := sqlstate; end;
  update public.plattform_werte set wert = '0'::jsonb where schluessel = 'ki_tageslimit_credits';
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Tageslimit: die zweite Reservierung passt noch', true, ''),
    ('…die dritte wirft KI002 (gestern zaehlt nicht)', code = 'KI002', code),
    ('Ausnahme je Mandant (0 = kein Limit) hebt es auf', code2 = 'ok', code2),
    ('Kostenfreie Aktionen kennen kein Limit', code3 = 'ok', code3);
end $$;

-- --- 3. System-Mail rendern ------------------------------------------------------
do $$
declare r jsonb;
begin
  select public.system_mail_rendern('test_7', '{"firma":{"name":"Musterhaus GmbH"},"test":{"ende":"31.10.2026"},"portal":{"url":"https://p.example"}}'::jsonb) into r;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Platzhalter werden eingesetzt', r->>'text' like '%Musterhaus GmbH%31.10.2026%https://p.example%', left(r->>'text', 80)),
    ('Unbekannte Platzhalter bleiben sichtbar stehen', r->>'text' like '%{{test.lesetage}}%', ''),
    ('Unbekannter Schluessel -> null', public.system_mail_rendern('gibt_es_nicht', '{}'::jsonb) is null, '');
end $$;

-- --- 4. Rechtstexte -------------------------------------------------------------
do $$
declare v_chef_a uuid := (select wert from wer where was='chef_a'); v_mit_a uuid := (select wert from wer where was='mit_a');
        v_chef_b uuid := (select wert from wer where was='chef_b'); v_a uuid := (select wert from wer where was='a');
        v_entwurf uuid; v_live uuid; n_anon int; n_offen int; n_nach int; ok_mit boolean := false; ok_fremd boolean := false; st record;
begin
  insert into public.rechtstexte (art, version, titel, text, zustimmung_noetig) values ('agb', '9.0-entwurf', 'AGB Entwurf', 'Entwurf', true) returning id into v_entwurf;
  insert into public.rechtstexte (art, version, titel, text, zustimmung_noetig, veroeffentlicht_am, aenderungshinweis)
    values ('agb', '9.1', 'AGB 9.1', 'Neue AGB', true, now(), 'Abschnitt 4 neu') returning id into v_live;
  -- anon sieht nur Veroeffentlichtes
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n_anon from public.rechtstexte where id in (v_entwurf, v_live);
  reset role;
  -- Der Chef hat eine offene Zustimmung
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_a)::text, true);
  set local role authenticated;
  select count(*) into n_offen from public.rechtstexte_offen() where id = v_live;
  reset role;
  -- Mitarbeiter kann nicht zustimmen
  perform set_config('request.jwt.claims', json_build_object('sub', v_mit_a)::text, true);
  set local role authenticated;
  begin insert into public.rechtstext_zustimmungen (rechtstext_id) values (v_live); exception when others then ok_mit := true; end;
  reset role;
  -- Fremder Chef kann nicht fuer A zustimmen
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_b)::text, true);
  set local role authenticated;
  begin insert into public.rechtstext_zustimmungen (rechtstext_id, mandant_id) values (v_live, v_a); exception when others then ok_fremd := true; end;
  reset role;
  -- Der Chef stimmt zu -> nichts mehr offen
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_a)::text, true);
  set local role authenticated;
  insert into public.rechtstext_zustimmungen (rechtstext_id) values (v_live);
  select count(*) into n_nach from public.rechtstexte_offen();
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  select * into st from public.plattform_rechtstexte_stand() where rechtstext_id = v_live;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('anon liest nur veroeffentlichte Rechtstexte', n_anon = 1, n_anon::text),
    ('rechtstexte_offen() nennt dem Chef die neue Fassung', n_offen = 1, n_offen::text),
    ('Ein Mitarbeiter kann nicht zustimmen', ok_mit, ''),
    ('Ein fremder Chef kann nicht fuer dieses Haus zustimmen', ok_fremd, ''),
    ('Nach Zustimmung ist nichts mehr offen', n_nach = 0, n_nach::text),
    ('Der Betreiber sieht X von Y', st.zugestimmt = 1 and st.mandanten >= 2, st.zugestimmt || ' von ' || st.mandanten);
  delete from public.rechtstexte where id in (v_entwurf, v_live);
end $$;

-- --- 5. Ankuendigungen -------------------------------------------------------------
do $$
declare v_chef_a uuid := (select wert from wer where was='chef_a'); v_chef_b uuid := (select wert from wer where was='chef_b');
        v_k uuid; v_w uuid; n_a int; n_b int; n_w int;
begin
  insert into public.ankuendigungen (typ, titel, text, ziel_tarife) values ('info', 'Nur Professional', 'Hallo', '{professional}') returning id into v_k;
  insert into public.ankuendigungen (typ, titel, text, von) values ('wartung', 'Wartung', 'Samstag', now() + interval '2 days') returning id into v_w;
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_a)::text, true);
  set local role authenticated;
  select count(*) into n_a from public.meine_ankuendigungen() where id = v_k;
  select count(*) into n_w from public.meine_ankuendigungen() where id = v_w;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_chef_b)::text, true);
  set local role authenticated;
  select count(*) into n_b from public.meine_ankuendigungen() where id = v_k;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ziel Tarif trifft das Professional-Haus', n_a = 1, n_a::text),
    ('…und nicht das Testhaus ohne Tarif', n_b = 0, n_b::text),
    ('Eine Wartung in zwei Tagen ist schon sichtbar (Countdown)', n_w = 1, n_w::text);
  delete from public.ankuendigungen where id in (v_k, v_w);
end $$;

-- --- Aufraeumen und Urteil ---------------------------------------------------
-- Ledger, Mandant A und die Nutzer bleiben (append-only, nutzer_id im Ledger); das Testhaus B geht.
delete from public.mandanten where id = (select wert from wer where was = 'b');

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as stand, pruefung, bemerkung from befund order by nr;
do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung, '; ') into n, liste from befund where bestanden is not true;
  if n > 0 then raise exception 'Betreiber-Steuerung: % nicht bestanden — %', n, liste; end if;
end $$;
