-- Der Rundumschlag: sieht ein Mandant IRGENDWO die Zeilen des anderen?
--
-- tests/mandant.sql prueft einige Tabellen von Hand — gruendlich, aber eben
-- ausgewaehlt. Diese Pruefung geht ueber ALLE Tabellen der Gruppe MANDANT
-- und macht es mechanisch:
--
--   1. Zwei Mandanten, je ein Chef.
--   2. In JEDE Mandantentabelle wird eine Zeile fuer BETA gelegt und eine
--      fuer ALPHA. Pflichtspalten werden dabei gefuellt: Fremdschluessel mit
--      einer vorhandenen Zeile der Zieltabelle, Aufzaehlungen mit ihrem
--      ersten erlaubten Wert, alles Uebrige mit einem Platzhalter. Was beim
--      ersten Versuch an einem Fremdschluessel scheitert, klappt oft im
--      zweiten Durchgang — deshalb mehrere.
--   3. Als Chef ALPHA, unter RLS: in jeder Tabelle nachzaehlen, wie viele
--      Zeilen von BETA sichtbar sind. Jede einzelne muss null ergeben.
--
-- WARUM AUCH ALPHAS EIGENE ZEILE: Ein Test, der nur "sieht nichts Fremdes"
-- prueft, wuerde auch dann gruen leuchten, wenn die Richtlinien ALLES
-- verbieten. Deshalb wird mitgezaehlt, in wie vielen Tabellen Alpha seine
-- EIGENE Zeile sieht. Nur diese Tabellen sind ein Nachweis; der Rest ist
-- vom Rechtemodell der Vorlage ohnehin verdeckt und wird getrennt gezaehlt.
--
-- Die Zahl der wirklich geprueften Tabellen steht am Ende. Faellt sie, ist
-- entweder eine Tabelle dazugekommen, die sich nicht fuellen laesst, oder
-- eine Richtlinie hat sich geaendert. Beides will gesehen werden.

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('rund-a', 'rund-b');
delete from auth.users where email like '%@rund.example';

create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;
create temporary table lage (tabelle text primary key, gefuellt_a boolean default false,
                             gefuellt_b boolean default false,
                             sicht_eigen int, sicht_fremd int);
grant all on lage to public;

do $$
declare a uuid; b uuid; ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Rund Alpha', 'rund-a') returning id into a;
  insert into public.mandanten (name, slug) values ('Rund Beta',  'rund-b') returning id into b;
  insert into auth.users (id, email) values (ua, 'a@rund.example'), (ub, 'b@rund.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (ua, 'Chef Alpha', 'a@rund.example', 'chef', a),
    (ub, 'Chef Beta',  'b@rund.example', 'chef', b);
  insert into wer values ('a', a), ('b', b), ('ua', ua), ('ub', ub);
  insert into lage (tabelle)
    select e.tabelle from public.mandanten_einstufung e where e.gruppe = 'MANDANT';
end $$;

-- --- Fuellen ---------------------------------------------------------------
do $$
declare
  ziel uuid; spalte text; tab text;
  offen text[]; naechste text[]; durchgang int;
  wessen text;
begin
  foreach wessen in array array['a', 'b'] loop
    select wert into ziel from wer where was = wessen;
    select array_agg(tabelle order by tabelle) into offen from lage;
    durchgang := 0;
    while durchgang < 8 and coalesce(array_length(offen, 1), 0) > 0 loop
      durchgang := durchgang + 1;
      naechste := '{}';
      foreach tab in array offen loop
        declare sp text; we text; versuch int;
        begin
        -- Zwei Anlaeufe. Im zweiten werden zusaetzlich die Textspalten
        -- gefuellt, die in einer Pruefbedingung vorkommen — das faengt die
        -- Bedingungen der Art "eines von beidem muss dastehen"
        -- (kontakte_hat_namen und Verwandte), die sonst an einer Spalte
        -- scheitern, die gar nicht Pflicht ist.
        versuch := 0;
        <<anlauf>>
        loop
        versuch := versuch + 1;
        begin
          select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
                 string_agg(
                   coalesce(
                     -- Fremdschluessel: eine vorhandene Zeile der Zieltabelle,
                     -- moeglichst aus demselben Mandanten.
                     (select format('(select %I from public.%I %s limit 1)',
                                    fa.attname, fr.relname,
                                    case when exists (select 1 from public.mandanten_einstufung e2
                                                       where e2.tabelle = fr.relname and e2.gruppe = 'MANDANT')
                                         then format('where mandant_id = %L', ziel) else '' end)
                        from pg_constraint fk
                        join pg_class r  on r.oid  = fk.conrelid
                        join pg_class fr on fr.oid = fk.confrelid
                        join pg_attribute a  on a.attrelid  = r.oid  and a.attnum  = fk.conkey[1]
                        join pg_attribute fa on fa.attrelid = fr.oid and fa.attnum = fk.confkey[1]
                       where fk.contype = 'f' and r.relname = c.table_name
                         and array_length(fk.conkey, 1) = 1 and a.attname = c.column_name
                       limit 1),
                     -- Aufzaehlung: der erste erlaubte Wert.
                     (select quote_literal((regexp_match(pg_get_constraintdef(ck.oid),
                               quote_ident(c.column_name) || ' = ANY \(ARRAY\[''([^'']+)'''))[1])
                        from pg_constraint ck
                       where ck.contype = 'c' and ck.conrelid = ('public.' || c.table_name)::regclass
                         and pg_get_constraintdef(ck.oid) like '%' || c.column_name || ' = ANY (ARRAY[%'
                       limit 1),
                     case
                       -- Der Platzhalter traegt den Mandanten in sich: sonst
                       -- kollidieren Alpha und Beta an jeder eindeutigen
                       -- Textspalte (projekte.slug, kontakte.email …), und
                       -- genau die Tabellen fielen aus der Pruefung.
                       when c.data_type in ('text','character varying','character')
                         then quote_literal('rund-' || left(replace(ziel::text, '-', ''), 10))
                       when c.data_type in ('integer','bigint','smallint','numeric','double precision','real') then '1'
                       when c.data_type = 'boolean' then 'false'
                       when c.data_type = 'uuid' then quote_literal(gen_random_uuid())
                       when c.data_type like 'timestamp%' then 'now()'
                       when c.data_type = 'date' then 'current_date'
                       when c.data_type = 'jsonb' then quote_literal('{}') || '::jsonb'
                       when c.data_type = 'ARRAY' then quote_literal('{}') || '::text[]'
                       else 'null' end), ', ' order by c.ordinal_position)
            into sp, we
            from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = tab
             and c.column_name <> 'mandant_id'
             and (
               (c.is_nullable = 'NO' and c.column_default is null)
               or (versuch > 1 and c.data_type in ('text','character varying')
                   and exists (select 1 from pg_constraint ck
                                where ck.contype = 'c'
                                  and ck.conrelid = ('public.' || tab)::regclass
                                  and pg_get_constraintdef(ck.oid) like '%' || c.column_name || '%'))
             );
          execute format('insert into public.%I (mandant_id%s) values (%L%s)',
                         tab, case when sp is null then '' else ', ' || sp end,
                         ziel, case when we is null then '' else ', ' || we end);
          if wessen = 'a' then update lage set gefuellt_a = true where tabelle = tab;
                          else update lage set gefuellt_b = true where tabelle = tab; end if;
          exit anlauf;
        exception when others then
          if versuch >= 2 then
            naechste := naechste || tab;
            exit anlauf;
          end if;
        end;
        end loop anlauf;
        end;
      end loop;
      exit when naechste = offen;
      offen := naechste;
    end loop;
  end loop;
end $$;

-- --- Nachzaehlen, als Chef Alpha unter RLS ---------------------------------
do $$
declare r record; n_eigen int; n_fremd int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select wert from wer where was = 'ua'),
                      'role', 'authenticated')::text, true);
  set local role authenticated;
  for r in select tabelle from lage order by tabelle loop
    begin
      execute format('select count(*) from public.%I where mandant_id = %L',
                     r.tabelle, (select wert from wer where was = 'a')) into n_eigen;
      execute format('select count(*) from public.%I where mandant_id = %L',
                     r.tabelle, (select wert from wer where was = 'b')) into n_fremd;
    exception when others then
      -- Keine Leseberechtigung ueberhaupt: fuer diese Pruefung dasselbe wie
      -- "nichts zu sehen".
      n_eigen := 0; n_fremd := 0;
    end;
    update lage set sicht_eigen = n_eigen, sicht_fremd = n_fremd where tabelle = r.tabelle;
  end loop;
  reset role;
end $$;

-- --- Befund ---------------------------------------------------------------
select tabelle, sicht_fremd as fremde_zeilen
  from lage where coalesce(sicht_fremd, 0) > 0 order by tabelle;

-- Was sich nicht fuellen liess. Kein Fehler, aber es gehoert gesagt:
-- ueber diese Tabellen sagt der Rundumschlag nichts.
select tabelle as nicht_befuellbar from lage where not gefuellt_b order by tabelle;

select count(*) filter (where gefuellt_b) as tabellen_mit_fremder_zeile,
       count(*) filter (where gefuellt_b and coalesce(sicht_eigen, 0) > 0) as davon_wirklich_geprueft,
       count(*) filter (where not gefuellt_b) as nicht_befuellbar,
       count(*) filter (where gefuellt_b and coalesce(sicht_eigen, 0) = 0) as vom_rechtemodell_verdeckt,
       count(*) as mandantentabellen
  from lage;

do $$
declare
  n_leck int; liste text; n_geprueft int; n_gefuellt int;
begin
  select count(*), string_agg(tabelle || ' (' || sicht_fremd || ')', ', ' order by tabelle)
    into n_leck, liste from lage where coalesce(sicht_fremd, 0) > 0;
  if n_leck > 0 then
    raise exception 'Fremde Zeilen sichtbar in % Tabelle(n): %', n_leck, liste;
  end if;

  select count(*) filter (where gefuellt_b and coalesce(sicht_eigen, 0) > 0),
         count(*) filter (where gefuellt_b)
    into n_geprueft, n_gefuellt from lage;

  -- Eine Untergrenze, damit die Pruefung nicht leise verhungert. Am
  -- 29.09.2026 waren es 159 von 176; faellt die Zahl unter 150, hat sich
  -- etwas geaendert, das angesehen werden will — eine neue Tabelle, die
  -- sich nicht fuellen laesst, oder eine Richtlinie, die mehr verdeckt.
  if n_geprueft < 150 then
    raise exception 'Nur % Tabelle(n) mit eigener UND fremder Zeile geprueft '
                    '(% befuellt). Unter 100 ist der Nachweis zu duenn.',
                    n_geprueft, n_gefuellt;
  end if;

  raise notice 'Rundumschlag: keine fremde Zeile sichtbar. % von % Mandantentabellen '
               'wirklich geprueft (eigene Zeile sichtbar, fremde nicht).',
               n_geprueft, (select count(*) from lage);
end $$;

delete from public.mandanten where slug in ('rund-a', 'rund-b');
delete from auth.users where email like '%@rund.example';
