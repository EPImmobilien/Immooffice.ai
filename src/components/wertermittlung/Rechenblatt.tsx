"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { euro, zahl as zahlFormat } from "@/lib/format";
import type { Ergebnis, Schritt, Verfahren } from "@/lib/wertermittlung";
import { ansaetzeSpeichern } from "@/server/wertermittlung-aktionen";

/**
 * Ein Rechenblatt: Ansaetze links eingeben, Rechenweg rechts mitlesen.
 *
 * Der Rechenweg steht bewusst vollstaendig da und nicht hinter einem
 * Aufklapper. Der Master-Prompt verlangt ausdruecklich keine Blackbox — und wer
 * das Ergebnis beim Eigentuemer vertreten soll, muss jeden Schritt sehen, ohne
 * danach zu suchen.
 *
 * Angezeigt wird der Stand, wie er GESPEICHERT ist. Das Ergebnis rechnet der
 * Server aus denselben Ansaetzen neu; eine zweite Rechnung im Browser waere
 * eine zweite Wahrheit, die von der ersten abweichen kann.
 */

function Zeile({ schritt }: { schritt: Schritt }) {
  const wert =
    schritt.einheit === "faktor"
      ? zahlFormat(schritt.wert)
      : schritt.einheit === "eur_qm"
        ? `${euro(schritt.wert)} / m²`
        : euro(schritt.wert);

  return (
    <div className="border-b border-linie py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] text-text">{schritt.bezeichnung}</span>
        <span className="zahl shrink-0 text-[13px] text-text">{wert}</span>
      </div>
      {schritt.erlaeuterung && (
        <p className="mt-0.5 text-[12px] text-gedaempft">{schritt.erlaeuterung}</p>
      )}
    </div>
  );
}

export function Rechenblatt({
  wertermittlungId,
  verfahren,
  titel,
  grundlage,
  ergebnis,
  darfAendern,
  children,
}: {
  wertermittlungId: string;
  verfahren: Verfahren;
  titel: string;
  /** Kurze Einordnung, wofür das Verfahren taugt. */
  grundlage: string;
  ergebnis: Ergebnis;
  darfAendern: boolean;
  /** Die Eingabefelder des Verfahrens. */
  children: React.ReactNode;
}) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const e = await ansaetzeSpeichern(daten);
      if (e.fehler) setMeldung({ ton: "fehler", text: e.fehler });
      else if (e.hinweis) setMeldung({ ton: "erfolg", text: e.hinweis });
    });
  }

  return (
    <div className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-text">{titel}</h2>
        <p className="mt-0.5 text-[12.5px] text-gedaempft">{grundlage}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={absenden} className="space-y-4">
          <input type="hidden" name="wertermittlung_id" value={wertermittlungId} />
          <input type="hidden" name="verfahren" value={verfahren} />

          {children}

          {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

          {darfAendern && (
            <Button type="submit" groesse="klein" disabled={laeuft}>
              {laeuft ? "Speichert …" : "Ansätze speichern"}
            </Button>
          )}
        </form>

        <div className="rounded-[var(--radius)] border border-linie bg-hintergrund p-4">
          {ergebnis.wert === null ? (
            <div>
              <p className="text-[13px] font-medium text-text">
                Noch nicht rechenbar
              </p>
              <p className="mt-1 text-[12.5px] text-gedaempft">
                Es fehlt: {ergebnis.fehlend.join(", ")}.
              </p>
              <p className="mt-2 text-[12px] text-gedaempft">
                Fehlende Ansätze werden nicht geschätzt. Was hier steht, haben
                Sie eingetragen.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3">
                {ergebnis.schritte.map((schritt, i) => (
                  <Zeile key={i} schritt={schritt} />
                ))}
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t-2 border-primaer pt-2">
                <span className="text-[13px] font-semibold text-text">
                  Ergebnis
                </span>
                <span className="zahl text-[18px] font-semibold text-text">
                  {euro(ergebnis.wert)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Zahlenfeld mit Einheit. */
export function Zahlenfeld({
  name,
  beschriftung,
  einheit,
  wert,
  hinweis,
  schritt = "0.01",
}: {
  name: string;
  beschriftung: string;
  einheit?: string;
  wert: number | null;
  hinweis?: string;
  schritt?: string;
}) {
  return (
    <Feld
      beschriftung={einheit ? `${beschriftung} (${einheit})` : beschriftung}
      id={`f-${name}`}
      {...(hinweis ? { hinweis } : {})}
    >
      <Eingabe
        type="number"
        step={schritt}
        name={name}
        defaultValue={wert ?? ""}
      />
    </Feld>
  );
}
