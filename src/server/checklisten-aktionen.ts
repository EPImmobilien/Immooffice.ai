"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { BEREICHE } from "@/lib/checklisten";
import { DOKUMENTARTEN } from "@/lib/dokumente";
import { serverClient } from "@/lib/supabase/server";

/**
 * Checklisten (docs/FUNKTIONSABGLEICH.md N1): Vorlagen mit Punkten, laufende
 * Checklisten an Objekt, Kontakt, Lead oder Vertrag. Rechte laufen ueber das
 * Modul „kalender" (wie Aufgaben) und in der Datenbank ueber RLS.
 */

export interface ChecklistenErgebnis { fehler?: string; erfolg?: string; id?: string }

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function uuidOderNull(formular: FormData, feld: string): string | null {
  const p = z.uuid().safeParse(text(formular, feld));
  return p.success ? p.data : null;
}
function seiten(bezug: { objekt_id?: string | null; kontakt_id?: string | null; lead_id?: string | null; vertrag_id?: string | null }, id?: string): void {
  revalidatePath("/checklisten");
  if (id) revalidatePath(`/checklisten/${id}`);
  if (bezug.objekt_id) revalidatePath(`/objekte/${bezug.objekt_id}`);
  if (bezug.kontakt_id) revalidatePath(`/kontakte/${bezug.kontakt_id}`);
  if (bezug.lead_id) revalidatePath(`/akquise/leads/${bezug.lead_id}`);
  if (bezug.vertrag_id) revalidatePath(`/vertraege/${bezug.vertrag_id}`);
}

/** Standard-Vorlagen beim ersten Aufruf anlegen. */
export async function checklistenVorbereiten(): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { count } = await supabase.from("checklisten_vorlagen").select("id", { count: "exact", head: true });
  if ((count ?? 0) === 0) await supabase.rpc("checklisten_standard_anlegen");
}

// --- Vorlagen ----------------------------------------------------------------------

export async function vorlageSpeichern(_vorher: ChecklistenErgebnis, formular: FormData): Promise<ChecklistenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const name = text(formular, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const bereich = text(formular, "bereich") in BEREICHE ? text(formular, "bereich") : "allgemein";
  const supabase = await serverClient();
  const zeile = { name: name.slice(0, 160), bereich, beschreibung: text(formular, "beschreibung") || null, aktiv: text(formular, "aktiv") !== "0" };
  const id = uuidOderNull(formular, "id");
  if (id) {
    const { error } = await supabase.from("checklisten_vorlagen").update(zeile).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Nicht gespeichert." };
    revalidatePath("/checklisten");
    return { erfolg: "Vorlage gespeichert.", id };
  }
  const { data, error } = await supabase.from("checklisten_vorlagen").insert({ ...zeile, mandant_id: sitzung.mandantId }).select("id").single();
  if (error || !data) return { fehler: "Nicht gespeichert." };
  revalidatePath("/checklisten");
  return { erfolg: "Vorlage angelegt.", id: data.id as string };
}

export async function vorlageLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung);
  const id = uuidOderNull(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("checklisten_vorlagen").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/checklisten");
}

export async function vorlagePunktSpeichern(_vorher: ChecklistenErgebnis, formular: FormData): Promise<ChecklistenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const vorlage = uuidOderNull(formular, "vorlage_id");
  const titel = text(formular, "titel");
  if (!vorlage || !titel) return { fehler: "Bitte Vorlage und Titel angeben." };
  const art = text(formular, "dokumentart");
  const frist = text(formular, "frist_tage");
  const supabase = await serverClient();
  const zeile = { titel: titel.slice(0, 300), beschreibung: text(formular, "beschreibung") || null, pflicht: text(formular, "pflicht") !== "0", dokumentart: art in DOKUMENTARTEN ? art : null, frist_tage: frist ? Math.max(0, Math.min(365, Math.round(Number(frist)))) : null, sortierung: Math.round(Number(text(formular, "sortierung")) || 0) };
  const id = uuidOderNull(formular, "id");
  if (id) {
    const { error } = await supabase.from("checklisten_vorlagen_punkte").update(zeile).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Nicht gespeichert." };
  } else {
    const { count } = await supabase.from("checklisten_vorlagen_punkte").select("id", { count: "exact", head: true }).eq("vorlage_id", vorlage);
    const { error } = await supabase.from("checklisten_vorlagen_punkte").insert({ ...zeile, sortierung: zeile.sortierung || (count ?? 0) + 1, mandant_id: sitzung.mandantId, vorlage_id: vorlage });
    if (error) return { fehler: "Nicht gespeichert." };
  }
  revalidatePath("/checklisten");
  return { erfolg: "Punkt gespeichert." };
}

export async function vorlagePunktLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = uuidOderNull(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("checklisten_vorlagen_punkte").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/checklisten");
}

// --- Laufende Checklisten ---------------------------------------------------------------

/** Checkliste aus Vorlage an Objekt, Kontakt, Lead oder Vertrag anlegen. */
export async function checklisteAnlegen(_vorher: ChecklistenErgebnis, formular: FormData): Promise<ChecklistenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);
  const vorlage = uuidOderNull(formular, "vorlage_id");
  if (!vorlage) return { fehler: "Bitte eine Vorlage wählen." };
  const bezug = { objekt_id: uuidOderNull(formular, "objekt_id"), kontakt_id: uuidOderNull(formular, "kontakt_id"), lead_id: uuidOderNull(formular, "lead_id"), vertrag_id: uuidOderNull(formular, "vertrag_id") };
  if (!bezug.objekt_id && !bezug.kontakt_id && !bezug.lead_id && !bezug.vertrag_id) return { fehler: "Bitte einen Bezug wählen (Objekt, Kontakt, Lead oder Vertrag)." };
  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("checkliste_aus_vorlage", { p_vorlage: vorlage, p_objekt: bezug.objekt_id, p_kontakt: bezug.kontakt_id, p_lead: bezug.lead_id, p_vertrag: bezug.vertrag_id, p_name: text(formular, "name") || null });
  if (error || typeof data !== "string") return { fehler: error?.message.includes("gehoert nicht") ? "Der Bezug gehört nicht zu diesem Unternehmen." : "Die Checkliste konnte nicht angelegt werden." };
  seiten(bezug, data);
  if (text(formular, "weiter") === "1") redirect(`/checklisten/${data}`);
  return { erfolg: "Checkliste angelegt.", id: data };
}

export async function punktStatus(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = uuidOderNull(formular, "punkt_id");
  const status = text(formular, "status");
  if (!id || !["offen", "erledigt", "nicht_noetig"].includes(status)) return;
  const supabase = await serverClient();
  const { data: p } = await supabase.from("checklisten_punkte").select("checkliste_id, aufgabe_id, checkliste:checklisten(objekt_id, kontakt_id, lead_id, vertrag_id)").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!p) return;
  await supabase.from("checklisten_punkte").update({ status, ...(status === "erledigt" ? { erledigt_von: sitzung.benutzerId } : {}), ...(text(formular, "notiz") ? { notiz: text(formular, "notiz").slice(0, 1000) } : {}) }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (p.aufgabe_id && status !== "offen") await supabase.from("aufgaben").update({ status: "erledigt" }).eq("id", p.aufgabe_id as string).eq("mandant_id", sitzung.mandantId);
  seiten((p.checkliste as unknown as { objekt_id: string | null; kontakt_id: string | null; lead_id: string | null; vertrag_id: string | null }) ?? {}, p.checkliste_id as string);
}

export async function punktAnlegen(_vorher: ChecklistenErgebnis, formular: FormData): Promise<ChecklistenErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const checkliste = uuidOderNull(formular, "checkliste_id");
  const titel = text(formular, "titel");
  if (!checkliste || !titel) return { fehler: "Bitte einen Titel angeben." };
  const art = text(formular, "dokumentart");
  const supabase = await serverClient();
  const { count } = await supabase.from("checklisten_punkte").select("id", { count: "exact", head: true }).eq("checkliste_id", checkliste);
  const { error } = await supabase.from("checklisten_punkte").insert({ mandant_id: sitzung.mandantId, checkliste_id: checkliste, titel: titel.slice(0, 300), pflicht: text(formular, "pflicht") !== "0", dokumentart: art in DOKUMENTARTEN ? art : null, faellig_am: text(formular, "faellig_am") || null, sortierung: (count ?? 0) + 1 });
  if (error) return { fehler: "Nicht gespeichert." };
  revalidatePath(`/checklisten/${checkliste}`);
  return { erfolg: "Punkt ergänzt." };
}

export async function punktLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = uuidOderNull(formular, "punkt_id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: p } = await supabase.from("checklisten_punkte").select("checkliste_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  await supabase.from("checklisten_punkte").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (p) revalidatePath(`/checklisten/${p.checkliste_id as string}`);
}

/** Aus einem Punkt eine Aufgabe fuer den Zustaendigen machen (Punkt und Aufgabe bleiben verbunden). */
export async function punktAlsAufgabe(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);
  const id = uuidOderNull(formular, "punkt_id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: p } = await supabase.from("checklisten_punkte").select("titel, beschreibung, faellig_am, aufgabe_id, checkliste_id, checkliste:checklisten(name, objekt_id, kontakt_id, lead_id, vertrag_id, zustaendig_id)").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!p || p.aufgabe_id) return;
  const c = p.checkliste as unknown as { name: string; objekt_id: string | null; kontakt_id: string | null; lead_id: string | null; vertrag_id: string | null; zustaendig_id: string | null } | null;
  const { data: a } = await supabase.from("aufgaben").insert({ mandant_id: sitzung.mandantId, titel: (p.titel as string).slice(0, 300), beschreibung: [p.beschreibung, c ? `Aus Checkliste „${c.name}“` : null].filter(Boolean).join("\n") || null, prioritaet: "mittel", faellig_am: p.faellig_am, objekt_id: c?.objekt_id ?? null, kontakt_id: c?.kontakt_id ?? null, lead_id: c?.lead_id ?? null, vertrag_id: c?.vertrag_id ?? null, zustaendig_id: c?.zustaendig_id ?? sitzung.benutzerId, erstellt_von: sitzung.benutzerId, quelle: "checkliste" }).select("id").single();
  if (a) await supabase.from("checklisten_punkte").update({ aufgabe_id: a.id }).eq("id", id);
  revalidatePath(`/checklisten/${p.checkliste_id as string}`);
  revalidatePath("/aufgaben");
}

export async function checklisteLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung);
  const id = uuidOderNull(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: c } = await supabase.from("checklisten").select("objekt_id, kontakt_id, lead_id, vertrag_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  await supabase.from("checklisten").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  seiten(c ?? {});
  redirect("/checklisten");
}
