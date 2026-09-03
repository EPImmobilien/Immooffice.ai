-- ===========================================================================
-- Nachgetragen aus dem Produktivprojekt (supabase_migrations.schema_migrations,
-- Version 20260817183433). Die Migration war ausgerollt, aber nicht
-- versioniert — siehe docs/STATUS.md vom 03.09.2026.
--
-- Inhaltlich die wirksame Fassung der Sperre gegen Selbstermaechtigung, die
-- supabase/tests/rechte-selbstermaechtigung.sql nachweist.
-- ===========================================================================
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
    if v_selbst then
      raise exception 'Die eigene Rolle kann nicht selbst geaendert werden.';
    end if;
  end if;

  if new.rechte_uebersteuerung <> old.rechte_uebersteuerung then
    if not v_verwaltung then
      raise exception 'Nur Inhaber und Administratoren duerfen Rechte aendern.';
    end if;
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

drop function if exists public.pruefe_benutzer_aenderung();
