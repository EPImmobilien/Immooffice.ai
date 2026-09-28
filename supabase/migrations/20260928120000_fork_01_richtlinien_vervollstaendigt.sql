-- ===========================================================================
-- Fork-eigene Migration 01 — die acht Tabellen ohne Richtlinie
--
-- Diese Datei stammt NICHT aus scripts/neutralisieren.py. Fork-eigene
-- Migrationen tragen den Vorsatz `fork_` und eine laufende Nummer; der
-- Generator schreibt nur seine eigenen Dateinamen und fasst sie nicht an.
--
-- Ausgangslage: 187 Tabellen in public, RLS ueberall an, acht davon ohne
-- jede Richtlinie. RLS an plus keine Richtlinie heisst: fuer normale Nutzer
-- vollstaendig gesperrt, fuer service_role offen. Das ist kein Versehen,
-- sondern fuer sieben dieser acht der richtige Zustand — sie werden
-- ausschliesslich von Edge Functions beschrieben.
--
-- Der Auftrag verlangt "die Tabellen ohne Richtlinie bekommen Richtlinien".
-- Woertlich befolgt hiesse das, sieben Tueren zu oeffnen, an die niemand
-- klopft. Geprueft wurde, wer jede Tabelle tatsaechlich anspricht:
--
--   amt_vorlage                         Oberflaeche: ja   -> Richtlinie
--   eigentuemer_benachrichtigung_queue  nur Edge Function -> bleibt zu
--   immobilie_datei_geloescht           nur Edge Function -> bleibt zu
--   onoffice_expose_pruefung            nur Edge Function -> bleibt zu
--   waechter_status                     nur Edge Function -> bleibt zu
--   ea_accounts, ea_events, ea_orders   niemand           -> bleibt zu
--
-- Begruendet in docs/ENTSCHEIDUNGEN.md, Eintrag vom 28.09.2026.
-- ===========================================================================

-- --- amt_vorlage: Vorlagen fuer Unterlagen-Anforderungen bei Aemtern -------
-- Ein Katalog, kein Mandantendatensatz: Betreff, Text und benoetigte Anlagen
-- je Unterlagentyp. Das Team liest ihn, der Chef pflegt ihn.
create policy "amt_vorlage_team_liest" on public.amt_vorlage
  for select to authenticated using (public.ist_team());

create policy "amt_vorlage_chef_pflegt" on public.amt_vorlage
  for all to authenticated using (public.ist_chef()) with check (public.ist_chef());

-- --- Die sieben Dienst-Tabellen: Absicht sichtbar machen -------------------
-- Ohne Vermerk sieht "RLS an, keine Richtlinie" aus wie ein vergessener
-- Schritt. Der Vermerk steht in der Datenbank und nicht nur in einer Datei,
-- damit ihn auch findet, wer das Schema und nicht das Repository liest.
comment on table public.eigentuemer_benachrichtigung_queue is
  'Nur service_role. RLS an, keine Richtlinie ist Absicht: schreibt und liest '
  'ausschliesslich die Edge Function eigentuemer-benachrichtigungen-versenden.';
comment on table public.immobilie_datei_geloescht is
  'Nur service_role. RLS an, keine Richtlinie ist Absicht: Merkliste geloeschter '
  'Dateien fuer den onOffice-Abgleich.';
comment on table public.onoffice_expose_pruefung is
  'Nur service_role. RLS an, keine Richtlinie ist Absicht: Merkliste des '
  'onOffice-Expose-Abgleichs.';
comment on table public.waechter_status is
  'Nur service_role. RLS an, keine Richtlinie ist Absicht: Zustand des '
  'Waechters ueber die Hintergrundjobs.';
comment on table public.ea_accounts is
  'Nur service_role, derzeit von niemandem benutzt. Rest einer Anbindung an '
  'einen Energieausweis-Anbieter. RLS an, keine Richtlinie ist Absicht.';
comment on table public.ea_events is
  'Nur service_role, derzeit von niemandem benutzt. Siehe ea_accounts.';
comment on table public.ea_orders is
  'Nur service_role, derzeit von niemandem benutzt. Siehe ea_accounts.';

-- --- Nachtrag: aktuelle_rolle() bekommt einen festen search_path ----------
-- Sie ist SECURITY DEFINER und lief als einzige der drei Rollen-Helfer ohne
-- festgenagelten Suchpfad. Wer in einem frueher durchsuchten Schema eine
-- eigene Tabelle "profiles" anlegen kann, entscheidet sonst mit, was die
-- Funktion zurueckgibt — und damit, was jede Richtlinie erlaubt, die sie
-- aufruft. ist_chef() und ist_team() machen es seit jeher richtig.
create or replace function public.aktuelle_rolle()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select role from public.profiles where id = auth.uid()
$function$;
