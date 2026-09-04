"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { rechnungAnlegen, type RechnungErgebnis } from "@/server/rechnungen-aktionen";

export interface Wahl { id: string; bezeichnung: string }

/**
 * Neue Rechnung: Absender, Empfaenger (Kunde oder Kontakt), Objekt und
 * Vertrag. Aus einem Maklervertrag wird die Provisionsposition vorbelegt.
 */
export function RechnungAnlegen({ absender, kunden, kontakte, objekte, vertraege, vorgabe }: { absender: Wahl[]; kunden: Wahl[]; kontakte: Wahl[]; objekte: Wahl[]; vertraege: Wahl[]; vorgabe?: { objekt_id?: string; vertrag_id?: string; kontakt_id?: string } }) {
  const [zustand, aktion, laeuft] = useActionState<RechnungErgebnis, FormData>(rechnungAnlegen, {});
  const [empfaengerArt, setEmpfaengerArt] = useState<"kunde" | "kontakt">(vorgabe?.kontakt_id ? "kontakt" : "kunde");
  return (
    <form action={aktion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {zustand.fehler && <div className="sm:col-span-2 lg:col-span-3"><Hinweis ton="fehler">{zustand.fehler}</Hinweis></div>}
      <Feld id="ra-absender" beschriftung="Rechnungsabsender">
        <Auswahl name="absender_id" defaultValue={absender[0]?.id ?? ""}>{absender.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}</Auswahl>
      </Feld>
      <Feld id="ra-empf-art" beschriftung="Empfänger aus">
        <Auswahl value={empfaengerArt} onChange={(e) => setEmpfaengerArt(e.target.value as "kunde" | "kontakt")}><option value="kunde">Kundenstamm</option><option value="kontakt">Kontakt (wird als Kunde übernommen)</option></Auswahl>
      </Feld>
      {empfaengerArt === "kunde" ? (
        <Feld id="ra-kunde" beschriftung="Kunde"><Auswahl name="kunde_id" defaultValue=""><option value="">— später eintragen —</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}</Auswahl></Feld>
      ) : (
        <Feld id="ra-kontakt" beschriftung="Kontakt"><Auswahl name="kontakt_id" defaultValue={vorgabe?.kontakt_id ?? ""}><option value="">— später eintragen —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}</Auswahl></Feld>
      )}
      <Feld id="ra-objekt" beschriftung="Objekt"><Auswahl name="objekt_id" defaultValue={vorgabe?.objekt_id ?? ""}><option value="">— ohne —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
      <Feld id="ra-vertrag" beschriftung="Maklervertrag" hinweis="Belegt die Provisionsposition aus Prozentsatz und Kaufpreis vor"><Auswahl name="vertrag_id" defaultValue={vorgabe?.vertrag_id ?? ""}><option value="">— ohne —</option>{vertraege.map((v) => <option key={v.id} value={v.id}>{v.bezeichnung}</option>)}</Auswahl></Feld>
      <div className="flex items-end gap-3">
        <label className="flex items-center gap-2 pb-2 text-[13px] text-text"><input type="checkbox" name="ist_test" value="1" className="h-4 w-4 accent-akzent" />Testrechnung (ohne Nummernkreis)</label>
        <Button type="submit" disabled={laeuft}>{laeuft ? "Legt an …" : "Rechnung anlegen"}</Button>
      </div>
    </form>
  );
}
