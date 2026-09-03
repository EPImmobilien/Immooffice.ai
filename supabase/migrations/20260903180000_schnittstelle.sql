-- ===========================================================================
-- ImmoOffice.ai — Eigene Schnittstelle (docs/AUTONOMIE.md 5.4, Phase 5):
-- API-Schluessel je Mandant, Ratenbegrenzung, ausgehende Rueckrufe.
--
-- Ein Schluessel ist kein Benutzer: Er traegt Rechte je Bereich (Objekte,
-- Kontakte, Termine — keine, lesen, schreiben) und liegt nur als Hash vor.
-- Die Route Handler arbeiten mit der Dienstrolle und filtern IMMER nach dem
-- Mandanten des Schluessels; Schreiben ist im Lesemodus gesperrt.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. API-Schluessel
-- ---------------------------------------------------------------------------

create table public.api_schluessel (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  bezeichnung  text not null check (length(trim(bezeichnung)) between 1 and 120),
  -- Sichtbarer Anfang („io_ab12cd34“), damit ein Schluessel wiedererkannt wird
  praefix      text not null,
  hash         text not null unique,
  -- {"objekte":"schreiben","kontakte":"lesen","termine":"keine"}
  rechte       jsonb not null default '{"objekte":"schreiben","kontakte":"schreiben","termine":"schreiben"}'::jsonb,
  ratenlimit_pro_minute integer not null default 600 check (ratenlimit_pro_minute between 1 and 6000),
  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am  timestamptz not null default now(),
  zuletzt_verwendet_am timestamptz,
  widerrufen_am timestamptz,
  constraint api_schluessel_rechte check (
    jsonb_typeof(rechte) = 'object'
    and coalesce(rechte->>'objekte', 'keine') in ('keine', 'lesen', 'schreiben')
    and coalesce(rechte->>'kontakte', 'keine') in ('keine', 'lesen', 'schreiben')
    and coalesce(rechte->>'termine', 'keine') in ('keine', 'lesen', 'schreiben')
  )
);

create index api_schluessel_mandant on public.api_schluessel (mandant_id);

alter table public.api_schluessel enable row level security;

create policy api_schluessel_lesen on public.api_schluessel
  for select using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

create policy api_schluessel_anlegen on public.api_schluessel
  for insert with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

create policy api_schluessel_aendern on public.api_schluessel
  for update
  using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant());

-- Der Hash ist fuer Benutzer nicht lesbar; setzen (anlegen) ja, zurueckholen nie.
revoke select, update on public.api_schluessel from anon, authenticated;
grant select (id, mandant_id, bezeichnung, praefix, rechte, ratenlimit_pro_minute, erstellt_von, erstellt_am, zuletzt_verwendet_am, widerrufen_am)
  on public.api_schluessel to authenticated;
grant update (bezeichnung, rechte, ratenlimit_pro_minute, widerrufen_am) on public.api_schluessel to authenticated;

-- Aufrufe je Schluessel und Minute (Ratenbegrenzung). Nur Dienstrolle.
create table public.api_aufrufe (
  schluessel_id uuid not null references public.api_schluessel(id) on delete cascade,
  minute        timestamptz not null,
  anzahl        integer not null default 0,
  primary key (schluessel_id, minute)
);
create index api_aufrufe_minute on public.api_aufrufe (minute);
alter table public.api_aufrufe enable row level security;   -- keine Policy

-- Schluessel pruefen: Hash → Mandant, Rechte, Limit, Schreibsperre (Lesemodus).
create or replace function public.api_schluessel_pruefen(p_hash text)
returns table (schluessel_id uuid, mandant_id uuid, rechte jsonb, ratenlimit integer, schreibbar boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.mandant_id, s.rechte, s.ratenlimit_pro_minute, intern.mandant_schreibbar(s.mandant_id)
    from public.api_schluessel s
    join public.mandanten m on m.id = s.mandant_id
   where s.hash = p_hash and s.widerrufen_am is null and m.gesperrt_am is null
$$;

-- Aufruf zaehlen; liefert die Anzahl in der laufenden Minute (inklusive dieses Aufrufs).
create or replace function public.api_aufruf_zaehlen(p_schluessel uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_anzahl integer;
begin
  insert into public.api_aufrufe (schluessel_id, minute, anzahl)
  values (p_schluessel, v_minute, 1)
  on conflict (schluessel_id, minute) do update set anzahl = public.api_aufrufe.anzahl + 1
  returning anzahl into v_anzahl;
  update public.api_schluessel set zuletzt_verwendet_am = now()
   where id = p_schluessel and (zuletzt_verwendet_am is null or zuletzt_verwendet_am < now() - interval '1 minute');
  -- Alte Zaehler gelegentlich wegraeumen (billig: Index auf minute).
  if v_anzahl = 1 then
    delete from public.api_aufrufe where minute < now() - interval '2 hours';
  end if;
  return v_anzahl;
end;
$$;

revoke all on function public.api_schluessel_pruefen(text) from public, anon, authenticated;
revoke all on function public.api_aufruf_zaehlen(uuid) from public, anon, authenticated;
grant execute on function public.api_schluessel_pruefen(text) to service_role;
grant execute on function public.api_aufruf_zaehlen(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Rueckrufe (ausgehende Webhooks): Ziele je Mandant, Lieferungen mit
--    Wiederholung. Das Geheimnis liegt verschluesselt (AES-256-GCM, Anwendung)
--    und ist fuer Benutzer nicht lesbar.
-- ---------------------------------------------------------------------------

create table public.rueckruf_ziele (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  bezeichnung   text not null check (length(trim(bezeichnung)) between 1 and 120),
  url           text not null check (url ~ '^https://'),
  geheimnis_verschluesselt text not null,
  ereignisse    text[] not null default '{}'::text[]
    check (ereignisse <@ array['objekt.angelegt', 'kontakt.angelegt', 'termin.angelegt']::text[]),
  aktiv         boolean not null default true,
  fehler_zaehler integer not null default 0,
  letzter_fehler text,
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);

create index rueckruf_ziele_mandant on public.rueckruf_ziele (mandant_id);

create trigger rueckruf_ziele_geaendert before update on public.rueckruf_ziele
  for each row execute function intern.setze_geaendert_am();

alter table public.rueckruf_ziele enable row level security;

create policy rueckruf_ziele_lesen on public.rueckruf_ziele
  for select using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());
create policy rueckruf_ziele_schreiben on public.rueckruf_ziele
  for all
  using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

revoke select, update on public.rueckruf_ziele from anon, authenticated;
grant select (id, mandant_id, bezeichnung, url, ereignisse, aktiv, fehler_zaehler, letzter_fehler, erstellt_von, erstellt_am, geaendert_am)
  on public.rueckruf_ziele to authenticated;
grant update (bezeichnung, url, ereignisse, aktiv, geheimnis_verschluesselt) on public.rueckruf_ziele to authenticated;

create table public.rueckrufe (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  ziel_id       uuid not null references public.rueckruf_ziele(id) on delete cascade,
  ereignis      text not null,
  nutzlast      jsonb not null,
  status        text not null default 'offen' check (status in ('offen', 'zugestellt', 'fehler')),
  versuche      integer not null default 0,
  naechster_versuch_am timestamptz not null default now(),
  antwort_status integer,
  fehler_text   text,
  erstellt_am   timestamptz not null default now(),
  zugestellt_am timestamptz
);

create index rueckrufe_faellig on public.rueckrufe (naechster_versuch_am) where status = 'offen';
create index rueckrufe_mandant on public.rueckrufe (mandant_id, erstellt_am desc);

alter table public.rueckrufe enable row level security;

create policy rueckrufe_lesen on public.rueckrufe
  for select using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());

-- Erneut zustellen: Verwaltung setzt einen gescheiterten Rueckruf auf „offen“.
create policy rueckrufe_erneut on public.rueckrufe
  for update
  using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant());
revoke update on public.rueckrufe from anon, authenticated;
grant update (status, naechster_versuch_am, versuche) on public.rueckrufe to authenticated;

-- Einreihen: fuer jedes aktive Ziel des Mandanten, das das Ereignis abonniert hat.
create or replace function intern.rueckruf_einreihen(p_mandant uuid, p_ereignis text, p_nutzlast jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_anzahl integer;
begin
  insert into public.rueckrufe (mandant_id, ziel_id, ereignis, nutzlast)
  select z.mandant_id, z.id, p_ereignis, p_nutzlast
    from public.rueckruf_ziele z
   where z.mandant_id = p_mandant and z.aktiv and p_ereignis = any (z.ereignisse);
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

create or replace function intern.rueckruf_objekt_angelegt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform intern.rueckruf_einreihen(new.mandant_id, 'objekt.angelegt',
    jsonb_build_object('id', new.id, 'objektnummer', new.objektnummer, 'bezeichnung', new.bezeichnung, 'erstellt_am', new.erstellt_am));
  return new;
end; $$;

create or replace function intern.rueckruf_kontakt_angelegt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform intern.rueckruf_einreihen(new.mandant_id, 'kontakt.angelegt',
    jsonb_build_object('id', new.id, 'nachname', new.nachname, 'firma', new.firma, 'erstellt_am', new.erstellt_am));
  return new;
end; $$;

create or replace function intern.rueckruf_termin_angelegt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform intern.rueckruf_einreihen(new.mandant_id, 'termin.angelegt',
    jsonb_build_object('id', new.id, 'titel', new.titel, 'beginnt_am', new.beginnt_am, 'objekt_id', new.objekt_id, 'kontakt_id', new.kontakt_id));
  return new;
end; $$;

create trigger objekte_rueckruf  after insert on public.objekte  for each row execute function intern.rueckruf_objekt_angelegt();
create trigger kontakte_rueckruf after insert on public.kontakte for each row execute function intern.rueckruf_kontakt_angelegt();
create trigger termine_rueckruf  after insert on public.termine  for each row execute function intern.rueckruf_termin_angelegt();

-- Faellige Rueckrufe beanspruchen (Dienstrolle): Leihfrist fuenf Minuten,
-- damit zwei Arbeiter nicht dasselbe zustellen.
create or replace function public.rueckrufe_beanspruchen(p_anzahl integer default 20)
returns setof public.rueckrufe
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with faellig as (
    select r.id from public.rueckrufe r
     where r.status = 'offen' and r.naechster_versuch_am <= now()
     order by r.naechster_versuch_am
     limit least(greatest(coalesce(p_anzahl, 20), 1), 100)
       for update skip locked
  )
  update public.rueckrufe r
     set naechster_versuch_am = now() + interval '5 minutes', versuche = r.versuche + 1
    from faellig f
   where r.id = f.id
  returning r.*;
end;
$$;

-- Ergebnis eintragen: Erfolg, oder Wiederholung mit wachsendem Abstand
-- (2, 4, 8 … Minuten, hoechstens 60), nach acht Versuchen endgueltig gescheitert.
create or replace function public.rueckruf_ergebnis(p_id uuid, p_ok boolean, p_status integer, p_fehler text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.rueckrufe%rowtype;
begin
  select * into v_r from public.rueckrufe where id = p_id;
  if not found then return; end if;
  if p_ok then
    update public.rueckrufe set status = 'zugestellt', zugestellt_am = now(), antwort_status = p_status, fehler_text = null where id = p_id;
    update public.rueckruf_ziele set fehler_zaehler = 0, letzter_fehler = null where id = v_r.ziel_id;
  elsif v_r.versuche >= 8 then
    update public.rueckrufe set status = 'fehler', antwort_status = p_status, fehler_text = left(p_fehler, 500) where id = p_id;
    update public.rueckruf_ziele set fehler_zaehler = fehler_zaehler + 1, letzter_fehler = left(p_fehler, 500) where id = v_r.ziel_id;
  else
    update public.rueckrufe
       set antwort_status = p_status, fehler_text = left(p_fehler, 500),
           naechster_versuch_am = now() + make_interval(mins => least(power(2, v_r.versuche)::integer, 60))
     where id = p_id;
    update public.rueckruf_ziele set fehler_zaehler = fehler_zaehler + 1, letzter_fehler = left(p_fehler, 500) where id = v_r.ziel_id;
  end if;
end;
$$;

revoke all on function public.rueckrufe_beanspruchen(integer) from public, anon, authenticated;
revoke all on function public.rueckruf_ergebnis(uuid, boolean, integer, text) from public, anon, authenticated;
revoke all on function intern.rueckruf_einreihen(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rueckrufe_beanspruchen(integer) to service_role;
grant execute on function public.rueckruf_ergebnis(uuid, boolean, integer, text) to service_role;
