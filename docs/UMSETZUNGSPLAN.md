# Umsetzungsplan und Aufwandsschätzung

**Stand:** 16.08.2026 · Master-Prompt Abschnitte 17 und 18 · Teil des Gate-A-Pakets

Grundlage der Schätzung: eine erfahrene Vollzeitkraft, die Anforderung, Umsetzung,
Test und Dokumentation gemeinsam verantwortet. **PT** = Personentage.

---

## 1. Zusammenfassung

| Phase | Umfang | Aufwand | Kalenderzeit (1 Person) | Kalenderzeit (4 Personen) |
|---|---|---:|---|---|
| **Phase 0** | Analyse und Fundament | **12–16 PT** | 3 Wochen | — |
| **Phase 1** | verkaufsfähiger Kern-MVP | **150–190 PT** | 30–38 Wochen | 9–12 Wochen |
| **Phase 2** | Automatisierung und Marktreife | **140–170 PT** | 28–34 Wochen | 8–11 Wochen |
| **Phase 3** | Härtung und Skalierung | **65–85 PT** | 13–17 Wochen | 4–6 Wochen |
| **Summe** | | **370–460 PT** | **etwa 1,5–2 Jahre** | **etwa 6–8 Monate** |

Bei vier Personen gilt die Kalenderzeit nur, soweit die Arbeitspakete tatsächlich
parallelisierbar sind; Datenmodell und Mandantenmodell sind es nicht.

## 2. Verhältnis zum Budget von 1.500 €

Abschnitt 17 bezeichnet die 1.500 € selbst als Modellannahme für die
Wirtschaftlichkeitsrechnung und ausdrücklich **nicht** als Maßstab für den Umfang der
Phasen. Diese Einordnung ist zutreffend, und Abschnitt 17 verlangt zugleich, offen zu
benennen, was mit diesem Budget erreichbar ist. Deshalb hier unmissverständlich:

**Der in den Abschnitten 5 bis 16 beschriebene Funktionsumfang ist mit 1.500 € nicht
herstellbar.** Bei marktüblichen Sätzen entspricht der Betrag etwa zwei bis vier
Personentagen. Der geschätzte Gesamtaufwand liegt bei 370–460 PT — also rund dem
Hundertfachen.

Das ist keine Kritik am Auftrag, sondern die von Abschnitt 17 geforderte ehrliche
Einordnung. Für die GuV-Rechnung bleibt die Zahl brauchbar: Sie verschiebt die
Amortisation nur um etwa einen Monat.

### Was mit welchem Budget entsteht

| Budget | Ergebnis |
|---|---|
| 1.500 € | Kein lauffähiges Produkt. Für die Modellrechnung ausreichend, für die Entwicklung nicht. |
| ~25.000 € | Der Durchstich v0.1: Registrierung, Mandant, Rollen, Objekte, Kontakte, eine Exposé-Vorlage mit KI-Text, PDF-Export, Dashboard-Rumpf. Vorführbar, noch nicht verkaufbar. |
| ~70.000 € | Verkaufsfähiger MVP inklusive OpenImmo-Exportgerüst, Stripe, Credits und Plattform-Admin. Das ist die Schwelle, ab der zahlende Kunden möglich sind. |
| ~150.000 € | Phasen 1 und 2 vollständig — inklusive produktivem Portalexport, Wertermittlung, Bildbearbeitung und E-Signatur. |

**Empfehlung:** Nicht den Funktionsumfang gleichmäßig kürzen, sondern die Reihenfolge
strikt einhalten. Ein MVP mit wenigen, vollständig funktionierenden Modulen ist
verkaufbar; einer mit vielen halbfertigen nicht. Die Reihenfolge in Abschnitt 18 ist
dafür bereits richtig gewählt — insbesondere der Vorrang von OpenImmo.

## 3. Phase 0 — Analyse und Fundament (abgeschlossen)

| Paket | Aufwand | Status |
|---|---:|---|
| Bestandsanalyse der Referenz | 2 PT | erledigt |
| Funktionsmatrix und Abgrenzung | 1 PT | erledigt |
| Markenassets und Designsystem | 3 PT | erledigt |
| Styleguide-Seite | 1 PT | erledigt |
| Architektur inklusive Queue-Entscheidung | 2 PT | erledigt |
| Mandanten-, Rollen- und Datenmodell | 3 PT | erledigt (Entwurf) |
| OpenImmo-Feldmapping | 2 PT | erledigt (Entwurf) |
| Projektstruktur, Basis-Sicherheit, CSP | 2 PT | erledigt |
| Wirtschaftlichkeitsmodell | 1 PT | erledigt |

Offen bis Gate A: Freigabe durch den Auftraggeber. **Ohne Freigabe entsteht kein
Phase-1-Code.**

## 4. Phase 1 — verkaufsfähiger Kern-MVP

### Durchstich v0.1 (zuerst, ~25 PT)

Registrierung und Anmeldung · Mandant und Rollen · Objekte · Kontakte · eine
Exposé-Vorlage mit KI-Text · PDF-Export · Dashboard-Rumpf.

Zweck: Der Durchstich beweist, dass Mandantentrennung, Rechte, KI-Anbindung und
Ausgabe zusammenspielen — bevor Breite entsteht.

### Danach

| Paket | Aufwand | Bemerkung |
|---|---:|---|
| Datenbankschema und RLS vollständig | 12 PT | Grundlage für alles Weitere |
| Unternehmen, Benutzer, Rollen, Einladung | 10 PT | serverseitig, nicht wie in der Referenz |
| Objekte im vollen Umfang | 18 PT | dynamische Felder je Objekt- und Vermarktungsart |
| Kontakte, Suchprofile, Matching | 14 PT | |
| Aktivitäten und Wiedervorlagen | 5 PT | |
| Aufgaben und eigener Kalender | 12 PT | vier Ansichten, Serientermine |
| KI-Texte, sechs Stile, Lückenkennzeichnung | 10 PT | Freigabepflicht inbegriffen |
| Fünf Exposé-Vorlagen | 16 PT | der aufwandsstärkste Einzelposten |
| PDF-Export serverseitig | 9 PT | |
| Web-Exposé mit Schutz und Statistik | 11 PT | |
| OpenImmo-Datenmodell und Exportgerüst | 13 PT | inklusive XSD-Validierung |
| Stripe-Abos, Zusatznutzer, Credit-Ledger | 19 PT | Ledger und Reservierung sind heikel |
| Plattform-Admin | 13 PT | |
| DSGVO-Grundfunktionen | 11 PT | Export, Löschung, Anonymisierung, Einwilligungen |
| Dashboard vollständig | 5 PT | |
| Automatisierte Tests | 16 PT | inklusive Cross-Tenant-Isolation |

**Gate B** vor dem Stripe-Livebetrieb: Kernflüsse vorführen, Cross-Tenant-Isolation
durch Tests nachweisen, Preise und Rechtstexte freigeben lassen.

**Zwingend vor Gate B, nicht von der Entwicklung leistbar:**
anwaltliche Prüfung der Vertragsmuster, der Widerrufsbelehrung, der
Datenschutzerklärung und des Signaturablaufs (§ 656a BGB). Dafür sind externe Kosten
und Zeit einzuplanen, die in den PT-Angaben **nicht** enthalten sind.

## 5. Phase 2 — Automatisierung und Marktreife

In der Reihenfolge aus Abschnitt 18:

| Paket | Aufwand | Bemerkung |
|---|---:|---|
| Produktiver OpenImmo-Export an drei Portale | 26 PT | je Portal eigener Übertragungsweg und Vertrag |
| Wertermittlungsmodul | 21 PT | drei Rechenblätter, gebrandetes PDF |
| Job-Queue produktiv und KI-Bildbearbeitung | 22 PT | Versionierung, Kennzeichnung, Kostenprotokoll |
| Marketingeditor | 26 PT | deterministischer Template-Ansatz |
| Dokumenten-Upload mit Felderkennung | 16 PT | |
| Mehrstufige einfache E-Signatur | 21 PT | Hash, Zeitstempel, Audit-Trail, sieben Status |
| Google- und Outlook-Synchronisation | 16 PT | Konflikterkennung, Schleifenschutz |
| E-Mail-Zuordnung | 8 PT | |
| CSV-/Excel-Import | 9 PT | Feldzuordnung, Dublettenprüfung |

## 6. Phase 3 — Härtung und Skalierung

| Paket | Aufwand |
|---|---:|
| Last- und Sicherheitstests | 11 PT |
| Backup-Wiederherstellungstest | 3 PT |
| Erweiterte Auswertungen | 11 PT |
| Observability | 9 PT |
| Missbrauchsschutz | 7 PT |
| Jobs und Warteschlangen optimieren | 7 PT |
| Vorbereitung qualifizierter Signaturdienste | 9 PT |
| Externe Bewertungs- und Datenanbieter | 13 PT |
| Weitere Portal- und E-Mail-Integrationen | 13 PT |

## 7. Risiken

| Risiko | Wirkung | Umgang |
|---|---|---|
| **Budget und Umfang klaffen weit auseinander** | hoch | Reihenfolge strikt einhalten, nach jeder Phase neu entscheiden |
| Portalverträge verzögern sich | hoch | Der Export ist zu Gate B fertig; die Übertragung folgt, sobald Verträge stehen |
| Rechtsprüfung dauert länger als geplant | mittel | Frühzeitig beauftragen, spätestens zu Beginn von Phase 1 |
| KI-Kosten steigen | gering | Sensitivität zeigt: selbst verfünffachte Kosten bleiben tragbar |
| RLS-Fehler öffnet Mandantengrenze | **sehr hoch** | Zwei Ebenen (RLS + Server), pgtap-Tests, Gate-B-Nachweis |
| Fünf Exposé-Vorlagen unterschätzt | mittel | Vorlage 1 im Durchstich zuerst, danach neu schätzen |

Das Risiko einer verletzten Mandantengrenze ist das einzige mit potenziell
existenzbedrohender Wirkung — ein einziger Vorfall wäre ein meldepflichtiger
Datenschutzverstoß über Kundengrenzen hinweg. Deshalb prüfen zwei unabhängige Ebenen,
und Gate B verlangt dafür einen ausdrücklichen Testnachweis.
