"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { serverClient } from "@/lib/supabase/server";

/** Rueckgabe aller Formularaktionen: Fehler werden angezeigt, nicht geworfen. */
export interface AktionsErgebnis {
  fehler?: string;
  hinweis?: string;
}

const anmeldeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben.")),
  passwort: z.string().min(1, "Bitte das Passwort eingeben."),
});

// Abschnitt 16: Mindestlaenge 12 Zeichen.
const registrierSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben.")),
  passwort: z
    .string()
    .min(12, "Das Passwort muss mindestens 12 Zeichen lang sein."),
});

const unternehmenSchema = z.object({
  firmenname: z
    .string()
    .trim()
    .min(2, "Bitte den Firmennamen angeben.")
    .max(200, "Der Firmenname ist zu lang."),
  name: z
    .string()
    .trim()
    .min(2, "Bitte Ihren Namen angeben.")
    .max(200, "Der Name ist zu lang."),
});

/**
 * Nur eigene Pfade zulassen.
 *
 * Ohne diese Pruefung waere jedes `weiter` ein offener Umleitungspunkt: Ein
 * Link auf die eigene Anmeldeseite koennte nach erfolgreicher Anmeldung auf
 * eine fremde Seite fuehren, und der Nutzer haette keinen Anlass zu
 * misstrauen. `//host` faellt ebenfalls heraus — der Browser liest es als
 * absolute Adresse.
 */
function sicheresZiel(weiter: unknown, standard: string): string {
  const pfad = String(weiter ?? "").trim();
  return pfad.startsWith("/") && !pfad.startsWith("//") ? pfad : standard;
}

/** Übersetzt Supabase-Meldungen ins Deutsche, ohne Kontoexistenz zu verraten. */
function meldung(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("invalid login credentials")) {
    return "E-Mail-Adresse oder Passwort ist nicht korrekt.";
  }
  if (t.includes("email not confirmed")) {
    return "Bitte bestätigen Sie zuerst die E-Mail-Adresse.";
  }
  if (t.includes("already registered") || t.includes("already been registered")) {
    return "Für diese E-Mail-Adresse besteht bereits ein Konto.";
  }
  if (t.includes("rate limit") || t.includes("too many")) {
    return "Zu viele Versuche. Bitte kurz warten und erneut versuchen.";
  }
  if (t.includes("weak") || t.includes("pwned") || t.includes("compromised")) {
    return "Dieses Passwort ist unsicher. Bitte ein anderes wählen.";
  }
  return "Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.";
}

export async function anmelden(
  _vorher: AktionsErgebnis,
  formular: FormData,
): Promise<AktionsErgebnis> {
  const geprueft = anmeldeSchema.safeParse({
    email: formular.get("email"),
    passwort: formular.get("passwort"),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: geprueft.data.email,
    password: geprueft.data.passwort,
  });

  if (error) return { fehler: meldung(error.message) };

  redirect(sicheresZiel(formular.get("weiter"), "/dashboard"));
}

export async function registrieren(
  _vorher: AktionsErgebnis,
  formular: FormData,
): Promise<AktionsErgebnis> {
  const geprueft = registrierSchema.safeParse({
    email: formular.get("email"),
    passwort: formular.get("passwort"),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signUp({
    email: geprueft.data.email,
    password: geprueft.data.passwort,
  });

  if (error) return { fehler: meldung(error.message) };

  // Ist die E-Mail-Bestaetigung aktiv, entsteht noch keine Sitzung.
  //
  // Achtung: Bei einer BEREITS REGISTRIERTEN Adresse meldet Supabase ebenfalls
  // Erfolg — es legt nichts an und verschickt nichts. Das ist beabsichtigt:
  // Sonst liesse sich ueber das Registrierungsformular herausfinden, wer hier
  // Kunde ist. Erkennbar ist der Fall nur an der leeren Identitaetenliste.
  //
  // Die Meldung muss deshalb in BEIDEN Faellen zutreffen und in beiden Faellen
  // GLEICH lauten. Ein schlichtes "Wir haben Ihnen eine E-Mail geschickt" waere
  // bei einer vorhandenen Adresse schlicht falsch — der Nutzer wartet dann auf
  // Post, die nie kommt. Genau das ist beim ersten Test passiert. Zwei
  // unterschiedliche Texte wiederum wuerden verraten, was Supabase gerade
  // verbirgt.
  if (!data.session) {
    return {
      hinweis:
        "Ist diese Adresse noch nicht vergeben, haben wir Ihnen eine E-Mail zur " +
        "Bestätigung geschickt — bitte sehen Sie auch im Spam-Ordner nach. " +
        "Gehört die Adresse bereits zu einem Konto, melden Sie sich einfach an.",
    };
  }

  // Wer über eine Einladung kommt, soll dorthin zurück statt ein eigenes
  // Unternehmen anzulegen.
  redirect(sicheresZiel(formular.get("weiter"), "/registrieren/unternehmen"));
}

export async function unternehmenAnlegen(
  _vorher: AktionsErgebnis,
  formular: FormData,
): Promise<AktionsErgebnis> {
  const geprueft = unternehmenSchema.safeParse({
    firmenname: formular.get("firmenname"),
    name: formular.get("name"),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const supabase = await serverClient();

  // Mandant, Inhaber und Branding entstehen gemeinsam in EINER Transaktion.
  // Bei getrennten Aufrufen bliebe bei einem Fehlschlag ein Konto ohne
  // Unternehmen zurueck.
  const { error } = await supabase.rpc("registriere_mandant", {
    p_firmenname: geprueft.data.firmenname,
    p_name: geprueft.data.name,
  });

  if (error) {
    if (error.message.includes("bereits zu einem Unternehmen")) {
      redirect("/dashboard");
    }
    return { fehler: "Das Unternehmen konnte nicht angelegt werden. Bitte erneut versuchen." };
  }

  redirect("/dashboard");
}

export async function abmelden(): Promise<void> {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect("/anmelden");
}
