/**
 * Dubletten und Konflikte beim Abgleich (docs/AUTONOMIE.md 5.3).
 *
 * Zwei reine Funktionen ohne Datenbank:
 *   - Dublettenpruefung: Objekte ueber die Anschrift, Kontakte ueber Name
 *     beziehungsweise E-Mail. Grundlage der Vorschau vor dem Erstimport.
 *   - Konfliktentscheid: „letzte Aenderung gewinnt", mit Konfliktliste fuer
 *     alles, was sich nicht sauber entscheiden laesst.
 */

import type { KanonischerKontakt, KanonischesObjekt } from "./modell";

// --- Normalisierung ----------------------------------------------------------

/** Kleinbuchstaben, Umlaute aufgeloest, Mehrfach-Leerraum eingedampft. */
export function normalisieren(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/str\.(?=\s|$)/g, "strasse")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Anschrift-Schluessel: PLZ + Strasse + Hausnummer. Ohne Strasse und
 * Hausnummer gibt es keinen Schluessel — zwei Objekte im selben Ort sind noch
 * keine Dublette.
 */
export function anschriftSchluessel(o: {
  plz: string | null;
  strasse: string | null;
  hausnummer: string | null;
  ort?: string | null;
}): string | null {
  const strasse = normalisieren(o.strasse);
  const nummer = normalisieren(o.hausnummer);
  if (!strasse || !nummer) return null;
  const plz = normalisieren(o.plz) || normalisieren(o.ort ?? null);
  if (!plz) return null;
  return `${plz}|${strasse}|${nummer}`;
}

/** Kontakt-Schluessel: E-Mail, sonst Nachname + Vorname, sonst Firma. */
export function kontaktSchluessel(k: {
  email: string | null;
  vorname: string | null;
  nachname: string | null;
  firma: string | null;
}): string | null {
  const email = normalisieren(k.email);
  if (email) return `email|${email}`;
  const nachname = normalisieren(k.nachname);
  if (nachname) return `name|${nachname}|${normalisieren(k.vorname)}`;
  const firma = normalisieren(k.firma);
  return firma ? `firma|${firma}` : null;
}

// --- Dublettenpruefung -------------------------------------------------------

export interface Dublette<T> {
  neu: T;
  bestand: { id: string; bezeichnung: string };
  grund: "anschrift" | "email" | "name" | "firma";
}

export interface Bestandsobjekt {
  id: string;
  bezeichnung: string;
  plz: string | null;
  strasse: string | null;
  hausnummer: string | null;
  ort: string | null;
}

export interface Bestandskontakt {
  id: string;
  email: string | null;
  vorname: string | null;
  nachname: string | null;
  firma: string | null;
}

export function objektDubletten(
  neue: KanonischesObjekt[],
  bestand: Bestandsobjekt[],
): Dublette<KanonischesObjekt>[] {
  const index = new Map<string, Bestandsobjekt>();
  for (const b of bestand) {
    const s = anschriftSchluessel(b);
    if (s && !index.has(s)) index.set(s, b);
  }
  const treffer: Dublette<KanonischesObjekt>[] = [];
  for (const n of neue) {
    const s = anschriftSchluessel(n);
    const b = s ? index.get(s) : undefined;
    if (b) treffer.push({ neu: n, bestand: { id: b.id, bezeichnung: b.bezeichnung }, grund: "anschrift" });
  }
  return treffer;
}

export function kontaktDubletten(
  neue: KanonischerKontakt[],
  bestand: Bestandskontakt[],
): Dublette<KanonischerKontakt>[] {
  const index = new Map<string, Bestandskontakt>();
  for (const b of bestand) {
    const s = kontaktSchluessel(b);
    if (s && !index.has(s)) index.set(s, b);
  }
  const treffer: Dublette<KanonischerKontakt>[] = [];
  for (const n of neue) {
    const s = kontaktSchluessel(n);
    const b = s ? index.get(s) : undefined;
    if (!b) continue;
    const grund = s!.startsWith("email|") ? "email" : s!.startsWith("name|") ? "name" : "firma";
    const bezeichnung = [b.vorname, b.nachname].filter(Boolean).join(" ") || b.firma || "";
    treffer.push({ neu: n, bestand: { id: b.id, bezeichnung }, grund });
  }
  return treffer;
}

// --- Konfliktentscheid -------------------------------------------------------

export type Entscheid = "lokal_gewinnt" | "fremd_gewinnt" | "konflikt" | "unveraendert";

export interface Konflikt {
  typ: "objekt" | "kontakt" | "termin";
  lokal_id: string;
  fremd_id: string;
  lokal_geaendert: string | null;
  fremd_geaendert: string | null;
  grund: string;
}

/**
 * Entscheidet je Zuordnung, welche Seite gewinnt.
 *
 * Grundlage sind die Zeitstempel der letzten bekannten Aenderung beider
 * Seiten (aus `integration_mappings`) und die aktuellen Zeitstempel. Haben
 * sich seit dem letzten Lauf BEIDE Seiten geaendert, ist das ein Konflikt —
 * „letzte Aenderung gewinnt" entscheidet ihn zwar, aber der Fall landet
 * zusaetzlich in der Liste zur manuellen Pruefung.
 */
export function abgleichEntscheiden(z: {
  lokal_geaendert: string | null;
  fremd_geaendert: string | null;
  zuletzt_lokal: string | null;
  zuletzt_fremd: string | null;
}): { entscheid: Entscheid; konflikt: boolean } {
  const lokalNeu = z.lokal_geaendert !== null && z.lokal_geaendert !== z.zuletzt_lokal;
  const fremdNeu = z.fremd_geaendert !== null && z.fremd_geaendert !== z.zuletzt_fremd;

  if (!lokalNeu && !fremdNeu) return { entscheid: "unveraendert", konflikt: false };
  if (lokalNeu && !fremdNeu) return { entscheid: "lokal_gewinnt", konflikt: false };
  if (!lokalNeu && fremdNeu) return { entscheid: "fremd_gewinnt", konflikt: false };

  // Beide geaendert: die juengere gewinnt, und der Fall wird gemeldet.
  const lokal = Date.parse(z.lokal_geaendert!);
  const fremd = Date.parse(z.fremd_geaendert!);
  if (Number.isNaN(lokal) || Number.isNaN(fremd)) return { entscheid: "konflikt", konflikt: true };
  return { entscheid: lokal >= fremd ? "lokal_gewinnt" : "fremd_gewinnt", konflikt: true };
}
