-- ===========================================================================
-- fork_78 — Betreiberbereich, Schritt 9: KI-Steuerung, System-Mails,
--           Rechtstexte, Ankuendigungen
-- ===========================================================================
-- Auftrag Betreiber-Dashboard, Abschnitte 13–16. Vier Dinge, die der
-- Betreiber steuert, ohne Code anzufassen:
--
--   1. KI: je Funktion Anbieter/Modell/Temperatur/Max-Tokens, ein
--      Notschalter mit Hinweistext, ein Tageslimit je Mandant (Credits
--      und/oder Euro) — erzwungen in der Datenbank, am Ledger: ein
--      Trigger vor jeder Reservierung. Kostenalarm-Schwellen fuer Schritt 10.
--   2. System-Mails: Betreff und Text mit Platzhaltern {{firma.name}},
--      gerendert von der Datenbank; fehlt eine Zeile, nimmt die Funktion
--      ihren eingebauten Text.
--   3. Rechtstexte mit Version, Gueltig-ab und Zustimmungspflicht: der
--      chef muss beim naechsten Login zustimmen; Zustimmungen je Mandant.
--   4. Ankuendigungen an alle oder ausgewaehlte Mandanten (Tarif, Status,
--      einzeln), befristet, schliessbar oder nicht, Wartung mit Countdown.
--
-- RUECKNAHME: drop function meine_ankuendigungen, plattform_rechtstexte_stand,
-- rechtstexte_offen, system_mail_rendern, ki_schranke (cascade); drop table
-- ankuendigungen, rechtstext_zustimmungen, rechtstexte, system_mail_vorlagen,
-- mandant_ki_limits, plattform_ki_einstellungen; delete from plattform_werte
-- where schluessel like 'ki_tageslimit_%' or schluessel like 'alarm_%'.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. KI-Steuerung
-- ---------------------------------------------------------------------------
create table if not exists public.plattform_ki_einstellungen (
  funktion     text primary key,
  name         text not null,
  anbieter     text not null default 'anthropic' check (anbieter in ('anthropic', 'openai', 'replicate', 'sonstiger')),
  modell       text not null,
  temperatur   numeric(3,2) check (temperatur is null or temperatur between 0 and 2),
  max_tokens   integer check (max_tokens is null or max_tokens between 100 and 200000),
  aktiv        boolean not null default true,
  hinweis      text,
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid
);
comment on table public.plattform_ki_einstellungen is
  'Je KI-Funktion: Anbieter, Modell, Temperatur, Max-Tokens und der Notschalter (aktiv=false mit Hinweis). '
  'Die Funktionen lesen die Zeile ueber die Beilage _credits; der Notschalter greift zusaetzlich am Ledger.';
alter table public.plattform_ki_einstellungen enable row level security;
drop policy if exists plattform_ki_einstellungen_lesen on public.plattform_ki_einstellungen;
create policy plattform_ki_einstellungen_lesen on public.plattform_ki_einstellungen for select to authenticated using (true);
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_ki_einstellungen', 'GLOBAL', 'Modellwahl und Notschalter je KI-Funktion — Plattform, nicht Mandant')
on conflict (tabelle) do nothing;

insert into public.plattform_ki_einstellungen (funktion, name, anbieter, modell) values
  ('ki_text',          'Texte (Expose, Mail, Social)',     'anthropic', 'claude-sonnet-4-6'),
  ('expose_text',      'Expose-Text aus Objektdaten',      'anthropic', 'claude-sonnet-4-6'),
  ('expose_pruefer',   'Expose-Pruefer',                   'anthropic', 'claude-sonnet-4-6'),
  ('bild_optimieren',  'Bild-KI: Optimieren',              'replicate', 'siehe Funktion'),
  ('bild_homestaging', 'Bild-KI: Homestaging',             'replicate', 'siehe Funktion'),
  ('grundriss_visual', 'Grundriss lesen / visualisieren',  'anthropic', 'claude-sonnet-4-6'),
  ('social_paket',     'Social-Media-Paket',               'anthropic', 'claude-sonnet-4-6')
on conflict (funktion) do nothing;

-- Tageslimit je Mandant (Ausnahme vom globalen Wert). GRENZE: traegt eine
-- mandant_id, gehoert aber dem Betreiber.
create table if not exists public.mandant_ki_limits (
  mandant_id   uuid primary key references public.mandanten(id) on delete cascade,
  credits_tag  integer check (credits_tag is null or credits_tag >= 0),
  eur_tag      numeric(10,2) check (eur_tag is null or eur_tag >= 0),
  notiz        text,
  geaendert_am timestamptz not null default now()
);
comment on table public.mandant_ki_limits is
  'Tageslimit je Mandant (Credits/Euro) als Ausnahme vom globalen ki_tageslimit_*. NULL = globaler Wert; 0 = kein Limit.';
alter table public.mandant_ki_limits enable row level security;
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('mandant_ki_limits', 'GRENZE', 'Tageslimit je Mandant, gesetzt vom Betreiber; der Mandant sieht es nur als Meldung')
on conflict (tabelle) do nothing;

insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('ki_tageslimit_credits', '0'::jsonb, 'Credits je Mandant und Tag (Europe/Berlin). 0 = kein Limit. Missbrauchsschutz.'),
  ('ki_tageslimit_eur', '0'::jsonb, 'KI-Kosten in Euro je Mandant und Tag. 0 = kein Limit.'),
  ('alarm_kosten_tag_eur', '50'::jsonb, 'Warnung, wenn die KI-Kosten eines Tages (alle Mandanten) diesen Betrag ueberschreiten.'),
  ('alarm_kosten_monat_eur', '1000'::jsonb, 'Warnung, wenn die KI-Kosten des laufenden Monats diesen Betrag ueberschreiten.'),
  ('alarm_kosten_mandant_tag_eur', '10'::jsonb, 'Warnung je Mandant: KI-Kosten eines Tages.'),
  ('alarm_kosten_mandant_monat_eur', '100'::jsonb, 'Warnung je Mandant: KI-Kosten des laufenden Monats.')
on conflict (schluessel) do nothing;

-- Die Schranke: VOR jeder Reservierung. Notschalter und Tageslimit, beides
-- aus der Datenbank, beides mit eigenem Fehlercode, den die Beilage kennt:
--   KI001  Funktion abgeschaltet (Hinweis im Text)
--   KI002  Tageslimit erreicht (bis Mitternacht Europe/Berlin)
create or replace function public.ki_schranke()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare e record; lim record; tag_start timestamptz;
        g_credits integer; g_eur numeric; l_credits integer; l_eur numeric;
        heute_credits integer; heute_eur numeric; kosten integer;
begin
  if new.status is distinct from 'reserviert' or new.quelle = 'frei' then return new; end if;
  select * into e from public.plattform_ki_einstellungen where funktion = new.aktion;
  if e.funktion is not null and not e.aktiv then
    raise exception 'Diese KI-Funktion ist vorübergehend abgeschaltet. %', coalesce(e.hinweis, 'Bitte später erneut versuchen.')
      using errcode = 'KI001';
  end if;
  -- Nur KI-Funktionen haben ein Tageslimit; pdf_export & Co. nicht.
  if e.funktion is null then return new; end if;
  select coalesce((select (wert::text)::integer from public.plattform_werte where schluessel = 'ki_tageslimit_credits'), 0),
         coalesce((select (wert::text)::numeric from public.plattform_werte where schluessel = 'ki_tageslimit_eur'), 0)
    into g_credits, g_eur;
  select * into lim from public.mandant_ki_limits where mandant_id = new.mandant_id;
  l_credits := coalesce(lim.credits_tag, g_credits);
  l_eur := coalesce(lim.eur_tag, g_eur);
  if l_credits <= 0 and l_eur <= 0 then return new; end if;
  tag_start := (date_trunc('day', now() at time zone 'Europe/Berlin')) at time zone 'Europe/Berlin';
  select coalesce(sum(credits), 0), coalesce(sum(ki_kosten_eur), 0)
    into heute_credits, heute_eur
    from public.credit_buchungen
   where mandant_id = new.mandant_id and zeitpunkt >= tag_start
     and status in ('reserviert', 'gebucht') and vorgang_id <> new.vorgang_id;
  kosten := public.credits_kosten(new.aktion);
  if l_credits > 0 and heute_credits + kosten > l_credits then
    raise exception 'Tageslimit erreicht: % von % Credits heute verbraucht. Ab Mitternacht geht es weiter.', heute_credits, l_credits
      using errcode = 'KI002';
  end if;
  if l_eur > 0 and heute_eur >= l_eur then
    raise exception 'Tageslimit erreicht: KI-Kosten von heute liegen bei der Grenze (% EUR). Ab Mitternacht geht es weiter.', l_eur
      using errcode = 'KI002';
  end if;
  return new;
end
$function$;
revoke all on function public.ki_schranke() from public, anon;
grant execute on function public.ki_schranke() to authenticated;
drop trigger if exists ki_schranke on public.credit_buchungen;
create trigger ki_schranke before insert on public.credit_buchungen
  for each row execute function public.ki_schranke();

-- ---------------------------------------------------------------------------
-- 2. System-Mails
-- ---------------------------------------------------------------------------
create table if not exists public.system_mail_vorlagen (
  schluessel    text primary key,
  name          text not null,
  betreff       text not null,
  text          text not null,
  platzhalter   text[] not null default '{}',
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid
);
comment on table public.system_mail_vorlagen is
  'Betreff und Text der System-Mails mit Platzhaltern {{firma.name}}. system_mail_rendern() setzt sie ein; '
  'fehlt eine Zeile, nimmt die Funktion ihren eingebauten Text.';
alter table public.system_mail_vorlagen enable row level security;
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('system_mail_vorlagen', 'GLOBAL', 'Vorlagen der System-Mails — Plattform, nicht Mandant')
on conflict (tabelle) do nothing;

insert into public.system_mail_vorlagen (schluessel, name, betreff, text, platzhalter) values
  ('willkommen', 'Willkommen', 'Willkommen bei immoOffice.ai',
   E'Guten Tag,\n\nIhr Haus {{firma.name}} ist eingerichtet. Die Testphase läuft bis {{test.ende}}.\n\nPortal: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,test.ende,portal.url}'),
  ('test_7', 'Testende in 7 Tagen', 'Noch eine Woche Testphase',
   E'Guten Tag,\n\ndie Testphase von {{firma.name}} endet am {{test.ende}} — das ist in 7 Tagen.\n\nEs wird nichts automatisch abgebucht und nichts stillschweigend verlängert. Wenn Sie weiterarbeiten möchten, wählen Sie bis dahin einen Tarif — dann geht es ohne Unterbrechung weiter.\n\nTun Sie es nicht, bleiben Ihre Daten zunächst erhalten: {{test.lesetage}} Tage lang können Sie alles lesen und exportieren, nur nichts Neues mit der KI erzeugen.\n\nTarif wählen: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,test.ende,test.lesetage,portal.url}'),
  ('test_2', 'Testende in 2 Tagen', 'Noch zwei Tage Testphase',
   E'Guten Tag,\n\ndie Testphase von {{firma.name}} endet am {{test.ende}} — das ist in 2 Tagen.\n\nEs wird nichts automatisch abgebucht. Wenn Sie weiterarbeiten möchten, wählen Sie bis dahin einen Tarif.\n\nTarif wählen: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,test.ende,test.lesetage,portal.url}'),
  ('test_0', 'Testende heute', 'Ihre Testphase endet heute',
   E'Guten Tag,\n\ndie Testphase von {{firma.name}} endet heute, am {{test.ende}}.\n\nIhre Daten bleiben {{test.lesetage}} Tage lesbar. Wenn Sie weiterarbeiten möchten, wählen Sie jetzt einen Tarif.\n\nTarif wählen: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,test.ende,test.lesetage,portal.url}'),
  ('zahlung_problem', 'Zahlungsproblem', 'Eine Zahlung konnte nicht eingezogen werden',
   E'Guten Tag,\n\nfür {{firma.name}} konnte die Zahlung über {{rechnung.betrag}} nicht eingezogen werden. Bitte prüfen Sie Ihr Zahlungsmittel bis {{zahlung.frist}} — sonst wird der Zugang eingeschränkt.\n\nZahlungsmittel prüfen: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,rechnung.betrag,zahlung.frist,portal.url}'),
  ('kuendigung_bestaetigt', 'Kündigungsbestätigung', 'Ihre Kündigung ist vorgemerkt',
   E'Guten Tag,\n\ndie Kündigung von {{firma.name}} ist vorgemerkt und wird am {{abo.ende}} wirksam. Bis dahin bleibt alles wie gewohnt; danach bleiben Ihre Daten {{test.lesetage}} Tage lesbar.\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,abo.ende,test.lesetage}'),
  ('support_zugriff_angefragt', 'Support-Zugriff angefragt', 'Support-Zugriff angefragt — bitte freigeben oder ablehnen',
   E'Guten Tag,\n\nder Support von immoOffice.ai bittet um {{zugriff.umfang}} auf {{firma.name}} für {{zugriff.dauer}}.\nGrund: {{zugriff.grund}}\n\nOhne Ihre Freigabe sieht der Support nichts. Sie entscheiden im Portal unter Einstellungen → Support-Zugriffe; dort können Sie den Zugriff auch jederzeit beenden und nachlesen, was währenddessen geschah.\n\nPortal: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,zugriff.umfang,zugriff.dauer,zugriff.grund,portal.url}'),
  ('support_antwort', 'Antwort des Supports', 'Antwort zu Ihrer Anfrage: {{anfrage.betreff}}',
   E'Guten Tag,\n\nzu Ihrer Anfrage gibt es eine Antwort vom Support:\n\n{{antwort.text}}\n\nSie können im Portal unter „Hilfe“ antworten: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{anfrage.betreff,antwort.text,portal.url}'),
  ('loeschung_angekuendigt', 'Löschung angekündigt', 'Ihr Konto wird am {{loeschung.datum}} gelöscht',
   E'Guten Tag,\n\ndas Konto von {{firma.name}} ist zur Löschung vorgemerkt. Am {{loeschung.datum}} werden alle Daten einschließlich Dateien endgültig gelöscht; Rechnungsdaten bleiben nach Aufbewahrungspflicht getrennt erhalten.\n\nBis dahin können Sie alles exportieren: {{portal.url}}\n\nMit freundlichen Grüßen\nIhr Team von immoOffice.ai',
   '{firma.name,loeschung.datum,portal.url}')
on conflict (schluessel) do nothing;

-- Platzhalter einsetzen. {{a.b}} -> p_werte #>> '{a,b}'. Unbekannte bleiben
-- stehen, damit man sie in der Vorschau sieht.
create or replace function public.system_mail_rendern(p_schluessel text, p_werte jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v record; b text; t text; m text[]; w text;
begin
  select * into v from public.system_mail_vorlagen where schluessel = p_schluessel;
  if v.schluessel is null then return null; end if;
  b := v.betreff; t := v.text;
  for m in select regexp_matches(v.betreff || ' ' || v.text, '\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}', 'g') loop
    w := p_werte #>> string_to_array(m[1], '.');
    if w is not null then
      b := regexp_replace(b, '\{\{\s*' || replace(m[1], '.', '\.') || '\s*\}\}', w, 'g');
      t := regexp_replace(t, '\{\{\s*' || replace(m[1], '.', '\.') || '\s*\}\}', w, 'g');
    end if;
  end loop;
  return jsonb_build_object('betreff', b, 'text', t);
end
$function$;
revoke all on function public.system_mail_rendern(text, jsonb) from public, anon;
grant execute on function public.system_mail_rendern(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rechtstexte
-- ---------------------------------------------------------------------------
create table if not exists public.rechtstexte (
  id                 uuid primary key default gen_random_uuid(),
  art                text not null check (art in ('agb', 'avv', 'datenschutz', 'impressum')),
  version            text not null,
  titel              text not null,
  text               text not null,
  aenderungshinweis  text,
  gueltig_ab         date not null default current_date,
  zustimmung_noetig  boolean not null default false,
  veroeffentlicht_am timestamptz,
  erstellt_am        timestamptz not null default now(),
  erstellt_von       uuid,
  constraint rechtstexte_art_version unique (art, version)
);
comment on table public.rechtstexte is
  'AGB, AVV, Datenschutzerklaerung, Impressum der Plattform mit Version und Gueltig-ab. '
  'Veroeffentlichte Texte sind oeffentlich lesbar; Entwuerfe nur fuer den Betreiber (Dienstschluessel).';
create index if not exists rechtstexte_art_idx on public.rechtstexte (art, gueltig_ab desc);
alter table public.rechtstexte enable row level security;
drop policy if exists rechtstexte_lesen on public.rechtstexte;
create policy rechtstexte_lesen on public.rechtstexte for select to anon, authenticated
  using (veroeffentlicht_am is not null);
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('rechtstexte', 'GLOBAL', 'Rechtstexte der Plattform, versioniert — oeffentlich, wenn veroeffentlicht')
on conflict (tabelle) do nothing;

create table if not exists public.rechtstext_zustimmungen (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  rechtstext_id uuid not null references public.rechtstexte(id) on delete cascade,
  nutzer_id     uuid default auth.uid(),
  zeitpunkt     timestamptz not null default now(),
  constraint rechtstext_zustimmungen_einmal unique (mandant_id, rechtstext_id)
);
comment on table public.rechtstext_zustimmungen is 'Wer (chef) wann welcher Rechtstext-Version fuer sein Haus zugestimmt hat.';
create index if not exists rechtstext_zustimmungen_mandant_idx on public.rechtstext_zustimmungen (mandant_id);
alter table public.rechtstext_zustimmungen enable row level security;
drop policy if exists rechtstext_zustimmungen_lesen on public.rechtstext_zustimmungen;
create policy rechtstext_zustimmungen_lesen on public.rechtstext_zustimmungen
  for select to authenticated using (mandant_id = public.aktuelle_mandant_id());
-- Zustimmen darf nur der chef — fuer sein Haus, als er selbst.
drop policy if exists rechtstext_zustimmungen_anlegen on public.rechtstext_zustimmungen;
create policy rechtstext_zustimmungen_anlegen on public.rechtstext_zustimmungen
  for insert to authenticated
  with check (mandant_id = public.aktuelle_mandant_id() and nutzer_id = auth.uid()
              and coalesce(public.aktuelle_rolle(), '') = 'chef');
drop policy if exists "mandant_trennung" on public.rechtstext_zustimmungen;
create policy "mandant_trennung" on public.rechtstext_zustimmungen
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.mandant_id_schreiben());
drop policy if exists "mandant_trennung_loeschen" on public.rechtstext_zustimmungen;
create policy "mandant_trennung_loeschen" on public.rechtstext_zustimmungen
  as restrictive for delete to public
  using (mandant_id = public.mandant_id_schreiben());
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('rechtstext_zustimmungen', 'MANDANT', 'Zustimmungen des Hauses zu Rechtstexten')
on conflict (tabelle) do nothing;
-- fork_77: das Aenderungsprotokoll der Support-Sitzung auch hier.
drop trigger if exists support_protokoll_tr on public.rechtstext_zustimmungen;
create trigger support_protokoll_tr after insert or update or delete on public.rechtstext_zustimmungen
  for each row execute function public.support_aenderung_protokollieren();

-- Was dem Angemeldeten noch zur Zustimmung fehlt: je Art die juengste
-- veroeffentlichte, gueltige Fassung mit Zustimmungspflicht, der sein Haus
-- noch nicht zugestimmt hat.
create or replace function public.rechtstexte_offen()
 returns table (id uuid, art text, version text, titel text, text text, aenderungshinweis text, gueltig_ab date)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with aktuell as (
    select distinct on (r.art) r.*
      from public.rechtstexte r
     where r.veroeffentlicht_am is not null and r.gueltig_ab <= current_date and r.zustimmung_noetig
     order by r.art, r.gueltig_ab desc, r.veroeffentlicht_am desc)
  select a.id, a.art, a.version, a.titel, a.text, a.aenderungshinweis, a.gueltig_ab
    from aktuell a
   where not exists (select 1 from public.rechtstext_zustimmungen z
                      where z.rechtstext_id = a.id
                        and z.mandant_id = (select p.mandant_id from public.profiles p where p.id = auth.uid()))
   order by a.art
$function$;
revoke all on function public.rechtstexte_offen() from public, anon;
grant execute on function public.rechtstexte_offen() to authenticated;

-- Der Ueberblick fuer den Betreiber: X von Y Mandanten haben zugestimmt.
create or replace function public.plattform_rechtstexte_stand()
 returns table (rechtstext_id uuid, art text, version text, zugestimmt bigint, mandanten bigint)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner', 'admin', 'support') then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  return query
  select r.id, r.art, r.version,
         (select count(*) from public.rechtstext_zustimmungen z where z.rechtstext_id = r.id),
         (select count(*) from public.mandanten m where m.abo_status in ('test', 'aktiv'))
    from public.rechtstexte r
   where r.veroeffentlicht_am is not null and r.zustimmung_noetig
   order by r.art, r.gueltig_ab desc;
end
$function$;
revoke all on function public.plattform_rechtstexte_stand() from public, anon;
grant execute on function public.plattform_rechtstexte_stand() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ankuendigungen
-- ---------------------------------------------------------------------------
create table if not exists public.ankuendigungen (
  id             uuid primary key default gen_random_uuid(),
  typ            text not null default 'info' check (typ in ('info', 'wartung', 'neue_funktion', 'warnung')),
  titel          text not null check (length(btrim(titel)) between 1 and 120),
  text           text not null,
  von            timestamptz not null default now(),
  bis            timestamptz,
  schliessbar    boolean not null default true,
  ziel_tarife    text[],
  ziel_status    text[],
  ziel_mandanten uuid[],
  mail_an_chefs  boolean not null default false,
  mail_gesendet_am timestamptz,
  erstellt_am    timestamptz not null default now(),
  erstellt_von   uuid,
  constraint ankuendigungen_zeitraum check (bis is null or bis > von)
);
comment on table public.ankuendigungen is
  'Hinweise ins Portal: alle Mandanten oder nach Tarif, Status, einzeln. NULL-Ziel = alle. '
  'Wartung zeigt einen Countdown bis `von`.';
create index if not exists ankuendigungen_zeit_idx on public.ankuendigungen (von, bis);
alter table public.ankuendigungen enable row level security;
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('ankuendigungen', 'GLOBAL', 'Hinweise des Betreibers ins Portal; der Mandant liest ueber meine_ankuendigungen()')
on conflict (tabelle) do nothing;

-- Was der Angemeldete sieht: laufende Hinweise, plus Wartungen der naechsten
-- sieben Tage (Countdown). Ziel gegen Tarif, Status und Kennung des Hauses.
create or replace function public.meine_ankuendigungen()
 returns table (id uuid, typ text, titel text, text text, von timestamptz, bis timestamptz, schliessbar boolean)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with ich as (
    select m.id, m.abo_status, a.tarif
      from public.profiles p
      join public.mandanten m on m.id = p.mandant_id
      left join public.mandant_abo a on a.mandant_id = m.id
     where p.id = auth.uid())
  select k.id, k.typ, k.titel, k.text, k.von, k.bis, k.schliessbar
    from public.ankuendigungen k, ich
   where (k.bis is null or k.bis > now())
     and (k.von <= now() or (k.typ = 'wartung' and k.von < now() + interval '7 days'))
     and (k.ziel_tarife is null or coalesce(ich.tarif, '') = any (k.ziel_tarife))
     and (k.ziel_status is null or ich.abo_status = any (k.ziel_status))
     and (k.ziel_mandanten is null or ich.id = any (k.ziel_mandanten))
   order by case k.typ when 'warnung' then 0 when 'wartung' then 1 else 2 end, k.von desc
$function$;
revoke all on function public.meine_ankuendigungen() from public, anon;
grant execute on function public.meine_ankuendigungen() to authenticated;
