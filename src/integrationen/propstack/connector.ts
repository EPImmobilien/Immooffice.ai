/**
 * Propstack-Connector (docs/SCOPE.md G, docs/AUTONOMIE.md 5.2).
 *
 * Anmeldung mit dem API-Schluessel des Mandanten (verschluesselt gespeichert,
 * nie angezeigt). Seitenweiser Abruf, Zeitfilter nach `updated_at`.
 *
 * Ohne Testzugang gilt: Pfade und Feldnamen folgen der oeffentlichen
 * Dokumentation und sind vor dem ersten Lauf zu pruefen — die
 * Verbindungspruefung schreibt ins Protokoll, welche erwarteten Felder das
 * Konto liefert und welche fehlen (konfig.felder_fehlend).
 */

import { z } from "zod";

import type { Connector, Datensatzfehler, HolEingabe, HolErgebnis, Kontext, SendeErgebnis } from "../kern/connector";
import type { KanonischerKontakt, KanonischesObjekt } from "../kern/modell";
import { PFAD, PropstackFehler, anfrage } from "./api";
import {
  KONTAKT_ERWARTETE_FELDER,
  OBJEKT_ERWARTETE_FELDER,
  kontaktAusPropstack,
  kontaktNachPropstack,
  objektAusPropstack,
  objektNachPropstack,
} from "./mapping";

const schema = z.object({
  api_schluessel: z.string().trim().min(10, "Der API-Schlüssel fehlt oder ist zu kurz."),
});

export type PropstackZugangsdaten = z.infer<typeof schema>;
type K = Kontext<PropstackZugangsdaten>;
type Roh = Record<string, unknown>;

const SEITENGROESSE = 100;

function abhaengigkeiten(kontext: K) {
  const basis = kontext.konfig["basis_url"];
  return { fetch: kontext.fetch, ...(typeof basis === "string" && basis ? { basis } : {}) };
}

function liste(antwort: unknown): Roh[] {
  if (Array.isArray(antwort)) return antwort.filter((e): e is Roh => Boolean(e) && typeof e === "object");
  if (antwort && typeof antwort === "object") {
    const a = antwort as Roh;
    for (const schluessel of ["data", "units", "properties", "contacts", "clients", "items"]) {
      if (Array.isArray(a[schluessel])) return (a[schluessel] as unknown[]).filter((e): e is Roh => Boolean(e) && typeof e === "object");
    }
  }
  return [];
}

function neuerAls(e: Roh, seit: Date | undefined): boolean {
  if (!seit) return true;
  const g = typeof e["updated_at"] === "string" ? new Date(e["updated_at"]) : null;
  return !g || Number.isNaN(g.getTime()) || g >= seit;
}

function fehlendeFelder(e: Roh | undefined, erwartet: readonly string[]): string[] {
  if (!e) return [...erwartet];
  return erwartet.filter((f) => !(f in e));
}

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : "Unbekannter Fehler.";
}

export const propstackConnector: Connector<PropstackZugangsdaten> = {
  id: "propstack",
  name: "Propstack",
  beschreibung: "Objekte, Kontakte und Bilder mit Propstack abgleichen — in beide Richtungen. Feldnamen werden beim Prüfen der Verbindung gegen das Konto abgeglichen.",
  anmeldung: "api_schluessel",
  anmeldefelder: [
    { schluessel: "api_schluessel", beschriftung: "API-Schlüssel", geheim: true, hinweis: "Propstack → Einstellungen → API. Wird verschlüsselt gespeichert und nie angezeigt." },
  ],
  faehigkeiten: ["objekte_holen", "objekte_senden", "kontakte_holen", "kontakte_senden", "bilder"],
  zugangsdatenSchema: schema,

  async verbindungPruefen(kontext) {
    try {
      const abh = abhaengigkeiten(kontext);
      const [objekte, kontakte] = await Promise.all([
        anfrage<unknown>(kontext.zugangsdaten, PFAD.objekte, { abfrage: { page: 1, per: 1 } }, abh),
        anfrage<unknown>(kontext.zugangsdaten, PFAD.kontakte, { abfrage: { page: 1, per: 1 } }, abh),
      ]);
      const o = liste(objekte)[0];
      const k = liste(kontakte)[0];
      const fehlend = [
        ...fehlendeFelder(o, OBJEKT_ERWARTETE_FELDER).map((f) => `Objekt.${f}`),
        ...fehlendeFelder(k, KONTAKT_ERWARTETE_FELDER).map((f) => `Kontakt.${f}`),
      ];
      kontext.konfigAendern({ felder_fehlend: fehlend, felder_geprueft_am: kontext.jetzt().toISOString() });
      kontext.protokoll(
        fehlend.length === 0
          ? "Feldpruefung: alle erwarteten Felder vorhanden."
          : `Feldpruefung: ${fehlend.length} erwartete Felder fehlen (${fehlend.slice(0, 8).join(", ")}${fehlend.length > 8 ? ", …" : ""}).`,
      );
      const hinweis = !o && !k ? " Das Konto ist noch leer." : fehlend.length > 0 ? ` ${fehlend.length} erwartete Felder fehlen — Mapping vor dem ersten Lauf prüfen.` : "";
      return { ok: true, meldung: `Verbindung steht.${hinweis}`, details: { felder_fehlend: fehlend.length } };
    } catch (e) {
      return { ok: false, meldung: meldung(e) };
    }
  },

  async objekteHolen(kontext, eingabe: HolEingabe): Promise<HolErgebnis<KanonischesObjekt>> {
    const seite = eingabe.seite ?? 0;
    const groesse = eingabe.seitengroesse ?? SEITENGROESSE;
    const abfrage: Record<string, string | number> = { page: seite + 1, per: groesse, expand: 1 };
    if (eingabe.seit) abfrage["updated_after"] = eingabe.seit.toISOString();
    const antwort = await anfrage<unknown>(kontext.zugangsdaten, PFAD.objekte, { abfrage }, abhaengigkeiten(kontext));
    const roh = liste(antwort);

    const datensaetze: KanonischesObjekt[] = [];
    const fehler: Datensatzfehler[] = [];
    for (const e of roh) {
      if (!neuerAls(e, eingabe.seit)) continue;
      try {
        datensaetze.push(objektAusPropstack(e));
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
          const r = await anfrage<Roh>(kontext.zugangsdaten, PFAD.objekte, { methode: "POST", koerper: { property: objektNachPropstack(o) } }, abh);
          const id = r?.["id"];
          if (id === undefined || id === null) throw new PropstackFehler("Propstack hat keine ID für das neue Objekt geliefert.", 0);
          angelegt.push({ lokal_id: o.lokal_id, fremd_id: String(id) });
        } else {
          await anfrage<unknown>(kontext.zugangsdaten, `${PFAD.objekte}/${encodeURIComponent(fremdId)}`, { methode: "PUT", koerper: { property: objektNachPropstack(o) } }, abh);
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
    const abfrage: Record<string, string | number> = { page: seite + 1, per: groesse };
    if (eingabe.seit) abfrage["updated_after"] = eingabe.seit.toISOString();
    const antwort = await anfrage<unknown>(kontext.zugangsdaten, PFAD.kontakte, { abfrage }, abhaengigkeiten(kontext));
    const roh = liste(antwort);

    const datensaetze: KanonischerKontakt[] = [];
    const fehler: Datensatzfehler[] = [];
    for (const e of roh) {
      if (!neuerAls(e, eingabe.seit)) continue;
      try {
        datensaetze.push(kontaktAusPropstack(e));
      } catch (f) {
        fehler.push({ typ: "kontakt", fremd_id: e["id"] !== undefined ? String(e["id"]) : null, meldung: meldung(f) });
      }
    }
    return { datensaetze, fehler, weitere: roh.length >= groesse };
  },

  async kontakteSenden(kontext, kontakte): Promise<SendeErgebnis> {
    const angelegt: SendeErgebnis["angelegt"] = [];
    const geaendert: string[] = [];
    const fehler: Datensatzfehler[] = [];
    const abh = abhaengigkeiten(kontext);

    for (const k of kontakte) {
      const fremdId = (k as { fremd_id?: string }).fremd_id;
      const neu = !fremdId || fremdId === k.lokal_id;
      try {
        if (neu) {
          const r = await anfrage<Roh>(kontext.zugangsdaten, PFAD.kontakte, { methode: "POST", koerper: { client: kontaktNachPropstack(k) } }, abh);
          const id = r?.["id"];
          if (id === undefined || id === null) throw new PropstackFehler("Propstack hat keine ID für den neuen Kontakt geliefert.", 0);
          angelegt.push({ lokal_id: k.lokal_id, fremd_id: String(id) });
        } else {
          await anfrage<unknown>(kontext.zugangsdaten, `${PFAD.kontakte}/${encodeURIComponent(fremdId)}`, { methode: "PUT", koerper: { client: kontaktNachPropstack(k) } }, abh);
          geaendert.push(k.lokal_id);
        }
      } catch (e) {
        fehler.push({ typ: "kontakt", fremd_id: fremdId ?? null, meldung: meldung(e) });
      }
    }
    return { angelegt, geaendert, fehler };
  },
};
