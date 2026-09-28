/**
 * Fuegt Klassennamen zusammen und verwirft leere Werte.
 *
 * Bewusst ohne zusaetzliche Abhaengigkeit: das Designsystem setzt auf klar
 * getrennte Varianten statt auf das Ueberschreiben von Utility-Klassen, damit
 * hier keine Konfliktaufloesung noetig ist.
 */
export function cn(...teile: Array<string | false | null | undefined>): string {
  return teile.filter(Boolean).join(" ");
}
