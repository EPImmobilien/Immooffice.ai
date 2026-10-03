-- ===========================================================================
-- Fork-eigene Migration 31d — Rechte fuer Scan-Ablage und Unterlagen-Links
--
-- Fortsetzung von 31c, gleiche Bauart.
--
-- Zu unterlagen_links: die oeffentliche Seite unterlagen.html liest NICHT
-- ueber diese Richtlinien. Sie hat kein Konto und keinen Mandanten, nur ein
-- Token — und sie fragt die Edge Function unterlagen-link, die mit dem
-- Dienstschluessel arbeitet. Diese Richtlinien gelten fuer das Team in der
-- Anwendung; die Grenze fuer den oeffentlichen Weg ist das Token und die
-- Pruefung in der Funktion.
-- ===========================================================================

alter table public.scan_ablage            enable row level security;
alter table public.unterlagen_links       enable row level security;
alter table public.transfer_dateien       enable row level security;
alter table public.unterlagen_link_abrufe enable row level security;

create policy scan_ablage_team on public.scan_ablage as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.scan_ablage as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create policy unterlagen_links_team on public.unterlagen_links as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.unterlagen_links as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create policy transfer_dateien_team on public.transfer_dateien as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.transfer_dateien as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create policy unterlagen_link_abrufe_team on public.unterlagen_link_abrufe as permissive for all to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('chef','mitarbeiter')));
create policy mandant_trennung on public.unterlagen_link_abrufe as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());
