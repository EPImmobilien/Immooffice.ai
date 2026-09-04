"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, KiKennzeichen } from "@/components/ui/Status";
import { BILDARTEN } from "@/lib/bilder";
import { BILD_ZWECKE, type BildZweck } from "@/lib/ki/bild-zwecke";
import { istRawDatei, rawVorschau } from "@/lib/werkzeuge/raw";
import { bildKiBearbeiten, bildVersionSpeichern, type WerkzeugErgebnis } from "@/server/werkzeuge-aktionen";

/**
 * Bild-Editor (Referenz-Kachel 13): laeuft im Browser auf Canvas —
 * Zuschnitt, Groesse, Drehen/Spiegeln, Helligkeit/Kontrast/Saettigung,
 * Weichzeichnen oder Verpixeln von Bereichen (Nummernschilder, Gesichter),
 * Text, Logo, Vorher/Nachher, Export JPG/PNG, Speichern als neue Version am
 * Objekt (Original bleibt). RAW-Dateien werden ueber LibRaw (WASM) entwickelt,
 * ersatzweise aus der eingebetteten Vorschau. KI-Bearbeitung ueber den
 * Server (Provider-Layer, Credits), Ergebnis sichtbar gekennzeichnet.
 */

interface Quelle { img: HTMLImageElement; name: string; bildId: string | null; ki: boolean; hinweis: string | null }
interface Rechteck { x: number; y: number; w: number; h: number }
interface Region extends Rechteck { art: "blur" | "pixel" }
interface TextEbene { id: number; x: number; y: number; text: string; groesse: number; farbe: string }
interface Bearbeitung { crop: Rechteck | null; rot: 0 | 90 | 180 | 270; flip: boolean; helligkeit: number; kontrast: number; saettigung: number; regionen: Region[]; texte: TextEbene[]; logo: { an: boolean; ecke: "or" | "ol" | "ur" | "ul"; groesse: number }; breite: number | null }
type Werkzeug = "zuschnitt" | "groesse" | "korrektur" | "weich" | "text" | "logo" | "ki";

const LEER: Bearbeitung = { crop: null, rot: 0, flip: false, helligkeit: 100, kontrast: 100, saettigung: 100, regionen: [], texte: [], logo: { an: false, ecke: "ur", groesse: 0.18 }, breite: null };

function bildLaden(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((ok, nein) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => nein(new Error("Das Bild konnte nicht geladen werden."));
    img.src = src;
  });
}

/** Grundbild (Zuschnitt + Drehung + Spiegelung) — ohne Farbkorrektur. */
function grundbild(q: Quelle, b: Bearbeitung): HTMLCanvasElement {
  const c = b.crop ?? { x: 0, y: 0, w: q.img.naturalWidth, h: q.img.naturalHeight };
  const gedreht = b.rot === 90 || b.rot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = gedreht ? c.h : c.w;
  canvas.height = gedreht ? c.w : c.h;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((b.rot * Math.PI) / 180);
  if (b.flip) ctx.scale(-1, 1);
  ctx.drawImage(q.img, c.x, c.y, c.w, c.h, -c.w / 2, -c.h / 2, c.w, c.h);
  return canvas;
}

/** Vollstaendiges Ergebnis in Zielbreite. */
function rendern(q: Quelle, b: Bearbeitung, logo: HTMLImageElement | null, zielBreite?: number): HTMLCanvasElement {
  const basis = grundbild(q, b);
  const faktor = zielBreite ? zielBreite / basis.width : b.breite ? b.breite / basis.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(basis.width * faktor));
  canvas.height = Math.max(1, Math.round(basis.height * faktor));
  const ctx = canvas.getContext("2d")!;
  ctx.filter = `brightness(${b.helligkeit}%) contrast(${b.kontrast}%) saturate(${b.saettigung}%)`;
  ctx.drawImage(basis, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";
  // Regionen (Koordinaten relativ 0..1 zum Grundbild)
  for (const r of b.regionen) {
    const x = Math.round(r.x * canvas.width), y = Math.round(r.y * canvas.height), w = Math.max(1, Math.round(r.w * canvas.width)), h = Math.max(1, Math.round(r.h * canvas.height));
    if (r.art === "pixel") {
      const klein = document.createElement("canvas");
      const s = Math.max(4, Math.round(w / 12));
      klein.width = Math.max(1, Math.round(w / s));
      klein.height = Math.max(1, Math.round(h / s));
      const kc = klein.getContext("2d")!;
      kc.imageSmoothingEnabled = true;
      kc.drawImage(canvas, x, y, w, h, 0, 0, klein.width, klein.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(klein, 0, 0, klein.width, klein.height, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = `blur(${Math.max(6, Math.round(w / 15))}px)`;
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    }
  }
  for (const t of b.texte) {
    const groesse = Math.round(t.groesse * canvas.width);
    ctx.font = `600 ${groesse}px Poppins, Inter, sans-serif`;
    ctx.fillStyle = t.farbe;
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = groesse / 6;
    ctx.fillText(t.text, t.x * canvas.width, t.y * canvas.height);
    ctx.shadowBlur = 0;
  }
  if (b.logo.an && logo) {
    const lw = canvas.width * b.logo.groesse;
    const lh = lw * (logo.naturalHeight / Math.max(1, logo.naturalWidth));
    const rand = canvas.width * 0.02;
    const x = b.logo.ecke.endsWith("l") ? rand : canvas.width - lw - rand;
    const y = b.logo.ecke.startsWith("o") ? rand : canvas.height - lh - rand;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, x, y, lw, lh);
    ctx.globalAlpha = 1;
  }
  return canvas;
}

async function rawEntwickeln(datei: File): Promise<{ url: string; hinweis: string }> {
  const bytes = new Uint8Array(await datei.arrayBuffer());
  try {
    // libraw-wasm startet einen Worker mit WebAssembly; Turbopack bleibt beim
    // Analysieren dieses Worker-Graphen haengen. Deshalb liegen die vier
    // Dateien des Pakets unter public/werkzeuge/libraw und werden zur Laufzeit
    // aus dem eigenen Ursprung geladen (gleiche Version wie in package.json).
    const pfad = "/werkzeuge/libraw/index.js";
    const mod = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ pfad)) as typeof import("libraw-wasm");
    const LibRaw = mod.default;
    const raw = new LibRaw();
    await raw.open(bytes, { useCameraWb: true, outputBps: 8, halfSize: bytes.length > 40 * 1024 * 1024 });
    const d = await raw.imageData();
    if (d && d.width > 0 && d.height > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = d.width;
      canvas.height = d.height;
      const ctx = canvas.getContext("2d")!;
      const rgba = new Uint8ClampedArray(d.width * d.height * 4);
      const src = d.data;
      const kanaele = d.colors || 3;
      const shift = d.bits > 8 ? d.bits - 8 : 0;
      for (let i = 0, j = 0; i < d.width * d.height; i++, j += kanaele) {
        rgba[i * 4] = Number(src[j] ?? 0) >> shift;
        rgba[i * 4 + 1] = Number(src[j + 1] ?? 0) >> shift;
        rgba[i * 4 + 2] = Number(src[j + 2] ?? 0) >> shift;
        rgba[i * 4 + 3] = 255;
      }
      ctx.putImageData(new ImageData(rgba, d.width, d.height), 0, 0);
      return { url: canvas.toDataURL("image/jpeg", 0.95), hinweis: `RAW entwickelt (LibRaw, ${d.width} × ${d.height}).` };
    }
  } catch {
    // Decoder nicht ladbar oder Format unbekannt → eingebettete Vorschau
  }
  const vorschau = rawVorschau(bytes);
  if (!vorschau) throw new Error("Die RAW-Datei enthält keine lesbare Vorschau und konnte nicht entwickelt werden.");
  return { url: URL.createObjectURL(new Blob([vorschau as BlobPart], { type: "image/jpeg" })), hinweis: "RAW: eingebettete JPEG-Vorschau der Kamera verwendet (Decoder nicht verfügbar)." };
}

export function BildEditor({ objekte, objektId, bilder, startBildId, logoUrl, kiVerfuegbar, darfAendern }: { objekte: Array<{ id: string; bezeichnung: string }>; objektId: string | null; bilder: Array<{ id: string; url: string; titel: string | null; art: string; original_id: string | null; bearbeitung: string | null; ki_bearbeitet: boolean }>; startBildId: string | null; logoUrl: string | null; kiVerfuegbar: boolean; darfAendern: boolean }) {
  const [quelle, setQuelle] = useState<Quelle | null>(null);
  const [b, setB] = useState<Bearbeitung>(LEER);
  const [werkzeug, setWerkzeug] = useState<Werkzeug>("zuschnitt");
  const [regionArt, setRegionArt] = useState<"blur" | "pixel">("pixel");
  const [seitenverhaeltnis, setSeitenverhaeltnis] = useState<string>("frei");
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [vergleich, setVergleich] = useState(100);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [ziehen, setZiehen] = useState<{ x: number; y: number } | null>(null);
  const [auswahl, setAuswahl] = useState<Rechteck | null>(null);
  const [textNeu, setTextNeu] = useState("");
  const [zweck, setZweck] = useState<BildZweck>("himmel");
  const [kiHinweis, setKiHinweis] = useState("");
  const versionFeld = useRef<HTMLInputElement>(null);
  const kiFeld = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const vorschau = useRef<HTMLCanvasElement>(null);
  const [ki, kiAktion, kiLaeuft] = useActionState<WerkzeugErgebnis, FormData>(bildKiBearbeiten, {});
  const [version, versionAktion, speichert] = useActionState<WerkzeugErgebnis, FormData>(bildVersionSpeichern, {});
  const [kiUebernommen, setKiUebernommen] = useState<string | null>(null);

  // Vorschau zeichnen
  useEffect(() => {
    const canvas = vorschau.current;
    if (!canvas || !quelle) return;
    const voll = rendern(quelle, b, logo, Math.min(960, (b.crop?.w ?? quelle.img.naturalWidth) * (b.rot === 90 || b.rot === 270 ? (b.crop?.h ?? quelle.img.naturalHeight) / (b.crop?.w ?? quelle.img.naturalWidth) : 1)));
    canvas.width = voll.width;
    canvas.height = voll.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(voll, 0, 0);
    if (vergleich < 100) {
      const orig = grundbild(quelle, { ...LEER, crop: b.crop, rot: b.rot, flip: b.flip });
      const breite = Math.round((canvas.width * (100 - vergleich)) / 100);
      ctx.drawImage(orig, 0, 0, orig.width * (breite / canvas.width), orig.height, 0, 0, breite, canvas.height);
      ctx.fillStyle = "#B5934F";
      ctx.fillRect(breite - 1, 0, 2, canvas.height);
    }
    if (auswahl) {
      ctx.strokeStyle = "#B5934F";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(auswahl.x * canvas.width, auswahl.y * canvas.height, auswahl.w * canvas.width, auswahl.h * canvas.height);
      ctx.setLineDash([]);
    }
  }, [quelle, b, logo, vergleich, auswahl]);

  // Objektbild aus der Adresse
  useEffect(() => {
    const start = startBildId ? bilder.find((x) => x.id === startBildId) : null;
    if (start?.url) void objektBildLaden(start.id);
    if (logoUrl) bildLaden(logoUrl, true).then(setLogo).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim ersten Aufbau
  }, []);

  // KI-Ergebnis als neue Quelle uebernehmen
  useEffect(() => {
    const neu = ki.bildBase64;
    if (!neu || neu === kiUebernommen) return;
    let aktiv = true;
    bildLaden(neu)
      .then((img) => {
        if (!aktiv) return;
        setKiUebernommen(neu);
        setQuelle((alt) => ({ img, name: alt?.name ?? "ki.png", bildId: alt?.bildId ?? null, ki: true, hinweis: `KI: ${BILD_ZWECKE[zweck].bezeichnung}` }));
        setB(LEER);
        setVergleich(50);
      })
      .catch(() => { if (aktiv) setFehler("Das KI-Ergebnis konnte nicht geladen werden."); });
    return () => { aktiv = false; };
  }, [ki.bildBase64, kiUebernommen, zweck]);

  const dateiLaden = async (f: File | undefined) => {
    if (!f) return;
    setLaedt(true); setFehler(null);
    try {
      let url: string;
      let hinweis: string | null = null;
      if (istRawDatei(f.name)) {
        const r = await rawEntwickeln(f);
        url = r.url; hinweis = r.hinweis;
      } else {
        url = URL.createObjectURL(f);
      }
      const img = await bildLaden(url);
      setQuelle({ img, name: f.name, bildId: null, ki: false, hinweis });
      setB(LEER); setAuswahl(null); setVergleich(100);
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Laden."); } finally { setLaedt(false); }
  };
  async function objektBildLaden(id: string) {
    const bild = bilder.find((x) => x.id === id);
    if (!bild?.url) return;
    setLaedt(true); setFehler(null);
    try {
      const img = await bildLaden(bild.url, true);
      setQuelle({ img, name: bild.titel ?? "Objektbild", bildId: bild.original_id ?? bild.id, ki: false, hinweis: null });
      setB(LEER); setAuswahl(null); setVergleich(100);
    } catch (e) { setFehler(e instanceof Error ? e.message : "Fehler beim Laden."); } finally { setLaedt(false); }
  }

  const relativ = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)) };
  };
  const mausRunter = (ev: React.MouseEvent<HTMLCanvasElement>) => { if (werkzeug === "zuschnitt" || werkzeug === "weich" || werkzeug === "text") setZiehen(relativ(ev)); };
  const mausBewegt = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ziehen) return;
    const p = relativ(ev);
    const w = Math.abs(p.x - ziehen.x);
    let h = Math.abs(p.y - ziehen.y);
    if (werkzeug === "zuschnitt" && seitenverhaeltnis !== "frei" && quelle) {
      const [a, c] = seitenverhaeltnis.split(":").map(Number);
      const canvas = vorschau.current!;
      const zielQuotient = (a ?? 1) / (c ?? 1);
      h = (w * canvas.width) / zielQuotient / canvas.height;
    }
    setAuswahl({ x: Math.min(ziehen.x, p.x), y: Math.min(ziehen.y, p.y), w, h });
  };
  const mausHoch = () => {
    if (!ziehen) return;
    setZiehen(null);
    if (!auswahl || auswahl.w < 0.01 || auswahl.h < 0.01) { setAuswahl(null); return; }
    if (werkzeug === "weich") { setB((alt) => ({ ...alt, regionen: [...alt.regionen, { ...auswahl, art: regionArt }] })); setAuswahl(null); }
    if (werkzeug === "text" && textNeu.trim()) { setB((alt) => ({ ...alt, texte: [...alt.texte, { id: Date.now(), x: auswahl.x, y: auswahl.y + auswahl.h, text: textNeu.trim(), groesse: Math.max(0.02, Math.min(0.2, auswahl.h)), farbe: "#ffffff" }] })); setAuswahl(null); }
  };
  const zuschneiden = () => {
    if (!quelle || !auswahl) return;
    // Auswahl bezieht sich auf das gedrehte Grundbild — auf das Original zurueckrechnen (nur bei 0° einfach; sonst Drehung vorher anwenden)
    const basis = grundbild(quelle, { ...LEER, crop: b.crop, rot: b.rot, flip: b.flip });
    const c = document.createElement("canvas");
    c.width = Math.round(auswahl.w * basis.width); c.height = Math.round(auswahl.h * basis.height);
    c.getContext("2d")!.drawImage(basis, auswahl.x * basis.width, auswahl.y * basis.height, c.width, c.height, 0, 0, c.width, c.height);
    bildLaden(c.toDataURL("image/png")).then((img) => { setQuelle((alt) => alt ? { ...alt, img } : alt); setB((alt) => ({ ...alt, crop: null, rot: 0, flip: false })); setAuswahl(null); }).catch(() => null);
  };
  const beschreibung = () => {
    const t: string[] = [];
    if (quelle?.ki) t.push(quelle.hinweis ?? "KI-Bearbeitung");
    if (b.rot) t.push(`gedreht ${b.rot}°`);
    if (b.flip) t.push("gespiegelt");
    if (b.helligkeit !== 100 || b.kontrast !== 100 || b.saettigung !== 100) t.push("Korrektur (Helligkeit/Kontrast/Sättigung)");
    if (b.regionen.length) t.push(`${b.regionen.length} Bereich(e) unkenntlich gemacht`);
    if (b.texte.length) t.push("Text");
    if (b.logo.an) t.push("Logo");
    if (b.breite) t.push(`Breite ${b.breite} px`);
    return t.length ? t.join(", ") : "Zuschnitt im Bild-Editor";
  };
  const exportieren = () => {
    if (!quelle) return;
    const c = rendern(quelle, b, logo);
    const a = document.createElement("a");
    a.download = `${quelle.name.replace(/\.[^.]+$/, "")}_bearbeitet.${format === "png" ? "png" : "jpg"}`;
    a.href = c.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.92);
    a.click();
  };
  const fuerServer = (maxBreite: number, qualitaet = 0.9): string => {
    if (!quelle) return "";
    const c = rendern(quelle, b, logo, Math.min(maxBreite, b.breite ?? (b.crop?.w ?? quelle.img.naturalWidth)));
    return c.toDataURL("image/jpeg", qualitaet);
  };
  const [objekt, setObjekt] = useState(objektId ?? "");
  const [bildArt, setBildArt] = useState("innen");
  const router = useRouter();

  return (
    <div className="space-y-4">
      <Karte>
        <KarteInhalt className="grid gap-3 sm:grid-cols-3">
          <Feld id="be-datei" beschriftung="Bild laden (JPG, PNG, WebP, RAW)"><input id="be-datei" type="file" accept="image/*,.arw,.cr2,.cr3,.nef,.dng,.raf,.rw2,.orf,.srw,.pef,.raw" onChange={(e) => void dateiLaden(e.target.files?.[0])} className="block w-full text-[13px] file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px]" /></Feld>
          <Feld id="be-objekt" beschriftung="Objekt"><Auswahl value={objekt} onChange={(e) => { setObjekt(e.target.value); if (e.target.value !== objektId) router.push(`/werkzeuge/bild-editor?objekt=${e.target.value}`); }}><option value="">— wählen —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
          <Feld id="be-bild" beschriftung="Objektbild öffnen"><Auswahl value={quelle?.bildId ?? ""} onChange={(e) => void objektBildLaden(e.target.value)} disabled={bilder.length === 0}><option value="">{bilder.length ? "— wählen —" : "kein Objekt gewählt"}</option>{bilder.map((x) => <option key={x.id} value={x.id}>{x.titel ?? BILDARTEN[x.art as keyof typeof BILDARTEN] ?? x.art}{x.original_id ? " (Version)" : ""}{x.ki_bearbeitet ? " · KI" : ""}</option>)}</Auswahl></Feld>
        </KarteInhalt>
      </Karte>
      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
      {laedt && <Hinweis>Lädt …</Hinweis>}
      {quelle?.hinweis && <Hinweis ton="info">{quelle.hinweis}</Hinweis>}

      {quelle && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            <div className="overflow-auto rounded-[var(--radius-gross)] border border-linie bg-[#222] p-2">
              <canvas ref={vorschau} onMouseDown={mausRunter} onMouseMove={mausBewegt} onMouseUp={mausHoch} onMouseLeave={mausHoch} className="mx-auto block max-w-full" style={{ cursor: werkzeug === "zuschnitt" || werkzeug === "weich" || werkzeug === "text" ? "crosshair" : "default" }} aria-label="Bildvorschau" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-gedaempft">
              <span>{quelle.img.naturalWidth} × {quelle.img.naturalHeight} px{b.breite ? ` → ${b.breite} px breit` : ""}</span>
              <label className="flex items-center gap-2">Vorher/Nachher <input type="range" min={0} max={100} value={vergleich} onChange={(e) => setVergleich(Number(e.target.value))} className="accent-akzent" /></label>
              {quelle.ki && <KiKennzeichen art="bearbeitet" />}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {([["zuschnitt", "Zuschnitt"], ["groesse", "Größe & Drehen"], ["korrektur", "Farben"], ["weich", "Weichzeichnen"], ["text", "Text"], ["logo", "Logo"], ["ki", "KI"]] as Array<[Werkzeug, string]>).map(([w, n]) => <button key={w} type="button" onClick={() => { setWerkzeug(w); setAuswahl(null); }} className={`rounded-[var(--radius)] border px-2.5 py-1 text-[12px] ${werkzeug === w ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{n}</button>)}
            </div>
            <Karte>
              <KarteInhalt className="space-y-3 text-[13px]">
                {werkzeug === "zuschnitt" && (
                  <>
                    <Feld id="be-ratio" beschriftung="Seitenverhältnis"><Auswahl value={seitenverhaeltnis} onChange={(e) => setSeitenverhaeltnis(e.target.value)}><option value="frei">Frei</option><option value="3:2">3:2 (Foto)</option><option value="4:3">4:3</option><option value="16:9">16:9 (Web-Exposé)</option><option value="1:1">Quadrat</option></Auswahl></Feld>
                    <p className="text-gedaempft">Im Bild ein Rechteck aufziehen, dann zuschneiden.</p>
                    <Button type="button" groesse="klein" onClick={zuschneiden} disabled={!auswahl}>Zuschneiden</Button>
                  </>
                )}
                {werkzeug === "groesse" && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setB((alt) => ({ ...alt, rot: ((alt.rot + 90) % 360) as Bearbeitung["rot"] }))}>Drehen 90°</Button>
                      <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setB((alt) => ({ ...alt, flip: !alt.flip }))}>Spiegeln</Button>
                    </div>
                    <Feld id="be-breite" beschriftung="Zielbreite (px)" hinweis="Leer = Originalgröße; Web-Exposé nutzt 1600 px"><Eingabe inputMode="numeric" defaultValue={b.breite ?? ""} onBlur={(e) => setB((alt) => ({ ...alt, breite: Number(e.target.value) > 0 ? Math.min(8000, Number(e.target.value)) : null }))} /></Feld>
                    <div className="flex flex-wrap gap-1.5">{[800, 1200, 1600, 2400].map((w) => <button key={w} type="button" className="rounded-[var(--radius)] border border-linie bg-flaeche px-2 py-0.5 text-[12px]" onClick={() => setB((alt) => ({ ...alt, breite: w }))}>{w} px</button>)}</div>
                  </>
                )}
                {werkzeug === "korrektur" && (
                  <>
                    {([["helligkeit", "Helligkeit"], ["kontrast", "Kontrast"], ["saettigung", "Sättigung"]] as Array<["helligkeit" | "kontrast" | "saettigung", string]>).map(([k, n]) => (
                      <label key={k} className="block"><span className="flex justify-between text-[12px] text-gedaempft"><span>{n}</span><span>{b[k]} %</span></span><input type="range" min={40} max={180} value={b[k]} onChange={(e) => setB((alt) => ({ ...alt, [k]: Number(e.target.value) }))} className="w-full accent-akzent" /></label>
                    ))}
                    <Button type="button" variante="leise" groesse="klein" onClick={() => setB((alt) => ({ ...alt, helligkeit: 100, kontrast: 100, saettigung: 100 }))}>Zurücksetzen</Button>
                  </>
                )}
                {werkzeug === "weich" && (
                  <>
                    <Feld id="be-region" beschriftung="Art"><Auswahl value={regionArt} onChange={(e) => setRegionArt(e.target.value as "blur" | "pixel")}><option value="pixel">Verpixeln</option><option value="blur">Weichzeichnen</option></Auswahl></Feld>
                    <p className="text-gedaempft">Bereich aufziehen (Nummernschild, Gesicht, Nachbarfenster). {b.regionen.length} Bereich(e).</p>
                    {b.regionen.length > 0 && <Button type="button" variante="leise" groesse="klein" onClick={() => setB((alt) => ({ ...alt, regionen: alt.regionen.slice(0, -1) }))}>Letzten entfernen</Button>}
                  </>
                )}
                {werkzeug === "text" && (
                  <>
                    <Feld id="be-text" beschriftung="Text"><Eingabe value={textNeu} onChange={(e) => setTextNeu(e.target.value)} placeholder="z. B. Musteransicht" /></Feld>
                    <p className="text-gedaempft">Text eintragen, dann im Bild einen Bereich aufziehen (Höhe = Schriftgröße).</p>
                    {b.texte.map((t) => <div key={t.id} className="flex items-center gap-2"><span className="flex-1 truncate">{t.text}</span><input type="color" value={t.farbe} onChange={(e) => setB((alt) => ({ ...alt, texte: alt.texte.map((x) => (x.id === t.id ? { ...x, farbe: e.target.value } : x)) }))} aria-label="Farbe" /><button type="button" className="text-gedaempft hover:text-fehler" onClick={() => setB((alt) => ({ ...alt, texte: alt.texte.filter((x) => x.id !== t.id) }))}>✕</button></div>)}
                  </>
                )}
                {werkzeug === "logo" && (
                  logo ? (
                    <>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={b.logo.an} onChange={(e) => setB((alt) => ({ ...alt, logo: { ...alt.logo, an: e.target.checked } }))} className="h-4 w-4 accent-akzent" />Firmenlogo einblenden</label>
                      <Feld id="be-ecke" beschriftung="Ecke"><Auswahl value={b.logo.ecke} onChange={(e) => setB((alt) => ({ ...alt, logo: { ...alt.logo, ecke: e.target.value as Bearbeitung["logo"]["ecke"] } }))}><option value="ur">unten rechts</option><option value="ul">unten links</option><option value="or">oben rechts</option><option value="ol">oben links</option></Auswahl></Feld>
                      <label className="block"><span className="text-[12px] text-gedaempft">Größe {Math.round(b.logo.groesse * 100)} %</span><input type="range" min={6} max={40} value={Math.round(b.logo.groesse * 100)} onChange={(e) => setB((alt) => ({ ...alt, logo: { ...alt.logo, groesse: Number(e.target.value) / 100 } }))} className="w-full accent-akzent" /></label>
                    </>
                  ) : <p className="text-gedaempft">Kein Logo hinterlegt (Einstellungen → Erscheinungsbild).</p>
                )}
                {werkzeug === "ki" && (
                  <form action={kiAktion} className="space-y-2" onSubmit={(ev) => { const d = fuerServer(2000, 0.9); if (!d) { ev.preventDefault(); return; } if (kiFeld.current) kiFeld.current.value = d; }}>
                    <input type="hidden" name="zweck" value={zweck} />
                    <input type="hidden" name="bild" defaultValue="" ref={kiFeld} />
                    <input type="hidden" name="objekt_id" value={objekt} />
                    {!kiVerfuegbar && <Hinweis ton="warnung">Kein Modellzugang eingerichtet — KI-Funktionen sind nicht verfügbar.</Hinweis>}
                    {ki.fehler && <Hinweis ton="fehler">{ki.fehler}</Hinweis>}
                    {ki.erfolg && <Hinweis ton="erfolg">{ki.erfolg}</Hinweis>}
                    <Feld id="be-zweck" beschriftung="Bearbeitung"><Auswahl value={zweck} onChange={(e) => setZweck(e.target.value as BildZweck)}>{(Object.keys(BILD_ZWECKE) as BildZweck[]).map((z) => <option key={z} value={z}>{BILD_ZWECKE[z].bezeichnung}</option>)}</Auswahl></Feld>
                    <Feld id="be-kihinweis" beschriftung="Zusatzhinweis (optional)"><Eingabe name="hinweis" value={kiHinweis} onChange={(e) => setKiHinweis(e.target.value)} placeholder="z. B. Mülltonnen links entfernen" /></Feld>
                    <p className="text-[12px] text-gedaempft">3 Credits je Bearbeitung. Architektur und Raumgeometrie dürfen nicht verändert werden; das Ergebnis wird als KI-bearbeitet gekennzeichnet — auch in Exposés.</p>
                    <Button type="submit" groesse="klein" disabled={!kiVerfuegbar || kiLaeuft}>{kiLaeuft ? "Bearbeitet … (bis zu einer Minute)" : "KI-Bearbeitung starten"}</Button>
                  </form>
                )}
              </KarteInhalt>
            </Karte>

            <Karte>
              <KarteKopf><KarteTitel>Ausgabe</KarteTitel><KarteBeschreibung>Herunterladen oder als neue Version am Objekt ablegen — das Original bleibt unverändert.</KarteBeschreibung></KarteKopf>
              <KarteInhalt className="space-y-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <Auswahl value={format} onChange={(e) => setFormat(e.target.value as "jpeg" | "png")} className="w-auto" aria-label="Format"><option value="jpeg">JPG</option><option value="png">PNG</option></Auswahl>
                  <Button type="button" variante="sekundaer" groesse="klein" onClick={exportieren}>Herunterladen</Button>
                </div>
                {darfAendern && (
                  <form action={versionAktion} className="space-y-2" onSubmit={(ev) => { if (!objekt) { ev.preventDefault(); setFehler("Bitte ein Objekt wählen."); return; } /* synchron ins Feld, ein State-Update kaeme erst nach dem Einsammeln des Formulars */ if (versionFeld.current) versionFeld.current.value = fuerServer(4000, 0.92); }}>
                    <input type="hidden" name="objekt_id" value={objekt} />
                    {quelle.bildId && <input type="hidden" name="original_id" value={quelle.bildId} />}
                    <input type="hidden" name="bild" defaultValue="" ref={versionFeld} />
                    <input type="hidden" name="bearbeitung" value={beschreibung()} />
                    <input type="hidden" name="ki" value={quelle.ki ? "1" : "0"} />
                    {!quelle.bildId && <Feld id="be-art" beschriftung="Bildart"><Auswahl name="art" value={bildArt} onChange={(e) => setBildArt(e.target.value)}>{Object.entries(BILDARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>}
                    {version.fehler && <Hinweis ton="fehler">{version.fehler}</Hinweis>}
                    {version.erfolg && <Hinweis ton="erfolg">{version.erfolg}</Hinweis>}
                    <Button type="submit" groesse="klein" disabled={speichert || !objekt}>{speichert ? "Speichert …" : quelle.bildId ? "Als neue Version speichern" : "Am Objekt speichern"}</Button>
                    <p className="text-[12px] text-gedaempft">{beschreibung()}</p>
                  </form>
                )}
              </KarteInhalt>
            </Karte>
          </div>
        </div>
      )}
    </div>
  );
}
