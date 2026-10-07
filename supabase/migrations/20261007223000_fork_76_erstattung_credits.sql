-- ===========================================================================
-- fork_76 — Erstattung nimmt die Credits mit
-- ===========================================================================
-- Wird eine Rechnung bei Stripe erstattet (ganz oder teilweise), müssen die
-- Credits weg, die diese Rechnung gutgeschrieben hat — sonst behält der Kunde
-- 250 Credits für 0 €. Gefunden am 07.10.2026 beim ersten Live-Kauf.
--
-- Welche Töpfe eine Rechnung gefüllt hat, steht schon in credit_konten.referenz:
--   paket:<rechnung>:<zeile>   gekauftes Credit-Paket
--   rechnung:<rechnung>        Tarif-Credits einer Abo-Periode
--
-- Abgezogen wird der erstattete ANTEIL der gutgeschriebenen Credits, aber
-- höchstens das, was im Topf noch frei ist. Was der Kunde schon verbraucht
-- hat, lässt sich nicht zurückholen — das steht dann in der Notiz der
-- Ledger-Zeile, damit der Betreiber es sieht.
--
-- Der Anteil ist KUMULATIV (insgesamt erstattet ÷ Rechnungsbetrag). Kommt
-- dieselbe Erstattung zweimal an — als charge.refunded und als
-- credit_note.created, oder doppelt zugestellt —, wird nur die Differenz zum
-- schon Abgezogenen gebucht. Dadurch ist die Funktion idempotent, ohne eine
-- eigene Sperrtabelle.
--
-- Nur der Dienstschlüssel (Webhook) ruft sie.
--
-- Rücknahme: drop function public.credits_erstattung(uuid, text, numeric);
-- ===========================================================================

create or replace function public.credits_erstattung(
    p_mandant  uuid,
    p_rechnung text,
    p_anteil   numeric)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_anteil numeric := least(greatest(coalesce(p_anteil, 0), 0), 1);
  v_summe  integer := 0;
  v_vorgang uuid := gen_random_uuid();
  k record;
  v_ziel integer;
  v_schon integer;
  v_frei integer;
  v_nimm integer;
begin
  if p_rechnung is null or length(p_rechnung) < 3 then
    raise exception 'Rechnungskennung fehlt.' using errcode = '22023';
  end if;
  if v_anteil = 0 then
    return 0;
  end if;

  for k in
    select id, credits, verbraucht
      from public.credit_konten
     where mandant_id = p_mandant
       and (referenz = 'rechnung:' || p_rechnung
            or referenz like 'paket:' || p_rechnung || ':%')
     for update
  loop
    v_ziel := round(k.credits * v_anteil)::integer;
    select coalesce(sum(b.credits), 0) into v_schon
      from public.credit_buchungen b
     where b.konto_id = k.id and b.aktion = 'erstattung';
    v_frei := k.credits - k.verbraucht;
    v_nimm := least(greatest(v_ziel - v_schon, 0), v_frei);

    if v_nimm > 0 then
      update public.credit_konten set verbraucht = verbraucht + v_nimm where id = k.id;
    end if;
    -- Auch ein Abzug von null wird vermerkt, wenn etwas fällig gewesen wäre:
    -- dann hat der Kunde die Credits schon verbraucht, und genau das soll
    -- im Ledger stehen.
    if v_nimm > 0 or v_ziel - v_schon > 0 then
      insert into public.credit_buchungen
        (vorgang_id, mandant_id, aktion, credits, quelle, konto_id, status, referenz, notiz, abgeschlossen_am)
      values
        (v_vorgang, p_mandant, 'erstattung', v_nimm, 'erstattung', k.id, 'gebucht',
         'erstattung:' || p_rechnung,
         case when v_nimm < v_ziel - v_schon
              then format('Erstattung %s %%: %s Credits fällig, %s abgezogen — %s bereits verbraucht',
                          round(v_anteil * 100), v_ziel - v_schon, v_nimm, (v_ziel - v_schon) - v_nimm)
              else format('Erstattung %s %%: %s Credits abgezogen', round(v_anteil * 100), v_nimm)
         end,
         now());
    end if;
    v_summe := v_summe + v_nimm;
  end loop;
  return v_summe;
end
$function$;

comment on function public.credits_erstattung(uuid, text, numeric) is
  'Nimmt bei einer Stripe-Erstattung den erstatteten Anteil der Credits zurück, '
  'die die Rechnung gutgeschrieben hat — höchstens den freien Rest. Kumulativ '
  'und damit idempotent. Nur für den Dienstschlüssel.';

revoke all on function public.credits_erstattung(uuid, text, numeric) from public, anon, authenticated;
