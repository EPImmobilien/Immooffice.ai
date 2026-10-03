-- ===========================================================================
-- Fork-eigene Migration 31l — zwei Cron-Jobs fuer die eigenen Funktionen
--
-- 1) unterlagen-link, Aktion "melden"
--    Wer einen Download-Link verschickt, kann "Benachrichtigen" ankreuzen.
--    Die Meldung geht nicht beim Abruf raus, sondern gebuendelt: ein Abruf
--    mit zehn Dateien soll nicht zehn Mails erzeugen. Der Zweig "melden"
--    sammelt die offenen Abrufe ein und verschickt sie je Mandant.
--    Alle fuenf Minuten, wie die uebrigen Sammelversender der Vorlage.
--
--    Der Job schickt den anon-Key als Authorization-Kopf — so machen es alle
--    Jobs der Vorlage. Die Funktion laeuft ohne JWT-Pruefung (config.toml),
--    und "melden" braucht kein Konto: es gibt dort keinen Aufrufer, dessen
--    Mandant zaehlt, sondern eine Warteschlange, deren Eintraege ihren
--    Mandanten selbst mitbringen.
--
-- 2) Waechter fuer grundriss-ki-lesen
--    CLAUDE.md, Architektur-Grundprinzipien: "Hintergrundjobs mit Waechter".
--    Der KI-Lauf arbeitet nach der Antwort im Hintergrund weiter
--    (EdgeRuntime.waitUntil) und schreibt jeden Ausgang in seine
--    Auftragszeile, auch den Fehler. Wird die Laufzeitumgebung mitten darin
--    beendet, kommt dieses Schreiben nicht mehr zustande: die Zeile bliebe
--    auf "laeuft" stehen, und in der Oberflaeche dreht sich der Kreis, bis
--    sie nach sieben Minuten aufgibt — ohne dass je ein Grund in der
--    Datenbank stuende.
--
--    Der Waechter braucht dafuer keine Edge Function. Er ist eine einzige
--    Anweisung, laeuft als Datenbankfunktion ueber alle Mandanten (das ist
--    seine Aufgabe) und ruehrt nur an, was nach zwoelf Minuten noch laeuft —
--    die Funktion selbst bricht nach knapp fuenf Minuten ab.
-- ===========================================================================

create or replace function public.grundriss_ki_waechter()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  betroffen integer;
begin
  update public.grundriss_ki_auftraege
     set status    = 'fehler',
         fehler    = 'Der Lauf wurde abgebrochen, ohne ein Ergebnis zu hinterlassen. Bitte erneut versuchen.',
         fertig_am = now()
   where status = 'laeuft'
     and created_at < now() - interval '12 minutes';
  get diagnostics betroffen = row_count;
  return betroffen;
end;
$$;

comment on function public.grundriss_ki_waechter() is
  'Waechter fuer grundriss-ki-lesen: setzt Auftraege, die nach zwoelf Minuten noch laufen, auf fehler. Ohne ihn bleibt ein abgebrochener Hintergrundlauf fuer immer auf laeuft stehen.';

revoke all on function public.grundriss_ki_waechter() from public;
revoke all on function public.grundriss_ki_waechter() from anon;
revoke all on function public.grundriss_ki_waechter() from authenticated;

select cron.schedule(
  'unterlagen-link-melden-5min', '*/5 * * * *',
  $$select net.http_post(
      url := public.eigene_funktions_url('unterlagen-link'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
      body := '{"aktion":"melden"}'::jsonb,
      timeout_milliseconds := 60000);$$);

select cron.schedule(
  'grundriss-ki-waechter-5min', '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  $$select public.grundriss_ki_waechter()$$);
