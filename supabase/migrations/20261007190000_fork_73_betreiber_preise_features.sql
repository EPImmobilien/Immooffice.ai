-- ===========================================================================
-- Fork-eigene Migration 73 — Betreiberbereich, Schritt 5: Gutscheine und
-- Funktionsschalter (Feature-Flags)
--
-- AUFTRAG vom 07.10.2026, Abschnitt 11 und 12.
--
-- GUTSCHEINE: eigene Tabelle, nicht nur Stripe-Coupons. Stripe kennt den
-- Coupon, aber nicht, fuer welche Tarife er gelten soll, wie oft er schon
-- eingeloest wurde und von wem — und die Oberflaeche fragt Stripe nicht
-- live. Der Stripe-Coupon ist das Abbild (stripe_coupon_id), die Tabelle
-- hier das Original.
--
-- FUNKTIONSSCHALTER: drei Tabellen, eine Funktion. plattform_features sagt,
-- was es gibt und ob es standardmaessig an ist; tarif_features schaltet je
-- Tarif AN, was standardmaessig aus ist; mandant_features ist die Ausnahme
-- je Haus (an oder aus, befristet). hat_feature(schluessel) entscheidet in
-- dieser Reihenfolge: Ausnahme des Hauses, dann Tarif, dann Standard.
--
-- RUECKNAHME: drop function hat_feature, meine_features; drop table
-- mandant_features, tarif_features, plattform_features,
-- gutschein_einloesungen, gutscheine.
-- ===========================================================================

-- --- 1. Gutscheine -----------------------------------------------------------
create table if not exists public.gutscheine (
  code              text primary key,
  art               text not null,              -- prozent | betrag
  wert              integer not null,           -- Prozent oder Cent
  dauer             text not null default 'einmalig', -- einmalig | monate | dauerhaft
  monate            integer,
  gueltig_bis       timestamptz,
  max_einloesungen  integer,
  tarife            text[],                     -- null = alle Tarife
  stripe_coupon_id  text,
  aktiv             boolean not null default true,
  notiz             text,
  erstellt_am       timestamptz not null default now(),
  geaendert_am      timestamptz not null default now(),
  constraint gutscheine_code_check check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  constraint gutscheine_art_check check (art in ('prozent', 'betrag')),
  constraint gutscheine_wert_check check (wert > 0 and (art <> 'prozent' or wert <= 100)),
  constraint gutscheine_dauer_check check (dauer in ('einmalig', 'monate', 'dauerhaft') and (dauer <> 'monate' or monate > 0))
);
alter table public.gutscheine enable row level security;
create policy gutscheine_lesen on public.gutscheine
  for select to authenticated using (public.plattform_rolle() is not null);
create policy gutscheine_pflegen on public.gutscheine
  for all to authenticated
  using (public.plattform_rolle() in ('owner','admin','finanzen'))
  with check (public.plattform_rolle() in ('owner','admin','finanzen'));
comment on table public.gutscheine is
  'Gutscheine des Betreibers; der Stripe-Coupon ist das Abbild, dies das Original.';

create table if not exists public.gutschein_einloesungen (
  id            uuid primary key default gen_random_uuid(),
  gutschein_code text not null references public.gutscheine(code) on delete cascade,
  mandant_id    uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  eingeloest_am timestamptz not null default now(),
  stripe_ref    text,
  notiz         text,
  unique (gutschein_code, mandant_id)
);
create index if not exists gutschein_einloesungen_mandant_idx on public.gutschein_einloesungen (mandant_id);
alter table public.gutschein_einloesungen enable row level security;
create policy gutschein_einloesungen_lesen on public.gutschein_einloesungen
  for select to authenticated
  using (mandant_id = public.aktuelle_mandant_id() or public.ist_plattform_admin());
create policy "mandant_trennung" on public.gutschein_einloesungen
  as restrictive for all to authenticated
  using (mandant_id = public.aktuelle_mandant_id() or public.ist_plattform_admin())
  with check (mandant_id = public.aktuelle_mandant_id());
create policy "mandant_trennung_loeschen" on public.gutschein_einloesungen
  as restrictive for delete to authenticated using (false);

-- --- 2. Funktionsschalter ----------------------------------------------------
create table if not exists public.plattform_features (
  schluessel   text primary key,
  name         text not null,
  beschreibung text,
  standard_an  boolean not null default true,
  sortierung   integer not null default 0
);
create table if not exists public.tarif_features (
  tarif    text not null references public.plattform_tarife(schluessel) on delete cascade,
  feature  text not null references public.plattform_features(schluessel) on delete cascade,
  primary key (tarif, feature)
);
create table if not exists public.mandant_features (
  mandant_id uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  feature    text not null references public.plattform_features(schluessel) on delete cascade,
  an         boolean not null default true,
  bis        timestamptz,
  notiz      text,
  primary key (mandant_id, feature)
);
create index if not exists mandant_features_mandant_idx on public.mandant_features (mandant_id);
alter table public.plattform_features enable row level security;
alter table public.tarif_features enable row level security;
alter table public.mandant_features enable row level security;
-- Die Liste der Funktionen und die Tarifzuordnung sind Katalog: jeder
-- Angemeldete darf sie lesen (die Preisseite zeigt, was ein Tarif kann).
create policy plattform_features_lesen on public.plattform_features for select to authenticated using (true);
create policy plattform_features_pflegen on public.plattform_features for all to authenticated
  using (public.plattform_rolle() in ('owner','admin')) with check (public.plattform_rolle() in ('owner','admin'));
create policy tarif_features_lesen on public.tarif_features for select to authenticated using (true);
create policy tarif_features_pflegen on public.tarif_features for all to authenticated
  using (public.plattform_rolle() in ('owner','admin')) with check (public.plattform_rolle() in ('owner','admin'));
create policy mandant_features_lesen on public.mandant_features for select to authenticated
  using (mandant_id = public.aktuelle_mandant_id() or public.ist_plattform_admin());
create policy "mandant_trennung" on public.mandant_features
  as restrictive for all to authenticated
  using (mandant_id = public.aktuelle_mandant_id() or public.ist_plattform_admin())
  with check (mandant_id = public.aktuelle_mandant_id());
create policy "mandant_trennung_loeschen" on public.mandant_features
  as restrictive for delete to authenticated using (false);

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('gutscheine', 'GLOBAL', 'Gutscheine des Betreibers; Katalog'),
  ('gutschein_einloesungen', 'MANDANT', 'Einloesung eines Gutscheins durch ein Haus'),
  ('plattform_features', 'GLOBAL', 'Liste der Funktionsschalter; Katalog'),
  ('tarif_features', 'GLOBAL', 'Funktionen je Tarif; Katalog'),
  ('mandant_features', 'MANDANT', 'Ausnahmen je Haus; das Haus liest seine, der Betreiber alle')
on conflict (tabelle) do update set gruppe = excluded.gruppe, grund = excluded.grund;

-- Die Funktionen, die es heute gibt. Alles an, was die Vorlage kann —
-- Phase 9: keine Verhaltensaenderung. Nur der Claude-Connector ist neu und
-- ab Professional (Auftrag, Abschnitt 12).
insert into public.plattform_features (schluessel, name, beschreibung, standard_an, sortierung) values
  ('ki_text',       'KI-Texte',            'Exposé-Texte, Korrekturen, Mailvorschläge',            true,  10),
  ('ki_bild',       'Bild-KI',             'Homestaging, Retusche, Web-Varianten',                 true,  20),
  ('social',        'Social aus dem Objekt','Beitrag, Karussell und Story aus den Objektdaten',    true,  30),
  ('portalexport',  'Portalexport',        'OpenImmo, Immowelt, Kleinanzeigen',                   true,  40),
  ('signatur',      'E-Signatur',          'Einfache elektronische Signatur',                      true,  50),
  ('kundenportal',  'Kundenportal',        'Neubau-Kundenportal',                                  true,  60),
  ('akquise',       'Akquise',             'Eigentümer-Leads, Pipeline, Automationen',             true,  70),
  ('mcp_connector', 'Claude-Connector (MCP)','Zugriff aus Claude auf die eigenen Objektdaten',    false, 80)
on conflict (schluessel) do nothing;
insert into public.tarif_features (tarif, feature)
select t.schluessel, 'mcp_connector' from public.plattform_tarife t
 where t.schluessel in ('professional', 'enterprise', 'business') and not t.ist_zusatznutzer
on conflict do nothing;

-- --- 3. Die Entscheidung --------------------------------------------------------
create or replace function public.hat_feature(p_schluessel text, p_mandant uuid default null)
 returns boolean
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  m uuid := coalesce(p_mandant, public.aktuelle_mandant_id());
  r record;
  t text;
begin
  -- Ein fremder Mandant nur fuer Betreiber.
  if p_mandant is not null and auth.uid() is not null
     and p_mandant <> public.aktuelle_mandant_id() and public.plattform_rolle() is null then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  select * into r from public.plattform_features f where f.schluessel = p_schluessel;
  if not found then return false; end if;           -- unbekannt = aus, nie an
  if m is not null then
    -- 1. Ausnahme des Hauses, solange sie gilt.
    perform 1 from public.mandant_features x where x.mandant_id = m and x.feature = p_schluessel
       and (x.bis is null or x.bis > now());
    if found then
      return (select x.an from public.mandant_features x where x.mandant_id = m and x.feature = p_schluessel);
    end if;
    -- 2. Der Tarif schaltet an, was standardmaessig aus ist.
    select a.tarif into t from public.mandant_abo a where a.mandant_id = m;
    if t is not null and exists (select 1 from public.tarif_features tf where tf.tarif = t and tf.feature = p_schluessel) then
      return true;
    end if;
  end if;
  -- 3. Standard.
  return r.standard_an;
end
$function$;
comment on function public.hat_feature(text, uuid) is
  'Darf dieses Haus diese Funktion? Reihenfolge: Ausnahme des Hauses (befristbar), Tarif, Standard. '
  'Unbekannte Schluessel sind aus. Die Anwendung zeigt gesperrte Module mit Upgrade-Hinweis, nicht gar nicht.';
revoke all on function public.hat_feature(text, uuid) from public, anon;
grant execute on function public.hat_feature(text, uuid) to authenticated;

create or replace function public.meine_features()
 returns table (schluessel text, name text, an boolean, standard_an boolean)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select f.schluessel, f.name, public.hat_feature(f.schluessel), f.standard_an
    from public.plattform_features f order by f.sortierung;
$function$;
comment on function public.meine_features() is 'Alle Funktionsschalter mit dem Stand fuer das eigene Haus — einmal beim Start geladen.';
revoke all on function public.meine_features() from public, anon;
grant execute on function public.meine_features() to authenticated;
