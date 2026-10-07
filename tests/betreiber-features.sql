-- Betreiber, Schritt 5 (fork_73): Funktionsschalter in der richtigen
-- Reihenfolge — Ausnahme des Hauses, Tarif, Standard; befristete Ausnahme
-- laeuft ab; ein Haus liest fremde Ausnahmen nicht; Gutscheine nur fuer
-- owner/admin/finanzen.
\set ON_ERROR_STOP on
set client_min_messages to warning;
create temp table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temp table wer (was text, wert uuid);

do $$
declare a uuid; b uuid; ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); us uuid := gen_random_uuid();
begin
  insert into public.plattform_tarife (schluessel, name, preis_monat_cent, preis_jahr_cent, ist_zusatznutzer)
    values ('ff_starter', 'FF Starter', 1000, 10000, false), ('ff_pro', 'FF Pro', 2000, 20000, false)
    on conflict (schluessel) do nothing;
  insert into public.plattform_features (schluessel, name, standard_an) values
    ('ff_standard_an', 'Standard an', true), ('ff_standard_aus', 'Standard aus', false)
    on conflict (schluessel) do nothing;
  insert into public.tarif_features (tarif, feature) values ('ff_pro', 'ff_standard_aus') on conflict do nothing;
  insert into public.mandanten (name, slug) values ('FF Haus A', 'ff-a') returning id into a;
  insert into public.mandanten (name, slug) values ('FF Haus B', 'ff-b') returning id into b;
  insert into public.mandant_abo (mandant_id, tarif, intervall, status) values (a, 'ff_starter', 'monat', 'aktiv'), (b, 'ff_pro', 'monat', 'aktiv');
  insert into auth.users (id, email) values (ua, 'a@ff.example'), (ub, 'b@ff.example'), (us, 's@ff.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'A', 'a@ff.example', 'chef', a), (ub, 'B', 'b@ff.example', 'chef', b), (us, 'S', 's@ff.example', 'mitarbeiter', a);
  insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz) values (us, 'support', true, 'Pruefung');
  -- Ausnahme fuer A: ff_standard_an AUS, befristet bis gestern (= abgelaufen) ; ff_standard_aus AN unbefristet
  insert into public.mandant_features (mandant_id, feature, an, bis) values
    (a, 'ff_standard_an', false, now() - interval '1 day'),
    (a, 'ff_standard_aus', true, null);
  insert into wer values ('a', a), ('b', b), ('ua', ua), ('ub', ub), ('us', us);
end $$;

-- Als Chef von A
do $$
declare v uuid := (select wert from wer where was='ua'); r1 boolean; r2 boolean; r3 boolean; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select public.hat_feature('ff_standard_an') into r1;     -- Ausnahme abgelaufen -> Standard an
  select public.hat_feature('ff_standard_aus') into r2;    -- Ausnahme an -> an (Starter haette es nicht)
  select public.hat_feature('gibt_es_nicht') into r3;
  select count(*) into n from public.mandant_features;     -- nur die eigenen
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('abgelaufene Ausnahme zaehlt nicht mehr -> Standard an', r1 = true, r1::text),
    ('Ausnahme des Hauses schaltet an, was Standard und Tarif aus haben', r2 = true, r2::text),
    ('unbekannter Schluessel ist aus', r3 = false, r3::text),
    ('Haus A sieht nur eigene Ausnahmen (2)', n = 2, n::text);
end $$;

-- Als Chef von B (Pro): Tarif schaltet an
do $$
declare v uuid := (select wert from wer where was='ub'); r boolean; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select public.hat_feature('ff_standard_aus') into r;
  select count(*) into n from public.mandant_features;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Tarif Pro schaltet an, was Standard aus hat', r = true, r::text),
    ('Haus B sieht keine Ausnahmen von A', n = 0, n::text);
end $$;

-- meine_features liefert eine Zeile je Schalter
do $$
declare v uuid := (select wert from wer where was='ua'); n int; m int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select count(*) into n from public.meine_features();
  select count(*) into m from public.plattform_features;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values ('meine_features: eine Zeile je Schalter', n = m, n::text || ' von ' || m::text);
end $$;

-- support legt keine Gutscheine an
do $$
declare v uuid := (select wert from wer where was='us'); ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  begin
    insert into public.gutscheine (code, art, wert) values ('FFPROBE', 'prozent', 10);
  exception when others then ok := sqlstate = '42501';
  end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values ('support legt keinen Gutschein an', ok, '');
end $$;

-- Aufraeumen
delete from public.plattform_admins where benutzer_id = (select wert from wer where was='us');
delete from public.mandanten where slug like 'ff-%';
delete from public.profiles where id in (select wert from wer where was in ('ua','ub','us'));
delete from auth.users where id in (select wert from wer where was in ('ua','ub','us'));
delete from public.plattform_features where schluessel like 'ff_%';
delete from public.plattform_tarife where schluessel like 'ff_%';

select nr, case when bestanden then 'ok' else 'FEHLER' end as ergebnis, pruefung, bemerkung from befund order by nr;
do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then raise exception 'Betreiber-Features: % Pruefung(en) nicht bestanden.', n; end if;
  raise notice 'Betreiber-Features: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
