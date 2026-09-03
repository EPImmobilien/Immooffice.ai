"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { leadsAusCsv } from "@/lib/akquise/csv";
import { eigentuemerAnfrageErkennen } from "@/lib/akquise/mail-parser";
import { kategorieAusObjektart, preisRechnen, provisionsErwartung } from "@/lib/akquise/preisfinder";
import { leadTitel, OBJEKTARTEN, STANDARD_EINSTELLUNGEN, vorlageAusfuellen, ZEITRAEUME, ZUSTAENDE, type Provisionsart } from "@/lib/akquise/stammdaten";
import { akquiseEinstellungenLaden } from "@/lib/akquise/vergleichswerte";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

/**
 * Akquise (docs/FUNKTIONSABGLEICH.md A1/A2): Leads und Pipeline, Kampagnen und
 * Quellen, Automationen, Radar, Preis-Finder, Einstellungen. Rechte werden
 * hier gegen das Modul „akquise" geprueft und in der Datenbank ueber RLS.
 */

export interface AkquiseErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  hinweis?: string;
  betreff?: string;
  text?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function optional(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return w ? w : null;
}
/** Zahl aus dem Formular: „1.234,56" und „3.57" werden beide verstanden. */
function zahlOderNull(formular: FormData, feld: string): number | null {
  const roh = text(formular, feld);
  const w = roh.includes(",") ? roh.replace(/\./g, "").replace(",", ".") : roh;
  if (!w) return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}
function uuidOderNull(formular: FormData, feld: string): string | null {
  const p = z.uuid().safeParse(text(formular, feld));
  return p.success ? p.data : null;
}

/** Standard-Stammdaten sicherstellen (erster Aufruf je Mandant). */
export async function akquiseVorbereiten(): Promise<string | null> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data: vorhanden } = await supabase.from("akquise_pipelines").select("id").order("ist_standard", { ascending: false }).order("sortierung").limit(1).maybeSingle();
  if (vorhanden?.id) return vorhanden.id as string;
  const { data } = await supabase.rpc("akquise_standard_anlegen");
  return typeof data === "string" ? data : null;
}

async function ersteStufe(supabase: Awaited<ReturnType<typeof serverClient>>, pipelineId: string): Promise<string | null> {
  const { data } = await supabase.from("akquise_stufen").select("id").eq("pipeline_id", pipelineId).eq("ist_gewonnen", false).eq("ist_verloren", false).order("sortierung").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function pipelineFuerQuelle(supabase: Awaited<ReturnType<typeof serverClient>>, quelleId: string | null, gewuenscht: string | null): Promise<string | null> {
  if (gewuenscht) return gewuenscht;
  if (quelleId) {
    const { data: q } = await supabase.from("akquise_quellen").select("pipeline_id").eq("id", quelleId).maybeSingle();
    if (q?.pipeline_id) return q.pipeline_id as string;
  }
  const { data } = await supabase.from("akquise_pipelines").select("id").order("ist_standard", { ascending: false }).order("sortierung").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

const leadSchema = z.object({
  titel: z.string().max(200),
  strasse: z.string().max(200), hausnummer: z.string().max(20), plz: z.string().max(10), ort: z.string().max(120),
  objektart: z.string().max(60), zustand: z.string().max(60), verkaufszeitraum: z.string().max(60),
  notiz: z.string().max(4000),
});

async function leadEinfuegen(supabase: Awaited<ReturnType<typeof serverClient>>, sitzung: { mandantId: string; benutzerId: string }, zeile: Record<string, unknown>): Promise<{ id: string } | { fehler: string }> {
  const pipelineId = await pipelineFuerQuelle(supabase, (zeile["quelle_id"] as string | null) ?? null, (zeile["pipeline_id"] as string | null) ?? null);
  if (!pipelineId) return { fehler: "Keine Pipeline vorhanden — bitte zuerst die Akquise öffnen." };
  const stufeId = (zeile["stufe_id"] as string | null) ?? (await ersteStufe(supabase, pipelineId));
  if (!stufeId) return { fehler: "Die Pipeline hat keine offene Stufe." };
  const { data, error } = await supabase
    .from("akquise_leads")
    .insert({ ...zeile, mandant_id: sitzung.mandantId, pipeline_id: pipelineId, stufe_id: stufeId, zustaendig_id: zeile["zustaendig_id"] ?? sitzung.benutzerId, erstellt_von: sitzung.benutzerId })
    .select("id")
    .single();
  if (error || !data) return { fehler: error?.message.includes("gehoert nicht") ? "Eine Verknüpfung gehört nicht zu diesem Unternehmen." : "Der Lead konnte nicht angelegt werden." };
  return { id: data.id as string };
}

async function kontaktFinden(supabase: Awaited<ReturnType<typeof serverClient>>, sitzung: { mandantId: string; benutzerId: string }, p: { anrede: string; vorname: string; nachname: string; email: string | null; telefon: string | null; quelle: string }): Promise<string | null> {
  if (!p.nachname && !p.email) return null;
  if (p.email) {
    const { data } = await supabase.from("kontakte").select("id").ilike("email", p.email).is("geloescht_am", null).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: neu } = await supabase
    .from("kontakte")
    .insert({ mandant_id: sitzung.mandantId, anrede: p.anrede || null, vorname: p.vorname || null, nachname: p.nachname || p.email, email: p.email, telefon: p.telefon, quelle: p.quelle, erstellt_von: sitzung.benutzerId })
    .select("id")
    .single();
  if (!neu) return null;
  await supabase.from("kontakt_rollen").insert({ kontakt_id: neu.id, mandant_id: sitzung.mandantId, rolle: "eigentuemer" }).then(() => undefined, () => undefined);
  return neu.id as string;
}

/** Lead von Hand, aus Kontakt oder aus Objekt anlegen. */
export async function leadAnlegen(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung);
  const geprueft = leadSchema.safeParse({
    titel: text(formular, "titel"), strasse: text(formular, "strasse"), hausnummer: text(formular, "hausnummer"), plz: text(formular, "plz"), ort: text(formular, "ort"),
    objektart: text(formular, "objektart"), zustand: text(formular, "zustand"), verkaufszeitraum: text(formular, "verkaufszeitraum"), notiz: text(formular, "notiz"),
  });
  if (!geprueft.success) return { fehler: "Bitte die Eingaben prüfen." };
  const d = geprueft.data;
  const supabase = await serverClient();
  const objektId = uuidOderNull(formular, "objekt_id");
  let kontaktId = uuidOderNull(formular, "kontakt_id");
  const zeile: Record<string, unknown> = {
    titel: d.titel || leadTitel(d),
    strasse: d.strasse || null, hausnummer: d.hausnummer || null, plz: d.plz || null, ort: d.ort || null,
    objektart: OBJEKTARTEN.includes(d.objektart as (typeof OBJEKTARTEN)[number]) ? d.objektart : d.objektart || null,
    wohnflaeche: zahlOderNull(formular, "wohnflaeche"), grundstueck: zahlOderNull(formular, "grundstueck"), baujahr: zahlOderNull(formular, "baujahr"),
    zustand: d.zustand in ZUSTAENDE ? d.zustand : null, verkaufszeitraum: ZEITRAEUME.includes(d.verkaufszeitraum as (typeof ZEITRAEUME)[number]) ? d.verkaufszeitraum : null,
    quelle_id: uuidOderNull(formular, "quelle_id"), kampagne_id: uuidOderNull(formular, "kampagne_id"), pipeline_id: uuidOderNull(formular, "pipeline_id"),
    tippgeber_kontakt_id: uuidOderNull(formular, "tippgeber_kontakt_id"), zustaendig_id: uuidOderNull(formular, "zustaendig_id"),
    nachfassen: text(formular, "nachfassen") !== "0", nachfassen_am: optional(formular, "nachfassen_am"), notiz: d.notiz || null,
  };
  // Aus Objekt: Anschrift und Eigentuemer uebernehmen
  if (objektId) {
    const { data: o } = await supabase.from("objekte").select("bezeichnung, strasse, hausnummer, plz, ort, objektkategorie, wohnflaeche, grundstuecksflaeche, baujahr").eq("id", objektId).maybeSingle();
    if (o) {
      zeile["objekt_id"] = objektId;
      if (!d.titel) zeile["titel"] = o.bezeichnung;
      for (const k of ["strasse", "hausnummer", "plz", "ort", "wohnflaeche", "baujahr"] as const) if (!zeile[k] && o[k]) zeile[k] = o[k];
      if (!zeile["grundstueck"] && o.grundstuecksflaeche) zeile["grundstueck"] = o.grundstuecksflaeche;
      if (!kontaktId) {
        const { data: eig } = await supabase.from("kontakt_objekt").select("kontakt_id").eq("objekt_id", objektId).eq("rolle", "eigentuemer").limit(1).maybeSingle();
        kontaktId = (eig?.kontakt_id as string | undefined) ?? null;
      }
    }
  }
  // Neuer Kontakt aus den Personenfeldern
  if (!kontaktId && (text(formular, "nachname") || text(formular, "email"))) {
    kontaktId = await kontaktFinden(supabase, sitzung, { anrede: text(formular, "anrede"), vorname: text(formular, "vorname"), nachname: text(formular, "nachname"), email: optional(formular, "email"), telefon: optional(formular, "telefon"), quelle: "Akquise-Lead" });
  }
  zeile["kontakt_id"] = kontaktId;
  const erg = await leadEinfuegen(supabase, sitzung, zeile);
  if ("fehler" in erg) return { fehler: erg.fehler };
  revalidatePath("/akquise/leads");
  redirect(`/akquise/leads/${erg.id}`);
}

/** Leads aus einer CSV-Datei anlegen; jede Zeile bleibt danach editierbar. */
export async function leadsImportieren(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung);
  const datei = formular.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return { fehler: "Bitte eine CSV-Datei wählen." };
  if (datei.size > 2_000_000) return { fehler: "Die Datei ist größer als 2 MB." };
  const inhalt = Buffer.from(await datei.arrayBuffer()).toString("utf8");
  const { leads, fehler } = leadsAusCsv(inhalt);
  if (leads.length === 0) return { fehler: fehler[0] ?? "Keine Zeilen gefunden." };
  const supabase = await serverClient();
  const quelleId = uuidOderNull(formular, "quelle_id");
  let angelegt = 0;
  const probleme = [...fehler];
  for (const l of leads.slice(0, 500)) {
    const kontaktId = await kontaktFinden(supabase, sitzung, { anrede: l.anrede, vorname: l.vorname, nachname: l.nachname, email: l.email || null, telefon: l.telefon || null, quelle: "CSV-Import" });
    const erg = await leadEinfuegen(supabase, sitzung, {
      titel: l.titel, strasse: l.strasse || null, hausnummer: l.hausnummer || null, plz: l.plz || null, ort: l.ort || null, objektart: l.objektart || null,
      wohnflaeche: l.wohnflaeche, baujahr: l.baujahr, kontakt_id: kontaktId, quelle_id: quelleId, notiz: l.notiz || null,
    });
    if ("fehler" in erg) probleme.push(`${l.titel}: ${erg.fehler}`); else angelegt += 1;
  }
  revalidatePath("/akquise/leads");
  return { erfolg: `${angelegt} Leads angelegt.`, ...(probleme.length > 0 ? { hinweis: probleme.slice(0, 5).join(" · ") } : {}) };
}

export async function leadSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Lead." };
  const geprueft = leadSchema.safeParse({
    titel: text(formular, "titel"), strasse: text(formular, "strasse"), hausnummer: text(formular, "hausnummer"), plz: text(formular, "plz"), ort: text(formular, "ort"),
    objektart: text(formular, "objektart"), zustand: text(formular, "zustand"), verkaufszeitraum: text(formular, "verkaufszeitraum"), notiz: text(formular, "notiz"),
  });
  if (!geprueft.success || !geprueft.data.titel) return { fehler: "Bitte einen Titel angeben." };
  const d = geprueft.data;
  const supabase = await serverClient();
  const { error } = await supabase
    .from("akquise_leads")
    .update({
      titel: d.titel, strasse: d.strasse || null, hausnummer: d.hausnummer || null, plz: d.plz || null, ort: d.ort || null,
      objektart: d.objektart || null, wohnflaeche: zahlOderNull(formular, "wohnflaeche"), grundstueck: zahlOderNull(formular, "grundstueck"), baujahr: zahlOderNull(formular, "baujahr"),
      zustand: d.zustand in ZUSTAENDE ? d.zustand : null, verkaufszeitraum: d.verkaufszeitraum || null,
      kontakt_id: uuidOderNull(formular, "kontakt_id"), tippgeber_kontakt_id: uuidOderNull(formular, "tippgeber_kontakt_id"),
      quelle_id: uuidOderNull(formular, "quelle_id"), kampagne_id: uuidOderNull(formular, "kampagne_id"), zustaendig_id: uuidOderNull(formular, "zustaendig_id"),
      nachfassen: text(formular, "nachfassen") !== "0", nachfassen_am: optional(formular, "nachfassen_am"), notiz: d.notiz || null,
    })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: error.message.includes("gehoert nicht") ? "Eine Verknüpfung gehört nicht zu diesem Unternehmen." : "Nicht gespeichert." };
  revalidatePath(`/akquise/leads/${id.data}`);
  return { erfolg: "Gespeichert." };
}

/** Stufe wechseln (Liste, Kanban, Dossier). Verlorene Stufen brauchen einen Grund. */
export async function leadStufe(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const stufe = z.uuid().safeParse(text(formular, "stufe_id"));
  if (!id.success || !stufe.success) return { fehler: "Ungültige Angabe." };
  const supabase = await serverClient();
  const { data: s } = await supabase.from("akquise_stufen").select("pipeline_id, ist_verloren").eq("id", stufe.data).maybeSingle();
  if (!s) return { fehler: "Unbekannte Stufe." };
  const grund = optional(formular, "verlustgrund");
  if (s.ist_verloren && !grund) return { fehler: "Bitte einen Verlustgrund angeben." };
  const { error } = await supabase
    .from("akquise_leads")
    .update({ stufe_id: stufe.data, pipeline_id: s.pipeline_id, ...(s.ist_verloren ? { verlustgrund: grund } : {}) })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: error.message.includes("Verlustgrund") ? "Bitte einen Verlustgrund angeben." : "Stufe nicht geändert." };
  revalidatePath("/akquise/leads");
  revalidatePath(`/akquise/leads/${id.data}`);
  return { erfolg: "Stufe geändert." };
}

export async function leadLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "loeschen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("akquise_leads").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/akquise/leads");
  redirect("/akquise/leads");
}

/** Aus dem Lead ein Objekt im Status „akquise" anlegen (Drehkreuz Objekt). */
export async function leadZuObjekt(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  rechtErzwingen(sitzung.rolle, "objekte", "anlegen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Lead." };
  const supabase = await serverClient();
  const { data: l } = await supabase.from("akquise_leads").select("*").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!l) return { fehler: "Unbekannter Lead." };
  if (l.objekt_id) return { erfolg: "Es gibt bereits ein Objekt zu diesem Lead.", id: l.objekt_id as string };
  const kategorie = kategorieAusObjektart(l.objektart as string | null) ?? "wohnung";
  const { data: o, error } = await supabase
    .from("objekte")
    .insert({
      mandant_id: sitzung.mandantId,
      bezeichnung: l.titel, status: "akquise", vermarktungsart: "kauf", objektkategorie: kategorie, objektart: l.objektart,
      strasse: l.strasse, hausnummer: l.hausnummer, plz: l.plz, ort: l.ort,
      wohnflaeche: l.wohnflaeche, grundstuecksflaeche: l.grundstueck, baujahr: l.baujahr,
      kaufpreis: l.angebotspreis, erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !o) return { fehler: "Das Objekt konnte nicht angelegt werden." };
  if (l.kontakt_id) await supabase.from("kontakt_objekt").insert({ mandant_id: sitzung.mandantId, kontakt_id: l.kontakt_id, objekt_id: o.id, rolle: "eigentuemer" }).then(() => undefined, () => undefined);
  await supabase.from("akquise_leads").update({ objekt_id: o.id }).eq("id", id.data);
  await supabase.from("akquise_lead_historie").insert({ mandant_id: sitzung.mandantId, lead_id: id.data, feld: "objekt", alt: null, neu: "Objekt angelegt", benutzer_id: sitzung.benutzerId });
  revalidatePath(`/akquise/leads/${id.data}`);
  revalidatePath("/objekte");
  return { erfolg: "Objekt im Status „Akquise“ angelegt.", id: o.id as string };
}

/** Kontakt zum Lead anlegen (Eigentuemer). */
export async function leadKontaktAnlegen(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  rechtErzwingen(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Lead." };
  if (!text(formular, "nachname") && !text(formular, "email")) return { fehler: "Bitte Nachname oder E-Mail angeben." };
  const supabase = await serverClient();
  const kontaktId = await kontaktFinden(supabase, sitzung, { anrede: text(formular, "anrede"), vorname: text(formular, "vorname"), nachname: text(formular, "nachname"), email: optional(formular, "email"), telefon: optional(formular, "telefon"), quelle: "Akquise-Lead" });
  if (!kontaktId) return { fehler: "Der Kontakt konnte nicht angelegt werden." };
  await supabase.from("akquise_leads").update({ kontakt_id: kontaktId }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath(`/akquise/leads/${id.data}`);
  return { erfolg: "Kontakt angelegt und verknüpft.", id: kontaktId };
}

/** Wertermittlung (offenes Rechenblatt) zum Lead anlegen und verknuepfen. */
export async function leadWertermittlung(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "wertermittlung", "anlegen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  const { data: l } = await supabase.from("akquise_leads").select("titel, kontakt_id, objekt_id, wertermittlung_id").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!l) return;
  if (l.wertermittlung_id) redirect(`/wertermittlung/${l.wertermittlung_id as string}`);
  const { data: w } = await supabase.from("wertermittlungen").insert({ mandant_id: sitzung.mandantId, bezeichnung: `Einwertung ${l.titel as string}`.slice(0, 200), objekt_id: l.objekt_id, kontakt_id: l.kontakt_id, erstellt_von: sitzung.benutzerId }).select("id").single();
  if (!w) return;
  await supabase.from("akquise_leads").update({ wertermittlung_id: w.id }).eq("id", id.data);
  revalidatePath(`/akquise/leads/${id.data}`);
  redirect(`/wertermittlung/${w.id as string}`);
}

// ---------------------------------------------------------------------------
// Preis-Finder
// ---------------------------------------------------------------------------

/** Preis-Finder: Indikation, Angebotspreis und Provisionserwartung am Lead speichern. */
export async function preisfinderSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Lead." };
  const supabase = await serverClient();
  const einst = await akquiseEinstellungenLaden(supabase);
  const wert = zahlOderNull(formular, "wert_indikation");
  const art = (["teilung", "aussen", "innen", "keine"].includes(text(formular, "provisionsart")) ? text(formular, "provisionsart") : "teilung") as Provisionsart;
  const satzVk = zahlOderNull(formular, "satz_verkaeufer") ?? einst.provision_satz;
  const satzK = zahlOderNull(formular, "satz_kaeufer") ?? einst.provision_satz;
  const abschlag = zahlOderNull(formular, "abschlag") ?? 10;
  const rahmen = preisRechnen(wert, einst);
  const angebot = zahlOderNull(formular, "angebotspreis") ?? rahmen?.startpreis ?? null;
  const erwartung = provisionsErwartung(angebot, art, satzVk, satzK, abschlag);
  const { error } = await supabase
    .from("akquise_leads")
    .update({ wert_indikation: wert, angebotspreis: angebot, provision_satz: erwartung?.satz ?? null, provision_erwartet: erwartung?.brutto ?? null })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) {
    console.error("Preis-Finder nicht gespeichert:", error.message);
    return { fehler: "Nicht gespeichert." };
  }
  await supabase.from("akquise_lead_historie").insert({ mandant_id: sitzung.mandantId, lead_id: id.data, feld: "preisfinder", alt: null, neu: `Indikation ${wert ?? "—"}, Angebot ${angebot ?? "—"}, Provision ${erwartung?.brutto ?? "—"}`, benutzer_id: sitzung.benutzerId });
  revalidatePath(`/akquise/leads/${id.data}`);
  return { erfolg: "Preis-Finder gespeichert." };
}

// ---------------------------------------------------------------------------
// Aktivitaeten
// ---------------------------------------------------------------------------

export async function aktivitaetAnlegen(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const typ = text(formular, "typ");
  const titel = text(formular, "titel");
  if (!id.success || !["anruf", "termin", "aufgabe", "mail", "whatsapp", "notiz"].includes(typ) || !titel) return { fehler: "Bitte Art und Titel angeben." };
  const supabase = await serverClient();
  const { data: l } = await supabase.from("akquise_leads").select("kontakt_id, objekt_id, zustaendig_id, titel").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!l) return { fehler: "Unbekannter Lead." };
  const faellig = optional(formular, "faellig_am");
  const erledigt = text(formular, "erledigt") === "1";
  let aufgabeId: string | null = null;
  let terminId: string | null = null;
  if (typ === "aufgabe" && !erledigt) {
    const { data: a } = await supabase.from("aufgaben").insert({ mandant_id: sitzung.mandantId, titel: titel.slice(0, 300), beschreibung: optional(formular, "text"), prioritaet: "mittel", faellig_am: faellig ? faellig.slice(0, 10) : null, kontakt_id: l.kontakt_id, objekt_id: l.objekt_id, zustaendig_id: l.zustaendig_id ?? sitzung.benutzerId, erstellt_von: sitzung.benutzerId }).select("id").single();
    aufgabeId = (a?.id as string | undefined) ?? null;
  }
  if (typ === "termin" && faellig) {
    const beginn = new Date(faellig);
    if (!Number.isNaN(beginn.getTime())) {
      const { data: t } = await supabase.from("termine").insert({ mandant_id: sitzung.mandantId, titel: titel.slice(0, 300), art: "beratung", notiz: optional(formular, "text"), beginnt_am: beginn.toISOString(), endet_am: new Date(beginn.getTime() + 60 * 60_000).toISOString(), kontakt_id: l.kontakt_id, objekt_id: l.objekt_id, zustaendig_id: l.zustaendig_id ?? sitzung.benutzerId, erstellt_von: sitzung.benutzerId }).select("id").single();
      terminId = (t?.id as string | undefined) ?? null;
    }
  }
  const { error } = await supabase.from("akquise_aktivitaeten").insert({
    mandant_id: sitzung.mandantId, lead_id: id.data, typ, titel: titel.slice(0, 300), betreff: optional(formular, "betreff"), text: optional(formular, "text"),
    faellig_am: faellig ? new Date(faellig).toISOString() : null, erledigt_am: erledigt || typ === "notiz" || typ === "anruf" ? new Date().toISOString() : null,
    aufgabe_id: aufgabeId, termin_id: terminId, erstellt_von: sitzung.benutzerId,
  });
  if (error) return { fehler: "Die Aktivität konnte nicht gespeichert werden." };
  if (l.kontakt_id && (typ === "anruf" || typ === "mail" || typ === "notiz")) {
    await supabase.from("aktivitaeten").insert({ mandant_id: sitzung.mandantId, kontakt_id: l.kontakt_id, objekt_id: l.objekt_id, typ: typ === "mail" ? "email" : typ === "anruf" ? "anruf" : "notiz", beschreibung: `Akquise ${l.titel as string}: ${titel}`.slice(0, 2000), benutzer_id: sitzung.benutzerId }).then(() => undefined, () => undefined);
  }
  if (text(formular, "nachfassen_am")) await supabase.from("akquise_leads").update({ nachfassen_am: text(formular, "nachfassen_am") }).eq("id", id.data);
  revalidatePath(`/akquise/leads/${id.data}`);
  return { erfolg: "Aktivität gespeichert." };
}

export async function aktivitaetErledigen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "aktivitaet_id"));
  if (!id.success) return;
  const supabase = await serverClient();
  const { data: a } = await supabase.from("akquise_aktivitaeten").select("lead_id, aufgabe_id, erledigt_am").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!a) return;
  const jetzt = a.erledigt_am ? null : new Date().toISOString();
  await supabase.from("akquise_aktivitaeten").update({ erledigt_am: jetzt }).eq("id", id.data);
  if (a.aufgabe_id) await supabase.from("aufgaben").update(jetzt ? { erledigt_am: jetzt, erledigt_von: sitzung.benutzerId } : { erledigt_am: null, erledigt_von: null }).eq("id", a.aufgabe_id as string);
  revalidatePath(`/akquise/leads/${a.lead_id as string}`);
  revalidatePath("/akquise");
}

/** Mail-Entwurf aus einer Vorlage fuer den Lead erzeugen (fuer Postfach oder E-Mail-Programm). */
export async function leadMailEntwerfen(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const vorlage = z.uuid().safeParse(text(formular, "vorlage_id"));
  if (!id.success || !vorlage.success) return { fehler: "Bitte eine Vorlage wählen." };
  const supabase = await serverClient();
  const [{ data: l }, { data: v }, { data: firma }] = await Promise.all([
    supabase.from("akquise_leads").select("titel, strasse, hausnummer, plz, ort, objektart, kontakt:kontakte!akquise_leads_kontakt_id_fkey(anrede, vorname, nachname, firma)").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle(),
    supabase.from("akquise_vorlagen").select("betreff, text").eq("id", vorlage.data).maybeSingle(),
    supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  if (!l || !v) return { fehler: "Lead oder Vorlage unbekannt." };
  const k = (l as unknown as { kontakt: { anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null } | null }).kontakt;
  const name = k ? [k.anrede, k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Eigentümer" : "Eigentümer";
  const anrede = k?.anrede === "Frau" ? `Sehr geehrte Frau ${k.nachname ?? ""}` : k?.anrede === "Herr" ? `Sehr geehrter Herr ${k.nachname ?? ""}` : "Guten Tag";
  const adresse = [[l.strasse, l.hausnummer].filter(Boolean).join(" "), [l.plz, l.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || (l.titel as string);
  const e = vorlageAusfuellen({ betreff: v.betreff as string | null, text: v.text as string }, { anrede, name, adresse, titel: l.titel as string, objektart: (l.objektart as string | null) ?? "Immobilie", absender: sitzung.name, firma: (firma?.firmenname as string | null) ?? sitzung.mandantName });
  return { betreff: e.betreff, text: e.text };
}

// ---------------------------------------------------------------------------
// Eingang: Lead aus Postfach-Nachricht, aus Objektaufnahme, aus Radar
// ---------------------------------------------------------------------------

export async function nachrichtAlsLead(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung);
  const nachrichtId = z.uuid().safeParse(text(formular, "nachricht_id"));
  if (!nachrichtId.success) return { fehler: "Unbekannte Nachricht." };
  const supabase = await serverClient();
  const { data: n } = await supabase.from("nachrichten").select("id, betreff, text, von_adresse, von_name, gesendet_am, kontakt_id").eq("id", nachrichtId.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!n) return { fehler: "Unbekannte Nachricht." };
  const { data: vorhanden } = await supabase.from("akquise_leads").select("id").contains("email_eingang", { nachricht_id: n.id }).maybeSingle();
  if (vorhanden) return { erfolg: "Zu dieser E-Mail gibt es bereits einen Lead.", id: vorhanden.id as string };
  await akquiseVorbereiten();
  const e = eigentuemerAnfrageErkennen({ betreff: n.betreff as string | null, text: n.text as string | null, vonAdresse: n.von_adresse as string | null, vonName: n.von_name as string | null });
  const kontaktId = (n.kontakt_id as string | null) ?? (await kontaktFinden(supabase, sitzung, { anrede: e.anrede, vorname: e.vorname, nachname: e.nachname, email: e.email, telefon: e.telefon, quelle: "E-Mail-Eingang" }));
  const { data: q } = await supabase.from("akquise_quellen").select("id").eq("name", "E-Mail-Eingang").maybeSingle();
  const erg = await leadEinfuegen(supabase, sitzung, {
    titel: leadTitel({ objektart: e.objektart, strasse: e.strasse, hausnummer: e.hausnummer, ort: e.ort }) === "Neuer Lead" ? `Anfrage ${[e.vorname, e.nachname].filter(Boolean).join(" ") || (n.betreff as string) || "E-Mail"}`.slice(0, 200) : leadTitel({ objektart: e.objektart, strasse: e.strasse, hausnummer: e.hausnummer, ort: e.ort }),
    strasse: e.strasse || null, hausnummer: e.hausnummer || null, plz: e.plz || null, ort: e.ort || null, objektart: e.objektart, wohnflaeche: e.wohnflaeche, baujahr: e.baujahr,
    kontakt_id: kontaktId, quelle_id: (q?.id as string | undefined) ?? null, notiz: e.nachricht || null,
    email_eingang: { absender: n.von_adresse, betreff: n.betreff, datum: n.gesendet_am, nachricht_id: n.id, erkannt: e.erkannt },
  });
  if ("fehler" in erg) return { fehler: erg.fehler };
  revalidatePath("/akquise/leads");
  return { erfolg: e.erkannt ? "Lead angelegt." : "Lead angelegt — die Felder konnten nur teilweise erkannt werden, bitte prüfen.", id: erg.id };
}

/** Aus einer Objektaufnahme (Termin beim Eigentuemer) entsteht der Lead. */
export async function leadAusAufnahme(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "aufnahme_id"));
  if (!id.success) return;
  const supabase = await serverClient();
  const { data: vorhanden } = await supabase.from("akquise_leads").select("id").eq("aufnahme_id", id.data).maybeSingle();
  if (vorhanden?.id) redirect(`/akquise/leads/${vorhanden.id as string}`);
  const { data: a } = await supabase.from("objektaufnahmen").select("bezeichnung, strasse, hausnummer, plz, ort, objektkategorie, wohnflaeche, grundstuecksflaeche, baujahr, kontakt_id, aufgenommen_am").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!a) return;
  await akquiseVorbereiten();
  const objektart = a.objektkategorie === "haus" ? "Einfamilienhaus" : a.objektkategorie === "wohnung" ? "Eigentumswohnung" : a.objektkategorie === "grundstueck" ? "Grundstück" : a.objektkategorie === "gewerbe" ? "Gewerbeobjekt" : a.objektkategorie === "anlage" ? "Mehrfamilienhaus" : null;
  const erg = await leadEinfuegen(supabase, sitzung, {
    titel: a.bezeichnung, strasse: a.strasse, hausnummer: a.hausnummer, plz: a.plz, ort: a.ort, objektart, wohnflaeche: a.wohnflaeche, grundstueck: a.grundstuecksflaeche, baujahr: a.baujahr,
    kontakt_id: a.kontakt_id, aufnahme_id: id.data, notiz: `Aus der Objektaufnahme vom ${new Date(a.aufgenommen_am as string).toLocaleDateString("de-DE")} übernommen.`,
  });
  if ("fehler" in erg) return;
  revalidatePath("/akquise/leads");
  redirect(`/akquise/leads/${erg.id}`);
}

export async function radarErfassen(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const titel = optional(formular, "titel");
  const strasse = optional(formular, "strasse");
  if (!titel && !strasse) return { fehler: "Bitte Titel oder Straße angeben." };
  const anbieter = ["privat", "gewerblich", "unbekannt"].includes(text(formular, "anbieter_typ")) ? text(formular, "anbieter_typ") : "privat";
  const { error } = await supabase.from("akquise_radar").insert({
    mandant_id: sitzung.mandantId, titel, strasse, plz: optional(formular, "plz"), ort: optional(formular, "ort"), objektart: optional(formular, "objektart"),
    wohnflaeche: zahlOderNull(formular, "wohnflaeche"), preis: zahlOderNull(formular, "preis"), quelle: optional(formular, "quelle"), url: optional(formular, "url"),
    anbieter_typ: anbieter, telefon: optional(formular, "telefon"), notiz: optional(formular, "notiz"), erfasst_von: sitzung.benutzerId,
  });
  if (error) return { fehler: "Nicht gespeichert." };
  revalidatePath("/akquise/radar");
  return { erfolg: "Inserat erfasst." };
}

export async function radarUebernehmen(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "radar_id"));
  if (!id.success) return { fehler: "Unbekanntes Inserat." };
  const supabase = await serverClient();
  const { data: r } = await supabase.from("akquise_radar").select("*").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!r) return { fehler: "Unbekanntes Inserat." };
  if (r.lead_id) return { erfolg: "Bereits übernommen.", id: r.lead_id as string };
  await akquiseVorbereiten();
  const { data: q } = await supabase.from("akquise_quellen").select("id").ilike("name", "%Radar%").maybeSingle();
  const hn = /^(.*?)\s+(\d{1,4}\s?[a-zA-Z]?)$/.exec(((r.strasse as string | null) ?? "").trim());
  const erg = await leadEinfuegen(supabase, sitzung, {
    titel: (r.titel as string | null) ?? leadTitel({ objektart: r.objektart as string | null, strasse: r.strasse as string | null, ort: r.ort as string | null }),
    strasse: hn?.[1] ?? r.strasse, hausnummer: hn?.[2]?.replace(/\s+/g, "") ?? null, plz: r.plz, ort: r.ort, objektart: r.objektart, wohnflaeche: r.wohnflaeche, angebotspreis: r.preis,
    quelle_id: (q?.id as string | undefined) ?? null, radar_id: id.data,
    notiz: [r.quelle ? `Quelle: ${r.quelle as string}` : null, r.url ? `Inserat: ${r.url as string}` : null, r.telefon ? `Telefon laut Inserat: ${r.telefon as string}` : null, r.notiz as string | null].filter(Boolean).join("\n") || null,
  });
  if ("fehler" in erg) return { fehler: erg.fehler };
  await supabase.from("akquise_radar").update({ status: "uebernommen", lead_id: erg.id }).eq("id", id.data);
  revalidatePath("/akquise/radar");
  revalidatePath("/akquise/leads");
  return { erfolg: "Lead aus dem Inserat angelegt.", id: erg.id };
}

export async function radarStatus(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "radar_id"));
  const status = text(formular, "status");
  if (!id.success || !["neu", "verworfen"].includes(status)) return;
  const supabase = await serverClient();
  await supabase.from("akquise_radar").update({ status }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/akquise/radar");
}

// ---------------------------------------------------------------------------
// Kampagnen und Quellen
// ---------------------------------------------------------------------------

export async function kampagneSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const name = text(formular, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const art = ["online", "offline", "netzwerk", "tippgeber"].includes(text(formular, "art")) ? text(formular, "art") : "online";
  const supabase = await serverClient();
  const zeile = { name: name.slice(0, 160), art, kanal: optional(formular, "kanal"), budget: zahlOderNull(formular, "budget"), ausgaben: zahlOderNull(formular, "ausgaben") ?? 0, beginn: optional(formular, "beginn"), ende: optional(formular, "ende"), notiz: optional(formular, "notiz"), aktiv: text(formular, "aktiv") !== "0" };
  const id = uuidOderNull(formular, "id");
  const { error } = id
    ? await supabase.from("akquise_kampagnen").update(zeile).eq("id", id).eq("mandant_id", sitzung.mandantId)
    : await supabase.from("akquise_kampagnen").insert({ ...zeile, mandant_id: sitzung.mandantId, erstellt_von: sitzung.benutzerId });
  if (error) return { fehler: error.message.includes("zeitraum") ? "Das Ende liegt vor dem Beginn." : "Nicht gespeichert." };
  revalidatePath("/akquise/kampagnen");
  return { erfolg: id ? "Kampagne gespeichert." : "Kampagne angelegt." };
}

export async function kampagneLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "loeschen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("akquise_kampagnen").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/akquise/kampagnen");
}

export async function quelleSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const name = text(formular, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const art = ["online", "offline", "netzwerk", "tippgeber"].includes(text(formular, "art")) ? text(formular, "art") : "online";
  const supabase = await serverClient();
  const zeile = { name: name.slice(0, 120), art, kampagne_id: uuidOderNull(formular, "kampagne_id"), pipeline_id: uuidOderNull(formular, "pipeline_id"), aktiv: text(formular, "aktiv") !== "0" };
  const id = uuidOderNull(formular, "id");
  if (id) {
    const { error } = await supabase.from("akquise_quellen").update(zeile).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Nicht gespeichert." };
  } else {
    const { count } = await supabase.from("akquise_quellen").select("id", { count: "exact", head: true });
    const { error } = await supabase.from("akquise_quellen").insert({ ...zeile, mandant_id: sitzung.mandantId, sortierung: (count ?? 0) + 1 });
    if (error) return { fehler: "Nicht gespeichert." };
  }
  revalidatePath("/akquise/kampagnen");
  return { erfolg: id ? "Quelle gespeichert." : "Quelle angelegt." };
}

export async function quelleLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "loeschen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("akquise_quellen").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/akquise/kampagnen");
}

// ---------------------------------------------------------------------------
// Vorlagen, Automationen, Laeufe (Verwaltung)
// ---------------------------------------------------------------------------

export async function vorlageSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const name = text(formular, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const kanal = ["mail", "aufgabe", "whatsapp"].includes(text(formular, "kanal")) ? text(formular, "kanal") : "mail";
  const supabase = await serverClient();
  const zeile = { name: name.slice(0, 160), kanal, betreff: optional(formular, "betreff"), text: text(formular, "text").slice(0, 8000), aktiv: text(formular, "aktiv") !== "0" };
  const id = uuidOderNull(formular, "id");
  const { error } = id
    ? await supabase.from("akquise_vorlagen").update(zeile).eq("id", id).eq("mandant_id", sitzung.mandantId)
    : await supabase.from("akquise_vorlagen").insert({ ...zeile, mandant_id: sitzung.mandantId });
  if (error) return { fehler: "Nicht gespeichert (Verwaltungsrecht nötig)." };
  revalidatePath("/akquise/automationen");
  return { erfolg: "Vorlage gespeichert." };
}

export async function vorlageLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("akquise_vorlagen").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/akquise/automationen");
}

export async function automationSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const pipeline = uuidOderNull(formular, "pipeline_id");
  const stufe = uuidOderNull(formular, "stufe_id");
  if (!pipeline || !stufe) return { fehler: "Bitte Pipeline und Stufe wählen." };
  const kanal = ["mail", "aufgabe", "whatsapp"].includes(text(formular, "kanal")) ? text(formular, "kanal") : "mail";
  const supabase = await serverClient();
  const zeile = { name: optional(formular, "name"), pipeline_id: pipeline, stufe_id: stufe, quelle_id: uuidOderNull(formular, "quelle_id"), kanal, vorlage_id: uuidOderNull(formular, "vorlage_id"), verzoegerung_stunden: Math.max(0, Math.min(8760, Math.round(zahlOderNull(formular, "verzoegerung_stunden") ?? 0))), aktiv: text(formular, "aktiv") !== "0" };
  const id = uuidOderNull(formular, "id");
  const { error } = id
    ? await supabase.from("akquise_automationen").update(zeile).eq("id", id).eq("mandant_id", sitzung.mandantId)
    : await supabase.from("akquise_automationen").insert({ ...zeile, mandant_id: sitzung.mandantId });
  if (error) return { fehler: error.message.includes("gehoert nicht") ? "Stufe, Quelle oder Vorlage passen nicht zusammen." : "Nicht gespeichert (Verwaltungsrecht nötig)." };
  revalidatePath("/akquise/automationen");
  return { erfolg: "Automation gespeichert." };
}

export async function automationLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("akquise_automationen").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/akquise/automationen");
}

export async function laufAbbrechen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("akquise_laeufe").update({ status: "abgebrochen", fehler: "manuell abgebrochen", ausgefuehrt_am: new Date().toISOString() }).eq("id", id.data).eq("mandant_id", sitzung.mandantId).eq("status", "geplant");
  revalidatePath("/akquise/automationen");
}

// ---------------------------------------------------------------------------
// Pipelines, Stufen, Einstellungen (Verwaltung)
// ---------------------------------------------------------------------------

export async function pipelineSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const name = text(formular, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const supabase = await serverClient();
  const id = uuidOderNull(formular, "id");
  if (id) {
    const { error } = await supabase.from("akquise_pipelines").update({ name: name.slice(0, 120), beschreibung: optional(formular, "beschreibung"), ist_standard: text(formular, "ist_standard") === "1" }).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Nicht gespeichert (Verwaltungsrecht nötig)." };
    if (text(formular, "ist_standard") === "1") await supabase.from("akquise_pipelines").update({ ist_standard: false }).eq("mandant_id", sitzung.mandantId).neq("id", id);
  } else {
    const { count } = await supabase.from("akquise_pipelines").select("id", { count: "exact", head: true });
    const { data: p, error } = await supabase.from("akquise_pipelines").insert({ mandant_id: sitzung.mandantId, name: name.slice(0, 120), beschreibung: optional(formular, "beschreibung"), sortierung: (count ?? 0) + 1 }).select("id").single();
    if (error || !p) return { fehler: "Nicht gespeichert (Verwaltungsrecht nötig)." };
    await supabase.from("akquise_stufen").insert([
      { mandant_id: sitzung.mandantId, pipeline_id: p.id, name: "Neuer Lead", sortierung: 1, wahrscheinlichkeit: 10 },
      { mandant_id: sitzung.mandantId, pipeline_id: p.id, name: "In Bearbeitung", sortierung: 2, wahrscheinlichkeit: 50 },
      { mandant_id: sitzung.mandantId, pipeline_id: p.id, name: "Gewonnen", sortierung: 3, wahrscheinlichkeit: 100, ist_gewonnen: true },
      { mandant_id: sitzung.mandantId, pipeline_id: p.id, name: "Verloren", sortierung: 4, wahrscheinlichkeit: 0, ist_verloren: true },
    ]);
  }
  revalidatePath("/akquise/einstellungen");
  return { erfolg: "Pipeline gespeichert." };
}

export async function stufeSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const pipeline = uuidOderNull(formular, "pipeline_id");
  const name = text(formular, "name");
  if (!pipeline || !name) return { fehler: "Bitte Pipeline und Namen angeben." };
  const supabase = await serverClient();
  const art = text(formular, "art");
  const zeile = { name: name.slice(0, 120), zusatz: optional(formular, "zusatz"), wahrscheinlichkeit: Math.max(0, Math.min(100, Math.round(zahlOderNull(formular, "wahrscheinlichkeit") ?? 0))), ist_gewonnen: art === "gewonnen", ist_verloren: art === "verloren", sortierung: Math.round(zahlOderNull(formular, "sortierung") ?? 0) };
  const id = uuidOderNull(formular, "id");
  if (id) {
    const { error } = await supabase.from("akquise_stufen").update(zeile).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Nicht gespeichert." };
  } else {
    const { count } = await supabase.from("akquise_stufen").select("id", { count: "exact", head: true }).eq("pipeline_id", pipeline);
    const { error } = await supabase.from("akquise_stufen").insert({ ...zeile, sortierung: zeile.sortierung || (count ?? 0) + 1, mandant_id: sitzung.mandantId, pipeline_id: pipeline });
    if (error) return { fehler: "Nicht gespeichert." };
  }
  revalidatePath("/akquise/einstellungen");
  revalidatePath("/akquise/leads");
  return { erfolg: "Stufe gespeichert." };
}

export async function stufeLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  // Stufen mit Leads bleiben (Fremdschluessel restrict); Fehler wird still uebergangen
  await supabase.from("akquise_stufen").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/akquise/einstellungen");
}

export async function einstellungenSpeichern(_vorher: AkquiseErgebnis, formular: FormData): Promise<AkquiseErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const gruende = text(formular, "verlustgruende").split("\n").map((g) => g.trim()).filter(Boolean).slice(0, 30);
  const { error } = await supabase.from("akquise_einstellungen").upsert({
    mandant_id: sitzung.mandantId,
    provision_satz: Math.max(0, Math.min(20, zahlOderNull(formular, "provision_satz") ?? 3.57)),
    startpreis_faktor: Math.max(0.5, Math.min(1.5, zahlOderNull(formular, "startpreis_faktor") ?? 0.85)),
    spanne_prozent: Math.max(0, Math.min(50, zahlOderNull(formular, "spanne_prozent") ?? 10)),
    nachfassen_tage: Math.max(1, Math.min(365, Math.round(zahlOderNull(formular, "nachfassen_tage") ?? 7))),
    verlustgruende: gruende.length > 0 ? gruende : STANDARD_EINSTELLUNGEN.verlustgruende,
  });
  if (error) return { fehler: "Nicht gespeichert (Verwaltungsrecht nötig)." };
  revalidatePath("/akquise/einstellungen");
  return { erfolg: "Einstellungen gespeichert." };
}
