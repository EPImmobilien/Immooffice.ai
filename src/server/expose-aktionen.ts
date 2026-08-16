"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { textAnbieter } from "@/lib/ki";
import type { Luecke, Textart, Textstil } from "@/lib/ki";
import { serverClient } from "@/lib/supabase/server";

export interface TextErgebnisAnzeige {
  fehler?: string;
  erfolg?: string;
  luecken?: Luecke[];
  quelle?: string;
  kiVerwendet?: boolean;
  credits?: number;
}

const auftragSchema = z.object({
  objektId: z.uuid("Ungültige Objektkennung."),
  stil: z.enum([
    "sachlich",
    "emotional",
    "hochwertig",
    "familienorientiert",
    "kapitalanlage",
    "luxus",
  ]),
  stichpunkte: z.string().trim().max(2000).optional(),
});

/** Welche Textarten in welches Objektfeld geschrieben werden. */
const ZIELFELD: Partial<Record<Textart, string>> = {
  titel: "titel",
  objektbeschreibung: "beschreibung_objekt",
  ausstattung: "beschreibung_ausstattung",
  lage: "beschreibung_lage",
};

export async function texteErzeugen(
  _vorher: TextErgebnisAnzeige,
  formular: FormData,
): Promise<TextErgebnisAnzeige> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "exposes", "anlegen");

  const geprueft = auftragSchema.safeParse({
    objektId: formular.get("objektId"),
    stil: formular.get("stil"),
    stichpunkte: formular.get("stichpunkte") ?? undefined,
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe ungültig." };
  }

  const supabase = await serverClient();
  const { data: objekt } = await supabase
    .from("objekte")
    .select("*")
    .eq("id", geprueft.data.objektId)
    .eq("mandant_id", sitzung.mandantId)
    .is("geloescht_am", null)
    .maybeSingle();

  if (!objekt) return { fehler: "Das Objekt wurde nicht gefunden." };

  const arten: Textart[] = ["titel", "objektbeschreibung", "ausstattung", "lage"];
  const anbieter = textAnbieter();

  let ergebnis;
  try {
    ergebnis = await anbieter.texteErzeugen({
      objekt: {
        objektkategorie: objekt.objektkategorie,
        objektart: objekt.objektart,
        vermarktungsart: objekt.vermarktungsart,
        nutzungsart: objekt.nutzungsart,
        ort: objekt.ort,
        ortsteil: objekt.ortsteil,
        wohnflaeche: objekt.wohnflaeche,
        nutzflaeche: objekt.nutzflaeche,
        grundstuecksflaeche: objekt.grundstuecksflaeche,
        zimmer: objekt.zimmer,
        baujahr: objekt.baujahr,
        kaufpreis: objekt.kaufpreis,
        kaltmiete: objekt.kaltmiete,
        energie_klasse: objekt.energie_klasse,
        energie_kennwert: objekt.energie_kennwert,
        stichpunkte: geprueft.data.stichpunkte ?? null,
      },
      stil: geprueft.data.stil as Textstil,
      arten,
    });
  } catch (fehler) {
    // Reservierte Credits werden ab Phase 1 an dieser Stelle freigegeben
    // (Abschnitt 14). Bis zur Einfuehrung des Ledgers entstehen keine.
    return {
      fehler:
        fehler instanceof Error
          ? fehler.message
          : "Die Texterzeugung ist fehlgeschlagen.",
    };
  }

  // Nur nicht leere Texte uebernehmen; bestehende Inhalte bleiben sonst stehen.
  const aktualisierung: Record<string, unknown> = {};
  for (const [art, feld] of Object.entries(ZIELFELD)) {
    const text = ergebnis.texte[art as Textart];
    if (text && text.trim() !== "") aktualisierung[feld] = text.trim();
  }

  if (Object.keys(aktualisierung).length === 0) {
    return {
      fehler: "Es konnten keine Texte erzeugt werden. Bitte Angaben ergänzen.",
      luecken: ergebnis.luecken,
    };
  }

  // Kennzeichnung nur setzen, wenn tatsaechlich ein Modell beteiligt war
  // (Abschnitt 8 und 10). Entwurfstexte aus Objektdaten sind keine KI-Texte.
  aktualisierung["texte_ki_erzeugt"] = ergebnis.kiVerwendet;
  // Neue Texte sind bis zur ausdruecklichen Freigabe nicht veroeffentlichbar.
  aktualisierung["texte_freigegeben_am"] = null;
  aktualisierung["texte_freigegeben_von"] = null;

  const { error } = await supabase
    .from("objekte")
    .update(aktualisierung)
    .eq("id", objekt.id)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Texte konnten nicht gespeichert werden." };

  revalidatePath(`/exposes/${objekt.id}`);
  revalidatePath(`/objekte/${objekt.id}`);

  return {
    erfolg: ergebnis.kiVerwendet
      ? "Texte erzeugt. Bitte prüfen und freigeben."
      : "Entwurf aus den Objektdaten erstellt. Bitte prüfen und ergänzen.",
    luecken: ergebnis.luecken,
    quelle: ergebnis.quelle,
    kiVerwendet: ergebnis.kiVerwendet,
    credits: ergebnis.credits,
  };
}

export async function texteFreigeben(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "exposes", "freigeben");

  const objektId = String(formular.get("objektId") ?? "").trim();
  if (!objektId) return;

  const supabase = await serverClient();
  await supabase
    .from("objekte")
    .update({
      texte_freigegeben_am: new Date().toISOString(),
      texte_freigegeben_von: sitzung.benutzerId,
    })
    .eq("id", objektId)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/exposes/${objektId}`);
}
