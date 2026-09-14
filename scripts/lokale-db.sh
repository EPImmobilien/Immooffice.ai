#!/usr/bin/env bash
#
# Lokale Postgres-Instanz fuer Migrationen und SQL-Tests.
#
# Warum ueberhaupt: Das Projekt hat keine Verbindung zur Supabase-Datenbank
# (der Ausgangsproxy laesst den Datenbank-Port nicht durch, eine Supabase-CLI
# gibt es nicht). Ohne lokale Instanz waere jede Migration nur am lebenden
# Projekt pruefbar — und damit nicht pruefbar, sondern angewendet.
#
#   scripts/lokale-db.sh start     Cluster anlegen/starten, Supabase nachbauen
#   scripts/lokale-db.sh neu       Cluster wegwerfen und frisch aufsetzen
#   scripts/lokale-db.sh psql ...  psql gegen die Instanz
#   scripts/lokale-db.sh datei X   SQL-Datei einspielen, Abbruch bei Fehler
#   scripts/lokale-db.sh migrieren supabase/migrations/*.sql der Reihe nach
#   scripts/lokale-db.sh stop
#
# Postgres laeuft nicht als root. Der Cluster gehoert dem Systembenutzer
# `postgres`, deshalb `runuser`.
set -euo pipefail

BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
# Der Cluster liegt absichtlich NICHT im Arbeitsverzeichnis der Sitzung: der
# Postgres-Prozess laeuft als Systembenutzer `postgres`, und dessen Pfad dorthin
# ist nicht begehbar. Ueber LOKALE_DB umstellbar — das Zielverzeichnis muss fuer
# `postgres` erreichbar sein.
BASIS=${LOKALE_DB:-/var/tmp/immooffice-db}
DATEN=$BASIS/data
SOCKET=$BASIS
PROJEKT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

psql_() { "$BIN/psql" -h "$SOCKET" -U postgres -v ON_ERROR_STOP=1 "$@"; }

# pg_ctl weigert sich als root, das Datenverzeichnis anzufassen — auch fuer
# eine Statusabfrage. Deshalb auch hier `runuser`.
laeuft() { runuser -u postgres -- "$BIN/pg_ctl" -D "$DATEN" status >/dev/null 2>&1; }

anlegen() {
  mkdir -p "$BASIS"
  chown postgres:postgres "$BASIS"
  # Der Socket liegt unter $BASIS; jedes Verzeichnis darueber muss begehbar sein.
  local pfad=$BASIS
  while [ "$pfad" != "/" ]; do chmod o+x "$pfad" 2>/dev/null || true; pfad=$(dirname "$pfad"); done
  if ! runuser -u postgres -- test -w "$BASIS"; then
    echo "postgres kommt nicht an $BASIS — anderes Verzeichnis ueber LOKALE_DB setzen" >&2
    exit 1
  fi
  runuser -u postgres -- "$BIN/initdb" -D "$DATEN" -U postgres -E UTF8 \
    --locale=C -A trust >"$BASIS/initdb.log" 2>&1
}

starten() {
  [ -d "$DATEN" ] || anlegen
  if laeuft; then return 0; fi
  runuser -u postgres -- "$BIN/pg_ctl" -D "$DATEN" -l "$BASIS/pg.log" \
    -o "-k $SOCKET -c listen_addresses='' -c log_min_messages=warning" -w start >/dev/null
}

nachbauen() {
  psql_ -q -f "$PROJEKT/tests/supabase-nachbau.sql" >/dev/null
}

case "${1:-start}" in
  start)
    starten; nachbauen
    echo "bereit: $SOCKET"
    ;;
  neu)
    if laeuft; then
      runuser -u postgres -- "$BIN/pg_ctl" -D "$DATEN" -m immediate -w stop >/dev/null
    fi
    rm -rf "$DATEN"
    starten; nachbauen
    echo "frisch: $SOCKET"
    ;;
  stop)
    if laeuft; then
      runuser -u postgres -- "$BIN/pg_ctl" -D "$DATEN" -m fast -w stop >/dev/null
    fi
    echo gestoppt
    ;;
  psql)
    shift; psql_ "$@"
    ;;
  datei)
    shift; psql_ -q -f "$1"
    ;;
  migrieren)
    starten
    for datei in "$PROJEKT"/supabase/migrations/*.sql; do
      printf '%-70s' "$(basename "$datei")"
      if psql_ -q -f "$datei" >"$BASIS/letzte.log" 2>&1; then
        echo ok
      else
        echo FEHLER
        sed -n '1,40p' "$BASIS/letzte.log"
        exit 1
      fi
    done
    ;;
  *)
    echo "unbekannt: $1" >&2; exit 2
    ;;
esac
