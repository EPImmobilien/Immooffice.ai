// ============================================================================
// Die Vorlage pruefen, bevor sie gezeichnet wird
// ----------------------------------------------------------------------------
// Der Auftrag verlangt: "Vorlage beim Laden gegen das JSON-Schema
// validieren, bei Fehlern klare Meldung mit Seiten- und Element-ID."
//
// Geprueft wird hier mehr als die Form. Die Fehler, die wirklich
// vorkommen, sind inhaltlich: ein Platzhalter, den es nicht gibt
// ({{objekt.wohnflaeche_qm}}), ein Textstil, der nicht in der Vorlage
// steht, eine Farbe, die die Ableitung nicht kennt. Jeder davon macht im
// PDF nur eine Luecke — und eine Luecke sucht man lange.
//
// Was die Pruefung NICHT kann: sagen, ob eine Seite schoen ist. Rahmen
// duerfen sich ueberlappen und ueber den Rand hinausragen; das ist
// manchmal gewollt (das Farbband des Covers laeuft von Kante zu Kante).
// Gemeldet wird es als Hinweis, nicht als Fehler.
// ============================================================================

import { ELEMENTE } from "./elemente";
import { KATALOG } from "./felder";
import type { Element, Seite, Vorlage } from "./schema";
import { platzhalterIn } from "./werte";

export type Befund = {
  schwere: "fehler" | "hinweis";
  seite?: string;
  element?: string;
  text: string;
};

const BEKANNTE_FELDER = new Set(KATALOG.map((f) => f.schluessel));

/** Felder, die der Renderer selbst stellt und die nicht im Katalog stehen. */
const EIGENE_FELDER = new Set([
  "bild.lageplan", "bild.asset",
]);

function istBekannt(schluessel: string): boolean {
  if (BEKANNTE_FELDER.has(schluessel)) return true;
  if (EIGENE_FELDER.has(schluessel)) return true;
  // Durchnummerierte Bildslots: bild.foto.3, bild.grundriss.2
  return /^bild\.(foto|grundriss)\.\d+(\.titel)?$/.test(schluessel);
}

export function vorlagePruefen(v: Vorlage): Befund[] {
  const raus: Befund[] = [];
  const stile = new Set(Object.keys(v.stil?.textstile ?? {}));

  if (v.schema !== 1) {
    raus.push({ schwere: "fehler", text: `Unbekannte Schemafassung ${v.schema}. ` +
      `Dieser Renderer kennt 1.` });
  }
  if (!v.format || typeof v.format.breite !== "number" ||
      typeof v.format.hoehe !== "number") {
    raus.push({ schwere: "fehler", text: "Die Vorlage nennt kein Format." });
  }
  if (!Array.isArray(v.seiten) || v.seiten.length === 0) {
    raus.push({ schwere: "fehler", text: "Die Vorlage hat keine Seite." });
    return raus;
  }

  const seitenIds = new Set<string>();
  for (const seite of v.seiten) {
    if (!seite.id) {
      raus.push({ schwere: "fehler", text: "Eine Seite hat keine Kennung." });
      continue;
    }
    if (seitenIds.has(seite.id)) {
      raus.push({ schwere: "fehler", seite: seite.id,
        text: `Die Seitenkennung "${seite.id}" kommt zweimal vor. ` +
              `Abweichungen je Objekt wuerden auf die falsche Seite wirken.` });
    }
    seitenIds.add(seite.id);
    pruefeSeite(seite, v, stile, raus);
  }

  if (v.stil?.seitenfuss) {
    for (const el of v.stil.seitenfuss.elemente) {
      pruefeElement(el, undefined, v, stile, raus);
    }
  }
  return raus;
}

function pruefeSeite(seite: Seite, v: Vorlage, stile: Set<string>,
                     raus: Befund[]): void {
  if (!Array.isArray(seite.elemente)) {
    raus.push({ schwere: "fehler", seite: seite.id,
      text: "Die Seite hat keine Elementliste." });
    return;
  }
  const ids = new Set<string>();
  for (const el of seite.elemente) {
    if (el.id && ids.has(el.id)) {
      raus.push({ schwere: "fehler", seite: seite.id, element: el.id,
        text: `Die Elementkennung "${el.id}" kommt auf dieser Seite zweimal vor.` });
    }
    if (el.id) ids.add(el.id);
    pruefeElement(el, seite.id, v, stile, raus);
  }
}

function pruefeElement(el: Element, seite: string | undefined, v: Vorlage,
                       stile: Set<string>, raus: Befund[]): void {
  const melde = (schwere: Befund["schwere"], text: string) =>
    raus.push({ schwere, seite, element: el.id, text });

  if (!el.id) melde("fehler", "Ein Element hat keine Kennung.");
  if (!ELEMENTE[el.typ]) {
    melde("fehler", `Unbekannter Elementtyp "${el.typ}". Bekannt sind: ` +
      `${Object.keys(ELEMENTE).sort().join(", ")}.`);
  }
  for (const name of ["x", "y", "b", "h"] as const) {
    if (typeof el[name] !== "number" || !Number.isFinite(el[name])) {
      melde("fehler", `"${name}" fehlt oder ist keine Zahl.`);
    }
  }
  if (typeof el.b === "number" && el.b <= 0) melde("fehler", "Breite 0 oder kleiner.");
  if (typeof el.h === "number" && el.h < 0) melde("fehler", "Negative Hoehe.");
  if (el.drehung !== undefined && ![0, 90, 270].includes(el.drehung)) {
    melde("fehler", `Drehung ${el.drehung} — erlaubt sind 0, 90 und 270.`);
  }

  // Textstile
  for (const [schluessel, wert] of Object.entries(el)) {
    if (!schluessel.startsWith("stil") || typeof wert !== "string") continue;
    if (!stile.has(wert)) {
      melde("fehler", `Der Textstil "${wert}" steht nicht in der Vorlage. ` +
        `Vorhanden: ${[...stile].sort().join(", ")}.`);
    }
  }

  // Platzhalter
  for (const text of texteIn(el)) {
    for (const feld of platzhalterIn(text)) {
      if (!istBekannt(feld)) {
        melde("fehler", `Der Platzhalter {{${feld}}} ist dem Feldkatalog nicht ` +
          `bekannt. Im PDF bliebe dort eine Luecke.`);
      }
    }
  }

  // Rahmen, der ueber die Seite hinausgeht: manchmal gewollt, nie
  // selbstverstaendlich.
  if (typeof el.x === "number" && typeof el.b === "number" &&
      typeof el.y === "number" && typeof el.h === "number" && v.format) {
    if (el.x < -0.01 || el.y < -0.01 ||
        el.x + el.b > v.format.breite + 0.01 ||
        el.y + el.h > v.format.hoehe + 0.01) {
      melde("hinweis", `Der Rahmen (${el.x}, ${el.y}, ${el.b}, ${el.h}) reicht ` +
        `ueber die Seite hinaus.`);
    }
  }
}

/** Alle Zeichenketten eines Elements, die Platzhalter enthalten koennen. */
function texteIn(el: Element): string[] {
  const raus: string[] = [];
  const sammle = (v: unknown): void => {
    if (typeof v === "string") { if (v.includes("{{")) raus.push(v); return; }
    if (Array.isArray(v)) { for (const x of v) sammle(x); return; }
    if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) sammle(x);
    }
  };
  for (const [schluessel, wert] of Object.entries(el)) {
    if (schluessel === "id" || schluessel === "typ") continue;
    sammle(wert);
  }
  return raus;
}
