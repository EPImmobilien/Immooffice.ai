"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import { pdfFestschreiben, rechnungDokumentLaden } from "@/lib/dokument/erzeugen";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { ABSENDER_TYPEN, MWST_SAETZE, nettoAusBrutto } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";

/**
 * Rechnungen und Rechnungsstammdaten (docs/FUNKTIONSABGLEICH.md Kachel 14):
 * Absender mit Nummernkreis, Kunden, Entwuerfe mit Positionen, Stellen mit
 * fortlaufender Nummer, Storno als Gegenrechnung, Zahlungseingang. Die
 * GoBD-Regeln (Unveraenderlichkeit, Loeschschutz, Nummernsperre) erzwingt die
 * Datenbank; hier wird nur gesammelt und aufgerufen.
 */

export interface RechnungErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  nummer?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function optional(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return w === "" ? null : w;
}
function zahlOderNull(formular: FormData, feld: string): number | null {
  let w = text(formular, feld);
  if (w === "") return null;
  if (w.includes(",")) w = w.replace(/\./g, "").replace(",", ".");
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}
function uuid(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return z.uuid().safeParse(w).success ? w : null;
}
/** Datenbankmeldungen sind bewusst ASCII (Umlaute als ae/oe/ue). */
function dbText(m: string): string {
  return m.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü").replace(/Ae/g, "Ä").replace(/Oe/g, "Ö").replace(/Ue/g, "Ü");
}
function datumOderNull(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : null;
}

type Supabase = Awaited<ReturnType<typeof serverClient>>;

// ---------------------------------------------------------------------------
// Absender (Stammdaten mit Nummernkreis)
// ---------------------------------------------------------------------------

/** Legt beim ersten Aufruf einen Firmen-Absender aus den Branding-Daten an. */
export async function absenderVorbereiten(): Promise<void> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  const { count } = await supabase.from("rechnungs_absender").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;
  const { data: b } = await supabase.from("mandant_branding").select("firmenname, strasse, hausnummer, plz, ort, telefon, email, web").eq("mandant_id", sitzung.mandantId).maybeSingle();
  await supabase.from("rechnungs_absender").insert({
    mandant_id: sitzung.mandantId,
    typ: "firma",
    name: ((b?.firmenname as string | null) ?? sitzung.mandantName).slice(0, 200),
    strasse: (b?.strasse as string | null) ?? "",
    hausnummer: (b?.hausnummer as string | null) ?? null,
    plz: (b?.plz as string | null) ?? "",
    ort: (b?.ort as string | null) ?? "",
    email: (b?.email as string | null) ?? null,
    telefon: (b?.telefon as string | null) ?? null,
    web: (b?.web as string | null) ?? null,
  });
}

function absenderFelder(formular: FormData, sitzung: Sitzung) {
  const typ = text(formular, "typ") in ABSENDER_TYPEN ? (text(formular, "typ") as keyof typeof ABSENDER_TYPEN) : "firma";
  const mwst = zahlOderNull(formular, "standard_mwst");
  const ustId = optional(formular, "ust_id")?.replace(/\s+/g, "").toUpperCase() ?? null;
  return {
    typ,
    benutzer_id: typ === "persoenlich" ? (uuid(formular, "benutzer_id") ?? sitzung.benutzerId) : null,
    name: text(formular, "name").slice(0, 200),
    zusatz: optional(formular, "zusatz"),
    strasse: text(formular, "strasse"),
    hausnummer: optional(formular, "hausnummer"),
    plz: text(formular, "plz"),
    ort: text(formular, "ort"),
    land: optional(formular, "land") ?? "Deutschland",
    email: optional(formular, "email")?.toLowerCase() ?? null,
    telefon: optional(formular, "telefon"),
    web: optional(formular, "web"),
    steuernummer: optional(formular, "steuernummer"),
    ust_id: ustId,
    kleinunternehmer: text(formular, "kleinunternehmer") === "1",
    bank_name: optional(formular, "bank_name"),
    iban: optional(formular, "iban")?.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim() ?? null,
    bic: optional(formular, "bic"),
    praefix: (text(formular, "praefix") || "RE").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "RE",
    mit_jahr: text(formular, "mit_jahr") !== "0",
    naechste_nummer: Math.max(1, Math.min(999999, Math.round(zahlOderNull(formular, "naechste_nummer") ?? 1))),
    zahlungsziel_tage: Math.max(0, Math.min(120, Math.round(zahlOderNull(formular, "zahlungsziel_tage") ?? 14))),
    standard_mwst: mwst !== null && (MWST_SAETZE as readonly number[]).includes(mwst) ? mwst : 19,
    einleitung: text(formular, "einleitung") || "Sehr geehrte Damen und Herren,\n\nhiermit stellen wir Ihnen folgende Leistungen in Rechnung:",
    schluss: optional(formular, "schluss"),
    aktiv: text(formular, "aktiv") !== "0",
  };
}

export async function absenderSpeichern(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const felder = absenderFelder(formular, sitzung);
  if (!felder.name) return { fehler: "Bitte einen Namen angeben." };
  if (!felder.strasse || !felder.plz || !felder.ort) return { fehler: "Bitte die vollständige Anschrift angeben (Straße, PLZ, Ort)." };
  if (felder.ust_id && !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(felder.ust_id)) return { fehler: "Die USt-IdNr. hat nicht das erwartete Format (z. B. DE123456789)." };
  const supabase = await serverClient();
  const id = uuid(formular, "id");
  if (id) {
    // Nummernkreis-Felder nur mitschicken, wenn sie sich aendern duerfen — sonst
    // blockt der GoBD-Trigger den gesamten Speichervorgang.
    const { data: info } = await supabase.rpc("rechnung_startnummer_info", { p_absender: id });
    const editierbar = (info as { editierbar?: boolean } | null)?.editierbar !== false;
    const { praefix, mit_jahr, naechste_nummer, ...rest } = felder;
    const { error } = await supabase.from("rechnungs_absender").update(editierbar ? { ...rest, praefix, mit_jahr, naechste_nummer } : rest).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: error.message.includes("Nummernkreis") ? "Der Nummernkreis ist gesperrt, sobald eine Rechnung gestellt wurde." : "Der Absender konnte nicht gespeichert werden." };
    revalidatePath("/rechnungen/absender");
    return { erfolg: "Absender gespeichert.", id };
  }
  const { data, error } = await supabase.from("rechnungs_absender").insert({ mandant_id: sitzung.mandantId, ...felder }).select("id").single();
  if (error || !data) return { fehler: "Der Absender konnte nicht angelegt werden." };
  revalidatePath("/rechnungen/absender");
  return { erfolg: "Absender angelegt.", id: data.id as string };
}

export async function absenderLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "loeschen", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { error } = await supabase.from("rechnungs_absender").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  // Mit gestellten Rechnungen verknuepfte Absender bleiben (on delete restrict) — dann nur deaktivieren.
  if (error) await supabase.from("rechnungs_absender").update({ aktiv: false }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/rechnungen/absender");
}

// ---------------------------------------------------------------------------
// Kunden
// ---------------------------------------------------------------------------

function kundeFelder(formular: FormData) {
  return {
    kontakt_id: uuid(formular, "kontakt_id"),
    anrede: optional(formular, "anrede"),
    name: text(formular, "name").slice(0, 200),
    zusatz: optional(formular, "zusatz"),
    strasse: optional(formular, "strasse"),
    plz: optional(formular, "plz"),
    ort: optional(formular, "ort"),
    land: optional(formular, "land") ?? "Deutschland",
    email: optional(formular, "email")?.toLowerCase() ?? null,
    ust_id: optional(formular, "ust_id")?.replace(/\s+/g, "").toUpperCase() ?? null,
  };
}

export async function kundeSpeichern(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "anlegen", sitzung.uebersteuerung);
  const felder = kundeFelder(formular);
  if (!felder.name) return { fehler: "Bitte einen Namen angeben." };
  const supabase = await serverClient();
  const id = uuid(formular, "id");
  if (id) {
    const { error } = await supabase.from("rechnungskunden").update(felder).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Der Kunde konnte nicht gespeichert werden." };
    revalidatePath("/rechnungen/kunden");
    return { erfolg: "Kunde gespeichert.", id };
  }
  const { data, error } = await supabase.from("rechnungskunden").insert({ mandant_id: sitzung.mandantId, ...felder }).select("id").single();
  if (error || !data) return { fehler: "Der Kunde konnte nicht angelegt werden." };
  revalidatePath("/rechnungen/kunden");
  return { erfolg: "Kunde angelegt.", id: data.id as string };
}

export async function kundeLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "loeschen", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("rechnungskunden").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/rechnungen/kunden");
}

/** Kunde aus einem Kontakt uebernehmen (oder vorhandenen Kundensatz finden). */
async function kundeAusKontakt(supabase: Supabase, sitzung: Sitzung, kontaktId: string): Promise<{ id: string; anrede: string | null; name: string; zusatz: string | null; strasse: string | null; plz: string | null; ort: string | null; land: string; email: string | null; ust_id: string | null } | null> {
  const { data: vorhanden } = await supabase.from("rechnungskunden").select("id, anrede, name, zusatz, strasse, plz, ort, land, email, ust_id").eq("kontakt_id", kontaktId).order("erstellt_am").limit(1).maybeSingle();
  if (vorhanden) return vorhanden as NonNullable<Awaited<ReturnType<typeof kundeAusKontakt>>>;
  const { data: k } = await supabase.from("kontakte").select("anrede, titel, vorname, nachname, firma, strasse, hausnummer, plz, ort, land, email").eq("id", kontaktId).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!k) return null;
  const person = [k.titel, k.vorname, k.nachname].filter(Boolean).join(" ");
  const felder = {
    kontakt_id: kontaktId,
    anrede: (k.anrede as string | null) ?? null,
    name: (k.firma ? (k.firma as string) : person).slice(0, 200) || person || "Kunde",
    zusatz: k.firma && person ? person : null,
    strasse: [k.strasse, k.hausnummer].filter(Boolean).join(" ") || null,
    plz: (k.plz as string | null) ?? null,
    ort: (k.ort as string | null) ?? null,
    land: (k.land as string | null) ?? "Deutschland",
    email: (k.email as string | null) ?? null,
    ust_id: null,
  };
  const { data } = await supabase.from("rechnungskunden").insert({ mandant_id: sitzung.mandantId, ...felder }).select("id").single();
  return data ? { id: data.id as string, ...felder } : null;
}

// ---------------------------------------------------------------------------
// Rechnungen
// ---------------------------------------------------------------------------

interface PositionEingabe { beschreibung: string; menge: number; einheit: string | null; einzelpreis_netto: number; mwst_satz: number }

const positionSchema = z.object({
  beschreibung: z.string().trim().min(1).max(1000),
  menge: z.number().refine((n) => n !== 0 && Number.isFinite(n)),
  einheit: z.string().trim().max(30).nullable().default(null),
  einzelpreis_netto: z.number().finite(),
  mwst_satz: z.number().refine((n) => (MWST_SAETZE as readonly number[]).includes(n)),
});

async function positionenSchreiben(supabase: Supabase, mandantId: string, rechnungId: string, positionen: PositionEingabe[]): Promise<string | null> {
  const { error: weg } = await supabase.from("rechnungspositionen").delete().eq("rechnung_id", rechnungId).eq("mandant_id", mandantId);
  if (weg) return weg.message;
  if (positionen.length === 0) return null;
  const { error } = await supabase.from("rechnungspositionen").insert(positionen.map((p, i) => ({ mandant_id: mandantId, rechnung_id: rechnungId, position: i + 1, beschreibung: p.beschreibung, menge: p.menge, einheit: p.einheit, einzelpreis_netto: p.einzelpreis_netto, mwst_satz: p.mwst_satz })));
  return error ? error.message : null;
}

/**
 * Neue Rechnung als Entwurf. Aus einem Maklervertrag wird die Provisionsposition
 * vorbelegt (Prozentsatz und Kaufpreis aus dem Vertrag bzw. der Objektakte),
 * aus einem Kontakt der Rechnungskunde.
 */
export async function rechnungAnlegen(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  await absenderVorbereiten();
  const absenderId = uuid(formular, "absender_id");
  const { data: a } = absenderId
    ? await supabase.from("rechnungs_absender").select("id, zahlungsziel_tage, standard_mwst, kleinunternehmer").eq("id", absenderId).maybeSingle()
    : await supabase.from("rechnungs_absender").select("id, zahlungsziel_tage, standard_mwst, kleinunternehmer").eq("aktiv", true).order("typ").order("sortierung").limit(1).maybeSingle();
  if (!a) return { fehler: "Bitte zuerst einen Rechnungsabsender anlegen." };

  let kundeId = uuid(formular, "kunde_id");
  const kontaktId = uuid(formular, "kontakt_id");
  const objektId = uuid(formular, "objekt_id");
  const vertragId = uuid(formular, "vertrag_id");
  let kunde: Awaited<ReturnType<typeof kundeAusKontakt>> = null;
  if (kundeId) {
    const { data } = await supabase.from("rechnungskunden").select("id, anrede, name, zusatz, strasse, plz, ort, land, email, ust_id").eq("id", kundeId).maybeSingle();
    kunde = data as typeof kunde;
  } else if (kontaktId) {
    kunde = await kundeAusKontakt(supabase, sitzung, kontaktId);
    kundeId = kunde?.id ?? null;
  }

  const mwst = a.kleinunternehmer ? 0 : Number(a.standard_mwst);
  const positionen: PositionEingabe[] = [];
  let leistungVon: string | null = null;
  if (vertragId) {
    const { data: v } = await supabase.from("vertraege").select("art, titel, daten, objekt_id, kontakt_id, geschlossen_am").eq("id", vertragId).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (v) {
      const d = (v.daten ?? {}) as { provision_prozent?: number; provisionsmodell?: string; angebotspreis?: number | null };
      const objId = objektId ?? (v.objekt_id as string | null);
      const { data: o } = objId ? await supabase.from("objekte").select("objektnummer, bezeichnung, kaufpreis, kaltmiete").eq("id", objId).maybeSingle() : { data: null };
      const prozent = typeof d.provision_prozent === "number" ? d.provision_prozent : 3.57;
      const preis = d.angebotspreis ?? (o?.kaufpreis === null || o?.kaufpreis === undefined ? null : Number(o.kaufpreis));
      const bezug = o ? `${o.objektnummer} ${o.bezeichnung}` : (v.titel as string);
      const brutto = preis !== null ? Math.round(preis * prozent) / 100 : 0;
      positionen.push({
        beschreibung: `Maklerprovision für die Vermittlung von ${bezug}${preis !== null ? ` — ${prozent.toLocaleString("de-DE")} % des Kaufpreises von ${preis.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} (inkl. USt)` : ` — ${prozent.toLocaleString("de-DE")} % des Kaufpreises`}`.slice(0, 1000),
        menge: 1,
        einheit: "pauschal",
        einzelpreis_netto: mwst > 0 ? nettoAusBrutto(brutto, mwst) : brutto,
        mwst_satz: mwst,
      });
      if (!kundeId && v.kontakt_id) {
        kunde = await kundeAusKontakt(supabase, sitzung, v.kontakt_id as string);
        kundeId = kunde?.id ?? null;
      }
      leistungVon = (v.geschlossen_am as string | null)?.slice(0, 10) ?? null;
    }
  }

  const heute = new Date().toISOString().slice(0, 10);
  const { data: r, error } = await supabase
    .from("rechnungen")
    .insert({
      mandant_id: sitzung.mandantId,
      absender_id: a.id,
      kunde_id: kundeId,
      kontakt_id: kontaktId,
      objekt_id: objektId,
      vertrag_id: vertragId,
      ist_test: text(formular, "ist_test") === "1",
      empfaenger_anrede: kunde?.anrede ?? null,
      empfaenger_name: kunde?.name ?? "",
      empfaenger_zusatz: kunde?.zusatz ?? null,
      empfaenger_strasse: kunde?.strasse ?? null,
      empfaenger_plz: kunde?.plz ?? null,
      empfaenger_ort: kunde?.ort ?? null,
      empfaenger_land: kunde?.land ?? "Deutschland",
      empfaenger_email: kunde?.email ?? null,
      empfaenger_ust_id: kunde?.ust_id ?? null,
      ausstellungsdatum: heute,
      leistung_von: leistungVon,
      zahlungsziel_tage: a.zahlungsziel_tage,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !r) return { fehler: "Die Rechnung konnte nicht angelegt werden." };
  if (positionen.length > 0) await positionenSchreiben(supabase, sitzung.mandantId, r.id as string, positionen);
  revalidatePath("/rechnungen");
  redirect(`/rechnungen/${r.id}`);
}

export async function rechnungSpeichern(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannte Rechnung." };
  let positionen: PositionEingabe[] = [];
  try {
    const roh = JSON.parse(text(formular, "positionen") || "[]") as unknown;
    const geprueft = z.array(positionSchema).max(200).safeParse(roh);
    if (!geprueft.success) return { fehler: "Bitte jede Position mit Beschreibung, Menge (nicht 0) und gültigem Steuersatz angeben." };
    positionen = geprueft.data;
  } catch {
    return { fehler: "Die Positionen konnten nicht gelesen werden." };
  }
  const supabase = await serverClient();
  const { data: r } = await supabase.from("rechnungen").select("status").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!r) return { fehler: "Unbekannte Rechnung." };
  if (r.status !== "entwurf") return { fehler: "Eine gestellte Rechnung ist unveränderlich (GoBD). Bitte stornieren und neu stellen." };
  const felder = {
    absender_id: uuid(formular, "absender_id"),
    kunde_id: uuid(formular, "kunde_id"),
    kontakt_id: uuid(formular, "kontakt_id"),
    objekt_id: uuid(formular, "objekt_id"),
    vertrag_id: uuid(formular, "vertrag_id"),
    empfaenger_anrede: optional(formular, "empfaenger_anrede"),
    empfaenger_name: text(formular, "empfaenger_name").slice(0, 200),
    empfaenger_zusatz: optional(formular, "empfaenger_zusatz"),
    empfaenger_strasse: optional(formular, "empfaenger_strasse"),
    empfaenger_plz: optional(formular, "empfaenger_plz"),
    empfaenger_ort: optional(formular, "empfaenger_ort"),
    empfaenger_land: optional(formular, "empfaenger_land") ?? "Deutschland",
    empfaenger_email: optional(formular, "empfaenger_email")?.toLowerCase() ?? null,
    empfaenger_ust_id: optional(formular, "empfaenger_ust_id"),
    ausstellungsdatum: datumOderNull(formular, "ausstellungsdatum") ?? new Date().toISOString().slice(0, 10),
    leistung_von: datumOderNull(formular, "leistung_von"),
    leistung_bis: datumOderNull(formular, "leistung_bis"),
    zahlungsziel_tage: Math.max(0, Math.min(120, Math.round(zahlOderNull(formular, "zahlungsziel_tage") ?? 14))),
    einleitung: optional(formular, "einleitung"),
    schluss: optional(formular, "schluss"),
    notiz: optional(formular, "notiz"),
  };
  const { error } = await supabase.from("rechnungen").update(felder).eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Rechnung konnte nicht gespeichert werden." };
  const posFehler = await positionenSchreiben(supabase, sitzung.mandantId, id, positionen);
  if (posFehler) return { fehler: "Die Positionen konnten nicht gespeichert werden." };
  revalidatePath(`/rechnungen/${id}`);
  return { erfolg: "Rechnung gespeichert.", id };
}

/** Stellt die Rechnung: Nummer vergeben, festschreiben, PDF ablegen. */
export async function rechnungStellen(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "freigeben", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannte Rechnung." };
  const supabase = await serverClient();
  const { data: nummer, error } = await supabase.rpc("rechnung_stellen", { p_rechnung: id });
  if (error) return { fehler: dbText(error.message) };
  const geladen = await rechnungDokumentLaden(supabase, sitzung.mandantId, id);
  if (geladen) {
    const pfad = await pdfFestschreiben(supabase, sitzung.mandantId, sitzung.mandantName, "rechnungen", id, geladen.dokument, geladen.absender);
    if (pfad) await supabase.from("rechnungen").update({ pdf_pfad: pfad }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  }
  revalidatePath(`/rechnungen/${id}`);
  revalidatePath("/rechnungen");
  return { erfolg: `Rechnung ${nummer as string} gestellt.`, id, nummer: nummer as string };
}

export async function rechnungStornieren(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "freigeben", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannte Rechnung." };
  const grund = optional(formular, "grund");
  if (!grund) return { fehler: "Bitte einen Stornogrund angeben." };
  const supabase = await serverClient();
  const { data: stornoId, error } = await supabase.rpc("rechnung_stornieren", { p_rechnung: id, p_grund: grund });
  if (error) return { fehler: dbText(error.message) };
  const geladen = await rechnungDokumentLaden(supabase, sitzung.mandantId, stornoId as string);
  if (geladen) {
    const pfad = await pdfFestschreiben(supabase, sitzung.mandantId, sitzung.mandantName, "rechnungen", stornoId as string, geladen.dokument, geladen.absender);
    if (pfad) await supabase.from("rechnungen").update({ pdf_pfad: pfad }).eq("id", stornoId as string).eq("mandant_id", sitzung.mandantId);
  }
  revalidatePath(`/rechnungen/${id}`);
  revalidatePath("/rechnungen");
  redirect(`/rechnungen/${stornoId as string}`);
}

export async function rechnungBezahlt(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannte Rechnung." };
  const supabase = await serverClient();
  const { error } = await supabase.rpc("rechnung_bezahlt", { p_rechnung: id, p_am: datumOderNull(formular, "bezahlt_am") ?? new Date().toISOString().slice(0, 10), p_betrag: zahlOderNull(formular, "bezahlt_betrag") });
  if (error) return { fehler: dbText(error.message) };
  revalidatePath(`/rechnungen/${id}`);
  revalidatePath("/rechnungen");
  return { erfolg: "Zahlungseingang vermerkt.", id };
}

export async function rechnungNotiz(_vorher: RechnungErgebnis, formular: FormData): Promise<RechnungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannte Rechnung." };
  const supabase = await serverClient();
  const { error } = await supabase.from("rechnungen").update({ notiz: optional(formular, "notiz") }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Notiz konnte nicht gespeichert werden." };
  revalidatePath(`/rechnungen/${id}`);
  return { erfolg: "Notiz gespeichert.", id };
}

/** Nur Entwuerfe und Testrechnungen — alles andere blockt die Datenbank. */
export async function rechnungLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: r } = await supabase.from("rechnungen").select("pdf_pfad").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  const { error } = await supabase.from("rechnungen").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (!error && r?.pdf_pfad) {
    await supabase.storage.from(DOKUMENT_BUCKET).remove([r.pdf_pfad as string]);
  }
  revalidatePath("/rechnungen");
  redirect("/rechnungen");
}
