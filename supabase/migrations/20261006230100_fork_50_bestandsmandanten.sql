-- ===========================================================================
-- fork_50 — Bestandsmandanten bekommen einen definierten Abrechnungsstand
-- ===========================================================================
-- fork_47 hat die Abrechnung eingeführt, fork_49 hängt sie an die KI-Aufrufe.
-- Dazwischen klafft eine Lücke, die beim Nachsehen im laufenden Projekt
-- aufgefallen ist und die beim Ausrollen zu einer Sperre geworden wäre:
--
-- Mandanten, die VOR fork_47 entstanden sind, haben keine Zeile in
-- `mandant_abo` und bei `mandanten.testphase_bis` steht nichts. `abo_zugriff`
-- liest daraus folgerichtig „gesperrt" — und `credits.ts` lässt einen
-- gesperrten Mandanten nicht an die KI. Zwei Nutzer eines Hauses hätten von
-- einem Tag auf den anderen keine KI mehr gehabt, ohne dass jemand etwas
-- gekündigt hätte.
--
-- Diese Migration tut deshalb für die Bestandsmandanten genau das, was
-- `registrierung_abschliessen` für neue tut: Testphase ab jetzt, Abo-Zeile
-- mit Status `test`, Testcredits einmalig. Alle Werte kommen aus
-- `plattform_werte`, keiner steht hier.
--
-- Sie ist **additiv**: sie kann Zugriff nur erweitern, nie einschränken.
-- Mandanten, die schon eine Abo-Zeile haben, bleibt sie fern. Und sie ist
-- wiederholbar — `credits_gutschreiben` ist über die Referenz idempotent,
-- die Testphase wird nur gesetzt, wo keine steht.
-- ===========================================================================

do $$
declare
  m         record;
  v_tage    integer;
  v_credits integer;
  v_lese    integer;
  v_bis     timestamptz;
  v_anzahl  integer := 0;
begin
  select coalesce((select wert::text::integer from public.plattform_werte
                    where schluessel = 'testphase_tage'), 28) into v_tage;
  select coalesce((select wert::text::integer from public.plattform_werte
                    where schluessel = 'testphase_credits'), 300) into v_credits;
  select coalesce((select wert::text::integer from public.plattform_werte
                    where schluessel = 'lesezugriff_tage'), 30) into v_lese;

  for m in
    select * from public.mandanten
     where not exists (select 1 from public.mandant_abo a where a.mandant_id = mandanten.id)
  loop
    -- Wo schon eine Testphase läuft, bleibt sie stehen. Sie zu verlängern
    -- wäre ein Geschenk, das niemand beschlossen hat.
    v_bis := coalesce(m.testphase_bis, now() + (v_tage || ' days')::interval);

    if m.testphase_bis is null then
      update public.mandanten set testphase_bis = v_bis where id = m.id;
    end if;

    insert into public.mandant_abo (mandant_id, tarif, intervall, status, lesezugriff_bis)
      values (m.id, 'starter', 'monat', 'test',
              v_bis + (v_lese || ' days')::interval)
      on conflict (mandant_id) do nothing;

    if v_credits > 0 then
      perform public.credits_gutschreiben(m.id, 'test', v_credits, v_bis,
                                          'test:' || m.id::text);
    end if;

    v_anzahl := v_anzahl + 1;
  end loop;

  raise notice 'fork_50: % Bestandsmandant(en) auf Testphase gesetzt.', v_anzahl;
end
$$;
