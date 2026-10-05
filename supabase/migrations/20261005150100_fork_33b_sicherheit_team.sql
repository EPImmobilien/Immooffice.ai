-- ===========================================================================
-- Fork-eigene Migration 33b — die Sicherheitshaertung der Vorlage vom
-- 05.10.2026 (Migrationen sicherheit_team_only_policies und
-- sicherheit_definer_funktionen_team_guard)
--
-- Die Vorlage schliesst drei Klassen von Luecken. Der Fork hat dieselben,
-- denn seine Richtlinien stammen von ihr — die Mandantengrenze (fork_07)
-- trennt Mandanten, nicht Rollen innerhalb eines Mandanten. Ein
-- Eigentuemer-Konto desselben Mandanten las bisher ueber jede "true"-
-- Richtlinie mit.
--
--   1. is_chef() glaubte user_metadata. Das kann der Nutzer selbst setzen.
--   2. Erlaubende Richtlinien mit "true" fuer authenticated gelten nur noch
--      fuer das Team (chef, mitarbeiter).
--   3. SECURITY-DEFINER-Funktionen pruefen das Team selbst; Cron und
--      Dienstschluessel (auth.uid() ist null) bleiben unberuehrt.
--
-- Abweichend von der Vorlage: die Funktionen werden in IHRER Fork-Fassung
-- gehaertet (mit Mandantengrenze aus fork_14), nicht durch die Fassung der
-- Vorlage ersetzt. Die Tabellen, die es nur im Fork gibt, behalten ihre
-- Lesefreigabe: mandanten_einstufung ist Plattformwissen, und die
-- Vorlagen-, Beleg-, Zahlungs- und Rechnungseinstellungen haben eigene
-- Pflege-Richtlinien nur fuer den Chef.
-- ===========================================================================

-- ------------------------------------------------------------- 1) is_chef
create or replace function public.is_chef()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'chef');
$$;

-- --------------------------------------------- 2) "true" nur noch fuer das Team
do $$
declare r record; q text;
begin
  for r in
    select tablename, policyname, cmd from pg_policies
    where schemaname = 'public' and 'authenticated' = any(roles)
      and (qual = 'true' or with_check = 'true')
      -- dieselben Ausnahmen wie in der Vorlage: Nachschlagetabellen und das
      -- Melden eines Fehlers bzw. einer Diagnose durch jeden Angemeldeten
      and tablename not in ('amt_adressen', 'amt_zusaetzliche_regionen', 'geo_cache', 'plz_region', 'profiles')
      and policyname not in ('fehler_protokoll_melden', 'portal_diagnose_insert')
      -- nur im Fork vorhanden, siehe Kopf
      and tablename not in ('mandanten_einstufung', 'belegnummernkreise', 'zahlungsbedingungen',
                            'rechnung_einstellungen', 'vertragsvorlagen', 'vorlagen_felder')
  loop
    if r.cmd in ('SELECT', 'DELETE') then
      q := format('alter policy %I on public.%I using (public.ist_team())', r.policyname, r.tablename);
    elsif r.cmd = 'INSERT' then
      q := format('alter policy %I on public.%I with check (public.ist_team())', r.policyname, r.tablename);
    else
      q := format('alter policy %I on public.%I using (public.ist_team()) with check (public.ist_team())', r.policyname, r.tablename);
    end if;
    execute q;
  end loop;
end $$;

-- Profile: das Team sieht alle seines Mandanten, ein Eigentuemer sich selbst
-- und die Team-Profile (seine Ansprechpartner). Die Mandantengrenze
-- profiles_mandant_trennung bleibt davor.
alter policy profiles_select on public.profiles
  using (public.ist_team() or id = auth.uid() or role in ('chef', 'mitarbeiter'));

-- ------------------------------------- 3) SECURITY-DEFINER-Funktionen
-- Interne PL/pgSQL-Funktionen: Wache direkt hinter BEGIN. Derselbe Eingriff
-- wie in der Vorlage, angewendet auf die Fork-Fassung.
do $$
declare f text; d text; d2 text;
begin
  foreach f in array array['aktivitaets_log_cleanup', 'checkliste_aus_vorlage_kopieren', 'fehler_protokoll_aufraeumen',
    'kontakte_zustaendig_abgleichen', 'naechste_rechnungsnummer', 'onoffice_waechter_befunde', 'portal_importbericht_auswerten',
    'suchkriterien_abgleich', 'suchkriterien_abgleich_lauf'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if d is null then raise exception 'Funktion % fehlt', f; end if;
    d2 := regexp_replace(d, '(\$function\$[\s\S]*?\m)(begin)\M',
      '\1\2 if auth.uid() is not null and not public.ist_team() then raise exception ''Keine Berechtigung'' using errcode = ''42501''; end if;', 'i');
    if d2 = d then raise exception 'Kein BEGIN gefunden in %', f; end if;
    execute d2;
  end loop;
end $$;

-- suchkriterien_nachfrage (SQL): ohne Team-Recht ein leeres Ergebnis.
create or replace function public.suchkriterien_nachfrage(p_vertragsart text, p_objektart text, p_plz text, p_ort text, p_preis numeric, p_zimmer numeric default null, p_flaeche numeric default null, p_lat numeric default null, p_lon numeric default null)
returns table(anzahl integer, im_budget integer, beispiele text[])
language sql stable security definer set search_path to 'public' as $function$
  with t as (
    select distinct on (k.id) k.id, coalesce(nullif(trim(concat_ws(' ', k.vorname, k.nachname)), ''), k.firma) as name, p.punkte, p.gruende
    from kontakte k
    cross join lateral (select x.sp from (select k.such_profil as sp union all select jsonb_array_elements(coalesce(k.such_profil_weitere, '[]'::jsonb))) x where x.sp is not null) s
    cross join lateral suchprofil_punkte(s.sp, p_vertragsart, p_objektart, null, null, p_plz, p_ort, p_preis, p_zimmer, p_flaeche, p_lat, p_lon) p
    where (auth.uid() is null or public.ist_team())
      and k.aktiv and (k.such_profil is not null or k.such_profil_weitere is not null) and p.punkte > 0
    order by k.id, p.punkte desc
  )
  select count(*)::int, count(*) filter (where 'im Budget' = any(gruende))::int,
         (array_agg(name order by punkte desc))[1:5]
  from t;
$function$;

-- Eigentuemer-Funktionen: nur fuer den eigenen Eigentuemer-Datensatz.
create or replace function public.eigentuemer_ansprechpartner_info(p_eigentuemer_id uuid)
returns table(user_id uuid, name text, email text, telefon text, maklervertrag_id uuid)
language sql stable security definer set search_path to 'public' as $function$
  select p.id, p.name, p.email, p.telefon, eo.maklervertrag_id
  from public.eigentuemer_objekte eo
  join public.profiles p on p.id = eo.ansprechpartner_id
  where eo.eigentuemer_id = p_eigentuemer_id
    and (eo.mandant_id is null
         or not public.mandant_grenze_gilt()
         or eo.mandant_id = public.aktuelle_mandant_id())
    and (auth.uid() is null or public.ist_team() or p_eigentuemer_id = public.aktueller_eigentuemer_id())
$function$;

create or replace function public.upload_benachrichtigung_planen(p_eigentuemer_id uuid, p_ansprechpartner_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.ist_team()
     AND p_eigentuemer_id IS DISTINCT FROM public.aktueller_eigentuemer_id() THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;
  perform public.mandant_sichern('eigentuemer', p_eigentuemer_id);
  perform public.mandant_sichern('profiles', p_ansprechpartner_id);
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
$function$;

-- Die Trigger-Funktionen verlieren ihr Ausfuehrungsrecht ueber die API in
-- fork_33c (revoke braucht eine eigene Freigabe).

-- Fehlender search_path.
alter function public.aktivitaets_log_cleanup() set search_path = public;
alter function public.checkliste_aus_vorlage_kopieren(uuid, uuid) set search_path = public;
