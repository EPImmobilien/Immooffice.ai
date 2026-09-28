"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Marke } from "@/components/ui/Status";
import { TERMINARTEN, kontaktname, type Termin } from "@/lib/arbeitsmittel";
import { cn } from "@/lib/cn";
import { datum, uhrzeit } from "@/lib/format";
import { terminAbsagen } from "@/server/arbeitsmittel-aktionen";

/**
 * Liste von Terminen, nach Tagen gruppiert.
 *
 * Abgesagte Termine bleiben sichtbar, durchgestrichen. Sie zu verbergen waere
 * bequemer und wuerde genau die Information verschlucken, die man sucht: dass
 * der Termin einmal stand.
 */
export function Terminliste({
  termine,
  darfAendern,
  mitBezug = true,
}: {
  termine: Termin[];
  darfAendern: boolean;
  mitBezug?: boolean;
}) {
  if (termine.length === 0) {
    return <p className="text-[13px] text-gedaempft">Keine Termine eingetragen.</p>;
  }

  // Nach Tag gruppieren. Der Tag kommt aus der bereits formatierten Anzeige,
  // damit Gruppierung und Beschriftung nicht auseinanderlaufen koennen.
  const tage = new Map<string, Termin[]>();
  for (const termin of termine) {
    const tag = datum(termin.beginnt_am);
    const liste = tage.get(tag);
    if (liste) liste.push(termin);
    else tage.set(tag, [termin]);
  }

  return (
    <div className="space-y-4">
      {[...tage.entries()].map(([tag, liste]) => (
        <div key={tag}>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-gedaempft">
            {tag}
          </p>
          <ul className="divide-y divide-linie">
            {liste.map((termin) => {
              const abgesagt = termin.abgesagt_am !== null;
              const name = kontaktname(termin.kontakt);

              return (
                <li
                  key={termin.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 gap-3">
                    <span className="w-[86px] shrink-0 text-[13px] tabular-nums text-gedaempft">
                      {uhrzeit(termin.beginnt_am)}–{uhrzeit(termin.endet_am)}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-[14px]",
                            abgesagt ? "text-gedaempft line-through" : "text-text",
                          )}
                        >
                          {termin.titel}
                        </span>
                        <Marke>{TERMINARTEN[termin.art]}</Marke>
                        {abgesagt && <Marke ton="fehler">Abgesagt</Marke>}
                      </div>

                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-gedaempft">
                        {termin.ort && <span>{termin.ort}</span>}
                        {termin.zustaendig?.name && <span>· {termin.zustaendig.name}</span>}
                        {mitBezug && termin.objekt && (
                          <span>
                            ·{" "}
                            <Link
                              href={`/objekte/${termin.objekt_id}`}
                              className="underline decoration-linie-stark underline-offset-2 hover:decoration-akzent"
                            >
                              {termin.objekt.objektnummer} {termin.objekt.bezeichnung}
                            </Link>
                          </span>
                        )}
                        {mitBezug && name && <span>· {name}</span>}
                      </p>

                      {termin.notiz && (
                        <p className="mt-0.5 text-[12.5px] text-gedaempft">
                          {termin.notiz}
                        </p>
                      )}
                    </div>
                  </div>

                  {darfAendern && (
                    <form action={terminAbsagen} className="shrink-0">
                      <input type="hidden" name="termin_id" value={termin.id} />
                      <Button type="submit" variante="leise" groesse="klein">
                        {abgesagt ? "Wieder ansetzen" : "Absagen"}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
