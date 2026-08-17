"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROLLEN, rechtErzwingen, uebersteuerungAusAuswahl } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { basisUrlErmitteln, tokenErzeugen } from "@/lib/web-expose";

export interface EinstellungenErgebnis {
  fehler?: string;
  hinweis?: string;
  /**
   * Der Einladungslink — nur unmittelbar nach dem Anlegen. Gespeichert wird
   * ausschliesslich der Hash; ein zweites Mal ist er nicht zu bekommen.
   */
  einladungslink?: string;
}

/** Leerer Text wird zu `null`, damit keine leeren Zeichenketten in der Datenbank landen. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((w) => (w === "" ? null : w))
    .nullable();

const farbe = z
  .string()
  .trim()
  .transform((w) => (w === "" ? null : w))
  .nullable()
  .refine((w) => w === null || /^#[0-9A-Fa-f]{6}$/.test(w), {
    message: "Farben bitte als Hexwert angeben, etwa #1B2A47.",
  });

const unternehmenSchema = z.object({
  name: z.string().trim().min(2, "Bitte den Namen des Unternehmens angeben.").max(200),
  firmenname: text(200),
  strasse: text(200),
  hausnummer: text(20),
  plz: text(10),
  ort: text(100),
  telefon: text(60),
  email: text(200),
  web: text(200),
  farbe_primaer: farbe,
  farbe_akzent: farbe,
  mail_absender_name: text(200),
  mail_absender_adresse: text(200),
});

const rechtstexteSchema = z.object({
  impressum: text(20000),
  datenschutztext: text(20000),
  widerrufsbelehrung: text(20000),
  rechtstexte_sonstige: text(20000),
});

const profilSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(200),
  telefon: text(60),
  funktion: text(200),
});

const benutzerSchema = z.object({
  benutzer_id: z.uuid(),
  rolle: z.enum(ROLLEN),
  aktiv: z.boolean(),
  telefon: text(60),
  funktion: text(200),
});

const einladungSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben.")),
  rolle: z.enum(ROLLEN),
});

/**
 * Uebersetzt die Meldungen der Datenbank.
 *
 * Die Regeln stehen in Triggern und Funktionen — dort gehoeren sie hin, weil
 * sie sonst ueber die REST-Schnittstelle zu umgehen waeren. Der Preis ist,
 * dass die Texte technisch klingen; hier werden sie lesbar gemacht.
 */
function meldung(roh: string, ersatz: string): string {
  const bekannt = [
    "mindestens einen aktiven Inhaber",
    "Inhaberrolle",
    "eigene Zugang",
    "bereits zum Unternehmen",
    "andere E-Mail-Adresse",
    "nicht mehr gueltig",
    "besteht nicht mehr",
    "duerfen einladen",
    "duerfen Rollen aendern",
    "duerfen Rechte aendern",
    "duerfen Zugaenge abschalten",
  ];

  if (bekannt.some((t) => roh.includes(t))) {
    // Die Meldungen der Datenbank sind ohne Umlaute geschrieben.
    return roh
      .replace(/duerfen/g, "dürfen")
      .replace(/gueltig/g, "gültig")
      .replace(/aendern/g, "ändern")
      .replace(/Zugaenge/g, "Zugänge")
      .replace(/gehoert/g, "gehört")
      .replace(/fuer/g, "für");
  }

  return ersatz;
}

// --- Unternehmen ------------------------------------------------------------

export async function unternehmenSpeichern(
  _vorher: EinstellungenErgebnis,
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "einstellungen", "aendern");

  const geprueft = unternehmenSchema.safeParse({
    name: formular.get("name"),
    firmenname: String(formular.get("firmenname") ?? ""),
    strasse: String(formular.get("strasse") ?? ""),
    hausnummer: String(formular.get("hausnummer") ?? ""),
    plz: String(formular.get("plz") ?? ""),
    ort: String(formular.get("ort") ?? ""),
    telefon: String(formular.get("telefon") ?? ""),
    email: String(formular.get("email") ?? ""),
    web: String(formular.get("web") ?? ""),
    farbe_primaer: String(formular.get("farbe_primaer") ?? ""),
    farbe_akzent: String(formular.get("farbe_akzent") ?? ""),
    mail_absender_name: String(formular.get("mail_absender_name") ?? ""),
    mail_absender_adresse: String(formular.get("mail_absender_adresse") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const { name, ...branding } = geprueft.data;
  const supabase = await serverClient();

  const { error: mandantFehler } = await supabase
    .from("mandanten")
    .update({ name })
    .eq("id", sitzung.mandantId);

  if (mandantFehler) {
    return { fehler: "Die Angaben konnten nicht gespeichert werden." };
  }

  // upsert statt update: Bei Mandanten aus dem Vorentwurf kann die Zeile
  // fehlen. Ein stilles "0 Zeilen geaendert" waere hier besonders aergerlich —
  // das Formular meldete Erfolg, gespeichert waere nichts.
  const { error } = await supabase
    .from("mandant_branding")
    .upsert({ mandant_id: sitzung.mandantId, ...branding }, { onConflict: "mandant_id" });

  if (error) return { fehler: "Die Angaben konnten nicht gespeichert werden." };

  revalidatePath("/einstellungen");
  return { hinweis: "Die Angaben wurden gespeichert." };
}

export async function rechtstexteSpeichern(
  _vorher: EinstellungenErgebnis,
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "einstellungen", "aendern");

  const geprueft = rechtstexteSchema.safeParse({
    impressum: String(formular.get("impressum") ?? ""),
    datenschutztext: String(formular.get("datenschutztext") ?? ""),
    widerrufsbelehrung: String(formular.get("widerrufsbelehrung") ?? ""),
    rechtstexte_sonstige: String(formular.get("rechtstexte_sonstige") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from("mandant_branding")
    .upsert(
      { mandant_id: sitzung.mandantId, ...geprueft.data },
      { onConflict: "mandant_id" },
    );

  if (error) return { fehler: "Die Texte konnten nicht gespeichert werden." };

  revalidatePath("/einstellungen/rechtstexte");
  return {
    hinweis:
      "Die Texte wurden gespeichert. Sie ersetzen keine anwaltliche Prüfung.",
  };
}

// --- Eigenes Profil ---------------------------------------------------------

/** Das eigene Profil darf jeder pflegen — unabhängig vom Modul Einstellungen. */
export async function profilSpeichern(
  _vorher: EinstellungenErgebnis,
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();

  const geprueft = profilSchema.safeParse({
    name: formular.get("name"),
    telefon: String(formular.get("telefon") ?? ""),
    funktion: String(formular.get("funktion") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from("benutzer")
    .update(geprueft.data)
    .eq("id", sitzung.benutzerId);

  if (error) {
    return { fehler: meldung(error.message, "Das Profil konnte nicht gespeichert werden.") };
  }

  revalidatePath("/profil");
  return { hinweis: "Das Profil wurde gespeichert." };
}

// --- Benutzer ---------------------------------------------------------------

export async function benutzerSpeichern(
  _vorher: EinstellungenErgebnis,
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "einstellungen", "aendern");

  const geprueft = benutzerSchema.safeParse({
    benutzer_id: formular.get("benutzer_id"),
    rolle: formular.get("rolle"),
    aktiv: formular.get("aktiv") === "an",
    telefon: String(formular.get("telefon") ?? ""),
    funktion: String(formular.get("funktion") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const { benutzer_id, rolle, ...rest } = geprueft.data;

  const supabase = await serverClient();
  const { error } = await supabase
    .from("benutzer")
    .update({
      rolle,
      ...rest,
      // Die Haekchen kommen aus dem Formular; gespeichert wird nur, was von
      // der neuen Rolle abweicht.
      rechte_uebersteuerung: uebersteuerungAusAuswahl(
        rolle,
        formular.getAll("recht").map(String),
      ),
    })
    .eq("id", benutzer_id)
    .eq("mandant_id", sitzung.mandantId);

  if (error) {
    return { fehler: meldung(error.message, "Der Benutzer konnte nicht gespeichert werden.") };
  }

  revalidatePath("/einstellungen/benutzer");
  revalidatePath(`/einstellungen/benutzer/${benutzer_id}`);
  return { hinweis: "Die Änderungen wurden gespeichert." };
}

export async function benutzerEntfernen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "einstellungen", "loeschen");

  const id = String(formular.get("benutzer_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  await supabase.from("benutzer").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);

  revalidatePath("/einstellungen/benutzer");
  redirect("/einstellungen/benutzer");
}

// --- Einladungen ------------------------------------------------------------

/**
 * Setzt den Einladungslink zusammen.
 *
 * Die Basisadresse stammt aus derselben Quelle wie beim Web-Exposé, damit ein
 * Link aus einer Vorschau-Umgebung nicht auf die Produktion zeigt.
 */
async function einladungsAdresse(token: string): Promise<string> {
  const basis = basisUrlErmitteln(await headers());
  return `${basis.replace(/\/+$/, "")}/einladung/${token}`;
}

export async function einladungErstellen(
  _vorher: EinstellungenErgebnis,
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "einstellungen", "anlegen");

  const geprueft = einladungSchema.safeParse({
    email: formular.get("email"),
    rolle: formular.get("rolle"),
  });

  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  // 32 Zeichen aus 36 Moeglichkeiten — der Link ist der gesamte Zugangsschutz,
  // bis die Adresse beim Einloesen geprueft wird.
  const token = tokenErzeugen(32);

  const supabase = await serverClient();
  const { error } = await supabase.rpc("einladung_erstellen", {
    p_email: geprueft.data.email,
    p_rolle: geprueft.data.rolle,
    p_rechte: uebersteuerungAusAuswahl(
      geprueft.data.rolle,
      formular.getAll("recht").map(String),
    ),
    p_token: token,
  });

  if (error) {
    if (error.message.includes("einladungen_offen_idx")) {
      return {
        fehler:
          "Für diese Adresse besteht bereits eine offene Einladung. " +
          "Erzeugen Sie dort einen neuen Link oder widerrufen Sie sie.",
      };
    }
    return { fehler: meldung(error.message, "Die Einladung konnte nicht angelegt werden.") };
  }

  revalidatePath("/einstellungen/einladungen");
  return {
    hinweis: `Einladung für ${geprueft.data.email} angelegt.`,
    einladungslink: await einladungsAdresse(token),
  };
}

export async function einladungErneuern(
  _vorher: EinstellungenErgebnis,
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "einstellungen", "aendern");

  const id = String(formular.get("einladung_id") ?? "").trim();
  if (!id) return { fehler: "Einladung nicht gefunden." };

  const token = tokenErzeugen(32);

  const supabase = await serverClient();
  const { error } = await supabase.rpc("einladung_erneuern", {
    p_id: id,
    p_token: token,
  });

  if (error) {
    return { fehler: meldung(error.message, "Der Link konnte nicht erneuert werden.") };
  }

  revalidatePath("/einstellungen/einladungen");
  return {
    hinweis: "Neuer Link erzeugt. Der vorherige gilt nicht mehr.",
    einladungslink: await einladungsAdresse(token),
  };
}

export async function einladungWiderrufen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "einstellungen", "aendern");

  const id = String(formular.get("einladung_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  await supabase
    .from("einladungen")
    .update({ widerrufen_am: new Date().toISOString() })
    .eq("id", id)
    .is("eingeloest_am", null);

  revalidatePath("/einstellungen/einladungen");
}

// --- Einladung annehmen -----------------------------------------------------

export async function einladungAnnehmen(
  _vorher: EinstellungenErgebnis,
  formular: FormData,
): Promise<EinstellungenErgebnis> {
  const token = String(formular.get("token") ?? "").trim();
  const name = String(formular.get("name") ?? "").trim();

  if (!token) return { fehler: "Dieser Link ist ungültig." };

  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/anmelden?weiter=${encodeURIComponent(`/einladung/${token}`)}`);

  const { error } = await supabase.rpc("einladung_einloesen", {
    p_token: token,
    p_name: name,
  });

  if (error) {
    return { fehler: meldung(error.message, "Die Einladung konnte nicht angenommen werden.") };
  }

  redirect("/dashboard");
}
