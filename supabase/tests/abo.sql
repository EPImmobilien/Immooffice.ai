-- ===========================================================================
-- Nachweis: Abo, Testphase, Lesemodus, Benutzerlimit, Stripe-Idempotenz
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/abo.sql
--              oder scripts/db-lokal.sh
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-1111111b1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','neu@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-2222222b2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','kollege@test.invalid','x',now(),now(),now());

do $$
declare
  v_fehler text; v_txt text; v_n int; v_mandant uuid; v_credits int; v_status text; v_bool boolean;
  v_token text := 'b3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c9';
  v_starter uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111b1111","role":"authenticated"}';

  -- --- Registrierung: Abo-Zeile und 100 Test-Credits ------------------------
  v_mandant := public.registriere_mandant('Test Immobilien', 'Neu Nutzer');
  select status::text into v_status from public.abonnements where mandant_id = v_mandant;
  insert into erg values (1,'Registrierung legt Abo im Zustand test an','test',v_status,v_status='test');
  select public.credits_verfuegbar() into v_credits;
  insert into erg values (2,'Registrierung schreibt 100 Test-Credits gut','100',v_credits::text,v_credits=100);

  -- --- Schreiben in der Testphase moeglich ----------------------------------
  select schreibbar into v_bool from public.mandant_zustand();
  insert into erg values (3,'Testphase: Mandant ist schreibbar','true',v_bool::text,v_bool);
  insert into public.objekte (mandant_id, bezeichnung) values (v_mandant, 'Erstes Objekt');
  insert into erg values (4,'Objekt in der Testphase anlegbar','angelegt','angelegt',true);

  -- --- Benutzerlimit in der Testphase: ein Benutzer -------------------------
  select benutzer_limit into v_n from public.mandant_zustand();
  insert into erg values (5,'Testphase: Benutzerlimit 1','1',v_n::text,v_n=1);
  begin
    perform public.einladung_erstellen('kollege@test.invalid', 'makler', '{}'::jsonb, v_token);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (6,'Einladung ueber dem Limit abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Stripe: Kunde setzen, Abo uebernehmen (Dienstrolle) ------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';

  select public.stripe_ereignis_beginnen('evt_1', 'customer.subscription.created', '{}'::jsonb) into v_bool;
  insert into erg values (7,'Neues Ereignis wird verarbeitet','true',v_bool::text,v_bool);
  select public.stripe_ereignis_beginnen('evt_1', 'customer.subscription.created', '{}'::jsonb) into v_bool;
  insert into erg values (8,'Dasselbe Ereignis ein zweites Mal: nicht verarbeiten','false',v_bool::text,not v_bool);
  perform public.stripe_ereignis_abschliessen('evt_1', 'Netzfehler');
  select public.stripe_ereignis_beginnen('evt_1', 'customer.subscription.created', '{}'::jsonb) into v_bool;
  insert into erg values (9,'Nach Fehlschlag erneut verarbeitbar','true',v_bool::text,v_bool);
  perform public.stripe_ereignis_abschliessen('evt_1', null);
  select public.stripe_ereignis_beginnen('evt_1', 'customer.subscription.created', '{}'::jsonb) into v_bool;
  insert into erg values (10,'Nach Erfolg endgueltig verarbeitet','false',v_bool::text,not v_bool);

  perform public.stripe_kunde_setzen(v_mandant, 'cus_test');
  select public.mandant_fuer_stripe_kunde('cus_test') into v_txt;
  insert into erg values (11,'Kunde ↔ Mandant verknuepft',v_mandant::text,v_txt,v_txt=v_mandant::text);

  select public.abo_uebernehmen(v_mandant, 'cus_test', 'sub_test', 'active', 'professional', 'monat', 2,
                                now() + interval '1 month', null)::text into v_status;
  insert into erg values (12,'Aktives Stripe-Abo → aktiv','aktiv',v_status,v_status='aktiv');
  select abo_status::text into v_txt from public.mandanten where id = v_mandant;
  insert into erg values (13,'Mandant traegt den Abo-Status','aktiv',v_txt,v_txt='aktiv');

  -- Bezahlte Periode: Kontingent genau einmal.
  select public.abo_periode_gutschreiben(v_mandant, 'in_1') into v_n;
  insert into erg values (14,'Erste Rechnung schreibt das Monatskontingent gut','1500',v_n::text,v_n=1500);
  select public.abo_periode_gutschreiben(v_mandant, 'in_1') into v_n;
  insert into erg values (15,'Dieselbe Rechnung noch einmal: nichts','0',v_n::text,v_n=0);

  -- Paketkauf: genau einmal.
  select public.credit_paket_gutschreiben(v_mandant, 'credits_klein', 'pi_1') into v_n;
  insert into erg values (16,'Paket Klein schreibt 250 Credits gut','250',v_n::text,v_n=250);
  select public.credit_paket_gutschreiben(v_mandant, 'credits_klein', 'pi_1') into v_n;
  insert into erg values (17,'Dieselbe Zahlung noch einmal: nichts','0',v_n::text,v_n=0);
  begin
    perform public.credit_paket_gutschreiben(v_mandant, 'credits_riesig', 'pi_2');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (18,'Unbekanntes Paket abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Zahlung fehlgeschlagen → zahlung_offen, aber weiter schreibbar (Kulanz).
  perform public.zahlung_fehlgeschlagen(v_mandant);
  select abo_status::text into v_txt from public.mandanten where id = v_mandant;
  insert into erg values (19,'Fehlgeschlagene Zahlung → zahlung_offen','zahlung_offen',v_txt,v_txt='zahlung_offen');
  select intern.mandant_schreibbar(v_mandant) into v_bool;
  insert into erg values (20,'zahlung_offen bleibt schreibbar (Kulanz)','true',v_bool::text,v_bool);

  -- Kuendigung → gekuendigt, nicht mehr schreibbar.
  select public.abo_uebernehmen(v_mandant, 'cus_test', 'sub_test', 'canceled', 'professional', 'monat', 2, null, now())::text into v_status;
  insert into erg values (21,'Gekuendigtes Abo → gekuendigt','gekuendigt',v_status,v_status='gekuendigt');
  select intern.mandant_schreibbar(v_mandant) into v_bool;
  insert into erg values (22,'gekuendigt: nicht schreibbar','false',v_bool::text,not v_bool);

  -- --- Lesemodus wirkt in den Policies --------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111b1111","role":"authenticated"}';
  select count(*) into v_n from public.objekte where mandant_id = v_mandant;
  insert into erg values (23,'Lesemodus: Lesen geht','1',v_n::text,v_n=1);
  begin
    insert into public.objekte (mandant_id, bezeichnung) values (v_mandant, 'Zweites Objekt');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (24,'Lesemodus: Anlegen abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.objekte set bezeichnung = 'Geaendert' where mandant_id = v_mandant;
  get diagnostics v_n = row_count;
  insert into erg values (25,'Lesemodus: Aendern wirkungslos','0',v_n::text,v_n=0);

  -- --- Testphase abgelaufen: Tageslauf setzt Lesemodus und Loeschtermin -----
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  update public.mandanten set abo_status = 'test', testphase_bis = now() - interval '1 hour', lesemodus_seit = null where id = v_mandant;
  update public.abonnements set status = 'test' where mandant_id = v_mandant;
  perform public.abos_pruefen();
  select (lesemodus_seit is not null)::text || '/' || (loeschung_geplant_am > now() + interval '29 days')::text into v_txt
    from public.mandanten where id = v_mandant;
  insert into erg values (26,'Tageslauf: Lesemodus gesetzt, Loeschung in ~30 Tagen','true/true',v_txt,v_txt='true/true');
  select count(*) into v_n from public.jobs where mandant_id = v_mandant and art = 'mail' and nutzlast->>'vorlage' = 'testphase_tag7';
  insert into erg values (27,'Erinnerung Tag 7 als Mail-Auftrag eingestellt','1',v_n::text,v_n=1);
  perform public.abos_pruefen();
  select count(*) into v_n from public.jobs where mandant_id = v_mandant and art = 'mail' and nutzlast->>'vorlage' = 'testphase_tag7';
  insert into erg values (28,'Zweiter Tageslauf stellt die Erinnerung nicht doppelt ein','1',v_n::text,v_n=1);

  -- --- Benutzerlimit nach Downgrade: zuletzt angelegter Zugang wird abgeschaltet
  select id into v_starter from public.tarife where schluessel = 'starter';
  perform public.abo_uebernehmen(v_mandant, 'cus_test', 'sub_test', 'active', 'starter', 'monat', 0, now() - interval '1 minute', null);
  insert into public.benutzer (id, mandant_id, name, email, rolle)
  values ('22222222-2222-2222-2222-2222222b2222', v_mandant, 'Kollege', 'kollege@test.invalid', 'makler');
  perform public.abos_pruefen();
  select aktiv::text into v_txt from public.benutzer where id = '22222222-2222-2222-2222-2222222b2222';
  insert into erg values (29,'Downgrade: zuletzt angelegter Zugang abgeschaltet','false',v_txt,v_txt='false');
  select aktiv::text into v_txt from public.benutzer where id = '11111111-1111-1111-1111-1111111b1111';
  insert into erg values (30,'Downgrade: Inhaber bleibt aktiv','true',v_txt,v_txt='true');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
