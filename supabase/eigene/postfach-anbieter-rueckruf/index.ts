// ============================================================================
// postfach-anbieter-rueckruf — die Rückleitung von Microsoft oder Google
// ----------------------------------------------------------------------------
// EIGENE FUNKTION DES FORKS (supabase/eigene/, siehe dortige README).
//
// ÖFFENTLICH, und zwar zwangsläufig: der Anbieter schickt den BROWSER des
// Nutzers hierher, nicht die Anwendung. Ein Anmeldekopf kann dabei nicht
// mitkommen. Den Mandanten bekommt die Funktion deshalb nicht vom Aufrufer,
// sondern aus dem Vorgang, den postfach-anbieter-start angelegt hat — und
// der ist einmalig, zehn Minuten gültig und an Nutzer und Mandant gebunden.
//
// Was hier passiert:
//   1. Vorgang zum übergebenen Zustand suchen und SOFORT entwerten.
//   2. Code beim Anbieter gegen Tokens tauschen.
//   3. Die Kontoadresse aus dem id_token lesen.
//   4. Postfach anlegen oder aktualisieren — mit den IMAP- und SMTP-Daten
//      des Anbieters und dem verschlüsselten Erneuerungs-Token.
//   5. Eine Seite anzeigen, die sagt, was passiert ist.
//
// Was hier NICHT passiert: Mails abrufen. Das tut der Cron fünf Minuten
// später wie bei jedem anderen Postfach.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  adresseAusIdToken, anbieterOder400, codeTauschen, verschluessele,
} from "./anbieter.ts";

const VORGANG_GILT_MINUTEN = 10;

function seite(titel: string, text: string, weiter?: string | null, gut = true): Response {
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (z) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[z]);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titel)}</title>
<style>
body{margin:0;background:#FAFAFA;color:#1B2A47;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.k{background:#fff;border:1px solid #E6E8EB;border-top:4px solid ${gut ? "#B5934F" : "#c0392b"};
border-radius:10px;padding:28px;max-width:460px;box-shadow:0 2px 12px rgba(27,42,71,.06)}
h1{margin:0 0 10px;font-size:20px}p{margin:0 0 14px;color:#49525e}
a{display:inline-block;padding:10px 16px;border-radius:6px;background:#1B2A47;color:#fff;text-decoration:none;font-weight:600;font-size:14px}
small{color:#7A828C;font-size:12px}
</style></head><body><div class="k">
<h1>${esc(titel)}</h1><p>${esc(text)}</p>
${weiter ? `<a href="${esc(weiter)}">Zurück zu immoOffice.ai</a>` : ""}
<p><small>Dieses Fenster kann geschlossen werden.</small></p>
</div></body></html>`;
  return new Response(html, {
    status: gut ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Wohin zurück. Nur die eigene Oberfläche — ein Ziel aus dem Vorgang wird
 * gegen PORTAL_URL geprüft, sonst wäre das eine offene Weiterleitung, die
 * sich für Täuschungen benutzen lässt.
 */
function zielPruefen(weiter: string | null): string | null {
  const portal = (Deno.env.get("PORTAL_URL") || "").replace(/\/+$/, "");
  if (!portal) return null;
  if (!weiter) return portal;
  try {
    const a = new URL(weiter), b = new URL(portal);
    return a.origin === b.origin ? a.toString() : portal;
  } catch (_e) {
    return portal;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const zustand = url.searchParams.get("state");
  const fehlerAnbieter = url.searchParams.get("error_description")
    || url.searchParams.get("error");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  try {
    if (!zustand) {
      return seite("Verbindung nicht möglich",
        "Dieser Aufruf bringt keinen Vorgang mit. Bitte die Verbindung in "
        + "immoOffice.ai noch einmal starten.", zielPruefen(null), false);
    }

    // Suchen und im selben Schritt entwerten: zwei Rückrufe mit demselben
    // Zustand (Doppelklick, zurückgeschickter Link) dürfen nicht zweimal
    // ein Postfach anlegen.
    const grenze = new Date(Date.now() - VORGANG_GILT_MINUTEN * 60_000).toISOString();
    const { data: vorgaenge } = await admin.from("mail_oauth_vorgaenge")
      .update({ verbraucht_am: new Date().toISOString() })
      .eq("zustand", zustand).is("verbraucht_am", null).gte("erstellt_am", grenze)
      .select("id, mandant_id, benutzer_id, anbieter, postfach_id, weiter_zu");
    const vorgang = (vorgaenge || [])[0];
    if (!vorgang) {
      return seite("Vorgang abgelaufen",
        `Der Verbindungsvorgang ist abgelaufen oder wurde schon benutzt `
        + `(er gilt ${VORGANG_GILT_MINUTEN} Minuten). Bitte in immoOffice.ai `
        + `noch einmal auf „Verbinden" drücken.`, zielPruefen(null), false);
    }
    const ziel = zielPruefen(vorgang.weiter_zu);

    if (fehlerAnbieter || !code) {
      return seite("Nicht verbunden",
        "Der Anbieter hat die Verbindung nicht bestätigt: "
        + String(fehlerAnbieter || "kein Code übergeben").slice(0, 300),
        ziel, false);
    }

    const a = anbieterOder400(vorgang.anbieter);
    const tokens = await codeTauschen(a, code);
    const adresse = adresseAusIdToken(tokens.id_token);
    if (!adresse) {
      return seite("Adresse unbekannt",
        `${a.anzeige} hat die Verbindung bestätigt, aber keine E-Mail-Adresse `
        + `mitgeschickt. Ohne sie kann das Postfach nicht angelegt werden — `
        + `bitte bei der Zustimmung auch die Angabe der Adresse erlauben.`,
        ziel, false);
    }
    if (!tokens.refresh_token) {
      return seite("Verbindung nicht dauerhaft",
        `${a.anzeige} hat kein Erneuerungs-Token geschickt. Dann wäre die `
        + `Verbindung nach einer Stunde zu Ende. Bitte noch einmal verbinden `
        + `und die Zustimmung vollständig erteilen.`, ziel, false);
    }

    // Der Name des Absenders: der des Profils, nicht erfunden.
    const { data: profil } = await admin.from("profiles")
      .select("name, mandant_id").eq("id", vorgang.benutzer_id).maybeSingle();

    const gemeinsam: Record<string, any> = {
      anbieter: a.name,
      oauth_konto: adresse,
      oauth_refresh_verschluesselt: await verschluessele(tokens.refresh_token),
      oauth_zugriff_verschluesselt: await verschluessele(tokens.access_token!),
      oauth_gueltig_bis: new Date(
        Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString(),
      oauth_bereiche: tokens.scope || a.bereiche,
      oauth_verbunden_am: new Date().toISOString(),
      oauth_fehler: null,
      // Abruf und Versand gehen über die Server des Anbieters. Die Felder
      // heißen wie beim Passwort-Postfach, damit Abruf und Versand EINEN
      // Weg haben — nur die Anmeldung ist eine andere.
      imap_server: a.imap.server,
      imap_port: a.imap.port,
      imap_security: a.imap.security,
      imap_user: adresse,
      imap_aktiv: true,
      smtp_server: a.smtp.server,
      smtp_port: a.smtp.port,
      smtp_security: a.smtp.security,
      smtp_user: adresse,
      // Ein Passwort gibt es nicht mehr. Ein altes stehen zu lassen wäre
      // ein Geheimnis ohne Zweck.
      smtp_passwort_verschluesselt: null,
      imap_passwort_verschluesselt: null,
      aktiv: true,
      updated_at: new Date().toISOString(),
    };

    // Schon vorhanden? Entweder weil der Nutzer ein bestehendes Postfach
    // neu verbindet, oder weil dieselbe Adresse schon einmal angebunden
    // war (benutzer_id + email_adresse sind eindeutig, fork_17).
    let vorhanden: any = null;
    if (vorgang.postfach_id) {
      const { data } = await admin.from("mail_postfaecher")
        .select("id, benutzer_id").eq("id", vorgang.postfach_id).maybeSingle();
      if (data && data.benutzer_id === vorgang.benutzer_id) vorhanden = data;
    }
    if (!vorhanden) {
      const { data } = await admin.from("mail_postfaecher")
        .select("id").eq("benutzer_id", vorgang.benutzer_id)
        .eq("email_adresse", adresse).maybeSingle();
      vorhanden = data;
    }

    if (vorhanden) {
      const { error } = await admin.from("mail_postfaecher")
        .update(gemeinsam).eq("id", vorhanden.id);
      if (error) throw new Error("Postfach nicht aktualisiert: " + error.message);
    } else {
      const { error } = await admin.from("mail_postfaecher").insert({
        ...gemeinsam,
        // Der Mandant kommt aus dem Vorgang, nicht aus dem Aufruf: ein
        // öffentlicher Endpunkt darf ihn nicht raten (tests/
        // oeffentlich-insert-mandant.py).
        mandant_id: vorgang.mandant_id || profil?.mandant_id || null,
        benutzer_id: vorgang.benutzer_id,
        email_adresse: adresse,
        absender_name: profil?.name || adresse,
      });
      if (error) throw new Error("Postfach nicht angelegt: " + error.message);
    }

    return seite(`${a.anzeige} verbunden`,
      `Das Postfach ${adresse} ist angebunden. Der Abruf beginnt mit dem `
      + `nächsten Lauf — das kann ein paar Minuten dauern.`, ziel, true);
  } catch (f) {
    const text = String((f as Error).message || f).slice(0, 400);
    return seite("Verbindung fehlgeschlagen", text, zielPruefen(null), false);
  }
});
