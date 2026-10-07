-- ===========================================================================
-- Fork-eigene Migration 72 — Betreiberbereich, Schritt 4: Kosten & Marge
--
-- AUFTRAG vom 07.10.2026, Abschnitt 5. Alles aus dem Ledger: KI-Kosten je
-- Tag, je Aktion, je Anbieter/Modell; Ist-Kosten je Credit neben dem Ziel;
-- Deckungsbeitrag je Tarif und je Mandant; Warnliste; Fixkosten.
--
-- ANBIETER UND MODELL: credit_buchungen kannte sie nicht. Jetzt zwei Spalten
-- (nullable — ein Ledger wird nicht rueckwirkend erfunden) und eine zweite
-- Fassung von credits_buchen, die sie entgegennimmt. Die alte Fassung
-- bleibt: fuenf Funktionen rufen sie, und ein Ledger-Aufruf, der wegen
-- einer neuen Signatur scheitert, verliert eine Buchung.
--
-- STRIPE-GEBUEHREN: Der Auftrag will sie aus Balance Transactions. Die
-- werden erst mit Schritt 6 gespiegelt. Bis dahin steht hier eine
-- SCHAETZUNG aus zwei Plattformwerten (Prozent + Fixbetrag je Rechnung),
-- und die Oberflaeche nennt sie so. Eine Schaetzung mit Etikett ist
-- ehrlicher als eine Null ohne.
--
-- RUECKNAHME: drop function plattform_kosten(date, date); credits_buchen
-- wieder auf drei Parameter setzen (fork_47); drop table plattform_fixkosten;
-- die beiden Spalten koennen stehen bleiben.
-- ===========================================================================

-- --- 1. Anbieter und Modell im Ledger ---------------------------------------
alter table public.credit_buchungen
  add column if not exists anbieter text,
  add column if not exists modell   text;

-- EINE Fassung, nicht zwei: tests/funktionsrechte.sql zaehlt genau acht
-- Geldfunktionen, die nur der Dienstschluessel rufen darf, und zaehlt sie
-- nach Oid — eine Ueberladung waere eine neunte. Also bekommt die
-- bestehende Funktion zwei freiwillige Parameter mit Vorgabe NULL; die
-- fuenf Aufrufer mit drei Argumenten laufen unveraendert weiter.
drop function if exists public.credits_buchen(uuid, numeric, text);
create or replace function public.credits_buchen(
    p_vorgang uuid,
    p_ki_kosten_eur numeric default null,
    p_notiz text default null,
    p_anbieter text default null,
    p_modell text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_summe integer;
  v_anzahl integer;
  v_kosten numeric;
begin
  select count(*), coalesce(sum(credits), 0) into v_anzahl, v_summe
    from public.credit_buchungen
   where vorgang_id = p_vorgang and status = 'reserviert';
  if v_anzahl = 0 then
    -- Schon gebucht oder schon freigegeben: nichts tun, nicht scheitern.
    return 0;
  end if;
  v_kosten := p_ki_kosten_eur;
  update public.credit_buchungen b
     set status = 'gebucht',
         abgeschlossen_am = now(),
         notiz = coalesce(p_notiz, b.notiz),
         anbieter = coalesce(p_anbieter, b.anbieter),
         modell = coalesce(p_modell, b.modell),
         ki_kosten_eur = case
           when v_kosten is null or v_summe = 0 then b.ki_kosten_eur
           else round(v_kosten * b.credits / v_summe, 6) end
   where b.vorgang_id = p_vorgang and b.status = 'reserviert';
  return v_summe;
end
$function$;
comment on function public.credits_buchen(uuid, numeric, text, text, text) is
  'Schliesst eine Reservierung ab; verteilt die Anbieterkosten anteilig, traegt seit fork_72 '
  'Anbieter und Modell ein (freiwillig). Ein zweiter Aufruf tut nichts. Nur Dienstschluessel.';
revoke all on function public.credits_buchen(uuid, numeric, text, text, text) from public, anon, authenticated;

-- --- 2. Fixkosten -------------------------------------------------------------
create table if not exists public.plattform_fixkosten (
  id            uuid primary key default gen_random_uuid(),
  bezeichnung   text not null,
  betrag_cent   integer not null default 0,
  aktiv         boolean not null default true,
  notiz         text,
  geaendert_am  timestamptz not null default now(),
  constraint plattform_fixkosten_bezeichnung_check check (length(btrim(bezeichnung)) >= 2),
  constraint plattform_fixkosten_betrag_check check (betrag_cent >= 0)
);
alter table public.plattform_fixkosten enable row level security;
create policy plattform_fixkosten_lesen on public.plattform_fixkosten
  for select to authenticated using (public.plattform_rolle() is not null);
create policy plattform_fixkosten_pflegen on public.plattform_fixkosten
  for all to authenticated
  using (public.plattform_rolle() in ('owner','admin'))
  with check (public.plattform_rolle() in ('owner','admin'));
comment on table public.plattform_fixkosten is
  'Monatliche Fixkosten der Plattform (Hosting, Werkzeuge, Versicherung ...), frei gepflegt. '
  'Ergebnis vor Personal und Miete = Deckungsbeitrag minus Summe hiervon.';
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_fixkosten', 'GLOBAL', 'Fixkosten des Betreibers; kein Mandantenbezug')
on conflict (tabelle) do update set gruppe = excluded.gruppe, grund = excluded.grund;

-- --- 3. Plattformwerte ---------------------------------------------------------
insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('infrastruktur_pauschale_cent', '150'::jsonb,
   'Anteilige Infrastruktur je Mandant und Monat, netto in Cent (Auftrag: Startwert 1,50 EUR).'),
  ('credit_zielkosten_eur', '0.02'::jsonb,
   'Zielwert der Anbieterkosten je Credit in EUR. Die Ampel in Kosten & Marge warnt bei mehr als 20 % Abweichung.'),
  ('stripe_gebuehr_prozent', '1.5'::jsonb,
   'SCHAETZUNG der Stripe-Gebuehr in Prozent, bis Balance Transactions gespiegelt sind (Schritt 6).'),
  ('stripe_gebuehr_fix_cent', '25'::jsonb,
   'SCHAETZUNG des Fixanteils je Zahlung in Cent, bis Balance Transactions gespiegelt sind (Schritt 6).')
on conflict (schluessel) do nothing;

-- --- 4. Die Kostenrechnung ------------------------------------------------------
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
begin
  if auth.uid() is not null and public.plattform_rolle() is null then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  with b as (
    select mandant_id, aktion, coalesce(anbieter, 'unbekannt') as anbieter, coalesce(modell, 'unbekannt') as modell,
           credits, ki_kosten_eur, zeitpunkt::date as tag
      from public.credit_buchungen
     where status = 'gebucht' and zeitpunkt >= p_von and zeitpunkt < p_bis + 1
  ), m as (
    -- Erloes je Mandant im Zeitraum: MRR anteilig auf die Tage (30-Tage-Monat).
    select x.mandant_id, x.tarif, x.zahlend,
           round(x.mrr_cent * tage / 30.0) as erloes_cent
      from public.plattform_mrr_je_mandant() x
  ), je_mandant as (
    select m.mandant_id, m.tarif, m.zahlend, m.erloes_cent,
           coalesce(sum(b.ki_kosten_eur), 0) as ki_eur,
           coalesce(sum(b.credits), 0) as credits,
           -- Gebuehren: geschaetzt, siehe Kopf.
           case when m.erloes_cent > 0 then round(m.erloes_cent * geb_pct / 100 + geb_fix * tage / 30.0) else 0 end as gebuehr_cent,
           case when m.zahlend then round(pauschale * tage / 30.0) else 0 end as pauschale_cent
      from m left join b on b.mandant_id = m.mandant_id
     group by m.mandant_id, m.tarif, m.zahlend, m.erloes_cent
  )
  select jsonb_build_object(
    'von', p_von, 'bis', p_bis, 'tage', tage,
    'ziel_je_credit_eur', ziel, 'pauschale_cent', pauschale,
    'gebuehr_geschaetzt', true, 'gebuehr_prozent', geb_pct, 'gebuehr_fix_cent', geb_fix,
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
comment on function public.plattform_kosten(date, date) is
  'Kosten & Marge fuer einen Zeitraum: je Tag, Aktion, Anbieter/Modell, Mandant, Tarif; Deckungsbeitrag '
  '= Erloes (MRR anteilig) - KI-Kosten - Stripe-Gebuehr (geschaetzt bis Schritt 6) - Infrastrukturpauschale. Nur Betreiber.';
revoke all on function public.plattform_kosten(date, date) from public, anon;
grant execute on function public.plattform_kosten(date, date) to authenticated;
