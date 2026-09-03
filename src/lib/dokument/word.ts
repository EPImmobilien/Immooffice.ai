import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

import type { Briefkopf, Dokument } from "./struktur";

/**
 * Word-Fassung (DOCX) aus derselben Dokumentstruktur wie das PDF. Wer den
 * Text vor der Unterschrift noch anpassen will, nimmt Word; das PDF ist die
 * unveraenderliche Fassung.
 */
function dataUrlZuBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!m?.[2]) return null;
  return new Uint8Array(Buffer.from(m[2], "base64"));
}

export async function dokumentAlsWord(dokument: Dokument, kopf: Briefkopf): Promise<Buffer> {
  const kinder: (Paragraph | Table)[] = [];
  kinder.push(new Paragraph({ children: [new TextRun({ text: kopf.firmenname, bold: true, size: 20 })], spacing: { after: 0 } }));
  for (const z of [kopf.zeile2, kopf.zeile3]) {
    if (z) kinder.push(new Paragraph({ children: [new TextRun({ text: z, size: 16, color: "7A828C" })], spacing: { after: 0 } }));
  }
  kinder.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  kinder.push(new Paragraph({ text: dokument.titel, heading: HeadingLevel.TITLE }));
  if (dokument.untertitel) kinder.push(new Paragraph({ children: [new TextRun({ text: dokument.untertitel, color: "7A828C" })], spacing: { after: 200 } }));

  for (const a of dokument.abschnitte) {
    if (a.ueberschrift) kinder.push(new Paragraph({ text: a.ueberschrift, heading: HeadingLevel.HEADING_2, pageBreakBefore: a.neueSeite ?? false, spacing: { before: 200, after: 80 } }));
    for (const t of a.absaetze ?? []) kinder.push(new Paragraph({ text: t, spacing: { after: 100 } }));
    if (a.tabelle && a.tabelle.zeilen.length > 0) {
      const rand = { style: BorderStyle.SINGLE, size: 4, color: "E6E8EB" };
      const zelle = (text: string, fett = false) =>
        new TableCell({ borders: { top: rand, bottom: rand, left: rand, right: rand }, children: [new Paragraph({ children: [new TextRun({ text, bold: fett, size: 18 })] })] });
      kinder.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: a.tabelle.spalten.map((s) => zelle(s, true)) }),
          ...a.tabelle.zeilen.map((z) => new TableRow({ children: z.map((w) => zelle(w)) })),
        ],
      }));
      kinder.push(new Paragraph({ text: "" }));
    }
    if (a.unterschriften) {
      for (const u of a.unterschriften) {
        const bytes = u.bild ? dataUrlZuBytes(u.bild) : null;
        if (bytes) {
          kinder.push(new Paragraph({ children: [new ImageRun({ type: u.bild?.startsWith("data:image/jpeg") ? "jpg" : "png", data: bytes, transformation: { width: 180, height: 60 }, altText: { title: "Unterschrift", description: u.bezeichnung, name: "Unterschrift" } })], spacing: { before: 300 } }));
        } else {
          kinder.push(new Paragraph({ text: "", spacing: { before: 500 } }));
        }
        kinder.push(new Paragraph({ children: [new TextRun({ text: "______________________________", color: "1B2A47" })], spacing: { after: 0 } }));
        kinder.push(new Paragraph({ children: [new TextRun({ text: `${u.bezeichnung}${u.name ? ` — ${u.name}` : ""}${u.zeit ? ` · ${new Date(u.zeit).toLocaleString("de-DE")}` : ""}`, size: 16, color: "7A828C" })], spacing: { after: 200 } }));
      }
    }
  }
  if (dokument.fussnote) kinder.push(new Paragraph({ children: [new TextRun({ text: dokument.fussnote, size: 14, color: "7A828C" })], alignment: AlignmentType.LEFT, spacing: { before: 300 } }));

  const doc = new Document({
    creator: "ImmoOffice.ai",
    title: dokument.titel,
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: kinder }],
  });
  return Packer.toBuffer(doc);
}
