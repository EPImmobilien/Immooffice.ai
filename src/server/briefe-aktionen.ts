"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { briefDokumentLaden, pdfFestschreiben } from "@/lib/dokument/erzeugen";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { anredeZeile, briefAusfuellen, BRIEF_VORLAGEN } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";
import { absenderVorbereiten } from "@/server/rechnungen-aktionen";

/**
 * Geschaeftsbriefe auf Briefpapier (docs/FUNKTIONSABGLEICH.md Kachel 14):
 * Vorlagen fuer Behoerden- und Eigentuemerschreiben, Empfaenger aus Kontakt,
 * Objektbezug fuer Platzhalter, PDF mit Briefkopf, Versand ueber das Postfach.
 */

export interface BriefErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function optional(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return w === "" ? null : w;
}
function uuid(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return z.uuid().safeParse(w).success ? w : null;
}

export async function briefAnlegen(_vorher: BriefErgebnis, formular: FormData): Promise<BriefErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  await absenderVorbereiten();
  const vorlageKey = text(formular, "vorlage");
  const vorlage = BRIEF_VORLAGEN[vorlageKey] ?? BRIEF_VORLAGEN["frei"];
  const kontaktId = uuid(formular, "kontakt_id");
  const objektId = uuid(formular, "objekt_id");
  const absenderId = uuid(formular, "absender_id");

  const [{ data: k }, { data: o }, { data: a }, { data: firma }] = await Promise.all([
    kontaktId ? supabase.from("kontakte").select("anrede, titel, vorname, nachname, firma, strasse, hausnummer, plz, ort, email").eq("id", kontaktId).eq("mandant_id", sitzung.mandantId).maybeSingle() : Promise.resolve({ data: null }),
    objektId ? supabase.from("objekte").select("objektnummer, bezeichnung, strasse, hausnummer, plz, ort").eq("id", objektId).eq("mandant_id", sitzung.mandantId).maybeSingle() : Promise.resolve({ data: null }),
    absenderId ? supabase.from("rechnungs_absender").select("id, name").eq("id", absenderId).maybeSingle() : supabase.from("rechnungs_absender").select("id, name").eq("aktiv", true).order("typ").order("sortierung").limit(1).maybeSingle(),
    supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);

  const person = k ? [k.titel, k.vorname, k.nachname].filter(Boolean).join(" ") : "";
  const empfaengerName = k ? ((k.firma as string | null) || person) : (vorlage?.empfaenger ?? "");
  const adresse = o ? [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const objektText = o ? `${o.objektnummer} ${o.bezeichnung}${adresse ? ` (${adresse})` : ""}` : "";
  // Eigentuemer aus der Objektakte fuer Behoerdenschreiben
  let eigentuemer = k && !vorlage?.gruppe.startsWith("behoerde") ? person || (k.firma as string) : "";
  if (objektId && !eigentuemer) {
    const { data: e } = await supabase.from("kontakt_objekt").select("kontakt:kontakte(vorname, nachname, firma)").eq("objekt_id", objektId).eq("rolle", "eigentuemer").limit(3);
    eigentuemer = (e ?? []).map((z) => { const kk = z.kontakt as unknown as { vorname: string | null; nachname: string | null; firma: string | null } | null; return kk ? [kk.vorname, kk.nachname].filter(Boolean).join(" ") || kk.firma || "" : ""; }).filter(Boolean).join(", ");
  }
  const ausgefuellt = vorlage ? briefAusfuellen(vorlage, { objekt: objektText || "der Immobilie", adresse: adresse || "…", gemarkung: "…", flurstueck: "…", eigentuemer: eigentuemer || "…", firma: (firma?.firmenname as string | null) ?? sitzung.mandantName, absender: sitzung.name, datum: new Date().toLocaleDateString("de-DE") }) : { betreff: "", text: "" };

  const { data: b, error } = await supabase
    .from("briefe")
    .insert({
      mandant_id: sitzung.mandantId,
      absender_id: a?.id ?? null,
      kontakt_id: kontaktId,
      objekt_id: objektId,
      vorlage: vorlageKey || null,
      empfaenger_name: (empfaengerName || "Empfänger").slice(0, 200),
      empfaenger_zusatz: k?.firma && person ? person : null,
      empfaenger_strasse: k ? [k.strasse, k.hausnummer].filter(Boolean).join(" ") || null : null,
      empfaenger_plz: (k?.plz as string | null) ?? null,
      empfaenger_ort: (k?.ort as string | null) ?? null,
      empfaenger_email: (k?.email as string | null) ?? null,
      betreff: (ausgefuellt.betreff || "Betreff").slice(0, 300),
      anrede: k ? anredeZeile((k.anrede as string | null) ?? null, (k.nachname as string | null) ?? person) : "Sehr geehrte Damen und Herren,",
      text: ausgefuellt.text,
      unterzeichner: sitzung.name,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !b) return { fehler: "Der Brief konnte nicht angelegt werden." };
  revalidatePath("/briefe");
  redirect(`/briefe/${b.id}`);
}

export async function briefSpeichern(_vorher: BriefErgebnis, formular: FormData): Promise<BriefErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Brief." };
  const felder = {
    absender_id: uuid(formular, "absender_id"),
    kontakt_id: uuid(formular, "kontakt_id"),
    objekt_id: uuid(formular, "objekt_id"),
    empfaenger_name: text(formular, "empfaenger_name").slice(0, 200),
    empfaenger_zusatz: optional(formular, "empfaenger_zusatz"),
    empfaenger_strasse: optional(formular, "empfaenger_strasse"),
    empfaenger_plz: optional(formular, "empfaenger_plz"),
    empfaenger_ort: optional(formular, "empfaenger_ort"),
    empfaenger_email: optional(formular, "empfaenger_email")?.toLowerCase() ?? null,
    datum: /^\d{4}-\d{2}-\d{2}$/.test(text(formular, "datum")) ? text(formular, "datum") : new Date().toISOString().slice(0, 10),
    betreff: text(formular, "betreff").slice(0, 300),
    anrede: text(formular, "anrede") || "Sehr geehrte Damen und Herren,",
    text: String(formular.get("text") ?? "").replace(/\r\n?/g, "\n").trim(),
    grussformel: text(formular, "grussformel") || "Mit freundlichen Grüßen",
    unterzeichner: optional(formular, "unterzeichner"),
    unterzeichner_funktion: optional(formular, "unterzeichner_funktion"),
  };
  if (!felder.empfaenger_name) return { fehler: "Bitte einen Empfänger angeben." };
  if (!felder.betreff) return { fehler: "Bitte einen Betreff angeben." };
  const supabase = await serverClient();
  const { error } = await supabase.from("briefe").update({ ...felder, status: "entwurf", pdf_pfad: null }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Der Brief konnte nicht gespeichert werden." };
  revalidatePath(`/briefe/${id}`);
  return { erfolg: "Brief gespeichert.", id };
}

/** PDF auf Briefpapier erzeugen und ablegen (Status „erstellt“). */
export async function briefErstellen(_vorher: BriefErgebnis, formular: FormData): Promise<BriefErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Brief." };
  const supabase = await serverClient();
  const geladen = await briefDokumentLaden(supabase, sitzung.mandantId, id);
  if (!geladen) return { fehler: "Unbekannter Brief." };
  if (!geladen.brief.text.trim()) return { fehler: "Der Brief hat noch keinen Text." };
  const pfad = await pdfFestschreiben(supabase, sitzung.mandantId, sitzung.mandantName, "briefe", id, geladen.dokument, geladen.absender);
  if (!pfad) return { fehler: "Das PDF konnte nicht abgelegt werden." };
  await supabase.from("briefe").update({ pdf_pfad: pfad, status: "erstellt" }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath(`/briefe/${id}`);
  return { erfolg: "PDF erstellt und abgelegt.", id };
}

export async function briefAlsVersendet(_vorher: BriefErgebnis, formular: FormData): Promise<BriefErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Brief." };
  const supabase = await serverClient();
  const { error } = await supabase.from("briefe").update({ status: "versendet", versendet_am: new Date().toISOString() }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Der Status konnte nicht gesetzt werden." };
  revalidatePath(`/briefe/${id}`);
  return { erfolg: "Als versendet vermerkt (Postversand).", id };
}

export async function briefLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "loeschen", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: b } = await supabase.from("briefe").select("pdf_pfad").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  const { error } = await supabase.from("briefe").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (!error && b?.pdf_pfad) await supabase.storage.from(DOKUMENT_BUCKET).remove([b.pdf_pfad as string]);
  revalidatePath("/briefe");
  redirect("/briefe");
}
