-- Hashfunktion fuer das Passwort eines Web-Exposes.
--
-- Bewusst in der Datenbank: Das Klartext-Passwort soll nirgends gespeichert
-- werden, und die Pruefung beim Oeffnen laeuft ohnehin ueber `crypt`. Die
-- Funktion greift auf keine Daten zu — sie bekommt einen Text und gibt einen
-- Hash zurueck. Damit ist sie auch dann harmlos, wenn sie jemand direkt
-- aufruft.
--
-- Kein Zugriff fuer `anon`: Nicht angemeldete Besucher haben keinen Grund,
-- Hashes erzeugen zu lassen.
create or replace function public.passwort_hashen(p_passwort text)
returns text
language sql immutable security definer
set search_path = extensions, pg_temp
as $$
  select extensions.crypt(p_passwort, extensions.gen_salt('bf', 10));
$$;

revoke execute on function public.passwort_hashen(text) from public, anon;
grant execute on function public.passwort_hashen(text) to authenticated;
