// Supabase Edge Function: ki-bildbearbeitung
// ============================================================================
// KI-basierte Bildbearbeitung fuer das Marketing-Modul.
// Ruft Replicate-API auf, laedt das Ergebnis in den Supabase-Storage und
// loggt die Operation in der Tabelle ki_bildbearbeitung_log.
//
// FUNKTIONEN:
//   - retusche : Objekte/Moebel mit Maske entfernen (Inpainting via Flux-Fill)
//   - himmel   : Himmel ueber Maske ersetzen (Inpainting via Flux-Fill)
//   - staging  : Virtuelles Homestaging fuer leere Raeume (via Nano-Banana)
//
// SECRETS:
//   supabase secrets set REPLICATE_API_TOKEN=r8_...
//
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden automatisch injiziert.
//
// VERSION 2: Modernisierte Modelle + drastisch verbesserte Prompts.
// - Staging: adirik/interior-design (alt, Realistic Vision V3.0) -> google/nano-banana
// - Retusche/Himmel: flux-fill-pro bleibt, ABER Prompts deutlich detailreicher
// - Realistische Foto-Stichworte (Linse, Lichtsetzung, Kamera-Eigenschaften)
// - Negative Prompts fuer typische KI-Artefakte (Cartoon, Aquarell, weiche Texturen)
//
// VERSION 3: Robustheits-Fixes nach V2-Praxiserfahrung.
// - Frontend uebergibt Bild + Maske jetzt als URL (Storage-Upload macht das
//   Frontend bereits selbst in 'ki-bilder/_temp/'). Edge Function reicht
//   die URL einfach an Replicate weiter. Loest gleichzeitig:
//     * Body-Size-Probleme bei grossen Bildern (Edge Function hat 10 MB Limit)
//     * nano-banana-Inkompatibilitaet mit data:base64-URLs
//     * verdoppelten Upload-Aufwand (Frontend hat eh schon hochgeladen)
//   Legacy-Fallback: Wenn doch Base64 (data + media_type) kommt, wird das
//   intern in 'ki-bilder/_temp/' hochgeladen und eine Signed-URL erzeugt.
// - JWT wird explizit an auth.getUser() uebergeben (vorher Default-Aufruf,
//   der in Edge-Functions Library-versionsabhaengig fehlschlug).
// - Final gesendeter Prompt wird ins Log geschrieben (Spalte final_prompt).
//
// VERSION 3.1: Mask-basiertes Editing weg, instruktions-basiertes Editing rein.
// - Retusche und Himmel laufen jetzt auf flux-kontext-pro statt flux-fill-pro
// - KEINE Maske mehr noetig. Der User beschreibt nur noch, was geaendert
//   werden soll ("Auto entfernen", "Sonnenuntergang"). Das Modell erkennt
//   selbst, welche Bildbereiche relevant sind.
// - Falls das Frontend uebergangsweise noch eine Maske mitschickt, wird
//   sie ignoriert (Backward-Compatibility waehrend Frontend-Umbau).
// - Retusche braucht ZWINGEND einen prompt-Text (vorher optional). Wenn
//   leer -> verstaendlicher Fehler an den User.
// - Staging bleibt unveraendert auf nano-banana.
//
// VERSION 3.2: Atmosphere-Stile (Single-Click-Buttons) hinzugekommen.
// Das Frontend bietet 10 Buttons: Winterszene, Weihnachtsszene, Nachtszene,
// Golden Hour, Sommerszene, Hochformat, Personen +/-, Aufraeumen, Home Staging.
// Wir akzeptieren alle (plus diverse Schreibweisen/Aliase) und mappen sie auf
// vordefinierte englische Instruktions-Prompts fuer flux-kontext-pro. Home
// Staging ist ein Alias auf 'staging' und nutzt nano-banana.
// Das Frontend muss NICHT angepasst werden - es kann seine Buttons so lassen,
// wie sie sind. Solange der Funktions-String in einer der Alias-Formen kommt,
// versteht die Function ihn.
//
// VERSION 3.3: Wandel-Stile drastisch konservativer.
// V3.2 hat den Use-Case nicht getroffen: bei einem Sommer-Foto + Stil "Sommerszene"
// hat Kontext-Pro Efeu an die Wand gemalt und die Strasse durch Rasen ersetzt -
// weil das aus Modell-Sicht "noch sommerlicher" wirkt. Loesung: alle Wandel-Stile
// laufen jetzt mit "STRICT RULES - DO NOT VIOLATE"-Blocks, die explizit verbieten
// Gebaeude/Fahrzeuge/Strassen/Vegetation zu veraendern. Grundregel: "If unsure,
// change LESS rather than more." Folge: Aenderungen sind subtiler, aber zuverlaessig.
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ----------------------------------------------------------------------------
// Typen
// ----------------------------------------------------------------------------
// V3.2: Funktion-Typ um alle Frontend-Buttons erweitert.
// Wir akzeptieren mehrere Schreibweisen pro Stil (Frontend-Internals
// kennen wir nicht 100%, also alle plausiblen Varianten akzeptieren).
type Funktion =
  | "retusche" | "himmel" | "staging"
  | "winterszene" | "winter"
  | "weihnachtsszene" | "weihnachten"
  | "nachtszene" | "nacht"
  | "golden_hour" | "goldenhour" | "goldene_stunde"
  | "sommerszene" | "sommer"
  | "hochformat"
  | "personen_hinzufuegen" | "personen_hinzufügen" | "personen_add"
  | "personen_entfernen" | "personen_remove"
  | "aufraeumen" | "aufräumen" | "decluttern"
  | "home_staging";

interface BildEingabe {
  // PRIMAERE Variante (V3): Frontend laedt das Bild selbst in den 'ki-bilder'-
  // Bucket hoch und schickt nur die oeffentliche URL. Damit muss die Edge
  // Function selbst nichts mehr mit Base64 hantieren.
  url?: string;

  // LEGACY-Variante: Base64 direkt im Body. Wird noch unterstuetzt fuer
  // Abwaerts-Kompatibilitaet, sollte aber nicht mehr genutzt werden
  // (10-MB-Body-Limit der Edge Function).
  data?: string;
  media_type?: string;
}

interface RequestBody {
  funktion: Funktion;

  // Hauptbild (alle Funktionen)
  bild: BildEingabe;

  // Optionale Maske (PFLICHT fuer retusche und himmel):
  //   Schwarz/Weiss-PNG, weisse Bereiche werden ersetzt/entfernt.
  maske?: BildEingabe;

  // Optionaler Text-Prompt
  //  - retusche: was an die Stelle der Maske kommen soll (z.B. "leerer Boden")
  //  - himmel:   "blauer Himmel mit ein paar Wolken", "Sonnenuntergang" etc.
  //  - staging:  zusaetzlicher User-Wunsch ("mit Esstisch", "gemuetlich" ...)
  prompt?: string;

  // Stil fuer Staging:
  //   "modern" | "skandinavisch" | "industrial" | "landhaus" | "luxurios"
  stil?: string;

  // Original-Dateiname (fuer Anzeigename des Ergebnisses)
  dateiname?: string;
}

// ----------------------------------------------------------------------------
// CORS
// ----------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*, authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Max-Age": "86400",
};

// ----------------------------------------------------------------------------
// Modell-Konfiguration je Funktion (Stand 2026, V3.1)
// ----------------------------------------------------------------------------
// V3.1-Aenderung: Wechsel von Mask-basierten Modellen zu instruktions-basierten.
// Das eliminiert den UX-Schmerz mit dem Pinsel komplett: man beschreibt, was
// geaendert werden soll, das Modell erkennt selbst die relevanten Bildbereiche.
//
// RETUSCHE: black-forest-labs/flux-kontext-pro
//   Instruktions-basiertes Bild-Editing. Statt "ich pinsele weg und gebe an,
//   was hin soll" jetzt "entferne X". Das Modell findet X selbst.
//   ~$0.04/Bild.
//
// HIMMEL:   black-forest-labs/flux-kontext-pro
//   Gleiches Modell, andere Instruktion. "Replace the sky with ..."
//   Erkennt selbst, was Himmel ist - keine Maske noetig.
//
// STAGING:  google/nano-banana
//   Bleibt. Multimodal-Edit-Modell aus Gemini 2.5 Flash Image. Raum (Waende,
//   Boden, Fenster) bleibt pixelgenau erhalten - nur Moebel kommen dazu.
//   ~$0.039/Bild.
// ----------------------------------------------------------------------------
const MODELLE = {
  // Klassische drei
  retusche: { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  himmel:   { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  staging:  { owner: "google",            name: "nano-banana",      kosten_usd: 0.039 },
  // Neue Frontend-Buttons - alle auf flux-kontext-pro, weil instruktions-basiert
  winterszene:          { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  weihnachtsszene:      { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  nachtszene:           { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  golden_hour:          { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  sommerszene:          { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  hochformat:           { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  personen_hinzufuegen: { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  personen_entfernen:   { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  aufraeumen:           { owner: "black-forest-labs", name: "flux-kontext-pro", kosten_usd: 0.04 },
  // home_staging ist nur ein Alias auf 'staging' und wird vor MODELLE-Lookup normalisiert
} as const;

// ----------------------------------------------------------------------------
// Frontend schickt Funktionsnamen in verschiedenen Schreibweisen. Hier
// kanonisieren wir auf den Schluessel, den MODELLE und FUNKTIONS_PROMPTS
// kennen. Nutzt lower-case + Umlaut-Normalisierung + Alias-Map.
// ----------------------------------------------------------------------------
function kanonisiereFunktion(roh: string): keyof typeof MODELLE | null {
  if (!roh) return null;
  const k = roh.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[\s-]+/g, "_");
  const aliasMap: Record<string, keyof typeof MODELLE> = {
    // Klassisch
    "retusche": "retusche",
    "himmel": "himmel",
    "staging": "staging",
    "home_staging": "staging",
    "homestaging": "staging",
    // Saisonal / Atmosphaere
    "winter": "winterszene",
    "winterszene": "winterszene",
    "weihnachten": "weihnachtsszene",
    "weihnachtsszene": "weihnachtsszene",
    "christmas": "weihnachtsszene",
    "nacht": "nachtszene",
    "nachtszene": "nachtszene",
    "night": "nachtszene",
    "golden_hour": "golden_hour",
    "goldenhour": "golden_hour",
    "goldene_stunde": "golden_hour",
    "sommer": "sommerszene",
    "sommerszene": "sommerszene",
    "summer": "sommerszene",
    // Format / People / Cleanup
    "hochformat": "hochformat",
    "portrait": "hochformat",
    "personen_hinzufuegen": "personen_hinzufuegen",
    "personen_add": "personen_hinzufuegen",
    "add_people": "personen_hinzufuegen",
    "personen_entfernen": "personen_entfernen",
    "personen_remove": "personen_entfernen",
    "remove_people": "personen_entfernen",
    "aufraeumen": "aufraeumen",
    "decluttern": "aufraeumen",
    "declutter": "aufraeumen",
    "clean_up": "aufraeumen",
  };
  return aliasMap[k] ?? null;
}

// ----------------------------------------------------------------------------
// FOTO-DNA-Stichworte
// ----------------------------------------------------------------------------
// Diese Stichworte werden an Inpainting-Prompts angehaengt und sorgen dafuer,
// dass das Ergebnis wie ein echtes Foto wirkt und nicht wie ein Render oder
// Aquarell. ENGLISCH, weil Flux deutlich besser auf englische Prompts reagiert.
// ----------------------------------------------------------------------------
const FOTO_DNA = "photorealistic, natural daylight, sharp focus, 35mm lens, DSLR, professional real estate photography, high detail, color-graded, no artifacts";

const NEGATIV_BASIS = "cartoon, illustration, painting, watercolor, drawing, anime, render, 3d, cgi, blurry, low quality, deformed, distorted, oversaturated, hdr, fake-looking, text, watermark, signature, logo";

// ----------------------------------------------------------------------------
// Stil-Prompts fuer Staging (nano-banana)
// ----------------------------------------------------------------------------
// Wichtig: nano-banana ist ein INSTRUKTIONS-Modell. Der Prompt sollte ein
// Befehl sein wie "Add furniture", nicht eine Beschreibung "A room with...".
// ----------------------------------------------------------------------------
const STIL_BESCHREIBUNGEN: Record<string, string> = {
  modern:
    "modern minimalist furniture: a light grey sofa, a low coffee table in dark oak, a floor lamp with brass details, an abstract artwork on the wall, and a small green potted plant. Clean lines, neutral colors (white, grey, beige), contemporary 2025 design",
  skandinavisch:
    "scandinavian style furniture: a light beige fabric sofa with linen cushions, a round wooden coffee table in light oak, a soft cream-colored area rug, a tall floor lamp with a paper shade, a few hanging plants in macrame, and a wooden bookshelf with cozy decor. Warm and inviting, light woods, white walls, hygge atmosphere",
  industrial:
    "industrial loft furniture: a dark leather chesterfield sofa, a metal coffee table with exposed bolts, an Edison-bulb pendant light, a vintage rug, a black metal shelf with books and decor, and exposed pipes ambience. Dark colors with rust accents, raw textures",
  landhaus:
    "country house furniture: a comfortable cream fabric sofa with floral cushions, a rustic wooden coffee table, a wrought-iron candle holder, a cozy patterned rug, a wooden cabinet with farmhouse decor, and dried flowers in a vase. Warm wood tones, soft natural light",
  luxurios:
    "luxurious furniture: an elegant velvet sofa in deep emerald or navy, a marble coffee table with brass legs, a designer crystal chandelier, a large statement abstract painting, a thick wool rug, and curated decor objects in gold and marble. Sophisticated, high-end, designer pieces",
};

// V3.3: Wandel-Stile drastisch konservativer.
// Erfahrung mit V3.2: bei Bildern, die schon "in die Richtung" gehen
// (z.B. Sommerszene auf einem Sommerbild), interpretiert Kontext-Pro den
// Auftrag als "noch sommerlicher machen" und fuegt Efeu, Rasen statt Strasse
// oder neue Pflanzen dazu. Loesung: Prompt formuliert "subtle enhancement of
// existing scene" statt "transform into ...". Wenn das Modell nichts findet
// was es subtil verstaerken kann, soll es lieber wenig tun als zu viel.
const ATMOSPHERE_INSTRUKTIONEN: Partial<Record<keyof typeof MODELLE, string>> = {
  winterszene:
    "Add a thin layer of fresh snow on the roof, on the lawn and on bare ground " +
    "(grass, soil). If trees are visible with leaves, make them bare with a touch " +
    "of frost. Adjust the sky to a soft pale-blue overcast winter sky. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) Do not add snow to streets, driveways, parking lots, sidewalks, paving " +
    "stones or any hardscape - those stay clear. " +
    "(2) Do not change the building, windows, doors, walls or facade in any way. " +
    "(3) Do not add or remove any objects: vehicles, fences, signs, decorations " +
    "stay exactly as they are. " +
    "(4) Do not add ivy, vines or any vegetation that is not already present. " +
    "(5) If unsure, change LESS rather than more. " +
    "Photorealistic, natural winter light, real estate photography.",

  weihnachtsszene:
    "Add subtle Christmas decorations to the building's existing facade: a string " +
    "of warm white lights along the roof line and a Christmas wreath on the front " +
    "door. Make the windows glow with warm yellow interior light. Adjust the sky " +
    "to a calm dusk blue. Add a thin layer of snow on the roof only. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) Do not add snow to streets, driveways, sidewalks or any hardscape. " +
    "(2) Do not change the building structure, windows, doors, walls or facade. " +
    "(3) Do not add or remove vehicles, fences or other objects. " +
    "(4) Do not add ivy, vines, plants or any vegetation that is not already there. " +
    "(5) Keep decorations minimal and tasteful - no inflatables, no over-the-top displays. " +
    "(6) If unsure, change LESS rather than more. " +
    "Photorealistic, cozy evening atmosphere, real estate photography.",

  nachtszene:
    "Subtly adjust this image to look like a clear summer evening / blue hour: " +
    "deep blue evening sky with a hint of stars, the building's windows glowing " +
    "with warm interior light, soft warm accent lighting on the facade entrance. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) Do not change the building, windows, doors, walls or facade structure. " +
    "(2) Do not add or remove vehicles, fences, plants, signs or other objects. " +
    "(3) Do not add ivy, vines or any vegetation that is not already there. " +
    "(4) Streets, driveways and ground stay in their existing form - only the light " +
    "and color temperature change. " +
    "(5) If unsure, change LESS rather than more. " +
    "Photorealistic, professional blue-hour real estate photography.",

  golden_hour:
    "Subtly adjust the lighting of this image to look like golden hour: warm golden " +
    "sunlight from a low angle, slightly longer and softer shadows, sky in a warm " +
    "orange-to-blue gradient. The building facade should glow with a warm amber tint. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) Do not change the building, windows, doors, walls or facade in any way. " +
    "(2) Do not add or remove vehicles, fences, plants, signs or other objects. " +
    "(3) Do not add ivy, vines or any vegetation that is not already there. " +
    "(4) Do not change roads or hardscape - only color temperature and shadow length adjust. " +
    "(5) If unsure, change LESS rather than more. " +
    "Photorealistic, magic-hour real estate photography.",

  sommerszene:
    // V3.3 (Rollback nach V3.4-Misserfolg): Das beste bisherige Ergebnis.
    // V3.4 mit "Default action: return unchanged" hat schlechtere Ergebnisse
    // produziert (mehr Efeu, gedaempfteres Licht) - vermutlich war der Anker
    // zu defensiv. V3.3 mit "subtly enhance" trifft den besseren Mittelweg.
    "Adjust ONLY the sky and overall lighting of this image to feel like a sunny " +
    "summer day. If the sky is grey or overcast, change it to a bright blue sky " +
    "with a few light cumulus clouds. Slightly increase the warmth and brightness " +
    "of the overall lighting. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) DO NOT ADD any vegetation of any kind. No ivy. No vines. No climbing " +
    "plants on walls or buildings. No new trees. No new bushes. No new grass. " +
    "If you see a wall, leave the wall alone - do NOT add green to it. " +
    "(2) DO NOT change the appearance of existing trees, bushes, lawns or any " +
    "existing plants - their leaves, shape and density stay exactly as they are. " +
    "(3) DO NOT turn any street, road, driveway, parking area, sidewalk, paving " +
    "stones or cobblestones into lawn, grass or any other surface. Hardscape " +
    "stays hardscape. " +
    "(4) DO NOT change the building, windows, doors, walls, facade or roof. " +
    "(5) DO NOT add, remove or move any vehicles, fences, signs or objects. " +
    "(6) The ONLY things you may change are: sky color and clouds, overall light " +
    "warmth and brightness. Nothing else. " +
    "(7) If the sky is already blue and the light is already warm, change almost " +
    "nothing - return the image nearly unchanged. " +
    "Photorealistic real estate photography.",

  hochformat:
    // Crop/Outpaint - bleibt wie vorher, keine Wandel-Logik
    "Reframe this image as a vertical portrait composition (9:16 aspect ratio). " +
    "Keep the main subject - the building - centered and fully visible. Crop the " +
    "sides as needed and extend the top (sky) and bottom (foreground) naturally " +
    "to fit a vertical format. Do not change colors, lighting or any details of " +
    "the building. Photorealistic, seamless extension, real estate photography.",

  personen_hinzufuegen:
    "Add one or two natural-looking people to this image: a relaxed couple or " +
    "small family standing or walking on an existing path/sidewalk in front of " +
    "the building, dressed in casual everyday clothes. They should be at an " +
    "appropriate scale and match the existing lighting direction and shadows. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) Do not change the building, windows, doors, walls or facade. " +
    "(2) Do not add or remove vehicles, fences, plants or other objects. " +
    "(3) Do not change the sky, weather or lighting conditions. " +
    "(4) Place people only on existing walkable surfaces. " +
    "(5) If unsure, add just one person rather than a group. " +
    "Photorealistic, professional real estate photography.",

  personen_entfernen:
    "Remove all people from this image. Fill the areas where they stood with " +
    "whatever should logically be behind them - matching ground, building " +
    "details, vegetation - so the result looks like a clean photograph that " +
    "was never populated. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) Do not change the building, windows, doors, walls or facade. " +
    "(2) Do not change or remove vehicles, fences, plants, signs or other non-human objects. " +
    "(3) Do not change the sky, weather or lighting. " +
    "(4) Only people disappear - everything else stays pixel-identical. " +
    "Photorealistic, no traces, no patches, real estate photography quality.",

  aufraeumen:
    "Tidy up the scene by removing only clearly unwanted clutter: visible " +
    "garbage cans, trash bags, garden hoses, loose cables, construction debris, " +
    "laundry on lines, garden tools left out. Fill the cleared areas naturally " +
    "with matching ground, lawn or pavement. " +
    "STRICT RULES - DO NOT VIOLATE: " +
    "(1) Do not change the building, windows, doors, walls or facade. " +
    "(2) Do not remove vehicles, fences, permanent garden furniture, planters, " +
    "mailboxes, signs or anything that is clearly part of the property's " +
    "permanent setup. " +
    "(3) Do not change the sky, weather or lighting. " +
    "(4) Do not add anything - only remove. " +
    "(5) If unsure whether something is clutter or part of the property, leave it. " +
    "Photorealistic, no traces, real estate photography quality.",
};

// ----------------------------------------------------------------------------
// Helper: Eine an Replicate uebergebbare URL aus der BildEingabe ermitteln
// ----------------------------------------------------------------------------
// Das Frontend laedt Bild + Maske selbst in den 'ki-bilder/_temp/'-Pfad hoch
// und schickt nur die public URL. Wir reichen die einfach an Replicate weiter.
//
// Legacy-Fallback: wenn ein Caller noch Base64 (data + media_type) schickt,
// laden wir das hier in einen Temp-Pfad hoch und geben eine signierte URL
// zurueck. Das passiert nur, wenn das Frontend (noch) nicht migriert ist.
async function bildUrlAuflösen(
  supabase: ReturnType<typeof createClient>,
  bild: BildEingabe,
  userId: string,
  rolle: "input" | "maske",
): Promise<string> {
  // Primaerweg: URL ist direkt im Body
  if (bild.url && typeof bild.url === "string") {
    return bild.url;
  }

  // Legacy: Base64 -> Storage -> Signed URL
  if (!bild.data) {
    throw new Error(`Bildeingabe (${rolle}) hat weder 'url' noch 'data'.`);
  }
  const erlaubt = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const mt = erlaubt.includes(bild.media_type || "") ? bild.media_type! : "image/jpeg";
  const ext = mt === "image/jpeg" ? "jpg" : mt.split("/")[1];

  const binary = Uint8Array.from(atob(bild.data), c => c.charCodeAt(0));
  const pfad = `_temp/${userId}/${Date.now()}_${crypto.randomUUID()}_${rolle}.${ext}`;

  // Wir nutzen den schon vorhandenen 'ki-bilder'-Bucket, damit kein
  // zusaetzlicher Bucket gebraucht wird.
  const { error: uploadErr } = await supabase.storage
    .from("ki-bilder")
    .upload(pfad, binary, { contentType: mt, upsert: false });
  if (uploadErr) {
    throw new Error(`Legacy-Upload (${rolle}) fehlgeschlagen: ${uploadErr.message}`);
  }
  const { data: signed, error: signErr } = await supabase.storage
    .from("ki-bilder")
    .createSignedUrl(pfad, 60 * 60);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Legacy-Signed-URL (${rolle}) fehlgeschlagen: ${signErr?.message || "leer"}`);
  }
  return signed.signedUrl;
}

// ----------------------------------------------------------------------------
// Replicate API: Prediction starten + auf Ergebnis warten (Polling)
// ----------------------------------------------------------------------------
async function replicateRun(
  apiToken: string,
  owner: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  // 1) Prediction starten
  const startRes = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Prefer": "wait",  // bittet Replicate, bis zu 60s synchron zu warten
      },
      body: JSON.stringify({ input }),
    },
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Replicate-Start: ${startRes.status} - ${errText.substring(0, 400)}`);
  }

  let prediction = await startRes.json();

  // 2) Falls "Prefer: wait" nicht gereicht hat -> pollen
  const maxWartezeitMs = 120_000;  // 2 Minuten Hardlimit
  const startZeit = Date.now();

  while (
    prediction.status !== "succeeded"
    && prediction.status !== "failed"
    && prediction.status !== "canceled"
  ) {
    if (Date.now() - startZeit > maxWartezeitMs) {
      throw new Error("Replicate-Timeout: Vorhersage dauerte laenger als 2 Minuten.");
    }
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(prediction.urls.get, {
      headers: { "Authorization": `Bearer ${apiToken}` },
    });
    if (!pollRes.ok) {
      throw new Error(`Replicate-Poll: ${pollRes.status}`);
    }
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded") {
    const fehler = prediction.error || prediction.status;
    throw new Error(`Replicate-Fehler: ${fehler}`);
  }

  // 3) Output ist je nach Modell ein String (URL) oder Array von URLs
  const output = prediction.output;
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== "string" || !url.startsWith("http")) {
    throw new Error("Replicate hat kein Bild-URL zurueckgegeben.");
  }
  return url;
}

// ----------------------------------------------------------------------------
// Replicate-Output (URL) herunterladen und in Supabase-Storage hochladen
// ----------------------------------------------------------------------------
async function ladeNachStorage(
  bildUrl: string,
  funktion: Funktion,
  userId: string,
  dateiname: string,
): Promise<{ path: string; publicUrl: string }> {
  // Download Replicate-Ergebnis
  const bildRes = await fetch(bildUrl);
  if (!bildRes.ok) {
    throw new Error(`Konnte Replicate-Bild nicht laden: ${bildRes.status}`);
  }
  const bildBlob = await bildRes.blob();

  // MIME-Type bestimmen
  const contentType = bildRes.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg") ? "jpg"
                  : contentType.includes("webp") ? "webp"
                  : "png";

  // Pfad: ki-bilder/{userId}/{funktion}/{timestamp}_{slug}.ext
  const slug = dateiname
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.\-äöüÄÖÜß]/g, "_")
    .substring(0, 60);
  const path = `${userId}/${funktion}/${Date.now()}_${slug || "bild"}.${extension}`;

  // Upload via Service-Role-Client
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { error: uploadErr } = await supabase.storage
    .from("ki-bilder")
    .upload(path, bildBlob, {
      contentType,
      upsert: false,
    });
  if (uploadErr) {
    throw new Error(`Storage-Upload fehlgeschlagen: ${uploadErr.message}`);
  }

  // Public URL (Bucket ist public)
  const { data: urlData } = supabase.storage.from("ki-bilder").getPublicUrl(path);
  return { path, publicUrl: urlData.publicUrl };
}

// ----------------------------------------------------------------------------
// In Log-Tabelle schreiben
// ----------------------------------------------------------------------------
async function logErgebnis(opts: {
  userId: string;
  userName: string;
  funktion: Funktion;
  parameter: Record<string, unknown>;
  finalPrompt: string;
  storagePath: string;
  resultName: string;
  modell: string;
  kostenUsd: number;
  status: "ok" | "fehler";
  fehlerMeldung?: string;
}): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  await supabase.from("ki_bildbearbeitung_log").insert({
    user_id: opts.userId,
    user_name: opts.userName,
    funktion: opts.funktion,
    parameter: opts.parameter,
    final_prompt: opts.finalPrompt,
    storage_path: opts.storagePath,
    result_name: opts.resultName,
    modell: opts.modell,
    kosten_usd: opts.kostenUsd,
    status: opts.status,
    fehler_meldung: opts.fehlerMeldung || "",
  });
}

// ----------------------------------------------------------------------------
// Prompt bauen je Funktion
// ----------------------------------------------------------------------------
async function buildInput(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ input: Record<string, unknown>; modellName: string; finalerPrompt: string }> {
  const modell = MODELLE[body.funktion];
  const modellName = `${modell.owner}/${modell.name}`;

  // Bild fuer alle Funktionen hochladen
  const bildUrl = await bildUrlAuflösen(supabase, body.bild, userId, "input");

  // -------- ATMOSPHAERE-STILE (V3.2) ---------------------------------------
  // Alle Single-Click-Buttons aus dem Frontend: Winterszene, Weihnachtsszene,
  // Nachtszene, Golden Hour, Sommerszene, Hochformat, Personen +/-, Aufraeumen.
  // Keine Maske, kein Prompt vom User noetig (optional kann er eine
  // Zusatz-Anweisung geben). Wir nehmen den festen Stil-Prompt und haengen
  // ggf. den User-Zusatz an.
  const atmosphereInstr = ATMOSPHERE_INSTRUKTIONEN[body.funktion as keyof typeof ATMOSPHERE_INSTRUKTIONEN];
  if (atmosphereInstr) {
    const userZusatz = (body.prompt || "").trim();
    const finalerPrompt = userZusatz
      ? `${atmosphereInstr} Additionally: ${userZusatz}.`
      : atmosphereInstr;
    return {
      modellName,
      finalerPrompt,
      input: {
        prompt: finalerPrompt,
        input_image: bildUrl,
        output_format: "jpg",
        safety_tolerance: 2,
      },
    };
  }
  // -------- RETUSCHE -------------------------------------------------------
  // V3.1: keine Maske mehr noetig. Modell ist flux-kontext-pro, das per
  // Text-Instruktion bearbeitet. Falls das Frontend (noch) eine Maske
  // mitschickt, ignorieren wir sie still - das macht die Migration weich.
  if (body.funktion === "retusche") {
    const userWunsch = (body.prompt || "").trim();
    if (!userWunsch) {
      throw new Error(
        "Funktion 'retusche' benoetigt eine Beschreibung dessen, was entfernt " +
        "oder geaendert werden soll (z.B. 'Auto vor dem Haus entfernen').",
      );
    }

    // Kontext-Pro will Befehle, keine Beschreibungen. Wir formen den
    // User-Wunsch in eine englische Instruktion um, ohne dass der User
    // englisch tippen muss.
    //
    // Heuristik: faengt der User-Text mit "entferne", "loesche", "weg", ...
    // an, ist es eine Entfernungs-Anweisung; sonst nehmen wir den Text 1:1
    // als Aenderungswunsch.
    const wunschLower = userWunsch.toLowerCase();
    let instruktion: string;
    if (
      wunschLower.startsWith("entferne") ||
      wunschLower.startsWith("loesche") ||
      wunschLower.startsWith("lösche") ||
      wunschLower.startsWith("weg ") ||
      wunschLower.includes(" entfernen") ||
      wunschLower.includes(" weg")
    ) {
      // Entfernung
      instruktion =
        `Remove the following from the image and fill the area naturally with ` +
        `whatever should logically be behind it (matching ground, wall, sky etc): ` +
        `${userWunsch}. Keep all other parts of the image pixel-identical. ` +
        `The result must look like a clean, untouched real estate photograph - ` +
        `no traces, no patches, no artifacts. Photorealistic, preserve original ` +
        `lighting and perspective.`;
    } else {
      // Allgemeine Aenderungs-Instruktion
      instruktion =
        `${userWunsch}. Apply this change while keeping all other elements of ` +
        `the image pixel-identical. Photorealistic, preserve original lighting, ` +
        `shadows, perspective and image quality. Real estate photography style.`;
    }

    return {
      modellName,
      finalerPrompt: instruktion,
      input: {
        prompt: instruktion,
        input_image: bildUrl,
        output_format: "jpg",
        safety_tolerance: 2,
      },
    };
  }

  // -------- HIMMEL ---------------------------------------------------------
  // V3.1: keine Maske mehr. flux-kontext-pro erkennt selbst, was Himmel ist,
  // und tauscht ihn aus, ohne Dachkanten oder Baeume zu beschaedigen.
  if (body.funktion === "himmel") {
    const userWunsch = (body.prompt || "").trim().toLowerCase();
    let skyDesc: string;
    if (userWunsch.includes("sonnenuntergang") || userWunsch.includes("sunset")) {
      skyDesc = "a warm golden hour sunset sky with soft orange, pink and purple clouds";
    } else if (userWunsch.includes("dramatisch") || userWunsch.includes("dramatic")) {
      skyDesc = "a dramatic sky with beautiful cumulus clouds and deep blue tones";
    } else if (userWunsch.includes("wolken") || userWunsch.includes("clouds")) {
      skyDesc = "a bright blue sky with beautiful scattered white cumulus clouds";
    } else if (userWunsch.includes("klar") || userWunsch.includes("clear")) {
      skyDesc = "a clear bright blue sky without clouds";
    } else if (userWunsch) {
      // User hat eigene Beschreibung, lassen wir dranhaengen
      skyDesc = `a beautiful sky: ${userWunsch}`;
    } else {
      // Standard
      skyDesc = "a bright blue sky with a few soft scattered white clouds";
    }

    // Wichtig: explizit sagen, was UNVERAENDERT bleiben soll.
    // Sonst neigt Kontext-Pro dazu, auch Beleuchtung oder Farben anzupassen.
    const instruktion =
      `Replace the sky in this image with ${skyDesc}. ` +
      `Keep the building, ground, trees, people and all other elements ` +
      `pixel-identical - only the sky changes. The new sky lighting should ` +
      `look natural and match the existing light direction on the building. ` +
      `Photorealistic, professional real estate photography quality.`;

    return {
      modellName,
      finalerPrompt: instruktion,
      input: {
        prompt: instruktion,
        input_image: bildUrl,
        output_format: "jpg",
        safety_tolerance: 2,
      },
    };
  }

  // -------- STAGING (Nano-Banana) -----------------------------------------
  if (body.funktion === "staging") {
    const stilKey = body.stil && STIL_BESCHREIBUNGEN[body.stil] ? body.stil : "modern";
    const stilDesc = STIL_BESCHREIBUNGEN[stilKey];

    // Nano-Banana erwartet einen Instruktions-Prompt.
    // KRITISCH: explizit sagen, was NICHT veraendert werden soll (Boden, Wand,
    // Fenster). Sonst tendiert das Modell dazu, den ganzen Raum umzugestalten.
    const userZusatz = (body.prompt || "").trim();
    const zusatz = userZusatz ? ` Additionally: ${userZusatz}.` : "";

    const instruktion = `Furnish this empty room with ${stilDesc}.${zusatz} ` +
      `Do NOT change the room itself: keep walls, floor, ceiling, windows, doors, ` +
      `lighting and room geometry exactly as they are. Only ADD furniture and decor ` +
      `that fits naturally into the existing space. The result must look like a ` +
      `professional real estate photograph of a furnished room, with realistic ` +
      `shadows, proper perspective, and natural lighting matching the original photo. ` +
      `Photorealistic, sharp focus, real furniture from the year 2025.`;

    return {
      modellName,
      finalerPrompt: instruktion,
      input: {
        // Nano-Banana akzeptiert das Eingabebild via "image_input" als Array.
        // Die offizielle Schema ist {prompt: string, image_input: string[]}.
        prompt: instruktion,
        image_input: [bildUrl],
        output_format: "jpg",
      },
    };
  }

  throw new Error(`Unbekannte Funktion: ${body.funktion}`);
}

// ----------------------------------------------------------------------------
// Haupt-Handler
// ----------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // CORS-Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---- Auth pruefen ----
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // User-Info aus JWT auslesen
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Wichtig: JWT explizit uebergeben. Ohne Parameter wuerde getUser() den
    // Token aus dem internen Session-Storage des Clients lesen, den es in
    // einer Edge Function nicht gibt -> immer "Ungueltige Session.".
    const jwt = authHeader.slice("Bearer ".length);
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Ungueltige Session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = userData.user.id;

    // Anzeigename aus profiles holen (optional, faellt auf E-Mail zurueck)
    let userName = userData.user.email || "";
    try {
      const { data: profil } = await userClient
        .from("profiles").select("name").eq("id", userId).single();
      if (profil?.name) userName = profil.name;
    } catch (_) { /* egal */ }

    // ---- API-Token pruefen ----
    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!replicateToken) {
      return new Response(
        JSON.stringify({
          error: "REPLICATE_API_TOKEN ist nicht gesetzt. Bitte 'supabase secrets set REPLICATE_API_TOKEN=...' ausfuehren.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Body parsen ----
    const body: RequestBody = await req.json();
    const hatBild = !!(body?.bild?.url || body?.bild?.data);
    if (!body || !body.funktion || !hatBild) {
      return new Response(
        JSON.stringify({
          error: "Ungueltige Anfrage: funktion und bild (mit url oder data) sind Pflicht.",
          debug: {
            body_keys: body ? Object.keys(body) : [],
            funktion_wert: body?.funktion,
            bild_keys: body?.bild && typeof body.bild === "object"
              ? Object.keys(body.bild as Record<string, unknown>)
              : [],
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!["retusche", "himmel", "staging"].includes(body.funktion)) {
      // V3.2: Vor dem harten Reject pruefen, ob die Funktion ueber einen
      // Alias kanonisiert werden kann. Frontend schickt evtl.
      // "Personen entfernen", "personen-entfernen", "PERSONEN_ENTFERNEN" oder
      // einen englischen Variantennamen - alles abfangen.
      const kanonisch = kanonisiereFunktion(body.funktion as string);
      if (kanonisch) {
        // body.funktion auf kanonische Form ueberschreiben, damit downstream
        // (buildInput, MODELLE-Lookup, logErgebnis) den richtigen Schluessel sieht.
        (body as unknown as { funktion: string }).funktion = kanonisch;
      } else {
        return new Response(
          JSON.stringify({
            error: `Unbekannte Funktion: ${body.funktion}`,
            debug: {
              funktion_roh: body.funktion,
              bekannte_funktionen: Object.keys(MODELLE),
              bekannte_aliase: [
                "winter/winterszene", "weihnachten/weihnachtsszene", "christmas",
                "nacht/nachtszene/night", "golden_hour/goldenhour/goldene_stunde",
                "sommer/sommerszene/summer", "hochformat/portrait",
                "personen_hinzufuegen/add_people", "personen_entfernen/remove_people",
                "aufraeumen/decluttern", "home_staging", "retusche", "himmel", "staging",
              ],
            },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ---- Input fuer Replicate bauen ----
    // Wir brauchen den Service-Role-Client schon hier, weil buildInput Bild
    // und Maske in den Temp-Storage hochlaedt.
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let input: Record<string, unknown>;
    let modellName: string;
    let finalerPrompt: string;
    try {
      const built = await buildInput(body, supabaseAdmin, userId);
      input = built.input;
      modellName = built.modellName;
      finalerPrompt = built.finalerPrompt;
    } catch (e) {
      const meldung = e instanceof Error ? e.message : String(e);
      return new Response(
        JSON.stringify({ error: meldung }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const modell = MODELLE[body.funktion];

    // ---- Replicate aufrufen ----
    let bildUrl: string;
    try {
      bildUrl = await replicateRun(replicateToken, modell.owner, modell.name, input);
    } catch (e) {
      const meldung = e instanceof Error ? e.message : String(e);
      // Fehler ebenfalls loggen (ohne Storage-Path), MIT final gesendetem Prompt
      try {
        await logErgebnis({
          userId, userName,
          funktion: body.funktion,
          parameter: { prompt: body.prompt, stil: body.stil },
          finalPrompt: finalerPrompt,
          storagePath: "",
          resultName: body.dateiname || "",
          modell: modellName,
          kostenUsd: 0,
          status: "fehler",
          fehlerMeldung: meldung.substring(0, 500),
        });
      } catch (_) { /* Log-Fehler ignorieren */ }

      return new Response(
        JSON.stringify({ error: meldung }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Ergebnis in Storage laden ----
    const { path, publicUrl } = await ladeNachStorage(
      bildUrl,
      body.funktion,
      userId,
      body.dateiname || "bild",
    );

    // ---- Log-Eintrag schreiben ----
    await logErgebnis({
      userId, userName,
      funktion: body.funktion,
      parameter: { prompt: body.prompt, stil: body.stil },
      finalPrompt: finalerPrompt,
      storagePath: path,
      resultName: body.dateiname || "",
      modell: modellName,
      kostenUsd: modell.kosten_usd,
      status: "ok",
    });

    // ---- Antwort ----
    return new Response(
      JSON.stringify({
        storage_path: path,
        public_url: publicUrl,
        modell: modellName,
        kosten_usd: modell.kosten_usd,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("Edge Function Fehler:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});