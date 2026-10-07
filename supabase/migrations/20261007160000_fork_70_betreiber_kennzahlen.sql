-- ===========================================================================
-- Fork-eigene Migration 70 — Betreiberbereich, Schritt 3: Kennzahlen
--
-- AUFTRAG vom 07.10.2026, Abschnitt 3 und 4. Die verbindlichen Definitionen
-- stehen in docs/ADMIN.md; hier steht die eine Rechnung, aus der alle
-- Zahlen kommen — Dashboard, Tagesschnappschuss und Umsatzbereich lesen
-- dieselbe Funktion. Zwei Rechnungen fuer dieselbe Zahl laufen auseinander,
-- und dann stimmt eine davon, ohne dass jemand weiss, welche.
--
-- MRR (Auftrag): monatliche Nettobetraege aller aktiven, bezahlten Abos
-- inkl. Zusatznutzer; Jahresabos durch zwoelf; Gruender-Rabatt abgezogen;
-- Testkonten und Credit-Pakete nicht enthalten. "gekuendigt" zaehlt mit,
-- solange es laeuft (cancel_at in der Zukunft) — der Kunde zahlt noch.
--
-- DIE TAGESTABELLEN: Es gibt keine Historie der Abos, nur den Stand. Ab
-- heute schreibt pg_cron jede Nacht einen Schnappschuss je Mandant
-- (plattform_mandanten_tag) und die Summen (plattform_kennzahlen_tag).
-- Daraus entstehen MRR-Verlauf, Wasserfall, Kohorten, Kuendigungs- und
-- Umwandlungsquote — ehrlich erst ab dem ersten Schnappschuss. Die
-- Demo-Daten (Schritt 10) fuellen zwoelf Monate zurueck.
--
-- RUECKNAHME: cron.unschedule('plattform-kennzahlen-naechtlich'); drop
-- function plattform_kennzahlen_schreiben, plattform_mrr_je_mandant; drop
-- table plattform_kennzahlen_tag, plattform_mandanten_tag.
-- ===========================================================================

-- --- 1. Die eine Rechnung: Monatserloes je Mandant ------------------------
create or replace function public.plattform_mrr_je_mandant()
 returns table (mandant_id uuid, tarif text, intervall text, status text,
                zahlend boolean, mrr_cent integer, gruenderpreis boolean)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  -- Die Rollenpruefung steht IM Koerper: tests/funktionsrechte.sql verlangt,
  -- dass authenticated jede Funktion rufen darf — also muss die Funktion
  -- selbst wissen, wer fragt. Der Dienstschluessel (auth.uid() null) darf.
  if auth.uid() is not null and public.plattform_rolle() is null then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  return query
  with w as (
    select coalesce((select (wert)::text::int from public.plattform_werte where schluessel = 'gruender_rabatt_cent'), 0) as rabatt,
           coalesce((select (wert #>> '{}') from public.plattform_werte where schluessel = 'gruender_tarif'), 'starter') as gruender_tarif
  ), addon as (
    select preis_monat_cent, preis_jahr_cent from public.plattform_tarife where ist_zusatznutzer limit 1
  )
  select a.mandant_id, a.tarif, a.intervall, a.status,
         (a.status = 'aktiv' or (a.status = 'gekuendigt' and (a.cancel_at is null or a.cancel_at > now()))) as zahlend,
         case when (a.status = 'aktiv' or (a.status = 'gekuendigt' and (a.cancel_at is null or a.cancel_at > now()))) and t.schluessel is not null
              then greatest(0,
                   (case when a.intervall = 'jahr' then round(t.preis_jahr_cent / 12.0) else t.preis_monat_cent end)
                 + coalesce(a.zusatznutzer, 0)
                   * coalesce((case when a.intervall = 'jahr' then round(addon.preis_jahr_cent / 12.0) else addon.preis_monat_cent end), 0)
                 - (case when a.gruenderpreis and a.tarif = w.gruender_tarif then w.rabatt else 0 end))::int
              else 0 end as mrr_cent,
         coalesce(a.gruenderpreis, false)
    from public.mandant_abo a
    left join public.plattform_tarife t on t.schluessel = a.tarif and not t.ist_zusatznutzer
    cross join w
    left join addon on true;
end
$function$;
comment on function public.plattform_mrr_je_mandant() is
  'Die eine MRR-Rechnung (docs/ADMIN.md): zahlende Abos inkl. Zusatznutzer, Jahr/12, '
  'Gruenderrabatt abgezogen, Test und Pakete nicht enthalten. Nur ueber den Betreiber lesbar.';
revoke all on function public.plattform_mrr_je_mandant() from public, anon;
grant execute on function public.plattform_mrr_je_mandant() to authenticated;

-- --- 2. Die Tagestabellen ---------------------------------------------------
create table if not exists public.plattform_mandanten_tag (
  datum        date not null,
  -- Vorgabewert wie bei jeder MANDANT-Tabelle (tests/mandant-einstufung.sql
  -- besteht auf dem Wortlaut); der Schnappschuss setzt die Spalte ohnehin.
  mandant_id   uuid not null default aktuelle_mandant_id() references public.mandanten(id) on delete cascade,
  tarif        text,
  intervall    text,
  status       text,
  zahlend      boolean not null default false,
  mrr_cent     integer not null default 0,
  gruenderpreis boolean not null default false,
  primary key (datum, mandant_id)
);
create index if not exists plattform_mandanten_tag_mandant_idx on public.plattform_mandanten_tag (mandant_id);
alter table public.plattform_mandanten_tag enable row level security;
create policy "plattform_mandanten_tag_lesen" on public.plattform_mandanten_tag
  for select to authenticated using (public.ist_plattform_admin());
create policy "mandant_trennung" on public.plattform_mandanten_tag
  as restrictive for all to authenticated
  using (mandant_id = public.aktuelle_mandant_id() or public.ist_plattform_admin())
  with check (mandant_id = public.aktuelle_mandant_id());
create policy "mandant_trennung_loeschen" on public.plattform_mandanten_tag
  as restrictive for delete to authenticated using (false);
comment on table public.plattform_mandanten_tag is
  'Naechtlicher Schnappschuss der Vertragsbeziehung je Mandant — die Historie, die mandant_abo nicht hat.';

create table if not exists public.plattform_kennzahlen_tag (
  datum     date not null,
  kennzahl  text not null,
  tarif     text not null default '',
  wert      numeric(14,4) not null default 0,
  primary key (datum, kennzahl, tarif)
);
alter table public.plattform_kennzahlen_tag enable row level security;
create policy "plattform_kennzahlen_tag_lesen" on public.plattform_kennzahlen_tag
  for select to authenticated using (public.ist_plattform_admin());
comment on table public.plattform_kennzahlen_tag is
  'Tageswerte des Betreiber-Dashboards (mrr_cent, arr_cent, zahlende, test_aktiv, ...), je Tarif und gesamt (tarif = '''').';

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_mandanten_tag', 'MANDANT', 'Schnappschuss der Vertragsbeziehung je Mandant; Betreiber liest alle, das Haus seinen'),
  ('plattform_kennzahlen_tag', 'GLOBAL', 'Summen ueber alle Mandanten; nur fuer Betreiber')
on conflict (tabelle) do update set gruppe = excluded.gruppe, grund = excluded.grund;

-- --- 3. Der Schnappschuss ---------------------------------------------------
create or replace function public.plattform_kennzahlen_schreiben(p_datum date default current_date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n integer := 0;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner','admin') then
    raise exception 'Nur owner oder admin.' using errcode = '42501';
  end if;
  insert into public.plattform_mandanten_tag (datum, mandant_id, tarif, intervall, status, zahlend, mrr_cent, gruenderpreis)
  select p_datum, m.mandant_id, m.tarif, m.intervall, m.status, m.zahlend, m.mrr_cent, m.gruenderpreis
    from public.plattform_mrr_je_mandant() m
  on conflict (datum, mandant_id) do update
    set tarif = excluded.tarif, intervall = excluded.intervall, status = excluded.status,
        zahlend = excluded.zahlend, mrr_cent = excluded.mrr_cent, gruenderpreis = excluded.gruenderpreis;
  get diagnostics n = row_count;

  insert into public.plattform_kennzahlen_tag (datum, kennzahl, tarif, wert)
  select p_datum, k.kennzahl, k.tarif, k.wert from (
    select 'mrr_cent' as kennzahl, '' as tarif, coalesce(sum(mrr_cent), 0) as wert from public.plattform_mrr_je_mandant()
    union all
    select 'mrr_cent', coalesce(tarif, '?'), coalesce(sum(mrr_cent), 0) from public.plattform_mrr_je_mandant() where zahlend group by tarif
    union all
    select 'zahlende', '', count(*) filter (where zahlend) from public.plattform_mrr_je_mandant()
    union all
    select 'zahlende', coalesce(tarif, '?'), count(*) from public.plattform_mrr_je_mandant() where zahlend group by tarif
    union all
    select 'test_aktiv', '', count(*) from public.mandant_abo a where a.status = 'test'
    union all
    select 'gruender_belegt', '', count(*) from public.mandant_abo a where a.gruenderpreis
    union all
    select 'zahlung_offen', '', count(*) from public.mandant_abo a where a.zahlung_fehler_seit is not null
    union all
    select 'kuendigung_vorgemerkt', '', count(*) from public.mandant_abo a where a.status = 'gekuendigt' and a.cancel_at > now()
    union all
    select 'ki_kosten_eur', '', coalesce(sum(b.ki_kosten_eur), 0) from public.credit_buchungen b
     where b.status = 'gebucht' and b.zeitpunkt >= p_datum and b.zeitpunkt < p_datum + 1
    union all
    select 'credits_verbraucht', '', coalesce(sum(b.credits), 0) from public.credit_buchungen b
     where b.status = 'gebucht' and b.zeitpunkt >= p_datum and b.zeitpunkt < p_datum + 1
    union all
    select 'technikfehler', '', count(*) from public.fehler_protokoll f
     where f.created_at >= p_datum and f.created_at < p_datum + 1
    union all
    select 'mandanten', '', count(*) from public.mandanten
  ) k
  on conflict (datum, kennzahl, tarif) do update set wert = excluded.wert;
  return n;
end
$function$;
comment on function public.plattform_kennzahlen_schreiben(date) is
  'Schreibt den Tagesschnappschuss je Mandant und die Summen. Naechtlich per pg_cron; '
  'von Hand fuer einen Tag nachholbar. Idempotent je Datum.';
revoke all on function public.plattform_kennzahlen_schreiben(date) from public, anon;
grant execute on function public.plattform_kennzahlen_schreiben(date) to authenticated;

-- --- 4. Naechtlich, 02:10 Uhr ------------------------------------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'plattform-kennzahlen-naechtlich';
  perform cron.schedule('plattform-kennzahlen-naechtlich', '10 2 * * *',
    $cron$select public.plattform_kennzahlen_schreiben(current_date - 1);$cron$);
end $$;

-- Der erste Schnappschuss: heute.
select public.plattform_kennzahlen_schreiben(current_date);
