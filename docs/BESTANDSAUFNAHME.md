# Bestandsaufnahme der Referenz-Anwendung

**Stand:** 16.08.2026 · **Grundlage:** Master-Prompt Fassung 2, Abschnitte 0 und 1
**Analysierte Datei:** `reference/epworld-index.html` (Kompilat vom 10.08.2026)
**SHA256:** `659f78534242d753e4d1e6204d71cbfac568d25a7a50148ca40ca843ed58f80f`

> Diese Analyse ist **rein funktionale Referenz**. Aus ihr wird kein Code, kein Layout
> und kein Kennzeichen übernommen (Master-Prompt Abschnitt 1.4 und Abschnitt 2).
> Reproduzierbar über `scripts/analyse-referenz.sh`.

---

## 1. Vorgehen

Die Referenzdatei wurde zu keinem Zeitpunkt vollständig in den Arbeitskontext geladen
(Vorgabe Abschnitt 0). Die Auswertung erfolgte ausschließlich auf der Festplatte mit
`ripgrep`/`awk`-Extraktionen entlang von vier Ankern:

1. Supabase-Datenzugriffe (`.from(…)`, `storage.from(…)`, `.rpc(…)`),
2. Edge-Function-Aufrufe (`functions.invoke(…)`),
3. Modul- und Rechtekonstanten,
4. Komponenten- und Konstantendefinitionen auf oberster Ebene.

## 2. Kennzahlen

| Kennzahl | Wert |
|---|---:|
| Dateigröße | 22.005.554 Bytes (~21,0 MiB) |
| Zeilen gesamt | 64.638 |
| davon eingebettete Base64-Blobs | 9 Zeilen ≈ 18,7 MiB (**85 %** der Datei) |
| tatsächlicher Programmcode | 3.264.054 Bytes / 64.629 Zeilen |
| längste Einzelzeile | 17.619.695 Zeichen |
| React-Komponenten auf oberster Ebene | **218** |
| Datenbanktabellen | **51** |
| Storage-Buckets | **10** |
| Edge Functions | **53** |
| Datenbankfunktionen (RPC) | **10** |
| Module/Kacheln | 16 |
| Rechte-Stufen | 4 |

Die neun Blob-Zeilen enthalten zwei PNG-Logos sowie vier Office-Vorlagen
(Maklervertrag, Objektnachweis, Mietvertrag, Einwertungs-PPTX). Die
Einwertungs-Vorlage allein belegt 17,6 MB in einer einzigen Zeile.

## 3. Technischer Aufbau

Die Anwendung ist eine **einzelne HTML-Datei ohne Build-Schritt**. React 18 und alle
weiteren Bibliotheken werden zur Laufzeit per CDN nachgeladen:

| Bibliothek | Zweck |
|---|---|
| react / react-dom 18 (UMD) | UI, `React.createElement` statt JSX |
| @supabase/supabase-js 2 | Datenbank, Auth, Storage |
| jspdf 2.5.1, pdf-lib 1.17.1, pdfjs-dist 3.11.174 | PDF erzeugen, bearbeiten, lesen |
| html2canvas 1.4.1 | DOM → Bild für Exposé-Layouts |
| tesseract.js 5 | OCR |
| mammoth 1.7.2 | DOCX-Import |
| jszip 3.10.1 | Office-Vorlagen (DOCX/PPTX) füllen |
| leaflet 1.9.4 | Karten |
| qrcode-generator 1.4.4 | QR-Codes im Exposé |
| @azure/msal-browser 2.38.3 | Microsoft-Login für OneDrive/Mail |

Weitere externe Dienste: Microsoft Graph, Nominatim/OpenStreetMap, Geoportal MV,
Jotform, Yodeck (Digital Signage), CARTO-Basemaps, Google Fonts.

### Bewertung der Architektur

| Beobachtung | Konsequenz für ImmoOffice.ai |
|---|---|
| 218 Komponenten in einer Datei, kein Modulsystem, kein Build | Vollständig neu: Next.js + TypeScript, komponentenbasiert |
| Kein Typsystem, keine Tests erkennbar | TypeScript strict, Vitest/Playwright ab Phase 1 |
| Bibliotheken per CDN, keine Versionssperre | Reproduzierbar gepinnte Abhängigkeiten |
| Rechteprüfung `hatRecht()` läuft **nur im Browser** | Rechte serverseitig und per RLS erzwingen |
| Ein Benutzerkonto per E-Mail-Adresse fest im Code privilegiert | Keine personenbezogenen Sonderfälle im Code |
| Mitarbeiteranlage über `auth.signUp` als Workaround | Einladung über serverseitige Route mit Service-Rolle |
| Drei widersprüchliche Objektart-Taxonomien nebeneinander | Eine einzige, OpenImmo-orientierte Taxonomie |
| Fachdaten in JSONB-Blobs (`bewertungen.daten`) | Strukturierte, auswertbare Spalten |
| Kein Mandantenkonzept — `firma_id` nur als Standort-Zuordnung | Echte Mandantenfähigkeit ab Datenmodell |
| Office-Vorlagen als Base64 im Quelltext | Vorlagen als versionierte Storage-Objekte |

## 4. Module

Die Referenz kennt 16 Kacheln:

| Modul | Beschreibung laut Referenz |
|---|---|
| immobilien | Bestand & Neubau |
| kontakte | Adressbuch: Interessenten, Eigentümer, Notare |
| marketing | Logos & Vorlagen |
| verkauf | Verträge, Nachweise, Bewertung |
| vermietung | Mietverträge & Protokolle |
| schmiede | Exposé-Schmiede, KI-Texte |
| dokumente | Ablage & Geschäftsbriefe |
| kalender | Termine, Besichtigungen |
| onedrive | Firmen-Ablage |
| kundenportal | Eigentümer & Käufer |
| erinnerungen | Persönliche Notizen |
| werkzeuge | PDF-Werkzeuge |
| posteingang | E-Mails aus dem Postfach |
| rechnungen | Eigene Rechnungen stellen (sensibel) |
| finanzen | Liquidität & Rechnungen (sensibel) |
| admin | Mitarbeiter & Rechte (sensibel) |

### Rechtemodell

Vier Stufen (`chef`, `standortleitung`, `makler`, `assistenz`) belegen eine
Checkbox-Matrix pro Modul vor, die anschließend frei übersteuerbar ist. Der Ansatz
„Vorlage + individuelle Übersteuerung“ ist fachlich gut und wird übernommen. Nicht
übernommen wird die Umsetzung: Die Prüfung erfolgt ausschließlich clientseitig,
`role === "chef"` umgeht sie vollständig, und der Zugang zu einem Modul hängt an einer
im Code hinterlegten E-Mail-Adresse. Zudem ist die Granularität auf „Modul sichtbar
ja/nein“ beschränkt — es gibt keine Trennung zwischen Lesen, Schreiben und Löschen.

## 5. Datenmodell der Referenz

### Tabellen nach Themenfeld

| Themenfeld | Tabellen |
|---|---|
| Objekte | `immobilien`, `immobilie_datei`, `immobilie_eigentuemer`, `immobilie_portal_status`, `objektaufnahmen`, `objektaufnahme_fotos` |
| Neubauprojekte | `projekte`, `projekt_einheiten`, `projekt_ordner`, `projekt_dateien`, `projekt_zugaenge`, `projekt_kontakte`, `projekt_anfragen`, `projekt_nachrichten`, `projekt_updates`, `projekt_merkliste`, `projekt_aktivitaeten`, `projekt_kunden_dateien`, `reservierungen_neubau` |
| Kontakte | `kontakte`, `kontakt_objekt`, `eigentuemer`, `eigentuemer_objekte`, `eigentuemer_dokumente` |
| Vorgänge | `aktivitaeten`, `aktivitaets_log`, `notizen`, `notiz_tags`, `termine`, `vertraege`, `checkliste_items`, `mietanfragen` |
| Bewertung | `bewertungen`, `mpe_bausteine` |
| Notariat | `notar_laufzettel` |
| Energie | `verbrauchsausweis_antraege` |
| Firma/Nutzer | `profiles`, `firma_stammdaten`, `firma_kennzahlen` |
| Rechnungswesen | `rechnungen`, `rechnung_positionen`, `rechnung_kunden`, `finanzierungs_annahmen` |
| E-Mail | `mail_eingang`, `mail_versendet`, `mail_postfaecher`, `mail_absender_onedrive` |
| Fremdsysteme | `onoffice_objekte`, `onoffice_felder` |
| Sonstiges | `briefe`, `bewerber_einladungen` |

### Storage-Buckets

`immobilie-dateien`, `projekt-dateien`, `eigentuemer-dokumente`, `objektaufnahme-fotos`,
`profile-fotos`, `notar-anhaenge`, `marketing-print-vorlagen`, `ki-bilder`,
`bewertungen`, `shop-tv`

### Objektfelder

`immobilien` führt rund 75 Spalten. Fachlich vollständig erfasst sind: Stammdaten und
Nummernkreis, Adresse inklusive Etage und Wohnungsnummer, Hierarchie über
`stammobjekt_id`, Vermarktungsart, dreistufige Objektklassifikation, Status und
Auftragsart, Flächen, Zimmerzahlen, Baujahr, Kauf- und Mietpreise, Nebenkosten,
Hausgeld, Provisionen (innen/außen), vollständige Energieausweisangaben, Ist-/Soll-Miete,
Grunderwerbsteuersatz sowie strukturierte Felder für Highlights, Entfernungen und
Raumaufteilung.

Diese Feldabdeckung ist die inhaltlich wertvollste Erkenntnis der Analyse: Sie deckt den
Kern dessen ab, was OpenImmo verlangt, und dient als Vollständigkeitsprüfung für das
neue Datenmodell. Übernommen wird jedoch **keine Spaltenstruktur**, sondern nur die
fachliche Feldliste — das neue Modell wird gemäß Abschnitt 7 entlang der
OpenImmo-Feldlogik aufgebaut.

**Lücken gegenüber OpenImmo:** keine Geokoordinaten, kein strukturierter Ausstattungs-
katalog (nur Freitext), keine Objektzustandsklassifikation, keine
Vermarktungszeiträume, keine Mehrsprachigkeit, keine Portal-Übertragungsprotokolle
(`immobilie_portal_status` wird nur einmal referenziert).

## 6. Edge Functions

53 Funktionen, gruppiert nach Zweck:

| Gruppe | Funktionen |
|---|---|
| KI-Text | `generate-text`, `text-korrigieren`, `claude-chat`, `datei-namen-ki`, `news-briefing-erstellen` |
| KI-Bild | `ki-bildbearbeitung` |
| Dokumentenanalyse | `parse-expose`, `parse-maklervertrag`, `parse-objektnachweis`, `parse-energieausweis`, `parse-energieabrechnung`, `parse-einwertung`, `parse-zaehler`, `parse-schmiede-notizen`, `sprachmemo-auswerten`, `notiz-transkribieren`, `notiz-analysieren` |
| PDF-Erzeugung | `expose-pdf-erzeugen`, `mpe-pdf-erzeugen`, `rechnung-pdf-erzeugen`, `vertrag-pdf`, `brief-pdf-erzeugen`, `reservierung-pdf-erzeugen`, `reservierung-word-erzeugen` |
| Signatur | `signatur-vorgang-starten`, `signatur-token-validieren` |
| E-Mail | `mail-senden`, `mail-postfach-pull`, `mail-postfach-speichern`, `mail-ki-vorschlag`, `mail-zu-notiz`, `mail-zu-mietanfrage` |
| Eigentümerportal | `eigentuemer-einladen`, `eigentuemer-loeschen`, `eigentuemer-nachricht-senden`, `eigentuemer-person-hinzufuegen`, `eigentuemer-link-erneut-senden` |
| Bewertung | `bewertung-aus-aufnahme`, `energieausweis-schaetzen`, `energieausweis-auslesen` |
| Fremdsysteme | `onoffice-sync`, `onoffice-test`, `onoffice-objekt-anlegen`, `onoffice-objekt-speichern`, `onoffice-bilder`, `yodeck-api`, `jotform-poll` |
| Portal/Export | `portal-export-homepage`, `expose-rueckmeldung-melden` |
| Sonstiges | `entfernungen-berechnen`, `credentials-speichern`, `credentials-anzeigen`, `projekt-nachricht-antwort`, `bewerbertest-einladen` |

Bemerkenswert: Es gibt **keine** Warteschlange. Alle langlaufenden Aufgaben
(KI-Bildbearbeitung, PDF-Erzeugung, Portal-Export) laufen synchron im Request. Das
bestätigt die Vorgabe aus Abschnitt 4, eine echte Job-Verarbeitung einzuführen.

## 7. Fachlich wertvolle Konzepte

Diese Konzepte werden fachlich übernommen — technisch vollständig neu gebaut:

1. **Exposé-Schmiede** — KI-Texte je Kategorie (Haus/Wohnung/Grundstück/Gewerbe) mit
   getrennten Bausteinen für Objekt-, Lage- und Ausstattungsbeschreibung. Entspricht
   Abschnitt 8.
2. **Marktpreiseinschätzung** — die Referenz kennt bereits exakt die vier Verfahren
   „Vergleichswert-, Sachwert-, Ertragswert- und kombiniertes Verfahren“ sowie
   wiederverwendbare Textbausteine (`mpe_bausteine`) und vorbelegte Vorteils-,
   Nachteils- und Zielgruppenlisten. Das deckt sich unmittelbar mit Abschnitt 9.
   **Schwäche:** Ergebnisse liegen unstrukturiert in einem JSONB-Feld, die Ausgabe
   erfolgt über eine 17,6 MB große PPTX-Vorlage im Quelltext. Beides wird ersetzt.
3. **Objektaufnahme** — geführte Erfassung vor Ort mit Fotos, aus der eine Bewertung
   abgeleitet werden kann (`bewertung-aus-aufnahme`). Fachlich sehr sinnvoll.
4. **Einfache E-Signatur** — bereits vorhanden: öffentlicher Token-Link
   (`?signatur=TOKEN`), serverseitige Token-Validierung, Canvas-Unterschrift,
   Statusrückschreibung. Genau der Ansatz aus Abschnitt 11, dort aber um Hash,
   Zeitstempel, Audit-Trail und Mehrfachunterzeichner zu erweitern.
5. **Dokumenten-Parsing** — Import bestehender Verträge und Exposés mit Feld-
   erkennung. Entspricht dem in Abschnitt 11 geforderten Upload mit Felderkennung.
6. **Schaufensteraushang** — eigenes Ausgabeformat mit Energieskala, QR-Code und
   Statusbannern. Entspricht Vorlage 5 aus Abschnitt 8.
7. **Grundriss-Aufbereiter** — Canvas-basierte Nachbearbeitung von Grundrissen.
8. **Rechte als Vorlage mit Übersteuerung** — gutes Bedienkonzept, siehe Abschnitt 4.
9. **Globale Suche** über Objekte, Kontakte und Vorgänge.
10. **Aktivitätenhistorie** mit eigenem Log — Grundlage für Abschnitt 7.

## 8. Altmarken-Bestand

Im Kompilat finden sich 87 Treffer auf den Namen des Referenzunternehmens, 28 auf
dessen Domain und 8 auf den Produktnamen der Referenz-Anwendung, ferner zwei
eingebettete Logo-PNGs, eine fest verdrahtete Mitarbeiter-E-Mail-Adresse, ein
Netlify-Hostname und die Referenz eines zweiten, fremden Supabase-Projekts in
`eu-west-1`.

Konsequenzen, die im weiteren Verlauf gelten:

- Das fremde Supabase-Projekt wird **nicht angefasst**. ImmoOffice.ai nutzt
  ausschließlich `usguiggfciavwzkdfjgt` (`eu-central-1`), wie in Abschnitt 0 fixiert.
- `reference/` ist per `.gitignore` von der Versionierung ausgenommen. Die Referenz
  ist Arbeitsmaterial, kein Bestandteil des Produkts; ein Mitversionieren würde die
  in Abschnitt 2 geforderte Freiheit von Altkennzeichen im Repository unterlaufen.
- `scripts/marken-scan.sh` prüft das Repository fortlaufend gegen die Altmarken und
  ist Bestandteil der Definition-of-Done jeder Phase.

## 9. Ergebnis

Die Referenz ist fachlich deutlich reicher als ein typischer MVP — insbesondere bei
Objektfeldern, Exposé-Erzeugung, Marktpreiseinschätzung und Dokumenten-Parsing. Sie ist
technisch jedoch nicht fortführbar: eine Datei, kein Build, kein Typsystem, keine Tests,
clientseitige Rechte, keine Mandantenfähigkeit, keine Job-Verarbeitung.

Damit bestätigt sich die Vorgabe des Master-Prompts: **fachlich lernen, technisch
vollständig neu bauen.** Die konkrete Zuordnung je Funktion steht in
[`FUNKTIONSMATRIX.md`](FUNKTIONSMATRIX.md).
