-- ===========================================================================
-- Fork-eigene Migration 06 — erster Mandant, Backfill, Vorgabewert
--
-- Drei Dinge, in dieser Reihenfolge:
--
-- 1. Ein erster Mandant mit einer Gesellschaft und einem Standort. Der Name
--    ist "Musterhaus Immobilien GmbH" — die Musterfirma aus
--    docs/NEUTRALITAET.md Abschnitt 4, nicht erfunden und nicht die Referenz.
--    Der Betreiber benennt sie in der Oberflaeche um.
--
-- 2. Die Bestandsdaten bekommen diesen Mandanten. Es sind 55 Zeilen in vier
--    Tabellen (immobilie_datei 41, portal_diagnose 7, mail_kategorien 6,
--    immobilien 1) und die beiden Profile.
--
-- 3. Der eigentliche Kniff: `mandant_id` bekommt auf jeder Tabelle den
--    Vorgabewert `aktuelle_mandant_id()`.
--
-- Zu 3., weil es der Punkt ist, an dem eine Mandantenfaehigkeit ueblicherweise
-- scheitert: Die Vorlage kennt die Spalte nicht. Weder die Oberflaeche noch
-- eine der 139 Edge Functions setzt sie beim Einfuegen. Ohne Vorgabewert
-- haette jede neue Zeile mandant_id = null — unter RLS fuer jeden unsichtbar,
-- also stiller Datenverlust. Mit Vorgabewert traegt die Datenbank den Mandanten
-- des Anmeldenden selbst ein, und kein einziger Aufruf muss angefasst werden.
--
-- Was NICHT in dieser Migration steht: NOT NULL. Der Vorgabewert greift nur
-- fuer Aufrufe mit angemeldetem Nutzer. Edge Functions arbeiten mit
-- service_role, dort ist auth.uid() null und damit auch der Vorgabewert. NOT
-- NULL wuerde ihre Einfuegungen brechen. Es kommt, wenn die Edge Functions
-- durchgesehen sind — und bis dahin gilt: eine Zeile ohne mandant_id ist
-- unsichtbar, aber kein Sicherheitsloch. Sie ist ein Datenverlust, und dafuer
-- gibt es die Pruefung in tests/mandant-einstufung.sql.
-- ===========================================================================

do $$
declare m uuid; g uuid;
begin
  insert into public.mandanten (name, slug, abo_status)
       values ('Musterhaus Immobilien GmbH', 'musterhaus', 'aktiv')
    returning id into m;

  insert into public.gesellschaften (mandant_id, name, rechtsform, ist_standard, sortierung)
       values (m, 'Musterhaus Immobilien GmbH', 'GmbH', true, 0)
    returning id into g;

  insert into public.firma_stammdaten (mandant_id, gesellschaft_id, firma_name, slug, typ, sortierung)
       values (m, g, 'Musterhaus Immobilien GmbH', 'standard', 'standort', 0);

  update public.profiles set mandant_id = m where mandant_id is null;

  update public.immobilien      set mandant_id = m where mandant_id is null;
  update public.immobilie_datei set mandant_id = m where mandant_id is null;
  update public.portal_diagnose set mandant_id = m where mandant_id is null;
  update public.mail_kategorien set mandant_id = m where mandant_id is null;

  raise notice 'Mandant % angelegt, Bestandsdaten zugeordnet', m;
end $$;

do $$
declare r record; n int := 0;
begin
  for r in select tabelle from public.mandanten_einstufung
            where gruppe in ('MANDANT','GRENZE') and tabelle <> 'mandanten'
            order by tabelle loop
    execute format('alter table public.%I alter column mandant_id '
                   'set default public.aktuelle_mandant_id()', r.tabelle);
    n := n + 1;
  end loop;
  raise notice 'Vorgabewert auf % Tabellen gesetzt', n;
end $$;
