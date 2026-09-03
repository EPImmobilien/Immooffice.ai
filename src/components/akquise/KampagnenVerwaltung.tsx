"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { QUELLEN_ART, type Kampagne, type Pipeline, type Quelle } from "@/lib/akquise/stammdaten";
import { datum, euro } from "@/lib/format";
import { kampagneLoeschen, kampagneSpeichern, quelleLoeschen, quelleSpeichern, type AkquiseErgebnis } from "@/server/akquise-aktionen";

/** Kampagnen (Budget, Ausgaben, Laufzeit) und Quellen (Art, Kampagne, Ziel-Pipeline). */
export function KampagnenVerwaltung({ kampagnen, quellen, pipelines, leadsJeQuelle, leadsJeKampagne, darfAendern, darfLoeschen }: { kampagnen: Kampagne[]; quellen: Quelle[]; pipelines: Pipeline[]; leadsJeQuelle: Record<string, number>; leadsJeKampagne: Record<string, number>; darfAendern: boolean; darfLoeschen: boolean }) {
  const [kErg, kAktion, kLaeuft] = useActionState<AkquiseErgebnis, FormData>(kampagneSpeichern, {});
  const [qErg, qAktion, qLaeuft] = useActionState<AkquiseErgebnis, FormData>(quelleSpeichern, {});
  const [kBearbeiten, setKBearbeiten] = useState<Kampagne | null>(null);
  const [qBearbeiten, setQBearbeiten] = useState<Quelle | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Karte>
        <KarteKopf><KarteTitel>Kampagnen</KarteTitel><KarteBeschreibung>Budget und tatsächliche Ausgaben fließen in Kosten je Lead, Kosten je Abschluss und ROAS der Auswertung.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          {kampagnen.length === 0 ? <p className="text-[13px] text-gedaempft">Noch keine Kampagne.</p> : (
            <ul className="divide-y divide-linie">
              {kampagnen.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="text-text">{k.name} <Marke>{QUELLEN_ART[k.art]}</Marke> {!k.aktiv && <Marke ton="warnung">inaktiv</Marke>}</p>
                    <p className="text-[11px] text-gedaempft">{[k.kanal, k.budget !== null ? `Budget ${euro(k.budget)}` : null, `Ausgaben ${euro(k.ausgaben)}`, k.beginn || k.ende ? `${datum(k.beginn)} – ${datum(k.ende)}` : null, `${leadsJeKampagne[k.id] ?? 0} Leads`].filter(Boolean).join(" · ")}</p>
                  </div>
                  {darfAendern && <Button type="button" variante="leise" groesse="klein" onClick={() => setKBearbeiten(k)}>Bearbeiten</Button>}
                  {darfLoeschen && <form action={kampagneLoeschen}><input type="hidden" name="id" value={k.id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
                </li>
              ))}
            </ul>
          )}
          {darfAendern && (
            <form key={kBearbeiten?.id ?? "neu"} action={kAktion} className="grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={kBearbeiten?.id ?? ""} />
              <div className="sm:col-span-2"><Feld id="ka-name" beschriftung={kBearbeiten ? `Kampagne „${kBearbeiten.name}“ bearbeiten` : "Neue Kampagne"} pflicht><Eingabe name="name" defaultValue={kBearbeiten?.name ?? ""} required /></Feld></div>
              <Feld id="ka-art" beschriftung="Art"><Auswahl name="art" defaultValue={kBearbeiten?.art ?? "online"}>{Object.entries(QUELLEN_ART).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="ka-kanal" beschriftung="Kanal"><Eingabe name="kanal" defaultValue={kBearbeiten?.kanal ?? ""} placeholder="Google Ads, Postwurf, Messe …" /></Feld>
              <Feld id="ka-budget" beschriftung="Budget (€)"><Eingabe name="budget" defaultValue={kBearbeiten?.budget ?? ""} inputMode="decimal" /></Feld>
              <Feld id="ka-ausgaben" beschriftung="Ausgaben (€)"><Eingabe name="ausgaben" defaultValue={kBearbeiten?.ausgaben ?? 0} inputMode="decimal" /></Feld>
              <Feld id="ka-beginn" beschriftung="Beginn"><Eingabe name="beginn" type="date" defaultValue={kBearbeiten?.beginn ?? ""} /></Feld>
              <Feld id="ka-ende" beschriftung="Ende"><Eingabe name="ende" type="date" defaultValue={kBearbeiten?.ende ?? ""} /></Feld>
              <div className="sm:col-span-3"><Feld id="ka-notiz" beschriftung="Notiz"><Textfeld name="notiz" rows={1} defaultValue={kBearbeiten?.notiz ?? ""} /></Feld></div>
              <Feld id="ka-aktiv" beschriftung="Status"><Auswahl name="aktiv" defaultValue={kBearbeiten?.aktiv === false ? "0" : "1"}><option value="1">aktiv</option><option value="0">inaktiv</option></Auswahl></Feld>
              {kErg.fehler && <Hinweis ton="fehler" className="sm:col-span-4">{kErg.fehler}</Hinweis>}
              {kErg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-4">{kErg.erfolg}</Hinweis>}
              <div className="sm:col-span-4 flex gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={kLaeuft}>{kBearbeiten ? "Speichern" : "Anlegen"}</Button>{kBearbeiten && <Button type="button" variante="leise" groesse="klein" onClick={() => setKBearbeiten(null)}>Abbrechen</Button>}</div>
            </form>
          )}
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf><KarteTitel>Quellen</KarteTitel><KarteBeschreibung>Woher ein Lead kommt. Eine Quelle kann einer Kampagne und einer Ziel-Pipeline zugeordnet sein; Automationen filtern nach Quelle.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          <ul className="divide-y divide-linie">
            {quellen.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="text-text">{q.name} <Marke>{QUELLEN_ART[q.art]}</Marke> {!q.aktiv && <Marke ton="warnung">inaktiv</Marke>}</p>
                  <p className="text-[11px] text-gedaempft">{[q.kampagne_id ? `Kampagne ${kampagnen.find((k) => k.id === q.kampagne_id)?.name ?? "?"}` : null, q.pipeline_id ? `Pipeline ${pipelines.find((p) => p.id === q.pipeline_id)?.name ?? "?"}` : "Standard-Pipeline", `${leadsJeQuelle[q.id] ?? 0} Leads`].filter(Boolean).join(" · ")}</p>
                </div>
                {darfAendern && <Button type="button" variante="leise" groesse="klein" onClick={() => setQBearbeiten(q)}>Bearbeiten</Button>}
                {darfLoeschen && <form action={quelleLoeschen}><input type="hidden" name="id" value={q.id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
              </li>
            ))}
          </ul>
          {darfAendern && (
            <form key={qBearbeiten?.id ?? "neu"} action={qAktion} className="grid gap-2 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={qBearbeiten?.id ?? ""} />
              <div className="sm:col-span-2"><Feld id="qu-name" beschriftung={qBearbeiten ? `Quelle „${qBearbeiten.name}“ bearbeiten` : "Neue Quelle"} pflicht><Eingabe name="name" defaultValue={qBearbeiten?.name ?? ""} required /></Feld></div>
              <Feld id="qu-art" beschriftung="Art"><Auswahl name="art" defaultValue={qBearbeiten?.art ?? "online"}>{Object.entries(QUELLEN_ART).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="qu-aktiv" beschriftung="Status"><Auswahl name="aktiv" defaultValue={qBearbeiten?.aktiv === false ? "0" : "1"}><option value="1">aktiv</option><option value="0">inaktiv</option></Auswahl></Feld>
              <div className="sm:col-span-2"><Feld id="qu-kampagne" beschriftung="Kampagne"><Auswahl name="kampagne_id" defaultValue={qBearbeiten?.kampagne_id ?? ""}><option value="">— ohne —</option>{kampagnen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
              <div className="sm:col-span-2"><Feld id="qu-pipeline" beschriftung="Ziel-Pipeline"><Auswahl name="pipeline_id" defaultValue={qBearbeiten?.pipeline_id ?? ""}><option value="">— Standard —</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Auswahl></Feld></div>
              {qErg.fehler && <Hinweis ton="fehler" className="sm:col-span-4">{qErg.fehler}</Hinweis>}
              {qErg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-4">{qErg.erfolg}</Hinweis>}
              <div className="sm:col-span-4 flex gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={qLaeuft}>{qBearbeiten ? "Speichern" : "Anlegen"}</Button>{qBearbeiten && <Button type="button" variante="leise" groesse="klein" onClick={() => setQBearbeiten(null)}>Abbrechen</Button>}</div>
            </form>
          )}
        </KarteInhalt>
      </Karte>
    </div>
  );
}
