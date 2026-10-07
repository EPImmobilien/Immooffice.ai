-- ===========================================================================
-- fork_86 — Bautraeger-Paket v2, Bloecke E und F: QR-Token, Bautenstand, MaBV
-- ===========================================================================
-- Auftrag vom 07.10.2026.
--
--   E) projekt_einheiten.qr_token: ein Token je Wohnungstuer. Der QR-Code
--      fuehrt auf die Anwendung (?qr=<token>). Angemeldet oeffnet sich die
--      Wohnungsakte; nicht angemeldet zeigt die Function einheit-qr nur
--      Projekt und Einheitennummer — keine Personendaten.
--   F) projekt_bautenstand: je Projekt oder Einheit der erreichte Bauabschnitt
--      nach § 3 Abs. 2 MaBV (1–13), mit Datum, Fotos und Melder.
--      projekt_zahlungsplan.abschnitte: welche Abschnitte eine Rate buendelt
--      (hoechstens sieben Raten je Kaufvertrag — das prueft die Oberflaeche,
--      nicht die Datenbank: der Kaufvertrag kann weniger vorsehen).
--      rate_anforderbar(): alle Abschnitte einer Rate erreicht, Rate offen,
--      noch nicht angefordert. Ein Trigger auf projekt_bautenstand legt dann
--      den Hinweis fuer die Glocke an („Rate x anforderbar") — einmal.
--
-- Die 13 Abschnitte der MaBV (Bezeichnung und Hoechstsatz) stehen in der
-- Oberflaeche (src/eigene/bautraeger.js, IMMO_MABV); hier nur die Nummer.
-- Keine KI, keine Automatik beim Geld: der Versand der Zahlungsanforderung
-- ist ein Klick der Verwaltung.
--
-- RUECKNAHME: drop table projekt_bautenstand; alter table projekt_einheiten
-- drop column qr_token; alter table projekt_zahlungsplan drop column
-- abschnitte, angefordert_am, hinweis_am; delete from mandanten_einstufung
-- where tabelle = 'projekt_bautenstand'.
-- ===========================================================================

-- --- E) QR-Token ------------------------------------------------------------------
alter table public.projekt_einheiten
  add column if not exists qr_token text not null default encode(gen_random_bytes(12), 'hex');
create unique index if not exists projekt_einheiten_qr_token_key on public.projekt_einheiten (qr_token);
comment on column public.projekt_einheiten.qr_token is
  'Token des QR-Codes an der Wohnungstuer. Oeffentlich sichtbar — darum ohne jede Bedeutung ausser der Zuordnung zur Einheit.';

-- --- F) Bautenstand -----------------------------------------------------------------
create table if not exists public.projekt_bautenstand (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  projekt_id    uuid not null references public.projekte(id) on delete cascade,
  einheit_id    uuid references public.projekt_einheiten(id) on delete cascade,
  abschnitt     integer not null check (abschnitt between 1 and 13),
  erreicht_am   date not null default current_date,
  foto_pfade    text[] not null default '{}',
  notiz         text,
  gemeldet_von  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
comment on table public.projekt_bautenstand is
  'Erreichte Bauabschnitte nach § 3 Abs. 2 MaBV je Projekt (einheit_id null = ganzes Haus) oder je Einheit.';
create unique index if not exists projekt_bautenstand_eindeutig on public.projekt_bautenstand (projekt_id, einheit_id, abschnitt) nulls not distinct;
create index if not exists projekt_bautenstand_mandant_idx on public.projekt_bautenstand (mandant_id);
create index if not exists projekt_bautenstand_einheit_idx on public.projekt_bautenstand (einheit_id);
create index if not exists projekt_bautenstand_gemeldet_von_idx on public.projekt_bautenstand (gemeldet_von);
alter table public.projekt_bautenstand enable row level security;
drop policy if exists projekt_bautenstand_team on public.projekt_bautenstand;
create policy projekt_bautenstand_team on public.projekt_bautenstand
  for all to authenticated using (public.ist_team()) with check (public.ist_team());
drop policy if exists "mandant_trennung" on public.projekt_bautenstand;
create policy "mandant_trennung" on public.projekt_bautenstand
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.mandant_id_schreiben());
drop policy if exists "mandant_trennung_loeschen" on public.projekt_bautenstand;
create policy "mandant_trennung_loeschen" on public.projekt_bautenstand
  as restrictive for delete to public
  using (mandant_id = public.mandant_id_schreiben());
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('projekt_bautenstand', 'MANDANT', 'Bauabschnitte je Projekt/Einheit eines Mandanten (fork_86)')
on conflict (tabelle) do nothing;

alter table public.projekt_zahlungsplan
  add column if not exists abschnitte     integer[] not null default '{}',
  add column if not exists angefordert_am date,
  add column if not exists hinweis_am     timestamptz;
comment on column public.projekt_zahlungsplan.abschnitte is 'Bauabschnitte (1–13, MaBV), die diese Rate buendelt. Leer = Rate ohne Bautenstandsbezug (z. B. bei Vertragsschluss).';
comment on column public.projekt_zahlungsplan.angefordert_am is 'Tag, an dem die Zahlungsanforderung an den Kaeufer ging (Klick der Verwaltung).';

-- Welche Raten eines Projekts sind anforderbar? Erreicht gilt ein Abschnitt,
-- wenn er fuer die Einheit der Rate ODER fuer das ganze Haus gemeldet ist.
create or replace function public.rate_anforderbar(p_projekt uuid)
 returns table (id uuid, zugang_id uuid, einheit_id uuid, pos integer, bezeichnung text,
                betrag numeric, prozent numeric, abschnitte integer[], faellig_am date, hinweis_am timestamptz)
 language sql
 stable
 security invoker
 set search_path = public
as $$
  select z.id, z.zugang_id, z.einheit_id, z.position as pos, z.bezeichnung, z.betrag, z.prozent, z.abschnitte, z.faellig_am, z.hinweis_am
    from public.projekt_zahlungsplan z
   where z.projekt_id = p_projekt
     and z.status = 'offen' and z.angefordert_am is null
     and cardinality(z.abschnitte) > 0
     and not exists (
       select 1 from unnest(z.abschnitte) a
        where not exists (select 1 from public.projekt_bautenstand b
                           where b.projekt_id = z.projekt_id and b.abschnitt = a
                             and (b.einheit_id is null or b.einheit_id = z.einheit_id)))
   order by z.einheit_id, z.position
$$;
grant execute on function public.rate_anforderbar(uuid) to authenticated;
revoke all on function public.rate_anforderbar(uuid) from public, anon;

-- Hinweis fuer die Glocke, sobald ein Bautenstand eine Rate vollstaendig macht.
create or replace function public.projekt_bautenstand_hinweis_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $$
declare r record; einheit text; kaeufer text;
begin
  for r in select * from public.rate_anforderbar(new.projekt_id) where hinweis_am is null loop
    select e.we_nr into einheit from public.projekt_einheiten e where e.id = r.einheit_id;
    select coalesce(z.anzeigename, z.email) into kaeufer from public.projekt_zugaenge z where z.id = r.zugang_id;
    perform public.projekt_glocke(new.mandant_id, 'rate_anforderbar',
      format('Rate %s anforderbar: %s', r.pos, r.bezeichnung),
      format('%s%s — alle Bauabschnitte (%s) sind erreicht. Zahlungsanforderung als Entwurf in der Wohnungsakte.',
             coalesce('WE ' || einheit || ' · ', ''), coalesce(kaeufer, 'Käufer'), array_to_string(r.abschnitte, ', ')),
      'projekt_zahlungsplan', r.id);
    update public.projekt_zahlungsplan set hinweis_am = now() where id = r.id;
  end loop;
  return new;
end $$;
drop trigger if exists projekt_bautenstand_hinweis_trg on public.projekt_bautenstand;
create trigger projekt_bautenstand_hinweis_trg after insert on public.projekt_bautenstand
  for each row execute function public.projekt_bautenstand_hinweis_trg();
revoke all on function public.projekt_bautenstand_hinweis_trg() from public, anon;
