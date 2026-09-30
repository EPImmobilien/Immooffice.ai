// Supabase Edge Function: expose-pruefen
// KI-Exposé-Prüfer — Claude-nativ (Anthropic Messages API mit PDF-Vision).
//
// v1.2.0: BILD-TITEL-Unterstützung — Bildunterschriften stammen aus
//         immobilie_datei.titel; die Liste (datei_id + titel) kann mitgegeben
//         werden, Tippfehler darin werden als auto-anwendbare Befunde mit
//         feld="bild_titel" + datei_id gemeldet (Sammel-Übernahme im Portal).
// v1.1.0: Prompt auf Lasses ertestete Langdock-Instructions v5 umgestellt;
//         3,57 % bestätigt; ampel + checkliste im Schema.
// v1.0.0: Erstfassung.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Wessen Mandant ist der Aufrufer? Hier kommt keine Kennung aus dem
// Anfragekoerper, sondern ein PFAD — und der wird mit dem service_role
// gelesen, fuer den RLS nicht gilt. Das erste Pfadsegment ist seit fork_09
// die Mandantenkennung; daran wird gemessen.
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  immobilie_id?: string;
  pdf_base64?: string;
  bucket?: string;
  pfad?: string;
  dateiname?: string;
  objekt_daten?: Record<string, unknown>;
  bild_titel?: { id: string; titel: string }[];
}

const PORTALFELDER = ["objekttitel", "beschreibung_objekt", "beschreibung_lage", "beschreibung_ausstattung", "beschreibung_sonstiges"];

const SYSTEM_PROMPT = `# Rolle
Du bist ein interner Exposé-Prüfer. Du machst eine schnelle, praktische Endkontrolle vor der Veröffentlichung — keine juristische Tiefenprüfung. Du prüfst genau die sieben Punkte unten und sonst nichts.

# Was du prüfst

## 1. Kerndaten vorhanden?
Checkliste: Kaufpreis · Käuferprovision · Objektart und Ort/Adresse · Wohnfläche · Zimmeranzahl · Baujahr · Energieangaben (Ausweisart, Kennwert, Energieträger, Effizienzklasse) · Ansprechpartner mit Kontaktdaten.
Fehlt eine Angabe → KRITISCH. Offensichtliche Widersprüche zwischen den Angaben (z. B. zwei verschiedene Wohnflächen oder Preise) → WICHTIG.
ZUSÄTZLICH, wenn dir Objektdaten aus dem Portal mitgegeben werden: gleiche die Zahlen im Exposé dagegen ab (Kaufpreis, Flächen, Zimmer, Baujahr, Energiewerte). Widerspruch Exposé ↔ Portaldaten → WICHTIG; die Portaldaten sind die maßgebliche Quelle.

## 2. Provisionshöhe plausibel?
Prüfe die ausgewiesene Käuferprovision gegen die Provisionsregel des Hauses je Objektart:
- Einfamilienhaus (EFH) und Eigentumswohnung (ETW): in der Regel Courtageteilung — Käuferprovision 3,57 % inkl. MwSt., der Verkäufer zahlt ebenfalls. Abweichende Höhe → HINWEIS (kann individuell vereinbart sein). Steht dort eine deutlich höhere reine Käuferprovision (z. B. 7,14 % als „nur Außenprovision“) → WICHTIG, denn bei EFH/ETW mit Privatkäufern ist eine einseitige Käuferprovision unzulässig (§ 656d BGB).
- Mehrfamilienhaus, Gewerbeobjekt, Grundstück: oft 7,14 % inkl. MwSt. als reine Außenprovision (nur der Käufer zahlt). Abweichung → HINWEIS.
Immer prüfen: Prozentsatz mit „inkl. MwSt.“ ausgewiesen und im gesamten Exposé einheitlich (Datenblock, Fließtext, AGB-Seite). Uneinheitliche Angaben → WICHTIG.

## 3. Rechtschreibung & Grammatik
Alle Texte auf Rechtschreib-, Grammatik- und Tippfehler prüfen — auch Bildunterschriften. Jeder Fund → WICHTIG, mit Fundstelle, falscher Schreibweise und Korrektur.
Stil, Wortwahl und werbliche Formulierungen bewertest du NICHT.

## 4. Grundrisse
Mindestens ein Grundriss muss enthalten und lesbar abgebildet sein (entfällt bei unbebauten Grundstücken). Fehlt er → KRITISCH.

## 5. Lageplan
Ein Lageplan muss enthalten und lesbar abgebildet sein. Fehlt er → KRITISCH.

## 6. Energieskala
Die farbige Energieeffizienz-Skala (Grafik mit Markierung des Kennwerts) muss enthalten sein. Fehlt sie → KRITISCH.

## 7. Objektfoto-Galerie sauber?
a) Keine Werbegrafiken: Melde NUR Grafiken, die als Objektfoto auftauchen (Titelbild oder Bildergalerie), obwohl sie das Objekt gar nicht zeigen — typisch: „Sofort-Download“-Kacheln (Download-Aufforderung, QR-Code), die gebrandete Portal-Hauptbild-Collage, Vertriebsgebietskarten. Jeder Fund → KRITISCH mit Seitenangabe.
b) Keine Hochkant-Fotos: Alle Objektfotos (Titelbild und Bildergalerie) müssen im Querformat stehen. Jedes Hochformat-Foto → KRITISCH mit Seitenangabe. Grundrisse und Lagepläne dürfen hochkant sein.
KEIN Befund sind die gestalteten Firmen-Seiten des Exposés: Ansprechpartner-/Kontaktseite mit Foto und Kontaktdaten, Seiten mit Siegeln, Auszeichnungen oder Partnerlogos, Unternehmens- und Leistungsdarstellungen, AGB- und Widerrufsseiten. Eigenwerbung gehört zum Exposé — nur die Objektfoto-Galerie muss sauber sein.
Ebenfalls kein Befund: echte Objektfotos im Querformat, Grundrisse, Lagepläne, Luftbilder, Renderings.

# Was du NICHT prüfst
Keine juristische Bewertung von Formulierungen, AGB oder Widerrufsbelehrung. Keine Stil- oder Marketingkritik, keine Superlative-Diskussion, keine Formatierungs-Pedanterie (Leerzeichen, Einheiten-Schreibweise). Telefonnummern und E-Mail-Adressen der Ansprechpartner sind Sache des Maklers — nicht abgleichen.

# Schweregrade & Ampel
Das JSON-Schema verwendet: "fehler" = KRITISCH, "warnung" = WICHTIG, "hinweis" = HINWEIS.
- KRITISCH (fehler): fehlende Kernangabe, fehlender Grundriss, fehlender Lageplan, fehlende Energieskala, Werbegrafik in der Objektfoto-Galerie, Hochformat-Foto.
- WICHTIG (warnung): Rechtschreib-/Grammatikfehler, widersprüchliche Kerndaten (auch gegen Portaldaten), unzulässige oder uneinheitliche Provisionsangabe.
- HINWEIS (hinweis): plausible, aber vom Üblichen abweichende Provisionshöhe; sonst nur echte Kleinigkeiten, sparsam verwenden.
Ampel: ROT bei mindestens einem KRITISCH, GELB bei nur WICHTIG, sonst GRÜN.

# Auto-Übernahme ins Portal (auto_anwendbar)
Die Beschreibungstexte im Exposé stammen 1:1 aus diesen Portal-Feldern: ${PORTALFELDER.join(", ")}. Wenn du einen Textfehler in einem dieser Felder korrigierst UND die mitgegebenen Objektdaten den Original-Feldinhalt enthalten:
- feld = exakter Feldname (z. B. "beschreibung_lage")
- korrigierter_text = der VOLLSTÄNDIGE neue Feldinhalt (der komplette Text mit allen Korrekturen, nicht nur das korrigierte Wort)
- auto_anwendbar = true
Mehrere Fehler im selben Feld: EIN Befund je Feld mit allen Korrekturen im korrigierter_text, die einzelnen Funde in der beschreibung aufzählen.

BILDUNTERSCHRIFTEN: Die Unterschriften unter Objektfotos, Grundrissen und Lageplänen stammen aus den Bild-Titeln des Portals. Wird dir eine BILD-TITEL-Liste (datei_id + titel) mitgegeben und du findest einen Tippfehler in einer Bildunterschrift, ordne ihn dem passenden Listeneintrag zu und melde:
- feld = "bild_titel"
- datei_id = die id aus der Liste
- korrigierter_text = der vollständige korrigierte Titel in normaler Groß-/Kleinschreibung (das PDF setzt Titel oft in VERSALIEN — maßgeblich ist die Schreibweise der Liste)
- auto_anwendbar = true
Ein Befund je betroffenem Bild-Titel. Ist die Zuordnung nicht eindeutig oder wurde keine Liste mitgegeben: auto_anwendbar = false und datei_id leer lassen.

In ALLEN anderen Fällen: auto_anwendbar = false und feld = "" (Bild-Befunde zu Layout/Format, fehlende Elemente sind nie auto-anwendbar).

# Arbeitsweise
Gehe das PDF Seite für Seite durch, gib bei jedem Befund die Seitenzahl an (Position im PDF, beginnend bei 1). Fasse dich kurz. Melde nur echte Befunde — kein Rauschen, keine Doppelungen. Zitiere Fundstellen wörtlich. Wenn du etwas anhand der Datei nicht erkennen kannst (z. B. Bilder nicht auswertbar), setze den Checklisten-Punkt auf "nicht_pruefbar" und sage es in der Zusammenfassung ausdrücklich, statt zu raten. Deutsch, sachlich, kollegial.`;

const PRUEF_TOOL = {
  name: "pruefbericht_abgeben",
  description: "Gibt den strukturierten Prüfbericht zum Exposé ab.",
  input_schema: {
    type: "object",
    required: ["ampel", "checkliste", "zusammenfassung", "befunde"],
    properties: {
      ampel: {
        type: "string",
        enum: ["gruen", "gelb", "rot"],
        description: "rot = mind. ein KRITISCH; gelb = nur WICHTIG; gruen = höchstens HINWEISE",
      },
      checkliste: {
        type: "object",
        description: "Die 7 Prüfpunkte als Checkliste",
        required: ["kerndaten", "provision", "grundriss", "lageplan", "energieskala", "foto_galerie", "querformat"],
        properties: {
          kerndaten:    { type: "string", enum: ["ok", "mangel", "nicht_pruefbar", "entfaellt"] },
          provision:    { type: "string", enum: ["ok", "mangel", "nicht_pruefbar", "entfaellt"] },
          grundriss:    { type: "string", enum: ["ok", "mangel", "nicht_pruefbar", "entfaellt"], description: "entfaellt bei unbebauten Grundstücken" },
          lageplan:     { type: "string", enum: ["ok", "mangel", "nicht_pruefbar", "entfaellt"] },
          energieskala: { type: "string", enum: ["ok", "mangel", "nicht_pruefbar", "entfaellt"] },
          foto_galerie: { type: "string", enum: ["ok", "mangel", "nicht_pruefbar", "entfaellt"], description: "mangel = Werbegrafik in der Objektfoto-Galerie" },
          querformat:   { type: "string", enum: ["ok", "mangel", "nicht_pruefbar", "entfaellt"], description: "mangel = Hochformat-Objektfoto" },
        },
      },
      zusammenfassung: { type: "string", description: "Ampel-Begründung in 1-3 Sätzen auf Deutsch, inkl. Hinweis auf nicht prüfbare Punkte." },
      befunde: {
        type: "array",
        items: {
          type: "object",
          required: ["schweregrad", "kategorie", "beschreibung", "auto_anwendbar"],
          properties: {
            schweregrad: { type: "string", enum: ["fehler", "warnung", "hinweis"], description: "fehler=KRITISCH, warnung=WICHTIG, hinweis=HINWEIS" },
            kategorie: { type: "string", enum: ["daten", "konsistenz", "rechtschreibung", "grundriss", "lageplan", "energie", "bilder", "provision", "sonstiges"] },
            seite: { type: "integer", description: "Seitenzahl im PDF (1-basiert), 0 wenn nicht zuordenbar" },
            feld: { type: "string", description: "Portal-Feldname bei auto-anwendbaren Textkorrekturen, \"bild_titel\" bei Bildunterschriften, sonst leer" },
            datei_id: { type: "string", description: "Nur bei feld=bild_titel: die datei_id aus der übergebenen BILD-TITEL-Liste, sonst leer" },
            beschreibung: { type: "string", description: "Fundstelle — Problem — Korrektur, knapp." },
            fundstelle: { type: "string", description: "Wörtliches Zitat der betroffenen Stelle, sofern Text" },
            korrigierter_text: { type: "string", description: "Bei auto_anwendbar: der VOLLSTÄNDIGE korrigierte Feldinhalt bzw. Bild-Titel. Sonst optionaler Korrekturvorschlag." },
            auto_anwendbar: { type: "boolean" },
          },
        },
      },
    },
  },
};

const AMPEL_ZU_URTEIL: Record<string, string> = {
  gruen: "versandfertig",
  gelb: "kleine_maengel",
  rot: "nicht_versandfertig",
};

function bytesZuBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY ist nicht gesetzt." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceKey);

    let userId: string | null = null;
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      if (jwt) {
        const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
        const { data } = await userClient.auth.getUser(jwt);
        userId = data?.user?.id ?? null;
      }
    } catch (_e) { /* egal */ }

    const body: RequestBody = await req.json();

    let pdfBase64 = (body.pdf_base64 || "").replace(/^data:application\/pdf;base64,/, "");
    let quelle = "upload";
    if (!pdfBase64 && body.bucket && body.pfad) {
      // Eimer UND Pfad kommen aus dem Anfragekoerper, gelesen wird mit dem
      // service_role. Ohne Grenze waere das ein Lesezugriff auf jede Datei
      // jedes Mandanten — nicht nur Exposes: jeder Eimer, jeder Pfad.
      const eigenerMandant = await immoMandantDesAufrufers(req);
      if (!eigenerMandant || !String(body.pfad).startsWith(eigenerMandant + "/")) {
        return new Response(JSON.stringify({ error: "Kein Zugriff auf diese Datei." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await admin.storage.from(body.bucket).download(body.pfad);
      if (error || !data) {
        return new Response(JSON.stringify({ error: `PDF nicht aus Storage ladbar (${body.bucket}/${body.pfad}): ${error?.message || "unbekannt"}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      pdfBase64 = bytesZuBase64(new Uint8Array(await data.arrayBuffer()));
      quelle = `${body.bucket}/${body.pfad}`;
    }
    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: "Kein PDF übergeben (pdf_base64 oder bucket+pfad erforderlich)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (pdfBase64.length > 40_000_000) {
      return new Response(JSON.stringify({ error: "Exposé-PDF ist zu groß für die Prüfung (max. ~30 MB)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let auftrag = "Prüfe das beigefügte Verkaufs-Exposé vollständig nach deinen Prüfregeln und gib den Prüfbericht über das Tool pruefbericht_abgeben ab.";
    if (body.objekt_daten && Object.keys(body.objekt_daten).length > 0) {
      let datenJson = JSON.stringify(body.objekt_daten, null, 1);
      if (datenJson.length > 24000) datenJson = datenJson.slice(0, 24000) + "\n… (gekürzt)";
      auftrag += `\n\nOBJEKTDATEN AUS DEM PORTAL (maßgebliche Quelle für den Datenabgleich und für auto-anwendbare Textkorrekturen):\n${datenJson}`;
    } else {
      auftrag += "\n\nEs wurden KEINE Portal-Objektdaten mitgegeben — prüfe nur das PDF selbst (interne Konsistenz statt Datenabgleich, keine auto-anwendbaren Korrekturen).";
    }
    if (Array.isArray(body.bild_titel) && body.bild_titel.length > 0) {
      const liste = body.bild_titel.slice(0, 120).
        filter((b) => b && b.id && typeof b.titel === "string").
        map((b) => `- ${b.id}: ${b.titel}`).join("\n");
      if (liste) auftrag += `\n\nBILD-TITEL (Quelle der Bildunterschriften im Exposé; Format \"datei_id: titel\"):\n${liste}`;
    }

    const modell = "claude-sonnet-4-6";
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modell,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: [PRUEF_TOOL],
        tool_choice: { type: "tool", name: "pruefbericht_abgeben" },
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: auftrag },
          ],
        }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("Anthropic API Fehler:", anthropicResponse.status, errText);
      if (body.immobilie_id) {
        await admin.from("ki_pruefungen").insert({
          immobilie_id: body.immobilie_id, typ: "expose", status: "fehler", modell,
          fehler: `Anthropic ${anthropicResponse.status}: ${errText.substring(0, 500)}`,
          eingabe_info: { quelle, dateiname: body.dateiname || null },
          erstellt_von: userId,
        });
      }
      return new Response(JSON.stringify({ error: `Anthropic-API: ${anthropicResponse.status} - ${errText.substring(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await anthropicResponse.json();
    const toolBlock = (result?.content || []).find((b: any) => b.type === "tool_use" && b.name === "pruefbericht_abgeben");
    if (!toolBlock?.input) {
      return new Response(JSON.stringify({ error: "Kein strukturierter Prüfbericht in der Antwort." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const bericht = toolBlock.input as { ampel: string; checkliste: Record<string, string>; zusammenfassung: string; befunde: unknown[] };
    const befunde = Array.isArray(bericht.befunde) ? bericht.befunde : [];
    const ampel = ["gruen", "gelb", "rot"].includes(bericht.ampel) ? bericht.ampel : "gelb";
    const gesamturteil = AMPEL_ZU_URTEIL[ampel];

    let pruefungId: string | null = null;
    try {
      const { data: ins, error: insErr } = await admin.from("ki_pruefungen").insert({
        immobilie_id: body.immobilie_id || null,
        typ: "expose",
        status: "fertig",
        modell,
        ampel,
        gesamturteil,
        zusammenfassung: bericht.zusammenfassung || null,
        checkliste: bericht.checkliste || {},
        befunde,
        eingabe_info: {
          quelle,
          dateiname: body.dateiname || null,
          objekt_daten_uebergeben: !!(body.objekt_daten && Object.keys(body.objekt_daten).length > 0),
          bild_titel_uebergeben: Array.isArray(body.bild_titel) ? body.bild_titel.length : 0,
          input_tokens: result?.usage?.input_tokens ?? null,
          output_tokens: result?.usage?.output_tokens ?? null,
        },
        erstellt_von: userId,
      }).select("id").single();
      if (insErr) console.error("ki_pruefungen insert:", insErr.message);
      pruefungId = ins?.id ?? null;
    } catch (e) {
      console.error("ki_pruefungen insert exception:", e);
    }

    return new Response(JSON.stringify({
      pruefung_id: pruefungId,
      ampel,
      gesamturteil,
      checkliste: bericht.checkliste || {},
      zusammenfassung: bericht.zusammenfassung,
      befunde,
      modell,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Edge Function Fehler:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});