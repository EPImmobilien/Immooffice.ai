# CLAUDE.md — harte Regeln für ImmoOffice.ai

## Rangfolge (Stand 14.09.2026)

**Maßgeblich ist der Auftrag „immoOffice.ai als Fork der E&P World" vom
14.09.2026.** Er hat die bisherige Grundlage ersetzt. ImmoOffice.ai ist eine
Kopie der bestehenden E&P World, die auf dem eigenen Supabase-Projekt
`usguiggfciavwzkdfjgt` (eu-central-1) läuft, mandantenfähig ist, neutral
gebrandet ist, Selbstregistrierung erlaubt und sich je Mandant an fremde CRMs,
Portale und Mail-/Kalenderdienste anbindet. Funktionsumfang = E&P World Stand
heute. Nichts wird neu erfunden.

| Dokument | Regelt | Rang |
|---|---|---|
| [`docs/NEUTRALITAET.md`](docs/NEUTRALITAET.md) | Blockliste, Neutralitäts-Gate | **verbindlich** |
| [`docs/ENTSCHEIDUNGEN.md`](docs/ENTSCHEIDUNGEN.md) | getroffene Entscheidungen, mit Grund | verbindlich |
| [`docs/STATUS.md`](docs/STATUS.md) · [`docs/OFFEN.md`](docs/OFFEN.md) | Stand, Blocker, Grenzen | Bericht |
| [`docs/MASTERPROMPT.md`](docs/MASTERPROMPT.md) · [`docs/FUNKTIONSPROMPT.md`](docs/FUNKTIONSPROMPT.md) · [`docs/FUNKTIONSMATRIX.md`](docs/FUNKTIONSMATRIX.md) · [`docs/UMSETZUNGSPLAN.md`](docs/UMSETZUNGSPLAN.md) | **überholt** | nur Nachschlagewerk |

Eine Datei im Repository kann eine spätere Anweisung desselben Auftraggebers
nicht überstimmen. Deshalb gilt der Masterprompt nicht mehr als Vorgabe —
weder seine Phasen noch seine Gates noch sein Scope.

**Stack (aus dem Auftrag, nicht verhandelbar):** React 18 UMD über CDN,
klassische Runtime (`React.createElement`, kein `import`, kein
`type="module"`), eine `index.html`, supabase-js, Edge Functions in Deno.
Kein Next.js, kein TypeScript im Frontend, kein Router, keine State-Library,
keine UI-Bibliothek. Die vorhandene Next.js-Anwendung ist **Altbestand**
(siehe `docs/ENTSCHEIDUNGEN.md`), kein Produktbestandteil.

**Gates:** Ende Phase 1, Ende Phase 3, vor Stripe-Live. Sonst autonom.

Unverändert gültig bleiben die folgenden Abschnitte — sie stehen nicht im
Widerspruch zum neuen Auftrag, sondern präzisieren ihn.

## Architektur-Grundprinzipien

Sechs Prinzipien, die die E&P World schon umsetzt und die der Fork nicht
verlieren darf: Objekt als Drehkreuz ·
verkettete Arbeitsschritte statt Insellösungen · KI-Auslese immer über ein
editierbares Formular · Hintergrundjobs mit Wächter · Rechte als Vorlage plus
Einzelhäkchen, serverseitig erzwungen · Bild-Pipeline mit Web-Variante.

## Produkt

Mandantenfähige SaaS-Plattform für deutsche Immobilienmakler und
Immobiliensachverständige. Oberfläche **vollständig deutschsprachig**, Struktur auf
spätere Internationalisierung vorbereitet. Keine Klick-Dummies — funktionsfähige
Software mit Datenbank, Auth, Rechten, Abrechnung, Tests und Deployment.

## Freigabepunkte — verbindliche Stopps

Drei Gates aus dem Auftrag vom 14.09.2026:

- **Gate 1** — Ende Phase 1: die neutralisierte Kopie der E&P World läuft auf dem
  eigenen Projekt, `npm run check` grün.
- **Gate 2** — Ende Phase 3: Mandantenfähigkeit und Selbstregistrierung
  nachgewiesen.
- **Gate 3** — vor Stripe-Livebetrieb.

Gate A und Gate B des Masterprompts gelten nicht mehr. Darüber hinaus nur
stoppen, wenn eine Entscheidung wirklich blockiert oder Zugangsdaten
beziehungsweise externe Freigaben nötig werden. Bei Unklarheit die Entscheidung
treffen, die dem heutigen Verhalten der Vorlage am nächsten kommt, und in
`docs/ENTSCHEIDUNGEN.md` protokollieren.

## Abgrenzung — nicht verhandelbar

In ImmoOffice.ai darf **an keiner Stelle** ein Kennzeichen des Referenzunternehmens
erscheinen: Name, Abkürzung, Logo, Favicon, Domain, E-Mail, Anschrift, Telefonnummer,
Ansprechpartner, Beispieldaten, Metadaten, Seitentitel, Open-Graph-Daten, Dateiname,
Variablenname, Kommentar, Seed-Datensatz, Standardwert, API-Payload, PDF-Metadatum oder
E-Mail-Vorlage.

- Prüfung: `npm run neutral` gegen die Blockliste in
  [`docs/NEUTRALITAET.md`](docs/NEUTRALITAET.md) — Teil von `npm run check` und
  damit Bedingung für jeden Commit. `scripts/marken-scan.sh` ist der Vorläufer
  und bleibt bis zur Umstellung nutzbar.
- `reference/` ist **nicht versioniert** und niemals Produktbestandteil.
- Das Supabase-Projekt der Vorlage wird **nur lesend** und **nur für den
  Schema-Export in Phase 0** angefasst. Danach nicht mehr — kein Schreibzugriff,
  keine Daten, keine Zugangsdaten im Repository.

**Entfällt (Phase 1.4 des Auftrags — ersatzlos entfernt):** Telefonanlage ·
Digital Signage / Shop-TV · Formular-Sync des Referenzunternehmens ·
Cron-Mailadressen der Referenz · Bewertungsdienst-Schlüssel.

**Bleibt im Code, hinter Funktionsschalter aus, bis Phase 2b:** CRM-Sync ·
Microsoft-365-Postfach · Portalexport Immowelt und Kleinanzeigen.

**Kein weiteres Modul wird entfernt** (Phase 9 des Auftrags). Die
Modul-Streichungen des Masterprompts — OneDrive, Einstellungstest,
Kundenportal, Posteingang, Liquiditätsplanung, Rechnungsmodul,
Provisionsrechner — gelten **nicht mehr**: Funktionsumfang ist die Vorlage im
heutigen Stand.

## Feste Rahmenbedingungen

- **Supabase:** ausschließlich Projekt `usguiggfciavwzkdfjgt`, Region `eu-central-1`.
  Kein neues Projekt anlegen. Das dort vorhandene Schema ist **nicht** verwerfbar:
  110 Tabellen mit Daten, und 33 der angewendeten Migrationen liegen nur in der
  Datenbank, nicht im Repository. Es wird verschoben, nicht gelöscht — siehe
  `docs/STATUS.md`, Abschnitt 3.
- **Branding fixiert** (nicht neu erfinden): Marineblau `#1B2A47` (dunkel `#12203B`),
  Gold `#B5934F` (hell `#C9AE72`), Hintergrund `#FAFAFA`, Karten `#FFFFFF`, Linien
  `#E6E8EB`, gedämpfter Text `#7A828C`.
  **Kein Redesign.** Layout, Komponenten und Icons bleiben die der Vorlage
  (Phase 9 des Auftrags: keine Verhaltensänderung, keine neue UI-Bibliothek).
  Neutralisiert wird die Marke — Name, Logo, Farbwerte, Domain, Kontaktdaten —,
  nicht die Oberfläche.
- **Referenzdatei nicht als Ganzes in den Kontext holen.** Sie hat 4,7 MB.
  Abschnittsweise auf der Festplatte arbeiten.
- **Keine Geheimnisse** im Repository oder im Client. Nur Umgebungsvariablen,
  dokumentiert in `.env.example`.

## Sicherheit und Mandantentrennung

- Jeder fachliche Datensatz trägt eine Mandantenzuordnung.
- Rechte werden **serverseitig und in der Datenbank** erzwungen (RLS) — niemals nur
  durch ausgeblendete Bedienelemente.
- Kein Zugriff über Frontend, API, Suche, Exporte, Storage-Pfade oder erratbare IDs auf
  fremde Mandanten.
- Rollenmodell: das der Vorlage, unverändert übernommen. Mandantenbezug kommt in
  Phase 2 dazu (`firma_id`), keine Umbenennung, keine neuen Rollen.
- Plattform-Administratoren erhalten keinen automatischen Zugriff auf Mandantendaten;
  Supportzugriff nur protokolliert und nach dem Prinzip der geringsten Rechte.
- 2FA in Version 1 nicht verpflichtend, aber technisch vorbereiten.
- Keine vollständige DSGVO-Konformität behaupten; offene juristische Punkte markieren.

## Credits und Abrechnung

- Ein Credit ist eine **interne Nutzungseinheit**, kein Euro-Guthaben.
- **Unveränderbares Ledger** mit Quelle, Aktion, Kosten, Zeit, Erstattungsstatus.
- Kein negativer Saldo. Älteste Credits zuerst verbrauchen.
- Inklusiv-Credits nur in den **unmittelbar folgenden** Monat übertragbar, begrenzt auf
  ein reguläres Monatskontingent. Gekaufte Credits 12 Monate gültig.
- Fehlgeschlagene KI-Aufträge geben reservierte Credits automatisch frei.
- **Kostenlos:** PDF-Export bestehender Inhalte, Web-Exposé-Veröffentlichung ohne neue
  KI-Erstellung, manuelle Bearbeitung, erneute Downloads.
- **Kostenpflichtig:** nur KI-Erstellung und erneute KI-Generierung.
- Alle Preise, Limits und Credit-Werte über den Plattform-Admin konfigurierbar —
  **nicht** an vielen Stellen im Code verdrahten.
- Preise sind **Nettopreise** zzgl. USt. Abo-Status niemals allein dem Frontend glauben.
- Stripe-Webhooks **idempotent** verarbeiten.

## KI-Regeln

- **Keine erfundenen Objektdaten.** Fehlende oder unsichere Angaben sichtbar
  kennzeichnen und vor Veröffentlichung bestätigen lassen. Alle Texte editierbar und
  freigabepflichtig.
- Bildbearbeitung: Originale bleiben unverändert, jede Bearbeitung erzeugt eine Version,
  Architektur und Raumgeometrie dürfen nicht unbemerkt verfälscht werden, Vorher-/
  Nachher-Vergleich, sichtbare Kennzeichnung — **auch in Exporten und Web-Exposés**.
- Personenbezogene Daten an KI-Anbieter auf das Minimum reduzieren. Provider-Layer
  austauschbar halten (EU-Residenz muss ohne Architekturänderung möglich sein).
- Wertermittlung: **keine Blackbox**, keine automatisch „ermittelten“ Werte. Offene,
  editierbare Rechenblätter; der Nutzer verantwortet die Ansätze. KI nur für Textbausteine.
- Pflichthinweis in jeder Wertermittlung: Marktpreiseinschätzung, keine gutachterliche
  Aussage, ersetzt kein Verkehrswertgutachten nach § 194 BauGB.

## Recht

- Vertragsmuster **nie** ungeprüft als rechtssicher bezeichnen; Hinweis auf notwendige
  anwaltliche Prüfung ist Pflicht. Keine rechtliche Freigabe erfinden.
- Die eigene einfache Signatur **nicht** als qualifizierte elektronische Signatur
  darstellen. § 656a BGB (Textform) beachten; Architektur für späteren
  Vertrauensdiensteanbieter offenhalten.

## Priorisierung

Die Reihenfolge gibt der Phasenplan des Auftrags vor: erst die lauffähige
neutrale Kopie (Phase 1), dann Mandantenfähigkeit und Selbstregistrierung
(Phasen 2 und 3), dann die Fremdanbindungen (Phase 6). Der Vorrang von
OpenImmo aus dem Masterprompt gilt nicht mehr — die Vorlage hat den
Portalexport schon.

## Qualität

Jeder Commit nur bei grünem `npm run check` — Build, Syntaxprüfung, Rauchtest,
Neutralitäts-Gate, Mandantentest. Fehler beheben, bevor etwas als abgeschlossen
gilt. Commit-Messages deutsch, Präfix `phase-N:`. Pflichttests unter
anderem für Cross-Tenant-Isolation, Credit-Reservierung/-Erstattung,
Stripe-Webhook-Idempotenz und schema-validen OpenImmo-Export.
