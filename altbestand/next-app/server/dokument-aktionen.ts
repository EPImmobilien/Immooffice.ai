"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import {
  DOKUMENTARTEN,
  DOKUMENT_BUCKET,
  DOKUMENT_MAX_BYTES,
  DOKUMENT_MIME,
  darfAnKunden,
  type Dokumentart,
} from "@/lib/dokumente";
import { serverClient } from "@/lib/supabase/server";

/**
 * Unterlagen am Objekt.
 *
 * Wie bei Bildern geht die Datei direkt vom Browser in den Storage; hier wird
 * nur der Datensatz erfasst. Das haelt eine 50-MB-Teilungserklaerung aus dem
 * Server-Action-Kanal heraus, dessen Groessengrenze deutlich niedriger liegt.
 *
 * Die Mandantentrennung haengt nicht an dieser Entscheidung: Die Storage-Policy
 * verlangt die Mandanten-ID als erstes Pfadsegment, und der Pfad wird hier
 * nochmals dagegen geprueft.
 */

const ARTEN = Object.keys(DOKUMENTARTEN) as [Dokumentart, ...Dokumentart[]];

const erfassen = z.object({
  objekt_id: z.uuid(),
  pfad: z.string().trim().min(1).max(500),
  dateiname: z.string().trim().min(1).max(300),
  art: z.enum(ARTEN),
  titel: z.string().trim().max(200).optional(),
  notiz: z.string().trim().max(1000).optional(),
  gueltig_bis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mime: z.string().trim().max(200),
  bytes: z.number().int().positive().max(DOKUMENT_MAX_BYTES),
});

export interface DokumentErgebnis {
  fehler?: string;
}

export async function dokumentErfassen(
  eingabe: z.input<typeof erfassen>,
): Promise<DokumentErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);

  const geprueft = erfassen.safeParse(eingabe);
  if (!geprueft.success) {
    return { fehler: "Die Angaben zur Unterlage sind unvollständig." };
  }

  const { objekt_id, pfad, dateiname, art, titel, notiz, gueltig_bis, mime, bytes } =
    geprueft.data;

  // Der Pfad kommt aus dem Browser. Ohne diese Pruefung liesse sich ein fremder
  // Pfad eintragen und ueber die eigene Objektseite ausliefern.
  if (!pfad.startsWith(`${sitzung.mandantId}/${objekt_id}/`)) {
    return { fehler: "Der Dateipfad gehört nicht zu diesem Objekt." };
  }

  if (!(DOKUMENT_MIME as readonly string[]).includes(mime)) {
    return { fehler: "Dieses Dateiformat wird nicht unterstützt." };
  }

  const supabase = await serverClient();

  const { error } = await supabase.from("objekt_dokumente").insert({
    mandant_id: sitzung.mandantId,
    objekt_id,
    pfad,
    dateiname,
    art,
    titel: titel || null,
    notiz: notiz || null,
    gueltig_bis: gueltig_bis || null,
    mime,
    bytes,
    // Immer intern. Die Freigabe an Interessenten ist ein eigener, bewusster
    // Schritt — nicht die Vorbelegung beim Hochladen.
    sichtbarkeit: "intern",
    erstellt_von: sitzung.benutzerId,
  });

  if (error) {
    // Die Datei liegt bereits im Storage; ohne Datensatz waere sie verwaist.
    await supabase.storage.from(DOKUMENT_BUCKET).remove([pfad]);
    return { fehler: "Die Unterlage konnte nicht gespeichert werden." };
  }

  revalidatePath(`/objekte/${objekt_id}`);
  return {};
}

export async function dokumentLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("dokument_id") ?? "").trim();
  const objektId = String(formular.get("objekt_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();

  // Pfad vor dem Loeschen holen: Danach ist er nicht mehr zu ermitteln, und die
  // Datei bliebe im Storage zurueck.
  const { data: vorhanden } = await supabase
    .from("objekt_dokumente")
    .select("pfad")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  const { error } = await supabase
    .from("objekt_dokumente")
    .delete()
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  if (!error && vorhanden) {
    await supabase.storage.from(DOKUMENT_BUCKET).remove([vorhanden.pfad]);
  }

  revalidatePath(`/objekte/${objektId}`);
}

/**
 * Schaltet die Sichtbarkeit einer Unterlage um.
 *
 * Die Pruefung auf vertrauliche Arten steht hier UND als Check-Constraint in
 * der Datenbank. Doppelt, weil die Folgen eines Fehlers nicht zurueckzuholen
 * sind: Ein freigegebener Grundbuchauszug kann in derselben Minute
 * heruntergeladen sein.
 */
export async function sichtbarkeitUmschalten(
  formular: FormData,
): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("dokument_id") ?? "").trim();
  const objektId = String(formular.get("objekt_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();

  const { data: dokument } = await supabase
    .from("objekt_dokumente")
    .select("art, sichtbarkeit")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!dokument) return;

  const neu = dokument.sichtbarkeit === "intern" ? "kunde" : "intern";
  if (neu === "kunde" && !darfAnKunden(dokument.art as Dokumentart)) return;

  await supabase
    .from("objekt_dokumente")
    .update({ sichtbarkeit: neu })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/objekte/${objektId}`);
}

/**
 * Signierter Verweis zum Herunterladen.
 *
 * Der Bucket ist nicht oeffentlich. Der Verweis ist kurz gueltig, damit er
 * nicht weitergegeben werden kann — eine Stunde reicht zum Ansehen und
 * Speichern.
 */
export async function dokumentVerweis(
  id: string,
): Promise<{ url?: string; fehler?: string }> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);

  const supabase = await serverClient();

  // Der zusaetzliche Mandantenfilter schuetzt auch bei einer fehlerhaften
  // Policy: Ohne ihn genuegte eine erratene ID.
  const { data: dokument } = await supabase
    .from("objekt_dokumente")
    .select("pfad")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!dokument) return { fehler: "Die Unterlage wurde nicht gefunden." };

  const { data, error } = await supabase.storage
    .from(DOKUMENT_BUCKET)
    .createSignedUrl(dokument.pfad, 3600);

  if (error || !data) return { fehler: "Der Download konnte nicht erzeugt werden." };
  return { url: data.signedUrl };
}
