-- Freigegebene Unterlagen im Web-Exposé.
--
-- Der Freigabeschalter an einer Unterlage hat bisher nichts Sichtbares getan:
-- `sichtbarkeit = 'kunde'` war gesetzt, aber im oeffentlichen Exposé tauchte
-- die Unterlage nicht auf. Das wird hier nachgezogen.
--
-- Anders als bei Bildern ist NICHT alles oeffentlich, was am Objekt haengt.
-- Bilder eines veroeffentlichten Objekts sind samt und sonders zur Ansicht
-- gedacht; Unterlagen sind es nicht. Ein Grundbuchauszug, eine Vollmacht oder
-- ein Maklervertrag darf unter keinen Umstaenden nach draussen. Deshalb gilt
-- hier eine zusaetzliche Bedingung, die es bei Bildern nicht gibt: Nur eine
-- ausdruecklich freigegebene Unterlage wird ausgeliefert.

-- --- Storage-Freigabe -------------------------------------------------------
--
-- Bewusst strenger gebaut als das Gegenstueck fuer Bilder: Dort wird das
-- zweite Pfadsegment als Objekt-ID gelesen und gegen die Veroeffentlichung
-- geprueft. Hier wird der VOLLSTAENDIGE Pfad gegen die Unterlagentabelle
-- geprueft. Damit haengt die Freigabe an genau dem Datensatz, der das
-- Kennzeichen `sichtbarkeit` traegt — und nicht an einer Annahme darueber, wie
-- Pfade aufgebaut sind. Waere der Pfadaufbau je anders, gaebe eine
-- Segmentpruefung eine Datei frei, die niemand freigegeben hat.
create or replace function intern.dokument_im_web_expose(p_name text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.objekt_dokumente d
      join public.web_expose w on w.objekt_id = d.objekt_id
     where d.pfad = p_name
       -- Der Kern dieser Funktion. Ohne diese Zeile waere jede Unterlage
       -- eines veroeffentlichten Objekts oeffentlich, Grundbuchauszug
       -- eingeschlossen.
       and d.sichtbarkeit = 'kunde'
       and w.widerrufen_am is null
       and (w.ablauf_am is null or w.ablauf_am > now())
  );
$$;

revoke all on function intern.dokument_im_web_expose(text) from public;
-- Die Storage-Policy laeuft unter der Rolle des Besuchers, deshalb braucht
-- `anon` das Ausfuehrungsrecht. Ueber die REST-Schnittstelle ist die Funktion
-- nicht erreichbar: Das Schema `intern` wird nicht veroeffentlicht.
grant execute on function intern.dokument_im_web_expose(text) to anon, authenticated;

comment on function intern.dokument_im_web_expose(text) is
  'Ist diese Datei eine an Interessenten freigegebene Unterlage eines gueltigen Web-Exposes?';

create policy objektdokumente_web_expose on storage.objects
  for select to anon
  using (
    bucket_id = 'objektdokumente'
    and intern.dokument_im_web_expose(name)
  );

-- --- Unterlagen in der Antwort ---------------------------------------------

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

  -- Nur freigegebene Unterlagen, und nur die Felder, die der Besucher braucht.
  -- Der interne Vermerk (`notiz`) und der Zeitpunkt des Hochladens bleiben
  -- ausdruecklich AUSSEN vor: Sie sagen etwas ueber die Arbeitsweise des
  -- Maklers und haben draussen nichts zu suchen. Aus demselben Grund wird die
  -- Liste hier Feld fuer Feld aufgebaut und nicht mit `to_jsonb` erzeugt — so
  -- wandert eine spaeter ergaenzte Spalte nicht versehentlich mit nach aussen.
  --
  -- Abgelaufene Unterlagen werden nicht ausgeliefert. Ein abgelaufener
  -- Energieausweis im oeffentlichen Exposé ist ein Ordnungswidrigkeitsrisiko
  -- nach dem Gebaeudeenergiegesetz — er verschwindet lieber, als falsch zu
  -- informieren.
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
