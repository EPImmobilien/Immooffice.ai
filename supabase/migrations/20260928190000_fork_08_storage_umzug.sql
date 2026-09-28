-- ===========================================================================
-- Fork-eigene Migration 08 — Ruestzeug fuer den Storage-Umzug
--
-- Die Storage-Huellen stellen jedem neuen Pfad den Mandanten voran. Die
-- Dateien, die schon da sind, liegen noch ohne. Sobald die restriktive
-- Richtlinie das erste Pfadsegment prueft (fork_09), waeren sie fuer jeden
-- unsichtbar — also muessen sie vorher umziehen.
--
-- Ein `update storage.objects set name = ...` genuegt dafuer NICHT: der Blob
-- liegt im Objektspeicher unter dem alten Schluessel, und die Zeile zeigte
-- danach ins Leere. Es braucht die Storage-API, also einen HTTP-Aufruf.
--
-- Der Weg dorthin ohne neuen Zugangsschluessel: das Projekt ruft sich selbst.
-- pg_net stellt die Anfrage, die Edge Function storage-mandant-umzug macht
-- die Arbeit mit ihrem eigenen service_role. Weil pg_net kein Nutzer-Token
-- kennt, ist die Funktion ohne JWT erreichbar — gesichert ueber ein
-- EINMAL-Token aus der Tabelle unten, das beim Aufruf geloescht wird.
-- ===========================================================================

create table public.storage_umzug_token (
  token       uuid primary key default gen_random_uuid(),
  erstellt_am timestamptz not null default now()
);
alter table public.storage_umzug_token enable row level security;
comment on table public.storage_umzug_token is
  'Einmal-Token fuer den Umzug der Storage-Pfade. RLS an, keine Richtlinie: '
  'nur service_role. Die Edge Function storage-mandant-umzug verlangt eines '
  'und loescht es nach Gebrauch.';

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('storage_umzug_token','DIENST','Einmal-Token fuer den Storage-Umzug, nur service_role');

-- Welche Objekte liegen noch ohne Mandanten-Ordner? Als Funktion, weil das
-- Schema storage ueber PostgREST nicht erreichbar ist.
create or replace function public.storage_ohne_mandant()
 returns table (bucket text, pfad text)
 language sql
 stable security definer
 set search_path to 'storage, public'
as $function$
  select o.bucket_id::text, o.name::text
    from storage.objects o
   where (storage.foldername(o.name))[1] is null
      or not exists (select 1 from public.mandanten m
                      where m.id::text = (storage.foldername(o.name))[1])
$function$;
revoke all on function public.storage_ohne_mandant() from public, anon, authenticated;
comment on function public.storage_ohne_mandant() is
  'Objekte, deren erstes Pfadsegment kein Mandant ist. Nur fuer den Umzug; '
  'kein Zugriff fuer Nutzer.';
