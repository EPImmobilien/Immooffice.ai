// ============================================================
// Edge Function: eigentuemer-zugang-anfordern (v1, 26.09.2026)
//
// Selbsthilfe fuer Eigentuemer ohne Anmeldung: Auf der Anmeldeseite (Portal #zugang, oder nach einem
// abgelaufenen Anmeldelink) gibt der Eigentuemer seine E-Mail-Adresse ein und bekommt sofort einen
// frischen Anmeldelink ueber Resend (einladung-mail.ts, Beleg in mail_versendet, Aktivitaet fuer den Makler).
//
// Ohne Login aufrufbar (nur anon-Key). Schutz:
// - Antwort immer { ok: true } – ob zu der Adresse ein Zugang besteht, wird nicht verraten.
// - Nur Konten mit profiles.role = eigentuemer (bzw. eigentuemer / eigentuemer_personen mit user_id).
// - Hoechstens ein Versand je Adresse in 10 Minuten, hoechstens 30 Versendungen je Stunde insgesamt.
//
// Input:  { email }
// Output: { ok: true } (bei ungueltiger Eingabe { ok: false, error })
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { einladungVersenden } from "./einladung-mail.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const antwort = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const JE_ADRESSE_MINUTEN = 10, JE_STUNDE_GESAMT = 30;
const BETREFF_MUSTER = "Ihr Zugang zum Eigentümer-Portal%";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return antwort({ ok: false, error: "Nur POST" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Supabase-Secrets fehlen.");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return antwort({ ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
    const portalUrl = (Deno.env.get("PORTAL_URL") || "https://immooffice.example").replace(/\/?$/, "/");
    const still = (grund: string) => { console.log(`zugang-anfordern ${email}: ${grund}`); return antwort({ ok: true }); };

    // Drosselung
    const seitAdresse = new Date(Date.now() - JE_ADRESSE_MINUTEN * 60e3).toISOString();
    const { count: nAdresse } = await admin.from("mail_versendet").select("id", { count: "exact", head: true })
      .eq("empfaenger_email", email).ilike("betreff", BETREFF_MUSTER).eq("status", "gesendet").gte("gesendet_am", seitAdresse);
    if ((nAdresse || 0) > 0) return still("zuletzt vor weniger als 10 Minuten gesendet");
    const seitStunde = new Date(Date.now() - 3600e3).toISOString();
    const { count: nGesamt } = await admin.from("mail_versendet").select("id", { count: "exact", head: true })
      .ilike("betreff", BETREFF_MUSTER).eq("status", "gesendet").gte("gesendet_am", seitStunde);
    if ((nGesamt || 0) >= JE_STUNDE_GESAMT) return still("Stundenkontingent erschöpft");

    // Konto finden: Profil mit Rolle eigentuemer, sonst Eigentuemer/Person mit verknuepftem Konto
    let userId: string | null = null;
    const { data: prof } = await admin.from("profiles").select("id, role").eq("email", email).eq("role", "eigentuemer").limit(1).maybeSingle();
    if (prof?.id) userId = prof.id;
    const { data: eig } = await admin.from("eigentuemer").select("id, anrede, titel, vorname, nachname, user_id, aktiv").eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: pers } = await admin.from("eigentuemer_personen").select("id, anrede, vorname, nachname, user_id, eigentuemer_id").eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!userId) userId = eig?.user_id || pers?.user_id || null;
    if (!userId) return still("kein Eigentümer-Zugang zu dieser Adresse");
    if (eig && eig.aktiv === false && !pers) return still("Eigentümer inaktiv");
    const { data: profRolle } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profRolle && profRolle.role !== "eigentuemer") return still("Konto ist kein Eigentümer-Konto");

    const eigentuemerId = eig?.id || pers?.eigentuemer_id || null;
    let anrede = eig?.anrede || pers?.anrede || "", titel = eig?.titel || "";
    const vorname = eig?.vorname || pers?.vorname || "", nachname = eig?.nachname || pers?.nachname || "";
    if (!anrede && pers?.eigentuemer_id) {
      const { data: eigA } = await admin.from("eigentuemer").select("anrede, titel").eq("id", pers.eigentuemer_id).maybeSingle();
      anrede = eigA?.anrede || ""; titel = titel || eigA?.titel || "";
    }
    // Ansprechpartner (Reply-To): hinterlegter Ansprechpartner, sonst Chef
    let makler: any = null;
    if (eigentuemerId) {
      const { data: eo } = await admin.from("eigentuemer_objekte").select("ansprechpartner_id").eq("eigentuemer_id", eigentuemerId).not("ansprechpartner_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (eo?.ansprechpartner_id) { const { data: ap } = await admin.from("profiles").select("id, name, email, telefon").eq("id", eo.ansprechpartner_id).maybeSingle(); makler = ap || null; }
    }
    if (!makler) { const { data: chef } = await admin.from("profiles").select("id, name, email, telefon").eq("role", "chef").limit(1).maybeSingle(); makler = chef || null; }

    try {
      const erg = await einladungVersenden(admin, { email, userId, vorname, nachname, anrede, titel, redirectTo: portalUrl, makler, erneut: true });
      if (eigentuemerId) {
        await admin.from("aktivitaeten").insert({ zielgruppe: "makler", eigentuemer_id: eigentuemerId, typ: "einladung_nachgefasst", titel: `Anmeldelink selbst angefordert: ${email}`, text: `Der Eigentümer hat auf der Anmeldeseite einen neuen Anmeldelink angefordert (Versandweg ${erg.versandweg}).`, ref_tabelle: "eigentuemer", ref_id: eigentuemerId }).then(() => {}, () => {});
        await admin.from("eigentuemer_einladungen").update({ erinnert_am: new Date().toISOString(), versandweg: erg.versandweg, letzter_fehler: null }).eq("eigentuemer_id", eigentuemerId).eq("status", "offen").then(() => {}, () => {});
      }
      console.log(`zugang-anfordern ${email}: gesendet (${erg.versandweg}, ${erg.methode})`);
    } catch (e) {
      console.error(`zugang-anfordern ${email}: Versand fehlgeschlagen –`, String((e as Error)?.message || e));
    }
    return antwort({ ok: true });
  } catch (e) {
    console.error("eigentuemer-zugang-anfordern:", e);
    return antwort({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
