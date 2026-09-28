// ============================================================================
// newsletter-senden v3 (Team-Zugriff per JWT; Chef oder Mitarbeiter mit Recht "newsletter")
//   POST { kampagne_id, test_an?, freigabe_code? }  -> versendet eine Kampagne aus newsletter_kampagnen
//   Echter Versand nur mit gültigem Freigabe-Code: Prüfung über newsletter_freigabe_pruefen() gegen das
//   Vault-Geheimnis newsletter_freigabe_code (v2). Testversand braucht keinen Code.
//   v3: Platzhalter {{NL_TOKEN}} (abmelde_token des Empfängers, Vorbelegung auf freigabe.html?objekt=…) und
//       {{KAMPAGNE_ID}} für den direkten Exposé-Download aus der Mail.
//   Empfänger: Funktion newsletter_empfaenger(zielgruppe) – aktive, bestätigte Anmeldungen ohne Werbe-Widerspruch,
//   je Adresse einmal. Jede Mail wird personalisiert ({{ANREDE}}, {{ABMELDE_LINK}}, {{EMAIL}}, {{ANMELDE_DATUM}}),
//   Versand über Resend (Batch, 50 je Aufruf) vom gewählten Postfach, mit List-Unsubscribe-Kopfzeile.
//   Testversand: nur an test_an, Abmelde-Link führt auf eine Beispiel-Seite, nichts wird protokolliert außer test_gesendet_am.
//   Protokoll: newsletter_versand je Empfänger, Kampagne bekommt Status/Zahlen.
//   Quelle im Repo: portal/newsletter-tool/newsletter-senden.ts
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ABMELDE_BASIS = `${Deno.env.get("SUPABASE_URL")}/functions/v1/newsletter-abmelden`;
const BATCH = 50;

function anrede(name: string | null): string {
  const n = String(name || "").trim();
  return n ? `Guten Tag ${n}` : "Guten Tag";
}
function esc(s: unknown): string { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }
function personalisieren(html: string, text: string, e: { name: string | null; email: string; abmelde_token: string; angemeldet_am: string | null }, test: boolean, kampagneId = "") {
  const link = test ? `${ABMELDE_BASIS}?t=beispiel` : `${ABMELDE_BASIS}?t=${e.abmelde_token}`;
  const datum = e.angemeldet_am ? new Date(e.angemeldet_am).toLocaleDateString("de-DE") : "";
  const nlToken = encodeURIComponent(test ? "beispiel" : String(e.abmelde_token || ""));
  const ersetzen = (s: string, h: boolean) => s.replace(/\{\{ANREDE\}\}/g, h ? esc(anrede(e.name)) : anrede(e.name)).replace(/\{\{ABMELDE_LINK\}\}/g, link).replace(/\{\{EMAIL\}\}/g, h ? esc(e.email) : e.email).replace(/\{\{ANMELDE_DATUM\}\}/g, datum).replace(/\{\{NL_TOKEN\}\}/g, nlToken).replace(/\{\{KAMPAGNE_ID\}\}/g, encodeURIComponent(kampagneId));
  return { html: ersetzen(html, true), text: ersetzen(text, false), link };
}
function textAusHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n").replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null as any };
    if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    const { data: profil } = await db.from("profiles").select("id, name, role, rechte, email").eq("id", u.user.id).maybeSingle();
    const rechte = (profil?.rechte && typeof profil.rechte === "object") ? profil.rechte : null;
    const darf = profil?.role === "chef" || (profil?.role === "mitarbeiter" && (!rechte || Object.keys(rechte).length === 0 || rechte.newsletter === true));
    if (!darf) return antwort({ ok: false, fehler: "Keine Berechtigung für den Newsletter-Versand." }, 403);

    const body = await req.json().catch(() => ({}));
    const kampagneId = String(body.kampagne_id || "");
    const testAn = body.test_an ? String(body.test_an).trim().toLowerCase() : null;
    if (!kampagneId) return antwort({ ok: false, fehler: "kampagne_id fehlt." }, 400);
    const { data: k, error: kErr } = await db.from("newsletter_kampagnen").select("*").eq("id", kampagneId).maybeSingle();
    if (kErr || !k) return antwort({ ok: false, fehler: "Kampagne nicht gefunden." }, 404);
    if (!k.html || !k.betreff) return antwort({ ok: false, fehler: "Kampagne hat noch keinen Betreff oder Inhalt – bitte zuerst speichern (Vorschau erzeugen)." }, 400);
    if (!testAn && k.status === "gesendet") return antwort({ ok: false, fehler: "Diese Kampagne wurde bereits versendet." }, 409);
    if (!testAn) {
      const code = String(body.freigabe_code ?? "").trim();
      if (!code) return antwort({ ok: false, fehler: "Freigabe-Code fehlt – ohne Code wird nicht versendet." }, 403);
      const { data: freigabeOk, error: fErr } = await db.rpc("newsletter_freigabe_pruefen", { p_code: code });
      if (fErr) { console.error("newsletter_freigabe_pruefen:", fErr); return antwort({ ok: false, fehler: "Freigabe-Code konnte nicht geprüft werden." }, 500); }
      if (freigabeOk !== true) return antwort({ ok: false, fehler: "Freigabe-Code falsch – Versand abgebrochen." }, 403);
    }
    if (!/\{\{ABMELDE_LINK\}\}/.test(k.html)) return antwort({ ok: false, fehler: "Der Inhalt enthält keinen Abmelde-Link – Versand ohne Abmeldemöglichkeit ist nicht erlaubt." }, 400);

    const { data: pf } = k.postfach_id ? await db.from("mail_postfaecher").select("id, email_adresse, absender_name, benutzer_id").eq("id", k.postfach_id).eq("aktiv", true).maybeSingle() : { data: null as any };
    if (!pf) return antwort({ ok: false, fehler: "Kein aktives Absender-Postfach an der Kampagne." }, 400);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return antwort({ ok: false, fehler: "RESEND_API_KEY nicht gesetzt." }, 500);
    const von = `${pf.absender_name || "Musterhaus Immobilien GmbH"} <${pf.email_adresse}>`;
    const text = textAusHtml(k.html);

    // Testversand
    if (testAn) {
      const p = personalisieren(k.html, text, { name: profil?.name || null, email: testAn, abmelde_token: "beispiel", angemeldet_am: new Date().toISOString() }, true, k.id);
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: von, to: [testAn], reply_to: pf.email_adresse, subject: `[TEST] ${k.betreff}`, html: p.html, text: p.text }) });
      if (!r.ok) return antwort({ ok: false, fehler: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
      await db.from("newsletter_kampagnen").update({ test_an: testAn, test_gesendet_am: new Date().toISOString(), status: k.status === "entwurf" ? "test" : k.status, updated_at: new Date().toISOString() }).eq("id", k.id);
      return antwort({ ok: true, test: true, an: testAn });
    }

    // Empfänger
    const z = k.zielgruppe || {};
    const { data: empf, error: eErr } = await db.rpc("newsletter_empfaenger", { p_objektarten: Array.isArray(z.objektarten) && z.objektarten.length ? z.objektarten : null, p_vertragsart: z.vertragsart || "alle" });
    if (eErr) throw eErr;
    const liste = (empf || []) as any[];
    if (!liste.length) return antwort({ ok: false, fehler: "Keine Empfänger für diese Zielgruppe (aktive, bestätigte Anmeldungen)." }, 400);

    let gesendet = 0, fehler = 0; const protokoll: any[] = [];
    for (let i = 0; i < liste.length; i += BATCH) {
      const teil = liste.slice(i, i + BATCH);
      const mails = teil.map((e) => { const p = personalisieren(k.html, text, e, false, k.id); return { from: von, to: [e.name ? `${e.name} <${e.email}>` : e.email], reply_to: pf.email_adresse, subject: k.betreff, html: p.html, text: p.text, headers: { "List-Unsubscribe": `<${p.link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }; });
      const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify(mails) });
      const rj = await r.json().catch(() => ({}));
      const ids: string[] = r.ok && rj && Array.isArray(rj.data) ? rj.data.map((x: any) => x.id) : [];
      teil.forEach((e, idx) => {
        const okEinzeln = r.ok && !!ids[idx];
        if (okEinzeln) gesendet++; else fehler++;
        protokoll.push({ kampagne_id: k.id, anmeldung_id: e.anmeldung_id, email: e.email, name: e.name, status: okEinzeln ? "gesendet" : "fehler", fehler: okEinzeln ? null : `Resend ${r.status}: ${JSON.stringify(rj).slice(0, 180)}`, resend_id: ids[idx] || null });
      });
      if (!r.ok) console.error("Resend Batch:", r.status, JSON.stringify(rj).slice(0, 300));
    }
    for (let i = 0; i < protokoll.length; i += 200) await db.from("newsletter_versand").insert(protokoll.slice(i, i + 200));
    await db.from("newsletter_kampagnen").update({ status: fehler && !gesendet ? "fehler" : "gesendet", gesendet_am: new Date().toISOString(), empfaenger_anzahl: liste.length, gesendet_anzahl: gesendet, fehler_anzahl: fehler, updated_at: new Date().toISOString() }).eq("id", k.id);
    return antwort({ ok: true, empfaenger: liste.length, gesendet, fehler });
  } catch (e) {
    console.error("newsletter-senden:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
