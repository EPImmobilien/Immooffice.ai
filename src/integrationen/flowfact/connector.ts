/**
 * FlowFact-Connector (docs/SCOPE.md G, docs/AUTONOMIE.md 5.2).
 *
 * Anmeldung per OAuth2 Client Credentials; Client-ID und -Geheimnis stellt der
 * Mandant aus seinem FlowFact-Konto bereit (verschluesselt gespeichert). Holt
 * Objekte und Kontakte, sendet Objekte.
 *
 * Ohne Testzugang gelten Adressen, Pfade und Feldnamen als ANNAHME (api.ts,
 * mapping.ts). Die Verbindungspruefung meldet, welche Kandidatenfelder das
 * Konto liefert; Token- und Basisadresse sind je Integration ueberschreibbar.
 */

import { z } from "zod";

import type { Connector, Datensatzfehler, HolEingabe, HolErgebnis, Kontext, SendeErgebnis } from "../kern/connector";
import type { KanonischerKontakt, KanonischesObjekt } from "../kern/modell";
import { FLOWFACT_VORGABEN, FlowfactFehler, PFAD, anfrage, tokenHolen } from "./api";
import { KONTAKT_KANDIDATEN, OBJEKT_KANDIDATEN, kontaktAusFlowfact, objektAusFlowfact, objektNachFlowfact, wert } from "./mapping";

const adresseOderLeer = z
  .string()
  .trim()
  .max(300)
  .refine((w) => w === "" || /^https?:\/\/\S+$/.test(w), "Bitte eine vollständige Adresse mit https:// angeben.")
  .optional();

const schema = z.object({
  client_id: z.string().trim().min(1, "Die Client-ID fehlt."),
  client_geheimnis: z.string().trim().min(1, "Das Client-Geheimnis fehlt."),
  token_url: adresseOderLeer,
  basis_url: adresseOderLeer,
});

export type FlowfactZugangsdaten = z.infer<typeof schema>;
type K = Kontext<FlowfactZugangsdaten>;
type Roh = Record<string, unknown>;

const SEITENGROESSE = 100;

function abhaengigkeiten(kontext: K) {
  return { fetch: kontext.fetch, jetzt: kontext.jetzt, zwischenspeicher: kontext.integrationId };
}

function liste(antwort: unknown): Roh[] {
  if (Array.isArray(antwort)) return antwort.filter((e): e is Roh => Boolean(e) && typeof e === "object");
  if (antwort && typeof antwort === "object") {
    const a = antwort as Roh;
    for (const schluessel of ["content", "entries", "entities", "items", "data", "results"]) {
      if (Array.isArray(a[schluessel])) return (a[schluessel] as unknown[]).filter((e): e is Roh => Boolean(e) && typeof e === "object");
    }
  }
  return [];
}

function fehlendeGruppen(e: Roh | undefined, kandidaten: Record<string, string[]>): string[] {
  if (!e) return Object.keys(kandidaten);
  return Object.entries(kandidaten)
    .filter(([, namen]) => wert(e, ...namen) === undefined)
    .map(([feld]) => feld);
}

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : "Unbekannter Fehler.";
}

export const flowfactConnector: Connector<FlowfactZugangsdaten> = {
  id: "flowfact",
  name: "FlowFact",
  beschreibung: "Objekte und Kontakte aus FlowFact holen, Objekte senden. Adressen und Feldnamen werden beim Prüfen der Verbindung gegen das Konto abgeglichen.",
  anmeldung: "oauth2_client_credentials",
  anmeldefelder: [
    { schluessel: "client_id", beschriftung: "Client-ID", geheim: false, hinweis: "Aus dem FlowFact-Partnerzugang" },
    { schluessel: "client_geheimnis", beschriftung: "Client-Geheimnis", geheim: true, hinweis: "Wird verschlüsselt gespeichert und nie angezeigt." },
    { schluessel: "token_url", beschriftung: "Token-Adresse (optional)", geheim: false, hinweis: `Leer = ${FLOWFACT_VORGABEN.token_url}` },
    { schluessel: "basis_url", beschriftung: "API-Basisadresse (optional)", geheim: false, hinweis: `Leer = ${FLOWFACT_VORGABEN.basis_url}` },
  ],
  faehigkeiten: ["objekte_holen", "objekte_senden", "kontakte_holen", "bilder"],
  zugangsdatenSchema: schema,

  async verbindungPruefen(kontext) {
    try {
      const abh = abhaengigkeiten(kontext);
      await tokenHolen(kontext.zugangsdaten, abh);
      const [objekte, kontakte] = await Promise.all([
        anfrage<unknown>(kontext.zugangsdaten, PFAD.objekte, { abfrage: { page: 0, size: 1 } }, abh),
        anfrage<unknown>(kontext.zugangsdaten, PFAD.kontakte, { abfrage: { page: 0, size: 1 } }, abh),
      ]);
      const o = liste(objekte)[0];
      const c = liste(kontakte)[0];
      const fehlend = [
        ...fehlendeGruppen(o, OBJEKT_KANDIDATEN).map((f) => `Objekt.${f}`),
        ...fehlendeGruppen(c, KONTAKT_KANDIDATEN).map((f) => `Kontakt.${f}`),
      ];
      kontext.konfigAendern({ felder_fehlend: fehlend, felder_geprueft_am: kontext.jetzt().toISOString() });
      kontext.protokoll(
        fehlend.length === 0
          ? "Feldpruefung: alle Kandidatenfelder gefunden."
          : `Feldpruefung: ${fehlend.length} kanonische Felder ohne Treffer (${fehlend.slice(0, 8).join(", ")}${fehlend.length > 8 ? ", …" : ""}).`,
      );
      const hinweis = !o && !c ? " Das Konto ist noch leer." : fehlend.length > 0 ? ` ${fehlend.length} Felder ohne Treffer — Mapping vor dem ersten Lauf prüfen.` : "";
      return { ok: true, meldung: `Anmeldung erfolgreich, Daten erreichbar.${hinweis}`, details: { felder_fehlend: fehlend.length } };
    } catch (e) {
      return { ok: false, meldung: meldung(e) };
    }
  },

  async objekteHolen(kontext, eingabe: HolEingabe): Promise<HolErgebnis<KanonischesObjekt>> {
    const seite = eingabe.seite ?? 0;
    const groesse = eingabe.seitengroesse ?? SEITENGROESSE;
    const abfrage: Record<string, string | number> = { page: seite, size: groesse };
    if (eingabe.seit) abfrage["modifiedAfter"] = eingabe.seit.toISOString();
    const antwort = await anfrage<unknown>(kontext.zugangsdaten, PFAD.objekte, { abfrage }, abhaengigkeiten(kontext));
    const roh = liste(antwort);

    const datensaetze: KanonischesObjekt[] = [];
    const fehler: Datensatzfehler[] = [];
    for (const e of roh) {
      try {
        const o = objektAusFlowfact(e);
        if (eingabe.seit && o.geaendert_am_fremd && new Date(o.geaendert_am_fremd) < eingabe.seit) continue;
        datensaetze.push(o);
      } catch (f) {
        fehler.push({ typ: "objekt", fremd_id: e["id"] !== undefined ? String(e["id"]) : null, meldung: meldung(f) });
      }
    }
    return { datensaetze, fehler, weitere: roh.length >= groesse };
  },

  async objekteSenden(kontext, objekte): Promise<SendeErgebnis> {
    const angelegt: SendeErgebnis["angelegt"] = [];
    const geaendert: string[] = [];
    const fehler: Datensatzfehler[] = [];
    const abh = abhaengigkeiten(kontext);

    for (const o of objekte) {
      const fremdId = (o as { fremd_id?: string }).fremd_id;
      const neu = !fremdId || fremdId === o.lokal_id;
      try {
        if (neu) {
          const r = await anfrage<Roh>(kontext.zugangsdaten, PFAD.objekte, { methode: "POST", koerper: objektNachFlowfact(o) }, abh);
          const id = r?.["id"] ?? r?.["_id"];
          if (id === undefined || id === null) throw new FlowfactFehler("FlowFact hat keine ID für das neue Objekt geliefert.", 0);
          angelegt.push({ lokal_id: o.lokal_id, fremd_id: String(id) });
        } else {
          await anfrage<unknown>(kontext.zugangsdaten, `${PFAD.objekte}/${encodeURIComponent(fremdId)}`, { methode: "PUT", koerper: objektNachFlowfact(o) }, abh);
          geaendert.push(o.lokal_id);
        }
      } catch (e) {
        fehler.push({ typ: "objekt", fremd_id: fremdId ?? null, meldung: meldung(e) });
      }
    }
    return { angelegt, geaendert, fehler };
  },

  async kontakteHolen(kontext, eingabe: HolEingabe): Promise<HolErgebnis<KanonischerKontakt>> {
    const seite = eingabe.seite ?? 0;
    const groesse = eingabe.seitengroesse ?? SEITENGROESSE;
    const abfrage: Record<string, string | number> = { page: seite, size: groesse };
    if (eingabe.seit) abfrage["modifiedAfter"] = eingabe.seit.toISOString();
    const antwort = await anfrage<unknown>(kontext.zugangsdaten, PFAD.kontakte, { abfrage }, abhaengigkeiten(kontext));
    const roh = liste(antwort);

    const datensaetze: KanonischerKontakt[] = [];
    const fehler: Datensatzfehler[] = [];
    for (const e of roh) {
      try {
        const k = kontaktAusFlowfact(e);
        if (eingabe.seit && k.geaendert_am_fremd && new Date(k.geaendert_am_fremd) < eingabe.seit) continue;
        datensaetze.push(k);
      } catch (f) {
        fehler.push({ typ: "kontakt", fremd_id: e["id"] !== undefined ? String(e["id"]) : null, meldung: meldung(f) });
      }
    }
    return { datensaetze, fehler, weitere: roh.length >= groesse };
  },
};
