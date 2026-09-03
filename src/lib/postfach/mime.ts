import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import { htmlZuText } from "./text";
import type { Adresse, AnhangInfo, EingangsNachricht } from "./typen";

/**
 * RFC-822-Quelltext in das gespeicherte Bild einer Nachricht ueberfuehren
 * (gemeinsam fuer IMAP und Google). Gespeichert wird nur Text (P4); die
 * Anhaenge kommen als Kennung, Name, Typ und Groesse — der Inhalt bleibt beim
 * Anbieter, bis jemand ihn uebernimmt.
 */

export type MimeNachricht = Omit<EingangsNachricht, "externId" | "gelesen" | "threadId">;

export interface MimeAnhang extends AnhangInfo {
  inhalt: Uint8Array;
}

export interface MimeErgebnis {
  nachricht: MimeNachricht;
  anhaenge: MimeAnhang[];
}

function adressen(obj: AddressObject | AddressObject[] | undefined): Adresse[] {
  const liste = Array.isArray(obj) ? obj : obj ? [obj] : [];
  const ergebnis: Adresse[] = [];
  for (const a of liste) {
    for (const e of a.value) {
      if (!e.address) continue;
      ergebnis.push(e.name ? { adresse: e.address, name: e.name } : { adresse: e.address });
    }
  }
  return ergebnis;
}

export async function mimeParsen(quelle: Uint8Array | string): Promise<MimeErgebnis> {
  const mail: ParsedMail = await simpleParser(
    typeof quelle === "string" ? quelle : Buffer.from(quelle),
    { skipImageLinks: true, skipTextToHtml: true },
  );

  let text: string | null = mail.text?.trim() ? mail.text.trim() : null;
  if (!text && typeof mail.html === "string") text = htmlZuText(mail.html) || null;

  const anhaenge: MimeAnhang[] = [];
  for (const a of mail.attachments) {
    // Eingebettete Bilder (Signaturlogos) sind keine Unterlagen.
    if (a.related || (a.contentDisposition === "inline" && a.contentType.startsWith("image/"))) continue;
    anhaenge.push({
      externId: a.checksum,
      dateiname: a.filename ?? "Anhang",
      mime: a.contentType || null,
      bytes: a.size ?? a.content.length,
      inhalt: new Uint8Array(a.content),
    });
  }

  const referenzen = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : [];
  return {
    nachricht: {
      messageId: mail.messageId ?? null,
      inReplyTo: mail.inReplyTo ?? referenzen.at(-1) ?? null,
      von: adressen(mail.from)[0] ?? null,
      an: adressen(mail.to),
      cc: adressen(mail.cc),
      betreff: mail.subject?.trim() || null,
      text,
      gesendetAm: (mail.date ?? new Date()).toISOString(),
      anhaenge: anhaenge.map(({ inhalt: _inhalt, ...info }) => info),
    },
    anhaenge,
  };
}

// ---------------------------------------------------------------------------
// Ausgehend: RFC-822-Quelltext bauen (SMTP und Google senden „raw“).
// ---------------------------------------------------------------------------

import MailComposer from "nodemailer/lib/mail-composer";

import type { Sendeauftrag } from "./typen";

export function adresseFormatieren(a: Adresse): string {
  if (!a.name) return a.adresse;
  const name = a.name.replace(/["\\]/g, "");
  return `"${name}" <${a.adresse}>`;
}

export async function rohNachricht(absender: Adresse, auftrag: Sendeauftrag): Promise<{ inhalt: Buffer; messageId: string }> {
  const composer = new MailComposer({
    from: adresseFormatieren(absender),
    to: auftrag.an.map(adresseFormatieren),
    ...(auftrag.cc && auftrag.cc.length > 0 ? { cc: auftrag.cc.map(adresseFormatieren) } : {}),
    subject: auftrag.betreff,
    text: auftrag.text,
    ...(auftrag.inReplyTo ? { inReplyTo: auftrag.inReplyTo } : {}),
    ...(auftrag.references && auftrag.references.length > 0 ? { references: auftrag.references.join(" ") } : {}),
  });
  const knoten = composer.compile();
  const messageId = knoten.messageId();
  const inhalt = await knoten.build();
  return { inhalt, messageId };
}
