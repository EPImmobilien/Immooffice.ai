import { z } from "zod";

/**
 * Eingaben der Schnittstelle (JSON). Bewusst dieselben Werte wie in der
 * Oberflaeche; was das Fremdsystem nicht liefert, bleibt null — nie geraten.
 */

const text = z.string().trim().max(2000).nullable().optional();
const kurz = z.string().trim().max(200).nullable().optional();
const betrag = z.number().nonnegative().nullable().optional();
const anzahl = z.number().int().nonnegative().nullable().optional();

export const VERMARKTUNGSARTEN = ["kauf", "miete", "kauf_miete"] as const;
export const OBJEKTKATEGORIEN = ["wohnung", "haus", "grundstueck", "gewerbe", "anlage", "sonstige"] as const;
export const NUTZUNGSARTEN = ["wohnen", "gewerbe", "anlage", "gemischt"] as const;
export const OBJEKTSTATUS = ["akquise", "vorbereitung", "aktiv", "reserviert", "verkauft", "vermietet", "zurueckgezogen", "archiviert"] as const;
export const ENERGIEAUSWEISTYPEN = ["bedarf", "verbrauch", "nicht_erforderlich", "liegt_nicht_vor"] as const;
export const ENERGIEKLASSEN = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const TERMINARTEN = ["besichtigung", "beratung", "objektaufnahme", "notartermin", "uebergabe", "telefonat", "sonstiges"] as const;

export const objektSchema = z.object({
  objektnummer: z.string().trim().min(1).max(50).optional(),
  bezeichnung: z.string().trim().min(1).max(200),
  titel: kurz,
  vermarktungsart: z.enum(VERMARKTUNGSARTEN).default("kauf"),
  objektkategorie: z.enum(OBJEKTKATEGORIEN).default("wohnung"),
  objektart: kurz,
  nutzungsart: z.enum(NUTZUNGSARTEN).default("wohnen"),
  status: z.enum(OBJEKTSTATUS).default("akquise"),
  strasse: kurz,
  hausnummer: z.string().trim().max(20).nullable().optional(),
  plz: z.string().trim().regex(/^[0-9]{4,5}$/, "Die Postleitzahl muss aus 4 oder 5 Ziffern bestehen.").nullable().optional(),
  ort: kurz,
  ortsteil: kurz,
  land: z.string().trim().length(2).toUpperCase().default("DE"),
  adresse_veroeffentlichen: z.boolean().optional(),
  wohnflaeche: betrag,
  nutzflaeche: betrag,
  grundstuecksflaeche: betrag,
  zimmer: betrag,
  schlafzimmer: anzahl,
  badezimmer: anzahl,
  baujahr: z.number().int().min(1000).max(2200).nullable().optional(),
  zustand: kurz,
  verfuegbar_ab: kurz,
  kaufpreis: betrag,
  kaufpreis_auf_anfrage: z.boolean().optional(),
  kaltmiete: betrag,
  warmmiete: betrag,
  nebenkosten: betrag,
  heizkosten: betrag,
  kaution: betrag,
  hausgeld: betrag,
  provision_kaeufer: kurz,
  provision_hinweis: text,
  courtage_frei: z.boolean().optional(),
  energieausweis_typ: z.enum(ENERGIEAUSWEISTYPEN).nullable().optional(),
  energie_kennwert: betrag,
  energie_klasse: z.enum(ENERGIEKLASSEN).nullable().optional(),
  energie_traeger: kurz,
  beschreibung_objekt: z.string().trim().max(20000).nullable().optional(),
  beschreibung_ausstattung: z.string().trim().max(20000).nullable().optional(),
  beschreibung_lage: z.string().trim().max(20000).nullable().optional(),
  beschreibung_sonstiges: z.string().trim().max(20000).nullable().optional(),
});

export const objektAenderungSchema = objektSchema.partial();

export const kontaktSchema = z
  .object({
    anrede: z.string().trim().max(50).nullable().optional(),
    titel: z.string().trim().max(50).nullable().optional(),
    vorname: kurz,
    nachname: kurz,
    firma: kurz,
    email: z.email("Bitte eine gültige E-Mail-Adresse angeben.").toLowerCase().nullable().optional(),
    telefon: z.string().trim().max(50).nullable().optional(),
    mobil: z.string().trim().max(50).nullable().optional(),
    strasse: kurz,
    hausnummer: z.string().trim().max(20).nullable().optional(),
    plz: z.string().trim().max(10).nullable().optional(),
    ort: kurz,
    land: z.string().trim().length(2).toUpperCase().default("DE"),
    quelle: kurz,
    notizen: text,
    einwilligung_werbung: z.boolean().optional(),
  })
  .refine((k) => Boolean(k.nachname) || Boolean(k.firma), { message: "Bitte einen Nachnamen oder eine Firma angeben.", path: ["nachname"] });

export const kontaktAenderungSchema = z.object({
  anrede: z.string().trim().max(50).nullable().optional(),
  titel: z.string().trim().max(50).nullable().optional(),
  vorname: kurz,
  nachname: kurz,
  firma: kurz,
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben.").toLowerCase().nullable().optional(),
  telefon: z.string().trim().max(50).nullable().optional(),
  mobil: z.string().trim().max(50).nullable().optional(),
  strasse: kurz,
  hausnummer: z.string().trim().max(20).nullable().optional(),
  plz: z.string().trim().max(10).nullable().optional(),
  ort: kurz,
  land: z.string().trim().length(2).toUpperCase().optional(),
  quelle: kurz,
  notizen: text,
  einwilligung_werbung: z.boolean().optional(),
});

export const terminSchema = z
  .object({
    titel: z.string().trim().min(1).max(300),
    art: z.enum(TERMINARTEN).default("besichtigung"),
    beginnt_am: z.iso.datetime({ offset: true, message: "beginnt_am muss ein ISO-8601-Zeitpunkt sein." }),
    endet_am: z.iso.datetime({ offset: true, message: "endet_am muss ein ISO-8601-Zeitpunkt sein." }).optional(),
    ort: kurz,
    notiz: text,
    objekt_id: z.uuid().nullable().optional(),
    kontakt_id: z.uuid().nullable().optional(),
  })
  .refine((t) => !t.endet_am || new Date(t.endet_am) > new Date(t.beginnt_am), { message: "endet_am muss nach beginnt_am liegen.", path: ["endet_am"] });

export const terminAenderungSchema = z.object({
  titel: z.string().trim().min(1).max(300).optional(),
  art: z.enum(TERMINARTEN).optional(),
  beginnt_am: z.iso.datetime({ offset: true }).optional(),
  endet_am: z.iso.datetime({ offset: true }).optional(),
  ort: kurz,
  notiz: text,
  objekt_id: z.uuid().nullable().optional(),
  kontakt_id: z.uuid().nullable().optional(),
  abgesagt: z.boolean().optional(),
});

/** Ausgabefelder — keine internen Verweise (erstellt_von), keine Loeschmarken. */
export const OBJEKT_FELDER =
  "id, objektnummer, bezeichnung, titel, vermarktungsart, objektkategorie, objektart, nutzungsart, status, strasse, hausnummer, plz, ort, ortsteil, land, adresse_veroeffentlichen, wohnflaeche, nutzflaeche, grundstuecksflaeche, zimmer, schlafzimmer, badezimmer, baujahr, zustand, verfuegbar_ab, kaufpreis, kaufpreis_auf_anfrage, kaltmiete, warmmiete, nebenkosten, heizkosten, kaution, hausgeld, provision_kaeufer, provision_hinweis, courtage_frei, energieausweis_typ, energie_kennwert, energie_klasse, energie_traeger, beschreibung_objekt, beschreibung_ausstattung, beschreibung_lage, beschreibung_sonstiges, erstellt_am, geaendert_am";

export const KONTAKT_FELDER =
  "id, anrede, titel, vorname, nachname, firma, email, telefon, mobil, strasse, hausnummer, plz, ort, land, quelle, notizen, einwilligung_werbung, erstellt_am, geaendert_am";

export const TERMIN_FELDER = "id, titel, art, notiz, beginnt_am, endet_am, ort, objekt_id, kontakt_id, abgesagt_am, erstellt_am, geaendert_am";

/** Termin-Ende: Vorgabe eine Stunde nach Beginn. */
export function terminEnde(beginnt_am: string, endet_am: string | undefined): string {
  if (endet_am) return new Date(endet_am).toISOString();
  return new Date(new Date(beginnt_am).getTime() + 60 * 60 * 1000).toISOString();
}

/** Zod-Probleme in eine Liste fuer die Antwort (Feld und Meldung, deutsch). */
export function problemeAuflisten(fehler: z.ZodError): Array<{ feld: string; meldung: string }> {
  return fehler.issues.slice(0, 20).map((p) => ({ feld: p.path.map(String).join(".") || "(Körper)", meldung: p.message }));
}
