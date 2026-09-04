"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { BEREICHE, type Vorlage, type VorlagenPunkt } from "@/lib/checklisten";
import { DOKUMENTARTEN } from "@/lib/dokumente";
import { vorlageLoeschen, vorlagePunktLoeschen, vorlagePunktSpeichern, vorlageSpeichern, type ChecklistenErgebnis } from "@/server/checklisten-aktionen";

/** Checklisten-Vorlagen mit Punkten (Pflicht, Unterlagenart, Frist in Tagen). */
export function ChecklistenVorlagen({ vorlagen, punkte, darfAendern, darfLoeschen }: { vorlagen: Vorlage[]; punkte: VorlagenPunkt[]; darfAendern: boolean; darfLoeschen: boolean }) {
  const [gewaehlt, setGewaehlt] = useState<string>(vorlagen[0]?.id ?? "");
  const [vErg, vAktion, vLaeuft] = useActionState<ChecklistenErgebnis, FormData>(vorlageSpeichern, {});
  const [pErg, pAktion, pLaeuft] = useActionState<ChecklistenErgebnis, FormData>(vorlagePunktSpeichern, {});
  const [neu, setNeu] = useState(false);
  const [pBearbeiten, setPBearbeiten] = useState<VorlagenPunkt | null>(null);
  const vorlage = vorlagen.find((v) => v.id === gewaehlt) ?? null;
  const eigene = punkte.filter((p) => p.vorlage_id === gewaehlt);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Karte>
        <KarteKopf><KarteTitel>Vorlagen</KarteTitel><KarteBeschreibung>Je Bereich eine Arbeitskette. Standardvorlagen lassen sich anpassen.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          <ul className="divide-y divide-linie">
            {vorlagen.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => { setGewaehlt(v.id); setNeu(false); setPBearbeiten(null); }} className={`flex w-full items-center gap-2 py-2 text-left text-[13px] ${gewaehlt === v.id && !neu ? "text-akzent" : "text-text"}`}>
                  <span className="flex-1">{v.name}</span><Marke>{BEREICHE[v.bereich]}</Marke>{!v.aktiv && <Marke ton="warnung">inaktiv</Marke>}
                </button>
              </li>
            ))}
          </ul>
          {darfAendern && <Button type="button" variante="leise" groesse="klein" onClick={() => { setNeu(true); setGewaehlt(""); }}>Neue Vorlage</Button>}
          {darfAendern && (neu || vorlage) && (
            <form key={neu ? "neu" : vorlage?.id} action={vAktion} className="grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3">
              <input type="hidden" name="id" value={neu ? "" : (vorlage?.id ?? "")} />
              <Feld id="cv-name" beschriftung={neu ? "Neue Vorlage" : "Name"} pflicht><Eingabe name="name" defaultValue={neu ? "" : (vorlage?.name ?? "")} required /></Feld>
              <Feld id="cv-bereich" beschriftung="Bereich"><Auswahl name="bereich" defaultValue={neu ? "allgemein" : (vorlage?.bereich ?? "allgemein")}>{Object.entries(BEREICHE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="cv-beschreibung" beschriftung="Beschreibung"><Textfeld name="beschreibung" rows={2} defaultValue={neu ? "" : (vorlage?.beschreibung ?? "")} /></Feld>
              {!neu && <Feld id="cv-aktiv" beschriftung="Status"><Auswahl name="aktiv" defaultValue={vorlage?.aktiv === false ? "0" : "1"}><option value="1">aktiv</option><option value="0">inaktiv</option></Auswahl></Feld>}
              {vErg.fehler && <Hinweis ton="fehler">{vErg.fehler}</Hinweis>}
              {vErg.erfolg && <Hinweis ton="erfolg">{vErg.erfolg}</Hinweis>}
              <div className="flex gap-2">
                <Button type="submit" variante="sekundaer" groesse="klein" laedt={vLaeuft}>{neu ? "Anlegen" : "Speichern"}</Button>
                {!neu && darfLoeschen && vorlage && <Button type="submit" formAction={vorlageLoeschen} variante="gefahr" groesse="klein">Vorlage löschen</Button>}
              </div>
            </form>
          )}
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf><KarteTitel>{vorlage ? `Punkte: ${vorlage.name}` : "Punkte"}</KarteTitel><KarteBeschreibung>Pflichtpunkte entscheiden über den Abschluss. Ein Punkt mit Unterlagenart wird automatisch erledigt, sobald die Unterlage am Objekt liegt.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          {!vorlage ? <p className="text-[13px] text-gedaempft">Vorlage wählen.</p> : (
            <ol className="divide-y divide-linie">
              {eigene.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <span className="w-6 text-gedaempft">{p.sortierung}.</span>
                  <span className="min-w-0 flex-1 text-text">{p.titel}{p.beschreibung ? <span className="text-gedaempft"> · {p.beschreibung}</span> : null}</span>
                  {p.pflicht ? <Marke ton="akzent">Pflicht</Marke> : <Marke>optional</Marke>}
                  {p.dokumentart && <Marke ton="info">{DOKUMENTARTEN[p.dokumentart]}</Marke>}
                  {p.frist_tage !== null && <span className="text-[11px] text-gedaempft">{p.frist_tage} Tage</span>}
                  {darfAendern && <Button type="button" variante="leise" groesse="klein" onClick={() => setPBearbeiten(p)}>Bearbeiten</Button>}
                  {darfAendern && <form action={vorlagePunktLoeschen}><input type="hidden" name="id" value={p.id} /><Button type="submit" variante="leise" groesse="klein">Entfernen</Button></form>}
                </li>
              ))}
              {eigene.length === 0 && <li className="py-2 text-[13px] text-gedaempft">Noch keine Punkte.</li>}
            </ol>
          )}
          {darfAendern && vorlage && (
            <form key={pBearbeiten?.id ?? "neu"} action={pAktion} className="grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-6">
              <input type="hidden" name="id" value={pBearbeiten?.id ?? ""} />
              <input type="hidden" name="vorlage_id" value={vorlage.id} />
              <div className="sm:col-span-3"><Feld id="cp-titel" beschriftung={pBearbeiten ? "Punkt bearbeiten" : "Neuer Punkt"} pflicht><Eingabe name="titel" defaultValue={pBearbeiten?.titel ?? ""} required /></Feld></div>
              <Feld id="cp-pflicht" beschriftung="Pflicht"><Auswahl name="pflicht" defaultValue={pBearbeiten?.pflicht === false ? "0" : "1"}><option value="1">ja</option><option value="0">optional</option></Auswahl></Feld>
              <Feld id="cp-art" beschriftung="Unterlagenart"><Auswahl name="dokumentart" defaultValue={pBearbeiten?.dokumentart ?? ""}><option value="">— keine —</option>{Object.entries(DOKUMENTARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="cp-frist" beschriftung="Frist (Tage)"><Eingabe name="frist_tage" type="number" min={0} max={365} defaultValue={pBearbeiten?.frist_tage ?? ""} /></Feld>
              <div className="sm:col-span-4"><Feld id="cp-beschreibung" beschriftung="Hinweis"><Eingabe name="beschreibung" defaultValue={pBearbeiten?.beschreibung ?? ""} /></Feld></div>
              <Feld id="cp-sort" beschriftung="Reihenfolge"><Eingabe name="sortierung" type="number" min={0} defaultValue={pBearbeiten?.sortierung ?? ""} /></Feld>
              <div className="flex items-end gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={pLaeuft}>{pBearbeiten ? "Speichern" : "Hinzufügen"}</Button>{pBearbeiten && <Button type="button" variante="leise" groesse="klein" onClick={() => setPBearbeiten(null)}>Abbrechen</Button>}</div>
              {pErg.fehler && <Hinweis ton="fehler" className="sm:col-span-6">{pErg.fehler}</Hinweis>}
            </form>
          )}
        </KarteInhalt>
      </Karte>
    </div>
  );
}
