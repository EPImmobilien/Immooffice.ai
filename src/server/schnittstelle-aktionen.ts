"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verschluesseln } from "@/integrationen/kern/zugangsdaten";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { geheimnisErzeugen, RUECKRUF_EREIGNISSE } from "@/lib/schnittstelle/rueckruf";
import { BEREICHE, schluesselErzeugen, type Rechte, type Recht } from "@/lib/schnittstelle/schluessel";
import { serverClient } from "@/lib/supabase/server";

/**
 * Eigene Schnittstelle (docs/AUTONOMIE.md 5.4) — Verwaltung durch Inhaber
 * und Administratoren. Schluessel und Geheimnisse werden genau einmal im
 * Klartext zurueckgegeben; danach existieren nur Hash (Schluessel) und
 * verschluesselter Wert (Rueckruf-Geheimnis).
 */

export interface SchnittstellenErgebnis {
  fehler?: string;
  erfolg?: string;
  /** Einmalige Anzeige nach dem Anlegen */
  schluessel?: string;
  geheimnis?: string;
}

const PFAD = "/einstellungen/schnittstelle";

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

function rechteAusFormular(formular: FormData): Rechte {
  const lesen = (b: string): Recht => {
    const r = text(formular, `recht_${b}`);
    return r === "lesen" || r === "schreiben" ? r : "keine";
  };
  return { objekte: lesen("objekte"), kontakte: lesen("kontakte"), termine: lesen("termine") };
}

async function verwaltung() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  return sitzung;
}

const bezeichnungSchema = z.string().trim().min(1, "Bitte eine Bezeichnung angeben.").max(120, "Höchstens 120 Zeichen.");
const limitSchema = z.coerce.number().int().min(1).max(6000);

// ---------------------------------------------------------------------------
// Schluessel
// ---------------------------------------------------------------------------

export async function schluesselAnlegen(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  const bezeichnung = bezeichnungSchema.safeParse(text(formular, "bezeichnung"));
  if (!bezeichnung.success) return { fehler: bezeichnung.error.issues[0]?.message ?? "Bezeichnung prüfen." };
  const limit = limitSchema.safeParse(text(formular, "ratenlimit") || "600");
  if (!limit.success) return { fehler: "Das Ratenlimit muss zwischen 1 und 6000 Anfragen je Minute liegen." };
  const rechte = rechteAusFormular(formular);
  if (BEREICHE.every((b) => rechte[b] === "keine")) return { fehler: "Ein Schlüssel ohne Rechte wäre nutzlos — bitte mindestens einen Bereich freigeben." };

  const { schluessel, hash, praefix } = schluesselErzeugen();
  const supabase = await serverClient();
  const { error } = await supabase.from("api_schluessel").insert({
    mandant_id: sitzung.mandantId,
    bezeichnung: bezeichnung.data,
    praefix,
    hash,
    rechte,
    ratenlimit_pro_minute: limit.data,
    erstellt_von: sitzung.benutzerId,
  });
  if (error) return { fehler: "Der Schlüssel konnte nicht gespeichert werden." };
  revalidatePath(PFAD);
  return { erfolg: "Schlüssel angelegt. Er wird nur dieses eine Mal angezeigt.", schluessel };
}

export async function schluesselAendern(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Schlüssel." };
  const bezeichnung = bezeichnungSchema.safeParse(text(formular, "bezeichnung"));
  if (!bezeichnung.success) return { fehler: bezeichnung.error.issues[0]?.message ?? "Bezeichnung prüfen." };
  const limit = limitSchema.safeParse(text(formular, "ratenlimit") || "600");
  if (!limit.success) return { fehler: "Das Ratenlimit muss zwischen 1 und 6000 Anfragen je Minute liegen." };

  const supabase = await serverClient();
  const { error } = await supabase
    .from("api_schluessel")
    .update({ bezeichnung: bezeichnung.data, rechte: rechteAusFormular(formular), ratenlimit_pro_minute: limit.data })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Änderung wurde nicht gespeichert." };
  revalidatePath(PFAD);
  return { erfolg: "Schlüssel aktualisiert." };
}

export async function schluesselWiderrufen(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Schlüssel." };
  const supabase = await serverClient();
  const { error } = await supabase
    .from("api_schluessel")
    .update({ widerrufen_am: new Date().toISOString() })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId)
    .is("widerrufen_am", null);
  if (error) return { fehler: "Der Schlüssel konnte nicht widerrufen werden." };
  revalidatePath(PFAD);
  return { erfolg: "Schlüssel widerrufen. Anfragen damit werden ab sofort abgewiesen." };
}

// ---------------------------------------------------------------------------
// Rueckrufziele
// ---------------------------------------------------------------------------

const urlSchema = z.url().refine((u) => u.startsWith("https://"), "Rückrufe gehen nur an https-Adressen.");

function ereignisseAusFormular(formular: FormData): string[] {
  return RUECKRUF_EREIGNISSE.filter((e) => formular.getAll("ereignisse").includes(e));
}

export async function zielAnlegen(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  if (!process.env["VERSCHLUESSELUNG_SCHLUESSEL"]) {
    return { fehler: "Der Verschlüsselungsschlüssel fehlt — Rückruf-Geheimnisse können nicht gespeichert werden (docs/ANLEITUNG.md, Abschnitt 6)." };
  }
  const bezeichnung = bezeichnungSchema.safeParse(text(formular, "bezeichnung"));
  if (!bezeichnung.success) return { fehler: bezeichnung.error.issues[0]?.message ?? "Bezeichnung prüfen." };
  const url = urlSchema.safeParse(text(formular, "url"));
  if (!url.success) return { fehler: url.error.issues[0]?.message ?? "Bitte eine gültige https-Adresse angeben." };
  const ereignisse = ereignisseAusFormular(formular);
  if (ereignisse.length === 0) return { fehler: "Bitte mindestens ein Ereignis auswählen." };

  const geheimnis = geheimnisErzeugen();
  const supabase = await serverClient();
  const { error } = await supabase.from("rueckruf_ziele").insert({
    mandant_id: sitzung.mandantId,
    bezeichnung: bezeichnung.data,
    url: url.data,
    geheimnis_verschluesselt: verschluesseln(geheimnis, sitzung.mandantId),
    ereignisse,
    erstellt_von: sitzung.benutzerId,
  });
  if (error) return { fehler: "Das Rückrufziel konnte nicht gespeichert werden." };
  revalidatePath(PFAD);
  return { erfolg: "Rückrufziel angelegt. Das Geheimnis wird nur dieses eine Mal angezeigt.", geheimnis };
}

export async function zielAendern(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekanntes Rückrufziel." };
  const bezeichnung = bezeichnungSchema.safeParse(text(formular, "bezeichnung"));
  if (!bezeichnung.success) return { fehler: bezeichnung.error.issues[0]?.message ?? "Bezeichnung prüfen." };
  const url = urlSchema.safeParse(text(formular, "url"));
  if (!url.success) return { fehler: url.error.issues[0]?.message ?? "Bitte eine gültige https-Adresse angeben." };
  const ereignisse = ereignisseAusFormular(formular);
  if (ereignisse.length === 0) return { fehler: "Bitte mindestens ein Ereignis auswählen." };

  const supabase = await serverClient();
  const { error } = await supabase
    .from("rueckruf_ziele")
    .update({ bezeichnung: bezeichnung.data, url: url.data, ereignisse, aktiv: text(formular, "aktiv") === "1" })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Änderung wurde nicht gespeichert." };
  revalidatePath(PFAD);
  return { erfolg: "Rückrufziel aktualisiert." };
}

export async function zielGeheimnisErneuern(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekanntes Rückrufziel." };
  const geheimnis = geheimnisErzeugen();
  const supabase = await serverClient();
  const { error } = await supabase
    .from("rueckruf_ziele")
    .update({ geheimnis_verschluesselt: verschluesseln(geheimnis, sitzung.mandantId) })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Das Geheimnis konnte nicht erneuert werden." };
  revalidatePath(PFAD);
  return { erfolg: "Neues Geheimnis gesetzt. Bitte beim Empfänger hinterlegen — das alte gilt nicht mehr.", geheimnis };
}

export async function zielLoeschen(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekanntes Rückrufziel." };
  const supabase = await serverClient();
  const { error } = await supabase.from("rueckruf_ziele").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Das Rückrufziel konnte nicht gelöscht werden." };
  revalidatePath(PFAD);
  return { erfolg: "Rückrufziel gelöscht, offene Rückrufe dazu verworfen." };
}

export async function rueckrufErneut(_vorher: SchnittstellenErgebnis, formular: FormData): Promise<SchnittstellenErgebnis> {
  const sitzung = await verwaltung();
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Rückruf." };
  const supabase = await serverClient();
  const { error } = await supabase
    .from("rueckrufe")
    .update({ status: "offen", naechster_versuch_am: new Date().toISOString(), versuche: 0 })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId)
    .eq("status", "fehler");
  if (error) return { fehler: "Der Rückruf konnte nicht neu eingeplant werden." };
  revalidatePath(PFAD);
  return { erfolg: "Rückruf neu eingeplant — die Zustellung folgt mit dem nächsten Lauf." };
}
