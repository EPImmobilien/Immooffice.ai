# Bauträger-Paket v2 — Abnahme, Mängel, Cockpit, QR, Bautenstand

Auftrag vom 07.10.2026 („FEATURE-PAKET BAUTRÄGER v2 – auf Bestand aufbauen,
alles verknüpfen"). Dieses Dokument hält den Befund zum Bestand, die
Entscheidungen und den Lieferstand für immoOffice.ai fest.

## 1. Bestand — wie die Teile heute zusammenhängen (geprüft 07.10.2026)

**Übergabeprotokoll** (`UebergabeprotokollPage`/`-Editor`, anwendung.js ab
Z. 57329). Ein Untertab in Vermietung („uebergabe", kontext vermietung) und
Verkauf (kontext verkauf). Sieben Schritte: Stammdaten, Schlüssel, Zähler,
Räume, Sonstiges, Unterschriften, Abschluss. Der Editor hält den ganzen
Datensatz im Zustand und schreibt ihn als Ganzes (`insert`/`update`).
Räume sind jsonb `{id, name, notizen, foto_data_urls[]}` — der Zustand ist
Freitext, Fotos liegen komprimiert (1600 px) als Base64 **im jsonb**, nicht
im Storage. Unterschriften: Canvas (`SignaturePad`), Base64 ohne Präfix in
`unterschrift_vermieter`/`_mieter`. Zähler per Foto rufen `parse-zaehler`.
Diktat gibt es im Protokoll nicht (nur in To-dos: `notiz-transkribieren`).
PDF entsteht clientseitig (`uebergabeProtokollAlsPDF`, jsPDF) und wird nur
heruntergeladen; bei Verkauf kann es ins Eigentümerportal
(`eigentuemer_dokumente`) oder per Mail-Entwurf (`epUebergabeProtokollMailen`)
gehen. **Verknüpfung zum Rest: keine.** Weder immobilie_id noch kontakt_id;
Objekt und Parteien sind Text, vorbelegt aus Mietvertrag/Maklervertrag/
Objektnachweis. Die RLS der Vorlage lässt nur Ersteller und Chef lesen.
Offline-Variante (`OfflineUebergabeprotokoll`, IndexedDB-Entwürfe, Ausgang
mit Sync) existiert, ohne Diktat und Zählerscan. In immoOffice liegen
derzeit **0 Protokolle** (die 15 sind Bestand der Vorlage-Instanz).

**Neubau** (`NeubauProjekteBereich`, ab Z. 24161, eine Komponente mit acht
Reitern: Einheiten, Dateien, Baufortschritt, Anfragen, Gewerke, Nachrichten,
Kunden-Zugänge, Aktivitäten). Käufer sind `projekt_zugaenge` (Rolle
interessent/reserviert/kaeufer/zurueckgetreten) mit `kontakt_id` zum
Adressbuch und `einheit_id`. `projekt_einheiten.immobilie_id` existiert als
Spalte, hat keinen Fremdschlüssel und **keine Oberfläche**; genutzt wird sie
nur beim Verknüpfen einer Reservierung mit dem Käufer. `projekt_kontakte`
(Reiter Gewerke) sind freie Zeilen ohne Bezug zum Adressbuch. **Für
`projekt_maengel` und `projekt_zahlungsplan` gibt es keine Oberfläche**;
Mängel entstehen nur über das Portal (`projekt-interaktion`, Aktion
mangel_melden) und lösen eine Mail an die Firmenadresse aus. Glocke =
Tabelle `aktivitaeten` (zielgruppe makler, gelesen_am), gefüllt per Trigger
bei Kundennachrichten; Push über `push-senden` (`x-push-secret`, Body
`{hinweis:{profile_id,titel,text,url}}`).

**Kundenportal.** `KundenportalPage` ist nur eine Kachelübersicht fürs
Eigentümer-/Käuferportal (`eigentuemer`-Tabelle). Das Neubau-Kundenportal
ist die **externe Projekt-Homepage** (`projekte.oeffentliche_url`) und
spricht fünf öffentliche Functions: `projekt-login` (Passwort, Session 30
Tage), `projekt-daten` (Projekt, Einheiten, freigegebene `projekt_dateien`,
Updates; eingeloggt zusätzlich Kundendateien, Merkliste, Anfragen,
Gewerke-Kontakte mit `fuer_kunden`, Nachrichten), `projekt-interaktion`
(merken, reservieren, Mangel melden, Nachricht), `projekt-upload`,
`projekt-wohnungen`. Dateien gehen durch `freigegeben` + Sichtbarkeit
(oeffentlich/interessent/kaeufer) und `zugang_id` für persönliche Dateien;
`projekt-datei-benachrichtigung` (Cron 5 min) mailt neue Freigaben.
`projekt-daten` liefert seit v7 weder Mängel noch Zahlungsplan.

**Querschnitt.** `todos` mit `todo_vorlage`/`todo_vorlage_schritt`
(offset_tage, rolle), `todo_vorgang`, `todo_verknuepfung` (objekt_typ als
CHECK: immobilie, kontakt, vertrag, mail_eingang, termin, rechnung,
bewertung, eigentuemer, objektnachweis, mietanfrage, akq_lead), `vermerke`
(immobilie_id, kontakt_id, ref_tabelle/ref_id, quelle klick|manuell|sipgate),
`termine` (art frei). Cron-Jobs rufen Edge Functions mit
`Authorization: Bearer <anon_key aus Vault>` über `eigene_funktions_url()`.
Mail ohne Nutzerpostfach: Resend (`RESEND_API_KEY`), Absender aus dem
Postfach des Mandanten (`holePostfach`), sonst SMTP.

**Folgerung.** Alles, was der Auftrag verlangt, lässt sich auf diesen
Bestand setzen: das Protokoll bekommt Fremdschlüssel und einen Neubau-Modus,
`projekt_maengel` wird die eine Mängeltabelle, `projekt_kontakte` bekommt
den Adressbuch-Bezug und den Token, die Zeitleisten (`vermerke`,
`projekt_aktivitaeten`, `aktivitaeten`, `todo_verknuepfung`) werden
mitgeschrieben. Kein neues Protokoll-Modul, keine neue UI-Bibliothek.

## 2. Was gebaut wurde (Stand 07.10.2026)

Reihenfolge wie im Auftrag: A Verknüpfungen → C Abnahme → D Mängel/Fristen
→ B Cockpit → E QR → F Bautenstand/MaBV. Entscheidungen mit Grund in
`docs/ENTSCHEIDUNGEN.md` (Eintrag „Bauträger-Paket v2"), Offenes in
`docs/OFFEN.md`.

### Migrationen (additiv, Bestand bleibt lauffähig)

| Datei | Inhalt |
|---|---|
| `20261007300000_fork_84_bautraeger_verknuepfungen.sql` | `uebergabeprotokoll`: immobilie_id, projekt_id, einheit_id, zugang_id, kontakt_ids, signatur_vorgang_id, pdf_datei_id, pdf_pfad, frist_standard_tage, abgeschlossen_am, termin_id; Typen neubau_vorabnahme/abnahme/nachabnahme; Team liest/pflegt Protokolle mit Projekt. `projekt_maengel`: zugang_id optional, quelle, protokoll_id, raum, gewerk, projekt_kontakt_id, frist, nachfrist, kategorie, erledigt_fotos, verlauf, todo_id, handwerker_token, termin_am, Zeitstempel, erstellt_von; Status-CHECK. `projekt_kontakte`: kontakt_id, portal_token, aktiv. `projekt_einheiten`: FK immobilie_id, raeume. `todo_verknuepfung`: mangel, protokoll, einheit, projekt. `vermerke.quelle`: system. Funktion `objekte_zu_adresse()`. |
| `20261007310000_fork_85_bautraeger_maengel_workflow.sql` | `projekte`: mahnung_automatisch, frist_standard_tage, gewerke. Trigger: Statuswechsel → Verlauf (+ Zeitstempel), geprüft → To-do erledigt. Funktionen `mangel_verlauf_anhaengen()`, `projekt_glocke()`, `maengel_vorlage_sicherstellen()` (To-do-Vorlage „Mängelbeseitigung", 4 Schritte, je Mandant bei Bedarf). Cron `maengel-fristen-taeglich` 06:20. Credit-Preis `mangel_text` (1), KI-Einstellung. |
| `20261007320000_fork_86_bautraeger_qr_bautenstand.sql` | `projekt_einheiten.qr_token`. Tabelle `projekt_bautenstand` (RLS, Einstufung MANDANT). `projekt_zahlungsplan`: abschnitte, angefordert_am, hinweis_am. `rate_anforderbar()`; Trigger Bautenstand → Glocke „Rate x anforderbar" (einmal). |

### Edge Functions (`supabase/eigene/`, Beilage `_bautraeger/bautraeger.ts`)

| Function | verify_jwt | Aufgabe |
|---|---|---|
| `abnahme-abschliessen` | ja | Protokoll abschließen: PDF ablegen (nicht freigegeben), Mängel aus den Räumen anlegen, To-dos aus der Vorlage, Sammelmail je Handwerker, Glocke/Push/Mail an die Verwaltung, Vermerke, Aktivität. Aktionen `mangel_beauftragen`, `mangel_zurueck` für einzelne Mängel (Kundenmeldungen). |
| `handwerker-portal` | nein (Token) | GET: Mängel des Handwerkers; POST: Termin, Erledigt (Pflicht-Foto), Rückfrage → Status, Verlauf, Aktivität, Glocke, To-do „prüfen"/„Rückfrage". |
| `maengel-fristen` | ja (Cron, anon-Bearer) | Frist −3 Tage: Erinnerung; Frist überschritten: 2. Erinnerung, To-do „Mahnung" mit Entwurf (oder automatisch je Projekt), Nachfrist, Verlauf, Vermerk, Glocke. |
| `mangel-text` | ja (Credits) | Diktat → Titel, Beschreibung, Gewerk (nur aus der Projektliste), Kategorie. claude-sonnet-4-6 über die KI-Steuerung. |
| `einheit-qr` | nein (Token) | Projektname, Ort, Einheitennummer, Geschoss, Bauträger — sonst nichts. |

`projekt-daten` (Vorlage, per FORK-Regel): liefert dem angemeldeten Käufer
zusätzlich `maengel` (mit Statustext) und `protokolle`; alles Übrige
unverändert, die externe Portalseite bricht nicht.

### Frontend-Anker (FORK-Regeln in `scripts/oberflaeche-zerlegen.py`, Module in `src/eigene/bautraeger-*.js`)

| Stelle in der Vorlage | Haken | Modul |
|---|---|---|
| `UebergabeprotokollEditor` Anfangszustand | `window.ImmoProtokollVorbelegung()` | basis |
| `UpStepStammdaten` Kopfzeile | `ImmoProtokollVerknuepfung` (Objekt, Projekt, Einheit, Käufer, Kontakte, Adressvorschlag, Standardfrist); Typwahl zeigt bei Projekt die drei Neubau-Typen; Parteien heißen Bauträger/Käufer | protokoll |
| `UpStepRaeume` je Raum unter den Notizen | `ImmoRaumMaengel` („+ Mangel": Diktat, Fotos, Gewerk → Handwerker, Frist, Kategorie) | protokoll |
| `UpStepUnterschriften` | Bauträger/Käufer | — |
| `UpStepAbschluss` | `ImmoAbnahmeAbschluss` statt Eigentümerportal-Push bei Projekt; bekommt `immoSpeichern`, `immoProtokollId` | protokoll |
| `uebergabeProtokollAlsPDF` | Titel „ABNAHMEPROTOKOLL", Neubau-Typ, Bauträger/Käufer, `ImmoMaengelInsPdf` je Raum | protokoll |
| `NeubauProjekteBereich` Reiterleiste | Reiter „Cockpit" → `ImmoNeubauCockpit` (mit `ImmoWohnungsakte`, `ImmoMaengelTafel`) | cockpit |
| Einheitenzeile | Knopf „📁 Akte" | cockpit |
| Projektliste nach dem Laden, `ImmobilienPage` Reiter | Start aus `?qr=`/`?akte=` (`window._immoNeubauStart`) | portal |
| Seitenstart | `?handwerker=` → Handwerker-Seite als Overlay; `?qr=` ohne Anmeldung → Hinweis | portal |

### Verknüpfungskette (Auftrag A, geprüft in `tests/bautraeger.sql`)

Einheit ↔ CRM-Objekt (`projekt_einheiten.immobilie_id`, FK; Akte setzt es)
↔ Käufer (`projekt_zugaenge` + `kontakt_id`) ↔ Protokoll (`einheit_id`,
`zugang_id`, `kontakt_ids`, `immobilie_id`) ↔ Mängel (`protokoll_id`,
`einheit_id`, `zugang_id`) ↔ Gewerk/Handwerker (`projekt_kontakt_id`,
`projekt_kontakte.kontakt_id`) ↔ Fristen (`frist`, `todos` über `todo_id`,
`todo_verknuepfung` mangel/protokoll/einheit/immobilie, `termine` Art
„Abnahme") ↔ Erinnerungen (`maengel-fristen`, `erinnert_am`, `mahnung_am`)
↔ Vermerke/Zeitleiste (`vermerke` mit immobilie_id/kontakt_id,
`projekt_aktivitaeten`, `aktivitaeten` = Glocke, `verlauf` je Mangel) ↔
Kundenportal (`projekt-daten`: maengel, protokolle; PDF als persönliche
Datei nach Freigabe) ↔ Zahlungsplan (`abschnitte`, `projekt_bautenstand`,
`rate_anforderbar()`).

## 3. Gates

- `tests/bautraeger.sql` — Verlauf, To-do-Kopplung, Ratenregel (einmaliger
  Glockeneintrag), CHECKs, Adressabgleich, Team-Richtlinie, Mandantengrenze.
- `tests/bautraeger.js` — 64 statische Prüfungen zu Functions, Oberfläche,
  Regeln, Erzeuger, Konfiguration und Gate-Büchern.
- Eingetragen in `tests/funktionen-oeffentlich.py` (handwerker-portal,
  einheit-qr), `tests/funktionen-angemeldet.py` (abnahme-abschliessen,
  maengel-fristen), `tests/dienstschluessel-mandant.py` (maengel-fristen),
  `tests/vorlage-vollstaendig.sql` (Zuwachs), `tests/mandantentabellen.txt`.

## 4. Nachtrag v3 (07.10.2026): QR-Unterlagen, Grundriss, Kaufvertrag, Post

Auf Zuruf des Auftraggebers nach der ersten Abnahme des Pakets.

| Wunsch | Umsetzung |
|---|---|
| QR-Code zeigt den Gewerken Unterlagen und Nachrichten, einseitig, dazu Login für Autorisierte | `?qr=` öffnet ohne Anmeldung eine eigene Seite: Projekt, Einheit, **Hinweise** (`projekte.qr_hinweis`, `projekt_einheiten.qr_hinweis`) und **Unterlagen** mit `projekt_dateien.qr_sichtbar` (per CHECK nie eine persönliche Käuferdatei). Kein Chat, keine Antwort — wer antworten soll, hat seinen Handwerker-Link. Knopf „Anmelden" blendet die Seite aus; nach der Anmeldung öffnet sich die Wohnungsakte. Function `einheit-qr` (fork_87). |
| Gewerke aus dem Adressbuch, automatische Mail | Cockpit → ⚙ Einstellungen → „Handwerker aus dem Adressbuch hinzufügen" (Gewerk + Kontaktsuche). Legt `projekt_kontakte` mit `kontakt_id` an und ergänzt im Adressbuch die Rolle **Dienstleister / Handwerk** (die Vorlage kennt sie schon). Aufträge, Erinnerungen, Mahnungen gehen an die E-Mail des Kontakts. |
| Grundriss je Einheit, Mangel mit X markieren, nur für Gewerke | Akte → „Grundriss hochladen" (Bild oder PDF; PDF wird mit pdf.js zu PNG) → `projekt_einheiten.grundriss_datei`. Im Protokoll je Mangel „📍 Im Grundriss markieren" → `grundriss_position {x,y}` (0–1), beim Abschluss in `projekt_maengel`. Der **Mängelplan** steht in der Akte und im Handwerker-Link; das Käufer-PDF enthält keinen Grundriss (`ImmoMaengelInsPdf` zeichnet nur Text und Fotos). |
| 13 MaBV-Abschnitte zu 7 Raten bündeln | Gab es je Rate per Klick; neu der Knopf **„Standardplan: 7 Raten aus 13 Abschnitten"** (`IMMO_RATEN_STANDARD`, Summe der Höchstsätze 100 %, Beträge aus dem Kaufpreis). |
| Kaufvertrag hinterlegen und auslesen | Akte → „Kaufvertrag (PDF) hochladen" → „Auslesen (KI, 3 Credits)": Function `kaufvertrag-lesen` gibt dem Modell das PDF als Dokument und liefert Kaufpreis, Übergabe, Notar/Urkunde, Raten mit Abschnitten und **Sonderleistungen**, jeweils mit Belegstelle. Übernahme per Haken: Kaufpreis → Einheit, Raten → Zahlungsplan (nur wenn leer), Sonderleistungen → Liste. Gespeichert in `kaufvertrag_daten`/`sonderleistungen`. |
| Sonderleistungen dürfen nicht untergehen | Block „Sonderleistungen" in der Akte mit Häkchen, dazu Erinnerung im Protokoll (Schritt Stammdaten, sobald die Einheit gewählt ist). |
| Mails von Käufer und Handwerkern je Einheit bündeln | Block „Post zu dieser Einheit": `mail_eingang` nach `immobilie_id` der Einheit **oder** Absenderadresse von Käufer/Handwerkern; Klick öffnet die Mail im Posteingang. |

### Schnittstellen, die das Paket nutzt oder nutzen kann

- **Vorhanden und genutzt:** `notiz-transkribieren` (Whisper, Diktat), `parse-zaehler`, `push-senden` (APNs), Resend-Mail über das Mandantenpostfach, `projekt-daten`/`projekt-interaktion` (externes Kundenportal), `mail_eingang` (IMAP-Abruf der Vorlage) für die Post je Einheit, Kalender (`termine`), To-dos mit Vorlagen, jsPDF und qrcode-generator im Browser, pdf.js für Grundriss-PDFs.
- **Vorhanden, nicht angebunden:** E-Signatur (`signatur-vorgang-starten`, braucht `vertrag_id`), OneDrive-Ablage (`eigentuemer-dokument-onedrive-push`), OpenImmo/Portalexport (für Einheiten als Objekte), Stripe (nur Abrechnung des Betreibers, nicht für Käuferraten).
- **Nicht vorhanden, bei Bedarf prüfbar:** Bank-Schnittstelle für Zahlungseingänge (Raten „bezahlt" ist heute ein Klick), DATEV-Export der Raten, Kalender-Sync (Microsoft 365 steht hinter Funktionsschalter bis Phase 2b), Dokumenten-Signatur durch einen Vertrauensdiensteanbieter.
