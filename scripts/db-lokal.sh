#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Migrationen und Datenbank-Nachweise lokal ausfuehren — ohne Supabase-CLI,
# ohne Docker, ohne Netz.
#
# Startet eine eigene Postgres-Instanz in einem Arbeitsverzeichnis, bildet die
# Supabase-Umgebung nach (scripts/db-lokal-shim.sql), spielt alle Migrationen
# in Versionsreihenfolge ein und laesst jede Datei unter supabase/tests/
# laufen. Exit 1, sobald eine Migration scheitert oder ein Nachweis
# FEHLGESCHLAGEN meldet.
#
# Aufruf:   scripts/db-lokal.sh            # alles
#           scripts/db-lokal.sh tests      # nur Nachweise (Instanz muss stehen)
#           scripts/db-lokal.sh stop       # Instanz beenden
#
# Voraussetzung: Postgres-Serverprogramme (initdb, pg_ctl, psql). Pfad ueber
# PGBIN setzen, falls nicht unter /usr/lib/postgresql/<version>/bin.
# Als root wird die Instanz unter einem eigenen Benutzer `pgtest` betrieben,
# weil Postgres sich weigert, als root zu laufen.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
BASIS="${DB_LOKAL_DIR:-/tmp/immooffice-db-lokal}"
PORT="${DB_LOKAL_PORT:-54329}"
DB="immooffice"
DATEN="$BASIS/daten"
LOG="$BASIS/postgres.log"

if [[ -z "$PGBIN" || ! -x "$PGBIN/initdb" ]]; then
  echo "Postgres-Serverprogramme nicht gefunden. PGBIN setzen." >&2
  exit 2
fi

# Als root: alles unter einem unprivilegierten Benutzer ausfuehren.
ALS=()
if [[ "$(id -u)" == "0" ]]; then
  id pgtest >/dev/null 2>&1 || useradd -m -s /bin/bash pgtest
  ALS=(runuser -u pgtest --)
fi

pg() { "${ALS[@]}" "$PGBIN/$1" "${@:2}"; }
sql() { pg psql -v ON_ERROR_STOP=1 -q -h "$BASIS" -p "$PORT" -U postgres "$@"; }

starten() {
  mkdir -p "$BASIS"
  [[ ${#ALS[@]} -gt 0 ]] && chown -R pgtest "$BASIS"
  if [[ ! -f "$DATEN/PG_VERSION" ]]; then
    pg initdb -D "$DATEN" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
  fi
  if ! pg pg_ctl -D "$DATEN" status >/dev/null 2>&1; then
    pg pg_ctl -D "$DATEN" -l "$LOG" -w \
      -o "-p $PORT -k $BASIS -c listen_addresses='' -c fsync=off" start >/dev/null
  fi
}

stoppen() {
  if [[ -f "$DATEN/PG_VERSION" ]] && pg pg_ctl -D "$DATEN" status >/dev/null 2>&1; then
    pg pg_ctl -D "$DATEN" -m fast stop >/dev/null
  fi
}

migrationen() {
  # Frische Datenbank je Lauf: Migrationen muessen auf leerem Grund laufen.
  sql -d postgres -c "drop database if exists $DB" >/dev/null
  sql -d postgres -c "create database $DB" >/dev/null
  sql -d "$DB" -f scripts/db-lokal-shim.sql >/dev/null

  local n=0
  for datei in $(ls supabase/migrations/*.sql | sort); do
    if ! sql -d "$DB" -f "$datei" >/dev/null; then
      echo "[FEHLER] Migration $(basename "$datei")" >&2
      exit 1
    fi
    n=$((n + 1))
  done
  echo "[ok] $n Migrationen eingespielt"
}

nachweise() {
  local fehler=0 gesamt=0 bestanden=0
  for datei in $(ls supabase/tests/*.sql | sort); do
    local ausgabe
    if ! ausgabe="$(sql -d "$DB" -f "$datei" 2>&1)"; then
      printf '[FEHLER] %s bricht ab:\n%s\n' "$(basename "$datei")" "$ausgabe" >&2
      fehler=1
      continue
    fi
    local b f
    b=$(grep -c "BESTANDEN" <<<"$ausgabe" || true)
    f=$(grep -c "FEHLGESCHLAGEN" <<<"$ausgabe" || true)
    gesamt=$((gesamt + b + f)); bestanden=$((bestanden + b))
    if [[ "$f" -gt 0 ]]; then
      printf '[FEHLER] %s: %s fehlgeschlagen\n%s\n' "$(basename "$datei")" "$f" \
        "$(grep "FEHLGESCHLAGEN" <<<"$ausgabe")" >&2
      fehler=1
    else
      printf '[ok] %s: %s bestanden\n' "$(basename "$datei")" "$b"
    fi
  done
  echo "Nachweise: $bestanden von $gesamt bestanden"
  return $fehler
}

case "${1:-alles}" in
  alles)
    starten
    trap stoppen EXIT
    migrationen
    nachweise
    ;;
  migrationen)
    starten; trap stoppen EXIT; migrationen ;;
  tests)
    starten; nachweise ;;
  stop)
    stoppen ;;
  *)
    echo "Unbekannter Befehl: $1" >&2; exit 2 ;;
esac
