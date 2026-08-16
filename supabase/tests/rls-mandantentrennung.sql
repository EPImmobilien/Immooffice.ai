-- ===========================================================================
-- Nachweis der Cross-Tenant-Isolation (Master-Prompt Abschnitt 19, Gate B)
--
-- Legt zwei Mandanten mit je einem Inhaber und einem Nur-Lese-Benutzer an,
-- schluepft per set_config in deren Sitzung und prueft, dass die
-- Row-Level-Security jeden Zugriff ueber die Mandantengrenze verhindert.
--
-- Laeuft vollstaendig in einer Transaktion und wird am Ende zurueckgerollt —
-- es bleiben keine Daten zurueck.
--
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/rls-mandantentrennung.sql
-- Erwartung:   jede Zeile der Ergebnistabelle steht auf BESTANDEN.
-- ===========================================================================

begin;

create temp table ergebnis (
  nr int, pruefung text, erwartet text, ist text, bestanden boolean
) on commit drop;
-- Der Testcode laeuft unter der Rolle authenticated und muss schreiben duerfen.
grant all on ergebnis to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','a@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','b@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','c@test.invalid','x',now(),now(),now());

insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Mandant A','mandant-a'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Mandant B','mandant-b');

insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Nutzer A','a@test.invalid','inhaber'),
  ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','Nutzer B','b@test.invalid','inhaber'),
  ('33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-000000000001','Leser A','c@test.invalid','nur_lesen');

insert into public.objekte (id, mandant_id, bezeichnung) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Objekt von A'),
  ('dddddddd-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Objekt von B');

insert into public.kontakte (id, mandant_id, nachname) values
  ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Kontakt A'),
  ('ffffffff-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Kontakt B');

do $$
declare
  v_anzahl int;
  v_text   text;
begin
  -- ===================== Inhaber des Mandanten A =========================
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  select count(*) into v_anzahl from public.objekte;
  insert into ergebnis values (1,'A sieht nur eigene Objekte','1',v_anzahl::text,v_anzahl=1);

  select count(*) into v_anzahl from public.kontakte;
  insert into ergebnis values (2,'A sieht nur eigene Kontakte','1',v_anzahl::text,v_anzahl=1);

  select count(*) into v_anzahl from public.mandanten;
  insert into ergebnis values (3,'A sieht nur eigenen Mandanten','1',v_anzahl::text,v_anzahl=1);

  -- Erratene ID darf nichts preisgeben (Abschnitt 5).
  select count(*) into v_anzahl from public.objekte
   where id='dddddddd-0000-0000-0000-000000000002';
  insert into ergebnis values (4,'A kann fremdes Objekt nicht per ID lesen','0',v_anzahl::text,v_anzahl=0);

  update public.objekte set bezeichnung='UEBERNOMMEN'
   where id='dddddddd-0000-0000-0000-000000000002';
  get diagnostics v_anzahl = row_count;
  insert into ergebnis values (5,'A kann fremdes Objekt nicht aendern','0',v_anzahl::text,v_anzahl=0);

  delete from public.objekte where id='dddddddd-0000-0000-0000-000000000002';
  get diagnostics v_anzahl = row_count;
  insert into ergebnis values (6,'A kann fremdes Objekt nicht loeschen','0',v_anzahl::text,v_anzahl=0);

  begin
    insert into public.objekte (mandant_id, bezeichnung)
    values ('bbbbbbbb-0000-0000-0000-000000000002','Eingeschleust');
    insert into ergebnis values (7,'A kann nicht im fremden Mandanten anlegen','abgewiesen','DURCHGELASSEN',false);
  exception when others then
    insert into ergebnis values (7,'A kann nicht im fremden Mandanten anlegen','abgewiesen','abgewiesen',true);
  end;

  -- Gegenprobe: Der erlaubte Fall muss funktionieren, sonst prueft der Test nichts.
  begin
    insert into public.objekte (mandant_id, bezeichnung)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Neues Objekt A');
    insert into ergebnis values (8,'A kann im eigenen Mandanten anlegen','erlaubt','erlaubt',true);
  exception when others then
    insert into ergebnis values (8,'A kann im eigenen Mandanten anlegen','erlaubt','ABGEWIESEN',false);
  end;

  -- ===================== Inhaber des Mandanten B =========================
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

  select coalesce(string_agg(bezeichnung,', '),'-') into v_text from public.objekte;
  insert into ergebnis values (9,'B sieht ausschliesslich eigene Objekte','Objekt von B',v_text,v_text='Objekt von B');

  select count(*) into v_anzahl from public.benutzer;
  insert into ergebnis values (10,'B sieht nur Benutzer des eigenen Mandanten','1',v_anzahl::text,v_anzahl=1);

  -- ===================== Nur-Lese-Zugriff im Mandanten A =================
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

  select count(*) into v_anzahl from public.objekte;
  insert into ergebnis values (11,'Nur-Lesen sieht Objekte des Mandanten','2',v_anzahl::text,v_anzahl=2);

  begin
    insert into public.objekte (mandant_id, bezeichnung)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Von Nur-Lesen');
    insert into ergebnis values (12,'Nur-Lesen darf nicht anlegen','abgewiesen','DURCHGELASSEN',false);
  exception when others then
    insert into ergebnis values (12,'Nur-Lesen darf nicht anlegen','abgewiesen','abgewiesen',true);
  end;

  update public.objekte set bezeichnung='Geaendert'
   where id='cccccccc-0000-0000-0000-000000000001';
  get diagnostics v_anzahl = row_count;
  insert into ergebnis values (13,'Nur-Lesen darf nicht aendern','0',v_anzahl::text,v_anzahl=0);

  reset role;
end $$;

select nr, pruefung, erwartet, ist,
       case when bestanden then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from ergebnis order by nr;

-- Nichts bleibt zurueck.
rollback;
