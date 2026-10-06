-- ===========================================================================
-- fork_45 — Exposé-Sofortversand
--
-- Ansage des Betreibers vom 06.10.2026: „wir müssen auf jeden Fall den
-- Exposé-Sofortversand reinnehmen … für diesen Sofortversand muss eine
-- E-Mail-Adresse hinterlegt sein … da geht's ja darum, dass die Kunden
-- quasi 24/7 auf die Dateien zugreifen können."
--
-- WAS ES SCHON GAB, und was deshalb NICHT neu gebaut wird:
--
--   * expose_freigaben — Freigabe-Token, Provisionstext, Bestätigung,
--     Download-Zähler, Erinnerung. Der Link ist rund um die Uhr erreichbar;
--     das ist genau der 24/7-Zugriff.
--   * mail-anfrage-verarbeiten — erkennt Portal- und Website-Anfragen,
--     ordnet Objekt und Kontakt zu.
--   * mail-senden — versendet über das Postfach des Mandanten.
--
-- Was fehlte, ist die VERKETTUNG: Anfrage erkannt → Freigabe angelegt →
-- Mail raus, ohne dass jemand zusieht. Genau das ist der Sofortversand.
-- „Verkettete Arbeitsschritte statt Insellösungen" ist eines der sechs
-- Architektur-Grundprinzipien aus CLAUDE.md.
--
-- WARUM EIN LINK UND NICHT DAS PDF IM ANHANG (bei Provision):
-- Der Provisionshinweis muss den Käufer in Textform erreichen, und die
-- Vorlage löst das über die Bestätigungsseite am Freigabe-Link. Ein Exposé
-- als blanker Anhang umgeht diese Bestätigung. Bei Mietobjekten gilt das
-- Bestellerprinzip (§ 2 WoVermRG) und es gibt keine Provision — dort ist der
-- Anhang zulässig und auch das, was die Vorlage schon tut. Diese Grenze zieht
-- die Funktion selbst; einstellbar ist sie NICHT.
-- Kein Rechtsrat: die Textform-Pflicht nach § 656a BGB bleibt in der
-- Verantwortung des Mandanten, und die Musterformulierungen sind
-- ungeprüft.
--
-- ZWEI TABELLEN, EINE DAVON NEU:
--   portal_einstellungen.schluessel = 'expose_sofortversand'  (vorhanden)
--   expose_sofortversand                                      (neu, Protokoll)
--
-- Das Protokoll ist nicht Zierde. Es ist die Sperre gegen Doppelversand:
-- dieselbe Adresse bekommt zum selben Objekt nicht zweimal am Tag dieselbe
-- Mail, auch wenn ein Portal die Anfrage zweimal zustellt. Und es ist der
-- Nachweis, WARUM in einem Fall nichts hinausging — ohne ihn ist ein
-- stiller Nicht-Versand nicht von einem Fehler zu unterscheiden.
-- ===========================================================================

create table if not exists public.expose_sofortversand (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid references public.mandanten(id) on delete cascade,
  immobilie_id    uuid not null references public.immobilien(id) on delete cascade,
  kontakt_id      uuid references public.kontakte(id) on delete set null,
  email           text not null,
  freigabe_id     uuid references public.expose_freigaben(id) on delete set null,
  mail_eingang_id uuid references public.mail_eingang(id) on delete set null,
  -- gesendet      — Mail ist raus
  -- uebersprungen — bewusst nichts getan, Grund steht daneben
  -- fehler        — es sollte etwas hinausgehen und ging nicht
  status          text not null,
  grund           text,
  -- link | anhang — siehe Kopfkommentar
  weg             text,
  -- anfrage | web-lead | hand
  ausgeloest_von  text,
  created_at      timestamptz not null default now(),
  constraint expose_sofortversand_status_check
    check (status in ('gesendet', 'uebersprungen', 'fehler')),
  constraint expose_sofortversand_weg_check
    check (weg is null or weg in ('link', 'anhang'))
);

-- Jede Tabelle der Gruppe MANDANT bekommt einen Index auf mandant_id
-- (tests/mandant-einstufung.sql besteht darauf): die RLS-Richtlinie filtert
-- bei JEDEM Zugriff darauf, und ein Filter ohne Index ist ein vollständiger
-- Durchlauf.
create index if not exists expose_sofortversand_mandant_idx
  on public.expose_sofortversand (mandant_id);

-- Die Sperre gegen Doppelversand fragt genau so: gab es zu diesem Objekt an
-- diese Adresse in den letzten N Stunden schon etwas?
create index if not exists expose_sofortversand_sperre_idx
  on public.expose_sofortversand (immobilie_id, email, created_at desc);

-- Das Tageslimit fragt nach Mandant und Zeit.
create index if not exists expose_sofortversand_tag_idx
  on public.expose_sofortversand (mandant_id, created_at desc)
  where status = 'gesendet';

comment on table public.expose_sofortversand is
  'Protokoll des Exposé-Sofortversands: was an wen zu welchem Objekt ging — '
  'und warum in einem Fall nichts hinausging. Sperrt den Doppelversand und '
  'trägt das Tageslimit.';

alter table public.expose_sofortversand enable row level security;

-- Lesen darf, wer im Haus ist; schreiben tut nur die Funktion mit dem
-- Dienstschlüssel. Ein Protokoll, das der Protokollierte ändern kann, ist
-- kein Protokoll.
drop policy if exists "expose_sofortversand_lesen" on public.expose_sofortversand;
create policy "expose_sofortversand_lesen" on public.expose_sofortversand
  for select to authenticated
  using (true);

drop policy if exists "mandant_trennung" on public.expose_sofortversand;
create policy "mandant_trennung" on public.expose_sofortversand
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

alter table public.expose_sofortversand
  alter column mandant_id set default public.aktuelle_mandant_id();

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('expose_sofortversand', 'MANDANT',
        'Protokoll des Exposé-Sofortversands je Mandant; Sperre gegen Doppelversand und Tageslimit')
on conflict (tabelle) do nothing;
