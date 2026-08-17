-- Niemand erweitert seine eigenen Rechte.
--
-- Bisher galt: Wer nicht zur Verwaltung gehoert, darf Rolle und
-- Rechteuebersteuerung nicht aendern. Die Verwaltung selbst durfte alles — auch
-- an sich. Ein Administrator konnte sich damit Rechte geben, die seine Rolle
-- nicht vorsieht, etwa die volle Abrechnung.
--
-- Das ist keine grosse Luecke, weil ein Administrator ohnehin viel darf. Es ist
-- aber die falsche Eigenschaft: Eine Rechtevergabe, die man an sich selbst
-- vornehmen kann, ist keine Kontrolle. Ab hier gilt fuer JEDEN, unabhaengig von
-- der Rolle: Die eigene Rolle und die eigenen Rechte sind nicht selbst
-- aenderbar. Dafuer braucht es eine zweite Person mit Verwaltungsrechten —
-- dasselbe Prinzip, das beim Loeschen und beim Abschalten schon galt.
--
-- ACHTUNG bei kuenftigen Aenderungen an dieser Funktion:
--
-- Sie liegt in `intern`, NICHT in `public`. Ein erster Anlauf hat sie mit
-- `create or replace function public.pruefe_benutzer_aenderung()` geschrieben.
-- Das lief ohne Fehlermeldung durch, legte aber eine zweite, von niemandem
-- aufgerufene Funktion an — der Trigger zeigt auf die Fassung in `intern`. Die
-- Sperre war damit wirkungslos, und nichts hat darauf hingewiesen. Aufgefallen
-- ist es nur, weil supabase/tests/rechte-selbstermaechtigung.sql die Wirkung
-- prueft und nicht die Anwendung der Migration.
--
-- Ausserdem enthaelt die wirksame Fassung mehr Regeln, als die urspruengliche
-- Migrationsdatei zeigt — sie wurde spaeter erweitert. Beim Ersetzen muessen
-- ALLE bestehenden Regeln mitgefuehrt werden; ein Neuschreiben aus der aeltesten
-- Datei heraus haette den Schutz des letzten Inhabers und die Sperre gegen
-- fremde E-Mail-Aenderungen stillschweigend entfernt.
create or replace function intern.pruefe_benutzer_aenderung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verwaltung boolean := intern.ist_verwaltung();
  v_rolle      public.benutzerrolle := intern.aktuelle_rolle();
  v_selbst     boolean := new.id = auth.uid();
begin
  if new.mandant_id <> old.mandant_id then
    raise exception 'Der Mandant eines Benutzers kann nicht geaendert werden.';
  end if;

  if new.rolle <> old.rolle then
    if not v_verwaltung then
      raise exception 'Nur Inhaber und Administratoren duerfen Rollen aendern.';
    end if;
    -- NEU: auch nicht an sich selbst.
    if v_selbst then
      raise exception 'Die eigene Rolle kann nicht selbst geaendert werden.';
    end if;
  end if;

  if new.rechte_uebersteuerung <> old.rechte_uebersteuerung then
    if not v_verwaltung then
      raise exception 'Nur Inhaber und Administratoren duerfen Rechte aendern.';
    end if;
    -- NEU: der eigentliche Zweck dieser Migration.
    if v_selbst then
      raise exception 'Die eigenen Rechte koennen nicht selbst geaendert werden.';
    end if;
  end if;

  if (old.rolle = 'inhaber' or new.rolle = 'inhaber')
     and old.rolle <> new.rolle
     and v_rolle <> 'inhaber' then
    raise exception 'Nur der Inhaber darf die Inhaberrolle vergeben oder entziehen.';
  end if;

  if new.aktiv <> old.aktiv and not v_verwaltung then
    raise exception 'Nur Inhaber und Administratoren duerfen Zugaenge abschalten.';
  end if;

  if not new.aktiv and v_selbst then
    raise exception 'Der eigene Zugang kann nicht abgeschaltet werden.';
  end if;

  if lower(new.email) <> lower(old.email) and not v_verwaltung then
    raise exception 'Die E-Mail-Adresse kann nur die Verwaltung aendern.';
  end if;

  if (old.rolle = 'inhaber' and old.aktiv)
     and (new.rolle <> 'inhaber' or not new.aktiv)
     and not exists (
       select 1 from public.benutzer
        where mandant_id = old.mandant_id
          and rolle = 'inhaber'
          and aktiv
          and id <> old.id
     ) then
    raise exception 'Das Unternehmen braucht mindestens einen aktiven Inhaber.';
  end if;

  return new;
end;
$$;

comment on function intern.pruefe_benutzer_aenderung() is
  'Verhindert Rechteausweitung. Rolle und Rechte sind nie am eigenen Datensatz aenderbar — auch nicht durch die Verwaltung.';

-- Die versehentlich in `public` angelegte Zweitfassung entfernen. Sie wird von
-- keinem Trigger aufgerufen, waere aber beim naechsten Lesen des Schemas eine
-- irrefuehrende Spur.
drop function if exists public.pruefe_benutzer_aenderung();
