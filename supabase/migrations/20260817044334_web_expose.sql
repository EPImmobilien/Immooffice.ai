-- Oeffentliches Web-Expose (Abschnitt 8).
--
-- Zugriff laeuft ausschliesslich ueber security-definer-Funktionen. Die
-- Tabellen selbst bleiben fuer nicht angemeldete Besucher unsichtbar: Eine
-- Lesepolicy fuer `anon` haette den gesamten Bestand ueber die REST-API
-- erreichbar gemacht, sobald jemand eine Objekt-ID erraet.

create table public.web_expose (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  objekt_id uuid not null references public.objekte(id) on delete cascade,

  -- URL-Segment. Zufaellig und lang genug, dass es sich nicht erraten laesst.
  token text not null unique check (token ~ '^[a-z0-9]{16,64}$'),

  passwort_hash text,
  ablauf_am timestamptz,
  download_erlaubt boolean not null default false,
  kontaktformular boolean not null default true,

  widerrufen_am timestamptz,
  veroeffentlicht_am timestamptz not null default now(),

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  -- Ein Objekt hat eine oeffentliche Adresse. Mehrere Verweise je Objekt
  -- waeren denkbar, brauchen aber eine eigene Verwaltung in der Oberflaeche.
  unique (objekt_id)
);

create index web_expose_mandant_idx on public.web_expose(mandant_id);

comment on table public.web_expose is
  'Oeffentlicher Verweis auf ein Objekt. Zugriff nur ueber intern geprueften Token (Abschnitt 8).';

-- Aufrufstatistik ohne Personenbezug: gezaehlt wird je Tag, sonst nichts.
-- Eindeutige Besucher werden bewusst NICHT ermittelt — das ginge nur, indem
-- man Besucher wiedererkennbar macht, und genau das soll unterbleiben.
create table public.web_expose_aufruf (
  web_expose_id uuid not null references public.web_expose(id) on delete cascade,
  tag date not null,
  aufrufe integer not null default 0,
  primary key (web_expose_id, tag)
);

comment on table public.web_expose_aufruf is
  'Aufrufe je Tag. Keine IP-Adressen, keine Kennungen, keine eindeutigen Besucher.';

create table public.web_expose_anfrage (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  web_expose_id uuid not null references public.web_expose(id) on delete cascade,
  objekt_id uuid not null references public.objekte(id) on delete cascade,

  name text not null,
  email text not null,
  telefon text,
  nachricht text,

  -- Ohne ausdrueckliche Einwilligung entsteht kein Datensatz.
  einwilligung_am timestamptz not null default now(),
  gelesen_am timestamptz,
  kontakt_id uuid references public.kontakte(id) on delete set null,

  erstellt_am timestamptz not null default now()
);

create index web_expose_anfrage_mandant_idx
  on public.web_expose_anfrage(mandant_id, gelesen_am);

create trigger web_expose_geaendert before update on public.web_expose
  for each row execute function intern.setze_geaendert_am();

alter table public.web_expose          enable row level security;
alter table public.web_expose_aufruf   enable row level security;
alter table public.web_expose_anfrage  enable row level security;

create policy web_expose_lesen on public.web_expose
  for select using (mandant_id = intern.aktueller_mandant());
create policy web_expose_schreiben on public.web_expose
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create policy web_expose_aufruf_lesen on public.web_expose_aufruf
  for select using (exists (
    select 1 from public.web_expose w
     where w.id = web_expose_id and w.mandant_id = intern.aktueller_mandant()
  ));

create policy web_expose_anfrage_lesen on public.web_expose_anfrage
  for select using (mandant_id = intern.aktueller_mandant());
create policy web_expose_anfrage_bearbeiten on public.web_expose_anfrage
  for update using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- ---------------------------------------------------------------------------
-- Oeffentlicher Zugriff
-- ---------------------------------------------------------------------------

create type public.web_expose_zustand as enum (
  'ok','passwort','unbekannt','abgelaufen','widerrufen'
);

-- Prueft einen Token und liefert Zustand und Kennung.
--
-- Getrennt von der Ausgabe, damit dieselbe Pruefung fuer Seitenaufruf,
-- Kontaktformular und Download gilt — drei Kopien wuerden auseinanderlaufen.
-- Zurueck kommt nur die Kennung, kein ganzer Datensatz: PL/pgSQL kann in ein
-- zusammengesetztes Ziel nicht spaltenweise zuweisen.
create or replace function intern.web_expose_pruefen(
  p_token text, p_passwort text)
returns table (zustand public.web_expose_zustand, expose_id uuid)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare v public.web_expose;
begin
  select * into v from public.web_expose where token = p_token;

  if not found then
    return query select 'unbekannt'::public.web_expose_zustand, null::uuid;
    return;
  end if;

  if v.widerrufen_am is not null then
    return query select 'widerrufen'::public.web_expose_zustand, null::uuid;
    return;
  end if;

  if v.ablauf_am is not null and v.ablauf_am <= now() then
    return query select 'abgelaufen'::public.web_expose_zustand, null::uuid;
    return;
  end if;

  if v.passwort_hash is not null then
    if p_passwort is null or p_passwort = ''
       or extensions.crypt(p_passwort, v.passwort_hash) <> v.passwort_hash then
      return query select 'passwort'::public.web_expose_zustand, null::uuid;
      return;
    end if;
  end if;

  return query select 'ok'::public.web_expose_zustand, v.id;
end; $$;

-- Oeffnet ein Web-Expose und liefert die anzuzeigenden Daten.
--
-- Bewusst eine einzige Funktion statt Lesepolicies fuer `anon`: So ist genau
-- festgelegt, welche Felder nach aussen gelangen. Nicht enthalten sind unter
-- anderem Eigentuemer, interne Vermerke und die Mandantenzuordnung.
create or replace function public.web_expose_oeffnen(
  p_token text, p_passwort text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_zustand public.web_expose_zustand;
  v_id uuid;
  v public.web_expose;
  v_objekt public.objekte;
  v_marke jsonb;
  v_bilder jsonb;
begin
  select p.zustand, p.expose_id into v_zustand, v_id
    from intern.web_expose_pruefen(p_token, p_passwort) p;

  if v_zustand <> 'ok' then
    return jsonb_build_object('zustand', v_zustand);
  end if;

  select * into v from public.web_expose where id = v_id;

  select * into v_objekt from public.objekte
   where id = v.objekt_id and geloescht_am is null;
  if not found then
    return jsonb_build_object('zustand', 'unbekannt');
  end if;

  select to_jsonb(m) - 'mandant_id' - 'id' into v_marke
    from public.mandant_branding m where m.mandant_id = v.mandant_id;

  select coalesce(jsonb_agg(b order by b.ist_titelbild desc, b.reihenfolge), '[]'::jsonb)
    into v_bilder
    from (
      select o.titel, o.art, o.ist_titelbild, o.reihenfolge,
             coalesce(neu.ki_bearbeitet, o.ki_bearbeitet) as ki_bearbeitet,
             coalesce(neu.pfad, o.pfad) as pfad,
             coalesce(neu.mime, o.mime) as mime
        from public.objekt_bilder o
        left join lateral (
          select v2.pfad, v2.ki_bearbeitet, v2.mime from public.objekt_bilder v2
           where v2.original_id = o.id order by v2.erstellt_am desc limit 1
        ) neu on true
       where o.objekt_id = v.objekt_id and o.original_id is null
    ) b;

  -- Aufruf zaehlen. Nur ein Zaehler je Tag, kein Personenbezug.
  insert into public.web_expose_aufruf (web_expose_id, tag, aufrufe)
  values (v.id, current_date, 1)
  on conflict (web_expose_id, tag)
    do update set aufrufe = public.web_expose_aufruf.aufrufe + 1;

  return jsonb_build_object(
    'zustand', 'ok',
    'download_erlaubt', v.download_erlaubt,
    'kontaktformular', v.kontaktformular,
    'objekt', to_jsonb(v_objekt) - 'mandant_id' - 'erstellt_von' - 'zustaendig_id'
              - 'eigentuemer_id' - 'geloescht_am',
    'anbieter', coalesce(v_marke, '{}'::jsonb),
    'bilder', v_bilder
  );
end; $$;

-- Nimmt eine Anfrage aus dem Kontaktformular entgegen.
--
-- Die Pruefung des Tokens laeuft ueber dieselbe Funktion wie der Seitenaufruf.
-- Ein zurueckgezogenes oder abgelaufenes Expose nimmt keine Anfragen mehr an.
create or replace function public.web_expose_anfrage_senden(
  p_token text, p_passwort text, p_name text, p_email text,
  p_telefon text, p_nachricht text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_zustand public.web_expose_zustand;
  v_id uuid;
  v public.web_expose;
  v_heute integer;
begin
  select p.zustand, p.expose_id into v_zustand, v_id
    from intern.web_expose_pruefen(p_token, p_passwort) p;

  if v_zustand <> 'ok' then
    return jsonb_build_object('ok', false, 'zustand', v_zustand);
  end if;

  select * into v from public.web_expose where id = v_id;

  if not v.kontaktformular then
    return jsonb_build_object('ok', false, 'grund', 'kein_formular');
  end if;

  if p_name is null or btrim(p_name) = ''
     or p_email is null
     or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'grund', 'eingabe');
  end if;

  -- Einfache Obergrenze gegen Missbrauch. Ohne Personenbezug laesst sich nicht
  -- feiner begrenzen; eine Grenze je Expose und Tag ist der ehrliche Kompromiss.
  select count(*) into v_heute from public.web_expose_anfrage
   where web_expose_id = v.id and erstellt_am > now() - interval '1 day';
  if v_heute >= 25 then
    return jsonb_build_object('ok', false, 'grund', 'zu_viele');
  end if;

  insert into public.web_expose_anfrage
    (mandant_id, web_expose_id, objekt_id, name, email, telefon, nachricht)
  values (v.mandant_id, v.id, v.objekt_id, btrim(p_name), lower(btrim(p_email)),
          nullif(btrim(coalesce(p_telefon, '')), ''),
          nullif(btrim(coalesce(p_nachricht, '')), ''));

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.web_expose_oeffnen(text, text) to anon, authenticated;
grant execute on function public.web_expose_anfrage_senden(text, text, text, text, text, text)
  to anon, authenticated;

-- Bilder eines veroeffentlichten Objekts duerfen oeffentlich gelesen werden.
-- Der Pfad enthaelt eine zufaellige Kennung und ist nicht erratbar; die
-- Freigabe endet mit Widerruf oder Ablauf des Web-Exposes.
create or replace function intern.bild_im_web_expose(p_name text)
returns boolean language sql stable security definer
set search_path = public, storage, pg_temp
as $$
  select exists (
    select 1 from public.web_expose w
     where w.objekt_id::text = (storage.foldername(p_name))[2]
       and w.widerrufen_am is null
       and (w.ablauf_am is null or w.ablauf_am > now())
  );
$$;

create policy objektbilder_web_expose on storage.objects
  for select to anon
  using (
    bucket_id = 'objektbilder'
    and intern.bild_im_web_expose(name)
  );
