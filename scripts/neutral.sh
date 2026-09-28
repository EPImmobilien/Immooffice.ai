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
# die Abgrenzung selbst beschreiben: docs/, CLAUDE.md, dieses Skript, die
# beiden Neutralisierungsskripte und der Test, der ihr Ergebnis prueft.
# reference/ ist nicht versioniert und ebenfalls aus.
set -uo pipefail
cd "$(dirname "$0")/.."

AUS=(--glob '!reference/**' --glob '!docs/**' --glob '!CLAUDE.md'
     --glob '!scripts/neutral.sh' --glob '!scripts/neutralisieren.py'
     --glob '!scripts/neutralisieren-funktionen.py'
     --glob '!tests/funktionen-unveraendert.py'
     --glob '!scripts/oberflaeche-zerlegen.py' --glob '!scripts/bauen.py'
     --glob '!scripts/nebenseiten.py'
     --glob '!scripts/check.sh'
     --glob '!scripts/analyse-referenz.sh'
     --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**')

# Kennzeichen des Referenzunternehmens und seiner Anwendung.
# ep-immobilien fehlte bis zum 28.09.2026: das Muster verlangte entweder ein
# kaufmaennisches Und oder gar kein Trennzeichen. Der Slug lag neunmal im
# Quelltext. Deshalb jetzt [-_ ]? an jeder Fuge.
MARKEN='engfer|engferundpartner|e ?& ?p ?[-_ ]?immobilien|e ?& ?p ?[-_ ]?world|ep[-_ ]?world|epworld|ep[-_ ]?immobilien|epimmobilien'
# Personen-, Anschrift- und Ortsangaben der Referenz, die in Standardwerten
# steckten. Sie stehen hier BASE64-kodiert, nicht im Klartext: eine Datei, die
# ein Kennzeichen sucht, darf es nicht selbst lesbar enthalten (CLAUDE.md,
# Abschnitt Abgrenzung). docs/NEUTRALITAET.md sieht dafuer eine unversionierte
# Musterdatei vor — die aber auf einem frischen Klon fehlt und das Gate damit
# still durchwinkt. Kodiert ist beides erfuellt: nichts lesbar, und das Gate
# greift ueberall.
#
# Die Muster fuehren auch die \uXXXX-Schreibweise der Umlaute mit. Der
# Quelltext der Vorlage legt Umlaute stellenweise so ab, und genau dahinter
# hatte sich die Bueroanschrift der Referenz bis zum 28.09.2026 versteckt.
STAMM="$(printf %s 'dijDtnxcXHUwMGY2fG9lKWdlbnRlaWNofEhSQjE2NTk4fERFMzcwMTAwMDc4fERFNzQxMDAxMDEyMzYwODU5Njk0Mjl8UU5UT0RFQjJYWFh8MDc5LzEwOC8wMDkwMHwwMzgxWyAvLi1dPzM2WyAvLi1dPzc3WyAvLi1dPzk5WyAvLi1dPzg4fFwrPzQ5WyAtXT8zODFbIC1dPzM2Nzc5OTg=' | base64 -d)"
# Standorte der Referenz. Getrennt gefuehrt, weil sie nur im Produktcode ein
# Fehler sind: docs/ und die Neutralisierungsskripte muessen sie benennen
# duerfen, und die stehen ohnehin in AUS.
ORTE="$(printf %s 'XGJyb3N0b2NrfFxic2Nod2VyaW58d2FybmVtKMO8fFxcdTAwZmN8dWUpbmRlfFxiMTgwNTVcYnxcYjE4MDU3XGJ8XGIxOTA1NVxi' | base64 -d)"
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
  # ist kein Aufruf. Der Filter muss am ANFANG des Zeileninhalts greifen —
  # rg liefert "pfad:nummer:inhalt", und ein unverankertes ':[ ]*#' trifft
  # jedes ": #" und jedes "://" mitten im Text. Bis zum 28.09.2026 fiel
  # dadurch jede Zeile mit einer URL oder einem Hashtag aus der Pruefung,
  # darunter drei Zeilen mit dem Marken-Hashtag der Referenz.
  treffer="$(rg -i --line-number "${AUS[@]}" -- "$muster" "${pfade[@]}" 2>/dev/null \
             | rg -v '^[^:]*:[0-9]+:[[:space:]]*(--|#|//|\*)' || true)"
  if [[ -n "$treffer" ]]; then
    printf '\n[FEHLER] %s\n%s\n' "$titel" "$treffer"
    fehler=1
  else
    printf '[ok] %s\n' "$titel"
  fi
}

# Wie pruefe, aber ohne -i. Fuer Muster, bei denen die Schreibweise
# entscheidet: der Vorsatz EP_ ist die Abkuerzung der Referenz und muss weg,
# das kleingeschriebene ep_ ist der Bus-Name und bleibt (docs/NEUTRALITAET.md
# Abschnitt 3 nimmt ihn begruendet aus).
pruefe_genau() {
  local titel="$1" muster="$2" treffer
  shift 2
  local pfade=("$@"); [[ ${#pfade[@]} -eq 0 ]] && pfade=(.)
  treffer="$(rg --line-number "${AUS[@]}" -- "$muster" "${pfade[@]}" 2>/dev/null \
             | rg -v '^[^:]*:[0-9]+:[[:space:]]*(--|#|//|\*)' || true)"
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
pruefe_genau "Kein Vorsatz EP_ in Bezeichnern" '\bEP_[A-Z]'
# Nur pruefen, was auch versioniert wird. src/ entsteht beim Bauen aus
# reference/ und ist derzeit ignoriert (siehe .gitignore); ein unversioniertes
# Arbeitsergebnis darf das Gate weder retten noch reissen. Sobald die Datei
# im Repository liegt, greift die Pruefung von selbst wieder.
vorhandene=()
for p in "${ENTFALLEN_PFADE[@]}"; do
  [[ -e "$p" ]] || continue
  git check-ignore -q "$p" 2>/dev/null && continue
  vorhandene+=("$p")
done
if [[ ${#vorhandene[@]} -gt 0 ]]; then
  pruefe "Keine in Phase 1.4 gestrichenen Dienste" "$ENTFALLEN" "${vorhandene[@]}"
  # Standorte der Referenz: nur im Produktcode ein Fehler. Sie steckten dort
  # als Rueckfallwerte ("firma_slug || ..."), als Schluessel einer
  # Standorttabelle und als Beispiele in KI-Anweisungen.
  pruefe "Keine Standorte der Referenz" "$ORTE" "${vorhandene[@]}"
else
  echo "[ok] Keine in Phase 1.4 gestrichenen Dienste (noch kein Anwendungscode)"
  echo "[ok] Keine Standorte der Referenz (noch kein Anwendungscode)"
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
