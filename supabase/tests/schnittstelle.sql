-- ===========================================================================
-- Nachweis: Eigene Schnittstelle — Schluessel (Hash unsichtbar, Rechte,
-- Widerruf, Lesemodus), Ratenbegrenzung, Rueckrufe (Einreihen je Ziel und
-- Mandant, Beanspruchen, Wiederholung, Endzustand)
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111d1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chef@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222d2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','makler@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333d3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremd@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'Mandant SA', 'mandant-sa'),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'Mandant SB', 'mandant-sb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111d1111', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Chefin', 'chef@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222d2222', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Makler', 'makler@test.invalid', 'makler'),
  ('33333333-3333-3333-3333-3333333d3333', 'bbbbbbbb-0000-0000-0000-0000000000d2', 'Fremd', 'fremd@test.invalid', 'inhaber');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_id uuid; v_ziel uuid; v_ziel_b uuid; v_r record;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000d1';
  c_m2 constant uuid := 'bbbbbbbb-0000-0000-0000-0000000000d2';
  c_hash constant text := repeat('a', 64);
begin
  -- --- Schluessel: Verwaltung legt an, Hash bleibt unsichtbar -----------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111d1111","role":"authenticated"}';
  insert into public.api_schluessel (mandant_id, bezeichnung, praefix, hash, rechte, erstellt_von)
  values (c_m1, 'Portal-Anbindung', 'io_aaaaaaaa', c_hash, '{"objekte":"schreiben","kontakte":"lesen","termine":"keine"}'::jsonb, '11111111-1111-1111-1111-1111111d1111')
  returning id into v_id;
  insert into erg values (1,'Verwaltung legt einen Schluessel an','angelegt','angelegt',true);
  begin
    select hash into v_txt from public.api_schluessel where id = v_id;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (2,'Der Hash ist fuer Benutzer nicht lesbar','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.api_schluessel (mandant_id, bezeichnung, praefix, hash, rechte)
    values (c_m1, 'Kaputt', 'io_x', repeat('b', 64), '{"objekte":"alles"}'::jsonb);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (3,'Unbekannte Rechte werden abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222d2222","role":"authenticated"}';
  select count(*) into v_n from public.api_schluessel;
  insert into erg values (4,'Makler sieht keine Schluessel','0',v_n::text,v_n=0);
  begin
    insert into public.api_schluessel (mandant_id, bezeichnung, praefix, hash) values (c_m1, 'Makler', 'io_m', repeat('c', 64));
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (5,'Makler kann keinen Schluessel anlegen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333d3333","role":"authenticated"}';
  select count(*) into v_n from public.api_schluessel;
  insert into erg values (6,'Fremder Mandant sieht keine Schluessel','0',v_n::text,v_n=0);
  begin
    perform public.api_schluessel_pruefen(c_hash);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (7,'Schluesselpruefung nur fuer die Dienstrolle','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Dienstrolle: Pruefung, Ratenbegrenzung, Widerruf, Lesemodus ------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select mandant_id::text || '/' || (rechte->>'objekte') || '/' || ratenlimit::text || '/' || schreibbar::text into v_txt
    from public.api_schluessel_pruefen(c_hash);
  insert into erg values (8,'Pruefung liefert Mandant, Rechte, Limit, Schreibbarkeit', c_m1::text || '/schreiben/600/true', v_txt, v_txt = c_m1::text || '/schreiben/600/true');
  select count(*) into v_n from public.api_schluessel_pruefen(repeat('z', 64));
  insert into erg values (9,'Unbekannter Hash: kein Treffer','0',v_n::text,v_n=0);
  select public.api_aufruf_zaehlen(v_id) into v_n;
  select public.api_aufruf_zaehlen(v_id) into v_n;
  insert into erg values (10,'Aufrufe werden je Minute gezaehlt','2',v_n::text,v_n=2);
  select (zuletzt_verwendet_am is not null)::text into v_txt from public.api_schluessel where id = v_id;
  insert into erg values (11,'Letzte Verwendung wird vermerkt','true',v_txt,v_txt='true');

  update public.mandanten set abo_status = 'test', testphase_bis = now() - interval '1 day' where id = c_m1;
  select schreibbar::text into v_txt from public.api_schluessel_pruefen(c_hash);
  insert into erg values (12,'Lesemodus: Schluessel bleibt gueltig, aber nicht schreibbar','false',v_txt,v_txt='false');
  update public.mandanten set abo_status = 'aktiv' where id = c_m1;

  update public.api_schluessel set widerrufen_am = now() where id = v_id;
  select count(*) into v_n from public.api_schluessel_pruefen(c_hash);
  insert into erg values (13,'Widerrufener Schluessel: kein Treffer','0',v_n::text,v_n=0);
  update public.api_schluessel set widerrufen_am = null where id = v_id;

  -- --- Rueckrufe: Ziele je Mandant, Einreihen nur fuer abonnierte Ereignisse ----------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111d1111","role":"authenticated"}';
  insert into public.rueckruf_ziele (mandant_id, bezeichnung, url, geheimnis_verschluesselt, ereignisse)
  values (c_m1, 'CRM', 'https://ziel.invalid/hook', 'v1.a.b.c', array['objekt.angelegt', 'termin.angelegt']) returning id into v_ziel;
  begin
    insert into public.rueckruf_ziele (mandant_id, bezeichnung, url, geheimnis_verschluesselt, ereignisse)
    values (c_m1, 'Unsicher', 'http://ziel.invalid/hook', 'v1.a.b.c', array['objekt.angelegt']);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (14,'Rueckrufziele nur mit https','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.rueckruf_ziele (mandant_id, bezeichnung, url, geheimnis_verschluesselt, ereignisse)
    values (c_m1, 'Falsch', 'https://ziel.invalid/hook', 'v1.a.b.c', array['objekt.geloescht']);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (15,'Unbekannte Ereignisse werden abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    select geheimnis_verschluesselt into v_txt from public.rueckruf_ziele where id = v_ziel;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (16,'Das Geheimnis eines Ziels ist nicht lesbar','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333d3333","role":"authenticated"}';
  insert into public.rueckruf_ziele (mandant_id, bezeichnung, url, geheimnis_verschluesselt, ereignisse)
  values (c_m2, 'Fremd', 'https://fremd.invalid/hook', 'v1.a.b.c', array['objekt.angelegt', 'kontakt.angelegt']) returning id into v_ziel_b;

  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111d1111","role":"authenticated"}';
  insert into public.objekte (mandant_id, bezeichnung) values (c_m1, 'Neues Objekt');
  insert into public.kontakte (mandant_id, nachname) values (c_m1, 'Neuer Kontakt');
  select count(*) into v_n from public.rueckrufe where ziel_id = v_ziel;
  insert into erg values (17,'Objekt loest Rueckruf aus, Kontakt (nicht abonniert) nicht','1',v_n::text,v_n=1);
  select ereignis || '/' || (nutzlast->>'bezeichnung') into v_txt from public.rueckrufe where ziel_id = v_ziel;
  insert into erg values (18,'Nutzlast traegt Ereignis und Kennung','objekt.angelegt/Neues Objekt',v_txt,v_txt='objekt.angelegt/Neues Objekt');
  select count(*) into v_n from public.rueckrufe;
  insert into erg values (19,'Rueckrufe fremder Mandanten bleiben unsichtbar','1',v_n::text,v_n=1);

  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select count(*) into v_n from public.rueckrufe where ziel_id = v_ziel_b;
  insert into erg values (20,'Das Ziel des fremden Mandanten bekommt nichts','0',v_n::text,v_n=0);

  -- --- Beanspruchen, Wiederholung, Endzustand ------------------------------------------
  select count(*) into v_n from public.rueckrufe_beanspruchen(10);
  insert into erg values (21,'Faelliger Rueckruf wird beansprucht','1',v_n::text,v_n=1);
  select count(*) into v_n from public.rueckrufe_beanspruchen(10);
  insert into erg values (22,'Beanspruchter Rueckruf ist fuenf Minuten geliehen','0',v_n::text,v_n=0);
  select id into v_id from public.rueckrufe where ziel_id = v_ziel;
  perform public.rueckruf_ergebnis(v_id, false, 503, 'Ziel nicht erreichbar');
  select status || '/' || versuche::text || '/' || (naechster_versuch_am > now() + interval '1 minute')::text into v_txt from public.rueckrufe where id = v_id;
  insert into erg values (23,'Fehlschlag: offen, Versuch 1, Wiederholung spaeter','offen/1/true',v_txt,v_txt='offen/1/true');
  select fehler_zaehler::text into v_txt from public.rueckruf_ziele where id = v_ziel;
  insert into erg values (24,'Ziel zaehlt den Fehler','1',v_txt,v_txt='1');
  update public.rueckrufe set versuche = 8 where id = v_id;
  perform public.rueckruf_ergebnis(v_id, false, 500, 'Dauerhaft');
  select status into v_txt from public.rueckrufe where id = v_id;
  insert into erg values (25,'Nach acht Versuchen endgueltig gescheitert','fehler',v_txt,v_txt='fehler');
  update public.rueckrufe set status = 'offen', versuche = 0 where id = v_id;
  perform public.rueckruf_ergebnis(v_id, true, 200, null);
  select status || '/' || (zugestellt_am is not null)::text into v_txt from public.rueckrufe where id = v_id;
  insert into erg values (26,'Erfolg: zugestellt mit Zeitpunkt','zugestellt/true',v_txt,v_txt='zugestellt/true');
  select fehler_zaehler::text into v_txt from public.rueckruf_ziele where id = v_ziel;
  insert into erg values (27,'Erfolg setzt den Fehlerzaehler des Ziels zurueck','0',v_txt,v_txt='0');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
