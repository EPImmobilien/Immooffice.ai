/**
 * Verbrauchsausweis-Antrag (Referenz: Eigentuemer fuellt die Gebaeudedaten im
 * Kundenbereich aus, der Makler reicht sie beim Aussteller ein).
 *
 * Die Felder liegen als JSON in verbrauchsausweis_antraege.daten; hier steht
 * die eine Liste, aus der Formular, Pruefung und Zusammenfassung entstehen.
 */

export type FeldArt = "text" | "zahl" | "ja_nein" | "auswahl" | "mehrzeilig";

export interface AntragFeld {
  schluessel: string;
  beschriftung: string;
  art: FeldArt;
  pflicht?: boolean;
  optionen?: readonly string[];
  einheit?: string;
  hinweis?: string;
}

export interface AntragAbschnitt {
  titel: string;
  felder: readonly AntragFeld[];
}

export const ENERGIETRAEGER = ["Erdgas", "Heizöl", "Fernwärme", "Strom", "Wärmepumpe", "Holzpellets", "Flüssiggas", "Sonstiges"] as const;

export const ANTRAG_ABSCHNITTE: readonly AntragAbschnitt[] = [
  {
    titel: "Antragsteller",
    felder: [
      { schluessel: "antragsteller_anrede", beschriftung: "Anrede", art: "auswahl", optionen: ["Frau", "Herr", "Divers", "Firma"] },
      { schluessel: "antragsteller_vorname", beschriftung: "Vorname", art: "text" },
      { schluessel: "antragsteller_nachname", beschriftung: "Nachname / Firma", art: "text", pflicht: true },
      { schluessel: "antragsteller_strasse", beschriftung: "Straße und Hausnummer", art: "text", pflicht: true },
      { schluessel: "antragsteller_plz", beschriftung: "PLZ", art: "text", pflicht: true },
      { schluessel: "antragsteller_ort", beschriftung: "Ort", art: "text", pflicht: true },
      { schluessel: "antragsteller_telefon", beschriftung: "Telefon", art: "text" },
      { schluessel: "antragsteller_email", beschriftung: "E-Mail", art: "text", pflicht: true },
    ],
  },
  {
    titel: "Gebäude",
    felder: [
      { schluessel: "objekt_strasse", beschriftung: "Straße und Hausnummer des Gebäudes", art: "text", pflicht: true },
      { schluessel: "objekt_plz", beschriftung: "PLZ", art: "text", pflicht: true },
      { schluessel: "objekt_ort", beschriftung: "Ort", art: "text", pflicht: true },
      { schluessel: "gebaeudetyp", beschriftung: "Gebäudetyp", art: "auswahl", pflicht: true, optionen: ["Einfamilienhaus", "Zweifamilienhaus", "Mehrfamilienhaus", "Reihenhaus", "Doppelhaushälfte", "Wohn- und Geschäftshaus"] },
      { schluessel: "baujahr_gebaeude", beschriftung: "Baujahr des Gebäudes", art: "zahl", pflicht: true },
      { schluessel: "anzahl_wohneinheiten", beschriftung: "Anzahl Wohneinheiten", art: "zahl", pflicht: true },
      { schluessel: "anzahl_vollgeschosse", beschriftung: "Anzahl Vollgeschosse", art: "zahl" },
      { schluessel: "wohnflaeche", beschriftung: "Wohnfläche gesamt", art: "zahl", einheit: "m²", pflicht: true },
      { schluessel: "gebaeudenutzflaeche", beschriftung: "Gebäudenutzfläche (falls bekannt)", art: "zahl", einheit: "m²" },
      { schluessel: "beheiztes_volumen", beschriftung: "Beheiztes Volumen (falls bekannt)", art: "zahl", einheit: "m³" },
    ],
  },
  {
    titel: "Anlagentechnik",
    felder: [
      { schluessel: "heizung_energietraeger", beschriftung: "Energieträger Heizung", art: "auswahl", pflicht: true, optionen: ENERGIETRAEGER },
      { schluessel: "heizung_energietraeger_sonstiges", beschriftung: "Sonstiger Energieträger", art: "text" },
      { schluessel: "baujahr_heizung", beschriftung: "Baujahr Heizungsanlage", art: "zahl", pflicht: true },
      { schluessel: "warmwasser_energietraeger", beschriftung: "Energieträger Warmwasser", art: "auswahl", optionen: [...ENERGIETRAEGER, "Über Heizung"] },
      { schluessel: "baujahr_warmwasser", beschriftung: "Baujahr Warmwasserbereitung", art: "zahl" },
      { schluessel: "lueftungsanlage", beschriftung: "Lüftungsanlage vorhanden", art: "ja_nein" },
      { schluessel: "lueftungsanlage_art", beschriftung: "Art der Lüftungsanlage", art: "text" },
      { schluessel: "solarthermie", beschriftung: "Solarthermie vorhanden", art: "ja_nein" },
      { schluessel: "solarthermie_art", beschriftung: "Solarthermie für", art: "auswahl", optionen: ["Warmwasser", "Heizung und Warmwasser"] },
      { schluessel: "photovoltaik", beschriftung: "Photovoltaik vorhanden", art: "ja_nein" },
      { schluessel: "photovoltaik_kwp", beschriftung: "Leistung Photovoltaik", art: "zahl", einheit: "kWp" },
    ],
  },
  {
    titel: "Sanierungen",
    felder: [
      { schluessel: "sanierung_fassade", beschriftung: "Fassade gedämmt", art: "ja_nein" },
      { schluessel: "sanierung_fassade_jahr", beschriftung: "Jahr Fassade", art: "zahl" },
      { schluessel: "sanierung_dach", beschriftung: "Dach / oberste Geschossdecke gedämmt", art: "ja_nein" },
      { schluessel: "sanierung_dach_jahr", beschriftung: "Jahr Dach", art: "zahl" },
      { schluessel: "sanierung_fenster", beschriftung: "Fenster erneuert", art: "ja_nein" },
      { schluessel: "sanierung_fenster_jahr", beschriftung: "Jahr Fenster", art: "zahl" },
      { schluessel: "sanierung_kellerdecke", beschriftung: "Kellerdecke gedämmt", art: "ja_nein" },
      { schluessel: "sanierung_kellerdecke_jahr", beschriftung: "Jahr Kellerdecke", art: "zahl" },
      { schluessel: "sanierung_freitext", beschriftung: "Weitere Modernisierungen", art: "mehrzeilig" },
    ],
  },
  {
    titel: "Verbrauch der letzten drei Jahre",
    felder: [
      { schluessel: "verbrauch_jahr_1", beschriftung: "Abrechnungsjahr 1 (z. B. 2023)", art: "zahl", pflicht: true },
      { schluessel: "verbrauch_menge_1", beschriftung: "Verbrauch Jahr 1", art: "zahl", einheit: "kWh / Liter / m³", pflicht: true },
      { schluessel: "verbrauch_jahr_2", beschriftung: "Abrechnungsjahr 2", art: "zahl", pflicht: true },
      { schluessel: "verbrauch_menge_2", beschriftung: "Verbrauch Jahr 2", art: "zahl", einheit: "kWh / Liter / m³", pflicht: true },
      { schluessel: "verbrauch_jahr_3", beschriftung: "Abrechnungsjahr 3", art: "zahl", pflicht: true },
      { schluessel: "verbrauch_menge_3", beschriftung: "Verbrauch Jahr 3", art: "zahl", einheit: "kWh / Liter / m³", pflicht: true },
      { schluessel: "leerstand_hinweis", beschriftung: "Leerstände im Zeitraum (Monate, Wohneinheit)", art: "mehrzeilig" },
      { schluessel: "bemerkungen", beschriftung: "Bemerkungen", art: "mehrzeilig" },
    ],
  },
];

export const ANTRAG_FELDER: readonly AntragFeld[] = ANTRAG_ABSCHNITTE.flatMap((a) => a.felder);

export type AntragDaten = Record<string, string | number | boolean | null>;

/** Formulardaten in die JSON-Struktur wandeln (Zahlen als Zahl, Ja/Nein als Wahrheitswert). */
export function antragAusFormular(werte: Record<string, string | undefined>): AntragDaten {
  const aus: AntragDaten = {};
  for (const f of ANTRAG_FELDER) {
    const w = (werte[f.schluessel] ?? "").trim();
    if (f.art === "ja_nein") aus[f.schluessel] = w === "ja" || w === "on" || w === "1" || w === "true";
    else if (f.art === "zahl") {
      const n = Number(w.replace(",", "."));
      aus[f.schluessel] = w !== "" && Number.isFinite(n) ? n : null;
    } else aus[f.schluessel] = w === "" ? null : w.slice(0, f.art === "mehrzeilig" ? 2000 : 200);
  }
  return aus;
}

/** Fehlende Pflichtangaben — leer heisst einreichbar. */
export function antragPruefen(daten: AntragDaten): string[] {
  const fehlt: string[] = [];
  for (const f of ANTRAG_FELDER) {
    if (!f.pflicht) continue;
    const w = daten[f.schluessel];
    if (w === null || w === undefined || w === "" ) fehlt.push(f.beschriftung);
  }
  if (daten["heizung_energietraeger"] === "Sonstiges" && !daten["heizung_energietraeger_sonstiges"]) fehlt.push("Sonstiger Energieträger");
  return fehlt;
}

/** Ausgefuellte Angaben als Zeilen (fuer Zusammenfassung, Mail und Maklersicht). */
export function antragZeilen(daten: AntragDaten): Array<{ abschnitt: string; beschriftung: string; wert: string }> {
  const aus: Array<{ abschnitt: string; beschriftung: string; wert: string }> = [];
  for (const a of ANTRAG_ABSCHNITTE) {
    for (const f of a.felder) {
      const w = daten[f.schluessel];
      if (w === null || w === undefined || w === "" || w === false) continue;
      const text = typeof w === "boolean" ? "Ja" : typeof w === "number" ? `${w.toLocaleString("de-DE")}${f.einheit ? ` ${f.einheit}` : ""}` : String(w);
      aus.push({ abschnitt: a.titel, beschriftung: f.beschriftung, wert: text });
    }
  }
  return aus;
}
