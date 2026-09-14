-- Cron-Jobs der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: 70-cron.sql
--
-- 33 Jobs (jotform-sync entfaellt nach Phase 1.4). Projekt-URL und
-- anon-Key kommen aus dem Vault — in der Vorlage stehen sie im Klartext
-- im Job-Kommando, und ein Schluessel im Repository ist nicht zulaessig.
-- Die Jobs laufen zunaechst fuer eine Firma, wie in der Vorlage. Die
-- Iteration ueber alle Firmen ist Aufgabe von Phase 2.4.


-- Cron-Jobs der Vorlage, 34 Stueck.
--
-- WICHTIG: In der Vorlage steht der anon-Key des Projekts im Klartext im
-- Job-Kommando. Hier ist er durch <ANON_KEY> ersetzt — ein fremder Schluessel
-- gehoert nicht auf diese Platte und erst recht nicht ins Repository.
-- Fuer den Fork wird der Schluessel aus dem Vault gelesen; die Vorlage macht
-- das bei 'diagnose_secret' schon selbst, es ist also kein neues Verhalten.
--
-- Zwei Jobs sind inaktiv (active = false): news-briefing-taeglich und
-- onoffice-waechter-60min.
-- Zwei Jobs haben einen unbrauchbaren Schluessel: news-briefing-taeglich traegt
-- den Platzhalter 'DEIN_ECHTER_ANON_KEY', jotform-sync-5min einen Schluessel,
-- der mit 'Hy' statt 'ey' beginnt und damit kein gueltiges JWT ist. Beide
-- Jobs koennen in der Vorlage nicht durchlaufen. Vermerkt in docs/OFFEN.md.
--
-- Entfaellt nach Phase 1.4 des Auftrags: jotform-sync-5min.
-- Alle Jobs der Vorlage laufen fuer genau eine Firma. Nach Phase 2.4 muessen
-- sie ueber alle Firmen iterieren; das ist Aufgabe der Phase, nicht dieses
-- Exports.

select cron.schedule('akq-automation-10min', '5,15,25,35,45,55 * * * *', $$select net.http_post(url := public.eigene_funktions_url('akq-automation-lauf'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := jsonb_build_object('aktion','ausfuehren','limit',50), timeout_milliseconds := 150000);$$);
select cron.schedule('akq-mail-leads-20min', '8,28,48 * * * *', $$select net.http_post(url := public.eigene_funktions_url('akq-mail-leads'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := jsonb_build_object('tage',7,'limit',10), timeout_milliseconds := 150000);$$);
select cron.schedule('besichtigung-nachfassen-taeglich', '30 5 * * *', $$select net.http_post(url := public.eigene_funktions_url('besichtigung-nachfassen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"tage":3}'::jsonb, timeout_milliseconds := 150000);$$);
select cron.schedule('cron-logs-aufraeumen', '0 3 * * *', $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$);
select cron.schedule('eigentuemer-benachrichtigungen-versenden', '*/5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('eigentuemer-benachrichtigungen-versenden'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{}'::jsonb)$$);
select cron.schedule('expose-erinnerung-stuendlich', '15 * * * *', $$select net.http_post(url := public.eigene_funktions_url('expose-erinnerung'), body := '{"stunden":48,"limit":20}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), timeout_milliseconds := 60000);$$);
select cron.schedule('fehler-protokoll-aufraeumen', '20 4 * * *', $$select public.fehler_protokoll_aufraeumen()$$);
-- entfaellt (Phase 1.4): jotform-sync-5min, '*/5 * * * *', jotform-poll
select cron.schedule('mail-abwesenheit-5min', '*/5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('mail-abwesenheit-verarbeiten'), body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), timeout_milliseconds := 60000);$$);
select cron.schedule('mail-anfragen-5min', '*/5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('mail-anfrage-verarbeiten'), body := '{"modus":"batch","limit":8}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), timeout_milliseconds := 120000);$$);
select cron.schedule('mail-postfach-pull-5min', '*/5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('mail-postfach-pull'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{}'::jsonb, timeout_milliseconds := 55000);$$);
select cron.schedule('mail-rechnungen-10min', '*/10 * * * *', $$select net.http_post(url := public.eigene_funktions_url('mail-rechnung-weiterleiten'), body := '{"modus":"batch","limit":15}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), timeout_milliseconds := 150000);$$);
-- inaktiv in der Vorlage (active = false), Schluessel ist ein Platzhalter
select cron.schedule('news-briefing-taeglich', '30 4 * * *', $$select net.http_post(url := public.eigene_funktions_url('news-briefing-erstellen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := jsonb_build_object());$$);
update cron.job set active = false where jobname = 'news-briefing-taeglich';
select cron.schedule('onoffice-adressen-kontakte', '20 3 * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-adressen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"kontakte"}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('onoffice-adressen-sync-a', '0 3 * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-adressen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"sync","offset":0,"seiten":20}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('onoffice-adressen-sync-b', '10 3 * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-adressen'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"sync","offset":2000,"seiten":20}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('onoffice-import-bilder-10min', '7,17,27,37,47,57 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-import'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"bilder","limit":10}'::jsonb, timeout_milliseconds := 150000)$$);
select cron.schedule('onoffice-import-objekte-10min', '4,14,24,34,44,54 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-import'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"objekte"}'::jsonb, timeout_milliseconds := 150000)$$);
select cron.schedule('onoffice-suchkriterien-naechtlich', '40 3 * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-suchkriterien'), headers := jsonb_build_object('Content-Type', 'application/json', 'x-diagnose-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'diagnose_secret')), body := '{"modus":"import"}'::jsonb, timeout_milliseconds := 120000)$$);
select cron.schedule('onoffice-sync-10min', '0,10,20,30,40,50 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-sync'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{}'::jsonb, timeout_milliseconds := 150000)$$);
select cron.schedule('onoffice-termine-sync-10min', '2,12,22,32,42,52 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-termine-sync'), body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), timeout_milliseconds := 150000)$$);
-- inaktiv in der Vorlage (active = false)
select cron.schedule('onoffice-waechter-60min', '20 * * * *', $$select net.http_post(url := public.eigene_funktions_url('onoffice-waechter'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{}'::jsonb, timeout_milliseconds := 150000)$$);
update cron.job set active = false where jobname = 'onoffice-waechter-60min';
select cron.schedule('projekt-aktivitaeten-aufraeumen', '20 3 * * *', $$delete from projekt_aktivitaeten where created_at < now() - interval '90 days'$$);
select cron.schedule('projekt-datei-benachrichtigung', '*/5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('projekt-datei-benachrichtigung'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{}'::jsonb)$$);
select cron.schedule('push-log-aufraeumen', '10 3 * * *', $$delete from public.push_log where gesendet_am < now() - interval '30 days'$$);
select cron.schedule('push-termin-erinnerungen-5min', '*/5 * * * *', $$select public.push_termin_erinnerungen_senden()$$);
select cron.schedule('suchkriterien-abgleich-15min', '3,18,33,48 * * * *', $$select public.suchkriterien_abgleich_lauf()$$);
select cron.schedule('suchkriterien-newsletter-montags', '30 6 * * 1', $$select net.http_post(url := public.eigene_funktions_url('suchkriterien-newsletter'), headers := jsonb_build_object('Content-Type', 'application/json', 'x-diagnose-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'diagnose_secret')), body := '{}'::jsonb, timeout_milliseconds := 120000)$$);
select cron.schedule('suchkriterien-pflege-taeglich', '10 6 * * *', $$select public.suchkriterien_pflege()$$);
select cron.schedule('termin-erinnerung-stuendlich', '5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('termin-erinnerung'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('termin-fahrzeit-taeglich', '45 4 * * *', $$select net.http_post(url := public.eigene_funktions_url('termin-fahrzeit'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := jsonb_build_object('nachtragen', true, 'tage', 28, 'limit', 15), timeout_milliseconds := 150000);$$);
select cron.schedule('upload-benachrichtigung-versenden', '*/5 * * * *', $$select net.http_post(url := public.eigene_funktions_url('upload-benachrichtigung-versenden'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{}'::jsonb)$$);
select cron.schedule('urlaub-hinweise-maerz', '0 6 1 3 *', $$select net.http_post(url := public.eigene_funktions_url('urlaub-hinweise'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"uebertrag"}'::jsonb, timeout_milliseconds := 60000);$$);
select cron.schedule('urlaub-hinweise-november', '0 6 1 11 *', $$select net.http_post(url := public.eigene_funktions_url('urlaub-hinweise'), headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')), body := '{"modus":"jahresende"}'::jsonb, timeout_milliseconds := 60000);$$);
