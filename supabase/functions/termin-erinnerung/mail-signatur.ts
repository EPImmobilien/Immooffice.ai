// mail-signatur.ts – gemeinsame Regel fuer alle Mail-Functions (26.09.2026)
// Ein Text bekommt die Postfach-Signatur genau EINMAL: Steht am Textende schon eine Grussformel
// (z. B. "Mit freundlichen Gruessen" + Name aus einer Vorlage), wird sie abgeschnitten und durch die
// Signatur ersetzt; steckt die Signatur bereits im Text (sichtbare Signatur aus dem Verfassen-
// Fenster), bleibt alles wie es ist. Ohne Signatur bleibt die Grussformel des Textes erhalten.

const GRUSS_ZEILE = /^\s*(?:mit\s+(?:freundlichen|besten|herzlichen|lieben|sonnigen)\s+gr(?:ü|ue)(?:ß|ss)en|(?:freundliche|viele|beste|herzliche|liebe|sch(?:ö|oe)ne|sonnige)\s+gr(?:ü|ue)(?:ß|ss)e|hochachtungsvoll|mfg|vg|lg)\s*[,.!]?\s*$/i;

/** Schneidet eine Grussformel samt der Zeilen dahinter (Name, Firma) am Textende ab. */
export function grussAbschneiden(text: string): string {
  const zeilen = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  for (let i = zeilen.length - 1, n = 0; i >= 0 && n < 10; i--, n++) {
    if (GRUSS_ZEILE.test(zeilen[i])) return zeilen.slice(0, i).join("\n").replace(/\s+$/, "");
  }
  return String(text || "").replace(/\s+$/, "");
}

/** Text plus Signatur, ohne doppelte Grussformel. */
export function mitSignatur(text: string, signatur: string | null | undefined): string {
  const sig = String(signatur || "").trim();
  const t = String(text || "").replace(/\s+$/, "");
  if (!sig) return t;
  if (t.includes(sig)) return t;
  return `${grussAbschneiden(t)}\n\n${sig}`;
}
