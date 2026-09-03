/** Zeilen, wie die Seiten sie aus der Datenbank lesen — nur die Felder der Oberflaeche. */

export interface PostfachZeile {
  id: string;
  adresse: string;
  anzeigename: string | null;
  anbieter: "imap" | "microsoft" | "google";
  status: "neu" | "aktiv" | "fehler" | "getrennt";
  benutzer_id: string | null;
  intervall_minuten: number;
  signatur_anhaengen: boolean;
  letzter_abruf_am: string | null;
  fehler_text: string | null;
  fehler_zaehler: number;
}

export interface NachrichtZeile {
  id: string;
  postfach_id: string;
  ordner: "eingang" | "gesendet";
  von_adresse: string | null;
  von_name: string | null;
  an: Array<{ adresse: string; name?: string }>;
  betreff: string | null;
  vorschau: string | null;
  gesendet_am: string;
  gelesen: boolean;
  hat_anhaenge: boolean;
  kontakt_id: string | null;
  objekt_id: string | null;
  objekt_vorschlag_id: string | null;
  objekt_vorschlag_konfidenz: number | null;
}

export interface NachrichtDetailZeile extends NachrichtZeile {
  cc: Array<{ adresse: string; name?: string }>;
  text: string | null;
  message_id: string | null;
  inhalt_entfernt_am: string | null;
  zuordnung_art: "automatisch" | "manuell" | null;
  objekt_vorschlag_grund: string | null;
}

export interface AnhangZeile {
  id: string;
  dateiname: string;
  mime: string | null;
  bytes: number | null;
  dokument_id: string | null;
}

export interface ObjektKurz {
  id: string;
  objektnummer: string;
  bezeichnung: string;
}

export interface KontaktKurz {
  id: string;
  vorname: string | null;
  nachname: string | null;
  firma: string | null;
  email: string | null;
}

export interface FreigabeZeile {
  postfach_id: string;
  benutzer_id: string;
  darf_senden: boolean;
}

export interface BenutzerKurz {
  id: string;
  name: string;
  email: string;
}

export function kontaktName(k: KontaktKurz): string {
  const person = [k.vorname, k.nachname].filter(Boolean).join(" ");
  return person || k.firma || k.email || "Kontakt";
}

export function adresseAnzeigen(a: { adresse: string; name?: string | null }): string {
  return a.name ? `${a.name} <${a.adresse}>` : a.adresse;
}
