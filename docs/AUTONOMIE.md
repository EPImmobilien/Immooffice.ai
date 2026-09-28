# Autonomie — wie hier gearbeitet wird

**Verbindlich.** Ergänzt `CLAUDE.md`, widerspricht ihm nicht.

## Grundregel

Selbstständig arbeiten, ohne Rückfragen. Gestoppt wird nur an den drei
Freigabepunkten des Auftrags (Ende Phase 1, Ende Phase 3, vor Stripe-Live)
oder wenn eine Entscheidung wirklich blockiert — fehlende Zugangsdaten,
fehlende Freigaben von außen, eine Wahl, die ohne Kenntnis des Geschäfts
nicht zu treffen ist.

Bei Unklarheit gilt: die Entscheidung treffen, die dem heutigen Verhalten der
Vorlage am nächsten kommt, und sie in `docs/ENTSCHEIDUNGEN.md` eintragen.
Lieber eine dokumentierte Entscheidung als eine offene Frage.

## Was in ENTSCHEIDUNGEN.md gehört

Jede Festlegung, die nicht schon irgendwo steht. Ein Eintrag nennt

1. die **Frage**, vor der die Entscheidung stand,
2. die **Entscheidung**,
3. den **Grund** — und zwar den echten, nicht den vorzeigbaren,
4. was dabei **offen bleibt**.

Auch Irrtümer gehören hinein, sobald sie auffallen. Ein Eintrag, der einen
Fehlschluss festhält, ist mehr wert als drei, die Erfolge aufzählen: der
nächste Durchgang stolpert sonst über dieselbe Stelle.

## Aufträge sind nicht unfehlbar

Ein Auftrag kann von einem überholten Stand ausgehen oder eine Anweisung
enthalten, die wörtlich befolgt Schaden anrichtet. Beispiel vom 28.09.2026:
„Die Tabellen ohne Richtlinie bekommen Richtlinien" hätte sieben Tabellen
geöffnet, die niemand aufruft und die bewusst gesperrt sind.

In so einem Fall gilt: **die Absicht erfüllen, nicht den Wortlaut**, die
Abweichung in `docs/ENTSCHEIDUNGEN.md` begründen und im Bericht benennen.
Nicht stillschweigend abweichen, aber auch nicht sehenden Auges etwas
Falsches bauen.

Zahlen aus einem Auftrag werden nachgemessen, bevor darauf aufgebaut wird.

## Commits

- Deutsch, Präfix `phase-N:`.
- Nur bei grünem `npm run check` — Build, Syntax, Rauchtest,
  Neutralitäts-Gate, Mandantentest.
- **Den Exit-Status des Checks tatsächlich auswerten.** `npm run check | tail -2`
  liefert den Status von `tail`, nicht den des Checks. Am 28.09.2026 ist auf
  diese Weise ein Commit auf rotem Check durchgegangen. Entweder in eine Datei
  schreiben und `$?` prüfen oder `set -o pipefail` setzen.
- Die Commit-Nachricht erklärt **warum**, nicht was der Diff ohnehin zeigt.

## Migrationen

- `supabase/migrations/` enthält zweierlei: die aus der Vorlage erzeugten
  Dateien (`scripts/neutralisieren.py`, nicht von Hand ändern) und
  fork-eigene mit dem Vorsatz `fork_` und laufender Nummer.
- Der Generator schreibt nur seine eigenen Dateinamen und löscht nichts;
  beide können nebeneinander liegen.
- Jede fork-eigene Migration trägt im Kopf, warum es sie gibt.

## Prüfen statt annehmen

- Eine leere Tabelle ist kein Beweis. Bevor ihr Schweigen etwas heißt, muss
  feststehen, dass sie im Erfolgsfall etwas enthielte.
- Ein Gate, das nie etwas findet, beweist nichts. Am 28.09.2026 meldete das
  Neutralitäts-Gate „sauber", während 146 Zeilen Kennzeichen der Referenz im
  Quelltext standen.
- Was diese Arbeitsumgebung nicht prüfen kann — Netzzugang zu CDNs, Supabase
  und Netlify —, prüft ein GitHub-Actions-Lauf. Nicht geprüfte Annahmen
  gehören nach `docs/OFFEN.md`, nicht in einen Bericht als Erfolg.
