-- ===========================================================================
-- ImmoOffice.ai — Onboarding, Standorte, Einladungen (7 Tage, Protokoll),
-- Audit-Log, Plattform-Admin, Support-Freigabe
--
-- docs/AUTONOMIE.md Abschnitt 3 (Datenmodell) und Abschnitt 2 (R3, O1, O2,
-- T2, A1, A2). Entscheidungen E-2026-09-03-05 bis -07.
--
-- Setzt auf 20260817144057_einladungen_und_benutzerverwaltung.sql auf: Die
-- Tabelle `einladungen` und ihre Funktionen bestehen bereits; hier werden nur
-- die Gueltigkeit (7 statt 14 Tage) und das Protokoll ergaenzt.
--
-- Die RLS-Helfer liegen seit 20260816200445 im Schema `intern`.
-- Grundregel bleibt: Jede fachliche Tabelle traegt mandant_id und hat RLS.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Mandant: Sichtbarkeit und Onboarding-Zustand (T2, O1)
-- ---------------------------------------------------------------------------

alter table public.mandanten
  add column objekt_sichtbarkeit text not null default 'alle'
    check (objekt_sichtbarkeit in ('alle', 'eigene')),
  add column onboarding_abgeschlossen boolean not null default false,
  -- Der zuletzt erreichte Schritt des Assistenten (1–8). Damit kann der
  -- Assistent nach einem Abbruch an derselben Stelle weitermachen.
  add column onboarding_schritt smallint not null default 1
    check (onboarding_schritt between 1 and 8);

comment on column public.mandanten.objekt_sichtbarkeit is
  'alle: jeder im Unternehmen sieht alle Objekte und Kontakte. eigene: nur Ersteller und Verwaltung.';

-- Wer heute schon arbeitet, hat das Onboarding faktisch hinter sich. Ohne diese
-- Zeile wuerden alle bestehenden Mandanten beim naechsten Login in den
-- Assistenten geleitet.
update public.mandanten set onboarding_abgeschlossen = true;

-- ---------------------------------------------------------------------------
-- 2. Unternehmensangaben und Gestaltung (O1 Schritte 1–3, 5–7; B2, B3, B6)
-- ---------------------------------------------------------------------------

alter table public.mandant_branding
  -- Schritt 1: Firmierung
  add column rechtsform        text,
  add column geschaeftsfuehrer text,
  -- Schritt 3: Impressum. Die USt-IdNr. wird nur auf ihr Format geprueft;
  -- die Gewerbeerlaubnis nach § 34c GewO wird nicht geprueft (R4).
  add column handelsregister   text,
  add column ust_id            text
    check (ust_id is null or ust_id ~ '^[A-Z]{2}[A-Z0-9]{2,12}$'),
  add column aufsichtsbehoerde text,
  -- Schritt 6: je eine serifenlose und eine Serifenschrift aus der
  -- kuratierten Liste (B2). Die Schluessel spiegelt src/lib/branding/schriften.ts.
  add column schrift_serifenlos text not null default 'inter'
    check (schrift_serifenlos in
      ('inter','montserrat','poppins','work-sans','source-sans-3','nunito-sans')),
  add column schrift_serifen text not null default 'lora'
    check (schrift_serifen in
      ('marcellus','cormorant-garamond','playfair-display','lora','eb-garamond','libre-baskerville')),
  add column favicon_pfad text,
  -- Schritt 7: Signatur fuer E-Mails aus der Anwendung (P6). HTML, weil
  -- Mailprogramme nichts anderes verstehen; wird beim Speichern bereinigt.
  add column signatur_html text;

comment on column public.mandant_branding.ust_id is
  'Umsatzsteuer-Identifikationsnummer, nur Formatpruefung. Kein Nachweis der Gueltigkeit.';

-- ---------------------------------------------------------------------------
-- 3. Standorte (O2): ein Standort in Stufe 1, Tabelle trotzdem jetzt
-- ---------------------------------------------------------------------------

create table public.standorte (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  bezeichnung   text not null check (length(trim(bezeichnung)) between 1 and 120),
  strasse       text,
  hausnummer    text,
  plz           text check (plz is null or plz ~ '^[0-9]{5}$'),
  ort           text,
  telefon       text,
  email         text,
  ist_hauptsitz boolean not null default false,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);

create index standorte_mandant_idx on public.standorte(mandant_id);
-- Hoechstens ein Hauptsitz je Mandant.
create unique index standorte_hauptsitz_idx
  on public.standorte(mandant_id) where ist_hauptsitz;

create trigger standorte_geaendert
  before update on public.standorte
  for each row execute function intern.setze_geaendert_am();

alter table public.standorte enable row level security;

create policy standorte_lesen on public.standorte
  for select using (mandant_id = intern.aktueller_mandant());

create policy standorte_schreiben on public.standorte
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

-- ---------------------------------------------------------------------------
-- 4. Audit-Log (A2): unveraenderbar, nur ueber Funktion beschreibbar
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id          bigint generated always as identity primary key,
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  -- Null, wenn die Plattform selbst handelt (Support, Jobs).
  benutzer_id uuid references auth.users(id) on delete set null,
  aktion      text not null check (length(aktion) between 2 and 80),
  ziel_art    text,
  ziel_id     text,
  details     jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now()
);

create index audit_log_mandant_zeit_idx on public.audit_log(mandant_id, erstellt_am desc);

comment on table public.audit_log is
  'Protokoll sicherheitsrelevanter Handlungen je Mandant. Einfuegen nur ueber audit_schreiben() und Trigger; kein Aendern, kein Loeschen.';

alter table public.audit_log enable row level security;

-- Lesen darf die Verwaltung des eigenen Mandanten. Es gibt bewusst KEINE
-- Insert-/Update-/Delete-Policy: Geschrieben wird ausschliesslich ueber
-- security-definer-Funktionen und Trigger, geaendert wird nie.
create policy audit_log_lesen on public.audit_log
  for select using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

create or replace function intern.audit_unveraenderbar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Das Audit-Log ist unveraenderbar.';
end;
$$;

create trigger audit_log_unveraenderbar
  before update or delete on public.audit_log
  for each row execute function intern.audit_unveraenderbar();

-- Schreibt einen Eintrag fuer den eigenen Mandanten.
--
-- security definer, weil die Tabelle fuer normale Rollen nicht beschreibbar
-- ist. Der Mandant wird NICHT uebergeben, sondern aus der Sitzung gelesen —
-- so kann niemand in ein fremdes Protokoll schreiben.
create or replace function public.audit_schreiben(
  p_aktion   text,
  p_ziel_art text default null,
  p_ziel_id  text default null,
  p_details  jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_id bigint;
begin
  if v_mandant is null then
    raise exception 'Kein Mandant in der Sitzung.';
  end if;

  insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
  values (v_mandant, auth.uid(), p_aktion, p_ziel_art, p_ziel_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.audit_schreiben(text, text, text, jsonb) from public, anon;
grant execute on function public.audit_schreiben(text, text, text, jsonb) to authenticated;

-- Rollen-, Rechte- und Zugangsaenderungen landen automatisch im Protokoll.
-- Trigger statt Anwendungscode: Dann fehlt der Eintrag auch dann nicht, wenn
-- jemand die Aenderung ueber ein anderes Werkzeug vornimmt.
create or replace function intern.benutzer_aenderung_protokollieren()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.rolle is distinct from old.rolle then
    insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
    values (new.mandant_id, auth.uid(), 'rolle_geaendert', 'benutzer', new.id::text,
            jsonb_build_object('von', old.rolle, 'nach', new.rolle));
  end if;

  if new.aktiv is distinct from old.aktiv then
    insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
    values (new.mandant_id, auth.uid(),
            case when new.aktiv then 'zugang_freigegeben' else 'zugang_abgeschaltet' end,
            'benutzer', new.id::text, '{}'::jsonb);
  end if;

  if new.rechte_uebersteuerung is distinct from old.rechte_uebersteuerung then
    insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
    values (new.mandant_id, auth.uid(), 'rechte_geaendert', 'benutzer', new.id::text,
            jsonb_build_object('abweichungen', new.rechte_uebersteuerung));
  end if;

  return new;
end;
$$;

create trigger benutzer_aenderung_protokollieren
  after update on public.benutzer
  for each row execute function intern.benutzer_aenderung_protokollieren();

-- ---------------------------------------------------------------------------
-- 5. Einladungen (R3): sieben Tage statt vierzehn, Protokoll
--
-- Tabelle und Funktionen bestehen (20260817144057). Der Token entsteht in
-- der Anwendung und wird in der Datenbank nur als Hash gespeichert
-- (E-2026-09-03-06).
-- ---------------------------------------------------------------------------

alter table public.einladungen
  alter column gueltig_bis set default (now() + interval '7 days');

-- Erneuern verlaengert ebenfalls um sieben Tage. Gleiche Signatur wie bisher.
create or replace function public.einladung_erneuern(
  p_id    uuid,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid;
begin
  v_mandant := intern.aktueller_mandant();

  if v_mandant is null or not intern.ist_verwaltung() then
    raise exception 'Nur Inhaber und Administratoren duerfen einladen.';
  end if;

  if length(p_token) < 24 then
    raise exception 'Das Einladungstoken ist zu kurz.';
  end if;

  update public.einladungen
     set token_hash  = intern.token_hash(p_token),
         gueltig_bis = now() + interval '7 days',
         erstellt_am = now()
   where id = p_id
     and mandant_id = v_mandant
     and eingeloest_am is null
     and widerrufen_am is null;

  if not found then
    raise exception 'Diese Einladung besteht nicht mehr.';
  end if;
end;
$$;

-- Anlegen, Einloesen und Widerrufen im Protokoll — ueber einen Trigger, damit
-- die bestehenden Funktionen unveraendert bleiben.
create or replace function intern.einladung_protokollieren()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
    values (new.mandant_id, auth.uid(), 'einladung_erstellt', 'einladung', new.id::text,
            jsonb_build_object('email', new.email, 'rolle', new.rolle));
  elsif new.eingeloest_am is not null and old.eingeloest_am is null then
    insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
    values (new.mandant_id, auth.uid(), 'einladung_eingeloest', 'benutzer', new.eingeloest_von::text,
            jsonb_build_object('email', new.email, 'rolle', new.rolle));
  elsif new.widerrufen_am is not null and old.widerrufen_am is null then
    insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
    values (new.mandant_id, auth.uid(), 'einladung_widerrufen', 'einladung', new.id::text,
            jsonb_build_object('email', new.email));
  end if;
  return new;
end;
$$;

create trigger einladungen_protokollieren
  after insert or update on public.einladungen
  for each row execute function intern.einladung_protokollieren();

-- ---------------------------------------------------------------------------
-- 6. Plattform-Administration (A1, A2)
-- ---------------------------------------------------------------------------

-- Wer die Plattform betreibt. RLS ist eingeschaltet und es gibt KEINE Policy:
-- Damit ist die Tabelle ausschliesslich ueber die Dienstrolle erreichbar.
-- Plattform-Administratoren erhalten damit keinen automatischen Zugriff auf
-- Mandantendaten — sie sind fuer RLS gewoehnliche Benutzer ohne Mandant.
create table public.plattform_admins (
  benutzer_id uuid primary key references auth.users(id) on delete cascade,
  notiz       text,
  erstellt_am timestamptz not null default now()
);

alter table public.plattform_admins enable row level security;

comment on table public.plattform_admins is
  'Betreiber der Plattform. Nur per Dienstrolle lesbar; kein Zugriff auf Mandanteninhalte ohne Freigabe (support_freigaben).';

-- Support-Zugriff: ein Inhaber gewaehrt der Plattform fuer 24 Stunden Einsicht.
-- Die Freigabe selbst ist ein Datensatz des Mandanten und wird protokolliert.
create table public.support_freigaben (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  freigegeben_von uuid not null references auth.users(id) on delete cascade,
  gueltig_bis     timestamptz not null,
  widerrufen_am   timestamptz,
  erstellt_am     timestamptz not null default now()
);

create index support_freigaben_mandant_idx on public.support_freigaben(mandant_id, gueltig_bis desc);

alter table public.support_freigaben enable row level security;

create policy support_freigaben_lesen on public.support_freigaben
  for select using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

-- Gewaehrt Support-Zugriff fuer 24 Stunden. Nur der Inhaber.
create or replace function public.support_zugriff_gewaehren()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_id uuid;
begin
  if v_mandant is null or intern.aktuelle_rolle() <> 'inhaber' then
    raise exception 'Nur der Inhaber kann Support-Zugriff gewaehren.';
  end if;

  insert into public.support_freigaben (mandant_id, freigegeben_von, gueltig_bis)
  values (v_mandant, auth.uid(), now() + interval '24 hours')
  returning id into v_id;

  insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
  values (v_mandant, auth.uid(), 'support_zugriff_gewaehrt', 'support_freigabe', v_id::text,
          jsonb_build_object('gueltig_bis', now() + interval '24 hours'));

  return v_id;
end;
$$;

-- Widerruft alle offenen Support-Freigaben. Nur der Inhaber.
create or replace function public.support_zugriff_widerrufen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_anzahl integer;
begin
  if v_mandant is null or intern.aktuelle_rolle() <> 'inhaber' then
    raise exception 'Nur der Inhaber kann Support-Zugriff widerrufen.';
  end if;

  update public.support_freigaben
     set widerrufen_am = now()
   where mandant_id = v_mandant and widerrufen_am is null and gueltig_bis > now();
  get diagnostics v_anzahl = row_count;

  if v_anzahl > 0 then
    insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, details)
    values (v_mandant, auth.uid(), 'support_zugriff_widerrufen', 'support_freigabe',
            jsonb_build_object('anzahl', v_anzahl));
  end if;

  return v_anzahl;
end;
$$;

revoke all on function public.support_zugriff_gewaehren() from public, anon;
revoke all on function public.support_zugriff_widerrufen() from public, anon;
grant execute on function public.support_zugriff_gewaehren() to authenticated;
grant execute on function public.support_zugriff_widerrufen() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Onboarding-Abschluss (O1): Pflichtschritte 1–3 pruefen
-- ---------------------------------------------------------------------------

-- Setzt den Onboarding-Zustand. Der Abschluss gelingt nur, wenn Firmierung,
-- Anschrift und Impressumsdaten vorliegen (Schritte 1–3). Alles Weitere ist
-- ueberspringbar und in den Einstellungen nachholbar.
create or replace function public.onboarding_fortschritt(
  p_schritt smallint,
  p_abschliessen boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_b public.mandant_branding%rowtype;
begin
  if v_mandant is null or not intern.ist_verwaltung() then
    raise exception 'Nur Inhaber und Administratoren fuehren das Onboarding durch.';
  end if;

  if p_abschliessen then
    select * into v_b from public.mandant_branding where mandant_id = v_mandant;
    if v_b.firmenname is null or trim(v_b.firmenname) = ''
       or v_b.strasse is null or v_b.plz is null or v_b.ort is null
       or v_b.email is null then
      raise exception 'Firmierung, Anschrift und Impressumsdaten muessen vollstaendig sein.';
    end if;
  end if;

  update public.mandanten
     set onboarding_schritt = greatest(onboarding_schritt, p_schritt),
         onboarding_abgeschlossen = onboarding_abgeschlossen or p_abschliessen
   where id = v_mandant;
end;
$$;

revoke all on function public.onboarding_fortschritt(smallint, boolean) from public, anon;
grant execute on function public.onboarding_fortschritt(smallint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Credit-Preise ergaenzen (docs/CREDITS.md, E-2026-09-03-13)
-- ---------------------------------------------------------------------------

insert into public.credit_preise (aktion, bezeichnung, credits) values
  ('ki_wertermittlung_text', 'KI-Textbausteine in einer Wertermittlung',       10),
  ('ki_mail_entwurf',        'KI-Antwortentwurf zu einer E-Mail',               1),
  ('ki_expose_pruefung',     'KI-Pruefung eines Exposés auf Luecken',           2),
  ('openimmo_export',        'OpenImmo-Export',                                 0)
on conflict (aktion) do nothing;
