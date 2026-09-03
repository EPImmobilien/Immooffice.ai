"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe } from "@/components/ui/Feld";
import type { Stufe } from "@/lib/akquise/stammdaten";
import { leadStufe, type AkquiseErgebnis } from "@/server/akquise-aktionen";

/**
 * Stufe eines Leads wechseln (Liste, Kanban, Dossier). Bei einer verlorenen
 * Stufe wird der Verlustgrund Pflicht — die Datenbank erzwingt das ebenfalls.
 */
export function StufeWechsel({ leadId, stufeId, stufen, verlustgruende, kompakt }: { leadId: string; stufeId: string; stufen: Stufe[]; verlustgruende: string[]; kompakt?: boolean }) {
  const [erg, aktion, laeuft] = useActionState<AkquiseErgebnis, FormData>(leadStufe, {});
  const [ziel, setZiel] = useState(stufeId);
  const zielStufe = stufen.find((s) => s.id === ziel);
  return (
    <form action={aktion} className={kompakt ? "flex flex-wrap items-center gap-1" : "flex flex-wrap items-end gap-2"}>
      <input type="hidden" name="id" value={leadId} />
      <Auswahl name="stufe_id" value={ziel} onChange={(e) => setZiel(e.target.value)} className={kompakt ? "h-8 text-[12px]" : ""} aria-label="Stufe">
        {stufen.map((s) => <option key={s.id} value={s.id}>{s.name}{s.ist_gewonnen ? " ✓" : s.ist_verloren ? " ✗" : ` (${s.wahrscheinlichkeit} %)`}</option>)}
      </Auswahl>
      {zielStufe?.ist_verloren && (
        <>
          <Auswahl name="verlustgrund" defaultValue="" className={kompakt ? "h-8 text-[12px]" : ""} aria-label="Verlustgrund" required>
            <option value="">Verlustgrund …</option>
            {verlustgruende.map((g) => <option key={g} value={g}>{g}</option>)}
          </Auswahl>
        </>
      )}
      {zielStufe?.ist_verloren && !verlustgruende.length && <Eingabe name="verlustgrund" placeholder="Verlustgrund" required />}
      {ziel !== stufeId && <Button type="submit" variante="sekundaer" groesse="klein" laedt={laeuft}>Verschieben</Button>}
      {erg.fehler && <span className="text-[12px] text-fehler">{erg.fehler}</span>}
    </form>
  );
}
