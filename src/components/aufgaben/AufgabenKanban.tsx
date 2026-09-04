import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Marke } from "@/components/ui/Status";
import { AUFGABEN_STATUS, fristlage, FRISTLAGE_BEZEICHNUNG, kontaktname, PRIORITAETEN, type AufgabeErweitert, type AufgabenStatus } from "@/lib/arbeitsmittel";
import { datum } from "@/lib/format";
import { aufgabeStatus } from "@/server/arbeitsmittel-aktionen";

const SPALTEN: AufgabenStatus[] = ["offen", "laeuft", "wartet", "erledigt", "verworfen"];
const TON: Record<AufgabenStatus, "info" | "warnung" | "neutral" | "erfolg" | "fehler"> = { offen: "info", laeuft: "warnung", wartet: "neutral", erledigt: "erfolg", verworfen: "fehler" };

/** Kanban nach Status (Referenz „▦ Kanban"): Verschieben ueber die Schaltflaechen je Karte. */
export function AufgabenKanban({ aufgaben, heute, darfAendern }: { aufgaben: AufgabeErweitert[]; heute: string; darfAendern: boolean }) {
  const stichtag = new Date(heute);
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {SPALTEN.map((s) => {
        const inSpalte = aufgaben.filter((a) => a.status === s);
        return (
          <div key={s} className="w-72 shrink-0 rounded-[var(--radius-gross)] border border-linie bg-flaeche-gedaempft p-3">
            <p className="mb-2 text-[13px] font-semibold text-text">{AUFGABEN_STATUS[s]} <span className="font-normal text-gedaempft">{inSpalte.length}</span></p>
            <div className="space-y-2">
              {inSpalte.map((a) => {
                const lage = fristlage(a.faellig_am, stichtag);
                return (
                  <div key={a.id} className="rounded-[var(--radius)] border border-linie bg-flaeche p-2.5">
                    <Link href={`/aufgaben/${a.id}`} className="block text-[13px] font-medium text-text hover:underline">{a.titel}</Link>
                    <p className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-gedaempft">
                      {a.faellig_am && a.status !== "erledigt" && <Marke ton={lage === "ueberfaellig" ? "fehler" : lage === "heute" ? "warnung" : "neutral"}>{lage === "spaeter" ? datum(a.faellig_am) : FRISTLAGE_BEZEICHNUNG[lage]}</Marke>}
                      {a.prioritaet === "hoch" && <Marke ton="akzent">{PRIORITAETEN.hoch}</Marke>}
                      {a.tags.map((t) => <Marke key={t}>#{t}</Marke>)}
                      {a.zustaendig?.name && <span>· {a.zustaendig.name}</span>}
                      {a.objekt && <span>· {a.objekt.objektnummer}</span>}
                      {kontaktname(a.kontakt) && <span>· {kontaktname(a.kontakt)}</span>}
                    </p>
                    {darfAendern && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {SPALTEN.filter((z) => z !== s).map((z) => (
                          <form key={z} action={aufgabeStatus}>
                            <input type="hidden" name="aufgabe_id" value={a.id} />
                            <input type="hidden" name="status" value={z} />
                            <Button type="submit" variante="leise" groesse="klein" className="h-6 px-1.5 text-[11px]"><Marke ton={TON[z]}>{AUFGABEN_STATUS[z]}</Marke></Button>
                          </form>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
