// ============================================================================
// news-briefing-erstellen
// ============================================================================
// Wird per Cron 1x taeglich (z.B. 6:30 Uhr) aufgerufen.
// Holt RSS-Feeds von Haufe Immobilien + Baulinks Immobilien,
// extrahiert die Headlines + Beschreibungen der letzten 24 Stunden,
// laesst Claude daraus ein knappes Branchen-Briefing erstellen,
// und speichert es in news_briefings.
//
// Manuell aufrufbar fuer Debug: POST mit { force: true } um
// auch heutiges Briefing zu ueberschreiben.
//
// Input: {}  oder  { force?: boolean }
// Output: { ok, briefing_id, anzahl_artikel }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// RSS-Quellen
const FEEDS = [
  {
    name: "Haufe Immobilien",
    url: "https://www.haufe.de/xml/rss_129130.xml",
    kategorie: "branche",
  },
  {
    name: "Baulinks Immobilien",
    url: "https://www.baulinks.de/rssfeed/bauportale/immobilien.rss",
    kategorie: "bau",
  },
  // Optional: weitere RSS-Feeds, die kommerziell zugaenglich sind
];

interface NewsArtikel {
  titel: string;
  beschreibung: string;
  link: string;
  pub_datum: string;
  quelle: string;
}

// XML/RSS-Parser (sehr simpel, fuer typische RSS-2.0-Feeds)
function parseRSS(xml: string, quellName: string): NewsArtikel[] {
  const artikel: NewsArtikel[] = [];

  // Items extrahieren
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const titel = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const beschreibung = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate") || extractTag(itemXml, "dc:date");

    if (titel) {
      artikel.push({
        titel: cleanText(titel),
        beschreibung: cleanText(beschreibung || ""),
        link: cleanText(link || ""),
        pub_datum: pubDate || "",
        quelle: quellName,
      });
    }
  }

  return artikel;
}

function extractTag(xml: string, tagName: string): string {
  // CDATA-Variante
  const cdataRegex = new RegExp(`<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tagName}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain-Tag-Variante
  const plainRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const plainMatch = xml.match(plainRegex);
  if (plainMatch) return plainMatch[1].trim();

  return "";
}

function cleanText(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")  // HTML-Tags entfernen
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function istAusLetzten48Stunden(pubDatum: string): boolean {
  if (!pubDatum) return true; // im Zweifel mitnehmen
  try {
    const datum = new Date(pubDatum);
    if (isNaN(datum.getTime())) return true;
    const stundenDiff = (Date.now() - datum.getTime()) / (1000 * 60 * 60);
    return stundenDiff <= 48;
  } catch {
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey   = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY fehlt in Edge Function Secrets.");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const force = body?.force === true;

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Heutiges Datum (Berlin-Zeit)
    const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); // YYYY-MM-DD

    // Schon ein Briefing heute? (Idempotenz)
    if (!force) {
      const { data: existing } = await admin
        .from("news_briefings").select("id").eq("briefing_datum", heute).limit(1).maybeSingle();
      if (existing?.id) {
        return jsonResponse({
          ok: true,
          briefing_id: existing.id,
          info: "Briefing fuer heute existiert bereits. Nutze {force: true} zum Ueberschreiben.",
        });
      }
    }

    // ---- 1. RSS-Feeds parallel abrufen ----
    const fetchResults = await Promise.allSettled(
      FEEDS.map(async (feed) => {
        try {
          console.log(`Fetching ${feed.name} (${feed.url})`);
          const resp = await fetch(feed.url, {
            headers: {
              "Accept": "application/rss+xml, application/xml, text/xml, */*",
              "User-Agent": "Mozilla/5.0 (compatible; ImmoOffice/1.0; +https://immooffice.example)",
            },
          });
          console.log(`${feed.name}: HTTP ${resp.status}, Content-Type: ${resp.headers.get("content-type")}`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status} fuer ${feed.url}`);
          const xml = await resp.text();
          console.log(`${feed.name}: XML-Laenge ${xml.length} Zeichen, erste 200: ${xml.slice(0, 200)}`);
          const artikel = parseRSS(xml, feed.name);
          console.log(`${feed.name}: ${artikel.length} Artikel geparst`);
          return { feed, artikel };
        } catch (e) {
          console.warn(`Feed-Fehler ${feed.name}:`, e instanceof Error ? e.message : String(e));
          return { feed, artikel: [] as NewsArtikel[], error: e instanceof Error ? e.message : String(e) };
        }
      })
    );

    const alleArtikel: NewsArtikel[] = [];
    const quellenInfo: { name: string; url: string; anzahl: number; error?: string }[] = [];

    for (const r of fetchResults) {
      if (r.status === "fulfilled") {
        // Erst mit 48h-Filter, falls leer dann ohne Filter (immer was haben)
        const recent = r.value.artikel.filter(a => istAusLetzten48Stunden(a.pub_datum));
        const verwende = recent.length > 0 ? recent : r.value.artikel;
        // Max 15 Artikel pro Feed um den Prompt klein zu halten
        const begrenzt = verwende.slice(0, 15);
        alleArtikel.push(...begrenzt);
        quellenInfo.push({
          name: r.value.feed.name,
          url: r.value.feed.url,
          anzahl: begrenzt.length,
          error: (r.value as any).error,
        });
        console.log(`[${r.value.feed.name}] roh: ${r.value.artikel.length}, nach 48h-Filter: ${recent.length}, genommen: ${begrenzt.length}`);
      } else {
        console.error("Fetch fehlgeschlagen:", r.reason);
      }
    }

    if (alleArtikel.length === 0) {
      throw new Error(`Keine Artikel aus RSS-Feeds bekommen. Quellen: ${JSON.stringify(quellenInfo)}`);
    }

    // ---- 2. Claude um Briefing bitten ----
    const datumDeutsch = new Date(heute).toLocaleDateString("de-DE", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const artikelText = alleArtikel.map((a, i) =>
      `[${i + 1}] Quelle: ${a.quelle}\nTitel: ${a.titel}\nBeschreibung: ${a.beschreibung}\nLink: ${a.link}`
    ).join("\n\n");

    const systemPrompt = `Du bist Redakteur fuer ein kurzes Branchen-Briefing fuer Immobilienmakler in Norddeutschland.
Aus den uebergebenen Nachrichten erstellst du ein knappes, sachliches Tagesbriefing:

- 5 bis 8 Themen, sortiert nach Wichtigkeit fuer einen Makler im Tagesgeschaeft
- Jedes Thema: max. 2-3 Saetze, eigene Worte (KEIN Zitieren!), neutral
- Themen-Schwerpunkt: Markt, Zinsen, Recht/Gesetzgebung, Maklerprovision, neue Regelungen
- Irrelevant: Grossinvestoren-Quartalszahlen, internationale Maerkte, Vonovia-Aktienkurse
- Format: Markdown mit "## Ueberschrift" pro Thema und Quelle in Klammern dahinter wie "(Haufe Immobilien)"
- Am Ende ein kurzer 1-Satz "Was ich heute beachten wuerde:"-Hinweis

Wenn keine wirklich relevanten Themen dabei sind: schreib trotzdem ein knappes Briefing mit den interessantesten 3-4 Themen.`;

    const userPrompt = `Datum: ${datumDeutsch}

Nachrichten der letzten 48 Stunden:

${artikelText}

Erstelle das Tagesbriefing.`;

    const modell = "claude-sonnet-4-5";

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modell,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      throw new Error(`Anthropic-Fehler: ${anthropicResp.status} ${errText}`);
    }

    const anthropicData = await anthropicResp.json();
    const briefingText = anthropicData.content?.[0]?.text || "";

    if (!briefingText) {
      throw new Error("Anthropic gab keinen Text zurueck.");
    }

    // ---- 3. Strukturierte Themen aus dem Markdown extrahieren ----
    const themen: { titel: string; text: string }[] = [];
    const themenRegex = /##\s+(.+?)\n([^#]+)/g;
    let tm;
    while ((tm = themenRegex.exec(briefingText)) !== null) {
      themen.push({
        titel: tm[1].trim(),
        text: tm[2].trim(),
      });
    }

    // ---- 4. Speichern (upsert auf briefing_datum) ----
    const { data: briefing, error: insErr } = await admin
      .from("news_briefings")
      .upsert(((await admin.from("mandanten").select("id")).data || []).map((m: any) => ({
        mandant_id: m.id,
        briefing_datum: heute,
        zusammenfassung: briefingText,
        themen,
        quellen: alleArtikel.map(a => ({
          quelle: a.quelle,
          titel: a.titel,
          link: a.link,
          pub_datum: a.pub_datum,
        })),
        anzahl_artikel: alleArtikel.length,
        modell,
      })), { onConflict: "mandant_id,briefing_datum" })
      .select()
      .single();

    if (insErr) throw insErr;

    return jsonResponse({
      ok: true,
      briefing_id: briefing.id,
      anzahl_artikel: alleArtikel.length,
      anzahl_themen: themen.length,
      quellen: quellenInfo,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("news-briefing-erstellen:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}