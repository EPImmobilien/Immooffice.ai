-- Abgleich mit der Vorlage: Sicht und Trigger vom 26.09.2026
--
-- Eine neue Sicht, zehn neue Trigger. Nichts geaendert, nichts ueberzaehlig.
-- Kein Kennzeichen der Referenz enthalten.

-- ------------------------------------------------------------------- Sicht
-- Fasst zusammen, wer ein Expose tatsaechlich abgerufen hat — aus dem eigenen
-- Portal (expose_freigaben) und aus onOffice (onoffice_expose_versand).
-- expose_abgerufen() und expose_nachfass_aufgaben() bauen darauf auf.
create or replace view public.expose_abgerufen_schluessel as
 select lower(trim(both from expose_freigaben.email)) as email,
    expose_freigaben.kontakt_id,
    expose_freigaben.immobilie_id,
    coalesce(expose_freigaben.letzter_download_am, expose_freigaben.bestaetigt_am) as abgerufen_am,
    'portal'::text as quelle
   from expose_freigaben
  where ((expose_freigaben.bestaetigt_am is not null) or (coalesce(expose_freigaben.downloads, 0) > 0) or (expose_freigaben.letzter_download_am is not null))
union all
 select lower(trim(both from onoffice_expose_versand.email)) as email,
    onoffice_expose_versand.kontakt_id,
    onoffice_expose_versand.immobilie_id,
    coalesce(onoffice_expose_versand.heruntergeladen_am, onoffice_expose_versand.bestaetigt_am) as abgerufen_am,
    'onoffice'::text as quelle
   from onoffice_expose_versand
  where ((onoffice_expose_versand.bestaetigt_am is not null) or (onoffice_expose_versand.heruntergeladen_am is not null));

-- ----------------------------------------------------------------- Trigger
create trigger kontakte_eigentuemer_kontakt_aufraeumen before delete on public.kontakte for each row execute function termine_eigentuemer_kontakt_aufraeumen();
create trigger trg_expose_freigabe_geloescht after delete on public.expose_freigaben for each row execute function expose_freigabe_geloescht();
create trigger trg_expose_nachfass_erledigen after update of bestaetigt_am on public.expose_freigaben for each row execute function expose_nachfass_erledigen();
create trigger trg_immobilie_datei_freigabe_sync after update of interessenten_freigabe on public.immobilie_datei for each row execute function immobilie_datei_freigabe_sync();
create trigger trg_immobilie_datei_loeschung_merken after delete on public.immobilie_datei for each row execute function immobilie_datei_loeschung_merken();
create trigger trg_immobilie_wissen_freigabe_sync after insert or update of interessenten_freigabe, quelle_ref on public.immobilie_wissen for each row execute function immobilie_wissen_freigabe_sync();
create trigger trg_oev_nachfass after update on public.onoffice_expose_versand for each row execute function oev_nachfass_erledigen();
create trigger trg_projekt_nachricht_gelesen_glocke after update of gelesen on public.projekt_nachrichten for each row execute function projekt_nachricht_gelesen_glocke();
create trigger trg_projekt_nachricht_glocke after insert on public.projekt_nachrichten for each row execute function projekt_nachricht_glocke();
create trigger trg_projekt_zugaenge_touch before update on public.projekt_zugaenge for each row execute function projekt_zugaenge_touch();
