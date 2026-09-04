"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { BILD_BUCKET, bildPfad } from "@/lib/bilder";
import { pdfText } from "@/lib/dokument/pdf-text";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { geokodieren } from "@/lib/kalender/fahrzeit";
import { kiVerfuegbar } from "@/lib/ki";
import { bildAuslesen, heuristischAuslesen, strukturAuslesen } from "@/lib/ki/auslese";
import { BILD_ZWECKE, bildBearbeiten, bildKiVerfuegbar, type BildZweck } from "@/lib/ki/bild";
import { ENERGIEAUSWEISTYPEN } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";
import { grundrissLesen, polygonFlaecheM2 } from "@/lib/werkzeuge/grundriss";
import { infrastrukturErmitteln, type Infrastruktur } from "@/lib/werkzeuge/infrastruktur";
import { berechnen, blattLesen } from "@/lib/werkzeuge/wohnflaeche";

/**
 * Werkzeuge (docs/FUNKTIONSABGLEICH.md W1): Wohnflaechenrechner, Grundrisse,
 * Infrastruktur-Entfernungen, Energieausweis-Auslesung, Bildversionen aus
 * dem Bild-Editor (manuell und KI). PDF-Werkzeuge laufen vollstaendig im
 * Browser — Dateien verlassen ihn nicht.
 */

export interface WerkzeugErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  werte?: Record<string, string | null>;
  hinweis?: string;
  kiVerwendet?: boolean;
  infrastruktur?: Infrastruktur;
  bildBase64?: string;
  pfad?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function uuid(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return z.uuid().safeParse(w).success ? w : null;
}
function dataUrlBytes(dataUrl: string): { bytes: Buffer; mime: string } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  return { bytes: Buffer.from(m[2] ?? "", "base64"), mime: m[1] ?? "image/png" };
}

// ---------------------------------------------------------------------------
// Wohnflaechenrechner
// ---------------------------------------------------------------------------

export async function wohnflaecheSpeichern(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  let blatt;
  try {
    blatt = blattLesen(JSON.parse(text(formular, "blatt") || "{}"));
  } catch {
    return { fehler: "Die Berechnung konnte nicht gelesen werden." };
  }
  const e = berechnen(blatt);
  const supabase = await serverClient();
  const id = uuid(formular, "id");
  const felder = { objekt_id: uuid(formular, "objekt_id"), bezeichnung: (blatt.bezeichnung || "Wohnflächenberechnung").slice(0, 200), blatt, wohnflaeche: e.wohnflaeche, grundflaeche: e.grundflaeche };
  if (id) {
    const { error } = await supabase.from("wohnflaechen_berechnungen").update(felder).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Die Berechnung konnte nicht gespeichert werden." };
    revalidatePath(`/werkzeuge/wohnflaeche/${id}`);
    return { erfolg: `Gespeichert — Wohnfläche ${e.wohnflaeche.toLocaleString("de-DE", { minimumFractionDigits: 2 })} m².`, id };
  }
  const { data, error } = await supabase.from("wohnflaechen_berechnungen").insert({ mandant_id: sitzung.mandantId, ...felder, erstellt_von: sitzung.benutzerId }).select("id").single();
  if (error || !data) return { fehler: "Die Berechnung konnte nicht angelegt werden." };
  revalidatePath("/werkzeuge/wohnflaeche");
  redirect(`/werkzeuge/wohnflaeche/${data.id as string}`);
}

/** Ergebnis in die Objektakte uebernehmen (objekte.wohnflaeche). */
export async function wohnflaecheUebernehmen(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannte Berechnung." };
  const supabase = await serverClient();
  const { data: b } = await supabase.from("wohnflaechen_berechnungen").select("objekt_id, wohnflaeche").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!b?.objekt_id) return { fehler: "Die Berechnung ist keinem Objekt zugeordnet." };
  const { error } = await supabase.from("objekte").update({ wohnflaeche: Number(b.wohnflaeche) }).eq("id", b.objekt_id as string).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Wohnfläche konnte nicht übernommen werden." };
  await supabase.from("wohnflaechen_berechnungen").update({ uebernommen_am: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/objekte/${b.objekt_id as string}`);
  revalidatePath(`/werkzeuge/wohnflaeche/${id}`);
  return { erfolg: `Wohnfläche ${Number(b.wohnflaeche).toLocaleString("de-DE", { minimumFractionDigits: 2 })} m² ins Objekt übernommen.` };
}

export async function wohnflaecheLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("wohnflaechen_berechnungen").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/werkzeuge/wohnflaeche");
  redirect("/werkzeuge/wohnflaeche");
}

// ---------------------------------------------------------------------------
// Grundrisse
// ---------------------------------------------------------------------------

export async function grundrissSpeichern(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  let g;
  try {
    g = grundrissLesen(JSON.parse(text(formular, "daten") || "{}"));
  } catch {
    return { fehler: "Der Grundriss konnte nicht gelesen werden." };
  }
  // Die Vorlage (Bild) wird nicht im JSON gespeichert, sondern getrennt im Bucket
  const vorlageDataUrl = g.vorlage?.quelle.startsWith("data:") ? g.vorlage.quelle : null;
  const quelleRoh = text(formular, "quelle");
  const quelle = quelleRoh === "scan" || quelleRoh === "aufbereitet" ? quelleRoh : "editor";
  const supabase = await serverClient();
  const id = uuid(formular, "id");
  const objektId = uuid(formular, "objekt_id");
  let vorlagePfad: string | null = text(formular, "vorlage_pfad") || null;
  if (vorlageDataUrl) {
    const d = dataUrlBytes(vorlageDataUrl);
    if (d && d.bytes.byteLength <= 8 * 1024 * 1024) {
      const pfad = `${sitzung.mandantId}/grundrisse/${id ?? crypto.randomUUID()}-vorlage.${d.mime === "image/png" ? "png" : d.mime === "image/webp" ? "webp" : "jpg"}`;
      const { error } = await supabase.storage.from(DOKUMENT_BUCKET).upload(pfad, d.bytes, { contentType: d.mime, upsert: true });
      if (!error) vorlagePfad = pfad;
    }
  }
  const daten = { ...g, vorlage: g.vorlage ? { ...g.vorlage, quelle: vorlagePfad ?? "" } : null };
  const felder = { objekt_id: objektId, bezeichnung: (g.titel || "Grundriss").slice(0, 200), quelle, daten, vorlage_pfad: vorlagePfad };
  if (id) {
    const { error } = await supabase.from("grundrisse").update(felder).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Der Grundriss konnte nicht gespeichert werden." };
    revalidatePath(`/werkzeuge/grundriss/${id}`);
    return { erfolg: "Grundriss gespeichert.", id };
  }
  const { data, error } = await supabase.from("grundrisse").insert({ mandant_id: sitzung.mandantId, ...felder, erstellt_von: sitzung.benutzerId }).select("id").single();
  if (error || !data) return { fehler: "Der Grundriss konnte nicht angelegt werden." };
  revalidatePath("/werkzeuge/grundriss");
  redirect(`/werkzeuge/grundriss/${data.id as string}`);
}

/** Grundriss-PNG als Objektbild (Art „grundriss") ablegen. */
export async function grundrissAlsBild(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  const objektId = uuid(formular, "objekt_id");
  const d = dataUrlBytes(text(formular, "png"));
  if (!objektId || !d) return { fehler: "Bitte ein Objekt wählen und den Grundriss zeichnen." };
  if (d.bytes.byteLength > 10 * 1024 * 1024) return { fehler: "Das Bild ist zu groß." };
  const supabase = await serverClient();
  const pfad = bildPfad(sitzung.mandantId, objektId, "grundriss.png");
  const { error: up } = await supabase.storage.from(BILD_BUCKET).upload(pfad, d.bytes, { contentType: "image/png", upsert: false });
  if (up) return { fehler: "Das Bild konnte nicht abgelegt werden." };
  const { count } = await supabase.from("objekt_bilder").select("id", { count: "exact", head: true }).eq("objekt_id", objektId);
  const { data: bild, error } = await supabase.from("objekt_bilder").insert({ mandant_id: sitzung.mandantId, objekt_id: objektId, pfad, art: "grundriss", titel: text(formular, "titel").slice(0, 200) || "Grundriss", mime: "image/png", bytes: d.bytes.byteLength, reihenfolge: count ?? 0, ist_titelbild: false, erstellt_von: sitzung.benutzerId }).select("id").single();
  if (error || !bild) {
    await supabase.storage.from(BILD_BUCKET).remove([pfad]);
    return { fehler: "Das Bild konnte nicht gespeichert werden." };
  }
  if (id) await supabase.from("grundrisse").update({ bild_id: bild.id as string, objekt_id: objektId }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath(`/objekte/${objektId}`);
  return { erfolg: "Grundriss als Objektbild abgelegt.", id: bild.id as string };
}

export async function grundrissLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: g } = await supabase.from("grundrisse").select("vorlage_pfad").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  await supabase.from("grundrisse").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (g?.vorlage_pfad) await supabase.storage.from(DOKUMENT_BUCKET).remove([g.vorlage_pfad as string]).catch(() => null);
  revalidatePath("/werkzeuge/grundriss");
  redirect("/werkzeuge/grundriss");
}

/** Raeume eines Grundrisses als Wohnflaechenblatt anlegen. */
export async function grundrissZurWohnflaeche(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Grundriss." };
  const supabase = await serverClient();
  const { data: g } = await supabase.from("grundrisse").select("objekt_id, bezeichnung, daten").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!g) return { fehler: "Unbekannter Grundriss." };
  const gr = grundrissLesen(g.daten);
  const raeume = gr.raeume.filter((r) => r.polygon.length >= 3).map((r) => ({ name: r.name, flaecheM2: polygonFlaecheM2(r.polygon) }));
  if (raeume.length === 0) return { fehler: "Der Grundriss hat noch keine Räume — bitte Räume mit dem Raum-Werkzeug einzeichnen." };
  const blatt = { bezeichnung: `${g.bezeichnung as string} (aus Grundriss)`, adresse: "", hinweis: "Flächen aus dem Grundriss; lichte Maße und Dachschrägen bitte prüfen.", geschosse: [{ id: "g1", name: "Geschoss", raeume: raeume.map((r, i) => ({ id: `r${i + 1}`, name: r.name, teile: [{ id: `t${i + 1}`, bezeichnung: "aus Grundriss", laenge: null, breite: null, flaeche: r.flaecheM2, art: "voll" as const, abzug: false }] })) }] };
  const e = berechnen(blatt);
  const { data, error } = await supabase.from("wohnflaechen_berechnungen").insert({ mandant_id: sitzung.mandantId, objekt_id: g.objekt_id, bezeichnung: blatt.bezeichnung.slice(0, 200), blatt, wohnflaeche: e.wohnflaeche, grundflaeche: e.grundflaeche, erstellt_von: sitzung.benutzerId }).select("id").single();
  if (error || !data) return { fehler: "Die Berechnung konnte nicht angelegt werden." };
  redirect(`/werkzeuge/wohnflaeche/${data.id as string}`);
}

// ---------------------------------------------------------------------------
// Infrastruktur / Entfernungen am Objekt
// ---------------------------------------------------------------------------

export async function infrastrukturErmittelnAktion(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const objektId = uuid(formular, "objekt_id");
  if (!objektId) return { fehler: "Unbekanntes Objekt." };
  const supabase = await serverClient();
  const { data: o } = await supabase.from("objekte").select("strasse, hausnummer, plz, ort, lat, lon").eq("id", objektId).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!o) return { fehler: "Unbekanntes Objekt." };
  const adresse = [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (!adresse) return { fehler: "Das Objekt hat keine Anschrift." };
  let standort = o.lat !== null && o.lon !== null && o.lat !== undefined ? { lat: Number(o.lat), lon: Number(o.lon) } : null;
  if (!standort) {
    const { data: c } = await supabase.rpc("geokodierung_holen", { p_adresse: adresse });
    const k = c as { lat?: number; lon?: number } | null;
    standort = k && typeof k.lat === "number" && typeof k.lon === "number" ? { lat: k.lat, lon: k.lon } : await geokodieren(adresse);
    if (standort) {
      await supabase.rpc("geokodierung_merken", { p_adresse: adresse, p_lat: standort.lat, p_lon: standort.lon });
      await supabase.from("objekte").update({ lat: standort.lat, lon: standort.lon }).eq("id", objektId).eq("mandant_id", sitzung.mandantId);
    }
  }
  if (!standort) return { fehler: `Die Anschrift „${adresse}“ konnte nicht verortet werden (Geokodierung nicht erreichbar oder unbekannt).` };
  const infra = await infrastrukturErmitteln(standort, adresse);
  if (!infra) return { fehler: "Die Kartendaten (OpenStreetMap/Overpass) sind gerade nicht erreichbar — bitte später noch einmal versuchen." };
  await supabase.from("objekte").update({ infrastruktur: infra, infrastruktur_am: infra.ermittelt_am }).eq("id", objektId).eq("mandant_id", sitzung.mandantId);
  revalidatePath(`/objekte/${objektId}`);
  return { erfolg: `${infra.einrichtungen.length} Einrichtungen gefunden.`, infrastruktur: infra };
}

// ---------------------------------------------------------------------------
// Energieausweis auslesen (PDF oder Foto) — Werte gehen in ein editierbares Formular
// ---------------------------------------------------------------------------

const ENERGIE_FELDER = [
  { schluessel: "energieausweis_typ", beschreibung: "Ausweisart: bedarf oder verbrauch (Bedarfsausweis/Verbrauchsausweis)" },
  { schluessel: "energie_kennwert", beschreibung: "Endenergiekennwert in kWh/(m²·a) als Zahl (Endenergiebedarf bzw. Endenergieverbrauch)" },
  { schluessel: "energie_klasse", beschreibung: "Effizienzklasse A+ bis H" },
  { schluessel: "energie_traeger", beschreibung: "Wesentlicher Energieträger der Heizung (z. B. Gas, Öl, Fernwärme, Wärmepumpe/Strom, Pellets)" },
  { schluessel: "energie_baujahr_anlage", beschreibung: "Baujahr der Heizungsanlage (Wärmeerzeuger) als Jahreszahl" },
  { schluessel: "energie_warmwasser_enthalten", beschreibung: "Warmwasser im Kennwert enthalten: ja oder nein" },
  { schluessel: "energie_gueltig_bis", beschreibung: "Gültig bis, als Datum JJJJ-MM-TT" },
  { schluessel: "baujahr", beschreibung: "Baujahr des Gebäudes laut Ausweis" },
];

export async function energieausweisAuslesen(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const objektId = uuid(formular, "objekt_id");
  const datei = formular.get("datei");
  if (!objektId) return { fehler: "Unbekanntes Objekt." };
  if (!(datei instanceof File) || datei.size === 0) return { fehler: "Bitte den Energieausweis als PDF oder Foto auswählen." };
  if (datei.size > 15 * 1024 * 1024) return { fehler: "Die Datei ist größer als 15 MB." };
  const istPdf = datei.type === "application/pdf" || datei.name.toLowerCase().endsWith(".pdf");
  const istBild = ["image/jpeg", "image/png", "image/webp"].includes(datei.type);
  if (!istPdf && !istBild) return { fehler: "Nur PDF, JPEG, PNG oder WebP." };
  const supabase = await serverClient();
  const bytes = Buffer.from(await datei.arrayBuffer());

  // Ablage als Unterlage (Art energieausweis) — die Auslesung ist ein Zusatz
  const pfad = `${sitzung.mandantId}/${objektId}/${crypto.randomUUID()}.${istPdf ? "pdf" : datei.type === "image/png" ? "png" : datei.type === "image/webp" ? "webp" : "jpg"}`;
  const { error: up } = await supabase.storage.from(DOKUMENT_BUCKET).upload(pfad, bytes, { contentType: datei.type || "application/octet-stream", upsert: false });
  if (!up) {
    await supabase.from("objekt_dokumente").insert({ mandant_id: sitzung.mandantId, objekt_id: objektId, pfad, dateiname: datei.name.slice(0, 200), art: "energieausweis", titel: "Energieausweis", mime: datei.type || "application/pdf", bytes: bytes.byteLength, sichtbarkeit: "intern", erstellt_von: sitzung.benutzerId });
  }

  const mitKi = kiVerfuegbar();
  let vorgang: string | null = null;
  if (mitKi) {
    const { data, error } = await supabase.rpc("credits_reservieren", { p_aktion: "ki_energieausweis", p_referenz_art: "objekt", p_referenz_id: objektId });
    if (error) return { fehler: `Unterlage gespeichert, aber keine Auslesung möglich: ${error.message}` };
    vorgang = data as string;
  }
  try {
    let werte: Record<string, string | null> = {};
    let hinweis = "";
    let kiVerwendet = false;
    if (istPdf) {
      const inhalt = await pdfText(bytes).catch(() => "");
      if (!inhalt.trim()) throw new Error("Das PDF enthält keinen lesbaren Text (Scan) — bitte als Foto hochladen.");
      const e = await strukturAuslesen({ zweck: "energieausweis", text: inhalt, felder: ENERGIE_FELDER, credits: 2 });
      werte = e.kiVerwendet ? e.werte : heuristischAuslesen(inhalt, ENERGIE_FELDER);
      hinweis = e.hinweis;
      kiVerwendet = e.kiVerwendet;
      if (vorgang) await supabase.rpc("credits_einloesen", { p_vorgang: vorgang, p_kosten_cent: e.kostenCent });
    } else {
      const e = await bildAuslesen({ zweck: "beleg", bildBase64: bytes.toString("base64"), mime: datei.type, credits: 2 });
      werte = e.werte;
      hinweis = e.hinweis;
      kiVerwendet = e.kiVerwendet;
      if (vorgang) await supabase.rpc("credits_einloesen", { p_vorgang: vorgang, p_kosten_cent: e.kostenCent });
    }
    // Werte normalisieren — der Nutzer bestaetigt sie im Formular
    const typ = (werte["energieausweis_typ"] ?? "").toLowerCase();
    werte["energieausweis_typ"] = typ.includes("bedarf") ? "bedarf" : typ.includes("verbrauch") ? "verbrauch" : null;
    const kennwert = (werte["energie_kennwert"] ?? "").replace(/[^\d,.]/g, "").replace(",", ".");
    werte["energie_kennwert"] = kennwert && Number.isFinite(Number(kennwert)) ? String(Number(kennwert)) : null;
    const klasse = (werte["energie_klasse"] ?? "").toUpperCase().replace(/\s+/g, "");
    werte["energie_klasse"] = /^(A\+|[A-H])$/.test(klasse) ? klasse : null;
    const ww = (werte["energie_warmwasser_enthalten"] ?? "").toLowerCase();
    werte["energie_warmwasser_enthalten"] = ww.startsWith("ja") || ww === "true" ? "ja" : ww.startsWith("nein") || ww === "false" ? "nein" : null;
    revalidatePath(`/objekte/${objektId}`);
    return { erfolg: kiVerwendet ? "Ausweis abgelegt und ausgelesen — bitte die Werte prüfen und übernehmen." : "Ausweis abgelegt. Ohne Modellzugang nur einfache Erkennung — bitte die Werte prüfen.", werte, hinweis, kiVerwendet, pfad };
  } catch (e) {
    if (vorgang) await supabase.rpc("credits_freigeben", { p_vorgang: vorgang, p_grund: (e instanceof Error ? e.message : "Fehler").slice(0, 200) });
    return { fehler: `Ausweis abgelegt, Auslesung fehlgeschlagen — ${e instanceof Error ? e.message : "unbekannter Fehler"}`, pfad };
  }
}

/** Bestaetigte Energiewerte ins Objekt schreiben. */
export async function energiewerteUebernehmen(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const objektId = uuid(formular, "objekt_id");
  if (!objektId) return { fehler: "Unbekanntes Objekt." };
  const typ = text(formular, "energieausweis_typ");
  const kennwert = Number(text(formular, "energie_kennwert").replace(",", "."));
  const klasse = text(formular, "energie_klasse").toUpperCase();
  const baujahrAnlage = Number(text(formular, "energie_baujahr_anlage"));
  const baujahr = Number(text(formular, "baujahr"));
  const gueltig = text(formular, "energie_gueltig_bis");
  const ww = text(formular, "energie_warmwasser_enthalten");
  const felder: Record<string, unknown> = {
    ...(typ in ENERGIEAUSWEISTYPEN ? { energieausweis_typ: typ } : {}),
    ...(Number.isFinite(kennwert) && text(formular, "energie_kennwert") ? { energie_kennwert: kennwert } : {}),
    ...(/^(A\+|[A-H])$/.test(klasse) ? { energie_klasse: klasse } : {}),
    ...(text(formular, "energie_traeger") ? { energie_traeger: text(formular, "energie_traeger").slice(0, 100) } : {}),
    ...(baujahrAnlage >= 1900 && baujahrAnlage <= 2100 ? { energie_baujahr_anlage: baujahrAnlage } : {}),
    ...(baujahr >= 1500 && baujahr <= 2100 ? { baujahr } : {}),
    ...(ww === "ja" || ww === "nein" ? { energie_warmwasser_enthalten: ww === "ja" } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(gueltig) ? { energie_gueltig_bis: gueltig } : {}),
  };
  if (Object.keys(felder).length === 0) return { fehler: "Keine gültigen Werte zum Übernehmen." };
  const supabase = await serverClient();
  const { error } = await supabase.from("objekte").update(felder).eq("id", objektId).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Werte konnten nicht übernommen werden." };
  revalidatePath(`/objekte/${objektId}`);
  return { erfolg: "Energiewerte übernommen." };
}

// ---------------------------------------------------------------------------
// Bild-Editor: Versionen speichern, KI-Bearbeitung
// ---------------------------------------------------------------------------

/** Bearbeitetes Bild als neue Version ablegen — das Original bleibt unveraendert. */
export async function bildVersionSpeichern(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const objektId = uuid(formular, "objekt_id");
  const originalId = uuid(formular, "original_id");
  const d = dataUrlBytes(text(formular, "bild"));
  const bearbeitung = text(formular, "bearbeitung").slice(0, 500) || "Bearbeitet im Bild-Editor";
  if (!objektId || !d) return { fehler: "Bild oder Objekt fehlt." };
  if (d.bytes.byteLength > 20 * 1024 * 1024) return { fehler: "Das Bild ist größer als 20 MB." };
  const supabase = await serverClient();
  let art = "innen";
  let titel: string | null = null;
  if (originalId) {
    const { data: orig } = await supabase.from("objekt_bilder").select("art, titel, objekt_id").eq("id", originalId).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (!orig || orig.objekt_id !== objektId) return { fehler: "Das Originalbild gehört nicht zu diesem Objekt." };
    art = orig.art as string;
    titel = (orig.titel as string | null) ?? null;
  }
  const endung = d.mime === "image/png" ? "png" : d.mime === "image/webp" ? "webp" : "jpg";
  const pfad = bildPfad(sitzung.mandantId, objektId, `bearbeitet.${endung}`);
  const { error: up } = await supabase.storage.from(BILD_BUCKET).upload(pfad, d.bytes, { contentType: d.mime, upsert: false });
  if (up) return { fehler: "Das Bild konnte nicht abgelegt werden." };
  const { count } = await supabase.from("objekt_bilder").select("id", { count: "exact", head: true }).eq("objekt_id", objektId);
  const { data: bild, error } = await supabase.from("objekt_bilder").insert({
    mandant_id: sitzung.mandantId, objekt_id: objektId, pfad, art: text(formular, "art") || art, titel: text(formular, "titel").slice(0, 200) || titel, mime: d.mime, bytes: d.bytes.byteLength,
    reihenfolge: count ?? 0, ist_titelbild: false, original_id: originalId, bearbeitung, ki_bearbeitet: text(formular, "ki") === "1", erstellt_von: sitzung.benutzerId,
  }).select("id").single();
  if (error || !bild) {
    await supabase.storage.from(BILD_BUCKET).remove([pfad]);
    return { fehler: "Die Version konnte nicht gespeichert werden." };
  }
  revalidatePath(`/objekte/${objektId}`);
  revalidatePath(`/werkzeuge/bild-editor`);
  return { erfolg: "Als neue Version am Objekt gespeichert.", id: bild.id as string, pfad };
}

/** KI-Bearbeitung eines Bilds (Himmel, Retusche, Home Staging, Optimierung) — liefert das Ergebnis zum Vergleich, gespeichert wird erst auf Wunsch. */
export async function bildKiBearbeiten(_vorher: WerkzeugErgebnis, formular: FormData): Promise<WerkzeugErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const zweck = text(formular, "zweck");
  if (!(zweck in BILD_ZWECKE)) return { fehler: "Unbekannte Bearbeitung." };
  const d = dataUrlBytes(text(formular, "bild"));
  if (!d) return { fehler: "Kein Bild übergeben." };
  if (d.bytes.byteLength > 12 * 1024 * 1024) return { fehler: "Bitte das Bild vorher auf höchstens 12 MB verkleinern (Werkzeug „Größe“)." };
  if (!bildKiVerfuegbar()) return { fehler: "Kein Modellzugang eingerichtet (OPENAI_API_KEY) — die KI-Bearbeitung ist deshalb nicht verfügbar. Zuschnitt, Korrekturen, Weichzeichnen, Text und Logo funktionieren ohne KI." };
  const supabase = await serverClient();
  const objektId = uuid(formular, "objekt_id");
  const { data: vorgang, error } = await supabase.rpc("credits_reservieren", { p_aktion: BILD_ZWECKE[zweck as BildZweck].aktion, p_referenz_art: "objekt", p_referenz_id: objektId });
  if (error) return { fehler: `Keine Credits reserviert: ${error.message}` };
  try {
    const e = await bildBearbeiten({ zweck: zweck as BildZweck, bildBase64: d.bytes.toString("base64"), mime: d.mime, hinweis: text(formular, "hinweis") || undefined });
    await supabase.rpc("credits_einloesen", { p_vorgang: vorgang as string, p_kosten_cent: e.kostenCent });
    return { erfolg: `${BILD_ZWECKE[zweck as BildZweck].bezeichnung} — Ergebnis bereit. Vorher/Nachher prüfen, dann als Version speichern.`, bildBase64: `data:image/png;base64,${e.bildBase64}`, kiVerwendet: true };
  } catch (e) {
    await supabase.rpc("credits_freigeben", { p_vorgang: vorgang as string, p_grund: (e instanceof Error ? e.message : "Fehler").slice(0, 200) });
    return { fehler: `KI-Bearbeitung fehlgeschlagen — ${e instanceof Error ? e.message : "unbekannter Fehler"} (Credits wurden freigegeben).` };
  }
}
