"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import type { Einstellungen, Pipeline, Stufe } from "@/lib/akquise/stammdaten";
import { einstellungenSpeichern, pipelineSpeichern, stufeLoeschen, stufeSpeichern, type AkquiseErgebnis } from "@/server/akquise-aktionen";

/** Pipelines mit Stufen, Verlustgruende, Preis-Finder-Vorgaben, Nachfassfrist (Verwaltung). */
export function AkquiseEinstellungen({ pipelines, stufen, einstellungen, leadsJeStufe, darfVerwalten }: { pipelines: Pipeline[]; stufen: Stufe[]; einstellungen: Einstellungen; leadsJeStufe: Record<string, number>; darfVerwalten: boolean }) {
  const [pErg, pAktion, pLaeuft] = useActionState<AkquiseErgebnis, FormData>(pipelineSpeichern, {});
  const [sErg, sAktion, sLaeuft] = useActionState<AkquiseErgebnis, FormData>(stufeSpeichern, {});
  const [eErg, eAktion, eLaeuft] = useActionState<AkquiseErgebnis, FormData>(einstellungenSpeichern, {});
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const [sBearbeiten, setSBearbeiten] = useState<Stufe | null>(null);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Karte>
        <KarteKopf><KarteTitel>Pipelines und Stufen</KarteTitel><KarteBeschreibung>Jede Stufe trägt eine Wahrscheinlichkeit für die Prognose; genau eine Stufe je Pipeline gilt als gewonnen, eine als verloren.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          <div className="flex flex-wrap gap-1.5">{pipelines.map((p) => <button key={p.id} type="button" onClick={() => { setPipelineId(p.id); setSBearbeiten(null); }} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${pipelineId === p.id ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{p.name}{p.ist_standard ? " ★" : ""}</button>)}</div>
          {pipeline && (
            <ul className="divide-y divide-linie">
              {stufen.filter((s) => s.pipeline_id === pipeline.id).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <span className="w-6 text-gedaempft">{s.sortierung}.</span>
                  <span className="min-w-0 flex-1 text-text">{s.name}{s.zusatz ? <span className="text-gedaempft"> · {s.zusatz}</span> : null}</span>
                  <Marke ton={s.ist_gewonnen ? "erfolg" : s.ist_verloren ? "fehler" : "neutral"}>{s.ist_gewonnen ? "gewonnen" : s.ist_verloren ? "verloren" : `${s.wahrscheinlichkeit} %`}</Marke>
                  <span className="text-[11px] text-gedaempft">{leadsJeStufe[s.id] ?? 0} Leads</span>
                  {darfVerwalten && <Button type="button" variante="leise" groesse="klein" onClick={() => setSBearbeiten(s)}>Bearbeiten</Button>}
                  {darfVerwalten && !(leadsJeStufe[s.id] ?? 0) && <form action={stufeLoeschen}><input type="hidden" name="id" value={s.id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
                </li>
              ))}
            </ul>
          )}
          {darfVerwalten && pipeline && (
            <form key={sBearbeiten?.id ?? "neu"} action={sAktion} className="grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={sBearbeiten?.id ?? ""} />
              <input type="hidden" name="pipeline_id" value={pipeline.id} />
              <div className="sm:col-span-2"><Feld id="st-name" beschriftung={sBearbeiten ? `Stufe „${sBearbeiten.name}“ bearbeiten` : "Neue Stufe"} pflicht><Eingabe name="name" defaultValue={sBearbeiten?.name ?? ""} required /></Feld></div>
              <Feld id="st-sort" beschriftung="Reihenfolge"><Eingabe name="sortierung" type="number" min={0} defaultValue={sBearbeiten?.sortierung ?? ""} /></Feld>
              <Feld id="st-w" beschriftung="Wahrscheinlichkeit (%)"><Eingabe name="wahrscheinlichkeit" type="number" min={0} max={100} defaultValue={sBearbeiten?.wahrscheinlichkeit ?? 50} /></Feld>
              <div className="sm:col-span-2"><Feld id="st-zusatz" beschriftung="Zusatz"><Eingabe name="zusatz" defaultValue={sBearbeiten?.zusatz ?? ""} /></Feld></div>
              <Feld id="st-art" beschriftung="Art"><Auswahl name="art" defaultValue={sBearbeiten?.ist_gewonnen ? "gewonnen" : sBearbeiten?.ist_verloren ? "verloren" : "offen"}><option value="offen">offen</option><option value="gewonnen">gewonnen</option><option value="verloren">verloren</option></Auswahl></Feld>
              <div className="flex items-end gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={sLaeuft}>{sBearbeiten ? "Speichern" : "Anlegen"}</Button>{sBearbeiten && <Button type="button" variante="leise" groesse="klein" onClick={() => setSBearbeiten(null)}>Abbrechen</Button>}</div>
              {sErg.fehler && <Hinweis ton="fehler" className="sm:col-span-4">{sErg.fehler}</Hinweis>}
              {sErg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-4">{sErg.erfolg}</Hinweis>}
            </form>
          )}
          {darfVerwalten && (
            <form action={pAktion} className="grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={pipeline?.id ?? ""} />
              <div className="sm:col-span-2"><Feld id="pl-name" beschriftung={pipeline ? `Pipeline „${pipeline.name}“ umbenennen` : "Neue Pipeline"} pflicht><Eingabe name="name" defaultValue={pipeline?.name ?? ""} required /></Feld></div>
              <Feld id="pl-beschr" beschriftung="Beschreibung"><Eingabe name="beschreibung" defaultValue={pipeline?.beschreibung ?? ""} /></Feld>
              <Feld id="pl-standard" beschriftung="Standard"><Auswahl name="ist_standard" defaultValue={pipeline?.ist_standard ? "1" : "0"}><option value="1">ja</option><option value="0">nein</option></Auswahl></Feld>
              <div className="sm:col-span-4 flex flex-wrap gap-2">
                <Button type="submit" variante="sekundaer" groesse="klein" laedt={pLaeuft}>{pipeline ? "Pipeline speichern" : "Pipeline anlegen"}</Button>
                <Button type="button" variante="leise" groesse="klein" onClick={() => setPipelineId("")}>Neue Pipeline</Button>
              </div>
              {pErg.fehler && <Hinweis ton="fehler" className="sm:col-span-4">{pErg.fehler}</Hinweis>}
              {pErg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-4">{pErg.erfolg}</Hinweis>}
            </form>
          )}
        </KarteInhalt>
      </Karte>
      <Karte>
        <KarteKopf><KarteTitel>Preis-Finder, Nachfassen, Verlustgründe</KarteTitel><KarteBeschreibung>Vorgaben für alle Leads; im Preis-Finder je Lead überschreibbar.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          <form action={eAktion} className="grid gap-3 sm:grid-cols-2">
            <Feld id="ei-satz" beschriftung="Provisionssatz (%)" hinweis="Vorgabe für Spanne und Provisionserwartung"><Eingabe name="provision_satz" defaultValue={einstellungen.provision_satz} inputMode="decimal" readOnly={!darfVerwalten} /></Feld>
            <Feld id="ei-faktor" beschriftung="Startpreis-Faktor" hinweis="0,85 = Startpreis 85 % des Punktwerts"><Eingabe name="startpreis_faktor" defaultValue={einstellungen.startpreis_faktor} inputMode="decimal" readOnly={!darfVerwalten} /></Feld>
            <Feld id="ei-spanne" beschriftung="Spanne (%)"><Eingabe name="spanne_prozent" defaultValue={einstellungen.spanne_prozent} inputMode="decimal" readOnly={!darfVerwalten} /></Feld>
            <Feld id="ei-nachfassen" beschriftung="Nachfassen nach (Tagen)"><Eingabe name="nachfassen_tage" type="number" min={1} max={365} defaultValue={einstellungen.nachfassen_tage} readOnly={!darfVerwalten} /></Feld>
            <div className="sm:col-span-2"><Feld id="ei-gruende" beschriftung="Verlustgründe (je Zeile)"><Textfeld name="verlustgruende" rows={6} defaultValue={einstellungen.verlustgruende.join("\n")} readOnly={!darfVerwalten} /></Feld></div>
            {eErg.fehler && <Hinweis ton="fehler" className="sm:col-span-2">{eErg.fehler}</Hinweis>}
            {eErg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-2">{eErg.erfolg}</Hinweis>}
            {darfVerwalten && <div className="sm:col-span-2"><Button type="submit" laedt={eLaeuft}>Einstellungen speichern</Button></div>}
          </form>
        </KarteInhalt>
      </Karte>
    </div>
  );
}
