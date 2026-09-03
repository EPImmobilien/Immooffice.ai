-- ===========================================================================
-- Nachweis: Haertung — Volltextsuche unter RLS, Missbrauchsschutz bei der
-- Registrierung, Plattform-Einstellungen, Waechter-Befund
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to anon, authenticated, service_role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111c1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333c3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'Mandant HA', 'mandant-ha'),
  ('bbbbbbbb-0000-0000-0000-0000000000c2', 'Mandant HB', 'mandant-hb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111c1111', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'A', 'a@test.invalid', 'inhaber'),
  ('33333333-3333-3333-3333-3333333c3333', 'bbbbbbbb-0000-0000-0000-0000000000c2', 'C', 'c@test.invalid', 'inhaber');
insert into public.postfaecher (id, mandant_id, benutzer_id, anbieter, adresse, status) values
  ('aaaaaaaa-5555-5555-5555-5555555c5555', 'aaaaaaaa-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-1111111c1111', 'imap', 'a@test.invalid', 'aktiv');
insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, betreff, text, gesendet_am, gelesen) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-5555-5555-5555-5555555c5555', 'u1', 'kunde@test.invalid', 'Besichtigung Musterweg', 'Wann koennen wir die Wohnung besichtigen?', now() - interval '1 day', false),
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-5555-5555-5555-5555555c5555', 'u2', 'jemand@test.invalid', 'Newsletter', 'Angebote der Woche', now() - interval '2 days', true);

do $$
declare
  v_fehler text; v_txt text; v_n int; v_json jsonb;
begin
  -- --- Volltextsuche unter RLS -------------------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111c1111","role":"authenticated"}';
  select count(*) into v_n from public.nachrichten_suchen('Besichtigung');
  insert into erg values (1,'Suche findet die Nachricht ueber den Betreff','1',v_n::text,v_n=1);
  select count(*) into v_n from public.nachrichten_suchen('besichtigen wohnung');
  insert into erg values (2,'Suche stemmt Wortformen (german)','1',v_n::text,v_n=1);
  select count(*) into v_n from public.nachrichten_suchen('kunde@test.invalid');
  insert into erg values (3,'Suche findet die Absenderadresse','1',v_n::text,v_n=1);
  select count(*) into v_n from public.nachrichten_suchen('');
  insert into erg values (4,'Leere Suche liefert alle sichtbaren Nachrichten','2',v_n::text,v_n=2);
  select count(*) into v_n from public.nachrichten_suchen('', null, true);
  insert into erg values (5,'Filter „nur ungelesene“ wirkt','1',v_n::text,v_n=1);
  select count(*) into v_n from public.nachrichten_suchen('Angebote', 'aaaaaaaa-5555-5555-5555-5555555c5555');
  insert into erg values (6,'Filter nach Postfach wirkt','1',v_n::text,v_n=1);

  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333c3333","role":"authenticated"}';
  select count(*) into v_n from public.nachrichten_suchen('Besichtigung');
  insert into erg values (7,'Fremder Mandant findet nichts (RLS gilt in der Suche)','0',v_n::text,v_n=0);

  -- --- Plattform-Einstellungen sind fuer Benutzer unsichtbar --------------------
  select count(*) into v_n from public.plattform_einstellungen;
  insert into erg values (8,'Plattform-Einstellungen fuer Benutzer unsichtbar','0',v_n::text,v_n=0);
  begin
    perform public.waechter_befund();
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (9,'Waechter-Befund nur fuer die Dienstrolle','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Missbrauchsschutz (als anon, wie auf der Registrierungsseite) ---------------
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  select public.registrierung_pruefen('jemand@mailinator.com', 'ip-a') into v_txt;
  insert into erg values (10,'Wegwerfadresse wird abgewiesen','wegwerfadresse',v_txt,v_txt='wegwerfadresse');
  select public.registrierung_pruefen('jemand@post.mailinator.com', 'ip-a') into v_txt;
  insert into erg values (11,'Auch Unterdomains der Sperrliste','wegwerfadresse',v_txt,v_txt='wegwerfadresse');
  select public.registrierung_pruefen('kaputt', 'ip-a') into v_txt;
  insert into erg values (12,'Ungueltige Adresse','ungueltig',v_txt,v_txt='ungueltig');
  select public.registrierung_pruefen('neu@firma.invalid', 'ip-a') into v_txt;
  insert into erg values (13,'Erster Versuch erlaubt','ok',v_txt,v_txt='ok');
  perform public.registrierung_pruefen('neu@firma.invalid', 'ip-a');
  perform public.registrierung_pruefen('neu@firma.invalid', 'ip-a');
  select public.registrierung_pruefen('neu@firma.invalid', 'ip-a') into v_txt;
  insert into erg values (14,'Vierter Versuch derselben Adresse in einer Stunde: zu viele','zu_viele',v_txt,v_txt='zu_viele');
  select public.registrierung_pruefen('andere@firma.invalid', 'ip-a') into v_txt;
  insert into erg values (15,'Andere Adresse, gleiche IP: noch erlaubt (3 von 5)','ok',v_txt,v_txt='ok');
  perform public.registrierung_pruefen('dritte@firma.invalid', 'ip-a');
  select public.registrierung_pruefen('fuenfte@firma.invalid', 'ip-a') into v_txt;
  insert into erg values (16,'Sechster Versuch derselben IP: zu viele','zu_viele',v_txt,v_txt='zu_viele');
  select public.registrierung_pruefen('fuenfte@firma.invalid', 'ip-b') into v_txt;
  insert into erg values (17,'Andere IP: erlaubt','ok',v_txt,v_txt='ok');

  -- Limits kommen aus den Plattform-Einstellungen.
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  update public.plattform_einstellungen set wert = '1'::jsonb where schluessel = 'registrierung_limit_email';
  select public.registrierung_pruefen('limit@firma.invalid', 'ip-c') into v_txt;
  perform 1;
  select public.registrierung_pruefen('limit@firma.invalid', 'ip-c') into v_txt;
  insert into erg values (18,'Limit je Adresse aus den Plattform-Einstellungen','zu_viele',v_txt,v_txt='zu_viele');

  -- --- Waechter-Befund ---------------------------------------------------------------
  select public.waechter_befund() into v_json;
  insert into erg values (19,'Befund traegt alle Kennzahlen','8',(select count(*) from jsonb_object_keys(v_json))::text,(select count(*) from jsonb_object_keys(v_json))=8);
  insert into public.jobs (mandant_id, art, nutzlast, status, beendet_am, fehler_text)
  values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'mail', '{}'::jsonb, 'fehler', now(), 'Test');
  update public.postfaecher set status = 'fehler', fehler_text = 'Test' where id = 'aaaaaaaa-5555-5555-5555-5555555c5555';
  select public.waechter_befund() into v_json;
  insert into erg values (20,'Befund zaehlt gescheiterte Auftraege und gestoerte Postfaecher','1/1',
    (v_json->>'auftraege_fehler_24h') || '/' || (v_json->>'postfaecher_fehler'),
    (v_json->>'auftraege_fehler_24h') = '1' and (v_json->>'postfaecher_fehler') = '1');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
