"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export interface SuchprofilErgebnis {
  fehler?: string;
  hinweis?: string;
}

const zahl = z
  .string()
  .trim()
  .transform((w) => {
    if (w === "") return null;
    const n = Number(w.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  })
  .nullable();

/** Kommagetrennte Eingabe in eine bereinigte Liste überführen. */
const liste = z
  .string()
  .trim()
  .transform((w) =>
    w
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  );

const schema = z.object({
  kontakt_id: z.uuid("Bitte einen Kontakt wählen."),
  bezeichnung: z.string().trim().max(200).optional(),
  vermarktungsart: z.enum(["kauf", "miete", "kauf_miete"]),
  objektkategorien: z.array(
    z.enum(["wohnung", "haus", "grundstueck", "gewerbe", "anlage", "sonstige"]),
  ),
  preis_bis: zahl,
  preis_von: zahl,
  flaeche_von: zahl,
  flaeche_bis: zahl,
  zimmer_von: zahl,
  zimmer_bis: zahl,
  orte: liste,
  bemerkung: z.string().trim().max(2000).optional(),
});

export async function suchprofilSpeichern(
  _vorher: SuchprofilErgebnis,
  formular: FormData,
): Promise<SuchprofilErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "anlegen");

  const geprueft = schema.safeParse({
    kontakt_id: formular.get("kontakt_id"),
    bezeichnung: String(formular.get("bezeichnung") ?? ""),
    vermarktungsart: formular.get("vermarktungsart"),
    objektkategorien: formular.getAll("objektkategorien").map(String),
    preis_von: String(formular.get("preis_von") ?? ""),
    preis_bis: String(formular.get("preis_bis") ?? ""),
    flaeche_von: String(formular.get("flaeche_von") ?? ""),
    flaeche_bis: String(formular.get("flaeche_bis") ?? ""),
    zimmer_von: String(formular.get("zimmer_von") ?? ""),
    zimmer_bis: String(formular.get("zimmer_bis") ?? ""),
    orte: String(formular.get("orte") ?? ""),
    bemerkung: String(formular.get("bemerkung") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("suchprofile")
    .insert({
      ...geprueft.data,
      mandant_id: sitzung.mandantId,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { fehler: "Das Suchprofil konnte nicht angelegt werden." };
  }

  // Direkt nach dem Anlegen suchen: Ein leeres Suchprofil ist wertlos, und
  // der Makler soll sofort sehen, ob im Bestand etwas passt.
  await supabase.rpc("treffer_fuer_profil", { p_profil: data.id });

  revalidatePath("/suchprofile");
  redirect("/suchprofile");
}

/** Sucht für ein Profil erneut — etwa nach Änderungen am Bestand. */
export async function trefferAktualisieren(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "aendern");

  const profil = String(formular.get("profil_id") ?? "").trim();
  if (!profil) return;

  const supabase = await serverClient();
  await supabase.rpc("treffer_fuer_profil", { p_profil: profil });

  revalidatePath("/suchprofile");
}

/** Setzt den Status eines Treffers — vorgemerkt, gesendet oder abgelehnt. */
export async function trefferStatusSetzen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "aendern");

  const treffer = String(formular.get("treffer_id") ?? "").trim();
  const status = String(formular.get("status") ?? "").trim();

  if (!treffer || !["neu", "gesendet", "vorgemerkt", "abgelehnt"].includes(status)) {
    return;
  }

  const supabase = await serverClient();
  await supabase
    .from("treffer")
    .update({ status })
    .eq("id", treffer)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath("/suchprofile");
}
