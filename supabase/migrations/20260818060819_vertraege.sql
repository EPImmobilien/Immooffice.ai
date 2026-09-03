-- Vertraege mit einfacher elektronischer Signatur.
--
-- Drei rechtliche Vorgaben bestimmen den Aufbau:
--
--   Die Signatur ist eine EINFACHE elektronische Signatur nach Artikel 3
--   Nummer 10 eIDAS. Sie wird nirgends als fortgeschritten oder qualifiziert
--   bezeichnet. Fuer die Textform nach § 126b BGB genuegt sie — und § 656a BGB
--   verlangt fuer Maklervertraege ueber Wohnungen und Einfamilienhaeuser mit
--   Verbrauchern ausdruecklich Textform, nicht Schriftform.
--
--   Das Widerrufsrecht wird mitgefuehrt, nicht bloss erwaehnt. Ohne
--   ordnungsgemaesse Belehrung erlischt es erst nach zwoelf Monaten und
--   vierzehn Tagen (§ 356 Absatz 3 Satz 2 BGB).
--
--   Ein Vertragsmuster wird nie als rechtssicher bezeichnet.
--
-- Der Unterschriftsweg ist bewusst wie beim Web-Exposé gebaut: ein Token, eine
-- Datenbankfunktion fuer den Zugriff ohne Anmeldung, keine Lesepolicy fuer
-- `anon`. Eine vom Makler selbst angeklickte Unterschrift waere keine — die
-- Gegenseite muss selbst unterzeichnen.

create type public.vertragsart as enum (
  'maklervertrag', 'reservierungsvereinbarung', 'besichtigungsprotokoll',
  'uebergabeprotokoll', 'widerrufsbelehrung', 'sonstiges'
);

create type public.vertragsstatus as enum (
  'entwurf', 'versendet', 'unterzeichnet', 'widerrufen', 'abgelehnt'
);

create table public.vertraege (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,

  objekt_id uuid references public.objekte(id) on delete set null,
  kontakt_id uuid references public.kontakte(id) on delete set null,

  art public.vertragsart not null default 'maklervertrag',
  titel text not null check (length(trim(titel)) between 1 and 200),
  inhalt text not null default '',

  status public.vertragsstatus not null default 'entwurf',

  -- Token fuer den Unterschriftslink. Erst beim Versenden vergeben; ein
  -- Entwurf soll gar keinen erreichbaren Link haben.
  token text unique check (token is null or token ~ '^[a-z0-9]{16,64}$'),
  versendet_am timestamptz,

  -- Fuer das Widerrufsrecht. `verbraucher` ist die Einschaetzung des Maklers
  -- und keine Ableitung: Ob jemand als Verbraucher handelt, haengt am Zweck des
  -- Geschaefts und nicht an einer Eigenschaft im Datensatz.
  verbraucher boolean not null default true,
  geschlossen_am date,
  belehrt_am date,
  widerrufen_am timestamptz,

  -- Unterzeichnungen mit Name, Zeitpunkt und Fingerabdruck des Textes.
  unterzeichnungen jsonb not null default '[]'::jsonb,

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create index vertraege_mandant_idx on public.vertraege(mandant_id, erstellt_am desc);
create index vertraege_objekt_idx on public.vertraege(objekt_id);
create index vertraege_kontakt_idx on public.vertraege(kontakt_id);

comment on table public.vertraege is
  'Vertraege mit einfacher elektronischer Signatur (Art. 3 Nr. 10 eIDAS). Keine qualifizierte Signatur.';
comment on column public.vertraege.verbraucher is
  'Einschaetzung des Maklers, nicht abgeleitet: Verbrauchereigenschaft haengt am Zweck des Geschaefts.';
comment on column public.vertraege.unterzeichnungen is
  'Name, E-Mail, Zeitpunkt und Fingerabdruck des Textes je Unterschrift.';

create trigger vertraege_geaendert before update on public.vertraege
  for each row execute function intern.setze_geaendert_am();

create trigger vertraege_mandantenrein
  before insert or update on public.vertraege
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte', 'kontakt_id', 'kontakte');

/**
 * Ein unterzeichneter Vertrag ist kein Entwurf mehr.
 *
 * Der Text wird nach der ersten Unterschrift gesperrt. Ohne diese Sperre
 * stuende eine Unterschrift unter einem anderen Text, als der Unterzeichner
 * gesehen hat — der Fingerabdruck wuerde die Abweichung zwar anzeigen, aber
 * erst hinterher.
 */
create or replace function intern.vertrag_text_schuetzen()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if jsonb_array_length(old.unterzeichnungen) > 0
     and new.inhalt is distinct from old.inhalt then
    raise exception 'Der Vertragstext kann nach der ersten Unterschrift nicht mehr geaendert werden.';
  end if;
  return new;
end; $$;

create trigger vertraege_text_schuetzen
  before update on public.vertraege
  for each row execute function intern.vertrag_text_schuetzen();

alter table public.vertraege enable row level security;

create policy vertraege_lesen on public.vertraege
  for select using (mandant_id = intern.aktueller_mandant());
create policy vertraege_schreiben on public.vertraege
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Unterschrift ohne Anmeldung -------------------------------------------
--
-- Wie beim Web-Exposé: eine einzige Funktion statt einer Lesepolicy fuer
-- `anon`. So ist genau festgelegt, welche Felder nach aussen gelangen — die
-- Mandantenzuordnung, interne Vermerke und die uebrigen Vertraege des Kunden
-- gehoeren nicht dazu.

create or replace function public.vertrag_oeffnen(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v public.vertraege;
begin
  select * into v from public.vertraege
   where token = p_token and status in ('versendet', 'unterzeichnet');

  if not found then
    return jsonb_build_object('zustand', 'unbekannt');
  end if;

  return jsonb_build_object(
    'zustand', 'ok',
    'titel', v.titel,
    'art', v.art,
    'inhalt', v.inhalt,
    'status', v.status,
    'bereits_unterzeichnet', jsonb_array_length(v.unterzeichnungen) > 0,
    'anbieter', (
      select jsonb_build_object(
               'firmenname', m.firmenname,
               'strasse', m.strasse,
               'hausnummer', m.hausnummer,
               'plz', m.plz,
               'ort', m.ort,
               'telefon', m.telefon,
               'email', m.email,
               'impressum', m.impressum,
               'widerrufsbelehrung', m.widerrufsbelehrung
             )
        from public.mandant_branding m where m.mandant_id = v.mandant_id
    )
  );
end; $$;

grant execute on function public.vertrag_oeffnen(text) to anon, authenticated;

/**
 * Nimmt eine Unterschrift entgegen.
 *
 * Der Fingerabdruck wird HIER gebildet und nicht vom Aufrufer uebernommen:
 * Ein vom Browser mitgeschickter Hash waere die Behauptung des Unterzeichners
 * darueber, was er gesehen hat — und damit wertlos als Nachweis.
 */
create or replace function public.vertrag_unterzeichnen(
  p_token text, p_name text, p_email text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v public.vertraege;
  v_hash text;
begin
  select * into v from public.vertraege
   where token = p_token and status = 'versendet';

  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;

  if p_name is null or btrim(p_name) = ''
     or p_email is null
     or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'grund', 'eingabe');
  end if;

  v_hash := encode(extensions.digest(btrim(v.inhalt), 'sha256'), 'hex');

  update public.vertraege
     set unterzeichnungen = unterzeichnungen || jsonb_build_object(
           'name', btrim(p_name),
           'email', lower(btrim(p_email)),
           'unterzeichnet_am', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'dokument_hash', v_hash
         ),
         status = 'unterzeichnet',
         geschlossen_am = coalesce(geschlossen_am, current_date)
   where id = v.id;

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.vertrag_unterzeichnen(text, text, text)
  to anon, authenticated;
