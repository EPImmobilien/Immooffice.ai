-- ===========================================================================
-- ImmoOffice.ai — Einplaner fuer getaktete Abgleiche
--
-- docs/AUTONOMIE.md 5.3: Sync-Intervall manuell, 15 min, stuendlich, taeglich.
-- Der Worker-Endpunkt ruft diese Funktion bei jedem Aufruf (minuetlich); sie
-- stellt fuer jede faellige Integration einen Auftrag ein — hoechstens einen
-- offenen je Integration.
-- ===========================================================================

create or replace function public.sync_faellige_einplanen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_i public.integrationen%rowtype;
  v_anzahl integer := 0;
  v_abstand interval;
begin
  for v_i in
    select * from public.integrationen
     where intervall <> 'manuell'
       and anbieter <> 'openimmo'           -- Dateien laufen nie nach Takt
       and status in ('aktiv', 'fehler')    -- pausiert und neu warten auf die Verwaltung
  loop
    v_abstand := case v_i.intervall
                   when '15min'      then interval '15 minutes'
                   when 'stuendlich' then interval '1 hour'
                   else                   interval '1 day'
                 end;

    if v_i.letzter_sync_am is not null and v_i.letzter_sync_am + v_abstand > now() then
      continue;
    end if;

    -- Nur ein offener Auftrag je Integration.
    if exists (
      select 1 from public.jobs
       where art = 'sync' and status in ('offen', 'laeuft')
         and nutzlast ->> 'integration_id' = v_i.id::text
    ) then
      continue;
    end if;

    insert into public.jobs (mandant_id, art, nutzlast, prioritaet)
    values (v_i.mandant_id, 'sync',
            jsonb_build_object('integration_id', v_i.id, 'richtung', v_i.richtung, 'ausloeser', 'zeitplan'),
            6);
    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

revoke all on function public.sync_faellige_einplanen() from public, anon, authenticated;
grant execute on function public.sync_faellige_einplanen() to service_role;
