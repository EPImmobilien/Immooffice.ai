-- ===========================================================================
-- Nachweis: niemand erweitert seine eigenen Rechte
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/rechte-selbstermaechtigung.sql
--
-- Dieser Test hat einen echten Fehler gefunden und ist deshalb ein gutes
-- Beispiel dafuer, warum die WIRKUNG geprueft wird und nicht die Anwendung
-- einer Migration:
--
-- Der erste Anlauf schrieb die Sperre mit
-- `create or replace function public.pruefe_benutzer_aenderung()`. Das lief ohne
-- Fehlermeldung durch — der Trigger zeigt aber auf die Fassung in `intern`. Es
-- entstand eine zweite, von niemandem aufgerufene Funktion, die Sperre war
-- wirkungslos, und nichts wies darauf hin. Erst Pruefung 3 fiel durch.
--
-- Die Pruefungen 5 bis 9 sind ebenso wichtig wie die Sperre selbst: Die
-- wirksame Fassung enthielt mehr Regeln, als die aelteste Migrationsdatei
-- zeigt. Ein Neuschreiben aus dieser Datei heraus haette den Schutz des letzten
-- Inhabers und die Sperre gegen fremde E-Mail-Aenderungen stillschweigend
-- entfernt.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-111111ff1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-222222ff2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mak@test.invalid','x',now(),now(),now()),
       ('33333333-3333-3333-3333-333333ff3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inh@test.invalid','x',now(),now(),now());

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1','Mandant F','mandant-f1');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('33333333-3333-3333-3333-333333ff3333','aaaaaaaa-0000-0000-0000-0000000000f1','Inhaber','inh@test.invalid','inhaber'),
  ('11111111-1111-1111-1111-111111ff1111','aaaaaaaa-0000-0000-0000-0000000000f1','Admin','adm@test.invalid','administrator'),
  ('22222222-2222-2222-2222-222222ff2222','aaaaaaaa-0000-0000-0000-0000000000f1','Makler','mak@test.invalid','makler');

do $$
declare v_fehler text; v_txt text;
begin
  set local role authenticated;

  -- --- Ohne Verwaltungsrechte --------------------------------------------
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222ff2222","role":"authenticated"}';

  begin
    update public.benutzer set rechte_uebersteuerung='{"einstellungen":{"aendern":true}}'::jsonb
     where id='22222222-2222-2222-2222-222222ff2222';
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (1,'Makler kann sich keine Rechte geben','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Die Sperre darf das eigene Profil nicht mitnehmen.
  update public.benutzer set telefon='0431 1234567'
   where id='22222222-2222-2222-2222-222222ff2222';
  select telefon into v_txt from public.benutzer where id='22222222-2222-2222-2222-222222ff2222';
  insert into erg values (2,'Eigenes Profil bleibt pflegbar','0431 1234567',coalesce(v_txt,'nicht gesetzt'),v_txt='0431 1234567');

  -- --- Mit Verwaltungsrechten, an sich selbst ----------------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111ff1111","role":"authenticated"}';

  begin
    update public.benutzer set rechte_uebersteuerung='{"abrechnung":{"loeschen":true}}'::jsonb
     where id='11111111-1111-1111-1111-111111ff1111';
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (3,'Administrator kann sich SELBST keine Rechte geben','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Eine Aenderung, die nichts aendert, ist kein Verstoss. Sonst schluege
  -- jedes Speichern eines unveraenderten Formulars fehl.
  begin
    update public.benutzer set rolle='administrator'
     where id='11111111-1111-1111-1111-111111ff1111';
    v_fehler := 'DURCHGEKOMMEN (unveraendert)';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (4,'Gleiche Rolle erneut setzen ist kein Verstoss','DURCHGEKOMMEN (unveraendert)',v_fehler,
    v_fehler='DURCHGEKOMMEN (unveraendert)');

  -- --- Mit Verwaltungsrechten, an anderen: muss weiter gehen -------------
  update public.benutzer set rechte_uebersteuerung='{"wertermittlung":{"lesen":true}}'::jsonb
   where id='22222222-2222-2222-2222-222222ff2222';
  select rechte_uebersteuerung::text into v_txt from public.benutzer
   where id='22222222-2222-2222-2222-222222ff2222';
  insert into erg values (5,'Administrator setzt Rechte anderer','{"wertermittlung": {"lesen": true}}',v_txt,
    v_txt = '{"wertermittlung": {"lesen": true}}');

  update public.benutzer set rolle='assistenz'
   where id='22222222-2222-2222-2222-222222ff2222';
  select rolle::text into v_txt from public.benutzer where id='22222222-2222-2222-2222-222222ff2222';
  insert into erg values (6,'Administrator aendert Rollen anderer','assistenz',v_txt,v_txt='assistenz');

  -- --- Die zuvor bestehenden Regeln muessen erhalten sein ----------------
  begin
    update public.benutzer set rolle='inhaber'
     where id='22222222-2222-2222-2222-222222ff2222';
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (7,'Nur der Inhaber vergibt die Inhaberrolle','abgewiesen',v_fehler,v_fehler='abgewiesen');

  begin
    update public.benutzer set email='fremd@test.invalid'
     where id='11111111-1111-1111-1111-111111ff1111';
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (8,'E-Mail-Aenderung durch die Verwaltung bleibt moeglich','DURCHGEKOMMEN',v_fehler,
    v_fehler='DURCHGEKOMMEN');

  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333ff3333","role":"authenticated"}';
  begin
    update public.benutzer set aktiv=false
     where id='33333333-3333-3333-3333-333333ff3333';
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (9,'Letzter aktiver Inhaber bleibt geschuetzt','abgewiesen',v_fehler,v_fehler='abgewiesen');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
