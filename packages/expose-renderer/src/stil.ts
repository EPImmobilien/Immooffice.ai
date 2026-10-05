// ============================================================================
// Stil: Farbverweise, Schriftnamen, Textstile
// ----------------------------------------------------------------------------
// Eine Vorlage nennt Farben und Schriften nicht in Zahlen, sondern als
// Verweise: "f1", "ci.akzent", { palette: "surf" }, { familie: "jakarta",
// schnitt: "SemiBold" }. Hier werden sie aufgeloest.
//
// Der Umweg ist der Sinn der Sache: dieselbe Vorlage sieht beim einen
// Mandanten petrolfarben aus und beim anderen bordeaux, ohne dass jemand
// das Dokument anfasst. Und ein Farbverweis, den die Ableitung nicht
// kennt, soll laut auffallen statt still schwarz zu werden.
// ============================================================================

import type { Farbe } from "./farben";
import { SCHWARZ, VORGABE, WEISS, hx, mix as mischen, palette } from "./farben";
import type { Ableitung } from "./farben";
import type { FarbRef, SchriftRef, TextStil, Vorlage } from "./schema";
import type { RGBA } from "./schritte";
import type { SatzRegeln } from "./text";

export type Palette = Record<string, Farbe>;

export type Marke = {
  /** Primaerfarbe des Mandanten, falls gesetzt. */
  primaer?: string;
  akzent?: string;
  /** Schrift des Mandanten; noch nicht benutzt, siehe Hinweis unten. */
  font?: string;
};

/**
 * Die Palette einer Vorlage, mit dem Branding des Mandanten davor.
 *
 * Die Vorlage darf "ci.primaer" als f1 angeben; dann entscheidet der
 * Mandant. Gibt er nichts an, bleibt der Vorgabewert der Vorlage.
 */
export function paletteFuer(vorlage: Vorlage, marke: Marke = {}): Palette {
  const ableitung = vorlage.stil.farben.ableitung as Ableitung;
  // Hat der Mandant keine CI-Farbe gesetzt, bleibt die Vorgabe der
  // Ableitung. Ohne diesen Rueckfall stuende dort eine leere Zeichenkette,
  // und die Farbableitung braeche ab — ein Mandant ohne Branding haette
  // kein Expose.
  const f1 = farbQuelle(vorlage.stil.farben.f1, marke) || VORGABE[ableitung].f1;
  const f2 = farbQuelle(vorlage.stil.farben.f2, marke) || VORGABE[ableitung].f2;
  const p = palette(ableitung, f1, f2) as unknown as Palette;
  return { ...p, weiss: WEISS, schwarz: SCHWARZ };
}

function farbQuelle(ref: FarbRef, marke: Marke): string {
  if (typeof ref === "string") {
    if (ref === "ci.primaer") return marke.primaer ?? "";
    if (ref === "ci.akzent") return marke.akzent ?? "";
    if (ref.startsWith("#")) return ref;
  }
  return "";
}

/** Loest einen Farbverweis gegen die Palette auf. */
export function farbe(ref: FarbRef, p: Palette, deckkraft = 1): RGBA {
  const c = farbeOhne(ref, p);
  return [c.r, c.g, c.b, deckkraft];
}

function farbeOhne(ref: FarbRef, p: Palette): Farbe {
  // Gemischte Farbe: { mix: ["p", "weiss", 0.6] }. Die Prototypen mischen
  // an vielen Stellen unmittelbar im Satz — ein halbdurchsichtiges Weiss
  // auf der Primaerflaeche, ein aufgehelltes Dunkel fuer eine Haarlinie.
  // Das sind keine Palettenfarben, und sie als Hexwert einzutragen wuerde
  // sie vom Branding des Mandanten abschneiden: bei einem anderen
  // Primaerton muesste jede davon nachgerechnet werden.
  if (typeof ref === "object" && ref !== null && "mix" in ref) {
    const [a, b, t] = (ref as { mix: [FarbRef, FarbRef, number] }).mix;
    if (typeof t !== "number") {
      throw new Error(`mix braucht einen Anteil als Zahl: ${JSON.stringify(ref)}`);
    }
    return mischen(farbeOhne(a, p), farbeOhne(b, p), t);
  }
  if (typeof ref === "object" && ref !== null && "palette" in ref) {
    const c = p[ref.palette];
    if (!c) {
      throw new Error(
        `Die Farbe "${ref.palette}" kennt diese Farbableitung nicht. ` +
        `Vorhanden: ${Object.keys(p).sort().join(", ")}.`);
    }
    return c;
  }
  if (typeof ref === "string") {
    if (ref.startsWith("#")) return hx(ref);
    const c = p[ref];
    if (c) return c;
    throw new Error(
      `Unbekannter Farbverweis "${ref}". Vorhanden: ` +
      `${Object.keys(p).sort().join(", ")}, dazu "#RRGGBB".`);
  }
  throw new Error(`Unbekannter Farbverweis: ${JSON.stringify(ref)}`);
}

// ----------------------------------------------------------------- Schrift

const FAMILIE: Record<string, string> = {
  jakarta: "Jak",
  cormorant: "Corm",
  archivo: "Arch",
};

/**
 * Schriftverweis zu Dateinamen ohne Endung, also zu dem Namen, unter dem
 * assets/fonts/expose/ den Schnitt fuehrt.
 *
 * "ci.font" ist noch nicht aufloesbar: eine eigene Schrift des Mandanten
 * braucht einen Platz im Speicher, eine Lizenzpruefung und eine
 * Fallunterscheidung fuer fehlende Schnitte. Bis dahin wird daraus die
 * Textschrift der Vorlage, und der Renderer sagt das als Warnung — er tut
 * nicht so, als waere die Marke beruecksichtigt.
 */
export function schnittName(ref: SchriftRef, ersatz?: SchriftRef): string {
  if (ref === "ci.font") {
    if (ersatz === undefined || ersatz === "ci.font") {
      throw new Error('"ci.font" ohne Ersatzschrift — die Vorlage muss eine nennen.');
    }
    return schnittName(ersatz);
  }
  const vorne = FAMILIE[ref.familie];
  if (!vorne) throw new Error(`Unbekannte Schriftfamilie "${ref.familie}".`);
  return `${vorne}-${ref.schnitt}`;
}

// --------------------------------------------------------------- Textstil

export type FesterStil = {
  schnitt: string;
  groesse: number;
  zeilenhoehe: number;
  farbe: RGBA;
  sperrung: number;
  grossbuchstaben: boolean;
  ausrichtung: "links" | "mitte" | "rechts" | "block";
  minGroesse: number;
};

/**
 * Loest einen Textstil der Vorlage auf. Fehlt die Zeilenhoehe, nimmt der
 * Renderer das 1,45-fache der Groesse — das ist der Wert, mit dem die
 * Vorlagen arbeiten, wenn sie nichts anderes sagen.
 */
export function textstil(
  stil: TextStil, p: Palette, textschrift?: SchriftRef,
): FesterStil {
  return {
    schnitt: schnittName(stil.schrift, textschrift),
    groesse: stil.groesse,
    zeilenhoehe: stil.zeilen ?? stil.groesse * 1.45,
    farbe: farbe(stil.farbe, p),
    sperrung: stil.sperrung ?? 0,
    grossbuchstaben: stil.grossbuchstaben ?? false,
    ausrichtung: stil.ausrichtung ?? "links",
    minGroesse: stil.min_groesse ?? stil.groesse * 0.82,
  };
}

/** Benannter Textstil aus der Vorlage. */
export function stilAus(vorlage: Vorlage, name: string, p: Palette): FesterStil {
  const s = vorlage.stil.textstile[name];
  if (!s) {
    throw new Error(
      `Der Textstil "${name}" steht nicht in der Vorlage. Vorhanden: ` +
      `${Object.keys(vorlage.stil.textstile).sort().join(", ")}.`);
  }
  return textstil(s, p, vorlage.stil.schriften.text);
}

/** Satzregeln aus der Ableitung — die drei Prototypen setzen verschieden. */
export function satzRegeln(ableitung: string, blocksatz: boolean): SatzRegeln {
  const faktor = ableitung === "signature" ? 0.6 : ableitung === "studio" ? 0.5 : 0.55;
  return { blocksatz, absatzFaktor: faktor, einzug: 0, einzugZeilen: 0 };
}
