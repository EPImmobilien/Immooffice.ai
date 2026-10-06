// ============================================================================
// postfach-anbieter-start — ein Postfach bei Microsoft oder Google verbinden
// ----------------------------------------------------------------------------
// EIGENE FUNKTION DES FORKS (supabase/eigene/, siehe dortige README).
//
// Sie legt einen Vorgang an und gibt die Adresse zurück, an die der Browser
// den Nutzer schickt. Sie verschickt nichts, speichert kein Token und
// berührt kein Postfach — das tut erst der Rückruf.
//
// Angemeldet (verify_jwt = true): nur wer eingeloggt ist, darf ein Postfach
// an sein Konto hängen. Der Vorgang hält Nutzer UND Mandant fest; daran
// erkennt der öffentliche Rückruf später, wem er das Postfach gibt. Ein
// Zustand, den der Aufrufer selbst mitbringen könnte, würde das nicht
// leisten.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ANBIETER, anbieterOder400, rueckrufAdresse, zugang } from "./anbieter.ts";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (stand: number, inhalt: unknown) =>
  new Response(JSON.stringify(inhalt), { status: stand, headers: KOPF });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  try {
    const kopf = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+/i.test(kopf)) return json(401, { ok: false, error: "Nicht angemeldet." });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } });
    const alsNutzer = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });

    const { data: u } = await alsNutzer.auth.getUser();
    if (!u?.user) return json(401, { ok: false, error: "Nicht angemeldet." });
    const { data: profil } = await admin.from("profiles")
      .select("id, mandant_id").eq("id", u.user.id).maybeSingle();
    if (!profil) return json(403, { ok: false, error: "Kein Profil." });

    const body = await req.json().catch(() => ({}));

    // Nur die Liste, ohne etwas anzulegen: die Oberfläche fragt damit, was
    // dieser Betreiber überhaupt eingerichtet hat.
    if (body.nur_anbieter) {
      const liste = Object.values(ANBIETER).map((a) => {
        let bereit = true, grund = "";
        try { zugang(a); } catch (f) { bereit = false; grund = String((f as Error).message); }
        return { name: a.name, anzeige: a.anzeige, bereit, grund };
      });
      return json(200, { ok: true, anbieter: liste, rueckruf: rueckrufAdresse() });
    }

    const a = anbieterOder400(body.anbieter);
    zugang(a);                     // meldet früh, wenn der Betreiber nichts hinterlegt hat

    // Ein Postfach darf nur neu verbunden werden, wenn es dem Aufrufer
    // gehört. Ohne diese Prüfung könnte eine fremde Kennung im
    // Anfragekörper das Token eines anderen Postfachs überschreiben.
    let postfachId: string | null = null;
    if (typeof body.postfach_id === "string" && body.postfach_id) {
      const { data: pf } = await admin.from("mail_postfaecher")
        .select("id, benutzer_id").eq("id", body.postfach_id).maybeSingle();
      if (!pf || pf.benutzer_id !== u.user.id) {
        return json(403, { ok: false, error: "Dieses Postfach gehört nicht zu diesem Konto." });
      }
      postfachId = pf.id;
    }

    await admin.rpc("mail_oauth_aufraeumen");

    const zustand = crypto.randomUUID() + "." + crypto.randomUUID();
    const { error: vErr } = await admin.from("mail_oauth_vorgaenge").insert({
      mandant_id: profil.mandant_id,
      benutzer_id: u.user.id,
      anbieter: a.name,
      zustand,
      postfach_id: postfachId,
      weiter_zu: typeof body.weiter_zu === "string" ? body.weiter_zu.slice(0, 500) : null,
    });
    if (vErr) return json(500, { ok: false, error: "Vorgang nicht angelegt: " + vErr.message });

    const { id } = zugang(a);
    const felder = new URLSearchParams({
      client_id: id,
      response_type: "code",
      redirect_uri: rueckrufAdresse(),
      scope: a.bereiche,
      state: zustand,
      ...a.extra,
    });
    return json(200, {
      ok: true,
      url: `${a.autorisierung}?${felder.toString()}`,
      anbieter: a.name,
      anzeige: a.anzeige,
      // Damit die Oberfläche sagen kann, was der Nutzer gleich sieht.
      bereiche: a.bereiche.split(" "),
    });
  } catch (f) {
    return json(400, { ok: false, error: String((f as Error).message || f) });
  }
});
