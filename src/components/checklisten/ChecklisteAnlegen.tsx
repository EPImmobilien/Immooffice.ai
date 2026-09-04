"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl } from "@/components/ui/Feld";
import { BEREICHE, type Vorlage } from "@/lib/checklisten";
import { checklisteAnlegen, type ChecklistenErgebnis } from "@/server/checklisten-aktionen";

/** Checkliste aus Vorlage an einem Bezug anlegen (kompakt, fuer Objekt-, Kontakt- und Lead-Seiten). */
export function ChecklisteAnlegen({ vorlagen, bezug, weiter }: { vorlagen: Vorlage[]; bezug: { objekt_id?: string; kontakt_id?: string; lead_id?: string; vertrag_id?: string }; weiter?: boolean }) {
  const [erg, aktion, laeuft] = useActionState<ChecklistenErgebnis, FormData>(checklisteAnlegen, {});
  return (
    <form action={aktion} className="flex flex-wrap items-center gap-2">
      {bezug.objekt_id && <input type="hidden" name="objekt_id" value={bezug.objekt_id} />}
      {bezug.kontakt_id && <input type="hidden" name="kontakt_id" value={bezug.kontakt_id} />}
      {bezug.lead_id && <input type="hidden" name="lead_id" value={bezug.lead_id} />}
      {bezug.vertrag_id && <input type="hidden" name="vertrag_id" value={bezug.vertrag_id} />}
      {weiter && <input type="hidden" name="weiter" value="1" />}
      <Auswahl name="vorlage_id" defaultValue={vorlagen[0]?.id ?? ""} aria-label="Checklisten-Vorlage" className="h-8 w-auto text-[13px]">
        {vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name} ({BEREICHE[v.bereich]})</option>)}
      </Auswahl>
      <Button type="submit" variante="sekundaer" groesse="klein" laedt={laeuft}>Checkliste anlegen</Button>
      {erg.fehler && <span className="text-[12px] text-fehler">{erg.fehler}</span>}
      {erg.erfolg && <span className="text-[12px] text-erfolg">{erg.erfolg}</span>}
    </form>
  );
}
