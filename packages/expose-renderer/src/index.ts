// ============================================================================
// Was das Paket nach aussen gibt
// ----------------------------------------------------------------------------
// Diese Datei ist die einzige Tuer. Was hier nicht steht, ist Innenleben
// und darf sich aendern, ohne dass Oberflaeche oder Edge Function etwas
// merken.
// ============================================================================

export { rendern } from "./rendern";
export type { Auftrag, Ergebnis } from "./rendern";
export { zuPdf } from "./pdf";
export type { PdfAuftrag, PdfWerkzeug } from "./pdf";
export { metrikLesen, breite, fehlendeZeichen } from "./schrift";
export type { Metrik } from "./schrift";
export { vorlagePruefen } from "./pruefen";
export type { Befund } from "./pruefen";
export { KATALOG, OBJEKT, ANSPRECHPARTNER, FIRMA, RECHNUNG, SEITE, feld } from "./felder";
export { aufbereiten } from "./aufbereiten";
export type { Quellen } from "./aufbereiten";
export { rechnen, grunderwerbsteuerSatz, courtageSatz } from "./rechnen";
export type { Annahmen } from "./rechnen";
export type { Feld, FeldTyp } from "./felder";
export { paletteFuer, farbe, schnittName, stilAus, textstil } from "./stil";
export type { Marke, Palette, FesterStil } from "./stil";
export { palette, hx, hex, mix, helligkeit, VORGABE } from "./farben";
export type { Farbe, Ableitung } from "./farben";
export { ersetze, formatiere, platzhalterIn, trifftZu, wert, zahlDe, datumDe } from "./werte";
export type { Daten } from "./werte";
export { ELEMENTE } from "./elemente";
export { flach, bildKasten } from "./schritte";
export type { Schritt, Seitenbild, RGBA } from "./schritte";
export { A4 } from "./schema";
export type { Vorlage, Seite, Element, Overrides, Bedingung } from "./schema";
export type { Warnung, WarnungArt } from "./umgebung";
export { Zufall } from "./zufall";

/** Welche Schnitte assets/fonts/expose/ fuehrt. */
export const SCHNITTE = [
  "Jak-Light", "Jak-Regular", "Jak-Medium", "Jak-SemiBold", "Jak-Bold",
  "Jak-ExtraBold",
  "Corm-Light", "Corm-Regular", "Corm-Medium", "Corm-SemiBold",
  "Corm-LightItalic", "Corm-RegularItalic", "Corm-MediumItalic",
  "Arch-Light", "Arch-Regular", "Arch-Medium", "Arch-SemiBold", "Arch-Bold",
  "Arch-CondXB", "Arch-CondBlack",
] as const;
