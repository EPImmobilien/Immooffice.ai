import "server-only";

import { BILD_BUCKET } from "@/lib/bilder";
import type { serverClient } from "@/lib/supabase/server";

import type { OpenImmoAnhang } from "./typen";
import type { ZipDatei } from "./zip";

type Client = Awaited<ReturnType<typeof serverClient>>;

/** MIME-Typ auf das von OpenImmo erwartete Kuerzel und die Endung abbilden. */
const FORMATE: Record<string, { format: string; endung: string }> = {
  "image/jpeg": { format: "JPG", endung: "jpg" },
  "image/png": { format: "PNG", endung: "png" },
  "image/webp": { format: "WEBP", endung: "webp" },
  "application/pdf": { format: "PDF", endung: "pdf" },
};

function gruppe(art: string, titelbild: boolean): OpenImmoAnhang["gruppe"] {
  if (titelbild) return "TITELBILD";
  if (art === "grundriss") return "GRUNDRISS";
  if (art === "lageplan") return "KARTEN_LAGEPLAN";
  if (art === "foto") return "BILD";
  return "DOKUMENTE";
}

export interface AnhangPaket {
  anhaenge: OpenImmoAnhang[];
  dateien: ZipDatei[];
  /** Bilder, die wegen eines unbekannten Formats ausgelassen wurden. */
  ausgelassen: number;
}

/**
 * Laedt die Anhaenge eines Objekts fuer das Uebertragungspaket.
 *
 * Der Dateiname im Paket wird hier neu gebildet und nicht aus dem Storage
 * uebernommen: Der Speicherpfad beginnt mit der Mandanten-ID, und die hat in
 * einem Paket, das an ein Portal geht, nichts zu suchen.
 *
 * Gezeigt wird jeweils der juengste bearbeitete Stand; das Original bleibt in
 * der Datenbank unangetastet (Abschnitt 11). Das KI-Kennzeichen haengt am
 * ausgelieferten Stand und wandert dadurch in den Anhangtitel.
 */
export async function openImmoAnhaengeLaden(
  supabase: Client,
  objektId: string,
  objektnummer: string,
): Promise<AnhangPaket> {
  const { data } = await supabase
    .from("objekt_bilder")
    .select("id, pfad, art, titel, mime, ist_titelbild, reihenfolge, original_id, ki_bearbeitet")
    .eq("objekt_id", objektId)
    .order("ist_titelbild", { ascending: false })
    .order("reihenfolge", { ascending: true });

  const alle = data ?? [];
  const neueste = new Map<string, (typeof alle)[number]>();
  for (const bild of alle) {
    if (bild.original_id) neueste.set(bild.original_id, bild);
  }

  const anhaenge: OpenImmoAnhang[] = [];
  const dateien: ZipDatei[] = [];
  let ausgelassen = 0;
  let nummer = 0;

  const kennung = objektnummer.replace(/[^A-Za-z0-9_-]+/g, "-") || "objekt";

  for (const bild of alle) {
    if (bild.original_id !== null) continue;

    const anzeige = neueste.get(bild.id) ?? bild;
    const format = anzeige.mime ? FORMATE[anzeige.mime] : undefined;
    if (!format) {
      ausgelassen += 1;
      continue;
    }

    const { data: datei } = await supabase.storage
      .from(BILD_BUCKET)
      .download(anzeige.pfad);
    if (!datei) {
      ausgelassen += 1;
      continue;
    }

    nummer += 1;
    const dateiname = `${kennung}-${String(nummer).padStart(2, "0")}.${format.endung}`;

    anhaenge.push({
      dateiname,
      gruppe: gruppe(bild.art, bild.ist_titelbild),
      titel: bild.titel,
      format: format.format,
      kiBearbeitet: anzeige.ki_bearbeitet,
    });
    dateien.push({
      name: dateiname,
      daten: Buffer.from(await datei.arrayBuffer()),
    });
  }

  return { anhaenge, dateien, ausgelassen };
}
