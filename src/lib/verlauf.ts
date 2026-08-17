/**
 * Begriffe rund um den Verlauf zu Objekten und Kontakten.
 *
 * Der Verlauf ist das, was aus einer Sammlung von Datensaetzen einen
 * Arbeitsablauf macht: Wer hat wann welche Unterlage bekommen, wann wurde der
 * Status gewechselt, wann war die Besichtigung. Er entsteht zum Teil von
 * selbst — Datenbank-Trigger schreiben ihn beim Anlegen eines Objekts und beim
 * Hinzufuegen von Unterlagen und Bildern —, und zum Teil von Hand.
 *
 * Nachtraeglich aendern oder loeschen laesst er sich nicht. Das ist in der
 * Datenbank verankert (keine UPDATE- und keine DELETE-Policy) und nicht bloss
 * eine Frage der Oberflaeche.
 */

export const AKTIVITAETSTYPEN = {
  objekt_angelegt: "Objekt angelegt",
  objekt_geaendert: "Objekt geändert",
  status_geaendert: "Status geändert",
  dokument_hinzugefuegt: "Unterlage hinzugefügt",
  bild_hinzugefuegt: "Bild hinzugefügt",
  expose_erzeugt: "Exposé erzeugt",
  web_expose_veroeffentlicht: "Web-Exposé veröffentlicht",
  web_expose_widerrufen: "Web-Exposé widerrufen",
  portal_uebertragen: "An Portal übertragen",
  kontakt_verknuepft: "Kontakt verknüpft",
  notiz: "Notiz",
  anruf: "Anruf",
  email: "E-Mail",
  besichtigung: "Besichtigung",
  angebot: "Angebot",
  sonstiges: "Sonstiges",
} as const;

export type Aktivitaetstyp = keyof typeof AKTIVITAETSTYPEN;

/**
 * Typen, die von Hand eingetragen werden koennen.
 *
 * Die uebrigen entstehen ausschliesslich aus dem System. Sie hier anzubieten
 * hiesse, dem Nutzer das Faelschen des Verlaufs zu erlauben: Ein handgeschriebenes
 * „Status geändert" waere von einem echten nicht zu unterscheiden.
 */
export const HANDEINTRAG: readonly Aktivitaetstyp[] = [
  "notiz",
  "anruf",
  "email",
  "besichtigung",
  "angebot",
  "sonstiges",
];

/**
 * Zuordnung zu einer Farbfamilie fuer die Anzeige.
 *
 * Bewusst grob: Vier Gruppen sind unterscheidbar, sechzehn Farben waeren ein
 * Muster ohne Aussage.
 */
export function verlaufsgruppe(
  typ: Aktivitaetstyp,
): "system" | "veroeffentlichung" | "kontakt" | "notiz" {
  switch (typ) {
    case "web_expose_veroeffentlicht":
    case "web_expose_widerrufen":
    case "portal_uebertragen":
    case "expose_erzeugt":
      return "veroeffentlichung";
    case "anruf":
    case "email":
    case "besichtigung":
    case "angebot":
    case "kontakt_verknuepft":
      return "kontakt";
    case "notiz":
    case "sonstiges":
      return "notiz";
    default:
      return "system";
  }
}

export interface Verlaufseintrag {
  id: string;
  typ: Aktivitaetstyp;
  beschreibung: string;
  metadaten: Record<string, unknown>;
  erstellt_am: string;
  benutzer: { name: string } | null;
}
