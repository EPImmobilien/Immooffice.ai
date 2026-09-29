// web-asset-kopieren v1 — kopiert eine Datei aus einem privaten Bucket in den
// oeffentlichen Bucket web-assets (fuer Logo/Fotos auf der Homepage).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Mandantengrenze fuer Kennungen aus dem Anfragekoerper -----------------
// Diese Funktion prueft das JWT, arbeitet danach aber mit dem service_role —
// und fuer den gilt RLS nicht. Eine Kennung, die der Aufrufer mitschickt, ist
// damit ungeprueft: sie kann auf einen Satz eines anderen Mandanten zeigen.
//
// public.mandant_sichern() aus fork_14 zieht genau diese Grenze. Sie muss
// aber MIT DEM TOKEN DES AUFRUFERS gerufen werden — unter dem service_role
// laesst sie jeden durch (mandant_grenze_gilt() ist dort false, mit Absicht:
// Cron und Wartung haben keinen Mandanten). Deshalb ein zweiter Client, der
// nur den mitgebrachten Kopf weiterreicht.
//
// Ohne Anmeldekopf oder mit dem Dienstschluessel passiert nichts — das sind
// die internen Wege, und die sind nicht die Grenze, die hier gezogen wird.
async function immoMandantSichern(req: Request, paare: Array<[string, unknown]>): Promise<void> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return;
  const zuPruefen = paare.filter(([, id]) =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (!zuPruefen.length) return;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  for (const [tabelle, id] of zuPruefen) {
    const { error } = await nutzer.rpc("mandant_sichern", { p_tabelle: tabelle, p_id: id });
    if (error) throw new Error("Kein Zugriff auf Daten eines anderen Mandanten.");
  }
}

// Wessen Mandant ist der Aufrufer? Fuer die Faelle, in denen nicht eine
// Kennung, sondern ein PFAD aus dem Anfragekoerper kommt — das erste
// Pfadsegment im Dateispeicher ist seit fork_09 die Mandantenkennung.
async function immoMandantDesAufrufers(req: Request): Promise<string | null> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return null;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return null;
  const { data: prof } = await nutzer.from("profiles").select("mandant_id").eq("id", u.user.id).maybeSingle();
  return prof?.mandant_id ? String(prof.mandant_id) : null;
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
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
    const immoEcht = db.storage.from.bind(db.storage);
    const immoVorne = (pf: unknown): unknown =>
      (typeof pf !== "string" || !pf || !immoMandant) ? pf
        : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
    const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
    (db.storage as any).from = (eimer: string) => {
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
  try {
    const { data: u } = await db.auth.getUser(
      (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!u?.user) return new Response(JSON.stringify({ ok: false, fehler: "Nicht angemeldet" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
    immoSetzeMandant((await db.from("profiles").select("mandant_id")
      .eq("id", u.user.id).maybeSingle()).data?.mandant_id);
    const b = await req.json().catch(() => ({}));
    const quelleBucket = String(b.quelle_bucket || "");
    const quellePfad = String(b.quelle_pfad || "");
    const zielPfad = String(b.ziel_pfad || "");
    if (!quelleBucket || !quellePfad || !zielPfad) {
      return new Response(JSON.stringify({ ok: false, fehler: "quelle_bucket, quelle_pfad und ziel_pfad noetig" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    // Eimer und Pfad kommen aus dem Anfragekoerper. Die Storage-Huelle
    // faellt beim Lesen absichtlich auf das Wurzelverzeichnis zurueck (dort
    // liegen die Schriften der Plattform) — genau dieser Rueckfall wuerde
    // hier einen fremden Mandantenpfad durchlassen. Deshalb ausdruecklich:
    // die Quelle muss im eigenen Ordner liegen.
    const eigenerMandant = (await db.from("profiles").select("mandant_id")
      .eq("id", u.user.id).maybeSingle()).data?.mandant_id;
    if (!eigenerMandant || !quellePfad.startsWith(String(eigenerMandant) + "/")) {
      return new Response(JSON.stringify({ ok: false, fehler: "Kein Zugriff auf diese Datei" }),
        { status: 403, headers: { "Content-Type": "application/json" } });
    }
    const dl = await db.storage.from(quelleBucket).download(quellePfad);
    if (dl.error) throw dl.error;
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const typ = zielPfad.endsWith(".png") ? "image/png" : zielPfad.endsWith(".jpg") || zielPfad.endsWith(".jpeg") ? "image/jpeg" : "application/octet-stream";
    const up = await db.storage.from("web-assets").upload(zielPfad, bytes, { contentType: typ, upsert: true });
    if (up.error) throw up.error;
    return new Response(JSON.stringify({ ok: true, bytes: bytes.length, ziel: zielPfad }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
