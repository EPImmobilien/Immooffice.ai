import type { Dokument } from "@/lib/dokument/struktur";

/**
 * Uebergabeprotokoll (Verkauf: Uebergabe/Rueckgabe; Vermietung: Einzug/Auszug)
 * als Assistent in sieben Schritten — Stammdaten, Schluessel, Zaehler, Raeume,
 * Sonstiges, Unterschriften, Abschluss.
 */

export const KONTEXTE = { verkauf: "Verkauf", vermietung: "Vermietung" } as const;
export type Kontext = keyof typeof KONTEXTE;
export const TYPEN = { uebergabe: "Übergabe an Käufer", rueckgabe: "Rückgabe an Verkäufer", einzug: "Einzug (Übergabe an Mieter)", auszug: "Auszug (Rückgabe an Vermieter)" } as const;
export type Typ = keyof typeof TYPEN;

export const SCHRITTE = [
  { nr: 1, titel: "Stammdaten" },
  { nr: 2, titel: "Schlüssel" },
  { nr: 3, titel: "Zähler" },
  { nr: 4, titel: "Räume" },
  { nr: 5, titel: "Sonstiges" },
  { nr: 6, titel: "Unterschriften" },
  { nr: 7, titel: "Abschluss" },
] as const;

export const SCHLUESSEL_ARTEN: Record<string, string> = {
  haustuer: "Haustür",
  wohnungstuer: "Wohnungstür",
  keller: "Keller",
  briefkasten: "Briefkasten",
  garage: "Garage / Stellplatz",
  nebeneingang: "Nebeneingang",
  dachboden: "Dachboden",
  sonstige: "Sonstige",
};
export const ZAEHLER_ARTEN: Record<string, { text: string; einheit: string }> = {
  strom: { text: "Strom", einheit: "kWh" },
  gas: { text: "Gas", einheit: "m³" },
  kaltwasser: { text: "Kaltwasser", einheit: "m³" },
  warmwasser: { text: "Warmwasser", einheit: "m³" },
  heizung: { text: "Heizung / Wärmemenge", einheit: "kWh" },
  fernwaerme: { text: "Fernwärme", einheit: "kWh" },
  oel: { text: "Heizöl (Tankstand)", einheit: "l" },
};
export const RAUM_VORSCHLAEGE = ["Flur", "Wohnzimmer", "Küche", "Schlafzimmer", "Kinderzimmer", "Bad", "Gäste-WC", "Abstellraum", "Balkon / Terrasse", "Keller", "Garage"];
export const ZUSTAENDE: Record<string, string> = { gut: "Gut", gebrauchsspuren: "Gebrauchsspuren", maengel: "Mängel vorhanden" };

export interface Beteiligter { name: string; strasse: string; plz: string; ort: string; anwesend: boolean; vertreter: string }
export interface Schluessel { id: string; art: string; anzahl: number; bemerkung: string }
export interface Zaehler { id: string; art: string; nummer: string; stand: string; einheit: string; foto_pfad: string | null; ki_gelesen: boolean }
export interface Raum { id: string; name: string; zustand: string; maengel: string; foto_pfade: string[] }
export interface Sonstiges {
  rauchmelder_anzahl: number | null;
  rauchmelder_funktion: "ja" | "nein" | "nicht_geprueft";
  schimmel: "nein" | "ja" | "nicht_geprueft";
  schimmel_wo: string;
  hausordnung_uebergeben: boolean;
  anleitungen_uebergeben: boolean;
  sonderabreden: string;
}
export interface Unterschrift { name: string; bild: string | null; zeit: string | null }
export interface ObjektAngaben { adresse: string; etage: string; lage: string }

export interface Protokoll {
  kontext: Kontext;
  typ: Typ;
  bezeichnung: string;
  datum: string | null;
  uhrzeit: string | null;
  uebergeber: Beteiligter;
  uebernehmer: Beteiligter;
  objekt: ObjektAngaben;
  schluessel: Schluessel[];
  zaehler: Zaehler[];
  raeume: Raum[];
  sonstiges: Sonstiges;
  unterschriften: { uebergeber: Unterschrift | null; uebernehmer: Unterschrift | null };
}

const LEER_BETEILIGTER: Beteiligter = { name: "", strasse: "", plz: "", ort: "", anwesend: true, vertreter: "" };

export function leeresProtokoll(kontext: Kontext, typ: Typ): Protokoll {
  return {
    kontext, typ, bezeichnung: "", datum: null, uhrzeit: null,
    uebergeber: { ...LEER_BETEILIGTER }, uebernehmer: { ...LEER_BETEILIGTER },
    objekt: { adresse: "", etage: "", lage: "" },
    schluessel: [], zaehler: [], raeume: [],
    sonstiges: { rauchmelder_anzahl: null, rauchmelder_funktion: "nicht_geprueft", schimmel: "nicht_geprueft", schimmel_wo: "", hausordnung_uebergeben: false, anleitungen_uebergeben: false, sonderabreden: "" },
    unterschriften: { uebergeber: null, uebernehmer: null },
  };
}

/** Rollenbezeichnungen je Kontext und Typ. */
export function rollen(p: Pick<Protokoll, "kontext" | "typ">): { uebergeber: string; uebernehmer: string } {
  if (p.kontext === "verkauf") return p.typ === "uebergabe" ? { uebergeber: "Verkäufer", uebernehmer: "Käufer" } : { uebergeber: "Käufer", uebernehmer: "Verkäufer" };
  return p.typ === "einzug" ? { uebergeber: "Vermieter", uebernehmer: "Mieter" } : { uebergeber: "Mieter", uebernehmer: "Vermieter" };
}

/**
 * Datenbankzeile → Protokoll (mit Vorgaben fuer fehlende Teile).
 *
 * Achtung: Die Spalte `objekt` ist JSON. Ein Join-Alias `objekt:objekte(...)`
 * in der Abfrage wuerde sie ueberdecken — Joins deshalb `objekt_ref` nennen.
 */
export function protokollAusZeile(z: Record<string, unknown>): Protokoll {
  const kontext = (z["kontext"] as Kontext) ?? "verkauf";
  const typ = (z["typ"] as Typ) ?? "uebergabe";
  const leer = leeresProtokoll(kontext, typ);
  const obj = (k: string) => (z[k] && typeof z[k] === "object" ? (z[k] as Record<string, unknown>) : {});
  const arr = <T,>(k: string): T[] => (Array.isArray(z[k]) ? (z[k] as T[]) : []);
  const u = obj("unterschriften");
  return {
    ...leer,
    bezeichnung: String(z["bezeichnung"] ?? ""),
    datum: (z["datum"] as string | null) ?? null,
    uhrzeit: (z["uhrzeit"] as string | null) ?? null,
    uebergeber: { ...LEER_BETEILIGTER, ...obj("uebergeber") } as Beteiligter,
    uebernehmer: { ...LEER_BETEILIGTER, ...obj("uebernehmer") } as Beteiligter,
    objekt: { ...leer.objekt, ...obj("objekt") } as ObjektAngaben,
    schluessel: arr<Schluessel>("schluessel"),
    zaehler: arr<Zaehler>("zaehler"),
    raeume: arr<Raum>("raeume"),
    sonstiges: { ...leer.sonstiges, ...obj("sonstiges") } as Sonstiges,
    unterschriften: { uebergeber: (u["uebergeber"] as Unterschrift | null) ?? null, uebernehmer: (u["uebernehmer"] as Unterschrift | null) ?? null },
  };
}

/** Was vor dem Abschluss noch fehlt — als lesbare Liste. */
export function fehlendeAngaben(p: Protokoll): string[] {
  const r = rollen(p);
  const f: string[] = [];
  if (!p.datum) f.push("Datum der Übergabe");
  if (!p.objekt.adresse.trim()) f.push("Objektadresse");
  if (!p.uebergeber.name.trim()) f.push(`Name ${r.uebergeber}`);
  if (!p.uebernehmer.name.trim()) f.push(`Name ${r.uebernehmer}`);
  if (p.schluessel.length === 0) f.push("Mindestens ein Schlüssel");
  if (p.zaehler.length === 0) f.push("Mindestens ein Zählerstand");
  if (p.raeume.length === 0) f.push("Mindestens ein Raum");
  if (!p.unterschriften.uebergeber?.bild) f.push(`Unterschrift ${r.uebergeber}`);
  if (!p.unterschriften.uebernehmer?.bild) f.push(`Unterschrift ${r.uebernehmer}`);
  return f;
}

export function protokollTitel(p: Pick<Protokoll, "kontext" | "typ" | "objekt" | "bezeichnung">): string {
  return p.bezeichnung.trim() || `${TYPEN[p.typ]}${p.objekt.adresse ? ` — ${p.objekt.adresse}` : ""}`;
}

function beteiligterZeile(b: Beteiligter): string {
  const anschrift = [b.strasse, [b.plz, b.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `${b.name}${anschrift ? `, ${anschrift}` : ""}${b.anwesend ? "" : " (nicht anwesend)"}${b.vertreter ? `, vertreten durch ${b.vertreter}` : ""}`;
}

/** Protokoll als Dokumentstruktur fuer PDF und Word. */
export function protokollAlsDokument(p: Protokoll): Dokument {
  const r = rollen(p);
  const s = p.sonstiges;
  return {
    titel: `Übergabeprotokoll — ${TYPEN[p.typ]}`,
    untertitel: [p.objekt.adresse, p.objekt.etage, p.objekt.lage].filter(Boolean).join(" · "),
    abschnitte: [
      {
        ueberschrift: "Stammdaten",
        tabelle: {
          spalten: ["Angabe", "Wert"],
          zeilen: [
            ["Datum / Uhrzeit", [p.datum ?? "—", p.uhrzeit ?? ""].join(" ").trim()],
            [r.uebergeber, beteiligterZeile(p.uebergeber)],
            [r.uebernehmer, beteiligterZeile(p.uebernehmer)],
          ],
        },
      },
      {
        ueberschrift: "Schlüssel",
        tabelle: { spalten: ["Art", "Anzahl", "Bemerkung"], zeilen: p.schluessel.map((k) => [SCHLUESSEL_ARTEN[k.art] ?? k.art, String(k.anzahl), k.bemerkung]) },
        absaetze: p.schluessel.length === 0 ? ["Keine Schlüssel erfasst."] : [],
      },
      {
        ueberschrift: "Zählerstände",
        tabelle: { spalten: ["Zähler", "Nummer", "Stand", "Quelle"], zeilen: p.zaehler.map((z) => [ZAEHLER_ARTEN[z.art]?.text ?? z.art, z.nummer, `${z.stand} ${z.einheit}`.trim(), z.ki_gelesen ? "aus Foto (KI, geprüft)" : "manuell"]) },
        absaetze: p.zaehler.length === 0 ? ["Keine Zählerstände erfasst."] : [],
      },
      {
        ueberschrift: "Räume und Zustand",
        tabelle: { spalten: ["Raum", "Zustand", "Mängel / Bemerkungen", "Fotos"], zeilen: p.raeume.map((x) => [x.name, ZUSTAENDE[x.zustand] ?? x.zustand, x.maengel, String(x.foto_pfade.length)]) },
        absaetze: p.raeume.length === 0 ? ["Keine Räume erfasst."] : [],
      },
      {
        ueberschrift: "Sonstiges",
        absaetze: [
          `Rauchmelder: ${s.rauchmelder_anzahl ?? "—"} Stück, Funktion ${s.rauchmelder_funktion === "ja" ? "geprüft und in Ordnung" : s.rauchmelder_funktion === "nein" ? "nicht in Ordnung" : "nicht geprüft"}.`,
          `Schimmel: ${s.schimmel === "ja" ? `festgestellt${s.schimmel_wo ? ` (${s.schimmel_wo})` : ""}` : s.schimmel === "nein" ? "nicht festgestellt" : "nicht geprüft"}.`,
          `Hausordnung übergeben: ${s.hausordnung_uebergeben ? "ja" : "nein"}. Bedienungsanleitungen übergeben: ${s.anleitungen_uebergeben ? "ja" : "nein"}.`,
          ...(s.sonderabreden.trim() ? [`Sonderabreden: ${s.sonderabreden.trim()}`] : []),
        ],
      },
      {
        ueberschrift: "Unterschriften",
        unterschriften: [
          { bezeichnung: r.uebergeber, name: p.unterschriften.uebergeber?.name ?? p.uebergeber.name, bild: p.unterschriften.uebergeber?.bild ?? null, zeit: p.unterschriften.uebergeber?.zeit ?? null },
          { bezeichnung: r.uebernehmer, name: p.unterschriften.uebernehmer?.name ?? p.uebernehmer.name, bild: p.unterschriften.uebernehmer?.bild ?? null, zeit: p.unterschriften.uebernehmer?.zeit ?? null },
        ],
        absaetze: ["Die Unterschriften wurden auf dem Bildschirm geleistet. Sie sind einfache elektronische Signaturen im Sinne von Artikel 3 Nummer 10 eIDAS."],
      },
    ],
  };
}
