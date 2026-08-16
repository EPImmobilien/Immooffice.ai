# Datenmodell ImmoOffice.ai

**Stand:** 16.08.2026 · Master-Prompt Abschnitte 5, 7, 14 · Phase 0 (Entwurf für Gate A)
Ergänzend: [`OPENIMMO_MAPPING.md`](OPENIMMO_MAPPING.md) ·
[`SECURITY_AND_DSGVO.md`](SECURITY_AND_DSGVO.md)

---

## 1. Grundregeln

1. **Jede fachliche Tabelle trägt `mandant_id uuid not null`** mit Fremdschlüssel auf
   `mandanten`. Ohne diese Spalte gibt es keine RLS-Policy und damit keine Tabelle.
2. **Schlüssel sind UUIDs.** Fortlaufende Ganzzahlen wären über die API erratbar
   (Abschnitt 5).
3. **Fachdaten kommen in Spalten, nicht in JSONB.** JSONB nur dort, wo die Struktur
   tatsächlich frei ist (Rechteübersteuerung, Rechenblätter der Wertermittlung,
   Job-Nutzlast). Die Referenz legte Bewertungen komplett in einem JSONB-Feld ab und
   konnte sie deshalb nicht auswerten.
4. **Löschen ist fachlich ein Zustand.** `geloescht_am` statt `DELETE`, damit
   Aufbewahrungspflichten und der Löschworkflow aus Abschnitt 16 zusammenpassen.
5. **Geldbeträge als `numeric(14,2)`**, Flächen als `numeric(10,2)`. Kein `float`.
6. Jede Tabelle führt `erstellt_am`, `geaendert_am`, `erstellt_von`.

## 2. Mandant, Benutzer, Rechte

```
mandanten
  id, name, slug, land, zeitzone
  abo_status, tarif_id, testphase_bis
  gesperrt_am, gesperrt_grund
  erstellt_am

mandant_branding                          -- Abschnitt 5
  mandant_id (PK), logo_pfad, logo_invers_pfad
  farbe_primaer, farbe_akzent, schriftart
  firmenname, strasse, plz, ort, telefon, email, web
  impressum, datenschutztext, widerrufsbelehrung
  standard_ansprechpartner_id
  mail_absender_name, mail_absender_adresse

benutzer                                   -- 1:1 zu auth.users
  id (= auth.users.id), mandant_id
  name, email, telefon, funktion, foto_pfad
  rolle, rechte_uebersteuerung jsonb
  aktiv, letzter_login_am
```

### Rollen

Abschnitt 5 nennt sechs Rollen. Sie sind eine Aufzählung, keine frei wählbare
Zeichenkette:

`inhaber` · `administrator` · `makler` · `assistenz` · `marketing` · `nur_lesen`

Die Referenz kannte nur vier Stufen und nur die Frage „Modul sichtbar ja/nein“.
ImmoOffice.ai trennt zusätzlich nach Aktion.

### Berechtigungsmatrix

Rolle × Modul × Aktion (`lesen`, `anlegen`, `aendern`, `loeschen`, `freigeben`).
Die Rolle liefert die Vorbelegung, `rechte_uebersteuerung` erlaubt die Feinjustierung
je Benutzer — das gute Bedienkonzept der Referenz, aber serverseitig durchgesetzt.

| Modul | inhaber | administrator | makler | assistenz | marketing | nur_lesen |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Objekte | alle | alle | anlegen/ändern | anlegen/ändern | lesen | lesen |
| Kontakte | alle | alle | anlegen/ändern | anlegen/ändern | lesen | lesen |
| Exposés | alle | alle | alle | anlegen/ändern | anlegen/ändern | lesen |
| Wertermittlung | alle | alle | alle | lesen | – | lesen |
| Verträge/Signatur | alle | alle | anlegen/freigeben | lesen | – | lesen |
| Marketing | alle | alle | anlegen/ändern | anlegen/ändern | alle | lesen |
| Kalender/Aufgaben | alle | alle | alle | alle | eigene | lesen |
| Auswertungen | alle | alle | eigene | – | – | lesen |
| Einstellungen | alle | alle | – | – | – | – |
| Abo und Credits | alle | lesen | – | – | – | – |

`inhaber` ist die einzige Rolle mit Zugriff auf Abrechnung und Kündigung. Anders als in
der Referenz umgeht sie **keine** RLS-Policy — auch der Inhaber sieht nur seinen
Mandanten.

## 3. Objekte

Aufgebaut entlang der OpenImmo-Feldlogik (Abschnitt 7), damit der Portalexport ohne
verlustbehaftete Abbildung möglich ist. Details in `OPENIMMO_MAPPING.md`.

```
objekte
  id, mandant_id, objektnummer            -- je Mandant eindeutig
  stammobjekt_id                          -- Neubauprojekt → Einheit
  bezeichnung                             -- intern
  titel                                   -- Exposé/Portal

  vermarktungsart                         -- kauf | miete | kauf_miete
  objektkategorie                         -- wohnung | haus | grundstueck |
                                          -- gewerbe | anlage | sonstige
  objektart                               -- Feinklassifikation
  nutzungsart                             -- wohnen | gewerbe | anlage | gemischt

  status                                  -- akquise | vorbereitung | aktiv |
                                          -- reserviert | verkauft | vermietet |
                                          -- zurueckgezogen | archiviert
  auftragsart, auftrag_von, auftrag_bis

  -- Adresse
  strasse, hausnummer, plz, ort, ortsteil, land
  etage, etagen_gesamt, wohnungsnummer
  lat, lon                                -- fehlte der Referenz, OpenImmo verlangt es
  adresse_veroeffentlichen boolean

  -- Flächen und Räume
  wohnflaeche, nutzflaeche, gesamtflaeche, grundstuecksflaeche
  zimmer, schlafzimmer, badezimmer
  anzahl_balkone, anzahl_terrassen, stellplatz_anzahl, stellplatz_art

  -- Zustand
  baujahr, letzte_modernisierung, zustand, ausstattungsqualitaet
  verfuegbar_ab, bezugsfrei_ab

  -- Preise
  kaufpreis, kaufpreis_auf_anfrage boolean
  kaltmiete, warmmiete, nebenkosten, heizkosten, kaution
  hausgeld, hausgeld_nicht_umlagefaehig
  miete_ist, miete_soll, mieteinnahmen_jahr
  provision_kaeufer, provision_verkaeufer, provision_hinweis
  grunderwerbsteuer_satz, courtage_frei boolean

  -- Energie (GEG-Pflichtangaben)
  energieausweis_typ, energie_kennwert, energie_klasse
  energie_traeger, energie_baujahr_anlage
  energie_warmwasser_enthalten boolean, energie_gueltig_bis

  -- Texte
  beschreibung_objekt, beschreibung_ausstattung
  beschreibung_lage, beschreibung_sonstiges

  zustaendig_id, erstellt_von
  geloescht_am
```

**Bewusst nicht übernommen:** die Veröffentlichungsflags der Referenz
(`website_veroeffentlichen`, `shoptv_veroeffentlichen` …). Veröffentlichung ist kein
Objektattribut, sondern ein eigener Vorgang je Kanal — siehe `objekt_veroeffentlichung`.

```
objekt_ausstattung                         -- strukturiert statt Freitext
  objekt_id, merkmal, wert                 -- Katalog nach OpenImmo-Flags

objekt_datei
  id, mandant_id, objekt_id
  art                                      -- bild | grundriss | dokument |
                                           -- energieausweis | video
  pfad, dateiname, mimetype, groesse_bytes
  titel, reihenfolge, ist_titelbild
  ki_bearbeitet boolean, ki_art            -- Kennzeichnung, Abschnitt 10
  original_datei_id                        -- Version zeigt auf das Original
  version integer

objekt_veroeffentlichung
  id, mandant_id, objekt_id
  kanal                                    -- web_expose | immoscout24 |
                                           -- immowelt | kleinanzeigen
  status, veroeffentlicht_am, zurueckgezogen_am
  letzte_uebertragung_am, letzte_meldung
```

`objekt_datei` erfüllt drei harte Vorgaben aus Abschnitt 10: Originale bleiben
unverändert (neue Zeile mit `original_datei_id`), jede Bearbeitung erzeugt eine Version,
und `ki_bearbeitet` trägt die Kennzeichnung bis in Export und Web-Exposé.

## 4. Kontakte

Anders als in der Referenz **eine** Entität mit Rollen statt getrennter Tabellen für
Interessenten und Eigentümer — dieselbe Person ist häufig beides.

```
kontakte
  id, mandant_id
  anrede, titel, vorname, nachname, firma
  email, telefon, mobil
  strasse, hausnummer, plz, ort, land
  quelle, notizen, betreuer_id
  einwilligung_werbung boolean, einwilligung_am
  geloescht_am, anonymisiert_am

kontakt_rolle
  kontakt_id, rolle                        -- eigentuemer | interessent | kaeufer |
                                           -- mieter | dienstleister | notar | sonstige

kontakt_objekt
  kontakt_id, objekt_id, rolle, anteil, seit, bis

suchprofile
  id, mandant_id, kontakt_id, aktiv
  vermarktungsart, objektkategorien text[]
  preis_von, preis_bis, flaeche_von, flaeche_bis
  zimmer_von, zimmer_bis, orte text[], umkreis_km

treffer                                    -- Ergebnis des Matchings
  id, mandant_id, suchprofil_id, objekt_id
  punktzahl, erzeugt_am, art               -- automatisch | manuell
  status                                   -- neu | gesendet | abgelehnt | vorgemerkt
```

## 5. Vorgänge

```
aktivitaeten          -- Ereignisstrom je Objekt/Kontakt, mandantenweit
aufgaben              -- Fälligkeit, Priorität, Status, Serienregel
termine               -- Besichtigungen, Teilnehmer, externe Kalender-ID
notizen, anhaenge
```

## 6. Abrechnung und Credits

```
tarife                                     -- konfigurierbar, Abschnitt 14
  id, schluessel, name
  preis_monat_netto, preis_jahr_netto
  enthaltene_benutzer, credits_monat
  stripe_preis_monat, stripe_preis_jahr, aktiv

abonnements
  id, mandant_id, tarif_id
  intervall, status, zusatznutzer
  stripe_kunde_id, stripe_abo_id
  laufend_bis, gekuendigt_zum

credit_konto                               -- Chargen, damit „ältestes zuerst“ gilt
  id, mandant_id
  herkunft                                 -- inklusiv | gekauft | test | gutschrift
  menge, verbraucht, reserviert
  gueltig_ab, gueltig_bis                  -- gekauft: 12 Monate

credit_buchungen                           -- unveraenderlich
  id, mandant_id, konto_id
  aktion, menge, richtung                  -- reservierung | verbrauch | freigabe |
                                           -- erstattung | zubuchung
  job_id, benutzer_id, kosten_cent
  erstattet_am, erstattung_grund
  erstellt_am

credit_preise                              -- Credits je Aktion, zentral konfigurierbar
  aktion (PK), credits, aktiv_ab
```

**Regeln, die im Schema verankert werden:**

- `credit_buchungen` erlaubt kein `UPDATE`/`DELETE` (Trigger) — unveränderbares Ledger.
- Kein negativer Saldo: eine Reservierung, die den verfügbaren Bestand übersteigt,
  scheitert bereits in der Datenbank.
- Verbrauch geht über `credit_konto` nach `gueltig_bis` aufsteigend — ältestes zuerst.
- Übertrag: höchstens ein reguläres Monatskontingent, nur in den unmittelbar folgenden
  Monat.
- Reservierung und Job-Einstellung laufen in **einer** Transaktion (siehe
  `ARCHITECTURE.md`, Abschnitt 3).

## 7. Jobs und Protokolle

```
jobs
  id, mandant_id, art, status
  nutzlast jsonb, ergebnis jsonb
  versuche, letzter_fehler
  credits_reserviert, kosten_cent
  erstellt_am, gestartet_am, beendet_am

audit_log                                  -- unveraenderlich, Abschnitt 16
  id, mandant_id, benutzer_id
  aktion, objektart, objekt_id
  vorher jsonb, nachher jsonb
  ip, zeitpunkt

support_zugriff                            -- Abschnitt 15
  id, plattform_benutzer_id, mandant_id
  grund, gewaehrt_von, gueltig_bis, beendet_am
```

Plattform-Administratoren erhalten keinen stehenden Zugriff auf Mandantendaten. Ein
Zugriff setzt einen begründeten, befristeten Eintrag in `support_zugriff` voraus; die
RLS-Policies prüfen ihn und jeder Zugriff landet im `audit_log`.

## 8. Verhältnis zum bestehenden Schema

Das Projekt enthält aus einem Vorentwurf `profiles` und `firma_stammdaten`. Abschnitt 0
erklärt beide für verwerfbar.

**Entscheidung: ersetzen, nicht fortführen.** `firma_stammdaten` ist auf einen einzelnen
Betrieb mit mehreren Standorten zugeschnitten und trägt Felder eines
Rechnungswesen-Moduls, das nach Abschnitt 2 entfällt (`rechnung_einleitung`,
`nummernkreis_prefix`, `kleinunternehmer`). `profiles` kennt nur `chef`/`mitarbeiter` und
Bedienzustände wie `tile_order`. Beide bringen keinen Mandantenbegriff mit.

Die erste Migration legt die neuen Tabellen an und entfernt die beiden Entwurfstabellen.
Es sind keine produktiven Daten betroffen: `firma_stammdaten` ist leer, `profiles` enthält
einen Testdatensatz.
