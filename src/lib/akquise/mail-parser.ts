import { OBJEKTARTEN } from "@/lib/akquise/stammdaten";

/**
 * Eigentuemer-Anfragen aus dem Posteingang erkennen (Referenz „Lead-Mails
 * übernehmen"): Anfragen ueber Website-Formulare, Bewertungsportale oder frei
 * geschriebene Mails („möchte mein Haus verkaufen"). Erkannt wird nur, was im
 * Text steht — alles bleibt im Formular editierbar.
 */
export interface ErkannterLead {
  erkannt: boolean;
  anrede: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  objektart: string | null;
  wohnflaeche: number | null;
  baujahr: number | null;
  nachricht: string;
}

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

function zahl(s: string | null): number | null {
  if (!s) return null;
  const m = /(\d{1,4}(?:[.,]\d)?)/.exec(s.replace(/\./g, ""));
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function eigentuemerAnfrageErkennen(eingang: { betreff: string | null; text: string | null; vonAdresse: string | null; vonName: string | null }): ErkannterLead {
  const text = (eingang.text ?? "").replace(/\r/g, "");
  const gesamt = `${eingang.betreff ?? ""}\n${text}`;
  const verkaufsabsicht = /verkauf|verkaufen|wertermittlung|bewertung|einwertung|immobilie anbieten|was ist mein.*wert/i.test(gesamt);

  const name = feld(text, "Name", "Eigentümer", "Absender", "Kontakt") ?? eingang.vonName ?? "";
  const { anrede, vorname, nachname } = nameTeilen(name);
  const emailFeld = feld(text, "E-Mail", "Email", "Mail");
  const emailMatch = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(emailFeld ?? "") ?? (eingang.vonAdresse ? /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(eingang.vonAdresse) : null);
  const telefon = feld(text, "Telefon", "Tel", "Telefonnummer", "Mobil", "Handy") ?? (/(?:\+49|0)[\d\s/()-]{7,20}/.exec(text)?.[0]?.trim() ?? null);

  let strasse = feld(text, "Straße", "Strasse", "Adresse", "Anschrift", "Objektadresse") ?? "";
  let hausnummer = "";
  let plz = feld(text, "PLZ", "Postleitzahl") ?? "";
  let ort = feld(text, "Ort", "Stadt") ?? "";
  // „Musterstraße 12, 60311 Frankfurt" in einer Zeile
  const adr = /([A-ZÄÖÜ][\wäöüß.\- ]{2,60}?)\s+(\d{1,4}\s?[a-zA-Z]?)\s*,\s*(\d{5})\s+([A-ZÄÖÜ][\wäöüß\- ]{2,40})/.exec(strasse || text);
  if (adr) {
    strasse = adr[1]?.trim() ?? strasse;
    hausnummer = adr[2]?.replace(/\s+/g, "") ?? "";
    plz = plz || (adr[3] ?? "");
    ort = ort || (adr[4]?.trim() ?? "");
  } else {
    const hn = /^(.*?)\s+(\d{1,4}\s?[a-zA-Z]?)$/.exec(strasse.trim());
    if (hn?.[1] && hn[2]) { strasse = hn[1]; hausnummer = hn[2].replace(/\s+/g, ""); }
    if (!plz) { const p = /\b(\d{5})\b\s+([A-ZÄÖÜ][\wäöüß\- ]{2,40})/.exec(text); if (p?.[1]) { plz = p[1]; ort = ort || (p[2]?.trim() ?? ""); } }
  }

  const artFeld = feld(text, "Objektart", "Immobilienart", "Art der Immobilie", "Immobilie");
  let objektart: string | null = null;
  const suche = `${artFeld ?? ""} ${gesamt}`.toLowerCase();
  for (const o of OBJEKTARTEN) {
    if (suche.includes(o.toLowerCase())) { objektart = o; break; }
  }
  if (!objektart) {
    if (/\bwohnung\b|\betw\b/.test(suche)) objektart = "Eigentumswohnung";
    else if (/\bhaus\b|\befh\b/.test(suche)) objektart = "Einfamilienhaus";
    else if (/grundstück|grundstueck/.test(suche)) objektart = "Grundstück";
  }
  const wohnflaeche = zahl(feld(text, "Wohnfläche", "Wohnflaeche", "Fläche") ?? /(\d{2,4})\s?(?:m²|qm|m2)/i.exec(text)?.[1] ?? null);
  const baujahrText = feld(text, "Baujahr") ?? /baujahr\D{0,5}(\d{4})/i.exec(text)?.[1] ?? null;
  const baujahr = baujahrText ? Number(/\d{4}/.exec(baujahrText)?.[0]) || null : null;
  const nachricht = feld(text, "Nachricht", "Mitteilung", "Anmerkung", "Bemerkung") ?? text.trim().slice(0, 1500);

  return {
    erkannt: verkaufsabsicht || Boolean(strasse && plz),
    anrede, vorname, nachname: nachname || (emailMatch?.[0] ?? ""),
    email: emailMatch?.[0] ?? null,
    telefon,
    strasse, hausnummer, plz, ort,
    objektart, wohnflaeche, baujahr, nachricht,
  };
}
