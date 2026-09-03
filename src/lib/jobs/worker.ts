import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { kontextErzeugen, type Connector } from "@/integrationen/kern/connector";
import { syncAusfuehren, type LaufEingabe } from "@/integrationen/kern/lauf";
import { connectorFinden } from "@/integrationen/kern/registry";
import { SpeicherSupabase } from "@/integrationen/kern/speicher-supabase";
import { objektEntschluesseln } from "@/integrationen/kern/zugangsdaten";
import { mailSenden } from "@/lib/mail/versand";
import { istVorlage, vorlage } from "@/lib/mail/vorlagen";
import { dienstClient } from "@/lib/supabase/dienst";

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
    default:
      throw new Error(`Fuer Auftraege der Art „${job.art}" gibt es noch keinen Arbeiter.`);
  }
}

/**
 * Tagesarbeiten vor dem Beanspruchen: faellige Abgleiche einplanen und die
 * Abo-Zustaende pruefen (Lesemodus, Erinnerungen, Benutzerlimit). Beides
 * ist idempotent und billig; ein Fehler hier haelt die Warteschlange nicht an.
 */
export async function tagesarbeiten(): Promise<{ eingeplant: number; abos: Record<string, unknown> }> {
  const supabase = dienstClient();
  const [einplaner, abos] = await Promise.all([
    supabase.rpc("sync_faellige_einplanen"),
    supabase.rpc("abos_pruefen"),
  ]);
  return {
    eingeplant: typeof einplaner.data === "number" ? einplaner.data : 0,
    abos: (abos.data as Record<string, unknown> | null) ?? {},
  };
}

/** Erinnerungsmail (S2, S3): Vorlage rendern und versenden. */
async function mailAuftrag(
  supabase: SupabaseClient,
  job: JobZeile,
  fetchFn: typeof globalThis.fetch,
): Promise<Record<string, unknown>> {
  const n = job.nutzlast;
  const an = typeof n["an"] === "string" ? n["an"] : null;
  if (!an || !istVorlage(n["vorlage"])) throw new Error("Mail-Auftrag ohne Empfaenger oder mit unbekannter Vorlage.");

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
