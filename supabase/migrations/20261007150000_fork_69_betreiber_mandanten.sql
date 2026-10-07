-- ===========================================================================
-- Fork-eigene Migration 69 — Betreiberbereich, Schritt 2: Mandanten
--
-- AUFTRAG vom 07.10.2026, Abschnitt 6: Liste und Detail eines Mandanten aus
-- METADATEN — Zaehlwerte, Zeitpunkte, Groessen. Nie Inhalte. Der Betreiber
-- erfaehrt, DASS ein Haus zwoelf Objekte hat und wann das erste entstand,
-- nicht, welche. Genau diese Grenze ziehen die Funktionen hier: sie zaehlen
-- und datieren, sie geben keine Zeile einer Fachtabelle heraus.
--
-- WARUM DATENBANKFUNKTIONEN: tests/plattform-admin.js laesst die Edge
-- Function nur Plattform- und Vertragstabellen anfassen — eine Liste
-- erlaubter Tabellen, keine verbotener. Die Edge Function darf also
-- `immobilien` gar nicht lesen, auch nicht zum Zaehlen. Zaehlen tut
-- deshalb eine Funktion mit Security Definer, und die gibt NUR Zahlen
-- zurueck. So bleibt die Liste der Function kurz und die Grenze pruefbar.
--
-- Dazu: Credits ABZIEHEN (bisher nur gutschreiben), als Ledger-Buchung mit
-- Quelle `betreiber`; Betreiber-Notizen je Mandant; die Gewichte des
-- Gesundheitswerts als Plattformwert.
--
-- RUECKNAHME: drop function plattform_mandant_metadaten, plattform_mandanten_kennzahlen,
-- credits_abziehen; drop table plattform_notizen; den Quelle-Check auf
-- credit_konten wieder ohne 'betreiber' setzen.
-- ===========================================================================

-- --- 1. Quelle `betreiber` im Ledger ----------------------------------------
alter table public.credit_konten drop constraint if exists credit_konten_quelle_check;
alter table public.credit_konten
  add constraint credit_konten_quelle_check
  check (quelle in ('test','tarif','paket','gutschrift','betreiber'));

-- --- 2. Credits abziehen -----------------------------------------------------
-- Kein negativer Saldo (CLAUDE.md). Aelteste Credits zuerst — dieselbe
-- Reihenfolge wie beim Verbrauch, sonst naehme ein Abzug dem Haus die
-- laengste Gueltigkeit statt der kuerzesten.
create or replace function public.credits_abziehen(
    p_mandant uuid,
    p_credits integer,
    p_grund text,
    p_referenz text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_vorgang uuid := gen_random_uuid();
  v_rest integer := p_credits;
  v_saldo integer;
  k record;
  v_nimm integer;
begin
  if auth.uid() is not null and coalesce(public.plattform_rolle(), '') not in ('owner','admin') then
    raise exception 'Nur owner oder admin ziehen Credits ab.' using errcode = '42501';
  end if;
  if p_credits <= 0 then
    raise exception 'Ein Abzug ueber % Credits ergibt keinen Sinn.', p_credits using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_grund, ''))) < 5 then
    raise exception 'Ein Abzug braucht einen Grund.' using errcode = '22023';
  end if;
  if p_referenz is not null and exists (
       select 1 from public.credit_buchungen where referenz = p_referenz and aktion = 'betreiber_abzug') then
    return (select vorgang_id from public.credit_buchungen
             where referenz = p_referenz and aktion = 'betreiber_abzug' limit 1);
  end if;
  select public.credits_saldo(p_mandant) into v_saldo;
  if v_saldo < p_credits then
    raise exception 'Nur % Credits verfuegbar, % sollen abgezogen werden. Kein negativer Saldo.',
      v_saldo, p_credits using errcode = '22023';
  end if;
  for k in
    select id, quelle, credits - verbraucht as frei
      from public.credit_konten
     where mandant_id = p_mandant
       and gueltig_von <= now() and (gueltig_bis is null or gueltig_bis > now())
       and credits - verbraucht > 0
     order by gueltig_bis asc nulls last, gueltig_von asc
     for update
  loop
    exit when v_rest <= 0;
    v_nimm := least(k.frei, v_rest);
    update public.credit_konten set verbraucht = verbraucht + v_nimm where id = k.id;
    insert into public.credit_buchungen
      (vorgang_id, mandant_id, nutzer_id, aktion, credits, quelle, konto_id, status, referenz, notiz, abgeschlossen_am)
    values
      (v_vorgang, p_mandant, auth.uid(), 'betreiber_abzug', v_nimm, 'betreiber', k.id, 'gebucht',
       p_referenz, left(p_grund, 500), now());
    v_rest := v_rest - v_nimm;
  end loop;
  return v_vorgang;
end
$function$;

comment on function public.credits_abziehen(uuid, integer, text, text) is
  'Betreiber zieht Credits ab: aelteste Toepfe zuerst, nie unter null, jede '
  'Buchung mit Quelle betreiber und Grund im Ledger. Idempotent ueber die Referenz.';
revoke all on function public.credits_abziehen(uuid, integer, text, text) from public, anon;
grant execute on function public.credits_abziehen(uuid, integer, text, text) to authenticated;

-- --- 3. Notizen des Betreibers ---------------------------------------------
-- Die Spalte heisst ABSICHTLICH nicht mandant_id: tests/mandant-einstufung.sql
-- stuft jede Tabelle mit mandant_id als MANDANT ein, und MANDANT hiesse,
-- der Mandant liest sie mit. Die Notiz handelt vom Mandanten, gehoert ihm
-- aber nicht.
create table if not exists public.plattform_notizen (
  id                  uuid primary key default gen_random_uuid(),
  betrifft_mandant_id uuid not null references public.mandanten(id) on delete cascade,
  admin_id    uuid references public.profiles(id) on delete set null,
  text        text not null,
  erstellt_am timestamptz not null default now(),
  constraint plattform_notizen_text_check check (length(btrim(text)) >= 1)
);
create index if not exists plattform_notizen_mandant_idx
  on public.plattform_notizen (betrifft_mandant_id, erstellt_am desc);
alter table public.plattform_notizen enable row level security;
-- Lesen und schreiben nur Betreiber. KEINE Mandantentrennung: die Notiz
-- handelt vom Mandanten, gehoert ihm aber nicht — er sieht sie nie.
create policy plattform_notizen_lesen on public.plattform_notizen
  for select to authenticated using (public.plattform_rolle() is not null);
create policy plattform_notizen_schreiben on public.plattform_notizen
  for insert to authenticated
  with check (public.plattform_rolle() in ('owner','admin','support'));
comment on table public.plattform_notizen is
  'Interne Notizen des Betreibers zu einem Mandanten. Der Mandant sieht sie nicht.';
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('plattform_notizen', 'GLOBAL',
   'Notizen des Betreibers UEBER einen Mandanten; nur fuer Betreiber lesbar, nie fuer das Haus')
on conflict (tabelle) do update set gruppe = excluded.gruppe, grund = excluded.grund;

-- --- 4. Gewichte des Gesundheitswerts ------------------------------------
insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('gesundheit_gewichte',
   '{"login14": 30, "aktive_nutzer": 20, "onboarding": 25, "module": 15, "zahlung": 10}'::jsonb,
   'Gewichte des Gesundheitswerts (0-100) je Mandant; Summe 100. Siehe docs/ADMIN.md.'),
  ('kosten_warnung_prozent', '30'::jsonb,
   'Warnliste: KI-Kosten im laufenden Monat ueber diesem Anteil des Nettoumsatzes.')
on conflict (schluessel) do nothing;

-- --- 5. Kennzahlen je Mandant fuer die Liste ------------------------------
-- Eine Zeile je Mandant: letzter Login, aktive Nutzer (14 Tage), Stand des
-- Onboardings in Schritten (0-8), Modulnutzung (30 Tage) und daraus der
-- Gesundheitswert. Nur Zahlen und Zeitpunkte.
create or replace function public.plattform_mandanten_kennzahlen()
 returns table (
   mandant_id uuid, letzter_login timestamptz, nutzer int, aktive_14 int,
   onboarding int, aktionen_30 int, gesundheit int)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare g jsonb;
begin
  if auth.uid() is not null and public.plattform_rolle() is null then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  select coalesce((select wert from public.plattform_werte where schluessel = 'gesundheit_gewichte'),
                  '{"login14":30,"aktive_nutzer":20,"onboarding":25,"module":15,"zahlung":10}'::jsonb)
    into g;
  return query
  with p as (
    select pr.mandant_id, pr.id, u.last_sign_in_at
      from public.profiles pr left join auth.users u on u.id = pr.id
     where pr.mandant_id is not null
  ), logins as (
    select p.mandant_id,
           max(p.last_sign_in_at) as letzter_login,
           count(*)::int as nutzer,
           count(*) filter (where p.last_sign_in_at > now() - interval '14 days')::int as aktive_14
      from p group by p.mandant_id
  ), onb as (
    select m.id as mandant_id,
      ( (exists (select 1 from public.firma_stammdaten f where f.mandant_id = m.id and f.logo_pfad is not null))::int
      + (exists (select 1 from public.firma_stammdaten f where f.mandant_id = m.id and f.ci_primaer is not null))::int
      + (exists (select 1 from public.firma_stammdaten f where f.mandant_id = m.id and f.ci_font is not null))::int
      + (exists (select 1 from public.immobilien i where i.mandant_id = m.id))::int
      + (exists (select 1 from public.expose_freigaben e where e.mandant_id = m.id))::int
      + (exists (select 1 from public.signatur_vorgaenge s where s.mandant_id = m.id))::int
      + (exists (select 1 from public.mail_postfaecher mp where mp.mandant_id = m.id))::int
      + ((select count(*) from public.profiles pr where pr.mandant_id = m.id) > 1)::int
      ) as onboarding
      from public.mandanten m
  ), akt as (
    select a.mandant_id, count(*)::int as aktionen_30
      from public.aktivitaets_log a
     where a.created_at > now() - interval '30 days' and a.mandant_id is not null
     group by a.mandant_id
  )
  select m.id,
         l.letzter_login,
         coalesce(l.nutzer, 0),
         coalesce(l.aktive_14, 0),
         coalesce(o.onboarding, 0),
         coalesce(k.aktionen_30, 0),
         least(100, greatest(0, round(
             (g->>'login14')::numeric * (case when l.letzter_login > now() - interval '14 days' then 1 else 0 end)
           + (g->>'aktive_nutzer')::numeric * (case when coalesce(l.nutzer,0) = 0 then 0
                                                else coalesce(l.aktive_14,0)::numeric / l.nutzer end)
           + (g->>'onboarding')::numeric * (coalesce(o.onboarding,0)::numeric / 8)
           + (g->>'module')::numeric * least(1, coalesce(k.aktionen_30,0)::numeric / 20)
           + (g->>'zahlung')::numeric * (case when coalesce(ab.status,'test') in ('aktiv','test') then 1
                                              when ab.status = 'gekuendigt' then 0.5 else 0 end)
         )))::int
    from public.mandanten m
    left join logins l on l.mandant_id = m.id
    left join onb o on o.mandant_id = m.id
    left join akt k on k.mandant_id = m.id
    left join public.mandant_abo ab on ab.mandant_id = m.id;
end
$function$;
comment on function public.plattform_mandanten_kennzahlen() is
  'Eine Zeile je Mandant aus Metadaten: letzter Login, aktive Nutzer, Onboarding-Schritte, '
  'Aktionen in 30 Tagen, Gesundheitswert 0-100. Keine Inhalte. Nur Betreiber.';
revoke all on function public.plattform_mandanten_kennzahlen() from public, anon;
grant execute on function public.plattform_mandanten_kennzahlen() to authenticated;

-- --- 6. Metadaten eines Mandanten fuer die Detailansicht ------------------
create or replace function public.plattform_mandant_metadaten(p_mandant uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare r jsonb;
begin
  if auth.uid() is not null and public.plattform_rolle() is null then
    raise exception 'Nur Betreiber.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'onboarding', jsonb_build_object(
      'logo',         exists (select 1 from public.firma_stammdaten f where f.mandant_id = p_mandant and f.logo_pfad is not null),
      'farben',       exists (select 1 from public.firma_stammdaten f where f.mandant_id = p_mandant and f.ci_primaer is not null),
      'schrift',      exists (select 1 from public.firma_stammdaten f where f.mandant_id = p_mandant and f.ci_font is not null),
      'objekt_am',    (select min(i.created_at) from public.immobilien i where i.mandant_id = p_mandant),
      'expose_am',    (select min(e.created_at) from public.expose_freigaben e where e.mandant_id = p_mandant),
      'signatur_am',  (select min(s.created_at) from public.signatur_vorgaenge s where s.mandant_id = p_mandant),
      'postfach_am',  (select min(mp.created_at) from public.mail_postfaecher mp where mp.mandant_id = p_mandant),
      'mitarbeiter_am', (select min(pr.created_at) from public.profiles pr
                           where pr.mandant_id = p_mandant
                             and pr.id <> (select pr2.id from public.profiles pr2 where pr2.mandant_id = p_mandant order by pr2.created_at limit 1))
    ),
    'zaehlwerte', jsonb_build_object(
      'objekte',  (select count(*) from public.immobilien i where i.mandant_id = p_mandant),
      'kontakte', (select count(*) from public.kontakte k where k.mandant_id = p_mandant),
      'exposes',  (select count(*) from public.expose_freigaben e where e.mandant_id = p_mandant),
      'signaturen', (select count(*) from public.signatur_vorgaenge s where s.mandant_id = p_mandant),
      'postfaecher', (select count(*) from public.mail_postfaecher mp where mp.mandant_id = p_mandant)
    ),
    'logins', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', pr.id, 'letzter_login', u.last_sign_in_at) order by u.last_sign_in_at desc nulls last), '[]'::jsonb)
                 from public.profiles pr left join auth.users u on u.id = pr.id where pr.mandant_id = p_mandant),
    'module', (select coalesce(jsonb_object_agg(x.objekt_typ, x.n), '{}'::jsonb) from (
                 select a.objekt_typ, count(*) as n from public.aktivitaets_log a
                  where a.mandant_id = p_mandant and a.created_at > now() - interval '30 days'
                  group by a.objekt_typ) x),
    'speicher', (select coalesce(jsonb_object_agg(x.bucket_id, x.bytes), '{}'::jsonb) from (
                 select o.bucket_id, sum(coalesce((o.metadata->>'size')::bigint, 0)) as bytes
                   from storage.objects o
                  where (storage.foldername(o.name))[1] = p_mandant::text
                  group by o.bucket_id) x)
  ) into r;
  return r;
end
$function$;
comment on function public.plattform_mandant_metadaten(uuid) is
  'Metadaten eines Mandanten fuer den Betreiber: Onboarding (ja/nein + Datum), Zaehlwerte, '
  'letzte Logins je Konto, Modulnutzung 30 Tage, Speicher je Bucket. Keine Inhalte. Nur Betreiber.';
revoke all on function public.plattform_mandant_metadaten(uuid) from public, anon;
grant execute on function public.plattform_mandant_metadaten(uuid) to authenticated;
