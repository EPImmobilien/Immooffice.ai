-- ===========================================================================
-- fork_37 — Exposé-Baukasten: Vorlagen als Dokumente
--
-- Auftrag "Exposé-Baukasten" vom 05.10.2026, Etappe 2. Bisher war die
-- Exposé-Gestaltung Code: firma_stammdaten.expose_vorlage nennt einen von
-- drei Namen, und was dahinter passiert, steht in der Edge Function. Ab
-- hier ist eine Vorlage ein JSON-Dokument, das ein Mandant kopieren und
-- anpassen kann.
--
-- SYSTEMVORLAGEN haben mandant_id = null. Sie sind fuer alle lesbar und
-- fuer niemanden schreibbar — auch nicht fuer einen Chef. Die restriktive
-- Richtlinie laesst null beim LESEN durch, beim Schreiben nicht; damit
-- kann niemand eine eigene Vorlage zur Systemvorlage machen oder eine
-- Systemvorlage aendern. Gepflegt werden sie ueber Migrationen, also vom
-- Dienstschluessel, der an RLS vorbeigeht.
--
-- VERSIONEN: jede Speicherung legt eine Kopie ab, die letzten dreissig je
-- Vorlage bleiben. Ein Makler, der eine Stunde lang etwas verschlimmert
-- hat, kommt damit zurueck. Mehr als dreissig braucht niemand, und
-- unbegrenzt waechst eine Tabelle mit 36 KB je Zeile schnell.
--
-- RECHT: expose_vorlagen_bearbeiten, in der Voreinstellung nur fuer den
-- Chef. Es steht dafuer in der Sperrliste von hat_recht() — ein
-- Mitarbeiter ohne ausdrueckliche Rechte bekommt sonst alles, was nicht
-- gesperrt ist. Wer die Hausvorlage aendert, aendert sie fuer jedes
-- kuenftige Expose des Hauses; das ist keine Nebenbei-Befugnis.
-- ===========================================================================

-- --- Das Recht ------------------------------------------------------------
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
    else modul not in ('finanzen', 'admin', 'rechnungen', 'posteingang',
                       'expose_vorlagen_bearbeiten')
  end
  from public.profiles p where p.id = auth.uid()
$function$;

comment on function public.hat_recht(text) is
  'Serverseitige Zweitfassung von hatRecht() aus der Oberflaeche. '
  'tests/rechte.sql vergleicht beide Fassungen gegeneinander — zwei '
  'Formulierungen derselben Regel duerfen nicht auseinanderlaufen.';

-- --- Die Vorlagen ---------------------------------------------------------
create table if not exists public.expose_vorlagen (
  id                uuid primary key default gen_random_uuid(),
  mandant_id        uuid references public.mandanten(id) on delete cascade,
  gesellschaft_id   uuid references public.gesellschaften(id) on delete set null,
  name              text not null,
  beschreibung      text,
  basis             text not null default 'leer',
  dokument          jsonb not null default '{}'::jsonb,
  version           integer not null default 1,
  ist_standard      boolean not null default false,
  archiviert        boolean not null default false,
  vorschaubild_pfad text,
  erstellt_von      uuid references public.profiles(id) on delete set null,
  erstellt_am       timestamptz not null default now(),
  geaendert_am      timestamptz not null default now(),
  constraint expose_vorlagen_basis_check
    check (basis in ('raster', 'signature', 'studio', 'leer'))
);

create index if not exists expose_vorlagen_mandant_idx
  on public.expose_vorlagen (mandant_id) where archiviert = false;

-- Hoechstens eine Standardvorlage je Mandant. Zwei waeren eine Frage ohne
-- Antwort: welche nimmt das Expose?
create unique index if not exists expose_vorlagen_ein_standard_idx
  on public.expose_vorlagen (mandant_id)
  where ist_standard and not archiviert and mandant_id is not null;

comment on table public.expose_vorlagen is
  'Exposé-Vorlagen als JSON-Dokumente. mandant_id null = Systemvorlage: '
  'fuer alle lesbar, ueber RLS fuer niemanden schreibbar.';
comment on column public.expose_vorlagen.dokument is
  'Die Vorlage nach packages/expose-renderer/vorlagen/schema.json.';
comment on column public.expose_vorlagen.basis is
  'Von welcher Systemvorlage sie abstammt — nur zur Anzeige, der Renderer '
  'liest allein das Dokument.';

alter table public.expose_vorlagen enable row level security;

-- Lesen: eigene Vorlagen und die Systemvorlagen.
drop policy if exists "expose_vorlagen_lesen" on public.expose_vorlagen;
create policy "expose_vorlagen_lesen" on public.expose_vorlagen
  for select to authenticated using (true);

drop policy if exists "expose_vorlagen_bearbeiten" on public.expose_vorlagen;
create policy "expose_vorlagen_bearbeiten" on public.expose_vorlagen
  for all to authenticated
  using (public.hat_recht('expose_vorlagen_bearbeiten'))
  with check (public.hat_recht('expose_vorlagen_bearbeiten'));

-- Die Mandantengrenze. Lesen darf auch, was keinen Mandanten hat
-- (Systemvorlagen); schreiben nur im eigenen Mandanten — und weil der
-- with-check null nicht zulaesst, kann niemand eine Systemvorlage anlegen
-- oder eine eigene dazu machen.
drop policy if exists "mandant_trennung" on public.expose_vorlagen;
create policy "mandant_trennung" on public.expose_vorlagen
  as restrictive for all to public
  using (mandant_id is null or mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

alter table public.expose_vorlagen
  alter column mandant_id set default public.aktuelle_mandant_id();

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('expose_vorlagen', 'MANDANT',
        'Exposé-Vorlagen des Mandanten; mandant_id null sind Systemvorlagen und nur lesbar')
on conflict (tabelle) do nothing;

-- --- Die Versionen --------------------------------------------------------
create table if not exists public.expose_vorlagen_versionen (
  id            uuid primary key default gen_random_uuid(),
  vorlage_id    uuid not null references public.expose_vorlagen(id) on delete cascade,
  mandant_id    uuid,
  version       integer not null,
  dokument      jsonb not null,
  geaendert_von uuid references public.profiles(id) on delete set null,
  geaendert_am  timestamptz not null default now(),
  unique (vorlage_id, version)
);

create index if not exists expose_vorlagen_versionen_idx
  on public.expose_vorlagen_versionen (vorlage_id, version desc);

-- Die Mandantengrenze liest mandant_id bei jedem Zugriff; eine Tabelle der
-- Gruppe MANDANT ohne diesen Index faellt in tests/mandant-einstufung.sql auf.
create index if not exists expose_vorlagen_versionen_mandant_idx
  on public.expose_vorlagen_versionen (mandant_id);

comment on table public.expose_vorlagen_versionen is
  'Jede Speicherung einer Vorlage als Kopie. Die letzten 30 je Vorlage '
  'bleiben; aeltere raeumt ein Trigger ab.';

alter table public.expose_vorlagen_versionen enable row level security;

drop policy if exists "expose_versionen_lesen" on public.expose_vorlagen_versionen;
create policy "expose_versionen_lesen" on public.expose_vorlagen_versionen
  for select to authenticated using (true);

drop policy if exists "expose_versionen_pflegen" on public.expose_vorlagen_versionen;
create policy "expose_versionen_pflegen" on public.expose_vorlagen_versionen
  for all to authenticated
  using (public.hat_recht('expose_vorlagen_bearbeiten'))
  with check (public.hat_recht('expose_vorlagen_bearbeiten'));

drop policy if exists "mandant_trennung" on public.expose_vorlagen_versionen;
create policy "mandant_trennung" on public.expose_vorlagen_versionen
  as restrictive for all to public
  using (mandant_id is null or mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

alter table public.expose_vorlagen_versionen
  alter column mandant_id set default public.aktuelle_mandant_id();

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('expose_vorlagen_versionen', 'MANDANT',
        'Fassungen der Exposé-Vorlagen eines Mandanten')
on conflict (tabelle) do nothing;

-- Aeltere Fassungen abraeumen. Dreissig je Vorlage, nicht insgesamt: wer
-- an zwei Vorlagen arbeitet, soll nicht die Fassungen der einen durch die
-- Arbeit an der anderen verlieren.
create or replace function public.expose_versionen_abraeumen()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  delete from public.expose_vorlagen_versionen v
   where v.vorlage_id = new.vorlage_id
     and v.version <= (
       select version from public.expose_vorlagen_versionen
        where vorlage_id = new.vorlage_id
        order by version desc offset 30 limit 1);
  return null;
end
$function$;

drop trigger if exists expose_versionen_abraeumen on public.expose_vorlagen_versionen;
create trigger expose_versionen_abraeumen
  after insert on public.expose_vorlagen_versionen
  for each row execute function public.expose_versionen_abraeumen();

-- --- Am Objekt ------------------------------------------------------------
alter table public.immobilien
  add column if not exists expose_vorlage_id uuid
    references public.expose_vorlagen(id) on delete set null,
  add column if not exists expose_overrides jsonb not null default '{}'::jsonb;

comment on column public.immobilien.expose_vorlage_id is
  'Vorlage nur fuer dieses Objekt. Leer = Standard des Mandanten.';
comment on column public.immobilien.expose_overrides is
  'Abweichungen je Objekt: ausgeblendete Seiten, getauschte Bilder, '
  'ueberschriebene Texte. Die Vorlage selbst bleibt unberuehrt — eine '
  'geaenderte Vorlage soll die Arbeit am Objekt nicht wegwerfen.';

-- --- Der Eimer fuer eigene Grafiken ---------------------------------------
insert into storage.buckets (id, name, public)
values ('expose-assets', 'expose-assets', false)
on conflict (id) do nothing;

drop policy if exists "expose_assets_lesen" on storage.objects;
create policy "expose_assets_lesen" on storage.objects
  for select to authenticated using (bucket_id = 'expose-assets');

drop policy if exists "expose_assets_pflegen" on storage.objects;
create policy "expose_assets_pflegen" on storage.objects
  for all to authenticated
  using (bucket_id = 'expose-assets'
         and public.hat_recht('expose_vorlagen_bearbeiten'))
  with check (bucket_id = 'expose-assets'
              and public.hat_recht('expose_vorlagen_bearbeiten'));
