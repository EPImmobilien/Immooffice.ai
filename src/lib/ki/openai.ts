import { lueckenErmitteln } from "./luecken";
import { TEXTARTEN, TEXTSTILE } from "./typen";
import type { TextAnbieter, TextAuftrag, TextErgebnis } from "./typen";

/**
 * Textanbieter auf Basis der OpenAI-API.
 *
 * Bewusst ueber die HTTP-Schnittstelle statt ueber ein SDK: Der Aufruf bleibt
 * damit klein und laesst sich ohne Aenderung gegen einen EU-gehosteten
 * kompatiblen Endpunkt richten (Abschnitt 16) — es genuegt, OPENAI_BASIS_URL
 * zu setzen.
 */

const STIL_ANWEISUNG: Record<keyof typeof TEXTSTILE, string> = {
  sachlich: "nüchtern und faktenorientiert, ohne Werbesprache",
  emotional: "warm und bildhaft, aber ohne Übertreibung",
  hochwertig: "gehoben und zurückhaltend, hochwertige Wortwahl",
  familienorientiert: "familienfreundlich, Alltagstauglichkeit betonend",
  kapitalanlage: "renditeorientiert, sachlich, für Kapitalanleger",
  luxus: "exklusiv und stilvoll, ohne Superlative zu häufen",
};

/** Preise je Million Token. ANNAHME — vor Produktivbetrieb nachmessen. */
const PREIS_EINGABE_JE_MIO = 125; // Cent
const PREIS_AUSGABE_JE_MIO = 1000; // Cent

export class OpenAiAnbieter implements TextAnbieter {
  readonly name = "OpenAI";
  readonly istKi = true;

  constructor(
    private readonly schluessel: string,
    private readonly modell: string,
    private readonly basisUrl: string,
  ) {}

  async texteErzeugen(auftrag: TextAuftrag): Promise<TextErgebnis> {
    const o = auftrag.objekt;

    // Luecken stehen VOR dem Aufruf fest. Das Modell soll sie nicht fuellen.
    const luecken = lueckenErmitteln(o, auftrag.arten);

    const gefragteArten = auftrag.arten
      .map((art) => `- ${art}: ${TEXTARTEN[art]}`)
      .join("\n");

    // Nur fachliche Felder. Namen und Kontaktdaten von Eigentuemern oder
    // Interessenten werden NIE uebergeben (Abschnitt 16).
    const objektdaten = JSON.stringify(
      {
        art: o.objektart ?? o.objektkategorie,
        vermarktung: o.vermarktungsart,
        nutzung: o.nutzungsart,
        ort: o.ort,
        ortsteil: o.ortsteil,
        wohnflaeche_qm: o.wohnflaeche,
        nutzflaeche_qm: o.nutzflaeche,
        grundstueck_qm: o.grundstuecksflaeche,
        zimmer: o.zimmer,
        baujahr: o.baujahr,
        kaufpreis_eur: o.kaufpreis,
        kaltmiete_eur: o.kaltmiete,
        energieklasse: o.energie_klasse,
        energiekennwert: o.energie_kennwert,
        stichpunkte: o.stichpunkte,
      },
      null,
      1,
    );

    const anweisung = [
      "Du schreibst Immobilientexte für einen deutschen Makler.",
      "",
      "Verbindliche Regeln:",
      "1. Verwende AUSSCHLIESSLICH die übergebenen Objektdaten.",
      "2. Erfinde nichts. Keine Angaben zu Ausstattung, Zustand, Lage, Umgebung,",
      "   Anbindung oder Infrastruktur, die nicht in den Daten stehen.",
      "3. Ist eine Angabe null, lasse sie weg — umschreibe sie nicht.",
      "4. Keine Zusicherungen und keine rechtlichen Aussagen.",
      "5. Schreibe auf Deutsch.",
      `6. Tonfall: ${STIL_ANWEISUNG[auftrag.stil]}.`,
      "",
      "Antworte ausschließlich mit JSON. Schlüssel sind genau die angeforderten",
      "Textarten, Werte sind die Texte als Zeichenkette.",
    ].join("\n");

    const antwort = await fetch(`${this.basisUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.schluessel}`,
      },
      body: JSON.stringify({
        model: this.modell,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: anweisung },
          {
            role: "user",
            content: `Angeforderte Textarten:\n${gefragteArten}\n\nObjektdaten:\n${objektdaten}`,
          },
        ],
      }),
    });

    if (!antwort.ok) {
      const text = await antwort.text().catch(() => "");
      throw new Error(
        `Die Texterzeugung ist fehlgeschlagen (${antwort.status}). ${text.slice(0, 200)}`,
      );
    }

    const ergebnis = (await antwort.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const inhalt = ergebnis.choices?.[0]?.message?.content ?? "{}";
    let texte: Record<string, string> = {};
    try {
      texte = JSON.parse(inhalt) as Record<string, string>;
    } catch {
      throw new Error("Die Antwort des Modells war nicht lesbar.");
    }

    const eingabe = ergebnis.usage?.prompt_tokens ?? 0;
    const ausgabe = ergebnis.usage?.completion_tokens ?? 0;
    const kostenCent =
      (eingabe / 1_000_000) * PREIS_EINGABE_JE_MIO +
      (ausgabe / 1_000_000) * PREIS_AUSGABE_JE_MIO;

    // Nur angeforderte Arten uebernehmen — das Modell soll den Umfang nicht
    // selbst erweitern.
    const gefiltert: TextErgebnis["texte"] = {};
    for (const art of auftrag.arten) {
      const wert = texte[art];
      if (typeof wert === "string" && wert.trim() !== "") {
        gefiltert[art] = wert.trim();
      }
    }

    return {
      texte: gefiltert,
      luecken,
      kiVerwendet: true,
      quelle: `${this.name} (${this.modell})`,
      // Abschnitt 14: vollstaendige Exposé-Texterstellung kostet 10 Credits,
      // ein einzelner Text 2. Zentral konfigurierbar ab Phase 1.
      credits: auftrag.arten.length >= 4 ? 10 : auftrag.arten.length * 2,
      kostenCent: Math.round(kostenCent * 100) / 100,
    };
  }
}
