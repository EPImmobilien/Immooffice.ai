#!/usr/bin/env python3
"""Erzeugt die Migration, die die sechs Social-Vorlagen einspielt.

Dasselbe Verfahren wie bei scripts/expose-systemvorlagen.py und aus
demselben Grund: die Vorlagen liegen als JSON in
packages/expose-renderer/vorlagen/, und in der Datenbank muessen sie auch
stehen, sonst findet die Oberflaeche nichts. Beides von Hand zu pflegen
hiesse, zwei Fassungen derselben Vorlage zu haben — und die zweite waere
irgendwann die aeltere.

`--pruefen` baut die Migration neu und vergleicht; das Tor in npm run check
sagt, wenn eine Vorlage geaendert wurde und die Migration noch die alte
Fassung einspielt.

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
                    "20261006270000_fork_56_social_vorlagen.sql")

# Erzeugt mit uuidgen, hier festgeschrieben.
KENNUNG = {
    "social-raster-feed":     "a7c21d58-3e44-4f90-9b61-2d8e7c015a01",
    "social-raster-story":    "a7c21d58-3e44-4f90-9b61-2d8e7c015a02",
    "social-signature-feed":  "a7c21d58-3e44-4f90-9b61-2d8e7c015a03",
    "social-signature-story": "a7c21d58-3e44-4f90-9b61-2d8e7c015a04",
    "social-studio-feed":     "a7c21d58-3e44-4f90-9b61-2d8e7c015a05",
    "social-studio-story":    "a7c21d58-3e44-4f90-9b61-2d8e7c015a06",
    "social-raster-quadrat":    "a7c21d58-3e44-4f90-9b61-2d8e7c015a07",
    "social-signature-quadrat": "a7c21d58-3e44-4f90-9b61-2d8e7c015a08",
    "social-studio-quadrat":    "a7c21d58-3e44-4f90-9b61-2d8e7c015a09",
}

KOPF = """\
-- ===========================================================================
-- fork_56 — die sechs Social-Media-Vorlagen
--
-- ERZEUGT von scripts/social-systemvorlagen.py aus
-- packages/expose-renderer/vorlagen/social-*.json. Nicht von Hand aendern:
-- wer eine Vorlage aendern will, aendert scripts/social-vorlagen.py, laesst
-- beide Skripte laufen und spielt die Migration ein.
--
-- Sie liegen in derselben Tabelle wie die Exposé-Vorlagen, weil es dasselbe
-- Dokumentformat ist und derselbe Renderer sie zeichnet. Unterschieden
-- werden sie ueber die neue Spalte `art`: die Vorlagenwahl des Exposés
-- zeigt `art = 'expose'`, das Marketing-Modul `art = 'social'`. Zwei
-- Tabellen fuer dasselbe Format waeren zwei Stellen, an denen derselbe
-- Fehler zu beheben waere.
--
-- mandant_id bleibt null: Systemvorlagen sind fuer alle lesbar und ueber
-- RLS fuer niemanden schreibbar (fork_37). Eingespielt werden sie von der
-- Migration, also vom Dienstschluessel.
-- ===========================================================================

alter table public.expose_vorlagen
  add column if not exists art text not null default 'expose';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'expose_vorlagen_art_check') then
    alter table public.expose_vorlagen
      add constraint expose_vorlagen_art_check check (art in ('expose', 'social'));
  end if;
end $$;

comment on column public.expose_vorlagen.art is
  'expose | social — dasselbe Dokumentformat, zwei Verwendungen. Die '
  'Vorlagenwahl filtert danach.';

create index if not exists expose_vorlagen_art_idx
  on public.expose_vorlagen (art);

"""

EINTRAG = """\
insert into public.expose_vorlagen
  (id, mandant_id, name, beschreibung, basis, art, dokument, version, ist_standard)
values (
  '{kennung}', null, {name}, {beschreibung}, '{basis}', 'social',
  {dokument}::jsonb, 1, false)
on conflict (id) do update
  set name         = excluded.name,
      beschreibung = excluded.beschreibung,
      basis        = excluded.basis,
      art          = 'social',
      dokument     = excluded.dokument,
      version      = public.expose_vorlagen.version + 1,
      geaendert_am = now();

"""

FUSS = """\
-- Kopien, die noch nie bearbeitet wurden, ziehen mit — dieselbe Regel wie
-- bei den Exposé-Vorlagen (fork_38). Ab version > 1 bleibt die Kopie
-- unangetastet: dann hat jemand daran gearbeitet.
update public.expose_vorlagen k
   set dokument = s.dokument,
       geaendert_am = now()
  from public.expose_vorlagen s
 where s.mandant_id is null
   and s.art = 'social'
   and k.mandant_id is not null
   and k.art = 'social'
   and k.basis = s.basis
   -- Beitrag (675 pt), Story (960 pt) und Quadrat (540 pt) tragen dieselbe
   -- Basis. Ohne die Hoehe zoege diese Anweisung eine Story auf einen Beitrag.
   and (k.dokument->'format'->>'hoehe') = (s.dokument->'format'->>'hoehe')
   and coalesce(k.version, 1) = 1
   and k.dokument is distinct from s.dokument;
"""


def zeichenkette(s):
    """SQL-Literal. Einfache Anfuehrungszeichen verdoppeln, mehr nicht."""
    return "'" + str(s).replace("'", "''") + "'"


def erzeugen():
    teile = [KOPF]
    for name in sorted(KENNUNG):
        pfad = os.path.join(VORLAGEN, f"{name}.json")
        with open(pfad, encoding="utf-8") as f:
            vorlage = json.load(f)
        kompakt = json.dumps(vorlage, separators=(",", ":"), ensure_ascii=False)
        teile.append(EINTRAG.format(
            kennung=KENNUNG[name],
            name=zeichenkette(vorlage.get("name", name)),
            beschreibung=zeichenkette(vorlage.get("beschreibung", "")),
            # `basis` ist die Handschrift — die Spalte laesst nur raster,
            # signature, studio und leer zu, und das soll so bleiben.
            # Beitrag und Story derselben Handschrift unterscheiden sich
            # dann nur noch im Format; das Nachziehen unten vergleicht
            # deshalb zusaetzlich die Hoehe.
            basis=name.split("-")[1],
            dokument=zeichenkette(kompakt),
        ))
    teile.append(FUSS)
    return "".join(teile)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pruefen", action="store_true")
    a = p.parse_args()
    neu = erzeugen()
    if a.pruefen:
        alt = ""
        if os.path.exists(ZIEL):
            with open(ZIEL, encoding="utf-8") as f:
                alt = f.read()
        if alt != neu:
            print("[FEHLER] Die Migration passt nicht zu den Vorlagen.")
            print("         python3 scripts/social-systemvorlagen.py laufen lassen.")
            return 1
        print(f"[ok] Die {len(KENNUNG)} Social-Vorlagen in der Migration stimmen "
              f"mit den JSON-Dateien ueberein.")
        return 0
    with open(ZIEL, "w", encoding="utf-8") as f:
        f.write(neu)
    print(f"{os.path.relpath(ZIEL, STAMM)} — {len(KENNUNG)} Vorlagen, "
          f"{len(neu) // 1024} KiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
