# Funktionsinventar der Referenz — Stand je Bedienelement

**Maßgebliche Arbeitsliste** für die 1:1-Übernahme (E-2026-09-03-36,
E-2026-09-04-56). Ersetzt `docs/FUNKTIONSABGLEICH.md`, der je Funktionsfamilie
zu früh Haken gesetzt hat. Stand: 04.09.2026.

**Methode:** Die Referenz (Kompilat, unversioniert unter `reference/`) wurde
auf der Festplatte in ihre 308 Komponenten zerlegt; je Seite wurden die
Oberflächentexte (Schaltflächen, Dialoge, Feldbezeichnungen, Hinweise) und
die genutzten Datenbankfunktionen extrahiert — 19.086 Texte in 62 Seiten. Neun
unabhängige Prüfläufe haben daraus je Kachel die Bedienfunktionen gebildet und
**jede** gegen den Quellcode von ImmoOffice.ai geprüft. Ein ✓ ohne Fundstelle
gibt es nicht. Namen, Orte, Domains und Dienste des Referenzunternehmens sind
nicht übernommen („Referenz").

Legende: **✓** vorhanden (mit Fundstelle) · **◐** teilweise (Lücke benannt) ·
**✗** fehlt. „Scope"/„ausgeschlossen laut Masterprompt" = bewusst nicht
übernommen (`docs/SCOPE.md`): Firmen-Cloud-Ablage, Bürobildschirm, Liquidität,
Provisionsrechner.

## Gesamtbild

| Kachel | ✓ | ◐ | ✗ | Bemerkung |
|---|---|---|---|---|
| Startseite, Heute-Zone, Suche, Glocke, Tutorial, Rahmen | 40 | 13 | 20 | Kachel-Startseite mit Anpassen seit Paket 16a (noch nicht eingerechnet) |
| Adressbuch | 17 | 13 | 10 | Kontakte nicht bearbeit-/löschbar, keine Liste mit Suche/Filter |
| Termine | 45 | 17 | 8 | Erinnerung nur intern, kein Lead aus Termin, keine Dublettenwarnung |
| ToDos | 33 | 16 | 8 | keine KI-Analyse, keine Zeitfilter, Erinnerungen nicht zugestellt |
| Immobilien — Übersicht, Bestand, Neubau, Aufnahme | 18 | 31 | 16 | Objektliste ohne Suche/Filter, Aufnahme 5 von 10 Abschnitten |
| Immobilien — Objektakte | 29 | 62 | 41 | Formular nutzt Schemafelder nicht, Verknüpfungen unsichtbar |
| Exposé-Schmiede | 10 | 11 | 8 | Kern steht; Entwurfs-Pool, Einzeltext-Modus, Bildanalyse fehlen |
| KI-Agenten | 0 | 1 | 11 | fehlt vollständig |
| Verkauf | 55 | 68 | 46 | E-Signatur nur eine Person, Bewertung ohne Export |
| Vermietung | 50 | 22 | 11 | Selbstauskunft schmaler, keine Suche |
| Posteingang | 25 | 13 | 39 | bewusst reduziert (Masterprompt); Editorhilfen fehlen |
| Marketing | 20 | 27 | 40 | Vorlagen ohne Foto/Eingaben/PNG; keine Ablage, kein Print |
| Werkzeuge | 28 | 21 | 10 | stärkster Bereich |
| Dokumente / Geschäftsbriefe | 14 | 5 | 1 | Briefe vollständig; zentrale Ablage fehlt |
| Firmen-Cloud-Ablage | 0 | 0 | 7 | ausgeschlossen |
| Kundenbereich | 46 | 25 | 54 | Dokument-Freigabe-Workflow fehlt komplett |
| Akquise | 109 | 57 | 56 | Lead-Mails, Lagekarte, Matching, Automations-Schutzregeln |
| Admin-Bereich | 26 | 17 | 12 | Bausteine fehlen, Kennzahlen ungenutzt |
| Mein Profil / Team / Arbeitszeit | 28 | 11 | 7 | Prüfung der Arbeitszeit, Team-Seite |
| Bewerber (streichbar) | 12 | 7 | 5 | ohne KI-Vorbewertung |
| Finanzen | 1 | 2 | 25 | 24 davon ausgeschlossen |
| Rechnungen | 20 | 7 | 0 | vollständig |
| **Summe** | **626** | **446** | **435** | 1 507 Bedienfunktionen; rund 50 ✗ sind Scope-Ausschlüsse |

Das heißt: **42 % vollständig, 30 % teilweise, 29 % fehlend.** Die Haken des
alten Abgleichs waren auf Familienebene richtig, auf Bedienelement-Ebene zu
großzügig. Die Lücken sind jetzt zählbar und werden Kachel für Kachel
geschlossen.

## Reihenfolge der Lückenschließung

| Paket | Kachel(n) | Schwerpunkt |
|---|---|---|
| 16a ✓ | Startseite, Modulseiten | Kacheln 1:1, Anpassen-Modus |
| 16b ✓ | Termine | Lead aus Termin, Nachfass-Freigabe, KI-Bestätigungstext, Dubletten, Urlaub aus Kalender, Termin-Vorschläge, Termin in Mail, Termin aus Mailpassage, Kunden-Erinnerung |
| 16c | ToDos | KI-Analyse, Zeitfilter, Sortierung, Sammelaktionen, Erinnerungszustellung, Tag-Verwaltung |
| 16d | Adressbuch | Bearbeiten/Löschen, Liste mit Suche/Filter/Sortierung, E-Mail-Verlauf, Titel |
| 17 | Immobilien-Akte | Formular auf Schema, Verknüpfungen sichtbar, Einheiten, Kopieren, Bildsteuerung je Kanal, Web-Fassung |
| 18 | KI-Agenten | Exposé-Prüfer, Mietvertrags-Prüfer, Assistent, Objektwissen, Dateinamen |
| 19 | Verkauf | Mehrpersonen-Signatur, Vorunterzeichnung, Bewertungs-Export, Querverbindungen |
| 20 | Marketing, Dokumente | Vorlagen mit Foto/Eingaben/PNG, Ablage, Print |
| 21 | Kundenbereich | Dokument-Freigabe, Personen, Hinweise auf Neues |
| 22 | Akquise, Posteingang, Vermietung, Admin | Restlücken |

---

# Funktionsinventar Referenz → ImmoOffice.ai: Adressbuch, Termine, ToDos, Startseite

Quelle: Textextrakte der Referenz-Komponenten (`analyse/inventar/*.txt`, `_technik.txt`).
Abgleich gegen den Stand des Repositories vom 2026-09-04 (`src/`, `supabase/migrations/`).
Alle Pfade relativ zu `/home/user/Immooffice.ai/`.

Legende: ✓ vorhanden (Fundstelle) · ◐ teilweise (was fehlt) · ✗ fehlt.
Kein ✓ ohne Fundstelle. Kennzeichen des Referenzunternehmens werden nicht wiedergegeben („Referenz“).

Hinweis zur Einordnung: Das Kundenbereich (Referenz-Modul) (Eigentümer-/Käufer-Portal) ist laut `docs/SCOPE.md` nicht im Scope;
das Repository führt trotzdem einen „Kundenbereich“ (`src/components/portal/`). Die dazu gehörenden
Referenzfunktionen sind unten der Vollständigkeit halber geprüft, aber nicht als Lücke gewichtet.

---

## Kachel Adressbuch (Kontakte)

### Kontaktliste (Referenz „KontaktePage“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kachel/Menüpunkt „Adressbuch“ | Einstieg von Startseite und Navigation | ✓ | `src/app/(app)/dashboard/page.tsx` (Kachel „Kontakte“), `src/components/Navigation.tsx` |
| Schaltfläche „Kontakt anlegen“ / „Neuer Kontakt“ | Öffnet leeres Formular | ✓ | `src/app/(app)/kontakte/page.tsx`, `src/app/(app)/kontakte/neu/page.tsx` |
| Liste aller Kontakte mit Name/Firma, E-Mail, Telefon, Ort | Übersicht mit Zähler | ✓ | `src/app/(app)/kontakte/page.tsx` (Zähler im Seitenkopf, Zeilen mit E-Mail/Telefon/Ort) |
| Rollen-Chips je Kontakt in der Liste | Sichtbar, welche Rollen ein Kontakt hat | ✓ | `src/app/(app)/kontakte/page.tsx` (`kontakt_rollen`, `Marke`) |
| Suchfeld „Name, Firma, E-Mail, Ort …“ | Volltext-Filter der Liste | ✗ | Keine `searchParams`/kein Suchfeld in `src/app/(app)/kontakte/page.tsx`; nur die globale Suche (Strg+K) findet Kontakte |
| Filter „Alle Rollen“ (Rollenfilter) | Liste nach Rolle einschränken | ✗ | Kein Filter in `src/app/(app)/kontakte/page.tsx` |
| Sortierung Name / Firma / Ort / Zuletzt angelegt | Umschaltbare Sortierung | ✗ | Feste Sortierung `order("nachname")` in `src/app/(app)/kontakte/page.tsx` |
| Kennzeichen „Portal-Zugang“ in der Liste | Zeigt Kontakte mit Kundenbereich-Zugang | ✗ | Zugang nur auf der Detailseite (`src/components/portal/KontaktZugang.tsx`); Liste lädt `portal_kunden` nicht |
| Kennzeichen „Objekt verknüpft“ in der Liste | Zeigt verknüpfte Objekte (immo_nr, Ort) | ✗ | Liste lädt `kontakt_objekt` nicht; Verknüpfungen nur auf `src/app/(app)/kontakte/[id]/page.tsx` |
| Leerzustand „Keine Kontakte gefunden“ | Hinweis bei leerer Liste | ✓ | `src/app/(app)/kontakte/page.tsx` („Noch keine Kontakte“, Ersten Kontakt anlegen) |
| Ladezustand „Lade Kontakte…“ | Zwischenzustand | ✓ | Serverseitiges Rendern (kein Client-Ladezustand nötig); Next-Streaming in `src/app/(app)/layout.tsx` |

### Kontaktformular / Kontaktseite (Referenz „KontaktSeite“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| „← Zurück“ | Rücksprung zur Liste | ✓ | `src/app/(app)/kontakte/[id]/page.tsx` („Zur Übersicht“), `KontaktFormular.tsx` („Abbrechen“) |
| Anrede (Herr, Frau, Familie, Firma) | Auswahl | ◐ | `src/app/(app)/kontakte/KontaktFormular.tsx`: Frau/Herr/Firma — „Familie“ fehlt |
| Titel (z. B. Dr.) | Feld | ◐ | Spalte `titel` existiert (`supabase/migrations/20260816200353_objekte_kontakte.sql`) und wird auf der Detailseite angezeigt, aber im Formular fehlt das Feld |
| Vorname, Nachname | Pflichtlogik „Nachname oder Firma“ | ✓ | `KontaktFormular.tsx`, `src/server/kontakt-aktionen.ts` (Zod-Refine, gleiche Regel in DB) |
| Firma | Feld | ✓ | `KontaktFormular.tsx` |
| E-Mail, Telefon, Mobil | Felder mit E-Mail-Prüfung | ✓ | `KontaktFormular.tsx` (E-Mail, Telefon), `kontakt-aktionen.ts` (Mobil, `z.email`); Mobil im Formular nicht sichtbar, nur in der Aktion → Feld fehlt in der Oberfläche (◐) |
| Beruf / Funktion | Feld | ✗ | Keine Spalte, kein Feld |
| Straße & Hausnummer, PLZ, Ort | Adressfelder | ✓ | `KontaktFormular.tsx` (Straße, Hausnummer, PLZ, Ort getrennt) |
| Notiz | Freitext | ✓ | `KontaktFormular.tsx` (`notizen`) |
| Rollen (Mehrfachauswahl) | Interessent, Eigentümer, Käufer, Mieter, Notar … | ✓ | `KontaktFormular.tsx` + `src/lib/kontakt-begriffe.ts` (7 Rollen), Tabelle `kontakt_rollen` |
| Einwilligung Werbung mit Zeitstempel | Nachweis für werbliche Ansprache | ✓ (Mehrwert) | `KontaktFormular.tsx`, `kontakt-aktionen.ts` (`einwilligung_am`) |
| Speichern / „Speichert…“ | Anlegen und Ändern | ◐ | Anlegen: `kontakte/neu/page.tsx`. **Ändern eines bestehenden Kontakts ist nicht erreichbar**: `KontaktFormular` unterstützt `kontakt.id`, wird aber nur unter `/kontakte/neu` eingebunden; `src/app/(app)/kontakte/[id]/page.tsx` hat keinen Bearbeiten-Link, keine Route `/kontakte/[id]/bearbeiten` |
| Kontakt löschen / anonymisieren | Entfernen mit `geloescht_am` | ✗ | Spalten `geloescht_am`/`anonymisiert_am` vorhanden, aber keine Aktion in `kontakt-aktionen.ts` und keine Schaltfläche |
| Hinweis „hat Kundenbereich-Zugang, hier nur Stammdaten“ | Abgrenzung Portalverwaltung | ✓ | `src/components/portal/KontaktZugang.tsx` (Hinweistext) |
| Verknüpfte Objekte (Liste mit Rolle je Verknüpfung) | Rolle hängt an der Verknüpfung, nicht am Menschen | ✓ | `src/app/(app)/kontakte/[id]/page.tsx` (Karte „Objekte“, `kontakt_objekt` mit Rolle, Anteil, seit) |
| „Verknüpfen“ vom Kontakt aus (Objekt-Suchfeld) | Objekt auswählen und Rolle vergeben | ◐ | Verknüpfung nur von der Objektseite (`src/components/Beteiligte.tsx`, `src/server/beteiligte-aktionen.ts`); die Kontaktseite verweist auf „Beteiligte“ am Objekt |
| „Lösen“ einer Verknüpfung | Verknüpfung entfernen | ◐ | Nur auf der Objektseite (`beteiligtenEntfernen` in `beteiligte-aktionen.ts`) |
| Duplikatschutz „bereits in dieser Rolle verknüpft“ | Doppelte Verknüpfung verhindern | ✓ | `src/server/beteiligte-aktionen.ts` (Unique-Verletzung 23505 abgefangen) |
| „Erst speichern, danach Objekte verknüpfen“ | Reihenfolge-Hinweis | ✓ | Sinngemäß in `kontakte/[id]/page.tsx` (Leerzustand der Objekt-Karte) |
| „(Objekt gelöscht)“-Kennzeichen | Verwaiste Verknüpfung | ◐ | `kontakte/[id]/page.tsx` überspringt Verknüpfungen ohne Objekt (`if (!objekt) return null`) statt sie zu kennzeichnen |
| Objekt-Suchfeld mit Tastaturnavigation (Straße, Ort, PLZ, Nr., Bezeichnung) | Typeahead | ◐ | Auswahllisten (`<Auswahl>`) mit Limit 500 in `Beteiligte.tsx`, `TerminFormular.tsx`, `AufgabeDetail.tsx`; kein Typeahead |
| „Maklervertrag mit den Daten dieses Kontakts anlegen“ | Absprung mit Vorbelegung | ◐ | Vorlage existiert (`src/app/(app)/vertraege/vorlage/maklervertrag/page.tsx`, `kontakt_id` in `src/server/vertrag-aktionen.ts`), aber kein Link/keine Vorbelegung von der Kontaktseite |
| „Objektnachweis mit den Daten dieses Kontakts anlegen“ | Absprung mit Vorbelegung | ◐ | `vertraege/vorlage/objektnachweis/page.tsx` vorhanden; kein Absprung vom Kontakt |
| „Reservierung mit den Daten dieses Kontakts anlegen“ | Absprung mit Vorbelegung | ◐ | Reservierungen unter `src/app/(app)/vermietung/reservierungen/page.tsx`; kein Absprung vom Kontakt |
| Verlauf / Aktivitäten am Kontakt | Anrufe, E-Mails, Besichtigungen, Notizen | ✓ (Mehrwert) | `src/components/Verlauf.tsx`, `src/lib/verlauf.ts`, `kontakte/[id]/page.tsx` |
| Aufgaben und Termine am Kontakt (+ anlegen) | Kontakt als Drehkreuz | ✓ (Mehrwert) | `kontakte/[id]/page.tsx` (`Aufgabenliste`, `Terminliste`, `AufgabeAnlegen`) |
| Suchprofile am Kontakt | Gesuche | ✓ (Mehrwert) | `kontakte/[id]/page.tsx` (Karte „Suchprofile“) |

### Korrespondenz (Referenz „KontaktKorrespondenz“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| E-Mail-Verlauf am Kontakt (Posteingang, Gesendet, Archiv, Junk, Papierkorb, Entwurf) | Alle Mails von/an die Adresse aus Postfach und Portalversand | ✗ | Postfach ordnet Nachrichten Kontakten zu (`nachrichten.kontakt_id`, `supabase/migrations/20260903160000_postfaecher.sql`; `src/components/postfach/NachrichtDetail.tsx`), aber `kontakte/[id]/page.tsx` lädt keine Nachrichten (auch `docs/FUNKTIONSABGLEICH.md` K3: „Anzeige am Kontakt fehlt“) |
| „✉ E-Mail schreiben“ vom Kontakt | Öffnet Mail an den Kontakt | ✗ | Postfach unterstützt Vorbelegung `?neu=1&an=…` (`src/app/(app)/postfach/page.tsx`), aber kein Link auf der Kontaktseite |
| Hinweis „Keine E-Mail-Adresse hinterlegt“ | Ohne Adresse kein Verlauf | ✗ | Entfällt mit fehlendem Verlauf |
| Klick zeigt Mailtext | Aufklappen einzelner Mails | ✗ | Nur im Postfach (`NachrichtDetail.tsx`) |

### Kundenbereich-Zugang am Kontakt (Referenz „KontaktEigentuemerPortal“, „EigentuemerEinladenModal“) — laut SCOPE nicht im Scope

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Statusanzeige (kein Zugang / eingeladen / aktiv / deaktiviert) | Zugangsstatus | ✓ | `src/components/portal/KontaktZugang.tsx` (gesperrt/aktiv/eingeladen) |
| Einladung als Eigentümer / Käufer aus dem Kontakt | Übernimmt Name, Adresse, E-Mail | ✓ | `KontaktZugang.tsx`, `kundeAusKontaktEinladen` in `src/server/portal-aktionen.ts` |
| Hinweis „braucht E-Mail-Adresse“ | Validierung | ✓ | `KontaktZugang.tsx` |
| Einladungsdialog mit Anrede/Titel/Name/E-Mail/Telefon, Maklervertrag verknüpfen | Vollständiger Dialog | ◐ | Einladung übernimmt Stammdaten ohne Dialog; Objektfreigaben im Kundenbereich (`src/components/portal/KundeDetail.tsx`); keine Vertragsverknüpfung im Einladeschritt |
| Magic-Link erneut senden | Login-Link nachsenden | ◐ | „Link erneuern“ im Kundenbereich (`KundeDetail.tsx`), nicht am Kontakt |
| Personen / Objekte / Dokumente / Nachrichten / Ungelesen-Zähler / Einladung gültig bis | Portal-Kennzahlen am Kontakt | ◐ | Nur Zugänge mit Datum am Kontakt; Details im Kundenbereich (`/kundenbereich/[id]`) |
| „Portal-Akte öffnen“ | Absprung in die Portalverwaltung | ✓ | `KontaktZugang.tsx` (Link `/kundenbereich/{id}`) |
| Passwort setzen beim Erstlogin (Portalkunde) | Kundenseite | ✓ | `src/app/kunde/[token]/` (laut `docs/FUNKTIONSABGLEICH.md` K4: optionales Passwort) |

### Zusammenfassung Adressbuch

Zählung (ohne Kundenbereich (Referenz-Modul)-Block): ✓ 17 · ◐ 13 · ✗ 10.

Wichtigste Lücken:
1. **Bestehende Kontakte lassen sich nicht bearbeiten** — `KontaktFormular` kann es, ist aber nur unter `/kontakte/neu` eingebunden; kein Bearbeiten-Link, keine Route.
2. **Kontakt löschen** fehlt vollständig (Spalten vorhanden, keine Aktion).
3. Liste ohne **Suche, Rollenfilter, Sortierung** und ohne Kennzeichen (Portal-Zugang, Objektbezug).
4. **E-Mail-Verlauf und „E-Mail schreiben“ am Kontakt** fehlen, obwohl das Postfach die Zuordnung bereits kennt.
5. Formularfelder: Titel, Mobil (in der Oberfläche), Beruf/Funktion, Anrede „Familie“.
6. Absprünge „Maklervertrag/Objektnachweis/Reservierung aus Kontakt“ und „Objekt vom Kontakt aus verknüpfen“ fehlen (nur Objektseite).

---

## Kachel Termine (Kalender)

### Kalenderansicht (Referenz „KalenderPage“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Ansichten Tag / Woche / Monat / Liste | Umschaltung | ✓ | `src/components/kalender/Kalenderansicht.tsx`, `src/app/(app)/kalender/page.tsx` |
| „Heute“ und Blättern | Navigation im Zeitraum | ✓ | `Kalenderansicht.tsx` (‹ Heute ›) |
| Farbe je Mitarbeiter | Termine farbig nach Zuständigem | ✓ | `src/lib/kalender/typen.ts` (`PALETTE`, `mitarbeiterFarbe`), `benutzer.kalender_farbe` |
| „Alle Termine“ / „Auswahl“ / Mitarbeiter-Filter | Sichtbare Personen wählen | ✓ (16b) | `Kalenderansicht.tsx`: „Alle“ oder genau eine Person; keine Mehrfachauswahl |
| „Termin eintragen“ / „Termin anlegen“ | Öffnet Dialog | ✓ | `src/components/kalender/TerminAnlegen.tsx` |
| Klick in Stunde legt Termin an | Vorbelegung Datum/Uhrzeit | ✓ | `Kalenderansicht.tsx` (`TagesSpalte`, `?neu=1&zeit=`) |
| Ganztags-Zeile | Mehrtägige/ganztägige Termine | ✓ | `Kalenderansicht.tsx` („ganztags“) |
| Überlappende Termine nebeneinander | Spaltenlayout | ✓ | `Kalenderansicht.tsx` (`spalten()`) |
| Kennzeichnung „Privat / Vertraulich“ (nur Zeitblock sichtbar) | Sichtbarkeit einschränken | ✓ | `TerminFormular.tsx` (Privat), `TerminDetail.tsx` (Marke), `supabase/migrations/20260904140000_kalender.sql` (RLS auf `privat`) |
| Serien-Kennzeichen am Termin | Symbol für Serie | ✓ | `TerminDetail.tsx` (Marke „Serie: …“) |
| Anfahrt/Rückfahrt im Kalender (Fahrzeit-Schraffur, Tooltip) | Fahrzeiten sichtbar | ✓ | `Kalenderansicht.tsx` (`TerminBlock`, Schraffur mit Titel „Anfahrt …“) |
| Kennzeichen „onOffice“ an importierten Terminen | Herkunft | ◐ | Herkunft nur für Google/Outlook (`extern_quelle`, `TerminDetail.tsx`); onOffice-Termine gibt es nicht (s. u.) |
| Urlaub im Kalender, Urlaubsstatus (beantragt/genehmigt) | Urlaub als Termin | ✓ (16b) | Genehmigter Urlaub wird als Termin eingetragen (`urlaubEntscheidenIntern` in `src/server/verwaltung-aktionen.ts`); beantragter Urlaub erscheint nicht im Kalender, keine Terminart „Urlaub“ in `TERMINARTEN` (`src/lib/arbeitsmittel.ts`) |
| „Keine Termine im Zeitraum“ | Leerzustand | ✓ | `src/components/Terminliste.tsx` („Keine Termine eingetragen“) |
| Listenansicht (kommende Termine, nach Tagen gruppiert) | Liste | ✓ | `kalender/page.tsx` (120 Tage), `Terminliste.tsx` |
| Realtime-Aktualisierung | Live-Update bei Änderungen | ✗ | Keine `channel(`/Realtime-Nutzung in `src/` |

### Termin-Dialog (Referenz „KalTerminModal“, „KalSerieFeld“, „KalFahrzeitVorschau“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Titel (Pflicht) | Anlass | ✓ | `src/components/kalender/TerminFormular.tsx` („Anlass“) |
| Art (Besichtigung, Sonstiges …) | Terminart | ✓ | `TerminFormular.tsx`, `TERMINARTEN` (7 Arten) in `src/lib/arbeitsmittel.ts` |
| Datum, Von/Bis, Ganztags, Enddatum | Zeitraum | ✓ | `TerminFormular.tsx` (Datum, Uhrzeit, Dauer, Ganztägig, Bis) |
| Ort (leer = Objektadresse) | Ortsangabe | ✓ | `TerminFormular.tsx`, `terminOrtText` in `src/lib/kalender/bestaetigung.ts` |
| Objekt-Suchfeld | Objektbezug | ◐ | Auswahlliste (Limit 500) statt Typeahead — `TerminFormular.tsx` |
| Kontakt (Adressbuch)-Suchfeld mit Hinweisen „schon im Termin“, „am Objekt“, „ohne E-Mail“ | Kontaktbezug mit Kontext | ◐ | Auswahlliste; E-Mail-Prüfung nur für die Bestätigungsoption; keine Hinweise „am Objekt“ |
| Teilnehmer (Mitarbeiter) | Mehrere Personen | ✓ | `TerminFormular.tsx` (Chips), `termine.teilnehmer` |
| Zuständiger | Verantwortlicher | ✓ | `TerminFormular.tsx` |
| Notiz | Freitext | ✓ | `TerminFormular.tsx` |
| „Erstellt von“ | Anzeige des Erstellers | ✓ (16b) | `termine.erstellt_von` gespeichert (`kalender-aktionen.ts`), aber in `TerminDetail.tsx` nicht angezeigt |
| Privat / Vertraulich | Nur Zeitblock für andere | ✓ | `TerminFormular.tsx`, RLS in Migration `20260904140000_kalender.sql` |
| „In der Akquise als Lead anlegen“ (mit Dublettenprüfung nach Adresse) | Aus Termin einen Lead erzeugen | ✓ (16b) | Kein Lead-Bezug in `kalender-aktionen.ts`; Lead-Anlage nur aus Objektaufnahme (`docs/FUNKTIONSABGLEICH.md` K1/A1) |
| Wiederholung: Einmalig, Täglich, Wöchentlich, Alle 2 Wochen, Monatlich, Vierteljährlich, Jährlich, Eigener Turnus | Serienregel | ✓ | `src/lib/kalender/serie.ts` (`SERIE_WAHL`), `TerminFormular.tsx` |
| Eigener Turnus: Alle n Tage/Wochen/Monate/Jahre, Wochentage, Endet nach Anzahl/Datum | Feinregel | ✓ | `serie.ts`, `TerminFormular.tsx` |
| Serien-Vorschau („n Termine, zuletzt am …“) | Vorschau | ✓ | `TerminFormular.tsx` (`serienDaten`) |
| Obergrenze (max. Termine / drei Jahre) | Schutz | ✓ | `serie.ts` (`SERIE_MAX = 200`, `SERIE_TAGE_MAX = 1095`) |
| Serie ändern: nur dieser / alle folgenden | Serienpflege | ✓ | `kalender-aktionen.ts` (`serie_umfang`), `TerminFormular.tsx` |
| Serie löschen: nur dieser / alle folgenden | Serienpflege | ✓ | RPC `termin_loeschen(p_folgende)` in Migration `20260904140000_kalender.sql`, `TerminDetail.tsx` |
| „Jeder Termin entsteht einzeln mit eigener Fahrzeit und Eintrag in onOffice“ | Serie als Einzeltermine | ◐ | Einzeltermine je Zeile mit `serie_id` ✓ (`kalender-aktionen.ts`); onOffice-Übertragung ✗ |
| Terminbestätigung per E-Mail an Kontakt mit .ics | Kunde erhält Bestätigung | ✓ | `kalender-aktionen.ts` (`bestaetigungsLink` → Postfach mit Text und `anhang_art=termin`), `src/lib/kalender/ics.ts`, `src/app/(app)/postfach/page.tsx`; Versand am Termin vermerkt (`bestaetigt_am`) |
| Text der Bestätigung editierbar | Vor Versand ändern | ✓ | Vorbelegter Text im Postfach-Formular (`src/components/postfach/NeueNachricht.tsx`) |
| „Vorschlag neu erzeugen“ (KI-Text der Bestätigung) | KI-Formulierung | ✓ (16b) | Text ist feste Vorlage in `src/lib/kalender/bestaetigung.ts`; keine KI-Aktion |
| Versand automatisch beim Speichern aus dem Standard-Postfach | Ohne Umweg | ◐ | Häkchen im Dialog leitet ins Postfach; Versand bleibt manueller Klick (`TerminFormular.tsx`, `kalender-aktionen.ts`) |
| „zuletzt gesendet am“ / erneut senden | Versandstatus | ✓ | `TerminDetail.tsx` („Gesendet am …“, „Erneut senden“) |
| Signatur wird angehängt | Postfach-Signatur | ✓ | Postfach-Einstellung `signatur_anhaengen` (`src/app/(app)/postfach/page.tsx`) |
| „Etwa 6 Stunden vorher automatisch erinnern“ (Erinnerungs-Mail an den Kontakt; Vorabend 18 Uhr bei Frühterminen; entfällt bei kurzfristiger Vereinbarung) | Kundenerinnerung | ✓ (16b) | Erinnerung wählbar 30 Min–2 Tage (`ERINNERUNGEN` in `src/lib/kalender/typen.ts`), Versand über Tagesarbeiten (`src/lib/kalender/erinnerungen.ts`, RPC `termine_erinnerungen_faellig`) — **geht an Zuständigen und Teilnehmer, nicht an den Kontakt**; keine Vorabend-Regel, kein „übersprungen“-Status |
| Erinnerungsstatus „gesendet am / übersprungen (Grund)“ | Statusanzeige | ◐ | `erinnert_am` als Marke in `TerminDetail.tsx`; kein Fehler-/Übersprungen-Status |
| „Nach 3 Tagen nachfassen“ (Nachfass-Vorschlag mit Mailentwurf, Freigabe im Dashboard, übersprungen wenn Kunde sich gemeldet hat, verworfen) | Nachfass-Automatik | ✓ (16b) | Häkchen „Nachfassen“ bei Besichtigungen (`TerminFormular.tsx`); RPC `besichtigungen_nachfassen` legt **am Folgetag eine Aufgabe** an (Migration `20260904140000_kalender.sql`, `tagesarbeiten()` in `src/lib/jobs/worker.ts`); kein Mailentwurf, keine Freigabe, keine „Kunde hat sich gemeldet“-Erkennung, kein Verwerfen-Status |
| Fahrzeit-Vorschau live im Dialog („rechnet…“, Anfahrt aus Vortermin, Rückfahrt zu Folgetermin, km, Puffer, „geschätzt“) | Vorschau vor dem Speichern | ◐ | Berechnung erst auf der Terminseite per Schaltfläche (`fahrzeitBerechnen` in `kalender-aktionen.ts`, `TerminDetail.tsx`); Inhalte (Vortermin/Folgetermin, km, Puffer, Kennzeichnung „geschätzt“) vorhanden in `src/lib/kalender/fahrzeit.ts` |
| Startpunkt / Startadresse für Fahrzeiten | Persönliche Einstellung | ✓ | `src/components/kalender/KalenderEinstellungen.tsx`, `benutzer.start_adresse` |
| Routendienst mit Fallback-Schätzung | Route oder Luftlinie | ✓ | `fahrzeit.ts` (`route()`, `fahrtSchaetzen()`, `ROUTING_API_KEY`) |
| Fahrzeit-Tag / „Fahrt-Termine aufräumen“ (Fahrten als eigene Termine) | Fahrzeiten als Zeitblöcke | ◐ | Fahrzeiten sind Attribut am Termin (`termine.fahrzeit`), keine eigenen Zeilen — Aufräumen entfällt |
| Doppelter-Termin-Warnung („bereits im Kalender – wirklich ein zweites Mal anlegen?“) | Dublettenprüfung | ✓ (16b) | Keine Prüfung in `kalender-aktionen.ts` |
| Terminarten-Standarddauer (Besichtigung) | Persönliche Vorgabe | ✓ (Mehrwert) | `benutzer.besichtigung_dauer_min`, `KalenderEinstellungen.tsx` |
| „Termin aus onOffice“ / Termin in onOffice eintragen / in onOffice absagen / Serie nach onOffice | onOffice-Terminabgleich | ✗ | onOffice-Connector bietet nur `objekte_holen/senden`, `kontakte_holen/senden`, `bilder` (`src/integrationen/onoffice/connector.ts`); Terminarten fehlen |
| Absagen (bleibt sichtbar) | Statt löschen | ✓ | `terminAbsagen` in `src/server/arbeitsmittel-aktionen.ts`, `TerminDetail.tsx` |
| Löschen | Entfernen | ✓ | `terminLoeschen` in `kalender-aktionen.ts` |
| Speichern / Abbrechen | Dialogsteuerung | ✓ | `TerminFormular.tsx`, `TerminAnlegen.tsx` |
| Fehlermeldung „Kein aktives Mail-Postfach“ | Voraussetzung Versand | ✓ | Postfach-Seite meldet fehlende Postfächer (`src/app/(app)/postfach/page.tsx`) |
| Zuordnung nachträglich (Kontakt/Objekt) — „TerminZuordnung“ | Bezug nachpflegen | ✓ | Bearbeiten in `TerminDetail.tsx` (vollständiges Formular) |
| Kalenderdatei (.ics) herunterladen | Export einzelner Termin | ✓ (Mehrwert) | `/api/dokumente/termin/[id]` (`TerminDetail.tsx`), `src/lib/kalender/ics.ts` |
| ICS-Abo je Benutzer (webcal, Token erneuern) | Kalender-App-Abo | ✓ (Mehrwert) | `KalenderEinstellungen.tsx`, `/api/kalender/[token]`, RPC `kalender_token_lesen`/`kalender_feed` |
| Abgleich Google/Outlook in beide Richtungen | Externer Kalender | ✓ (Mehrwert) | `src/lib/kalender/sync.ts`, `kalenderSyncJetzt`/`kalenderSyncSchalten` in `kalender-aktionen.ts`, `postfachAuftrag` in `worker.ts` |

### Urlaub (Referenz „UrlaubDialogInfo“, Urlaubsantrag im Kalender)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Urlaub beantragen (Von/Bis, Arbeitstage abzüglich Wochenenden und Feiertage des Bundeslands) | Antrag | ✓ | `src/app/(app)/urlaub/page.tsx`, `src/components/verwaltung/UrlaubAnsicht.tsx`, `urlaubBeantragen` in `src/server/verwaltung-aktionen.ts`, `src/lib/verwaltung/feiertage.ts` |
| Kontingent-Anzeige (Anspruch, anteilig, genehmigt, beantragt, Rest) | Bilanz | ✓ | `src/lib/verwaltung/urlaub.ts` (`bilanz`, `anspruchJahr`), `UrlaubAnsicht.tsx` |
| Geschäftsführer trägt direkt genehmigt ein | Sofortgenehmigung | ✓ | `urlaubBeantragen` (`sofort` für Verwaltung) |
| Antrag landet als Aufgabe bei der Verwaltung („Urlaubsantrag-Aufgabe“) | Freigabefluss | ✓ | `urlaubBeantragen` (Insert in `aufgaben` für Inhaber/Administrator) |
| Genehmigen / Ablehnen mit Grund | Entscheidung | ✓ | `urlaubEntscheiden` (`verwaltung-aktionen.ts`), `UrlaubAnsicht.tsx` |
| Genehmigter Urlaub erscheint im Kalender | Kalendereintrag | ✓ | `urlaubEntscheidenIntern` (Insert in `termine`; bei Ablehnung/Storno `abgesagt_am`) |
| Überschneidungen mit anderen Abwesenheiten | Warnung | ✓ | `ueberschneidungen()` in `src/lib/verwaltung/urlaub.ts`, `urlaub/page.tsx` |
| Info-Mail an Mitarbeiter über Entscheidung | Benachrichtigung | ✓ (16b) | `urlaubEntscheiden` sendet keine Mail (nur Statuswechsel) |
| Übertragung nach onOffice nach Genehmigung | Externer Abgleich | ✗ | Kein onOffice-Terminabgleich |
| Urlaub aus dem Kalenderdialog heraus (Terminart „Urlaub“) | Einstieg im Kalender | ✓ (16b) | Eigene Seite `/urlaub`; keine Terminart Urlaub in `TERMINARTEN` |

### Mail-Vorlagen im Kalender

| Vorlage (Referenz) | Zweck | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Terminbestätigung mit Anrede, Art, Datum/Uhrzeit, Ort, Objektzeile, .ics | Kunde | ✓ | `terminBestaetigungText`/`terminBestaetigungBetreff` in `src/lib/kalender/bestaetigung.ts` |
| Erinnerungs-Mail an den Kontakt | Kunde | ✓ (16b) | `terminErinnerungMail` in `bestaetigung.ts` — intern adressiert (Zuständiger/Teilnehmer) |
| Nachfass-Mail nach Besichtigung | Kunde | ✓ (16b) | Nur Aufgabe, kein Mailtext |
| Urlaubsantrag-Info an Verwaltung | Intern | ◐ | Aufgabe statt Mail |

### Zusammenfassung Termine

Zählung: ✓ 45 · ◐ 17 · ✗ 8.

Wichtigste Lücken:
1. **Erinnerung geht nicht an den Kunden**, sondern an interne Beteiligte (RPC `termine_erinnerungen_faellig` sammelt nur `benutzer.email`); keine Vorabend-Regel, kein Übersprungen-Status.
2. **Nachfassen** ist eine einfache Aufgabe am Folgetag — ohne vorbereiteten Mailentwurf, Freigabe-Schritt, „Kunde hat sich gemeldet“-Erkennung.
3. **onOffice-Terminabgleich** fehlt vollständig (Connector kennt nur Objekte, Kontakte, Bilder) — laut SCOPE ist onOffice als Connector in Phase 2 vorgesehen.
4. Fahrzeit-Vorschau nicht live im Dialog; Dublettenwarnung fehlt; „Lead aus Termin anlegen“ fehlt; „Erstellt von“ wird nicht angezeigt.
5. Mitarbeiterfilter nur Einzelperson/Alle; Objekt-/Kontaktauswahl ohne Typeahead (Limit 500).
6. Urlaub: keine Info-Mail nach Entscheidung; beantragter Urlaub nicht im Kalender sichtbar.

Über die Referenz hinaus vorhanden: ICS-Download/-Abo, Google-/Outlook-Abgleich, persönliche Kalender-Einstellungen, Absage statt Löschen.

---

## Kachel ToDos (Aufgaben)

### Eingabe und Anlegen (Referenz „ToDosPage“ oben)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Schnelleingabe „Was ist zu tun?“ + „Anlegen“ | Ein Feld, Enter legt an | ✓ | `src/components/aufgaben/Schnelleingabe.tsx`, `aufgabeAnlegen` in `src/server/arbeitsmittel-aktionen.ts` |
| Kurzbefehle im Text (/morgen, /heute, !wichtig, !dringend, #tag) | Parser | ◐ | `schnelleingabeParsen` in `src/lib/arbeitsmittel.ts`: heute, morgen, Wochentage, „in 2 Wochen“, Datum, `!!`, `#tag`, täglich/wöchentlich/monatlich, „Notiz:“ — keine `/`-Syntax, keine zwei Prioritätsstufen (`!wichtig` vs `!dringend`) |
| Live-Vorschau des Erkannten (Frist, Prio, Tags, Wiederholung) | Rückmeldung | ✓ (Mehrwert) | `Schnelleingabe.tsx` (Marken unter dem Feld) |
| „Per Sprache aufnehmen“ / „Aufnahme stoppen“ (Whisper-Transkription, 5–15 Sek.) | Diktat | ◐ | Browser-Spracherkennung (`SpeechRecognition`) in `Schnelleingabe.tsx`; kein serverseitiges Whisper, keine Audio-Datei, kein Hinweis „Transkribiere …“ |
| Kennzeichen „Per Sprache aufgenommen“ / „Automatisch erzeugt“ | Quelle an der Zeile | ◐ | `aufgaben.quelle` (`schnelleingabe`, Nachfassen …) nur im Detail sichtbar (`AufgabeDetail.tsx` „Quelle …“); nicht in der Zeile |
| „△ Optionen“: Fällig am, Priorität, Wiederholung, Zuständig, Tags, „Für das Team sichtbar“ | Optionen beim Anlegen | ◐ | Schnelleingabe hat keine Optionsleiste; `src/components/AufgabeAnlegen.tsx` (Objekt-/Kontaktseite) bietet Fällig/Priorität/Beschreibung; Zuständig, Wiederholung, Tags, Team-Sichtbarkeit erst im Detail nach dem Anlegen |
| „✨ KI-Vorschläge“ / „KI analysiert das ToDo …“ / Übernehmen / Ignorieren | KI zerlegt Text in Titel, Frist, Prio, Tags | ✗ | Keine KI-Analyse in `arbeitsmittel-aktionen.ts` (nur `textKorrigieren` für Rechtschreibung) |
| „Angelegt von X für Y“ (Systemvermerk bei Fremdzuweisung) | Verlauf | ✓ | Trigger `intern.aufgabe_nachlauf` (Übergabe-Vermerk) in `supabase/migrations/20260904120000_aufgaben_checklisten.sql`, Anzeige in `AufgabeDetail.tsx` |
| Tipp-Text zu Schnell-Befehlen | Hilfe | ✓ | `Schnelleingabe.tsx` (Erklärtext) |

### Ansichten und Filter

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| „Meine ToDos“ / „Team (alle sichtbaren)“ | Personenfilter | ✓ | `src/app/(app)/aufgaben/page.tsx` (`wer=alle`, `team_sichtbar`) |
| „Liste“ / „Kanban“ | Ansichten | ✓ | `aufgaben/page.tsx`, `src/components/aufgaben/AufgabenKanban.tsx` (+ Ansicht „Notizen“) |
| Kanban mit Drag-and-drop | Verschieben | ◐ | `AufgabenKanban.tsx`: Statuswechsel per Schaltflächen je Karte, kein Drag-and-drop |
| Filter Offen / Heute / Diese Woche / Überfällig / Erledigt / Alle | Zeit- und Statusfilter | ◐ | Status-Chips (Offen/Läuft/Wartet/Erledigt/Verworfen) in `aufgaben/page.tsx`; **keine Zeitfilter** (Heute/Diese Woche/Überfällig nur als Marken über `fristlage()` und im Dashboard) |
| „In ToDos suchen …“ | Titel-Suche | ✓ | `aufgaben/page.tsx` (`q`, `ilike`) |
| Sortierung Smart / Priorität / Fälligkeit / Erstellung | Wählbare Sortierung | ◐ | Feste Sortierung `aufgabenSortieren` (Fälligkeit, dann Priorität) in `src/lib/arbeitsmittel.ts`; nicht umschaltbar |
| Überfällig-Zähler in der Kopfzeile | Kennzahl | ✓ | `aufgaben/page.tsx` (Beschreibung „n Aufgaben sind heute oder früher fällig“) |
| Tag-Filter | Nach Tag filtern | ✓ | `aufgaben/page.tsx` (`tag`, `contains`) |
| „Zuletzt erledigt“ | Erledigte anzeigen | ✓ | `aufgaben/page.tsx` (Karte, 30 Einträge) |
| Leerzustände („Noch keine ToDos …“, „Keine ToDos in dieser Ansicht“) | Hinweise | ✓ | `aufgaben/page.tsx`, `Aufgabenliste.tsx` |
| Mehrfachauswahl + „✓ Alle erledigen“ / „🗑 Löschen“ (Bulk) | Massenaktion | ✗ | Keine Auswahlkästchen/Bulk-Aktionen in `Aufgabenliste.tsx` |
| Realtime-Aktualisierung (Supabase Channel) | Live-Liste | ✗ | Keine Realtime-Nutzung |

### Aufgaben-Zeile (Referenz „TodoZeile“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Häkchen „Erledigt markieren“ / wieder öffnen | Statuswechsel | ✓ | `aufgabeUmschalten` in `arbeitsmittel-aktionen.ts`, `src/components/Aufgabenliste.tsx` |
| Prioritäts-Kennzeichen (Wichtig / Dringend) | Anzeige | ◐ | `PRIORITAETEN` niedrig/mittel/hoch; nur „Hoch“ wird als Marke gezeigt |
| Wiederholungs-Kennzeichen (täglich, wöchentlich, jährlich) | Anzeige | ◐ | Im Detail und Kanban (`WIEDERHOLUNGEN`), in `Aufgabenliste.tsx` nicht |
| „⚠ überfällig“ / „📅 heute“ | Fristlage | ✓ | `Aufgabenliste.tsx` (`FRISTLAGE_BEZEICHNUNG`) |
| Fälligkeits-Uhrzeit | Zeit am Tag | ◐ | Nur `faellig_am` (Datum) und separates `erinnerung_am` (datetime) |
| „Für das Team sichtbar“-Kennzeichen | Sichtbarkeit | ◐ | Nur Notizen-Ansicht zeigt „privat“; Liste nicht |
| Mail-Hinweis („an …, Betreff …“) mit „Ja, erledigt“ / Hinweis entfernen | Verknüpfte Mail an der Zeile | ✗ | Mail-Verknüpfung nur im Detail (`nachricht_id`), kein Hinweis in der Zeile |
| Erstellt-Zeitpunkt | Anzeige | ◐ | Im Detail (`AufgabeDetail.tsx` „Angelegt …“) |
| Löschen | Entfernen | ✓ | `aufgabeLoeschen`, `Aufgabenliste.tsx` |
| Verknüpfungs-Chip „X öffnen“ | Sprung zum Bezug | ✓ | `Aufgabenliste.tsx` (Objekt-Link), `AufgabeDetail.tsx` (alle Bezüge) |

### Detaildialog (Referenz „TodoDetail“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Titel, Beschreibung | Felder | ✓ | `src/components/aufgaben/AufgabeDetail.tsx` |
| Status (Offen/Läuft/Wartet/Erledigt/Verworfen) | Feld + Schnellwahl | ✓ | `AufgabeDetail.tsx`, `AUFGABEN_STATUS` |
| Priorität | Feld | ✓ | `AufgabeDetail.tsx` |
| Zuständig (Wechsel = Übergabe im Verlauf) | Feld | ✓ | `AufgabeDetail.tsx`, Trigger `aufgabe_nachlauf` |
| Fällig am + Uhrzeit | Frist | ◐ | Datum ✓; Uhrzeit nur als „Erinnerung“ (datetime) |
| Erinnerung (Zeitpunkt) | Erinnerung | ◐ | `erinnerung_am` wird gespeichert (`arbeitsmittel-aktionen.ts`), aber **kein Job versendet oder zeigt sie an** (kein Treffer in `src/lib/jobs/worker.ts`) |
| „Team sieht es“ | Sichtbarkeit | ✓ | `AufgabeDetail.tsx` (`team_sichtbar`) |
| Wiederholung (nächste entsteht beim Erledigen) | Automatik | ✓ | Trigger `intern.aufgabe_nachlauf` in Migration `20260904120000_aufgaben_checklisten.sql`, `naechsteFaelligkeit` in `arbeitsmittel.ts` |
| Tags | Feld | ✓ | `AufgabeDetail.tsx`, `aufgaben_tags` |
| „Verknüpft mit“ (Objekt, Kontakt, Lead, Termin, Mail, Vertrag) | Bezüge | ✓ | `src/app/(app)/aufgaben/[id]/page.tsx` (Verknüpfungen), `AufgabeDetail.tsx` |
| Schritte mit Fortschritt (x von y, %) | Teilaufgaben | ✓ | `AufgabeDetail.tsx`, `schrittAnlegen/Umschalten/Loeschen`, Tabelle `aufgaben_schritte` |
| Verlauf mit Systemeinträgen und Notizen | Kommentare | ✓ | `AufgabeDetail.tsx`, `kommentarAnlegen`, Tabelle `aufgaben_kommentare` |
| „Vorbereiteter Mailentwurf an … — Senden und Freigeben über die Aufgaben-Karte“ | Aufgabe trägt Mailentwurf | ✗ | Keine Entwurfsfelder an `aufgaben`; kein Freigabefluss |
| Speichern / Abbrechen | Steuerung | ✓ | `AufgabeDetail.tsx` |
| Rechtschreibung prüfen (KI, 1 Credit) | Textkorrektur | ✓ (Mehrwert) | `textKorrigieren` in `arbeitsmittel-aktionen.ts` |
| Löschen | Entfernen | ✓ | `AufgabeDetail.tsx` |

### Tags verwalten (Referenz „Tags verwalten“-Dialog)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Neuen Tag anlegen („z. B. Anrufe, Vermietung, Privat“) | Tag-Pflege | ◐ | Tags entstehen implizit beim Anlegen (`aufgabeAnlegen` → Insert in `aufgaben_tags`); Aktion `tagSpeichern` (Name, Farbe) existiert, wird aber **von keiner Oberfläche aufgerufen** |
| Tag löschen („ToDos verlieren diesen Tag“) | Entfernen | ✗ | Keine Aktion |
| Tag-Farben | Darstellung | ◐ | Spalte `farbe` und Rahmenfarbe im Filter-Chip (`aufgaben/page.tsx`); nicht editierbar |

### Automatiken und Verknüpfungen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| ToDo aus Mail (Betreff → Titel, Frist aus Text, Bezug bleibt) | Postfach → Aufgabe | ✓ | `aufgabeAusNachricht` in `arbeitsmittel-aktionen.ts`, `src/components/postfach/NachrichtDetail.tsx` |
| KI-Aufgabenerkennung in Mails (mehrere Aufgaben) | Postfach-KI | ✗ | `docs/FUNKTIONSABGLEICH.md` K2: „KI-Mehrfacherkennung → W2“ |
| Nachfass-Aufgabe nach Besichtigung | Kalender → Aufgabe | ✓ | RPC `besichtigungen_nachfassen` (Migration `20260904140000_kalender.sql`) |
| Urlaubsantrag als Aufgabe | Verwaltung → Aufgabe | ✓ | `urlaubBeantragen` in `verwaltung-aktionen.ts` |
| Resturlaub-Hinweis als Aufgabe + Mail | Verwaltung → Aufgabe | ✓ | `urlaubHinweisSenden` (Aufgabe, `urlaub_hinweise`, Mail-Job) |
| Aufgaben am Objekt / Kontakt / Lead anlegen | Drehkreuz | ✓ | `src/components/AufgabeAnlegen.tsx` auf `objekte/[id]`, `kontakte/[id]`; `Schnelleingabe` mit `leadId` |
| Checklisten / Arbeitsketten aus Vorlagen | Verkettete Schritte | ✓ (Mehrwert) | `src/app/(app)/checklisten/`, `src/server/checklisten-aktionen.ts`, RPC `checkliste_aus_vorlage` |
| Notizen (ohne Frist, Startseiten-Widget) | Gedanken-Ablage | ✓ (Mehrwert) | `aufgaben.typ = notiz`, `aufgaben/page.tsx`, `dashboard/page.tsx` |

### Zusammenfassung ToDos

Zählung: ✓ 33 · ◐ 16 · ✗ 8.

Wichtigste Lücken:
1. **KI-Analyse des ToDo-Textes** (Vorschlag Titel/Frist/Prio/Tags, Übernehmen/Ignorieren) fehlt.
2. **Serverseitige Sprachtranskription** fehlt — nur Browser-Spracherkennung (nicht in allen Browsern).
3. **Bulk-Aktionen** (Mehrfachauswahl, alle erledigen, löschen) fehlen.
4. **Zeitfilter** (Heute / Diese Woche / Überfällig) und **wählbare Sortierung** fehlen.
5. **Aufgaben-Erinnerung** (`erinnerung_am`) wird gespeichert, aber nie zugestellt.
6. **Mailentwurf an der Aufgabe** mit Freigabe/Versand („Freigeben & senden“) fehlt.
7. Tags-Verwaltung ohne Oberfläche (Anlegen/Löschen/Farbe), Kanban ohne Drag-and-drop, Optionen beim Anlegen nur im Detail.

---

## Kachel Startseite (Dashboard)

### Kachelraster und Kopfzeile (Referenz „HomePage“, „PageShell“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kachelraster nach Bereichen (Tagesgeschäft, Kunden & Objekte, Erstellen, Werkzeuge & Verwaltung) | Einstieg in Module | ✓ | `src/app/(app)/dashboard/page.tsx` (Tagesgeschäft, Vermarktung, Abwicklung, Verwaltung), `src/components/Kachel.tsx` |
| Kachel-Kennzahlen (Termine heute, ToDos fällig, Objekte in Vermarktung, Mietanfragen, Unterschriften) | Zähler auf Kacheln | ✓ | `dashboard/page.tsx` (Aufgaben fällig, Termine anstehend, Objekte aktiv, Mietanfragen, Treffer, Nachfassen, Credits) |
| Zähler „ungelesene Mails“ | Postfach-Kennzahl | ✗ | Keine Postfach-Kachel/kein Zähler in `dashboard/page.tsx` |
| Kachel-Hervorhebung/Pulsieren bei offener Arbeit | Aufmerksamkeit | ✓ | `Kachel.tsx` (`betont`) |
| Rechteabhängige Kacheln | Nur erlaubte Module | ✓ | `dashboard/page.tsx` (`darf(modul)`), `src/lib/auth/rechte.ts` |
| „✎ Anpassen“: Kacheln per Drag-and-drop sortieren, ausblenden, „Ausgeblendete Kacheln“ wieder einblenden, „Standard wiederherstellen“ | Personalisierung | ✗ | Keine Kachel-Präferenzen (kein Treffer für Reihenfolge/Ausblenden in `Kachel.tsx`, `dashboard/page.tsx`) |
| Begrüßung nach Tageszeit („Guten Morgen/Tag/Abend, Name“) | Anrede | ◐ | `dashboard/page.tsx`: „Willkommen, Vorname“ ohne Tageszeit |
| „Angemeldet als“, Rolle („Chef“), „Mein Profil öffnen“ | Kopfzeile | ✓ | `src/app/(app)/layout.tsx` (Name, Mandant, Rolle), `Navigation.tsx` („Mein Profil“) |
| „Abmelden“ | Sitzung beenden | ✓ | `layout.tsx` (`abmelden`) |
| „Suche (Strg+K)“ in der Kopfzeile | Globale Suche | ✓ | `src/components/Suche.tsx` in `layout.tsx` |
| „Zurück“-Schaltfläche in der Seitenleiste | Rücksprung | ◐ | Je Seite Link im `Seitenkopf` („Zur Übersicht“, „Zum Kalender“); kein globaler Zurück-Knopf |
| „Menü öffnen“ (Burger, mobil) | Mobile Navigation | ✗ | `layout.tsx`: Seitenleiste `hidden lg:block`; **keine mobile Navigation** (kein Burger-Menü in `src/components/`) |
| Hell/Dunkel-Modus | Anzeige | ✓ (Mehrwert) | `src/components/ModusSchalter.tsx` |
| Warnzone (RPC `dashboard_warnungen`) | Systemwarnungen | ◐ | Nur Testphase-Hinweis und Lesemodus-Banner (`dashboard/page.tsx`, `layout.tsx`); keine fachlichen Warnungen (fehlende Postfächer, abgelaufene Reservierungen …) |
| „Zuletzt bearbeitet“-Zeile | Letzte Datensätze aller Typen | ◐ | `dashboard/page.tsx` nur Objekte (5) |
| Stempeluhr (Kommen/Gehen, Std. heute, Soll, Saldo, fehlender Feierabend-Stempel, Nachtragen) | Zeiterfassung | ✓ | `src/components/verwaltung/Stempeluhr.tsx`, `dashboard/page.tsx`, `stempeln`/`feierabendNachtragen` in `verwaltung-aktionen.ts` |
| Abschnitte „Vorbereitung/Vermarktung/…“, Objektarten-Listen (Begriffe) | Stammwerte | ✓ | `src/lib/objekt-begriffe.ts` (`OBJEKTSTATUS` …) |

### Heute-Zone (Referenz „HeuteZone“, „Schnellaktionen“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| „Heute“: Termine des Tages mit Uhrzeit, Objekt/Kontakt, Privat-Kennzeichen, „alle Termine anzeigen“ | Tagesübersicht | ◐ | `dashboard/page.tsx` (Karte „Heute“, Uhrzeit + Titel); ohne Objekt-/Kontaktzeile, ohne Privat-Kennzeichen; Link führt auf `/kalender` statt zum Termin |
| „Fällig“: heutige/überfällige ToDos, „alle ToDos anzeigen“ | Aufgaben | ✓ | `dashboard/page.tsx` (Karte „Fällige Aufgaben“ mit Marke überfällig/heute) |
| „Wartet auf mich“: Urlaubsantrag, Resturlaub, Freigabe, Unterschriften (Maklervertrag, Objektnachweis, Reservierung, Vollmacht, Dokument; Käufer/Verkäufer/Makler) | Wartendes | ◐ | `dashboard/page.tsx` (Karte „Wartet auf Sie“: Unterschriften, Mietanfragen, Leads nachfassen, Treffer, Objektaufnahmen); Urlaubsanträge/Freigaben nur als Aufgaben, keine Aufschlüsselung nach Signaturrolle |
| Zähler „(n)“ je Bereich | Kennzahlen | ✓ | `dashboard/page.tsx` (Marken mit Anzahl) |
| „Schnell anlegen“: ToDo, Termin, Objekt, Kontakt, Brief | Schnellaktionen | ◐ | Nur „Objekt anlegen“ im Seitenkopf (`dashboard/page.tsx`); Aufgabe/Termin/Kontakt/Brief jeweils in ihren Modulen |
| Sprünge „Heute / Fällig / Wartet auf mich“ | Anker | ✓ | Karten mit Links auf `/kalender`, `/aufgaben`, `/vertraege` … |
| Notizen-Widget | Eigene Notizen auf der Startseite | ✓ (Mehrwert) | `dashboard/page.tsx` (Karte „Notizen“) |

### Aufgaben-Karte / Freigaben (Referenz „AufgabenKarte“, „UrlaubAntragDetails“, „UrlaubHinweisDetails“, „ChefAuthModal“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| „Meine Aufgaben & Nachfassen“: Nachfass-Vorschläge mit Mailentwurf, „✓ Freigeben & senden“, „Im Posteingang bearbeiten“, „Verwerfen“ | Freigabe vorbereiteter Mails | ✗ | Kein Entwurfs-/Freigabefluss; Nachfassen ist eine normale Aufgabe |
| „Besichtigungen von vor 3 Tagen jetzt prüfen“ (manueller Lauf, läuft sonst morgens) | Manueller Anstoß | ◐ | Läuft automatisch in `tagesarbeiten()` (`src/lib/jobs/worker.ts`, Endpunkt `/api/jobs/ausfuehren`); kein Knopf im Dashboard |
| Urlaubsantrag genehmigen/ablehnen im Dashboard mit Kontingentprüfung, Überschreitungswarnung, „im selben Zeitraum abwesend“ | Freigabe | ◐ | Alles auf `/urlaub` (`UrlaubAnsicht.tsx`: Genehmigen/Ablehnen, Bilanz, Überschneidungen); Dashboard zeigt nur die Aufgabe |
| Resturlaub-Hinweise versenden („Hinweis senden“, dokumentiert im Profil) | Verfallshinweis | ✓ | `urlaubHinweisSenden` in `verwaltung-aktionen.ts`, `urlaub_hinweise`, `UrlaubAnsicht.tsx` |
| Lead-Aufgaben („Nachfassen telefonisch“, Gesprächsnotiz am Lead, Lead öffnen) | Akquise-Aufgaben | ✓ | `dashboard/page.tsx` („Leads nachfassen“ → `/akquise/leads?nachfassen=1`), `src/components/akquise/LeadDossier.tsx` |
| Chef-Freigabe per Passwortabfrage (ChefAuthModal) | Zweitbestätigung | ✗ | Nicht vorhanden; Rechte serverseitig per Rolle/RLS (`src/lib/auth/rechte.ts`) — bewusst anderes Konzept |
| Aufgabe schließen / Erledigt | Abschluss | ✓ | `aufgabeUmschalten`, `Aufgabenliste.tsx` |

### Globale Suche (Referenz „GlobalSuche“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Öffnen per Strg+K, Schließen per Esc | Tastatur | ✓ | `src/components/Suche.tsx` |
| Pfeiltasten + Enter | Navigation | ✓ | `Suche.tsx` |
| Mindestens 2 Zeichen | Schwelle | ✓ | `Suche.tsx`, `globalSuchen` in `verwaltung-aktionen.ts` |
| Trefferarten mit Kennzeichen | Typ-Label | ✓ | `Suche.tsx` (`ART`) |
| Durchsucht: Maklerverträge, Objektnachweise | Verträge | ✓ | RPC `global_suche` (`supabase/migrations/20260904170000_verwaltung.sql`) über `vertraege` |
| Durchsucht: Eigentümer/Kontakte, Termine, Objekte | Stammdaten | ✓ | RPC `global_suche` (`kontakte`, `termine`, `objekte`) |
| Durchsucht: Aufgaben, Projekte, Rechnungen, Kundenzugänge | Weitere | ✓ (Mehrwert) | RPC `global_suche` (`aufgaben`, `projekte`, `rechnungen`, `portal_kunden`) |
| Durchsucht: Bewertungen (Wertermittlung) | Gutachten | ✗ | `wertermittlungen` nicht in `global_suche` |
| Durchsucht: Schmiede-Entwürfe (Exposé-Texte) | KI-Texte | ✗ | Exposés nicht in `global_suche` |
| Durchsucht: Mietverträge | Vermietung | ✗ | Tabelle `mietvertraege` (Migration `20260904100000_vermietung.sql`) nicht in `global_suche` |
| Durchsucht: Notar-Laufzettel, Übergabeprotokolle | Abwicklung | ✗ | Nicht in `global_suche` |
| Trefferzusatz (Preis, Marktwert) | Untertitel | ◐ | `untertitel` je Treffer vorhanden; kein Preis/Marktwert |
| Ladehinweis / „Keine Treffer“ | Zustände | ✓ | `Suche.tsx` |

### Benachrichtigungsglocke (Referenz „MaklerBenachrichtigungsglocke“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Glocke in der Kopfzeile mit Zähler „n neue Aktivitäten“ | Hinweis auf Neues | ✗ | Keine Glocke in `src/app/(app)/layout.tsx`; Aktivitätszähler nur im Kundenbereich (`portal_glocke` in `src/app/(app)/kundenbereich/page.tsx`) |
| Liste der Aktivitäten (an mich oder alle) | Übersicht | ✗ | Aktivitäten (`aktivitaeten`) nur je Objekt/Kontakt (`src/components/Verlauf.tsx`), kein Posteingang für Aktivitäten |
| „Alle als gelesen“ / einzeln als gelesen | Lesestatus | ✗ | Kein Gelesen-Status an `aktivitaeten` |
| Protokoll aller Aktivitäten (Verwaltung) | Nachvollziehbarkeit | ✓ (teilweise Ersatz) | `src/app/(app)/einstellungen/protokoll/page.tsx` (Audit-Protokoll) |

### Tutorial (Referenz „TutorialOverlay“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Schrittweiser Rundgang mit Hervorhebung von `[data-tutorial]`-Zielen | Einführung | ✓ | `src/components/Tutorial.tsx`, `dashboard/page.tsx` (`TUTORIAL`, `data-tutorial`) |
| Fortschritt „x / y“, Fortschrittsbalken | Anzeige | ◐ | „Schritt x von y“ ✓; kein Balken |
| Überspringen / Zurück / Weiter / Abschließen | Steuerung | ✓ | `Tutorial.tsx` |
| Fortschritt am Profil speichern | Persistenz | ✓ | `tutorialGesehen` in `arbeitsmittel-aktionen.ts` (`benutzer.tutorial_gesehen_am`) |
| Tutorial jederzeit neu starten | Neustart | ✓ | `dashboard/page.tsx` („Rundgang … erneut starten“, `?tutorial=1`) |
| Tutorial-Inhalt Eigentümer-Portal (Dokumente, Checkliste, Ansprechpartner, Energieausweis, PDF-Werkzeuge, Profil) | Kundenseitig | ✗ | Rundgang nur für Mitarbeiter-Startseite; Kundenbereich (Referenz-Modul) laut SCOPE nicht im Scope |

### News-Briefing (Referenz „NewsBriefingPage“, „NewsBriefingWidget“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Tagesbriefing (automatisch morgens erstellt) | KI-Presseschau | ✗ | Kein Treffer für Briefing/News in `src/` (nur Schriftdaten); `docs/FUNKTIONSABGLEICH.md` D1: ✗ |
| „Neues Briefing erstellen“ / „Jetzt erstellen“ | Manueller Lauf | ✗ | — |
| Frühere Briefings, Quellen mit Links, „Artikel ausgewertet“ | Archiv | ✗ | — |
| Startseiten-Widget „Alle Themen →“ | Kurzfassung | ✗ | — |

### Navigation mobil und Anmeldung (Referenz „MobileBurgerMenu“, „Login“)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Burger-Menü mit allen Bereichen, rechteabhängig, Safe-Area, Abmelden | Mobile Navigation | ✗ | Keine mobile Navigation; Seitenleiste ab `lg` (`layout.tsx`) |
| Login mit E-Mail und Passwort, Enter | Anmeldung | ✓ | `src/app/(auth)/anmelden/page.tsx`, `AnmeldeFormular.tsx` |
| „Passwort vergessen oder Einladungs-Link verloren?“ | Wiederherstellung | ✓ | `src/app/(auth)/passwort-vergessen/`, `src/app/(auth)/einladung/[token]/` |
| Gemeinsamer Mitarbeiter- und Eigentümer-Zugang | Ein Login für beide | ◐ | Mitarbeiter über `/anmelden`; Portalkunden über `/kunde/[token]` (getrennt, bewusst) |
| Anmeldung mit Google/Microsoft | Sozial-Login | ✓ (Mehrwert) | `src/components/SozialAnmeldung.tsx` |
| Fehlermeldungen („Anmeldung fehlgeschlagen“) | Rückmeldung | ✓ | `AnmeldeFormular.tsx` |

### Zusammenfassung Startseite

Zählung: ✓ 40 · ◐ 13 · ✗ 20.

Wichtigste Lücken:
1. **Keine mobile Navigation** (Burger-Menü) — die Seitenleiste ist unterhalb `lg` unsichtbar.
2. **Benachrichtigungsglocke** mit Aktivitätsliste und Gelesen-Status fehlt für Mitarbeiter.
3. **Kachel-Personalisierung** (sortieren, ausblenden, zurücksetzen) fehlt.
4. **Freigabe-Karte** („Freigeben & senden“ für vorbereitete Nachfass-Mails, Urlaubsentscheidung im Dashboard) fehlt; Urlaub nur auf eigener Seite.
5. **News-Briefing** fehlt vollständig (laut Funktionsabgleich D1).
6. Globale Suche ohne Wertermittlungen, Exposé-Texte, Mietverträge, Notar-Laufzettel, Übergabeprotokolle.
7. Schnellaktionen (ToDo/Termin/Kontakt/Brief anlegen) und Postfach-Zähler auf der Startseite fehlen; Heute-Zone ohne Objekt-/Kontaktzeile am Termin.

---

## Gesamtbild

| Kachel | ✓ | ◐ | ✗ |
|---|---|---|---|
| Adressbuch | 17 | 13 | 10 |
| Termine | 45 | 17 | 8 |
| ToDos | 33 | 16 | 8 |
| Startseite | 40 | 13 | 20 |

Die drei gravierendsten Einzelbefunde:
1. **Kontakte können nicht bearbeitet und nicht gelöscht werden** (Formular existiert, ist aber nur für „neu“ verdrahtet).
2. **Terminerinnerung erreicht den Kunden nicht** — nur interne Beteiligte; Nachfassen ohne Mailentwurf/Freigabe.
3. **Kein mobiles Menü und keine Benachrichtigungsglocke** im Rahmen der Anwendung.

Abweichungen von `docs/FUNKTIONSABGLEICH.md`: Dort steht K1 „Erinnerung sechs Stunden vorher ✓“ — tatsächlich geht die Mail an Mitarbeiter, nicht an den Kontakt (◐). K3 „Personen, Anrede/Titel ✓“ — Titel fehlt im Formular; Bearbeiten fehlt ganz. N1 „Tags ✓“ — Tag-Verwaltung ohne Oberfläche.


---

# Funktionsinventar Referenz → ImmoOffice.ai: Immobilien · Exposé-Schmiede · KI-Agenten

Quelle: extrahierte Oberflächentexte der Referenz (ImmobilienPage, BestandsImmobilienPage,
ObjektaufnahmePage, ExposeSchmiede, ErgebnisEditor, KiAgentenPage, KiExposePrueferPage,
ClaudeChatWidget, _technik). Jede Funktion wurde per Grep in `src/app`, `src/components`,
`src/server`, `src/lib`, `src/integrationen` und `supabase/migrations` geprüft.
Ohne Fundstelle kein ✓. Pfade sind repository-relativ.

Legende: ✓ vorhanden · ◐ teilweise · ✗ fehlt

---

## Kachel Immobilien

### Übersicht (Einstiegskachel)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zwischenseite „Immobilien" mit zwei Unterkacheln und Zurück-Link | Verteilt auf Bestand und Neubauprojekte | ◐ | Keine eigene Zwischenseite; stattdessen Dashboard-Kacheln „Objektaufnahmen"/„Objekte" (`src/app/(app)/dashboard/page.tsx:129–140`) und Navigationseinträge (`src/components/Navigation.tsx:28–29,42`) |
| Unterkachel „Bestandsimmobilien" (Verkauf & Vermietung – zentrale Objektverwaltung) | Einstieg in die Objektliste | ✓ | `src/app/(app)/objekte/page.tsx`, Navigation `src/components/Navigation.tsx:29` |
| Unterkachel „Neubauprojekte" (Projekt-Homepages, Einheiten & Kundenbereich) | Einstieg in die Projektverwaltung | ✓ | `src/app/(app)/projekte/page.tsx`, `src/app/(app)/projekte/[id]/page.tsx`, Navigation `src/components/Navigation.tsx:42` |

### Bestand — Objektliste und Objektverwaltung

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Quellen-Reiter „onOffice (n)" / „Eigene (n)" | Trennt gespiegelte Fremdobjekte von eigenen Objekten | ◐ | Herkunft nur in `integration_mappings` (`src/integrationen/kern/speicher-supabase.ts:31–43`); Liste zeigt keine Herkunft und bietet keinen Reiter |
| Volltextsuche in der Liste (Straße, Hausnr., PLZ, Ort, Objekt-Nr., Bezeichnung; mehrere Wörter) | Filtert die Objektliste live | ◐ | Nur globale Suche Strg+K über bezeichnung, objektnummer, strasse, ort, titel (RPC `global_suche`, `supabase/migrations/20260904170000_verwaltung.sql:346–347`; `src/components/Suche.tsx`); kein Suchfeld in `objekte/page.tsx`, keine Mehrwort-/PLZ-Suche |
| Filter Vertragsart (Alle / Nur Verkauf / Nur Vermietung) | Engt Liste nach Vermarktungsart ein | ✗ | `src/app/(app)/objekte/page.tsx` hat keine Filter |
| Filter Status (Alle Status / Einzelstatus) | Engt Liste nach Vermarktungsstatus ein | ✗ | wie oben; Statuswerte existieren (`src/lib/objekt-begriffe.ts:33–42`) |
| Sortierung (Objekt-Nr. auf/ab, zuletzt bearbeitet, zuletzt angelegt, Bezeichnung A–Z, Ort A–Z, Preis auf/ab) | Wählbare Reihenfolge | ✗ | Fest `erstellt_am desc` (`objekte/page.tsx:36`) |
| Versteckte Objekte (Zähler, ein-/ausblenden) | Blendet Objekte aus, ohne sie zu löschen | ✗ | Kein Feld „versteckt"; nur Status „Archiviert"/„Zurückgezogen" und Soft-Delete (`src/server/objekt-aktionen.ts:186–203`) |
| Kartenansicht mit Titelbild, Vermarktungs-Badge (Verkauf/Vermietung/Beides), Preis, Fläche | Objekt-Kachel je Eintrag | ◐ | Listenzeile mit Nummer, Status, Kategorie, Adresse, Preis, Fläche, Zimmer (`objekte/page.tsx:83–130`); ohne Titelbild-Vorschau und ohne Vermarktungs-Badge |
| Leerzustand („Noch keine Objekte", „Keine Objekte entsprechen den Filtern") | Hinweis und Aufruf zum Anlegen | ✓ | `objekte/page.tsx:52–72` |
| „Neues Objekt" mit Quellenauswahl: aus Objektaufnahme / aus Bewertung / aus Mietanfrage / leer starten | Übernimmt Daten einer bestehenden Quelle | ◐ | Aus Aufnahme: „Objekt daraus anlegen" auf der Aufnahme (`src/server/aufnahme-aktionen.ts:205`, RPC `aufnahme_uebernehmen`); aus Wertermittlung/Mietanfrage nicht; kein Quellen-Dialog in `objekte/neu/page.tsx` |
| Quellen-Picker mit Suche, Adress-/Rollen-/Statuskürzeln | Auswahl der konkreten Quelle | ✗ | Nicht vorhanden |
| „Neue Einheit" aus Stammobjekt (Wohnung/Wohnen vorbelegt, Bezeichnung „– neue Einheit") | Teilobjekt zu einem Haus anlegen | ◐ | Spalte `stammobjekt_id` existiert (`supabase/migrations/20260816200353_objekte_kontakte.sql:37,136`); keine Bedienung im Formular (kein Treffer für `stammobjekt` in `src/`) |
| Objekt löschen mit Kaskaden-Hinweis (Eigentümer/Dateien mit, Mails/Bewertungen bleiben) | Endgültiges Entfernen mit Aufklärung | ◐ | Soft-Delete ohne Hinweistext (`src/server/objekt-aktionen.ts:186`; Schaltfläche `objekte/[id]/page.tsx:524`) |
| Rückverknüpfung in der Quelle setzen (Aufnahme/Bewertung/Mietanfrage erhält objekt_id) | Quelle zeigt auf das Objekt | ◐ | Aufnahme erhält `objekt_id` (RPC), Lead erhält `aufnahme_id` (`src/server/akquise-aktionen.ts:464–478`); Wertermittlung/Mietanfrage werden nicht rückverknüpft |
| Energieausweis-Kachel als Bild (SVG→PNG mit Skala, Endenergie, Klasse, Energieträger, Anlage-Baujahr, Warmwasser) am Objekt ablegen | Erzeugt eine Grafik für Exposé/Portale | ✗ | Kein Generator; Marketing-Formate sind Instagram-Post/-Story, Verkaufsschild, Flyer A5, Objektanzeige, Postkarte (`src/lib/marketing/vorlagen.ts:38–84`); Energieangaben nur als Text in Exposé-Vorlagen |
| Web-Fassung eines Objektbilds (verkleinerte Variante) erzeugen und hochladen | Kleine Datei für Web/Portale | ✗ | `objekt_bilder` kennt Breite/Höhe/Version, keine Web-Variante (`supabase/migrations/20260817041844_objektbilder_und_versionen.sql:15–39`); kein Verkleinern in `src/components/BildUpload.tsx`. Hinweis: `docs/FUNKTIONSABGLEICH.md` führt dies fälschlich als ✓ |
| Eigentümer/Käufer in den Kundenbereich einladen (Modal: Anrede, Titel, Vor-/Nachname, E-Mail Pflicht, Telefon, Maklervertrag verknüpfen; Mail mit Zugangslink) | Portalzugang aus dem Objektkontext | ◐ | `src/components/portal/KundeEinladen.tsx` (Name, E-Mail, Rolle, Objekte anhaken), `src/server/portal-aktionen.ts:402 kundeEinladen`, `:666 kundeAusKontaktEinladen`; Vertragsverknüpfung erst in der Kundenakte (Reiter Objekte), nicht im Einladungsdialog; kein Anrede-/Titel-Feld |
| onOffice-Gitter (gespiegelte Objekte mit Titelbild, Nr., Vermarktung) | Eigene Ansicht der Fremdobjekte | ◐ | Importierte Objekte erscheinen in der normalen Objektliste; keine eigene onOffice-Ansicht |
| onOffice-Detail: „Alle Rohdaten anzeigen" | Rohfelder des Fremdsystems einsehen | ✗ | Kein Rohdaten-Spiegel; nur Zuordnung in `integration_mappings` |
| onOffice-Detail bearbeiten: Titel, Kaufpreis/Kaltmiete direkt in onOffice speichern (Warnung: wirkt auf Portale) | Feldweises Rückschreiben | ◐ | Rückschreiben nur als Sync-Richtung „senden/beide" (`src/integrationen/onoffice/connector.ts:107`, `src/integrationen/kern/lauf.ts:89`), nicht feldweise aus einem Dialog, keine Portalwirkungs-Warnung |
| Interne Notiz (nur im CRM, nicht im Fremdsystem) | Vertrauliche Objektnotiz | ✗ | Kein Notizfeld an `objekte` (Schema `20260816200353_objekte_kontakte.sql:33–131`); `beschreibung_sonstiges` ist Exposétext |
| „Auf eigener Webseite anzeigen" (Freigabe je Objekt) | Steuert öffentliche Sichtbarkeit | ✓ | `objekt_veroeffentlichung` je Kanal (`supabase/migrations/20260816203516_ausstattung_und_veroeffentlichung.sql:26–44`), Portalexport `src/app/(app)/portale/page.tsx`, Web-Exposé `src/app/(app)/exposes/[id]/WebExposeFormular.tsx` |
| onOffice-Admin Schritt 1 „Feldnamen prüfen" (jede Feldbezeichnung einzeln gegen die API, Ergebnis gültig/ungültig) | Ermittelt den nutzbaren Feldsatz | ✓ | `src/integrationen/onoffice/connector.ts:70 felderPruefen`, Fehlercode `api.ts:30`; „Verbindung prüfen" `src/components/integrationen/IntegrationenUebersicht.tsx:126` |
| Schritt 2 „Objektdaten holen" (Vollsync mit Zählern neu/aktualisiert/deaktiviert) | Holt alle Objekte | ✓ | `src/server/integrations-aktionen.ts:218 syncStarten`, `src/integrationen/kern/lauf.ts:75 syncAusfuehren` (angelegt/geändert/übersprungen); „Jetzt abgleichen" `IntegrationenUebersicht.tsx:132` |
| Schritt 3 „Ins CRM übernehmen", im Portal bearbeitete Objekte (🔒) überspringen | Legt echte Objekte an, schützt lokale Änderungen | ◐ | Übernahme direkt in `objekte`; statt Sperrkennzeichen Konfliktentscheid „beide Seiten geändert" mit Konfliktliste (`src/integrationen/kern/abgleich.ts:149`, `lauf.ts:159`) |
| Schritt 4 „Bilder herunterladen" (rundenweise, Abbrechen, Zähler, Bild-Diagnose) | Lädt Fotos/Grundrisse in eigenen Storage | ◐ | Bilder werden im selben Lauf in den Storage geladen (`connector.ts:283 bilderErgaenzen`, `speicher-supabase.ts:155–208`); keine Rundensteuerung, kein Abbruch, keine Diagnose |
| Zähler-Kacheln (Im Spiegel / Im CRM / Bilder geprüft / Bilder geladen / Gültige Felder) | Dauerhafter Fortschrittsüberblick | ◐ | Nur Laufergebnis-Zähler je Lauf (`lauf.ts:29 LaufErgebnis`) |
| Protokoll mit „Leeren" | Laufhistorie | ◐ | `sync_laeufe` (`supabase/migrations/20260903120100_integrationen.sql:120`), letzte 5 Läufe je Integration (`IntegrationenUebersicht.tsx:180–182`); kein Leeren |

### Neubauprojekte (zweite Unterkachel; Referenz-Bereich in ImmobilienPage)

Hinweis: Nach `docs/MASTERPROMPT.md` ist das Kundenbereich (Referenz-Modul) ausgeschlossen; das Paket
wurde laut `docs/ANLEITUNG.md` 10i auf Weisung gebaut und ist als Ganzes streichbar.

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Projekt anlegen (Name, Slug/URL, Ort, Vermarktung Kauf/Miete), öffentliche URL pflegen | Projekt-Homepage | ✓ | `src/server/portal-aktionen.ts:89 projektSpeichern`, `:149 projektVeroeffentlichen`; öffentliche Seite `src/app/projekt/[token]/` (Token statt Slug) |
| Einheiten anlegen/bearbeiten (WE-Nr., Geschoss, Index, Zimmer, Wohnfläche, Miete/Kaufpreis, Hausgeld, Ausrichtung, Sortierung), Status per Klick Verfügbar→Reserviert→Verkauft | Einheitenliste mit Statuszyklus | ✓ | `portal-aktionen.ts:172 einheitSpeichern`, `:203 einheitStatusSetzen`; Felder in `src/components/portal/ProjektDetail.tsx` (Geschoss, Hausgeld, Ausrichtung) |
| Dateien mit Ordnern, Sichtbarkeit (Alle Kunden / Nur Käufer / Öffentlich / intern, vom Ordner vererbt), Kategorie, Einheitsbezug; kompletten Ordner vom Rechner hochladen | Dokumentablage für Kunden | ◐ | `portal-aktionen.ts:228 ordnerSpeichern`, `:255 projektDateiHochladen`, `:283 projektDateiAendern`; Verzeichnis-Upload (`directory`) fehlt |
| Technische Dateinamen per KI in kundenfreundliche Anzeigenamen umwandeln | Automatische Umbenennung beim Upload | ✗ | Nicht vorhanden (vgl. `docs/FUNKTIONSABGLEICH.md` Kachel 10, W1) |
| Baufortschritt-Meldung (Titel, Text, Fotos), Kunden per gebündelter E-Mail informieren | Bautagebuch für Kunden | ◐ | `portal-aktionen.ts:304 updateSpeichern`; Benachrichtigungsmail nicht belegt |
| Gewerke/Ansprechpartner (Gewerk, Firma, Person, Telefon, E-Mail, Info; für Kunden sichtbar oder intern) | Bemusterungskontakte | ✓ | `portal-aktionen.ts:344 gewerkSpeichern`; ANLEITUNG 10i.5 |
| Kunden-Zugänge: anlegen, Rolle Interessent/Reserviert/Käufer, Einladung senden, Link kopieren, Sperren/Aktivieren, löschen, Passwort-/Login-Status | Zugangsverwaltung | ✓ | `portal-aktionen.ts:402 kundeEinladen`, `:451 kundeLinkErneuern`, `:473 kundeAendern`, `:500 kundeLoeschen`; ANLEITUNG 10i.10 (sperren, Passwort zurücksetzen, Login-Link neu senden) |
| Persönliche Unterlagen je Kunde und Nachrichten-Chat (Kunde erhält zusätzlich E-Mail) | 1:1-Kommunikation | ◐ | `portal-aktionen.ts:568 kundeDokumentHochladen`, `:528 kundeNachrichtSenden`, `:554 gelesen`; E-Mail-Kopie zur Chatnachricht nicht belegt |
| Reservierungsanfragen aus dem Kundenbereich: Bestätigen (Einheit reserviert, Rolle, Bestätigungsmail) / Ablehnen / Vereinbarung anlegen | Anfragenbearbeitung | ◐ | `portal-aktionen.ts:614 anfrageBearbeiten` (bestätigen/ablehnen, Einheit reserviert, Nachricht); Sprung zur Reservierungsvereinbarung aus der Anfrage nicht belegt (Reservierungen unter `src/app/(app)/vermietung/reservierungen/`) |
| Merklisten der Kunden setzen/entfernen | Makler pflegt Merkliste | ✓ | `portal-aktionen.ts:641 merklisteSetzen` |
| Reservierungsvereinbarungen & Rechnungen je Projekt, „Mit Projekt verknüpfen", Erkennung ähnlicher Projektnamen | Verknüpfung Vertrag ↔ Projekt/Einheit | ✗ | Keine Projekt-Verknüpfung in Reservierungen/Rechnungen gefunden |
| Aktivitäten-Protokoll (Login, Passwort gesetzt, Datei geöffnet, Unterlage eingereicht, Meldung gelesen, Selbstregistrierung, gemerkt, angefragt; 150 Ereignisse/90 Tage) | Nachvollziehbarkeit | ✓ | Reiter Aktivitäten in `ProjektDetail.tsx` und Kundenakte (ANLEITUNG 10i.10) |
| Vom Kunden eingereichte Unterlagen einsehen | Rückkanal | ✓ | Kundenakte Reiter Unterlagen (ANLEITUNG 10i.10), `portal-aktionen.ts:588 kundeDokumentLoeschen` |
| Datei-Viewer im Overlay (Bild/PDF, Esc) | Vorschau ohne Download | ◐ | Signierte Links (`portal-aktionen.ts:601 dateiLink`), kein Overlay |
| Zugang ins Käuferportal übergeben (Rolle Käufer, Kaufabwicklungs-Stufen) | Übergang Interessent → Käufer | ✓ | `portal-aktionen.ts:666 kundeAusKontaktEinladen`; sieben Stufen Kaufabwicklung (ANLEITUNG 10i.12) |

### Objektaufnahme

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Aufnahmenliste mit Adresse, „Erfasst von", zuletzt bearbeitet, Status In Arbeit / Abgeschlossen / Archiviert | Übersicht der Vor-Ort-Termine | ◐ | `src/app/(app)/aufnahmen/page.tsx:26–162` (Datum, Bezeichnung, Ort, Kontakt, Status offen/übernommen/verworfen `src/lib/aufnahme.ts:19`); `erstellt_von` gespeichert, nicht angezeigt |
| Filter nach Adresse, Ansprechpartner, Objektart | Liste eingrenzen | ✗ | Kein Filter in `aufnahmen/page.tsx` |
| „+ Neue Aufnahme" | Neuen Bogen starten | ✓ | `src/app/(app)/aufnahmen/neu/page.tsx`, `src/server/aufnahme-aktionen.ts:132` |
| Verknüpfungsanzeige „Maklervertrag: …" / „Bewertung verknüpft" | Zeigt Folgevorgänge | ◐ | Verknüpfung zu Objekt (`objekt_id`) und Lead (`akquise_leads.aufnahme_id`); keine zu Vertrag/Wertermittlung |
| Aufnahme löschen | Entfernen | ◐ | Bewusst „Verwerfen"/„Wieder öffnen" statt Löschen (`aufnahme-aktionen.ts:233`) |
| „→ Bewertung": Wertermittlung aus der Aufnahme anlegen, KI extrahiert Vorteile/Nachteile/Zielgruppen zur Auswahl, Stammdaten werden übernommen | Nahtloser Übergang zur Einwertung | ✗ | Wertermittlung entsteht nur am Objekt (`src/server/wertermittlung-aktionen.ts:47`); kein Pfad aus der Aufnahme, keine KI-Vor-/Nachteile |
| Abschnitt 1 Allgemein (Objektart 7 Werte, Adresse, Ansprechpartner, Kontakt, Eigentümer seit, Verkauf sofort / in Vorbereitung / später) | Stammdaten | ◐ | `src/components/AufnahmeFormular.tsx:66–155` (Bezeichnung, Datum, Kontakt, Adresse, Kategorie, Vermarktungsart); „Eigentümer seit" und Verkaufszeitpunkt fehlen |
| Abschnitt 2 Lage (Ortsteil/Wohnlage, Infrastruktur, Lagevorteile) | Lagebeschreibung vor Ort | ✗ | Nicht in der Aufnahme; Infrastruktur nur am Objekt (`src/components/werkzeuge/InfrastrukturKarte.tsx`) |
| Abschnitt 3 Grundstück (Größe, Erschließung, Zufahrt öffentlich/privat, B-Plan, Grundbuchblatt, Flur/Flurstück) | Grundstücksdaten | ◐ | Nur Grundstücksfläche (`AufnahmeFormular.tsx:174`) |
| Abschnitt 4 Gebäude (Baujahr, Bauweise, Modernisierungen, Dachform, Keller, Geschosse, Fenster) | Gebäudedaten | ◐ | Baujahr, Etage, Zustandsnoten Dach/Fassade/Fenster (`src/lib/aufnahme.ts:34–41`); Bauweise, Dachform, Keller, Geschosse, Modernisierungen fehlen |
| Abschnitt 5 Flächen (Wohn-/Nutzfläche, Zimmer, Schlafzimmer, Bäder, davon mit Fenster, Gäste-WC, Balkon/Terrasse, Garage/Stellplatz) | Flächen und Räume | ◐ | Wohnfläche, Zimmer (`AufnahmeFormular.tsx:166–182`) |
| Abschnitt 6 Ausstattung (Böden mehrfach, Heizung Liste, Heizungsbaujahr, Energieausweis vorhanden, Kennwert, Besonderheiten mehrfach) | Ausstattung | ◐ | Heizungsart Freitext, Heizungsbaujahr, Zustand Heizung/Bäder/Elektrik; Böden, Besonderheiten, Energieausweis-Angaben fehlen |
| Abschnitt 7 Zustand (Allgemein, Mängel, letzte Renovierung, Nutzung, Nettokaltmiete, Mietvertrag seit) | Zustand und Nutzung | ◐ | Sechs Bauteilnoten gut/mittel/schlecht/unbekannt (`src/lib/aufnahme.ts:11–41`); Mängel, Renovierung, Nutzungssituation, Miete fehlen |
| Abschnitt 8 Unterlagen (9 Häkchen „liegt vor") | Unterlagen-Check | ✓ | Invertiert als „offene Unterlagen" aus `DOKUMENTARTEN` (`AufnahmeFormular.tsx:262–285`, `src/lib/dokumente.ts:11–27`); bei Übernahme je Unterlage eine Aufgabe (RPC `aufnahme_uebernehmen`) |
| Abschnitt 9 Hinweise des Eigentümers | Freitext Eigentümer | ◐ | Ein gemeinsames Notizfeld (`AufnahmeFormular.tsx:291–297`), nicht getrennt |
| Abschnitt 10 Maklernotizen intern (Marktwert-Einschätzung, Vermarktungshinweise, Maßnahmen, Termin Objektfotos, Ansprechpartner Besichtigungen) | Interne Planung | ◐ | Preisvorstellung (`:211`) und Notizen; Fototermin, Maßnahmen, Besichtigungskontakt und Trennung intern/extern fehlen |
| Fotos je Abschnitt hochladen (mehrere), löschen | Bilddokumentation vor Ort | ✗ | Keine Fototabelle (`supabase/migrations/20260817165346_objektaufnahme.sql` nur `objektaufnahmen`); kein Upload in `aufnahmen/*` |
| Sprachmemo: im Browser aufnehmen oder Audio hochladen, Transkription, KI verteilt auf Felder, Vorschau, Felder übernehmen/verwerfen | Diktat statt Tippen | ✗ | Kein MediaRecorder/Audio in `src/`; KI-Vertrag ohne Audio (`src/lib/ki/typen.ts`) |
| Speichern mit Rückmeldung, Schließen | Bogen sichern | ✓ | `aufnahme-aktionen.ts:163 aufnahmeSpeichern` (nur Status offen) |
| Aufnahme in Objekt überführen (Referenz über Quellenauswahl „Aus Objektaufnahme") | Bestand anlegen | ✓ | „Objekt daraus anlegen" (`src/app/(app)/aufnahmen/[id]/page.tsx:125–138`), Eigentümer verknüpft, Aufgaben für fehlende Unterlagen; zusätzlich „Akquise-Lead daraus anlegen" |

### Zusammenfassung Immobilien

Zählung über 65 Zeilen: **✓ 18 · ◐ 31 · ✗ 16**
(Übersicht ✓2 ◐1 · Bestand ✓4 ◐14 ✗9 · Neubauprojekte ✓8 ◐5 ✗2 · Objektaufnahme ✓4 ◐11 ✗5)

Wichtigste Lücken:
1. **Objektliste ohne Suche, Filter (Vertragsart/Status), Sortierung, Ausblenden und Titelbild** — die Referenzliste ist ein echtes Arbeitswerkzeug, unsere ist eine reine Aufzählung.
2. **Objektaufnahme deutlich schmaler** (5 statt 10 Abschnitte, keine Fotos, kein Sprachmemo, kein Übergang zur Wertermittlung mit KI-Vor-/Nachteilen).
3. **Neues Objekt ohne Quellenauswahl** (aus Wertermittlung/Mietanfrage) und ohne „Neue Einheit" aus Stammobjekt trotz vorhandener Spalte.
4. **Web-Fassung der Bilder fehlt** — im alten Funktionsabgleich fälschlich als ✓ geführt; Grundprinzip „Bild-Pipeline mit Web-Variante" ist damit nicht erfüllt.
5. **Energieausweis-Kachel als Grafik** (Skala) fehlt in Marketing und Exposé.
6. onOffice: kein feldweises Rückschreiben, kein Rohdaten-Spiegel, keine Sperre lokal bearbeiteter Objekte (nur Konfliktliste), keine rundenweise Bildbeschaffung.

---

## Kachel Exposé-Schmiede

Entsprechung in ImmoOffice.ai: „Texte erzeugen" auf der Exposé-Seite
(`src/app/(app)/exposes/[id]/TextWerkstatt.tsx`, `src/server/expose-aktionen.ts`),
Objektdaten aus dem Objektformular, Energieausweis- und Infrastruktur-Karten am Objekt.

### Eingabe und Eckdaten

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Objektart wählen (Haus / Wohnung / Grundstück / Gewerbe) plus Objektart-Detail (z. B. Bungalow, Penthouse, Ladenfläche) | Steuert Pflichtfelder und Textanweisung | ✓ | Objektkategorie + Objektart je Kategorie (`src/app/(app)/objekte/ObjektFormular.tsx:140–157`, `src/lib/objekt-begriffe.ts:15–22,64–94`) |
| „Was soll geschrieben werden?" — Textart wählen (Titel, Objektbeschreibung, Lage, Ausstattung …) mit maximaler Zeichenzahl je Art | Einzeltext gezielt erzeugen | ◐ | Ein Lauf erzeugt Titel, Objekt-, Ausstattungs- und Lagebeschreibung zusammen (`expose-aktionen.ts:72`); `TEXTARTEN` kennt zusätzlich Kurzbeschreibung und Zielgruppe (`src/lib/ki/typen.ts:19–27`), nicht wählbar; keine Zeichenlimits |
| Pflichtfelder je Textart, Generieren gesperrt bis alle gefüllt („Pflichtfelder fehlen: …") | Erzwingt vollständige Eckdaten | ◐ | Lückenprüfung vor dem Modellaufruf meldet fehlende Angaben sichtbar, sperrt aber nicht (`src/lib/ki/luecken.ts:24–96`, Anzeige `TextWerkstatt.tsx:70–86`) — bewusst nach Abschnitt 8 |
| Titel-Modus: fertige Objektbeschreibung oder Stichworte einfügen, Schmiede zieht daraus den Titel | Titel aus Fließtext | ◐ | Titel wird aus Objektdaten und Stichpunkten erzeugt; kein Eingabefeld „Beschreibung einfügen" |
| Adresse (Straße + Nr., PLZ, Ort) | Ortsbezug | ✓ | `ObjektFormular.tsx:187–207` |
| Infrastruktur: Entfernungen automatisch sobald Adresse steht (Luftlinie via OpenStreetMap) in 9 Kategorien (Kindergarten, Grundschule, Realschule, Gymnasium, Einkaufen, Bushaltestelle, Zentrum, Autobahn, Flughafen), manuell überschreibbar, „Neu berechnen", Hinweis auf Kategorien ohne Treffer | Lagefakten für den Lagetext | ◐ | Auf Klick „Entfernungen ermitteln" am Objekt (`src/components/werkzeuge/InfrastrukturKarte.tsx:32`, `src/server/werkzeuge-aktionen.ts:214`); 12 Kategorien mit Gehminuten (`src/lib/werkzeuge/infrastruktur.ts:10–22`), fließt in den Lagetext (`:106`); fehlt: Schulformen getrennt, Zentrum, Flughafen, manuelles Überschreiben, automatische Auslösung |
| Nutzfläche, Wohnfläche, Grundstück, Zimmer, Baujahr, Kaufpreis | Kennzahlen | ✓ | `ObjektFormular.tsx:219–283` |
| Heizungsart (Liste + „Sonstige" mit Freitext), Baujahr Heizung | Technikangaben | ◐ | Am Objekt nur Energieträger (Freitext) und Baujahr Anlage (`supabase/migrations/20260816200353_objekte_kontakte.sql:109–110`, `EnergieausweisKarte.tsx:46–47`); Heizungsart-Liste nur in der Aufnahme |
| Verglasung, Fenster-Material, Baujahr Fenster | Fensterangaben | ✗ | Keine Spalten, kein Feld (kein Treffer für `verglasung`) |
| Ausstattung per Klick (Chips, mehrfach) + Freitext zusätzlich | Strukturierte Ausstattung | ◐ | Tabelle `objekt_ausstattung` vorhanden (`20260816203516_ausstattung_und_veroeffentlichung.sql:13`), nur vom OpenImmo-Export gelesen (`src/app/api/openimmo/[id]/route.ts`); keine Auswahloberfläche; Freitext „Stichpunkte zur Ausstattung" (`TextWerkstatt.tsx:88–97`) |
| Besonderheiten / weitere Infos (Freitext) | Zusatzinfos für die KI | ◐ | Nur über das Stichpunkte-Feld; kein eigenes Feld |
| GEG-Pflichtangaben (Ausweisart Verbrauch/Bedarf, Kennwert, Energieträger, Effizienzklasse, gültig bis) | Pflichtangaben für Inserate | ✓ | `ObjektFormular.tsx:320–343`, `EnergieausweisKarte.tsx:43–50`; Lückenregel Energieklasse (`luecken.ts:69–74`) |
| Einwertung-PDF hochladen, KI liest Felder aus, Vorschau, „Felder übernehmen"/„Verwerfen" (parse-einwertung) | Eckdaten aus Wertermittlungs-PDF | ✗ | `strukturAuslesen` kennt nur maklervertrag/objektnachweis/notar_anhang/energieausweis (`src/lib/ki/typen.ts:137`) |
| Notizen hochladen (PDF, Bild, Word, Text), KI liest Notizen, Felder übernehmen (parse-schmiede-notizen) | Handnotizen als Eingabe | ✗ | Nicht vorhanden (`docs/FUNKTIONSABGLEICH.md` W1) |
| Objektbilder als KI-Eingabe: bis 10 aus Fotos/Grundrissen des Objekts wählen oder hochladen; Passagen aus der Bildanalyse gold markiert („Aus den Bildern erkannt … bitte prüfen") | Bildgestützte Texte mit Kennzeichnung | ✗ | Texterzeugung rein textbasiert (`src/lib/ki/openai.ts:37–150`); Bildauslese nur für Zählerstand/Beleg (`typen.ts:153–158`) |

### Generierung und Ergebnis-Editor

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Generieren („Schmiede arbeitet …"), Fehleranzeige, Hinweis wenn KI-Funktion nicht erreichbar | Textlauf starten | ✓ | „Texte erzeugen" (`TextWerkstatt.tsx:118–128`), 10 Credits mit KI-Kennzeichen; Ohne-KI-Entwurf als Rückfall (`src/lib/ki/ohne-ki.ts`, `src/lib/ki/index.ts:21`) |
| Ergebnis-Editor: Text anklicken und direkt bearbeiten, Zeichenzähler, Warnung „Zeichen über dem harten Limit" | Nachbearbeitung im Werkzeug | ◐ | Bearbeitung nur über das Objektformular („Texte bearbeiten", `src/app/(app)/exposes/[id]/page.tsx:224–232`); kein Inline-Editor, kein Zeichenzähler |
| „Neu generieren" | Text ersetzen | ✓ | Erneuter Lauf überschreibt nicht-leere Ergebnisse (`expose-aktionen.ts:123–128`) |
| „Kürzer generieren" (auf Limit) | Text verdichten | ✗ | Nicht vorhanden |
| „Kopieren" in die Zwischenablage | Text weiterverwenden | ✗ | Nicht vorhanden |
| „Als <Feld> übernehmen" — Text direkt ins Immobilienfeld schreiben (Feldwahl) | Übergabe ins Objekt | ✓ | Automatisch je Textart ins Zielfeld (`expose-aktionen.ts:35–40 ZIELFELD`) |
| Entwürfe (Teampool): „Als Entwurf speichern", „Entwurf aktualisieren", Liste mit Kategorie · Textart · Adresse, laden, abkoppeln („Neuer Entwurf"), löschen, Ein-/Ausklappen | Versionierte Textentwürfe fürs Team | ✗ | Keine Entwurfstabelle; Texte liegen nur am Objekt (`objekte.beschreibung_*`) |
| Hausstil-Anweisung („im Stil des Unternehmens") | Einheitliche Tonalität | ✓ | Sechs wählbare Stile (`src/lib/ki/typen.ts:8–15`, `TextWerkstatt.tsx:79–87`) — mehr als die Referenz |
| Freigabepflicht vor Veröffentlichung, KI-Kennzeichnung in PDF und Web-Exposé | Kontrolle nach Abschnitt 8/10 | ✓ | `expose-aktionen.ts:151 texteFreigeben`; Kennzeichnung `src/lib/expose/gemeinsam.tsx:166–190`, `src/app/expose/[token]/page.tsx:284,389` — in der Referenz nicht vorhanden |

### Energieausweis-Auslese (Ergebnis-Editor der Referenz)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Energieausweis-PDF lesen: Volltext per pdf.js, Mustererkennung für Ausweisart/Endenergie/Baujahr/Energieträger, KI-Rückfall bei Scan (parse-energieausweis), Kennzeichnung „KI-erkannt", Hinweis bei Nichterkennung | Pflichtangaben automatisch füllen | ✓ | `src/server/werkzeuge-aktionen.ts:257 energieausweisAuslesen` (Heuristik `src/lib/ki/auslese.ts:29` + KI, 2 Credits), Prüfformular vor Übernahme `EnergieausweisKarte.tsx:39–52`, `:322 energiewerteUebernehmen` |
| Energieträger-Liste (Erdgas, Heizöl, Fernwärme, Wärmepumpe, Holz/Pellets, Strom, Flüssiggas, Sonstige) mit Zuordnung freier Begriffe | Normierte Träger | ◐ | `energie_traeger` Freitext (`EnergieausweisKarte.tsx:46`); keine Normierung |
| GEG-Ausnahmen (Baudenkmal, unter 50 m², Abriss, sonstige) | Ausweis nicht erforderlich | ◐ | `ENERGIEAUSWEISTYPEN` mit „Nicht erforderlich (Denkmal)" und „Liegt noch nicht vor" (`src/lib/objekt-begriffe.ts:52–57`); übrige Ausnahmen fehlen |
| Effizienzklassen-Skala mit Farbstufen (bis 250+) | Grafische Skala | ✗ | Klasse nur als Text (`ENERGIEKLASSEN`); keine Skala-Grafik |
| Eckdaten-Piktogramme je Objektart (Haus: Wohnfläche/Grundstück/Zimmer/Preis; ETW: Fläche/Zimmer/Ausstattung; Grundstück: Fläche/Erschlossen/Bauklasse; Gewerbe: Nutzfläche/Stellplätze/Sonstiges) | Bildhafte Eckdaten | ◐ | Eckdaten-Block textlich in Exposé-Vorlagen (`src/lib/expose/gemeinsam.tsx`) und Marketing (`src/lib/marketing/vorlagen.ts:101`); ohne Piktogramme |

### Zusammenfassung Exposé-Schmiede

Zählung über 29 Zeilen: **✓ 10 · ◐ 11 · ✗ 8**

Wichtigste Lücken:
1. **Keine Eingaben aus Dokumenten oder Bildern**: Einwertung-PDF, Notizen (PDF/Bild/Word/Text) und Objektbilder als KI-Eingabe fehlen komplett — die Referenz nutzt Bildanalyse mit gekennzeichneten Passagen.
2. **Kein Entwurfs-Pool** (speichern, laden, abkoppeln, Team-Zugriff); Texte existieren nur als Objektfelder.
3. **Kein Einzeltext-Modus** (Textart wählen, Zeichenlimit je Portal, „Kürzer generieren", Inline-Editor mit Zähler).
4. **Ausstattung nicht per Klick auswählbar**, obwohl die Tabelle `objekt_ausstattung` existiert; Fensterangaben und Heizungsart-Liste fehlen am Objekt.
5. Infrastruktur nur auf Klick, ohne manuelles Überschreiben und ohne Zentrum/Flughafen/Schulformen.
Positiv gegenüber der Referenz: Lückenmeldung statt Erfinden, Freigabepflicht, KI-Kennzeichnung in Export und Web-Exposé, Ohne-KI-Rückfall.

---

## Kachel KI-Agenten

### Agenten-Übersicht

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Agenten-Kacheln (Exposé-Prüfer aktiv; Mietvertrags-Prüfer „In Vorbereitung"), „Zuletzt bearbeitet" je Bereich, Zurück zur Übersicht | Einstieg in KI-Agenten | ✗ | Kein Navigationseintrag, keine Seite (`src/components/Navigation.tsx:25–55`) |

### Exposé-Prüfer

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Objekt mit vorhandenem Exposé-PDF aus Auswahl wählen („Nr. · Titel — Exposé vom …") | Prüfobjekt bestimmen | ✗ | Nicht vorhanden |
| Alternativ PDF hochladen (max. 28 MB) mit Objekt-Nr. als Bezug; Eindeutigkeitsprüfung der Nr.; Hinweis „ohne Objekt-Bezug keine Übernahmen" | Fremd-PDF prüfen | ✗ | Nicht vorhanden |
| „Jetzt prüfen" — KI liest das Exposé (30–90 s, expose-pruefen) | Prüflauf | ✗ | Keine Edge-Function/Server-Aktion; KI-Vertrag kennt keine Dokumentprüfung (`src/lib/ki/typen.ts:118–129`) |
| Ergebnis: Ampel, Zusammenfassung, Checkliste (Kerndaten, Provision, Rechtschreibung, Grundriss, Lageplan, Energieskala, Bildauswahl) | Endkontrolle vor Versand | ✗ | Nur regelbasierte Pflichtangaben-Prüfung für den Portalexport ohne KI und ohne PDF-Bezug (`src/components/PortalBereitschaft.tsx`, `src/lib/openimmo/pruefung.ts`) — andere Funktion |
| Befunde mit Seite, Fundstelle, Feld, Vorschlag; Auswahl mehrerer Befunde; „Korrektur in Feld übernehmen" / „Bild-Titel im Portal korrigieren"; Hinweis „Exposé danach neu erstellen" | Korrekturen zurückschreiben | ✗ | Nicht vorhanden |
| „Letzte Prüfungen" (Tabelle ki_pruefungen), Prüfbericht erneut anzeigen, Lauf am Objekt protokolliert | Historie | ✗ | Keine Tabelle (kein Treffer `ki_pruef` in `supabase/migrations`) |
| Hinweis „Befunde fachlich gegenprüfen" | Haftungshinweis | ✗ | Entfällt mit dem Agenten |
| Rechtschreibprüfung der Exposétexte (Teil der Checkliste) | Sprachliche Kontrolle | ◐ | `textKorrigieren` vorhanden (`src/lib/ki/openai.ts:234`, 1 Credit), aber nur für Aufgabenbeschreibungen genutzt (`src/components/aufgaben/AufgabeDetail.tsx`, `src/server/arbeitsmittel-aktionen.ts`); nicht für Exposétexte |

### Mietvertrags-Prüfer

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Platzhalter „Dieser Agent ist noch in Vorbereitung" | Angekündigter Agent | ✗ | Nicht vorhanden (in der Referenz ebenfalls nur Platzhalter) |

### KI-Assistent (Chat-Widget)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Schwebendes Chat-Widget im Mitarbeiterbereich: Verlauf lokal im Browser, „Verlauf leeren"/„Neu", Enter senden / Shift+Enter Zeilenumbruch, Tipp-Indikator, Beispielfragen, Haftungshinweis | Freier KI-Dialog (Edge-Function der Referenz) | ✗ | Kein Chat-Bestandteil in `src/components`/`src/app/(app)/layout.tsx` |
| Aktionen aus dem Chat: Akquise-Automationen planen (akq-automation-lauf), Lead-Historie/Änderungs-Log schreiben, Anrede-Bausteine, Vokabular (Objektarten, Zustände, Zeithorizonte, Kanäle) | Chat als Bedienoberfläche für Akquise | ✗ | Automationen existieren nur als Formularverwaltung (`src/components/akquise/AutomationenVerwaltung.tsx`), nicht per Chat |

### Zusammenfassung KI-Agenten

Zählung über 12 Zeilen: **✓ 0 · ◐ 1 · ✗ 11**

Wichtigste Lücken:
1. **Exposé-Prüfer komplett offen** — PDF-basierte Endkontrolle mit Ampel, Checkliste, Befunden und Rückübernahme ins Objekt. Vorhandene Bausteine, auf denen sich aufbauen ließe: PDF-Textextraktion (`src/lib/dokument/pdf-text.ts`), Auslese-Vertrag (`src/lib/ki/auslese.ts`), Pflichtangaben-Regeln (`src/lib/openimmo/pruefung.ts`), Rechtschreibkorrektur (`textKorrigieren`), Credit-Reservierung.
2. **Kein KI-Assistent/Chat** — in `docs/FUNKTIONSABGLEICH.md` als W2 eingeplant; Scope-Prüfung nötig (Chat plant in der Referenz Akquise-Automationen und schreibt Lead-Historie).
3. Mietvertrags-Prüfer: auch in der Referenz nur Platzhalter — keine Vorlage, an der man sich orientieren könnte.

---

## Gesamtbild

| Kachel | Zeilen | ✓ | ◐ | ✗ |
|---|---|---|---|---|
| Immobilien | 65 | 18 | 31 | 16 |
| Exposé-Schmiede | 29 | 10 | 11 | 8 |
| KI-Agenten | 12 | 0 | 1 | 11 |
| **Summe** | **106** | **28** | **43** | **35** |

Korrekturen gegenüber `docs/FUNKTIONSABGLEICH.md`: „Web-Fassung von Objektbildern ✓" ist
nicht belegt (✗); „Objektaufnahme vor Ort ✓" ist nur ◐ (5 statt 10 Abschnitte, keine
Fotos, kein Sprachmemo); „KI-Texte je Baustein ✓" ist ◐ (kein Einzeltext-Modus, kein
Entwurfs-Pool, keine Dokument-/Bild-Eingaben).


---

## Kachel Immobilien — Objektakte

Quelle: Oberflächentexte der Referenzkomponente „ImmobilieSeite" und ihrer 59 Unterkomponenten (`ImmobilieSeite.txt`) sowie die Technikliste (`_technik.txt`: Edge Functions energieausweis-auslesen, expose-pdf-erzeugen, expose-pruefen, generate-text, objekt-wissen-auslesen, onoffice-objekt-anlegen, parse-expose, portal-export-homepage, Bürobildschirm-API; Tabellen aktivitaets_log, bewertungen, immobilie_datei, immobilie_eigentuemer, Cloud-Ablage-Zuordnung je Objekt, immobilie_portal_status, immobilie_wissen, immobilien, mail_eingang, objektaufnahmen, onoffice_felder, onoffice_objekte, profiles, termine, vertraege).

Legende: ✓ vorhanden · ◐ teilweise · ✗ fehlt. Fundstellen sind Pfade in ImmoOffice.ai. Die Referenz gliedert die Akte in elf Reiter; ImmoOffice.ai gliedert die Objektseite in Karten (`src/app/(app)/objekte/[id]/page.tsx`) plus ein getrenntes Bearbeiten-Formular (`src/app/(app)/objekte/ObjektFormular.tsx`) und eine eigene Exposé-Seite (`src/app/(app)/exposes/[id]/page.tsx`).

### Kopfzeile und Grundfunktionen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zurück zur Liste | Verlässt die Akte; bei ungespeicherten Änderungen Rückfrage | ◐ | `src/app/(app)/objekte/[id]/page.tsx` („Zur Übersicht"), `ObjektFormular.tsx` („Abbrechen"); fehlt: Rückfrage bei ungespeicherten Änderungen |
| Anzeige „Gespeichert / Ungespeichert" | Dirty-Status des Formulars im Kopf | ✗ | fehlt: Formular kennt keinen Dirty-Status; Speichern nur per Submit |
| Speichern / Objekt anlegen | Speichert alle Reiter in einem Zug | ✓ | `src/server/objekt-aktionen.ts` (`objektSpeichern`, Zod-Prüfung, Rechteprüfung, RLS) |
| Objektnummer frei vergeben mit Dublettenprüfung | Meldung „Objektnummer bereits vergeben" | ◐ | Nummer wird automatisch fortlaufend vergeben (`supabase/migrations/20260816200353_objekte_kontakte.sql`, Trigger `naechste_objektnummer`, Unique-Constraint je Mandant); fehlt: Feld im Formular, sprechende Dublettenmeldung |
| Löschen mit Rückfrage | Objekt löschen | ◐ | `objektLoeschen` (Soft-Delete mit `geloescht_am`, Aufbewahrung); fehlt: Bestätigungsdialog |
| Reiterleiste mit Zählern (Fotos, Dokumente) | Elf Reiter, Anzahl je Reiter | ◐ | Karten statt Reiter; Bilderzahl in `src/components/Bildergalerie.tsx`; fehlt: Reiter-Navigation, Zähler an Unterlagen |
| Einheiten-Hinweis „Einheit von … / Stammobjekt öffnen" | Zeigt das Stammobjekt einer Einheit und verlinkt es | ◐ | Spalte `stammobjekt_id` in `objekte` (Migration 20260816200353); fehlt: jede Bedienung und Anzeige |
| Neue Einheit anlegen (aus dem Kopf) | Legt eine Einheit unter dem Stammobjekt an | ✗ | fehlt: siehe Abschnitt „Dialoge" (Einheiten-Assistent) |
| An onOffice übertragen (neu anlegen) | Legt das Objekt im Fremdsystem an, meldet Objekt-Nr. und abgelehnte Felder | ◐ | Connector mit `objekte_senden` in `src/integrationen/onoffice/connector.ts`, Feldabbildung `objektNachOnOffice` in `src/integrationen/onoffice/mapping.ts`, Lauf über `src/server/integrations-aktionen.ts` (`syncStarten`) und `src/lib/jobs/worker.ts`; fehlt: Schaltfläche am Objekt, Fremdnummer in der Akte, Rückmeldung abgelehnter Felder je Objekt |
| onOffice aktualisieren („Bilder bleiben im Portal") | Überschreibt das verknüpfte Fremdobjekt mit dem aktuellen Stand | ◐ | wie oben (Abgleich je Integration, `integration_mappings` in Migration 20260903120100); fehlt: Auslösung und Statusanzeige am einzelnen Objekt |
| Mobile Darstellung der Reiter | Reiter als Liste auf dem Handy | ◐ | Responsive Karten-Raster (`page.tsx`, `lg:grid-cols-3`); fehlt: Reiterlogik |

### Reiter Grunddaten

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Objektnummer (ImmoNr) | Freies Nummernfeld | ◐ | automatisch vergeben, nicht editierbar (siehe oben) |
| Bezeichnung (intern) | Interner Name | ✓ | `ObjektFormular.tsx` (`bezeichnung`) |
| Objekttitel (öffentlich) mit Zeichenzähler (max. 100, rot bei Überschreitung) | Titel für Exposé und Portale | ◐ | `ObjektFormular.tsx` (`titel`); fehlt: Zeichenzähler und Längengrenze |
| Adresse: Straße, Hausnummer, PLZ, Ort | Anschrift | ✓ | `ObjektFormular.tsx`, PLZ-Prüfung in `objekt-aktionen.ts` |
| Etage, Wohnungsnr., Etagen gesamt | Lage im Gebäude | ◐ | Spalten `etage`, `wohnungsnummer`, `etagen_gesamt` (Migration 20260816200353); fehlt: Formularfelder |
| Kategorie / Objektart / Objekttyp | Dreistufige Klassifikation | ✓ | `src/lib/objekt-begriffe.ts` (`OBJEKTKATEGORIEN`, `OBJEKTARTEN` je Kategorie), Formular abhängig davon |
| Nutzungsart | Wohnen / Gewerbe / Anlage / gemischt | ✓ | `NUTZUNGSARTEN` in `objekt-begriffe.ts` |
| Vermarktungsart Verkauf / Vermietung / Beides | Steuert Preisfelder | ✓ | `VERMARKTUNGSARTEN`, `istKauf`/`istMiete` |
| Status (Akquise … Archiv) | Vermarktungsstatus | ✓ | `OBJEKTSTATUS` (zusätzlich „Zurückgezogen"), Statuswechsel im Verlauf (`src/lib/verlauf.ts`) |
| Makler (Ansprechpartner) wählen | Zuständiger Mitarbeiter | ◐ | `zustaendig_id` wird beim Anlegen auf den Ersteller gesetzt (`objekt-aktionen.ts`); fehlt: Auswahlfeld |
| Stammobjekt wählen („wenn dieses Objekt eine Einheit ist") | Einheit an Stammobjekt hängen | ◐ | Spalte vorhanden; fehlt: Auswahl im Formular |
| Auftragsart, Auftrag bis | Auftragsdaten | ◐ | Spalten `auftragsart`, `auftrag_von`, `auftrag_bis`; fehlt: Formularfelder |
| Verkauft / Vermietet am | Abschlussdatum | ✗ | fehlt: keine Spalte; nur Statuswechsel im Verlauf (`status_geaendert`) |
| Verfügbar ab | Verfügbarkeitsangabe | ◐ | Spalte `verfuegbar_ab`, im OpenImmo-Export (`src/lib/openimmo/xml.ts`); fehlt: Formularfeld |
| Interne Notizen | Freitext nur intern | ✗ | fehlt: keine Spalte; Ersatz sind Verlaufsnotizen (`src/components/Verlauf.tsx`) |

### Reiter Preise & Flächen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Wohnfläche, Nutzfläche, Grundstück, Zimmer, Baujahr | Flächen und Eckdaten | ✓ | `ObjektFormular.tsx` (kategorieabhängig eingeblendet) |
| Schlafzimmer, Badezimmer, Balkone, Terrassen | Zähler | ◐ | Spalten `schlafzimmer`, `badezimmer`, `anzahl_balkone`, `anzahl_terrassen`, im OpenImmo-Export; fehlt: Formularfelder |
| Angebotspreis | Kaufpreis | ✓ | `kaufpreis` in Formular und Aktion |
| Verkaufspreis (final) | Erzielter Preis | ✗ | fehlt: keine Spalte |
| Provision außen (Käufer) / innen (Verkäufer) / provisionsfrei | Provisionsangaben | ◐ | Spalten `provision_kaeufer`, `provision_verkaeufer`, `courtage_frei`; genutzt im Exposé (`src/lib/expose/gemeinsam.tsx`) und Notar-Laufzettel; fehlt: Formularfelder am Objekt |
| Geschätzter Marktwert (intern) | Interne Wertangabe | ✗ | fehlt am Objekt; Wertermittlung ist eigenes Modul mit `wertermittlungen.objekt_id` (Migration 20260818055122) |
| Kaltmiete | Miete | ✓ | `kaltmiete` im Formular |
| Nebenkosten, Heizkosten, Stellplatzmiete | Mietnebenposten | ◐ | Nebenkosten ✓ Formular; `heizkosten` nur Spalte; Stellplatzmiete fehlt |
| Kaution als Vielfaches der Kaltmiete (§ 551 BGB) oder Festbetrag, mit Berechnung | Kautionsfeld mit Rechner | ◐ | Spalte `kaution` (Betrag), Kaution im Mietvertrag (`src/components/vermietung/MietvertragFormular.tsx`); fehlt: Feld und Rechner am Objekt |
| Warmmiete automatisch aus Kalt + NK + Heizung | Summenfeld | ◐ | Spalte `warmmiete`, im OpenImmo-Export; fehlt: Feld und Berechnung |
| Warmwasser in den Heizkosten enthalten | Ja/Nein für das Exposé | ✗ | fehlt (nur die Energieausweis-Variante `energie_warmwasser_enthalten`) |
| Hausgeld | WEG-Hausgeld | ✓ | `hausgeld` im Formular (bei Wohnungen) |

### Reiter Freitexte

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Exposé-Schmiede öffnen und KI-Texte direkt übernehmen | KI-Texterzeugung mit Rückschreiben ins Objekt | ✓ | `src/app/(app)/exposes/[id]/TextWerkstatt.tsx`, `src/server/expose-aktionen.ts` (`texteErzeugen`, Lückenhinweis, Freigabe `texteFreigeben`, Kennzeichen `texte_ki_erzeugt`) |
| Objektbeschreibung, Ausstattung, Lage | Drei Freitexte | ✓ | `ObjektFormular.tsx` |
| Sonstige Angaben | Vierter Freitext | ◐ | Spalte `beschreibung_sonstiges`, im Export; fehlt: Formularfeld |
| Überschriften für Objektbeschreibung und Lage (Exposé) | Eigene Zwischentitel im Exposé | ✗ | fehlt |
| Ausstattung Exposé-Kurzfassung mit Zeichenlimit | Kurztext für Exposé-Raster | ✗ | fehlt |

### Reiter Vermarktung

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Energieausweis-Felder (Typ, Endenergie, Klasse, Energieträger, Baujahr Heizung, gültig bis, Warmwasser enthalten) | GEG-Pflichtangaben | ✓ | Typ/Kennwert/Klasse in `ObjektFormular.tsx`; Energieträger, Baujahr Anlage, Warmwasser, gültig bis in `src/components/werkzeuge/EnergieausweisKarte.tsx` (`energiewerteUebernehmen`) |
| GEG-Pflichthinweis (außer Denkmalschutz) | Hinweistext und Prüfung | ◐ | Prüfung vor Portalexport in `src/lib/openimmo/pruefung.ts` (`exportPruefen`), Anzeige in `src/components/PortalBereitschaft.tsx`; fehlt: Hinweistext im Formular |
| Energieausweis hochladen und automatisch auslesen, Ablage unter Dokumente | KI liest PDF/Bild, füllt Felder | ✓ | `src/server/werkzeuge-aktionen.ts` (`energieausweisAuslesen`, 2 Credits, Ablage als Unterlage, Prüfformular vor Übernahme) |
| Energieskala als Bild erzeugen und in Fotos ablegen | Live-Vorschau der Skala, PNG ins Objekt | ✗ | fehlt: keine Skalen-Grafik (Exposé zeigt Energiedaten als Text, `src/lib/expose/gemeinsam.tsx` `energiedaten`) |
| Portalschalter ImmobilienScout24 / Immowelt / Kleinanzeigen | Je Portal ein-/ausschalten | ◐ | OpenImmo-Paket je Objekt (`src/app/api/openimmo/[id]/route.ts`, `PortalBereitschaft.tsx`), Übersicht `src/app/(app)/portale/page.tsx`; fehlt: Schalter je Portal am Objekt, automatische Übertragung (Phase 2) |
| Eigene Internetseite: „Auf der Website veröffentlichen" | Objekt auf der eigenen Objektseite zeigen | ◐ | Web-Exposé mit eigener Adresse (`src/app/(app)/exposes/[id]/WebExpose.tsx`, `src/server/web-expose-aktionen.ts`) und Objekt-API/Rückrufe für eigene Websites (`src/app/api/v1/objekte`, `src/lib/schnittstelle/rueckruf.ts`); fehlt: einfacher Website-Schalter am Objekt |
| Als Top-Angebot hervorheben / Als Referenz kennzeichnen | Kennzeichen für die Website | ✗ | fehlt |
| Vollständigkeitsprüfung „für sauberen Auftritt fehlt noch …" | Hauptbild, Titel, Adresse prüfen | ✓ | `PortalBereitschaft.tsx` mit Fehlern und Warnungen aus `exportPruefen` |
| Adressfreigabe (vollständige Adresse öffentlich) | Straße/Hausnummer nur mit Häkchen | ◐ | Spalte `adresse_veroeffentlichen`, beachtet in Exposé (`gemeinsam.tsx`), Web-Exposé (`src/app/expose/[token]/page.tsx`) und Export; fehlt: Schalter im Formular |
| Schaufenster-TV-Schalter | Objekt in die Bildschirm-Rotation | ✗ | laut `docs/SCOPE.md` (Digital Signage: NEIN) nicht im Scope |
| Homepage-Export OpenImmo per FTP: Übertragen, Aktualisieren, Vom Portal löschen, Status (übertragen am, Lösch-Auftrag, Fehler) | Push an die eigene Website mit Statusanzeige | ◐ | OpenImmo-ZIP zum Herunterladen (`api/openimmo/[id]?paket=1`), Ereignis-Rückrufe an eigene Systeme (`src/lib/schnittstelle/ereignisse.ts`), Verlaufstyp `portal_uebertragen`; fehlt: FTP-Übertragung, Löschauftrag, Übertragungsstatus je Objekt (`immobilie_portal_status`) |
| Hinweis „erst speichern, dann übertragen" | Schutz vor veraltetem Stand | ✗ | fehlt (kein Dirty-Status) |

### Reiter Exposé

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Exposé-PDF erstellen (Seitenzahl, Warnungen, Ablage unter Dokumente, Download-Link) | Serverseitige PDF-Erzeugung | ◐ | PDF in fünf Vorlagen über `src/app/api/expose/[id]/pdf` (`src/lib/expose/vorlagen.tsx`: klassisch, modern, premium, Factsheet, Aushang), Verlaufseintrag `expose_erzeugt`; fehlt: Ablage des PDF als Unterlage, Warnungen, Seitenangabe |
| Zusammenfassung vor der Erzeugung (externe Fotos, Grundrisse, Lageplan, Energieausweis-Seite, Provision) | Was ins PDF kommt | ◐ | Bildzahl-Hinweis auf der Exposé-Seite (`exposes/[id]/page.tsx`); fehlt: Aufschlüsselung nach Bildart |
| Energieausweis-Seite im Exposé | Eigene Seite mit Skala | ◐ | Energiedaten als Eckdatenblock (`gemeinsam.tsx` `energiedaten`); fehlt: eigene Seite mit Skala |
| Provision im Exposé (inkl. MwSt.) | Provisionszeile | ✓ | `gemeinsam.tsx` (`provision_kaeufer`) |
| KI-Fußzeilenhinweis bei KI-bearbeiteten Bildern | Pflichthinweis automatisch | ✓ | `src/lib/expose/bausteine.tsx` (Kennzeichen auf dem Bild und in der Fußzeile) |
| KI-Exposé-Prüfung (Befunde je Seite/Feld, Vorschläge, Korrektur übernehmen, Bild-Titel korrigieren, Protokoll am Objekt) | Prüf-Agent liest das PDF | ✗ | fehlt: kein Prüfer (siehe `docs/FUNKTIONSABGLEICH.md` Kachel 11) |
| Cover-Slogan mit KI-Vorschlag (max. 60 Zeichen) | Slogan auf der Titelseite | ✗ | fehlt |
| Stellplatz-Art / -Anzahl | Eckdaten-Raster | ◐ | Spalten `stellplatz_art`, `stellplatz_anzahl`; fehlt: Formularfelder |
| QR-Code-Ziel auf der Kontaktseite | QR im PDF | ✗ | fehlt: keine QR-Erzeugung in den Vorlagen |
| Seite „Transparenz & Finanzierung" / Renditeseite (vermietet, Ist-/Soll-Miete, Hausgeld, nicht umlagefähig, Grunderwerbsteuer aus PLZ) | Kaufnebenkosten und Rendite im PDF | ◐ | Spalten `miete_ist`, `miete_soll`, `hausgeld`, `grunderwerbsteuer_satz`; Grunderwerbsteuer in den Firmenkennzahlen (`src/components/verwaltung/KennzahlenFormular.tsx`); fehlt: Felder am Objekt, PLZ-Ableitung, Exposé-Seite |
| Highlights (4 Chips, zwei Zeilen) mit KI-Vorschlag | Kurzmerkmale auf der Objektseite | ✗ | fehlt |
| Distanzen automatisch ermitteln, Zeilen ergänzen/entfernen | Lage- und Makrolage-Liste | ◐ | `src/components/werkzeuge/InfrastrukturKarte.tsx`, `src/lib/werkzeuge/infrastruktur.ts` (OpenStreetMap, Luftlinie, Gehminuten, im Exposé genutzt); fehlt: manuelle Einträge |
| Raumaufteilung (Raum/Fläche je Geschoss, neben dem Grundriss) | Liste im Exposé | ✗ | fehlt am Objekt; Räume gibt es nur im Wohnflächenrechner (`src/components/werkzeuge/WohnflaechenRechner.tsx`) ohne Exposé-Ausgabe |
| Lageplan / Makrolage-Karte automatisch, Ausschnitt interaktiv wählen, Vorrang eigener Upload | Kartenausschnitt als Lageplan | ✗ | fehlt: keine Kartenerzeugung; Lageplan nur als hochgeladenes Bild (Bildart `lageplan` in `src/lib/bilder.ts`) |
| Grundrisse und Lagepläne im Exposé gesondert platziert | Bildart steuert die Seite | ◐ | Bildart wird geladen (`src/lib/expose/bilder-laden.ts`); die Vorlagen unterscheiden die Arten nicht |

### Reiter Fotos

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Fotos hochladen (Mehrfachauswahl) | Upload direkt in den Storage | ✓ | `src/components/BildUpload.tsx`, `src/server/bild-aktionen.ts` (`bildErfassen`) |
| Bildtyp Foto / Grundriss / Lageplan, nachträglich umstellbar | Trennung für Exposé und Portale | ◐ | Art bei Upload (`BILDARTEN`: Foto, Grundriss, Lageplan, Energieausweis, Sonstiges); fehlt: nachträgliche Umstellung, getrennte Gruppen in der Galerie |
| Sortieren per Ziehen oder Pfeile | Reihenfolge | ◐ | Pfeile `bildVerschieben` (`Bildergalerie.tsx`); fehlt: Drag-and-drop |
| Portal-Hauptbild setzen | Titelbild | ✓ | `titelbildSetzen` (`bild-aktionen.ts`) |
| Exposé-Titelbild getrennt vom Portal-Hauptbild | Zweites Titelbild | ✗ | fehlt: nur ein Titelbild (`ist_titelbild`) |
| Aus dem Exposé ausschließen (bleibt für Portale) | Bild je Kanal steuern | ✗ | fehlt |
| Intern / Extern je Bild | Nur intern sichtbare Bilder | ✗ | fehlt: Sichtbarkeit gibt es nur für Unterlagen (`objekt_dokumente.sichtbarkeit`) |
| Als KI-bearbeitet markieren; Pflichthinweis in Exposé-Fußzeile | Kennzeichnung | ◐ | automatisch bei KI-Bearbeitung (`bildVersionSpeichern` mit `ki=1`, `src/server/werkzeuge-aktionen.ts`), Kennzeichen im PDF, Web-Exposé und OpenImmo (`src/lib/openimmo/xml.ts` `KI_BILDVERMERK`); fehlt: manueller Schalter |
| Bild mit eingebranntem KI-Hinweis herunterladen (einzeln und alle) | Portal-Upload-Variante | ✗ | fehlt: kein eingebranntes Badge (Export überträgt den Vermerk im Bildtitel) |
| Bildtitel pflegen | Titel je Bild | ◐ | Spalte `titel` in `objekt_bilder`; fehlt: Bearbeitung |
| Foto bearbeiten (Editor, Speichern legt Kopie an) | Bildbearbeitung mit Versionierung | ✓ | `src/components/werkzeuge/BildEditor.tsx`, `bildVersionSpeichern` (Original bleibt, Versionen mit Kennzeichnung) |
| Portal-Hauptbild erstellen (Zuschnitt, Kreis, Pfeile, Logo, Firmenzeile) | Vorlage fürs Portal-Titelbild | ◐ | Zuschnitt, Text, Logo im Bild-Editor; fehlt: Markierungskreis/Pfeile als Vorlage |
| Grundriss aufbereiten (PDF/Bild in den Exposé-Look, Vektor- oder Bildmodus, Beschriftung, Weißpunkt, Zuschnitt, als Grundriss speichern) | Automatische Aufbereitung | ◐ | Grundriss-Editor mit hinterlegtem Plan zum Nachzeichnen, Export und Ablage als Objektbild (`src/components/werkzeuge/GrundrissEditor.tsx`, `grundrissAlsBild`); fehlt: automatische Farb-/Linienaufbereitung, PDF-Seite als Quelle |
| Raumscan (LiDAR-App, Scan-Datei laden, Räume benennen, Scan-Qualität, Kontrollmaße, JSON/SVG, am Objekt ablegen, Grundriss und Wohnfläche daraus) | Raumerfassung | ◐ | Import einer Scan-JSON in den Grundriss-Editor (`ausRaumscan` in `src/lib/werkzeuge/grundriss.ts`), Räume in den Wohnflächenrechner (`grundrissZurWohnflaeche`); fehlt: App, Qualitätsbericht, Kontrollmaße, Ablage der Scans am Objekt |
| Einzelbild herunterladen | Download-Schaltfläche | ✗ | fehlt: nur signierte Vorschau (`Bildergalerie.tsx`) |
| Alle / ausgewählte Originale als ZIP | Sammeldownload | ◐ | Gesamtexport des Mandanten mit Dateien (`src/app/api/export/route.ts`), OpenImmo-Paket mit Bildern; fehlt: ZIP je Objekt aus der Galerie |
| Massenauswahl per Häkchen, Sammel-Löschen | Mehrere Bilder auf einmal | ✗ | fehlt |
| Bild entfernen mit Rückfrage | Löschen | ◐ | `bildLoeschen`; fehlt: Rückfrage |
| Trennung Fotos / Grundrisse / Lagepläne als eigene Gruppen mit Zähler | Übersicht | ◐ | Art gespeichert; Galerie zeigt gemischt |

### Reiter Dokumente

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Datei hochladen (Bild oder Dokument vom PC) | Upload mit Art | ✓ | `src/components/DokumentUpload.tsx`, `src/server/dokument-aktionen.ts` (`dokumentErfassen`; Art, Gültig-bis, Sichtbarkeit) |
| Quelle: Referenz-Modul Cloud-Ablage (Ordner-Picker) | Datei aus Cloud-Ordner | ✗ | laut Masterprompt ersatzlos entfallen |
| Quelle: Anhang aus verknüpfter Mail | Mailanhang ans Objekt | ◐ | `anhangUebernehmen` in `src/server/postfach-aktionen.ts` (vom Postfach aus); fehlt: Auswahl aus der Akte heraus |
| Schwärzen (Personendaten automatisch finden) an der Unterlage | PII-Schwärzung | ◐ | PDF-Werkzeuge mit automatischer Suche (`src/components/werkzeuge/PdfWerkzeuge.tsx`) ohne Objektbezug; fehlt: Schaltfläche an der Unterlage, Rückschreiben |
| Dokument öffnen / herunterladen | Signierter Verweis | ✓ | `dokumentVerweis` (`src/components/Dokumentenliste.tsx`) |
| Entfernen mit Rückfrage | Löschen | ◐ | `dokumentLoeschen`; fehlt: Rückfrage |
| Leerzustand „Noch keine Dokumente" | Hinweis | ✓ | `Dokumentenliste.tsx` (zusätzlich Hinweis auf fehlende Unterlagen, `src/lib/dokumente.ts` `fehlendeUnterlagen`) |

### Reiter Verknüpfungen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Einheiten-Liste am Stammobjekt (Wohnung, Fläche, Zimmer, Status) | Übersicht der Einheiten | ✗ | fehlt: Neubau-Einheiten existieren nur im Projektmodul (`projekt_einheiten`, `src/server/portal-aktionen.ts`), nicht als Objekt-Einheiten |
| Kontakte hinzufügen mit Rolle (Eigentümer, Käufer, Mieter, Ansprechpartner) und entfernen | Beteiligte | ✓ | `src/components/Beteiligte.tsx`, `src/server/beteiligte-aktionen.ts`; Rollen in `src/lib/kontakt-begriffe.ts` (Eigentümer, Interessent, Käufer, Mieter, Dienstleister, Notar, Sonstige; Anteil bei Eigentümern) |
| Maklerverträge verknüpfen / anzeigen | Vertrag am Objekt | ◐ | `vertraege.objekt_id` (Migration 20260818060819), Anlage mit Objektbezug (`src/components/verkauf/MaklervertragFormular.tsx`); fehlt: Liste und Verknüpfen in der Akte |
| Verknüpfte E-Mails (Mail verknüpfen, Picker) | Mails am Objekt | ◐ | Zuordnung aus dem Postfach mit KI-Vorschlag (`nachrichtZuordnen`, `src/server/postfach-aktionen.ts`); fehlt: Liste und Picker in der Akte |
| Termine (verknüpfen, Liste) | Termine am Objekt | ✓ | `src/components/Terminliste.tsx`, Anlegen mit Objektbezug (`AufgabeAnlegen` art="termin") |
| Objektaufnahmen verknüpfen / anzeigen | Aufnahme am Objekt | ◐ | `objektaufnahmen.objekt_id` und Übernahme (`aufnahmeUebernehmen`, `src/server/aufnahme-aktionen.ts`); fehlt: Anzeige und nachträgliches Verknüpfen in der Akte |
| Bewertungen verknüpfen / anzeigen | Wertermittlung am Objekt | ◐ | `wertermittlungen.objekt_id`, Objektwahl beim Anlegen (`src/components/wertermittlung/WertermittlungAnlegen.tsx`); fehlt: Liste in der Akte |
| Verknüpfung entfernen („Datensatz bleibt erhalten") | Lösen ohne Löschen | ◐ | Kontakte ✓ (`beteiligtenEntfernen`); fehlt für Verträge, Mails, Aufnahmen, Bewertungen |
| Picker mit Suche und Filter „noch nicht verknüpft" | Auswahl-Dialog | ◐ | Kontakt-Auswahlliste in `Beteiligte.tsx`; fehlt: Suche, weitere Datensatzarten |

### Reiter Aktivitäten

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Aktivitätenstrom (Objekt angelegt, Mail, Termin, Datei, Aufnahme, Bewertung, Vertrag; mit Wer und Symbol) | Chronik der Akte | ◐ | `src/components/Verlauf.tsx`, `src/lib/verlauf.ts` (Systemeinträge: Objekt, Status, Unterlage, Bild, Exposé, Web-Exposé, Portal, Kontakt; Handeinträge Notiz/Anruf/E-Mail/Besichtigung/Angebot; unveränderbar per RLS); fehlt: Mails, Termine, Verträge, Aufnahmen, Bewertungen im Strom |

### Reiter Wissen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Objektwissen: Unterlagen per KI auswerten (Fakten, Warnungen je Quelle), Fortschritt, Quellen entfernen | Wissensbasis je Objekt | ✗ | fehlt (Edge Function objekt-wissen-auslesen, Tabelle immobilie_wissen ohne Entsprechung) |
| Eigenes Wissen als Notiz ergänzen (eine Aussage je Zeile) | Manuelle Fakten | ✗ | fehlt; Ersatz: Verlaufsnotiz |
| Aus Cloud-Ablage auswerten, Ordner verknüpfen | Referenz-Modul Cloud-Ablage | ✗ | laut Masterprompt ersatzlos entfallen |

### Dialoge: Anlegen, Kopieren, Einheiten, Objektwahl

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Neues Objekt: Quelle wählen (Objektaufnahme, Bewertung, Mietanfrage, leer) | Vorbelegung aus Bestandsdaten | ◐ | Aus Objektaufnahme ✓ (`aufnahmeUebernehmen`, RPC `aufnahme_uebernehmen`), aus Akquise-Lead ✓ (`leadZuObjekt`, `src/server/akquise-aktionen.ts`), leer ✓ (`src/app/(app)/objekte/neu`); fehlt: aus Bewertung, aus Mietanfrage, gemeinsamer Auswahldialog |
| Quellen-Picker mit Suche und Statusfilter | Datensatz auswählen | ◐ | nur über die jeweilige Quellseite; fehlt: Picker beim Anlegen |
| Objekt kopieren (Bezeichnung, Nr., Flächen/Preise übernehmen, Eigentümer, als Einheit hängen, Bilder/Grundrisse/Lageplan echt kopieren) | Kopie eines Objekts | ✗ | fehlt |
| Einheiten anlegen (Anzahl, Nummern-Präfix, erste Nummer, Eigentümer verknüpfen, Lageplan mitkopieren, Tabelle Wohnung/Etage/Fläche/Zimmer/Miete/Kaufpreis) | Massenanlage von Einheiten unter einem Stammobjekt | ✗ | fehlt (Spalte `stammobjekt_id` ohne Bedienung) |
| Objektwähler mit Suche (Bezeichnung, Straße, Ort, Nr.) in anderen Modulen | Objektbezug setzen/ändern/entfernen | ◐ | Auswahllisten z. B. in `WertermittlungAnlegen.tsx`, `BildEditor.tsx`, `AufgabeAnlegen.tsx`; fehlt: Suchfeld statt Liste |

### Werbemittel aus der Akte (Unterkomponenten Marketing, Print)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Werbemittel-Kachel am Objekt: öffnet Vorlagen mit Hauptbild und Eckdaten vorbelegt | Einstieg in Marketing aus der Akte | ◐ | Marketing-Seite je Objekt (`src/app/(app)/marketing/page.tsx`, `src/app/api/marketing/[objektId]/[format]/route.ts`; Motive aus Objektdaten und Branding); fehlt: Link aus der Objektakte, Objektfoto im Motiv |
| Instagram-Post Immobilie (Headline, Eckdaten, Preis, Zuschnitt) | Quadrat-Motiv | ◐ | Format `instagram_post` in `src/lib/marketing/vorlagen.ts`; fehlt: Foto, Zuschnitt, Headline-Optionen |
| Instagram-Caption per KI mit Hashtags, kopieren | Bildunterschrift | ✗ | fehlt |
| Karussell-Folgebilder mit Raumbezeichnung, Multi-Export | Mehrere Bilder | ✗ | fehlt |
| Verkauft-Banner, Coming-Soon-Story, Standortkarte (Kartenstil, Pin), Energieausweis-Kachel | Weitere Motive | ✗ | fehlt (Instagram-Story-Format vorhanden, aber ohne diese Varianten) |
| Standort-Picker (Adresse suchen, Pin ziehen, Zoom) | Geokoordinate am Objekt | ◐ | Geokodierung über Infrastruktur-Ermittlung (Spalten `lat`, `lon`); fehlt: Karten-Picker |
| Schaufenster-Aushang (Querformat, QR-Code, Energiekennwerte, Verkauft/Reserviert-Banner, Preis-Modus) | Aushang | ◐ | Aushang-Vorlage (`src/lib/expose/vorlage-aushang.tsx`) und Verkaufsschild-Format; fehlt: QR-Code, Banner, Energieskala |
| Bürobildschirm-Video (9:16, drei Fotos, Übertragung an den Bildschirm) | Referenz-Modul Bürobildschirm | ✗ | laut `docs/SCOPE.md` nicht im Scope |
| Portal-Hauptbild-Vorlage (Foto 4:3, Logo-Box, roter Kreis mit Text, Pfeile) | Erstes Portalbild | ✗ | fehlt als Vorlage (Bild-Editor bietet Zuschnitt, Text, Logo) |
| Video-Export 1:1 / 9:16 (animierte Kachel) | Bewegtbild | ✗ | fehlt |
| KI-Import aus PDF-Exposé (Eckdaten, Headline, Adresse übernehmen) | Vorbefüllen der Vorlage | ✗ | fehlt (KI-Import gibt es nur für Maklerverträge, `vertragImportieren`) |
| Beim Speichern in Marketing-Ablage hochladen | Ablage der Motive | ✗ | fehlt |
| News-Post (Thema aus Briefing, Kernaussagen und Caption per KI) | Allgemeiner Post | ✗ | fehlt |
| Print-Materialien (Visitenkarte, Flyer, Briefpapier, Roll-Up; PDF-Formularfelder mit Profilwerten; Bestell-Link; Vorlagenverwaltung) | Druckvorlagen | ◐ | Flyer A5 und Postkarte aus Objektdaten (`vorlagen.ts`); fehlt: Vorlagenverwaltung mit PDF-Feldzuordnung, Profilwerte, Bestell-Link |

### Word-Ausgaben (Hilfsfunktionen in derselben Referenzkomponente)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Maklervertrag als Word (Verkäufertypen, Erbengemeinschaft, Verbraucher, Provision § 656c, Widerruf, AGB) | Vertragsdokument | ✓ | `src/app/api/dokumente/[art]/[id]/route.tsx` (`format=docx`), `src/lib/dokument/word.ts`, `src/lib/verkauf/vorlagen.ts` (Verkäufertypen, Provisionsmodelle) |
| Vollmacht (Grundbuch, Kataster, Baulasten, Bauakte, Untervollmacht) | Zweites Dokument | ✓ | `vollmacht_mitgenerieren`, `untervollmacht` in `src/lib/verkauf/vorlagen.ts`; `?vollmacht=1` in der Dokumentroute |
| Mietvertrag als Word (Mietbeginn, Kündigungsausschluss, Schlüssel, Mietzusammensetzung, Bank, Neubau-Vorbehalt) | Vertragsdokument | ✓ | Dokumentroute `mietvertrag`, `src/lib/vermietung/mietvertrag.ts`, `src/components/vermietung/MietvertragFormular.tsx` |
| Objektnachweis als Word mit Käuferdaten nach GwG (Geburt, Staatsangehörigkeit, Ausweisnummer), Anrede-Logik, Notar | Nachweisdokument | ◐ | Objektnachweis-Vorlage und Signatur (`src/components/verkauf/ObjektnachweisFormular.tsx`, `objektnachweisAnlegen`); fehlt: GwG-Felder je Käufer, Word-Ausgabe für diese Art |

### Zusammenfassung

Zählung über alle Tabellen: **✓ 29 · ◐ 62 · ✗ 41** (132 Funktionen).

Die zehn wichtigsten Lücken (nach fachlichem Gewicht und Häufigkeit in der täglichen Arbeit):

1. **Formularfelder für vorhandene Spalten** — Etage/Wohnungsnr., Schlafzimmer/Bad/Balkone/Terrassen, Provisionen, Heizkosten/Warmmiete/Kaution, Auftragsart/-ende, Verfügbar ab, Stellplatz, Sonstige Angaben, Adressfreigabe, Ansprechpartner: die Datenbank kennt sie (Migration 20260816200353), `ObjektFormular.tsx` bietet sie nicht an.
2. **Verknüpfungen in der Akte sichtbar machen** — Maklerverträge, Wertermittlungen, Objektaufnahmen und zugeordnete Mails hängen per `objekt_id` am Objekt, erscheinen aber nicht auf `objekte/[id]/page.tsx`; ebenso fehlen sie im Verlauf.
3. **Einheiten und Stammobjekt** — kein Einheiten-Assistent, keine Einheitenliste, keine Stammobjekt-Auswahl; Objekt kopieren fehlt komplett.
4. **KI-Exposé-Prüfung** — Befunde je Seite/Feld mit Korrekturübernahme und Protokoll fehlen.
5. **Bildsteuerung je Kanal** — Exposé-Titelbild getrennt vom Portal-Hauptbild, „nicht im Exposé", intern/extern, manueller KI-Schalter, Bildtitel, nachträgliche Bildart, Drag-and-drop, Massenauswahl, Einzel- und ZIP-Download aus der Galerie, eingebranntes KI-Badge.
6. **Exposé-Anreicherung** — Cover-Slogan, Highlights, Raumaufteilung, automatische Lageplan-Karte mit Ausschnitt, Energieausweis-Seite mit Skala, QR-Code, Rendite-/Kaufnebenkostenseite; Grundrisse/Lagepläne werden in den Vorlagen nicht gesondert platziert; PDF wird nicht als Unterlage abgelegt.
7. **Portal- und Website-Steuerung am Objekt** — Schalter je Portal, Website-/Top-Angebot-/Referenz-Kennzeichen, Übertragungsstatus je Objekt, FTP-Push und Löschauftrag (Phase 2, OpenImmo-Paket vorhanden).
8. **onOffice am einzelnen Objekt** — Connector existiert, aber ohne Schaltfläche „übertragen/aktualisieren", ohne Fremdnummer und ohne Rückmeldung abgelehnter Felder in der Akte.
9. **Objektwissen** — KI-Auswertung der Unterlagen zu Fakten und Warnungen plus manuelle Wissensnotizen fehlen vollständig.
10. **Bedienschutz** — kein Dirty-Status („Ungespeichert"), keine Rückfragen vor Löschen/Entfernen, kein Zeichenzähler am Objekttitel, Energieskala als Bild fehlt.

Bewusst nicht übernommen (Scope): Schaufenster-/Bürobildschirm-Schalter und -Video, Cloud-Ablage-Picker und -Auswertung.


---

## Kachel Verkauf

Quelle: Textinventar der Referenz (VerkaufPage, VertraegePage, ReservierungenPage, ObjektnachweisePage, BewertungPage, UebergabeprotokollPage, NotarLaufzettelPage, SignaturPublicPage, _technik). Abgleich gegen ImmoOffice.ai (Stand 2026-09-04). Pfade relativ zu `/home/user/Immooffice.ai`. Kennzeichen der Referenz (Firma, Standorte, Personen, Domains) sind bewusst durch „Referenz" ersetzt.

Legende: ✓ vorhanden (mit Fundstelle) · ◐ teilweise (was fehlt) · ✗ fehlt. „Scope" = laut `docs/SCOPE.md` / `CLAUDE.md` bewusst ausgeschlossen (Firmen-Cloud-Ablage, Kundenbereich (Referenz-Modul)).

### Übersicht (VerkaufPage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Verkaufs-Übersicht mit sieben Unterkacheln | Maklerverträge, Reservierungen, Objektnachweise, Objektbewertung, Objektaufnahme, Übergabeprotokolle, Notar-Laufzettel als Kacheln mit Untertitel | ◐ | Keine eigene Verkaufs-Übersichtsseite; Einstieg über Navigation (`src/components/Navigation.tsx:28-41`: Objektaufnahmen, Wertermittlung, Verträge, Übergaben, Notar, Vermietung) und Schaltflächen auf `src/app/(app)/vertraege/page.tsx:84-87`. Reservierungen liegen unter `/vermietung/reservierungen`. |
| „Zurück zur Verkaufs-Übersicht" | Rücksprung aus jeder Unterkachel | ◐ | Rücksprünge je Modul vorhanden (`/vertraege`, `/uebergaben`, `/notar`), aber kein gemeinsamer Verkaufs-Einstieg. |
| „Erstellt von · Datum" (CreatedBy) | Ersteller und Datum an jedem Datensatz | ◐ | Spalten `erstellt_von`, `erstellt_am` in `supabase/migrations/20260904090000_verkauf.sql`, `20260818060819_vertraege.sql`; Listen zeigen Datum, nicht den Ersteller. |
| Mit Microsoft anmelden / Firmen-Cloud-Ablage-Datei- und Ordner-Picker | Ablage und Auswahl von Dateien in Firmen-Cloud-Ablage | ✗ | Scope: Firmen-Cloud-Ablage entfällt ersatzlos. |

### Maklerverträge (VertraegePage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Vertragsliste | Karten mit Verkäufer(typ), Objekt, Preis, Laufzeit, Provision, Provisionsmodell | ◐ | `src/app/(app)/vertraege/page.tsx` zeigt Titel, Art, Status, Vertragspartner, Datum; Preis/Laufzeit/Provision nur auf der Detailseite. Kein Filter/keine Suche. |
| Neuer Maklervertrag | Formular für Verkaufs- oder Vermietungsauftrag | ✓ | `src/components/verkauf/MaklervertragFormular.tsx`, `src/server/verkauf-aktionen.ts:120` (`maklervertragAnlegen`), Seite `src/app/(app)/vertraege/vorlage/maklervertrag/page.tsx` |
| Vertragsart Verkauf / Vermietung | Umschaltung Angebotspreis ↔ Mietpreis | ✓ | `MaklervertragFormular.tsx:105-108, 203` |
| Standort / Firma wählen (mehrere Gesellschaften) | Absenderfirma je Vertrag | ✗ | Ein Mandant = eine Auftraggeberfirma (`firmaLaden` in `verkauf-aktionen.ts`); keine Mehrfirmen-Auswahl. |
| Art des Verkäufers: Herr, Frau, Eheleute, Erbengemeinschaft, Firma | Steuert Personenblöcke | ✓ | `VERKAEUFERTYPEN` in `src/lib/verkauf/vorlagen.ts:17-23` (Einzelperson, Eheleute, Mehrere, Erbengemeinschaft, Firma) |
| Erbengemeinschaft: mehrere Erben mit Name, Straße, PLZ, Ort, Pflichtprüfung je Erbe | Personenliste | ✓ | `MaklervertragFormular.tsx:145-170` („Weitere Person"), Schema `personSchema` `vorlagen.ts:33` |
| Firma: Firmenname inkl. Rechtsform, Vertreten durch, Registergericht/HRB | Firmenblock | ✓ | `MaklervertragFormular.tsx:129-135` |
| „Aus Adressbuch" (KontaktWaehler mit Suche nach Name, Firma, E-Mail, Ort, Rollen-Priorität) | Verkäufer aus Kontakten übernehmen | ◐ | Auswahlliste „Auftraggeber aus den Kontakten" (`MaklervertragFormular.tsx:96-99`, `src/lib/verkauf/auswahl.ts`); keine Volltextsuche, keine Rollenpriorität. |
| Objektsuche (ObjektWaehler: Bezeichnung, Straße, Ort, Objekt-Nr.; Objektbezug entfernen) | Objekt verknüpfen | ◐ | Auswahlliste „Objekt aus dem Bestand" belegt Objektangaben und Preis vor (`MaklervertragFormular.tsx:90-93`); keine Suche. |
| Objektfelder: Bezeichnung, Straße & Nr., PLZ/Ort, Angebots-/Mietpreis | Objektangaben im Vertrag | ✓ | `MaklervertragFormular.tsx:176-203`, `objektAngabenSchema` `vorlagen.ts:43`; zusätzlich Grundbuch-Feld (:190) |
| Laufzeit (Monate) | Vertragslaufzeit | ✓ | `MaklervertragFormular.tsx:206` |
| Provision (%) und Provisionsmodell (Courtageteilung Standard u. a.) | Vergütung | ✓ | `MaklervertragFormular.tsx:209-214`, `PROVISIONSMODELLE` `vorlagen.ts:26-30` (Teilung § 656c, nur Verkäufer, nur Käufer); § 656d-Warnung `vorlagen.ts:143`, Server `verkauf-aktionen.ts:127-128` |
| § 3a Eigentumsverhältnisse (Alleineigentümer / Miteigentümer) | Klausel im Vertrag | ✗ | Kein Feld im `maklervertragSchema` (`vorlagen.ts:53-71`). |
| § 5c Verkäufer als Verbraucher (Ja / Nein Unternehmer) | Widerrufsrecht steuern | ✓ | `MaklervertragFormular.tsx:119-122`, Spalte `vertraege.verbraucher` |
| Vollmacht mitgenerieren | Vollmacht als zweites Dokument | ✓ | `verkauf-aktionen.ts:155-165` legt Vertrag Art `vollmacht` mit `daten.zu_vertrag_id` an; PDF-Anlage über `src/app/api/dokumente/[art]/[id]/route.tsx:67-72` |
| Pflichtfeld-Markierung und Fehlerstil | Validierung vor dem Anlegen | ✓ | `pflicht`-Attribut an `Feld`, zod-Schema `vorlagen.ts:53`, Fehlermeldung in `maklervertragAnlegen` |
| Vertrag erzeugen (Word-Dokument wird erstellt) | Text aus Vorlage | ✓ | `maklervertragText()` `vorlagen.ts:152`, Text bleibt bis zur ersten Unterschrift editierbar (`intern.vertrag_text_schuetzen`, Migration vertraege.sql:92) |
| Bearbeiten (Formular erneut öffnen) | Strukturierte Felder ändern | ◐ | `src/components/vertraege/VertragBearbeiten.tsx` ändert Titel, Vertragstext, Verbraucher, Daten; die Vorlagenfelder (`daten`) werden nicht erneut als Formular geöffnet. |
| Löschen (nur eigene Verträge, sonst Chef) | Vertrag entfernen | ✗ | Kein `vertragLoeschen` in `src/server/vertrag-aktionen.ts`; nur „Zurückziehen" (:167). |
| VertragExportModal: Format PDF/Word, „Vollmacht mit erzeugen" (PDF angehängt, Word zweite Datei) | Export | ✓ | `src/app/(app)/vertraege/[id]/page.tsx:144-147` (PDF mit Vollmacht, Word), Route `route.tsx:30, 58-75`, `src/lib/dokument/word.ts`; Vollmacht als eigener Vertrag hat eigenen Word-Export |
| Original-PDF anzeigen (bei importierten Verträgen) | Ursprungsdokument öffnen | ◐ | `original_pfad` gespeichert (`verkauf-aktionen.ts:231-232`), Marke „Original-PDF abgelegt" (`vertraege/[id]/page.tsx:154`); kein Öffnen-Link. |
| ✍ Zur Unterschrift senden | Signaturvorgang starten | ◐ | `vertragVersenden` (`vertrag-aktionen.ts:121`) erzeugt Link; kein Mailversand (siehe Abschnitt Signatur). |
| Eigentümer-Portal (Eigentümer einladen, Magic-Link, Dokumente, Chat, KI-Dateinamen, Firmen-Cloud-Ablage-Push) | Portalzugang aus dem Vertrag | ✗ | Scope: Kundenbereich (Referenz-Modul) entfällt. Kundenbereich (`src/components/portal/Kundenbereich.tsx`) kennt Dokumentart „Vertragsunterlagen" (`src/lib/portal/typen.ts:38`), aber keine Einladung aus dem Vertrag. |
| Checkliste am Vertrag (Vorlage „Standard Verkauf", Pflicht-Items, weitere Items ergänzen) | Objektunterlagen-Checkliste je Vertrag | ◐ | Checklisten mit `vertrag_id` (`src/server/checklisten-aktionen.ts:120-123`, `src/lib/checklisten.ts:27`), Vorlage „Unterlagen Verkauf"; kein Knopf auf der Vertragsseite, Einstieg über Menü Checklisten. |
| Behörden-Anfragen vorbereiten (Behörde per PLZ finden, Mehrdeutigkeit auflösen, Mail-Entwürfe mit Platzhaltern im Posteingang, Online-Hinweise Geoportal/Altlasten) | Unterlagen bei Ämtern anfordern | ◐ | Behördenbriefe als Briefvorlagen mit Objekt-/Eigentümerdaten (`src/server/briefe-aktionen.ts:17, 61`, `src/components/briefe/BriefAnlegen.tsx:13`, Link `objekte/[id]/page.tsx:438`); keine PLZ→Behörde-Zuordnung, keine Entwürfe je Checklistenpunkt, keine Online-Hinweise (FUNKTIONSABGLEICH → R1). |
| 📄 Aus PDF importieren (KI liest Vertrag, Bestätigungsbox, „Vor dem Anlegen anpassen") | Bestandsvertrag einlesen | ✓ | `vertragImportieren` `verkauf-aktionen.ts:212` (5 Credits mit Modellzugang, sonst Mustererkennung), Felder `src/lib/verkauf/import.ts`, Formular „PDF-Datei … Einlesen" `MaklervertragFormular.tsx:69-78`; Ergebnis belegt nur vor. |
| Import: Original-PDF im Storage ablegen | Beleg speichern | ✓ | `verkauf-aktionen.ts:220-221` (`vorgangsPfad`) |
| Import: Eigentümer + Personen anlegen und einladen, Verknüpfung Eigentümer↔Vertrag | Portalnutzer aus Import | ✗ | Scope (Kundenbereich (Referenz-Modul)); auch kein automatisches Anlegen eines Kontakts aus dem Import. |
| Eigentümer-Personen verwalten (Hauptperson, Benachrichtigungen, Link senden) | Portalpersonen | ✗ | Scope. |
| Verbrauchsausweis-Antrag (6 Schritte, KI liest Abrechnungen, KI-Schätzung Kennwert, ZIP, Übergabe an Energieberater) | Energieausweis-Beschaffung über Portal | ◐ | Nur Gegenstück „Energieausweis hochladen und auslesen" (`src/components/werkzeuge/EnergieausweisKarte.tsx`, 2 Credits) — vorhandenen Ausweis auslesen, keine Antragstrecke, kein ZIP. |
| Grundriss-Editor (Zeichenblatt, LiDAR-Scan laden, PNG/PDF am Objekt speichern) | Grundriss erstellen | ✗ | Keine Fundstelle (`grep -ri grundriss src` ohne Editor). |
| Raumscan (LiDAR-App, Räume benennen, Scan-Qualität, Kontrollmaße, Wohnfläche berechnen, JSON/SVG) | Aufmaß | ◐ | Wohnflächenrechner ohne Scan (`src/components/werkzeuge/WohnflaechenRechner.tsx`, Export über `route.tsx:108`); kein LiDAR, kein Raumscan. |
| Chat mit Eigentümer (Anhänge, Realtime) | Kommunikation im Portal | ✗ | Scope. |

### Objektnachweise (ObjektnachweisePage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste der Objektnachweise (Käufer, Objekt, Kaufpreis, Provision, Notar) | Übersicht | ◐ | Als Art „Objektnachweis" in der Vertragsliste (`vertraege/page.tsx`); keine eigene Liste, keine Notar-Spalte. |
| Neuer Objektnachweis | Formular | ✓ | `src/components/verkauf/ObjektnachweisFormular.tsx`, `objektnachweisAnlegen` `verkauf-aktionen.ts:176`, Seite `vertraege/vorlage/objektnachweis/page.tsx` |
| Standort / Firma | Absenderfirma | ✗ | Wie Maklervertrag: eine Firma je Mandant. |
| Datum des Kaufangebots | Pflichtdatum | ◐ | Nur „Besichtigt am" (`ObjektnachweisFormular.tsx:77`); kein Angebotsdatum. |
| Anzahl Käufer 1–4 | Mehrere Käuferblöcke | ✓ | „Weiterer Interessent" (`ObjektnachweisFormular.tsx:64`), `kaeufer[]` im `objektnachweisSchema` `vorlagen.ts:74` |
| Käuferfelder: Anrede, Titel, Vorname, Nachname, Straße, PLZ, Ort | Personendaten | ◐ | Anrede, Vor- und Nachname (ein Feld), Straße, PLZ, Ort (`:57-61`); kein Titel. |
| Geburtsdatum, Geburtsort, Staatsangehörigkeit, Ausweis-Nr., Ausweis gültig bis | GwG-Daten | ✗ | Nur Häkchen „Ausweis geprüft (Geldwäschegesetz)" (`:85`, `ausweis_geprueft`). |
| Personalausweis-Scanner (Einwilligung, Vorder-/Rückseite, MRZ-OCR, „In Formular übernehmen") | Ausweisdaten erfassen | ✗ | Keine OCR-Komponente (`grep -ri "MRZ\|tesseract" src` ohne Treffer). |
| „Aus Adressbuch" je Käufer | Kontakt übernehmen | ◐ | Eine Auswahlliste „Interessent aus den Kontakten" belegt Käufer 1 (`:48-51`); nicht je Käufer, keine Suche. |
| 📋 Aus Maklervertrag übernehmen (Objektbezeichnung, Adresse, Kaufpreis, Standort), Verknüpfung lösen | Grunddaten koppeln | ◐ | Objekt aus dem Bestand belegt Objekt und Preis (`:42-45`); keine Übernahme aus dem Maklervertrag, keine Verknüpfungsanzeige. |
| Objektbezeichnung, Straße, PLZ/Ort, Kaufpreis, Käufer-Provision (% netto) | Objekt- und Provisionsangaben | ✓ | `ObjektnachweisFormular.tsx:67-76`; Hinweis § 656c (gleiche Höhe wie Verkäufer) |
| Notar (Name, Adresse) | Notariat im Nachweis | ✗ | Nicht im Schema; Notar nur im Laufzettel. |
| Word (Vorlage) | Export | ✓ | Route `route.tsx` (`format=docx`), Link `vertraege/[id]/page.tsx:147` |
| ✍ Zur Unterschrift senden (Käufer, danach Verkäufer bestätigen den Nachweis) | Zweistufige Signatur | ◐ | Ein Link je Vertrag (`vertragVersenden`); keine Verkäufer-Gegenzeichnung (siehe Signatur). |
| Bearbeiten / Löschen (nur eigene) | Pflege | ◐ | Text/Titel über `VertragBearbeiten.tsx`; kein Löschen. |
| 📄 Aus PDF importieren (ObjektnachweisImportModal, KI-Vorschau, anlegen) | Bestandsnachweis einlesen | ✗ | `vertragImportieren` kennt nur `zweck: "maklervertrag"` (`verkauf-aktionen.ts:242`). |
| Text-Export (.txt) mit Objekt und Käufern | Dateiexport | ✗ | Stattdessen PDF/Word. |

### Reservierungen (ReservierungenPage, Neubau)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste mit Statusfilter und Suche (Käufer, Adresse, Projekt, WE-Nr.) | Übersicht | ◐ | Statusfilter `src/app/(app)/vermietung/reservierungen/page.tsx:31-33`; keine Textsuche. |
| Status Entwurf → Versendet → Unterschrieben → Bezahlt → Kauf vollzogen → Storniert | Vorgangsstatus | ◐ | `angefragt/aktiv/abgelaufen/aufgehoben/abgeschlossen` (`supabase/migrations/20260904100000_vermietung.sql:243-244`); Unterschrift über Vertragsstatus, Bezahlung über `gebuehr_bezahlt_am`. |
| + Neue Reservierung: Absender-Firma, Käufer-Typ (Einzelperson, Eheleute, GbR, Sonstige), Name(n), Adresse | Käufer erfassen | ◐ | Interessent aus Kontakten (`src/components/vermietung/Reservierungen.tsx:38`); kein Käufertyp, keine Absenderfirma. |
| Objekt: Projektname, WE-Nr., Etage, Wohnfläche, Objektart, Kaufpreis, Adresse | Einheitsdaten | ◐ | Objekt aus dem Bestand (`:37`), Einheiten über Projekte-Modul; keine freien Neubau-Felder im Formular. |
| Reservierungsgebühr brutto, gilt bis, Zahlungsfrist (Werktage), Ort/Datum der Unterzeichnung, interne Notiz | Konditionen | ◐ | Gebühr, „Reserviert bis" (Vorgabe 28 Tage), „auf Provision anrechnen", Notiz (`:40-43`); Zahlungsfrist, Ort/Datum der Unterzeichnung fehlen. |
| 📄 Reservierungs-PDF / 📝 Word erzeugen | Dokument | ✓ | Vereinbarung entsteht als Vertrag (`reservierungAnlegen` `src/server/vermietung-aktionen.ts:496-560`), PDF/Word über `route.tsx` Art `vertrag`, Link `Reservierungen.tsx:75` |
| ✍️ E-Signatur (Käufer erhält Link per Mail) | Signatur starten | ◐ | Link über Vertragsseite; kein Mailversand. |
| 💰 Rechnung anlegen aus Reservierung (Entwurf, Nummernkreis, Rechnung stellen, bezahlt markieren, PDF) | Gebührenrechnung | ◐ | Rechnungsmodul vorhanden (`src/server/rechnungen-aktionen.ts`, ANLEITUNG 10f), aber keine Verknüpfung aus der Reservierung (`grep -i reservierung src/components/rechnungen` ohne Treffer). |
| Chef-Freigabe per Passwort (Rechnung anlegen/stellen/bezahlt) | Vier-Augen-Schranke | ✗ | Stattdessen Rollenrechte (`rechtErzwingen`); kein Passwortdialog. |
| Rechnungs-Stammdaten je Nutzer (Präfix, Startnummer, Zahlungsziel, Kleinunternehmer, Texte) | Absender | ✓ | Absender & Nummernkreis, persönliche Absender (ANLEITUNG 10f, `src/lib/rechnungen.ts`) |
| Hinweis „aus Kundenbereich (Referenz-Modul)-Anfrage erzeugt" | Herkunft | ✗ | Scope (Kundenbereich (Referenz-Modul)). |
| Anzeige „Reserviert bis", „Gebühr", Bearbeiten | Kartenansicht | ✓ | `Reservierungen.tsx:60-100` (Fristwarnung „läuft bald ab", Gebühr bezahlt/offen, Aufheben mit Grund, Verlängern); Fristablauf per Tagesjob `src/lib/jobs/worker.ts:143` (`reservierungen_ablaufen`) |

### Objektbewertung / Einwertung (BewertungPage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste der Einwertungen (Titel, €/m², Bearbeiten, Löschen) | Übersicht | ✓ | `src/app/(app)/wertermittlung/page.tsx`, `wertermittlungLoeschen` `src/server/wertermittlung-aktionen.ts:204` |
| Neue Einwertung / bearbeiten | Anlegen | ✓ | `src/components/wertermittlung/WertermittlungAnlegen.tsx`, `wertermittlungAnlegen` (:47), Detail `wertermittlung/[id]/page.tsx` |
| ✨ Aus Objektaufnahme erstellen (Auswahl, KI leitet Stammdaten/Vorteile/Nachteile/Zielgruppen ab) | Aufnahme → Einwertung | ✗ | Aufnahme kennt nur „Objekt daraus anlegen" und „Akquise-Lead daraus anlegen" (`src/app/(app)/aufnahmen/[id]/page.tsx:138-142`). |
| Stammdaten: Objektbezeichnung, Adresse, Hauptbild (Titelfolie) | Kopf | ◐ | Bezeichnung, Stichtag, Objekt, Eigentümer (`WertermittlungAnlegen.tsx:50-82`); kein Bild. |
| Ansprechpartner aus dem Team (Foto, Funktion, Telefon) | Präsentationsseite | ✗ | Keine Fundstelle. |
| Rahmendaten: Objektart, Wohnfläche, Grundstück, Baujahr, Nutzfläche, Bodenrichtwert, Renovierungen, Besonderheiten, Hausbild | Objektdaten | ◐ | Wohnfläche, Grundstück/Bodenrichtwert, Alter im Rechenblatt (`wertermittlung/[id]/page.tsx:184, 214-217, 264`); Objektart, Baujahr, Renovierung nur am verknüpften Objekt. |
| Merkmale: Vorteile (max. 15), Nachteile (max. 10), Zielgruppen aus Listen + Freitext | Argumentation | ✗ | Keine Fundstelle. |
| Vergleichsobjekte (Foto, PLZ/Ort, Objektart, Wohn-/Grundstücksfläche, Preis, €/m² manuell/berechnet, Anmerkung; Layout nach Anzahl) | Vergleichswert | ◐ | `src/components/wertermittlung/Vergleichsobjekte.tsx`: Bezeichnung, Kaufpreis, Wohnfläche, Anpassung %; Median-Rechnung `src/lib/wertermittlung.ts:83`; keine Fotos, kein Ort/Objektart. |
| Preisentwicklung: Diagramm-Serien, Screenshot, ✨ KI liest Diagramm aus | Marktdaten | ✗ | Keine Fundstelle. |
| Marktpreiseinschätzung-Texte (Preisbegründung, Einwände & Antworten, vorgemerkte Interessenten, Studienjahr) | PDF-Textseiten | ✗ | Keine Fundstelle. |
| Unterlagen-Checkliste (wir beschaffen / Eigentümer liefert) | Seite im PDF | ◐ | Checklisten-Modul mit Vorlage „Unterlagen Verkauf" (`src/lib/checklisten.ts`), nicht Teil der Wertermittlung. |
| Gutachten hochladen (PDF) + ✨ KI wertet Posten/Verfahren aus | KI-Auslese | ✗ | Keine Fundstelle. |
| Preisherleitung: Posten mit Betrag/Abzug | Zu-/Abschläge | ◐ | Nur Anpassung in % je Vergleichsobjekt; keine Postenliste. |
| Zusätzliche Seiten (Kapitel-Trenner, Bild/Text-Layouts, Einfügepunkt, Quellenangabe) | Freie PDF-Seiten | ✗ | Keine Fundstelle. |
| Kaufpreisempfehlung: Verfahren, realistisches Volumen, Angebotspreis, Vermarktungsdauer, Zusatzzeilen, Prämissen-Fußnote | Ergebnisfolie | ◐ | Führendes Verfahren + Begründung (`src/components/wertermittlung/Einordnung.tsx`, `einordnungSpeichern` :174), Spanne `wertermittlung.ts:355`; Startpreis/Vermarktungsdauer nur im Akquise-Preis-Finder (`src/components/akquise/LeadDossier.tsx`). |
| Sachwertberechnung ImmoWertV (Bodenwert, Gebäudeart NHK 2010 + Standardstufe, BGF, GND, Modernisierungsgrad, Baupreisindex, Regionalfaktor, Sachwertfaktor, besondere Anlagen, Live-Rechenweg) | Sachwert | ◐ | `sachwert()` `wertermittlung.ts:267`, Felder `wertermittlung/[id]/page.tsx:244-284` (BGF, Herstellungskosten, GND, Alter, Bodenwert, Außenanlagen, Sachwertfaktor); keine NHK-Gebäudeartenliste, kein Baupreisindex/Regionalfaktor/Modernisierungsgrad. |
| Bodenrichtwert-Link (Landes-Bodenrichtwertportal) | Recherchehilfe | ◐ | Bodenwert = Bodenrichtwert × Fläche (`bodenwert()` `wertermittlung.ts:338`, Hinweis `page.tsx:217`); kein Portal-Link. |
| Ertragswertverfahren § 28 ImmoWertV (Rohertrag, Bewirtschaftungskosten %, Bodenwert, Liegenschaftszins, RND, Vervielfältiger, besondere Merkmale, Warnung negativer Reinertrag) | Ertragswert | ✓ | `ertragswert()` `wertermittlung.ts:175`, `vervielfaeltiger()` :165, Felder `page.tsx:201-227`; Bewirtschaftungskosten als Betrag statt %-Aufteilung |
| Screenshots für Sachwert-/Ertragswert-/Finanzierungsfolie | Bildersatz in PPTX | ✗ | Keine Präsentation. |
| Finanzierungskosten-Rechner (Nebenkosten %, Eigenkapital, Zins, Tilgung, Rate, Laufzeit) | Live-Rechner | ✗ | Nur Finanzierungsangabe im Notar-Laufzettel; kein Rechner (`grep -i finanzierung src/lib/wertermittlung.ts` ohne Treffer). |
| Courtage Käufer/Verkäufer (Folie) | Provisionsfolie | ✗ | In Wertermittlung nicht vorhanden (Provision nur im Maklervertrag). |
| „PDF herunterladen (neu)" – Marktpreiseinschätzung im eigenen Design | PDF-Export | ✗ | `route.tsx` kennt keine Art `wertermittlung`; Wertindikation-PDF nur in der Akquise (`route.tsx:93`). |
| „PPTX herunterladen" (Vorlagen-Präsentation, Bildaustausch) | Präsentation | ✗ | `grep -ri pptx src` ohne Treffer. |
| In Firmen-Cloud-Ablage ablegen (Ordner-Mapping) | Ablage | ✗ | Scope. |
| In die Akquise überführen (Lead in erster Stufe, Kontakt verknüpfen, Wert/Provisionserwartung) | Akquise-Kopplung | ◐ | Umgekehrter Weg: Wertindikation im Lead-Dossier (`src/components/akquise/LeadDossier.tsx`); keine Überführung aus der Wertermittlung. |
| Objekt aus Einwertung anlegen / bestehendem Objekt zuordnen, Bilder kopieren, Überschreiben-Schalter (EwUebernahmeDialog) | Einwertung → Objekt | ✗ | Nur Verknüpfung `objekt_id` beim Anlegen; keine Datenübernahme. |
| Externer Bewertungsdienst: Zugangsdaten hinterlegen, anzeigen, protokollieren | Fremdzugang | ✗ | Zugangsdaten nur für Postfach/Integrationen (`src/server/integrations-aktionen.ts`). |
| → Objektaufnahme (Verweis) | Sprung zur Aufnahme | ◐ | Eigenes Modul `/aufnahmen`; kein Querverweis aus der Wertermittlung. |
| Bild-Upload per Ziehen / Strg+V | Bilder in Formular | ✗ | Keine Bilder in der Wertermittlung. |

### Objektaufnahme (Verweis aus Verkauf; ObjektaufnahmeMaske in BewertungPage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Aufnahmebogen in 10 Abschnitten (Allgemein, Lage, Grundstück, Gebäude, Flächen, Ausstattung, Zustand, Unterlagen, Eigentümer-Hinweise, interne Maklernotizen) | Erfassung vor Ort | ◐ | `src/components/AufnahmeFormular.tsx`: Termin/Objekt, Eigentümer, Kerndaten, Zustand je Bauteil (`ZUSTANDSFELDER` `src/lib/aufnahme.ts:34`), Heizung, fehlende Unterlagen, Notizen. Fehlen: Lage/Infrastruktur, Grundbuch/Flur, Bauweise/Dach/Keller, Bodenbeläge/Besonderheiten, Nutzung/Miete, getrennte interne Maklernotizen (Marktwert, Fototermin). |
| 🎤 Sprachmemo aufnehmen/hochladen → KI verteilt auf Felder, „Felder übernehmen/Verwerfen" | KI-Auslese | ✗ | `grep -ri "MediaRecorder\|sprachmemo" src` ohne Treffer. |
| Fotos je Abschnitt (mehrere, Löschen) | Bilddokumentation | ✗ | Keine Fotos in der Aufnahme; Bilder erst am übernommenen Objekt. |
| Unterlagen-Häkchen (welche liegen vor) | Unterlagenstatus | ✓ | `unterlagen_offen` (`AufnahmeFormular.tsx:263-279`, `aufnahme-aktionen.ts:94`), bei Übernahme Aufgaben je fehlender Unterlage |
| Aus Aufnahme: Objekt anlegen | Übernahme in Bestand | ✓ | `aufnahmeUebernehmen` `src/server/aufnahme-aktionen.ts:205`, RPC `aufnahme_uebernehmen` (Migration objektaufnahme.sql:120) |
| Aus Aufnahme: Akquise-Lead anlegen (Termin, Adresse, Kontakt) | Übernahme in Akquise | ✓ | `leadAusAufnahme` (`aufnahmen/[id]/page.tsx:140`) |
| 💾 Speichern, Schließen | Pflege | ✓ | `aufnahmeSpeichern` :163, zusätzlich `aufnahmeVerwerfen` :233 |

### Übergabeprotokolle (UebergabeprotokollPage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste Verkauf (Übergabe, Rückgabe) / Vermietung (Einzug, Auszug) mit Status, Öffnen, Löschen | Übersicht | ✓ | `src/app/(app)/uebergaben/page.tsx`, `uebergabeLoeschen` `verkauf-aktionen.ts:382`, Tabelle `uebergabeprotokolle` (verkauf.sql:28) |
| Neues Protokoll (Typ wählen) | Anlegen | ✓ | `uebergaben/page.tsx:48-60`, `uebergabeAnlegen` :264 (Prüfung Bereich ↔ Art, DB-Constraint `uebergabe_typ_passt`) |
| Assistent mit 7 Schritten (Stammdaten, Schlüssel, Zähler, Räume, Sonstiges, Unterschriften, Abschluss), Zurück/Weiter | Schrittführung | ✓ | `SCHRITTE` `src/lib/verkauf/uebergabe.ts:14`, `src/components/verkauf/UebergabeAssistent.tsx:91-97, 271-272` |
| Stammdaten: Datum, Uhrzeit, Objektadresse, Etage, Lage, Parteien mit Name, Anschrift, „anwesend" | Grunddaten | ✓ | `UebergabeAssistent.tsx:78-84, 104-111` (zusätzlich „Vertreten durch") |
| 📋 Aus Mietvertrag befüllen | Vorbelegung Vermietung | ◐ | Mietvertrag wählbar (`uebergaben/page.tsx:29`), aber `uebergabeAnlegen` belegt Parteien nur bei Kontext Verkauf (`verkauf-aktionen.ts:285-291`). |
| 📋 Verkäufer aus Maklervertrag / 📋 Käufer aus Objektnachweis (zwei getrennte Übernahmen) | Vorbelegung Verkauf | ◐ | Ein Vertragsfeld: entweder Maklervertrag (Übergeber) oder Objektnachweis (Übernehmer), nicht beide; Objekt belegt Adresse/Etage. |
| Schlüssel: Art, Anzahl, Bemerkung, Foto je Schlüsselart (Kamera) | Schlüsselübergabe | ◐ | Art (8 Arten `uebergabe.ts:24`), Anzahl, Bemerkung (`UebergabeAssistent.tsx:118-133`); kein Foto je Schlüssel. |
| Zähler: Art, Zählernummer, Stand, Einheit, Bemerkung, „Foto + KI auslesen" / „Nur Foto anhängen" | Zählerstände | ✓ | `UebergabeAssistent.tsx:137-171` (Kamera `capture="environment"`), `zaehlerFotoAuslesen` `verkauf-aktionen.ts:394` (1 Credit, Reservierung/Freigabe), `ZAEHLER_ARTEN` `uebergabe.ts:34`; Bemerkungsfeld fehlt |
| Räume: Vorschlagsliste, eigener Raum, Zustandsnotizen, Fotos/Kamera je Raum | Raumzustand | ◐ | Raum, Zustand (3 Stufen), Mängel-Text, Standardräume (`:175-197`); Fotos nur über Objektunterlagen Art „Übergabefoto", nicht am Raum. |
| Sonstiges: Rauchmelder (vom Vermieter/Mieter/nicht vorhanden, Anzahl, Funktionstest), schimmelfrei, Hausordnung, Bedienungsanleitungen, Sonderabreden, Bemerkungen | Zusatzangaben | ◐ | Rauchmelder Anzahl + Funktion, Schimmel (+ Wo), Hausordnung, Anleitungen, Sonderabreden (`:201-217`); fehlt: wer die Rauchmelder stellt, separates Bemerkungsfeld. |
| Unterschriften digital (Tablet, Finger, Vollbild-Overlay mit Drehung, Löschen, Übernehmen) | Signatur vor Ort | ◐ | Canvas `src/components/verkauf/Unterschriftsfeld.tsx` (Löschen, PNG-Data-URL), Hinweis eIDAS einfache Signatur (`:242`); kein Vollbild/keine Rotation. |
| Abschluss: Pflichtfeld-Prüfung, Hinweise zu Optionalem, Status Entwurf/Abgeschlossen, automatisches Speichern vor PDF | Finalisierung | ✓ | `fehlendeAngaben()` `uebergabe.ts:127`, `uebergabeAbschliessen` :357, `UebergabeAssistent.tsx:246-263`; Unveränderlichkeit per Trigger `intern.uebergabe_schuetzen` (verkauf.sql:70) |
| PDF erzeugen (Firmenkopf, alle Abschnitte, Unterschriften) | Dokument | ✓ | Route `route.tsx:75-81` (`protokollAlsDokument` `uebergabe.ts:152`); zusätzlich Word (`:255`) |
| → Ins Eigentümer-Portal senden (PDF + Benachrichtigung) | Portal-Push | ✗ | Scope (Kundenbereich (Referenz-Modul)). |
| Aktivitätseintrag am Vorgang | Verlauf | ✓ | `verlaufEintragen` `verkauf-aktionen.ts:375` (Tabelle `aktivitaeten`) |
| KI-Bildbearbeitung (Retusche, Himmel, Home Staging, Szenen, Vorher/Nachher, Historie, Marketing-Ablage) — in der Datei enthalten, fachlich Marketing | Bild-KI | ✓ | Bild-Editor → KI (`src/server/bild-aktionen.ts`; FUNKTIONSABGLEICH Kachel 9: Himmel, Störendes entfernen, Home Staging, Optimierung, Vorher/Nachher, Versionen mit Kennzeichnung); Szenen (Winter/Weihnachten/Nacht/Golden Hour) und Personen hinzufügen/entfernen fehlen |

### Notar-Laufzettel (NotarLaufzettelPage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste, Neuer Laufzettel, Öffnen, Löschen | Übersicht | ✓ | `src/app/(app)/notar/page.tsx`, `laufzettelLoeschen` `verkauf-aktionen.ts:627`, Tabelle `notar_laufzettel` (verkauf.sql:91) |
| Assistent mit 8 Schritten (Immobilie, Verkäufer, Käufer, Kaufpreis & Bank, Sonstiges, Anhänge, Beauftragung, Abschluss), Zurück/Weiter | Schrittführung | ✓ | `SCHRITTE` `src/lib/verkauf/laufzettel.ts:10`, `src/components/verkauf/LaufzettelAssistent.tsx:120-127, 301-302` |
| Bezeichnung, Status Entwurf → Bereit für Notar → An Notar versendet → Abgeschlossen | Kopf und Status | ✓ | `STATUS` `laufzettel.ts:21`, `laufzettelStatus` :512, UI `:130, 289-291` |
| I. Immobilie: Anschrift, Grundbuchdaten (Amtsgericht, Grundbuch von, Blatt), mehrere Grundbuchblätter, mehrere Flurstücke (Gemarkung, Flur, Flurstück, Wirtschaftsart) | Grundbuch | ◐ | Ein Blatt, ein Flurstück (`Immobilie` `laufzettel.ts:68-94`, UI `:134-139`); keine Mehrfachblätter/-flurstücke, keine Wirtschaftsart. |
| Art des Kaufgegenstandes, Bebauung, Baujahr, Nutzung, Wohnfläche, Zimmer | Objektbeschreibung | ◐ | bebaut/unbebaut, Größe (`:139-141`); Baujahr, Nutzung, Wohnfläche, Zimmer fehlen. |
| Mietverhältnis (Mieter, Mietbeginn, Kaltmiete, NK, Kaution, Vorkaufsrecht) | Vermietete Objekte | ◐ | `vermietet`, `mieter_name`, `mieter_vorkaufsrecht`; Mietbeginn/Miete/Kaution fehlen. |
| Eigentumswohnung: Sondereigentum-Nr., Hausgeld, Rücklage, Sondernutzungsrechte, Stellplatz separates Blatt, Verwalter | WEG-Angaben | ◐ | SE-Nr., Miteigentumsanteil, Sondernutzungsrechte, Verwalter (`:145-149`); Hausgeld, Rücklage, Stellplatz-Grundbuch fehlen. |
| Bewegliche Gegenstände mitverkauft / nicht mitverkauft (Räumung/belassen) | Zubehör | ✓ | `kaufpreis.davon_bewegliche`, `bewegliche_art` (`:166-167`), `raeumung` (`:184-187`) |
| Fertigstellung < 5 Jahre, Denkmalschutz, Bodendenkmal, Energieausweis liegt vor | Merkmale | ✓ | `Immobilie` Felder `denkmalschutz`, `bodendenkmal`, `fertiggestellt_5_jahre`, `energieausweis_liegt_vor` (`laufzettel.ts:88-91`) |
| KI-Auswertung des Grundbuchauszugs füllt Felder automatisch, legt weitere Blätter an, zeigt Abteilung III (Grundschulden) | KI → Formular | ◐ | `laufzettelAnhangHochladen` `verkauf-aktionen.ts:539-575` liest Amtsgericht, Blatt, Gemarkung, Flur, Flurstück, Eigentümer, Lasten, Grundschulden (5 Credits); Ergebnis nur als Text am Anhang, keine Feldbefüllung. |
| II./III. Parteien: Privatperson/Gesellschaft, Anrede, Vorname(n), Nachname, Geburtsname, Geburtsdatum, Staatsangehörigkeit, Steuer-ID, Familienstand, Gesellschaftsdaten (Name, Rechtsform, Sitz, Register), Anschrift, E-Mail, Telefon | Personendaten | ◐ | `Partei` `laufzettel.ts:38-66`, UI `:64-98`; Staatsangehörigkeit fehlt. |
| Ehe-Angaben: Ehepartner, Ehevertrag, Auslandsbezug, Güterstand, Eheschließung, erster Wohnsitz | Güterrecht | ◐ | Drei Häkchen (`ehepartner_beteiligt`, `ehevertrag`, `ehe_auslandsbezug`); Güterstand, Datum, Wohnsitz fehlen. |
| Weitere Angaben: Dolmetscher (Sprache), körperlich eingeschränkt, PEP, fremde Rechnung, Unternehmer, Landwirt | Notarpflichtfragen | ◐ | `:101-108` (Dolmetscher, Einschränkung, PEP, Treuhand, Unternehmer, Freitext); Landwirt fehlt. |
| 📋 Aus Objektnachweis / Maklervertrag übernehmen, ➕ weitere Personen, leere Käufer/Verkäufer hinzufügen | Vorbelegung | ✓ | `laufzettelAnlegen` `verkauf-aktionen.ts:430-476` (Objekt, Maklervertrag → Verkäufer/Preis/Provision, Objektnachweis → Käufer), „Weitere Person" `:113`, Link aus Vertrag `vertraege/[id]/page.tsx:150` |
| Erwerbsverhältnis (gleiche/ungleiche Teile, GbR, Quoten je Käufer) | Erwerbsquoten | ◐ | Freitext `erwerb_quoten` (`:170`); keine Auswahl gleich/ungleich/GbR. |
| IV. Kaufpreis: Art, Gesamt, Anteil bewegliche Sachen, Aufteilung Grund/Gebäude, bereits geleistete Zahlungen | Preisangaben | ✓ | `Kaufpreis` `laufzettel.ts:96-113`, UI `:165-172` |
| Verkäufer-Bankkonten (mehrere; Inhaber, IBAN, Bank; Hinweis IBAN-Namensabgleich) | Zahlungsempfänger | ✗ | Kein Bankkonto des Verkäufers im Schema. |
| Käufer finanziert: Bank Name, Anschrift, Ort | Finanzierung | ✓ | `finanzierung` (Eigenmittel/Bank/gemischt), `bank_name`, `bank_anschrift` (`:173-179`) |
| Zeitpunkt Kaufpreiszahlung/Übergabe (schnellstmöglich / nach Datum), Grundschulden + gewünschte Regelung, Darlehensnummer | Fälligkeit/Lasten | ✓ | `zahlungszeitpunkt`, `raeumung`/`raeumung_bis`, `lasten_belassen`, `grundschuld_regelung` (`:171, 179-187`) |
| Vermittlung durch Makler: GmbH auswählen (Stammdaten), Maklername, Courtage, E-Mail, Telefon | Maklerangaben | ◐ | Firma aus Mandant, Provision Käufer/Verkäufer (`:200-201`, aus Maklervertrag vorbelegt), Ansprechpartner (`:262-264`); keine Mehrfirmen-Auswahl. |
| V. Sonstiges: Teilfläche/Vermessungskosten (Verkäufer/Käufer/je hälftig), Erschließung, genehmigungsbedürftige Baumaßnahmen, letzte Besichtigung, Verwalter, Verwandtschaft, Reparaturen durch Verkäufer, Besonderheiten, Anmerkungen an Notar | Zusatzangaben | ◐ | Vermessungskosten (`:188-189`), Baumaßnahmen/Besichtigung (`:155-156`), Verwalter, Verwandtschaft (`:203`), Reparaturen, Besonderheiten (`:204-205`); Teilfläche-Häkchen und Erschließungsregelung fehlen. |
| Anhänge: Kategorien, Datei hochladen, ✨ KI auswerten (PDF und Bilder), 🔄 erneut auswerten, Blattansicht, Entfernen | Dokumente | ◐ | 11 Kategorien `ANHANG_KATEGORIEN` `laufzettel.ts:24-36`, Upload bis 25 MB (`:231-237`), Entfernen (`laufzettelAnhangLoeschen` :593); KI nur für PDF und nur beim Upload, kein erneutes Auswerten, keine Bild-OCR. |
| ☁ Firmen-Cloud-Ablage-Ordner zuordnen, Datei aus Firmen-Cloud-Ablage übernehmen | Fremdablage | ✗ | Scope. |
| Beauftragung: Kanzlei, Notar, E-Mail, Telefon, Anschrift, Ausfüllender (Name, E-Mail, Telefon), Entwurf beauftragen / nur Vorabinfo, Entwurf-Zustellung an Verkäufer/Käufer je per Mail/Post, Kopie an Makler, Besprechungstermin | Auftrag ans Notariat | ◐ | `Beauftragung` `laufzettel.ts:128-137`, UI `:196-199, 249-264` (Kanzlei, Notar, Anschrift, E-Mail, Art, Versandweg, `entwurf_an` Verkäufer/Käufer/Makler, Termin, Ansprechpartner); Telefon des Notariats fehlt, Versandweg global statt je Partei. |
| Abschluss: 📄 PDF, 📝 Word, 📦 ZIP mit allem (Anhänge) | Export | ◐ | PDF/Word über `route.tsx:82-86` (`laufzettelAlsDokument` `laufzettel.ts:293`), Links `:272-273`; ZIP-Bundle fehlt (FUNKTIONSABGLEICH: „kein ZIP"). |
| 📧 Begleitschreiben an Notariat (Anrede Kanzlei, Objekt, Parteien, Kaufpreis, Bitte um Bestätigung/Termin; öffnet Mail-Bereich, sonst Text kopiert) | Anschreiben | ✓ | `notarAnschreiben()` `laufzettel.ts:238`, `laufzettelAnschreiben` `verkauf-aktionen.ts:611`, UI `:274-282` (Text + `mailto:`) |

### Signatur-Versand und öffentliche Signaturseite (SignaturSendenModal, SignaturPublicPage)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Vorgang je Dokumenttyp: Reservierungsvereinbarung, Objektnachweis, Maklervertrag, Maklervertrag & Vollmacht (ein Vorgang) | Signaturvorgang | ◐ | Link je Vertrag (`vertragVersenden` `src/server/vertrag-aktionen.ts:121`, Token in `vertraege.token`); Vollmacht ist eigener Vertrag mit eigenem Link — kein gemeinsamer Vorgang. |
| Mehrere Unterzeichner je Vorgang (Mitkäufer, Miteigentümer) mit persönlichem Link | Mehrpersonen-Signatur | ✗ | Ein Token je Vertrag; `vertrag_unterzeichnen` setzt nach der ersten Unterschrift `status = 'unterzeichnet'` (Migration vertraege.sql:196-203), danach ist der Link nicht mehr offen. |
| Verkäufer unterschreiben nach den Käufern (Reihenfolge, Nachweis-Bestätigung) | Sequenz | ✗ | Keine Reihenfolge, keine zweite Partei. |
| Bekannte Eigentümer-Personen vorladen | Empfängervorschlag | ✗ | Kein Empfängerdialog. |
| E-Mail: Betreff und Text bearbeitbar, Platzhalter [Name]/[Link], Standardtext zurücksetzen, Ansprechpartner-Signatur | Mailvorlage | ✗ | Kein Versand („nicht automatisch versendet", `src/components/vertraege/VertragBearbeiten.tsx:147-151`). |
| Versand der Einladungen (Edge Function) | Zustellung | ✗ | Link manuell weitergeben; kein Postfach-/Mailversand für Verträge. |
| Eigene Unterschrift des Maklers bereits im Dokument hinterlegt | Vorunterzeichnung | ✗ | FUNKTIONSABGLEICH Kachel 6: ✗ (Paket V1). |
| Validierung: Name + E-Mail je Person, Doppelte als Käufer und Verkäufer | Eingabeprüfung | ◐ | Name/E-Mail beim Unterzeichnen geprüft (`vertrag_unterzeichnen`, `src/server/vertrag-oeffentlich.ts:36-45`); kein Empfängerdialog. |
| Öffentlich: Token validieren, „Vorgang nicht möglich", „Lade Signatur-Vorgang" | Zugriff | ✓ | RPC `vertrag_oeffnen` (vertraege.sql:123-161), `src/app/vertrag/[token]/page.tsx:36-52`, `robots noindex` |
| Dokument als PDF öffnen (Pflicht: „Dokument geöffnet — Sie können fortfahren"), PDF in neuem Tab | Leseschritt | ◐ | Vertragstext wird auf der Seite selbst angezeigt (`page.tsx:66-70`); kein PDF-Link, kein Öffnen-Zwang. |
| Widerrufsbelehrung mit drei Einzelbestätigungen (erhalten, vorzeitiger Beginn, Erlöschen) | Verbraucherschutz | ◐ | Widerrufsbelehrung des Anbieters wird angezeigt (`page.tsx:72-80`); nur ein Zustimmungshäkchen (`Unterschrift.tsx:78-90`); Widerrufsfrist intern berechnet (`src/lib/vertraege.ts:113, 145`, Detailseite `vertraege/[id]/page.tsx:122-135`). |
| Vollmacht verbindlich erteilen (Häkchen, gleicher Vorgang) | Vollmacht | ✗ | Eigener Link für die Vollmacht. |
| Vollständiger Name eingeben (Textform § 126b BGB) | Identität | ✓ | `Unterschrift.tsx:69-71`, Einordnung `SIGNATUR_EINORDNUNG` `vertraege.ts:52` |
| Unterschrift zeichnen (Canvas), Löschen, „Unterschrift verbindlich einreichen" | Gezeichnete Signatur | ✗ | Öffentliche Seite nimmt Name + E-Mail + Häkchen; Canvas nur im Übergabeprotokoll (`Unterschriftsfeld.tsx`). |
| Metadaten: Zeitpunkt, Plattform/Bildschirm, Signaturbild | Nachweis | ◐ | Name, E-Mail, Zeitpunkt UTC, SHA-256 des Textes (vertraege.sql:195-201); keine Geräte-/IP-Daten, kein Bild. |
| Danke-Seite, „bereits unterzeichnet" | Abschluss | ✓ | `Unterschrift.tsx:37-48`, `page.tsx:82-91` |
| Datenschutzhinweis, Firmenangaben/Impressum | Pflichtangaben | ◐ | Impressum und Firmenname (`page.tsx:57-60, 106-110`); kein Datenschutzhinweis auf der Seite. |
| Makler-Benachrichtigung nach Unterschrift (Glocke/Heute-Zone „Signatur-Vorgänge") | Rückmeldung | ◐ | Zähler „Offene Unterschriften" auf dem Dashboard (`src/app/(app)/dashboard/page.tsx:103, 340`); keine Mail/Glocke bei Eingang. |
| PDF mit eingebetteter Unterschrift (pdf_signed_url) | Signiertes Dokument | ◐ | PDF-Export listet Unterzeichnungen als Abschnitt „Elektronisch unterzeichnet" (`route.tsx:61-64`); kein Signaturbild. |

### Mietverträge (MietvertraegeTab — in VerkaufPage.txt enthalten, fachlich Kachel Vermietung)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Mietvertrag-Formular: Vermieter/Mieter als Herr/Frau/Familie/Eheleute/Erbengemeinschaft, Objekt (Straße, Lage im Haus, Räume, Wohnfläche, Zustand, Schlüssel), Mietbeginn, Kündigungsausschluss, Neubau-Klausel, Grundmiete, Stellplatz, kalte/warme NK, Gesamtmiete automatisch, Bankverbindung, Kaution mit Vorschlag 3× | Vertragsdaten | ✓ | `src/components/vermietung/MietvertragFormular.tsx` (Parteitypen, Kündigungsausschluss `:71`, Neubau-Klausel `:72-73`, Gesamtmiete `:81`, Kaution § 551 `:27, 79-82`), `src/lib/vermietung/mietvertrag`, ANLEITUNG 10c |
| ✨ Aus Mietanfrage übernehmen (Suche, Auswahl) | Mieter vorbelegen | ✓ | `src/app/(app)/vermietung/mietvertraege/page.tsx:61` („Mieter aus Anfrage") |
| Ordner (Ablage): anlegen, umbenennen, löschen, Vertrag zuweisen, Zähler je Ordner; Suche nach Vermieter/Mieter/Adresse | Ablageordner | ◐ | Freitextfeld „Ordner / Ablage" (`MietvertragFormular.tsx:43-44`); keine Ordnerverwaltung, keine Suche. |
| Word / PDF | Export | ✓ | Route `route.tsx:87` Art `mietvertrag` |
| Bearbeiten / Löschen (nur eigene) | Pflege | ◐ | `mietvertragSpeichern`, `mietvertragLoeschen` (nur Entwurf, `vermietung-aktionen.ts:481-487`); keine Eigentümerbindung. |
| Signatur, „Als unterzeichnet markieren" | Abschluss | ✓ | `mietvertragZurUnterschrift` :430, `mietvertragStatus` :463 (setzt Objekt auf „Vermietet") |

### Zusammenfassung
**Zählung (169 Funktionszeilen): ✓ 55 · ◐ 68 · ✗ 46.** Davon 8 ✗ durch Scope-Ausschluss (Firmen-Cloud-Ablage, Kundenbereich (Referenz-Modul)) und nicht als Lücke zu werten.

| Bereich | ✓ | ◐ | ✗ |
|---|---|---|---|
| Übersicht | 0 | 3 | 1 |
| Maklerverträge | 15 | 10 | 8 |
| Objektnachweise | 4 | 7 | 6 |
| Reservierungen | 3 | 7 | 2 |
| Objektbewertung / Einwertung | 3 | 10 | 16 |
| Objektaufnahme | 4 | 1 | 2 |
| Übergabeprotokolle | 9 | 6 | 1 |
| Notar-Laufzettel | 10 | 14 | 2 |
| Signatur (Versand + öffentliche Seite) | 3 | 8 | 8 |
| Mietverträge (Vermietung) | 4 | 2 | 0 |

**Stark:** Maklervertrag-Vorlage (Verkäufertypen, Provisionsmodelle, § 656d, Vollmacht, PDF/Word, KI-Import mit Original), Übergabe-Assistent (7 Schritte, Zähler-KI, Unveränderlichkeit per Trigger), Notar-Laufzettel (8 Schritte, Vorbelegung aus Vertrag/Nachweis, Begleitschreiben), Reservierungslogik (Objektstatus, Fristablauf per Tagesjob, eine aktive je Objekt).

**Wichtigste Lücken (nach Gewicht):**
1. **E-Signatur-Vorgang** — kein Mailversand mit editierbarer Vorlage und Platzhaltern, nur ein Unterzeichner je Link (erste Unterschrift schließt den Vertrag), keine Verkäufer-Gegenzeichnung beim Objektnachweis, keine gezeichnete Unterschrift, keine Einzelbestätigungen zur Widerrufsbelehrung, keine Vorunterzeichnung des Maklers (`src/server/vertrag-aktionen.ts`, `supabase/migrations/20260818060819_vertraege.sql:170-209`, `src/app/vertrag/[token]/`).
2. **Objektbewertung als Präsentation** — die Referenz erzeugt eine Marktpreiseinschätzung als PDF/PPTX mit Vorteilen/Nachteilen/Zielgruppen, Preisentwicklung (KI liest Diagramm), Finanzierungsbeispiel, Courtage, Unterlagen-Checkliste, freien Zusatzseiten, Gutachten-KI und Objekt-/Akquise-Übernahme. ImmoOffice.ai hat ein offenes Rechenblatt (Vergleich/Ertrag/Sachwert, Einordnung, Pflichthinweis) ohne jeden Export und ohne Kopplung an Aufnahme, Objekt oder Akquise (`src/app/(app)/wertermittlung/`, `src/lib/wertermittlung.ts`).
3. **Objektnachweis** — keine GwG-Ausweisdaten (Geburtsdatum/-ort, Staatsangehörigkeit, Ausweis-Nr.), kein Ausweis-Scanner, keine Notarangaben, keine Übernahme aus dem Maklervertrag, kein PDF-Import (`src/components/verkauf/ObjektnachweisFormular.tsx`, `src/lib/verkauf/vorlagen.ts:74`).
4. **Objektaufnahme** — Aufnahmebogen deutlich schmaler (keine Lage/Grundstück/Bauweise/Ausstattung/Nutzung, keine internen Maklernotizen), keine Fotos, kein Sprachmemo mit KI-Verteilung, keine Bewertung aus der Aufnahme (`src/components/AufnahmeFormular.tsx`).
5. **Notar-Laufzettel Detailtiefe** — keine Verkäufer-Bankkonten, nur ein Grundbuchblatt/Flurstück, KI-Grundbuchauswertung befüllt keine Felder, kein ZIP-Bundle, Mietdaten/Hausgeld/Güterstand fehlen (`src/lib/verkauf/laufzettel.ts`, `src/server/verkauf-aktionen.ts:539-575`).
6. **Reservierungen** — keine Gebührenrechnung aus der Reservierung, keine Neubau-Felder (WE-Nr., Etage, Käufertyp), keine Textsuche (`src/components/vermietung/Reservierungen.tsx`, `src/server/vermietung-aktionen.ts:496`).
7. **Querverbindungen** — keine Verkaufs-Übersichtsseite; Objekt- und Kontaktseite listen keine Verträge, Wertermittlungen, Übergaben oder Laufzettel (`src/app/(app)/objekte/[id]/page.tsx`, `src/app/(app)/kontakte/[id]/page.tsx`); Checkliste und Original-PDF sind nicht von der Vertragsseite aus erreichbar; kein Löschen von Verträgen.
8. **Kleinere Lücken** — Mehrfirmen-Auswahl je Mandant (Standort/Firma), § 3a Eigentumsverhältnisse, Behördenanfragen mit PLZ-Zuordnung und Mail-Entwürfen (R1), Fotos je Schlüsselart/Raum im Übergabeprotokoll, Vollbild-Unterschrift auf dem Tablet, Ordnerablage bei Mietverträgen.


---

# Funktionsinventar Referenz → ImmoOffice.ai — Kacheln „Vermietung“ und „Posteingang“

Stand: 04.09.2026. Quelle: ausschließlich die Textauszüge `VermietungPage.txt`,
`MietanfragenPage.txt`, `PosteingangPage.txt`, `MailEinstellungenModal.txt` und
`_technik.txt` (Referenzdatei selbst nicht geöffnet). Abgleich gegen den Code in
`src/app/(app)/postfach`, `src/app/(app)/vermietung`, `src/app/(app)/uebergaben`,
`src/components/postfach`, `src/components/vermietung`, `src/server/postfach-aktionen.ts`,
`src/server/vermietung-aktionen.ts`, `src/lib/postfach`, `src/lib/vermietung`,
`supabase/migrations/20260903160000_postfaecher.sql`, `supabase/migrations/20260904100000_vermietung.sql`.

Legende: **✓** vorhanden (mit Fundstelle) · **◐** teilweise (was fehlt) · **✗** fehlt.
Alle Pfade relativ zum Repository. Kennzeichen des Referenzunternehmens sind ersetzt
(„Referenz“, „Formulardienst“, „Projektort“, „Cloud-Speicher“).

Vorbemerkung zur Quelle: Die Vermietungsseite der Referenz bündelt im selben Modul
den Notar-Laufzettel (PDF/Word-Erzeugung, KI-Auswertungen von Grundbuchauszügen) und
zwei Cloud-Speicher-Auswahldialoge. Der Laufzettel ist fachlich Verkauf und wird hier
nicht gezählt (ImmoOffice.ai: `src/components/verkauf/LaufzettelAssistent.tsx`, Menü
„Notar“); die Cloud-Speicher-Anbindung ist laut Masterprompt ersatzlos entfallen.

---

## Kachel Vermietung

### Übersicht (Einstiegskacheln)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Unterkachel „Mietanfragen“ | „Anfragen mit Vorlagen beantworten“, Einstieg in die Anfragen | ✓ | `src/app/(app)/vermietung/page.tsx` (Kachel mit Zähler „neu von gesamt“) |
| Unterkachel „Mietverträge“ | „Mietverträge erfassen und drucken“ | ✓ | `src/app/(app)/vermietung/page.tsx` → `/vermietung/mietvertraege` |
| Unterkachel „Übergabeprotokolle“ | „Ein- und Auszug mit Zählerständen“ | ✓ | `src/app/(app)/vermietung/page.tsx` → `/uebergaben` (Zähler nur Kontext `vermietung`) |
| Unterkachel „Posteingang“ | „E-Mails aus dem Postfach“ direkt aus der Vermietung öffnen | ◐ | Postfach ist eigener Menüpunkt (`src/app/(app)/postfach/page.tsx`); von der Vermietungskachel führt kein Einstieg dorthin. Verbindung besteht über „Als Mietanfrage übernehmen“ im Postfach |
| Zurück zur Vermietungs-Übersicht | Navigation aus jeder Unterseite zurück | ✓ | Link „Zur Vermietung“ in `vermietung/anfragen/page.tsx`, `vermietung/mietvertraege/page.tsx`, `vermietung/reservierungen/page.tsx` |
| „Erstellt von · Datum“ (CreatedBy) | Ersteller und Datum an Datensätzen | ◐ | `erstellt_von`/`erstellt_am` in `mietanfragen`, `mietvertraege` (Migration `20260904100000_vermietung.sql`); Anzeige nur „angelegt/eingegangen <Datum>“ ohne Ersteller |

### Mietanfragen — Einstieg nach Anfrage-Art

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Unterkachel „Selbstauskunft-Antworten“ | Eingänge aus dem externen Formulardienst, mit Zähler | ◐ | Quelle `selbstauskunft` als Marke je Zeile in `vermietung/anfragen/page.tsx`; kein Filter und kein Zähler nach Quelle |
| Unterkachel „Selbstauskunft <Projektort>“ | Zweites, projektbezogenes Formular als eigene Kachel | ◐ | Selbstauskunft-Links je Objekt oder allgemein (`selbstauskunft_links.objekt_id`, `AnfragenWerkzeuge.tsx`); keine projektbezogene Trennung in der Liste |
| Unterkachel „Online-Anfragen“ | Portalanfragen (drei große Portale) getrennt | ◐ | Quelle `email` mit erkanntem Portal in `email_eingang.portal` (`src/lib/vermietung/mail-parser.ts`); keine eigene Kachel, kein Quellenfilter |
| Zähler je Kachel („Mietanfragen-Counts“) | Anzahl offener Anfragen je Art | ◐ | Nur Gesamtzähler „neu von gesamt“ auf der Vermietungskachel |
| Erklärtext „Wähle aus, welche Art …“ | Einstiegshinweis | ✗ | Kein Zwischenschritt — Liste öffnet direkt |

### Mietanfragen — Liste

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste mit Name, Objekt, Status, Besichtigung, „Öffnen“ | Übersicht aller Anfragen | ✓ | `src/app/(app)/vermietung/anfragen/page.tsx` (Name, Objekt, Status-Marke, Quelle, Sterne, Eingang, Besichtigung) |
| Suche (Name, E-Mail, Objekt) | Freitextsuche in der Liste | ✗ | Kein Suchfeld in `vermietung/anfragen/page.tsx` — nur Statusfilter |
| Statusfilter „Alle Status“ | Liste nach Status einschränken | ✓ | Status-Chips `?status=` in `vermietung/anfragen/page.tsx` |
| Statuswerte Neu · In Prüfung · Besichtigung geplant · Besichtigung erfolgt · Unterlagen angefordert · Zusage · Absage · Warteliste · Vertrag unterzeichnet · Archiviert | Lebenszyklus der Anfrage | ◐ | `ANFRAGE_STATUS` in `src/lib/vermietung/anfragen.ts` (8 Werte); **Warteliste** und **Archiviert** fehlen |
| „+ Neue Mietanfrage“ | Manuelle Erfassung | ✓ | Formular „Anfrage erfassen“ in `vermietung/anfragen/page.tsx`, `anfrageAnlegen` in `src/server/vermietung-aktionen.ts` |
| Formulardienst-Sync („Holt neue Einreichungen ab“, Meldung neu/bereits vorhanden) | Abgleich mit externem Formulardienst | ✓ | Ersetzt: eigenes Formular schreibt direkt in `mietanfragen` (RPC `selbstauskunft_einreichen`, Migration `20260904100000_vermietung.sql`); kein Sync nötig |
| Anfrage aus der Liste löschen (Rückfrage) | Löschen | ✓ | Im Detail: „Anfrage löschen“ mit Rückfrage (`AnfrageDetail.tsx`, `anfrageLoeschen`) |
| Inline-Speichern in der Liste („Gespeichert.“) | Status direkt in der Liste ändern | ◐ | Nur im Detail (`anfrageSpeichern`/`anfrageStatus`) |
| Zurück zur Mietanfragen-Übersicht | Navigation | ✓ | Link „Zur Übersicht“ in `vermietung/anfragen/[id]/page.tsx` |

### Mietanfrage — Formular (Detail)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Interessent: Anrede (Herr/Frau/Familie/Eheleute), Vorname*, Nachname*, E-Mail, Telefon | Stammdaten | ✓ | `src/components/vermietung/AnfrageDetail.tsx` |
| Beruf, Einkommen netto, Haushaltsgröße, Einzug ab, Haustier, Bonitätsauskunft vorhanden | Bonitätsangaben | ✓ | `AnfrageDetail.tsx` (Beruf, Arbeitgeber, Nettoeinkommen, Personen, Einzug ab, Haustiere, Bonitätsauskunft, Kaution möglich, Raucher) |
| Objekt: Straße & Nr., Ort, Kaltmiete (Freitext) | Objektangaben ohne Bestandsbezug | ◐ | Nur Auswahl eines Bestandsobjekts (`vermarktungsart = miete`); keine freien Adress-/Kaltmiete-Felder |
| Quelle wählbar: Manuell · Portal A · Portal B · Eigenes Portal | Herkunft der Anfrage | ◐ | `ANFRAGE_QUELLEN` (manuell/email/web/selbstauskunft) wird beim Anlegen gesetzt, nicht wählbar; Portal wird automatisch erkannt (`mail-parser.ts`). Quelle `web` hat keinen Erzeuger (Web-Exposé-Anfrage schreibt nicht in `mietanfragen`) |
| Status & Bewertung (1–10), interne Notiz | Bewertung und Notiz | ◐ | Bewertung 1–5 mit sichtbarem Regelvorschlag `bewertungVorschlag` (`src/lib/vermietung/anfragen.ts`); Notizen ✓ |
| Selbstauskunft-Block: Mieter 1 und Mieter 2 (Geburtsdatum, Arbeitgeber, beschäftigt seit, Beruf, Netto, Adresse, Telefon) | Zwei Personen mit Detailangaben | ◐ | Nur ein Datensatz je Anfrage (Haushalt gesamt); kein Mieter 2, kein Geburtsdatum, kein „beschäftigt seit“, keine Anschrift des Interessenten |
| Bonität & Auskünfte: Haustiere, Mietverhältnis seit, aktueller Vermieter, Miete zahlbar, Kaution leistbar, eidesstattliche Versicherung (Warnung), DSGVO-Einwilligung | Auskünfte aus der Selbstauskunft | ◐ | Haustiere, seit, Vermieter, Kaution, DSGVO (`datenschutz_einwilligung`) ✓; **„Miete zahlbar“** und **eidesstattliche Versicherung** fehlen |
| Wohnungs-Interesse, Mitteilung des Interessenten | Freitext des Interessenten | ✓ | `mitteilung` in `AnfrageDetail.tsx`; Interesse = Objektbezug |
| Hochgeladene Unterlagen (Links) | Dateien aus der Selbstauskunft | ✗ | Selbstauskunft-Formular ohne Upload (`SelbstauskunftFormular.tsx`) |
| Unterschriften M1/M2 (Bild) | Unterschrift der Interessenten im Formular | ✗ | Nur Häkchen „Angaben bestätigt“ (`angaben_bestaetigt`) |
| Roh-Daten kopieren / Debug-Ansicht | Rohnutzlast des Formulardienstes | ✗ | Nicht vorgesehen (kein externer Dienst); Kopfdaten der Mail in `email_eingang` |
| Antwort-Historie | Bisherige Antworten mit Datum | ✓ | `antwort_verlauf` → Karte „Bisherige Antworten“ in `AnfrageDetail.tsx` |
| „→ Mietvertrag erstellen“ | Anfrage in Mietvertrag überführen | ✓ | `AnfrageDetail.tsx` → `mietvertragAnlegen` (Mieter, Einzug, Objekt vorbelegt; Status → `vertrag`) |
| Speichern / Abbrechen / Löschen | Formularaktionen | ✓ | `anfrageSpeichern`, `anfrageLoeschen` in `src/server/vermietung-aktionen.ts` |
| Original-Anfrage (Von, Datum, Text) | E-Mail-Ursprung anzeigen | ◐ | Betreff/Absender/Datum in `email_eingang`; nur Betreff sichtbar, kein Text, kein Sprung zur Nachricht |
| Als Kontakt anlegen | Interessent ins CRM | ✓ | `anfrageAlsKontakt` (Dublettenprüfung per E-Mail, Rolle Interessent, `kontakt_objekt`) — in der Referenz nicht in dieser Datei sichtbar, hier Ergänzung |

### Mietanfrage — Antworten mit Vorlagen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Antwort-Vorlagen wählen („✨ Antwort-Vorlagen“) | Vorlage → Betreff und Text | ✓ | `STANDARD_VORLAGEN` (Eingang, Besichtigung, Selbstauskunft, Unterlagen, Zusage, Absage) in `src/lib/vermietung/anfragen.ts`; `anfrageAntwortEntwerfen` |
| Platzhalter {anrede} {vorname} {nachname} {objekt_strasse} {objekt_plz} {objekt_ort} {datum_text} {alternativen} {absender_name} {absender_rolle} {termin_block} | Textbausteine füllen | ◐ | Platzhalter `{anrede} {name} {objekt} {termin} {absender} {firma} {link}` (`vorlageAusfuellen`); **{alternativen}**, **{absender_rolle}** und getrennte Objektadressfelder fehlen |
| Anrede automatisch („Sehr geehrter Herr …“, „Guten Tag“) | Anredezeile nach Anrede | ✓ | `anredeText` in `src/lib/vermietung/anfragen.ts` |
| Termin-Vorschlag (Datum + Uhrzeit → Wochentag-Text im Brief) | Besichtigungstermin einsetzen | ✓ | Feld „Termin“ bei Vorlagen mit `mit_termin`, `terminText` mit Wochentag |
| Alternative Termine (mehrere, nummeriert) | Ausweichtermine anbieten | ✗ | Nur ein Termin; Vorlage bittet um zwei Alternativen des Interessenten |
| „Termin entfernen“ | Terminblock streichen | ◐ | Feld leeren; kein eigener Knopf |
| Betreff/Text editierbar vor Versand | Nachbearbeitung | ✓ | Felder Betreff/Text im Versandformular (`AnfrageDetail.tsx`) |
| „📋 Text kopieren“ (Zwischenablage) | Text kopieren | ◐ | Ohne Postfach als markierbarer Textblock; kein Kopierknopf |
| „✉ Im Mail-Programm“ (mailto) | Lokales Mailprogramm öffnen | ✓ | mailto-Link in `AnfrageDetail.tsx` |
| „⚡ Direkt senden“ mit Absender-Postfach-Auswahl | Versand aus dem Tool | ✓ | „Über Postfach senden“ → `nachrichtSenden` (`src/server/postfach-aktionen.ts`) |
| Hinweis „Postfach im Profil einrichten“, wenn keins vorhanden | Rückfall auf Mailprogramm | ◐ | Rückfall auf mailto vorhanden; kein Link zu Einstellungen → Postfächer |
| Erfolgs-/Fehlermeldung nach Versand | Rückmeldung | ✓ | `versand.erfolg/fehler` in `AnfrageDetail.tsx` |
| Versand vermerken, Status nachziehen | Antwort-Historie + Folgestatus | ✓ | `anfrageAntwortVermerken` (Besichtigung → geplant, Selbstauskunft/Unterlagen → angefordert, Zusage/Absage) |
| Vorlagen je Unternehmen anpassen | Texte administrieren | ✓ | `AnfragenWerkzeuge.tsx`, `antwortvorlageSpeichern`, Tabelle `antwortvorlagen` |

### Selbstauskunft (öffentliches Formular)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Externes Selbstauskunft-Formular (Formulardienst) | Interessent füllt ohne Konto aus | ✓ | Eigene Seite `src/app/selbstauskunft/[token]/page.tsx`, `SelbstauskunftFormular.tsx`, `src/server/selbstauskunft-oeffentlich.ts` (Honigtopf, Tageslimit) |
| Formular je Objekt/Projekt | Getrennte Formulare | ✓ | `selbstauskunft_links` mit `objekt_id` oder allgemein; Objektkarte im Formular (RPC `selbstauskunft_oeffnen`) |
| Feldmapping Formular → Anfrage | Antworten werden zur Anfrage | ✓ | RPC `selbstauskunft_einreichen` (Migration `20260904100000_vermietung.sql`) |
| Link versenden | Link in Antwort einsetzen | ✓ | Vorlage „Selbstauskunft anfordern“ setzt `{link}` (`anfrageAntwortEntwerfen`) |
| Link deaktivieren | Formular sperren | ✓ | `selbstauskunftLinkSchalten` |
| Zwei Mieter, Unterlagen-Upload, Unterschrift | Umfang des Referenzformulars | ✗ | Siehe Formularzeilen oben — eine Person, kein Upload, keine Unterschrift |

### Mietverträge

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste mit Suche (Vermieter, Mieter, Adresse, PLZ, Ort) | Verträge finden | ✗ | Kein Suchfeld in `vermietung/mietvertraege/page.tsx` — nur Status-Chips |
| Ordner (Ablage): „Alle“, „Ohne Ordner“, eigene Ordner mit Zähler; Ordner anlegen, umbenennen, löschen; Vertrag per Auswahl einem Ordner zuweisen | Ablagestruktur | ◐ | Freitextfeld „Ordner / Ablage“ (`MietvertragFormular.tsx`, Spalte `ordner`) und Marke in der Liste; keine Ordnerverwaltung, kein Ordnerfilter |
| „Neuer Mietvertrag“ | Anlegen | ✓ | Formular „Mietvertrag anlegen“ in `vermietung/mietvertraege/page.tsx`, `mietvertragAnlegen` |
| „✨ Aus Mietanfrage übernehmen“ (Auswahl offener Anfragen mit Suche, „Einzug ab“) | Mieterdaten aus Anfrage | ✓ | Auswahl „Mieter aus Anfrage“ (Status Zusage/Unterlagen/Besichtigung erfolgt) und Knopf in `AnfrageDetail.tsx`; ohne Suchfeld in der Auswahl |
| Vermieter/Mieter: Art (Herr, Frau, Familie, Eheleute, Erbengemeinschaft), Name*, Straße*, PLZ*, Ort*, Land; weitere Personen bei Erbengemeinschaft | Parteien | ✓ | `ParteiBlock` in `MietvertragFormular.tsx` (Einzelperson, Eheleute, Mehrere, Erbengemeinschaft, Firma; bis 10 Personen, Geburtsdatum, E-Mail für Signaturlink); kein Feld „Land“ |
| Pflichtfeld-Prüfung mit Meldungen je Partei/Feld | Validierung | ✓ | `fehlendeAngaben` in `src/lib/vermietung/mietvertrag.ts`, Zod-Schema in `mietvertragSpeichern` |
| Mietobjekt: Straße*, PLZ*, Ort*, Lage im Haus*, Räume*, Wohnfläche*, Zustand | Objektbeschreibung | ✓ | Karte „Mietobjekt“ (`MietvertragFormular.tsx`), zusätzlich Nebenräume/Ausstattung |
| Schlüssel-Übergabe (Text, z. B. „3 Wohnungsschlüssel, 2 Briefkastenschlüssel“) | Schlüssel im Vertrag | ✗ | Kein Feld; Schlüssel nur im Übergabeprotokoll (`src/lib/verkauf/uebergabe.ts`) |
| Mietbeginn*, Kündigungsausschluss (Monate), Neubau-Klausel (Vorbehalt Mietbeginn) | Mietzeit | ✓ | Felder + `mietvertragText` § 2/§ 7 (`src/lib/vermietung/mietvertrag.ts`); zusätzlich Befristung |
| Grundmiete*, Stellplatz, Vorauszahlung BK kalt*, BK warm* | Mietbestandteile | ✓ | `Zahl`-Felder in `MietvertragFormular.tsx` |
| Gesamtmiete automatisch berechnet, überschreibbar | Summe | ◐ | `gesamtmiete()` live und generierte Spalte `gesamtmiete` in der Datenbank; **nicht** überschreibbar |
| Bankverbindung: Kontoinhaber, IBAN, BIC, Kreditinstitut | Zahlungsdaten | ✓ | Karte „Bankverbindung des Vermieters“ |
| Kaution* mit Vorschlag 3 × Grundmiete, „Vorschlag übernehmen“ | Kaution | ✓ | `kautionVorschlag`, Knopf „Kaution auf … setzen“; Prüfung § 551 BGB in `fehlendeAngaben` |
| Speichern → Dokument wird erstellt (PDF-Funktion `mietvertrag-pdf`) | Vertragsdokument | ✓ | „Vertragstext erzeugen und zur Unterschrift“ → `vertraege` (`mietvertragZurUnterschrift`); PDF über `src/app/api/dokumente/[art]/[id]/route.tsx` (`mietvertrag`) |
| Word-Export | DOCX | ✓ | `/api/dokumente/mietvertrag/<id>?format=docx` |
| PDF-Export | PDF | ✓ | `/api/dokumente/mietvertrag/<id>?format=pdf` (Entwurf mit Wasserzeichen „ENTWURF“) |
| Bearbeiten | Ändern | ✓ | `mietvertragSpeichern` — nur im Status Entwurf |
| Löschen (nur eigene; „Chef fragen“) | Löschen mit Schutz | ✓ | `mietvertragLoeschen` — Recht `vertraege/loeschen`, nur Entwürfe (Rolle statt Eigentümerschaft) |
| Listenkarte: Mieter, Wohnfläche, Mietbeginn, Gesamtmiete, Marke „Neubau-Klausel“ | Übersicht | ◐ | Mieter, Objekt, Mietbeginn, Gesamtmiete, Status, Ordner in `vermietung/mietvertraege/page.tsx`; Wohnfläche und Neubau-Marke fehlen in der Liste |
| Microsoft-Anmeldung, Cloud-Speicher-Dateiauswahl, Ordnerauswahl | Ablage in externem Cloud-Speicher | ✗ | Laut Masterprompt ersatzlos entfallen; Ersatz: Unterlagen am Objekt |
| Unterschrift über Signaturlink, Status Entwurf → zur Unterschrift → unterzeichnet (Objekt → vermietet) → beendet | Digitale Unterschrift | ✓ | `mietvertragZurUnterschrift`, `mietvertragStatus` — Ergänzung gegenüber der Referenz („erfassen und drucken“) |

### Übergabeprotokolle (Ein-/Auszug)

Die Detailseite der Referenz liegt nicht in den hier zugelassenen Quellen; erfasst
ist, was `VermietungPage.txt` und `_technik.txt` (Edge-Funktionen `parse-zaehler`,
`ki-bildbearbeitung`, Tabelle `aktivitaeten`) hergeben.

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Protokoll für Einzug und Auszug | Vermietungskontext | ✓ | `src/app/(app)/uebergaben/page.tsx` (Kontext `vermietung`, Typen `einzug`/`auszug` in `src/lib/verkauf/uebergabe.ts`) |
| Zählerstände erfassen | Strom, Gas, Wasser … | ✓ | Schritt 3 in `src/components/verkauf/UebergabeAssistent.tsx`, `ZAEHLER_ARTEN` |
| Zählerstand per Foto auslesen (`parse-zaehler`) | KI liest Nummer/Stand | ✓ | `zaehlerFotoAuslesen` in `src/server/verkauf-aktionen.ts` (1 Credit, Kennzeichnung `ki_gelesen`) |
| KI-Bildbearbeitung im Protokoll (`ki-bildbearbeitung`) | Zweck aus Quelle nicht erkennbar | ✗ | Nicht im Übergabeprotokoll; Bild-Editor nur unter Werkzeuge |
| Eintrag im Verlauf (`aktivitaeten`) | Protokoll im Objektverlauf | ◐ | `uebergabeprotokolle` mit `objekt_id`; kein Verlaufseintrag beim Abschluss gefunden in `verkauf-aktionen.ts` |
| Schlüssel, Räume mit Zustand, Sonstiges, Unterschriften am Bildschirm, PDF/Word, Abschluss unveränderlich | Weitere Schritte (in ImmoOffice.ai vorhanden) | ✓ | `UebergabeAssistent.tsx`, `/api/dokumente/uebergabe/<id>` — Referenzumfang aus den Quellen nicht belegbar |

### Zusammenfassung Kachel Vermietung

Zählung über alle Tabellen der Kachel (83 Zeilen): **✓ 50 · ◐ 22 · ✗ 11.**

Wichtigste Lücken:
1. **Suche** fehlt in Mietanfragen- und Mietvertragsliste (nur Statusfilter).
2. **Selbstauskunft** deutlich schmaler als die Referenz: nur eine Person statt Mieter 1/2, kein Geburtsdatum, kein Unterlagen-Upload, keine Unterschrift, keine Abfrage „Miete zahlbar“/„eidesstattliche Versicherung“.
3. **Statuswerte** Warteliste und Archiviert fehlen; Bewertung 1–5 statt 1–10 (mit Regelvorschlag als Plus).
4. **Keine Einstiegskacheln nach Anfrage-Art** (Selbstauskunft / Projektformular / Online-Anfragen) und kein Quellenfilter; Quelle `web` hat keinen Erzeuger.
5. **Antwortvorlagen:** keine Alternativtermine, kein Platzhalter für die Absenderrolle, kein Kopierknopf.
6. **Mietverträge:** keine Ordnerverwaltung (nur Freitext), Gesamtmiete nicht überschreibbar, kein Feld Schlüssel-Übergabe, Liste ohne Wohnfläche/Neubau-Marke.
7. Bewusst nicht übernommen: Cloud-Speicher-Ablage (Masterprompt), externer Formulardienst (ersetzt durch eigenes Formular).

Ergänzungen gegenüber der Referenz: Signaturlink für Mietverträge, Reservierungen mit Vereinbarung, Bewertungsvorschlag mit sichtbaren Regeln, „Als Kontakt anlegen“, Statusautomatik nach Antwort.

---

## Kachel Posteingang

### Postfächer und Ordnerstruktur

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Mehrere Postfächer je Benutzer, Ansicht „Alle Postfächer“ oder ein Postfach | Mehr-Postfach-Client | ✓ | Auswahl „Alle Postfächer“/je Postfach in `src/app/(app)/postfach/page.tsx`; Tabelle `postfaecher` |
| Postfach im Profil einrichten (SMTP/IMAP), Standardpostfach (`ist_standard`) | Konto anlegen | ◐ | `src/app/(app)/einstellungen/postfaecher/page.tsx`, `PostfachVerbinden.tsx` (IMAP/SMTP, Microsoft 365, Google per OAuth); **kein Standard-Kennzeichen** — erstes sendbares Postfach wird vorbelegt |
| Standardordner Posteingang · Gesendet · Entwürfe · Archiv · Junk · Gelöschte Elemente | Ordnernavigation | ◐ | Nur `eingang` und `gesendet` (Enum `nachricht_ordner`, Migration `20260903160000_postfaecher.sql`); Entwürfe, Archiv, Junk, Papierkorb fehlen |
| Eigene Ordner anlegen („＋ Neuer Ordner“), umbenennen, löschen | Ordnerverwaltung | ✗ | Bewusst beim Anbieter belassen (Kommentar „Keine Ordner, keine Regeln“ in `NachrichtDetail.tsx`) |
| Mail per Drag & Drop oder „Verschieben“ in Ordner | Einsortieren | ✗ | Keine Ordner |
| Neue Mails abrufen (`mail-postfach-pull`, Meldung „n neue Mails“) | Abruf | ✓ | „Jetzt abrufen“ (`postfachAbrufen`), Hintergrundjob `postfachAuftrag` in `src/lib/jobs/worker.ts`, `postfaecher_faellige_einplanen()`; Meldung „Postfach verbunden, erster Abruf läuft“ statt Zähler |
| Live-Aktualisierung der Liste (Datenbank-Kanal) | Neue Mails ohne Neuladen | ✗ | Serverseitig gerenderte Seite ohne Realtime |
| Abrufintervall, Fehlerzähler mit gestrecktem Abstand | Betrieb | ✓ | `PostfachKarte.tsx` (5 Min bis täglich), `fehler_zaehler` — Ergänzung |
| Unternehmenspostfach mit Freigaben (lesen/senden) | Gemeinsame Postfächer | ✓ | `postfach_freigaben`, `freigabeSetzen` — Ergänzung gegenüber den Quellen |

### Liste, Suche, Filter, Sortierung

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Suche (Betreff, Absender) | Freitext | ✓ | `postfach/page.tsx` → RPC `nachrichten_suchen` (Volltext inkl. Text, Migration `20260903170000_haertung.sql`) |
| Quellenfilter: Alle Quellen · Portal A · Portal B · Portal C · E-Mail · Sonstige | Nach Herkunft filtern | ✗ | Keine Quellenerkennung in der Liste |
| Sortierung: Neueste · Älteste · Ungelesene zuerst · Absender · Betreff | Sortieren | ✗ | Fest nach Datum absteigend |
| Filter: alle · Ungelesen · Gekennzeichnet · Mit Anhang | Filter | ◐ | Nur „nur ungelesene“ (`?ungelesen=1`) |
| Mehrfachauswahl mit Sammelaktionen (in Ordner, Gelesen, Kennzeichnen, Papierkorb, endgültig löschen, Auswahl aufheben) | Massenbearbeitung | ✗ | Keine Auswahlkästchen in `Nachrichtenliste.tsx` |
| „🗑 Papierkorb leeren“ | Endgültig löschen | ✗ | Kein Papierkorb |
| Kennzeichnung zur Nachverfolgung setzen/entfernen | Markierung | ✗ | Keine Spalte `markiert` |
| Kategorien (farbig) zuweisen/entfernen | Farbkategorien | ✗ | Keine Tabelle `mail_kategorien` |
| Listenzeile mit Marken (Portal, Postfach), ungelesen fett | Darstellung | ◐ | Marken Postfach/Objekt/Vorschlag/Kontakt/Anhang/Gesendet (`Nachrichtenliste.tsx`); keine Portalmarke |
| Doppelklick auf Entwurf → bearbeiten | Entwürfe | ✗ | Keine Entwürfe |
| Sortierung „Nach Absender“ mit Umlaut-Normalisierung | Sortierhilfe | ✗ | Entfällt mit Sortierung |

### Nachricht lesen und zuordnen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kopf: Von, An, Datum; Betreff | Anzeige | ✓ | `NachrichtDetail.tsx` (inkl. Kopie) |
| Als gelesen/ungelesen markieren (automatisch beim Öffnen) | Lesestatus | ✓ | `nachrichtGelesen`, `useEffect` in `NachrichtDetail.tsx` |
| Kontakt erkennen und verlinken („📇 Kontakt“) | CRM-Bezug | ✓ | `kontaktErkennen` in `src/lib/postfach/zuordnung.ts`, Link in `NachrichtDetail.tsx`, manuelle Auswahl |
| Objekt automatisch erkannt (Objektnummer im Text, Straße/Hausnummer/Ort/PLZ, Konfidenz, Grund, „mehrere Objekte in dieser Straße“) | Objektzuordnung | ✓ | `objektErkennen`/`zuordnen` in `src/lib/postfach/zuordnung.ts` (Schwellen 90/50, Grund, Statusbonus), Tests `zuordnung.test.ts` |
| Objekt-Vorschlag mit Konfidenz: „Übernehmen“ / „anderes Objekt“ / „Zuordnung entfernen“ | Manuelle Korrektur | ✓ | Vorschlagsformular + Auswahl in `NachrichtDetail.tsx`, `nachrichtZuordnen` |
| Objekt-Suchfeld (Straße, Ort, PLZ, Nr., Bezeichnung, Tastaturnavigation) | Objekt finden | ◐ | Auswahlliste bis 500 Objekte statt Suchfeld |
| Zuordnung in Objektindex/Verlauf schreiben | Objekt als Drehkreuz | ✓ | `aktivitaeten` (Typ `email`) in `nachrichtZuordnen` und `verlaufsEintrag` (`src/lib/postfach/abgleich.ts`) |
| Hinweis „mit Zuordnung antwortet die KI aus dem Objektwissen“ | KI-Kontext | ✓ | Objektkontext (`OBJEKT_FELDER`) in `antwortEntwerfen` |
| Unterhaltung („🧵 Unterhaltung · n weitere Nachrichten“, Nachricht öffnen) | Thread-Ansicht | ◐ | `thread_id`/`in_reply_to` gespeichert; keine Anzeige der Unterhaltung |
| Anhänge nachladen vom Server („Lädt Anhänge aus dem IMAP-Server nach“) | Anhänge auf Anforderung | ✓ | `anhangUebernehmen` lädt bei Übernahme über den Anbieter (`anbieter.anhangLaden`) |
| Anhang herunterladen | Download | ✗ | Nur Übernahme in Objekt-Unterlagen; kein Direkt-Download |
| „🖍️ Schwärzen“ — Personendaten schwärzen und am Objekt ablegen | Anonymisierte Ablage | ✗ | PDF-Schwärzen nur im Werkzeug (Werkzeuge W1), nicht aus dem Postfach |
| Anhang am Objekt ablegen (Original-Dateiname, Größe) | Ablage | ✓ | `anhangUebernehmen` → `objekt_dokumente` mit Art, Notiz „Aus dem Postfach übernommen“ |
| KI-Namensvorschlag für Anhänge („Nachtrag der KI-Namen“) | Umbenennen | ✗ | Nicht vorhanden |
| Mail als Text in Cloud-Speicher ablegen, Absender→Ordner-Verknüpfung merken/lösen | Externe Ablage | ✗ | Laut Masterprompt entfallen |
| „🖨 Drucken“ (HTML-Druckansicht) | Drucken | ✗ | Keine Druckansicht |
| „📦 Archivieren“ / „📥 Aus Archiv“ | Archiv | ✗ | Kein Archivordner |
| In Papierkorb verschieben / endgültig löschen / „Mail entfernt“ | Löschen | ✗ | Kein Löschen einzelner Nachrichten (nur Aufräumjob `nachrichten_aufraeumen`) |
| „🚫 Blockieren“ (Absender → Junk, serverseitig) | Absender sperren | ✗ | Keine Tabelle blockierter Absender |
| KI fasst Mail zusammen → Notiz im Dashboard | Zusammenfassung | ✗ | Nicht vorhanden |
| „↩ Antworten“ | Antwort öffnen | ✓ | „Antwort schreiben“ in `NachrichtDetail.tsx` |
| „↩↩ Allen antworten“ (Absender + CC) | Antwort an alle | ✗ | Nur An = Absender; Kopie manuell |
| „⤳ Weiterleiten“ (inkl. geladener Anhänge) | Weiterleiten | ✗ | Nicht vorhanden |
| „✨ Als Mietanfrage anlegen“ (`mail-zu-mietanfrage`, Dublettenprüfung) | Lead-Erkennung Vermietung | ✓ | „Als Mietanfrage übernehmen“ → `nachrichtAlsAnfrage` (Portal-Parser, Dublette über `email_eingang.nachricht_id`) |
| ToDo aus Mail (`mail-zu-todo`: „KI analysiert die Mail“, Kontakt verknüpft) | Aufgabe erzeugen | ◐ | „Als Aufgabe übernehmen“ → `aufgabeAusNachricht` (`src/server/arbeitsmittel-aktionen.ts`): Frist per Regel („bis …“), Objekt/Kontakt übernommen; **keine KI-Analyse** |
| ToDo/Termin aus markierter Textstelle (`mail-aufgaben-erkennen`, Modal mit Titel/Datum/Uhrzeit, Art ToDo oder Termin, „Nicht anlegen“, „Nichts wird ohne dein Zutun angelegt“) | Mehrfacherkennung | ◐ (16b) | „Als Termin übernehmen“ an der Nachricht: Datum/Uhrzeit aus markierter Stelle oder Text erkannt, Kalenderdialog vorbelegt (`src/server/arbeitsmittel-aktionen.ts` `terminAusNachricht`); Aufgabe aus Mail vorhanden; kein Modal mit Mehrfacherkennung per KI |
| Aufgabenerkennung nach Versand („Das hast du in der Mail zugesagt“) | Zusagen erkennen | ✗ | Nicht vorhanden |
| Besichtigungstermin aus Mail in Kalender (auch Fremdsystem) | Termin anlegen | ✗ | Umgekehrter Weg vorhanden: Terminbestätigung aus dem Kalender mit ICS über das Postfach (`anhang_art=termin`) |
| Als Akquise-Lead übernehmen | Eigentümeranfrage → Lead | ✓ | `nachrichtAlsLead` (`src/server/akquise-aktionen.ts`) — in den Quellen dieser Kachel nicht enthalten, Ergänzung |
| Inhalt nach Aufbewahrungsfrist entfernen, Verknüpfung bleibt | Datensparsamkeit | ✓ | `nachrichten_aufraeumen()`, `inhalt_entfernt_am`, Hinweis in `NachrichtDetail.tsx` — Ergänzung |

### Verfassen und Antworten

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| „✉ Neue E-Mail“ mit Von (Postfach), An, CC, BCC, Betreff, Nachricht | Verfassen | ◐ | `NeueNachricht.tsx` (Postfach, An, Kopie, Betreff, Text); **BCC fehlt** |
| Empfängerfeld mit CRM-Vorschlägen ab 2 Zeichen, mehrere mit Komma, Tastaturnavigation | Autovervollständigung | ✗ | Freitextfeld; Komma-Trennung ✓ (`adressenParsen`) |
| Antwort mit Zitat der Ursprungsmail („> “) | Zitat | ✗ | Antworttext beginnt leer bzw. mit KI-Entwurf |
| Signatur automatisch sichtbar eingesetzt, dort anpassbar | Signatur | ◐ | `signaturText` wird serverseitig angehängt (Name, Firma, Anschrift, Telefon aus Profil/Erscheinungsbild); nicht im Editor sichtbar, nicht je Postfach frei formulierbar |
| „📅 Termin einfügen“ (Datum/Uhrzeit, Format, Dauer, Vorschau; optional in Kalender eintragen; ersetzt Markierung „[ZU PRÜFEN: Termin]“) | Terminblock | ✓ (16b) | `src/components/postfach/NeueNachricht.tsx` (Datum/Uhrzeit als Text, optional Kalendereintrag mit Kalenderdatei; `nachrichtSenden`) |
| „📋 Notiz einfügen“ (aus dem Notizen-Bereich an Cursor) | Notiz | ✗ | Nicht vorhanden |
| „📎 Datei anhängen“ (25 MB/Datei, 40 MB gesamt, Größenanzeige, Entfernen) | Eigene Anhänge | ◐ | Nur Rechnung, Brief oder Kalenderdatei als Anhang aus der Anwendung (`anhangPdf` in `nachrichtSenden`); kein freier Upload |
| „☁ Aus Cloud-Speicher“ anhängen | Externe Datei | ✗ | Entfallen |
| „✨ Mit KI antworten“ / „KI-Vorschlag“ im eigenen Schreibstil, Objektwissen (Unterlagen, Fakten), Hinweis ohne Objekt, Rückfrage vor Ersetzen | KI-Antwortentwurf | ◐ | `antwortEntwerfen` (`src/server/postfach-aktionen.ts`): Stichpunkte, Objektstammdaten, Credits, Kennzeichnung „KI-Entwurf — bitte prüfen“, Rahmen ohne KI; **kein Schreibstil, keine Objektunterlagen/-fakten**, Text wird ohne Rückfrage ersetzt |
| „📎 Unterlagen“ — KI empfiehlt Objektunterlagen zum Anhängen („n anhängen“, filtern) | Unterlagenempfehlung | ✗ | Nicht vorhanden |
| „✓ Rechtschreibung“ (Prüfung mit Diff-Vorschau, Signatur/Zitat unverändert; `text-korrigieren`) | Korrektur | ◐ | `textKorrigieren` existiert (`arbeitsmittel-aktionen.ts`, genutzt in `AufgabeDetail.tsx`), aber nicht im Postfach-Editor eingebunden; keine Diff-Vorschau |
| Rechtschreib-Textfeld (Wellenlinie, Vorschläge, „Ignorieren“, „Ins Wörterbuch“) | Live-Prüfung | ✗ | Nur Browser-Prüfung |
| „💾 Als Entwurf“ / „Entwurf aktualisieren“ / „✏ Entwurf bearbeiten“ | Entwürfe | ✗ | Keine Entwürfe |
| „✈ Senden“ mit Prüfung (Empfänger, Betreff, leerer Text, Postfach) | Versand | ✓ | `nachrichtSenden` (Adressprüfung, Policy-Prüfung vor Versand, Rollback bei Fehler) |
| Gesendete Mail speichern (`mail_versendet`) und im Verlauf eintragen | Nachweis | ✓ | Ordner `gesendet`, `aktivitaeten` (Richtung ausgehend) |
| Antwort im Thread (In-Reply-To/References) | Verkettung | ✓ | `inReplyTo`, `references`, `threadId` in `nachrichtSenden` |
| Abbrechen | Formular schließen | ✓ | Knopf „Abbrechen“ in `NachrichtDetail.tsx` |

### Mail-Einstellungen (Signaturen, Abwesenheit, Regeln, Kategorien, blockierte Absender)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Signatur je Postfach (Freitext, „wie in einem Mailprogramm“) | Signaturverwaltung | ◐ | Schalter „Signatur anhängen“ je Postfach (`postfachAendern`); Inhalt fest aus Profil/Erscheinungsbild |
| Abwesenheit (Aktiv/Aus, Von, Bis, Text der automatischen Antwort) | Autoantwort | ✗ | Nicht vorhanden |
| Regeln: Wenn Absender/Betreff/Mail-Text enthält/beginnt/endet/ist → verschieben, gelesen, markieren, Kategorie; aktivieren/deaktivieren; „Regeln jetzt auf Bestand anwenden“ | Regelwerk | ✗ | Keine Tabelle `mail_regeln`; Ordner/Regeln bleiben beim Anbieter |
| Eigene Ordner umbenennen/löschen | Ordner | ✗ | Keine Ordner |
| Kategorien anlegen (Farbe) | Kategorien | ✗ | Nicht vorhanden |
| Blockierte Absender (serverseitig → Junk bei jedem Abruf, „Freigeben“) | Sperrliste | ✗ | Nicht vorhanden |
| Fachwörterbuch für die Rechtschreibprüfung | Wörterbuch | ✗ | Nicht vorhanden |
| Einstellungen-Dialog erreichbar aus dem Posteingang („⚙ E-Mail-Einstellungen“) | Zugang | ✓ | Link „Postfächer verwalten“ → `/einstellungen/postfaecher` |
| Postfach trennen (Inhalte anonymisieren) / endgültig entfernen | Verbindung lösen | ✓ | `postfach_trennen()`, `postfachLoeschen` — Ergänzung |
| Aufbewahrungsfrist je Unternehmen | Datensparsamkeit | ✓ | `nachrichten_aufbewahrung_monate` (Migration `20260903160000_postfaecher.sql`) — Ergänzung |

### Zusammenfassung Kachel Posteingang

Zählung über alle Tabellen der Kachel (77 Zeilen): **✓ 25 · ◐ 13 · ✗ 39.**

Wichtigste Lücken:
1. **Kein Mail-Client im Sinn der Referenz** — bewusste Entscheidung (docs/AUTONOMIE.md Abschnitt 6, „reduziertes Postfach“): keine Ordner (Entwürfe, Archiv, Junk, Papierkorb, eigene), keine Regeln, keine Kategorien, keine Kennzeichnung, keine Abwesenheit, keine Sperrliste, keine Sammelaktionen, kein Löschen/Verschieben, kein Drucken.
2. **Antworten:** kein „Allen antworten“, kein Weiterleiten, kein Zitat, kein BCC, keine Entwürfe, keine Empfänger-Autovervollständigung aus dem CRM, keine freien Anhänge (nur Rechnung/Brief/Kalenderdatei).
3. **KI-Aktionen** deutlich schmaler: Antwortentwurf ohne Schreibstil und ohne Objektunterlagen/-fakten, keine Unterlagenempfehlung, keine ToDo-/Termin-Erkennung aus markierter Textstelle, keine Zusagen-Erkennung nach Versand, keine Zusammenfassung als Notiz, kein Termin aus der Mail in den Kalender.
4. **Editorhilfen:** Termin einfügen, Notiz einfügen, Rechtschreibprüfung mit Diff und Wörterbuch fehlen (Korrekturfunktion existiert, ist aber nicht angebunden).
5. **Liste:** keine Quellen-/Portalerkennung, keine Sortierung, nur Ungelesen-Filter, keine Unterhaltungsansicht, keine Live-Aktualisierung.
6. **Anhänge:** kein Direkt-Download, kein Schwärzen aus dem Postfach, keine KI-Benennung.

Vorhanden und tragfähig: Mehr-Postfach-Betrieb (IMAP, Microsoft 365, Google) mit verschlüsselten Zugangsdaten, Hintergrundabruf mit Fehlerzähler, Volltextsuche, automatische Objekt-/Kontaktzuordnung mit Konfidenz und Grund, manuelle Zuordnung, Anhänge in Objekt-Unterlagen, Antwort im Thread mit Signatur, KI-Entwurf mit Credits und Kennzeichnung, Übernahme als Mietanfrage/Aufgabe/Lead, Aufbewahrungsfrist und Trennen mit Anonymisierung, Unternehmenspostfächer mit Freigaben.


---

# Funktionsinventar Referenz → ImmoOffice.ai: Marketing · Werkzeuge · Dokumente · Firmen-Cloud-Ablage

Quelle: ausschließlich die Text-Inventare `MarketingPage.txt`, `WerkzeugePage.txt`,
`BildEditorPage.txt`, `DokumentePage.txt`, `DokumenteMitBriefen.txt`, `BriefeBereich.txt`,
das Inventar der Bürobildschirm-Seite, das Inventar der Firmen-Cloud-Ablage-Seite und
`_technik.txt` (Stand 2026-09-04).
Abgleich gegen den Stand im Repository (Pfade relativ zu `/home/user/Immooffice.ai`).

Legende: ✓ vorhanden (mit Fundstelle) · ◐ teilweise (Lücke benannt) · ✗ fehlt ·
**gestrichen** = laut Masterprompt/`docs/SCOPE.md` bewusst nicht im Scope.
Zeilen mit „(Zusatz)“ sind Funktionen, die ImmoOffice.ai über die Referenz hinaus hat;
sie zählen in den Zusammenfassungen nicht mit.

Hinweis zur Quelle: Die Referenz-Bundles enthalten fachfremde Bestandteile (z. B. Vertrags-Word-
Erzeugung, Übergabeprotokoll-Unterschrift, Bank-CSV-Import). Sie sind am Ende der jeweiligen
Kachel als „fachfremd“ vermerkt und nicht mitgezählt.

---

## Kachel Marketing

### Unterkacheln (Einstieg)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Unterkachel „Vorlagen“ | Social-Media-Kacheln aus Objektdaten erstellen | ◐ | `src/app/(app)/marketing/page.tsx`: 6 feste Formate als SVG-Motiv; keine Vorlagengruppen, keine Eingabefelder |
| Unterkachel „Ablage“ | Marketing-Dateien mandantenweit verwalten | ✗ | keine Marketing-Ablage; Dateien nur je Objekt (`src/components/DokumentUpload.tsx`) |
| Unterkachel „KI-Bildbearbeitung“ | KI-Funktionen auf Fotos anwenden | ✓ | integriert im Bild-Editor: `src/app/(app)/werkzeuge/bild-editor/page.tsx`, `src/lib/ki/bild.ts` |
| Unterkachel „Print-Materialien“ | Visitenkarten, Flyer & Co. druckfertig | ◐ | Flyer A5, Postkarte A6, Verkaufsschild A3 als Objektmotiv (`src/lib/marketing/vorlagen.ts`); keine PDF-Vorlagen mit Feldern, keine Visitenkarte |
| Unterkachel „Bild-Editor“ | Zuschneiden, weichzeichnen, Text & Logo | ✓ | `src/components/werkzeuge/BildEditor.tsx` (unter Werkzeuge, nicht unter Marketing) |
| Unterkachel „Bürobildschirm“ | Playlist des Bürobildschirms steuern | ✗ **gestrichen** | `docs/SCOPE.md` Zeile 81 (Digital Signage: NEIN) |
| Rechte-Modul „Marketing“ | Zugriff auf die Kachel steuern | ✓ | `src/lib/auth/rechte.ts` Zeile 17/28 (Modul `marketing`) |

### Vorlagen — gemeinsamer Rahmen

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kachel-Übersicht in Gruppen | Instagram Post Immobilie / Instagram Post Allgemein / Schaufenster-Aushang / Bürobildschirm / Portal-Hauptbild | ◐ | `src/app/(app)/marketing/page.tsx`: flache Kartenliste der 6 Formate, keine Gruppen |
| Objekt wählen | Objektbezug für die Vorlage setzen | ◐ | Chips der letzten 8 Objekte (`marketing/page.tsx`), keine Suche, kein Wechsel per Dialog |
| Daten aus dem Objekt übernehmen | Titel, Ort, Eckdaten, Preis, Vermarktungsart | ✓ | `src/app/api/marketing/[objektId]/[format]/route.ts` |
| Branding einsetzen | Firmenname, Farben, Kontakt aus dem Mandanten | ✓ | `route.ts` (Tabelle `mandant_branding`) |
| Logo in der Kachel (Logo-Box) | Firmenlogo als Grafik im Motiv | ◐ | Firmenname nur als Text (`src/lib/marketing/vorlagen.ts` Zeile 239); Logo-Datei nur im Bild-Editor |
| „Aus Exposé befüllen“ (KI-Import) | PDF-Exposé hochladen (max. 10 MB), KI liest Headline, Eckdaten, Ausstattung, Adresse, Beschreibung; Vorschlag prüfen, „Daten übernehmen“, Pin automatisch setzen | ✗ | keine Exposé-Auslese; `src/lib/ki/auslese.ts` wird nur für `beleg`, `energieausweis`, `maklervertrag`, `notar_anhang`, `zaehlerstand` genutzt |
| Objektbilder hochladen (mehrere) | Eigene Fotos in die Kachel setzen, Bild entfernen | ✗ | Motiv hat nur eine Platzhalterfläche (`vorlagen.ts`: „Platzhalter, solange kein Objektbild hinterlegt ist“) |
| Bild aus den Objektfotos wählen (ObjektBildWahl) | Klick setzt Objektfoto ins Feld | ✗ | s. o. — kein Bild im Motiv |
| Bildausschnitt wählen (Zuschnitt-Dialog mit Zoom) | Ausschnitt per Ziehen/Zoom, „Ausschnitt übernehmen“ | ◐ | Zuschnitt nur im Bild-Editor (`BildEditor.tsx` Werkzeug „Zuschnitt“), nicht in der Vorlage |
| Vorschau (skaliert) | Live-Vorschau der Kachel | ✓ | `marketing/page.tsx` bindet das SVG ein |
| Export PNG (1080×1080 / 1080×1920 …) | Kachel als PNG herunterladen | ◐ | nur SVG-Download (`download="…svg"`), keine PNG-Rasterung |
| „Beim Speichern auch in die Marketing-Ablage hochladen“ | Export zusätzlich ablegen | ✗ | keine Marketing-Ablage |
| Export als Video 1:1 / 9:16 | animierte Kachel (~6 s) als MP4/WebM aufnehmen | ✗ | keine Videoerzeugung im Repository |
| Multi-Export (Karussell) | mehrere Bilder als einzelne PNGs | ✗ | — |
| „Erstellt von · Datum“ | Urheber-Vermerk unter der Vorlage | ✗ | — |
| Kostenfrei ohne KI | Motiverzeugung ohne Credits | ✓ | `route.ts` (Kommentar: kostet keine Credits) |
| KI-Kennzeichnung im Motiv (Zusatz) | Hinweis „Text KI-erzeugt“ im Bild | ✓ | `route.ts` `kiHinweis`, `vorlagen.ts` Zeile 222 |

### Vorlagen — Kachelarten (jede einzeln)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Hauptbild Instagram (1:1) | Objektfoto, Headline Zeile 1/2 (Zeile 2 in Gold), Headline-Größe ±10 %/Reset, Subline PLZ Ort, Vermarktungsart Verkauf/Vermietung, Objektart, bis 4 Eckdaten, Preis | ◐ | Format `instagram_post` (`vorlagen.ts`): Titel, Ort, 3 Eckdaten, Preis automatisch; keine editierbaren Felder, kein Foto, keine Gold-Zeile |
| Verkauft-Banner | Vorlage für verkaufte Objekte, Badge automatisch oben rechts, Wohnfläche/Grundstück | ✗ | — |
| Standortkarte | Kartenkachel mit Ort/Überschrift, Badge, Unterzeile, Kartenstil (Hell+/Minimal/Dunkel), Gold-Pin, Zoom | ✗ | keine Kartenkachel; Geokodierung nur für Fahrzeit/Infrastruktur (`objekte.lat/lon`) |
| Standort-Picker | Adresse suchen, Pin ziehen, Karte verschieben/zoomen, Fehlermeldungen | ✗ | — |
| Karussell-Folgebild | Raumbild + Raumbezeichnung (Gold/Weiß), mehrere Bilder, je Bild ein PNG | ✗ | — |
| Coming-Soon-Story (9:16) | Headline, Beschreibungstext, PLZ Ort, Objektbezeichnung, Eckdaten (Grundstück, Erschließung, Stellplätze, Nutzfläche, Räume, Zimmer, Balkon/Terrasse, Bäder) | ◐ | Format `instagram_story` 9:16 aus Objektdaten; kein „Coming soon“-Modus, keine Freitexte, keine Erschließung/Stellplätze |
| Energieausweis-Story | Ausweisart Bedarf/Verbrauch, Baujahr, Endenergie → Klasse automatisch, Energieträger, Balken; Befreiung nach § 79 GEG mit Grund; Pflichtangabe § 87 GEG | ✗ | Energiewerte am Objekt vorhanden (`src/lib/objekt-begriffe.ts` `ENERGIEKLASSEN`), keine Kachel, keine Klassenberechnung aus dem Kennwert |
| Energieausweis-PDF für die Story auslesen | PDF hochladen, Pflichtangaben erkennen, Diagnose-Textauszug | ◐ | Auslesung nur am Objekt (`src/server/werkzeuge-aktionen.ts` `energieausweisAuslesen`), nicht in der Vorlage |
| News-Post (Post + Story) | Titel, Badge, Quelle und Datum in der Fußzeile, Domain, Kernaussagen, „Mehr dazu in der Caption“ | ✗ | — |
| News-Thema aus dem Briefing wählen | Themenliste des aktuellen News-Briefings, Kernaussagen automatisch | ✗ | kein News-Briefing im Repository |
| News-Kernaussagen per KI | Kernaussagen generieren, „+ Aussage“, Entfernen, neu generieren | ✗ | — |
| News-Caption per KI | Instagram-Caption mit Hashtags, Kopieren | ✗ | — |
| Instagram-Caption per KI (Objekt) | Caption aus Hauptbild und Eckdaten, Hashtags am Ende, Neu generieren, in Zwischenablage | ✗ | KI-Texte nur Exposé-Arten (`src/lib/ki/typen.ts` `TEXTARTEN`: Titel, Kurz-, Objekt-, Ausstattungs-, Lagebeschreibung, Zielgruppe) |
| Schaufenster-Aushang (quer) | Hintergrundfoto quer, Titel + Titel-Größe, Ort/Untertitel, bis 4 Eckdaten, Preis-Anzeige Kaufpreis/Kaltmiete/Auf Anfrage | ◐ | Schaufensteraushang A4/A3 **hoch** als Exposé-PDF (`src/lib/expose/vorlage-aushang.tsx`): Bild, Titel, 3 Kennzahlen, Preisband, Kontakt; keine Eingabefelder, kein Querformat |
| Aushang: QR-Code-Link | QR aus Link, Größe Kleiner/Größer | ✗ | kein QR-Code-Erzeuger im Repository |
| Aushang: „VERKAUFT“/„RESERVIERT“-Banner | großer diagonaler Banner, nur einer aktiv | ✗ | — |
| Aushang: Energiekennwerte (§ 87 GEG) | Ausweisart, Endenergie, Träger, Baujahr, Klasse (automatisch), „kein Ausweis erforderlich“, Energieskala | ◐ | Exposé-Vorlagen zeigen Energiedaten tabellarisch (`src/lib/expose/gemeinsam.tsx` Zeile 138); Aushang ohne Energieblock, keine Skala |
| Bürobildschirm-Video (9:16) | drei Fotos (Hero, Bildwechsel 2/3) wählen, zuschneiden, sortieren; Titel, Ort, Eckdaten, Preis, QR, Energie automatisch; 16-s-Video rendern, hochladen, direkt auf den Bildschirm legen oder in die Mediathek | ✗ **gestrichen** | `docs/SCOPE.md` Zeile 81 |
| Portal-Hauptbild (4:3) | Objektfoto formatfüllend, Logo-Box, Gold-Balken, roter Kreis (Text mehrzeilig, Farbe Rot/Gold/Grün, Größe, Position), Pfeile hinzufügen (Position, Drehung); Speichern legt Kopie an | ◐ | Format `objektanzeige` 1,91:1 aus Objektdaten; Bild-Editor bietet Text und Logo (`BildEditor.tsx`), aber keine Kreise/Pfeile |
| Verkaufsschild A3, Flyer A5, Postkarte A6 (Zusatz) | weitere Druckformate aus Objektdaten | ✓ | `src/lib/marketing/vorlagen.ts` `FORMATE` |

### Marketing-Ablage

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zwei Bereiche: Portal-Dateien / Marketingmaterialien | automatisch abgelegte Vorlagen-Exporte und KI-Ergebnisse getrennt von allgemeinen Materialien | ✗ | — |
| Einzeldateien hochladen (Bild, PDF, SVG) | Upload mit Fortschritt | ✗ | Uploads nur je Objekt (`src/components/DokumentUpload.tsx`, `BildUpload.tsx`) |
| Ganzen Ordner hochladen | Ordnername abfragen, Fortschritt x/y, Fehlerzählung | ✗ | — |
| Ordner-Gruppierung („Allgemein“, eigene Ordner) | Dateien nach Ordnern anzeigen | ✗ | — |
| Datei löschen (nur eigene, sonst Inhaber) | Löschregel nach Urheber | ◐ | Löschen je Objekt-Unterlage mit Recht `objekte.aendern` (`src/server/dokument-aktionen.ts` `dokumentLoeschen`); keine Urheberregel |
| Post in die Vorlage zurückladen | gespeicherte Vorlagendaten erneut bearbeiten | ✗ | — |
| Caption zur Datei anzeigen/kopieren | zugehörige Caption mitspeichern | ✗ | — |

### KI-Bildbearbeitung

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Funktion wählen: Retusche | Beschreibung, was entfernt/geändert wird | ✓ | `src/lib/ki/bild-zwecke.ts` `retusche` + Zusatzhinweis |
| Funktion: Himmel | Wunsch-Himmel als Text, sonst blauer Himmel | ✓ | `bild-zwecke.ts` `himmel` + Zusatzhinweis |
| Funktion: Home Staging | Einrichtungsstil (Modern, Skandinavisch, Industrial, Landhaus, Luxuriös) + Wünsche | ◐ | `bild-zwecke.ts` `homestaging` fest „modern, hell“; Stil nur über Freitext-Hinweis |
| Funktionen: Winterszene, Weihnachtsszene, Nachtszene, Golden Hour, Sommerszene | Jahres-/Tageszeit-Szenen | ✗ | nicht in `BILD_ZWECKE` |
| Funktionen: Personen hinzufügen / entfernen | Personen ins Bild setzen oder entfernen | ✗ | „Störendes entfernen“ nennt Personen nur beiläufig |
| Funktion: Aufräumen | Unordnung entfernen | ◐ | über `retusche` mit Hinweis möglich, kein eigener Zweck |
| Belichtung/Farben optimieren (Zusatz) | dezente Optimierung per KI | ✓ | `bild-zwecke.ts` `optimierung` |
| Bild hochladen (JPEG/PNG/WEBP, max. 15 MB), anderes Bild wählen | Eingabebild bereitstellen | ✓ | `BildEditor.tsx` „Bild laden“; KI-Grenze 12 MB (`werkzeuge-aktionen.ts` `bildKiBearbeiten`) |
| Dreischritt-Assistent (1 Funktion, 2 Bild, 3 Einstellungen) mit Dauer-Hinweis | geführte Bedienung | ◐ | Reiter „KI“ mit Auswahl, Hinweis und Start; kein Assistent |
| Kostenanzeige vor dem Start | „Kosten dieser Bearbeitung: ca. …“ | ◐ | Preise in `credit_preise` (`supabase/migrations/20260904150000_werkzeuge.sql` Zeile 88–90); im Editor keine Kostenanzeige |
| Ergebnis herunterladen | Bearbeitetes Bild lokal speichern | ✓ | `BildEditor.tsx` Ausgabe JPG/PNG |
| Vorher/Nachher | Vergleich Original/Ergebnis | ✓ | `BildEditor.tsx` Umschalter „Vorher/Nachher“ |
| In Marketing-Ablage übernehmen | Ergebnis zentral ablegen | ◐ | Ersatz: „Am Objekt speichern“ als Version (`werkzeuge-aktionen.ts` `bildVersionSpeichern`) |
| Letzte Bearbeitungen (Historie mit Links) | mandantenweite KI-Historie | ◐ | Versionen je Bild in der Galerie (`src/components/Bildergalerie.tsx` Zeile 64–120); keine übergreifende Historie |
| Credits reservieren, einlösen, bei Fehler freigeben | Abrechnung je Bearbeitung | ✓ | `bildKiBearbeiten` (`credits_reservieren`/`einloesen`/`freigeben`) |
| KI-Kennzeichnung (unlöschbar, auch in Exporten) | Ergebnis bleibt als KI-bearbeitet markiert | ✓ | `supabase/migrations/20260817041844_objektbilder_und_versionen.sql` Zeile 58; `src/app/expose/[token]/page.tsx` Zeile 282; `src/lib/expose/vorlage-aushang.tsx` Zeile 123 |
| Provider austauschbar | Bildmodell über Basis-URL umstellbar | ✓ | `src/lib/ki/bild.ts` (`OPENAI_BASIS_URL`, `OPENAI_BILDMODELL`) |
| Ausweis-Texterkennung im Browser (Name, Geburtsdatum, Anschrift aus Ausweisfoto) | OCR für Objektnachweis (fachfremd im Bundle) | ✗ | keine Ausweis-OCR; Foto-Auslese nur für Zähler/Belege (`src/lib/ki/auslese.ts` `bildAuslesen`) |

### Print-Materialien

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Übersicht der Print-Vorlagen mit Vorschaubild und Kategorie (Visitenkarte, Flyer, Briefpapier, Roll-Up, Aufkleber, Schild, Sonstiges) | Vorlagen für Mitarbeiter | ◐ | Flyer A5, Postkarte A6, Verkaufsschild A3 als Objektmotive (`vorlagen.ts`); keine Visitenkarte, kein Roll-Up, keine Kategorien |
| Profildaten automatisch einsetzen | Vor-/Nachname, Titel, Funktion, Mobil, E-Mail, Firma, Bürotelefon, Anschrift, Website | ✗ | Marketingmotive nutzen nur Firmenbranding, keine Personendaten |
| „Deine Angaben“ je Vorlage anpassen | Änderungen nur für dieses PDF | ✗ | — |
| Druckfertiges PDF herunterladen | PDF-Formularfelder befüllen und flach speichern | ✗ | Marketing liefert SVG, keine PDF-Formularbefüllung |
| PDF-Vorschau | Vorschau vor dem Download | ◐ | SVG-Vorschau der Motive |
| „Zum Drucker“ (Bestell-Link) + Bestell-Hinweis | vorkonfigurierter Warenkorb beim Drucker | ✗ | — |
| Vorlagenverwaltung (Inhaber): Name, Kategorie, Beschreibung, PDF-Vorlage hochladen mit Felderkennung, Vorschaubild, Feld-Zuordnung PDF-Feld ↔ Profilwert, Bestell-Link, Bestell-Hinweis, Aktiv/ausgeblendet, Sortierung, Bearbeiten, Löschen, Anleitung | Vorlagen anlegen und pflegen | ✗ | keine Tabelle, keine Seite |

### Bild-Editor (Referenz: eigene Seite unter Marketing)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Bild(er) laden: JPG, PNG, WebP und RAW (ARW, CR2, CR3, NEF, DNG, RAF, RW2, ORF, SRW, PEF) | Dateiauswahl | ✓ | `BildEditor.tsx` (`accept="image/*,.arw,…"`), `src/lib/werkzeuge/raw.ts` `RAW_ENDUNGEN` |
| Drag & Drop („Bild hier ablegen“) | Dateien in die Fläche ziehen | ✗ | nur Dateiauswahl |
| RAW-Entwickler-Dialog | Belichtung (EV), Kontrast, Lichter, Tiefen, Weiß, Schwarz, Wärme, Sättigung; Lichter-Rekonstruktion (Beschneiden/Überblenden/Rekonstruieren); Auto; Zurücksetzen; Einstellungen kopieren/einfügen; letzte Einstellungen je Datei; Vorschau + volle Auflösung | ◐ | RAW über LibRaw-WASM oder eingebettete Vorschau (`BildEditor.tsx` Zeile 123–152, `raw.ts`); keine Entwicklungsregler |
| Serie / Stapel: mehrere Bilder, Zurück/Weiter, „Alle speichern“, Serie schließen | Stapel-Upload in ein Objekt | ✗ | Einzelbild; Mehrfach-Upload nur in der Galerie (`src/components/BildUpload.tsx` `multiple`) |
| Immobilie wählen (Dialog mit Suche nach Bezeichnung, Adresse, Nr.) | Objektbezug setzen | ◐ | Auswahlliste „Objekt“ ohne Suche (`BildEditor.tsx`) |
| Objektbild öffnen (Zusatz) | vorhandenes Objektbild in den Editor laden | ✓ | `bild-editor/page.tsx` (signierte URLs), `BildEditor.tsx` „Objektbild öffnen“ |
| Als Hauptbild setzen | Ergebnis zum Titelbild machen | ◐ | nur in der Galerie („Als Titelbild“, `Bildergalerie.tsx` Zeile 145), nicht im Editor |
| Rückgängig | letzten Schritt zurücknehmen | ◐ | „Zurücksetzen“ (Farben) und „Letzten entfernen“ (Regionen); kein allgemeines Rückgängig |
| Zuschneiden (Rechteck aufziehen, anwenden) | Ausschnitt | ✓ | `BildEditor.tsx` Werkzeug „Zuschnitt“, Seitenverhältnis frei/3:2/4:3/16:9/Quadrat |
| Größe ändern (Breite, Höhe, Seitenverhältnis behalten) | Skalieren | ✓ | Werkzeug „Größe & Drehen“: Zielbreite, Drehen 90°, Spiegeln |
| Weichzeichnen: Rechteck oder Pinsel, Stärke, Pinselgröße | Bereiche unkenntlich machen | ◐ | Rechteck mit Verpixeln/Weichzeichnen; kein Pinsel, keine Stärke |
| Farben: Helligkeit, Kontrast, Sättigung, Anwenden, Zurücksetzen | Korrekturen | ✓ | Werkzeug „Farben“ |
| Text: mehrzeilig, Schriftart, Größe, Standardfarben Blau/Gold, eigene Farbe, per Ziehen positionieren | Text einfügen | ◐ | Text, Größe über aufgezogenen Bereich, Farbe wählbar (`TextEbene.farbe`); keine Schriftartwahl, keine Standardfarben-Knöpfe |
| Logo: Variante 1/2, Ecke, Größe in % der Breite | Firmenlogo einblenden | ◐ | Firmenlogo aus dem Branding, 4 Ecken, Größe; nur eine Logovariante |
| Export | Bild herunterladen | ✓ | Ausgabe JPG/PNG |
| Speichern in Immobilie | Ergebnis als Bild-Datei am Objekt | ✓ | `werkzeuge-aktionen.ts` `bildVersionSpeichern` (Bildart wählbar, Original bleibt) |
| Verarbeitung lokal („Fotos werden nicht hochgeladen“) | Datenschutz-Hinweis | ✓ | `src/app/(app)/werkzeuge/page.tsx` Beschreibung (Ausnahme KI und Speichern) |

### Bürobildschirm (Referenz-Seite; gestrichen)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Playlists Live/Test: Medien hinzufügen aus der Mediathek, Reihenfolge ziehen, Dauer je Medium (Sek.), Entfernen, „In Test speichern“, „Live übertragen“ | Playlist-Verwaltung | ✗ **gestrichen** | `docs/SCOPE.md` Zeile 81/125 |
| Live-Vorschau mit Auto-Aktualisierung (20 s), „Jetzt aktualisieren“ | Bildschirminhalt sehen | ✗ **gestrichen** | — |
| Bildschirm-Status Online/Offline, Auflösung, „Bildschirm aktualisieren“ (Push) | Gerät steuern | ✗ **gestrichen** | — |
| Video aus der Vorlage direkt übertragen | Kopplung Vorlage → Bildschirm | ✗ **gestrichen** | — |

### Fachfremd im Marketing-Bundle (nur Hinweis, nicht gezählt)

- Unterschriftsfeld/Vollbild-Signatur und Übergabeprotokoll-PDF (Stammdaten, Schlüssel, Zähler, Räume, Rauchmelder) → Kacheln Verkauf/Vermietung: `src/components/verkauf/Unterschriftsfeld.tsx`, `src/components/verkauf/UebergabeAssistent.tsx`, `src/lib/verkauf/uebergabe.ts`.
- „Schnell hinzufügen“ Räume/Zähler → Übergabeprotokoll (`src/lib/verkauf/uebergabe.ts`).
- Word-Erzeugung Maklervertrag, Mietvertrag, Vollmacht, Objektnachweis (Bundle „SuccessBox“) → Kacheln Verkauf/Vermietung (`src/lib/dokument/word.ts`, `src/server/vertrag-aktionen.ts`).
- Navigation und Rollenvorlagen (Chef, Standortleitung, Makler, Assistenz) → Admin/Rechte (`src/lib/auth/rechte.ts`).

### Zusammenfassung Marketing

Gezählt (ohne Zusatz-Zeilen, ohne fachfremd): **✓ 20 · ◐ 27 · ✗ 40** (davon 6 gestrichen).

Wichtigste Lücken:
1. **Vorlagen ohne Foto und ohne Eingabefelder** — die Motive sind reine Datenkacheln (Platzhalterfläche statt Objektbild), Export nur als SVG, keine PNG/Video-Ausgabe.
2. **Fehlende Kachelarten:** Verkauft-Banner, Standortkarte (mit Pin-Picker), Karussell, Energieausweis-Story, News-Post; kein QR-Code, keine Verkauft/Reserviert-Banner, keine Energieskala im Aushang.
3. **Keine Marketing-Ablage** (Upload einzeln/Ordner, Zurückladen in die Vorlage, Caption).
4. **Keine KI-Texte fürs Social Media** (Captions, Hashtags, News-Kernaussagen); KI-Bild ohne Szenen (Winter, Nacht, Golden Hour …) und ohne Personen-Funktionen.
5. **Print-Materialien:** keine PDF-Vorlagen mit Feldzuordnung, keine Profildaten, kein Bestell-Link, keine Vorlagenverwaltung.
6. **Bild-Editor:** kein Stapel/Serie, kein Drag & Drop, kein RAW-Entwickler mit Reglern, kein Pinsel beim Weichzeichnen, kein Ausweis-OCR.
7. **Kein Exposé-Import** („Aus Exposé befüllen“ per KI).

---

## Kachel Werkzeuge

### Einstieg und gemeinsame Bausteine

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Werkzeug-Übersicht mit Hinweis „läuft im Browser, Dateien verlassen das Gerät nicht“ | Einstiegsseite | ✓ | `src/app/(app)/werkzeuge/page.tsx` |
| „← Alle Werkzeuge“ | Rücksprung | ✓ | `werkzeuge/pdf/page.tsx`, `grundriss/page.tsx`, `wohnflaeche/page.tsx`, `bild-editor/page.tsx` |
| Objektwähler (Suche Bezeichnung/Straße/Ort/Objekt-Nr., Objekt ändern, Objektbezug entfernen) | Objektbezug je Werkzeug | ◐ | Auswahllisten je Werkzeug und Vorbelegung über `?objekt=` (`grundriss/page.tsx`, `wohnflaeche/page.tsx`, `BildEditor.tsx`); keine Suche |
| Drop-Zone (Drag & Drop) mit Datenschutz-Hinweis | Datei per Ziehen laden | ◐ | Hinweis vorhanden (`PdfWerkzeuge.tsx` „Die Dateien bleiben im Browser“); nur Dateiauswahl, kein Drag & Drop |
| Erfolgs-/Fehlerboxen | Rückmeldungen | ✓ | `src/components/ui/Status` (`Hinweis` ton=erfolg/fehler/warnung) |

### PDF-Werkzeuge

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zusammenfügen: mehrere PDFs, Reihenfolge ändern, Seitenanzahl je Datei, „n PDFs zusammenfügen (m Seiten)“ | Dateien verbinden | ✓ | `src/components/werkzeuge/PdfWerkzeuge.tsx` `Zusammenfuegen` (Pfeile, Entfernen; zeigt Dateigröße statt Seitenzahl) |
| Teilen: Seitenbereich „1-3, 5, 8-10“ als Auszug | Seiten extrahieren | ✓ | `PdfWerkzeuge.tsx` `Teilen` (`bereichParsen`) |
| Teilen: jede Seite einzeln als ZIP | Einzelseiten | ✓ | `Teilen` + `src/lib/werkzeuge/zip.ts` |
| Seiten bearbeiten: Vorschau je Seite, Drehen, Löschen (markieren/wiederherstellen), Umsortieren, Zähler „gedreht/zum Löschen“, Download | Seitenoperationen | ✓ | `PdfWerkzeuge.tsx` `SeitenBearbeiten` |
| Komprimieren: Bilder rekomprimieren (JPEG und PNG-artige Bilder, Stufen Leicht/Mittel/Stark mit max. px), Text bleibt durchsuchbar | Dateigröße bei Erhalt des Textes senken | ◐ | Stufe „stark“ rastert ganze Seiten (Text geht verloren); keine Bild-Rekompression bei erhaltenem Text (`Komprimieren`) |
| Komprimieren: „Verlustfrei optimieren“ (Struktur neu schreiben) | Minimale Ersparnis ohne Inhaltsänderung | ✓ | Stufe „leicht“ (`useObjectStreams`) |
| Komprimieren: Vorher/Nachher-Größe, Ersparnis %, Download deaktiviert ohne Ersparnis, Tipp bei Misserfolg | Ergebnisanzeige | ◐ | Ergebnis-Hinweis mit Prozent; Download erfolgt immer |
| Komprimieren: Diagnose (Bilder gefunden/übersprungen, „keine Bilder — Größe steckt in Schriften“) | Erklärung | ✗ | — |
| Schwärzen: automatische Erkennung Namen (Anreden, Titel, Rollen), Anschriften, Telefon/E-Mail, Bankverbindung, Ausweis-/Steuernummern, Geburtsdaten, Kunden-/Vertragsnummern, Flurstück/Gemarkung | Personendaten finden | ◐ | `Schwaerzen` `MUSTER`: IBAN, Telefon, E-Mail plus eigene Begriffe; keine Namens-, Adress-, Datums- oder Nummern-Heuristik |
| Schwärzen: Kategorien an/aus („Alle an“/„Alle aus“), einzelne Balken antippen, Fundstellenliste je Seite mit Anzahl | Treffer verwalten | ◐ | Rechtecke je Seite mit „zurücksetzen“; kein Ein-/Ausschalten einzelner Treffer, keine Kategorien |
| Schwärzen: Bereich manuell markieren („Bereich markieren“/„Markieren beenden“) | Handmarkierung | ✓ | Rechteck mit der Maus ziehen |
| Schwärzen: „Geschwärzt speichern“ | Download | ✓ | markierte Seiten werden als Bild neu aufgebaut |
| Schwärzen: „Am Objekt ablegen“ | Ergebnis als Unterlage speichern | ✗ | nur Download |
| Schwärzen: PDF aus Objekt-Unterlage laden (Quelle) | Datei aus der Objektakte wählen | ✗ | nur lokale Datei |

### Grundriss-Editor

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Blatt-Titel („Erdgeschoss · Straße 1“) | Bezeichnung des Grundrisses | ✓ | `GrundrissEditor.tsx` Feld „Bezeichnung“ |
| „Raum scannen“ (LiDAR-Scanner in der begleitenden App) | Scan direkt starten | ✗ | keine App; nur Import (`docs/FUNKTIONSABGLEICH.md` Kachel 12) |
| Scan-Datei laden (scan.json) → Wände, Türen, Fenster, Räume, Möbel als Zeichenblatt | Raumscan importieren | ✓ | `src/lib/werkzeuge/grundriss.ts` `ausRaumscan` (RoomPlan-JSON; anderes Format als die Referenz-App) |
| Zeichen-Editor: Wände, Türen (Anschlag), Fenster, Räume mit Fläche, Möbel, Maße, Text, Löschen, Raster, Zoom, Rückgängig | Grundriss zeichnen (in der Referenz extern eingebettet) | ✓ | `GrundrissEditor.tsx`, `grundriss.ts` (`MOEBEL` 13 Arten, `polygonFlaecheM2`) |
| Vorlage/Aufbereiter: Plan hinterlegen, Maßstab cm/px, Deckkraft (Zusatz) | vorhandenen Plan nachzeichnen | ✓ | `GrundrissEditor.tsx` Werkzeug „Vorlage“ |
| „Am Objekt speichern“ als PNG (Exposé) und PDF | Ablage am Objekt | ◐ | `werkzeuge-aktionen.ts` `grundrissAlsBild` legt PNG als Objektbild (Art Grundriss) ab; kein PDF |
| Speichern/Laden gespeicherter Grundrisse | Persistenz | ✓ | Tabelle `grundrisse` (`supabase/migrations/20260904150000_werkzeuge.sql`), `grundriss/page.tsx` Liste, `grundriss/[id]/page.tsx` |
| PNG/SVG herunterladen | Export | ✓ | `GrundrissEditor.tsx` „PNG herunterladen“/„SVG herunterladen“ |
| Weitergabe an den Wohnflächenrechner | Räume übernehmen | ✓ | `werkzeuge-aktionen.ts` `grundrissZurWohnflaeche` |

### Raumscan-Bereich

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Scan-Datei laden / „Scans auf dem Gerät“ | Scan öffnen | ◐ | Import nur im Grundriss-Editor (`gr-scan`), keine Geräteliste |
| Statistik (Räume, Wände, Türen, Fenster, Bodenfläche) | Kennzahlen des Scans | ◐ | Hinweis-Text nach dem Import (`ausRaumscan` `hinweis`) |
| Räume benennen (Namen gelten für Grundriss, Rechner, Nachweis, Ablage) | Raumnamen pflegen | ◐ | Raumname im Editor je Raum; wird in den Wohnflächenrechner übernommen |
| Scan-Qualität (Dauer, Tracking-Unterbrechungen, Wände sicher/mittel/unsicher, Hinweise) | Qualitätsblock | ✗ | — |
| Lichte Höhen / Dachschrägen-Zonen je Raum (voll/halb/keine/unbekannt) | Höhenanalyse | ✗ | — |
| Kontrollmaße (Laser) gegen Scan, Toleranz 20 mm / 0,5 %, Prüfvermerk | Plausibilitätsprüfung | ✗ | — |
| SVG-Vorschau des Scans | Ansicht | ◐ | Import wird direkt im Editor gerendert |
| „Am Objekt ablegen“ (JSON + SVG/PNG) | Ablage | ◐ | Grundriss mit Quelle „scan“ in `grundrisse`, PNG als Objektbild; keine JSON-Ablage als Unterlage |
| JSON / SVG herunterladen | Export | ◐ | SVG/PNG ja, JSON nein |
| „Grundriss zeichnen →“ / „Wohnfläche berechnen →“ | Verkettung | ✓ | Import → Editor → `grundrissZurWohnflaeche` |
| Abgelegte Raumscans laden | Liste | ◐ | Liste gespeicherter Grundrisse mit Marke „Raumscan“ (`grundriss/page.tsx`) |
| Rohdaten (LiDAR-Netz, MB) | Rohdaten-Hinweis | ✗ | — |

### Wohnflächenrechner

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kopf: Objekt/Titel, Anschrift, Bearbeitung, Datum | Stammdaten des Nachweises | ✓ | `WohnflaechenRechner.tsx` Bezeichnung, Anschrift, Objekt; Bearbeiter/Datum im PDF (`wohnflaeche-dokument.ts`) |
| Geschosse (2. UG … DG) hinzufügen/entfernen | Struktur | ✓ | `WohnflaechenRechner.tsx` „Geschoss hinzufügen/entfernen“ |
| Räume hinzufügen/entfernen, Raumname, Schnellknöpfe | Räume | ✓ | Schnellknöpfe Wohnzimmer … Keller |
| Raumart: Wohnraum / Balkon-Terrasse-Loggia / Wintergarten unbeheizt / Zubehörraum | Anrechnungsart | ✓ | `src/lib/werkzeuge/wohnflaeche.ts` `TEILART` (voll, halb, nicht, wintergarten, balkon ¼, balkon ½, zubehoer) |
| Teilfläche: Länge × Breite, Höhenkategorie (ab 2 m 100 %, 1–1,99 m 50 %, unter 1 m 0 %), Balkon-Prozent | Teilflächen | ✓ | `TEILART`, `teilAnrechenbar` |
| Abzug (Schornstein, Treppe) | Abzugsflächen | ✓ | Kontrollkästchen „Abzug“ |
| Figuren Rechteck/Dreieck/Trapez mit Formel | Sonderformen | ✗ | nur Rechteck oder direkte m² |
| Live-Summen je Raum/Geschoss, Wohnfläche gesamt, nachrichtlich Nutzfläche der Zubehörräume | Ergebnis | ◐ | `berechnen()` liefert Grund-/Wohnfläche je Raum, Geschoss, gesamt; keine gesonderte Nutzflächen-Summe |
| Bemerkungen (im PDF), Zusatz unter der Unterschrift | Freitexte | ◐ | „Hinweis im PDF“; keine Unterschriftszeile |
| Raumscan laden (Räume, Höhenzonen → Anrechnung, Abzüge Kamin/Treppe, Zerlegungsnachweis) | Automatik aus Scan | ◐ | Räume aus Grundriss/Scan mit Fläche „voll“ (`grundrissZurWohnflaeche`); keine Höhenzonen, keine Zerlegung |
| Stand sichern / Stand laden (JSON) | Zwischenstände | ◐ | Speichern in `wohnflaechen_berechnungen`; kein JSON-Export/-Import |
| PDF herunterladen (Kopf, Tabellen je Geschoss, Summen, Mess-/Berechnungsmethode, Kontrollmaße, Zerlegungsnachweis, Grundlagen § 3 Abs. 4 WoFlV) | Nachweis-PDF | ◐ | `/api/dokumente/wohnflaeche/<id>` (`src/app/api/dokumente/[art]/[id]/route.tsx`, `wohnflaeche-dokument.ts`): Grundlage, Tabellen je Geschoss, Ergebnis, Fußnote; ohne Kontrollmaße/Zerlegung/Methodenblock |
| „Am Objekt ablegen (PDF + Stand)“ | Ablage am Objekt | ◐ | Objektbezug und „Wohnfläche ins Objekt übernehmen“ (`wohnflaecheUebernehmen`); PDF nicht als Objekt-Unterlage abgelegt |
| Word-Fassung (Zusatz) | bearbeitbare Fassung | ✓ | `?format=docx` über `src/lib/dokument/word.ts` |

### Energieausweis (Referenz: Bestandteil der Marketing-Vorlage; hier Objektseite)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| PDF hochladen und auslesen, Pflichtangaben erkennen, Diagnose-Textauszug | Ausweis auslesen | ✓ | `werkzeuge-aktionen.ts` `energieausweisAuslesen` (PDF-Text + KI 2 Credits, Heuristik ohne KI); `src/components/werkzeuge/EnergieausweisKarte.tsx` |
| Werte prüfen und übernehmen (Ausweisart, Kennwert, Klasse, Träger, Baujahr Anlage, Baujahr, Warmwasser, Gültig bis) | editierbares Formular | ✓ | `EnergieausweisKarte.tsx`, `energiewerteUebernehmen` |
| Ablage als Unterlage „Energieausweis“ | Dokument am Objekt | ✓ | `energieausweisAuslesen` (Insert `objekt_dokumente`, Art `energieausweis`) |
| Klasse automatisch aus dem Kennwert berechnen | Klassenbestimmung | ✗ | Klasse wird nur aus dem Ausweis gelesen |
| Foto auslesen (Zusatz) | Ausweis als Bild | ✓ | `bildAuslesen` in `energieausweisAuslesen` |

### Entfernungen / Infrastruktur (Referenz: Edge „entfernungen-berechnen“ in der Exposé-Schmiede; hier Objektseite)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Entfernungen zu Einrichtungen ermitteln | 12 Kategorien (Kita … Spielplatz), Luftlinie, Gehminuten | ✓ | `src/lib/werkzeuge/infrastruktur.ts`, `src/components/werkzeuge/InfrastrukturKarte.tsx` |
| Anschrift verorten (Geokodierung mit Zwischenspeicher) | Koordinaten | ✓ | `werkzeuge-aktionen.ts` `infrastrukturErmittelnAktion` (`geokodierung_holen/merken`) |
| Lagetext aus den Entfernungen fürs Exposé | Textbaustein | ◐ | `infrastrukturSatz` nur in Tests genutzt (`werkzeuge.test.ts`), nicht in der Exposé-Erzeugung |

### Fachfremd im Werkzeuge-Bundle (nur Hinweis, nicht gezählt)

- Einstellungstest-Auswertung (Teil 1–6, Einladungslink) → laut `CLAUDE.md` ersatzlos gestrichen; eine eigene Bewerber-Fassung existiert unter `src/app/(app)/einstellungen/bewerber` (Kachel Verwaltung).
- onOffice-Test (Verbindung testen, synchronisieren, Bilder laden, Felder erkunden) → Kachel Integrationen: `src/integrationen/onoffice`, `src/app/(app)/einstellungen/integrationen`.

### Zusammenfassung Werkzeuge

Gezählt (ohne Zusatz-Zeilen, ohne fachfremd): **✓ 28 · ◐ 21 · ✗ 10**.

Wichtigste Lücken:
1. **Schwärzen:** Erkennung nur IBAN/Telefon/E-Mail/eigene Begriffe — keine Namens-, Adress-, Geburtsdatums- und Nummern-Heuristik, keine Kategorien und Fundstellenliste, kein „Am Objekt ablegen“, keine Quelle aus der Objektakte.
2. **Komprimieren:** keine Bild-Rekompression bei erhaltenem Text (nur Struktur oder Vollrasterung), keine Diagnose.
3. **Raumscan:** Qualitätsblock, Höhenzonen/Dachschrägen, Kontrollmaße mit Toleranz und Zerlegungsnachweis fehlen — damit auch die Automatik im Wohnflächenrechner (Höhen → Anrechnung, Abzüge).
4. **Wohnflächenrechner:** keine Figuren (Dreieck/Trapez), kein JSON-Stand, PDF ohne Methoden-/Kontrollmaß-/Zerlegungsblock, PDF nicht als Objekt-Unterlage.
5. **Grundriss:** kein PDF neben dem PNG; kein Drag & Drop, kein suchender Objektwähler.

---

## Kachel Dokumente

### Ablage

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zentrale Dokumentenablage (mandantenweit, ohne Objektbezug) | Dateien für das Unternehmen | ◐ | Unterlagen nur je Objekt (`objekt_dokumente`, `src/app/(app)/objekte/[id]/page.tsx` Zeile 298); kein Menüpunkt „Dokumente“ (`src/components/Navigation.tsx`) |
| Kategorie wählen („Allgemein“ …) | Einordnung | ✓ | 16 Dokumentarten `DOKUMENTARTEN` (`src/lib/dokumente.ts`), Auswahl in `DokumentUpload.tsx` |
| Dateien auswählen (mehrere), Fortschritt i/n | Mehrfach-Upload | ✓ | `DokumentUpload.tsx` (`multiple`, „Lädt hoch — i von n“) |
| Ganzen Ordner hochladen (Verzeichnisauswahl) | Ordner-Upload | ✗ | kein `webkitdirectory` im Repository |
| Fehlerliste je Datei | Sammelmeldung | ◐ | Fehler je Datei nacheinander (`DokumentUpload.tsx`) |
| Löschen (nur eigene, sonst Inhaber) | Löschregel | ◐ | `dokument-aktionen.ts` `dokumentLoeschen` mit Recht `objekte.aendern`; keine Urheberregel |
| Öffnen / Herunterladen | Download | ✓ | `dokumentVerweis` (signierter Link, 1 h) |
| Sichtbarkeit intern/Interessent, Vertraulichkeitssperre, Gültig-bis, Ablauf-Marke (Zusatz) | Schutz und Fristen | ✓ | `src/lib/dokumente.ts` `NUR_INTERN`, `Dokumentenliste.tsx`, Migration `20260817153407_dokumente_vertraulichkeit.sql` |

### Geschäftsbriefe

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Bereich „Briefe“ innerhalb Dokumente mit „← Zurück zu Dokumente“ | Einstieg | ◐ | eigener Menüpunkt `/briefe`, verknüpft mit Rechnungen (`src/app/(app)/briefe/page.tsx`) |
| Briefliste (neueste zuerst, Ersteller, Bearbeiten) | Übersicht | ✓ | `briefe/page.tsx` (Statusfilter Entwurf/PDF erstellt/Versendet) |
| „+ Neuer Brief“ / „Brief bearbeiten“ | Anlegen/Ändern | ✓ | `src/components/briefe/BriefAnlegen.tsx`, `BriefFormular.tsx`, `src/server/briefe-aktionen.ts` |
| Empfänger: Name/Firma*, Zusatz, Straße & Hausnummer, PLZ & Ort | Anschrift | ✓ | `BriefFormular.tsx`, `briefSpeichern` |
| Datum | Briefdatum | ✓ | Feld `datum` |
| „Ihr Ansprechpartner“ | Ansprechpartner im Kopf | ◐ | Unterzeichner + Funktion; kein gesondertes Ansprechpartner-Feld |
| Absender-Gesellschaft wählen (mehrere Gesellschaften/Standorte) | Briefpapier je Gesellschaft | ✓ | Absender/Briefpapier aus `rechnungs_absender` (`briefAnlegen`, `BriefFormular.tsx` „Absender / Briefpapier“) |
| Betreff* | Pflichtfeld | ✓ | `briefSpeichern` prüft |
| Brieftext (Absätze durch Leerzeile) | Fließtext | ✓ | Feld `text` |
| Grußformel, Unterzeichner, Funktion | Abschluss | ✓ | Felder `grussformel`, `unterzeichner`, `unterzeichner_funktion` |
| Speichern mit Pflichtfeldprüfung | Validierung | ✓ | `briefSpeichern` |
| „PDF erzeugen“ im Briefpapier | PDF | ✓ | `briefErstellen` → `pdfFestschreiben`; Download `/api/dokumente/brief/<id>` |
| Löschen mit Rückfrage | Entfernen | ✓ | `briefLoeschen` (PDF im Bucket wird mitgelöscht) |
| Vorlagen mit Platzhaltern (Flurkarte, Grundbuch, Altlasten, Baulasten, Eigentümer-Unterlagen, Vermarktungsbericht, Dank, frei) (Zusatz) | Textbausteine | ✓ | `src/lib/rechnungen.ts` `BRIEF_VORLAGEN` |
| Kontakt-/Objektbezug, Anrede automatisch (Zusatz) | Verkettung | ✓ | `briefAnlegen` (Eigentümer aus `kontakt_objekt`) |
| Word-Fassung, „Per E-Mail senden“ aus dem Postfach, Postversand vermerken (Zusatz) | Ausgabe/Versand | ✓ | `BriefFormular.tsx` Zeile 31–32, `briefAlsVersendet` |

### Fachfremd im Dokumente-Bundle (nur Hinweis, nicht gezählt)

- Urlaubs-/Abwesenheitsarten (Urlaub, Krank, Feiertag, Überstundenabbau …) → Kachel Verwaltung: `src/app/(app)/urlaub`, `src/app/(app)/arbeitszeit`.

### Zusammenfassung Dokumente

Gezählt (ohne Zusatz-Zeilen): **✓ 14 · ◐ 5 · ✗ 1**.

Wichtigste Lücken:
1. **Keine mandantenweite Ablage** — Unterlagen hängen immer an einem Objekt; kein Menüpunkt „Dokumente“, kein Ordner-Upload.
2. Löschregel „nur eigene Dateien“ und gesammelte Fehlerliste fehlen (Detail).
3. Briefe: eigenes Feld „Ihr Ansprechpartner“ fehlt; sonst vollständig und über die Referenz hinaus (Vorlagen, Word, Postfach-Versand).

---

## Kachel Firmen-Cloud-Ablage (Referenz-Modul; gestrichen laut Masterprompt)

| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Anmeldung beim Cloud-Anbieter (Popup), „Angemeldet als“, Abmelden | Zugang | ✗ **gestrichen** | `CLAUDE.md` „Ersatzlos entfallen“, `docs/SCOPE.md` Zeile 123 |
| Bereiche „Meine Dateien“ / „Mit mir geteilt“ | Navigation | ✗ **gestrichen** | — |
| Ordner durchsuchen (Suche), Ordnerinhalt laden, Hinweis „Ordner ist leer“ | Navigation | ✗ **gestrichen** | — |
| Hochladen (bis 250 MB), „Neuer Ordner“ | Schreiben | ✗ **gestrichen** | — |
| Öffnen, „In der Cloud öffnen“, Herunterladen, Löschen | Dateiaktionen | ✗ **gestrichen** | — |
| Berechtigungen aus der Cloud übernehmen | Rechte | ✗ **gestrichen** | — |
| Objektordner verknüpfen, Mailanhänge in die Cloud sichern (Verknüpfungstabellen Objekt↔Cloud und Mail-Absender↔Cloud laut `_technik.txt`) | Verkettung Objekt/Postfach | ✗ **gestrichen** | Ersatz: Anhang aus dem Postfach am Objekt ablegen (`src/components/postfach/NachrichtDetail.tsx` Zeile 288, `src/server/postfach-aktionen.ts` Zeile 487) |

### Fachfremd im Bundle (nur Hinweis, nicht gezählt)

- Bank-CSV-Import mit Cashflow-Kategorien und Gesellschaften → Liquiditätsplanung, laut `CLAUDE.md` nicht übernehmen.
- Provisionsabrechnung als PDF (gestaffelte Vermittlungs-/Zuführungsprovision) → Provisionsrechner, laut `CLAUDE.md` nicht übernehmen.

### Zusammenfassung Firmen-Cloud-Ablage

Gezählt: **✓ 0 · ◐ 0 · ✗ 7** (alle gestrichen). Ersatzpfad laut `docs/FUNKTIONSABGLEICH.md` Kachel 13:
eigene Ablage (Paket D1) und Postfach-Anhänge am Objekt — die mandantenweite Ablage (D1) ist noch offen (siehe Kachel Dokumente).

---

## Gesamtbild

| Kachel | ✓ | ◐ | ✗ | davon gestrichen |
|---|---|---|---|---|
| Marketing | 20 | 27 | 40 | 6 |
| Werkzeuge | 28 | 21 | 10 | 0 |
| Dokumente | 14 | 5 | 1 | 0 |
| Firmen-Cloud-Ablage | 0 | 0 | 7 | 7 |

Größte Hebel in Reihenfolge des Nutzens: (1) Marketing-Vorlagen mit Objektfoto, editierbaren
Feldern und PNG-Export; (2) fehlende Kachelarten (Verkauft, Standortkarte, Karussell, Energie-Story,
News) und QR/Banner/Energieskala im Aushang; (3) Marketing-Ablage bzw. mandantenweite Ablage;
(4) Schwärzen-Heuristik und Ablage der PDF-Ergebnisse am Objekt; (5) Raumscan-Qualität und
Höhenzonen für den Wohnflächenrechner; (6) Print-Vorlagen mit Feldzuordnung und Bestell-Link.


---

## Kachel Kundenbereich

Quelle: Referenz-Inventar (Einstiegsseite, Eigentümer-Verwaltung, Käufer-Verwaltung, Kunden-App, Fehlerseite, Technik-Übersicht). Geprüft gegen `src/app/(app)/kundenbereich`, `src/app/kunde`, `src/components/portal`, `src/server/portal-aktionen.ts`, `src/server/kunde-aktionen.ts`, `src/lib/portal/*`, `supabase/migrations/20260904160000_portal_projekte.sql`. Neubauprojekte (`/projekte`, `/projekt/[token]`) sind ein eigenes Paket und hier nur erwähnt, wo die Referenz-Kachel sie berührt.

Hinweis zum Rahmen: In der Referenz sind Eigentümer- und Käufer-Bereich **eine** Anwendung mit Konto (Magic-Link-Login). In ImmoOffice.ai hat der Kunde **kein Konto**: Zugang über Link-Token mit Hash, optionales Passwort, alles über `security definer`-Funktionen (`portal_*`). Das ändert einige Funktionen strukturell (Abmelden, Personen, Auth-Benutzer löschen).

### Einstieg (Kachelwahl Eigentümer / Käufer)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zwei Kacheln „Eigentümer-Bereich“ / „Käufer-Bereich“ mit „Öffnen“ | Wahl, welcher Kundenkreis verwaltet wird | ✓ | `src/app/(app)/kundenbereich/page.tsx` — Reiter Eigentümer-Bereich / Käufer-Bereich / Projekt-Interessenten (`?art=`), Navigationseintrag in `src/components/Navigation.tsx` |
| Zähler oben: ungelesene Nachrichten, offene Anfragen, neue Uploads, eingereichte Anträge | Überblick, was Kunden getan haben | ✓ | `page.tsx` vier Kacheln aus `portal_glocke()` (Migration Z. 413) |

### Eigentümer verwalten (Liste)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste aktiver Eigentümer mit Objektanzahl und letztem Login | Übersicht aller Zugänge | ✓ | `page.tsx`: Objekte je Kunde, „eingeladen …“, „zuletzt …“ / „noch nicht geöffnet“ |
| Umschalter „Aktive anzeigen / Archiv (n)“, „Archiviert am“ | Archivierte Eigentümer getrennt listen | ◐ | Sperren/Freischalten (`aktiv`) und Soft-Delete (`geloescht_am`) vorhanden (`KundeDetail.tsx` Zugang, `portal-aktionen.ts` kundeAendern/kundeLoeschen); kein Archiv-Reiter, keine Archivliste, kein Wiederherstellen |
| Pulsierendes Abzeichen „n ungelesene Aktivitäten“ je Eigentümer | Zeigt je Kunde, dass etwas Neues vorliegt | ◐ | Liste zeigt nur „n neue Nachricht(en)“; Uploads/Aktivitäten erst als Reiterzähler in der Akte (`KundeDetail.tsx`) |
| Leerzustand „Noch keine Eigentümer … klicke auf Einladen“ | Hinweis bei leerer Liste | ✓ | `page.tsx` „Noch keine Zugänge.“ |
| Schaltfläche „Eigentümer einladen“ | Öffnet Einladen-Dialog | ✓ | `page.tsx` `?neu=1` → `src/components/portal/KundeEinladen.tsx` |

### Käufer verwalten (Liste)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Käuferliste mit Status „Aktiv / Eingeladen“ und Anzahl verknüpfter Objekte | Übersicht Käufer | ✓ | `page.tsx` (`art=kaeufer`): „angenommen“ / „noch nicht geöffnet“, Objekte, Stufe x/7 |
| „Käufer einladen“ | Einladen-Dialog mit Rolle Käufer | ✓ | `KundeEinladen.tsx` (Rolle) |
| Käufer-Akte = Eigentümer-Akte (gleiche Komponente, Kennzeichen `portal_typ`) | Detailansicht identisch | ✓ | `KundeDetail.tsx` (Spalte `art`), zusätzlich Kaufabwicklung 7 Stufen (`typen.ts` FORTSCHRITT) — über die Referenz hinaus |

### Einladen (Dialog)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Felder Anrede, Titel, Vorname, Nachname, E-Mail (Pflicht), Telefon | Stammdaten des Kunden | ◐ | `KundeEinladen.tsx`: Name (ein Feld), E-Mail, Telefon, Rolle, Ansprechpartner; keine Anrede/Titel/getrennte Namen (Adressdaten nur im Adressbuch) |
| E-Mail-Validierung mit Fehlermeldung | Verhindert ungültige Adresse | ✓ | `portal-aktionen.ts` kundeEinladen (zod) |
| Maklervertrag verknüpfen (optional) im Dialog, Hinweis „später im Detail möglich“ | Objekt beim Einladen zuordnen | ◐ | Objekte anhaken ja (`KundeEinladen.tsx`); Maklervertrag erst in der Akte (`KundeDetail.tsx` Objekte → „Maklervertrag (optional)“) |
| Einladungs-Mail mit Anmeldelink, Erfolgsmeldung „Einladung verschickt“ | Kunde bekommt Zugang | ✓ | `portal-aktionen.ts` einladungsText + mailEinstellen (Job-Warteschlange `job_einstellen`); ohne Mail-Dienst Link zum Kopieren |
| Umschalten Eigentümer/Käufer im selben Dialog | Ein Dialog für beide Rollen | ✓ | `KundeEinladen.tsx` Rolle |
| Einladen aus der Kontaktakte heraus | Objekte laut Kontaktrolle | ✓ | `src/components/portal/KontaktZugang.tsx`, `portal-aktionen.ts` kundeAusKontaktEinladen, `src/app/(app)/kontakte/[id]/page.tsx` — nicht in der Referenz-Kachel, dort am Kontakt |

### Kundenakte — Kopf, Zugang, Löschen (Maklersicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| „Zurück zur Übersicht“ | Navigation | ✓ | `src/app/(app)/kundenbereich/[id]/page.tsx` „Alle Zugänge“ |
| Letzter Login, Einladung angenommen, Passwort gesetzt | Zugangsstatus | ✓ | `KundeDetail.tsx` Kopf; `portal_oeffnen` setzt `angenommen_am`/`letzter_login_am` |
| Archivieren / Wiederherstellen | Zugang stilllegen ohne Löschen | ◐ | „Sperren / Freischalten“ (`KundeDetail.tsx` Zugang); kein Archiv-Zustand, kein Wiederherstellen nach Löschen |
| Login-Link erneut senden, Hinweis wenn noch nie eingeloggt | Neuer Magic-Link per Mail | ✓ | `KundeDetail.tsx` „Login-Link neu senden“, `kundeLinkErneuern` (alter Link wird ungültig, 30 Tage gültig, Aktivität) |
| Link kopieren für WhatsApp/SMS (1 h gültig) | Manuelle Weitergabe | ✓ | `KundeDetail.tsx` Kopieren; Gültigkeit 30 Tage statt 1 h |
| Eigentümer komplett löschen: E-Mail eintippen + Chef-Passwort, löscht Datensatz + Auth-Benutzer, Verträge bleiben | Endgültiges Löschen mit doppelter Bestätigung | ◐ | `kundeLoeschen`: Recht `portal/loeschen`, einfaches `confirm()`, Soft-Delete (`geloescht_am`); keine Tipp-Bestätigung, kein Auth-Benutzer (Kunde hat kein Konto) |
| Passwort des Kunden zurücksetzen | Makler hebt Passwort auf | ✓ | `KundeDetail.tsx` Zugang → kundeAendern `passwort_zuruecksetzen` — nicht in Referenz |
| Ansprechpartner zuweisen | Betreuer festlegen | ✓ | `KundeDetail.tsx` Zugang „Stammdaten und Betreuung“ |

### Kundenakte — Objekte (Maklersicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Verknüpfte Objekte (über Maklervertrag) mit Adresse, „Verknüpfen“ | Objekt dem Kunden zeigen | ✓ | `KundeDetail.tsx` Objekte, `kundeObjektZuordnen`, Tabelle `portal_kunden_objekte` (mit `vertrag_id`) |
| Verknüpfung aufheben mit Sicherheitsabfrage | Objekt entfernen | ◐ | „Entfernen“ vorhanden, ohne Rückfrage |
| Pflicht-Unterlagen-Fortschritt in % je Objekt, „Noch offen: …“, „Alle Pflicht-Unterlagen vorhanden“ | Checkliste Unterlagen | ✓ | `KundeDetail.tsx` Objekte „x/y Pflichtpunkte“ (aus `checklisten_punkte`); Prozent, Balken und offene Punkte auf Kundenseite (`Kundenbereich.tsx` Objekte) |
| Cloud-Ordner je Objekt zuordnen/ändern (Ordner-Auswahl, neuen Ordner anlegen, Auto-Ordner) | Ablage in Firmen-Cloud | ✗ | Cloud-Ablage bewusst ausgeschlossen (CLAUDE.md) |

### Kundenakte — Unterlagen (Maklersicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Dokument für Kunden hinterlegen mit Kategorie (Exposé, Bewertung, Vertrag …) | Makler stellt Unterlage bereit | ✓ | `KundeDetail.tsx` Unterlagen → `kundeDokumentHochladen` (Kategorie als Freitext statt fester Liste) |
| Objekt zuordnen beim Hochladen (empfohlen) | Bezug zum Objekt | ✓ | dito, Feld Objekt |
| „Freigabe vom Eigentümer erbitten“ (Häkchen) | Startet Freigabe-Workflow | ✗ | keine Freigabe-Spalten in `portal_dokumente` |
| „Nachricht zum Dokument“ (wird mitgeschickt, am Dokument angezeigt) | Kontext zum Dokument | ✗ | — |
| Aktivität + Mail „Neues Dokument von …“ an Kunden | Kunde erfährt vom neuen Dokument | ✗ | `kundeDokumentHochladen` legt weder Aktivität noch Mail an |
| Kunden-Uploads nach Kategorie gruppiert, Öffnen, Löschen | Übersicht der Uploads | ◐ | flache Liste mit Kategorie-Text, Öffnen (`dateiLink`), Löschen; keine Gruppierung nach Pflicht-Kategorien |
| „Vom Kunden angesehen am“ | Lesenachweis | ✓ | `portal_dokumente.gesehen_am`, gesetzt in `portal_datei`; Anzeige `KundeDetail.tsx` |
| KI-Dateinamen-Vorschlag (einzeln / alle offenen), Status „KI-ausgewertet“, Wiederholung nach Fehler | Automatische Benennung | ✗ | — |
| Übertragung auf Cloud-Ordner (einzeln / alle) | Cloud-Push | ✗ | bewusst ausgeschlossen |
| Freigabe-Status „FREIGEGEBEN am / wartet auf Freigabe“, Anmerkungen des Kunden anzeigen | Rückmeldung des Kunden sehen | ✗ | — |
| „Mit neuer Datei antworten“ (neue Version, alte abgelöst, Kunde benachrichtigt „neue Version steht bereit“) | Versionierung im Dialog mit Kunde | ✗ | keine Versionierung in `portal_dokumente` |
| Vorgänger-Historie (vorherige Version, damalige Anmerkungen) | Nachvollziehbarkeit | ✗ | — |
| KI-Auswertung eines Dokuments (Einträge) anzeigen | Extrahierte Werte | ✗ | — |

### Kundenakte — Nachrichten (Maklersicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Chat-Verlauf Makler ↔ Kunde | Kommunikation | ✓ | `KundeDetail.tsx` Nachrichten, Tabelle `portal_nachrichten` |
| Nachricht senden → Aktivität + Mail an alle berechtigten Personen („n Empfänger“) | Kunde wird benachrichtigt | ◐ | `kundeNachrichtSenden`: Mail an die eine E-Mail des Zugangs (wenn `MAIL_API_KEY`); keine Mehrpersonen |
| Anhänge (Dateien, ganzer Ordner) im Chat | Dateien im Gespräch | ✗ | `portal_nachrichten` hat nur Text |
| Echtzeit-Aktualisierung des Chats | Sofortige Anzeige | ✗ | Aktualisierung per `revalidatePath` |
| Als gelesen markieren | Ungelesen-Zähler zurücksetzen | ✓ | `kundeNachrichtenGelesen` „Alles als gesehen markieren“ (Nachrichten, Uploads, Aktivitäten); Senden markiert automatisch |
| Gelesen-Vermerk an eigenen Nachrichten | Lesebestätigung | ✓ | `KundeDetail.tsx` „· gelesen“; `portal_gelesen` beim Öffnen durch den Kunden |

### Kundenakte — Berechtigte Personen (Maklersicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Personenliste je Zugang (Hauptperson, „Noch kein Login“, Telefon, Mail-Häkchen) | Mehrere Personen an einem Kundenzugang | ✗ | Ein Zugang = eine Person (`portal_kunden`); für Ehepaare zwei Zugänge nötig |
| Person hinzufügen (Anrede, Vorname, Nachname, E-Mail, Telefon) und einladen | Weitere Person | ✗ | — |
| Häkchen „soll Benachrichtigungs-Mails erhalten“ | Mail-Verteiler | ✗ | — |
| Login-Link je Person senden | Einzel-Link | ✗ | — |
| Person entfernen, Hauptperson geschützt | Verwaltung | ✗ | — |

### Kundenakte — Verbrauchsausweis-Anträge (Maklersicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Antragsliste mit Status In Arbeit / Eingereicht / In Bearbeitung / Abgeschlossen / Archiviert | Stand je Antrag | ◐ | `KundeDetail.tsx` Anträge: in_arbeit / eingereicht / erledigt (`typen.ts` ANTRAG_STATUS) |
| „+ Neuer Antrag“ und „Bearbeiten“ durch den Makler (Makler füllt Maske selbst) | Makler erfasst für Kunden | ✗ | nur der Kunde füllt aus; `erstellt_von_typ = 'makler'` in Tabelle vorgesehen, keine Makler-Maske |
| Kennzeichnung „durch Makler erfasst / Eigentümer-Antrag“ | Herkunft | ◐ | Spalte vorhanden, nicht angezeigt |
| KI-Schätzung (kWh/(m²·a), Klasse) am Antrag | Vorab-Wert | ✗ | — |
| ZIP herunterladen (Antrags-PDF + Abrechnungen + Zählerfoto) | Weitergabe an Aussteller | ✗ | Angaben nur als Tabelle („Angaben“ aufklappen, `antragZeilen`) |
| Status setzen | Bearbeitung abschließen | ✓ | `antragStatusSetzen` „Als erledigt“ / „Zurück an Kunden“ |

### Kundenakte — Aktivitäten (Maklersicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Aktivitätenliste (Einladung, Login, Datei, Upload, Nachricht, Antrag, Passwort) mit Gesehen-Status | Protokoll des Kunden | ✓ | `KundeDetail.tsx` Aktivitäten, Tabelle `portal_aktivitaeten`, `intern.portal_aktivitaet` — Referenz hat dies über die Glocke, hier als Reiter |

### Kundenseite — Rahmen (Einstieg, Kopf, Fuß, Fehler)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Anmeldung mit Konto per Magic-Link; beim ersten Login Passwort festlegen („Willkommen“, „Abbrechen und ausloggen“) | Kontobasierter Zugang | ◐ | Zugang per Link-Token ohne Konto (`src/app/kunde/[token]/page.tsx`, `portal_oeffnen`); Passwort optional im Bereich „Zugang“, nicht beim Einstieg erzwungen |
| Passwort-Abfrage bei gesetztem Passwort | Schutz des Links | ✓ | `src/app/kunde/[token]/PasswortTor.tsx`, `kundeOeffnen` (pfadgebundenes Cookie 8 h) |
| Ladebildschirm | Wartehinweis | ✗ | serverseitig gerendert, entbehrlich |
| Kopfzeile mit Reitern Übersicht / Dokumente / Werkzeuge / Profil / Abmelden | Navigation | ◐ | `Kundenbereich.tsx` Bereiche: Meine Immobilie / Kaufabwicklung / Unterlagen / Nachrichten / Energieausweis / Zugang; kein Werkzeuge, kein Profil, kein Abmelden |
| Abmelden | Sitzung beenden | ✗ | kein Konto; Passwort-Cookie läuft nach 8 h ab, keine Abmelde-Schaltfläche |
| Fußzeile mit Firmenangaben (Anschrift, Telefon, Mail, Web) | Impressum-Kurzform | ◐ | Fußzeile mit Mandantenname und Vertraulichkeitshinweis; keine Anschrift/Telefon aus `mandanten` |
| Fehlerseite „Kein Konto verknüpft“ mit Abmelden | Fehlerfall | ✓ | `kunde/[token]/page.tsx` `Unbekannt()` „Dieser Zugang ist nicht (mehr) gültig“ — ohne Abmelden (kein Konto) |
| Benachrichtigungsglocke (Aktivitäten, „n neue Nachrichten“, „Alle als gelesen“) | Kunde sieht Neues | ✗ | Kunde hat keine Aktivitäten-/Glockenansicht; ungelesen wird nicht hervorgehoben |
| Tutorial-Overlay (Schritte, Fortschrittsbalken, Überspringen, Zurück/Weiter/Abschließen, Fortschritt gespeichert) | Einführung | ✗ | `src/components/Tutorial.tsx` nur im Makler-Dashboard |

### Kundenseite — Übersicht
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Begrüßung mit Anrede („Sehr geehrte Frau …“ / „Guten Tag“) | Persönliche Ansprache | ◐ | „Guten Tag, {Name}“ ohne Anrede-Logik (`Kundenbereich.tsx` Kopf) |
| Statuskachel Exposé: wartet auf Freigabe / Entwurf vorhanden / Anmerkungen übermittelt / freigegeben, jeweils mit Aufruf | Freigabe-Fortschritt | ✗ | kein Freigabe-Workflow |
| Kachel „Unterlagen hochladen“ mit Zähler (gesamt, davon vom Makler) | Schnellzugriff | ◐ | Zähler nur als Checkliste je Objekt |
| Kachel „x von y Pflicht erledigt“ | Fortschritt Checkliste | ✓ | `Kundenbereich.tsx` Objekte → „Checkliste Unterlagen“ mit Balken und Prozent |
| Kachel „Persönliche Daten“ | Zum Profil | ✗ | kein Profil (s. u.) |
| Kachel „Verbrauchsausweis vorbereiten“ | Zum Antrag | ✓ | Bereich „Energieausweis“ (nur Eigentümer) |
| Kachel Werkzeuge „Zusammenfügen, teilen, verkleinern“ (PDF) | PDF-Werkzeuge für Kunden | ✗ | — |
| Objektkarten mit Adresse, Angebotspreis, Ansprechpartner, „Details ansehen“ | Objektübersicht | ✓ | `Kundenbereich.tsx` Objekte (Angebotspreis/Kaltmiete); Ansprechpartner mit Telefon/Mail im Kopf; keine separate Detailseite — alles auf einer Seite |
| Leerzustand „noch keine Objekte verknüpft“ | Hinweis | ◐ | Bereich „Meine Immobilie“ erscheint dann gar nicht |

### Kundenseite — Objektdetail
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Vertragsdaten: Auftrag erstellt am, vereinbarter Angebotspreis, Provision, Laufzeit | Maklervertrag einsehen | ✗ | `vertrag_id` an `portal_kunden_objekte`, aber `portal_daten` liefert keine Vertragsfelder |
| Objektdaten: Typ, Wohnfläche, Grundstück, Baujahr, Zimmer | Eckdaten | ✗ | `portal_daten` liefert Adresse, Status, Preis; keine Flächen/Baujahr |
| Interessenten / Besichtigungen (Referenz: „in Kürze freigeschaltet“) | Vermarktungsstand | ✓ | `Kundenbereich.tsx`: Exposé-Aufrufe, Anfragen, Besichtigungen, nächste Besichtigung (`portal_daten`) — über die Referenz hinaus |
| Verlauf der Vermarktung | Chronik | ✓ | `portal_daten` 'verlauf' aus `aktivitaeten` des Objekts — nicht in der Referenz |
| Verweis auf Dokumente; „Verbrauchsausweis anfordern“ mit Tipp (Abrechnungen bereithalten) | Aufruf | ✓ | Bereich Energieausweis mit Beschreibungstext |
| Kontaktbox „Sie haben Fragen?“ | Ansprechpartner | ✓ | Kopf mit Telefon/Mail des Ansprechpartners |
| Unterlagen-Katalog: 5 Gruppen (Pflicht, Wichtig, Bau, Situativ, Weitere), ~25 Kategorien mit Erklärtext | Was der Kunde liefern soll | ◐ | Checkliste kommt aus der Objekt-Checkliste (`checklisten_punkte`: Titel, Pflicht, Status); kein fester Katalog mit Erklärtexten und Gruppen |

### Kundenseite — Dokumente
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Upload je Kategorie: Dateien auswählen oder ganzer Ordner, nur PDF/Bilder, Mehrfach mit Fortschritt „i/n“ | Unterlagen liefern | ◐ | `Kundenbereich.tsx` Unterlagen: eine Datei je Vorgang, Kategorie Freitext, Objektwahl; PDF/Bild/Word bis 25 MB (`kundeUpload`) |
| Automatisches Häkchen in der Checkliste bei Upload passender Kategorie | Checkliste pflegt sich selbst | ✗ | `portal_dokument_eintragen` setzt keinen `checklisten_punkt` |
| Benachrichtigung an Makler bei Upload (geplant/gebündelt) | Makler erfährt vom Upload | ◐ | Aktivität + Glocke (`portal_aktivitaet 'upload'`); keine Mail, keine Bündelung |
| „Checkliste vollständig“-Meldung an Kunde + Aktivität an Makler | Abschluss | ✗ | — |
| Dokument öffnen (signierte Adresse, Fallback) | Ansehen | ✓ | `kundeDatei` → `portal_datei` (Sichtprüfung, Aktivität „Datei angesehen“) |
| Eigene Dokumente löschen | Korrektur | ✗ | keine Löschfunktion auf Kundenseite |
| KI-Auswertung Energieausweis (Ausweis-Art, Endenergie, Baujahr, Energieträger), „Neu auswerten“ | Werte aus PDF ziehen | ✗ | Energieausweis-Auslesen existiert nur für Makler (`src/server/werkzeuge-aktionen.ts`) |
| KI-Umbenennung im Hintergrund | Dateinamen | ✗ | — |
| Vom Makler hinterlegte Dokumente mit Kennzeichnung; Hinweiskarte „n Dokumente für Sie hinterlegt“ | Neues sichtbar machen | ◐ | Liste mit „von Ihnen“-Marker; Objektdokumente mit Sichtbarkeit „Kunde“ (`src/components/Dokumentenliste.tsx` sichtbarkeitUmschalten); keine Hinweiskarte für Neues |
| Exposé-Hinweiskarte „Bitte prüfen Sie Ihr Exposé“ | Aufforderung zur Freigabe | ✗ | — |
| Diagnose-Info in Zwischenablage bei Öffnungsfehler | Support | ✗ | einfache Fehlermeldung, entbehrlich |

### Kundenseite — Dokument-Freigabe (Makler-Dokumentkarte)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Dokument verbindlich freigeben mit Zeitstempel und Bestätigungsdialog | Freigabe des Exposés u. a. | ✗ | keine Freigabe-Spalten; interne Exposé-Freigabe (`src/server/expose-aktionen.ts`) ist maklerseitig |
| Anmerkungen schreiben, Entwurf lokal + serverseitig zwischenspeichern, „Weiterschreiben“ | Rückmeldung | ✗ | — |
| Spracheingabe (Diktat) für Anmerkungen | Barrierearme Eingabe | ✗ | Spracheingabe nur in `src/components/aufgaben/Schnelleingabe.tsx` |
| KI-Textkorrektur mit Rückgängig | Textqualität | ✗ | Textkorrektur nur für Aufgaben (`src/server/arbeitsmittel-aktionen.ts`) |
| PDF an Anmerkungen anhängen (kommentiertes Exposé) | Beleg | ✗ | — |
| Mails „Freigabe erteilt: …“ / „Anmerkungen zu: …“ an Makler, Aktivität | Makler erfährt Ergebnis | ✗ | — |
| Vorgängerversion anzeigen | Historie | ✗ | — |

### Kundenseite — Nachrichten
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Chat mit Makler, Senden, Fehlerhinweis | Kommunikation | ✓ | `Kundenbereich.tsx` Nachrichten, `kundeNachricht`, `portal_nachricht_senden` (Limit 50/Tag, Aktivität) |
| Anhänge / ganzen Ordner senden, Anhang herunterladen | Dateien im Chat | ✗ | nur Text |
| Echtzeit | Sofortige Anzeige | ✗ | — |

### Kundenseite — Verbrauchsausweis-Antrag
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Sechs Schritte (Antragsteller, Gebäude, Sanierungen, Heizung, Verbrauch, Bemerkungen) | Geführte Maske | ◐ | `src/lib/portal/verbrauchsausweis.ts`: fünf Abschnitte auf einer Seite (Bemerkungen im Verbrauchsabschnitt) |
| Felder Antragsteller / Gebäude / Sanierungen mit Jahr / Heizung / Warmwasser / Lüftung / Solarthermie / PV | Datenerhebung nach GEG | ✓ | `ANTRAG_ABSCHNITTE`; Abweichungen: keine Warmwasser-Erfassungsart/-Temperatur, Gebäudetypen anders |
| Verbrauch 3 Jahre mit Zeitraum von/bis, Einheit (kWh/Liter), Warmwasser, Leerstand je Jahr | Verbrauchsdaten | ◐ | Jahr + Menge je Jahr; kein Zeitraum von/bis, keine Einheitenwahl, Leerstand nur als Freitext |
| Abrechnungs-PDF/Foto je Jahr hochladen und per KI auslesen (vorbefüllen) | Weniger Tipparbeit | ✗ | — |
| Zählerstand + Foto (Kamera) mit Ablesedatum, Warnung ohne Foto | Beweisaufnahme | ✗ | — |
| Vorläufige KI-Schätzung (Kennwert, Klasse) | Orientierung | ✗ | — |
| Vorbefüllung aus Kundendaten/Objekt | Komfort | ✗ | neuer Antrag startet leer |
| Zwischenspeichern und später fortfahren | Entwurf | ✓ | `kundeAntrag` / `portal_antrag_speichern` (nur solange `in_arbeit`) |
| Pflichtprüfung beim Absenden mit Liste fehlender Felder | Vollständigkeit | ✓ | `antragPruefen`, Meldung „Zum Einreichen fehlen noch …“ |
| Absenden erzeugt PDF + ZIP und legt sie in Dokumente ab | Übergabefähiges Paket | ✗ | nur JSON in `verbrauchsausweis_antraege` |
| Benachrichtigung an Makler „Antrag eingereicht“ | Makler erfährt es | ◐ | Aktivität + Glocke „Eingereichte Anträge“; keine Mail |
| Eingereichte/erledigte Anträge einsehen | Status | ✓ | `Kundenbereich.tsx` Energieausweis |

### Kundenseite — Profil, Passwort, Personen
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Persönliche Daten bearbeiten (Vorname, Nachname, Telefon; E-Mail fix) | Selbstpflege | ✗ | nur Makler ändert Anzeigename/Telefon (`KundeDetail.tsx` Zugang) |
| Gemeinsame Adresse (nur Hauptperson änderbar) | Adresse | ✗ | — |
| Passwort ändern (min. 8 Zeichen, Wiederholung) | Sicherheit | ✓ | `Kundenbereich.tsx` Konto, `kundePasswortSetzen` / `portal_passwort_setzen` (altes Passwort aus Cookie) |
| Passwort festlegen beim ersten Login, „Abbrechen und ausloggen“ | Onboarding | ◐ | optional im Bereich Zugang, nicht beim Einstieg |
| „Tutorial neu starten“ | Einführung | ✗ | — |
| Berechtigte Personen (Kundenseite) | Mitnutzer | ✗ | — |

### Rechte, Sicherheit, Tests
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Rechte je Rolle für den Kundenbereich, serverseitig erzwungen | Wer darf einladen/ändern/löschen | ✓ | `src/lib/auth/rechte.ts` Modul `portal` (lesen/anlegen/aendern/loeschen), RLS in Migration |
| Mandantentrennung Kundenseite (nur eigene Daten, gleichförmige Fehler) | Sicherheit | ✓ | `intern.portal_kunde` (Token-Hash), `supabase/tests/portal-projekte.sql`, `src/lib/portal/portal.test.ts` |

### Zusammenfassung

**Zählung (125 Funktionen):** ✓ 46 · ◐ 25 · ✗ 54

Davon bewusst ausgeschlossen (Cloud-Ablage, CLAUDE.md): 3 ✗. Nicht sinnvoll übertragbar, weil der Kunde kein Konto hat (Abmelden, Ladebildschirm, Diagnose-Info): 3 ✗. Bleiben rund 48 echte Lücken.

**Was steht:** Einladen (auch vom Kontakt), Link-Zugang mit Hash, Passwort-Tor, Sperren, Link erneuern/kopieren, Objektzuordnung mit Maklervertrag, Nachrichten in beide Richtungen mit Mail an den Kunden, persönliche Unterlagen (Makler → Kunde, Kunde → Makler) mit Lesenachweis, Aktivitätenprotokoll, Glocke auf der Maklerseite, Checkliste-Fortschritt, Verbrauchsausweis-Antrag als Formular mit Zwischenstand und Pflichtprüfung, Kaufabwicklung in 7 Stufen (über die Referenz hinaus), Vermarktungsstand mit Aufrufen/Anfragen/Besichtigungen (über die Referenz hinaus), Rechte und RLS mit Tests.

**Wichtigste Lücken, nach Gewicht:**

1. **Dokument-Freigabe-Workflow fehlt komplett** (14 ✗): „Freigabe erbitten“ beim Hinterlegen, Freigabe mit Zeitstempel durch den Kunden, Anmerkungen mit Entwurf, Spracheingabe, KI-Korrektur, PDF-Anhang, „Mit neuer Datei antworten“ mit Versionierung, Vorgänger-Historie, Mails an Makler, Statuskacheln auf der Kunden-Übersicht. Das ist in der Referenz der fachliche Kern des Eigentümer-Bereichs (Exposé-Freigabe). Braucht Spalten in `portal_dokumente` (freigabe_angefragt, freigegeben_am, anmerkung, anmerkung_entwurf, vorgaenger_id) plus Kunden-Aktionen.
2. **Kunde bekommt keine Hinweise auf Neues:** keine Aktivität/Mail, wenn der Makler ein Dokument hinterlegt; keine Glocke, keine Hinweiskarten, kein „Neu“-Marker auf der Kundenseite. Der Makler bekommt umgekehrt nur die Glocke, keine Mail bei Upload, Nachricht oder eingereichtem Antrag.
3. **Berechtigte Personen** (5 ✗): Ein Zugang trägt genau eine Person. Ehepaare/Erbengemeinschaften brauchen heute mehrere Zugänge; Nachrichten gehen nur an eine Adresse.
4. **Verbrauchsausweis nur als Formular:** kein PDF/ZIP-Paket, kein Zählerfoto, kein KI-Auslesen der Abrechnungen, keine KI-Schätzung, keine Makler-Erfassung, kein Zeitraum von/bis und keine Einheitenwahl beim Verbrauch. Der Makler kann den Antrag nicht an einen Aussteller weitergeben, ohne ihn abzutippen.
5. **Kundenseitige Unterlagen:** nur Einzel-Upload mit Freitext-Kategorie, kein Kategorienkatalog mit Erklärtexten, kein automatisches Checklisten-Häkchen, kein Löschen eigener Uploads, keine KI-Auswertung/Umbenennung.
6. **Objektdetail auf Kundenseite dünn:** keine Vertragsdaten (Auftragsdatum, Angebotspreis laut Vertrag, Provision, Laufzeit) und keine Objekt-Eckdaten (Typ, Flächen, Baujahr, Zimmer), obwohl `vertrag_id` und `objekte` vorhanden sind — reine Erweiterung von `portal_daten`.
7. **Kleinere Abweichungen (◐):** kein Archiv-Reiter/Wiederherstellen, Löschen ohne Tipp-Bestätigung, Einladen-Dialog ohne Anrede/Titel/getrennte Namen, kein Profil und kein Tutorial für den Kunden, keine Anrede in der Begrüßung, Fußzeile ohne Anschrift, Antragsstatus mit 3 statt 5 Stufen, Chat ohne Anhänge/Echtzeit.


---

## Kachel Akquise

Quelle: Referenz-Inventar `AkquisePage.txt`, `AkquiseLeadSeite.txt`, `_technik.txt`. Abgleich gegen `src/app/(app)/akquise/**`, `src/components/akquise/*`, `src/server/akquise-aktionen.ts`, `src/lib/akquise/*`, `supabase/migrations/20260904110000_akquise.sql`, `src/lib/jobs/worker.ts`, `src/app/api/dokumente/[art]/[id]/route.tsx`, `src/components/postfach/NachrichtDetail.tsx`, `src/app/(app)/aufnahmen/[id]/page.tsx`.

Legende: ✓ vorhanden (mit Fundstelle) · ◐ teilweise (was fehlt) · ✗ fehlt. Pfade relativ zum Repository.

### Übersicht (Startseite der Kachel)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Schaltfläche „+ Neuer Lead" | Öffnet den Anlage-Dialog | ✓ | `src/app/(app)/akquise/leads/page.tsx` (aufklappbarer Bereich „Lead anlegen" mit `LeadNeu`) |
| Filter „Nur meine Leads" | Kennzahlen und Listen auf den angemeldeten Nutzer beschränken | ✗ | Kein Zuständigen-Filter in Übersicht oder Liste |
| Kennzahl „Neue Leads (Monat)" | Anzahl im laufenden Monat angelegter Leads | ◐ | `src/app/(app)/akquise/page.tsx` zeigt „offen" und „gewonnen im Monat"; neu angelegte je Monat fehlen |
| Kennzahl „Offene Leads" | Anzahl Leads mit Status offen | ✓ | `src/app/(app)/akquise/page.tsx` (Kachel „Leads", Zahl `offen.length`) |
| Kennzahl „Unbearbeitete Leads" | Leads in Stufe „Neuer Lead" ohne jede Aktivität | ✗ | Nicht berechnet |
| Kennzahl „Pipeline-Wert" (gewichtet, roh) | Erwartete Provision der offenen Leads, gewichtet nach Stufen-Wahrscheinlichkeit | ✓ | `src/app/(app)/akquise/page.tsx` (Kachel „Prognose"), `src/lib/akquise/auswertung.ts` `pipelinePrognose` |
| Kennzahl „Aufträge (Monat)" | Gewonnene Leads im Monat | ✓ | `src/app/(app)/akquise/page.tsx` (`gewonnenMonat`) |
| Kennzahl „Aufträge (Jahr)" | Gewonnene Leads im Jahr | ✗ | Nicht berechnet |
| Kennzahl „Ø Tage bis Auftrag" | Mittlere Dauer Anlage → gewonnen | ✗ | Nicht berechnet (Daten `erstellt_am`/`gewonnen_am` vorhanden) |
| Kennzahl „Conversion Lead → Auftrag" | Anteil gewonnener an abgeschlossenen Leads | ◐ | Nur in `src/app/(app)/akquise/auswertung/page.tsx`, nicht auf der Übersicht |
| Kachel „Neue Lead-Mails" | Aus dem Posteingang erkannte, noch nicht übernommene Anfragen | ✗ | Keine Hintergrund-Erkennung, kein Zähler (siehe „Lead-Mails") |
| „Anstehende Aktivitäten" mit Reitern Heute / Diese Woche / Überfällig | Fällige Aufgaben, Termine, Mails mit Typ, Priorität, Kontakt, Immobilie | ◐ | `src/app/(app)/akquise/page.tsx` „Fällige Aktivitäten" (bis heute, max. 20); keine Wochen-/Überfällig-Reiter, keine Spalten Priorität/Kontakt/Immobilie |
| „Als erledigt markieren" aus der Übersicht | Aktivität direkt abhaken | ◐ | Nur im Lead-Dossier (`src/components/akquise/LeadDossier.tsx`, `aktivitaetErledigen`); Übersicht verlinkt zum Lead |
| Tabelle „Die neuesten Leads" | Datum, Adresse, Stadt, Besitzer, Wert, Status, Tags, Zuständig | ◐ | Übersicht zeigt stattdessen „Nachfassen"-Liste; vollständige Tabelle nur unter `/akquise/leads` |
| Kacheln zu Kampagnen, Automationen, Radar, Einstellungen | Einstieg mit Zählern | ✓ | `src/app/(app)/akquise/page.tsx` (sechs Kacheln) — geht über die Referenz hinaus |

### Leads — Lead-Liste
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Unterreiter „Lead-Liste" / „Aus E-Mails" | Wechsel zwischen Liste und Lead-Mail-Vorschlägen | ◐ | Liste ✓ (`src/app/(app)/akquise/leads/page.tsx`); „Aus E-Mails" ✗ |
| Ansicht Liste / Kanban | Umschalten der Darstellung | ✓ | `src/app/(app)/akquise/leads/page.tsx` (`?ansicht=kanban`) |
| Suche (Adresse, Eigentümer, E-Mail, Tag) | Volltextfilter | ◐ | `src/app/(app)/akquise/leads/page.tsx` sucht nur in Titel, Ort, Straße; Eigentümer, E-Mail, Tags fehlen |
| Status-Filter Offen / Gewonnen / Verloren / Alle | Filter nach Lead-Status | ✓ | `src/app/(app)/akquise/leads/page.tsx` (`?status=`) |
| Pipeline-Filter | Nur Leads einer Pipeline | ✓ | `src/app/(app)/akquise/leads/page.tsx` (Pipeline-Reiter, `?pipeline=`) |
| Stufen-Filter | Nur Leads einer Stufe | ✗ | Kein Parameter |
| Quellen-Filter | Nur Leads einer Quelle | ✗ | Kein Parameter |
| Zuständigen-Filter | Nur Leads eines Nutzers | ✗ | Kein Parameter |
| Tag-Filter | Nur Leads mit Tag | ✗ | Leads haben keine Tags (weder Spalte in `akquise_leads` noch UI) |
| Filter „Nachfassen fällig" | Heute/überfällige Nachfasstermine | ✓ | `src/app/(app)/akquise/leads/page.tsx` (`?nachfassen=1`) — Ersatz für „Nächster Schritt" |
| Sortierung (Neueste, Älteste, Höchster Wert, Höchste Provision, Adresse A–Z) | Sortierreihenfolge wählen | ✗ | Fest „neueste zuerst" |
| Provisionsprognose in der Kopfzeile | Gewichtete Summe der gefilterten Leads | ◐ | Nur Kanban-Spaltensummen (`euro(summe)`) und Übersichtskachel; nicht als Kopfzeile der Liste |
| Spalten Datum, Adresse, Stadt, Besitzer, Wert, Provision, Pipeline, Stufe, Quelle, Tags, Zuständig, Status, Verlustgrund | Tabellenspalten | ◐ | Vorhanden: Lead/Adresse/Datum, Eigentümer, Stufe (mit Verlustgrund), Quelle, Zuständig, Nachfassen, Provision. Fehlen: Wert (Indikation), Tags, Pipeline-Spalte |
| Kennzeichen „Mit Objekt verknüpft" | Symbol in der Liste | ✗ | Nur im Dossier sichtbar, nicht in der Liste |
| Zähler „überfällige / offene Aufgabe(n)" je Zeile | Aufgabenstand je Lead | ◐ | Nachfassen-Marke (`nachfassLage`) statt Aufgabenzähler |
| CSV-Export der gefilterten Liste | Datei „Akquise-Leads_<Datum>.csv" | ✗ | Kein Export |
| Blättern (Seite ← →) | Seitenweise Anzeige | ◐ | Abfrage auf 500 Zeilen begrenzt, keine Seiten |
| Zeile anklicken → Lead-Akte | Navigation | ✓ | `src/app/(app)/akquise/leads/page.tsx` (`/akquise/leads/[id]`) |
| Stufe direkt in der Zeile wechseln | Ohne Akte öffnen | ✓ | `src/components/akquise/StufeWechsel.tsx` (kompakt) — über Referenz hinaus |

### Neuer Lead (Dialog)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Weg „Manuell" | Alle Felder von Hand | ✓ | `src/components/akquise/LeadNeu.tsx`, `leadAnlegen` in `src/server/akquise-aktionen.ts` |
| Weg „Aus Kontakt" | Eigentümer aus Adressbuch, Felder vorbelegt | ✓ | `src/components/akquise/LeadNeu.tsx` (`weg === "kontakt"`) |
| Weg „Aus Objekt" | Objekt aus Bestand, Anschrift/Flächen/Eigentümer übernommen | ✓ | `leadAnlegen` (Objektdaten + `kontakt_objekt` Rolle eigentuemer) |
| Weg „Aus Akquise-Radar" (Trefferliste im Dialog) | Radar-Treffer wählen und übernehmen | ◐ | Übernahme auf `/akquise/radar` (`radarUebernehmen`), nicht im Anlage-Dialog |
| Weg „CSV-Import" (Text einfügen, Kopfzeile erkannt) | Mehrere Leads auf einmal | ◐ | `src/lib/akquise/csv.ts`, `leadsImportieren`: Datei-Upload statt Text-Einfügen; Kontakt-Dublette per E-Mail ✓, Lead-Dublette („waren schon angelegt") ✗ |
| Kontakt-Suchfeld mit Tastatursteuerung | Name/Firma/E-Mail/Ort suchen | ◐ | Einfache Auswahlliste (bis 500 Kontakte), keine Suche |
| Objekt-Suchfeld (Nr., Bezeichnung, Adresse) | Objekt suchen | ◐ | Einfache Auswahlliste (bis 300 Objekte) |
| Feldgruppe Eigentümer: Anrede, Vorname, Nachname, Firma, E-Mail, Telefon | Kontakt anlegen oder wiederverwenden | ◐ | `LeadNeu.tsx`: Anrede (Herr/Frau), Vorname, Nachname, E-Mail, Telefon; „Familie" und Firma fehlen |
| Feldgruppe Objekt: Straße, Nr., PLZ, Ort, Objektart, Wohnfläche, Grundstück, Zimmer, Baujahr, Zustand, Verkaufszeitraum, Wertschätzung | Objektangaben | ◐ | Alle außer Zimmer und Wertschätzung (Wert wird im Preis-Finder gesetzt) |
| Feldgruppe Prozess: Pipeline, Stufe, Lead-Quelle, Zuständig, Notiz | Zuordnung | ◐ | Pipeline, Quelle, Kampagne, Zuständig, Nachfassen, Notiz ✓; Stufe nicht wählbar (immer erste offene Stufe, `ersteStufe`) |
| Pflicht Name oder Firma des Eigentümers | Validierung | ◐ | Lead ohne Kontakt erlaubt; nur Titel/Adresse geprüft (`leadSchema`) |
| Historie „Lead manuell angelegt" | Protokoll | ✓ | Trigger `intern.akquise_lead_nachlauf` (`feld = 'angelegt'`) in `supabase/migrations/20260904110000_akquise.sql` |
| Tippgeber beim Anlegen | Vermittler-Kontakt | ✓ | `LeadNeu.tsx` (`tippgeber_kontakt_id`) |

### Lead-Akte — Kopf und Stufenleiste
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| „← Zurück zur Liste" | Navigation | ✓ | `src/app/(app)/akquise/leads/[id]/page.tsx` („Zu den Leads") |
| Kopfzeile Quelle · Zuständig · angelegt | Metadaten | ◐ | Kopf zeigt Anschrift und Eigentümer; Quelle/Zuständig im Info-Reiter, Anlage-Datum im Historie-Reiter |
| Bearbeiten / Speichern / Abbrechen (Bearbeitungsmodus) | Felder sperren/entsperren | ◐ | Formular dauerhaft editierbar (`Info` in `LeadDossier.tsx`), Speichern ✓, kein Abbrechen |
| „+ Aktivität" | Aktivität planen | ✓ | `LeadDossier.tsx` Reiter „Aktivitäten", `aktivitaetAnlegen` |
| „Löschen" (Kontakt und Objekt bleiben) | Lead entfernen | ✓ | `leadLoeschen`; nur wenn nicht gewonnen |
| Pipeline-Stufenleiste (Stufe per Klick) | Stufe wechseln | ◐ | `StufeWechsel.tsx`: Auswahlliste + „Verschieben" statt Klickleiste |
| „✓ Auftrag gewonnen" Schnellknopf | Direkt auf Gewonnen | ◐ | Über die Stufe „Gewonnen" in der Auswahl |
| „✕ Verloren" mit Verlustgrund-Dialog (Liste + „Anderer Grund" Freitext) | Verlustgrund Pflicht | ◐ | `StufeWechsel.tsx`: Auswahl der konfigurierten Gründe, Freitext nur wenn keine Gründe gepflegt; DB-Pflicht in `intern.akquise_lead_stufe` ✓ |
| Nach Gewinn: Maklervertrag-Assistent mit Lead-Daten anbieten | Verkettung Akquise → Vertrag | ◐ | Link „Maklervertrag aus Vorlage" im Dossier (`/vertraege/vorlage/maklervertrag?objekt=`), nur wenn Objekt existiert; kein automatisches Angebot beim Gewinn |
| Anzahl geplanter Automations-Läufe am Lead | Hinweis im Kopf | ✓ | `LeadDossier.tsx` (Fußnote im Aktivitäten-Reiter, `laeufe`) |
| Reiter Info / Dossier / Dokumente / Preis-Finder | Gliederung der Akte | ◐ | Reiter Info, Preis-Finder, Aktivitäten, Dossier, Historie; kein eigener Dokumente-Reiter (nur Link zur Objektablage) |

### Lead-Akte — Reiter Info
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Objektdaten (Straße, Nr., Ort, Objektart, Wohnfläche, Grundstück, Zimmer, Baujahr, Zustand, Verkaufszeitraum) | Bearbeitbare Felder | ◐ | `LeadDossier.tsx` `Info`: alle außer Zimmer |
| Verknüpftes Objekt wählen / „Objekt öffnen" | Objekt nachträglich zuordnen | ◐ | Anzeige und Link ✓ (Dossier-Reiter); nachträgliche Auswahl eines Bestandsobjekts ✗ — nur Neuanlage über `leadZuObjekt` |
| Notiz | Freitext | ✓ | `Info` (`notiz`) |
| „Nächster Schritt am" | Datum des nächsten Schritts | ✓ | `Info` („Nachfassen am"), Vorgabe über Trigger (`nachfassen_tage`) |
| Lead-Quelle, Zuständig | Zuordnung | ✓ | `Info` |
| Tippgeber | Vermittler | ✓ | `Info` (`tippgeber_kontakt_id`) |
| Tags | Freie Schlagworte | ✗ | Nicht im Datenmodell |
| Pipeline / Stufe (mit Zusatz) | Anzeige | ✓ | Kopf-Marken in `LeadDossier.tsx`; Pipeline-Wechsel über Stufe einer anderen Pipeline (`leadStufe` setzt `pipeline_id`) |
| Eigentümer-Karte mit Mail-/Telefon-Link | Kontaktinfos | ◐ | Dossier-Reiter zeigt Name (Link zum Kontakt), Telefon, E-Mail als Text; keine `mailto:`/`tel:`-Links |
| „Kein Kontakt verknüpft" → Kontakt anlegen | Eigentümer nachträglich anlegen | ✓ | `leadKontaktAnlegen`, Karte „Eigentümer als Kontakt anlegen" |
| Hinweis „Werbung abbestellt — Automationen greifen nicht" | Opt-out respektieren | ✗ | `kontakte.einwilligung_werbung` existiert, wird in Akquise-Code und `akquise_laeufe_ausfuehren` nicht ausgewertet |
| „Eigentümer einladen" (Kundenbereich) | Portal-Einladung aus dem Lead | ◐ | Einladung nur über Kontaktseite (`src/app/(app)/kontakte/[id]/page.tsx`, `KontaktZugang`); kein Knopf im Lead |
| „Rückruf anfordern" | Aufgabe mit Telefonnummer anlegen | ◐ | Manuell als Aktivität Typ „Aufgabe" möglich; kein Ein-Klick-Rückruf |
| „Termin vereinbaren" | Termin im Kalender | ✓ | `aktivitaetAnlegen` Typ „termin" legt `termine`-Eintrag an (1 h, Kontakt/Objekt verknüpft) |
| „Passende Kaufinteressenten" (Budget, Lage, Objektart, Fläche, Zimmer) | Matching gegen eigene Interessenten | ◐ | Link „Passende Interessenten" auf `/objekte/[id]#treffer` — auf der Objektseite gibt es keinen solchen Abschnitt; Matching nur aus `src/app/(app)/suchprofile/page.tsx` (Profil → Objekte), nicht Lead/Objekt → Interessenten |
| Preis-Kacheln (Geschätzter Preis, Spanne, Startpreis, Provision, €/m²) | Kurzübersicht | ✓ | Preis-Finder-Reiter (`preisRechnen`, `provisionsErwartung`) und Provisions-Marke im Kopf |
| „Lage" — Karte mit Geocoding, „In Maps öffnen" | Lagekarte | ✗ | Keine Karte, kein Geocoding im Akquise-Modul (Geocoding existiert nur in `src/lib/kalender/fahrzeit.ts`) |
| Offene Aktivitäten: Erledigt / ändern | Liste mit Aktionen | ◐ | Erledigen und Wieder öffnen ✓ (`aktivitaetErledigen`); Ändern ✗ |
| Wiederholende Aktivitäten („alle N Tage") | Serie | ✗ | Nicht im Datenmodell (`akquise_aktivitaeten`) |
| Priorität hoch bei Aktivitäten | Priorität | ✗ | Aktivität ohne Priorität; erzeugte Aufgabe bekommt fest „mittel" |
| Kennzeichen „aus Automation" / „automatisch" | Herkunft | ✓ | `LeadDossier.tsx` Marke „Automation" (`automation_id`) |
| „Nachrichten" — Mail-Verlauf mit dem Eigentümer, „Im Posteingang antworten" | Schriftverkehr | ✗ | Kein Verlauf am Lead; nur Entwurf aus Vorlage mit Weiterleitung an `/postfach?neu=1` |
| Erledigte Aktivitäten mit Filter Alle / Termine / Aufgaben / Mails, „KI-Aktivitäten anzeigen" | Gefilterter Verlauf | ◐ | Eine gemeinsame Liste (offen + erledigt), Typ „ki" im Modell, kein Filter |
| Änderungs-Log (Feld, alt → neu, Nutzer) | Protokoll | ◐ | Historie-Reiter (`akquise_lead_historie`): Anlage, Stufe, Status, Zuständig, Objekt, Preis-Finder; Feldänderungen aus `leadSpeichern` werden nicht protokolliert |

### Lead-Akte — Aktivität planen (Dialog)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Typ (Anruf, Termin, Aufgabe, Mail, WhatsApp, Notiz) | Art wählen | ✓ | `AKTIVITAET_TYPEN` in `src/lib/akquise/stammdaten.ts`, Formular in `LeadDossier.tsx` |
| Fällig am + Uhrzeit | Zeitpunkt | ✓ | `faellig_am` (datetime-local) |
| Priorität Niedrig/Normal/Hoch | Dringlichkeit | ✗ | Fehlt |
| Zuständig (abweichend) | Zuweisung | ✗ | Immer Zuständiger des Leads |
| Wiederholen alle … Tage | Serie | ✗ | Fehlt |
| Betreff / Notiz | Inhalt | ✓ | `titel`, `text` |
| Termine zusätzlich im Kalender (für CRM-Abgleich) | Verkettung | ✓ | `aktivitaetAnlegen` → `termine` |
| Aufgaben zusätzlich in der Aufgabenliste | Verkettung | ✓ | `aktivitaetAnlegen` → `aufgaben` (über Referenz hinaus) |
| Nachfasstermin beim Planen neu setzen | Nächster Schritt | ✓ | Feld „Nachfassen neu setzen" |
| Anruf/Mail/Notiz zusätzlich im Kontakt-Verlauf | Verkettung Kontakt | ✓ | `aktivitaetAnlegen` → `aktivitaeten` (Kontakt) |

### Lead-Akte — Preis-Finder und Marktpreiseinschätzung (MPE)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Vergleichswerte aus eigenem Bestand (Objekte, Median €/m²) | Datengrundlage | ✓ | `src/lib/akquise/vergleichswerte.ts`, `wertindikation` in `src/lib/akquise/preisfinder.ts` (PLZ → Ort → Bestand, mind. 3 Werte) |
| Wohnfläche × €/m² → Punktwert („aus m²") | Rechenschritt | ✓ | `wertindikation` (sichtbare Schritte `schritte[]`) |
| Punktwert, Spanne ±, Startpreis-Faktor, Provisionssatz je Lead überschreibbar | Eingaben | ◐ | Punktwert, Angebotspreis, Sätze, Abschlag je Lead ✓; Spanne und Startpreis-Faktor nur global (Einstellungen) |
| Ergebnis Punktwert / Spanne / Startpreis / Provision brutto+netto | Ausgabe | ✓ | `preisRechnen`, `provisionsErwartung` (netto ÷ 1,19) |
| „Übernehmen" (am Lead speichern) | Persistenz | ✓ | `preisfinderSpeichern` (schreibt Historie-Eintrag) |
| Hinweis „keine vergleichbaren Objekte — Wert manuell setzen" | Leerzustand | ✓ | `fehlend[]` + Hinweis in `LeadDossier.tsx` |
| „Zur vollen MPE" / „Neue MPE anlegen" (springt in Objektbewertung, übernimmt Daten) | Verkettung Wertermittlung | ✓ | `leadWertermittlung` → `/wertermittlung/[id]` (Bezeichnung, Objekt, Kontakt übernommen) |
| „Vorhandene MPE verknüpfen" (Suche nach Titel/Adresse, „gleiche Adresse"-Hinweis) | Bestehende Einschätzung zuordnen | ✗ | Nur Neuanlage; keine Auswahl vorhandener Wertermittlungen |
| „Lösen" (MPE vom Lead trennen) | Verknüpfung entfernen | ✗ | Fehlt |
| MPE-Karte: „Zahlen übernehmen" (Realistisch, Angebotspreis, Courtage aus der MPE in den Lead) | Rückfluss der Wertermittlung | ✗ | Wertermittlung wird verlinkt, ihre Zahlen fließen nicht in `wert_indikation`/`angebotspreis` |
| Sicherheitsabschlag auf realistisches Volumen | Verhandlungsabschlag | ✓ | `provisionsErwartung` (`abschlag`, Vorgabe 10 %) |
| Provisionsteilung / Außen- / Innenprovision | Courtage-Modell | ✓ | `PROVISIONSARTEN` (teilung, aussen, innen, keine) |
| Warnung „Gesamtcourtage ungewöhnlich hoch / doppelt gerechnet" | Plausibilität | ✓ | `SATZ_WARNUNG` (> 10 %), Meldung in `LeadDossier.tsx` |
| Warnung „Andere Adresse als dieser Lead" | Zuordnungsprüfung | ✗ | Keine Adressprüfung (keine Verknüpfung vorhandener MPE) |
| Vermarktungsdauer (von–bis Monate) | Anzeige aus MPE | ✗ | Fehlt |
| „Weitere Immobilien dieses Eigentümers" (MPE an anderen Leads) | Übersicht je Eigentümer | ✗ | Fehlt |
| Markierung „bestimmt Wert, Startpreis, Provision" (eine von mehreren MPE) | Auswahl der maßgeblichen | ✗ | Nur eine `wertermittlung_id` je Lead |
| „PDF erstellen" — Wertindikation | Dokument für Eigentümer | ✓ | `src/lib/akquise/wertindikation-dokument.ts`, `/api/dokumente/wertindikation/[id]?format=pdf` (`src/app/api/dokumente/[art]/[id]/route.tsx`); zusätzlich Word |
| Pflichthinweis (keine gutachterliche Aussage, § 194 BauGB) | Rechtstext | ✓ | `WERTINDIKATION_HINWEIS` in Oberfläche und PDF-Fußnote |

### Lead-Akte — Reiter Dossier (eigenes Marktbild)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kennzahlen „Eigene Objekte in <Ort>", „Davon in PLZ", „Ø Preis je m² (Ort)", „Dieses Objekt je m²" | Marktbild aus eigenem Bestand | ◐ | Eingrenzungs-Schritte (PLZ/Ort/Bestand, Anzahl, Median €/m²) im Preis-Finder; keine gesonderten Kacheln |
| Diagramm „Ø Preis je m² nach Objektart" | Balken | ✗ | Kein Diagramm |
| Diagramm „Ø Preis je m² im Zeitverlauf" | Verlauf | ✗ | Kein Diagramm |
| Tabelle Vergleichsobjekte (Objekt, Objektart, Fläche, Baujahr, Preis, Status) | Vergleichsliste | ◐ | Tabelle im Preis-Finder (Objekt, Ort, m², Kaufpreis, €/m²; max. 12); Baujahr/Status fehlen, nur verkaufte Objekte |
| Beteiligte und Verknüpfungen (Eigentümer, Tippgeber, Objekt, Aufnahme, Wertermittlung) | Drehkreuz | ✓ | `Dossier` in `LeadDossier.tsx` — ImmoOffice-eigene Belegung des Reiters |
| „Objekt im Status Akquise anlegen" | Lead → Objekt | ✓ | `leadZuObjekt` (Objekt, `kontakt_objekt` Eigentümer, Historie) |

### Lead-Akte — Reiter Dokumente
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Dateiliste des verknüpften Objekts | Inline-Anzeige | ◐ | Nur Link „Dokumente (Objektablage)" auf `/objekte/[id]#dokumente` (Anker auf Objektseite nicht vorhanden); keine Liste im Lead |
| „Objektablage öffnen" | Navigation | ✓ | `LeadDossier.tsx` (`Dossier`), sofern Objekt existiert |
| Wertindikation als PDF / Word herunterladen | Ausgabe | ✓ | `Dossier`-Karte „Dokumente" |

### Pipeline-Kanban
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Spalten je Stufe mit Anzahl und gewichteter Provisionssumme | Board | ✓ | `src/app/(app)/akquise/leads/page.tsx` (Kanban-Zweig: Anzahl, `%`, `euro(summe)`) |
| Karten per Maus in andere Spalte ziehen | Drag & Drop | ✗ | Stufenwechsel per Auswahlliste + „Verschieben" (`StufeWechsel` kompakt) |
| Suche, Filter Zuständige / Quellen, Sortierung nach Provision / Wert / Neueste | Board-Filter | ◐ | Suche ✓ (gemeinsam mit Liste); Zuständige, Quellen, Sortierung ✗ |
| Karte: Wert, Provision, Anteil an der Prognose, „zählt nicht zur Prognose", überfällige Aufgaben | Karteninhalt | ◐ | Eigentümer, Quelle, Provision, Nachfassen-Marke; kein Wert, kein Prognose-Anteil, kein Aufgabenzähler |
| Verlustgrund-Dialog beim Verschieben nach „Verloren" | Pflichtangabe | ✓ | `StufeWechsel.tsx` + DB-Trigger |
| Stufenwechsel → Änderungs-Log + Automationen der Zielstufe | Verkettung | ✓ | Trigger `intern.akquise_lead_nachlauf` (Historie, alte Läufe abbrechen, neue planen) |
| Hinweis „keine Pipeline angelegt → Einstellungen" | Leerzustand | ✓ | `akquiseVorbereiten` legt Standard-Pipeline automatisch an (`akquise_standard_anlegen`) |

### Automationen — Matrix und Editor
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Reiter Automationen / Vorlagen / Geplante Läufe | Gliederung | ✓ | `src/components/akquise/AutomationenVerwaltung.tsx` (`REITER`) |
| Matrix Zeilen = Stufen, Spalten = Lead-Quellen, „Alle Quellen" als Rückfall | Übersicht | ◐ | Tabelle Stufe × Liste der Automationen je Pipeline; keine Spalten je Quelle, „jede Quelle" als Text; Rückfall-Logik (`quelle_id is null`) in DB ✓ |
| Kanal „Vorschlag im Dashboard (anrufen oder Mail freigeben)" | Vorschlag statt Versand | ◐ | Kanal „mail" erzeugt Entwurf als Aktivität am Lead; kein Dashboard-Vorschlag mit Freigabe-Knopf |
| Kanal „E-Mail (automatisch senden)" | Roboter-Versand | ✗ | Bewusst nicht: Läufe erzeugen nur Entwürfe (`akquise_laeufe_ausfuehren`, Kommentar „kein Roboter-Versand ohne Freigabe") |
| Kanal „Aufgabe am Lead" | Aufgabe anlegen | ✓ | Kanal „aufgabe" → `aufgaben` + `akquise_aktivitaeten` |
| Kanal „WhatsApp (noch nicht freigeschaltet)" | Messenger | ◐ | Kanal „whatsapp" liefert Text zum Kopieren (`KANAELE`), keine Anbindung — entspricht dem Referenzstand |
| Verzögerung (Stunden) | Zeitversatz | ✓ | `verzoegerung_stunden` (0–8760) |
| Vorlage zuordnen (mit Anlass-Tag) | Inhalt | ◐ | Vorlage je Kanal ✓; Anlass ✗ |
| Anzeigename (optional) | Beschriftung | ✓ | `name` |
| Stufe + Lead-Quelle | Auslöser | ✓ | `stufe_id`, `quelle_id` (null = jede Quelle), Pipeline-Bezug |
| „Automation ist aktiv" | Schalter | ✓ | `aktiv` |
| Schutzregel: höchstens eine Automations-Mail je Lead und Tag | Drosselung | ✗ | Nicht in `akquise_laeufe_ausfuehren` |
| Schutzregel: Stopp, sobald der Eigentümer antwortet | Antwort-Erkennung | ✗ | Kein Abgleich mit Posteingang |
| Schutzregel: Opt-out am Kontakt wird respektiert | Werbe-Einwilligung | ✗ | `einwilligung_werbung` nicht geprüft |
| Schutzregel: Stufenwechsel bricht offene Läufe ab | Abbruch | ✓ | Trigger `akquise_lead_nachlauf`; zusätzlich „Lead nicht mehr offen" im Ausführer |
| Löschen (geplante Läufe bleiben, laufen ins Leere) | Entfernen | ✓ | `automationLoeschen` (FK `on delete cascade`/restrict laut Migration) |
| Lauf sofort anstoßen mit Ergebnis („x geprüft · y gesendet · z Aufgaben · n abgebrochen") | Manueller Start | ✗ | Nur Tagesjob (`src/lib/jobs/worker.ts` → `akquise_laeufe_ausfuehren`); kein Knopf, keine Ergebnismeldung |
| Verwaltungsrecht für Automationen | Rechte | ✓ | `rechtErzwingen(... "freigeben")` + RLS `intern.ist_verwaltung()` |

### Automationen — Vorlagen
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Drei Bereiche „Mail Center" / „Aktivitäten Center" / „WhatsApp Center" | Vorlagen je Kanal | ✓ | Vorlagenliste mit Kanal-Marke (`KANAELE`), Auswahl im Editor; keine getrennten Reiter, aber gleiche Kanäle |
| „+ Neue Vorlage" | Anlegen | ✓ | `vorlageSpeichern` |
| Editor: Name, Kanal, Betreff, Text, Aktiv | Grundfelder | ✓ | `AutomationenVerwaltung.tsx` Reiter „Vorlagen" |
| Anlass (Online Bewertung / Persönliche Bewertung / Beratung) | Klassifizierung | ✗ | Kein Feld |
| „Handlungsanweisung" bei Aufgaben-Vorlagen | Anweisungstext | ◐ | Textfeld dient als Anweisung („Betreff / Aufgabentitel" + „Text") |
| Platzhalter-Liste | Hilfe | ✓ | `PLATZHALTER` ({anrede}, {name}, {adresse}, {titel}, {objektart}, {absender}, {firma}) |
| KI-Textvorschlag („Was soll die Nachricht bewirken?", ersetzt Betreff und Text) | KI-Aktion | ✗ | Keine KI-Funktion im Akquise-Modul (kein Aufruf des Anbieter-Layers, keine Credits) |
| Löschen mit Warnung (Automationen laufen ins Leere) | Entfernen | ✓ | `vorlageLoeschen` (ohne Warnhinweis) |
| Vorschau (Betreff, Textauszug) | Liste | ◐ | Nur Name und Kanal in der Liste |
| Standard-Vorlagen beim ersten Aufruf | Vorbelegung | ✓ | `akquise_standard_anlegen` (4 Vorlagen) — über Referenz hinaus |
| Vorlage am Lead ausfüllen und als E-Mail-Entwurf nutzen | Verkettung Mail | ✓ | `leadMailEntwerfen` → `mailto:` oder `/postfach?neu=1`, „Als gesendet vermerken" |

### Automationen — Geplante Läufe
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Filter Geplant / Erledigt / Abgebrochen / Fehler / Alle mit Zählern | Statusfilter | ✓ | `AutomationenVerwaltung.tsx` (`laufFilter`, Zähler nur bei „Geplante Läufe"-Reiter) |
| Tabelle: Geplant für, Kanal, Betreff, Status, Ausgeführt, Hinweis (Fehler) | Laufliste | ✓ | Zeilen mit Status, Automation/Kanal, Lead-Link, Zeitpunkt, Fehlertext |
| Lauf abbrechen | Manuell stoppen | ✓ | `laufAbbrechen` (nur Status geplant) |
| Ausführung im Hintergrund (Wächter) | Job | ✓ | `src/lib/jobs/worker.ts` (`akquise_laeufe_ausfuehren`, max. 200 je Lauf, Fehler je Lauf gefangen) |
| Ergebnis: Mail-Entwurf am Lead, Aufgabe beim Zuständigen, Platzhalter gefüllt | Wirkung | ✓ | `akquise_laeufe_ausfuehren` in Migration |

### Auswertung
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zeitraum Von / Bis | Filter | ✓ | `src/app/(app)/akquise/auswertung/page.tsx` (`?von=&bis=`) |
| Schnellwahl „Dieser Monat / Dieses Jahr / Letzte 90 Tage" | Vorgaben | ✗ | Kein Schnellwahl-Knopf (Vorgabe: letzte drei Monate) |
| Unterreiter „Marketing-Report" / „Statistik" | Gliederung | ◐ | Eine Seite mit Kennzahlen und Listen |
| Gesamtausgaben (n Kampagnen) | Kennzahl | ✓ | `marketingReport.ausgaben`, `kampagnen` |
| Gesamtumsatz (Provision) | Kennzahl | ✓ | `umsatz` (erwartete Provision gewonnener Leads) |
| Ø Kosten pro Lead (CPL) | Kennzahl | ✓ | `cpl` |
| Ø Kosten pro Auftrag (CPA) | Kennzahl | ✓ | `cpa` |
| Ø Provision pro Auftrag | Kennzahl | ✓ | `provisionJeAbschluss` |
| ROAS (Umsatz je Euro Werbebudget) | Kennzahl | ✓ | `roas` |
| Leads online : offline | Kennzahl | ✓ | `online`, `offline` (+ Netzwerk, Tippgeber) |
| Conversion Lead → Auftrag | Kennzahl | ✓ | `conversion` |
| Hinweis „CPL/CPA/ROAS leer ohne Ausgaben" | Erklärung | ◐ | Werte zeigen „—", kein erklärender Hinweis |
| Balken „Leads der letzten 7 Tage" (online/offline) | Diagramm | ✗ | Fehlt |
| „Verteilung der Leads nach Quelle / Kampagne" (Diagramm) | Diagramm | ◐ | Liste „Leads je Quelle" mit Gewinnen; keine Grafik, keine Verteilung je Kampagne |
| Kampagnen-Tabelle (Name, Campaign-ID, Art, Source, Budget, Ausgaben, Laufzeit, Leads) | Übersicht | ◐ | Eigene Seite `src/app/(app)/akquise/kampagnen/page.tsx` mit Name, Art, Kanal, Budget, Ausgaben, Laufzeit, Leads; Campaign-ID und Source (UTM-Zuordnung) ✗ |
| Kampagnen-Editor (Art: Anzeigenplattformen, Website, Flyer, Postwurf, Plakat, Messe, Empfehlung, Sonstiges; Budget; Ausgaben; Start; Ende; Notiz) | Kampagnen pflegen | ◐ | `src/components/akquise/KampagnenVerwaltung.tsx`, `kampagneSpeichern`: Art als online/offline/netzwerk/tippgeber + Freitext „Kanal"; Rest ✓ |
| Hinweis „Quelle muss auf Kampagne zeigen" | Datenmodell-Hinweis | ✓ | Quellen mit `kampagne_id` auf derselben Seite; Zähler Leads je Kampagne |
| Trichter Neuer Lead → Termin vor Ort → Auftrag | Diagramm | ✗ | Fehlt |
| „Neue und gewonnene Leads je Monat" (Säulen) | Diagramm | ✗ | Fehlt |
| „Verlorene Leads nach Verlustgrund" | Auswertung | ✓ | Liste `verlustgruende` |
| „Qualifizierung: Leads je Stufe" | Auswertung | ✓ | „Prognose je Stufe" (Anzahl, roh, gewichtet) |
| „Leads je Zuständigem" | Auswertung | ✗ | Fehlt |
| Pipeline-Prognose (gewichtet) | Kennzahl | ✓ | `pipelinePrognose` — über Referenz-Auswertung hinaus |

### Lead-Mails (Aus E-Mails)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Posteingang alle 20 Minuten automatisch nach Eigentümer-Anfragen durchsuchen (Portale und freie Mails) | Hintergrund-Erkennung | ✗ | Kein Job; Erkennung nur auf Klick |
| „Posteingang durchsuchen" mit Zeitraum (7/30/90 Tage, Jahr) und Ergebnis „x geprüft · y Vorschläge · z aussortiert" | Nachträglicher Lauf | ✗ | Fehlt |
| Vorschlagskarte: Absender, Betreff, Quelle, Konfidenz „% sicher", Objektangaben | Vorschau | ✗ | Keine Vorschlagsliste |
| „Prüfen / ändern": Formular mit allen Feldern (Anrede, Name, Firma, Kontakt, Adresse, Objektart, Flächen, Zimmer, Baujahr, Verkaufszeitraum, Wertschätzung, Zuständig, Nachricht) vor Übernahme | Editierbares Formular vor Übernahme | ◐ | Übernahme direkt aus der Nachricht (`nachrichtAlsLead` in `src/components/postfach/NachrichtDetail.tsx`); Felder danach im Lead editierbar, Hinweis bei unvollständiger Erkennung |
| „Als Lead übernehmen" (erzeugt Kontakt + Lead, startet Automationen) | Übernahme | ✓ | `nachrichtAlsLead` (`src/server/akquise-aktionen.ts`), Parser `src/lib/akquise/mail-parser.ts`, Quelle „E-Mail-Eingang", Automationen über Trigger |
| „Verwerfen" / „Zurückholen" | Vorschlag ablehnen | ✗ | Fehlt (keine Vorschlagsverwaltung) |
| Dubletten-Hinweis „bereits offener Lead für diesen Kontakt" | Warnung | ◐ | Nur Dublette je Nachricht (`email_eingang.nachricht_id`); kein Hinweis auf offenen Lead desselben Kontakts |
| „Kontakt ist im Adressbuch bekannt — wird wiederverwendet" | Dublettenschutz Kontakt | ✓ | `kontaktFinden` (E-Mail-Abgleich) |
| Mehrere Vorschläge gleicher Adresse zusammenfassen | Dublettenschutz Objekt | ✗ | Fehlt |
| Status-Filter Offen / Übernommen / Verworfen / Aussortiert | Verwaltung | ✗ | Fehlt |
| „Lead öffnen" / „Mail öffnen" | Navigation | ✓ | Link zum Lead nach Übernahme; Nachricht bleibt im Postfach |
| Historie „Aus Lead-Mail übernommen (Absender)" | Protokoll | ◐ | Herkunft als JSON `email_eingang` am Lead und Notiz; kein Historie-Eintrag |
| Erkennung von Portal-Formularen mit Feld:Wert-Struktur | Parser | ◐ | `mail-parser.ts` erkennt Feld:Wert-Zeilen und freie Verkaufsabsicht; keine portalspezifischen Formate, keine Konfidenz |

### Akquise-Radar
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Radar-Treffer automatisch sammeln (`radar_objekte`) | Portal-Beobachtung | ✗ | Bewusst nicht: rechtliche Prüfung offen (`docs/BLOCKER.md`, `docs/SCOPE.md` „SPÄTER") |
| Treffer manuell erfassen (Titel, Adresse, Objektart, Fläche, Preis, Quelle, Link, Anbieter, Telefon, Notiz) | Erfassung | ✓ | `src/components/akquise/RadarWerkzeuge.tsx`, `radarErfassen` — Ersatz für das Auslesen |
| Statusfilter Neu / Übernommen / Verworfen | Filter | ✓ | `src/app/(app)/akquise/radar/page.tsx` |
| „Als Lead übernehmen" (Quelle „Privatinserat") | Übernahme | ✓ | `radarUebernehmen` (Straße/Hausnummer getrennt, Preis → Angebotspreis) |
| Verwerfen / Wieder aufnehmen | Pflege | ✓ | `radarStatus` |
| Hinweis § 7 UWG | Rechtstext | ✓ | Seite und Erfassungskarte |

### Einstellungen
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Preis- und Provisionsvorgaben: Provisionssatz gesamt, Startpreis-Faktor, Preisspanne ± | Vorgaben Preis-Finder | ✓ | `src/components/akquise/AkquiseEinstellungen.tsx`, `einstellungenSpeichern`, Tabelle `akquise_einstellungen` |
| Pipelines: „+ Pipeline", umbenennen, Beschreibung | Grunddaten | ✓ | `pipelineSpeichern` (neue Pipeline mit 4 Standardstufen) |
| Pipeline „Klonen" | Kopie mit Stufen | ✗ | Fehlt |
| Pipeline-Art (Setting / Closing / Wunschimmo) und „verknüpft mit" | Zweistufige Prozesse | ✗ | Kein Art-Feld, keine Verknüpfung; Standard-Pipeline-Kennzeichen ✓ (`ist_standard`) |
| Stufen: Reihenfolge, Name, Zusatz, Wahrscheinlichkeit, Gewonnen/Verloren, löschen, „Neue Stufe" | Stufenpflege | ✓ | `stufeSpeichern`, `stufeLoeschen` (nur ohne Leads), Constraint gewonnen ≠ verloren |
| Stufen sortieren (verschieben) | Reihenfolge | ◐ | Sortierung als Zahl editierbar, kein Verschieben per Knopf |
| Lead-Quellen: Name, Art, Kampagne, Aktiv | Quellenpflege | ✓ | `src/components/akquise/KampagnenVerwaltung.tsx`, `quelleSpeichern` (auf Seite „Kampagnen und Quellen"; zusätzlich Ziel-Pipeline) |
| Quelle: Slug (`?q=`) und „Formular-Link kopieren" | Zuordnung öffentlicher Anfragen | ✗ | Kein Slug, kein öffentliches Formular |
| Tags verwalten | Schlagwortliste | ✗ | Keine Tags |
| Verlustgründe verwalten | Liste | ✓ | `verlustgruende` (je Zeile), Standardliste |
| Öffentliches Bewertungsformular (`?q=Quelle` → Lead in „Neuer Lead", Automationen, Benachrichtigung des Zuständigen) | Lead-Eingang von der Website | ✗ | Kein Eigentümer-Anfrageformular; `src/app/expose/[token]/Kontaktformular.tsx` betrifft Interessenten am Web-Exposé; API v1 (`src/app/api/v1`) hat keine Lead-Route |
| Nachfassfrist (Tage) | Vorgabe | ✓ | `nachfassen_tage` — über Referenz hinaus |
| Standard-Stammdaten beim ersten Aufruf | Einrichtung | ✓ | `akquise_standard_anlegen` (Pipeline mit 6 Stufen, 6 Quellen, 4 Vorlagen) |

### Verknüpfungen und Querschnitt
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Lead aus der Objektaufnahme | Verkettung Aufnahme → Lead | ✓ | `leadAusAufnahme`, Knopf in `src/app/(app)/aufnahmen/[id]/page.tsx` — über Referenz hinaus |
| Nachfassen auf dem Dashboard | Startseite | ✓ | `src/app/(app)/dashboard/page.tsx` („Leads nachfassen") |
| Rechte je Rolle (lesen/anlegen/ändern/löschen/freigeben) serverseitig + RLS | Rechte | ✓ | `src/lib/auth/rechte.ts` Modul `akquise`; Policies in Migration; Test `supabase/tests/akquise.sql` |
| Mandantentrennung, Fremdschlüssel-Prüfung über Mandantengrenzen | Sicherheit | ✓ | Trigger `intern.akquise_verweise_pruefen`, Test `supabase/tests/akquise.sql` |
| Unit-Tests Preis-Finder, Report, CSV, Parser | Qualität | ✓ | `src/lib/akquise/akquise.test.ts` |
| KI-Assistent löst Automations-Lauf aus | KI-Verknüpfung | ✗ | Kein Assistent im Akquise-Kontext |

### Zusammenfassung

Zählung (Zeilen oben): **✓ 109 · ◐ 57 · ✗ 56** (Gesamt 222). Grundgerüst — Leads, Pipeline mit Stufen und Verlustgrund-Pflicht, Historie, Preis-Finder mit sichtbarem Rechenweg und PDF, Aktivitäten mit Kalender-/Aufgaben-Verkettung, Kampagnen/Quellen, Automationen mit Läufen und Tagesjob, Auswertungskennzahlen, manuelles Radar, Einstellungen, Rechte und Tests — ist vorhanden und teils tiefer als die Referenz (Wertermittlung als offenes Rechenblatt, Nachfassfrist, Aufnahme → Lead, Word-Ausgabe).

Wichtigste Lücken, nach Gewicht:

1. **Lead-Mails als Arbeitsvorrat fehlen komplett**: keine Hintergrund-Erkennung im Posteingang, keine Vorschlagskarten mit Konfidenz, kein Prüfformular vor Übernahme, kein Verwerfen/Zurückholen, kein Zähler auf der Übersicht. Vorhanden ist nur „Als Akquise-Lead übernehmen" an der einzelnen Nachricht.
2. **Öffentliches Eigentümer-Bewertungsformular mit Quellen-Slug** fehlt — damit fehlt der wichtigste Online-Lead-Eingang (Website → Stufe „Neuer Lead" → Automationen → Benachrichtigung). Auch die API v1 hat keine Lead-Route.
3. **Schutzregeln der Automationen**: kein Tageslimit je Lead, kein Stopp bei Antwort, Werbe-Opt-out am Kontakt wird nicht ausgewertet (Feld `einwilligung_werbung` existiert). Kein manueller Lauf-Start. Kanal „Vorschlag im Dashboard mit Freigabe" fehlt.
4. **Lead-Akte**: Lagekarte, Nachrichten-Verlauf mit dem Eigentümer, Interessenten-Matching (Dossier verlinkt auf `#treffer`/`#dokumente`, die auf der Objektseite nicht existieren), Tags, Wiederholung/Priorität/Zuständiger bei Aktivitäten, Ändern von Aktivitäten, Bearbeitungsmodus, Eigentümer-Einladung und Rückruf aus dem Lead, nachträgliche Objektauswahl, Feldänderungen im Änderungs-Log.
5. **MPE-Verknüpfung**: keine Zuordnung vorhandener Wertermittlungen, kein „Zahlen übernehmen" aus der Wertermittlung in den Lead, kein Lösen, keine Übersicht weiterer Immobilien des Eigentümers, keine Vermarktungsdauer.
6. **Liste und Kanban**: keine Filter nach Stufe/Quelle/Zuständigem/Tag, keine Sortierung, kein CSV-Export, kein Blättern, kein Drag & Drop, Karten ohne Wert/Aufgabenzähler.
7. **Auswertung ohne Grafik**: kein Trichter, keine Monatssäulen, kein 7-Tage-Balken, keine Zuständigen-Auswertung, keine Zeitraum-Schnellwahl; Kampagnen ohne Campaign-ID/Source; Dossier-Marktbild ohne Objektart-/Zeitverlauf-Diagramme.
8. **Kein KI-Einsatz im Modul**: KI-Textvorschlag für Vorlagen fehlt; keine Credits-Anbindung nötig, solange das so bleibt.
9. **Einstellungen**: Pipeline klonen, Pipeline-Art/Verknüpfung (Setting/Closing), Tags, Vorlagen-Anlass.


---

# Funktionsinventar Referenz → ImmoOffice.ai: Admin-Bereich, Mein Profil, Team, Arbeitszeit, Bewerber, Finanzen, Rechnungen

Quelle: Textauszüge der Referenz-Komponenten (AdminPage, ProfilPage, TeamPage, ArbeitszeitPage, BewerberPage, öffentlicher Einstellungstest, FinanzenPage, LiquidityPage, RechnungenPage, ProvisionenPage, _technik). Abgleich gegen den Stand von ImmoOffice.ai am 04.09.2026 (Grep in `src/app/(app)/einstellungen`, `arbeitszeit`, `urlaub`, `rechnungen`, `plattform`, `src/components/verwaltung`, `src/components/einstellungen`, `src/server/*-aktionen.ts`, `supabase/migrations`). Pfade sind relativ zum Repository.

Legende: ✓ vorhanden (mit Fundstelle) · ◐ teilweise (Lücke benannt) · ✗ fehlt. Kennzeichen des Referenzunternehmens sind durchgehend durch „Referenz“ ersetzt.

---

## Kachel Admin-Bereich

### Einstieg und Zugriff
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Unterkacheln Mitarbeiter · Firmen-Stammdaten · Kennzahlen · Bausteine · Finanzierung · onOffice-Import · Urlaub · Aktivitäts-Log | Einstiegsseite des Chef-Bereichs mit acht Unterbereichen | ◐ | `src/app/(app)/einstellungen/page.tsx` (Karten Erscheinungsbild, Unternehmen, Rechtstexte, Integrationen, Postfächer, Schnittstelle, Verwaltung, Zugänge). Fehlt: Bausteine (siehe unten) |
| Zugriff nur mit Rechteflag „Admin-Bereich“ (Chef) | Bereich nur für Berechtigte sichtbar und bedienbar | ✓ | Modul `einstellungen` nur Inhaber/Administrator: `src/lib/auth/rechte.ts`, `rechtErzwingen` in `src/app/(app)/einstellungen/page.tsx`; DB `intern.ist_verwaltung()` in `supabase/migrations/20260816200259_kern_mandanten_benutzer.sql` |
| Karte „Transparenz & Finanzierung“ | Verweis auf die Exposé-Seite, die aus den Finanzierungsannahmen gespeist wird | ◐ | Annahmen pflegbar (`/einstellungen/kennzahlen`), aber keine Verwendung in Exposé-Vorlagen: `grep finanzierungs_annahmen src` trifft nur `src/app/(app)/einstellungen/kennzahlen/page.tsx` |

### Mitarbeiter
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Mitarbeiter anlegen (Titel, Name, E-Mail, Firma/Standort, Stufe, initiales Passwort, „Generieren“) | Legt Login-Konto plus Profil direkt an; Erfolgsmeldung zeigt das Initialpasswort | ◐ | Einladung mit Rolle statt Direktanlage: `src/components/einstellungen/Einladungen.tsx`, `src/server/einladungs-aktionen.ts` (`einladungErstellen`, RPC `einladung_erstellen`). Fehlt: Titel bei Einladung, Standortzuordnung, Initialpasswort/Generator |
| Einladung per E-Mail (Passwortfeld leer lassen) | Versand eines Einladungslinks | ◐ | Link wird einmalig angezeigt und kopiert (`Einladungen.tsx`); automatischer Mailversand laut Kommentar noch nicht angebunden (`docs/ZUGAENGE_FEHLEND.md`) |
| Pflichtprüfungen (Name und E-Mail, Firma, Passwort ≥ 6 Zeichen) | Validierung vor dem Anlegen | ✓ | `einladungSchema` (zod) in `src/server/einladungs-aktionen.ts`; Passwortregel (≥ 12 Zeichen) in `src/server/auth-aktionen.ts` |
| Mitarbeiterliste mit Stufe, Firma, Beitrittsdatum, Bereichen, „PW-Änderung ausstehend“, „Tutorial ✓/offen“ | Überblick über alle Konten mit Statushinweisen | ◐ | `src/components/einstellungen/Benutzerliste.tsx` (Name, E-Mail, Rolle, letzter Login, Abgeschaltet-Marke). Fehlt: Firma/Standort, Beitrittsdatum, Passwort- und Tutorial-Status (`benutzer.tutorial_gesehen_am` existiert, wird nicht angezeigt) |
| Stufe wählen (Chef, Standortleitung, Makler, Assistenz) — „belegt die Häkchen vor“ | Rollenvorlage bestimmt die Grundrechte | ✓ | Sechs Rollen (`ROLLEN` in `src/lib/auth/rechte.ts`), `rolleSetzen` in `src/server/einstellungen-aktionen.ts`; eigene Rolle nicht änderbar |
| Rechte je Bereich als Einzelhäkchen, sensible Bereiche (★ Finanzen, Admin), Abweichung von der Vorlage sichtbar („weicht ab — einzeln angepasst“ / „entspricht der Vorlage“) | Feinsteuerung pro Mitarbeiter über der Vorlage | ✓ | `src/components/einstellungen/Rechtematrix.tsx` (Modul × Aktion, abweichende Häkchen umrandet, Zähler „n Abweichungen“); nur Abweichungen gespeichert (`rechteSetzen`, `benutzer.rechte_uebersteuerung`); serverseitig plus RLS erzwungen (`supabase/migrations/20260817045506_funktionsrechte_einschraenken.sql`) |
| „Rechte speichern“ / „Abbrechen“ | Speichern oder Verwerfen der Häkchen | ✓ | `Rechtematrix.tsx` („Rechte speichern“, „Schließen“) |
| Erklärtext „keine Datentrennung“ — Rechte steuern Sichtbarkeit der Bereiche | Hinweis, dass Mitarbeiter alle Objekte sehen | ◐ | ImmoOffice erzwingt Modulrechte in RLS; Spalte `benutzer.objekt_sichtbarkeit` (`supabase/migrations/20260903120000_onboarding_team_audit.sql`) existiert ohne Oberfläche |
| Mitarbeiter entfernen (RPC `delete_mitarbeiter`: Login-Konto und Profil komplett löschen; Chef-Konto geschützt) | Endgültiges Löschen eines Kontos | ◐ | Bewusst nur Abschalten/Freigeben statt Löschen (`zugangUmschalten` in `src/server/einstellungen-aktionen.ts`, `Benutzerliste.tsx`); eigener Zugang geschützt; Löschtrigger `intern.pruefe_benutzer_loeschung` in `supabase/migrations/20260817144057_einladungen_und_benutzerverwaltung.sql` |
| Passwort zurücksetzen (Hinweis: nur im Supabase-Dashboard möglich) | Admin setzt Mitarbeiterpasswort neu | ◐ | Kein Admin-Reset; Nutzer setzt selbst über „Passwort vergessen“ (`passwortVergessen`, `passwortNeuSetzen` in `src/server/auth-aktionen.ts`) |
| Live-Aktualisierung der Liste (Realtime-Kanal auf `profiles`) | Liste aktualisiert sich ohne Neuladen | ✗ | Server-Rendering mit `revalidatePath`; kein Realtime-Abonnement |
| Rechte-Änderungen protokolliert | Nachvollziehbarkeit | ✓ | Trigger `intern.benutzer_aenderung_protokollieren` → `audit_log` (`20260903120000_onboarding_team_audit.sql`) — in der Referenz nicht vorhanden |

### Firmen-Stammdaten
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Mehrere Firmen/Standorte pflegen („+ Weitere GmbH anlegen“, Land-Vorgabe) | Je Standort eigener Datensatz für Rechnungen und Notar-Laufzettel | ◐ | Eine Firma je Mandant: `src/components/einstellungen/Stammdaten.tsx`, `stammdatenSpeichern` (`mandant_branding`). Tabelle `standorte` existiert (`20260903120000_onboarding_team_audit.sql`) ohne Oberfläche. Mehrere Rechnungsabsender möglich (`rechnungs_absender`, Typ firma/persönlich) |
| Felder Firmenname, Straße, Ort, E-Mail, Telefon, Bank, USt-IdNr., Geschäftsführer | Stammdaten je Firma | ◐ | Stammdaten: Firmenname, Rechtsform, Vertretung, Adresse, Telefon, E-Mail, Web, Handelsregister, USt-IdNr., Erlaubnisbehörde (`Stammdaten.tsx`). Bankverbindung nur je Rechnungsabsender (`src/components/rechnungen/AbsenderVerwaltung.tsx`) |
| Verwendung in Rechnungen (Makler-Auswahl) und Notar-Laufzettel | Adresse und Konto fließen in Dokumente | ✓ | Rechnungen: `absenderVorbereiten` in `src/server/rechnungen-aktionen.ts` legt Firmenabsender aus `mandant_branding` an; Notar/Verkauf liest `mandant_branding` (`src/server/verkauf-aktionen.ts:87`) |
| Speichern je Firma („Speichere…“) | Persistenz | ✓ | `stammdatenSpeichern` (zod-Prüfung PLZ, E-Mail, USt-IdNr.) |

### Kennzahlen
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Jahr anlegen („+ Jahr“), Duplikatschutz („Für … gibt es schon einen Eintrag“) | Kennzahlen je Jahr | ✓ | `src/components/verwaltung/KennzahlenFormular.tsx`, `kennzahlenSpeichern` (`src/server/verwaltung-aktionen.ts`), `unique (mandant_id, jahr)` in `supabase/migrations/20260904170000_verwaltung.sql` |
| Felder: Vermittelte Objekte, Ø Erzielungsquote %, Ø Vermarktungsdauer (Monate), Google-Bewertungen, Ø Sterne, „Daten & Fakten“ (eine Zeile je Punkt) | Erfassung | ✓ | `firma_kennzahlen` (objekte_vermittelt, erzielungsquote, vermarktungsdauer_schnitt in Tagen, google_anzahl, google_schnitt, fakten[]); Fakten je Zeile, max. 12 |
| Aktiv-Kennzeichen, „immer das jüngste aktive Jahr“ | Auswahl des Jahres für Dokumente | ◐ | Spalte `aktiv` und Häkchen „In Dokumenten verwenden“ vorhanden; Auswahl-Logik nirgends genutzt (siehe nächste Zeile) |
| Kennzahlen erscheinen in der Marktpreiseinschätzung („Daten & Fakten“, „Warum der Verkauf mit uns…“); leere Felder lassen die Beweisseite entfallen | Verwendung in der Wertermittlung | ✗ | `grep firma_kennzahlen src` trifft nur die Einstellungsseite — keine Einbindung in `src/lib/wertermittlung*`, `src/lib/expose/*` |
| Speichern / Jahr löschen | Persistenz | ✓ | `kennzahlenSpeichern` (`loeschen=1`) |

### Finanzierung
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Annahmen: Zinssatz, Anfängliche Tilgung %, Eigenkapital %, Notar & Grundbuch %, Hinweistext unter der Rechnung | Zentrale Annahmen für Finanzierungsbeispiele | ✓ | `FinanzierungFormular` in `src/components/verwaltung/KennzahlenFormular.tsx`, `finanzierungSpeichern`, Tabelle `finanzierungs_annahmen` (zusätzlich Grunderwerbsteuer %) |
| Grunderwerbsteuer je Objekt aus PLZ abgeleitet, am Objekt überschreibbar; Courtage aus Objektdaten | Automatik statt Einstellung | ✗ | Nur pauschaler Prozentsatz; keine PLZ-Ableitung (`grep grunderwerbsteuer src/lib` leer) |
| Annahmen speisen die Exposé-Seite; alle künftigen Exposés rechnen damit | Verwendung | ✗ | Keine Verwendung außerhalb der Einstellungsseite (siehe „Einstieg“) |
| Speichern | Persistenz | ✓ | `finanzierungSpeichern` (Upsert je Mandant) |

### Bausteine für die Marktpreiseinschätzung
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Baustein anlegen / bearbeiten / löschen (interner Name, Überschrift, Layout Bild ganzseitig · Text zweispaltig · Bild + Text, Einfügepunkt im PDF aus 16 Positionen, Sortierung, Bild-Pfad, Quellenangabe, Kapitel-Zeile, Inhalt mit Aufzählung) | Wiederverwendbare Zusatzseiten für das Wertermittlungs-PDF | ✗ | Kein Gegenstück: `src/lib/expose/bausteine.tsx` sind Layout-Bausteine der Exposé-Vorlagen; in `src/components/wertermittlung/*` und `src/server/wertermittlung-aktionen.ts` keine verwaltbaren Zusatzseiten (`grep -i baustein`, `Zusatzseite` leer). `docs/FUNKTIONSABGLEICH.md` nennt ◐ — nicht belegt |
| Standard-Bausteine automatisch in jeder Bewertung, je Bewertung abwählbar; andere je Bewertung anhaken | Steuerung je Bewertung | ✗ | wie oben |
| Bilder aus dem Branding-Bucket | Ablage | ✗ | wie oben (Bucket `MARKE_BUCKET` existiert nur für Logo/Profil) |

### onOffice-Anbindung
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Schritt 1 „Feldnamen prüfen“ (jeden Feldnamen einzeln gegen die API testen, Ergebnis merken, nur einmal nötig) | Ermittelt gültige Felder des Kontos | ✓ | `felderPruefen` in `src/integrationen/onoffice/connector.ts` (automatisch beim ersten Lauf, Ergebnis in `konfig.felder`); kein eigener Knopf |
| Schritt 2 „Objektdaten holen“ (Vollsync in einen Spiegel, Zähler gelesen/neu/aktualisiert/deaktiviert) | Rohdaten übernehmen | ◐ | Kein Spiegel: Lauf schreibt direkt in `objekte` (`syncStarten` in `src/server/integrations-aktionen.ts`, `src/integrationen/kern/lauf.ts`, Tabelle `sync_laeufe` mit angelegt/geändert/übersprungen/fehler/konflikte) |
| Schritt 3 „Ins CRM übernehmen“; im Portal bearbeitete Objekte (🔒) werden übersprungen | Übernahme mit Schutz lokaler Änderungen | ◐ | Konfliktentscheid „letzte Änderung gewinnt“ mit Konfliktliste zur manuellen Prüfung (`src/integrationen/kern/abgleich.ts`); keine Sperre bearbeiteter Objekte |
| Schritt 4 „Bilder herunterladen“ (batchweise in Runden, Abbrechen, Ergebnis je Runde, Bild-Diagnose mit Rohantwort) | Bilder, Grundrisse, Lagepläne in eigenen Storage | ◐ | Bilder werden im Lauf mitgeholt und abgelegt (`bilderErgaenzen` in `onoffice/connector.ts`, `bildSpeichern` in `src/integrationen/kern/lauf.ts`); kein Rundenlauf, kein Abbruch, keine Diagnoseausgabe |
| Zähler „Im Spiegel / Im CRM / Bilder geprüft / Bilder geladen / Gültige Felder“ | Fortschrittsanzeige | ◐ | Lauf-Statistik je Lauf in `src/components/integrationen/IntegrationenUebersicht.tsx`; keine Bild- und Feldzähler |
| Protokoll (Verlauf der Schritte, „Leeren“) | Ausführungsprotokoll | ✓ | Letzte 30 Läufe mit Fehlerliste (`IntegrationenUebersicht.tsx`, `sync_laeufe`); kein „Leeren“ (bewusst Nachweis) |
| Verbindungstest (Edge `onoffice-test`) | Prüft Zugang | ✓ | „Verbindung prüfen“ → `verbindungPruefen` in `src/server/integrations-aktionen.ts` |
| Ausführen/Abbrechen je Schritt, „Reihenfolge einhalten“ | Bedienung | ◐ | Ein Knopf „Jetzt abgleichen“ mit Richtung (holen/senden/beide); Takt manuell/15 min/stündlich/täglich (`sync_faellige_einplanen` in `20260903140000_sync_einplaner.sql`) |
| Zugangsdaten hinterlegen | Token/Secret speichern | ✓ | Verschlüsselt, nie wieder anzeigbar: `objektVerschluesseln` (`src/integrationen/kern/zugangsdaten.ts`), `NeueIntegration.tsx` |

### Urlaub (Verwaltungssicht)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kontingente je Mitarbeiter: Urlaubstage/Jahr, Übertrag (Resttage Vorjahr), Eintrittsdatum (anteilig 1/12 je vollem Monat), Staffel „Jahr:Tage“ | Anspruchspflege | ✓ | `KontingentFormular` in `src/components/verwaltung/UrlaubAnsicht.tsx`, `mitarbeiterKontingentSpeichern`; Spalten `eintritt`, `urlaubstage_jahr`, `urlaub_uebertrag`, `urlaub_staffel` (`20260904170000_verwaltung.sql`), Trigger schützt gegen Selbständerung |
| Bilanz: Anspruch (anteilig n/12), Genehmigt, Beantragt, Noch frei; Übertrag „bis 31.03. genommen / verfallen“ | Rechnung je Jahr | ✓ | `bilanz`, `anspruchJahr` in `src/lib/verwaltung/urlaub.ts` (Frist 31.03., Übertrag manuell + automatisch aus Vorjahresrest); Tests `src/lib/verwaltung/verwaltung.test.ts` |
| Team-Urlaubsübersicht mit Farbampel, nächstem Urlaub, letztem Hinweis | Überblick über alle Mitarbeiter | ✓ | „Team-Übersicht“ in `UrlaubAnsicht.tsx` (`naechster`, `hinweis`), `src/app/(app)/urlaub/page.tsx` |
| Schriftliche Hinweise (Resturlaub/Verfall mit Frist) senden und anzeigen | Erinnerung vor Verfall | ✓ | `urlaubHinweisSenden` (Aufgabe an Mitarbeiter, Mail über Jobwarteschlange, Tabelle `urlaub_hinweise`); Art „verfall“ nur im Schema, Oberfläche sendet „resturlaub“ |
| Urlaub als Kalendertermin (Arbeitstage aus Zeitraum berechnet) | Sichtbarkeit im Kalender | ✓ | Genehmigung legt ganztägigen Termin und `arbeitszeit_tage` (Art urlaub) an: `urlaubEntscheidenIntern` in `src/server/verwaltung-aktionen.ts` |
| Antrag stellen / genehmigen / ablehnen / stornieren, Überschneidungen im Team | Antragsfluss | ✓ | `urlaubBeantragen`, `urlaubEntscheiden`, `urlaubStornieren`, `ueberschneidungen`; Trigger `intern.urlaub_aenderung_pruefen` — in der Referenz nur über Kalendertermine |
| Rechteprüfung: nur Verwaltung ändert Kontingente | Schutz | ✓ | RLS `az_modelle_schreiben`, `urlaub_hinweise_schreiben`, Trigger `benutzer_kontingent_schutz` |

### Aktivitäts-Log
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Alle wichtigen Aktionen anzeigen (wer, was, wann, Details) | Nachvollziehbarkeit | ✓ | `src/app/(app)/einstellungen/protokoll/page.tsx`: unveränderbares `audit_log` plus fachlicher Verlauf `aktivitaeten` |
| Suche (Mitarbeiter, Objekt, Adresse) | Filtern per Text | ✗ | Keine Suche; nur Seitenblättern |
| Filter „Typ“ (Maklervertrag, Objektnachweis, Mietvertrag, Bewertung, Termin, Mitarbeiter, Liquiditätskonto, Liquiditäts-Import, Dokument, Marketingmaterial) | Eingrenzung nach Gegenstand | ✗ | Keine Filter; Typen anders geschnitten (`aktivitaetstyp`-Enum objektbezogen in `20260817152947_dokumente_verlauf_aufgaben_termine.sql`; Audit-Aktionen rolle/rechte/einladung/export/kündigung/support) |
| Filter „Aktion“ (Anlegen, Bearbeiten, Löschen, Download, Erstellt (Word), Import) | Eingrenzung nach Aktion | ✗ | Keine Filter; Downloads und Dokumenterzeugung nicht protokolliert (nur Datenexport: Aktion `datenexport`) |
| Zeitraum (Letztes Jahr / Alles) | Eingrenzung | ✗ | nur Seiten à 100 |
| Anzeige der ersten 500 mit Hinweis „Filter verfeinern“ | Begrenzung | ◐ | 100 je Seite mit „neuer/älter“ |
| Automatisches Löschen älter als 12 Monate (RPC `aktivitaets_log_cleanup`) | Aufbewahrungsfrist | ✗ | Audit-Log bewusst ohne Änderung/Löschung (`intern.audit_unveraenderbar`); keine Aufbewahrungsfrist |
| Zugriff nur Chef | Schutz | ✓ | RLS `audit_log_lesen` (`ist_verwaltung`), Seite prüft Rolle |

### Zusammenfassung Admin-Bereich
Zählung: ✓ 26 · ◐ 17 · ✗ 12 (55 Zeilen).
Wichtigste Lücken: (1) **Bausteine** für die Marktpreiseinschätzung fehlen vollständig (Referenz: 16 Einfügepunkte, drei Layouts, Standard-Bausteine); (2) **Kennzahlen und Finanzierungsannahmen** werden gepflegt, aber in keiner Wertermittlung und keinem Exposé verwendet — die Referenz nutzt sie für „Daten & Fakten“ und die Finanzierungsseite; Grunderwerbsteuer nicht aus der PLZ abgeleitet; (3) **Aktivitäts-Log** ohne Suche, Typ-, Aktions- und Zeitraumfilter, ohne Aufbewahrungsfrist; (4) **mehrere Firmen/Standorte** nur als Rechnungsabsender, Tabelle `standorte` ohne Oberfläche; (5) **onOffice** ohne Spiegel-Zwischenschicht, ohne Sperre lokal bearbeiteter Objekte, ohne Bild-Rundenlauf/Diagnose; (6) Mitarbeiter: kein Direktanlegen mit Initialpasswort, kein Admin-Passwort-Reset, kein Löschen (bewusst). Mehrwert gegenüber der Referenz: Antrags-/Genehmigungsfluss für Urlaub, verschlüsselte Zugangsdaten, Audit-Trigger für Rechteänderungen, Einladungen mit Ablauf.

---

## Kachel Mein Profil

### Persönliche Angaben und Bilder
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Titel, Funktion/Position, Telefon | Profilfelder | ✓ | `src/components/verwaltung/ProfilFormular.tsx`, `profilSpeichern` in `src/server/verwaltung-aktionen.ts`; Spalten `titel`, `funktion`, `telefon` (`20260904170000_verwaltung.sql`) |
| Profil-Foto hochladen (max. 5 MB), Vorschau, „Entfernen“ | Foto am Profil | ✓ | `ProfilFormular.tsx` (JPG/PNG/WebP ≤ 5 MB, `foto_entfernen`), `bildAblegen` in `verwaltung-aktionen.ts` (Bucket `MARKE_BUCKET`) |
| Foto erscheint auf der Einwertungs-Präsentation (feste Folie) | Verwendung des Fotos in der Bewertung | ✗ | `foto_pfad` nur in Profil und Übergabeprotokoll (`src/lib/verkauf/uebergabe.ts`); nicht in `src/lib/wertermittlung*` |
| Kalender & Fahrzeiten: Startadresse, Standarddauer Besichtigung (Min.), Puffer je Fahrt (Min.), „Fahrzeiten automatisch berechnen“ | Persönliche Kalendervorgaben | ✓ | Anderer Ort: `/kalender/einstellungen` (`src/components/kalender/KalenderEinstellungen.tsx`: `start_adresse`, `besichtigung_dauer_min`, `fahrzeit_puffer_min`, `fahrzeit_aktiv`, zusätzlich Kalenderfarbe), `src/server/kalender-aktionen.ts` |
| Eigene PPTX-Vorlage für Einwertungsberichte hochladen (nur .pptx, max. 25 MB, Platzhalter wie `{{deine_adresse}}`, Standardvorlage als Rückfall) | Persönliche Präsentationsvorlage | ✗ | Kein PPTX-Pfad im Code (`grep -i pptx src` leer); Wertermittlung als PDF |
| Passwort ändern (neu + Wiederholung, ≥ 6 Zeichen, Enter), Hinweis „Sie nutzen noch das initiale Passwort“ | Selbstbedienung im Profil | ◐ | Nur über „Passwort vergessen“-Link (`passwortVergessen`, `passwortNeuSetzen` in `src/server/auth-aktionen.ts`, ≥ 12 Zeichen); Profilseite verweist darauf (`src/app/(app)/einstellungen/profil/page.tsx`). Kein Initialpasswort-Konzept (Einladungen) |
| Tutorial erneut starten, Datum des Durchlaufs | Rundgang wiederholen | ◐ | Knopf „Rundgang durch die Startseite erneut starten“ auf der Übersicht (`src/app/(app)/dashboard/page.tsx`, `tutorialGesehen` in `src/server/arbeitsmittel-aktionen.ts`); nicht im Profil, ohne Datumsanzeige |
| „Profil speichern“ mit Erfolgs-/Fehlermeldung | Persistenz | ✓ | `ProfilFormular.tsx` (`useActionState`) |
| Anzeige „Chef“-Kennzeichen | Rollenanzeige | ✓ | Rolle in Benutzerliste; Profil zeigt E-Mail (Anmeldung) schreibgeschützt |

### Postfächer (Karte und Formular)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste eigener Postfächer, „Noch kein Postfach eingerichtet“ | Übersicht | ✓ | `src/app/(app)/einstellungen/postfaecher/page.tsx`, `src/components/postfach/PostfachKarte.tsx` |
| „★ Als Standard“ setzen (Standard-Absender für Versand) | Standardpostfach | ✗ | Kein Standard-Kennzeichen (`grep -i standard NeueNachricht.tsx` leer); Absender wird je Nachricht gewählt |
| Status und „letzter IMAP-Pull“, „Noch nicht getestet“ | Zustandsanzeige | ✓ | Felder `status`, `letzter_abruf_am`, `fehler_text`, `fehler_zaehler` (`20260903160000_postfaecher.sql`), Anzeige in `PostfachKarte.tsx`; „Jetzt abrufen“ |
| Bearbeiten / Löschen (mit Rückfrage) / „Weiteres Postfach einrichten“ | Verwaltung | ✓ | `postfachAendern`, `postfachTrennen` („Trennen“, „Endgültig entfernen“) in `src/server/postfach-aktionen.ts`; Verbinden-Karte |
| Formular: Absender-Name, E-Mail, SMTP-Server, Port, Security, Benutzer, Passwort („leer = unverändert“) | Versandzugang | ✓ | `src/components/postfach/PostfachVerbinden.tsx` (IMAP/SMTP-Host, Ports, TLS-Häkchen, Benutzer, Passwort); Passwort nach dem Speichern nicht mehr abrufbar (verschlüsselt) |
| IMAP (Empfang): Server, Benutzer, Passwort, „IMAP-Pull aktiv (alle 15 Min)“ | Empfangszugang | ✓ | wie oben; Abrufabstand 1–1440 Min je Postfach (`intervall_minuten`) statt festem 15-Minuten-Schalter |
| „Speichern + SMTP-Test“ (Ergebnis: getestet / fehlgeschlagen) | Verbindungsprüfung | ✓ | Prüfung vor dem Speichern (`anbieter.pruefen()` in `imapVerbinden`); Fehler verhindert Anlage |
| Signatur (Freitext je Postfach) | Signatur an gesendete Mails | ◐ | Schalter „Signatur aus Profil und Erscheinungsbild anhängen“ je Postfach (`signatur_anhaengen`, `signaturText` in `postfach-aktionen.ts`); Firmen-Signatur-HTML im Onboarding (`mandant_branding.signatur_html`, `src/server/onboarding-aktionen.ts`). Kein Freitext je Postfach |
| Pflichtfeldprüfung, Passwortpflicht bei neuem Postfach | Validierung | ✓ | `imapZugangSchema` (`src/lib/postfach/typen.ts`) |
| Anbindung Microsoft 365 / Google | Anmeldung per OAuth | ✓ | `oauthStarten`, `src/lib/postfach/oauth.ts` — in der Referenz nur IMAP/SMTP |
| Unternehmenspostfach mit Freigaben an Kollegen | Gemeinsame Nutzung | ✓ | `postfach_freigaben`, `PostfachKarte.tsx` („Freigeben“) — Mehrwert |

### Zugangsdaten externer Dienste
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Zugangsdaten externer Dienste anzeigen/speichern (Referenz: Edge `credentials-anzeigen` / `credentials-speichern`, genutzt von der Bewertungsseite) | Persönlicher Tresor für Drittanbieter-Logins | ◐ | Zugangsdaten nur je Integration (onOffice, Propstack, FlowFact) und je Postfach, verschlüsselt und nie wieder anzeigbar (`src/integrationen/kern/zugangsdaten.ts`, `src/server/integrations-aktionen.ts`); kein Anzeigen, kein freier Tresor im Profil |

### Zusammenfassung Mein Profil
Zählung: ✓ 14 · ◐ 4 · ✗ 3 (21 Zeilen).
Wichtigste Lücken: (1) **PPTX-Vorlage** für Einwertungsberichte und Fotoverwendung in der Bewertung fehlen (Wertermittlung ist PDF-basiert); (2) **Passwort ändern** nicht im Profil, nur über den Vergessen-Link; (3) **Standard-Postfach** und **Freitext-Signatur je Postfach** fehlen (Signatur wird generiert); (4) Kalender-/Fahrzeitenvorgaben liegen unter `/kalender/einstellungen` statt im Profil (funktional vollständig). Mehrwert: Signaturbild, Bundesland für Feiertage, OAuth-Postfächer, Freigaben.

---

## Kachel Team

### Teamübersicht
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste aller Kollegen mit „Seit:“ (Eintritt), Anzahl („1 Person“/„n Personen“) | Team-Kachel für alle Mitarbeiter | ◐ | Benutzerliste nur für Verwaltung unter Einstellungen (`src/components/einstellungen/Benutzerliste.tsx`, ohne Eintritt); Team-Übersicht mit Eintritt nur in `/urlaub` für Verwaltung. Keine Team-Kachel für Makler/Assistenz |
| Live-Aktualisierung (Realtime auf `profiles`) | Liste aktualisiert sich selbst | ✗ | Server-Rendering |
| Urlaubsübersicht je Kollege (Anspruch inkl. Staffel/anteilig/Übertrag, genehmigt, beantragt, Rest farbig, nächster Urlaub, letzter Hinweis); Erklärtext zur Rechnung | Abwesenheitsplanung im Team | ◐ | Vollständig in `UrlaubAnsicht.tsx` („Team-Übersicht“), aber `src/app/(app)/urlaub/page.tsx` filtert für Nicht-Verwaltung auf die eigene Person; RLS `urlaub_lesen` würde genehmigte Anträge aller zeigen |
| Genehmigte Abwesenheiten im Kalender sichtbar | Teamkalender | ✓ | Urlaub als ganztägiger Termin (`urlaubEntscheidenIntern`), Teamkalender `src/app/(app)/kalender` |
| Mitgelieferte Kalenderhilfen (Termin-Mailtexte mit Anrede, ICS-Erzeugung in deutscher Zeitzone) | Terminbestätigung, Kalenderdatei | ✓ | `src/lib/kalender/bestaetigung.ts`, `src/lib/kalender/ics.ts`, `terminIcsLaden` in `src/lib/dokument/erzeugen.ts` (gehört fachlich zur Kachel Kalender) |
| Mitgelieferte KI-Textfelder (Objekttitel, Beschreibung, Lage, Ausstattung, „Kürzer generieren“) | Teil der Exposé-Schmiede, im Team-Bundle nur technisch enthalten | — | Nicht Gegenstand dieses Inventars (Kachel Exposé-Schmiede) |

### Zusammenfassung Team
Zählung: ✓ 2 · ◐ 2 · ✗ 1 (5 bewertete Zeilen).
Wichtigste Lücke: Es gibt keine für alle Mitarbeiter sichtbare Team-Seite mit Kollegenliste und Urlaubsübersicht; die Daten (Eintritt, Bilanz, Termine) und die Datenbankrechte sind vorhanden, nur die Oberfläche beschränkt auf die Verwaltung.

---

## Kachel Arbeitszeit

### Stempeluhr (Startseite)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Kommen / Gehen stempeln, „Std. heute“, „Soll heute“, „Noch nicht eingestempelt“ | Zeiterfassung per Klick | ✓ | `src/components/verwaltung/Stempeluhr.tsx` auf der Übersicht (`src/app/(app)/dashboard/page.tsx`), RPC `stempeln` (`20260904170000_verwaltung.sql`, deutsche Zeitzone, doppelte Richtung abgewiesen) |
| Abschnitte des Tages, Saldo, Link „Konto“ | Tagesdetail | ✓ | Laufende Stunden inkl. offenem Stempel, Link „Monat ansehen“; Paare je Tag in `ArbeitszeitAnsicht.tsx` |
| Hinweis „Kein Wochenmodell hinterlegt — der Chef trägt es ein“ | Fehlendes Soll | ✓ | „Kein Wochenmodell — ohne Modell gibt es kein Soll“ (`ArbeitszeitAnsicht.tsx`) |
| Hinweis fehlender Feierabend-Stempel (Liste, „… und n weitere“, Verweis auf „Prüfung“) | Erinnerung an offene Tage | ✓ | Vergessene Feierabende der letzten 7 Tage mit Vorschlag, „Nachtragen“/„verwerfen“ (`Stempeluhr.tsx`, `feierabendNachtragen`) |

### Arbeitszeitkonto (Monat)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Ansichten Monat / Jahr / Prüfung, Monatswahl, Mitarbeiterauswahl (Chef) | Navigation | ◐ | Monat blättern und Mitarbeiterauswahl für Verwaltung (`src/app/(app)/arbeitszeit/page.tsx`, `ArbeitszeitAnsicht.tsx`); keine Jahresansicht, keine Prüfung |
| Kennzahlen: Saldo gesamt, Ist, Soll, Saldo, Tage offen/vollständig, Urlaub, Krank | Auswertung | ◐ | Monat: Soll, Ist, Saldo, Urlaub/Krank, Offene Tage (`monatsbilanz` in `src/lib/verwaltung/arbeitszeit.ts`); kein kumulierter Gesamtsaldo über Monate |
| Tagestabelle Datum, Art, Zeit, Abweichung, Bemerkung; Zeile anklicken zum Eintragen; Summe | Tagesübersicht | ✓ | Tabelle Tag/Soll/Ist/Art/Stempel/Bemerkung, „Nachtragen“ je Zeile |
| Feiertage (festes Bundesland) und genehmigter Urlaub automatisch eingetragen und als erfüllt gewertet | Automatik | ✓ | `feiertage()` je wählbarem Bundesland (`src/lib/verwaltung/feiertage.ts`), Urlaub/Krank/Feiertag/Fortbildung = Soll erfüllt (`monatsbilanz`) — Bundesland je Benutzer statt fest verdrahtet |
| „Überstundenabbau“ bucht null Stunden und zieht Soll ab | Ausgleichstag | ✓ | Art „Frei / Ausgleich“ (`TAG_ARTEN`), Ist 0 bei Soll > 0 |
| Tage ohne Eintrag zählen nicht, damit die Zukunft den Saldo nicht ins Minus zieht | Saldo-Regel | ◐ | Nur Tage bis heute zählen (`d <= grenze`); vergangene Tage ohne Eintrag zählen mit Soll (Abweichung zur Referenz) |
| Nachtragen: Art, Von, Bis, Stunden, Bemerkung; Speichern, Abbrechen, Eintrag löschen | Manuelle Erfassung | ✓ | `NachtragFormular` in `ArbeitszeitAnsicht.tsx`, `tagNachtragen` (Arten arbeit/urlaub/krank/feiertag/frei/fortbildung; Stunden aus Von/Bis) |
| Stempel des Tages anzeigen, einzelnen Stempel löschen (Tagesstunden neu berechnen); manuelle Stunden überschreiben bis zum nächsten Stempel | Stempelpflege | ◐ | Stempel-Paare angezeigt; nur „Stempel verwerfen“ für den ganzen Tag (`stempel_verwerfen`, `feierabendNachtragen verwerfen=1`); kein Einzelstempel-Löschen; manueller Wert gilt als Maximum (`Math.max`) |
| Feierabend nachtragen (Uhrzeit-Format prüfen, „Feierabend muss nach dem Kommen liegen“), Stempel verwerfen | Nachtrag fehlender Gehen-Stempel | ◐ | `feierabendNachtragen` (Format geprüft); keine Prüfung „nach dem Kommen“ |
| Stempeln für andere (Chef) | Fremderfassung | ✓ | `benutzer_id` nur für Verwaltung (`tagNachtragen`, RLS `az_stempel_anlegen`, Quelle „verwaltung“) |

### Wochenmodell
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Modelle je Mitarbeiter: Stunden Mo–So, Gültig ab, Notiz, Wochensumme; mehrere Modelle, „+ Neues Modell“ | Sollstunden | ✓ | `ModellFormular` in `ArbeitszeitAnsicht.tsx`, `wochenmodellSpeichern`, Tabelle `arbeitszeit_modelle` (unique benutzer/gültig_ab); Notiz serverseitig unterstützt, im Formular nicht angeboten |
| Modell löschen („Sollstunden ab dann aus dem vorherigen Modell“) | Pflege | ✓ | `wochenmodellLoeschen`, `modellAm()` wählt jüngstes passendes Modell |
| Nur Chef darf Modelle pflegen | Schutz | ✓ | `verwaltungErzwingen`, RLS `az_modelle_schreiben` |

### Prüfung (Plausibilität)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Ansicht „Prüfung“: erfasste Zeiten gegen Kalendertermine und selbst versendete E-Mails abgleichen; Filter „nur Widersprüche“; Befunde Widerspruch/Auffällig/Hinweis | Plausibilitätsprüfung | ✗ | Kein Gegenstück in `src/lib/verwaltung/arbeitszeit.ts` |
| Befundarten: „Kein Feierabend-Stempel“, „Aktivität außerhalb der erfassten Zeit“ (Termin/Mail mit Zeit), „Aktiv, aber nichts erfasst“, „Keine Spur im System“, „Sehr langer Tag“ | Einzelbefunde | ✗ | Nur „offen“-Markierung fehlender Feierabende |
| Erklärtext „Gesprächsanlass, kein Vorwurf“ | Einordnung | ✗ | — |

### Zusammenfassung Arbeitszeit
Zählung: ✓ 12 · ◐ 5 · ✗ 3 (20 Zeilen).
Wichtigste Lücken: (1) **Prüfung** (Abgleich mit Terminen und gesendeten Mails, fünf Befundarten) fehlt komplett; (2) **Jahresansicht** und **kumulierter Gesamtsaldo** fehlen; (3) einzelne Stempel lassen sich nicht löschen, nur der Tag verwerfen; (4) Saldo-Regel für Tage ohne Eintrag weicht ab (Vergangenheit zählt mit Soll). Mehrwert: Bundesland je Benutzer statt festem Land, Fortbildung als Art, Stempeln über RPC mit Doppelschutz.

---

## Kachel Bewerber (inkl. öffentlicher Einstellungstest)

Rahmen: Laut Masterprompt entfällt das Modul ersatzlos; es ist auf Weisung 1:1 gebaut und als streichbar gekennzeichnet (`src/app/(app)/einstellungen/bewerber/page.tsx`, Migration `20260904170000_verwaltung.sql`).

### Einladungen und Liste
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Einladung anlegen: Vorname*, Nachname*, E-Mail (optional), interne Notiz, Schalter „Quereinsteiger — Fachwissen zählt nur informativ“ | Bewerber erfassen | ◐ | `src/components/verwaltung/BewerberVerwaltung.tsx`, `bewerberEinladen` (Vorname, Nachname, E-Mail Pflicht, Position). Fehlt: interne Notiz, Quereinsteiger-Regel |
| Link anzeigen und kopieren („Kopiert ✓“, Fallback „Link bitte manuell kopieren“) | Weitergabe | ✓ | Link in `bewerberEinladen` (Token-Hash in DB), Kopierknopf |
| Versand per E-Mail (Edge-Function „Einladen“ der Referenz) | Einladung schicken | ✓ | Mail über Jobwarteschlange bei gesetztem `MAIL_API_KEY` (`job_einstellen`) |
| Liste mit Status, Punkten „x/y P“, „ohne KI-Punkte“, Anlagedatum, Notiz, E-Mail-Hinweis | Übersicht | ✓ | Status offen/gestartet/abgeschlossen, Punkte/Prozent, Empfehlung, Note, Ablauf 30 Tage (`gueltig_bis`) |
| Einladung widerrufen (Link funktioniert nicht mehr) | Sperre ohne Löschen | ◐ | Kein Widerruf; nur Löschen oder Ablauf nach 30 Tagen |
| Einladung löschen inkl. Testergebnis (Rückfrage) | Entfernen | ✓ | `bewerberBewerten` mit `loeschen=1` (confirm) |
| Bewerber sehen ihre Punkte nicht | Vertraulichkeit | ✓ | `bewerbungAbgeben` gibt nur Eingangsbestätigung zurück (`src/server/bewerbung-oeffentlich.ts`) |
| Zugriff nur Chef | Schutz | ✓ | Rollenprüfung Seite, RLS `bewerber_lesen`/`bewerber_schreiben` |

### Ergebnisansicht
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Teile: 1 Sorgfalt/Fehlersuche · 2a Fachwissen · 2b Textverständnis · 3 Rechnen · 4 Situationen · 5 Kommunikation; Punkte je Teil | Aufbau | ◐ | Vier Kategorien Rechnen, Immobilienwissen, Kundenkontakt, Textverständnis mit 14 Multiple-Choice-Fragen (`src/lib/verwaltung/bewerber.ts`, eigene Formulierungen). Fehlt: Fehlersuche-Aufgabe, freie Situations- und Kommunikationsaufgaben |
| K.o.-Kriterium „Teil 1 unter 6 Punkten“ | Ausschlussregel | ✗ | Keine K.o.-Logik in `auswerten()` |
| Quereinsteiger: Fachwissen nur informativ, nicht in Gesamt/Empfehlung | Sonderregel | ✗ | — |
| KI-Vorbewertung der Teile 1, 4, 5 mit Begründungen und „Rendite-Einordnung“; Fallback „bitte manuell bewerten“ | KI-Auswertung offener Antworten | ✗ | Rein regelbasiert; keine KI-Aufrufe im Modul |
| KI-Empfehlung | Gesamteinschätzung | ◐ | Regelbasierte Empfehlung „Sehr gut / Gespräch / kein Match“ ab 80 % / 55 % (`EMPFEHLUNG`) |
| Multiple Choice & Rechnen im Detail (gewählt/richtig/Eingabe/Soll) | Einzelantworten | ✓ | Details je Frage mit Tooltip gewählt/richtig (`BewerberVerwaltung.tsx` → `Details`) |
| Motivationsprofil (Teil 6): Realitätsbild, Resilienz & Akquise, Emotionale Intelligenz, Integrität, Teamfähigkeit, Selbstorganisation, Führungspotenzial, Stärken, „Im Gespräch klären“, „Vorgeschlagene Nachfragen“ | Gesprächsleitfaden | ✗ | Nur ein Freitext „Warum passen Sie zu uns?“ (max. 4000 Zeichen) |
| Antworten des Bewerbers (Freitexte) anzeigen | Rohantworten | ◐ | Freitext angezeigt; keine offenen Antworten je Teil |
| „Meine Bewertung“: Endnote/Fazit, interne Notizen, speichern („Gespeichert ✓“) | Chef-Bewertung | ✓ | `chef_note` (1–6), `chef_kommentar`, `bewerberBewerten` |
| „← Zurück zur Liste“, „Noch kein Ergebnis“ | Navigation | ✓ | Auf-/Zuklappen je Bewerber, Hinweis „Der Test wurde noch nicht abgegeben“ |

### Öffentlicher Einstellungstest (ohne Konto)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Linkprüfung: „Link unvollständig“, „Dieser Link funktioniert nicht mehr“, „Verbindungsproblem“ | Zugangsschutz per Token | ✓ | `src/app/bewerbung/[token]/page.tsx`, RPC `bewerbung_oeffnen` (Zustände unbekannt/ok/fertig, Token-Hash, Ablauf); `robots: noindex` |
| Startseite mit Firmenname, Titel „Einstellungstest“, Dauer in Minuten, „Test beginnen“ | Einstieg | ◐ | Kopf mit Unternehmensname, Anrede, Dauerangabe „etwa 20 Minuten“ (`src/components/verwaltung/BewerbungTest.tsx`); kein getrennter Startschritt |
| Teilweise Bearbeitung: „Frage/Aufgabe/Situation i von n“, Zurück/Weiter, Zeit je Teil | Geführter Ablauf | ✗ | Alle Fragen auf einer Seite |
| Warnung „Felder unbeantwortet — trotzdem fortfahren?“, „Trotzdem weiter/abgeben“ | Vollständigkeitshinweis | ◐ | Pflichtfelder (`required`) plus Serverprüfung „n fehlen noch“; kein „Trotzdem“ |
| Abgabe (Edge-Function „Abgeben“ der Referenz), Wiederholung bei Verbindungsproblem („Ihre Antworten sind noch da“) | Übermittlung | ✓ | `bewerbungAbgeben` → RPC `bewerbung_abgeben` (nur einmal, Auswertung serverseitig); Fehlermeldung, Formular bleibt gefüllt |
| Dankesseite („Vielen Dank, …“) | Abschluss | ✓ | Erfolgshinweis „Test eingegangen“; bereits abgegebener Link zeigt „Vielen Dank“ |
| Datenschutzhinweis | Information | ✓ | Hinweistext unter dem Formular (`BewerbungTest.tsx`) — in der Referenz nicht ersichtlich |

### Zusammenfassung Bewerber
Zählung: ✓ 12 · ◐ 7 · ✗ 5 (24 Zeilen).
Wichtigste Lücken: (1) **KI-Vorbewertung** offener Antworten und **Motivationsprofil** (Teil 6) fehlen — der Test ist rein Multiple Choice mit einem Freitext; (2) **Fehlersuche-Teil mit K.o.-Kriterium**, **Situations-/Kommunikationsaufgaben** und **Quereinsteiger-Regel** fehlen; (3) kein **Widerruf** einer Einladung, keine interne Notiz; (4) öffentlicher Test ohne geführte Teil-Navigation. Hinweis: Das gesamte Modul steht im Widerspruch zum Masterprompt und ist als streichbar markiert.

---

## Kachel Finanzen

Rahmen: Liquiditätsplanung und Provisionsrechner sind laut Masterprompt ausdrücklich nicht zu übernehmen (`docs/SCOPE.md`, `docs/FUNKTIONSABGLEICH.md` Kachel 15). Sie werden hier vollständig inventarisiert, Stand „✗ (ausgeschlossen laut Masterprompt)“.

### Finanzen-Übersicht
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Unterkacheln Liquidität (Finanzübersicht & Cashflow), Rechnungen (Erstellen & verwalten), Provisionen (Provisionsrechner) mit Animation, „Zurück zur Finanzen-Übersicht“ | Einstieg Chef-Finanzen | ◐ | Keine Finanzen-Kachel; Rechnungen als eigene Kachel `/rechnungen` (`src/components/Navigation.tsx`) |
| Rechteflag „Finanzen“ (sensibel ★) — zeigt Liquidität und Rechnungen | Zugriffsschutz | ◐ | Modul `rechnungen` mit Aktionen lesen/anlegen/ändern/löschen/freigeben (`src/lib/auth/rechte.ts`); kein gesondertes „Finanzen“-Recht |
| Chef-Passwort / Chef-Prüfung vor sensiblen Ansichten | Zweite Hürde | ✗ | Bewusst durch Rollenrechte ersetzt (`docs/FUNKTIONSABGLEICH.md` Kachel 15) |

### Liquidität
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Reiter Dashboard · Prognose · Buchungen · Konten · CSV-Import · Import-Historie | Aufbau | ✗ (ausgeschlossen laut Masterprompt) | Kein Code (`grep -i liquid src supabase` leer) |
| Filter Firma (alle Firmen gesamt / einzeln), Zeitraum (aktuelles Jahr / alles); interne Umbuchungen in Gesamtansicht ausgeblendet | Sicht steuern | ✗ (ausgeschlossen laut Masterprompt) | — |
| Dashboard: Frei verfügbar (ohne Rücklagekonten), Rücklagen nach Art (Steuer, Notgroschen, Investition, Sonstige), Gesamtsaldo, Einnahmen/Ausgaben/Cashflow im Zeitraum, Liquiditätshinweis (Reichweite in Monaten bei Ø-Cashflow) | Kennzahlen | ✗ (ausgeschlossen laut Masterprompt) | — |
| Diagramme: Einnahmen vs. Ausgaben je Monat, Ausgaben nach Kategorie (Prozent) | Visualisierung | ✗ (ausgeschlossen laut Masterprompt) | — |
| Kontenliste im Dashboard (Bank-Art, Saldo) | Übersicht | ✗ (ausgeschlossen laut Masterprompt) | — |
| CSV-Import: Drag & Drop mehrerer Dateien, automatische Erkennung von zwei Online-Bank-Exportformaten, Zuordnung über IBAN zu Konto und Firma, Duplikate übersprungen, Saldo nachgetragen, Fehler „Format nicht erkannt“/„Unbekanntes Konto — erst anlegen“, Ergebniszähler (neu/Duplikate/gesamt) | Kontoumsätze übernehmen | ✗ (ausgeschlossen laut Masterprompt) | — |
| Import-Historie (Datum, Firma, Datei, Zeitraum) | Nachweis | ✗ (ausgeschlossen laut Masterprompt) | — |
| Konten anlegen/bearbeiten/löschen (Firma*, Bank/Konto-Art* CSV-Import oder manuell, Kontoname*, IBAN/Konto-ID, Notiz, Rücklage-Konto mit Art, manueller Saldo mit Stichtag und Notiz; Löschen entfernt Buchungen) | Kontenstamm | ✗ (ausgeschlossen laut Masterprompt) | — |
| Interne Umbuchungen erkennen (zwischen Konten und zwischen Firmen), „Umbuchungen neu erkennen“ | Bereinigung | ✗ (ausgeschlossen laut Masterprompt) | — |
| Buchungen: Suche (Empfänger, Verwendung, Kategorie), Kategoriefilter, Kategorie ändern („gelernt aus früheren Imports“), Einnahmen/Ausgaben/Intern-Kennzeichen, Buchung löschen (nur lokale Kopie), Limit 500 | Einzelbuchungen | ✗ (ausgeschlossen laut Masterprompt) | — |
| Prognose-Einstellungen: Horizont (Monate), Basis-Zeitraum, kritische Schwelle (€), Startwert frei verfügbar statt Gesamtsaldo, speichern | Parametrisierung | ✗ (ausgeschlossen laut Masterprompt) | — |
| Prognose-Kennzahlen: Ø Einnahmen/Ausgaben/Cashflow je Monat (Ist), mit Szenarien, nach 30 % Steuern, Steuer-Rücklage/Monat, Saldo in n Monaten, Fixkostendeckung (Monate) | Auswertung | ✗ (ausgeschlossen laut Masterprompt) | — |
| Stress-Test: Best Case (+x %), Realistisch, Einnahmen −30 %, Worst (−y %), 0 € Einnahmen; Warnung bei Unterschreiten der Schwelle mit Monat | Szenario-Vergleich | ✗ (ausgeschlossen laut Masterprompt) | — |
| Saldo-Verlauf-Diagramm Vergangenheit + Prognose (Hauptlinie, Best/Worst, Schwelle) | Visualisierung | ✗ (ausgeschlossen laut Masterprompt) | — |
| Tabelle „Monat für Monat“ (Einnahmen, Ausgaben, Szenariobeitrag, Einmalbeitrag, Cashflow, Saldo) | Detail | ✗ (ausgeschlossen laut Masterprompt) | — |
| Szenarien anlegen/bearbeiten/löschen/aktivieren: Typ monatlich (Betrag, ab/bis Monat) · einmalig (Betrag, Datum) · prozentual (Einnahmen ± %, Ausgaben ± %), „nur für Firma“, Notiz | Was-wäre-wenn | ✗ (ausgeschlossen laut Masterprompt) | — |
| Rechteprüfung „Chef“ für Liquidität | Schutz | ✗ (ausgeschlossen laut Masterprompt) | — |

### Provisionen (Provisionsrechner und -Tracker für eine Mitarbeitervergütung)
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Abrechnungsmonat wählen, „Zurücksetzen“ | Eingabe je Monat | ✗ (ausgeschlossen laut Masterprompt) | Kein Code (`grep -i provisionsrechner src` leer) |
| Eingaben: Netto-Provisionsumsatz Verkauf, Abzug an Firma/Kooperationspartner, Bemessungsgrundlage Verkauf; dasselbe für Vermietung | Grundlagen | ✗ (ausgeschlossen laut Masterprompt) | — |
| Staffeltabelle (Stufen „bis 8.000 €“ … „über 25.000 €“) für Vermittlungsprovision Verkauf/Vermietung, effektiver Satz | Berechnung | ✗ (ausgeschlossen laut Masterprompt) | — |
| Zuführungsprovisionen (Verkaufsobjekt, Vermietungsobjekt, Käufer, Mieter) mit Stückzahl | Zusatzvergütung | ✗ (ausgeschlossen laut Masterprompt) | — |
| Summen: Zuführungsprovision gesamt, Variable Vergütung gesamt, Auszahlung (Folgemonat, § 4 des Arbeitsvertrags), Objektvolumen (Kaufpreissumme) | Ergebnis | ✗ (ausgeschlossen laut Masterprompt) | — |
| Tracker: Eintrag speichern (Auszahlung, Provisionsumsatz, Monat), Liste, kumulierte variable Vergütung, Löschen | Verlauf | ✗ (ausgeschlossen laut Masterprompt) | — |
| PDF herunterladen (Abrechnungsblatt) | Ausgabe | ✗ (ausgeschlossen laut Masterprompt) | — |
| Verwandt in ImmoOffice: Provisionsrechnung an Kunden aus dem Maklervertrag | Provision je Objekt (nicht Mitarbeitervergütung) | ✓ | `rechnungAnlegen` mit `vertrag_id` in `src/server/rechnungen-aktionen.ts` (Prozentsatz, Kaufpreis, Brutto→Netto) |

### Zusammenfassung Finanzen
Zählung: ✓ 1 · ◐ 2 · ✗ 25 (28 Zeilen; davon 24 „✗ ausgeschlossen laut Masterprompt“).
Wichtigste Lücken: Liquiditätsplanung (CSV-Import zweier Bankformate, Konten mit Rücklagen, Prognose mit Szenarien und Stress-Test) und Provisionsrechner/-Tracker (Staffel, Zuführungen, PDF) fehlen vollständig — beides bewusst ausgeschlossen. Chef-Passwort bewusst durch Rollenrechte ersetzt. Die Referenz-Unterkachel „Rechnungen“ ist in ImmoOffice als eigenständige Kachel vollständig vorhanden (siehe unten).

---

## Kachel Rechnungen

### Übersicht und Stammdaten
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Liste mit Filter Alle / Nur produktiv / Nur Test, Suchfeld | Übersicht | ◐ | `src/app/(app)/rechnungen/page.tsx`: Filter Alle/Entwürfe/Offen/Überfällig/Bezahlt/Storniert, Test als Marke; keine Freitextsuche (Rechnungen über globale Suche Strg+K: `global_suche` in `20260904170000_verwaltung.sql`), kein Produktiv/Test-Filter |
| Hinweis „Bevor du deine erste Rechnung schreibst, lege deine Stammdaten an“, „Jetzt anlegen“ | Einstiegsführung | ✓ | Firmenabsender entsteht automatisch aus den Firmendaten (`absenderVorbereiten` in `src/server/rechnungen-aktionen.ts`); Link „Absender & Nummernkreis“ |
| „⚙ Meine Rechnungs-Stammdaten“ je Nutzer: Name/Firma*, Straße, Ort, Land, E-Mail, Telefon, Web, Steuernummer, USt-IdNr., Kleinunternehmer § 19 UStG, Bank, Präfix, Startnummer*, „Jahr in der Nummer“, Vorschau „Nächste Nummer“, Startnummer gesperrt nach erster Rechnung, Zahlungsziel (Tage), Standard-MwSt, Einleitungstext, Schlusstext | Absender mit Nummernkreis | ✓ | `src/components/rechnungen/AbsenderVerwaltung.tsx`, `src/app/(app)/rechnungen/absender/page.tsx`, `absenderSpeichern`; Tabelle `rechnungs_absender` (Typ firma/persönlich, IBAN/BIC), RPC `rechnung_startnummer_info`, Trigger-Sperre des Nummernkreises (`20260904130000_rechnungen_briefe.sql`); `nummerVorschau` in `src/lib/rechnungen.ts` |
| „Nur du und die Geschäftsführung sehen die Stammdaten“ | Sichtbarkeit | ◐ | Persönliche Absender pflegt der Inhaber selbst (RLS `rechnungs_absender_schreiben`), lesen darf der ganze Mandant |
| Kundenstamm (Kunde laden per Suche, Kunde übernehmen/speichern/aktualisieren aus dem Formular) | Empfängerverwaltung | ◐ | Eigene Kundenseite `src/app/(app)/rechnungen/kunden/page.tsx` (`KundenVerwaltung.tsx`, `kundeSpeichern`), Kunde im Formular wählbar (`kundeWaehlen`), automatische Anlage aus Kontakt (`kundeAusKontakt`); kein „Kunde speichern“ direkt aus dem Rechnungsformular |
| Kennzahlen offen / überfällig / bezahlt im Jahr | Überblick | ✓ | Drei Karten in `rechnungen/page.tsx` — in der Referenz nicht vorhanden |

### Neue Rechnung
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Dialog „Was für eine Rechnung?“: Verkäufer-Provision (aus Objektnachweis/Maklervertrag), Käufer-Provision (an Käufer, Daten aus Objektnachweis), Freie Rechnung | Typwahl | ◐ | `src/components/rechnungen/RechnungAnlegen.tsx`: Absender, Kunde/Kontakt, Objekt, Maklervertrag, Test-Häkchen; Provisionsposition aus Maklervertrag (`rechnungAnlegen`). Kein expliziter Typ, keine Käufer-Provision aus Objektnachweis (Übersicht lädt nur `art = maklervertrag`; Detailseite auch `objektnachweis`) |
| „Aus welchem Objektnachweis?“ (Adresse, Käufer, Kaufpreis, Provision) | Datenquelle | ◐ | Vertragsauswahl mit Titel; Vorbelegung Prozentsatz, Kaufpreis, Kontakt |
| Test-Modus („TEST-Nummern, jederzeit löschbar“, PDF mit Wasserzeichen) | Probebetrieb | ✓ | `ist_test`, Nummer `TEST-…` (RPC `rechnung_stellen`), löschbar (`rechnung_loeschschutz`), PDF-Kennzeichnung „Rechnung (TEST)“ plus Fußnote (`src/lib/rechnungen.ts`); kein grafisches Wasserzeichen |
| Auto-Befüllung Verkäufer aus Maklervertrag über Adressabgleich (Eheleute, Erbengemeinschaft mit Erben, Vertreter), Meldung „Kein passender Maklervertrag“ | Empfänger automatisch | ◐ | Vorbelegung aus dem gewählten Vertrag (Kontakt → Kunde); kein Adressabgleich, keine Erbengemeinschafts-/Vertreterlogik |
| Automatischer Positionstext „Vermittlungsprovision für die Immobilie … zu einem Kaufpreis von … bei x % Netto-Provision“ | Positionsvorlage | ✓ | Beschreibung „Maklerprovision für die Vermittlung von … — x % des Kaufpreises von …“ (`rechnungAnlegen`) |

### Rechnungsformular
| Funktion (Referenz) | Was sie tut | Stand | Fundstelle oder Lücke |
|---|---|---|---|
| Absender-Firma*, Rechnungs-Typ, Test-Modus | Kopf | ✓ | `src/components/rechnungen/RechnungFormular.tsx` (Absender, Objekt, Vertrag; Typ Rechnung/Storno) |
| Empfänger: Anrede (Herr/Frau), Name*, Zusatz (Firma, c/o), Straße, Ort, Land, E-Mail(s) mehrere mit Komma | Adressblock | ✓ | Felder `empfaenger_*` (eine E-Mail-Adresse; Kunden-USt-IdNr. zusätzlich) |
| Ausstellungsdatum, Leistungsdatum, Zahlungsziel (Tage oder Datum), „fällig am“ | Daten | ✓ | `ausstellungsdatum`, `leistung_von/bis`, `zahlungsziel_tage`, `faellig_am` beim Stellen berechnet |
| Preiseingabe Netto/Brutto umschaltbar; Positionen (Beschreibung*, Menge, Einheit „Stk“, Einzelpreis, MwSt %), „+ Position hinzufügen“, Summen Netto/MwSt/Gesamt | Positionen | ✓ | Spalten Menge, Einheit, Einzelpreis netto, USt (0/7/19), Brutto (rechnet zurück), Netto; `summen`, `nettoAusBrutto` in `src/lib/rechnungen.ts`; Summen je Steuersatz per Trigger `intern.rechnung_summen` |
| Kleinunternehmer: Positionen mit 0 %, Hinweis auf der Rechnung | § 19 UStG | ✓ | `kleinunternehmer` am Absender, Steuersatz gesperrt auf 0, Hinweis im Formular und PDF |
| „Speichern“ (Entwurf) mit Pflichtprüfung (Empfänger-Name, mind. eine Position) | Persistenz | ✓ | `rechnungSpeichern` (zod `positionSchema`), RPC `rechnung_stellen` prüft Empfänger und Positionen |
| „Rechnung stellen“ (Rückfrage, danach unveränderbar), Hinweis „Diese Rechnung ist gestellt … Änderungen nur per Storno“ | Festschreiben mit fortlaufender Nummer | ✓ | `rechnungStellen` → RPC `rechnung_stellen` (Nummer `PRÄFIX-JJJJ-nnn`, Absender-Schnappschuss), Trigger `intern.rechnung_festschreibung`; PDF festgeschrieben im Storage (`pdfFestschreiben`) |
| „Stornieren“ mit Grund → Storno-Rechnung erstellt | GoBD-Storno | ✓ | `rechnungStornieren` → RPC `rechnung_stornieren` (Gegenrechnung mit negativen Positionen, eigene Nummer, Grund Pflicht) |
| „Bezahlt markieren“ (Rückfrage) | Zahlungseingang | ✓ | `rechnungBezahlt` → RPC `rechnung_bezahlt` (Datum, Betrag) |
| „PDF erzeugen“ (Edge), „PDF öffnen“ | Ausgabe | ✓ | `/api/dokumente/rechnung/[id]?format=pdf` (`src/app/api/dokumente/[art]/[id]/route.tsx`), zusätzlich Word-Export für Entwürfe |
| „Per Mail senden“: Anschreiben wählen (Standard, Gute Zusammenarbeit, Nach erfolgreichem Verkauf, Freundliche Erinnerung), Empfänger ergänzen, „Weiter zum Mail-Fenster“ mit PDF-Anhang, Kopie an Buchhaltungsadresse | Versand | ◐ | Vier Vorlagen `RECHNUNG_MAIL_VORLAGEN` (`src/lib/rechnungen.ts`), Link ins Postfach mit Betreff, Text und Anhang (`RechnungFormular.tsx` → `/postfach?neu=1&anhang_art=rechnung`); keine automatische Kopie an eine Buchhaltungsadresse |
| Status-Badges Entwurf · Gestellt · Storno-Rechnung · Storniert · Bezahlt | Anzeige | ✓ | `RECHNUNG_STATUS`, Marken in Übersicht und Formular; Verweise „Storno zu …“ / „Storniert durch …“ |
| Anzeigen / Bearbeiten / Löschen (nur Test-Rechnungen) | Aktionen | ✓ | `rechnungLoeschen` für Entwürfe und Testrechnungen; Datenbank blockt alles andere |
| Interne Notiz | Vermerk | ✓ | `rechnungNotiz` — auch nach dem Stellen erlaubt |
| Nummernkreis: Präfix, Jahr, Startnummer, Sperre nach erster Rechnung | GoBD-Nummerierung | ✓ | siehe Stammdaten; Trigger `intern.rechnung_verweise_pruefen` |
| Rechte: Modul Rechnungen (Makler anlegen/ändern/stellen, Assistenz bearbeiten, Nur-Lesen sehen) | Schutz | ✓ | `rechtErzwingen(…, "rechnungen", …)` in allen Aktionen, RLS `rechnungen_schreiben`; Freigeben (Stellen/Storno) als eigene Aktion |

### Zusammenfassung Rechnungen
Zählung: ✓ 20 · ◐ 7 · ✗ 0 (27 Zeilen).
Wichtigste Lücken: (1) keine **Freitextsuche** und kein **Produktiv/Test-Filter** in der Liste; (2) kein expliziter Rechnungstyp **Käufer-Provision aus Objektnachweis** in der Anlage (nur Maklervertrag; Detailseite kennt Objektnachweis); (3) **Auto-Befüllung** nicht über Adressabgleich, keine Erbengemeinschafts-/Vertreterlogik; (4) kein **Kunde speichern** direkt aus dem Rechnungsformular; (5) keine **Buchhaltungskopie** beim Mailversand; (6) Testrechnung ohne grafisches Wasserzeichen (nur Kennzeichnung). Mehrwert: GoBD-Regeln in der Datenbank, offene/überfällige Kennzahlen, Word-Export, Storno als Gegenrechnung mit Verweisen.

---

## Gesamtbild

| Kachel | ✓ | ◐ | ✗ |
|---|---|---|---|
| Admin-Bereich | 26 | 17 | 12 |
| Mein Profil | 14 | 4 | 3 |
| Team | 2 | 2 | 1 |
| Arbeitszeit | 12 | 5 | 3 |
| Bewerber (inkl. Einstellungstest) | 12 | 7 | 5 |
| Finanzen (Liquidität, Provisionen) | 1 | 2 | 25 (24 davon ausgeschlossen) |
| Rechnungen | 20 | 7 | 0 |
| **Summe** | **87** | **44** | **49** |

Korrekturen gegenüber `docs/FUNKTIONSABGLEICH.md`: Kachel 16 „Bausteine ◐ (Wertermittlung)“ ist nicht belegt — es gibt keine verwaltbaren Zusatzseiten (✗). „Firmen-Stammdaten, Kennzahlen, Finanzierungsannahmen ✓“ trifft nur die Pflege; die Verwendung der Kennzahlen und Finanzierungsannahmen in Wertermittlung/Exposé fehlt (◐). „Aktivitäts-Log ✓“ verschweigt fehlende Suche, Filter und Aufbewahrungsfrist (◐). „Profil: Postfächer ✓“ — Standard-Postfach und Freitext-Signatur fehlen (◐).
