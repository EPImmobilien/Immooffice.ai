-- ===========================================================================
-- Fork-eigene Migration 15 — die Hintergrundjobs verkuppeln Mandanten
--
-- BEFUND (28.09.2026): Die 42 Cron-Jobs laufen als postgres. RLS greift dort
-- nicht, und die SECURITY-DEFINER-Funktionen, die sie rufen, tragen keine
-- Mandantenbedingung. fork_14 hat die ARGUMENTE abgesichert; was die
-- Funktionen INNEN verknuepfen, war damit noch nicht geprueft. Genau dort
-- liegt der schwerere Fehler.
--
-- Vier Stellen, vier verschiedene Wege ueber die Grenze:
--
-- 1) suchkriterien_abgleich
--    "from immobilien o cross join kontakte k" — ein Kreuzprodukt ALLER
--    Objekte mit ALLEN Kontakten. Es erzeugt Treffer ueber Mandantengrenzen
--    hinweg. Das ist nicht nur ein Cron-Problem: die Funktion ist SECURITY
--    DEFINER, also traf es auch den Knopf in der Oberflaeche.
--
-- 2) suchkriterien_abgleich_lauf
--    meldet die Treffer per Push an den zustaendigen Makler — mit den NAMEN
--    der passenden Interessenten. Aus 1) folgt: fremde Kundennamen auf dem
--    Telefon eines fremden Maklers.
--
-- 3) push_termin_erinnerungen_senden
--    verknuepft Termin und Profil ueber den NAMEN des Teilnehmers. Zwei
--    Mandanten mit je einem "Thomas Mueller" — und der eine bekommt die
--    Termine des anderen.
--
-- 4) expose_nachfass_aufgaben
--    faellt zurueck auf "(select id from profiles where role='chef' order by
--    created_at limit 1)" — den aeltesten Chef der GANZEN Datenbank. Die
--    daraus erzeugte Aufgabe traegt Namen und E-Mail des Interessenten.
--
-- VORGEHEN wie in fork_14: die Koerper der Vorlage werden nicht neu
-- geschrieben. Je Stelle eine Zeichenkette ersetzt, davor auf Eindeutigkeit
-- geprueft, danach nachgesehen, ob sie angekommen ist.
-- ===========================================================================

do $$
declare
  -- Funktion, gesuchte Stelle, Ersatz.
  aenderungen jsonb := jsonb_build_array(
    jsonb_build_array('suchkriterien_abgleich',
      '      where coalesce(o.versteckt, false) = false',
      E'      where k.mandant_id = o.mandant_id\n      and coalesce(o.versteckt, false) = false'),

    jsonb_build_array('suchkriterien_abgleich_lauf',
      'join kontakte k on k.id = t.kontakt_id',
      'join kontakte k on k.id = t.kontakt_id and k.mandant_id = o.mandant_id'),

    jsonb_build_array('kontakte_zustaendig_abgleichen',
      '    where k.zustaendig_id is null and z.profil_id is not null',
      E'    where k.zustaendig_id is null and z.profil_id is not null\n      and o.mandant_id = k.mandant_id and z.mandant_id = k.mandant_id'),

    jsonb_build_array('push_termin_erinnerungen_senden',
      '    join profiles p' || E'\n' || '      on p.role in (''chef'', ''mitarbeiter'')',
      '    join profiles p' || E'\n' || '      on p.mandant_id = t.mandant_id' || E'\n' ||
      '     and p.role in (''chef'', ''mitarbeiter'')'),

    jsonb_build_array('expose_nachfass_aufgaben',
      '(select id from profiles where role=''chef'' order by created_at limit 1)',
      '(select id from profiles where role=''chef'' and mandant_id = v.mandant_id order by created_at limit 1)')
  );
  eintrag jsonb;
  name text;
  suche text;
  ersatz text;
  quelle text;
  neu text;
  oid_ oid;
  n int;
begin
  for eintrag in select * from jsonb_array_elements(aenderungen) loop
    name   := eintrag->>0;
    suche  := eintrag->>1;
    ersatz := eintrag->>2;

    select p.oid into oid_
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = name;
    if oid_ is null then
      raise exception 'Funktion public.% gibt es nicht — die Vorlage hat sich geaendert.', name;
    end if;

    quelle := pg_get_functiondef(oid_);
    if position(ersatz in quelle) > 0 then
      continue;  -- schon geaendert, Migration laeuft ein zweites Mal
    end if;

    -- Genau eine Fundstelle, sonst nichts anfassen.
    n := (length(quelle) - length(replace(quelle, suche, ''))) / nullif(length(suche), 0);
    if n <> 1 then
      raise exception 'In public.% steht die gesuchte Stelle %-mal, erwartet war genau einmal. Gesucht: %',
        name, coalesce(n, 0), left(suche, 60);
    end if;

    neu := replace(quelle, suche, ersatz);
    execute neu;

    if position(ersatz in pg_get_functiondef(oid_)) = 0 then
      raise exception 'Die Mandantenbedingung ist in public.% nicht angekommen.', name;
    end if;
  end loop;
end $$;

-- --- Wachposten -----------------------------------------------------------
-- Die fuenf Stellen muessen da sein. Schreibt die Vorlage eine der Funktionen
-- neu, faellt es hier auf und nicht erst, wenn ein Makler fremde Kundennamen
-- auf dem Telefon hat.
do $$
declare fehlt text := '';
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='suchkriterien_abgleich')
     not like '%k.mandant_id = o.mandant_id%' then
    fehlt := fehlt || ' suchkriterien_abgleich'; end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='suchkriterien_abgleich_lauf')
     not like '%k.mandant_id = o.mandant_id%' then
    fehlt := fehlt || ' suchkriterien_abgleich_lauf'; end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='kontakte_zustaendig_abgleichen')
     not like '%o.mandant_id = k.mandant_id%' then
    fehlt := fehlt || ' kontakte_zustaendig_abgleichen'; end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='push_termin_erinnerungen_senden')
     not like '%p.mandant_id = t.mandant_id%' then
    fehlt := fehlt || ' push_termin_erinnerungen_senden'; end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='expose_nachfass_aufgaben')
     not like '%mandant_id = v.mandant_id%' then
    fehlt := fehlt || ' expose_nachfass_aufgaben'; end if;
  if fehlt <> '' then
    raise exception 'Mandantenbedingung fehlt in:%', fehlt;
  end if;
end $$;
