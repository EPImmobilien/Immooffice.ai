-- ===========================================================================
-- Nachweis der Web-Expose-Regeln (Master-Prompt Abschnitt 8 und 16)
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/web-expose.sql
--
-- Fachlicher Kern: Ein oeffentlicher Verweis darf genau das preisgeben, was
-- freigegeben wurde — und keinen Zugang zum Bestand oeffnen. Widerruf und
-- Ablauf wirken sofort, ein Passwortschutz laesst sich nicht umgehen, und die
-- Aufrufstatistik kommt ohne Personenbezug aus.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now(),now());
insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Mandant A','mandant-a');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Nutzer A','a@test.invalid','inhaber');
insert into public.objekte (id,mandant_id,bezeichnung,titel,vermarktungsart,objektkategorie,status,ort,kaufpreis) values
  ('c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Objekt A','Helle Wohnung','kauf','wohnung','aktiv','Kiel',300000),
  ('c0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Objekt B','Reihenhaus','kauf','haus','aktiv','Kiel',400000);

insert into public.web_expose (id,mandant_id,objekt_id,token,passwort_hash,kontaktformular) values
  ('e0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001','offen00000000000001', null, true),
  ('e0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002','geheim0000000000002',
   extensions.crypt('sesam', extensions.gen_salt('bf')), false);

do $$
declare v int; j jsonb;
begin
  -- `anon` ist die Rolle nicht angemeldeter Besucher.
  set local role anon;

  j := public.web_expose_oeffnen('offen00000000000001');
  insert into erg values (1,'Offenes Expose liefert Daten','ok',j->>'zustand',j->>'zustand'='ok');
  insert into erg values (2,'Titel enthalten','Helle Wohnung',j->'objekt'->>'titel',j->'objekt'->>'titel'='Helle Wohnung');
  insert into erg values (3,'Mandantenzuordnung nicht enthalten','nein',
    case when j->'objekt' ? 'mandant_id' then 'ja' else 'nein' end,
    not (j->'objekt' ? 'mandant_id'));

  j := public.web_expose_oeffnen('geheim0000000000002');
  insert into erg values (4,'Ohne Passwort keine Daten','passwort',j->>'zustand',j->>'zustand'='passwort');
  insert into erg values (5,'Ohne Passwort kein Objekt','nein',
    case when j ? 'objekt' then 'ja' else 'nein' end, not (j ? 'objekt'));

  j := public.web_expose_oeffnen('geheim0000000000002','falsch');
  insert into erg values (6,'Falsches Passwort abgewiesen','passwort',j->>'zustand',j->>'zustand'='passwort');

  j := public.web_expose_oeffnen('geheim0000000000002','sesam');
  insert into erg values (7,'Richtiges Passwort oeffnet','ok',j->>'zustand',j->>'zustand'='ok');

  j := public.web_expose_oeffnen('gibtesnicht000000001');
  insert into erg values (8,'Unbekannter Token','unbekannt',j->>'zustand',j->>'zustand'='unbekannt');

  -- Gezaehlt werden nur Aufrufe, die tatsaechlich Inhalte gezeigt haben.
  -- Ein abgewiesener Passwortversuch ist kein Aufruf.
  reset role;
  select sum(aufrufe) into v from public.web_expose_aufruf;
  insert into erg values (9,'Nur erfolgreiche Aufrufe gezaehlt','2',v::text,v=2);

  set local role anon;
  -- Kern der Absicherung: Der Verweis oeffnet keine Tuer zum Bestand.
  select count(*) into v from public.web_expose;
  insert into erg values (10,'Tabelle web_expose fuer Besucher leer','0',v::text,v=0);
  select count(*) into v from public.objekte;
  insert into erg values (11,'Tabelle objekte fuer Besucher leer','0',v::text,v=0);

  j := public.web_expose_anfrage_senden('offen00000000000001',null,'Frau Petersen','p@test.invalid',null,'Bitte um Termin');
  insert into erg values (12,'Anfrage angenommen','true',j->>'ok',j->>'ok'='true');

  j := public.web_expose_anfrage_senden('offen00000000000001',null,'Ohne Mail','keine-mail',null,null);
  insert into erg values (13,'Ungueltige E-Mail abgewiesen','eingabe',j->>'grund',j->>'grund'='eingabe');

  j := public.web_expose_anfrage_senden('geheim0000000000002','sesam','X','x@test.invalid',null,null);
  insert into erg values (14,'Ohne Formular keine Anfrage','kein_formular',j->>'grund',j->>'grund'='kein_formular');

  reset role;
  update public.web_expose set widerrufen_am = now() where token='offen00000000000001';
  set local role anon;
  j := public.web_expose_oeffnen('offen00000000000001');
  insert into erg values (15,'Widerruf sperrt sofort','widerrufen',j->>'zustand',j->>'zustand'='widerrufen');
  j := public.web_expose_anfrage_senden('offen00000000000001',null,'Y','y@test.invalid',null,null);
  insert into erg values (16,'Widerrufenes Expose nimmt keine Anfragen','widerrufen',j->>'zustand',j->>'zustand'='widerrufen');

  reset role;
  update public.web_expose set widerrufen_am = null, ablauf_am = now() - interval '1 hour'
   where token='offen00000000000001';
  set local role anon;
  j := public.web_expose_oeffnen('offen00000000000001');
  insert into erg values (17,'Abgelaufenes Expose sperrt','abgelaufen',j->>'zustand',j->>'zustand'='abgelaufen');

  reset role;
  select count(*) into v from public.web_expose_anfrage;
  insert into erg values (18,'Genau eine Anfrage gespeichert','1',v::text,v=1);

  -- Der PDF-Download braucht dieselbe Pruefung, ist aber kein Seitenaufruf.
  -- Wuerde er mitzaehlen, stuende in der Statistik das Doppelte.
  set local role anon;
  j := public.web_expose_oeffnen('geheim0000000000002','sesam',false);
  insert into erg values (19,'Download oeffnet ohne zu zaehlen','ok',j->>'zustand',j->>'zustand'='ok');
  reset role;
  select sum(aufrufe) into v from public.web_expose_aufruf;
  insert into erg values (20,'Zaehlerstand unveraendert','2',v::text,v=2);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
