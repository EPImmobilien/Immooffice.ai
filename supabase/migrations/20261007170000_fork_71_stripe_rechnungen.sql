-- ===========================================================================
-- fork_71 — Rechnungen und Gutschriften aus Stripe, gespiegelt
-- ===========================================================================
-- Abgestimmt mit dem Stripe-Integrationsplan vom 07.10.2026: Rechnungs- und
-- Gutschriftsdaten werden per Webhook in eine eigene Tabelle geschrieben.
-- Daraus entstehen später die Umsatzzahlen im Betreiberbereich, der
-- Buchhaltungs-Export und der tägliche Abgleich mit Stripe.
--
-- Was hier steht, sind Kopfdaten: Nummer, Status, Beträge, Links. Keine
-- Positionen, keine Zahlungsmitteldaten. Die Rechnung selbst bleibt bei
-- Stripe; dies ist ihr Abbild, kein zweites Original.
--
-- Geschrieben wird nur vom Webhook (Dienstschlüssel). Für Angemeldete gibt
-- es — wie bei mandant_abo — keine Schreibrichtlinie.
--
-- Rücknahme: drop table public.stripe_rechnungen; delete from
-- public.mandanten_einstufung where tabelle = 'stripe_rechnungen';
-- delete from public.plattform_werte where schluessel = 'stripe_portal_konfiguration';
-- ===========================================================================

create table if not exists public.stripe_rechnungen (
  -- in_… (Rechnung) oder cn_… (Gutschrift)
  id                 text not null,
  mandant_id         uuid not null default public.aktuelle_mandant_id()
                       references public.mandanten(id) on delete cascade,
  -- abo | einmal | gutschrift
  art                text not null,
  nummer             text,
  -- draft | open | paid | void | uncollectible (Rechnung) · issued | void (Gutschrift)
  status             text not null default '',
  waehrung           text not null default 'eur',
  -- Cent. Gutschriften negativ, damit eine Summe über die Tabelle den
  -- Nettoerlös ergibt.
  netto_cent         bigint not null default 0,
  steuer_cent        bigint not null default 0,
  brutto_cent        bigint not null default 0,
  bezahlt_cent       bigint not null default 0,
  offen_cent         bigint not null default 0,
  reverse_charge     boolean not null default false,
  bezug_rechnung_id  text,
  stripe_abo_id      text,
  stripe_kunde_id    text,
  rechnung_url       text,
  pdf_url            text,
  erstellt_am        timestamptz,
  bezahlt_am         timestamptz,
  geaendert_am       timestamptz not null default now(),
  -- Der Schlüssel trägt den Mandanten mit (Regel dieses Projekts: kein
  -- plattformweiter Primärschlüssel auf einer Mandantentabelle). Stripes
  -- Kennungen sind ohnehin eindeutig; der Webhook schreibt über beide.
  constraint stripe_rechnungen_pkey primary key (mandant_id, id),
  constraint stripe_rechnungen_art_check check (art in ('abo','einmal','gutschrift'))
);

create index if not exists stripe_rechnungen_mandant_idx
  on public.stripe_rechnungen (mandant_id);
create index if not exists stripe_rechnungen_zeit_idx
  on public.stripe_rechnungen (mandant_id, erstellt_am desc);
create index if not exists stripe_rechnungen_status_idx
  on public.stripe_rechnungen (status);

comment on table public.stripe_rechnungen is
  'Abbild der Stripe-Rechnungen und -Gutschriften je Mandant, geschrieben vom '
  'Stripe-Webhook. Kopfdaten, keine Positionen, keine Zahlungsmitteldaten.';

alter table public.stripe_rechnungen enable row level security;

-- Lesen darf der Chef seines Mandanten — dieselbe Regel wie beim Abo.
drop policy if exists "stripe_rechnungen_lesen" on public.stripe_rechnungen;
create policy "stripe_rechnungen_lesen" on public.stripe_rechnungen
  for select to authenticated
  using (coalesce(public.aktuelle_rolle(), '') = 'chef');

drop policy if exists "mandant_trennung" on public.stripe_rechnungen;
create policy "mandant_trennung" on public.stripe_rechnungen
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.mandant_id_schreiben());

-- Die Löschsperre aus fork_54, auch für diese Tabelle: `with check` gilt
-- nicht für DELETE, und eine lesende Support-Sitzung soll nichts löschen.
drop policy if exists "mandant_trennung_loeschen" on public.stripe_rechnungen;
create policy "mandant_trennung_loeschen" on public.stripe_rechnungen
  as restrictive for delete to public
  using (mandant_id = public.mandant_id_schreiben());

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('stripe_rechnungen', 'MANDANT', 'Abbild der Stripe-Rechnungen je Mandant; geschrieben vom Stripe-Webhook')
on conflict (tabelle) do nothing;

-- Die Kennung der Kundenportal-Konfiguration (bpc_…). Sie ist je Stripe-Konto
-- verschieden und wird von scripts/stripe-einrichten.mjs eingetragen; leer
-- heisst: Stripes Standard-Konfiguration.
insert into public.plattform_werte (schluessel, wert)
values ('stripe_portal_konfiguration', '""'::jsonb)
on conflict (schluessel) do nothing;
