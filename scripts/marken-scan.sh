#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Marken-Scan (Master-Prompt Abschnitt 2, letzter Absatz).
#
# Prueft das Repository auf Kennzeichen des Referenzunternehmens und auf
# entfallene Module. Jeder Treffer ist ein Fehler.
#
# Bestandteil der Definition-of-Done jeder Phase. Exit 1 bei Treffern.
# ---------------------------------------------------------------------------
set -uo pipefail

cd "$(dirname "$0")/.."

# Pfade, die per Definition Altkennzeichen benennen duerfen. Sie sind allesamt
# Governance- oder Werkzeugdateien und werden nicht ausgeliefert:
#   reference/               -> Arbeitsmaterial, nicht versioniert (.gitignore)
#   docs/                    -> Analyse und Abgrenzung muessen benennen, was entfaellt
#   CLAUDE.md                -> fuehrt die Ausschlussliste selbst
#   scripts/marken-scan.sh   -> dieses Skript
#   scripts/analyse-referenz.sh -> Analysewerkzeug fuer die Referenz
EXCLUDE=(--glob '!reference/**' --glob '!docs/**' --glob '!CLAUDE.md'
         --glob '!scripts/marken-scan.sh' --glob '!scripts/analyse-referenz.sh'
         --glob '!.git/**' --glob '!node_modules/**')

# Altmarken des Referenzunternehmens und der Referenz-Anwendung.
MARKEN='engfer|engferundpartner|e&p ?world|ep-?world|epworld|epimmobilien'

# Fremdes Supabase-Projekt der Referenz (eu-west-1) — darf nie referenziert werden.
FREMD='yazwkzzjiquprtjpurur'

# Module, die laut Abschnitt 2 ersatzlos entfallen.
# onOffice steht seit docs/SCOPE.md (03.09.2026) als Connector im Scope und
# deshalb nicht mehr hier. Kennungen oder Zugangsdaten der Referenz-Instanz
# bleiben verboten — sie fallen unter die Altmarken oben.
ENTFALLEN='onedrive|kundenportal|bewerbertest|bewerber_einladungen|shop-?tv|yodeck|qonto|vivid'

fehler=0

pruefe() {
  local titel="$1" muster="$2"
  local treffer
  treffer="$(rg -i --line-number "${EXCLUDE[@]}" -- "$muster" . 2>/dev/null || true)"
  if [[ -n "$treffer" ]]; then
    printf '\n[FEHLER] %s\n%s\n' "$titel" "$treffer"
    fehler=1
  else
    printf '[ok] %s\n' "$titel"
  fi
}

echo "=== Marken-Scan ImmoOffice.ai ==="
pruefe "Keine Altmarken des Referenzunternehmens" "$MARKEN"
pruefe "Kein Verweis auf fremdes Supabase-Projekt" "$FREMD"
pruefe "Keine entfallenen Module" "$ENTFALLEN"

# Zusaetzlich: keine echten Geheimnisse im Repository.
pruefe "Keine Supabase-Service-Keys" 'service_role.{0,40}ey[A-Za-z0-9_-]{20,}'
pruefe "Keine Stripe-Live-Schluessel" 'sk_live_[A-Za-z0-9]{16,}'
pruefe "Keine OpenAI-Schluessel" 'sk-[A-Za-z0-9]{32,}'

echo
if [[ $fehler -eq 0 ]]; then
  echo "Ergebnis: sauber — keine Treffer."
else
  echo "Ergebnis: Treffer gefunden. Bitte bereinigen."
fi
exit $fehler
