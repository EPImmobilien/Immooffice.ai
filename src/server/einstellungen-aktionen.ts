"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AKTIONEN,
  MODULE,
  ROLLEN,
  hatRecht,
  rechtErzwingen,
  type Rolle,
  type Uebersteuerung,
} from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { kontrastPruefen } from "@/lib/branding/farben";
import { istSchrift } from "@/lib/branding/schriften";
import { MARKE_BUCKET } from "@/lib/marke";
import { serverClient } from "@/lib/supabase/server";

/**
 * Einstellungen des Unternehmens.
 *
 * Alles hier laeuft ueber das Modul `einstellungen`, das nur Inhaber und
 * Administrator besitzen. Zusaetzlich verlangen die Policies der Datenbank fuer
 * `mandant_branding` und fuer Rollenaenderungen ausdruecklich die Verwaltung —
 * die Pruefung hier ist die freundliche Fehlermeldung, nicht der Schutz.
 */

/** Leerer String aus einem Formular ist „nichts angegeben", nicht „leer". */
function text(formular: FormData, feld: string): string | null {
  const wert = String(formular.get(feld) ?? "").trim();
  return wert === "" ? null : wert;
}

export interface EinstellungenErgebnis {
  fehler?: string;
  hinweis?: string;
}

const FARBE = /^#[0-9A-Fa-f]{6}$/;

const stammdaten = z.object({
  firmenname: z.string().trim().min(1).max(200),
  rechtsform: z.string().trim().max(60).nullable(),
  geschaeftsfuehrer: z.string().trim().max(200).nullable(),
  strasse: z.string().trim().max(200).nullable(),
  hausnummer: z.string().trim().max(20).nullable(),
  plz: z.string().trim().regex(/^[0-9]{5}$/).nullable(),
  ort: z.string().trim().max(120).nullable(),
  telefon: z.string().trim().max(60).nullable(),
  email: z.email().max(200).nullable(),
  web: z.string().trim().max(200).nullable(),
  // Impressumsangaben (docs/AUTONOMIE.md O1 Schritt 3, R4).
  handelsregister: z.string().trim().max(120).nullable(),
  ust_id: z.string().trim().toUpperCase().regex(/^[A-Z]{2}[A-Z0-9]{2,12}$/).nullable(),
  aufsichtsbehoerde: z.string().trim().max(200).nullable(),
});

/**
 * Legt die Branding-Zeile an, falls sie fehlt.
 *
 * Sie entsteht nicht bei der Registrierung, und ein `update` auf eine
 * nicht vorhandene Zeile aendert lautlos nichts — der Nutzer sieht dann eine
 * Erfolgsmeldung und beim naechsten Laden wieder leere Felder.
 */
async function brandingSichern(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  mandantId: string,
): Promise<void> {
  await supabase
    .from("mandant_branding")
    .upsert({ mandant_id: mandantId }, { onConflict: "mandant_id", ignoreDuplicates: true });
}

export async function stammdatenSpeichern(
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const geprueft = stammdaten.safeParse({
    firmenname: String(formular.get("firmenname") ?? ""),
    rechtsform: text(formular, "rechtsform"),
    geschaeftsfuehrer: text(formular, "geschaeftsfuehrer"),
    strasse: text(formular, "strasse"),
    hausnummer: text(formular, "hausnummer"),
    plz: text(formular, "plz"),
    ort: text(formular, "ort"),
    telefon: text(formular, "telefon"),
    email: text(formular, "email"),
    web: text(formular, "web"),
    handelsregister: text(formular, "handelsregister"),
    ust_id: text(formular, "ust_id"),
    aufsichtsbehoerde: text(formular, "aufsichtsbehoerde"),
  });

  if (!geprueft.success) {
    return {
      fehler:
        "Bitte prüfen Sie die Angaben — ein Firmenname ist nötig, die Postleitzahl hat fünf Ziffern, " +
        "die E-Mail-Adresse muss gültig sein und die USt-IdNr. beginnt mit dem Länderkürzel (etwa DE123456789).",
    };
  }

  const supabase = await serverClient();
  await brandingSichern(supabase, sitzung.mandantId);

  const { error } = await supabase
    .from("mandant_branding")
    .update(geprueft.data)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Angaben konnten nicht gespeichert werden." };

  // Diese Angaben stehen in jedem Exposé und in jedem Marketingmotiv.
  revalidatePath("/einstellungen");
  revalidatePath("/exposes");
  revalidatePath("/marketing");
  return { hinweis: "Die Unternehmensangaben wurden gespeichert." };
}

export async function erscheinungsbildSpeichern(
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const primaer = text(formular, "farbe_primaer");
  const akzent = text(formular, "farbe_akzent");

  // Die Datenbank hat dieselbe Bedingung. Hier entsteht daraus eine lesbare
  // Meldung statt eines Datenbankfehlers.
  if ((primaer && !FARBE.test(primaer)) || (akzent && !FARBE.test(akzent))) {
    return { fehler: "Farben werden als Sechsstellen-Hexwert erwartet, etwa #1B2A47." };
  }

  // Schriften (B2): nur aus der kuratierten Liste, je Kategorie eine. Fehlt
  // die Angabe (aelteres Formular), bleibt der gespeicherte Wert stehen.
  const serifenlos = text(formular, "schrift_serifenlos");
  const serifen = text(formular, "schrift_serifen");
  if ((serifenlos && !istSchrift(serifenlos, "serifenlos")) || (serifen && !istSchrift(serifen, "serifen"))) {
    return { fehler: "Bitte je eine Schrift aus der Liste wählen." };
  }

  const supabase = await serverClient();
  await brandingSichern(supabase, sitzung.mandantId);

  const { error } = await supabase
    .from("mandant_branding")
    .update({
      farbe_primaer: primaer ? primaer.toUpperCase() : null,
      farbe_akzent: akzent ? akzent.toUpperCase() : null,
      ...(serifenlos ? { schrift_serifenlos: serifenlos } : {}),
      ...(serifen ? { schrift_serifen: serifen } : {}),
    })
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Das Erscheinungsbild konnte nicht gespeichert werden." };

  // Kontrastbefunde sind ein Hinweis, kein Speicherhindernis (B1): Die Marke
  // gehoert dem Mandanten. Gemeldet wird trotzdem, was schlecht lesbar ist.
  const befunde = primaer && akzent ? kontrastPruefen(primaer, akzent) : [];

  revalidatePath("/einstellungen");
  revalidatePath("/exposes");
  revalidatePath("/marketing");
  revalidatePath("/", "layout");
  return {
    hinweis:
      befunde.length === 0
        ? "Das Erscheinungsbild wurde gespeichert."
        : `Gespeichert. Hinweis: ${befunde.length === 1 ? "Eine Farbkombination liegt" : `${befunde.length} Farbkombinationen liegen`} unter der empfohlenen Lesbarkeit (WCAG AA) — siehe die Warnungen oben.`,
  };
}

export async function rechtstexteSpeichern(
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const supabase = await serverClient();
  await brandingSichern(supabase, sitzung.mandantId);

  const { error } = await supabase
    .from("mandant_branding")
    .update({
      impressum: text(formular, "impressum"),
      datenschutztext: text(formular, "datenschutztext"),
      widerrufsbelehrung: text(formular, "widerrufsbelehrung"),
    })
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Texte konnten nicht gespeichert werden." };

  revalidatePath("/einstellungen");
  return {
    hinweis:
      "Die Texte wurden gespeichert. Sie sind Ihre eigenen Angaben — ImmoOffice.ai prüft sie nicht auf rechtliche Richtigkeit.",
  };
}

/**
 * Vermerkt ein hochgeladenes Logo.
 *
 * Die Datei geht direkt vom Browser in den Storage; hier wird nur der Pfad
 * eingetragen. Der Pfad wird gegen den eigenen Mandanten geprueft — er kommt
 * aus dem Browser und ist damit keine verlaessliche Angabe.
 */
export async function logoErfassen(
  pfad: string,
  variante: "hell" | "dunkel" = "hell",
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  if (!pfad.startsWith(`${sitzung.mandantId}/`)) {
    return { fehler: "Der Dateipfad gehört nicht zu diesem Unternehmen." };
  }

  // B3: helle Fassung in logo_pfad, dunkle (optional) in logo_invers_pfad.
  const spalte = variante === "dunkel" ? "logo_invers_pfad" : "logo_pfad";

  const supabase = await serverClient();
  await brandingSichern(supabase, sitzung.mandantId);

  // Den alten Pfad vorher lesen, damit die abgeloeste Datei nicht im Storage
  // liegen bleibt.
  const { data: vorher } = await supabase
    .from("mandant_branding")
    .select(spalte)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  const alterPfad = (vorher as Record<string, string | null> | null)?.[spalte] ?? null;

  const { error } = await supabase
    .from("mandant_branding")
    .update({ [spalte]: pfad })
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Das Logo konnte nicht gespeichert werden." };

  if (alterPfad && alterPfad !== pfad) {
    await supabase.storage.from(MARKE_BUCKET).remove([alterPfad]);
  }

  revalidatePath("/einstellungen");
  revalidatePath("/onboarding", "layout");
  revalidatePath("/exposes");
  return { hinweis: variante === "dunkel" ? "Das Logo für dunkle Flächen wurde gespeichert." : "Das Logo wurde gespeichert." };
}

/** Entfernt die helle oder dunkle Fassung (`variante` im Formular). */
export async function logoEntfernen(formular?: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const spalte = formular?.get("variante") === "dunkel" ? "logo_invers_pfad" : "logo_pfad";

  const supabase = await serverClient();
  const { data: vorher } = await supabase
    .from("mandant_branding")
    .select(spalte)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  const alterPfad = (vorher as Record<string, string | null> | null)?.[spalte] ?? null;

  await supabase
    .from("mandant_branding")
    .update({ [spalte]: null })
    .eq("mandant_id", sitzung.mandantId);

  if (alterPfad) {
    await supabase.storage.from(MARKE_BUCKET).remove([alterPfad]);
  }

  revalidatePath("/einstellungen");
  revalidatePath("/onboarding", "layout");
  revalidatePath("/exposes");
}

// --- Benutzer --------------------------------------------------------------

export async function rolleSetzen(
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const benutzerId = String(formular.get("benutzer_id") ?? "").trim();
  const rolle = String(formular.get("rolle") ?? "").trim();

  if (!benutzerId || !(ROLLEN as readonly string[]).includes(rolle)) {
    return { fehler: "Unbekannte Rolle." };
  }

  // Die eigene Rolle nicht aendern. Ein Inhaber, der sich versehentlich auf
  // Nur-Lese setzt, kann sich nicht selbst zurueckholen — es gibt niemanden
  // mehr mit dem Recht dazu, wenn er der einzige Verwalter ist.
  if (benutzerId === sitzung.benutzerId) {
    return {
      fehler:
        "Die eigene Rolle lässt sich hier nicht ändern. Bitten Sie eine andere Person mit Verwaltungsrechten darum.",
    };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from("benutzer")
    .update({ rolle: rolle as Rolle })
    .eq("id", benutzerId)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Rolle konnte nicht geändert werden." };

  revalidatePath("/einstellungen");
  return { hinweis: "Die Rolle wurde geändert." };
}

/**
 * Setzt die Rechteabweichungen eines Benutzers.
 *
 * Gespeichert werden nur ABWEICHUNGEN von der Rollenvorbelegung, nicht die
 * vollstaendige Rechteliste. Der Unterschied ist wichtig: Wird die Rolle spaeter
 * geaendert oder die Vorbelegung angepasst, wirkt das weiterhin — ausser bei den
 * Punkten, die hier ausdruecklich anders gesetzt sind. Eine gespeicherte
 * Vollliste waere dagegen ab dem Speichern eingefroren.
 */
export async function rechteSetzen(
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(
    sitzung.rolle,
    "einstellungen",
    "aendern",
    sitzung.uebersteuerung,
  );

  const benutzerId = String(formular.get("benutzer_id") ?? "").trim();
  if (!benutzerId) return { fehler: "Der Zugang wurde nicht gefunden." };

  // Auch die Datenbank weist das ab. Hier entsteht daraus eine Erklaerung
  // statt eines Fehlers.
  if (benutzerId === sitzung.benutzerId) {
    return {
      fehler:
        "Die eigenen Rechte lassen sich nicht selbst ändern. Bitten Sie eine andere Person mit Verwaltungsrechten darum.",
    };
  }

  const supabase = await serverClient();
  const { data: ziel } = await supabase
    .from("benutzer")
    .select("rolle")
    .eq("id", benutzerId)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!ziel) return { fehler: "Der Zugang wurde nicht gefunden." };

  // Aus den angekreuzten Kaestchen wird der Ist-Zustand gebildet und gegen die
  // Rollenvorbelegung verglichen. Nur die Unterschiede werden gespeichert.
  const gewaehlt = new Set(
    formular.getAll("recht").map((w) => String(w)),
  );

  const abweichungen: Uebersteuerung = {};
  for (const modul of MODULE) {
    for (const aktion of AKTIONEN) {
      const soll = gewaehlt.has(`${modul}:${aktion}`);
      const ausRolle = hatRecht(ziel.rolle as Rolle, modul, aktion);
      if (soll !== ausRolle) {
        abweichungen[modul] = { ...abweichungen[modul], [aktion]: soll };
      }
    }
  }

  const { error } = await supabase
    .from("benutzer")
    .update({ rechte_uebersteuerung: abweichungen })
    .eq("id", benutzerId)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Die Rechte konnten nicht gespeichert werden." };

  revalidatePath("/einstellungen");

  const anzahl = Object.values(abweichungen).reduce(
    (summe, aktionen) => summe + Object.keys(aktionen ?? {}).length,
    0,
  );

  return {
    hinweis:
      anzahl === 0
        ? "Gespeichert. Es gelten wieder ausschließlich die Rechte der Rolle."
        : `Gespeichert. ${anzahl} ${anzahl === 1 ? "Abweichung" : "Abweichungen"} von der Rolle.`,
  };
}

/**
 * Schaltet einen Zugang ab oder wieder frei.
 *
 * Kein Loeschen: Ein Benutzer haengt an Objekten, Aufgaben und
 * Verlaufseintraegen. Ihn zu entfernen wuerde diese Spuren anonymisieren und
 * damit den Verlauf entwerten.
 */
export async function zugangUmschalten(
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const benutzerId = String(formular.get("benutzer_id") ?? "").trim();
  if (!benutzerId) return {};

  if (benutzerId === sitzung.benutzerId) {
    return { fehler: "Den eigenen Zugang können Sie nicht abschalten." };
  }

  const supabase = await serverClient();
  const { data: vorher } = await supabase
    .from("benutzer")
    .select("aktiv")
    .eq("id", benutzerId)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!vorher) return { fehler: "Der Zugang wurde nicht gefunden." };

  const { error } = await supabase
    .from("benutzer")
    .update({ aktiv: !vorher.aktiv })
    .eq("id", benutzerId)
    .eq("mandant_id", sitzung.mandantId);

  if (error) return { fehler: "Der Zugang konnte nicht geändert werden." };

  revalidatePath("/einstellungen");
  return {
    hinweis: vorher.aktiv
      ? "Der Zugang ist abgeschaltet. Die bisherigen Einträge dieser Person bleiben erhalten."
      : "Der Zugang ist wieder frei.",
  };
}
