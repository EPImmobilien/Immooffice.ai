// ============================================================================
// Feldkatalog
// ----------------------------------------------------------------------------
// Welche Platzhalter eine Vorlage benutzen darf, woher ihr Wert kommt, wie er
// heisst und wie er formatiert wird. Erzeugt wird daraus die Feldliste im
// Editor; gelesen wird er beim Rendern.
//
// Die Spalten stammen aus dem tatsaechlichen Schema von `immobilien`,
// `profiles` und `firma_stammdaten`. Die deutschen Anzeigenamen nicht: die
// stehen hier von Hand, weil `beschreibung_ausstattung_expose` nun einmal
// "Ausstattung (Exposé-Fassung)" heisst und keine Regel das aus dem
// Spaltennamen ableitet.
//
// Damit beides nicht auseinanderlaeuft, prueft tests/expose-felder.sql gegen
// die migrierte Datenbank: jede Spalte der drei Tabellen ist entweder im
// Katalog oder in AUSGENOMMEN mit Grund. Eine neue Spalte faellt dort auf.
//
// Fehlender Wert heisst: Zeile oder Element entfaellt. Kein "null", kein
// leeres Label, kein "0 m²" fuer eine Flaeche, die niemand erfasst hat.
// ============================================================================

export type FeldTyp =
  | "text"        // Zeichenkette, unveraendert
  | "mehrzeilig"  // Zeichenkette mit Absaetzen
  | "zahl"        // Zahl, deutsche Schreibweise
  | "flaeche"     // Zahl + " m²"
  | "euro"        // Zahl + " €", Tausenderpunkte
  | "prozent"     // Zahl + " %"
  | "jahr"        // vierstellig, ohne Tausenderpunkt
  | "datum"       // TT.MM.JJJJ
  | "ja_nein"     // "ja" / "nein", leer wenn nicht gesetzt
  | "liste"       // Feld mit mehreren Einträgen (jsonb)
  | "aufzaehlung" // Text mit Zeilenumbruechen als Punkte
  | "bild";       // Pfad auf eine Datei im Speicher

export type Feld = {
  /** Der Platzhalter ohne Klammern, z. B. "objekt.wohnflaeche". */
  schluessel: string;
  /** Was im Editor steht. */
  name: string;
  typ: FeldTyp;
  /** Woher der Wert kommt: Tabelle und Spalte, oder "gerechnet". */
  quelle: { tabelle: string; spalte: string } | { gerechnet: true };
  /** Nachkommastellen fuer zahl/flaeche/euro/prozent. */
  stellen?: number;
  /** Erlaeuterung im Editor, wenn der Name allein nicht reicht. */
  hinweis?: string;
};

const O = (spalte: string) => ({ tabelle: "immobilien", spalte });
const P = (spalte: string) => ({ tabelle: "profiles", spalte });
const F = (spalte: string) => ({ tabelle: "firma_stammdaten", spalte });
const GERECHNET = { gerechnet: true as const };

// ---------------------------------------------------------------- Objekt
export const OBJEKT: Feld[] = [
  { schluessel: "objekt.immo_nr", name: "Objekt-Nr.", typ: "text", quelle: O("immo_nr") },
  { schluessel: "objekt.bezeichnung", name: "Interne Bezeichnung", typ: "text", quelle: O("bezeichnung"),
    hinweis: "Nur für die eigene Verwaltung — im Exposé steht der Objekttitel." },
  { schluessel: "objekt.objekttitel", name: "Objekttitel", typ: "text", quelle: O("objekttitel") },
  { schluessel: "objekt.expose_titel_zeilen", name: "Titel, zeilenweise", typ: "liste", quelle: O("expose_titel_zeilen"),
    hinweis: "Für Vorlagen, die den Titel in festen Zeilen setzen (Studio)." },
  { schluessel: "objekt.expose_titel_text", name: "Titel als Textblock", typ: "mehrzeilig",
    quelle: GERECHNET, hinweis: "Die Titelzeilen mit Umbruch dazwischen." },
  { schluessel: "objekt.untertitel", name: "Untertitel", typ: "text", quelle: GERECHNET,
    hinweis: "Kurzzeile unter dem Titel, aus Zimmern, Fläche und Besonderheit." },
  { schluessel: "objekt.expose_slogan", name: "Slogan", typ: "text", quelle: O("expose_slogan") },
  { schluessel: "objekt.expose_zitat", name: "Zitat", typ: "text", quelle: O("expose_zitat") },
  { schluessel: "objekt.expose_prolog", name: "Prolog", typ: "mehrzeilig",
    quelle: GERECHNET, hinweis: "Einleitender Text der Luxusvorlage." },
  { schluessel: "objekt.expose_prolog_initiale", name: "Prolog, erster Buchstabe",
    typ: "text", quelle: GERECHNET,
    hinweis: "Fuer die Initiale, die in den Absatz hineinragt." },
  { schluessel: "objekt.expose_prolog_rest", name: "Prolog ohne ersten Buchstaben",
    typ: "mehrzeilig", quelle: GERECHNET },
  { schluessel: "objekt.titel_erste_zeile", name: "Titel, erste Zeile", typ: "text",
    quelle: GERECHNET },
  { schluessel: "objekt.titel_zweite_zeile", name: "Titel, zweite Zeile", typ: "text",
    quelle: GERECHNET },
  { schluessel: "objekt.seeufer_meter", name: "Eigenes Ufer in Metern", typ: "zahl",
    quelle: GERECHNET, stellen: 0,
    hinweis: "Besonderheit am Wasser. Fehlt sie, entfaellt die Kennzahl." },
  { schluessel: "objekt.objektart", name: "Objektart", typ: "text", quelle: O("objektart") },
  { schluessel: "objekt.objekttyp", name: "Objekttyp", typ: "text", quelle: O("objekttyp") },
  { schluessel: "objekt.nutzungsart", name: "Nutzungsart", typ: "text", quelle: O("nutzungsart") },
  { schluessel: "objekt.vertragsart", name: "Vermarktungsart", typ: "text", quelle: O("vertragsart"),
    hinweis: "Als Text fuer das Exposé: \"Verkauf\", \"Vermietung\", "
           + "\"Verkauf & Vermietung\"." },
  { schluessel: "objekt.vermarktung", name: "Vermarktungsart (Schluessel)", typ: "text",
    quelle: GERECHNET,
    hinweis: "kauf, miete oder beides. DAS ist der Wert fuer Bedingungen — "
           + "objekt.vertragsart ist der Text und wechselt mit der Sprache." },
  { schluessel: "objekt.status", name: "Status", typ: "text", quelle: O("status") },

  // Anschrift
  { schluessel: "objekt.strasse", name: "Straße", typ: "text", quelle: O("strasse") },
  { schluessel: "objekt.hausnummer", name: "Hausnummer", typ: "text", quelle: O("hausnummer") },
  { schluessel: "objekt.adresse", name: "Straße und Hausnummer", typ: "text", quelle: GERECHNET },
  { schluessel: "objekt.plz", name: "PLZ", typ: "text", quelle: O("plz") },
  { schluessel: "objekt.ort", name: "Ort", typ: "text", quelle: O("ort") },
  { schluessel: "objekt.ortsteil", name: "Ortsteil", typ: "text", quelle: O("ortsteil") },
  { schluessel: "objekt.plz_ort", name: "PLZ und Ort", typ: "text", quelle: GERECHNET },
  { schluessel: "objekt.adresse_freigeben", name: "Adresse im Exposé zeigen", typ: "ja_nein",
    quelle: O("adresse_freigeben"),
    hinweis: "Ist sie nicht freigegeben, entfallen Straße und Hausnummer — auch auf der Karte." },

  // Flaechen und Raeume
  { schluessel: "objekt.wohnflaeche", name: "Wohnfläche", typ: "flaeche", quelle: O("wohnflaeche"), stellen: 0 },
  { schluessel: "objekt.nutzflaeche", name: "Nutzfläche", typ: "flaeche", quelle: O("nutzflaeche"), stellen: 0 },
  { schluessel: "objekt.grundstueck", name: "Grundstücksfläche", typ: "flaeche", quelle: O("grundstueck"), stellen: 0 },
  { schluessel: "objekt.zimmer", name: "Zimmer", typ: "zahl", quelle: O("zimmer"), stellen: 1 },
  { schluessel: "objekt.schlafzimmer", name: "Schlafzimmer", typ: "zahl", quelle: O("schlafzimmer"), stellen: 0 },
  { schluessel: "objekt.badezimmer", name: "Badezimmer", typ: "zahl", quelle: O("badezimmer"), stellen: 0 },
  { schluessel: "objekt.anzahl_balkone", name: "Balkone", typ: "zahl", quelle: O("anzahl_balkone"), stellen: 0 },
  { schluessel: "objekt.anzahl_terrassen", name: "Terrassen", typ: "zahl", quelle: O("anzahl_terrassen"), stellen: 0 },
  { schluessel: "objekt.etage", name: "Etage", typ: "text", quelle: O("etage") },
  { schluessel: "objekt.etagen_gesamt", name: "Etagen im Haus", typ: "zahl", quelle: O("etagen_gesamt"), stellen: 0 },
  { schluessel: "objekt.wohnungsnr", name: "Wohnungsnummer", typ: "text", quelle: O("wohnungsnr") },
  { schluessel: "objekt.raumaufteilung", name: "Raumaufteilung", typ: "liste", quelle: O("raumaufteilung"),
    hinweis: "Für das Element „Raumliste“ — Name und Fläche je Raum." },

  // Zustand und Technik
  { schluessel: "objekt.baujahr", name: "Baujahr", typ: "jahr", quelle: O("baujahr") },
  { schluessel: "objekt.modernisierung_jahr", name: "Letzte Modernisierung", typ: "jahr",
    quelle: O("modernisierung_jahr") },
  { schluessel: "objekt.zustand", name: "Zustand", typ: "text", quelle: O("zustand") },
  { schluessel: "objekt.unterkellert", name: "Keller", typ: "text", quelle: O("unterkellert") },
  { schluessel: "objekt.wintergarten", name: "Wintergarten", typ: "ja_nein", quelle: O("wintergarten") },
  { schluessel: "objekt.heizungsart", name: "Heizungsart", typ: "text", quelle: O("heizungsart") },
  { schluessel: "objekt.befeuerung", name: "Befeuerung", typ: "text", quelle: O("befeuerung") },
  { schluessel: "objekt.fenster", name: "Fenster", typ: "text", quelle: O("fenster") },
  { schluessel: "objekt.fenster_verglasung", name: "Verglasung", typ: "text", quelle: O("fenster_verglasung") },
  { schluessel: "objekt.fenster_baujahr", name: "Baujahr Fenster", typ: "jahr", quelle: O("fenster_baujahr") },
  { schluessel: "objekt.stellplatz_art", name: "Stellplatzart", typ: "text", quelle: O("stellplatz_art") },
  { schluessel: "objekt.stellplatz_anzahl", name: "Stellplätze", typ: "zahl", quelle: O("stellplatz_anzahl"), stellen: 0 },
  { schluessel: "objekt.stellplatz", name: "Stellplätze (Anzeige)", typ: "text",
    quelle: GERECHNET, hinweis: "Art und Anzahl in einer Zeile." },
  { schluessel: "objekt.verfuegbar_ab", name: "Verfügbar ab", typ: "text", quelle: O("verfuegbar_ab") },

  // Energie
  { schluessel: "objekt.energieausweis_typ", name: "Art des Energieausweises", typ: "text",
    quelle: O("energieausweis_typ") },
  { schluessel: "objekt.energie_kennwert", name: "Energiekennwert", typ: "zahl",
    quelle: O("energie_kennwert"), stellen: 1, hinweis: "In kWh/(m²a). Die Einheit setzt das Element." },
  { schluessel: "objekt.energie_klasse", name: "Energieeffizienzklasse", typ: "text", quelle: O("energie_klasse") },
  { schluessel: "objekt.energie_traeger", name: "Wesentlicher Energieträger", typ: "text", quelle: O("energie_traeger") },
  { schluessel: "objekt.energie_baujahr_anlage", name: "Baujahr der Heizung", typ: "jahr",
    quelle: O("energie_baujahr_anlage") },
  { schluessel: "objekt.energie_warmwasser", name: "Warmwasser enthalten", typ: "ja_nein",
    quelle: O("energie_warmwasser") },
  { schluessel: "objekt.energie_gueltig_bis", name: "Energieausweis gültig bis", typ: "datum",
    quelle: O("energie_gueltig_bis") },
  { schluessel: "objekt.energie_gueltig_kurz", name: "Gültig bis (Monat/Jahr)", typ: "text",
    quelle: GERECHNET, hinweis: "MM/JJJJ — so steht es in den Vorlagen." },
  { schluessel: "objekt.expose_energie_hinweis", name: "Hinweis zur Energie", typ: "mehrzeilig",
    quelle: O("expose_energie_hinweis"),
    hinweis: "Füllt den Kasten „Gut zu wissen“. Bleibt er leer, entfällt der Kasten." },

  // Preise
  { schluessel: "objekt.angebotspreis", name: "Angebotspreis", typ: "euro", quelle: O("angebotspreis"), stellen: 0 },
  { schluessel: "objekt.expose_preis_auf_anfrage", name: "Preis auf Anfrage", typ: "ja_nein",
    quelle: O("expose_preis_auf_anfrage"),
    hinweis: "Ist das gesetzt, steht überall „auf Anfrage“ statt einer Zahl." },
  { schluessel: "objekt.preis", name: "Preis (Anzeige)", typ: "text", quelle: GERECHNET,
    hinweis: "Angebotspreis, oder „auf Anfrage“ — je nach Schalter." },
  { schluessel: "objekt.marktwert", name: "Marktwert", typ: "euro", quelle: O("marktwert"), stellen: 0,
    hinweis: "Interne Einschätzung. Gehört in kein Exposé für Interessenten." },
  { schluessel: "objekt.kaltmiete", name: "Kaltmiete", typ: "euro", quelle: O("kaltmiete"), stellen: 0 },
  { schluessel: "objekt.nebenkosten", name: "Nebenkosten", typ: "euro", quelle: O("nebenkosten"), stellen: 0 },
  { schluessel: "objekt.heizkosten", name: "Heizkosten", typ: "euro", quelle: O("heizkosten"), stellen: 0 },
  { schluessel: "objekt.warmwasser_in_heizkosten", name: "Warmwasser in den Heizkosten", typ: "ja_nein",
    quelle: O("warmwasser_in_heizkosten") },
  { schluessel: "objekt.warmmiete", name: "Warmmiete", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "objekt.kaution", name: "Kaution", typ: "text", quelle: O("kaution") },
  { schluessel: "objekt.kaution_monate", name: "Kaution in Monatsmieten", typ: "zahl",
    quelle: O("kaution_monate"), stellen: 1 },
  { schluessel: "objekt.stellplatzmiete", name: "Stellplatzmiete", typ: "euro",
    quelle: O("stellplatzmiete"), stellen: 0 },
  { schluessel: "objekt.laufende_kosten", name: "Laufende Kosten je Monat", typ: "liste",
    quelle: O("laufende_kosten"),
    hinweis: "Name und Betrag je Posten. Nichts erfasst, keine Kachel." },
  { schluessel: "objekt.hausgeld", name: "Hausgeld", typ: "euro", quelle: O("hausgeld"), stellen: 0 },
  { schluessel: "objekt.hausgeld_nicht_umlagefaehig", name: "Hausgeld, nicht umlagefähig", typ: "euro",
    quelle: O("hausgeld_nicht_umlagefaehig"), stellen: 0 },
  { schluessel: "objekt.provision_aussen", name: "Käuferprovision", typ: "text", quelle: O("provision_aussen") },
  { schluessel: "objekt.provision_innen", name: "Verkäuferprovision", typ: "text", quelle: O("provision_innen"),
    hinweis: "Innenprovision. Gehört in kein Exposé für Interessenten." },
  { schluessel: "objekt.provisionsfrei", name: "Provisionsfrei", typ: "ja_nein", quelle: O("provisionsfrei") },
  { schluessel: "objekt.grunderwerbsteuer_satz", name: "Grunderwerbsteuersatz", typ: "prozent",
    quelle: O("grunderwerbsteuer_satz"), stellen: 1 },

  // Kapitalanlage
  { schluessel: "objekt.vermietet", name: "Vermietet", typ: "ja_nein", quelle: O("vermietet") },
  { schluessel: "objekt.miete_ist", name: "Ist-Miete", typ: "euro", quelle: O("miete_ist"), stellen: 0 },
  { schluessel: "objekt.miete_soll", name: "Soll-Miete", typ: "euro", quelle: O("miete_soll"), stellen: 0 },

  // Texte
  { schluessel: "objekt.ueberschrift_objektbeschreibung", name: "Überschrift Objektbeschreibung", typ: "text",
    quelle: O("ueberschrift_objektbeschreibung") },
  { schluessel: "objekt.beschreibung_objekt", name: "Objektbeschreibung", typ: "mehrzeilig",
    quelle: O("beschreibung_objekt") },
  { schluessel: "objekt.ueberschrift_lage", name: "Überschrift Lage", typ: "text", quelle: O("ueberschrift_lage") },
  { schluessel: "objekt.beschreibung_lage", name: "Lagebeschreibung", typ: "mehrzeilig",
    quelle: O("beschreibung_lage") },
  { schluessel: "objekt.beschreibung_ausstattung", name: "Ausstattung", typ: "mehrzeilig",
    quelle: O("beschreibung_ausstattung") },
  { schluessel: "objekt.beschreibung_ausstattung_expose", name: "Ausstattung (Exposé-Fassung)", typ: "aufzaehlung",
    quelle: O("beschreibung_ausstattung_expose"),
    hinweis: "Eine Zeile je Punkt. Füllt das Element „Ausstattung“." },
  { schluessel: "objekt.expose_ausstattung_gruppen", name: "Ausstattung, gruppiert", typ: "liste",
    quelle: O("expose_ausstattung_gruppen") },
  { schluessel: "objekt.beschreibung_sonstiges", name: "Sonstiges", typ: "mehrzeilig",
    quelle: O("beschreibung_sonstiges") },
  { schluessel: "objekt.notizen", name: "Interne Notizen", typ: "mehrzeilig", quelle: O("notizen"),
    hinweis: "Interne Notizen. Gehören in kein Exposé für Interessenten." },

  // Listen fuer die zusammengesetzten Elemente
  { schluessel: "objekt.expose_highlights", name: "Highlights", typ: "liste", quelle: O("expose_highlights") },
  { schluessel: "objekt.lage_distanzen", name: "Entfernungen", typ: "liste", quelle: O("lage_distanzen") },
  { schluessel: "objekt.expose_wege", name: "Wegezeiten", typ: "liste", quelle: O("expose_wege") },
  { schluessel: "objekt.eckdaten", name: "Eckdaten", typ: "liste", quelle: GERECHNET,
    hinweis: "Die wichtigsten Zahlen als Wert, Einheit und Label." },
  { schluessel: "objekt.fakten", name: "Angaben als Liste", typ: "liste", quelle: GERECHNET,
    hinweis: "Label und Wert, fertig formatiert — für freie Angabenlisten." },
  { schluessel: "objekt.energie_angaben", name: "Energieangaben als Liste", typ: "liste",
    quelle: GERECHNET },
  { schluessel: "objekt.lage_koordinaten", name: "Koordinaten", typ: "liste", quelle: O("lage_koordinaten"),
    hinweis: "Für die Karte. Keine Koordinaten, keine Karte." },

  // Verweise
  { schluessel: "objekt.expose_qr_url", name: "Link für den QR-Code", typ: "text", quelle: O("expose_qr_url") },
  { schluessel: "objekt.rundgang_url", name: "Link zum Rundgang", typ: "text", quelle: O("rundgang_url") },
  { schluessel: "objekt.hauptbild_url", name: "Titelbild", typ: "bild", quelle: O("hauptbild_url") },

  // Schalter, die Seiten ein- und ausblenden
  { schluessel: "objekt.expose_rendite", name: "Renditeseite zeigen", typ: "ja_nein", quelle: O("expose_rendite") },
  { schluessel: "objekt.expose_nebenkosten", name: "Nebenkostenseite zeigen", typ: "ja_nein",
    quelle: O("expose_nebenkosten") },
];

// -------------------------------------------------------- Ansprechpartner
export const ANSPRECHPARTNER: Feld[] = [
  { schluessel: "ansprechpartner.name", name: "Name", typ: "text", quelle: P("name") },
  { schluessel: "ansprechpartner.titel", name: "Titel", typ: "text", quelle: P("titel") },
  { schluessel: "ansprechpartner.funktion", name: "Funktion", typ: "text", quelle: P("funktion") },
  { schluessel: "ansprechpartner.telefon", name: "Telefon", typ: "text", quelle: P("telefon") },
  { schluessel: "ansprechpartner.mobil", name: "Mobil", typ: "text", quelle: P("mobil") },
  { schluessel: "ansprechpartner.email", name: "E-Mail", typ: "text", quelle: P("email") },
  { schluessel: "ansprechpartner.foto", name: "Foto", typ: "bild", quelle: P("foto_url") },
];

// ----------------------------------------------------------------- Firma
export const FIRMA: Feld[] = [
  { schluessel: "firma.name", name: "Firmenname", typ: "text", quelle: F("firma_name") },
  { schluessel: "firma.linie", name: "Produktlinie", typ: "text", quelle: F("marken_linie"),
    hinweis: "Zweite Markenzeile, z. B. fuer ein Premium-Segment (fork_39). "
           + "Leer = die Zeile entfaellt." },
  { schluessel: "firma.marken_name", name: "Markenname", typ: "text", quelle: F("marken_name"),
    hinweis: "Kurzform für Kopf und Fuß. Fehlt sie, nimmt der Renderer den Firmennamen." },
  { schluessel: "firma.strasse", name: "Straße", typ: "text", quelle: F("strasse") },
  { schluessel: "firma.plz", name: "PLZ", typ: "text", quelle: F("plz") },
  { schluessel: "firma.ort", name: "Ort", typ: "text", quelle: F("ort") },
  { schluessel: "firma.land", name: "Land", typ: "text", quelle: F("land") },
  { schluessel: "firma.adresse", name: "Anschrift, einzeilig", typ: "text", quelle: GERECHNET },
  { schluessel: "firma.telefon", name: "Telefon", typ: "text", quelle: F("telefon") },
  { schluessel: "firma.fax", name: "Fax", typ: "text", quelle: F("fax") },
  { schluessel: "firma.email", name: "E-Mail", typ: "text", quelle: F("email") },
  { schluessel: "firma.web", name: "Internetseite", typ: "text", quelle: F("web") },
  { schluessel: "firma.geschaeftsfuehrer", name: "Geschäftsführung", typ: "text", quelle: F("geschaeftsfuehrer") },
  { schluessel: "firma.registergericht", name: "Registergericht", typ: "text", quelle: F("registergericht") },
  { schluessel: "firma.hrb", name: "Handelsregisternummer", typ: "text", quelle: F("hrb") },
  { schluessel: "firma.ust_id", name: "USt-IdNr.", typ: "text", quelle: F("ust_id") },
  { schluessel: "firma.steuernummer", name: "Steuernummer", typ: "text", quelle: F("steuernummer") },
  { schluessel: "firma.kammer", name: "Kammer", typ: "text", quelle: F("kammer") },
  { schluessel: "firma.aufsichtsbehoerde", name: "Aufsichtsbehörde", typ: "text", quelle: F("aufsichtsbehoerde") },
  { schluessel: "firma.rechtshinweis", name: "Rechtshinweis", typ: "mehrzeilig", quelle: F("rechtshinweis") },
  { schluessel: "firma.impressum_zeile", name: "Register- und Steuerzeile", typ: "text", quelle: GERECHNET,
    hinweis: "Registergericht, HRB und USt-IdNr. in einer Zeile, mit · getrennt." },
  { schluessel: "firma.url_impressum", name: "Link zum Impressum", typ: "text", quelle: F("url_impressum") },
  { schluessel: "firma.url_datenschutz", name: "Link zum Datenschutz", typ: "text", quelle: F("url_datenschutz") },
  { schluessel: "firma.url_agb", name: "Link zu den AGB", typ: "text", quelle: F("url_agb") },
  { schluessel: "firma.logo", name: "Logo", typ: "bild", quelle: F("logo_pfad") },
  { schluessel: "firma.ci_primaer", name: "Primärfarbe", typ: "text", quelle: F("ci_primaer") },
  { schluessel: "firma.ci_akzent", name: "Akzentfarbe", typ: "text", quelle: F("ci_akzent") },
];

// -------------------------------------------------------------- Rechnung
// Werte, die niemand erfasst — sie entstehen beim Rendern. Die Formeln
// stehen nicht hier, sondern in rechnen.ts; hier steht, dass es sie gibt.
export const RECHNUNG: Feld[] = [
  { schluessel: "rechnung.kaufpreis", name: "Kaufpreis (Rechnung)", typ: "euro",
    quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.grunderwerbsteuer_satz", name: "Grunderwerbsteuersatz", typ: "prozent",
    quelle: GERECHNET, stellen: 1,
    hinweis: "Aus dem Objekt, sonst aus dem Bundesland der PLZ." },
  { schluessel: "rechnung.grunderwerbsteuer", name: "Grunderwerbsteuer", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.notar_satz", name: "Satz für Notar und Grundbuch", typ: "prozent",
    quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.notar", name: "Notar und Grundbuch", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.courtage_satz", name: "Courtagesatz", typ: "text", quelle: GERECHNET },
  { schluessel: "rechnung.courtage", name: "Käufercourtage", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.posten", name: "Kostenposten", typ: "liste", quelle: GERECHNET,
    hinweis: "Kaufpreis, Grunderwerbsteuer, Notar, Courtage — mit Betrag." },
  { schluessel: "rechnung.gesamtaufwand", name: "Gesamtaufwand", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.laufende_summe", name: "Summe laufende Kosten", typ: "euro",
    quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.eigenkapital_prozent", name: "Eigenkapital", typ: "prozent",
    quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.eigenkapital", name: "Eigenkapital", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.darlehen", name: "Darlehen", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.zinssatz", name: "Sollzins p. a.", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.tilgung", name: "Anfangstilgung", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.monatsrate", name: "Monatliche Rate", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.bruttorendite", name: "Bruttorendite", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.nettorendite", name: "Nettorendite", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.kaufpreisfaktor", name: "Kaufpreisfaktor", typ: "zahl", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.preis_pro_qm", name: "Preis je m²", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.hinweis", name: "Hinweis zur Beispielrechnung", typ: "mehrzeilig", quelle: GERECHNET },
];

// ----------------------------------------------------------------- Seite
export const SEITE: Feld[] = [
  { schluessel: "dokument.seiten", name: "Seiten des Dokuments", typ: "liste",
    quelle: GERECHNET, hinweis: "Für das Inhaltsverzeichnis: Nummer und Name." },
  { schluessel: "seite.nummer", name: "Seitenzahl", typ: "zahl", quelle: GERECHNET, stellen: 0 },
  { schluessel: "seite.gesamt", name: "Seiten insgesamt", typ: "zahl", quelle: GERECHNET, stellen: 0 },
  { schluessel: "lauf.nummer", name: "Durchgang der Seite", typ: "zahl",
    quelle: GERECHNET, stellen: 0,
    hinweis: "Bei einer Seite, die sich wiederholt: der wievielte Durchgang." },
  { schluessel: "lauf.gesamt", name: "Durchgänge insgesamt", typ: "zahl",
    quelle: GERECHNET, stellen: 0 },
  { schluessel: "seite.nummer_zweistellig", name: "Seitenzahl, zweistellig", typ: "text",
    quelle: GERECHNET, hinweis: "Mit fuehrender Null: 02 statt 2." },
  { schluessel: "seite.gesamt_zweistellig", name: "Seiten insgesamt, zweistellig",
    typ: "text", quelle: GERECHNET },
  { schluessel: "seite.name", name: "Name der Seite", typ: "text", quelle: GERECHNET },
  { schluessel: "datum", name: "Heutiges Datum", typ: "datum", quelle: GERECHNET },
];

export const KATALOG: Feld[] = [
  ...OBJEKT, ...ANSPRECHPARTNER, ...FIRMA, ...RECHNUNG, ...SEITE,
];

/**
 * Spalten der drei Tabellen, die bewusst KEIN Platzhalter sind — mit
 * Grund. tests/expose-felder.sql verlangt, dass jede Spalte entweder im
 * Katalog oder hier steht; eine neue Spalte faellt dort auf und muss
 * entschieden werden.
 */
export const AUSGENOMMEN: Record<string, string> = {
  // Schluessel und Verwaltung
  "immobilien.id": "Technische Kennung",
  "immobilien.mandant_id": "Mandantenzuordnung — gehört nicht ins Dokument",
  "immobilien.stammobjekt_id": "Verweis auf das Stammobjekt",
  "immobilien.zustaendig_id": "Verweis — die Felder stehen unter ansprechpartner.*",
  "immobilien.ersteller_id": "Verweis auf den Anleger",
  "immobilien.expose_titelbild_id": "Verweis — das Bild kommt über den Bildslot",
  "immobilien.created_at": "Verwaltungszeitpunkt",
  "immobilien.updated_at": "Verwaltungszeitpunkt",
  "immobilien.verkauft_am": "Nach dem Verkauf braucht es kein Exposé",
  "immobilien.auftragsart": "Innenverhältnis zum Eigentümer",
  "immobilien.auftrag_bis": "Innenverhältnis zum Eigentümer",
  "immobilien.verkaufspreis": "Erzielter Preis — nicht für Interessenten",
  "immobilien.fensterbaujahr": "Altfeld, fenster_baujahr hat es ersetzt",
  "immobilien.versteckt": "Sichtbarkeitsschalter der Oberfläche",
  "immobilien.referenz": "Schalter für die Referenzliste",
  "immobilien.website_veroeffentlichen": "Schalter für die Website",
  "immobilien.website_top_angebot": "Schalter für die Website",
  "immobilien.shoptv_veroeffentlichen": "Schalter eines gestrichenen Dienstes",
  "immobilien.expose_vorlage": "Welche Vorlage — nicht ihr Inhalt",
  "immobilien.expose_vorlage_id": "Welche Vorlage — nicht ihr Inhalt",
  "immobilien.expose_overrides": "Abweichungen am Dokument, kein Objektdatum",
  "immobilien.quelle": "Woher der Datensatz kam",
  "immobilien.onoffice_id": "Fremdkennung",
  "immobilien.onoffice_synced_at": "Verwaltungszeitpunkt",
  "immobilien.onoffice_gesperrt": "Sperre der Fremdanbindung",
  "immobilien.onoffice_bilder_am": "Verwaltungszeitpunkt",

  "profiles.id": "Technische Kennung",
  "profiles.mandant_id": "Mandantenzuordnung",
  "profiles.firma_id": "Zuordnung zur Gesellschaft",
  "profiles.role": "Rolle im Rechtesystem",
  "profiles.stufe": "Stufe im Rechtesystem",
  "profiles.rechte": "Einzelrechte",
  "profiles.sichtbarkeit": "Sichtbarkeitsbereich",
  "profiles.must_change_password": "Anmeldung",
  "profiles.created_at": "Verwaltungszeitpunkt",
  "profiles.signatur": "E-Mail-Signatur",
  "profiles.kalender_farbe": "Darstellung im Kalender",
  "profiles.tile_order": "Anordnung der Startseite",
  "profiles.tile_hidden": "Anordnung der Startseite",
  "profiles.zuletzt_geoeffnet": "Verlauf der Oberfläche",
  "profiles.tutorial_completed_at": "Einführung",
  "profiles.tutorial_step": "Einführung",
  "profiles.pptx_vorlage_einwertung": "Vorlage eines anderen Moduls",
  "profiles.pptx_vorlage_einwertung_updated_at": "Vorlage eines anderen Moduls",
  "profiles.urlaubstage_jahr": "Personalverwaltung",
  "profiles.urlaub_uebertrag": "Personalverwaltung",
  "profiles.urlaub_staffel": "Personalverwaltung",
  "profiles.eintritt": "Personalverwaltung",
  "profiles.stundensatz": "Personalverwaltung",
  "profiles.start_adresse": "Fahrzeitberechnung",
  "profiles.fahrzeit_aktiv": "Fahrzeitberechnung",
  "profiles.fahrzeit_puffer_min": "Fahrzeitberechnung",
  "profiles.besichtigung_dauer_min": "Terminplanung",
  "profiles.push_mails": "Benachrichtigungen",
  "profiles.push_termine": "Benachrichtigungen",
  "profiles.push_treffer": "Benachrichtigungen",
  "profiles.push_stumm_von": "Benachrichtigungen",
  "profiles.push_stumm_bis": "Benachrichtigungen",

  "firma_stammdaten.id": "Technische Kennung",
  "firma_stammdaten.mandant_id": "Mandantenzuordnung",
  "firma_stammdaten.gesellschaft_id": "Zuordnung",
  "firma_stammdaten.inhaber_user_id": "Verweis",
  "firma_stammdaten.slug": "Kennung für Adressen",
  "firma_stammdaten.typ": "Art der Gesellschaft",
  "firma_stammdaten.aktiv": "Verwaltungsschalter",
  "firma_stammdaten.sortierung": "Reihenfolge in Listen",
  "firma_stammdaten.updated_at": "Verwaltungszeitpunkt",
  "firma_stammdaten.bundesland": "Steuert den Grunderwerbsteuersatz, siehe rechnung.*",
  "firma_stammdaten.bank_name": "Zahlungsverkehr",
  "firma_stammdaten.bank_iban": "Zahlungsverkehr",
  "firma_stammdaten.bank_bic": "Zahlungsverkehr",
  "firma_stammdaten.kleinunternehmer": "Rechnungsstellung",
  "firma_stammdaten.standard_mwst_satz": "Rechnungsstellung",
  "firma_stammdaten.zahlungsziel_tage": "Rechnungsstellung",
  "firma_stammdaten.rechnung_einleitung": "Rechnungsstellung",
  "firma_stammdaten.rechnung_schluss": "Rechnungsstellung",
  "firma_stammdaten.rechnung_nummer_praefix": "Rechnungsstellung",
  "firma_stammdaten.rechnung_nummer_mit_jahr": "Rechnungsstellung",
  "firma_stammdaten.nummernkreis_prefix": "Nummernkreise",
  "firma_stammdaten.nummernkreis_mit_jahr": "Nummernkreise",
  "firma_stammdaten.ci_font": "Schrift — steht im Stil der Vorlage, nicht als Platzhalter",
  "firma_stammdaten.expose_vorlage": "Welche Vorlage — nicht ihr Inhalt",
  "firma_stammdaten.expose_farben": "Farben — stehen im Stil der Vorlage",
  "firma_stammdaten.expose_rechtsanhang": "Schalter für die Rechtsseiten",
};

/** Nachschlagen eines Platzhalters. */
export function feld(schluessel: string): Feld | undefined {
  return KATALOG.find((f) => f.schluessel === schluessel);
}
