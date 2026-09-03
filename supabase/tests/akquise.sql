-- ===========================================================================
-- Nachweis: Akquise — Standard-Stammdaten, Leads mit Stufen/Status,
-- Verlustgrund-Pflicht, Historie, Automationen und Laeufe, Verweise,
-- Verwaltungsrechte, Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111a1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefa@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222a2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maklera@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333a3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremda@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Mandant AA', 'mandant-aa'),
  ('bbbbbbbb-0000-0000-0000-0000000000a2', 'Mandant AB', 'mandant-ab');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111a1111', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Chefin', 'chefa@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222a2222', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Makler', 'maklera@test.invalid', 'makler'),
  ('33333333-3333-3333-3333-3333333a3333', 'bbbbbbbb-0000-0000-0000-0000000000a2', 'Fremd', 'fremda@test.invalid', 'inhaber');
insert into public.kontakte (id, mandant_id, anrede, vorname, nachname, email) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Frau', 'Erika', 'Eigentümerin', 'erika@test.invalid'),
  ('dddddddd-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a2', 'Herr', 'Fremd', 'Kontakt', 'fremd@test.invalid');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung, status) values
  ('cccccccc-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a2', 'A-2', 'Fremdes Haus', 'aktiv');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_p uuid; v_neu uuid; v_gew uuid; v_verl uuid; v_lead uuid; v_q uuid; v_v uuid; v_a uuid; v_p2 uuid; v_s2 uuid;
begin
  -- --- Makler: Standard anlegen, Lead anlegen -----------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  select public.akquise_standard_anlegen() into v_p;
  select count(*) into v_n from public.akquise_stufen where pipeline_id = v_p;
  insert into erg values (1,'Standard-Pipeline mit sechs Stufen','6',v_n::text,v_n=6);
  select public.akquise_standard_anlegen() into v_p2;
  insert into erg values (2,'Zweiter Aufruf legt nichts doppelt an','gleich',case when v_p2 = v_p then 'gleich' else 'anders' end,v_p2=v_p);
  select count(*) into v_n from public.akquise_quellen;
  insert into erg values (3,'Standardquellen vorhanden','6',v_n::text,v_n=6);
  select id into v_neu from public.akquise_stufen where pipeline_id = v_p and sortierung = 1;
  select id into v_gew from public.akquise_stufen where pipeline_id = v_p and ist_gewonnen;
  select id into v_verl from public.akquise_stufen where pipeline_id = v_p and ist_verloren;
  select id into v_q from public.akquise_quellen where name = 'Empfehlung';
  insert into public.akquise_leads (mandant_id, titel, strasse, plz, ort, kontakt_id, pipeline_id, stufe_id, quelle_id, zustaendig_id, erstellt_von)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Haus Musterweg 1', 'Musterweg 1', '60311', 'Frankfurt', 'dddddddd-0000-0000-0000-0000000000a1', v_p, v_neu, v_q, '22222222-2222-2222-2222-2222222a2222', '22222222-2222-2222-2222-2222222a2222')
    returning id into v_lead;
  select status || '/' || coalesce(nachfassen_am::text, 'null') into v_txt from public.akquise_leads where id = v_lead;
  insert into erg values (4,'Neuer Lead ist offen mit Nachfasstermin','offen/'||(current_date+7)::text,v_txt,v_txt='offen/'||(current_date+7)::text);
  select count(*) into v_n from public.akquise_lead_historie where lead_id = v_lead and feld = 'angelegt';
  insert into erg values (5,'Historie: angelegt','1',v_n::text,v_n=1);

  -- Verlorene Stufe ohne Grund
  begin
    update public.akquise_leads set stufe_id = v_verl where id = v_lead;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (6,'Verloren ohne Verlustgrund abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.akquise_leads set stufe_id = v_verl, verlustgrund = 'Privat verkauft' where id = v_lead;
  select status || '/' || (verloren_am is not null)::text || '/' || coalesce(nachfassen_am::text,'null') into v_txt from public.akquise_leads where id = v_lead;
  insert into erg values (7,'Verloren mit Grund: Status, Zeit, kein Nachfassen','verloren/true/null',v_txt,v_txt='verloren/true/null');
  update public.akquise_leads set stufe_id = v_gew where id = v_lead;
  select status || '/' || (gewonnen_am is not null)::text || '/' || coalesce(verlustgrund,'null') into v_txt from public.akquise_leads where id = v_lead;
  insert into erg values (8,'Gewonnen: Status, Zeit, Verlustgrund geloescht','gewonnen/true/null',v_txt,v_txt='gewonnen/true/null');
  select count(*) into v_n from public.akquise_lead_historie where lead_id = v_lead and feld = 'stufe';
  insert into erg values (9,'Historie: zwei Stufenwechsel','2',v_n::text,v_n=2);
  update public.akquise_leads set stufe_id = v_neu where id = v_lead;

  -- Stufe einer fremden Pipeline / fremdes Objekt / fremder Kontakt
  begin
    insert into public.akquise_leads (mandant_id, titel, pipeline_id, stufe_id, objekt_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Fremd', v_p, v_neu, 'cccccccc-0000-0000-0000-0000000000a2');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (10,'Lead mit fremdem Objekt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.akquise_leads (mandant_id, titel, pipeline_id, stufe_id, kontakt_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Fremd', v_p, v_neu, 'dddddddd-0000-0000-0000-0000000000a2');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (11,'Lead mit fremdem Kontakt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Makler darf keine Pipeline anlegen (Verwaltung)
  begin
    insert into public.akquise_pipelines (mandant_id, name) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Zweite');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (12,'Makler kann keine Pipeline anlegen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  -- Makler darf Kampagne und Radar anlegen
  insert into public.akquise_kampagnen (mandant_id, name, art, budget, ausgaben, beginn, ende) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Postwurf Frühjahr', 'offline', 1500, 900, current_date - 30, current_date + 30);
  insert into public.akquise_radar (mandant_id, titel, strasse, plz, ort, preis, anbieter_typ, quelle) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'EFH von privat', 'Feldweg 3', '60311', 'Frankfurt', 450000, 'privat', 'Inserat');
  select count(*) into v_n from public.akquise_kampagnen; insert into erg values (13,'Kampagne angelegt','1',v_n::text,v_n=1);

  -- --- Verwaltung: Automation anlegen, Lauf wird geplant ------------------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  insert into public.akquise_pipelines (mandant_id, name) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Kapitalanleger') returning id into v_p2;
  insert into public.akquise_stufen (mandant_id, pipeline_id, name, sortierung, wahrscheinlichkeit) values ('aaaaaaaa-0000-0000-0000-0000000000a1', v_p2, 'Neu', 1, 10) returning id into v_s2;
  begin
    insert into public.akquise_automationen (mandant_id, pipeline_id, stufe_id, kanal) values ('aaaaaaaa-0000-0000-0000-0000000000a1', v_p, v_s2, 'mail');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (14,'Automation mit Stufe fremder Pipeline abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  select id into v_v from public.akquise_vorlagen where name = 'Aufgabe: Nachfassen';
  insert into public.akquise_automationen (mandant_id, name, pipeline_id, stufe_id, quelle_id, kanal, vorlage_id, verzoegerung_stunden)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Erstkontakt Aufgabe', v_p, v_neu, v_q, 'aufgabe', v_v, 0) returning id into v_a;
  insert into public.akquise_automationen (mandant_id, name, pipeline_id, stufe_id, kanal, vorlage_id, verzoegerung_stunden)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Mail Eingang', v_p, v_neu, 'mail', (select id from public.akquise_vorlagen where kanal = 'mail' limit 1), 48);
  -- Neuer Lead in Stufe 1 mit Quelle Empfehlung → beide Automationen planen
  insert into public.akquise_leads (mandant_id, titel, kontakt_id, pipeline_id, stufe_id, quelle_id, zustaendig_id)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Wohnung Ringstraße 9', 'dddddddd-0000-0000-0000-0000000000a1', v_p, v_neu, v_q, '22222222-2222-2222-2222-2222222a2222') returning id into v_lead;
  select count(*) into v_n from public.akquise_laeufe where lead_id = v_lead and status = 'geplant';
  insert into erg values (15,'Zwei Laeufe geplant','2',v_n::text,v_n=2);
  select count(*) into v_n from public.akquise_laeufe where lead_id = v_lead and status = 'geplant' and geplant_am > now() + interval '47 hours';
  insert into erg values (16,'Verzoegerung 48 h beruecksichtigt','1',v_n::text,v_n=1);
  -- Lead ohne Quelle → nur die quellenunabhaengige Automation
  insert into public.akquise_leads (mandant_id, titel, pipeline_id, stufe_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Ohne Quelle', v_p, v_neu) returning id into v_neu;
  select count(*) into v_n from public.akquise_laeufe where lead_id = v_neu;
  insert into erg values (17,'Quellenfilter der Automation greift','1',v_n::text,v_n=1);

  -- --- Arbeiter fuehrt faellige Laeufe aus ----------------------------------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select public.akquise_laeufe_ausfuehren() into v_n;
  insert into erg values (18,'Ein faelliger Lauf ausgefuehrt (48-h-Lauf wartet)','1',v_n::text,v_n=1);
  select count(*) into v_n from public.akquise_aktivitaeten where lead_id = v_lead and typ = 'aufgabe' and aufgabe_id is not null;
  insert into erg values (19,'Aktivitaet mit echter Aufgabe entstanden','1',v_n::text,v_n=1);
  select titel into v_txt from public.aufgaben where kontakt_id = 'dddddddd-0000-0000-0000-0000000000a1' limit 1;
  insert into erg values (20,'Platzhalter in der Aufgabe ersetzt','Nachfassen Frau Erika Eigentümerin',v_txt,v_txt='Nachfassen Frau Erika Eigentümerin');
  select status into v_txt from public.akquise_laeufe where lead_id = v_lead and automation_id = v_a;
  insert into erg values (21,'Lauf erledigt','erledigt',v_txt,v_txt='erledigt');
  update public.akquise_laeufe set geplant_am = now() - interval '1 minute' where lead_id = v_lead and status = 'geplant';
  select public.akquise_laeufe_ausfuehren() into v_n;
  select count(*) into v_n from public.akquise_aktivitaeten where lead_id = v_lead and typ = 'mail' and text like 'Sehr geehrte Frau Eigentümerin%';
  insert into erg values (22,'Mail-Entwurf mit Anrede aus Kontakt','1',v_n::text,v_n=1);
  -- Stufenwechsel bricht geplante Laeufe ab
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  insert into public.akquise_leads (mandant_id, titel, pipeline_id, stufe_id, quelle_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Wechsler', v_p, (select id from public.akquise_stufen where pipeline_id = v_p and sortierung = 1), v_q) returning id into v_neu;
  update public.akquise_leads set stufe_id = (select id from public.akquise_stufen where pipeline_id = v_p and sortierung = 2) where id = v_neu;
  select count(*) into v_n from public.akquise_laeufe where lead_id = v_neu and status = 'abgebrochen';
  insert into erg values (23,'Stufenwechsel bricht geplante Laeufe ab','2',v_n::text,v_n=2);

  -- --- Mandantentrennung ---------------------------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333a3333","role":"authenticated"}';
  select count(*) into v_n from public.akquise_leads; insert into erg values (24,'Fremder Mandant sieht keine Leads','0',v_n::text,v_n=0);
  select count(*) into v_n from public.akquise_pipelines; insert into erg values (25,'Fremder Mandant sieht keine Pipelines','0',v_n::text,v_n=0);
  select count(*) into v_n from public.akquise_laeufe; insert into erg values (26,'Fremder Mandant sieht keine Laeufe','0',v_n::text,v_n=0);
  select count(*) into v_n from public.akquise_radar; insert into erg values (27,'Fremder Mandant sieht kein Radar','0',v_n::text,v_n=0);
  begin
    insert into public.akquise_leads (mandant_id, titel, pipeline_id, stufe_id) values ('bbbbbbbb-0000-0000-0000-0000000000a2', 'Einbruch', v_p, (select id from public.akquise_stufen where pipeline_id = v_p limit 1));
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (28,'Fremder Mandant kann fremde Pipeline nicht nutzen','abgewiesen',v_fehler,v_fehler='abgewiesen');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
