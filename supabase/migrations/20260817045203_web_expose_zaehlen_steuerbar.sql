-- Der PDF-Download eines Web-Exposes soll die Aufrufstatistik nicht verzerren.
--
-- Bisher zaehlte jeder Aufruf von `web_expose_oeffnen`. Der Download braucht
-- dieselbe Pruefung, ist aber kein Seitenaufruf — sonst stuende in der
-- Statistik das Doppelte dessen, was tatsaechlich angesehen wurde.
create or replace function public.web_expose_oeffnen(
  p_token text, p_passwort text default null, p_zaehlen boolean default true)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_zustand public.web_expose_zustand;
  v_id uuid;
  v public.web_expose;
  v_objekt public.objekte;
  v_marke jsonb;
  v_bilder jsonb;
begin
  select p.zustand, p.expose_id into v_zustand, v_id
    from intern.web_expose_pruefen(p_token, p_passwort) p;

  if v_zustand <> 'ok' then
    return jsonb_build_object('zustand', v_zustand);
  end if;

  select * into v from public.web_expose where id = v_id;

  select * into v_objekt from public.objekte
   where id = v.objekt_id and geloescht_am is null;
  if not found then
    return jsonb_build_object('zustand', 'unbekannt');
  end if;

  select to_jsonb(m) - 'mandant_id' - 'id' into v_marke
    from public.mandant_branding m where m.mandant_id = v.mandant_id;

  select coalesce(jsonb_agg(b order by b.ist_titelbild desc, b.reihenfolge), '[]'::jsonb)
    into v_bilder
    from (
      select o.titel, o.art, o.ist_titelbild, o.reihenfolge,
             coalesce(neu.ki_bearbeitet, o.ki_bearbeitet) as ki_bearbeitet,
             coalesce(neu.pfad, o.pfad) as pfad,
             coalesce(neu.mime, o.mime) as mime
        from public.objekt_bilder o
        left join lateral (
          select v2.pfad, v2.ki_bearbeitet, v2.mime from public.objekt_bilder v2
           where v2.original_id = o.id order by v2.erstellt_am desc limit 1
        ) neu on true
       where o.objekt_id = v.objekt_id and o.original_id is null
    ) b;

  if p_zaehlen then
    insert into public.web_expose_aufruf (web_expose_id, tag, aufrufe)
    values (v.id, current_date, 1)
    on conflict (web_expose_id, tag)
      do update set aufrufe = public.web_expose_aufruf.aufrufe + 1;
  end if;

  return jsonb_build_object(
    'zustand', 'ok',
    'download_erlaubt', v.download_erlaubt,
    'kontaktformular', v.kontaktformular,
    'objekt', to_jsonb(v_objekt) - 'mandant_id' - 'erstellt_von' - 'zustaendig_id'
              - 'eigentuemer_id' - 'geloescht_am',
    'anbieter', coalesce(v_marke, '{}'::jsonb),
    'bilder', v_bilder
  );
end; $$;

-- Die alte Signatur wuerde sonst als eigene Funktion bestehen bleiben und je
-- nach Aufruf die eine oder die andere Fassung treffen.
drop function if exists public.web_expose_oeffnen(text, text);

grant execute on function public.web_expose_oeffnen(text, text, boolean)
  to anon, authenticated;
