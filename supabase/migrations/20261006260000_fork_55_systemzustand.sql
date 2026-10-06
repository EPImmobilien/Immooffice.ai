-- ===========================================================================
-- fork_55 — Systemzustand für den Betreiber: laufen die Hintergrundjobs?
-- ===========================================================================
-- Zwei Fragen, die ein Entwickler-Dashboard beantworten muss und die bisher
-- niemand beantworten konnte, ohne sich in die Datenbank zu setzen:
--
--   1. Laufen die Zeitplan-Jobs — und wann ist zuletzt einer gescheitert?
--      Ein Postfachabruf, der seit drei Tagen nicht mehr läuft, fällt sonst
--      erst auf, wenn ein Kunde anruft.
--   2. Wo brennt es in den Oberflächen? `fehler_protokoll` sammelt, was in
--      den Browsern der Kunden schiefgeht.
--
-- Beides liegt ausserhalb dessen, was PostgREST von sich aus hergibt:
-- `cron.job_run_details` ist ein fremdes Schema, und `fehler_protokoll` ist
-- eine Mandantentabelle. Deshalb zwei Funktionen.
--
-- DIE GRENZE: `fehler_uebersicht` gibt **Meldung und Stapelspur NICHT**
-- heraus. Sie sagt, WIE OFT WELCHER Fehler in WELCHEM Haus auftrat — und das
-- ist die Frage, die ein Betreiber beantwortet haben will. Wer den Wortlaut
-- braucht, beginnt einen Supportzugriff: befristet, begründet, protokolliert
-- und für den Kunden nachlesbar. CLAUDE.md, Prinzip der geringsten Rechte.
--
-- Beide Funktionen sind für anon und authenticated gesperrt. Der einzige Weg
-- führt über `plattform-admin` mit dem Dienstschlüssel, und der prüft die
-- Mitgliedschaft.
-- ===========================================================================

create or replace function public.cron_zustand()
 returns table (
   jobname       text,
   zeitplan      text,
   aktiv         boolean,
   letzter_lauf  timestamptz,
   letzter_stand text,
   fehler_24h    bigint,
   laeufe_24h    bigint)
 language sql
 stable
 security definer
 set search_path to 'public', 'cron'
as $function$
  select j.jobname::text,
         j.schedule::text,
         j.active,
         l.letzter_lauf,
         l.letzter_stand,
         coalesce(l.fehler_24h, 0),
         coalesce(l.laeufe_24h, 0)
    from cron.job j
    left join lateral (
      select max(d.start_time) as letzter_lauf,
             (array_agg(d.status order by d.start_time desc))[1]::text as letzter_stand,
             count(*) filter (where d.status <> 'succeeded'
                                and d.start_time > now() - interval '24 hours') as fehler_24h,
             count(*) filter (where d.start_time > now() - interval '24 hours') as laeufe_24h
        from cron.job_run_details d
       where d.jobid = j.jobid
    ) l on true
   order by coalesce(l.fehler_24h, 0) desc, j.jobname
$function$;

comment on function public.cron_zustand() is
  'Zustand der Zeitplan-Jobs: letzter Lauf, letzter Ausgang, Fehler der '
  'letzten 24 Stunden. Nur ueber plattform-admin erreichbar.';

revoke all on function public.cron_zustand() from public;
revoke all on function public.cron_zustand() from anon;
revoke all on function public.cron_zustand() from authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.fehler_uebersicht(p_tage integer default 7)
 returns table (
   mandant_id   uuid,
   mandant_name text,
   schluessel   text,
   quelle       text,
   anzahl       bigint,
   zuletzt      timestamptz,
   offen        bigint)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  -- Bewusst ohne `meldung` und `stack`: dort steht, woran ein Kunde gerade
  -- gearbeitet hat. Die Zahl reicht, um zu sehen, wo es brennt.
  select f.mandant_id,
         m.name,
         coalesce(f.schluessel, '(ohne Schluessel)'),
         coalesce(f.quelle, '(ohne Quelle)'),
         count(*),
         max(f.created_at),
         count(*) filter (where coalesce(f.status, 'offen') <> 'erledigt')
    from public.fehler_protokoll f
    left join public.mandanten m on m.id = f.mandant_id
   where f.created_at > now() - (greatest(1, least(90, p_tage)) || ' days')::interval
   group by f.mandant_id, m.name, f.schluessel, f.quelle
   order by count(*) desc
   limit 200
$function$;

comment on function public.fehler_uebersicht(integer) is
  'Wie oft welcher Oberflaechenfehler in welchem Haus auftrat. OHNE Meldung '
  'und Stapelspur — wer den Wortlaut braucht, beginnt einen Supportzugriff.';

revoke all on function public.fehler_uebersicht(integer) from public;
revoke all on function public.fehler_uebersicht(integer) from anon;
revoke all on function public.fehler_uebersicht(integer) from authenticated;
