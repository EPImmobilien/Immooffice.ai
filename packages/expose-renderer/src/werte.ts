// ============================================================================
// Werte, Formatierung, Platzhalter, Bedingungen
// ----------------------------------------------------------------------------
// Formatiert wird von Hand, nicht mit Intl.NumberFormat. Zwei Gruende: die
// Prototypen tun es auch von Hand (`f"{v:,.0f} €".replace(",", ".")`), und
// derselbe Renderer laeuft im Browser und in Deno. Haengt die Ausgabe an
// einer ICU-Fassung, sieht die Vorschau anders aus als das PDF — und genau
// das soll der eine Renderer verhindern.
//
// Ein fehlender Wert ist nicht "0" und nicht "null". Er ist nichts, und
// nichts heisst: die Zeile oder das Element entfaellt. Darum gibt wert()
// `undefined` zurueck und nicht einen leeren Text — der Aufrufer muss sich
// entscheiden.
// ============================================================================

import type { Bedingung } from "./schema";
import type { Feld, FeldTyp } from "./felder";
import { feld } from "./felder";

export type Daten = Record<string, unknown>;

// ------------------------------------------------------------ Formatierung

/**
 * Tausenderpunkte und Dezimalkomma, ohne Intl.
 *
 * `knapp` laesst nachlaufende Nullen weg: fuenf Zimmer sind "5" und nicht
 * "5,0", dreieinhalb aber "3,5". Betraege und Prozente bleiben feststellig,
 * weil "1.234,5 €" falsch aussieht.
 */
export function zahlDe(v: number, stellen = 0, knapp = false): string {
  const negativ = v < 0;
  const gerundet = Math.abs(v).toFixed(stellen);
  let [ganz, bruch] = gerundet.split(".");
  if (knapp && bruch) {
    bruch = bruch.replace(/0+$/, "");
    if (bruch === "") bruch = undefined as unknown as string;
  }
  let mitPunkten = "";
  for (let i = 0; i < ganz.length; i++) {
    if (i > 0 && (ganz.length - i) % 3 === 0) mitPunkten += ".";
    mitPunkten += ganz[i];
  }
  const raus = bruch ? `${mitPunkten},${bruch}` : mitPunkten;
  return negativ ? `−${raus}` : raus;
}

/** ISO-Datum oder Datum-Objekt zu TT.MM.JJJJ. */
export function datumDe(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const teile = s.split("T")[0].split("-");
  if (teile.length !== 3) return s;
  return `${teile[2]}.${teile[1]}.${teile[0]}`;
}

/**
 * Formatiert einen Rohwert nach dem Typ des Feldes. `undefined` heisst:
 * kein Wert — nicht "0", nicht "" und nicht "–".
 */
export function formatiere(roh: unknown, typ: FeldTyp, stellen?: number): string | undefined {
  if (roh == null) return undefined;
  if (typeof roh === "string" && roh.trim() === "") return undefined;

  switch (typ) {
    case "text":
    case "mehrzeilig":
    case "aufzaehlung":
      return String(roh);

    case "zahl": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return undefined;
      return zahlDe(n, stellen ?? 0, true);
    }
    case "flaeche": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return undefined;
      return `${zahlDe(n, stellen ?? 0, true)} m²`;
    }
    case "euro": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return undefined;
      return `${zahlDe(n, stellen ?? 0)} €`;
    }
    case "prozent": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return undefined;
      return `${zahlDe(n, stellen ?? 1)} %`;
    }
    case "jahr": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return undefined;
      // Ein Baujahr hat keinen Tausenderpunkt.
      return String(Math.trunc(n));
    }
    case "datum":
      return datumDe(roh);

    case "ja_nein":
      if (typeof roh === "boolean") return roh ? "ja" : "nein";
      return undefined;

    case "liste":
      return Array.isArray(roh) && roh.length ? String(roh.length) : undefined;

    case "bild":
      return String(roh);
  }
}

// ------------------------------------------------------------------ Lesen

/**
 * Liest einen Platzhalter aus den Daten. Der Schluessel ist der des
 * Katalogs; die Daten sind flach danach benannt, damit der Renderer nicht
 * die Tabellenstruktur kennen muss.
 */
export function rohwert(daten: Daten, schluessel: string): unknown {
  if (schluessel in daten) return daten[schluessel];
  return undefined;
}

/** Wert eines Platzhalters, fertig formatiert. `undefined` = kein Wert. */
export function wert(daten: Daten, schluessel: string): string | undefined {
  const f: Feld | undefined = feld(schluessel);
  const roh = rohwert(daten, schluessel);
  if (f === undefined) {
    // Kein Katalogfeld: unformatiert durchlassen, aber leer bleibt leer.
    return roh == null || roh === "" ? undefined : String(roh);
  }
  return formatiere(roh, f.typ, f.stellen);
}

/** Eine Liste (jsonb) als Feld. */
export function liste(daten: Daten, schluessel: string): unknown[] {
  const roh = rohwert(daten, schluessel);
  return Array.isArray(roh) ? roh : [];
}

// ----------------------------------------------------------- Platzhalter

const PLATZHALTER = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

/**
 * Ersetzt `{{objekt.wohnflaeche}}` und Verwandte.
 *
 * Fehlt ein Wert, gibt die Funktion `undefined` zurueck — der ganze Text
 * entfaellt dann. Das ist strenger als "Platzhalter leer lassen", und
 * zwar mit Absicht: "Wohnfläche:" ohne Zahl ist schlimmer als keine
 * Zeile. Soll ein Text einen fehlenden Wert ueberleben, markiert die
 * Vorlage den Platzhalter mit einem Fragezeichen: `{{objekt.etage?}}`.
 */
export function ersetze(daten: Daten, text: string): string | undefined {
  let etwasFehlt = false;
  const raus = text.replace(PLATZHALTER, (_treffer, schluessel: string) => {
    const freiwillig = schluessel.endsWith("?");
    const name = freiwillig ? schluessel.slice(0, -1) : schluessel;
    const w = wert(daten, name);
    if (w === undefined) {
      if (!freiwillig) etwasFehlt = true;
      return "";
    }
    return w;
  });
  if (etwasFehlt) return undefined;
  // Ein Text, der nur noch aus Fuellzeichen besteht, ist auch nichts.
  return raus.trim() === "" ? undefined : raus;
}

/** Welche Platzhalter ein Text benutzt — fuer den Editor. */
export function platzhalterIn(text: string): string[] {
  const raus: string[] = [];
  for (const t of text.matchAll(PLATZHALTER)) {
    const name = t[1].endsWith("?") ? t[1].slice(0, -1) : t[1];
    if (!raus.includes(name)) raus.push(name);
  }
  return raus;
}

// ------------------------------------------------------------ Bedingungen

/**
 * Prueft eine Bedingung. Bewusst ein Auswerter fuer Daten und kein
 * Ausdruck, der ausgefuehrt wird: eine Vorlage kann aus fremder Hand
 * kommen (Systemvorlage, spaeter Import), und dann darf in ihr nichts
 * Ausfuehrbares stehen.
 *
 * Vergleiche sind absichtlich tolerant gegenueber Gross- und
 * Kleinschreibung: in der Datenbank steht "Kauf", in einer Vorlage
 * schreibt jemand "kauf".
 */
export function trifftZu(daten: Daten, b: Bedingung | undefined): boolean {
  if (b === undefined) return true;

  if ("und" in b) return b.und.every((t) => trifftZu(daten, t));
  if ("oder" in b) return b.oder.some((t) => trifftZu(daten, t));
  if ("nicht" in b) return !trifftZu(daten, b.nicht);

  if ("vorhanden" in b) {
    const roh = rohwert(daten, b.vorhanden);
    if (roh == null) return false;
    if (Array.isArray(roh)) return roh.length > 0;
    if (typeof roh === "string") return roh.trim() !== "";
    if (typeof roh === "boolean") return roh;
    return true;
  }

  if ("gleich" in b) return vergleichbar(rohwert(daten, b.feld)) === vergleichbar(b.gleich);
  if ("ungleich" in b) return vergleichbar(rohwert(daten, b.feld)) !== vergleichbar(b.ungleich);
  if ("groesser" in b) {
    const n = Number(rohwert(daten, b.feld));
    return Number.isFinite(n) && n > b.groesser;
  }
  return true;
}

function vergleichbar(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v).trim().toLocaleLowerCase("de-DE");
}
