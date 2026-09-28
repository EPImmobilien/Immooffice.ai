-- ===========================================================================
-- Fork-eigene Migration 16 — zwei Funktionen, die noch ueber die Grenze sahen
--
-- Nach fork_14 (Argumente) und fork_15 (Verknuepfungen in den
-- Hintergrundjobs) blieb ein systematischer Durchgang: welche Funktion
-- beruehrt zwei oder mehr Mandantentabellen, ohne mandant_id auch nur zu
-- erwaehnen? Drei Treffer, zwei davon echte Loecher.
--
-- 1) newsletter_empfaenger — der schwerste Befund dieser Sitzung.
--
--    Sie liest newsletter_anmeldungen OHNE jede Mandantenbedingung. Ihre
--    Rollenpruefung endet auf
--        or current_user in ('service_role','postgres')
--    und genau hier greift dieselbe Falle wie in fork_14: in einer
--    SECURITY-DEFINER-Funktion ist current_user der EIGENTUEMER. Auf Supabase
--    ist das postgres — die Bedingung ist also IMMER wahr, und die
--    Rollenpruefung davor ohne Wirkung.
--
--    Die Funktion ist fuer anon ausfuehrbar. Zusammen heisst das: ohne
--    Anmeldung die E-Mail-Adressen, Namen und ABMELDE-TOKEN saemtlicher
--    Newsletter-Empfaenger aller Mandanten.
--
--    Zwei Aenderungen: die Mandantenbedingung, und die Rollenpruefung greift
--    wieder (ueber mandant_grenze_gilt() statt current_user).
--
-- 2) eigentuemer_besichtigungen
--
--    Sie sammelt Kontakte des angemeldeten Eigentuemers unter anderem ueber
--    den Abgleich der E-Mail-Adresse. Dieselbe Adresse bei einem anderen
--    Makler — was vorkommt, wer zwei Makler beauftragt — zog dessen Kontakt
--    mit herein. Der Eigentuemer saehe Besichtigungstermine, die ihn nichts
--    angehen.
--
-- 3) aktueller_eigentuemer_id bleibt unveraendert: sie sucht ueber
--    auth.uid(), und ein Benutzerkonto gehoert zu genau einem Mandanten.
--    Vermerkt in docs/OFFEN.md.
-- ===========================================================================

do $$
declare
  aenderungen jsonb := jsonb_build_array(
    -- Mandantenbedingung auf die Anmeldungen.
    jsonb_build_array('newsletter_empfaenger',
      '    where a.widerrufen_am is null and a.bestaetigt_am is not null and a.email is not null',
      E'    where a.widerrufen_am is null and a.bestaetigt_am is not null and a.email is not null\n      and (not public.mandant_grenze_gilt() or a.mandant_id = public.aktuelle_mandant_id())'),

    -- Und die Rollenpruefung, die durch current_user wirkungslos war.
    jsonb_build_array('newsletter_empfaenger',
      'or current_user in (''service_role'',''postgres'')',
      'or not public.mandant_grenze_gilt()'),

    -- Der Abgleich ueber die E-Mail-Adresse bleibt im eigenen Mandanten.
    jsonb_build_array('eigentuemer_besichtigungen',
      '    select k.id from kontakte k, ich' || E'\n' ||
      '    where k.eigentuemer_id = ich.id or (k.email is not null and lower(k.email) in (select m from mails))',
      '    select k.id from kontakte k, ich' || E'\n' ||
      '    where k.mandant_id = (select e.mandant_id from eigentuemer e where e.id = ich.id)' || E'\n' ||
      '      and (k.eigentuemer_id = ich.id or (k.email is not null and lower(k.email) in (select m from mails)))')
  );
  eintrag jsonb;
  name text; suche text; ersatz text;
  quelle text; neu text; oid_ oid; n int;
begin
  for eintrag in select * from jsonb_array_elements(aenderungen) loop
    name := eintrag->>0; suche := eintrag->>1; ersatz := eintrag->>2;

    select p.oid into oid_ from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = name;
    if oid_ is null then
      raise exception 'Funktion public.% gibt es nicht — die Vorlage hat sich geaendert.', name;
    end if;

    quelle := pg_get_functiondef(oid_);
    if position(ersatz in quelle) > 0 then continue; end if;

    n := (length(quelle) - length(replace(quelle, suche, ''))) / nullif(length(suche), 0);
    if n <> 1 then
      raise exception 'In public.% steht die gesuchte Stelle %-mal, erwartet war genau einmal. Gesucht: %',
        name, coalesce(n, 0), left(suche, 70);
    end if;

    execute replace(quelle, suche, ersatz);

    if position(ersatz in pg_get_functiondef(oid_)) = 0 then
      raise exception 'Die Aenderung ist in public.% nicht angekommen.', name;
    end if;
  end loop;
end $$;

-- --- Wachposten -----------------------------------------------------------
do $$
declare fehlt text := '';
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='newsletter_empfaenger')
     not like '%a.mandant_id = public.aktuelle_mandant_id()%' then
    fehlt := fehlt || ' newsletter_empfaenger/Mandant'; end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='newsletter_empfaenger')
     like '%current_user in (''service_role'',''postgres'')%' then
    fehlt := fehlt || ' newsletter_empfaenger/current_user'; end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='eigentuemer_besichtigungen')
     not like '%k.mandant_id =%' then
    fehlt := fehlt || ' eigentuemer_besichtigungen'; end if;
  if fehlt <> '' then
    raise exception 'Mandantengrenze fehlt in:%', fehlt;
  end if;
end $$;

-- Kein current_user mehr als Rechtepruefung in einer SECURITY-DEFINER-
-- Funktion. Es ist dort der Eigentuemer und sagt ueber den Aufrufer nichts.
do $$
declare offen text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into offen
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.prosrc ~ 'current_user\s+in\s*\(';
  if offen is not null then
    raise exception 'SECURITY-DEFINER-Funktionen pruefen Rechte ueber current_user: %', offen;
  end if;
end $$;
