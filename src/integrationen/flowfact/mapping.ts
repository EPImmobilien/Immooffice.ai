/**
 * Feldabbildung FlowFact <-> kanonisches Modell.
 *
 * FlowFact liefert Entitaeten mit schemagebundenen Feldern; Werte kommen
 * teils direkt, teils als `{ values: [...] }`. Feldnamen sind ANNAHMEN nach
 * der oeffentlichen Beschreibung — je kanonischem Feld stehen Kandidaten
 * (englisch und deutsch), der erste belegte gewinnt. Nichts wird geraten.
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
  type Objektkategorie,
  type Vermarktungsart,
} from "../kern/modell";

type Roh = Record<string, unknown>;

function feld(e: Roh, name: string): unknown {
  if (name in e) return e[name];
  const klein = name.toLowerCase();
  const schluessel = Object.keys(e).find((k) => k.toLowerCase() === klein);
  return schluessel === undefined ? undefined : e[schluessel];
}

/** Einen Feldwert lesen — direkt oder aus `{ values: [...] }`, Schreibweise egal. */
export function wert(e: Roh, ...namen: string[]): unknown {
  for (const name of namen) {
    const roh = feld(e, name);
    if (roh === undefined || roh === null || roh === "") continue;
    if (typeof roh === "object" && !Array.isArray(roh) && Array.isArray((roh as Roh)["values"])) {
      const v = ((roh as Roh)["values"] as unknown[]).find((x) => x !== null && x !== undefined && x !== "");
      if (v !== undefined) return v;
      continue;
    }
    return roh;
  }
  return undefined;
}

function alleWerte(e: Roh, ...namen: string[]): unknown[] {
  for (const name of namen) {
    const roh = feld(e, name);
    if (roh === undefined || roh === null) continue;
    if (Array.isArray(roh)) return roh;
    if (typeof roh === "object" && Array.isArray((roh as Roh)["values"])) return (roh as Roh)["values"] as unknown[];
    return [roh];
  }
  return [];
}

/** Kandidatengruppen je kanonischem Feld — Grundlage der Diagnose beim Pruefen. */
export const OBJEKT_KANDIDATEN: Record<string, string[]> = {
  objektnummer: ["identifier", "objectnumber", "estateid", "objektnummer", "externalId"],
  titel: ["headline", "title", "titel"],
  vermarktungsart: ["marketingtype", "marketingType", "vermarktungsart"],
  objektkategorie: ["estatetype", "estateType", "objektart", "type"],
  strasse: ["street", "strasse", "straße"],
  hausnummer: ["housenumber", "houseNumber", "hausnummer"],
  plz: ["zip", "zipcode", "zipCode", "postalcode", "plz"],
  ort: ["city", "ort", "town"],
  wohnflaeche: ["livingarea", "livingArea", "livingspace", "wohnflaeche"],
  zimmer: ["rooms", "numberofrooms", "numberOfRooms", "zimmer"],
  kaufpreis: ["purchaseprice", "purchasePrice", "price", "kaufpreis"],
  kaltmiete: ["rent", "baserent", "baseRent", "coldrent", "kaltmiete"],
  beschreibung_objekt: ["descriptionnote", "descriptionNote", "description", "objektbeschreibung"],
};

export const KONTAKT_KANDIDATEN: Record<string, string[]> = {
  nachname: ["lastname", "lastName", "nachname", "name"],
  vorname: ["firstname", "firstName", "vorname"],
  email: ["emails", "email", "mail"],
  telefon: ["phones", "phone", "telefon", "telephone"],
};

function geaendert(e: Roh): string | null {
  const meta = e["_metadata"];
  if (meta && typeof meta === "object") {
    const m = textOderNull((meta as Roh)["modifiedAt"] ?? (meta as Roh)["modified"]);
    if (m) return m;
  }
  return textOderNull(wert(e, "modified", "modifiedAt", "updatedAt", "updated_at", "changed"));
}

function vermarktungsart(w: unknown): Vermarktungsart {
  const t = (textOderNull(w) ?? "").toLowerCase();
  if ((t.includes("sale") || t.includes("kauf") || t.includes("buy")) && (t.includes("rent") || t.includes("miet"))) return "kauf_miete";
  if (t.includes("rent") || t.includes("miet") || t.includes("lease") || t.includes("pacht")) return "miete";
  return "kauf";
}

function objektkategorie(w: unknown): Objektkategorie {
  const t = (textOderNull(w) ?? "").toLowerCase();
  if (t.includes("apartment") || t.includes("wohnung") || t.includes("flat")) return "wohnung";
  if (t.includes("house") || t.includes("haus") || t.includes("villa")) return "haus";
  if (t.includes("plot") || t.includes("land") || t.includes("grundst") || t.includes("site")) return "grundstueck";
  if (t.includes("invest") || t.includes("anlage") || t.includes("zins") || t.includes("rendite")) return "anlage";
  if (t.includes("office") || t.includes("büro") || t.includes("buero") || t.includes("commercial") || t.includes("gewerbe") || t.includes("retail") || t.includes("laden") || t.includes("hall") || t.includes("gastro")) return "gewerbe";
  return "sonstige";
}

function energieausweistyp(w: unknown): Energieausweistyp | null {
  const t = (textOderNull(w) ?? "").toLowerCase();
  if (t.startsWith("demand") || t.startsWith("bedarf")) return "bedarf";
  if (t.startsWith("consumption") || t.startsWith("verbrauch")) return "verbrauch";
  if (t.includes("not_required") || t.includes("nicht erforderlich")) return "nicht_erforderlich";
  if (t.includes("not_available") || t.includes("liegt nicht vor")) return "liegt_nicht_vor";
  return null;
}

function land(w: unknown): string {
  const t = (textOderNull(w) ?? "").toUpperCase();
  if (t.length === 2) return t;
  if (t.startsWith("DEUTSCH") || t.startsWith("GERMAN")) return "DE";
  if (t.startsWith("ÖSTER") || t.startsWith("OESTER") || t.startsWith("AUSTRIA")) return "AT";
  if (t.startsWith("SCHWEIZ") || t.startsWith("SWITZ")) return "CH";
  return t ? t.slice(0, 2) : "DE";
}

function bilder(e: Roh): KanonischesBild[] {
  const liste = alleWerte(e, "images", "pictures", "photos", "files", "bilder");
  const ergebnis: KanonischesBild[] = [];
  liste.forEach((roh, index) => {
    if (!roh || typeof roh !== "object") return;
    const b = roh as Roh;
    const url = textOderNull(wert(b, "url", "link", "href", "downloadUrl"));
    if (!url) return;
    const kategorie = (textOderNull(wert(b, "category", "type", "kategorie")) ?? "").toLowerCase();
    ergebnis.push({
      fremd_id: b["id"] !== undefined ? String(b["id"]) : null,
      url,
      daten: null,
      dateiname: textOderNull(wert(b, "filename", "fileName", "name")),
      mime: textOderNull(wert(b, "mimetype", "mimeType", "contentType")),
      titel: textOderNull(wert(b, "title", "titel", "caption")),
      gruppe: kategorie.includes("floor") || kategorie.includes("grundriss") ? "Grundriss" : kategorie.includes("title") || kategorie.includes("titel") ? "Titelbild" : "Foto",
      reihenfolge: ganzzahlOderNull(wert(b, "position", "order", "sortOrder")) ?? index,
    });
  });
  return ergebnis.sort((a, b) => a.reihenfolge - b.reihenfolge);
}

/** FlowFact-Entitaet → kanonisches Objekt. */
export function objektAusFlowfact(e: Roh): KanonischesObjekt {
  const id = e["id"] ?? e["_id"];
  if (id === undefined || id === null) throw new Error("Objekt ohne ID.");
  const o = leeresObjekt(String(id));
  const k = OBJEKT_KANDIDATEN;

  o.geaendert_am_fremd = geaendert(e);
  o.objektnummer = textOderNull(wert(e, ...k["objektnummer"]!));
  o.titel = textOderNull(wert(e, ...k["titel"]!));
  o.strasse = textOderNull(wert(e, ...k["strasse"]!));
  o.hausnummer = textOderNull(wert(e, ...k["hausnummer"]!));
  o.bezeichnung = o.titel ?? [o.strasse, o.hausnummer].filter(Boolean).join(" ") ?? "";
  if (!o.bezeichnung) o.bezeichnung = o.objektnummer ?? String(id);

  o.vermarktungsart = vermarktungsart(wert(e, ...k["vermarktungsart"]!));
  o.objektkategorie = objektkategorie(wert(e, ...k["objektkategorie"]!));
  o.objektart = textOderNull(wert(e, "estatesubtype", "estateSubType", "objekttyp"))?.toLowerCase() ?? null;
  o.nutzungsart = o.objektkategorie === "gewerbe" ? "gewerbe" : o.objektkategorie === "anlage" ? "anlage" : "wohnen";

  o.plz = textOderNull(wert(e, ...k["plz"]!));
  o.ort = textOderNull(wert(e, ...k["ort"]!));
  o.ortsteil = textOderNull(wert(e, "district", "quarter", "ortsteil"));
  o.land = land(wert(e, "country", "land"));
  o.etage = textOderNull(wert(e, "floor", "etage"));
  o.etagen_gesamt = ganzzahlOderNull(wert(e, "numberoffloors", "numberOfFloors", "etagen"));
  o.lat = zahlOderNull(wert(e, "latitude", "lat"));
  o.lon = zahlOderNull(wert(e, "longitude", "lng", "lon"));
  o.adresse_veroeffentlichen = wahrheitOderNull(wert(e, "showaddress", "showAddress", "adresse_veroeffentlichen")) === true;

  o.wohnflaeche = zahlOderNull(wert(e, ...k["wohnflaeche"]!));
  o.nutzflaeche = zahlOderNull(wert(e, "usablearea", "usableArea", "nutzflaeche"));
  o.gesamtflaeche = zahlOderNull(wert(e, "totalarea", "totalArea", "gesamtflaeche"));
  o.grundstuecksflaeche = zahlOderNull(wert(e, "plotarea", "plotArea", "grundstuecksflaeche"));
  o.zimmer = zahlOderNull(wert(e, ...k["zimmer"]!));
  o.schlafzimmer = ganzzahlOderNull(wert(e, "bedrooms", "numberofbedrooms", "schlafzimmer"));
  o.badezimmer = ganzzahlOderNull(wert(e, "bathrooms", "numberofbathrooms", "badezimmer"));
  o.stellplatz_anzahl = ganzzahlOderNull(wert(e, "parkingspaces", "numberofparkingspaces", "stellplaetze"));

  o.baujahr = ganzzahlOderNull(wert(e, "constructionyear", "constructionYear", "baujahr"));
  o.letzte_modernisierung = ganzzahlOderNull(wert(e, "lastrefurbishment", "lastRefurbishment", "modernisierung"));
  o.zustand = textOderNull(wert(e, "condition", "zustand"))?.toLowerCase() ?? null;
  o.verfuegbar_ab = textOderNull(wert(e, "availablefrom", "availableFrom", "verfuegbar_ab"));

  o.kaufpreis = zahlOderNull(wert(e, ...k["kaufpreis"]!));
  o.kaufpreis_auf_anfrage = wahrheitOderNull(wert(e, "priceonrequest", "priceOnRequest", "preis_auf_anfrage")) === true;
  o.kaltmiete = zahlOderNull(wert(e, ...k["kaltmiete"]!));
  o.warmmiete = zahlOderNull(wert(e, "totalrent", "totalRent", "warmmiete"));
  o.nebenkosten = zahlOderNull(wert(e, "additionalcosts", "servicecharge", "serviceCharge", "nebenkosten"));
  o.heizkosten = zahlOderNull(wert(e, "heatingcosts", "heatingCosts", "heizkosten"));
  o.kaution = zahlOderNull(wert(e, "deposit", "kaution"));
  o.hausgeld = zahlOderNull(wert(e, "housingcosts", "maintenancefee", "hausgeld"));
  o.provision_kaeufer = textOderNull(wert(e, "commission", "courtage", "provision"));
  o.provision_hinweis = textOderNull(wert(e, "commissionnote", "courtagenote", "provisionshinweis"));
  o.courtage_frei = wahrheitOderNull(wert(e, "commissionfree", "courtagefree", "provisionsfrei")) === true;

  o.energieausweis_typ = energieausweistyp(wert(e, "energycertificatetype", "energyCertificateType", "energieausweistyp"));
  o.energie_kennwert = zahlOderNull(wert(e, "energyconsumption", "thermalcharacteristic", "energiekennwert"));
  o.energie_klasse = textOderNull(wert(e, "energyefficiencyclass", "energyEfficiencyClass", "energieklasse"))?.toUpperCase() ?? null;
  const traeger = alleWerte(e, "firingtypes", "firingTypes", "energysource", "energietraeger");
  o.energie_traeger = traeger.length > 0 ? traeger.map(String).join(", ") : null;
  o.energie_gueltig_bis = textOderNull(wert(e, "energycertificatevaliduntil", "energyCertificateValidUntil"));

  o.beschreibung_objekt = textOderNull(wert(e, ...k["beschreibung_objekt"]!));
  o.beschreibung_ausstattung = textOderNull(wert(e, "furnishingnote", "furnishingNote", "ausstattung"));
  o.beschreibung_lage = textOderNull(wert(e, "locationnote", "locationNote", "lage"));
  o.beschreibung_sonstiges = textOderNull(wert(e, "othernote", "otherNote", "sonstiges"));

  o.bilder = bilder(e);
  return o;
}

/** Kanonisches Objekt → FlowFact-Felder (nur belegte Werte, englische Namen). */
export function objektNachFlowfact(o: KanonischesObjekt): Roh {
  const felder: Roh = {
    headline: o.titel ?? o.bezeichnung,
    identifier: o.objektnummer,
    marketingType: o.vermarktungsart === "miete" ? "RENT" : "SALE",
    estateType: { wohnung: "APARTMENT", haus: "HOUSE", grundstueck: "PLOT", gewerbe: "COMMERCIAL", anlage: "INVESTMENT", sonstige: "OTHER" }[o.objektkategorie],
    street: o.strasse,
    houseNumber: o.hausnummer,
    zip: o.plz,
    city: o.ort,
    country: o.land,
    showAddress: o.adresse_veroeffentlichen,
    livingArea: o.wohnflaeche,
    plotArea: o.grundstuecksflaeche,
    rooms: o.zimmer,
    constructionYear: o.baujahr,
    purchasePrice: o.kaufpreis,
    rent: o.kaltmiete,
    totalRent: o.warmmiete,
    serviceCharge: o.nebenkosten,
    descriptionNote: o.beschreibung_objekt,
    furnishingNote: o.beschreibung_ausstattung,
    locationNote: o.beschreibung_lage,
    otherNote: o.beschreibung_sonstiges,
  };
  return Object.fromEntries(Object.entries(felder).filter(([, w]) => w !== null && w !== undefined && w !== ""));
}

function anrede(w: unknown): string | null {
  const t = (textOderNull(w) ?? "").toLowerCase();
  if (t === "mr" || t === "herr" || t === "male") return "Herr";
  if (t === "ms" || t === "mrs" || t === "frau" || t === "female") return "Frau";
  return textOderNull(w);
}

/** FlowFact-Kontakt → kanonischer Kontakt. */
export function kontaktAusFlowfact(e: Roh): KanonischerKontakt {
  const id = e["id"] ?? e["_id"];
  if (id === undefined || id === null) throw new Error("Kontakt ohne ID.");
  const k = leererKontakt(String(id));
  k.geaendert_am_fremd = geaendert(e);
  k.anrede = anrede(wert(e, "salutation", "anrede", "gender"));
  k.titel = textOderNull(wert(e, "title", "academictitle", "titel"));
  k.vorname = textOderNull(wert(e, ...KONTAKT_KANDIDATEN["vorname"]!));
  k.nachname = textOderNull(wert(e, ...KONTAKT_KANDIDATEN["nachname"]!));
  k.firma = textOderNull(wert(e, "company", "companyname", "firma"));
  k.email = textOderNull(wert(e, ...KONTAKT_KANDIDATEN["email"]!))?.toLowerCase() ?? null;
  k.telefon = textOderNull(wert(e, ...KONTAKT_KANDIDATEN["telefon"]!));
  k.mobil = textOderNull(wert(e, "mobile", "mobilephone", "mobil", "cell"));
  k.strasse = textOderNull(wert(e, "street", "strasse"));
  k.hausnummer = textOderNull(wert(e, "housenumber", "houseNumber", "hausnummer"));
  k.plz = textOderNull(wert(e, "zip", "zipcode", "postalcode", "plz"));
  k.ort = textOderNull(wert(e, "city", "ort"));
  k.land = land(wert(e, "country", "land"));
  k.notizen = textOderNull(wert(e, "note", "notes", "bemerkung", "description"));
  if (!k.nachname && !k.firma) k.nachname = k.email ?? String(id);
  return k;
}
