#!/usr/bin/env python3
"""Erzeugt die Migration, die die drei Systemvorlagen einspielt.

Die Vorlagen liegen als JSON in packages/expose-renderer/vorlagen/. In der
Datenbank muessen sie auch stehen, sonst findet die Edge Function nichts.
Beides von Hand zu pflegen hiesse, zwei Fassungen derselben Vorlage zu
haben — und die zweite waere irgendwann die aeltere.

Darum wird die Migration erzeugt. `--pruefen` baut sie neu und vergleicht;
das Tor in npm run check sagt, wenn eine Vorlage geaendert wurde und die
Migration noch die alte Fassung einspielt.

Die Kennungen sind fest. Eine Systemvorlage, die bei jedem Einspielen eine
neue Kennung bekaeme, verlore die Verbindung zu jedem Objekt, das sie
benutzt.
"""
import argparse
import json
import os
import sys

STAMM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VORLAGEN = os.path.join(STAMM, "packages", "expose-renderer", "vorlagen")
ZIEL = os.path.join(STAMM, "supabase", "migrations",
                    "20261005190100_fork_38_expose_systemvorlagen.sql")

# Feste Kennungen. Erzeugt mit uuidgen, hier festgeschrieben.
KENNUNG = {
    "raster":    "9f3b1c40-6d2e-4a51-8c77-1e5b0a4d2f10",
    "signature": "9f3b1c40-6d2e-4a51-8c77-1e5b0a4d2f11",
    "studio":    "9f3b1c40-6d2e-4a51-8c77-1e5b0a4d2f12",
}

KOPF = """\
-- ===========================================================================
-- fork_38 — die drei Systemvorlagen des Exposé-Baukastens
--
-- ERZEUGT von scripts/expose-systemvorlagen.py aus
-- packages/expose-renderer/vorlagen/*.json. Nicht von Hand aendern: wer
-- eine Vorlage aendern will, aendert die JSON-Datei und laesst das Skript
-- laufen. tests/expose-systemvorlagen.py haelt beides zusammen.
--
-- mandant_id bleibt null: Systemvorlagen sind fuer alle lesbar und ueber
-- RLS fuer niemanden schreibbar (siehe fork_37). Eingespielt werden sie
-- von der Migration, also vom Dienstschluessel.
--
-- Die Kennungen sind fest. Eine Systemvorlage, die bei jedem Einspielen
-- eine neue Kennung bekaeme, verlore die Verbindung zu jedem Objekt, das
-- sie benutzt.
-- ===========================================================================

"""

EINTRAG = """\
insert into public.expose_vorlagen
  (id, mandant_id, name, beschreibung, basis, dokument, version, ist_standard)
values (
  '{kennung}', null, {name}, {beschreibung}, '{basis}',
  {dokument}::jsonb, 1, false)
on conflict (id) do update
  set name         = excluded.name,
      beschreibung = excluded.beschreibung,
      basis        = excluded.basis,
      dokument     = excluded.dokument,
      version      = public.expose_vorlagen.version + 1,
      geaendert_am = now();

"""


def zeichenkette(s):
    """SQL-Literal. Einfache Anfuehrungszeichen verdoppeln, mehr nicht."""
    return "'" + str(s).replace("'", "''") + "'"


def erzeugen():
    teile = [KOPF]
    for basis in sorted(KENNUNG):
        pfad = os.path.join(VORLAGEN, f"{basis}.json")
        with open(pfad, encoding="utf-8") as f:
            vorlage = json.load(f)
        kompakt = json.dumps(vorlage, separators=(",", ":"), ensure_ascii=False,
                             sort_keys=False)
        teile.append(EINTRAG.format(
            kennung=KENNUNG[basis],
            name=zeichenkette(vorlage.get("name", basis)),
            beschreibung=zeichenkette(vorlage.get("beschreibung", "")),
            basis=basis,
            dokument=zeichenkette(kompakt),
        ))
    return "".join(teile)


NACHZIEHEN = """\
-- ---------------------------------------------------------------------------
-- Und die Kopien, die noch nie bearbeitet wurden.
--
-- Wer "Kopie anlegen" drueckt, bekommt das Dokument der Systemvorlage mit
-- version = 1. Solange niemand etwas daran geaendert hat, ist diese Kopie
-- genau die Systemvorlage unter einem anderen Namen — und soll deren
-- Korrekturen mitbekommen. Sonst traegt der Mandant die alten Fehler
-- weiter, ohne je davon zu erfahren.
--
-- Ab version > 1 bleibt die Kopie unangetastet: dann hat jemand im Editor
-- daran gearbeitet, und seine Arbeit zu ueberschreiben waere ein Verlust,
-- kein Dienst. Diese Mandanten muessen von Hand nachziehen; die
-- Systemvorlage steht daneben und laesst sich erneut kopieren.
-- ---------------------------------------------------------------------------

update public.expose_vorlagen k
   set dokument = s.dokument,
       geaendert_am = now()
  from public.expose_vorlagen s
 where s.mandant_id is null
   and k.mandant_id is not null
   and k.basis = s.basis
   and coalesce(k.version, 1) = 1
   and k.dokument is distinct from s.dokument;
"""


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pruefen", action="store_true",
                   help="nur vergleichen, nichts schreiben")
    p.add_argument("--stand", metavar="DATEI",
                   help="zusaetzlich eine Migration schreiben, die den "
                        "heutigen Stand auf ein bestehendes Projekt bringt "
                        "(Systemvorlagen und unbearbeitete Kopien)")
    a = p.parse_args()

    neu = erzeugen()
    if a.stand:
        ziel = os.path.join(STAMM, "supabase", "migrations", a.stand)
        with open(ziel, "w", encoding="utf-8") as f:
            f.write(neu.replace("fork_38 — die drei Systemvorlagen des Exposé-Baukastens",
                                "Stand der Systemvorlagen nachziehen")
                    + NACHZIEHEN)
        print(f"[ok] {os.path.relpath(ziel, STAMM)} geschrieben.")
    if not a.pruefen:
        with open(ZIEL, "w", encoding="utf-8") as f:
            f.write(neu)
        print(f"[ok] {os.path.relpath(ZIEL, STAMM)} — "
              f"{len(KENNUNG)} Vorlagen, {len(neu) // 1024} KiB.")
        return 0

    if not os.path.exists(ZIEL):
        print(f"  [FEHLER] {os.path.relpath(ZIEL, STAMM)} fehlt — "
              f"`python3 scripts/expose-systemvorlagen.py` ausfuehren.")
        return 1
    with open(ZIEL, encoding="utf-8") as f:
        alt = f.read()
    if alt != neu:
        print(f"  [FEHLER] {os.path.relpath(ZIEL, STAMM)} weicht von den "
              f"Vorlagen ab — eine Vorlage wurde geaendert, die Migration "
              f"spielt noch die alte Fassung ein.")
        print(f"  `python3 scripts/expose-systemvorlagen.py` ausfuehren.")
        return 1
    print(f"  [ok] Die Migration spielt genau die {len(KENNUNG)} Vorlagen ein, "
          f"die in packages/expose-renderer/vorlagen/ liegen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
