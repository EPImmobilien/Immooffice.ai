"use server";

import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROLLEN, rechtErzwingen, type Rolle } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { basisUrlErmitteln } from "@/lib/web-expose";

/**
 * Einladungen (docs/AUTONOMIE.md R3, E-2026-09-03-06/07).
 *
 * Der Token entsteht hier (256 Bit Zufall), geht als Klartext an die
 * Datenbankfunktion `einladung_erstellen`, die nur seinen Hash speichert, und
 * kommt EINMAL als Link zurueck. Ein automatischer Versand folgt, sobald der
 * Transaktionsmail-Dienst eingerichtet ist (docs/ZUGAENGE_FEHLEND.md).
 */

export interface EinladungsErgebnis {
  fehler?: string;
  hinweis?: string;
  /** Nur direkt nach dem Anlegen gefuellt; danach nie wieder abrufbar. */
  link?: string;
}

const TOKEN = /^[0-9a-f]{64}$/;

const einladungSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben.")),
  rolle: z.enum(ROLLEN),
});

/** Uebersetzt die Meldungen der Datenbankfunktion in Nutzersprache. */
function meldung(text: string): string {
  if (text.includes("bereits zum Unternehmen")) {
    return "Diese Adresse gehört bereits zu einem Zugang Ihres Unternehmens.";
  }
  if (text.includes("Inhaberrolle")) {
    return "Nur der Inhaber kann jemanden als Inhaber einladen.";
  }
  if (text.includes("Nur Inhaber und Administratoren")) {
    return "Nur Inhaber und Administratoren dürfen einladen.";
  }
  if (text.includes("einladungen_offen_idx")) {
    return "Für diese Adresse besteht bereits eine offene Einladung. Nehmen Sie sie zurück, um eine neue zu erzeugen.";
  }
  return "Die Einladung konnte nicht angelegt werden.";
}

export async function einladungErstellen(formular: FormData): Promise<EinladungsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const geprueft = einladungSchema.safeParse({
    email: formular.get("email"),
    rolle: formular.get("rolle") ?? "makler",
  });
  if (!geprueft.success) {
    return { fehler: geprueft.error.issues[0]?.message ?? "Eingabe unvollständig." };
  }

  const token = randomBytes(32).toString("hex");

  const supabase = await serverClient();
  const { error } = await supabase.rpc("einladung_erstellen", {
    p_email: geprueft.data.email,
    p_rolle: geprueft.data.rolle as Rolle,
    p_rechte: {},
    p_token: token,
  });

  if (error) return { fehler: meldung(error.message) };

  const basis = basisUrlErmitteln(await headers());
  revalidatePath("/einstellungen");
  revalidatePath("/onboarding", "layout");
  return {
    hinweis:
      `Die Einladung für ${geprueft.data.email} ist angelegt und sieben Tage gültig. ` +
      "Kopieren Sie den Link und schicken Sie ihn der Person — er wird nur jetzt angezeigt.",
    link: `${basis}/einladung/${token}`,
  };
}

/**
 * Nimmt eine offene Einladung zurueck. Der Datensatz bleibt (Nachweis, wer
 * wann eingeladen hat); der Link ist ab sofort wertlos.
 */
export async function einladungZuruecknehmen(formular: FormData): Promise<EinladungsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("einladung_id") ?? "").trim();
  if (!id) return {};

  const supabase = await serverClient();
  const { error } = await supabase
    .from("einladungen")
    .update({ widerrufen_am: new Date().toISOString() })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .is("eingeloest_am", null);

  if (error) return { fehler: "Die Einladung konnte nicht zurückgenommen werden." };

  revalidatePath("/einstellungen");
  revalidatePath("/onboarding", "layout");
  return { hinweis: "Die Einladung ist zurückgenommen. Der Link funktioniert nicht mehr." };
}

/**
 * Loest eine Einladung fuer das angemeldete Konto ein.
 *
 * Bewusst KEIN `sitzungErzwingen`: Das Konto hat noch keinen Mandanten, und
 * `sitzungErzwingen` wuerde es zur Unternehmensanlage schicken — genau das
 * soll hier nicht passieren.
 */
export async function einladungEinloesen(
  _vorher: EinladungsErgebnis,
  formular: FormData,
): Promise<EinladungsErgebnis> {
  const token = String(formular.get("token") ?? "").trim();
  const name = String(formular.get("name") ?? "").trim();

  if (!TOKEN.test(token)) return { fehler: "Der Einladungslink ist unvollständig." };
  if (name.length < 2 || name.length > 200) return { fehler: "Bitte Ihren Namen angeben." };

  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { fehler: "Bitte melden Sie sich zuerst an." };

  const { error } = await supabase.rpc("einladung_einloesen", { p_token: token, p_name: name });

  if (error) {
    const t = error.message;
    if (t.includes("bereits zu einem Unternehmen")) redirect("/dashboard");
    if (t.includes("andere E-Mail-Adresse")) {
      return {
        fehler:
          "Die Einladung gilt für eine andere E-Mail-Adresse. Bitte melden Sie sich mit der Adresse an, an die die Einladung ging.",
      };
    }
    return { fehler: "Die Einladung ist ungültig oder abgelaufen. Bitten Sie um eine neue." };
  }

  redirect("/dashboard");
}
