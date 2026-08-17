"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ZUSTANDSNOTEN, type Zustandsnote } from "@/lib/aufnahme";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { DOKUMENTARTEN, type Dokumentart } from "@/lib/dokumente";
import { serverClient } from "@/lib/supabase/server";

/**
 * Objektaufnahme anlegen, aendern und uebernehmen.
 *
 * Die Rechte laufen ueber das Modul `objekte`: Eine Aufnahme ist der Anfang
 * eines Objekts, und wer keine Objekte anlegen darf, soll auch keine Aufnahme
 * in den Bestand ueberfuehren koennen.
 */

const NOTEN = Object.keys(ZUSTANDSNOTEN) as [Zustandsnote, ...Zustandsnote[]];
const ARTEN = Object.keys(DOKUMENTARTEN) as [Dokumentart, ...Dokumentart[]];

/** Leerer String aus einem Formular ist „nichts angegeben", nicht „leer". */
function text(formular: FormData, feld: string): string | undefined {
  const wert = String(formular.get(feld) ?? "").trim();
  return wert === "" ? undefined : wert;
}

const aufnahme = z.object({
  aufgenommen_am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bezeichnung: z.string().trim().min(1).max(200),
  kontakt_id: z.uuid().optional(),
  strasse: z.string().trim().max(200).optional(),
  hausnummer: z.string().trim().max(20).optional(),
  plz: z.string().trim().max(10).optional(),
  ort: z.string().trim().max(120).optional(),
  objektkategorie: z
    .enum(["wohnung", "haus", "grundstueck", "gewerbe", "anlage", "sonstige"])
    .optional(),
  vermarktungsart: z.enum(["kauf", "miete", "kauf_miete"]).optional(),
  wohnflaeche: z.coerce.number().min(0).max(100000).optional(),
  grundstuecksflaeche: z.coerce.number().min(0).max(10000000).optional(),
  zimmer: z.coerce.number().min(0).max(200).optional(),
  baujahr: z.coerce.number().int().min(1000).max(2200).optional(),
  etage: z.coerce.number().int().min(-5).max(200).optional(),
  zustand_dach: z.enum(NOTEN),
  zustand_fassade: z.enum(NOTEN),
  zustand_fenster: z.enum(NOTEN),
  zustand_heizung: z.enum(NOTEN),
  zustand_baeder: z.enum(NOTEN),
  zustand_elektrik: z.enum(NOTEN),
  heizungsart: z.string().trim().max(120).optional(),
  heizung_baujahr: z.coerce.number().int().min(1000).max(2200).optional(),
  preisvorstellung: z.coerce.number().min(0).max(1000000000).optional(),
  notizen: z.string().trim().max(5000).optional(),
});

export interface AufnahmeErgebnis {
  fehler?: string;
}

function auslesen(formular: FormData) {
  return aufnahme.safeParse({
    aufgenommen_am:
      text(formular, "aufgenommen_am") ?? new Date().toISOString().slice(0, 10),
    bezeichnung: String(formular.get("bezeichnung") ?? ""),
    kontakt_id: text(formular, "kontakt_id"),
    strasse: text(formular, "strasse"),
    hausnummer: text(formular, "hausnummer"),
    plz: text(formular, "plz"),
    ort: text(formular, "ort"),
    objektkategorie: text(formular, "objektkategorie"),
    vermarktungsart: text(formular, "vermarktungsart"),
    wohnflaeche: text(formular, "wohnflaeche"),
    grundstuecksflaeche: text(formular, "grundstuecksflaeche"),
    zimmer: text(formular, "zimmer"),
    baujahr: text(formular, "baujahr"),
    etage: text(formular, "etage"),
    zustand_dach: String(formular.get("zustand_dach") ?? "unbekannt"),
    zustand_fassade: String(formular.get("zustand_fassade") ?? "unbekannt"),
    zustand_fenster: String(formular.get("zustand_fenster") ?? "unbekannt"),
    zustand_heizung: String(formular.get("zustand_heizung") ?? "unbekannt"),
    zustand_baeder: String(formular.get("zustand_baeder") ?? "unbekannt"),
    zustand_elektrik: String(formular.get("zustand_elektrik") ?? "unbekannt"),
    heizungsart: text(formular, "heizungsart"),
    heizung_baujahr: text(formular, "heizung_baujahr"),
    preisvorstellung: text(formular, "preisvorstellung"),
    notizen: text(formular, "notizen"),
  });
}

/** Ausgewaehlte Unterlagen; unbekannte Werte werden verworfen. */
function unterlagen(formular: FormData): Dokumentart[] {
  const gewaehlt = formular
    .getAll("unterlagen_offen")
    .map((w) => String(w))
    .filter((w): w is Dokumentart => (ARTEN as string[]).includes(w));
  return [...new Set(gewaehlt)];
}

/** `undefined` wird zu `null`: Die Datenbank kennt kein „nicht angegeben". */
function zuSpalten(daten: z.output<typeof aufnahme>) {
  return {
    aufgenommen_am: daten.aufgenommen_am,
    bezeichnung: daten.bezeichnung,
    kontakt_id: daten.kontakt_id ?? null,
    strasse: daten.strasse ?? null,
    hausnummer: daten.hausnummer ?? null,
    plz: daten.plz ?? null,
    ort: daten.ort ?? null,
    objektkategorie: daten.objektkategorie ?? null,
    vermarktungsart: daten.vermarktungsart ?? null,
    wohnflaeche: daten.wohnflaeche ?? null,
    grundstuecksflaeche: daten.grundstuecksflaeche ?? null,
    zimmer: daten.zimmer ?? null,
    baujahr: daten.baujahr ?? null,
    etage: daten.etage ?? null,
    zustand_dach: daten.zustand_dach,
    zustand_fassade: daten.zustand_fassade,
    zustand_fenster: daten.zustand_fenster,
    zustand_heizung: daten.zustand_heizung,
    zustand_baeder: daten.zustand_baeder,
    zustand_elektrik: daten.zustand_elektrik,
    heizungsart: daten.heizungsart ?? null,
    heizung_baujahr: daten.heizung_baujahr ?? null,
    preisvorstellung: daten.preisvorstellung ?? null,
    notizen: daten.notizen ?? null,
  };
}

export async function aufnahmeAnlegen(
  formular: FormData,
): Promise<AufnahmeErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "anlegen");

  const geprueft = auslesen(formular);
  if (!geprueft.success) {
    return { fehler: "Bitte prüfen Sie die Angaben — eine Bezeichnung ist nötig." };
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("objektaufnahmen")
    .insert({
      mandant_id: sitzung.mandantId,
      ...zuSpalten(geprueft.data),
      unterlagen_offen: unterlagen(formular),
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { fehler: "Die Aufnahme konnte nicht gespeichert werden." };
  }

  revalidatePath("/aufnahmen");
  redirect(`/aufnahmen/${data.id}`);
}

export async function aufnahmeSpeichern(
  formular: FormData,
): Promise<AufnahmeErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern");

  const id = String(formular.get("aufnahme_id") ?? "").trim();
  if (!id) return { fehler: "Die Aufnahme wurde nicht gefunden." };

  const geprueft = auslesen(formular);
  if (!geprueft.success) {
    return { fehler: "Bitte prüfen Sie die Angaben — eine Bezeichnung ist nötig." };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from("objektaufnahmen")
    .update({
      ...zuSpalten(geprueft.data),
      unterlagen_offen: unterlagen(formular),
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    // Eine uebernommene Aufnahme ist der Beleg fuer den Zustand beim Termin.
    // Sie nachtraeglich zu aendern hiesse, den Beleg zu aendern.
    .eq("status", "offen");

  if (error) return { fehler: "Die Änderungen konnten nicht gespeichert werden." };

  revalidatePath(`/aufnahmen/${id}`);
  revalidatePath("/aufnahmen");
  return {};
}

/**
 * Uebernimmt die Aufnahme in den Bestand.
 *
 * Die eigentliche Arbeit macht die Datenbankfunktion: Objekt anlegen,
 * Eigentuemer verknuepfen, Aufgaben fuer die offenen Unterlagen erzeugen,
 * Aufnahme kennzeichnen. In einer Transaktion, damit nicht ein Objekt ohne
 * Eigentuemer und ohne Aufgaben stehen bleibt.
 */
export async function aufnahmeUebernehmen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "anlegen");

  const id = String(formular.get("aufnahme_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: objektId, error } = await supabase.rpc("aufnahme_uebernehmen", {
    p_aufnahme: id,
  });

  if (error || typeof objektId !== "string") {
    revalidatePath(`/aufnahmen/${id}`);
    return;
  }

  revalidatePath("/aufnahmen");
  revalidatePath("/objekte");
  redirect(`/objekte/${objektId}`);
}

/**
 * Verwirft eine Aufnahme.
 *
 * Kein Loeschen: Ein nicht zustande gekommener Auftrag ist eine Information —
 * etwa, wenn derselbe Eigentuemer ein Jahr spaeter wieder anfragt.
 */
export async function aufnahmeVerwerfen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern");

  const id = String(formular.get("aufnahme_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("objektaufnahmen")
    .select("status")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!vorhanden) return;

  await supabase
    .from("objektaufnahmen")
    .update({
      status: vorhanden.status === "verworfen" ? "offen" : "verworfen",
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .neq("status", "uebernommen");

  revalidatePath(`/aufnahmen/${id}`);
  revalidatePath("/aufnahmen");
}
