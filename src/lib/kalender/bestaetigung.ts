import { TERMINARTEN, type Terminart } from "@/lib/arbeitsmittel";

import { berlin, datumLang } from "./zeit";

/** Ort eines Termins: eigener Ort, sonst Objektanschrift. */
export function terminOrtText(t: { ort: string | null }, objekt: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null } | null): string {
  if (t.ort) return t.ort;
  if (objekt) return [[objekt.strasse, objekt.hausnummer].filter(Boolean).join(" "), [objekt.plz, objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return "";
}

export function terminAnrede(k: { anrede?: string | null; nachname?: string | null; vorname?: string | null; firma?: string | null }): string {
  const name = k.nachname ?? "";
  if (k.anrede === "Frau" && name) return `Sehr geehrte Frau ${name},`;
  if (k.anrede === "Herr" && name) return `Sehr geehrter Herr ${name},`;
  if (k.vorname && name) return `Guten Tag ${k.vorname} ${name},`;
  return "Sehr geehrte Damen und Herren,";
}

export function terminArtText(art: string): string {
  const a = TERMINARTEN[art as Terminart];
  return a && art !== "sonstiges" ? a : "Termin";
}

/** Text der Terminbestaetigung (Referenz: Haekchen im Termin-Dialog, .ics im Anhang). */
export function terminBestaetigungText(t: { art: string; beginnt_am: string; ganztags: boolean; ort: string | null }, kontakt: { anrede?: string | null; vorname?: string | null; nachname?: string | null; firma?: string | null }, objekt: { objektnummer?: string; bezeichnung?: string; strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null } | null, maklerName: string, firma: string): string {
  const art = terminArtText(t.art);
  const b = berlin(t.beginnt_am);
  const wann = t.ganztags ? `am ${datumLang(b.datum)}` : `am ${datumLang(b.datum)} um ${b.zeit} Uhr`;
  const ort = terminOrtText(t, objekt);
  const objektZeile = objekt ? ` (${[objekt.objektnummer, objekt.bezeichnung].filter(Boolean).join(" · ")})` : "";
  return `${terminAnrede(kontakt)}\n\nhiermit bestätige ich Ihnen gerne unseren Termin:\n\n${art}${objektZeile}\n${wann}${ort ? `\nOrt: ${ort}` : ""}\n\nEinen Kalendereintrag habe ich Ihnen angehängt. Sollte Ihnen der Termin doch nicht passen, geben Sie mir bitte kurz Bescheid – dann finden wir eine Alternative.\n\nIch freue mich auf unser Treffen!\n\nMit freundlichen Grüßen\n${maklerName}\n${firma}`;
}

export function terminBestaetigungBetreff(t: { art: string; beginnt_am: string; ganztags: boolean }): string {
  const b = berlin(t.beginnt_am);
  return `Terminbestätigung: ${terminArtText(t.art)} am ${b.datum.split("-").reverse().join(".")}${t.ganztags ? "" : ` um ${b.zeit} Uhr`}`;
}

/** Erinnerungs-Mail an die Beteiligten (Systemversand). */
export function terminErinnerungMail(t: { titel: string; art: string; beginnt_am: string; endet_am: string; ganztags: boolean; ort: string | null; notiz: string | null }, link: string): { betreff: string; text: string } {
  const b = berlin(t.beginnt_am);
  const e = berlin(t.endet_am);
  const wann = t.ganztags ? `${datumLang(b.datum)} (ganztägig)` : `${datumLang(b.datum)}, ${b.zeit}–${e.zeit} Uhr`;
  return {
    betreff: `Erinnerung: ${t.titel} — ${b.datum.split("-").reverse().join(".")}${t.ganztags ? "" : ` ${b.zeit} Uhr`}`,
    text: `Erinnerung an Ihren Termin:\n\n${t.titel} (${terminArtText(t.art)})\n${wann}${t.ort ? `\nOrt: ${t.ort}` : ""}${t.notiz ? `\n\n${t.notiz}` : ""}\n\nZum Termin: ${link}`,
  };
}
