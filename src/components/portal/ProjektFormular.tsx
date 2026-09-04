"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { PROJEKT_STATUS } from "@/lib/portal/typen";
import { projektSpeichern, type PortalErgebnis } from "@/server/portal-aktionen";

export interface ProjektWerte {
  id?: string;
  name?: string;
  slug?: string;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  beschreibung?: string | null;
  vermarktungsart?: string;
  status?: string;
  baubeginn?: string | null;
  fertigstellung?: string | null;
  ansprechpartner_id?: string | null;
}

/** Projekt anlegen oder bearbeiten (Referenz: Neubauprojekte → Projekt). */
export function ProjektFormular({ werte, mitarbeiter, darfAendern = true }: { werte?: ProjektWerte; mitarbeiter: Array<{ id: string; name: string }>; darfAendern?: boolean }) {
  const [zustand, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(projektSpeichern, {});
  const w = werte ?? {};
  return (
    <form action={aktion} className="space-y-4">
      {w.id && <input type="hidden" name="id" value={w.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Feld id="pj-name" beschriftung="Projektname" pflicht><Eingabe id="pj-name" name="name" defaultValue={w.name ?? ""} required maxLength={200} placeholder="z. B. Quartier am Park" /></Feld>
        <Feld id="pj-slug" beschriftung="Kurzname (für Adressen)" hinweis="Kleinbuchstaben, Ziffern, Bindestriche — leer lassen für automatisch"><Eingabe id="pj-slug" name="slug" defaultValue={w.slug ?? ""} maxLength={80} /></Feld>
        <Feld id="pj-vermarktung" beschriftung="Vermarktung"><Auswahl id="pj-vermarktung" name="vermarktungsart" defaultValue={w.vermarktungsart ?? "kauf"}><option value="kauf">Verkauf</option><option value="miete">Vermietung</option></Auswahl></Feld>
        <Feld id="pj-status" beschriftung="Status"><Auswahl id="pj-status" name="status" defaultValue={w.status ?? "vorbereitung"}>{Object.entries(PROJEKT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
        <Feld id="pj-strasse" beschriftung="Straße und Hausnummer"><Eingabe id="pj-strasse" name="strasse" defaultValue={w.strasse ?? ""} maxLength={200} /></Feld>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Feld id="pj-plz" beschriftung="PLZ"><Eingabe id="pj-plz" name="plz" defaultValue={w.plz ?? ""} maxLength={10} /></Feld>
          <Feld id="pj-ort" beschriftung="Ort"><Eingabe id="pj-ort" name="ort" defaultValue={w.ort ?? ""} maxLength={120} /></Feld>
        </div>
        <Feld id="pj-baubeginn" beschriftung="Baubeginn"><Eingabe id="pj-baubeginn" name="baubeginn" type="date" defaultValue={w.baubeginn ?? ""} /></Feld>
        <Feld id="pj-fertig" beschriftung="Fertigstellung (geplant)"><Eingabe id="pj-fertig" name="fertigstellung" type="date" defaultValue={w.fertigstellung ?? ""} /></Feld>
        <Feld id="pj-ap" beschriftung="Ansprechpartner"><Auswahl id="pj-ap" name="ansprechpartner_id" defaultValue={w.ansprechpartner_id ?? ""}><option value="">— keiner —</option>{mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Auswahl></Feld>
      </div>
      <Feld id="pj-beschreibung" beschriftung="Beschreibung" hinweis="Erscheint im Kundenbereich und auf der öffentlichen Projektseite."><Textfeld id="pj-beschreibung" name="beschreibung" rows={5} defaultValue={w.beschreibung ?? ""} maxLength={8000} /></Feld>
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      {zustand.erfolg && <Hinweis ton="erfolg">{zustand.erfolg}</Hinweis>}
      {darfAendern && <Button type="submit" disabled={laeuft}>{laeuft ? "Speichert …" : w.id ? "Projekt speichern" : "Projekt anlegen"}</Button>}
    </form>
  );
}
