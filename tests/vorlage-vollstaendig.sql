-- Ist die Vorlage vollstaendig uebernommen?
--
-- Die Zahlen rechts sind im Quellprojekt gemessen (Stand 26.09.2026). Der Test
-- vergleicht sie mit dem, was die Migrationen auf einer leeren Instanz
-- tatsaechlich erzeugen. Er sagt nichts darueber, ob das Verhalten stimmt —
-- nur, dass nichts auf dem Weg verloren gegangen ist. Das ist genau die Frage,
-- die bei einem Export ueber eine Textschnittstelle offen bleibt.
--
-- Abweichungen, die so gewollt sind:
--   Buckets 25 -> 22   drei Schrift-Buckets zu einem, shop-tv entfaellt
--   Storage-Richtlinien 63 -> 59   vier fuer shop-tv entfallen
--   Cron-Jobs 43 -> 42   jotform-sync entfaellt
--   Funktionen 103 -> 104  eigene_funktions_url kommt hinzu
--
-- Tabellen mit RLS ist von 166 auf 187 gestiegen: alle 20 neuen Tabellen haben
-- RLS, und der Befund suchkriterien_lauf ist in der Vorlage behoben.
--
-- Die zwanzig herausgezaehlten Storage-Richtlinien sind seit fork_10 ohnehin
-- geloescht — bis auf die vier des Buckets 'branding'. Die Liste bleibt
-- trotzdem stehen: sie macht den Test unabhaengig davon, ob er gegen eine
-- frisch migrierte Instanz oder gegen ein Projekt laeuft, in dem fork_10 noch
-- nicht angewendet ist.
--
-- Storage gehoert nicht zum Schema public und wandert beim Verschieben des
-- Altbestands nicht mit. Deshalb zaehlen die beiden Storage-Zeilen die fuenf
-- Buckets und zwanzig Richtlinien des Altbestands heraus — sonst wuerde der
-- Test bei einer Instanz mit Altbestand anders ausgehen als bei einer ohne.
-- Die Liste stand zuerst auf drei Buckets und dreizehn Richtlinien; beim
-- Abgleich gegen das laufende Projekt kamen 'branding' (vier Richtlinien) und
-- 'importe' (drei) dazu. Nicht zu verwechseln mit dem eigenen Bucket
-- 'branding-assets' der Vorlage, dessen Richtlinien branding_lesen,
-- branding_schreiben und branding_loeschen heissen.

\set ON_ERROR_STOP on
\pset pager off

-- AB PHASE 2 waechst der Fork ueber die Vorlage hinaus. Der Test bleibt
-- trotzdem scharf: er vergleicht nicht mehr gegen eine feste Zahl, sondern
-- gegen "Vorlage plus angemeldeter Zuwachs". Wer etwas hinzufuegt, traegt es
-- unten in `zuwachs` ein, mit Grund. Wer etwas verliert, faellt weiterhin auf.
--
-- Ohne diese Trennung haette der Test zwei schlechte Enden: entweder man hebt
-- die Zahl bei jeder Aenderung an, dann prueft er nichts mehr, oder man
-- schaltet ihn ab, dann erst recht nicht.

-- Einfacher und lesbarer als eine Prozedur: eine Tabelle mit Soll und Ist.
-- Sie wird EINMAL gebildet; Ausgabe und Abbruchbedingung lesen beide daraus.
-- Vorher standen die Zahlen zweimal in dieser Datei — in der Tabelle und
-- noch einmal hartcodiert im do-Block darunter. Am 28.09.2026 liefen die
-- beiden Fassungen auseinander: die Tabelle meldete fuenfzehnmal ok, der
-- do-Block brach trotzdem ab.
create temporary table pruefung as
with vorlage(bereich, soll) as (values
  ('Tabellen', 187), ('Sichten', 5), ('Sequenzen', 6),
  ('Funktionen', 104), ('Trigger', 64), ('Richtlinien', 344),
  ('Primaer- und Eindeutigkeitsschluessel', 232), ('Pruefbedingungen', 98),
  ('Fremdschluessel', 302), ('Indizes ohne Constraint', 266),
  ('Tabellen mit RLS', 187), ('Buckets', 22), ('Storage-Richtlinien', 59),
  ('Cron-Jobs', 42), ('Spalten', 2791)
),
-- Angemeldeter Zuwachs des Forks gegenueber der Vorlage.
zuwachs(bereich, mehr, grund) as (values
  -- Gemessen gegen das laufende Projekt nach fork_05. Eine Zeile je Kennzahl,
  -- damit sie nicht in Teilbetraegen auseinanderlaeuft; welche Migration was
  -- beigetragen hat, steht im Kopf der jeweiligen Datei.
  ('Tabellen', 3, 'mandanten, gesellschaften, mandanten_einstufung'),
  ('Tabellen mit RLS', 3, 'dieselben drei'),
  ('Richtlinien', 7, 'amt_vorlage 2, mandanten 2, gesellschaften 2, einstufung 1'),
  ('Richtlinien', 174, 'fork_07: eine restriktive Mandantentrennung je '
                       'MANDANT-Tabelle (171), dazu gesellschaften, '
                       'firma_stammdaten und profiles'),
  ('Funktionen', 1, 'aktuelle_mandant_id()'),
  ('Spalten', 199, 'mandanten 11, gesellschaften 10, mandanten_einstufung 3, '
                   'firma_stammdaten +mandant_id +gesellschaft_id +bundesland, '
                   'profiles +mandant_id, mandant_id auf 171 Mandantentabellen'),
  ('Fremdschluessel', 175, 'mandant_id -> mandanten auf 171 Tabellen, dazu '
                           'gesellschaften, firma_stammdaten (zweimal), profiles'),
  ('Primaer- und Eindeutigkeitsschluessel', 4,
     'drei Primaerschluessel, mandanten.slug eindeutig'),
  ('Pruefbedingungen', 3, 'mandanten.abo_status, bundesland, einstufung.gruppe'),
  ('Indizes ohne Constraint', 180, 'je ein Index auf mandant_id, dazu '
                                   'gesellschaft_id, bundesland, ein Standard'),
  -- fork_08: Ruestzeug fuer den Umzug der Storage-Pfade.
  ('Tabellen', 1, 'fork_08: storage_umzug_token'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'storage_umzug_token.token'),
  ('Spalten', 2, 'storage_umzug_token: token, erstellt_am'),
  ('Funktionen', 1, 'fork_08: storage_ohne_mandant()'),
  -- fork_09: die harte Grenze im Dateispeicher.
  ('Storage-Richtlinien', 1, 'fork_09: mandant_trennung, restriktiv'),
  -- fork_11: Abschnitt 1b, Sichtbarkeitsbereich und das Recht "Export".
  ('Spalten', 1, 'fork_11: profiles.sichtbarkeit'),
  ('Pruefbedingungen', 1, 'fork_11: profiles_sichtbarkeit_check'),
  ('Funktionen', 3, 'fork_11: sichtbare_mitarbeiter(), hat_recht(), '
                    'darf_exportieren()'),
  ('Richtlinien', 6, 'fork_11: sichtbarkeitsbereich auf den sechs Tabellen '
                     'mit zustaendig_id'),
  -- fork_12: eigene Vertragsvorlagen je Mandant.
  ('Tabellen', 1, 'fork_12: vertragsvorlagen'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Spalten', 12, 'vertragsvorlagen: zwoelf Spalten'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'vertragsvorlagen.id'),
  ('Pruefbedingungen', 1, 'vertragsvorlagen_art_check'),
  ('Fremdschluessel', 3, 'mandant_id, gesellschaft_id, hochgeladen_von'),
  ('Indizes ohne Constraint', 2, 'vertragsvorlagen: mandant_id und die Suche'),
  ('Richtlinien', 3, 'fork_12: lesen, pflegen, mandant_trennung'),
  ('Buckets', 1, 'fork_12: vertragsvorlagen'),
  ('Storage-Richtlinien', 2, 'fork_12: Datei lesen und pflegen'),
  -- fork_13: Mandanten-CI an firma_stammdaten.
  ('Spalten', 3, 'fork_13: ci_primaer, ci_akzent, ci_font'),
  ('Pruefbedingungen', 1, 'firma_stammdaten_ci_farben_check'),
  -- fork_14: die Mandantengrenze in den Funktionen.
  ('Funktionen', 2, 'fork_14: mandant_sichern(), mandant_grenze_gilt()'),
  -- fork_17: zehn Eindeutigkeitsregeln werden je Mandant statt global. Die
  -- Regel verschwindet (und mit ihr ihr Index), ein eigener Index kommt.
  ('Primaer- und Eindeutigkeitsschluessel', -10, 'fork_17: zehn Regeln '
     'ersetzt durch Indizes ueber (mandant_id, Spalte)'),
  ('Indizes ohne Constraint', 10, 'fork_17: dieselben zehn als eigener Index'),
  -- fork_18: frei gestaltbare Belegnummern.
  ('Tabellen', 1, 'fork_18: belegnummernkreise'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Spalten', 10, 'belegnummernkreise: zehn Spalten'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'belegnummernkreise.id'),
  ('Pruefbedingungen', 2, 'art und zuruecksetzen'),
  ('Fremdschluessel', 2, 'mandant_id, gesellschaft_id'),
  ('Indizes ohne Constraint', 2, 'belegnummernkreise: eindeutig und mandant_id'),
  ('Richtlinien', 3, 'fork_18: lesen, pflegen, mandant_trennung'),
  ('Funktionen', 2, 'fork_18: belegnummer_aus_muster(), naechste_belegnummer()'),
  -- fork_19: Zahlungsbedingungen und Rechnungsfreigabe.
  ('Tabellen', 2, 'fork_19: zahlungsbedingungen, rechnung_einstellungen'),
  ('Tabellen mit RLS', 2, 'dieselben zwei'),
  ('Spalten', 20, 'zahlungsbedingungen 13, rechnung_einstellungen 6, '
                  'rechnungen.zahlungsbedingung_id'),
  ('Primaer- und Eindeutigkeitsschluessel', 2, 'je ein Primaerschluessel'),
  ('Pruefbedingungen', 2, 'zahlungsbedingungen: Tage und Skonto'),
  ('Fremdschluessel', 6, 'je mandant_id und gesellschaft_id, freigabe_durch, '
                         'rechnungen.zahlungsbedingung_id'),
  ('Indizes ohne Constraint', 4, 'je mandant_id, Standard-Bedingung, '
                                 'Eindeutigkeit der Einstellungen'),
  ('Richtlinien', 6, 'fork_19: je lesen, pflegen, mandant_trennung'),
  ('Funktionen', 5, 'fork_19: zahlungsbedingung_text(), '
                    'rechnung_braucht_freigabe(), rechnung_zur_freigabe(), '
                    'rechnung_freigeben(), rechnung_faelligkeit()'),
  -- fork_20: onOffice abgeschaltet. Vierzehn Cron-Jobs weniger — das ist eine
  -- Abnahme, kein Zuwachs, deshalb eine negative Zahl.
  ('Cron-Jobs', -14, 'fork_20: die onOffice-Jobs sind abbestellt'),
  -- fork_21: der Zahlungstext, damit die Oberflaeche ihn vor dem Speichern
  -- zeigen kann, ohne ihn ein zweites Mal zu bauen.
  ('Funktionen', 1, 'fork_21: zahlungsbedingung_text_aus()'),
  -- fork_22: ein Wachposten, der mandant_id aus dem Elternsatz fuellt, an
  -- sechzehn Tabellen. Sechzehn Trigger, eine Funktion.
  ('Funktionen', 1, 'fork_22: mandant_aus_eltern()'),
  ('Trigger', 16, 'fork_22: mandant_aus_eltern an sechzehn Tabellen'),
  -- fork_23: die Vorgaben an der Vorlage (Laufzeit, Provision, Fristen).
  ('Spalten', 1, 'fork_23: vertragsvorlagen.vorgaben'),
  ('Pruefbedingungen', 1, 'fork_23: erlaubte Schluessel je Vorlagenart'),
  ('Funktionen', 1, 'fork_23: vorlage_vorgaben()'),
  -- fork_24: markierte Felder in der eigenen Vorlage — Rechteck im PDF,
  -- Textstelle im Word.
  ('Tabellen', 1, 'fork_24: vorlagen_felder'),
  ('Tabellen mit RLS', 1, 'fork_24: vorlagen_felder'),
  ('Spalten', 17, 'fork_24: vorlagen_felder (16) und vertragsvorlagen.dateiformat'),
  ('Funktionen', 2, 'fork_24: vorlagen_feld_katalog(), vorlagen_feld_bekannt()'),
  ('Trigger', 2, 'fork_24: mandant_aus_eltern und vorlagen_feld_bekannt'),
  ('Richtlinien', 3, 'fork_24: lesen, pflegen, mandant_trennung'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_24: ein Feld je Vorlage einmal'),
  ('Pruefbedingungen', 5, 'fork_24: Zeiger, Ausrichtung, Vollstaendigkeit, Schriftgroesse, Dateiformat'),
  ('Fremdschluessel', 2, 'fork_24: vorlage_id und mandant_id'),
  ('Indizes ohne Constraint', 2, 'fork_24: je Vorlage und je Mandant'),
  -- fork_25: mehrere Beteiligte in einem Block, mit Untergrenze der Schrift.
  ('Spalten', 1, 'fork_25: vorlagen_felder.mindest_schriftgroesse'),
  ('Pruefbedingungen', 1, 'fork_25: Untergrenze nicht ueber der Ausgangsgroesse')
  -- fork_26 aendert nur eine vorhandene Pruefbedingung (art) und eine
  -- vorhandene Funktion (vorlagen_feld_katalog) — keine neuen Kennzahlen.
  ,
  -- fork_27: der Wachposten aus fork_22 jetzt auch an aktivitaeten und
  -- immobilie_datei.
  ('Trigger', 2, 'fork_27: mandant_aus_eltern an zwei weiteren Tabellen'),
  -- fork_28: vier Einstellungstabellen gehoeren jetzt dem Mandanten. Die
  -- Primaerschluessel werden nur umgebaut, nicht vermehrt — dazukommt eine
  -- Funktion, die einem neuen Mandanten seine vier Zeilen anlegt.
  ('Funktionen', 1, 'fork_28: mandant_grundeinstellungen()'),
  -- fork_29: projekte.slug ist wieder plattformweit eindeutig — der Index
  -- aus fork_17 weicht der Regel der Vorlage.
  ('Indizes ohne Constraint', -1, 'fork_29: projekte_mandant_slug_idx entfaellt'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_29: projekte_slug_key kehrt zurueck'),
  -- fork_30: die Selbstregistrierung. Zwei Funktionen, kein neues Schema —
  -- ein Mandant besteht aus Zeilen in Tabellen, die es alle schon gibt.
  ('Funktionen', 2, 'fork_30: mandant_slug_vorschlag(), registrierung_abschliessen()'),
  -- fork_31: der Unterbau fuer die Stufen 98 bis 150 der Vorlage
  -- (02.10.2026). Die Vorlage hat vierzig Stufen nachgelegt, ihr Export
  -- enthaelt aber nur die Oberflaeche — acht Tabellen, zwei Funktionen und
  -- zwei Spalten an portal_zugaenge standen nicht darin.
  ('Tabellen', 8, 'fork_31: aufmass_scan, grundriss_ki_auftraege, '
                  'kosten_posten, punktwolke_diagnose, scan_ablage, '
                  'unterlagen_links, transfer_dateien, unterlagen_link_abrufe'),
  ('Tabellen mit RLS', 8, 'dieselben acht'),
  ('Richtlinien', 17, 'fork_31: je Tabelle eine erlaubende fuer das Team und '
                      'eine restriktive Mandantengrenze (16), dazu '
                      'kosten_posten_nur_chef'),
  ('Spalten', 97, 'fork_31: 95 in den acht Tabellen, dazu '
                  'portal_zugaenge.bezeichnung und .kosten_monat'),
  ('Primaer- und Eindeutigkeitsschluessel', 9,
     'fork_31: acht Primaerschluessel, dazu unterlagen_links.token eindeutig'),
  ('Pruefbedingungen', 9, 'fork_31: umfang, gesamt-ohne-Raum, ki-status, '
                          'kosten-art, -abrechnung, -kategorie, scan-art, '
                          'Passwort-Stimmigkeit, Abruf-Art'),
  ('Fremdschluessel', 19, 'fork_31: acht auf mandanten, vier auf immobilien, '
                          'drei auf profiles, zwei auf unterlagen_links, '
                          'eine auf kontakte, eine weitere auf profiles'),
  ('Indizes ohne Constraint', 17, 'fork_31: Mandant und Fachschluessel je '
                                  'Tabelle'),
  ('Funktionen', 2, 'fork_31: portale_liste(), admin_kosten_messwerte()'),
  ('Spalten', 3, 'fork_31i: immobilie_datei.privat_status, .privat_befund, .privat_vorschlag_pfad (Stufe 112)'),
  ('Buckets', 2, 'fork_31j: scan-dateien (Stufe 124/125), transfer-dateien (Stufe 117)'),
  ('Funktionen', 1, 'fork_31l: grundriss_ki_waechter() — Waechter fuer den Hintergrundlauf von grundriss-ki-lesen'),
  ('Cron-Jobs', 2, 'fork_31l: unterlagen-link-melden-5min, grundriss-ki-waechter-5min'),
  ('Spalten', 3, 'fork_32: firma_stammdaten.url_impressum, .url_datenschutz, .url_agb — die drei Rechtsadressen je Mandant'),
  -- fork_33a: Aufmass an die echte Fassung der Vorlage angeglichen, dazu
  -- aufmass_projekt (Stufe 157) und scan_ablage.projekt_id. fork_33b aendert
  -- nur vorhandene Richtlinien und Funktionen — keine neuen Kennzahlen.
  ('Tabellen', 1, 'fork_33a: aufmass_projekt'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Spalten', 23, 'fork_33a: aufmass_scan +6, aufmass_projekt 16, scan_ablage.projekt_id'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_33a: aufmass_projekt.id'),
  ('Pruefbedingungen', 4, 'fork_33a: quelle, Verweis passend zur Quelle, Projekt-Titel, -Art, -Status; '
                          'gesamt-ohne-Raum aus fork_31a entfaellt'),
  ('Fremdschluessel', 8, 'fork_33a: aufmass_scan vier Verweise, aufmass_projekt drei, scan_ablage.projekt_id'),
  ('Indizes ohne Constraint', 4, 'fork_33a: zwei Eindeutigkeiten je Datei, Projekt nach Datum und Mandant, '
                                 'Ablage je Projekt; der geratene Gesamtscan-Index entfaellt'),
  ('Richtlinien', 5, 'fork_33a: aufmass_projekt lesen, anlegen, aendern, loeschen, mandant_trennung'),
  ('Funktionen', 2, 'fork_33a: aufmass_scan_aktualisiert(), aufmass_projekt_aktualisiert()'),
  ('Trigger', 2, 'fork_33a: dieselben zwei als Trigger'),
  ('Spalten', 9, 'fork_34: drei an firma_stammdaten (expose_vorlage, _farben, _rechtsanhang) und sechs an immobilien (expose_vorlage, _zitat, _titel_zeilen, _ausstattung_gruppen, _preis_auf_anfrage, _wege)'),
  ('Pruefbedingungen', 2, 'fork_34: expose_vorlage auf raster/signature/studio, je Tabelle eine'),
  ('Spalten', 3, 'fork_35: immobilien.ortsteil, immobilien.modernisierung_jahr, profiles.mobil — drei Angaben, die die Expose-Vorlagen nennen und das Schema nicht hatte'),
  ('Spalten', 2, 'fork_36: immobilien.expose_energie_hinweis und immobilien.laufende_kosten — in den Prototypen stehen dort erfundene Objektdaten'),
  -- fork_37: der Exposé-Baukasten. Eine Vorlage ist ab hier ein
  -- JSON-Dokument, kein Code. Systemvorlagen tragen mandant_id null:
  -- lesbar fuer alle, ueber RLS schreibbar fuer niemanden.
  ('Tabellen', 2, 'fork_37: expose_vorlagen, expose_vorlagen_versionen'),
  ('Tabellen mit RLS', 2, 'dieselben zwei'),
  ('Spalten', 23, 'fork_37: expose_vorlagen (14), expose_vorlagen_versionen (7), '
                  'immobilien.expose_vorlage_id und .expose_overrides'),
  ('Richtlinien', 6, 'fork_37: je Tabelle lesen, bearbeiten und die restriktive '
                     'Mandantengrenze'),
  ('Primaer- und Eindeutigkeitsschluessel', 3, 'fork_37: zwei Primaerschluessel, dazu '
                                               'eine Fassungsnummer je Vorlage nur einmal'),
  ('Pruefbedingungen', 1, 'fork_37: basis auf raster/signature/studio/leer'),
  ('Fremdschluessel', 6, 'fork_37: expose_vorlagen auf mandanten, gesellschaften und '
                         'profiles, die Fassungen auf Vorlage und profiles, dazu '
                         'immobilien.expose_vorlage_id'),
  ('Indizes ohne Constraint', 4, 'fork_37: Vorlagen je Mandant, eine Standardvorlage je '
                                 'Mandant, Fassungen je Vorlage absteigend, Fassungen je Mandant'),
  ('Funktionen', 1, 'fork_37: expose_versionen_abraeumen() — hat_recht() wird nur um '
                    'expose_vorlagen_bearbeiten erweitert, nicht neu angelegt'),
  ('Trigger', 1, 'fork_37: dieselbe Funktion als Trigger'),
  ('Buckets', 1, 'fork_37: expose-assets fuer eigene Grafiken in Vorlagen'),
  ('Storage-Richtlinien', 2, 'fork_37: expose_assets_lesen, expose_assets_pflegen')
  -- fork_38 legt nur die drei Systemvorlagen als Zeilen an — kein Schema,
  -- also keine Kennzahl.
  ,
  ('Spalten', 1, 'fork_39: firma_stammdaten.marken_linie — die zweite Markenzeile der Luxusvorlage')
  -- fork_40 aendert nur eine Bedingung IN den gespeicherten Vorlagen —
  -- kein Schema, also keine Kennzahl.
  -- fork_41 bis fork_43 aendern ebenfalls nur gespeicherte Vorlagen.
  ,
  -- fork_44: Postfaecher je Anbieter (Microsoft, Google, IMAP).
  ('Spalten', 8, 'fork_44: mail_postfaecher bekommt anbieter, oauth_konto, '
                 'oauth_refresh_verschluesselt, oauth_zugriff_verschluesselt, '
                 'oauth_gueltig_bis, oauth_bereiche, oauth_verbunden_am, oauth_fehler'),
  ('Pruefbedingungen', 1, 'fork_44: mail_postfaecher.anbieter auf imap/microsoft/google'),
  ('Tabellen', 1, 'fork_44: mail_oauth_vorgaenge — der angefangene Verbindungsvorgang'),
  ('Tabellen mit RLS', 1, 'dieselbe'),
  ('Spalten', 9, 'fork_44: mail_oauth_vorgaenge: id, mandant_id, benutzer_id, '
                 'anbieter, zustand, postfach_id, weiter_zu, erstellt_am, verbraucht_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 2,
     'fork_44: mail_oauth_vorgaenge Primaerschluessel und zustand eindeutig'),
  ('Pruefbedingungen', 1, 'fork_44: mail_oauth_vorgaenge.anbieter'),
  ('Fremdschluessel', 3, 'fork_44: mail_oauth_vorgaenge auf mandanten, profiles '
                         'und mail_postfaecher'),
  ('Indizes ohne Constraint', 2, 'fork_44: offene Vorgaenge und mandant_id'),
  ('Richtlinien', 2, 'fork_44: eigene Vorgaenge und die restriktive Mandantentrennung'),
  ('Funktionen', 1, 'fork_44: mail_oauth_aufraeumen()'),

  -- fork_45: Exposé-Sofortversand. Eine Tabelle, die das Protokoll führt —
  -- und damit die Sperre gegen Doppelversand und das Tageslimit trägt.
  ('Tabellen', 1, 'fork_45: expose_sofortversand — das Protokoll'),
  ('Tabellen mit RLS', 1, 'fork_45: expose_sofortversand'),
  ('Spalten', 12, 'fork_45: expose_sofortversand: id, mandant_id, immobilie_id, '
     'kontakt_id, email, freigabe_id, mail_eingang_id, status, grund, weg, '
     'ausgeloest_von, created_at'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_45: expose_sofortversand Primaerschluessel'),
  ('Pruefbedingungen', 2, 'fork_45: status und weg'),
  ('Fremdschluessel', 5, 'fork_45: auf mandanten, immobilien, kontakte, '
     'expose_freigaben und mail_eingang'),
  ('Indizes ohne Constraint', 3, 'fork_45: mandant_id, Sperrfrist, Tageslimit'),
  ('Richtlinien', 2, 'fork_45: Lesen im Haus und die restriktive Mandantentrennung'),

  -- fork_46: Schreibstil aus den eigenen Mails, mit Einwilligung.
  ('Tabellen', 1, 'fork_46: mail_stilprofil — Einwilligung und abgeleiteter Stil'),
  ('Tabellen mit RLS', 1, 'fork_46: mail_stilprofil'),
  ('Spalten', 15, 'fork_46: mail_stilprofil: id, mandant_id, benutzer_id, '
     'einwilligung_am, einwilligung_text, widerrufen_am, profil_text, '
     'mails_ausgewertet, zeitraum_von, zeitraum_bis, gelernt_am, modell, '
     'fehler_text, created_at, updated_at'),
  ('Primaer- und Eindeutigkeitsschluessel', 2,
     'fork_46: mail_stilprofil Primaerschluessel und benutzer_id eindeutig'),
  ('Fremdschluessel', 2, 'fork_46: mail_stilprofil auf mandanten und profiles'),
  ('Indizes ohne Constraint', 1, 'fork_46: mandant_id'),
  ('Richtlinien', 2, 'fork_46: eigenes Profil und die restriktive Mandantentrennung'),

  -- fork_47: Tarife, Abos, Credits. Neun Tabellen — vier Katalog, eine
  -- Admin-Liste, drei je Mandant, eine fuer die Stripe-Ereignisse.
  ('Tabellen', 9, 'fork_47: plattform_admins, plattform_tarife, '
     'plattform_credit_preise, plattform_credit_pakete, plattform_werte, '
     'mandant_abo, credit_konten, credit_buchungen, stripe_ereignisse'),
  ('Tabellen mit RLS', 9, 'fork_47: alle neun'),
  ('Spalten', 87, 'fork_47: die Spalten dieser neun Tabellen'),
  ('Primaer- und Eindeutigkeitsschluessel', 9, 'fork_47: je ein Primaerschluessel'),
  ('Pruefbedingungen', 13, 'fork_47: Status, Intervall, Mengen und Preise'),
  ('Fremdschluessel', 8, 'fork_47: auf mandanten, profiles, tarife und konten'),
  ('Indizes ohne Constraint', 11, 'fork_47: Mandant, Status, Verbrauchsreihenfolge, '
     'Gruendernummer, Abonnement, Vorgang, Zeit'),
  ('Richtlinien', 15, 'fork_47: Katalog lesen und pflegen (8), Abo, Konten, '
     'Ledger und drei Mandantentrennungen'),
  ('Funktionen', 14, 'fork_47: ist_plattform_admin, credits_saldo, credits_kosten, '
     'credits_reservieren, credits_buchen, credits_freigeben, credits_gutschreiben, '
     'credits_tarif_zuteilen, nutzer_limit, nutzer_platz_frei, abo_zugriff, '
     'gruender_plaetze_frei, gruender_platz_vergeben, credit_buchung_unveraenderlich'),
  ('Trigger', 1, 'fork_47: das Ledger ist unveraenderlich'),

  -- fork_48: die Buckets, die keine einzige Richtlinie hatten.
  ('Storage-Richtlinien', 13, 'fork_48: sieben Buckets ohne jede Richtlinie — '
     'transfer-dateien, scan-dateien, objektbilder, objektdokumente und '
     'energieausweis je drei, importe zwei, briefe-pdf eine'),

  -- fork_52: das Protokoll der Plattform-Administratoren.
  ('Tabellen', 1, 'fork_52: plattform_protokoll'),
  ('Tabellen mit RLS', 1, 'fork_52: auch dieses'),
  ('Spalten', 6, 'fork_52: id, benutzer_id, aktion, gegenstand, einzelheiten, erstellt_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_52: der Primaerschluessel'),
  ('Fremdschluessel', 1, 'fork_52: auf profiles'),
  ('Indizes ohne Constraint', 2, 'fork_52: Zeit und Gegenstand'),
  ('Richtlinien', 1, 'fork_52: lesen darf nur ein Plattform-Administrator'),
  ('Funktionen', 1, 'fork_52: plattform_protokoll_unveraenderlich'),
  ('Trigger', 1, 'fork_52: das Protokoll wird nicht geaendert und nicht geloescht'),

  -- fork_53: die Erinnerung vor dem Ende der Testphase.
  ('Tabellen', 1, 'fork_53: abo_erinnerungen'),
  ('Tabellen mit RLS', 1, 'fork_53: auch diese'),
  ('Spalten', 5, 'fork_53: mandant_id, art, gesendet_am, empfaenger, erstellt_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 1,
     'fork_53: (mandant_id, art) ist die Sperre gegen Doppelversand'),
  ('Fremdschluessel', 1, 'fork_53: auf mandanten'),
  ('Indizes ohne Constraint', 2, 'fork_53: nach Mandant und nach Zeit'),
  ('Richtlinien', 2, 'fork_53: lesen und die restriktive Mandantentrennung'),
  ('Cron-Jobs', 1, 'fork_53: testphase-erinnerung-taeglich'),

  -- fork_54: der protokollierte Supportzugriff.
  ('Tabellen', 1, 'fork_54: support_sitzungen'),
  ('Tabellen mit RLS', 1, 'fork_54: auch diese'),
  ('Spalten', 8, 'fork_54: id, admin_id, mandant_id, grund, schreiben, '
     'begonnen_am, gueltig_bis, beendet_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_54: der Primaerschluessel'),
  ('Pruefbedingungen', 2, 'fork_54: ein Grund ist Pflicht, hoechstens vier Stunden'),
  ('Fremdschluessel', 2, 'fork_54: auf profiles und mandanten'),
  ('Indizes ohne Constraint', 2, 'fork_54: offene Sitzungen und je Mandant'),
  ('Richtlinien', 198, 'fork_54: eine Lesesicht auf support_sitzungen und 197 '
     'Loeschsperren — eine je Tabelle mit Mandantentrennung. `with check` '
     'gilt nicht fuer DELETE, also braucht das Loeschen eine eigene '
     'restriktive Richtlinie; sonst koennte eine Lese-Sitzung alles '
     'loeschen, was sie sehen darf'),
  ('Funktionen', 3, 'fork_54: support_sitzung, mandant_id_schreiben, registrierung_offen'),

  -- fork_55: der Systemzustand fuer den Betreiber.
  ('Funktionen', 2, 'fork_55: cron_zustand und fehler_uebersicht — beide fuer '
     'anon und authenticated gesperrt, erreichbar nur ueber plattform-admin'),

  -- fork_56: die Social-Vorlagen liegen in derselben Tabelle wie die
  -- Exposé-Vorlagen; unterschieden werden sie ueber eine neue Spalte.
  ('Spalten', 1, 'fork_56: expose_vorlagen.art'),
  ('Pruefbedingungen', 1, 'fork_56: art ist expose oder social'),
  ('Indizes ohne Constraint', 1, 'fork_56: nach art'),

  -- fork_67: der Mandant kommt auch vom Besitzer. Dreissig MANDANT-Tabellen
  -- tragen ein Besitzerfeld auf profiles und hatten keinen Wachposten — der
  -- Grund, warum ein frisch angelegtes Postfach am 07.10.2026 unsichtbar
  -- blieb. Keine neue Funktion: es ist derselbe mandant_aus_eltern() aus
  -- fork_22, nur an dreissig weiteren Tabellen.
  ('Trigger', 30, 'fork_67: mandant_aus_eltern an dreissig Tabellen mit Besitzerfeld'),

  -- fork_68: Betreiberrollen, Audit-Log, Zwei-Faktor-Pflicht (Schritt 1 des
  -- Betreiber-Auftrags). Keine neue Tabelle: plattform_admins und
  -- plattform_protokoll werden erweitert, plattform_audit_log ist eine Sicht.
  ('Spalten', 24, 'fork_68: rolle, aktiv, erstellt_von an plattform_admins; rolle, ziel_typ, '
     'ziel_id, vorher, nachher, begruendung, ip, user_agent an plattform_protokoll; '
     'dazu die 13 Spalten der Sicht plattform_audit_log — information_schema.columns '
     'zaehlt Sichten mit'),
  ('Fremdschluessel', 1, 'fork_68: plattform_admins.erstellt_von auf profiles'),
  ('Pruefbedingungen', 1, 'fork_68: rolle ist owner, admin, support oder finanzen'),
  ('Funktionen', 2, 'fork_68: plattform_rolle, plattform_admins_letzter_owner'),
  ('Trigger', 1, 'fork_68: der letzte aktive Owner bleibt'),
  ('Sichten', 1, 'fork_68: plattform_audit_log — der Name aus dem Auftrag, auf plattform_protokoll'),

  -- fork_69: Betreiber, Schritt 2 — Notizen, Credits abziehen, Metadaten.
  ('Tabellen', 1, 'fork_69: plattform_notizen'),
  ('Tabellen mit RLS', 1, 'fork_69: auch diese'),
  ('Spalten', 5, 'fork_69: id, betrifft_mandant_id, admin_id, text, erstellt_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_69: der Primaerschluessel'),
  ('Pruefbedingungen', 1, 'fork_69: eine Notiz ist nicht leer'),
  ('Fremdschluessel', 2, 'fork_69: auf mandanten und profiles'),
  ('Indizes ohne Constraint', 1, 'fork_69: je Mandant nach Zeit'),
  ('Richtlinien', 2, 'fork_69: lesen alle Betreiber, schreiben owner/admin/support'),
  ('Funktionen', 3, 'fork_69: credits_abziehen, plattform_mandanten_kennzahlen, plattform_mandant_metadaten'),

  -- fork_70: Betreiber, Schritt 3 — die eine MRR-Rechnung und die Tagestabellen.
  ('Tabellen', 2, 'fork_70: plattform_mandanten_tag, plattform_kennzahlen_tag'),
  ('Tabellen mit RLS', 2, 'fork_70: beide'),
  ('Spalten', 12, 'fork_70: 8 in plattform_mandanten_tag, 4 in plattform_kennzahlen_tag'),
  ('Primaer- und Eindeutigkeitsschluessel', 2, 'fork_70: je ein Primaerschluessel'),
  ('Fremdschluessel', 1, 'fork_70: plattform_mandanten_tag auf mandanten'),
  ('Indizes ohne Constraint', 1, 'fork_70: je Mandant nach Datum'),
  ('Richtlinien', 4, 'fork_70: lesen, Mandantentrennung und Loeschsperre auf plattform_mandanten_tag; lesen auf plattform_kennzahlen_tag'),
  ('Funktionen', 2, 'fork_70: plattform_mrr_je_mandant, plattform_kennzahlen_schreiben'),
  ('Cron-Jobs', 1, 'fork_70: plattform-kennzahlen-naechtlich'),

  -- fork_71: Rechnungen und Gutschriften aus Stripe, gespiegelt vom Webhook.
  ('Tabellen', 1, 'fork_71: stripe_rechnungen'),
  ('Tabellen mit RLS', 1, 'fork_71: auch diese'),
  ('Spalten', 20, 'fork_71: id, mandant_id, art, nummer, status, waehrung, fünf '
     'Betragsspalten, reverse_charge, bezug_rechnung_id, stripe_abo_id, '
     'stripe_kunde_id, rechnung_url, pdf_url, erstellt_am, bezahlt_am, geaendert_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_71: (mandant_id, id)'),
  ('Pruefbedingungen', 1, 'fork_71: art ist abo, einmal oder gutschrift'),
  ('Fremdschluessel', 1, 'fork_71: auf mandanten'),
  ('Indizes ohne Constraint', 3, 'fork_71: je Mandant, je Mandant nach Zeit, nach Status'),
  ('Richtlinien', 3, 'fork_71: lesen (Chef), die restriktive Mandantentrennung und die Loeschsperre'),

  -- fork_72: Betreiber, Schritt 4 — Kosten & Marge.
  ('Spalten', 2, 'fork_72: anbieter, modell an credit_buchungen'),
  ('Tabellen', 1, 'fork_72: plattform_fixkosten'),
  ('Tabellen mit RLS', 1, 'fork_72: auch diese'),
  ('Spalten', 6, 'fork_72: id, bezeichnung, betrag_cent, aktiv, notiz, geaendert_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_72: der Primaerschluessel'),
  ('Pruefbedingungen', 2, 'fork_72: Bezeichnung nicht leer, Betrag nicht negativ'),
  ('Richtlinien', 2, 'fork_72: lesen alle Betreiber, pflegen owner/admin'),
  ('Funktionen', 1, 'fork_72: plattform_kosten — credits_buchen bekam nur zwei weitere Parameter'),

  -- fork_73: Betreiber, Schritt 5 — Gutscheine und Funktionsschalter.
  ('Tabellen', 5, 'fork_73: gutscheine, gutschein_einloesungen, plattform_features, tarif_features, mandant_features'),
  ('Tabellen mit RLS', 5, 'fork_73: alle fuenf'),
  ('Spalten', 31, 'fork_73: 13 gutscheine, 6 einloesungen, 5 features, 2 tarif_features, 5 mandant_features'),
  ('Primaer- und Eindeutigkeitsschluessel', 6, 'fork_73: fuenf Primaerschluessel und (gutschein_code, mandant_id) eindeutig'),
  ('Pruefbedingungen', 4, 'fork_73: Code, Art, Wert, Dauer der Gutscheine'),
  ('Fremdschluessel', 6, 'fork_73: einloesungen auf gutscheine und mandanten; tarif_features auf tarife und features; mandant_features auf mandanten und features'),
  ('Indizes ohne Constraint', 2, 'fork_73: einloesungen und mandant_features je Mandant'),
  ('Richtlinien', 12, 'fork_73: lesen/pflegen gutscheine; lesen + Trennung + Loeschsperre einloesungen; lesen/pflegen features; lesen/pflegen tarif_features; lesen + Trennung + Loeschsperre mandant_features'),
  ('Funktionen', 2, 'fork_73: hat_feature, meine_features'),

  -- fork_74: Betreiber, Schritt 6 — Zahlungen, Abgleich, echte Gebuehr.
  ('Spalten', 5, 'fork_74: gebuehr_cent, versuche, naechster_versuch, zahlung_id, abgeglichen_am an stripe_rechnungen'),
  ('Tabellen', 1, 'fork_74: stripe_abgleich'),
  ('Tabellen mit RLS', 1, 'fork_74: auch diese'),
  ('Spalten', 12, 'fork_74: id, datum, bereich, zeitraum, stripe_anzahl, stripe_cent, spiegel_anzahl, spiegel_cent, abweichung, kennungen, fehler, erstellt_am'),
  ('Primaer- und Eindeutigkeitsschluessel', 2, 'fork_74: Primaerschluessel und (datum, bereich, zeitraum)'),
  ('Richtlinien', 1, 'fork_74: lesen owner/admin/finanzen'),
  ('Funktionen', 1, 'fork_74: plattform_zahlungen'),
  ('Cron-Jobs', 1, 'fork_74: plattform-stripe-abgleich-taeglich'),

  -- fork_75: Betreiber, Schritt 7 — Technik & Jobs.
  ('Tabellen', 2, 'fork_75: system_fehler, dienst_aufrufe'),
  ('Tabellen mit RLS', 2, 'fork_75: beide'),
  ('Spalten', 14, 'fork_75: 7 system_fehler, 7 dienst_aufrufe'),
  ('Primaer- und Eindeutigkeitsschluessel', 2, 'fork_75: je ein Primaerschluessel'),
  ('Indizes ohne Constraint', 2, 'fork_75: je nach Zeit'),
  ('Richtlinien', 3, 'fork_75: lesen und erledigen system_fehler, lesen dienst_aufrufe'),
  ('Funktionen', 4, 'fork_75: cron_laeufe, cron_job_jetzt, plattform_speicher, plattform_technik'),
  -- fork_76: Erstattung nimmt die Credits mit.
  ('Funktionen', 1, 'fork_76: credits_erstattung'),
  -- fork_77: Betreiber, Schritt 8 — Support-Anfragen, Supportzugriff mit Freigabe.
  ('Tabellen', 3, 'fork_77: support_protokoll, support_anfragen, support_antworten'),
  ('Tabellen mit RLS', 3, 'fork_77: alle drei'),
  ('Spalten', 37, 'fork_77: 5 support_sitzungen, 9 support_protokoll, 15 support_anfragen, 8 support_antworten'),
  ('Primaer- und Eindeutigkeitsschluessel', 3, 'fork_77: je ein Primaerschluessel'),
  ('Indizes ohne Constraint', 7, 'fork_77: 2 + 3 + 2'),
  ('Richtlinien', 11, 'fork_77: 3 + 4 + 4'),
  ('Funktionen', 8, 'fork_77: Protokoll (2), Zugriffe (3), Anfragen (3)'),
  ('Trigger', 201, 'fork_77: Aenderungsprotokoll an 200 Mandantentabellen, support_antwort_nach'),
  ('Fremdschluessel', 9, 'fork_77: 2 support_sitzungen (freigegeben_von, beendet_von), 2 protokoll, 3 anfragen, 2 antworten'),
  ('Pruefbedingungen', 8, 'fork_77: art; betreff, text, kategorie, prioritaet, status, uebernahme_status; text'),
  -- fork_78: Betreiber, Schritt 9 — KI-Steuerung, System-Mails, Rechtstexte, Ankuendigungen.
  ('Tabellen', 6, 'fork_78: plattform_ki_einstellungen, mandant_ki_limits, system_mail_vorlagen, rechtstexte, rechtstext_zustimmungen, ankuendigungen'),
  ('Tabellen mit RLS', 6, 'fork_78: alle sechs'),
  ('Spalten', 52, 'fork_78: 10 + 5 + 7 + 11 + 5 + 14'),
  ('Primaer- und Eindeutigkeitsschluessel', 8, 'fork_78: 6 Primaerschluessel, rechtstexte (art, version), zustimmungen (mandant, text)'),
  ('Indizes ohne Constraint', 3, 'fork_78: rechtstexte art, zustimmungen mandant, ankuendigungen zeit'),
  ('Richtlinien', 6, 'fork_78: ki lesen; rechtstexte lesen; zustimmungen lesen, anlegen, trennung, loeschen'),
  ('Funktionen', 5, 'fork_78: ki_schranke, system_mail_rendern, rechtstexte_offen, plattform_rechtstexte_stand, meine_ankuendigungen'),
  ('Trigger', 2, 'fork_78: ki_schranke am Ledger, support_protokoll_tr an rechtstext_zustimmungen'),
  ('Fremdschluessel', 3, 'fork_78: mandant_ki_limits; zustimmungen auf mandanten und rechtstexte'),
  ('Pruefbedingungen', 9, 'fork_78: anbieter, temperatur, max_tokens; credits_tag, eur_tag; art; typ, titel, zeitraum'),
  -- fork_79: Betreiber, Schritt 10 — Warnregeln, Zusammenfassung, Demo-Daten.
  ('Tabellen', 2, 'fork_79: plattform_warnregeln, plattform_warnungen'),
  ('Tabellen mit RLS', 2, 'fork_79: beide'),
  ('Spalten', 17, 'fork_79: 7 warnregeln, 8 warnungen, mandanten.ist_demo, plattform_kennzahlen_tag.ist_demo'),
  ('Primaer- und Eindeutigkeitsschluessel', 3, 'fork_79: zwei Primaerschluessel, warnungen.eindeutig'),
  ('Indizes ohne Constraint', 1, 'fork_79: warnungen nach Zeit'),
  ('Funktionen', 4, 'fork_79: plattform_warnungen_pruefen, plattform_tageszusammenfassung, plattform_demo_anlegen, plattform_demo_entfernen'),
  ('Fremdschluessel', 2, 'fork_79: warnungen auf regeln und mandanten'),
  ('Cron-Jobs', 3, 'fork_79: plattform-warnungen-stuendlich, plattform-zusammenfassung-sommer/-winter'),
  -- fork_80: Advisor-Nachlese — Indizes auf 17 Fremdschluessel der Betreiber-Tabellen.
  ('Indizes ohne Constraint', 17, 'fork_80: Fremdschluessel der Betreiber-Tabellen'),
  -- fork_84–86: Bautraeger-Paket v2 — Verknuepfungen, Maengel-Workflow, QR, Bautenstand/MaBV.
  ('Tabellen', 1, 'fork_86: projekt_bautenstand'),
  ('Tabellen mit RLS', 1, 'fork_86: projekt_bautenstand'),
  ('Spalten', 51, 'fork_84: 11 uebergabeprotokoll, 19 projekt_maengel, 3 projekt_kontakte, 2 projekt_einheiten (raeume, fork_86 qr_token); fork_85: 3 projekte; fork_86: 3 projekt_zahlungsplan, 10 projekt_bautenstand'),
  ('Fremdschluessel', 18, 'fork_84: 7 uebergabeprotokoll, 5 projekt_maengel, 1 projekt_kontakte, 1 projekt_einheiten.immobilie_id; fork_86: 4 projekt_bautenstand'),
  ('Indizes ohne Constraint', 22, 'fork_84: 7 + 7 + 2 + 1; fork_86: 4 projekt_bautenstand, qr_token'),
  ('Primaer- und Eindeutigkeitsschluessel', 1, 'fork_86: projekt_bautenstand'),
  ('Pruefbedingungen', 4, 'fork_84: neubau_projekt, quelle, status; fork_86: abschnitt 1–13'),
  ('Richtlinien', 5, 'fork_84: 2 Team-Richtlinien am Protokoll mit Projekt; fork_86: 3 projekt_bautenstand'),
  ('Funktionen', 8, 'fork_84: objekte_zu_adresse; fork_85: mangel_verlauf_anhaengen, projekt_maengel_verlauf_trg, projekt_maengel_todo_trg, projekt_glocke, maengel_vorlage_sicherstellen; fork_86: rate_anforderbar, projekt_bautenstand_hinweis_trg'),
  ('Trigger', 3, 'fork_85: Verlauf, To-do-Abschluss; fork_86: Ratenhinweis'),
  ('Cron-Jobs', 1, 'fork_85: maengel-fristen-taeglich')
),
soll(bereich, soll) as (
  select v.bereich,
         v.soll + coalesce((select sum(z.mehr) from zuwachs z
                             where z.bereich = v.bereich), 0)
    from vorlage v
), ist(bereich, ist) as (values
  ('Tabellen', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relkind='r')),
  ('Sichten', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relkind='v')),
  ('Sequenzen', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relkind='S')),
  ('Funktionen', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.prokind in ('f','p'))),
  ('Trigger', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and not t.tgisinternal)),
  ('Richtlinien', (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
                    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public')),
  ('Primaer- und Eindeutigkeitsschluessel',
     (select count(*) from pg_constraint con join pg_class r on r.oid=con.conrelid
       join pg_namespace n on n.oid=r.relnamespace
       where n.nspname='public' and con.contype in ('p','u'))),
  ('Pruefbedingungen',
     (select count(*) from pg_constraint con join pg_class r on r.oid=con.conrelid
       join pg_namespace n on n.oid=r.relnamespace
       where n.nspname='public' and con.contype='c')),
  ('Fremdschluessel',
     (select count(*) from pg_constraint con join pg_class r on r.oid=con.conrelid
       join pg_namespace n on n.oid=r.relnamespace
       where n.nspname='public' and con.contype='f')),
  ('Indizes ohne Constraint',
     (select count(*) from pg_index x join pg_class c on c.oid=x.indrelid
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public'
         and not exists (select 1 from pg_constraint con where con.conindid = x.indexrelid))),
  ('Tabellen mit RLS', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relkind='r' and c.relrowsecurity)),
  ('Buckets', (select count(*) from storage.buckets
                where id not in ('branding', 'importe', 'marke', 'objektbilder',
                                 'objektdokumente'))),
  ('Storage-Richtlinien', (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
                            join pg_namespace n on n.oid=c.relnamespace
                           where n.nspname='storage'
                             and pol.polname not in (
      'branding_delete', 'branding_insert', 'branding_read', 'branding_update',
      'importe_anlegen', 'importe_lesen', 'importe_loeschen',
      'marke_aendern', 'marke_anlegen', 'marke_loeschen',
      'objektbilder_aendern', 'objektbilder_anlegen', 'objektbilder_lesen',
      'objektbilder_loeschen', 'objektbilder_web_expose',
      'objektdokumente_aendern', 'objektdokumente_anlegen', 'objektdokumente_lesen',
      'objektdokumente_loeschen', 'objektdokumente_web_expose'))),
  ('Cron-Jobs', (select count(*) from cron.job)),
  ('Spalten', (select count(*) from information_schema.columns where table_schema='public'))
)
select case when s.soll = i.ist then 'ok  ' else 'FEHL' end as ergebnis,
       s.bereich, i.ist, s.soll
from soll s join ist i using (bereich);

select ergebnis, bereich, ist, soll from pruefung
order by case when ergebnis = 'ok  ' then 1 else 0 end, bereich;

do $$
declare
  abweichungen int;
  liste text;
begin
  select count(*), string_agg(bereich || ': ist ' || ist || ', soll ' || soll, '; ')
    into abweichungen, liste
    from pruefung where ist <> soll;
  if abweichungen > 0 then
    raise exception 'Vorlage nicht vollstaendig: % Kennzahl(en) weichen ab — %',
      abweichungen, liste;
  end if;
end;
$$;

-- --- Keine Farbe der Referenz als Spaltenvorgabe --------------------------
-- CLAUDE.md nennt den Standardwert ausdruecklich unter dem, worin kein
-- Kennzeichen der Referenz stehen darf. Zwei Spalten trugen bis fork_58 das
-- Gold der Referenz als Vorgabe (mail_eigene_ordner.farbe,
-- mail_kategorien.farbe) — jeder neu angelegte Ordner haette ihre Farbe
-- bekommen, ohne dass sie irgendwo im Quelltext stuende.
--
-- Geprueft wird das ganze Schema, nicht die beiden Spalten: die naechste
-- uebernommene Tabelle bringt die naechste Vorgabe mit.
do $$
declare treffer text;
begin
  select string_agg(format('%s.%s = %s', table_name, column_name, column_default),
                    '; ' order by table_name, column_name)
    into treffer
    from information_schema.columns
   where table_schema = 'public'
     and column_default ~* '(263159|D4A567|1a2342|e0bd80|e6c894|FAFAF7|E8E4DA|8B8377)';
  if treffer is not null then
    raise exception 'Farbwert der Referenz als Spaltenvorgabe: %', treffer;
  end if;
  raise notice 'Keine Farbe der Referenz als Spaltenvorgabe.';
end $$;
