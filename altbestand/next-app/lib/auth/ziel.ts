/**
 * Pruefung von Weiterleitungszielen.
 *
 * Zwei Stellen leiten nach erfolgreicher Anmeldung weiter: die Anmeldeaktion
 * (Parameter `weiter`) und der Ruecklaeufer der Mail-Links (Parameter `next`).
 * Beide bekamen ihr Ziel aus der Adresszeile, und beide hatten ihre eigene
 * Pruefung — eine Verdopplung, bei der die eine Fassung irgendwann strenger ist
 * als die andere.
 *
 * Ohne Pruefung waere jede dieser Stellen eine offene Weiterleitung: Ein Link
 * auf die eigene, vertraute Adresse, der auf einer fremden endet. Das ist die
 * Grundlage jeder glaubwuerdigen Anmeldeseiten-Faelschung — der Nutzer sieht den
 * richtigen Absender und gibt seine Zugangsdaten woanders ein.
 */

/**
 * Liefert das Ziel, wenn es innerhalb der Anwendung liegt, sonst das Rueckfallziel.
 *
 * Abgewiesen werden ausdruecklich auch:
 *   `//fremde.example`  — kein relativer Pfad, sondern eine Adresse ohne Schema
 *   `/\fremde.example`  — Browser deuten den Rueckstrich wie einen Schraegstrich
 *   `https://…`         — jede vollstaendige Adresse
 */
export function sicheresZiel(
  ziel: string | null | undefined,
  rueckfall = "/dashboard",
): string {
  if (!ziel) return rueckfall;

  const wert = ziel.trim();
  if (wert === "" || !wert.startsWith("/")) return rueckfall;

  // Ein zweites Zeichen, das wie ein Trenner gelesen werden kann, macht aus dem
  // Pfad eine Adresse mit Hostangabe.
  if (wert.startsWith("//") || wert.startsWith("/\\")) return rueckfall;

  return wert;
}
