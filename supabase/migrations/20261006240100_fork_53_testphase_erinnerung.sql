-- ===========================================================================
-- fork_53 — die Testphase endet nicht unangekündigt
-- ===========================================================================
-- Drei Meldungen vor dem Ende, gerechnet in VERBLEIBENDEN Tagen: sieben,
-- zwei, null. Bei der voreingestellten Testphase von 28 Tagen ist das Tag 21,
-- 26 und 28; ändert der Betreiber die Länge, wandern die Meldungen mit.
--
-- Diese Tabelle ist die Sperre gegen Doppelversand — und zwar über ihren
-- Eindeutigkeitsschlüssel, nicht über eine Abfrage in der Funktion. Zwei
-- gleichzeitige Läufe sähen sich sonst nicht.
--
-- Sie steht bewusst NICHT in `credit_buchungen` oder `mandant_abo`: eine
-- Versandnotiz hat dort nichts verloren, und das Ledger bleibt das Ledger.
-- ===========================================================================

create table if not exists public.abo_erinnerungen (
  -- Vorgabewert wie bei jeder MANDANT-Tabelle (fork_13). Geschrieben wird
  -- diese Tabelle zwar nur mit dem Dienstschluessel, der ihn nicht braucht —
  -- aber die Einstufung verlangt ihn, und eine Ausnahme, die man erklaeren
  -- muss, ist eine Ausnahme zu viel.
  mandant_id    uuid not null default public.aktuelle_mandant_id()
                  references public.mandanten(id) on delete cascade,
  -- test_7 | test_2 | test_0 — und was später dazukommt.
  art           text not null,
  -- Angelegt wird die Zeile VOR dem Versand (sie ist die Sperre), gefüllt
  -- danach. Bleibt gesendet_am leer, ist der Versand gescheitert und die
  -- Funktion hat die Zeile schon wieder entfernt.
  gesendet_am   timestamptz,
  empfaenger    integer,
  erstellt_am   timestamptz not null default now(),
  primary key (mandant_id, art)
);

comment on table public.abo_erinnerungen is
  'Welche Erinnerung ein Mandant schon bekommen hat. Der Primaerschluessel '
  'ist die Sperre gegen Doppelversand.';

-- Eigener Index auf mandant_id: der Primaerschluessel fuehrt ihn zwar an
-- erster Stelle, aber die Pruefung in tests/mandant-einstufung.sql verlangt
-- einen ausdruecklichen — und sie hat recht: ein zusammengesetzter Schluessel
-- laesst sich umstellen, ohne dass es auffaellt.
create index if not exists abo_erinnerungen_mandant_idx
  on public.abo_erinnerungen (mandant_id);
create index if not exists abo_erinnerungen_zeit_idx
  on public.abo_erinnerungen (erstellt_am desc);

alter table public.abo_erinnerungen enable row level security;

-- Lesen darf das eigene Haus (es steht in der Oberflaeche als Hinweis) und
-- der Plattform-Administrator. Geschrieben wird nur mit dem
-- Dienstschluessel aus der Funktion.
drop policy if exists "abo_erinnerungen_lesen" on public.abo_erinnerungen;
create policy "abo_erinnerungen_lesen" on public.abo_erinnerungen
  for select to authenticated
  using (mandant_id = public.aktuelle_mandant_id() or public.ist_plattform_admin());

-- Die restriktive Mandantentrennung wie bei jeder MANDANT-Tabelle. Sie gilt
-- ZUSAETZLICH zur Richtlinie oben — ein Plattform-Administrator kommt
-- deshalb nur an die Zeilen, die ihm seine eigene Richtlinie oeffnet.
drop policy if exists "mandant_trennung" on public.abo_erinnerungen;
create policy "mandant_trennung" on public.abo_erinnerungen
  as restrictive for all to authenticated
  using (mandant_id = public.aktuelle_mandant_id() or public.ist_plattform_admin())
  with check (mandant_id = public.aktuelle_mandant_id());

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('abo_erinnerungen', 'MANDANT',
   'Welche Abo-Erinnerung ein Mandant bekommen hat; traegt mandant_id')
on conflict (tabelle) do update
  set gruppe = excluded.gruppe, grund = excluded.grund;

-- Einmal am Tag, morgens. Nicht stuendlich: eine Erinnerung ist keine
-- Eilsache, und ein Lauf je Tag macht die Rechnung "verbleibende Tage"
-- eindeutig.
select cron.schedule(
  'testphase-erinnerung-taeglich', '40 6 * * *',
  $$select net.http_post(
      url := public.eigene_funktions_url('testphase-erinnerung'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000);$$);
