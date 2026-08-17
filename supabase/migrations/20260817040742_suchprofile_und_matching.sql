-- Suchprofile und Matching (Abschnitt 7).
--
-- Ein Suchprofil haelt fest, was ein Interessent sucht; die Trefferliste
-- verbindet es mit dem Bestand. Die Punktzahl ordnet nur — die Auswahl trifft
-- weiterhin der Makler.

create type public.treffer_art as enum ('automatisch','manuell');
create type public.treffer_status as enum ('neu','gesendet','vorgemerkt','abgelehnt');

create table public.suchprofile (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  kontakt_id uuid not null references public.kontakte(id) on delete cascade,
  bezeichnung text,
  aktiv boolean not null default true,
  vermarktungsart public.vermarktungsart not null default 'kauf',
  objektkategorien public.objektkategorie[] not null default '{}',
  preis_von numeric(14,2) check (preis_von is null or preis_von >= 0),
  preis_bis numeric(14,2) check (preis_bis is null or preis_bis >= 0),
  flaeche_von numeric(10,2) check (flaeche_von is null or flaeche_von >= 0),
  flaeche_bis numeric(10,2) check (flaeche_bis is null or flaeche_bis >= 0),
  zimmer_von numeric(4,1) check (zimmer_von is null or zimmer_von >= 0),
  zimmer_bis numeric(4,1) check (zimmer_bis is null or zimmer_bis >= 0),
  orte text[] not null default '{}',
  plz_praefixe text[] not null default '{}',
  bemerkung text,
  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint suchprofil_preis_reihenfolge check (preis_von is null or preis_bis is null or preis_von <= preis_bis),
  constraint suchprofil_flaeche_reihenfolge check (flaeche_von is null or flaeche_bis is null or flaeche_von <= flaeche_bis),
  constraint suchprofil_zimmer_reihenfolge check (zimmer_von is null or zimmer_bis is null or zimmer_von <= zimmer_bis)
);
create index suchprofile_mandant_idx on public.suchprofile(mandant_id) where aktiv;
create index suchprofile_kontakt_idx on public.suchprofile(kontakt_id);
comment on table public.suchprofile is 'Suchwunsch eines Interessenten. Grundlage des Matchings (Abschnitt 7).';

create table public.treffer (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  suchprofil_id uuid not null references public.suchprofile(id) on delete cascade,
  objekt_id uuid not null references public.objekte(id) on delete cascade,
  punktzahl smallint not null check (punktzahl between 0 and 100),
  art public.treffer_art not null default 'automatisch',
  status public.treffer_status not null default 'neu',
  begruendung text,
  erzeugt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  unique (suchprofil_id, objekt_id)
);
create index treffer_mandant_idx on public.treffer(mandant_id, status);
create index treffer_objekt_idx on public.treffer(objekt_id);

create trigger suchprofile_geaendert before update on public.suchprofile
  for each row execute function intern.setze_geaendert_am();
create trigger treffer_geaendert before update on public.treffer
  for each row execute function intern.setze_geaendert_am();

-- Bewertet, wie gut ein Objekt zu einem Suchprofil passt.
-- Rueckgabe null bedeutet: Ausschlusskriterium verletzt, kein Treffer.
-- Die Punktzahl dient der Reihenfolge, nicht als Versprechen — die Auswahl
-- trifft weiterhin der Makler.
create or replace function intern.treffer_punktzahl(
  p_profil public.suchprofile, p_objekt public.objekte)
returns smallint language plpgsql immutable
as $$
declare
  v_preis numeric;
  v_punkte numeric := 0;
  v_moeglich numeric := 0;
begin
  -- Ausschlusskriterien: Vermarktungsart und Kategorie muessen passen.
  if p_profil.vermarktungsart <> p_objekt.vermarktungsart
     and p_objekt.vermarktungsart <> 'kauf_miete' then
    return null;
  end if;

  if array_length(p_profil.objektkategorien, 1) is not null
     and not (p_objekt.objektkategorie = any(p_profil.objektkategorien)) then
    return null;
  end if;

  v_preis := case when p_profil.vermarktungsart = 'miete'
                  then p_objekt.kaltmiete else p_objekt.kaufpreis end;

  -- Preis ist hartes Kriterium: Wer 300.000 sucht, will keine 900.000 sehen.
  if p_profil.preis_bis is not null then
    if v_preis is null or v_preis > p_profil.preis_bis then return null; end if;
  end if;
  if p_profil.preis_von is not null and v_preis is not null
     and v_preis < p_profil.preis_von then
    return null;
  end if;

  -- Weiche Kriterien: je erfuelltem Wunsch steigt die Punktzahl.
  if p_profil.preis_bis is not null then
    v_moeglich := v_moeglich + 30;
    v_punkte := v_punkte + 30;
  end if;

  if p_profil.flaeche_von is not null or p_profil.flaeche_bis is not null then
    v_moeglich := v_moeglich + 25;
    if coalesce(p_objekt.wohnflaeche, p_objekt.nutzflaeche) is not null
       and (p_profil.flaeche_von is null
            or coalesce(p_objekt.wohnflaeche, p_objekt.nutzflaeche) >= p_profil.flaeche_von)
       and (p_profil.flaeche_bis is null
            or coalesce(p_objekt.wohnflaeche, p_objekt.nutzflaeche) <= p_profil.flaeche_bis)
    then v_punkte := v_punkte + 25; end if;
  end if;

  if p_profil.zimmer_von is not null or p_profil.zimmer_bis is not null then
    v_moeglich := v_moeglich + 20;
    if p_objekt.zimmer is not null
       and (p_profil.zimmer_von is null or p_objekt.zimmer >= p_profil.zimmer_von)
       and (p_profil.zimmer_bis is null or p_objekt.zimmer <= p_profil.zimmer_bis)
    then v_punkte := v_punkte + 20; end if;
  end if;

  if array_length(p_profil.orte, 1) is not null then
    v_moeglich := v_moeglich + 25;
    if p_objekt.ort is not null and exists (
      select 1 from unnest(p_profil.orte) o
       where lower(trim(o)) = lower(trim(p_objekt.ort))
    ) then v_punkte := v_punkte + 25; end if;
  elsif array_length(p_profil.plz_praefixe, 1) is not null then
    v_moeglich := v_moeglich + 25;
    if p_objekt.plz is not null and exists (
      select 1 from unnest(p_profil.plz_praefixe) p
       where p_objekt.plz like trim(p) || '%'
    ) then v_punkte := v_punkte + 25; end if;
  end if;

  -- Ohne weiche Kriterien zaehlt allein, dass die Ausschlusskriterien passen.
  if v_moeglich = 0 then return 60; end if;

  return greatest(1, round(v_punkte / v_moeglich * 100))::smallint;
end; $$;

-- Ermittelt Treffer fuer ein Objekt ueber alle aktiven Suchprofile.
create or replace function public.treffer_fuer_objekt(p_objekt uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_objekt public.objekte;
  v_profil public.suchprofile;
  v_punkte smallint;
  v_neu integer := 0;
begin
  select * into v_objekt from public.objekte
   where id = p_objekt and mandant_id = v_mandant and geloescht_am is null;
  if not found then return 0; end if;

  for v_profil in
    select * from public.suchprofile where mandant_id = v_mandant and aktiv
  loop
    v_punkte := intern.treffer_punktzahl(v_profil, v_objekt);
    if v_punkte is not null then
      insert into public.treffer (mandant_id, suchprofil_id, objekt_id, punktzahl, art)
      values (v_mandant, v_profil.id, v_objekt.id, v_punkte, 'automatisch')
      on conflict (suchprofil_id, objekt_id)
        do update set punktzahl = excluded.punktzahl
        where public.treffer.status = 'neu';
      v_neu := v_neu + 1;
    end if;
  end loop;
  return v_neu;
end; $$;

-- Ermittelt Treffer fuer ein Suchprofil ueber alle vermarktbaren Objekte.
create or replace function public.treffer_fuer_profil(p_profil uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_profil public.suchprofile;
  v_objekt public.objekte;
  v_punkte smallint;
  v_neu integer := 0;
begin
  select * into v_profil from public.suchprofile
   where id = p_profil and mandant_id = v_mandant;
  if not found then return 0; end if;

  for v_objekt in
    select * from public.objekte
     where mandant_id = v_mandant and geloescht_am is null
       and status in ('vorbereitung','aktiv','reserviert')
  loop
    v_punkte := intern.treffer_punktzahl(v_profil, v_objekt);
    if v_punkte is not null then
      insert into public.treffer (mandant_id, suchprofil_id, objekt_id, punktzahl, art)
      values (v_mandant, v_profil.id, v_objekt.id, v_punkte, 'automatisch')
      on conflict (suchprofil_id, objekt_id)
        do update set punktzahl = excluded.punktzahl
        where public.treffer.status = 'neu';
      v_neu := v_neu + 1;
    end if;
  end loop;
  return v_neu;
end; $$;

alter table public.suchprofile enable row level security;
alter table public.treffer enable row level security;

create policy suchprofile_lesen on public.suchprofile
  for select using (mandant_id = intern.aktueller_mandant());
create policy suchprofile_schreiben on public.suchprofile
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create policy treffer_lesen on public.treffer
  for select using (mandant_id = intern.aktueller_mandant());
create policy treffer_schreiben on public.treffer
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

grant execute on function public.treffer_fuer_objekt(uuid) to authenticated;
grant execute on function public.treffer_fuer_profil(uuid) to authenticated;
