-- Abgleich mit der Vorlage: Cron-Jobs vom 26.09.2026
--
-- Zehn neue Jobs in der Vorlage, neun davon werden uebernommen.
-- jotform-sync-5min bleibt aussen vor: Phase 1.4 des Auftrags streicht den
-- Formular-Sync des Referenzunternehmens ersatzlos, und in
-- 20260915001000_vorlage_cron.sql steht er aus demselben Grund nicht.
--
-- Die 27 bereits vorhandenen Jobs sehen im Vergleich anders aus, sind es aber
-- nicht: der Export vom 14.09. hat die Kommandos in eine Zeile gebracht und die
-- Kopfzeilen, in denen der anon-Key der Vorlage im Klartext als JSON-Literal
-- stand, auf jsonb_build_object mit Vault-Abfrage umgestellt. Inhaltlich ist
-- keiner der 27 Jobs geaendert; nachgeprueft durch Normalisieren beider Seiten
-- (URL und Authorization-Wert durch Platzhalter ersetzt) und Vergleich.
--
-- Wie beim Export: Projekt-URL und anon-Key kommen aus dem Vault. Die Jobs
-- laufen zunaechst fuer eine Firma, wie in der Vorlage; die Iteration ueber
-- alle Firmen ist Aufgabe von Phase 2.4.

-- Zwei Jobs rufen nur eine Datenbankfunktion auf, ohne Edge Function.
select cron.schedule('expose-nachfass-taeglich', '0 6 * * *', $$select public.expose_nachfass_aufgaben();$$);
select cron.schedule('kontakte-zustaendig-abgleich', '25 3,9,15,21 * * *', $$select public.kontakte_zustaendig_abgleichen()$$);

select cron.schedule('eigentuemer-einladung-nachfassen-taeglich', '10 7 * * *', $$select net.http_post(url := public.eigene_funktions_url('eigentuemer-einladung-nachfassen'), body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), timeout_milliseconds := 60000);$$);
select cron.schedule('landing-fragen-5min', '*/5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('objekt-landing'), headers := jsonb_build_object('Content-Type', 'application/json', 'x-diagnose-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'diagnose_secret')), body := '{"aktion":"fragen_buendeln"}'::jsonb, timeout_milliseconds := 60000)$$);
select cron.schedule('onoffice-adressen-kontakte-30min', '8,38 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-adressen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"kontakte"}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('onoffice-adressen-neu-30min', '5,35 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-adressen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"sync","letzte":300}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('onoffice-adressen-sync-c', '15 3 * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-adressen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"sync","offset":4000,"seiten":20}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('onoffice-adressen-sync-d', '18 3 * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-adressen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"sync","offset":6000,"seiten":20}'::jsonb, timeout_milliseconds := 120000);$$);

-- Dieser Job schickt bewusst keinen Authorization-Kopf: die Funktion
-- onoffice-expose-abgleich laeuft in der Vorlage ohne JWT-Pruefung.
-- Vermerkt in docs/OFFEN.md, weil ein offener Endpunkt geprueft werden muss.
select cron.schedule('onoffice-expose-abgleich-2h', '20,50 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-expose-abgleich'), body := '{"tage":21,"limit":250}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 150000);$$);
