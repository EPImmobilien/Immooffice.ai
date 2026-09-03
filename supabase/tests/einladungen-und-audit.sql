-- ===========================================================================
-- Nachweis: Einladungen (7 Tage, Protokoll), Audit-Log, Standorte,
-- Plattform-Admin, Support-Freigabe, Onboarding-Abschluss
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/einladungen-und-audit.sql
--              oder scripts/db-lokal.sh
--
-- Geprueft wird die WIRKUNG, nicht die Migration: Kann ein Makler einladen?
-- Kann eine fremde Adresse einloesen? Kommt man ueber ein fremdes Konto an
-- Einladungen oder Protokoll? Laesst sich das Protokoll aendern?
--
-- Der Token entsteht wie in der Anwendung ausserhalb der Datenbank (64
-- Hexzeichen) und wird nur als Hash gespeichert.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
-- Auch anon, weil die Einladungsseite ohne Anmeldung gelesen wird.
grant all on erg to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-1111111e1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inhaber@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-2222222e2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','makler@test.invalid','x',now(),now(),now()),
       ('33333333-3333-3333-3333-3333333e3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','neu@test.invalid','x',now(),now(),now()),
       ('44444444-4444-4444-4444-4444444e4444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremd@test.invalid','x',now(),now(),now()),
       ('55555555-5555-5555-5555-5555555e5555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chef-b@test.invalid','x',now(),now(),now());

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1','Mandant E','mandant-e1'),
  ('bbbbbbbb-0000-0000-0000-0000000000e2','Mandant B','mandant-e2');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-1111111e1111','aaaaaaaa-0000-0000-0000-0000000000e1','Inhaber','inhaber@test.invalid','inhaber'),
  ('22222222-2222-2222-2222-2222222e2222','aaaaaaaa-0000-0000-0000-0000000000e1','Makler','makler@test.invalid','makler'),
  ('55555555-5555-5555-5555-5555555e5555','bbbbbbbb-0000-0000-0000-0000000000e2','Chef B','chef-b@test.invalid','inhaber');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_uuid uuid; v_id uuid;
  v_token  text := 'a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2';
  v_token2 text := '0f0e0d0c0b0a09080706050403020100ffeeddccbbaa99887766554433221100';
  v_ts     timestamptz;
begin
  set local role authenticated;

  -- --- Makler darf nicht einladen -----------------------------------------
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';
  begin
    perform public.einladung_erstellen('neu@test.invalid', 'makler', '{}'::jsonb, v_token);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (1,'Makler kann nicht einladen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Inhaber laedt ein ---------------------------------------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';
  v_id := public.einladung_erstellen('Neu@Test.invalid', 'assistenz', '{}'::jsonb, v_token);
  insert into erg values (2,'Einladung angelegt','angelegt',case when v_id is null then 'nichts' else 'angelegt' end,v_id is not null);

  select gueltig_bis into v_ts from public.einladungen where id = v_id;
  insert into erg values (3,'Einladung gilt sieben Tage (R3), nicht vierzehn','<= 7 Tage',
    case when v_ts <= now() + interval '7 days 1 minute' then '<= 7 Tage' else '> 7 Tage' end,
    v_ts <= now() + interval '7 days 1 minute');

  select count(*) into v_n from public.einladungen where email='neu@test.invalid' and eingeloest_am is null;
  insert into erg values (4,'Adresse kleingeschrieben gespeichert','1',v_n::text,v_n=1);

  -- Der Klartext steht nirgends in der Tabelle.
  select count(*) into v_n from public.einladungen where token_hash = v_token;
  insert into erg values (5,'Klartext-Token wird nicht gespeichert','0',v_n::text,v_n=0);

  -- Zweite offene Einladung an dieselbe Adresse ist ausgeschlossen.
  begin
    perform public.einladung_erstellen('neu@test.invalid', 'makler', '{}'::jsonb, v_token2);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (6,'Keine zweite offene Einladung je Adresse','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Vorhandener Zugang kann nicht eingeladen werden.
  begin
    perform public.einladung_erstellen('makler@test.invalid', 'makler', '{}'::jsonb, v_token2);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (7,'Bestehender Zugang nicht einladbar','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Audit-Eintrag entstanden (per Trigger).
  select count(*) into v_n from public.audit_log
   where mandant_id='aaaaaaaa-0000-0000-0000-0000000000e1' and aktion='einladung_erstellt';
  insert into erg values (8,'Einladung im Audit-Log','1',v_n::text,v_n=1);

  -- --- Anonym: ansehen liefert nur das Noetigste ---------------------------
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  select zustand || '|' || unternehmen into v_txt from public.einladung_ansehen(v_token);
  insert into erg values (9,'Anonym sieht Zustand und Firmenname','ok|Mandant E',v_txt,v_txt='ok|Mandant E');
  select zustand into v_txt from public.einladung_ansehen('0000000000000000000000000000000000000000000000000000000000000000');
  insert into erg values (10,'Unbekannter Token: unbekannt','unbekannt',v_txt,v_txt='unbekannt');

  -- Konto ohne Mandant sieht die Tabelle nicht.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-4444444e4444","role":"authenticated"}';
  select count(*) into v_n from public.einladungen;
  insert into erg values (11,'Konto ohne Mandant sieht keine Einladungen','0',v_n::text,v_n=0);

  -- --- Fremde Adresse kann nicht einloesen --------------------------------
  begin
    perform public.einladung_einloesen(v_token, 'Eindringling');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (12,'Andere E-Mail kann Einladung nicht einloesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Richtige Adresse loest ein ------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333e3333","role":"authenticated"}';
  v_uuid := public.einladung_einloesen(v_token, 'Neue Kollegin');
  insert into erg values (13,'Einloesen liefert den Mandanten','aaaaaaaa-0000-0000-0000-0000000000e1',v_uuid::text,
    v_uuid='aaaaaaaa-0000-0000-0000-0000000000e1');
  select rolle::text into v_txt from public.benutzer where id='33333333-3333-3333-3333-3333333e3333';
  insert into erg values (14,'Benutzer mit Rolle der Einladung angelegt','assistenz',v_txt,v_txt='assistenz');

  begin
    perform public.einladung_einloesen(v_token, 'Nochmal');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (15,'Token ist nach dem Einloesen verbraucht','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  select zustand into v_txt from public.einladung_ansehen(v_token);
  insert into erg values (16,'Eingeloester Token meldet eingeloest','eingeloest',v_txt,v_txt='eingeloest');
  set local role authenticated;

  -- --- Widerruf einer offenen Einladung (per Update, Trigger protokolliert) --
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';
  v_id := public.einladung_erstellen('zweite@test.invalid', 'makler', '{}'::jsonb, v_token2);
  update public.einladungen set widerrufen_am = now() where id = v_id;
  select count(*) into v_n from public.audit_log where aktion='einladung_widerrufen' and ziel_id = v_id::text;
  insert into erg values (17,'Widerruf im Audit-Log','1',v_n::text,v_n=1);
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  select zustand into v_txt from public.einladung_ansehen(v_token2);
  insert into erg values (18,'Widerrufener Token meldet widerrufen','widerrufen',v_txt,v_txt='widerrufen');
  set local role authenticated;

  -- --- Mandant B sieht nichts von Mandant E ---------------------------------
  set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-5555555e5555","role":"authenticated"}';
  select count(*) into v_n from public.einladungen;
  insert into erg values (19,'Fremder Inhaber sieht keine Einladungen von E','0',v_n::text,v_n=0);
  select count(*) into v_n from public.audit_log;
  insert into erg values (20,'Fremder Inhaber sieht kein Audit-Log von E','0',v_n::text,v_n=0);

  -- --- Audit-Log ist unveraenderbar ----------------------------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';
  select count(*) into v_n from public.audit_log;
  insert into erg values (21,'Inhaber sieht das eigene Audit-Log','>=3',v_n::text,v_n>=3);
  begin
    delete from public.audit_log where mandant_id='aaaaaaaa-0000-0000-0000-0000000000e1';
    get diagnostics v_n = row_count;
    v_fehler := case when v_n = 0 then 'abgewiesen' else 'DURCHGEKOMMEN' end;
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (22,'Audit-Log nicht loeschbar','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.audit_log (mandant_id, aktion) values ('aaaaaaaa-0000-0000-0000-0000000000e1','direkt');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (23,'Audit-Log nicht direkt beschreibbar','abgewiesen',v_fehler,v_fehler='abgewiesen');
  perform public.audit_schreiben('test_eintrag','pruefung','1','{"a":1}'::jsonb);
  select count(*) into v_n from public.audit_log where aktion='test_eintrag';
  insert into erg values (24,'audit_schreiben() schreibt fuer den eigenen Mandanten','1',v_n::text,v_n=1);

  update public.benutzer set rolle='marketing' where id='33333333-3333-3333-3333-3333333e3333';
  select count(*) into v_n from public.audit_log where aktion='rolle_geaendert' and ziel_id='33333333-3333-3333-3333-3333333e3333';
  insert into erg values (25,'Rollenaenderung im Audit-Log','1',v_n::text,v_n=1);

  -- --- Standorte: Makler liest, Verwaltung schreibt, ein Hauptsitz ---------
  insert into public.standorte (mandant_id, bezeichnung, plz, ist_hauptsitz)
  values ('aaaaaaaa-0000-0000-0000-0000000000e1','Zentrale','24103',true);
  begin
    insert into public.standorte (mandant_id, bezeichnung, ist_hauptsitz)
    values ('aaaaaaaa-0000-0000-0000-0000000000e1','Zweiter Hauptsitz',true);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (26,'Nur ein Hauptsitz je Mandant','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.standorte (mandant_id, bezeichnung, plz) values ('aaaaaaaa-0000-0000-0000-0000000000e1','Falsch','1234');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (27,'PLZ muss fuenfstellig sein','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';
  select count(*) into v_n from public.standorte;
  insert into erg values (28,'Makler sieht Standorte','1',v_n::text,v_n=1);
  begin
    insert into public.standorte (mandant_id, bezeichnung) values ('aaaaaaaa-0000-0000-0000-0000000000e1','Filiale');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (29,'Makler legt keine Standorte an','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Plattform-Admins: fuer Benutzer unsichtbar --------------------------
  select count(*) into v_n from public.plattform_admins;
  insert into erg values (30,'plattform_admins fuer Benutzer leer','0',v_n::text,v_n=0);

  -- --- Support-Freigabe nur durch Inhaber ----------------------------------
  begin
    perform public.support_zugriff_gewaehren();
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (31,'Makler kann keinen Support-Zugriff gewaehren','abgewiesen',v_fehler,v_fehler='abgewiesen');
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';
  v_uuid := public.support_zugriff_gewaehren();
  select count(*) into v_n from public.support_freigaben where widerrufen_am is null and gueltig_bis > now();
  insert into erg values (32,'Inhaber gewaehrt 24 h Support-Zugriff','1',v_n::text,v_n=1);
  select public.support_zugriff_widerrufen() into v_n;
  insert into erg values (33,'Inhaber widerruft','1',v_n::text,v_n=1);

  -- --- Onboarding: Abschluss verlangt Pflichtangaben -----------------------
  begin
    perform public.onboarding_fortschritt(8::smallint, true);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (34,'Abschluss ohne Pflichtangaben abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  insert into public.mandant_branding (mandant_id, firmenname, strasse, plz, ort, email)
  values ('aaaaaaaa-0000-0000-0000-0000000000e1','Mandant E GmbH','Weg','24103','Kiel','info@test.invalid')
  on conflict (mandant_id) do update set firmenname=excluded.firmenname, strasse=excluded.strasse,
    plz=excluded.plz, ort=excluded.ort, email=excluded.email;
  perform public.onboarding_fortschritt(8::smallint, true);
  select onboarding_abgeschlossen::text into v_txt from public.mandanten where id='aaaaaaaa-0000-0000-0000-0000000000e1';
  insert into erg values (35,'Abschluss mit Pflichtangaben','true',v_txt,v_txt='true');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
