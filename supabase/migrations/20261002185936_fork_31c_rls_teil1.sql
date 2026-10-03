-- ===========================================================================
-- Fork-eigene Migration 31c — Rechte fuer die ersten vier neuen Tabellen
--
-- Dieselbe Bauart wie bei den Tabellen der Vorlage: eine ERLAUBENDE
-- Richtlinie fuer das Team und darueber die RESTRIKTIVE Mandantengrenze aus
-- fork_07. Restriktiv heisst mit UND verknuepft — von keiner erlaubenden
-- Richtlinie aufzuheben.
--
-- Ausgeschrieben statt in einer Schleife: die Fassung mit DO-Block und
-- execute format() lief am 02.10.2026 zweimal in die Zeitsperre des
-- Werkzeugs. Ausgeschrieben ist sie ausserdem lesbar.
-- ===========================================================================

alter table public.aufmass_scan            enable row level security;
alter table public.grundriss_ki_auftraege enable row level security;
alter table public.kosten_posten          enable row level security;
alter table public.punktwolke_diagnose    enable row level security;

create policy aufmass_scan_team on public.aufmass_scan as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.aufmass_scan as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create policy grundriss_ki_auftraege_team on public.grundriss_ki_auftraege as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.grundriss_ki_auftraege as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create policy kosten_posten_team on public.kosten_posten as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.kosten_posten as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

-- Die Kostenuebersicht sieht nur die Geschaeftsfuehrung. Die Oberflaeche
-- blendet den Reiter aus — das ist Bedienkomfort, keine Schranke. Die
-- Schranke steht hier (CLAUDE.md: Rechte serverseitig erzwingen).
create policy kosten_posten_nur_chef on public.kosten_posten as restrictive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'chef'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'chef'));

create policy punktwolke_diagnose_team on public.punktwolke_diagnose as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.punktwolke_diagnose as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());
