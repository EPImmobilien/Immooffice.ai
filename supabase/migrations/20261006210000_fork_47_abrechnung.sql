-- ===========================================================================
-- fork_47 — Tarife, Abos, Credits
--
-- Auftrag des Betreibers vom 06.10.2026: Tarife, Testphase, Mindestlaufzeit,
-- Zusatznutzer, KI-Credits, Gründerpreis, Stripe — ausschließlich im
-- Testmodus. Die vollständige Beschreibung steht in docs/BILLING.md.
--
-- ---------------------------------------------------------------------------
-- ZWEI BEGRIFFE, DIE NICHT VERWECHSELT WERDEN DÜRFEN
-- ---------------------------------------------------------------------------
-- Der Auftrag spricht von „Mandantentrennung per firma_id". Im Haus heißt
-- die Mandantenkennung seit fork_05 `mandant_id`; `firma_id` ist etwas
-- anderes — der STANDORT innerhalb eines Mandanten (firma_stammdaten).
-- Eine Abrechnung je Standort wäre falsch: ein Makler mit drei Büros hat
-- einen Vertrag, nicht drei. Alles hier hängt deshalb an `mandant_id`, und
-- die restriktive Richtlinie `mandant_trennung` ist dieselbe wie überall.
--
-- ---------------------------------------------------------------------------
-- WAS ES SCHON GAB
-- ---------------------------------------------------------------------------
-- `mandanten` trägt bereits `abo_status`, `testphase_bis`, `gesperrt_am` und
-- `gesperrt_grund`. Darauf wird aufgebaut, nichts davon wird ersetzt. Neu ist
-- alles, was einen Vertrag, einen Preis oder ein Guthaben beschreibt.
--
-- ---------------------------------------------------------------------------
-- DREI SÄTZE, DIE DAS GANZE TRAGEN
-- ---------------------------------------------------------------------------
-- 1. **Kein Preis steht im Code.** Tarife, Credit-Kosten und Pakete stehen in
--    Tabellen und sind im Plattform-Admin änderbar (CLAUDE.md: „Alle Preise,
--    Limits und Credit-Werte über den Plattform-Admin konfigurierbar —
--    nicht an vielen Stellen im Code verdrahtet").
-- 2. **Dem Frontend wird kein Abo-Status geglaubt.** Maßgeblich ist, was der
--    Stripe-Webhook in `mandant_abo` geschrieben hat. Die Oberfläche liest
--    diesen Stand; schreiben darf sie ihn nicht.
-- 3. **Das Ledger ist append-only.** `credit_buchungen` kennt genau einen
--    erlaubten Übergang — `reserviert` → `gebucht` oder `freigegeben` —, und
--    ein Trigger erzwingt ihn. Löschen kann niemand, auch der Chef nicht.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Plattform-Administratoren
-- ---------------------------------------------------------------------------
-- CLAUDE.md: „Rollenmodell: das der Vorlage, unverändert übernommen … keine
-- neuen Rollen." Deshalb kein Rollenwert `plattform_admin` in `profiles`,
-- sondern eine eigene Liste. Und: „Plattform-Administratoren erhalten keinen
-- automatischen Zugriff auf Mandantendaten" — diese Liste öffnet AUSSCHLIESSLICH
-- die Plattform-Tabellen (Tarife, Preise), nie fachliche Daten eines Mandanten.
create table if not exists public.plattform_admins (
  benutzer_id   uuid primary key references public.profiles(id) on delete cascade,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);

comment on table public.plattform_admins is
  'Wer die Tarife und Credit-Preise der Plattform pflegen darf. Öffnet KEINE '
  'Mandantendaten — nur die Plattform-Tabellen.';

alter table public.plattform_admins enable row level security;

create or replace function public.ist_plattform_admin()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.plattform_admins a where a.benutzer_id = auth.uid());
$function$;

comment on function public.ist_plattform_admin() is
  'Darf der Angemeldete die Plattform-Tabellen pflegen? Security Definer, '
  'damit die Prüfung nicht an der Richtlinie der Tabelle selbst scheitert.';

drop policy if exists "plattform_admins_lesen" on public.plattform_admins;
create policy "plattform_admins_lesen" on public.plattform_admins
  for select to authenticated using (benutzer_id = auth.uid() or public.ist_plattform_admin());

-- ---------------------------------------------------------------------------
-- 1. Der Katalog: Tarife
-- ---------------------------------------------------------------------------
create table if not exists public.plattform_tarife (
  schluessel          text primary key,
  name                text not null,
  sortierung          integer not null default 0,
  aktiv               boolean not null default true,
  -- Zusatznutzer ist kein Tarif, sondern eine Position IM Abo. Dasselbe
  -- Regal, weil Preis, Produkt und Stripe-Kennungen dieselbe Form haben.
  ist_zusatznutzer    boolean not null default false,
  empfohlen           boolean not null default false,
  -- Netto, in Cent. Cent, weil Geld nie als Fließkomma gerechnet wird;
  -- netto, weil CLAUDE.md es verlangt („Preise sind Nettopreise zzgl. USt.").
  preis_monat_cent    integer not null,
  preis_jahr_cent     integer not null,
  inkl_nutzer         integer not null default 0,
  credits_monat       integer not null default 0,
  merkmale            jsonb not null default '[]'::jsonb,
  hinweis             text,
  stripe_product_id       text,
  stripe_price_monat_id   text,
  stripe_price_jahr_id    text,
  geaendert_am        timestamptz not null default now(),
  geaendert_von       uuid references public.profiles(id) on delete set null,
  constraint plattform_tarife_preise_check
    check (preis_monat_cent >= 0 and preis_jahr_cent >= 0),
  constraint plattform_tarife_nutzer_check check (inkl_nutzer >= 0),
  constraint plattform_tarife_credits_check check (credits_monat >= 0)
);

comment on table public.plattform_tarife is
  'Der Tarifkatalog der Plattform. Kein Preis steht im Code — weder in der '
  'Oberfläche noch in einer Edge Function.';
comment on column public.plattform_tarife.preis_monat_cent is
  'Netto in Cent. Der Jahrespreis ist im Katalog gepflegt, nicht gerechnet: '
  '„elf Monatsbeiträge" ist eine Preisentscheidung, keine Formel.';

-- ---------------------------------------------------------------------------
-- 2. Der Katalog: was eine KI-Aktion kostet
-- ---------------------------------------------------------------------------
create table if not exists public.plattform_credit_preise (
  aktion        text primary key,
  name          text not null,
  credits       integer not null,
  beschreibung  text,
  sortierung    integer not null default 0,
  aktiv         boolean not null default true,
  geaendert_am  timestamptz not null default now(),
  constraint plattform_credit_preise_credits_check check (credits >= 0)
);

comment on table public.plattform_credit_preise is
  'Was eine Aktion an Credits kostet. 0 ist ausdrücklich erlaubt und bedeutet '
  'kostenfrei — CLAUDE.md: PDF-Export bestehender Inhalte, Web-Exposé ohne '
  'neue KI-Erstellung, manuelle Bearbeitung und erneute Downloads kosten nichts.';

-- ---------------------------------------------------------------------------
-- 3. Der Katalog: Credit-Pakete zum Nachkaufen
-- ---------------------------------------------------------------------------
create table if not exists public.plattform_credit_pakete (
  schluessel      text primary key,
  name            text not null,
  credits         integer not null,
  preis_cent      integer not null,
  gueltig_monate  integer not null default 12,
  sortierung      integer not null default 0,
  aktiv           boolean not null default true,
  stripe_price_id text,
  geaendert_am    timestamptz not null default now(),
  constraint plattform_credit_pakete_check
    check (credits > 0 and preis_cent >= 0 and gueltig_monate > 0)
);

-- ---------------------------------------------------------------------------
-- 4. Die Stellschrauben der Plattform
-- ---------------------------------------------------------------------------
create table if not exists public.plattform_werte (
  schluessel    text primary key,
  wert          jsonb not null,
  beschreibung  text,
  geaendert_am  timestamptz not null default now()
);

comment on table public.plattform_werte is
  'Testdauer, Mindestlaufzeit, Nachlauffristen, Gründerplätze. Alles, was '
  'sonst als Zahl im Code stünde und beim nächsten Mal an zwei Stellen '
  'geändert werden müsste.';

-- ---------------------------------------------------------------------------
-- 5. Das Abo eines Mandanten — der maßgebliche Stand
-- ---------------------------------------------------------------------------
-- Was hier steht, hat der Webhook geschrieben. Die Oberfläche liest es; sie
-- schreibt es nie. „Abo-Status niemals allein dem Frontend glauben"
-- (CLAUDE.md) ist hier kein Grundsatz, sondern eine Richtlinie: es gibt für
-- Angemeldete keine Schreibrichtlinie auf dieser Tabelle.
create table if not exists public.mandant_abo (
  mandant_id              uuid primary key references public.mandanten(id) on delete cascade,
  tarif                   text references public.plattform_tarife(schluessel) on delete restrict,
  intervall               text not null default 'monat',
  -- test          — Testphase läuft
  -- aktiv         — bezahlt
  -- zahlung_offen — Zahlung gescheitert, Stripe versucht es noch
  -- gekuendigt    — läuft bis cancel_at weiter
  -- abgelaufen    — Testphase vorbei oder Abo beendet; Lesezugriff läuft
  -- inaktiv       — auch der Lesezugriff ist abgelaufen
  status                  text not null default 'test',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  periode_von             timestamptz,
  periode_bis             timestamptz,
  -- Sechs Monate ab der ersten bezahlten Periode. Eine Kündigung wirkt
  -- frühestens hierzu — siehe docs/BILLING.md.
  mindestlaufzeit_bis     timestamptz,
  gekuendigt_am           timestamptz,
  cancel_at               timestamptz,
  zusatznutzer            integer not null default 0,
  gruenderpreis           boolean not null default false,
  gruender_nummer         integer,
  zahlung_fehler_seit     timestamptz,
  -- Nach Testende oder Sperre bleibt das Lesen eine Weile möglich. Erst
  -- danach wird der Mandant inaktiv. Gelöscht wird nie ohne eigenen Vorgang.
  lesezugriff_bis         timestamptz,
  erstellt_am             timestamptz not null default now(),
  geaendert_am            timestamptz not null default now(),
  constraint mandant_abo_status_check
    check (status in ('test','aktiv','zahlung_offen','gekuendigt','abgelaufen','inaktiv')),
  constraint mandant_abo_intervall_check check (intervall in ('monat','jahr')),
  constraint mandant_abo_zusatznutzer_check check (zusatznutzer >= 0),
  constraint mandant_abo_gruender_nummer_check
    check (gruender_nummer is null or gruender_nummer > 0)
);

create unique index if not exists mandant_abo_gruender_nummer_idx
  on public.mandant_abo (gruender_nummer) where gruender_nummer is not null;
create unique index if not exists mandant_abo_subscription_idx
  on public.mandant_abo (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists mandant_abo_mandant_idx on public.mandant_abo (mandant_id);
create index if not exists mandant_abo_status_idx on public.mandant_abo (status);

comment on table public.mandant_abo is
  'Der maßgebliche Abo-Stand je Mandant, geschrieben vom Stripe-Webhook. '
  'Für Angemeldete gibt es bewusst KEINE Schreibrichtlinie.';

-- ---------------------------------------------------------------------------
-- 6. Credit-Konten — die Töpfe
-- ---------------------------------------------------------------------------
-- Ein Topf je Herkunft und Gültigkeit. Getrennt, weil sie verschieden lange
-- leben: Tarif-Credits verfallen am Periodenende, gekaufte nach zwölf
-- Monaten. Ein einziger Saldo könnte das nicht abbilden.
create table if not exists public.credit_konten (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  -- test | tarif | paket | gutschrift
  quelle         text not null,
  credits        integer not null,
  verbraucht     integer not null default 0,
  gueltig_von    timestamptz not null default now(),
  gueltig_bis    timestamptz,
  referenz       text,
  erstellt_am    timestamptz not null default now(),
  constraint credit_konten_quelle_check check (quelle in ('test','tarif','paket','gutschrift')),
  constraint credit_konten_mengen_check
    check (credits >= 0 and verbraucht >= 0 and verbraucht <= credits)
);

create index if not exists credit_konten_mandant_idx on public.credit_konten (mandant_id);
-- Die Verbrauchsreihenfolge fragt genau so: offene Töpfe dieses Mandanten,
-- Tarif vor Paket, ältester zuerst.
create index if not exists credit_konten_verbrauch_idx
  on public.credit_konten (mandant_id, quelle, gueltig_bis)
  where verbraucht < credits;

comment on column public.credit_konten.verbraucht is
  'Enthält auch RESERVIERTE Credits. Erst dadurch kann kein zweiter Aufruf '
  'denselben Rest noch einmal vergeben; die Freigabe bucht zurück.';

-- ---------------------------------------------------------------------------
-- 7. Das Ledger
-- ---------------------------------------------------------------------------
create table if not exists public.credit_buchungen (
  id              uuid primary key default gen_random_uuid(),
  -- Eine Reservierung kann mehrere Töpfe berühren: zwei Credits aus dem
  -- Tarif, drei aus dem gekauften Paket. Dann entstehen zwei Zeilen, und
  -- `vorgang_id` hält sie zusammen. Eine Zeile mit einer Aufteilung im
  -- JSON-Feld wäre kürzer, aber dann stünde die Herkunft nicht mehr je
  -- Buchung da — und genau danach fragt die Nachkalkulation.
  vorgang_id      uuid not null default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  nutzer_id       uuid references public.profiles(id) on delete set null,
  aktion          text not null,
  credits         integer not null,
  quelle          text,
  konto_id        uuid references public.credit_konten(id) on delete set null,
  -- reserviert | gebucht | freigegeben | erstattet
  status          text not null default 'reserviert',
  -- Was der KI-Anbieter für diesen Aufruf wirklich gekostet hat. Ohne diese
  -- Zahl ist jede spätere Preisänderung geraten.
  ki_kosten_eur   numeric(12,6),
  referenz        text,
  notiz           text,
  zeitpunkt       timestamptz not null default now(),
  abgeschlossen_am timestamptz,
  constraint credit_buchungen_status_check
    check (status in ('reserviert','gebucht','freigegeben','erstattet')),
  constraint credit_buchungen_credits_check check (credits >= 0)
);

create index if not exists credit_buchungen_mandant_idx on public.credit_buchungen (mandant_id);
create index if not exists credit_buchungen_zeit_idx
  on public.credit_buchungen (mandant_id, zeitpunkt desc);
create index if not exists credit_buchungen_offen_idx
  on public.credit_buchungen (mandant_id) where status = 'reserviert';
create index if not exists credit_buchungen_vorgang_idx
  on public.credit_buchungen (vorgang_id);

comment on table public.credit_buchungen is
  'Unveränderliches Ledger. Eine Zeile entsteht beim Reservieren und ändert '
  'danach nur noch einmal ihren Status. Mehr lässt der Trigger nicht zu.';

-- Unveränderlich heißt: nichts wird umgeschrieben und nichts gelöscht. Genau
-- ein Übergang ist erlaubt, und nur dieser eine.
create or replace function public.credit_buchung_unveraenderlich()
 returns trigger
 language plpgsql
as $function$
begin
  if tg_op = 'DELETE' then
    -- Eine Ausnahme, und nur diese: wenn der Mandant selbst verschwindet,
    -- geht sein Ledger mit. Ohne sie liesse sich ein Mandant nie loeschen —
    -- die Kaskade von `mandanten` scheiterte hier, und „unveraenderlich"
    -- waere zu „unloeschbar" geworden. Beim Kaskadenlauf ist die Elternzeile
    -- bereits weg; genau daran erkennt man den Fall.
    if exists (select 1 from public.mandanten m where m.id = old.mandant_id) then
      raise exception 'Das Credit-Ledger wird nicht geloescht.' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status <> 'reserviert' then
    raise exception 'Eine abgeschlossene Buchung aendert sich nicht mehr (% -> %).',
      old.status, new.status using errcode = '42501';
  end if;
  if new.status not in ('gebucht','freigegeben') then
    raise exception 'Aus "reserviert" wird "gebucht" oder "freigegeben", nicht "%".',
      new.status using errcode = '42501';
  end if;
  -- Alles ausser Status, Kosten, Notiz und Abschlusszeit bleibt, wie es war.
  if new.vorgang_id is distinct from old.vorgang_id
     or new.mandant_id is distinct from old.mandant_id
     or new.nutzer_id is distinct from old.nutzer_id
     or new.aktion   is distinct from old.aktion
     or new.credits  is distinct from old.credits
     or new.quelle   is distinct from old.quelle
     or new.konto_id is distinct from old.konto_id
     or new.zeitpunkt is distinct from old.zeitpunkt then
    raise exception 'An einer Buchung aendert sich nur ihr Status.' using errcode = '42501';
  end if;
  new.abgeschlossen_am := coalesce(new.abgeschlossen_am, now());
  return new;
end
$function$;

drop trigger if exists credit_buchungen_unveraenderlich on public.credit_buchungen;
create trigger credit_buchungen_unveraenderlich
  before update or delete on public.credit_buchungen
  for each row execute function public.credit_buchung_unveraenderlich();

-- ---------------------------------------------------------------------------
-- 8. Stripe-Ereignisse — gegen Doppelbuchung
-- ---------------------------------------------------------------------------
-- Stripe stellt ein Ereignis mehrfach zu, wenn die Antwort ausbleibt. Ohne
-- diese Tabelle würde dieselbe Zahlung zweimal gutgeschrieben. Der
-- Primärschlüssel IST die Sperre: der zweite Einfügeversuch scheitert.
create table if not exists public.stripe_ereignisse (
  id             text primary key,
  typ            text not null,
  empfangen_am   timestamptz not null default now(),
  verarbeitet_am timestamptz,
  -- KEIN mandant_id: die Tabelle ist DIENST, nicht MANDANT. Ein Ereignis
  -- kann mehrere Mandanten betreffen, und eine Spalte, die nur manchmal
  -- gefüllt ist, lädt dazu ein, sie für eine Grenze zu halten. Welcher
  -- Mandant gemeint war, steht im Abo — über die Stripe-Kennung.
  fehler         text,
  nutzlast       jsonb
);

create index if not exists stripe_ereignisse_zeit_idx on public.stripe_ereignisse (empfangen_am desc);

comment on table public.stripe_ereignisse is
  'Jedes verarbeitete Stripe-Ereignis, einmal. Kein Lesezugriff für '
  'Angemeldete: die Nutzlast enthält Daten fremder Mandanten.';

-- ===========================================================================
-- Richtlinien
-- ===========================================================================
alter table public.plattform_tarife          enable row level security;
alter table public.plattform_credit_preise   enable row level security;
alter table public.plattform_credit_pakete   enable row level security;
alter table public.plattform_werte           enable row level security;
alter table public.mandant_abo               enable row level security;
alter table public.credit_konten             enable row level security;
alter table public.credit_buchungen          enable row level security;
alter table public.stripe_ereignisse         enable row level security;

-- Der Katalog ist für jeden Angemeldeten lesbar — es sind Preise, keine
-- Geheimnisse. Die öffentliche Preisseite liest sie über eine Edge Function
-- mit Dienstschlüssel, nicht direkt.
do $$
declare t text;
begin
  foreach t in array array['plattform_tarife','plattform_credit_preise',
                           'plattform_credit_pakete','plattform_werte']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_lesen', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   t || '_lesen', t);
    execute format('drop policy if exists %I on public.%I', t || '_pflegen', t);
    execute format('create policy %I on public.%I for all to authenticated '
                   || 'using (public.ist_plattform_admin()) '
                   || 'with check (public.ist_plattform_admin())',
                   t || '_pflegen', t);
  end loop;
end
$$;

-- Das Abo: lesen darf der Chef seines Mandanten. Schreiben darf niemand —
-- der Stand kommt vom Webhook, und der läuft mit dem Dienstschlüssel.
drop policy if exists "mandant_abo_lesen" on public.mandant_abo;
create policy "mandant_abo_lesen" on public.mandant_abo
  for select to authenticated
  using (coalesce(public.aktuelle_rolle(), '') = 'chef');

drop policy if exists "mandant_trennung" on public.mandant_abo;
create policy "mandant_trennung" on public.mandant_abo
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

-- Die Töpfe: lesen darf, wer im Haus ist — der Saldo steht in der Kopfzeile
-- und geht jeden an, der KI benutzt. Schreiben nur die Funktionen.
drop policy if exists "credit_konten_lesen" on public.credit_konten;
create policy "credit_konten_lesen" on public.credit_konten
  for select to authenticated using (true);

drop policy if exists "mandant_trennung" on public.credit_konten;
create policy "mandant_trennung" on public.credit_konten
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

-- Das Ledger: der Chef sieht alles seines Hauses, jeder andere seine eigenen
-- Buchungen. Geschrieben wird nur über die Funktionen weiter unten.
drop policy if exists "credit_buchungen_lesen" on public.credit_buchungen;
create policy "credit_buchungen_lesen" on public.credit_buchungen
  for select to authenticated
  using (coalesce(public.aktuelle_rolle(), '') = 'chef' or nutzer_id = auth.uid());

drop policy if exists "mandant_trennung" on public.credit_buchungen;
create policy "mandant_trennung" on public.credit_buchungen
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

-- stripe_ereignisse: keine einzige Richtlinie. Damit kommt ueber RLS
-- niemand heran — nur der Dienstschluessel, fuer den RLS nicht gilt.

alter table public.mandant_abo      alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.credit_konten    alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.credit_buchungen alter column mandant_id set default public.aktuelle_mandant_id();

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_admins',        'GLOBAL',  'Wer die Plattform-Tarife pflegen darf; kein Mandantenbezug'),
  ('plattform_tarife',        'GLOBAL',  'Tarifkatalog der Plattform — fuer alle Mandanten derselbe'),
  ('plattform_credit_preise', 'GLOBAL',  'Was eine KI-Aktion kostet — fuer alle Mandanten dasselbe'),
  ('plattform_credit_pakete', 'GLOBAL',  'Nachkauf-Pakete — fuer alle Mandanten dieselben'),
  ('plattform_werte',         'GLOBAL',  'Testdauer, Mindestlaufzeit, Gruenderplaetze'),
  ('mandant_abo',             'MANDANT', 'Abo-Stand je Mandant; geschrieben vom Stripe-Webhook'),
  ('credit_konten',           'MANDANT', 'Credit-Toepfe je Mandant'),
  ('credit_buchungen',        'MANDANT', 'Unveraenderliches Credit-Ledger je Mandant'),
  ('stripe_ereignisse',       'DIENST',  'Verarbeitete Stripe-Ereignisse. BEWUSST ohne Mandantenspalte '
                                         'und ohne Lesezugriff: ein Ereignis kann mehrere Mandanten '
                                         'betreffen, und die Nutzlast enthaelt fremde Daten')
on conflict (tabelle) do nothing;

-- ===========================================================================
-- Der Katalog, gefüllt
-- ===========================================================================
-- Alle Preise netto, in Cent. Der Jahrespreis ist elf Monatsbeiträge — als
-- Zahl gepflegt und nicht gerechnet, weil das eine Preisentscheidung ist.
insert into public.plattform_tarife
  (schluessel, name, sortierung, ist_zusatznutzer, empfohlen,
   preis_monat_cent, preis_jahr_cent, inkl_nutzer, credits_monat, merkmale, hinweis)
values
  ('starter', 'Starter', 1, false, false, 4999, 54989, 1, 500,
   '["Objekte, Exposés und Portale","Ein Postfach anbinden","KI-Texte und Exposé-Vorlagen","Eigentümer-Portal"]'::jsonb,
   'Für Einzelmakler'),
  ('professional', 'Professional', 2, false, true, 12999, 142989, 3, 1500,
   '["Alles aus Starter","Bis zu drei Nutzer","Akquise, Pipeline und Automationen","Verträge, Nachweise und Bewertung","Rechnungen und Liquidität"]'::jsonb,
   'Für kleine Büros'),
  ('business', 'Business', 3, false, false, 29999, 329989, 8, 3000,
   '["Alles aus Professional","Bis zu acht Nutzer","Mehrere Standorte und Gesellschaften","Arbeitszeit und Team-Verwaltung","Vorrangiger Support"]'::jsonb,
   'Für Teams'),
  ('zusatznutzer', 'Zusatznutzer', 10, true, false, 2999, 32989, 1, 0,
   '["Ein weiterer Nutzer im selben Abo","Beliebig oft buchbar"]'::jsonb,
   'Zubuchbar zu jedem Tarif')
on conflict (schluessel) do nothing;

insert into public.plattform_credit_preise (aktion, name, credits, beschreibung, sortierung) values
  ('ki_text',            'Einzelner KI-Text / Variante',        2,  'Eine Überschrift, ein Absatz, eine Variante', 1),
  ('expose_text',        'Vollständiger Exposé-Text',          10,  'Alle Textbausteine eines Exposés auf einmal', 2),
  ('social_paket',       'Social-Media-/Marketing-Paket',       5,  'Texte für mehrere Kanäle aus einem Objekt', 3),
  ('bild_optimieren',    'Einfache KI-Bildoptimierung',        10,  'Licht, Farbe, Entrauschen', 4),
  ('bild_homestaging',   'Homestaging / umfangreiche Bildbearbeitung', 30, 'Möblierung, Entrümpelung, Umbau der Szene', 5),
  ('grundriss_visual',   'Grundrissvisualisierung',            30,  'Aus dem Grundriss wird eine Ansicht', 6),
  ('signatur_vorgang',   'E-Signatur-Vorgang je Paket',         5,  'Ein Vorgang mit allen Empfängern', 7),
  ('expose_pruefer',     'Exposé-Prüfer',                       2,  'Prüft ein Exposé auf Pflichtangaben', 8),
  ('pdf_export',         'PDF-Export bestehender Inhalte',      0,  'Kostenfrei — es entsteht nichts Neues', 20),
  ('web_expose',         'Web-Exposé ohne neue KI',             0,  'Kostenfrei — es entsteht nichts Neues', 21),
  ('erneuter_download',  'Erneuter Download',                   0,  'Kostenfrei', 22)
on conflict (aktion) do nothing;

insert into public.plattform_credit_pakete (schluessel, name, credits, preis_cent, gueltig_monate, sortierung) values
  ('paket_250',  '250 Credits',    250,   999, 12, 1),
  ('paket_1000', '1.000 Credits', 1000,  2999, 12, 2),
  ('paket_3000', '3.000 Credits', 3000,  6999, 12, 3)
on conflict (schluessel) do nothing;

insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('testphase_tage',        '28'::jsonb,    'Tage kostenlos ab Registrierung, voller Funktionsumfang Starter'),
  ('testphase_credits',     '300'::jsonb,   'Einmalige Credits für die Testphase'),
  ('mindestlaufzeit_monate','6'::jsonb,     'Ab der ersten bezahlten Periode; das Jahresabo deckt sie ohnehin'),
  ('lesezugriff_tage',      '30'::jsonb,    'Nach Testende oder Sperre bleibt das Lesen so lange möglich'),
  ('zahlung_frist_tage',    '14'::jsonb,    'Nach einer gescheiterten Zahlung bis zur Sperre'),
  ('gruender_plaetze',      '50'::jsonb,    'So viele zahlende Kunden bekommen den Gründerpreis'),
  ('gruender_rabatt_cent',  '1000'::jsonb,  'Monatlicher Abschlag auf Starter, netto in Cent'),
  ('gruender_tarif',        '"starter"'::jsonb, 'Nur auf diesen Tarif'),
  ('ust_satz',              '19'::jsonb,    'Umsatzsteuersatz in Prozent, für die Anzeige'),
  ('warnung_rest_prozent',  '10'::jsonb,    'Ab diesem Restanteil wird vor leerem Konto gewarnt')
on conflict (schluessel) do nothing;
