-- ===========================================================================
-- ImmoOffice.ai — Connector-Rahmen: Integrationen, Zuordnungen, Sync-Laeufe
--
-- docs/AUTONOMIE.md Abschnitt 5.1. Entscheidung E-2026-09-03-10 (Verschluesselung).
--
-- Die Zugangsdaten eines Fremdsystems liegen verschluesselt in EINER Spalte.
-- Der Schluessel liegt ausschliesslich im Server (VERSCHLUESSELUNG_SCHLUESSEL);
-- die Datenbank sieht nur Geheimtext. Zusaetzlich ist die Spalte fuer
-- angemeldete Benutzer nicht lesbar — nur die Dienstrolle, die den Abgleich
-- ausfuehrt, kommt an sie heran.
-- ===========================================================================

create type public.sync_richtung as enum ('holen', 'senden', 'beide');
create type public.integration_status as enum ('neu', 'aktiv', 'fehler', 'pausiert');
create type public.sync_status as enum ('laeuft', 'fertig', 'fehler', 'abgebrochen');

-- ---------------------------------------------------------------------------
-- Integrationen
-- ---------------------------------------------------------------------------

create table public.integrationen (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  -- Schluessel des Connectors aus src/integrationen/kern/registry.ts. Die
  -- Liste hier ist bewusst eng: Ein Anbieter, den die Anwendung nicht kennt,
  -- darf auch nicht gespeichert werden.
  anbieter     text not null check (anbieter in ('openimmo', 'onoffice', 'propstack', 'flowfact')),
  bezeichnung  text not null check (length(trim(bezeichnung)) between 1 and 120),

  -- Format v1.<iv>.<tag>.<geheimtext>, siehe src/integrationen/kern/zugangsdaten.ts.
  -- Null bei Connectoren ohne Anmeldung (OpenImmo-Datei).
  zugangsdaten_verschluesselt text
    check (zugangsdaten_verschluesselt is null
           or zugangsdaten_verschluesselt ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$'),

  -- Nicht geheime Einstellungen: Feldauswahl, Filter, Anbieternummer.
  konfig       jsonb not null default '{}'::jsonb,
  richtung     public.sync_richtung not null default 'holen',
  intervall    text not null default 'manuell'
    check (intervall in ('manuell', '15min', 'stuendlich', 'taeglich')),

  status          public.integration_status not null default 'neu',
  letzter_sync_am timestamptz,
  -- Letzte Fehlermeldung in Nutzersprache. Nie Zugangsdaten, nie Rohantworten.
  fehler_text     text,

  erstellt_von uuid references auth.users(id) on delete set null,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create index integrationen_mandant_idx on public.integrationen(mandant_id);

comment on table public.integrationen is
  'Verbindungen zu Fremdsystemen (CRM, OpenImmo). Zugangsdaten nur verschluesselt; Spalte fuer Benutzer nicht lesbar.';

create trigger integrationen_geaendert
  before update on public.integrationen
  for each row execute function intern.setze_geaendert_am();

alter table public.integrationen enable row level security;

create policy integrationen_lesen on public.integrationen
  for select using (mandant_id = intern.aktueller_mandant());

create policy integrationen_schreiben on public.integrationen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

-- Spaltenrechte: Die verschluesselten Zugangsdaten sind fuer Benutzer NICHT
-- lesbar, auch nicht fuer die Verwaltung. Schreiben (anlegen, ersetzen) ja —
-- zurueckholen nein. Postgres addiert Spaltenrechte zu Tabellenrechten;
-- deshalb erst das Tabellenrecht entziehen und dann die uebrigen Spalten
-- einzeln freigeben.
revoke select on public.integrationen from anon, authenticated;
grant select (
  id, mandant_id, anbieter, bezeichnung, konfig, richtung, intervall,
  status, letzter_sync_am, fehler_text, erstellt_von, erstellt_am, geaendert_am
) on public.integrationen to authenticated;

-- ---------------------------------------------------------------------------
-- Zuordnungen: lokale ID <-> fremde ID, je Typ
--
-- Verhindert Dubletten beim wiederholten Holen und erlaubt „letzte Aenderung
-- gewinnt" beim beidseitigen Abgleich.
-- ---------------------------------------------------------------------------

create table public.integration_mappings (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid not null references public.integrationen(id) on delete cascade,
  -- Redundant zur Integration, aber noetig fuer einfache und schnelle
  -- RLS-Policies. Der Trigger unten haelt beide Werte zusammen.
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  typ             text not null check (typ in ('objekt', 'kontakt', 'termin', 'bild', 'dokument')),
  lokal_id        uuid not null,
  fremd_id        text not null check (length(fremd_id) between 1 and 200),
  letzte_aenderung_lokal timestamptz,
  letzte_aenderung_fremd timestamptz,
  erstellt_am     timestamptz not null default now(),

  unique (integration_id, typ, fremd_id),
  unique (integration_id, typ, lokal_id)
);

create index integration_mappings_mandant_idx on public.integration_mappings(mandant_id);

alter table public.integration_mappings enable row level security;

create policy integration_mappings_lesen on public.integration_mappings
  for select using (mandant_id = intern.aktueller_mandant());

create policy integration_mappings_schreiben on public.integration_mappings
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

-- ---------------------------------------------------------------------------
-- Sync-Laeufe: Protokoll je Durchlauf
-- ---------------------------------------------------------------------------

create table public.sync_laeufe (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrationen(id) on delete cascade,
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  richtung       public.sync_richtung not null,
  ausloeser      text not null default 'manuell'
    check (ausloeser in ('manuell', 'zeitplan', 'rueckruf')),
  ausgeloest_von uuid references auth.users(id) on delete set null,

  status         public.sync_status not null default 'laeuft',
  gestartet_am   timestamptz not null default now(),
  beendet_am     timestamptz,

  angelegt       integer not null default 0 check (angelegt >= 0),
  geaendert      integer not null default 0 check (geaendert >= 0),
  uebersprungen  integer not null default 0 check (uebersprungen >= 0),
  -- Fehlerliste je Datensatz: [{fremd_id, typ, meldung}]. Ein fehlerhafter
  -- Datensatz stoppt den Lauf nicht (Abschnitt 5.3).
  fehler         jsonb not null default '[]'::jsonb,
  -- Konflikte beim beidseitigen Abgleich, die manuell zu pruefen sind.
  konflikte      jsonb not null default '[]'::jsonb
);

create index sync_laeufe_integration_idx on public.sync_laeufe(integration_id, gestartet_am desc);
create index sync_laeufe_mandant_idx on public.sync_laeufe(mandant_id);

alter table public.sync_laeufe enable row level security;

create policy sync_laeufe_lesen on public.sync_laeufe
  for select using (mandant_id = intern.aktueller_mandant());

create policy sync_laeufe_schreiben on public.sync_laeufe
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

-- ---------------------------------------------------------------------------
-- Mandantenreinheit: mandant_id der Kindtabellen muss zur Integration passen
-- ---------------------------------------------------------------------------

create or replace function intern.integration_mandant_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid;
begin
  select mandant_id into v_mandant from public.integrationen where id = new.integration_id;
  if v_mandant is null then
    raise exception 'Integration nicht gefunden.';
  end if;
  if new.mandant_id <> v_mandant then
    raise exception 'Der Datensatz gehoert zu einem anderen Mandanten als die Integration.';
  end if;
  return new;
end;
$$;

create trigger integration_mappings_mandant_pruefen
  before insert or update on public.integration_mappings
  for each row execute function intern.integration_mandant_pruefen();

create trigger sync_laeufe_mandant_pruefen
  before insert or update on public.sync_laeufe
  for each row execute function intern.integration_mandant_pruefen();
