"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { cn } from "@/lib/cn";
import { fortschritt, PUNKT_STATUS, type Checkliste, type Punkt } from "@/lib/checklisten";
import { DOKUMENTARTEN } from "@/lib/dokumente";
import { datum } from "@/lib/format";
import { checklisteLoeschen, punktAlsAufgabe, punktAnlegen, punktLoeschen, punktStatus, type ChecklistenErgebnis } from "@/server/checklisten-aktionen";

export interface Bezugslink { art: string; bezeichnung: string; pfad: string }

/** Laufende Checkliste: Punkte abhaken, als nicht noetig markieren, in Aufgaben verwandeln, ergaenzen. */
export function ChecklisteDetail({ checkliste, punkte, bezuege, heute, darfAendern, darfLoeschen }: { checkliste: Checkliste; punkte: Punkt[]; bezuege: Bezugslink[]; heute: string; darfAendern: boolean; darfLoeschen: boolean }) {
  const [erg, aktion, laeuft] = useActionState<ChecklistenErgebnis, FormData>(punktAnlegen, {});
  const f = fortschritt(punkte, heute);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Marke ton={checkliste.abgeschlossen_am ? "erfolg" : "info"}>{checkliste.abgeschlossen_am ? `Abgeschlossen ${datum(checkliste.abgeschlossen_am)}` : `${f.erledigt} von ${f.gesamt} · ${f.pflichtOffen} Pflicht offen`}</Marke>
        {bezuege.map((b) => <Link key={b.pfad} href={b.pfad} className="text-akzent hover:underline"><span className="text-gedaempft">{b.art}:</span> {b.bezeichnung}</Link>)}
        {darfLoeschen && <form action={checklisteLoeschen} className="ml-auto"><input type="hidden" name="id" value={checkliste.id} /><Button type="submit" variante="gefahr" groesse="klein">Checkliste löschen</Button></form>}
      </div>
      <div className="h-2 w-full rounded-full bg-flaeche-gedaempft"><div className={`h-2 rounded-full ${checkliste.abgeschlossen_am ? "bg-erfolg" : "bg-akzent"}`} style={{ width: `${f.prozent}%` }} /></div>
      <Karte>
        <KarteKopf><KarteTitel>Punkte</KarteTitel><KarteBeschreibung>Pflichtpunkte entscheiden über den Abschluss. Punkte mit Unterlagenart werden automatisch erledigt, sobald die Unterlage am Objekt liegt.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          <ol className="divide-y divide-linie">
            {punkte.map((p) => {
              const ueberfaellig = p.status === "offen" && p.faellig_am && p.faellig_am < heute;
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-2 py-2.5 text-[13px]">
                  {darfAendern ? (
                    <form action={punktStatus} className="mt-0.5"><input type="hidden" name="punkt_id" value={p.id} /><input type="hidden" name="status" value={p.status === "offen" ? "erledigt" : "offen"} /><button type="submit" aria-label={p.status === "offen" ? "Erledigt" : "Wieder öffnen"} className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border", p.status === "erledigt" ? "border-erfolg bg-erfolg text-erfolg-text" : p.status === "nicht_noetig" ? "border-linie bg-flaeche-gedaempft text-gedaempft" : "border-linie-stark")}>{p.status === "erledigt" ? "✓" : p.status === "nicht_noetig" ? "–" : ""}</button></form>
                  ) : <span className="mt-0.5 h-[18px] w-[18px] rounded-[5px] border border-linie" />}
                  <div className="min-w-0 flex-1">
                    <p className={cn(p.status !== "offen" ? "text-gedaempft line-through" : "text-text")}>{p.titel} {p.pflicht ? <Marke ton="akzent">Pflicht</Marke> : null} {p.dokumentart && <Marke ton="info">{DOKUMENTARTEN[p.dokumentart]}</Marke>}</p>
                    <p className="text-[11px] text-gedaempft">{[p.beschreibung, p.faellig_am ? `fällig ${datum(p.faellig_am)}` : null, p.erledigt_am ? `${PUNKT_STATUS[p.status]} ${datum(p.erledigt_am)}` : null, p.dokument_id ? "durch Unterlage" : null, p.notiz].filter(Boolean).join(" · ")}</p>
                  </div>
                  {ueberfaellig && <Marke ton="fehler">überfällig</Marke>}
                  {p.aufgabe_id && <Link href={`/aufgaben/${p.aufgabe_id}`} className="text-[12px] text-akzent hover:underline">Aufgabe</Link>}
                  {darfAendern && p.status === "offen" && (
                    <>
                      {!p.aufgabe_id && <form action={punktAlsAufgabe}><input type="hidden" name="punkt_id" value={p.id} /><Button type="submit" variante="leise" groesse="klein">Als Aufgabe</Button></form>}
                      <form action={punktStatus}><input type="hidden" name="punkt_id" value={p.id} /><input type="hidden" name="status" value="nicht_noetig" /><Button type="submit" variante="leise" groesse="klein">Nicht nötig</Button></form>
                    </>
                  )}
                  {darfAendern && <form action={punktLoeschen}><input type="hidden" name="punkt_id" value={p.id} /><Button type="submit" variante="leise" groesse="klein">Entfernen</Button></form>}
                </li>
              );
            })}
          </ol>
          {darfAendern && (
            <form action={aktion} className="mt-3 grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-5">
              <input type="hidden" name="checkliste_id" value={checkliste.id} />
              <div className="sm:col-span-2"><Feld id="np-titel" beschriftung="Weiterer Punkt" pflicht><Eingabe name="titel" required /></Feld></div>
              <Feld id="np-pflicht" beschriftung="Pflicht"><Auswahl name="pflicht" defaultValue="1"><option value="1">ja</option><option value="0">optional</option></Auswahl></Feld>
              <Feld id="np-art" beschriftung="Unterlagenart"><Auswahl name="dokumentart" defaultValue=""><option value="">— keine —</option>{Object.entries(DOKUMENTARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="np-faellig" beschriftung="Fällig am"><Eingabe name="faellig_am" type="date" /></Feld>
              <div className="sm:col-span-5 flex items-center gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={laeuft}>Hinzufügen</Button>{erg.fehler && <Hinweis ton="fehler">{erg.fehler}</Hinweis>}</div>
            </form>
          )}
        </KarteInhalt>
      </Karte>
    </div>
  );
}
