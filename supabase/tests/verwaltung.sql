-- ===========================================================================
-- Nachweis: Verwaltung — Profil/Kontingent-Schutz, Arbeitszeit (Modell,
-- Stempeluhr, Tage), Urlaub (Antrag, Entscheidung nur Verwaltung, Sicht),
-- Kennzahlen, Finanzierungsannahmen, Bewerber-Test (anon), Kuendigung,
-- globale Suche, Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111f1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cheff@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222f2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maklerf@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333f3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdf@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'Mandant VA', 'mandant-va'),
  ('bbbbbbbb-0000-0000-0000-0000000000f2', 'Mandant VB', 'mandant-vb');
insert into public.benutzer (id, mandant_id, name, email, rolle, eintritt, urlaubstage_jahr) values
  ('11111111-1111-1111-1111-1111111f1111', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'Chefin', 'cheff@test.invalid', 'inhaber', '2020-01-01', 30),
  ('22222222-2222-2222-2222-2222222f2222', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'Makler Max', 'maklerf@test.invalid', 'makler', '2024-03-15', 28),
  ('33333333-3333-3333-3333-3333333f3333', 'bbbbbbbb-0000-0000-0000-0000000000f2', 'Fremd', 'fremdf@test.invalid', 'inhaber', null, 30);
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung, status, vermarktungsart) values
  ('cccccccc-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'V-1', 'Suchhaus am See', 'aktiv', 'kauf'),
  ('cccccccc-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-0000000000f2', 'V-2', 'Suchhaus fremd', 'aktiv', 'kauf');

do $$
declare
  v_fehler text; v_n int; v_id uuid; v_j jsonb;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000f1';
  c_chef constant uuid := '11111111-1111-1111-1111-1111111f1111';
  c_makler constant uuid := '22222222-2222-2222-2222-2222222f2222';
  c_tok constant text := 'bewerbertoken0123456789abcdefabcd';
begin
  -- Makler: darf eigenes Profil, aber nicht sein Kontingent aendern
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222f2222","role":"authenticated"}';
  update public.benutzer set titel = 'Dipl.-Kfm.' where id = c_makler;
  select titel into v_fehler from public.benutzer where id = c_makler;
  insert into erg values (1,'Eigenes Profil (Titel) aenderbar','Dipl.-Kfm.',v_fehler,v_fehler='Dipl.-Kfm.');
  begin
    update public.benutzer set urlaubstage_jahr = 60 where id = c_makler;
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (2,'Eigenes Urlaubskontingent nicht aenderbar','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Stempeluhr
  v_j := public.stempeln(null);
  insert into erg values (3,'Erster Stempel = kommen','kommen',v_j->>'richtung',v_j->>'richtung'='kommen');
  v_j := public.stempeln('kommen');
  insert into erg values (4,'Doppeltes Kommen abgewiesen','doppelt',v_j->>'grund',v_j->>'grund'='doppelt');
  v_j := public.stempeln(null);
  insert into erg values (5,'Zweiter Stempel = gehen','gehen',v_j->>'richtung',v_j->>'richtung'='gehen');
  select count(*) into v_n from public.arbeitszeit_stempel where benutzer_id = c_makler;
  insert into erg values (6,'Zwei Stempel gespeichert','2',v_n::text,v_n=2);
  begin
    insert into public.arbeitszeit_modelle (mandant_id, benutzer_id, gueltig_ab) values (c_m1, c_makler, '2026-01-01');
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (7,'Makler legt kein Wochenmodell an','abgewiesen',v_fehler,v_fehler='abgewiesen');
  insert into public.arbeitszeit_tage (mandant_id, benutzer_id, datum, art, stunden, bemerkung, erfasst_von)
    values (c_m1, c_makler, '2026-09-01', 'arbeit', 7.5, 'Nachgetragen', c_makler);
  select count(*) into v_n from public.arbeitszeit_tage where benutzer_id = c_makler;
  insert into erg values (8,'Tag nachgetragen','1',v_n::text,v_n=1);

  -- Urlaub beantragen
  insert into public.urlaubsantraege (mandant_id, benutzer_id, von, bis, arbeitstage, bemerkung)
    values (c_m1, c_makler, '2026-10-05', '2026-10-09', 5, 'Herbstferien') returning id into v_id;
  begin
    update public.urlaubsantraege set status = 'genehmigt' where id = v_id;
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (9,'Makler genehmigt nicht selbst','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Verwaltung: Modell, Genehmigung, Kontingent, Kennzahlen
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111f1111","role":"authenticated"}';
  insert into public.arbeitszeit_modelle (mandant_id, benutzer_id, gueltig_ab, stunden_fr) values (c_m1, c_makler, '2026-01-01', 6);
  select count(*) into v_n from public.arbeitszeit_modelle where benutzer_id = c_makler;
  insert into erg values (10,'Verwaltung legt Wochenmodell an','1',v_n::text,v_n=1);
  update public.urlaubsantraege set status = 'genehmigt', antwort = 'Gerne.' where id = v_id;
  select status || '/' || (entschieden_von = c_chef)::text into v_fehler from public.urlaubsantraege where id = v_id;
  insert into erg values (11,'Verwaltung genehmigt, Entscheider vermerkt','genehmigt/true',v_fehler,v_fehler='genehmigt/true');
  update public.benutzer set urlaubstage_jahr = 30, urlaub_staffel = '{"2027": 32}'::jsonb where id = c_makler;
  select urlaubstage_jahr::text into v_fehler from public.benutzer where id = c_makler;
  insert into erg values (12,'Verwaltung aendert Kontingent','30.0',v_fehler,v_fehler='30.0');
  insert into public.firma_kennzahlen (mandant_id, jahr, objekte_vermittelt, erzielungsquote, fakten) values (c_m1, 2026, 42, 97.5, array['Seit 2005 am Markt']);
  begin
    insert into public.firma_kennzahlen (mandant_id, jahr) values (c_m1, 2026);
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (13,'Kennzahlen je Jahr eindeutig','abgewiesen',v_fehler,v_fehler='abgewiesen');
  insert into public.finanzierungs_annahmen (mandant_id, zinssatz, tilgung) values (c_m1, 3.9, 2.5);
  select zinssatz::text into v_fehler from public.finanzierungs_annahmen where mandant_id = c_m1;
  insert into erg values (14,'Finanzierungsannahmen gespeichert','3.90',v_fehler,v_fehler='3.90');

  -- Bewerber
  insert into public.bewerbungen (mandant_id, vorname, nachname, email, position, token_hash, erstellt_von)
    values (c_m1, 'Bea', 'Bewerber', 'bea@test.invalid', 'Makler/in', intern.portal_token_hash(c_tok), c_chef);
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  select count(*) into v_n from public.bewerbungen;
  insert into erg values (15,'anon sieht keine Einladungen','0',v_n::text,v_n=0);
  v_j := public.bewerbung_oeffnen(c_tok);
  insert into erg values (16,'Test ueber Token geoeffnet','ok',v_j->>'zustand',v_j->>'zustand'='ok');
  v_j := public.bewerbung_abgeben(c_tok, '{"r1":1}'::jsonb, 2, 22, 'kein_match', 'Danke');
  insert into erg values (17,'Test abgegeben','true',v_j->>'ok',(v_j->>'ok')::boolean);
  v_j := public.bewerbung_abgeben(c_tok, '{"r1":1}'::jsonb, 2, 22, 'kein_match', 'nochmal');
  insert into erg values (18,'Zweite Abgabe abgewiesen','fertig',v_j->>'grund',v_j->>'grund'='fertig');

  -- Suche und Kuendigung
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222f2222","role":"authenticated"}';
  v_j := public.global_suche('Suchhaus', 5);
  select count(*) into v_n from jsonb_array_elements(v_j);
  insert into erg values (19,'Suche findet nur eigenes Objekt','1',v_n::text,v_n=1);
  begin
    v_j := public.mandant_kuendigen('Test');
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (20,'Makler kuendigt nicht','abgewiesen',v_fehler,v_fehler='abgewiesen');
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111f1111","role":"authenticated"}';
  v_j := public.mandant_kuendigen('Wir schliessen.');
  select (loeschung_geplant_am is not null and gekuendigt_am is not null)::text into v_fehler from public.mandanten where id = c_m1;
  insert into erg values (21,'Inhaber kuendigt: Loeschung geplant','true',v_fehler,v_fehler='true');
  v_j := public.mandant_kuendigung_zuruecknehmen();
  select (gekuendigt_am is null)::text into v_fehler from public.mandanten where id = c_m1;
  insert into erg values (22,'Kuendigung zurueckgenommen','true',v_fehler,v_fehler='true');
  select count(*) into v_n from public.audit_log where aktion in ('mandant_gekuendigt', 'mandant_kuendigung_zurueckgenommen');
  insert into erg values (23,'Kuendigung im Audit-Log','2',v_n::text,v_n=2);

  -- Mandantentrennung
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333f3333","role":"authenticated"}';
  select count(*) into v_n from public.urlaubsantraege;
  insert into erg values (24,'Fremder Mandant sieht keine Urlaubsantraege','0',v_n::text,v_n=0);
  select count(*) into v_n from public.arbeitszeit_stempel;
  insert into erg values (25,'Fremder Mandant sieht keine Stempel','0',v_n::text,v_n=0);
  select count(*) into v_n from public.bewerbungen;
  insert into erg values (26,'Fremder Mandant sieht keine Bewerber','0',v_n::text,v_n=0);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
