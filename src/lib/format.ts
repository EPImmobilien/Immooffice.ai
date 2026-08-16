/**
 * Einheitliche deutsche Formatierung.
 *
 * Bewusst zentral: Waehrungs- und Flaechenangaben tauchen in Listen, Exposés
 * und PDF auf. Unterschiedliche Schreibweisen an verschiedenen Stellen wirken
 * unprofessionell und fallen Maklern sofort auf.
 */

const EURO = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const EURO_GENAU = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const DEZIMAL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

const DATUM = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function euro(wert: number | null | undefined, genau = false): string {
  if (wert === null || wert === undefined) return "–";
  return genau ? EURO_GENAU.format(wert) : EURO.format(wert);
}

export function flaeche(wert: number | null | undefined): string {
  if (wert === null || wert === undefined) return "–";
  return `${DEZIMAL.format(wert)} m²`;
}

export function zahl(wert: number | null | undefined): string {
  if (wert === null || wert === undefined) return "–";
  return DEZIMAL.format(wert);
}

export function datum(wert: string | Date | null | undefined): string {
  if (!wert) return "–";
  const d = typeof wert === "string" ? new Date(wert) : wert;
  return Number.isNaN(d.getTime()) ? "–" : DATUM.format(d);
}

/** Adresse in einer Zeile, ohne leere Bestandteile. */
export function adresse(objekt: {
  strasse?: string | null;
  hausnummer?: string | null;
  plz?: string | null;
  ort?: string | null;
}): string {
  const strasse = [objekt.strasse, objekt.hausnummer].filter(Boolean).join(" ");
  const ort = [objekt.plz, objekt.ort].filter(Boolean).join(" ");
  return [strasse, ort].filter(Boolean).join(", ") || "Keine Adresse hinterlegt";
}
