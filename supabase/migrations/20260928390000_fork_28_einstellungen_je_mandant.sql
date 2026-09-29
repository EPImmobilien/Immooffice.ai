-- ===========================================================================
-- fork_28 — vier Einstellungstabellen gehoerten der Plattform, nicht dem
--           Mandanten
--
-- fork_23 hat den Wachposten aus fork_17 auf Primaerschluessel ausgeweitet.
-- Er laesst einen Schluessel durchgehen, sobald eine seiner Spalten
-- mandant_id ODER id heisst. Das war fuer die uebliche Bauart gedacht: eine
-- uuid je Zeile, global eindeutig, harmlos.
--
-- Vier Tabellen heissen anders. Sie tragen zwar eine Spalte id — aber die
-- ist keine Kennung, sondern ein Riegel:
--
--   push_einstellungen   id integer, check (id = 1)
--   kosten_saetze        id integer, check (id = 1)
--   liquid_settings      id integer, check (id = 1)
--   akq_einstellungen    id boolean, check (id)
--
-- Eine Zeile. Fuer die ganze Plattform. Das ist in der Vorlage richtig —
-- dort gibt es genau eine Firma. Im Fork heisst es: wer den Push-Schalter
-- umlegt, legt ihn fuer alle um; wer seinen Firmensitz eintraegt, traegt ihn
-- fuer alle ein; und die Kilometersaetze, nach denen abgerechnet wird, hat
-- der eingestellt, der zuletzt gespeichert hat.
--
-- Der Schluessel wird deshalb (mandant_id, id). Der Riegel bleibt: je
-- Mandant genau eine Zeile.
-- ===========================================================================

-- --- 1) Je Mandant eine Zeile ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['push_einstellungen', 'kosten_saetze',
                           'liquid_settings', 'akq_einstellungen']
  loop
    execute format(
      'alter table public.%I alter column mandant_id set default public.aktuelle_mandant_id()', t);
    -- Eine vorhandene Zeile ohne Mandanten gehoert dem ersten. Auf einer
    -- frischen Instanz trifft das nichts.
    execute format(
      'update public.%I set mandant_id = (select id from public.mandanten order by erstellt_am, id limit 1) where mandant_id is null', t);
    execute format('delete from public.%I where mandant_id is null', t);
    execute format('alter table public.%I alter column mandant_id set not null', t);
    execute format('alter table public.%I drop constraint %I', t, t || '_pkey');
    execute format(
      'alter table public.%I add constraint %I primary key (mandant_id, id)', t, t || '_pkey');
    execute format(
      'comment on constraint %I on public.%I is %L', t || '_pkey', t,
      'Je Mandant eine Zeile, nicht je Plattform eine. Die Spalte id ist hier '
      'keine Kennung, sondern ein Riegel (check id = 1 beziehungsweise check id).');
  end loop;
end $$;

-- --- 2) Jeder Mandant bekommt seine Zeilen ---------------------------------
-- Ohne Zeile greift in der Oberflaeche kein update: sie schreibt mit
-- .update(...).eq("id", 1) und legt nichts an. Ein Mandant ohne Zeile haette
-- also stumme Schalter. Die Funktion legt an, was fehlt, und wird von der
-- Selbstregistrierung in Phase 3 aufgerufen.
create or replace function public.mandant_grundeinstellungen(p_mandant uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_mandant is null then
    raise exception 'mandant_grundeinstellungen: kein Mandant angegeben';
  end if;
  insert into public.push_einstellungen (id, mandant_id) values (1, p_mandant)
    on conflict do nothing;
  insert into public.kosten_saetze (id, mandant_id) values (1, p_mandant)
    on conflict do nothing;
  insert into public.liquid_settings (id, mandant_id) values (1, p_mandant)
    on conflict do nothing;
  insert into public.akq_einstellungen (id, mandant_id) values (true, p_mandant)
    on conflict do nothing;
end
$$;

comment on function public.mandant_grundeinstellungen(uuid) is
  'Legt die vier Einstellungszeilen an, die es je Mandant genau einmal gibt. '
  'Mehrfach aufrufbar; vorhandene Zeilen bleiben unberuehrt.';

revoke all on function public.mandant_grundeinstellungen(uuid) from public, anon, authenticated;

do $$
declare m uuid;
begin
  for m in select id from public.mandanten loop
    perform public.mandant_grundeinstellungen(m);
  end loop;
end $$;

-- --- 3) Der Wachposten sieht den Unterschied jetzt --------------------------
-- Die Ausnahme fuer eine Spalte namens id gilt nur noch, wo id auch wirklich
-- eine Kennung ist: eine uuid oder ein Zaehler aus einer Sequenz. Ein
-- Riegel-id faellt durch.
do $$
declare offen text;
begin
  select string_agg(r.relname || '.' || con.conname, ', ' order by r.relname) into offen
    from pg_constraint con
    join pg_class r on r.oid = con.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    join public.mandanten_einstufung e on e.tabelle = r.relname and e.gruppe = 'MANDANT'
   where n.nspname = 'public' and con.contype = 'p'
     and not exists (
       select 1 from unnest(con.conkey) k
        join pg_attribute a on a.attrelid = r.oid and a.attnum = k
        left join pg_attrdef d on d.adrelid = r.oid and d.adnum = a.attnum
       where a.attname = 'mandant_id'
          or (a.attname = 'id'
              and (a.atttypid = 'uuid'::regtype
                   or pg_get_expr(d.adbin, d.adrelid) like 'nextval(%')))
     and con.conname not in (
       -- Schluessel auf einer bereits mandantengebundenen Elterntabelle.
       'immobilie_fahrt_cache_pkey', 'immobilie_grundstueck_pkey',
       'immobilie_kosten_einstellung_pkey', 'immobilie_onedrive_pkey',
       'immobilie_titelbild_wahl_pkey', 'objekt_status_vorschlag_pkey',
       'push_termin_erinnerungen_pkey', 'rechnung_nummern_sequence_pkey',
       'suchkriterien_treffer_pkey',
       -- onOffice ist ausgebaut; die Tabellen liegen leer und ohne Zugang.
       'onoffice_adressen_pkey', 'onoffice_benutzer_zuordnung_pkey',
       'onoffice_feld_werte_pkey', 'onoffice_felder_pkey',
       'onoffice_objekte_pkey', 'onoffice_schreib_felder_pkey');
  if offen is not null then
    raise exception 'Global eindeutiger Primaerschluessel auf einer Mandantentabelle: %', offen;
  end if;
end $$;
