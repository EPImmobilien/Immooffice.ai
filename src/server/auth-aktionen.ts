"use server";

import { createHash } from "node:crypto";

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

const REGISTRIERUNGS_HINWEIS =
  "Ist diese Adresse noch nicht vergeben, haben wir Ihnen eine E-Mail zur " +
  "Bestätigung geschickt — bitte sehen Sie auch im Spam-Ordner nach. " +
  "Gehört die Adresse bereits zu einem Konto, melden Sie sich einfach an.";

/** Absender als gepfefferter Hash — nie die Adresse selbst (Masterprompt 16). */
function absenderHash(kopf: Headers): string {
  const roh = kopf.get("x-nf-client-connection-ip") ?? kopf.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!roh) return "";
  const pfeffer = process.env["VERSCHLUESSELUNG_SCHLUESSEL"] ?? process.env["JOB_GEHEIMNIS"] ?? "";
  return createHash("sha256").update(`${pfeffer}:${roh}`).digest("hex");
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

  // Kommt die Registrierung ueber einen Einladungslink, muss der Token die
  // E-Mail-Bestaetigung ueberleben: Er wandert in das Ziel des
  // Bestaetigungslinks. Nur das Format wird geprueft; ob die Einladung gilt,
  // entscheidet spaeter die Datenbank.
  const einladung = String(formular.get("einladung") ?? "").trim();
  const mitEinladung = /^[0-9a-f]{64}$/.test(einladung);
  const kopf = await headers();
  const basis = basisUrlErmitteln(kopf);

  // Honigtopf: Das Feld ist fuer Menschen unsichtbar. Wer es fuellt, ist ein
  // Skript — und bekommt dieselbe Antwort wie alle, nur ohne Wirkung.
  if (String(formular.get("website") ?? "").trim() !== "") {
    return { hinweis: REGISTRIERUNGS_HINWEIS };
  }

  const supabase = await serverClient();

  // Missbrauchsschutz (Masterprompt 16): Sperrliste fuer Wegwerfadressen und
  // Ratenbegrenzung je Adresse und Absender. Der Absender wird nur als
  // gepfefferter Hash gespeichert und nach 24 Stunden geloescht.
  const { data: pruefung } = await supabase.rpc("registrierung_pruefen", {
    p_email: geprueft.data.email,
    p_ip_hash: absenderHash(kopf),
  });
  if (pruefung === "wegwerfadresse") {
    return { fehler: "Bitte eine dauerhafte E-Mail-Adresse verwenden — Wegwerfadressen werden nicht angenommen." };
  }
  if (pruefung === "zu_viele") {
    return { fehler: "Zu viele Registrierungsversuche. Bitte in einer Stunde erneut versuchen." };
  }
  if (pruefung === "ungueltig") {
    return { fehler: "Bitte eine gültige E-Mail-Adresse angeben." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: geprueft.data.email,
    password: geprueft.data.passwort,
    ...(mitEinladung
      ? { options: { emailRedirectTo: `${basis}/auth/bestaetigen?next=/einladung/${einladung}` } }
      : {}),
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
    return { hinweis: REGISTRIERUNGS_HINWEIS };
  }

  redirect(mitEinladung ? `/einladung/${einladung}` : "/registrieren/unternehmen");
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

/**
 * Anmeldung oder Registrierung ueber Google bzw. Microsoft (Supabase Auth,
 * docs/AUTONOMIE.md Abschnitt 7, Phase 4). Die Anbieter werden im
 * Supabase-Dashboard eingerichtet (docs/ANLEITUNG.md, Abschnitt 9); die
 * Schaltflaechen erscheinen nur mit gesetztem NEXT_PUBLIC_ANMELDUNG_*.
 *
 * Wer so zum ersten Mal kommt, hat noch kein Unternehmen: `sitzungErzwingen`
 * fuehrt dann zur Registrierung des Unternehmens — derselbe Weg wie nach der
 * E-Mail-Bestaetigung.
 */
export async function sozialAnmelden(formular: FormData): Promise<void> {
  const wahl = String(formular.get("anbieter") ?? "");
  const anbieter = wahl === "google" ? "google" : wahl === "microsoft" ? "azure" : null;
  const weiter = sicheresZiel(String(formular.get("weiter") ?? ""));
  const aktiv =
    anbieter === "google"
      ? process.env["NEXT_PUBLIC_ANMELDUNG_GOOGLE"] === "1"
      : anbieter === "azure"
        ? process.env["NEXT_PUBLIC_ANMELDUNG_MICROSOFT"] === "1"
        : false;
  if (!anbieter || !aktiv) redirect("/anmelden?fehler=anbieter");

  const supabase = await serverClient();
  const basis = basisUrlErmitteln(await headers());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: anbieter,
    options: {
      redirectTo: `${basis}/auth/bestaetigen?next=${encodeURIComponent(weiter)}`,
      ...(anbieter === "azure" ? { scopes: "email openid profile" } : {}),
    },
  });
  if (error || !data.url) redirect("/anmelden?fehler=anbieter");
  redirect(data.url);
}

export async function abmelden(): Promise<void> {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect("/anmelden");
}
