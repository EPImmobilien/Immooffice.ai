-- ===========================================================================
-- Fork-eigene Migration 11 — Sichtbarkeitsbereich und das Recht "Export"
--
-- Abschnitt 1b des Auftrags: jeder Mitarbeiter bekommt einen
-- Sichtbarkeitsbereich (nur eigene / Standort / Gesellschaft / Konto) und es
-- gibt ein eigenes Recht "Export".
--
-- WAS DIE VORLAGE SCHON HAT und was deshalb nicht neu erfunden wird:
--   profiles.stufe    Rollenvorlage (chef, standortleitung, makler, assistenz)
--   profiles.rechte   Einzelhaeckchen je Modul, als jsonb
--   profiles.firma_id Hauptstandort des Mitarbeiters (-> firma_stammdaten)
-- Das ist genau das Prinzip aus CLAUDE.md, "Rechte als Vorlage plus
-- Einzelhaeckchen". Es bleibt unveraendert; hier kommen zwei Dinge dazu.
--
-- WAS DIE VORLAGE NICHT HAT: die Durchsetzung. hatRecht() steht allein in der
-- Oberflaeche. CLAUDE.md verlangt "serverseitig und in der Datenbank erzwungen
-- (RLS) — niemals nur durch ausgeblendete Bedienelemente". Deshalb wird die
-- Regel hier ein zweites Mal formuliert, in SQL, Zeile fuer Zeile wie im
-- Quelltext der Oberflaeche. Zwei Fassungen derselben Regel sind eine
-- Gefahrenquelle — tests/rechte.sql vergleicht sie deshalb gegeneinander.
--
-- KEINE VERHALTENSAENDERUNG: Standardwert ist 'konto', also genau das, was
-- heute geschieht. Wer nichts einstellt, merkt nichts.
-- ===========================================================================

-- --- 1) Der Sichtbarkeitsbereich am Mitarbeiter ---------------------------
alter table public.profiles
  add column if not exists sichtbarkeit text not null default 'konto';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_sichtbarkeit_check') then
    alter table public.profiles add constraint profiles_sichtbarkeit_check
      check (sichtbarkeit in ('eigene', 'standort', 'gesellschaft', 'konto'));
  end if;
end $$;

comment on column public.profiles.sichtbarkeit is
  'Wie weit der Mitarbeiter sehen darf: eigene | standort | gesellschaft | '
  'konto. Der Standort ist profiles.firma_id, die Gesellschaft haengt daran. '
  'Greift auf den sechs Tabellen mit zustaendig_id. Ein Chef sieht immer den '
  'ganzen Mandanten, unabhaengig von diesem Wert.';

-- --- 2) Wen darf ich sehen? -----------------------------------------------
-- Gibt die Mitarbeiter zurueck, deren Datensaetze der Angemeldete sehen darf.
-- SECURITY DEFINER, weil die Funktion in Richtlinien auf profiles selbst
-- gelesen wird und sich sonst im Kreis drehte.
create or replace function public.sichtbare_mitarbeiter()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with ich as (
    select id, mandant_id, firma_id, sichtbarkeit, role
      from public.profiles where id = auth.uid()
  )
  -- Chef: der ganze Mandant, ohne Ruecksicht auf die Einstellung. Ein Chef,
  -- den jemand versehentlich auf 'eigene' stellt, wuerde sonst sein eigenes
  -- Unternehmen nicht mehr sehen.
  select p.id from public.profiles p, ich
   where ich.role = 'chef' and p.mandant_id = ich.mandant_id
  union
  select p.id from public.profiles p, ich
   where ich.role <> 'chef' and ich.sichtbarkeit = 'konto'
     and p.mandant_id = ich.mandant_id
  union
  select p.id from public.profiles p, ich
   where ich.role <> 'chef' and ich.sichtbarkeit = 'gesellschaft'
     and p.mandant_id = ich.mandant_id
     and exists (
       select 1 from public.firma_stammdaten meiner, public.firma_stammdaten seiner
        where meiner.id = ich.firma_id and seiner.id = p.firma_id
          and meiner.gesellschaft_id is not null
          and meiner.gesellschaft_id = seiner.gesellschaft_id)
  union
  select p.id from public.profiles p, ich
   where ich.role <> 'chef' and ich.sichtbarkeit = 'standort'
     and p.mandant_id = ich.mandant_id
     and ich.firma_id is not null and p.firma_id = ich.firma_id
  union
  -- Sich selbst sieht jeder, in jedem Bereich.
  select ich.id from ich
$function$;

comment on function public.sichtbare_mitarbeiter() is
  'Die Mitarbeiter, deren Datensaetze der Angemeldete sehen darf. Grundlage '
  'der Richtlinie sichtbarkeitsbereich auf den sechs Tabellen mit '
  'zustaendig_id.';

-- --- 3) Die Richtlinie auf den sechs Tabellen -----------------------------
-- Restriktiv, also mit UND verknuepft — wie die Mandantentrennung aus fork_07.
-- Ein Datensatz OHNE Zustaendigen bleibt fuer alle sichtbar: sonst
-- verschwaende er aus jeder Liste und niemand koennte ihn noch zuweisen.
do $$
declare t text;
begin
  foreach t in array array['kontakte','immobilien','aufgaben','todos',
                           'akq_leads','akq_aktivitaeten'] loop
    execute format('drop policy if exists "sichtbarkeitsbereich" on public.%I', t);
    execute format($f$
      create policy "sichtbarkeitsbereich" on public.%I
        as restrictive for all to public
        using (zustaendig_id is null
               or zustaendig_id in (select public.sichtbare_mitarbeiter()))
        with check (zustaendig_id is null
               or zustaendig_id in (select public.sichtbare_mitarbeiter()))
    $f$, t);
    execute format($f$
      comment on policy "sichtbarkeitsbereich" on public.%I is
        'Abschnitt 1b: nur eigene / Standort / Gesellschaft / Konto. '
        'Restriktiv, also nicht durch eine erlaubende Richtlinie aufhebbar. '
        'Ohne Zustaendigen bleibt der Datensatz fuer alle sichtbar.'
    $f$, t);
  end loop;
end $$;

-- --- 4) Das Recht "Export" und die uebrigen Modulrechte in SQL ------------
-- Zeile fuer Zeile dieselbe Regel wie hatRecht() in der Oberflaeche:
--   kein Profil            -> nein
--   role = 'chef'          -> ja
--   role <> 'mitarbeiter'  -> nein
--   rechte ist gefuellt    -> genau das, was dort steht
--   rechte ist leer        -> alles ausser finanzen, admin, rechnungen;
--                             posteingang nur fuer eine feste Adresse, die im
--                             Fork neutralisiert ist und niemandem gehoert
create or replace function public.hat_recht(modul text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when p.id is null then false
    when p.role = 'chef' then true
    when p.role <> 'mitarbeiter' then false
    when p.rechte is not null and jsonb_typeof(p.rechte) = 'object'
         and p.rechte <> '{}'::jsonb
      then coalesce((p.rechte ->> modul)::boolean, false)
    else modul not in ('finanzen', 'admin', 'rechnungen', 'posteingang')
  end
  from public.profiles p where p.id = auth.uid()
$function$;

comment on function public.hat_recht(text) is
  'Serverseitige Zweitfassung von hatRecht() aus der Oberflaeche. '
  'tests/rechte.sql vergleicht beide Fassungen gegeneinander — zwei '
  'Formulierungen derselben Regel duerfen nicht auseinanderlaufen.';

create or replace function public.darf_exportieren()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$ select public.hat_recht('export') $function$;

comment on function public.darf_exportieren() is
  'Abschnitt 1b: eigenes Recht fuer den Export personenbezogener Daten. '
  'Der Export im Adressbuch fragt es, und das Protokoll haelt jeden Export '
  'mit Anzahl der Datensaetze fest.';

revoke all on function public.sichtbare_mitarbeiter() from public;
grant execute on function public.sichtbare_mitarbeiter() to authenticated, service_role;
grant execute on function public.hat_recht(text) to authenticated, service_role;
grant execute on function public.darf_exportieren() to authenticated, service_role;

-- --- 5) Wachposten --------------------------------------------------------
do $$
declare fehlt text;
begin
  select string_agg(t, ', ') into fehlt from unnest(array[
    'kontakte','immobilien','aufgaben','todos','akq_leads','akq_aktivitaeten']) t
   where not exists (select 1 from pg_policies
                      where schemaname='public' and tablename=t
                        and policyname='sichtbarkeitsbereich');
  if fehlt is not null then
    raise exception 'Sichtbarkeitsbereich fehlt auf: %', fehlt;
  end if;
end $$;
