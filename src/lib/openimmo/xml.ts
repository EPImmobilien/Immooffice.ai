import type {
  Ausstattungsmerkmal,
  OpenImmoAnbieter,
  OpenImmoObjekt,
  Uebertragungsmodus,
} from "./typen";

/**
 * Erzeugung des OpenImmo-XML (Zielformat 1.2.7).
 *
 * Bewusst ohne XML-Bibliothek: Die Struktur ist fest, der erzeugte Baum klein,
 * und eine eigene Erzeugung macht die Feldabbildung im Code unmittelbar
 * nachvollziehbar. Maskierung laeuft zentral ueber `text()` — nirgends wird
 * ein Wert ungeprueft eingesetzt.
 *
 * Vorbehalt: Elementnamen sind gegen die offizielle XSD zu bestaetigen
 * (OPENIMMO_MAPPING.md, Kopfabschnitt).
 */

/**
 * Entfernt Steuerzeichen, die XML 1.0 nicht zulaesst.
 *
 * Bewusst ohne regulaeren Ausdruck: Ein Zeichenbereich mit Steuerzeichen
 * loest die Lint-Regel `no-control-regex` aus, und eine Ausnahme dafuer waere
 * schwerer zu lesen als diese Pruefung.
 */
function ohneSteuerzeichen(wert: string): string {
  let sauber = "";
  for (const zeichen of wert) {
    const code = zeichen.codePointAt(0) ?? 0;
    const erlaubt =
      code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20;
    if (erlaubt) sauber += zeichen;
  }
  return sauber;
}

/** Maskiert XML-Sonderzeichen und entfernt in XML unzulaessige Steuerzeichen. */
function text(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  return ohneSteuerzeichen(String(wert))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Beträge mit Punkt als Dezimaltrenner, ohne Tausendertrennung. */
function zahl(wert: number | null | undefined, stellen = 2): string {
  if (wert === null || wert === undefined) return "";
  return wert.toFixed(stellen);
}

function element(name: string, inhalt: unknown): string {
  const w = text(inhalt);
  return w === "" ? "" : `<${name}>${w}</${name}>`;
}

function ja(wert: boolean): string {
  return wert ? "true" : "false";
}

/** Objektart-Element je Kategorie (OPENIMMO_MAPPING.md, Abschnitt 3). */
const OBJEKTART_ELEMENT: Record<string, { element: string; attribut: string }> = {
  wohnung: { element: "wohnung", attribut: "wohnungtyp" },
  haus: { element: "haus", attribut: "haustyp" },
  grundstueck: { element: "grundstueck", attribut: "grundst_typ" },
  gewerbe: { element: "buero_praxen", attribut: "buero_typ" },
  anlage: { element: "zinshaus_renditeobjekt", attribut: "zins_typ" },
  sonstige: { element: "sonstige", attribut: "sonstige_typ" },
};

/** Feinart in die OpenImmo-Schreibweise: Großbuchstaben mit Unterstrichen. */
function typAttribut(objektart: string | null): string {
  if (!objektart) return "KEINE_ANGABE";
  return objektart
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function objektkategorie(objekt: OpenImmoObjekt): string {
  const wohnen =
    objekt.nutzungsart === "wohnen" || objekt.nutzungsart === "gemischt";
  const gewerbe =
    objekt.nutzungsart === "gewerbe" || objekt.nutzungsart === "gemischt";
  const anlage = objekt.nutzungsart === "anlage";

  const kauf =
    objekt.vermarktungsart === "kauf" || objekt.vermarktungsart === "kauf_miete";
  const miete =
    objekt.vermarktungsart === "miete" || objekt.vermarktungsart === "kauf_miete";

  const art = OBJEKTART_ELEMENT[objekt.objektkategorie] ?? OBJEKTART_ELEMENT["sonstige"]!;

  return [
    "<objektkategorie>",
    `<nutzungsart WOHNEN="${ja(wohnen)}" GEWERBE="${ja(gewerbe)}" ANLAGE="${ja(anlage)}" WAZ="false"/>`,
    `<vermarktungsart KAUF="${ja(kauf)}" MIETE_PACHT="${ja(miete)}" ERBPACHT="false" LEASING="false"/>`,
    "<objektart>",
    `<${art.element} ${art.attribut}="${text(typAttribut(objekt.objektart))}"/>`,
    "</objektart>",
    "</objektkategorie>",
  ].join("");
}

function geo(objekt: OpenImmoObjekt): string {
  // Ist die Adresse nicht freigegeben, werden Strasse und Hausnummer NICHT
  // uebertragen. Postleitzahl und Ort bleiben — sonst ist das Objekt in der
  // Umkreissuche unauffindbar (OPENIMMO_MAPPING.md, Abschnitt 4).
  const teile = [
    "<geo>",
    element("plz", objekt.plz),
    element("ort", objekt.ort),
    element("regionaler_zusatz", objekt.ortsteil),
  ];

  if (objekt.adresse_veroeffentlichen) {
    teile.push(element("strasse", objekt.strasse));
    teile.push(element("hausnummer", objekt.hausnummer));
  }

  teile.push(`<land iso_land="${text(objekt.land === "DE" ? "DEU" : objekt.land)}"/>`);
  teile.push(element("etage", objekt.etage));
  teile.push(element("anzahl_etagen", objekt.etagen_gesamt));
  teile.push(element("wohnungsnr", objekt.wohnungsnummer));

  if (objekt.lat !== null && objekt.lon !== null) {
    teile.push(
      `<geokoordinaten breitengrad="${zahl(objekt.lat, 6)}" laengengrad="${zahl(objekt.lon, 6)}"/>`,
    );
  }

  teile.push("</geo>");
  return teile.join("");
}

function preise(objekt: OpenImmoObjekt): string {
  const kauf =
    objekt.vermarktungsart === "kauf" || objekt.vermarktungsart === "kauf_miete";
  const miete =
    objekt.vermarktungsart === "miete" || objekt.vermarktungsart === "kauf_miete";

  const teile = ["<preise>"];

  if (kauf && !objekt.kaufpreis_auf_anfrage) {
    teile.push(element("kaufpreis", zahl(objekt.kaufpreis)));
  }
  if (miete) {
    teile.push(element("kaltmiete", zahl(objekt.kaltmiete)));
    teile.push(element("warmmiete", zahl(objekt.warmmiete)));
    teile.push(element("kaution", zahl(objekt.kaution)));
  }

  teile.push(element("nebenkosten", zahl(objekt.nebenkosten)));
  teile.push(element("heizkosten", zahl(objekt.heizkosten)));
  teile.push(element("hausgeld", zahl(objekt.hausgeld)));
  teile.push(element("mietertrag", zahl(objekt.miete_ist)));
  teile.push(`<provisionspflichtig>${ja(!objekt.courtage_frei)}</provisionspflichtig>`);
  teile.push(element("aussen_courtage", objekt.provision_kaeufer));
  teile.push(element("courtage_hinweis", objekt.provision_hinweis));
  teile.push("</preise>");

  return teile.join("");
}

function flaechen(objekt: OpenImmoObjekt): string {
  return [
    "<flaechen>",
    element("wohnflaeche", zahl(objekt.wohnflaeche)),
    element("nutzflaeche", zahl(objekt.nutzflaeche)),
    element("gesamtflaeche", zahl(objekt.gesamtflaeche)),
    element("grundstuecksflaeche", zahl(objekt.grundstuecksflaeche)),
    element("anzahl_zimmer", zahl(objekt.zimmer, 1)),
    element("anzahl_schlafzimmer", objekt.schlafzimmer),
    element("anzahl_badezimmer", objekt.badezimmer),
    element("anzahl_balkone", objekt.anzahl_balkone),
    element("anzahl_terrassen", objekt.anzahl_terrassen),
    element("anzahl_stellplaetze", objekt.stellplatz_anzahl),
    "</flaechen>",
  ].join("");
}

function ausstattung(merkmale: Ausstattungsmerkmal[]): string {
  if (merkmale.length === 0) return "";
  const zeilen = merkmale.map((m) =>
    m.wert ? element(m.merkmal, m.wert) : `<${text(m.merkmal)}/>`,
  );
  return `<ausstattung>${zeilen.join("")}</ausstattung>`;
}

function zustand(objekt: OpenImmoObjekt): string {
  const teile = [
    "<zustand_angaben>",
    element("baujahr", objekt.baujahr),
    element("letztemodernisierung", objekt.letzte_modernisierung),
  ];

  if (objekt.zustand) {
    teile.push(`<zustand zustand_art="${text(typAttribut(objekt.zustand))}"/>`);
  }

  const typ = objekt.energieausweis_typ;
  if (typ === "bedarf" || typ === "verbrauch") {
    const pass = [
      "<energiepass>",
      element("epart", typ === "bedarf" ? "BEDARF" : "VERBRAUCH"),
      // Entscheidend: Der Kennwert gehoert je nach Ausweistyp in ein ANDERES
      // Element. Portale weisen Objekte ab, bei denen Typ und Element nicht
      // zusammenpassen (OPENIMMO_MAPPING.md, Abschnitt 8).
      typ === "bedarf"
        ? element("endenergiebedarf", zahl(objekt.energie_kennwert, 1))
        : element("energieverbrauchkennwert", zahl(objekt.energie_kennwert, 1)),
      element("wertklasse", objekt.energie_klasse),
      element("primaerenergietraeger", objekt.energie_traeger),
      element("baujahr", objekt.energie_baujahr_anlage),
      element("gueltig_bis", objekt.energie_gueltig_bis),
      objekt.energie_warmwasser_enthalten === null
        ? ""
        : element("mitwarmwasser", ja(objekt.energie_warmwasser_enthalten)),
      "</energiepass>",
    ];
    teile.push(pass.join(""));
  }

  teile.push("</zustand_angaben>");
  return teile.join("");
}

function freitexte(objekt: OpenImmoObjekt): string {
  return [
    "<freitexte>",
    element("objekttitel", objekt.titel ?? objekt.bezeichnung),
    element("lage", objekt.beschreibung_lage),
    element("ausstatt_beschr", objekt.beschreibung_ausstattung),
    element("objektbeschreibung", objekt.beschreibung_objekt),
    element("sonstige_angaben", objekt.beschreibung_sonstiges),
    "</freitexte>",
  ].join("");
}

function verwaltung(objekt: OpenImmoObjekt, modus: Uebertragungsmodus): string {
  return [
    "<verwaltung_objekt>",
    `<objektadresse_freigeben>${ja(objekt.adresse_veroeffentlichen)}</objektadresse_freigeben>`,
    element("verfuegbar_ab", objekt.verfuegbar_ab),
    "</verwaltung_objekt>",
    "<verwaltung_techn>",
    element("objektnr_intern", objekt.objektnummer),
    element("objektnr_extern", objekt.id),
    `<aktion aktionart="${modus}"/>`,
    element("stand_vom", objekt.geaendert_am.slice(0, 10)),
    "<weitergabe_generell>true</weitergabe_generell>",
    "</verwaltung_techn>",
  ].join("");
}

export interface XmlAuftrag {
  objekte: {
    objekt: OpenImmoObjekt;
    ausstattung: Ausstattungsmerkmal[];
    modus: Uebertragungsmodus;
  }[];
  anbieter: OpenImmoAnbieter;
  /** Zeitstempel der Übertragung. Wird übergeben, damit die Ausgabe testbar bleibt. */
  zeitstempel: string;
  version?: string;
}

/** Erzeugt das vollständige OpenImmo-Dokument. */
export function openImmoXml(auftrag: XmlAuftrag): string {
  const { anbieter } = auftrag;

  const immobilien = auftrag.objekte
    .map(({ objekt, ausstattung: merkmale, modus }) =>
      [
        "<immobilie>",
        objektkategorie(objekt),
        geo(objekt),
        preise(objekt),
        flaechen(objekt),
        ausstattung(merkmale),
        zustand(objekt),
        freitexte(objekt),
        verwaltung(objekt, modus),
        "</immobilie>",
      ].join(""),
    )
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<openimmo xmlns="http://www.openimmo.de">',
    "<uebertragung",
    ' art="ONLINE"',
    ' umfang="VOLL"',
    ' modus="NEU"',
    ' version="1.2.7"',
    ' sendersoftware="ImmoOffice.ai"',
    ` senderversion="${text(auftrag.version ?? "0.1")}"`,
    ` techn_email="${text(anbieter.email ?? "")}"`,
    ` timestamp="${text(auftrag.zeitstempel)}"`,
    "/>",
    "<anbieter>",
    element("anbieternr", anbieter.anbieternummer),
    element("firma", anbieter.firmenname),
    element("openimmo_anid", anbieter.openimmoAnid),
    immobilien,
    "</anbieter>",
    "</openimmo>",
  ].join("");
}

/**
 * Formatiert das Dokument mit Einrückung — nur für die Anzeige und zur
 * Fehlersuche. Für die Übertragung wird die kompakte Fassung verwendet.
 */
export function xmlEinruecken(xml: string): string {
  const teile = xml.replace(/></g, ">\n<").split("\n");
  let tiefe = 0;
  return teile
    .map((zeile) => {
      if (/^<\//.test(zeile)) tiefe = Math.max(0, tiefe - 1);
      const eingerueckt = "  ".repeat(tiefe) + zeile;
      if (
        /^<[^/?!]/.test(zeile) &&
        !/\/>$/.test(zeile) &&
        !/<\/[^>]+>$/.test(zeile)
      ) {
        tiefe += 1;
      }
      return eingerueckt;
    })
    .join("\n");
}
