import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  eckdaten,
  energiedaten,
  HAFTUNG,
  KiVermerk,
  anschriftzeile,
  kategorieName,
  kontaktzeile,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 1: „Klassisch, ausführlich“ (Abschnitt 8).
 *
 * Die Vorlage fuer den Regelfall: alle Angaben, alle Texte, mehrseitig. Das
 * Layout entsteht aus festen Regeln, nicht aus einem Bildmodell
 * (Abschnitt 12). Das Mandanten-Branding kommt als Parameter herein und ist
 * nirgends fest verdrahtet.
 */

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
  titelbild: { width: "100%", height: 210, objectFit: "cover", marginBottom: 18 },
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
  preisKasten: { padding: 12, marginBottom: 18, borderLeftWidth: 3 },
  preisLabel: { fontSize: 8, color: "#7A828C", textTransform: "uppercase" },
  preisWert: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 2 },
  bildreihe: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  bildfeld: { width: "50%", paddingHorizontal: 4, marginBottom: 8 },
  bild: { width: "100%", height: 130, objectFit: "cover" },
  bildunterschrift: { fontSize: 7, color: "#7A828C", marginTop: 2 },
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

export function ExposeKlassisch({ objekt, branding, bilder }: ExposeDaten) {
  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const weitere = bilder.slice(1, 7);
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);

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
            <Text style={stile.kopfZeile}>{anschriftzeile(branding)}</Text>
          </View>
          <Text style={stile.objektnummer}>Objekt {objekt.objektnummer}</Text>
        </View>

        {titelbild && (
          <Image
            style={stile.titelbild}
            src={{ data: titelbild.daten, format: titelbild.format }}
          />
        )}

        <Text style={stile.titel}>{objekt.titel ?? objekt.bezeichnung}</Text>
        <Text style={stile.untertitel}>
          {kategorieName(objekt)} · {ortszeile(objekt)}
        </Text>

        <View
          style={[
            stile.preisKasten,
            { borderLeftColor: branding.farbeAkzent, backgroundColor: "#FAFAFA" },
          ]}
        >
          <Text style={stile.preisLabel}>{preis.label}</Text>
          <Text style={[stile.preisWert, { color: branding.farbePrimaer }]}>
            {preis.wert}
          </Text>
        </View>

        <View style={stile.abschnitt}>
          <Text style={stile.ueberschrift}>Eckdaten</Text>
          <View style={stile.eckdaten}>
            {eckdaten(objekt).map((e) => (
              <Eckdatum key={e.bezeichnung} label={e.bezeichnung} wert={e.wert} />
            ))}
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

        {weitere.length > 0 && (
          <View style={stile.abschnitt} break={weitere.length > 2}>
            <Text style={stile.ueberschrift}>Weitere Ansichten</Text>
            <View style={stile.bildreihe}>
              {weitere.map((bild, i) => (
                <View key={i} style={stile.bildfeld}>
                  <Image
                    style={stile.bild}
                    src={{ data: bild.daten, format: bild.format }}
                  />
                  {(bild.titel || bild.kiBearbeitet) && (
                    <Text style={stile.bildunterschrift}>
                      {[bild.titel, bild.kiBearbeitet ? "digital bearbeitet" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={stile.abschnitt}>
          <Text style={stile.ueberschrift}>Energieausweis</Text>
          <View style={stile.eckdaten}>
            {energiedaten(objekt).map((e) => (
              <Eckdatum key={e.bezeichnung} label={e.bezeichnung} wert={e.wert} />
            ))}
          </View>
        </View>

        <KiVermerk
          texteKiErzeugt={objekt.texte_ki_erzeugt}
          bilderKiBearbeitet={bildBearbeitet}
        />

        <View style={stile.fuss} fixed>
          <Text>{kontaktzeile(branding)}</Text>
          <Text style={{ marginTop: 2 }}>{HAFTUNG}</Text>
        </View>
      </Page>
    </Document>
  );
}
