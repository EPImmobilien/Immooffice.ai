// Supabase Edge Function: generate-text
// Erzeugt Exposé-Texte mit Claude (Anthropic) im Stil von Musterhaus Immobilien.
//
// v5.12.0: Captions: korrekte Telefonnummer 0381 36 77 99 88 (vorher stand eine falsche
//          Nummer fest im Prompt); Verbot, Kontaktdaten zu erfinden; fester KI-Hinweis
//          wird an alle Social-Media-Captions automatisch angehaengt (vor dem Hashtag-Block).
// v5.11.0: Objekt-/Lage-/Ausstattungstexte deutlich ausfuehrlicher & verkaufsfoerdernder
//          (Ziel-Laenge nahe 2000 Zeichen, Dramaturgie-Vorgaben, Nutzen-Argumentation);
//          Modell auf claude-sonnet-4-6.
// v5.10.0: Bildanalyse-Stil entschaerft - Bilder belegen Qualitaeten statt sie zu beschreiben.
// v5.9.14: news_caption ausfuehrlicher (mehr Erklaerung/Einordnung, 900-1300 Zeichen).
// v5.9.13: textart "news_kernpunkte".
// v5.9.12: textart "news_caption".
// v5.9.11: "instagram_caption" / "instagram_caption_verkauft".

import "https://deno.land/x/xhr@0.1.0/mod.ts";

interface Daten {
  objektart?: string;
  objektart_kategorie?: string;
  ort?: string;
  plz?: string;
  strasse?: string;
  wohnflaeche?: string;
  grundstueck?: string;
  zimmer?: string;
  baujahr?: string;
  kaufpreis?: string;
  heizungsart?: string;
  heizungsart_sonstige?: string;
  heizungsbaujahr?: string;
  fensterart_verglasung?: string;
  fensterart_material?: string;
  fensterbaujahr?: string;
  ausstattungsliste?: string[];
  ausstattung_freitext?: string;
  besonderheiten?: string;
  titel_basis?: string;
  energieart?: string;
  energiekennwert?: string;
  energietraeger?: string;
  energieklasse?: string;
  energieausweisGueltig?: string;
  dist_kindergarten?: string;
  dist_grundschule?: string;
  dist_realschule?: string;
  dist_gymnasium?: string;
  dist_autobahn?: string;
  dist_zentrum?: string;
  dist_einkaufen?: string;
  dist_flughafen?: string;
  dist_bus?: string;
  headline?: string;
  eckdaten?: Record<string, string>;
  mitHashtags?: boolean;
}

interface BildEingabe {
  data: string;
  media_type: string;
}

interface RequestBody {
  textart: "objekt" | "lage" | "ausstattung" | "bulletpoints" | "titel" | "headline" | "energie" | "instagram_caption" | "instagram_caption_verkauft" | "news_caption" | "news_kernpunkte";
  daten: Daten;
  kuerzer?: boolean;
  bilder?: BildEingabe[];
  zusatz_anweisung?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------
// Offizielle Kontaktdaten & KI-Kennzeichnung fuer Social-Media-Captions.
// EINZIGE zulaessige Quelle fuer Telefon/E-Mail in Captions - die Nummer
// stammt aus Website/Impressum immooffice.example.
// ---------------------------------------------------------------
const KONTAKT_EMAIL = "info@immooffice.example";
const KONTAKT_TELEFON = "0381 36 77 99 88";
const KI_HINWEIS = "Hinweis: Dieser Beitrag wurde mit KI-Unterstützung erstellt.";

// Haengt den KI-Hinweis an eine Caption an - vor einem evtl. vorhandenen
// Hashtag-Block am Ende, sonst ganz ans Ende. Idempotent (haengt nichts
// doppelt an, falls das Modell doch selbst einen Hinweis formuliert hat).
function kiHinweisEinfuegen(t: string): string {
  if (!t || t.includes("KI-Unterstützung")) return t;
  const lines = t.trimEnd().split("\n");
  let idx = lines.length;
  while (idx > 0) {
    const l = lines[idx - 1].trim();
    if (l === "" || l.startsWith("#")) idx--;
    else break;
  }
  if (idx < lines.length) {
    const vor = lines.slice(0, idx).join("\n").trimEnd();
    const hashtags = lines.slice(idx).join("\n").trim();
    return (vor ? `${vor}\n\n` : "") + `${KI_HINWEIS}\n\n${hashtags}`;
  }
  return `${lines.join("\n")}\n\n${KI_HINWEIS}`;
}

const STIL_BEISPIELE: Record<string, { objekt: string[]; lage: string[] }> = {
  haus: {
    objekt: [
      `Dieser liebevoll gepflegte und vollständig möblierte Bungalow befindet sich in idyllischer Naturlage in Dobbertin, nur wenige Gehminuten vom Dobbertiner See entfernt. Das ca. 354 m² große Eigentumsgrundstück liegt ruhig am Ende einer kleinen Sackgasse innerhalb einer gewachsenen Bungalowsiedlung und bietet ein hohes Maß an Privatsphäre. Der Bungalow verfügt über ca. 39 m² Wohnfläche, verteilt auf zwei Zimmer und wird durch eine sonnige, teilweise überdachte Terrasse in Südlage ergänzt. Das ursprünglich ca. 1974 errichtete Gebäude wurde ab 2015 umfassend energetisch saniert und in den Folgejahren fortlaufend modernisiert.`,
    ],
    lage: [
      `Die Immobilie befindet sich in ruhiger und naturnaher Lage in Dobbertin im Landkreis Ludwigslust-Parchim. Der Ort liegt mitten im Naturpark Nossentiner/Schwinzer Heide. Schwerin liegt rund 55 km entfernt, die Hansestadt Rostock etwa 70 km.`,
    ],
  },
  wohnung: { objekt: [], lage: [] },
  gewerbe: { objekt: [], lage: [] },
  grundstueck: { objekt: [], lage: [] },
};

const STIL_BULLETPOINTS_BEISPIELE = [
  `- Duschbad mit Fußbodenheizung\n- Einbauküche von Alno\n- überdachte Terrasse\n- Kaminofen\n- Parkplatz\n- Glasfaseranschluss\n- Eigentumsland\n- Modernisierung ab 2015`,
  `- Fußbodenheizung im EG\n- Elektr. Rollläden\n- Bad OG modern (ca. 5–6 J.)\n- Bad EG teilmodernisiert\n- Sauna\n- Glasfaser angeschlossen\n- Gute Raumaufteilung\n- Sehr gepflegter Zustand`,
];

function beispieleFuer(kategorie: string | undefined, art: "objekt" | "lage"): string[] {
  const kat = (kategorie && STIL_BEISPIELE[kategorie]) ? kategorie : "haus";
  const eigene = STIL_BEISPIELE[kat]?.[art] || [];
  if (eigene.length >= 2 || kat === "haus") return eigene;
  const haus = STIL_BEISPIELE.haus[art].slice(0, 2);
  return [...eigene, ...haus];
}

const STIL_REGELN = `Musterhaus-Stilrichtlinien (immer einhalten):
- Sachlich-warm, nie marktschreierisch. Keine Werbe-Floskeln.
- Fakten zuerst, Atmosphäre danach. Konkrete Zahlen statt vager Aussagen.
- Jahreszahlen konkret nennen.
- Vollständige Sätze, kein Stichworttext.
- Keine Markdown-Formatierung, keine Überschriften.
- KEIN Bild-Beschreibungsstil: Der Text darf nicht klingen wie eine Beschreibung von Fotos. Niemals aufzaehlen, was "zu sehen" ist, und keine Formulierungen wie "man sieht", "auf dem Bild", "erkennbar", "sichtbar", "zeigt sich", "praesentiert sich mit". Stattdessen die Immobilie selbst beschreiben, als stuende der Texter vor Ort.`;

function objektartBeschriftung(kat?: string): string {
  switch (kat) {
    case "haus":        return "Haus";
    case "wohnung":     return "Eigentumswohnung";
    case "grundstueck": return "Grundstück";
    case "gewerbe":     return "Gewerbeobjekt";
    default:            return "Immobilie";
  }
}

function fensterTextZusammenbauen(d: Daten): string {
  const teile: string[] = [];
  if (d.fensterart_verglasung) teile.push(`${d.fensterart_verglasung}verglasung`);
  if (d.fensterart_material)   teile.push(d.fensterart_material);
  return teile.join(", ");
}

function heizungTextZusammenbauen(d: Daten): string {
  if (d.heizungsart === "Sonstige" && d.heizungsart_sonstige) return d.heizungsart_sonstige;
  return d.heizungsart || "";
}

function ausstattungZusammenbauen(d: Daten): string {
  const teile: string[] = [];
  if (d.ausstattungsliste && d.ausstattungsliste.length > 0) teile.push(...d.ausstattungsliste);
  if (d.ausstattung_freitext) teile.push(d.ausstattung_freitext);
  return teile.join(", ");
}

function datenAufzaehlen(d: Daten): string {
  const lines: string[] = [];
  lines.push(`- Objektkategorie: ${objektartBeschriftung(d.objektart_kategorie)}`);
  if (d.objektart)         lines.push(`- Objektart (Detail): ${d.objektart}`);
  if (d.ort)               lines.push(`- Ort: ${d.ort}`);
  if (d.plz)               lines.push(`- PLZ: ${d.plz}`);
  if (d.strasse)           lines.push(`- Adresse: ${d.strasse}`);
  if (d.wohnflaeche)       lines.push(`- Wohnfläche: ca. ${d.wohnflaeche} m²`);
  if (d.grundstueck)       lines.push(`- Grundstück: ca. ${d.grundstueck} m²`);
  if (d.zimmer)            lines.push(`- Zimmer: ${d.zimmer}`);
  if (d.baujahr)           lines.push(`- Baujahr: ${d.baujahr}`);
  if (d.kaufpreis)         lines.push(`- Kaufpreis: ${d.kaufpreis} €`);
  const heizung = heizungTextZusammenbauen(d);
  if (heizung)             lines.push(`- Heizungsart: ${heizung}`);
  if (d.heizungsbaujahr)   lines.push(`- Heizung Baujahr: ${d.heizungsbaujahr}`);
  const fenster = fensterTextZusammenbauen(d);
  if (fenster)             lines.push(`- Fenster: ${fenster}`);
  if (d.fensterbaujahr)    lines.push(`- Fenster Baujahr: ${d.fensterbaujahr}`);
  const ausstattung = ausstattungZusammenbauen(d);
  if (ausstattung)         lines.push(`- Ausstattung: ${ausstattung}`);
  if (d.besonderheiten)    lines.push(`- Besonderheiten: ${d.besonderheiten}`);
  return lines.join("\n");
}

function buildPrompt(body: RequestBody): { system: string; user: string } {
  const { textart, daten, kuerzer } = body;

  // -------------------------------------------------------------
  // News-Kernpunkte: 3 praegnante Kernaussagen als JSON-Array.
  // -------------------------------------------------------------
  if (textart === "news_kernpunkte") {
    const titel = (daten.headline || "").toString().trim();
    const inhalt = (daten.besonderheiten || "").toString().trim();
    return {
      system: `Du bist Redakteur für Musterhaus Immobilien GmbH. Aus einer Branchen-Nachricht destillierst du die wichtigsten KERNAUSSAGEN fuer eine Social-Media-Kachel.

REGELN:
- Genau 3 Kernaussagen.
- Jede Kernaussage ist EIN knapper, aussagekraeftiger Satz oder eine Phrase (max. ca. 90 Zeichen).
- Konkret und informativ – die wichtigste Information transportieren, nicht nur das Thema benennen. Beispiel schlecht: "Es gibt eine Reform." Beispiel gut: "Reform der Erbschaftsteuer koennte hoehere Bewertungen bringen."
- Sachlich, neutral, kein Marketing, keine Emojis, kein abschliessender Punkt noetig.
- Nichts erfinden, was nicht aus Titel/Text hervorgeht. Keine konkreten Zahlen dazudichten.
- Deutsch.

Antworte AUSSCHLIESSLICH mit einem JSON-Array aus genau 3 Strings, ohne Markdown, ohne Code-Fence, ohne Vorwort. Beispiel:
["Erste Kernaussage", "Zweite Kernaussage", "Dritte Kernaussage"]`,
      user: `Schlagzeile: ${titel || "(keine)"}\n\nText/Kontext:\n${inhalt || "(kein Text)"}\n\nGib die 3 Kernaussagen als JSON-Array zurück.`
    };
  }

  // -------------------------------------------------------------
  // News-Caption (ausfuehrlich): erklaert die Nachricht verstaendlich,
  // ordnet sie fuer Eigentuemer/Verkaeufer ein und laedt zum Gespraech ein.
  // Greift den Kachel-Inhalt auf ("Mehr dazu") und vertieft ihn.
  // -------------------------------------------------------------
  if (textart === "news_caption") {
    const mitHashtags = !!daten.mitHashtags;
    const titel = (daten.headline || "").toString().trim();
    const inhalt = (daten.besonderheiten || "").toString().trim();
    const quelle = (daten.ort || "").toString().trim();

    const hashtagsBlock = mitHashtags
      ? `\n8. Leerzeile, dann 6–10 passende Hashtags. Mix aus:\n   - Branche/Thema: #immobilien #immobilienmarkt #immobilienwissen + 1–2 zum konkreten Thema\n   - Regional/Marke: #engferundpartner #rostock #mecklenburgvorpommern #makler`
      : `\n\nKEINE Hashtags am Ende – lass den Hashtag-Block komplett weg.`;

    return {
      system: `Du bist Social-Media-Texter für Musterhaus Immobilien GmbH aus Rostock. Du schreibst eine AUSFÜHRLICHE, gut erklärende Instagram-Caption zu einer BRANCHEN-NACHRICHT (kein Objekt-Inserat).

KONTEXT: Auf der zugehörigen Bild-Kachel stehen nur 3 kurze Kernaussagen plus der Hinweis "Mehr dazu in der Caption". Die Caption ist also der Ort, an dem das Thema WIRKLICH erklärt und eingeordnet wird – sie muss die Stichpunkte mit Substanz füllen, nicht nur wiederholen.

ZIEL: Die Nachricht verständlich erklären und konkret einordnen – als hilfreicher, fundierter Hinweis für Eigentümer, Verkäufer und Interessenten. Musterhaus Immobilien positioniert sich als kompetenter, zugänglicher Ansprechpartner.

WICHTIG:
- KEINE Immobilie bewerben, KEIN "Neu im Angebot".
- Keine Rechts- oder Steuerberatung behaupten – allgemein einordnen und Gespräch anbieten ("Im Einzelfall lohnt sich ein Gespräch").
- Nichts erfinden, was nicht aus Titel/Text hervorgeht. Keine konkreten Zahlen/Fristen dazudichten.
- KONTAKTDATEN STRIKT: Verwende AUSSCHLIESSLICH die in der Struktur unten angegebene E-Mail-Adresse und Telefonnummer. Erfinde NIEMALS andere Telefonnummern, E-Mail-Adressen oder Webadressen.
- Füge selbst KEINEN Hinweis auf KI-Erstellung an – dieser wird nach der Generierung automatisch ergänzt.
- Neutral formulieren; direkte Sie-Anrede in der Einordnung und der Schluss-Einladung erlaubt.

STIL:
- Deutsch, sachlich-warm, seriös, gut lesbar. Sparsame Emojis als Zeilenanker (📰 🏡 💡 📌 ➡️ 📩).
- Länge: 900–1300 Zeichen ohne Hashtags (deutlich ausführlicher als eine Kurz-Caption).
- In kurze Sinnabschnitte gliedern (Leerzeilen), damit es auf Instagram gut lesbar ist.

STRUKTUR:
1. Opener-Zeile mit 📰 und einem konkreten Aufhänger zum Thema.
2. Leerzeile.
3. Hauptteil: 3–5 Sätze, die die Nachricht in eigenen Worten ERKLÄREN – Hintergrund, worum es geht, was sich (möglicherweise) ändert. Hier ruhig ins Detail gehen, soweit Titel/Text es hergeben.
4. Leerzeile.
5. Abschnitt "Was bedeutet das für Sie?" (ohne diese Überschrift wörtlich, aber sinngemäß): 2–4 Sätze konkrete Einordnung für Eigentümer/Verkäufer in MV/Norddeutschland – worauf man achten sollte, warum es relevant ist.
6. Leerzeile.
7. Einladung zum Gespräch: freundlich, ohne Druck (z.B. "Sie sind unsicher, was das für Ihre Immobilie bedeutet? Sprechen Sie uns gern an – wir ordnen es gemeinsam ein.") + Kontakt:\n   📩 ${KONTAKT_EMAIL}\n   📞 ${KONTAKT_TELEFON}${hashtagsBlock}

Du bekommst:
- Schlagzeile: ${titel || "(keine)"}
- Inhalt/Kontext: ${inhalt || "(kein Text)"}
- Quelle: ${quelle || "(unbekannt)"}

Antworte AUSSCHLIESSLICH mit der fertigen Caption – kein Vorwort, kein Markdown, keine Anführungszeichen drumherum.`,
      user: `Bitte generiere die ausführliche News-Instagram-Caption zur obigen Schlagzeile. Erkläre das Thema verständlich und ordne es für Immobilieneigentümer ein.`
    };
  }

  // -------------------------------------------------------------
  // Instagram-Caption VERKAUFT
  // -------------------------------------------------------------
  if (textart === "instagram_caption_verkauft") {
    const mitHashtags = !!daten.mitHashtags;
    const ort = (daten.ort || "").toString().trim();
    const eckdatenObj = daten.eckdaten || {};
    const eckdatenText = Object.entries(eckdatenObj)
      .filter(([_, v]) => v && String(v).trim() !== "")
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const hatBilder = !!(body.bilder && body.bilder.length > 0);

    const hashtagsBlock = mitHashtags
      ? `\n7. Leerzeile, dann 8–12 passende Hashtags. Mix aus:\n   - Verkauft: #verkauft #immobilieverkauft #happyowners #neueheimat\n   - Branche: #immobilien #makler #immobilienmakler\n   - Regional: #engferundpartner #rostock #mecklenburgvorpommern #ostsee`
      : `\n\nKEINE Hashtags am Ende.`;

    const bilderHinweis = hatBilder
      ? `\n\nWICHTIG: Es ist ein Foto der verkauften Immobilie beigefügt. Du kannst kurz darauf Bezug nehmen, aber bewirb die Immobilie nicht.`
      : `\n\nKein Foto beigefügt - das ist okay.`;

    return {
      system: `Du bist Social-Media-Texter für Musterhaus Immobilien GmbH aus Rostock. Du schreibst eine Instagram-Caption für eine VERKAUFTE Immobilie.

WICHTIG - KEINE Verkaufsanzeige:
- Immobilie ist VERKAUFT
- Glückwunsch an neue Eigentümer + Dank an Verkäufer
- Subtile Akquise am Ende
- Kontaktdaten STRIKT: NUR die in der Struktur genannte E-Mail und Telefonnummer verwenden – NIEMALS andere Nummern oder Adressen erfinden
- KEINEN eigenen KI-Hinweis anfügen – der wird automatisch ergänzt

STIL: Deutsch, neutral, Emojis am Zeilenanfang (🎉 🏡 ✨ 🤝 📍 📩 🙏). 500–800 Zeichen ohne Hashtags. Herzlich.

STRUKTUR:
1. 🎉 VERKAUFT + Ortsbezug
2. Leerzeile
3. Freude-Botschaft (1–2 Sätze)
4. Leerzeile
5. (Optional) Eckdaten
6. Leerzeile
7. Glückwunsch + Dank
8. Leerzeile
9. Akquise-Zeile
10. Kontakt: 📩 ${KONTAKT_EMAIL}  📞 ${KONTAKT_TELEFON}${hashtagsBlock}

Daten:
- Ort: ${ort || "(unbekannt)"}
- Eckdaten:\n${eckdatenText || "(keine)"}${bilderHinweis}

Antworte AUSSCHLIESSLICH mit der fertigen Caption.`,
      user: `Bitte generiere die VERKAUFT-Instagram-Caption.`
    };
  }

  // -------------------------------------------------------------
  // Instagram-Caption (Neu-Angebot)
  // -------------------------------------------------------------
  if (textart === "instagram_caption") {
    const mitHashtags = !!daten.mitHashtags;
    const objektart = daten.objektart || "Immobilie";
    const headline = (daten.headline || "").toString().trim();
    const ort = (daten.ort || "").toString().trim();
    const eckdatenObj = daten.eckdaten || {};
    const eckdatenText = Object.entries(eckdatenObj)
      .filter(([_, v]) => v && String(v).trim() !== "")
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const hatBilder = !!(body.bilder && body.bilder.length > 0);

    const hashtagsBlock = mitHashtags
      ? `\n7. Leerzeile, dann 8–12 passende Hashtags. Mix aus:\n   - Branche: #immobilien #makler #immobilienmakler #traumimmobilie\n   - Regional: #engferundpartner #rostock #mecklenburgvorpommern #ostsee\n   - Objekt-spezifisch: 1–2 Hashtags`
      : `\n\nKEINE Hashtags am Ende.`;

    const bilderHinweis = hatBilder
      ? `\n\nWICHTIG: Foto beigefügt. Leite 2–3 konkrete Highlights ab. Übertreibe nicht.`
      : `\n\nKein Foto. Highlights aus Eckdaten ableiten.`;

    return {
      system: `Du bist Social-Media-Texter für Musterhaus Immobilien GmbH aus Rostock. Instagram-Captions im lockeren Stil mit Emojis.

REGELN:
- Deutsch, neutral. Emojis am Zeilenanfang (🏡 ✨ 📍 📐 🛏️ 📩). 600–900 Zeichen ohne Hashtags.
- Nur Fakten aus Eckdaten/Bild. Keine Energieausweis-Pflichtangaben. CTA am Ende.
- Kontaktdaten NIEMALS erfinden (keine Telefonnummern, E-Mail- oder Webadressen ausdenken). Falls Kontaktdaten genannt werden, AUSSCHLIESSLICH: 📩 ${KONTAKT_EMAIL} bzw. 📞 ${KONTAKT_TELEFON}.
- KEINEN eigenen KI-Hinweis anfügen – der wird automatisch ergänzt.

STRUKTUR:
1. 🏡 Opener mit Ortsbezug
2. Leerzeile
3. Charakter (1–2 Sätze)
4. Leerzeile
5. ✨ Highlights: GENAU 3 Bulletpoints (•)
6. Leerzeile, 2–3 Zeilen Eckdaten in Emoji-Format
7. Leerzeile
8. CTA
9. 📩 DM oder Link in Bio${hashtagsBlock}

Daten:
- Objektart: ${objektart}
- Headline: ${headline || "(keine)"}
- Ort: ${ort || "(unbekannt)"}
- Eckdaten:\n${eckdatenText || "(keine)"}${bilderHinweis}

Antworte AUSSCHLIESSLICH mit der fertigen Caption.`,
      user: `Bitte generiere die Instagram-Caption${hatBilder ? " - schau dir das Foto an" : ""}.`
    };
  }

  // -------------------------------------------------------------
  // Energieausweis
  // -------------------------------------------------------------
  if (textart === "energie") {
    const lines: string[] = [];
    if (daten.energieart)            lines.push(`- Ausweisart: ${daten.energieart}sausweis`);
    if (daten.energiekennwert)       lines.push(`- Endenergiekennwert: ${daten.energiekennwert} kWh/(m²·a)`);
    if (daten.energietraeger)        lines.push(`- Wesentlicher Energieträger: ${daten.energietraeger}`);
    if (daten.energieklasse)         lines.push(`- Energieeffizienzklasse: ${daten.energieklasse}`);
    if (daten.baujahr)               lines.push(`- Baujahr laut Energieausweis: ${daten.baujahr}`);
    if (daten.energieausweisGueltig) lines.push(`- Ausweis gültig bis: ${daten.energieausweisGueltig}`);
    const eckdaten = lines.join("\n");
    return {
      system: "Du erstellst rechtskonforme Pflichttexte für Immobilieninserate nach dem Gebäudeenergiegesetz (GEG). Halte dich exakt an die gesetzlichen Vorgaben. Knapp, sachlich, vollständig. Keine Werbesprache.",
      user: `Erstelle den Pflicht-Hinweistext zum Energieausweis nach GEG § 87.\n\nEckdaten:\n${eckdaten}\n\nFormat: ein Absatz, maximal 4 Sätze. Falls Angaben fehlen, Hinweis 'Weitere Angaben werden auf Nachfrage ergänzt.'`
    };
  }

  // -------------------------------------------------------------
  // Titel
  // -------------------------------------------------------------
  if (textart === "titel") {
    const hatBasis = daten.titel_basis && daten.titel_basis.trim().length > 0;
    const eckdatenKurz: string[] = [];
    if (daten.objektart) eckdatenKurz.push(`Objektart: ${daten.objektart}`);
    if (daten.ort)       eckdatenKurz.push(`Ort: ${daten.ort}`);
    const eckdatenZeile = eckdatenKurz.length > 0 ? `\nZusaetzlicher Kontext: ${eckdatenKurz.join(", ")}\n` : "";
    const userMsg = hatBasis
      ? `Erstelle EINEN Objekttitel im Musterhaus-Stil.\n\nZiehe die ansprechendsten 2-3 Merkmale heraus. Erfinde nichts dazu.\n\nObjektbeschreibung:\n${daten.titel_basis}\n${eckdatenZeile}\nFormat: Nur der Titel, eine Zeile.`
      : `Erstelle EINEN Objekttitel im Musterhaus-Stil.\n\nEckdaten:\n${datenAufzaehlen(daten)}\n\nFormat: Nur der Titel, eine Zeile.`;
    return {
      system: `Du bist Texter für Musterhaus Immobilien in Mecklenburg-Vorpommern.\n\n${STIL_REGELN}\n\nObjekttitel im Musterhaus-Stil: energisch, konkret. Adjektiv-Hook am Anfang, Phrasen mit Gedankenstrich/Ausrufezeichen, konkrete Vorzüge, Lage als Verkaufsargument. 60-110 Zeichen. Kein Punkt am Ende.`,
      user: userMsg
    };
  }

  // -------------------------------------------------------------
  // Schlagzeile
  // -------------------------------------------------------------
  if (textart === "headline") {
    return {
      system: `Du bist Texter für Musterhaus Immobilien. Kurze, einprägsame Schlagzeilen. ${STIL_REGELN}`,
      user: `Erstelle 5 Vorschläge für eine Schlagzeile (max. 10 Wörter) für folgendes Objekt:\n\n${datenAufzaehlen(daten)}\n\nFormat: nummerierte Liste 1. bis 5.`
    };
  }

  // -------------------------------------------------------------
  // Bulletpoints
  // -------------------------------------------------------------
  if (textart === "bulletpoints") {
    const beispieleText = STIL_BULLETPOINTS_BEISPIELE.map((b, i) => `Beispiel ${i + 1}:\n${b}`).join("\n\n");
    const klickChips = (daten.ausstattungsliste && daten.ausstattungsliste.length > 0) ? daten.ausstattungsliste.join("\n- ") : "";
    const pflichtBlockBullets = klickChips ? `\n\nFOLGENDE MERKMALE MUESSEN ALLE vorkommen:\n- ${klickChips}` : "";
    return {
      system: `Du bist Texter für Musterhaus Immobilien. Kompakte Ausstattungs-Bulletpoints. Knapp, klar. Jeder Punkt 2–6 Wörter.\n\n${STIL_REGELN}\n\nBeispiele:\n\n${beispieleText}`,
      user: `Erstelle eine Bulletpoint-Liste der Ausstattung.\n\nEckdaten:\n${datenAufzaehlen(daten)}\n\nFreitext: ${daten.ausstattung_freitext || "(keine Angabe)"}${pflichtBlockBullets}\n\nFormat: jeder Bulletpoint beginnt mit \"- \".`
    };
  }

  // -------------------------------------------------------------
  // Objekt / Lage / Ausstattung
  // -------------------------------------------------------------
  const textartLabel: Record<string, string> = {
    objekt: "Objektbeschreibung", lage: "Lagebeschreibung", ausstattung: "Ausstattungsbeschreibung",
  };
  const fokus: Record<string, string> = {
    objekt: `Beschreibe das Objekt AUSFÜHRLICH und mit rotem Faden:
1) Einstieg mit dem stärksten Verkaufsargument dieser Immobilie (2 Sätze, konkret).
2) Gebäude & Historie: Bauart, Baujahr, Sanierungen/Modernisierungen mit Jahreszahlen.
3) Rundgang durch die Aufteilung (z. B. Erdgeschoss → Obergeschoss): Räume, Raumgefühl, Licht.
4) Bautechnik: Heizung, Fenster, Dach, Anschlüsse (Glasfaser etc.) — mit Baujahren, sofern bekannt.
5) Außenbereich & Grundstück: Terrasse/Balkon, Garten, Stellplätze, Privatsphäre.
6) Abschluss: ein Satz Ausblick, der Lust auf die Besichtigung macht (subtil, keine Kontaktdaten).
Punkte ohne Datenbasis überspringen — NIE etwas erfinden.`,
    lage: `Beschreibe die Lage AUSFÜHRLICH in vier Ebenen:
1) Mikrolage: Straße/Quartier, Charakter der Nachbarschaft, Ruhe oder Belebtheit.
2) Versorgung & Alltag: Einkaufen, Kitas/Schulen, Ärzte — mit konkreten km-Angaben, sofern vorhanden.
3) Freizeit & Natur: Wasser, Wald, Parks, typische Stärken der Region (z. B. Ostseenähe, Seenlandschaft).
4) Anbindung & Makrolage: Autobahn, Bahn/Bus, nächste Städte mit km-Angaben.
Zum Schluss ein Satz, für wen diese Lage ideal ist (Familien, Pendler, Kapitalanleger, Ruhesuchende …).
Erfinde KEINE Entfernungen — ohne Angabe qualitativ bleiben ("in wenigen Minuten erreichbar").`,
    ausstattung: `Beschreibe die Ausstattung im Detail und thematisch gruppiert (Küche & Bäder, Böden & Oberflächen, Technik & Energie, Komfort & Außenbereich). Verknüpfe jedes Merkmal mit seinem konkreten Nutzen im Alltag.`,
  };

  const verkaufsBlock = `

Verkaufswirkung (wichtig):
- Verbinde Fakten mit ihrem NUTZEN für Käufer bzw. Bewohner ("Was habe ich davon?"): Südterrasse → Abendsonne, Glasfaser → Homeoffice, sanierte Heizung → planbare Energiekosten, Sackgasse → sicheres Spielen für Kinder.
- Konkret statt pauschal: Jahreszahlen, Flächen, Entfernungen nennen. Verbotene Floskeln: "Traumhaus", "einmalige Gelegenheit", "Liebhaberobjekt", "hier lässt es sich leben".
- Dramaturgie: das stärkste Argument in die ersten zwei Sätze, dann strukturiert vertiefen, am Ende ein Satz Ausblick — ohne Kontaktdaten und ohne "Vereinbaren Sie einen Termin"-Floskel.
- Der Text soll verkaufen, ohne zu übertreiben: seriöse Begeisterung statt Marktschreierei.`;

  const pflichtangaben: string[] = [];
  if (textart === "objekt" || textart === "ausstattung") {
    const heizung = heizungTextZusammenbauen(daten);
    if (heizung && daten.heizungsbaujahr) pflichtangaben.push(`Heizung: ${heizung} (Baujahr ${daten.heizungsbaujahr})`);
    else if (heizung) pflichtangaben.push(`Heizung: ${heizung}`);
    const fenster = fensterTextZusammenbauen(daten);
    if (fenster && daten.fensterbaujahr) pflichtangaben.push(`Fenster: ${fenster} (Baujahr ${daten.fensterbaujahr})`);
    else if (fenster) pflichtangaben.push(`Fenster: ${fenster}`);
    if (daten.wohnflaeche) pflichtangaben.push(`Wohnfläche: ca. ${daten.wohnflaeche} m²`);
    if (daten.grundstueck) pflichtangaben.push(`Grundstück: ca. ${daten.grundstueck} m²`);
    if (daten.baujahr)     pflichtangaben.push(`Baujahr: ${daten.baujahr}`);
    if (daten.ausstattungsliste && daten.ausstattungsliste.length > 0) {
      for (const a of daten.ausstattungsliste) pflichtangaben.push(`Ausstattung: ${a}`);
    }
  }
  const pflichtBlock = pflichtangaben.length > 0
    ? `\n\nFOLGENDE ANGABEN MUESSEN IM TEXT VORKOMMEN:\n${pflichtangaben.map(p => `- ${p}`).join("\n")}`
    : "";

  let beispieleBlock = "";
  if (textart === "objekt" || textart === "lage") {
    const beispiele = beispieleFuer(daten.objektart_kategorie, textart);
    if (beispiele.length > 0) {
      beispieleBlock = `\n\nStilvorbild${beispiele.length === 1 ? "" : "er"}:\n\n${beispiele.map((b, i) => `--- Beispiel ${i + 1} ---\n${b}`).join("\n\n")}\n\nÜbernimm Tonalität und Struktur. Kopiere keine Sätze wörtlich.`;
    }
  }

  const hatBilder = (body.bilder && body.bilder.length > 0) && textart === "objekt";
  const bilderBlock = hatBilder
    ? `\n\nFOTOS ALS BELEG, NICHT ALS THEMA: ${body.bilder!.length} Foto(s) sind beigefügt. Nutze sie NUR, um verkaufsrelevante Qualitäten der Immobilie zu bestätigen oder zu konkretisieren (z. B. Zustand, Lichtverhältnisse, Materialien, Aufteilung) – und arbeite diese als Eigenschaften der Immobilie in den Fließtext ein. Der Leser darf NICHT merken, dass Fotos die Quelle waren. Verboten: die Bilder nacherzählen, Räume einzeln durchgehen, Aufzählungen von Sichtbarem, Wörter wie "zu sehen", "auf dem Foto", "erkennbar", "Bild". Wenn ein Detail unsicher ist, lass es weg statt zu raten. Markiere Aussagen, die ausschließlich auf den Fotos beruhen, dezent mit <bild>...</bild> (für die interne Pruefung) – aber so, dass der Satz auch ohne die Markierung natürlich klingt.`
    : "";

  const laengeHinweis = kuerzer
    ? "Ziel-Länge: 1.100–1.500 Zeichen (kompakt, aber vollständig)."
    : "Ziel-Länge: 1.700–1.950 Zeichen — nutze diesen Rahmen wirklich aus, deutlich unter 1.500 Zeichen ist zu knapp. Harte Obergrenze: 2.000 Zeichen (Portal-Limit).";

  return {
    system: `Du bist Texter für Musterhaus Immobilien in Mecklenburg-Vorpommern.\n\n${STIL_REGELN}${verkaufsBlock}\n\nZusätzlich:\n- Deutsch, vollständige Sätze, in 3–5 Sinnabsätze gegliedert (Absätze durch Leerzeile trennen, keine Überschriften).\n- Erfinde keine Fakten.\n- ${laengeHinweis}\n- Kein Markdown.${beispieleBlock}${bilderBlock}\n\nHinweis zu den Stilvorbildern: Sie zeigen TONALITÄT, nicht Länge — dein Text soll deutlich ausführlicher sein als die Beispiele.`,
    user: `Erstelle eine ${textartLabel[textart]}.\n\n${fokus[textart]}\n\nEckdaten:\n${datenAufzaehlen(daten)}${pflichtBlock}\n\nSchreibe einen flüssigen, verkaufsstarken Text – keine Bildbeschreibung – und nutze die Ziel-Länge wirklich aus.`
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY ist nicht gesetzt." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body: RequestBody = await req.json();
    if (!body || !body.textart) {
      return new Response(JSON.stringify({ error: "Ungültige Anfrage: textart fehlt." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { system, user } = buildPrompt(body);

    let userText = user;
    if (body.zusatz_anweisung && typeof body.zusatz_anweisung === "string") {
      const wunsch = body.zusatz_anweisung.trim();
      if (wunsch) {
        userText = user + "\n\n---\nWICHTIG — Bitte folgende Wünsche/Anmerkungen einarbeiten:\n" + wunsch + "\n\nFormuliere den Text entsprechend um. Erfinde keine Fakten dazu.";
      }
    }

    const erlaubteBildTextarten = ["objekt", "instagram_caption", "instagram_caption_verkauft"];
    const hatBilder = (body.bilder && body.bilder.length > 0) && erlaubteBildTextarten.includes(body.textart);
    let userContent: any;
    if (hatBilder) {
      const blocks: any[] = [];
      for (const b of body.bilder!) {
        const erlaubt = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        const mt = erlaubt.includes(b.media_type) ? b.media_type : "image/jpeg";
        blocks.push({ type: "image", source: { type: "base64", media_type: mt, data: b.data } });
      }
      blocks.push({ type: "text", text: userText });
      userContent = blocks;
    } else {
      userContent = userText;
    }

    const istCaption = body.textart === "instagram_caption" || body.textart === "instagram_caption_verkauft";
    const istNewsCaption = body.textart === "news_caption";
    const istKurz = body.textart === "news_kernpunkte";
    const max_tokens = istKurz ? 400 : (istNewsCaption ? 1200 : (istCaption ? 800 : 2400));

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("Anthropic API Fehler:", anthropicResponse.status, errText);
      return new Response(JSON.stringify({ error: `Anthropic-API: ${anthropicResponse.status} - ${errText.substring(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await anthropicResponse.json();
    const rohText = result?.content?.[0]?.text || "";
    if (!rohText) {
      return new Response(JSON.stringify({ error: "Anthropic hat keinen Text zurückgegeben." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // KI-Kennzeichnung: fuer Social-Media-Captions wird der Hinweis IMMER
    // deterministisch angehaengt (nicht dem Modell ueberlassen) - vor dem
    // Hashtag-Block, falls vorhanden.
    const kiHinweisTextarten = ["instagram_caption", "instagram_caption_verkauft", "news_caption"];
    const text = kiHinweisTextarten.includes(body.textart) ? kiHinweisEinfuegen(rohText) : rohText;

    return new Response(JSON.stringify({ text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Edge Function Fehler:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});