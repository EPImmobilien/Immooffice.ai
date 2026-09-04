import { euro, flaeche, zahl } from "@/lib/format";
import { OBJEKTKATEGORIEN } from "@/lib/objekt-begriffe";

import { lueckenErmitteln } from "./luecken";
import type {
  AntwortAuftrag,
  AntwortErgebnis,
  TextAnbieter,
  TextAuftrag,
  TextErgebnis,
  ObjektKontext,
  KorrekturErgebnis,
} from "./typen";

/**
 * Entwurfstexte OHNE KI — rein aus den erfassten Objektdaten zusammengesetzt.
 *
 * Zweck: Solange kein Modellzugang hinterlegt ist, bleibt die Exposé-Erstellung
 * benutzbar. Erzeugt werden ausschliesslich Saetze aus tatsaechlich erfassten
 * Werten; es wird nichts ergaenzt, ausgeschmueckt oder vermutet.
 *
 * Wichtig: Das Ergebnis wird NICHT als KI-Text gekennzeichnet (`istKi = false`)
 * und kostet keine Credits. Einen Textbaustein als KI-erzeugt auszugeben, ohne
 * dass ein Modell beteiligt war, waere eine Falschangabe gegenueber dem Nutzer
 * — und gegenueber dessen Kunden.
 */

function objektTyp(o: ObjektKontext): string {
  return (
    o.objektart ??
    OBJEKTKATEGORIEN[o.objektkategorie as keyof typeof OBJEKTKATEGORIEN] ??
    "Immobilie"
  );
}

function satzliste(teile: (string | null)[]): string {
  const gefiltert = teile.filter((t): t is string => Boolean(t));
  if (gefiltert.length === 0) return "";
  if (gefiltert.length === 1) return gefiltert[0]!;
  return `${gefiltert.slice(0, -1).join(", ")} und ${gefiltert.at(-1)}`;
}

export class OhneKiAnbieter implements TextAnbieter {
  readonly name = "Entwurf aus Objektdaten";
  readonly istKi = false;

  async texteErzeugen(auftrag: TextAuftrag): Promise<TextErgebnis> {
    const o = auftrag.objekt;
    const texte: TextErgebnis["texte"] = {};
    const typ = objektTyp(o);
    const gefragt = new Set(auftrag.arten);

    const merkmale = satzliste([
      o.zimmer !== null ? `${zahl(o.zimmer)} Zimmer` : null,
      o.wohnflaeche !== null ? `${flaeche(o.wohnflaeche)} Wohnfläche` : null,
      o.grundstuecksflaeche !== null
        ? `${flaeche(o.grundstuecksflaeche)} Grundstück`
        : null,
    ]);

    if (gefragt.has("titel")) {
      const teile = [
        o.zimmer !== null ? `${zahl(o.zimmer)}-Zimmer-` : "",
        typ,
        o.ort ? ` in ${o.ort}` : "",
      ];
      texte.titel = teile.join("").trim();
    }

    if (gefragt.has("kurzbeschreibung")) {
      const preis =
        o.kaufpreis !== null
          ? `Kaufpreis ${euro(o.kaufpreis)}.`
          : o.kaltmiete !== null
            ? `Kaltmiete ${euro(o.kaltmiete)} monatlich.`
            : "";
      texte.kurzbeschreibung = [
        `${typ}${o.ort ? ` in ${o.ort}` : ""}${merkmale ? ` mit ${merkmale}` : ""}.`,
        preis,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (gefragt.has("objektbeschreibung")) {
      const saetze = [
        `Angeboten wird ${typ.match(/^[AEIOU]/i) ? "eine" : "ein"} ${typ}${
          o.ort ? ` in ${o.ort}` : ""
        }.`,
        merkmale ? `Das Objekt verfügt über ${merkmale}.` : null,
        o.baujahr !== null ? `Das Baujahr ist ${o.baujahr}.` : null,
        o.energie_klasse
          ? `Die Energieeffizienzklasse ist ${o.energie_klasse}.`
          : null,
      ];
      texte.objektbeschreibung = saetze.filter(Boolean).join(" ");
    }

    if (gefragt.has("ausstattung")) {
      texte.ausstattung = o.stichpunkte
        ? `Zur Ausstattung gehören: ${o.stichpunkte}.`
        : "";
    }

    if (gefragt.has("lage")) {
      texte.lage = o.ort
        ? `Das Objekt liegt in ${[o.ortsteil, o.ort].filter(Boolean).join(", ")}.`
        : "";
    }

    if (gefragt.has("zielgruppe")) {
      texte.zielgruppe =
        o.nutzungsart === "anlage"
          ? "Das Angebot richtet sich an Kapitalanleger."
          : "";
    }

    return {
      texte,
      luecken: lueckenErmitteln(o, auftrag.arten),
      kiVerwendet: false,
      quelle: this.name,
      credits: 0,
      kostenCent: 0,
    };
  }

  /** Hoeflicher Rahmen ohne Modell: Dank, Stichpunkte des Nutzers, Gruss. */
  async antwortEntwerfen(auftrag: AntwortAuftrag): Promise<AntwortErgebnis> {
    const bezug = auftrag.betreff ? ` zu „${auftrag.betreff.replace(/^(re|aw|fwd?|wg):\s*/i, "")}“` : "";
    const zeilen = [
      "Guten Tag,",
      "",
      `vielen Dank für Ihre Nachricht${bezug}.`,
      "",
      ...(auftrag.stichpunkte ? [auftrag.stichpunkte.trim(), ""] : []),
      "Mit freundlichen Grüßen",
      auftrag.absenderName,
      auftrag.unternehmen,
    ];
    return { text: zeilen.join("\n"), kiVerwendet: false, quelle: this.name, credits: 0, kostenCent: 0 };
  }

  /** Ohne Modell keine Korrektur — der Text kommt unveraendert zurueck. */
  async textKorrigieren(text: string): Promise<KorrekturErgebnis> {
    return { text, geaendert: false, kiVerwendet: false, quelle: this.name, credits: 0, kostenCent: 0 };
  }
}
