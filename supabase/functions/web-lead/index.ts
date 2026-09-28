import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

const CHEF_ID = "8e0529f2-51ac-4fa4-af66-eda473122053";
const EMPFAENGER = ["info@immooffice.example", "le@immooffice.example"];
const ABSENDER = "Musterhaus Immobilien Website <info@immooffice.example>";
const MAIL_VERZOEGERUNG_MS = 75_000; // Zeit für Schritt 2, danach geht die Mail mit allem raus, was da ist

const clean = (v: unknown, max = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 12;
}

function splitName(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return { vorname: parts.length > 1 ? parts.slice(0, -1).join(" ") : "", nachname: parts.length > 1 ? parts.at(-1)! : (name || "Website-Lead") };
}

async function mailSenden(leadId: string) {
  const db = sb();
  const { data: l } = await db.from("web_leads").select("*").eq("id", leadId).single();
  if (!l || l.mail_am) return;
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const heiss = /schnell|sofort/i.test(l.verkaufszeitpunkt ?? "");
  const warm = /3.6/.test(l.verkaufszeitpunkt ?? "");
  const flag = heiss ? "🔥🔥 HEISS" : warm ? "🔥 WARM" : l.verkaufszeitpunkt ? "🕒" : "❔";
  const quali = [l.verkaufszeitpunkt, l.eigentuemer ? (l.eigentuemer === "ja" ? "Eigentümer" : "KEIN Eigentümer") : "", l.anlass].filter(Boolean).join(" · ");
  const zeile = (k: string, v: string | null) => v ? `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>` : "";
  const html = `<div style="font-family:Montserrat,Arial,sans-serif;font-size:15px;color:#1a2342;max-width:640px">
    <div style="background:#263159;color:#fff;padding:14px 18px;border-left:4px solid #D4A567;font-size:17px;font-weight:700">${flag} Neuer Bewertungs-Lead von der Website</div>
    ${quali ? `<div style="background:#fff5e0;border:1px solid #D4A567;padding:10px 14px;margin:14px 0;font-weight:700;font-size:16px">${esc(quali)}</div>` : `<div style="background:#f3f3f3;padding:10px 14px;margin:14px 0;color:#666">Schritt 2 (Zeitpunkt/Eigentümer/Anlass) wurde nicht ausgefüllt – im Telefonat klären.</div>`}
    <p style="margin:6px 0"><b>Bitte innerhalb von 15 Minuten zurückrufen.</b></p>
    <table style="border-collapse:collapse">${zeile("Telefon", l.telefon)}${zeile("Name", l.name)}${zeile("E-Mail", l.email)}${zeile("Objektart", l.objektart)}${zeile("Adresse", l.adresse)}${zeile("Verkauf", l.verkaufszeitpunkt)}${zeile("Eigentümer", l.eigentuemer)}${zeile("Anlass", l.anlass)}${zeile("Nachricht", l.nachricht)}${zeile("Kontakt", l.kontakt_id ? "in ImmoOffice verknüpft" : "–")}${zeile("Quelle", l.seite)}${zeile("Google-Klick", l.gclid ? "ja (gclid vorhanden)" : null)}</table>
    <p style="margin-top:18px"><a href="tel:${esc(String(l.telefon).replace(/\s/g, ""))}" style="background:#D4A567;color:#1a2342;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">📞 ${esc(l.telefon)} anrufen</a></p>
    <p style="color:#888;font-size:12px;margin-top:22px">ImmoOffice · Lead-ID ${l.id}</p></div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: ABSENDER, to: EMPFAENGER, reply_to: l.email || undefined,
        subject: `${flag} Lead: ${l.objektart || "Immobilie"} in ${l.adresse}${l.verkaufszeitpunkt ? " – " + l.verkaufszeitpunkt : ""} – ${l.name || l.telefon}`, html }),
    });
    if (!r.ok) { console.error("resend", r.status, await r.text()); return; }
    await db.from("web_leads").update({ mail_am: new Date().toISOString() }).eq("id", leadId);
  } catch (e) { console.error("resend", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, fehler: "POST erwartet" }, 405);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  if (limited(ip)) return json({ ok: false, fehler: "Zu viele Anfragen" }, 429);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ ok: false, fehler: "Ungültige Daten" }, 400); }
  if (clean(b.website)) return json({ ok: true });
  const db = sb();

  // ---------- Schritt 2: Qualifizierung ----------
  if (b.schritt === 2) {
    const id = clean(b.lead_id, 60);
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, fehler: "Lead unbekannt" }, 400);
    const { data: l } = await db.from("web_leads").select("id, kontakt_id, name, email, notiz, schritt2_am").eq("id", id).single();
    if (!l) return json({ ok: false, fehler: "Lead unbekannt" }, 404);
    const name = clean(b.name, 120), email = clean(b.email, 120).toLowerCase();
    const upd: Record<string, unknown> = {
      verkaufszeitpunkt: clean(b.verkaufszeitpunkt, 60) || null,
      eigentuemer: clean(b.eigentuemer, 10) || null,
      anlass: clean(b.anlass, 60) || null,
      schritt2_am: new Date().toISOString(),
    };
    if (name) upd.name = name;
    if (email) upd.email = email;
    await db.from("web_leads").update(upd).eq("id", id);
    if (l.kontakt_id) {
      const k: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name) Object.assign(k, splitName(name));
      if (email) k.email = email;
      const { data: alt } = await db.from("kontakte").select("notiz").eq("id", l.kontakt_id).single();
      const z = `→ Qualifizierung: ${[upd.verkaufszeitpunkt, upd.eigentuemer ? "Eigentümer: " + upd.eigentuemer : "", upd.anlass].filter(Boolean).join(" · ")}`;
      k.notiz = [alt?.notiz, z].filter(Boolean).join("\n");
      await db.from("kontakte").update(k).eq("id", l.kontakt_id);
    }
    // Mail sofort mit allen Daten (falls der Timer aus Schritt 1 noch nicht gefeuert hat)
    await mailSenden(id);
    return json({ ok: true, id });
  }

  // ---------- Schritt 1: Lead anlegen ----------
  const objektart = clean(b.objektart, 60), adresse = clean(b.adresse, 200), telefon = clean(b.telefon, 40);
  const name = clean(b.name, 120), email = clean(b.email, 120).toLowerCase(), anlass = clean(b.anlass, 60), nachricht = clean(b.nachricht, 1000);
  if (!telefon || telefon.replace(/\D/g, "").length < 6) return json({ ok: false, fehler: "Bitte eine gültige Telefonnummer angeben." }, 400);
  if (!adresse || adresse.length < 4) return json({ ok: false, fehler: "Bitte Adresse oder Ort der Immobilie angeben." }, 400);

  let kontaktId: string | null = null;
  try {
    const telNorm = telefon.replace(/[^\d+]/g, "");
    let q = db.from("kontakte").select("id, rollen, notiz").limit(1);
    if (email) q = q.ilike("email", email);
    else q = q.or(`telefon.ilike.%${telNorm.slice(-8)}%,mobil.ilike.%${telNorm.slice(-8)}%`);
    const { data: k } = await q;
    const notizZeile = `${new Date().toLocaleDateString("de-DE")}: Bewertungsanfrage über Website (${objektart || "Objekt"}, ${adresse})${anlass ? " · Anlass: " + anlass : ""}${nachricht ? " · " + nachricht : ""}`;
    if (k && k[0]) {
      kontaktId = k[0].id;
      const rollen = Array.from(new Set([...(k[0].rollen ?? []), "eigentuemer"]));
      await db.from("kontakte").update({ rollen, notiz: [k[0].notiz, notizZeile].filter(Boolean).join("\n"), updated_at: new Date().toISOString() }).eq("id", kontaktId);
    } else {
      const { data: neu } = await db.from("kontakte").insert({
        ...splitName(name), telefon, email: email || null, strasse: adresse,
        rollen: ["eigentuemer"], quelle: "website", aktiv: true, notiz: notizZeile, zustaendig_id: CHEF_ID, ersteller_id: CHEF_ID,
      }).select("id").single();
      kontaktId = neu?.id ?? null;
    }
  } catch (e) { console.error("kontakt", e); }

  const { data: lead, error } = await db.from("web_leads").insert({
    objektart, adresse, name, telefon, email: email || null, anlass, nachricht,
    gclid: clean(b.gclid, 200) || null, utm: b.utm ?? null, seite: clean(b.seite, 300) || null,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null, ip: ip || null, kontakt_id: kontaktId,
  }).select("id").single();
  if (error) { console.error(error); return json({ ok: false, fehler: "Speichern fehlgeschlagen" }, 500); }

  await db.from("aktivitaeten").insert({
    zielgruppe: "makler", empfaenger_user_id: CHEF_ID, typ: "web_lead",
    titel: `🔥 Neuer Bewertungs-Lead: ${objektart || "Objekt"} · ${adresse}`,
    text: `${name || "Ohne Name"} · ${telefon}${email ? " · " + email : ""}`,
    ref_tabelle: "web_leads", ref_id: lead.id,
  }).then(({ error }) => error && console.error("aktivitaet", error));

  // Mail verzögert im Hintergrund – gibt Schritt 2 Zeit; danach mit allem, was vorliegt
  const timer = (async () => { await new Promise((r) => setTimeout(r, MAIL_VERZOEGERUNG_MS)); await mailSenden(lead.id); })();
  // @ts-ignore EdgeRuntime ist in Supabase vorhanden
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(timer); else await timer;

  return json({ ok: true, id: lead.id });
});
