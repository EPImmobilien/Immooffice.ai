-- Abgleich mit der Vorlage: Funktionen vom 26.09.2026
--
-- 19 neue Funktionen und 3 geaenderte: checkliste_aus_vorlage_kopieren,
-- objekt_kosten_berechnen, reservierung_status_sync.
--
-- Zur Messung: der erste Vergleich meldete neun geaenderte Funktionen. Sechs
-- davon waren kein Unterschied der Vorlage, sondern meine eigene
-- Neutralisierung aus 20260915000400_vorlage_funktionen.sql — dort stehen
-- Projekt-URL, eigene Mail-Domain, Kleinanzeigen-Kennung und Firmenname
-- bereits ersetzt. Gegengeprueft wurde, indem dieselben Ersetzungen auf den
-- heutigen Stand der Vorlage angewendet und dann verglichen wurde; sechs
-- Funktionen waren danach Zeichen fuer Zeichen gleich und bleiben deshalb hier
-- aussen vor. Keine der 22 Funktionen in dieser Datei enthaelt ein Kennzeichen
-- der Referenz.
--
-- check_function_bodies bleibt aus, weil SQL-Funktionen sich gegenseitig
-- aufrufen (expose_nachfass_aufgaben braucht expose_abgerufen und
-- oo_benutzer_profil) und die alphabetische Reihenfolge das nicht garantiert.
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.checkliste_aus_vorlage_kopieren(p_vorlage_id uuid, p_maklervertrag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_max integer;
begin
  -- Bisher hat die Funktion nichts getan, sobald der Vertrag schon irgendein Item hatte.
  -- Der Dialog verspricht aber "nur neue Items werden ergänzt" - genau das passiert jetzt:
  -- Punkte, die es unter gleichem Titel noch nicht gibt, kommen hinten dran.
  select coalesce(max(sortierung), 0) into v_max
    from public.checkliste_items
   where maklervertrag_id = p_maklervertrag_id;

  insert into public.checkliste_items
    (maklervertrag_id, sortierung, titel, beschreibung, passende_kategorie, pflicht)
  select
    p_maklervertrag_id,
    v_max + row_number() over (order by vi.sortierung, vi.titel),
    vi.titel, vi.beschreibung, vi.passende_kategorie, vi.pflicht
  from public.checkliste_vorlagen_items vi
  where vi.vorlage_id = p_vorlage_id
    and not exists (
      select 1 from public.checkliste_items ci
       where ci.maklervertrag_id = p_maklervertrag_id
         and lower(btrim(ci.titel)) = lower(btrim(vi.titel))
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.eigentuemer_besichtigungen()
 RETURNS TABLE(id uuid, datum date, uhrzeit time without time zone, ende time without time zone, ganztags boolean, status text, art text, makler text, immobilie_id uuid, maklervertrag_id uuid, objekt text, ort text, interessent text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ich as (select aktueller_eigentuemer_id() as id),
  mails as (
    select lower(e.email) as m from eigentuemer e, ich where e.id = ich.id and e.email is not null
    union select lower(p.email) from eigentuemer_personen p, ich where p.eigentuemer_id = ich.id and p.aktiv and p.email is not null),
  kont as (
    select k.id from kontakte k, ich
    where k.eigentuemer_id = ich.id or (k.email is not null and lower(k.email) in (select m from mails))),
  immos as (
    select v.immobilie_id from eigentuemer_objekte eo join vertraege v on v.id = eo.maklervertrag_id, ich
    where eo.eigentuemer_id = ich.id and v.immobilie_id is not null
    union select ko.immobilie_id from kontakt_objekt ko where ko.rolle = 'eigentuemer' and ko.kontakt_id in (select id from kont)),
  alle as (
    select t.id, t.datum, t.uhrzeit, t.ende, coalesce(t.ganztags, false) as ganztags,
           case when coalesce(t.status, 'aktiv') = 'storniert' then 'abgesagt' else 'aktiv' end as status,
           t.art, t.ersteller_name as makler, t.immobilie_id, t.eigentuemer_kontakt_id,
           nullif(coalesce(nullif(concat_ws(' ', k.titel, k.vorname, k.nachname), ''), k.firma), '') as interessent
    from termine t left join kontakte k on k.id = t.kontakt_id
    where t.art ilike '%besichtigung%' and coalesce(t.privat, false) = false and coalesce(t.eigentuemer_sichtbar, true)
    union all
    select a.id, a.datum, a.uhrzeit, a.ende, a.ganztags, 'abgesagt', 'Besichtigung', a.makler, a.immobilie_id, a.eigentuemer_kontakt_id, a.interessent
    from besichtigung_absagen a)
  select x.id, x.datum, x.uhrzeit, x.ende, x.ganztags, x.status, x.art, x.makler, x.immobilie_id,
         (select v.id from vertraege v join eigentuemer_objekte eo on eo.maklervertrag_id = v.id, ich
           where eo.eigentuemer_id = ich.id and v.immobilie_id = x.immobilie_id limit 1),
         nullif(concat_ws(' ', i.strasse, i.hausnummer), ''),
         nullif(concat_ws(' ', i.plz, i.ort), ''),
         x.interessent
  from alle x left join immobilien i on i.id = x.immobilie_id, ich
  where ich.id is not null
    and (x.eigentuemer_kontakt_id in (select id from kont) or x.immobilie_id in (select immobilie_id from immos))
  order by x.datum, x.uhrzeit
$function$
;

CREATE OR REPLACE FUNCTION public.expose_abgerufen(p_email text, p_kontakt_id uuid, p_immobilie_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.expose_abgerufen_schluessel s
     where s.immobilie_id = p_immobilie_id
       and ((p_kontakt_id is not null and s.kontakt_id = p_kontakt_id)
         or (nullif(trim(p_email), '') is not null and s.email = lower(trim(p_email))))
  )
$function$
;

CREATE OR REPLACE FUNCTION public.expose_freigabe_geloescht()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update todos set status='erledigt', erledigt_am=now(), ergebnis='Exposé-Link wurde gelöscht'
   where status='offen' and daten->>'expose_freigabe_id' = old.id::text;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.expose_nachfass_aufgaben()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare n integer := 0; f record; tid uuid;
begin
  for f in
    select fr.id, fr.email, fr.name, fr.kontakt_id, fr.immobilie_id, fr.created_at, fr.geoeffnet_am, 'portal' as quelle,
           coalesce(fr.erstellt_von, i.zustaendig_id) as makler_id,
           coalesce(i.objekttitel, i.bezeichnung, trim(coalesce(i.strasse,'')||' '||coalesce(i.hausnummer,'')), 'Objekt') as titel, i.immo_nr
    from expose_freigaben fr left join immobilien i on i.id = fr.immobilie_id
    where fr.bestaetigt_am is null and fr.gueltig_bis > now()
      and coalesce(fr.downloads, 0) = 0 and fr.letzter_download_am is null
      and not public.expose_abgerufen(fr.email, fr.kontakt_id, fr.immobilie_id)
      and fr.created_at < now() - interval '2 days' and fr.created_at > now() - interval '45 days'
      and not exists (select 1 from todos t where t.daten->>'expose_freigabe_id' = fr.id::text)
    union all
    select v.id, v.email, v.name, v.kontakt_id, v.immobilie_id, v.gesendet_am, null::timestamptz, 'onoffice',
           coalesce(public.oo_benutzer_profil(v.benutzer), i.zustaendig_id, (select id from profiles where role='chef' order by created_at limit 1)),
           coalesce(i.objekttitel, i.bezeichnung, 'onOffice-Objekt '||coalesce(v.onoffice_objekt_id::text,'')), i.immo_nr
    from onoffice_expose_versand v left join immobilien i on i.id = v.immobilie_id
    where v.bestaetigt_am is null and v.heruntergeladen_am is null and not v.ignoriert and v.portal_freigabe_id is null
      and not public.expose_abgerufen(v.email, v.kontakt_id, v.immobilie_id)
      and v.gesendet_am < now() - interval '2 days' and v.gesendet_am > now() - interval '45 days'
      and not exists (select 1 from todos t where t.daten->>'onoffice_versand_id' = v.id::text)
  loop
    insert into todos (titel, beschreibung, typ, status, prioritaet, faellig_am, ersteller_id, zustaendig_id, quelle, empfaenger_email, empfaenger_name, daten)
    values ('Exposé nachfassen: '||coalesce(nullif(f.name,''), f.email, 'Interessent')||' – '||coalesce(f.immo_nr||' · ','')||f.titel,
      'Exposé-Link vom '||to_char(f.created_at at time zone 'Europe/Berlin','DD.MM.YYYY')||
        case when f.quelle='onoffice' then ' (aus onOffice)' else '' end||
        case when f.geoeffnet_am is not null then ' wurde geöffnet, aber nicht bestätigt/geladen.' else ' wurde noch nicht bestätigt/geladen.' end||
        ' Bitte telefonisch oder per Erinnerungsmail (Dashboard-Karte „Exposé noch nicht abgerufen“) nachfassen.',
      'aufgabe', 'offen', 'wichtig', current_date, f.makler_id, f.makler_id, 'expose', f.email, f.name,
      case when f.quelle='onoffice' then jsonb_build_object('onoffice_versand_id', f.id, 'immobilie_id', f.immobilie_id, 'kontakt_id', f.kontakt_id)
           else jsonb_build_object('expose_freigabe_id', f.id, 'immobilie_id', f.immobilie_id, 'kontakt_id', f.kontakt_id) end)
    returning id into tid;
    if f.kontakt_id is not null then insert into todo_verknuepfung (todo_id, objekt_typ, objekt_id, label) values (tid, 'kontakt', f.kontakt_id, coalesce(nullif(f.name,''), f.email)); end if;
    if f.immobilie_id is not null then insert into todo_verknuepfung (todo_id, objekt_typ, objekt_id, label) values (tid, 'immobilie', f.immobilie_id, coalesce(f.immo_nr||' · ','')||f.titel); end if;
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.expose_nachfass_erledigen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.bestaetigt_am is not null and (old.bestaetigt_am is null) then
    update todos set status='erledigt', erledigt_am=now(), ergebnis='Automatisch erledigt: Exposé wurde bestätigt und geladen'
     where status='offen' and daten->>'expose_freigabe_id' = new.id::text;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.immobilie_datei_freigabe_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.interessenten_freigabe is not distinct from old.interessenten_freigabe then return new; end if;
  update immobilie_wissen w
     set interessenten_freigabe = coalesce(new.interessenten_freigabe, false)
   where w.immobilie_id = new.immobilie_id
     and (w.quelle_ref = new.id::text or (new.onedrive_item_id is not null and w.quelle_ref = 'od:' || new.onedrive_item_id))
     and coalesce(w.interessenten_freigabe, false) is distinct from coalesce(new.interessenten_freigabe, false);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.immobilie_datei_loeschung_merken()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.onoffice_datei_id is not null then
    insert into public.immobilie_datei_geloescht(immobilie_id, onoffice_datei_id)
    values (old.immobilie_id, old.onoffice_datei_id)
    on conflict do nothing;
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.immobilie_wissen_freigabe_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_od text;
  v_id uuid;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'UPDATE' and new.interessenten_freigabe is not distinct from old.interessenten_freigabe
     and new.quelle_ref is not distinct from old.quelle_ref then return new; end if;
  if new.quelle_ref like 'od:%' then
    v_od := substr(new.quelle_ref, 4);
  elsif new.quelle_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := new.quelle_ref::uuid;
  end if;
  if v_od is null and v_id is null then return new; end if;

  if coalesce(new.interessenten_freigabe, false) then
    update immobilie_datei d
       set interessenten_freigabe = true,
           doktyp = coalesce(d.doktyp, nullif(left(new.dokument_typ, 80), ''))
     where d.immobilie_id = new.immobilie_id
       and d.storage_path is not null
       and ((v_id is not null and d.id = v_id) or (v_od is not null and d.onedrive_item_id = v_od))
       and coalesce(d.interessenten_freigabe, false) = false;
  else
    update immobilie_datei d
       set interessenten_freigabe = false
     where d.immobilie_id = new.immobilie_id
       and ((v_id is not null and d.id = v_id) or (v_od is not null and d.onedrive_item_id = v_od))
       and coalesce(d.interessenten_freigabe, false)
       and not exists (
         select 1 from immobilie_wissen w
          where w.id <> new.id and w.immobilie_id = new.immobilie_id
            and coalesce(w.interessenten_freigabe, false)
            and (w.quelle_ref = d.id::text or (d.onedrive_item_id is not null and w.quelle_ref = 'od:' || d.onedrive_item_id)));
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.intern_secret_pruefen(p_name text, p_wert text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = p_name and p_wert <> '' and decrypted_secret = p_wert
  );
$function$
;

CREATE OR REPLACE FUNCTION public.kontakte_zustaendig_abgleichen()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  with ziel as (
    select k.id, z.profil_id
    from kontakte k
    join onoffice_adressen o on o.onoffice_id = k.onoffice_id
    join onoffice_benutzer_zuordnung z on z.onoffice_benutzer = o.roh->>'Benutzer'
    where k.zustaendig_id is null and z.profil_id is not null
  ), tat as (
    update kontakte k set zustaendig_id = ziel.profil_id, updated_at = now()
    from ziel where k.id = ziel.id returning 1
  )
  select count(*) into n from tat;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.newsletter_abmelden(p_token uuid, p_quelle text DEFAULT 'link'::text)
 RETURNS TABLE(email text, kontakt_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.newsletter_anmeldungen%rowtype;
begin
  select * into a from public.newsletter_anmeldungen where abmelde_token = p_token;
  if not found then return; end if;
  update public.newsletter_anmeldungen set widerrufen_am = coalesce(widerrufen_am, now()), widerruf_quelle = coalesce(widerruf_quelle, p_quelle)
    where lower(newsletter_anmeldungen.email) = lower(a.email) and widerrufen_am is null;
  update public.kontakte set newsletter_opt_in = false, newsletter_quelle = 'abgemeldet ' || to_char(now(), 'DD.MM.YYYY') || ' (' || p_quelle || ')'
    where id = a.kontakt_id or lower(kontakte.email) = lower(a.email);
  return query select a.email, a.kontakt_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.newsletter_empfaenger(p_objektarten text[] DEFAULT NULL::text[], p_vertragsart text DEFAULT 'alle'::text)
 RETURNS TABLE(anmeldung_id uuid, email text, name text, kontakt_id uuid, objektart text, vertragsart text, abmelde_token uuid, angemeldet_am timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with kandidaten as (
    select a.*, row_number() over (partition by lower(a.email) order by a.angemeldet_am desc) as rn
    from newsletter_anmeldungen a
    where a.widerrufen_am is null and a.bestaetigt_am is not null and a.email is not null
      and (p_objektarten is null or cardinality(p_objektarten) = 0 or a.objektart = any (p_objektarten))
      and (coalesce(p_vertragsart,'alle') = 'alle' or lower(coalesce(a.vertragsart,'')) like lower(left(p_vertragsart,4)) || '%')
      and not exists (select 1 from kontakte k where (k.id = a.kontakt_id or lower(k.email) = lower(a.email)) and k.werbung_opt_out))
  select id, lower(email), name, kontakt_id, objektart, vertragsart, abmelde_token, angemeldet_am from kandidaten
  where rn = 1 and (coalesce(aktuelle_rolle(),'') = any (array['chef','mitarbeiter']) or coalesce(auth.role(),'') = 'service_role' or current_user in ('service_role','postgres'))
$function$
;

CREATE OR REPLACE FUNCTION public.newsletter_freigabe_pruefen(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_soll text;
begin
  if coalesce(auth.role(), current_user) not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'nur serverseitig' using errcode = '42501';
  end if;
  select decrypted_secret into v_soll from vault.decrypted_secrets where name = 'newsletter_freigabe_code' limit 1;
  return v_soll is not null and btrim(coalesce(p_code, '')) = v_soll;
end;
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
  --
  -- Bewusst ohne temporaere Tabelle: die Rolle authenticator, unter der
  -- PostgREST jeden Aufruf aus dem Portal ausfuehrt, laedt safeupdate. Ein
  -- "delete from tmp_..." ohne where-Klausel ist dort verboten und liess den
  -- Kostenlauf mit "DELETE requires a WHERE clause" scheitern.
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
  -- er faehrt, nicht zwingend der Ersteller des Termins. Ohne eigene Fahrzeit
  -- am Termin greift die Strecke aus immobilie_fahrt_cache, doppelt genommen.
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
  -- Eingegangene Mails haengen direkt am Objekt. Gesendete Mails haben keine
  -- Objektspalte; sie werden ueber die Adresse der verknuepften Kontakte
  -- zugeordnet.
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
         -- v6: Automatik-Mails (Exposé-Versand) sind keine eigene Arbeit
         and coalesce(m.automatisch, false) = false
         and coalesce(m.betreff, '') not ilike 'Ihr Interesse an unserem Immobilienangebot%'
         and coalesce(m.betreff, '') not ilike 'Ihr Exposé „%'
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

  -- Objektaufbereitung: sobald die Vermarktung angelaufen ist. Bewusst auch bei
  -- Status akquise, wenn schon inseriert wurde — im Bestand stehen fast alle
  -- vermarkteten Objekte weiterhin auf akquise.
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

CREATE OR REPLACE FUNCTION public.oev_nachfass_erledigen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if (new.bestaetigt_am is not null and old.bestaetigt_am is null) or (new.ignoriert and not old.ignoriert) then
    update todos set status='erledigt', erledigt_am=now(), ergebnis=case when new.ignoriert then 'Eintrag aus der Exposé-Karte entfernt' else 'Automatisch erledigt: Agreementlink in onOffice bestätigt' end
     where status='offen' and daten->>'onoffice_versand_id' = new.id::text;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.oo_benutzer_profil(b text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select p.id from profiles p where p.role in ('chef','mitarbeiter') and b is not null and b <> ''
    and (lower(replace(p.name,' ','')) = lower(b) or lower(split_part(p.name,' ',1)) = lower(b))
  order by (p.role='chef') limit 1 $function$
;

CREATE OR REPLACE FUNCTION public.projekt_nachricht_gelesen_glocke()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.gelesen and not coalesce(old.gelesen, false) and new.richtung = 'kunde' then
    update aktivitaeten set gelesen_am = now() where ref_tabelle = 'projekt_nachrichten' and ref_id = new.id and gelesen_am is null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.projekt_nachricht_glocke()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_projekt text; v_ansprech uuid; v_name text;
begin
  if new.richtung <> 'kunde' then return new; end if;
  select p.name into v_projekt from projekte p where p.id = new.projekt_id;
  select z.ansprechpartner_id, coalesce(nullif(z.anzeigename,''), z.email) into v_ansprech, v_name from projekt_zugaenge z where z.id = new.zugang_id;
  insert into aktivitaeten (zielgruppe, empfaenger_user_id, typ, titel, text, ref_tabelle, ref_id)
  values ('makler', v_ansprech, 'nachricht_vom_neubaukunden',
          '💬 Neubau-Nachricht von ' || coalesce(v_name, new.absender_name, 'Kunde'),
          left(new.text, 300) || case when v_projekt is not null then ' – Projekt „' || v_projekt || '“ → Neubauprojekte → Nachrichten' else '' end,
          'projekt_nachrichten', new.id);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.projekt_zugaenge_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  if new.rolle = 'zurueckgetreten' and (old.rolle is distinct from 'zurueckgetreten') then
    new.zurueckgetreten_am := coalesce(new.zurueckgetreten_am, now());
  elsif new.rolle <> 'zurueckgetreten' then
    new.zurueckgetreten_am := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.reservierung_status_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  -- Kundenzugang (Status im Kundenportal / Kunden-Zugänge-Reiter)
  if new.projekt_zugang_id is not null then
    if new.status in ('unterschrieben','bezahlt') then
      update projekt_zugaenge
         set rolle = 'reserviert',
             einheit_id = coalesce(einheit_id, new.projekt_einheit_id),
             fortschritt_stufe = greatest(coalesce(fortschritt_stufe,1), 2)
       where id = new.projekt_zugang_id and rolle in ('interessent','reserviert','zurueckgetreten');
    elsif new.status = 'kauf_vollzogen' then
      update projekt_zugaenge
         set rolle = 'kaeufer',
             einheit_id = coalesce(einheit_id, new.projekt_einheit_id),
             fortschritt_stufe = greatest(coalesce(fortschritt_stufe,1), 5)
       where id = new.projekt_zugang_id;
    elsif new.status = 'storniert' then
      if not exists (
        select 1 from reservierungen_neubau r
        where r.projekt_zugang_id = new.projekt_zugang_id and r.id <> new.id
          and r.status in ('unterschrieben','bezahlt','kauf_vollzogen')
      ) then
        update projekt_zugaenge set rolle = 'interessent'
         where id = new.projekt_zugang_id and rolle = 'reserviert';
      end if;
    end if;
  end if;

  if new.projekt_einheit_id is null then return new; end if;

  if new.status in ('unterschrieben','bezahlt') then
    update projekt_einheiten set status = 'reserviert', updated_at = now()
      where id = new.projekt_einheit_id and status <> 'verkauft';
    if new.projekt_anfrage_id is not null then
      update projekt_anfragen set status = 'bestaetigt'
        where id = new.projekt_anfrage_id and status = 'offen';
    end if;
  elsif new.status = 'kauf_vollzogen' then
    update projekt_einheiten set status = 'verkauft', updated_at = now()
      where id = new.projekt_einheit_id;
  elsif new.status = 'storniert' then
    if not exists (
      select 1 from reservierungen_neubau r
      where r.projekt_einheit_id = new.projekt_einheit_id
        and r.id <> new.id
        and r.status in ('unterschrieben','bezahlt','kauf_vollzogen')
    ) then
      update projekt_einheiten set status = 'verfuegbar', updated_at = now()
        where id = new.projekt_einheit_id and status = 'reserviert';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.termine_eigentuemer_kontakt_aufraeumen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.termine set eigentuemer_kontakt_id = null where eigentuemer_kontakt_id = old.id;
  return old;
end $function$
;
