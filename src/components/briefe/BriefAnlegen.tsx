"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { BRIEF_VORLAGEN } from "@/lib/rechnungen";
import { briefAnlegen, type BriefErgebnis } from "@/server/briefe-aktionen";

export interface Wahl { id: string; bezeichnung: string }

const GRUPPEN = { behoerde: "Behörden", eigentuemer: "Eigentümer", allgemein: "Allgemein" } as const;

/** Neuer Geschaeftsbrief aus Vorlage — Empfaenger aus Kontakt, Platzhalter aus dem Objekt. */
export function BriefAnlegen({ absender, kontakte, objekte, vorgabe }: { absender: Wahl[]; kontakte: Wahl[]; objekte: Wahl[]; vorgabe?: { objekt_id?: string; kontakt_id?: string } }) {
  const [zustand, aktion, laeuft] = useActionState<BriefErgebnis, FormData>(briefAnlegen, {});
  const [vorlage, setVorlage] = useState("frei");
  const v = BRIEF_VORLAGEN[vorlage];
  return (
    <form action={aktion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {zustand.fehler && <div className="sm:col-span-2 lg:col-span-4"><Hinweis ton="fehler">{zustand.fehler}</Hinweis></div>}
      <Feld id="ba-vorlage" beschriftung="Vorlage" {...(v?.empfaenger ? { hinweis: `Empfänger: ${v.empfaenger}` } : {})}>
        <Auswahl name="vorlage" value={vorlage} onChange={(e) => setVorlage(e.target.value)}>
          {(Object.keys(GRUPPEN) as Array<keyof typeof GRUPPEN>).map((g) => (
            <optgroup key={g} label={GRUPPEN[g]}>{Object.entries(BRIEF_VORLAGEN).filter(([, x]) => x.gruppe === g).map(([k, x]) => <option key={k} value={k}>{x.bezeichnung}</option>)}</optgroup>
          ))}
        </Auswahl>
      </Feld>
      <Feld id="ba-kontakt" beschriftung="Empfänger (Kontakt)" hinweis="Leer bei Behördenschreiben — die Anschrift tragen Sie im Brief ein"><Auswahl name="kontakt_id" defaultValue={vorgabe?.kontakt_id ?? ""}><option value="">— frei —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}</Auswahl></Feld>
      <Feld id="ba-objekt" beschriftung="Objekt" hinweis="Füllt Adresse und Eigentümer in die Vorlage"><Auswahl name="objekt_id" defaultValue={vorgabe?.objekt_id ?? ""}><option value="">— ohne —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
      <Feld id="ba-absender" beschriftung="Briefpapier / Absender"><Auswahl name="absender_id" defaultValue={absender[0]?.id ?? ""}>{absender.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}</Auswahl></Feld>
      <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={laeuft}>{laeuft ? "Legt an …" : "Brief anlegen"}</Button></div>
    </form>
  );
}
