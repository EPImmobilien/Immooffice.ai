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

abschnitt "Oberflaeche: Syntax"
if [[ -d src ]]; then
  syntaxfehler=0
  for f in src/app/*.js src/start/*.js; do
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
- Syntaxpruefung der Edge Functions  — kein Deno und kein TypeScript in dieser
                                       Umgebung; geprueft wird nur, dass die
                                       Neutralisierung nichts anderes anfasst
- tests/mandant.sql                  — kommt mit Phase 2 (firma_id existiert noch nicht)
ENDE

printf '\n'
if [[ $fehler -eq 0 ]]; then echo "check: gruen"; else echo "check: ROT"; fi
exit $fehler
