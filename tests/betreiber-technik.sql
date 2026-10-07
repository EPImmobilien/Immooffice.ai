-- Betreiber, Schritt 7 (fork_75): Statusseite und Speicher nur fuer
-- Betreiber; einen Job sofort ausfuehren nur owner/admin; ein chef liest
-- weder Funktionsfehler noch Messwerte.
\set ON_ERROR_STOP on
set client_min_messages to warning;
create temp table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temp table wer (was text, wert uuid);

do $$
declare m uuid; ua uuid := gen_random_uuid(); us uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('TE Haus', 'te-x') returning id into m;
  insert into auth.users (id, email) values (ua, 'a@te.example'), (us, 's@te.example'), (uc, 'c@te.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'Admin', 'a@te.example', 'mitarbeiter', m), (us, 'Support', 's@te.example', 'mitarbeiter', m), (uc, 'Chef', 'c@te.example', 'chef', m);
  insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz) values (ua, 'admin', true, 'P'), (us, 'support', true, 'P');
  insert into public.system_fehler (funktion, meldung, betrifft_mandant_id) values ('probe-funktion', 'Probefehler', m);
  insert into public.dienst_aufrufe (dienst, funktion, dauer_ms, ok, status) values ('stripe', 'probe', 120, true, '200'), ('stripe', 'probe', 900, false, '500');
  insert into wer values ('m', m), ('ua', ua), ('us', us), ('uc', uc);
end $$;

do $$
declare v uuid := (select wert from wer where was='ua'); t jsonb; s jsonb; d jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select public.plattform_technik() into t;
  select public.plattform_speicher() into s;
  reset role;
  select x into d from jsonb_array_elements(t->'dienste') x where x->>'dienst' = 'stripe';
  insert into befund (pruefung, bestanden, bemerkung) values
    ('admin: Statusseite mit sechs Diensten', jsonb_array_length(t->'status') = 6, jsonb_array_length(t->'status')::text),
    ('Funktionsfehler erscheint', exists (select 1 from jsonb_array_elements(t->'fehler') x where x->>'funktion' = 'probe-funktion'), ''),
    ('Dienst stripe: 2 Aufrufe, Fehlerquote 50 %', (d->>'aufrufe')::int = 2 and (d->>'fehlerquote')::numeric = 50, coalesce(d::text, 'null')),
    ('Speicher: Datenbankgroesse > 0', (s->>'datenbank_bytes')::bigint > 0, s->>'datenbank_bytes');
end $$;

do $$
declare v uuid := (select wert from wer where was='us'); ok1 boolean := false; ok2 boolean := false; t jsonb; x text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  begin select public.plattform_technik() into t; exception when others then ok1 := sqlstate = '42501'; end;
  begin select public.cron_job_jetzt('plattform-kennzahlen-naechtlich') into x; exception when others then ok2 := sqlstate = '42501'; end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('support: Statusseite verweigert', ok1, ''),
    ('support: Job sofort ausfuehren verweigert', ok2, '');
end $$;

do $$
declare v uuid := (select wert from wer where was='uc'); n int; m int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select count(*) into n from public.system_fehler;
  select count(*) into m from public.dienst_aufrufe;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('chef liest keine Funktionsfehler', n = 0, n::text), ('chef liest keine Messwerte', m = 0, m::text);
end $$;

-- Als admin: ein Job sofort — das Kommando des Kennzahlen-Jobs ist harmlos (idempotent).
do $$
declare v uuid := (select wert from wer where was='ua'); x text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select public.cron_job_jetzt('plattform-kennzahlen-naechtlich') into x;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values ('admin fuehrt einen Job sofort aus', x like '%plattform_kennzahlen_schreiben%', left(x, 60));
end $$;

delete from public.system_fehler where funktion = 'probe-funktion';
delete from public.dienst_aufrufe where funktion = 'probe';
delete from public.plattform_admins where benutzer_id in (select wert from wer where was in ('ua','us'));
delete from public.mandanten where slug = 'te-x';
delete from public.profiles where id in (select wert from wer where was in ('ua','us','uc'));
delete from auth.users where id in (select wert from wer where was in ('ua','us','uc'));

select nr, case when bestanden then 'ok' else 'FEHLER' end as ergebnis, pruefung, bemerkung from befund order by nr;
do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then raise exception 'Betreiber-Technik: % Pruefung(en) nicht bestanden.', n; end if;
  raise notice 'Betreiber-Technik: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
