-- Betreiberrollen (fork_68): haelt die Abstufung, wo sie halten muss — in der
-- Datenbank, nicht nur in der Edge Function?
--
-- Abnahmepunkte aus dem Auftrag vom 07.10.2026:
--   * Rolle support kann keine Preise aendern
--   * Audit-Log-Eintraege lassen sich weder aendern noch loeschen, auch nicht
--     vom Owner
--   * mindestens ein aktiver Owner bleibt immer bestehen
--   * ein normaler Nutzer / chef kommt nicht an Betreiberdaten, auch nicht
--     ueber die Sicht plattform_audit_log
\set ON_ERROR_STOP on
set client_min_messages to warning;

create temp table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temp table wer (was text, wert uuid);

do $$
declare
  v_m uuid; v_owner uuid := gen_random_uuid(); v_support uuid := gen_random_uuid();
  v_chef uuid := gen_random_uuid(); v_inaktiv uuid := gen_random_uuid();
begin
  insert into public.mandanten (name, slug) values ('Rollenhaus', 'rollen-x') returning id into v_m;
  insert into auth.users (id, email) values
    (v_owner, 'owner@rollen.example'), (v_support, 'support@rollen.example'),
    (v_chef, 'chef@rollen.example'), (v_inaktiv, 'alt@rollen.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (v_owner, 'Owner', 'owner@rollen.example', 'chef', v_m),
    (v_support, 'Support', 'support@rollen.example', 'mitarbeiter', v_m),
    (v_chef, 'Chef', 'chef@rollen.example', 'chef', v_m),
    (v_inaktiv, 'Alt', 'alt@rollen.example', 'mitarbeiter', v_m);
  insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz) values
    (v_owner, 'owner', true, 'Pruefung'), (v_support, 'support', true, 'Pruefung'),
    (v_inaktiv, 'admin', false, 'Pruefung');
  insert into public.plattform_tarife (schluessel, name, preis_monat_cent, preis_jahr_cent)
    values ('rollen_tarif', 'Rollentarif', 1000, 10000)
    on conflict (schluessel) do update set preis_monat_cent = 1000;
  -- Ohne benutzer_id: der Eintrag ist unloeschbar (so soll es sein), und ein
  -- Verweis auf den Pruef-Owner wuerde beim Aufraeumen per ON DELETE SET
  -- NULL ein UPDATE ausloesen — das der Schutz-Trigger zu Recht verweigert.
  insert into public.plattform_protokoll (benutzer_id, aktion, gegenstand, einzelheiten, rolle, begruendung)
    values (null, 'pruefung', 'rollen', '{}'::jsonb, 'owner', 'Pruefung');
  insert into wer values ('owner', v_owner), ('support', v_support), ('chef', v_chef), ('inaktiv', v_inaktiv);
end $$;

-- --- 1. support darf keine Preise aendern ----------------------------------
do $$
declare v uuid := (select wert from wer where was='support'); n int; r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  update public.plattform_tarife set preis_monat_cent = 1 where schluessel = 'rollen_tarif';
  get diagnostics n = row_count;
  select public.plattform_rolle() into r;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('plattform_rolle() nennt support', r = 'support', coalesce(r, 'null')),
    ('support aendert keinen Tarif', n = 0, n::text || ' Zeile(n) geaendert');
end $$;

-- --- 2. owner darf -----------------------------------------------------------
do $$
declare v uuid := (select wert from wer where was='owner'); n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  update public.plattform_tarife set preis_monat_cent = 1100 where schluessel = 'rollen_tarif';
  get diagnostics n = row_count;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('owner aendert den Tarif', n = 1, n::text || ' Zeile(n)');
end $$;

-- --- 3. deaktiviert heisst draussen ---------------------------------------
do $$
declare v uuid := (select wert from wer where was='inaktiv'); b boolean; r text; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select public.ist_plattform_admin(), public.plattform_rolle() into b, r;
  select count(*) into n from public.plattform_audit_log;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('deaktivierter Betreiber ist keiner mehr', b = false and r is null, coalesce(r, 'null')),
    ('…und liest das Audit-Log nicht', n = 0, n::text || ' Zeile(n)');
end $$;

-- --- 4. chef sieht nichts ---------------------------------------------------
do $$
declare v uuid := (select wert from wer where was='chef'); n int; m int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select count(*) into n from public.plattform_audit_log;
  select count(*) into m from public.plattform_admins;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('chef liest das Audit-Log nicht', n = 0, n::text),
    ('chef sieht die Betreiberliste nicht', m = 0, m::text);
end $$;

-- --- 5. Audit-Log: weder aendern noch loeschen, auch nicht als owner --------
do $$
declare v uuid := (select wert from wer where was='owner'); ok1 boolean := false; ok2 boolean := false;
begin
  begin
    update public.plattform_protokoll set aktion = 'geschoent' where aktion = 'pruefung';
  exception when others then ok1 := sqlstate = '42501';
  end;
  begin
    delete from public.plattform_protokoll where aktion = 'pruefung';
  exception when others then ok2 := sqlstate = '42501';
  end;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Audit-Log: UPDATE wird verweigert (auch mit Dienstrecht)', ok1, ''),
    ('Audit-Log: DELETE wird verweigert (auch mit Dienstrecht)', ok2, '');
end $$;

-- --- 6. Der letzte Owner bleibt -------------------------------------------
do $$
declare v uuid := (select wert from wer where was='owner'); ok boolean := false; n int;
begin
  -- Es gibt in der Pruefdatenbank sonst keinen aktiven Owner.
  select count(*) into n from public.plattform_admins where rolle = 'owner' and aktiv and benutzer_id <> v;
  if n = 0 then
    begin
      update public.plattform_admins set rolle = 'support' where benutzer_id = v;
    exception when others then ok := sqlstate = '42501';
    end;
  else
    ok := true; -- andere Owner da; die Sperre greift erst beim letzten
  end if;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('der letzte aktive Owner laesst sich nicht herabstufen', ok, n::text || ' andere Owner');
end $$;

-- --- Aufraeumen -------------------------------------------------------------
-- Der Trigger schuetzt den letzten Owner auch vor dem Aufraeumen der
-- Pruefung — er kann nicht wissen, dass dieser Owner nur fuer die Probe da
-- war. Fuer das Aufraeumen wird er kurz abgeschaltet; die Pruefung selbst
-- (Nr. 6) hat ihn vorher mit eingeschaltetem Trigger vorgefuehrt.
alter table public.plattform_admins disable trigger plattform_admins_letzter_owner;
delete from public.plattform_tarife where schluessel = 'rollen_tarif';
delete from public.plattform_admins where benutzer_id in (select wert from wer where was in ('support','inaktiv'));
-- Den Owner erst nach dem Support loeschen, sonst greift die Owner-Sperre.
delete from public.plattform_admins where benutzer_id = (select wert from wer where was='owner');
delete from public.profiles where id in (select wert from wer where was <> 'x');
delete from auth.users where id in (select wert from wer);
delete from public.mandanten where slug = 'rollen-x';
alter table public.plattform_admins enable trigger plattform_admins_letzter_owner;

select nr, case when bestanden then 'ok' else 'FEHLER' end as ergebnis, pruefung, bemerkung from befund order by nr;
do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then raise exception 'Betreiberrollen: % Pruefung(en) nicht bestanden.', n; end if;
  raise notice 'Betreiberrollen: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
