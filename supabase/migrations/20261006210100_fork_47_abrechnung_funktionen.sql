-- ===========================================================================
-- fork_47, zweiter Teil — die Mechanik
--
-- Reservieren, buchen, freigeben; Nutzerlimit; Zugriffsstufe; Gründerplätze.
-- Alles als Datenbankfunktion und nicht in einer Edge Function, aus einem
-- Grund: zwei gleichzeitige KI-Aufrufe desselben Mandanten dürfen nicht
-- denselben Rest vergeben. Das verhindert nur eine Sperre innerhalb EINER
-- Transaktion — und die gibt es hier, nicht dort.
--
-- CLAUDE.md: „Kein negativer Saldo. Älteste Credits zuerst verbrauchen."
-- Der Auftrag vom 06.10.2026 verfeinert das: erst Tarif-Credits, dann die
-- ältesten Zusatz-Credits. Beides zusammen ist die Reihenfolge unten.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Saldo
-- ---------------------------------------------------------------------------
create or replace function public.credits_saldo(p_mandant uuid default null)
 returns integer
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(sum(k.credits - k.verbraucht), 0)::integer
    from public.credit_konten k
   where k.mandant_id = coalesce(p_mandant, public.aktuelle_mandant_id())
     and k.gueltig_von <= now()
     and (k.gueltig_bis is null or k.gueltig_bis > now());
$function$;

comment on function public.credits_saldo(uuid) is
  'Verfügbare Credits: alles, was noch nicht verbraucht oder reserviert ist '
  'und noch gilt. Reservierte zählen als verbraucht — sonst vergäbe ein '
  'zweiter Aufruf denselben Rest noch einmal.';

-- ---------------------------------------------------------------------------
-- Was kostet eine Aktion?
-- ---------------------------------------------------------------------------
create or replace function public.credits_kosten(p_aktion text)
 returns integer
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v integer;
begin
  select credits into v from public.plattform_credit_preise
   where aktion = p_aktion and aktiv;
  if not found then
    -- Eine unbekannte Aktion wird NICHT stillschweigend kostenlos. Sonst
    -- wäre ein Tippfehler im Aufruf ein Freifahrtschein.
    raise exception 'Unbekannte Aktion "%": in plattform_credit_preise eintragen.', p_aktion
      using errcode = '22023';
  end if;
  return v;
end
$function$;

-- ---------------------------------------------------------------------------
-- Reservieren
-- ---------------------------------------------------------------------------
-- Vor dem KI-Aufruf. Nimmt die Credits aus den Töpfen, schreibt je berührtem
-- Topf eine Zeile ins Ledger und gibt die Vorgangskennung zurück. Schlägt
-- der Aufruf technisch fehl, gibt `credits_freigeben` alles zurück.
create or replace function public.credits_reservieren(
    p_aktion   text,
    p_referenz text default null,
    p_mandant  uuid default null,
    p_nutzer   uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mandant uuid := coalesce(p_mandant, public.aktuelle_mandant_id());
  v_nutzer  uuid := coalesce(p_nutzer, auth.uid());
  v_kosten  integer := public.credits_kosten(p_aktion);
  v_vorgang uuid := gen_random_uuid();
  v_offen   integer := v_kosten;
  v_nehmen  integer;
  k         record;
begin
  if v_mandant is null then
    raise exception 'Kein Mandant.' using errcode = '42501';
  end if;

  -- Kostenfreie Aktionen stehen trotzdem im Ledger: „Was hat der Mandant
  -- getan?" ist eine andere Frage als „Was hat es gekostet?", und die erste
  -- will man auch beantworten können.
  if v_kosten = 0 then
    insert into public.credit_buchungen
      (vorgang_id, mandant_id, nutzer_id, aktion, credits, quelle, status,
       referenz, abgeschlossen_am)
    values (v_vorgang, v_mandant, v_nutzer, p_aktion, 0, 'frei', 'gebucht',
            p_referenz, now());
    return v_vorgang;
  end if;

  -- Reihenfolge: erst Tarif, dann die ältesten gekauften. `for update`
  -- sperrt die Töpfe bis zum Ende der Transaktion — ohne das vergäben zwei
  -- gleichzeitige Aufrufe denselben Rest.
  for k in
    select * from public.credit_konten
     where mandant_id = v_mandant
       and verbraucht < credits
       and gueltig_von <= now()
       and (gueltig_bis is null or gueltig_bis > now())
     order by case quelle when 'tarif' then 0 when 'test' then 1 else 2 end,
              coalesce(gueltig_bis, 'infinity'::timestamptz),
              erstellt_am
     for update
  loop
    exit when v_offen <= 0;
    v_nehmen := least(v_offen, k.credits - k.verbraucht);
    update public.credit_konten set verbraucht = verbraucht + v_nehmen where id = k.id;
    insert into public.credit_buchungen
      (vorgang_id, mandant_id, nutzer_id, aktion, credits, quelle, konto_id,
       status, referenz)
    values (v_vorgang, v_mandant, v_nutzer, p_aktion, v_nehmen, k.quelle, k.id,
            'reserviert', p_referenz);
    v_offen := v_offen - v_nehmen;
  end loop;

  if v_offen > 0 then
    -- Nichts halb reservieren. Die Transaktion fällt zurück, die Töpfe
    -- bleiben, wie sie waren, und der Aufrufer bekommt eine Zahl, mit der
    -- er etwas anfangen kann.
    raise exception 'Nicht genug Credits: % benoetigt, % verfuegbar.',
      v_kosten, public.credits_saldo(v_mandant) using errcode = '53400';
  end if;

  return v_vorgang;
end
$function$;

comment on function public.credits_reservieren(text, text, uuid, uuid) is
  'Reserviert die Credits einer Aktion. Erst Tarif-, dann die ältesten '
  'gekauften Credits. Reicht es nicht, wird NICHTS genommen.';

-- ---------------------------------------------------------------------------
-- Buchen
-- ---------------------------------------------------------------------------
create or replace function public.credits_buchen(
    p_vorgang uuid,
    p_ki_kosten_eur numeric default null,
    p_notiz text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_summe integer;
  v_anzahl integer;
  v_kosten numeric;
begin
  select count(*), coalesce(sum(credits), 0) into v_anzahl, v_summe
    from public.credit_buchungen
   where vorgang_id = p_vorgang and status = 'reserviert';
  if v_anzahl = 0 then
    -- Schon gebucht oder schon freigegeben: nichts tun, nicht scheitern.
    -- Ein zweiter Aufruf darf nicht doppelt buchen und auch nicht lärmen.
    return 0;
  end if;

  -- Die tatsächlichen Anbieterkosten werden auf die Zeilen des Vorgangs
  -- verteilt — anteilig, damit die Summe stimmt und jede Zeile für sich
  -- auswertbar bleibt.
  v_kosten := p_ki_kosten_eur;
  update public.credit_buchungen b
     set status = 'gebucht',
         abgeschlossen_am = now(),
         notiz = coalesce(p_notiz, b.notiz),
         ki_kosten_eur = case
           when v_kosten is null or v_summe = 0 then b.ki_kosten_eur
           else round(v_kosten * b.credits / v_summe, 6) end
   where b.vorgang_id = p_vorgang and b.status = 'reserviert';
  return v_summe;
end
$function$;

comment on function public.credits_buchen(uuid, numeric, text) is
  'Schliesst eine Reservierung ab. Die tatsächlichen Anbieterkosten werden '
  'anteilig auf die Zeilen verteilt — sie sind die Grundlage jeder späteren '
  'Preisänderung. Ein zweiter Aufruf tut nichts.';

-- ---------------------------------------------------------------------------
-- Freigeben
-- ---------------------------------------------------------------------------
-- CLAUDE.md: „Fehlgeschlagene KI-Aufträge geben reservierte Credits
-- automatisch frei."
create or replace function public.credits_freigeben(
    p_vorgang uuid,
    p_grund text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_summe integer := 0;
  b record;
begin
  for b in
    select * from public.credit_buchungen
     where vorgang_id = p_vorgang and status = 'reserviert'
     for update
  loop
    if b.konto_id is not null then
      update public.credit_konten
         set verbraucht = greatest(0, verbraucht - b.credits)
       where id = b.konto_id;
    end if;
    update public.credit_buchungen
       set status = 'freigegeben', abgeschlossen_am = now(),
           notiz = coalesce(p_grund, notiz)
     where id = b.id;
    v_summe := v_summe + b.credits;
  end loop;
  return v_summe;
end
$function$;

-- ---------------------------------------------------------------------------
-- Gutschreiben
-- ---------------------------------------------------------------------------
create or replace function public.credits_gutschreiben(
    p_mandant uuid,
    p_quelle text,
    p_credits integer,
    p_gueltig_bis timestamptz default null,
    p_referenz text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if p_credits <= 0 then
    raise exception 'Eine Gutschrift ueber % Credits ergibt keinen Sinn.', p_credits
      using errcode = '22023';
  end if;
  -- Dieselbe Referenz zweimal heisst: dasselbe Ereignis zweimal zugestellt.
  -- Dann passiert nichts. Das ist die zweite Sperre gegen Doppelbuchung,
  -- hinter stripe_ereignisse.
  if p_referenz is not null then
    select id into v_id from public.credit_konten
     where mandant_id = p_mandant and referenz = p_referenz limit 1;
    if found then return v_id; end if;
  end if;
  insert into public.credit_konten (mandant_id, quelle, credits, gueltig_bis, referenz)
  values (p_mandant, p_quelle, p_credits, p_gueltig_bis, p_referenz)
  returning id into v_id;
  return v_id;
end
$function$;

comment on function public.credits_gutschreiben(uuid, text, integer, timestamptz, text) is
  'Legt einen Credit-Topf an. Mit derselben Referenz nur einmal — die zweite '
  'Zustellung desselben Stripe-Ereignisses bucht nicht noch einmal.';

-- ---------------------------------------------------------------------------
-- Tarif-Credits zuteilen und Verfall
-- ---------------------------------------------------------------------------
-- Der Auftrag vom 06.10.2026: „Monatliche Tarif-Credits verfallen am
-- Periodenende (keine Übertragung). Bei Jahresabo monatliche Zuteilung."
--
-- Das weicht von CLAUDE.md ab, wo Inklusiv-Credits in den unmittelbar
-- folgenden Monat übertragbar waren. Die spätere Ansage desselben
-- Auftraggebers gilt; begründet in docs/ENTSCHEIDUNGEN.md.
create or replace function public.credits_tarif_zuteilen(
    p_mandant uuid,
    p_von timestamptz default null,
    p_bis timestamptz default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_abo     record;
  v_credits integer;
  v_von     timestamptz := coalesce(p_von, date_trunc('month', now()));
  v_bis     timestamptz := coalesce(p_bis, v_von + interval '1 month');
  v_ref     text;
begin
  select * into v_abo from public.mandant_abo where mandant_id = p_mandant;
  if not found or v_abo.tarif is null then return 0; end if;
  select credits_monat into v_credits from public.plattform_tarife
   where schluessel = v_abo.tarif;
  if coalesce(v_credits, 0) = 0 then return 0; end if;

  -- Eine Zuteilung je Mandant und Monat, auch wenn der Webhook zweimal kommt.
  v_ref := 'tarif:' || p_mandant::text || ':' || to_char(v_von, 'YYYY-MM-DD');
  perform public.credits_gutschreiben(p_mandant, 'tarif', v_credits, v_bis, v_ref);
  return v_credits;
end
$function$;

-- ---------------------------------------------------------------------------
-- Nutzerlimit
-- ---------------------------------------------------------------------------
create or replace function public.nutzer_limit(p_mandant uuid default null)
 returns integer
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(t.inkl_nutzer, 0) + coalesce(a.zusatznutzer, 0)
    from public.mandant_abo a
    left join public.plattform_tarife t on t.schluessel = a.tarif
   where a.mandant_id = coalesce(p_mandant, public.aktuelle_mandant_id());
$function$;

create or replace function public.nutzer_platz_frei(p_mandant uuid default null)
 returns boolean
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_mandant uuid := coalesce(p_mandant, public.aktuelle_mandant_id());
  v_limit   integer := public.nutzer_limit(v_mandant);
  v_ist     integer;
begin
  -- Ohne Abo-Zeile (Testphase vor der ersten Zuordnung) gilt der kleinste
  -- Tarif: ein Nutzer. Nicht „unbegrenzt" — das wäre die falsche Richtung.
  if v_limit is null or v_limit = 0 then
    select coalesce(min(inkl_nutzer), 1) into v_limit
      from public.plattform_tarife where aktiv and not ist_zusatznutzer;
  end if;
  select count(*) into v_ist from public.profiles where mandant_id = v_mandant;
  return v_ist < v_limit;
end
$function$;

comment on function public.nutzer_platz_frei(uuid) is
  'Ist im Tarif (inklusive gebuchter Zusatznutzer) noch ein Platz frei? '
  'Wird beim Einladen geprüft — serverseitig, nicht nur im Formular.';

-- ---------------------------------------------------------------------------
-- Welche Zugriffsstufe hat ein Mandant gerade?
-- ---------------------------------------------------------------------------
create or replace function public.abo_zugriff(p_mandant uuid default null)
 returns text
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_mandant uuid := coalesce(p_mandant, public.aktuelle_mandant_id());
  v_abo     record;
  v_m       record;
begin
  select * into v_m from public.mandanten where id = v_mandant;
  if not found then return 'gesperrt'; end if;
  select * into v_abo from public.mandant_abo where mandant_id = v_mandant;

  if v_m.gesperrt_am is not null then return 'gesperrt'; end if;

  if not found or v_abo.status = 'test' then
    if coalesce(v_m.testphase_bis, now()) > now() then return 'voll'; end if;
    if coalesce(v_abo.lesezugriff_bis, v_m.testphase_bis + interval '30 days') > now()
      then return 'nur_lesen'; end if;
    return 'gesperrt';
  end if;

  if v_abo.status in ('aktiv','gekuendigt') then
    if v_abo.cancel_at is not null and v_abo.cancel_at <= now() then
      return case when coalesce(v_abo.lesezugriff_bis, v_abo.cancel_at + interval '30 days') > now()
                  then 'nur_lesen' else 'gesperrt' end;
    end if;
    return 'voll';
  end if;

  if v_abo.status = 'zahlung_offen' then
    -- Die Frist läuft; bis dahin arbeitet der Mandant weiter. Erst danach
    -- wird es wie nach Testende.
    if coalesce(v_abo.zahlung_fehler_seit, now()) +
       (coalesce((select wert::text::integer from public.plattform_werte
                   where schluessel = 'zahlung_frist_tage'), 14) || ' days')::interval > now()
      then return 'voll'; end if;
    return case when coalesce(v_abo.lesezugriff_bis, now()) > now()
                then 'nur_lesen' else 'gesperrt' end;
  end if;

  if v_abo.status = 'abgelaufen' then
    return case when coalesce(v_abo.lesezugriff_bis, now()) > now()
                then 'nur_lesen' else 'gesperrt' end;
  end if;

  return 'gesperrt';
end
$function$;

comment on function public.abo_zugriff(uuid) is
  'voll | nur_lesen | gesperrt. Die eine Stelle, an der entschieden wird, '
  'was ein Mandant gerade darf — und sie liest nur den Stand, den der '
  'Webhook geschrieben hat.';

-- ---------------------------------------------------------------------------
-- Gründerplätze
-- ---------------------------------------------------------------------------
create or replace function public.gruender_plaetze_frei()
 returns integer
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select greatest(0,
    coalesce((select wert::text::integer from public.plattform_werte
               where schluessel = 'gruender_plaetze'), 50)
    - (select count(*) from public.mandant_abo where gruenderpreis))::integer;
$function$;

-- Die Nummer wird beim ersten bezahlten Abo vergeben und nie wieder. Eine
-- Kündigung gibt den Platz NICHT frei: „solange das Abo ununterbrochen
-- läuft" heisst, dass ein beendetes Abo den Preis endgültig verliert — der
-- Platz bleibt verbraucht, sonst wäre „die ersten 50 Kunden" eine Drehtür.
create or replace function public.gruender_platz_vergeben(p_mandant uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_nr integer; v_frei integer;
begin
  select gruender_nummer into v_nr from public.mandant_abo where mandant_id = p_mandant;
  if v_nr is not null then return v_nr; end if;
  select public.gruender_plaetze_frei() into v_frei;
  if v_frei <= 0 then return null; end if;
  select coalesce(max(gruender_nummer), 0) + 1 into v_nr from public.mandant_abo;
  update public.mandant_abo
     set gruenderpreis = true, gruender_nummer = v_nr, geaendert_am = now()
   where mandant_id = p_mandant;
  return v_nr;
end
$function$;

-- ---------------------------------------------------------------------------
-- Registrierung: 28 Tage, 300 Credits, Abo-Zeile
-- ---------------------------------------------------------------------------
-- Bisher: 30 Tage, keine Credits, keine Abo-Zeile. Der Auftrag vom
-- 06.10.2026 nennt 28 Tage und 300 Credits, und beides steht jetzt in
-- plattform_werte statt im Code.
create or replace function public.registrierung_abschliessen(p_firma text, p_name text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user   uuid := auth.uid();
  v_email  text;
  v_firma  text := trim(coalesce(p_firma, ''));
  v_name   text := trim(coalesce(p_name, ''));
  v_slug   text;
  v_mandant uuid;
  v_tage    integer;
  v_credits integer;
  v_bis     timestamptz;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;
  if length(v_firma) < 2 then
    raise exception 'Bitte geben Sie einen Firmennamen an.' using errcode = '22023';
  end if;
  if length(v_firma) > 120 then
    v_firma := left(v_firma, 120);
  end if;

  select p.mandant_id into v_mandant from public.profiles p where p.id = v_user;
  if found then
    return v_mandant;
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;
  if v_email is null then
    raise exception 'Konto nicht gefunden.' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u
                  where u.id = v_user and u.email_confirmed_at is not null) then
    raise exception 'Bitte bestaetigen Sie zuerst Ihre E-Mail-Adresse.'
      using errcode = '42501';
  end if;

  select coalesce((select wert::text::integer from public.plattform_werte
                    where schluessel = 'testphase_tage'), 28) into v_tage;
  select coalesce((select wert::text::integer from public.plattform_werte
                    where schluessel = 'testphase_credits'), 300) into v_credits;
  v_bis := now() + (v_tage || ' days')::interval;

  v_slug := public.mandant_slug_vorschlag(v_firma);

  insert into public.mandanten (name, slug, abo_status, testphase_bis)
    values (v_firma, v_slug, 'test', v_bis)
    returning id into v_mandant;

  insert into public.profiles (id, name, email, role, mandant_id)
    values (v_user, nullif(v_name, ''), v_email, 'chef', v_mandant);

  insert into public.firma_stammdaten (firma_name, slug, aktiv, sortierung, mandant_id)
    values (v_firma, 'standard', true, 1, v_mandant);

  perform public.mandant_grundeinstellungen(v_mandant);

  -- Die Testphase ist voller Funktionsumfang Starter. Die Abo-Zeile traegt
  -- den Tarif deshalb schon, aber ohne Stripe-Abo und mit Status "test" —
  -- das Nutzerlimit gilt damit von Anfang an.
  insert into public.mandant_abo (mandant_id, tarif, intervall, status, lesezugriff_bis)
    values (v_mandant, 'starter', 'monat', 'test',
            v_bis + (coalesce((select wert::text::integer from public.plattform_werte
                                where schluessel = 'lesezugriff_tage'), 30) || ' days')::interval)
    on conflict (mandant_id) do nothing;

  if v_credits > 0 then
    perform public.credits_gutschreiben(v_mandant, 'test', v_credits, v_bis,
                                        'test:' || v_mandant::text);
  end if;

  return v_mandant;
end
$function$;
