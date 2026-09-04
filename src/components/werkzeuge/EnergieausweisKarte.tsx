"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis, KiKennzeichen } from "@/components/ui/Status";
import { ENERGIEAUSWEISTYPEN } from "@/lib/objekt-begriffe";
import { energieausweisAuslesen, energiewerteUebernehmen, type WerkzeugErgebnis } from "@/server/werkzeuge-aktionen";

/**
 * Energieausweis hochladen und auslesen (PDF oder Foto, 2 Credits mit KI).
 * Die erkannten Werte landen in einem editierbaren Formular — uebernommen
 * wird erst nach Bestaetigung (Grundprinzip: KI-Auslese immer ueber ein
 * editierbares Formular).
 */
export function EnergieausweisKarte({ objektId, darfAendern, kiVerfuegbar }: { objektId: string; darfAendern: boolean; kiVerfuegbar: boolean }) {
  const [auslesen, auslesenAktion, liest] = useActionState<WerkzeugErgebnis, FormData>(energieausweisAuslesen, {});
  const [uebernehmen, uebernehmenAktion, uebernimmt] = useActionState<WerkzeugErgebnis, FormData>(energiewerteUebernehmen, {});
  const [offen, setOffen] = useState(false);
  const w = auslesen.werte;
  if (!darfAendern) return null;
  return (
    <div className="mt-3 space-y-3 border-t border-linie pt-3">
      {!offen && <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setOffen(true)}>Energieausweis hochladen und auslesen</Button>}
      {offen && !w && (
        <form action={auslesenAktion} className="space-y-2">
          <input type="hidden" name="objekt_id" value={objektId} />
          {auslesen.fehler && <Hinweis ton="fehler">{auslesen.fehler}</Hinweis>}
          <Feld id="ea-datei" beschriftung="Energieausweis (PDF oder Foto)" hinweis={kiVerfuegbar ? "Wird als Unterlage abgelegt und per KI ausgelesen (2 Credits); die Werte prüfen Sie vor der Übernahme." : "Wird als Unterlage abgelegt; ohne Modellzugang nur einfache Texterkennung."}>
            <input id="ea-datei" type="file" name="datei" accept="application/pdf,image/jpeg,image/png,image/webp" required className="block w-full text-[13px] text-text file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px]" />
          </Feld>
          <div className="flex gap-2"><Button type="submit" groesse="klein" disabled={liest}>{liest ? "Liest aus …" : "Hochladen und auslesen"}</Button><Button type="button" variante="leise" groesse="klein" onClick={() => setOffen(false)}>Abbrechen</Button></div>
        </form>
      )}
      {w && (
        <form action={uebernehmenAktion} className="space-y-2">
          <input type="hidden" name="objekt_id" value={objektId} />
          <div className="flex flex-wrap items-center gap-2 text-[13px]"><Hinweis ton={auslesen.kiVerwendet ? "erfolg" : "warnung"} className="flex-1">{auslesen.erfolg}{auslesen.hinweis ? ` ${auslesen.hinweis}` : ""}</Hinweis>{auslesen.kiVerwendet && <KiKennzeichen art="erzeugt" />}</div>
          {uebernehmen.fehler && <Hinweis ton="fehler">{uebernehmen.fehler}</Hinweis>}
          {uebernehmen.erfolg && <Hinweis ton="erfolg">{uebernehmen.erfolg}</Hinweis>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Feld id="ea-typ" beschriftung="Ausweisart"><Auswahl name="energieausweis_typ" defaultValue={w["energieausweis_typ"] ?? ""}><option value="">—</option>{Object.entries(ENERGIEAUSWEISTYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
            <Feld id="ea-kennwert" beschriftung="Kennwert kWh/(m²·a)"><Eingabe name="energie_kennwert" inputMode="decimal" defaultValue={w["energie_kennwert"] ?? ""} /></Feld>
            <Feld id="ea-klasse" beschriftung="Klasse"><Eingabe name="energie_klasse" defaultValue={w["energie_klasse"] ?? ""} placeholder="A+ … H" /></Feld>
            <Feld id="ea-traeger" beschriftung="Energieträger"><Eingabe name="energie_traeger" defaultValue={w["energie_traeger"] ?? ""} /></Feld>
            <Feld id="ea-anlage" beschriftung="Baujahr Anlage"><Eingabe name="energie_baujahr_anlage" inputMode="numeric" defaultValue={w["energie_baujahr_anlage"] ?? ""} /></Feld>
            <Feld id="ea-baujahr" beschriftung="Baujahr Gebäude"><Eingabe name="baujahr" inputMode="numeric" defaultValue={w["baujahr"] ?? ""} /></Feld>
            <Feld id="ea-ww" beschriftung="Warmwasser enthalten"><Auswahl name="energie_warmwasser_enthalten" defaultValue={w["energie_warmwasser_enthalten"] ?? ""}><option value="">—</option><option value="ja">Ja</option><option value="nein">Nein</option></Auswahl></Feld>
            <Feld id="ea-gueltig" beschriftung="Gültig bis"><Eingabe name="energie_gueltig_bis" type="date" defaultValue={w["energie_gueltig_bis"] ?? ""} /></Feld>
          </div>
          <div className="flex gap-2"><Button type="submit" groesse="klein" disabled={uebernimmt}>{uebernimmt ? "Übernimmt …" : "Werte übernehmen"}</Button><Button type="button" variante="leise" groesse="klein" onClick={() => setOffen(false)}>Schließen</Button></div>
        </form>
      )}
    </div>
  );
}
