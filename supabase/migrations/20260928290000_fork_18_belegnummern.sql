-- ===========================================================================
-- Fork-eigene Migration 18 — frei gestaltbare Belegnummern
--
-- Angefordert am 28.09.2026: "auch die Rechnungsnummer varianten muessen wie
-- bei onoffice irgendwie gepflegt werden." Abschnitt 3c des Auftrags nennt es
-- genauer: ein Muster aus Praefix, Jahr, Monat, fortlaufender Zahl mit n
-- Stellen, Trennzeichen und optionalem Standort-Kuerzel, dazu ein eigener
-- Kreis fuer Gutschriften und eine Ruecksetzung jaehrlich, monatlich oder nie.
--
-- WAS DIE VORLAGE HAT: firma_stammdaten.rechnung_nummer_praefix und
-- rechnung_nummer_mit_jahr, dazu rechnung_nummern_sequence(firma_id, jahr) und
-- naechste_rechnungsnummer(). Ergebnis ist immer PRAEFIX-JAHR-001 mit drei
-- Stellen. Kein Muster, kein Monat, kein zweiter Kreis.
--
-- WAS DIESE MIGRATION NICHT TUT: Sie fasst rechnung_nummern_sequence NICHT an.
-- Dort stehen bereits vergebene Nummern; ein Umbau daran waere ein Eingriff in
-- eine Nummernfolge, die nach GoBD lueckenlos sein muss. Der neue Kreis steht
-- daneben. naechste_rechnungsnummer() benutzt ihn, SOBALD einer eingerichtet
-- ist, und verhaelt sich sonst wie bisher. Wer nichts einstellt, merkt nichts.
--
-- JE GESELLSCHAFT, wie Abschnitt 1a es verlangt: "Jede Gesellschaft hat einen
-- eigenen Rechnungs-Nummernkreis." Ohne Gesellschaft gilt der Kreis fuer das
-- ganze Konto — der Einzelmakler richtet einen ein und ist fertig.
-- ===========================================================================

create table if not exists public.belegnummernkreise (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  gesellschaft_id uuid references public.gesellschaften(id) on delete cascade,
  art             text not null,
  muster          text not null,
  zuruecksetzen   text not null default 'jaehrlich',
  -- Zaehler und Konfiguration in EINER Zeile. Das ist kein Schoenheitsfehler,
  -- sondern der Grund, warum die Vergabe transaktionssicher ist: ein einziges
  -- update mit returning, kein Lesen-dann-Schreiben.
  periode         text not null default '',
  letzte_nummer   integer not null default 0,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),
  constraint belegnummernkreise_art_check
    check (art in ('rechnung', 'gutschrift')),
  constraint belegnummernkreise_zuruecksetzen_check
    check (zuruecksetzen in ('jaehrlich', 'monatlich', 'nie'))
);

-- Ein Kreis je Art und Gesellschaft. coalesce statt "unique nulls not
-- distinct", damit die Migration auch auf aelteren Postgres-Staenden laeuft.
create unique index if not exists belegnummernkreise_eindeutig_idx
  on public.belegnummernkreise
     (mandant_id,
      coalesce(gesellschaft_id, '00000000-0000-0000-0000-000000000000'::uuid),
      art);

-- Eigener Index auf mandant_id: der eindeutige Index oben faengt zwar mit
-- derselben Spalte an, aber tests/mandant-einstufung.sql verlangt fuer jede
-- Mandantentabelle einen eigenen — und das zu Recht, denn ein zusammengesetzter
-- Index bleibt eine Wette darauf, dass der Planer ihn auch fuer die einfache
-- Bedingung nimmt.
create index if not exists belegnummernkreise_mandant_id_idx
  on public.belegnummernkreise (mandant_id);

comment on table public.belegnummernkreise is
  'Frei gestaltbare Belegnummern je Gesellschaft und Art. Muster mit '
  'Platzhaltern, siehe public.belegnummer_aus_muster(). Traegt auch den '
  'Zaehler — die Vergabe ist damit ein einziges update und lueckenlos.';
comment on column public.belegnummernkreise.gesellschaft_id is
  'Leer = gilt fuer das ganze Konto. Gesetzt = eigener Kreis dieser '
  'Gesellschaft, wie Abschnitt 1a des Auftrags es verlangt.';
comment on column public.belegnummernkreise.periode is
  'Die Periode, auf die letzte_nummer sich bezieht: "2026" bei jaehrlich, '
  '"2026-09" bei monatlich, "immer" bei nie. Wechselt die Periode, faengt '
  'der Zaehler wieder bei 1 an.';

alter table public.belegnummernkreise
  alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.belegnummernkreise enable row level security;

drop policy if exists "belegnummernkreise_lesen" on public.belegnummernkreise;
create policy "belegnummernkreise_lesen" on public.belegnummernkreise
  for select to authenticated using (true);

-- Aendern nur mit dem Modul "rechnungen" oder "admin".
drop policy if exists "belegnummernkreise_pflegen" on public.belegnummernkreise;
create policy "belegnummernkreise_pflegen" on public.belegnummernkreise
  for all to authenticated
  using (public.hat_recht('rechnungen') or public.hat_recht('admin'))
  with check (public.hat_recht('rechnungen') or public.hat_recht('admin'));

drop policy if exists "mandant_trennung" on public.belegnummernkreise;
create policy "mandant_trennung" on public.belegnummernkreise
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('belegnummernkreise', 'MANDANT', 'Belegnummernkreise des Mandanten')
on conflict (tabelle) do nothing;

-- --- Das Muster ausfuellen -------------------------------------------------
-- Rein rechnend, ohne Seiteneffekt: dieselbe Funktion erzeugt die Vorschau in
-- der Oberflaeche und die echte Nummer. Zwei Fassungen derselben Regel waeren
-- genau die Gefahrenquelle, die bei hat_recht() schon einmal aufgefallen ist.
create or replace function public.belegnummer_aus_muster(
  p_muster text,
  p_nummer integer,
  p_standort text default null,
  p_zeit timestamptz default now())
 returns text
 language plpgsql
 immutable
as $function$
declare
  t   text := coalesce(p_muster, '');
  m   text[];
  z   timestamptz := coalesce(p_zeit, now());
begin
  -- Jahr, Monat, Tag.
  t := replace(t, '{JJJJ}', to_char(z, 'YYYY'));
  t := replace(t, '{JJ}',   to_char(z, 'YY'));
  t := replace(t, '{MM}',   to_char(z, 'MM'));
  t := replace(t, '{TT}',   to_char(z, 'DD'));
  -- Standort-Kuerzel; ohne Kuerzel faellt der Platzhalter ersatzlos weg.
  t := replace(t, '{STANDORT}', coalesce(p_standort, ''));
  -- Die fortlaufende Zahl: {#} bis {##########}, die Anzahl der Rauten ist
  -- die Anzahl der Stellen.
  for m in select regexp_matches(t, '\{(#+)\}', 'g') loop
    t := replace(t, '{' || m[1] || '}',
                 lpad(coalesce(p_nummer, 0)::text, length(m[1]), '0'));
  end loop;
  -- Zwei Trennzeichen hintereinander entstehen, wenn ein Platzhalter leer
  -- bleibt. Das sieht nach Fehler aus, also weg damit.
  t := regexp_replace(t, '([-_/.])\1+', '\1', 'g');
  t := regexp_replace(t, '^[-_/.]+|[-_/.]+$', '', 'g');
  return t;
end;
$function$;

comment on function public.belegnummer_aus_muster(text, integer, text, timestamptz) is
  'Fuellt ein Belegnummern-Muster aus. Platzhalter: {JJJJ} {JJ} {MM} {TT} '
  '{STANDORT} und {#} bis {##########} fuer die fortlaufende Zahl. Leere '
  'Platzhalter hinterlassen keine doppelten Trennzeichen. Rein rechnend — '
  'dieselbe Funktion erzeugt Vorschau und echte Nummer.';

grant execute on function public.belegnummer_aus_muster(text, integer, text, timestamptz)
  to authenticated, service_role;

-- --- Die naechste Nummer ziehen --------------------------------------------
-- Lueckenlos und transaktionssicher: EIN update mit returning. Kein Lesen,
-- dann Rechnen, dann Schreiben — dazwischen passt ein zweiter Aufruf.
create or replace function public.naechste_belegnummer(
  p_gesellschaft uuid,
  p_art text default 'rechnung',
  p_standort_kuerzel text default null)
 returns text
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  k          public.belegnummernkreise%rowtype;
  v_periode  text;
  v_nummer   integer;
begin
  if p_art not in ('rechnung', 'gutschrift') then
    raise exception 'Unbekannte Belegart: %', p_art;
  end if;

  -- Erst der Kreis der Gesellschaft, sonst der des Kontos.
  select * into k from public.belegnummernkreise
   where art = p_art
     and (not public.mandant_grenze_gilt()
          or mandant_id = public.aktuelle_mandant_id())
     and (gesellschaft_id = p_gesellschaft
          or (p_gesellschaft is null and gesellschaft_id is null))
   limit 1;

  if k.id is null then
    select * into k from public.belegnummernkreise
     where art = p_art and gesellschaft_id is null
       and (not public.mandant_grenze_gilt()
            or mandant_id = public.aktuelle_mandant_id())
     limit 1;
  end if;

  if k.id is null then
    return null;  -- kein Kreis eingerichtet; der Aufrufer nimmt den alten Weg
  end if;

  perform public.mandant_sichern('gesellschaften', p_gesellschaft);

  v_periode := case k.zuruecksetzen
                 when 'monatlich' then to_char(now(), 'YYYY-MM')
                 when 'jaehrlich' then to_char(now(), 'YYYY')
                 else 'immer' end;

  update public.belegnummernkreise
     set letzte_nummer = case when periode = v_periode then letzte_nummer + 1 else 1 end,
         periode       = v_periode,
         geaendert_am  = now()
   where id = k.id
   returning letzte_nummer into v_nummer;

  return public.belegnummer_aus_muster(k.muster, v_nummer, p_standort_kuerzel);
end;
$function$;

comment on function public.naechste_belegnummer(uuid, text, text) is
  'Zieht die naechste Belegnummer aus dem Kreis der Gesellschaft, sonst dem '
  'des Kontos. EIN update mit returning — damit lueckenlos und auch bei '
  'gleichzeitigen Aufrufen eindeutig. Gibt null zurueck, wenn kein Kreis '
  'eingerichtet ist; dann gilt der bisherige Weg ueber '
  'naechste_rechnungsnummer().';

grant execute on function public.naechste_belegnummer(uuid, text, text)
  to authenticated, service_role;

-- --- Der alte Weg benutzt den neuen, sobald einer da ist -------------------
-- Die Signatur bleibt, damit kein Aufrufer sich aendern muss.
do $$
declare quelle text; neu text; oid_ oid;
begin
  select p.oid into oid_ from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'naechste_rechnungsnummer';
  if oid_ is null then
    raise exception 'naechste_rechnungsnummer() gibt es nicht.';
  end if;
  quelle := pg_get_functiondef(oid_);
  if quelle like '%naechste_belegnummer%' then
    return;
  end if;

  neu := replace(quelle,
    E'  SELECT rechnung_nummer_praefix, rechnung_nummer_mit_jahr\n    INTO v_praefix, v_mit_jahr\n  FROM public.firma_stammdaten WHERE id = p_firma_id;',
    E'  -- Ist fuer die Gesellschaft dieses Standorts ein eigener Kreis\n'
    '  -- eingerichtet (fork_18), gilt der. Sonst bleibt alles wie gehabt.\n'
    '  DECLARE v_ges uuid; v_kuerzel text; v_neu text;\n'
    '  BEGIN\n'
    '    SELECT gesellschaft_id, coalesce(nummernkreis_prefix, slug)\n'
    '      INTO v_ges, v_kuerzel\n'
    '      FROM public.firma_stammdaten WHERE id = p_firma_id;\n'
    '    v_neu := public.naechste_belegnummer(v_ges, ''rechnung'', v_kuerzel);\n'
    '    IF v_neu IS NOT NULL THEN RETURN v_neu; END IF;\n'
    '  END;\n'
    '\n'
    '  SELECT rechnung_nummer_praefix, rechnung_nummer_mit_jahr\n'
    '    INTO v_praefix, v_mit_jahr\n'
    '  FROM public.firma_stammdaten WHERE id = p_firma_id;');

  if neu = quelle then
    raise exception 'Die erwartete Stelle in naechste_rechnungsnummer() fehlt — '
                    'die Vorlage hat sich geaendert.';
  end if;
  execute neu;

  if pg_get_functiondef(oid_) not like '%naechste_belegnummer%' then
    raise exception 'Der neue Weg ist in naechste_rechnungsnummer() nicht angekommen.';
  end if;
end $$;
