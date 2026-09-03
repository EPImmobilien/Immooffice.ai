-- ===========================================================================
-- Nachweis: Integrationen — Mandantentrennung und Schutz der Zugangsdaten
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/integrationen.sql
--
-- Kernfrage: Kommt ein angemeldeter Benutzer — auch die Verwaltung — an die
-- verschluesselten Zugangsdaten heran? Er darf sie schreiben, nie lesen.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-1111111f1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm-a@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-2222222f2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mak-a@test.invalid','x',now(),now(),now()),
       ('33333333-3333-3333-3333-3333333f3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm-b@test.invalid','x',now(),now(),now());

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1','Mandant A','mandant-if-a'),
  ('bbbbbbbb-0000-0000-0000-0000000000f2','Mandant B','mandant-if-b');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-1111111f1111','aaaaaaaa-0000-0000-0000-0000000000f1','Admin A','adm-a@test.invalid','administrator'),
  ('22222222-2222-2222-2222-2222222f2222','aaaaaaaa-0000-0000-0000-0000000000f1','Makler A','mak-a@test.invalid','makler'),
  ('33333333-3333-3333-3333-3333333f3333','bbbbbbbb-0000-0000-0000-0000000000f2','Admin B','adm-b@test.invalid','administrator');

do $$
declare v_fehler text; v_txt text; v_n int; v_id uuid; v_lauf uuid;
begin
  set local role authenticated;

  -- --- Verwaltung A legt eine Integration mit Zugangsdaten an ---------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111f1111","role":"authenticated"}';
  insert into public.integrationen (mandant_id, anbieter, bezeichnung, zugangsdaten_verschluesselt, richtung)
  values ('aaaaaaaa-0000-0000-0000-0000000000f1','onoffice','Unser CRM','v1.aWl2.dGFn.Z2VoZWlt','beide')
  returning id into v_id;
  insert into erg values (1,'Verwaltung legt Integration an','angelegt',case when v_id is null then 'nichts' else 'angelegt' end,v_id is not null);

  -- Unbekannter Anbieter wird abgewiesen.
  begin
    insert into public.integrationen (mandant_id, anbieter, bezeichnung)
    values ('aaaaaaaa-0000-0000-0000-0000000000f1','unbekannt','x');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (2,'Unbekannter Anbieter abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Falsches Format der Zugangsdaten wird abgewiesen.
  begin
    insert into public.integrationen (mandant_id, anbieter, bezeichnung, zugangsdaten_verschluesselt)
    values ('aaaaaaaa-0000-0000-0000-0000000000f1','onoffice','x','klartext-token');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (3,'Unverschluesselte Zugangsdaten abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Die Zugangsdaten sind fuer die Verwaltung NICHT lesbar --------------
  begin
    select zugangsdaten_verschluesselt into v_txt from public.integrationen where id = v_id;
    v_fehler := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then v_fehler := 'abgewiesen';
  end;
  insert into erg values (4,'Verwaltung kann Zugangsdaten nicht lesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Die uebrigen Spalten schon.
  select bezeichnung into v_txt from public.integrationen where id = v_id;
  insert into erg values (5,'Verwaltung liest die uebrigen Spalten','Unser CRM',v_txt,v_txt='Unser CRM');

  -- Ersetzen der Zugangsdaten bleibt moeglich.
  update public.integrationen set zugangsdaten_verschluesselt = 'v1.bmV1.dGFn.bmV1' where id = v_id;
  get diagnostics v_n = row_count;
  insert into erg values (6,'Verwaltung ersetzt Zugangsdaten','1',v_n::text,v_n=1);

  -- --- Makler liest, schreibt nicht -----------------------------------------
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222f2222","role":"authenticated"}';
  select count(*) into v_n from public.integrationen;
  insert into erg values (7,'Makler sieht Integrationen des Mandanten','1',v_n::text,v_n=1);
  update public.integrationen set bezeichnung='geaendert' where id=v_id;
  get diagnostics v_n = row_count;
  insert into erg values (8,'Makler aendert nichts','0',v_n::text,v_n=0);

  -- --- Mandant B sieht nichts ----------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333f3333","role":"authenticated"}';
  select count(*) into v_n from public.integrationen;
  insert into erg values (9,'Mandant B sieht keine Integration von A','0',v_n::text,v_n=0);

  -- B kann keinen Sync-Lauf an A's Integration haengen — weder mit eigener
  -- noch mit A's Mandanten-ID.
  begin
    insert into public.sync_laeufe (integration_id, mandant_id, richtung)
    values (v_id, 'bbbbbbbb-0000-0000-0000-0000000000f2', 'holen');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (10,'B haengt keinen Lauf an A (eigene Mandant-ID)','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.sync_laeufe (integration_id, mandant_id, richtung)
    values (v_id, 'aaaaaaaa-0000-0000-0000-0000000000f1', 'holen');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (11,'B haengt keinen Lauf an A (A-Mandant-ID)','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Mandantenreinheit der Kindtabellen bei A selbst --------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111f1111","role":"authenticated"}';
  insert into public.sync_laeufe (integration_id, mandant_id, richtung)
  values (v_id, 'aaaaaaaa-0000-0000-0000-0000000000f1', 'holen') returning id into v_lauf;
  insert into erg values (12,'A legt Sync-Lauf an','angelegt',case when v_lauf is null then 'nichts' else 'angelegt' end,v_lauf is not null);

  begin
    insert into public.integration_mappings (integration_id, mandant_id, typ, lokal_id, fremd_id)
    values (v_id, 'bbbbbbbb-0000-0000-0000-0000000000f2', 'objekt', gen_random_uuid(), '4711');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (13,'Mapping mit fremder Mandant-ID abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  insert into public.integration_mappings (integration_id, mandant_id, typ, lokal_id, fremd_id)
  values (v_id, 'aaaaaaaa-0000-0000-0000-0000000000f1', 'objekt', '99999999-9999-9999-9999-999999999999', '4711');
  begin
    insert into public.integration_mappings (integration_id, mandant_id, typ, lokal_id, fremd_id)
    values (v_id, 'aaaaaaaa-0000-0000-0000-0000000000f1', 'objekt', gen_random_uuid(), '4711');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (14,'Dieselbe Fremd-ID nicht zweimal je Integration','abgewiesen',v_fehler,v_fehler='abgewiesen');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
