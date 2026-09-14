#!/usr/bin/env bash
#
# Neutralitaets-Gate nach docs/NEUTRALITAET.md.
#
# Prueft das Repository auf Kennzeichen des Referenzunternehmens, auf Verweise
# auf dessen Supabase-Projekt, auf die in Phase 1.4 gestrichenen Fremddienste
# und auf Schluessel im Klartext. Jeder Treffer ist ein Fehler.
#
# Bedingung fuer jeden Commit (Teil von `npm run check`).
#
# Nicht geprueft werden Pfade, die Altkennzeichen benennen MUESSEN, weil sie
# die Abgrenzung selbst beschreiben: docs/, CLAUDE.md, dieses Skript und das
# Neutralisierungsskript. reference/ ist nicht versioniert und ebenfalls aus.
set -uo pipefail
cd "$(dirname "$0")/.."

AUS=(--glob '!reference/**' --glob '!docs/**' --glob '!CLAUDE.md'
     --glob '!scripts/neutral.sh' --glob '!scripts/neutralisieren.py'
     --glob '!scripts/analyse-referenz.sh'
     --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**')

# Kennzeichen des Referenzunternehmens und seiner Anwendung.
MARKEN='engfer|engferundpartner|e&p ?world|e&p ?immobilien|ep-?world|epworld|epimmobilien'
# Personen- und Ortsangaben der Referenz, die in Standardwerten steckten.
STAMM='voegenteich|vögenteich|HRB16598|DE370100078|DE74100101236085969429|QNTODEB2XXX|079/108/00900'
# Fremdes Supabase-Projekt.
FREMD='yazwkzzjiquprtjpurur'
# Dienste, die Phase 1.4 des Auftrags ersatzlos streicht. Geprueft wird nur
# der Code, der sie aufrufen wuerde — Oberflaeche und Edge Functions. NICHT
# das Schema: Phase 9 verbietet das Entfernen von Tabellen und Spalten, und
# deshalb bleiben ein Pruefwert 'sipgate' in vermerke_quelle_check und die
# Spalte shoptv_veroeffentlichen stehen. Ein Datenmodell, das einen Wert
# zulaesst, ruft noch keinen Dienst auf.
ENTFALLEN='sipgate|yodeck|shop-?tv|sprengnetter'
ENTFALLEN_PFADE=(src supabase/functions index.html)

fehler=0
pruefe() {
  local titel="$1" muster="$2" treffer
  shift 2
  local pfade=("$@"); [[ ${#pfade[@]} -eq 0 ]] && pfade=(.)
  # Kommentarzeilen zaehlen nicht: eine Zeile, die die Streichung erklaert,
  # ist kein Aufruf.
  treffer="$(rg -i --line-number "${AUS[@]}" -- "$muster" "${pfade[@]}" 2>/dev/null \
             | rg -v ':[[:space:]]*(--|#|//|\*)' || true)"
  if [[ -n "$treffer" ]]; then
    printf '\n[FEHLER] %s\n%s\n' "$titel" "$treffer"
    fehler=1
  else
    printf '[ok] %s\n' "$titel"
  fi
}

echo "=== Neutralitaets-Gate ==="
pruefe "Keine Kennzeichen des Referenzunternehmens" "$MARKEN"
pruefe "Keine Stammdaten des Referenzunternehmens"  "$STAMM"
pruefe "Kein Verweis auf das fremde Supabase-Projekt" "$FREMD"
vorhandene=()
for p in "${ENTFALLEN_PFADE[@]}"; do [[ -e "$p" ]] && vorhandene+=("$p"); done
if [[ ${#vorhandene[@]} -gt 0 ]]; then
  pruefe "Keine in Phase 1.4 gestrichenen Dienste" "$ENTFALLEN" "${vorhandene[@]}"
else
  echo "[ok] Keine in Phase 1.4 gestrichenen Dienste (noch kein Anwendungscode)"
fi

# Schluessel und Geheimnisse.
#
# Ausnahme netlify.toml: der oeffentliche anon-Schluessel des EIGENEN Projekts
# steht dort mit Absicht und muss dort stehen — der Browser braucht ihn, und
# Netlify bekommt ihn sonst nicht in den Build. Er ist kein Geheimnis. Jeder
# andere Schluessel an jeder anderen Stelle ist ein Fehler, und ein
# service_role-Schluessel auch in netlify.toml.
pruefe "Kein Supabase-Schluessel im Klartext" 'ey[A-Za-z0-9_-]{30,}\.ey[A-Za-z0-9_-]{30,}' \
  $(rg --files "${AUS[@]}" --glob '!netlify.toml' . 2>/dev/null | tr '\n' ' ')
pruefe "Kein service_role-Schluessel" 'service_role.{0,80}ey[A-Za-z0-9_-]{30,}\.ey[A-Za-z0-9_-]{30,}'
pruefe "Keine Stripe-Live-Schluessel" 'sk_live_[A-Za-z0-9]{16,}'
pruefe "Keine OpenAI-Schluessel" 'sk-[A-Za-z0-9]{32,}'

echo
if [[ $fehler -eq 0 ]]; then
  echo "Ergebnis: sauber."
else
  echo "Ergebnis: Treffer vorhanden — Commit nicht zulaessig."
fi
exit $fehler
