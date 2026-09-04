"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AUFGABEN_STATUS, PRIORITAETEN, schnelleingabeParsen, TERMINARTEN, WIEDERHOLUNGEN, type AufgabenStatus, type Prioritaet, type Terminart } from "@/lib/arbeitsmittel";
import { kiVerfuegbar, textAnbieter } from "@/lib/ki";
import { redirect } from "next/navigation";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

/**
 * Aufgaben und Termine.
 *
 * Beide sind bewusst in einer Datei: Sie teilen die Bezuege zu Objekt und
 * Kontakt, die Rechtepruefung und die Frage, welche Seiten danach neu zu laden
 * sind. Getrennt haetten beide Dateien dieselbe Haelfte enthalten.
 *
 * Das Modul fuer die Rechtepruefung ist `kalender` — dieselbe Zuordnung wie in
 * der Navigation, damit ein Recht nicht an zwei Stellen unterschiedlich heisst.
 */

const PRIO = Object.keys(PRIORITAETEN) as [Prioritaet, ...Prioritaet[]];
const ARTEN = Object.keys(TERMINARTEN) as [Terminart, ...Terminart[]];

export interface ArbeitsErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  text?: string;
  hinweis?: string;
}

/** Leerer String aus einem Formular ist „nichts angegeben", nicht „leer". */
function optional(formular: FormData, feld: string): string | undefined {
  const wert = String(formular.get(feld) ?? "").trim();
  return wert === "" ? undefined : wert;
}

function seitenAktualisieren(objektId?: string, kontaktId?: string): void {
  revalidatePath("/aufgaben");
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
  if (objektId) revalidatePath(`/objekte/${objektId}`);
  if (kontaktId) revalidatePath(`/kontakte/${kontaktId}`);
}

// --- Aufgaben --------------------------------------------------------------

const STATUS = Object.keys(AUFGABEN_STATUS) as [AufgabenStatus, ...AufgabenStatus[]];
const WDH = Object.keys(WIEDERHOLUNGEN) as [string, ...string[]];

const aufgabe = z.object({
  titel: z.string().trim().min(1).max(300),
  beschreibung: z.string().trim().max(2000).optional(),
  prioritaet: z.enum(PRIO),
  faellig_am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  objekt_id: z.uuid().optional(),
  kontakt_id: z.uuid().optional(),
  zustaendig_id: z.uuid().optional(),
  lead_id: z.uuid().optional(),
  termin_id: z.uuid().optional(),
  nachricht_id: z.uuid().optional(),
  vertrag_id: z.uuid().optional(),
  typ: z.enum(["aufgabe", "notiz"]).optional(),
  status: z.enum(STATUS).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  wiederholung: z.enum(WDH).optional(),
  erinnerung_am: z.string().optional(),
  quelle: z.string().max(40).optional(),
  team_sichtbar: z.boolean().optional(),
});

function tagsLesen(formular: FormData): string[] {
  return [...new Set(String(formular.get("tags") ?? "").split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

export async function aufgabeAnlegen(formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);

  // Schnelleingabe: „Energieausweis anfordern morgen !! #unterlagen" wird
  // in Titel, Frist, Prioritaet, Tags und Wiederholung zerlegt — alles bleibt
  // danach editierbar.
  const schnell = optional(formular, "schnell");
  const geparst = schnell ? schnelleingabeParsen(schnell, new Date()) : null;
  const geprueft = aufgabe.safeParse({
    titel: geparst ? geparst.titel : String(formular.get("titel") ?? ""),
    beschreibung: optional(formular, "beschreibung"),
    prioritaet: geparst?.prioritaet ?? String(formular.get("prioritaet") ?? "mittel"),
    faellig_am: geparst?.faellig_am ?? optional(formular, "faellig_am"),
    objekt_id: optional(formular, "objekt_id"),
    kontakt_id: optional(formular, "kontakt_id"),
    zustaendig_id: optional(formular, "zustaendig_id"),
    lead_id: optional(formular, "lead_id"),
    termin_id: optional(formular, "termin_id"),
    nachricht_id: optional(formular, "nachricht_id"),
    vertrag_id: optional(formular, "vertrag_id"),
    typ: geparst?.typ ?? optional(formular, "typ"),
    status: optional(formular, "status"),
    tags: geparst ? [...new Set([...geparst.tags, ...tagsLesen(formular)])] : tagsLesen(formular),
    wiederholung: geparst?.wiederholung ?? optional(formular, "wiederholung"),
    erinnerung_am: optional(formular, "erinnerung_am"),
    quelle: optional(formular, "quelle"),
    team_sichtbar: formular.get("team_sichtbar") === null ? undefined : String(formular.get("team_sichtbar")) !== "0",
  });

  if (!geprueft.success) {
    return { fehler: "Bitte geben Sie mindestens einen Titel an." };
  }

  const d = geprueft.data;
  const supabase = await serverClient();

  const { data: neu, error } = await supabase.from("aufgaben").insert({
    mandant_id: sitzung.mandantId,
    titel: d.titel,
    beschreibung: d.beschreibung ?? null,
    prioritaet: d.prioritaet,
    faellig_am: d.faellig_am ?? null,
    objekt_id: d.objekt_id ?? null,
    kontakt_id: d.kontakt_id ?? null,
    lead_id: d.lead_id ?? null,
    termin_id: d.termin_id ?? null,
    nachricht_id: d.nachricht_id ?? null,
    vertrag_id: d.vertrag_id ?? null,
    typ: d.typ ?? "aufgabe",
    status: d.status ?? "offen",
    tags: d.tags ?? [],
    wiederholung: d.wiederholung ?? null,
    erinnerung_am: d.erinnerung_am && !Number.isNaN(new Date(d.erinnerung_am).getTime()) ? new Date(d.erinnerung_am).toISOString() : null,
    quelle: d.quelle ?? (schnell ? "schnelleingabe" : null),
    team_sichtbar: d.team_sichtbar ?? true,
    // Ohne Angabe ist der Anlegende zustaendig. Eine Aufgabe ohne
    // Verantwortlichen bleibt sonst liegen, weil sie niemandem gehoert.
    zustaendig_id: d.zustaendig_id ?? sitzung.benutzerId,
    erstellt_von: sitzung.benutzerId,
  }).select("id").single();

  if (error || !neu) return { fehler: error?.message.includes("gehoert nicht") ? "Eine Verknüpfung gehört nicht zu diesem Unternehmen." : "Die Aufgabe konnte nicht gespeichert werden." };
  // Tags des Mandanten pflegen (fuer Filter und Farben)
  for (const t of d.tags ?? []) await supabase.from("aufgaben_tags").insert({ mandant_id: sitzung.mandantId, name: t }).then(() => undefined, () => undefined);

  seitenAktualisieren(d.objekt_id, d.kontakt_id);
  if (d.lead_id) revalidatePath(`/akquise/leads/${d.lead_id}`);
  return { id: neu.id as string };
}

/**
 * Erledigen und Wiederoeffnen in einer Aktion.
 *
 * Beim Erledigen wird festgehalten, WER erledigt hat — die Datenbank verlangt
 * das per Check-Constraint. Sonst stuende spaeter „fertig" da, ohne dass
 * jemand dafuer geradesteht.
 */
export async function aufgabeUmschalten(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("aufgabe_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("aufgaben")
    .select("erledigt_am, objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!vorhanden) return;

  const erledigen = vorhanden.erledigt_am === null;

  await supabase
    .from("aufgaben")
    .update(
      erledigen
        ? { erledigt_am: new Date().toISOString(), erledigt_von: sitzung.benutzerId }
        : { erledigt_am: null, erledigt_von: null },
    )
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  seitenAktualisieren(
    vorhanden.objekt_id ?? undefined,
    vorhanden.kontakt_id ?? undefined,
  );
}

export async function aufgabeLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung);

  const id = String(formular.get("aufgabe_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("aufgaben")
    .select("objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  await supabase
    .from("aufgaben")
    .delete()
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  seitenAktualisieren(
    vorhanden?.objekt_id ?? undefined,
    vorhanden?.kontakt_id ?? undefined,
  );
}

// --- Termine ---------------------------------------------------------------

const termin = z
  .object({
    titel: z.string().trim().min(1).max(300),
    art: z.enum(ARTEN),
    beginnt_am: z.string().min(1),
    dauer_minuten: z.coerce.number().int().min(5).max(1440),
    ort: z.string().trim().max(300).optional(),
    notiz: z.string().trim().max(2000).optional(),
    objekt_id: z.uuid().optional(),
    kontakt_id: z.uuid().optional(),
    zustaendig_id: z.uuid().optional(),
  })
  .refine((d) => !Number.isNaN(new Date(d.beginnt_am).getTime()), {
    message: "Ungültiger Zeitpunkt",
    path: ["beginnt_am"],
  });

export async function terminAnlegen(formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);

  const geprueft = termin.safeParse({
    titel: String(formular.get("titel") ?? ""),
    art: String(formular.get("art") ?? "besichtigung"),
    beginnt_am: String(formular.get("beginnt_am") ?? ""),
    // Dauer statt Endzeitpunkt: Beim Eintragen einer Besichtigung ist „60
    // Minuten" die Angabe, die man im Kopf hat — nicht „15:00 bis 16:00".
    dauer_minuten: String(formular.get("dauer_minuten") ?? "60"),
    ort: optional(formular, "ort"),
    notiz: optional(formular, "notiz"),
    objekt_id: optional(formular, "objekt_id"),
    kontakt_id: optional(formular, "kontakt_id"),
    zustaendig_id: optional(formular, "zustaendig_id"),
  });

  if (!geprueft.success) {
    return { fehler: "Bitte geben Sie Titel und Zeitpunkt an." };
  }

  const d = geprueft.data;
  const beginn = new Date(d.beginnt_am);
  const ende = new Date(beginn.getTime() + d.dauer_minuten * 60_000);

  const supabase = await serverClient();
  const { error } = await supabase.from("termine").insert({
    mandant_id: sitzung.mandantId,
    titel: d.titel,
    art: d.art,
    beginnt_am: beginn.toISOString(),
    endet_am: ende.toISOString(),
    ort: d.ort ?? null,
    notiz: d.notiz ?? null,
    objekt_id: d.objekt_id ?? null,
    kontakt_id: d.kontakt_id ?? null,
    zustaendig_id: d.zustaendig_id ?? sitzung.benutzerId,
    erstellt_von: sitzung.benutzerId,
  });

  if (error) return { fehler: "Der Termin konnte nicht gespeichert werden." };

  seitenAktualisieren(d.objekt_id, d.kontakt_id);
  return {};
}

/**
 * Sagt einen Termin ab, statt ihn zu loeschen.
 *
 * Ein abgesagter Termin ist eine Information: Er stand im Kalender, jemand hat
 * sich darauf eingerichtet. Ihn zu entfernen wuerde die Absage unsichtbar
 * machen — und im Verlauf des Objekts eine Luecke hinterlassen.
 */
export async function terminAbsagen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);

  const id = String(formular.get("termin_id") ?? "").trim();
  if (!id) return;

  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("termine")
    .select("abgesagt_am, objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  if (!vorhanden) return;

  await supabase
    .from("termine")
    .update({
      abgesagt_am: vorhanden.abgesagt_am === null ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  seitenAktualisieren(
    vorhanden.objekt_id ?? undefined,
    vorhanden.kontakt_id ?? undefined,
  );
}


// --- ToDos-Ausbau: Speichern, Status, Schritte, Kommentare, Tags -------------

const aufgabeAendern = z.object({
  titel: z.string().trim().min(1).max(300),
  beschreibung: z.string().trim().max(4000).optional(),
  prioritaet: z.enum(PRIO),
  status: z.enum(STATUS),
  faellig_am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  zustaendig_id: z.uuid().optional(),
  objekt_id: z.uuid().optional(),
  kontakt_id: z.uuid().optional(),
  lead_id: z.uuid().optional(),
  wiederholung: z.enum(WDH).optional(),
  erinnerung_am: z.string().optional(),
  typ: z.enum(["aufgabe", "notiz"]),
  team_sichtbar: z.boolean(),
});

export async function aufgabeSpeichern(_vorher: ArbeitsErgebnis, formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = String(formular.get("aufgabe_id") ?? "").trim();
  const geprueft = aufgabeAendern.safeParse({
    titel: String(formular.get("titel") ?? ""),
    beschreibung: optional(formular, "beschreibung"),
    prioritaet: String(formular.get("prioritaet") ?? "mittel"),
    status: String(formular.get("status") ?? "offen"),
    faellig_am: optional(formular, "faellig_am"),
    zustaendig_id: optional(formular, "zustaendig_id"),
    objekt_id: optional(formular, "objekt_id"),
    kontakt_id: optional(formular, "kontakt_id"),
    lead_id: optional(formular, "lead_id"),
    wiederholung: optional(formular, "wiederholung"),
    erinnerung_am: optional(formular, "erinnerung_am"),
    typ: String(formular.get("typ") ?? "aufgabe"),
    team_sichtbar: String(formular.get("team_sichtbar") ?? "1") !== "0",
  });
  if (!id || !geprueft.success) return { fehler: "Bitte die Eingaben prüfen (Titel ist Pflicht)." };
  const d = geprueft.data;
  const tags = tagsLesen(formular);
  const supabase = await serverClient();
  const { error } = await supabase
    .from("aufgaben")
    .update({
      titel: d.titel, beschreibung: d.beschreibung ?? null, prioritaet: d.prioritaet, status: d.status, faellig_am: d.faellig_am ?? null,
      zustaendig_id: d.zustaendig_id ?? null, objekt_id: d.objekt_id ?? null, kontakt_id: d.kontakt_id ?? null, lead_id: d.lead_id ?? null,
      wiederholung: d.wiederholung ?? null, erinnerung_am: d.erinnerung_am && !Number.isNaN(new Date(d.erinnerung_am).getTime()) ? new Date(d.erinnerung_am).toISOString() : null,
      typ: d.typ, tags, team_sichtbar: d.team_sichtbar,
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: error.message.includes("gehoert nicht") ? "Eine Verknüpfung gehört nicht zu diesem Unternehmen." : "Nicht gespeichert." };
  for (const t of tags) await supabase.from("aufgaben_tags").insert({ mandant_id: sitzung.mandantId, name: t }).then(() => undefined, () => undefined);
  seitenAktualisieren(d.objekt_id, d.kontakt_id);
  revalidatePath(`/aufgaben/${id}`);
  if (d.lead_id) revalidatePath(`/akquise/leads/${d.lead_id}`);
  return { erfolg: "Gespeichert." };
}

/** Status setzen (Kanban, Liste, Detail). Erledigt-Zeit und Person setzt die Datenbank. */
export async function aufgabeStatus(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = String(formular.get("aufgabe_id") ?? "").trim();
  const status = String(formular.get("status") ?? "");
  if (!id || !(status in AUFGABEN_STATUS)) return;
  const supabase = await serverClient();
  const { data: vorhanden } = await supabase.from("aufgaben").select("objekt_id, kontakt_id, lead_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!vorhanden) return;
  await supabase.from("aufgaben").update({ status }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  seitenAktualisieren(vorhanden.objekt_id ?? undefined, vorhanden.kontakt_id ?? undefined);
  revalidatePath(`/aufgaben/${id}`);
  if (vorhanden.lead_id) revalidatePath(`/akquise/leads/${vorhanden.lead_id as string}`);
}

export async function schrittAnlegen(_vorher: ArbeitsErgebnis, formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = String(formular.get("aufgabe_id") ?? "").trim();
  const titel = String(formular.get("titel") ?? "").trim().slice(0, 300);
  if (!id || !titel) return { fehler: "Bitte einen Schritt eingeben." };
  const supabase = await serverClient();
  const { count } = await supabase.from("aufgaben_schritte").select("id", { count: "exact", head: true }).eq("aufgabe_id", id);
  const { error } = await supabase.from("aufgaben_schritte").insert({ mandant_id: sitzung.mandantId, aufgabe_id: id, titel, sortierung: (count ?? 0) + 1 });
  if (error) return { fehler: "Schritt nicht gespeichert." };
  revalidatePath(`/aufgaben/${id}`);
  return {};
}

export async function schrittUmschalten(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = String(formular.get("schritt_id") ?? "").trim();
  if (!id) return;
  const supabase = await serverClient();
  const { data: s } = await supabase.from("aufgaben_schritte").select("aufgabe_id, erledigt_am").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!s) return;
  await supabase.from("aufgaben_schritte").update(s.erledigt_am ? { erledigt_am: null, erledigt_von: null } : { erledigt_am: new Date().toISOString(), erledigt_von: sitzung.benutzerId }).eq("id", id);
  revalidatePath(`/aufgaben/${s.aufgabe_id as string}`);
}

export async function schrittLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = String(formular.get("schritt_id") ?? "").trim();
  if (!id) return;
  const supabase = await serverClient();
  const { data: s } = await supabase.from("aufgaben_schritte").select("aufgabe_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  await supabase.from("aufgaben_schritte").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (s) revalidatePath(`/aufgaben/${s.aufgabe_id as string}`);
}

export async function kommentarAnlegen(_vorher: ArbeitsErgebnis, formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = String(formular.get("aufgabe_id") ?? "").trim();
  const inhalt = String(formular.get("text") ?? "").trim().slice(0, 4000);
  if (!id || !inhalt) return { fehler: "Bitte einen Kommentar eingeben." };
  const supabase = await serverClient();
  const { error } = await supabase.from("aufgaben_kommentare").insert({ mandant_id: sitzung.mandantId, aufgabe_id: id, text: inhalt, benutzer_id: sitzung.benutzerId, benutzer_name: sitzung.name });
  if (error) return { fehler: "Kommentar nicht gespeichert." };
  revalidatePath(`/aufgaben/${id}`);
  return {};
}

export async function tagSpeichern(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const name = String(formular.get("name") ?? "").replace(/^#/, "").trim().toLowerCase().slice(0, 40);
  const farbe = String(formular.get("farbe") ?? "#1B2A47");
  if (!name) return;
  const supabase = await serverClient();
  await supabase.from("aufgaben_tags").upsert({ mandant_id: sitzung.mandantId, name, farbe: /^#[0-9a-fA-F]{6}$/.test(farbe) ? farbe : "#1B2A47" }, { onConflict: "mandant_id,name" });
  revalidatePath("/aufgaben");
}

/** ToDo aus einer E-Mail (Referenz „ToDo aus Mail"): Betreff wird Titel, Frist aus dem Text, Bezug bleibt. */
export async function aufgabeAusNachricht(_vorher: ArbeitsErgebnis, formular: FormData): Promise<ArbeitsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);
  const id = String(formular.get("nachricht_id") ?? "").trim();
  if (!id) return { fehler: "Unbekannte Nachricht." };
  const supabase = await serverClient();
  const { data: n } = await supabase.from("nachrichten").select("id, betreff, text, von_name, von_adresse, objekt_id, kontakt_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!n) return { fehler: "Unbekannte Nachricht." };
  const { data: vorhanden } = await supabase.from("aufgaben").select("id").eq("nachricht_id", id).maybeSingle();
  if (vorhanden) return { erfolg: "Zu dieser E-Mail gibt es bereits eine Aufgabe.", id: vorhanden.id as string };
  const betreff = ((n.betreff as string | null) ?? "").replace(/^(re|aw|fwd?|wg):\s*/i, "").trim();
  const text = ((n.text as string | null) ?? "").replace(/\r/g, "");
  // Frist: „bis 12.10.", „bis Freitag", „bis morgen"
  const frist = /\bbis (?:zum |spätestens )?([^\n.,;]{3,25})/i.exec(text);
  const geparst = schnelleingabeParsen(`${betreff || "E-Mail bearbeiten"}${frist?.[1] ? ` ${frist[1]}` : ""}`, new Date());
  const { data: neu, error } = await supabase.from("aufgaben").insert({
    mandant_id: sitzung.mandantId, titel: (geparst.titel || betreff || "E-Mail bearbeiten").slice(0, 300),
    beschreibung: [`Von ${(n.von_name as string | null) ?? ""} <${(n.von_adresse as string | null) ?? ""}>`, text.slice(0, 1500)].join("\n\n").slice(0, 2000),
    prioritaet: geparst.prioritaet, faellig_am: geparst.faellig_am, objekt_id: n.objekt_id, kontakt_id: n.kontakt_id, nachricht_id: id, quelle: "mail",
    zustaendig_id: sitzung.benutzerId, erstellt_von: sitzung.benutzerId,
  }).select("id").single();
  if (error || !neu) return { fehler: "Die Aufgabe konnte nicht angelegt werden." };
  seitenAktualisieren(n.objekt_id ?? undefined, n.kontakt_id ?? undefined);
  return { erfolg: geparst.faellig_am ? `Aufgabe angelegt, fällig ${geparst.faellig_am}.` : "Aufgabe angelegt.", id: neu.id as string };
}

/** Rechtschreib- und Grammatikkorrektur (Referenz „text-korrigieren"), 1 Credit mit KI; ohne KI unveraendert. */
export async function textKorrigieren(_vorher: ArbeitsErgebnis, formular: FormData): Promise<ArbeitsErgebnis> {
  await sitzungErzwingen();
  const text = String(formular.get("text") ?? "").trim();
  if (!text) return { fehler: "Kein Text." };
  if (text.length > 8000) return { fehler: "Der Text ist länger als 8000 Zeichen." };
  const supabase = await serverClient();
  const anbieter = textAnbieter();
  let vorgang: string | null = null;
  if (kiVerfuegbar()) {
    const { data, error } = await supabase.rpc("credits_reservieren", { p_aktion: "ki_text_korrektur", p_referenz_art: "text", p_referenz_id: null });
    if (error) return { fehler: `Keine Korrektur möglich: ${error.message}` };
    vorgang = data as string;
  }
  try {
    const e = await anbieter.textKorrigieren(text);
    if (vorgang) await supabase.rpc("credits_einloesen", { p_vorgang: vorgang, p_kosten_cent: e.kostenCent });
    return { text: e.text, hinweis: e.kiVerwendet ? (e.geaendert ? `Korrigiert (${e.quelle}).` : "Keine Änderung nötig.") : "Ohne Modellzugang keine Korrektur — der Text ist unverändert." };
  } catch (err) {
    if (vorgang) await supabase.rpc("credits_freigeben", { p_vorgang: vorgang, p_grund: (err instanceof Error ? err.message : "Fehler").slice(0, 200) });
    return { fehler: `Die Korrektur ist fehlgeschlagen — ${err instanceof Error ? err.message : "unbekannt"}` };
  }
}

/** Tutorial als gesehen merken (eigenes Konto). */
export async function tutorialGesehen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  await supabase.from("benutzer").update({ tutorial_gesehen_am: String(formular.get("zuruecksetzen") ?? "") === "1" ? null : new Date().toISOString() }).eq("id", sitzung.benutzerId);
  revalidatePath("/dashboard");
  if (String(formular.get("zuruecksetzen") ?? "") === "1") redirect("/dashboard?tutorial=1");
}
