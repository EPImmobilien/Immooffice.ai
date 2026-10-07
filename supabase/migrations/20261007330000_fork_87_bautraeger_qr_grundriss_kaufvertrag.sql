-- ===========================================================================
-- fork_87 — Bautraeger-Paket v3: QR-Unterlagen, Grundriss-Markierung,
--           Kaufvertrag, Hinweise fuer die Gewerke
-- ===========================================================================
-- Nachtrag des Auftraggebers vom 07.10.2026 zum Bautraeger-Paket:
--
--   * Der QR-Code an der Tuer zeigt OHNE Anmeldung die Unterlagen und
--     Hinweise, die der Bautraeger fuer die Gewerke freigibt — einseitig,
--     kein Chat. projekt_dateien.qr_sichtbar sagt, welche Datei das ist;
--     projekte.qr_hinweis und projekt_einheiten.qr_hinweis tragen den Text.
--     Personenbezogenes bleibt draussen: eine Datei mit zugang_id
--     (persoenliche Kaeuferdatei) kann nicht qr_sichtbar sein.
--   * Jeder Mangel kann eine Stelle im Grundriss der Einheit haben
--     (grundriss_position {x, y} als Anteil 0–1). Der Grundriss selbst
--     liegt in projekt_einheiten.grundriss_datei (Spalte der Vorlage, bisher
--     ungenutzt). Der Maengelplan ist fuer die Gewerke; ins Kaeufer-PDF
--     kommt er nicht.
--   * Kaufvertrag je Einheit: Datei, ausgelesene Daten (Vorschlag der KI,
--     im Formular bestaetigt) und die vereinbarten Sonderleistungen als
--     Liste, die in Akte und Abnahme sichtbar bleibt.
--
-- RUECKNAHME: alter table … drop column der sechs Spalten; delete from
-- plattform_credit_preise where aktion = 'kaufvertrag_lesen'.
-- ===========================================================================
alter table public.projekt_dateien add column if not exists qr_sichtbar boolean not null default false;
alter table public.projekt_dateien drop constraint if exists projekt_dateien_qr_nicht_persoenlich;
alter table public.projekt_dateien add constraint projekt_dateien_qr_nicht_persoenlich
  check (not qr_sichtbar or zugang_id is null);
comment on column public.projekt_dateien.qr_sichtbar is 'Ueber den QR-Code an der Tuer ohne Anmeldung abrufbar (fuer die Gewerke). Nie fuer persoenliche Kaeuferdateien.';
create index if not exists projekt_dateien_qr_idx on public.projekt_dateien (projekt_id) where qr_sichtbar;

alter table public.projekte add column if not exists qr_hinweis text;
alter table public.projekt_einheiten
  add column if not exists qr_hinweis        text,
  add column if not exists kaufvertrag_datei text,
  add column if not exists kaufvertrag_daten jsonb,
  add column if not exists sonderleistungen  jsonb not null default '[]'::jsonb;
comment on column public.projekt_einheiten.kaufvertrag_daten is 'Vom Kaufvertrag ausgelesen und im Formular bestaetigt: kaufpreis, uebergabe_bis, raten[], notar, urkunde … — Vorschlag der KI, nie ungeprueft.';
comment on column public.projekt_einheiten.sonderleistungen is 'Vereinbarte Sonderleistungen/Sonderwuensche aus dem Kaufvertrag: [{text, erledigt, quelle}]. Bleibt in Akte und Abnahme sichtbar, damit nichts untergeht.';
alter table public.projekt_einheiten drop constraint if exists projekt_einheiten_sonderleistungen_check;
alter table public.projekt_einheiten add constraint projekt_einheiten_sonderleistungen_check check (jsonb_typeof(sonderleistungen) = 'array');

alter table public.projekt_maengel add column if not exists grundriss_position jsonb;
comment on column public.projekt_maengel.grundriss_position is 'Stelle im Grundriss der Einheit: {"x": 0–1, "y": 0–1}. Nur fuer Gewerke und Verwaltung; nicht im Kaeufer-Protokoll.';

insert into public.plattform_credit_preise (aktion, name, credits, beschreibung, sortierung, aktiv)
values ('kaufvertrag_lesen', 'Kaufvertrag auslesen', 3, 'Liest Kaufpreis, Zahlungsplan, Uebergabe und vereinbarte Sonderleistungen aus dem Kaufvertrag (PDF) und schlaegt sie fuer die Wohnungsakte vor', 92, true)
on conflict (aktion) do nothing;
insert into public.plattform_ki_einstellungen (funktion, name, anbieter, modell)
values ('kaufvertrag_lesen', 'Kaufvertrag auslesen', 'anthropic', 'claude-sonnet-4-6')
on conflict (funktion) do nothing;
