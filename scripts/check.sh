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

abschnitt "Noch nicht abgedeckt"
cat <<'ENDE'
- Build von dist/index.html          — kommt mit Phase 1 (es gibt noch keine Oberflaeche)
- Syntaxpruefung der Oberflaeche     — dito
- Rauchtest (ein App-Skript, ein createRoot, CDN-Pins, Bundle-Groesse) — dito
- tests/mandant.sql                  — kommt mit Phase 2 (firma_id existiert noch nicht)
ENDE

printf '\n'
if [[ $fehler -eq 0 ]]; then echo "check: gruen"; else echo "check: ROT"; fi
exit $fehler
