#!/usr/bin/env bash
#
# `npm run check` — Bedingung fuer jeden Commit.
#
# Der Auftrag verlangt fuenf Teile: Build, Syntaxpruefung, Rauchtest,
# Neutralitaets-Gate, Mandantentest. Vorhanden sind zurzeit die beiden, die
# ohne Oberflaechencode ueberhaupt pruefbar sind. Was fehlt, sagt dieses Skript
# am Ende ausdruecklich — ein Gate, das Luecken verschweigt, ist keins.
set -uo pipefail
cd "$(dirname "$0")/.."

fehler=0
abschnitt() { printf '\n──── %s\n' "$1"; }

abschnitt "Neutralitaets-Gate"
scripts/neutral.sh || fehler=1

abschnitt "Migrationen auf einer leeren Instanz"
if scripts/lokale-db.sh neu >/dev/null 2>&1 && scripts/lokale-db.sh migrieren; then
  :
else
  fehler=1
fi

abschnitt "Vorlage vollstaendig uebernommen"
if scripts/lokale-db.sh psql -q -f tests/vorlage-vollstaendig.sql; then
  echo "Alle Kennzahlen stimmen mit dem Quellprojekt ueberein."
else
  fehler=1
fi

abschnitt "Mandantentrennung: jede Tabelle eingestuft"
if scripts/lokale-db.sh psql -q -f tests/mandant-einstufung.sql; then
  :
else
  fehler=1
fi

abschnitt "Mandantentrennung: haelt sie einem Angriff stand?"
if scripts/lokale-db.sh psql -q -f tests/mandant.sql; then
  :
else
  fehler=1
fi

abschnitt "Rechnungen: Zahlungsbedingungen und Freigabe"
if scripts/lokale-db.sh psql -q -f tests/rechnung-freigabe.sql; then
  :
else
  fehler=1
fi

abschnitt "Belegnummern: Muster, Ruecksetzung, Lueckenlosigkeit"
if scripts/lokale-db.sh psql -q -f tests/belegnummern.sql; then
  :
else
  fehler=1
fi

abschnitt "Kann der zweite Mandant dieselben Namen fuehren?"
if scripts/lokale-db.sh psql -q -f tests/eindeutig-je-mandant.sql; then
  :
else
  fehler=1
fi

abschnitt "Mandantengrenze: halten auch die Funktionen?"
if scripts/lokale-db.sh psql -q -f tests/funktionen-mandant.sql; then
  :
else
  fehler=1
fi

abschnitt "Mandantengrenze: verkuppeln die Hintergrundjobs?"
if scripts/lokale-db.sh psql -q -f tests/hintergrund-mandant.sql; then
  :
else
  fehler=1
fi

abschnitt "Vorlagen: markierte Felder"
if scripts/lokale-db.sh psql -q -f tests/vorlagen-felder.sql; then
  :
else
  fehler=1
fi

abschnitt "Vorlagen: Laufzeit, Provision, Fristen"
if scripts/lokale-db.sh psql -q -f tests/vorlagen-vorgaben.sql; then
  :
else
  fehler=1
fi

abschnitt "Mandant aus dem Elternsatz"
if scripts/lokale-db.sh psql -q -f tests/mandant-aus-eltern.sql; then
  :
else
  fehler=1
fi

abschnitt "Konfliktschluessel der Oberflaeche"
if python3 tests/onconflict.py; then
  :
else
  fehler=1
fi

abschnitt "Angemeldete Endpunkte: Kennung aus dem Anfragekoerper"
if python3 tests/funktionen-angemeldet.py; then
  :
else
  fehler=1
fi

abschnitt "Dienstschluessel: liest eine Funktion ueber die Mandantengrenze?"
if python3 tests/dienstschluessel-mandant.py; then
  :
else
  fehler=1
fi

abschnitt "Verdrahtete Firmennamen"
if python3 tests/firmenname-verdrahtet.py; then
  :
else
  fehler=1
fi

abschnitt "Mandantentrennung: Rundumschlag ueber alle Tabellen"
if scripts/lokale-db.sh psql -q -f tests/mandant-rundumschlag.sql; then
  :
else
  fehler=1
fi

abschnitt "Selbstregistrierung"
if scripts/lokale-db.sh psql -q -f tests/selbstregistrierung.sql; then
  :
else
  fehler=1
fi

abschnitt "Einstellungen je Mandant"
if scripts/lokale-db.sh psql -q -f tests/einstellungen-je-mandant.sql; then
  :
else
  fehler=1
fi

abschnitt "Rechte: Sichtbarkeitsbereich und Modulrechte"
if scripts/lokale-db.sh psql -q -f tests/rechte.sql; then
  :
else
  fehler=1
fi

abschnitt "Oberflaeche: Zerlegung verliert nichts"
if [[ -f reference/epworld-src.html ]]; then
  roh="$(mktemp -d)"
  if python3 scripts/oberflaeche-zerlegen.py --roh "$roh" >/dev/null \
     && python3 scripts/bauen.py --aus "$roh" --pruefen >/dev/null; then
    echo "[ok] src/ laesst sich byte-genau zur Vorlage zurueckbauen."
  else
    echo "[FEHLER] Der Rueckbau weicht von der Vorlage ab."
    fehler=1
  fi
  rm -rf "$roh"
else
  echo "reference/epworld-src.html fehlt — nicht pruefbar (reference/ ist nicht versioniert)."
fi

abschnitt "Oberflaeche: dist/index.html bauen"
if python3 scripts/bauen.py; then
  :
else
  fehler=1
fi

abschnitt "Oberflaeche: die Nebenseiten sind da"
# Am 28.09.2026 hat scripts/oberflaeche-zerlegen.py beim Leeren von src/ auch
# src/seiten/ mitgenommen, und der Commit danach hat die Loeschung
# uebernommen. Aufgefallen ist es nur, weil die Dateiliste des Commits gelesen
# wurde. Ein Hinweis im Protokoll reicht dafuer nicht — hier faellt es auf.
fehlend=""
for f in src/seiten/sw.js src/seiten/freigabe.html src/seiten/objekt.html \
         src/seiten/sonnenverlauf.html src/seiten/unterlagen.html \
         src/seiten/_redirects; do
  [[ -e "$f" ]] || fehlend="$fehlend $f"
done
if [[ -n "$fehlend" ]]; then
  echo "[FEHLER] Es fehlt:$fehlend — `npm run nebenseiten` ausfuehren."
  fehler=1
else
  echo "[ok] Alle sechs Nebenseiten liegen in src/seiten/."
fi

abschnitt "Oberflaeche: Syntax"
if [[ -d src ]]; then
  syntaxfehler=0
  for f in src/app/*.js src/start/*.js src/seiten/sw.js; do
    [[ -e "$f" ]] || continue
    node --check "$f" || syntaxfehler=1
  done
  if [[ $syntaxfehler -eq 0 ]]; then
    echo "[ok] Alle Skripte der Oberflaeche sind syntaktisch gueltig."
  else
    fehler=1
  fi
else
  echo "src/ fehlt — nichts zu pruefen."
fi

abschnitt "Vorlagen fuellen: die Rechnung dahinter"
if node tests/vorlagen-fuellen.js; then
  :
else
  fehler=1
fi

abschnitt "Oberflaeche: Storage-Huelle"
if node tests/storage-huelle.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Schriften: dieselben wie in den Referenz-PDFs"
# assets/fonts/expose/ ist Erzeugnis, nicht Handarbeit: erst der Vergleich
# mit dem Skript, dann der Vergleich mit den eingebetteten Schriften der
# Referenz-PDFs. Ohne reference/ uebersprungen.
if python3 scripts/expose-schriften.py --pruefen && python3 tests/expose-schriften.py; then
  :
else
  fehler=1
fi

abschnitt "Expose-Renderer: Feldkatalog deckt das Schema"
# Der Katalog sagt, welche Platzhalter eine Vorlage benutzen darf. Eine
# neue Spalte muss aufgenommen oder mit Grund ausgenommen werden — sonst
# fehlt sie still im Editor.
if node tests/expose-felder.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Renderer: aus Datenbankzeilen werden Werte"
# Der Aufbereiter steht zwischen Datenbank und Renderer. Zwei Fragen, die
# im Betrieb nicht auffallen: kommt jeder Platzhalter an, und bleibt ein
# fehlender Wert weg, statt eine 0 zu werden?
if node tests/expose-aufbereiten.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Renderer: Zufallsfolge wie Pythons random"
# Zwei Prototypen streuen Platzhaltergrafik mit random.Random(saat). Die
# Folge ist damit Teil der Vorlage.
if node tests/expose-zufall.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Renderer: Zeilenbreiten wie pdfmetrics.stringWidth"
# Nach der Breite richtet sich jeder Umbruch. Rechnet der Renderer anders
# als die Prototypen, verlaesst er die verbindliche Vorlage — an langen
# Absaetzen am meisten. Ohne reportlab uebersprungen.
if node tests/expose-breiten.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Vorlagen: Farbableitung wie in den Prototypen"
# Die drei theme()-Funktionen der Prototypen sind laut Auftrag verbindlich.
# Der Test fuehrt sie aus und vergleicht jede abgeleitete Farbe mit der
# Portierung in packages/expose-renderer. Ohne reference/ uebersprungen.
if node tests/expose-farben.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Vorlagen: Schema und Elementtypen"
# Das Schema prueft die Form der Vorlagen, und Schema und Renderer
# muessen dieselben Elementtypen fuehren.
if node tests/expose-schema.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Renderer: Seitenlogik"
# Bedingungen, Wiederholungen, Abweichungen je Objekt, fehlende Werte,
# Verdichtung. Das prueft kein Vergleich mit vollstaendigen Demodaten.
if node tests/expose-seitenlogik.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Renderer: Buendel entsprechen der Quelle"
# Browser und Edge Function bekommen dasselbe Paket. Wer ein Buendel von
# Hand anfasst, bekommt es hier gesagt.
if node packages/expose-renderer/bauen.mjs --pruefen; then
  :
else
  fehler=1
fi

abschnitt "Expose-Schriften: eingebettet wie in assets/fonts/expose/"
# Die Edge Function traegt die zwanzig Schnitte selbst — gepackt und
# base64-kodiert. Weicht die Datei von den Schriften ab, bekommt ein Expose
# andere Zeilenumbrueche als die Vorschau im Browser.
if python3 scripts/expose-schriften-einbetten.py --pruefen; then
  :
else
  fehler=1
fi

abschnitt "Expose-Systemvorlagen: Migration entspricht den JSON-Dateien"
# Die drei Systemvorlagen stehen in der Datenbank, aber geschrieben werden
# sie in packages/expose-renderer/vorlagen/. Die Migration ist Erzeugnis:
# wer eine Vorlage aendert und das Skript nicht laufen laesst, haette zwei
# Fassungen derselben Vorlage.
if python3 scripts/expose-systemvorlagen.py --pruefen; then
  :
else
  fehler=1
fi

abschnitt "Expose-Vorlagen: zeichnet der Renderer wie die Prototypen?"
# Schrittweiser Vergleich gegen die aufgezeichneten Prototypen: Ort auf
# 2 pt, dazu Schnitt, Groesse, Sperrung und Farbe. Ohne reference/
# uebersprungen.
if node tests/expose-vorlagen.js; then
  :
else
  fehler=1
fi

abschnitt "Expose-Vorlagen: wird daraus ein PDF?"
# Die Schrittliste ist noch kein Dokument. Hier wird jede Vorlage
# geschrieben, zurueckgelesen und nachgesehen, ob Seiten und Schriften
# darin sind. Ohne reference/ uebersprungen.
if node tests/expose-pdf.js; then
  :
else
  fehler=1
fi

abschnitt "Expose: laeuft der Editor durch?"
# Die erste eigene Ansicht des Forks. Sie wird hier wirklich ausgefuehrt —
# gegen ein winziges React, aber mit echtem Buendel, echtem pdf-lib und den
# ausgelieferten Schriften: aus einer Vorlage entsteht ein PDF.
if node tests/expose-editor.js; then
  :
else
  fehler=1
fi

abschnitt "Expose: wird aus einem fremden PDF eine Vorlage?"
# Ein PDF mit bekannter Geometrie wird gebaut und wieder eingelesen. Geprueft
# wird nicht "laeuft durch", sondern "steht nachher dasselbe an derselben
# Stelle" — und ob der Renderer die eingelesene Vorlage zeichnen kann.
if node tests/expose-einlesen.js; then
  :
else
  fehler=1
fi

abschnitt "Expose: malt die Bearbeitungsflaeche im Browser?"
# Die einzige Stelle des Forks, die ohne Browser nicht laeuft: ein Canvas,
# eine Schrift als FontFace, ein Zeichenkontext. Ohne Chromium wird der
# Abschnitt uebersprungen; npm run check muss auch auf einer Maschine ohne
# Browser durchlaufen.
if node tests/expose-leinwand.js; then
  :
else
  fehler=1
fi

abschnitt "Expose: laeuft die Edge Function durch?"
# Die Syntaxpruefung sagt nur, dass die Datei lesbar ist. Hier laeuft der
# Handler wirklich — mit nachgebautem Supabase, ohne Netz, ohne Deno: aus
# einem Objekt entsteht ein PDF, mit allen drei Systemvorlagen.
if node tests/expose-funktion.js; then
  :
else
  fehler=1
fi

abschnitt "Oberflaeche: Rauchtest"
if python3 tests/oberflaeche-rauchtest.py; then
  :
else
  fehler=1
fi

abschnitt "Edge Functions: nur Kennzeichen geaendert"
if python3 tests/funktionen-unveraendert.py; then
  :
else
  fehler=1
fi

abschnitt "Edge Functions: oeffentliche Endpunkte im Buch"
if python3 tests/funktionen-oeffentlich.py; then
  :
else
  fehler=1
fi

abschnitt "Edge Functions: schreiben sie mit Mandanten?"
if python3 tests/oeffentlich-insert-mandant.py; then
  :
else
  fehler=1
fi

abschnitt "Edge Functions: Syntax"
if node tests/funktionen-syntax.js; then
  :
else
  fehler=1
fi

abschnitt "Umgebungsvariablen: jede gelesene ist dokumentiert"
# CLAUDE.md: keine Geheimnisse im Repository, nur Umgebungsvariablen,
# dokumentiert in .env.example. Am 06.10.2026 nannte die Datei drei
# erfundene Mail-Variablen und keine der neun echten — der Mailversand
# liess sich damit nicht einrichten.
if python3 tests/umgebungsvariablen.py; then
  :
else
  fehler=1
fi

abschnitt "Edge Functions: verify_jwt fuer jede festgelegt"
if python3 tests/funktionen-config.py; then
  :
else
  fehler=1
fi

abschnitt "Noch nicht abgedeckt"
cat <<'ENDE'
- Erster Start gegen das eigene Projekt — braucht ausgerollte Edge Functions
                                       und einen Ort, an dem die Datei liegt
- Typen und Importe der Edge Functions — der Parser liest die Dateien, aber
                                       aufloesen kann sie nur Deno mit Netz
ENDE

printf '\n'
if [[ $fehler -eq 0 ]]; then echo "check: gruen"; else echo "check: ROT"; fi
exit $fehler
