"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Marke } from "@/components/ui/Status";
import {
  FRISTLAGE_BEZEICHNUNG,
  PRIORITAETEN,
  aufgabenSortieren,
  fristlage,
  kontaktname,
  type Aufgabe,
} from "@/lib/arbeitsmittel";
import { cn } from "@/lib/cn";
import { datum } from "@/lib/format";
import { aufgabeLoeschen, aufgabeUmschalten } from "@/server/arbeitsmittel-aktionen";

/**
 * Liste von Aufgaben.
 *
 * `heute` kommt von aussen. Eine Komponente, die den heutigen Tag selbst
 * ermittelt, laesst sich nicht pruefen und weicht zwischen Serverdarstellung
 * und Browser ab.
 */

const FRIST_TON: Record<
  ReturnType<typeof fristlage>,
  "fehler" | "warnung" | "neutral"
> = {
  ueberfaellig: "fehler",
  heute: "warnung",
  diese_woche: "neutral",
  spaeter: "neutral",
  ohne: "neutral",
};

export function Aufgabenliste({
  aufgaben,
  heute,
  darfAendern,
  darfLoeschen,
  mitBezug = true,
}: {
  aufgaben: Aufgabe[];
  heute: string;
  darfAendern: boolean;
  darfLoeschen: boolean;
  /** Auf der Objektseite ist der Bezug bekannt und wird nicht wiederholt. */
  mitBezug?: boolean;
}) {
  if (aufgaben.length === 0) {
    return <p className="text-[13px] text-gedaempft">Keine offenen Aufgaben.</p>;
  }

  const stichtag = new Date(heute);
  const sortiert = aufgabenSortieren(aufgaben);

  return (
    <ul className="divide-y divide-linie">
      {sortiert.map((aufgabe) => {
        const lage = fristlage(aufgabe.faellig_am, stichtag);
        const erledigt = aufgabe.erledigt_am !== null;
        const name = kontaktname(aufgabe.kontakt);

        return (
          <li key={aufgabe.id} className="flex items-start gap-3 py-2.5">
            {darfAendern ? (
              <form action={aufgabeUmschalten} className="mt-0.5 shrink-0">
                <input type="hidden" name="aufgabe_id" value={aufgabe.id} />
                <button
                  type="submit"
                  aria-label={erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
                  className={cn(
                    "flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors",
                    erledigt
                      ? "border-erfolg bg-erfolg text-erfolg-text"
                      : "border-linie-stark hover:border-akzent",
                  )}
                >
                  {erledigt && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                      <path
                        d="M2.5 6.5 5 9l4.5-5.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              </form>
            ) : (
              <span
                aria-hidden="true"
                className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border border-linie"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "text-[14px]",
                    erledigt ? "text-gedaempft line-through" : "text-text",
                  )}
                >
                  {aufgabe.titel}
                </span>

                {!erledigt && aufgabe.faellig_am && lage !== "spaeter" && (
                  <Marke ton={FRIST_TON[lage]}>{FRISTLAGE_BEZEICHNUNG[lage]}</Marke>
                )}
                {!erledigt && aufgabe.prioritaet === "hoch" && (
                  <Marke ton="akzent">{PRIORITAETEN.hoch}</Marke>
                )}
              </div>

              {aufgabe.beschreibung && (
                <p className="mt-0.5 text-[12.5px] text-gedaempft">
                  {aufgabe.beschreibung}
                </p>
              )}

              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-gedaempft">
                {aufgabe.faellig_am && <span>Fällig {datum(aufgabe.faellig_am)}</span>}
                {aufgabe.zustaendig?.name && <span>· {aufgabe.zustaendig.name}</span>}
                {mitBezug && aufgabe.objekt && (
                  <span>
                    ·{" "}
                    <Link
                      href={`/objekte/${aufgabe.objekt_id}`}
                      className="underline decoration-linie-stark underline-offset-2 hover:decoration-akzent"
                    >
                      {aufgabe.objekt.objektnummer} {aufgabe.objekt.bezeichnung}
                    </Link>
                  </span>
                )}
                {mitBezug && name && <span>· {name}</span>}
              </p>
            </div>

            {darfLoeschen && (
              <form action={aufgabeLoeschen} className="shrink-0">
                <input type="hidden" name="aufgabe_id" value={aufgabe.id} />
                <Button type="submit" variante="leise" groesse="klein">
                  Löschen
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
