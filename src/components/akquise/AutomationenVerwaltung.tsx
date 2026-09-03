"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { KANAELE, LAUF_STATUS, PLATZHALTER, type Automation, type Kanal, type LaufStatus, type Pipeline, type Quelle, type Stufe, type Vorlage } from "@/lib/akquise/stammdaten";
import { zeitpunkt } from "@/lib/format";
import { automationLoeschen, automationSpeichern, laufAbbrechen, vorlageLoeschen, vorlageSpeichern, type AkquiseErgebnis } from "@/server/akquise-aktionen";

const REITER = [["matrix", "Automationen"], ["vorlagen", "Vorlagen"], ["laeufe", "Geplante Läufe"]] as const;
export interface LaufZeile { id: string; geplant_am: string; status: LaufStatus; fehler: string | null; ausgefuehrt_am: string | null; automation: { name: string | null; kanal: Kanal } | null; lead: { id: string; titel: string } | null }

/**
 * Automationen (Referenz „Matrix · Vorlagen · Geplante Läufe"): je Pipeline,
 * Stufe und Quelle eine Aktion mit Vorlage und Verzoegerung. Der Lauf erzeugt
 * Aufgaben oder Mail-Entwuerfe — der Versand bleibt beim Menschen.
 */
export function AutomationenVerwaltung({ pipelines, stufen, quellen, vorlagen, automationen, laeufe, darfVerwalten, darfAendern }: { pipelines: Pipeline[]; stufen: Stufe[]; quellen: Quelle[]; vorlagen: Vorlage[]; automationen: Automation[]; laeufe: LaufZeile[]; darfVerwalten: boolean; darfAendern: boolean }) {
  const [reiter, setReiter] = useState<(typeof REITER)[number][0]>("matrix");
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const [aErg, aAktion, aLaeuft] = useActionState<AkquiseErgebnis, FormData>(automationSpeichern, {});
  const [vErg, vAktion, vLaeuft] = useActionState<AkquiseErgebnis, FormData>(vorlageSpeichern, {});
  const [aBearbeiten, setABearbeiten] = useState<Automation | null>(null);
  const [vBearbeiten, setVBearbeiten] = useState<Vorlage | null>(null);
  const [kanal, setKanal] = useState<Kanal>("mail");
  const [laufFilter, setLaufFilter] = useState<LaufStatus | "alle">("geplant");
  const stufenDerPipeline = stufen.filter((s) => s.pipeline_id === (aBearbeiten?.pipeline_id ?? pipelineId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 border-b border-linie pb-2">
        {REITER.map(([k, b]) => <button key={k} type="button" onClick={() => setReiter(k)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${reiter === k ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{b}{k === "laeufe" ? ` (${laeufe.filter((l) => l.status === "geplant").length})` : ""}</button>)}
      </div>

      {reiter === "matrix" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">{pipelines.map((p) => <button key={p.id} type="button" onClick={() => setPipelineId(p.id)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${pipelineId === p.id ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{p.name}</button>)}</div>
          <div className="overflow-x-auto rounded-[var(--radius-gross)] border border-linie bg-flaeche">
            <table className="w-full text-[13px]">
              <thead className="bg-flaeche-gedaempft text-left text-[11px] uppercase tracking-wide text-gedaempft"><tr><th className="px-3 py-2">Stufe</th><th className="px-3 py-2">Automationen</th></tr></thead>
              <tbody className="divide-y divide-linie">
                {stufen.filter((s) => s.pipeline_id === pipelineId).map((s) => {
                  const inStufe = automationen.filter((a) => a.stufe_id === s.id);
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="px-3 py-2 text-text">{s.name}<p className="text-[11px] text-gedaempft">{s.ist_gewonnen ? "gewonnen" : s.ist_verloren ? "verloren" : `${s.wahrscheinlichkeit} %`}</p></td>
                      <td className="px-3 py-2">
                        {inStufe.length === 0 ? <span className="text-gedaempft">—</span> : (
                          <ul className="space-y-1">
                            {inStufe.map((a) => (
                              <li key={a.id} className="flex flex-wrap items-center gap-2">
                                <Marke ton={a.aktiv ? "info" : "warnung"}>{KANAELE[a.kanal].split(" ")[0]}</Marke>
                                <span className="text-text">{a.name ?? vorlagen.find((v) => v.id === a.vorlage_id)?.name ?? "Automation"}</span>
                                <span className="text-[11px] text-gedaempft">{a.quelle_id ? `Quelle ${quellen.find((q) => q.id === a.quelle_id)?.name ?? "?"}` : "jede Quelle"} · nach {a.verzoegerung_stunden} h{!a.aktiv ? " · inaktiv" : ""}</span>
                                {darfVerwalten && <Button type="button" variante="leise" groesse="klein" onClick={() => setABearbeiten(a)}>Bearbeiten</Button>}
                                {darfVerwalten && <form action={automationLoeschen}><input type="hidden" name="id" value={a.id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {darfVerwalten ? (
            <form key={aBearbeiten?.id ?? "neu"} action={aAktion} className="grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-6">
              <input type="hidden" name="id" value={aBearbeiten?.id ?? ""} />
              <input type="hidden" name="pipeline_id" value={aBearbeiten?.pipeline_id ?? pipelineId} />
              <div className="sm:col-span-2"><Feld id="au-name" beschriftung={aBearbeiten ? "Automation bearbeiten" : "Neue Automation"} hinweis="Name (optional)"><Eingabe name="name" defaultValue={aBearbeiten?.name ?? ""} /></Feld></div>
              <Feld id="au-stufe" beschriftung="Bei Eintritt in Stufe" pflicht><Auswahl name="stufe_id" defaultValue={aBearbeiten?.stufe_id ?? stufenDerPipeline[0]?.id ?? ""} required>{stufenDerPipeline.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Auswahl></Feld>
              <Feld id="au-quelle" beschriftung="Nur bei Quelle"><Auswahl name="quelle_id" defaultValue={aBearbeiten?.quelle_id ?? ""}><option value="">jede Quelle</option>{quellen.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Auswahl></Feld>
              <Feld id="au-kanal" beschriftung="Kanal"><Auswahl name="kanal" value={aBearbeiten?.kanal ?? kanal} onChange={(e) => { setKanal(e.target.value as Kanal); if (aBearbeiten) setABearbeiten({ ...aBearbeiten, kanal: e.target.value as Kanal }); }}>{Object.entries(KANAELE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="au-verz" beschriftung="Verzögerung (Stunden)"><Eingabe name="verzoegerung_stunden" type="number" min={0} max={8760} defaultValue={aBearbeiten?.verzoegerung_stunden ?? 0} /></Feld>
              <div className="sm:col-span-3"><Feld id="au-vorlage" beschriftung="Vorlage"><Auswahl name="vorlage_id" defaultValue={aBearbeiten?.vorlage_id ?? ""}><option value="">— ohne (nur Name) —</option>{vorlagen.filter((v) => v.kanal === (aBearbeiten?.kanal ?? kanal)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Auswahl></Feld></div>
              <Feld id="au-aktiv" beschriftung="Status"><Auswahl name="aktiv" defaultValue={aBearbeiten?.aktiv === false ? "0" : "1"}><option value="1">aktiv</option><option value="0">inaktiv</option></Auswahl></Feld>
              {aErg.fehler && <Hinweis ton="fehler" className="sm:col-span-6">{aErg.fehler}</Hinweis>}
              {aErg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-6">{aErg.erfolg}</Hinweis>}
              <div className="sm:col-span-6 flex gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={aLaeuft}>{aBearbeiten ? "Speichern" : "Anlegen"}</Button>{aBearbeiten && <Button type="button" variante="leise" groesse="klein" onClick={() => setABearbeiten(null)}>Abbrechen</Button>}</div>
            </form>
          ) : <p className="text-[12px] text-gedaempft">Automationen legt die Verwaltung an.</p>}
        </div>
      )}

      {reiter === "vorlagen" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Karte>
            <KarteKopf><KarteTitel>Vorlagen</KarteTitel><KarteBeschreibung>Platzhalter: {PLATZHALTER.join(" ")}</KarteBeschreibung></KarteKopf>
            <KarteInhalt>
              {vorlagen.length === 0 ? <p className="text-[13px] text-gedaempft">Keine Vorlagen.</p> : (
                <ul className="divide-y divide-linie">
                  {vorlagen.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                      <Marke>{KANAELE[v.kanal].split(" ")[0]}</Marke>
                      <span className="min-w-0 flex-1 text-text">{v.name}{!v.aktiv && <span className="text-gedaempft"> · inaktiv</span>}</span>
                      {darfVerwalten && <Button type="button" variante="leise" groesse="klein" onClick={() => setVBearbeiten(v)}>Bearbeiten</Button>}
                      {darfVerwalten && <form action={vorlageLoeschen}><input type="hidden" name="id" value={v.id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
                    </li>
                  ))}
                </ul>
              )}
            </KarteInhalt>
          </Karte>
          {darfVerwalten && (
            <Karte>
              <KarteKopf><KarteTitel>{vBearbeiten ? `„${vBearbeiten.name}“ bearbeiten` : "Neue Vorlage"}</KarteTitel></KarteKopf>
              <KarteInhalt>
                <form key={vBearbeiten?.id ?? "neu"} action={vAktion} className="grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="id" value={vBearbeiten?.id ?? ""} />
                  <div className="sm:col-span-2"><Feld id="vo-name" beschriftung="Name" pflicht><Eingabe name="name" defaultValue={vBearbeiten?.name ?? ""} required /></Feld></div>
                  <Feld id="vo-kanal" beschriftung="Kanal"><Auswahl name="kanal" defaultValue={vBearbeiten?.kanal ?? "mail"}>{Object.entries(KANAELE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
                  <div className="sm:col-span-3"><Feld id="vo-betreff" beschriftung="Betreff / Aufgabentitel"><Eingabe name="betreff" defaultValue={vBearbeiten?.betreff ?? ""} /></Feld></div>
                  <div className="sm:col-span-3"><Feld id="vo-text" beschriftung="Text"><Textfeld name="text" rows={8} defaultValue={vBearbeiten?.text ?? ""} /></Feld></div>
                  <Feld id="vo-aktiv" beschriftung="Status"><Auswahl name="aktiv" defaultValue={vBearbeiten?.aktiv === false ? "0" : "1"}><option value="1">aktiv</option><option value="0">inaktiv</option></Auswahl></Feld>
                  {vErg.fehler && <Hinweis ton="fehler" className="sm:col-span-3">{vErg.fehler}</Hinweis>}
                  {vErg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-3">{vErg.erfolg}</Hinweis>}
                  <div className="sm:col-span-3 flex gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={vLaeuft}>Speichern</Button>{vBearbeiten && <Button type="button" variante="leise" groesse="klein" onClick={() => setVBearbeiten(null)}>Neu</Button>}</div>
                </form>
              </KarteInhalt>
            </Karte>
          )}
        </div>
      )}

      {reiter === "laeufe" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">{(["geplant", "erledigt", "abgebrochen", "fehler", "alle"] as const).map((s) => <button key={s} type="button" onClick={() => setLaufFilter(s)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${laufFilter === s ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{s === "alle" ? "Alle" : LAUF_STATUS[s]}</button>)}</div>
          {laeufe.filter((l) => laufFilter === "alle" || l.status === laufFilter).length === 0 ? <Hinweis>Keine Läufe.</Hinweis> : (
            <ul className="divide-y divide-linie rounded-[var(--radius-gross)] border border-linie bg-flaeche px-4">
              {laeufe.filter((l) => laufFilter === "alle" || l.status === laufFilter).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <Marke ton={l.status === "geplant" ? "info" : l.status === "erledigt" ? "erfolg" : l.status === "fehler" ? "fehler" : "neutral"}>{LAUF_STATUS[l.status]}</Marke>
                  <span className="text-text">{l.automation?.name ?? (l.automation ? KANAELE[l.automation.kanal] : "Automation")}</span>
                  {l.lead && <Link href={`/akquise/leads/${l.lead.id}`} className="text-akzent hover:underline">{l.lead.titel}</Link>}
                  <span className="text-[11px] text-gedaempft">{l.status === "geplant" ? `geplant ${zeitpunkt(l.geplant_am)}` : `${zeitpunkt(l.ausgefuehrt_am ?? l.geplant_am)}${l.fehler ? ` · ${l.fehler}` : ""}`}</span>
                  {darfAendern && l.status === "geplant" && <form action={laufAbbrechen} className="ml-auto"><input type="hidden" name="id" value={l.id} /><Button type="submit" variante="leise" groesse="klein">Abbrechen</Button></form>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-gedaempft">Läufe werden vom Tagesjob ausgeführt (Aufgabe beim Zuständigen oder Mail-Entwurf am Lead). Kein Versand ohne Freigabe.</p>
        </div>
      )}
    </div>
  );
}
