# Funktionsmatrix und Abgrenzung

**Stand:** 16.08.2026 · **Grundlage:** Master-Prompt Fassung 2, Abschnitte 1.3 und 2
**Vorgelagert:** [`BESTANDSAUFNAHME.md`](BESTANDSAUFNAHME.md)

Spalten gemäß Abschnitt 1.3. Legende der Entscheidungsspalten:

- **Ü** = übernehmen (fachlich identisch, technisch neu gebaut)
- **N** = nicht übernehmen (entfällt in ImmoOffice.ai)
- **K** = neu konzipieren (Idee bleibt, Umsetzung ändert sich wesentlich)

Priorität: **P1** = Phase 1 (MVP), **P2** = Phase 2, **P3** = Phase 3, **–** = entfällt.

> Grundregel für die gesamte Matrix: In **keinem** Fall wird Code, Layout oder ein
> Kennzeichen der Referenz übernommen. „Übernehmen“ bedeutet ausschließlich, dass die
> fachliche Funktion in ImmoOffice.ai neu entsteht.

---

## 1. Objekte

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Objektverwaltung mit ~75 Fachfeldern | | | ✓ | P1 | Neues Datenmodell entlang OpenImmo statt gewachsener Spaltenliste; Basis für alles Weitere |
| Dreistufige Objektklassifikation (Art/Typ/Nutzung) | | | ✓ | P1 | Drei widersprüchliche Taxonomien der Referenz werden zu **einer** OpenImmo-konformen zusammengeführt |
| Vermarktungsart Kauf/Miete | ✓ | | | P1 | Steuert dynamische Felder und Preislogik |
| Objekthierarchie (Stammobjekt → Einheit) | ✓ | | | P1 | Selbstreferenz; trägt auch Neubauprojekte |
| Status- und Auftragsartenführung | ✓ | | | P1 | Auftragsarten decken sich mit Abschnitt 11 |
| Energieausweisangaben vollständig | ✓ | | | P1 | Pflichtangaben GEG; OpenImmo-Export |
| Provision innen/außen | ✓ | | | P1 | Reine Objektangabe — **nicht** der Provisionsrechner aus Abschnitt 2 |
| Highlights, Entfernungen, Raumaufteilung (strukturiert) | ✓ | | | P1 | Exposé- und Portalausgabe |
| Bild- und Dateiverwaltung am Objekt | | | ✓ | P1 | Ergänzt um Versionierung und KI-Kennzeichnung (Abschnitt 10) |
| Hauptbild/Titelbild-Auswahl | ✓ | | | P1 | Exposé, Web-Exposé, Portale |
| Geokoordinaten | | | ✓ | P1 | **Neu** — fehlt in der Referenz, für OpenImmo und Karten nötig |
| Strukturierter Ausstattungskatalog | | | ✓ | P1 | **Neu** — Referenz hat nur Freitext; OpenImmo verlangt Einzelflags |
| Portal-Übertragungsstatus | | | ✓ | P2 | In der Referenz nur rudimentär; wird echtes Protokoll je Portal |
| Objektaufnahme vor Ort mit Fotos | ✓ | | | P2 | Speist Wertermittlung (Abschnitt 9) |
| onOffice-Spiegelung (`onoffice_objekte`, `onoffice_felder`) | | ✓ | | – | Abschnitt 2: nicht übernehmen. Ersetzt durch OpenImmo als offenen Standard |
| Shop-TV-Veröffentlichungsflag | | ✓ | | – | Abschnitt 2: Digital Signage entfällt |

## 2. Kontakte

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Adressbuch mit Rollen (Interessent, Eigentümer, Notar …) | | | ✓ | P1 | Referenz trennt `kontakte` und `eigentuemer` in zwei Modelle; ImmoOffice.ai führt **eine** Kontaktentität mit mehreren Rollen |
| Kontakt-Objekt-Zuordnung (`kontakt_objekt`) | ✓ | | | P1 | n:m, mehrere Rollen je Paar |
| Eigentümerzuordnung mit Anteilen | ✓ | | | P1 | Mehrere Eigentümer je Objekt |
| Aktivitätenhistorie | ✓ | | | P1 | Zentrale Ereignistabelle, mandantenweit |
| Notizen mit Tags | ✓ | | | P1 | |
| Wiedervorlagen | ✓ | | | P1 | Gemeinsam mit Aufgaben |
| Suchprofile und Matching | | | ✓ | P1 | **Ausbau** — in der Referenz nur schwach ausgeprägt; Abschnitt 7 fordert automatisches **und** manuelles Matching |
| Dublettenprüfung | | | ✓ | P2 | Teil des CSV-Imports |
| CSV-/Excel-Import mit Feldzuordnung | | | ✓ | P2 | Job-Queue für große Dateien |
| DSGVO-Export und Löschung/Anonymisierung | | | ✓ | P1 | **Neu** — in der Referenz nicht vorhanden; Abschnitt 16 |

## 3. Exposés

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Exposé-Schmiede mit KI-Texten je Kategorie | ✓ | | | P1 | OpenAI-Provider-Layer, Credit-Ledger |
| Getrennte Bausteine Objekt/Lage/Ausstattung | ✓ | | | P1 | Entspricht Abschnitt 8 |
| Auswählbare Textstile | | | ✓ | P1 | Referenz kennt Kategorien, nicht die sechs Stile aus Abschnitt 8 |
| Kennzeichnung unsicherer/fehlender Angaben | | | ✓ | P1 | **Neu** — harte Vorgabe aus Abschnitt 8, in der Referenz nicht vorhanden |
| PDF-Exposé serverseitig | | | ✓ | P1 | Weg von `html2canvas`/`jspdf` im Browser hin zu deterministischem serverseitigem Rendering |
| Fünf feste Vorlagen | | | ✓ | P1 | Referenz hat gewachsene Einzellayouts; Abschnitt 8 verlangt fünf definierte |
| Schaufensteraushang mit Energieskala und QR | ✓ | | | P1 | Vorlage 5 |
| Mandanten-Branding auf Vorlagen | | | ✓ | P1 | In der Referenz fest verdrahtetes Firmenlogo → mandantenfähig |
| Web-Exposé mit eigener URL | | | ✓ | P1 | **Neu konzipiert** — Abschnitt 8: Passwortschutz, Ablauf, Statistik, Widerruf. Gilt ausdrücklich **nicht** als Kundenportal |
| Exposé-Rückmeldung | ✓ | | | P2 | Kontaktformular am Web-Exposé |
| Grundriss-Aufbereiter (Canvas) | ✓ | | | P2 | Getrennt von der KI-Grundrissvisualisierung |
| Bildunterschriften-Generator | ✓ | | | P2 | Credits |

## 4. Wertermittlung

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Vier Wertermittlungsverfahren | ✓ | | | P2 | Deckt sich exakt mit Abschnitt 9 |
| Wiederverwendbare Textbausteine (`mpe_bausteine`) | ✓ | | | P2 | Mandantenspezifisch |
| Vorbelegte Vorteils-/Nachteils-/Zielgruppenlisten | ✓ | | | P2 | Reine Vorbelegung, editierbar |
| Ergebnis in JSONB-Blob | | ✓ | | – | Ersetzt durch strukturierte, auswertbare Rechenblätter |
| PPTX-Ausgabe über 17,6-MB-Vorlage im Quelltext | | ✓ | | – | Ersetzt durch gebrandetes PDF im Vorlagenstil (Abschnitt 9) |
| Ableitung aus Objektaufnahme | ✓ | | | P2 | `bewertung-aus-aufnahme` |
| Pflichtkennzeichnung „keine gutachterliche Aussage“ | | | ✓ | P2 | **Neu** — Abschnitt 9, § 194 BauGB |
| AVM-/Datenanbieter-Anbindung | | | ✓ | P3 | Provider-Layer vorsehen, Anbindung Phase 3 |

**Phasenentscheidung:** Das Modul bleibt zu Beginn von Phase 2. Ein Vorziehen nach
Phase 1 wäre laut Abschnitt 9 zulässig, wenn es sich mit geringem Zusatzaufwand aus den
Exposé-Bausteinen ableiten ließe. Die Analyse zeigt das Gegenteil: Die Textbausteine
sind zwar gemeinsam nutzbar, der eigentliche Wert liegt jedoch in den Rechenblättern der
drei Verfahren, die keinerlei Entsprechung im Exposé-Teil haben. Der Zusatzaufwand ist
damit nicht gering — das Modul bleibt in Phase 2.

## 5. Verträge und Signatur

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Vertragsvorlagen (Maklervertrag, Objektnachweis, Mietvertrag) | | | ✓ | P2 | Referenzvorlagen tragen fremdes Branding und sind Base64 im Code → eigene, anwaltlich zu prüfende Muster als Storage-Objekte |
| Reservierungsvereinbarung | ✓ | | | P2 | |
| Übergabeprotokoll mit Zählerständen | ✓ | | | P2 | |
| Einfache E-Signatur per Token-Link | | | ✓ | P2 | **Ausbau** — Referenz hat Token + Canvas; Abschnitt 11 verlangt zusätzlich Mehrfachunterzeichner, Reihenfolge, Dokument-Hash, Zeitstempel, Audit-Trail, sieben Status |
| Dokumenten-Upload mit Felderkennung | ✓ | | | P2 | `mammoth`/PDF-Parsing serverseitig statt im Browser |
| Notar-Laufzettel | | | ✓ | P3 | Fachlich sinnvoll, aber kein Wechselkriterium — später |
| Widerrufsbelehrung, Datenschutzunterlagen | | | ✓ | P2 | Abschnitt 11, mit Rechtshinweis |

## 6. Marketing

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Print-Vorlagenverwaltung | | | ✓ | P2 | Deterministischer Template-/Canvas-Editor (Abschnitt 12) |
| Social-Media-Inhalte (Posts, Storys) | ✓ | | | P2 | Credits für KI-Texte |
| Verkaufsschilder, Flyer, Postkarten | ✓ | | | P2 | |
| Akquiseanschreiben, Geschäftsbriefe | ✓ | | | P2 | |
| E-Mail-Kampagnen | | | ✓ | P2 | EU-Mail-Dienst, Einwilligungsprüfung |
| Eigentümer-Report | ✓ | | | P2 | Als PDF, **nicht** als Portal |
| News-Briefing / Caption-Generator | | | ✓ | P3 | Nachrangig |
| Shop-TV / Digital Signage (Yodeck) | | ✓ | | – | Abschnitt 2 |

## 7. Kalender und Aufgaben

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Eigener Kalender mit Terminen | | | ✓ | P1 | Abschnitt 13: Tages-, Wochen-, Monats-, Listenansicht |
| Besichtigungstermine am Objekt | ✓ | | | P1 | |
| Aufgaben, Fälligkeiten, Prioritäten | | | ✓ | P1 | In der Referenz nur als Checklisten-Items |
| Serientermine und Serienaufgaben | | | ✓ | P1 | **Neu** |
| Erinnerungen per E-Mail | | | ✓ | P1 | Job-Queue |
| Google-/Outlook-Synchronisation | | | ✓ | P2 | OAuth; Referenz nutzt MSAL nur für Mail/OneDrive, nicht für Kalender |
| Konflikterkennung, Schleifenschutz | | | ✓ | P2 | **Neu** — Abschnitt 13 |

## 8. Auswertungen, Admin, Betrieb

| Bestehende Funktion | Ü | N | K | Prio | Technische Abhängigkeiten |
|---|:-:|:-:|:-:|:-:|---|
| Firmenkennzahlen | | | ✓ | P1 | Mandantenbezogene Auswertungen |
| Mitarbeiterverwaltung | | | ✓ | P1 | Serverseitige Einladung statt `signUp`-Workaround |
| Rechte als Vorlage mit Übersteuerung | ✓ | | | P1 | Konzept gut; Durchsetzung neu (RLS + Server) |
| Globale Suche | ✓ | | | P1 | Mandantenweit, performant |
| Aktivitäts-Log | | | ✓ | P1 | Wird unveränderbares Audit-Log (Abschnitt 16) |
| Checklisten mit Vorlagen | ✓ | | | P2 | |
| Externe Zugangsdaten im System hinterlegen | | ✓ | | – | Sicherheitsrisiko; Secrets ausschließlich als Umgebungsvariablen (Abschnitt 16) |
| Plattform-Adminbereich für den Betreiber | | | ✓ | P1 | **Neu** — existiert in der Referenz nicht (Einzelmandant). Abschnitt 15 |
| Abonnement, Credits, Stripe | | | ✓ | P1 | **Neu** — Abschnitt 14 |

## 9. Vollständig entfallende Module

Abschnitt 2 benennt drei Kacheln zur ersatzlosen Entfernung und sechs Module mit der
Erwartung „nicht übernehmen“. Die Analyse liefert für keines davon eine fachliche
Begründung zur Abweichung; alle entfallen:

| Modul | Grund |
|---|---|
| OneDrive | Abschnitt 2 — ersatzlos. Dateiablage erfolgt in Supabase Storage |
| Bewerber / Einstellungstest | Abschnitt 2 — ersatzlos; kein Maklerbezug |
| Kundenportal (Eigentümer-Portal) | Abschnitt 2 — ersatzlos. Das Web-Exposé ersetzt es **nicht** und ist ausdrücklich erwünscht |
| Posteingang / E-Mail-Client | Umfangreichstes Einzelmodul der Referenz (6 Tabellen, 6 Edge Functions) ohne Bezug zum Kernnutzen. E-Mail-**Zuordnung** zu Objekt/Kontakt bleibt als eigenständige, kleinere Funktion in Phase 2 erhalten |
| Liquiditätsplanung (Bankimport) | Buchhaltung, kein Maklerprozess |
| GoBD-Rechnungsmodul | Plattformrechnungen laufen über Stripe (Abschnitt 14) |
| Shop-TV / Digital Signage | Kein Maklerprozess, externe Hardwareabhängigkeit |
| onOffice-Synchronisation | Bindung an ein Fremdsystem; OpenImmo ist der offene Ersatz |
| Provisionsrechner und -tracker | Interne Vergütungsrechnung. Provisionsangaben **am Objekt** bleiben erhalten |
| Neubau-Projektportal mit Kundenzugängen | Nicht ausdrücklich genannt, aber funktional ein Kundenportal (12 Tabellen). Neubauprojekte bleiben als **Objekthierarchie** erhalten, der externe Zugang entfällt |

Der Wegfall reduziert das Datenmodell um rund die Hälfte der Tabellen der Referenz und
konzentriert ImmoOffice.ai auf den Maklerprozess.

## 10. Funktionen ohne Vorbild in der Referenz

Diese Anforderungen entstehen vollständig neu und sind daher die aufwandstreibenden
Posten der Planung:

| Funktion | Prio | Abschnitt |
|---|:-:|---|
| Echte Mandantenfähigkeit mit RLS | P1 | 5 |
| Sechs Rollen mit Aktionsrechten (statt vier Modul-Stufen) | P1 | 5 |
| Mandanten-Branding (Logo, Farben, Rechtstexte) | P1 | 5 |
| Abonnement, Zusatznutzer, Credits, Stripe | P1 | 14 |
| Unveränderbares Credit-Ledger mit Reservierung und Erstattung | P1 | 14 |
| Plattform-Adminbereich mit Supportzugriffsverfahren | P1 | 15 |
| OpenImmo-Export, schema-valide | P1/P2 | 7 |
| Asynchrone Job-Verarbeitung | P2 | 4 |
| DSGVO-Export, Löschung, Anonymisierung, Einwilligungen | P1 | 16 |
| Automatisierte Tests | P1 | 19 |
| Hell-/Dunkelmodus, Designsystem, Styleguide | P1 | 3 |

## 11. Priorisierungslogik

Abschnitt 7 stellt fest, dass der OpenImmo-Export das wichtigste Wechselkriterium für
deutsche Makler ist und **vor** Bildbearbeitung, Marketingeditor und E-Signatur
rangiert. Die Matrix folgt dem: Datenmodell und Exportgerüst entstehen in Phase 1, der
produktive Portalexport steht am Anfang von Phase 2 — vor dem Wertermittlungsmodul, vor
der Job-Queue und vor allen KI-Bildfunktionen.

Zweite Konsequenz aus der Analyse: Die Referenz führt 218 Komponenten und 51 Tabellen,
von denen nach Abschnitt 2 rund die Hälfte entfällt. Der verbleibende fachliche Kern —
Objekte, Kontakte, Exposés, Wertermittlung, Verträge — ist genau der Umfang, den
ImmoOffice.ai trägt. Die Analyse liefert damit keinen Grund, von der in Abschnitt 4
vorgeschlagenen Zielarchitektur abzuweichen.
