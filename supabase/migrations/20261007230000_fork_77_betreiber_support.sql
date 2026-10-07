-- ===========================================================================
-- fork_77 — Betreiberbereich, Schritt 8: Support-Anfragen und Supportzugriff
--           mit Freigabe durch den Chef
-- ===========================================================================
-- Auftrag Betreiber-Dashboard, Abschnitt 9. Zwei Dinge:
--
--   1. Supportzugriff bekommt eine FREIGABE. fork_54 hat die Sitzung
--      gebaut — befristet, begruendet, protokolliert, vom Mandanten
--      nachlesbar. Was fehlte: der Mandant musste nicht JA sagen. Ab hier
--      ist eine Sitzung zuerst eine Anfrage; der `chef` des Hauses gibt sie
--      frei oder lehnt sie ab. Ohne Freigabe sieht `support_sitzung()`
--      nichts — und damit kein Richtliniensatz der Datenbank.
--
--      Dazu ein Protokoll JE SITZUNG (`support_protokoll`): welche Seite der
--      Administrator aufgerufen hat und welche Zeile er geaendert hat
--      (Tabelle, Kennung, Vorgang — kein Inhalt). Der Mandant liest es in
--      seinen Einstellungen.
--
--   2. Support-Anfragen (`support_anfragen`, `support_antworten`): der
--      Mandant schreibt im Portal unter „Hilfe", der Betreiber antwortet im
--      Dashboard. Datenuebernahmen sind eine Kategorie mit eigenem Stand.
--
-- Dauer: fork_54 liess hoechstens vier Stunden zu, weil der Administrator
-- sie sich selbst nahm. Jetzt gewaehrt sie der Chef — die Obergrenze wird
-- 24 Stunden (Auftrag: „gewuenschte Dauer 1–24 h"). Die Uhr laeuft ab der
-- FREIGABE, nicht ab der Anfrage.
--
-- RUECKNAHME: drop function plattform_support_kennzahlen, support_anfrage_schliessen,
-- support_antwort_nach, support_zugriff_beenden, support_zugriff_entscheiden,
-- support_zugriffe_meines_hauses, support_seite_protokollieren,
-- support_aenderung_protokollieren (cascade loescht die Trigger); drop table
-- support_antworten, support_anfragen, support_protokoll; alter table
-- support_sitzungen drop column freigegeben_am, freigegeben_von, abgelehnt_am,
-- beendet_von, dauer_minuten; support_sitzung() aus fork_54 wiederherstellen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Sitzung bekommt eine Freigabe
-- ---------------------------------------------------------------------------
alter table public.support_sitzungen
  add column if not exists freigegeben_am timestamptz,
  add column if not exists freigegeben_von uuid references public.profiles(id) on delete set null,
  add column if not exists abgelehnt_am   timestamptz,
  add column if not exists beendet_von    uuid references public.profiles(id) on delete set null,
  add column if not exists dauer_minuten  integer not null default 60;

alter table public.support_sitzungen drop constraint if exists support_sitzungen_dauer_check;
alter table public.support_sitzungen add constraint support_sitzungen_dauer_check
  check (gueltig_bis > begonnen_am and gueltig_bis <= begonnen_am + interval '24 hours'
         and dauer_minuten between 5 and 1440);

comment on column public.support_sitzungen.freigegeben_am is
  'Wann der chef des Mandanten die Anfrage freigegeben hat. NULL = noch nicht; ohne Freigabe keine Sitzung.';
comment on column public.support_sitzungen.dauer_minuten is
  'Gewuenschte Dauer. Die Uhr (begonnen_am, gueltig_bis) wird bei der Freigabe gestellt.';

-- Ohne Freigabe keine Sitzung. Das ist die EINE Stelle, an der die
-- Datenbank entscheidet — alle Richtlinien haengen an dieser Funktion.
create or replace function public.support_sitzung()
 returns public.support_sitzungen
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.* from public.support_sitzungen s
   where s.admin_id = auth.uid()
     and s.freigegeben_am is not null
     and s.abgelehnt_am is null
     and s.beendet_am is null
     and s.gueltig_bis > now()
     and exists (select 1 from public.plattform_admins a
                  where a.benutzer_id = s.admin_id and a.aktiv)
   order by s.freigegeben_am desc
   limit 1
$function$;

comment on function public.support_sitzung() is
  'Die laufende, FREIGEGEBENE Support-Sitzung des Angemeldeten, falls es eine gibt. '
  'Ohne Freigabe durch den chef des Mandanten gibt es keine.';

-- ---------------------------------------------------------------------------
-- 2. Das Protokoll der Sitzung
-- ---------------------------------------------------------------------------
create table if not exists public.support_protokoll (
  id          uuid primary key default gen_random_uuid(),
  sitzung_id  uuid not null references public.support_sitzungen(id) on delete cascade,
  mandant_id  uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  admin_id    uuid not null,
  zeit        timestamptz not null default now(),
  art         text not null check (art in ('seite', 'aenderung')),
  tabelle     text,
  satz_id     text,
  was         text not null
);
comment on table public.support_protokoll is
  'Was ein Plattform-Administrator waehrend einer Support-Sitzung getan hat: '
  'Seitenaufrufe und geaenderte Zeilen (Tabelle, Kennung, Vorgang). Kein Inhalt. '
  'Der Mandant liest es in seinen Einstellungen.';
create index if not exists support_protokoll_mandant_idx on public.support_protokoll (mandant_id);
create index if not exists support_protokoll_sitzung_idx on public.support_protokoll (sitzung_id, zeit desc);
alter table public.support_protokoll enable row level security;

-- Lesen: die Mitglieder des betroffenen Hauses — ueber das PROFIL, nicht
-- ueber aktuelle_mandant_id(): der Administrator in der Sitzung soll das
-- Protokoll ueber sich nicht als „eigenes" lesen.
drop policy if exists "support_protokoll_lesen" on public.support_protokoll;
create policy "support_protokoll_lesen" on public.support_protokoll
  for select to authenticated
  using (mandant_id = (select p.mandant_id from public.profiles p where p.id = auth.uid()));
drop policy if exists "mandant_trennung" on public.support_protokoll;
create policy "mandant_trennung" on public.support_protokoll
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.mandant_id_schreiben());
drop policy if exists "mandant_trennung_loeschen" on public.support_protokoll;
create policy "mandant_trennung_loeschen" on public.support_protokoll
  as restrictive for delete to public
  using (mandant_id = public.mandant_id_schreiben());
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('support_protokoll', 'MANDANT', 'Protokoll der Support-Sitzungen je Mandant; liest der Mandant, schreibt die Datenbank')
on conflict (tabelle) do nothing;

-- Seitenaufruf: meldet die Oberflaeche (das Band ueber der Anwendung) bei
-- jedem Wechsel der Adresse. Nur waehrend einer Sitzung, sonst nichts.
create or replace function public.support_seite_protokollieren(p_was text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare s public.support_sitzungen;
begin
  s := public.support_sitzung();
  if s.id is null then return; end if;
  insert into public.support_protokoll (sitzung_id, mandant_id, admin_id, art, was)
  values (s.id, s.mandant_id, s.admin_id, 'seite', left(coalesce(p_was, ''), 200));
end
$function$;
revoke all on function public.support_seite_protokollieren(text) from public, anon;
grant execute on function public.support_seite_protokollieren(text) to authenticated;

-- Aenderung: ein Trigger an jeder Mandantentabelle. Er tut nichts, solange
-- keine Sitzung laeuft — die erste Zeile prueft auth.uid(), die zweite die
-- Sitzung; fuer jeden normalen Nutzer ist das ein Indexzugriff und Schluss.
create or replace function public.support_aenderung_protokollieren()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare s public.support_sitzungen; k text;
begin
  if auth.uid() is null then return null; end if;
  s := public.support_sitzung();
  if s.id is null then return null; end if;
  k := case when tg_op = 'DELETE' then to_jsonb(old)->>'id' else to_jsonb(new)->>'id' end;
  insert into public.support_protokoll (sitzung_id, mandant_id, admin_id, art, tabelle, satz_id, was)
  values (s.id, s.mandant_id, s.admin_id, 'aenderung', tg_table_name, left(k, 64), lower(tg_op));
  return null;
end
$function$;
revoke all on function public.support_aenderung_protokollieren() from public, anon;
grant execute on function public.support_aenderung_protokollieren() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Support-Anfragen
-- ---------------------------------------------------------------------------
create table if not exists public.support_anfragen (
  id                uuid primary key default gen_random_uuid(),
  mandant_id        uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  nutzer_id         uuid default auth.uid() references public.profiles(id) on delete set null,
  betreff           text not null check (length(btrim(betreff)) between 3 and 200),
  text              text not null check (length(btrim(text)) >= 3),
  kategorie         text not null default 'frage'
                    check (kategorie in ('frage', 'fehler', 'abrechnung', 'datenuebernahme', 'sonstiges')),
  prioritaet        text not null default 'normal' check (prioritaet in ('niedrig', 'normal', 'hoch')),
  status            text not null default 'offen'
                    check (status in ('offen', 'in_arbeit', 'wartet_kunde', 'geloest', 'geschlossen')),
  zustaendig_id     uuid references public.profiles(id) on delete set null,
  -- Nur bei kategorie = datenuebernahme: der Stand des Auftrags.
  uebernahme_status text check (uebernahme_status in ('beauftragt', 'datei_erhalten', 'importiert', 'abgenommen')),
  -- Die Stripe-Rechnung des kostenpflichtigen Einrichtungspakets (in_…).
  paket_rechnung_id text,
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now(),
  erste_antwort_am  timestamptz,
  geloest_am        timestamptz
);
comment on table public.support_anfragen is
  'Anfragen eines Mandanten an den Betreiber (Portal: Hilfe). Der Betreiber antwortet im '
  'Dashboard; Datenuebernahmen tragen einen eigenen Stand und die Rechnung des Pakets.';
create index if not exists support_anfragen_mandant_idx on public.support_anfragen (mandant_id);
create index if not exists support_anfragen_zeit_idx on public.support_anfragen (mandant_id, erstellt_am desc);
create index if not exists support_anfragen_stand_idx on public.support_anfragen (status, prioritaet, erstellt_am);
alter table public.support_anfragen enable row level security;

drop policy if exists "support_anfragen_lesen" on public.support_anfragen;
create policy "support_anfragen_lesen" on public.support_anfragen
  for select to authenticated using (mandant_id = public.aktuelle_mandant_id());
drop policy if exists "support_anfragen_anlegen" on public.support_anfragen;
create policy "support_anfragen_anlegen" on public.support_anfragen
  for insert to authenticated
  with check (mandant_id = public.aktuelle_mandant_id() and nutzer_id = auth.uid()
              and status = 'offen' and zustaendig_id is null and uebernahme_status is null
              and paket_rechnung_id is null);
drop policy if exists "mandant_trennung" on public.support_anfragen;
create policy "mandant_trennung" on public.support_anfragen
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.mandant_id_schreiben());
drop policy if exists "mandant_trennung_loeschen" on public.support_anfragen;
create policy "mandant_trennung_loeschen" on public.support_anfragen
  as restrictive for delete to public
  using (mandant_id = public.mandant_id_schreiben());
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('support_anfragen', 'MANDANT', 'Support-Anfragen des Mandanten an den Betreiber')
on conflict (tabelle) do nothing;

create table if not exists public.support_antworten (
  id            uuid primary key default gen_random_uuid(),
  anfrage_id    uuid not null references public.support_anfragen(id) on delete cascade,
  mandant_id    uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  von_betreiber boolean not null default false,
  autor_id      uuid default auth.uid(),
  -- Der Name steht hier als Abschrift: der Mandant kann die Profile des
  -- Betreibers nicht lesen, und soll trotzdem sehen, wer geantwortet hat.
  autor_name    text,
  text          text not null check (length(btrim(text)) >= 1),
  erstellt_am   timestamptz not null default now()
);
comment on table public.support_antworten is
  'Antworten zu einer Support-Anfrage — vom Mandanten oder (von_betreiber) vom Betreiber.';
create index if not exists support_antworten_mandant_idx on public.support_antworten (mandant_id);
create index if not exists support_antworten_anfrage_idx on public.support_antworten (anfrage_id, erstellt_am);
alter table public.support_antworten enable row level security;

drop policy if exists "support_antworten_lesen" on public.support_antworten;
create policy "support_antworten_lesen" on public.support_antworten
  for select to authenticated using (mandant_id = public.aktuelle_mandant_id());
-- Der Mandant schreibt nur als er selbst — nie als Betreiber.
drop policy if exists "support_antworten_anlegen" on public.support_antworten;
create policy "support_antworten_anlegen" on public.support_antworten
  for insert to authenticated
  with check (mandant_id = public.aktuelle_mandant_id() and autor_id = auth.uid()
              and von_betreiber = false
              and exists (select 1 from public.support_anfragen a
                           where a.id = anfrage_id and a.mandant_id = support_antworten.mandant_id
                             and a.status <> 'geschlossen'));
drop policy if exists "mandant_trennung" on public.support_antworten;
create policy "mandant_trennung" on public.support_antworten
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.mandant_id_schreiben());
drop policy if exists "mandant_trennung_loeschen" on public.support_antworten;
create policy "mandant_trennung_loeschen" on public.support_antworten
  as restrictive for delete to public
  using (mandant_id = public.mandant_id_schreiben());
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('support_antworten', 'MANDANT', 'Antworten zu Support-Anfragen, beidseitig')
on conflict (tabelle) do nothing;

-- Jede Antwort bewegt die Anfrage: Zeitstempel, erste Antwort, Stand.
create or replace function public.support_antwort_nach()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.support_anfragen a
     set aktualisiert_am = now(),
         erste_antwort_am = case when new.von_betreiber then coalesce(a.erste_antwort_am, now()) else a.erste_antwort_am end,
         status = case
                    when a.status in ('geloest', 'geschlossen') then a.status
                    when new.von_betreiber then 'wartet_kunde'
                    else 'offen' end
   where a.id = new.anfrage_id;
  return null;
end
$function$;
revoke all on function public.support_antwort_nach() from public, anon;
grant execute on function public.support_antwort_nach() to authenticated;
drop trigger if exists support_antwort_nach on public.support_antworten;
create trigger support_antwort_nach after insert on public.support_antworten
  for each row execute function public.support_antwort_nach();

-- Der Mandant schliesst seine Anfrage selbst — mehr darf er daran nicht.
create or replace function public.support_anfrage_schliessen(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.support_anfragen
     set status = 'geschlossen', aktualisiert_am = now(), geloest_am = coalesce(geloest_am, now())
   where id = p_id
     and mandant_id = (select p.mandant_id from public.profiles p where p.id = auth.uid());
  if not found then raise exception 'Anfrage nicht gefunden.' using errcode = '42501'; end if;
end
$function$;
revoke all on function public.support_anfrage_schliessen(uuid) from public, anon;
grant execute on function public.support_anfrage_schliessen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Was der Mandant mit Zugriffsanfragen tun kann
-- ---------------------------------------------------------------------------
-- Die Liste des eigenen Hauses, mit dem Namen des Administrators — den der
-- Mandant ueber die Profile nicht lesen koennte.
create or replace function public.support_zugriffe_meines_hauses()
 returns table (id uuid, admin_name text, admin_email text, grund text, schreiben boolean,
                dauer_minuten integer, angefragt_am timestamptz, freigegeben_am timestamptz,
                abgelehnt_am timestamptz, gueltig_bis timestamptz, beendet_am timestamptz, stand text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.id, p.name, p.email, s.grund, s.schreiben, s.dauer_minuten, s.begonnen_am,
         s.freigegeben_am, s.abgelehnt_am, s.gueltig_bis, s.beendet_am,
         case when s.abgelehnt_am is not null then 'abgelehnt'
              when s.beendet_am is not null then 'beendet'
              when s.freigegeben_am is null and s.begonnen_am < now() - interval '7 days' then 'verfallen'
              when s.freigegeben_am is null then 'angefragt'
              when s.gueltig_bis <= now() then 'abgelaufen'
              else 'laeuft' end
    from public.support_sitzungen s
    left join public.profiles p on p.id = s.admin_id
   where s.mandant_id = (select q.mandant_id from public.profiles q where q.id = auth.uid())
   order by s.begonnen_am desc
   limit 200
$function$;
revoke all on function public.support_zugriffe_meines_hauses() from public, anon;
grant execute on function public.support_zugriffe_meines_hauses() to authenticated;

-- Freigeben oder ablehnen — nur der chef, nur fuer sein Haus, nur offene.
-- Bei Freigabe wird die Uhr JETZT gestellt: die Dauer laeuft ab der
-- Freigabe, nicht ab der Anfrage.
create or replace function public.support_zugriff_entscheiden(p_id uuid, p_freigeben boolean)
 returns public.support_sitzungen
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare s public.support_sitzungen; meins uuid;
begin
  select p.mandant_id into meins from public.profiles p where p.id = auth.uid() and p.role = 'chef';
  if meins is null then raise exception 'Nur der Chef des Hauses entscheidet.' using errcode = '42501'; end if;
  select * into s from public.support_sitzungen
   where id = p_id and mandant_id = meins and freigegeben_am is null
     and abgelehnt_am is null and beendet_am is null;
  if s.id is null then raise exception 'Keine offene Anfrage.' using errcode = '42501'; end if;
  if p_freigeben then
    update public.support_sitzungen
       set freigegeben_am = now(), freigegeben_von = auth.uid(),
           begonnen_am = now(), gueltig_bis = now() + make_interval(mins => dauer_minuten)
     where id = p_id returning * into s;
  else
    update public.support_sitzungen
       set abgelehnt_am = now(), beendet_am = now(), beendet_von = auth.uid()
     where id = p_id returning * into s;
  end if;
  return s;
end
$function$;
revoke all on function public.support_zugriff_entscheiden(uuid, boolean) from public, anon;
grant execute on function public.support_zugriff_entscheiden(uuid, boolean) to authenticated;

-- Vorzeitig beenden darf der chef jederzeit.
create or replace function public.support_zugriff_beenden(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare meins uuid;
begin
  select p.mandant_id into meins from public.profiles p where p.id = auth.uid() and p.role = 'chef';
  if meins is null then raise exception 'Nur der Chef des Hauses beendet.' using errcode = '42501'; end if;
  update public.support_sitzungen
     set beendet_am = now(), beendet_von = auth.uid()
   where id = p_id and mandant_id = meins and beendet_am is null;
  if not found then raise exception 'Keine laufende Sitzung.' using errcode = '42501'; end if;
end
$function$;
revoke all on function public.support_zugriff_beenden(uuid) from public, anon;
grant execute on function public.support_zugriff_beenden(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Kennzahlen fuer den Betreiber
-- ---------------------------------------------------------------------------
create or replace function public.plattform_support_kennzahlen()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare r jsonb;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner', 'admin', 'support') then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'offen', (select count(*) from public.support_anfragen where status in ('offen', 'in_arbeit')),
    'offen_aelter_24h', (select count(*) from public.support_anfragen
                          where status in ('offen', 'in_arbeit') and erste_antwort_am is null
                            and erstellt_am < now() - interval '24 hours'),
    'hoch_offen', (select count(*) from public.support_anfragen where status in ('offen', 'in_arbeit') and prioritaet = 'hoch'),
    'erste_antwort_median_h', (select round((percentile_cont(0.5) within group (order by extract(epoch from (erste_antwort_am - erstellt_am)) / 3600))::numeric, 1)
                                 from public.support_anfragen where erste_antwort_am is not null and erstellt_am > now() - interval '90 days'),
    'loesung_median_h', (select round((percentile_cont(0.5) within group (order by extract(epoch from (geloest_am - erstellt_am)) / 3600))::numeric, 1)
                           from public.support_anfragen where geloest_am is not null and erstellt_am > now() - interval '90 days'),
    'je_kategorie', (select coalesce(jsonb_object_agg(x.kategorie, x.n), '{}'::jsonb) from (
                       select kategorie, count(*) as n from public.support_anfragen
                        where erstellt_am > now() - interval '90 days' group by kategorie) x),
    'uebernahmen', (select coalesce(jsonb_object_agg(x.s, x.n), '{}'::jsonb) from (
                      select coalesce(uebernahme_status, 'offen') as s, count(*) as n from public.support_anfragen
                       where kategorie = 'datenuebernahme' and status not in ('geschlossen') group by 1) x),
    'zugriffe_offen', (select count(*) from public.support_sitzungen
                        where freigegeben_am is null and abgelehnt_am is null and beendet_am is null
                          and begonnen_am > now() - interval '7 days'),
    'zugriffe_laufend', (select count(*) from public.support_sitzungen
                          where freigegeben_am is not null and beendet_am is null and gueltig_bis > now())
  ) into r;
  return r;
end
$function$;
revoke all on function public.plattform_support_kennzahlen() from public, anon;
grant execute on function public.plattform_support_kennzahlen() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Der Aenderungs-Trigger an jeder Mandantentabelle
-- ---------------------------------------------------------------------------
-- Ueber mandanten_einstufung, nicht ueber eine Liste: die Liste waere am
-- Tag ihrer Entstehung vollstaendig und danach nie wieder. Eine Tabelle, die
-- spaeter MANDANT wird, braucht diesen Block erneut (docs/ADMIN.md).
do $$
declare r record; n int := 0;
begin
  for r in
    select e.tabelle from public.mandanten_einstufung e
     where e.gruppe = 'MANDANT' and e.tabelle <> 'support_protokoll'
       and exists (select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                    where ns.nspname = 'public' and c.relname = e.tabelle and c.relkind = 'r')
     order by e.tabelle
  loop
    execute format('drop trigger if exists support_protokoll_tr on public.%I', r.tabelle);
    execute format('create trigger support_protokoll_tr after insert or update or delete on public.%I '
                   'for each row execute function public.support_aenderung_protokollieren()', r.tabelle);
    n := n + 1;
  end loop;
  raise notice 'fork_77: Aenderungsprotokoll an % Mandantentabellen', n;
end $$;
