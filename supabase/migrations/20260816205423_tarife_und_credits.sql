-- ===========================================================================
-- Tarife, Abonnements und Credit-Ledger (Master-Prompt Abschnitt 14)
--
-- Harte Regeln, die hier in der Datenbank durchgesetzt werden — nicht in der
-- Anwendung, weil eine vergessene Pruefung dort Geld kostet:
--   * unveraenderbares Ledger (kein UPDATE, kein DELETE)
--   * kein negativer Saldo
--   * aelteste Credits zuerst
--   * Inklusiv-Credits nur in den unmittelbar folgenden Monat, begrenzt auf
--     ein regulaeres Monatskontingent
--   * gekaufte Credits 12 Monate gueltig
--   * reservierte Credits werden bei Fehlschlag automatisch freigegeben
--
-- Preise und Credit-Werte sind Daten, keine Konstanten im Code: Abschnitt 14
-- verlangt, dass sie ueber den Plattform-Admin aenderbar sind.
-- ===========================================================================

create type public.credit_herkunft as enum (
  'inklusiv',   -- monatliches Kontingent des Tarifs
  'uebertrag',  -- Rest des Vormonats
  'gekauft',    -- Zusatzpaket
  'test',       -- Testphase
  'gutschrift'  -- Kulanz durch den Betreiber
);

create type public.credit_richtung as enum (
  'zubuchung', 'reservierung', 'verbrauch', 'freigabe', 'erstattung'
);

create type public.vorgang_status as enum ('reserviert', 'eingeloest', 'freigegeben');

-- --- Tarife -----------------------------------------------------------------

create table public.tarife (
  id                  uuid primary key default gen_random_uuid(),
  schluessel          text not null unique,
  name                text not null,
  preis_monat_netto   numeric(10,2) not null check (preis_monat_netto >= 0),
  preis_jahr_netto    numeric(10,2) not null check (preis_jahr_netto >= 0),
  enthaltene_benutzer integer not null check (enthaltene_benutzer > 0),
  credits_monat       integer not null check (credits_monat >= 0),
  stripe_preis_monat  text,
  stripe_preis_jahr   text,
  reihenfolge         integer not null default 0,
  aktiv               boolean not null default true,
  erstellt_am         timestamptz not null default now(),
  geaendert_am        timestamptz not null default now()
);

comment on table public.tarife is
  'Preise sind Daten. Aenderungen laufen ueber den Plattform-Admin, nicht ueber ein Deployment.';

-- --- Credit-Preise je Aktion -------------------------------------------------

create table public.credit_preise (
  aktion      text primary key,
  bezeichnung text not null,
  credits     integer not null check (credits >= 0),
  aktiv_ab    timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

comment on table public.credit_preise is
  'Kosten je Aktion. 0 bedeutet kostenfrei — etwa der PDF-Export bestehender Inhalte.';

-- --- Abonnements -------------------------------------------------------------

create table public.abonnements (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null unique references public.mandanten(id) on delete cascade,
  tarif_id       uuid references public.tarife(id),
  intervall      text not null default 'monat' check (intervall in ('monat','jahr')),
  status         public.abo_status not null default 'test',
  zusatznutzer   integer not null default 0 check (zusatznutzer >= 0),
  stripe_kunde_id text,
  stripe_abo_id   text,
  laufend_bis    timestamptz,
  gekuendigt_zum timestamptz,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now()
);

-- --- Credit-Chargen ----------------------------------------------------------
-- Bewusst Chargen statt eines einzelnen Saldos: Nur so laesst sich „aelteste
-- Credits zuerst“ umsetzen und die unterschiedliche Gueltigkeit abbilden.

create table public.credit_konto (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  herkunft    public.credit_herkunft not null,
  menge       integer not null check (menge > 0),
  verbraucht  integer not null default 0 check (verbraucht >= 0),
  reserviert  integer not null default 0 check (reserviert >= 0),
  gueltig_ab  timestamptz not null default now(),
  gueltig_bis timestamptz,
  erstellt_am timestamptz not null default now(),

  -- Kein negativer Saldo — auf Ebene der einzelnen Charge.
  constraint credit_konto_deckung check (verbraucht + reserviert <= menge)
);

create index credit_konto_mandant_idx on public.credit_konto(mandant_id);
-- Fuer „aelteste zuerst“: nach Ablauf, dann nach Erstellung.
create index credit_konto_reihenfolge_idx
  on public.credit_konto(mandant_id, gueltig_bis nulls last, erstellt_am);

-- --- Vorgaenge ---------------------------------------------------------------
-- Klammert Reservierung und spaetere Einloesung oder Freigabe.

create table public.credit_vorgaenge (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  benutzer_id  uuid references public.benutzer(id) on delete set null,
  aktion       text not null,
  menge        integer not null check (menge >= 0),
  status       public.vorgang_status not null default 'reserviert',
  referenz_art text,
  referenz_id  uuid,
  kosten_cent  numeric(10,4),
  grund        text,
  erstellt_am  timestamptz not null default now(),
  beendet_am   timestamptz
);

create index credit_vorgaenge_mandant_idx on public.credit_vorgaenge(mandant_id);
create index credit_vorgaenge_offen_idx
  on public.credit_vorgaenge(mandant_id, status) where status = 'reserviert';

-- --- Ledger ------------------------------------------------------------------

create table public.credit_buchungen (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  konto_id    uuid references public.credit_konto(id) on delete set null,
  vorgang_id  uuid references public.credit_vorgaenge(id) on delete set null,
  benutzer_id uuid references public.benutzer(id) on delete set null,
  richtung    public.credit_richtung not null,
  aktion      text,
  menge       integer not null,
  kosten_cent numeric(10,4),
  bemerkung   text,
  erstellt_am timestamptz not null default now()
);

create index credit_buchungen_mandant_idx
  on public.credit_buchungen(mandant_id, erstellt_am desc);

comment on table public.credit_buchungen is
  'Unveraenderbares Ledger. UPDATE und DELETE sind per Trigger gesperrt.';

-- Unveraenderbarkeit erzwingen. Ein Ledger, das sich nachtraeglich aendern
-- laesst, ist als Nachweis wertlos.
create or replace function intern.ledger_unveraenderbar()
returns trigger language plpgsql
as $$
begin
  raise exception 'Das Credit-Ledger ist unveraenderbar (%).', tg_op;
end;
$$;

create trigger credit_buchungen_kein_update
  before update on public.credit_buchungen
  for each row execute function intern.ledger_unveraenderbar();

create trigger credit_buchungen_kein_delete
  before delete on public.credit_buchungen
  for each row execute function intern.ledger_unveraenderbar();

create trigger tarife_geaendert before update on public.tarife
  for each row execute function intern.setze_geaendert_am();
create trigger abonnements_geaendert before update on public.abonnements
  for each row execute function intern.setze_geaendert_am();

-- ===========================================================================
-- Fachliche Funktionen
--
-- security definer, weil sie in mehrere Tabellen schreiben und dabei die
-- Reihenfolge und Deckung garantieren muessen. Der Mandant wird IMMER aus der
-- Sitzung abgeleitet, nie als Parameter entgegengenommen — sonst waere ein
-- fremder Mandant belastbar.
-- ===========================================================================

create or replace function public.credits_verfuegbar()
returns integer language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(menge - verbraucht - reserviert), 0)::integer
  from public.credit_konto
  where mandant_id = intern.aktueller_mandant()
    and gueltig_ab <= now()
    and (gueltig_bis is null or gueltig_bis > now())
$$;

comment on function public.credits_verfuegbar() is
  'Verfuegbares Guthaben der Sitzung: Bestand abzueglich Verbrauch und Reservierungen.';

/**
 * Reserviert Credits fuer eine Aktion und liefert die Vorgangskennung.
 *
 * Reicht das Guthaben nicht, schlaegt der Aufruf fehl — es entsteht KEIN
 * negativer Saldo. Verbraucht werden die aeltesten Chargen zuerst.
 */
create or replace function public.credits_reservieren(
  p_aktion       text,
  p_referenz_art text default null,
  p_referenz_id  uuid default null
)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant  uuid := intern.aktueller_mandant();
  v_benutzer uuid := auth.uid();
  v_menge    integer;
  v_offen    integer;
  v_nehmen   integer;
  v_vorgang  uuid;
  v_charge   record;
begin
  if v_mandant is null then
    raise exception 'Kein Mandant in der Sitzung.';
  end if;

  select credits into v_menge from public.credit_preise
   where aktion = p_aktion and aktiv_ab <= now();

  if v_menge is null then
    raise exception 'Unbekannte Aktion: %', p_aktion;
  end if;

  insert into public.credit_vorgaenge
    (mandant_id, benutzer_id, aktion, menge, referenz_art, referenz_id)
  values (v_mandant, v_benutzer, p_aktion, v_menge, p_referenz_art, p_referenz_id)
  returning id into v_vorgang;

  -- Kostenfreie Aktionen werden protokolliert, belasten aber nichts.
  if v_menge = 0 then
    update public.credit_vorgaenge
       set status = 'eingeloest', beendet_am = now()
     where id = v_vorgang;
    return v_vorgang;
  end if;

  v_offen := v_menge;

  -- Aelteste zuerst. FOR UPDATE serialisiert gleichzeitige Reservierungen —
  -- ohne die Sperre koennten zwei Auftraege dieselbe Charge doppelt belegen.
  for v_charge in
    select id, (menge - verbraucht - reserviert) as frei
      from public.credit_konto
     where mandant_id = v_mandant
       and gueltig_ab <= now()
       and (gueltig_bis is null or gueltig_bis > now())
       and (menge - verbraucht - reserviert) > 0
     order by gueltig_bis nulls last, erstellt_am
     for update
  loop
    exit when v_offen <= 0;
    v_nehmen := least(v_offen, v_charge.frei);

    update public.credit_konto
       set reserviert = reserviert + v_nehmen
     where id = v_charge.id;

    insert into public.credit_buchungen
      (mandant_id, konto_id, vorgang_id, benutzer_id, richtung, aktion, menge)
    values (v_mandant, v_charge.id, v_vorgang, v_benutzer,
            'reservierung', p_aktion, v_nehmen);

    v_offen := v_offen - v_nehmen;
  end loop;

  if v_offen > 0 then
    raise exception 'Nicht genuegend Credits: % benoetigt, % verfuegbar.',
      v_menge, v_menge - v_offen
      using errcode = 'check_violation';
  end if;

  return v_vorgang;
end;
$$;

/** Bucht eine Reservierung endgueltig ab, sobald die Aktion gelungen ist. */
create or replace function public.credits_einloesen(
  p_vorgang     uuid,
  p_kosten_cent numeric default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_buchung record;
begin
  perform 1 from public.credit_vorgaenge
   where id = p_vorgang and mandant_id = v_mandant and status = 'reserviert';
  if not found then
    return;  -- bereits abgeschlossen oder fremd: nichts zu tun
  end if;

  for v_buchung in
    select konto_id, menge from public.credit_buchungen
     where vorgang_id = p_vorgang and richtung = 'reservierung'
  loop
    update public.credit_konto
       set reserviert = reserviert - v_buchung.menge,
           verbraucht = verbraucht + v_buchung.menge
     where id = v_buchung.konto_id;

    insert into public.credit_buchungen
      (mandant_id, konto_id, vorgang_id, richtung, menge, kosten_cent)
    values (v_mandant, v_buchung.konto_id, p_vorgang,
            'verbrauch', v_buchung.menge, p_kosten_cent);
  end loop;

  update public.credit_vorgaenge
     set status = 'eingeloest', beendet_am = now(), kosten_cent = p_kosten_cent
   where id = p_vorgang;
end;
$$;

/**
 * Gibt eine Reservierung wieder frei.
 *
 * Abschnitt 14: Bei technisch fehlgeschlagenen KI-Auftraegen werden reservierte
 * Credits automatisch freigegeben. Der Nutzer soll fuer einen Fehler der
 * Plattform nicht zahlen.
 */
create or replace function public.credits_freigeben(
  p_vorgang uuid,
  p_grund   text default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid := intern.aktueller_mandant();
  v_buchung record;
begin
  perform 1 from public.credit_vorgaenge
   where id = p_vorgang and mandant_id = v_mandant and status = 'reserviert';
  if not found then
    return;
  end if;

  for v_buchung in
    select konto_id, menge from public.credit_buchungen
     where vorgang_id = p_vorgang and richtung = 'reservierung'
  loop
    update public.credit_konto
       set reserviert = reserviert - v_buchung.menge
     where id = v_buchung.konto_id;

    insert into public.credit_buchungen
      (mandant_id, konto_id, vorgang_id, richtung, menge, bemerkung)
    values (v_mandant, v_buchung.konto_id, p_vorgang,
            'freigabe', v_buchung.menge, p_grund);
  end loop;

  update public.credit_vorgaenge
     set status = 'freigegeben', beendet_am = now(), grund = p_grund
   where id = p_vorgang;
end;
$$;

/** Schreibt Credits gut — Inklusivkontingent, Zusatzpaket oder Kulanz. */
create or replace function public.credits_gutschreiben(
  p_mandant     uuid,
  p_herkunft    public.credit_herkunft,
  p_menge       integer,
  p_gueltig_bis timestamptz default null,
  p_bemerkung   text default null
)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_konto uuid;
begin
  if p_menge <= 0 then
    raise exception 'Die Gutschrift muss groesser als null sein.';
  end if;

  insert into public.credit_konto (mandant_id, herkunft, menge, gueltig_bis)
  values (p_mandant, p_herkunft, p_menge, p_gueltig_bis)
  returning id into v_konto;

  insert into public.credit_buchungen
    (mandant_id, konto_id, richtung, menge, bemerkung)
  values (p_mandant, v_konto, 'zubuchung', p_menge, p_bemerkung);

  return v_konto;
end;
$$;

/**
 * Monatliche Zuteilung mit Uebertragsregel.
 *
 * Abschnitt 14: Nicht verbrauchte Inklusiv-Credits gehen hoechstens in den
 * unmittelbar folgenden Monat ueber, und hoechstens in Hoehe eines regulaeren
 * Monatskontingents. Alles darueber verfaellt.
 */
create or replace function public.credits_monat_zuteilen(p_mandant uuid)
returns integer language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_kontingent integer;
  v_rest       integer;
  v_uebertrag  integer;
begin
  select t.credits_monat into v_kontingent
    from public.abonnements a
    join public.tarife t on t.id = a.tarif_id
   where a.mandant_id = p_mandant;

  if v_kontingent is null then
    return 0;  -- ohne Tarif kein Kontingent
  end if;

  -- Rest aus Inklusiv- und Uebertragschargen ermitteln und schliessen.
  select coalesce(sum(menge - verbraucht - reserviert), 0) into v_rest
    from public.credit_konto
   where mandant_id = p_mandant
     and herkunft in ('inklusiv', 'uebertrag')
     and (gueltig_bis is null or gueltig_bis > now());

  update public.credit_konto
     set gueltig_bis = now()
   where mandant_id = p_mandant
     and herkunft in ('inklusiv', 'uebertrag')
     and (gueltig_bis is null or gueltig_bis > now());

  -- Uebertrag ist auf ein Monatskontingent gedeckelt.
  v_uebertrag := least(v_rest, v_kontingent);

  if v_uebertrag > 0 then
    perform public.credits_gutschreiben(
      p_mandant, 'uebertrag', v_uebertrag, now() + interval '1 month',
      'Uebertrag aus dem Vormonat, gedeckelt auf ein Monatskontingent');
  end if;

  perform public.credits_gutschreiben(
    p_mandant, 'inklusiv', v_kontingent, now() + interval '1 month',
    'Monatliches Inklusivkontingent');

  return v_kontingent + v_uebertrag;
end;
$$;

-- ===========================================================================
-- Row-Level-Security
-- ===========================================================================

alter table public.tarife            enable row level security;
alter table public.credit_preise     enable row level security;
alter table public.abonnements       enable row level security;
alter table public.credit_konto      enable row level security;
alter table public.credit_vorgaenge  enable row level security;
alter table public.credit_buchungen  enable row level security;

-- Tarife und Credit-Preise sind fuer alle Angemeldeten lesbar: Die Oberflaeche
-- muss anzeigen, was eine Aktion kostet. Geaendert werden sie ausschliesslich
-- ueber die Dienstrolle, also durch den Plattform-Admin.
create policy tarife_lesen on public.tarife
  for select to authenticated using (aktiv);
create policy credit_preise_lesen on public.credit_preise
  for select to authenticated using (true);

create policy abo_lesen on public.abonnements
  for select using (mandant_id = intern.aktueller_mandant());

create policy konto_lesen on public.credit_konto
  for select using (mandant_id = intern.aktueller_mandant());

create policy vorgaenge_lesen on public.credit_vorgaenge
  for select using (mandant_id = intern.aktueller_mandant());

create policy buchungen_lesen on public.credit_buchungen
  for select using (mandant_id = intern.aktueller_mandant());

-- Kein INSERT/UPDATE/DELETE fuer Angemeldete: Guthaben veraendern
-- ausschliesslich die Funktionen oben und die Dienstrolle. Wer selbst buchen
-- koennte, koennte sich Guthaben schenken.

grant execute on function public.credits_verfuegbar() to authenticated;
grant execute on function public.credits_reservieren(text, text, uuid) to authenticated;
grant execute on function public.credits_einloesen(uuid, numeric) to authenticated;
grant execute on function public.credits_freigeben(uuid, text) to authenticated;
revoke all on function public.credits_gutschreiben(uuid, public.credit_herkunft, integer, timestamptz, text) from public, authenticated;
revoke all on function public.credits_monat_zuteilen(uuid) from public, authenticated;

-- ===========================================================================
-- Startwerte (Abschnitt 14). Aenderbar ueber den Plattform-Admin.
-- ===========================================================================

insert into public.tarife
  (schluessel, name, preis_monat_netto, preis_jahr_netto, enthaltene_benutzer, credits_monat, reihenfolge)
values
  ('starter',      'Starter',       29.99,  299.90,  1,  300, 1),
  ('professional', 'Professional',  99.99,  999.90,  3, 1500, 2),
  ('business',     'Business',     199.99, 1999.90, 10, 4000, 3);

insert into public.credit_preise (aktion, bezeichnung, credits) values
  ('ki_text_einzeln',    'Einzelner KI-Text oder Textvariante',        2),
  ('ki_expose_komplett', 'Vollstaendige Expose-Texterstellung',       10),
  ('ki_marketing_paket', 'Marketingtext oder Social-Media-Paket',      5),
  ('ki_bild_optimierung','Einfache Bildoptimierung',                  10),
  ('ki_bild_homestaging','Umfangreiche Bildbearbeitung oder Homestaging', 30),
  ('ki_grundriss',       'Grundrissvisualisierung',                   30),
  ('signatur_versand',   'Versendeter Signaturvorgang je Dokumentenpaket', 5),
  ('pdf_export',         'PDF-Export eines bestehenden Inhalts',       0),
  ('web_expose',         'Web-Expose-Veroeffentlichung ohne neue KI-Erstellung', 0);
