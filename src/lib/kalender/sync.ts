import type { SupabaseClient } from "@supabase/supabase-js";

import { GMAIL_BASIS } from "@/lib/postfach/google";
import { GRAPH_BASIS } from "@/lib/postfach/microsoft";
import { OAuthAnbieterBasis } from "@/lib/postfach/oauth-basis";
import type { OAuthKonfig } from "@/lib/postfach/oauth";
import type { OAuthZugang, PostfachZugang } from "@/lib/postfach/typen";

import { berlin, tagPlus } from "./zeit";

/**
 * Kalender-Abgleich (K2) ueber die verbundenen Postfaecher: Termine aus
 * ImmoOffice.ai landen im Google- bzw. Outlook-Kalender des Benutzers, und
 * dort angelegte Termine erscheinen hier (Art „sonstiges", Quelle vermerkt).
 * Beide Richtungen sind idempotent ueber `extern_id`.
 */

export interface ExternerTermin {
  externId: string;
  titel: string;
  beginntAm: string;
  endetAm: string;
  ganztags: boolean;
  ort: string | null;
  notiz: string | null;
  abgesagt: boolean;
  geaendertAm: string | null;
  /** Von uns angelegt (Kennung in der Beschreibung bzw. den erweiterten Eigenschaften) */
  eigen: boolean;
}

export interface LokalerTermin {
  id: string;
  titel: string;
  beginnt_am: string;
  endet_am: string;
  ganztags: boolean;
  ort: string | null;
  notiz: string | null;
  abgesagt_am: string | null;
  geloescht_am: string | null;
  extern_id: string | null;
  geaendert_am: string;
  extern_geaendert_am: string | null;
}

export interface KalenderAnbieter {
  readonly art: "google" | "microsoft";
  auflisten(von: string, bis: string): Promise<ExternerTermin[]>;
  anlegen(t: LokalerTermin): Promise<string>;
  aktualisieren(externId: string, t: LokalerTermin): Promise<void>;
  loeschen(externId: string): Promise<void>;
  aktualisierterZugang(): PostfachZugang | null;
}

export const KENNUNG = "immooffice-termin";

function beschreibungMitKennung(t: LokalerTermin): string {
  return `${t.notiz ?? ""}\n\n[${KENNUNG}:${t.id}]`.trim();
}
function kennungLesen(text: string | null | undefined): string | null {
  const m = /\[immooffice-termin:([0-9a-f-]{36})\]/.exec(text ?? "");
  return m?.[1] ?? null;
}
function ohneKennung(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s*\[immooffice-termin:[0-9a-f-]{36}\]\s*/g, "").trim();
  return t || null;
}

// ---------------------------------------------------------------------------
// Google Calendar (primary)
// ---------------------------------------------------------------------------

export const GOOGLE_KALENDER_BASIS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GoogleEreignis {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export class GoogleKalender extends OAuthAnbieterBasis implements KalenderAnbieter {
  readonly art = "google" as const;
  constructor(zugang: OAuthZugang, fetchFn: typeof globalThis.fetch = globalThis.fetch, konfig: OAuthKonfig | null = null) {
    super(zugang, fetchFn, konfig, "Google Kalender");
  }
  private koerper(t: LokalerTermin): Record<string, unknown> {
    const zeit = t.ganztags
      ? { start: { date: berlin(t.beginnt_am).datum }, end: { date: tagPlus(berlin(new Date(new Date(t.endet_am).getTime() - 1)).datum, 1) } }
      : { start: { dateTime: t.beginnt_am, timeZone: "Europe/Berlin" }, end: { dateTime: t.endet_am, timeZone: "Europe/Berlin" } };
    return { summary: t.titel, location: t.ort ?? "", description: beschreibungMitKennung(t), status: t.abgesagt_am ? "cancelled" : "confirmed", ...zeit };
  }
  async auflisten(von: string, bis: string): Promise<ExternerTermin[]> {
    const aus: ExternerTermin[] = [];
    let seite: string | undefined;
    for (let i = 0; i < 10; i++) {
      const p = new URLSearchParams({ timeMin: von, timeMax: bis, singleEvents: "true", showDeleted: "true", maxResults: "250" });
      if (seite) p.set("pageToken", seite);
      const d = await this.anfrage<{ items?: GoogleEreignis[]; nextPageToken?: string }>(`${GOOGLE_KALENDER_BASIS}?${p.toString()}`);
      for (const e of d.items ?? []) {
        const ganztags = Boolean(e.start?.date);
        const beginn = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00+02:00` : null);
        const ende = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00+02:00` : null);
        if (!beginn || !ende) continue;
        aus.push({ externId: e.id, titel: e.summary ?? "(ohne Titel)", beginntAm: new Date(beginn).toISOString(), endetAm: new Date(ende).toISOString(), ganztags, ort: e.location ?? null, notiz: ohneKennung(e.description), abgesagt: e.status === "cancelled", geaendertAm: e.updated ?? null, eigen: kennungLesen(e.description) !== null });
      }
      seite = d.nextPageToken;
      if (!seite) break;
    }
    return aus;
  }
  async anlegen(t: LokalerTermin): Promise<string> {
    const d = await this.anfrage<{ id: string }>(GOOGLE_KALENDER_BASIS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.koerper(t)) });
    return d.id;
  }
  async aktualisieren(externId: string, t: LokalerTermin): Promise<void> {
    await this.anfrage(`${GOOGLE_KALENDER_BASIS}/${encodeURIComponent(externId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.koerper(t)) });
  }
  async loeschen(externId: string): Promise<void> {
    try {
      await this.anfrage(`${GOOGLE_KALENDER_BASIS}/${encodeURIComponent(externId)}`, { method: "DELETE" });
    } catch (e) {
      if (!(e instanceof Error && /HTTP (404|410)/.test(e.message))) throw e;
    }
  }
  override aktualisierterZugang(): PostfachZugang | null {
    return super.aktualisierterZugang();
  }
}

// ---------------------------------------------------------------------------
// Microsoft Graph (Standardkalender)
// ---------------------------------------------------------------------------

interface GraphEreignis {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  location?: { displayName?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  lastModifiedDateTime?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  singleValueExtendedProperties?: Array<{ id: string; value: string }>;
}

function graphZeit(z: { dateTime?: string; timeZone?: string } | undefined): string | null {
  if (!z?.dateTime) return null;
  // Graph liefert bei Prefer: outlook.timezone="UTC" die Zeit in UTC ohne Zone
  const t = z.dateTime.replace(/\.\d+$/, "");
  return new Date(`${t}Z`).toISOString();
}

export class MicrosoftKalender extends OAuthAnbieterBasis implements KalenderAnbieter {
  readonly art = "microsoft" as const;
  constructor(zugang: OAuthZugang, fetchFn: typeof globalThis.fetch = globalThis.fetch, konfig: OAuthKonfig | null = null) {
    super(zugang, fetchFn, konfig, "Microsoft 365");
  }
  private koerper(t: LokalerTermin): Record<string, unknown> {
    const utc = (iso: string) => iso.replace(/\.\d{3}Z$/, "");
    const zeit = t.ganztags
      ? { isAllDay: true, start: { dateTime: `${berlin(t.beginnt_am).datum}T00:00:00`, timeZone: "Europe/Berlin" }, end: { dateTime: `${tagPlus(berlin(new Date(new Date(t.endet_am).getTime() - 1)).datum, 1)}T00:00:00`, timeZone: "Europe/Berlin" } }
      : { isAllDay: false, start: { dateTime: utc(t.beginnt_am), timeZone: "UTC" }, end: { dateTime: utc(t.endet_am), timeZone: "UTC" } };
    return { subject: t.abgesagt_am ? `Abgesagt: ${t.titel}` : t.titel, body: { contentType: "text", content: beschreibungMitKennung(t) }, location: { displayName: t.ort ?? "" }, ...zeit };
  }
  async auflisten(von: string, bis: string): Promise<ExternerTermin[]> {
    const aus: ExternerTermin[] = [];
    let url: string | undefined = `${GRAPH_BASIS}/me/calendarView?${new URLSearchParams({ startDateTime: von, endDateTime: bis, $top: "200", $select: "id,subject,body,location,isAllDay,isCancelled,lastModifiedDateTime,start,end" }).toString()}`;
    for (let i = 0; i < 10 && url; i++) {
      const d: { value?: GraphEreignis[]; "@odata.nextLink"?: string } = await this.anfrage(url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
      for (const e of d.value ?? []) {
        const beginn = graphZeit(e.start);
        const ende = graphZeit(e.end);
        if (!beginn || !ende) continue;
        const text = e.body?.content ?? e.bodyPreview ?? "";
        aus.push({ externId: e.id, titel: e.subject ?? "(ohne Titel)", beginntAm: beginn, endetAm: ende, ganztags: Boolean(e.isAllDay), ort: e.location?.displayName || null, notiz: ohneKennung(text.replace(/<[^>]+>/g, " ")), abgesagt: Boolean(e.isCancelled), geaendertAm: e.lastModifiedDateTime ?? null, eigen: kennungLesen(text) !== null });
      }
      url = d["@odata.nextLink"];
    }
    return aus;
  }
  async anlegen(t: LokalerTermin): Promise<string> {
    const d = await this.anfrage<{ id: string }>(`${GRAPH_BASIS}/me/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.koerper(t)) });
    return d.id;
  }
  async aktualisieren(externId: string, t: LokalerTermin): Promise<void> {
    await this.anfrage(`${GRAPH_BASIS}/me/events/${encodeURIComponent(externId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.koerper(t)) });
  }
  async loeschen(externId: string): Promise<void> {
    try {
      await this.anfrage(`${GRAPH_BASIS}/me/events/${encodeURIComponent(externId)}`, { method: "DELETE" });
    } catch (e) {
      if (!(e instanceof Error && /HTTP 404/.test(e.message))) throw e;
    }
  }
  override aktualisierterZugang(): PostfachZugang | null {
    return super.aktualisierterZugang();
  }
}

export function kalenderAnbieterErzeugen(zugang: PostfachZugang, fetchFn: typeof globalThis.fetch = globalThis.fetch, konfig: OAuthKonfig | null = null): KalenderAnbieter | null {
  if (zugang.art === "google") return new GoogleKalender(zugang, fetchFn, konfig);
  if (zugang.art === "microsoft") return new MicrosoftKalender(zugang, fetchFn, konfig);
  return null;
}

// ---------------------------------------------------------------------------
// Abgleich
// ---------------------------------------------------------------------------

export interface AbgleichErgebnis { hinaus: number; herein: number; geloescht: number; fehler: string[] }

/**
 * Eine Runde Abgleich fuer ein Postfach (Benutzer):
 *  1. lokale Termine des Benutzers ohne extern_id → anlegen
 *  2. lokale Termine, seit dem letzten Abgleich geaendert → aktualisieren
 *  3. weich geloeschte mit extern_id → beim Anbieter loeschen
 *  4. fremde Termine des Anbieters im Fenster → als „sonstiges" uebernehmen/aktualisieren
 * Der Anbieter ist keine Quelle fuer Aenderungen an ImmoOffice-Terminen (Konfliktregel: unser Datensatz gewinnt).
 */
export async function kalenderAbgleichen(supabase: SupabaseClient, postfach: { id: string; mandant_id: string; benutzer_id: string; kalender_zustand: Record<string, unknown> | null }, anbieter: KalenderAnbieter, jetzt: Date = new Date()): Promise<{ ergebnis: AbgleichErgebnis; zustand: Record<string, unknown> }> {
  const erg: AbgleichErgebnis = { hinaus: 0, herein: 0, geloescht: 0, fehler: [] };
  const von = new Date(jetzt.getTime() - 30 * 86_400_000).toISOString();
  const bis = new Date(jetzt.getTime() + 180 * 86_400_000).toISOString();
  const letzter = typeof postfach.kalender_zustand?.["letzter_abgleich"] === "string" ? (postfach.kalender_zustand["letzter_abgleich"] as string) : null;

  // --- hinaus: eigene Termine des Benutzers (zustaendig oder Teilnehmer), keine fremd importierten
  const { data: lokal } = await supabase
    .from("termine")
    .select("id, titel, beginnt_am, endet_am, ganztags, ort, notiz, abgesagt_am, geloescht_am, extern_id, geaendert_am, extern_geaendert_am, extern_quelle, postfach_id, zustaendig_id, teilnehmer")
    .eq("mandant_id", postfach.mandant_id)
    .is("extern_quelle", null)
    .gte("beginnt_am", von)
    .lte("beginnt_am", bis)
    .or(`zustaendig_id.eq.${postfach.benutzer_id},teilnehmer.cs.{${postfach.benutzer_id}}`)
    .limit(500);
  for (const t of (lokal ?? []) as unknown as Array<LokalerTermin & { postfach_id: string | null }>) {
    try {
      const gehoertHierher = !t.postfach_id || t.postfach_id === postfach.id;
      if (!gehoertHierher) continue;
      if (t.geloescht_am) {
        if (t.extern_id) {
          await anbieter.loeschen(t.extern_id);
          await supabase.from("termine").update({ extern_id: null, postfach_id: null }).eq("id", t.id);
          erg.geloescht++;
        }
        continue;
      }
      if (!t.extern_id) {
        const externId = await anbieter.anlegen(t);
        await supabase.from("termine").update({ extern_id: externId, postfach_id: postfach.id, extern_geaendert_am: jetzt.toISOString() }).eq("id", t.id);
        erg.hinaus++;
      } else if (!t.extern_geaendert_am || t.geaendert_am > t.extern_geaendert_am) {
        await anbieter.aktualisieren(t.extern_id, t);
        await supabase.from("termine").update({ extern_geaendert_am: jetzt.toISOString() }).eq("id", t.id);
        erg.hinaus++;
      }
    } catch (e) {
      erg.fehler.push(`${t.titel}: ${e instanceof Error ? e.message : "unbekannt"}`);
      if (erg.fehler.length >= 5) break;
    }
  }

  // --- herein: fremde Termine des Anbieters
  try {
    const extern = await anbieter.auflisten(von, bis);
    const { data: vorhanden } = await supabase.from("termine").select("id, extern_id, geaendert_am, extern_geaendert_am").eq("postfach_id", postfach.id).eq("extern_quelle", anbieter.art).limit(1000);
    const bekannt = new Map((vorhanden ?? []).map((v) => [v.extern_id as string, v]));
    for (const e of extern) {
      if (e.eigen) continue; // von uns angelegt — nicht doppelt herein
      const alt = bekannt.get(e.externId);
      if (e.abgesagt) {
        if (alt) { await supabase.from("termine").update({ geloescht_am: jetzt.toISOString() }).eq("id", alt.id as string); erg.geloescht++; }
        continue;
      }
      const felder = { titel: e.titel.slice(0, 300), beginnt_am: e.beginntAm, endet_am: e.endetAm > e.beginntAm ? e.endetAm : new Date(new Date(e.beginntAm).getTime() + 30 * 60_000).toISOString(), ganztags: e.ganztags, ort: e.ort, notiz: e.notiz, extern_geaendert_am: e.geaendertAm ?? jetzt.toISOString(), geloescht_am: null };
      if (alt) {
        if (!letzter || !e.geaendertAm || e.geaendertAm > letzter) {
          await supabase.from("termine").update(felder).eq("id", alt.id as string);
          erg.herein++;
        }
      } else {
        const { error } = await supabase.from("termine").insert({ mandant_id: postfach.mandant_id, art: "sonstiges", zustaendig_id: postfach.benutzer_id, erstellt_von: postfach.benutzer_id, extern_quelle: anbieter.art, extern_id: e.externId, postfach_id: postfach.id, nachfassen: false, erinnerung_minuten: null, ...felder });
        if (!error) erg.herein++;
      }
    }
  } catch (e) {
    erg.fehler.push(`Abruf: ${e instanceof Error ? e.message : "unbekannt"}`);
  }

  return { ergebnis: erg, zustand: { letzter_abgleich: jetzt.toISOString(), hinaus: erg.hinaus, herein: erg.herein, geloescht: erg.geloescht, fehler: erg.fehler.slice(0, 5) } };
}

// GMAIL_BASIS wird nur re-exportiert, damit Tests den Google-Pfad und den Kalender-Pfad nebeneinander sehen.
export { GMAIL_BASIS };
