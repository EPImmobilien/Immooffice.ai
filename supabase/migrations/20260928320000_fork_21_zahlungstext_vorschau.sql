-- ===========================================================================
-- Fork-eigene Migration 21 — der Zahlungstext auch fuer noch nicht
-- gespeicherte Eingaben
--
-- Abschnitt 3c verlangt fuer die Belegnummern eine Live-Vorschau. Fuer die
-- Zahlungsbedingung gilt dasselbe: wer "7 Tage 2 % Skonto, 30 Tage netto"
-- einstellt, will den Satz sehen, BEVOR er speichert.
--
-- fork_19 hat zahlungsbedingung_text(uuid) gebaut. Die braucht eine Zeile in
-- der Tabelle, also eine gespeicherte Bedingung — fuer die Vorschau zu spaet.
--
-- Der naheliegende Ausweg waere, den Satz in der Oberflaeche zusammenzusetzen.
-- Das waere derselbe Fehler wie bei hat_recht(): zwei Fassungen einer Regel,
-- die auseinanderlaufen, und die Vorschau zeigt am Ende etwas anderes als der
-- Beleg. Deshalb hier derselbe Bau wie bei den Belegnummern:
--
--   zahlungsbedingung_text_aus(...)  rechnet aus den Werten   <- die Wahrheit
--   zahlungsbedingung_text(uuid)     liest die Zeile und ruft die erste
--
-- Es gibt den Satz danach genau einmal.
-- ===========================================================================

create or replace function public.zahlungsbedingung_text_aus(
  p_netto_tage     integer,
  p_skonto_prozent numeric  default null,
  p_skonto_tage    integer  default null,
  p_eigener_text   text     default null)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(
    nullif(btrim(p_eigener_text), ''),
    case
      when p_skonto_prozent is null or p_skonto_tage is null then
        'Zahlbar innerhalb von ' || coalesce(p_netto_tage, 0) || ' Tagen ohne Abzug.'
      else
        'Zahlbar innerhalb von ' || p_skonto_tage || ' Tagen mit ' ||
        trim(trailing '.' from trim(trailing '0' from to_char(p_skonto_prozent, 'FM990.00'))) ||
        ' % Skonto, innerhalb von ' || coalesce(p_netto_tage, 0) || ' Tagen ohne Abzug.'
    end)
$function$;

comment on function public.zahlungsbedingung_text_aus(integer, numeric, integer, text) is
  'Der Satz auf dem Beleg, aus den reinen Werten. Eigener Text schlaegt die '
  'Zahlen. Hier steht die Regel; zahlungsbedingung_text(uuid) liest nur die '
  'Zeile und ruft diese Funktion. Damit gibt es den Satz genau einmal.';

grant execute on function public.zahlungsbedingung_text_aus(integer, numeric, integer, text)
  to authenticated, service_role;

-- --- Die bisherige Funktion gibt die Rechnung ab ---------------------------
create or replace function public.zahlungsbedingung_text(p_id uuid)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select public.zahlungsbedingung_text_aus(
           z.netto_tage, z.skonto_prozent, z.skonto_tage, z.text_auf_beleg)
    from public.zahlungsbedingungen z where z.id = p_id
$function$;

-- --- Wachposten ------------------------------------------------------------
-- Rechnet zahlungsbedingung_text(uuid) eines Tages wieder selbst, gibt es den
-- Satz zweimal, und genau dann faengt das Auseinanderlaufen an.
do $$
declare quelle text;
begin
  select prosrc into quelle from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'zahlungsbedingung_text';
  if quelle !~ 'zahlungsbedingung_text_aus' then
    raise exception 'zahlungsbedingung_text rechnet wieder selbst statt zu delegieren.';
  end if;
  if quelle ~ 'Zahlbar innerhalb' then
    raise exception 'Der Satz steht wieder an zwei Stellen.';
  end if;
end $$;
