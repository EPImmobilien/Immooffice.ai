-- ===========================================================================
-- Fork-eigene Migration 68 — Betreiberbereich, Schritt 1: Rollen, Audit-Log,
-- Zwei-Faktor-Pflicht
--
-- AUFTRAG vom 07.10.2026 („Betreiber-Dashboard"), Abschnitt 1 und 10.
--
-- KEINE PARALLELSTRUKTUR — der Auftrag verlangt das selbst. Es gibt schon:
--   plattform_admins     (fork_47)  wer Betreiber ist
--   plattform_protokoll  (fork_52)  was Betreiber getan haben, unveraenderlich
--   support_sitzungen    (fork_54)  der einzige Weg zu Fachdaten
-- Alle drei werden ERWEITERT, nicht ersetzt. Der Name `plattform_audit_log`
-- aus dem Auftrag wird eine Sicht auf plattform_protokoll: derselbe Inhalt,
-- der Name, den der Auftrag erwartet, kein zweiter Speicherort.
--
-- VIER ROLLEN, wie der Auftrag sie nennt:
--   owner     alles, auch Admins verwalten, Preise, endgueltige Loeschungen
--   admin     alles ausser Admins verwalten und Mandanten endgueltig loeschen
--   support   Mandanten ansehen (Metadaten), Testphase verlaengern,
--             Credits bis 500, Supportzugriff anfragen, Tickets
--   finanzen  Umsatz, Rechnungen, Zahlungen, Gutscheine; kein Eingriff in
--             Technik oder Mandanten
-- Wo die Rolle greift: in der Edge Function je Aktion UND hier in den
-- Richtlinien der Plattformtabellen. Bis heute durfte jeder Betreiber ueber
-- die Richtlinie `*_pflegen` die Preise direkt schreiben — eine Rolle
-- `support` haette dort nichts zu suchen.
--
-- RUECKNAHME: Spalten rolle/aktiv/erstellt_von und die Protokollspalten
-- bleiben ohne Schaden stehen; `drop view plattform_audit_log`, die
-- Richtlinien wieder auf ist_plattform_admin() setzen, plattform_rolle()
-- und den Trigger plattform_admins_letzter_owner entfernen.
-- ===========================================================================

-- --- 1. Rollen -------------------------------------------------------------

alter table public.plattform_admins
  add column if not exists rolle        text not null default 'admin',
  add column if not exists aktiv        boolean not null default true,
  add column if not exists erstellt_von uuid references public.profiles(id) on delete set null;

alter table public.plattform_admins drop constraint if exists plattform_admins_rolle_check;
alter table public.plattform_admins
  add constraint plattform_admins_rolle_check
  check (rolle in ('owner', 'admin', 'support', 'finanzen'));

-- Wer heute Betreiber ist, war es bisher ohne Abstufung — also mit allem.
-- Herabzustufen ist Sache des Owners, nicht dieser Migration.
update public.plattform_admins set rolle = 'owner' where rolle = 'admin';

comment on column public.plattform_admins.rolle is
  'owner | admin | support | finanzen — siehe docs/ADMIN.md, Abschnitt Rollen.';
comment on column public.plattform_admins.aktiv is
  'Deaktiviert statt geloescht: das Protokoll zeigt weiter, wer es war.';

create or replace function public.plattform_rolle()
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select a.rolle from public.plattform_admins a
   where a.benutzer_id = auth.uid() and a.aktiv
   limit 1;
$function$;

comment on function public.plattform_rolle() is
  'Die Betreiberrolle des Angemeldeten, oder NULL. Security Definer, damit '
  'die Richtlinie auf plattform_admins sich nicht selbst fragt.';

revoke all on function public.plattform_rolle() from public, anon;
grant execute on function public.plattform_rolle() to authenticated;

-- ist_plattform_admin() kennt jetzt `aktiv`. Ein deaktivierter Betreiber ist
-- keiner mehr — nirgends, auch nicht in den Richtlinien.
create or replace function public.ist_plattform_admin()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.plattform_admins a
                  where a.benutzer_id = auth.uid() and a.aktiv);
$function$;

-- Mindestens ein aktiver Owner, immer. Sonst kaeme niemand mehr an die
-- Admins heran — auch nicht, um das zu beheben.
create or replace function public.plattform_admins_letzter_owner()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if (tg_op = 'DELETE' and old.rolle = 'owner' and old.aktiv)
     or (tg_op = 'UPDATE' and old.rolle = 'owner' and old.aktiv
         and (new.rolle <> 'owner' or not new.aktiv)) then
    if not exists (select 1 from public.plattform_admins a
                    where a.rolle = 'owner' and a.aktiv
                      and a.benutzer_id <> old.benutzer_id) then
      raise exception 'Das ist der letzte aktive Owner. Erst einen zweiten ernennen.'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

drop trigger if exists plattform_admins_letzter_owner on public.plattform_admins;
create trigger plattform_admins_letzter_owner
  before update or delete on public.plattform_admins
  for each row execute function public.plattform_admins_letzter_owner();

-- --- 2. Die Plattformtabellen: pflegen nur owner und admin -----------------

do $$
declare t text;
begin
  foreach t in array array['plattform_tarife','plattform_credit_preise',
                           'plattform_credit_pakete','plattform_werte']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_pflegen', t);
    execute format('create policy %I on public.%I for all to authenticated '
                   || 'using (public.plattform_rolle() in (''owner'',''admin'')) '
                   || 'with check (public.plattform_rolle() in (''owner'',''admin''))',
                   t || '_pflegen', t);
  end loop;
end
$$;

-- --- 3. Das Protokoll wird zum Audit-Log ----------------------------------
-- Vorhandene Spalten bleiben: aktion, gegenstand, einzelheiten. Dazu, was
-- der Auftrag verlangt. `vorher`/`nachher` fuellt die Edge Function dort,
-- wo es einen Vorher-Zustand gibt (Katalog, Abo, Mandant).

alter table public.plattform_protokoll
  add column if not exists rolle       text,
  add column if not exists ziel_typ    text,
  add column if not exists ziel_id     text,
  add column if not exists vorher      jsonb,
  add column if not exists nachher     jsonb,
  add column if not exists begruendung text,
  add column if not exists ip          text,
  add column if not exists user_agent  text;

-- Der Name aus dem Auftrag, als Sicht. security_invoker: die Richtlinie der
-- Tabelle gilt — lesen darf nur ein Betreiber.
drop view if exists public.plattform_audit_log;
create view public.plattform_audit_log
  with (security_invoker = true) as
  select p.id,
         p.erstellt_am                         as zeit,
         p.benutzer_id                         as admin_id,
         p.rolle,
         p.aktion,
         coalesce(p.ziel_typ, 'gegenstand')    as ziel_typ,
         coalesce(p.ziel_id, p.gegenstand)     as ziel_id,
         p.vorher,
         p.nachher,
         coalesce(p.begruendung, p.einzelheiten->>'grund') as begruendung,
         p.ip,
         p.user_agent,
         p.einzelheiten
    from public.plattform_protokoll p;

comment on view public.plattform_audit_log is
  'Der Name aus dem Betreiber-Auftrag. Eine Sicht auf plattform_protokoll — '
  'ein Speicherort, zwei Namen. Nur INSERT auf der Tabelle; Trigger '
  'plattform_protokoll_schutz verweigert UPDATE und DELETE, auch dem Owner.';

-- --- 4. Zwei-Faktor-Pflicht und Sitzungsdauer als Plattformwerte ----------

insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('betreiber_mfa_pflicht', 'true'::jsonb,
   'Ohne aktiven zweiten Faktor (TOTP) kein Zugriff auf den Betreiberbereich. '
   'Die Edge Function prueft die Stufe des Anmelde-Tokens (aal2).'),
  ('betreiber_sitzung_minuten', '30'::jsonb,
   'Nach so vielen Minuten ohne Eingabe sperrt sich der Betreiberbereich.')
on conflict (schluessel) do nothing;

-- --- 5. Rechte: anon ruft keine Funktion, die Sicht ist nur lesbar ---------
-- tests/funktionsrechte.sql und tests/sichten.sql verlangen es — zu Recht:
-- eine Trigger-Funktion braucht kein EXECUTE fuer Rollen, und auf einer
-- Sicht hat anon nichts zu suchen.
-- authenticated behaelt EXECUTE — so halten es alle Trigger-Funktionen der
-- Vorlage, und tests/funktionsrechte.sql besteht darauf. Entscheidend ist
-- anon, und anon darf nichts.
revoke all on function public.plattform_admins_letzter_owner() from public, anon;
grant execute on function public.plattform_admins_letzter_owner() to authenticated;
-- Supabase vergibt per Vorgabe ALLE Rechte an authenticated auf neue
-- Objekte; eine Sicht braucht nur SELECT. Erst alles nehmen, dann lesen geben.
revoke all on public.plattform_audit_log from public, anon, authenticated;
grant select on public.plattform_audit_log to authenticated;
