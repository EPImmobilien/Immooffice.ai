#!/usr/bin/env python3
"""Erzeugt aus dem woertlichen Schema-Export der Vorlage die Migrationen des Forks.

Warum ein Skript und nicht Handarbeit: die Ersetzungen sind damit vollstaendig
nachlesbar, wiederholbar und einzeln begruendet. Wer wissen will, was der Fork
gegenueber der Vorlage aendert, liest diese Datei — nicht einen Diff von 460 kB.

Eingabe:  reference/schema/*.sql   (nicht versioniert, byte-genau geprueft)
Ausgabe:  supabase/migrations/20260915*.sql

Jede Ersetzung fuellt genau einen der drei Gruende:
  MARKE    Kennzeichen des Referenzunternehmens — darf nirgends erscheinen.
  FREMD    Verweis auf das fremde Supabase-Projekt — muss auf das eigene zeigen.
  PHASE14  in Phase 1.4 des Auftrags ersatzlos gestrichen.
Alles andere bleibt, wie es ist (Phase 9: keine Verhaltensaenderung).
"""
import pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'reference' / 'schema'
ZIEL = WURZEL / 'supabase' / 'migrations'

# ---------------------------------------------------------------- Ersetzungen
# (Grund, alt, neu, Bemerkung)
ERSETZUNGEN = [
    # --- MARKE: Stammdaten der Referenz stehen als Spalten-Standardwerte drin.
    ('MARKE', "firma_name text default 'E&P Immobilien GmbH'::text not null",
     "firma_name text default 'Musterhaus Immobilien GmbH'::text not null",
     'Platzhalter statt Firmenname; der Mandant setzt ihn bei der Anmeldung.'),
    ('MARKE', "strasse text default 'Am Voegenteich 26r'::text", "strasse text",
     'Anschrift ohne Standardwert — es gibt keine sinnvolle Vorbelegung.'),
    ('MARKE', "plz text default '18055'::text", "plz text", 'wie Anschrift'),
    ('MARKE', "ort text default 'Rostock'::text,\n  land", "ort text,\n  land", 'wie Anschrift'),
    ('MARKE', "email text default 'info@engferundpartner.de'::text", "email text",
     'E-Mail-Adresse der Referenz'),
    ('MARKE', "registergericht text default 'Rostock'::text", "registergericht text",
     'Registergericht der Referenz'),
    ('MARKE', "hrb text default 'HRB16598'::text", "hrb text", 'Handelsregisternummer der Referenz'),
    ('MARKE', "geschaeftsfuehrer text default 'Lasse Engfer'::text", "geschaeftsfuehrer text",
     'Name einer Person'),
    ('MARKE', "steuernummer text default '079/108/00900'::text", "steuernummer text",
     'Steuernummer der Referenz'),
    ('MARKE', "ust_id text default 'DE370100078'::text", "ust_id text",
     'Umsatzsteuer-Identifikationsnummer der Referenz'),
    ('MARKE', "bank_name text default 'Olinda Zweigniederlassung Deutschland'::text", "bank_name text",
     'Bankverbindung der Referenz'),
    ('MARKE', "bank_iban text default 'DE74100101236085969429'::text", "bank_iban text",
     'IBAN der Referenz — es wird keine erfundene eingesetzt'),
    ('MARKE', "bank_bic text default 'QNTODEB2XXX'::text", "bank_bic text", 'BIC der Referenz'),
    ('MARKE', "|| 'Engfer & Partner Immobilien'::text)", "|| 'Musterhaus Immobilien GmbH'::text)",
     'Grussformel der Rechnungsvorlage'),
    ('MARKE', "firmen_adresse text default 'Am Vögenteich 26r, 18055 Rostock'::text not null",
     "firmen_adresse text default ''::text not null", 'Anschrift im Kostensatz'),
    ('MARKE', 'firmen_koordinaten jsonb default \'{"lat": 54.0854705, "lon": 12.1265103}\'::jsonb not null',
     "firmen_koordinaten jsonb default '{}'::jsonb not null",
     'Koordinaten des Bueros der Referenz'),
    ('MARKE', "mitarbeiter text default 'olaf'::text not null", "mitarbeiter text default ''::text not null",
     'Vorname eines Mitarbeiters der Referenz'),
    ('MARKE', "standort text default 'rostock'::text", "standort text",
     'Standort der Referenz (Vertraege, Objektnachweise)'),
    ('MARKE', "ort_unterzeichnung text default 'Rostock'::text", "ort_unterzeichnung text",
     'Unterzeichnungsort der Referenz'),
    # --- MARKE in Funktionskoerpern
    ('MARKE',
     "elsif new.absender_email ~* '@engferundpartner\\.(de|com)$' and coalesce(new.betreff,'') ~* '^\\s*(wg|fwd?|weiterleitung|tr)\\s*:' then",
     "elsif new.absender_email ~* ('@' || coalesce((select nullif(split_part(email, '@', 2), '')\n"
     "                                                from public.firma_stammdaten\n"
     "                                               where typ = 'standort' and coalesce(aktiv, true)\n"
     "                                               order by sortierung, firma_name limit 1),\n"
     "                                             'kein.eigener.absender.invalid') || '$')\n"
     "        and coalesce(new.betreff,'') ~* '^\\s*(wg|fwd?|weiterleitung|tr)\\s*:' then",
     'Die eigene Maildomain statt der fest verdrahteten Domain der Referenz. '
     'Gleiche Absicht — interne Weiterleitungen erkennen —, nur mandantenfaehig.'),
    ('MARKE',
     "v_url := case when z.aid is not null then 'https://www.kleinanzeigen.de/s-anzeige/openimmo-engferimmo/' || z.aid else null end;",
     "v_url := case when z.aid is not null then 'https://www.kleinanzeigen.de/s-anzeige/'\n"
     "               || coalesce((select nullif(btrim(anbieter_nr), '') from public.portal_zugaenge\n"
     "                             where portal = 'kleinanzeigen' limit 1), 'openimmo')\n"
     "               || '/' || z.aid else null end;",
     'Der Anzeigen-Pfad der Referenz wird durch die Anbieter-Nummer des Mandanten ersetzt.'),
    ('MARKE',
     "    SELECT id INTO v_firma_id FROM public.firma_stammdaten\n    WHERE firma_name = 'E&P Immobilien GmbH' LIMIT 1;",
     "    SELECT id INTO v_firma_id FROM public.firma_stammdaten\n"
     "    WHERE typ = 'standort' AND coalesce(aktiv, true)\n"
     "    ORDER BY sortierung, firma_name LIMIT 1;",
     'Hauptstandort statt Firmenname — trifft die Absicht und nennt keine Marke.'),
    # --- FREMD: Aufrufe auf das Projekt der Vorlage
    ('FREMD',
     "    url     := 'https://yazwkzzjiquprtjpurur.supabase.co/functions/v1/push-senden',",
     "    url     := public.eigene_funktions_url('push-senden'),",
     'Projekt-URL aus dem Vault statt fest verdrahtetem fremden Projekt.'),
    ('FREMD',
     "      url     := 'https://yazwkzzjiquprtjpurur.supabase.co/functions/v1/push-senden',",
     "      url     := public.eigene_funktions_url('push-senden'),",
     'wie oben, andere Einrueckung'),
    ('FREMD',
     "        url := 'https://yazwkzzjiquprtjpurur.supabase.co/functions/v1/push-senden',",
     "        url := public.eigene_funktions_url('push-senden'),",
     'wie oben, andere Einrueckung'),
]

# Storage-Richtlinien und Buckets, die Phase 1.4 streicht (Shop-TV / Digital Signage)
PHASE14_STORAGE = ['shop_tv_delete_auth', 'shop_tv_insert_auth', 'shop_tv_read_public',
                   'shop_tv_update_auth']

KOPF = """-- {titel}
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: {quellen}
{zusatz}
"""


def neutralisieren(text, protokoll):
    for grund, alt, neu, bemerkung in ERSETZUNGEN:
        if alt in text:
            n = text.count(alt)
            text = text.replace(alt, neu)
            protokoll.append((grund, n, bemerkung))
    return text


def lese(*namen):
    teile = []
    for n in namen:
        p = QUELLE / n
        if not p.exists():
            sys.exit(f'fehlt: {p}')
        teile.append(p.read_text(encoding='utf-8').rstrip('\n'))
    return '\n'.join(teile) + '\n'


def schreibe(datei, titel, quellen, inhalt, zusatz=''):
    ZIEL.mkdir(parents=True, exist_ok=True)
    kopf = KOPF.format(titel=titel, quellen=', '.join(quellen),
                       zusatz=('--\n' + zusatz.rstrip('\n') + '\n') if zusatz else '')
    (ZIEL / datei).write_text(kopf + '\n' + inhalt, encoding='utf-8')
    return len(kopf) + 1 + len(inhalt)


def main():
    protokoll = []

    # 1) Tabellen und Sequenzen
    #
    # Die Sequenzen muessen vor den Tabellen stehen (die Spalten-Standardwerte
    # rufen nextval auf), die Besitzangabe aber danach (sie nennt die Tabelle).
    # Deshalb wird die Sequenzdatei in zwei Haelften geteilt.
    seq = lese('05-sequenzen.sql').split('\n')
    seq_anlegen = '\n'.join(z for z in seq if z.startswith('create sequence'))
    seq_besitz = '\n'.join(z for z in seq if z.startswith('alter sequence'))
    inhalt = (seq_anlegen + '\n\n'
              + lese('10-tabellen-01.sql', '10-tabellen-02.sql', '10-tabellen-03.sql',
                     '10-tabellen-04.sql', '10-tabellen-05.sql', '10-tabellen-06.sql')
              + '\n' + seq_besitz + '\n')
    inhalt = neutralisieren(inhalt, protokoll)
    schreibe('20260915000100_vorlage_tabellen.sql', 'Tabellen und Sequenzen der Vorlage',
             ['reference/schema/05-sequenzen.sql', '10-tabellen-01..06.sql'], inhalt,
             '-- 167 Tabellen, 5 Sequenzen. Die Standardwerte mit Firmenangaben der\n'
             '-- Vorlage sind entfernt oder durch Platzhalter ersetzt — siehe\n'
             '-- scripts/neutralisieren.py, Abschnitt MARKE.')

    # 2) Schluessel, Pruefbedingungen, Fremdschluessel
    inhalt = lese('20-schluessel.sql', '22-pruefbedingungen.sql', '25-fremdschluessel.sql')
    inhalt = neutralisieren(inhalt, protokoll)
    schreibe('20260915000200_vorlage_schluessel.sql',
             'Schluessel, Pruefbedingungen und Fremdschluessel der Vorlage',
             ['20-schluessel.sql', '22-pruefbedingungen.sql', '25-fremdschluessel.sql'], inhalt,
             '-- 211 Schluessel, 94 Pruefbedingungen, 273 Fremdschluessel.')

    # 3) Indizes
    inhalt = neutralisieren(lese('28-indizes.sql'), protokoll)
    schreibe('20260915000300_vorlage_indizes.sql', 'Indizes der Vorlage',
             ['28-indizes.sql'], inhalt, '-- 243 Indizes ohne die, die an einem Constraint haengen.')

    # 4) Funktionen
    hilfe = """-- Hilfsfunktion des Forks, nicht aus der Vorlage.
--
-- In der Vorlage steht die Projekt-URL in jedem net.http_post fest im Code.
-- Fuer den Fork liest sie diese Funktion aus dem Vault. Damit steht kein
-- Projektverweis im Repository, und ein Umzug des Projekts kostet einen
-- Vault-Eintrag statt eine Migration.
create or replace function public.eigene_funktions_url(name text)
returns text language sql stable security definer set search_path to ''
as $function$
  select rtrim(coalesce(
           (select decrypted_secret from vault.decrypted_secrets where name = 'projekt_url'),
           ''), '/') || '/functions/v1/' || name;
$function$;

"""
    inhalt = lese(*[f'30-funktionen-0{i}.sql' for i in range(1, 7)])
    inhalt = neutralisieren(inhalt, protokoll)
    schreibe('20260915000400_vorlage_funktionen.sql', 'Funktionen der Vorlage',
             ['30-funktionen-01..06.sql'],
             'set check_function_bodies = off;\n\n' + hilfe + inhalt,
             '-- 84 Funktionen, woertlich uebernommen; die drei Stellen mit Marken- oder\n'
             '-- Projektverweis sind ersetzt (siehe scripts/neutralisieren.py).\n'
             '-- check_function_bodies ist aus, weil sich die Funktionen gegenseitig\n'
             '-- aufrufen und alphabetische Reihenfolge das nicht garantiert — genau so\n'
             '-- macht es auch pg_dump.')

    # 5) Sichten
    inhalt = neutralisieren(lese('35-sichten.sql'), protokoll)
    schreibe('20260915000500_vorlage_sichten.sql', 'Sichten der Vorlage',
             ['35-sichten.sql'], inhalt, '-- 4 Sichten.')

    # 6) Trigger
    inhalt = neutralisieren(lese('40-trigger.sql'), protokoll)
    schreibe('20260915000600_vorlage_trigger.sql', 'Trigger der Vorlage',
             ['40-trigger.sql'], inhalt, '-- 54 Trigger.')

    # 7) RLS und Rechte
    inhalt = neutralisieren(lese('45-rls-und-rechte.sql'), protokoll)
    schreibe('20260915000700_vorlage_rls_und_rechte.sql',
             'Row-Level-Security und Tabellenrechte der Vorlage',
             ['45-rls-und-rechte.sql'], inhalt,
             '-- RLS fuer 166 Tabellen. Die 167. — suchkriterien_lauf — hat in der\n'
             '-- Vorlage kein RLS; hier ist die Zeile auskommentiert und als Befund\n'
             '-- gekennzeichnet, weil das Einschalten ohne passende Richtlinie jeden\n'
             '-- Zugriff sperrt. Entscheidung dazu steht in docs/STATUS.md, Abschnitt 6.')

    # 8) Richtlinien
    inhalt = lese(*[f'50-richtlinien-0{i}.sql' for i in range(1, 5)])
    inhalt = neutralisieren(inhalt, protokoll)
    schreibe('20260915000800_vorlage_richtlinien.sql', 'Richtlinien der Vorlage',
             ['50-richtlinien-01..04.sql'], inhalt,
             '-- 320 Richtlinien, unveraendert uebernommen. Das bekannte Loch bei\n'
             '-- signatur_* (jeder Angemeldete liest fremde Token) ist hier bewusst\n'
             '-- NICHT geflickt: der Fork soll zuerst nachweisbar dasselbe tun wie die\n'
             '-- Vorlage. Geschlossen wird es in Phase 2.3, wie im Auftrag verlangt.')

    # 9) Storage
    inhalt = lese('60-storage.sql')
    inhalt = neutralisieren(inhalt, protokoll)
    # Schrift-Buckets zusammenlegen
    for alt in ["  ('Marcellus regular', 'Marcellus regular', false, null, null),\n",
                "  ('Montserrat bold', 'Montserrat bold', false, null, null),\n",
                "  ('Montserrat regular', 'Montserrat regular', false, null, null),\n"]:
        if alt in inhalt:
            inhalt = inhalt.replace(alt, '')
            protokoll.append(('AUFRAEUMEN', 1,
                              'Schrift-Bucket mit Leerzeichen im Namen entfernt — ersetzt durch "schriften".'))
    inhalt = inhalt.replace("  ('marketing', 'marketing', false, null, null),\n",
                            "  ('marketing', 'marketing', false, null, null),\n"
                            "  ('schriften', 'schriften', false, null, null),\n")
    # Shop-TV streichen (Phase 1.4)
    inhalt = inhalt.replace("  ('shop-tv', 'shop-tv', true, null, null),\n", '')
    protokoll.append(('PHASE14', 1, 'Bucket shop-tv entfernt (Digital Signage entfaellt).'))
    zeilen, ueberspringen = [], 0
    for zeile in inhalt.split('\n'):
        if ueberspringen > 0 and not zeile.startswith('create policy'):
            continue
        ueberspringen = 0
        if zeile.startswith('create policy') and any(f'policy {n} ' in zeile for n in PHASE14_STORAGE):
            ueberspringen = 1
            continue
        zeilen.append(zeile)
    inhalt = '\n'.join(zeilen)
    protokoll.append(('PHASE14', len(PHASE14_STORAGE), 'Storage-Richtlinien fuer shop-tv entfernt.'))
    schreibe('20260915000900_vorlage_storage.sql', 'Buckets und Storage-Richtlinien der Vorlage',
             ['60-storage.sql'], inhalt,
             '-- 25 Buckets der Vorlage werden 22: die drei Schrift-Buckets mit\n'
             '-- Leerzeichen im Namen sind zu "schriften" zusammengelegt, shop-tv\n'
             '-- entfaellt nach Phase 1.4 samt seiner vier Richtlinien.')

    # 10) Cron
    inhalt = lese('70-cron.sql')
    inhalt = inhalt.replace("'https://<PROJEKT>.supabase.co/functions/v1/", "public.eigene_funktions_url('")
    inhalt = re.sub(r"eigene_funktions_url\('([a-z0-9-]+)'", lambda m: f"eigene_funktions_url('{m.group(1)}')", inhalt)
    inhalt = inhalt.replace("')',", "'),")
    inhalt = inhalt.replace("'Bearer <ANON_KEY>'",
                            "'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'), '')")
    protokoll.append(('FREMD', 1, 'Cron: Projekt-URL und anon-Key aus dem Vault statt im Klartext im Job.'))
    schreibe('20260915001000_vorlage_cron.sql', 'Cron-Jobs der Vorlage',
             ['70-cron.sql'], inhalt,
             '-- 33 Jobs (jotform-sync entfaellt nach Phase 1.4). Projekt-URL und\n'
             '-- anon-Key kommen aus dem Vault — in der Vorlage stehen sie im Klartext\n'
             '-- im Job-Kommando, und ein Schluessel im Repository ist nicht zulaessig.\n'
             '-- Die Jobs laufen zunaechst fuer eine Firma, wie in der Vorlage. Die\n'
             '-- Iteration ueber alle Firmen ist Aufgabe von Phase 2.4.')

    print('Neutralisierung:')
    for grund, n, bemerkung in protokoll:
        print(f'  [{grund:10s}] {n}x  {bemerkung}')
    print(f'\n{len(list(ZIEL.glob("20260915*.sql")))} Migrationen geschrieben nach {ZIEL}')


if __name__ == '__main__':
    main()
