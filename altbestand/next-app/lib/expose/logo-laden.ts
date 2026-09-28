import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MARKE_BUCKET } from "@/lib/marke";

import type { ExposeBranding } from "./typen";

/**
 * Laedt das Logo des Mandanten als Rohdaten fuer die PDF-Erzeugung.
 *
 * Die PDF-Erzeugung laedt keine Verweise nach — sie braucht die Bytes. Deshalb
 * wird hier heruntergeladen und nicht nur ein Pfad weitergegeben.
 *
 * Faellt das Laden aus, ist das kein Grund, das Exposé scheitern zu lassen: Die
 * Vorlagen setzen dann die Wortmarke aus dem Firmennamen. Ein Exposé ohne Logo
 * ist brauchbar, ein Fehler statt eines Exposés nicht.
 *
 * SVG wird bewusst nicht unterstuetzt: Die PDF-Erzeugung kann es nicht lesen und
 * verwirft ein unlesbares Bild wortlos — es entstuende ein Exposé mit leerem
 * Kopf, ohne dass jemand erfaehrt, warum. Die Wortmarke ist das ehrlichere
 * Ergebnis.
 */
export async function logoLaden(
  supabase: SupabaseClient,
  pfad: string | null | undefined,
): Promise<ExposeBranding["logo"]> {
  if (!pfad) return null;

  const endung = pfad.split(".").pop()?.toLowerCase();
  const format =
    endung === "png"
      ? ("png" as const)
      : endung === "jpg" || endung === "jpeg"
        ? ("jpg" as const)
        : null;

  if (!format) return null;

  const { data, error } = await supabase.storage.from(MARKE_BUCKET).download(pfad);
  if (error || !data) return null;

  return { daten: Buffer.from(await data.arrayBuffer()), format };
}
