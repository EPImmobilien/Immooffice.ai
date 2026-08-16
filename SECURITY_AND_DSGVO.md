# Sicherheit und Datenschutz

**Stand:** 16.08.2026 · Master-Prompt Abschnitt 16 · Phase 0

> **Wichtige Einordnung.** Dieses Dokument beschreibt **technische Voraussetzungen**.
> Es behauptet ausdrücklich **keine** vollständige DSGVO-Konformität. Datenschutz
> entsteht aus Technik, Verträgen und Organisation gemeinsam; die beiden letzteren
> liegen beim Betreiber. Offene Punkte sind in Abschnitt 9 benannt und **vor
> Produktivbetrieb zu klären** — mehrere davon erfordern juristische Prüfung.

---

## 1. Wo Daten liegen

| Verarbeitung | Anbieter | Region | Status |
|---|---|---|---|
| Datenbank, Authentifizierung, Dateien | Supabase | `eu-central-1`, Frankfurt | festgelegt |
| Anwendung und Auslieferung | Netlify | EU-Auslieferung, Anbieter USA | **AVV und Transfergrundlage prüfen** |
| KI-Texte und -Bilder | OpenAI | EU-Datenresidenz, sofern im Konto verfügbar | **prüfen und aktivieren** |
| Zahlungen | Stripe | EU-Gesellschaft | **AVV prüfen** |
| Transaktionsmails | offen | EU verpflichtend | **Anbieter noch zu wählen** |
| Kalender | Google / Microsoft | Anbieter USA | Phase 2, nur nach Einwilligung |
| Schriften | selbst ausgeliefert | eigener Server | erledigt |

Schriften werden über `next/font` zur Bauzeit geholt und danach vom eigenen Server
ausgeliefert. Zur Laufzeit entsteht **keine** Verbindung zu einem Font-CDN — die
IP-Adresse der Nutzer wird nicht an Dritte übertragen. Das ist bewusst so gelöst; die
Referenz-Anwendung lud ihre Schriften bei jedem Aufruf von einem fremden CDN.

## 2. Mandantentrennung

Drei Ebenen, absichtlich redundant (siehe `ARCHITECTURE.md`):

1. **Row-Level-Security** auf jeder fachlichen Tabelle über `mandant_id`.
2. **Serverseitige Prüfung** von Mandant, Rolle und Aktion in jeder Server Action.
3. **Storage-Policies** auf dem ersten Pfadsegment (`mandant_id/...`).

Schlüssel sind UUIDs, damit IDs nicht erratbar sind. Die Dienstrolle umgeht RLS und ist
auf drei Stellen begrenzt: Benutzereinladung, Stripe-Webhooks, Job-Worker.

**Nachweis:** Cross-Tenant-Isolation wird durch automatisierte Tests belegt (`pgtap`
direkt in der Datenbank, ergänzt um Integrationstests). Gate B verlangt diesen Nachweis
ausdrücklich.

## 3. Authentifizierung

- Anmeldung über Supabase Auth, Sitzungen in `HttpOnly`-Cookies.
- Passwortregeln: Mindestlänge 12 Zeichen, Abgleich gegen bekannte geleakte Passwörter.
- Zwei-Faktor-Verfahren ist in Version 1 **nicht verpflichtend** (Abschnitt 16), aber
  technisch vorbereitet: Das Benutzermodell trägt die nötigen Felder, und die
  Anmeldung ist als eigener Schritt gekapselt.
- Einladung neuer Benutzer serverseitig über die Dienstrolle — **nicht** über
  `signUp` wie in der Referenz, wo jeder Aufrufer die Rolle mitgeben konnte.

## 4. Auslieferungssicherheit

Alle Kopfzeilen werden in `src/middleware.ts` je Anfrage gesetzt:

| Kopfzeile | Wert |
|---|---|
| `Content-Security-Policy` | Nonce je Anfrage, `strict-dynamic`, kein `unsafe-inline` für Skripte |
| `Strict-Transport-Security` | zwei Jahre, Subdomains, Preload |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` / `frame-ancestors` | `DENY` / `'none'` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Kamera, Mikrofon, Standort, Zahlung gesperrt |

**Erfahrung aus Phase 0.** Eine Policy mit `script-src 'self'` blockiert die
Inline-Startskripte von Next.js. Die Seite rendert dann vollständig, hydratisiert aber
nie — die Anwendung sieht funktionsfähig aus, reagiert aber auf keine Eingabe. Der
Fehler ist im Betrieb schwer zu erkennen, weil im Protokoll nur ein verkürzter
React-Fehler steht. Statt `'unsafe-inline'` zu erlauben und damit den wichtigsten
Schutz gegen Cross-Site-Scripting aufzugeben, wird je Anfrage eine Nonce gesetzt.
**Konsequenz für Tests:** Jede Änderung an der CSP muss gegen eine echte Browsersitzung
geprüft werden, nicht nur gegen den ausgelieferten HTML-Text.

## 5. OWASP Top 10

| Risiko | Maßnahme |
|---|---|
| Kaputte Zugriffskontrolle | RLS plus serverseitige Prüfung; UUIDs; Tests |
| Kryptografiefehler | TLS im Transport, Verschlüsselung im Ruhezustand bei Supabase; Mandanten-Zugangsdaten über `supabase_vault` |
| Injektion | Parametrisierte Abfragen über den Supabase-Client, keine Zeichenkettenverkettung in SQL |
| Unsicheres Design | Rechte serverseitig; Credit-Reservierung transaktional |
| Fehlkonfiguration | Sicherheitskopfzeilen zentral; keine Standardpasswörter; `poweredByHeader` aus |
| Veraltete Komponenten | Exakt gepinnte Abhängigkeiten, regelmäßige Prüfung |
| Authentifizierungsfehler | Supabase Auth, Rate Limits, 2FA vorbereitet |
| Integritätsfehler | Keine Skripte von fremden CDNs; CSP mit Nonce |
| Fehlende Protokollierung | Unveränderbares `audit_log` für kritische Aktionen |
| Serverseitige Anfragefälschung | Ausgehende Aufrufe nur an fest hinterlegte Dienste |

## 6. Uploads

- Prüfung von Typ und Größe **serverseitig**, nicht nur im Browser.
- Erkennung des tatsächlichen Inhaltstyps, nicht nur der Dateiendung.
- Ablage außerhalb des Anwendungspfads, Auslieferung über signierte URLs mit Ablauf.
- **Virenprüfung:** Konzept steht, Umsetzung in Phase 2. Vorgesehen ist die Prüfung im
  Job-Worker vor Freigabe der Datei; bis dahin gilt die Einschränkung, dass hochgeladene
  Dateien nicht auf Schadsoftware geprüft werden. **Das ist vor Produktivbetrieb zu
  schließen.**

## 7. Daten an KI-Anbieter

Der Provider-Layer (`lib/ki/`) gibt ausschließlich die fachlich nötigen Felder weiter.

| Funktion | Übermittelt | Nicht übermittelt |
|---|---|---|
| Exposé-Text | Objektdaten, Ausstattung, Lage, Stichpunkte | Eigentümer, Interessenten, Preise aus Verhandlungen |
| Bildbearbeitung | Das Bild | Adresse, beteiligte Personen |
| Wertermittlungstexte | Objekt- und Lagedaten | Name und Anschrift des Auftraggebers |

Namen und Kontaktdaten von Eigentümern und Interessenten werden **nie** an KI-Anbieter
übertragen. Verfügbare EU-Datenresidenz und Optionen zur Nichtspeicherung sind zu
aktivieren. Der Layer ist so geschnitten, dass ein EU-gehosteter Anbieter ohne
Architekturänderung eingesetzt werden kann.

## 8. Betroffenenrechte

| Recht | Umsetzung | Phase |
|---|---|---|
| Auskunft und Übertragbarkeit | Export aller Daten eines Kontakts als strukturierte Datei | 1 |
| Berichtigung | Bearbeitung in der Oberfläche | 1 |
| Löschung | Löschworkflow mit Prüfung entgegenstehender Aufbewahrungspflichten | 1 |
| Einschränkung | Sperrkennzeichen am Datensatz | 1 |
| Widerspruch | Einwilligungsverwaltung je Kontakt | 1 |

**Anonymisierung statt Löschung**, wo gesetzliche Aufbewahrung entgegensteht: Der
Kontakt wird anonymisiert, der Vorgang bleibt für die Aufbewahrungsfrist erhalten.
`kontakte.anonymisiert_am` hält das fest.

## 9. Offene Punkte

Diese Punkte sind **vor Produktivbetrieb** zu klären. Sie sind nicht durch Technik
allein lösbar.

| Punkt | Art | Wann |
|---|---|---|
| Auftragsverarbeitungsverträge mit allen Anbietern | rechtlich | vor Gate B |
| Transfergrundlage für Anbieter außerhalb der EU | rechtlich | vor Gate B |
| Wahl eines EU-Mailanbieters | organisatorisch | Phase 1 |
| EU-Datenresidenz beim KI-Anbieter aktivieren | organisatorisch | Phase 1 |
| Datenschutzerklärung, Impressum, Cookie-Konzept | rechtlich | vor Gate B |
| Vertragsmuster und Widerrufsbelehrung | **anwaltlich** | vor Gate B |
| Signaturablauf gegen § 656a BGB prüfen | **anwaltlich** | vor Gate B |
| Virenprüfung für Uploads | technisch | Phase 2 |
| Verzeichnis von Verarbeitungstätigkeiten | organisatorisch | vor Gate B |
| Löschfristen je Datenart festlegen | rechtlich | Phase 1 |
| Wiederherstellung aus Sicherung erproben | technisch | Phase 3 |

## 10. Zur elektronischen Signatur

Die in Abschnitt 11 beschriebene Signatur ist eine **einfache elektronische Signatur**.
Sie wird nirgends als qualifizierte elektronische Signatur bezeichnet, und die
Oberfläche weist auf diese Einordnung hin.

Für Maklerverträge über den Kauf von Wohnungen und Einfamilienhäusern verlangt
§ 656a BGB Textform. Der beschriebene Ablauf erfüllt die Textform grundsätzlich — die
konkreten Formulierungen und der Ablauf sind dennoch **vor Produktivbetrieb anwaltlich
zu prüfen**. Diese Aussage ist keine Rechtsberatung.

Die Architektur hält die Ergänzung eines qualifizierten Vertrauensdiensteanbieters
offen (Phase 3).
