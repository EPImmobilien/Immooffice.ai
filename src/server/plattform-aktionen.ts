"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { dienstClient } from "@/lib/supabase/dienst";

/**
 * Plattform-Administration (Masterprompt Abschnitt 15, docs/AUTONOMIE.md A1–A3):
 * nur fuer Benutzer in `plattform_admins`. Der Bereich zeigt Metadaten
 * (Mandant, Tarif, Benutzer, Credits, Jobs, Rueckrufe, Audit) und pflegt
 * Preise, Credit-Werte, Limits und Feature-Schalter. Inhalte von Mandanten
 * (Objekte, Kontakte, Dokumente) werden hier nie gelesen.
 *
 * Die Tabelle plattform_admins ist nur per Dienstrolle lesbar; deshalb laeuft
 * jede Pruefung und jeder Zugriff hier ueber den Dienst-Client — nach der
 * Pruefung der Mitgliedschaft.
 */

export interface PlattformErgebnis { fehler?: string; erfolg?: string }

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

/** Ist der angemeldete Benutzer Plattform-Administrator? */
export async function istPlattformAdmin(): Promise<boolean> {
  const sitzung = await sitzungErzwingen();
  const dienst = dienstClient();
  const { data } = await dienst.from("plattform_admins").select("benutzer_id").eq("benutzer_id", sitzung.benutzerId).maybeSingle();
  return Boolean(data);
}

async function adminErzwingen(): Promise<{ benutzerId: string; name: string }> {
  const sitzung = await sitzungErzwingen();
  const dienst = dienstClient();
  const { data } = await dienst.from("plattform_admins").select("benutzer_id").eq("benutzer_id", sitzung.benutzerId).maybeSingle();
  if (!data) throw new Error("Kein Plattform-Administrator.");
  return { benutzerId: sitzung.benutzerId, name: sitzung.name };
}

async function protokoll(mandantId: string | null, benutzerId: string, aktion: string, details: Record<string, unknown>): Promise<void> {
  const dienst = dienstClient();
  // Plattformaktionen landen im Audit-Log des betroffenen Mandanten (oder ohne Mandant: beim ersten Mandanten der Plattform ist nichts zu protokollieren)
  if (!mandantId) return;
  await dienst.from("audit_log").insert({ mandant_id: mandantId, benutzer_id: benutzerId, aktion, ziel_art: "mandant", ziel_id: mandantId, details: { ...details, plattform: true } }).then(() => null, () => null);
}

/** Mandant sperren oder reaktivieren (Metadaten-Aktion, protokolliert). */
export async function mandantSperren(_vorher: PlattformErgebnis, formular: FormData): Promise<PlattformErgebnis> {
  const admin = await adminErzwingen();
  const id = text(formular, "mandant_id");
  if (!z.uuid().safeParse(id).success) return { fehler: "Mandant fehlt." };
  const sperren = formular.get("sperren") === "1";
  const grund = text(formular, "grund").slice(0, 500) || null;
  const dienst = dienstClient();
  const { error } = await dienst.from("mandanten").update(sperren ? { gesperrt_am: new Date().toISOString(), gesperrt_grund: grund } : { gesperrt_am: null, gesperrt_grund: null }).eq("id", id);
  if (error) return { fehler: error.message };
  await protokoll(id, admin.benutzerId, sperren ? "mandant_gesperrt" : "mandant_reaktiviert", { grund });
  revalidatePath("/plattform");
  return { erfolg: sperren ? "Mandant gesperrt." : "Mandant reaktiviert." };
}

/** Preis (Tarif, Zusatznutzer, Credit-Paket) aendern. */
export async function preisSpeichern(_vorher: PlattformErgebnis, formular: FormData): Promise<PlattformErgebnis> {
  await adminErzwingen();
  const dienst = dienstClient();
  const tabelle = text(formular, "tabelle");
  const schluessel = text(formular, "schluessel");
  const netto = Number(text(formular, "netto").replace(",", "."));
  if (!schluessel || !Number.isFinite(netto) || netto < 0) return { fehler: "Bitte einen gültigen Nettopreis angeben." };
  if (tabelle === "tarife") {
    const jahr = Number(text(formular, "netto_jahr").replace(",", "."));
    const credits = Math.trunc(Number(text(formular, "credits_monat")));
    const benutzer = Math.trunc(Number(text(formular, "enthaltene_benutzer")));
    const { error } = await dienst.from("tarife").update({
      preis_monat_netto: netto,
      ...(Number.isFinite(jahr) && jahr >= 0 ? { preis_jahr_netto: jahr } : {}),
      ...(Number.isInteger(credits) && credits >= 0 ? { credits_monat: credits } : {}),
      ...(Number.isInteger(benutzer) && benutzer > 0 ? { enthaltene_benutzer: benutzer } : {}),
      aktiv: formular.get("aktiv") !== "0",
    }).eq("schluessel", schluessel);
    if (error) return { fehler: error.message };
  } else if (tabelle === "preise") {
    const credits = Math.trunc(Number(text(formular, "credits")));
    const { error } = await dienst.from("preise").update({ netto, ...(Number.isInteger(credits) && credits > 0 ? { credits } : {}), aktiv: formular.get("aktiv") !== "0" }).eq("schluessel", schluessel);
    if (error) return { fehler: error.message };
  } else if (tabelle === "credit_preise") {
    const credits = Math.trunc(netto);
    const { error } = await dienst.from("credit_preise").update({ credits }).eq("aktion", schluessel);
    if (error) return { fehler: error.message };
  } else return { fehler: "Unbekannte Tabelle." };
  revalidatePath("/plattform");
  return { erfolg: "Gespeichert." };
}

/** Plattform-Einstellung (Limit, Feature-Schalter) setzen. */
export async function einstellungSetzen(_vorher: PlattformErgebnis, formular: FormData): Promise<PlattformErgebnis> {
  await adminErzwingen();
  const schluessel = text(formular, "schluessel").slice(0, 80);
  const roh = text(formular, "wert");
  if (!/^[a-z0-9_.]+$/.test(schluessel)) return { fehler: "Ungültiger Schlüssel." };
  let wert: unknown = roh;
  if (roh === "true" || roh === "false") wert = roh === "true";
  else if (/^-?\d+(\.\d+)?$/.test(roh)) wert = Number(roh);
  else if (roh.startsWith("{") || roh.startsWith("[")) { try { wert = JSON.parse(roh); } catch { return { fehler: "Ungültiges JSON." }; } }
  const dienst = dienstClient();
  const { error } = await dienst.from("plattform_einstellungen").upsert({ schluessel, wert, beschreibung: text(formular, "beschreibung").slice(0, 300) || null, geaendert_am: new Date().toISOString() }, { onConflict: "schluessel" });
  if (error) return { fehler: error.message };
  revalidatePath("/plattform");
  return { erfolg: `„${schluessel}“ gesetzt.` };
}

/** Fehlgeschlagenen Job oder Rueckruf erneut einplanen. */
export async function erneutVersuchen(formular: FormData): Promise<void> {
  await adminErzwingen();
  const art = text(formular, "art");
  const id = text(formular, "id");
  if (!z.uuid().safeParse(id).success) return;
  const dienst = dienstClient();
  if (art === "job") await dienst.from("jobs").update({ status: "offen", naechster_versuch_am: new Date().toISOString(), versuche: 0, fehler_text: null }).eq("id", id);
  if (art === "rueckruf") await dienst.from("rueckrufe").update({ status: "offen", naechster_versuch_am: new Date().toISOString(), versuche: 0 }).eq("id", id);
  revalidatePath("/plattform");
}
