-- Wer darf die Funktionen in `public` aufrufen?
--
-- Supabase vergibt als Vorgabe `EXECUTE` auf alles in `public` an `PUBLIC`,
-- und PostgREST macht jede Funktion dort als `/rest/v1/rpc/<name>`
-- erreichbar. Am 06.10.2026 durfte `anon` damit 147 von 153 Funktionen
-- rufen — 100 davon als SECURITY DEFINER, also mit den Rechten des Eigners
-- und ohne Row-Level-Security. Fünf verändern Geld und prüfen nichts.
--
-- Vier Fragen:
--   1. Darf `anon` irgendeine Funktion in `public` rufen? Nein.
--   2. Darf `authenticated` die rufen, die nur der Dienstschlüssel rufen
--      soll? Nein — und welche das sind, steht hier ausgeschrieben.
--   3. Darf `authenticated` die übrigen rufen? Ja, sonst stünde die
--      Anwendung still.
--   4. Und wirkt das? `credits_gutschreiben` als `anon`, mit einem
--      Mandanten, der wirklich existiert.
--
-- Die vierte Frage ist die, die zählt. Die ersten drei lesen Kataloge; die
-- vierte versucht es.

\set ON_ERROR_STOP on
\pset pager off

create temporary table befund (nr int generated always as identity, pruefung text,
                               bestanden boolean, bemerkung text);
grant all on befund to public;

-- --- 1) anon darf nichts -------------------------------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'anon darf keine Funktion in public rufen',
       count(*) = 0,
       case when count(*) = 0 then 'keine von ' ||
              (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.prokind='f')
            else left(string_agg(name, ', '), 120) end
  from (
    select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) s;

-- --- 2) Die neun, die nur der Dienstschlüssel rufen darf -----------------
-- Ausgeschrieben, nicht als Muster: wer eine hinzufügt, soll sie
-- hinschreiben müssen.
create temporary table nur_dienst (name text primary key);
insert into nur_dienst values
  ('credits_gutschreiben'), ('credits_tarif_zuteilen'), ('credits_buchen'),
  ('credits_freigeben'), ('credits_reservieren'), ('gruender_platz_vergeben'),
  ('diagnose_secret_pruefen'), ('intern_secret_pruefen'),
  -- fork_76: nimmt bei einer Erstattung Credits zurueck — nur der Webhook.
  ('credits_erstattung');

insert into befund (pruefung, bestanden, bemerkung)
select 'authenticated darf die Geld- und Geheimnisfunktionen nicht rufen',
       count(*) = 0,
       coalesce(left(string_agg(name, ', '), 120), 'keine')
  from (
    select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in (select name from nur_dienst)
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) s;

insert into befund (pruefung, bestanden, bemerkung)
select 'jede der neun gibt es ueberhaupt', count(*) = 9, format('%s von 9 gefunden', count(*))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.proname in (select name from nur_dienst);

insert into befund (pruefung, bestanden, bemerkung)
select 'der Dienstschluessel darf sie weiterhin rufen', count(*) = 0,
       coalesce(left(string_agg(p.proname, ', '), 120), 'alle neun')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.proname in (select name from nur_dienst)
   and not has_function_privilege('service_role', p.oid, 'EXECUTE');

-- --- 3) Die uebrigen darf authenticated rufen ----------------------------
insert into befund (pruefung, bestanden, bemerkung)
select 'authenticated darf die uebrigen rufen', count(*) = 0,
       coalesce(left(string_agg(name, ', '), 120), 'alle')
  from (
    select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname not in (select name from nur_dienst)
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) s;

-- --- 4) Und wirkt es? ----------------------------------------------------
-- Ein echter Mandant, ein echter Aufruf, ein echter Betrag. Vor fork_63
-- ging das durch — und es waere mit dem oeffentlichen anon-Schluessel
-- ueber /rest/v1/rpc/credits_gutschreiben von aussen gegangen.
delete from public.mandanten where slug = 'rechte-test';

do $$
declare m uuid; vorher int; nachher int; ok boolean; meldung text;
begin
  insert into public.mandanten (name, slug) values ('Rechte Test GmbH', 'rechte-test')
    returning id into m;
  select coalesce(public.credits_saldo(m), 0) into vorher;

  set local role anon;
  begin
    perform public.credits_gutschreiben(m, 'paket', 99999, now() + interval '1 year',
                                        'rechte-test');
    ok := false; meldung := 'durchgelassen';
  exception when insufficient_privilege then
    ok := true; meldung := 'abgewiesen: ' || sqlerrm;
  when others then
    ok := false; meldung := 'anderer Fehler: ' || sqlerrm;
  end;
  reset role;

  select coalesce(public.credits_saldo(m), 0) into nachher;
  insert into befund (pruefung, bestanden, bemerkung)
  values ('anon kann sich keine Credits gutschreiben', ok, meldung),
         ('und der Saldo ist unveraendert', vorher = nachher,
          format('vorher %s, nachher %s', vorher, nachher));
end $$;

delete from public.mandanten where slug = 'rechte-test';

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as ergebnis,
       pruefung, bemerkung
  from befund order by nr;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung || ' (' || bemerkung || ')', '; ')
    into n, liste from befund where bestanden is not true;
  if n > 0 then
    raise exception 'Funktionsrechte: % von % nicht bestanden — %',
      n, (select count(*) from befund), liste;
  end if;
  raise notice 'Funktionsrechte: alle % Pruefungen bestanden.',
    (select count(*) from befund);
end $$;
