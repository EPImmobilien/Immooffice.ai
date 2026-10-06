-- ===========================================================================
-- fork_48 — Buckets ohne Richtlinie
--
-- Befund vom 06.10.2026, gemeldet aus dem Betrieb: „Upload von
-- Vollmacht_….pdf fehlgeschlagen (400: new row violates row-level security
-- policy)."
--
-- Der Pfad war richtig — er trug die Mandantenkennung, wie die restriktive
-- Richtlinie `mandant_trennung` es verlangt. Der Fehler war einfacher und
-- schlimmer: der Bucket `transfer-dateien` hatte **keine einzige
-- Richtlinie**. Auf `storage.objects` ist RLS eingeschaltet, und ohne eine
-- erlaubende Richtlinie ist alles verboten — jeder Upload, jeder Download,
-- für jeden Nutzer.
--
-- Beim Nachsehen waren es NEUN Buckets ohne Richtlinie:
--   briefe-pdf · energieausweis · importe · objektbilder · objektdokumente
--   scan-dateien · schriften · transfer-dateien · web-assets
--
-- Warum es niemandem auffiel: Edge Functions arbeiten mit dem
-- Dienstschlüssel, und für den gilt RLS nicht. Alles, was eine Funktion
-- schreibt, landete also im Bucket — nur der Browser kam nicht heran. Die
-- Buckets sahen gefüllt aus und waren trotzdem gesperrt.
--
-- ---------------------------------------------------------------------------
-- WAS GEÖFFNET WIRD — UND GENAU WIE WEIT
-- ---------------------------------------------------------------------------
-- Je Bucket nur die Rechte, die die Oberfläche wirklich braucht. Lesen und
-- Schreiben sind nicht dasselbe: ein erzeugter Brief wird gelesen, nicht
-- hochgeladen, und eine Importdatei wird nicht aus dem Browser gelöscht.
--
-- Die Mandantentrennung kommt NICHT von hier. Sie kommt von der
-- restriktiven Richtlinie `mandant_trennung` auf `storage.objects`: jeder
-- Pfad muss mit der Mandantenkennung beginnen. Beide zusammen ergeben die
-- Regel — Rolle plus Mandant. Eine erlaubende Richtlinie allein könnte die
-- Trennung nicht aufheben, und das ist der Grund, warum sie restriktiv ist.
--
-- NICHT geöffnet werden zwei der neun, und zwar mit Grund:
--   * `schriften` — Plattform-Gut im Wurzelverzeichnis, ohne Mandanten-
--     präfix. Es holt sie ohnehin nur eine Edge Function. Eine Richtlinie
--     wäre hier wirkungslos: die restriktive Trennung weist einen Pfad ohne
--     Präfix in jedem Fall ab.
--   * `web-assets` — öffentlicher Bucket. Gelesen wird über den öffentlichen
--     Weg, geschrieben von `web-asset-kopieren` mit dem Dienstschlüssel.
-- Beides steht in docs/OFFEN.md, damit es nicht als Versehen gelesen wird.
-- ===========================================================================

do $$
declare
  eintrag record;
  -- Bucket, und was die Oberfläche damit tun können muss.
  plan constant jsonb := '[
    {"bucket":"transfer-dateien", "rechte":["select","insert","delete"],
     "zweck":"Unterlagen-Links: der Makler lädt hoch und räumt auf"},
    {"bucket":"scan-dateien",     "rechte":["select","insert","delete"],
     "zweck":"Raumscan vom Telefon"},
    {"bucket":"objektbilder",     "rechte":["select","insert","delete"],
     "zweck":"Bilder am Objekt"},
    {"bucket":"objektdokumente",  "rechte":["select","insert","delete"],
     "zweck":"Unterlagen am Objekt"},
    {"bucket":"energieausweis",   "rechte":["select","insert","delete"],
     "zweck":"hochgeladene Energieausweise"},
    {"bucket":"importe",          "rechte":["select","insert"],
     "zweck":"Importdateien — werden nicht aus dem Browser gelöscht"},
    {"bucket":"briefe-pdf",       "rechte":["select"],
     "zweck":"erzeugte Geschäftsbriefe — geschrieben wird von der Funktion"}
  ]'::jsonb;
  b text;
  r text;
  endung text;
begin
  for eintrag in select * from jsonb_array_elements(plan) as j(wert) loop
    b := eintrag.wert ->> 'bucket';
    for r in select jsonb_array_elements_text(eintrag.wert -> 'rechte') loop
      endung := case r when 'select' then 'lesen'
                       when 'insert' then 'schreiben'
                       when 'delete' then 'loeschen'
                       else r end;
      execute format('drop policy if exists %I on storage.objects', b || '_' || endung);
      if r = 'insert' then
        execute format(
          'create policy %I on storage.objects for insert to authenticated '
          || 'with check (bucket_id = %L and coalesce(public.aktuelle_rolle(), '''') '
          || 'in (''chef'', ''mitarbeiter''))', b || '_' || endung, b);
      else
        execute format(
          'create policy %I on storage.objects for %s to authenticated '
          || 'using (bucket_id = %L and coalesce(public.aktuelle_rolle(), '''') '
          || 'in (''chef'', ''mitarbeiter''))', b || '_' || endung, r, b);
      end if;
    end loop;
  end loop;
end
$$;
