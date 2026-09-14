-- Altbestand aus `public` herausraeumen
--
-- Ausgangslage: Das Projekt usguiggfciavwzkdfjgt traegt das Datenmodell des
-- frueheren Next.js-Entwurfs — 110 Tabellen, 93 Funktionen, 34 Aufzaehlungstypen,
-- dazu Testdaten. Der Fork bringt ein anderes, vollstaendiges Datenmodell mit,
-- das in `public` dieselben Tabellennamen belegt (objekte, kontakte, aufgaben,
-- termine, vertraege, rechnungen und ueber zwanzig weitere).
--
-- Diese Migration LOESCHT NICHTS. Sie verschiebt den Altbestand in das Schema
-- `altbestand`. Damit ist `public` frei, die alten Daten bleiben lesbar, und
-- nichts davon ist noch ueber die API erreichbar: PostgREST veroeffentlicht nur
-- die konfigurierten Schemata (`public`, `graphql_public`) — `altbestand` steht
-- dort nicht.
--
-- WICHTIG — noch nicht angewendet.
-- Sobald diese Migration laeuft, hoert die auf Netlify veroeffentlichte
-- Next.js-Anwendung sofort auf zu arbeiten, weil sie ihre Tabellen unter
-- `public` sucht. Deshalb wird sie erst nach ausdruecklicher Freigabe
-- angewendet. Siehe docs/STATUS.md, Abschnitt 3.
--
-- Das Schema `intern` bleibt unberuehrt. Es enthaelt die Hilfsfunktionen des
-- Altbestands, kollidiert mit dem Fork nicht (der bringt seine Helfer in
-- `public` mit) und wird von den verschobenen Triggern weiter gebraucht:
-- Trigger zeigen auf die Funktions-OID, nicht auf den Namen, und ueberleben
-- das Verschieben der Tabelle.

create schema if not exists altbestand;

comment on schema altbestand is
  'Datenmodell des Next.js-Entwurfs vor dem Fork. Eingefroren, nicht ueber die '
  'API erreichbar, kein Produktbestandteil. Nur zur Nachschau und fuer eine '
  'etwaige Datenuebernahme.';

-- Kein Zugriff fuer die Rollen, mit denen der Browser spricht. Ohne
-- `usage` auf dem Schema kommt auch ein direkter Aufruf nicht an die Tabellen,
-- selbst wenn spaeter jemand `altbestand` versehentlich veroeffentlicht.
revoke all on schema altbestand from anon, authenticated;
grant usage on schema altbestand to postgres, service_role;

do $$
declare
  eintrag record;
  verschoben int := 0;
begin
  -- Tabellen. `set schema` nimmt Indizes, Constraints, Regeln, Trigger und die
  -- von Spalten besessenen Sequenzen mit. Richtlinien (RLS) haengen an der
  -- Tabelle und wandern ebenfalls mit.
  for eintrag in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- Von einer Erweiterung mitgebrachte Tabellen bleiben liegen.
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
    order by c.relname
  loop
    execute format('alter table public.%I set schema altbestand', eintrag.relname);
    verschoben := verschoben + 1;
  end loop;
  raise notice 'Tabellen verschoben: %', verschoben;

  -- Sichten. Im Altbestand derzeit keine; die Schleife steht hier, damit die
  -- Migration auch dann vollstaendig raeumt, wenn bis zur Freigabe noch eine
  -- entsteht.
  verschoben := 0;
  for eintrag in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
    order by c.relname
  loop
    if eintrag.relkind = 'v' then
      execute format('alter view public.%I set schema altbestand', eintrag.relname);
    else
      execute format('alter materialized view public.%I set schema altbestand', eintrag.relname);
    end if;
    verschoben := verschoben + 1;
  end loop;
  raise notice 'Sichten verschoben: %', verschoben;

  -- Freistehende Sequenzen (nicht von einer Spalte besessen — die sind mit der
  -- Tabelle schon weg).
  verschoben := 0;
  for eintrag in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
    order by c.relname
  loop
    execute format('alter sequence public.%I set schema altbestand', eintrag.relname);
    verschoben := verschoben + 1;
  end loop;
  raise notice 'Sequenzen verschoben: %', verschoben;

  -- Funktionen und Prozeduren. Die Signatur muss mit, sonst ist bei
  -- ueberladenen Namen nicht entscheidbar, welche gemeint ist.
  verschoben := 0;
  for eintrag in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args,
           p.prokind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
    order by p.proname
  loop
    if eintrag.prokind = 'p' then
      execute format('alter procedure public.%I(%s) set schema altbestand',
                     eintrag.proname, eintrag.args);
    else
      execute format('alter function public.%I(%s) set schema altbestand',
                     eintrag.proname, eintrag.args);
    end if;
    verschoben := verschoben + 1;
  end loop;
  raise notice 'Funktionen verschoben: %', verschoben;

  -- Aufzaehlungstypen und zusammengesetzte Typen. Die Spalten der verschobenen
  -- Tabellen zeigen auf die Typ-OID und bleiben gueltig.
  verschoben := 0;
  for eintrag in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'd')
      and not exists (
        select 1 from pg_depend d
        where d.objid = t.oid and d.deptype = 'e'
      )
      -- Zeilentypen von Tabellen nicht einzeln anfassen; die sind mit der
      -- Tabelle schon umgezogen.
      and t.typrelid = 0
    order by t.typname
  loop
    execute format('alter type public.%I set schema altbestand', eintrag.typname);
    verschoben := verschoben + 1;
  end loop;
  raise notice 'Typen verschoben: %', verschoben;
end;
$$;

-- Gegenprobe. Bleibt etwas in `public` liegen, bricht die Migration ab, statt
-- eine halb geraeumte Datenbank zu hinterlassen.
do $$
declare
  rest int;
  namen text;
begin
  select count(*), string_agg(relname, ', ' order by relname)
  into rest, namen
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'm', 'S')
    and not exists (
      select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e'
    );

  if rest > 0 then
    raise exception 'Schema public nicht leer, liegen geblieben: %', namen;
  end if;
end;
$$;
