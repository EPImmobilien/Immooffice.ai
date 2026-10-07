// ============================================================================
// bautraeger.ts — gemeinsame Hilfen des Bautraeger-Pakets (fork_84–86)
// ============================================================================
// Beilage des Forks. Quelle: supabase/eigene-beilagen/_bautraeger/
// bautraeger.ts — sie wird in den Ordner jeder Function gelegt, die zum
// Paket gehoert (abnahme-abschliessen, handwerker-portal, maengel-fristen).
// Wer sie aendert, aendert sie DORT; die Kopien entstehen beim Erzeugen neu.
//
// Was hier steht, steht bewusst nur einmal:
//   * Mail ohne Nutzerpostfach — Resend, Absender ist das Standardpostfach
//     des Mandanten; fehlt es, die SMTP_FROM_EMAIL mit dem Firmennamen.
//     Fehlt beides, wird NICHT gesendet, und der Aufrufer erfaehrt es.
//     Ein Rueckfall auf eine Adresse, die niemandem gehoert, ist schlechter
//     als keiner (tests/pflichtangaben.py).
//   * Push ueber die bestehende Function push-senden (x-push-secret).
//   * Glocke ueber projekt_glocke() — die Benachrichtigungsglocke der
//     Vorlage zeigt den Eintrag, kein zweiter Weg.
//   * Vermerk, Projekt-Aktivitaet, Mangel-Verlauf: die Zeitleisten, in die
//     der Auftrag alles schreiben laesst.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const antwort = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
export type Db = any;

export function dienst(): Db {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

/** Die Anwendung — fuer Links in Mails und auf dem QR-Code. null, wenn PORTAL_URL fehlt. */
export function appAdresse(): string | null {
  const a = String(Deno.env.get("PORTAL_URL") || "").trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "");
  return /^https?:\/\//.test(a) ? a : null;
}

export function tokenNeu(bytes = 18): string {
  const b = new Uint8Array(bytes); crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const datumDe = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00" : d) : d;
  return isNaN(x.getTime()) ? String(d) : x.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};
export const heute = () => new Date().toISOString().slice(0, 10);
export const tageDazu = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export async function firmenName(db: Db, mandant: string): Promise<string> {
  const { data } = await db.from("firma_stammdaten").select("firma_name, marken_name")
    .eq("mandant_id", mandant).eq("aktiv", true).order("sortierung", { ascending: true }).limit(1).maybeSingle();
  return String(data?.marken_name || data?.firma_name || "").trim();
}

/** Absender fuer Systemmails des Mandanten. null = es gibt keinen. */
export async function absender(db: Db, mandant: string): Promise<{ name: string; mail: string; antwort_an: string } | null> {
  const { data: pf } = await db.from("mail_postfaecher").select("absender_name, email_adresse, standard_zum_senden, ist_standard, reihenfolge")
    .eq("mandant_id", mandant).eq("aktiv", true)
    .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).order("reihenfolge", { ascending: true })
    .limit(1).maybeSingle();
  const firma = await firmenName(db, mandant);
  if (pf?.email_adresse) return { name: pf.absender_name || firma || pf.email_adresse, mail: pf.email_adresse, antwort_an: pf.email_adresse };
  const from = String(Deno.env.get("SMTP_FROM_EMAIL") || "").trim();
  if (/@/.test(from) && !/example$/i.test(from.split("@")[1] || "")) return { name: firma || "immoOffice", mail: from, antwort_an: from };
  return null;
}

/** Mail ueber Resend. Gibt zurueck, ob sie raus ist — und warum nicht. */
export async function mailen(db: Db, mandant: string, an: string, anName: string | null, betreff: string, text: string,
  opts: { antwort_an?: string | null; anhaenge?: { filename: string; content: string }[]; html?: string | null; absender?: { name: string; mail: string; antwort_an: string } | null } = {}): Promise<{ ok: boolean; grund?: string }> {
  if (!/@/.test(an)) return { ok: false, grund: "keine Empfaengeradresse" };
  const schluessel = Deno.env.get("RESEND_API_KEY") || "";
  if (!schluessel) return { ok: false, grund: "RESEND_API_KEY fehlt" };
  const abs = opts.absender || (mandant ? await absender(db, mandant) : null);
  if (!abs) return { ok: false, grund: "kein Absender (Postfach des Mandanten oder SMTP_FROM_EMAIL)" };
  const start = Date.now();
  let r: Response | null = null;
  try {
    r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + schluessel, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${abs.name} <${abs.mail}>`, to: [anName ? `${anName} <${an}>` : an],
        reply_to: opts.antwort_an || abs.antwort_an, subject: betreff, text,
        ...(opts.html ? { html: opts.html } : {}),
        ...(opts.anhaenge?.length ? { attachments: opts.anhaenge } : {}),
      }),
    });
  } catch { r = null; }
  await db.from("dienst_aufrufe").insert({ dienst: "resend", funktion: (globalThis as any).__immoFunktion || "bautraeger", dauer_ms: Date.now() - start, ok: !!r?.ok, status: r?.status ?? null }).then(() => {}, () => {});
  if (!r) return { ok: false, grund: "Resend nicht erreichbar" };
  if (!r.ok) return { ok: false, grund: `Resend ${r.status}` };
  return { ok: true };
}

/** Push an einen Nutzer ueber push-senden. Still, wenn das Geheimnis fehlt. */
export async function push(profilId: string, titel: string, text: string, url?: string | null, refId?: string | null): Promise<void> {
  const geheim = Deno.env.get("PUSH_HOOK_SECRET") || "";
  const basis = Deno.env.get("SUPABASE_URL") || "";
  if (!geheim || !basis || !profilId) return;
  try {
    await fetch(`${basis}/functions/v1/push-senden`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-push-secret": geheim },
      body: JSON.stringify({ hinweis: { profile_id: profilId, titel, text, url: url || null, ref_id: refId || null, thread: "bautraeger" } }),
    });
  } catch { /* Push ist Komfort, kein Vertrag */ }
}

export async function glocke(db: Db, mandant: string, typ: string, titel: string, text: string,
  refTabelle?: string | null, refId?: string | null, empfaenger?: string | null): Promise<void> {
  const { error } = await db.rpc("projekt_glocke", { p_mandant: mandant, p_typ: typ, p_titel: titel, p_text: text,
    p_ref_tabelle: refTabelle ?? null, p_ref_id: refId ?? null, p_empfaenger: empfaenger ?? null });
  if (error) console.error("projekt_glocke:", error.message);
}

export async function vermerk(db: Db, mandant: string, v: { immobilie_id?: string | null; kontakt_id?: string | null; typ: string; titel: string;
  text?: string | null; ref_tabelle?: string | null; ref_id?: string | null; benutzer_id?: string | null }): Promise<void> {
  if (!v.immobilie_id && !v.kontakt_id) return;   // ein Vermerk ohne Bezug steht nirgends
  const { error } = await db.from("vermerke").insert({ mandant_id: mandant, immobilie_id: v.immobilie_id ?? null, kontakt_id: v.kontakt_id ?? null,
    typ: v.typ, titel: v.titel.slice(0, 200), text: v.text ?? null, ref_tabelle: v.ref_tabelle ?? null, ref_id: v.ref_id ?? null,
    benutzer_id: v.benutzer_id ?? null, quelle: "system" });
  if (error) console.error("vermerke:", error.message);
}

export async function aktivitaet(db: Db, mandant: string, projektId: string, zugangId: string | null, typ: string, details: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("projekt_aktivitaeten").insert({ mandant_id: mandant, projekt_id: projektId, zugang_id: zugangId, typ, details });
  if (error) console.error("projekt_aktivitaeten:", error.message);
}

export async function verlauf(db: Db, mangelId: string, wer: string, was: string, text?: string | null): Promise<void> {
  const { error } = await db.rpc("mangel_verlauf_anhaengen", { p_mangel: mangelId, p_wer: wer, p_was: was, p_text: text ?? null });
  if (error) console.error("mangel_verlauf_anhaengen:", error.message);
}

/** Wer ist „die Verwaltung"? Die Chefs des Mandanten, dazu wer namentlich genannt ist. */
export async function verwaltung(db: Db, mandant: string, dazu: (string | null | undefined)[] = []): Promise<{ id: string; email: string | null; name: string | null }[]> {
  const { data } = await db.from("profiles").select("id, email, name, role").eq("mandant_id", mandant).eq("role", "chef");
  const liste: { id: string; email: string | null; name: string | null }[] = (data || []).map((p: any) => ({ id: p.id, email: p.email, name: p.name }));
  for (const id of dazu) {
    if (!id || liste.some((p) => p.id === id)) continue;
    const { data: p } = await db.from("profiles").select("id, email, name").eq("id", id).eq("mandant_id", mandant).maybeSingle();
    if (p) liste.push({ id: p.id, email: p.email, name: p.name });
  }
  return liste;
}

/** Base64-DataURL oder nacktes Base64 in Bytes + MIME. */
export function bytesAus(dataUrlOderBase64: string, mimeVorgabe = "image/jpeg"): { bytes: Uint8Array; mime: string } | null {
  const s = String(dataUrlOderBase64 || "");
  const m = s.match(/^data:([^;,]+)(?:;[^,]*?)?;base64,(.*)$/s);
  const mime = m ? m[1] : mimeVorgabe;
  const b64 = m ? m[2] : s;
  if (!b64 || b64.length > 12 * 1024 * 1024) return null;
  try {
    const bin = atob(b64.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { bytes: out, mime };
  } catch { return null; }
}
export const endung = (mime: string) => mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "application/pdf" ? "pdf" : "jpg";

export const sicher = (s: unknown) => String(s ?? "").replace(/[<>]/g, "");
