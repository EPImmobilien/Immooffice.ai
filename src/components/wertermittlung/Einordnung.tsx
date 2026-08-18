"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { VERFAHREN, type Verfahren } from "@/lib/wertermittlung";
import { einordnungSpeichern } from "@/server/wertermittlung-aktionen";

/**
 * Fachliche Einordnung durch den Nutzer.
 *
 * Hier trifft der Makler die Entscheidung, die die Software ihm ausdruecklich
 * NICHT abnimmt: welches Verfahren bei diesem Objekt traegt. Ein gewichteter
 * Durchschnitt ueber drei Verfahren waere bequem und fachlich falsch — bei
 * einer selbstgenutzten Wohnung fuehrt der Vergleichswert, bei einem Zinshaus
 * der Ertragswert.
 */
export function Einordnung({
  wertermittlungId,
  fuehrend,
  notiz,
  darfAendern,
}: {
  wertermittlungId: string;
  fuehrend: Verfahren | null;
  notiz: string | null;
  darfAendern: boolean;
}) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const e = await einordnungSpeichern(daten);
      if (e.fehler) setMeldung({ ton: "fehler", text: e.fehler });
      else if (e.hinweis) setMeldung({ ton: "erfolg", text: e.hinweis });
    });
  }

  return (
    <form
      action={absenden}
      className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5"
    >
      <input type="hidden" name="wertermittlung_id" value={wertermittlungId} />

      <div>
        <h2 className="text-[15px] font-semibold text-text">Ihre Einordnung</h2>
        <p className="mt-0.5 text-[12.5px] text-gedaempft">
          Welches Verfahren bei diesem Objekt trägt, ist eine fachliche
          Entscheidung. ImmoOffice.ai trifft sie nicht und bildet auch keinen
          Durchschnitt über die drei Ergebnisse.
        </p>
      </div>

      <Feld beschriftung="Führendes Verfahren" id="e-fuehrend">
        <Auswahl name="fuehrendes_verfahren" defaultValue={fuehrend ?? ""}>
          <option value="">Noch nicht festgelegt</option>
          {Object.entries(VERFAHREN).map(([wert, name]) => (
            <option key={wert} value={wert}>
              {name}
            </option>
          ))}
        </Auswahl>
      </Feld>

      <Feld
        beschriftung="Begründung und Anmerkungen"
        id="e-notiz"
        hinweis="Woher die Ansätze stammen und warum dieses Verfahren trägt"
      >
        <Textfeld name="notiz" rows={4} defaultValue={notiz ?? ""} />
      </Feld>

      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      {darfAendern && (
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Speichert …" : "Einordnung speichern"}
        </Button>
      )}
    </form>
  );
}
