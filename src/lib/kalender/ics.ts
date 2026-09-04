import { berlin, tagPlus } from "./zeit";

/**
 * iCalendar (RFC 5545): Kalenderdatei fuer Terminbestaetigungen und der
 * Abo-Feed, den Apple-, Google- und Outlook-Kalender abonnieren koennen.
 */

export interface IcsTermin {
  id: string;
  titel: string;
  beginnt_am: string;
  endet_am: string;
  ganztags?: boolean;
  ort?: string | null;
  beschreibung?: string | null;
  abgesagt?: boolean;
  geaendert_am?: string | null;
  url?: string | null;
}

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function utc(wert: string | Date): string {
  const d = typeof wert === "string" ? new Date(wert) : wert;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Zeilen laenger als 75 Oktette werden gefaltet (RFC 5545, 3.1). */
function falten(zeile: string): string {
  const teile: string[] = [];
  let rest = zeile;
  while (rest.length > 74) {
    teile.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  teile.push(rest);
  return teile.join("\r\n");
}

export function icsEreignis(t: IcsTermin, jetzt: Date = new Date()): string[] {
  const zeilen = ["BEGIN:VEVENT", `UID:${t.id}@immooffice.ai`, `DTSTAMP:${utc(jetzt)}`];
  if (t.ganztags) {
    const von = berlin(t.beginnt_am).datum;
    const bisTag = berlin(new Date(new Date(t.endet_am).getTime() - 1)).datum; // Ende exklusiv
    zeilen.push(`DTSTART;VALUE=DATE:${von.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${tagPlus(bisTag, 1).replace(/-/g, "")}`);
  } else {
    zeilen.push(`DTSTART:${utc(t.beginnt_am)}`, `DTEND:${utc(t.endet_am)}`);
  }
  zeilen.push(`SUMMARY:${esc(t.titel)}`);
  if (t.ort) zeilen.push(`LOCATION:${esc(t.ort)}`);
  if (t.beschreibung) zeilen.push(`DESCRIPTION:${esc(t.beschreibung)}`);
  if (t.url) zeilen.push(`URL:${t.url}`);
  if (t.geaendert_am) zeilen.push(`LAST-MODIFIED:${utc(t.geaendert_am)}`);
  zeilen.push(`STATUS:${t.abgesagt ? "CANCELLED" : "CONFIRMED"}`);
  if (t.abgesagt) zeilen.push("SEQUENCE:1");
  zeilen.push("END:VEVENT");
  return zeilen;
}

export function icsKalender(termine: IcsTermin[], name = "ImmoOffice.ai", jetzt: Date = new Date()): string {
  const zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ImmoOffice.ai//Kalender//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Europe/Berlin"];
  for (const t of termine) zeilen.push(...icsEreignis(t, jetzt));
  zeilen.push("END:VCALENDAR");
  return `${zeilen.map(falten).join("\r\n")}\r\n`;
}
