-- ===========================================================================
-- Fork-eigene Migration 67 — der Mandant kommt auch vom Besitzer
--
-- BEFUND vom 07.10.2026: Ein Postfach, das der Betreiber angelegt hatte,
-- meldete "erfolgreich hinzugefuegt" und war danach nicht zu sehen.
-- mail_postfaecher.mandant_id stand auf NULL. Die Spalte hat den
-- Vorgabewert aktuelle_mandant_id(); der liest den Mandanten aus dem
-- Anmelde-Token, und die Edge Function, die das Postfach speichert, laeuft
-- mit dem Dienstschluessel — also ohne Token. NULL ist mit nichts gleich,
-- die restriktive Richtlinie aus fork_07 blendet die Zeile fuer JEDEN aus,
-- und zwar ohne Fehlermeldung.
--
-- DAS IST DAS DRITTE MAL. fork_22 hat es fuer Kindsaetze mit einem
-- Elternsatz geloest (Projektaktivitaet -> Projekt), fork_65 fuer den
-- Posteingang (Mail -> Postfach). Beide Male wurde die Luecke dort
-- geschlossen, wo sie gerade weh tat. Diesmal nicht.
--
-- WAS GEFEHLT HAT: der haeufigste Elternsatz ist gar kein Fachdatensatz,
-- sondern der BESITZER. Ein Postfach gehoert dem Mandanten seines Nutzers,
-- eine Mailkategorie auch, ein Arbeitszeitmodell ebenso. Das ist keine
-- Vermutung, sondern die Definition — genau wie bei fork_22.
--
-- Deshalb haengt diese Migration den vorhandenen Wachposten
-- mandant_aus_eltern() an JEDE MANDANT-Tabelle, die ein Besitzerfeld auf
-- profiles traegt und ihn noch nicht hat. Nicht an die eine, die gemeldet
-- wurde. Am 07.10.2026 waren das 30 Tabellen.
--
-- WARUM DAS KEIN SCHLUPFLOCH IST: unveraendert die Begruendung aus fork_22.
-- Postgres wertet WITH CHECK NACH den BEFORE-Triggern aus. Traegt jemand
-- eine Zeile fuer einen fremden Besitzer ein, setzt der Trigger dessen
-- Mandanten — und genau daran weist die restriktive Richtlinie sie ab. Der
-- Trigger kann die Grenze vervollstaendigen, nicht aufweichen.
--
-- WAS ER NICHT TUT: raten. Hat der Besitzer selbst keinen Mandanten, bleibt
-- die Zeile ohne. Lieber sichtbar unvollstaendig als falsch zugeordnet.
-- ===========================================================================

-- --- 1. Anhaengen ----------------------------------------------------------

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    with mandant_tab as (
      select e.tabelle
      from public.mandanten_einstufung e
      where e.gruppe = 'MANDANT'
        and to_regclass('public.' || quote_ident(e.tabelle)) is not null
    ), mit_besitzer as (
      -- Die vier Schreibweisen, die in der Vorlage vorkommen. Sie meinen
      -- dasselbe; umbenannt wird nichts (CLAUDE.md: keine Umbenennung).
      select distinct on (m.tabelle) m.tabelle, c.column_name
      from mandant_tab m
      join information_schema.columns c
        on c.table_schema = 'public' and c.table_name = m.tabelle
       and c.column_name in ('benutzer_id', 'user_id', 'besitzer_id', 'profil_id')
      join information_schema.columns mc
        on mc.table_schema = 'public' and mc.table_name = m.tabelle
       and mc.column_name = 'mandant_id'
      order by m.tabelle,
               array_position(array['benutzer_id','besitzer_id','profil_id','user_id'],
                              c.column_name)
    ), hat_wachposten as (
      select distinct cl.relname as tabelle
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class cl on cl.oid = t.tgrelid
      where not t.tgisinternal and p.proname = 'mandant_aus_eltern'
    )
    select b.tabelle, b.column_name
    from mit_besitzer b
    where b.tabelle not in (select tabelle from hat_wachposten)
    order by 1
  loop
    execute format(
      'create trigger %I before insert on public.%I '
      'for each row execute function public.mandant_aus_eltern(%L, %L)',
      'trg_' || r.tabelle || '_mandant_besitzer', r.tabelle,
      r.column_name, 'profiles');
    n := n + 1;
  end loop;
  raise notice 'Wachposten an % Tabelle(n) gehaengt.', n;
end $$;

-- --- 2. Nachtragen, was schon ohne Mandanten liegt -------------------------
--
-- Der Trigger greift ab jetzt. Die Zeilen von gestern bleiben unsichtbar,
-- bis sie jemand zuordnet — und niemand sieht sie, um es zu bemerken.

do $$
declare
  r record;
  n int;
  gesamt int := 0;
begin
  for r in
    select cl.relname as tabelle, t.tgargs
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class cl on cl.oid = t.tgrelid
    where not t.tgisinternal and p.proname = 'mandant_aus_eltern'
      and t.tgname like '%_mandant_besitzer'
    order by 1
  loop
    execute format(
      'update public.%I k set mandant_id = pr.mandant_id '
      'from public.profiles pr '
      'where pr.id = k.%I and k.mandant_id is null and pr.mandant_id is not null',
      r.tabelle,
      (select c.column_name
         from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = r.tabelle
          and c.column_name in ('benutzer_id','besitzer_id','profil_id','user_id')
        order by array_position(array['benutzer_id','besitzer_id','profil_id','user_id'],
                                c.column_name)
        limit 1));
    get diagnostics n = row_count;
    if n > 0 then
      raise notice '%: % Zeile(n) nachgetragen.', r.tabelle, n;
      gesamt := gesamt + n;
    end if;
  end loop;
  raise notice 'Insgesamt % Zeile(n) nachgetragen.', gesamt;
end $$;
