-- Gehoeren die vier Einstellungstabellen dem Mandanten — oder immer noch der
-- Plattform?
--
-- push_einstellungen, kosten_saetze, liquid_settings und akq_einstellungen
-- tragen eine Spalte id, die keine Kennung ist, sondern ein Riegel:
-- check (id = 1) beziehungsweise check (id). Solange der Primaerschluessel
-- allein daran hing, gab es die Zeile genau EINMAL fuer alle Mandanten.
--
-- Vier Fragen:
--   1. Kann ein zweiter Mandant seine eigene Zeile anlegen?
--   2. Bleibt der Riegel: eine zweite Zeile je Mandant wird abgewiesen?
--   3. Legt mandant_grundeinstellungen() alle vier an, und stoert ein
--      zweiter Aufruf nicht?
--   4. Sieht ein angemeldeter Nutzer nur die Zeile seines Mandanten?

\set ON_ERROR_STOP on
\pset pager off

delete from public.mandanten where slug in ('einst-a', 'einst-b');
delete from auth.users where email like '%@einst.example';

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;
create temporary table wer (was text primary key, wert uuid);
grant all on wer to public;

do $$
declare
  m_a uuid; m_b uuid;
  u_a uuid := gen_random_uuid();
  zweite boolean;
  n_a int; n_b int;
begin
  insert into public.mandanten (name, slug) values ('Alpha GmbH', 'einst-a') returning id into m_a;
  insert into public.mandanten (name, slug) values ('Beta GmbH',  'einst-b') returning id into m_b;
  insert into wer values ('m_a', m_a), ('m_b', m_b), ('u_a', u_a);

  insert into auth.users (id, email) values (u_a, 'a@einst.example');
  insert into public.profiles (id, name, email, role, mandant_id)
    values (u_a, 'Anna Alpha', 'a@einst.example', 'chef', m_a);

  -- 1) Zwei Mandanten, zwei Zeilen
  perform public.mandant_grundeinstellungen(m_a);
  perform public.mandant_grundeinstellungen(m_b);

  select count(*) into n_a from public.push_einstellungen where mandant_id = m_a;
  select count(*) into n_b from public.push_einstellungen where mandant_id = m_b;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Jeder Mandant hat seine eigene push_einstellungen-Zeile',
          n_a = 1 and n_b = 1, format('A=%s B=%s', n_a, n_b));

  -- 2) Der Riegel haelt: keine zweite Zeile je Mandant
  begin
    insert into public.push_einstellungen (id, mandant_id) values (1, m_a);
    zweite := true;
  exception when unique_violation then
    zweite := false;
  end;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Eine zweite Zeile je Mandant wird abgewiesen',
          zweite = false, case when zweite then 'ging durch' else 'abgewiesen' end);

  -- 3) Alle vier, und ein zweiter Aufruf stoert nicht
  perform public.mandant_grundeinstellungen(m_b);
  select (select count(*) from public.push_einstellungen where mandant_id = m_b)
       + (select count(*) from public.kosten_saetze      where mandant_id = m_b)
       + (select count(*) from public.liquid_settings    where mandant_id = m_b)
       + (select count(*) from public.akq_einstellungen  where mandant_id = m_b)
    into n_b;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('mandant_grundeinstellungen legt alle vier an und ist wiederholbar',
          n_b = 4, format('%s von 4', n_b));

  -- Der eine Mandant stellt den Push aus. Der andere darf das nicht merken.
  update public.push_einstellungen set aktiv = false where mandant_id = m_a;
end $$;

-- 4) Unter RLS, als angemeldeter Nutzer des einen Mandanten.
-- set local role gehoert in einen Block — ausserhalb einer Transaktion
-- verpufft es mit einer blossen Warnung, und der Test liefe weiter als
-- Superuser, fuer den RLS gar nicht gilt.
do $$
declare sichtbar int; fremd int; m_a uuid;
begin
  select wert into m_a from wer where was='u_a';
  perform set_config('request.jwt.claims',
    json_build_object('sub', m_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into sichtbar from public.push_einstellungen;
  select count(*) into fremd from public.push_einstellungen
   where mandant_id <> (select wert from wer where was='m_a');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Angemeldet sieht man genau eine Zeile — die eigene',
          sichtbar = 1 and fremd = 0, format('sichtbar=%s davon fremd=%s', sichtbar, fremd));
end $$;

-- Der Schalter des einen hat den anderen nicht erwischt.
do $$
declare a_aktiv boolean; b_aktiv boolean;
begin
  select aktiv into a_aktiv from public.push_einstellungen
   where mandant_id = (select wert from wer where was='m_a');
  select aktiv into b_aktiv from public.push_einstellungen
   where mandant_id = (select wert from wer where was='m_b');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Push aus beim einen laesst den anderen an',
          a_aktiv is false and b_aktiv is true,
          format('A=%s B=%s', a_aktiv, b_aktiv));
end $$;

-- Und der Wachposten selbst: kein Primaerschluessel auf einer
-- Mandantentabelle, der ohne mandant_id global eindeutig waere.
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
       'immobilie_fahrt_cache_pkey', 'immobilie_grundstueck_pkey',
       'immobilie_kosten_einstellung_pkey', 'immobilie_onedrive_pkey',
       'immobilie_titelbild_wahl_pkey', 'objekt_status_vorschlag_pkey',
       'push_termin_erinnerungen_pkey', 'rechnung_nummern_sequence_pkey',
       'suchkriterien_treffer_pkey',
       'onoffice_adressen_pkey', 'onoffice_benutzer_zuordnung_pkey',
       'onoffice_feld_werte_pkey', 'onoffice_felder_pkey',
       'onoffice_objekte_pkey', 'onoffice_schreib_felder_pkey');
  insert into befund (pruefung, bestanden, bemerkung)
  values ('Kein plattformweiter Primaerschluessel auf einer Mandantentabelle',
          offen is null, coalesce(offen, 'keiner'));
end $$;

delete from public.mandanten where slug in ('einst-a', 'einst-b');
delete from auth.users where email like '%@einst.example';

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis, pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Einstellungen je Mandant: % von % nicht bestanden — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Einstellungen je Mandant: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
