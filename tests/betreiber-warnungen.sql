-- Betreiberbereich, Schritt 10 (fork_79): Warnregeln, Tageszusammenfassung,
-- Demo-Daten.
--
--   * eine fehlgeschlagene Zahlung loest genau EINE Warnung aus (zweiter
--     Lauf: nichts Neues); eine abgeschaltete Regel loest nichts aus
--   * eine Support-Anfrage mit Prioritaet hoch warnt
--   * die Tageskosten-Grenze warnt, wenn die Summe sie ueberschreitet
--   * die Zusammenfassung traegt die vereinbarten Felder
--   * Demo: 30 Mandanten mit ist_demo, MRR des Dashboards = manuelle Summe
--     der Demo-Abos (Jahresabos / 12, Gruenderrabatt, Zusatznutzer), Warnregeln
--     lassen Demo aus, Entfernen nimmt alles mit (Ledger, Rechnungen,
--     Kennzahlen, Nutzer), Verbrauch und Kosten ueber 12 Monate
\set ON_ERROR_STOP on
create temporary table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temporary table wer (was text, wert uuid);

do $$
declare v_a uuid; k text := substr(gen_random_uuid()::text, 1, 8);
begin
  insert into public.mandanten (name, slug, abo_status) values ('Warn-Haus', 'bw-a-' || k, 'aktiv') returning id into v_a;
  insert into public.mandant_abo (mandant_id, tarif, intervall, status, zahlung_fehler_seit) values (v_a, 'starter', 'monat', 'zahlung_offen', now() - interval '2 days');
  insert into wer values ('a', v_a);
end $$;

-- --- 1. Warnregeln -------------------------------------------------------------
do $$
declare v_a uuid := (select wert from wer where was='a'); n1 int; n2 int; n3 int; n4 int; n5 int; v_id uuid;
begin
  delete from public.plattform_warnungen where mandant_id = v_a;
  select count(*) into n1 from public.plattform_warnungen_pruefen() where mandant_id = v_a and regel = 'zahlung_fehlgeschlagen';
  select count(*) into n2 from public.plattform_warnungen_pruefen() where mandant_id = v_a and regel = 'zahlung_fehlgeschlagen';
  -- Regel aus: eine neue fehlgeschlagene Zahlung (anderes Datum) loest nichts aus
  update public.plattform_warnregeln set aktiv = false where schluessel = 'zahlung_fehlgeschlagen';
  update public.mandant_abo set zahlung_fehler_seit = now() - interval '1 day' where mandant_id = v_a;
  select count(*) into n3 from public.plattform_warnungen_pruefen() where mandant_id = v_a and regel = 'zahlung_fehlgeschlagen';
  update public.plattform_warnregeln set aktiv = true where schluessel = 'zahlung_fehlgeschlagen';
  -- Support hoch
  insert into public.support_anfragen (mandant_id, betreff, text, kategorie, prioritaet, status) values (v_a, 'Nichts geht', 'Hilfe', 'fehler', 'hoch', 'offen') returning id into v_id;
  select count(*) into n4 from public.plattform_warnungen_pruefen() where regel = 'support_hoch' and eindeutig = 'support:' || v_id;
  -- Tageskosten gesamt: Grenze 0,01 EUR, eine Buchung mit 0,05 EUR heute
  update public.plattform_werte set wert = '0.01'::jsonb where schluessel = 'alarm_kosten_tag_eur';
  insert into public.credit_buchungen (vorgang_id, mandant_id, aktion, credits, quelle, status, ki_kosten_eur) values (gen_random_uuid(), v_a, 'ki_text', 2, 'tarif', 'gebucht', 0.05);
  select count(*) into n5 from public.plattform_warnungen_pruefen() where regel = 'tageskosten_gesamt';
  update public.plattform_werte set wert = '50'::jsonb where schluessel = 'alarm_kosten_tag_eur';
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Fehlgeschlagene Zahlung loest eine Warnung aus', n1 = 1, n1::text),
    ('…und beim zweiten Lauf keine zweite', n2 = 0, n2::text),
    ('Abgeschaltete Regel loest nichts aus', n3 = 0, n3::text),
    ('Support-Anfrage mit Prioritaet hoch warnt', n4 = 1, n4::text),
    ('Tageskosten ueber Grenze warnen', n5 >= 1, n5::text);
end $$;

-- --- 2. Zusammenfassung -----------------------------------------------------------
do $$
declare z jsonb;
begin
  select public.plattform_tageszusammenfassung() into z;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Zusammenfassung traegt MRR, Neu/Kuendigungen, Tests, Kosten, Probleme',
     z ? 'mrr_cent' and z ? 'neu_gestern' and z ? 'kuendigungen_gestern' and z ? 'tests_endend_3t' and z ? 'ki_kosten_gestern_eur' and (z->'probleme') ? 'zahlung_offen',
     left(z::text, 120));
end $$;

-- --- 3. Demo-Daten -------------------------------------------------------------------
do $$
declare n int; n_demo int; mrr_fn bigint; mrr_hand bigint; n_warn int; n_jahr int; n_monate int; n_rech int; n_rest int; n_buch int;
begin
  select public.plattform_demo_anlegen() into n;
  select count(*) into n_demo from public.mandanten where ist_demo;
  select coalesce(sum(x.mrr_cent), 0) into mrr_fn from public.plattform_mrr_je_mandant() x join public.mandanten m on m.id = x.mandant_id where m.ist_demo;
  -- Von Hand: Monatspreis bzw. Jahrespreis / 12, plus Zusatznutzer, minus Gruenderrabatt (nur Gruendertarif), nur zahlende.
  select coalesce(sum(
           case a.intervall when 'jahr' then t.preis_jahr_cent / 12 else t.preis_monat_cent end
           + a.zusatznutzer * (select case a.intervall when 'jahr' then preis_jahr_cent / 12 else preis_monat_cent end from public.plattform_tarife where ist_zusatznutzer limit 1)
           - case when a.gruenderpreis and a.tarif = coalesce((select wert #>> '{}' from public.plattform_werte where schluessel = 'gruender_tarif'), 'starter')
                  then coalesce((select (wert::text)::int from public.plattform_werte where schluessel = 'gruender_rabatt_cent'), 0) else 0 end), 0)
    into mrr_hand
    from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id join public.plattform_tarife t on t.schluessel = a.tarif
   where m.ist_demo and (a.status = 'aktiv' or (a.status = 'gekuendigt' and (a.cancel_at is null or a.cancel_at > now())));
  select count(*) into n_jahr from public.mandant_abo a join public.mandanten m on m.id = a.mandant_id where m.ist_demo and a.intervall = 'jahr';
  select count(*) into n_warn from public.plattform_warnungen_pruefen() w join public.mandanten m on m.id = w.mandant_id where m.ist_demo;
  select count(distinct date_trunc('month', b.zeitpunkt)) into n_monate from public.credit_buchungen b join public.mandanten m on m.id = b.mandant_id where m.ist_demo;
  select count(*) into n_rech from public.stripe_rechnungen where id like 'in_demo_%';
  insert into befund (pruefung, bestanden, bemerkung) values
    ('30 Demo-Mandanten mit ist_demo', n = 30 and n_demo = 30, n_demo::text),
    ('MRR des Dashboards = manuelle Summe der Demo-Abos (Rundung Jahrespreis/12 je Jahresabo)', abs(mrr_fn - mrr_hand) <= n_jahr, mrr_fn || ' vs ' || mrr_hand),
    ('Warnregeln lassen Demo-Mandanten aus', n_warn = 0, n_warn::text),
    ('Verbrauch und Kosten ueber 12 Monate', n_monate >= 12, n_monate::text),
    ('Rechnungen je Monat fuer zahlende Demo-Haeuser', n_rech > 100, n_rech::text),
    ('Doppeltes Anlegen wird abgewiesen', (select count(*) from (select 1 where false) x) = 0, '');
  begin perform public.plattform_demo_anlegen(); update befund set bestanden = false where pruefung = 'Doppeltes Anlegen wird abgewiesen';
  exception when others then null; end;
  select public.plattform_demo_entfernen() into n;
  select count(*) into n_rest from public.mandanten where ist_demo;
  select count(*) into n_buch from public.credit_buchungen b where not exists (select 1 from public.mandanten m where m.id = b.mandant_id);
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Entfernen nimmt alle 30 mit', n = 30 and n_rest = 0, n_rest::text),
    ('…samt Ledger, Rechnungen, Kennzahlen und Nutzern',
     n_buch = 0 and (select count(*) from public.stripe_rechnungen where id like 'in_demo_%') = 0
       and (select count(*) from public.plattform_kennzahlen_tag where ist_demo) = 0
       and (select count(*) from auth.users where email like 'chef@demo-%') = 0, '');
end $$;

-- --- Aufraeumen und Urteil ---------------------------------------------------
delete from public.plattform_warnungen where regel in ('support_hoch', 'tageskosten_gesamt') or mandant_id = (select wert from wer where was = 'a');
-- Ledger und Mandant bleiben (append-only).

select nr, case when bestanden is true then 'ok  ' else 'FEHL' end as stand, pruefung, bemerkung from befund order by nr;
do $$
declare n int; liste text;
begin
  select count(*), string_agg(pruefung, '; ') into n, liste from befund where bestanden is not true;
  if n > 0 then raise exception 'Betreiber-Warnungen: % nicht bestanden — %', n, liste; end if;
end $$;
