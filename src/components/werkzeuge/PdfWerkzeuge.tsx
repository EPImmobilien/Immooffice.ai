"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { zipErzeugen } from "@/lib/werkzeuge/zip";

/**
 * PDF-Werkzeuge (Referenz-Kachel 12): Zusammenfuegen, Teilen, Seiten
 * bearbeiten, Komprimieren, Schwaerzen — vollstaendig im Browser mit pdf-lib
 * und pdf.js; keine Datei verlaesst den Rechner.
 */

type Werkzeug = "merge" | "split" | "edit" | "compress" | "redact";
const WERKZEUGE: Array<{ id: Werkzeug; titel: string; text: string }> = [
  { id: "merge", titel: "Zusammenfügen", text: "Mehrere PDFs in gewählter Reihenfolge zu einer Datei verbinden." },
  { id: "split", titel: "Teilen", text: "Seitenbereiche herausziehen oder jede Seite einzeln als ZIP." },
  { id: "edit", titel: "Seiten bearbeiten", text: "Drehen, löschen, umsortieren — mit Vorschau." },
  { id: "compress", titel: "Komprimieren", text: "Dateigröße verkleinern: leicht (Text bleibt durchsuchbar) oder stark (Seiten als Bild)." },
  { id: "redact", titel: "Schwärzen", text: "Namen, IBAN, Telefonnummern und E-Mail-Adressen finden und unwiderruflich schwärzen." },
];

function groesse(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function herunterladen(daten: Uint8Array, name: string, mime = "application/pdf") {
  const url = URL.createObjectURL(new Blob([daten as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function pdfLib() {
  return import("pdf-lib");
}
async function pdfJs() {
  const m = await import("pdfjs-dist");
  m.GlobalWorkerOptions.workerSrc = "/werkzeuge/pdf.worker.min.mjs";
  return m;
}
/** Seiten eines PDF als Bilder (Data-URL) rendern. */
/** Base64-Daten-URL in Bytes wandeln — fetch() auf data: ist durch die CSP (connect-src) gesperrt. */
function dataUrlBytes(url: string): Uint8Array {
  const komma = url.indexOf(",");
  const bin = atob(url.slice(komma + 1));
  const aus = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) aus[i] = bin.charCodeAt(i);
  return aus;
}
async function seitenRendern(daten: ArrayBuffer, scale: number, seiten?: number[]): Promise<Array<{ nr: number; url: string; breite: number; hoehe: number }>> {
  const pdfjs = await pdfJs();
  const dok = await pdfjs.getDocument({ data: new Uint8Array(daten.slice(0)) }).promise;
  const aus: Array<{ nr: number; url: string; breite: number; hoehe: number }> = [];
  const liste = seiten ?? Array.from({ length: dok.numPages }, (_, i) => i + 1);
  for (const nr of liste) {
    const seite = await dok.getPage(nr);
    const vp = seite.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d")!;
    await seite.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    aus.push({ nr, url: canvas.toDataURL("image/jpeg", 0.85), breite: canvas.width, hoehe: canvas.height });
  }
  await dok.destroy();
  return aus;
}
function bereichParsen(text: string, max: number): number[] {
  const aus = new Set<number>();
  for (const teil of text.split(",")) {
    const t = teil.trim();
    if (!t) continue;
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(t);
    if (m) { for (let i = Number(m[1]); i <= Math.min(Number(m[2]), max); i++) if (i >= 1) aus.add(i); }
    else if (/^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= max) aus.add(Number(t));
  }
  return [...aus].sort((a, b) => a - b);
}

export function PdfWerkzeuge() {
  const [werkzeug, setWerkzeug] = useState<Werkzeug>("merge");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {WERKZEUGE.map((w) => <button key={w.id} type="button" onClick={() => setWerkzeug(w.id)} className={`rounded-[var(--radius)] border px-3 py-1 text-[13px] ${werkzeug === w.id ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{w.titel}</button>)}
      </div>
      <Karte>
        <KarteKopf><KarteTitel>{WERKZEUGE.find((w) => w.id === werkzeug)?.titel}</KarteTitel><KarteBeschreibung>{WERKZEUGE.find((w) => w.id === werkzeug)?.text} Die Dateien bleiben im Browser.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          {werkzeug === "merge" && <Zusammenfuegen />}
          {werkzeug === "split" && <Teilen />}
          {werkzeug === "edit" && <SeitenBearbeiten />}
          {werkzeug === "compress" && <Komprimieren />}
          {werkzeug === "redact" && <Schwaerzen />}
        </KarteInhalt>
      </Karte>
    </div>
  );
}

function DateiEingabe({ mehrere, onDateien, id }: { mehrere?: boolean; onDateien: (f: File[]) => void; id: string }) {
  return <input id={id} type="file" accept="application/pdf" multiple={mehrere ?? false} onChange={(e) => onDateien(Array.from(e.target.files ?? []))} className="block w-full text-[13px] text-text file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px]" />;
}

function Zusammenfuegen() {
  const [dateien, setDateien] = useState<File[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const bewegen = (i: number, d: number) => setDateien((alt) => { const n = [...alt]; const j = i + d; if (j < 0 || j >= n.length) return alt; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const ausfuehren = async () => {
    setLaeuft(true); setFehler(null);
    try {
      const { PDFDocument } = await pdfLib();
      const ziel = await PDFDocument.create();
      for (const f of dateien) {
        const quelle = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        const seiten = await ziel.copyPages(quelle, quelle.getPageIndices());
        for (const s of seiten) ziel.addPage(s);
      }
      herunterladen(await ziel.save(), "zusammengefuegt.pdf");
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Zusammenfügen."); } finally { setLaeuft(false); }
  };
  return (
    <div className="space-y-3">
      <Feld id="pdf-merge" beschriftung="PDF-Dateien"><DateiEingabe id="pdf-merge" mehrere onDateien={(f) => setDateien((alt) => [...alt, ...f])} /></Feld>
      {dateien.length > 0 && (
        <ol className="space-y-1 text-[13px]">
          {dateien.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-[var(--radius)] border border-linie bg-hintergrund px-3 py-1.5">
              <span className="w-6 text-gedaempft">{i + 1}.</span><span className="flex-1 truncate">{f.name}</span><span className="text-gedaempft">{groesse(f.size)}</span>
              <button type="button" aria-label="Nach oben" onClick={() => bewegen(i, -1)} className="px-1 text-gedaempft hover:text-text">↑</button>
              <button type="button" aria-label="Nach unten" onClick={() => bewegen(i, 1)} className="px-1 text-gedaempft hover:text-text">↓</button>
              <button type="button" aria-label="Entfernen" onClick={() => setDateien((alt) => alt.filter((_, j) => j !== i))} className="px-1 text-gedaempft hover:text-fehler">✕</button>
            </li>
          ))}
        </ol>
      )}
      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
      <Button type="button" onClick={ausfuehren} disabled={dateien.length < 2 || laeuft}>{laeuft ? "Verbindet …" : `${dateien.length} Dateien zusammenfügen`}</Button>
    </div>
  );
}

function Teilen() {
  const [datei, setDatei] = useState<File | null>(null);
  const [seiten, setSeiten] = useState(0);
  const [bereich, setBereich] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = async (f: File | undefined) => {
    if (!f) return;
    setDatei(f); setFehler(null);
    const { PDFDocument } = await pdfLib();
    const d = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    setSeiten(d.getPageCount());
    setBereich(`1-${d.getPageCount()}`);
  };
  const bereichZiehen = async () => {
    if (!datei) return;
    setLaeuft(true); setFehler(null);
    try {
      const { PDFDocument } = await pdfLib();
      const quelle = await PDFDocument.load(await datei.arrayBuffer(), { ignoreEncryption: true });
      const nummern = bereichParsen(bereich, quelle.getPageCount());
      if (nummern.length === 0) throw new Error("Bitte einen gültigen Seitenbereich angeben, z. B. 1-3,5.");
      const ziel = await PDFDocument.create();
      for (const s of await ziel.copyPages(quelle, nummern.map((n) => n - 1))) ziel.addPage(s);
      herunterladen(await ziel.save(), `${datei.name.replace(/\.pdf$/i, "")}_Seiten_${bereich.replace(/[^\d,-]/g, "")}.pdf`);
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Teilen."); } finally { setLaeuft(false); }
  };
  const einzeln = async () => {
    if (!datei) return;
    setLaeuft(true); setFehler(null);
    try {
      const { PDFDocument } = await pdfLib();
      const quelle = await PDFDocument.load(await datei.arrayBuffer(), { ignoreEncryption: true });
      const basis = datei.name.replace(/\.pdf$/i, "");
      const teile: Array<{ name: string; daten: Uint8Array }> = [];
      for (let i = 0; i < quelle.getPageCount(); i++) {
        const ziel = await PDFDocument.create();
        const [s] = await ziel.copyPages(quelle, [i]);
        if (s) ziel.addPage(s);
        teile.push({ name: `${basis}_Seite_${String(i + 1).padStart(3, "0")}.pdf`, daten: await ziel.save() });
      }
      herunterladen(zipErzeugen(teile), `${basis}_Seiten.zip`, "application/zip");
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Teilen."); } finally { setLaeuft(false); }
  };
  return (
    <div className="space-y-3">
      <Feld id="pdf-split" beschriftung="PDF-Datei"><DateiEingabe id="pdf-split" onDateien={(f) => void laden(f[0])} /></Feld>
      {datei && <p className="text-[13px] text-gedaempft">{datei.name} · {seiten} Seiten · {groesse(datei.size)}</p>}
      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Feld id="pdf-bereich" beschriftung="Seitenbereich" hinweis="z. B. 1-3,5,8-10"><Eingabe value={bereich} onChange={(e) => setBereich(e.target.value)} /></Feld>
        <Button type="button" onClick={bereichZiehen} disabled={!datei || laeuft}>Bereich als PDF</Button>
        <Button type="button" variante="sekundaer" onClick={einzeln} disabled={!datei || laeuft}>Jede Seite einzeln (ZIP)</Button>
      </div>
    </div>
  );
}

interface SeiteZustand { nr: number; url: string; drehung: number; geloescht: boolean }

function SeitenBearbeiten() {
  const [datei, setDatei] = useState<File | null>(null);
  const [seiten, setSeiten] = useState<SeiteZustand[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = async (f: File | undefined) => {
    if (!f) return;
    setDatei(f); setLaeuft(true); setFehler(null);
    try {
      const bilder = await seitenRendern(await f.arrayBuffer(), 0.3);
      setSeiten(bilder.map((b) => ({ nr: b.nr, url: b.url, drehung: 0, geloescht: false })));
    } catch (e) { setFehler(e instanceof Error ? e.message : "Die Datei konnte nicht gelesen werden."); } finally { setLaeuft(false); }
  };
  const bewegen = (i: number, d: number) => setSeiten((alt) => { const n = [...alt]; const j = i + d; if (j < 0 || j >= n.length) return alt; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const speichern = async () => {
    if (!datei) return;
    setLaeuft(true); setFehler(null);
    try {
      const { PDFDocument, degrees } = await pdfLib();
      const quelle = await PDFDocument.load(await datei.arrayBuffer(), { ignoreEncryption: true });
      const ziel = await PDFDocument.create();
      const bleibend = seiten.filter((s) => !s.geloescht);
      if (bleibend.length === 0) throw new Error("Es bleibt keine Seite übrig.");
      const kopiert = await ziel.copyPages(quelle, bleibend.map((s) => s.nr - 1));
      kopiert.forEach((seite, i) => { const z = bleibend[i]!; seite.setRotation(degrees((seite.getRotation().angle + z.drehung) % 360)); ziel.addPage(seite); });
      herunterladen(await ziel.save(), `${datei.name.replace(/\.pdf$/i, "")}_bearbeitet.pdf`);
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Speichern."); } finally { setLaeuft(false); }
  };
  return (
    <div className="space-y-3">
      <Feld id="pdf-edit" beschriftung="PDF-Datei"><DateiEingabe id="pdf-edit" onDateien={(f) => void laden(f[0])} /></Feld>
      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
      {seiten.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {seiten.map((s, i) => (
            <div key={s.nr} className={`rounded-[var(--radius)] border border-linie bg-hintergrund p-2 ${s.geloescht ? "opacity-40" : ""}`}>
              <div className="flex h-40 items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL aus dem Browser, kein Bildhoster */}
                <img src={s.url} alt={`Seite ${s.nr}`} style={{ transform: `rotate(${s.drehung}deg)`, maxHeight: "100%", maxWidth: "100%" }} /></div>
              <div className="mt-1 flex items-center justify-between text-[12px]">
                <span className="text-gedaempft">S. {s.nr}{s.geloescht ? " (gelöscht)" : ""}</span>
                <div className="flex gap-0.5">
                  <button type="button" aria-label="Drehen" title="Drehen" onClick={() => setSeiten((alt) => alt.map((x, j) => (j === i ? { ...x, drehung: (x.drehung + 90) % 360 } : x)))} className="px-1 hover:text-akzent">⟳</button>
                  <button type="button" aria-label="Nach vorn" onClick={() => bewegen(i, -1)} className="px-1 hover:text-akzent">←</button>
                  <button type="button" aria-label="Nach hinten" onClick={() => bewegen(i, 1)} className="px-1 hover:text-akzent">→</button>
                  <button type="button" aria-label={s.geloescht ? "Wiederherstellen" : "Löschen"} onClick={() => setSeiten((alt) => alt.map((x, j) => (j === i ? { ...x, geloescht: !x.geloescht } : x)))} className="px-1 hover:text-fehler">{s.geloescht ? "↺" : "✕"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button type="button" onClick={speichern} disabled={!datei || laeuft}>{laeuft ? "Arbeitet …" : "Bearbeitetes PDF speichern"}</Button>
    </div>
  );
}

function Komprimieren() {
  const [datei, setDatei] = useState<File | null>(null);
  const [stufe, setStufe] = useState<"leicht" | "stark">("leicht");
  const [dpi, setDpi] = useState("110");
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const ausfuehren = async () => {
    if (!datei) return;
    setLaeuft(true); setFehler(null); setErgebnis(null);
    try {
      const { PDFDocument } = await pdfLib();
      const daten = await datei.arrayBuffer();
      let aus: Uint8Array;
      if (stufe === "leicht") {
        const d = await PDFDocument.load(daten, { ignoreEncryption: true });
        d.setProducer("ImmoOffice.ai"); d.setCreator("ImmoOffice.ai");
        aus = await d.save({ useObjectStreams: true });
      } else {
        const scale = Number(dpi) / 72;
        const bilder = await seitenRendern(daten, scale);
        const ziel = await PDFDocument.create();
        for (const b of bilder) {
          const jpg = await ziel.embedJpg(dataUrlBytes(b.url));
          const seite = ziel.addPage([b.breite / scale, b.hoehe / scale]);
          seite.drawImage(jpg, { x: 0, y: 0, width: b.breite / scale, height: b.hoehe / scale });
        }
        aus = await ziel.save();
      }
      setErgebnis(`${groesse(datei.size)} → ${groesse(aus.length)} (${Math.round((1 - aus.length / datei.size) * 100)} % kleiner)`);
      herunterladen(aus, `${datei.name.replace(/\.pdf$/i, "")}_komprimiert.pdf`);
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Komprimieren."); } finally { setLaeuft(false); }
  };
  return (
    <div className="space-y-3">
      <Feld id="pdf-compress" beschriftung="PDF-Datei"><DateiEingabe id="pdf-compress" onDateien={(f) => setDatei(f[0] ?? null)} /></Feld>
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id="pdf-stufe" beschriftung="Stufe"><Auswahl value={stufe} onChange={(e) => setStufe(e.target.value as "leicht" | "stark")}><option value="leicht">Leicht — Struktur straffen, Text bleibt durchsuchbar</option><option value="stark">Stark — Seiten als Bild (Text nicht mehr durchsuchbar)</option></Auswahl></Feld>
        {stufe === "stark" && <Feld id="pdf-dpi" beschriftung="Auflösung"><Auswahl value={dpi} onChange={(e) => setDpi(e.target.value)}><option value="80">80 dpi (E-Mail)</option><option value="110">110 dpi (Bildschirm)</option><option value="150">150 dpi (Druck einfach)</option></Auswahl></Feld>}
      </div>
      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
      {ergebnis && <Hinweis ton="erfolg">{ergebnis}</Hinweis>}
      <Button type="button" onClick={ausfuehren} disabled={!datei || laeuft}>{laeuft ? "Komprimiert …" : "Komprimieren"}</Button>
    </div>
  );
}

interface Rechteck { x: number; y: number; b: number; h: number }
interface SchwaerzSeite { nr: number; url: string; breite: number; hoehe: number; rechtecke: Rechteck[] }

const MUSTER: Array<{ name: string; regex: RegExp }> = [
  { name: "IBAN", regex: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g },
  { name: "Telefon", regex: /(?:\+49|0)[\d\s/()-]{7,}\d/g },
  { name: "E-Mail", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
];

function Schwaerzen() {
  const [datei, setDatei] = useState<File | null>(null);
  const [seiten, setSeiten] = useState<SchwaerzSeite[]>([]);
  const [begriffe, setBegriffe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ziehen, setZiehen] = useState<{ seite: number; x: number; y: number } | null>(null);
  const SCALE = 1;
  const laden = async (f: File | undefined) => {
    if (!f) return;
    setDatei(f); setLaeuft(true); setFehler(null);
    try {
      const bilder = await seitenRendern(await f.arrayBuffer(), SCALE);
      setSeiten(bilder.map((b) => ({ ...b, rechtecke: [] })));
    } catch (e) { setFehler(e instanceof Error ? e.message : "Die Datei konnte nicht gelesen werden."); } finally { setLaeuft(false); }
  };
  const automatisch = async () => {
    if (!datei) return;
    setLaeuft(true); setFehler(null);
    try {
      const pdfjs = await pdfJs();
      const dok = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise;
      const eigene = begriffe.split(",").map((b) => b.trim()).filter((b) => b.length >= 2);
      const gesamt = [...MUSTER, ...eigene.map((b) => ({ name: b, regex: new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") }))];
      let gefunden = 0;
      const neu = await Promise.all(seiten.map(async (s) => {
        const seite = await dok.getPage(s.nr);
        const vp = seite.getViewport({ scale: SCALE });
        const inhalt = await seite.getTextContent();
        const rechtecke = [...s.rechtecke];
        for (const item of inhalt.items) {
          if (!("str" in item) || !item.str) continue;
          const treffer = gesamt.some((m) => { m.regex.lastIndex = 0; return m.regex.test(item.str); });
          if (!treffer) continue;
          const [a, b, c, d, e, f] = item.transform as number[];
          const hoehe = Math.hypot(c ?? 0, d ?? 0) || 10;
          const p = vp.convertToViewportPoint(e ?? 0, f ?? 0);
          const breite = (item.width as number) * Math.hypot(a ?? 1, b ?? 0) / Math.hypot(a ?? 1, b ?? 0) * SCALE;
          rechtecke.push({ x: (p[0] ?? 0) - 2, y: (p[1] ?? 0) - hoehe * SCALE - 2, b: breite + 4, h: hoehe * SCALE + 4 });
          gefunden++;
        }
        return { ...s, rechtecke };
      }));
      await dok.destroy();
      setSeiten(neu);
      if (gefunden === 0) setFehler("Keine Treffer — ggf. ist das PDF ein Scan ohne Textebene. Dann bitte von Hand Rechtecke ziehen.");
    } catch (e) { setFehler(e instanceof Error ? e.message : "Automatische Suche fehlgeschlagen."); } finally { setLaeuft(false); }
  };
  const mausRunter = (i: number, ev: React.MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    setZiehen({ seite: i, x: ev.clientX - r.left, y: ev.clientY - r.top });
  };
  const mausHoch = (i: number, ev: React.MouseEvent<HTMLDivElement>) => {
    if (!ziehen || ziehen.seite !== i) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const x2 = ev.clientX - r.left;
    const y2 = ev.clientY - r.top;
    const faktor = (seiten[i]?.breite ?? r.width) / r.width;
    const re: Rechteck = { x: Math.min(ziehen.x, x2) * faktor, y: Math.min(ziehen.y, y2) * faktor, b: Math.abs(x2 - ziehen.x) * faktor, h: Math.abs(y2 - ziehen.y) * faktor };
    if (re.b > 4 && re.h > 4) setSeiten((alt) => alt.map((s, j) => (j === i ? { ...s, rechtecke: [...s.rechtecke, re] } : s)));
    setZiehen(null);
  };
  const anwenden = async () => {
    if (!datei) return;
    setLaeuft(true); setFehler(null);
    try {
      const { PDFDocument } = await pdfLib();
      const daten = await datei.arrayBuffer();
      const quelle = await PDFDocument.load(daten, { ignoreEncryption: true });
      const ziel = await PDFDocument.create();
      const EXPORT = 2;
      const hochaufgeloest = await seitenRendern(daten, EXPORT, seiten.filter((s) => s.rechtecke.length > 0).map((s) => s.nr));
      for (const s of seiten) {
        if (s.rechtecke.length === 0) {
          const [k] = await ziel.copyPages(quelle, [s.nr - 1]);
          if (k) ziel.addPage(k);
          continue;
        }
        const bild = hochaufgeloest.find((b) => b.nr === s.nr)!;
        const canvas = document.createElement("canvas");
        canvas.width = bild.breite; canvas.height = bild.hoehe;
        const ctx = canvas.getContext("2d")!;
        const img = new Image();
        await new Promise<void>((ok, nein) => { img.onload = () => ok(); img.onerror = () => nein(new Error("Bild")); img.src = bild.url; });
        ctx.drawImage(img, 0, 0);
        ctx.fillStyle = "#000";
        const f = EXPORT / SCALE;
        for (const r of s.rechtecke) ctx.fillRect(r.x * f, r.y * f, r.b * f, r.h * f);
        const jpg = await ziel.embedJpg(dataUrlBytes(canvas.toDataURL("image/jpeg", 0.9)));
        const seite = ziel.addPage([bild.breite / EXPORT, bild.hoehe / EXPORT]);
        seite.drawImage(jpg, { x: 0, y: 0, width: bild.breite / EXPORT, height: bild.hoehe / EXPORT });
      }
      herunterladen(await ziel.save(), `${datei.name.replace(/\.pdf$/i, "")}_geschwaerzt.pdf`);
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Schwärzen."); } finally { setLaeuft(false); }
  };
  const anzahl = seiten.reduce((n, s) => n + s.rechtecke.length, 0);
  return (
    <div className="space-y-3">
      <Feld id="pdf-redact" beschriftung="PDF-Datei"><DateiEingabe id="pdf-redact" onDateien={(f) => void laden(f[0])} /></Feld>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Feld id="pdf-begriffe" beschriftung="Zusätzliche Begriffe (Namen, Anschriften)" hinweis="Mit Komma trennen; IBAN, Telefon und E-Mail werden immer gesucht"><Eingabe value={begriffe} onChange={(e) => setBegriffe(e.target.value)} placeholder="Muster, Beispielweg 5" /></Feld>
        <Button type="button" variante="sekundaer" onClick={automatisch} disabled={!datei || laeuft}>Automatisch finden</Button>
      </div>
      <p className="text-[12px] text-gedaempft">Auf der Seite ein Rechteck ziehen, um Bereiche von Hand zu markieren. Markierte Seiten werden beim Speichern als Bild neu aufgebaut — der Text darunter ist dann unwiderruflich entfernt.</p>
      {fehler && <Hinweis ton="warnung">{fehler}</Hinweis>}
      <div className="space-y-4">
        {seiten.map((s, i) => (
          <div key={s.nr}>
            <p className="mb-1 text-[12px] text-gedaempft">Seite {s.nr} · {s.rechtecke.length} Markierung(en) {s.rechtecke.length > 0 && <button type="button" className="ml-2 text-akzent hover:underline" onClick={() => setSeiten((alt) => alt.map((x, j) => (j === i ? { ...x, rechtecke: [] } : x)))}>zurücksetzen</button>}</p>
            <div role="presentation" className="relative max-w-3xl cursor-crosshair select-none border border-linie" onMouseDown={(ev) => mausRunter(i, ev)} onMouseUp={(ev) => mausHoch(i, ev)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL aus dem Browser, kein Bildhoster */}
              <img src={s.url} alt={`Seite ${s.nr}`} className="block w-full" draggable={false} />
              {s.rechtecke.map((r, k) => <div key={k} className="absolute bg-black" style={{ left: `${(r.x / s.breite) * 100}%`, top: `${(r.y / s.hoehe) * 100}%`, width: `${(r.b / s.breite) * 100}%`, height: `${(r.h / s.hoehe) * 100}%` }} />)}
            </div>
          </div>
        ))}
      </div>
      <Button type="button" onClick={anwenden} disabled={!datei || laeuft || anzahl === 0}>{laeuft ? "Arbeitet …" : `${anzahl} Stelle(n) schwärzen und speichern`}</Button>
    </div>
  );
}
