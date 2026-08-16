-- ===========================================================================
-- Aufraeumen des Vorentwurfs und Kapselung der RLS-Helfer
--
-- Zwei Befunde aus der Sicherheitspruefung nach dem Anlegen des Kernschemas:
--
-- 1) Auf auth.users lag noch der Trigger on_auth_user_created aus dem
--    Vorentwurf. Er rief handle_new_user() auf, das in die inzwischen
--    entfernte Tabelle profiles schrieb — JEDE Registrierung waere daran
--    gescheitert. Beides entfaellt; den Benutzer legt registriere_mandant() an.
--
-- 2) Die RLS-Helfer lagen im Schema public und waren dadurch als
--    REST-Endpunkte aufrufbar (/rest/v1/rpc/...). Sie gehoeren nicht zur
--    oeffentlichen Schnittstelle. Sie ziehen in ein eigenes Schema um, das
--    PostgREST nicht ausliefert. Die Policies verweisen ueber die Objekt-ID
--    und folgen dem Umzug automatisch — sie muessen nicht neu geschrieben
--    werden.
-- ===========================================================================

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.current_firma_id() cascade;

create schema if not exists intern;
comment on schema intern is
  'Interne Hilfsfunktionen fuer RLS und Trigger. Wird von PostgREST nicht ausgeliefert.';

grant usage on schema intern to authenticated, anon, service_role;

alter function public.aktueller_mandant()         set schema intern;
alter function public.aktuelle_rolle()            set schema intern;
alter function public.ist_verwaltung()            set schema intern;
alter function public.darf_schreiben()            set schema intern;
alter function public.setze_geaendert_am()        set schema intern;
alter function public.naechste_objektnummer()     set schema intern;
alter function public.pruefe_benutzer_aenderung() set schema intern;

-- registriere_mandant bleibt bewusst in public: Es ist der einzige Helfer, den
-- die Anwendung tatsaechlich als RPC aufruft (Registrierung). Der Zugriff ist
-- auf angemeldete Konten beschraenkt, und die Funktion prueft selbst, dass das
-- Konto noch zu keinem Unternehmen gehoert.
