-- Befund aus der Sicherheitspruefung: Mehrere security-definer-Funktionen
-- waren ueber die REST-Schnittstelle fuer NICHT ANGEMELDETE Aufrufer
-- erreichbar. Postgres vergibt das Ausfuehrungsrecht neuer Funktionen
-- standardmaessig an PUBLIC — und `anon` erbt davon.
--
-- Am schwersten wiegt `credits_gutschreiben`: Die Funktion nimmt die
-- Mandanten-ID als Parameter, prueft den Aufrufer nicht und umgeht als
-- security definer die Row-Level-Security. Wer eine Mandanten-ID kannte,
-- haette sich ohne Anmeldung beliebig viele Credits gutschreiben koennen.
-- Dasselbe gilt fuer `credits_monat_zuteilen`, das intern gutschreibt.
--
-- Diese beiden Funktionen gehoeren nicht in die Hand von Nutzern, sondern
-- ausschliesslich zu Stripe-Webhook und Job-Worker. Beide laufen mit der
-- Dienstrolle, die Funktionsrechte ohnehin nicht braucht.

revoke execute on function
  public.credits_gutschreiben(uuid, public.credit_herkunft, integer, timestamptz, text)
  from public, anon, authenticated;

revoke execute on function public.credits_monat_zuteilen(uuid)
  from public, anon, authenticated;

-- Die uebrigen Credit-Funktionen arbeiten ausschliesslich auf dem Mandanten
-- der aufrufenden Sitzung. Angemeldete Nutzer brauchen sie, nicht angemeldete
-- Besucher haben dort nichts zu suchen.
revoke execute on function public.credits_verfuegbar() from public, anon;
grant execute on function public.credits_verfuegbar() to authenticated;

revoke execute on function public.credits_reservieren(text, text, uuid) from public, anon;
grant execute on function public.credits_reservieren(text, text, uuid) to authenticated;

revoke execute on function public.credits_einloesen(uuid, numeric) from public, anon;
grant execute on function public.credits_einloesen(uuid, numeric) to authenticated;

revoke execute on function public.credits_freigeben(uuid, text) from public, anon;
grant execute on function public.credits_freigeben(uuid, text) to authenticated;

-- Matching liefert fuer `anon` ohnehin nichts, weil kein Mandant in der
-- Sitzung steht. Trotzdem gehoert die Funktion nicht in die oeffentliche
-- Schnittstelle.
revoke execute on function public.treffer_fuer_objekt(uuid) from public, anon;
grant execute on function public.treffer_fuer_objekt(uuid) to authenticated;

revoke execute on function public.treffer_fuer_profil(uuid) from public, anon;
grant execute on function public.treffer_fuer_profil(uuid) to authenticated;

-- Bewusst oeffentlich: Diese drei brauchen Aufrufer ohne Anmeldung.
-- `registriere_mandant` fuer die Registrierung, die beiden Web-Expose-
-- Funktionen fuer oeffentliche Exposés. Beide pruefen selbst, was sie
-- preisgeben.
revoke execute on function public.registriere_mandant(text, text) from public;
grant execute on function public.registriere_mandant(text, text) to anon, authenticated;

revoke execute on function public.web_expose_oeffnen(text, text, boolean) from public;
grant execute on function public.web_expose_oeffnen(text, text, boolean) to anon, authenticated;

revoke execute on function
  public.web_expose_anfrage_senden(text, text, text, text, text, text) from public;
grant execute on function
  public.web_expose_anfrage_senden(text, text, text, text, text, text)
  to anon, authenticated;

revoke execute on function public.passwort_hashen(text) from public, anon;
grant execute on function public.passwort_hashen(text) to authenticated;

-- Zweiter Befund: Drei Funktionen ohne festen `search_path`. Bei einer
-- security-definer-Funktion liesse sich darueber eigener Code unterschieben;
-- bei den uebrigen ist es zumindest eine unnoetige Unbestimmtheit.
alter function intern.ledger_unveraenderbar() set search_path = public, pg_temp;
alter function intern.bild_original_schuetzen() set search_path = public, pg_temp;
alter function intern.treffer_punktzahl(public.suchprofile, public.objekte)
  set search_path = public, pg_temp;
