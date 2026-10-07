-- ===========================================================================
-- Fork-eigene Migration 75 — Betreiberbereich, Schritt 7: Technik & Jobs
--
-- AUFTRAG vom 07.10.2026, Abschnitt 8. Was die Vorlage hat: pg_cron als
-- Hintergrundlauf (keine eigene Job-Warteschlange), ein Fehlerprotokoll der
-- OBERFLAECHE (fehler_protokoll), die Stripe-Ereignisse (stripe_ereignisse)
-- und das Credit-Ledger mit Reservierungen. Was fehlt und hier dazukommt:
--
--   system_fehler    Fehler aus Edge Functions. Befuellt von den Funktionen,
--                    die eine Beilage _technik einbinden — heute die beiden
--                    Betreiber-Funktionen. Die 130 Funktionen der Vorlage
--                    schreiben nur in ihr Konsolenprotokoll; sie alle
--                    anzuschliessen ist eine Erzeuger-Regel fuer spaeter
--                    (docs/OFFEN.md). Keine Spalte mandant_id: die Tabelle
--                    ist GLOBAL, der Mandant steht als Hinweis dabei.
--   dienst_aufrufe   Dauer und Ausgang je Aufruf eines externen Dienstes
--                    (Stripe, Claude, OpenAI, Mail, Karten). Gemessen, wo
--                    die Beilage eingebunden ist — heute Stripe.
--   cron_laeufe()    die letzten Laeufe je Job aus cron.job_run_details
--   cron_job_jetzt() einen Job sofort ausfuehren (owner/admin)
--   plattform_speicher()  Speicher je Mandant und Bucket, Datenbankgroesse,
--                    Wachstum je Monat
--   plattform_technik()   die interne Statusseite: gruen/gelb/rot je Dienst,
--                    haengende Reservierungen, Webhook-Stand
--
-- "Erneut verarbeiten" fuer Stripe-Webhooks gibt es hier NICHT: die
-- Signaturpruefung des Webhooks laesst ein Wiedereinspielen aus der
-- Datenbank nicht zu, und das ist richtig so. Stripe selbst kann jedes
-- Ereignis erneut senden; die Oberflaeche verlinkt dorthin.
--
-- RUECKNAHME: drop function plattform_technik, plattform_speicher,
-- cron_job_jetzt, cron_laeufe; drop table dienst_aufrufe, system_fehler.
-- ===========================================================================

create table if not exists public.system_fehler (
  id                  uuid primary key default gen_random_uuid(),
  zeit                timestamptz not null default now(),
  funktion            text not null,
  meldung             text not null,
  einzelheiten        jsonb not null default '{}'::jsonb,
  betrifft_mandant_id uuid,
  erledigt_am         timestamptz
);
create index if not exists system_fehler_zeit_idx on public.system_fehler (zeit desc);
alter table public.system_fehler enable row level security;
create policy system_fehler_lesen on public.system_fehler
  for select to authenticated using (public.plattform_rolle() in ('owner','admin'));
create policy system_fehler_erledigen on public.system_fehler
  for update to authenticated using (public.plattform_rolle() in ('owner','admin'))
  with check (public.plattform_rolle() in ('owner','admin'));
comment on table public.system_fehler is
  'Fehler aus Edge Functions (Beilage _technik). GLOBAL; der Mandant steht als Hinweis, nicht als Grenze.';

create table if not exists public.dienst_aufrufe (
  id        uuid primary key default gen_random_uuid(),
  zeit      timestamptz not null default now(),
  dienst    text not null,       -- stripe | claude | openai | mail | karten | ...
  funktion  text not null,
  dauer_ms  integer not null,
  ok        boolean not null,
  status    text
);
create index if not exists dienst_aufrufe_zeit_idx on public.dienst_aufrufe (zeit desc);
alter table public.dienst_aufrufe enable row level security;
create policy dienst_aufrufe_lesen on public.dienst_aufrufe
  for select to authenticated using (public.plattform_rolle() in ('owner','admin'));
comment on table public.dienst_aufrufe is
  'Dauer und Ausgang je Aufruf eines externen Dienstes. Gemessen von Funktionen mit der Beilage _technik.';

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('system_fehler', 'GLOBAL', 'Fehler der Edge Functions; nur Betreiber; Mandant nur als Hinweis'),
  ('dienst_aufrufe', 'GLOBAL', 'Messwerte externer Dienste; kein Mandantenbezug')
on conflict (tabelle) do update set gruppe = excluded.gruppe, grund = excluded.grund;

-- --- Die letzten Laeufe je Job --------------------------------------------
create or replace function public.cron_laeufe(p_stunden integer default 24)
 returns table (jobname text, start timestamptz, ende timestamptz, status text, meldung text)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'cron'
as $function$
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner','admin') then
    raise exception 'Nur owner oder admin.' using errcode = '42501';
  end if;
  return query
  select j.jobname::text, d.start_time, d.end_time, d.status::text, left(d.return_message, 300)
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where d.start_time > now() - make_interval(hours => greatest(1, least(p_stunden, 24 * 14)))
   order by d.start_time desc
   limit 500;
end
$function$;
revoke all on function public.cron_laeufe(integer) from public, anon;
grant execute on function public.cron_laeufe(integer) to authenticated;

-- --- Einen Job sofort ausfuehren --------------------------------------------
-- Dasselbe Kommando, das der Zeitplan ausfuehrt — nicht mehr, nicht weniger.
create or replace function public.cron_job_jetzt(p_jobname text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'cron'
as $function$
declare k text;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner','admin') then
    raise exception 'Nur owner oder admin.' using errcode = '42501';
  end if;
  select command into k from cron.job where jobname = p_jobname;
  if k is null then raise exception 'Unbekannter Job: %', p_jobname using errcode = '22023'; end if;
  execute k;
  return k;
end
$function$;
comment on function public.cron_job_jetzt(text) is 'Fuehrt das Kommando eines pg_cron-Jobs sofort aus. Nur owner/admin.';
revoke all on function public.cron_job_jetzt(text) from public, anon;
grant execute on function public.cron_job_jetzt(text) to authenticated;

-- --- Speicher -----------------------------------------------------------------
create or replace function public.plattform_speicher()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare r jsonb;
begin
  if auth.uid() is not null and public.plattform_rolle() is null then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'gesamt_bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o),
    'objekte', (select count(*) from storage.objects),
    'datenbank_bytes', pg_database_size(current_database()),
    'je_bucket', (select coalesce(jsonb_object_agg(x.bucket_id, x.bytes), '{}'::jsonb) from (
        select bucket_id, sum(coalesce((metadata->>'size')::bigint, 0)) as bytes from storage.objects group by bucket_id) x),
    'je_mandant', (select coalesce(jsonb_agg(jsonb_build_object('mandant_id', x.m, 'bytes', x.bytes, 'objekte', x.n) order by x.bytes desc), '[]'::jsonb) from (
        select (storage.foldername(o.name))[1] as m, sum(coalesce((o.metadata->>'size')::bigint, 0)) as bytes, count(*) as n
          from storage.objects o group by 1) x where x.m ~ '^[0-9a-f-]{36}$'),
    'je_monat', (select coalesce(jsonb_agg(jsonb_build_object('monat', x.monat, 'bytes', x.bytes, 'objekte', x.n) order by x.monat), '[]'::jsonb) from (
        select to_char(o.created_at, 'YYYY-MM') as monat, sum(coalesce((o.metadata->>'size')::bigint, 0)) as bytes, count(*) as n
          from storage.objects o where o.created_at > now() - interval '12 months' group by 1) x)
  ) into r;
  return r;
end
$function$;
revoke all on function public.plattform_speicher() from public, anon;
grant execute on function public.plattform_speicher() to authenticated;

-- --- Die Statusseite ------------------------------------------------------------
create or replace function public.plattform_technik()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'cron'
as $function$
declare
  r jsonb;
  cron_fehler int; cron_still int;
  wh_fehler int; wh_offen int;
  fn_24 int; fn_7 int;
  letzter_abgleich record;
  haengend int;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner','admin') then
    raise exception 'Nur owner oder admin.' using errcode = '42501';
  end if;
  select count(*) filter (where fehler_24h > 0), count(*) filter (where aktiv and laeufe_24h = 0)
    into cron_fehler, cron_still from public.cron_zustand();
  select count(*) filter (where fehler is not null and empfangen_am > now() - interval '24 hours'),
         count(*) filter (where verarbeitet_am is null and empfangen_am > now() - interval '24 hours')
    into wh_fehler, wh_offen from public.stripe_ereignisse;
  select count(*) filter (where zeit > now() - interval '24 hours'), count(*) filter (where zeit > now() - interval '7 days')
    into fn_24, fn_7 from public.system_fehler where erledigt_am is null;
  select * into letzter_abgleich from public.stripe_abgleich order by erstellt_am desc limit 1;
  select count(*) into haengend from public.credit_buchungen where status = 'reserviert' and zeitpunkt < now() - interval '1 hour';
  select jsonb_build_object(
    'status', jsonb_build_array(
      jsonb_build_object('dienst', 'Zeitplan (pg_cron)', 'stand', case when cron_fehler > 0 then 'rot' when cron_still > 0 then 'gelb' else 'gruen' end,
                         'text', cron_fehler || ' Job(s) mit Fehlern, ' || cron_still || ' still'),
      jsonb_build_object('dienst', 'Stripe-Webhooks', 'stand', case when wh_fehler > 0 then 'rot' when wh_offen > 0 then 'gelb' else 'gruen' end,
                         'text', wh_fehler || ' mit Fehler, ' || wh_offen || ' unverarbeitet (24 h)'),
      jsonb_build_object('dienst', 'Stripe-Abgleich', 'stand', case when letzter_abgleich is null then 'gelb' when letzter_abgleich.fehler is not null then 'rot' when letzter_abgleich.abweichung then 'gelb' else 'gruen' end,
                         'text', case when letzter_abgleich is null then 'noch kein Abgleich' else 'zuletzt ' || to_char(letzter_abgleich.erstellt_am, 'DD.MM. HH24:MI') || coalesce(' — ' || letzter_abgleich.fehler, '') end),
      jsonb_build_object('dienst', 'Edge Functions', 'stand', case when fn_24 > 5 then 'rot' when fn_24 > 0 then 'gelb' else 'gruen' end,
                         'text', fn_24 || ' Fehler in 24 h, ' || fn_7 || ' in 7 Tagen (nur angeschlossene Funktionen)'),
      jsonb_build_object('dienst', 'Credit-Ledger', 'stand', case when haengend > 0 then 'gelb' else 'gruen' end,
                         'text', haengend || ' Reservierung(en) aelter als eine Stunde'),
      jsonb_build_object('dienst', 'E-Mail-Zustellung', 'stand', 'grau',
                         'text', 'kein Zustellprotokoll — Resend-Webhook noch nicht angebunden (docs/OFFEN.md)')
    ),
    'dienste', (select coalesce(jsonb_agg(jsonb_build_object('dienst', x.dienst, 'aufrufe', x.n, 'fehlerquote', x.q, 'median_ms', x.med, 'p95_ms', x.p95) order by x.dienst), '[]'::jsonb) from (
        select dienst, count(*) as n, round(100.0 * count(*) filter (where not ok) / count(*), 1) as q,
               percentile_cont(0.5) within group (order by dauer_ms) as med, percentile_cont(0.95) within group (order by dauer_ms) as p95
          from public.dienst_aufrufe where zeit > now() - interval '24 hours' group by dienst) x),
    'webhooks', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'typ', e.typ, 'empfangen_am', e.empfangen_am, 'verarbeitet_am', e.verarbeitet_am, 'fehler', e.fehler) order by e.empfangen_am desc), '[]'::jsonb)
                 from (select * from public.stripe_ereignisse order by empfangen_am desc limit 50) e),
    'fehler', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'zeit', f.zeit, 'funktion', f.funktion, 'meldung', f.meldung, 'betrifft_mandant_id', f.betrifft_mandant_id, 'erledigt_am', f.erledigt_am) order by f.zeit desc), '[]'::jsonb)
               from (select * from public.system_fehler where zeit > now() - interval '7 days' order by zeit desc limit 100) f),
    'haengend', (select coalesce(jsonb_agg(jsonb_build_object('vorgang_id', b.vorgang_id, 'mandant_id', b.mandant_id, 'aktion', b.aktion, 'credits', b.credits, 'zeitpunkt', b.zeitpunkt) order by b.zeitpunkt), '[]'::jsonb)
                 from (select distinct on (vorgang_id) vorgang_id, mandant_id, aktion, credits, zeitpunkt from public.credit_buchungen
                        where status = 'reserviert' and zeitpunkt < now() - interval '1 hour' order by vorgang_id, zeitpunkt limit 100) b)
  ) into r;
  return r;
end
$function$;
revoke all on function public.plattform_technik() from public, anon;
grant execute on function public.plattform_technik() to authenticated;
