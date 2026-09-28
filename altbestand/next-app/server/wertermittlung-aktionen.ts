"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { VERFAHREN, type Verfahren } from "@/lib/wertermittlung";

/**
 * Wertermittlung anlegen und ihre Ansaetze pflegen.
 *
 * Gespeichert werden ausschliesslich die Ansaetze. Das Ergebnis wird bei jeder
 * Anzeige neu gerechnet — ein gespeichertes Ergebnis koennte von seinen
 * Ansaetzen abweichen, sobald an der Rechnung etwas korrigiert wird.
 */

const VERFAHRENSLISTE = Object.keys(VERFAHREN) as [Verfahren, ...Verfahren[]];

export interface WertErgebnis {
  fehler?: string;
  hinweis?: string;
}

/** Zahl aus einem Formularfeld; leer bleibt leer statt null zu werden. */
function zahl(formular: FormData, feld: string): number | null {
  const roh = String(formular.get(feld) ?? "").trim();
  if (roh === "") return null;
  const wert = Number(roh.replace(",", "."));
  return Number.isFinite(wert) ? wert : null;
}

function text(formular: FormData, feld: string): string | null {
  const wert = String(formular.get(feld) ?? "").trim();
  return wert === "" ? null : wert;
}

const anlegen = z.object({
  bezeichnung: z.string().trim().min(1).max(200),
  stichtag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  objekt_id: z.uuid().optional(),
  kontakt_id: z.uuid().optional(),
});

export async function wertermittlungAnlegen(
  formular: FormData,
): Promise<WertErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "wertermittlung", "anlegen", sitzung.uebersteuerung);

  const geprueft = anlegen.safeParse({
    bezeichnung: String(formular.get("bezeichnung") ?? ""),
    stichtag:
      text(formular, "stichtag") ?? new Date().toISOString().slice(0, 10),
    ...(text(formular, "objekt_id") ? { objekt_id: text(formular, "objekt_id") } : {}),
    ...(text(formular, "kontakt_id") ? { kontakt_id: text(formular, "kontakt_id") } : {}),
  });

  if (!geprueft.success) {
    return { fehler: "Bitte geben Sie eine Bezeichnung an." };
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("wertermittlungen")
    .insert({
      mandant_id: sitzung.mandantId,
      bezeichnung: geprueft.data.bezeichnung,
      stichtag: geprueft.data.stichtag,
      objekt_id: geprueft.data.objekt_id ?? null,
      kontakt_id: geprueft.data.kontakt_id ?? null,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { fehler: "Die Wertermittlung konnte nicht angelegt werden." };
  }

  revalidatePath("/wertermittlung");
  redirect(`/wertermittlung/${data.id}`);
}

/**
 * Speichert die Ansaetze eines Verfahrens.
 *
 * Je Verfahren ein eigener Aufruf: Die drei Rechenblaetter werden unabhaengig
 * voneinander gefuellt, und ein gemeinsames Speichern wuerde beim Bearbeiten
 * des einen die Eingaben des anderen ueberschreiben.
 */
export async function ansaetzeSpeichern(
  formular: FormData,
): Promise<WertErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "wertermittlung", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("wertermittlung_id") ?? "").trim();
  const verfahren = String(formular.get("verfahren") ?? "");

  if (!id || !(VERFAHRENSLISTE as string[]).includes(verfahren)) {
    return { fehler: "Unbekanntes Verfahren." };
  }

  let ansaetze: Record<string, unknown>;

  if (verfahren === "ertragswert") {
    ansaetze = {
      jahresrohertrag: zahl(formular, "jahresrohertrag"),
      bewirtschaftungsquote: zahl(formular, "bewirtschaftungsquote"),
      bodenwert: zahl(formular, "bodenwert"),
      liegenschaftszins: zahl(formular, "liegenschaftszins"),
      restnutzungsdauer: zahl(formular, "restnutzungsdauer"),
    };
  } else if (verfahren === "sachwert") {
    ansaetze = {
      bruttogrundflaeche: zahl(formular, "bruttogrundflaeche"),
      herstellungskostenProQm: zahl(formular, "herstellungskostenProQm"),
      gesamtnutzungsdauer: zahl(formular, "gesamtnutzungsdauer"),
      alter: zahl(formular, "alter"),
      bodenwert: zahl(formular, "sw_bodenwert"),
      aussenanlagen: zahl(formular, "aussenanlagen"),
      sachwertfaktor: zahl(formular, "sachwertfaktor"),
    };
  } else {
    // Vergleichsobjekte kommen als gleichnamige Felder; die Reihenfolge der
    // Formulardaten haelt die Zeilen zusammen.
    const bezeichnungen = formular.getAll("v_bezeichnung").map(String);
    const preise = formular.getAll("v_kaufpreis").map(String);
    const flaechen = formular.getAll("v_wohnflaeche").map(String);
    const anpassungen = formular.getAll("v_anpassung").map(String);

    const objekte = bezeichnungen
      .map((bezeichnung, i) => ({
        bezeichnung: bezeichnung.trim(),
        kaufpreis: preise[i] ? Number(preise[i].replace(",", ".")) : null,
        wohnflaeche: flaechen[i] ? Number(flaechen[i].replace(",", ".")) : null,
        anpassung: anpassungen[i] ? Number(anpassungen[i].replace(",", ".")) : null,
      }))
      // Vollstaendig leere Zeilen verwerfen: Das Formular bietet immer ein paar
      // Zeilen mehr an, als gebraucht werden.
      .filter(
        (o) =>
          o.bezeichnung !== "" || o.kaufpreis !== null || o.wohnflaeche !== null,
      )
      .map((o) => ({
        ...o,
        kaufpreis: Number.isFinite(o.kaufpreis) ? o.kaufpreis : null,
        wohnflaeche: Number.isFinite(o.wohnflaeche) ? o.wohnflaeche : null,
        anpassung: Number.isFinite(o.anpassung) ? o.anpassung : null,
      }));

    ansaetze = { wohnflaeche: zahl(formular, "vw_wohnflaeche"), objekte };
  }

  const supabase = await serverClient();
  const spalte = verfahren === "vergleichswert" ? "vergleich" : verfahren === "ertragswert" ? "ertrag" : "sachwert";

  const { error } = await supabase
    .from("wertermittlungen")
    .update({ [spalte]: ansaetze })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Ansätze konnten nicht gespeichert werden." };

  revalidatePath(`/wertermittlung/${id}`);
  return { hinweis: "Die Ansätze wurden gespeichert." };
}

/** Legt fest, welches Verfahren fachlich fuehrt, und haelt eine Notiz fest. */
export async function einordnungSpeichern(
  formular: FormData,
): Promise<WertErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "wertermittlung", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("wertermittlung_id") ?? "").trim();
  if (!id) return { fehler: "Die Wertermittlung wurde nicht gefunden." };

  const gewaehlt = String(formular.get("fuehrendes_verfahren") ?? "");
  const verfahren = (VERFAHRENSLISTE as string[]).includes(gewaehlt)
    ? (gewaehlt as Verfahren)
    : null;

  const supabase = await serverClient();
  const { error } = await supabase
    .from("wertermittlungen")
    .update({
      fuehrendes_verfahren: verfahren,
      notiz: text(formular, "notiz"),
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Einordnung konnte nicht gespeichert werden." };

  revalidatePath(`/wertermittlung/${id}`);
  return { hinweis: "Die Einordnung wurde gespeichert." };
}

export async function wertermittlungLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "wertermittlung", "loeschen", sitzung.uebersteuerung);

  const id = String(formular.get("wertermittlung_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  await supabase
    .from("wertermittlungen")
    .delete()
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath("/wertermittlung");
  redirect("/wertermittlung");
}
