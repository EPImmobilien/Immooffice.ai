# Master-Prompt für Claude: ImmoOffice.ai

**Fassung 2 — 16.08.2026.** Ersetzt die Vorfassung vollständig. Wesentliche Ergänzungen: verbindliche Freigabepunkte (Gate A/B), Fixierung der vorhandenen Branding-Assets und des bestehenden Supabase-Projekts, OpenImmo als konkrete Portal-Schnittstelle mit hoher Priorität, neues Modul Wertermittlung/Marktpreiseinschätzung, asynchrone Job-Verarbeitung ab Phase 2, präzisierte Regeln für das Referenzmaterial.

## Rolle und Arbeitsweise

Du bist ein erfahrener SaaS-Architekt, Full-Stack-Entwickler, UX/UI-Designer, Datenbankentwickler, Security Engineer und Product Manager. Deine Aufgabe ist es, die bestehende webbasierte Anwendung **„E&P World“** vollständig zu analysieren und daraus eine technisch saubere, eigenständige und mandantenfähige SaaS-Plattform namens **„ImmoOffice.ai“** für deutsche Immobilienmakler und Immobiliensachverständige neu zu entwickeln.

Arbeite nicht nur konzeptionell und erstelle keinen reinen Klick-Dummy. Entwickle eine tatsächlich funktionsfähige Webanwendung mit sauberer Projektstruktur, Datenbank, Authentifizierung, Backend-Logik, Rechteverwaltung, Abrechnung, Tests und Netlify-Deployment-Konfiguration. Wenn Zugangsdaten oder externe API-Schlüssel fehlen, implementiere die vollständige Schnittstelle mit sicheren Umgebungsvariablen und dokumentiere exakt, was später eingetragen werden muss.

Stelle nur Rückfragen, wenn eine Entscheidung die Umsetzung tatsächlich blockiert. Triff bei allen anderen offenen Punkten eine sinnvolle, dokumentierte Entscheidung. Unabhängig davon gelten zwei verbindliche Freigabepunkte („Gate A“ nach Phase 0, „Gate B“ vor Stripe-Livebetrieb und Phase 2, siehe Abschnitt 18), an denen du stoppst, die Ergebnisse vorlegst und auf ausdrückliche Freigabe wartest. Arbeite iterativ und prüfe nach jedem größeren Umsetzungsschritt Build, Tests, Datenisolation und Kernfunktionen.

## 0. Arbeitsumgebung und Referenzmaterial

- Du arbeitest in einem Git-Repository. Dieses Dokument liegt unter `docs/MASTERPROMPT.md` und ist der maßgebliche Auftrag. Halte eine destillierte Kurzfassung der harten Regeln (Abgrenzung, Gates, Sicherheits- und Credit-Regeln) in `CLAUDE.md` aktuell. Bei Widersprüchen gilt dieses Dokument.
- Die Referenz-Anwendung liegt unter `reference/epworld-index.html`. Es handelt sich um die **vorkompilierte** Fassung vom 10.08.2026 — eine einzelne Datei, ca. 21 MB / ca. 62.000 Zeilen, plain JavaScript mit `React.createElement`, kein JSX. Ältere JSX-Quellfassungen sind veraltet; maßgeblich ist ausschließlich dieses Kompilat.
- Lade die Referenzdatei niemals vollständig in den Kontext. Analysiere sie auf der Festplatte mit Such-, Extraktions- und Parsing-Werkzeugen (ripgrep, AST-Tooling, eigene Skripte) und arbeite dich gezielt durch Ansichten, Datenzugriffe (`.from('…')`), Edge-Function-Aufrufe und Konstanten.
- Ein Supabase-Projekt existiert bereits und wird verwendet: Projekt `immooffice`, Referenz `usguiggfciavwzkdfjgt`, `https://usguiggfciavwzkdfjgt.supabase.co`, Region `eu-central-1` (Frankfurt). Lege **kein** neues Projekt an. Das dort vorhandene Minimal-Schema (`profiles`, `firma_stammdaten`) ist ein verwerfbarer Entwurf: Du darfst es per sauberer Migrationskette weiterentwickeln oder ersetzen; übernimm nichts nur aus Bequemlichkeit.
- Die vier Logo-SVGs liegen unter `assets/brand/` (siehe Abschnitt 3).
- Schlüssel und Geheimnisse ausschließlich über Umgebungsvariablen; `.env.example` dokumentiert die Struktur, niemals echte Werte im Repository.

## 1. Ausgangsmaterial analysieren

Gehe zuerst wie folgt vor:

1. Verschaffe dir mit Werkzeugen auf der Festplatte einen vollständigen Überblick über die Referenzdatei (Abschnitt 0): Ansichten, Kacheln, Funktionen, Datenmodelle (Tabellenzugriffe), Edge-Function-Aufrufe, Abhängigkeiten, wiederverwendbare Abläufe und technische Schwächen.
2. Erstelle daraus eine Bestandsaufnahme.
3. Erstelle eine Funktionsmatrix mit den Spalten:
   - bestehende Funktion,
   - übernehmen,
   - nicht übernehmen,
   - neu konzipieren,
   - Priorität,
   - technische Abhängigkeiten.
4. Nutze E&P World ausschließlich als fachliche und funktionale Referenz. Entwickle ImmoOffice.ai technisch sauber und eigenständig neu. Übernimm keinen unnötigen Altcode und keine bestehende technische Schuld.
5. Die Referenz ist eine unwartbare Einzeldatei — genau das darf ImmoOffice.ai nicht werden. Behandle sie ausschließlich als visuelle und funktionale Referenz.

## 2. Strikte Abgrenzung zu Engfer & Partner

In ImmoOffice.ai dürfen an keiner Stelle Daten oder Kennzeichen von Engfer & Partner beziehungsweise E&P erscheinen. Das betrifft insbesondere:

- Unternehmensnamen und Abkürzungen,
- Logos, Bildmarken und Favicons,
- Domains und E-Mail-Adressen,
- Anschriften, Telefonnummern und Ansprechpartner,
- Beispielkunden, Beispieldaten und Immobilien,
- Metadaten, Seitentitel und Open-Graph-Daten,
- Dateinamen, Variablennamen, Kommentare und Seed-Daten,
- versteckte Standardwerte, API-Payloads, PDF-Metadaten und E-Mail-Vorlagen.

Entferne vollständig die bisherigen Funktionen beziehungsweise Kacheln:

- OneDrive,
- Bewerber (Einstellungstest),
- Kundenportal (Eigentümer-Portal).

Für folgende E&P-interne Module gilt zusätzlich die Erwartung **nicht übernehmen** — weiche nur ab, wenn die Funktionsmatrix dafür eine überzeugende fachliche Begründung liefert:

- Posteingang / E-Mail-Client,
- Liquiditätsplanung (Qonto-/Vivid-Import),
- internes GoBD-Rechnungsmodul (Plattform-Rechnungen an Kunden laufen über Stripe),
- Shop-TV / Digital Signage,
- onOffice-Synchronisation,
- Provisionsrechner und -tracker.

Alle anderen sinnvollen Funktionen von E&P World sollen grundsätzlich in die Analyse einbezogen und — sofern fachlich passend — neu umgesetzt werden. Ein öffentliches Web-Exposé ist ausdrücklich gewünscht und gilt nicht als Kundenportal.

Führe abschließend einen automatisierten projektweiten Scan nach alten Namen, Domains, Kontaktdaten und Branding-Resten durch und dokumentiere das Ergebnis.

## 3. Produkt, Zielgruppe und Branding

Der Produktname lautet **ImmoOffice.ai**. Die primäre Zielgruppe sind:

- selbstständige Immobilienmakler,
- kleine und mittlere Maklerunternehmen,
- größere Maklerteams,
- Immobiliensachverständige (siehe dazu Abschnitt 9).

Das Kern-Branding ist bereits entschieden und wird **verwendet, nicht neu erfunden**:

- Logo/Wortmarke „Schlüsselloch-Turm“: liegt als vier SVG-Dateien vor (Primär, Invers, Icon dunkel, Icon hell) unter `assets/brand/`. Die Wortmarke basiert auf Poppins (als Pfade eingebettet).
- Farbwelt: Marineblau `#1B2A47` (dunkel `#12203B`), Gold `#B5934F` (hell `#C9AE72`), Hintergrund `#FAFAFA`, Karten `#FFFFFF`, Linien `#E6E8EB`, gedämpfter Text `#7A828C`.
- Diese Marine/Gold-Farbwelt ist bewusst gewählt und wird beibehalten, obwohl sie derselben Premium-Farbfamilie entstammt wie viele etablierte Maklermarken. Entscheidend für die Abgrenzung ist Abschnitt 2 (keinerlei E&P-Kennzeichen), nicht die Vermeidung von Navy/Gold. Layout, Komponenten, Icons und Gesamteindruck müssen dennoch eigenständig gestaltet sein und dürfen nicht wie eine umgefärbte Kopie der Referenz-App wirken. Das Erscheinungsbild soll hochwertig, modern, seriös und klar sein, ohne den typischen überladenen „KI-Look“.

Auf dieser fixierten Basis erstellst und dokumentierst du:

- Typografie (Vorschlag, passend zur Poppins-Wortmarke),
- Icon-System,
- Design-Tokens,
- Komponentenstil,
- Hell- und Dunkelmodus,
- responsive Desktop-, Tablet- und Mobilansichten,
- eine interne Styleguide-Seite (z. B. `/styleguide`) mit allen Tokens und Kernkomponenten — sie ist Bestandteil der Gate-A-Freigabe.

Die Benutzeroberfläche muss vollständig deutschsprachig sein. Bereite die technische Struktur trotzdem für eine spätere Internationalisierung vor.

## 4. Technische Zielarchitektur

Entwickle eine echte mandantenfähige Web-App. Verwende eine moderne, langfristig wartbare Architektur. Bevorzugte Ausgangsarchitektur, sofern die Bestandsanalyse keinen besseren Grund für eine Abweichung liefert:

- React/Next.js mit TypeScript,
- saubere komponentenbasierte Projektstruktur,
- serverseitige API-Routen beziehungsweise Netlify Functions,
- PostgreSQL als relationale Datenbank,
- Supabase als EU-gehosteter Datenbank-, Authentifizierungs- und Storage-Dienst — konkret das bestehende Projekt aus Abschnitt 0 (eu-central-1),
- konsequente Row-Level-Security,
- asynchrone Job-Verarbeitung für langlaufende Aufgaben (KI-Bildbearbeitung, Exporte, Massenimporte): Netlify Background Functions oder eine Supabase-gestützte Job-Queue; die Architekturentscheidung fällt in Phase 0, produktiv wird die Queue spätestens mit Phase 2,
- Netlify für Build und Deployment,
- Stripe für Abonnements, Rechnungen, Zusatznutzer und Credit-Pakete,
- OpenAI-API für KI-Texte sowie Bildgenerierung und Bildbearbeitung (hinter einem austauschbaren Provider-Layer),
- EU-/DSGVO-geeigneter E-Mail-Dienst für Transaktionsmails,
- Google- und Microsoft-OAuth für Kalender-Synchronisation.

Verwende ausschließlich aktuelle stabile Versionen. Begründe wichtige Technologieentscheidungen. Pinne Abhängigkeiten reproduzierbar und dokumentiere notwendige Umgebungsvariablen in einer `.env.example`, niemals mit echten Geheimnissen.

Erstelle mindestens folgende Dokumentation:

- `README.md`,
- `ARCHITECTURE.md`,
- `DATA_MODEL.md`,
- `OPENIMMO_MAPPING.md`,
- `SECURITY_AND_DSGVO.md`,
- `DEPLOYMENT_NETLIFY.md`,
- `PRICING_AND_GUV.md`,
- Datenbankmigrationen und Seed-Daten,
- API- und Webhook-Dokumentation.

## 5. Mandantenfähigkeit und Rechte

Jedes Unternehmen ist ein eigener, technisch strikt getrennter Mandant. Sämtliche fachlichen Datensätze müssen eine Mandantenzuordnung besitzen. Kein Benutzer darf über Frontend, API, Suche, Exporte, Storage-Pfade oder erratbare IDs auf Daten eines anderen Unternehmens zugreifen.

Benötigte Rollen:

- Unternehmensinhaber,
- Administrator,
- Makler,
- Assistenz,
- Marketing,
- Nur-Lese-Zugriff.

Implementiere eine nachvollziehbare Berechtigungsmatrix je Modul und Aktion. Rechte müssen serverseitig und in der Datenbank erzwungen werden, nicht nur durch ausgeblendete Buttons.

Jedes Unternehmen kann sein eigenes Mandanten-Branding hinterlegen:

- Logo,
- Farben,
- Schriftarten,
- Kontaktdaten,
- Impressum,
- Datenschutztexte,
- individuelle Rechtstexte,
- Standardansprechpartner,
- E-Mail-Absenderdaten.

Dieses Branding wird automatisch in Exposés, Web-Exposés, Marketingmaterialien, Wertermittlungen, Verträgen und E-Mails verwendet.

## 6. Dashboard und Navigation

Erstelle ein übersichtliches Dashboard mit mindestens:

- aktiven Objekten,
- neuen Anfragen,
- anstehenden Besichtigungen,
- offenen Aufgaben,
- Vertragsstatus,
- aktuellen Aktivitäten,
- nächsten Terminen,
- Credit-Kontostand,
- Abo- und Nutzerstatus.

Die Hauptnavigation soll mindestens enthalten:

- Dashboard,
- Objekte,
- Kontakte,
- Suchprofile und Matching,
- Exposés,
- Wertermittlung,
- Verträge und Signaturen,
- Marketing,
- Kalender,
- Aufgaben,
- Auswertungen,
- Einstellungen,
- Abonnement und Credits.

## 7. Objekte und Kontakte

Die Objektverwaltung soll sich fachlich am Funktionsumfang etablierter deutscher Maklersoftware wie onOffice orientieren, ohne deren Quellcode, Gestaltung oder geschützte Inhalte zu kopieren.

Unterstütze mindestens:

- Eigentumswohnungen,
- Einfamilienhäuser,
- Doppel- und Reihenhäuser,
- Mehrfamilienhäuser,
- Grundstücke,
- Gewerbeimmobilien,
- Anlageimmobilien,
- Neubauprojekte mit Einheiten,
- Miet- und Kaufobjekte.

Implementiere dynamische, von Objektart und Vermarktungsart abhängige Felder. Dazu gehören unter anderem Stammdaten, Adressen, Flächen, Grundstück, Räume, Baujahr, Zustand, Ausstattung, Energieangaben, Preise, Provisionen, Verfügbarkeit, Eigentümer, Dokumente, Bilder, Grundrisse, interne Notizen und Vermarktungsstatus.

**OpenImmo hat Priorität.** Lege das Objekt-Datenmodell von Beginn an entlang der OpenImmo-Feldlogik an (Objektarten, Vermarktungsart, Flächen, Preise, Energieangaben, Anhänge), damit der Portalexport ohne verlustbehaftetes Mapping möglich ist. Der OpenImmo-Export — schema-valide XML-Erzeugung plus Übertragungsweg zu ImmoScout24, Immowelt und Kleinanzeigen — ist für deutsche Makler das wichtigste Wechselkriterium und rangiert in der Priorität vor Bildbearbeitung, Marketingeditor und E-Signatur: Datenmodell und Exportgerüst entstehen in Phase 1, der produktive Export steht am Anfang von Phase 2. Dokumentiere das Feldmapping in `OPENIMMO_MAPPING.md`.

Kontakte müssen als Eigentümer, Interessenten, Käufer, Mieter, Dienstleister oder sonstige Beteiligte geführt und mehreren Objekten beziehungsweise Vorgängen zugeordnet werden können.

Benötigte Funktionen der ersten marktfähigen Version:

- Interessenten direkt Objekten zuordnen,
- Suchprofile,
- automatisches und manuelles Interessenten-Matching,
- Aktivitätenhistorie,
- Wiedervorlagen,
- Notizen und Anhänge,
- Aufgaben- und Terminzuteilung,
- Excel-/CSV-Import mit Feldzuordnung und Dublettenprüfung,
- OpenImmo-Datenmodell und Exportgerüst (siehe oben),
- E-Mail-Zuordnung zu Kontakt und Objekt,
- Filter, gespeicherte Ansichten und performante Suche,
- DSGVO-konformer Export und Lösch-/Anonymisierungsworkflow.

## 8. KI-Exposés und Web-Exposés

Die KI soll aus strukturierten Objektdaten, Stichpunkten, Ausstattungsmerkmalen und vom Nutzer hochgeladenen Informationen ein vollständiges Exposé erzeugen. Dazu gehören:

- Titelvarianten,
- Kurzbeschreibung,
- Objektbeschreibung,
- Ausstattungsbeschreibung,
- Lagebeschreibung,
- Zielgruppenansprache,
- Eckdaten,
- Bildunterschriften,
- rechtliche Hinweise und vom Mandanten gepflegte Standardtexte.

Unterstütze folgende auswählbare Textstile:

- sachlich,
- emotional,
- hochwertig,
- familienorientiert,
- Kapitalanlage,
- Luxusimmobilie.

Die KI darf keine fehlenden Objektdaten erfinden. Unsichere oder fehlende Angaben sind sichtbar zu kennzeichnen und vor Veröffentlichung vom Nutzer zu bestätigen. Sämtliche KI-Texte bleiben vollständig editierbar und benötigen eine Freigabe.

Stelle fünf feste, hochwertig gestaltete ImmoOffice.ai-Vorlagen bereit:

1. Klassisches ausführliches Exposé,
2. modernes minimalistisches Exposé,
3. bildstarkes Premium-Exposé,
4. kompaktes Kurzexposé beziehungsweise Factsheet,
5. Schaufensteraushang, optimiert für A4/A3.

Das Mandanten-Branding muss automatisch auf diese Vorlagen angewendet werden. Ein normaler oder wiederholter PDF-Export verbraucht keine Credits. Nur die KI-Erstellung beziehungsweise erneute KI-Generierung kosten Credits.

Zusätzlich muss ein responsives Web-Exposé mit individueller URL erstellt werden können. Plane Optionen für Passwortschutz, Ablaufdatum, Kontaktformular, Downloadfreigabe, datenschutzkonforme Aufrufstatistik und Widerruf der Veröffentlichung ein.

## 9. Wertermittlung und Marktpreiseinschätzung

ImmoOffice.ai richtet sich ausdrücklich auch an Immobiliensachverständige und an Makler, die Einwertungen als Akquiseinstrument nutzen. Dafür gibt es ein eigenes Modul „Wertermittlung“:

- geführte Objektaufnahme, wahlweise auf Basis eines bestehenden Objekts aus Abschnitt 7 oder als eigenständige Erfassung,
- nachvollziehbare Herleitungen in Anlehnung an Vergleichswert-, Sachwert- und Ertragswertlogik als offene, editierbare Rechenblätter — der Nutzer trägt Vergleichswerte, Faktoren und Ansätze selbst ein und verantwortet sie; keine Blackbox, keine automatisch „ermittelten“ Werte,
- KI-Unterstützung ausschließlich für Textbausteine (Lage-, Objekt- und Marktbeschreibung) nach den Regeln aus Abschnitt 8,
- Ergebnis als gebrandetes PDF „Marktpreiseinschätzung“ im Vorlagenstil aus Abschnitt 8,
- Pflichtkennzeichnung in jedem Dokument: Marktpreiseinschätzung, keine gutachterliche Aussage, ersetzt kein Verkehrswertgutachten nach § 194 BauGB,
- Provider-Layer für spätere Daten- und AVM-Anbieter (z. B. Sprengnetter) vorsehen; die tatsächliche Anbindung ist Phase 3,
- Credits: KI-Textbausteine kosten Credits gemäß Abschnitt 14, der PDF-Export bestehender Inhalte kostet keine.

Das Grundmodul gehört an den Anfang von Phase 2. Falls die Bestandsanalyse ergibt, dass es sich mit geringem Zusatzaufwand aus den Exposé-Bausteinen ableiten lässt, darf es in Phase 1 vorgezogen werden — dokumentiere die Entscheidung.

## 10. KI-Bildbearbeitung

Integriere die OpenAI-API für Bildgenerierung und Bildbearbeitung. Verwende nicht ein persönliches ChatGPT-Konto und simuliere keine Browsernutzung. Kapsle die Integration in einem austauschbaren Provider-Layer und verwende das aktuell geeignete OpenAI-Bildmodell, sofern es im eingesetzten API-Konto verfügbar ist.

Angebotene Funktionen:

- digitales Homestaging,
- Räume virtuell leeren,
- Möbel oder Gegenstände entfernen,
- Himmel austauschen,
- Rasen und Außenanlagen optimieren,
- Belichtung und Bildwirkung verbessern,
- störende Gegenstände entfernen,
- Tageszeit verändern,
- Grundrisse visualisieren.

Schutzregeln:

- Originaldateien bleiben unverändert erhalten.
- Jede Bearbeitung erzeugt eine neue Version.
- Architektur, Fenster, Türen, Raumgeometrie und wesentliche Objektmerkmale dürfen nicht unbemerkt verfälscht werden.
- Vorher-/Nachher-Vergleich und Versionshistorie sind erforderlich.
- KI-bearbeitete beziehungsweise digital möblierte Bilder werden sichtbar als solche gekennzeichnet.
- Die Kennzeichnung soll auch in Exporten und Web-Exposés erhalten bleiben.
- Verarbeite Bilder asynchron über die Job-Verarbeitung aus Abschnitt 4 mit Statusanzeige, Fehlerbehandlung, Wiederholbarkeit und Kostenprotokoll.

## 11. Verträge und eigene E-Signatur

Stelle zum Start rechtlich zu prüfende Muster beziehungsweise Workflows für folgende Dokumente bereit:

- Makleralleinauftrag,
- qualifizierter Alleinauftrag,
- Nachweis- und Vermittlungsvertrag,
- Reservierungsvereinbarung,
- Mietvertrag,
- Übergabeprotokoll,
- Widerrufsbelehrung,
- Datenschutzunterlagen.

Alle Muster müssen einen klaren Hinweis enthalten, dass sie keine Rechtsberatung ersetzen und vor produktivem Einsatz durch einen qualifizierten Rechtsanwalt geprüft werden müssen. Erfinde keine rechtliche Freigabe und bezeichne keine Vorlage ungeprüft als rechtssicher.

Nutzer können eigene Word- oder PDF-Dokumente hochladen. Das System soll Text und Formularstruktur erkennen, variable Felder vorschlagen und dem Nutzer erlauben, diese Felder zu bestätigen, zu verschieben, umzubenennen und den richtigen Datenquellen zuzuordnen.

Implementiere in der ersten Stufe eine eigene einfache elektronische Signatur mit:

- einem oder mehreren Unterzeichnern,
- frei definierbarer Reihenfolge oder paralleler Signatur,
- sicherem Einladungslink mit Ablaufdatum,
- E-Mail-Verifikation,
- ausdrücklicher Einwilligung zur elektronischen Signatur,
- Signaturfeld per Maus oder Touch,
- manipulationssicherem Dokument-Hash,
- Zeitstempel,
- IP- und Ereignisprotokoll im rechtlich zulässigen Umfang,
- vollständigem Audit-Trail,
- unveränderbarer finaler PDF-Version,
- Download für alle Beteiligten,
- Status „Entwurf“, „versendet“, „geöffnet“, „teilweise unterschrieben“, „abgeschlossen“, „abgelehnt“ und „abgelaufen“.

Wichtig: Stelle eine selbst entwickelte einfache Signatur nicht als qualifizierte elektronische Signatur dar. Prüfe je Dokumentart, ob gesetzliche Formanforderungen bestehen, und kennzeichne Einschränkungen. Beachte dabei insbesondere § 656a BGB (Textform für Maklerverträge über den Kauf von Wohnungen und Einfamilienhäusern): Der beschriebene einfache Signatur-Workflow erfüllt die Textform grundsätzlich; die konkreten Formulierungen und Abläufe sind dennoch vor Produktivbetrieb anwaltlich prüfen zu lassen. Baue die Architektur so, dass später ein qualifizierter Vertrauensdiensteanbieter ergänzt werden kann.

## 12. Marketing und Vorlageneditor

Marketingmaterialien werden direkt in ImmoOffice.ai erstellt. Eine Canva-Integration ist für die erste Version nicht vorgesehen.

Unterstütze mindestens:

- Instagram-Posts,
- Instagram-Storys,
- Objektanzeigen,
- Verkaufsschilder,
- Flyer,
- Postkarten,
- Akquiseanschreiben,
- E-Mail-Kampagnen,
- Immobilienportaltexte,
- Eigentümer-Reports.

Erstelle einen benutzerfreundlichen Vorlageneditor mit festen, professionellen Layouts, Mandanten-Branding, editierbaren Texten, Bildern und Exportformaten. Verwende für exakte Layouts einen deterministischen Template-/Canvas-Ansatz; nutze Bild-KI nur für visuelle Inhalte, nicht für die fehleranfällige Erzeugung kompletter Designs mit eingebettetem Text.

KI-generierte Texte und Varianten verbrauchen Credits. Normale manuelle Bearbeitung und erneute Downloads bestehender Ergebnisse sind kostenlos.

## 13. Kalender und Aufgaben

Implementiere einen eigenen Kalender mit Tages-, Wochen-, Monats- und Listenansicht. Zusätzlich sollen Google Calendar und Microsoft Outlook über OAuth synchronisiert werden können.

Benötigt werden:

- Termine und Besichtigungen,
- Aufgaben und Wiedervorlagen,
- Zuordnung zu Objekten, Kontakten und Mitarbeitern,
- Verantwortliche und Teilnehmer,
- Fälligkeiten, Prioritäten und Status,
- Serienaufgaben und Serientermine,
- automatische Erinnerungen per E-Mail,
- Konflikterkennung,
- Protokollierung der Synchronisation,
- Schutz vor doppelten Terminen und Synchronisationsschleifen.

## 14. Abonnements, Benutzerpreise und Credits

Alle öffentlich angezeigten B2B-Preise sind als Nettopreise zuzüglich gesetzlicher Umsatzsteuer darzustellen. Setze folgende Preisstruktur zunächst als konfigurierbare Standardwerte um:

| Tarif | Enthaltene Benutzer | Monatspreis | Jahrespreis | Monatliche Credits |
|---|---:|---:|---:|---:|
| Starter | 1 | 29,99 € | 299,90 € | 300 |
| Professional | 3 | 99,99 € | 999,90 € | 1.500 |
| Business | 10 | 199,99 € | 1.999,90 € | 4.000 |
| Enterprise | individuell | auf Anfrage | auf Anfrage | individuell |

Das Jahresabonnement entspricht zehn Monatsbeiträgen und gewährt damit zwei Monate Preisvorteil. Plane einen zusätzlichen Benutzer mit zunächst **14,99 € netto pro Monat** beziehungsweise **149,90 € netto pro Jahr**. Alle Preise, Limits und Credit-Werte müssen über den Plattform-Admin konfigurierbar sein und dürfen nicht an vielen Stellen im Code hart verdrahtet werden.

Kostenlose Testphase:

- 7 Tage,
- ein Benutzer,
- 100 Test-Credits,
- kein automatisches Berechnen ohne ausdrückliche Auswahl eines Tarifs und gültiges Stripe-Mandat,
- Schutz vor missbräuchlichen Mehrfachregistrierungen.

Credit-Regeln:

- Nicht verbrauchte Inklusiv-Credits können maximal in den unmittelbar folgenden Abrechnungsmonat übertragen werden.
- Der übertragbare Betrag ist auf die Höhe eines regulären monatlichen Credit-Kontingents begrenzt.
- Zuerst werden die ältesten Credits verbraucht.
- Gekaufte Zusatz-Credits sind 12 Monate gültig, soweit dies rechtlich und bilanziell korrekt umgesetzt werden kann.
- Bei Tarifwechsel, Kündigung, Rückerstattung und fehlgeschlagener Zahlung müssen klare, konsistente Regeln gelten.
- Kein negativer Credit-Saldo.
- Jede Buchung wird in einem unveränderbaren Credit-Ledger mit Quelle, Aktion, Kosten, Zeit und Rückerstattungsstatus gespeichert.
- Bei technisch fehlgeschlagenen KI-Aufträgen werden reservierte Credits automatisch freigegeben oder erstattet.

Startwerte für Aktionen, später zentral konfigurierbar:

| Aktion | Credits |
|---|---:|
| einzelner KI-Text oder Textvariante | 2 |
| vollständige Exposé-Texterstellung | 10 |
| Marketingtext beziehungsweise Social-Media-Paket | 5 |
| einfache Bildoptimierung | 10 |
| umfangreiche Bildbearbeitung oder Homestaging | 30 |
| Grundrissvisualisierung | 30 |
| versendeter Signaturvorgang je Dokumentenpaket | 5 |
| PDF-Export eines bestehenden Inhalts | 0 |
| Web-Exposé-Veröffentlichung ohne neue KI-Erstellung | 0 |

Diese Werte sind keine unveränderlichen Vorgaben. Rechne sie vor dem finalen Einsatz anhand der realen API-Kosten, durchschnittlichen Nutzung, gewünschter Bruttomarge und eines Sicherheitspuffers von mindestens 20 % nach. Ein Credit ist eine interne Nutzungseinheit und kein festes Euro-Guthaben.

Zusätzliche Credit-Pakete:

| Paket | Credits | Nettopreis |
|---|---:|---:|
| Klein | 250 | 9,99 € |
| Mittel | 1.000 | 29,99 € |
| Groß | 3.000 | 69,99 € |

Implementiere Stripe Checkout beziehungsweise Stripe Billing, Customer Portal, Rechnungen, Gutscheine, Jahres- und Monatsabos, Zusatznutzer, Credit-Pakete, Upgrade/Downgrade, anteilige Berechnung, fehlgeschlagene Zahlungen und idempotent verarbeitete Webhooks. Der lokale Abo-Status darf nicht allein dem Frontend vertrauen.

## 15. Plattform-Administration

ImmoOffice.ai benötigt einen getrennten Plattform-Adminbereich für den Betreiber mit:

- Mandantenübersicht,
- Tarifen und Abonnementstatus,
- Benutzerzahlen,
- Credit-Verbrauch,
- API-Kosten und Deckungsbeitrag,
- fehlgeschlagenen Jobs und Webhooks,
- Supportfällen,
- Sperrung und Reaktivierung von Mandanten,
- konfigurierbaren Preisen, Credit-Werten und Limits,
- Feature-Flags,
- Audit-Logs,
- Systemzustand und Fehlerübersicht.

Plattform-Administratoren dürfen nicht automatisch unnötig auf vertrauliche Objekt- oder Kundendaten zugreifen. Implementiere ein protokolliertes Supportzugriffsverfahren nach dem Prinzip der geringsten Rechte.

## 16. DSGVO, Sicherheit und Betrieb

Hosting und Datenspeicherung müssen in Deutschland oder zumindest innerhalb der EU erfolgen. Prüfe dies für jeden eingesetzten Auftragsverarbeiter und dokumentiere Region, Datenfluss, Unterauftragnehmer, Aufbewahrung und Löschung. Behaupte keine vollständige DSGVO-Konformität allein aufgrund technischer Maßnahmen; liefere die technischen Voraussetzungen und markiere juristisch beziehungsweise organisatorisch noch zu prüfende Punkte.

Benötigt werden mindestens:

- Mandantentrennung und Row-Level-Security,
- sichere Authentifizierung und Passwortregeln,
- kein verpflichtendes Zwei-Faktor-Verfahren in Version 1,
- technische Vorbereitung für späteres 2FA,
- rollenbasierte Rechte,
- Verschlüsselung bei Übertragung und Speicherung,
- Schutz vor OWASP-Top-10-Risiken,
- Rate Limits,
- sichere Upload-Prüfung,
- Virenscan-Konzept,
- unveränderbare Audit-Logs für kritische Aktionen,
- automatische verschlüsselte Backups,
- getestete Wiederherstellung,
- Auftragsverarbeitungsübersicht,
- Einwilligungsmanagement,
- Datenexport,
- Lösch- und Aufbewahrungskonzept,
- Anonymisierung, wo gesetzliche Aufbewahrung einer Löschung entgegensteht,
- Datenschutzerklärung, Impressum und Cookie-/Consent-Konzept,
- Protokollierung sicherheitsrelevanter Ereignisse,
- keine Secrets im Client oder Repository.

Reduziere personenbezogene Daten, die an KI-Anbieter übertragen werden, auf das erforderliche Minimum. Verwende geeignete Verträge und verfügbare Datenschutz-/Speicheroptionen der Anbieter; nutze bei OpenAI verfügbare EU-Datenresidenz- und Datenaufbewahrungs-Optionen und halte den Provider-Layer so, dass ein EU-gehosteter Anbieter (z. B. Azure OpenAI in einer EU-Region) ohne Architekturänderung einsetzbar wäre. Lege klar offen, welche Daten für welche KI-Funktion verarbeitet werden.

## 17. Wirtschaftlichkeits- und GuV-Berechnung

Erstelle zusätzlich zur Software eine transparente wirtschaftliche Modellrechnung in `PRICING_AND_GUV.md` sowie eine intern nutzbare Admin-Auswertung. Die öffentliche Preisübersicht darf keine internen Kosten oder Margen zeigen.

Ausgangswerte:

### Einmalige Kosten

- Erstentwicklung: **1.500 €**.

Diese Zahl ist eine Modellannahme für die Wirtschaftlichkeitsrechnung, kein Maßstab für den tatsächlichen Umfang der Phasen. Führe zusätzlich je Phase eine ehrliche Aufwandsschätzung (Kalenderwochen beziehungsweise Personentage) und halte sie bei Abweichungen aktuell. Weise ausdrücklich darauf hin, welche Teile mit diesem Budget als funktionaler MVP beziehungsweise Prototyp realistisch sind und welche Funktionen weitere Entwicklungsphasen benötigen. Stelle keine Enterprise-Produktionsreife vor, wenn sie mit diesem Budget nicht erreichbar ist.

### Monatliche Betriebskosten zum Start

| Kostenposition | Betrag pro Monat |
|---|---:|
| Hosting und Datenbank | 150 € |
| KI-Textgenerierung | 150 € |
| Bildgenerierung/Homestaging | 150 € |
| E-Signaturen | 50 € |
| Zahlungsabwicklung | 50 € |
| Support und Weiterentwicklung | 250 € |
| Marketing und Vertrieb | 250 € |
| Personal | 250 € |
| **Gesamt** | **1.250 €** |

Behandle KI, Stripe, E-Mail, Storage und Signaturkosten zusätzlich als nutzungsabhängig, sofern reale Kosten mit wachsender Kundenzahl ansteigen. Trenne Fixkosten und variable Kosten sauber. Verwende Netto-Umsätze ohne Umsatzsteuer.

Erstelle drei Szenarien mit folgenden aktiven Kunden zum jeweiligen Jahresende:

| Szenario | Ende Jahr 1 | Ende Jahr 2 | Ende Jahr 3 |
|---|---:|---:|---:|
| konservativ | 20 | 50 | 90 |
| realistisch | 35 | 100 | 220 |
| ambitioniert | 60 | 200 | 450 |

Standardannahmen, die sichtbar und veränderbar sein müssen:

- Tarifmix: 55 % Starter, 35 % Professional, 10 % Business; Enterprise zunächst separat,
- lineare beziehungsweise begründet realistischere Kundenentwicklung zwischen den Jahresendwerten,
- monatliche Kündigungsquote je Szenario separat ausweisen,
- Anteil monatlicher und jährlicher Zahlungen berücksichtigen,
- durchschnittliche Credit-Auslastung von zunächst 60 %,
- reale variable API-Kosten je Aktion plus mindestens 20 % Sicherheitspuffer,
- Zusatznutzer, Credit-Pakete und Enterprise-Umsätze separat und vorsichtig modellieren,
- Preissteigerungen und Kostensteigerungen als Sensitivität ausweisen.

Berechne:

- monatliche GuV für die ersten 24 Monate,
- jährliche GuV für drei Jahre,
- MRR und ARR,
- Umsatz je Tarif,
- durchschnittlichen Umsatz pro Mandant,
- fixe und variable Kosten,
- Rohertrag und Deckungsbeitrag je Tarif,
- EBITDA-nahe operative Betrachtung vor Steuern,
- monatlichen Cashflow unter Berücksichtigung der 1.500 € Erstentwicklung,
- Break-even nach Kundenanzahl und Zeitpunkt,
- Customer Acquisition Cost,
- Customer Lifetime Value,
- LTV/CAC-Verhältnis,
- Churn-Sensitivität,
- maximale wirtschaftliche Credit-Nutzung je Tarif,
- Marge der Zusatz-Credit-Pakete,
- Worst-Case bei überdurchschnittlich vielen hochwertigen Bildbearbeitungen.

Kennzeichne jede Annahme, erfinde keine fehlenden Ist-Zahlen und ergänze eine Sensitivitätsanalyse. Ermögliche Änderungen der Preis-, Tarifmix-, Kunden-, Churn-, Credit- und Kosteneingaben, ohne Formeln neu programmieren zu müssen.

## 18. Umsetzung in Phasen

Plane und entwickle in dieser Reihenfolge:

### Phase 0 – Analyse und Fundament

- Bestandsanalyse von E&P World (nach Abschnitt 0 und 1),
- Funktionsmatrix,
- Anwendung des fixierten Brandings, Designsystem und Styleguide-Seite,
- Architektur inklusive Entscheidung zur Job-/Queue-Verarbeitung,
- Mandanten- und Rollenmodell,
- Datenmodell inklusive OpenImmo-Feldmapping-Entwurf,
- Netlify-Projektstruktur,
- Authentifizierung und Basis-Sicherheit,
- Aufwandsschätzung je Phase.

**Gate A — verbindlicher Stopp:** Nach Phase 0 legst du Bestandsaufnahme, Funktionsmatrix, Styleguide, Architektur, Datenmodell, OpenImmo-Mapping-Entwurf, Umsetzungsplan und Aufwandsschätzung vor und wartest auf ausdrückliche Freigabe. Ohne Freigabe entsteht kein Phase-1-Code.

### Phase 1 – verkaufsfähiger Kern-MVP

Beginne mit einem demofähigen Durchstich (v0.1): Registrierung und Login, Mandant und Rollen, Objekte, Kontakte, eine Exposé-Vorlage mit KI-Text, PDF-Export, Dashboard-Rumpf. Danach der Rest:

- vollständiges Dashboard,
- Unternehmen, Benutzer und Rollen,
- Objekte und Kontakte im vollen Umfang,
- Suchprofile und Aktivitäten,
- Aufgaben und eigener Kalender,
- KI-Texte,
- fünf Exposé-Vorlagen,
- PDF- und Web-Exposé,
- OpenImmo-Datenmodell und Exportgerüst,
- Stripe-Abos und Credit-Ledger,
- Plattform-Admin,
- DSGVO-Grundfunktionen.

**Gate B — verbindlicher Stopp:** Vor dem Livebetrieb der Stripe-Abrechnung und vor Beginn von Phase 2: Demonstration der Kernflüsse, Nachweis der Cross-Tenant-Isolation durch Tests, Freigabe der Preise und Rechtstexte durch den Auftraggeber.

### Phase 2 – Automatisierung und Marktreife (in dieser Reihenfolge)

- produktiver OpenImmo-Export zu ImmoScout24, Immowelt und Kleinanzeigen,
- Wertermittlungsmodul (Abschnitt 9),
- Job-Queue produktiv und OpenAI-Bildbearbeitung,
- Marketingeditor,
- Dokumenten-Upload und Felderkennung,
- mehrstufige einfache E-Signatur,
- Google- und Outlook-Synchronisation,
- E-Mail-Zuordnung,
- CSV-Import.

### Phase 3 – Härtung und Skalierung

- Last- und Sicherheitstests,
- Backup-Wiederherstellungstest,
- erweiterte Auswertungen,
- Observability,
- Missbrauchsschutz,
- optimierte Jobs und Warteschlangen,
- Vorbereitung externer qualifizierter Signaturdienste,
- Anbindung externer Bewertungs- und Datenanbieter (z. B. Sprengnetter),
- weitere Portal- und E-Mail-Integrationen.

## 19. Qualitätskriterien und Tests

Erstelle automatisierte Tests für mindestens:

- Registrierung und Mandantenerstellung,
- Einladung und Rollenrechte,
- strikte Cross-Tenant-Isolation,
- Objekt- und Kontaktverwaltung,
- Suchprofile und Matching,
- Credit-Reservierung, Verbrauch und Rückerstattung,
- Stripe-Webhook-Idempotenz,
- PDF- und Web-Exposé,
- schema-validen OpenImmo-Export,
- Datei- und Bildversionierung,
- Signaturreihenfolge und Audit-Trail,
- Kalender-Synchronisationslogik,
- DSGVO-Export und Löschworkflow.

Führe zusätzlich Typecheck, Linting, Unit-Tests, Integrationstests und einen Produktions-Build aus. Behebe Fehler, bevor du einen Meilenstein als abgeschlossen bezeichnest.

## 20. Erwartete Ergebnisse

Liefere in nachvollziehbaren Schritten:

1. Bestandsanalyse von E&P World,
2. Funktionsmatrix und Abgrenzung,
3. Designsystem und Styleguide auf Basis des fixierten Brandings,
4. Architektur- und Datenmodell inklusive OpenImmo-Mapping,
5. priorisierten Umsetzungsplan inklusive ehrlicher Budget- und Aufwandseinschätzung,
6. vollständigen Quellcode der jeweils freigegebenen Phase,
7. Datenbankmigrationen und sichere Beispieldaten ohne E&P-Bezug,
8. Stripe- und Credit-System,
9. Preisübersicht und GuV-Modell,
10. Tests und Testergebnisse,
11. Netlify-Deployment-Konfiguration,
12. verständliche Anleitung für Installation, Umgebungsvariablen und Inbetriebnahme.

Beginne jetzt mit der Analyse der Referenzdatei nach Abschnitt 0 und 1. Lege danach das vollständige Gate-A-Paket vor und stoppe für die Freigabe. Nach der Freigabe startest du ohne unnötige Wiederholung mit Phase 1, beginnend mit dem Durchstich v0.1. Stoppe darüber hinaus nur bei einer wirklich blockierenden Entscheidung oder wenn Zugangsdaten beziehungsweise externe Freigaben erforderlich werden.
