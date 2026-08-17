"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PRIORITAETEN, TERMINARTEN, type Prioritaet, type Terminart } from "@/lib/arbeitsmittel";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

/**
 * Aufgaben und Termine.
 *
 * Beide sind bewusst in einer Datei: Sie teilen die Bezuege zu Objekt und
 * Kontakt, die Rechtepruefung und die Frage, welche Seiten danach neu zu laden
 * sind. Getrennt haetten beide Dateien dieselbe Haelfte enthalten.
 *
 * Das Modul fuer die Rechtepruefung ist `kalender` — dieselbe Zuordnung wie in
 * der Navigation, damit ein Recht nicht an zwei Stellen unterschiedlich heisst.
 */

const PRIO = Object.keys(PRIORITAETEN) as [Prioritaet, ...Prioritaet[]];
const ARTEN = Object.keys(TERMINARTEN) as [Terminart, ...Terminart[]];

export interface ArbeitsErgebnis {
  fehler?: string;
}

/** Leerer String aus einem Formular ist „nichts angegeben", nicht „leer". */
function optional(formular: FormData, feld: string): string | undefined {
  const wert = String(formular.get(feld) ?? "").trim();
  return wert === "" ? undefined : wert;
}

function seitenAktualisieren(objektId?: string, kontaktId?: string): void {
  revalidatePath("/aufgaben");
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
  if (objektId) revalidatePath(`/objekte/${objektId}`);
  if (kontaktId) revalidatePath(`/kontakte/${kontaktId}`);
}

// --- Aufgaben --------------------------------------------------------------

const aufgabe = z.object({
  titel: z.string().trim().min(1).max(300),
  beschreibung: z.string().trim().max(2000).optional(),
  prioritaet: z.enum(PRIO),
  faellig_am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  objekt_id: z.uuid().optional(),
  kontakt_id: z.uuid().optional(),
  zustaendig_id: z.uuid().optional(),
});

export async function aufgabeAnlegen(formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "anlegen");

  const geprueft = aufgabe.safeParse({
    titel: String(formular.get("titel") ?? ""),
    beschreibung: optional(formular, "beschreibung"),
    prioritaet: String(formular.get("prioritaet") ?? "mittel"),
    faellig_am: optional(formular, "faellig_am"),
    objekt_id: optional(formular, "objekt_id"),
    kontakt_id: optional(formular, "kontakt_id"),
    zustaendig_id: optional(formular, "zustaendig_id"),
  });

  if (!geprueft.success) {
    return { fehler: "Bitte geben Sie mindestens einen Titel an." };
  }

  const d = geprueft.data;
  const supabase = await serverClient();

  const { error } = await supabase.from("aufgaben").insert({
    mandant_id: sitzung.mandantId,
    titel: d.titel,
    beschreibung: d.beschreibung ?? null,
    prioritaet: d.prioritaet,
    faellig_am: d.faellig_am ?? null,
    objekt_id: d.objekt_id ?? null,
    kontakt_id: d.kontakt_id ?? null,
    // Ohne Angabe ist der Anlegende zustaendig. Eine Aufgabe ohne
    // Verantwortlichen bleibt sonst liegen, weil sie niemandem gehoert.
    zustaendig_id: d.zustaendig_id ?? sitzung.benutzerId,
    erstellt_von: sitzung.benutzerId,
  });

  if (error) return { fehler: "Die Aufgabe konnte nicht gespeichert werden." };

  seitenAktualisieren(d.objekt_id, d.kontakt_id);
  return {};
}

/**
 * Erledigen und Wiederoeffnen in einer Aktion.
 *
 * Beim Erledigen wird festgehalten, WER erledigt hat — die Datenbank verlangt
 * das per Check-Constraint. Sonst stuende spaeter „fertig" da, ohne dass
 * jemand dafuer geradesteht.
 */
export async function aufgabeUmschalten(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern");

  const id = String(formular.get("aufgabe_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("aufgaben")
    .select("erledigt_am, objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!vorhanden) return;

  const erledigen = vorhanden.erledigt_am === null;

  await supabase
    .from("aufgaben")
    .update(
      erledigen
        ? { erledigt_am: new Date().toISOString(), erledigt_von: sitzung.benutzerId }
        : { erledigt_am: null, erledigt_von: null },
    )
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  seitenAktualisieren(
    vorhanden.objekt_id ?? undefined,
    vorhanden.kontakt_id ?? undefined,
  );
}

export async function aufgabeLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "loeschen");

  const id = String(formular.get("aufgabe_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("aufgaben")
    .select("objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  await supabase
    .from("aufgaben")
    .delete()
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  seitenAktualisieren(
    vorhanden?.objekt_id ?? undefined,
    vorhanden?.kontakt_id ?? undefined,
  );
}

// --- Termine ---------------------------------------------------------------

const termin = z
  .object({
    titel: z.string().trim().min(1).max(300),
    art: z.enum(ARTEN),
    beginnt_am: z.string().min(1),
    dauer_minuten: z.coerce.number().int().min(5).max(1440),
    ort: z.string().trim().max(300).optional(),
    notiz: z.string().trim().max(2000).optional(),
    objekt_id: z.uuid().optional(),
    kontakt_id: z.uuid().optional(),
    zustaendig_id: z.uuid().optional(),
  })
  .refine((d) => !Number.isNaN(new Date(d.beginnt_am).getTime()), {
    message: "Ungültiger Zeitpunkt",
    path: ["beginnt_am"],
  });

export async function terminAnlegen(formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "anlegen");

  const geprueft = termin.safeParse({
    titel: String(formular.get("titel") ?? ""),
    art: String(formular.get("art") ?? "besichtigung"),
    beginnt_am: String(formular.get("beginnt_am") ?? ""),
    // Dauer statt Endzeitpunkt: Beim Eintragen einer Besichtigung ist „60
    // Minuten" die Angabe, die man im Kopf hat — nicht „15:00 bis 16:00".
    dauer_minuten: String(formular.get("dauer_minuten") ?? "60"),
    ort: optional(formular, "ort"),
    notiz: optional(formular, "notiz"),
    objekt_id: optional(formular, "objekt_id"),
    kontakt_id: optional(formular, "kontakt_id"),
    zustaendig_id: optional(formular, "zustaendig_id"),
  });

  if (!geprueft.success) {
    return { fehler: "Bitte geben Sie Titel und Zeitpunkt an." };
  }

  const d = geprueft.data;
  const beginn = new Date(d.beginnt_am);
  const ende = new Date(beginn.getTime() + d.dauer_minuten * 60_000);

  const supabase = await serverClient();
  const { error } = await supabase.from("termine").insert({
    mandant_id: sitzung.mandantId,
    titel: d.titel,
    art: d.art,
    beginnt_am: beginn.toISOString(),
    endet_am: ende.toISOString(),
    ort: d.ort ?? null,
    notiz: d.notiz ?? null,
    objekt_id: d.objekt_id ?? null,
    kontakt_id: d.kontakt_id ?? null,
    zustaendig_id: d.zustaendig_id ?? sitzung.benutzerId,
    erstellt_von: sitzung.benutzerId,
  });

  if (error) return { fehler: "Der Termin konnte nicht gespeichert werden." };

  seitenAktualisieren(d.objekt_id, d.kontakt_id);
  return {};
}

/**
 * Sagt einen Termin ab, statt ihn zu loeschen.
 *
 * Ein abgesagter Termin ist eine Information: Er stand im Kalender, jemand hat
 * sich darauf eingerichtet. Ihn zu entfernen wuerde die Absage unsichtbar
 * machen — und im Verlauf des Objekts eine Luecke hinterlassen.
 */
export async function terminAbsagen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern");

  const id = String(formular.get("termin_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("termine")
    .select("abgesagt_am, objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!vorhanden) return;

  await supabase
    .from("termine")
    .update({
      abgesagt_am: vorhanden.abgesagt_am === null ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  seitenAktualisieren(
    vorhanden.objekt_id ?? undefined,
    vorhanden.kontakt_id ?? undefined,
  );
}
