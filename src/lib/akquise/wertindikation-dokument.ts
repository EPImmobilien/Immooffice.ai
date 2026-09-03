import { preisRechnen, WERTINDIKATION_HINWEIS, type Wertindikation } from "@/lib/akquise/preisfinder";
import { leadAdresse, type Einstellungen, type LeadZeile } from "@/lib/akquise/stammdaten";
import type { Dokument } from "@/lib/dokument/struktur";
import { datum, euro } from "@/lib/format";

/**
 * Wertindikations-PDF fuer den Eigentuemer (Referenz „Wertindikation"):
 * Objektangaben, herangezogene Vergleichswerte mit €/m², Rechenweg, Spanne
 * und Startpreis-Vorschlag. Mit Pflichthinweis — keine gutachterliche Aussage.
 */
export function wertindikationAlsDokument(lead: LeadZeile, indikation: Wertindikation, einst: Einstellungen, eigentuemer: string | null, stichtag: string): Dokument {
  const wert = lead.wert_indikation ?? indikation.wert;
  const rahmen = preisRechnen(wert, einst);
  const objekt: string[][] = [
    ["Anschrift", leadAdresse(lead)],
    ["Objektart", lead.objektart ?? "—"],
    ["Wohnfläche", lead.wohnflaeche ? `${lead.wohnflaeche.toLocaleString("de-DE")} m²` : "—"],
    ["Grundstück", lead.grundstueck ? `${lead.grundstueck.toLocaleString("de-DE")} m²` : "—"],
    ["Baujahr", lead.baujahr ? String(lead.baujahr) : "—"],
    ["Zustand", lead.zustand ?? "—"],
  ];
  const abschnitte: Dokument["abschnitte"] = [
    { absaetze: [eigentuemer ? `Für ${eigentuemer}` : "", `Stichtag ${datum(stichtag)}`, "Diese Einschätzung fasst zusammen, welchen Marktpreis wir auf Grundlage vergleichbarer, von uns vermittelter Objekte für realistisch halten. Sie dient als Gesprächsgrundlage für die Vermarktungsstrategie."].filter(Boolean) },
    { ueberschrift: "1. Ihre Immobilie", tabelle: { spalten: ["Angabe", "Wert"], zeilen: objekt } },
    {
      ueberschrift: "2. Herangezogene Vergleichswerte",
      absaetze: indikation.vergleiche.length === 0 ? ["Es liegen noch keine passenden Vergleichswerte vor."] : [`${indikation.vergleiche.length} Vergleichswerte aus unserem Bestand, Eingrenzung: ${indikation.schritte.map((s) => `${s.bezeichnung}: ${s.wert}`).join("; ")}.`],
      ...(indikation.vergleiche.length > 0 ? { tabelle: { spalten: ["Objekt", "Ort", "Wohnfläche", "Kaufpreis", "€/m²"], zeilen: indikation.vergleiche.map((v) => [v.bezeichnung, [v.plz, v.ort].filter(Boolean).join(" "), v.wohnflaeche ? `${v.wohnflaeche.toLocaleString("de-DE")} m²` : "—", euro(v.kaufpreis), `${v.eurQm.toLocaleString("de-DE")} €`]) } } : {}),
    },
    {
      ueberschrift: "3. Ergebnis",
      absaetze: wert
        ? [
            `Marktpreiseinschätzung: ${euro(wert)}${indikation.eurQm ? ` (${indikation.eurQm.toLocaleString("de-DE")} €/m² × ${lead.wohnflaeche?.toLocaleString("de-DE") ?? "—"} m²)` : ""}${lead.wert_indikation && lead.wert_indikation !== indikation.wert ? " — vom Makler angepasst" : ""}.`,
            rahmen ? `Realistische Spanne: ${euro(rahmen.min)} bis ${euro(rahmen.max)} (± ${einst.spanne_prozent} %).` : "",
            rahmen ? `Empfohlener Startpreis für die Vermarktung: ${euro(lead.angebotspreis ?? rahmen.startpreis)}.` : "",
          ].filter(Boolean)
        : ["Eine Zahl kann noch nicht genannt werden: " + (indikation.fehlend.join(", ") || "Angaben unvollständig") + "."],
    },
    { ueberschrift: "4. Nächste Schritte", absaetze: ["Besichtigung und Objektaufnahme vor Ort, Prüfung der Unterlagen (Grundbuch, Energieausweis, Grundrisse), Vermarktungsstrategie und Zeitplan, Maklervertrag."] },
  ];
  return { titel: "Wertindikation", untertitel: leadAdresse(lead), abschnitte, fussnote: WERTINDIKATION_HINWEIS };
}
