-- ===========================================================================
-- Nachweis: Werkzeuge — Wohnflaechenberechnungen, Grundrisse, Infrastruktur
-- am Objekt, Credit-Preise, Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111d1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefw@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333d3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdw@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'Mandant WA', 'mandant-wa'),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'Mandant WB', 'mandant-wb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111d1111', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Chefin', 'chefw@test.invalid', 'inhaber'),
  ('33333333-3333-3333-3333-3333333d3333', 'bbbbbbbb-0000-0000-0000-0000000000d2', 'Fremd', 'fremdw@test.invalid', 'inhaber');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung, status, vermarktungsart) values
  ('cccccccc-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'W-1', 'Haus A', 'aktiv', 'kauf'),
  ('cccccccc-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000d2', 'W-2', 'Haus B', 'aktiv', 'kauf');

do $$
declare
  v_fehler text; v_n int; v_id uuid; v_j jsonb;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000d1';
  c_o1 constant uuid := 'cccccccc-0000-0000-0000-0000000000d1';
  c_o2 constant uuid := 'cccccccc-0000-0000-0000-0000000000d2';
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111d1111","role":"authenticated"}';

  insert into public.wohnflaechen_berechnungen (mandant_id, objekt_id, bezeichnung, blatt, wohnflaeche, grundflaeche)
    values (c_m1, c_o1, 'Whg EG', '{"geschosse":[]}'::jsonb, 87.5, 92.1) returning id into v_id;
  select count(*) into v_n from public.wohnflaechen_berechnungen where objekt_id = c_o1;
  insert into erg values (1,'Wohnflaechenberechnung am Objekt','1',v_n::text,v_n=1);
  begin
    insert into public.wohnflaechen_berechnungen (mandant_id, objekt_id, bezeichnung) values (c_m1, c_o2, 'fremd');
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (2,'Berechnung an fremdem Objekt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.wohnflaechen_berechnungen set uebernommen_am = now() where id = v_id;
  update public.objekte set wohnflaeche = 87.5 where id = c_o1;
  select wohnflaeche::text into v_fehler from public.objekte where id = c_o1;
  insert into erg values (3,'Wohnflaeche ins Objekt uebernommen','87.50',v_fehler,v_fehler='87.50');

  insert into public.grundrisse (mandant_id, objekt_id, bezeichnung, quelle, daten)
    values (c_m1, c_o1, 'EG', 'scan', '{"waende":[{"id":"w1","a":{"x":0,"y":0},"b":{"x":500,"y":0},"staerke":20}]}'::jsonb) returning id into v_id;
  select jsonb_array_length(daten->'waende') into v_n from public.grundrisse where id = v_id;
  insert into erg values (4,'Grundriss mit Waenden gespeichert','1',v_n::text,v_n=1);
  begin
    insert into public.grundrisse (mandant_id, objekt_id, bezeichnung, quelle) values (c_m1, c_o1, 'x', 'unbekannt');
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (5,'Unbekannte Quelle abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  update public.objekte set infrastruktur = '{"einrichtungen":[{"kategorie":"supermarkt","entfernung_m":350}]}'::jsonb, infrastruktur_am = now() where id = c_o1;
  select infrastruktur->'einrichtungen'->0->>'kategorie' into v_fehler from public.objekte where id = c_o1;
  insert into erg values (6,'Infrastruktur am Objekt','supermarkt',v_fehler,v_fehler='supermarkt');

  select credits::text into v_fehler from public.credit_preise where aktion = 'ki_energieausweis';
  insert into erg values (7,'Credit-Preis Energieausweis','2',v_fehler,v_fehler='2');
  select count(*) into v_n from public.credit_preise where aktion in ('ki_bild_himmel','ki_bild_retusche');
  insert into erg values (8,'Credit-Preise Bild-Editor-KI','2',v_n::text,v_n=2);

  -- Mandantentrennung
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333d3333","role":"authenticated"}';
  select count(*) into v_n from public.wohnflaechen_berechnungen;
  insert into erg values (9,'Fremder Mandant sieht keine Berechnungen','0',v_n::text,v_n=0);
  select count(*) into v_n from public.grundrisse;
  insert into erg values (10,'Fremder Mandant sieht keine Grundrisse','0',v_n::text,v_n=0);
  select count(*) into v_n from public.objekte where infrastruktur is not null;
  insert into erg values (11,'Fremder Mandant sieht keine Infrastruktur','0',v_n::text,v_n=0);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
