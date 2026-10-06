-- ===========================================================================
-- fork_44 — Postfächer je Anbieter: Microsoft, Google, IMAP
--
-- Ansage des Betreibers vom 06.10.2026: „mir ging es darum, dass die Kunden
-- mehrere Postfächer anbinden können, sei es jetzt Microsoft oder Gmail oder
-- whatever, was sie halt nutzen an Plattformen."
--
-- MEHRERE Postfächer konnte die Vorlage schon: mail_postfaecher hängt an
-- benutzer_id, mit Reihenfolge und einem Standard. Was fehlt, ist die
-- ANMELDUNG. Die Tabelle kennt nur Server, Benutzer und Passwort — und
-- genau das nehmen die beiden größten Anbieter nicht mehr an:
--
--   * Microsoft 365 hat die Passwort-Anmeldung (Basic Auth) für IMAP und
--     SMTP abgeschaltet. Ein Exchange-Online-Postfach lässt sich nur noch
--     über OAuth2 anbinden.
--   * Google verlangt für IMAP/SMTP entweder ein App-Passwort (nur mit
--     Zwei-Faktor, und auch das baut Google ab) oder OAuth2.
--
-- Also bekommt jedes Postfach einen ANBIETER. "imap" ist der bisherige Weg
-- und bleibt die Vorgabe — ein eingerichtetes Postfach ändert sich dadurch
-- nicht. "microsoft" und "google" halten statt eines Passworts ein
-- Erneuerungs-Token, verschlüsselt wie das Passwort (AES-GCM mit
-- MAIL_SECRET_KEY, Format v1.<iv>.<ct>).
--
-- Der Abruf selbst bleibt IMAP und der Versand SMTP — bei allen drei
-- Anbietern. Nur die Anmeldung wechselt von LOGIN auf XOAUTH2. Das ist
-- Absicht: der Abruf (mail-postfach-pull, 870 Zeilen: Ordner, Flags,
-- Anhänge, Rückstände) bleibt EIN Weg für alle Anbieter. Eine zweite
-- Fassung über Microsoft Graph und eine dritte über die Gmail-API wären
-- drei Wege, die auseinanderlaufen.
--
-- Was diese Migration NICHT tut: Zugangsdaten ablegen. Die Anwendungs-IDs
-- der Plattform (MICROSOFT_CLIENT_ID, GOOGLE_CLIENT_ID samt Geheimnis)
-- stehen in der Umgebung der Edge Functions, dokumentiert in .env.example.
-- ===========================================================================

-- --- Der Anbieter am Postfach ---------------------------------------------
alter table public.mail_postfaecher
  add column if not exists anbieter text not null default 'imap',
  add column if not exists oauth_konto text,
  add column if not exists oauth_refresh_verschluesselt text,
  add column if not exists oauth_zugriff_verschluesselt text,
  add column if not exists oauth_gueltig_bis timestamptz,
  add column if not exists oauth_bereiche text,
  add column if not exists oauth_verbunden_am timestamptz,
  add column if not exists oauth_fehler text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mail_postfaecher_anbieter_check'
  ) then
    alter table public.mail_postfaecher
      add constraint mail_postfaecher_anbieter_check
      check (anbieter in ('imap', 'microsoft', 'google'));
  end if;
end $$;

comment on column public.mail_postfaecher.anbieter is
  'Wie sich dieses Postfach anmeldet: imap = Benutzer und Passwort (der '
  'bisherige Weg), microsoft/google = OAuth2 mit XOAUTH2. Abruf und Versand '
  'bleiben in allen drei Fällen IMAP und SMTP.';
comment on column public.mail_postfaecher.oauth_konto is
  'Die Adresse, die der Anbieter für dieses Konto nennt. Weicht sie von '
  'email_adresse ab, wurde ein anderes Konto verbunden als gedacht.';
comment on column public.mail_postfaecher.oauth_refresh_verschluesselt is
  'Erneuerungs-Token, AES-GCM mit MAIL_SECRET_KEY (Format v1.<iv>.<ct>) — '
  'dasselbe Verfahren wie beim Passwort. Es ist der Zugang zum Postfach: '
  'wer ihn hat, liest die Post. Er verlässt die Funktionen nie.';
comment on column public.mail_postfaecher.oauth_gueltig_bis is
  'Bis wann das Zugriffs-Token gilt. Danach holt der Abruf ein neues; '
  'scheitert das, steht der Grund in oauth_fehler und das Postfach meldet '
  'sich in der Oberfläche als „Verbindung erneuern".';

-- --- Der angefangene Verbindungsvorgang -----------------------------------
-- Zwischen „Verbinden" und der Rückleitung des Anbieters liegt ein
-- Seitenwechsel. Was der Anbieter zurückbringt, ist ein Code und ein
-- Zustand (state) — und der Zustand ist das Einzige, woran der öffentliche
-- Rückruf erkennt, WER verbinden wollte. Deshalb steht er in der Datenbank
-- und nicht im Browser: ein Zustand, den der Aufrufer selbst mitbringt,
-- bindet keinen Mandanten.
--
-- Einmalig: verbraucht_am wird beim Einlösen gesetzt, und der Rückruf
-- nimmt nur Zeilen, bei denen es null ist. Damit ist ein abgefangener
-- Rückruf nach dem ersten Gebrauch wertlos.
create table if not exists public.mail_oauth_vorgaenge (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid references public.mandanten(id) on delete cascade,
  benutzer_id   uuid not null references public.profiles(id) on delete cascade,
  anbieter      text not null,
  zustand       text not null unique,
  postfach_id   uuid references public.mail_postfaecher(id) on delete set null,
  weiter_zu     text,
  erstellt_am   timestamptz not null default now(),
  verbraucht_am timestamptz,
  constraint mail_oauth_vorgaenge_anbieter_check
    check (anbieter in ('microsoft', 'google'))
);

create index if not exists mail_oauth_vorgaenge_offen_idx
  on public.mail_oauth_vorgaenge (erstellt_am) where verbraucht_am is null;

-- Jede Tabelle der Gruppe MANDANT bekommt einen Index auf mandant_id
-- (tests/mandant-einstufung.sql besteht darauf): die RLS-Richtlinie
-- filtert bei JEDEM Zugriff darauf, und ein Filter ohne Index ist ein
-- vollstaendiger Durchlauf.
create index if not exists mail_oauth_vorgaenge_mandant_idx
  on public.mail_oauth_vorgaenge (mandant_id);

comment on table public.mail_oauth_vorgaenge is
  'Angefangene Postfach-Verbindungen. Eine Zeile lebt zehn Minuten und '
  'wird einmal eingelöst; der öffentliche Rückruf erkennt an ihr, welcher '
  'Nutzer und welcher Mandant verbinden wollte.';

alter table public.mail_oauth_vorgaenge enable row level security;

-- Der Nutzer sieht und startet nur seine eigenen Vorgänge. Eingelöst wird
-- vom Rückruf, und der läuft mit dem Dienstschlüssel — er muss den Vorgang
-- finden können, bevor ein Nutzer angemeldet ist.
drop policy if exists "mail_oauth_vorgaenge_eigene" on public.mail_oauth_vorgaenge;
create policy "mail_oauth_vorgaenge_eigene" on public.mail_oauth_vorgaenge
  for all to authenticated
  using (benutzer_id = auth.uid())
  with check (benutzer_id = auth.uid());

drop policy if exists "mandant_trennung" on public.mail_oauth_vorgaenge;
create policy "mandant_trennung" on public.mail_oauth_vorgaenge
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

alter table public.mail_oauth_vorgaenge
  alter column mandant_id set default public.aktuelle_mandant_id();

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('mail_oauth_vorgaenge', 'MANDANT',
        'Angefangene Postfach-Verbindungen eines Nutzers; hält kurzlebig den Zustand des OAuth-Vorgangs')
on conflict (tabelle) do nothing;

-- --- Aufräumen -------------------------------------------------------------
-- Ein Vorgang, den niemand einlöst (Nutzer bricht beim Anbieter ab), bleibt
-- sonst für immer liegen. Zehn Minuten sind die Lebensdauer; der Aufräumer
-- löscht alles, was älter als eine Stunde ist, und läuft bei jedem Start
-- eines neuen Vorgangs mit.
create or replace function public.mail_oauth_aufraeumen()
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  delete from public.mail_oauth_vorgaenge
   where erstellt_am < now() - interval '1 hour';
$function$;

comment on function public.mail_oauth_aufraeumen() is
  'Löscht abgelaufene Postfach-Verbindungsvorgänge. Wird beim Start eines '
  'neuen Vorgangs mitgerufen — ein eigener Cron-Job für sechs Zeilen je Tag '
  'wäre ein Job zu viel.';
