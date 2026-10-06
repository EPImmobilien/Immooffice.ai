// ============================================================================
// grundriss-ki-lesen v1 — einen Bestandsgrundriss auslesen (Stufe 118/119)
// ----------------------------------------------------------------------------
// Eigene Funktion des Forks. Die Oberflaeche der neuen Vorlage ruft sie auf,
// der Funktionsexport der Vorlage enthielt sie nicht; siehe
// supabase/eigene/README.md.
//
// Body (nur eine Aktion, die die Oberflaeche auch schickt):
//   { aktion: "starten", bild_base64, mime, hinweis?, immobilie_id?,
//     vorher?, korrektur? }
//   -> { ok: true, id }            Auftragskennung, sofort
//   -> { ok: false, fehler }
//
// Der Auftrag laeuft danach im Hintergrund weiter (EdgeRuntime.waitUntil) und
// schreibt sein Ergebnis in public.grundriss_ki_auftraege. Die Oberflaeche
// fragt die Zeile alle drei Sekunden ab:
//
//   select status, ergebnis, fehler, dauer_ms, fortschritt
//
// und zeigt waehrend des Laufs fortschritt.zeichen an. Wer wartet, soll
// sehen, dass etwas passiert — ein Grundriss dauert ein bis drei Minuten.
//
// MANDANT: die Funktion benutzt den service_role, fuer den RLS nicht gilt.
// Der Mandant kommt deshalb aus dem Konto des Aufrufers (nie aus dem
// Anfragekoerper), und eine mitgeschickte immobilie_id wird gegen ihn
// geprueft, bevor sie am Auftrag landet.
//
// KEINE ERFUNDENEN MASSE (CLAUDE.md, KI-Regeln): die Systemvorgabe verbietet
// geschaetzte Zahlen ausdruecklich. Findet die KI keine Masskette und keinen
// Massstab, liefert sie KEINE Raeume, sondern einen Hinweis — die Oberflaeche
// zeigt dann "Keine Raeume erkannt". Jedes Ergebnis traegt ausserdem eine
// Selbsteinschaetzung (sicherheit) und seine Hinweise, beides sichtbar im
// Dialog, und uebernommen wird erst auf Klick.
//
// Das Ergebnis ist das Rohformat der KI (Bildkoordinaten, y nach unten,
// Meter). Daraus macht die Oberflaeche mit epGrundrissKiZuScan das
// Raumscan-JSON fuer den Editor. Die Feldnamen unten sind deshalb nicht frei
// gewaehlt: sie sind genau die, die epGrundrissKiZuScan liest.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts, vom Erzeuger beigelegt.
// Sie rechnet nichts ab; sie weist nur ab, wessen Abo abgelaufen oder
// gesperrt ist.
import { aboSchranke } from "./abo.ts";

declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Das Modell ist eine Umgebungsvariable, kein verdrahteter Wert: ein
// Bildmodell wechselt haeufiger als diese Funktion.
const MODELL = Deno.env.get("GRUNDRISS_KI_MODELL") || "claude-sonnet-4-6";
const MAX_TOKENS = 16000;
// Anthropic nimmt Bilder bis 5 MB base64. Mehr schickt die Oberflaeche nicht
// (2000 px, JPEG 0.9), die Grenze fasst nur den Fall ab, dass doch jemand
// etwas Groesseres an die Funktion gibt.
const BILD_MAX = 4_500_000;
// Nach dieser Zeit bricht der Lauf ab. Die Oberflaeche gibt nach sieben
// Minuten auf; ein Auftrag, der laenger "laeuft", wuerde dort als Zeitfehler
// enden und hier fuer immer stehen bleiben.
const LAUF_MAX_MS = 290_000;
const FORTSCHRITT_TAKT_MS = 1500;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Wessen Mandant ist der Aufrufer? Dieselbe Hilfe wie im uebrigen Fork
// (fork_09), nur dass hier auch die Rolle und die Benutzerkennung gebraucht
// werden: die eine fuer die Berechtigung, die andere fuer ersteller_id.
async function immoMandantDesAufrufers(
  req: Request,
): Promise<{ mandant: string; nutzer: string; rolle: string } | null> {
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
    .from("profiles").select("mandant_id, role").eq("id", u.user.id).maybeSingle();
  if (!p?.mandant_id) return null;
  return { mandant: String(p.mandant_id), nutzer: u.user.id, rolle: String(p.role || "") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BILD_TYPEN = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// --------------------------------------------------------------- Systemvorgabe
// Die Feldnamen sind die Schnittstelle zu epGrundrissKiZuScan in der
// Oberflaeche. Wer hier etwas umbenennt, muss dort nachsehen.
const SYSTEM = `Du liest Bestandsgrundrisse von Wohngebaeuden und gibst ihre Geometrie als JSON zurueck.

KOORDINATEN
- Einheit ist der METER, nicht das Pixel und nicht der Zentimeter.
- x waechst nach rechts, y waechst nach UNTEN (Bildkoordinaten).
- Der Ursprung ist frei waehlbar; nimm die obere linke Ecke des Gebaeudes.
- Raumpolygone sind LICHTE Innenmasse (Wandinnenkante zu Wandinnenkante), im Uhrzeigersinn, ohne Wiederholung des ersten Punktes.
- Rechtwinklige Raeume bleiben rechtwinklig: gleiche Werte exakt gleich, keine krummen Nachkommastellen aus dem Abmessen eines schiefen Fotos.
- Aneinandergrenzende Raeume teilen die Wand: der Abstand zweier Polygone entspricht der Wanddicke, es entstehen keine Luecken und keine Ueberlappungen.

WOHER DIE MASSE KOMMEN — die wichtigste Regel
- Ausschliesslich aus dem Plan: Massketten, Raummasse im Raum ("3,51 x 4,20"), Flaechenangaben, ein Massstab oder ein Massstabsbalken.
- Du schaetzt NICHTS. Du rechnest NICHT von Pixeln auf Meter, solange du keine Strecke mit bekanntem Mass hast.
- Fehlt jeder Massbezug, gib "raeume": [] zurueck, setze "sicherheit": "niedrig" und schreibe in "hinweise", dass der Plan keine Massketten und keinen Massstab zeigt. Ein leeres Ergebnis ist richtig; erfundene Zahlen sind falsch.
- Ist nur EIN Raum bemasst, leite die uebrigen daraus ab, nenne das in "hinweise" und setze "sicherheit" hoechstens auf "mittel".
- Widersprechen sich Masskette und Flaechenangabe, folge der Masskette und schreibe den Widerspruch in "hinweise".
- "flaeche_plan_m2" ist die im Plan GEDRUCKTE Flaeche des Raums, falls vorhanden — nicht deine eigene Rechnung. Ohne Angabe: 0.

EINHEITEN UND GESCHOSSE
- Zeigt der Plan mehrere Wohnungen oder Haeuser, benenne sie ("Haus I", "WE 3", "links") und trage die Bezeichnung an jedem Raum, jeder Tuer, jedem Fenster und jeder Treppe in "einheit" ein. Sonst "einheit": "".
- "geschoss" ist die Bezeichnung im Plan ("Erdgeschoss", "Dachgeschoss"), "geschoss_nr" die Nummer: Keller -1, Erdgeschoss 0, 1. OG 1 und so weiter. Steht nichts im Plan, lass "geschoss_nr" weg.
- Zeigt ein Bild mehrere Geschosse, nimm das, auf das der Hinweis des Nutzers zeigt, sonst das unterste vollstaendig bemasste, und schreib in "hinweise", welches du genommen hast.

TUEREN, FENSTER, TREPPEN
- Jede Oeffnung ist eine Strecke in der Wand, von Laibung zu Laibung: x1,y1 -> x2,y2, Breite zwischen 0,3 und 6 m.
- Tuerarten: "einzel", "doppel" (zweifluegelig), "schiebe", "durchgang" (ohne Blatt). Unklar: "einzel".
- "bruestung_m" ist die Bruestungshoehe des Fensters in Metern, falls erkennbar (Standard im Wohnraum etwa 0,9, bodentief 0). Unbekannt: weglassen.
- Treppen: "x","y" ist die MITTE des Treppenlaufs, "breite_m" die Laufbreite, "tiefe_m" die Lauflaenge.

DACHSCHRAEGEN (nur Dachgeschosse)
- Je Raum mit Schraege ein Eintrag in "schraegen": "seite" ist die Himmelsrichtung IM BILD ("oben","unten","links","rechts"), an der die Schraege anliegt.
- Zeigt der Plan die 1-m- oder 2-m-Linie als Strichlinie, gib deren Abstand zur Wand als "abstand_1m_m" und "abstand_2m_m" an — das ist der genaue Weg.
- Sonst "kniestock_m" (Hoehe der Drempelwand) und "neigung_grad" (Dachneigung), falls der Plan oder ein Schnitt sie nennt. Nichts davon bekannt: keinen Eintrag, dafuer ein Hinweis.
- Ist ein ganzer Raum niedriger als 2 m (Spitzboden, Abstellraum unter der Treppe), setze "lichte_hoehe_m".
- Gilt eine Dachneigung fuer das ganze Geschoss, trage sie zusaetzlich in "dach" ein.

RAUMART
- "wohn" fuer Wohn-, Schlaf-, Kinder-, Arbeitszimmer, Kueche, Bad, Diele, Flur, Abstellraum innerhalb der Wohnung.
- "nutz" fuer Keller, Heizung, Waschkeller, Garage, Lager, Dachboden ohne Ausbau.
- "balkon" fuer Balkon, Loggia, Terrasse, Dachterrasse.
- Unklar: "wohn", und ein Hinweis dazu.

AUSSENWAND
- "aussenwand_dicke_m": Dicke der tragenden Aussenwand, wenn der Plan sie bemasst oder sie sich aus Aussen- minus Innenmass ergibt. Sonst 0.3 und ein Hinweis, dass der Wert angenommen ist.

SICHERHEIT UND HINWEISE
- "sicherheit": "hoch" nur bei durchgehend bemasstem, gut lesbarem Plan. "mittel" bei Luecken, die du begruendet geschlossen hast. "niedrig", wenn du raten muesstest.
- "hinweise": kurze deutsche Saetze zu allem, was der Mensch pruefen muss — fehlende Masse, unleserliche Stellen, Widerspruechliches, Annahmen. Lieber ein Hinweis zu viel.

ANTWORT
Ausschliesslich das JSON-Objekt, kein Markdown, kein Vorwort, keine Erklaerung danach:
{"geschoss":"Erdgeschoss","geschoss_nr":0,"einheiten":[],"sicherheit":"mittel","aussenwand_dicke_m":0.365,
 "dach":{"kniestock_m":0,"neigung_grad":0},
 "hinweise":["..."],
 "raeume":[{"name":"Wohnzimmer","einheit":"","art":"wohn","flaeche_plan_m2":24.8,"lichte_hoehe_m":0,
            "polygon":[{"x":0,"y":0},{"x":5.2,"y":0},{"x":5.2,"y":4.77},{"x":0,"y":4.77}],
            "schraegen":[]}],
 "tueren":[{"x1":2.1,"y1":0,"x2":3.0,"y2":0,"art":"einzel","einheit":""}],
 "fenster":[{"x1":1.0,"y1":4.77,"x2":2.6,"y2":4.77,"bruestung_m":0.9,"einheit":""}],
 "treppen":[{"x":6.4,"y":2.1,"breite_m":1.0,"tiefe_m":3.2,"einheit":""}]}`;

// ------------------------------------------------------------------ Saeubern
// Was die KI schickt, ist Text. Hier wird daraus etwas, das die Oberflaeche
// ohne Pruefung weiterverarbeiten kann: jede Zahl in ihren Grenzen, jede
// Liste begrenzt, jedes Aufzaehlungsfeld auf erlaubte Werte gezogen.
const zahl = (x: unknown, min: number, max: number): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 1000) / 1000;
};
const text = (x: unknown, max: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const ausWahl = (x: unknown, erlaubt: string[], vorgabe: string) =>
  erlaubt.includes(String(x)) ? String(x) : vorgabe;

// Grenzen des Modells: ein Wohnhausgrundriss ist keine 500 m lang, und ein
// Raum hat keine 200 Ecken. Was darueber hinausgeht, ist ein Lesefehler.
const KOORD = 500;

function polygon(x: unknown) {
  if (!Array.isArray(x)) return null;
  const pts: { x: number; y: number }[] = [];
  for (const q of x.slice(0, 60)) {
    if (!q || typeof q !== "object") continue;
    const px = zahl((q as any).x, -KOORD, KOORD);
    const py = zahl((q as any).y, -KOORD, KOORD);
    if (px === null || py === null) continue;
    pts.push({ x: px, y: py });
  }
  return pts.length >= 3 ? pts : null;
}

function strecke(o: any) {
  const x1 = zahl(o?.x1, -KOORD, KOORD), y1 = zahl(o?.y1, -KOORD, KOORD);
  const x2 = zahl(o?.x2, -KOORD, KOORD), y2 = zahl(o?.y2, -KOORD, KOORD);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  return { x1, y1, x2, y2 };
}

function schraegen(x: unknown) {
  if (!Array.isArray(x)) return [];
  const raus: Record<string, unknown>[] = [];
  for (const s of x.slice(0, 4)) {
    if (!s || typeof s !== "object") continue;
    const seite = String((s as any).seite || "");
    if (!["oben", "unten", "links", "rechts"].includes(seite)) continue;
    raus.push({
      seite,
      kniestock_m: zahl((s as any).kniestock_m, 0, 3) ?? 0,
      neigung_grad: zahl((s as any).neigung_grad, 0, 89) ?? 0,
      abstand_1m_m: zahl((s as any).abstand_1m_m, 0, 20) ?? 0,
      abstand_2m_m: zahl((s as any).abstand_2m_m, 0, 20) ?? 0,
    });
  }
  return raus;
}

function saeubern(roh: any) {
  const raeume: Record<string, unknown>[] = [];
  for (const r of Array.isArray(roh?.raeume) ? roh.raeume.slice(0, 80) : []) {
    const p = polygon(r?.polygon);
    if (!p) continue;
    raeume.push({
      name: text(r?.name, 80) || "Raum",
      einheit: text(r?.einheit, 60),
      art: ausWahl(r?.art, ["wohn", "nutz", "balkon"], "wohn"),
      flaeche_plan_m2: zahl(r?.flaeche_plan_m2, 0, 10000) ?? 0,
      lichte_hoehe_m: zahl(r?.lichte_hoehe_m, 0, 6) ?? 0,
      polygon: p,
      schraegen: schraegen(r?.schraegen),
    });
  }

  const tueren: Record<string, unknown>[] = [];
  for (const t of Array.isArray(roh?.tueren) ? roh.tueren.slice(0, 200) : []) {
    const s = strecke(t);
    if (!s) continue;
    tueren.push({ ...s, art: ausWahl(t?.art, ["einzel", "doppel", "schiebe", "durchgang"], "einzel"), einheit: text(t?.einheit, 60) });
  }

  const fenster: Record<string, unknown>[] = [];
  for (const f of Array.isArray(roh?.fenster) ? roh.fenster.slice(0, 200) : []) {
    const s = strecke(f);
    if (!s) continue;
    const br = zahl(f?.bruestung_m, 0, 3);
    fenster.push({ ...s, ...(br === null ? {} : { bruestung_m: br }), einheit: text(f?.einheit, 60) });
  }

  const treppen: Record<string, unknown>[] = [];
  for (const t of Array.isArray(roh?.treppen) ? roh.treppen.slice(0, 20) : []) {
    const x = zahl(t?.x, -KOORD, KOORD), y = zahl(t?.y, -KOORD, KOORD);
    const b = zahl(t?.breite_m, 0.4, 5), d = zahl(t?.tiefe_m, 0.5, 15);
    if (x === null || y === null || b === null || d === null) continue;
    treppen.push({ x, y, breite_m: b, tiefe_m: d, einheit: text(t?.einheit, 60) });
  }

  // Die Oberflaeche zeigt die Einheiten als Haekchenliste. Sie muss zu den
  // Raeumen passen, sonst laesst sich eine Einheit abwaehlen, die es nicht
  // gibt — oder eine fehlt in der Liste und ist nicht abwaehlbar.
  const einheiten = [...new Set(raeume.map((r) => String(r.einheit)).filter(Boolean))].slice(0, 20);

  const hinweise = (Array.isArray(roh?.hinweise) ? roh.hinweise : [])
    .map((t: unknown) => text(t, 300)).filter(Boolean).slice(0, 20);

  const kniestock = zahl(roh?.dach?.kniestock_m, 0, 3);
  const neigung = zahl(roh?.dach?.neigung_grad, 0, 89);

  const nr = roh?.geschoss_nr;
  const geschossNr = typeof nr === "number" && Number.isInteger(nr) && nr >= -5 && nr <= 30 ? nr : null;

  return {
    geschoss: text(roh?.geschoss, 80),
    ...(geschossNr === null ? {} : { geschoss_nr: geschossNr }),
    einheiten,
    sicherheit: ausWahl(roh?.sicherheit, ["hoch", "mittel", "niedrig"], "mittel"),
    aussenwand_dicke_m: zahl(roh?.aussenwand_dicke_m, 0.08, 0.8) ?? 0.3,
    dach: kniestock === null && neigung === null ? null
      : { kniestock_m: kniestock ?? 0, neigung_grad: neigung ?? 0 },
    hinweise,
    raeume,
    tueren,
    fenster,
    treppen,
    modell: MODELL,
  };
}

// ------------------------------------------------------------------ KI-Lauf
// Streaming, nicht wegen der Geschwindigkeit, sondern wegen der Anzeige: ein
// Grundriss dauert ein bis drei Minuten, und solange soll der Nutzer sehen,
// dass gearbeitet wird. Jedes Textstueck wird gezaehlt, der Zaehler landet
// hoechstens alle FORTSCHRITT_TAKT_MS in der Auftragszeile.
async function kiLesen(
  bild: { data: string; mime: string },
  hinweis: string,
  vorher: unknown,
  korrektur: string,
  melden: (zeichen: number) => void,
): Promise<string> {
  const auftrag = [
    "Lies diesen Grundriss aus und gib das JSON zurueck.",
    hinweis ? `Hinweis des Nutzers (hat Vorrang vor deiner eigenen Auswahl): ${hinweis}` : "",
  ].filter(Boolean).join("\n\n");

  const nachrichten: unknown[] = [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: bild.mime, data: bild.data } },
      { type: "text", text: auftrag },
    ],
  }];
  // Nachbessern: die KI sieht ihr eigenes Ergebnis und die Korrektur in den
  // Worten des Nutzers. Nur die genannte Stelle aendert sich, der Rest bleibt.
  if (vorher && korrektur) {
    nachrichten.push({ role: "assistant", content: JSON.stringify(vorher) });
    nachrichten.push({
      role: "user",
      content: `Korrektur des Nutzers: ${korrektur}\n\nGib das vollstaendige JSON erneut zurueck. Aendere nur, was die Korrektur betrifft, und passe die davon abhaengenden Masse mit an. Trage in "hinweise" ein, was du geaendert hast.`,
    });
  }

  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), LAUF_MAX_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: abbruch.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELL, max_tokens: MAX_TOKENS, temperature: 0,
        system: SYSTEM, messages: nachrichten, stream: true,
      }),
    });
    if (!r.ok || !r.body) {
      throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
    }

    let gesammelt = "";
    let rest = "";
    let zuletzt = 0;
    const leser = r.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { done, value } = await leser.read();
      if (done) break;
      rest += value;
      const zeilen = rest.split("\n");
      rest = zeilen.pop() ?? "";
      for (const z of zeilen) {
        if (!z.startsWith("data:")) continue;
        const nutzlast = z.slice(5).trim();
        if (!nutzlast || nutzlast === "[DONE]") continue;
        let e: any;
        try { e = JSON.parse(nutzlast); } catch { continue; }
        if (e.type === "error") throw new Error(`Anthropic: ${text(e.error?.message, 300) || "Fehler im Datenstrom"}`);
        if (e.type === "content_block_delta" && typeof e.delta?.text === "string") gesammelt += e.delta.text;
      }
      if (Date.now() - zuletzt > FORTSCHRITT_TAKT_MS) { zuletzt = Date.now(); melden(gesammelt.length); }
    }
    if (!gesammelt.trim()) throw new Error("Die KI hat nichts geliefert.");
    return gesammelt;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Die Auswertung hat zu lange gedauert und wurde abgebrochen. Ein kleineres oder deutlicheres Bild hilft meist.");
    }
    throw e;
  } finally {
    clearTimeout(wecker);
  }
}

function jsonAusText(t: string) {
  let s = t.trim();
  const zaun = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (zaun) s = zaun[1].trim();
  // Die Vorgabe verbietet Vorwort und Nachwort. Haelt sich die KI nicht
  // daran, wird das aeusserste Klammerpaar genommen, statt aufzugeben.
  if (!s.startsWith("{")) {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  }
  return JSON.parse(s);
}

// ------------------------------------------------------------------- Bedienung
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis im
  // Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne gueltiges
  // Abo kommt trotzdem nicht daran. Die Schranke liegt in der Beilage
  // abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, cors);
  if (immoAboSperre) return immoAboSperre;
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (!ANTHROPIC_API_KEY) return antwort({ ok: false, fehler: "ANTHROPIC_API_KEY fehlt." }, 500);

    const body = await req.json().catch(() => ({} as any));
    if (String(body.aktion || "starten") !== "starten") {
      return antwort({ ok: false, fehler: "Unbekannte Aktion." }, 400);
    }

    const wer = await immoMandantDesAufrufers(req);
    if (!wer) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    if (!["chef", "mitarbeiter"].includes(wer.rolle)) {
      return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
    }

    const bildDaten = String(body.bild_base64 || "").replace(/^data:[^,]+,/, "").replace(/\s/g, "");
    if (!bildDaten) return antwort({ ok: false, fehler: "Kein Bild uebergeben." }, 400);
    if (bildDaten.length > BILD_MAX) {
      return antwort({ ok: false, fehler: "Das Bild ist zu gross. Bitte mit geringerer Aufloesung erneut versuchen." }, 400);
    }
    const mime = String(body.mime || "image/jpeg").toLowerCase();
    if (!BILD_TYPEN.includes(mime)) {
      return antwort({ ok: false, fehler: "Nur JPG, PNG, WebP oder GIF. PDF wandelt die Oberflaeche selbst um." }, 400);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Die immobilie_id kommt aus dem Anfragekoerper und ist damit ungeprueft.
    // Sie wird gegen den Mandanten des Aufrufers gehalten; passt sie nicht,
    // bricht die Funktion ab, statt den Auftrag still an das fremde Objekt
    // zu haengen.
    let immobilieId: string | null = null;
    if (typeof body.immobilie_id === "string" && UUID.test(body.immobilie_id)) {
      const { data: im } = await db.from("immobilien")
        .select("id").eq("id", body.immobilie_id).eq("mandant_id", wer.mandant).maybeSingle();
      if (!im) return antwort({ ok: false, fehler: "Kein Zugriff auf dieses Objekt." }, 403);
      immobilieId = String(im.id);
    }

    const { data: auftrag, error: aErr } = await db.from("grundriss_ki_auftraege")
      .insert({
        mandant_id: wer.mandant,
        immobilie_id: immobilieId,
        ersteller_id: wer.nutzer,
        status: "laeuft",
        fortschritt: { zeichen: 0 },
      })
      .select("id").single();
    if (aErr || !auftrag) throw new Error(aErr?.message || "Auftrag konnte nicht angelegt werden.");
    const id = String(auftrag.id);

    const hinweis = text(body.hinweis, 500);
    const korrektur = text(body.korrektur, 1000);
    const vorher = body.vorher && typeof body.vorher === "object" ? body.vorher : null;
    const start = Date.now();

    // Ab hier laeuft es ohne den Aufrufer weiter. Jeder Ausgang schreibt in
    // die Auftragszeile — auch der Fehler. Eine Zeile, die auf "laeuft"
    // stehen bleibt, waere fuer die Oberflaeche ein Haenger ohne Erklaerung;
    // dagegen steht zusaetzlich der Waechter in cron (fork_31l).
    const arbeit = (async () => {
      try {
        const roh = await kiLesen(
          { data: bildDaten, mime }, hinweis, vorher, korrektur,
          (zeichen) => {
            db.from("grundriss_ki_auftraege").update({ fortschritt: { zeichen } })
              .eq("id", id).eq("mandant_id", wer.mandant)
              .then(() => {}, () => {});
          },
        );
        const ergebnis = saeubern(jsonAusText(roh));
        await db.from("grundriss_ki_auftraege").update({
          status: "fertig",
          ergebnis,
          fortschritt: { zeichen: roh.length },
          dauer_ms: Date.now() - start,
          fertig_am: new Date().toISOString(),
        }).eq("id", id).eq("mandant_id", wer.mandant);
      } catch (e) {
        const grund = e instanceof SyntaxError
          ? "Die Antwort der KI war kein gueltiges JSON. Bitte erneut versuchen."
          : e instanceof Error ? e.message : String(e);
        await db.from("grundriss_ki_auftraege").update({
          status: "fehler",
          fehler: grund.slice(0, 1000),
          dauer_ms: Date.now() - start,
          fertig_am: new Date().toISOString(),
        }).eq("id", id).eq("mandant_id", wer.mandant);
      }
    })();

    try {
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(arbeit);
      else await arbeit;
    } catch {
      await arbeit;
    }

    return antwort({ ok: true, id });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
