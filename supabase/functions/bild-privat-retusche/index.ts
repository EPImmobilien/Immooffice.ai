// ============================================================================
// bild-privat-retusche v1 — Objektfotos auf private Details pruefen (Stufe 112)
// ----------------------------------------------------------------------------
// Eigene Funktion des Forks. Die Oberflaeche der neuen Vorlage ruft sie auf,
// der Funktionsexport der Vorlage enthielt sie nicht; siehe
// supabase/eigene/README.md.
//
// Wozu: auf Objektfotos stehen Dinge, die niemand im Expose sehen soll —
// Familienfotos auf der Kommode, Personen im Bild, ein Namensschild, ein
// Kennzeichen, ein offen liegender Brief. Das faellt beim Hochladen nicht
// auf und steht Minuten spaeter auf jedem Portal.
//
// Body:
//   { aktion: "pruefen", immobilie_id, nur_neue?, datei_ids? }
//       -> { ok: true, eingereiht: n }
//   { aktion: "uebernehmen",   datei_id } -> { ok: true, onoffice?: true }
//   { aktion: "verwerfen",     datei_id } -> { ok: true }
//   { aktion: "zuruecksetzen", datei_id } -> { ok: true }
//
// ZWEI SCHRITTE, ZWEI MODELLE:
//   1. Sehen   — Anthropic liest das Foto und sagt, WAS privat ist. Nur
//                lesen, nichts aendern.
//   2. Retuschieren — Replicate (flux-kontext-pro, dasselbe Modell wie
//                ki-bildbearbeitung) macht daraus einen Vorschlag.
//
// DAS ORIGINAL BLEIBT (CLAUDE.md, KI-Regeln: "Originale bleiben
// unveraendert, jede Bearbeitung erzeugt eine Version"). Der Vorschlag liegt
// als EIGENE Datei NEBEN dem Original, in privat_vorschlag_pfad. Uebernommen
// wird er erst auf Klick, und auch dann wird nichts ueberschrieben: es
// wechselt nur, worauf storage_path zeigt. Der alte Pfad steht in
// privat_befund.original_pfad, und "Original wiederherstellen" dreht genau
// das zurueck. ki_bearbeitet = true setzt die sichtbare Kennzeichnung, die
// Expose und Portal mitnehmen.
//
// KEIN AUTOMATISCHES VERSCHOENERN: die Pruefung sucht nur private Details.
// Was die KI sonst noch "verbessern" koennte, ist nicht ihre Aufgabe — die
// Systemvorgabe verbietet jede andere Aenderung ausdruecklich, und der
// Dialog stellt Original und Vorschlag nebeneinander, damit ein Mensch
// entscheidet.
//
// MANDANT: service_role, fuer den RLS nicht gilt. Der Mandant kommt aus dem
// Konto des Aufrufers; jede Kennung aus dem Anfragekoerper wird dagegen
// gehalten, und jeder Dateipfad traegt ihn als erstes Segment.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
const SEH_MODELL = Deno.env.get("PRIVAT_SEH_MODELL") || "claude-sonnet-4-6";
const RETUSCHE_MODELL = { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 };

const EIMER = "immobilie-dateien";
// Anthropic nimmt Bilder bis 5 MB base64. Darueber wird die Web-Fassung
// genommen; gibt es die nicht, wird sie erst erzeugt (bild-web-variante).
const BILD_MAX = 4_500_000;
// Je Aufruf. Mehr passt nicht in die Laufzeit einer Edge Function, und die
// Oberflaeche ruft nach dem naechsten Hochladen ohnehin wieder auf.
const STAPEL_MAX = 12;
const REPLICATE_MAX_MS = 120_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Wessen Mandant ist der Aufrufer? Wie im uebrigen Fork (fork_09).
async function immoMandantDesAufrufers(
  req: Request,
): Promise<{ mandant: string; nutzer: string; rolle: string; name: string } | null> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return null;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } },
  );
  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return null;
  const { data: p } = await nutzer
    .from("profiles").select("mandant_id, role, name").eq("id", u.user.id).maybeSingle();
  if (!p?.mandant_id) return null;
  return {
    mandant: String(p.mandant_id),
    nutzer: u.user.id,
    rolle: String(p.role || ""),
    name: String(p.name || ""),
  };
}

// --- Storage: Pfade tragen den Mandanten als erstes Segment -----------------
// Gleiche Bauart wie die Huelle der Oberflaeche und der uebrigen Funktionen,
// nur ausgeschrieben: in der Datenbank stehen MANDANTENRELATIVE Pfade
// (immobilie_datei.storage_path), im Eimer liegen sie unter {mandant}/….
// Wer das verwechselt, laedt in den Ordner eines fremden Maklers oder liest
// dort — die restriktive Richtlinie auf storage.objects prueft genau dieses
// erste Segment.
const immoVorne = (mandant: string, pfad: string) =>
  pfad === mandant || pfad.startsWith(mandant + "/") ? pfad : mandant + "/" + pfad;

const webPfad = (p: string) => String(p || "").replace(/\.[^./]+$/, "") + "_web.jpg";

// ------------------------------------------------------------------ Systemvorgabe
const SEH_SYSTEM = `Du pruefst Fotos von Immobilien, die ein Makler veroeffentlichen will, auf PRIVATE DETAILS.

WAS PRIVAT IST — nur danach suchst du:
- Personen: Gesichter, erkennbare Menschen, auch im Spiegel oder im Fenster.
- Familienfotos, Portraits, Kinderzeichnungen mit Namen, Fotowaende, gerahmte Bilder mit erkennbaren Personen.
- Namen und Adressen: Namensschilder, Briefe, Rechnungen, Etiketten, Urkunden, Zeugnisse, Kalender mit Eintraegen, Bildschirme mit Inhalt.
- Kennzeichen von Fahrzeugen.
- Erkennbar persoenliche Gegenstaende, die auf eine bestimmte Person zeigen: Medikamente mit Aufschrift, religioese oder politische Kennzeichen, Mitgliedsausweise, Pokale mit Namen.

WAS NICHT PRIVAT IST — darueber sagst du nichts:
- Moebel, Unordnung, Dekoration, Pflanzen, Geschmacksfragen, Farben, abstrakte Bilder, Landschaftsbilder.
- Die Hausnummer und der Strassenname des Objekts selbst — die Adresse ist Teil des Angebots.
- Marken auf Geraeten, Buchruecken ohne persoenlichen Bezug, Spielzeug ohne Namen.
- Nachbarhaeuser, Autos ohne lesbares Kennzeichen, Passanten, die nicht erkennbar sind.

Du beurteilst NICHT die Bildqualitaet und machst KEINE Verbesserungsvorschlaege. Du suchst nur private Details.

MELDE LIEBER EINEN FUND ZU VIEL als einen zu wenig — der Mensch entscheidet danach am Bildvergleich. Aber erfinde nichts: was du nicht siehst, steht nicht im Befund.

ANWEISUNG FUER DIE RETUSCHE
Gibt es Funde, schreibe in "anweisung" EINEN englischen Satz fuer ein Bildbearbeitungsmodell. Er nennt genau die zu entfernenden Dinge und sagt, was an ihre Stelle kommt (leere Wand, Tischplatte, Fussboden). Er darf nichts anderes aendern — keine Moebel, keine Beleuchtung, keine Perspektive, kein Aufraeumen, keine neuen Gegenstaende.
Beispiel: "Remove the framed family portraits from the shelf and the letter on the table; replace them with the plain shelf surface and the empty table top. Change nothing else in the image."

ANTWORT
Ausschliesslich dieses JSON, kein Markdown, kein Vorwort:
{"privat": true, "sicherheit": "hoch",
 "funde": [{"art": "familienfoto", "beschreibung": "Zwei gerahmte Familienfotos auf der Kommode links", "ort": "links auf der Kommode"}],
 "anweisung": "Remove ... Change nothing else in the image."}
"art" ist eines von: person, familienfoto, name, adresse, dokument, kennzeichen, bildschirm, persoenliches. "beschreibung" ist ein kurzer deutscher Satz, den ein Makler liest.
Findest du nichts, antworte {"privat": false, "sicherheit": "hoch", "funde": [], "anweisung": ""}.`;

const ARTEN = ["person", "familienfoto", "name", "adresse", "dokument", "kennzeichen", "bildschirm", "persoenliches"];
const kurz = (x: unknown, max: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function befundSaeubern(roh: any) {
  const funde = (Array.isArray(roh?.funde) ? roh.funde : []).slice(0, 12)
    .map((f: any) => ({
      art: ARTEN.includes(String(f?.art)) ? String(f.art) : "persoenliches",
      beschreibung: kurz(f?.beschreibung, 300),
      ort: kurz(f?.ort, 120),
    }))
    .filter((f: any) => f.beschreibung || f.ort);
  return {
    funde,
    sicherheit: ["hoch", "mittel", "niedrig"].includes(String(roh?.sicherheit))
      ? String(roh.sicherheit) : "mittel",
    anweisung: kurz(roh?.anweisung, 800),
    modell: SEH_MODELL,
  };
}

function jsonAusText(t: string) {
  let s = String(t).trim();
  const zaun = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (zaun) s = zaun[1].trim();
  if (!s.startsWith("{")) {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  }
  return JSON.parse(s);
}

// ------------------------------------------------------------------ Bild holen
// Bevorzugt die Web-Fassung: sie ist klein genug fuer die KI, und sie ist
// das Bild, das auch im Expose landet. Fehlt sie, wird sie von
// bild-web-variante erzeugt — nicht hier nachgebaut, es gibt sie schon.
async function bildHolen(admin: any, mandant: string, datei: any): Promise<{ data: string; mime: string }> {
  // Die Web-Fassung steht zweimal in der Liste: fehlt sie beim ersten Mal,
  // wird sie angefordert und beim zweiten Durchgang gefunden. Erst danach
  // kommt das Original, das fuer die KI oft zu gross ist.
  const web = webPfad(datei.storage_path);
  const versuche = [web, web, datei.storage_path];
  for (const [i, pfad] of versuche.entries()) {
    if (!pfad) continue;
    const { data } = await admin.storage.from(EIMER).download(immoVorne(mandant, pfad));
    if (!data) {
      if (i === 0) await webFassungAnfordern(admin, datei.id);
      continue;
    }
    const roh = new Uint8Array(await data.arrayBuffer());
    // base64 ist ein Drittel groesser als das Rohbild.
    if (roh.length * 4 / 3 > BILD_MAX) {
      if (i < versuche.length - 1) continue;
      throw new Error("Das Bild ist zu gross fuer die Pruefung, und eine Web-Fassung liess sich nicht erzeugen.");
    }
    let s = "";
    for (let k = 0; k < roh.length; k += 8192) s += String.fromCharCode(...roh.subarray(k, k + 8192));
    const mime = pfad.endsWith("_web.jpg") ? "image/jpeg"
      : String(datei.mime_type || "image/jpeg").toLowerCase();
    return { data: btoa(s), mime: ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg" };
  }
  throw new Error("Das Bild liegt nicht im Speicher.");
}

async function webFassungAnfordern(admin: any, dateiId: string) {
  try { await admin.functions.invoke("bild-web-variante", { body: { datei_id: dateiId, neu: true } }); }
  catch { /* die Pruefung faellt dann auf das Original zurueck */ }
}

// --------------------------------------------------------------------- Sehen
async function sehen(bild: { data: string; mime: string }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: SEH_MODELL, max_tokens: 1500, temperature: 0, system: SEH_SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: bild.mime, data: bild.data } },
          { type: "text", text: "Pruefe dieses Foto und gib das JSON zurueck." },
        ],
      }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  const d = await r.json();
  return befundSaeubern(jsonAusText(d?.content?.[0]?.text || ""));
}

// ---------------------------------------------------------------- Retuschieren
// Dieselbe Bauart wie in ki-bildbearbeitung: Vorhersage starten, notfalls
// pollen, Ergebnis-URL herunterladen.
async function replicateLauf(input: Record<string, unknown>): Promise<string> {
  const start = await fetch(
    `https://api.replicate.com/v1/models/${RETUSCHE_MODELL.owner}/${RETUSCHE_MODELL.name}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input }),
    },
  );
  if (!start.ok) throw new Error(`Replicate ${start.status}: ${(await start.text()).slice(0, 300)}`);
  let v = await start.json();
  const seit = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(String(v.status))) {
    if (Date.now() - seit > REPLICATE_MAX_MS) throw new Error("Die Retusche hat zu lange gedauert.");
    await new Promise((r) => setTimeout(r, 2000));
    const p = await fetch(v.urls.get, { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } });
    if (!p.ok) throw new Error(`Replicate-Abfrage ${p.status}`);
    v = await p.json();
  }
  if (v.status !== "succeeded") throw new Error(`Replicate: ${v.error || v.status}`);
  const url = Array.isArray(v.output) ? v.output[0] : v.output;
  if (typeof url !== "string" || !url.startsWith("http")) throw new Error("Replicate hat kein Bild geliefert.");
  return url;
}

// Der Vorschlag kommt in einen eigenen Ordner unter dem Mandanten. Nicht
// neben das Original: dort liegen die Dateien, die jeder Export einsammelt,
// und ein Vorschlag, den niemand bestaetigt hat, hat dort nichts zu suchen.
const vorschlagPfad = (dateiId: string) => `privat-vorschlag/${dateiId}-${Date.now()}.jpg`;

async function retuschieren(admin: any, mandant: string, datei: any, anweisung: string) {
  const quelle = immoVorne(mandant, webPfad(datei.storage_path));
  let signiert = (await admin.storage.from(EIMER).createSignedUrl(quelle, 600))?.data?.signedUrl;
  if (!signiert) {
    signiert = (await admin.storage.from(EIMER)
      .createSignedUrl(immoVorne(mandant, datei.storage_path), 600))?.data?.signedUrl;
  }
  if (!signiert) throw new Error("Das Bild konnte nicht an die Retusche uebergeben werden.");

  const url = await replicateLauf({
    prompt: anweisung,
    input_image: signiert,
    output_format: "jpg",
    safety_tolerance: 2,
  });

  const bild = await fetch(url);
  if (!bild.ok) throw new Error(`Ergebnisbild nicht ladbar: ${bild.status}`);
  const blob = await bild.blob();
  const pfad = vorschlagPfad(datei.id);
  const { error } = await admin.storage.from(EIMER)
    .upload(immoVorne(mandant, pfad), blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Vorschlag konnte nicht abgelegt werden: ${error.message}`);
  return pfad;
}

// ------------------------------------------------------- ein Foto durcharbeiten
async function einFoto(admin: any, wer: { mandant: string; nutzer: string; name: string }, datei: any) {
  const setze = (werte: Record<string, unknown>) =>
    admin.from("immobilie_datei").update(werte)
      .eq("id", datei.id).eq("mandant_id", wer.mandant);

  await setze({ privat_status: "laeuft" });
  // Der Befund steht ausserhalb des try: scheitert erst die Retusche, ist er
  // das Wertvolle am Lauf — die Fotos HABEN dann private Details, und das
  // darf nicht mit der Fehlermeldung verschwinden.
  let befund: any = null;
  try {
    const bild = await bildHolen(admin, wer.mandant, datei);
    befund = await sehen(bild);

    if (!befund.funde.length) {
      await setze({ privat_status: "ok", privat_befund: { ...befund, geprueft_am: new Date().toISOString() } });
      return "ok";
    }
    if (!befund.anweisung) {
      // Funde ohne Anweisung: der Befund ist das Wertvolle und bleibt
      // stehen. Ein Vorschlag laesst sich daraus nicht bauen.
      await setze({
        privat_status: "fehler",
        privat_befund: { ...befund, geprueft_am: new Date().toISOString(), fehler: "Die KI hat Funde gemeldet, aber keine Retusche-Anweisung geliefert." },
      });
      return "fehler";
    }
    if (!REPLICATE_API_TOKEN) {
      await setze({
        privat_status: "fehler",
        privat_befund: { ...befund, geprueft_am: new Date().toISOString(), fehler: "REPLICATE_API_TOKEN ist nicht gesetzt — ohne ihn gibt es keinen Retusche-Vorschlag. Der Befund steht trotzdem." },
      });
      return "fehler";
    }

    const pfad = await retuschieren(admin, wer.mandant, datei, befund.anweisung);
    await setze({
      privat_status: "vorschlag",
      privat_vorschlag_pfad: pfad,
      privat_befund: { ...befund, geprueft_am: new Date().toISOString() },
    });
    await admin.from("ki_bildbearbeitung_log").insert({
      mandant_id: wer.mandant,
      user_id: wer.nutzer,
      user_name: wer.name,
      funktion: "privat_retusche",
      parameter: { datei_id: datei.id, funde: befund.funde.map((f: any) => f.art) },
      storage_path: datei.storage_path,
      result_name: pfad,
      modell: `${RETUSCHE_MODELL.owner}/${RETUSCHE_MODELL.name}`,
      kosten_usd: RETUSCHE_MODELL.kosten_usd,
      status: "ok",
      final_prompt: befund.anweisung,
    });
    return "vorschlag";
  } catch (e) {
    const grund = e instanceof SyntaxError
      ? "Die Antwort der KI war kein gueltiges JSON."
      : e instanceof Error ? e.message : String(e);
    await setze({
      privat_status: "fehler",
      privat_befund: { ...(befund || { funde: [] }), fehler: grund.slice(0, 600) },
    });
    return "fehler";
  }
}

// -------------------------------------------------------------------- Bedienung
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({} as any));
    const aktion = String(body.aktion || "");

    const wer = await immoMandantDesAufrufers(req);
    if (!wer) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    if (!["chef", "mitarbeiter"].includes(wer.rolle)) {
      return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ---------------------------------------------------------------- pruefen
    if (aktion === "pruefen") {
      if (!ANTHROPIC_API_KEY) return antwort({ ok: false, fehler: "ANTHROPIC_API_KEY fehlt." }, 500);
      if (typeof body.immobilie_id !== "string" || !UUID.test(body.immobilie_id)) {
        return antwort({ ok: false, fehler: "Objekt fehlt." }, 400);
      }
      // Die immobilie_id kommt aus dem Anfragekoerper. Ohne diese Probe
      // haette ein Angemeldeter die Fotos eines fremden Maklers pruefen —
      // und damit an eine KI schicken — lassen koennen.
      const { data: im } = await admin.from("immobilien")
        .select("id").eq("id", body.immobilie_id).eq("mandant_id", wer.mandant).maybeSingle();
      if (!im) return antwort({ ok: false, fehler: "Kein Zugriff auf dieses Objekt." }, 403);

      let q = admin.from("immobilie_datei")
        .select("id, storage_path, mime_type, privat_status")
        .eq("immobilie_id", body.immobilie_id)
        .eq("mandant_id", wer.mandant)
        .eq("kategorie", "foto")
        .eq("speicher_typ", "supabase")
        .not("storage_path", "is", null)
        .like("mime_type", "image/%")
        .order("sortierung", { ascending: true })
        .limit(STAPEL_MAX);

      if (Array.isArray(body.datei_ids) && body.datei_ids.length) {
        const ids = body.datei_ids.filter((x: unknown) => typeof x === "string" && UUID.test(x)).slice(0, STAPEL_MAX);
        if (!ids.length) return antwort({ ok: false, fehler: "Keine gueltige Dateikennung." }, 400);
        q = q.in("id", ids);
      } else if (body.nur_neue === true) {
        q = q.is("privat_status", null);
      } else {
        q = q.or("privat_status.is.null,privat_status.eq.fehler");
      }

      const { data: fotos, error } = await q;
      if (error) throw new Error(error.message);
      if (!fotos?.length) return antwort({ ok: true, eingereiht: 0 });

      await admin.from("immobilie_datei").update({ privat_status: "offen" })
        .in("id", fotos.map((f: any) => f.id)).eq("mandant_id", wer.mandant);

      // Eines nach dem anderen: parallel wuerde drei Bilder gleichzeitig an
      // zwei Anbieter schicken und die Laufzeit der Funktion sprengen.
      const arbeit = (async () => {
        for (const f of fotos) await einFoto(admin, wer, f);
      })();
      try {
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(arbeit);
        else await arbeit;
      } catch { await arbeit; }

      return antwort({ ok: true, eingereiht: fotos.length });
    }

    // ------------------------------------------- uebernehmen/verwerfen/zurueck
    if (!["uebernehmen", "verwerfen", "zuruecksetzen"].includes(aktion)) {
      return antwort({ ok: false, fehler: "Unbekannte Aktion." }, 400);
    }
    if (typeof body.datei_id !== "string" || !UUID.test(body.datei_id)) {
      return antwort({ ok: false, fehler: "Datei fehlt." }, 400);
    }
    const { data: d } = await admin.from("immobilie_datei")
      .select("id, storage_path, privat_status, privat_befund, privat_vorschlag_pfad, ki_bearbeitet, onoffice_datei_id")
      .eq("id", body.datei_id).eq("mandant_id", wer.mandant).maybeSingle();
    if (!d) return antwort({ ok: false, fehler: "Kein Zugriff auf diese Datei." }, 403);

    const setze = (werte: Record<string, unknown>) =>
      admin.from("immobilie_datei").update(werte)
        .eq("id", d.id).eq("mandant_id", wer.mandant);
    const befund = (d.privat_befund && typeof d.privat_befund === "object") ? d.privat_befund as any : {};

    if (aktion === "uebernehmen") {
      if (d.privat_status !== "vorschlag" || !d.privat_vorschlag_pfad) {
        return antwort({ ok: false, fehler: "Zu dieser Datei liegt kein Vorschlag vor." }, 400);
      }
      // Nichts wird ueberschrieben: es wechselt nur, worauf storage_path
      // zeigt. Der alte Pfad wird festgehalten, sonst gibt es kein Zurueck.
      const { error } = await setze({
        storage_path: d.privat_vorschlag_pfad,
        ki_bearbeitet: true,
        privat_status: "uebernommen",
        privat_befund: {
          ...befund,
          original_pfad: befund.original_pfad || d.storage_path,
          ki_bearbeitet_vorher: befund.ki_bearbeitet_vorher ?? d.ki_bearbeitet === true,
          uebernommen_am: new Date().toISOString(),
        },
      });
      if (error) throw new Error(error.message);
      // Die Web-Fassung gehoert zum alten Pfad. Ohne eine neue zeigen
      // Expose, Portal und Objektseite weiter das Original.
      await webFassungAnfordern(admin, d.id);
      return antwort({ ok: true, ...(d.onoffice_datei_id ? { onoffice: true } : {}) });
    }

    if (aktion === "verwerfen") {
      // Der Nutzer hat entschieden, dass der Vorschlag nicht genommen wird.
      // Dann liegt er auch nicht weiter im Eimer: ein retuschiertes Bild,
      // das niemand will, ist nur noch Verwechslungsgefahr.
      if (d.privat_vorschlag_pfad) {
        try { await admin.storage.from(EIMER).remove([immoVorne(wer.mandant, d.privat_vorschlag_pfad)]); }
        catch { /* die Zeile zaehlt, nicht die Datei */ }
      }
      const { error } = await setze({
        privat_status: "verworfen",
        privat_vorschlag_pfad: null,
        privat_befund: { ...befund, verworfen_am: new Date().toISOString() },
      });
      if (error) throw new Error(error.message);
      return antwort({ ok: true });
    }

    // zuruecksetzen
    if (d.privat_status !== "uebernommen" || !befund.original_pfad) {
      return antwort({ ok: false, fehler: "Zu dieser Datei ist kein Original vermerkt." }, 400);
    }
    const { error } = await setze({
      storage_path: befund.original_pfad,
      ki_bearbeitet: befund.ki_bearbeitet_vorher === true,
      // Der Vorschlag bleibt liegen: die Entscheidung ist zurueckgenommen,
      // nicht abgelehnt. Also wieder der Zustand davor.
      privat_status: "vorschlag",
      privat_befund: { ...befund, zurueckgesetzt_am: new Date().toISOString() },
    });
    if (error) throw new Error(error.message);
    await webFassungAnfordern(admin, d.id);
    return antwort({ ok: true });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
