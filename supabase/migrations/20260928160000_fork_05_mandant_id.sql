-- ===========================================================================
-- Fork-eigene Migration 05 — mandant_id statt konto_id, mandanten statt konten
--
-- Beim Setzen der Mandantenspalte fiel auf: DREI Tabellen der
-- Liquiditaetsplanung fuehren bereits ein `konto_id` — und es bedeutet
-- BANKKONTO, mit Fremdschluessel auf liquid_konten:
--
--   liquid_imports.konto_id        -> liquid_konten
--   liquid_szenarien.konto_id      -> liquid_konten
--   liquid_transaktionen.konto_id  -> liquid_konten
--
-- `add column if not exists` hat sie deshalb stillschweigend uebersprungen:
-- sie waeren als einzige ohne Mandantenspalte geblieben — und niemand haette
-- es gesehen, weil die Spalte ja da ist.
--
-- Schlimmer noch: liquid_konten selbst HAT eine Mandantenspalte bekommen.
-- Damit haette `liquid_konten.konto_id` Mandant geheissen und
-- `liquid_transaktionen.konto_id` daneben Bankkonto. Ein Name, zwei
-- Bedeutungen, in direkt verwandten Tabellen. Eine Richtlinie
-- `konto_id = aktuelle_konto_id()` auf der falschen der beiden waere immer
-- falsch gewesen — und zwar unauffaellig, weil sie einfach nichts anzeigt.
--
-- Deshalb: die Mandantenspalte heisst `mandant_id`, die Tabelle `mandanten`,
-- die Funktion `aktuelle_mandant_id()`. `konto_id` behaelt seine eine
-- Bedeutung in genau den drei Tabellen, in denen es sie schon hatte, und die
-- drei bekommen ihre Mandantenspalte nachgetragen.
--
-- Umbenannt wird nur, was der Fork selbst angelegt hat. Kein Spaltenname der
-- Vorlage wird angefasst (CLAUDE.md, Phase 9).
-- ===========================================================================

drop policy if exists "konten_eigenes_lesen" on public.konten;
drop policy if exists "konten_chef_aendert" on public.konten;
drop policy if exists "gesellschaften_eigene_lesen" on public.gesellschaften;
drop policy if exists "gesellschaften_chef_verwaltet" on public.gesellschaften;
drop function if exists public.aktuelle_konto_id();

alter table public.konten rename to mandanten;

do $$
declare r record;
begin
  for r in
    select c.relname as tabelle
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'konto_id'
     where n.nspname = 'public' and c.relkind = 'r'
       and exists (select 1 from pg_constraint con
                     join pg_class cf on cf.oid = con.confrelid
                    where con.conrelid = c.oid and con.contype = 'f'
                      and cf.relname = 'mandanten'
                      and exists (select 1 from pg_attribute x
                                   where x.attrelid = c.oid
                                     and x.attnum = any(con.conkey)
                                     and x.attname = 'konto_id'))
  loop
    execute format('alter table public.%I rename column konto_id to mandant_id', r.tabelle);
    execute format('alter index if exists public.%I rename to %I',
                   r.tabelle || '_konto_idx', r.tabelle || '_mandant_idx');
  end loop;
end $$;

alter table public.liquid_imports       add column mandant_id uuid references public.mandanten(id) on delete cascade;
alter table public.liquid_szenarien     add column mandant_id uuid references public.mandanten(id) on delete cascade;
alter table public.liquid_transaktionen add column mandant_id uuid references public.mandanten(id) on delete cascade;
create index liquid_imports_mandant_idx       on public.liquid_imports (mandant_id);
create index liquid_szenarien_mandant_idx     on public.liquid_szenarien (mandant_id);
create index liquid_transaktionen_mandant_idx on public.liquid_transaktionen (mandant_id);

create or replace function public.aktuelle_mandant_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select mandant_id from public.profiles where id = auth.uid()
$function$;
comment on function public.aktuelle_mandant_id() is
  'Der Mandant des angemeldeten Nutzers. Grundlage jeder Mandanten-Richtlinie.';

create policy "mandant_eigenen_lesen" on public.mandanten
  for select to authenticated using (id = public.aktuelle_mandant_id());
create policy "mandant_chef_aendert" on public.mandanten
  for update to authenticated
  using (id = public.aktuelle_mandant_id() and public.ist_chef())
  with check (id = public.aktuelle_mandant_id() and public.ist_chef());

create policy "gesellschaften_eigene_lesen" on public.gesellschaften
  for select to authenticated using (mandant_id = public.aktuelle_mandant_id());
create policy "gesellschaften_chef_verwaltet" on public.gesellschaften
  for all to authenticated
  using (mandant_id = public.aktuelle_mandant_id() and public.ist_chef())
  with check (mandant_id = public.aktuelle_mandant_id() and public.ist_chef());

comment on table public.mandanten is
  'Die Mandantengrenze. Ein Mandant ist ein Kunde von immoOffice.ai; die RLS '
  'trennt ausschliesslich auf dieser Ebene hart. Darunter liegen '
  'gesellschaften (Rechtstraeger) und firma_stammdaten (Standorte). Heisst '
  'mandanten und nicht konten, weil drei Tabellen der Liquiditaetsplanung ein '
  'konto_id fuehren, das ein BANKKONTO meint — ein Name mit zwei Bedeutungen '
  'in verwandten Tabellen ist eine Falle.';

-- Die Einstufung nennt die Tabelle noch beim alten Namen. Ohne diese Zeile
-- meldet tests/mandant-einstufung.sql "konten eingestuft, aber nicht
-- vorhanden" und "mandanten nicht eingestuft" — was genau richtig ist, und
-- beim ersten Lauf auch genau so passiert ist.
update public.mandanten_einstufung
   set tabelle = 'mandanten',
       grund = 'ist die Grenze (hiess bis fork_05 konten)'
 where tabelle = 'konten';
