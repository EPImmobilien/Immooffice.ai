"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { ANFRAGE_STATUS, anfrageName, anredeText, STANDARD_VORLAGEN, terminText, vorlageAusfuellen, type AnfrageStatus, type Antwortvorlage } from "@/lib/vermietung/anfragen";
import { portalAnfrageErkennen } from "@/lib/vermietung/mail-parser";
import { fehlendeAngaben, mietvertragAusZeile, mietvertragText, mietvertragTitel, type MietvertragDaten } from "@/lib/vermietung/mietvertrag";
import { tokenErzeugen } from "@/lib/web-expose";

/**
 * Vermietung (docs/FUNKTIONSABGLEICH.md M1): Mietanfragen mit Antworten aus
 * Vorlagen, Selbstauskunft-Links, Mietvertraege mit Signatur, Reservierungen.
 */

export interface VermietungErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  betreff?: string;
  text?: string;
  link?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function optional(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return w === "" ? null : w;
}
function zahlOderNull(formular: FormData, feld: string): number | null {
  const w = text(formular, feld).replace(",", ".");
  if (w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}
function boolOderNull(formular: FormData, feld: string): boolean | null {
  const w = text(formular, feld);
  return w === "ja" ? true : w === "nein" ? false : null;
}

function basisUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Mietanfragen
// ---------------------------------------------------------------------------

const ANFRAGE_STATUS_WERTE = Object.keys(ANFRAGE_STATUS) as AnfrageStatus[];

function anfrageFelder(formular: FormData) {
  return {
    anrede: optional(formular, "anrede"),
    vorname: optional(formular, "vorname"),
    nachname: text(formular, "nachname").slice(0, 200),
    email: optional(formular, "email")?.toLowerCase() ?? null,
    telefon: optional(formular, "telefon"),
    personen_anzahl: zahlOderNull(formular, "personen_anzahl"),
    einzug_ab: optional(formular, "einzug_ab"),
    beruf: optional(formular, "beruf"),
    arbeitgeber: optional(formular, "arbeitgeber"),
    einkommen_netto: zahlOderNull(formular, "einkommen_netto"),
    schufa_vorhanden: boolOderNull(formular, "schufa_vorhanden"),
    kann_kaution_leisten: boolOderNull(formular, "kann_kaution_leisten"),
    haustiere: optional(formular, "haustiere"),
    raucher: boolOderNull(formular, "raucher"),
    derzeitiger_vermieter: optional(formular, "derzeitiger_vermieter"),
    mietverhaeltnis_seit: optional(formular, "mietverhaeltnis_seit"),
    mitteilung: optional(formular, "mitteilung"),
    notizen: optional(formular, "notizen"),
    bewertung: zahlOderNull(formular, "bewertung"),
    besichtigung_am: optional(formular, "besichtigung_am") ? new Date(text(formular, "besichtigung_am")).toISOString() : null,
    angaben_bestaetigt: text(formular, "angaben_bestaetigt") === "1",
  };
}

export async function anfrageAnlegen(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung);
  const felder = anfrageFelder(formular);
  if (!felder.nachname) return { fehler: "Bitte einen Nachnamen angeben." };
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("mietanfragen")
    .insert({ mandant_id: sitzung.mandantId, objekt_id: objektId.success ? objektId.data : null, quelle: "manuell", ...felder, erstellt_von: sitzung.benutzerId })
    .select("id")
    .single();
  if (error || !data) return { fehler: "Die Anfrage konnte nicht angelegt werden." };
  revalidatePath("/vermietung/anfragen");
  redirect(`/vermietung/anfragen/${data.id}`);
}

export async function anfrageSpeichern(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannte Anfrage." };
  const felder = anfrageFelder(formular);
  if (!felder.nachname) return { fehler: "Bitte einen Nachnamen angeben." };
  const status = text(formular, "status") as AnfrageStatus;
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const supabase = await serverClient();
  const { error } = await supabase
    .from("mietanfragen")
    .update({ ...felder, objekt_id: objektId.success ? objektId.data : null, ...(ANFRAGE_STATUS_WERTE.includes(status) ? { status } : {}) })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Nicht gespeichert." };
  revalidatePath(`/vermietung/anfragen/${id.data}`);
  revalidatePath("/vermietung/anfragen");
  return { erfolg: "Gespeichert." };
}

export async function anfrageStatus(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const status = text(formular, "status") as AnfrageStatus;
  if (!id.success || !ANFRAGE_STATUS_WERTE.includes(status)) return { fehler: "Ungültige Angabe." };
  const supabase = await serverClient();
  const { error } = await supabase.from("mietanfragen").update({ status }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Status nicht geändert." };
  revalidatePath(`/vermietung/anfragen/${id.data}`);
  revalidatePath("/vermietung/anfragen");
  return { erfolg: `Status: ${ANFRAGE_STATUS[status]}` };
}

export async function anfrageLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "loeschen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("mietanfragen").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/vermietung/anfragen");
  redirect("/vermietung/anfragen");
}

/** Aus der Anfrage einen Kontakt (Interessent) anlegen und verknuepfen. */
export async function anfrageAlsKontakt(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannte Anfrage." };
  const supabase = await serverClient();
  const { data: a } = await supabase.from("mietanfragen").select("*").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!a) return { fehler: "Unbekannte Anfrage." };
  if (a.kontakt_id) return { erfolg: "Bereits als Kontakt verknüpft.", id: a.kontakt_id as string };
  // Vorhandenen Kontakt mit gleicher Adresse wiederverwenden (keine Dublette)
  let kontaktId: string | null = null;
  if (a.email) {
    const { data: vorhanden } = await supabase.from("kontakte").select("id").eq("email", a.email as string).is("geloescht_am", null).maybeSingle();
    kontaktId = (vorhanden?.id as string | undefined) ?? null;
  }
  if (!kontaktId) {
    const { data: neu, error } = await supabase
      .from("kontakte")
      .insert({ mandant_id: sitzung.mandantId, anrede: a.anrede, vorname: a.vorname, nachname: a.nachname, email: a.email, telefon: a.telefon, quelle: `Mietanfrage (${a.quelle})`, erstellt_von: sitzung.benutzerId })
      .select("id")
      .single();
    if (error || !neu) return { fehler: "Der Kontakt konnte nicht angelegt werden." };
    kontaktId = neu.id as string;
    await supabase.from("kontakt_rollen").insert({ kontakt_id: kontaktId, rolle: "interessent" }).then(() => undefined, () => undefined);
  }
  await supabase.from("mietanfragen").update({ kontakt_id: kontaktId }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  if (a.objekt_id) {
    await supabase.from("kontakt_objekt").insert({ mandant_id: sitzung.mandantId, kontakt_id: kontaktId, objekt_id: a.objekt_id, rolle: "interessent" }).then(() => undefined, () => undefined);
  }
  revalidatePath(`/vermietung/anfragen/${id.data}`);
  return { erfolg: "Kontakt angelegt und verknüpft.", id: kontaktId };
}

/** Antwort aus Vorlage erzeugen — Betreff und Text fuer Postfach oder E-Mail-Programm. */
export async function anfrageAntwortEntwerfen(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "lesen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannte Anfrage." };
  const supabase = await serverClient();
  const [{ data: a }, { data: vorlagen }, { data: branding }] = await Promise.all([
    supabase.from("mietanfragen").select("*, objekt_ref:objekte(objektnummer, bezeichnung, titel, strasse, hausnummer, plz, ort)").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle(),
    supabase.from("antwortvorlagen").select("schluessel, bezeichnung, betreff, text, mit_termin"),
    supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  if (!a) return { fehler: "Unbekannte Anfrage." };
  const schluessel = text(formular, "vorlage");
  const eigene = ((vorlagen ?? []) as Antwortvorlage[]).find((v) => v.schluessel === schluessel);
  const vorlage = eigene ?? STANDARD_VORLAGEN.find((v) => v.schluessel === schluessel);
  if (!vorlage) return { fehler: "Unbekannte Vorlage." };
  const o = a.objekt_ref as { objektnummer: string; bezeichnung: string; titel: string | null; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null } | null;
  const objekt = o ? `${o.titel ?? o.bezeichnung}${o.ort ? ` in ${o.ort}` : ""}` : "der angefragten Wohnung";
  let link = "";
  if (schluessel === "selbstauskunft") {
    const { data: l } = await supabase.from("selbstauskunft_links").select("token").eq("aktiv", true).or(`objekt_id.eq.${a.objekt_id ?? "00000000-0000-0000-0000-000000000000"},objekt_id.is.null`).order("objekt_id", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    link = l?.token ? `${basisUrl()}/selbstauskunft/${l.token as string}` : "(Bitte zuerst unter Vermietung → Anfragen einen Selbstauskunft-Link anlegen.)";
  }
  const termin = terminText(text(formular, "termin") || (a.besichtigung_am as string | null));
  const e = vorlageAusfuellen(vorlage, {
    anrede: anredeText(a.anrede as string | null, a.nachname as string),
    name: anfrageName({ anrede: a.anrede as string | null, vorname: a.vorname as string | null, nachname: a.nachname as string }),
    objekt,
    termin: vorlage.mit_termin ? termin : "",
    absender: sitzung.name,
    firma: (branding?.firmenname as string | null) ?? sitzung.mandantName,
    link,
  });
  return { betreff: e.betreff, text: e.text };
}

/** Versand vermerken (nach Senden ueber Postfach oder E-Mail-Programm) und Status nachziehen. */
export async function anfrageAntwortVermerken(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannte Anfrage." };
  const vorlage = text(formular, "vorlage");
  const betreff = text(formular, "betreff").slice(0, 300);
  const weg = text(formular, "weg") === "postfach" ? "Postfach" : "E-Mail-Programm";
  const supabase = await serverClient();
  const { data: a } = await supabase.from("mietanfragen").select("antwort_verlauf, status").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!a) return { fehler: "Unbekannte Anfrage." };
  const verlauf = Array.isArray(a.antwort_verlauf) ? (a.antwort_verlauf as unknown[]) : [];
  const folgeStatus: Record<string, AnfrageStatus> = { besichtigung: "besichtigung_geplant", unterlagen: "unterlagen_angefordert", selbstauskunft: "unterlagen_angefordert", zusage: "zusage", absage: "absage" };
  const neuerStatus = folgeStatus[vorlage] ?? (a.status === "neu" ? "in_pruefung" : (a.status as AnfrageStatus));
  const termin = optional(formular, "termin");
  const { error } = await supabase
    .from("mietanfragen")
    .update({
      antwort_verlauf: [...verlauf, { zeitpunkt: new Date().toISOString(), vorlage, betreff, weg }],
      status: neuerStatus,
      ...(vorlage === "besichtigung" && termin ? { besichtigung_am: new Date(termin).toISOString() } : {}),
    })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Der Versand konnte nicht vermerkt werden." };
  revalidatePath(`/vermietung/anfragen/${id.data}`);
  revalidatePath("/vermietung/anfragen");
  return { erfolg: `Antwort vermerkt (${weg}). Status: ${ANFRAGE_STATUS[neuerStatus]}.` };
}

/** Aus einer E-Mail des Postfachs eine Mietanfrage anlegen (Portal-Parser). */
export async function nachrichtAlsAnfrage(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung);
  const nachrichtId = z.uuid().safeParse(text(formular, "nachricht_id"));
  if (!nachrichtId.success) return { fehler: "Unbekannte Nachricht." };
  const supabase = await serverClient();
  const { data: n } = await supabase.from("nachrichten").select("id, betreff, text, von_adresse, von_name, gesendet_am, objekt_id, kontakt_id").eq("id", nachrichtId.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!n) return { fehler: "Unbekannte Nachricht." };
  const { data: vorhanden } = await supabase.from("mietanfragen").select("id").contains("email_eingang", { nachricht_id: n.id }).maybeSingle();
  if (vorhanden) return { erfolg: "Zu dieser E-Mail gibt es bereits eine Anfrage.", id: vorhanden.id as string };

  const e = portalAnfrageErkennen({ betreff: n.betreff as string | null, text: n.text as string | null, vonAdresse: n.von_adresse as string | null, vonName: n.von_name as string | null });
  let objektId = (n.objekt_id as string | null) ?? null;
  if (!objektId && e.objektnummer) {
    const { data: o } = await supabase.from("objekte").select("id").ilike("objektnummer", e.objektnummer).is("geloescht_am", null).maybeSingle();
    objektId = (o?.id as string | undefined) ?? null;
  }
  const { data, error } = await supabase
    .from("mietanfragen")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId,
      kontakt_id: (n.kontakt_id as string | null) ?? null,
      quelle: "email",
      anrede: e.anrede || null,
      vorname: e.vorname || null,
      nachname: e.nachname || e.email || "Unbekannt",
      email: e.email,
      telefon: e.telefon,
      personen_anzahl: e.personen,
      mitteilung: e.nachricht || null,
      email_eingang: { absender: n.von_adresse, betreff: n.betreff, datum: n.gesendet_am, nachricht_id: n.id, portal: e.portal },
      eingegangen_am: n.gesendet_am,
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !data) return { fehler: "Die Anfrage konnte nicht angelegt werden." };
  revalidatePath("/vermietung/anfragen");
  return { erfolg: e.erkannt ? `Anfrage angelegt (${e.portal === "unbekannt" ? "Absender" : e.portal}).` : "Anfrage angelegt — die Felder konnten nur teilweise erkannt werden, bitte prüfen.", id: data.id as string };
}

// ---------------------------------------------------------------------------
// Selbstauskunft-Links und Antwortvorlagen
// ---------------------------------------------------------------------------

export async function selbstauskunftLinkAnlegen(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung);
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const bezeichnung = text(formular, "bezeichnung").slice(0, 120) || (objektId.success ? "Selbstauskunft zum Objekt" : "Allgemeine Selbstauskunft");
  const supabase = await serverClient();
  const token = tokenErzeugen(28);
  const { error } = await supabase.from("selbstauskunft_links").insert({ mandant_id: sitzung.mandantId, objekt_id: objektId.success ? objektId.data : null, bezeichnung, token, erstellt_von: sitzung.benutzerId });
  if (error) return { fehler: "Der Link konnte nicht angelegt werden." };
  revalidatePath("/vermietung/anfragen");
  return { erfolg: "Link angelegt.", link: `${basisUrl()}/selbstauskunft/${token}` };
}

export async function selbstauskunftLinkSchalten(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("selbstauskunft_links").update({ aktiv: text(formular, "aktiv") === "1" }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/vermietung/anfragen");
}

export async function antwortvorlageSpeichern(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  const schluessel = text(formular, "schluessel");
  const standard = STANDARD_VORLAGEN.find((v) => v.schluessel === schluessel);
  if (!standard) return { fehler: "Unbekannte Vorlage." };
  const betreff = text(formular, "betreff").slice(0, 300);
  const inhalt = String(formular.get("text") ?? "").trim().slice(0, 8000);
  if (!betreff || !inhalt) return { fehler: "Betreff und Text dürfen nicht leer sein." };
  const supabase = await serverClient();
  const { error } = await supabase.from("antwortvorlagen").upsert({ mandant_id: sitzung.mandantId, schluessel, bezeichnung: standard.bezeichnung, betreff, text: inhalt, mit_termin: standard.mit_termin }, { onConflict: "mandant_id,schluessel" });
  if (error) return { fehler: "Nicht gespeichert." };
  revalidatePath("/vermietung/anfragen");
  return { erfolg: "Vorlage gespeichert." };
}

// ---------------------------------------------------------------------------
// Mietvertraege
// ---------------------------------------------------------------------------

export async function mietvertragAnlegen(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  const anfrageId = z.uuid().safeParse(text(formular, "mietanfrage_id"));
  const zeile: Record<string, unknown> = { mandant_id: sitzung.mandantId, erstellt_von: sitzung.benutzerId, bezeichnung: "Mietvertrag" };
  const objekt: Record<string, string> = {};
  if (objektId.success) {
    const { data: o } = await supabase.from("objekte").select("bezeichnung, strasse, hausnummer, plz, ort, etage, zimmer, wohnflaeche, kaltmiete, nebenkosten, heizkosten, kaution, stellplatz_anzahl, zustand").eq("id", objektId.data).maybeSingle();
    if (o) {
      zeile["objekt_id"] = objektId.data;
      zeile["bezeichnung"] = `Mietvertrag ${o.bezeichnung as string}`;
      Object.assign(objekt, { strasse: [o.strasse, o.hausnummer].filter(Boolean).join(" "), plz: (o.plz as string | null) ?? "", ort: (o.ort as string | null) ?? "", lage: (o.etage as string | null) ?? "", raeume: o.zimmer ? `${o.zimmer} Zimmer, Küche, Bad` : "", wohnflaeche: o.wohnflaeche ? String(o.wohnflaeche) : "", zustand: (o.zustand as string | null) ?? "" });
      zeile["grundmiete"] = o.kaltmiete ?? 0;
      zeile["bk_kalt"] = o.nebenkosten ?? 0;
      zeile["bk_warm"] = o.heizkosten ?? 0;
      zeile["kaution"] = o.kaution ?? (o.kaltmiete ? Number(o.kaltmiete) * 3 : 0);
    }
  }
  zeile["objekt"] = objekt;
  if (anfrageId.success) {
    const { data: a } = await supabase.from("mietanfragen").select("anrede, vorname, nachname, email, einzug_ab, kontakt_id").eq("id", anfrageId.data).maybeSingle();
    if (a) {
      zeile["mietanfrage_id"] = anfrageId.data;
      zeile["kontakt_id"] = a.kontakt_id;
      zeile["mieter"] = { typ: "einzelperson", personen: [{ anrede: a.anrede ?? "", name: [a.vorname, a.nachname].filter(Boolean).join(" "), email: a.email ?? "", strasse: "", plz: "", ort: "", geburtsdatum: "" }], firma: "", vertreter: "" };
      if (a.einzug_ab) zeile["mietbeginn"] = a.einzug_ab;
    }
  }
  // Vermieter: Eigentuemer des Objekts, sonst leer
  if (objektId.success) {
    const { data: eig } = await supabase.from("kontakt_objekt").select("kontakt:kontakte(anrede, vorname, nachname, firma, strasse, hausnummer, plz, ort, email)").eq("objekt_id", objektId.data).eq("rolle", "eigentuemer").limit(3);
    const personen = ((eig ?? []) as unknown as Array<{ kontakt: { anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null; email: string | null } | null }>)
      .map((e) => e.kontakt).filter((k): k is NonNullable<typeof k> => Boolean(k))
      .map((k) => ({ anrede: k.anrede ?? "", name: [k.vorname, k.nachname].filter(Boolean).join(" ") || (k.firma ?? ""), strasse: [k.strasse, k.hausnummer].filter(Boolean).join(" "), plz: k.plz ?? "", ort: k.ort ?? "", email: k.email ?? "", geburtsdatum: "" }));
    if (personen.length > 0) zeile["vermieter"] = { typ: personen.length > 1 ? "mehrere" : "einzelperson", personen, firma: "", vertreter: "" };
  }
  const { data, error } = await supabase.from("mietvertraege").insert(zeile).select("id").single();
  if (error || !data) return { fehler: "Der Mietvertrag konnte nicht angelegt werden." };
  if (anfrageId.success) await supabase.from("mietanfragen").update({ status: "vertrag" }).eq("id", anfrageId.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/vermietung/mietvertraege");
  redirect(`/vermietung/mietvertraege/${data.id}`);
}

const personSchema = z.object({ anrede: z.string().max(20), name: z.string().max(200), strasse: z.string().max(200), plz: z.string().max(10), ort: z.string().max(120), email: z.string().max(200), geburtsdatum: z.string().max(10) });
const parteiSchema = z.object({ typ: z.enum(["einzelperson", "eheleute", "mehrere", "erbengemeinschaft", "firma"]), personen: z.array(personSchema).min(1).max(10), firma: z.string().max(200), vertreter: z.string().max(200) });
const mietvertragSchema = z.object({
  bezeichnung: z.string().max(200),
  ordner: z.string().max(120),
  vermieter: parteiSchema,
  mieter: parteiSchema,
  objekt: z.object({ strasse: z.string().max(200), plz: z.string().max(10), ort: z.string().max(120), lage: z.string().max(200), raeume: z.string().max(300), wohnflaeche: z.string().max(20), zustand: z.string().max(500), ausstattung: z.string().max(1000), nebenraeume: z.string().max(300) }),
  mietbeginn: z.string().max(10),
  befristet_bis: z.string().max(10),
  grundmiete: z.number().min(0), bk_kalt: z.number().min(0), bk_warm: z.number().min(0), stellplatz: z.number().min(0), kaution: z.number().min(0),
  kuendigungsausschluss_monate: z.number().int().min(0).max(48),
  neubau_klausel: z.boolean(),
  bank: z.object({ kontoinhaber: z.string().max(200), iban: z.string().max(40), bic: z.string().max(20), institut: z.string().max(120) }),
  besondere_vereinbarungen: z.string().max(6000),
});

export async function mietvertragSpeichern(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Mietvertrag." };
  let roh: unknown;
  try { roh = JSON.parse(String(formular.get("daten") ?? "{}")); } catch { return { fehler: "Die Angaben konnten nicht gelesen werden." }; }
  const geprueft = mietvertragSchema.safeParse(roh);
  if (!geprueft.success) return { fehler: `Bitte die Angaben prüfen: ${geprueft.error.issues[0]?.path.join(".")} ${geprueft.error.issues[0]?.message}`.trim() };
  const d: MietvertragDaten = geprueft.data;
  const supabase = await serverClient();
  const { error } = await supabase
    .from("mietvertraege")
    .update({
      bezeichnung: mietvertragTitel(d), ordner: d.ordner || null,
      vermieter: d.vermieter, mieter: d.mieter, objekt: d.objekt,
      mietbeginn: d.mietbeginn || null, befristet_bis: d.befristet_bis || null,
      grundmiete: d.grundmiete, bk_kalt: d.bk_kalt, bk_warm: d.bk_warm, stellplatz: d.stellplatz, kaution: d.kaution,
      kuendigungsausschluss_monate: d.kuendigungsausschluss_monate, neubau_klausel: d.neubau_klausel, bank: d.bank,
      besondere_vereinbarungen: d.besondere_vereinbarungen || null,
    })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId)
    .eq("status", "entwurf");
  if (error) return { fehler: "Nicht gespeichert (nur Entwürfe lassen sich ändern)." };
  revalidatePath(`/vermietung/mietvertraege/${id.data}`);
  return { erfolg: "Gespeichert." };
}

/** Vertragstext erzeugen und als Vertrag (Art mietvertrag) zur Unterschrift bereitstellen. */
export async function mietvertragZurUnterschrift(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return { fehler: "Unbekannter Mietvertrag." };
  const supabase = await serverClient();
  const { data: m } = await supabase.from("mietvertraege").select("*").eq("id", id.data).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!m) return { fehler: "Unbekannter Mietvertrag." };
  const d = mietvertragAusZeile(m as Record<string, unknown>);
  const fehlt = fehlendeAngaben(d);
  if (fehlt.length > 0) return { fehler: `Noch nicht vollständig: ${fehlt.join(", ")}.` };
  if (m.vertrag_id) return { erfolg: "Der Vertrag liegt bereits zur Unterschrift vor.", id: m.vertrag_id as string };
  const { data: v, error } = await supabase
    .from("vertraege")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: m.objekt_id, kontakt_id: m.kontakt_id,
      art: "mietvertrag",
      titel: mietvertragTitel(d),
      inhalt: mietvertragText(d),
      daten: { mietvertrag_id: id.data },
      verbraucher: d.mieter.typ !== "firma",
      quelle: "vorlage",
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !v) return { fehler: "Der Vertragstext konnte nicht angelegt werden." };
  await supabase.from("mietvertraege").update({ vertrag_id: v.id, status: "zur_unterschrift" }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  revalidatePath(`/vermietung/mietvertraege/${id.data}`);
  redirect(`/vertraege/${v.id}`);
}

export async function mietvertragStatus(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const status = text(formular, "status");
  if (!id.success || !["entwurf", "zur_unterschrift", "unterzeichnet", "beendet"].includes(status)) return { fehler: "Ungültige Angabe." };
  const supabase = await serverClient();
  const { error } = await supabase.from("mietvertraege").update({ status }).eq("id", id.data).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Status nicht geändert." };
  if (status === "unterzeichnet") {
    const { data: m } = await supabase.from("mietvertraege").select("objekt_id").eq("id", id.data).maybeSingle();
    if (m?.objekt_id) await supabase.from("objekte").update({ status: "vermietet" }).eq("id", m.objekt_id as string).eq("mandant_id", sitzung.mandantId);
  }
  revalidatePath(`/vermietung/mietvertraege/${id.data}`);
  revalidatePath("/vermietung/mietvertraege");
  return { erfolg: "Status geändert." };
}

export async function mietvertragLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "loeschen", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  if (!id.success) return;
  const supabase = await serverClient();
  await supabase.from("mietvertraege").delete().eq("id", id.data).eq("mandant_id", sitzung.mandantId).eq("status", "entwurf");
  revalidatePath("/vermietung/mietvertraege");
  redirect("/vermietung/mietvertraege");
}

// ---------------------------------------------------------------------------
// Reservierungen
// ---------------------------------------------------------------------------

export async function reservierungAnlegen(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const objektId = z.uuid().safeParse(text(formular, "objekt_id"));
  if (!objektId.success) return { fehler: "Bitte ein Objekt wählen." };
  const kontaktId = z.uuid().safeParse(text(formular, "kontakt_id"));
  const status = text(formular, "status") === "aktiv" ? "aktiv" : "angefragt";
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("reservierungen")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId.data,
      kontakt_id: kontaktId.success ? kontaktId.data : null,
      status,
      reserviert_bis: optional(formular, "reserviert_bis"),
      gebuehr: zahlOderNull(formular, "gebuehr") ?? 0,
      gebuehr_anrechenbar: text(formular, "gebuehr_anrechenbar") !== "0",
      notizen: optional(formular, "notizen"),
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !data) return { fehler: error?.message.includes("reservierungen_eine_aktive") ? "Für dieses Objekt läuft bereits eine aktive Reservierung." : "Die Reservierung konnte nicht angelegt werden." };
  // Reservierungsvereinbarung als Vertrag vorbereiten
  const { data: o } = await supabase.from("objekte").select("bezeichnung, strasse, hausnummer, plz, ort, kaufpreis").eq("id", objektId.data).maybeSingle();
  let kontaktName = "";
  if (kontaktId.success) {
    const { data: k } = await supabase.from("kontakte").select("anrede, vorname, nachname, firma, strasse, hausnummer, plz, ort").eq("id", kontaktId.data).maybeSingle();
    if (k) kontaktName = `${[k.anrede, k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || ""}${k.strasse ? `, ${[k.strasse, k.hausnummer].filter(Boolean).join(" ")}, ${[k.plz, k.ort].filter(Boolean).join(" ")}` : ""}`;
  }
  const gebuehr = zahlOderNull(formular, "gebuehr") ?? 0;
  const bis = optional(formular, "reserviert_bis");
  const { data: firma } = await supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle();
  const inhalt = [
    "Hinweis: Dieser Text ist ein Muster und keine Rechtsberatung. Ob er für Ihren Fall vollständig und wirksam ist, kann ImmoOffice.ai nicht beurteilen — bitte lassen Sie ihn anwaltlich prüfen, bevor Sie ihn verwenden.",
    "",
    "RESERVIERUNGSVEREINBARUNG",
    "",
    `zwischen ${(firma?.firmenname as string | null) ?? sitzung.mandantName} — Makler —`,
    `und ${kontaktName || "(Interessent)"} — Interessent —`,
    "",
    "§ 1 Objekt",
    `Der Makler reserviert für den Interessenten das Objekt ${o ? `${o.bezeichnung as string}, ${[o.strasse, o.hausnummer].filter(Boolean).join(" ")}, ${[o.plz, o.ort].filter(Boolean).join(" ")}` : "(Objekt)"}${o?.kaufpreis ? ` zum Angebotspreis von ${Number(o.kaufpreis).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : ""}.`,
    "",
    "§ 2 Dauer",
    `Die Reservierung gilt ${bis ? `bis zum ${new Date(bis).toLocaleDateString("de-DE")}` : "für vier Wochen ab Unterzeichnung"}. In dieser Zeit bietet der Makler das Objekt keinem anderen Interessenten an und führt keine weiteren Besichtigungen durch.`,
    "",
    "§ 3 Reservierungsgebühr",
    gebuehr > 0
      ? `Der Interessent zahlt eine Reservierungsgebühr von ${gebuehr.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €, fällig mit Unterzeichnung. Kommt der Kaufvertrag zustande, wird die Gebühr ${text(formular, "gebuehr_anrechenbar") !== "0" ? "vollständig auf die Provision angerechnet" : "nicht auf die Provision angerechnet"}. Kommt der Kaufvertrag aus Gründen nicht zustande, die der Interessent zu vertreten hat, verbleibt die Gebühr beim Makler, höchstens jedoch in Höhe des tatsächlichen Aufwands.`
      : "Eine Reservierungsgebühr wird nicht erhoben.",
    "Hinweis: Eine Reservierungsgebühr, die ein Vielfaches der üblichen Maklerprovision erreicht oder den Interessenten unangemessen bindet, kann unwirksam sein (§ 307 BGB). Der Betrag ist deshalb bewusst moderat zu wählen.",
    "",
    "§ 4 Kein Vorvertrag",
    "Diese Vereinbarung begründet keine Pflicht zum Abschluss des Kaufvertrags. Sie bedarf der Textform.",
  ].join("\n");
  const { data: v } = await supabase
    .from("vertraege")
    .insert({ mandant_id: sitzung.mandantId, objekt_id: objektId.data, kontakt_id: kontaktId.success ? kontaktId.data : null, art: "reservierungsvereinbarung", titel: `Reservierung ${o?.bezeichnung ?? ""}`.trim(), inhalt, daten: { reservierung_id: data.id, gebuehr, reserviert_bis: bis }, quelle: "vorlage", erstellt_von: sitzung.benutzerId })
    .select("id")
    .single();
  if (v) await supabase.from("reservierungen").update({ vertrag_id: v.id }).eq("id", data.id);
  revalidatePath("/vermietung/reservierungen");
  revalidatePath("/objekte");
  return { erfolg: "Reservierung angelegt; die Reservierungsvereinbarung liegt als Vertrag bereit.", id: data.id as string };
}

export async function reservierungStatus(_vorher: VermietungErgebnis, formular: FormData): Promise<VermietungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const id = z.uuid().safeParse(text(formular, "id"));
  const status = text(formular, "status");
  if (!id.success || !["angefragt", "aktiv", "abgelaufen", "aufgehoben", "abgeschlossen"].includes(status)) return { fehler: "Ungültige Angabe." };
  const supabase = await serverClient();
  const { error } = await supabase
    .from("reservierungen")
    .update({
      status,
      ...(status === "aufgehoben" ? { aufgehoben_am: new Date().toISOString(), aufhebungsgrund: optional(formular, "grund") } : {}),
      ...(text(formular, "gebuehr_bezahlt_am") ? { gebuehr_bezahlt_am: text(formular, "gebuehr_bezahlt_am") } : {}),
    })
    .eq("id", id.data)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: error.message.includes("reservierungen_eine_aktive") ? "Für dieses Objekt läuft bereits eine aktive Reservierung." : "Status nicht geändert." };
  if (status === "abgeschlossen") {
    const { data: r } = await supabase.from("reservierungen").select("objekt_id").eq("id", id.data).maybeSingle();
    if (r?.objekt_id) await supabase.from("objekte").update({ status: "verkauft" }).eq("id", r.objekt_id as string).eq("mandant_id", sitzung.mandantId);
  }
  revalidatePath("/vermietung/reservierungen");
  revalidatePath("/objekte");
  return { erfolg: "Status geändert." };
}
