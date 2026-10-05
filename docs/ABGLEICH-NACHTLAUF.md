# Nächtlicher Abgleich mit der Vorlage

Entscheidung des Auftraggebers vom 05.10.2026 (`docs/ENTSCHEIDUNGEN.md`):
Änderungen der Vorlage werden **nachts, einmal täglich** übernommen und bei
grüner Prüfung **ohne weitere Freigabe** committet, gepusht und damit
ausgeliefert. Dieses Dokument ist die Anleitung für diesen Lauf. Es gilt
zusammen mit `CLAUDE.md` und `docs/ABGLEICH.md`; bei Widerspruch gewinnt
`CLAUDE.md`.

Der zuletzt übernommene Stand der Vorlage steht in
[`docs/abgleich-stand.txt`](abgleich-stand.txt): Quell-Commit, Branch, Datum.

---

## 1. Ist etwas Neues da?

1. Quell-Repository der Vorlage holen (alle Branches).
2. **Kandidaten** sind alle Branches, deren Spitze den Quell-Commit aus
   `abgleich-stand.txt` als Vorfahren enthält (`git merge-base
   --is-ancestor`). Damit geht der Fork nur vorwärts: ein Branch mit älterem
   Stand kann nichts zurückdrehen.
3. Davon der mit dem jüngsten Commit. Die Bau-Prüfung der Vorlage
   (GitHub-Action „Portal bauen") muss auf genau diesem Commit grün sein;
   sonst den jüngsten Commit desselben Branches nehmen, auf dem sie grün ist.
4. Ist das der Commit aus `abgleich-stand.txt`: **nichts tun, nichts
   committen, keine Meldung.** Fertig.

## 2. Oberfläche

1. Vorlage bauen: `python3 portal/bauen.py` im Quell-Repository.
2. Bauergebnis nach `reference/` kopieren (nicht versioniert):
   `portal/bau/liefer/index.html` → `reference/epworld-src.html`, die
   Nebenseiten (`sw.js`, `freigabe.html`, `objekt.html`,
   `sonnenverlauf.html`, `unterlagen.html`, `_redirects`) →
   `reference/epworld-<name>`.
3. `npm ci` (falls `node_modules` fehlt), dann
   `python3 scripts/oberflaeche-zerlegen.py` und
   `python3 scripts/nebenseiten.py`.
4. Bricht der Zerleger ab oder meldet `scripts/neutral.sh` einen Treffer:
   eine **Regel** in `scripts/oberflaeche-zerlegen.py` ergänzen (nie einen
   Treffer von Hand in `src/` korrigieren — der nächste Lauf überschreibt
   ihn). Neue Kennzeichen der Vorlage sind genau das, wofür die Regeln da
   sind.

## 3. Braucht die neue Oberfläche etwas, das der Fork nicht hat?

Jede Tabelle (`.from("…")`), jeder Eimer (`storage.from("…")`), jede
Datenbankfunktion (`.rpc("…")`) und jede Edge Function (`invoke("…")`) aus
`src/app/anwendung.js` gegen die lokale Instanz bzw. `supabase/functions`
und `supabase/eigene` halten. Bekannte Lücken stehen in `docs/OFFEN.md` und
sind kein neuer Befund.

## 4. Schema, Funktionen, Cron

1. Neue Migrationen der Vorlage seit dem Datum in `abgleich-stand.txt`
   (Tabelle `supabase_migrations.schema_migrations` des Quellprojekts —
   **nur lesend**). Steht dort nur ein Kommentar, liegt die DDL im
   Quell-Repository (`portal/**/*.sql`).
2. Für jede eine Fork-Migration `supabase/migrations/<zeit>_fork_<n>_….sql`:
   - jede neue Fachtabelle mit `mandant_id` (Vorgabewert
     `aktuelle_mandant_id()`), Index darauf, restriktiver Richtlinie
     `mandant_trennung` und Eintrag in `mandanten_einstufung`;
   - geänderte Funktionen in **ihrer Fork-Fassung** ändern, nie durch die
     Fassung der Vorlage ersetzen (Mandantengrenze aus `fork_14`);
   - Neutralisierung: keine Kennzeichen der Vorlage, keine Projekt-URL
     (`eigene_funktions_url()`), keine Schlüssel.
3. `tests/vorlage-vollstaendig.sql`: den Zuwachs mit Grund eintragen.
4. Edge Functions: geänderte der Vorlage über
   `scripts/neutralisieren-funktionen.py`; Cron-Jobs mit
   `timeout_milliseconds`, Bearer aus dem Vault, nie im Klartext.
5. **Entfernende Schritte** (`drop`, `revoke`, `delete`, `truncate`) in eine
   eigene Migration. Sie werden nachts **nicht** angewendet — das Werkzeug
   verlangt dafür eine Einzelfreigabe. Sie kommen nach `docs/OFFEN.md`.

## 5. Prüfen

`scripts/check.sh` muss grün sein. Das baut die lokale Instanz aus allen
Migrationen neu und läuft jedes Gate (Neutralität, Mandantentrennung,
Rauchtest, Zerlegung byte-genau).

**Rot heißt: nichts übernehmen.** Keine Teil-Übernahme, kein Commit, kein
Push. Den Befund in die Abschlussmeldung schreiben.

## 6. Übernehmen und ausliefern

Nur bei grünem `check.sh`, in dieser Reihenfolge:

1. Nicht-entfernende Migrationen im Projekt `usguiggfciavwzkdfjgt`
   anwenden, in kleinen Teilen (das Werkzeug bricht lange Migrationen nach
   60 s ab). Danach Spalten der betroffenen Tabellen lokal und im Projekt per
   Hash vergleichen.
2. Geänderte Edge Functions ausrollen.
3. `docs/abgleich-stand.txt` auf den neuen Quell-Commit setzen,
   `docs/ABGLEICH.md` (Tabelle oben plus kurzer Abschnitt) fortschreiben.
4. Ein Commit, Präfix `phase-9:`, deutsch; Push auf den Arbeitsbranch.
   Netlify liefert aus diesem Push aus.

Wird ein Schritt verweigert (Freigabe, Berechtigung), **nicht umgehen**:
liegen lassen, in `docs/OFFEN.md` und in die Abschlussmeldung.

## 7. Abschlussmeldung

Deutsch, kurz: welcher Quell-Commit, was übernommen wurde (Stufen,
Migrationen, Funktionen), was liegen geblieben ist und warum. Ohne
Änderung: keine Meldung.

## Was nie übernommen wird

Telefonanlage, Digital Signage / Shop-TV, Formular-Sync (JotForm),
Cron-Mailadressen und Bewertungsdienst-Schlüssel der Vorlage (Phase 1.4).
onOffice bleibt hinter dem Funktionsschalter aus. Keine Daten aus dem
Quellprojekt, nur Schema.
