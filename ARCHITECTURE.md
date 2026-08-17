# Architektur ImmoOffice.ai

**Stand:** 16.08.2026 · Master-Prompt Abschnitt 4 · Phase 0
Ergänzend: [`DATA_MODEL.md`](DATA_MODEL.md) · [`SECURITY_AND_DSGVO.md`](SECURITY_AND_DSGVO.md) ·
[`OPENIMMO_MAPPING.md`](OPENIMMO_MAPPING.md)

---

## 1. Überblick

```
                       ┌──────────────────────────────┐
   Browser  ──────────►│  Netlify Edge / CDN          │
   (Makler)            │  + Next.js Middleware        │
                       │    · CSP-Nonce je Anfrage    │
                       │    · Sitzungsauffrischung    │
                       └──────────────┬───────────────┘
                                      │
                       ┌──────────────▼───────────────┐
                       │  Next.js 16 (App Router)     │
                       │  · Server Components         │
                       │  · Server Actions / Routen   │
                       │  · Rechteprüfung serverseitig│
                       └──────┬─────────────────┬─────┘
                              │                 │
            ┌─────────────────▼──────┐   ┌──────▼─────────────────┐
            │ Supabase (eu-central-1)│   │ Externe Dienste        │
            │ · PostgreSQL + RLS     │   │ · OpenAI (Provider-    │
            │ · Auth                 │   │   Layer, austauschbar) │
            │ · Storage              │   │ · Stripe               │
            │ · pgmq (Warteschlange) │   │ · E-Mail (EU)          │
            │ · pg_cron (Auslöser)   │   │ · Portale (OpenImmo)   │
            └────────────┬───────────┘   └────────────────────────┘
                         │  pg_cron ruft periodisch den Worker
            ┌────────────▼───────────┐
            │ Netlify Background Fn  │
            │ „Job-Worker“           │
            └────────────────────────┘
```

## 2. Technologieentscheidungen

| Entscheidung | Begründung |
|---|---|
| **Next.js 16, App Router, TypeScript strict** | Server Components halten Fachlogik und Schlüssel serverseitig. Die Referenz scheiterte genau daran: Rechteprüfung im Browser. `strict` plus `noUncheckedIndexedAccess` fängt die Fehlerklasse ab, die in 62.000 Zeilen untypisiertem JavaScript unauffindbar war. |
| **Supabase, Projekt `usguiggfciavwzkdfjgt`, eu-central-1** | Fixiert durch Abschnitt 0. Frankfurt erfüllt die EU-Vorgabe aus Abschnitt 16. RLS erzwingt Mandantentrennung in der Datenbank statt in der Anwendung. |
| **Tailwind CSS 4 mit semantischen Tokens** | Tokens statt roher Farbwerte — Voraussetzung für Dunkelmodus und späteres Mandanten-Branding. Siehe `/styleguide`. |
| **Zod** | Eine Validierungsdefinition für Formular, Server Action und API-Grenze. |
| **Vitest + Playwright** | Vitest für Fachlogik, Playwright für Kernflüsse. Ergänzt um `pgtap` für RLS-Tests direkt in der Datenbank. |
| **Netlify** | Vorgabe aus Abschnitt 4. Background Functions dienen als Ausführungsschicht der Warteschlange. |

Alle Abhängigkeiten sind exakt gepinnt (keine `^`-Bereiche), damit Bauergebnisse
reproduzierbar bleiben.

## 3. Job-Verarbeitung — Entscheidung aus Phase 0

Abschnitt 4 verlangt eine Festlegung zwischen Netlify Background Functions und einer
Supabase-gestützten Warteschlange.

**Entscheidung: Warteschlange in Supabase (`pgmq`), Ausführung über Netlify Background
Functions.** Beides zusammen, nicht als Alternative.

Der Zustand liegt in Postgres, die Rechenzeit auf Netlify. Ausschlaggebend:

1. **Abschnitt 15 verlangt, dass der Plattform-Admin fehlgeschlagene Jobs sieht.** Das
   setzt eine abfragbare Job-Tabelle voraus. Reine Background Functions haben keinen
   solchen Zustand — der Auftrag wäre nach einem Fehlschlag verloren.
2. **Abschnitt 14 verlangt automatische Freigabe reservierter Credits bei technisch
   fehlgeschlagenen KI-Aufträgen.** Credit-Reservierung und Jobzustand müssen in
   *derselben* Transaktion stehen, sonst entstehen verlorene Credits oder doppelte
   Erstattungen. Das geht nur, wenn die Warteschlange in der Datenbank liegt.
3. **Wiederholbarkeit und Kostenprotokoll** (Abschnitt 10) brauchen Historie je Versuch.

Alle benötigten Bausteine sind im Projekt bereits verfügbar: `pgmq` 1.5.1,
`pg_cron` 1.6.4, `pg_net` 0.20.4.

**Ablauf**

1. Server Action reserviert Credits und stellt den Job ein — **eine** Transaktion.
2. `pg_cron` weckt minütlich den Worker (Netlify Background Function).
3. Der Worker liest mit Sichtbarkeitsfrist (`pgmq.read`), arbeitet, quittiert.
4. Erfolg: Credits endgültig verbucht, Ergebnis gespeichert.
   Fehlschlag: Versuch protokolliert, erneuter Versuch mit wachsendem Abstand.
   Nach der letzten vergeblichen Wiederholung landet der Job in der
   Fehlerwarteschlange und die reservierten Credits werden freigegeben.

Produktiv ab Phase 2 (Abschnitt 4), Tabellen und Schnittstellen entstehen in Phase 1.

## 4. Schichten und Verzeichnisse

```
src/
  app/                     Routen (App Router)
    (oeffentlich)/         Anmeldung, Registrierung, Web-Exposé
    (app)/                 Angemeldeter Bereich, mandantengebunden
    (plattform)/           Betreiberbereich, getrennt geschützt
    api/                   Webhooks (Stripe), Worker-Endpunkte
  components/              Anzeige, ohne Datenzugriff
  lib/
    supabase/              Client für Browser, Server und Dienstrolle
    auth/                  Sitzung, Rollen, Rechteprüfung
    credits/               Reservierung, Verbrauch, Erstattung
    openimmo/              Abbildung und XML-Erzeugung
    ki/                    Provider-Layer (Text und Bild)
    jobs/                  Einstellen und Abarbeiten
  server/                  Server Actions, fachliche Regeln
supabase/migrations/       Migrationskette
```

**Regel:** Anzeigekomponenten greifen nie direkt auf die Datenbank zu. Jeder Zugriff
läuft über `server/` und prüft dort Mandant und Rolle — auch dann, wenn RLS bereits
schützt. Zwei Ebenen, weil eine fehlerhafte Policy sonst unbemerkt bliebe.

## 5. Mandantentrennung

Drei Ebenen, absichtlich redundant:

1. **Datenbank (RLS):** Jede fachliche Tabelle trägt `mandant_id`. Policies vergleichen
   sie mit dem Mandanten der Sitzung. Auch bei einem Fehler in der Anwendung liefert
   die Datenbank keine fremden Zeilen.
2. **Server:** Jede Server Action lädt den Sitzungskontext und prüft Rolle und Aktion
   gegen die Berechtigungsmatrix.
3. **Storage:** Pfade beginnen mit `mandant_id`; Policies prüfen das erste
   Pfadsegment. Es gibt keine öffentlichen Buckets außer den ausdrücklich
   veröffentlichten Web-Exposé-Bildern.

Die Dienstrolle (`SUPABASE_SERVICE_ROLE_KEY`) umgeht RLS und ist deshalb auf zwei
Stellen begrenzt: Stripe-Webhooks und Job-Worker. Sie wird nie in einer
Client-Komponente importiert.

Die Benutzereinladung war ursprünglich als dritte Stelle vorgesehen, braucht die
Dienstrolle aber nicht: `einladung_erstellen`, `einladung_erneuern` und
`einladung_einloesen` laufen als `security definer` und lesen Mandant, Rolle und
Aufrufer aus der Sitzung, statt sie sich übergeben zu lassen. Das ist die engere
Lösung — ein Schlüssel, der RLS vollständig umgeht, ist im Ablauf gar nicht
beteiligt.

## 6. Sicherheit im Auslieferungsweg

Die Content-Security-Policy entsteht je Anfrage in `src/middleware.ts` mit einer frischen
Nonce.

**Erfahrung aus Phase 0, festgehalten als Warnung:** Eine Policy mit `script-src 'self'`
blockiert die Inline-Startskripte von Next.js. Die Seite rendert dann vollständig,
hydratisiert aber nie — keine Schaltfläche reagiert, und im Protokoll steht nur ein
verkürzter React-Fehler. Der naheliegende Ausweg `'unsafe-inline'` hätte den Schutz
gegen Cross-Site-Scripting weitgehend aufgehoben. Gewählt wurde stattdessen eine Nonce
je Anfrage mit `strict-dynamic`.

**Preis dieser Entscheidung:** Seiten werden dynamisch ausgeliefert, weil eine statisch
erzeugte Seite keine anfragebezogene Nonce tragen kann. Für den angemeldeten Bereich ist
das ohne Belang — er ist ohnehin benutzerabhängig. Öffentliche Web-Exposés sollen dagegen
zwischenspeicherbar bleiben; sie erhalten in Phase 1 eine eigene, statisch auslieferbare
Policy ohne Nonce, da sie keine benutzerbezogenen Inline-Skripte benötigen.

## 7. KI-Anbindung

Ein Provider-Layer (`lib/ki/`) kapselt Text- und Bildmodelle hinter einer eigenen
Schnittstelle. Aufrufer kennen keinen Anbieter. Damit ist der Wechsel zu einem
EU-gehosteten Anbieter (etwa Azure OpenAI in einer EU-Region) eine
Konfigurationsänderung, keine Architekturänderung (Abschnitt 16).

Verbindliche Regeln der Schicht:

- Nur die fachlich nötigen Felder werden übergeben; Namen und Kontaktdaten von
  Interessenten und Eigentümern nie.
- Jeder Aufruf protokolliert Modell, Token, Kosten und Dauer — Grundlage für die
  Deckungsbeitragsrechnung im Plattform-Admin (Abschnitt 15).
- Jede Ausgabe wird als KI-Inhalt gekennzeichnet und ist freigabepflichtig.
- Fehlende Objektdaten werden nicht ergänzt, sondern als Lücke zurückgemeldet
  (Abschnitt 8). Die Schicht liefert dazu eine Liste unbelegter Angaben mit, die die
  Oberfläche sichtbar macht.

## 8. Abgrenzung zur Referenz

| Referenz | ImmoOffice.ai |
|---|---|
| Eine HTML-Datei, kein Build | Modulare Struktur, reproduzierbarer Build |
| Bibliotheken per CDN | Gepinnte Abhängigkeiten, selbst ausgeliefert |
| Rechteprüfung im Browser | RLS plus serverseitige Prüfung |
| Kein Mandantenkonzept | `mandant_id` auf jeder fachlichen Tabelle |
| Alles synchron im Request | Warteschlange mit Wiederholung und Protokoll |
| Vorlagen als Base64 im Quelltext | Versionierte Storage-Objekte |
| Kein Typsystem, keine Tests | TypeScript strict, Vitest, Playwright, pgtap |

## 9. Offene Punkte

| Punkt | Entscheidung fällt |
|---|---|
| PDF-Erzeugung: serverseitiges Rendering oder Bibliothek | Phase 1, mit den fünf Exposé-Vorlagen |
| Volltextsuche: `pg_trgm` oder `pgroonga` | Phase 1, sobald Datenmengen abschätzbar sind |
| Virenprüfung für Uploads | Phase 2, siehe `SECURITY_AND_DSGVO.md` |
| Übertragungsweg je Portal (FTP, API) | Phase 2, je Portalvertrag |
