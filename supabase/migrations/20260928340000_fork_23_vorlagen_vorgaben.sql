-- ===========================================================================
-- Fork-eigene Migration 23 — Laufzeit, Provision und Fristen gehoeren zur
-- Vorlage
--
-- ANWEISUNG vom 28.09.2026: "wenn wir die Maklervertrag Vorlage hochladen, da
-- muss auf jeden Fall Laufzeit und Provision auch noch definiert werden.
-- Orientiere dich da einfach mal an der E&P World, was wir dort fuer Felder
-- haben. Gleiches gilt fuer Reservierung und Objektnachweis."
--
-- WAS DIE VORLAGE HAT (nachgesehen, nicht erfunden):
--
--   Maklervertrag   laufzeit_monate, provision, provisionsmodell
--                   (teilung / innen / aussen). Vorbelegt aus
--                   portal_einstellungen: 6 Monate, 3,57 %, Teilung.
--   Objektnachweis  provision. Fest im Quelltext: "3,00".
--   Reservierung    reservierungsgebuehr_brutto, Dauer, Zahlungsfrist.
--                   Fest im Quelltext: 1000 EUR, 30 Tage, 5 Werktage.
--
-- Die Erzeugung ersetzt diese Werte im Word-Text — "Dauer von 6 Monaten" wird
-- zu "Dauer von 9 Monaten". Laedt ein Makler seine EIGENE Vorlage hoch, steht
-- darin sein eigener Satz, und die Zahl muss dazu passen. Deshalb gehoeren
-- die Werte an die Vorlage, nicht in eine Liste weit davon entfernt.
--
-- DREI STUFEN, von aussen nach innen; die innerste gewinnt:
--
--   1. eingebaut          was die Vorlage heute vorschlaegt
--   2. portal_einstellungen   die Vorgaben des Mandanten (Reiter "Vorgaben")
--   3. die Vorlage selbst     je Mandant, und je Gesellschaft noch davor
--
-- Wer nichts einstellt, bekommt genau das bisherige Verhalten.
--
-- ---------------------------------------------------------------------------
-- ZUERST ABER EIN FEHLER, DER DEM IM WEG STAND
--
-- portal_einstellungen traegt seit fork_05 eine mandant_id — aber ihr
-- Primaerschluessel ist (schluessel). EINE Zeile je Schluessel, fuer die ganze
-- Plattform. Die Oberflaeche schreibt mit upsert(..., onConflict: "schluessel"):
-- der zweite Mandant, der seine Provision einstellt, ueberschreibt die des
-- ersten. Nicht heimlich falsch — sichtbar falsch, beim naechsten Vertrag.
--
-- fork_17 hat genau diese Klasse Fehler aufgeraeumt und einen Wachposten
-- dagegen gestellt. Der prueft nur contype = 'u', also
-- Eindeutigkeitsregeln — ein PRIMAERSCHLUESSEL ist contype = 'p' und ist ihm
-- durchgegangen. Beides wird hier nachgezogen.
-- ===========================================================================

-- --- 1) portal_einstellungen gehoert je Mandant einmal ---------------------
alter table public.portal_einstellungen
  alter column mandant_id set default public.aktuelle_mandant_id();

-- Vorhandene Zeilen ohne Mandanten gehoeren dem ersten. Auf einer frischen
-- Instanz trifft das nichts; auf einer gewachsenen rettet es die Vorgaben,
-- die vor fork_05 entstanden sind.
update public.portal_einstellungen
   set mandant_id = (select id from public.mandanten order by erstellt_am, id limit 1)
 where mandant_id is null;

delete from public.portal_einstellungen where mandant_id is null;

alter table public.portal_einstellungen alter column mandant_id set not null;

alter table public.portal_einstellungen drop constraint portal_einstellungen_pkey;
alter table public.portal_einstellungen
  add constraint portal_einstellungen_pkey primary key (mandant_id, schluessel);

comment on constraint portal_einstellungen_pkey on public.portal_einstellungen is
  'Je Mandant einmal, nicht je Plattform einmal. Vorher (schluessel) allein: '
  'der zweite Mandant ueberschrieb die Vorgaben des ersten.';

-- --- 2) Der Wachposten aus fork_17 sieht jetzt auch Primaerschluessel -------
do $$
declare offen text;
begin
  select string_agg(r.relname || '.' || con.conname, ', ' order by r.relname) into offen
    from pg_constraint con
    join pg_class r on r.oid = con.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    join public.mandanten_einstufung e on e.tabelle = r.relname and e.gruppe = 'MANDANT'
   where n.nspname = 'public' and con.contype = 'p'
     and not exists (select 1 from unnest(con.conkey) k
                      join pg_attribute a on a.attrelid = r.oid and a.attnum = k
                     where a.attname in ('mandant_id', 'id'))
     and con.conname not in (
       -- Schluessel auf einer bereits mandantengebundenen Elterntabelle. Wer
       -- die Immobilie nicht sieht, sieht auch ihre Zusatzzeile nicht.
       'immobilie_fahrt_cache_pkey', 'immobilie_grundstueck_pkey',
       'immobilie_kosten_einstellung_pkey', 'immobilie_onedrive_pkey',
       'immobilie_titelbild_wahl_pkey', 'objekt_status_vorschlag_pkey',
       'push_termin_erinnerungen_pkey', 'rechnung_nummern_sequence_pkey',
       'suchkriterien_treffer_pkey',
       -- onOffice ist am 28.09.2026 ausgebaut worden. Die Tabellen liegen
       -- leer und ohne Zugang; sie tragen Kennungen eines fremden Systems,
       -- die dort global eindeutig SIND.
       'onoffice_adressen_pkey', 'onoffice_benutzer_zuordnung_pkey',
       'onoffice_feld_werte_pkey', 'onoffice_felder_pkey',
       'onoffice_objekte_pkey', 'onoffice_schreib_felder_pkey');
  if offen is not null then
    raise exception 'Global eindeutiger Primaerschluessel auf einer Mandantentabelle: %', offen;
  end if;
end $$;

-- --- 3) Die Vorgaben an der Vorlage ----------------------------------------
alter table public.vertragsvorlagen
  add column if not exists vorgaben jsonb not null default '{}'::jsonb;

comment on column public.vertragsvorlagen.vorgaben is
  'Werte, die zu DIESEM Vorlagentext gehoeren — Laufzeit, Provision, '
  'Fristen. Leer = es gilt, was der Mandant unter "Vorgaben" eingestellt '
  'hat, sonst das eingebaute Verhalten.';

-- Welche Schluessel je Art erlaubt sind. Ein Tippfehler im Feldnamen waere
-- sonst eine Angabe, die nie greift und die niemand vermisst.
alter table public.vertragsvorlagen drop constraint if exists vertragsvorlagen_vorgaben_check;
-- jsonb minus text[] entfernt die genannten Schluessel. Bleibt danach nichts
-- uebrig, standen auch nur erlaubte drin. Eine Unterabfrage darf in einer
-- Pruefbedingung nicht stehen — dieser Weg kommt ohne aus.
alter table public.vertragsvorlagen add constraint vertragsvorlagen_vorgaben_check check (
  case art
    when 'maklervertrag' then
      (vorgaben - array['laufzeit_monate','provision','provisionsmodell']) = '{}'::jsonb
    when 'objektnachweis' then
      (vorgaben - array['provision']) = '{}'::jsonb
    when 'reservierung' then
      (vorgaben - array['reservierungsgebuehr_brutto','reservierungsdauer_tage',
                        'zahlungsfrist_werktage']) = '{}'::jsonb
    else vorgaben = '{}'::jsonb
  end);

-- --- 4) Was am Ende gilt ---------------------------------------------------
-- Eingebaut, dann die Vorgaben des Mandanten, dann die Vorlage des Mandanten,
-- dann die der Gesellschaft. jsonb || jsonb: rechts gewinnt.
create or replace function public.vorlage_vorgaben(
  p_art           text,
  p_gesellschaft  uuid default null)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select
    -- 1. eingebaut: was die Vorlage heute vorschlaegt
    case p_art
      when 'maklervertrag'  then '{"laufzeit_monate":"6","provision":"3,57","provisionsmodell":"teilung"}'::jsonb
      when 'objektnachweis' then '{"provision":"3,00"}'::jsonb
      when 'reservierung'   then '{"reservierungsgebuehr_brutto":"1000","reservierungsdauer_tage":"30","zahlungsfrist_werktage":"5"}'::jsonb
      else '{}'::jsonb
    end
    -- 2. die Vorgaben des Mandanten, unter ihren bisherigen Schluesseln
    || coalesce((
         select jsonb_strip_nulls(jsonb_build_object(
           'laufzeit_monate',   case when p_art = 'maklervertrag'  then max(case when schluessel = 'laufzeit_monate_standard'     then wert #>> '{}' end) end,
           'provision',         case when p_art = 'maklervertrag'  then max(case when schluessel = 'provision_verkaeufer_standard' then wert #>> '{}' end)
                                     when p_art = 'objektnachweis' then max(case when schluessel = 'provision_kaeufer_standard'    then wert #>> '{}' end) end,
           'provisionsmodell',  case when p_art = 'maklervertrag'  then max(case when schluessel = 'provisionsmodell_standard'    then wert #>> '{}' end) end,
           'reservierungsgebuehr_brutto', case when p_art = 'reservierung' then max(case when schluessel = 'reservierung_gebuehr_standard'       then wert #>> '{}' end) end,
           'reservierungsdauer_tage',     case when p_art = 'reservierung' then max(case when schluessel = 'reservierung_dauer_tage_standard'    then wert #>> '{}' end) end,
           'zahlungsfrist_werktage',      case when p_art = 'reservierung' then max(case when schluessel = 'reservierung_zahlungsfrist_standard' then wert #>> '{}' end) end))
           from public.portal_einstellungen), '{}'::jsonb)
    -- 3. die Vorlage des Mandanten
    || coalesce((select v.vorgaben from public.vertragsvorlagen v
                  where v.art = p_art and v.aktiv and v.gesellschaft_id is null
                  order by v.version desc limit 1), '{}'::jsonb)
    -- 4. die Vorlage der Gesellschaft sticht die des Mandanten
    || coalesce((select v.vorgaben from public.vertragsvorlagen v
                  where v.art = p_art and v.aktiv
                    and p_gesellschaft is not null and v.gesellschaft_id = p_gesellschaft
                  order by v.version desc limit 1), '{}'::jsonb)
$function$;

comment on function public.vorlage_vorgaben(text, uuid) is
  'Die Werte, mit denen ein neuer Vertrag/Nachweis/Reservierung vorbelegt '
  'wird. Vier Stufen, die innerste gewinnt: eingebaut, Vorgaben des '
  'Mandanten, Vorlage des Mandanten, Vorlage der Gesellschaft. Laeuft ueber '
  'RLS, sieht also nur den eigenen Mandanten.';

grant execute on function public.vorlage_vorgaben(text, uuid) to authenticated, service_role;
