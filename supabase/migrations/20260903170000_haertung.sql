-- ===========================================================================
-- ImmoOffice.ai — Haertung (Masterprompt Phase 3 „Haertung und Skalierung“):
-- Volltextsuche im Postfach, Missbrauchsschutz bei der Registrierung,
-- Plattform-Einstellungen, Befund fuer den Waechter (Funktionsprompt,
-- Grundprinzip 4).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Plattform-Einstellungen: Werte des Betreibers. RLS ohne Policy — nur die
--    Dienstrolle liest und schreibt; Funktionen greifen als Definer zu.
-- ---------------------------------------------------------------------------

create table public.plattform_einstellungen (
  schluessel   text primary key,
  wert         jsonb not null,
  beschreibung text,
  geaendert_am timestamptz not null default now()
);

alter table public.plattform_einstellungen enable row level security;

comment on table public.plattform_einstellungen is
  'Betreiber-Einstellungen (Limits, Waechter). Nur per Dienstrolle; bis zum Plattform-Admin ueber die Datenbank pflegbar.';

insert into public.plattform_einstellungen (schluessel, wert, beschreibung) values
  ('registrierung_limit_ip',    '5'::jsonb,    'Registrierungsversuche je Absender (IP-Hash) und Stunde'),
  ('registrierung_limit_email', '3'::jsonb,    'Registrierungsversuche je E-Mail-Adresse und Stunde'),
  ('waechter_empfaenger',       'null'::jsonb, 'E-Mail-Adresse fuer Waechter-Befunde; null = Umgebungsvariable WAECHTER_EMPFAENGER'),
  ('waechter_zustand',          '{}'::jsonb,   'Vom Arbeiter gepflegt: letzter Befund-Hash, Zeitpunkt der letzten Mail, Pruefzeitpunkt');

-- ---------------------------------------------------------------------------
-- 2. Volltextsuche im Postfach (E-30 abgeloest). Security INVOKER: Die
--    Row-Level-Security des Aufrufers gilt — wer nichts sehen darf, findet
--    nichts. Der Ausdruck entspricht dem Index nachrichten_suche.
-- ---------------------------------------------------------------------------

create or replace function public.nachrichten_suchen(
  p_suche         text,
  p_postfach      uuid    default null,
  p_nur_ungelesen boolean default false,
  p_limit         integer default 100
)
returns setof public.nachrichten
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select n.*
    from public.nachrichten n
   where (p_postfach is null or n.postfach_id = p_postfach)
     and (not p_nur_ungelesen or (n.ordner = 'eingang' and not n.gelesen))
     and (
       coalesce(trim(p_suche), '') = ''
       or to_tsvector('german', coalesce(n.betreff, '') || ' ' || coalesce(n.von_adresse, '') || ' ' || coalesce(n.text, ''))
          @@ websearch_to_tsquery('german', p_suche)
     )
   order by n.gesendet_am desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

revoke all on function public.nachrichten_suchen(text, uuid, boolean, integer) from public, anon;
grant execute on function public.nachrichten_suchen(text, uuid, boolean, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Missbrauchsschutz bei der Registrierung (Masterprompt 16, Phase 3):
--    Sperrliste fuer Wegwerfadressen und Ratenbegrenzung je Adresse und je
--    Absender (IP-Hash). Versuche werden nach 24 Stunden geloescht.
-- ---------------------------------------------------------------------------

create table public.registrierungs_sperrliste (
  domain      text primary key,
  grund       text,
  erstellt_am timestamptz not null default now()
);

alter table public.registrierungs_sperrliste enable row level security;   -- nur Dienstrolle

insert into public.registrierungs_sperrliste (domain, grund) values
  ('mailinator.com', 'Wegwerfadresse'), ('guerrillamail.com', 'Wegwerfadresse'), ('guerrillamail.de', 'Wegwerfadresse'),
  ('sharklasers.com', 'Wegwerfadresse'), ('10minutemail.com', 'Wegwerfadresse'), ('10minutemail.de', 'Wegwerfadresse'),
  ('tempmail.com', 'Wegwerfadresse'), ('temp-mail.org', 'Wegwerfadresse'), ('tempr.email', 'Wegwerfadresse'),
  ('trashmail.com', 'Wegwerfadresse'), ('trash-mail.com', 'Wegwerfadresse'), ('trashmail.de', 'Wegwerfadresse'),
  ('yopmail.com', 'Wegwerfadresse'), ('yopmail.fr', 'Wegwerfadresse'), ('dispostable.com', 'Wegwerfadresse'),
  ('getnada.com', 'Wegwerfadresse'), ('throwawaymail.com', 'Wegwerfadresse'), ('maildrop.cc', 'Wegwerfadresse'),
  ('mohmal.com', 'Wegwerfadresse'), ('fakeinbox.com', 'Wegwerfadresse'), ('mailnesia.com', 'Wegwerfadresse'),
  ('wegwerfmail.de', 'Wegwerfadresse'), ('wegwerfadresse.de', 'Wegwerfadresse'), ('wegwerfemail.de', 'Wegwerfadresse'),
  ('byom.de', 'Wegwerfadresse'), ('spamgourmet.com', 'Wegwerfadresse'), ('emailondeck.com', 'Wegwerfadresse'),
  ('33mail.com', 'Wegwerfadresse'), ('mintemail.com', 'Wegwerfadresse'), ('mytemp.email', 'Wegwerfadresse'),
  ('discard.email', 'Wegwerfadresse'), ('kurzepost.de', 'Wegwerfadresse'), ('einrot.com', 'Wegwerfadresse'),
  ('spambog.com', 'Wegwerfadresse'), ('spambog.de', 'Wegwerfadresse'), ('mail-temporaire.fr', 'Wegwerfadresse'),
  ('tempmailo.com', 'Wegwerfadresse'), ('burnermail.io', 'Wegwerfadresse'), ('mailsac.com', 'Wegwerfadresse'),
  ('inboxkitten.com', 'Wegwerfadresse'), ('moakt.com', 'Wegwerfadresse'), ('nwytg.net', 'Wegwerfadresse'),
  ('mailcatch.com', 'Wegwerfadresse'), ('jetable.org', 'Wegwerfadresse'), ('mailexpire.com', 'Wegwerfadresse'),
  ('tempinbox.com', 'Wegwerfadresse'), ('trashmail.net', 'Wegwerfadresse'), ('emailtemporario.com.br', 'Wegwerfadresse')
on conflict (domain) do nothing;

create table public.registrierungsversuche (
  id           uuid primary key default gen_random_uuid(),
  kennung_hash text not null,
  art          text not null check (art in ('ip', 'email')),
  zeitpunkt    timestamptz not null default now()
);

create index registrierungsversuche_idx on public.registrierungsversuche (art, kennung_hash, zeitpunkt desc);
alter table public.registrierungsversuche enable row level security;   -- nur Dienstrolle

-- Ergebnis: 'ok' | 'wegwerfadresse' | 'zu_viele' | 'ungueltig'.
-- Der Versuch wird bei 'ok' gezaehlt; abgewiesene Versuche zaehlen nicht,
-- damit eine gesperrte Adresse nicht zusaetzlich das IP-Kontingent leert.
create or replace function public.registrierung_pruefen(p_email text, p_ip_hash text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email      text := lower(trim(coalesce(p_email, '')));
  v_domain     text := split_part(lower(trim(coalesce(p_email, ''))), '@', 2);
  v_email_hash text;
  v_limit_ip    integer := coalesce((select (wert #>> '{}')::integer from public.plattform_einstellungen where schluessel = 'registrierung_limit_ip'), 5);
  v_limit_email integer := coalesce((select (wert #>> '{}')::integer from public.plattform_einstellungen where schluessel = 'registrierung_limit_email'), 3);
  v_anzahl     integer;
begin
  delete from public.registrierungsversuche where zeitpunkt < now() - interval '24 hours';

  if v_domain = '' or position('.' in v_domain) = 0 then
    return 'ungueltig';
  end if;
  if exists (
    select 1 from public.registrierungs_sperrliste s
     where s.domain = v_domain or v_domain like '%.' || s.domain
  ) then
    return 'wegwerfadresse';
  end if;

  v_email_hash := encode(extensions.digest(v_email, 'sha256'), 'hex');
  select count(*) into v_anzahl from public.registrierungsversuche
   where art = 'email' and kennung_hash = v_email_hash and zeitpunkt > now() - interval '1 hour';
  if v_anzahl >= v_limit_email then
    return 'zu_viele';
  end if;

  if coalesce(p_ip_hash, '') <> '' then
    select count(*) into v_anzahl from public.registrierungsversuche
     where art = 'ip' and kennung_hash = p_ip_hash and zeitpunkt > now() - interval '1 hour';
    if v_anzahl >= v_limit_ip then
      return 'zu_viele';
    end if;
    insert into public.registrierungsversuche (kennung_hash, art) values (p_ip_hash, 'ip');
  end if;

  insert into public.registrierungsversuche (kennung_hash, art) values (v_email_hash, 'email');
  return 'ok';
end;
$$;

revoke all on function public.registrierung_pruefen(text, text) from public;
grant execute on function public.registrierung_pruefen(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Waechter-Befund (Funktionsprompt, Grundprinzip 4): Zustand aller
--    Hintergrundketten in einer Abfrage. Der Arbeiter bewertet, hasht und
--    mailt — hoechstens einmal je 24 Stunden bei gleicher Lage, neue Lage
--    sofort, Entwarnung bei Gruen.
-- ---------------------------------------------------------------------------

create or replace function public.waechter_befund()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'auftraege_fehler_24h',     (select count(*) from public.jobs where status = 'fehler' and beendet_am > now() - interval '24 hours'),
    'auftraege_haengend',       (select count(*) from public.jobs where status = 'laeuft' and sperre_bis is not null and sperre_bis < now()),
    'auftraege_offen_alt',      (select count(*) from public.jobs where status = 'offen' and naechster_versuch_am < now() - interval '15 minutes'),
    'integrationen_fehler',     (select count(*) from public.integrationen where status = 'fehler'),
    'postfaecher_fehler',       (select count(*) from public.postfaecher where status = 'fehler'),
    'stripe_ereignisse_fehler', (select count(*) from public.stripe_ereignisse where fehler_text is not null and verarbeitet_am is null),
    'mandanten_lesemodus',      (select count(*) from public.mandanten where lesemodus_seit is not null),
    'abos_zahlung_offen',       (select count(*) from public.abonnements where status = 'zahlung_offen')
  )
$$;

revoke all on function public.waechter_befund() from public, anon, authenticated;
grant execute on function public.waechter_befund() to service_role;
