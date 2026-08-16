import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { adresse, euro, flaeche, zahl } from "@/lib/format";
import {
  ENERGIEAUSWEISTYPEN,
  OBJEKTKATEGORIEN,
  istMiete,
} from "@/lib/objekt-begriffe";

/**
 * Exposé-Vorlage 1: „Klassisch, ausführlich“ (Abschnitt 8).
 *
 * Deterministisches Layout — kein Bild-KI-Einsatz für Seitengestaltung
 * (Abschnitt 12). Das Mandanten-Branding wird als Parameter übergeben und
 * nicht fest verdrahtet, damit dieselbe Vorlage für jeden Mandanten trägt.
 */

export interface ExposeBranding {
  firmenname: string;
  farbePrimaer: string;
  farbeAkzent: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  web: string | null;
  impressum: string | null;
}

export interface ExposeObjekt {
  objektnummer: string;
  bezeichnung: string;
  titel: string | null;
  objektkategorie: string;
  objektart: string | null;
  vermarktungsart: string;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  adresse_veroeffentlichen: boolean;
  wohnflaeche: number | null;
  nutzflaeche: number | null;
  grundstuecksflaeche: number | null;
  zimmer: number | null;
  baujahr: number | null;
  kaufpreis: number | null;
  kaltmiete: number | null;
  nebenkosten: number | null;
  hausgeld: number | null;
  provision_kaeufer: string | null;
  energieausweis_typ: string | null;
  energie_kennwert: number | null;
  energie_klasse: string | null;
  beschreibung_objekt: string | null;
  beschreibung_ausstattung: string | null;
  beschreibung_lage: string | null;
  texte_ki_erzeugt: boolean;
}

const stile = StyleSheet.create({
  seite: {
    paddingTop: 42,
    paddingBottom: 58,
    paddingHorizontal: 46,
    fontSize: 10,
    lineHeight: 1.5,
    color: "#1B2A47",
    fontFamily: "Helvetica",
  },
  kopf: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    paddingBottom: 10,
    marginBottom: 22,
  },
  firma: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  kopfZeile: { fontSize: 8, color: "#7A828C", marginTop: 2 },
  objektnummer: { fontSize: 8, color: "#7A828C" },
  titel: { fontSize: 19, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  untertitel: { fontSize: 10, color: "#7A828C", marginBottom: 18 },
  abschnitt: { marginBottom: 16 },
  ueberschrift: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E6E8EB",
  },
  absatz: { textAlign: "justify", marginBottom: 4 },
  eckdaten: { flexDirection: "row", flexWrap: "wrap" },
  eckdatum: { width: "50%", flexDirection: "row", marginBottom: 4, paddingRight: 8 },
  eckLabel: { width: "55%", color: "#7A828C" },
  eckWert: { width: "45%", fontFamily: "Helvetica-Bold" },
  preisKasten: {
    padding: 12,
    marginBottom: 18,
    borderLeftWidth: 3,
  },
  preisLabel: { fontSize: 8, color: "#7A828C", textTransform: "uppercase" },
  preisWert: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 2 },
  kiVermerk: {
    fontSize: 7,
    color: "#7A828C",
    marginTop: 4,
    fontFamily: "Helvetica-Oblique",
  },
  fuss: {
    position: "absolute",
    bottom: 26,
    left: 46,
    right: 46,
    borderTopWidth: 0.5,
    borderTopColor: "#E6E8EB",
    paddingTop: 6,
    fontSize: 7,
    color: "#7A828C",
  },
});

function Eckdatum({ label, wert }: { label: string; wert: string }) {
  return (
    <View style={stile.eckdatum}>
      <Text style={stile.eckLabel}>{label}</Text>
      <Text style={stile.eckWert}>{wert}</Text>
    </View>
  );
}

export function ExposeKlassisch({
  objekt,
  branding,
}: {
  objekt: ExposeObjekt;
  branding: ExposeBranding;
}) {
  const miete = istMiete(objekt.vermarktungsart);
  const ortszeile = objekt.adresse_veroeffentlichen
    ? adresse(objekt)
    : [objekt.plz, objekt.ort].filter(Boolean).join(" ") || "Auf Anfrage";

  const kategorie =
    objekt.objektart ??
    OBJEKTKATEGORIEN[objekt.objektkategorie as keyof typeof OBJEKTKATEGORIEN] ??
    "Immobilie";

  return (
    <Document
      title={objekt.titel ?? objekt.bezeichnung}
      author={branding.firmenname}
      creator="ImmoOffice.ai"
      producer="ImmoOffice.ai"
    >
      <Page size="A4" style={stile.seite}>
        <View style={[stile.kopf, { borderBottomColor: branding.farbePrimaer }]}>
          <View>
            <Text style={[stile.firma, { color: branding.farbePrimaer }]}>
              {branding.firmenname}
            </Text>
            <Text style={stile.kopfZeile}>
              {[branding.strasse, [branding.plz, branding.ort].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <Text style={stile.objektnummer}>Objekt {objekt.objektnummer}</Text>
        </View>

        <Text style={stile.titel}>{objekt.titel ?? objekt.bezeichnung}</Text>
        <Text style={stile.untertitel}>
          {kategorie} · {ortszeile}
        </Text>

        <View
          style={[
            stile.preisKasten,
            {
              borderLeftColor: branding.farbeAkzent,
              backgroundColor: "#FAFAFA",
            },
          ]}
        >
          <Text style={stile.preisLabel}>
            {miete ? "Kaltmiete monatlich" : "Kaufpreis"}
          </Text>
          <Text style={[stile.preisWert, { color: branding.farbePrimaer }]}>
            {miete ? euro(objekt.kaltmiete) : euro(objekt.kaufpreis)}
          </Text>
        </View>

        <View style={stile.abschnitt}>
          <Text style={stile.ueberschrift}>Eckdaten</Text>
          <View style={stile.eckdaten}>
            {objekt.wohnflaeche !== null && (
              <Eckdatum label="Wohnfläche" wert={flaeche(objekt.wohnflaeche)} />
            )}
            {objekt.nutzflaeche !== null && (
              <Eckdatum label="Nutzfläche" wert={flaeche(objekt.nutzflaeche)} />
            )}
            {objekt.grundstuecksflaeche !== null && (
              <Eckdatum
                label="Grundstück"
                wert={flaeche(objekt.grundstuecksflaeche)}
              />
            )}
            {objekt.zimmer !== null && (
              <Eckdatum label="Zimmer" wert={zahl(objekt.zimmer)} />
            )}
            {objekt.baujahr !== null && (
              <Eckdatum label="Baujahr" wert={String(objekt.baujahr)} />
            )}
            {objekt.nebenkosten !== null && (
              <Eckdatum label="Nebenkosten" wert={euro(objekt.nebenkosten)} />
            )}
            {objekt.hausgeld !== null && (
              <Eckdatum label="Hausgeld" wert={euro(objekt.hausgeld)} />
            )}
            {objekt.provision_kaeufer && (
              <Eckdatum label="Provision" wert={objekt.provision_kaeufer} />
            )}
          </View>
        </View>

        {objekt.beschreibung_objekt && (
          <View style={stile.abschnitt}>
            <Text style={stile.ueberschrift}>Objektbeschreibung</Text>
            <Text style={stile.absatz}>{objekt.beschreibung_objekt}</Text>
          </View>
        )}

        {objekt.beschreibung_ausstattung && (
          <View style={stile.abschnitt}>
            <Text style={stile.ueberschrift}>Ausstattung</Text>
            <Text style={stile.absatz}>{objekt.beschreibung_ausstattung}</Text>
          </View>
        )}

        {objekt.beschreibung_lage && (
          <View style={stile.abschnitt}>
            <Text style={stile.ueberschrift}>Lage</Text>
            <Text style={stile.absatz}>{objekt.beschreibung_lage}</Text>
          </View>
        )}

        <View style={stile.abschnitt}>
          <Text style={stile.ueberschrift}>Energieausweis</Text>
          <View style={stile.eckdaten}>
            <Eckdatum
              label="Art"
              wert={
                objekt.energieausweis_typ
                  ? (ENERGIEAUSWEISTYPEN[
                      objekt.energieausweis_typ as keyof typeof ENERGIEAUSWEISTYPEN
                    ] ?? "–")
                  : "Liegt nicht vor"
              }
            />
            <Eckdatum
              label="Kennwert"
              wert={
                objekt.energie_kennwert !== null
                  ? `${zahl(objekt.energie_kennwert)} kWh/(m²·a)`
                  : "–"
              }
            />
            <Eckdatum label="Effizienzklasse" wert={objekt.energie_klasse ?? "–"} />
          </View>
        </View>

        {/* Kennzeichnung KI-erzeugter Inhalte bleibt im Export erhalten
            (Abschnitt 10) und ist nicht abschaltbar. */}
        {objekt.texte_ki_erzeugt && (
          <Text style={stile.kiVermerk}>
            Die Beschreibungstexte wurden mit Unterstützung künstlicher
            Intelligenz erstellt und redaktionell geprüft.
          </Text>
        )}

        <View style={stile.fuss} fixed>
          <Text>
            {branding.firmenname}
            {branding.telefon ? ` · ${branding.telefon}` : ""}
            {branding.email ? ` · ${branding.email}` : ""}
            {branding.web ? ` · ${branding.web}` : ""}
          </Text>
          <Text style={{ marginTop: 2 }}>
            Alle Angaben beruhen auf Informationen des Eigentümers. Eine Haftung
            für Vollständigkeit und Richtigkeit wird nicht übernommen. Irrtum und
            Zwischenverkauf vorbehalten.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
