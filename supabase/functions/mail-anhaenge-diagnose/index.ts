// mail-anhaenge-diagnose — listet nur die MIME-Struktur einer Mail (keine Inhalte).
// Abgesichert über Kopfzeile x-diagnose-secret (Vault: diagnose_secret).
// v11 (16.09.26): bild_zusammensetzen {schluessel, immobilie_id, name, titel, sortierung, mime, quelle} setzt Base64-Teile
// aus der Tabelle bild_transfer zusammen und legt sie als Datei am Objekt ab (Wiederherstellung von Fotos, deren
// Original nur noch in einem PDF vorlag; die Sandbox erreicht den Storage nicht direkt).
// v9 (16.09.26): bild_zuschneiden [{datei_id, links, rechts, oben, unten (Anteile 0..0.9), original_loeschen, quelle_breite}]
// (quelle_breite: verkleinert ueber Storage-Transform laden - 7 Originale in einem Aufruf sprengten das Worker-Limit)
// legt das Bild ohne Rand als neue Datei am Objekt ab (quelle "zuschnitt"); bild_loeschen [ids] entfernt
// Zeile + Storage (Trigger merkt onOffice-IDs). Anlass: Eigentuemer 389/390 will keinen Turm im Bild.
// v8 (16.09.26): bild_base64 (Pfad oder Liste) liefert Objektfotos aus immobilie-dateien verkleinert
// (bild_breite, Standard 480 px) als Base64 — Sichtpruefung von Fotos ohne Nutzer-Token (Vorfall 389/390:
// Eigentuemer wuenscht Luftbilder ohne Turm).
// v7 (16.09.26): pdf_text mit mit_schnitten: true liefert je Treffer-Seite zusaetzlich "schnitte" —
// den Text mit Schriftnamen je Lauf ([Montserrat-SemiBold]fett[Montserrat-Regular] …), zur Pruefung
// der Textauszeichnung aus expose-pdf-erzeugen v49.
// v4 (14.09.26): Modus pdf_text — Text eines PDFs aus dem Bucket immobilie-dateien
// lesen (Pruefung der Expose-Erzeugung ohne Nutzer-Token).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

async function entschluessele(v: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const p = v.split("."); if (p.length !== 3 || p[0] !== "v1") throw new Error("Ungueltiges Format");
  const iv = Uint8Array.from(atob(p[1]), c => c.charCodeAt(0)), ct = Uint8Array.from(atob(p[2]), c => c.charCodeAt(0));
  const km = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const k = await crypto.subtle.importKey("raw", km, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, ct));
}
function bytesZuText(b: Uint8Array): string { let o = ""; for (let i = 0; i < b.length; i += 32768) o += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(i + 32768, b.length))) as any); return o; }
function kopfWert(kopf: string, name: string): string {
  const flach = kopf.replace(/\r?\n[ \t]+/g, " ");
  const m = flach.match(new RegExp("(?:^|\\n)" + name + ":[ \\t]*([^\\r\\n]*)", "i")); return m ? m[1].trim() : "";
}
function parameter(w: string, n: string): string {
  const m = w.match(new RegExp(n + '\\s*=\\s*"([^"]*)"', "i")) || w.match(new RegExp(n + "\\s*=\\s*([^;\\s]+)", "i")); return m ? m[1] : "";
}
function grenzmarken(q: string): string[] { const o = new Set<string>(); const re = /boundary\s*=\s*(?:"([^"]+)"|([^";\r\n]+))/gi; let m; while ((m = re.exec(q)) !== null) { const b = (m[1] || m[2] || "").trim(); if (b) o.add(b); } return [...o]; }
function abschnitte(q: string): string[] {
  const t: { start: number; ende: number }[] = [];
  for (const b of grenzmarken(q)) { const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const re = new RegExp("(^|\\r?\\n)--" + esc + "(--)?[ \\t]*(?=\\r?\\n|$)", "g"); let m; while ((m = re.exec(q)) !== null) t.push({ start: m.index + m[1].length, ende: m.index + m[0].length }); }
  t.sort((a, b) => a.start - b.start); if (!t.length) return [q];
  const o: string[] = []; for (let i = 0; i < t.length; i++) { const von = t[i].ende, bis = i + 1 < t.length ? t[i + 1].start : q.length; if (bis > von) o.push(q.substring(von, bis)); } return o;
}
class SimpleImap {
  private conn: Deno.TlsConn | null = null; private enc = new TextEncoder(); private buffer = ""; private n = 0;
  constructor(private host: string, private port: number, private user: string, private pass: string) {}
  private tag() { this.n++; return `A${String(this.n).padStart(4, "0")}`; }
  async connect() { this.conn = await Deno.connectTls({ hostname: this.host, port: this.port }); await this.readUntil(/^\* OK/m, 10000); }
  private async lese(buf: Uint8Array, ms: number) { return await Promise.race([this.conn!.read(buf), new Promise<null>(r => setTimeout(() => r(null), Math.max(1, ms)))]); }
  private async readUntil(re: RegExp, ms: number): Promise<string> {
    const start = Date.now(), buf = new Uint8Array(16 * 1024);
    while (Date.now() - start < ms) {
      const m = this.buffer.match(re);
      if (m) { const idx = (m as any).index + m[0].length, eol = this.buffer.indexOf("\n", idx), cut = eol >= 0 ? eol + 1 : this.buffer.length; const r = this.buffer.substring(0, cut); this.buffer = this.buffer.substring(cut); return r; }
      const n = await this.lese(buf, ms - (Date.now() - start)); if (n === null) throw new Error("IMAP read timeout"); if (n === 0) throw new Error("Connection closed");
      this.buffer += bytesZuText(buf.subarray(0, n));
    } throw new Error("IMAP read timeout");
  }
  private async send(l: string) { await this.conn!.write(this.enc.encode(l + "\r\n")); }
  async cmd(c: string, ms = 15000) { const t = this.tag(); await this.send(`${t} ${c}`); const r = await this.readUntil(new RegExp(`^${t} (OK|NO|BAD)`, "m"), ms); if (/^[A-Z]\d{4} (NO|BAD)/m.test(r)) throw new Error(`IMAP-Fehler bei "${c}": ${r.substring(0, 300)}`); return r; }
  async login() { await this.cmd(`LOGIN "${this.user.replace(/"/g, '\\"')}" "${this.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`); }
  async select(f: string) { await this.cmd(`SELECT "${f.replace(/"/g, '\\"')}"`); }
  async fetchSource(uid: number, ms: number) {
    const t = this.tag(); await this.send(`${t} UID FETCH ${uid} (BODY.PEEK[])`); const start = Date.now();
    let kopf = this.buffer; this.buffer = ""; let groesse = 0, rest = ""; const kl = new Uint8Array(8 * 1024);
    while (Date.now() - start < ms) {
      const m = kopf.match(/\{(\d+)\}\r?\n/); if (m) { groesse = parseInt(m[1], 10); rest = kopf.substring((m as any).index + m[0].length); break; }
      if (new RegExp(`${t} (NO|BAD)`).test(kopf)) return { quelle: "", groesse: 0, ms: Date.now() - start, abbruch: "NO/BAD" };
      const n = await this.lese(kl, ms - (Date.now() - start)); if (n === null) throw new Error("timeout (Kopf)"); if (n === 0) throw new Error("closed (Kopf)");
      kopf += bytesZuText(kl.subarray(0, n));
    }
    const teile: string[] = []; let haben = 0; if (rest) { teile.push(rest); haben += rest.length; }
    const gr = new Uint8Array(64 * 1024); let abbruch = "";
    while (haben < groesse) { if (Date.now() - start >= ms) { abbruch = "timeout"; break; } const n = await this.lese(gr, ms - (Date.now() - start)); if (n === null) { abbruch = "timeout-read"; break; } if (n === 0) { abbruch = "closed"; break; } const tx = bytesZuText(gr.subarray(0, n)); teile.push(tx); haben += tx.length; }
    return { quelle: teile.join("").substring(0, groesse), groesse, ms: Date.now() - start, abbruch };
  }
  logout() { try { this.conn?.close(); } catch { /* egal */ } }
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
  // Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
  // nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
  // Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
  // naechsten. Genau das waere ein Leck statt einer Trennung.
  // Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
  // Funktion verhaelt sich dann wie bisher.
  let immoMandant: string | null = null;
  const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
  // Schriften sind Plattform-Gut, kein Mandanten-Branding. Sie liegen im
  // Wurzelverzeichnis des Eimers unter fonts/. Fehlt eine, wird sie beim
  // ersten Bedarf von ihrer Quelle geholt und dort abgelegt — danach nie
  // wieder. Ein Mandant, der eine eigene Hausschrift hochlaedt, legt sie
  // unter {mandant}/fonts/… und uebersteuert damit die der Plattform.
  const IMMO_SCHRIFTEN: Record<string, string> = {
    "fonts/Montserrat-Regular.ttf":        "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf",
    "fonts/Montserrat-Bold.ttf":           "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf",
    "fonts/Montserrat-Light.ttf":          "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Light.ttf",
    "fonts/Montserrat-Medium.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Medium.ttf",
    "fonts/Montserrat-SemiBold.ttf":       "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBold.ttf",
    "fonts/Montserrat-Italic.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Italic.ttf",
    "fonts/Montserrat-SemiBoldItalic.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBoldItalic.ttf",
    "fonts/Marcellus-Regular.ttf":         "https://raw.githubusercontent.com/google/fonts/main/ofl/marcellus/Marcellus-Regular.ttf",
    "fonts/GreatVibes-Regular.ttf":        "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
  };
  {
    const immoEcht = admin.storage.from.bind(admin.storage);
    const immoVorne = (pf: unknown): unknown =>
      (typeof pf !== "string" || !pf || !immoMandant) ? pf
        : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
    const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
    (admin.storage as any).from = (eimer: string) => {
      const api: any = immoEcht(eimer);
      const h: any = Object.create(api);
      for (const n of ["upload", "remove", "createSignedUrl",
                       "createSignedUrls", "getPublicUrl", "info", "exists"]) {
        if (typeof api[n] === "function") h[n] = (pf: unknown, ...r: unknown[]) => api[n](immoViele(pf), ...r);
      }
      // Lesen in drei Stufen: die Datei des Mandanten, sonst die der
      // Plattform, sonst — bei einer Schrift — einmal von der Quelle.
      // Geschrieben wird dabei nur ins Wurzelverzeichnis und nur eine
      // Schrift; Mandantendateien kann diese Stufe nicht anfassen.
      if (typeof api.download === "function") h.download = async (pf: unknown, ...r: unknown[]) => {
        const hole = async (p: unknown) => {
          try { return await api.download(p, ...r); } catch (e) { return { data: null, error: e }; }
        };
        const erst = await hole(immoViele(pf));
        if (erst?.data) return erst;
        if (typeof pf === "string" && immoMandant) {
          const zweit = await hole(pf);
          if (zweit?.data) return zweit;
        }
        if (eimer === "branding-assets" && typeof pf === "string" && IMMO_SCHRIFTEN[pf]) {
          try {
            const a = await fetch(IMMO_SCHRIFTEN[pf]);
            if (a.ok) {
              const roh = new Uint8Array(await a.arrayBuffer());
              try { await api.upload(pf, roh, { contentType: "font/ttf", upsert: true }); }
              catch (_e) { /* beim naechsten Mal wieder */ }
              console.log("Schrift nachgeladen:", pf, roh.byteLength);
              return { data: new Blob([roh]), error: null };
            }
          } catch (e) { console.warn("Schrift nicht erreichbar:", pf, String(e)); }
        }
        return erst;
      };
      if (typeof api.list === "function") {
        h.list = (pf?: string, ...r: unknown[]) => api.list(pf ? (immoVorne(pf) as string) : (immoMandant ?? pf), ...r);
      }
      for (const n of ["move", "copy"]) {
        if (typeof api[n] === "function") h[n] = (a: unknown, b: unknown, ...r: unknown[]) => api[n](immoVorne(a), immoVorne(b), ...r);
      }
      return h;
    };
  }
  const { data: ok } = await admin.rpc("diagnose_secret_pruefen", { p: req.headers.get("x-diagnose-secret") || "" });
  if (!ok) return new Response(JSON.stringify({ ok: false, error: "Nicht erlaubt." }), { status: 401, headers: { "Content-Type": "application/json" } });
  let imap: SimpleImap | null = null;
  try {
    const { mail_id, timeout_ms, upload_test, neu_extrahieren, ki, pdf_text, muster, mit_schnitten, bild_base64, bild_breite, bild_zuschneiden, bild_loeschen, bild_zusammensetzen } = await req.json();
    if (bild_zusammensetzen) {
      // v11: Base64-Teile aus bild_transfer zusammensetzen, im Storage ablegen und als Datei am Objekt eintragen
      const z = bild_zusammensetzen;
      const { data: teile, error: tErr } = await admin.from("bild_transfer").select("teil, inhalt").eq("schluessel", String(z.schluessel)).order("teil");
      if (tErr) throw new Error("Teile: " + tErr.message);
      if (!teile || !teile.length) throw new Error("Keine Teile fuer " + z.schluessel);
      const b64 = teile.map((t: any) => t.inhalt).join("");
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const mime = String(z.mime || "image/jpeg");
      const name = String(z.name || (z.schluessel + ".jpg"));
      immoSetzeMandant((await admin.from("immobilien").select("mandant_id").eq("id", z.immobilie_id).maybeSingle()).data?.mandant_id);
      const pfad = "immobilien/" + z.immobilie_id + "/" + Date.now() + "_" + name.replace(/[^A-Za-z0-9._-]+/g, "_");
      const { error: upErr } = await admin.storage.from("immobilie-dateien").upload(pfad, bin, { contentType: mime, upsert: false });
      if (upErr) throw new Error("Upload: " + upErr.message);
      const { data: neu, error: insErr } = await admin.from("immobilie_datei").insert({
        mandant_id: immoMandant,
        immobilie_id: z.immobilie_id, name, titel: z.titel ?? null, doktyp: z.doktyp || "Bild", kategorie: z.kategorie || "foto",
        mime_type: mime, size_bytes: bin.length, speicher_typ: "supabase", storage_path: pfad, quelle: z.quelle || "wiederhergestellt",
        oeffentlich: z.oeffentlich !== false, sortierung: Number(z.sortierung) || 0, ersteller_id: z.ersteller_id ?? null,
      }).select("id").single();
      if (insErr) throw new Error("Insert: " + insErr.message);
      await admin.from("bild_transfer").delete().eq("schluessel", String(z.schluessel));
      return new Response(JSON.stringify({ ok: true, id: neu?.id, pfad, bytes: bin.length, teile: teile.length }), { headers: { "Content-Type": "application/json" } });
    }
    if (bild_zuschneiden) {
      // v9: Bild ohne stoerenden Rand neu ablegen; Anteile je Seite 0..0.9
      const auftraege: any[] = (Array.isArray(bild_zuschneiden) ? bild_zuschneiden : [bild_zuschneiden]).slice(0, 20);
      const anteil = (v: any) => Math.min(0.9, Math.max(0, Number(v) || 0));
      const out: any[] = [];
      for (const a of auftraege) {
        try {
          const { data: d, error: dErr } = await admin.from("immobilie_datei").select("*").eq("id", String(a.datei_id)).maybeSingle();
          if (dErr || !d) throw new Error("Datei nicht gefunden");
          immoSetzeMandant(d.mandant_id);
          // quelle_breite: verkleinerte Fassung ueber den Storage-Transform laden (Speicher/CPU des Workers schonen)
          const qb = Math.min(2000, Math.max(0, Number(a.quelle_breite) || 0));
          let { data: blob, error } = qb
            ? await admin.storage.from("immobilie-dateien").download(d.storage_path, { transform: { width: qb, resize: "contain", quality: 90, format: "origin" } })
            : await admin.storage.from("immobilie-dateien").download(d.storage_path);
          if ((error || !blob) && qb) { const r2 = await admin.storage.from("immobilie-dateien").download(d.storage_path); blob = r2.data; error = r2.error; }
          if (error || !blob) throw new Error("Download: " + (error?.message || "leer"));
          const img = await Image.decode(new Uint8Array(await blob.arrayBuffer()));
          const l = Math.round(img.width * anteil(a.links)), r = Math.round(img.width * anteil(a.rechts));
          const o = Math.round(img.height * anteil(a.oben)), u = Math.round(img.height * anteil(a.unten));
          const w = img.width - l - r, h = img.height - o - u;
          if (w < 200 || h < 200) throw new Error("Zuschnitt zu klein");
          img.crop(l, o, w, h);
          const jpg = await img.encodeJPEG(88);
          const basis = String(d.name || "bild").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
          const pfad = "immobilien/" + d.immobilie_id + "/zuschnitt/" + Date.now() + "_" + basis + "_ohne_Turm.jpg";
          const { error: upErr } = await admin.storage.from("immobilie-dateien").upload(pfad, jpg, { contentType: "image/jpeg", upsert: false });
          if (upErr) throw new Error("Upload: " + upErr.message);
          const neu: any = { immobilie_id: d.immobilie_id, name: basis + "_ohne_Turm.jpg", titel: d.titel, doktyp: d.doktyp, kategorie: d.kategorie,
            mime_type: "image/jpeg", size_bytes: jpg.length, speicher_typ: "supabase", storage_path: pfad, quelle: "zuschnitt",
            oeffentlich: d.oeffentlich, sortierung: d.sortierung, ersteller_id: d.ersteller_id, expose_ausschliessen: d.expose_ausschliessen };
          const { data: eingefuegt, error: insErr } = await admin.from("immobilie_datei").insert(neu).select("id").single();
          if (insErr) throw new Error("Insert: " + insErr.message);
          if (a.original_loeschen) {
            const alt = String(d.storage_path), web = alt.replace(/\.[^/.]+$/, "") + "_web.jpg";
            const { error: delErr } = await admin.from("immobilie_datei").delete().eq("id", d.id);
            if (delErr) throw new Error("Original loeschen: " + delErr.message);
            try { await admin.storage.from("immobilie-dateien").remove([alt, web]); } catch (_e) { /* Blob bleibt */ }
          }
          out.push({ datei_id: d.id, neu_id: eingefuegt?.id, pfad, breite: w, hoehe: h, bytes: jpg.length, original_geloescht: !!a.original_loeschen });
        } catch (e) { out.push({ datei_id: a.datei_id, fehler: e instanceof Error ? e.message : String(e) }); }
      }
      return new Response(JSON.stringify({ ok: true, zuschnitte: out }), { headers: { "Content-Type": "application/json" } });
    }
    if (bild_loeschen) {
      // v9: Dateien am Objekt entfernen (Zeile + Storage-Blob + _web-Variante); der Trigger merkt onOffice-IDs
      const ids: string[] = (Array.isArray(bild_loeschen) ? bild_loeschen : [bild_loeschen]).map(String).slice(0, 40);
      const out: any[] = [];
      for (const id of ids) {
        try {
          const { data: d } = await admin.from("immobilie_datei").select("id, storage_path, name").eq("id", id).maybeSingle();
          if (!d) { out.push({ id, fehler: "nicht gefunden" }); continue; }
          const { error: delErr } = await admin.from("immobilie_datei").delete().eq("id", id);
          if (delErr) throw new Error(delErr.message);
          if (d.storage_path) { try { await admin.storage.from("immobilie-dateien").remove([d.storage_path, String(d.storage_path).replace(/\.[^/.]+$/, "") + "_web.jpg"]); } catch (_e) { /* Blob bleibt */ } }
          out.push({ id, name: d.name, geloescht: true });
        } catch (e) { out.push({ id, fehler: e instanceof Error ? e.message : String(e) }); }
      }
      return new Response(JSON.stringify({ ok: true, geloescht: out }), { headers: { "Content-Type": "application/json" } });
    }
    if (bild_base64) {
      // v8: Bilder verkleinert als Base64 (Sichtpruefung); Transform, sonst Original
      const pfade: string[] = (Array.isArray(bild_base64) ? bild_base64 : [bild_base64]).map(String).slice(0, 40);
      const breite = Math.max(64, Math.min(1024, Number(bild_breite) || 480));
      const out: any[] = [];
      for (const pfad of pfade) {
        try {
          let { data, error } = await admin.storage.from("immobilie-dateien").download(pfad, { transform: { width: breite, resize: "contain", quality: 70, format: "origin" } });
          if (error || !data) { const r2 = await admin.storage.from("immobilie-dateien").download(pfad); data = r2.data; error = r2.error; }
          if (error || !data) { out.push({ pfad, fehler: error?.message || "leer" }); continue; }
          const b = new Uint8Array(await data.arrayBuffer());
          out.push({ pfad, mime: data.type || "image/jpeg", bytes: b.length, base64: btoa(bytesZuText(b)) });
        } catch (e) { out.push({ pfad, fehler: e instanceof Error ? e.message : String(e) }); }
      }
      return new Response(JSON.stringify({ ok: true, bilder: out }), { headers: { "Content-Type": "application/json" } });
    }
    if (pdf_text) {
      // Text eines PDFs aus dem Bucket lesen; nur Seiten zurueckgeben, die zum Muster passen
      const { data, error } = await admin.storage.from("immobilie-dateien").download(String(pdf_text));
      if (error || !data) throw new Error("Download: " + (error?.message || "leer"));
      const bytes = new Uint8Array(await data.arrayBuffer());
      const pdfjs: any = await import("npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, isEvalSupported: false }).promise;
      const re = new RegExp(String(muster || "Eckdaten|Weitere Angaben"), "i");
      const treffer: any[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i); const tc = await p.getTextContent();
        const t = tc.items.map((x: any) => x.str).join(" ").replace(/\s+/g, " ");
        if (!re.test(t)) continue;
        const eintrag: any = { seite: i, text: t.slice(0, 2500) };
        if (mit_schnitten) {
          // v7: Schriftname je Lauf, damit sich fett/kursiv im Ergebnis pruefen lassen
          let aus = "", letzter = "";
          for (const x of tc.items as any[]) {
            if (!x.str) continue;
            let name = String(x.fontName || "");
            try { const f = p.commonObjs.has(x.fontName) ? p.commonObjs.get(x.fontName) : null; if (f && f.name) name = String(f.name); } catch (_e) { /* Name bleibt intern */ }
            if (name !== letzter) { aus += "[" + name + "]"; letzter = name; }
            aus += x.str + (x.hasEOL ? "\n" : "");
          }
          eintrag.schnitte = aus.replace(/[ \t]+/g, " ").slice(0, 4000);
        }
        treffer.push(eintrag);
      }
      return new Response(JSON.stringify({ ok: true, seiten: doc.numPages, treffer }), { headers: { "Content-Type": "application/json" } });
    }
    if (neu_extrahieren) {
      // Reparatur: Extraktion mit neu=true anstossen (interner Pfad der Extraktionsfunktion ueber dasselbe Geheimnis)
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/mail-anhaenge-extrahieren`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key, "x-diagnose-secret": req.headers.get("x-diagnose-secret") || "" },
        body: JSON.stringify({ mail_id, neu: true, ki: ki !== false }),
      });
      const text = await r.text();
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, antwort: text.slice(0, 4000) }), { headers: { "Content-Type": "application/json" } });
    }
    if (upload_test) {
      // Nur pruefen, ob Storage einen Objektnamen annimmt (3 Bytes, danach wieder loeschen)
      const out: any[] = [];
      for (const name of (Array.isArray(upload_test) ? upload_test : [upload_test]) as string[]) {
        const pfad = `diagnose-test/${name}`;
        const { error } = await admin.storage.from("mail-anhaenge").upload(pfad, new Uint8Array([37, 80, 68]), { contentType: "application/octet-stream", upsert: true });
        out.push({ name, ok: !error, fehler: error ? (error as any).message || String(error) : null });
        if (!error) await admin.storage.from("mail-anhaenge").remove([pfad]);
      }
      return new Response(JSON.stringify({ ok: true, upload_test: out }), { headers: { "Content-Type": "application/json" } });
    }
    const { data: mail } = await admin.from("mail_eingang").select("id,postfach_id,imap_uid,imap_folder,anhaenge").eq("id", mail_id).maybeSingle();
    if (!mail?.imap_uid) throw new Error("Mail ohne imap_uid");
    const { data: pf } = await admin.from("mail_postfaecher").select("*").eq("id", mail.postfach_id).maybeSingle();
    const pw = await entschluessele(pf.imap_passwort_verschluesselt);
    imap = new SimpleImap(pf.imap_server, Number(pf.imap_port || 993), pf.imap_user || pf.email_adresse, pw);
    await imap.connect(); await imap.login(); await imap.select(mail.imap_folder);
    const r = await imap.fetchSource(mail.imap_uid, Number(timeout_ms) || 25000);
    imap.logout(); imap = null;
    const q = r.quelle;
    const teile = abschnitte(q);
    const parts = teile.map((roh, i) => {
      const a = roh.replace(/^\r?\n/, ""); const trenn = a.search(/\r?\n\r?\n/);
      const kopf = trenn >= 0 ? a.substring(0, trenn) : a.substring(0, 300);
      const ct = kopfWert(kopf, "Content-Type"), cd = kopfWert(kopf, "Content-Disposition"), cte = kopfWert(kopf, "Content-Transfer-Encoding");
      const rohName = parameter(cd, "filename") || parameter(ct, "name");
      const koerperLen = trenn >= 0 ? a.length - trenn : 0;
      const grund = trenn < 0 ? "kein Kopf/Körper-Trenner" : trenn > 8000 ? `Kopf zu lang (${trenn})` : !/content-/i.test(kopf) ? "kein content-Kopf" : /^multipart\//i.test(ct) ? "multipart" : (!/attachment/i.test(cd) && !rohName) ? "weder attachment noch Name" : "";
      return { i, kopfLen: trenn, ct: ct.slice(0, 90), cd: cd.slice(0, 160), cte, rohName: rohName.slice(0, 120), koerperZeichen: koerperLen, hatFilenameStern: /filename\*/i.test(cd) || /name\*/i.test(ct), uebersprungen: grund };
    });
    return new Response(JSON.stringify({ ok: true, gelesen: q.length, angekuendigt: r.groesse, ms: r.ms, abbruch: r.abbruch, grenzmarken: grenzmarken(q), schliesser: (q.match(/\r?\n--[^\r\n]+--[ \t]*(?=\r?\n|$)/g) || []).length, teile: parts, bisher: (mail.anhaenge || []).map((x: any) => x.original_name || x.name) }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    try { imap?.logout(); } catch { /* egal */ }
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
