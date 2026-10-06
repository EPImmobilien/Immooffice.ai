-- ===========================================================================
-- Hält die Abrechnung dicht: Credits, Mandantentrennung, Ledger, Limits
-- ===========================================================================
-- Vier Dinge, die an der Abrechnung niemand halb ausprobieren kann, weil sie
-- Geld und fremde Daten betreffen:
--
--   1. Kein Mandant sieht Abo-, Credit- oder Ledger-Daten eines anderen.
--   2. Credits werden reserviert, bevor die KI läuft, und bei einem Fehler
--      zurückgegeben. Kein negativer Saldo, nie.
--   3. Die Verbrauchsreihenfolge stimmt: erst Tarif, dann die ältesten
--      gekauften.
--   4. Das Ledger ist unveränderlich — bis auf den einen erlaubten Übergang
--      und den Abgang mit dem Mandanten.
--
-- Läuft gegen eine echte Postgres-Instanz (npm run db:test). Was an Stripes
-- API hängt, steht hier NICHT: das lässt sich ohne Stripe nicht prüfen und
-- ist in docs/BILLING.md als Abnahme beim Betreiber beschrieben.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset pager off

-- Reste eines abgebrochenen Laufs wegraeumen. Ein Test, der beim zweiten Mal
-- an sich selbst scheitert, wird irgendwann nicht mehr ausgefuehrt.
delete from public.mandanten where slug like 'abr-test%';
delete from auth.users where email like '%@abr.example';
delete from public.plattform_credit_preise where aktion like 'abr_test%';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;

-- --- Zwei Mandanten, zwei Chefs -------------------------------------------
do $$
declare
  v_a uuid; v_b uuid;
  v_chef_a uuid := gen_random_uuid();
  v_chef_b uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug, abo_status) values ('Alpha GmbH', 'abr-test-a', 'aktiv')
    returning id into v_a;
  insert into public.mandanten (name, slug, abo_status) values ('Beta GmbH', 'abr-test-b', 'aktiv')
    returning id into v_b;

  insert into auth.users (id, email, email_confirmed_at)
    values (v_chef_a, 'chef-a@abr.example', now()), (v_chef_b, 'chef-b@abr.example', now());
  insert into public.profiles (id, name, email, role, mandant_id) values
    (v_chef_a, 'Chef A', 'chef-a@abr.example', 'chef', v_a),
    (v_chef_b, 'Chef B', 'chef-b@abr.example', 'chef', v_b);

  insert into public.mandant_abo (mandant_id, tarif, intervall, status) values
    (v_a, 'starter', 'monat', 'aktiv'),
    (v_b, 'professional', 'monat', 'aktiv');

  create temporary table wer (was text primary key, wert uuid);
  grant all on wer to public;
  insert into wer values ('a', v_a), ('b', v_b), ('chef_a', v_chef_a), ('chef_b', v_chef_b);
end
$$;

-- --- 1) Töpfe, Reihenfolge, kein negativer Saldo ---------------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_chef uuid := (select wert from wer where was = 'chef_a');
  v_vorgang uuid;
  v_saldo int;
  v_tarif int;
  v_alt int;
  v_neu int;
begin
  -- Tarif (verfällt am Periodenende) und zwei gekaufte Pakete.
  perform public.credits_gutschreiben(v_a, 'tarif', 10, now() + interval '30 days', 'abr:tarif');
  perform public.credits_gutschreiben(v_a, 'paket', 5,  now() + interval '300 days', 'abr:alt');
  perform public.credits_gutschreiben(v_a, 'paket', 5,  now() + interval '360 days', 'abr:neu');

  select public.credits_saldo(v_a) into v_saldo;
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Saldo ist die Summe der gültigen Töpfe', v_saldo = 20, v_saldo::text);

  -- Eine Aktion über 12 Credits: 10 aus dem Tarif, 2 aus dem ÄLTEREN Paket.
  insert into public.plattform_credit_preise (aktion, name, credits)
    values ('abr_test_12', 'Prüfaktion', 12) on conflict (aktion) do update set credits = 12;
  v_vorgang := public.credits_reservieren('abr_test_12', 'pruefung', v_a, v_chef);

  select credits - verbraucht into v_tarif from public.credit_konten
   where mandant_id = v_a and quelle = 'tarif';
  select credits - verbraucht into v_alt from public.credit_konten
   where mandant_id = v_a and referenz = 'abr:alt';
  select credits - verbraucht into v_neu from public.credit_konten
   where mandant_id = v_a and referenz = 'abr:neu';

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Erst der Tarif-Topf', v_tarif = 0, 'Rest ' || v_tarif),
    ('Dann der ÄLTERE Paket-Topf', v_alt = 3, 'Rest ' || v_alt),
    ('Der jüngere bleibt unberührt', v_neu = 5, 'Rest ' || v_neu);

  select public.credits_saldo(v_a) into v_saldo;
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Reserviertes zählt sofort als verbraucht', v_saldo = 8, v_saldo::text);

  -- Freigeben gibt alles zurück.
  perform public.credits_freigeben(v_vorgang, 'KI-Aufruf gescheitert');
  select public.credits_saldo(v_a) into v_saldo;
  insert into befund (pruefung, bestanden, bemerkung)
    values ('Ein gescheiterter Aufruf gibt die Credits zurück', v_saldo = 20, v_saldo::text);
end
$$;

-- --- 2) Kein negativer Saldo, und nichts halb reserviert -------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_vor int; v_nach int; v_ok boolean := false;
begin
  insert into public.plattform_credit_preise (aktion, name, credits)
    values ('abr_test_zuviel', 'Zu teuer', 999) on conflict (aktion) do update set credits = 999;
  select public.credits_saldo(v_a) into v_vor;
  begin
    perform public.credits_reservieren('abr_test_zuviel', null, v_a, null);
  exception when others then
    v_ok := true;
  end;
  select public.credits_saldo(v_a) into v_nach;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Nicht genug Credits wird abgewiesen', v_ok, ''),
    ('Und es wird NICHTS halb genommen', v_vor = v_nach, v_vor || ' -> ' || v_nach);
end
$$;

-- --- 3) Kostenfreie Aktionen stehen trotzdem im Ledger ---------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_vorgang uuid; v_anzahl int; v_credits int;
begin
  v_vorgang := public.credits_reservieren('pdf_export', 'abr', v_a, null);
  select count(*), coalesce(sum(credits), 0) into v_anzahl, v_credits
    from public.credit_buchungen where vorgang_id = v_vorgang;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Eine kostenfreie Aktion steht im Ledger', v_anzahl = 1, v_anzahl::text),
    ('…mit null Credits und gleich gebucht', v_credits = 0, v_credits::text);
end
$$;

-- --- 4) Die Anbieterkosten werden anteilig verteilt ------------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_vorgang uuid; v_summe numeric; v_zeilen int;
begin
  v_vorgang := public.credits_reservieren('abr_test_12', 'kosten', v_a, null);
  perform public.credits_buchen(v_vorgang, 0.084000, 'Prüfung');
  select count(*), sum(ki_kosten_eur) into v_zeilen, v_summe
    from public.credit_buchungen where vorgang_id = v_vorgang;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ein Vorgang über zwei Töpfe ergibt zwei Zeilen', v_zeilen = 2, v_zeilen::text),
    ('Die Anbieterkosten summieren sich wieder auf', round(v_summe, 6) = 0.084000,
     coalesce(v_summe::text, 'null'));
end
$$;

-- --- 5) Das Ledger ist unveränderlich --------------------------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_id uuid; v_ok1 boolean := false; v_ok2 boolean := false; v_ok3 boolean := false;
begin
  select id into v_id from public.credit_buchungen
   where mandant_id = v_a and status = 'gebucht' limit 1;

  begin update public.credit_buchungen set credits = 1 where id = v_id;
  exception when others then v_ok1 := true; end;

  begin update public.credit_buchungen set status = 'reserviert' where id = v_id;
  exception when others then v_ok2 := true; end;

  begin delete from public.credit_buchungen where id = v_id;
  exception when others then v_ok3 := true; end;

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Eine gebuchte Zeile lässt sich nicht ändern', v_ok1, ''),
    ('…auch ihr Status nicht zurückdrehen', v_ok2, ''),
    ('…und löschen schon gar nicht', v_ok3, '');
end
$$;

-- --- 6) Mit dem Mandanten geht das Ledger doch ------------------------------
-- Ohne diese Ausnahme wäre „unveränderlich" zu „unlöschbar" geworden: die
-- Kaskade von `mandanten` scheiterte am Trigger, und ein Mandant liesse sich
-- nie entfernen.
do $$
declare
  v_weg uuid; v_chef uuid := gen_random_uuid(); v_rest int; v_ok boolean := true;
begin
  insert into public.mandanten (name, slug, abo_status) values ('Weg GmbH', 'abr-test-weg', 'aktiv')
    returning id into v_weg;
  insert into auth.users (id, email, email_confirmed_at) values (v_chef, 'weg@abr.example', now());
  insert into public.profiles (id, name, email, role, mandant_id) values (v_chef, 'Chef Weg', 'weg@abr.example', 'chef', v_weg);
  perform public.credits_gutschreiben(v_weg, 'test', 5, null, 'abr:weg');
  insert into public.plattform_credit_preise (aktion, name, credits)
    values ('abr_test_2', 'Klein', 2) on conflict (aktion) do update set credits = 2;
  perform public.credits_reservieren('abr_test_2', null, v_weg, null);

  begin
    delete from public.mandanten where id = v_weg;
  exception when others then v_ok := false;
  end;
  select count(*) into v_rest from public.credit_buchungen where mandant_id = v_weg;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ein Mandant lässt sich löschen', v_ok, ''),
    ('…und sein Ledger geht mit', v_rest = 0, v_rest::text);
end
$$;

-- --- 7) Mandantentrennung: A sieht nichts von B ----------------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_b uuid := (select wert from wer where was = 'b');
  v_chef_a uuid := (select wert from wer where was = 'chef_a');
  n_abo int; n_konten int; n_ledger int; n_eigene int;
begin
  perform public.credits_gutschreiben(v_b, 'tarif', 99, null, 'abr:b');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_chef_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n_abo    from public.mandant_abo      where mandant_id = v_b;
  select count(*) into n_konten from public.credit_konten    where mandant_id = v_b;
  select count(*) into n_ledger from public.credit_buchungen where mandant_id = v_b;
  select count(*) into n_eigene from public.credit_konten    where mandant_id = v_a;

  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Chef A sieht das Abo von B nicht',      n_abo = 0,    n_abo::text),
    ('Chef A sieht die Credits von B nicht',  n_konten = 0, n_konten::text),
    ('Chef A sieht das Ledger von B nicht',   n_ledger = 0, n_ledger::text),
    ('Seine eigenen sieht er sehr wohl',      n_eigene > 0, n_eigene::text);
end
$$;

-- --- 8) Niemand schreibt sich sein Abo selbst ------------------------------
-- Der Abo-Stand kommt vom Webhook. Für Angemeldete gibt es bewusst keine
-- Schreibrichtlinie — „Abo-Status niemals allein dem Frontend glauben".
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_chef_a uuid := (select wert from wer where was = 'chef_a');
  v_ok boolean := false; v_ok2 boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_chef_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.mandant_abo set tarif = 'business' where mandant_id = v_a;
    if not found then v_ok := true; end if;
  exception when others then v_ok := true;
  end;

  begin
    insert into public.credit_konten (mandant_id, quelle, credits)
      values (v_a, 'paket', 100000);
    v_ok2 := false;
  exception when others then v_ok2 := true;
  end;

  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ein Chef kann seinen Tarif nicht selbst hochsetzen', v_ok, ''),
    ('Und sich keine Credits selbst gutschreiben', v_ok2, '');
end
$$;

-- --- 9) Nutzerlimit ---------------------------------------------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_limit int; v_frei boolean; v_frei2 boolean;
  v_zwei uuid := gen_random_uuid();
begin
  select public.nutzer_limit(v_a) into v_limit;
  select public.nutzer_platz_frei(v_a) into v_frei;

  -- Starter: ein Nutzer inklusive, einer ist schon da.
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Starter hat ein Nutzerlimit von 1', v_limit = 1, v_limit::text),
    ('…und der Platz ist belegt', v_frei = false, coalesce(v_frei::text, 'null'));

  -- Zwei Zusatznutzer gebucht: Limit 3.
  update public.mandant_abo set zusatznutzer = 2 where mandant_id = v_a;
  select public.nutzer_limit(v_a) into v_limit;
  select public.nutzer_platz_frei(v_a) into v_frei2;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Zwei Zusatznutzer heben das Limit auf 3', v_limit = 3, v_limit::text),
    ('…und es ist wieder Platz', v_frei2, '');
end
$$;

-- --- 10) Zugriffsstufe ------------------------------------------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  s1 text; s2 text; s3 text; s4 text;
begin
  select public.abo_zugriff(v_a) into s1;

  update public.mandant_abo set status = 'gekuendigt',
         cancel_at = now() - interval '1 day',
         lesezugriff_bis = now() + interval '10 days' where mandant_id = v_a;
  select public.abo_zugriff(v_a) into s2;

  update public.mandant_abo set lesezugriff_bis = now() - interval '1 day' where mandant_id = v_a;
  select public.abo_zugriff(v_a) into s3;

  update public.mandanten set gesperrt_am = now() where id = v_a;
  select public.abo_zugriff(v_a) into s4;

  update public.mandanten set gesperrt_am = null where id = v_a;
  update public.mandant_abo set status = 'aktiv', cancel_at = null,
         lesezugriff_bis = null where mandant_id = v_a;

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Aktiv heißt voller Zugriff',                    s1 = 'voll',      s1),
    ('Nach dem Kündigungstermin bleibt das Lesen',    s2 = 'nur_lesen', s2),
    ('Danach ist zu',                                 s3 = 'gesperrt',  s3),
    ('Eine Sperre gilt sofort',                       s4 = 'gesperrt',  s4);
end
$$;

-- --- 11) Gründerplätze ------------------------------------------------------
do $$
declare
  v_a uuid := (select wert from wer where was = 'a');
  v_b uuid := (select wert from wer where was = 'b');
  v_vorher int; v_nr1 int; v_nr2 int; v_nachher int;
begin
  select public.gruender_plaetze_frei() into v_vorher;
  select public.gruender_platz_vergeben(v_a) into v_nr1;
  -- Zweimal für denselben Mandanten vergibt keinen zweiten Platz.
  select public.gruender_platz_vergeben(v_a) into v_nr2;
  select public.gruender_plaetze_frei() into v_nachher;

  insert into befund (pruefung, bestanden, bemerkung) values
    ('Ein Gründerplatz wird vergeben', v_nr1 is not null, coalesce(v_nr1::text, 'null')),
    ('Ein zweiter Aufruf vergibt keinen zweiten', v_nr1 = v_nr2,
     coalesce(v_nr1::text, '-') || '/' || coalesce(v_nr2::text, '-')),
    ('Der Zähler zählt genau einen herunter', v_nachher = v_vorher - 1,
     v_vorher || ' -> ' || v_nachher);
end
$$;

-- --- Ergebnis ---------------------------------------------------------------
select nr, case when bestanden then 'ok' else 'FEHLER' end as stand, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then
    raise exception 'Abrechnung: % Pruefung(en) gescheitert.', n;
  end if;
  raise notice 'Abrechnung: alle % Pruefungen bestanden.', (select count(*) from befund);
end
$$;

-- Aufräumen: die Prüfaktionen gehören nicht in den Katalog.
delete from public.plattform_credit_preise where aktion like 'abr_test_%';
delete from public.mandanten where slug like 'abr-test%';
delete from auth.users where email like '%@abr.example';
