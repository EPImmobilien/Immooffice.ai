// ============================================================================
// portal-ftp-diagnose v3 (23.09.2026) - listet den FTP-Ordner eines Portals und liest
// optional eine Datei als Text (ZIP -> openimmo.xml).
//
// SICHERHEITSDURCHGANG 23.09.2026:
// Vorher stand der Zugangsschluessel FEST IM QUELLTEXT und wurde als URL-Parameter
// (?schluessel=...) uebergeben. Das war aus drei Gruenden schlecht:
//   1. Schluessel in der URL landen in Server-Logs, Proxy-Logs, Browserverlauf und Referer.
//   2. Derselbe Schluessel steckte auch in buero-verschieben - ein Fund sperrte beide auf.
//   3. Fest einprogrammiert heisst: nicht rotierbar ohne neues Ausrollen.
// Und das bei einer Funktion, die mit service_role die FTP-Zugangsdaten liest und beliebige
// Dateien vom Portal-FTP im Klartext zurueckgibt.
//
// Jetzt: Pruefung ueber die Kopfzeile x-diagnose-secret gegen das Vault-Geheimnis
// 'diagnose_secret' (RPC diagnose_secret_pruefen) - dasselbe Muster wie mail-anhaenge-diagnose.
// Der URL-Parameter wird NICHT mehr akzeptiert.
//
// Aufruf:
//   POST/GET .../portal-ftp-diagnose?portal=immowelt[&ordner=succeeded][&datei=name]
//   Kopfzeile: x-diagnose-secret: <Geheimnis aus dem Vault>
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Client as FtpClient } from "npm:basic-ftp@5.0.5";
import JSZip from "npm:jszip@3.10.1";
import { Writable } from "node:stream";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ---- Zugang: nur ueber die Kopfzeile, nur gegen das Vault-Geheimnis
  const geheim = req.headers.get("x-diagnose-secret") || "";
  const { data: erlaubt } = await db.rpc("diagnose_secret_pruefen", { p: geheim });
  if (erlaubt !== true) {
    return new Response(
      JSON.stringify({ ok: false, fehler: "Nicht erlaubt. Kopfzeile x-diagnose-secret erforderlich." }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const portal = url.searchParams.get("portal") || "immowelt";
  const ordner = url.searchParams.get("ordner") || "";
  const datei = url.searchParams.get("datei") || "";

  const { data: z } = await db.from("portal_zugaenge").select("*").eq("portal", portal).maybeSingle();
  if (!z) {
    return new Response(JSON.stringify({ ok: false, fehler: "kein Zugang" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const out: Record<string, unknown> = { ok: false };
  const c = new FtpClient(30000);
  try {
    await c.access({ host: z.ftp_host, user: z.ftp_user, password: z.ftp_passwort, secure: false });
    if (ordner) await c.cd(ordner);
    if (datei) {
      const chunks: Uint8Array[] = [];
      await c.downloadTo(new Writable({ write(chunk, _e, cb) { chunks.push(new Uint8Array(chunk)); cb(); } }), datei);
      const bytes = new Uint8Array(chunks.reduce((n, x) => n + x.length, 0));
      let o = 0; for (const x of chunks) { bytes.set(x, o); o += x.length; }
      if (/\.zip$/i.test(datei)) {
        const zip = await JSZip.loadAsync(bytes);
        out.zipDateien = Object.keys(zip.files);
        const xmlName = Object.keys(zip.files).find((n) => /\.xml$/i.test(n));
        if (xmlName) out.xml = (await zip.file(xmlName)!.async("string")).slice(0, 15000);
      } else {
        out.text = new TextDecoder().decode(bytes).slice(0, 15000);
      }
    } else {
      const liste = await c.list();
      out.dateien = liste.slice(0, 400).map((f) => ({ name: f.name, size: f.size, typ: f.type, datum: f.modifiedAt || f.rawModifiedAt }));
      out.anzahl = liste.length;
    }
    out.ok = true;
    c.close();
  } catch (e) {
    out.fehler = String(e);
    try { c.close(); } catch (_e) { /* egal */ }
  }

  await db.from("onoffice_diagnose").insert({
    test: `ftp ${portal} ${ordner} ${datei}`.trim(),
    errorcode: out.ok ? "0" : "FEHLER",
    meldung: String(out.fehler || "ok").slice(0, 300),
    treffer: (out.anzahl as number) || 0,
    beispiel: { text: JSON.stringify(out).slice(0, 40000) },
  });

  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
