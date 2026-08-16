#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Reproduzierbare Analyse der Referenz-Anwendung (Abschnitt 0/1 des Master-Prompts).
#
# Die Referenzdatei ist ein ~22 MB grosses Kompilat und wird NIEMALS vollstaendig
# gelesen. Dieses Skript arbeitet ausschliesslich auf der Festplatte und gibt
# nur Aggregate aus. Ergebnisse fliessen in docs/BESTANDSAUFNAHME.md.
#
# Aufruf:  scripts/analyse-referenz.sh [pfad/zur/referenz.html]
# ---------------------------------------------------------------------------
set -euo pipefail

REF="${1:-reference/epworld-index.html}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ ! -f "$REF" ]]; then
  echo "Referenzdatei nicht gefunden: $REF" >&2
  echo "Sie ist bewusst nicht im Repository (siehe .gitignore und docs/BESTANDSAUFNAHME.md)." >&2
  exit 1
fi

# Base64-Blobs (eingebettete Logos, DOCX-/PPTX-Vorlagen) herausfiltern.
# Sie machen ~85 % der Dateigroesse aus, enthalten aber keinen Programmcode.
awk 'length<50000' "$REF" > "$WORK/code.js"

hr() { printf '\n== %s ==\n' "$1"; }

hr "Dateikennzahlen"
printf 'Referenz  : %s Bytes, %s Zeilen\n' \
  "$(wc -c <"$REF" | tr -d ' ')" "$(wc -l <"$REF" | tr -d ' ')"
printf 'Nur Code  : %s Bytes, %s Zeilen\n' \
  "$(wc -c <"$WORK/code.js" | tr -d ' ')" "$(wc -l <"$WORK/code.js" | tr -d ' ')"
printf 'Blob-Zeilen (>=50k Zeichen): %s\n' \
  "$(awk 'length>=50000 {printf "%s ", NR}' "$REF")"
printf 'SHA256    : %s\n' "$(sha256sum "$REF" | cut -d' ' -f1)"

hr "Datenbanktabellen (.from ausserhalb storage)"
grep -oE "[^e]\.from\(\s*[\"'\`][^\"'\`]+" "$WORK/code.js" \
  | grep -oE "[\"'\`][^\"'\`]+$" | tr -d "\"'\`" | sort | uniq -c | sort -rn

hr "Storage-Buckets (storage.from)"
grep -oE "storage\.from\(\s*[\"'\`][^\"'\`]+" "$WORK/code.js" \
  | grep -oE "[\"'\`][^\"'\`]+$" | tr -d "\"'\`" | sort -u

hr "Edge Functions (functions.invoke)"
grep -oE "functions\.invoke\(\s*[\"'\`][^\"'\`]+" "$WORK/code.js" \
  | grep -oE "[\"'\`][^\"'\`]+$" | tr -d "\"'\`" | sort -u

hr "Datenbank-Funktionen (.rpc)"
grep -oE "\.rpc\(\s*[\"'][^\"']+" "$WORK/code.js" \
  | grep -oE "[\"'][^\"']+$" | tr -d "\"'" | sort -u

hr "React-Komponenten auf oberster Ebene"
printf 'Anzahl: %s\n' "$(grep -cE '^function [A-Z][A-Za-z0-9_]*\(' "$WORK/code.js")"

hr "Externe Hosts"
grep -oE "https?://[a-zA-Z0-9._-]+" "$WORK/code.js" | sort | uniq -c | sort -rn | head -25

hr "Altmarken-Treffer (muessen in ImmoOffice.ai auf 0 stehen)"
grep -oiE "(engfer[a-z-]*|e&p ?world|epworld)" "$WORK/code.js" \
  | tr 'A-Z' 'a-z' | sort | uniq -c | sort -rn
