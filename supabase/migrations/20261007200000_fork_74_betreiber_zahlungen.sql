-- ===========================================================================
-- Fork-eigene Migration 74 — Betreiberbereich, Schritt 6: Zahlungen,
-- Buchhaltungs-Export, Stripe-Abgleich
--
-- AUFTRAG vom 07.10.2026, Abschnitt 7 und "Datenbasis" in Abschnitt 3.
-- Baut auf stripe_rechnungen (fork_71 der parallelen Sitzung) auf — das
-- Abbild der Rechnungen, geschrieben vom Webhook. Hier kommen dazu:
--
--   * drei Spalten am Abbild, die der Webhook nicht kennt: die Gebuehr
--     (Balance Transaction), die Zahl der Versuche und der naechste Versuch.
--     Gefuellt vom TAEGLICHEN ABGLEICH (plattform-stripe-abgleich), nicht
--     vom Webhook — der gehoert der anderen Sitzung, und ein Webhook, der
--     bei jedem Ereignis noch zwei Abfragen nachschiebt, wird langsam.
--   * stripe_abgleich: das Ergebnis des Abgleichs — Summen aus Stripe neben
--     den Summen des Abbilds, Abweichung, betroffene Kennungen. Ein
--     verlorener Webhook faellt so am naechsten Morgen auf.
--   * plattform_zahlungen(von, bis): fehlgeschlagene Zahlungen mit Mahnstufe
--     und Tagen bis zur Sperre, Rechnungen nach Status, Monatszeilen fuer
--     die Buchhaltung.
--   * plattform_kosten rechnet mit der ECHTEN Gebuehr, sobald sie da ist;
--     die Schaetzung aus fork_72 bleibt der Rueckfall und bleibt als solche
--     gekennzeichnet.
--
-- RUECKNAHME: cron.unschedule('plattform-stripe-abgleich-taeglich'); drop
-- function plattform_zahlungen; drop table stripe_abgleich; die Spalten
-- koennen bleiben; plattform_kosten aus fork_72 wiederherstellen.
-- ===========================================================================

alter table public.stripe_rechnungen
  add column if not exists gebuehr_cent      integer,
  add column if not exists versuche          integer,
  add column if not exists naechster_versuch timestamptz,
  add column if not exists zahlung_id        text,
  add column if not exists abgeglichen_am    timestamptz;

create table if not exists public.stripe_abgleich (
  id            uuid primary key default gen_random_uuid(),
  datum         date not null default current_date,
  bereich       text not null,            -- rechnungen_bezahlt | rechnungen_offen | abos_aktiv
  zeitraum      text not null,            -- 'laufend' | 'vormonat'
  stripe_anzahl integer not null default 0,
  stripe_cent   bigint not null default 0,
  spiegel_anzahl integer not null default 0,
  spiegel_cent  bigint not null default 0,
  abweichung    boolean not null default false,
  kennungen     jsonb not null default '[]'::jsonb,   -- was bei Stripe ist und im Abbild fehlt, und umgekehrt
  fehler        text,
  erstellt_am   timestamptz not null default now(),
  unique (datum, bereich, zeitraum)
);
alter table public.stripe_abgleich enable row level security;
create policy stripe_abgleich_lesen on public.stripe_abgleich
  for select to authenticated using (public.plattform_rolle() in ('owner','admin','finanzen'));
comment on table public.stripe_abgleich is
  'Taeglicher Vergleich der Stripe-Summen mit dem Abbild in stripe_rechnungen und mandant_abo. Nur Betreiber.';
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('stripe_abgleich', 'GLOBAL', 'Abgleich Stripe gegen Abbild, Summen ueber alle Mandanten; nur Betreiber')
on conflict (tabelle) do update set gruppe = excluded.gruppe, grund = excluded.grund;

-- --- Zahlungen fuer den Betreiber -----------------------------------------
create or replace function public.plattform_zahlungen(p_von date, p_bis date)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  r jsonb;
  frist integer := coalesce((select (wert)::text::int from public.plattform_werte where schluessel = 'zahlung_frist_tage'), 14);
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner','admin','finanzen') then
    raise exception 'Nur owner, admin oder finanzen.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'von', p_von, 'bis', p_bis, 'frist_tage', frist,
    -- Fehlgeschlagen: das Abo sagt seit wann; die offene Rechnung sagt Betrag,
    -- Versuche (= Mahnstufe) und naechsten Versuch.
    'fehlgeschlagen', (select coalesce(jsonb_agg(jsonb_build_object(
        'mandant_id', a.mandant_id, 'seit', a.zahlung_fehler_seit,
        'tage_bis_sperre', greatest(0, frist - (current_date - a.zahlung_fehler_seit::date)),
        'rechnung_id', rr.id, 'nummer', rr.nummer, 'brutto_cent', rr.brutto_cent, 'offen_cent', rr.offen_cent,
        'mahnstufe', coalesce(rr.versuche, 1), 'naechster_versuch', rr.naechster_versuch,
        'rechnung_url', rr.rechnung_url, 'stripe_kunde_id', a.stripe_customer_id, 'stripe_abo_id', a.stripe_subscription_id)
        order by a.zahlung_fehler_seit), '[]'::jsonb)
      from public.mandant_abo a
      left join lateral (select * from public.stripe_rechnungen x where x.mandant_id = a.mandant_id
                           and x.status in ('open','uncollectible') order by x.erstellt_am desc limit 1) rr on true
      where a.zahlung_fehler_seit is not null),
    'rechnungen', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'mandant_id', x.mandant_id, 'art', x.art, 'nummer', x.nummer, 'status', x.status,
        'netto_cent', x.netto_cent, 'steuer_cent', x.steuer_cent, 'brutto_cent', x.brutto_cent,
        'bezahlt_cent', x.bezahlt_cent, 'offen_cent', x.offen_cent, 'gebuehr_cent', x.gebuehr_cent,
        'reverse_charge', x.reverse_charge, 'erstellt_am', x.erstellt_am, 'bezahlt_am', x.bezahlt_am,
        'rechnung_url', x.rechnung_url, 'pdf_url', x.pdf_url, 'stripe_kunde_id', x.stripe_kunde_id,
        'zahlung_id', x.zahlung_id, 'bezug_rechnung_id', x.bezug_rechnung_id)
        order by x.erstellt_am desc), '[]'::jsonb)
      from public.stripe_rechnungen x
      where x.erstellt_am >= p_von and x.erstellt_am < p_bis + 1),
    'summen', (select jsonb_build_object(
        'offen_cent', coalesce(sum(x.offen_cent) filter (where x.status = 'open'), 0),
        'bezahlt_cent', coalesce(sum(x.bezahlt_cent) filter (where x.status = 'paid'), 0),
        'gutschriften_cent', coalesce(sum(x.brutto_cent) filter (where x.art = 'gutschrift'), 0),
        'gebuehren_cent', coalesce(sum(x.gebuehr_cent), 0),
        'anzahl', count(*))
      from public.stripe_rechnungen x where x.erstellt_am >= p_von and x.erstellt_am < p_bis + 1),
    'abgleich', (select coalesce(jsonb_agg(to_jsonb(g) order by g.datum desc, g.bereich, g.zeitraum), '[]'::jsonb)
      from (select * from public.stripe_abgleich order by datum desc, erstellt_am desc limit 12) g)
  ) into r;
  return r;
end
$function$;
comment on function public.plattform_zahlungen(date, date) is
  'Zahlungen fuer den Betreiber: fehlgeschlagene mit Mahnstufe und Tagen bis Sperre, Rechnungen im Zeitraum, '
  'Summen, die letzten Abgleiche. Nur owner/admin/finanzen.';
revoke all on function public.plattform_zahlungen(date, date) from public, anon;
grant execute on function public.plattform_zahlungen(date, date) to authenticated;

-- --- plattform_kosten: echte Gebuehr, wenn vorhanden -------------------------
-- Dieselbe Funktion wie in fork_72, nur die Gebuehrzeile: je Mandant die
-- Summe der gespiegelten Gebuehren im Zeitraum; fehlt sie, die Schaetzung,
-- und das Kennzeichen sagt, welches von beidem es war.
create or replace function public.plattform_kosten(p_von date, p_bis date)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  r jsonb;
  tage integer := greatest(1, p_bis - p_von + 1);
  pauschale numeric := coalesce((select (wert)::text::numeric from public.plattform_werte where schluessel = 'infrastruktur_pauschale_cent'), 150);
  ziel numeric := coalesce((select (wert)::text::numeric from public.plattform_werte where schluessel = 'credit_zielkosten_eur'), 0.02);
  geb_pct numeric := coalesce((select (wert)::text::numeric from public.plattform_werte where schluessel = 'stripe_gebuehr_prozent'), 1.5);
  geb_fix numeric := coalesce((select (wert)::text::numeric from public.plattform_werte where schluessel = 'stripe_gebuehr_fix_cent'), 25);
  warn_pct numeric := coalesce((select (wert)::text::numeric from public.plattform_werte where schluessel = 'kosten_warnung_prozent'), 30);
  echte_gebuehren boolean;
begin
  if auth.uid() is not null and public.plattform_rolle() is null then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  select exists (select 1 from public.stripe_rechnungen x where x.gebuehr_cent is not null
                   and x.bezahlt_am >= p_von and x.bezahlt_am < p_bis + 1) into echte_gebuehren;
  with b as (
    select mandant_id, aktion, coalesce(anbieter, 'unbekannt') as anbieter, coalesce(modell, 'unbekannt') as modell,
           credits, ki_kosten_eur, zeitpunkt::date as tag
      from public.credit_buchungen
     where status = 'gebucht' and zeitpunkt >= p_von and zeitpunkt < p_bis + 1
  ), geb as (
    select mandant_id, sum(gebuehr_cent) as cent from public.stripe_rechnungen
     where gebuehr_cent is not null and bezahlt_am >= p_von and bezahlt_am < p_bis + 1
     group by mandant_id
  ), m as (
    select x.mandant_id, x.tarif, x.zahlend, round(x.mrr_cent * tage / 30.0) as erloes_cent
      from public.plattform_mrr_je_mandant() x
  ), je_mandant as (
    select m.mandant_id, m.tarif, m.zahlend, m.erloes_cent,
           coalesce(sum(b.ki_kosten_eur), 0) as ki_eur,
           coalesce(sum(b.credits), 0) as credits,
           case when echte_gebuehren then coalesce(g.cent, 0)
                when m.erloes_cent > 0 then round(m.erloes_cent * geb_pct / 100 + geb_fix * tage / 30.0) else 0 end as gebuehr_cent,
           case when m.zahlend then round(pauschale * tage / 30.0) else 0 end as pauschale_cent
      from m left join b on b.mandant_id = m.mandant_id left join geb g on g.mandant_id = m.mandant_id
     group by m.mandant_id, m.tarif, m.zahlend, m.erloes_cent, g.cent
  )
  select jsonb_build_object(
    'von', p_von, 'bis', p_bis, 'tage', tage,
    'ziel_je_credit_eur', ziel, 'pauschale_cent', pauschale,
    'gebuehr_geschaetzt', not echte_gebuehren, 'gebuehr_prozent', geb_pct, 'gebuehr_fix_cent', geb_fix,
    'warnung_prozent', warn_pct,
    'je_tag', (select coalesce(jsonb_agg(jsonb_build_object('tag', t.tag, 'eur', t.eur, 'credits', t.credits) order by t.tag), '[]'::jsonb)
                 from (select tag, round(sum(ki_kosten_eur)::numeric, 4) as eur, sum(credits) as credits from b group by tag) t),
    'je_aktion', (select coalesce(jsonb_agg(jsonb_build_object(
                     'aktion', a.aktion, 'eur', a.eur, 'credits', a.credits, 'buchungen', a.n,
                     'mit_kosten', a.mit, 'ist_je_credit', case when a.credits_mit > 0 then round(a.eur / a.credits_mit, 5) else null end,
                     'konfiguriert', (select p.credits from public.plattform_credit_preise p where p.aktion = a.aktion)) order by a.credits desc), '[]'::jsonb)
                   from (select aktion, round(sum(ki_kosten_eur)::numeric, 4) as eur, sum(credits) as credits, count(*) as n,
                                count(*) filter (where ki_kosten_eur is not null) as mit,
                                sum(credits) filter (where ki_kosten_eur is not null) as credits_mit
                           from b group by aktion) a),
    'je_anbieter', (select coalesce(jsonb_agg(jsonb_build_object('anbieter', x.anbieter, 'modell', x.modell, 'eur', x.eur, 'credits', x.credits, 'buchungen', x.n) order by x.eur desc nulls last), '[]'::jsonb)
                     from (select anbieter, modell, round(sum(ki_kosten_eur)::numeric, 4) as eur, sum(credits) as credits, count(*) as n from b group by anbieter, modell) x),
    'je_mandant', (select coalesce(jsonb_agg(jsonb_build_object(
                      'mandant_id', j.mandant_id, 'tarif', j.tarif, 'zahlend', j.zahlend,
                      'erloes_cent', j.erloes_cent, 'ki_eur', round(j.ki_eur, 4), 'credits', j.credits,
                      'gebuehr_cent', j.gebuehr_cent, 'pauschale_cent', j.pauschale_cent,
                      'deckung_cent', round(j.erloes_cent - j.ki_eur * 100 - j.gebuehr_cent - j.pauschale_cent),
                      'ueber_grenze', (j.erloes_cent > 0 and j.ki_eur * 100 > j.erloes_cent * warn_pct / 100) or (j.erloes_cent = 0 and j.ki_eur > 0))
                      order by (j.erloes_cent - j.ki_eur * 100 - j.gebuehr_cent - j.pauschale_cent)), '[]'::jsonb)
                    from je_mandant j),
    'je_tarif', (select coalesce(jsonb_agg(jsonb_build_object(
                    'tarif', x.tarif, 'mandanten', x.n, 'erloes_cent', x.erloes, 'ki_eur', x.ki,
                    'gebuehr_cent', x.gebuehr, 'pauschale_cent', x.pauschale, 'deckung_cent', x.deckung)), '[]'::jsonb)
                  from (select coalesce(j.tarif, '—') as tarif, count(*) as n, sum(j.erloes_cent) as erloes, round(sum(j.ki_eur), 4) as ki,
                               sum(j.gebuehr_cent) as gebuehr, sum(j.pauschale_cent) as pauschale,
                               round(sum(j.erloes_cent - j.ki_eur * 100 - j.gebuehr_cent - j.pauschale_cent)) as deckung
                          from je_mandant j group by j.tarif) x),
    'gesamt', (select jsonb_build_object(
                  'erloes_cent', coalesce(sum(j.erloes_cent), 0), 'ki_eur', round(coalesce(sum(j.ki_eur), 0), 4),
                  'gebuehr_cent', coalesce(sum(j.gebuehr_cent), 0), 'pauschale_cent', coalesce(sum(j.pauschale_cent), 0),
                  'deckung_cent', round(coalesce(sum(j.erloes_cent - j.ki_eur * 100 - j.gebuehr_cent - j.pauschale_cent), 0)))
                from je_mandant j),
    'fixkosten_cent', (select coalesce(sum(round(f.betrag_cent * tage / 30.0)), 0) from public.plattform_fixkosten f where f.aktiv),
    'fixkosten', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'bezeichnung', f.bezeichnung, 'betrag_cent', f.betrag_cent, 'aktiv', f.aktiv, 'notiz', f.notiz) order by f.bezeichnung), '[]'::jsonb)
                   from public.plattform_fixkosten f)
  ) into r;
  return r;
end
$function$;

-- --- Der Abgleich, taeglich 03:10 Uhr --------------------------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'plattform-stripe-abgleich-taeglich';
  perform cron.schedule('plattform-stripe-abgleich-taeglich', '10 3 * * *',
    $cron$select net.http_post(
      url := public.eigene_funktions_url('plattform-stripe-abgleich'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
      body := '{}'::jsonb,
      timeout_milliseconds := 240000);$cron$);
end $$;
