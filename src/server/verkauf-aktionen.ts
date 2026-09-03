"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { pdfText } from "@/lib/dokument/pdf-text";
import { bildAuslesen, strukturAuslesen } from "@/lib/ki/auslese";
import { kiVerfuegbar } from "@/lib/ki";
import { serverClient } from "@/lib/supabase/server";
import { MAKLERVERTRAG_FELDER, importZuFormular } from "@/lib/verkauf/import";
import { ANHANG_KATEGORIEN, fehlendeAngaben as laufzettelFehlt, laufzettelAusDaten, leererLaufzettel, notarAnschreiben, type Anhang, type Laufzettel } from "@/lib/verkauf/laufzettel";
import { fehlendeAngaben as protokollFehlt, leeresProtokoll, protokollAusZeile, type Kontext, type Protokoll, type Typ } from "@/lib/verkauf/uebergabe";
import {
  maklervertragSchema,
  maklervertragText,
  objektnachweisSchema,
  objektnachweisText,
  provisionsWarnung,
  vertragsTitel,
  vollmachtText,
  type Auftraggeberfirma,
  type MaklervertragDaten,
} from "@/lib/verkauf/vorlagen";

/**
 * Verkauf (docs/FUNKTIONSABGLEICH.md V1/V2): Vertraege aus Vorlagen,
 * Vertragsimport per KI, Uebergabeprotokolle, Notar-Laufzettel.
 *
 * KI-Ergebnisse gehen immer in ein editierbares Formular; Credits werden
 * reserviert, eingeloest oder bei Fehlern freigegeben (Abschnitt 14).
 */

export interface VerkaufErgebnis {
  fehler?: string;
  erfolg?: string;
  warnung?: string;
  id?: string;
  /** Import: vorbelegtes Formular */
  formular?: MaklervertragDaten;
  hinweis?: string;
  kiVerwendet?: boolean;
  quelle?: string;
  originalPfad?: string;
  /** Zaehlerfoto */
  werte?: Record<string, string | null>;
  fotoPfad?: string;
  /** Anschreiben */
  betreff?: string;
  text?: string;
}

/** Verlaufseintrag am Objekt (Tabelle aktivitaeten). */
async function verlaufEintragen(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  e: { mandantId: string; benutzerId: string; objektId: string; typ: "sonstiges"; titel: string },
): Promise<void> {
  await supabase.from("aktivitaeten").insert({
    mandant_id: e.mandantId,
    objekt_id: e.objektId,
    typ: e.typ,
    beschreibung: e.titel,
    benutzer_id: e.benutzerId,
  });
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

function jsonFeld(formular: FormData, feld: string): unknown {
  try {
    return JSON.parse(String(formular.get(feld) ?? "{}"));
  } catch {
    return null;
  }
}

async function firmaLaden(sitzung: Sitzung): Promise<Auftraggeberfirma> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from("mandant_branding")
    .select("firmenname, geschaeftsfuehrer, strasse, hausnummer, plz, ort")
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  return {
    firmenname: (data?.firmenname as string | null) ?? sitzung.mandantName,
    strasse: (data?.strasse as string | null) ?? "",
    hausnummer: (data?.hausnummer as string | null) ?? "",
    plz: (data?.plz as string | null) ?? "",
    ort: (data?.ort as string | null) ?? "",
    vertreter: (data?.geschaeftsfuehrer as string | null) ?? "",
  };
}

function vorgangsPfad(mandantId: string, ordner: string, id: string, dateiname: string): string {
  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "bin";
  const sicher = /^[a-z0-9]{1,5}$/.test(endung) ? endung : "bin";
  return `${mandantId}/vorgaenge/${ordner}/${id}/${randomUUID()}.${sicher}`;
}

const MAX_DATEI = 25 * 1024 * 1024;

async function dateiHochladen(pfad: string, datei: File): Promise<string | null> {
  if (datei.size === 0 || datei.size > MAX_DATEI) return null;
  const supabase = await serverClient();
  const { error } = await supabase.storage.from(DOKUMENT_BUCKET).upload(pfad, Buffer.from(await datei.arrayBuffer()), { contentType: datei.type || "application/octet-stream", upsert: false });
  return error ? null : pfad;
}

// ---------------------------------------------------------------------------
// Vertraege aus Vorlagen
// ---------------------------------------------------------------------------

export async function maklervertragAnlegen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);

  const geprueft = maklervertragSchema.safeParse(jsonFeld(formular, "daten"));
  if (!geprueft.success) return { fehler: `Bitte die Angaben prüfen: ${geprueft.error.issues[0]?.message ?? "unvollständig"}.` };
  const d = geprueft.data;
  const warnung = provisionsWarnung(d);
  if (warnung && text(formular, "trotzdem") !== "1") return { fehler: warnung };

  const firma = await firmaLaden(sitzung);
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const kontaktId = z.uuid().safeParse(text(formular, "kontakt_id"));
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("vertraege")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId.success ? objektId.data : null,
      kontakt_id: kontaktId.success ? kontaktId.data : null,
      art: "maklervertrag",
      titel: vertragsTitel("maklervertrag", d.objekt),
      inhalt: maklervertragText(d, firma),
      daten: d,
      vollmacht_mitgenerieren: d.vollmacht_mitgenerieren,
      verbraucher: d.verbraucher,
      quelle: text(formular, "original_pfad") ? "import" : "vorlage",
      original_pfad: text(formular, "original_pfad") || null,
      geschlossen_am: text(formular, "geschlossen_am") || null,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !data) return { fehler: "Der Vertrag konnte nicht angelegt werden." };

  if (d.vollmacht_mitgenerieren) {
    await supabase.from("vertraege").insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId.success ? objektId.data : null,
      kontakt_id: kontaktId.success ? kontaktId.data : null,
      art: "vollmacht",
      titel: vertragsTitel("vollmacht", d.objekt),
      inhalt: vollmachtText(d, firma),
      daten: { ...d, zu_vertrag_id: data.id },
      verbraucher: d.verbraucher,
      quelle: "vorlage",
      erstellt_von: sitzung.benutzerId,
    });
  }
  if (objektId.success) {
    await verlaufEintragen(supabase, { mandantId: sitzung.mandantId, benutzerId: sitzung.benutzerId, objektId: objektId.data, typ: "sonstiges", titel: `Maklervertrag angelegt${d.vollmacht_mitgenerieren ? " (mit Vollmacht)" : ""}` });
  }
  revalidatePath("/vertraege");
  redirect(`/vertraege/${data.id}`);
}

export async function objektnachweisAnlegen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);

  const geprueft = objektnachweisSchema.safeParse(jsonFeld(formular, "daten"));
  if (!geprueft.success) return { fehler: `Bitte die Angaben prüfen: ${geprueft.error.issues[0]?.message ?? "unvollständig"}.` };
  const d = geprueft.data;
  const firma = await firmaLaden(sitzung);
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const kontaktId = z.uuid().safeParse(text(formular, "kontakt_id"));
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("vertraege")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId.success ? objektId.data : null,
      kontakt_id: kontaktId.success ? kontaktId.data : null,
      art: "objektnachweis",
      titel: vertragsTitel("objektnachweis", d.objekt),
      inhalt: objektnachweisText(d, firma),
      daten: d,
      verbraucher: d.verbraucher,
      quelle: "vorlage",
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !data) return { fehler: "Der Objektnachweis konnte nicht angelegt werden." };
  if (objektId.success) {
    await verlaufEintragen(supabase, { mandantId: sitzung.mandantId, benutzerId: sitzung.benutzerId, objektId: objektId.data, typ: "sonstiges", titel: `Objektnachweis angelegt: ${d.kaeufer.map((k) => k.name).join(", ")}` });
  }
  revalidatePath("/vertraege");
  redirect(`/vertraege/${data.id}`);
}

/** Bestehenden Maklervertrag (PDF) auslesen — Ergebnis ist ein vorbelegtes Formular. */
export async function vertragImportieren(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);

  const datei = formular.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return { fehler: "Bitte eine PDF-Datei auswählen." };
  if (datei.type !== "application/pdf" && !datei.name.toLowerCase().endsWith(".pdf")) return { fehler: "Nur PDF-Dateien lassen sich auslesen." };
  if (datei.size > MAX_DATEI) return { fehler: "Die Datei ist größer als 25 MB." };

  const puffer = Buffer.from(await datei.arrayBuffer());
  let inhalt = "";
  try {
    inhalt = await pdfText(puffer);
  } catch {
    return { fehler: "Die PDF-Datei konnte nicht gelesen werden. Ist sie beschädigt oder gescannt (nur Bild)?" };
  }
  if (inhalt.trim().length < 50) return { fehler: "In der Datei wurde kein Text gefunden — bei gescannten Verträgen bitte die Angaben von Hand erfassen." };

  const supabase = await serverClient();
  const originalId = randomUUID();
  const originalPfad = await dateiHochladen(vorgangsPfad(sitzung.mandantId, "vertraege", originalId, datei.name), datei);

  const mitKi = kiVerfuegbar() && text(formular, "mit_ki") !== "0";
  let vorgang: string | null = null;
  if (mitKi) {
    const { data, error } = await supabase.rpc("credits_reservieren", { p_aktion: "ki_dokument_import", p_referenz_art: "vertrag_import", p_referenz_id: originalId });
    if (error) return { fehler: `Kein KI-Import möglich: ${error.message}` };
    vorgang = data as string;
  }
  try {
    const ergebnis = await strukturAuslesen({ zweck: "maklervertrag", text: inhalt, felder: MAKLERVERTRAG_FELDER, credits: 5 });
    if (vorgang) await supabase.rpc("credits_einloesen", { p_vorgang: vorgang, p_kosten_cent: ergebnis.kostenCent });
    const formularDaten = importZuFormular(ergebnis.werte);
    return {
      erfolg: ergebnis.kiVerwendet ? "Der Vertrag wurde ausgelesen — bitte alle Felder prüfen, bevor Sie ihn anlegen." : "Einfache Mustererkennung ohne KI — bitte alle Felder prüfen.",
      formular: formularDaten,
      hinweis: ergebnis.hinweis,
      kiVerwendet: ergebnis.kiVerwendet,
      quelle: ergebnis.quelle,
      ...(originalPfad ? { originalPfad } : {}),
      werte: ergebnis.werte,
    };
  } catch (e) {
    if (vorgang) await supabase.rpc("credits_freigeben", { p_vorgang: vorgang, p_grund: (e instanceof Error ? e.message : "Fehler").slice(0, 200) });
    return { fehler: `Die Auslesung ist fehlgeschlagen — ${e instanceof Error ? e.message : "unbekannter Fehler"}` };
  }
}

// ---------------------------------------------------------------------------
// Uebergabeprotokolle
// ---------------------------------------------------------------------------

export async function uebergabeAnlegen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const kontext = text(formular, "kontext") as Kontext;
  const typ = text(formular, "typ") as Typ;
  if (!["verkauf", "vermietung"].includes(kontext) || !["uebergabe", "rueckgabe", "einzug", "auszug"].includes(typ)) return { fehler: "Bitte Art des Protokolls wählen." };

  const supabase = await serverClient();
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const vertragId = z.uuid().safeParse(text(formular, "vertrag_id"));
  const p = leeresProtokoll(kontext, typ);
  if (objektId.success) {
    const { data: o } = await supabase.from("objekte").select("bezeichnung, strasse, hausnummer, plz, ort, etage").eq("id", objektId.data).maybeSingle();
    if (o) {
      p.objekt.adresse = [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      p.objekt.etage = (o.etage as string | null) ?? "";
      p.bezeichnung = `${typ === "uebergabe" || typ === "einzug" ? "Übergabe" : "Rückgabe"} ${o.bezeichnung as string}`;
    }
  }
  if (vertragId.success) {
    const { data: v } = await supabase.from("vertraege").select("daten, art").eq("id", vertragId.data).maybeSingle();
    const daten = (v?.daten ?? {}) as Partial<MaklervertragDaten> & { kaeufer?: { name: string; strasse?: string; plz?: string; ort?: string }[] };
    const erste = daten.personen?.[0];
    if (erste && kontext === "verkauf") Object.assign(typ === "uebergabe" ? p.uebergeber : p.uebernehmer, { name: erste.name, strasse: erste.strasse ?? "", plz: erste.plz ?? "", ort: erste.ort ?? "" });
    const kaeufer = daten.kaeufer?.[0];
    if (kaeufer && kontext === "verkauf") Object.assign(typ === "uebergabe" ? p.uebernehmer : p.uebergeber, { name: kaeufer.name, strasse: kaeufer.strasse ?? "", plz: kaeufer.plz ?? "", ort: kaeufer.ort ?? "" });
  }
  const { data, error } = await supabase
    .from("uebergabeprotokolle")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId.success ? objektId.data : null,
      vertrag_id: vertragId.success ? vertragId.data : null,
      kontext, typ,
      bezeichnung: p.bezeichnung || `${typ} ${new Date().toLocaleDateString("de-DE")}`,
      uebergeber: p.uebergeber, uebernehmer: p.uebernehmer, objekt: p.objekt,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !data) return { fehler: "Das Protokoll konnte nicht angelegt werden." };
  revalidatePath("/uebergaben");
  redirect(`/uebergaben/${data.id}`);
}

const protokollSchema = z.object({
  bezeichnung: z.string().trim().min(1).max(200),
  datum: z.string().nullable(),
  uhrzeit: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/).nullable(),
  uebergeber: z.object({ name: z.string().max(200), strasse: z.string().max(200), plz: z.string().max(10), ort: z.string().max(120), anwesend: z.boolean(), vertreter: z.string().max(200) }),
  uebernehmer: z.object({ name: z.string().max(200), strasse: z.string().max(200), plz: z.string().max(10), ort: z.string().max(120), anwesend: z.boolean(), vertreter: z.string().max(200) }),
  objekt: z.object({ adresse: z.string().max(300), etage: z.string().max(60), lage: z.string().max(60) }),
  schluessel: z.array(z.object({ id: z.string(), art: z.string().max(40), anzahl: z.number().int().min(0).max(99), bemerkung: z.string().max(300) })).max(50),
  zaehler: z.array(z.object({ id: z.string(), art: z.string().max(40), nummer: z.string().max(60), stand: z.string().max(30), einheit: z.string().max(10), foto_pfad: z.string().nullable(), ki_gelesen: z.boolean() })).max(30),
  raeume: z.array(z.object({ id: z.string(), name: z.string().max(80), zustand: z.string().max(30), maengel: z.string().max(2000), foto_pfade: z.array(z.string()).max(20) })).max(60),
  sonstiges: z.object({
    rauchmelder_anzahl: z.number().int().min(0).max(99).nullable(),
    rauchmelder_funktion: z.enum(["ja", "nein", "nicht_geprueft"]),
    schimmel: z.enum(["nein", "ja", "nicht_geprueft"]),
    schimmel_wo: z.string().max(300),
    hausordnung_uebergeben: z.boolean(),
    anleitungen_uebergeben: z.boolean(),
    sonderabreden: z.string().max(4000),
  }),
  unterschriften: z.object({
    uebergeber: z.object({ name: z.string().max(200), bild: z.string().max(400_000).nullable(), zeit: z.string().nullable() }).nullable(),
    uebernehmer: z.object({ name: z.string().max(200), bild: z.string().max(400_000).nullable(), zeit: z.string().nullable() }).nullable(),
  }),
});

export async function uebergabeSpeichern(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekanntes Protokoll." };
  const geprueft = protokollSchema.safeParse(jsonFeld(formular, "protokoll"));
  if (!geprueft.success) return { fehler: `Bitte die Angaben prüfen: ${geprueft.error.issues[0]?.path.join(".") ?? ""} ${geprueft.error.issues[0]?.message ?? ""}`.trim() };
  const p = geprueft.data;
  const supabase = await serverClient();
  const { error } = await supabase
    .from("uebergabeprotokolle")
    .update({
      bezeichnung: p.bezeichnung, datum: p.datum || null, uhrzeit: p.uhrzeit,
      uebergeber: p.uebergeber, uebernehmer: p.uebernehmer, objekt: p.objekt,
      schluessel: p.schluessel, zaehler: p.zaehler, raeume: p.raeume, sonstiges: p.sonstiges, unterschriften: p.unterschriften,
    })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: error.message.includes("abgeschlossen") ? "Ein abgeschlossenes Protokoll lässt sich nicht mehr ändern." : "Nicht gespeichert." };
  revalidatePath(`/uebergaben/${id.data}`);
  return { erfolg: "Gespeichert." };
}

export async function uebergabeAbschliessen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekanntes Protokoll." };
  const supabase = await serverClient();
  const { data } = await supabase.from("uebergabeprotokolle").select("*").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!data) return { fehler: "Unbekanntes Protokoll." };
  const p: Protokoll = protokollAusZeile(data as Record<string, unknown>);
  const fehlt = protokollFehlt(p);
  if (fehlt.length > 0) return { fehler: `Noch nicht vollständig: ${fehlt.join(", ")}.` };
  const { error } = await supabase
    .from("uebergabeprotokolle")
    .update({ status: "abgeschlossen", abgeschlossen_am: new Date().toISOString() })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Der Abschluss ist fehlgeschlagen." };
  if (data.objekt_id) {
    await verlaufEintragen(supabase, { mandantId: sitzung.mandantId, benutzerId: sitzung.benutzerId, objektId: data.objekt_id as string, typ: "sonstiges", titel: `Übergabeprotokoll abgeschlossen: ${p.bezeichnung}` });
  }
  revalidatePath(`/uebergaben/${id.data}`);
  revalidatePath("/uebergaben");
  return { erfolg: "Protokoll abgeschlossen. PDF und Word stehen zum Herunterladen bereit." };
}

export async function uebergabeLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "loeschen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("uebergabeprotokolle").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId).eq("status", "entwurf");
  revalidatePath("/uebergaben");
  redirect("/uebergaben");
}

/** Foto eines Zaehlers ablegen und (wenn moeglich) auslesen. */
export async function zaehlerFotoAuslesen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekanntes Protokoll." };
  const datei = formular.get("foto");
  if (!(datei instanceof File) || datei.size === 0) return { fehler: "Bitte ein Foto auswählen." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(datei.type)) return { fehler: "Nur JPEG, PNG oder WebP." };
  if (datei.size > 12 * 1024 * 1024) return { fehler: "Das Foto ist größer als 12 MB." };

  const pfad = await dateiHochladen(vorgangsPfad(sitzung.mandantId, "uebergaben", id.data, datei.name), datei);
  if (!pfad) return { fehler: "Das Foto konnte nicht gespeichert werden." };

  const supabase = await serverClient();
  const mitKi = kiVerfuegbar() && text(formular, "mit_ki") !== "0";
  let vorgang: string | null = null;
  if (mitKi) {
    const { data, error } = await supabase.rpc("credits_reservieren", { p_aktion: "ki_bild_auslesen", p_referenz_art: "uebergabe", p_referenz_id: id.data });
    if (error) return { fehler: `Foto gespeichert, aber keine Auslesung möglich: ${error.message}`, fotoPfad: pfad, werte: {} };
    vorgang = data as string;
  }
  try {
    const bildBase64 = Buffer.from(await datei.arrayBuffer()).toString("base64");
    const ergebnis = await bildAuslesen({ zweck: "zaehlerstand", bildBase64, mime: datei.type, credits: 1 });
    if (vorgang) await supabase.rpc("credits_einloesen", { p_vorgang: vorgang, p_kosten_cent: ergebnis.kostenCent });
    return { erfolg: ergebnis.kiVerwendet ? "Foto gespeichert und ausgelesen — bitte die Werte prüfen." : ergebnis.hinweis, fotoPfad: pfad, werte: ergebnis.werte, kiVerwendet: ergebnis.kiVerwendet, hinweis: ergebnis.hinweis };
  } catch (e) {
    if (vorgang) await supabase.rpc("credits_freigeben", { p_vorgang: vorgang, p_grund: (e instanceof Error ? e.message : "Fehler").slice(0, 200) });
    return { fehler: `Foto gespeichert, Auslesung fehlgeschlagen — ${e instanceof Error ? e.message : "unbekannter Fehler"}`, fotoPfad: pfad, werte: {} };
  }
}

// ---------------------------------------------------------------------------
// Notar-Laufzettel
// ---------------------------------------------------------------------------

export async function laufzettelAnlegen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const vertragId = z.uuid().safeParse(text(formular, "vertrag_id"));
  const nachweisId = z.uuid().safeParse(text(formular, "objektnachweis_id"));
  const l = leererLaufzettel();
  let bezeichnung = text(formular, "bezeichnung");

  if (objektId.success) {
    const { data: o } = await supabase.from("objekte").select("bezeichnung, strasse, hausnummer, plz, ort, wohnflaeche, grundstuecksflaeche, objektkategorie, kaufpreis").eq("id", objektId.data).maybeSingle();
    if (o) {
      l.immobilie.anschrift = [o.strasse, o.hausnummer].filter(Boolean).join(" ");
      l.immobilie.plz = (o.plz as string | null) ?? "";
      l.immobilie.ort = (o.ort as string | null) ?? "";
      l.immobilie.groesse_qm = o.grundstuecksflaeche ? String(o.grundstuecksflaeche) : "";
      l.immobilie.wohnungseigentum = o.objektkategorie === "wohnung";
      if (o.kaufpreis) l.kaufpreis.gesamt = String(o.kaufpreis);
      bezeichnung ||= `Laufzettel ${o.bezeichnung as string}`;
    }
  }
  if (vertragId.success) {
    const { data: v } = await supabase.from("vertraege").select("daten").eq("id", vertragId.data).maybeSingle();
    const d = (v?.daten ?? {}) as Partial<MaklervertragDaten>;
    if (d.personen?.length) {
      l.verkaeufer = d.personen.map((p) => ({ ...l.verkaeufer[0]!, art: d.verkaeufer_typ === "firma" ? "gesellschaft" : "privat", anrede: p.anrede ?? "", nachname: p.name, strasse: p.strasse ?? "", plz: p.plz ?? "", ort: p.ort ?? "", email: p.email ?? "", gesellschaft_name: d.verkaeufer_typ === "firma" ? d.firma?.name ?? "" : "" }));
    }
    if (d.angebotspreis && !l.kaufpreis.gesamt) l.kaufpreis.gesamt = String(d.angebotspreis);
    if (d.provision_prozent) {
      l.sonstiges.makler_provision_verkaeufer = d.provisionsmodell === "kaeufer" ? "0 %" : `${d.provisionsmodell === "teilung" ? d.provision_prozent / 2 : d.provision_prozent} %`;
      l.sonstiges.makler_provision_kaeufer = d.provisionsmodell === "verkaeufer" ? "0 %" : `${d.provisionsmodell === "teilung" ? d.provision_prozent / 2 : d.provision_prozent} %`;
    }
  }
  if (nachweisId.success) {
    const { data: n } = await supabase.from("vertraege").select("daten").eq("id", nachweisId.data).maybeSingle();
    const d = (n?.daten ?? {}) as { kaeufer?: { anrede?: string; name: string; strasse?: string; plz?: string; ort?: string; email?: string }[] };
    if (d.kaeufer?.length) {
      l.kaeufer = d.kaeufer.map((p) => ({ ...l.kaeufer[0]!, anrede: p.anrede ?? "", nachname: p.name, strasse: p.strasse ?? "", plz: p.plz ?? "", ort: p.ort ?? "", email: p.email ?? "" }));
    }
  }
  l.beauftragung.ausfueller_name = sitzung.name;
  l.beauftragung.ausfueller_email = sitzung.email;

  const { data, error } = await supabase
    .from("notar_laufzettel")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId.success ? objektId.data : null,
      vertrag_id: vertragId.success ? vertragId.data : null,
      objektnachweis_id: nachweisId.success ? nachweisId.data : null,
      bezeichnung: bezeichnung || `Laufzettel ${new Date().toLocaleDateString("de-DE")}`,
      daten: l,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !data) return { fehler: "Der Laufzettel konnte nicht angelegt werden." };
  revalidatePath("/notar");
  redirect(`/notar/${data.id}`);
}

export async function laufzettelSpeichern(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Laufzettel." };
  const roh = jsonFeld(formular, "daten");
  if (!roh || typeof roh !== "object") return { fehler: "Die Angaben konnten nicht gelesen werden." };
  const daten: Laufzettel = laufzettelAusDaten(roh);
  const bezeichnung = text(formular, "bezeichnung").slice(0, 200);
  const supabase = await serverClient();
  const { error } = await supabase
    .from("notar_laufzettel")
    .update({ daten, ...(bezeichnung ? { bezeichnung } : {}) })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Nicht gespeichert." };
  revalidatePath(`/notar/${id.data}`);
  return { erfolg: "Gespeichert." };
}

export async function laufzettelStatus(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const status = text(formular, "status");
  if (!id.success || !["entwurf", "bereit", "versendet", "abgeschlossen"].includes(status)) return { fehler: "Ungültige Angabe." };
  const supabase = await serverClient();
  if (status !== "entwurf") {
    const { data } = await supabase.from("notar_laufzettel").select("daten").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
    const fehlt = laufzettelFehlt(laufzettelAusDaten(data?.daten));
    if (fehlt.length > 0) return { fehler: `Noch nicht vollständig: ${fehlt.join(", ")}.` };
  }
  const { error } = await supabase
    .from("notar_laufzettel")
    .update({
      status,
      ...(status === "versendet" ? { versendet_am: new Date().toISOString() } : {}),
      ...(status === "abgeschlossen" ? { abgeschlossen_am: new Date().toISOString() } : {}),
    })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Der Status konnte nicht geändert werden." };
  revalidatePath(`/notar/${id.data}`);
  revalidatePath("/notar");
  return { erfolg: "Status geändert." };
}

export async function laufzettelAnhangHochladen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Laufzettel." };
  const datei = formular.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return { fehler: "Bitte eine Datei auswählen." };
  const kategorie = text(formular, "kategorie");
  if (!(kategorie in ANHANG_KATEGORIEN)) return { fehler: "Bitte eine Kategorie wählen." };
  const pfad = await dateiHochladen(vorgangsPfad(sitzung.mandantId, "notar", id.data, datei.name), datei);
  if (!pfad) return { fehler: "Die Datei konnte nicht gespeichert werden (max. 25 MB)." };

  const supabase = await serverClient();
  let auswertung: string | null = null;
  const mitKi = kiVerfuegbar() && text(formular, "mit_ki") === "1" && (datei.type === "application/pdf");
  if (mitKi) {
    const { data: vorgangRoh, error } = await supabase.rpc("credits_reservieren", { p_aktion: "ki_dokument_import", p_referenz_art: "notar_anhang", p_referenz_id: id.data });
    if (!error && vorgangRoh) {
      const vorgang = vorgangRoh as string;
      try {
        const inhalt = await pdfText(Buffer.from(await datei.arrayBuffer()));
        const felder = kategorie === "grundbuchauszug"
          ? [
              { schluessel: "grundbuch_amt", beschreibung: "Amtsgericht / Grundbuchamt" },
              { schluessel: "grundbuch_blatt", beschreibung: "Grundbuchblatt-Nummer" },
              { schluessel: "gemarkung", beschreibung: "Gemarkung" },
              { schluessel: "flur", beschreibung: "Flur" },
              { schluessel: "flurstueck", beschreibung: "Flurstück" },
              { schluessel: "eigentuemer", beschreibung: "Eingetragene Eigentümer (Abteilung I)" },
              { schluessel: "lasten", beschreibung: "Eingetragene Lasten und Beschränkungen (Abteilung II) in Kurzform" },
              { schluessel: "grundschulden", beschreibung: "Grundschulden und Hypotheken (Abteilung III) mit Beträgen" },
            ]
          : [
              { schluessel: "zusammenfassung", beschreibung: "Kurze Zusammenfassung des Dokuments in zwei Sätzen" },
              { schluessel: "datum", beschreibung: "Datum des Dokuments" },
              { schluessel: "aussteller", beschreibung: "Aussteller / Behörde" },
            ];
        const ergebnis = await strukturAuslesen({ zweck: "notar_anhang", text: inhalt, felder, credits: 5 });
        await supabase.rpc("credits_einloesen", { p_vorgang: vorgang, p_kosten_cent: ergebnis.kostenCent });
        auswertung = Object.entries(ergebnis.werte).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") || null;
      } catch (e) {
        await supabase.rpc("credits_freigeben", { p_vorgang: vorgang, p_grund: (e instanceof Error ? e.message : "Fehler").slice(0, 200) });
      }
    }
  }
  const { data: zeile } = await supabase.from("notar_laufzettel").select("anhaenge").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  const vorhanden = (Array.isArray(zeile?.anhaenge) ? zeile.anhaenge : []) as Anhang[];
  const neu: Anhang = { id: randomUUID(), name: datei.name.slice(0, 200), pfad, mime: datei.type, bytes: datei.size, kategorie, ki_auswertung: auswertung, hochgeladen_am: new Date().toISOString() };
  const { error } = await supabase.from("notar_laufzettel").update({ anhaenge: [...vorhanden, neu] }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Der Anhang wurde hochgeladen, aber nicht vermerkt." };
  revalidatePath(`/notar/${id.data}`);
  return { erfolg: auswertung ? "Anhang gespeichert und ausgewertet — bitte die Angaben in den Schritten prüfen." : "Anhang gespeichert." };
}

export async function laufzettelAnhangLoeschen(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const anhangId = text(formular, "anhang_id");
  if (!id.success || !anhangId) return { fehler: "Unbekannter Anhang." };
  const supabase = await serverClient();
  const { data: zeile } = await supabase.from("notar_laufzettel").select("anhaenge").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  const vorhanden = (Array.isArray(zeile?.anhaenge) ? zeile.anhaenge : []) as Anhang[];
  const weg = vorhanden.find((a) => a.id === anhangId);
  if (!weg) return { fehler: "Unbekannter Anhang." };
  await supabase.storage.from(DOKUMENT_BUCKET).remove([weg.pfad]);
  await supabase.from("notar_laufzettel").update({ anhaenge: vorhanden.filter((a) => a.id !== anhangId) }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath(`/notar/${id.data}`);
  return { erfolg: "Anhang entfernt." };
}

/** Begleitschreiben an das Notariat als Text (zum Kopieren oder fuer das Postfach). */
export async function laufzettelAnschreiben(_vorher: VerkaufErgebnis, formular: FormData): Promise<VerkaufErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Laufzettel." };
  const supabase = await serverClient();
  const [{ data }, firma] = await Promise.all([
    supabase.from("notar_laufzettel").select("daten").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle(),
    firmaLaden(sitzung),
  ]);
  if (!data) return { fehler: "Unbekannter Laufzettel." };
  const l = laufzettelAusDaten(data.daten);
  const a = notarAnschreiben(l, { name: l.beauftragung.ausfueller_name || sitzung.name, firma: firma.firmenname, telefon: l.beauftragung.ausfueller_telefon, email: l.beauftragung.ausfueller_email || sitzung.email });
  return { betreff: a.betreff, text: a.text };
}

export async function laufzettelLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "loeschen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  const { data } = await supabase.from("notar_laufzettel").select("anhaenge").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  const pfade = ((Array.isArray(data?.anhaenge) ? data.anhaenge : []) as Anhang[]).map((a) => a.pfad);
  if (pfade.length > 0) await supabase.storage.from(DOKUMENT_BUCKET).remove(pfade);
  await supabase.from("notar_laufzettel").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/notar");
  redirect("/notar");
}
