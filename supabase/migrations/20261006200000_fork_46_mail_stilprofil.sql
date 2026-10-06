-- ===========================================================================
-- fork_46 — Schreibstil aus den eigenen Mails, mit Einwilligung
--
-- Ansage des Betreibers vom 06.10.2026: „wir geben unseren Kunden die
-- Möglichkeit, dass wir die letzten 20, 30 versendeten Mails analysieren, um
-- den spezifischen Schreibstil rauszufinden — das aber wirklich nur unter
-- der Prämisse, dass die Kunden dem zustimmen, und da musst du
-- datenschutztechnisch das bitte prüfen."
--
-- ---------------------------------------------------------------------------
-- WARUM DAS NICHT NUR EIN WUNSCH, SONDERN EINE NOTWENDIGKEIT IST
-- ---------------------------------------------------------------------------
-- In mail-ki-vorschlag stand bis heute ein fest verdrahtetes Stilprofil —
-- und zwar das EINER BESTIMMTEN PERSON des Referenzunternehmens: ihr
-- Vorname an fünf Stellen, ihre Mobilnummer, der Name eines echten
-- Geschäftspartners, ihre Lieblingswendungen. Jeder Mandant hätte in ihrem
-- Stil geschrieben, mit ihrer Telefonnummer im Beispiel.
--
-- Das verstößt gegen CLAUDE.md („an keiner Stelle … Ansprechpartner,
-- Telefonnummer, Beispieldaten"), und das Neutralitäts-Gate hat es nicht
-- gefunden, weil auf der Blockliste Firmennamen stehen und keine Vornamen.
-- Der gelernte Stil ersetzt es. Das ist kein Zusatz, das ist die Reparatur.
--
-- ---------------------------------------------------------------------------
-- DATENSCHUTZ — was hier Technik leistet und was nicht
-- ---------------------------------------------------------------------------
-- Ausführlich in docs/DATENSCHUTZ-STILANALYSE.md. Kurz, und ohne
-- Gewähr — eine Rechtsprüfung ersetzt das nicht:
--
--   * Verantwortlich ist der MANDANT für seine Postfächer, nicht die
--     Plattform. Die Plattform verarbeitet im Auftrag (Art. 28 DSGVO) und
--     braucht dafür einen Auftragsverarbeitungsvertrag.
--   * Versendete Mails enthalten personenbezogene Daten DRITTER (der
--     Empfänger). Sie für eine Stilanalyse zu lesen, ist ein anderer Zweck
--     als sie zu versenden (Art. 5 Abs. 1 lit. b).
--   * Deshalb: ausdrückliche, widerrufliche Einwilligung JE NUTZER, nicht
--     je Mandant. Der Chef kann sie nicht für seine Leute erteilen — im
--     Arbeitsverhältnis ist die Freiwilligkeit einer Einwilligung ohnehin
--     zweifelhaft (§ 26 BDSG), und eine Mitbestimmung des Betriebsrats
--     (§ 87 Abs. 1 Nr. 6 BetrVG) kann hinzukommen.
--   * Datenminimierung: an den KI-Anbieter gehen keine Klarnamen, Adressen,
--     Telefonnummern und Mailadressen, sondern geschwärzte Texte. Das
--     leistet die Funktion, nicht diese Tabelle.
--   * Gespeichert wird NUR das abgeleitete Profil, nie die Mails. Der
--     Widerruf löscht das Profil.
--
-- Was hier NICHT behauptet wird: dass die Verarbeitung damit zulässig IST.
-- Das hängt am Einsatz, und das entscheidet der Mandant.
-- ===========================================================================

create table if not exists public.mail_stilprofil (
  id                uuid primary key default gen_random_uuid(),
  mandant_id        uuid references public.mandanten(id) on delete cascade,
  benutzer_id       uuid not null references public.profiles(id) on delete cascade,

  -- Die Einwilligung. Gespeichert wird der Wortlaut, dem zugestimmt wurde —
  -- nicht nur ein Häkchen. Wer später fragt, worin genau eingewilligt
  -- wurde, bekommt sonst die heutige Fassung des Textes zu sehen und nicht
  -- die von damals (Art. 7 Abs. 1 DSGVO: Nachweis).
  einwilligung_am   timestamptz,
  einwilligung_text text,
  widerrufen_am     timestamptz,

  -- Das Erzeugnis. Kein Mailtext, nur die abgeleiteten Merkmale.
  profil_text       text,
  mails_ausgewertet integer,
  zeitraum_von      timestamptz,
  zeitraum_bis      timestamptz,
  gelernt_am        timestamptz,
  modell            text,
  fehler_text       text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Ein Profil je Nutzer. Zwei wären zwei Stile derselben Person.
  constraint mail_stilprofil_benutzer_eindeutig unique (benutzer_id)
);

create index if not exists mail_stilprofil_mandant_idx
  on public.mail_stilprofil (mandant_id);

comment on table public.mail_stilprofil is
  'Abgeleiteter Schreibstil je Nutzer für die KI-Antwortentwürfe, samt '
  'Einwilligung und Widerruf. Enthält KEINE Mailtexte — nur die Merkmale, '
  'die aus ihnen abgeleitet wurden.';
comment on column public.mail_stilprofil.einwilligung_text is
  'Der Wortlaut, dem zugestimmt wurde — nicht die heutige Fassung. '
  'Art. 7 Abs. 1 DSGVO verlangt den Nachweis der Einwilligung.';
comment on column public.mail_stilprofil.profil_text is
  'Das abgeleitete Stilprofil. Wird beim Widerruf geleert.';

alter table public.mail_stilprofil enable row level security;

-- Jeder sieht und ändert NUR sein eigenes Profil. Auch der Chef nicht das
-- seiner Leute: eine Einwilligung, die ein anderer erteilen oder widerrufen
-- kann, ist keine.
drop policy if exists "mail_stilprofil_eigenes" on public.mail_stilprofil;
create policy "mail_stilprofil_eigenes" on public.mail_stilprofil
  for all to authenticated
  using (benutzer_id = auth.uid())
  with check (benutzer_id = auth.uid());

drop policy if exists "mandant_trennung" on public.mail_stilprofil;
create policy "mandant_trennung" on public.mail_stilprofil
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

alter table public.mail_stilprofil
  alter column mandant_id set default public.aktuelle_mandant_id();

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('mail_stilprofil', 'MANDANT',
        'Schreibstil-Profil und Einwilligung je Nutzer eines Mandanten')
on conflict (tabelle) do nothing;
