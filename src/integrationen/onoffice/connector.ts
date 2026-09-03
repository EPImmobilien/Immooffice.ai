/**
 * onOffice-Connector (docs/SCOPE.md G, docs/AUTONOMIE.md 5.2).
 *
 * Anmeldung mit API-Token und Geheimnis des Mandanten; das Geheimnis wird
 * nur zum Signieren verwendet (api.ts) und liegt verschluesselt in der
 * Datenbank. Kein Standardwert, keine Kennung der Referenz.
 *
 * Feldnamen: Die Schnittstelle weist einen Leseaufruf komplett ab, sobald ein
 * Feldname im Konto unbekannt ist. Deshalb werden die Kandidatenfelder beim
 * ersten Lauf EINZELN geprueft und das Ergebnis in `konfig.felder`
 * festgehalten; danach wird nur noch angefordert, was das Konto kennt.
 */

import { z } from "zod";

import type {
  Connector,
  Datensatzfehler,
  HolEingabe,
  HolErgebnis,
  Kontext,
  SendeErgebnis,
} from "../kern/connector";
import type { KanonischerKontakt, KanonischesBild, KanonischesObjekt } from "../kern/modell";
import { AKTION, FEHLER_UNBEKANNTES_FELD, OnOfficeFehler, aufrufen, type Aktionsergebnis } from "./api";
import {
  ADRESS_FELDER,
  OBJEKT_KANDIDATENFELDER,
  OBJEKT_PFLICHTFELDER,
  kontaktAusOnOffice,
  kontaktNachOnOffice,
  objektAusOnOffice,
  objektNachOnOffice,
} from "./mapping";

const schema = z.object({
  token: z.string().trim().min(16, "Der API-Token fehlt oder ist zu kurz."),
  geheimnis: z.string().trim().min(16, "Das API-Geheimnis fehlt oder ist zu kurz."),
});

export type OnOfficeZugangsdaten = z.infer<typeof schema>;
type K = Kontext<OnOfficeZugangsdaten>;

const SEITENGROESSE = 100;
const BILDKATEGORIEN = ["Titelbild", "Foto", "Grundriss", "Foto_gross", "Panorama"];

function abhaengigkeiten(kontext: K) {
  return { fetch: kontext.fetch, jetzt: kontext.jetzt };
}

function ergebnisPruefen(ergebnis: Aktionsergebnis | undefined, was: string): Aktionsergebnis {
  if (!ergebnis) throw new OnOfficeFehler(`onOffice hat auf ${was} nicht geantwortet.`, 0);
  if (ergebnis.status.errorcode) {
    throw new OnOfficeFehler(
      ergebnis.status.errorcode === FEHLER_UNBEKANNTES_FELD
        ? "Ein angefordertes Feld ist in diesem onOffice-Konto unbekannt."
        : `onOffice meldet bei ${was} Fehler ${ergebnis.status.errorcode}.`,
      ergebnis.status.errorcode,
    );
  }
  return ergebnis;
}

/**
 * Prueft die Kandidatenfelder einzeln und merkt sich die gueltigen.
 *
 * Ein Aufruf je Feld mit `listlimit: 1` — teuer, aber nur einmal je
 * Integration; danach steht die Liste in `konfig.felder`.
 */
export async function felderPruefen(kontext: K): Promise<string[]> {
  const gueltig: string[] = [];
  for (const feld of OBJEKT_KANDIDATENFELDER) {
    try {
      const [r] = await aufrufen(
        kontext.zugangsdaten,
        [{ actionid: AKTION.lesen, resourcetype: "estate", parameters: { data: [feld], listlimit: 1 } }],
        abhaengigkeiten(kontext),
      );
      if (r && !r.status.errorcode) gueltig.push(feld);
    } catch (e) {
      // Nur der Feldfehler ist erwartbar; alles andere (Anmeldung, Netz) bricht ab.
      if (!(e instanceof OnOfficeFehler) || e.code !== FEHLER_UNBEKANNTES_FELD) throw e;
    }
  }
  kontext.konfigAendern({ felder: gueltig, felder_geprueft_am: kontext.jetzt().toISOString() });
  kontext.protokoll(`Feldpruefung: ${gueltig.length} von ${OBJEKT_KANDIDATENFELDER.length} Kandidatenfeldern vorhanden.`);
  return gueltig;
}

async function objektFelder(kontext: K): Promise<string[]> {
  const bekannt = kontext.konfig["felder"];
  const zusatz = Array.isArray(bekannt) && bekannt.every((f) => typeof f === "string")
    ? (bekannt as string[])
    : await felderPruefen(kontext);
  return [...OBJEKT_PFLICHTFELDER, ...zusatz];
}

export const onOfficeConnector: Connector<OnOfficeZugangsdaten> = {
  id: "onoffice",
  name: "onOffice",
  beschreibung: "Objekte, Adressen und Bilder mit onOffice enterprise abgleichen — in beide Richtungen.",
  anmeldung: "token_und_geheimnis",
  anmeldefelder: [
    { schluessel: "token", beschriftung: "API-Token", geheim: false, hinweis: "onOffice → Marketplace → API-Zugang" },
    { schluessel: "geheimnis", beschriftung: "API-Geheimnis", geheim: true, hinweis: "Wird verschlüsselt gespeichert und nie angezeigt." },
  ],
  faehigkeiten: ["objekte_holen", "objekte_senden", "kontakte_holen", "kontakte_senden", "bilder"],
  zugangsdatenSchema: schema,

  async verbindungPruefen(kontext) {
    try {
      const [objekte, adressen] = await aufrufen(
        kontext.zugangsdaten,
        [
          { actionid: AKTION.lesen, resourcetype: "estate", parameters: { data: ["Id"], listlimit: 1 } },
          { actionid: AKTION.lesen, resourcetype: "address", parameters: { data: ["Id"], listlimit: 1 } },
        ],
        abhaengigkeiten(kontext),
      );
      ergebnisPruefen(objekte, "Objekte");
      ergebnisPruefen(adressen, "Adressen");
      const anzahlObjekte = objekte!.data.meta?.cntabsolute ?? objekte!.data.records.length;
      const anzahlAdressen = adressen!.data.meta?.cntabsolute ?? adressen!.data.records.length;
      return {
        ok: true,
        meldung: `Verbindung steht. ${anzahlObjekte} Objekte und ${anzahlAdressen} Adressen erreichbar.`,
        details: { objekte: anzahlObjekte, adressen: anzahlAdressen },
      };
    } catch (e) {
      return { ok: false, meldung: e instanceof Error ? e.message : "Die Verbindung konnte nicht geprüft werden." };
    }
  },

  async objekteHolen(kontext, eingabe: HolEingabe): Promise<HolErgebnis<KanonischesObjekt>> {
    const felder = await objektFelder(kontext);
    const seite = eingabe.seite ?? 0;
    const groesse = eingabe.seitengroesse ?? SEITENGROESSE;

    const parameter: Record<string, unknown> = {
      data: felder,
      listlimit: groesse,
      listoffset: seite * groesse,
      sortby: { Aenderung: "DESC" },
      formatoutput: false,
    };
    if (eingabe.seit) {
      parameter["filter"] = { Aenderung: [{ op: ">=", val: eingabe.seit.toISOString().slice(0, 19).replace("T", " ") }] };
    }

    const [r] = await aufrufen(
      kontext.zugangsdaten,
      [{ actionid: AKTION.lesen, resourcetype: "estate", parameters: parameter }],
      abhaengigkeiten(kontext),
    );
    const ergebnis = ergebnisPruefen(r, "Objekte holen");

    const datensaetze: KanonischesObjekt[] = [];
    const fehler: Datensatzfehler[] = [];
    for (const rec of ergebnis.data.records) {
      try {
        datensaetze.push(objektAusOnOffice(rec.id, rec.elements));
      } catch (e) {
        fehler.push({ typ: "objekt", fremd_id: String(rec.id), meldung: e instanceof Error ? e.message : "nicht lesbar" });
      }
    }

    if (kontext.konfig["bilder"] !== false && datensaetze.length > 0) {
      await bilderErgaenzen(kontext, datensaetze, fehler);
    }

    const gesamt = ergebnis.data.meta?.cntabsolute ?? 0;
    return { datensaetze, fehler, weitere: (seite + 1) * groesse < gesamt };
  },

  async objekteSenden(kontext, objekte): Promise<SendeErgebnis> {
    const angelegt: SendeErgebnis["angelegt"] = [];
    const geaendert: string[] = [];
    const fehler: Datensatzfehler[] = [];

    // Einzeln senden: Ein fehlerhafter Datensatz stoppt nicht den Lauf (5.3).
    for (const o of objekte) {
      const fremdId = (o as { fremd_id?: string }).fremd_id;
      const neu = !fremdId || fremdId === o.lokal_id;
      try {
        const [r] = await aufrufen(
          kontext.zugangsdaten,
          [
            neu
              ? { actionid: AKTION.anlegen, resourcetype: "estate", parameters: { data: objektNachOnOffice(o) } }
              : { actionid: AKTION.aendern, resourcetype: "estate", resourceid: fremdId, parameters: { data: objektNachOnOffice(o) } },
          ],
          abhaengigkeiten(kontext),
        );
        const e = ergebnisPruefen(r, "Objekt senden");
        if (neu) {
          const id = e.data.records[0]?.id;
          if (id === undefined) throw new OnOfficeFehler("onOffice hat keine ID fuer das neue Objekt geliefert.", 0);
          angelegt.push({ lokal_id: o.lokal_id, fremd_id: String(id) });
        } else {
          geaendert.push(o.lokal_id);
        }
      } catch (e2) {
        fehler.push({ typ: "objekt", fremd_id: fremdId ?? null, meldung: e2 instanceof Error ? e2.message : "unbekannter Fehler" });
      }
    }
    return { angelegt, geaendert, fehler };
  },

  async kontakteHolen(kontext, eingabe: HolEingabe): Promise<HolErgebnis<KanonischerKontakt>> {
    const seite = eingabe.seite ?? 0;
    const groesse = eingabe.seitengroesse ?? SEITENGROESSE;
    const parameter: Record<string, unknown> = {
      data: [...ADRESS_FELDER],
      listlimit: groesse,
      listoffset: seite * groesse,
      sortby: { Aenderung: "DESC" },
      formatoutput: false,
    };
    if (eingabe.seit) {
      parameter["filter"] = { Aenderung: [{ op: ">=", val: eingabe.seit.toISOString().slice(0, 19).replace("T", " ") }] };
    }

    const [r] = await aufrufen(
      kontext.zugangsdaten,
      [{ actionid: AKTION.lesen, resourcetype: "address", parameters: parameter }],
      abhaengigkeiten(kontext),
    );
    const ergebnis = ergebnisPruefen(r, "Adressen holen");

    const datensaetze: KanonischerKontakt[] = [];
    const fehler: Datensatzfehler[] = [];
    for (const rec of ergebnis.data.records) {
      const k = kontaktAusOnOffice(rec.id, rec.elements);
      // Die Datenbank verlangt Nachname oder Firma — leere Adressen bleiben draussen.
      if (!k.nachname && !k.firma) {
        fehler.push({ typ: "kontakt", fremd_id: String(rec.id), meldung: "Ohne Nachname und Firma — nicht übernommen." });
        continue;
      }
      datensaetze.push(k);
    }
    const gesamt = ergebnis.data.meta?.cntabsolute ?? 0;
    return { datensaetze, fehler, weitere: (seite + 1) * groesse < gesamt };
  },

  async kontakteSenden(kontext, kontakte): Promise<SendeErgebnis> {
    const angelegt: SendeErgebnis["angelegt"] = [];
    const geaendert: string[] = [];
    const fehler: Datensatzfehler[] = [];

    for (const k of kontakte) {
      const fremdId = (k as { fremd_id?: string }).fremd_id;
      const neu = !fremdId || fremdId === k.lokal_id;
      try {
        const [r] = await aufrufen(
          kontext.zugangsdaten,
          [
            neu
              ? { actionid: AKTION.anlegen, resourcetype: "address", parameters: { data: kontaktNachOnOffice(k) } }
              : { actionid: AKTION.aendern, resourcetype: "address", resourceid: fremdId, parameters: { data: kontaktNachOnOffice(k) } },
          ],
          abhaengigkeiten(kontext),
        );
        const e = ergebnisPruefen(r, "Adresse senden");
        if (neu) {
          const id = e.data.records[0]?.id;
          if (id === undefined) throw new OnOfficeFehler("onOffice hat keine ID fuer die neue Adresse geliefert.", 0);
          angelegt.push({ lokal_id: k.lokal_id, fremd_id: String(id) });
        } else {
          geaendert.push(k.lokal_id);
        }
      } catch (e2) {
        fehler.push({ typ: "kontakt", fremd_id: fremdId ?? null, meldung: e2 instanceof Error ? e2.message : "unbekannter Fehler" });
      }
    }
    return { angelegt, geaendert, fehler };
  },
};

/**
 * Bildadressen zu den geholten Objekten nachladen. Ein Fehler hier laesst
 * die Objekte selbst unberuehrt — Bilder sind ein Zusatz, keine Bedingung.
 */
async function bilderErgaenzen(kontext: K, objekte: KanonischesObjekt[], fehler: Datensatzfehler[]): Promise<void> {
  try {
    const [r] = await aufrufen(
      kontext.zugangsdaten,
      [
        {
          actionid: AKTION.holen,
          resourcetype: "estatepictures",
          parameters: { estateids: objekte.map((o) => Number(o.fremd_id)).filter(Number.isFinite), categories: BILDKATEGORIEN },
        },
      ],
      abhaengigkeiten(kontext),
    );
    const ergebnis = ergebnisPruefen(r, "Bilder holen");
    const jeObjekt = new Map<string, KanonischesBild[]>();

    for (const rec of ergebnis.data.records) {
      const e = rec.elements;
      const estateId = String(e["estateid"] ?? "");
      const url = typeof e["url"] === "string" ? e["url"] : null;
      if (!estateId || !url) continue;
      const liste = jeObjekt.get(estateId) ?? [];
      liste.push({
        fremd_id: String(rec.id),
        url,
        daten: null,
        dateiname: url.split("/").pop() ?? null,
        mime: null,
        titel: typeof e["title"] === "string" ? e["title"] : null,
        gruppe: typeof e["type"] === "string" ? e["type"] : null,
        reihenfolge: typeof e["position"] === "number" ? e["position"] : liste.length,
      });
      jeObjekt.set(estateId, liste);
    }

    for (const o of objekte) {
      o.bilder = (jeObjekt.get(o.fremd_id) ?? []).sort((a, b) => a.reihenfolge - b.reihenfolge);
    }
  } catch (e) {
    fehler.push({ typ: "bild", fremd_id: null, meldung: e instanceof Error ? e.message : "Bilder konnten nicht geladen werden." });
  }
}
