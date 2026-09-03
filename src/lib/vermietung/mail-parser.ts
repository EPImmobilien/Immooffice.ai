/**
 * Portalanfragen aus E-Mails erkennen (docs/FUNKTIONSABGLEICH.md M1).
 *
 * Die grossen Portale senden Anfragen als strukturierte Mails („Name:",
 * „E-Mail:", „Telefon:", Objektnummer/Scout-ID). Der Parser holt daraus die
 * Felder fuer eine Mietanfrage — ohne KI, mit sichtbaren Regeln. Das Ergebnis
 * belegt ein Formular vor und wird vom Makler geprueft.
 */
export interface ErkannteAnfrage {
  erkannt: boolean;
  portal: "immoscout" | "immowelt" | "kleinanzeigen" | "immonet" | "web" | "unbekannt";
  anrede: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  nachricht: string;
  objektnummer: string | null;
  einzugAb: string | null;
  personen: number | null;
}

const PORTALE: Array<{ schluessel: ErkannteAnfrage["portal"]; muster: RegExp }> = [
  { schluessel: "immoscout", muster: /immobilienscout24|immoscout|scout-id/i },
  { schluessel: "immowelt", muster: /immowelt/i },
  { schluessel: "kleinanzeigen", muster: /kleinanzeigen/i },
  { schluessel: "immonet", muster: /immonet/i },
];

function feld(text: string, ...bezeichner: string[]): string | null {
  for (const b of bezeichner) {
    const re = new RegExp(`(?:^|\\n)\\s*${b}\\s*[:：]\\s*([^\\n]{1,200})`, "i");
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function nameTeilen(voll: string): { anrede: string; vorname: string; nachname: string } {
  let rest = voll.replace(/\s+/g, " ").trim();
  let anrede = "";
  const m = /^(Herr|Frau|Familie|Dr\.|Prof\.)\s+/i.exec(rest);
  if (m?.[1]) {
    anrede = m[1].replace(/\.$/, "");
    rest = rest.slice(m[0].length);
  }
  const teile = rest.split(" ").filter(Boolean);
  if (teile.length <= 1) return { anrede, vorname: "", nachname: rest };
  return { anrede, vorname: teile.slice(0, -1).join(" "), nachname: teile.at(-1) ?? rest };
}

export function portalAnfrageErkennen(eingang: { betreff: string | null; text: string | null; vonAdresse: string | null; vonName: string | null }): ErkannteAnfrage {
  const betreff = eingang.betreff ?? "";
  const text = (eingang.text ?? "").replace(/\r/g, "");
  const gesamt = `${betreff}\n${eingang.vonAdresse ?? ""}\n${text}`;
  const portal = PORTALE.find((p) => p.muster.test(gesamt))?.schluessel ?? (/anfrage|interesse|besichtigung|exposé|expose/i.test(betreff) ? "web" : "unbekannt");

  const nameRoh = feld(text, "Name", "Vor- und Nachname", "Interessent", "Anfragender", "Kontakt");
  const emailRoh = feld(text, "E-Mail", "Email", "E-Mail-Adresse", "Mail");
  const emailImText = emailRoh ?? /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0] ?? null;
  const email = (emailImText ?? "").toLowerCase().replace(/[<>]/g, "").trim() || null;
  // Portale schreiben mit einer Weiterleitungsadresse; die echte Adresse steht im Text.
  const absenderIstPortal = portal !== "web" && portal !== "unbekannt";
  const emailEndgueltig = email ?? (absenderIstPortal ? null : eingang.vonAdresse);
  const telefon = feld(text, "Telefon", "Telefonnummer", "Tel", "Handy", "Mobil");
  const objektnummer = feld(text, "Objekt-Nr", "Objektnummer", "Objekt-ID", "Ihre Objektnummer", "Externe Objektnummer", "Referenz", "Kennung")
    ?? /(?:Objekt(?:-|\s)?(?:Nr\.?|nummer)|Kennung)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,})/i.exec(betreff)?.[1]
    ?? null;
  const einzug = feld(text, "Einzug ab", "Einzugsdatum", "Gewünschter Einzug", "Umzug ab");
  const personenRoh = feld(text, "Personen", "Anzahl Personen", "Haushaltsgröße");
  const personen = personenRoh ? Number.parseInt(personenRoh, 10) : NaN;

  const nachrichtRoh = feld(text, "Nachricht", "Mitteilung", "Anfrage", "Text") ?? "";
  const nachricht = nachrichtRoh || text.split("\n").filter((z) => z.trim() && !/^[A-Za-zÄÖÜäöü-]{2,30}\s*[:：]/.test(z)).slice(0, 12).join("\n").trim();

  const name = nameTeilen(nameRoh ?? eingang.vonName ?? "");
  const erkannt = Boolean((name.nachname || emailEndgueltig) && (absenderIstPortal || nameRoh || /anfrage|interesse|besichtigung/i.test(betreff)));

  return {
    erkannt,
    portal,
    anrede: name.anrede,
    vorname: name.vorname,
    nachname: name.nachname,
    email: emailEndgueltig,
    telefon,
    nachricht: nachricht.slice(0, 4000),
    objektnummer,
    einzugAb: einzug,
    personen: Number.isFinite(personen) ? personen : null,
  };
}
