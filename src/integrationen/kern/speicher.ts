/**
 * Speicherschnittstelle eines Sync-Laufs.
 *
 * Der Lauf (lauf.ts) kennt keine Datenbank — er spricht nur diese
 * Schnittstelle. Dadurch laesst er sich mit einem Speicher im Arbeitsspeicher
 * pruefen (lauf.test.ts); die Supabase-Fassung steht in speicher-supabase.ts.
 */

import type { KanonischerKontakt, KanonischesBild, KanonischesObjekt } from "./modell";

export type MappingTyp = "objekt" | "kontakt" | "termin" | "bild" | "dokument";

export interface Mapping {
  lokal_id: string;
  fremd_id: string;
  letzte_aenderung_lokal: string | null;
  letzte_aenderung_fremd: string | null;
}

/** Spalten der Tabelle `objekte`, die ein Import setzt. */
export type ObjektZeile = Omit<KanonischesObjekt, "fremd_id" | "geaendert_am_fremd" | "bilder">;

/** Spalten der Tabelle `kontakte`, die ein Import setzt. */
export type KontaktZeile = Omit<KanonischerKontakt, "fremd_id" | "geaendert_am_fremd">;

export interface Speicher {
  mappingFinden(typ: MappingTyp, fremdId: string): Promise<Mapping | null>;
  mappingSchreiben(typ: MappingTyp, mapping: Mapping): Promise<void>;

  objektAnlegen(zeile: ObjektZeile): Promise<string>;
  objektAktualisieren(lokalId: string, zeile: ObjektZeile): Promise<void>;
  /** `geaendert_am` des lokalen Datensatzes — Grundlage von „letzte Aenderung gewinnt". */
  objektGeaendertAm(lokalId: string): Promise<string | null>;
  /** Objekte, die seit `seit` lokal geaendert wurden (fuer die Senderichtung). */
  objekteZumSenden(seit: string | null): Promise<Array<{ lokal_id: string; geaendert_am: string; objekt: KanonischesObjekt }>>;

  kontaktAnlegen(zeile: KontaktZeile): Promise<string>;
  kontaktAktualisieren(lokalId: string, zeile: KontaktZeile): Promise<void>;
  kontaktGeaendertAm(lokalId: string): Promise<string | null>;
  kontakteZumSenden(seit: string | null): Promise<Array<{ lokal_id: string; geaendert_am: string; kontakt: KanonischerKontakt }>>;

  /** Legt ein Bild zum Objekt ab (herunterladen oder Daten schreiben). */
  bildSpeichern(objektLokalId: string, bild: KanonischesBild, index: number): Promise<void>;
  /** Anzahl vorhandener Bilder — Bilder werden nur bei neuen Objekten und bei Objekten ohne Bilder uebernommen. */
  bilderAnzahl(objektLokalId: string): Promise<number>;
}
