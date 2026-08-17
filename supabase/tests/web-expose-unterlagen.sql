-- ===========================================================================
-- Nachweis: nur freigegebene Unterlagen gelangen ins Web-Exposé
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/web-expose-unterlagen.sql
--
-- Anders als bei Bildern ist hier NICHT alles oeffentlich, was am Objekt
-- haengt. Bilder eines veroeffentlichten Objekts sind samt und sonders zur
-- Ansicht gedacht; Unterlagen sind es nicht. Geprueft wird deshalb beides: dass
-- die freigegebene Unterlage ankommt UND dass die drei anderen Faelle draussen
-- bleiben — nicht freigegeben, vertraulich, abgelaufen.
--
-- Der letzte Fall ist der wichtigste: Nach einem Widerruf muss auch die DATEI
-- gesperrt sein, nicht nur die Seite. Eine Seite ohne Verweis, deren Dateien
-- weiter erreichbar sind, ist kein Widerruf.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1','Mandant D','mandant-d1');
insert into public.objekte (id,mandant_id,objektnummer,bezeichnung,vermarktungsart,objektkategorie,status)
values ('c0000000-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000d1','1','Objekt D','kauf','wohnung','aktiv');

insert into public.web_expose (id,mandant_id,objekt_id,token)
values ('44444444-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000d1',
        'c0000000-0000-0000-0000-0000000000d1','abcdefghijklmnop');

-- Vier Unterlagen mit unterschiedlichem Schicksal.
insert into public.objekt_dokumente (mandant_id,objekt_id,pfad,dateiname,art,sichtbarkeit,gueltig_bis) values
  -- freigegeben und gueltig -> muss erscheinen
  ('aaaaaaaa-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1',
   'aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundriss.pdf','grundriss.pdf','grundriss','kunde',null),
  -- nicht freigegeben -> darf nicht erscheinen
  ('aaaaaaaa-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1',
   'aaaaaaaa-0000-0000-0000-0000000000d1/d1/intern.pdf','intern.pdf','protokoll','intern',null),
  -- vertraulich; kann den Zustand „kunde" gar nicht erreichen
  ('aaaaaaaa-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1',
   'aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundbuch.pdf','grundbuch.pdf','grundbuchauszug','intern',null),
  -- freigegeben, aber abgelaufen -> darf nicht erscheinen
  ('aaaaaaaa-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1',
   'aaaaaaaa-0000-0000-0000-0000000000d1/d1/energie_alt.pdf','energie_alt.pdf','energieausweis','kunde','2020-01-01');

do $$
declare v jsonb; v_anzahl int; v_namen text;
begin
  v := public.web_expose_oeffnen('abcdefghijklmnop', null, false);

  select count(*), string_agg(u->>'dateiname', ',' order by u->>'dateiname')
    into v_anzahl, v_namen
    from jsonb_array_elements(v->'unterlagen') u;

  insert into erg values (1,'Nur die freigegebene, gueltige Unterlage erscheint','grundriss.pdf',
    coalesce(v_namen,'keine'), v_namen = 'grundriss.pdf');
  insert into erg values (2,'Genau eine Unterlage','1',v_anzahl::text,v_anzahl=1);

  -- Der interne Vermerk darf nicht mitwandern. Die Liste wird in der Funktion
  -- Feld fuer Feld aufgebaut und nicht mit `to_jsonb` erzeugt — sonst wanderte
  -- jede spaeter ergaenzte Spalte automatisch nach draussen.
  insert into erg values (3,'Kein Feld notiz nach aussen','nein',
    case when (v->'unterlagen')::text like '%notiz%' then 'JA' else 'nein' end,
    (v->'unterlagen')::text not like '%notiz%');

  -- Die Speicherfreigabe muss dieselbe Grenze ziehen wie die Liste. Waere sie
  -- weiter, koennte man an der Liste vorbei an die Datei kommen.
  insert into erg values (4,'Storage gibt den freigegebenen Grundriss frei','true',
    intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundriss.pdf')::text,
    intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundriss.pdf'));
  insert into erg values (5,'Storage gibt den Grundbuchauszug NICHT frei','false',
    intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundbuch.pdf')::text,
    not intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundbuch.pdf'));
  insert into erg values (6,'Storage gibt die interne Unterlage NICHT frei','false',
    intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/intern.pdf')::text,
    not intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/intern.pdf'));

  -- Widerruf beendet die Freigabe sofort, auch fuer die Datei selbst.
  update public.web_expose set widerrufen_am = now()
   where id='44444444-0000-0000-0000-0000000000d1';
  insert into erg values (7,'Nach Widerruf ist die Datei gesperrt','false',
    intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundriss.pdf')::text,
    not intern.dokument_im_web_expose('aaaaaaaa-0000-0000-0000-0000000000d1/d1/grundriss.pdf'));
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
