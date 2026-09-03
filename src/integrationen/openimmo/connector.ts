/**
 * OpenImmo-Connector: Datei-Import (XML oder ZIP mit Bildern) und Export.
 *
 * Keine Anmeldung, kein Vertragspartner — deshalb der erste Connector und
 * das Pflicht-Wechselkriterium des Masterprompts. Der Export nutzt den
 * bestehenden Erzeuger in `src/lib/openimmo`; der Import ist neu (lesen.ts).
 */

import { z } from "zod";

import { openImmoXml } from "@/lib/openimmo/xml";
import type { OpenImmoObjekt } from "@/lib/openimmo/typen";

import type { Connector, Datensatzfehler, HolEingabe, HolErgebnis, Kontext, SendeErgebnis } from "../kern/connector";
import type { KanonischesObjekt } from "../kern/modell";
import { openImmoLesen } from "./lesen";
import { zipEntpacken } from "./zip-lesen";

const schema = z.object({}).strict();
export type OpenImmoZugangsdaten = z.infer<typeof schema>;

const BILD_ENDUNGEN = /\.(jpe?g|png|gif|webp)$/i;

/** Trennt eine Datei (XML oder ZIP) in XML-Text und Bilddateien. */
export function paketOeffnen(datei: { name: string; inhalt: Uint8Array }): {
  xml: string;
  dateien: Map<string, Uint8Array>;
} {
  const dateien = new Map<string, Uint8Array>();

  if (/\.zip$/i.test(datei.name) || istZip(datei.inhalt)) {
    const eintraege = zipEntpacken(datei.inhalt);
    const xmlEintrag = eintraege.find((e) => /\.xml$/i.test(e.name));
    if (!xmlEintrag) throw new Error("Das ZIP-Archiv enthaelt keine XML-Datei.");
    for (const e of eintraege) {
      if (e === xmlEintrag) continue;
      const name = e.name.split(/[\\/]/).pop() ?? e.name;
      if (BILD_ENDUNGEN.test(name) || /\.pdf$/i.test(name)) dateien.set(name, e.inhalt);
    }
    return { xml: Buffer.from(xmlEintrag.inhalt).toString("utf8"), dateien };
  }

  return { xml: Buffer.from(datei.inhalt).toString("utf8"), dateien };
}

function istZip(daten: Uint8Array): boolean {
  return daten.length >= 4 && daten[0] === 0x50 && daten[1] === 0x4b && daten[2] === 0x03 && daten[3] === 0x04;
}

/** Kanonisch → Exportform. Die Felder decken sich; nur die Metadaten fehlen. */
function exportObjekt(o: KanonischesObjekt & { lokal_id: string }, jetzt: Date): OpenImmoObjekt {
  return {
    id: o.lokal_id,
    objektnummer: o.objektnummer ?? o.lokal_id,
    bezeichnung: o.bezeichnung,
    titel: o.titel,
    vermarktungsart: o.vermarktungsart,
    objektkategorie: o.objektkategorie,
    objektart: o.objektart,
    nutzungsart: o.nutzungsart,
    strasse: o.strasse,
    hausnummer: o.hausnummer,
    plz: o.plz,
    ort: o.ort,
    ortsteil: o.ortsteil,
    land: o.land,
    etage: o.etage,
    etagen_gesamt: o.etagen_gesamt,
    wohnungsnummer: null,
    lat: o.lat,
    lon: o.lon,
    adresse_veroeffentlichen: o.adresse_veroeffentlichen,
    wohnflaeche: o.wohnflaeche,
    nutzflaeche: o.nutzflaeche,
    gesamtflaeche: o.gesamtflaeche,
    grundstuecksflaeche: o.grundstuecksflaeche,
    zimmer: o.zimmer,
    schlafzimmer: o.schlafzimmer,
    badezimmer: o.badezimmer,
    anzahl_balkone: o.anzahl_balkone,
    anzahl_terrassen: o.anzahl_terrassen,
    stellplatz_anzahl: o.stellplatz_anzahl,
    baujahr: o.baujahr,
    letzte_modernisierung: o.letzte_modernisierung,
    zustand: o.zustand,
    verfuegbar_ab: o.verfuegbar_ab,
    kaufpreis: o.kaufpreis,
    kaufpreis_auf_anfrage: o.kaufpreis_auf_anfrage,
    kaltmiete: o.kaltmiete,
    warmmiete: o.warmmiete,
    nebenkosten: o.nebenkosten,
    heizkosten: o.heizkosten,
    kaution: o.kaution,
    hausgeld: o.hausgeld,
    miete_ist: null,
    provision_kaeufer: o.provision_kaeufer,
    provision_hinweis: o.provision_hinweis,
    courtage_frei: o.courtage_frei,
    energieausweis_typ: o.energieausweis_typ,
    energie_kennwert: o.energie_kennwert,
    energie_klasse: o.energie_klasse,
    energie_traeger: o.energie_traeger,
    energie_baujahr_anlage: o.energie_baujahr_anlage,
    energie_warmwasser_enthalten: o.energie_warmwasser_enthalten,
    energie_gueltig_bis: o.energie_gueltig_bis,
    beschreibung_objekt: o.beschreibung_objekt,
    beschreibung_ausstattung: o.beschreibung_ausstattung,
    beschreibung_lage: o.beschreibung_lage,
    beschreibung_sonstiges: o.beschreibung_sonstiges,
    texte_freigegeben_am: null,
    geaendert_am: o.geaendert_am_fremd ?? jetzt.toISOString(),
  };
}

export const openImmoConnector: Connector<OpenImmoZugangsdaten> & {
  /** Fuer den Export aus dem Rahmen heraus: liefert das XML statt es zu senden. */
  xmlErzeugen: (
    kontext: Kontext<OpenImmoZugangsdaten>,
    objekte: Array<KanonischesObjekt & { lokal_id: string }>,
  ) => string;
} = {
  id: "openimmo",
  name: "OpenImmo",
  beschreibung:
    "Objekte aus einer OpenImmo-Datei (XML oder ZIP mit Bildern) übernehmen und als OpenImmo exportieren. Ohne Anmeldung.",
  anmeldung: "keine",
  anmeldefelder: [],
  faehigkeiten: ["objekte_holen", "objekte_senden", "bilder"],
  zugangsdatenSchema: schema,

  async verbindungPruefen() {
    return { ok: true, meldung: "OpenImmo braucht keine Verbindung — Dateien werden hochgeladen oder heruntergeladen." };
  },

  async objekteHolen(kontext, eingabe: HolEingabe): Promise<HolErgebnis<KanonischesObjekt>> {
    if (!eingabe.datei) {
      return {
        datensaetze: [],
        fehler: [{ typ: "objekt", fremd_id: null, meldung: "Bitte eine OpenImmo-Datei (XML oder ZIP) auswählen." }],
        weitere: false,
      };
    }

    const { xml, dateien } = paketOeffnen(eingabe.datei);
    const gelesen = openImmoLesen(xml, dateien);
    kontext.protokoll(
      `OpenImmo ${gelesen.uebertragung.version ?? "?"} von ${gelesen.anbieter.firmenname ?? "unbekanntem Anbieter"}: ${gelesen.objekte.length} Objekte, ${dateien.size} Dateien.`,
    );

    const fehler: Datensatzfehler[] = gelesen.fehler.map((f) => ({ typ: "objekt", fremd_id: f.fremd_id, meldung: f.meldung }));

    // DELETE-Aktionen werden nicht importiert — ein Import legt an, er
    // loescht nicht. Der Rahmen erhaelt sie als Hinweis.
    const datensaetze: KanonischesObjekt[] = [];
    for (const o of gelesen.objekte) {
      if (o.aktion === "DELETE") {
        fehler.push({ typ: "objekt", fremd_id: o.fremd_id, meldung: "Zurückgezogen (DELETE) — wird nicht übernommen." });
        continue;
      }
      if (o.fremd_id.startsWith("position-")) {
        fehler.push({
          typ: "objekt",
          fremd_id: o.fremd_id,
          meldung: "Ohne Objektnummer in der Datei — beim nächsten Import nicht wiedererkennbar.",
        });
      }
      const { aktion: _aktion, ...rest } = o;
      datensaetze.push(rest);
    }

    return { datensaetze, fehler, weitere: false };
  },

  xmlErzeugen(kontext, objekte) {
    const konfig = kontext.konfig;
    return openImmoXml({
      objekte: objekte.map((o) => ({ objekt: exportObjekt(o, kontext.jetzt()), ausstattung: [], modus: "NEU" })),
      anbieter: {
        firmenname: typeof konfig["firmenname"] === "string" ? konfig["firmenname"] : "",
        anbieternummer: typeof konfig["anbieternummer"] === "string" ? konfig["anbieternummer"] : null,
        openimmoAnid: typeof konfig["openimmo_anid"] === "string" ? konfig["openimmo_anid"] : null,
        email: typeof konfig["email"] === "string" ? konfig["email"] : null,
        telefon: null,
        ansprechpartner: null,
      },
      zeitstempel: kontext.jetzt().toISOString(),
    });
  },

  /**
   * „Senden" heisst bei OpenImmo: Datei erzeugen. Die Uebertragung an ein
   * Portal (FTP, Upload) ist Phase 5 mit eigenem Vertrag je Portal. Hier wird
   * das XML erzeugt und die Objekte gelten als „angelegt" mit ihrer eigenen
   * Nummer als Fremd-ID.
   */
  async objekteSenden(kontext, objekte): Promise<SendeErgebnis> {
    const xml = openImmoConnector.xmlErzeugen(kontext, objekte);
    kontext.konfigAendern({ letztes_xml_bytes: Buffer.byteLength(xml, "utf8") });
    return {
      angelegt: objekte.map((o) => ({ lokal_id: o.lokal_id, fremd_id: o.objektnummer ?? o.lokal_id })),
      geaendert: [],
      fehler: [],
    };
  },
};
