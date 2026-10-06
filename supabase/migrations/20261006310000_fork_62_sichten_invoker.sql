-- ===========================================================================
-- fork_62 — fünf Sichten hoben die Mandantentrennung auf
-- ===========================================================================
-- Gefunden am 06.10.2026 mit dem Sicherheitsberater von Supabase, nicht von
-- einem eigenen Gate. Das ist der eigentliche Befund: `tests/mandant.sql`,
-- `tests/mandant-rundumschlag.sql` und `tests/rechte.sql` prüfen TABELLEN.
-- Sichten hat keiner von ihnen angesehen.
--
-- ---------------------------------------------------------------------------
-- WAS OFFEN STAND
--
-- In PostgreSQL läuft eine Sicht ohne `security_invoker` mit den Rechten
-- ihres EIGNERS. Eigner ist hier `postgres`, und `postgres` ist Eigner der
-- zugrundeliegenden Tabellen. Ein Tabelleneigner ist von Row-Level-Security
-- befreit, solange `force row level security` aus ist — und es ist aus.
--
-- Die restriktive Richtlinie `mandant_trennung` galt für diese fünf Wege
-- also nicht. Dazu kommt, dass `anon` auf jeder dieser Sichten SELECT,
-- INSERT, UPDATE und DELETE hatte (Supabase vergibt das als Vorgabe auf
-- alles in `public`), und dass zwei der Sichten von PostgreSQL als
-- schreibbar eingestuft werden — `is_updatable`/`is_insertable_into` = YES:
--
--   public.akq_mpe_uebersicht   -> bewertungen      LESEN UND SCHREIBEN
--   public.radar_uebersicht     -> radar_objekte    LESEN UND SCHREIBEN
--   public.expose_abgerufen_schluessel -> E-Mail-Adressen von Interessenten
--   public.mail_ki_kosten_monatlich    -> KI-Kosten je Nutzer
--   public.v_plz_aemter                -> Behördenadressen (keine Mandantendaten)
--
-- Mit dem öffentlichen anon-Schlüssel allein — er steht im Browser jeder
-- Auslieferung, er ist kein Geheimnis — war damit über `/rest/v1/` der
-- Akquise-Bestand JEDES Mandanten lesbar, samt Anschrift, Preis, Courtage
-- und den Telefonnummern und E-Mail-Adressen privater Verkäufer. Und
-- schreibbar.
--
-- CLAUDE.md, Abschnitt Sicherheit: „Kein Zugriff über Frontend, API, Suche,
-- Exporte, Storage-Pfade oder erratbare IDs auf fremde Mandanten."
--
-- ---------------------------------------------------------------------------
-- WAS SICH ÄNDERT
--
-- 1. `security_invoker = true` auf jeder Sicht in `public`. Damit gelten die
--    Richtlinien des FRAGENDEN, nicht die des Eigners. Das allein schliesst
--    das Loch: `anon` hat dann trotz aller Rechte keine Zeile, weil
--    `aktuelle_mandant_id()` für ihn null ist.
-- 2. Trotzdem zusätzlich die Rechte: `anon` bekommt nichts, `authenticated`
--    nur SELECT. Eine Sicht ist keine Schreibschnittstelle, und zwei Riegel
--    sind hier billig.
--
-- Die Oberfläche merkt davon nichts: sie liest `akq_mpe_uebersicht` und
-- `expose_abgerufen_schluessel` als angemeldeter Nutzer, und die
-- Basistabellen erlauben dem Team des eigenen Mandanten genau das. Die
-- GLOBAL-Tabellen hinter `v_plz_aemter` (plz_region, amt_adressen,
-- amt_zusaetzliche_regionen) haben je eine erlaubende Leserichtlinie für
-- `authenticated`.
--
-- Absichtlich über ALLE Sichten in `public` und nicht über eine Liste von
-- fünf: die nächste Sicht entsteht sonst wieder mit den Rechten des Eigners.
-- Dass es dabei bleibt, prüft `tests/sichten.sql` bei jedem Commit.
-- ===========================================================================

do $$
declare s record;
begin
  for s in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
     order by c.relname
  loop
    execute format('alter view public.%I set (security_invoker = true)', s.relname);
    execute format('revoke all on public.%I from anon', s.relname);
    execute format('revoke all on public.%I from authenticated', s.relname);
    execute format('grant select on public.%I to authenticated', s.relname);
    raise notice 'Sicht public.% auf security_invoker gestellt.', s.relname;
  end loop;
end $$;
