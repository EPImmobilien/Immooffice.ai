-- ===========================================================================
-- Nachgetragen aus dem Produktivprojekt (supabase_migrations.schema_migrations,
-- Version 20260817144255). Die Migration war ausgerollt, aber nicht
-- versioniert — siehe docs/STATUS.md vom 03.09.2026.
-- ===========================================================================
create policy benutzer_eigenes_konto on public.benutzer
  for select using (id = auth.uid());
