"use client";

import { useState } from "react";

import { ChecklisteAnlegen } from "@/components/checklisten/ChecklisteAnlegen";
import { Auswahl, Feld } from "@/components/ui/Feld";
import type { Vorlage } from "@/lib/checklisten";

/** Objekt waehlen und Checkliste aus Vorlage starten (Startseite der Checklisten). */
export function ObjektChecklisteStart({ objekte, vorlagen }: { objekte: { id: string; objektnummer: string; bezeichnung: string }[]; vorlagen: Vorlage[] }) {
  const [objektId, setObjektId] = useState(objekte[0]?.id ?? "");
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <Feld id="cl-objekt" beschriftung="Objekt">
        <Auswahl value={objektId} onChange={(e) => setObjektId(e.target.value)}>{objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl>
      </Feld>
      {objektId && <ChecklisteAnlegen key={objektId} vorlagen={vorlagen} bezug={{ objekt_id: objektId }} weiter />}
    </div>
  );
}
