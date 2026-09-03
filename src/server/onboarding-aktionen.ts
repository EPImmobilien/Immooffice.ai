"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { hexNormalisieren, istHexfarbe } from "@/lib/branding/farben";
import { istSchrift } from "@/lib/branding/schriften";
import { LETZTER_SCHRITT, SCHRITTE, istSchrittNr } from "@/lib/onboarding";
import { serverClient } from "@/lib/supabase/server";

/**
 * Onboarding-Assistent (docs/AUTONOMIE.md O1).
 *
 * Acht Schritte; 1–3 Pflicht, 4–8 ueberspringbar. Jeder Schritt schreibt in
 * `mandant_branding` — dieselben Spalten wie die Einstellungen, damit nichts
 * doppelt gepflegt wird. Der Fortschritt steht in `mandanten.onboarding_*`
 * und wird ueber `onboarding_fortschritt()` gesetzt, das beim Abschluss die
 * Pflichtangaben prueft.
 */

export interface OnboardingErgebnis {
  fehler?: string;
}

function text(formular: FormData, feld: string): string | null {
  const wert = String(formular.get(feld) ?? "").trim();
  return wert === "" ? null : wert;
}

const firmierung = z.object({
  firmenname: z.string().trim().min(2, "Bitte den Firmennamen angeben.").max(200),
  rechtsform: z.string().trim().max(60).nullable(),
  geschaeftsfuehrer: z.string().trim().max(200).nullable(),
});

const anschrift = z.object({
  strasse: z.string().trim().min(1, "Bitte die Straße angeben.").max(200),
  hausnummer: z.string().trim().max(20).nullable(),
  plz: z.string().trim().regex(/^[0-9]{5}$/, "Die Postleitzahl hat fünf Ziffern."),
  ort: z.string().trim().min(1, "Bitte den Ort angeben.").max(120),
  telefon: z.string().trim().max(60).nullable(),
  email: z.string().trim().toLowerCase().pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben.")),
  web: z.string().trim().max(200).nullable(),
});

const impressum = z.object({
  handelsregister: z.string().trim().max(120).nullable(),
  ust_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}[A-Z0-9]{2,12}$/, "Die USt-IdNr. beginnt mit dem Länderkürzel, etwa DE123456789.")
    .nullable(),
  aufsichtsbehoerde: z.string().trim().max(200).nullable(),
  impressum: z.string().trim().max(10_000).nullable(),
});

/**
 * Entfernt aus der Signatur alles, was in einer E-Mail nichts verloren hat:
 * Skripte, Ereignisattribute, Formulare. Erlaubt bleiben Textauszeichnung,
 * Zeilenumbrueche, Links und Bilder.
 */
export async function signaturBereinigen(html: string | null): Promise<string | null> {
  if (!html) return null;
  const sauber = html
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "")
    .trim();
  return sauber === "" ? null : sauber.slice(0, 5_000);
}

function eingabe(formular: FormData, felder: string[]): Record<string, string | null> {
  const werte: Record<string, string | null> = {};
  for (const feld of felder) werte[feld] = text(formular, feld);
  return werte;
}

async function fortschritt(schritt: number, abschliessen = false): Promise<string | null> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("onboarding_fortschritt", {
    p_schritt: schritt,
    p_abschliessen: abschliessen,
  });
  if (!error) return null;
  if (error.message.includes("vollstaendig")) {
    return "Firmierung, Anschrift und Impressumsdaten müssen vollständig sein, bevor das Onboarding abgeschlossen werden kann.";
  }
  return "Der Fortschritt konnte nicht gespeichert werden.";
}

/** Was ein Schritt in `mandant_branding` schreibt — oder eine Fehlermeldung. */
function aenderungFuer(schritt: number, formular: FormData): { aenderung: Record<string, unknown> | null } | { fehler: string } {
  if (schritt === 1) {
    const g = firmierung.safeParse(eingabe(formular, Object.keys(firmierung.shape)));
    return g.success ? { aenderung: g.data } : { fehler: g.error.issues[0]?.message ?? "Bitte die Angaben prüfen." };
  }
  if (schritt === 2) {
    const g = anschrift.safeParse(eingabe(formular, Object.keys(anschrift.shape)));
    return g.success ? { aenderung: g.data } : { fehler: g.error.issues[0]?.message ?? "Bitte die Angaben prüfen." };
  }
  if (schritt === 3) {
    const g = impressum.safeParse(eingabe(formular, Object.keys(impressum.shape)));
    return g.success ? { aenderung: g.data } : { fehler: g.error.issues[0]?.message ?? "Bitte die Angaben prüfen." };
  }
  if (schritt === 5) {
    const primaer = text(formular, "farbe_primaer");
    const akzent = text(formular, "farbe_akzent");
    if ((primaer && !istHexfarbe(primaer)) || (akzent && !istHexfarbe(akzent))) {
      return { fehler: "Farben werden als Sechsstellen-Hexwert erwartet, etwa #1B2A47." };
    }
    return {
      aenderung: {
        farbe_primaer: primaer ? hexNormalisieren(primaer) : null,
        farbe_akzent: akzent ? hexNormalisieren(akzent) : null,
      },
    };
  }
  if (schritt === 6) {
    const serifenlos = text(formular, "schrift_serifenlos") ?? "inter";
    const serifen = text(formular, "schrift_serifen") ?? "lora";
    if (!istSchrift(serifenlos, "serifenlos") || !istSchrift(serifen, "serifen")) {
      return { fehler: "Bitte je eine Schrift aus der Liste wählen." };
    }
    return { aenderung: { schrift_serifenlos: serifenlos, schrift_serifen: serifen } };
  }
  // Schritt 4 (Logo) speichert ueber logoErfassen, Schritt 7 wird unten
  // gesondert bereinigt, Schritt 8 (Einladungen) ueber einladungErstellen.
  return { aenderung: null };
}

/**
 * Speichert einen Schritt und geht zum naechsten. Schritt 8 ist der letzte;
 * dort schliesst „Weiter" das Onboarding ab.
 */
export async function onboardingSchrittSpeichern(
  _vorher: OnboardingErgebnis,
  formular: FormData,
): Promise<OnboardingErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const schritt = Number(formular.get("schritt"));
  if (!istSchrittNr(schritt)) return { fehler: "Unbekannter Schritt." };

  const supabase = await serverClient();
  // Die Branding-Zeile entsteht bei der Registrierung; ein Mandant aus dem
  // Vorentwurf koennte sie trotzdem nicht haben.
  await supabase
    .from("mandant_branding")
    .upsert({ mandant_id: sitzung.mandantId }, { onConflict: "mandant_id", ignoreDuplicates: true });

  const ergebnis =
    schritt === 7
      ? { aenderung: { signatur_html: await signaturBereinigen(text(formular, "signatur_html")) } }
      : aenderungFuer(schritt, formular);
  if ("fehler" in ergebnis) return { fehler: ergebnis.fehler };

  if (ergebnis.aenderung) {
    const { error } = await supabase
      .from("mandant_branding")
      .update(ergebnis.aenderung)
      .eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Die Angaben konnten nicht gespeichert werden." };
  }

  const fehler = await fortschritt(schritt, schritt === LETZTER_SCHRITT);
  if (fehler) return { fehler };

  revalidatePath("/einstellungen");
  revalidatePath("/onboarding", "layout");

  if (schritt === LETZTER_SCHRITT) redirect("/dashboard?willkommen=1");
  redirect(`/onboarding/${schritt + 1}`);
}

/** Ueberspringt einen optionalen Schritt (4–8). Pflichtschritte nicht. */
export async function onboardingUeberspringen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const schritt = Number(formular.get("schritt"));
  const eintrag = SCHRITTE.find((s) => s.nr === schritt);
  if (!eintrag || eintrag.pflicht) redirect(`/onboarding/${istSchrittNr(schritt) ? schritt : 1}`);

  const fehler = await fortschritt(schritt, schritt === LETZTER_SCHRITT);
  if (fehler) redirect(`/onboarding/${schritt}?fehler=1`);

  revalidatePath("/onboarding", "layout");
  if (schritt === LETZTER_SCHRITT) redirect("/dashboard?willkommen=1");
  redirect(`/onboarding/${schritt + 1}`);
}
