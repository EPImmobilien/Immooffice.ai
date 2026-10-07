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
# Welcher Abschnitt laeuft gerade, und welche sind gescheitert.
#
# WARUM: Bis zum 07.10.2026 sagte dieses Skript am Ende "check: ROT" und
# sonst nichts. Welches Gate gefallen war, stand irgendwo in tausend Zeilen
# Protokoll — und bei einem Gate, dessen Meldung auf stderr geht, auch da
# nicht auffaellig. Zweimal habe ich an einem Tag danach gesucht und einmal
# den Lauf fuer unerklaerlich gehalten. Ein Gate, das nicht sagt, was es
# beanstandet, wird irgendwann ueberlesen; das ist das Schlimmste, was einem
# Gate passieren kann.
aktuell=""
gescheitert=()
abschnitt() { aktuell="$1"; printf '\n──── %s\n' "$1"; }
schlecht() { fehler=1; gescheitert+=("$aktuell"); }

abschnitt "Neutralitaets-Gate"
scripts/neutral.sh || schlecht

abschnitt "Migrationen auf einer leeren Instanz"
if scripts/lokale-db.sh neu >/dev/null 2>&1 && scripts/lokale-db.sh migrieren; then
  :
else
  schlecht
fi

abschnitt "Vorlage vollstaendig uebernommen"
if scripts/lokale-db.sh psql -q -f tests/vorlage-vollstaendig.sql; then
  echo "Alle Kennzahlen stimmen mit dem Quellprojekt ueberein."
else
  schlecht
fi

abschnitt "Mandantentrennung: jede Tabelle eingestuft"
if scripts/lokale-db.sh psql -q -f tests/mandant-einstufung.sql; then
  :
else
  schlecht
fi

abschnitt "Mandantentrennung: haelt sie einem Angriff stand?"
if scripts/lokale-db.sh psql -q -f tests/mandant.sql; then
  :
else
  schlecht
fi

abschnitt "Rechnungen: Zahlungsbedingungen und Freigabe"
if scripts/lokale-db.sh psql -q -f tests/rechnung-freigabe.sql; then
  :
else
  schlecht
fi

abschnitt "Belegnummern: Muster, Ruecksetzung, Lueckenlosigkeit"
if scripts/lokale-db.sh psql -q -f tests/belegnummern.sql; then
  :
else
  schlecht
fi

abschnitt "Kann der zweite Mandant dieselben Namen fuehren?"
if scripts/lokale-db.sh psql -q -f tests/eindeutig-je-mandant.sql; then
  :
else
  schlecht
fi

abschnitt "Mandantengrenze: halten auch die Funktionen?"
if scripts/lokale-db.sh psql -q -f tests/funktionen-mandant.sql; then
  :
else
  schlecht
fi

abschnitt "Mandantengrenze: verkuppeln die Hintergrundjobs?"
if scripts/lokale-db.sh psql -q -f tests/hintergrund-mandant.sql; then
  :
else
  schlecht
fi

abschnitt "Vorlagen: markierte Felder"
if scripts/lokale-db.sh psql -q -f tests/vorlagen-felder.sql; then
  :
else
  schlecht
fi

abschnitt "Vorlagen: Laufzeit, Provision, Fristen"
if scripts/lokale-db.sh psql -q -f tests/vorlagen-vorgaben.sql; then
  :
else
  schlecht
fi

abschnitt "Mandant aus dem Elternsatz"
if scripts/lokale-db.sh psql -q -f tests/mandant-aus-eltern.sql; then
  :
else
  schlecht
fi

abschnitt "Konfliktschluessel der Oberflaeche"
if python3 tests/onconflict.py; then
  :
else
  schlecht
fi

abschnitt "Angemeldete Endpunkte: Kennung aus dem Anfragekoerper"
if python3 tests/funktionen-angemeldet.py; then
  :
else
  schlecht
fi

abschnitt "Dienstschluessel: liest eine Funktion ueber die Mandantengrenze?"
if python3 tests/dienstschluessel-mandant.py; then
  :
else
  schlecht
fi

abschnitt "Verdrahtete Firmennamen"
if python3 tests/firmenname-verdrahtet.py; then
  :
else
  schlecht
fi

abschnitt "Funktionsrechte: wer darf eine RPC rufen?"
# Supabase vergibt EXECUTE auf alles in public an PUBLIC, und PostgREST
# macht jede Funktion dort erreichbar. Am 06.10.2026 durfte anon 147 von
# 153 rufen, darunter fuenf, die Credits gutschreiben und nichts pruefen
# (fork_63).
if scripts/lokale-db.sh psql -q -f tests/funktionsrechte.sql; then
  :
else
  schlecht
fi

abschnitt "Sichten: halten sie die Mandantengrenze?"
# Die uebrigen Mandantentests pruefen Tabellen. Eine Sicht ohne
# security_invoker laeuft mit den Rechten ihres Eigners und hebt die
# Trennung auf — am 06.10.2026 taten das fuenf, zwei davon auch fuers
# Schreiben (fork_62).
if scripts/lokale-db.sh psql -q -f tests/sichten.sql; then
  :
else
  schlecht
fi

abschnitt "Rufnummern: nur dort suchen, wo eine steht"
if python3 tests/rufnummern.py; then
  :
else
  schlecht
fi

abschnitt "Mandantentrennung: Zeilen ohne Mandanten"
# Die naheliegendste Frage, und vier Gates haben sie nicht gestellt: steht
# in einer MANDANT-Tabelle etwas, das niemandem gehoert? Am 06.10.2026
# waren es 156 Mails und 15 Ordner — fuer jeden Nutzer unsichtbar, weil
# die restriktive Richtlinie mandant_id = aktuelle_mandant_id() vergleicht
# und null nicht gleich irgendwas ist (fork_65).
if scripts/lokale-db.sh psql -q -f tests/mandant-ohne.sql; then
  :
else
  schlecht
fi

abschnitt "Mandantentrennung: Rundumschlag ueber alle Tabellen"
if scripts/lokale-db.sh psql -q -f tests/mandant-rundumschlag.sql; then
  :
else
  schlecht
fi

abschnitt "Selbstregistrierung"
if scripts/lokale-db.sh psql -q -f tests/selbstregistrierung.sql; then
  :
else
  schlecht
fi

abschnitt "Einstellungen je Mandant"
if scripts/lokale-db.sh psql -q -f tests/einstellungen-je-mandant.sql; then
  :
else
  schlecht
fi

abschnitt "Rechte: Sichtbarkeitsbereich und Modulrechte"
if scripts/lokale-db.sh psql -q -f tests/rechte.sql; then
  :
else
  schlecht
fi

abschnitt "Supportzugriff: sehen duerfen, ohne heimlich zu sehen"
# Die heikelste Pruefung des Forks: fork_54 hat aktuelle_mandant_id()
# veraendert, und daran haengt die ganze Mandantentrennung.
if scripts/lokale-db.sh psql -q -f tests/supportzugriff.sql; then
  :
else
  schlecht
fi

abschnitt "Abrechnung: Credits, Ledger, Limits"
if scripts/lokale-db.sh psql -q -f tests/abrechnung.sql; then
  :
else
  schlecht
fi

abschnitt "Oberflaeche: Zerlegung verliert nichts"
if [[ -f reference/epworld-src.html ]]; then
  roh="$(mktemp -d)"
  if python3 scripts/oberflaeche-zerlegen.py --roh "$roh" >/dev/null \
     && python3 scripts/bauen.py --aus "$roh" --pruefen >/dev/null; then
    echo "[ok] src/ laesst sich byte-genau zur Vorlage zurueckbauen."
  else
    echo "[FEHLER] Der Rueckbau weicht von der Vorlage ab."
    schlecht
  fi
  rm -rf "$roh"
else
  echo "reference/epworld-src.html fehlt — nicht pruefbar (reference/ ist nicht versioniert)."
fi

abschnitt "Oberflaeche: dist/index.html bauen"
if python3 scripts/bauen.py; then
  :
else
  schlecht
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
  schlecht
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
    schlecht
  fi
else
  echo "src/ fehlt — nichts zu pruefen."
fi

abschnitt "Vorlagen fuellen: die Rechnung dahinter"
if node tests/vorlagen-fuellen.js; then
  :
else
  schlecht
fi

abschnitt "Oberflaeche: Storage-Huelle"
if node tests/storage-huelle.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Schriften: dieselben wie in den Referenz-PDFs"
# assets/fonts/expose/ ist Erzeugnis, nicht Handarbeit: erst der Vergleich
# mit dem Skript, dann der Vergleich mit den eingebetteten Schriften der
# Referenz-PDFs. Ohne reference/ uebersprungen.
if python3 scripts/expose-schriften.py --pruefen && python3 tests/expose-schriften.py; then
  :
else
  schlecht
fi

abschnitt "Expose-Renderer: Feldkatalog deckt das Schema"
# Der Katalog sagt, welche Platzhalter eine Vorlage benutzen darf. Eine
# neue Spalte muss aufgenommen oder mit Grund ausgenommen werden — sonst
# fehlt sie still im Editor.
if node tests/expose-felder.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Renderer: aus Datenbankzeilen werden Werte"
# Der Aufbereiter steht zwischen Datenbank und Renderer. Zwei Fragen, die
# im Betrieb nicht auffallen: kommt jeder Platzhalter an, und bleibt ein
# fehlender Wert weg, statt eine 0 zu werden?
if node tests/expose-aufbereiten.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Renderer: Zufallsfolge wie Pythons random"
# Zwei Prototypen streuen Platzhaltergrafik mit random.Random(saat). Die
# Folge ist damit Teil der Vorlage.
if node tests/expose-zufall.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Renderer: Zeilenbreiten wie pdfmetrics.stringWidth"
# Nach der Breite richtet sich jeder Umbruch. Rechnet der Renderer anders
# als die Prototypen, verlaesst er die verbindliche Vorlage — an langen
# Absaetzen am meisten. Ohne reportlab uebersprungen.
if node tests/expose-breiten.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Vorlagen: Farbableitung wie in den Prototypen"
# Die drei theme()-Funktionen der Prototypen sind laut Auftrag verbindlich.
# Der Test fuehrt sie aus und vergleicht jede abgeleitete Farbe mit der
# Portierung in packages/expose-renderer. Ohne reference/ uebersprungen.
if node tests/expose-farben.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Vorlagen: Schema und Elementtypen"
# Das Schema prueft die Form der Vorlagen, und Schema und Renderer
# muessen dieselben Elementtypen fuehren.
if node tests/expose-schema.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Renderer: Seitenlogik"
# Bedingungen, Wiederholungen, Abweichungen je Objekt, fehlende Werte,
# Verdichtung. Das prueft kein Vergleich mit vollstaendigen Demodaten.
if node tests/expose-seitenlogik.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Renderer: Buendel entsprechen der Quelle"
# Browser und Edge Function bekommen dasselbe Paket. Wer ein Buendel von
# Hand anfasst, bekommt es hier gesagt.
if node packages/expose-renderer/bauen.mjs --pruefen; then
  :
else
  schlecht
fi

abschnitt "Expose-Schriften: eingebettet wie in assets/fonts/expose/"
# Die Edge Function traegt die zwanzig Schnitte selbst — gepackt und
# base64-kodiert. Weicht die Datei von den Schriften ab, bekommt ein Expose
# andere Zeilenumbrueche als die Vorschau im Browser.
if python3 scripts/expose-schriften-einbetten.py --pruefen; then
  :
else
  schlecht
fi

abschnitt "Expose-Systemvorlagen: Migration entspricht den JSON-Dateien"
# Die drei Systemvorlagen stehen in der Datenbank, aber geschrieben werden
# sie in packages/expose-renderer/vorlagen/. Die Migration ist Erzeugnis:
# wer eine Vorlage aendert und das Skript nicht laufen laesst, haette zwei
# Fassungen derselben Vorlage.
if python3 scripts/expose-systemvorlagen.py --pruefen; then
  :
else
  schlecht
fi

abschnitt "Social-Baukasten: zeichnen die Vorlagen, und erfinden sie nichts?"
# Gezeichnet wird mit demselben Renderer wie in der Oberflaeche, nur ohne
# Browser. Die Frage ist nicht, wie es aussieht, sondern ob auf jedem
# Beitrag Marke, Titel und Preis stehen — und ob ein Objekt ohne Angaben
# welche dazubekommt.
if node tests/social.js; then
  :
else
  schlecht
fi

abschnitt "Social-Vorlagen: Erzeuger, Dateien und Migration stimmen ueberein"
# Drei Stellen, eine Wahrheit: scripts/social-vorlagen.py erzeugt die sechs
# JSON-Dateien, scripts/social-systemvorlagen.py die Migration, die sie
# einspielt. Wer eine Datei von Hand aendert, faellt hier auf.
if python3 scripts/social-vorlagen.py --pruefen \
   && python3 scripts/social-systemvorlagen.py --pruefen; then
  :
else
  schlecht
fi

abschnitt "Expose-Vorlagen: zeichnet der Renderer wie die Prototypen?"
# Schrittweiser Vergleich gegen die aufgezeichneten Prototypen: Ort auf
# 2 pt, dazu Schnitt, Groesse, Sperrung und Farbe. Ohne reference/
# uebersprungen.
if node tests/expose-vorlagen.js; then
  :
else
  schlecht
fi

abschnitt "Expose-Vorlagen: wird daraus ein PDF?"
# Die Schrittliste ist noch kein Dokument. Hier wird jede Vorlage
# geschrieben, zurueckgelesen und nachgesehen, ob Seiten und Schriften
# darin sind. Ohne reference/ uebersprungen.
if node tests/expose-pdf.js; then
  :
else
  schlecht
fi

abschnitt "Expose: laeuft der Editor durch?"
# Die erste eigene Ansicht des Forks. Sie wird hier wirklich ausgefuehrt —
# gegen ein winziges React, aber mit echtem Buendel, echtem pdf-lib und den
# ausgelieferten Schriften: aus einer Vorlage entsteht ein PDF.
if node tests/expose-editor.js; then
  :
else
  schlecht
fi

abschnitt "Expose: wird aus einem fremden PDF eine Vorlage?"
# Ein PDF mit bekannter Geometrie wird gebaut und wieder eingelesen. Geprueft
# wird nicht "laeuft durch", sondern "steht nachher dasselbe an derselben
# Stelle" — und ob der Renderer die eingelesene Vorlage zeichnen kann.
if node tests/expose-einlesen.js; then
  :
else
  schlecht
fi

abschnitt "Expose: malt die Bearbeitungsflaeche im Browser?"
# Die einzige Stelle des Forks, die ohne Browser nicht laeuft: ein Canvas,
# eine Schrift als FontFace, ein Zeichenkontext. Ohne Chromium wird der
# Abschnitt uebersprungen; npm run check muss auch auf einer Maschine ohne
# Browser durchlaufen.
if node tests/expose-leinwand.js; then
  :
else
  schlecht
fi

abschnitt "Expose: laeuft die Edge Function durch?"
# Die Syntaxpruefung sagt nur, dass die Datei lesbar ist. Hier laeuft der
# Handler wirklich — mit nachgebautem Supabase, ohne Netz, ohne Deno: aus
# einem Objekt entsteht ein PDF, mit allen drei Systemvorlagen.
if node tests/expose-funktion.js; then
  :
else
  schlecht
fi

abschnitt "Exposés: kommen ALLE Bilder hinein?"
# Bis fork_64 nicht: feste Bildrahmen in den Vorlagen (fuenf bis sieben
# Fotos) und eine fest verdrahtete Grenze von zehn in der Edge Function.
# Wer dreissig Fotos pflegte, bekam sieben — lautlos.
if node tests/expose-bildzahl.js; then
  :
else
  schlecht
fi

abschnitt "Exposés: sieht das Gezeichnete fertig aus?"
# scripts/expose-probe.mjs zeichnet jede Vorlage mit nachgebauten Daten und
# meldet, was nicht gepasst hat: gekuerzter Text, verkleinerte Zeilen, ein
# Rahmen ueber der Seite. Das Werkzeug gab es seit dem 06.10.2026 — gelesen
# hat seine Meldungen niemand. Darin stand ein Zierrahmen, der im
# Quadratformat 639 pt hoch auf einer 540 pt hohen Seite lag.
if node tests/expose-probe.js; then
  :
else
  schlecht
fi

abschnitt "Oberflaeche: Rauchtest"
if python3 tests/oberflaeche-rauchtest.py; then
  :
else
  schlecht
fi

abschnitt "Edge Functions: nur Kennzeichen geaendert"
if python3 tests/funktionen-unveraendert.py; then
  :
else
  schlecht
fi

abschnitt "Edge Functions: oeffentliche Endpunkte im Buch"
if python3 tests/funktionen-oeffentlich.py; then
  :
else
  schlecht
fi

abschnitt "Edge Functions: schreiben sie mit Mandanten?"
if python3 tests/oeffentlich-insert-mandant.py; then
  :
else
  schlecht
fi

abschnitt "Edge Functions: Syntax"
if node tests/funktionen-syntax.js; then
  :
else
  schlecht
fi

abschnitt "Workflows: YAML gueltig"
# Am 06.10.2026 ist ein neuer Workflow mit kaputtem YAML auf GitHub
# gelandet. Die Folge ist unangenehm leise: GitHub meldet beim Starten
# "Workflow does not have 'workflow_dispatch' trigger" — und man sucht am
# Ausloeser statt an der Einrueckung. Ursache war ein mehrzeiliges
# python -c mitten im run-Block; dessen Folgezeilen stehen in Spalte 1 und
# beenden den Block.
if python3 - <<'PYENDE'
import glob, sys, yaml
schlecht = 0
for datei in sorted(glob.glob('.github/workflows/*.yml')):
    try:
        yaml.safe_load(open(datei, encoding='utf-8'))
    except Exception as f:
        schlecht = 1
        print(f'[FEHLER] {datei}: {str(f)[:200]}')
if not schlecht:
    print(f'[ok] {len(glob.glob(".github/workflows/*.yml"))} Workflows, jeder gueltiges YAML.')
sys.exit(schlecht)
PYENDE
then
  :
else
  schlecht
fi

abschnitt "Marke: Logo, Bildmarke, Icons"
# Erzeugt aus assets/marke/quelle/. Geprueft wird dreierlei: dass niemand
# eine erzeugte Datei von Hand bearbeitet hat (die Aenderung waere beim
# naechsten Lauf weg), dass keine der beiden Farben der Lieferung in einer
# ausgelieferten Datei steht (es sind die des Referenzunternehmens), und
# dass jeder angeforderte Marken-Pfad eine Datei hat. Letzteres war bis zum
# 06.10.2026 sechsmal nicht der Fall.
if python3 tests/marke.py; then
  :
else
  schlecht
fi

abschnitt "Website: was sie behaupten darf"
# Eine Werbeseite ist die Stelle, an der sich Saetze einschleichen, die das
# Produkt nicht halten kann. CLAUDE.md verbietet genau diese Saetze.
if python3 tests/website.py; then
  :
else
  schlecht
fi

abschnitt "Website: laeuft sie im Browser?"
# Die Website hat Bewegung — Slideshow, Abschnitte, die beim Scrollen
# erscheinen. Ob die wirklich laeuft, sieht keine Textpruefung: am
# 06.10.2026 trugen zwei Funktionen im selben Gueltigkeitsbereich den
# Namen "pruefen", die zweite wurde von der ersten ueberschrieben, und
# KEIN Abschnitt erschien je. Im eigenen Browser faellt das nicht auf,
# weil die Seite ohne die Klasse trotzdem Text zeigt — nur eben ohne
# Animation. Ohne Chromium wird uebersprungen, nicht gemeldet.
if node tests/website-browser.js; then
  :
else
  schlecht
fi

abschnitt "Pflichtangaben: kein Rueckfall ins Leere"
# immooffice.example gehoert niemandem. Als Ersatz fuer die Domain der
# Referenz ist das richtig; als Rueckfall hinter einer fehlenden Angabe
# falsch — die Mail geht hinaus und kommt nirgends an. Seit 06.10.2026
# verweigern die Funktionen stattdessen den Versand.
if python3 tests/pflichtangaben.py; then
  :
else
  schlecht
fi

abschnitt "Schreibstil und Antwort-Absichten"
# Die Schwaerzung ist die eine Stelle, an der entschieden wird, was den
# Server Richtung KI-Anbieter verlaesst. Rutscht dort eine Nummer durch,
# merkt es niemand — einem Stilprofil sieht man nicht an, woraus es
# entstanden ist. Also Zeile fuer Zeile.
if node tests/mail-stil.js; then
  :
else
  schlecht
fi

abschnitt "Exposé-Sofortversand"
# Der erste Automatismus, der ohne Zuschauer Post an Fremde schickt. Was
# dabei schiefgeht, merkt der Interessent und nicht der Makler. Die Funktion
# laeuft hier wirklich, gegen ein nachgebautes Supabase.
if node tests/expose-sofortversand.js; then
  :
else
  schlecht
fi

abschnitt "Postfaecher je Anbieter: Microsoft, Google, IMAP"
# Die beiden Funktionen, die ein Postfach verbinden, laufen hier wirklich —
# gegen ein nachgebautes Supabase und einen nachgebauten Anbieter. Geprueft
# wird, was im Betrieb niemand halb ausprobieren kann: Einmaligkeit des
# Zustands, Mandant und Nutzer aus dem Vorgang, verschluesselte Tokens.
if node tests/postfach-anbieter.js; then
  :
else
  schlecht
fi

abschnitt "Credits an den KI-Aufrufen"
# Ohne diese Pruefung waere die Abrechnung Zierde: Toepfe und Preise gaebe
# es, aber nichts wuerde verbraucht. Geprueft wird am Quelltext, weil eine
# Edge Function hier weder laufen noch an Supabase kann.
if node tests/credits.js; then
  :
else
  schlecht
fi

abschnitt "Abo-Schranke vor den KI-Aufrufen ohne Preis"
# Dreissig Funktionen rufen ein Sprachmodell, ohne Credits zu verbrauchen —
# der Preis fehlt im Katalog, und den setzt der Betreiber. Dass ein Mandant
# ohne gueltiges Abo sie trotzdem benutzen darf, war kein Beschluss, sondern
# ein Loch: jeder Aufruf kostet beim Anbieter Geld.
if node tests/abo-schranke.js; then
  :
else
  schlecht
fi

abschnitt "Testphase: Erinnerung und Band"
# Drei Meldungen vor dem Ende, je einmal. Die Sperre gegen Doppelversand ist
# ein Schluessel und keine Abfrage — zwei gleichzeitige Laeufe saehen eine
# Abfrage nicht.
if node tests/testphase.js; then
  :
else
  schlecht
fi

abschnitt "Plattform-Bereich: was der Betreiber sieht — und was nicht"
# Die Linie verlaeuft bei "Daten AUS einem Mandanten". Geprueft wird gegen
# eine Liste ERLAUBTER Tabellen; eine Verbotsliste waere am Tag ihrer
# Entstehung vollstaendig und danach nie wieder.
if node tests/plattform-admin.js; then
  :
else
  schlecht
fi

abschnitt "Abo & Abrechnung: die Tafel im Kundenbereich"
# Gezeichnet wird mit einem nachgebauten React. Die Frage ist nicht, wie es
# aussieht, sondern ob vor einer Kuendigung das Datum steht und ob die Tafel
# irgendeinen Weg anbietet, den Abo-Stand selbst zu setzen.
if node tests/abrechnung-ui.js; then
  :
else
  schlecht
fi

abschnitt "Betreiberrollen: halten sie in der Datenbank?"
if scripts/lokale-db.sh psql -q -f tests/betreiber-rollen.sql; then
  :
else
  schlecht
fi

abschnitt "Betreiber-Metadaten: Zahlen ja, Inhalte nein"
if scripts/lokale-db.sh psql -q -f tests/betreiber-metadaten.sql; then
  :
else
  schlecht
fi

abschnitt "Betreiber-Kennzahlen: MRR wie von Hand gerechnet"
if scripts/lokale-db.sh psql -q -f tests/betreiber-kennzahlen.sql; then
  :
else
  schlecht
fi

abschnitt "IMAP: liest der Abruf die Ordnerliste jedes Servers?"
node tests/imap-ordnerliste.js || schlecht

abschnitt "Umgebungsvariablen: jede gelesene ist dokumentiert"
# CLAUDE.md: keine Geheimnisse im Repository, nur Umgebungsvariablen,
# dokumentiert in .env.example. Am 06.10.2026 nannte die Datei drei
# erfundene Mail-Variablen und keine der neun echten — der Mailversand
# liess sich damit nicht einrichten.
if python3 tests/umgebungsvariablen.py; then
  :
else
  schlecht
fi

abschnitt "Edge Functions: verify_jwt fuer jede festgelegt"
if python3 tests/funktionen-config.py; then
  :
else
  schlecht
fi

abschnitt "Noch nicht abgedeckt"
cat <<'ENDE'
- Erster Start gegen das eigene Projekt — braucht ausgerollte Edge Functions
                                       und einen Ort, an dem die Datei liegt
- Typen und Importe der Edge Functions — der Parser liest die Dateien, aber
                                       aufloesen kann sie nur Deno mit Netz
ENDE

printf '\n'
if [[ $fehler -eq 0 ]]; then
  echo "check: gruen"
else
  echo "check: ROT — gescheitert sind:"
  for a in "${gescheitert[@]}"; do echo "  · $a"; done
fi
exit $fehler
