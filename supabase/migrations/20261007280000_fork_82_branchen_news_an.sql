-- ===========================================================================
-- fork_82 — Branchen-News laufen täglich
-- ===========================================================================
-- Der Job `news-briefing-taeglich` kam aus der Vorlage inaktiv mit (dort trug
-- er einen Platzhalter statt eines Schlüssels, docs/OFFEN.md). Die Vorlage-
-- Migration hat den Schlüssel schon auf den Vault-Eintrag `anon_key`
-- umgestellt, den Job aber aus Vorsicht ausgeschaltet gelassen. Die Kachel
-- „Branchen-News" blieb dadurch leer, und die Website verspricht sie.
--
-- `news-briefing-erstellen` schreibt je Mandant eine Zeile
-- (mandant_id, briefing_datum) und bricht ab, wenn es für heute schon eine
-- gibt — ein doppelter Aufruf kostet keine KI.
--
-- 04:30 UTC = 06:30 Berlin (Sommer) / 05:30 (Winter).
--
-- Rücknahme: select cron.alter_job(jobid, active := false) für diesen Job.
-- ===========================================================================

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'news-briefing-taeglich';
  if v_job is null then
    perform cron.schedule('news-briefing-taeglich', '30 4 * * *',
      $cron$select net.http_post(
        url := public.eigene_funktions_url('news-briefing-erstellen'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
        body := jsonb_build_object(),
        timeout_milliseconds := 120000);$cron$);
  else
    perform cron.alter_job(v_job, active := true);
  end if;
end $$;
