// ============================================================
// Edge Function: eigentuemer-link-erneut-senden (v26, 26.09.2026) – v26: Mailtext mit Gueltigkeit und Selbsthilfe #zugang (einladung-mail.ts v2)
//
// Sendet einem bereits angelegten Eigentümer (oder einer berechtigten Person)
// einen neuen Anmeldelink per E-Mail. Wird vom Makler aufgerufen.
//
// Neu ab v25: Der Link wird selbst erzeugt (auth.admin.generateLink) und über
// Resend mit unserem Absender verschickt – mit Beleg in mail_versendet.
// Ohne RESEND_API_KEY: Rückfall auf die Supabase-Auth-Mail (invite / OTP).
// Schlägt alles fehl: generateLink als "manual_link" (Makler gibt Link weiter).
//
// Input:  { eigentuemer_id | person_id, redirect_to? }
// Output: { ok: true, email, methode: "resend"|"invite"|"otp"|"manual_link", action_link? } oder { ok: false, error }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { einladungVersenden } from "./einladung-mail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ ok: false, error: "Nur POST" }, 405);

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase-Secrets fehlen (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");

    // Aufrufer prüfen (muss eingeloggter Makler sein)
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userData?.user) throw new Error("Nicht authentifiziert.");
    const { data: profil } = await userClient
      .from("profiles").select("id, role, name, email, telefon").eq("id", userData.user.id).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) throw new Error("Keine Berechtigung.");

    const { eigentuemer_id, person_id, redirect_to } = await req.json();
    if (!eigentuemer_id && !person_id) throw new Error("eigentuemer_id oder person_id fehlt.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Empfänger ermitteln: gezielt eine Person, sonst Hauptperson des Eigentümers, sonst eigentuemer.email
    let email: string | null = null, userIdGefunden: string | null = null;
    let vorname = "", nachname = "", anrede = "", titel = "";
    let eigentuemerIdFuerUpdate: string | null = null;

    if (person_id) {
      const { data: person, error: pErr } = await adminClient
        .from("eigentuemer_personen")
        .select("id, email, vorname, nachname, anrede, user_id, eigentuemer_id")
        .eq("id", person_id).maybeSingle();
      if (pErr) throw pErr;
      if (!person) throw new Error("Person nicht gefunden.");
      if (!person.email) throw new Error("Person hat keine E-Mail-Adresse.");
      email = person.email; userIdGefunden = person.user_id;
      vorname = person.vorname || ""; nachname = person.nachname || ""; anrede = person.anrede || "";
      eigentuemerIdFuerUpdate = person.eigentuemer_id;
    } else {
      const { data: hp } = await adminClient
        .from("eigentuemer_personen")
        .select("id, email, vorname, nachname, anrede, user_id, eigentuemer_id")
        .eq("eigentuemer_id", eigentuemer_id).eq("ist_hauptperson", true).maybeSingle();
      if (hp && hp.email) {
        email = hp.email; userIdGefunden = hp.user_id;
        vorname = hp.vorname || ""; nachname = hp.nachname || ""; anrede = hp.anrede || "";
        eigentuemerIdFuerUpdate = hp.eigentuemer_id;
      } else {
        const { data: eig, error: eigErr } = await adminClient
          .from("eigentuemer")
          .select("id, email, vorname, nachname, anrede, titel, user_id")
          .eq("id", eigentuemer_id).maybeSingle();
        if (eigErr) throw eigErr;
        if (!eig) throw new Error("Eigentümer nicht gefunden.");
        if (!eig.email) throw new Error("Eigentümer hat keine E-Mail-Adresse hinterlegt.");
        email = eig.email; userIdGefunden = eig.user_id;
        vorname = eig.vorname || ""; nachname = eig.nachname || ""; anrede = eig.anrede || ""; titel = eig.titel || "";
        eigentuemerIdFuerUpdate = eig.id;
      }
    }
    if (!anrede && eigentuemerIdFuerUpdate) {
      const { data: eigA } = await adminClient.from("eigentuemer").select("anrede, titel").eq("id", eigentuemerIdFuerUpdate).maybeSingle();
      anrede = eigA?.anrede || ""; titel = titel || eigA?.titel || "";
    }

    email = email!.toLowerCase().trim();
    const redirect = redirect_to || Deno.env.get("PORTAL_URL") || "https://immooffice.example/";

    // Ansprechpartner (Reply-To): hinterlegter Ansprechpartner des Eigentümers, sonst der Aufrufer
    let makler: any = profil;
    if (eigentuemerIdFuerUpdate) {
      const { data: eo } = await adminClient.from("eigentuemer_objekte").select("ansprechpartner_id").eq("eigentuemer_id", eigentuemerIdFuerUpdate)
        .not("ansprechpartner_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (eo?.ansprechpartner_id) {
        const { data: ap } = await adminClient.from("profiles").select("id, name, email, telefon").eq("id", eo.ansprechpartner_id).maybeSingle();
        if (ap) makler = ap;
      }
    }

    // Offene Einladung fuer die Nachverfolgung
    const { data: einl } = eigentuemerIdFuerUpdate ? await adminClient.from("eigentuemer_einladungen").select("id, erinnerungen")
      .eq("eigentuemer_id", eigentuemerIdFuerUpdate).eq("status", "offen").order("created_at", { ascending: false }).limit(1).maybeSingle() : { data: null as any };

    let methode = "resend"; let neuerUserId: string | null = null;
    try {
      const erg = await einladungVersenden(adminClient, {
        email, userId: userIdGefunden, vorname, nachname, anrede, titel, redirectTo: redirect, makler, erneut: !!userIdGefunden,
      });
      methode = erg.versandweg === "resend" ? "resend" : erg.methode;
      neuerUserId = erg.userId && erg.userId !== userIdGefunden ? erg.userId : null;
    } catch (e) {
      const fehler = String((e as Error)?.message || e);
      console.warn("Mail-Versand fehlgeschlagen:", fehler);
      if (einl?.id) await adminClient.from("eigentuemer_einladungen").update({ letzter_fehler: fehler.slice(0, 500) }).eq("id", einl.id);
      // Letzter Ausweg: Link manuell weitergeben
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: userIdGefunden ? "magiclink" : "invite", email, options: { redirectTo: redirect, data: { role_hint: "eigentuemer", vorname, nachname } },
      });
      if (linkErr) throw new Error("Alle Versandmethoden fehlgeschlagen. Letzter Fehler: " + fehler);
      if (!userIdGefunden && linkData?.user?.id) neuerUserId = linkData.user.id;
      if (neuerUserId) await verknuepfeUser(adminClient, neuerUserId, person_id, eigentuemerIdFuerUpdate);
      return antwort({
        ok: true, email, methode: "manual_link",
        hinweis: "Es konnte keine Mail automatisch verschickt werden (" + fehler + "). Bitte folgenden Link manuell an den Eigentümer weitergeben.",
        action_link: linkData?.properties?.action_link,
      });
    }

    if (neuerUserId) await verknuepfeUser(adminClient, neuerUserId, person_id, eigentuemerIdFuerUpdate);

    if (einl?.id) {
      await adminClient.from("eigentuemer_einladungen").update({
        erinnert_am: new Date().toISOString(), erinnerungen: (einl.erinnerungen || 0) + 1,
        versandweg: methode === "resend" ? "resend" : "supabase-auth", letzter_fehler: null,
      }).eq("id", einl.id);
    }
    if (eigentuemerIdFuerUpdate) {
      await adminClient.from("aktivitaeten").insert({
        zielgruppe: "makler", eigentuemer_id: eigentuemerIdFuerUpdate, typ: "einladung_nachgefasst",
        titel: `Anmeldelink erneut gesendet an ${email}`,
        text: `Von ${profil.name || profil.email || "Makler"} ausgelöst, Versandweg ${methode}.`,
        ref_tabelle: einl?.id ? "eigentuemer_einladungen" : null, ref_id: einl?.id || null,
      }).then(() => {}, () => {});
    }

    return antwort({ ok: true, email, methode });
  } catch (e) {
    console.error(e);
    return antwort({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

async function verknuepfeUser(adminClient: any, userId: string, personId: string | null | undefined, eigentuemerId: string | null) {
  if (personId) {
    await adminClient.from("eigentuemer_personen").update({ user_id: userId }).eq("id", personId);
  } else if (eigentuemerId) {
    await adminClient.from("eigentuemer_personen").update({ user_id: userId }).eq("eigentuemer_id", eigentuemerId).eq("ist_hauptperson", true);
    await adminClient.from("eigentuemer").update({ user_id: userId }).eq("id", eigentuemerId);
  }
  const { data: prof } = await adminClient.from("profiles").select("id, role").eq("id", userId).maybeSingle();
  if (!prof) await adminClient.from("profiles").insert({ id: userId, role: "eigentuemer" });
  else if (prof.role !== "chef" && prof.role !== "eigentuemer") await adminClient.from("profiles").update({ role: "eigentuemer" }).eq("id", userId);
}
