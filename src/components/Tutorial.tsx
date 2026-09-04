"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { tutorialGesehen } from "@/server/arbeitsmittel-aktionen";

export interface TutorialSchritt { id: string; ziel: string | null; titel: string; text: string }

/**
 * Tutorial beim ersten Anmelden (Referenz „Tutorial/Erstlogin"): fuehrt
 * Schritt fuer Schritt ueber die Startseite; das Ziel wird in den Blick
 * gescrollt und hervorgehoben. „Ueberspringen" und „Fertig" merken den Stand
 * am eigenen Konto; ein Neustart ist ueber die Startseite moeglich.
 */
export function Tutorial({ schritte, starten }: { schritte: TutorialSchritt[]; starten: boolean }) {
  const [offen, setOffen] = useState(starten);
  const [i, setI] = useState(0);
  const schritt = schritte[i];

  useEffect(() => {
    if (!offen || !schritt) return;
    const vorher = document.querySelectorAll<HTMLElement>("[data-tutorial-aktiv]");
    vorher.forEach((el) => { el.removeAttribute("data-tutorial-aktiv"); el.style.outline = ""; el.style.outlineOffset = ""; });
    if (schritt.ziel) {
      const el = document.querySelector<HTMLElement>(`[data-tutorial="${schritt.ziel}"]`);
      if (el) {
        el.setAttribute("data-tutorial-aktiv", "1");
        el.style.outline = "3px solid var(--akzent, #B5934F)";
        el.style.outlineOffset = "4px";
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    return () => { document.querySelectorAll<HTMLElement>("[data-tutorial-aktiv]").forEach((el) => { el.removeAttribute("data-tutorial-aktiv"); el.style.outline = ""; el.style.outlineOffset = ""; }); };
  }, [offen, schritt]);

  if (!offen || !schritt) return null;
  const letzter = i === schritte.length - 1;
  return (
    <div role="dialog" aria-labelledby="tutorial-titel" className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:bottom-6">
      <div className="w-full max-w-xl rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5 shadow-xl">
        <p className="text-[11px] uppercase tracking-wide text-gedaempft">Rundgang · Schritt {i + 1} von {schritte.length}</p>
        <h2 id="tutorial-titel" className="mt-1 text-base font-semibold text-text">{schritt.titel}</h2>
        <p className="mt-1 text-[13px] text-text">{schritt.text}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {i > 0 && <Button type="button" variante="leise" groesse="klein" onClick={() => setI(i - 1)}>Zurück</Button>}
          {!letzter && <Button type="button" groesse="klein" onClick={() => setI(i + 1)}>Weiter</Button>}
          <form action={tutorialGesehen} onSubmit={() => setOffen(false)} className="contents">
            <Button type="submit" variante={letzter ? "primaer" : "leise"} groesse="klein">{letzter ? "Fertig" : "Überspringen"}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
