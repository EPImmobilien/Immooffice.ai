-- ===========================================================================
-- Nachweis der Credit-Regeln (Master-Prompt Abschnitt 14, Gate B)
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/credits.sql
-- Erwartung:   jede Zeile steht auf BESTANDEN.
--
-- Hinweis zur Pruefmethode: Row-Level-Security wirft KEINE Ausnahme, sondern
-- filtert auf null Zeilen. Ein Test, der auf eine Ausnahme wartet, prueft
-- deshalb das Falsche. Geprueft wird der Bestand — und die Trigger-Sperre
-- zusaetzlich unter einer Rolle mit vollem Zugriff, wo RLS nicht schuetzt.
-- ===========================================================================
begin;

create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.invalid','x',now(),now(),now());
insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Mandant A','mandant-a'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Mandant B','mandant-b');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Nutzer A','a@test.invalid','inhaber'),
  ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','Nutzer B','b@test.invalid','inhaber');

-- Zwei Chargen fuer A: die aeltere laeuft frueher ab und muss zuerst belastet werden.
select public.credits_gutschreiben('aaaaaaaa-0000-0000-0000-000000000001','test',20, now()+interval '10 days','alt');
select public.credits_gutschreiben('aaaaaaaa-0000-0000-0000-000000000001','gekauft',100, now()+interval '12 months','neu');
select public.credits_gutschreiben('bbbbbbbb-0000-0000-0000-000000000002','test',50, now()+interval '10 days','B');

do $$
declare v int; v_vorgang uuid; v_alt uuid; v_id uuid; v_menge int; v_fremd int;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  select public.credits_verfuegbar() into v;
  insert into erg values (1,'Guthaben nach Gutschrift','120',v::text,v=120);

  v_vorgang := public.credits_reservieren('pdf_export');
  select public.credits_verfuegbar() into v;
  insert into erg values (2,'PDF-Export kostet keine Credits','120',v::text,v=120);

  v_vorgang := public.credits_reservieren('ki_expose_komplett');
  select public.credits_verfuegbar() into v;
  insert into erg values (3,'Reservierung mindert Verfuegbarkeit','110',v::text,v=110);

  select id into v_alt from public.credit_konto
   where mandant_id='aaaaaaaa-0000-0000-0000-000000000001' and herkunft='test';
  select reserviert into v from public.credit_konto where id=v_alt;
  insert into erg values (4,'Aelteste Charge zuerst belastet','10',v::text,v=10);

  perform public.credits_einloesen(v_vorgang, 4.2);
  select verbraucht into v from public.credit_konto where id=v_alt;
  insert into erg values (5,'Einloesen bucht endgueltig ab','10',v::text,v=10);
  select reserviert into v from public.credit_konto where id=v_alt;
  insert into erg values (6,'Nach Einloesen nichts mehr reserviert','0',v::text,v=0);

  v_vorgang := public.credits_reservieren('ki_bild_homestaging');
  select public.credits_verfuegbar() into v;
  insert into erg values (7,'Homestaging reserviert 30','80',v::text,v=80);
  perform public.credits_freigeben(v_vorgang,'Modellfehler');
  select public.credits_verfuegbar() into v;
  insert into erg values (8,'Freigabe stellt Guthaben wieder her','110',v::text,v=110);

  begin
    for i in 1..5 loop perform public.credits_reservieren('ki_grundriss'); end loop;
    insert into erg values (9,'Ueberziehen wird abgewiesen','abgewiesen','DURCHGELASSEN',false);
  exception when others then
    insert into erg values (9,'Ueberziehen wird abgewiesen','abgewiesen','abgewiesen',true);
  end;

  select public.credits_verfuegbar() into v;
  insert into erg values (10,'Kein negativer Saldo','>= 0',v::text,v>=0);

  select id, menge into v_id, v_menge from public.credit_buchungen
   where mandant_id='aaaaaaaa-0000-0000-0000-000000000001' limit 1;
  begin update public.credit_buchungen set menge = 999 where id = v_id;
  exception when others then null; end;
  select menge into v from public.credit_buchungen where id = v_id;
  insert into erg values (11,'Buchung bleibt nach Aenderungsversuch unveraendert',
                          v_menge::text, coalesce(v::text,'geloescht'), v = v_menge);

  begin delete from public.credit_buchungen where id = v_id;
  exception when others then null; end;
  select count(*) into v from public.credit_buchungen where id = v_id;
  insert into erg values (12,'Buchung bleibt nach Loeschversuch bestehen','1',v::text,v=1);

  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  select public.credits_verfuegbar() into v;
  insert into erg values (13,'B sieht ausschliesslich eigenes Guthaben','50',v::text,v=50);
  select count(*) into v from public.credit_buchungen;
  select count(*) into v_fremd from public.credit_buchungen
   where mandant_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
  insert into erg values (14,'B sieht nur eigene Buchungen, keine fremden','sichtbar>0, fremd=0',
                          format('sichtbar=%s, fremd=%s', v, v_fremd), v > 0 and v_fremd = 0);

  reset role;

  -- Die Sperre muss auch dort greifen, wo RLS nicht schuetzt.
  begin
    update public.credit_buchungen set menge = 999 where id = v_id;
    insert into erg values (17,'Trigger sperrt UPDATE trotz voller Rechte','abgewiesen','DURCHGELASSEN',false);
  exception when others then
    insert into erg values (17,'Trigger sperrt UPDATE trotz voller Rechte','abgewiesen','abgewiesen',true);
  end;
  begin
    delete from public.credit_buchungen where id = v_id;
    insert into erg values (18,'Trigger sperrt DELETE trotz voller Rechte','abgewiesen','DURCHGELASSEN',false);
  exception when others then
    insert into erg values (18,'Trigger sperrt DELETE trotz voller Rechte','abgewiesen','abgewiesen',true);
  end;
end $$;

insert into public.abonnements (mandant_id, tarif_id, status)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'aktiv' from public.tarife where schluessel='starter';

do $$
declare v int;
begin
  perform public.credits_gutschreiben('aaaaaaaa-0000-0000-0000-000000000001','inklusiv',900,null,'Vormonat');
  perform public.credits_monat_zuteilen('aaaaaaaa-0000-0000-0000-000000000001');
  select coalesce(sum(menge),0) into v from public.credit_konto
   where mandant_id='aaaaaaaa-0000-0000-0000-000000000001' and herkunft='uebertrag'
     and (gueltig_bis is null or gueltig_bis > now());
  insert into erg values (15,'Uebertrag auf ein Monatskontingent gedeckelt','300',v::text,v=300);
  select coalesce(sum(menge),0) into v from public.credit_konto
   where mandant_id='aaaaaaaa-0000-0000-0000-000000000001' and herkunft='inklusiv'
     and (gueltig_bis is null or gueltig_bis > now());
  insert into erg values (16,'Neues Monatskontingent gutgeschrieben','300',v::text,v=300);
end $$;

select nr, pruefung, erwartet, ist,
       case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;

rollback;
