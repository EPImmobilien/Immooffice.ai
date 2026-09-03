import "server-only";

import { PDFParse } from "pdf-parse";

/** Text eines PDF (alle Seiten), fuer die Auslesung per KI. */
export async function pdfText(daten: Buffer | Uint8Array, maxZeichen = 60_000): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(daten) });
  try {
    const ergebnis = await parser.getText();
    return ergebnis.text.replace(/\f/g, "\n").slice(0, maxZeichen);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
