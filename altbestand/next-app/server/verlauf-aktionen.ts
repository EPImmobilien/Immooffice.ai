"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { HANDEINTRAG, type Aktivitaetstyp } from "@/lib/verlauf";

/**
 * Eintraege von Hand im Verlauf.
 *
 * Nur die Typen aus `HANDEINTRAG` sind erlaubt. Alles andere entsteht
 * ausschliesslich aus dem System — ein handgeschriebenes „Status geändert"
 * waere von einem echten nicht zu unterscheiden und wuerde den Verlauf als
 * Nachweis entwerten.
 *
 * Aendern oder loeschen laesst sich ein Eintrag nicht; entsprechende Aktionen
 * gibt es hier absichtlich nicht, und die Datenbank hat dafuer keine Policy.
 */

const TYPEN = HANDEINTRAG as unknown as [Aktivitaetstyp, ...Aktivitaetstyp[]];

const eintrag = z.object({
  objekt_id: z.uuid().optional(),
  kontakt_id: z.uuid().optional(),
  typ: z.enum(TYPEN),
  beschreibung: z.string().trim().min(1).max(2000),
});

export interface VerlaufErgebnis {
  fehler?: string;
}

export async function verlaufEintragen(formular: FormData): Promise<VerlaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);

  const rohObjekt = String(formular.get("objekt_id") ?? "").trim();
  const rohKontakt = String(formular.get("kontakt_id") ?? "").trim();

  const geprueft = eintrag.safeParse({
    ...(rohObjekt ? { objekt_id: rohObjekt } : {}),
    ...(rohKontakt ? { kontakt_id: rohKontakt } : {}),
    typ: String(formular.get("typ") ?? ""),
    beschreibung: String(formular.get("beschreibung") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: "Bitte wählen Sie eine Art und schreiben Sie einen Text." };
  }

  const { objekt_id, kontakt_id, typ, beschreibung } = geprueft.data;

  // Ein Eintrag ohne Bezug waere ein Protokoll ohne Gegenstand. Die Datenbank
  // weist ihn ebenfalls ab; hier entsteht daraus eine lesbare Meldung.
  if (!objekt_id && !kontakt_id) {
    return { fehler: "Der Eintrag braucht ein Objekt oder einen Kontakt." };
  }

  const supabase = await serverClient();
  const { error } = await supabase.from("aktivitaeten").insert({
    mandant_id: sitzung.mandantId,
    objekt_id: objekt_id ?? null,
    kontakt_id: kontakt_id ?? null,
    typ,
    beschreibung,
    benutzer_id: sitzung.benutzerId,
  });

  if (error) return { fehler: "Der Eintrag konnte nicht gespeichert werden." };

  if (objekt_id) revalidatePath(`/objekte/${objekt_id}`);
  if (kontakt_id) revalidatePath(`/kontakte/${kontakt_id}`);
  return {};
}

/**
 * Vermerkt eine Veroeffentlichung im Verlauf.
 *
 * Wird aus anderen Server-Aktionen aufgerufen, nicht aus einem Formular.
 * Bewusst ohne eigene Rechtepruefung: Der Aufrufer hat sie bereits gemacht,
 * und eine zweite Pruefung mit anderem Modul waere eine Fehlerquelle. Der
 * Eintrag ist eine Folge der Handlung, nicht eine eigene Handlung.
 */
export async function verlaufVermerken(
  objektId: string,
  typ: Aktivitaetstyp,
  beschreibung: string,
  metadaten: Record<string, unknown> = {},
): Promise<void> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  await supabase.from("aktivitaeten").insert({
    mandant_id: sitzung.mandantId,
    objekt_id: objektId,
    typ,
    beschreibung,
    metadaten,
    benutzer_id: sitzung.benutzerId,
  });

  revalidatePath(`/objekte/${objektId}`);
}
