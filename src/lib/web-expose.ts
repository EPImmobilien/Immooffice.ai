/**
 * Begriffe und Hilfen fuer das oeffentliche Web-Expose (Abschnitt 8).
 */

export type WebExposeZustand =
  | "ok"
  | "passwort"
  | "unbekannt"
  | "abgelaufen"
  | "widerrufen";

export const ZUSTAND_TEXT: Record<Exclude<WebExposeZustand, "ok">, string> = {
  passwort: "Dieses Exposé ist mit einem Passwort geschützt.",
  unbekannt: "Dieser Link ist ungültig.",
  abgelaufen: "Dieser Link ist abgelaufen.",
  widerrufen: "Diese Veröffentlichung wurde zurückgezogen.",
};

/**
 * Erzeugt ein Token fuer die oeffentliche Adresse.
 *
 * 24 Zeichen aus einem Alphabet von 36 entsprechen rund 124 Bit — der Link ist
 * der einzige Zugangsschutz, wenn kein Passwort gesetzt ist, und darf sich
 * daher nicht erraten lassen. Gezogen wird aus dem kryptografischen
 * Zufallsgenerator, nicht aus `Math.random`.
 */
export function tokenErzeugen(laenge = 24): string {
  const zeichen = "abcdefghijklmnopqrstuvwxyz0123456789";
  const roh = new Uint8Array(laenge);
  crypto.getRandomValues(roh);

  // Der Rest bei 256 / 36 ist ungleich verteilt. Bei einem Link, dessen
  // Sicherheit allein an der Zufälligkeit haengt, wird der Ueberhang deshalb
  // verworfen statt zurechtgebogen.
  const grenze = 256 - (256 % zeichen.length);
  let ergebnis = "";
  let i = 0;
  while (ergebnis.length < laenge) {
    if (i >= roh.length) {
      crypto.getRandomValues(roh);
      i = 0;
    }
    const wert = roh[i]!;
    i += 1;
    if (wert < grenze) ergebnis += zeichen[wert % zeichen.length];
  }
  return ergebnis;
}

/** Vollstaendige Adresse des Web-Exposes. */
export function webExposeAdresse(token: string, basis: string): string {
  return `${basis.replace(/\/+$/, "")}/expose/${token}`;
}

/**
 * Ermittelt die oeffentliche Basisadresse.
 *
 * Vorrang hat die Umgebungsvariable — nur sie kennt die endgueltige Domain,
 * wenn die Anwendung hinter einem Proxy laeuft. Ohne sie wird der Host der
 * Anfrage verwendet, damit der Link auch in Vorschau-Umgebungen stimmt.
 */
export function basisUrlErmitteln(kopfzeilen: Headers): string {
  const gesetzt = process.env["NEXT_PUBLIC_APP_URL"];
  if (gesetzt) return gesetzt.replace(/\/+$/, "");

  const host = kopfzeilen.get("x-forwarded-host") ?? kopfzeilen.get("host") ?? "";
  const schema =
    kopfzeilen.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return host ? `${schema}://${host}` : "";
}
