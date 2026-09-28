/**
 * Logo-Ablage des Mandanten.
 *
 * Der einzige oeffentlich lesbare Bucket. Das ist bewusst so: Ein Logo
 * erscheint in jedem Exposé, auf jeder oeffentlichen Seite und in jedem
 * Marketingmotiv. Es geheim zu halten waere sinnlos — und signierte Verweise
 * wuerden in einem einmal erzeugten PDF nach einer Stunde brechen.
 *
 * Geschrieben werden darf trotzdem nur im eigenen Mandantenordner, und nur von
 * der Verwaltung. Das erzwingen die Storage-Policies.
 */

export const MARKE_BUCKET = "marke";

export const LOGO_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

/** 2 MB — dieselbe Grenze wie im Bucket, damit der Fehler frueh sichtbar wird. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Baut den Speicherpfad des Logos.
 *
 * Erstes Segment ist die Mandanten-ID; darauf stuetzen sich die Policies. Der
 * Zufallsanteil ist hier kein Schutz, sondern verhindert, dass ein Browser das
 * alte Logo aus dem Zwischenspeicher zeigt, nachdem ein neues hochgeladen
 * wurde.
 */
export function logoPfad(mandantId: string, dateiname: string): string {
  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "png";
  const sicher = /^[a-z0-9]{1,5}$/.test(endung) ? endung : "png";
  return `${mandantId}/logo-${crypto.randomUUID()}.${sicher}`;
}

/** Oeffentliche Adresse einer Datei im Marke-Bucket. */
export function markeUrl(supabaseUrl: string, pfad: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${MARKE_BUCKET}/${pfad}`;
}
