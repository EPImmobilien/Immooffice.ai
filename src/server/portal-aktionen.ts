"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { tokenErzeugen } from "@/lib/portal/token";
import {
  ANFRAGE_ART,
  DATEI_KATEGORIEN,
  EINHEIT_STATUS,
  FORTSCHRITT,
  KUNDEN_ART,
  PROJEKT_STATUS,
  SICHTBARKEIT,
  kundenLink,
  projektLink,
  slugAus,
  type EinheitStatus,
  type KundenArt,
} from "@/lib/portal/typen";
import { serverClient } from "@/lib/supabase/server";

/**
 * Maklerseite: Neubau-Projekte und Kundenbereich (docs/FUNKTIONSABGLEICH.md
 * P1/P2). Alles laeuft ueber den Sitzungs-Client mit RLS; der Kunde selbst
 * arbeitet ueber src/server/kunde-aktionen.ts mit Token-Funktionen.
 *
 * Hinweis: Der Masterprompt schliesst einen Kundenbereich aus; der
 * Auftraggeber hat die 1:1-Uebernahme angeordnet (E-2026-09-03-36).
 */

export interface PortalErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  link?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function uuid(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return z.uuid().safeParse(w).success ? w : null;
}
function zahl(formular: FormData, feld: string): number | null {
  const w = text(formular, feld).replace(/\./g, "").replace(",", ".");
  if (w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}
function zahlEinfach(formular: FormData, feld: string): number | null {
  const w = text(formular, feld).replace(",", ".");
  if (w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}
function basisUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
}
function dateinameSicher(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "datei";
}

async function schreibrecht(): Promise<Sitzung> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "portal", "aendern", sitzung.uebersteuerung);
  return sitzung;
}

/** Mail ueber die Job-Warteschlange (Waechter, Wiederholung) — ohne Mail-Dienst bleibt der Link zum Kopieren. */
async function mailEinstellen(supabase: Awaited<ReturnType<typeof serverClient>>, an: string, betreff: string, textInhalt: string, antwortAn?: string): Promise<boolean> {
  if (!process.env["MAIL_API_KEY"]) return false;
  const { error } = await supabase.rpc("job_einstellen", {
    p_art: "mail",
    p_nutzlast: { vorlage: "frei", an, betreff, text: textInhalt, ...(antwortAn ? { antwort_an: antwortAn } : {}) },
  });
  return !error;
}

// ---------------------------------------------------------------------------
// Projekte
// ---------------------------------------------------------------------------

export async function projektSpeichern(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const supabase = await serverClient();
  const id = uuid(formular, "id");
  const name = text(formular, "name").slice(0, 200);
  if (name.length < 2) return { fehler: "Bitte einen Projektnamen angeben." };
  const status = text(formular, "status");
  const vermarktungsart = text(formular, "vermarktungsart") === "miete" ? "miete" : "kauf";
  const felder = {
    name,
    slug: slugAus(text(formular, "slug") || name),
    strasse: text(formular, "strasse").slice(0, 200) || null,
    plz: text(formular, "plz").slice(0, 10) || null,
    ort: text(formular, "ort").slice(0, 120) || null,
    beschreibung: text(formular, "beschreibung").slice(0, 8000) || null,
    vermarktungsart,
    status: status in PROJEKT_STATUS ? status : "vorbereitung",
    baubeginn: text(formular, "baubeginn") || null,
    fertigstellung: text(formular, "fertigstellung") || null,
    ansprechpartner_id: uuid(formular, "ansprechpartner_id"),
    oeffentlich: formular.get("oeffentlich") === "1",
  };
  if (id) {
    const { error } = await supabase.from("projekte").update(felder).eq("id", id);
    if (error) return { fehler: error.message.includes("projekte_mandant_id_slug_key") ? "Diese Kurzadresse ist bereits vergeben." : "Das Projekt konnte nicht gespeichert werden." };
    revalidatePath(`/projekte/${id}`);
    revalidatePath("/projekte");
    return { erfolg: "Projekt gespeichert.", id };
  }
  const { token } = tokenErzeugen();
  let { data, error } = await supabase
    .from("projekte")
    .insert({ ...felder, mandant_id: sitzung.mandantId, erstellt_von: sitzung.benutzerId, token })
    .select("id")
    .single();
  if (error?.message.includes("slug") && !text(formular, "slug")) {
    // Automatischer Kurzname schon vergeben — mit Zusatz noch einmal versuchen
    const zusatz = `${felder.slug.slice(0, 74)}-${Math.random().toString(36).slice(2, 6)}`;
    ({ data, error } = await supabase
      .from("projekte")
      .insert({ ...felder, slug: zusatz, mandant_id: sitzung.mandantId, erstellt_von: sitzung.benutzerId, token })
      .select("id")
      .single());
  }
  if (error || !data) return { fehler: error?.message.includes("slug") ? "Diese Kurzadresse ist bereits vergeben." : "Das Projekt konnte nicht angelegt werden." };
  revalidatePath("/projekte");
  redirect(`/projekte/${data.id as string}`);
}

export async function projektLoeschen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("projekte").update({ geloescht_am: new Date().toISOString(), status: "archiviert", oeffentlich: false }).eq("id", id);
  revalidatePath("/projekte");
  redirect("/projekte");
}

/** Oeffentliche Projektseite an/aus; auf Wunsch neuer Link. */
export async function projektVeroeffentlichen(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  await schreibrecht();
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Projekt fehlt." };
  const supabase = await serverClient();
  const an = formular.get("oeffentlich") === "1";
  const neu = formular.get("neuer_link") === "1";
  const felder: Record<string, unknown> = { oeffentlich: an };
  if (neu || an) {
    const { data } = await supabase.from("projekte").select("token").eq("id", id).maybeSingle();
    if (neu || !data?.token) felder["token"] = tokenErzeugen().token;
  }
  const { error } = await supabase.from("projekte").update(felder).eq("id", id);
  if (error) return { fehler: "Konnte nicht gespeichert werden." };
  const { data } = await supabase.from("projekte").select("token").eq("id", id).maybeSingle();
  revalidatePath(`/projekte/${id}`);
  return { erfolg: an ? "Projektseite ist öffentlich erreichbar." : "Projektseite ist nicht mehr öffentlich.", ...(data?.token ? { link: projektLink(basisUrl(), data.token as string) } : {}) };
}

// ---------------------------------------------------------------------------
// Einheiten
// ---------------------------------------------------------------------------

export async function einheitSpeichern(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const supabase = await serverClient();
  const projektId = uuid(formular, "projekt_id");
  const id = uuid(formular, "id");
  const weNr = text(formular, "we_nr").slice(0, 40);
  if (!projektId || !weNr) return { fehler: "Bitte Projekt und Wohnungsnummer angeben." };
  const status = text(formular, "status");
  const felder = {
    we_nr: weNr,
    geschoss: text(formular, "geschoss").slice(0, 40) || null,
    geschoss_index: Math.trunc(zahlEinfach(formular, "geschoss_index") ?? 0),
    zimmer: zahlEinfach(formular, "zimmer"),
    wohnflaeche: zahlEinfach(formular, "wohnflaeche"),
    ausrichtung: text(formular, "ausrichtung").slice(0, 40) || null,
    kaufpreis: zahl(formular, "kaufpreis"),
    miete: zahl(formular, "miete"),
    hausgeld: zahl(formular, "hausgeld"),
    status: (status in EINHEIT_STATUS ? status : "verfuegbar") as EinheitStatus,
    objekt_id: uuid(formular, "objekt_id"),
    notiz: text(formular, "notiz").slice(0, 2000) || null,
    sortierung: Math.trunc(zahlEinfach(formular, "sortierung") ?? 0),
  };
  const { error } = id
    ? await supabase.from("projekt_einheiten").update(felder).eq("id", id)
    : await supabase.from("projekt_einheiten").insert({ ...felder, mandant_id: sitzung.mandantId, projekt_id: projektId });
  if (error) return { fehler: error.message.includes("projekt_einheiten_projekt_id_we_nr_key") ? "Diese Wohnungsnummer gibt es im Projekt schon." : error.message };
  revalidatePath(`/projekte/${projektId}`);
  return { erfolg: id ? "Einheit gespeichert." : "Einheit angelegt." };
}

export async function einheitStatusSetzen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const projektId = uuid(formular, "projekt_id");
  const status = text(formular, "status");
  if (!id || !projektId || !(status in EINHEIT_STATUS)) return;
  const supabase = await serverClient();
  await supabase.from("projekt_einheiten").update({ status }).eq("id", id);
  revalidatePath(`/projekte/${projektId}`);
}

export async function einheitLoeschen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const projektId = uuid(formular, "projekt_id");
  if (!id || !projektId) return;
  const supabase = await serverClient();
  await supabase.from("projekt_einheiten").delete().eq("id", id);
  revalidatePath(`/projekte/${projektId}`);
}

// ---------------------------------------------------------------------------
// Ordner, Dateien, Updates, Gewerke
// ---------------------------------------------------------------------------

export async function ordnerSpeichern(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const projektId = uuid(formular, "projekt_id");
  const name = text(formular, "name").slice(0, 120);
  if (!projektId || !name) return { fehler: "Bitte einen Ordnernamen angeben." };
  const sichtbarkeit = text(formular, "sichtbarkeit");
  const supabase = await serverClient();
  const { error } = await supabase.from("projekt_ordner").insert({
    mandant_id: sitzung.mandantId, projekt_id: projektId, name,
    sichtbarkeit: sichtbarkeit in SICHTBARKEIT ? sichtbarkeit : "interessent",
    sortierung: Math.trunc(zahlEinfach(formular, "sortierung") ?? 0),
  });
  if (error) return { fehler: "Der Ordner konnte nicht angelegt werden." };
  revalidatePath(`/projekte/${projektId}`);
  return { erfolg: "Ordner angelegt." };
}

export async function ordnerLoeschen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const projektId = uuid(formular, "projekt_id");
  if (!id || !projektId) return;
  const supabase = await serverClient();
  await supabase.from("projekt_ordner").delete().eq("id", id);
  revalidatePath(`/projekte/${projektId}`);
}

export async function projektDateiHochladen(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const projektId = uuid(formular, "projekt_id");
  const datei = formular.get("datei");
  if (!projektId || !(datei instanceof File) || datei.size === 0) return { fehler: "Bitte eine Datei wählen." };
  if (datei.size > 50 * 1024 * 1024) return { fehler: "Die Datei ist größer als 50 MB." };
  const kategorie = text(formular, "kategorie");
  const sichtbarkeit = text(formular, "sichtbarkeit");
  const supabase = await serverClient();
  const pfad = `${sitzung.mandantId}/projekte/${projektId}/${crypto.randomUUID()}-${dateinameSicher(datei.name)}`;
  const { error: up } = await supabase.storage.from(DOKUMENT_BUCKET).upload(pfad, Buffer.from(await datei.arrayBuffer()), { contentType: datei.type || "application/octet-stream" });
  if (up) return { fehler: "Die Datei konnte nicht abgelegt werden." };
  const { error } = await supabase.from("projekt_dateien").insert({
    mandant_id: sitzung.mandantId, projekt_id: projektId,
    einheit_id: uuid(formular, "einheit_id"), ordner_id: uuid(formular, "ordner_id"),
    kategorie: kategorie in DATEI_KATEGORIEN ? kategorie : "sonstiges",
    name: datei.name.slice(0, 300), pfad, bytes: datei.size, mime: datei.type || null,
    sichtbarkeit: sichtbarkeit in SICHTBARKEIT ? sichtbarkeit : "interessent",
    erstellt_von: sitzung.benutzerId,
  });
  if (error) {
    await supabase.storage.from(DOKUMENT_BUCKET).remove([pfad]);
    return { fehler: "Die Datei konnte nicht gespeichert werden." };
  }
  revalidatePath(`/projekte/${projektId}`);
  return { erfolg: `„${datei.name}“ abgelegt.` };
}

export async function projektDateiAendern(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const projektId = uuid(formular, "projekt_id");
  if (!id || !projektId) return;
  const supabase = await serverClient();
  if (formular.get("loeschen") === "1") {
    const { data } = await supabase.from("projekt_dateien").select("pfad").eq("id", id).maybeSingle();
    await supabase.from("projekt_dateien").delete().eq("id", id);
    if (data?.pfad) await supabase.storage.from(DOKUMENT_BUCKET).remove([data.pfad as string]).catch(() => null);
  } else {
    const sichtbarkeit = text(formular, "sichtbarkeit");
    const felder: Record<string, unknown> = {};
    if (sichtbarkeit in SICHTBARKEIT) felder["sichtbarkeit"] = sichtbarkeit;
    if (formular.has("ordner_id")) felder["ordner_id"] = uuid(formular, "ordner_id");
    if (formular.has("einheit_id")) felder["einheit_id"] = uuid(formular, "einheit_id");
    if (Object.keys(felder).length > 0) await supabase.from("projekt_dateien").update(felder).eq("id", id);
  }
  revalidatePath(`/projekte/${projektId}`);
}

export async function updateSpeichern(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const projektId = uuid(formular, "projekt_id");
  const titel = text(formular, "titel").slice(0, 200);
  if (!projektId || !titel) return { fehler: "Bitte einen Titel angeben." };
  const sichtbarkeit = text(formular, "sichtbarkeit");
  const supabase = await serverClient();
  const bilder: string[] = [];
  for (const f of formular.getAll("bilder")) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 15 * 1024 * 1024) continue;
    const pfad = `${sitzung.mandantId}/projekte/${projektId}/updates/${crypto.randomUUID()}-${dateinameSicher(f.name)}`;
    const { error } = await supabase.storage.from(DOKUMENT_BUCKET).upload(pfad, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
    if (!error) bilder.push(pfad);
    if (bilder.length >= 10) break;
  }
  const { error } = await supabase.from("projekt_updates").insert({
    mandant_id: sitzung.mandantId, projekt_id: projektId, titel,
    text: text(formular, "text").slice(0, 8000) || null, bilder,
    sichtbarkeit: sichtbarkeit in SICHTBARKEIT ? sichtbarkeit : "interessent",
    erstellt_von: sitzung.benutzerId,
  });
  if (error) return { fehler: "Die Meldung konnte nicht gespeichert werden." };
  revalidatePath(`/projekte/${projektId}`);
  return { erfolg: "Baufortschritt veröffentlicht." };
}

export async function updateLoeschen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const projektId = uuid(formular, "projekt_id");
  if (!id || !projektId) return;
  const supabase = await serverClient();
  const { data } = await supabase.from("projekt_updates").select("bilder").eq("id", id).maybeSingle();
  await supabase.from("projekt_updates").delete().eq("id", id);
  const bilder = (data?.bilder as string[] | null) ?? [];
  if (bilder.length > 0) await supabase.storage.from(DOKUMENT_BUCKET).remove(bilder).catch(() => null);
  revalidatePath(`/projekte/${projektId}`);
}

export async function gewerkSpeichern(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const projektId = uuid(formular, "projekt_id");
  const id = uuid(formular, "id");
  const gewerk = text(formular, "gewerk").slice(0, 120);
  if (!projektId || !gewerk) return { fehler: "Bitte das Gewerk angeben." };
  const felder = {
    gewerk,
    firma: text(formular, "firma").slice(0, 200) || null,
    name: text(formular, "name").slice(0, 200) || null,
    telefon: text(formular, "telefon").slice(0, 60) || null,
    email: text(formular, "email").slice(0, 200) || null,
    ort: text(formular, "ort").slice(0, 200) || null,
    info: text(formular, "info").slice(0, 2000) || null,
    fuer_kunden: formular.get("fuer_kunden") === "1",
    sortierung: Math.trunc(zahlEinfach(formular, "sortierung") ?? 0),
  };
  const supabase = await serverClient();
  const { error } = id
    ? await supabase.from("projekt_kontakte").update(felder).eq("id", id)
    : await supabase.from("projekt_kontakte").insert({ ...felder, mandant_id: sitzung.mandantId, projekt_id: projektId });
  if (error) return { fehler: "Der Ansprechpartner konnte nicht gespeichert werden." };
  revalidatePath(`/projekte/${projektId}`);
  return { erfolg: "Ansprechpartner gespeichert." };
}

export async function gewerkLoeschen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const projektId = uuid(formular, "projekt_id");
  if (!id || !projektId) return;
  const supabase = await serverClient();
  await supabase.from("projekt_kontakte").delete().eq("id", id);
  revalidatePath(`/projekte/${projektId}`);
}

// ---------------------------------------------------------------------------
// Kundenzugaenge (Eigentuemer, Kaeufer, Projekt-Interessenten)
// ---------------------------------------------------------------------------

function einladungsText(unternehmen: string, anzeigename: string, art: KundenArt, link: string, projektName: string | null): { betreff: string; text: string } {
  const bereich = projektName ? `Ihr Kundenbereich zum Projekt „${projektName}“` : art === "eigentuemer" ? "Ihr Eigentümer-Bereich" : art === "kaeufer" ? "Ihr Käufer-Bereich" : "Ihr Kundenbereich";
  return {
    betreff: `${bereich} bei ${unternehmen}`,
    text:
      `Guten Tag ${anzeigename},\n\n` +
      `${unternehmen} hat für Sie einen persönlichen Kundenbereich eingerichtet. ` +
      `Dort finden Sie Unterlagen, den aktuellen Stand und können uns direkt schreiben.\n\n` +
      `Ihr Zugangslink:\n${link}\n\n` +
      `Bitte behandeln Sie den Link vertraulich — er ist Ihr Zugang. Sie können im Bereich zusätzlich ein Passwort setzen.\n\n` +
      `Freundliche Grüße\n${unternehmen}`,
  };
}

/**
 * Zugang anlegen und Einladung verschicken. Fuer Eigentuemer/Kaeufer mit
 * Objekten (objekt_ids), fuer Projekte mit projekt_id und optionaler Einheit.
 */
export async function kundeEinladen(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const supabase = await serverClient();
  const artRoh = text(formular, "art");
  const art = (artRoh in KUNDEN_ART ? artRoh : "interessent") as KundenArt;
  const anzeigename = text(formular, "anzeigename").slice(0, 200);
  const email = text(formular, "email").toLowerCase().slice(0, 200);
  if (anzeigename.length < 2 || !z.email().safeParse(email).success) return { fehler: "Bitte Name und eine gültige E-Mail-Adresse angeben." };
  const projektId = uuid(formular, "projekt_id");
  const objektIds = formular.getAll("objekt_ids").map(String).filter((x) => z.uuid().safeParse(x).success);
  // Ohne Objekt ist der Zugang zunaechst leer — Objekte lassen sich in der Kundenakte nachtragen.
  const { token, hash } = tokenErzeugen();
  const { data: kunde, error } = await supabase
    .from("portal_kunden")
    .insert({
      mandant_id: sitzung.mandantId, art, anzeigename, email,
      telefon: text(formular, "telefon").slice(0, 60) || null,
      kontakt_id: uuid(formular, "kontakt_id"),
      token_hash: hash,
      ansprechpartner_id: uuid(formular, "ansprechpartner_id") ?? sitzung.benutzerId,
      projekt_id: projektId, einheit_id: uuid(formular, "einheit_id"),
      quelle: uuid(formular, "kontakt_id") ? "kontakt" : "einladung",
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !kunde) return { fehler: "Der Zugang konnte nicht angelegt werden." };
  const kundeId = kunde.id as string;
  if (objektIds.length > 0) {
    await supabase.from("portal_kunden_objekte").insert(objektIds.map((objekt_id) => ({ mandant_id: sitzung.mandantId, kunde_id: kundeId, objekt_id, vertrag_id: null })));
  }
  await supabase.from("portal_aktivitaeten").insert({ mandant_id: sitzung.mandantId, kunde_id: kundeId, art: "einladung", detail: `Eingeladen von ${sitzung.name}`, gesehen_am: new Date().toISOString() });
  const link = kundenLink(basisUrl(), token);
  const [{ data: mandant }, { data: projekt }] = await Promise.all([
    supabase.from("mandanten").select("name").eq("id", sitzung.mandantId).maybeSingle(),
    projektId ? supabase.from("projekte").select("name").eq("id", projektId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const inhalt = einladungsText((mandant?.name as string) ?? "Ihr Maklerbüro", anzeigename, art, link, (projekt?.name as string | null) ?? null);
  const versendet = await mailEinstellen(supabase, email, inhalt.betreff, inhalt.text, sitzung.email);
  revalidatePath("/kundenbereich");
  if (projektId) revalidatePath(`/projekte/${projektId}`);
  return {
    erfolg: versendet ? `Einladung an ${email} ist unterwegs.` : `Zugang angelegt. Ein Mail-Dienst ist nicht eingerichtet — bitte den Link selbst weitergeben.`,
    id: kundeId,
    link,
  };
}

/** Neuer Zugangslink (alter wird ungueltig) — mit Versand, wenn moeglich. */
export async function kundeLinkErneuern(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Zugang fehlt." };
  const supabase = await serverClient();
  const { data: k } = await supabase.from("portal_kunden").select("anzeigename, email, art, projekt_id").eq("id", id).maybeSingle();
  if (!k) return { fehler: "Zugang nicht gefunden." };
  const { token, hash } = tokenErzeugen();
  const { error } = await supabase.from("portal_kunden").update({ token_hash: hash, einladung_gueltig_bis: new Date(Date.now() + 30 * 86400000).toISOString(), aktiv: true }).eq("id", id);
  if (error) return { fehler: "Der Link konnte nicht erneuert werden." };
  const link = kundenLink(basisUrl(), token);
  const [{ data: mandant }, { data: projekt }] = await Promise.all([
    supabase.from("mandanten").select("name").eq("id", sitzung.mandantId).maybeSingle(),
    k.projekt_id ? supabase.from("projekte").select("name").eq("id", k.projekt_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const inhalt = einladungsText((mandant?.name as string) ?? "Ihr Maklerbüro", k.anzeigename as string, k.art as KundenArt, link, (projekt?.name as string | null) ?? null);
  const versendet = await mailEinstellen(supabase, k.email as string, inhalt.betreff, inhalt.text, sitzung.email);
  await supabase.from("portal_aktivitaeten").insert({ mandant_id: sitzung.mandantId, kunde_id: id, art: "einladung", detail: "Neuer Zugangslink", gesehen_am: new Date().toISOString() });
  revalidatePath(`/kundenbereich/${id}`);
  return { erfolg: versendet ? "Neuer Link verschickt." : "Neuer Link erzeugt — bitte selbst weitergeben.", link };
}

export async function kundeAendern(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  await schreibrecht();
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Zugang fehlt." };
  const supabase = await serverClient();
  const felder: Record<string, unknown> = {};
  if (formular.has("anzeigename")) felder["anzeigename"] = text(formular, "anzeigename").slice(0, 200);
  if (formular.has("telefon")) felder["telefon"] = text(formular, "telefon").slice(0, 60) || null;
  if (formular.has("ansprechpartner_id")) felder["ansprechpartner_id"] = uuid(formular, "ansprechpartner_id");
  if (formular.has("aktiv")) felder["aktiv"] = formular.get("aktiv") === "1";
  if (formular.has("fortschritt_stufe")) {
    const s = Math.trunc(zahlEinfach(formular, "fortschritt_stufe") ?? 1);
    felder["fortschritt_stufe"] = Math.min(FORTSCHRITT.length, Math.max(1, s));
  }
  if (formular.has("fortschritt_notiz")) felder["fortschritt_notiz"] = text(formular, "fortschritt_notiz").slice(0, 500) || null;
  if (formular.has("einheit_id")) felder["einheit_id"] = uuid(formular, "einheit_id");
  if (formular.has("art")) { const a = text(formular, "art"); if (a in KUNDEN_ART) felder["art"] = a; }
  if (formular.has("passwort_zuruecksetzen") && formular.get("passwort_zuruecksetzen") === "1") felder["passwort_hash"] = null;
  const { error } = await supabase.from("portal_kunden").update(felder).eq("id", id);
  if (error) return { fehler: "Konnte nicht gespeichert werden." };
  const { data } = await supabase.from("portal_kunden").select("projekt_id").eq("id", id).maybeSingle();
  revalidatePath(`/kundenbereich/${id}`);
  revalidatePath("/kundenbereich");
  if (data?.projekt_id) revalidatePath(`/projekte/${data.projekt_id as string}`);
  return { erfolg: "Gespeichert." };
}

export async function kundeLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "portal", "loeschen", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { data } = await supabase.from("portal_kunden").select("projekt_id").eq("id", id).maybeSingle();
  await supabase.from("portal_kunden").update({ geloescht_am: new Date().toISOString(), aktiv: false }).eq("id", id);
  revalidatePath("/kundenbereich");
  if (data?.projekt_id) { revalidatePath(`/projekte/${data.projekt_id as string}`); redirect(`/projekte/${data.projekt_id as string}`); }
  redirect("/kundenbereich");
}

export async function kundeObjektZuordnen(formular: FormData): Promise<void> {
  const sitzung = await schreibrecht();
  const kundeId = uuid(formular, "kunde_id");
  const objektId = uuid(formular, "objekt_id");
  if (!kundeId || !objektId) return;
  const supabase = await serverClient();
  if (formular.get("entfernen") === "1") {
    await supabase.from("portal_kunden_objekte").delete().eq("kunde_id", kundeId).eq("objekt_id", objektId);
  } else {
    await supabase.from("portal_kunden_objekte").upsert({ mandant_id: sitzung.mandantId, kunde_id: kundeId, objekt_id: objektId, vertrag_id: uuid(formular, "vertrag_id") }, { onConflict: "kunde_id,objekt_id" });
  }
  revalidatePath(`/kundenbereich/${kundeId}`);
}

/** Nachricht des Maklers an den Kunden — plus Mail-Hinweis, wenn ein Mail-Dienst da ist. */
export async function kundeNachrichtSenden(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const kundeId = uuid(formular, "kunde_id");
  const inhalt = text(formular, "text").slice(0, 5000);
  if (!kundeId || !inhalt) return { fehler: "Bitte einen Text eingeben." };
  const supabase = await serverClient();
  const { error } = await supabase.from("portal_nachrichten").insert({ mandant_id: sitzung.mandantId, kunde_id: kundeId, richtung: "makler", text: inhalt, benutzer_id: sitzung.benutzerId });
  if (error) return { fehler: "Die Nachricht konnte nicht gespeichert werden." };
  // Nachrichten des Kunden gelten damit als gelesen
  await supabase.from("portal_nachrichten").update({ gelesen_am: new Date().toISOString() }).eq("kunde_id", kundeId).eq("richtung", "kunde").is("gelesen_am", null);
  const { data: k } = await supabase.from("portal_kunden").select("email, anzeigename, projekt_id").eq("id", kundeId).maybeSingle();
  const { data: mandant } = await supabase.from("mandanten").select("name").eq("id", sitzung.mandantId).maybeSingle();
  let versendet = false;
  if (k) {
    versendet = await mailEinstellen(
      supabase, k.email as string,
      `Neue Nachricht von ${(mandant?.name as string) ?? "Ihrem Maklerbüro"}`,
      `Guten Tag ${k.anzeigename as string},\n\nin Ihrem Kundenbereich liegt eine neue Nachricht:\n\n${inhalt}\n\nSie können direkt über Ihren Zugangslink antworten.\n\nFreundliche Grüße\n${(mandant?.name as string) ?? ""}`,
      sitzung.email,
    );
  }
  revalidatePath(`/kundenbereich/${kundeId}`);
  if (k?.projekt_id) revalidatePath(`/projekte/${k.projekt_id as string}`);
  return { erfolg: versendet ? "Gesendet — der Kunde sieht die Nachricht im Kundenbereich und erhält eine E-Mail." : "Gesendet — der Kunde sieht die Nachricht im Kundenbereich." };
}

export async function kundeNachrichtenGelesen(formular: FormData): Promise<void> {
  await schreibrecht();
  const kundeId = uuid(formular, "kunde_id");
  if (!kundeId) return;
  const supabase = await serverClient();
  const jetzt = new Date().toISOString();
  await supabase.from("portal_nachrichten").update({ gelesen_am: jetzt }).eq("kunde_id", kundeId).eq("richtung", "kunde").is("gelesen_am", null);
  await supabase.from("portal_aktivitaeten").update({ gesehen_am: jetzt }).eq("kunde_id", kundeId).is("gesehen_am", null);
  await supabase.from("portal_dokumente").update({ gesehen_am: jetzt }).eq("kunde_id", kundeId).eq("hochgeladen_von", "kunde").is("gesehen_am", null);
  revalidatePath(`/kundenbereich/${kundeId}`);
  revalidatePath("/kundenbereich");
}

/** Persoenliche Unterlage fuer genau einen Kunden ablegen. */
export async function kundeDokumentHochladen(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const kundeId = uuid(formular, "kunde_id");
  const datei = formular.get("datei");
  if (!kundeId || !(datei instanceof File) || datei.size === 0) return { fehler: "Bitte eine Datei wählen." };
  if (datei.size > 50 * 1024 * 1024) return { fehler: "Die Datei ist größer als 50 MB." };
  const supabase = await serverClient();
  const pfad = `${sitzung.mandantId}/portal/${kundeId}/${crypto.randomUUID()}-${dateinameSicher(datei.name)}`;
  const { error: up } = await supabase.storage.from(DOKUMENT_BUCKET).upload(pfad, Buffer.from(await datei.arrayBuffer()), { contentType: datei.type || "application/octet-stream" });
  if (up) return { fehler: "Die Datei konnte nicht abgelegt werden." };
  const { error } = await supabase.from("portal_dokumente").insert({
    mandant_id: sitzung.mandantId, kunde_id: kundeId, objekt_id: uuid(formular, "objekt_id"),
    kategorie: text(formular, "kategorie").slice(0, 60) || "sonstiges",
    name: datei.name.slice(0, 300), pfad, bytes: datei.size, mime: datei.type || null, hochgeladen_von: "makler",
  });
  if (error) { await supabase.storage.from(DOKUMENT_BUCKET).remove([pfad]); return { fehler: "Die Unterlage konnte nicht gespeichert werden." }; }
  revalidatePath(`/kundenbereich/${kundeId}`);
  return { erfolg: `„${datei.name}“ für den Kunden abgelegt.` };
}

export async function kundeDokumentLoeschen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const kundeId = uuid(formular, "kunde_id");
  if (!id || !kundeId) return;
  const supabase = await serverClient();
  const { data } = await supabase.from("portal_dokumente").select("pfad").eq("id", id).maybeSingle();
  await supabase.from("portal_dokumente").delete().eq("id", id);
  if (data?.pfad) await supabase.storage.from(DOKUMENT_BUCKET).remove([data.pfad as string]).catch(() => null);
  revalidatePath(`/kundenbereich/${kundeId}`);
}

/** Signierte Adresse einer Datei fuer die Maklerseite (Bucket ist privat). */
export async function dateiLink(pfad: string): Promise<string | null> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "portal", "lesen", sitzung.uebersteuerung);
  if (!pfad.startsWith(`${sitzung.mandantId}/`)) return null;
  const supabase = await serverClient();
  const { data } = await supabase.storage.from(DOKUMENT_BUCKET).createSignedUrl(pfad, 600);
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Anfragen, Merkliste, Antraege
// ---------------------------------------------------------------------------

export async function anfrageBearbeiten(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const id = uuid(formular, "id");
  const status = text(formular, "status");
  if (!id || !["bestaetigt", "abgelehnt", "offen"].includes(status)) return { fehler: "Ungültige Angaben." };
  const supabase = await serverClient();
  const { data: a } = await supabase.from("projekt_anfragen").select("projekt_id, kunde_id, einheit_id, art").eq("id", id).maybeSingle();
  if (!a) return { fehler: "Anfrage nicht gefunden." };
  const { error } = await supabase.rpc("projekt_anfrage_bearbeiten", { p_anfrage: id, p_status: status });
  if (error) return { fehler: error.message };
  if (status !== "offen") {
    const { data: k } = await supabase.from("portal_kunden").select("email, anzeigename").eq("id", a.kunde_id as string).maybeSingle();
    const { data: e } = a.einheit_id ? await supabase.from("projekt_einheiten").select("we_nr").eq("id", a.einheit_id as string).maybeSingle() : { data: null };
    const { data: p } = await supabase.from("projekte").select("name").eq("id", a.projekt_id as string).maybeSingle();
    const antwort = text(formular, "antwort").slice(0, 3000);
    const artText = ANFRAGE_ART[a.art as keyof typeof ANFRAGE_ART] ?? "Anfrage";
    const nachricht =
      status === "bestaetigt"
        ? `Ihre ${artText}${e ? ` für ${e.we_nr as string}` : ""} im Projekt „${(p?.name as string) ?? ""}“ ist bestätigt.${antwort ? `\n\n${antwort}` : "\n\nWir melden uns mit den nächsten Schritten."}`
        : `Ihre ${artText}${e ? ` für ${e.we_nr as string}` : ""} im Projekt „${(p?.name as string) ?? ""}“ können wir leider nicht bestätigen.${antwort ? `\n\n${antwort}` : ""}`;
    await supabase.from("portal_nachrichten").insert({ mandant_id: sitzung.mandantId, kunde_id: a.kunde_id as string, richtung: "makler", text: nachricht, benutzer_id: sitzung.benutzerId });
    if (k) await mailEinstellen(supabase, k.email as string, `${artText} ${status === "bestaetigt" ? "bestätigt" : "nicht möglich"} — ${(p?.name as string) ?? ""}`, `Guten Tag ${k.anzeigename as string},\n\n${nachricht}\n\nFreundliche Grüße`, sitzung.email);
  }
  revalidatePath(`/projekte/${a.projekt_id as string}`);
  return { erfolg: status === "bestaetigt" ? "Anfrage bestätigt — Einheit reserviert, Kunde benachrichtigt." : status === "abgelehnt" ? "Anfrage abgelehnt, Kunde benachrichtigt." : "Anfrage wieder offen." };
}

export async function merklisteSetzen(formular: FormData): Promise<void> {
  const sitzung = await schreibrecht();
  const projektId = uuid(formular, "projekt_id");
  const kundeId = uuid(formular, "kunde_id");
  const einheitId = uuid(formular, "einheit_id");
  if (!projektId || !kundeId || !einheitId) return;
  const supabase = await serverClient();
  if (formular.get("entfernen") === "1") await supabase.from("projekt_merkliste").delete().eq("kunde_id", kundeId).eq("einheit_id", einheitId);
  else await supabase.from("projekt_merkliste").upsert({ mandant_id: sitzung.mandantId, projekt_id: projektId, kunde_id: kundeId, einheit_id: einheitId }, { onConflict: "kunde_id,einheit_id" });
  revalidatePath(`/projekte/${projektId}`);
}

export async function antragStatusSetzen(formular: FormData): Promise<void> {
  await schreibrecht();
  const id = uuid(formular, "id");
  const status = text(formular, "status");
  const kundeId = uuid(formular, "kunde_id");
  if (!id || !["in_arbeit", "eingereicht", "erledigt"].includes(status)) return;
  const supabase = await serverClient();
  await supabase.from("verbrauchsausweis_antraege").update({ status, erledigt_am: status === "erledigt" ? new Date().toISOString() : null }).eq("id", id);
  if (kundeId) revalidatePath(`/kundenbereich/${kundeId}`);
  revalidatePath("/kundenbereich");
}

/** Vom Kontakt aus: Zugang anlegen und die Objekte des Kontakts (Rolle Eigentuemer/Kaeufer) zuordnen. */
export async function kundeAusKontaktEinladen(_vorher: PortalErgebnis, formular: FormData): Promise<PortalErgebnis> {
  const sitzung = await schreibrecht();
  const kontaktId = uuid(formular, "kontakt_id");
  const artRoh = text(formular, "art");
  const art = (artRoh === "kaeufer" ? "kaeufer" : "eigentuemer") as KundenArt;
  if (!kontaktId) return { fehler: "Kontakt fehlt." };
  const supabase = await serverClient();
  const { data: k } = await supabase.from("kontakte").select("anrede, vorname, nachname, firma, email, telefon, mobil").eq("id", kontaktId).maybeSingle();
  if (!k) return { fehler: "Kontakt nicht gefunden." };
  const { data: rollen } = await supabase.from("kontakt_objekt").select("objekt_id, rolle").eq("kontakt_id", kontaktId).in("rolle", [art]);
  const fd = new FormData();
  fd.set("art", art);
  fd.set("anzeigename", [k.vorname, k.nachname].filter(Boolean).join(" ") || (k.firma as string) || "Kunde");
  fd.set("email", (k.email as string | null) ?? "");
  fd.set("telefon", (k.telefon as string | null) ?? (k.mobil as string | null) ?? "");
  fd.set("kontakt_id", kontaktId);
  fd.set("ansprechpartner_id", sitzung.benutzerId);
  for (const r of rollen ?? []) fd.append("objekt_ids", r.objekt_id as string);
  for (const o of formular.getAll("objekt_ids")) fd.append("objekt_ids", String(o));
  return kundeEinladen({}, fd);
}
