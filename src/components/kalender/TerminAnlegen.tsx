"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { Mitarbeiter } from "@/lib/kalender/typen";

import { TerminFormular, type TerminStart } from "./TerminFormular";

/** Aufklappbares Termin-Formular fuer die Kalenderseite; mit `offen` bereits geoeffnet (Klick in eine Stunde). */
export function TerminAnlegen({ offen: startOffen, start, mitarbeiter, objekte, kontakte, benutzerId, standardDauer }: { offen: boolean; start: TerminStart; mitarbeiter: Mitarbeiter[]; objekte: Array<{ id: string; bezeichnung: string }>; kontakte: Array<{ id: string; bezeichnung: string; email: string | null }>; benutzerId: string; standardDauer: number }) {
  const [offen, setOffen] = useState(startOffen);
  if (!offen) return <Button type="button" onClick={() => setOffen(true)}>Termin anlegen</Button>;
  return <TerminFormular key={`${start.datum}-${start.zeit}`} start={start} mitarbeiter={mitarbeiter} objekte={objekte} kontakte={kontakte} benutzerId={benutzerId} standardDauer={standardDauer} kompakt schliessen={() => setOffen(false)} />;
}
