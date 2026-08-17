"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { BILD_BUCKET, BILD_MIME, BILD_MAX_BYTES } from "@/lib/bilder";
import { serverClient } from "@/lib/supabase/server";

/**
 * Bilder werden vom Browser direkt in den Storage geladen; hier wird nur der
 * Datensatz erfasst. Das haelt grosse Dateien aus dem Server-Action-Kanal
 * heraus — dessen Groessengrenze liegt deutlich unter der Bucket-Grenze.
 *
 * Sicherheitsseitig aendert das nichts: Der Upload laeuft ueber die Sitzung
 * des Nutzers, die Storage-Policy erzwingt die Mandanten-ID als erstes
 * Pfadsegment, und der Pfad wird hier nochmals dagegen geprueft.
 */

const erfassen = z.object({
  objekt_id: z.uuid(),
  pfad: z.string().trim().min(1).max(500),
  art: z.enum(["foto", "grundriss", "lageplan", "energieausweis", "sonstiges"]),
  titel: z.string().trim().max(200).optional(),
  mime: z.string().trim().max(100),
  bytes: z.number().int().positive().max(BILD_MAX_BYTES),
});

export interface BildErgebnis {
  fehler?: string;
}

export async function bildErfassen(
  eingabe: z.input<typeof erfassen>,
): Promise<BildErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "objekte", "aendern");

  const geprueft = erfassen.safeParse(eingabe);
  if (!geprueft.success) return { fehler: "Die Bildangaben sind unvollständig." };

  const { objekt_id, pfad, art, titel, mime, bytes } = geprueft.data;

  // Der Pfad kommt aus dem Browser. Ohne diese Pruefung liesse sich ein
  // fremder Pfad eintragen und ueber die eigene Objektseite ausliefern.
  if (!pfad.startsWith(`${sitzung.mandantId}/${objekt_id}/`)) {
    return { fehler: "Der Bildpfad gehört nicht zu diesem Objekt." };
  }

  if (!(BILD_MIME as readonly string[]).includes(mime)) {
    return { fehler: "Dieses Dateiformat wird nicht unterstützt." };
  }

  const supabase = await serverClient();

  // Das erste Bild eines Objekts wird automatisch zum Titelbild — sonst haette
  // ein Objekt Bilder, aber keines im Portalexport.
  const { count } = await supabase
    .from("objekt_bilder")
    .select("id", { count: "exact", head: true })
    .eq("objekt_id", objekt_id);

  const { error } = await supabase.from("objekt_bilder").insert({
    mandant_id: sitzung.mandantId,
    objekt_id,
    pfad,
    art,
    titel: titel || null,
    mime,
    bytes,
    reihenfolge: count ?? 0,
    ist_titelbild: (count ?? 0) === 0,
    erstellt_von: sitzung.benutzerId,
  });

  if (error) {
    // Die Datei liegt bereits im Storage; ohne Datensatz waere sie verwaist.
    await supabase.storage.from(BILD_BUCKET).remove([pfad]);
    return { fehler: "Das Bild konnte nicht gespeichert werden." };
  }

  revalidatePath(`/objekte/${objekt_id}`);
  revalidatePath(`/exposes/${objekt_id}`);
  return {};
}

export async function bildLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "objekte", "aendern");

  const id = String(formular.get("bild_id") ?? "").trim();
  const objektId = String(formular.get("objekt_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();

  // Auch die Bearbeitungen mitnehmen: Der Datenbankverweis loescht sie
  // ohnehin, ihre Dateien blieben sonst im Storage zurueck.
  const { data: betroffen } = await supabase
    .from("objekt_bilder")
    .select("pfad")
    .or(`id.eq.${id},original_id.eq.${id}`);

  const { error } = await supabase
    .from("objekt_bilder")
    .delete()
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  if (!error && betroffen && betroffen.length > 0) {
    await supabase.storage
      .from(BILD_BUCKET)
      .remove(betroffen.map((b) => b.pfad));
  }

  revalidatePath(`/objekte/${objektId}`);
  revalidatePath(`/exposes/${objektId}`);
}

export async function titelbildSetzen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "objekte", "aendern");

  const id = String(formular.get("bild_id") ?? "").trim();
  const objektId = String(formular.get("objekt_id") ?? "").trim();
  if (!id || !objektId) return;

  const supabase = await serverClient();

  // Erst raeumen, dann setzen: Ein Objekt darf nur ein Titelbild haben, und
  // der eindeutige Index wuerde die umgekehrte Reihenfolge abweisen.
  await supabase
    .from("objekt_bilder")
    .update({ ist_titelbild: false })
    .eq("objekt_id", objektId)
    .eq("mandant_id", sitzung.mandantId)
    .eq("ist_titelbild", true);

  await supabase
    .from("objekt_bilder")
    .update({ ist_titelbild: true })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/objekte/${objektId}`);
  revalidatePath(`/exposes/${objektId}`);
}

/** Verschiebt ein Bild um eine Position nach vorn oder hinten. */
export async function bildVerschieben(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "objekte", "aendern");

  const id = String(formular.get("bild_id") ?? "").trim();
  const objektId = String(formular.get("objekt_id") ?? "").trim();
  const richtung = String(formular.get("richtung") ?? "");
  if (!id || !objektId || !["vor", "zurueck"].includes(richtung)) return;

  const supabase = await serverClient();
  const { data: bilder } = await supabase
    .from("objekt_bilder")
    .select("id, reihenfolge")
    .eq("objekt_id", objektId)
    .is("original_id", null)
    .order("reihenfolge", { ascending: true });

  if (!bilder) return;

  const index = bilder.findIndex((b) => b.id === id);
  const ziel = richtung === "vor" ? index - 1 : index + 1;
  if (index < 0 || ziel < 0 || ziel >= bilder.length) return;

  const a = bilder[index]!;
  const b = bilder[ziel]!;

  // Die gespeicherten Werte koennen Luecken haben; die Position im sortierten
  // Feld ist die verlaessliche Groesse.
  await supabase
    .from("objekt_bilder")
    .update({ reihenfolge: ziel })
    .eq("id", a.id)
    .eq("mandant_id", sitzung.mandantId);
  await supabase
    .from("objekt_bilder")
    .update({ reihenfolge: index })
    .eq("id", b.id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/objekte/${objektId}`);
  revalidatePath(`/exposes/${objektId}`);
}
