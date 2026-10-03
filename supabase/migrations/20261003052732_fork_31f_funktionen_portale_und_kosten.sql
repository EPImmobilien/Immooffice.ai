-- ===========================================================================
-- Fork-eigene Migration 31f — die zwei Datenbankfunktionen der Oberflaeche
--
-- Die neue Oberflaeche ruft zwei Funktionen, die es im Fork nicht gab. Die
-- Vorlage liefert ihre Fassungen nicht mit (nur die Oberflaeche ist
-- exportiert), also stehen sie hier — abgeleitet aus der Art, wie die
-- Oberflaeche ihr Ergebnis benutzt.
-- ===========================================================================

-- portale_liste(): die Portalnamen fuer die Vermarktungskanaele am Objekt.
--
-- WARUM EINE FUNKTION UND NICHT DIE TABELLE: portal_zugaenge traegt
-- FTP-Server, Benutzer und Passwort. Die Kanalliste am Objekt braucht nur
-- Name und Zustand, und sie wird von JEDEM Mitarbeiter gelesen. Eine
-- Funktion mit security definer gibt genau drei Felder heraus — die
-- Zugangsdaten bleiben beim Chef (vgl. die Richtlinie aus fork_31c).
--
-- Der Mandantenfilter steht IN DER ABFRAGE, nicht in RLS: security definer
-- umgeht die Richtlinien, also muss die Grenze hier stehen.
create or replace function public.portale_liste()
returns table (portal text, bezeichnung text, aktiv boolean)
language sql security definer set search_path = public stable as $$
  select z.portal, z.bezeichnung, z.aktiv
    from public.portal_zugaenge z
   where z.mandant_id = public.aktuelle_mandant_id()
   order by z.portal
$$;
revoke all on function public.portale_liste() from public;
grant execute on function public.portale_liste() to authenticated;
comment on function public.portale_liste() is
  'Portalname, Bezeichnung und Zustand des eigenen Mandanten - ohne die '
  'FTP-Zugangsdaten aus portal_zugaenge. security definer, damit ein '
  'Mitarbeiter die Kanalliste am Objekt sieht, ohne an die Passwoerter zu '
  'kommen; der Mandantenfilter steht in der Abfrage, weil definer RLS umgeht.';

-- admin_kosten_messwerte(): Mengen der letzten 30 Tage je Messgroesse, als
-- JSON-Objekt {messgroesse: menge}. Die Oberflaeche multipliziert sie mit
-- preis_je_einheit aus kosten_posten.
--
-- WELCHE SCHLUESSEL ES GIBT, STEHT HIER UND NIRGENDS SONST. Die Vorlage
-- liefert ihre Fassung nicht mit; messgroesse ist in der Oberflaeche ein
-- freies Textfeld, und der Vorgabewert beim Anlegen eines Nutzungspostens
-- ist 'mail_eingang'. Die Liste sind deshalb die Vorgaenge, die dieser Fork
-- wirklich zaehlen kann. Kommt ein Posten mit einer unbekannten
-- Messgroesse, liest die Oberflaeche 0 — kein Fehler, nur keine Menge.
create or replace function public.admin_kosten_messwerte()
returns jsonb
language sql security definer set search_path = public stable as $$
  with m as (select public.aktuelle_mandant_id() as mandant,
                    now() - interval '30 days'   as seit)
  select jsonb_build_object(
    'mail_eingang',    (select count(*) from public.mail_eingang e, m
                         where e.mandant_id = m.mandant and e.gesendet_am >= m.seit),
    'mail_versendet',  (select count(*) from public.mail_versendet v, m
                         where v.mandant_id = m.mandant and v.gesendet_am >= m.seit),
    'expose_pdf',      (select count(*) from public.expose_freigaben f, m
                         where f.mandant_id = m.mandant and f.created_at >= m.seit),
    'ki_bild',         (select count(*) from public.ki_bildbearbeitung_log l, m
                         where l.mandant_id = m.mandant and l.created_at >= m.seit),
    'ki_pruefung',     (select count(*) from public.ki_pruefungen p, m
                         where p.mandant_id = m.mandant and p.created_at >= m.seit),
    'grundriss_ki',    (select count(*) from public.grundriss_ki_auftraege g, m
                         where g.mandant_id = m.mandant and g.created_at >= m.seit),
    'scan',            (select count(*) from public.scan_ablage s, m
                         where s.mandant_id = m.mandant and s.created_at >= m.seit),
    'unterlagen_link', (select count(*) from public.unterlagen_links u, m
                         where u.mandant_id = m.mandant and u.created_at >= m.seit),
    'termin',          (select count(*) from public.termine t, m
                         where t.mandant_id = m.mandant and t.created_at >= m.seit),
    'objekt',          (select count(*) from public.immobilien i, m
                         where i.mandant_id = m.mandant and i.created_at >= m.seit)
  )
$$;
revoke all on function public.admin_kosten_messwerte() from public;
grant execute on function public.admin_kosten_messwerte() to authenticated;
comment on function public.admin_kosten_messwerte() is
  'Mengen der letzten 30 Tage je Messgroesse, als JSON-Objekt, nur fuer den '
  'eigenen Mandanten. Die Oberflaeche multipliziert sie mit preis_je_einheit '
  'aus kosten_posten. Welche Schluessel es gibt, steht in dieser Funktion - '
  'die Vorlage liefert ihre Fassung nicht mit.';

-- --------------------------------------------------------------- Einstufung
-- Jede neue Tabelle wird eingestuft, sonst meldet
-- tests/mandant-einstufung.sql sie als unbekannt. Alle acht sind MANDANT:
-- sie tragen Fachdaten eines Maklerbueros, keine Plattformdaten und keine
-- reinen Dienstzeilen.
--
-- unterlagen_link_abrufe ist der Grenzfall — ein Protokoll. Es bleibt
-- trotzdem MANDANT und nicht DIENST: der Makler LIEST es in der Anwendung
-- (die Liste der Abrufe unter dem Link), also braucht es eine Richtlinie,
-- und die braucht einen Mandanten.
insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('aufmass_scan',           'MANDANT', 'Feinvermessung je Objekt (Stufe 123)'),
  ('grundriss_ki_auftraege', 'MANDANT', 'KI-Auftraege zum Grundriss (Stufe 118)'),
  ('kosten_posten',          'MANDANT', 'Kostenaufstellung des Bueros (Stufe 121), nur Chef'),
  ('punktwolke_diagnose',    'MANDANT', 'Diagnose zu einer Punktwolke (Stufe 124)'),
  ('scan_ablage',            'MANDANT', 'Scans und Punktwolken der App (Stufe 125)'),
  ('unterlagen_links',       'MANDANT', 'Download-Links auf Objektunterlagen (Stufe 114)'),
  ('transfer_dateien',       'MANDANT', 'Dateien eines Transfers ohne Objekt (Stufe 117)'),
  ('unterlagen_link_abrufe', 'MANDANT', 'Abrufprotokoll je Link; der Makler liest es')
on conflict (tabelle) do nothing;

-- ------------------------------------------- Mandant als Vorgabewert
-- Der Mandant kommt von der Anmeldung, nicht vom Aufrufer — die Regel aus
-- fork_22, und sie gilt fuer jede MANDANT-Tabelle.
--
-- tests/mandant-einstufung.sql hat die acht neuen Tabellen gemeldet, und das
-- war kein Formfehler: die Oberflaeche setzt mandant_id in KEINEM ihrer
-- inserts (scan_ablage.insert({art, titel, …}), punktwolke_diagnose.insert(…)
-- und so weiter). Ohne Vorgabewert waere jedes dieser inserts an "null value
-- in column mandant_id" gescheitert. Der Test hat also einen Funktionsfehler
-- gefunden, keine Unsauberkeit.
alter table public.aufmass_scan           alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.grundriss_ki_auftraege alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.kosten_posten          alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.punktwolke_diagnose    alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.scan_ablage            alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.unterlagen_links       alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.transfer_dateien       alter column mandant_id set default public.aktuelle_mandant_id();
alter table public.unterlagen_link_abrufe alter column mandant_id set default public.aktuelle_mandant_id();
