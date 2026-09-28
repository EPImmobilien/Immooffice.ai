// ============================================================================
// onoffice-waechter v1 (04.08.26)
// ----------------------------------------------------------------------------
// Hintergrund: Sync-Ausfaelle (fehlende Fotos 03.08., Portal-Schutz-Deadlock
// 04.08.) fielen erst auf, als Lasse sie im Portal bemerkte. Der Waechter
// prueft die Kette stuendlich selbst und meldet Befunde per Mail — Lasse soll
// nicht mehr der Fruehwarnsensor sein.
// Ablauf: rpc onoffice_waechter_befunde() (Security Definer, prueft cron/net/
// Spiegel/Portal) -> bei Befunden Mail via Resend an den Chef.
// Anti-Spam: gleiche Befundlage (Hash) fruehestens alle 24 Std. erneut;
// NEUE Befundlage sofort; Entwarnungs-Mail einmalig, wenn alles wieder gruen.
// Zustand in public.waechter_status (id=1).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMPFAENGER = "info@immooffice.example";
const ABSENDER = "ImmoOffice W\u00e4chter <world@immooffice.example>";
const WIEDERHOLUNG_MS = 24 * 60 * 60 * 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hashVon(befunde: any[]): Promise<string> {
  const basis = befunde.map((b) => b.code + "|" + b.text).sort().join("\n");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  return Array.from(new Uint8Array(bytes)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function mailSenden(betreff: string, text: string): Promise<string | null> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "RESEND_API_KEY nicht gesetzt";
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: ABSENDER, to: [EMPFAENGER], subject: betreff, text }),
  });
  if (!resp.ok) return `Resend HTTP ${resp.status}: ${await resp.text()}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { data: befundeRoh, error: rpcErr } = await db.rpc("onoffice_waechter_befunde");
    if (rpcErr) throw rpcErr;
    const befunde: any[] = Array.isArray(befundeRoh) ? befundeRoh : [];

    const { data: status } = await db.from("waechter_status").select("*").eq("id", 1).maybeSingle();
    const jetzt = new Date();
    let gesendet = false;
    let mailFehler: string | null = null;

    if (befunde.length) {
      const hash = await hashVon(befunde);
      const neueLage = hash !== status?.letzter_hash;
      const langeHer = !status?.letzte_mail || (jetzt.getTime() - new Date(status.letzte_mail).getTime()) > WIEDERHOLUNG_MS;
      if (neueLage || langeHer) {
        const zeilen = befunde.map((b, i) => `${i + 1}. ${b.text}`).join("\n\n");
        mailFehler = await mailSenden(
          `\u26a0\ufe0f onOffice-Sync: ${befunde.length} Hinweis${befunde.length === 1 ? "" : "e"}`,
          `Moin Lasse,\n\nder W\u00e4chter hat beim st\u00fcndlichen Check der onOffice-Sync-Kette Folgendes gefunden:\n\n${zeilen}\n\nGleiche Befundlage wird fr\u00fchestens in 24 Std. erneut gemeldet; neue Befunde kommen sofort. Sobald alles wieder gr\u00fcn ist, gibt es einmalig eine Entwarnung.\n\n\u2014 ImmoOffice W\u00e4chter (onoffice-waechter, st\u00fcndlich Minute 20)`,
        );
        if (!mailFehler) {
          gesendet = true;
          await db.from("waechter_status").update({ letzte_mail: jetzt.toISOString(), letzter_hash: hash, updated_at: jetzt.toISOString() }).eq("id", 1);
        }
      }
    } else if (status?.letzter_hash) {
      // Vorher Befunde, jetzt alles gruen -> einmalige Entwarnung
      mailFehler = await mailSenden(
        "\u2705 onOffice-Sync: Entwarnung",
        "Moin Lasse,\n\nalle zuvor gemeldeten Hinweise zur onOffice-Sync-Kette sind behoben \u2014 der W\u00e4chter meldet wieder gr\u00fcn.\n\n\u2014 ImmoOffice W\u00e4chter",
      );
      if (!mailFehler) {
        gesendet = true;
        await db.from("waechter_status").update({ letzte_mail: jetzt.toISOString(), letzter_hash: null, updated_at: jetzt.toISOString() }).eq("id", 1);
      }
    }

    return antwort({ ok: !mailFehler, befunde_anzahl: befunde.length, befunde, mail_gesendet: gesendet, mail_fehler: mailFehler });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
