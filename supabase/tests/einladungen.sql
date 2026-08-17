-- ===========================================================================
-- Nachweis fuer Einladungen und Benutzerverwaltung
-- (Master-Prompt Abschnitt 5, Umsetzungsplan Phase 1)
--
-- Geprueft wird dort, wo die Regeln gelten: in der Datenbank. Die Oberflaeche
-- blendet Schaltflaechen aus — das ist ausdruecklich kein Schutz.
--
-- Laeuft vollstaendig in einer Transaktion und wird am Ende zurueckgerollt.
--
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/einladungen.sql
-- Erwartung:   jede Zeile der Ergebnistabelle steht auf BESTANDEN.
-- ===========================================================================

begin;

create temp table ergebnis (
  nr int, pruefung text, erwartet text, ist text, bestanden boolean
) on commit drop;
grant all on ergebnis to authenticated, anon;

-- A1 Inhaber und A2 Administrator gehoeren zu Mandant A, B1 zu Mandant B.
-- N1 und N2 sind Konten ohne Unternehmen — sie nehmen die Einladungen an.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','a1@test.invalid','x',now(),now(),now()),
  ('a2222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','a2@test.invalid','x',now(),now(),now()),
  ('b1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','b1@test.invalid','x',now(),now(),now()),
  ('c1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','neu@test.invalid','x',now(),now(),now()),
  ('c2222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','fremd@test.invalid','x',now(),now(),now());

insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','Mandant A','test-mandant-a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','Mandant B','test-mandant-b');

insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('a1111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a','Inhaber A','a1@test.invalid','inhaber'),
  ('a2222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-00000000000a','Admin A','a2@test.invalid','administrator'),
  ('b1111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-00000000000b','Inhaber B','b1@test.invalid','inhaber');

do $$
declare
  v_anzahl int;
  v_text   text;
  v_id     uuid;
  r        text;
begin
  -- ==================== Anlegen und Rechte darauf ========================
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';

  v_id := public.einladung_erstellen('neu@test.invalid','makler','{}'::jsonb,
                                     'token-fuer-den-neuen-benutzer-01');
  insert into ergebnis values (1,'Inhaber kann einladen','angelegt',
    case when v_id is null then 'nichts' else 'angelegt' end, v_id is not null);

  -- Das Klartext-Token darf nirgends stehen. Wer die Tabelle liest, soll
  -- damit keinem Mandanten beitreten koennen.
  select count(*) into v_anzahl from public.einladungen
   where token_hash = 'token-fuer-den-neuen-benutzer-01';
  insert into ergebnis values (2,'Token steht nicht im Klartext in der Tabelle','0',
    v_anzahl::text, v_anzahl = 0);

  -- Nur eine offene Einladung je Adresse: Sonst gaebe es mehrere gueltige
  -- Links, von denen der Einladende nur den letzten kennt.
  begin
    perform public.einladung_erstellen('neu@test.invalid','assistenz','{}'::jsonb,
                                       'zweites-token-fuer-dieselbe-adresse');
    r := 'DURCHGEKOMMEN';
  exception when unique_violation then r := 'abgewiesen'; end;
  insert into ergebnis values (3,'keine zweite offene Einladung je Adresse',
    'abgewiesen', r, r = 'abgewiesen');

  begin
    perform public.einladung_erstellen('a2@test.invalid','makler','{}'::jsonb,
                                       'token-fuer-eine-bekannte-adresse');
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (4,'keine Einladung an bereits vorhandene Benutzer',
    'abgewiesen', r, r = 'abgewiesen');

  -- Ein Administrator darf einladen, aber keinen Inhaber machen. Sonst
  -- koennte er sich ueber eine Zweitadresse selbst zum Inhaber erheben.
  set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    perform public.einladung_erstellen('inhaber2@test.invalid','inhaber','{}'::jsonb,
                                       'token-fuer-einen-zweiten-inhaber');
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (5,'Administrator vergibt keine Inhaberrolle',
    'abgewiesen', r, r = 'abgewiesen');

  -- Ein Makler darf gar nicht einladen. Herab- und wieder heraufstufen muss
  -- der Inhaber — A2 selbst kann seine Rolle nicht anfassen, das ist gerade
  -- der Punkt.
  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  update public.benutzer set rolle = 'makler'
   where id = 'a2222222-2222-2222-2222-222222222222';

  set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    perform public.einladung_erstellen('x@test.invalid','makler','{}'::jsonb,
                                       'token-eines-nicht-berechtigten-01');
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (6,'Makler darf nicht einladen','abgewiesen', r,
    r = 'abgewiesen');

  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  update public.benutzer set rolle = 'administrator'
   where id = 'a2222222-2222-2222-2222-222222222222';

  -- ==================== Sichtbarkeit ueber Mandantengrenzen ==============
  set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  select count(*) into v_anzahl from public.einladungen;
  insert into ergebnis values (7,'fremder Mandant sieht keine Einladung','0',
    v_anzahl::text, v_anzahl = 0);

  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  select count(*) into v_anzahl from public.einladungen;
  insert into ergebnis values (8,'eigener Mandant sieht seine Einladung','1',
    v_anzahl::text, v_anzahl = 1);

  -- ==================== Annehmen =========================================
  -- Falsches Konto: Der Link allein genuegt nicht, die Adresse muss passen.
  set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    perform public.einladung_einloesen('token-fuer-den-neuen-benutzer-01','Fremder');
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (9,'weitergeleiteter Link nuetzt einem Dritten nichts',
    'abgewiesen', r, r = 'abgewiesen');

  -- Falsches Token.
  set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  begin
    perform public.einladung_einloesen('irgendein-falsches-token-000000','Neu');
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (10,'unbekanntes Token wird abgewiesen','abgewiesen', r,
    r = 'abgewiesen');

  -- Richtiges Konto, richtiges Token.
  v_id := public.einladung_einloesen('token-fuer-den-neuen-benutzer-01','Neue Kollegin');
  insert into ergebnis values (11,'passendes Konto tritt bei',
    'aaaaaaaa-0000-0000-0000-00000000000a', coalesce(v_id::text,'nichts'),
    v_id = 'aaaaaaaa-0000-0000-0000-00000000000a');

  select rolle::text into v_text from public.benutzer
   where id = 'c1111111-1111-1111-1111-111111111111';
  insert into ergebnis values (12,'die eingeladene Rolle wird uebernommen','makler',
    coalesce(v_text,'nichts'), v_text = 'makler');

  -- Kein zweites Mal.
  begin
    perform public.einladung_einloesen('token-fuer-den-neuen-benutzer-01','Nochmal');
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (13,'eine Einladung gilt nur einmal','abgewiesen', r,
    r = 'abgewiesen');

  -- ==================== Widerruf und Ablauf ==============================
  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  perform public.einladung_erstellen('zweite@test.invalid','assistenz','{}'::jsonb,
                                     'token-der-gleich-widerrufen-wird');
  update public.einladungen set widerrufen_am = now()
   where email = 'zweite@test.invalid';

  select zustand into v_text from public.einladung_ansehen('token-der-gleich-widerrufen-wird');
  insert into ergebnis values (14,'widerrufene Einladung meldet sich als widerrufen',
    'widerrufen', coalesce(v_text,'nichts'), v_text = 'widerrufen');

  perform public.einladung_erstellen('dritte@test.invalid','assistenz','{}'::jsonb,
                                     'token-das-bereits-abgelaufen-ist');
  update public.einladungen set gueltig_bis = now() - interval '1 day'
   where email = 'dritte@test.invalid';

  select zustand into v_text from public.einladung_ansehen('token-das-bereits-abgelaufen-ist');
  insert into ergebnis values (15,'abgelaufene Einladung meldet sich als abgelaufen',
    'abgelaufen', coalesce(v_text,'nichts'), v_text = 'abgelaufen');

  select zustand into v_text from public.einladung_ansehen('ein-token-das-es-nie-gab-00000');
  insert into ergebnis values (16,'unbekanntes Token verraet nichts','unbekannt',
    coalesce(v_text,'nichts'), v_text = 'unbekannt');

  -- ==================== Schutz der Inhaberrolle ==========================
  -- Der Administrator darf den Inhaber nicht herabstufen.
  set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    update public.benutzer set rolle = 'nur_lesen'
     where id = 'a1111111-1111-1111-1111-111111111111';
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (17,'Administrator entmachtet den Inhaber nicht',
    'abgewiesen', r, r = 'abgewiesen');

  -- Der Inhaber darf sich selbst nicht herabstufen, solange er der einzige ist.
  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  begin
    update public.benutzer set rolle = 'makler'
     where id = 'a1111111-1111-1111-1111-111111111111';
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (18,'der letzte Inhaber bleibt Inhaber','abgewiesen', r,
    r = 'abgewiesen');

  begin
    update public.benutzer set aktiv = false
     where id = 'a1111111-1111-1111-1111-111111111111';
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (19,'der eigene Zugang laesst sich nicht abschalten',
    'abgewiesen', r, r = 'abgewiesen');

  -- Bewusst aus der Sitzung des Administrators: Loescht der Inhaber sich
  -- selbst, greift schon die Policy (`id <> auth.uid()`) — und eine Loeschung
  -- ohne betroffene Zeile wirft keinen Fehler. Der Test waere dann gruen,
  -- ohne den Trigger auch nur zu beruehren. Genau so ist er beim ersten Lauf
  -- durchgefallen.
  set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    delete from public.benutzer where id = 'a1111111-1111-1111-1111-111111111111';
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (20,'der letzte Inhaber laesst sich nicht loeschen',
    'abgewiesen', r, r = 'abgewiesen');

  select count(*) into v_anzahl from public.benutzer
   where id = 'a1111111-1111-1111-1111-111111111111';
  insert into ergebnis values (21,'der Inhaber ist noch da','1',
    v_anzahl::text, v_anzahl = 1);

  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';

  -- Gegenprobe: Was erlaubt bleiben muss, bleibt erlaubt.
  begin
    update public.benutzer set aktiv = false
     where id = 'c1111111-1111-1111-1111-111111111111';
    r := 'erlaubt';
  exception when others then r := 'ABGEWIESEN'; end;
  insert into ergebnis values (22,'Verwaltung darf fremde Zugaenge abschalten',
    'erlaubt', r, r = 'erlaubt');

  -- ==================== Rechte am eigenen Profil =========================
  -- Der abgeschaltete Benutzer sieht seine eigene Zeile weiterhin. Ohne diese
  -- Policy laendete er in einer Weiterleitungsschleife.
  set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  select count(*) into v_anzahl from public.benutzer
   where id = 'c1111111-1111-1111-1111-111111111111';
  insert into ergebnis values (23,'abgeschalteter Zugang sieht das eigene Konto','1',
    v_anzahl::text, v_anzahl = 1);

  -- Aber nichts anderes.
  select count(*) into v_anzahl from public.benutzer;
  insert into ergebnis values (24,'abgeschalteter Zugang sieht sonst nichts','1',
    v_anzahl::text, v_anzahl = 1);

  set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  update public.benutzer set aktiv = true
   where id = 'c1111111-1111-1111-1111-111111111111';

  -- Ein Makler darf seinen Namen aendern, aber nicht seine Rolle und nicht
  -- seine Rechte.
  set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';
  begin
    update public.benutzer set name = 'Neuer Name'
     where id = 'c1111111-1111-1111-1111-111111111111';
    r := 'erlaubt';
  exception when others then r := 'ABGEWIESEN'; end;
  insert into ergebnis values (25,'jeder pflegt sein eigenes Profil','erlaubt', r,
    r = 'erlaubt');

  begin
    update public.benutzer set rolle = 'inhaber'
     where id = 'c1111111-1111-1111-1111-111111111111';
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (26,'niemand befoerdert sich selbst','abgewiesen', r,
    r = 'abgewiesen');

  begin
    update public.benutzer
       set rechte_uebersteuerung = '{"abrechnung":{"aendern":true}}'::jsonb
     where id = 'c1111111-1111-1111-1111-111111111111';
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (27,'niemand erweitert seine eigenen Rechte','abgewiesen',
    r, r = 'abgewiesen');

  begin
    update public.benutzer set email = 'andere@test.invalid'
     where id = 'c1111111-1111-1111-1111-111111111111';
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen'; end;
  insert into ergebnis values (28,'die eigene Adresse aendert nur die Verwaltung',
    'abgewiesen', r, r = 'abgewiesen');

  -- ==================== Nicht angemeldete Aufrufer =======================
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';

  begin
    perform public.einladung_erstellen('anon@test.invalid','inhaber','{}'::jsonb,
                                       'token-eines-nicht-angemeldeten-01');
    r := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then r := 'abgewiesen'; end;
  insert into ergebnis values (29,'anon darf nicht einladen','abgewiesen', r,
    r = 'abgewiesen');

  begin
    perform public.einladung_einloesen('token-fuer-den-neuen-benutzer-01','anon');
    r := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then r := 'abgewiesen'; end;
  insert into ergebnis values (30,'anon darf nicht einloesen','abgewiesen', r,
    r = 'abgewiesen');

  -- Gegenprobe: Die Ansicht hinter dem Link muss ohne Anmeldung gehen —
  -- sonst koennte niemand einer Einladung folgen, bevor er ein Konto hat.
  begin
    perform public.einladung_ansehen('ein-token-das-es-nie-gab-00000');
    r := 'erlaubt';
  exception when insufficient_privilege then r := 'ABGEWIESEN'; end;
  insert into ergebnis values (31,'anon darf eine Einladung ansehen','erlaubt', r,
    r = 'erlaubt');

  select count(*) into v_anzahl from public.einladungen;
  insert into ergebnis values (32,'anon sieht die Tabelle selbst nicht','0',
    v_anzahl::text, v_anzahl = 0);

  reset role;
end $$;

select nr, pruefung, erwartet, ist,
       case when bestanden then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from ergebnis order by nr;

rollback;
