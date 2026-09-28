"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { KONTAKTROLLEN } from "@/lib/kontakt-begriffe";
import { serverClient } from "@/lib/supabase/server";

export interface KontaktErgebnis {
  fehler?: string;
  feldFehler?: Record<string, string>;
}

const text = z
  .string()
  .trim()
  .transform((w) => (w === "" ? null : w))
  .nullable();

const kontaktSchema = z
  .object({
    anrede: text,
    vorname: text,
    nachname: text,
    firma: text,
    email: z
      .string()
      .trim()
      .transform((w) => (w === "" ? null : w.toLowerCase()))
      .nullable()
      .refine((w) => w === null || z.email().safeParse(w).success, {
        message: "Bitte eine gültige E-Mail-Adresse angeben.",
      }),
    telefon: text,
    mobil: text,
    strasse: text,
    hausnummer: text,
    plz: text,
    ort: text,
    notizen: text,
    einwilligung_werbung: z
      .string()
      .optional()
      .transform((w) => w === "on" || w === "true"),
  })
  // Die Datenbank erzwingt dieselbe Regel; hier fuer eine verstaendliche Meldung.
  .refine((d) => d.nachname !== null || d.firma !== null, {
    message: "Bitte einen Nachnamen oder eine Firma angeben.",
    path: ["nachname"],
  });

export async function kontaktSpeichern(
  _vorher: KontaktErgebnis,
  formular: FormData,
): Promise<KontaktErgebnis> {
  const sitzung = await sitzungErzwingen();
  const id = String(formular.get("id") ?? "").trim();
  const istNeu = id === "";

  rechtErzwingen(
    sitzung.rolle,
    "kontakte",
    istNeu ? "anlegen" : "aendern",
    sitzung.uebersteuerung,
  );

  const roh: Record<string, unknown> = {};
  for (const feld of [
    "anrede", "vorname", "nachname", "firma", "email", "telefon", "mobil",
    "strasse", "hausnummer", "plz", "ort", "notizen",
  ]) {
    roh[feld] = String(formular.get(feld) ?? "");
  }
  roh["einwilligung_werbung"] = String(formular.get("einwilligung_werbung") ?? "");

  const geprueft = kontaktSchema.safeParse(roh);
  if (!geprueft.success) {
    const feldFehler: Record<string, string> = {};
    for (const problem of geprueft.error.issues) {
      const feld = problem.path[0];
      if (typeof feld === "string" && !feldFehler[feld]) {
        feldFehler[feld] = problem.message;
      }
    }
    return { fehler: "Bitte die markierten Felder prüfen.", feldFehler };
  }

  const rollen = formular
    .getAll("rollen")
    .map(String)
    .filter((r): r is keyof typeof KONTAKTROLLEN => r in KONTAKTROLLEN);

  const supabase = await serverClient();
  const { einwilligung_werbung, ...felder } = geprueft.data;

  const daten = {
    ...felder,
    einwilligung_werbung,
    // Zeitpunkt der Einwilligung ist nachweispflichtig (Abschnitt 16).
    einwilligung_am: einwilligung_werbung ? new Date().toISOString() : null,
  };

  let kontaktId = id;

  if (istNeu) {
    const { data, error } = await supabase
      .from("kontakte")
      .insert({
        ...daten,
        mandant_id: sitzung.mandantId,
        erstellt_von: sitzung.benutzerId,
        betreuer_id: sitzung.benutzerId,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { fehler: "Der Kontakt konnte nicht angelegt werden." };
    }
    kontaktId = data.id;
  } else {
    const { error } = await supabase
      .from("kontakte")
      .update(daten)
      .eq("id", id)
      .eq("mandant_id", sitzung.mandantId);

    if (error) {
      return { fehler: "Die Änderungen konnten nicht gespeichert werden." };
    }
    await supabase.from("kontakt_rollen").delete().eq("kontakt_id", id);
  }

  if (rollen.length > 0) {
    await supabase.from("kontakt_rollen").insert(
      rollen.map((rolle) => ({
        kontakt_id: kontaktId,
        mandant_id: sitzung.mandantId,
        rolle,
      })),
    );
  }

  revalidatePath("/kontakte");
  redirect("/kontakte");
}
