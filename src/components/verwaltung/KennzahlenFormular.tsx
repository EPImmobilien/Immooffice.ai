"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { finanzierungSpeichern, kennzahlenSpeichern, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

export interface Kennzahl { jahr: number; objekte_vermittelt: number | null; erzielungsquote: number | null; vermarktungsdauer_schnitt: number | null; google_anzahl: number | null; google_schnitt: number | null; fakten: string[]; aktiv: boolean }
export interface Finanzierung { zinssatz: number; tilgung: number; eigenkapital_prozent: number; notar_prozent: number; grunderwerbsteuer_prozent: number; hinweis: string | null }

function Meldung({ z }: { z: VerwaltungErgebnis }) { return <>{z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}{z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}</>; }

/** Jaehrlich pflegbare Unternehmenskennzahlen (Referenz: Admin → Kennzahlen) fuer Wertindikation und Exposé. */
export function KennzahlenFormular({ zeilen, darfAendern }: { zeilen: Kennzahl[]; darfAendern: boolean }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(kennzahlenSpeichern, {});
  const [jahr, setJahr] = useState<number>(zeilen[0]?.jahr ?? new Date().getFullYear());
  const w = zeilen.find((k) => k.jahr === jahr);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {zeilen.map((k) => <button key={k.jahr} type="button" onClick={() => setJahr(k.jahr)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${jahr === k.jahr ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie text-gedaempft"}`}>{k.jahr}{!k.aktiv && " (inaktiv)"}</button>)}
        {darfAendern && <button type="button" onClick={() => setJahr((zeilen[0]?.jahr ?? new Date().getFullYear() - 1) + 1)} className="rounded-[var(--radius)] border border-dashed border-linie px-3 py-1 text-[12px] text-gedaempft">+ Jahr</button>}
      </div>
      <form key={jahr} action={aktion} className="grid gap-3 md:grid-cols-3">
        <Feld id="kz-jahr" beschriftung="Jahr" pflicht><Eingabe id="kz-jahr" name="jahr" type="number" defaultValue={jahr} readOnly={Boolean(w)} required /></Feld>
        <Feld id="kz-obj" beschriftung="Vermittelte Objekte"><Eingabe id="kz-obj" name="objekte_vermittelt" type="number" defaultValue={w?.objekte_vermittelt ?? ""} /></Feld>
        <Feld id="kz-eq" beschriftung="Erzielungsquote (% vom Angebotspreis)"><Eingabe id="kz-eq" name="erzielungsquote" inputMode="decimal" defaultValue={w?.erzielungsquote ?? ""} /></Feld>
        <Feld id="kz-vd" beschriftung="Ø Vermarktungsdauer (Tage)"><Eingabe id="kz-vd" name="vermarktungsdauer_schnitt" type="number" defaultValue={w?.vermarktungsdauer_schnitt ?? ""} /></Feld>
        <Feld id="kz-ga" beschriftung="Bewertungen (Anzahl)"><Eingabe id="kz-ga" name="google_anzahl" type="number" defaultValue={w?.google_anzahl ?? ""} /></Feld>
        <Feld id="kz-gs" beschriftung="Bewertungen (Schnitt, 1–5)"><Eingabe id="kz-gs" name="google_schnitt" inputMode="decimal" defaultValue={w?.google_schnitt ?? ""} /></Feld>
        <div className="md:col-span-3"><Feld id="kz-fakten" beschriftung="Fakten (je Zeile eine, erscheinen in Wertindikation und Exposé)"><Textfeld id="kz-fakten" name="fakten" rows={3} defaultValue={(w?.fakten ?? []).join("\n")} maxLength={2000} /></Feld></div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="aktiv" value="1" defaultChecked={w?.aktiv ?? true} /> In Dokumenten verwenden</label>
        <input type="hidden" name="aktiv" value="0" />
        <div className="md:col-span-3 flex flex-wrap items-center gap-2">
          {darfAendern && <Button type="submit" groesse="klein" disabled={laeuft}>Speichern</Button>}
          {darfAendern && w && <Button type="submit" name="loeschen" value="1" groesse="klein" variante="leise" disabled={laeuft} onClick={(e) => { if (!confirm(`Kennzahlen ${jahr} löschen?`)) e.preventDefault(); }}>Jahr löschen</Button>}
          <Meldung z={z} />
        </div>
      </form>
      {w && <p className="text-[12px] text-gedaempft"><Marke>{w.jahr}</Marke> {w.objekte_vermittelt ?? "—"} Objekte · {w.erzielungsquote ?? "—"} % Erzielung · Ø {w.vermarktungsdauer_schnitt ?? "—"} Tage · {w.google_anzahl ?? "—"} Bewertungen ({w.google_schnitt ?? "—"})</p>}
    </div>
  );
}

/** Finanzierungsannahmen (Referenz: Admin → Finanzierung) fuer Finanzierungsbeispiele in Exposé und Kundenbereich. */
export function FinanzierungFormular({ werte, darfAendern }: { werte: Finanzierung | null; darfAendern: boolean }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(finanzierungSpeichern, {});
  const w = werte ?? { zinssatz: 3.8, tilgung: 2, eigenkapital_prozent: 20, notar_prozent: 2, grunderwerbsteuer_prozent: 6, hinweis: null };
  return (
    <form action={aktion} className="grid gap-3 md:grid-cols-3">
      <Feld id="fi-zins" beschriftung="Sollzins % p. a."><Eingabe id="fi-zins" name="zinssatz" inputMode="decimal" defaultValue={w.zinssatz} /></Feld>
      <Feld id="fi-tilg" beschriftung="Anfängliche Tilgung %"><Eingabe id="fi-tilg" name="tilgung" inputMode="decimal" defaultValue={w.tilgung} /></Feld>
      <Feld id="fi-ek" beschriftung="Eigenkapital %"><Eingabe id="fi-ek" name="eigenkapital_prozent" inputMode="decimal" defaultValue={w.eigenkapital_prozent} /></Feld>
      <Feld id="fi-notar" beschriftung="Notar und Grundbuch %"><Eingabe id="fi-notar" name="notar_prozent" inputMode="decimal" defaultValue={w.notar_prozent} /></Feld>
      <Feld id="fi-gest" beschriftung="Grunderwerbsteuer %"><Eingabe id="fi-gest" name="grunderwerbsteuer_prozent" inputMode="decimal" defaultValue={w.grunderwerbsteuer_prozent} /></Feld>
      <div className="md:col-span-3"><Feld id="fi-hinweis" beschriftung="Hinweistext unter dem Finanzierungsbeispiel"><Textfeld id="fi-hinweis" name="hinweis" rows={2} defaultValue={w.hinweis ?? ""} maxLength={1000} placeholder="Unverbindliches Rechenbeispiel; die Konditionen legt Ihre Bank fest." /></Feld></div>
      <div className="md:col-span-3 flex items-center gap-2">{darfAendern && <Button type="submit" groesse="klein" disabled={laeuft}>Speichern</Button>}<Meldung z={z} /></div>
    </form>
  );
}
