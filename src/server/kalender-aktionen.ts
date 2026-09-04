"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { entschluesseln, verschluesseln } from "@/integrationen/kern/zugangsdaten";
import { TERMINARTEN, type Terminart } from "@/lib/arbeitsmittel";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import { terminBestaetigungBetreff, terminBestaetigungText, terminOrtText } from "@/lib/kalender/bestaetigung";
import { fahrtenPlanen, geokodieren, route, type Fahrt, type Fahrzeiten, type Koordinate, type Nachbar } from "@/lib/kalender/fahrzeit";
import { regelAusWahl, serienDaten, type SerienRegel, type SerieTakt, type SerieWahl, SERIE_WAHL } from "@/lib/kalender/serie";
import { kalenderAbgleichen, kalenderAnbieterErzeugen } from "@/lib/kalender/sync";
import { ausBerlin, berlin, tagPlus } from "@/lib/kalender/zeit";
import { oauthKonfig } from "@/lib/postfach/oauth";
import { zugangParsen } from "@/lib/postfach/typen";
import { dienstClient } from "@/lib/supabase/dienst";
import { serverClient } from "@/lib/supabase/server";

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
  await seiten(felder.objekt_id, felder.kontakt_id);
  if (bestaetigen) redirect(await bestaetigungsLink(supabase, sitzung, erster));
  if (text(formular, "weiter") === "detail") redirect(`/kalender/${erster}`);
  return { erfolg: data.length > 1 ? `Serie mit ${data.length} Terminen angelegt.` : "Termin angelegt.", id: erster, anzahl: data.length };
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
  const { data: t } = await supabase.from("termine").select("id, art, beginnt_am, ganztags, ort, kontakt:kontakte(anrede, vorname, nachname, firma, email), objekt:objekte(objektnummer, bezeichnung, strasse, hausnummer, plz, ort)").eq("id", terminId).maybeSingle();
  const { data: branding } = await supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle();
  if (!t) return `/kalender/${terminId}`;
  const k = t.kontakt as unknown as { anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null; email: string | null } | null;
  const o = t.objekt as unknown as { objektnummer: string; bezeichnung: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null } | null;
  const termin = { art: t.art as string, beginnt_am: t.beginnt_am as string, ganztags: Boolean(t.ganztags), ort: (t.ort as string | null) ?? null };
  const p = new URLSearchParams({
    neu: "1",
    an: k?.email ?? "",
    betreff: terminBestaetigungBetreff(termin),
    text: terminBestaetigungText(termin, k ?? {}, o, sitzung.name, (branding?.firmenname as string | null) ?? sitzung.mandantName),
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
  redirect(await bestaetigungsLink(supabase, sitzung, id));
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
