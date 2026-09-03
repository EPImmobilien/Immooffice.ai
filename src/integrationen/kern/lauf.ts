/**
 * Ein Sync-Lauf: holen, senden oder beides (docs/AUTONOMIE.md 5.3).
 *
 * Regeln:
 *   - Ein fehlerhafter Datensatz stoppt den Lauf nicht; er landet in der
 *     Fehlerliste, der Lauf geht weiter.
 *   - Beidseitig: „letzte Aenderung gewinnt", und jeder beidseitig
 *     geaenderte Datensatz landet zusaetzlich in der Konfliktliste.
 *   - Nur holen: Ein Datensatz wird aktualisiert, wenn sich das Fremdsystem
 *     seit dem letzten Lauf geaendert hat (oder das nicht feststellbar ist).
 *   - Bilder werden bei neuen Objekten uebernommen und bei Objekten, die
 *     noch keine Bilder haben — nie werden vorhandene Bilder ueberschrieben.
 */

import { abgleichEntscheiden, type Konflikt } from "./abgleich";
import type { Connector, Datensatzfehler, HolEingabe, Kontext } from "./connector";
import type { KanonischerKontakt, KanonischesObjekt } from "./modell";
import type { KontaktZeile, ObjektZeile, Speicher } from "./speicher";

export interface LaufEingabe {
  richtung: "holen" | "senden" | "beide";
  /** Zeitpunkt des letzten erfolgreichen Laufs; null beim ersten Lauf. */
  seit: string | null;
  datei?: { name: string; inhalt: Uint8Array };
  /** Obergrenze fuer Seiten je Lauf — Schutz vor Endlosschleifen bei fehlerhafter Paginierung. */
  maxSeiten?: number;
}

export interface LaufErgebnis {
  angelegt: number;
  geaendert: number;
  uebersprungen: number;
  fehler: Datensatzfehler[];
  konflikte: Konflikt[];
}

const PLZ = /^[0-9]{4,5}$/;
const ENERGIEKLASSEN = new Set(["A+", "A", "B", "C", "D", "E", "F", "G", "H"]);

/**
 * Kanonisches Objekt → Zeile fuer `objekte`. Werte, die die Datenbank
 * abweisen wuerde (PLZ, Energieklasse, Land), werden auf null gesetzt statt
 * den ganzen Datensatz scheitern zu lassen — nichts wird geraten.
 */
export function objektZeile(o: KanonischesObjekt): ObjektZeile {
  const { fremd_id: _f, geaendert_am_fremd: _g, bilder: _b, ...rest } = o;
  return {
    ...rest,
    bezeichnung: rest.bezeichnung.trim().slice(0, 200) || o.fremd_id,
    plz: rest.plz && PLZ.test(rest.plz) ? rest.plz : null,
    energie_klasse: rest.energie_klasse && ENERGIEKLASSEN.has(rest.energie_klasse) ? rest.energie_klasse : null,
    land: /^[A-Z]{2}$/.test(rest.land) ? rest.land : "DE",
    baujahr: rest.baujahr !== null && rest.baujahr >= 1000 && rest.baujahr <= 2200 ? rest.baujahr : null,
    letzte_modernisierung:
      rest.letzte_modernisierung !== null && rest.letzte_modernisierung >= 1000 && rest.letzte_modernisierung <= 2200
        ? rest.letzte_modernisierung
        : null,
    etagen_gesamt: rest.etagen_gesamt !== null && rest.etagen_gesamt >= 0 && rest.etagen_gesamt <= 200 ? rest.etagen_gesamt : null,
  };
}

export function kontaktZeile(k: KanonischerKontakt): KontaktZeile {
  const { fremd_id: _f, geaendert_am_fremd: _g, ...rest } = k;
  return { ...rest, land: /^[A-Z]{2}$/.test(rest.land) ? rest.land : "DE" };
}

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : "unbekannter Fehler";
}

/**
 * Fuehrt den Lauf aus. `connector` und `kontext` sind bereits mit
 * entschluesselten Zugangsdaten versehen; `speicher` kapselt die Datenbank.
 */
export async function syncAusfuehren(
  connector: Connector<unknown>,
  kontext: Kontext<unknown>,
  speicher: Speicher,
  eingabe: LaufEingabe,
): Promise<LaufErgebnis> {
  const ergebnis: LaufErgebnis = { angelegt: 0, geaendert: 0, uebersprungen: 0, fehler: [], konflikte: [] };
  const beide = eingabe.richtung === "beide";

  if (eingabe.richtung === "holen" || beide) {
    if (connector.objekteHolen) await objekteHolen(connector, kontext, speicher, eingabe, ergebnis, beide);
    if (connector.kontakteHolen && !eingabe.datei) await kontakteHolen(connector, kontext, speicher, eingabe, ergebnis, beide);
  }

  if (eingabe.richtung === "senden" || beide) {
    if (connector.objekteSenden) await objekteSenden(connector, kontext, speicher, eingabe, ergebnis);
    if (connector.kontakteSenden) await kontakteSenden(connector, kontext, speicher, eingabe, ergebnis);
  }

  return ergebnis;
}

// --- Holen ---------------------------------------------------------------------

async function objekteHolen(
  connector: Connector<unknown>,
  kontext: Kontext<unknown>,
  speicher: Speicher,
  eingabe: LaufEingabe,
  ergebnis: LaufErgebnis,
  beide: boolean,
): Promise<void> {
  const maxSeiten = eingabe.maxSeiten ?? 200;
  for (let seite = 0; seite < maxSeiten; seite++) {
    const holEingabe: HolEingabe = { seite };
    if (eingabe.seit) holEingabe.seit = new Date(eingabe.seit);
    if (eingabe.datei) holEingabe.datei = eingabe.datei;

    const geholt = await connector.objekteHolen!(kontext, holEingabe);
    ergebnis.fehler.push(...geholt.fehler);

    for (const o of geholt.datensaetze) {
      try {
        await objektUebernehmen(o, speicher, ergebnis, beide);
      } catch (e) {
        ergebnis.fehler.push({ typ: "objekt", fremd_id: o.fremd_id, meldung: meldung(e) });
      }
    }

    if (!geholt.weitere || eingabe.datei) break;
  }
}

async function objektUebernehmen(
  o: KanonischesObjekt,
  speicher: Speicher,
  ergebnis: LaufErgebnis,
  beide: boolean,
): Promise<void> {
  const zeile = objektZeile(o);
  const mapping = await speicher.mappingFinden("objekt", o.fremd_id);

  if (!mapping) {
    const lokalId = await speicher.objektAnlegen(zeile);
    const lokalGeaendert = await speicher.objektGeaendertAm(lokalId);
    await speicher.mappingSchreiben("objekt", {
      lokal_id: lokalId,
      fremd_id: o.fremd_id,
      letzte_aenderung_lokal: lokalGeaendert,
      letzte_aenderung_fremd: o.geaendert_am_fremd,
    });
    ergebnis.angelegt++;
    await bilderUebernehmen(lokalId, o, speicher, ergebnis);
    return;
  }

  const lokalGeaendert = await speicher.objektGeaendertAm(mapping.lokal_id);
  const entscheid = abgleichEntscheiden({
    lokal_geaendert: beide ? lokalGeaendert : null,
    fremd_geaendert: o.geaendert_am_fremd ?? "unbekannt",
    zuletzt_lokal: mapping.letzte_aenderung_lokal,
    zuletzt_fremd: mapping.letzte_aenderung_fremd,
  });

  if (entscheid.konflikt) {
    ergebnis.konflikte.push({
      typ: "objekt",
      lokal_id: mapping.lokal_id,
      fremd_id: o.fremd_id,
      lokal_geaendert: lokalGeaendert,
      fremd_geaendert: o.geaendert_am_fremd,
      grund:
        entscheid.entscheid === "konflikt"
          ? "Beide Seiten geaendert, Zeitpunkte nicht vergleichbar — nicht uebernommen."
          : entscheid.entscheid === "fremd_gewinnt"
            ? "Beide Seiten geaendert; Fremdsystem war juenger und wurde uebernommen."
            : "Beide Seiten geaendert; lokale Fassung war juenger und bleibt.",
    });
  }

  if (entscheid.entscheid === "fremd_gewinnt") {
    await speicher.objektAktualisieren(mapping.lokal_id, zeile);
    await speicher.mappingSchreiben("objekt", {
      lokal_id: mapping.lokal_id,
      fremd_id: o.fremd_id,
      letzte_aenderung_lokal: await speicher.objektGeaendertAm(mapping.lokal_id),
      letzte_aenderung_fremd: o.geaendert_am_fremd,
    });
    ergebnis.geaendert++;
    if ((await speicher.bilderAnzahl(mapping.lokal_id)) === 0) {
      await bilderUebernehmen(mapping.lokal_id, o, speicher, ergebnis);
    }
  } else {
    ergebnis.uebersprungen++;
  }
}

async function bilderUebernehmen(
  lokalId: string,
  o: KanonischesObjekt,
  speicher: Speicher,
  ergebnis: LaufErgebnis,
): Promise<void> {
  for (const [index, bild] of o.bilder.entries()) {
    try {
      await speicher.bildSpeichern(lokalId, bild, index);
    } catch (e) {
      ergebnis.fehler.push({ typ: "bild", fremd_id: bild.fremd_id ?? `${o.fremd_id}#${index}`, meldung: meldung(e) });
    }
  }
}

async function kontakteHolen(
  connector: Connector<unknown>,
  kontext: Kontext<unknown>,
  speicher: Speicher,
  eingabe: LaufEingabe,
  ergebnis: LaufErgebnis,
  beide: boolean,
): Promise<void> {
  const maxSeiten = eingabe.maxSeiten ?? 200;
  for (let seite = 0; seite < maxSeiten; seite++) {
    const holEingabe: HolEingabe = { seite };
    if (eingabe.seit) holEingabe.seit = new Date(eingabe.seit);

    const geholt = await connector.kontakteHolen!(kontext, holEingabe);
    ergebnis.fehler.push(...geholt.fehler);

    for (const k of geholt.datensaetze) {
      try {
        const zeile = kontaktZeile(k);
        const mapping = await speicher.mappingFinden("kontakt", k.fremd_id);
        if (!mapping) {
          const lokalId = await speicher.kontaktAnlegen(zeile);
          await speicher.mappingSchreiben("kontakt", {
            lokal_id: lokalId,
            fremd_id: k.fremd_id,
            letzte_aenderung_lokal: await speicher.kontaktGeaendertAm(lokalId),
            letzte_aenderung_fremd: k.geaendert_am_fremd,
          });
          ergebnis.angelegt++;
          continue;
        }
        const lokalGeaendert = await speicher.kontaktGeaendertAm(mapping.lokal_id);
        const entscheid = abgleichEntscheiden({
          lokal_geaendert: beide ? lokalGeaendert : null,
          fremd_geaendert: k.geaendert_am_fremd ?? "unbekannt",
          zuletzt_lokal: mapping.letzte_aenderung_lokal,
          zuletzt_fremd: mapping.letzte_aenderung_fremd,
        });
        if (entscheid.konflikt) {
          ergebnis.konflikte.push({
            typ: "kontakt",
            lokal_id: mapping.lokal_id,
            fremd_id: k.fremd_id,
            lokal_geaendert: lokalGeaendert,
            fremd_geaendert: k.geaendert_am_fremd,
            grund: entscheid.entscheid === "fremd_gewinnt" ? "Fremdsystem war juenger." : "Lokale Fassung bleibt.",
          });
        }
        if (entscheid.entscheid === "fremd_gewinnt") {
          await speicher.kontaktAktualisieren(mapping.lokal_id, zeile);
          await speicher.mappingSchreiben("kontakt", {
            lokal_id: mapping.lokal_id,
            fremd_id: k.fremd_id,
            letzte_aenderung_lokal: await speicher.kontaktGeaendertAm(mapping.lokal_id),
            letzte_aenderung_fremd: k.geaendert_am_fremd,
          });
          ergebnis.geaendert++;
        } else {
          ergebnis.uebersprungen++;
        }
      } catch (e) {
        ergebnis.fehler.push({ typ: "kontakt", fremd_id: k.fremd_id, meldung: meldung(e) });
      }
    }

    if (!geholt.weitere) break;
  }
}

// --- Senden --------------------------------------------------------------------

async function objekteSenden(
  connector: Connector<unknown>,
  kontext: Kontext<unknown>,
  speicher: Speicher,
  eingabe: LaufEingabe,
  ergebnis: LaufErgebnis,
): Promise<void> {
  const lokal = await speicher.objekteZumSenden(eingabe.seit);
  if (lokal.length === 0) return;

  const zuSenden: Array<KanonischesObjekt & { lokal_id: string; geaendert_am: string }> = [];
  for (const eintrag of lokal) {
    const mapping = await speicher.mappingFinden("objekt", eintrag.lokal_id);
    // Bereits durch das Holen in diesem Lauf abgedeckt: Konflikte, in denen das
    // Fremdsystem gewonnen hat, werden nicht zurueckgesendet.
    if (ergebnis.konflikte.some((k) => k.typ === "objekt" && k.lokal_id === eintrag.lokal_id)) {
      ergebnis.uebersprungen++;
      continue;
    }
    zuSenden.push({
      ...eintrag.objekt,
      // Ohne Zuordnung ist es fuer das Fremdsystem neu: fremd_id = lokal_id
      // ist das Signal dafuer (Connector-Vertrag).
      fremd_id: mapping?.fremd_id ?? eintrag.lokal_id,
      lokal_id: eintrag.lokal_id,
      geaendert_am: eintrag.geaendert_am,
    });
  }
  if (zuSenden.length === 0) return;

  const gesendet = await connector.objekteSenden!(kontext, zuSenden);
  ergebnis.fehler.push(...gesendet.fehler);

  for (const a of gesendet.angelegt) {
    const quelle = zuSenden.find((z) => z.lokal_id === a.lokal_id);
    await speicher.mappingSchreiben("objekt", {
      lokal_id: a.lokal_id,
      fremd_id: a.fremd_id,
      letzte_aenderung_lokal: quelle?.geaendert_am ?? null,
      letzte_aenderung_fremd: null,
    });
    ergebnis.angelegt++;
  }
  for (const lokalId of gesendet.geaendert) {
    const quelle = zuSenden.find((z) => z.lokal_id === lokalId);
    if (quelle) {
      await speicher.mappingSchreiben("objekt", {
        lokal_id: lokalId,
        fremd_id: quelle.fremd_id,
        letzte_aenderung_lokal: quelle.geaendert_am,
        letzte_aenderung_fremd: null,
      });
    }
    ergebnis.geaendert++;
  }
}

async function kontakteSenden(
  connector: Connector<unknown>,
  kontext: Kontext<unknown>,
  speicher: Speicher,
  eingabe: LaufEingabe,
  ergebnis: LaufErgebnis,
): Promise<void> {
  const lokal = await speicher.kontakteZumSenden(eingabe.seit);
  if (lokal.length === 0) return;

  const zuSenden: Array<KanonischerKontakt & { lokal_id: string; geaendert_am: string }> = [];
  for (const eintrag of lokal) {
    const mapping = await speicher.mappingFinden("kontakt", eintrag.lokal_id);
    if (ergebnis.konflikte.some((k) => k.typ === "kontakt" && k.lokal_id === eintrag.lokal_id)) {
      ergebnis.uebersprungen++;
      continue;
    }
    zuSenden.push({
      ...eintrag.kontakt,
      fremd_id: mapping?.fremd_id ?? eintrag.lokal_id,
      lokal_id: eintrag.lokal_id,
      geaendert_am: eintrag.geaendert_am,
    });
  }
  if (zuSenden.length === 0) return;

  const gesendet = await connector.kontakteSenden!(kontext, zuSenden);
  ergebnis.fehler.push(...gesendet.fehler);
  for (const a of gesendet.angelegt) {
    const quelle = zuSenden.find((z) => z.lokal_id === a.lokal_id);
    await speicher.mappingSchreiben("kontakt", {
      lokal_id: a.lokal_id,
      fremd_id: a.fremd_id,
      letzte_aenderung_lokal: quelle?.geaendert_am ?? null,
      letzte_aenderung_fremd: null,
    });
    ergebnis.angelegt++;
  }
  for (const lokalId of gesendet.geaendert) {
    const quelle = zuSenden.find((z) => z.lokal_id === lokalId);
    if (quelle) {
      await speicher.mappingSchreiben("kontakt", {
        lokal_id: lokalId,
        fremd_id: quelle.fremd_id,
        letzte_aenderung_lokal: quelle.geaendert_am,
        letzte_aenderung_fremd: null,
      });
    }
    ergebnis.geaendert++;
  }
}
