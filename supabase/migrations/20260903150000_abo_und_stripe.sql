-- ===========================================================================
-- ImmoOffice.ai — Abo, Testphase, Lesemodus, Benutzerlimit, Stripe
--
-- docs/AUTONOMIE.md Abschnitt 4 (S1–S10), Masterprompt Abschnitt 14.
--
-- Grundsaetze:
--   - Preise sind Daten (tarife, preise), nicht Code. Stripe-Preis-IDs stehen
--     daneben und werden vom Einrichtungsskript eingetragen.
--   - Der Abo-Zustand kommt ausschliesslich aus Stripe-Ereignissen, die
--     idempotent verarbeitet werden (stripe_ereignisse). Das Frontend
--     entscheidet nie ueber den Status.
--   - Schreibrechte haengen am Abo: Nach der Testphase ohne Abo gilt
--     Lesemodus (S3) — in der Datenbank erzwungen, nicht in der Oberflaeche.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Preise fuer Zusatzbenutzer und Credit-Pakete (S1, S4)
-- ---------------------------------------------------------------------------

create table public.preise (
  schluessel      text primary key,
  bezeichnung     text not null,
  art             text not null check (art in ('zusatznutzer', 'credit_paket')),
  intervall       text check (intervall is null or intervall in ('monat', 'jahr')),
  netto           numeric(10,2) not null check (netto >= 0),
  credits         integer check (credits is null or credits > 0),
  stripe_preis_id text,
  reihenfolge     integer not null default 0,
  aktiv           boolean not null default true,
  geaendert_am    timestamptz not null default now()
);

comment on table public.preise is
  'Zusatzbenutzer und Credit-Pakete. Preise sind Daten; Aenderungen laufen ueber den Plattform-Admin.';

insert into public.preise (schluessel, bezeichnung, art, intervall, netto, credits, reihenfolge) values
  ('zusatznutzer_monat', 'Zusätzlicher Benutzer, monatlich', 'zusatznutzer', 'monat',  14.99, null, 1),
  ('zusatznutzer_jahr',  'Zusätzlicher Benutzer, jährlich',  'zusatznutzer', 'jahr',  149.90, null, 2),
  ('credits_klein',      'Credit-Paket Klein',   'credit_paket', null,  9.99,  250, 3),
  ('credits_mittel',     'Credit-Paket Mittel',  'credit_paket', null, 29.99, 1000, 4),
  ('credits_gross',      'Credit-Paket Groß',    'credit_paket', null, 69.99, 3000, 5);

alter table public.preise enable row level security;
create policy preise_lesen on public.preise for select to authenticated using (aktiv);

alter table public.tarife add column stripe_produkt_id text;

-- ---------------------------------------------------------------------------
-- 2. Abonnement und Mandant: Zustand aus Stripe, Lesemodus, Erinnerungen
-- ---------------------------------------------------------------------------

alter table public.abonnements
  add column stripe_status            text,
  add column abgerechnet_bis          timestamptz,
  add column zahlung_fehlgeschlagen_am timestamptz;

alter table public.mandanten
  -- S3: Nach der Testphase ohne Abo 30 Tage Lesemodus, danach Loeschung.
  add column lesemodus_seit        timestamptz,
  add column loeschung_geplant_am  timestamptz,
  -- Versandmarken der Erinnerungen (S2, S3), damit jede nur einmal geht.
  add column erinnerung_tag5_am    timestamptz,
  add column erinnerung_tag7_am    timestamptz,
  add column loeschwarnung_tag23_am timestamptz,
  add column loeschwarnung_tag29_am timestamptz;

-- Idempotenz: Jedes Stripe-Ereignis wird genau einmal verarbeitet (S9).
create table public.stripe_ereignisse (
  id             text primary key,
  typ            text not null,
  empfangen_am   timestamptz not null default now(),
  verarbeitet_am timestamptz,
  fehler_text    text,
  nutzlast       jsonb
);

alter table public.stripe_ereignisse enable row level security;   -- nur Dienstrolle

-- Gutschriften je Abrechnungsperiode und je Paketkauf, jeweils genau einmal.
create table public.abo_perioden (
  stripe_rechnung_id text primary key,
  mandant_id         uuid not null references public.mandanten(id) on delete cascade,
  gutgeschrieben     integer not null,
  erstellt_am        timestamptz not null default now()
);

create table public.paketkaeufe (
  stripe_zahlung_id text primary key,
  mandant_id        uuid not null references public.mandanten(id) on delete cascade,
  paket             text not null references public.preise(schluessel),
  credits           integer not null,
  erstellt_am       timestamptz not null default now()
);

alter table public.abo_perioden enable row level security;
alter table public.paketkaeufe  enable row level security;
create policy abo_perioden_lesen on public.abo_perioden for select using (mandant_id = intern.aktueller_mandant());
create policy paketkaeufe_lesen  on public.paketkaeufe  for select using (mandant_id = intern.aktueller_mandant());

-- Bestehende Mandanten ohne Abo-Zeile bekommen eine (Testphase).
insert into public.abonnements (mandant_id, status)
select m.id, case when m.abo_status = 'aktiv' then 'aktiv'::public.abo_status else 'test'::public.abo_status end
  from public.mandanten m
 where not exists (select 1 from public.abonnements a where a.mandant_id = m.id);

-- ---------------------------------------------------------------------------
-- 3. Registrierung: Abo-Zeile und 100 Test-Credits (S2)
--
-- Bisher entstanden bei der Registrierung weder Abo-Zeile noch Testguthaben —
-- die 100 Credits der Testphase gab es nur auf dem Papier.
-- ---------------------------------------------------------------------------

create or replace function public.registriere_mandant(
  p_firmenname text,
  p_name       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid;
  v_slug    text;
  v_email   text;
  v_zaehler int := 0;
  v_test_bis timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if exists (select 1 from public.benutzer where id = auth.uid()) then
    raise exception 'Dieses Konto gehoert bereits zu einem Unternehmen.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  v_slug := regexp_replace(lower(trim(p_firmenname)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then
    v_slug := 'unternehmen';
  end if;
  v_slug := left(v_slug, 50);

  while exists (select 1 from public.mandanten where slug = v_slug) loop
    v_zaehler := v_zaehler + 1;
    v_slug := left(v_slug, 45) || '-' || v_zaehler;
  end loop;

  insert into public.mandanten (name, slug)
  values (trim(p_firmenname), v_slug)
  returning id, testphase_bis into v_mandant, v_test_bis;

  insert into public.benutzer (id, mandant_id, name, email, rolle)
  values (auth.uid(), v_mandant, trim(p_name), v_email, 'inhaber');

  insert into public.mandant_branding (mandant_id, firmenname, email)
  values (v_mandant, trim(p_firmenname), v_email);

  -- Testphase: Abo-Zeile im Zustand „test" und 100 Credits, gueltig bis zum
  -- Ende der Testphase (S2). Kein Zahlungsmittel noetig.
  insert into public.abonnements (mandant_id, status) values (v_mandant, 'test');
  perform public.credits_gutschreiben(v_mandant, 'test', 100, v_test_bis, 'Testphase: 100 Credits');

  return v_mandant;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Lesemodus (S3): Schreiben nur mit laufender Testphase oder Abo
--
-- intern.darf_schreiben() ist die Grundlage der Schreib-Policies auf allen
-- fachlichen Tabellen. Ein Mandant ohne Abo nach der Testphase darf lesen und
-- exportieren, aber nichts mehr anlegen oder aendern.
-- ---------------------------------------------------------------------------

create or replace function intern.mandant_schreibbar(p_mandant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.mandanten m
     where m.id = p_mandant
       and m.gesperrt_am is null
       and (
         m.abo_status = 'aktiv'
         or m.abo_status = 'zahlung_offen'                       -- Kulanz waehrend der Zahlungsklaerung
         or (m.abo_status = 'test' and m.testphase_bis > now())
       )
  )
$$;

create or replace function intern.darf_schreiben()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select b.rolle <> 'nur_lesen' and intern.mandant_schreibbar(b.mandant_id)
       from public.benutzer b where b.id = auth.uid() and b.aktiv),
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- 5. Benutzerlimit (S1, S5): enthaltene Benutzer des Tarifs plus Zusatzbenutzer;
--    in der Testphase ein Benutzer
-- ---------------------------------------------------------------------------

create or replace function intern.benutzer_limit(p_mandant uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case when a.status = 'test' then 1 else coalesce(t.enthaltene_benutzer, 1) + a.zusatznutzer end
       from public.abonnements a
       left join public.tarife t on t.id = a.tarif_id
      where a.mandant_id = p_mandant),
    1
  )
$$;

-- Fuer die Oberflaeche: Warum ist der Mandant im Lesemodus, wie viele Plaetze gibt es?
-- (Steht nach benutzer_limit, weil SQL-Funktionen beim Anlegen aufgeloest werden.)
create or replace function public.mandant_zustand()
returns table (schreibbar boolean, abo_status public.abo_status, testphase_bis timestamptz,
               lesemodus_seit timestamptz, loeschung_geplant_am timestamptz, benutzer_limit integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select intern.mandant_schreibbar(m.id), m.abo_status, m.testphase_bis, m.lesemodus_seit, m.loeschung_geplant_am,
         intern.benutzer_limit(m.id)
    from public.mandanten m
   where m.id = intern.aktueller_mandant()
$$;

-- Einladen nur, solange Platz ist: aktive Zugaenge plus offene Einladungen.
create or replace function public.einladung_erstellen(
  p_email  text,
  p_rolle  public.benutzerrolle,
  p_rechte jsonb,
  p_token  text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid;
  v_email   text;
  v_id      uuid;
  v_belegt  integer;
  v_limit   integer;
begin
  v_mandant := intern.aktueller_mandant();

  if v_mandant is null or not intern.ist_verwaltung() then
    raise exception 'Nur Inhaber und Administratoren duerfen einladen.';
  end if;

  if p_rolle = 'inhaber' and intern.aktuelle_rolle() <> 'inhaber' then
    raise exception 'Nur der Inhaber darf die Inhaberrolle vergeben.';
  end if;

  v_email := lower(trim(p_email));

  if position('@' in v_email) < 2 then
    raise exception 'Bitte eine gueltige E-Mail-Adresse angeben.';
  end if;

  if length(p_token) < 24 then
    raise exception 'Das Einladungstoken ist zu kurz.';
  end if;

  if exists (
    select 1 from public.benutzer
     where mandant_id = v_mandant and lower(email) = v_email
  ) then
    raise exception 'Diese Adresse gehoert bereits zum Unternehmen.';
  end if;

  select (select count(*) from public.benutzer where mandant_id = v_mandant and aktiv)
       + (select count(*) from public.einladungen where mandant_id = v_mandant
           and eingeloest_am is null and widerrufen_am is null and gueltig_bis > now())
    into v_belegt;
  v_limit := intern.benutzer_limit(v_mandant);
  if v_belegt >= v_limit then
    raise exception 'Benutzerlimit erreicht: % von % Plaetzen belegt. Bitte Tarif erweitern oder einen Zusatzbenutzer buchen.',
      v_belegt, v_limit;
  end if;

  insert into public.einladungen (
    mandant_id, email, rolle, rechte_uebersteuerung, token_hash, eingeladen_von
  )
  values (
    v_mandant, v_email, p_rolle, coalesce(p_rechte, '{}'::jsonb),
    intern.token_hash(p_token), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Stripe-Ereignisse: idempotent (S9)
-- ---------------------------------------------------------------------------

-- true = neu, bitte verarbeiten; false = schon verarbeitet, nichts tun.
create or replace function public.stripe_ereignis_beginnen(
  p_id text, p_typ text, p_nutzlast jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.stripe_ereignisse (id, typ, nutzlast)
  values (p_id, p_typ, p_nutzlast)
  on conflict (id) do nothing;
  if not found then
    -- Vorhanden: nur dann erneut verarbeiten, wenn der erste Versuch scheiterte.
    update public.stripe_ereignisse set fehler_text = null
     where id = p_id and verarbeitet_am is null and fehler_text is not null;
    return found;
  end if;
  return true;
end;
$$;

create or replace function public.stripe_ereignis_abschliessen(p_id text, p_fehler text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.stripe_ereignisse
     set verarbeitet_am = case when p_fehler is null then now() else null end,
         fehler_text = p_fehler
   where id = p_id
$$;

-- Kunde ↔ Mandant verknuepfen (nach Checkout).
create or replace function public.stripe_kunde_setzen(p_mandant uuid, p_kunde text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.abonnements set stripe_kunde_id = p_kunde where mandant_id = p_mandant
$$;

create or replace function public.mandant_fuer_stripe_kunde(p_kunde text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mandant_id from public.abonnements where stripe_kunde_id = p_kunde limit 1
$$;

-- Abo-Zustand aus einem Subscription-Ereignis uebernehmen.
create or replace function public.abo_uebernehmen(
  p_mandant         uuid,
  p_stripe_kunde    text,
  p_stripe_abo      text,
  p_stripe_status   text,
  p_tarif_schluessel text,
  p_intervall       text,
  p_zusatznutzer    integer,
  p_laufend_bis     timestamptz,
  p_gekuendigt_zum  timestamptz
)
returns public.abo_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.abo_status;
  v_tarif  uuid;
begin
  v_status := case p_stripe_status
    when 'active'     then 'aktiv'
    when 'trialing'   then 'aktiv'
    when 'past_due'   then 'zahlung_offen'
    when 'unpaid'     then 'zahlung_offen'
    when 'incomplete' then 'zahlung_offen'
    when 'paused'     then 'gesperrt'
    else 'gekuendigt'    -- canceled, incomplete_expired
  end;

  select id into v_tarif from public.tarife where schluessel = p_tarif_schluessel;

  update public.abonnements
     set stripe_kunde_id = coalesce(p_stripe_kunde, stripe_kunde_id),
         stripe_abo_id   = p_stripe_abo,
         stripe_status   = p_stripe_status,
         status          = v_status,
         tarif_id        = coalesce(v_tarif, tarif_id),
         intervall       = coalesce(p_intervall, intervall),
         zusatznutzer    = coalesce(p_zusatznutzer, zusatznutzer),
         laufend_bis     = coalesce(p_laufend_bis, laufend_bis),
         abgerechnet_bis = coalesce(p_laufend_bis, abgerechnet_bis),
         gekuendigt_zum  = p_gekuendigt_zum,
         zahlung_fehlgeschlagen_am = case when v_status = 'zahlung_offen' then coalesce(zahlung_fehlgeschlagen_am, now()) else null end
   where mandant_id = p_mandant;

  update public.mandanten
     set abo_status = v_status,
         lesemodus_seit = case when v_status in ('aktiv', 'zahlung_offen') then null else lesemodus_seit end,
         loeschung_geplant_am = case when v_status in ('aktiv', 'zahlung_offen') then null else loeschung_geplant_am end
   where id = p_mandant;

  return v_status;
end;
$$;

-- Bezahlte Abrechnungsperiode: Inklusiv-Credits genau einmal je Rechnung.
create or replace function public.abo_periode_gutschreiben(p_mandant uuid, p_rechnung text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_menge integer;
begin
  insert into public.abo_perioden (stripe_rechnung_id, mandant_id, gutgeschrieben)
  values (p_rechnung, p_mandant, 0)
  on conflict (stripe_rechnung_id) do nothing;
  if not found then
    return 0;   -- schon gutgeschrieben
  end if;

  update public.abonnements set zahlung_fehlgeschlagen_am = null where mandant_id = p_mandant;
  v_menge := public.credits_monat_zuteilen(p_mandant);
  update public.abo_perioden set gutgeschrieben = v_menge where stripe_rechnung_id = p_rechnung;
  return v_menge;
end;
$$;

-- Credit-Paket: genau einmal je Zahlung, zwoelf Monate gueltig (Masterprompt 14).
create or replace function public.credit_paket_gutschreiben(p_mandant uuid, p_paket text, p_zahlung text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_credits integer;
begin
  select credits into v_credits from public.preise where schluessel = p_paket and art = 'credit_paket';
  if v_credits is null then
    raise exception 'Unbekanntes Credit-Paket: %', p_paket;
  end if;

  insert into public.paketkaeufe (stripe_zahlung_id, mandant_id, paket, credits)
  values (p_zahlung, p_mandant, p_paket, v_credits)
  on conflict (stripe_zahlung_id) do nothing;
  if not found then
    return 0;
  end if;

  perform public.credits_gutschreiben(p_mandant, 'gekauft', v_credits, now() + interval '12 months',
                                      'Zusatzpaket ' || p_paket);
  return v_credits;
end;
$$;

create or replace function public.zahlung_fehlgeschlagen(p_mandant uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.abonnements
     set status = 'zahlung_offen', zahlung_fehlgeschlagen_am = coalesce(zahlung_fehlgeschlagen_am, now())
   where mandant_id = p_mandant and status in ('aktiv', 'zahlung_offen');
  update public.mandanten set abo_status = 'zahlung_offen'
   where id = p_mandant and abo_status in ('aktiv', 'zahlung_offen');
$$;

-- ---------------------------------------------------------------------------
-- 6a. Trigger pruefe_benutzer_aenderung: Der Systemlauf (abos_pruefen) darf
--     Zugaenge abschalten. Er hat keine Benutzersitzung, deshalb erkennt ihn
--     der Trigger an der Transaktionsmarke intern.systemlauf, die nur
--     abos_pruefen setzt (ausfuehrbar allein fuer die Dienstrolle). Alle
--     uebrigen Regeln bleiben unveraendert (Fassung 20260817183433).
-- ---------------------------------------------------------------------------

create or replace function intern.pruefe_benutzer_aenderung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verwaltung boolean := intern.ist_verwaltung();
  v_rolle      public.benutzerrolle := intern.aktuelle_rolle();
  v_selbst     boolean := new.id = auth.uid();
  v_systemlauf boolean := coalesce(current_setting('intern.systemlauf', true), '') = 'ja';
begin
  if new.mandant_id <> old.mandant_id then
    raise exception 'Der Mandant eines Benutzers kann nicht geaendert werden.';
  end if;

  if new.rolle <> old.rolle then
    if not v_verwaltung then
      raise exception 'Nur Inhaber und Administratoren duerfen Rollen aendern.';
    end if;
    if v_selbst then
      raise exception 'Die eigene Rolle kann nicht selbst geaendert werden.';
    end if;
  end if;

  if new.rechte_uebersteuerung <> old.rechte_uebersteuerung then
    if not v_verwaltung then
      raise exception 'Nur Inhaber und Administratoren duerfen Rechte aendern.';
    end if;
    if v_selbst then
      raise exception 'Die eigenen Rechte koennen nicht selbst geaendert werden.';
    end if;
  end if;

  if (old.rolle = 'inhaber' or new.rolle = 'inhaber')
     and old.rolle <> new.rolle
     and v_rolle <> 'inhaber' then
    raise exception 'Nur der Inhaber darf die Inhaberrolle vergeben oder entziehen.';
  end if;

  if new.aktiv <> old.aktiv and not v_verwaltung and not v_systemlauf then
    raise exception 'Nur Inhaber und Administratoren duerfen Zugaenge abschalten.';
  end if;

  if not new.aktiv and v_selbst then
    raise exception 'Der eigene Zugang kann nicht abgeschaltet werden.';
  end if;

  if lower(new.email) <> lower(old.email) and not v_verwaltung then
    raise exception 'Die E-Mail-Adresse kann nur die Verwaltung aendern.';
  end if;

  if (old.rolle = 'inhaber' and old.aktiv)
     and (new.rolle <> 'inhaber' or not new.aktiv)
     and not exists (
       select 1 from public.benutzer
        where mandant_id = old.mandant_id
          and rolle = 'inhaber'
          and aktiv
          and id <> old.id
     ) then
    raise exception 'Das Unternehmen braucht mindestens einen aktiven Inhaber.';
  end if;

  return new;
end;
$$;

comment on function intern.pruefe_benutzer_aenderung() is
  'Verhindert Rechteausweitung. Rolle und Rechte sind nie am eigenen Datensatz aenderbar — auch nicht durch die Verwaltung. Zugaenge schaltet ausser der Verwaltung nur der Systemlauf (Marke intern.systemlauf, gesetzt in abos_pruefen) ab.';

-- ---------------------------------------------------------------------------
-- 7. Taeglicher Lauf (S2, S3, S5): Lesemodus, Erinnerungen, Benutzerlimit
--
-- Wird vom Worker-Endpunkt aufgerufen. Jede Erinnerung entsteht als
-- Mail-Auftrag und wird ueber die Versandmarke genau einmal eingestellt.
-- ---------------------------------------------------------------------------

create or replace function public.abos_pruefen()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m record;
  v_lesemodus integer := 0;
  v_mails     integer := 0;
  v_abgeschaltet integer := 0;
  v_inhaber   text;
  v_limit     integer;
  v_aktiv     integer;
  v_b         record;
begin
  -- Testphase abgelaufen ohne Abo → Lesemodus, Loeschung in 30 Tagen (S3).
  for v_m in
    select m.* from public.mandanten m
     where m.abo_status = 'test' and m.testphase_bis <= now() and m.lesemodus_seit is null
  loop
    update public.mandanten
       set lesemodus_seit = now(), loeschung_geplant_am = v_m.testphase_bis + interval '30 days'
     where id = v_m.id;
    v_lesemodus := v_lesemodus + 1;
  end loop;

  -- Erinnerungen (S2 Tag 5 und 7, S3 Tag 23 und 29 nach Testende).
  for v_m in
    select m.* from public.mandanten m where m.abo_status = 'test'
  loop
    select email into v_inhaber from public.benutzer
     where mandant_id = v_m.id and rolle = 'inhaber' and aktiv
     order by erstellt_am limit 1;
    if v_inhaber is null then continue; end if;

    if v_m.erinnerung_tag5_am is null and now() >= v_m.testphase_bis - interval '2 days' and now() < v_m.testphase_bis then
      insert into public.jobs (mandant_id, art, nutzlast, prioritaet)
      values (v_m.id, 'mail', jsonb_build_object('vorlage', 'testphase_tag5', 'an', v_inhaber, 'mandant_id', v_m.id), 4);
      update public.mandanten set erinnerung_tag5_am = now() where id = v_m.id;
      v_mails := v_mails + 1;
    end if;

    if v_m.erinnerung_tag7_am is null and now() >= v_m.testphase_bis then
      insert into public.jobs (mandant_id, art, nutzlast, prioritaet)
      values (v_m.id, 'mail', jsonb_build_object('vorlage', 'testphase_tag7', 'an', v_inhaber, 'mandant_id', v_m.id), 4);
      update public.mandanten set erinnerung_tag7_am = now() where id = v_m.id;
      v_mails := v_mails + 1;
    end if;

    if v_m.loeschung_geplant_am is not null then
      if v_m.loeschwarnung_tag23_am is null and now() >= v_m.loeschung_geplant_am - interval '7 days' then
        insert into public.jobs (mandant_id, art, nutzlast, prioritaet)
        values (v_m.id, 'mail', jsonb_build_object('vorlage', 'loeschung_tag23', 'an', v_inhaber, 'mandant_id', v_m.id), 4);
        update public.mandanten set loeschwarnung_tag23_am = now() where id = v_m.id;
        v_mails := v_mails + 1;
      end if;
      if v_m.loeschwarnung_tag29_am is null and now() >= v_m.loeschung_geplant_am - interval '1 day' then
        insert into public.jobs (mandant_id, art, nutzlast, prioritaet)
        values (v_m.id, 'mail', jsonb_build_object('vorlage', 'loeschung_tag29', 'an', v_inhaber, 'mandant_id', v_m.id), 4);
        update public.mandanten set loeschwarnung_tag29_am = now() where id = v_m.id;
        v_mails := v_mails + 1;
      end if;
    end if;
  end loop;

  -- Benutzerlimit nach Downgrade (S5): zum Abrechnungstag werden die zuletzt
  -- angelegten Zugaenge abgeschaltet — nie der Inhaber. Der Systemlauf hat
  -- keine Benutzersitzung; die Transaktionsmarke intern.systemlauf oeffnet dem
  -- Trigger pruefe_benutzer_aenderung genau diesen Schritt (Abschnitt 6a).
  perform set_config('intern.systemlauf', 'ja', true);
  for v_m in
    select a.mandant_id, a.abgerechnet_bis from public.abonnements a
     where a.status = 'aktiv' and a.abgerechnet_bis is not null and a.abgerechnet_bis <= now()
  loop
    v_limit := intern.benutzer_limit(v_m.mandant_id);
    select count(*) into v_aktiv from public.benutzer where mandant_id = v_m.mandant_id and aktiv;
    for v_b in
      select id from public.benutzer
       where mandant_id = v_m.mandant_id and aktiv and rolle <> 'inhaber'
       order by erstellt_am desc
       limit greatest(0, v_aktiv - v_limit)
    loop
      update public.benutzer set aktiv = false where id = v_b.id;
      insert into public.audit_log (mandant_id, benutzer_id, aktion, ziel_art, ziel_id, details)
      values (v_m.mandant_id, null, 'zugang_abgeschaltet', 'benutzer', v_b.id::text,
              jsonb_build_object('grund', 'Benutzerlimit nach Tarifwechsel'));
      v_abgeschaltet := v_abgeschaltet + 1;
    end loop;
  end loop;
  perform set_config('intern.systemlauf', '', true);

  return jsonb_build_object('lesemodus', v_lesemodus, 'mails', v_mails, 'abgeschaltet', v_abgeschaltet);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte: Stripe- und Tagesfunktionen nur fuer die Dienstrolle;
-- mandant_zustand() fuer Angemeldete.
-- ---------------------------------------------------------------------------

revoke all on function public.stripe_ereignis_beginnen(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.stripe_ereignis_abschliessen(text, text) from public, anon, authenticated;
revoke all on function public.stripe_kunde_setzen(uuid, text) from public, anon, authenticated;
revoke all on function public.mandant_fuer_stripe_kunde(text) from public, anon, authenticated;
revoke all on function public.abo_uebernehmen(uuid, text, text, text, text, text, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.abo_periode_gutschreiben(uuid, text) from public, anon, authenticated;
revoke all on function public.credit_paket_gutschreiben(uuid, text, text) from public, anon, authenticated;
revoke all on function public.zahlung_fehlgeschlagen(uuid) from public, anon, authenticated;
revoke all on function public.abos_pruefen() from public, anon, authenticated;
grant execute on function public.stripe_ereignis_beginnen(text, text, jsonb) to service_role;
grant execute on function public.stripe_ereignis_abschliessen(text, text) to service_role;
grant execute on function public.stripe_kunde_setzen(uuid, text) to service_role;
grant execute on function public.mandant_fuer_stripe_kunde(text) to service_role;
grant execute on function public.abo_uebernehmen(uuid, text, text, text, text, text, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.abo_periode_gutschreiben(uuid, text) to service_role;
grant execute on function public.credit_paket_gutschreiben(uuid, text, text) to service_role;
grant execute on function public.zahlung_fehlgeschlagen(uuid) to service_role;
grant execute on function public.abos_pruefen() to service_role;

revoke all on function public.mandant_zustand() from public, anon;
grant execute on function public.mandant_zustand() to authenticated;
-- Die intern-Helfer bleiben fuer Benutzer unerreichbar (das Schema wird
-- ohnehin nicht ausgeliefert); die Dienstrolle darf sie direkt aufrufen.
revoke all on function intern.mandant_schreibbar(uuid) from public, anon, authenticated;
revoke all on function intern.benutzer_limit(uuid) from public, anon, authenticated;
grant execute on function intern.mandant_schreibbar(uuid) to service_role;
grant execute on function intern.benutzer_limit(uuid) to service_role;
