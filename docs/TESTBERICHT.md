# Testbericht Durchstich v0.1

**Stand:** 16.08.2026 · Master-Prompt Abschnitt 19 · Phase 1, Durchstich

---

## 1. Automatisierte Prüfungen

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Typprüfung (strict) | `npm run typecheck` | bestanden |
| Linting | `npm run lint` | bestanden |
| Unit-Tests | `npm run test` | 30 Tests bestanden |
| Produktions-Build | `npm run build` | bestanden, 17 Routen |
| Marken-Scan | `npm run marken-scan` | sauber, keine Treffer |

Alles zusammen: `npm run pruefen`.

### Abgedeckte Unit-Tests

| Bereich | Prüft |
|---|---|
| Design-Tokens | Beide Dunkelmodus-Blöcke setzen dieselben Tokens; jeder Dunkel-Token hat eine Entsprechung im Hellmodus; die fixierten Markenfarben sind unverändert |
| Lückenerkennung | Vollständige Objekte melden keine Lücken; fehlende Pflichtangaben werden gemeldet statt ergänzt; kategorieabhängige Regeln greifen nur, wo sie gelten |
| Entwurfstexte | Ohne Modell keine KI-Kennzeichnung und keine Credits; nur erfasste Werte werden verwendet; bei fehlendem Baujahr taucht **kein** Jahr im Text auf |
| Exposé-PDF | Erzeugt eine gültige PDF-Datei; kommt auch ohne optionale Angaben aus |
| OpenImmo-Prüfung | Vollständiges Objekt geht durch; fehlende Freigabe, Energieangaben oder Kaltmiete blockieren; Grundstücke brauchen keine Energieangaben; „Preis auf Anfrage“ ist zulässig |
| OpenImmo-XML | Rahmenelemente und Namensraum; Vermarktungs- und Nutzungsart als Attribute; Straße nur bei freigegebener Adresse; Punkt als Dezimaltrenner; Übertragungsart NEU/CHANGE; Mehrfachobjekte; Maskierung von Sonderzeichen und Entfernen von Steuerzeichen |
| Energiekennwert | **Bedarfsausweis schreibt `endenergiebedarf`, Verbrauchsausweis `energieverbrauchkennwert` — und jeweils das andere Element gerade nicht.** Portale weisen Objekte ab, bei denen Typ und Element nicht zusammenpassen |

Der Token-Test wurde durch gezieltes Entfernen eines Tokens gegengeprüft und
schlägt dann fehl — er kann die Regression also tatsächlich erkennen.

## 2. Nachweis der Mandantentrennung

Vorgabe aus Abschnitt 19 und Voraussetzung für **Gate B**.
Skript: [`supabase/tests/rls-mandantentrennung.sql`](../supabase/tests/rls-mandantentrennung.sql)

Der Test legt zwei Mandanten mit je einem Inhaber sowie einen Nur-Lese-Benutzer
an, schlüpft per `set_config` in deren Sitzung und prüft die Policies direkt in
der Datenbank. Alles läuft in einer Transaktion und wird zurückgerollt.

| # | Prüfung | Ergebnis |
|---:|---|---|
| 1 | A sieht nur eigene Objekte | bestanden |
| 2 | A sieht nur eigene Kontakte | bestanden |
| 3 | A sieht nur den eigenen Mandanten | bestanden |
| 4 | A kann fremdes Objekt nicht über die ID lesen | bestanden |
| 5 | A kann fremdes Objekt nicht ändern | bestanden |
| 6 | A kann fremdes Objekt nicht löschen | bestanden |
| 7 | A kann nicht im fremden Mandanten anlegen | bestanden |
| 8 | A kann im eigenen Mandanten anlegen (Gegenprobe) | bestanden |
| 9 | B sieht ausschließlich eigene Objekte | bestanden |
| 10 | B sieht nur Benutzer des eigenen Mandanten | bestanden |
| 11 | Nur-Lesen sieht Objekte des eigenen Mandanten | bestanden |
| 12 | Nur-Lesen darf nicht anlegen | bestanden |
| 13 | Nur-Lesen darf nicht ändern | bestanden |

**13 von 13 bestanden.** Prüfung 8 ist bewusst enthalten: Ohne sie könnte der
Test auch dann grün sein, wenn schlicht gar nichts erlaubt wäre.

### Wohlgeformtheit des XML

Das erzeugte Dokument wurde zusätzlich mit einem echten XML-Parser gegengelesen:
Wurzelelement und Namensraum stimmen, die Struktur ist wohlgeformt, und
maskierte Sonderzeichen (`< & " ²`) kommen beim Auslesen unverändert zurück.

**Offen:** Die Prüfung gegen die **offizielle XSD** des OpenImmo e. V. steht aus
— das Schema liegt hier nicht vor. Bis dahin gilt der Vorbehalt aus dem
Kopfabschnitt von `OPENIMMO_MAPPING.md`: Die Feldabbildung ist fachlich
abgeleitet, die exakten Elementnamen sind vor dem Produktivbetrieb zu
bestätigen.

## 3. Manuell geprüft

| Prüfung | Ergebnis |
|---|---|
| Öffentliche Routen erreichbar (`/`, `/anmelden`, `/registrieren`, `/styleguide`) | HTTP 200 |
| Geschützte Route ohne Anmeldung (`/dashboard`) | HTTP 307 auf `/anmelden?weiter=%2Fdashboard` |
| Content-Security-Policy mit Nonce | Nonce an den Skript-Elementen vorhanden |
| Hydration ohne Fehler | keine Konsolenfehler |
| Farbmodus-Umschalter inklusive Persistenz | funktioniert, übersteht das Neuladen |
| Exposé-PDF | Branding angewandt, KI-Vermerk enthalten, Haftungshinweis im Fuß |

## 4. Nicht geprüft — und warum

**Die Anwendung konnte in dieser Arbeitsumgebung nicht gegen die Datenbank
betrieben werden.** Der ausgehende Netzzugang der Umgebung lässt Verbindungen zu
`usguiggfciavwzkdfjgt.supabase.co:443` nicht zu (Antwort 403 des vorgeschalteten
Proxys). Betroffen ist ausschließlich der Weg *Anwendung → Datenbank*; die
Verwaltungsschnittstelle, über die Migrationen und der RLS-Test liefen, nutzt
einen anderen Weg und funktioniert.

Das ist eine Einschränkung der Arbeitsumgebung, kein Mangel des Codes. Der
Nachweis steht aber aus und ist beim ersten Deployment nachzuholen:

| Offen | Nachzuholen |
|---|---|
| Registrierung mit Anlage von Mandant und Inhaber | beim ersten Deployment |
| Anmeldung und Sitzungsauffrischung | beim ersten Deployment |
| Objekt anlegen, bearbeiten, löschen über die Oberfläche | beim ersten Deployment |
| Kontakt anlegen mit Rollen | beim ersten Deployment |
| Exposé-Textentwurf mit echten Objektdaten | beim ersten Deployment |
| PDF-Export mit echten Mandantendaten | beim ersten Deployment |
| Verhalten bei aktivierter E-Mail-Bestätigung | beim ersten Deployment |

Die zugrunde liegenden Bausteine sind einzeln geprüft: Die Datenbankschicht über
den RLS-Test, die Texterzeugung und die PDF-Ausgabe über Unit-Tests, der
Auslieferungsweg über die manuellen Prüfungen.

## 5. Offene Punkte aus der Sicherheitsprüfung

Die Prüfung des Datenbankanbieters meldet einen verbleibenden Punkt:

| Punkt | Maßnahme |
|---|---|
| Schutz gegen bekannte geleakte Passwörter ist deaktiviert | In der Projektverwaltung aktivieren. Abschnitt 16 fordert den Abgleich; er lässt sich nur dort einschalten, nicht per Migration. |

Zwei Befunde wurden bereits während der Umsetzung behoben:

1. Auf `auth.users` lag noch ein Trigger aus dem Vorentwurf, der in die
   entfernte Tabelle `profiles` schrieb. **Jede Registrierung wäre daran
   gescheitert.** Entfernt in Migration `aufraeumen_und_helfer_kapseln`.
2. Die RLS-Hilfsfunktionen lagen im Schema `public` und waren dadurch als
   REST-Endpunkte aufrufbar. Sie liegen jetzt im Schema `intern`, das nicht
   ausgeliefert wird.

## 6. Bekannte Einschränkungen des Durchstichs

- Ohne hinterlegten Modellzugang entstehen **Entwurfstexte aus Objektdaten**,
  keine KI-Texte. Sie werden ausdrücklich nicht als KI-Inhalt gekennzeichnet und
  kosten keine Credits.
- Der Credit-Kontostand auf dem Dashboard zeigt den Testwert an; das Ledger
  entsteht im weiteren Verlauf von Phase 1.
- Von den fünf Exposé-Vorlagen ist eine umgesetzt.
- Kalender, Aufgaben, Suchprofile, Portalexport, Abrechnung und Plattform-Admin
  sind in der Navigation als „geplant“ gekennzeichnet und ohne Funktion.
