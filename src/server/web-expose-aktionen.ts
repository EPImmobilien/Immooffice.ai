"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { tokenErzeugen } from "@/lib/web-expose";

export interface WebExposeErgebnis {
  fehler?: string;
  hinweis?: string;
}

const einstellungen = z.object({
  objekt_id: z.uuid(),
  passwort: z.string().trim().max(200),
  passwort_entfernen: z.boolean(),
  ablauf_am: z.string().trim(),
  download_erlaubt: z.boolean(),
  kontaktformular: z.boolean(),
});

function ausFormular(formular: FormData) {
  return {
    objekt_id: String(formular.get("objekt_id") ?? ""),
    passwort: String(formular.get("passwort") ?? ""),
    passwort_entfernen: formular.get("passwort_entfernen") === "ja",
    ablauf_am: String(formular.get("ablauf_am") ?? ""),
    download_erlaubt: formular.get("download_erlaubt") === "ja",
    kontaktformular: formular.get("kontaktformular") === "ja",
  };
}

/**
 * Veroeffentlicht ein Objekt als Web-Expose oder aendert die Einstellungen.
 *
 * Kostet keine Credits (Abschnitt 14): Veroeffentlicht wird vorhandener
 * Inhalt, es entsteht nichts Neues durch ein Modell.
 */
export async function webExposeSpeichern(
  _vorher: WebExposeErgebnis,
  formular: FormData,
): Promise<WebExposeErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "exposes", "freigeben");

  const geprueft = einstellungen.safeParse(ausFormular(formular));
  if (!geprueft.success) {
    return { fehler: "Die Angaben sind unvollständig." };
  }
  const daten = geprueft.data;

  if (daten.passwort !== "" && daten.passwort.length < 6) {
    return { fehler: "Das Passwort muss mindestens sechs Zeichen haben." };
  }

  const ablauf = daten.ablauf_am === "" ? null : new Date(daten.ablauf_am);
  if (ablauf && Number.isNaN(ablauf.getTime())) {
    return { fehler: "Das Ablaufdatum ist ungültig." };
  }
  if (ablauf && ablauf.getTime() <= Date.now()) {
    return { fehler: "Das Ablaufdatum muss in der Zukunft liegen." };
  }

  const supabase = await serverClient();

  const { data: vorhanden } = await supabase
    .from("web_expose")
    .select("id")
    .eq("objekt_id", daten.objekt_id)
    .maybeSingle();

  // Das Passwort wird in der Datenbank gehasht. Es darf nirgends im Klartext
  // liegen — auch nicht kurz in einer Spalte.
  const { data: hash } = daten.passwort
    ? await supabase.rpc("passwort_hashen", { p_passwort: daten.passwort })
    : { data: null };

  const gemeinsam = {
    ablauf_am: ablauf ? ablauf.toISOString() : null,
    download_erlaubt: daten.download_erlaubt,
    kontaktformular: daten.kontaktformular,
    // Ein erneutes Speichern hebt einen Widerruf auf: Der Makler hat die
    // Veroeffentlichung soeben ausdruecklich bestaetigt.
    widerrufen_am: null,
  };

  if (vorhanden) {
    const { error } = await supabase
      .from("web_expose")
      .update({
        ...gemeinsam,
        ...(daten.passwort_entfernen
          ? { passwort_hash: null }
          : hash
            ? { passwort_hash: hash }
            : {}),
      })
      .eq("id", vorhanden.id)
      .eq("mandant_id", sitzung.mandantId);

    if (error) return { fehler: "Die Änderungen konnten nicht gespeichert werden." };
    revalidatePath(`/objekte/${daten.objekt_id}`);
    revalidatePath(`/exposes/${daten.objekt_id}`);
    return { hinweis: "Die Einstellungen wurden gespeichert." };
  }

  const { error } = await supabase.from("web_expose").insert({
    mandant_id: sitzung.mandantId,
    objekt_id: daten.objekt_id,
    token: tokenErzeugen(),
    passwort_hash: hash,
    erstellt_von: sitzung.benutzerId,
    ...gemeinsam,
  });

  if (error) return { fehler: "Das Web-Exposé konnte nicht angelegt werden." };

  revalidatePath(`/objekte/${daten.objekt_id}`);
  revalidatePath(`/exposes/${daten.objekt_id}`);
  return { hinweis: "Das Web-Exposé ist veröffentlicht." };
}

/** Zieht die Veroeffentlichung zurueck. Der Link ist danach sofort tot. */
export async function webExposeWiderrufen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "exposes", "freigeben");

  const objektId = String(formular.get("objekt_id") ?? "").trim();
  if (!objektId) return;

  const supabase = await serverClient();
  await supabase
    .from("web_expose")
    .update({ widerrufen_am: new Date().toISOString() })
    .eq("objekt_id", objektId)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/objekte/${objektId}`);
  revalidatePath(`/exposes/${objektId}`);
}

/**
 * Erzeugt einen neuen Link und macht den alten damit ungueltig.
 *
 * Der Weg fuer den Fall, dass ein Link in falsche Haende geraten ist: Ein
 * Widerruf allein wuerde die Veroeffentlichung beenden, ein neuer Token
 * erhaelt sie und entwertet nur die alte Adresse.
 */
export async function webExposeLinkErneuern(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "exposes", "freigeben");

  const objektId = String(formular.get("objekt_id") ?? "").trim();
  if (!objektId) return;

  const supabase = await serverClient();
  await supabase
    .from("web_expose")
    .update({ token: tokenErzeugen(), widerrufen_am: null })
    .eq("objekt_id", objektId)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/objekte/${objektId}`);
  revalidatePath(`/exposes/${objektId}`);
}

/** Markiert eine Anfrage aus dem Kontaktformular als gelesen. */
export async function anfrageGelesen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung, "kontakte", "aendern");

  const id = String(formular.get("anfrage_id") ?? "").trim();
  const objektId = String(formular.get("objekt_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  await supabase
    .from("web_expose_anfrage")
    .update({ gelesen_am: new Date().toISOString() })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath(`/exposes/${objektId}`);
}
