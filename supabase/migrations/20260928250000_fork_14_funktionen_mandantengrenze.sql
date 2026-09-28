-- ===========================================================================
-- Fork-eigene Migration 14 — die Mandantengrenze gilt auch in den Funktionen
--
-- BEFUND (28.09.2026): Die restriktiven Richtlinien aus fork_07 schuetzen
-- Tabellen. Sie schuetzen NICHT, was in einer SECURITY-DEFINER-Funktion
-- passiert — die laeuft mit den Rechten ihres Eigentuemers, und RLS greift
-- dort nicht. Im Schema public stehen siebzehn solche Funktionen, die eine
-- uuid vom Aufrufer entgegennehmen. Keine einzige hat geprueft, ob der
-- Datensatz dem Aufrufer gehoert, und alle sind fuer authenticated
-- ausfuehrbar.
--
-- Was damit moeglich war, sobald es zwei Mandanten gibt:
--   rechnung_startnummer_setzen  fremden Rechnungsnummernkreis zuruecksetzen
--   naechste_rechnungsnummer     fremden Nummernkreis weiterzaehlen und damit
--                                eine Luecke in eine Nummernfolge reissen,
--                                die nach GoBD luckenlos sein muss
--   rechnung_stellen/_stornieren fremde Rechnungen stellen und stornieren
--   delete_mitarbeiter           fremden Mitarbeiter loeschen
--   eigentuemer_ansprechpartner_info  Name, E-Mail, Telefon fremder Makler
--   objekt_kosten_berechnen      Zahlen zu fremden Objekten
--   und neun weitere
--
-- Ausgenommen bleiben zwei, die absichtlich ohne Anmeldung erreichbar sind:
-- newsletter_abmelden (der Token IST der Nachweis) und expose_abgerufen (die
-- oeffentliche Exposeseite meldet den Abruf).
--
-- VORGEHEN: Die Koerper der Vorlage werden NICHT neu geschrieben. Eine Zeile
-- wird vorne eingezogen, maschinell, und danach nachgeprueft. So bleibt der
-- Rest Zeile fuer Zeile die Vorlage, und dieselbe Migration wirkt auch dann
-- noch, wenn die Vorlage ihre Funktion einmal aendert.
-- ===========================================================================

-- --- Wer ist der Aufrufer? ------------------------------------------------
-- ACHTUNG, hier steckt eine Falle: In einer SECURITY-DEFINER-Funktion ist
-- current_user der EIGENTUEMER, nicht der Aufrufer. Eine Ausnahme fuer
-- service_role ueber current_user haette jeden durchgelassen — der erste
-- Entwurf dieser Migration hat genau das getan, und tests/funktionen-mandant.sql
-- hat es aufgedeckt.
--
-- Verlaesslich ist der JWT-Anspruch, den PostgREST als request.jwt.claims
-- setzt. Kein JWT heisst: Cron, Wartung oder eine direkte Verbindung — dort
-- gibt es keinen Mandanten, an dem zu messen waere.
create or replace function public.mandant_grenze_gilt()
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is null then false
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
         = 'service_role' then false
    else true
  end
$function$;

comment on function public.mandant_grenze_gilt() is
  'Gilt die Mandantengrenze fuer den aktuellen Aufrufer? Nein fuer '
  'service_role und fuer Aufrufe ohne JWT (Cron, Wartung), ja sonst. '
  'Liest den JWT-Anspruch, NICHT current_user — der ist in einer '
  'SECURITY-DEFINER-Funktion der Eigentuemer.';

grant execute on function public.mandant_grenze_gilt() to authenticated, anon, service_role;

-- --- Der Waechter ---------------------------------------------------------
create or replace function public.mandant_sichern(p_tabelle text, p_id uuid)
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_fremd uuid;
begin
  -- Kein Wert, nichts zu pruefen.
  if p_id is null then return; end if;

  -- Die service_role umgeht RLS ueberall sonst auch; das ist der Weg der
  -- Edge Functions und der Hintergrundjobs. Wer so weit kommt, hat den
  -- Dienstschluessel, und der ist nicht die Grenze, die hier gezogen wird.
  if not public.mandant_grenze_gilt() then return; end if;

  execute format('select mandant_id from public.%I where id = $1', p_tabelle)
    into v_fremd using p_id;

  -- Zeile gibt es nicht, oder sie traegt keinen Mandanten: dann entscheidet
  -- die Funktion selbst, was sie damit macht. Hier wird nur die Grenze
  -- gezogen, keine Fachlichkeit.
  if v_fremd is null then return; end if;

  if v_fremd is distinct from public.aktuelle_mandant_id() then
    raise exception 'Kein Zugriff auf Daten eines anderen Mandanten.'
      using errcode = '42501';
  end if;
end;
$function$;

comment on function public.mandant_sichern(text, uuid) is
  'Bricht ab, wenn die uebergebene Kennung zu einem anderen Mandanten '
  'gehoert. Vorne in jede SECURITY-DEFINER-Funktion eingezogen, die eine '
  'Kennung von aussen entgegennimmt — dort greift RLS nicht.';

revoke all on function public.mandant_sichern(text, uuid) from public;
grant execute on function public.mandant_sichern(text, uuid) to authenticated, anon, service_role;

-- --- Die Zeile vorne einziehen -------------------------------------------
do $$
declare
  -- Funktion, dann Paare aus Argumentname und Tabelle.
  zuordnung jsonb := '{
    "checkliste_aus_vorlage_kopieren":   [["p_vorlage_id","checkliste_vorlagen"],
                                          ["p_maklervertrag_id","vertraege"]],
    "delete_mitarbeiter":                [["mitarbeiter_id","profiles"]],
    "naechste_rechnungsnummer":          [["p_firma_id","firma_stammdaten"]],
    "objekt_kosten_berechnen":           [["p_immobilie_id","immobilien"]],
    "portal_importbericht_auswerten":    [["p_mail_id","mail_eingang"]],
    "rechnung_bezahlt_markieren":        [["p_rechnung_id","rechnungen"]],
    "rechnung_startnummer_info":         [["p_firma_id","firma_stammdaten"]],
    "rechnung_startnummer_setzen":       [["p_firma_id","firma_stammdaten"]],
    "rechnung_stellen":                  [["p_rechnung_id","rechnungen"]],
    "rechnung_stornieren":               [["p_rechnung_id","rechnungen"]],
    "rechnung_vorlage_aus_objektnachweis":[["p_objektnachweis_id","objektnachweise"]],
    "suchkriterien_abgleich":            [["p_immobilie","immobilien"],
                                          ["p_kontakt","kontakte"]],
    "upload_benachrichtigung_planen":    [["p_eigentuemer_id","eigentuemer"],
                                          ["p_ansprechpartner_id","profiles"]]
  }'::jsonb;
  name text;
  paare jsonb;
  paar jsonb;
  quelle text;
  neu text;
  zeilen text;
  oid_ oid;
  n int;
begin
  for name, paare in select * from jsonb_each(zuordnung) loop
    select p.oid into oid_
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = name;
    if oid_ is null then
      raise exception 'Funktion public.% gibt es nicht — die Vorlage hat sich geaendert.', name;
    end if;

    quelle := pg_get_functiondef(oid_);
    if quelle like '%mandant_sichern%' then
      continue;  -- schon eingezogen, Migration laeuft ein zweites Mal
    end if;

    zeilen := '';
    for paar in select * from jsonb_array_elements(paare) loop
      zeilen := zeilen || format(E'  perform public.mandant_sichern(%L, %s);\n',
                                 paar->>1, paar->>0);
    end loop;

    -- Genau ein `begin` auf eigener Zeile; nachgezaehlt, bevor ersetzt wird.
    select count(*) into n
      from regexp_matches(quelle, '(^|\n)[ \t]*[Bb][Ee][Gg][Ii][Nn][ \t]*\n', 'g');
    if n <> 1 then
      raise exception 'public.% hat % Zeilen mit alleinstehendem begin, erwartet war genau eine.', name, n;
    end if;

    neu := regexp_replace(quelle,
             '((^|\n)[ \t]*[Bb][Ee][Gg][Ii][Nn][ \t]*\n)',
             '\1' || replace(zeilen, '\', '\\'));
    execute neu;

    -- Nachpruefen statt hoffen.
    if pg_get_functiondef(oid_) not like '%mandant_sichern%' then
      raise exception 'Der Waechter ist in public.% nicht angekommen.', name;
    end if;
  end loop;
end $$;

-- --- Die beiden SQL-Funktionen, die kein begin haben ----------------------
-- Sie geben ein Ergebnis zurueck statt zu handeln; hier ist eine zusaetzliche
-- Bedingung richtiger als ein Abbruch. Wer nach fremden Daten fragt, bekommt
-- leer zurueck — nicht die Auskunft, dass es sie gibt.
create or replace function public.eigentuemer_ansprechpartner_info(p_eigentuemer_id uuid)
 returns table(user_id uuid, name text, email text, telefon text, maklervertrag_id uuid)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.name, p.email, p.telefon, eo.maklervertrag_id
  from public.eigentuemer_objekte eo
  join public.profiles p on p.id = eo.ansprechpartner_id
  where eo.eigentuemer_id = p_eigentuemer_id
    and (eo.mandant_id is null
         or not public.mandant_grenze_gilt()
         or eo.mandant_id = public.aktuelle_mandant_id())
$function$;

create or replace function public.todo_sichtbar(t_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from todos t
    where t.id = t_id
      and (t.mandant_id is null
           or not public.mandant_grenze_gilt()
           or t.mandant_id = public.aktuelle_mandant_id())
      and ( t.ersteller_id = auth.uid()
         or t.zustaendig_id = auth.uid()
         or (t.team_sichtbar and ist_team())
         or ist_chef() )
  )
$function$;

-- --- Wachposten -----------------------------------------------------------
-- Kommt eine neue SECURITY-DEFINER-Funktion mit uuid-Argument dazu, faellt
-- sie hier auf. Die beiden absichtlich oeffentlichen sind benannt.
do $$
declare offen text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into offen
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and pg_get_function_identity_arguments(p.oid) ~ 'uuid'
     and p.proname not in ('newsletter_abmelden', 'expose_abgerufen',
                           'mandant_sichern')
     and p.prosrc not like '%mandant_sichern%'
     and p.prosrc not like '%aktuelle_mandant_id%';
  if offen is not null then
    raise exception 'SECURITY-DEFINER-Funktionen ohne Mandantenpruefung: %', offen;
  end if;
end $$;
