-- Funktionen der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: 30-funktionen-01..06.sql
--
-- 84 Funktionen, woertlich uebernommen; die drei Stellen mit Marken- oder
-- Projektverweis sind ersetzt (siehe scripts/neutralisieren.py).
-- check_function_bodies ist aus, weil sich die Funktionen gegenseitig
-- aufrufen und alphabetische Reihenfolge das nicht garantiert — genau so
-- macht es auch pg_dump.


set check_function_bodies = off;

-- Hilfsfunktion des Forks, nicht aus der Vorlage.
--
-- In der Vorlage steht die Projekt-URL in jedem net.http_post fest im Code.
-- Fuer den Fork liest sie diese Funktion aus dem Vault. Damit steht kein
-- Projektverweis im Repository, und ein Umzug des Projekts kostet einen
-- Vault-Eintrag statt eine Migration.
create or replace function public.eigene_funktions_url(name text)
returns text language sql stable security definer set search_path to ''
as $function$
  select rtrim(coalesce(
           (select decrypted_secret from vault.decrypted_secrets where name = 'projekt_url'),
           ''), '/') || '/functions/v1/' || name;
$function$;

CREATE OR REPLACE FUNCTION public.akq_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin new.updated_at = now(); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.aktivitaets_log_cleanup()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  removed int;
begin
  delete from public.aktivitaets_log
  where created_at < now() - interval '12 months';
  get diagnostics removed = row_count;
  return removed;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.aktuelle_rolle()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select role from public.profiles where id = auth.uid()
$function$
;
CREATE OR REPLACE FUNCTION public.aktueller_eigentuemer_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT eigentuemer_id
       FROM public.eigentuemer_personen
      WHERE user_id = auth.uid()
        AND aktiv = true
      LIMIT 1),
    (SELECT id
       FROM public.eigentuemer
      WHERE user_id = auth.uid()
      LIMIT 1)
  )
$function$
;
CREATE OR REPLACE FUNCTION public.aktueller_user_ist_chef()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'chef'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.arbeitszeit_tage_stempel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.checkliste_aus_vorlage_kopieren(p_vorlage_id uuid, p_maklervertrag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.checkliste_items
    (maklervertrag_id, sortierung, titel, beschreibung, passende_kategorie, pflicht)
  select
    p_maklervertrag_id, sortierung, titel, beschreibung, passende_kategorie, pflicht
  from public.checkliste_vorlagen_items
  where vorlage_id = p_vorlage_id
    and not exists (
      select 1 from public.checkliste_items
       where maklervertrag_id = p_maklervertrag_id
    );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.dashboard_warnungen()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  befunde jsonb := '[]'::jsonb;
  darf boolean := false;
  im_team boolean := false;
  mich uuid := auth.uid();
  r record;
  n int;
  nrn text;
  ts timestamptz;
  posten jsonb;
  alle_ab timestamptz;
  c_frist constant interval := interval '14 days';
begin
  select (p.role = 'chef' or p.stufe = 'standortleitung'),
         (p.role = any (array['chef','mitarbeiter']))
    into darf, im_team
  from profiles p where p.id = mich;

  if coalesce(im_team, false) is not true then
    return '[]'::jsonb;
  end if;

if coalesce(darf, false) then

  -- 1) onOffice-Kette: laufen die Cronjobs noch? (Takt seit 26.08.2026: 10 Minuten)
  for r in
    select j.jobname,
           (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as letzter,
           (select d2.status from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1) as letzter_status
    from cron.job j
    where j.active and j.jobname in ('onoffice-sync-10min','onoffice-import-objekte-10min','onoffice-import-bilder-10min','onoffice-termine-sync-10min')
  loop
    if r.letzter is null or r.letzter < now() - interval '30 minutes' then
      befunde := befunde || jsonb_build_object(
        'code','sync_steht','ziel','admin',
        'text','onOffice-Sync steht: ' || r.jobname || ' lief zuletzt ' ||
               coalesce(to_char(r.letzter at time zone 'Europe/Berlin','DD.MM. HH24:MI'),'nie') || ' Uhr.');
    elsif r.letzter_status is distinct from 'succeeded' then
      befunde := befunde || jsonb_build_object(
        'code','sync_fehler','ziel','admin',
        'text','onOffice-Sync meldet Status "' || coalesce(r.letzter_status,'?') || '" bei ' || r.jobname || '.');
    end if;
  end loop;

  select max(synced_at) into ts from onoffice_objekte;
  if ts is null or ts < now() - interval '40 minutes' then
    befunde := befunde || jsonb_build_object(
      'code','spiegel_alt','ziel','admin',
      'text','Der onOffice-Spiegel ist seit ' || coalesce(to_char(ts at time zone 'Europe/Berlin','DD.MM. HH24:MI'),'nie') || ' Uhr nicht aktualisiert.');
  end if;

  -- 2) Portal-Export fehlgeschlagen
  select max(g.gesehen_am) into alle_ab from dashboard_gesehen g
   where g.benutzer_id = mich and g.code = 'export_fehler' and g.ref = '*' and g.gesehen_am > now() - c_frist;
  with treffer as (
    select i.id as objekt_id, coalesce(i.immo_nr,'?') as nr, s.portal,
           coalesce(s.uebertragen_am, '-infinity'::timestamptz) as zeit,
           'portal:' || s.id::text || ':' || coalesce(to_char(s.uebertragen_am,'YYYYMMDDHH24MI'),'-') as ref
    from immobilie_portal_status s join immobilien i on i.id = s.immobilie_id
    where s.status = 'fehler'
  ), offen as (
    select * from treffer t
     where (alle_ab is null or t.zeit > alle_ab)
       and not exists (select 1 from dashboard_gesehen g
                        where g.benutzer_id = mich and g.code = 'export_fehler'
                          and g.ref = t.ref and g.gesehen_am > now() - c_frist)
  )
  select count(*), left(coalesce(string_agg(distinct nr, ', '),''),120),
         coalesce((select jsonb_agg(jsonb_build_object('typ','objekt','id',o.objekt_id,'ref',o.ref,
                                                       'label', o.nr || ' · ' || initcap(o.portal)))
                     from (select * from offen order by nr limit 12) o), '[]'::jsonb)
    into n, nrn, posten
  from offen;
  if coalesce(n,0) > 0 then
    befunde := befunde || jsonb_build_object(
      'code','export_fehler','ziel','immobilien','posten',posten,
      'text', n || ' Portal-Export' || case when n = 1 then '' else 'e' end || ' fehlgeschlagen: ' || nrn);
  end if;

  -- 3) Objekt in Vermarktung ohne Foto
  select max(g.gesehen_am) into alle_ab from dashboard_gesehen g
   where g.benutzer_id = mich and g.code = 'ohne_foto' and g.ref = '*' and g.gesehen_am > now() - c_frist;
  with offen as (
    select i.id as objekt_id, i.immo_nr as nr, 'foto:' || i.id::text as ref
    from immobilien i
    where i.status = 'vermarktung'
      and i.created_at < now() - interval '24 hours'
      and (alle_ab is null or coalesce(i.updated_at, i.created_at) > alle_ab)
      and not exists (select 1 from immobilie_datei d where d.immobilie_id = i.id and d.kategorie = 'foto')
      and not exists (select 1 from dashboard_gesehen g
                       where g.benutzer_id = mich and g.code = 'ohne_foto'
                         and g.ref = 'foto:' || i.id::text and g.gesehen_am > now() - c_frist)
  )
  select count(*), left(coalesce(string_agg(nr, ', ' order by nr),''),120),
         coalesce((select jsonb_agg(jsonb_build_object('typ','objekt','id',o.objekt_id,'ref',o.ref,
                                                       'label',coalesce(o.nr,'Objekt')))
                     from (select * from offen order by nr limit 12) o), '[]'::jsonb)
    into n, nrn, posten
  from offen;
  if coalesce(n,0) > 0 then
    befunde := befunde || jsonb_build_object(
      'code','ohne_foto','ziel','immobilien','posten',posten,
      'text', n || ' Objekt' || case when n = 1 then '' else 'e' end || ' in Vermarktung ohne Foto: ' || nrn);
  end if;

  -- 4) Energieausweis fehlt bei Objekt in Vermarktung
  select max(g.gesehen_am) into alle_ab from dashboard_gesehen g
   where g.benutzer_id = mich and g.code = 'ohne_energieausweis' and g.ref = '*' and g.gesehen_am > now() - c_frist;
  with offen as (
    select i.id as objekt_id, i.immo_nr as nr, 'ea:' || i.id::text as ref
    from immobilien i
    where i.status = 'vermarktung'
      and coalesce(nullif(btrim(i.energieausweis_typ),''), null) is null
      and (alle_ab is null or coalesce(i.updated_at, i.created_at) > alle_ab)
      and not exists (select 1 from dashboard_gesehen g
                       where g.benutzer_id = mich and g.code = 'ohne_energieausweis'
                         and g.ref = 'ea:' || i.id::text and g.gesehen_am > now() - c_frist)
  )
  select count(*), left(coalesce(string_agg(nr, ', ' order by nr),''),120),
         coalesce((select jsonb_agg(jsonb_build_object('typ','objekt','id',o.objekt_id,'ref',o.ref,
                                                       'label',coalesce(o.nr,'Objekt')))
                     from (select * from offen order by nr limit 12) o), '[]'::jsonb)
    into n, nrn, posten
  from offen;
  if coalesce(n,0) > 0 then
    befunde := befunde || jsonb_build_object(
      'code','ohne_energieausweis','ziel','immobilien','posten',posten,
      'text', n || ' Objekt' || case when n = 1 then '' else 'e' end || ' in Vermarktung ohne Energieausweis: ' || nrn);
  end if;

  -- 5) Rechnung ueberfaellig — ohne Einzelposten, es gibt keine Sprungmarke
  select count(*), string_agg(r2.rechnungsnummer, ', ') into n, nrn
  from rechnungen r2
  where r2.status = 'gestellt' and r2.bezahlt_am is null
    and r2.faelligkeitsdatum is not null and r2.faelligkeitsdatum < current_date
    and coalesce(r2.ist_test, false) = false;
  if coalesce(n,0) > 0 then
    befunde := befunde || jsonb_build_object(
      'code','rechnung_ueberfaellig','ziel','rechnungen',
      'text', n || ' Rechnung' || case when n = 1 then '' else 'en' end || ' überfällig: ' || left(coalesce(nrn,''),120));
  end if;

end if;

  -- 6) Exposé verschickt, aber nicht heruntergeladen
  select max(g.gesehen_am) into alle_ab from dashboard_gesehen g
   where g.benutzer_id = mich and g.code = 'expose_ohne_download' and g.ref = '*' and g.gesehen_am > now() - c_frist;
  with offen as (
    select f.id, f.created_at, f.immobilie_id, 'expose:' || f.id::text as ref,
           coalesce(nullif(btrim(f.name),''), f.email, '?')
             || coalesce(' (' || i.immo_nr || ')', '') as label
    from expose_freigaben f
    left join immobilien i on i.id = f.immobilie_id
    where f.created_at < now() - interval '2 days'
      and f.created_at > now() - interval '30 days'
      and coalesce(f.downloads, 0) = 0
      and f.letzter_download_am is null
      and (f.erstellt_von = mich or i.zustaendig_id = mich)
      and (alle_ab is null or f.created_at > alle_ab)
      and not exists (select 1 from dashboard_gesehen g
                       where g.benutzer_id = mich and g.code = 'expose_ohne_download'
                         and g.ref = 'expose:' || f.id::text and g.gesehen_am > now() - c_frist)
  )
  select count(*), left(coalesce(string_agg(distinct label, ', '),''),120),
         coalesce((select jsonb_agg(jsonb_build_object('typ','objekt','id',o.immobilie_id,'ref',o.ref,'label',o.label))
                     from (select * from offen order by created_at limit 12) o), '[]'::jsonb)
    into n, nrn, posten
  from offen;
  if coalesce(n,0) > 0 then
    befunde := befunde || jsonb_build_object(
      'code','expose_ohne_download','ziel','immobilien','posten',posten,
      'text', n || ' Exposé' || case when n = 1 then '' else 's' end
              || ' seit über 2 Tagen nicht heruntergeladen: ' || nrn);
  end if;

  -- 7) Anfrage bittet um Rueckruf, es wurde noch nicht telefoniert
  select max(g.gesehen_am) into alle_ab from dashboard_gesehen g
   where g.benutzer_id = mich and g.code = 'anfrage_rueckruf' and g.ref = '*' and g.gesehen_am > now() - c_frist;
  with offen as (
    select m.id, m.gesendet_am, 'mail:' || m.id::text as ref,
           coalesce(nullif(btrim(m.kontakt_name),''), m.absender_name, m.absender_email, '?')
             || coalesce(' (' || i.immo_nr || ')', '') as label
    from mail_eingang m
    left join immobilien i on i.id = m.immobilie_id
    where m.anfrage_status = 'verarbeitet'
      and m.gesendet_am > now() - interval '30 days'
      and coalesce(m.archiviert, false) = false
      and (
        (m.anfrage_daten->'wuensche') ? 'Rückruf'
        or coalesce(m.anfrage_daten->>'nachricht','') ~*
           'rückruf|rueckruf|zurückrufen|zurueckrufen|rufen sie mich|telefonisch (bin|erreiche|erreichbar)|telefonisch unter'
      )
      and not exists (
        select 1 from vermerke v
         where v.typ = 'telefonat'
           and v.kontakt_id is not null
           and v.kontakt_id = m.kontakt_id
           and coalesce(v.begonnen_am, v.created_at) >= m.gesendet_am)
      and (i.zustaendig_id = mich or (i.zustaendig_id is null and darf))
      and (alle_ab is null or m.gesendet_am > alle_ab)
      and not exists (select 1 from dashboard_gesehen g
                       where g.benutzer_id = mich and g.code = 'anfrage_rueckruf'
                         and g.ref = 'mail:' || m.id::text and g.gesehen_am > now() - c_frist)
  )
  select count(*), left(coalesce(string_agg(distinct label, ', '),''),120),
         coalesce((select jsonb_agg(jsonb_build_object('typ','mail','id',o.id,'ref',o.ref,'label',o.label))
                     from (select * from offen order by gesendet_am desc limit 12) o), '[]'::jsonb)
    into n, nrn, posten
  from offen;
  if coalesce(n,0) > 0 then
    befunde := befunde || jsonb_build_object(
      'code','anfrage_rueckruf','ziel','posteingang','posten',posten,
      'text', n || ' Anfrage' || case when n = 1 then ' bittet' else 'n bitten' end
              || ' um Rückruf, noch nicht telefoniert: ' || nrn);
  end if;

  return befunde;
end
$function$
;
CREATE OR REPLACE FUNCTION public.delete_mitarbeiter(mitarbeiter_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  aufrufer_id uuid := auth.uid();
  aufrufer_role text;
  ziel_role text;
BEGIN
  -- Sicherheitscheck 1: Aufrufer muss Chef sein
  SELECT role INTO aufrufer_role FROM public.profiles WHERE id = aufrufer_id;
  IF aufrufer_role IS NULL OR aufrufer_role <> 'chef' THEN
    RAISE EXCEPTION 'Nur der Chef darf Mitarbeiter loeschen.';
  END IF;

  -- Sicherheitscheck 2: Chef kann sich nicht selbst loeschen
  IF mitarbeiter_id = aufrufer_id THEN
    RAISE EXCEPTION 'Chef kann sich nicht selbst loeschen.';
  END IF;

  -- Sicherheitscheck 3: Ziel-Profil pruefen
  SELECT role INTO ziel_role FROM public.profiles WHERE id = mitarbeiter_id;
  IF ziel_role IS NULL THEN
    RAISE EXCEPTION 'Mitarbeiter existiert nicht.';
  END IF;
  
  -- Sicherheitscheck 4: NUR mitarbeiter-Konten loeschen
  -- (keine chef-Konten, keine eigentuemer-Konten!)
  IF ziel_role <> 'mitarbeiter' THEN
    RAISE EXCEPTION 'Diese Funktion ist nur fuer Mitarbeiter (Rolle "mitarbeiter"). Konto hat Rolle: %', ziel_role;
  END IF;

  -- Daten umhaengen
  UPDATE public.bewertungen     SET ersteller_id = aufrufer_id WHERE ersteller_id = mitarbeiter_id;
  UPDATE public.dokumente       SET uploader_id  = aufrufer_id WHERE uploader_id  = mitarbeiter_id;
  UPDATE public.liquid_imports  SET user_id      = aufrufer_id WHERE user_id      = mitarbeiter_id;
  UPDATE public.marketing       SET uploader_id  = aufrufer_id WHERE uploader_id  = mitarbeiter_id;
  UPDATE public.objektnachweise SET ersteller_id = aufrufer_id WHERE ersteller_id = mitarbeiter_id;
  UPDATE public.termine         SET ersteller_id = aufrufer_id WHERE ersteller_id = mitarbeiter_id;
  UPDATE public.vertraege       SET ersteller_id = aufrufer_id WHERE ersteller_id = mitarbeiter_id;

  -- Profile loeschen
  DELETE FROM public.profiles WHERE id = mitarbeiter_id;

  -- Auth-User loeschen
  DELETE FROM auth.users WHERE id = mitarbeiter_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.diagnose_secret_pruefen(p text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from vault.decrypted_secrets where name='diagnose_secret' and decrypted_secret = p);
$function$
;
CREATE OR REPLACE FUNCTION public.eigentuemer_ansprechpartner_info(p_eigentuemer_id uuid)
 RETURNS TABLE(user_id uuid, name text, email text, telefon text, maklervertrag_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select p.id, p.name, p.email, p.telefon, eo.maklervertrag_id
  from public.eigentuemer_objekte eo
  join public.profiles p on p.id = eo.ansprechpartner_id
  where eo.eigentuemer_id = p_eigentuemer_id
$function$
;
CREATE OR REPLACE FUNCTION public.eigentuemer_dokument_queue_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Nur wenn Makler hochgeladen hat
  IF NEW.hochgeladen_von_typ <> 'makler' THEN
    RETURN NEW;
  END IF;

  -- UPSERT: gibt es schon einen offenen Queue-Eintrag fuer diesen Eigentuemer?
  INSERT INTO public.eigentuemer_benachrichtigung_queue
    (eigentuemer_id, ausloeser, anzahl_dokumente, erstes_ereignis_am, letztes_ereignis_am)
  VALUES
    (NEW.eigentuemer_id, 'neue_dokumente', 1, now(), now())
  ON CONFLICT (eigentuemer_id, ausloeser) WHERE versendet_am IS NULL
  DO UPDATE SET
    anzahl_dokumente   = eigentuemer_benachrichtigung_queue.anzahl_dokumente + 1,
    letztes_ereignis_am = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Trigger darf den eigentlichen Upload NIE blockieren.
  -- Bei Queue-Fehler einfach durchlassen.
  RAISE WARNING 'eigentuemer_dokument_queue_handler: %', SQLERRM;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.expose_freigabe_email_angleichen(p_token text, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if p_token is null or p_email is null or position('@' in p_email) = 0 then return false; end if;
  update expose_freigaben set email = lower(trim(p_email))
   where token = p_token and bestaetigt_am is null and lower(email) <> lower(trim(p_email));
  get diagnostics n = row_count;
  return n > 0;
end $function$
;
CREATE OR REPLACE FUNCTION public.expose_freigabe_vermerk()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_kontakt uuid; v_obj text; v_name text; v_makler uuid; v_titel text; v_text text;
begin
  select coalesce(nullif(objekttitel,''), nullif(bezeichnung,''), '') || case when immo_nr is not null then ' (Nr. ' || immo_nr || ')' else '' end, coalesce(zustaendig_id, new.erstellt_von)
    into v_obj, v_makler from immobilien where id = new.immobilie_id;
  v_kontakt := new.kontakt_id;
  if v_kontakt is null then
    select id into v_kontakt from kontakte where lower(email) = lower(new.email) order by aktiv desc, created_at limit 1;
    if v_kontakt is not null then update expose_freigaben set kontakt_id = v_kontakt where id = new.id; end if;
  end if;
  v_name := coalesce(nullif(new.name,''), new.email);

  if new.bestaetigt_am is not null and (old.bestaetigt_am is null) then
    v_titel := case when new.provisionsmodell = 'kaeufer' then 'Makler provisionspflichtig beauftragt (Exposé-Freigabe)' else 'Makler beauftragt (Exposé-Freigabe, provisionsfrei)' end;
    v_text := v_name || ' hat am ' || to_char(new.bestaetigt_am at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') || ' Uhr AGB, Datenschutz, Widerrufsbelehrung, vorzeitigen Beginn und Provision bestätigt'
      || case when new.ip is not null then ' (IP ' || new.ip || ')' else '' end || ' und das Exposé zu ' || v_obj || ' heruntergeladen.'
      || case when new.newsletter then ' Newsletter: ja.' else '' end;
    insert into vermerke (immobilie_id, kontakt_id, typ, titel, text, ref_tabelle, ref_id) values (new.immobilie_id, v_kontakt, 'expose_beauftragung', v_titel, v_text, 'expose_freigaben', new.id);
    insert into aktivitaeten (zielgruppe, empfaenger_user_id, typ, titel, text, ref_tabelle, ref_id)
      values ('makler', v_makler, 'expose_freigabe', '✓ Exposé-Beauftragung: ' || v_name, v_text, 'expose_freigaben', new.id);
  elsif new.downloads > coalesce(old.downloads, 0) and old.bestaetigt_am is not null then
    insert into vermerke (immobilie_id, kontakt_id, typ, titel, text, ref_tabelle, ref_id)
      values (new.immobilie_id, v_kontakt, 'expose_download', 'Exposé erneut heruntergeladen', v_name || ' hat das Exposé zu ' || v_obj || ' erneut heruntergeladen (' || new.downloads || '× gesamt).', 'expose_freigaben', new.id);
  elsif new.geoeffnet_am is not null and old.geoeffnet_am is null then
    insert into vermerke (immobilie_id, kontakt_id, typ, titel, text, ref_tabelle, ref_id)
      values (new.immobilie_id, v_kontakt, 'expose_geoeffnet', 'Exposé-Link geöffnet', v_name || ' hat den Exposé-Link zu ' || v_obj || ' geöffnet (noch nicht bestätigt).', 'expose_freigaben', new.id);
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.expose_freigabe_vermerk_neu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_obj text;
begin
  select coalesce(nullif(objekttitel,''), nullif(bezeichnung,''), '') || case when immo_nr is not null then ' (Nr. ' || immo_nr || ')' else '' end into v_obj from immobilien where id = new.immobilie_id;
  insert into vermerke (immobilie_id, kontakt_id, typ, titel, text, benutzer_id, ref_tabelle, ref_id)
    values (new.immobilie_id, new.kontakt_id, 'expose_link', 'Exposé-Link gesendet', 'Exposé-Freigabelink zu ' || v_obj || ' für ' || coalesce(nullif(new.name,''), new.email) || ' erzeugt (' || new.provisionsmodell || ').', new.erstellt_von, 'expose_freigaben', new.id);
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.fehler_protokoll_aufraeumen()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  delete from public.fehler_protokoll
   where (status = 'erledigt' and created_at < now() - interval '90 days')
      or created_at < now() - interval '365 days';
  get diagnostics n = row_count;
  return n;
end $function$
;
CREATE OR REPLACE FUNCTION public.finde_behoerde(p_plz text, p_ort text, p_unterlagentyp text)
 RETURNS TABLE(amt_id integer, behoerdenname text, strasse text, amt_plz text, amt_ort text, telefon text, email text, webseite text, online_portal text, zustaendig_fuer text, hinweise text, region text, ort_aus_plz text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    a.id, a.behoerdenname, a.strasse, a.plz, a.ort,
    a.telefon, a.email, a.webseite, a.online_portal,
    a.zustaendig_fuer, a.hinweise,
    pr.region, pr.ort
  FROM plz_region pr
  JOIN amt_adressen a ON (
    a.region_kanonisch = pr.region
    OR a.id IN (
      SELECT amt_id FROM amt_zusaetzliche_regionen WHERE region = pr.region
    )
    OR (a.region_kanonisch = 'GESAMT' AND a.unterlagentyp = 'altlasten')
  )
  WHERE pr.plz = p_plz
    AND a.unterlagentyp = p_unterlagentyp
    AND (
      p_ort IS NULL
      OR p_ort = ''
      OR LOWER(pr.ort) = LOWER(p_ort)
    )
  ORDER BY a.region_kanonisch DESC;  -- 'GESAMT' (LUNG fuer Altlasten) zuletzt
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_role text;
  v_must_change boolean;
BEGIN
  -- Name aus Metadaten lesen, sonst E-Mail-Prefix als Fallback
  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );
  -- Role aus Metadaten, sonst 'mitarbeiter'
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', ''),
    'mitarbeiter'
  );
  -- must_change_password aus Metadaten, sonst true
  v_must_change := COALESCE(
    (NEW.raw_user_meta_data->>'must_change_password')::boolean,
    true
  );

  -- Profil-Eintrag anlegen (idempotent: bei Konflikt nichts tun)
  INSERT INTO public.profiles (id, name, email, role, must_change_password)
  VALUES (NEW.id, v_name, NEW.email, v_role, v_must_change)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.immo_nr_setzen()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if nullif(btrim(coalesce(new.immo_nr, '')), '') is null then
    new.immo_nr := naechste_immo_nr(new.stammobjekt_id);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.immobilie_datei_werbebild_erkennen()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.kategorie = 'foto'
     and new.expose_ausschliessen = false
     and (coalesce(new.name,'') || ' ' || coalesce(new.titel,''))
         ~* '(sofort[-_ ]?download|kontaktbild|portal hauptbild|portal_hauptbild|infobild|vertriebsgebiet|portal_[0-9]_|immobilien-portal miete)'
  then
    new.expose_ausschliessen := true;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_chef()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'chef', false)
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'chef'
      );
$function$
;
CREATE OR REPLACE FUNCTION public.ist_chef()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'chef')
$function$
;
CREATE OR REPLACE FUNCTION public.ist_team()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles p
                 where p.id = auth.uid() and p.role in ('chef','mitarbeiter'))
$function$
;
CREATE OR REPLACE FUNCTION public.kontakte_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at := now(); return new; end; $function$
;
CREATE OR REPLACE FUNCTION public.mail_anfrage_vermerk()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_obj text;
begin
  if new.anfrage_status = 'verarbeitet' and coalesce(old.anfrage_status,'') <> 'verarbeitet' then
    select coalesce(nullif(objekttitel,''), nullif(bezeichnung,''), '') || case when immo_nr is not null then ' (Nr. ' || immo_nr || ')' else '' end into v_obj from immobilien where id = new.immobilie_id;
    insert into vermerke (immobilie_id, kontakt_id, typ, titel, text, ref_tabelle, ref_id)
      values (new.immobilie_id, new.kontakt_id, 'anfrage',
        case when new.anfrage_daten->>'art' = 'eigentuemer' then 'Bewertungs-/Verkaufsanfrage' else 'Portalanfrage' end || coalesce(' (' || (new.anfrage_daten->>'portal') || ')', ''),
        coalesce(new.kontakt_name, new.kontakt_email, 'Unbekannt') || coalesce(' zu ' || nullif(v_obj,''), '') || coalesce(': „' || left(new.anfrage_daten->>'nachricht', 300) || '“', ''), 'mail_eingang', new.id);
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.mail_eingang_anfrage_vorfilter()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.anfrage_status is null then
    -- Portalmails bleiben offen; ebenso interne Weiterleitungen (WG:/Fwd:) von Kollegen, die eine Anfrage enthalten koennten
    if new.absender_email ~* '(immobilienscout24|immoscout|immowelt|immonet|kleinanzeigen|ohne-makler|immobilie1|wohnungsboerse|immomio|neubaukompass|newhome)' then
      null;
    elsif new.absender_email ~* ('@' || coalesce((select nullif(split_part(email, '@', 2), '')
                                                from public.firma_stammdaten
                                               where typ = 'standort' and coalesce(aktiv, true)
                                               order by sortierung, firma_name limit 1),
                                             'kein.eigener.absender.invalid') || '$')
        and coalesce(new.betreff,'') ~* '^\s*(wg|fwd?|weiterleitung|tr)\s*:' then
      null;
    else
      new.anfrage_status := 'keine_anfrage';
    end if;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.mail_eingang_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
begin
  -- nur echte, neue, ungelesene Posteingangsmails; Gesendet-Ordner und
  -- Nachladen alter Bestaende (backfill) bleiben stumm
  if coalesce(new.ordner,'') <> 'posteingang' then return new; end if;
  if coalesce(new.gelesen,false) or coalesce(new.archiviert,false) then return new; end if;
  if new.gesendet_am is null or new.gesendet_am < now() - interval '1 day' then return new; end if;
  if new.postfach_id is null then return new; end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_hook_secret';
  if v_secret is null then return new; end if;

  perform net.http_post(
    url     := public.eigene_funktions_url('push-senden'),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    body    := jsonb_build_object('mail_id', new.id),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  raise warning 'push-senden konnte nicht angestossen werden: %', sqlerrm;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.mail_regeln_anwenden()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_benutzer uuid;
  r RECORD;
  v_wert text;
  v_treffer boolean;
BEGIN
  -- Nur frisch eingehende Mails im Posteingang anfassen (keine Entwuerfe etc.)
  IF NEW.ordner IS DISTINCT FROM 'posteingang' THEN
    RETURN NEW;
  END IF;

  SELECT benutzer_id INTO v_benutzer FROM mail_postfaecher WHERE id = NEW.postfach_id;
  IF v_benutzer IS NULL THEN
    RETURN NEW;
  END IF;

  -- Blockierte Absender -> Spam (Regeln laufen dann nicht mehr)
  IF EXISTS (
    SELECT 1 FROM mail_blockierte_absender b
    WHERE b.benutzer_id = v_benutzer
      AND lower(b.email) = lower(coalesce(NEW.absender_email, ''))
  ) THEN
    NEW.ordner := 'spam';
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT * FROM mail_regeln
    WHERE benutzer_id = v_benutzer
      AND aktiv
      AND (postfach_id IS NULL OR postfach_id = NEW.postfach_id)
    ORDER BY reihenfolge, created_at
  LOOP
    v_wert := CASE r.bedingung_feld
      WHEN 'absender' THEN coalesce(NEW.absender_email, '') || ' ' || coalesce(NEW.absender_name, '')
      WHEN 'betreff'  THEN coalesce(NEW.betreff, '')
      ELSE coalesce(NEW.text, '')
    END;
    v_treffer := CASE r.bedingung_operator
      WHEN 'enthaelt' THEN position(lower(r.bedingung_wert) IN lower(v_wert)) > 0
      WHEN 'beginnt'  THEN lower(v_wert) LIKE lower(r.bedingung_wert) || '%'
      WHEN 'endet'    THEN lower(v_wert) LIKE '%' || lower(r.bedingung_wert)
      WHEN 'ist'      THEN lower(btrim(v_wert)) = lower(btrim(r.bedingung_wert))
      ELSE false
    END;
    IF v_treffer THEN
      IF r.aktion_ordner IS NOT NULL AND r.aktion_ordner <> '' THEN
        NEW.ordner := r.aktion_ordner;
      END IF;
      IF r.aktion_gelesen THEN NEW.gelesen := true; END IF;
      IF r.aktion_markieren THEN NEW.markiert := true; END IF;
      IF r.aktion_kategorie IS NOT NULL AND r.aktion_kategorie <> ''
         AND NOT (NEW.kategorien @> ARRAY[r.aktion_kategorie]) THEN
        NEW.kategorien := NEW.kategorien || r.aktion_kategorie;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.mao_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.naechste_immo_nr(p_stammobjekt_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  v_stamm_nr text;
  v_lfd      int;
  v_max      int;
begin
  -- Serialisiert alle gleichzeitigen Vergaben; loest sich am Transaktionsende.
  perform pg_advisory_xact_lock(hashtext('immo_nr_vergabe'));

  -- Einheit eines Stammobjekts -> <Stammnummer>_<lfd>
  if p_stammobjekt_id is not null then
    select nullif(btrim(immo_nr), '') into v_stamm_nr
      from immobilien where id = p_stammobjekt_id;

    if v_stamm_nr is not null then
      select count(*) + 1 into v_lfd
        from immobilien
       where stammobjekt_id = p_stammobjekt_id
         and nullif(btrim(immo_nr), '') is not null;

      -- Falls die errechnete Nummer schon existiert, weiterzaehlen
      while exists (select 1 from immobilien
                     where btrim(immo_nr) = v_stamm_nr || '_' || v_lfd) loop
        v_lfd := v_lfd + 1;
      end loop;

      return v_stamm_nr || '_' || v_lfd;
    end if;
  end if;

  -- Eigenstaendiges Objekt -> naechste freie rein numerische Nummer
  select coalesce(max(btrim(immo_nr)::bigint), 0) into v_max
    from immobilien
   where btrim(immo_nr) ~ '^[0-9]+$';

  return (v_max + 1)::text;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.naechste_rechnungsnummer(p_firma_id uuid, p_jahr integer DEFAULT NULL::integer, p_ist_test boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jahr int := COALESCE(p_jahr, EXTRACT(YEAR FROM now())::int);
  v_naechste int;
  v_praefix text;
  v_mit_jahr boolean;
  v_test_nr int;
BEGIN
  IF p_ist_test THEN
    INSERT INTO public.rechnung_nummern_sequence(firma_id, jahr, letzte_nummer)
    VALUES (p_firma_id, -1, 1)
    ON CONFLICT (firma_id, jahr) DO UPDATE
      SET letzte_nummer = rechnung_nummern_sequence.letzte_nummer + 1
    RETURNING letzte_nummer INTO v_test_nr;
    RETURN 'TEST-' || LPAD(v_test_nr::text, 3, '0');
  END IF;

  SELECT rechnung_nummer_praefix, rechnung_nummer_mit_jahr
    INTO v_praefix, v_mit_jahr
  FROM public.firma_stammdaten WHERE id = p_firma_id;

  IF v_praefix IS NULL THEN RAISE EXCEPTION 'Firma % nicht gefunden.', p_firma_id; END IF;

  IF NOT v_mit_jahr THEN v_jahr := 0; END IF;

  INSERT INTO public.rechnung_nummern_sequence(firma_id, jahr, letzte_nummer)
  VALUES (p_firma_id, v_jahr, 1)
  ON CONFLICT (firma_id, jahr) DO UPDATE
    SET letzte_nummer = rechnung_nummern_sequence.letzte_nummer + 1
  RETURNING letzte_nummer INTO v_naechste;

  IF v_mit_jahr THEN
    RETURN v_praefix || '-' || v_jahr || '-' || LPAD(v_naechste::text, 3, '0');
  ELSE
    RETURN v_praefix || '-' || LPAD(v_naechste::text, 3, '0');
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.notiz_wiederholung_anlegen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  naechste_faelligkeit date;
BEGIN
  IF NEW.erledigt = true AND OLD.erledigt = false AND NEW.wiederholung IS NOT NULL THEN
    naechste_faelligkeit := CASE NEW.wiederholung
      WHEN 'taeglich'     THEN COALESCE(NEW.faellig_am, CURRENT_DATE) + INTERVAL '1 day'
      WHEN 'woechentlich' THEN COALESCE(NEW.faellig_am, CURRENT_DATE) + INTERVAL '7 days'
      WHEN 'monatlich'    THEN COALESCE(NEW.faellig_am, CURRENT_DATE) + INTERVAL '1 month'
      WHEN 'jaehrlich'    THEN COALESCE(NEW.faellig_am, CURRENT_DATE) + INTERVAL '1 year'
    END;
    INSERT INTO public.notizen (
      user_id, text, prio, quelle, verknuepft_typ, verknuepft_id, verknuepft_label,
      tags, wiederholung, faellig_am
    ) VALUES (
      NEW.user_id, NEW.text, NEW.prio, NEW.quelle, NEW.verknuepft_typ, NEW.verknuepft_id, NEW.verknuepft_label,
      NEW.tags, NEW.wiederholung, naechste_faelligkeit
    );
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.objekt_kosten_berechnen(p_immobilie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        public.kosten_saetze%rowtype;
  obj      public.immobilien%rowtype;
  ein      public.immobilie_kosten_einstellung%rowtype;
  fah      public.immobilie_fahrt_cache%rowtype;
  v_bis           date;
  v_erst_foto     date;
  v_erst_expose   date;
  v_marktstart    date;
  v_ergebnis      jsonb;
  c_fahrt_arten constant text[] := array['besichtigung','folgebesichtigung','objektaufnahme','fototermin','übergabe','uebergabe'];
begin
  if not exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = any (array['chef','mitarbeiter'])) then
    raise exception 'Keine Berechtigung für den Kostenlauf.';
  end if;

  select * into obj from public.immobilien where id = p_immobilie_id;
  if not found then raise exception 'Objekt nicht gefunden.'; end if;

  select * into s   from public.kosten_saetze where id = 1;
  select * into ein from public.immobilie_kosten_einstellung where immobilie_id = p_immobilie_id;
  select * into fah from public.immobilie_fahrt_cache        where immobilie_id = p_immobilie_id;

  v_bis := coalesce(obj.verkauft_am, current_date);

  delete from public.immobilie_kosten_position
   where immobilie_id = p_immobilie_id and quelle = 'auto';

  ---------------------------------------------------------------- Termine
  -- Ein Eintrag je Termin und Teilnehmer. Teilnehmer stehen als Klarnamen im
  -- Array teilnehmer; wo keiner passt, greift der Ersteller, sonst der
  -- Standardsatz ohne Zuordnung.
  with termin as (
    select t.id, t.datum, t.titel, t.art, t.teilnehmer, t.ersteller_id, t.ersteller_name,
           round(case when t.ganztags then 480
                      when t.uhrzeit is not null and t.ende is not null and t.ende > t.uhrzeit
                        then extract(epoch from (t.ende - t.uhrzeit)) / 60
                      else 60 end, 1) as minuten
      from public.termine t
     where t.immobilie_id = p_immobilie_id
       and coalesce(t.status,'aktiv') not in ('storniert','abgesagt','abgelehnt')
       and coalesce(t.privat,false) = false
       and coalesce(t.art,'') !~* 'urlaub'
       and coalesce(t.titel,'') !~* 'urlaub'
  ), beteiligt as (
    select t.id, t.datum, t.titel, t.art, t.minuten,
           coalesce(
             (select array_agg(p.id) from public.profiles p
               where p.name = any (t.teilnehmer) and p.role = any (array['chef','mitarbeiter'])),
             (select array_agg(p.id) from public.profiles p where p.id = t.ersteller_id),
             (select array_agg(p.id) from public.profiles p
               where t.ersteller_name is not null and t.ersteller_name <> ''
                 and p.name ilike t.ersteller_name || '%' and p.role = any (array['chef','mitarbeiter'])),
             array[null::uuid]
           ) as profile
      from termin t
  ), je_person as (
    select b.id, b.datum, b.titel, b.art, b.minuten, unnest(b.profile) as profil_id from beteiligt b
  )
  insert into public.immobilie_kosten_position
        (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, mitarbeiter_id, quelle, quelle_ref)
  select p_immobilie_id, j.datum, 'termin',
         coalesce(nullif(j.art,''),'Termin') || ': ' || coalesce(nullif(j.titel,''),'ohne Titel'),
         j.minuten, null,
         round(j.minuten / 60.0 * coalesce(pr.stundensatz, 45), 2),
         j.profil_id, 'auto', 'termin:' || j.id::text || ':' || coalesce(j.profil_id::text,'-')
    from je_person j
    left join public.profiles pr on pr.id = j.profil_id;

  ---------------------------------------------------------------- Fahrten
  -- Hin und zurueck, einmal je Termin, auf den ersten Teilnehmer gebucht —
  -- er faehrt, nicht zwingend der Ersteller des Termins.
  insert into public.immobilie_kosten_position
        (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, mitarbeiter_id, quelle, quelle_ref)
  select p_immobilie_id, f.datum, 'fahrt', f.text, round(f.minuten, 1), round(f.km, 1),
         round(f.km * s.km_satz + f.minuten / 60.0 * coalesce(pr.stundensatz, 45) * s.fahrzeit_faktor, 2),
         f.profil_id, 'auto', 'fahrt:' || f.id::text
    from (
      select t.id, t.datum,
             coalesce(
               (select p.id from public.profiles p
                 where p.name = any (t.teilnehmer) and p.role = any (array['chef','mitarbeiter'])
                 order by array_position(t.teilnehmer, p.name) limit 1),
               t.ersteller_id,
               (select p.id from public.profiles p
                 where t.ersteller_name is not null and t.ersteller_name <> ''
                   and p.name ilike t.ersteller_name || '%' and p.role = any (array['chef','mitarbeiter'])
                 order by p.name limit 1)
             ) as profil_id,
             'Fahrt zum Objekt (' || coalesce(nullif(t.art,''),'Termin') || ')' as text,
             case when t.fahrt_hin_km is not null
                  then coalesce(t.fahrt_hin_km,0) + coalesce(t.fahrt_rueck_km, t.fahrt_hin_km, 0)
                  else 2 * coalesce(fah.km_einfach, 0) end as km,
             case when t.fahrt_hin_km is not null
                  then coalesce(t.fahrzeit_hin_min,0) + coalesce(t.fahrzeit_rueck_min, t.fahrzeit_hin_min, 0)
                  else 2 * coalesce(fah.minuten_einfach, 0) end as minuten
        from public.termine t
       where t.immobilie_id = p_immobilie_id
         and coalesce(t.status,'aktiv') not in ('storniert','abgesagt','abgelehnt')
         and coalesce(t.privat,false) = false
         and coalesce(t.art,'') !~* 'urlaub'
         and coalesce(t.titel,'') !~* 'urlaub'
         and lower(coalesce(t.art,'')) = any (c_fahrt_arten)
         and coalesce(t.ort,'') !~* 'büro|buero'
    ) f
    left join public.profiles pr on pr.id = f.profil_id
   where f.km > 0 or f.minuten > 0;

  ------------------------------------------------------------- Telefonate
  if s.telefon_modus = 'pauschale_je_objekt_monat' then
    insert into public.immobilie_kosten_position
          (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, mitarbeiter_id, quelle, quelle_ref)
    select p_immobilie_id, m::date, 'telefon',
           'Telefonpauschale ' || to_char(m, 'MM/YYYY'), null, null,
           s.telefon_pauschale_je_objekt_monat, null, 'auto', 'telefonmonat:' || to_char(m, 'YYYY-MM')
      from generate_series(date_trunc('month', obj.created_at)::date, date_trunc('month', v_bis)::date, interval '1 month') m;
  else
    insert into public.immobilie_kosten_position
          (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, mitarbeiter_id, quelle, quelle_ref)
    select p_immobilie_id,
           coalesce(v.begonnen_am, v.created_at)::date, 'telefon',
           coalesce(v.titel, 'Telefonat')
             || case when v.dauer_minuten is null
                     then ' (ohne Dauer, ' || s.telefon_minuten_ohne_dauer || ' Min. angenommen)' else '' end,
           case when s.telefon_modus = 'minuten'
                then coalesce(v.dauer_minuten, s.telefon_minuten_ohne_dauer) else null end,
           null,
           case when s.telefon_modus = 'minuten'
                then round(coalesce(v.dauer_minuten, s.telefon_minuten_ohne_dauer) / 60.0 * coalesce(pr.stundensatz, 45), 2)
                else s.telefon_pauschale_je_anruf end,
           v.benutzer_id, 'auto', 'telefonat:' || v.id::text
      from public.vermerke v
      left join public.profiles pr on pr.id = v.benutzer_id
     where v.immobilie_id = p_immobilie_id and v.typ = 'telefonat';
  end if;

  ----------------------------------------------------------- Korrespondenz
  insert into public.immobilie_kosten_position
        (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, mitarbeiter_id, quelle, quelle_ref)
  select p_immobilie_id, k.datum, 'korrespondenz', k.text, s.minuten_je_mail, null,
         round(s.minuten_je_mail / 60.0 * coalesce(pr.stundensatz, 45), 2),
         k.profil_id, 'auto', k.ref
    from (
      select e.gesendet_am::date as datum,
             'Mail empfangen: ' || coalesce(nullif(e.betreff,''),'(ohne Betreff)') as text,
             null::uuid as profil_id, 'mail_eingang:' || e.id::text as ref
        from public.mail_eingang e
       where e.immobilie_id = p_immobilie_id and e.gesendet_am is not null
      union all
      select m.gesendet_am::date,
             'Mail gesendet: ' || coalesce(nullif(m.betreff,''),'(ohne Betreff)'),
             m.versendet_von_user_id, 'mail_versendet:' || m.id::text
        from public.mail_versendet m
       where m.status = 'gesendet' and m.gesendet_am is not null
         and m.empfaenger_email is not null and m.empfaenger_email <> ''
         and exists (
               select 1 from public.kontakt_objekt ko
                 join public.kontakte ko2 on ko2.id = ko.kontakt_id
                where ko.immobilie_id = p_immobilie_id
                  and ko2.email is not null and ko2.email <> ''
                  and lower(m.empfaenger_email) like '%' || lower(ko2.email) || '%')
    ) k
    left join public.profiles pr on pr.id = k.profil_id;

  ------------------------------------------------------ Pauschalen je Objekt
  select min(created_at)::date into v_erst_foto
    from public.immobilie_datei where immobilie_id = p_immobilie_id and kategorie = 'foto';
  select min(created_at)::date into v_erst_expose
    from public.immobilie_datei where immobilie_id = p_immobilie_id and coalesce(doktyp,'') ilike 'expos%';
  select min(uebertragen_am)::date into v_marktstart
    from public.immobilie_portal_status where immobilie_id = p_immobilie_id and status in ('inseriert','entfernt');

  if obj.status = 'vermarktung' or obj.verkauft_am is not null or v_marktstart is not null then
    insert into public.immobilie_kosten_position
          (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, quelle, quelle_ref)
    values (p_immobilie_id, coalesce(v_marktstart, obj.updated_at::date, obj.created_at::date),
            'aufbereitung', 'Objektaufbereitung (Pauschale)', null, null,
            s.pauschale_objektaufbereitung, 'auto', 'aufbereitung');
  end if;

  if (select count(*) from public.immobilie_datei
       where immobilie_id = p_immobilie_id and kategorie = 'foto') >= 5 then
    insert into public.immobilie_kosten_position
          (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, quelle, quelle_ref)
    values (p_immobilie_id, coalesce(v_erst_foto, obj.created_at::date), 'bilder',
            'Bildbearbeitung (Pauschale)', null, null, s.pauschale_bilder, 'auto', 'bilder');
  end if;

  if v_erst_expose is not null then
    insert into public.immobilie_kosten_position
          (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, quelle, quelle_ref)
    values (p_immobilie_id, v_erst_expose, 'expose', 'Exposé (Pauschale)', null, null,
            s.pauschale_expose, 'auto', 'expose');
  end if;

  if coalesce(ein.energieausweis_beschafft, false)
     and (obj.energieausweis_typ is not null
          or exists (select 1 from public.immobilie_datei
                      where immobilie_id = p_immobilie_id and coalesce(doktyp,'') ilike 'energieausweis%')) then
    insert into public.immobilie_kosten_position
          (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, quelle, quelle_ref)
    values (p_immobilie_id, coalesce(obj.updated_at::date, obj.created_at::date), 'energieausweis',
            'Energieausweis (Pauschale)', null, null, s.pauschale_energieausweis, 'auto', 'energieausweis');
  end if;

  insert into public.immobilie_kosten_position
        (immobilie_id, datum, typ, beschreibung, minuten, km, betrag, quelle, quelle_ref)
  select p_immobilie_id, ps.uebertragen_am::date, 'portal',
         initcap(ps.portal) || ': ' || mon || ' ' || case when mon = 1 then 'Monat' else 'Monate' end || ' inseriert',
         null, null, round(mon * s.pauschale_portal_inserat_monat, 2), 'auto', 'portal:' || ps.id::text
    from (
      select p.*, greatest(1, (extract(year  from age(v_bis, p.uebertragen_am::date)) * 12
                             + extract(month from age(v_bis, p.uebertragen_am::date)))::int + 1) as mon
        from public.immobilie_portal_status p
       where p.immobilie_id = p_immobilie_id and p.status = 'inseriert' and p.uebertragen_am is not null
    ) ps;

  ------------------------------------------------------------------ Ergebnis
  select jsonb_build_object(
           'positionen',  count(*),
           'summe',       round(coalesce(sum(betrag), 0), 2),
           'minuten',     round(coalesce(sum(minuten), 0), 1),
           'km',          round(coalesce(sum(km), 0), 1),
           'automatisch', count(*) filter (where quelle = 'auto'),
           'manuell',     count(*) filter (where quelle = 'manuell'),
           'telefonate',  count(*) filter (where typ = 'telefon'),
           'berechnet_am', now()
         )
    into v_ergebnis
    from public.immobilie_kosten_position where immobilie_id = p_immobilie_id;

  return v_ergebnis;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.objektaufnahmen_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.onoffice_waechter_befunde()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  befunde jsonb := '[]'::jsonb;
  r record;
  n int;
  nrn text;
  ts timestamptz;
begin
  -- ---------- 1) Cron-Jobs: laufen sie überhaupt noch? ----------
  for r in
    select j.jobname,
           (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as letzter,
           (select d2.status from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1) as letzter_status
    from cron.job j
    where j.jobname in ('onoffice-sync-30min','onoffice-import-objekte-30min','onoffice-import-bilder-30min')
  loop
    if r.letzter is null or r.letzter < now() - interval '45 minutes' then
      befunde := befunde || jsonb_build_object(
        'code', 'cron_tot_' || r.jobname,
        'text', 'Cron-Job ' || r.jobname || ' lief zuletzt ' ||
                coalesce(to_char(r.letzter at time zone 'Europe/Berlin', 'DD.MM. HH24:MI'), 'NIE') ||
                ' Uhr — erwartet: alle 30 Minuten.');
    elsif r.letzter_status is distinct from 'succeeded' then
      befunde := befunde || jsonb_build_object(
        'code', 'cron_fehler_' || r.jobname,
        'text', 'Cron-Job ' || r.jobname || ' meldet Status "' || coalesce(r.letzter_status,'?') || '".');
    end if;
  end loop;

  -- ---------- 2) Edge-Antworten: kam in den letzten 50 Min je Schritt eine Erfolgsmeldung? ----------
  -- (pg_net hält Antworten ~6 Std. vor, 50 Min sind sicher abgedeckt)
  if not exists (select 1 from net._http_response
                 where created > now() - interval '50 minutes'
                   and status_code = 200 and content like '%"gelesen"%' and content like '%"ok":true%') then
    befunde := befunde || jsonb_build_object('code', 'antwort_fehlt_sync',
      'text', 'Seit 50 Min. keine Erfolgsmeldung vom onoffice-sync (onOffice → Spiegel). Läuft die Function durch? Timeout? onOffice-API down?');
  end if;
  if not exists (select 1 from net._http_response
                 where created > now() - interval '50 minutes'
                   and status_code = 200 and content like '%"modus":"objekte"%' and content like '%"ok":true%') then
    befunde := befunde || jsonb_build_object('code', 'antwort_fehlt_objekte',
      'text', 'Seit 50 Min. keine Erfolgsmeldung vom Objekte-Import (Spiegel → Portal).');
  end if;
  if not exists (select 1 from net._http_response
                 where created > now() - interval '50 minutes'
                   and status_code = 200 and content like '%"modus":"bilder"%' and content like '%"ok":true%') then
    befunde := befunde || jsonb_build_object('code', 'antwort_fehlt_bilder',
      'text', 'Seit 50 Min. keine Erfolgsmeldung vom Bilder-Import.');
  end if;

  -- ---------- 3) Import meldet Fehler im Payload (ok:false oder fehler_anzahl > 0) ----------
  select count(*) into n from net._http_response
  where created > now() - interval '50 minutes'
    and (content like '%"modus"%' or content like '%"gelesen"%')
    and (content like '%"ok":false%' or (content ~ '"fehler_anzahl":[1-9]'));
  if n > 0 then
    befunde := befunde || jsonb_build_object('code', 'import_fehler',
      'text', n || ' Sync-/Import-Lauf/Läufe der letzten 50 Min. melden Fehler im Ergebnis (ok:false oder fehler_anzahl > 0). Details: Admin-Tab onOffice-Import bzw. net._http_response.');
  end if;

  -- ---------- 4) Spiegel-Frische ----------
  select max(synced_at) into ts from onoffice_objekte;
  if ts is null or ts < now() - interval '45 minutes' then
    befunde := befunde || jsonb_build_object('code', 'spiegel_alt',
      'text', 'Der onOffice-Spiegel wurde zuletzt ' ||
              coalesce(to_char(ts at time zone 'Europe/Berlin', 'DD.MM. HH24:MI'), 'NIE') ||
              ' Uhr aktualisiert — erwartet: alle 30 Minuten.');
  end if;

  -- ---------- 5) Portal-Schutz-Stau: Objekte warten > 24 Std. auf Übertragung nach onOffice ----------
  select count(*), string_agg(immo_nr, ', ' order by immo_nr) into n, nrn
  from immobilien
  where onoffice_id is not null
    and onoffice_gesperrt is not true
    and onoffice_synced_at is not null
    and updated_at > onoffice_synced_at + interval '2 minutes'
    and updated_at < now() - interval '24 hours';
  if n > 0 then
    befunde := befunde || jsonb_build_object('code', 'portal_stau',
      'text', n || ' Objekt(e) mit Portal-Änderung warten seit über 24 Std. auf die Übertragung nach onOffice und bekommen solange KEINE onOffice-Updates: ' || nrn ||
              '. In der Objektseite "nach onOffice übertragen" oder Änderung verwerfen.');
  end if;

  -- ---------- 6) Inhaltliche Abweichung Spiegel ↔ Portal trotz gelaufenem Sync ----------
  -- Nur Objekte, die NICHT gesperrt und NICHT portal-geschützt sind und deren
  -- Spiegel-Stand älter als 90 Min ist (zwei Sync-Zyklen Zeit zum Durchlaufen).
  select count(*), string_agg(o.objektnr_extern, ', ' order by o.objektnr_extern) into n, nrn
  from onoffice_objekte o
  join immobilien i on i.onoffice_id = o.onoffice_id
  where i.onoffice_gesperrt is not true
    and o.synced_at < now() - interval '90 minutes'
    and not (i.updated_at > i.onoffice_synced_at + interval '2 minutes')
    and (
      coalesce(nullif(btrim(o.roh->>'objektbeschreibung'),''),'') is distinct from coalesce(nullif(btrim(i.beschreibung_objekt),''),'')
      or coalesce(nullif(btrim(o.roh->>'lage'),''),'') is distinct from coalesce(nullif(btrim(i.beschreibung_lage),''),'')
      or coalesce(nullif(btrim(o.roh->>'ausstatt_beschr'),''),'') is distinct from coalesce(nullif(btrim(i.beschreibung_ausstattung),''),'')
      or coalesce(nullif(btrim(o.roh->>'sonstige_angaben'),''),'') is distinct from coalesce(nullif(btrim(i.beschreibung_sonstiges),''),'')
      or (o.vermarktungsart is distinct from 'miete' and o.kaufpreis is distinct from i.angebotspreis)
      or (o.vermarktungsart = 'miete' and o.kaltmiete is distinct from i.kaltmiete)
    );
  if n > 0 then
    befunde := befunde || jsonb_build_object('code', 'sync_abweichung',
      'text', n || ' Objekt(e) weichen trotz gelaufenem Sync zwischen onOffice-Spiegel und Portal ab (Texte/Preise): ' || coalesce(left(nrn, 200),'') ||
              '. Das deutet auf einen Import-Bug hin.');
  end if;

  -- ---------- 7) Veröffentlichte Objekte ohne ein einziges Foto ----------
  select count(*), string_agg(i.immo_nr, ', ' order by i.immo_nr) into n, nrn
  from immobilien i
  where i.onoffice_id is not null
    and i.status = 'vermarktung'
    and i.created_at < now() - interval '24 hours'
    and not exists (select 1 from immobilie_datei d where d.immobilie_id = i.id and d.kategorie = 'foto')
  ;
  if n > 0 then
    befunde := befunde || jsonb_build_object('code', 'ohne_fotos',
      'text', n || ' veröffentlichte(s) Objekt(e) haben seit über 24 Std. kein einziges Foto im Portal: ' || nrn ||
              '. Entweder fehlen sie auch in onOffice — oder der Bilder-Import klemmt (onoffice_bilder_am auf NULL setzen erzwingt Neu-Import).');
  end if;

  return befunde;
end
$function$
;
CREATE OR REPLACE FUNCTION public.parse_deutsch_zahl(p_text text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_clean text;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN RETURN 0; END IF;
  v_clean := regexp_replace(p_text, '[^\d,.\-]', '', 'g');
  IF v_clean LIKE '%.%' AND v_clean LIKE '%,%' THEN
    v_clean := replace(v_clean, '.', '');
    v_clean := replace(v_clean, ',', '.');
  ELSIF v_clean LIKE '%,%' THEN
    IF v_clean ~ ',\d{3}(?!\d)' AND v_clean !~ ',\d{1,2}$' THEN
      v_clean := replace(v_clean, ',', '');
    ELSE
      v_clean := replace(v_clean, ',', '.');
    END IF;
  ELSIF v_clean LIKE '%.%' THEN
    IF v_clean ~ '\.\d{3}$' AND v_clean !~ '\.\d{1,2}$' THEN
      v_clean := replace(v_clean, '.', '');
    END IF;
  END IF;
  BEGIN
    RETURN v_clean::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.portal_importbericht_auswerten(p_mail_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m record; v_portal text; abs text; para text; kopf text; ereignis text;
  z record; immo uuid; treffer int := 0; v_url text; nr text; v_meldung text;
begin
  select id, absender_email, betreff, gesendet_am, coalesce(text, '') as text into m from mail_eingang where id = p_mail_id;
  if not found then return 0; end if;
  abs := lower(coalesce(m.absender_email, ''));
  if abs like '%immowelt.de' and m.betreff ilike 'Importbericht%' then
    v_portal := 'immowelt';
    -- Zeile "…, Objekt Nr. X: neu|geändert|gelöscht" + Folgetext bis zur nächsten Objektzeile (enthält ggf. URL oder Fehlertext)
    for z in select r[1] as nr, r[2] as st, r[3] as rest from regexp_matches(m.text, 'Objekt Nr\. ([^:\n]+): (neu|geändert|gelöscht|ungeändert)([\s\S]*?)(?=Objekt Nr\. |$)', 'g') as r loop
      nr := trim(z.nr);
      select id into immo from immobilien where immo_nr = nr limit 1;
      if immo is null then continue; end if;
      v_url := (regexp_match(z.rest, '(https?://\S+)'))[1];
      if z.rest ~* 'Fehler|abgewiesen' then
        ereignis := 'fehler';
        v_meldung := 'Importbericht Immowelt: ' || left(trim(regexp_replace(z.rest, '\s+', ' ', 'g')), 240);
      else
        ereignis := case z.st when 'gelöscht' then 'entfernt' else 'inseriert' end;
        v_meldung := 'Importbericht: ' || z.st;
      end if;
      insert into immobilie_portal_status as s (immobilie_id, portal, status, meldung, uebertragen_am, portal_url, quelle)
        values (immo, v_portal, ereignis, v_meldung, m.gesendet_am, v_url, 'importbericht')
        on conflict (immobilie_id, portal) do update set
          status = case when excluded.status = 'fehler' and s.status = 'inseriert' and s.quelle <> 'world' then 'inseriert' else excluded.status end,
          meldung = excluded.meldung, uebertragen_am = excluded.uebertragen_am,
          portal_url = coalesce(excluded.portal_url, s.portal_url), quelle = excluded.quelle
        where s.manuell = false and (s.uebertragen_am is null or s.uebertragen_am <= excluded.uebertragen_am);
      treffer := treffer + 1;
    end loop;
  elsif abs like '%kleinanzeigen.de' and m.betreff ilike '%Import zu Kleinanzeigen%' then
    v_portal := 'kleinanzeigen';
    foreach para in array regexp_split_to_array(m.text, E'\n\\s*\n') loop
      kopf := split_part(para, E'\n', 1);
      if kopf ~* '^Erfolgreich (aktualisierte|neue) Objekte' then ereignis := 'inseriert';
      elsif kopf ~* '^Erfolgreich gelöschte Objekte' then ereignis := 'entfernt';
      elsif kopf ~* '^Fehlgeschlagene' then ereignis := 'fehler';
      else continue; end if;
      for z in select r[1] as nr, r[2] as aid from regexp_matches(para, 'Objekt-Nr\.: ([^,\n]+)(?:, Anzeigen-Id: (\d+))?', 'g') as r loop
        nr := trim(z.nr);
        select id into immo from immobilien where immo_nr = nr limit 1;
        if immo is null then continue; end if;
        v_url := case when z.aid is not null then 'https://www.kleinanzeigen.de/s-anzeige/'
               || coalesce((select nullif(btrim(anbieter_nr), '') from public.portal_zugaenge
                             where portal = 'kleinanzeigen' limit 1), 'openimmo')
               || '/' || z.aid else null end;
        v_meldung := 'Importbericht: ' || kopf;
        if ereignis = 'fehler' then v_meldung := v_meldung || ' — ' || left(trim(regexp_replace((regexp_match(para, 'Details: ([\s\S]*)'))[1], '\s+', ' ', 'g')), 200); end if;
        insert into immobilie_portal_status as s (immobilie_id, portal, status, meldung, uebertragen_am, portal_url, quelle)
          values (immo, v_portal, ereignis, v_meldung, m.gesendet_am, v_url, 'importbericht')
          on conflict (immobilie_id, portal) do update set
            status = case when excluded.status = 'fehler' and s.status = 'inseriert' and s.quelle <> 'world' then 'inseriert' else excluded.status end,
            meldung = excluded.meldung, uebertragen_am = excluded.uebertragen_am,
            portal_url = coalesce(excluded.portal_url, s.portal_url), quelle = excluded.quelle
          where s.manuell = false and (s.uebertragen_am is null or s.uebertragen_am <= excluded.uebertragen_am);
        treffer := treffer + 1;
      end loop;
    end loop;
  end if;
  return treffer;
end $function$
;
CREATE OR REPLACE FUNCTION public.profiles_schutz_privilegien()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not is_chef() then
    new.role     := old.role;
    new.stufe    := old.stufe;
    new.firma_id := old.firma_id;
    new.rechte   := old.rechte;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.push_termin_erinnerungen_senden()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
  r record;
  n integer := 0;
begin
  delete from push_termin_erinnerungen where gesendet_am < now() - interval '30 days';

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_hook_secret';
  if v_secret is null then
    raise warning 'push_termin_erinnerungen_senden: Vault-Secret push_hook_secret fehlt';
    return 0;
  end if;

  for r in
    select t.id as termin_id, p.id as profile_id
    from termine t
    join profiles p
      on p.role in ('chef', 'mitarbeiter')
     and coalesce(p.push_termine, true)
     and (p.id = t.ersteller_id
          or (t.teilnehmer is not null
              and lower(trim(p.name)) in (select lower(trim(x)) from unnest(t.teilnehmer) x)))
    where coalesce(t.ganztags, false) = false
      and t.uhrzeit is not null
      and coalesce(t.status, '') <> 'storniert'
      and coalesce(t.art, '') <> 'Urlaub'
      and t.datum between (now() at time zone 'Europe/Berlin')::date
                      and (now() at time zone 'Europe/Berlin')::date + 1
      and ((t.datum + t.uhrzeit) at time zone 'Europe/Berlin') > now()
      and ((t.datum + t.uhrzeit) at time zone 'Europe/Berlin') <= now() + interval '60 minutes'
      and not exists (select 1 from push_termin_erinnerungen e
                       where e.termin_id = t.id and e.profile_id = p.id)
      and exists (select 1 from push_geraete g where g.profile_id = p.id and g.aktiv)
  loop
    insert into push_termin_erinnerungen (termin_id, profile_id)
      values (r.termin_id, r.profile_id) on conflict do nothing;
    perform net.http_post(
      url     := public.eigene_funktions_url('push-senden'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body    := jsonb_build_object('termin_id', r.termin_id, 'profile_id', r.profile_id),
      timeout_milliseconds := 8000
    );
    n := n + 1;
  end loop;
  return n;
end
$function$
;
CREATE OR REPLACE FUNCTION public.radar_eur(betrag numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select replace(to_char(betrag, 'FM999G999G999'), ',', '.') || ' EUR';
$function$
;
CREATE OR REPLACE FUNCTION public.radar_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.radar_upsert(daten jsonb)
 RETURNS radar_objekte
 LANGUAGE plpgsql
AS $function$
declare
  fp text;
  vorher public.radar_objekte;
  ergebnis public.radar_objekte;
  neuer_preis numeric := nullif(daten->>'preis','')::numeric;
  aenderung_text text;
begin
  fp := coalesce(
    nullif(daten->>'fingerprint',''),
    lower(regexp_replace(
      concat_ws('|',
        coalesce(daten->>'plz',''),
        coalesce(daten->>'ort',''),
        coalesce(daten->>'strasse',''),
        coalesce(daten->>'objektart',''),
        coalesce(daten->>'wohnflaeche',''),
        coalesce(daten->>'zimmer','')
      ), '\s+', '', 'g'))
  );

  select * into vorher from public.radar_objekte where fingerprint = fp;

  if vorher.id is null then
    insert into public.radar_objekte (
      fingerprint, quelle, quelle_url, vermarktungsart, objektart,
      strasse, plz, ort, ortsteil, wohnflaeche, grundstueck, zimmer, baujahr,
      preis, anbieter_typ, anbieter_name, telefon, email,
      titel, beschreibung, merkmale, rohtext, erfasst_von
    ) values (
      fp,
      coalesce(daten->>'quelle','manuell'),
      daten->>'quelle_url',
      coalesce(daten->>'vermarktungsart','kauf'),
      daten->>'objektart',
      daten->>'strasse', daten->>'plz', daten->>'ort', daten->>'ortsteil',
      nullif(daten->>'wohnflaeche','')::numeric,
      nullif(daten->>'grundstueck','')::numeric,
      nullif(daten->>'zimmer','')::numeric,
      nullif(daten->>'baujahr','')::integer,
      neuer_preis,
      coalesce(daten->>'anbieter_typ','unbekannt'),
      daten->>'anbieter_name', daten->>'telefon', daten->>'email',
      daten->>'titel', daten->>'beschreibung',
      coalesce(daten->'merkmale','{}'::jsonb),
      daten->>'rohtext',
      auth.uid()
    ) returning * into ergebnis;

    insert into public.radar_historie (objekt_id, preis, aenderung, quelle, quelle_url, rohtext)
    values (ergebnis.id, neuer_preis, 'Ersterfassung', ergebnis.quelle, ergebnis.quelle_url, daten->>'rohtext');
  else
    if neuer_preis is not null and vorher.preis is not null and neuer_preis <> vorher.preis then
      aenderung_text := case when neuer_preis < vorher.preis then 'Preissenkung' else 'Preiserhöhung' end
        || ' von ' || public.radar_eur(vorher.preis) || ' auf ' || public.radar_eur(neuer_preis);
    else
      aenderung_text := 'erneut gesehen';
    end if;

    update public.radar_objekte set
      zuletzt_gesehen = current_date,
      aktiv = true,
      preis = coalesce(neuer_preis, preis),
      quelle_url = coalesce(daten->>'quelle_url', quelle_url),
      telefon = coalesce(nullif(daten->>'telefon',''), telefon),
      email = coalesce(nullif(daten->>'email',''), email),
      anbieter_name = coalesce(nullif(daten->>'anbieter_name',''), anbieter_name),
      anbieter_typ = coalesce(nullif(daten->>'anbieter_typ',''), anbieter_typ),
      beschreibung = coalesce(nullif(daten->>'beschreibung',''), beschreibung)
    where id = vorher.id
    returning * into ergebnis;

    insert into public.radar_historie (objekt_id, preis, aenderung, quelle, quelle_url, rohtext)
    values (ergebnis.id, neuer_preis, aenderung_text, coalesce(daten->>'quelle', ergebnis.quelle), daten->>'quelle_url', daten->>'rohtext');
  end if;

  return ergebnis;
end $function$
;
CREATE OR REPLACE FUNCTION public.rechnung_bezahlt_markieren(p_rechnung_id uuid, p_bezahlt_am date DEFAULT CURRENT_DATE, p_bezahlt_betrag numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aktuelle_role text;
  v_aktuelle_name text;
  v_status text;
  v_brutto numeric;
BEGIN
  SELECT role, name INTO v_aktuelle_role, v_aktuelle_name FROM public.profiles WHERE id = auth.uid();
  IF v_aktuelle_role NOT IN ('chef','mitarbeiter') THEN
    RAISE EXCEPTION 'Nur Makler duerfen Rechnungen als bezahlt markieren.';
  END IF;

  SELECT status, bruttobetrag INTO v_status, v_brutto FROM public.rechnungen WHERE id = p_rechnung_id;
  IF v_status NOT IN ('gestellt','storno_rechnung') THEN
    RAISE EXCEPTION 'Nur gestellte Rechnungen koennen bezahlt markiert werden. Status: %', v_status;
  END IF;

  UPDATE public.rechnungen
  SET status = 'bezahlt',
      bezahlt_am = p_bezahlt_am,
      bezahlt_betrag = COALESCE(p_bezahlt_betrag, v_brutto)
  WHERE id = p_rechnung_id;

  INSERT INTO public.rechnungen_audit(rechnung_id, user_id, user_name, aktion, neue_daten)
  VALUES (p_rechnung_id, auth.uid(), v_aktuelle_name, 'bezahlt_markiert',
          jsonb_build_object('bezahlt_am', p_bezahlt_am, 'bezahlt_betrag', COALESCE(p_bezahlt_betrag, v_brutto)));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_delete_check()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.ist_test = true THEN RETURN OLD; END IF;
  IF OLD.status IN ('gestellt','storno_rechnung','storniert','bezahlt') THEN
    RAISE EXCEPTION 'Gestellte Rechnungen koennen nicht geloescht werden (GoBD).';
  END IF;
  RETURN OLD;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_position_unveraenderlich_check()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE r_status text; r_test boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status, ist_test INTO r_status, r_test FROM public.rechnungen WHERE id = OLD.rechnung_id;
  ELSE
    SELECT status, ist_test INTO r_status, r_test FROM public.rechnungen WHERE id = NEW.rechnung_id;
  END IF;
  IF r_test = true THEN RETURN COALESCE(NEW, OLD); END IF;
  IF r_status IN ('gestellt','storno_rechnung','storniert','bezahlt') THEN
    RAISE EXCEPTION 'Positionen gestellter Rechnungen sind unveraenderlich (GoBD).';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_positionen_aenderung()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.rechnung_summen_neu_berechnen(COALESCE(NEW.rechnung_id, OLD.rechnung_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_startnummer_info(p_firma_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role text; v_typ text; v_inhaber uuid; v_mit_jahr boolean; v_jahr int; v_letzte int; v_gestellt int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('chef','mitarbeiter') then raise exception 'Nicht berechtigt.'; end if;
  select typ, inhaber_user_id, coalesce(rechnung_nummer_mit_jahr,false)
    into v_typ, v_inhaber, v_mit_jahr from public.firma_stammdaten where id = p_firma_id;
  if v_typ is null then raise exception 'Absender nicht gefunden.'; end if;
  if v_role <> 'chef' and (v_typ <> 'persoenlich' or v_inhaber <> auth.uid()) then
    raise exception 'Nicht berechtigt.'; end if;
  v_jahr := case when v_mit_jahr then extract(year from now())::int else 0 end;
  select letzte_nummer into v_letzte from public.rechnung_nummern_sequence where firma_id = p_firma_id and jahr = v_jahr;
  select count(*) into v_gestellt from public.rechnungen
    where absender_firma_id = p_firma_id and rechnungsnummer is not null and coalesce(ist_test,false) = false;
  return jsonb_build_object('editierbar', v_gestellt = 0, 'gestellt', v_gestellt, 'naechste_startnummer', coalesce(v_letzte,0) + 1);
end; $function$
;
CREATE OR REPLACE FUNCTION public.rechnung_startnummer_setzen(p_firma_id uuid, p_startnummer integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role text; v_typ text; v_inhaber uuid; v_mit_jahr boolean; v_jahr int; v_gestellt int; v_seed int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('chef','mitarbeiter') then raise exception 'Nicht berechtigt.'; end if;
  select typ, inhaber_user_id, coalesce(rechnung_nummer_mit_jahr,false)
    into v_typ, v_inhaber, v_mit_jahr from public.firma_stammdaten where id = p_firma_id;
  if v_typ is null then raise exception 'Absender nicht gefunden.'; end if;
  if v_role <> 'chef' and (v_typ <> 'persoenlich' or v_inhaber <> auth.uid()) then
    raise exception 'Nur der Inhaber darf die Startnummer setzen.'; end if;
  if p_startnummer is null or p_startnummer < 1 then raise exception 'Startnummer muss mindestens 1 sein.'; end if;
  select count(*) into v_gestellt from public.rechnungen
    where absender_firma_id = p_firma_id and rechnungsnummer is not null and coalesce(ist_test,false) = false;
  if v_gestellt > 0 then
    raise exception 'Startnummer nicht mehr aenderbar: es wurden bereits % Rechnung(en) gestellt.', v_gestellt; end if;
  v_jahr := case when v_mit_jahr then extract(year from now())::int else 0 end;
  v_seed := p_startnummer - 1;
  insert into public.rechnung_nummern_sequence(firma_id, jahr, letzte_nummer)
  values (p_firma_id, v_jahr, v_seed)
  on conflict (firma_id, jahr) do update set letzte_nummer = v_seed;
  return jsonb_build_object('ok', true, 'jahr', v_jahr, 'startnummer', p_startnummer);
end; $function$
;
CREATE OR REPLACE FUNCTION public.rechnung_stellen(p_rechnung_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text; v_name text; v_status text; v_nummer text;
  v_jahr int; v_anzahl_pos int; v_ausst date;
  v_firma_id uuid; v_ist_test boolean;
BEGIN
  SELECT role, name INTO v_role, v_name FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('chef','mitarbeiter') THEN
    RAISE EXCEPTION 'Nur Makler duerfen Rechnungen stellen.';
  END IF;

  SELECT status, ausstellungsdatum, absender_firma_id, ist_test
    INTO v_status, v_ausst, v_firma_id, v_ist_test
  FROM public.rechnungen WHERE id = p_rechnung_id;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Rechnung nicht gefunden.'; END IF;
  IF v_status <> 'entwurf' THEN RAISE EXCEPTION 'Nur Entwuerfe stellen. Status: %', v_status; END IF;
  IF v_firma_id IS NULL THEN RAISE EXCEPTION 'Keine Absender-Firma gewaehlt.'; END IF;

  SELECT COUNT(*) INTO v_anzahl_pos FROM public.rechnung_positionen WHERE rechnung_id = p_rechnung_id;
  IF v_anzahl_pos = 0 THEN RAISE EXCEPTION 'Rechnung hat keine Positionen.'; END IF;

  IF v_ausst IS NULL THEN
    UPDATE public.rechnungen SET ausstellungsdatum = CURRENT_DATE WHERE id = p_rechnung_id;
    v_ausst := CURRENT_DATE;
  END IF;

  v_jahr := EXTRACT(YEAR FROM v_ausst)::int;
  v_nummer := public.naechste_rechnungsnummer(v_firma_id, v_jahr, v_ist_test);

  UPDATE public.rechnungen
  SET rechnungsnummer = v_nummer, status = 'gestellt',
      gestellt_am = now(), gestellt_durch = auth.uid()
  WHERE id = p_rechnung_id;

  INSERT INTO public.rechnungen_audit(rechnung_id, user_id, user_name, aktion, neue_daten)
  VALUES (p_rechnung_id, auth.uid(), v_name, 'stellen',
          jsonb_build_object('nummer', v_nummer, 'ist_test', v_ist_test));

  RETURN v_nummer;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_stornieren(p_rechnung_id uuid, p_grund text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aktuelle_role text;
  v_aktuelle_name text;
  v_orig record;
  v_storno_id uuid;
  v_storno_nummer text;
  v_jahr int;
BEGIN
  SELECT role, name INTO v_aktuelle_role, v_aktuelle_name
  FROM public.profiles WHERE id = auth.uid();
  IF v_aktuelle_role NOT IN ('chef','mitarbeiter') THEN
    RAISE EXCEPTION 'Nur Makler duerfen Rechnungen stornieren.';
  END IF;

  SELECT * INTO v_orig FROM public.rechnungen WHERE id = p_rechnung_id;
  IF v_orig.id IS NULL THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden.';
  END IF;
  IF v_orig.status <> 'gestellt' AND v_orig.status <> 'bezahlt' THEN
    RAISE EXCEPTION 'Nur gestellte oder bezahlte Rechnungen koennen storniert werden. Status: %', v_orig.status;
  END IF;

  v_jahr := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_storno_nummer := public.naechste_rechnungsnummer(v_orig.absender_firma_id, v_jahr, v_orig.ist_test);

  -- Storno-Rechnung zunaechst als ENTWURF anlegen, damit die Positionen eingefuegt
  -- werden duerfen (GoBD-Trigger sperrt Positionen bei gestellten/Storno-Status).
  INSERT INTO public.rechnungen(
    rechnungsnummer, status, empfaenger_anrede, empfaenger_name, empfaenger_zusatz,
    empfaenger_strasse, empfaenger_plz, empfaenger_ort, empfaenger_land, empfaenger_email,
    ausstellungsdatum, leistungszeitraum_von, leistungszeitraum_bis,
    einleitungstext, schlusstext, vertrag_id,
    storno_fuer,
    absender_firma_id, ist_test,
    nettobetrag, mwst_betrag, bruttobetrag,
    ersteller_id
  ) VALUES (
    v_storno_nummer, 'entwurf',
    v_orig.empfaenger_anrede, v_orig.empfaenger_name, v_orig.empfaenger_zusatz,
    v_orig.empfaenger_strasse, v_orig.empfaenger_plz, v_orig.empfaenger_ort, v_orig.empfaenger_land, v_orig.empfaenger_email,
    CURRENT_DATE, v_orig.leistungszeitraum_von, v_orig.leistungszeitraum_bis,
    'Stornorechnung zu Rechnung ' || v_orig.rechnungsnummer || COALESCE(' - Grund: ' || p_grund, ''),
    v_orig.schlusstext, v_orig.vertrag_id,
    p_rechnung_id,
    v_orig.absender_firma_id, v_orig.ist_test,
    -v_orig.nettobetrag, -v_orig.mwst_betrag, -v_orig.bruttobetrag,
    auth.uid()
  ) RETURNING id INTO v_storno_id;

  -- Original-Positionen mit negativen Mengen kopieren (Status=entwurf -> erlaubt;
  -- Summen werden durch Trigger automatisch neu berechnet).
  INSERT INTO public.rechnung_positionen(rechnung_id, reihenfolge, beschreibung, menge, einheit, einzelpreis_netto, mwst_satz)
  SELECT v_storno_id, reihenfolge, 'STORNO: ' || beschreibung, -menge, einheit, einzelpreis_netto, mwst_satz
  FROM public.rechnung_positionen WHERE rechnung_id = p_rechnung_id;

  -- Storno-Rechnung finalisieren (Entwurf -> Storno-Rechnung; vom Trigger erlaubt, da OLD=entwurf).
  UPDATE public.rechnungen
  SET status = 'storno_rechnung', gestellt_am = now(), gestellt_durch = auth.uid()
  WHERE id = v_storno_id;

  -- Original auf "storniert" setzen (nur Status/Verweis -> keine GoBD-Schutzfelder).
  UPDATE public.rechnungen SET status = 'storniert', storniert_durch = v_storno_id
  WHERE id = p_rechnung_id;

  -- Audit
  INSERT INTO public.rechnungen_audit(rechnung_id, user_id, user_name, aktion, neue_daten)
  VALUES (p_rechnung_id, auth.uid(), v_aktuelle_name, 'stornieren',
          jsonb_build_object('storno_id', v_storno_id, 'storno_nummer', v_storno_nummer, 'grund', p_grund));

  RETURN v_storno_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_summen_neu_berechnen(p_rechnung_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.rechnungen WHERE id = p_rechnung_id;
  -- Nur fuer Entwuerfe automatisch neuberechnen
  IF v_status <> 'entwurf' THEN RETURN; END IF;

  UPDATE public.rechnungen r
  SET nettobetrag = COALESCE(s.netto, 0),
      mwst_betrag = COALESCE(s.mwst, 0),
      bruttobetrag = COALESCE(s.netto, 0) + COALESCE(s.mwst, 0)
  FROM (
    SELECT
      SUM(position_netto) AS netto,
      SUM(position_netto * mwst_satz / 100) AS mwst
    FROM public.rechnung_positionen
    WHERE rechnung_id = p_rechnung_id
  ) s
  WHERE r.id = p_rechnung_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_unveraenderlich_check()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.ist_test = true THEN
    NEW.updated_at = now(); RETURN NEW;
  END IF;
  IF OLD.status IN ('gestellt','storno_rechnung','storniert','bezahlt') THEN
    IF NEW.rechnungsnummer IS DISTINCT FROM OLD.rechnungsnummer
       OR NEW.empfaenger_name IS DISTINCT FROM OLD.empfaenger_name
       OR NEW.empfaenger_strasse IS DISTINCT FROM OLD.empfaenger_strasse
       OR NEW.empfaenger_plz IS DISTINCT FROM OLD.empfaenger_plz
       OR NEW.empfaenger_ort IS DISTINCT FROM OLD.empfaenger_ort
       OR NEW.ausstellungsdatum IS DISTINCT FROM OLD.ausstellungsdatum
       OR NEW.nettobetrag IS DISTINCT FROM OLD.nettobetrag
       OR NEW.mwst_betrag IS DISTINCT FROM OLD.mwst_betrag
       OR NEW.bruttobetrag IS DISTINCT FROM OLD.bruttobetrag
    THEN
      RAISE EXCEPTION 'Gestellte Rechnungen sind unveraenderlich (GoBD). Status %, Nummer %.', OLD.status, OLD.rechnungsnummer;
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rechnung_vorlage_aus_objektnachweis(p_objektnachweis_id uuid, p_typ text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text; v_on record; v_vertrag record;
  v_firma_id uuid; v_result jsonb;
  v_beschreibung text; v_objekt_zeile text;
  v_brutto numeric; v_netto numeric;
  v_kaufpreis numeric; v_prov_prozent numeric;
  v_erster_kaeufer jsonb; v_kaeufer_name text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('chef','mitarbeiter') THEN RAISE EXCEPTION 'Nicht berechtigt.'; END IF;
  IF p_typ NOT IN ('verkaeufer_provision','kaeufer_provision') THEN
    RAISE EXCEPTION 'Ungueltiger Typ: %', p_typ;
  END IF;

  SELECT * INTO v_on FROM public.objektnachweise WHERE id = p_objektnachweis_id;
  IF v_on.id IS NULL THEN RAISE EXCEPTION 'Objektnachweis nicht gefunden.'; END IF;

  v_kaufpreis := public.parse_deutsch_zahl(v_on.kaufpreis);
  v_prov_prozent := public.parse_deutsch_zahl(v_on.provision);

  IF v_on.vertrag_id IS NOT NULL THEN
    SELECT * INTO v_vertrag FROM public.vertraege WHERE id = v_on.vertrag_id;
    v_firma_id := v_vertrag.absender_firma_id;
  END IF;

  IF v_firma_id IS NULL THEN
    SELECT id INTO v_firma_id FROM public.firma_stammdaten
    WHERE typ = 'standort' AND coalesce(aktiv, true)
    ORDER BY sortierung, firma_name LIMIT 1;
  END IF;

  v_objekt_zeile := COALESCE(v_on.objekt_bezeichnung, '');
  IF COALESCE(v_on.objekt_strasse, '') <> '' THEN
    v_objekt_zeile := v_objekt_zeile
      || CASE WHEN v_objekt_zeile <> '' THEN ' - ' ELSE '' END
      || v_on.objekt_strasse
      || ' ' || COALESCE(v_on.objekt_plz, '')
      || ' ' || COALESCE(v_on.objekt_ort, '');
  END IF;

  v_brutto := v_kaufpreis * v_prov_prozent / 100.0;
  v_netto := ROUND(v_brutto / 1.19, 2);

  IF p_typ = 'verkaeufer_provision' THEN
    v_beschreibung := 'Vermittlung Immobilienverkauf' || E'\n' || v_objekt_zeile
      || E'\nKaufpreis ' || TO_CHAR(v_kaufpreis, 'FM999G999G999D00') || ' EUR'
      || ' bei ' || TO_CHAR(v_prov_prozent, 'FM999D00') || '% Brutto-Provision';

    v_result := jsonb_build_object(
      'typ', 'verkaeufer_provision',
      'absender_firma_id', v_firma_id,
      'empfaenger_anrede', '',
      'empfaenger_name', COALESCE(v_vertrag.verkaeufer_name, ''),
      'empfaenger_strasse', COALESCE(v_vertrag.verkaeufer_strasse, ''),
      'empfaenger_plz', COALESCE(v_vertrag.verkaeufer_plz, ''),
      'empfaenger_ort', COALESCE(v_vertrag.verkaeufer_ort, ''),
      'empfaenger_land', 'Deutschland',
      'empfaenger_email', '',
      'objektnachweis_id', p_objektnachweis_id,
      'vertrag_id', v_on.vertrag_id,
      'positionen', jsonb_build_array(jsonb_build_object(
        'beschreibung', v_beschreibung,
        'menge', 1,
        'einzelpreis_netto', v_netto,
        'mwst_satz', 19
      )),
      'meta', jsonb_build_object(
        'kaufpreis', v_kaufpreis,
        'provision_prozent', v_prov_prozent,
        'brutto', v_brutto
      )
    );
  ELSE
    v_erster_kaeufer := COALESCE(v_on.kaeufer->0, '{}'::jsonb);
    v_kaeufer_name := TRIM(
      COALESCE(v_erster_kaeufer->>'vorname','') || ' ' || COALESCE(v_erster_kaeufer->>'nachname','')
    );

    v_beschreibung := 'Vermittlung Immobilienkauf' || E'\n' || v_objekt_zeile
      || E'\nKaufpreis ' || TO_CHAR(v_kaufpreis, 'FM999G999G999D00') || ' EUR'
      || ' bei ' || TO_CHAR(v_prov_prozent, 'FM999D00') || '% Brutto-Provision';

    v_result := jsonb_build_object(
      'typ', 'kaeufer_provision',
      'absender_firma_id', v_firma_id,
      'empfaenger_anrede', COALESCE(v_erster_kaeufer->>'anrede', ''),
      'empfaenger_name', v_kaeufer_name,
      'empfaenger_strasse', COALESCE(v_erster_kaeufer->>'strasse', ''),
      'empfaenger_plz', COALESCE(v_erster_kaeufer->>'plz', ''),
      'empfaenger_ort', COALESCE(v_erster_kaeufer->>'ort', ''),
      'empfaenger_land', 'Deutschland',
      'empfaenger_email', '',
      'objektnachweis_id', p_objektnachweis_id,
      'vertrag_id', v_on.vertrag_id,
      'positionen', jsonb_build_array(jsonb_build_object(
        'beschreibung', v_beschreibung,
        'menge', 1,
        'einzelpreis_netto', v_netto,
        'mwst_satz', 19
      )),
      'meta', jsonb_build_object(
        'kaufpreis', v_kaufpreis,
        'provision_prozent', v_prov_prozent,
        'brutto', v_brutto
      )
    );
  END IF;

  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reservierung_status_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.projekt_einheit_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  if new.status in ('unterschrieben','bezahlt') then
    update projekt_einheiten set status = 'reserviert'
      where id = new.projekt_einheit_id and status <> 'verkauft';
    if new.projekt_anfrage_id is not null then
      update projekt_anfragen set status = 'bestaetigt'
        where id = new.projekt_anfrage_id and status = 'offen';
    end if;
  elsif new.status = 'kauf_vollzogen' then
    update projekt_einheiten set status = 'verkauft'
      where id = new.projekt_einheit_id;
  elsif new.status = 'storniert' then
    if not exists (
      select 1 from reservierungen_neubau r
      where r.projekt_einheit_id = new.projekt_einheit_id
        and r.id <> new.id
        and r.status in ('unterschrieben','bezahlt','kauf_vollzogen')
    ) then
      update projekt_einheiten set status = 'verfuegbar'
        where id = new.projekt_einheit_id and status = 'reserviert';
    end if;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.set_checkliste_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_eigentuemer_dokumente_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_eigentuemer_personen_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN new.updated_at = now(); RETURN new; END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_eigentuemer_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_expose_entwuerfe_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_marketing_print_vorlagen_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_notar_laufzettel_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_rundgaenge_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_uebergabeprotokoll_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at_mail_postfaecher()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at_mietanfragen()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at_reservierungen()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.signatur_reservierung_abschluss()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.dokument_typ = 'reservierung' and new.status = 'abgeschlossen'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update reservierungen_neubau set status = 'unterschrieben'
      where id = new.vertrag_id and status in ('entwurf','versendet');
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.suchkriterien_abgleich(p_immobilie uuid DEFAULT NULL::uuid, p_kontakt uuid DEFAULT NULL::uuid)
 RETURNS TABLE(neu integer, geaendert integer, entfernt integer, gesamt integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n_neu int := 0; n_geaendert int := 0; n_entfernt int := 0; n_gesamt int := 0;
begin
  create temp table if not exists tmp_treffer (kontakt_id uuid, immobilie_id uuid, punkte int, gruende text[]) on commit drop;
  truncate tmp_treffer;
  insert into tmp_treffer
    select q.kontakt_id, q.immobilie_id, q.punkte, q.gruende from (
      select k.id as kontakt_id, o.id as immobilie_id, p.punkte, p.gruende,
             row_number() over (partition by k.id, o.id order by p.punkte desc) as rn
      from immobilien o
      cross join kontakte k
      cross join lateral (
        select x.sp from (select k.such_profil as sp union all select jsonb_array_elements(coalesce(k.such_profil_weitere, '[]'::jsonb))) x
        where x.sp is not null and suchprofil_hat_inhalt(x.sp)
          and (jsonb_typeof(x.sp->'vermarktungsart') <> 'array' or jsonb_array_length(x.sp->'vermarktungsart') = 0
               or (x.sp->'vermarktungsart') ? (case when o.vertragsart ilike 'verm%' then 'miete' else 'kauf' end))
          and (jsonb_typeof(x.sp->'objektarten') <> 'array' or jsonb_array_length(x.sp->'objektarten') = 0
               or (x.sp->'objektarten') ? (case when o.objektart ilike 'Sonstige%' then 'Sonstiges' else coalesce(o.objektart, '') end)
               or (x.sp->'objektarten') ? 'Mehrfamilienhaus' or (x.sp->'objektarten') ? 'Haus')
      ) s
      cross join lateral suchprofil_punkte_objekt(s.sp, o) p
      where coalesce(o.versteckt, false) = false and coalesce(o.status, '') <> 'archiviert'
        and (p_immobilie is null or o.id = p_immobilie)
        and (p_kontakt is null or k.id = p_kontakt)
        and k.aktiv and (k.such_profil is not null or k.such_profil_weitere is not null)
        and p.punkte > 0
    ) q where q.rn = 1;

  with alt as (
    select t.kontakt_id, t.immobilie_id from suchkriterien_treffer t
    where (p_immobilie is null or t.immobilie_id = p_immobilie) and (p_kontakt is null or t.kontakt_id = p_kontakt)
  ), weg as (
    delete from suchkriterien_treffer t using alt
    where t.kontakt_id = alt.kontakt_id and t.immobilie_id = alt.immobilie_id
      and not exists (select 1 from tmp_treffer x where x.kontakt_id = t.kontakt_id and x.immobilie_id = t.immobilie_id)
    returning 1
  ) select count(*) into n_entfernt from weg;

  with ins as (
    insert into suchkriterien_treffer (kontakt_id, immobilie_id, punkte, gruende)
    select kontakt_id, immobilie_id, punkte, gruende from tmp_treffer
    on conflict (kontakt_id, immobilie_id) do update
      set punkte = excluded.punkte, gruende = excluded.gruende, aktualisiert_am = now()
      where suchkriterien_treffer.punkte <> excluded.punkte or suchkriterien_treffer.gruende <> excluded.gruende
    returning (xmax = 0) as ist_neu
  ) select count(*) filter (where ist_neu), count(*) filter (where not ist_neu) into n_neu, n_geaendert from ins;

  select count(*) into n_gesamt from suchkriterien_treffer t
    where (p_immobilie is null or t.immobilie_id = p_immobilie) and (p_kontakt is null or t.kontakt_id = p_kontakt);
  return query select n_neu, n_geaendert, n_entfernt, n_gesamt;
end
$function$
;
CREATE OR REPLACE FUNCTION public.suchkriterien_abgleich_lauf()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seit timestamptz; v_secret text; r record; o_n int := 0; k_n int := 0; m_n int := 0;
begin
  select zuletzt into v_seit from suchkriterien_lauf where id = 1;
  if v_seit is null or (select coalesce(letzter_voll, 'epoch') from suchkriterien_lauf where id = 1) < now() - interval '1 day' then
    perform suchkriterien_abgleich(null, null);
    update suchkriterien_lauf set letzter_voll = now() where id = 1;
    o_n := -1;
  else
    for r in select id from immobilien where coalesce(updated_at, created_at) >= v_seit - interval '2 minutes' loop
      perform suchkriterien_abgleich(r.id, null); o_n := o_n + 1;
    end loop;
    for r in select id from kontakte where such_profil is not null and coalesce(nullif(such_profil->>'geaendert_am','')::timestamptz, updated_at, created_at) >= v_seit - interval '2 minutes' loop
      perform suchkriterien_abgleich(null, r.id); k_n := k_n + 1;
    end loop;
  end if;
  update suchkriterien_lauf set zuletzt = now() where id = 1;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_hook_secret';
  for r in
    select t.immobilie_id, o.immo_nr, coalesce(o.objekttitel, o.bezeichnung) as titel, coalesce(o.zustaendig_id, o.ersteller_id) as profil,
           count(*) as n, (array_agg(coalesce(nullif(trim(concat_ws(' ', k.vorname, k.nachname)), ''), k.firma) order by t.punkte desc))[1:3] as top
    from suchkriterien_treffer t join immobilien o on o.id = t.immobilie_id join kontakte k on k.id = t.kontakt_id
    where t.gemeldet_am is null and coalesce(o.updated_at, o.created_at) > now() - interval '30 days'
    group by t.immobilie_id, o.immo_nr, o.objekttitel, o.bezeichnung, o.zustaendig_id, o.ersteller_id
    order by max(t.gefunden_am) desc
  loop
    exit when m_n >= 8;
    update suchkriterien_treffer set gemeldet_am = now() where immobilie_id = r.immobilie_id and gemeldet_am is null;
    if v_secret is not null and r.profil is not null
       and exists (select 1 from profiles p where p.id = r.profil and coalesce(p.push_treffer, true))
       and exists (select 1 from push_geraete g where g.profile_id = r.profil and g.aktiv) then
      perform net.http_post(
        url := public.eigene_funktions_url('push-senden'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object('hinweis', jsonb_build_object(
          'profile_id', r.profil,
          'titel', format('%s Interessent%s passen zu %s', r.n, case when r.n = 1 then '' else 'en' end, coalesce(r.immo_nr, 'Objekt')),
          'untertitel', left(coalesce(r.titel, ''), 80),
          'text', array_to_string(r.top, ', ') || case when r.n > 3 then ' …' else '' end,
          'url', '#immobilien/' || r.immobilie_id::text, 'collapse', 'treffer-' || r.immobilie_id::text, 'ref_id', r.immobilie_id)),
        timeout_milliseconds := 8000);
      m_n := m_n + 1;
    end if;
  end loop;
  return jsonb_build_object('objekte', o_n, 'kontakte', k_n, 'meldungen', m_n);
end
$function$
;
CREATE OR REPLACE FUNCTION public.suchkriterien_nachfrage(p_vertragsart text, p_objektart text, p_plz text, p_ort text, p_preis numeric, p_zimmer numeric DEFAULT NULL::numeric, p_flaeche numeric DEFAULT NULL::numeric, p_lat numeric DEFAULT NULL::numeric, p_lon numeric DEFAULT NULL::numeric)
 RETURNS TABLE(anzahl integer, im_budget integer, beispiele text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with t as (
    select distinct on (k.id) k.id, coalesce(nullif(trim(concat_ws(' ', k.vorname, k.nachname)), ''), k.firma) as name, p.punkte, p.gruende
    from kontakte k
    cross join lateral (select x.sp from (select k.such_profil as sp union all select jsonb_array_elements(coalesce(k.such_profil_weitere, '[]'::jsonb))) x where x.sp is not null) s
    cross join lateral suchprofil_punkte(s.sp, p_vertragsart, p_objektart, null, null, p_plz, p_ort, p_preis, p_zimmer, p_flaeche, p_lat, p_lon) p
    where k.aktiv and (k.such_profil is not null or k.such_profil_weitere is not null) and p.punkte > 0
    order by k.id, p.punkte desc
  )
  select count(*)::int, count(*) filter (where 'im Budget' = any(gruende))::int,
         (array_agg(name order by punkte desc))[1:5]
  from t;
$function$
;
CREATE OR REPLACE FUNCTION public.suchkriterien_pflege()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0; ziel uuid; t_id uuid; name text;
begin
  for r in
    select k.id, k.vorname, k.nachname, k.firma, k.zustaendig_id, k.ersteller_id, k.such_profil
    from kontakte k
    where k.aktiv and k.such_profil is not null and coalesce(k.such_profil->>'status', 'aktiv') = 'aktiv'
      and (k.such_profil->'objektarten' is not null or k.such_profil->>'orte' is not null or k.such_profil->>'preis_bis' is not null)
      and coalesce(nullif(k.such_profil->>'geprueft_am','')::timestamptz, nullif(k.such_profil->>'geaendert_am','')::timestamptz, k.updated_at, k.created_at) < now() - interval '90 days'
      and coalesce(nullif(k.such_profil->>'erinnert_am','')::timestamptz, 'epoch') < now() - interval '90 days'
      and not exists (select 1 from vermerke v where v.kontakt_id = k.id and v.created_at > now() - interval '90 days')
    limit 40
  loop
    name := coalesce(nullif(trim(concat_ws(' ', r.vorname, r.nachname)), ''), r.firma, 'Kontakt');
    ziel := coalesce(r.zustaendig_id, r.ersteller_id, (select id from profiles where role = 'chef' order by created_at limit 1));
    insert into todos (titel, beschreibung, typ, status, prioritaet, faellig_am, ersteller_id, zustaendig_id, team_sichtbar, quelle, tags)
      values ('Sucht ' || name || ' noch? Suchkriterium prüfen', 'Das Suchkriterium ist seit über 90 Tagen unverändert und es gab keine Aktivität. Kurz nachfragen und im Adressbuch auf aktiv, pausiert oder erfüllt setzen.',
              'aufgabe', 'offen', 'normal', current_date, ziel, ziel, true, 'manuell', array['Wiedervorlage', 'Suchkriterium'])
      returning id into t_id;
    insert into todo_verknuepfung (todo_id, objekt_typ, objekt_id, label) values (t_id, 'kontakt', r.id, name) on conflict do nothing;
    update kontakte set such_profil = such_profil || jsonb_build_object('erinnert_am', now()) where id = r.id;
    n := n + 1;
  end loop;
  return n;
end
$function$
;
CREATE OR REPLACE FUNCTION public.suchkriterium_erfuellt_setzen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.rolle in ('kaeufer', 'mieter') then
    update kontakte set such_profil = such_profil || jsonb_build_object('status', 'erfuellt', 'erfuellt_am', now(), 'erfuellt_immobilie_id', new.immobilie_id)
      where id = new.kontakt_id and such_profil is not null and coalesce(such_profil->>'status', 'aktiv') = 'aktiv';
  end if;
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION public.suchprofil_hat_inhalt(sp jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select sp is not null and jsonb_typeof(sp) = 'object' and coalesce(sp->>'status', 'aktiv') = 'aktiv' and (
      nullif(trim(coalesce(sp->>'orte','')), '') is not null
      or nullif(trim(coalesce(sp->>'plz','')), '') is not null
      or coalesce(jsonb_typeof(sp->'umkreis') = 'object' and (sp->'umkreis'->>'lat') is not null, false)
      or nullif(coalesce(sp->>'preis_bis',''), '') is not null);
$function$
;
CREATE OR REPLACE FUNCTION public.suchprofil_punkte(sp jsonb, p_vertragsart text, p_objektart text, p_objekttyp text, p_nutzungsart text, p_plz text, p_ort text, p_preis numeric, p_zimmer numeric, p_flaeche numeric, p_lat numeric, p_lon numeric, OUT punkte integer, OUT gruende text[])
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_verm text; v_objart text; t text; ok boolean; hat_lage boolean := false; lage_ok boolean := false;
  d numeric; km numeric; preis_bis numeric; preis_von numeric; zi numeric; fl numeric;
  arr jsonb; pt integer := 0; gr text[] := '{}';
begin
  punkte := 0; gruende := '{}';
  if not coalesce(public.suchprofil_hat_inhalt(sp), false) then return; end if;

  v_verm := case when p_vertragsart ilike 'verm%' or p_vertragsart ilike 'miet%' then 'miete'
                 when p_vertragsart ilike 'verk%' or p_vertragsart ilike 'kauf%' then 'kauf' else null end;
  arr := sp->'vermarktungsart';
  if jsonb_typeof(arr) = 'array' and jsonb_array_length(arr) > 0 and v_verm is not null then
    if not coalesce(arr ? v_verm, false) then return; end if;
    pt := pt + 10; gr := gr || (case v_verm when 'kauf' then 'Kauf' else 'Miete' end)::text;
  end if;

  arr := sp->'objektarten';
  if jsonb_typeof(arr) = 'array' and jsonb_array_length(arr) > 0 then
    v_objart := case when p_objektart ilike 'Sonstige%' then 'Sonstiges' else coalesce(p_objektart, '') end;
    ok := coalesce(arr ? v_objart, false);
    if not ok and (arr ? 'Mehrfamilienhaus') and (p_objekttyp ilike '%mehrfamilien%' or p_nutzungsart ilike '%anlage%') then ok := true; v_objart := 'Mehrfamilienhaus'; end if;
    if not ok and (arr ? 'Haus') and p_objekttyp ilike '%haus%' then ok := true; v_objart := 'Haus'; end if;
    if not ok then return; end if;
    pt := pt + 20; gr := gr || v_objart::text;
  end if;

  if nullif(trim(coalesce(sp->>'orte','')), '') is not null then
    hat_lage := true;
    foreach t in array string_to_array(sp->>'orte', ',') loop
      t := trim(t);
      if t <> '' and p_ort is not null and (p_ort ilike t or p_ort ilike t || '%' or t ilike p_ort || '%') then lage_ok := true; gr := gr || ('Ort ' || p_ort)::text; exit; end if;
    end loop;
  end if;
  if not lage_ok and nullif(trim(coalesce(sp->>'plz','')), '') is not null then
    hat_lage := true;
    foreach t in array string_to_array(sp->>'plz', ',') loop
      t := regexp_replace(trim(t), '[^0-9]', '', 'g');
      if t <> '' and p_plz is not null and p_plz like t || '%' then lage_ok := true; gr := gr || ('PLZ ' || p_plz)::text; exit; end if;
    end loop;
  end if;
  if not lage_ok and coalesce(jsonb_typeof(sp->'umkreis') = 'object', false) and (sp->'umkreis'->>'lat') is not null then
    hat_lage := true;
    if p_lat is not null and p_lon is not null then
      km := coalesce(nullif(sp->'umkreis'->>'km','')::numeric, 20);
      d := 6371 * acos(least(1, greatest(-1,
             cos(radians((sp->'umkreis'->>'lat')::numeric)) * cos(radians(p_lat)) * cos(radians(p_lon) - radians((sp->'umkreis'->>'lon')::numeric))
           + sin(radians((sp->'umkreis'->>'lat')::numeric)) * sin(radians(p_lat)))));
      if d <= km then lage_ok := true; gr := gr || (round(d)::text || ' km von ' || coalesce(sp->'umkreis'->>'label', 'Umkreis'))::text; end if;
    end if;
  end if;
  if hat_lage then
    if not lage_ok then return; end if;
    pt := pt + 30;
  end if;

  preis_bis := nullif(sp->>'preis_bis','')::numeric; preis_von := nullif(sp->>'preis_von','')::numeric;
  if p_preis is not null and p_preis > 0 then
    if preis_bis is not null then
      if p_preis > preis_bis * 1.10 then return; end if;
      if p_preis <= preis_bis then pt := pt + 25; gr := gr || 'im Budget'::text;
      else pt := pt + 10; gr := gr || 'knapp über Budget'::text; end if;
    end if;
    if preis_von is not null and p_preis < preis_von * 0.85 then return; end if;
  elsif preis_bis is not null then
    pt := pt + 5;
  end if;

  zi := nullif(sp->>'zimmer_von','')::numeric;
  if zi is not null and p_zimmer is not null then
    if p_zimmer < zi - 0.5 then return; end if;
    pt := pt + 10; gr := gr || (p_zimmer::text || ' Zi.')::text;
  end if;
  fl := nullif(sp->>'flaeche_von','')::numeric;
  if fl is not null and p_flaeche is not null then
    if p_flaeche < fl * 0.9 then return; end if;
    pt := pt + 5; gr := gr || (round(p_flaeche)::text || ' m²')::text;
  end if;

  -- erst hier gilt das Ergebnis; jedes fruehere return laesst punkte = 0
  punkte := least(100, greatest(1, pt)); gruende := gr;
end
$function$
;
CREATE OR REPLACE FUNCTION public.suchprofil_punkte_objekt(sp jsonb, o immobilien, OUT punkte integer, OUT gruende text[])
 RETURNS record
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select * from public.suchprofil_punkte(sp, o.vertragsart, o.objektart, o.objekttyp, o.nutzungsart, o.plz, o.ort,
    case when o.vertragsart ilike 'verm%' then o.kaltmiete else o.angebotspreis end, o.zimmer, o.wohnflaeche,
    nullif(o.lage_koordinaten->>'lat','')::numeric, nullif(o.lage_koordinaten->>'lon','')::numeric);
$function$
;
CREATE OR REPLACE FUNCTION public.todo_nach_erledigung()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare naechste date;
begin
  if new.status = 'erledigt' and old.status is distinct from 'erledigt' then
    if new.wiederholung is not null and new.wiederholung <> '' and new.wiederholung <> 'keine' then
      naechste := case new.wiederholung
        when 'taeglich'     then coalesce(new.faellig_am, current_date) + interval '1 day'
        when 'woechentlich' then coalesce(new.faellig_am, current_date) + interval '7 days'
        when 'monatlich'    then coalesce(new.faellig_am, current_date) + interval '1 month'
        when 'jaehrlich'    then coalesce(new.faellig_am, current_date) + interval '1 year'
      end;
      if naechste is not null then
        insert into public.todos (titel, beschreibung, typ, prioritaet, tags, wiederholung,
                                  quelle, ersteller_id, zustaendig_id, team_sichtbar,
                                  faellig_am, faellig_zeit)
        values (new.titel, new.beschreibung, new.typ, new.prioritaet, new.tags, new.wiederholung,
                new.quelle, new.ersteller_id, new.zustaendig_id, new.team_sichtbar,
                naechste, new.faellig_zeit);
      end if;
    end if;

    update public.todos set status = 'offen'
     where wartet_auf_todo_id = new.id and status = 'wartet';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.todo_sichtbar(t_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from todos t
    where t.id = t_id
      and ( t.ersteller_id = auth.uid()
         or t.zustaendig_id = auth.uid()
         or (t.team_sichtbar and ist_team())
         or ist_chef() )
  )
$function$
;
CREATE OR REPLACE FUNCTION public.todos_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.trg_immobilien_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  ausnahmen text[] := array[
    'updated_at',
    -- Sync-Buchhaltung (Fix vom 04.08. vormittags):
    'onoffice_bilder_am', 'hauptbild_url', 'onoffice_synced_at',
    -- Exposé-Anreicherung (dieser Fix):
    'lage_koordinaten', 'lage_distanzen', 'expose_highlights', 'expose_slogan', 'expose_qr_url'
  ];
begin
  if (to_jsonb(old) - ausnahmen) is distinct from (to_jsonb(new) - ausnahmen) then
    new.updated_at := now();
  end if;
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION public.trg_portal_importbericht()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (lower(coalesce(new.absender_email,'')) like '%immowelt.de' and new.betreff ilike 'Importbericht%')
     or (lower(coalesce(new.absender_email,'')) like '%kleinanzeigen.de' and new.betreff ilike '%Import zu Kleinanzeigen%') then
    perform portal_importbericht_auswerten(new.id);
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.update_external_credentials_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.upload_benachrichtigung_planen(p_eigentuemer_id uuid, p_ansprechpartner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.upload_benachrichtigungen
  WHERE eigentuemer_id = p_eigentuemer_id
    AND versendet_am IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.upload_benachrichtigungen
      SET letzter_upload_at = now(),
          bereit_ab = now() + interval '5 minutes',
          upload_anzahl = upload_anzahl + 1,
          ansprechpartner_id = COALESCE(p_ansprechpartner_id, ansprechpartner_id)
    WHERE id = v_id;
  ELSE
    INSERT INTO public.upload_benachrichtigungen
      (eigentuemer_id, ansprechpartner_id)
    VALUES (p_eigentuemer_id, p_ansprechpartner_id)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.va_antraege_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end$function$
;
