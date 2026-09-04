"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import type { Kunde } from "@/lib/rechnungen";
import { kundeLoeschen, kundeSpeichern, type RechnungErgebnis } from "@/server/rechnungen-aktionen";

/** Rechnungskunden: eigener Stamm mit Rechnungsanschrift, optional an einen Kontakt gebunden. */
export function KundenVerwaltung({ kunden, kontakte, darfAendern, darfLoeschen }: { kunden: Array<Kunde & { anzahl: number }>; kontakte: Array<{ id: string; bezeichnung: string }>; darfAendern: boolean; darfLoeschen: boolean }) {
  const [offen, setOffen] = useState<string | "neu" | null>(null);
  const leer: Kunde = { id: "", kontakt_id: null, anrede: null, name: "", zusatz: null, strasse: null, plz: null, ort: null, land: "Deutschland", email: null, ust_id: null };
  const bearbeitet = offen === "neu" ? leer : kunden.find((k) => k.id === offen) ?? null;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {kunden.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{k.anrede ? `${k.anrede} ` : ""}{k.name}{k.zusatz ? <span className="text-gedaempft"> · {k.zusatz}</span> : null} {k.kontakt_id && <Marke>aus Kontakt</Marke>}</p>
              <p className="text-[12px] text-gedaempft">{[k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Ohne Anschrift"}{k.email ? ` · ${k.email}` : ""} · {k.anzahl} Rechnung(en)</p>
            </div>
            {darfAendern && <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setOffen(offen === k.id ? null : k.id)}>{offen === k.id ? "Schließen" : "Bearbeiten"}</Button>}
            {darfLoeschen && k.anzahl === 0 && <form action={kundeLoeschen}><input type="hidden" name="id" value={k.id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
          </div>
        ))}
        {kunden.length === 0 && <Hinweis>Noch keine Rechnungskunden. Beim Anlegen einer Rechnung aus einem Kontakt entsteht der Kunde automatisch.</Hinweis>}
      </div>
      {darfAendern && offen === null && <Button type="button" onClick={() => setOffen("neu")}>Kunde anlegen</Button>}
      {darfAendern && bearbeitet && <KundeFormular key={bearbeitet.id || "neu"} start={bearbeitet} kontakte={kontakte} schliessen={() => setOffen(null)} />}
    </div>
  );
}

function KundeFormular({ start, kontakte, schliessen }: { start: Kunde; kontakte: Array<{ id: string; bezeichnung: string }>; schliessen: () => void }) {
  const [zustand, aktion, laeuft] = useActionState<RechnungErgebnis, FormData>(kundeSpeichern, {});
  return (
    <Karte>
      <KarteKopf><KarteTitel>{start.id ? "Kunde bearbeiten" : "Kunde anlegen"}</KarteTitel><KarteBeschreibung>Die Rechnungsanschrift wird beim Stellen in die Rechnung eingefroren; spätere Änderungen betreffen nur neue Rechnungen.</KarteBeschreibung></KarteKopf>
      <KarteInhalt>
        <form action={aktion} className="grid gap-3 sm:grid-cols-4">
          {start.id && <input type="hidden" name="id" value={start.id} />}
          {zustand.fehler && <div className="sm:col-span-4"><Hinweis ton="fehler">{zustand.fehler}</Hinweis></div>}
          {zustand.erfolg && <div className="sm:col-span-4"><Hinweis ton="erfolg">{zustand.erfolg}</Hinweis></div>}
          <Feld id="ku-anrede" beschriftung="Anrede"><Auswahl name="anrede" defaultValue={start.anrede ?? ""}><option value="">—</option><option value="Frau">Frau</option><option value="Herr">Herr</option><option value="Firma">Firma</option></Auswahl></Feld>
          <div className="sm:col-span-3"><Feld id="ku-name" beschriftung="Name / Firma" pflicht><Eingabe name="name" required defaultValue={start.name} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="ku-zusatz" beschriftung="Zusatz"><Eingabe name="zusatz" defaultValue={start.zusatz ?? ""} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="ku-kontakt" beschriftung="Verknüpfter Kontakt"><Auswahl name="kontakt_id" defaultValue={start.kontakt_id ?? ""}><option value="">— keiner —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}</Auswahl></Feld></div>
          <div className="sm:col-span-4"><Feld id="ku-strasse" beschriftung="Straße, Hausnummer"><Eingabe name="strasse" defaultValue={start.strasse ?? ""} /></Feld></div>
          <Feld id="ku-plz" beschriftung="PLZ"><Eingabe name="plz" defaultValue={start.plz ?? ""} /></Feld>
          <div className="sm:col-span-2"><Feld id="ku-ort" beschriftung="Ort"><Eingabe name="ort" defaultValue={start.ort ?? ""} /></Feld></div>
          <Feld id="ku-land" beschriftung="Land"><Eingabe name="land" defaultValue={start.land} /></Feld>
          <div className="sm:col-span-2"><Feld id="ku-email" beschriftung="E-Mail"><Eingabe name="email" type="email" defaultValue={start.email ?? ""} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="ku-ustid" beschriftung="USt-IdNr."><Eingabe name="ust_id" defaultValue={start.ust_id ?? ""} /></Feld></div>
          <div className="sm:col-span-4 flex gap-2"><Button type="submit" disabled={laeuft}>{laeuft ? "Speichert …" : "Speichern"}</Button><Button type="button" variante="leise" onClick={schliessen}>Schließen</Button></div>
        </form>
      </KarteInhalt>
    </Karte>
  );
}
