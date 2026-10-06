// ============================================================================
// expose-sofortversand — die Kette von der Anfrage bis zur Mail
// ============================================================================
// Eigene Funktion des Forks (fork_45). Ansage des Betreibers vom 06.10.2026:
// „wir müssen auf jeden Fall den Exposé-Sofortversand reinnehmen … für diesen
// Sofortversand muss eine E-Mail-Adresse hinterlegt sein … da geht's darum,
// dass die Kunden quasi 24/7 auf die Dateien zugreifen können."
//
// Sie erfindet nichts. Alle drei Teile gab es schon, sie waren nur nicht
// verbunden:
//
//   expose_freigaben   Freigabe-Token mit Provisionstext und Bestätigung.
//                      Der Link ist rund um die Uhr erreichbar — das IST der
//                      24/7-Zugriff, es braucht dafür kein zweites Portal.
//   mail-senden        Versand über das Postfach des Mandanten.
//   mail-anfrage-      erkennt Portal- und Website-Anfragen und ordnet
//   verarbeiten        Objekt und Kontakt zu. Sie ruft diese Funktion hier.
//
// ---------------------------------------------------------------------------
// LINK ODER ANHANG — das entscheidet nicht der Mandant
// ---------------------------------------------------------------------------
// Bei einem Kaufobjekt mit Provision muss der Provisionshinweis den Käufer in
// Textform erreichen. Die Vorlage löst das über die Bestätigungsseite am
// Freigabe-Link: erst bestätigen, dann herunterladen. Ein Exposé als blanker
// Anhang geht an dieser Bestätigung vorbei. Deshalb: Kauf mit Provision ->
// IMMER Link. Miete und provisionsfrei -> Anhang erlaubt (Bestellerprinzip,
// § 2 WoVermRG; dort gibt es keine Provision, über die zu belehren wäre).
//
// Das ist kein Rechtsrat und keine Zusicherung. § 656a BGB und die Frage,
// wann ein Maklervertrag zustande kommt, bleiben in der Verantwortung des
// Mandanten; die Musterformulierungen sind anwaltlich ungeprüft. Die
// Funktion sorgt nur dafür, dass der Automatismus nicht HINTER den Weg
// zurückfällt, den die Vorlage von Hand schon geht.
//
// ---------------------------------------------------------------------------
// WAS SIE NICHT TUT
// ---------------------------------------------------------------------------
// * Nichts an Eigentümer. Eine Bewertungsanfrage ist keine Exposé-Anfrage.
// * Nichts ohne hinterlegtes Postfach. „Es muss eine E-Mail-Adresse
//   hinterlegt sein" ist die Bedingung des Betreibers — hier ist sie Code.
// * Nichts zweimal. Dieselbe Adresse bekommt zum selben Objekt innerhalb der
//   Sperrfrist nur eine Mail, auch wenn ein Portal die Anfrage doppelt
//   zustellt. Das kommt vor, und zwei identische Mails hintereinander sind
//   das, was ein Interessent als Erstes bemerkt.
// * Nichts über das Tageslimit hinaus. Eine Schleife, die ein Postfach
//   leerschießt, fällt sonst erst beim Anbieter auf.
// * Nichts ohne Exposé. Ohne PDF am Objekt gibt es nichts zu senden.
//
// Jeder dieser Fälle wird protokolliert, nicht verschwiegen: ein stiller
// Nicht-Versand ist sonst nicht von einem Fehler zu unterscheiden.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINK_BASIS = (Deno.env.get("EXPOSE_FREIGABE_BASIS") || "https://immooffice.example/?expose=")
  .replace(/\/\?expose=$/, "/freigabe.html?expose=");
const OBJEKT_BASIS = LINK_BASIS.replace(/freigabe\.html\?expose=$/, "objekt.html?t=");

const SCHLUESSEL = "expose_sofortversand";

// Vorgaben. Sie gelten, solange der Mandant nichts einstellt — und sie sind
// bewusst so gewählt, dass ohne Zutun NICHTS hinausgeht: aktiv ist false.
// Ein Automatismus, der sich selbst einschaltet, ist eine Zumutung.
const VORGABE = {
  aktiv: false,
  postfach_id: null as string | null,
  sperrfrist_stunden: 24,
  max_pro_tag: 200,
  gueltig_tage: 0,              // 0 = ohne Ablauf, wie die Vorlage
  betreff: "Ihre Anfrage zu {objekt}",
  text: [
    "Guten Tag {anrede},",
    "",
    "vielen Dank für Ihr Interesse an {objekt}.",
    "",
    "Über den folgenden Link erhalten Sie das Exposé und die freigegebenen",
    "Unterlagen — jederzeit abrufbar:",
    "",
    "{link}",
    "",
    "Für Rückfragen stehen wir Ihnen gerne zur Verfügung.",
  ].join("\n"),
};

const antwort = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

function token(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function provisionNorm(p: unknown): string {
  let s = String(p ?? "").trim();
  if (!s) return "";
  s = s.replace(/\s*%\s*$/, "").replace(/\s+/g, " ");
  if (/^\d+([.,]\d+)?$/.test(s)) s = s.replace(".", ",") + " %";
  else if (!/%/.test(s)) s = s + " %";
  return s;
}

function mailAdresse(roh: unknown): string {
  return String(roh ?? "").replace(/^.*<([^>]+)>.*$/, "$1").trim().toLowerCase();
}

// Ein Protokolleintrag — auch und gerade dann, wenn nichts hinausging.
async function buchen(db: any, satz: Record<string, unknown>) {
  const { error } = await db.from("expose_sofortversand").insert(satz);
  if (error) console.error("expose-sofortversand: Protokoll nicht geschrieben:", error.message);
}

function einsetzen(vorlage: string, werte: Record<string, string>): string {
  return vorlage.replace(/\{(\w+)\}/g, (ganz, name) =>
    Object.prototype.hasOwnProperty.call(werte, name) ? werte[name] : ganz);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // --- Wer darf das? ----------------------------------------------------
    // Zwei Aufrufer: ein angemeldeter Mensch (Knopf „jetzt senden", Probelauf)
    // und mail-anfrage-verarbeiten mit dem Dienstschlüssel. Für den Menschen
    // gilt die Rollenprüfung, für die Funktion die Mandantenkennung aus dem
    // Datensatz, auf dem sie arbeitet.
    const kopf = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const istDienst = kopf === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let userId: string | null = null;
    if (!istDienst) {
      const { data: u } = await db.auth.getUser(kopf);
      if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
      const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      if (!p || !["chef", "mitarbeiter"].includes(p.role)) {
        return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      }
      userId = u.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const probe = body.probe === true;
    const ausgeloestVon = ["anfrage", "web-lead", "hand"].includes(String(body.ausgeloest_von))
      ? String(body.ausgeloest_von) : "hand";
    const immobilieId = String(body.immobilie_id || "").trim();
    if (!immobilieId) return antwort({ ok: false, fehler: "immobilie_id fehlt." }, 400);

    // --- Objekt, und damit der Mandant -----------------------------------
    const { data: im } = await db.from("immobilien")
      .select("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, " +
              "vertragsart, provision_aussen, provisionsfrei, zustaendig_id, mandant_id")
      .eq("id", immobilieId).maybeSingle();
    if (!im) return antwort({ ok: false, fehler: "Objekt nicht gefunden." }, 404);
    const mandant = im.mandant_id;

    // Ein angemeldeter Aufrufer darf nicht über die Mandantengrenze greifen.
    // Für den Dienstschlüssel gilt die Grenze nicht — er hat keinen Mandanten,
    // er ARBEITET für einen, und welcher das ist, steht am Objekt.
    if (!istDienst) {
      const nutzer = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${kopf}` } }, auth: { persistSession: false } });
      const { error } = await nutzer.rpc("mandant_sichern", { p_tabelle: "immobilien", p_id: immobilieId });
      if (error) return antwort({ ok: false, fehler: "Kein Zugriff auf Daten eines anderen Mandanten." }, 403);
    }

    const objektName = (im.immo_nr ? `Nr. ${im.immo_nr} ` : "")
      + (im.objekttitel || im.bezeichnung || [im.strasse, im.hausnummer].filter(Boolean).join(" ") || "Ihrem Objekt");

    const email = mailAdresse(body.email);
    const kontaktId = String(body.kontakt_id || "") || null;
    const mailEingangId = String(body.mail_eingang_id || "") || null;
    const grundlage = {
      mandant_id: mandant, immobilie_id: immobilieId, kontakt_id: kontaktId,
      email: email || "(ohne)", mail_eingang_id: mailEingangId, ausgeloest_von: ausgeloestVon,
    };
    // Abbruch mit Protokoll. Jeder Grund steht in Klartext da — wer später
    // fragt „warum kam nichts an?", bekommt eine Antwort statt einer Vermutung.
    const abbruch = async (grund: string) => {
      if (!probe) await buchen(db, { ...grundlage, status: "uebersprungen", grund });
      return antwort({ ok: true, gesendet: false, grund });
    };

    // --- Einstellungen des Mandanten --------------------------------------
    const { data: e } = await db.from("portal_einstellungen")
      .select("wert").eq("mandant_id", mandant).eq("schluessel", SCHLUESSEL).maybeSingle();
    const cfg = { ...VORGABE, ...(e?.wert && typeof e.wert === "object" ? e.wert : {}) };

    if (!cfg.aktiv && !probe) return await abbruch("Sofortversand ist für diesen Mandanten nicht eingeschaltet.");
    if (!email || !email.includes("@")) return await abbruch("Keine E-Mail-Adresse des Interessenten.");

    // --- Das Postfach: die Bedingung des Betreibers ------------------------
    // „Für diesen Sofortversand muss eine E-Mail-Adresse hinterlegt sein."
    // Entweder das ausdrücklich gewählte Postfach oder das Standardpostfach
    // des Mandanten. Keines davon: kein Versand, und zwar mit Ansage.
    let postfach: any = null;
    if (cfg.postfach_id) {
      const { data } = await db.from("mail_postfaecher")
        .select("id, email_adresse, absender_name, aktiv, mandant_id, benutzer_id")
        .eq("id", cfg.postfach_id).eq("mandant_id", mandant).maybeSingle();
      postfach = data;
      if (!postfach) return await abbruch("Das eingestellte Absender-Postfach gibt es nicht mehr.");
      if (!postfach.aktiv) return await abbruch(`Das Absender-Postfach ${postfach.email_adresse} ist abgeschaltet.`);
    } else {
      const { data } = await db.from("mail_postfaecher")
        .select("id, email_adresse, absender_name, aktiv, benutzer_id, standard_zum_senden, ist_standard, reihenfolge")
        .eq("mandant_id", mandant).eq("aktiv", true)
        .order("standard_zum_senden", { ascending: false })
        .order("ist_standard", { ascending: false })
        .order("reihenfolge", { ascending: true })
        .limit(1);
      postfach = (data || [])[0] || null;
      if (!postfach) {
        return await abbruch(
          "Kein Absender-Postfach hinterlegt. Der Sofortversand braucht eine " +
          "Absenderadresse — Einstellungen → E-Mail-Postfächer.");
      }
    }

    // --- Das Exposé --------------------------------------------------------
    const { data: dateien } = await db.from("immobilie_datei")
      .select("id, name, storage_path, created_at, expose_final, interessenten_freigabe")
      .eq("immobilie_id", immobilieId).order("created_at", { ascending: false }).limit(200);
    const exposes = (dateien || []).filter((d: any) =>
      /\.pdf$/i.test(d.name || "") && (/\/expose\//i.test(d.storage_path || "") || /expos/i.test(d.name || "")));
    const expose = exposes.find((d: any) => d.expose_final) || exposes[0];
    if (!expose) return await abbruch("Am Objekt liegt noch kein Exposé-PDF.");
    const dokumente = (dateien || [])
      .filter((d: any) => d.interessenten_freigabe && d.storage_path && d.id !== expose.id)
      .map((d: any) => d.id);

    // --- Sperre gegen Doppelversand ---------------------------------------
    const seit = new Date(Date.now() - Number(cfg.sperrfrist_stunden || 24) * 3600_000).toISOString();
    const { data: schon } = await db.from("expose_sofortversand")
      .select("id, created_at").eq("immobilie_id", immobilieId).eq("email", email)
      .eq("status", "gesendet").gte("created_at", seit).limit(1);
    if ((schon || []).length) {
      return await abbruch(
        `Diese Adresse hat das Exposé zu diesem Objekt in den letzten ` +
        `${cfg.sperrfrist_stunden} Stunden schon bekommen.`);
    }

    // --- Tageslimit --------------------------------------------------------
    const tagesBeginn = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from("expose_sofortversand")
      .select("id", { count: "exact", head: true })
      .eq("mandant_id", mandant).eq("status", "gesendet").gte("created_at", tagesBeginn);
    if ((count || 0) >= Number(cfg.max_pro_tag || 200)) {
      return await abbruch(`Tageslimit von ${cfg.max_pro_tag} Sofortversänden erreicht.`);
    }

    // --- Provisionsmodell: entscheidet über Link oder Anhang ---------------
    const istMiete = /miet/i.test(String(im.vertragsart || ""));
    const provision = provisionNorm(im.provision_aussen);
    let modell: string;
    if (istMiete) modell = "miete";
    else if (im.provisionsfrei || !provision || /^0([.,]0+)? %$/.test(provision)) modell = "provisionsfrei";
    else modell = "kaeufer";

    const provisionText = modell === "miete"
      ? "Für Sie als Mieter fallen keine Maklerkosten an (Bestellerprinzip, § 2 WoVermRG)."
      : modell === "provisionsfrei"
        ? "Der Erwerb dieser Immobilie ist für Sie als Käufer provisionsfrei."
        : `Im Falle des Erwerbs der Immobilie zahlen Sie als Käufer eine Maklerprovision in Höhe von ${provision} inkl. der gesetzlichen Mehrwertsteuer, berechnet auf den beurkundeten Kaufpreis. Die Provision ist ausschließlich dann verdient und fällig, wenn ein notarieller Kaufvertrag über diese Immobilie mit Ihnen zustande kommt. Das Anfordern des Exposés, Besichtigungen und unsere Beratung sind für Sie kostenfrei – entscheiden Sie sich gegen den Kauf, entstehen Ihnen keinerlei Kosten.`;

    // Immer der Link, nie das PDF im Anhang — und das kann der Mandant nicht
    // einstellen. Zwei Gründe, die beide für sich reichen:
    //
    //   1. Bei Provision muss der Hinweis den Käufer in Textform erreichen.
    //      Das leistet die Bestätigungsseite am Link, nicht ein Anhang.
    //   2. Auch ohne Provision: expose_freigaben weiß, WER WANN
    //      heruntergeladen hat. Darauf bauen Nachfassen und Erinnerung auf.
    //      Ein Anhang ist nach dem Senden blind.
    //
    // Die Spalte `weg` hält den Anhang-Weg offen, falls ihn jemand
    // ausdrücklich verlangt. Eingeschaltet ist er nirgends.
    const weg: "link" | "anhang" = "link";

    if (probe) {
      return antwort({
        ok: true, probe: true, gesendet: false,
        wuerde_senden: true,
        absender: postfach.email_adresse, empfaenger: email,
        objekt: objektName, expose: expose.name, dokumente: dokumente.length,
        provisionsmodell: modell, weg,
      });
    }

    // --- Freigabe anlegen --------------------------------------------------
    let firmaSlug: string | null = null;
    const { data: zp } = await db.from("profiles").select("firma_id")
      .eq("id", im.zustaendig_id || userId || "00000000-0000-0000-0000-000000000000").maybeSingle();
    if (zp?.firma_id) {
      const { data: f } = await db.from("firma_stammdaten").select("slug")
        .eq("id", zp.firma_id).eq("mandant_id", mandant).maybeSingle();
      firmaSlug = f?.slug || null;
    }
    const { data: ls } = await db.from("portal_einstellungen")
      .select("wert").eq("mandant_id", mandant).eq("schluessel", "landing_standard").maybeSingle();
    const landing = ls ? ls.wert === true : true;

    const t = token();
    const { data: freigabe, error: fErr } = await db.from("expose_freigaben").insert({
      token: t, immobilie_id: immobilieId, kontakt_id: kontaktId, email,
      name: String(body.name || "").trim() || null,
      provisionsmodell: modell, provision_text: provisionText,
      firma_slug: firmaSlug || "standard", erstellt_von: userId,
      expose_datei_id: expose.id, dokument_ids: dokumente, landing,
      gueltig_bis: Number(cfg.gueltig_tage) > 0
        ? new Date(Date.now() + Number(cfg.gueltig_tage) * 86_400_000).toISOString() : null,
      mandant_id: mandant,
    }).select("id").single();
    if (fErr) {
      await buchen(db, { ...grundlage, status: "fehler", grund: `Freigabe nicht angelegt: ${fErr.message}`, weg });
      return antwort({ ok: false, fehler: fErr.message }, 500);
    }
    const url = landing ? `${OBJEKT_BASIS}${t}` : `${LINK_BASIS}${t}`;

    // --- Mail bauen und senden --------------------------------------------
    const anredeName = String(body.name || "").trim();
    const werte = {
      objekt: objektName,
      anrede: anredeName || "Damen und Herren",
      link: url,
      ort: [im.plz, im.ort].filter(Boolean).join(" "),
    };
    const betreff = einsetzen(String(cfg.betreff || VORGABE.betreff), werte);
    const text = einsetzen(String(cfg.text || VORGABE.text), werte);

    const { data: versand, error: vErr } = await db.functions.invoke("mail-senden", {
      body: {
        postfach_id: postfach.id,
        // Der Automatismus hat keinen angemeldeten Menschen. mail-senden
        // braucht aber einen — es prüft, wem das Postfach gehört. Also sagt
        // der Aufruf, in wessen Namen gesendet wird: im Namen dessen, dem
        // das Postfach gehört. Mehr Rechte entstehen dadurch nicht; die
        // Prüfung dort bleibt dieselbe.
        als_benutzer_id: postfach.benutzer_id,
        an: email,
        an_name: anredeName || null,
        betreff,
        text,
        automatisch: true,
        mandant_id: mandant,
      },
    });
    const gescheitert = vErr || (versand && versand.ok === false);
    if (gescheitert) {
      const grund = vErr?.message || versand?.fehler || "Versand fehlgeschlagen.";
      await buchen(db, { ...grundlage, status: "fehler", grund, freigabe_id: freigabe.id, weg });
      return antwort({ ok: false, fehler: grund, freigabe_id: freigabe.id, url }, 502);
    }

    await buchen(db, { ...grundlage, status: "gesendet", freigabe_id: freigabe.id, weg });
    return antwort({
      ok: true, gesendet: true, url, freigabe_id: freigabe.id,
      absender: postfach.email_adresse, empfaenger: email,
      provisionsmodell: modell, weg, dokumente: dokumente.length,
    });
  } catch (e) {
    console.error("expose-sofortversand:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
