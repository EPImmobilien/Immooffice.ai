/**
 * Feldabbildung Propstack <-> kanonisches Modell.
 *
 * Feldnamen nach der oeffentlichen Propstack-Dokumentation. Wo die
 * Dokumentation mehrere Namen kennt (oder unklar ist), stehen Kandidaten in
 * Reihenfolge; der erste vorhandene gewinnt. Nichts wird geraten: Was das
 * Konto nicht liefert, bleibt null.
 */

import {
  ganzzahlOderNull,
  leererKontakt,
  leeresObjekt,
  textOderNull,
  wahrheitOderNull,
  zahlOderNull,
  type Energieausweistyp,
  type KanonischerKontakt,
  type KanonischesBild,
  type KanonischesObjekt,
  type Nutzungsart,
  type Objektkategorie,
  type Vermarktungsart,
} from "../kern/modell";

type Roh = Record<string, unknown>;

/** Felder, die eine Objektantwort tragen sollte — fuer die Diagnose beim Pruefen. */
export const OBJEKT_ERWARTETE_FELDER = [
  "id", "updated_at", "title", "name", "marketing_type", "rs_type", "street", "house_number", "zip_code", "city",
  "living_space", "number_of_rooms", "price", "base_rent", "construction_year", "description_note", "images",
] as const;

export const KONTAKT_ERWARTETE_FELDER = ["id", "updated_at", "first_name", "last_name", "email", "phone"] as const;

function erster(e: Roh, ...namen: string[]): unknown {
  for (const n of namen) {
    const w = e[n];
    if (w !== undefined && w !== null && w !== "") return w;
  }
  return undefined;
}

function vermarktungsart(wert: unknown): Vermarktungsart {
  const t = (textOderNull(wert) ?? "").toUpperCase();
  if (t.includes("RENT") && t.includes("BUY")) return "kauf_miete";
  if (t.includes("RENT") || t.includes("LEASE")) return "miete";
  return "kauf";
}

const GEWERBE = ["OFFICE", "STORE", "GASTRONOMY", "INDUSTRY", "HALL", "TRADE", "COMMERCIAL", "HOTEL", "SPECIAL_PURPOSE", "PRACTICE"];

function objektkategorie(rsType: unknown): Objektkategorie {
  const t = (textOderNull(rsType) ?? "").toUpperCase();
  if (t === "APARTMENT") return "wohnung";
  if (t === "HOUSE") return "haus";
  if (t === "TRADE_SITE" || t === "PLOT" || t === "LAND") return "grundstueck";
  if (t === "INVESTMENT" || t === "APARTMENT_BUILDING") return "anlage";
  if (GEWERBE.some((g) => t.includes(g))) return "gewerbe";
  return "sonstige";
}

function nutzungsart(kategorie: Objektkategorie): Nutzungsart {
  if (kategorie === "gewerbe") return "gewerbe";
  if (kategorie === "anlage") return "anlage";
  return "wohnen";
}

function energieausweistyp(e: Roh): Energieausweistyp | null {
  const verfuegbar = (textOderNull(erster(e, "energy_certificate_availability")) ?? "").toUpperCase();
  if (verfuegbar === "NOT_REQUIRED") return "nicht_erforderlich";
  if (verfuegbar === "NOT_AVAILABLE_YET") return "liegt_nicht_vor";
  const typ = (textOderNull(erster(e, "building_energy_rating_type", "energy_certificate_type")) ?? "").toUpperCase();
  if (typ.startsWith("DEMAND") || typ.startsWith("BEDARF")) return "bedarf";
  if (typ.startsWith("CONSUMPTION") || typ.startsWith("VERBRAUCH")) return "verbrauch";
  return null;
}

function land(wert: unknown): string {
  const t = (textOderNull(wert) ?? "").toUpperCase();
  if (t.length === 2) return t;
  if (t.startsWith("DEUTSCH") || t.startsWith("GERMAN")) return "DE";
  if (t.startsWith("ÖSTER") || t.startsWith("OESTER") || t.startsWith("AUSTRIA")) return "AT";
  if (t.startsWith("SCHWEIZ") || t.startsWith("SWITZ")) return "CH";
  return t ? t.slice(0, 2) : "DE";
}

function bilder(e: Roh): KanonischesBild[] {
  const liste = e["images"];
  if (!Array.isArray(liste)) return [];
  const ergebnis: KanonischesBild[] = [];
  liste.forEach((roh, index) => {
    if (!roh || typeof roh !== "object") return;
    const b = roh as Roh;
    const url = textOderNull(erster(b, "big_url", "original_url", "url"));
    if (!url) return;
    const grundriss = wahrheitOderNull(b["is_floorplan"]) === true;
    const titelbild = wahrheitOderNull(erster(b, "is_title_image", "title_image")) === true;
    ergebnis.push({
      fremd_id: b["id"] !== undefined ? String(b["id"]) : null,
      url,
      daten: null,
      dateiname: null,
      mime: null,
      titel: textOderNull(b["title"]),
      gruppe: grundriss ? "Grundriss" : titelbild ? "Titelbild" : "Foto",
      reihenfolge: ganzzahlOderNull(b["position"]) ?? index,
    });
  });
  return ergebnis.sort((a, b) => a.reihenfolge - b.reihenfolge);
}

/** Propstack-Objekt → kanonisches Objekt. */
export function objektAusPropstack(e: Roh): KanonischesObjekt {
  const id = e["id"];
  if (id === undefined || id === null) throw new Error("Objekt ohne ID.");
  const o = leeresObjekt(String(id));

  o.geaendert_am_fremd = textOderNull(e["updated_at"]);
  o.objektnummer = textOderNull(erster(e, "unit_id", "property_id", "object_id", "external_id"));
  o.titel = textOderNull(e["title"]);
  const strasse = textOderNull(e["street"]);
  const hausnummer = textOderNull(e["house_number"]);
  o.bezeichnung = textOderNull(e["name"]) ?? o.titel ?? [strasse, hausnummer].filter(Boolean).join(" ") ?? o.objektnummer ?? String(id);
  if (!o.bezeichnung) o.bezeichnung = String(id);

  o.vermarktungsart = vermarktungsart(e["marketing_type"]);
  o.objektkategorie = objektkategorie(e["rs_type"]);
  o.objektart = textOderNull(erster(e, "rs_category", "rs_type"))?.toLowerCase().replace(/_/g, " ") ?? null;
  o.nutzungsart = nutzungsart(o.objektkategorie);

  o.strasse = strasse;
  o.hausnummer = hausnummer;
  o.plz = textOderNull(e["zip_code"]);
  o.ort = textOderNull(e["city"]);
  o.ortsteil = textOderNull(erster(e, "district", "region", "quarter"));
  o.land = land(e["country"]);
  o.etage = textOderNull(e["floor"]);
  o.etagen_gesamt = ganzzahlOderNull(e["number_of_floors"]);
  o.lat = zahlOderNull(erster(e, "lat", "latitude"));
  o.lon = zahlOderNull(erster(e, "lng", "longitude"));
  o.adresse_veroeffentlichen = wahrheitOderNull(e["hide_address"]) === false;

  o.wohnflaeche = zahlOderNull(e["living_space"]);
  o.nutzflaeche = zahlOderNull(erster(e, "usable_floor_space", "usable_space"));
  o.gesamtflaeche = zahlOderNull(e["total_floor_space"]);
  o.grundstuecksflaeche = zahlOderNull(e["plot_area"]);
  o.zimmer = zahlOderNull(e["number_of_rooms"]);
  o.schlafzimmer = ganzzahlOderNull(e["number_of_bed_rooms"]);
  o.badezimmer = ganzzahlOderNull(e["number_of_bath_rooms"]);
  o.anzahl_balkone = ganzzahlOderNull(e["number_of_balconies"]);
  o.anzahl_terrassen = ganzzahlOderNull(e["number_of_terraces"]);
  o.stellplatz_anzahl = ganzzahlOderNull(e["number_of_parking_spaces"]);

  o.baujahr = ganzzahlOderNull(e["construction_year"]);
  o.letzte_modernisierung = ganzzahlOderNull(e["last_refurbishment"]);
  o.zustand = textOderNull(e["condition"])?.toLowerCase().replace(/_/g, " ") ?? null;
  o.verfuegbar_ab = textOderNull(e["available_from"]);

  o.kaufpreis = zahlOderNull(e["price"]);
  o.kaufpreis_auf_anfrage = wahrheitOderNull(e["price_on_inquiry"]) === true;
  o.kaltmiete = zahlOderNull(e["base_rent"]);
  o.warmmiete = zahlOderNull(e["total_rent"]);
  o.nebenkosten = zahlOderNull(e["service_charge"]);
  o.heizkosten = zahlOderNull(e["heating_costs"]);
  o.kaution = zahlOderNull(e["deposit"]);
  o.hausgeld = zahlOderNull(erster(e, "maintenance_fee", "hoa_fee"));
  o.provision_kaeufer = textOderNull(e["courtage"]);
  o.provision_hinweis = textOderNull(e["courtage_note"]);
  o.courtage_frei = wahrheitOderNull(erster(e, "courtage_free", "commission_free")) === true;

  o.energieausweis_typ = energieausweistyp(e);
  o.energie_kennwert = zahlOderNull(e["thermal_characteristic"]);
  o.energie_klasse = textOderNull(e["energy_efficiency_class"])?.toUpperCase() ?? null;
  const traeger = e["firing_types"];
  o.energie_traeger = Array.isArray(traeger) ? traeger.map(String).join(", ") || null : textOderNull(erster(e, "firing_types", "energy_source"));
  o.energie_baujahr_anlage = ganzzahlOderNull(erster(e, "energy_certificate_year", "heating_construction_year"));
  o.energie_warmwasser_enthalten = wahrheitOderNull(e["thermal_characteristic_with_hot_water"]);
  o.energie_gueltig_bis = textOderNull(erster(e, "energy_certificate_valid_until", "energy_certificate_end_date"));

  o.beschreibung_objekt = textOderNull(e["description_note"]);
  o.beschreibung_ausstattung = textOderNull(e["furnishing_note"]);
  o.beschreibung_lage = textOderNull(e["location_note"]);
  o.beschreibung_sonstiges = textOderNull(e["other_note"]);

  o.bilder = bilder(e);
  return o;
}

/** Kanonisches Objekt → Propstack-Felder (nur belegte Werte). */
export function objektNachPropstack(o: KanonischesObjekt): Roh {
  const rsType: Record<Objektkategorie, string> = {
    wohnung: "APARTMENT",
    haus: "HOUSE",
    grundstueck: "TRADE_SITE",
    gewerbe: "OFFICE",
    anlage: "INVESTMENT",
    sonstige: "OTHER",
  };
  const felder: Roh = {
    name: o.bezeichnung,
    title: o.titel,
    marketing_type: o.vermarktungsart === "miete" ? "RENT" : "BUY",
    rs_type: rsType[o.objektkategorie],
    street: o.strasse,
    house_number: o.hausnummer,
    zip_code: o.plz,
    city: o.ort,
    country: o.land,
    hide_address: !o.adresse_veroeffentlichen,
    lat: o.lat,
    lng: o.lon,
    living_space: o.wohnflaeche,
    total_floor_space: o.gesamtflaeche,
    plot_area: o.grundstuecksflaeche,
    number_of_rooms: o.zimmer,
    number_of_bed_rooms: o.schlafzimmer,
    number_of_bath_rooms: o.badezimmer,
    number_of_parking_spaces: o.stellplatz_anzahl,
    construction_year: o.baujahr,
    last_refurbishment: o.letzte_modernisierung,
    available_from: o.verfuegbar_ab,
    price: o.kaufpreis,
    price_on_inquiry: o.kaufpreis_auf_anfrage,
    base_rent: o.kaltmiete,
    total_rent: o.warmmiete,
    service_charge: o.nebenkosten,
    heating_costs: o.heizkosten,
    deposit: o.kaution,
    courtage: o.provision_kaeufer,
    courtage_note: o.provision_hinweis,
    thermal_characteristic: o.energie_kennwert,
    energy_efficiency_class: o.energie_klasse,
    building_energy_rating_type: o.energieausweis_typ === "bedarf" ? "DEMAND" : o.energieausweis_typ === "verbrauch" ? "CONSUMPTION" : null,
    description_note: o.beschreibung_objekt,
    furnishing_note: o.beschreibung_ausstattung,
    location_note: o.beschreibung_lage,
    other_note: o.beschreibung_sonstiges,
  };
  return Object.fromEntries(Object.entries(felder).filter(([, w]) => w !== null && w !== undefined && w !== ""));
}

function anrede(wert: unknown): string | null {
  const t = (textOderNull(wert) ?? "").toLowerCase();
  if (t === "mr" || t === "herr") return "Herr";
  if (t === "ms" || t === "mrs" || t === "frau") return "Frau";
  return textOderNull(wert);
}

/** Propstack-Kontakt → kanonischer Kontakt. */
export function kontaktAusPropstack(e: Roh): KanonischerKontakt {
  const id = e["id"];
  if (id === undefined || id === null) throw new Error("Kontakt ohne ID.");
  const k = leererKontakt(String(id));
  k.geaendert_am_fremd = textOderNull(e["updated_at"]);
  k.anrede = anrede(e["salutation"]);
  k.titel = textOderNull(erster(e, "academic_title", "title"));
  k.vorname = textOderNull(e["first_name"]);
  k.nachname = textOderNull(e["last_name"]);
  k.firma = textOderNull(erster(e, "company", "company_name"));
  k.email = textOderNull(e["email"])?.toLowerCase() ?? null;
  k.telefon = textOderNull(erster(e, "phone", "home_phone", "office_phone"));
  k.mobil = textOderNull(erster(e, "home_cell", "office_cell", "mobile"));
  k.strasse = textOderNull(erster(e, "street", "address_street"));
  k.hausnummer = textOderNull(erster(e, "house_number", "address_house_number"));
  k.plz = textOderNull(erster(e, "zip_code", "address_zip_code"));
  k.ort = textOderNull(erster(e, "city", "address_city"));
  k.land = land(erster(e, "country", "address_country"));
  k.notizen = textOderNull(erster(e, "description", "note"));
  if (!k.nachname && !k.firma) k.nachname = k.email ?? String(id);
  return k;
}

export function kontaktNachPropstack(k: KanonischerKontakt): Roh {
  const felder: Roh = {
    salutation: k.anrede === "Herr" ? "mr" : k.anrede === "Frau" ? "ms" : null,
    academic_title: k.titel,
    first_name: k.vorname,
    last_name: k.nachname,
    company: k.firma,
    email: k.email,
    phone: k.telefon,
    home_cell: k.mobil,
    street: k.strasse,
    house_number: k.hausnummer,
    zip_code: k.plz,
    city: k.ort,
    country: k.land,
    description: k.notizen,
  };
  return Object.fromEntries(Object.entries(felder).filter(([, w]) => w !== null && w !== undefined && w !== ""));
}
