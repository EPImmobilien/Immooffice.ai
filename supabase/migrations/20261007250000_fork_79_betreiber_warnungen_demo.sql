-- ===========================================================================
-- fork_79 — Betreiberbereich, Schritt 10: Warnregeln, Tageszusammenfassung,
--           Demo-Daten
-- ===========================================================================
-- Auftrag Betreiber-Dashboard, Abschnitte 18 und 21.
--
--   1. Warnregeln (`plattform_warnregeln`) mit Kanal und Schwelle; die
--      Pruefung `plattform_warnungen_pruefen()` laeuft stuendlich (pg_cron ->
--      Edge Function plattform-warnungen), schreibt jede neue Warnung EINMAL
--      (`plattform_warnungen`, eindeutiger Schluessel) und die Funktion
--      schickt sie an die Betreiber-Adresse (`plattform_werte.betreiber_email`).
--   2. Tageszusammenfassung `plattform_tageszusammenfassung()` — 7:30 Uhr
--      Europe/Berlin. pg_cron kennt keine Zeitzone; zwei Jobs (05:30 und
--      06:30 UTC) rufen die Funktion, und die schickt nur, wenn es in Berlin
--      gerade 7 Uhr ist — und nur einmal am Tag (Schluessel).
--   3. Demo-Daten: 30 fiktive Mandanten mit `ist_demo = true`, gemischte
--      Tarife, Tests, Kuendigungen, fehlgeschlagene Zahlungen, Verbrauch und
--      KI-Kosten ueber 12 Monate, Rechnungen, Kennzahlen-Verlauf. Per Knopf
--      vollstaendig entfernbar: das Ledger laesst die Kaskade zu, weil der
--      Mandant selbst verschwindet (fork_47).
--
-- RUECKNAHME: drop function plattform_demo_entfernen, plattform_demo_anlegen,
-- plattform_tageszusammenfassung, plattform_warnungen_pruefen; drop table
-- plattform_warnungen, plattform_warnregeln; alter table mandanten drop column
-- ist_demo; alter table plattform_kennzahlen_tag drop column ist_demo;
-- cron.unschedule der drei Jobs; delete from plattform_werte where schluessel
-- in ('betreiber_email', 'zusammenfassung_aktiv').
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Warnregeln und Warnungen
-- ---------------------------------------------------------------------------
create table if not exists public.plattform_warnregeln (
  schluessel   text primary key,
  name         text not null,
  beschreibung text,
  aktiv        boolean not null default true,
  kanal        text[] not null default '{email}',
  schwelle     numeric(12,2),
  geaendert_am timestamptz not null default now()
);
comment on table public.plattform_warnregeln is
  'Warnregeln des Betreibers: Kanal (email; push gibt es nicht) und Schwelle. Ausgewertet von plattform_warnungen_pruefen().';
alter table public.plattform_warnregeln enable row level security;
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_warnregeln', 'GLOBAL', 'Warnregeln des Betreibers')
on conflict (tabelle) do nothing;
insert into public.plattform_warnregeln (schluessel, name, beschreibung, schwelle) values
  ('zahlung_fehlgeschlagen', 'Zahlung fehlgeschlagen', 'Ein Abo traegt zahlung_fehler_seit.', null),
  ('mandant_kostengrenze', 'Mandant ueber KI-Kostengrenze', 'KI-Kosten eines Hauses ueber alarm_kosten_mandant_tag_eur (Tag) oder alarm_kosten_mandant_monat_eur (Monat).', null),
  ('tageskosten_gesamt', 'Tages-KI-Kosten gesamt ueber Grenze', 'Summe aller KI-Kosten ueber alarm_kosten_tag_eur (Tag) oder alarm_kosten_monat_eur (Monat).', null),
  ('job_webhook_fehler', 'Job-/Webhook-Fehler > N in 1 h', 'Gescheiterte Cron-Laeufe plus Stripe-Webhooks mit Fehler in der letzten Stunde.', 3),
  ('dienst_gestoert', 'Externer Dienst gestoert', 'Fehlerquote eines Dienstes (dienst_aufrufe) in der letzten Stunde ueber X %, ab 5 Aufrufen.', 20),
  ('support_hoch', 'Neue Support-Anfrage mit Prioritaet hoch', 'Offene Anfrage mit prioritaet = hoch.', null),
  ('neuer_zahlender', 'Neuer zahlender Mandant (Info)', 'Ein Abo ist in den letzten 24 h aktiv geworden.', null),
  ('kuendigung', 'Kuendigung (Info)', 'Ein Abo traegt gekuendigt_am.', null),
  ('tageszusammenfassung', 'Tageszusammenfassung (Protokoll)', 'Vermerk je Tag, dass die Zusammenfassung um 7:30 Uhr hinausging — kein Alarm.', null)
on conflict (schluessel) do nothing;

create table if not exists public.plattform_warnungen (
  id          uuid primary key default gen_random_uuid(),
  regel       text not null references public.plattform_warnregeln(schluessel) on delete cascade,
  zeit        timestamptz not null default now(),
  mandant_id  uuid references public.mandanten(id) on delete cascade,
  text        text not null,
  eindeutig   text not null unique,
  gesendet_am timestamptz,
  gelesen_am  timestamptz
);
comment on table public.plattform_warnungen is
  'Ausgeloeste Warnungen, je Ereignis einmal (eindeutig). gesendet_am setzt die Edge Function nach dem Versand.';
create index if not exists plattform_warnungen_zeit_idx on public.plattform_warnungen (zeit desc);
alter table public.plattform_warnungen enable row level security;
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_warnungen', 'GRENZE', 'Warnungen des Betreibers; traegt eine mandant_id als Bezug, gehoert aber dem Betreiber')
on conflict (tabelle) do nothing;

insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('betreiber_email', '""'::jsonb, 'Adresse, an die Warnungen und die Tageszusammenfassung gehen. Leer = kein Versand.'),
  ('zusammenfassung_aktiv', 'true'::jsonb, 'Taegliche Zusammenfassung um 7:30 Uhr (Europe/Berlin) senden?')
on conflict (schluessel) do nothing;

-- Demo-Kennzeichnung
alter table public.mandanten add column if not exists ist_demo boolean not null default false;
alter table public.plattform_kennzahlen_tag add column if not exists ist_demo boolean not null default false;
comment on column public.mandanten.ist_demo is 'Fiktiver Demo-Mandant aus plattform_demo_anlegen(); per Knopf entfernbar.';

-- Die Pruefung: schreibt neue Warnungen und gibt sie zurueck.
create or replace function public.plattform_warnungen_pruefen()
 returns setof public.plattform_warnungen
 language plpgsql
 security definer
 set search_path to 'public', 'cron'
as $function$
declare r record; w jsonb := '{}'::jsonb; z record; tag_start timestamptz; monat_start timestamptz;
        s_tag numeric; s_monat numeric; sm_tag numeric; sm_monat numeric; n int; regel record;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner', 'admin') then
    raise exception 'Nur owner oder admin.' using errcode = '42501';
  end if;
  select jsonb_object_agg(schluessel, wert) into w from public.plattform_werte
   where schluessel like 'alarm_%';
  tag_start := (date_trunc('day', now() at time zone 'Europe/Berlin')) at time zone 'Europe/Berlin';
  monat_start := (date_trunc('month', now() at time zone 'Europe/Berlin')) at time zone 'Europe/Berlin';
  -- Mehrere Aufrufe in einer Transaktion (Tests) duerfen die Hilfstabelle teilen.
  create temporary table if not exists neu_warn (regel text, mandant_id uuid, text text, eindeutig text) on commit drop;
  truncate neu_warn;

  -- zahlung_fehlgeschlagen
  if exists (select 1 from public.plattform_warnregeln where schluessel = 'zahlung_fehlgeschlagen' and aktiv) then
    insert into neu_warn
    select 'zahlung_fehlgeschlagen', a.mandant_id, m.name || ': Zahlung fehlgeschlagen seit ' || to_char(a.zahlung_fehler_seit, 'DD.MM.YYYY'),
           'zahlung:' || a.mandant_id || ':' || to_char(a.zahlung_fehler_seit, 'YYYY-MM-DD')
      from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id
     where a.zahlung_fehler_seit is not null and not m.ist_demo;
  end if;
  -- mandant_kostengrenze
  if exists (select 1 from public.plattform_warnregeln where schluessel = 'mandant_kostengrenze' and aktiv) then
    sm_tag := coalesce((w->>'alarm_kosten_mandant_tag_eur')::numeric, 0);
    sm_monat := coalesce((w->>'alarm_kosten_mandant_monat_eur')::numeric, 0);
    insert into neu_warn
    select 'mandant_kostengrenze', x.mandant_id, m.name || ': KI-Kosten heute ' || round(x.k, 2) || ' EUR (Grenze ' || sm_tag || ')',
           'mkosten_tag:' || x.mandant_id || ':' || to_char(tag_start, 'YYYY-MM-DD')
      from (select b.mandant_id, sum(b.ki_kosten_eur) k from public.credit_buchungen b where b.zeitpunkt >= tag_start group by 1) x
      join public.mandanten m on m.id = x.mandant_id
     where sm_tag > 0 and x.k > sm_tag and not m.ist_demo;
    insert into neu_warn
    select 'mandant_kostengrenze', x.mandant_id, m.name || ': KI-Kosten im Monat ' || round(x.k, 2) || ' EUR (Grenze ' || sm_monat || ')',
           'mkosten_monat:' || x.mandant_id || ':' || to_char(monat_start, 'YYYY-MM')
      from (select b.mandant_id, sum(b.ki_kosten_eur) k from public.credit_buchungen b where b.zeitpunkt >= monat_start group by 1) x
      join public.mandanten m on m.id = x.mandant_id
     where sm_monat > 0 and x.k > sm_monat and not m.ist_demo;
  end if;
  -- tageskosten_gesamt
  if exists (select 1 from public.plattform_warnregeln where schluessel = 'tageskosten_gesamt' and aktiv) then
    s_tag := coalesce((w->>'alarm_kosten_tag_eur')::numeric, 0);
    s_monat := coalesce((w->>'alarm_kosten_monat_eur')::numeric, 0);
    select coalesce(sum(b.ki_kosten_eur), 0) into sm_tag from public.credit_buchungen b
      join public.mandanten m on m.id = b.mandant_id where b.zeitpunkt >= tag_start and not m.ist_demo;
    select coalesce(sum(b.ki_kosten_eur), 0) into sm_monat from public.credit_buchungen b
      join public.mandanten m on m.id = b.mandant_id where b.zeitpunkt >= monat_start and not m.ist_demo;
    if s_tag > 0 and sm_tag > s_tag then
      insert into neu_warn values ('tageskosten_gesamt', null, 'KI-Kosten heute gesamt ' || round(sm_tag, 2) || ' EUR (Grenze ' || s_tag || ')', 'kosten_tag:' || to_char(tag_start, 'YYYY-MM-DD'));
    end if;
    if s_monat > 0 and sm_monat > s_monat then
      insert into neu_warn values ('tageskosten_gesamt', null, 'KI-Kosten im Monat gesamt ' || round(sm_monat, 2) || ' EUR (Grenze ' || s_monat || ')', 'kosten_monat:' || to_char(monat_start, 'YYYY-MM'));
    end if;
  end if;
  -- job_webhook_fehler
  select * into regel from public.plattform_warnregeln where schluessel = 'job_webhook_fehler';
  if regel.aktiv then
    select (select count(*) from cron.job_run_details d where d.status = 'failed' and d.start_time > now() - interval '1 hour')
         + (select count(*) from public.stripe_ereignisse e where e.fehler is not null and e.empfangen_am > now() - interval '1 hour')
      into n;
    if n > coalesce(regel.schwelle, 3) then
      insert into neu_warn values ('job_webhook_fehler', null, n || ' Job-/Webhook-Fehler in der letzten Stunde', 'jobs:' || to_char(date_trunc('hour', now()), 'YYYY-MM-DD-HH24'));
    end if;
  end if;
  -- dienst_gestoert
  select * into regel from public.plattform_warnregeln where schluessel = 'dienst_gestoert';
  if regel.aktiv then
    insert into neu_warn
    select 'dienst_gestoert', null, x.dienst || ': Fehlerquote ' || x.q || ' % in der letzten Stunde (' || x.n || ' Aufrufe)',
           'dienst:' || x.dienst || ':' || to_char(date_trunc('hour', now()), 'YYYY-MM-DD-HH24')
      from (select dienst, count(*) n, round(100.0 * count(*) filter (where not ok) / count(*), 1) q
              from public.dienst_aufrufe where zeit > now() - interval '1 hour' group by dienst) x
     where x.n >= 5 and x.q > coalesce(regel.schwelle, 20);
  end if;
  -- support_hoch
  if exists (select 1 from public.plattform_warnregeln where schluessel = 'support_hoch' and aktiv) then
    insert into neu_warn
    select 'support_hoch', a.mandant_id, coalesce(m.name, '?') || ': Support-Anfrage mit Prioritaet hoch — ' || left(a.betreff, 80),
           'support:' || a.id
      from public.support_anfragen a left join public.mandanten m on m.id = a.mandant_id
     where a.prioritaet = 'hoch' and a.status in ('offen', 'in_arbeit');
  end if;
  -- neuer_zahlender
  if exists (select 1 from public.plattform_warnregeln where schluessel = 'neuer_zahlender' and aktiv) then
    insert into neu_warn
    select 'neuer_zahlender', a.mandant_id, m.name || ': neues Abo ' || coalesce(a.tarif, '?') || ' (' || coalesce(a.intervall, '?') || ')',
           'neu:' || a.mandant_id
      from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id
     where a.status = 'aktiv' and a.geaendert_am > now() - interval '24 hours' and not m.ist_demo;
  end if;
  -- kuendigung
  if exists (select 1 from public.plattform_warnregeln where schluessel = 'kuendigung' and aktiv) then
    insert into neu_warn
    select 'kuendigung', a.mandant_id, m.name || ': Kuendigung vom ' || to_char(a.gekuendigt_am, 'DD.MM.YYYY') || coalesce(', wirksam ' || to_char(a.cancel_at, 'DD.MM.YYYY'), ''),
           'kuend:' || a.mandant_id || ':' || to_char(a.gekuendigt_am, 'YYYY-MM-DD')
      from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id
     where a.gekuendigt_am is not null and not m.ist_demo;
  end if;

  return query
  insert into public.plattform_warnungen (regel, mandant_id, text, eindeutig)
  select n.regel, n.mandant_id, n.text, n.eindeutig from neu_warn n
  on conflict (eindeutig) do nothing
  returning *;
end
$function$;
revoke all on function public.plattform_warnungen_pruefen() from public, anon;
grant execute on function public.plattform_warnungen_pruefen() to authenticated;

-- Die Tageszusammenfassung: Zahlen von gestern und offene Probleme.
create or replace function public.plattform_tageszusammenfassung()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'cron'
as $function$
declare r jsonb; gestern_start timestamptz; heute_start timestamptz;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner', 'admin', 'finanzen') then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  heute_start := (date_trunc('day', now() at time zone 'Europe/Berlin')) at time zone 'Europe/Berlin';
  gestern_start := heute_start - interval '1 day';
  select jsonb_build_object(
    'datum', to_char(now() at time zone 'Europe/Berlin', 'DD.MM.YYYY'),
    'mrr_cent', (select coalesce(sum(x.mrr_cent), 0) from public.plattform_mrr_je_mandant() x join public.mandanten m on m.id = x.mandant_id where not m.ist_demo),
    'zahlende', (select count(*) from public.plattform_mrr_je_mandant() x join public.mandanten m on m.id = x.mandant_id where x.zahlend and not m.ist_demo),
    'neu_gestern', (select count(*) from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id
                     where a.status = 'aktiv' and a.geaendert_am >= gestern_start and a.geaendert_am < heute_start and not m.ist_demo),
    'kuendigungen_gestern', (select count(*) from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id
                              where a.gekuendigt_am >= gestern_start and a.gekuendigt_am < heute_start and not m.ist_demo),
    'tests_endend_3t', (select count(*) from public.mandanten m where m.abo_status = 'test' and m.testphase_bis < now() + interval '3 days' and not m.ist_demo),
    'neue_tests_gestern', (select count(*) from public.mandanten m where m.erstellt_am >= gestern_start and m.erstellt_am < heute_start and not m.ist_demo),
    'ki_kosten_gestern_eur', (select round(coalesce(sum(b.ki_kosten_eur), 0), 2) from public.credit_buchungen b join public.mandanten m on m.id = b.mandant_id
                               where b.zeitpunkt >= gestern_start and b.zeitpunkt < heute_start and not m.ist_demo),
    'credits_gestern', (select coalesce(sum(b.credits), 0) from public.credit_buchungen b join public.mandanten m on m.id = b.mandant_id
                         where b.status = 'gebucht' and b.zeitpunkt >= gestern_start and b.zeitpunkt < heute_start and not m.ist_demo),
    'probleme', jsonb_build_object(
      'zahlung_offen', (select count(*) from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id where a.zahlung_fehler_seit is not null and not m.ist_demo),
      'cron_fehler_24h', (select count(*) from cron.job_run_details d where d.status = 'failed' and d.start_time > now() - interval '24 hours'),
      'webhook_fehler_24h', (select count(*) from public.stripe_ereignisse e where e.fehler is not null and e.empfangen_am > now() - interval '24 hours'),
      'support_offen', (select count(*) from public.support_anfragen where status in ('offen', 'in_arbeit')),
      'support_ohne_antwort_24h', (select count(*) from public.support_anfragen where status in ('offen', 'in_arbeit') and erste_antwort_am is null and erstellt_am < now() - interval '24 hours'),
      'zugriffe_offen', (select count(*) from public.support_sitzungen where freigegeben_am is null and abgelehnt_am is null and beendet_am is null and begonnen_am > now() - interval '7 days'),
      'reservierungen_haengend', (select count(*) from public.credit_buchungen where status = 'reserviert' and zeitpunkt < now() - interval '1 hour'),
      'warnungen_24h', (select count(*) from public.plattform_warnungen where zeit > now() - interval '24 hours'),
      'funktionsfehler_24h', (select count(*) from public.system_fehler where zeit > now() - interval '24 hours' and erledigt_am is null))
  ) into r;
  return r;
end
$function$;
revoke all on function public.plattform_tageszusammenfassung() from public, anon;
grant execute on function public.plattform_tageszusammenfassung() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Demo-Daten
-- ---------------------------------------------------------------------------
create or replace function public.plattform_demo_anlegen()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  namen text[] := array['Küstenmakler Demo GmbH', 'Alpenblick Immobilien Demo', 'Rheinufer Makler Demo GmbH', 'Hansestadt Wohnen Demo',
    'Südlicht Immobilien Demo', 'Weinberg Makler Demo', 'Nordseeküste Immobilien Demo', 'Stadtkern Makler Demo GmbH',
    'Seeblick Wohnen Demo', 'Altstadt Immobilien Demo', 'Elbufer Makler Demo', 'Bergdorf Immobilien Demo',
    'Neue Mitte Makler Demo GmbH', 'Parkallee Immobilien Demo', 'Schlossberg Makler Demo', 'Flusstal Wohnen Demo',
    'Hafenkante Immobilien Demo', 'Marktplatz Makler Demo GmbH', 'Heideland Immobilien Demo', 'Donauufer Makler Demo',
    'Westend Wohnen Demo', 'Ostseebad Immobilien Demo', 'Lindenhof Makler Demo GmbH', 'Talblick Immobilien Demo',
    'Gartenstadt Makler Demo', 'Hochufer Immobilien Demo', 'Wiesengrund Makler Demo', 'Sonnenhang Wohnen Demo GmbH',
    'Rosenweg Immobilien Demo', 'Kirchplatz Makler Demo'];
  tarife text[] := array['starter', 'professional', 'business'];
  aktionen text[] := array['ki_text', 'expose_text', 'bild_optimieren', 'bild_homestaging', 'expose_pruefer', 'social_paket'];
  i int; k int; m_id uuid; u_id uuid; t text; iv text; st text; start_mon int; preis int; monat date; d date;
  heute date := (now() at time zone 'Europe/Berlin')::date; n int := 0; mrr_mon bigint; zahlend_mon int; cr int;
  kosten_je_credit numeric := 0.012;
  hat_lastlogin boolean; akt text; cr_k int;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') <> 'owner' then
    raise exception 'Nur owner.' using errcode = '42501';
  end if;
  if exists (select 1 from public.mandanten where ist_demo) then
    raise exception 'Demo-Daten sind schon angelegt — erst entfernen.' using errcode = '22023';
  end if;
  select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'last_sign_in_at') into hat_lastlogin;

  for i in 1..30 loop
    t := tarife[1 + (i % 3)];
    iv := case when i % 4 = 0 then 'jahr' else 'monat' end;
    -- Stand: 18 aktiv, 5 Test, 3 gekuendigt (vorgemerkt), 3 Zahlung offen, 1 gesperrt
    st := case when i <= 18 then 'aktiv' when i <= 23 then 'test' when i <= 26 then 'gekuendigt' when i <= 29 then 'zahlung_offen' else 'gesperrt' end;
    start_mon := 1 + (i * 7) % 12;   -- Monate zurueck, 1..12
    select case iv when 'jahr' then coalesce(preis_jahr_cent, 0) / 12 else coalesce(preis_monat_cent, 0) end into preis from public.plattform_tarife where schluessel = t;
    preis := coalesce(preis, 0);

    insert into public.mandanten (name, slug, abo_status, testphase_bis, gesperrt_am, gesperrt_grund, erstellt_am, ist_demo)
    values (namen[i], 'demo-' || lpad(i::text, 2, '0'), case st when 'test' then 'test' when 'gesperrt' then 'gesperrt' when 'gekuendigt' then 'gekuendigt' else 'aktiv' end,
            case when st = 'test' then now() + make_interval(days => (i % 5) * 4 - 2) else null end,
            case when st = 'gesperrt' then now() - interval '3 days' else null end,
            case when st = 'gesperrt' then 'Demo: Zahlungsausfall' else null end,
            case when st = 'test' then now() - make_interval(days => 10 + i) else now() - make_interval(months => start_mon, days => i) end, true)
    returning id into m_id;

    -- Chef mit Login-Spur (nur wo das Auth-Schema es kennt)
    u_id := gen_random_uuid();
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (u_id, 'chef@demo-' || lpad(i::text, 2, '0') || '.example', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now() - make_interval(months => start_mon), now());
    if hat_lastlogin then
      execute 'update auth.users set last_sign_in_at = $1 where id = $2' using now() - make_interval(days => (i * 3) % 40), u_id;
    end if;
    -- Das echte Auth-Schema traegt Token-Spalten ohne Vorgabewert; NULL dort
    -- laesst GoTrue beim Nachschlagen stolpern (gelernt am 07.10.2026). Leer
    -- statt NULL, aber nur, wo es die Spalte gibt — der Nachbau hat sie nicht.
    for akt in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'
                 and column_name in ('confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
                                     'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token') loop
      execute format('update auth.users set %I = '''' where id = $1 and %I is null', akt, akt) using u_id;
    end loop;
    for akt in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name in ('aud', 'role') loop
      execute format('update auth.users set %I = ''authenticated'' where id = $1 and %I is null', akt, akt) using u_id;
    end loop;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then
      execute 'update auth.users set instance_id = ''00000000-0000-0000-0000-000000000000'' where id = $1 and instance_id is null' using u_id;
    end if;
    insert into public.profiles (id, name, email, role, mandant_id) values (u_id, 'Demo-Chef ' || i, 'chef@demo-' || lpad(i::text, 2, '0') || '.example', 'chef', m_id);

    insert into public.mandant_abo (mandant_id, tarif, intervall, status, zusatznutzer, gruenderpreis, gruender_nummer, periode_von, periode_bis, mindestlaufzeit_bis,
                                    gekuendigt_am, cancel_at, zahlung_fehler_seit, erstellt_am, geaendert_am)
    values (m_id, case when st = 'test' then null else t end, iv, case st when 'gesperrt' then 'inaktiv' else st end, case when i % 5 = 0 then 2 else 0 end, i % 6 = 0, case when i % 6 = 0 then i / 6 else null end,
            date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
            case when st <> 'test' then now() + make_interval(months => 6 - (i % 7)) else null end,
            case when st = 'gekuendigt' then now() - make_interval(days => i) else null end,
            case when st = 'gekuendigt' then now() + make_interval(days => 30 + i) else null end,
            case when st = 'zahlung_offen' then now() - make_interval(days => 2 + (i % 9)) else null end,
            now() - make_interval(months => start_mon), now() - make_interval(months => start_mon));

    -- Verbrauch ueber die Monate: je Monat ein Tarif-Topf, Buchungen mit KI-Kosten
    for k in reverse start_mon..0 loop
      exit when st = 'test' and k > 0;
      monat := (date_trunc('month', now() - make_interval(months => k)))::date;
      insert into public.credit_konten (mandant_id, quelle, credits, verbraucht, gueltig_von, gueltig_bis, erstellt_am)
      values (m_id, case when st = 'test' then 'test' else 'tarif' end,
              case when st = 'test' then 50 else (select coalesce(credits_monat, 500) from public.plattform_tarife where schluessel = t) end,
              0, monat, monat + interval '1 month', monat);
      cr := 0;
      for d in select generate_series(monat, least(monat + interval '1 month' - interval '1 day', heute), interval '1 day')::date loop
        if (extract(doy from d)::int + i) % 3 = 0 then
          akt := aktionen[1 + (extract(day from d)::int + i) % 6];
          -- Preis aus dem Katalog; fehlt die Aktion dort, zaehlen 2 Credits.
          cr_k := coalesce((select credits from public.plattform_credit_preise where aktion = akt), 2);
          insert into public.credit_buchungen (vorgang_id, mandant_id, aktion, credits, quelle, status, zeitpunkt, abgeschlossen_am, ki_kosten_eur, anbieter, modell)
          values (gen_random_uuid(), m_id, akt, cr_k, case when st = 'test' then 'test' else 'tarif' end, 'gebucht', d + time '10:30', d + time '10:31',
                  round(cr_k * kosten_je_credit * (0.8 + (i % 5) * 0.1), 4), 'anthropic', 'claude-sonnet-4-6');
          cr := cr + cr_k;
        end if;
      end loop;
      update public.credit_konten set verbraucht = least(cr, credits) where mandant_id = m_id and gueltig_von = monat;
      -- Rechnung je Monat (nur zahlende)
      if st <> 'test' and preis > 0 and (iv = 'monat' or k = start_mon or k = 0) then
        insert into public.stripe_rechnungen (id, mandant_id, art, nummer, status, waehrung, netto_cent, steuer_cent, brutto_cent, bezahlt_cent, offen_cent,
                                              reverse_charge, erstellt_am, bezahlt_am, gebuehr_cent)
        values ('in_demo_' || lpad(i::text, 2, '0') || '_' || to_char(monat, 'YYYYMM'), m_id, 'abo', 'DEMO-' || to_char(monat, 'YYYY') || '-' || lpad((i * 100 + k)::text, 5, '0'),
                case when st = 'zahlung_offen' and k = 0 then 'open' else 'paid' end, 'eur',
                case when iv = 'jahr' then preis * 12 else preis end, round((case when iv = 'jahr' then preis * 12 else preis end) * 0.19),
                round((case when iv = 'jahr' then preis * 12 else preis end) * 1.19),
                case when st = 'zahlung_offen' and k = 0 then 0 else round((case when iv = 'jahr' then preis * 12 else preis end) * 1.19) end,
                case when st = 'zahlung_offen' and k = 0 then round((case when iv = 'jahr' then preis * 12 else preis end) * 1.19) else 0 end,
                false, monat + interval '1 day', case when st = 'zahlung_offen' and k = 0 then null else monat + interval '2 days' end,
                round((case when iv = 'jahr' then preis * 12 else preis end) * 1.19 * 0.015) + 25);
      end if;
    end loop;

    -- Ein paar Objekte und eine Support-Anfrage
    for k in 1..(1 + i % 4) loop
      insert into public.immobilien (bezeichnung, vertragsart, mandant_id) values ('Demo-Objekt ' || i || '-' || k, case when k % 2 = 0 then 'vermietung' else 'verkauf' end, m_id);
    end loop;
    if i % 7 = 0 then
      insert into public.support_anfragen (mandant_id, betreff, text, kategorie, prioritaet, status, erstellt_am)
      values (m_id, 'Demo-Anfrage ' || i, 'Beispielfrage aus den Demo-Daten.', case when i % 14 = 0 then 'datenuebernahme' else 'frage' end, 'normal', 'offen', now() - make_interval(days => i % 3));
    end if;
    n := n + 1;
  end loop;

  -- Kennzahlen-Verlauf: Monatsenden der letzten 12 Monate aus den Demo-Abos (nur, wo noch nichts steht)
  for k in reverse 12..1 loop
    monat := (date_trunc('month', now() - make_interval(months => k)) + interval '1 month' - interval '1 day')::date;
    insert into public.plattform_mandanten_tag (datum, mandant_id, tarif, intervall, status, zahlend, mrr_cent, gruenderpreis)
    select monat, m.id, a.tarif, a.intervall, a.status, a.status in ('aktiv', 'gekuendigt', 'zahlung_offen'),
           case when a.status in ('aktiv', 'gekuendigt', 'zahlung_offen') then
             (select case a.intervall when 'jahr' then coalesce(t.preis_jahr_cent, 0) / 12 else coalesce(t.preis_monat_cent, 0) end from public.plattform_tarife t where t.schluessel = a.tarif) else 0 end,
           a.gruenderpreis
      from public.mandanten m join public.mandant_abo a on a.mandant_id = m.id
     where m.ist_demo and m.erstellt_am::date <= monat and a.status <> 'test'
    on conflict (datum, mandant_id) do nothing;
    insert into public.plattform_kennzahlen_tag (datum, kennzahl, tarif, wert, ist_demo)
    select monat, 'mrr_cent', '', coalesce(sum(x.mrr_cent), 0), true from public.plattform_mandanten_tag x join public.mandanten m on m.id = x.mandant_id where x.datum = monat and m.ist_demo
    union all
    select monat, 'mrr_cent', x.tarif, coalesce(sum(x.mrr_cent), 0), true from public.plattform_mandanten_tag x join public.mandanten m on m.id = x.mandant_id where x.datum = monat and m.ist_demo and x.zahlend group by x.tarif
    union all
    select monat, 'zahlende', '', count(*), true from public.plattform_mandanten_tag x join public.mandanten m on m.id = x.mandant_id where x.datum = monat and m.ist_demo and x.zahlend
    on conflict (datum, kennzahl, tarif) do nothing;
  end loop;
  return n;
end
$function$;
revoke all on function public.plattform_demo_anlegen() from public, anon;
grant execute on function public.plattform_demo_anlegen() to authenticated;

create or replace function public.plattform_demo_entfernen()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') <> 'owner' then
    raise exception 'Nur owner.' using errcode = '42501';
  end if;
  delete from auth.users where id in (select p.id from public.profiles p join public.mandanten m on m.id = p.mandant_id where m.ist_demo);
  delete from public.plattform_kennzahlen_tag where ist_demo;
  delete from public.plattform_warnungen where mandant_id in (select id from public.mandanten where ist_demo);
  delete from public.mandanten where ist_demo;
  get diagnostics n = row_count;
  return n;
end
$function$;
revoke all on function public.plattform_demo_entfernen() from public, anon;
grant execute on function public.plattform_demo_entfernen() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Zeitplan: stuendliche Pruefung, Zusammenfassung 7:30 Europe/Berlin
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('plattform-warnungen-stuendlich', 'plattform-zusammenfassung-sommer', 'plattform-zusammenfassung-winter');
  perform cron.schedule('plattform-warnungen-stuendlich', '20 * * * *',
    $cron$select net.http_post(
      url := public.eigene_funktions_url('plattform-warnungen'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
      body := '{"modus":"pruefen"}'::jsonb,
      timeout_milliseconds := 120000);$cron$);
  -- 7:30 Berlin = 05:30 UTC (Sommer) / 06:30 UTC (Winter). Die Funktion sendet nur, wenn es in Berlin 7 Uhr ist, und nur einmal am Tag.
  perform cron.schedule('plattform-zusammenfassung-sommer', '30 5 * * *',
    $cron$select net.http_post(
      url := public.eigene_funktions_url('plattform-warnungen'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
      body := '{"modus":"zusammenfassung"}'::jsonb,
      timeout_milliseconds := 120000);$cron$);
  perform cron.schedule('plattform-zusammenfassung-winter', '30 6 * * *',
    $cron$select net.http_post(
      url := public.eigene_funktions_url('plattform-warnungen'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
      body := '{"modus":"zusammenfassung"}'::jsonb,
      timeout_milliseconds := 120000);$cron$);
end $$;
