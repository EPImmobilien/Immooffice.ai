import "server-only";

import { BILD_BUCKET } from "@/lib/bilder";
import type { serverClient } from "@/lib/supabase/server";

import type { ExposeBild } from "./typen";

type Client = Awaited<ReturnType<typeof serverClient>>;

/**
 * Laedt die Bilder eines Objekts fuer die PDF-Erzeugung.
 *
 * Die PDF-Erzeugung bekommt Bytes statt Adressen: Ein signierter Verweis
 * koennte zum Zeitpunkt des Rendervorgangs abgelaufen sein, und ein Fehlschlag
 * mitten im Dokument waere schwer zu behandeln.
 *
 * WebP bleibt aussen vor — die PDF-Erzeugung unterstuetzt nur JPEG und PNG.
 * Solche Bilder werden uebersprungen statt das ganze Exposé scheitern zu
 * lassen; hochgeladen werden duerfen sie weiterhin, etwa fuer das Web-Exposé.
 */
export async function exposeBilderLaden(
  supabase: Client,
  objektId: string,
  hoechstens: number,
): Promise<ExposeBild[]> {
  if (hoechstens <= 0) return [];

  const { data } = await supabase
    .from("objekt_bilder")
    .select("id, pfad, art, titel, mime, ist_titelbild, reihenfolge, original_id, ki_bearbeitet")
    .eq("objekt_id", objektId)
    .order("ist_titelbild", { ascending: false })
    .order("reihenfolge", { ascending: true });

  const alle = data ?? [];

  // Zu jedem Original die juengste Bearbeitung: Gezeigt wird der bearbeitete
  // Stand, das Original bleibt in der Datenbank unangetastet (Abschnitt 11).
  const neueste = new Map<string, (typeof alle)[number]>();
  for (const bild of alle) {
    if (bild.original_id) neueste.set(bild.original_id, bild);
  }

  const auswahl = alle
    .filter((b) => b.original_id === null)
    .map((b) => {
      const anzeige = neueste.get(b.id) ?? b;
      return {
        pfad: anzeige.pfad,
        mime: anzeige.mime,
        titel: b.titel,
        art: b.art,
        // Das Kennzeichen haengt am angezeigten Stand, nicht am Original.
        kiBearbeitet: anzeige.ki_bearbeitet,
      };
    })
    .filter((b) => b.mime === "image/jpeg" || b.mime === "image/png")
    .slice(0, hoechstens);

  const geladen: ExposeBild[] = [];
  for (const bild of auswahl) {
    const { data: datei } = await supabase.storage
      .from(BILD_BUCKET)
      .download(bild.pfad);
    if (!datei) continue;

    geladen.push({
      daten: Buffer.from(await datei.arrayBuffer()),
      format: bild.mime === "image/png" ? "png" : "jpg",
      titel: bild.titel,
      art: bild.art,
      kiBearbeitet: bild.kiBearbeitet,
    });
  }

  return geladen;
}
