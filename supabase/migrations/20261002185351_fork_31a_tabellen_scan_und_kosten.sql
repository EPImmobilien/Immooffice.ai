-- ===========================================================================
-- Fork-eigene Migration 31a — Tabellen fuer Aufmass, Grundriss-KI, Kosten,
-- Punktwolken-Diagnose und Scan-Ablage (Stufen 118–126 der Vorlage)
--
-- Die Vorlage hat am 29.09. und 02.10.2026 vierzig Stufen nachgelegt (siehe
-- docs/ENTSCHEIDUNGEN.md, "Abgleich mit der Vorlage"). Ihr Export enthaelt
-- nur die OBERFLAECHE — acht Tabellen, zwei Datenbankfunktionen und ein
-- Eimer, die diese Oberflaeche braucht, fehlten deshalb.
--
-- WOHER DIE SPALTEN KOMMEN: aus der Oberflaeche selbst. Jede ihrer Abfragen
-- nennt die Spalten, die sie liest, jedes insert die, die sie schreibt. Was
-- hier steht, ist daraus abgeleitet, nicht erfunden. Wo die Oberflaeche
-- nichts sagt (etwa ob ein Feld eine Pflichtangabe ist), gilt die
-- vorsichtige Annahme: nullable.
--
-- MANDANTENFAEHIG VON ANFANG AN: die Tabellen der Vorlage mussten in fork_04
-- bis fork_07 nachtraeglich eine Mandantenspalte und eine restriktive
-- Richtlinie bekommen. Diese acht bekommen beides sofort.
--
-- In sechs Teilen (31a–31f) angewendet, weil das Werkzeug fuer eine
-- Migration dieser Laenge in die Zeitsperre lief.
-- ===========================================================================

-- Stufe 123: Raumscan mit Feinvermessung aus der App. Je Objekt eine Zeile je
-- Raum (umfang 'einzel') und eine fuer das Ganze (umfang 'gesamt').
create table if not exists public.aufmass_scan (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  immobilie_id uuid not null references public.immobilien(id) on delete cascade,
  geschoss    text not null default 'EG',
  raum        text,
  umfang      text not null default 'einzel',
  titel       text,
  -- Das Messergebnis der App, unveraendert wie geliefert. Welche Felder sie
  -- mitschickt, entscheidet die App, nicht diese Tabelle.
  ergebnis    jsonb,
  created_at  timestamptz not null default now(),
  constraint aufmass_scan_umfang_check check (umfang in ('einzel', 'gesamt')),
  constraint aufmass_scan_gesamt_ohne_raum check (umfang <> 'gesamt' or raum is null)
);
create index if not exists aufmass_scan_immobilie_idx on public.aufmass_scan (immobilie_id);
create index if not exists aufmass_scan_mandant_idx on public.aufmass_scan (mandant_id);
create unique index if not exists aufmass_scan_gesamt_uniq
  on public.aufmass_scan (immobilie_id, geschoss) where umfang = 'gesamt';

-- Stufe 118: ein alter Grundriss wird per KI ausgelesen. Die Oberflaeche
-- startet den Auftrag ueber die Edge Function grundriss-ki-lesen und fragt
-- danach diese Tabelle ab, bis status nicht mehr 'laeuft' ist. Deshalb
-- fortschritt und dauer_ms: der Nutzer sieht, dass etwas passiert.
create table if not exists public.grundriss_ki_auftraege (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  immobilie_id uuid references public.immobilien(id) on delete set null,
  ersteller_id uuid references public.profiles(id) on delete set null,
  status       text not null default 'laeuft',
  fortschritt  text,
  ergebnis     jsonb,
  fehler       text,
  dauer_ms     integer,
  created_at   timestamptz not null default now(),
  fertig_am    timestamptz,
  constraint grundriss_ki_status_check check (status in ('laeuft', 'fertig', 'fehler', 'abgebrochen'))
);
create index if not exists grundriss_ki_mandant_idx on public.grundriss_ki_auftraege (mandant_id);
create index if not exists grundriss_ki_immobilie_idx on public.grundriss_ki_auftraege (immobilie_id);

-- Stufe 121: feste Kosten und Kosten nach Nutzung, vom Chef pflegbar.
--   art 'fix'     -> betrag je abrechnung ('monatlich' | 'jaehrlich')
--   art 'nutzung' -> messgroesse x preis_je_einheit, Menge der letzten
--                    30 Tage aus public.admin_kosten_messwerte()
create table if not exists public.kosten_posten (
  id               uuid primary key default gen_random_uuid(),
  mandant_id       uuid not null references public.mandanten(id) on delete cascade,
  bezeichnung      text not null default 'Neuer Kostenposten',
  kategorie        text not null default 'sonstiges',
  art              text not null default 'fix',
  betrag           numeric(12,2) default 0,
  abrechnung       text default 'monatlich',
  messgroesse      text,
  einheit          text,
  preis_je_einheit numeric(12,4) default 0,
  -- Nur gesetzt, wenn der Posten zu einem Portalzugang gehoert: die
  -- Oberflaeche vermeidet damit Doppelzaehlung mit
  -- portal_zugaenge.kosten_monat.
  portal           text,
  aktiv            boolean not null default true,
  sortierung       integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint kosten_posten_art_check check (art in ('fix', 'nutzung')),
  constraint kosten_posten_abrechnung_check
    check (abrechnung is null or abrechnung in ('monatlich', 'jaehrlich')),
  constraint kosten_posten_kategorie_check
    check (kategorie in ('plattform', 'ki', 'mail', 'portal', 'geraete', 'sonstiges'))
);
create index if not exists kosten_posten_mandant_idx on public.kosten_posten (mandant_id);

-- Stufe 124/139: scheitert die Wanderkennung auf einer Wolke, legt die
-- Oberflaeche einen Diagnosesatz ab, damit der Fall nachvollziehbar bleibt.
create table if not exists public.punktwolke_diagnose (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  ersteller_id uuid references public.profiles(id) on delete set null,
  name         text not null default 'Punktwolke',
  datei        text,
  inhalt       jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists punktwolke_diagnose_mandant_idx on public.punktwolke_diagnose (mandant_id);

-- Stufe 125: Punktwolken und Scans, die die App hochlaedt — auch OHNE Objekt.
-- Deshalb ist immobilie_id nullable: der Nutzer ordnet sie spaeter zu, und
-- die Oberflaeche sucht mit .is("immobilie_id", null) genau danach.
create table if not exists public.scan_ablage (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  immobilie_id uuid references public.immobilien(id) on delete set null,
  ersteller_id uuid references public.profiles(id) on delete set null,
  art          text not null,
  titel        text,
  dateiname    text,
  storage_path text,
  -- Mehrteilige Scans: {name: pfad, …}. Leer, wenn alles in storage_path liegt.
  dateien      jsonb not null default '{}'::jsonb,
  mime_type    text,
  size_bytes   bigint,
  punkte       bigint,
  info         jsonb,
  -- Woher der Scan kommt. Die Oberflaeche wertet das aus: Apps bis Build 27
  -- haben frueher aufgehoert zu messen, und der Hinweis dazu haengt hieran.
  geraet       text,
  created_at   timestamptz not null default now(),
  constraint scan_ablage_art_check check (art in ('punktwolke', 'raumscan', 'aufmass', 'sonstiges'))
);
create index if not exists scan_ablage_mandant_idx on public.scan_ablage (mandant_id);
create index if not exists scan_ablage_immobilie_idx on public.scan_ablage (immobilie_id);
create index if not exists scan_ablage_art_idx on public.scan_ablage (art);
