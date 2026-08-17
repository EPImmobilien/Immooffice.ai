-- Logo-Ablage und eine engere Anbieterauskunft im Web-Exposé.

-- --- Logos ------------------------------------------------------------------
--
-- Als einziger Bucket oeffentlich lesbar. Das ist hier kein Versehen: Ein Logo
-- erscheint in jedem Exposé, auf jeder oeffentlichen Seite und in jedem
-- Marketingmotiv. Es geheim zu halten waere sinnlos, und signierte Verweise
-- wuerden das Logo in einem statisch ausgelieferten PDF nach einer Stunde
-- brechen. Geschrieben werden darf weiterhin nur im eigenen Mandantenordner.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marke', 'marke', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

create policy marke_anlegen on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'marke'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    -- Nur die Verwaltung: Das Logo ist die Aussenwirkung des Unternehmens.
    and intern.ist_verwaltung()
  );

create policy marke_aendern on storage.objects
  for update to authenticated
  using (
    bucket_id = 'marke'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.ist_verwaltung()
  );

create policy marke_loeschen on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'marke'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.ist_verwaltung()
  );

-- --- Engere Anbieterauskunft ------------------------------------------------
--
-- Bisher ging die Branding-Zeile als Ganzes nach draussen (`to_jsonb(m)` ohne
-- zwei Spalten). Damit wandert jede Spalte mit, die spaeter dazukommt — heute
-- unter anderem die Absenderkonfiguration des Mailversands. Darin steckt kein
-- Geheimnis, aber es ist interne Einrichtung und hat auf einer oeffentlichen
-- Seite nichts zu suchen.
--
-- Dieselbe Lehre wie bei den Unterlagen: Was nach aussen geht, wird aufgezaehlt
-- und nicht abgezogen. Eine Ausschlussliste muss bei jeder neuen Spalte
-- nachgepflegt werden — und wird es irgendwann nicht.
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
  v_dokumente jsonb;
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

  -- Genau die Angaben, die ein Interessent braucht, um den Anbieter zu erkennen
  -- und zu erreichen — plus die Rechtstexte, die auf eine oeffentliche Seite
  -- gehoeren.
  select jsonb_build_object(
           'firmenname', m.firmenname,
           'logo_pfad', m.logo_pfad,
           'farbe_primaer', m.farbe_primaer,
           'farbe_akzent', m.farbe_akzent,
           'strasse', m.strasse,
           'hausnummer', m.hausnummer,
           'plz', m.plz,
           'ort', m.ort,
           'telefon', m.telefon,
           'email', m.email,
           'web', m.web,
           'impressum', m.impressum,
           'datenschutztext', m.datenschutztext
         )
    into v_marke
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

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'pfad', d.pfad,
             'dateiname', d.dateiname,
             'art', d.art,
             'titel', d.titel,
             'bytes', d.bytes,
             'mime', d.mime
           ) order by d.art, d.erstellt_am
         ), '[]'::jsonb)
    into v_dokumente
    from public.objekt_dokumente d
   where d.objekt_id = v.objekt_id
     and d.sichtbarkeit = 'kunde'
     and (d.gueltig_bis is null or d.gueltig_bis >= current_date);

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
    'bilder', v_bilder,
    'unterlagen', v_dokumente
  );
end; $$;

grant execute on function public.web_expose_oeffnen(text, text, boolean)
  to anon, authenticated;
