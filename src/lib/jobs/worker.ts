import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { kontextErzeugen, type Connector } from "@/integrationen/kern/connector";
import { syncAusfuehren, type LaufEingabe } from "@/integrationen/kern/lauf";
import { connectorFinden } from "@/integrationen/kern/registry";
import { SpeicherSupabase } from "@/integrationen/kern/speicher-supabase";
import { entschluesseln, objektEntschluesseln, verschluesseln } from "@/integrationen/kern/zugangsdaten";
import { kundenErinnerungenSenden, terminErinnerungenSenden } from "@/lib/kalender/erinnerungen";
import { kalenderAbgleichen, kalenderAnbieterErzeugen } from "@/lib/kalender/sync";
import { mailSenden } from "@/lib/mail/versand";
import { istVorlage, vorlage } from "@/lib/mail/vorlagen";
import { nachrichtenUebernehmen } from "@/lib/postfach/abgleich";
import { anbieterErzeugen } from "@/lib/postfach/anbieter";
import { fehlerText, oauthKonfig } from "@/lib/postfach/oauth";
import { istPostfachNutzlast, zugangParsen } from "@/lib/postfach/typen";
import { rueckrufeZustellen } from "@/lib/schnittstelle/rueckruf";
import { dienstClient } from "@/lib/supabase/dienst";
import { befundBewerten, befundHash, befundText, mailEntscheiden, pruefungFaellig, type Befund, type WaechterZustand } from "@/lib/waechter";

import { istSyncNutzlast, type JobZeile } from "./typen";

/**
 * Der Arbeiter (ARCHITECTURE.md Abschnitt 3).
 *
 * Beansprucht faellige Auftraege mit der Dienstrolle, arbeitet sie ab und
 * meldet Erfolg oder Fehlschlag zurueck. Laeuft
 *   - im Worker-Endpunkt (/api/jobs/ausfuehren), geweckt von Netlify oder
 *     pg_cron, und
 *   - unmittelbar nach dem Einstellen aus einer Server Action heraus, mit
 *     kleinem Zeitbudget, damit der Nutzer nicht auf den Zeitplan wartet.
 *
 * Die Dienstrolle ist hier zulaessig (dienst.ts: „Job-Worker"). Jede
 * Schreiboperation setzt trotzdem den Mandanten des Auftrags ausdruecklich.
 */

export interface ArbeiterErgebnis {
  beansprucht: number;
  erledigt: number;
  gescheitert: number;
  /** Auftraege, die wegen des Zeitbudgets nicht mehr begonnen wurden — bleiben offen */
  zurueckgestellt: number;
  meldungen: string[];
}

export interface ArbeiterOptionen {
  arbeiter?: string;
  maxAnzahl?: number;
  /** Nach Ablauf werden keine weiteren Auftraege begonnen; ein laufender wird beendet. */
  zeitbudgetMs?: number;
  sperreSekunden?: number;
  fetch?: typeof globalThis.fetch;
}

export async function jobsAusfuehren(optionen: ArbeiterOptionen = {}): Promise<ArbeiterErgebnis> {
  const supabase = dienstClient();
  const arbeiter = optionen.arbeiter ?? `worker-${randomUUID().slice(0, 8)}`;
  const start = Date.now();
  const budget = optionen.zeitbudgetMs ?? 240_000;
  const ergebnis: ArbeiterErgebnis = { beansprucht: 0, erledigt: 0, gescheitert: 0, zurueckgestellt: 0, meldungen: [] };

  const { data, error } = await supabase.rpc("jobs_beanspruchen", {
    p_arbeiter: arbeiter,
    p_anzahl: optionen.maxAnzahl ?? 5,
    p_sperre_sekunden: optionen.sperreSekunden ?? 600,
  });
  if (error) throw new Error(`Auftraege konnten nicht beansprucht werden: ${error.message}`);

  const jobs = (data ?? []) as JobZeile[];
  ergebnis.beansprucht = jobs.length;

  for (const job of jobs) {
    if (Date.now() - start > budget) {
      // Zurueck in die Schlange, ohne Fehlerzaehlung: Der Auftrag war nie dran.
      await supabase
        .from("jobs")
        .update({ status: "offen", sperre_bis: null, arbeiter: null, versuche: Math.max(0, job.versuche - 1) })
        .eq("id", job.id)
        .eq("status", "laeuft");
      ergebnis.zurueckgestellt++;
      continue;
    }

    try {
      const resultat = await auftragAusfuehren(supabase, job, optionen.fetch ?? globalThis.fetch);
      const { error: abschlussFehler } = await supabase.rpc("job_abschliessen", { p_id: job.id, p_ergebnis: resultat });
      if (abschlussFehler) throw new Error(abschlussFehler.message);
      ergebnis.erledigt++;
    } catch (e) {
      const text = e instanceof Error ? e.message : "unbekannter Fehler";
      await supabase.rpc("job_fehlgeschlagen", { p_id: job.id, p_fehler: text });
      ergebnis.gescheitert++;
      ergebnis.meldungen.push(`${job.art} ${job.id}: ${text}`);
    }
  }

  return ergebnis;
}

async function auftragAusfuehren(
  supabase: SupabaseClient,
  job: JobZeile,
  fetchFn: typeof globalThis.fetch,
): Promise<Record<string, unknown>> {
  switch (job.art) {
    case "sync":
      return syncAuftrag(supabase, job, fetchFn);
    case "mail":
      return mailAuftrag(supabase, job, fetchFn);
    case "postfach":
      return postfachAuftrag(supabase, job, fetchFn);
    default:
      throw new Error(`Fuer Auftraege der Art „${job.art}" gibt es noch keinen Arbeiter.`);
  }
}

/**
 * Tagesarbeiten vor dem Beanspruchen: faellige Abgleiche einplanen und die
 * Abo-Zustaende pruefen (Lesemodus, Erinnerungen, Benutzerlimit). Beides
 * ist idempotent und billig; ein Fehler hier haelt die Warteschlange nicht an.
 */
export async function tagesarbeiten(): Promise<{
  eingeplant: number;
  abos: Record<string, unknown>;
  postfaecher: number;
  aufgeraeumt: number;
  reservierungen: number;
  akquiseLaeufe: number;
  nachfassen: number;
  erinnerungen: { gesendet: number; fehler: string | null };
  kundenErinnerungen: { gesendet: number; uebersprungen: number; fehler: string | null };
  waechter: string | null;
  rueckrufe: { zugestellt: number; gescheitert: number } | string;
}> {
  const supabase = dienstClient();
  const [einplaner, abos, postfaecher, aufgeraeumt, reservierungen, akquiseLaeufe, nachfassen] = await Promise.all([
    supabase.rpc("sync_faellige_einplanen"),
    supabase.rpc("abos_pruefen"),
    supabase.rpc("postfaecher_faellige_einplanen"),
    supabase.rpc("nachrichten_aufraeumen"),
    supabase.rpc("reservierungen_ablaufen"),
    supabase.rpc("akquise_laeufe_ausfuehren"),
    supabase.rpc("besichtigungen_nachfassen"),
  ]);
  let erinnerungen: { gesendet: number; fehler: string | null };
  try {
    erinnerungen = await terminErinnerungenSenden(supabase, globalThis.fetch);
  } catch (e) {
    erinnerungen = { gesendet: 0, fehler: e instanceof Error ? e.message : "unbekannt" };
  }
  let kundenErinnerungen: { gesendet: number; uebersprungen: number; fehler: string | null };
  try {
    kundenErinnerungen = await kundenErinnerungenSenden(supabase, globalThis.fetch);
  } catch (e) {
    kundenErinnerungen = { gesendet: 0, uebersprungen: 0, fehler: e instanceof Error ? e.message : "unbekannt" };
  }
  let waechter: string | null = null;
  try {
    waechter = await waechterMelden(supabase);
  } catch (e) {
    waechter = `Waechter gescheitert: ${e instanceof Error ? e.message : "unbekannt"}`;
  }
  let rueckrufe: { zugestellt: number; gescheitert: number } | string;
  try {
    rueckrufe = await rueckrufeZustellen(supabase, globalThis.fetch, { maxAnzahl: 20, zeitbudgetMs: 6_000 });
  } catch (e) {
    rueckrufe = `Rueckrufe gescheitert: ${e instanceof Error ? e.message : "unbekannt"}`;
  }
  return {
    eingeplant: typeof einplaner.data === "number" ? einplaner.data : 0,
    abos: (abos.data as Record<string, unknown> | null) ?? {},
    postfaecher: typeof postfaecher.data === "number" ? postfaecher.data : 0,
    aufgeraeumt: typeof aufgeraeumt.data === "number" ? aufgeraeumt.data : 0,
    reservierungen: typeof reservierungen.data === "number" ? reservierungen.data : 0,
    akquiseLaeufe: typeof akquiseLaeufe.data === "number" ? akquiseLaeufe.data : 0,
    nachfassen: typeof nachfassen.data === "number" ? nachfassen.data : 0,
    erinnerungen,
    kundenErinnerungen,
    waechter,
    rueckrufe,
  };
}

/**
 * Waechter (Funktionsprompt, Grundprinzip 4): stuendlich den Befund der
 * Ketten holen, bewerten und den Betreiber per Mail informieren — gleiche
 * Lage hoechstens einmal je 24 Stunden, neue Lage sofort, Entwarnung bei
 * Gruen. Zustand liegt in plattform_einstellungen.waechter_zustand.
 */
export async function waechterMelden(
  supabase: SupabaseClient,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  jetzt: Date = new Date(),
): Promise<string | null> {
  const { data: zeilen } = await supabase
    .from("plattform_einstellungen")
    .select("schluessel, wert")
    .in("schluessel", ["waechter_zustand", "waechter_empfaenger"]);
  const einstellung = (schluessel: string): unknown => zeilen?.find((z) => z.schluessel === schluessel)?.wert;
  const zustand = ((einstellung("waechter_zustand") as WaechterZustand | null) ?? {}) as WaechterZustand;
  if (!pruefungFaellig(zustand, jetzt)) return null;

  const { data: roh, error } = await supabase.rpc("waechter_befund");
  if (error) throw new Error(error.message);
  const bewertung = befundBewerten((roh as Befund | null) ?? {});
  const hash = befundHash(bewertung);
  const art = mailEntscheiden(zustand, bewertung, hash, jetzt);

  const empfaengerEinstellung = einstellung("waechter_empfaenger");
  const empfaenger = typeof empfaengerEinstellung === "string" && empfaengerEinstellung.includes("@")
    ? empfaengerEinstellung
    : (process.env["WAECHTER_EMPFAENGER"] ?? "");

  let meldung: string | null = null;
  const neuerZustand: WaechterZustand = { ...zustand, geprueft_am: jetzt.toISOString(), rot: bewertung.rot, hash };
  if (art && empfaenger) {
    const inhalt = befundText(bewertung, art, jetzt);
    try {
      await mailSenden({ an: empfaenger, betreff: inhalt.betreff, text: inhalt.text }, fetchFn);
      neuerZustand.mail_am = jetzt.toISOString();
      meldung = `${art} an Betreiber gesendet`;
    } catch (e) {
      meldung = `${art} faellig, Versand gescheitert: ${e instanceof Error ? e.message : "unbekannt"}`;
    }
  } else if (art) {
    meldung = `${art} faellig, aber kein Empfaenger (WAECHTER_EMPFAENGER oder plattform_einstellungen.waechter_empfaenger)`;
  }

  await supabase
    .from("plattform_einstellungen")
    .upsert({ schluessel: "waechter_zustand", wert: neuerZustand, geaendert_am: jetzt.toISOString() }, { onConflict: "schluessel" });
  return meldung;
}

/** Erinnerungsmail (S2, S3): Vorlage rendern und versenden. */
async function mailAuftrag(
  supabase: SupabaseClient,
  job: JobZeile,
  fetchFn: typeof globalThis.fetch,
): Promise<Record<string, unknown>> {
  const n = job.nutzlast;
  const an = typeof n["an"] === "string" ? n["an"] : null;
  if (!an) throw new Error("Mail-Auftrag ohne Empfaenger.");
  // Freie Mail (Kundenbereich: Einladung, Antwort, Bestaetigung) — Betreff und
  // Text stehen fertig in der Nutzlast, der Absendername kommt vom Mandanten.
  if (n["vorlage"] === "frei") {
    const betreff = typeof n["betreff"] === "string" ? n["betreff"] : "";
    const text = typeof n["text"] === "string" ? n["text"] : "";
    if (!betreff || !text) throw new Error("Freie Mail ohne Betreff oder Text.");
    const antwortAn = typeof n["antwort_an"] === "string" ? n["antwort_an"] : undefined;
    const ergebnis = await mailSenden({ an, betreff, text, ...(antwortAn ? { antwortAn } : {}) }, fetchFn);
    return { vorlage: "frei", versand_id: ergebnis.id };
  }
  if (!istVorlage(n["vorlage"])) throw new Error("Mail-Auftrag mit unbekannter Vorlage.");

  const { data: mandant } = await supabase
    .from("mandanten")
    .select("name, testphase_bis, loeschung_geplant_am")
    .eq("id", job.mandant_id)
    .maybeSingle();
  if (!mandant) throw new Error("Mandant nicht gefunden.");

  const basis = (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
  const inhalt = vorlage(n["vorlage"], {
    unternehmen: mandant.name as string,
    testphaseBis: (mandant.testphase_bis as string | null) ?? null,
    loeschungAm: (mandant.loeschung_geplant_am as string | null) ?? null,
    aboAdresse: `${basis}/credits`,
  });

  const ergebnis = await mailSenden({ an, betreff: inhalt.betreff, text: inhalt.text }, fetchFn);
  return { vorlage: n["vorlage"], versand_id: ergebnis.id };
}

/**
 * Ein Abgleich: Integration laden, Zugangsdaten entschluesseln, Lauf
 * ausfuehren, Lauf und Integration fortschreiben.
 */
async function syncAuftrag(
  supabase: SupabaseClient,
  job: JobZeile,
  fetchFn: typeof globalThis.fetch,
): Promise<Record<string, unknown>> {
  if (!istSyncNutzlast(job.nutzlast)) throw new Error("Die Nutzlast des Abgleichs ist unvollstaendig.");
  const nutzlast = job.nutzlast;

  const { data: integration, error } = await supabase
    .from("integrationen")
    .select("id, mandant_id, anbieter, konfig, richtung, letzter_sync_am, zugangsdaten_verschluesselt")
    .eq("id", nutzlast.integration_id)
    .eq("mandant_id", job.mandant_id)
    .maybeSingle();
  if (error || !integration) throw new Error("Die Integration wurde nicht gefunden.");

  const connector = connectorFinden(integration.anbieter as string) as unknown as Connector<unknown> | null;
  if (!connector) throw new Error(`Unbekannter Anbieter: ${integration.anbieter}`);

  const zugangsdaten = integration.zugangsdaten_verschluesselt
    ? objektEntschluesseln(integration.zugangsdaten_verschluesselt as string, integration.mandant_id as string)
    : {};
  const geprueft = connector.zugangsdatenSchema.safeParse(zugangsdaten);
  if (!geprueft.success) throw new Error("Die gespeicherten Zugangsdaten sind unvollstaendig. Bitte neu eingeben.");

  // Lauf anlegen (oder den bereits angelegten fortfuehren).
  const { data: lauf, error: laufFehler } = await supabase
    .from("sync_laeufe")
    .insert({
      integration_id: integration.id,
      mandant_id: integration.mandant_id,
      richtung: nutzlast.richtung,
      ausloeser: nutzlast.ausloeser,
      ausgeloest_von: job.erstellt_von,
      job_id: job.id,
      status: "laeuft",
    })
    .select("id")
    .single();
  if (laufFehler || !lauf) throw new Error(`Der Sync-Lauf konnte nicht angelegt werden: ${laufFehler?.message ?? ""}`);

  const protokoll: string[] = [];
  const konfig = { ...((integration.konfig as Record<string, unknown> | null) ?? {}) };
  const kontext = kontextErzeugen<unknown>({
    mandantId: integration.mandant_id as string,
    integrationId: integration.id as string,
    zugangsdaten: geprueft.data,
    konfig,
    fetch: fetchFn,
    protokoll: (zeile) => protokoll.push(zeile),
  });

  const eingabe: LaufEingabe = {
    richtung: nutzlast.richtung,
    seit: (integration.letzter_sync_am as string | null) ?? null,
  };
  if (nutzlast.datei_pfad) {
    eingabe.datei = await importdateiLaden(supabase, integration.mandant_id as string, nutzlast.datei_pfad);
    // Eine Datei ist immer ein Vollimport, kein Zeitfilter.
    eingabe.seit = null;
  }

  const speicher = new SpeicherSupabase(supabase, integration.mandant_id as string, integration.id as string, job.erstellt_von, fetchFn);

  try {
    const ergebnis = await syncAusfuehren(connector, kontext, speicher, eingabe);
    const status = ergebnis.fehler.length > 0 && ergebnis.angelegt + ergebnis.geaendert === 0 ? "fehler" : "fertig";

    await supabase
      .from("sync_laeufe")
      .update({
        status,
        beendet_am: new Date().toISOString(),
        angelegt: ergebnis.angelegt,
        geaendert: ergebnis.geaendert,
        uebersprungen: ergebnis.uebersprungen,
        fehler: ergebnis.fehler,
        konflikte: ergebnis.konflikte,
      })
      .eq("id", lauf.id);

    await supabase
      .from("integrationen")
      .update({
        konfig: kontext.konfig,
        status: status === "fehler" ? "fehler" : "aktiv",
        letzter_sync_am: new Date().toISOString(),
        fehler_text:
          status === "fehler"
            ? `${ergebnis.fehler.length} ${ergebnis.fehler.length === 1 ? "Datensatz" : "Datensätze"} fehlerhaft, nichts übernommen.`
            : null,
      })
      .eq("id", integration.id)
      .eq("mandant_id", integration.mandant_id);

    if (nutzlast.datei_pfad) {
      // Die Importdatei ist verarbeitet; sie bleibt nicht liegen.
      await supabase.storage.from("importe").remove([nutzlast.datei_pfad]);
    }

    return {
      lauf_id: lauf.id,
      angelegt: ergebnis.angelegt,
      geaendert: ergebnis.geaendert,
      uebersprungen: ergebnis.uebersprungen,
      fehler: ergebnis.fehler.length,
      konflikte: ergebnis.konflikte.length,
      protokoll: protokoll.slice(0, 50),
    };
  } catch (e) {
    const text = e instanceof Error ? e.message : "unbekannter Fehler";
    await supabase
      .from("sync_laeufe")
      .update({ status: "fehler", beendet_am: new Date().toISOString(), fehler: [{ typ: "objekt", fremd_id: null, meldung: text }] })
      .eq("id", lauf.id);
    await supabase
      .from("integrationen")
      .update({ status: "fehler", fehler_text: text.slice(0, 500) })
      .eq("id", integration.id)
      .eq("mandant_id", integration.mandant_id);
    throw e;
  }
}

/**
 * Ein Postfach abgleichen (docs/AUTONOMIE.md P4): Zugangsdaten entschluesseln,
 * neue Nachrichten holen, mit Zuordnung speichern, Abgleichzustand und ggf.
 * erneuerte Tokens zurueckschreiben. Fehler zaehlen hoch — der Einplaner
 * streckt dann den Abstand.
 */
async function postfachAuftrag(
  supabase: SupabaseClient,
  job: JobZeile,
  fetchFn: typeof globalThis.fetch,
): Promise<Record<string, unknown>> {
  if (!istPostfachNutzlast(job.nutzlast)) throw new Error("Die Nutzlast des Postfach-Auftrags ist unvollstaendig.");

  const { data: postfach, error } = await supabase
    .from("postfaecher")
    .select("id, mandant_id, benutzer_id, anbieter, adresse, anzeigename, zugangsdaten, sync_zustand, status, fehler_zaehler, kalender_sync, kalender_zustand")
    .eq("id", job.nutzlast.postfach_id)
    .eq("mandant_id", job.mandant_id)
    .maybeSingle();
  if (error || !postfach) throw new Error("Das Postfach wurde nicht gefunden.");
  if (postfach.status === "getrennt" || !postfach.zugangsdaten) throw new Error("Das Postfach ist getrennt.");

  const mandantId = postfach.mandant_id as string;
  const zugang = zugangParsen(entschluesseln(postfach.zugangsdaten as string, mandantId));
  const absender = {
    adresse: postfach.adresse as string,
    ...(postfach.anzeigename ? { name: postfach.anzeigename as string } : {}),
  };
  const anbieter = anbieterErzeugen(zugang, absender, fetchFn);
  const jetzt = new Date().toISOString();

  try {
    const ergebnis = await anbieter.abrufen((postfach.sync_zustand as Record<string, unknown> | null) ?? {}, { maxAnzahl: 50 });
    const uebernommen = await nachrichtenUebernehmen(supabase, { id: postfach.id as string, mandant_id: mandantId }, ergebnis.nachrichten);

    // Kalender-Abgleich (K2) haengt am selben Zugang — nur bei OAuth-Postfaechern und wenn eingeschaltet.
    let kalender: Record<string, unknown> | null = null;
    if (postfach.kalender_sync && postfach.benutzer_id) {
      const erneuertMail = anbieter.aktualisierterZugang?.() ?? zugang;
      const kalenderAnbieter = erneuertMail.art === "imap" ? null : kalenderAnbieterErzeugen(erneuertMail, fetchFn, oauthKonfig(erneuertMail.art));
      if (kalenderAnbieter) {
        try {
          const lauf = await kalenderAbgleichen(supabase, { id: postfach.id as string, mandant_id: mandantId, benutzer_id: postfach.benutzer_id as string, kalender_zustand: (postfach.kalender_zustand as Record<string, unknown> | null) ?? null }, kalenderAnbieter);
          kalender = lauf.zustand;
        } catch (e) {
          kalender = { letzter_abgleich: jetzt, fehler: [fehlerText(e).slice(0, 300)] };
        }
      }
    }

    const erneuert = anbieter.aktualisierterZugang?.() ?? null;
    await supabase
      .from("postfaecher")
      .update({
        sync_zustand: ergebnis.zustand,
        ...(kalender ? { kalender_zustand: kalender } : {}),
        letzter_abruf_am: jetzt,
        status: "aktiv",
        fehler_text: null,
        fehler_zaehler: 0,
        ...(erneuert ? { zugangsdaten: verschluesseln(JSON.stringify(erneuert), mandantId) } : {}),
      })
      .eq("id", postfach.id);

    return { ...uebernommen, vollstaendig: ergebnis.vollstaendig, ...(kalender ? { kalender } : {}) };
  } catch (e) {
    const text = fehlerText(e);
    await supabase
      .from("postfaecher")
      .update({
        status: "fehler",
        fehler_text: text.slice(0, 500),
        fehler_zaehler: ((postfach.fehler_zaehler as number | null) ?? 0) + 1,
        letzter_abruf_am: jetzt,
      })
      .eq("id", postfach.id);
    throw e;
  }
}

async function importdateiLaden(
  supabase: SupabaseClient,
  mandantId: string,
  pfad: string,
): Promise<{ name: string; inhalt: Uint8Array }> {
  // Der Pfad kommt aus der Nutzlast; er MUSS im Ordner des Mandanten liegen.
  if (!pfad.startsWith(`${mandantId}/`)) throw new Error("Die Importdatei gehoert nicht zu diesem Mandanten.");
  const { data, error } = await supabase.storage.from("importe").download(pfad);
  if (error || !data) throw new Error("Die Importdatei konnte nicht geladen werden.");
  return { name: pfad.split("/").pop() ?? "import", inhalt: new Uint8Array(await data.arrayBuffer()) };
}
