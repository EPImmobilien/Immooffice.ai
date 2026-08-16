"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export interface ObjektErgebnis {
  fehler?: string;
  feldFehler?: Record<string, string>;
}

/** Leere Formularfelder als `null` statt als leerer Zeichenkette speichern. */
const text = z
  .string()
  .trim()
  .transform((w) => (w === "" ? null : w))
  .nullable();

/** Deutsche Zahleneingabe: "349.000,50" wie auch "349000.50" akzeptieren. */
const zahl = z
  .string()
  .trim()
  .transform((w) => {
    if (w === "") return null;
    const normiert = w.replace(/\./g, "").replace(",", ".").replace(/\s/g, "");
    const n = Number(normiert);
    return Number.isFinite(n) ? n : null;
  })
  .nullable();

const ganzzahl = z
  .string()
  .trim()
  .transform((w) => {
    if (w === "") return null;
    const n = Number.parseInt(w.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  })
  .nullable();

const objektSchema = z.object({
  bezeichnung: z
    .string()
    .trim()
    .min(1, "Bitte eine Objektbezeichnung angeben.")
    .max(200, "Die Bezeichnung ist zu lang."),
  titel: text,
  vermarktungsart: z.enum(["kauf", "miete", "kauf_miete"]),
  objektkategorie: z.enum([
    "wohnung",
    "haus",
    "grundstueck",
    "gewerbe",
    "anlage",
    "sonstige",
  ]),
  objektart: text,
  nutzungsart: z.enum(["wohnen", "gewerbe", "anlage", "gemischt"]),
  status: z.enum([
    "akquise",
    "vorbereitung",
    "aktiv",
    "reserviert",
    "verkauft",
    "vermietet",
    "zurueckgezogen",
    "archiviert",
  ]),
  strasse: text,
  hausnummer: text,
  plz: z
    .string()
    .trim()
    .transform((w) => (w === "" ? null : w))
    .nullable()
    .refine((w) => w === null || /^[0-9]{4,5}$/.test(w), {
      message: "Die Postleitzahl muss aus 4 oder 5 Ziffern bestehen.",
    }),
  ort: text,
  wohnflaeche: zahl,
  nutzflaeche: zahl,
  grundstuecksflaeche: zahl,
  zimmer: zahl,
  baujahr: ganzzahl,
  kaufpreis: zahl,
  kaltmiete: zahl,
  nebenkosten: zahl,
  hausgeld: zahl,
  energieausweis_typ: z
    .enum(["bedarf", "verbrauch", "nicht_erforderlich", "liegt_nicht_vor", ""])
    .transform((w) => (w === "" ? null : w)),
  energie_kennwert: zahl,
  energie_klasse: z
    .enum(["A+", "A", "B", "C", "D", "E", "F", "G", "H", ""])
    .transform((w) => (w === "" ? null : w)),
  beschreibung_objekt: text,
  beschreibung_ausstattung: text,
  beschreibung_lage: text,
});

function formularLesen(formular: FormData) {
  const roh: Record<string, string> = {};
  for (const schluessel of Object.keys(objektSchema.shape)) {
    roh[schluessel] = String(formular.get(schluessel) ?? "");
  }
  return roh;
}

function feldFehler(fehler: z.ZodError): Record<string, string> {
  const aus: Record<string, string> = {};
  for (const problem of fehler.issues) {
    const feld = problem.path[0];
    if (typeof feld === "string" && !aus[feld]) aus[feld] = problem.message;
  }
  return aus;
}

export async function objektSpeichern(
  _vorher: ObjektErgebnis,
  formular: FormData,
): Promise<ObjektErgebnis> {
  const sitzung = await sitzungErzwingen();
  const id = String(formular.get("id") ?? "").trim();
  const istNeu = id === "";

  // Serverseitige Rechtepruefung. Die Datenbank prueft zusaetzlich per RLS —
  // ausgeblendete Schaltflaechen sind ausdruecklich kein Schutz (Abschnitt 5).
  rechtErzwingen(sitzung.rolle, "objekte", istNeu ? "anlegen" : "aendern");

  const geprueft = objektSchema.safeParse(formularLesen(formular));
  if (!geprueft.success) {
    return {
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: feldFehler(geprueft.error),
    };
  }

  const supabase = await serverClient();
  const daten = geprueft.data;

  if (istNeu) {
    const { data, error } = await supabase
      .from("objekte")
      // mandant_id wird gesetzt, weil die RLS-Policy sie im WITH CHECK
      // gegen den Mandanten der Sitzung prueft.
      .insert({
        ...daten,
        mandant_id: sitzung.mandantId,
        erstellt_von: sitzung.benutzerId,
        zustaendig_id: sitzung.benutzerId,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { fehler: "Das Objekt konnte nicht angelegt werden." };
    }

    revalidatePath("/objekte");
    redirect(`/objekte/${data.id}`);
  }

  const { error } = await supabase
    .from("objekte")
    .update(daten)
    .eq("id", id)
    // Zusaetzlich zur RLS: schuetzt auch dann, wenn eine Policy falsch waere.
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Änderungen konnten nicht gespeichert werden." };

  revalidatePath("/objekte");
  revalidatePath(`/objekte/${id}`);
  redirect(`/objekte/${id}`);
}

export async function objektLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "loeschen");

  const id = String(formular.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  // Loeschen ist fachlich ein Zustand (Aufbewahrungspflichten, Abschnitt 16).
  await supabase
    .from("objekte")
    .update({ geloescht_am: new Date().toISOString() })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath("/objekte");
  redirect("/objekte");
}
