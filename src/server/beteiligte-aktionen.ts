"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { KONTAKTROLLEN, type Kontaktrolle } from "@/lib/kontakt-begriffe";
import { serverClient } from "@/lib/supabase/server";

/**
 * Beteiligte an einem Objekt: wer ist Eigentuemer, wer Interessent, wer Notar.
 *
 * Die Verknuepfung ist der Grund, warum Objekt und Kontakt beides Drehkreuze
 * sind: Von einem Objekt aus sieht man die Eigentuemer, von einem Kontakt aus
 * dessen Objekte. Ohne diese Verbindung waeren Objekt- und Kontaktliste zwei
 * unverbundene Karteien — und genau das war der Zustand vorher.
 *
 * Beide Richtungen fuehren zur selben Tabelle. Es gibt deshalb nur diese eine
 * Datei und keine zweite fuer die Gegenrichtung.
 */

const ROLLEN = Object.keys(KONTAKTROLLEN) as [Kontaktrolle, ...Kontaktrolle[]];

const verknuepfung = z.object({
  objekt_id: z.uuid(),
  kontakt_id: z.uuid(),
  rolle: z.enum(ROLLEN),
  // Nur bei Eigentuemern sinnvoll: Bei Erbengemeinschaften gehoert das Objekt
  // mehreren zu unterschiedlichen Teilen.
  anteil: z.coerce.number().min(0).max(100).optional(),
});

export interface BeteiligteErgebnis {
  fehler?: string;
}

export async function beteiligtenVerknuepfen(
  formular: FormData,
): Promise<BeteiligteErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern");
  rechtErzwingen(sitzung.rolle, "kontakte", "lesen");

  const rohAnteil = String(formular.get("anteil") ?? "").trim();

  const geprueft = verknuepfung.safeParse({
    objekt_id: String(formular.get("objekt_id") ?? ""),
    kontakt_id: String(formular.get("kontakt_id") ?? ""),
    rolle: String(formular.get("rolle") ?? ""),
    ...(rohAnteil ? { anteil: rohAnteil } : {}),
  });

  if (!geprueft.success) {
    return { fehler: "Bitte wählen Sie einen Kontakt und eine Rolle." };
  }

  const { objekt_id, kontakt_id, rolle, anteil } = geprueft.data;
  const supabase = await serverClient();

  // Namen fuer den Verlaufseintrag, und gleichzeitig die Probe, dass der
  // Kontakt zum eigenen Mandanten gehoert. Eine fremde Kontakt-ID wuerde die
  // Policy zwar abweisen, aber erst beim Schreiben — mit einer unverstaendlichen
  // Fehlermeldung.
  const { data: kontakt } = await supabase
    .from("kontakte")
    .select("vorname, nachname, firma")
    .eq("id", kontakt_id)
    .eq("mandant_id", sitzung.mandantId)
    .is("geloescht_am", null)
    .maybeSingle();

  if (!kontakt) return { fehler: "Der Kontakt wurde nicht gefunden." };

  const { error } = await supabase.from("kontakt_objekt").insert({
    mandant_id: sitzung.mandantId,
    objekt_id,
    kontakt_id,
    rolle,
    anteil: anteil ?? null,
  });

  if (error) {
    // Die Tabelle laesst dieselbe Rolle je Kontakt und Objekt nur einmal zu.
    // Das ist kein Fehler des Nutzers, sondern eine bereits erledigte Aufgabe.
    return {
      fehler:
        error.code === "23505"
          ? "Dieser Kontakt ist mit dieser Rolle schon verknüpft."
          : "Die Verknüpfung konnte nicht gespeichert werden.",
    };
  }

  const name =
    [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") ||
    kontakt.firma ||
    "Kontakt";

  await supabase.from("aktivitaeten").insert({
    mandant_id: sitzung.mandantId,
    objekt_id,
    kontakt_id,
    typ: "kontakt_verknuepft",
    beschreibung: `${KONTAKTROLLEN[rolle]} verknüpft: ${name}`,
    benutzer_id: sitzung.benutzerId,
  });

  revalidatePath(`/objekte/${objekt_id}`);
  revalidatePath(`/kontakte/${kontakt_id}`);
  return {};
}

/**
 * Loest eine Verknuepfung.
 *
 * Der Verlaufseintrag bleibt: Dass jemand einmal als Interessent gefuehrt
 * wurde, ist die Information, die man spaeter sucht — etwa bei der Frage, wer
 * das Objekt schon gesehen hat.
 */
export async function beteiligtenEntfernen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern");

  const id = String(formular.get("verknuepfung_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();

  const { data: vorhanden } = await supabase
    .from("kontakt_objekt")
    .select("objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  await supabase
    .from("kontakt_objekt")
    .delete()
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  if (vorhanden) {
    revalidatePath(`/objekte/${vorhanden.objekt_id}`);
    revalidatePath(`/kontakte/${vorhanden.kontakt_id}`);
  }
}
