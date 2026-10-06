-- ===========================================================================
-- fork_57 — der Schalter für die Selbstregistrierung wirkt auch
-- ===========================================================================
-- fork_54 hat `plattform_werte.registrierung_offen` angelegt und die Funktion
-- `registrierung_offen()` dazu. Gelesen hat sie bisher niemand. Ein Schalter
-- im Plattform-Admin, der nichts tut, ist schlimmer als kein Schalter: der
-- Betreiber stellt ihn auf „zu" und glaubt, es sei zu.
--
-- Also fragt `registrierung_abschliessen` ihn jetzt — gleich nach der
-- Rückgabe für Konten, die schon ein Profil haben, und vor jeder Prüfung,
-- die etwas anlegt. Bestandskunden merken nichts davon; geschlossen wird
-- nur der Weg für ein Konto ohne Profil.
--
-- Die Meldung sagt, was zu tun ist. „Registrierung geschlossen" allein
-- liesse jemanden mit einer bestätigten Mailadresse und ohne Zugang
-- zurück — und ohne Ahnung, an wen er sich wenden soll.
-- ===========================================================================

create or replace function public.registrierung_abschliessen(
    p_firma text, p_name text default null)
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

  -- Wer schon ein Profil hat, kommt hier ohnehin nur durch, um seine
  -- Mandantenkennung zu bekommen. Das bleibt offen, auch wenn die
  -- Registrierung geschlossen ist — sonst sperrte der Schalter Bestandskunden aus.
  select p.mandant_id into v_mandant from public.profiles p where p.id = v_user;
  if found then
    return v_mandant;
  end if;

  if not public.registrierung_offen() then
    raise exception 'Die Selbstregistrierung ist zurzeit geschlossen. Bitte '
      'wenden Sie sich an den Betreiber, um einen Zugang zu erhalten.'
      using errcode = '42501';
  end if;

  if length(v_firma) < 2 then
    raise exception 'Bitte geben Sie einen Firmennamen an.' using errcode = '22023';
  end if;
  if length(v_firma) > 120 then
    v_firma := left(v_firma, 120);
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

comment on function public.registrierung_abschliessen(text, text) is
  'Legt beim ersten Anmelden Mandant, Profil, Stammdaten, Testphase und '
  'Testcredits an. Fragt den Schalter registrierung_offen, bevor etwas '
  'angelegt wird — wer schon ein Profil hat, kommt weiterhin durch.';
