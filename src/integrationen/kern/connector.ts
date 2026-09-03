/**
 * Schnittstelle eines Connectors (docs/AUTONOMIE.md 5.1).
 *
 * Ein Connector ist eine Datei je Anbieter. Er kennt sein Fremdformat, seine
 * Anmeldung und seine Faehigkeiten — und sonst nichts: keine Datenbank, keine
 * Sitzung, keinen Storage. Alles, was er braucht, kommt im `Kontext`; alles,
 * was er liefert, ist kanonisch (modell.ts). Dadurch laesst sich jeder
 * Connector ohne Netz und ohne Datenbank testen.
 */

import type { z } from "zod";

import type { KanonischerKontakt, KanonischerTermin, KanonischesObjekt } from "./modell";

export type AnbieterId = "openimmo" | "onoffice" | "propstack" | "flowfact";

/**
 * Was ein Connector kann. Die Oberflaeche zeigt nur, was hier steht — eine
 * Schaltflaeche „Kontakte senden" erscheint nicht, wenn der Connector das
 * nicht anbietet.
 */
export type Faehigkeit =
  | "objekte_holen"
  | "objekte_senden"
  | "kontakte_holen"
  | "kontakte_senden"
  | "termine"
  | "bilder"
  | "dokumente"
  | "rueckruf";

export type Anmeldeart =
  | "keine"
  | "api_schluessel"
  | "token_und_geheimnis"
  | "oauth2_client_credentials";

/** Ein Eingabefeld des Anmeldeformulars. `geheim` wird nie zurueckgezeigt. */
export interface Anmeldefeld {
  schluessel: string;
  beschriftung: string;
  geheim: boolean;
  hinweis?: string;
}

export interface Datensatzfehler {
  typ: "objekt" | "kontakt" | "termin" | "bild" | "dokument";
  fremd_id: string | null;
  meldung: string;
}

export interface Pruefergebnis {
  ok: boolean;
  /** Nutzersprache, ohne Zugangsdaten und ohne Rohantworten */
  meldung: string;
  /** Optionale Kennzahlen, etwa „412 Objekte, 1.380 Adressen" */
  details?: Record<string, string | number>;
}

export interface HolErgebnis<T> {
  datensaetze: T[];
  fehler: Datensatzfehler[];
  /** Ob das Fremdsystem weitere Seiten hat */
  weitere: boolean;
}

export interface SendeErgebnis {
  /** lokale ID → fremde ID fuer neu angelegte Datensaetze */
  angelegt: Array<{ lokal_id: string; fremd_id: string }>;
  geaendert: string[];
  fehler: Datensatzfehler[];
}

/** Eingabe fuer das Holen: Zeitfilter oder Datei (OpenImmo). */
export interface HolEingabe {
  seit?: Date;
  seite?: number;
  seitengroesse?: number;
  datei?: { name: string; inhalt: Uint8Array };
}

/**
 * Alles, was ein Connector zum Arbeiten braucht.
 *
 * `fetch` und `jetzt` sind austauschbar, damit Tests ohne Netz und ohne
 * Uhrzeit laufen. `konfig` ist der jsonb-Inhalt aus `integrationen.konfig`;
 * ein Connector darf ihn ueber `konfigAendern` fortschreiben (etwa gepruefte
 * Feldnamen), der Rahmen speichert das nach dem Lauf.
 */
export interface Kontext<Z = unknown> {
  mandantId: string;
  integrationId: string;
  zugangsdaten: Z;
  konfig: Record<string, unknown>;
  konfigAendern: (aenderung: Record<string, unknown>) => void;
  fetch: typeof globalThis.fetch;
  jetzt: () => Date;
  /** Protokoll fuer den Sync-Lauf; nie Zugangsdaten hineinschreiben. */
  protokoll: (zeile: string) => void;
}

export interface Connector<Z = unknown> {
  id: AnbieterId;
  name: string;
  beschreibung: string;
  anmeldung: Anmeldeart;
  anmeldefelder: readonly Anmeldefeld[];
  faehigkeiten: readonly Faehigkeit[];
  /** Prueft und typisiert die Formulareingabe; wirft bei Fehlern. */
  zugangsdatenSchema: z.ZodType<Z>;

  verbindungPruefen(kontext: Kontext<Z>): Promise<Pruefergebnis>;

  objekteHolen?(kontext: Kontext<Z>, eingabe: HolEingabe): Promise<HolErgebnis<KanonischesObjekt>>;
  objekteSenden?(kontext: Kontext<Z>, objekte: Array<KanonischesObjekt & { lokal_id: string }>): Promise<SendeErgebnis>;
  kontakteHolen?(kontext: Kontext<Z>, eingabe: HolEingabe): Promise<HolErgebnis<KanonischerKontakt>>;
  kontakteSenden?(kontext: Kontext<Z>, kontakte: Array<KanonischerKontakt & { lokal_id: string }>): Promise<SendeErgebnis>;
  termineHolen?(kontext: Kontext<Z>, eingabe: HolEingabe): Promise<HolErgebnis<KanonischerTermin>>;
}

/** Wahr, wenn der Connector die Faehigkeit erklaert UND die Methode liefert. */
export function kann(connector: Connector<never>, faehigkeit: Faehigkeit): boolean {
  if (!connector.faehigkeiten.includes(faehigkeit)) return false;
  switch (faehigkeit) {
    case "objekte_holen":
      return typeof connector.objekteHolen === "function";
    case "objekte_senden":
      return typeof connector.objekteSenden === "function";
    case "kontakte_holen":
      return typeof connector.kontakteHolen === "function";
    case "kontakte_senden":
      return typeof connector.kontakteSenden === "function";
    case "termine":
      return typeof connector.termineHolen === "function";
    default:
      return true;
  }
}

/** Erzeugt einen Kontext fuer Tests und Laeufe; alles Fehlende bekommt Vorgaben. */
export function kontextErzeugen<Z>(
  teil: Pick<Kontext<Z>, "mandantId" | "integrationId" | "zugangsdaten"> & Partial<Kontext<Z>>,
): Kontext<Z> {
  const konfig = { ...(teil.konfig ?? {}) };
  return {
    mandantId: teil.mandantId,
    integrationId: teil.integrationId,
    zugangsdaten: teil.zugangsdaten,
    konfig,
    konfigAendern: teil.konfigAendern ?? ((aenderung) => Object.assign(konfig, aenderung)),
    fetch: teil.fetch ?? globalThis.fetch,
    jetzt: teil.jetzt ?? (() => new Date()),
    protokoll: teil.protokoll ?? (() => {}),
  };
}
