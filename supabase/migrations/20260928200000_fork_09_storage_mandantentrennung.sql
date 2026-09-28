-- ===========================================================================
-- Fork-eigene Migration 09 — Mandantentrennung im Dateispeicher
--
-- Gleiche Bauart wie fork_07 bei den Tabellen: EINE restriktive Richtlinie,
-- mit UND verknuepft, nicht zu umgehen. Die 59 vorhandenen Storage-
-- Richtlinien der Vorlage bleiben unveraendert.
--
-- Geprueft wird das erste Pfadsegment. Die Storage-Huellen in Oberflaeche und
-- Edge Functions stellen es voran; die 91 vorhandenen Dateien sind in fork_08
-- umgezogen.
--
-- WAS DIESE RICHTLINIE NICHT LEISTET: Fuenf Buckets sind oeffentlich
-- (branding, immobilie-dateien, ki-bilder, marke, web-assets). Ihre Dateien
-- liefert Supabase ueber die oeffentliche Adresse ohne Pruefung aus — daran
-- aendert keine Richtlinie etwas, das ist der Sinn eines oeffentlichen
-- Buckets (Bilder im Web-Expose). Was sich geaendert hat: der Pfad beginnt
-- jetzt mit einer UUID und ist damit nicht mehr zu erraten. Wer die Adresse
-- hat, kommt an die Datei; wer sie nicht hat, findet sie nicht. Vermerkt in
-- docs/OFFEN.md.
-- ===========================================================================

create policy "mandant_trennung" on storage.objects
  as restrictive for all to public
  using ((storage.foldername(name))[1] = public.aktuelle_mandant_id()::text)
  with check ((storage.foldername(name))[1] = public.aktuelle_mandant_id()::text);

comment on policy "mandant_trennung" on storage.objects is
  'Das erste Pfadsegment ist die Mandantenkennung. Restriktiv, also mit UND '
  'verknuepft: keine der 59 vorhandenen Richtlinien kann sie aufheben. '
  'service_role umgeht RLS wie bisher — das ist der Weg der Edge Functions.';
