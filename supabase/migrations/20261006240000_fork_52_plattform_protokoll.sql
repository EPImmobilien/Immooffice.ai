-- ===========================================================================
-- fork_52 — was ein Plattform-Administrator tut, steht hinterher da
-- ===========================================================================
-- CLAUDE.md: „Plattform-Administratoren erhalten keinen automatischen Zugriff
-- auf Mandantendaten; Supportzugriff nur protokolliert und nach dem Prinzip
-- der geringsten Rechte."
--
-- Der erste Teil steht in `plattform-admin/index.ts`: dort geht nichts
-- Fachliches hinaus. Der zweite Teil ist diese Tabelle. Sie hält fest, wer
-- wann welchen Preis geändert und wem er Credits gutgeschrieben hat — mit
-- Begründung, denn eine Gutschrift ohne Grund weist die Funktion ab.
--
-- Geschrieben wird ausschliesslich mit dem Dienstschlüssel aus der Funktion.
-- Lesen darf ein Plattform-Administrator; ändern und löschen NIEMAND, auch
-- er nicht. Ein Protokoll, das sein Urheber bereinigen kann, ist keines.
-- ===========================================================================

create table if not exists public.plattform_protokoll (
  id            uuid primary key default gen_random_uuid(),
  benutzer_id   uuid references public.profiles(id) on delete set null,
  aktion        text not null,
  -- Worauf es sich bezieht: eine Mandantenkennung, ein Katalogschlüssel.
  gegenstand    text,
  einzelheiten  jsonb not null default '{}'::jsonb,
  erstellt_am   timestamptz not null default now()
);

comment on table public.plattform_protokoll is
  'Was ein Plattform-Administrator geaendert hat. Unveraenderlich: nur '
  'Einfuegen (mit Dienstschluessel) und Lesen.';

create index if not exists plattform_protokoll_zeit_idx
  on public.plattform_protokoll (erstellt_am desc);
create index if not exists plattform_protokoll_gegenstand_idx
  on public.plattform_protokoll (gegenstand);

alter table public.plattform_protokoll enable row level security;

drop policy if exists "plattform_protokoll_lesen" on public.plattform_protokoll;
create policy "plattform_protokoll_lesen" on public.plattform_protokoll
  for select to authenticated using (public.ist_plattform_admin());

-- Kein Schreibrecht fuer irgendeine Rolle ausser dem Dienstschluessel, der
-- die Richtlinien ohnehin umgeht. Damit ist "nur Einfuegen" keine Zusage,
-- sondern das Einzige, was ueberhaupt geht.

-- Und damit es nicht doch jemand versucht: ein Trigger, der Aenderung und
-- Loeschung verweigert. Der Dienstschluessel umgeht Richtlinien, nicht
-- Trigger.
create or replace function public.plattform_protokoll_unveraenderlich()
 returns trigger
 language plpgsql
as $function$
begin
  raise exception 'Das Plattform-Protokoll wird nicht geaendert und nicht geloescht.'
    using errcode = '42501';
end
$function$;

drop trigger if exists plattform_protokoll_schutz on public.plattform_protokoll;
create trigger plattform_protokoll_schutz
  before update or delete on public.plattform_protokoll
  for each row execute function public.plattform_protokoll_unveraenderlich();

-- Einstufung (fork_13): ohne Eintrag schlaegt tests/mandant-rundumschlag.sql
-- fehl, und das zu Recht — eine Tabelle ohne Einstufung ist eine, bei der
-- niemand entschieden hat, wem sie gehoert.
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_protokoll', 'GLOBAL',
   'Protokoll der Plattform-Administratoren; kein Mandantenbezug, nur fuer sie lesbar')
on conflict (tabelle) do update
  set gruppe = excluded.gruppe, grund = excluded.grund;
