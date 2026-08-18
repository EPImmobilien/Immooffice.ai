-- ===========================================================================
-- Nachweis fuer Vertraege und die einfache elektronische Signatur
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/vertraege.sql
--
-- Der Unterschriftsweg ist wie beim Web-Exposé gebaut: ein Token, eine
-- Datenbankfunktion fuer den Zugriff ohne Anmeldung, keine Lesepolicy fuer
-- `anon`. Geprueft wird deshalb beides — dass die Gegenseite unterzeichnen
-- kann UND dass nichts nach aussen gelangt, was nicht hinaus soll.
--
-- Die wichtigste Pruefung ist Nummer 10: Nach der ersten Unterschrift ist der
-- Text gesperrt. Ohne diese Sperre stuende eine Unterschrift unter einem
-- anderen Text als dem unterzeichneten — der Fingerabdruck wuerde die
-- Abweichung zwar anzeigen, aber erst hinterher.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to anon, authenticated;

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-00000000ab01','Mandant G','mandant-g1');
insert into public.mandant_branding (mandant_id, firmenname) values
  ('aaaaaaaa-0000-0000-0000-00000000ab01','Nordlicht Immobilien');

insert into public.vertraege (id,mandant_id,art,titel,inhalt,status,token,versendet_am)
values ('99999999-0000-0000-0000-00000000ab01','aaaaaaaa-0000-0000-0000-00000000ab01',
        'maklervertrag','Maklervertrag Rosenweg 12','Provision 3,57 % inkl. MwSt.',
        'versendet','abcdefghijklmnop','2026-03-01');

insert into public.vertraege (id,mandant_id,art,titel,inhalt,status)
values ('88888888-0000-0000-0000-00000000ab01','aaaaaaaa-0000-0000-0000-00000000ab01',
        'maklervertrag','Entwurf','Noch nicht versendet','entwurf');

do $$
declare v jsonb; v_fehler text; v_hash text; v_txt text; v_anz int;
begin
  set local role anon;

  v := public.vertrag_oeffnen('nichtvorhandenxx');
  insert into erg values (1,'Unbekannter Token liefert nichts','unbekannt',v->>'zustand',v->>'zustand'='unbekannt');

  v := public.vertrag_oeffnen('abcdefghijklmnop');
  insert into erg values (2,'Versendeter Vertrag ist abrufbar','ok',v->>'zustand',v->>'zustand'='ok');

  -- Was nach aussen geht, ist aufgezaehlt und nicht abgezogen.
  insert into erg values (3,'Kein Mandantenbezug nach aussen','nein',
    case when v::text like '%mandant_id%' then 'JA' else 'nein' end,
    v::text not like '%mandant_id%');

  v := public.vertrag_unterzeichnen('abcdefghijklmnop','','a@b.de');
  insert into erg values (4,'Unterschrift ohne Namen abgewiesen','eingabe',v->>'grund',v->>'grund'='eingabe');
  v := public.vertrag_unterzeichnen('abcdefghijklmnop','A. Sommer','keine-mail');
  insert into erg values (5,'Unterschrift ohne gueltige E-Mail abgewiesen','eingabe',v->>'grund',v->>'grund'='eingabe');

  v := public.vertrag_unterzeichnen('abcdefghijklmnop','A. Sommer','a.sommer@example.invalid');
  insert into erg values (6,'Unterschrift wird angenommen','true',(v->>'ok'),(v->>'ok')='true');

  reset role;

  select jsonb_array_length(unterzeichnungen) into v_anz
    from public.vertraege where id='99999999-0000-0000-0000-00000000ab01';
  insert into erg values (7,'Genau eine Unterzeichnung','1',v_anz::text,v_anz=1);

  -- Der Fingerabdruck entsteht in der Datenbank aus dem GESPEICHERTEN Text.
  -- Ein vom Browser mitgeschickter Hash waere die Behauptung des
  -- Unterzeichners darueber, was er gesehen hat — und damit wertlos.
  -- Der erwartete Wert ist SHA-256 von 'Provision 3,57 % inkl. MwSt.' und
  -- stimmt mit der Rechnung in src/lib/vertraege.ts ueberein; weichen beide ab,
  -- meldet die Anwendung bei jedem Vertrag faelschlich eine Aenderung.
  select unterzeichnungen->0->>'dokument_hash' into v_hash
    from public.vertraege where id='99999999-0000-0000-0000-00000000ab01';
  insert into erg values (8,'Fingerabdruck stimmt mit der Anwendung ueberein',
    'cc20a4b1763da37542f424de07e74602be9674cf4a71cf67ff2f442ff7955841',
    coalesce(v_hash,'fehlt'),
    v_hash = 'cc20a4b1763da37542f424de07e74602be9674cf4a71cf67ff2f442ff7955841');

  select geschlossen_am::text into v_txt from public.vertraege
   where id='99999999-0000-0000-0000-00000000ab01';
  insert into erg values (9,'Vertragsschluss festgehalten',current_date::text,
    coalesce(v_txt,'fehlt'), v_txt = current_date::text);

  begin
    update public.vertraege set inhalt='Provision 5,95 %'
     where id='99999999-0000-0000-0000-00000000ab01';
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgelehnt';
  end;
  insert into erg values (10,'Text nach Unterschrift gesperrt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Gegenprobe: Ein Entwurf muss weiter aenderbar sein.
  update public.vertraege set inhalt='Ueberarbeitet'
   where id='88888888-0000-0000-0000-00000000ab01';
  insert into erg values (11,'Entwurf bleibt aenderbar','geaendert','geaendert',true);

  set local role anon;
  v := public.vertrag_unterzeichnen('abcdefghijklmnop','B. Zweit','b@example.invalid');
  insert into erg values (12,'Kein zweites Unterzeichnen ueber denselben Link','unbekannt',
    coalesce(v->>'grund','ok'), v->>'grund'='unbekannt');
  reset role;
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
