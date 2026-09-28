-- ===========================================================================
-- Fork-eigene Migration 19 — Zahlungsbedingungen und Rechnungsfreigabe
--
-- Abschnitt 3c des Auftrags:
--   "Zahlungsziele und Skonto: mehrere benannte Zahlungsbedingungen, eine
--    davon Standard. Der Text erscheint automatisch auf der Rechnung, das
--    Faelligkeitsdatum wird berechnet."
--   "Verantwortung Rechnungsfreigabe: Ist jemand gesetzt, gehen Rechnungen
--    erst nach dessen Freigabe raus: Entwurf -> zur Freigabe -> freigegeben
--    -> versendet. Optional gibt es eine Betragsgrenze."
--
-- WAS DIE VORLAGE HAT: rechnungen.zahlungsziel_tage als Zahl und
-- firma_stammdaten.zahlungsziel_tage als Vorgabe. Kein Skonto, kein Text,
-- keine benannten Bedingungen, keine Freigabe.
--
-- DER STATUSFLUSS der Vorlage ist entwurf -> gestellt -> bezahlt, dazu
-- storniert und storno_rechnung. Die beiden neuen Zustaende schieben sich
-- DAZWISCHEN; die vorhandenen bleiben, was sie sind. Ohne eingerichteten
-- Verantwortlichen aendert sich gar nichts: rechnung_stellen() nimmt weiter
-- einen Entwurf entgegen.
-- ===========================================================================

-- --- 1) Benannte Zahlungsbedingungen --------------------------------------
create table if not exists public.zahlungsbedingungen (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  gesellschaft_id uuid references public.gesellschaften(id) on delete cascade,
  name            text not null,
  netto_tage      integer not null default 14,
  skonto_prozent  numeric(5,2),
  skonto_tage     integer,
  text_auf_beleg  text,
  ist_standard    boolean not null default false,
  aktiv           boolean not null default true,
  sortierung      integer not null default 0,
  erstellt_am     timestamptz not null default now(),
  constraint zahlungsbedingungen_tage_check check (netto_tage >= 0),
  constraint zahlungsbedingungen_skonto_check
    check ((skonto_prozent is null and skonto_tage is null)
        or (skonto_prozent > 0 and skonto_prozent < 100
            and skonto_tage is not null and skonto_tage >= 0
            and skonto_tage <= netto_tage))
);

create index if not exists zahlungsbedingungen_mandant_id_idx
  on public.zahlungsbedingungen (mandant_id);

comment on table public.zahlungsbedingungen is
  'Benannte Zahlungsbedingungen je Gesellschaft, sonst je Konto. '
  'text_auf_beleg erscheint auf der Rechnung; fehlt er, setzt '
  'public.zahlungsbedingung_text() ihn aus den Zahlen zusammen.';
comment on column public.zahlungsbedingungen.skonto_tage is
  'Innerhalb wie vieler Tage der Skontoabzug gilt. Muss kleiner oder gleich '
  'netto_tage sein — ein Skontoziel nach dem Faelligkeitsdatum waere sinnlos, '
  'und die Pruefbedingung sagt das statt es zuzulassen.';

alter table public.zahlungsbedingungen
  alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.zahlungsbedingungen enable row level security;

drop policy if exists "zahlungsbedingungen_lesen" on public.zahlungsbedingungen;
create policy "zahlungsbedingungen_lesen" on public.zahlungsbedingungen
  for select to authenticated using (true);

drop policy if exists "zahlungsbedingungen_pflegen" on public.zahlungsbedingungen;
create policy "zahlungsbedingungen_pflegen" on public.zahlungsbedingungen
  for all to authenticated
  using (public.hat_recht('rechnungen') or public.hat_recht('admin'))
  with check (public.hat_recht('rechnungen') or public.hat_recht('admin'));

drop policy if exists "mandant_trennung" on public.zahlungsbedingungen;
create policy "mandant_trennung" on public.zahlungsbedingungen
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('zahlungsbedingungen', 'MANDANT', 'Zahlungsbedingungen des Mandanten')
on conflict (tabelle) do nothing;

-- Genau eine Standardbedingung je Gesellschaft.
create unique index if not exists zahlungsbedingungen_standard_idx
  on public.zahlungsbedingungen
     (mandant_id, coalesce(gesellschaft_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where ist_standard;

alter table public.rechnungen
  add column if not exists zahlungsbedingung_id uuid
    references public.zahlungsbedingungen(id) on delete set null;

-- --- 2) Der Text auf dem Beleg --------------------------------------------
-- Aus den Zahlen, wenn kein eigener Text hinterlegt ist. Rein rechnend, damit
-- Vorschau und Beleg denselben Satz zeigen.
create or replace function public.zahlungsbedingung_text(p_id uuid)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(
    nullif(btrim(z.text_auf_beleg), ''),
    case
      when z.skonto_prozent is null then
        'Zahlbar innerhalb von ' || z.netto_tage || ' Tagen ohne Abzug.'
      else
        'Zahlbar innerhalb von ' || z.skonto_tage || ' Tagen mit ' ||
        trim(trailing '.' from trim(trailing '0' from to_char(z.skonto_prozent, 'FM990.00'))) ||
        ' % Skonto, innerhalb von ' || z.netto_tage || ' Tagen ohne Abzug.'
    end)
  from public.zahlungsbedingungen z where z.id = p_id
$function$;

comment on function public.zahlungsbedingung_text(uuid) is
  'Der Satz, der auf dem Beleg steht. Eigener Text schlaegt die Zahlen; sonst '
  'wird er daraus gebildet. Rein rechnend — Vorschau und Beleg zeigen '
  'denselben Satz.';

grant execute on function public.zahlungsbedingung_text(uuid) to authenticated, service_role;

-- --- 3) Freigabe: Einstellungen je Gesellschaft ---------------------------
create table if not exists public.rechnung_einstellungen (
  id                 uuid primary key default gen_random_uuid(),
  mandant_id         uuid not null references public.mandanten(id) on delete cascade,
  gesellschaft_id    uuid references public.gesellschaften(id) on delete cascade,
  freigabe_durch     uuid references public.profiles(id) on delete set null,
  freigabe_ab_betrag numeric(12,2),
  erstellt_am        timestamptz not null default now(),
  geaendert_am       timestamptz not null default now()
);

create index if not exists rechnung_einstellungen_mandant_id_idx
  on public.rechnung_einstellungen (mandant_id);
create unique index if not exists rechnung_einstellungen_eindeutig_idx
  on public.rechnung_einstellungen
     (mandant_id, coalesce(gesellschaft_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.rechnung_einstellungen is
  'Rechnungs-Einstellungen je Gesellschaft, sonst je Konto. Ist '
  'freigabe_durch gesetzt, geht keine Rechnung ohne Freigabe dieser Person '
  'raus. freigabe_ab_betrag begrenzt das auf Betraege ab dieser Hoehe; leer '
  'heisst: fuer jede Rechnung.';

alter table public.rechnung_einstellungen
  alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.rechnung_einstellungen enable row level security;

drop policy if exists "rechnung_einstellungen_lesen" on public.rechnung_einstellungen;
create policy "rechnung_einstellungen_lesen" on public.rechnung_einstellungen
  for select to authenticated using (true);

drop policy if exists "rechnung_einstellungen_pflegen" on public.rechnung_einstellungen;
create policy "rechnung_einstellungen_pflegen" on public.rechnung_einstellungen
  for all to authenticated
  using (public.hat_recht('admin')) with check (public.hat_recht('admin'));

drop policy if exists "mandant_trennung" on public.rechnung_einstellungen;
create policy "mandant_trennung" on public.rechnung_einstellungen
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('rechnung_einstellungen', 'MANDANT', 'Rechnungs-Einstellungen des Mandanten')
on conflict (tabelle) do nothing;

-- --- 4) Zwei neue Zustaende, zwischen Entwurf und Gestellt ----------------
alter table public.rechnungen drop constraint if exists rechnungen_status_check;
alter table public.rechnungen add constraint rechnungen_status_check
  check (status = any (array['entwurf', 'zur_freigabe', 'freigegeben',
                             'gestellt', 'storniert', 'storno_rechnung', 'bezahlt']));

-- --- 5) Braucht diese Rechnung eine Freigabe? -----------------------------
create or replace function public.rechnung_braucht_freigabe(p_rechnung_id uuid)
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_ges    uuid;
  v_betrag numeric;
  e        public.rechnung_einstellungen%rowtype;
begin
  select f.gesellschaft_id, coalesce(r.bruttobetrag, 0)
    into v_ges, v_betrag
    from public.rechnungen r
    left join public.firma_stammdaten f on f.id = r.absender_firma_id
   where r.id = p_rechnung_id;

  select * into e from public.rechnung_einstellungen
   where gesellschaft_id is not distinct from v_ges limit 1;
  if e.id is null then
    select * into e from public.rechnung_einstellungen
     where gesellschaft_id is null limit 1;
  end if;

  if e.freigabe_durch is null then return null; end if;
  if e.freigabe_ab_betrag is not null and v_betrag < e.freigabe_ab_betrag then
    return null;
  end if;
  return e.freigabe_durch;
end;
$function$;

comment on function public.rechnung_braucht_freigabe(uuid) is
  'Wer diese Rechnung freigeben muss, oder null. Beruecksichtigt die '
  'Betragsgrenze. Dieselbe Funktion entscheidet in rechnung_stellen() und '
  'zeigt es in der Oberflaeche an — zwei Fassungen liefen auseinander.';

grant execute on function public.rechnung_braucht_freigabe(uuid) to authenticated, service_role;

-- --- 6) Zur Freigabe geben und freigeben ----------------------------------
create or replace function public.rechnung_zur_freigabe(p_rechnung_id uuid)
 returns void
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare v_status text; v_name text;
begin
  perform public.mandant_sichern('rechnungen', p_rechnung_id);
  select status into v_status from public.rechnungen where id = p_rechnung_id;
  if v_status is null then raise exception 'Rechnung nicht gefunden.'; end if;
  if v_status <> 'entwurf' then
    raise exception 'Nur ein Entwurf kann zur Freigabe gegeben werden. Status: %', v_status;
  end if;
  select name into v_name from public.profiles where id = auth.uid();
  update public.rechnungen set status = 'zur_freigabe' where id = p_rechnung_id;
  insert into public.rechnungen_audit(rechnung_id, user_id, user_name, aktion, neue_daten)
  values (p_rechnung_id, auth.uid(), v_name, 'zur_freigabe',
          jsonb_build_object('freigeber', public.rechnung_braucht_freigabe(p_rechnung_id)));
end;
$function$;

create or replace function public.rechnung_freigeben(p_rechnung_id uuid)
 returns void
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare v_status text; v_name text; v_wer uuid;
begin
  perform public.mandant_sichern('rechnungen', p_rechnung_id);
  select status into v_status from public.rechnungen where id = p_rechnung_id;
  if v_status is null then raise exception 'Rechnung nicht gefunden.'; end if;
  if v_status <> 'zur_freigabe' then
    raise exception 'Nur eine Rechnung zur Freigabe kann freigegeben werden. Status: %', v_status;
  end if;

  v_wer := public.rechnung_braucht_freigabe(p_rechnung_id);
  -- Nur der Benannte gibt frei. Ein Chef darf es nicht "auch" — sonst waere
  -- die Freigabe eine Empfehlung und keine Kontrolle.
  if v_wer is not null and v_wer <> auth.uid() then
    raise exception 'Diese Rechnung gibt eine andere Person frei.'
      using errcode = '42501';
  end if;

  select name into v_name from public.profiles where id = auth.uid();
  update public.rechnungen set status = 'freigegeben' where id = p_rechnung_id;
  insert into public.rechnungen_audit(rechnung_id, user_id, user_name, aktion, neue_daten)
  values (p_rechnung_id, auth.uid(), v_name, 'freigegeben', '{}'::jsonb);
end;
$function$;

grant execute on function public.rechnung_zur_freigabe(uuid) to authenticated, service_role;
grant execute on function public.rechnung_freigeben(uuid) to authenticated, service_role;

-- --- 7) rechnung_stellen() achtet auf die Freigabe -------------------------
do $$
declare quelle text; neu text; oid_ oid;
begin
  select p.oid into oid_ from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rechnung_stellen';
  if oid_ is null then raise exception 'rechnung_stellen() gibt es nicht.'; end if;
  quelle := pg_get_functiondef(oid_);
  if quelle like '%rechnung_braucht_freigabe%' then return; end if;

  neu := replace(quelle,
    E'  IF v_status <> ''entwurf'' THEN RAISE EXCEPTION ''Nur Entwuerfe stellen. Status: %'', v_status; END IF;',
    E'  -- Ist ein Verantwortlicher eingerichtet, muss die Rechnung freigegeben\n'
    '  -- sein. Ohne Verantwortlichen bleibt es beim bisherigen Weg.\n'
    '  IF public.rechnung_braucht_freigabe(p_rechnung_id) IS NOT NULL THEN\n'
    '    IF v_status <> ''freigegeben'' THEN\n'
    '      RAISE EXCEPTION ''Diese Rechnung braucht erst eine Freigabe. Status: %'', v_status;\n'
    '    END IF;\n'
    '  ELSIF v_status <> ''entwurf'' THEN\n'
    '    RAISE EXCEPTION ''Nur Entwuerfe stellen. Status: %'', v_status;\n'
    '  END IF;');

  if neu = quelle then
    raise exception 'Die erwartete Stelle in rechnung_stellen() fehlt — '
                    'die Vorlage hat sich geaendert.';
  end if;
  execute neu;

  if pg_get_functiondef(oid_) not like '%rechnung_braucht_freigabe%' then
    raise exception 'Die Freigabepruefung ist in rechnung_stellen() nicht angekommen.';
  end if;
end $$;

-- --- 8) Das Faelligkeitsdatum aus der Bedingung ---------------------------
create or replace function public.rechnung_faelligkeit(p_rechnung_id uuid)
 returns date
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(r.ausstellungsdatum, current_date)
       + coalesce(z.netto_tage, r.zahlungsziel_tage, 14)
    from public.rechnungen r
    left join public.zahlungsbedingungen z on z.id = r.zahlungsbedingung_id
   where r.id = p_rechnung_id
$function$;

grant execute on function public.rechnung_faelligkeit(uuid) to authenticated, service_role;
