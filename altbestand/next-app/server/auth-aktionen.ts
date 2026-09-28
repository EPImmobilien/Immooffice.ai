"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { sicheresZiel } from "@/lib/auth/ziel";
import { serverClient } from "@/lib/supabase/server";
import { basisUrlErmitteln } from "@/lib/web-expose";

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

  // Nur eigene Pfade zulassen — sonst waere die Weiterleitung ein offener
  // Umleitungspunkt auf fremde Seiten. Die Pruefung ist geteilt mit dem
  // Ruecklaeufer der Mail-Links und in `sicheresZiel` geprueft.
  redirect(sicheresZiel(String(formular.get("weiter") ?? "")));
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

  redirect("/registrieren/unternehmen");
}

/**
 * Fordert einen Link zum Neusetzen des Passworts an.
 *
 * Die Antwort ist IMMER dieselbe, ob die Adresse zu einem Konto gehoert oder
 * nicht. Ein „diese Adresse kennen wir nicht" waere eine Auskunft darueber, wer
 * hier Kunde ist — dieselbe Ueberlegung wie bei der Registrierung.
 *
 * Auch ein Fehler von Supabase wird deshalb nicht durchgereicht: Ein
 * Mengenlimit sagt dem Angreifer, dass er die richtige Adresse getroffen hat.
 */
export async function passwortVergessen(
  _vorher: AktionsErgebnis,
  formular: FormData,
): Promise<AktionsErgebnis> {
  const geprueft = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .safeParse(formular.get("email"));

  if (!geprueft.success) {
    return { fehler: "Bitte eine gültige E-Mail-Adresse angeben." };
  }

  const basis = basisUrlErmitteln(await headers());
  const supabase = await serverClient();

  await supabase.auth.resetPasswordForEmail(geprueft.data, {
    redirectTo: `${basis}/auth/bestaetigen?next=/passwort-neu`,
  });

  return {
    hinweis:
      "Gehört diese Adresse zu einem Konto, haben wir eine E-Mail mit einem Link " +
      "zum Neusetzen des Passworts geschickt — bitte sehen Sie auch im " +
      "Spam-Ordner nach. Der Link gilt eine Stunde.",
  };
}

/**
 * Setzt das Passwort neu.
 *
 * Setzt voraus, dass der Wiederherstellungslink zuvor eine Sitzung erzeugt hat;
 * das geschieht in `/auth/bestaetigen`. Ohne Sitzung wird hier abgebrochen —
 * sonst liesse sich der Aufruf ohne jeden Nachweis verwenden.
 */
export async function passwortNeuSetzen(
  _vorher: AktionsErgebnis,
  formular: FormData,
): Promise<AktionsErgebnis> {
  const geprueft = registrierSchema.shape.passwort.safeParse(
    formular.get("passwort"),
  );

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Passwort zu kurz." };
  }

  if (formular.get("passwort") !== formular.get("passwort_wiederholung")) {
    return { fehler: "Die beiden Eingaben stimmen nicht überein." };
  }

  const supabase = await serverClient();

  const { data: sitzung } = await supabase.auth.getUser();
  if (!sitzung.user) {
    return {
      fehler:
        "Der Link ist abgelaufen oder wurde bereits verwendet. Bitte fordern Sie einen neuen an.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: geprueft.data,
  });

  if (error) return { fehler: meldung(error.message) };

  redirect("/dashboard");
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
