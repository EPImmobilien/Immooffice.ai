// ============================================================================
// expose-erinnerung v3 (Deploy-Version 11; Cron, stuendlich)
//   Exposé-Freigabelinks, die nach 48 h noch nicht bestätigt/heruntergeladen wurden,
//   bekommen genau EINE freundliche Erinnerungsmail (Resend, vom zuständigen Makler,
//   Reply-To Makler). Vermerk am Objekt/Kontakt. Body: { stunden?: 48, limit?: 20, trocken?: bool }
//   v2: Link zeigt direkt auf die kleine Bestätigungsseite (freigabe.html?expose=TOKEN).
//   v3: Kein Erinnern, wenn das Exposé zu diesem Objekt schon geladen/bestätigt wurde – auch über
//       einen anderen Link derselben Adresse (expose_abgerufen, beide Quellen).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Pflichtangabe. Fehlt sie, geht NICHTS hinaus: ein Rueckfall auf
// eine Adresse, die niemandem gehoert, sieht aus wie Betrieb, kommt
// aber nirgends an. Begruendung in docs/OFFEN.md.
function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md). Ohne diese " +
    "Angabe ginge eine Nachricht mit einer Adresse hinaus, die " +
    "niemandem gehoert \u2014 deshalb geht gar keine.");
}


// --- Firmenname des Mandanten (Phase 2.4) ---------------------------------
// Die Neutralisierung hat den Namen der Referenz ueberall durch den des
// Demo-Mandanten ersetzt. Fuer das Neutralitaets-Gate war das richtig; fuer
// ein mandantenfaehiges Produkt ist ein verdrahteter Firmenname bei jedem
// Mandanten ausser einem falsch — und er stand in Grussformeln, Briefkoepfen
// und im OpenImmo-Feld <firma>, das jedes Portal anzeigt.
//
// Ohne Eintrag liefert diese Funktion einen LEEREN Text, keinen Beispielnamen.
// Die aufrufende Stelle laesst die Zeile dann weg. Eine fehlende Grussformel
// faellt auf; eine falsche nicht.
async function immoFirmenName(db: any, mandant: unknown): Promise<string> {
  if (typeof mandant !== "string" || !mandant) return "";
  const { data } = await db.from("firma_stammdaten")
    .select("firma_name, marken_name")
    .eq("mandant_id", mandant).eq("aktiv", true)
    .order("sortierung", { ascending: true }).limit(1).maybeSingle();
  return String(data?.marken_name || data?.firma_name || "").trim();
}

// --- Gehoert diese Adresse zum Mandanten selbst? (Phase 2.4) ------------
// Hier stand die Mail-Domain der Referenz im Quelltext. Die
// Neutralisierung hat daraus eine Domain gemacht, die es nicht gibt
// (die Platzhalter-Domain mit angehaengtem ".de") - die Pruefung konnte
// seither NIE zutreffen, und jede dieser Funktionen hat immer als Firma
// gesendet statt als zustaendiger Makler. Ein stiller Verhaltenswechsel,
// den kein Gate sieht: die Zeile ist syntaktisch in Ordnung, sie ist nur
// immer falsch.
//
// Verglichen wird jetzt die Domain, nicht die Zeichenkette. Welche die
// eigene ist, sagt der Mandant selbst - ueber die Absenderadresse oder
// die Mailadresse seiner Stammdaten. Ohne eine von beiden ist die
// Antwort false, und es wird wie bisher als Firma gesendet.
function immoEigeneAdresse(adresse: unknown, eigene: unknown): boolean {
  const domain = (x: unknown) =>
    String(x || "").trim().toLowerCase().split("@")[1] || "";
  const a = domain(adresse), e = domain(eigene);
  return !!a && !!e && a === e;
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const LINK_BASIS = (Deno.env.get("EXPOSE_FREIGABE_BASIS") || immoFehlt("EXPOSE_FREIGABE_BASIS")).replace(/\/\?expose=$/, "/freigabe.html?expose=");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const stunden = Number(body.stunden) || 48;
    const grenze = new Date(Date.now() - stunden * 3600000).toISOString();
    const { data: faellig } = await db.from("expose_freigaben").select("*")
      .is("bestaetigt_am", null).is("erinnerung_am", null).lte("created_at", grenze).gt("gueltig_bis", new Date().toISOString())
      .order("created_at", { ascending: true }).limit(Number(body.limit) || 20);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const erg: any[] = [];
    for (const f of faellig || []) {
      // v3: Download ohne Bestätigung oder ein bestätigter/geladener Zwillingslink zum selben Objekt
      //     (gleiche E-Mail oder gleicher Kontakt, ImmoOffice oder onOffice) = keine Erinnerung.
      if ((Number(f.downloads) || 0) > 0 || f.letzter_download_am) { erg.push({ id: f.id, an: f.email, uebersprungen: "selbst geladen" }); continue; }
      const { data: abgerufen } = await db.rpc("expose_abgerufen", { p_email: f.email, p_kontakt_id: f.kontakt_id, p_immobilie_id: f.immobilie_id });
      if (abgerufen) { erg.push({ id: f.id, an: f.email, uebersprungen: "über anderen Link abgerufen" }); continue; }
      try {
        const { data: im } = await db.from("immobilien").select("immo_nr, objekttitel, bezeichnung, plz, ort, zustaendig_id, mandant_id").eq("id", f.immobilie_id).maybeSingle();
        // Wie in expose-freigabe: der Slug "standard" ist seit fork_17 nur
        // noch je Mandant eindeutig. Ohne Grenze stuende ein fremder
        // Firmenname unter der Erinnerung.
        const { data: firma } = await db.from("firma_stammdaten").select("firma_name, email, strasse, plz, ort").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("slug", f.firma_slug || "standard").maybeSingle();
        const maklerId = im?.zustaendig_id || f.erstellt_von;
        const { data: makler } = maklerId ? await db.from("profiles").select("name, email, telefon").eq("id", maklerId).maybeSingle() : { data: null };
        const titel = im?.objekttitel || im?.bezeichnung || "die angefragte Immobilie";
        const ort = [im?.plz, im?.ort].filter(Boolean).join(" ");
        const anrede = f.name ? `Guten Tag ${f.name}` : "Guten Tag";
        const text = `${anrede},\n\nvor Kurzem haben Sie sich für „${titel}“${ort ? ` in ${ort}` : ""} interessiert. Ihr persönlicher Exposé-Link wurde bisher noch nicht genutzt – daher möchte ich ihn Ihnen noch einmal zusenden:\n\n${LINK_BASIS}${f.token}\n\nMit einem Klick bestätigen Sie die Pflichtangaben und können das Exposé mit allen Details, Grundrissen und Bildern sofort herunterladen. ${f.provisionsmodell === "kaeufer" ? "Eine Provision fällt ausschließlich dann an, wenn es tatsächlich zu einem notariellen Kaufvertrag kommt – Exposé, Besichtigung und Beratung sind für Sie kostenfrei." : "Für Sie entstehen dabei keine Kosten."}\n\nSollte die Immobilie für Sie nicht mehr infrage kommen, freue ich mich über eine kurze Rückmeldung – gern suche ich dann nach einer passenden Alternative für Sie.\n\nMit freundlichen Grüßen\n${makler?.name || firma?.firma_name || "Ihr Maklerteam"}${makler?.telefon ? "\nTelefon " + makler.telefon : ""}\n${firma?.firma_name || ""}${firma ? `\n${firma.strasse}, ${firma.plz} ${firma.ort}` : ""}`;
        if (body.trocken) { erg.push({ id: f.id, an: f.email, trocken: true }); continue; }
        if (!resendKey) throw new Error("RESEND_API_KEY fehlt");
        const absender = makler?.email && immoEigeneAdresse(makler.email, firma?.email) ? `${makler.name} <${makler.email}>` : `${firma?.firma_name || "Ihr Makler"} <${firma?.email || immoFehlt("eine Absenderadresse (Postfach, Firmenstammdaten oder SMTP_FROM_EMAIL)")}>`;
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: absender, to: [f.email], reply_to: makler?.email || firma?.email, subject: `Ihr Exposé zu „${titel}“ wartet auf Sie`, text }) });
        if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
        const jetzt = new Date().toISOString();
        await db.from("expose_freigaben").update({ erinnerung_am: jetzt, erinnerung_fehler: null }).eq("id", f.id);
        await db.from("vermerke").insert({ immobilie_id: f.immobilie_id, kontakt_id: f.kontakt_id, typ: "expose_erinnerung", titel: "Erinnerung zum Exposé-Link gesendet",
          text: `${f.name || f.email} hat den Exposé-Link nach ${stunden} h nicht genutzt – Erinnerungsmail automatisch gesendet.`, ref_tabelle: "expose_freigaben", ref_id: f.id });
        erg.push({ id: f.id, an: f.email, gesendet: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.from("expose_freigaben").update({ erinnerung_fehler: msg.slice(0, 500) }).eq("id", f.id);
        erg.push({ id: f.id, an: f.email, fehler: msg });
      }
    }
    return antwort({ ok: true, faellig: (faellig || []).length, gesendet: erg.filter((x) => x.gesendet).length, ergebnisse: erg });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
