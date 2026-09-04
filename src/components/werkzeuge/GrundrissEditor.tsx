"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { amRaster, ausdehnung, ausRaumscan, grundrissSvg, MOEBEL, neueId, polygonFlaecheM2, punktAufWand, wandLaenge, type Grundriss, type MoebelArt, type Punkt } from "@/lib/werkzeuge/grundriss";
import { grundrissAlsBild, grundrissLoeschen, grundrissSpeichern, grundrissZurWohnflaeche, type WerkzeugErgebnis } from "@/server/werkzeuge-aktionen";

type Werkzeug = "wand" | "tuer" | "fenster" | "raum" | "moebel" | "mass" | "text" | "loeschen" | "vorlage";
const WERKZEUGE: Array<[Werkzeug, string]> = [["wand", "Wand"], ["tuer", "Tür"], ["fenster", "Fenster"], ["raum", "Raum"], ["moebel", "Möbel"], ["mass", "Maß"], ["text", "Text"], ["loeschen", "Löschen"], ["vorlage", "Vorlage"]];

/**
 * Grundriss-Editor (Referenz-Werkzeug): Waende ziehen (am Raster), Tueren
 * und Fenster auf Waende setzen, Raeume als Polygon mit Namen und Flaeche,
 * Moebel, Masslinien, Texte, Undo; Vorlage (Aufbereiter): vorhandenen Plan
 * hinterlegen, skalieren, nachzeichnen; Raumscan-Import; Export PNG/SVG;
 * Ablage als Objektbild; Uebergabe an den Wohnflaechenrechner.
 */
export function GrundrissEditor({ id, start, objekte, objektId, vorlageUrl, vorlagePfad, quelle }: { id: string | null; start: Grundriss; objekte: Array<{ id: string; bezeichnung: string }>; objektId: string | null; vorlageUrl: string | null; vorlagePfad?: string | null; quelle: "editor" | "scan" | "aufbereitet" }) {
  const [g, setG] = useState<Grundriss>(start);
  const [verlauf, setVerlauf] = useState<Grundriss[]>([]);
  const [werkzeug, setWerkzeug] = useState<Werkzeug>("wand");
  const [moebelArt, setMoebelArt] = useState<MoebelArt>("sofa");
  const [zoom, setZoom] = useState(0.5);
  const [ziehen, setZiehen] = useState<Punkt | null>(null);
  const [maus, setMaus] = useState<Punkt | null>(null);
  const [polygon, setPolygon] = useState<Punkt[]>([]);
  const [objekt, setObjekt] = useState(objektId ?? "");
  const [quelleZustand, setQuelle] = useState(quelle);
  const [vorlageBild, setVorlageBild] = useState<string | null>(vorlageUrl);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [speichern, speichernAktion, speichert] = useActionState<WerkzeugErgebnis, FormData>(grundrissSpeichern, {});
  const [bild, bildAktion, legtAb] = useActionState<WerkzeugErgebnis, FormData>(grundrissAlsBild, {});
  const [wf, wfAktion, uebergibt] = useActionState<WerkzeugErgebnis, FormData>(grundrissZurWohnflaeche, {});
  const [png, setPng] = useState("");

  const aendern = (f: (alt: Grundriss) => Grundriss) => { setVerlauf((v) => [...v.slice(-30), g]); setG(f); };
  const rueckgaengig = () => { const letzter = verlauf[verlauf.length - 1]; if (letzter) { setG(letzter); setVerlauf((v) => v.slice(0, -1)); } };
  const box = ausdehnung(g, 200);
  const breite = Math.max(1200, box.breite);
  const hoehe = Math.max(800, box.hoehe);
  const ursprung = { x: Math.min(0, box.x), y: Math.min(0, box.y) };

  const punktAus = (ev: React.MouseEvent<SVGSVGElement>): Punkt => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const x = (ev.clientX - r.left) / zoom + ursprung.x;
    const y = (ev.clientY - r.top) / zoom + ursprung.y;
    return { x: amRaster(x, g.raster), y: amRaster(y, g.raster) };
  };
  const naechsteWand = (p: Punkt) => {
    let beste: { id: string; position: number; abstand: number } | null = null;
    for (const w of g.waende) {
      const L = wandLaenge(w) || 1;
      const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / (L * L)));
      const q = punktAufWand(w, t);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (!beste || d < beste.abstand) beste = { id: w.id, position: t, abstand: d };
    }
    return beste && beste.abstand <= 40 ? beste : null;
  };

  const klick = (ev: React.MouseEvent<SVGSVGElement>) => {
    const p = punktAus(ev);
    if (werkzeug === "wand" || werkzeug === "mass") {
      if (!ziehen) { setZiehen(p); return; }
      if (Math.hypot(p.x - ziehen.x, p.y - ziehen.y) >= g.raster) {
        if (werkzeug === "wand") aendern((alt) => ({ ...alt, waende: [...alt.waende, { id: neueId("w"), a: ziehen, b: p, staerke: 20 }] }));
        else aendern((alt) => ({ ...alt, masse: [...alt.masse, { id: neueId("d"), a: ziehen, b: p }] }));
      }
      setZiehen(werkzeug === "wand" ? p : null);
      return;
    }
    if (werkzeug === "tuer" || werkzeug === "fenster") {
      const w = naechsteWand(p);
      if (!w) { setHinweis("Bitte nahe an eine Wand klicken."); return; }
      aendern((alt) => ({ ...alt, oeffnungen: [...alt.oeffnungen, { id: neueId("o"), art: werkzeug, wand_id: w.id, position: Math.round(w.position * 100) / 100, breite: werkzeug === "tuer" ? 90 : 120, anschlag: "links" }] }));
      return;
    }
    if (werkzeug === "raum") {
      const erster = polygon[0];
      if (erster && polygon.length >= 3 && Math.hypot(p.x - erster.x, p.y - erster.y) < g.raster * 2) {
        const name = window.prompt("Raumname", `Raum ${g.raeume.length + 1}`) ?? "Raum";
        aendern((alt) => ({ ...alt, raeume: [...alt.raeume, { id: neueId("r"), name, polygon }] }));
        setPolygon([]);
        return;
      }
      setPolygon((alt) => [...alt, p]);
      return;
    }
    if (werkzeug === "moebel") {
      const m = MOEBEL[moebelArt];
      aendern((alt) => ({ ...alt, moebel: [...alt.moebel, { id: neueId("m"), art: moebelArt, x: p.x - m.breite / 2, y: p.y - m.tiefe / 2, breite: m.breite, tiefe: m.tiefe, drehung: 0 }] }));
      return;
    }
    if (werkzeug === "text") {
      const t = window.prompt("Text");
      if (t) aendern((alt) => ({ ...alt, texte: [...alt.texte, { id: neueId("t"), x: p.x, y: p.y, text: t, groesse: 20 }] }));
      return;
    }
  };

  const elementLoeschen = (art: "waende" | "oeffnungen" | "raeume" | "moebel" | "masse" | "texte", elId: string) => {
    if (werkzeug !== "loeschen") return;
    aendern((alt) => ({ ...alt, [art]: (alt[art] as Array<{ id: string }>).filter((x) => x.id !== elId), ...(art === "waende" ? { oeffnungen: alt.oeffnungen.filter((o) => o.wand_id !== elId) } : {}) }));
  };

  const vorlageLaden = (f: File | undefined) => {
    if (!f) return;
    const leser = new FileReader();
    leser.onload = () => {
      const url = String(leser.result);
      const img = new Image();
      img.onload = () => {
        // Grob: der Plan wird auf 1000 cm Breite gesetzt; Skalierung danach ueber „cm je Pixel"
        const cmJePixel = 1000 / img.width;
        setVorlageBild(url);
        aendern((alt) => ({ ...alt, vorlage: { quelle: url, cmJePixel, x: 0, y: 0, deckkraft: 0.4, breitePx: img.width, hoehePx: img.height } }));
        setQuelle("aufbereitet");
      };
      img.src = url;
    };
    leser.readAsDataURL(f);
  };
  const scanLaden = async (f: File | undefined) => {
    if (!f) return;
    try {
      const roh = JSON.parse(await f.text()) as unknown;
      const { grundriss, hinweis: h } = ausRaumscan(roh, g.titel);
      aendern(() => ({ ...grundriss, titel: g.titel }));
      setQuelle("scan");
      setHinweis(`Scan übernommen: ${h}`);
    } catch {
      setHinweis("Die Scan-Datei konnte nicht gelesen werden (erwartet wird eine JSON-Datei, z. B. RoomPlan-Export).");
    }
  };
  const alsPng = async (): Promise<string> => {
    const svg = grundrissSvg(g, { hintergrund: true });
    const b = ausdehnung(g);
    const canvas = document.createElement("canvas");
    const faktor = Math.min(2, 2400 / Math.max(b.breite, 1));
    canvas.width = Math.round(b.breite * faktor);
    canvas.height = Math.round(b.hoehe * faktor);
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    await new Promise<void>((ok, nein) => { img.onload = () => ok(); img.onerror = () => nein(new Error("SVG")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  const herunterladen = async (format: "png" | "svg") => {
    const a = document.createElement("a");
    a.download = `${g.titel.replace(/[^\w-]+/g, "_") || "Grundriss"}.${format}`;
    a.href = format === "svg" ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(grundrissSvg(g))}` : await alsPng();
    a.click();
  };
  const raeumeFlaeche = g.raeume.reduce((s, r) => s + polygonFlaecheM2(r.polygon), 0);
  const vorlage = g.vorlage;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {WERKZEUGE.map(([w, n]) => <button key={w} type="button" onClick={() => { setWerkzeug(w); setZiehen(null); setPolygon([]); }} className={`rounded-[var(--radius)] border px-3 py-1 text-[13px] ${werkzeug === w ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{n}</button>)}
        {werkzeug === "moebel" && <Auswahl value={moebelArt} onChange={(e) => setMoebelArt(e.target.value as MoebelArt)} className="w-auto" aria-label="Möbelart">{(Object.keys(MOEBEL) as MoebelArt[]).map((m) => <option key={m} value={m}>{MOEBEL[m].bezeichnung}</option>)}</Auswahl>}
        <span className="ml-auto flex items-center gap-1 text-[12px] text-gedaempft">
          Raster <Auswahl value={String(g.raster)} onChange={(e) => setG((alt) => ({ ...alt, raster: Number(e.target.value) }))} className="w-auto" aria-label="Raster">{[5, 10, 25, 50].map((r) => <option key={r} value={r}>{r} cm</option>)}</Auswahl>
          Zoom <button type="button" className="px-1" onClick={() => setZoom((z) => Math.max(0.15, z / 1.25))} aria-label="Verkleinern">−</button>{Math.round(zoom * 100)} %<button type="button" className="px-1" onClick={() => setZoom((z) => Math.min(3, z * 1.25))} aria-label="Vergrößern">+</button>
          <Button type="button" variante="leise" groesse="klein" onClick={rueckgaengig} disabled={verlauf.length === 0}>Rückgängig</Button>
        </span>
      </div>
      {werkzeug === "vorlage" && (
        <div className="grid gap-3 rounded-[var(--radius)] border border-linie bg-hintergrund p-3 sm:grid-cols-4">
          <Feld id="gr-vorlage" beschriftung="Plan hinterlegen (Foto/Scan des Grundrisses)"><input id="gr-vorlage" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => vorlageLaden(e.target.files?.[0])} className="block w-full text-[13px] file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px]" /></Feld>
          <Feld id="gr-scan" beschriftung="Raumscan importieren (JSON)"><input id="gr-scan" type="file" accept="application/json,.json" onChange={(e) => void scanLaden(e.target.files?.[0])} className="block w-full text-[13px] file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px]" /></Feld>
          {vorlage && (
            <>
              <Feld id="gr-skala" beschriftung="Maßstab: cm je Pixel" hinweis="Bekannte Wandlänge messen und anpassen"><Eingabe inputMode="decimal" defaultValue={String(vorlage.cmJePixel).replace(".", ",")} onBlur={(e) => setG((alt) => alt.vorlage ? { ...alt, vorlage: { ...alt.vorlage, cmJePixel: Number(e.target.value.replace(",", ".")) || alt.vorlage.cmJePixel } } : alt)} /></Feld>
              <Feld id="gr-deck" beschriftung="Deckkraft der Vorlage"><input id="gr-deck" type="range" min={0} max={1} step={0.05} value={vorlage.deckkraft} onChange={(e) => setG((alt) => alt.vorlage ? { ...alt, vorlage: { ...alt.vorlage, deckkraft: Number(e.target.value) } } : alt)} className="w-full accent-akzent" /></Feld>
            </>
          )}
        </div>
      )}
      {hinweis && <Hinweis ton="info">{hinweis}</Hinweis>}
      <p className="text-[12px] text-gedaempft">{werkzeug === "wand" ? "Klick setzt Start, weiterer Klick zieht die Wand (Kette); Werkzeug wechseln beendet." : werkzeug === "raum" ? "Ecken nacheinander anklicken; Klick auf die erste Ecke schließt den Raum und fragt den Namen." : werkzeug === "tuer" || werkzeug === "fenster" ? "Auf eine Wand klicken." : werkzeug === "loeschen" ? "Element anklicken, um es zu entfernen." : werkzeug === "mass" ? "Zwei Punkte anklicken." : werkzeug === "moebel" ? "Möbelart wählen, dann klicken." : werkzeug === "text" ? "Klicken und Text eingeben." : "Plan oder Scan laden."}</p>

      <div className="overflow-auto rounded-[var(--radius-gross)] border border-linie bg-flaeche" style={{ maxHeight: 640 }}>
        <svg ref={svgRef} width={breite * zoom} height={hoehe * zoom} viewBox={`${ursprung.x} ${ursprung.y} ${breite} ${hoehe}`} onClick={klick} onMouseMove={(ev) => setMaus(punktAus(ev))} role="img" aria-label="Zeichenfläche" style={{ cursor: werkzeug === "loeschen" ? "not-allowed" : "crosshair", display: "block" }}>
          <defs><pattern id="raster" width={g.raster * 5} height={g.raster * 5} patternUnits="userSpaceOnUse"><path d={`M ${g.raster * 5} 0 L 0 0 0 ${g.raster * 5}`} fill="none" stroke="#E6E8EB" strokeWidth="1" /></pattern></defs>
          <rect x={ursprung.x} y={ursprung.y} width={breite} height={hoehe} fill="url(#raster)" />
          {vorlage && vorlageBild && <image href={vorlageBild} x={vorlage.x} y={vorlage.y} width={vorlage.breitePx * vorlage.cmJePixel} height={vorlage.hoehePx * vorlage.cmJePixel} opacity={vorlage.deckkraft} style={{ pointerEvents: "none" }} preserveAspectRatio="none" />}
          {g.raeume.map((r) => (
            <g key={r.id} onClick={() => elementLoeschen("raeume", r.id)}>
              <polygon points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill="#f5f2ea" stroke="#d8d2c4" strokeWidth="1" />
              <text x={r.polygon.reduce((s, p) => s + p.x, 0) / r.polygon.length} y={r.polygon.reduce((s, p) => s + p.y, 0) / r.polygon.length} textAnchor="middle" fontSize="22" fill="#1B2A47">{r.name}</text>
              <text x={r.polygon.reduce((s, p) => s + p.x, 0) / r.polygon.length} y={r.polygon.reduce((s, p) => s + p.y, 0) / r.polygon.length + 24} textAnchor="middle" fontSize="18" fill="#7A828C">{polygonFlaecheM2(r.polygon).toLocaleString("de-DE", { minimumFractionDigits: 2 })} m²</text>
            </g>
          ))}
          {g.moebel.map((m) => (
            <g key={m.id} transform={`rotate(${m.drehung} ${m.x + m.breite / 2} ${m.y + m.tiefe / 2})`} onClick={(ev) => { if (werkzeug === "loeschen") { ev.stopPropagation(); elementLoeschen("moebel", m.id); } else if (werkzeug === "moebel") { ev.stopPropagation(); aendern((alt) => ({ ...alt, moebel: alt.moebel.map((x) => (x.id === m.id ? { ...x, drehung: (x.drehung + 90) % 360 } : x)) })); } }}>
              <rect x={m.x} y={m.y} width={m.breite} height={m.tiefe} fill="#fff" stroke="#7A828C" strokeWidth="2" rx="4" />
              <text x={m.x + m.breite / 2} y={m.y + m.tiefe / 2 + 5} textAnchor="middle" fontSize="13" fill="#7A828C">{MOEBEL[m.art].bezeichnung}</text>
            </g>
          ))}
          {g.waende.map((w) => <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#1B2A47" strokeWidth={w.staerke} strokeLinecap="square" onClick={(ev) => { if (werkzeug === "loeschen") { ev.stopPropagation(); elementLoeschen("waende", w.id); } }} />)}
          {g.oeffnungen.map((o) => {
            const w = g.waende.find((x) => x.id === o.wand_id);
            if (!w) return null;
            const l = wandLaenge(w) || 1;
            const m = punktAufWand(w, o.position);
            const dx = (w.b.x - w.a.x) / l;
            const dy = (w.b.y - w.a.y) / l;
            const h = o.breite / 2;
            const p1 = { x: m.x - dx * h, y: m.y - dy * h };
            const p2 = { x: m.x + dx * h, y: m.y + dy * h };
            return (
              <g key={o.id} onClick={(ev) => { if (werkzeug === "loeschen") { ev.stopPropagation(); elementLoeschen("oeffnungen", o.id); } else if (werkzeug === "tuer" && o.art === "tuer") { ev.stopPropagation(); aendern((alt) => ({ ...alt, oeffnungen: alt.oeffnungen.map((x) => (x.id === o.id ? { ...x, anschlag: x.anschlag === "links" ? "rechts" : "links" } : x)) })); } }}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fff" strokeWidth={w.staerke + 2} />
                {o.art === "tuer" ? <path d={`M ${p1.x} ${p1.y} L ${p1.x + -dy * (o.anschlag === "rechts" ? -1 : 1) * o.breite} ${p1.y + dx * (o.anschlag === "rechts" ? -1 : 1) * o.breite} A ${o.breite} ${o.breite} 0 0 ${o.anschlag === "rechts" ? 0 : 1} ${p2.x} ${p2.y}`} fill="none" stroke="#B5934F" strokeWidth="2" /> : <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3E6E8E" strokeWidth="4" />}
              </g>
            );
          })}
          {g.masse.map((ms) => (
            <g key={ms.id} onClick={() => elementLoeschen("masse", ms.id)}>
              <line x1={ms.a.x} y1={ms.a.y} x2={ms.b.x} y2={ms.b.y} stroke="#7A828C" strokeWidth="1.5" />
              <text x={(ms.a.x + ms.b.x) / 2} y={(ms.a.y + ms.b.y) / 2 - 6} textAnchor="middle" fontSize="15" fill="#7A828C">{(Math.hypot(ms.b.x - ms.a.x, ms.b.y - ms.a.y) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</text>
            </g>
          ))}
          {g.texte.map((t) => <text key={t.id} x={t.x} y={t.y} fontSize={t.groesse} fill="#1B2A47" onClick={() => elementLoeschen("texte", t.id)}>{t.text}</text>)}
          {ziehen && maus && <line x1={ziehen.x} y1={ziehen.y} x2={maus.x} y2={maus.y} stroke="#B5934F" strokeWidth={werkzeug === "wand" ? 20 : 1.5} strokeDasharray="8 6" opacity="0.6" />}
          {polygon.length > 0 && <polyline points={[...polygon, ...(maus ? [maus] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#B5934F" strokeWidth="2" strokeDasharray="8 6" />}
          {polygon[0] && <circle cx={polygon[0].x} cy={polygon[0].y} r={g.raster} fill="#B5934F" opacity="0.5" />}
        </svg>
      </div>
      <p className="text-[12px] text-gedaempft">{g.waende.length} Wände · {g.oeffnungen.length} Öffnungen · {g.raeume.length} Räume ({raeumeFlaeche.toLocaleString("de-DE", { minimumFractionDigits: 2 })} m²) · {g.moebel.length} Möbel{maus ? ` · Cursor ${(maus.x / 100).toFixed(2)} m / ${(maus.y / 100).toFixed(2)} m` : ""}</p>

      <Karte>
        <KarteKopf><KarteTitel>Speichern, exportieren, weitergeben</KarteTitel><KarteBeschreibung>Der Grundriss wird als Datenmodell gespeichert; PNG und SVG sind Exporte. Als Objektbild legt er sich in die Bildergalerie (Art „Grundriss“).</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          {(speichern.fehler || bild.fehler || wf.fehler) && <Hinweis ton="fehler">{speichern.fehler ?? bild.fehler ?? wf.fehler}</Hinweis>}
          {(speichern.erfolg || bild.erfolg) && <Hinweis ton="erfolg">{bild.erfolg ?? speichern.erfolg}</Hinweis>}
          <form action={speichernAktion} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {id && <input type="hidden" name="id" value={id} />}
            <input type="hidden" name="daten" value={JSON.stringify({ ...g, vorlage: g.vorlage ? { ...g.vorlage, quelle: g.vorlage.quelle.startsWith("data:") ? g.vorlage.quelle : (vorlagePfad ?? "") } : null })} />
            <input type="hidden" name="quelle" value={quelleZustand} />
            {vorlagePfad && <input type="hidden" name="vorlage_pfad" value={vorlagePfad} />}
            <input type="hidden" name="objekt_id" value={objekt} />
            <Feld id="gr-titel" beschriftung="Bezeichnung"><Eingabe value={g.titel} onChange={(e) => setG((alt) => ({ ...alt, titel: e.target.value }))} /></Feld>
            <Feld id="gr-objekt" beschriftung="Objekt"><Auswahl value={objekt} onChange={(e) => setObjekt(e.target.value)}><option value="">— ohne —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
            <Button type="submit" disabled={speichert}>{speichert ? "Speichert …" : id ? "Speichern" : "Grundriss anlegen"}</Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variante="sekundaer" groesse="klein" onClick={() => void herunterladen("png")}>PNG herunterladen</Button>
            <Button type="button" variante="sekundaer" groesse="klein" onClick={() => void herunterladen("svg")}>SVG herunterladen</Button>
            <form action={bildAktion} onSubmit={async (ev) => { if (!png) { ev.preventDefault(); setPng(await alsPng()); setHinweis("PNG erzeugt — bitte noch einmal auf „Als Objektbild ablegen“ klicken."); } }}>
              {id && <input type="hidden" name="id" value={id} />}
              <input type="hidden" name="objekt_id" value={objekt} />
              <input type="hidden" name="titel" value={g.titel} />
              <input type="hidden" name="png" value={png} />
              <Button type="submit" variante="sekundaer" groesse="klein" disabled={!objekt || legtAb}>{legtAb ? "Legt ab …" : "Als Objektbild ablegen"}</Button>
            </form>
            {id && <form action={wfAktion}><input type="hidden" name="id" value={id} /><Button type="submit" variante="sekundaer" groesse="klein" disabled={uebergibt || g.raeume.length === 0}>Räume in den Wohnflächenrechner</Button></form>}
            {id && <form action={grundrissLoeschen} className="ml-auto"><input type="hidden" name="id" value={id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
          </div>
        </KarteInhalt>
      </Karte>
    </div>
  );
}

