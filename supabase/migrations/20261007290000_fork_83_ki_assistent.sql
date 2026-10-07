-- ===========================================================================
-- fork_83 — KI-Assistent mit Werkzeugen: Preis und Notschalter
-- ===========================================================================
-- Die eigene Funktion ki-assistent ersetzt im Chat-Fenster claude-chat. Sie
-- liest unter dem JWT des Nutzers Objekte, Kontakte und Vorlagen und legt
-- Entwürfe an (Mail-Vorlage, Brief, ToDo-Kette). Ein Auftrag = eine
-- Nachricht des Nutzers, gleich wie viele Werkzeugrunden Claude braucht.
--
-- 2 Credits — so viel wie ein einzelner KI-Text. Der Betreiber ändert den
-- Wert im Plattform-Admin; dort steht auch der Notschalter.
--
-- Rücknahme:
--   delete from public.plattform_ki_einstellungen where funktion = 'ki_assistent';
--   update public.plattform_credit_preise set aktiv = false where aktion = 'ki_assistent';
-- ===========================================================================

insert into public.plattform_credit_preise (aktion, name, credits, beschreibung, sortierung) values
  ('ki_assistent', 'KI-Assistent: Auftrag im Chat', 2, 'Eine Nachricht an den Assistenten — er liest Ihre Daten und legt Entwürfe an', 9)
on conflict (aktion) do nothing;

insert into public.plattform_ki_einstellungen (funktion, name, anbieter, modell) values
  ('ki_assistent', 'KI-Assistent (Chat mit Werkzeugen)', 'anthropic', 'claude-sonnet-4-6')
on conflict (funktion) do nothing;
