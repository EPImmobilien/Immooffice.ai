"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { entschluesseln, verschluesseln } from "@/integrationen/kern/zugangsdaten";
import { TERMINARTEN, type Terminart } from "@/lib/arbeitsmittel";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import { terminArtText, terminBestaetigungBetreff, terminBestaetigungText, terminOrtText } from "@/lib/kalender/bestaetigung";
import { fahrtenPlanen, geokodieren, route, type Fahrt, type Fahrzeiten, type Koordinate, type Nachbar } from "@/lib/kalender/fahrzeit";
import { regelAusWahl, serienDaten, type SerienRegel, type SerieTakt, type SerieWahl, SERIE_WAHL } from "@/lib/kalender/serie";
import { kalenderAbgleichen, kalenderAnbieterErzeugen } from "@/lib/kalender/sync";
import { ausBerlin, berlin, tagPlus } from "@/lib/kalender/zeit";
import { oauthKonfig } from "@/lib/postfach/oauth";
import { zugangParsen } from "@/lib/postfach/typen";
import { dienstClient } from "@/lib/supabase/dienst";
import { serverClient } from "@/lib/supabase/server";
import { kiVerfuegbar, textAnbieter } from "@/lib/ki";

/**
 * Kalender (docs/FUNKTIONSABGLEICH.md K1/K2): Termine mit Teilnehmern,
 * Ganztag, Serie, Erinnerung, Nachfassen, privat; Fahrzeiten; Terminbestaetigung
 * ueber das Postfach; persoenliche Einstellungen; ICS-Abo; Abgleich mit
 * Google/Microsoft ueber das verbundene Postfach.
 */

export interface KalenderErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  anzahl?: number;
  fahrzeit?: Fahrzeiten;
  token?: string;
  /** Dublettenwarnung: gleicher Termin existiert schon — Rueckfrage im Dialog. */
  doppelt?: string;
  /** Bestaetigungstext (KI-Vorschlag oder Vorlage). */
  text?: string;
  kiVerwendet?: boolean;
  hinweis?: string;
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
function uuids(formular: FormData, feld: string): string[] {
  return formular.getAll(feld).map((w) => String(w).trim()).filter((w) => z.uuid().safeParse(w).success);
}
function zahl(formular: FormData, feld: string, standard: number): number {
  const n = Number(text(formular, feld).replace(",", "."));
  return Number.isFinite(n) ? n : standard;
}

type Supabase = Awaited<ReturnType<typeof serverClient>>;

const ARTEN = Object.keys(TERMINARTEN) as [Terminart, ...Terminart[]];

interface TerminFelder {
  titel: string;
  art: Terminart;
  beginnt_am: string;
  endet_am: string;
  ganztags: boolean;
  ort: string | null;
  notiz: string | null;
  objekt_id: string | null;
  kontakt_id: string | null;
  zustaendig_id: string;
  teilnehmer: string[];
  privat: boolean;
  erinnerung_minuten: number | null;
  nachfassen: boolean;
  erinnerung_kunde: boolean;
}

function terminFelder(formular: FormData, sitzung: Sitzung): { felder: TerminFelder; datum: string; zeit: string; dauer: number } | { fehler: string } {
  const titel = text(formular, "titel").slice(0, 300);
  if (!titel) return { fehler: "Bitte einen Anlass angeben." };
  const artRoh = text(formular, "art");
  const art = (ARTEN as string[]).includes(artRoh) ? (artRoh as Terminart) : "besichtigung";
  const datum = text(formular, "datum");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { fehler: "Bitte ein Datum angeben." };
  const ganztags = text(formular, "ganztags") === "1";
  const zeit = /^\d{2}:\d{2}$/.test(text(formular, "zeit")) ? text(formular, "zeit") : "09:00";
  const dauer = Math.max(5, Math.min(1440, Math.round(zahl(formular, "dauer_minuten", 60))));
  let beginn: Date;
  let ende: Date;
  if (ganztags) {
    const datumEnde = /^\d{4}-\d{2}-\d{2}$/.test(text(formular, "datum_ende")) && text(formular, "datum_ende") >= datum ? text(formular, "datum_ende") : datum;
    beginn = ausBerlin(datum, "00:00");
    ende = ausBerlin(tagPlus(datumEnde, 1), "00:00");
  } else {
    beginn = ausBerlin(datum, zeit);
    ende = new Date(beginn.getTime() + dauer * 60_000);
  }
  const erinnerungRoh = text(formular, "erinnerung_minuten");
  const erinnerung = erinnerungRoh === "" || erinnerungRoh === "keine" ? null : Math.max(0, Math.min(20160, Math.round(Number(erinnerungRoh) || 0)));
  return {
    datum, zeit, dauer,
    felder: {
      titel, art,
      beginnt_am: beginn.toISOString(),
      endet_am: ende.toISOString(),
      ganztags,
      ort: optional(formular, "ort")?.slice(0, 300) ?? null,
      notiz: optional(formular, "notiz")?.slice(0, 2000) ?? null,
      objekt_id: uuid(formular, "objekt_id"),
      kontakt_id: uuid(formular, "kontakt_id"),
      zustaendig_id: uuid(formular, "zustaendig_id") ?? sitzung.benutzerId,
      teilnehmer: uuids(formular, "teilnehmer"),
      privat: text(formular, "privat") === "1",
      erinnerung_minuten: erinnerung,
      nachfassen: text(formular, "nachfassen") !== "0",
      erinnerung_kunde: text(formular, "erinnerung_kunde") !== "0",
    },
  };
}

function serieAusFormular(formular: FormData): SerienRegel | null {
  const wahl = text(formular, "serie_wahl") in SERIE_WAHL ? (text(formular, "serie_wahl") as SerieWahl) : "keine";
  const eigen: SerienRegel = {
    takt: (["tag", "woche", "monat", "jahr"] as SerieTakt[]).includes(text(formular, "serie_takt") as SerieTakt) ? (text(formular, "serie_takt") as SerieTakt) : "woche",
    intervall: Math.max(1, Math.min(52, Math.round(zahl(formular, "serie_intervall", 1)))),
    wochentage: formular.getAll("serie_wochentage").map(Number).filter((n) => n >= 1 && n <= 7),
    ende_art: text(formular, "serie_ende_art") === "datum" ? "datum" : "anzahl",
    anzahl: Math.max(1, Math.min(200, Math.round(zahl(formular, "serie_anzahl", 10)))),
    bis: /^\d{4}-\d{2}-\d{2}$/.test(text(formular, "serie_bis")) ? text(formular, "serie_bis") : null,
  };
  return regelAusWahl(wahl, eigen);
}

async function seiten(objektId: string | null, kontaktId: string | null, terminId?: string) {
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
  if (terminId) revalidatePath(`/kalender/${terminId}`);
  if (objektId) revalidatePath(`/objekte/${objektId}`);
  if (kontaktId) revalidatePath(`/kontakte/${kontaktId}`);
}

// ---------------------------------------------------------------------------
// Termin anlegen / speichern / loeschen
// ---------------------------------------------------------------------------

export async function terminSpeichern(_vorher: KalenderErgebnis, formular: FormData): Promise<KalenderErgebnis> {
  const sitzung = await sitzungErzwingen();
  const id = uuid(formular, "id");
  rechtErzwingen(sitzung.rolle, "kalender", id ? "aendern" : "anlegen", sitzung.uebersteuerung);
  const geprueft = terminFelder(formular, sitzung);
  if ("fehler" in geprueft) return { fehler: geprueft.fehler };
  const { felder, datum, zeit, dauer } = geprueft;
  const supabase = await serverClient();
  const bestaetigen = text(formular, "bestaetigung") === "1";

  if (id) {
    const { data: alt } = await supabase.from("termine").select("id, serie_id, beginnt_am, objekt_id, kontakt_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (!alt) return { fehler: "Unbekannter Termin." };
    const { error } = await supabase.from("termine").update(felder).eq("id", id).eq("mandant_id", sitzung.mandantId);
    if (error) return { fehler: "Der Termin konnte nicht gespeichert werden." };
    let anzahl = 1;
    // Serie: alle folgenden mitziehen — gleiche Uhrzeit und Dauer, eigener Tag
    if (alt.serie_id && text(formular, "serie_umfang") === "folgende") {
      const { data: folgende } = await supabase.from("termine").select("id, beginnt_am").eq("serie_id", alt.serie_id as string).gt("beginnt_am", alt.beginnt_am as string).is("geloescht_am", null);
      for (const f of folgende ?? []) {
        const tag = berlin(f.beginnt_am as string).datum;
        const beginn = felder.ganztags ? ausBerlin(tag, "00:00") : ausBerlin(tag, zeit);
        const ende = felder.ganztags ? ausBerlin(tagPlus(tag, 1), "00:00") : new Date(beginn.getTime() + dauer * 60_000);
        await supabase.from("termine").update({ ...felder, beginnt_am: beginn.toISOString(), endet_am: ende.toISOString() }).eq("id", f.id as string);
        anzahl++;
      }
    }
    await seiten(felder.objekt_id, felder.kontakt_id, id);
    if (bestaetigen) redirect(await bestaetigungsLink(supabase, sitzung, id));
    return { erfolg: anzahl > 1 ? `Termin und ${anzahl - 1} folgende gespeichert.` : "Termin gespeichert.", id, anzahl };
  }

  // Dublettenwarnung (Referenz: „bereits im Kalender – wirklich ein zweites Mal anlegen?")
  if (text(formular, "doppelt_bestaetigt") !== "1" && (felder.kontakt_id || felder.objekt_id)) {
    let dq = supabase.from("termine").select("id, titel, beginnt_am").eq("mandant_id", sitzung.mandantId).is("geloescht_am", null).is("abgesagt_am", null).eq("art", felder.art)
      .gte("beginnt_am", ausBerlin(datum, "00:00").toISOString()).lt("beginnt_am", ausBerlin(tagPlus(datum, 1), "00:00").toISOString());
    dq = felder.kontakt_id ? dq.eq("kontakt_id", felder.kontakt_id) : dq.eq("objekt_id", felder.objekt_id as string);
    const { data: gleich } = await dq.limit(1);
    if (gleich && gleich.length > 0) {
      const g = gleich[0]!;
      return { doppelt: `„${g.titel as string}“ steht am ${datum.split("-").reverse().join(".")} um ${berlin(g.beginnt_am as string).zeit} Uhr bereits im Kalender${felder.kontakt_id ? " mit demselben Kontakt" : " für dasselbe Objekt"}. Wirklich ein zweites Mal anlegen?` };
    }
  }

  const regel = serieAusFormular(formular);
  const tage = regel ? serienDaten(datum, regel) : [datum];
  const serieId = regel && tage.length > 1 ? randomUUID() : null;
  const zeilen = tage.map((tag) => {
    const beginn = felder.ganztags ? ausBerlin(tag, "00:00") : ausBerlin(tag, zeit);
    const dauerTage = Math.max(1, Math.round((new Date(felder.endet_am).getTime() - new Date(felder.beginnt_am).getTime()) / 86_400_000));
    const ende = felder.ganztags ? ausBerlin(tagPlus(tag, dauerTage), "00:00") : new Date(beginn.getTime() + dauer * 60_000);
    return { mandant_id: sitzung.mandantId, ...felder, beginnt_am: beginn.toISOString(), endet_am: ende.toISOString(), serie_id: serieId, serie_regel: serieId ? regel : null, erstellt_von: sitzung.benutzerId };
  });
  const { data, error } = await supabase.from("termine").insert(zeilen).select("id, beginnt_am").order("beginnt_am");
  if (error || !data || data.length === 0) return { fehler: "Der Termin konnte nicht gespeichert werden." };
  const erster = data[0]?.id as string;
  let leadHinweis = "";
  if (text(formular, "lead_anlegen") === "1") leadHinweis = await leadAusTermin(supabase, sitzung, erster, felder);
  await seiten(felder.objekt_id, felder.kontakt_id);
  if (bestaetigen) redirect(await bestaetigungsLink(supabase, sitzung, erster));
  if (text(formular, "weiter") === "detail") redirect(`/kalender/${erster}`);
  return { erfolg: (data.length > 1 ? `Serie mit ${data.length} Terminen angelegt.` : "Termin angelegt.") + leadHinweis, id: erster, anzahl: data.length };
}

export async function terminLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: t } = await supabase.from("termine").select("objekt_id, kontakt_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  await supabase.rpc("termin_loeschen", { p_termin: id, p_folgende: text(formular, "umfang") === "folgende" });
  await seiten((t?.objekt_id as string | null) ?? null, (t?.kontakt_id as string | null) ?? null);
  redirect("/kalender");
}

// ---------------------------------------------------------------------------
// Terminbestaetigung: Postfach mit Text und .ics-Anhang oeffnen
// ---------------------------------------------------------------------------

async function bestaetigungsLink(supabase: Supabase, sitzung: Sitzung, terminId: string): Promise<string> {
  const { data: t } = await supabase.from("termine").select("id, art, beginnt_am, ganztags, ort, bestaetigung_text, kontakt:kontakte(anrede, vorname, nachname, firma, email), objekt:objekte(objektnummer, bezeichnung, strasse, hausnummer, plz, ort)").eq("id", terminId).maybeSingle();
  const { data: branding } = await supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!t) return `/kalender/${terminId}`;
  const k = t.kontakt as unknown as { anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null; email: string | null } | null;
  const o = t.objekt as unknown as { objektnummer: string; bezeichnung: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null } | null;
  const termin = { art: t.art as string, beginnt_am: t.beginnt_am as string, ganztags: Boolean(t.ganztags), ort: (t.ort as string | null) ?? null };
  const p = new URLSearchParams({
    neu: "1",
    an: k?.email ?? "",
    betreff: terminBestaetigungBetreff(termin),
    text: (t.bestaetigung_text as string | null) || terminBestaetigungText(termin, k ?? {}, o, sitzung.name, (branding?.firmenname as string | null) ?? sitzung.mandantName),
    anhang_art: "termin",
    anhang_id: terminId,
  });
  return `/postfach?${p.toString()}`;
}

export async function terminBestaetigungVorbereiten(_vorher: KalenderErgebnis, formular: FormData): Promise<KalenderErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Termin." };
  const supabase = await serverClient();
  const eigener = String(formular.get("text") ?? "").trim();
  if (eigener) await supabase.from("termine").update({ bestaetigung_text: eigener.slice(0, 8000) }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  redirect(await bestaetigungsLink(supabase, sitzung, id));
}

// ---------------------------------------------------------------------------
// Lead aus Termin (Referenz: „In der Akquise als Lead anlegen")
// ---------------------------------------------------------------------------

/**
 * Legt zum Termin einen Akquise-Lead an — mit Kontakt und Objekt aus dem Termin.
 * Gibt es zu der Adresse schon einen Lead, passiert nichts (Referenz).
 * Rueckgabe: Zusatz fuer die Erfolgsmeldung.
 */
async function leadAusTermin(supabase: Supabase, sitzung: Sitzung, terminId: string, felder: TerminFelder): Promise<string> {
  try { rechtErzwingen(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung); } catch { return " Lead nicht angelegt: kein Akquise-Recht."; }
  let adresse: { strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null; titel: string; objektart: string | null } = { strasse: null, hausnummer: null, plz: null, ort: null, titel: felder.titel, objektart: null };
  if (felder.objekt_id) {
    const { data: o } = await supabase.from("objekte").select("bezeichnung, strasse, hausnummer, plz, ort, objektart").eq("id", felder.objekt_id).maybeSingle();
    if (o) adresse = { strasse: (o.strasse as string | null) ?? null, hausnummer: (o.hausnummer as string | null) ?? null, plz: (o.plz as string | null) ?? null, ort: (o.ort as string | null) ?? null, titel: (o.bezeichnung as string) || felder.titel, objektart: (o.objektart as string | null) ?? null };
  } else if (felder.ort) {
    // „Musterstraße 12, 60311 Frankfurt" grob zerlegen
    const m = /^(.*?)\s*(\d{1,4}\s?[a-zA-Z]?)?\s*,\s*(\d{5})?\s*(.*)$/.exec(felder.ort);
    adresse = { ...adresse, strasse: m?.[1]?.trim() || felder.ort, hausnummer: m?.[2]?.replace(/\s+/g, "") ?? null, plz: m?.[3] ?? null, ort: m?.[4]?.trim() || null };
  }
  if (adresse.strasse) {
    let dq = supabase.from("akquise_leads").select("id").eq("mandant_id", sitzung.mandantId).ilike("strasse", adresse.strasse);
    if (adresse.hausnummer) dq = dq.ilike("hausnummer", adresse.hausnummer);
    if (adresse.plz) dq = dq.eq("plz", adresse.plz);
    const { data: vorhanden } = await dq.limit(1);
    if (vorhanden && vorhanden.length > 0) {
      await supabase.from("termine").update({ lead_id: vorhanden[0]!.id as string }).eq("id", terminId);
      return " Zu der Adresse gibt es schon einen Lead — er ist mit dem Termin verknüpft.";
    }
  }
  const { data: pipeline } = await supabase.from("akquise_pipelines").select("id").order("ist_standard", { ascending: false }).order("sortierung").limit(1).maybeSingle();
  let pipelineId = (pipeline?.id as string | undefined) ?? null;
  if (!pipelineId) { const { data } = await supabase.rpc("akquise_standard_anlegen"); pipelineId = typeof data === "string" ? data : null; }
  if (!pipelineId) return " Lead nicht angelegt: keine Akquise-Pipeline.";
  const { data: stufe } = await supabase.from("akquise_stufen").select("id").eq("pipeline_id", pipelineId).eq("ist_gewonnen", false).eq("ist_verloren", false).order("sortierung").limit(1).maybeSingle();
  if (!stufe?.id) return " Lead nicht angelegt: Pipeline ohne offene Stufe.";
  const { data: lead, error } = await supabase.from("akquise_leads").insert({
    mandant_id: sitzung.mandantId, pipeline_id: pipelineId, stufe_id: stufe.id as string, titel: adresse.titel.slice(0, 200),
    strasse: adresse.strasse, hausnummer: adresse.hausnummer, plz: adresse.plz, ort: adresse.ort, objektart: adresse.objektart,
    kontakt_id: felder.kontakt_id, objekt_id: felder.objekt_id, zustaendig_id: felder.zustaendig_id, erstellt_von: sitzung.benutzerId,
    notiz: `Aus dem Termin „${felder.titel}“ am ${berlin(felder.beginnt_am).datum.split("-").reverse().join(".")} angelegt.`,
  }).select("id").single();
  if (error || !lead) return " Lead nicht angelegt: " + (error?.message ?? "unbekannt");
  await supabase.from("termine").update({ lead_id: lead.id as string }).eq("id", terminId);
  revalidatePath("/akquise/leads");
  return felder.kontakt_id ? " Akquise-Lead angelegt." : " Akquise-Lead angelegt — ohne Kontakt laufen Automationen und Terminbestätigungen nicht; später am Lead nachtragen.";
}

// ---------------------------------------------------------------------------
// Bestaetigungstext: Vorlage oder KI-Vorschlag, editierbar, am Termin gespeichert
// ---------------------------------------------------------------------------

async function terminMitBezug(supabase: Supabase, sitzung: Sitzung, terminId: string) {
  const { data: t } = await supabase.from("termine").select("id, titel, art, beginnt_am, endet_am, ganztags, ort, notiz, bestaetigung_text, kontakt:kontakte(anrede, vorname, nachname, firma, email), objekt:objekte(objektnummer, bezeichnung, objektart, objektkategorie, vermarktungsart, nutzungsart, strasse, hausnummer, plz, ort, wohnflaeche, zimmer, baujahr, kaufpreis, kaltmiete)").eq("id", terminId).eq("mandant_id", sitzung.mandantId).maybeSingle();
  const { data: branding } = await supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle();
  return { t, firma: (branding?.firmenname as string | null) ?? sitzung.mandantName };
}

/** Vorlagentext (ohne KI) fuer den Termin. */
export async function terminBestaetigungVorlage(_vorher: KalenderErgebnis, formular: FormData): Promise<KalenderErgebnis> {
  const sitzung = await sitzungErzwingen();
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Termin." };
  const supabase = await serverClient();
  const { t, firma } = await terminMitBezug(supabase, sitzung, id);
  if (!t) return { fehler: "Unbekannter Termin." };
  const k = t.kontakt as unknown as { anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null } | null;
  const o = t.objekt as unknown as { objektnummer: string; bezeichnung: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null } | null;
  return { text: terminBestaetigungText({ art: t.art as string, beginnt_am: t.beginnt_am as string, ganztags: Boolean(t.ganztags), ort: (t.ort as string | null) ?? null }, k ?? {}, o, sitzung.name, firma), kiVerwendet: false };
}

/**
 * „Vorschlag neu erzeugen" (Referenz): Der KI-Anbieter formuliert die
 * Bestaetigung aus Termin- und Objektdaten plus Stichpunkten; 1 Credit,
 * reserviert vor dem Aufruf, freigegeben bei Fehler. Ohne Modellzugang die
 * Vorlage. Der Text ist editierbar und wird am Termin gespeichert.
 */
export async function terminBestaetigungVorschlag(_vorher: KalenderErgebnis, formular: FormData): Promise<KalenderErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Termin." };
  const supabase = await serverClient();
  const { t, firma } = await terminMitBezug(supabase, sitzung, id);
  if (!t) return { fehler: "Unbekannter Termin." };
  const k = t.kontakt as unknown as { anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null } | null;
  const o = t.objekt as unknown as Record<string, unknown> | null;
  const termin = { art: t.art as string, beginnt_am: t.beginnt_am as string, ganztags: Boolean(t.ganztags), ort: (t.ort as string | null) ?? null };
  const vorlage = terminBestaetigungText(termin, k ?? {}, o as { objektnummer: string; bezeichnung: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null } | null, sitzung.name, firma);
  if (!kiVerfuegbar()) {
    await supabase.from("termine").update({ bestaetigung_text: vorlage }).eq("id", id);
    return { text: vorlage, kiVerwendet: false, hinweis: "Ohne Modellzugang: Vorlagentext eingesetzt." };
  }
  const { data: vorgang, error } = await supabase.rpc("credits_reservieren", { p_aktion: "ki_terminbestaetigung", p_referenz_art: "termin", p_referenz_id: id });
  if (error) return { fehler: `Keine KI-Formulierung möglich: ${error.message}` };
  try {
    const stichpunkte = text(formular, "stichpunkte").slice(0, 1000) || null;
    const objektKontext = o ? {
      objektkategorie: String(o["objektkategorie"] ?? ""), objektart: (o["objektart"] as string | null) ?? null, vermarktungsart: String(o["vermarktungsart"] ?? "kauf"), nutzungsart: String(o["nutzungsart"] ?? "wohnen"),
      ort: (o["ort"] as string | null) ?? null, ortsteil: null, wohnflaeche: (o["wohnflaeche"] as number | null) ?? null, nutzflaeche: null, grundstuecksflaeche: null, zimmer: (o["zimmer"] as number | null) ?? null, baujahr: (o["baujahr"] as number | null) ?? null,
      kaufpreis: (o["kaufpreis"] as number | null) ?? null, kaltmiete: (o["kaltmiete"] as number | null) ?? null, energie_klasse: null, energie_kennwert: null, stichpunkte: null,
    } : null;
    const e = await textAnbieter().antwortEntwerfen({
      betreff: terminBestaetigungBetreff(termin),
      text: `Bitte eine freundliche, kurze Terminbestätigung schreiben (kein Antwortbezug). Termin: ${terminArtText(t.art as string)} ${vorlage.split("\n").slice(2, 6).join(" ").trim()}. Der Kalendereintrag hängt als Datei an. Anrede exakt so: ${vorlage.split("\n")[0]}`,
      stichpunkte, objekt: objektKontext, absenderName: sitzung.name, unternehmen: firma,
    });
    await supabase.rpc("credits_einloesen", { p_vorgang: vorgang as string, p_kosten_cent: e.kostenCent });
    const ergebnis = e.text.trim() || vorlage;
    await supabase.from("termine").update({ bestaetigung_text: ergebnis }).eq("id", id);
    return { text: ergebnis, kiVerwendet: e.kiVerwendet, hinweis: e.kiVerwendet ? "KI-Vorschlag — bitte prüfen, dann senden." : "Ohne Modell: Vorlage." };
  } catch (e) {
    await supabase.rpc("credits_freigeben", { p_vorgang: vorgang as string, p_grund: (e instanceof Error ? e.message : "Fehler").slice(0, 200) });
    return { fehler: `Vorschlag fehlgeschlagen — ${e instanceof Error ? e.message : "unbekannt"}` };
  }
}

// ---------------------------------------------------------------------------
// Nachfass-Vorschlaege (Referenz: Freigabe im Dashboard)
// ---------------------------------------------------------------------------

export async function nachfassEntscheiden(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  const aktion = text(formular, "aktion");
  if (!id) return;
  const supabase = await serverClient();
  const { data: v } = await supabase.from("nachfass_vorschlaege").select("id, betreff, text, status, kontakt:kontakte(email)").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!v || v.status !== "offen") return;
  if (aktion === "senden") {
    const k = v.kontakt as unknown as { email: string | null } | null;
    const p = new URLSearchParams({ neu: "1", an: k?.email ?? "", betreff: v.betreff as string, text: text(formular, "text").slice(0, 8000) || (v.text as string), nachfass_id: id });
    redirect(`/postfach?${p.toString()}`);
  }
  const status = aktion === "ueberspringen" ? "uebersprungen" : "verworfen";
  await supabase.from("nachfass_vorschlaege").update({ status, grund: aktion === "ueberspringen" ? "Kunde hat sich gemeldet o. ä." : "verworfen", entschieden_am: new Date().toISOString(), entschieden_von: sitzung.benutzerId }).eq("id", id);
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Fahrzeit
// ---------------------------------------------------------------------------

async function koordinaten(supabase: Supabase, adresse: string, fetchFn: typeof globalThis.fetch): Promise<Koordinate | null> {
  const { data } = await supabase.rpc("geokodierung_holen", { p_adresse: adresse });
  const c = data as { lat?: number; lon?: number } | null;
  if (c && typeof c.lat === "number" && typeof c.lon === "number") return { lat: c.lat, lon: c.lon };
  const neu = await geokodieren(adresse, fetchFn);
  if (neu) await supabase.rpc("geokodierung_merken", { p_adresse: adresse, p_lat: neu.lat, p_lon: neu.lon });
  return neu;
}

function objektAdresse(o: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null } | null | undefined): string {
  return o ? [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
}

/** Fahrzeiten fuer einen Termin berechnen und am Termin ablegen. */
export async function fahrzeitBerechnen(_vorher: KalenderErgebnis, formular: FormData): Promise<KalenderErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Unbekannter Termin." };
  const supabase = await serverClient();
  const [{ data: t }, { data: benutzer }, { data: branding }] = await Promise.all([
    supabase.from("termine").select("id, titel, beginnt_am, endet_am, ort, zustaendig_id, objekt:objekte(strasse, hausnummer, plz, ort)").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle(),
    supabase.from("benutzer").select("start_adresse, fahrzeit_puffer_min, fahrzeit_aktiv").eq("id", sitzung.benutzerId).maybeSingle(),
    supabase.from("mandant_branding").select("strasse, hausnummer, plz, ort").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  if (!t) return { fehler: "Unbekannter Termin." };
  const adresse = terminOrtText({ ort: (t.ort as string | null) ?? null }, t.objekt as unknown as { strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null } | null);
  if (!adresse) return { fehler: "Der Termin hat keinen Ort — bitte Ort eintragen oder ein Objekt mit Anschrift wählen." };
  const basis = (benutzer?.start_adresse as string | null)?.trim() || objektAdresse(branding);
  const tag = berlin(t.beginnt_am as string).datum;
  const zust = (t.zustaendig_id as string | null) ?? sitzung.benutzerId;
  const { data: nachbarn } = await supabase
    .from("termine")
    .select("id, titel, beginnt_am, endet_am, ort, objekt:objekte(strasse, hausnummer, plz, ort)")
    .eq("mandant_id", sitzung.mandantId).eq("zustaendig_id", zust).is("abgesagt_am", null).is("geloescht_am", null).eq("ganztags", false)
    .gte("beginnt_am", ausBerlin(tag, "00:00").toISOString()).lt("beginnt_am", ausBerlin(tagPlus(tag, 1), "00:00").toISOString())
    .neq("id", id).order("beginnt_am");
  const alsNachbar = (n: Record<string, unknown>): Nachbar => ({ titel: n.titel as string, adresse: terminOrtText({ ort: (n.ort as string | null) ?? null }, n.objekt as { strasse: string | null } | null), beginnt_am: n.beginnt_am as string, endet_am: n.endet_am as string });
  const vorher = (nachbarn ?? []).filter((n) => (n.endet_am as string) <= (t.beginnt_am as string)).map(alsNachbar).pop() ?? null;
  const nachher = (nachbarn ?? []).filter((n) => (n.beginnt_am as string) >= (t.endet_am as string)).map(alsNachbar)[0] ?? null;
  const plan = fahrtenPlanen({ beginnt_am: t.beginnt_am as string, endet_am: t.endet_am as string, adresse }, vorher, nachher, basis);
  if (!plan.hin && !plan.rueck) return { fehler: "Keine Startadresse bekannt — bitte in den Kalender-Einstellungen eintragen." };
  const fetchFn = globalThis.fetch;
  const ziel = await koordinaten(supabase, adresse, fetchFn);
  if (!ziel) return { fehler: `Die Adresse „${adresse}“ konnte nicht gefunden werden.` };
  const puffer = Number(benutzer?.fahrzeit_puffer_min ?? 5);
  const fahrt = async (von: string, nach: string): Promise<Fahrt | null> => {
    const a = von === adresse ? ziel : await koordinaten(supabase, von, fetchFn);
    const b = nach === adresse ? ziel : await koordinaten(supabase, nach, fetchFn);
    if (!a || !b) return null;
    const r = await route(a, b, fetchFn);
    return { min: r.min + (r.min > 0 ? puffer : 0), km: r.km, von, nach, quelle: r.quelle };
  };
  const hin = plan.hin ? await fahrt(plan.hin.von, adresse) : null;
  const rueck = plan.rueck ? await fahrt(adresse, plan.rueck.nach) : null;
  const ergebnis: Fahrzeiten = {
    hin: hin ? { ...hin, aus_termin: plan.hin?.aus_termin ?? null } : null,
    rueck: rueck ? { ...rueck, zu_termin: plan.rueck?.zu_termin ?? null } : null,
    basis, puffer_min: puffer, berechnet_am: new Date().toISOString(),
  };
  await supabase.from("termine").update({ fahrzeit: ergebnis }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath(`/kalender/${id}`);
  revalidatePath("/kalender");
  return { erfolg: "Fahrzeiten berechnet.", fahrzeit: ergebnis, id };
}

// ---------------------------------------------------------------------------
// Persoenliche Einstellungen, ICS-Abo, Kalender-Abgleich
// ---------------------------------------------------------------------------

export async function kalenderEinstellungenSpeichern(_vorher: KalenderErgebnis, formular: FormData): Promise<KalenderErgebnis> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  const farbe = text(formular, "kalender_farbe");
  const { error } = await supabase.from("benutzer").update({
    start_adresse: optional(formular, "start_adresse")?.slice(0, 300) ?? null,
    besichtigung_dauer_min: Math.max(15, Math.min(480, Math.round(zahl(formular, "besichtigung_dauer_min", 60)))),
    fahrzeit_puffer_min: Math.max(0, Math.min(60, Math.round(zahl(formular, "fahrzeit_puffer_min", 5)))),
    fahrzeit_aktiv: text(formular, "fahrzeit_aktiv") === "1",
    kalender_farbe: /^#[0-9A-Fa-f]{6}$/.test(farbe) ? farbe : null,
  }).eq("id", sitzung.benutzerId);
  if (error) return { fehler: "Die Einstellungen konnten nicht gespeichert werden." };
  revalidatePath("/kalender/einstellungen");
  revalidatePath("/kalender");
  return { erfolg: "Einstellungen gespeichert." };
}

export async function kalenderTokenErneuern(_vorher: KalenderErgebnis, _formular: FormData): Promise<KalenderErgebnis> {
  await sitzungErzwingen();
  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("kalender_token_lesen", { p_erneuern: true });
  if (error) return { fehler: "Der Link konnte nicht erneuert werden." };
  revalidatePath("/kalender/einstellungen");
  return { erfolg: "Neuer Abo-Link erzeugt — der alte gilt nicht mehr.", token: data as string };
}

export async function kalenderSyncSchalten(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "postfach_id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("postfaecher").update({ kalender_sync: text(formular, "an") === "1" }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/kalender/einstellungen");
  revalidatePath("/einstellungen/postfaecher");
}

/** Sofortiger Abgleich mit dem Kalender des Postfach-Anbieters. */
export async function kalenderSyncJetzt(_vorher: KalenderErgebnis, formular: FormData): Promise<KalenderErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "aendern", sitzung.uebersteuerung);
  const id = uuid(formular, "postfach_id");
  if (!id) return { fehler: "Unbekanntes Postfach." };
  const supabase = await serverClient();
  const { data: sichtbar } = await supabase.from("postfaecher").select("id, benutzer_id").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!sichtbar) return { fehler: "Unbekanntes Postfach." };
  const dienst = dienstClient();
  const { data: p } = await dienst.from("postfaecher").select("id, mandant_id, benutzer_id, zugangsdaten, kalender_zustand, kalender_sync").eq("id", id).maybeSingle();
  if (!p?.zugangsdaten) return { fehler: "Das Postfach ist nicht verbunden." };
  const zugang = zugangParsen(entschluesseln(p.zugangsdaten as string, sitzung.mandantId));
  if (zugang.art === "imap") return { fehler: "Kalender-Abgleich gibt es nur für Microsoft-365- und Google-Postfächer." };
  const anbieter = kalenderAnbieterErzeugen(zugang, globalThis.fetch, oauthKonfig(zugang.art));
  if (!anbieter) return { fehler: "Kein Kalender-Anbieter." };
  try {
    const lauf = await kalenderAbgleichen(dienst, { id, mandant_id: sitzung.mandantId, benutzer_id: (p.benutzer_id as string | null) ?? sitzung.benutzerId, kalender_zustand: (p.kalender_zustand as Record<string, unknown> | null) ?? null }, anbieter);
    const erneuert = anbieter.aktualisierterZugang();
    await dienst.from("postfaecher").update({ kalender_zustand: lauf.zustand, kalender_sync: true, ...(erneuert ? { zugangsdaten: verschluesseln(JSON.stringify(erneuert), sitzung.mandantId) } : {}) }).eq("id", id);
    revalidatePath("/kalender");
    revalidatePath("/kalender/einstellungen");
    const e = lauf.ergebnis;
    return { erfolg: `Abgleich: ${e.hinaus} hinaus, ${e.herein} herein, ${e.geloescht} gelöscht${e.fehler.length ? ` — ${e.fehler.length} Fehler: ${e.fehler[0]}` : ""}.` };
  } catch (e) {
    const m = e instanceof Error ? e.message : "unbekannt";
    return { fehler: /403|401/.test(m) ? "Der Kalenderzugriff fehlt — bitte das Postfach unter Einstellungen → Postfächer neu verbinden (Kalender-Berechtigung)." : `Abgleich gescheitert — ${m}` };
  }
}
