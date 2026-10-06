-- ===========================================================================
-- fork_63 — anon durfte 147 Funktionen aufrufen, davon 100 als SECURITY DEFINER
-- ===========================================================================
-- Zweiter Befund derselben Runde wie fork_62, und der schwerere.
--
-- Supabase vergibt als Vorgabe `EXECUTE` auf alles in `public` an `PUBLIC`,
-- und PostgREST macht jede Funktion in `public` als `/rest/v1/rpc/<name>`
-- erreichbar. `anon` konnte damit 147 der 153 Funktionen aufrufen — 100
-- davon als SECURITY DEFINER, also mit den Rechten des Eigners und ohne
-- Row-Level-Security.
--
-- Fünf davon prüfen überhaupt nichts und verändern Geld:
--
--   credits_gutschreiben(mandant, quelle, credits, gueltig_bis, referenz)
--   credits_tarif_zuteilen(mandant, von, bis)
--   credits_buchen(vorgang, kosten, notiz)
--   credits_freigeben(vorgang, grund)
--   gruender_platz_vergeben(mandant)
--
-- Mit dem öffentlichen anon-Schlüssel — er steht im Browser jeder
-- Auslieferung — und einer Mandantenkennung hätte sich jeder beliebig viele
-- Credits gutschreiben können. Das ist nicht „eine Lücke in der Tiefe",
-- das ist die Kasse ohne Tür.
--
-- ---------------------------------------------------------------------------
-- WAS SICH ÄNDERT
--
-- Nachgesehen, wer welche Funktion wirklich ruft:
--   * Die anon-Seiten (freigabe.html, objekt.html, sonnenverlauf.html,
--     unterlagen.html, die Website) rufen **keine einzige** RPC. Nachgezählt
--     am 06.10.2026. `anon` braucht also nichts.
--   * Die Anwendung ruft 28 RPCs als angemeldeter Nutzer.
--   * Die Edge Functions rufen 23 mit dem Dienstschlüssel.
--
-- Deshalb:
--   1. `EXECUTE` von `PUBLIC` und von `anon` zurückgenommen — für jede
--      Funktion in `public`. Nicht für eine Liste: die nächste Funktion
--      entsteht sonst wieder offen.
--   2. `EXECUTE` ausdrücklich an `authenticated` und `service_role` gegeben.
--      Das ändert nichts am Zustand von vorher — über `PUBLIC` hatten beide
--      es ohnehin —, aber es steht jetzt da, statt aus einer Vorgabe zu
--      folgen.
--   3. Und `authenticated` verliert die acht, die nur der Dienstschlüssel
--      rufen darf: die fünf Geldfunktionen oben, `credits_reservieren`
--      (sie nimmt Mandant und Nutzer als Parameter) und die beiden
--      Geheimnis-Prüfer `diagnose_secret_pruefen` und
--      `intern_secret_pruefen`.
--
-- Trigger sind davon nicht betroffen: PostgreSQL prüft `EXECUTE` beim
-- Auslösen eines Triggers nicht.
--
-- Geprüft von `tests/funktionsrechte.sql` bei jedem Commit.
-- ===========================================================================

-- --- 1. + 2. Alle Funktionen in public --------------------------------------
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public' and p.prokind = 'f'
     order by 1
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    n := n + 1;
  end loop;
  raise notice 'Funktionsrechte neu gesetzt: % Funktionen in public.', n;
end $$;

-- --- 3. Nur der Dienstschlüssel ---------------------------------------------
-- Die Namen stehen hier ausgeschrieben und nicht in einem Muster: wer eine
-- Funktion dieser Gruppe hinzufügt, soll sie hinschreiben müssen.
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public' and p.prokind = 'f'
       and p.proname in (
         -- verändern Credits oder Gründerplätze, ohne den Aufrufer zu prüfen
         'credits_gutschreiben', 'credits_tarif_zuteilen', 'credits_buchen',
         'credits_freigeben', 'credits_reservieren', 'gruender_platz_vergeben',
         -- Orakel für ein Geheimnis: ein angemeldeter Nutzer hat dort
         -- nichts zu fragen
         'diagnose_secret_pruefen', 'intern_secret_pruefen')
     order by 1
  loop
    execute format('revoke all on function %s from authenticated', f.sig);
    n := n + 1;
  end loop;
  raise notice 'Nur noch Dienstschluessel: % Funktionen.', n;
end $$;
