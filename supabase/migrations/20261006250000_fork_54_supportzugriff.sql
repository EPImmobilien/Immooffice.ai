-- ===========================================================================
-- fork_54 — Supportzugriff: sehen dürfen, ohne heimlich zu sehen
-- ===========================================================================
-- Auftrag vom 06.10.2026: „Lege info@engferundpartner.de als admin an, der
-- alle anderen Kunden verwalten wird und Rechte über alle hat."
--
-- Verwalten — Tarif, Sperre, Credits, Konten — läuft über `plattform-admin`
-- mit dem Dienstschlüssel und berührt die Mandantentrennung gar nicht. Was
-- diese Migration regelt, ist das andere: in einen Mandanten HINEINSEHEN, um
-- einem Kunden am Telefon helfen zu können.
--
-- CLAUDE.md lässt das ausdrücklich zu und sagt auch, wie:
--   „Plattform-Administratoren erhalten keinen automatischen Zugriff auf
--    Mandantendaten; Supportzugriff nur protokolliert und nach dem Prinzip
--    der geringsten Rechte."
--
-- Also: kein automatischer Zugriff (ohne Sitzung sieht ein Plattform-Admin
-- genau so viel wie jeder andere — nämlich seinen eigenen Mandanten),
-- sondern eine Sitzung, die
--
--   * einen Grund verlangt,
--   * von selbst abläuft (höchstens vier Stunden),
--   * im Protokoll steht,
--   * vom betroffenen Mandanten SELBST eingesehen werden kann — er soll
--     nachlesen können, wer wann in seinen Daten war,
--   * und standardmäßig NUR LESEN erlaubt.
--
-- Das Lesen/Schreiben-Gefälle entsteht an genau einer Stelle: die
-- restriktiven Richtlinien benutzen bisher dieselbe Funktion für `using`
-- und `with check`. Ab hier sind es zwei — `aktuelle_mandant_id()` fürs
-- Sehen und `mandant_id_schreiben()` fürs Schreiben. Für jeden normalen
-- Nutzer liefern beide denselben Wert; nur eine Support-Sitzung trennt sie.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Sitzung
-- ---------------------------------------------------------------------------
create table if not exists public.support_sitzungen (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.profiles(id) on delete cascade,
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  -- Ohne Grund keine Sitzung. Wer in einem halben Jahr fragt, warum jemand
  -- im Postfach eines Kunden war, soll eine Antwort finden.
  grund         text not null,
  schreiben     boolean not null default false,
  begonnen_am   timestamptz not null default now(),
  gueltig_bis   timestamptz not null,
  beendet_am    timestamptz,
  constraint support_sitzungen_grund_check check (length(btrim(grund)) >= 5),
  -- Höchstens vier Stunden. Eine Sitzung, die einen Tag gilt, ist keine
  -- Sitzung, sondern ein Dauerzugang mit Formular davor.
  constraint support_sitzungen_dauer_check
    check (gueltig_bis > begonnen_am and gueltig_bis <= begonnen_am + interval '4 hours')
);

comment on table public.support_sitzungen is
  'Zeitlich begrenzter, begruendeter und protokollierter Blick eines '
  'Plattform-Administrators in einen Mandanten. Ohne Sitzung sieht er '
  'nichts ausser seinem eigenen.';

create index if not exists support_sitzungen_offen_idx
  on public.support_sitzungen (admin_id, gueltig_bis desc)
  where beendet_am is null;
create index if not exists support_sitzungen_mandant_idx
  on public.support_sitzungen (mandant_id, begonnen_am desc);

alter table public.support_sitzungen enable row level security;

-- Lesen: der Administrator seine eigenen Sitzungen — und der betroffene
-- Mandant die Sitzungen IN SEINEN Daten. Das Zweite ist der Punkt: ein
-- Supportzugriff, den der Betroffene nicht nachlesen kann, ist kein
-- protokollierter Zugriff, sondern ein unbemerkter.
drop policy if exists "support_sitzungen_lesen" on public.support_sitzungen;
create policy "support_sitzungen_lesen" on public.support_sitzungen
  for select to authenticated
  using (admin_id = auth.uid()
         or mandant_id = (select p.mandant_id from public.profiles p where p.id = auth.uid()));

-- Geschrieben wird nur mit dem Dienstschluessel aus `plattform-admin`.
-- Deshalb keine einzige Schreibrichtlinie.

-- GRENZE, nicht GLOBAL: die Tabelle traegt eine mandant_id, aber sie ist
-- keine Mandantentabelle — sie beschreibt, WER die Grenze ueberschreiten
-- darf. Dieselbe Gruppe wie mandanten, profiles und firma_stammdaten
-- (fork_04: „die Struktur selbst").
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('support_sitzungen', 'GRENZE',
   'Wer wann befristet in welchen Mandanten sehen durfte. Traegt eine '
   'mandant_id, gehoert aber nicht dem Mandanten — er darf sie nur lesen.')
on conflict (tabelle) do update
  set gruppe = excluded.gruppe, grund = excluded.grund;

-- ---------------------------------------------------------------------------
-- 2. Die beiden Funktionen
-- ---------------------------------------------------------------------------
create or replace function public.support_sitzung()
 returns public.support_sitzungen
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.* from public.support_sitzungen s
   where s.admin_id = auth.uid()
     and s.beendet_am is null
     and s.gueltig_bis > now()
     -- Die Mitgliedschaft wird HIER noch einmal geprueft, nicht nur beim
     -- Anlegen: wird jemandem das Plattform-Recht entzogen, endet damit
     -- sofort auch jede laufende Sitzung.
     and exists (select 1 from public.plattform_admins a where a.benutzer_id = s.admin_id)
   order by s.begonnen_am desc
   limit 1
$function$;

comment on function public.support_sitzung() is
  'Die laufende Support-Sitzung des Angemeldeten, falls es eine gibt. '
  'Prueft die Mitgliedschaft erneut: ein entzogenes Recht beendet jede '
  'laufende Sitzung sofort.';

-- Was der Angemeldete SEHEN darf. Bisher: sein eigener Mandant. Ab jetzt:
-- waehrend einer Sitzung der Mandant, um den es geht.
create or replace function public.aktuelle_mandant_id()
 returns uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select s.mandant_id from public.support_sitzung() s),
    (select p.mandant_id from public.profiles p where p.id = auth.uid()))
$function$;

comment on function public.aktuelle_mandant_id() is
  'Welchen Mandanten der Angemeldete SIEHT. Normalerweise seinen eigenen; '
  'waehrend einer Support-Sitzung den, um den es geht.';

-- Was der Angemeldete SCHREIBEN darf. Das ist der Unterschied: eine
-- Support-Sitzung ist standardmaessig nur zum Lesen da. Erst wenn sie
-- ausdruecklich mit `schreiben` angelegt wurde, faellt diese Grenze — und
-- das steht dann genauso im Protokoll.
create or replace function public.mandant_id_schreiben()
 returns uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select s.mandant_id from public.support_sitzung() s where s.schreiben),
    (select p.mandant_id from public.profiles p where p.id = auth.uid()))
$function$;

comment on function public.mandant_id_schreiben() is
  'Welchen Mandanten der Angemeldete SCHREIBEN darf. Fuer jeden normalen '
  'Nutzer dasselbe wie aktuelle_mandant_id(); eine Support-Sitzung ohne '
  '`schreiben` sieht, aendert aber nichts.';

-- ---------------------------------------------------------------------------
-- 3. Die restriktiven Richtlinien auf die Schreib-Funktion umstellen
-- ---------------------------------------------------------------------------
-- Generisch über pg_policies statt über eine Liste von Tabellennamen: die
-- Liste waere am Tag ihrer Entstehung vollstaendig und danach nie wieder.
-- Angefasst wird nur, was wirklich `with check (… aktuelle_mandant_id())`
-- traegt; alles andere bleibt, wie es ist.
do $$
declare r record; n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname in ('public')
       and permissive = 'RESTRICTIVE'
       and with_check like '%aktuelle_mandant_id%'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    execute format(
      'create policy %I on %I.%I as restrictive for all to public using (%s) with check (%s)',
      r.policyname, r.schemaname, r.tablename,
      r.qual,
      replace(r.with_check, 'aktuelle_mandant_id()', 'mandant_id_schreiben()'));
    n := n + 1;
  end loop;
  raise notice 'fork_54: % restriktive Richtlinien auf mandant_id_schreiben() umgestellt', n;
end $$;

-- ---------------------------------------------------------------------------
-- 3a. Loeschen ist kein Lesen
-- ---------------------------------------------------------------------------
-- `with check` gilt fuer INSERT und UPDATE — fuer DELETE gibt es keines.
-- Ein Loeschvorgang wird allein ueber `using` entschieden, und das zeigt
-- waehrend einer Sitzung auf den fremden Mandanten. Eine Lese-Sitzung haette
-- also alles loeschen koennen, was sie sehen darf. Gefunden hat das
-- tests/supportzugriff.sql beim zweiten Lauf — vorher sah die Trennung
-- vollstaendig aus.
--
-- Deshalb je Tabelle eine zweite restriktive Richtlinie, die NUR fuer DELETE
-- gilt und auf die Schreib-Funktion zeigt. Fuer jeden normalen Nutzer ist
-- sie wirkungslos (beide Funktionen liefern denselben Wert); sie trifft
-- ausschliesslich die Lese-Sitzung.
do $$
declare r record; n int := 0;
begin
  for r in
    select distinct schemaname, tablename
      from pg_policies
     where schemaname = 'public'
       and permissive = 'RESTRICTIVE'
       and with_check like '%mandant_id_schreiben%'
  loop
    execute format('drop policy if exists "mandant_trennung_loeschen" on %I.%I',
                   r.schemaname, r.tablename);
    execute format(
      'create policy "mandant_trennung_loeschen" on %I.%I '
      'as restrictive for delete to public '
      'using (mandant_id = public.mandant_id_schreiben())',
      r.schemaname, r.tablename);
    n := n + 1;
  end loop;
  raise notice 'fork_54: % Loeschsperren gesetzt', n;
end $$;

-- ---------------------------------------------------------------------------
-- 3b. Die eigene Profilzeile bleibt immer sichtbar
-- ---------------------------------------------------------------------------
-- Ohne das funktioniert der Supportzugriff nicht, und zwar auf eine Weise,
-- die man nicht errät: `aktuelle_mandant_id()` zeigt während der Sitzung auf
-- den fremden Mandanten, also fällt die EIGENE Profilzeile aus der Sicht.
-- Und fast jede freigebende Richtlinie der Vorlage fragt nach der eigenen
-- Rolle — „existiert ein profiles-Eintrag mit meiner Kennung und der Rolle
-- chef oder mitarbeiter". Diese Frage wird dann mit Nein beantwortet, und
-- der Administrator sieht: nichts. Gefunden hat das tests/supportzugriff.sql
-- beim ersten Lauf.
--
-- Die Zeile, die jemand ohnehin kennt, immer sehen zu dürfen, nimmt der
-- Trennung nichts. Alles andere bleibt, wie es war.
drop policy if exists "profiles_mandant_trennung" on public.profiles;
create policy "profiles_mandant_trennung" on public.profiles
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id() or id = auth.uid())
  with check (mandant_id = public.mandant_id_schreiben());

-- Und die Loeschsperre auch hier noch einmal: der Block oben hat sie
-- gesetzt, bevor diese Richtlinie neu entstand. Sie steht unabhaengig
-- davon, aber zweimal gesetzt ist besser als einmal vergessen.
drop policy if exists "mandant_trennung_loeschen" on public.profiles;
create policy "mandant_trennung_loeschen" on public.profiles
  as restrictive for delete to public
  using (mandant_id = public.mandant_id_schreiben());

-- ---------------------------------------------------------------------------
-- 4. Zwei Schalter, die der Betreiber braucht
-- ---------------------------------------------------------------------------
insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('registrierung_offen', 'true'::jsonb,
   'Darf sich jemand selbst eine Firma anlegen? Auf false nimmt die '
   'Anmeldeseite keine neuen Firmen mehr an; bestehende Mandanten merken '
   'nichts davon.'),
  ('support_dauer_minuten', '60'::jsonb,
   'Wie lange eine Support-Sitzung gilt, in Minuten. Die Datenbank laesst '
   'hoechstens 240 zu.')
on conflict (schluessel) do nothing;

-- Die Selbstregistrierung respektiert den Schalter. Bisher nahm sie jeden an.
create or replace function public.registrierung_offen()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((select wert::text::boolean from public.plattform_werte
                    where schluessel = 'registrierung_offen'), true)
$function$;
