# CLAUDE.md — harte Regeln für ImmoOffice.ai

Destillat des maßgeblichen Auftrags. **Vollständige Fassung:
[`docs/MASTERPROMPT.md`](docs/MASTERPROMPT.md) — bei Widersprüchen gilt dort.**

Zwei verbindliche Dokumente, klare Rangfolge:

| Dokument | Regelt | Rang |
|---|---|---|
| [`docs/MASTERPROMPT.md`](docs/MASTERPROMPT.md) | Technischer Rahmen, Phasen, Gates, **Scope** (WIE, WANN, OB) | **gewinnt** |
| [`docs/FUNKTIONSPROMPT.md`](docs/FUNKTIONSPROMPT.md) | Fachliche Funktionen je Modul (WAS) | nachrangig |

Der Funktionsprompt beschreibt auch Module, die der Masterprompt ausschließt.
Er kennzeichnet sie selbst mit „nur bauen, wenn im Scope" — **im Scope sind sie
nicht.** Siehe Abschnitt „Abgrenzung" weiter unten.

Zusätzlich gelten die sechs **Architektur-Grundprinzipien** des Funktionsprompts
für jedes Modul und sind Teil der Definition-of-Done: Objekt als Drehkreuz ·
verkettete Arbeitsschritte statt Insellösungen · KI-Auslese immer über ein
editierbares Formular · Hintergrundjobs mit Wächter · Rechte als Vorlage plus
Einzelhäkchen, serverseitig erzwungen · Bild-Pipeline mit Web-Variante.

## Produkt

Mandantenfähige SaaS-Plattform für deutsche Immobilienmakler und
Immobiliensachverständige. Oberfläche **vollständig deutschsprachig**, Struktur auf
spätere Internationalisierung vorbereitet. Keine Klick-Dummies — funktionsfähige
Software mit Datenbank, Auth, Rechten, Abrechnung, Tests und Deployment.

## Freigabepunkte — verbindliche Stopps

- **Gate A** (nach Phase 0): Bestandsaufnahme, Funktionsmatrix, Styleguide, Architektur,
  Datenmodell, OpenImmo-Mapping, Umsetzungsplan, Aufwandsschätzung vorlegen und auf
  ausdrückliche Freigabe warten. **Ohne Freigabe entsteht kein Phase-1-Code.**
- **Gate B** (vor Stripe-Livebetrieb und vor Phase 2): Kernflüsse demonstrieren,
  Cross-Tenant-Isolation durch Tests nachweisen, Preise und Rechtstexte freigeben lassen.

Darüber hinaus nur stoppen, wenn eine Entscheidung wirklich blockiert oder Zugangsdaten
beziehungsweise externe Freigaben nötig werden.

## Abgrenzung — nicht verhandelbar

In ImmoOffice.ai darf **an keiner Stelle** ein Kennzeichen des Referenzunternehmens
erscheinen: Name, Abkürzung, Logo, Favicon, Domain, E-Mail, Anschrift, Telefonnummer,
Ansprechpartner, Beispieldaten, Metadaten, Seitentitel, Open-Graph-Daten, Dateiname,
Variablenname, Kommentar, Seed-Datensatz, Standardwert, API-Payload, PDF-Metadatum oder
E-Mail-Vorlage.

- Prüfung: `scripts/marken-scan.sh` — Bestandteil der Definition-of-Done jeder Phase.
- `reference/` ist **nicht versioniert** und niemals Produktbestandteil.
- Das Supabase-Projekt der Referenz (`eu-west-1`) wird **nie** angefasst.

**Ersatzlos entfallen:** OneDrive · Bewerber/Einstellungstest · Kundenportal.
**Nicht übernehmen:** Posteingang/E-Mail-Client · Liquiditätsplanung · GoBD-Rechnungs-
modul · Shop-TV/Digital Signage · onOffice-Synchronisation · Provisionsrechner.
Ein öffentliches **Web-Exposé ist erwünscht** und gilt nicht als Kundenportal.

## Feste Rahmenbedingungen

- **Supabase:** ausschließlich Projekt `usguiggfciavwzkdfjgt`, Region `eu-central-1`.
  Kein neues Projekt anlegen. Bestehendes Minimal-Schema ist verwerfbarer Entwurf.
- **Branding fixiert** (nicht neu erfinden): Marineblau `#1B2A47` (dunkel `#12203B`),
  Gold `#B5934F` (hell `#C9AE72`), Hintergrund `#FAFAFA`, Karten `#FFFFFF`, Linien
  `#E6E8EB`, gedämpfter Text `#7A828C`. Wortmarke auf Poppins-Basis.
  Layout, Komponenten und Icons müssen dennoch eigenständig sein — keine umgefärbte
  Kopie der Referenz. Hochwertig und klar, ohne überladenen „KI-Look“.
- **Referenzdatei niemals vollständig laden.** Nur Analyse auf der Festplatte.
- **Keine Geheimnisse** im Repository oder im Client. Nur Umgebungsvariablen,
  dokumentiert in `.env.example`.

## Sicherheit und Mandantentrennung

- Jeder fachliche Datensatz trägt eine Mandantenzuordnung.
- Rechte werden **serverseitig und in der Datenbank** erzwungen (RLS) — niemals nur
  durch ausgeblendete Bedienelemente.
- Kein Zugriff über Frontend, API, Suche, Exporte, Storage-Pfade oder erratbare IDs auf
  fremde Mandanten.
- Sechs Rollen: Unternehmensinhaber · Administrator · Makler · Assistenz · Marketing ·
  Nur-Lese-Zugriff.
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

**OpenImmo hat Vorrang** vor Bildbearbeitung, Marketingeditor und E-Signatur.
Datenmodell und Exportgerüst in Phase 1, produktiver Portalexport zu Beginn von Phase 2.

## Qualität

Vor jedem Meilenstein: Typecheck, Linting, Unit- und Integrationstests, Produktions-Build,
Marken-Scan. Fehler beheben, bevor etwas als abgeschlossen gilt. Pflichttests unter
anderem für Cross-Tenant-Isolation, Credit-Reservierung/-Erstattung,
Stripe-Webhook-Idempotenz und schema-validen OpenImmo-Export.
