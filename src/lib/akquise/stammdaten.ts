/**
 * Akquise (docs/FUNKTIONSABGLEICH.md A1/A2): Begriffe, Zeilentypen und kleine
 * Helfer. Stammdaten (Pipelines, Stufen, Quellen, Kampagnen) liegen je
 * Mandant in der Datenbank; hier stehen nur die festen Auswahllisten.
 */

export const OBJEKTARTEN = ["Einfamilienhaus", "Doppelhaushälfte", "Reihenhaus", "Mehrfamilienhaus", "Eigentumswohnung", "Grundstück", "Gewerbeobjekt", "Sonstiges"] as const;

export const ZUSTAENDE = { neuwertig: "Neuwertig", saniert: "Saniert", gepflegt: "Gepflegt", renovierungsbeduerftig: "Renovierungsbedürftig", sanierungsbeduerftig: "Sanierungsbedürftig", abrissobjekt: "Abrissobjekt" } as const;

export const ZEITRAEUME = ["Sofort", "In 3–6 Monaten", "In 6–12 Monaten", "In 1–2 Jahren", "Später / unklar"] as const;

export const QUELLEN_ART = { online: "Online-Akquise", offline: "Offline-Akquise", netzwerk: "Netzwerk-Partner", tippgeber: "Tippgeber-Leads" } as const;
export type QuellenArt = keyof typeof QUELLEN_ART;

export const AKTIVITAET_TYPEN = { anruf: "Anruf", termin: "Termin", aufgabe: "Aufgabe", mail: "E-Mail", whatsapp: "WhatsApp", ki: "KI-Aktivität", notiz: "Notiz" } as const;
export type AktivitaetTyp = keyof typeof AKTIVITAET_TYPEN;

export const KANAELE = { mail: "E-Mail (Entwurf im Lead)", aufgabe: "Aufgabe für den Zuständigen", whatsapp: "WhatsApp (Text zum Kopieren)" } as const;
export type Kanal = keyof typeof KANAELE;

export const LEAD_STATUS = { offen: "Offen", gewonnen: "Gewonnen", verloren: "Verloren" } as const;
export type LeadStatus = keyof typeof LEAD_STATUS;

export const LAUF_STATUS = { geplant: "Geplant", erledigt: "Erledigt", abgebrochen: "Abgebrochen", fehler: "Fehler" } as const;
export type LaufStatus = keyof typeof LAUF_STATUS;

export const RADAR_STATUS = { neu: "Neu", uebernommen: "Übernommen", verworfen: "Verworfen" } as const;
export type RadarStatus = keyof typeof RADAR_STATUS;

export const PROVISIONSARTEN = { teilung: "Provisionsteilung", aussen: "Außenprovision (Käufer)", innen: "Innenprovision (Verkäufer)", keine: "keine Courtage" } as const;
export type Provisionsart = keyof typeof PROVISIONSARTEN;

export const PLATZHALTER = ["{anrede}", "{name}", "{adresse}", "{titel}", "{objektart}", "{absender}", "{firma}"] as const;

export interface Pipeline { id: string; name: string; beschreibung: string | null; ist_standard: boolean; sortierung: number }
export interface Stufe { id: string; pipeline_id: string; name: string; zusatz: string | null; sortierung: number; wahrscheinlichkeit: number; ist_gewonnen: boolean; ist_verloren: boolean }
export interface Quelle { id: string; name: string; art: QuellenArt; kampagne_id: string | null; pipeline_id: string | null; sortierung: number; aktiv: boolean }
export interface Kampagne { id: string; name: string; art: QuellenArt; kanal: string | null; budget: number | null; ausgaben: number; beginn: string | null; ende: string | null; notiz: string | null; aktiv: boolean }
export interface Vorlage { id: string; name: string; kanal: Kanal; betreff: string | null; text: string; aktiv: boolean }
export interface Automation { id: string; name: string | null; pipeline_id: string; stufe_id: string; quelle_id: string | null; kanal: Kanal; vorlage_id: string | null; verzoegerung_stunden: number; aktiv: boolean }
export interface Lauf { id: string; automation_id: string; lead_id: string; geplant_am: string; status: LaufStatus; fehler: string | null; ausgefuehrt_am: string | null }
export interface Einstellungen { provision_satz: number; startpreis_faktor: number; spanne_prozent: number; nachfassen_tage: number; verlustgruende: string[] }

export interface LeadZeile {
  id: string;
  titel: string;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  objektart: string | null;
  wohnflaeche: number | null;
  grundstueck: number | null;
  baujahr: number | null;
  zustand: string | null;
  verkaufszeitraum: string | null;
  kontakt_id: string | null;
  tippgeber_kontakt_id: string | null;
  objekt_id: string | null;
  wertermittlung_id: string | null;
  aufnahme_id: string | null;
  radar_id: string | null;
  pipeline_id: string;
  stufe_id: string;
  quelle_id: string | null;
  kampagne_id: string | null;
  zustaendig_id: string | null;
  status: LeadStatus;
  verlustgrund: string | null;
  gewonnen_am: string | null;
  verloren_am: string | null;
  wert_indikation: number | null;
  angebotspreis: number | null;
  provision_satz: number | null;
  provision_erwartet: number | null;
  nachfassen: boolean;
  nachfassen_am: string | null;
  notiz: string | null;
  erstellt_am: string;
}

export interface Aktivitaet { id: string; lead_id: string; typ: AktivitaetTyp; titel: string; betreff: string | null; text: string | null; faellig_am: string | null; erledigt_am: string | null; automation_id: string | null; aufgabe_id: string | null; termin_id: string | null; erstellt_am: string }

export interface RadarZeile { id: string; titel: string | null; strasse: string | null; plz: string | null; ort: string | null; objektart: string | null; wohnflaeche: number | null; preis: number | null; quelle: string | null; url: string | null; anbieter_typ: "privat" | "gewerblich" | "unbekannt"; telefon: string | null; notiz: string | null; status: RadarStatus; lead_id: string | null; erstellt_am: string }

export const STANDARD_EINSTELLUNGEN: Einstellungen = { provision_satz: 3.57, startpreis_faktor: 0.85, spanne_prozent: 10, nachfassen_tage: 7, verlustgruende: ["Kein Verkaufsinteresse mehr", "Anderer Makler beauftragt", "Privat verkauft", "Preisvorstellung zu hoch", "Nicht erreichbar", "Sonstiges"] };

/** Anschrift des Leads in einer Zeile; ohne Anschrift der Titel. */
export function leadAdresse(l: Pick<LeadZeile, "titel" | "strasse" | "hausnummer" | "plz" | "ort">): string {
  const strasse = [l.strasse, l.hausnummer].filter(Boolean).join(" ");
  const ort = [l.plz, l.ort].filter(Boolean).join(" ");
  return [strasse, ort].filter(Boolean).join(", ") || l.titel;
}

/** Titel-Vorschlag aus Objektart und Anschrift. */
export function leadTitel(l: { objektart?: string | null; strasse?: string | null; hausnummer?: string | null; ort?: string | null }): string {
  const teile = [l.objektart, [l.strasse, l.hausnummer].filter(Boolean).join(" "), l.ort].filter((t) => t && String(t).trim());
  return teile.join(" · ") || "Neuer Lead";
}

/** Ist ein Nachfasstermin ueberfaellig / heute faellig? */
export function nachfassLage(l: Pick<LeadZeile, "status" | "nachfassen" | "nachfassen_am">, heute: string): "ueberfaellig" | "heute" | "offen" | null {
  if (l.status !== "offen" || !l.nachfassen || !l.nachfassen_am) return null;
  if (l.nachfassen_am < heute) return "ueberfaellig";
  if (l.nachfassen_am === heute) return "heute";
  return "offen";
}

/** Platzhalter einer Vorlage ersetzen (gleiche Regeln wie in der Datenbankfunktion). */
export function vorlageAusfuellen(v: { betreff: string | null; text: string }, p: Partial<Record<"anrede" | "name" | "adresse" | "titel" | "objektart" | "absender" | "firma", string>>): { betreff: string; text: string } {
  const ersetzen = (s: string) => s.replace(/\{(anrede|name|adresse|titel|objektart|absender|firma)\}/g, (_, k: keyof typeof p) => p[k] ?? "");
  return { betreff: ersetzen(v.betreff ?? "").replace(/\s+/g, " ").trim(), text: ersetzen(v.text).replace(/\n{3,}/g, "\n\n").trim() };
}
