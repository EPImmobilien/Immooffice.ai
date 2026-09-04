"use client";

import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { berechnen, m2, neuerRaum, neuesGeschoss, neuesTeil, TEILART, teilAnrechenbar, teilGrundflaeche, type Teilart, type Wohnflaechenblatt } from "@/lib/werkzeuge/wohnflaeche";
import { wohnflaecheLoeschen, wohnflaecheSpeichern, wohnflaecheUebernehmen, type WerkzeugErgebnis } from "@/server/werkzeuge-aktionen";

function zahl(w: string): number | null {
  const t = w.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function anzeige(n: number | null): string {
  return n === null ? "" : String(n).replace(".", ",");
}

/**
 * Wohnflaechenrechner nach WoFlV (Referenz-Werkzeug): Geschosse, Raeume,
 * Teilflaechen mit Laenge × Breite oder direkter Flaeche, Anrechnungsart
 * (voll, halb, nicht, Balkon, Wintergarten, Zubehoer), Abzuege; Summen live;
 * PDF; Uebernahme ins Objekt.
 */
export function WohnflaechenRechner({ id, start, objekte, objektId, uebernommenAm }: { id: string | null; start: Wohnflaechenblatt; objekte: Array<{ id: string; bezeichnung: string }>; objektId: string | null; uebernommenAm: string | null }) {
  const [blatt, setBlatt] = useState<Wohnflaechenblatt>(start);
  const [objekt, setObjekt] = useState(objektId ?? "");
  const [speichern, speichernAktion, speichert] = useActionState<WerkzeugErgebnis, FormData>(wohnflaecheSpeichern, {});
  const [uebernehmen, uebernehmenAktion, uebernimmt] = useActionState<WerkzeugErgebnis, FormData>(wohnflaecheUebernehmen, {});
  const e = berechnen(blatt);

  const setzen = (neu: Partial<Wohnflaechenblatt>) => setBlatt((alt) => ({ ...alt, ...neu }));
  const geschossSetzen = (gi: number, f: (g: Wohnflaechenblatt["geschosse"][number]) => Wohnflaechenblatt["geschosse"][number]) => setBlatt((alt) => ({ ...alt, geschosse: alt.geschosse.map((g, i) => (i === gi ? f(g) : g)) }));
  const raumSetzen = (gi: number, ri: number, f: (r: Wohnflaechenblatt["geschosse"][number]["raeume"][number]) => Wohnflaechenblatt["geschosse"][number]["raeume"][number]) => geschossSetzen(gi, (g) => ({ ...g, raeume: g.raeume.map((r, i) => (i === ri ? f(r) : r)) }));
  const teilSetzen = (gi: number, ri: number, ti: number, p: Partial<ReturnType<typeof neuesTeil>>) => raumSetzen(gi, ri, (r) => ({ ...r, teile: r.teile.map((t, i) => (i === ti ? { ...t, ...p } : t)) }));

  return (
    <div className="space-y-5">
      <form action={speichernAktion} className="space-y-5">
        {id && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="blatt" value={JSON.stringify(blatt)} />
        <input type="hidden" name="objekt_id" value={objekt} />
        {speichern.fehler && <Hinweis ton="fehler">{speichern.fehler}</Hinweis>}
        {speichern.erfolg && <Hinweis ton="erfolg">{speichern.erfolg}</Hinweis>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Feld id="wf-bez" beschriftung="Bezeichnung"><Eingabe value={blatt.bezeichnung} onChange={(ev) => setzen({ bezeichnung: ev.target.value })} placeholder="Wohnung 2. OG links" /></Feld>
          <Feld id="wf-adresse" beschriftung="Anschrift (für das PDF)"><Eingabe value={blatt.adresse} onChange={(ev) => setzen({ adresse: ev.target.value })} /></Feld>
          <Feld id="wf-objekt" beschriftung="Objekt"><Auswahl value={objekt} onChange={(ev) => setObjekt(ev.target.value)}><option value="">— ohne —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
        </div>

        {blatt.geschosse.map((g, gi) => {
          const eg = e.geschosse[gi];
          return (
            <Karte key={g.id}>
              <KarteKopf>
                <div className="flex flex-wrap items-center gap-3">
                  <Eingabe value={g.name} onChange={(ev) => geschossSetzen(gi, (x) => ({ ...x, name: ev.target.value }))} className="w-56 font-medium" aria-label="Geschoss" />
                  <span className="text-[13px] text-gedaempft">Wohnfläche {m2(eg?.wohnflaeche ?? 0)}</span>
                  {blatt.geschosse.length > 1 && <button type="button" className="ml-auto text-[12px] text-gedaempft hover:text-fehler" onClick={() => setzen({ geschosse: blatt.geschosse.filter((_, i) => i !== gi) })}>Geschoss entfernen</button>}
                </div>
              </KarteKopf>
              <KarteInhalt className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-[13px]">
                    <thead><tr className="text-left text-gedaempft"><th className="py-1 pr-2 font-medium">Raum</th><th className="py-1 pr-2 font-medium">Teilfläche</th><th className="w-24 py-1 pr-2 font-medium">Länge (m)</th><th className="w-24 py-1 pr-2 font-medium">Breite (m)</th><th className="w-24 py-1 pr-2 font-medium">oder m²</th><th className="w-64 py-1 pr-2 font-medium">Anrechnung</th><th className="w-16 py-1 pr-2 font-medium">Abzug</th><th className="w-24 py-1 text-right font-medium">Grund</th><th className="w-24 py-1 text-right font-medium">Wohnfl.</th><th className="w-8"></th></tr></thead>
                    <tbody>
                      {g.raeume.map((r, ri) => (
                        r.teile.map((t, ti) => (
                          <tr key={t.id} className={`align-middle ${ti === 0 ? "border-t border-linie" : ""}`}>
                            <td className="py-1 pr-2">{ti === 0 ? <Eingabe value={r.name} onChange={(ev) => raumSetzen(gi, ri, (x) => ({ ...x, name: ev.target.value }))} aria-label="Raumname" /> : null}</td>
                            <td className="py-1 pr-2"><Eingabe value={t.bezeichnung} placeholder={ti === 0 ? "Hauptfläche" : "z. B. Schräge"} onChange={(ev) => teilSetzen(gi, ri, ti, { bezeichnung: ev.target.value })} aria-label="Teilfläche" /></td>
                            <td className="py-1 pr-2"><Eingabe inputMode="decimal" defaultValue={anzeige(t.laenge)} onBlur={(ev) => teilSetzen(gi, ri, ti, { laenge: zahl(ev.target.value) })} aria-label="Länge" /></td>
                            <td className="py-1 pr-2"><Eingabe inputMode="decimal" defaultValue={anzeige(t.breite)} onBlur={(ev) => teilSetzen(gi, ri, ti, { breite: zahl(ev.target.value) })} aria-label="Breite" /></td>
                            <td className="py-1 pr-2"><Eingabe inputMode="decimal" defaultValue={anzeige(t.flaeche)} onBlur={(ev) => teilSetzen(gi, ri, ti, { flaeche: zahl(ev.target.value) })} aria-label="Fläche" /></td>
                            <td className="py-1 pr-2"><Auswahl value={t.art} onChange={(ev) => teilSetzen(gi, ri, ti, { art: ev.target.value as Teilart })} aria-label="Anrechnung">{(Object.keys(TEILART) as Teilart[]).map((a) => <option key={a} value={a}>{TEILART[a].bezeichnung}</option>)}</Auswahl></td>
                            <td className="py-1 pr-2 text-center"><input type="checkbox" checked={t.abzug} onChange={(ev) => teilSetzen(gi, ri, ti, { abzug: ev.target.checked })} aria-label="Abzug" className="h-4 w-4 accent-akzent" /></td>
                            <td className="py-1 text-right tabular-nums text-gedaempft">{m2(teilGrundflaeche(t))}</td>
                            <td className="py-1 text-right tabular-nums">{m2(teilAnrechenbar(t))}</td>
                            <td className="py-1 text-right">
                              {ti === r.teile.length - 1 ? (
                                <button type="button" aria-label="Teilfläche hinzufügen" title="Teilfläche hinzufügen" className="text-akzent" onClick={() => raumSetzen(gi, ri, (x) => ({ ...x, teile: [...x.teile, neuesTeil("halb", "")] }))}>＋</button>
                              ) : null}
                              {r.teile.length > 1 && <button type="button" aria-label="Teilfläche entfernen" className="ml-1 text-gedaempft hover:text-fehler" onClick={() => raumSetzen(gi, ri, (x) => ({ ...x, teile: x.teile.filter((_, i) => i !== ti) }))}>✕</button>}
                              {ti === 0 && <button type="button" aria-label="Raum entfernen" title="Raum entfernen" className="ml-1 text-gedaempft hover:text-fehler" onClick={() => geschossSetzen(gi, (x) => ({ ...x, raeume: x.raeume.filter((_, i) => i !== ri) }))}>🗑</button>}
                            </td>
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Wohnzimmer", "Schlafzimmer", "Kinderzimmer", "Küche", "Bad", "WC", "Flur", "Abstellraum", "Balkon", "Terrasse", "Keller"].map((n) => (
                    <button key={n} type="button" className="rounded-[var(--radius)] border border-linie bg-flaeche px-2.5 py-1 text-[12px] text-gedaempft hover:border-akzent/50 hover:text-text" onClick={() => geschossSetzen(gi, (x) => ({ ...x, raeume: [...x.raeume, { ...neuerRaum(n), teile: [neuesTeil(n === "Balkon" || n === "Terrasse" ? "balkon" : n === "Keller" ? "zubehoer" : "voll")] }] }))}>+ {n}</button>
                  ))}
                  <button type="button" className="rounded-[var(--radius)] border border-linie bg-flaeche px-2.5 py-1 text-[12px] text-text hover:border-akzent/50" onClick={() => geschossSetzen(gi, (x) => ({ ...x, raeume: [...x.raeume, neuerRaum("Raum")] }))}>+ Raum</button>
                </div>
              </KarteInhalt>
            </Karte>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variante="sekundaer" onClick={() => setzen({ geschosse: [...blatt.geschosse, neuesGeschoss(blatt.geschosse.length === 1 ? "Obergeschoss" : `Geschoss ${blatt.geschosse.length + 1}`)] })}>Geschoss hinzufügen</Button>
        </div>

        <Karte>
          <KarteKopf><KarteTitel>Ergebnis</KarteTitel><KarteBeschreibung>Nach WoFlV: Höhe ab 2 m voll, 1–2 m halb, unter 1 m nicht; Balkone ¼ (bis ½); Wintergärten ½; Zubehörräume nicht.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-[12px] uppercase tracking-wide text-gedaempft">Grundfläche</p><p className="font-titel text-xl font-semibold text-text">{m2(e.grundflaeche)}</p></div>
            <div><p className="text-[12px] uppercase tracking-wide text-gedaempft">Wohnfläche nach WoFlV</p><p className="font-titel text-xl font-semibold text-akzent">{m2(e.wohnflaeche)}</p></div>
            <Feld id="wf-hinweis" beschriftung="Hinweis im PDF"><Eingabe value={blatt.hinweis} onChange={(ev) => setzen({ hinweis: ev.target.value })} placeholder="z. B. Maße aus dem Grundriss, nicht vor Ort geprüft" /></Feld>
          </KarteInhalt>
        </Karte>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={speichert}>{speichert ? "Speichert …" : id ? "Speichern" : "Berechnung anlegen"}</Button>
          {id && <a href={`/api/dokumente/wohnflaeche/${id}?format=pdf`} target="_blank" rel="noreferrer" className={buttonKlassen({ variante: "sekundaer" })}>PDF</a>}
          {id && <a href={`/api/dokumente/wohnflaeche/${id}?format=docx`} className={buttonKlassen({ variante: "sekundaer" })}>Word</a>}
        </div>
      </form>

      {id && (
        <div className="flex flex-wrap items-center gap-3">
          <form action={uebernehmenAktion}><input type="hidden" name="id" value={id} /><Button type="submit" variante="sekundaer" disabled={uebernimmt || !objektId}>{uebernimmt ? "Übernimmt …" : "Wohnfläche ins Objekt übernehmen"}</Button></form>
          {uebernommenAm && <span className="text-[12px] text-gedaempft">Zuletzt übernommen {new Date(uebernommenAm).toLocaleString("de-DE")}</span>}
          {uebernehmen.fehler && <Hinweis ton="fehler">{uebernehmen.fehler}</Hinweis>}
          {uebernehmen.erfolg && <Hinweis ton="erfolg">{uebernehmen.erfolg}</Hinweis>}
          <form action={wohnflaecheLoeschen} className="ml-auto"><input type="hidden" name="id" value={id} /><Button type="submit" variante="leise" groesse="klein">Berechnung löschen</Button></form>
        </div>
      )}
    </div>
  );
}
