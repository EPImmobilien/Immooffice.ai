// ============================================================
// eigentuemer-einladen (v25, 26.09.2026) – v25: Mailtext mit Gueltigkeit und Selbsthilfe #zugang (einladung-mail.ts v2)
//
// Wird vom Makler aufgerufen. Macht folgendes:
// 1. Prueft ob Eigentuemer-Datensatz existiert (per E-Mail) - sonst anlegen
// 2. Erzeugt den Anmeldelink selbst (auth.admin.generateLink) und verschickt ihn
//    ueber Resend mit unserem Absender (Beleg in mail_versendet). Ohne RESEND_API_KEY:
//    Rueckfall auf die Supabase-Auth-Mail wie bisher. Siehe einladung-mail.ts.
// 3. Verknuepft den Eigentuemer mit dem Maklervertrag in eigentuemer_objekte
// 4. Erzeugt einen Einladungs-Datensatz (versandweg, ggf. letzter_fehler) + Aktivitaet
//
// Input:  { email, vorname, nachname, titel?, telefon?, maklervertrag_id, ansprechpartner_id }
// Output: { ok: true, eigentuemer_id, einladung_id, auth_user_id, versandweg } oder { ok: false, error }
// ============================================================

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
import { einladungVersenden } from "./einladung-mail.ts";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
    }

    // Auth-Header weitergeben um aktuellen User zu pruefen
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt    = authHeader.replace(/^Bearer\s+/i, "");

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userData?.user) throw new Error("Nicht authentifiziert.");
    const aktuellerUserId = userData.user.id;

    // Rolle pruefen
    const { data: profil } = await userClient
      .from("profiles").select("role, name").eq("id", aktuellerUserId).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
      throw new Error("Nur Makler oder Chef duerfen Eigentuemer einladen.");
    }

    const body = await req.json();
    const email          = (body.email || "").toString().trim().toLowerCase();
    const vorname        = (body.vorname || "").toString().trim();
    const nachname       = (body.nachname || "").toString().trim();
    const titel          = (body.titel || "").toString().trim();
    const telefon        = (body.telefon || "").toString().trim();
    const anrede         = (body.anrede || "").toString().trim();
    const firma          = (body.firma || "").toString().trim();
    const strasse        = (body.strasse || "").toString().trim();
    const plz            = (body.plz || "").toString().trim();
    const ort            = (body.ort || "").toString().trim();
    const maklervertragId = body.maklervertrag_id || null;
    const ansprechpartnerId = body.ansprechpartner_id || aktuellerUserId;
    await immoMandantSichern(req, [["vertraege", String(maklervertragId || "")],
                                   ["profiles", String(ansprechpartnerId || "")]]);
    const redirectTo     = body.redirect_to || Deno.env.get("PORTAL_URL") || "https://immooffice.example/";

    if (!email || !email.includes("@")) throw new Error("Ungültige E-Mail-Adresse.");

    // Admin-Client mit Service-Role-Key (RLS umgehen)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) Bestehenden Eigentuemer ueber E-Mail finden
    const mandantDesAufrufers = await immoMandantDesAufrufers(req);
    if (!mandantDesAufrufers) throw new Error("Kein Mandant am Konto — ohne den keine Einladung.");

    // Ueber die Adresse allein faellt die Suche ueber die Mandantengrenze:
    // derselbe Eigentuemer kann bei zwei Maklern liegen, und die Einladung
    // haette sich an den Datensatz des anderen gehaengt.
    const { data: bestehend } = await adminClient
      .from("eigentuemer")
      .select("id, user_id, anrede, titel, vorname, nachname")
      .eq("mandant_id", mandantDesAufrufers)
      .ilike("email", email)
      .maybeSingle();

    let eigentuemerId = bestehend?.id || null;
    let authUserId    = bestehend?.user_id || null;

    // 2) Wenn kein Eigentuemer existiert: anlegen
    if (!eigentuemerId) {
      const { data: neuerEigentuemer, error: insErr } = await adminClient
        .from("eigentuemer")
        .insert({
          email, vorname, nachname, titel: titel || null, telefon, anrede, firma, strasse, plz, ort,
          created_by: aktuellerUserId,
        })
        .select("id, user_id")
        .single();
      if (insErr) throw new Error("Eigentuemer anlegen fehlgeschlagen: " + insErr.message);
      eigentuemerId = neuerEigentuemer.id;
    } else if (titel) {
      await adminClient.from("eigentuemer").update({ titel }).eq("id", eigentuemerId);
    }

    // 3) Bestehenden Auth-User zur E-Mail suchen (falls noch nicht verknuepft)
    if (!authUserId) {
      const { data: existingUsersResp } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const treffer = existingUsersResp?.users?.find(u => (u.email || "").toLowerCase() === email);
      if (treffer) authUserId = treffer.id;
    }

    // Ansprechpartner fuer Absender/Antwortadresse
    const { data: makler } = await adminClient
      .from("profiles").select("id, name, email, telefon").eq("id", ansprechpartnerId).maybeSingle();

    // 4) Einladung verschicken (Resend mit eigenem Absender, sonst Supabase-Auth)
    let versandweg = "resend"; let mailFehler: string | null = null;
    try {
      const erg = await einladungVersenden(adminClient, {
        email, userId: authUserId,
        vorname: vorname || bestehend?.vorname || "", nachname: nachname || bestehend?.nachname || "",
        anrede: anrede || bestehend?.anrede || "", titel: titel || bestehend?.titel || "",
        redirectTo, makler: makler || { id: aktuellerUserId, name: profil.name }, erneut: false,
      });
      versandweg = erg.versandweg; authUserId = erg.userId || authUserId;
    } catch (e) {
      mailFehler = String((e as Error)?.message || e);
    }

    if (authUserId) {
      await adminClient.from("eigentuemer").update({ user_id: authUserId }).eq("id", eigentuemerId);

      // Profil mit Rolle "eigentuemer" sicherstellen (Trigger legt evtl. "mitarbeiter" an - Sicherheits-Bug vermeiden).
      // Nur ein explizites "chef"-Profil bleibt unangetastet.
      const fullName = [vorname, nachname].filter(Boolean).join(" ") || email;
      const { data: existingProfile } = await adminClient
        .from("profiles").select("id, role").eq("id", authUserId).maybeSingle();
      if (existingProfile) {
        if (existingProfile.role === "chef") {
          console.warn(`[Einladung] User ${authUserId} ist Chef - Rolle nicht ueberschrieben.`);
        } else {
          await adminClient.from("profiles").update({
            role: "eigentuemer", name: fullName, email, titel: titel || null,
          }).eq("id", authUserId);
        }
      } else {
        await adminClient.from("profiles").insert({
          id: authUserId, role: "eigentuemer", name: fullName, email, titel: titel || null,
        });
      }
    }

    // 5) Verknuepfung anlegen wenn Maklervertrag mitgegeben
    if (maklervertragId) {
      const { error: linkErr } = await adminClient
        .from("eigentuemer_objekte")
        .upsert({
          eigentuemer_id: eigentuemerId,
          maklervertrag_id: maklervertragId,
          ansprechpartner_id: ansprechpartnerId,
          created_by: aktuellerUserId,
        }, { onConflict: "eigentuemer_id,maklervertrag_id" });
      if (linkErr) console.warn("Verknuepfung-Fehler:", linkErr);
    }

    // 6) Einladungs-Datensatz fuer Nachverfolgung (auch bei Mail-Fehler, damit das Nachfassen greift)
    const { data: einladung } = await adminClient
      .from("eigentuemer_einladungen")
      .insert({
        email, vorname, nachname,
        maklervertrag_id: maklervertragId,
        eigentuemer_id: eigentuemerId,
        created_by: aktuellerUserId,
        status: "offen",
        versandweg: mailFehler ? null : versandweg,
        letzter_fehler: mailFehler ? mailFehler.slice(0, 500) : null,
      })
      .select("id")
      .single();

    await adminClient.from("aktivitaeten").insert({
      zielgruppe: "makler", eigentuemer_id: eigentuemerId,
      typ: mailFehler ? "einladung_fehler" : "einladung_gesendet",
      titel: mailFehler ? `Einladung an ${email} konnte nicht verschickt werden` : `Portal-Einladung an ${email} verschickt`,
      text: mailFehler ? mailFehler.slice(0, 500) : `Versandweg ${versandweg}, Ansprechpartner ${makler?.name || profil.name || ""}.`,
      ref_tabelle: "eigentuemer_einladungen", ref_id: einladung?.id || null,
    }).then(() => {}, () => {});

    if (mailFehler) throw new Error("Eigentümer angelegt, aber die Einladungs-Mail konnte nicht verschickt werden: " + mailFehler);

    return new Response(
      JSON.stringify({
        ok: true,
        eigentuemer_id: eigentuemerId,
        einladung_id: einladung?.id,
        auth_user_id: authUserId,
        versandweg,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
