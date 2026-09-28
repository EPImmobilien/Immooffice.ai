"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { VERTRAGSARTEN, type Vertragsart } from "@/lib/vertraege";
import { tokenErzeugen } from "@/lib/web-expose";

/**
 * Vertraege anlegen, versenden und widerrufen.
 *
 * Das Unterzeichnen selbst steht bewusst NICHT hier: Es geschieht ueber den
 * oeffentlichen Link durch die Gegenseite. Eine vom Makler angeklickte
 * Unterschrift waere keine.
 */

const ARTEN = Object.keys(VERTRAGSARTEN) as [Vertragsart, ...Vertragsart[]];

export interface VertragErgebnis {
  fehler?: string;
  hinweis?: string;
}

function text(formular: FormData, feld: string): string | null {
  const wert = String(formular.get(feld) ?? "").trim();
  return wert === "" ? null : wert;
}

const anlegen = z.object({
  titel: z.string().trim().min(1).max(200),
  art: z.enum(ARTEN),
  objekt_id: z.uuid().optional(),
  kontakt_id: z.uuid().optional(),
});

export async function vertragAnlegen(
  formular: FormData,
): Promise<VertragErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);

  const geprueft = anlegen.safeParse({
    titel: String(formular.get("titel") ?? ""),
    art: String(formular.get("art") ?? "maklervertrag"),
    ...(text(formular, "objekt_id") ? { objekt_id: text(formular, "objekt_id") } : {}),
    ...(text(formular, "kontakt_id") ? { kontakt_id: text(formular, "kontakt_id") } : {}),
  });

  if (!geprueft.success) {
    return { fehler: "Bitte geben Sie einen Titel an und wählen Sie eine Art." };
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("vertraege")
    .insert({
      mandant_id: sitzung.mandantId,
      titel: geprueft.data.titel,
      art: geprueft.data.art,
      objekt_id: geprueft.data.objekt_id ?? null,
      kontakt_id: geprueft.data.kontakt_id ?? null,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { fehler: "Der Vertrag konnte nicht angelegt werden." };
  }

  revalidatePath("/vertraege");
  redirect(`/vertraege/${data.id}`);
}

export async function vertragSpeichern(
  formular: FormData,
): Promise<VertragErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("vertrag_id") ?? "").trim();
  if (!id) return { fehler: "Der Vertrag wurde nicht gefunden." };

  const supabase = await serverClient();
  const { error } = await supabase
    .from("vertraege")
    .update({
      titel: String(formular.get("titel") ?? "").trim() || "Ohne Titel",
      inhalt: String(formular.get("inhalt") ?? ""),
      verbraucher: formular.get("verbraucher") === "ja",
      belehrt_am: text(formular, "belehrt_am"),
      geschlossen_am: text(formular, "geschlossen_am"),
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  if (error) {
    // Die Datenbank sperrt den Text nach der ersten Unterschrift. Hier entsteht
    // daraus eine Erklaerung statt eines Datenbankfehlers.
    return {
      fehler:
        "Nicht gespeichert. Nach der ersten Unterschrift lässt sich der Vertragstext nicht mehr ändern — sonst stünde die Unterschrift unter einem anderen Text als dem unterzeichneten.",
    };
  }

  revalidatePath(`/vertraege/${id}`);
  return { hinweis: "Gespeichert." };
}

/**
 * Erzeugt den Unterschriftslink.
 *
 * Erst hier entsteht der Token. Ein Entwurf hat bewusst keinen erreichbaren
 * Link — sonst waere ein noch unfertiger Vertrag abrufbar, sobald jemand die
 * Adresse kennt.
 */
export async function vertragVersenden(
  formular: FormData,
): Promise<VertragErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung);

  const id = String(formular.get("vertrag_id") ?? "").trim();
  if (!id) return { fehler: "Der Vertrag wurde nicht gefunden." };

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("vertraege")
    .select("inhalt, token, status")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!vorhanden) return { fehler: "Der Vertrag wurde nicht gefunden." };

  if (vorhanden.inhalt.trim() === "") {
    return {
      fehler:
        "Der Vertrag hat noch keinen Text. Ein leeres Dokument zur Unterschrift zu versenden ergibt keinen Sinn.",
    };
  }

  const { error } = await supabase
    .from("vertraege")
    .update({
      status: "versendet",
      token: vorhanden.token ?? tokenErzeugen(),
      versendet_am: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Der Link konnte nicht erzeugt werden." };

  revalidatePath(`/vertraege/${id}`);
  return {
    hinweis:
      "Der Unterschriftslink ist erzeugt. Geben Sie ihn der Gegenseite — versendet wird er noch nicht automatisch.",
  };
}

/** Zieht den Link zurueck; der Vertrag ist danach nicht mehr abrufbar. */
export async function vertragZurueckziehen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung);

  const id = String(formular.get("vertrag_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  await supabase
    .from("vertraege")
    .update({ status: "entwurf", token: null })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .eq("status", "versendet");

  revalidatePath(`/vertraege/${id}`);
}

/**
 * Haelt einen Widerruf fest.
 *
 * Der Vertrag bleibt erhalten. Ein Widerruf ist eine Tatsache mit Datum, kein
 * Grund, den Vorgang verschwinden zu lassen — gerade weil die Provisionsfrage
 * daran haengt.
 */
export async function widerrufFesthalten(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("vertrag_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  await supabase
    .from("vertraege")
    .update({ status: "widerrufen", widerrufen_am: new Date().toISOString() })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/vertraege/${id}`);
}
