// ============================================================================
// eigentuemer-person-hinzufuegen
// ============================================================================
// Wird vom Makler aufgerufen. Fuegt zu einem BESTEHENDEN eigentuemer-Datensatz
// eine zusaetzliche Person hinzu, legt einen Auth-User an und verschickt eine
// Einladungs-Mail (Magic Link).
//
// Input:
//   {
//     eigentuemer_id: uuid,
//     email: string,
//     vorname?: string,
//     nachname?: string,
//     anrede?: string,
//     telefon?: string,
//     erhaelt_emails?: boolean,  // default true
//   }
// Output:
//   { ok: true, person_id, user_id } | { ok: false, error }
// ============================================================================

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
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
    }

    // ---- Auth + Rolle pruefen ----
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt    = authHeader.replace(/^Bearer\s+/i, "");

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userData?.user) throw new Error("Nicht authentifiziert.");
    const aktuellerUserId = userData.user.id;

    const { data: profil } = await userClient
      .from("profiles").select("role, name").eq("id", aktuellerUserId).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
      throw new Error("Nur Makler duerfen Personen hinzufuegen.");
    }

    // ---- Body parsen ----
    const body = await req.json();
    const eigentuemerId = (body.eigentuemer_id || "").toString().trim();
    await immoMandantSichern(req, [["eigentuemer", eigentuemerId]]);
    const email         = (body.email || "").toString().trim().toLowerCase();
    const vorname       = (body.vorname || "").toString().trim();
    const nachname      = (body.nachname || "").toString().trim();
    const anrede        = (body.anrede || "").toString().trim();
    const telefon       = (body.telefon || "").toString().trim();
    const erhaeltEmails = body.erhaelt_emails !== false; // default true

    if (!eigentuemerId) throw new Error("eigentuemer_id ist Pflicht.");
    if (!email || !email.includes("@")) throw new Error("Ungueltige E-Mail-Adresse.");

    // ---- Eigentuemer-Datensatz pruefen ----
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: eig, error: eigErr } = await adminClient
      .from("eigentuemer").select("id, firma, mandant_id").eq("id", eigentuemerId).maybeSingle();
    if (eigErr || !eig) throw new Error("Eigentuemer-Datensatz nicht gefunden.");

    // ---- Pruefen ob diese Email schon Person ist (irgendwo) ----
    // "irgendwo" hiess bis zum 30.09.2026 auch "bei einem anderen Makler".
    // Die Fehlermeldung darunter haette damit verraten, dass diese Adresse
    // beim Mitbewerber als Eigentuemer gefuehrt wird.
    const { data: existsPerson } = await adminClient
      .from("eigentuemer_personen")
      .select("id, eigentuemer_id")
      .eq("mandant_id", eig.mandant_id)
      .ilike("email", email)
      .maybeSingle();
    if (existsPerson) {
      if (existsPerson.eigentuemer_id === eigentuemerId) {
        throw new Error("Diese E-Mail-Adresse ist bereits eine Person dieses Eigentuemer-Datensatzes.");
      }
      throw new Error("Diese E-Mail-Adresse ist bereits eine Person eines anderen Eigentuemer-Datensatzes.");
    }

    // ---- Auth-User anlegen oder vorhandenen finden ----
    // Wenn die Email schon einen Auth-User hat (z.B. weil dieselbe Person bei
    // einem anderen Eigentuemer-Datensatz angelegt wurde), nutzen wir den
    // bestehenden User-Account.
    const { data: usersList } = await adminClient.auth.admin.listUsers();
    let authUser = usersList?.users?.find(u => (u.email || "").toLowerCase() === email);
    let mailMethode: "invite" | "otp" | "manual" | "none" = "none";
    let manualLink: string | undefined = undefined;

    if (!authUser) {
      // Neu einladen (sendet Magic-Link-Mail via Supabase Auth-SMTP)
      const { data: inviteResp, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: "https://immooffice.example/",
          data: {
            invited_by: profil.name || aktuellerUserId,
            rolle_ziel: "eigentuemer",
            eigentuemer_id: eigentuemerId,
            vorname, nachname,
          },
        },
      );
      if (inviteErr) {
        // Wenn "already registered", versuchen wir gleich Strategie OTP
        if (!inviteErr.message?.toLowerCase().includes("already")) {
          throw new Error(`Einladung fehlgeschlagen: ${inviteErr.message}`);
        }
      } else {
        authUser = inviteResp?.user;
        mailMethode = "invite";
      }
    }

    // Falls Auth-User schon existierte ODER inviteUserByEmail "already registered"
    // gemeldet hat: per signInWithOtp einen Magic-Link senden, damit die Person
    // trotzdem eine Einladungsmail bekommt.
    if (mailMethode === "none") {
      try {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (anonKey) {
          const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
          const { error: otpErr } = await anonClient.auth.signInWithOtp({
            email,
            options: {
              emailRedirectTo: "https://immooffice.example/",
              shouldCreateUser: false,
            },
          });
          if (!otpErr) {
            mailMethode = "otp";
          } else {
            console.warn("OTP-Versand fehlgeschlagen:", otpErr.message);
          }
        }
      } catch (otpEx) {
        console.warn("OTP-Versand exception:", otpEx);
      }

      // Wenn auch OTP nicht geklappt hat: manueller Link als Fallback
      if (mailMethode === "none") {
        try {
          const { data: linkData } = await adminClient.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: { redirectTo: "https://immooffice.example/" },
          });
          if (linkData?.properties?.action_link) {
            manualLink = linkData.properties.action_link;
            mailMethode = "manual";
          }
        } catch (linkEx) {
          console.warn("generateLink fehlgeschlagen:", linkEx);
        }
      }
    }

    // Falls wir noch keinen authUser haben (Email war schon registriert),
    // jetzt aus der listUsers-Liste heraussuchen.
    if (!authUser) {
      const { data: refresh } = await adminClient.auth.admin.listUsers();
      authUser = refresh?.users?.find(u => (u.email || "").toLowerCase() === email);
    }
    if (!authUser) throw new Error("Konnte Auth-User nicht ermitteln.");

    // ---- profiles-Eintrag sicherstellen (Rolle eigentuemer) ----
    const fullName = [vorname, nachname].filter(Boolean).join(" ") || email;
    try {
      await adminClient.from("profiles").upsert({
        id: authUser.id,
        role: "eigentuemer",
        name: fullName,
        email,
      }, { onConflict: "id" });
    } catch (_) { /* falls profiles-Schema anders ist, ignorieren */ }

    // ---- Person anlegen ----
    const { data: person, error: personErr } = await adminClient
      .from("eigentuemer_personen")
      .insert({
        eigentuemer_id: eigentuemerId,
        user_id: authUser.id,
        anrede, vorname, nachname, email, telefon,
        erhaelt_emails: erhaeltEmails,
        ist_hauptperson: false,    // Hauptperson bleibt die erste; weitere sind Co-Eigentuemer
        created_by: aktuellerUserId,
      })
      .select()
      .single();
    if (personErr) throw new Error(`Person konnte nicht angelegt werden: ${personErr.message}`);

    return jsonResponse({
      ok: true,
      person_id: person.id,
      user_id: authUser.id,
      mail_methode: mailMethode,         // "invite" | "otp" | "manual" | "none"
      manual_link: manualLink,           // nur gefuellt wenn mail_methode = "manual"
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("eigentuemer-person-hinzufuegen:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}