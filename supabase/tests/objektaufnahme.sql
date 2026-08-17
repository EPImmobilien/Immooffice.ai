-- ===========================================================================
-- Nachweis der Objektaufnahme und ihrer Uebernahme
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/objektaufnahme.sql
--
-- Die Uebernahme fasst vier Schritte zusammen: Objekt anlegen, Eigentuemer
-- verknuepfen, Aufgaben fuer die offenen Unterlagen erzeugen, Aufnahme
-- kennzeichnen. Geprueft wird deshalb nicht nur, DASS ein Objekt entsteht,
-- sondern dass alle vier Schritte zusammen geschehen — und dass bei einem
-- Abbruch keiner davon stehen bleibt.
--
-- Die Funktion laeuft bewusst OHNE `security definer`. Sie soll genau die
-- Rechte des Aufrufers haben; ein Nur-Lese-Zugriff darf mit ihr nichts anlegen.
-- Pruefung 2 und 3 halten das fest.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-1111111ee111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ae@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-2222222ee222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','le@test.invalid','x',now(),now(),now());

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1','Mandant E','mandant-e1');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-1111111ee111','aaaaaaaa-0000-0000-0000-0000000000e1','Nutzer E','ae@test.invalid','makler'),
  ('22222222-2222-2222-2222-2222222ee222','aaaaaaaa-0000-0000-0000-0000000000e1','Nur Lesen','le@test.invalid','nur_lesen');
insert into public.kontakte (id,mandant_id,nachname) values
  ('e0000000-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000e1','Sommer');

do $$
declare v_objekt uuid; v int; v_txt text; v_fehler text; v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111ee111","role":"authenticated"}';

  insert into public.objektaufnahmen
    (mandant_id, kontakt_id, bezeichnung, strasse, hausnummer, plz, ort,
     objektkategorie, vermarktungsart, wohnflaeche, zimmer, baujahr,
     zustand_dach, zustand_heizung, heizungsart, preisvorstellung,
     unterlagen_offen, notizen, erstellt_von)
  values
    ('aaaaaaaa-0000-0000-0000-0000000000e1','e0000000-0000-0000-0000-0000000000e1',
     'ETW Rosenweg 12','Rosenweg','12','24103','Kiel','wohnung','kauf',78.5,3,1998,
     'gut','mittel','Gastherme 2009',360000,
     array['grundriss','energieausweis','teilungserklaerung']::public.dokumentart[],
     'Eigentümer möchte im Frühjahr verkaufen.',
     '11111111-1111-1111-1111-1111111ee111')
  returning id into v_id;
  insert into erg values (1,'Aufnahme anlegen','angelegt','angelegt',true);

  -- Nur-Lese-Zugriff darf nicht uebernehmen.
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222ee222","role":"authenticated"}';
  begin
    perform public.aufnahme_uebernehmen(v_id);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (2,'Nur-Lese-Zugriff kann nicht uebernehmen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Und es bleibt kein halbes Objekt zurueck.
  select count(*) into v from public.objekte where mandant_id='aaaaaaaa-0000-0000-0000-0000000000e1';
  insert into erg values (3,'Kein Objekt aus dem gescheiterten Versuch','0',v::text,v=0);

  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111ee111","role":"authenticated"}';
  v_objekt := public.aufnahme_uebernehmen(v_id);
  insert into erg values (4,'Uebernahme erzeugt ein Objekt','ja',
    case when v_objekt is not null then 'ja' else 'nein' end, v_objekt is not null);

  select status::text into v_txt from public.objekte where id = v_objekt;
  insert into erg values (5,'Objekt startet in der Akquise','akquise',v_txt,v_txt='akquise');

  select objektnummer into v_txt from public.objekte where id = v_objekt;
  insert into erg values (6,'Objektnummer wird vergeben','vierstellig',v_txt,v_txt ~ '^\d{4}$');

  select count(*) into v from public.kontakt_objekt
   where objekt_id = v_objekt and rolle='eigentuemer'
     and kontakt_id='e0000000-0000-0000-0000-0000000000e1';
  insert into erg values (7,'Eigentuemer ist verknuepft','1',v::text,v=1);

  -- Der Kern der Uebernahme: Der Termin erzeugt die Arbeit, die aus ihm folgt.
  select count(*) into v from public.aufgaben
   where objekt_id = v_objekt and titel like 'Unterlage anfordern:%';
  insert into erg values (8,'Je offene Unterlage eine Aufgabe','3',v::text,v=3);

  select count(*) into v from public.aufgaben
   where objekt_id = v_objekt and kontakt_id='e0000000-0000-0000-0000-0000000000e1';
  insert into erg values (9,'Aufgaben haengen auch am Eigentuemer','3',v::text,v=3);

  -- Die Preisvorstellung ist eine Aussage des Eigentuemers, kein Angebotspreis.
  -- Sie als Kaufpreis zu uebernehmen waere eine Bewertung, die niemand
  -- vorgenommen hat.
  select kaufpreis into v from public.objekte where id = v_objekt;
  insert into erg values (10,'Preisvorstellung wird nicht zum Kaufpreis','leer',
    coalesce(v::text,'leer'), v is null);

  select beschreibung_sonstiges into v_txt from public.objekte where id = v_objekt;
  insert into erg values (11,'Preisvorstellung steht im internen Vermerk','enthalten',
    case when v_txt like '%Preisvorstellung des Eigentümers%' then 'enthalten' else v_txt end,
    v_txt like '%Preisvorstellung des Eigentümers%');

  select count(*) into v from public.aktivitaeten
   where objekt_id = v_objekt and typ='objekt_angelegt';
  insert into erg values (12,'Verlaufseintrag zum neuen Objekt','1',v::text,v=1);

  -- Sonst entstehen aus einem Termin zwei Objekte.
  begin
    perform public.aufnahme_uebernehmen(v_id);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (13,'Zweite Uebernahme wird abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  select status::text into v_txt from public.objektaufnahmen where id = v_id;
  insert into erg values (14,'Aufnahme ist als uebernommen gekennzeichnet','uebernommen',v_txt,v_txt='uebernommen');

  -- „Uebernommen" ohne Objekt waere eine Behauptung ohne Gegenstand.
  begin
    update public.objektaufnahmen set objekt_id = null where id = v_id;
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (15,'Uebernommen ohne Objekt wird abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
