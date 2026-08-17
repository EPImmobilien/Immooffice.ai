import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  eckdaten,
  energiedaten,
  HAFTUNG,
  KiVermerk,
  kategorieName,
  kuerzen,
  kontaktzeile,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 4: „Kurzexposé / Factsheet“ (Abschnitt 8).
 *
 * Genau eine Seite — das ist die Eigenschaft, die diese Vorlage ausmacht.
 * Deshalb werden die Texte hier hart begrenzt statt umbrochen: Ein Factsheet,
 * das auf Seite zwei laeuft, ist kein Factsheet mehr. Gekuerzt wird sichtbar
 * mit Auslassung, damit niemand einen abgeschnittenen Satz fuer den ganzen
 * Text haelt.
 */

const stile = StyleSheet.create({
  seite: {
    paddingTop: 34,
    paddingBottom: 46,
    paddingHorizontal: 40,
    fontSize: 9,
    lineHeight: 1.45,
    color: "#1B2A47",
    fontFamily: "Helvetica",
  },
  kopf: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  firma: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  kennung: { fontSize: 7.5, color: "#7A828C" },
  oben: { flexDirection: "row", marginHorizontal: -8, marginBottom: 14 },
  spalteBild: { width: "46%", paddingHorizontal: 8 },
  spalteText: { width: "54%", paddingHorizontal: 8 },
  bild: { width: "100%", height: 150, objectFit: "cover" },
  titel: { fontSize: 15, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  ort: { fontSize: 8.5, color: "#7A828C", marginTop: 3, marginBottom: 10 },
  preisKasten: { paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 3 },
  preisLabel: { fontSize: 7, color: "#7A828C", textTransform: "uppercase" },
  preisWert: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 1 },
  bloecke: { flexDirection: "row", marginHorizontal: -8 },
  block: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 8 },
  ueberschrift: {
    fontSize: 7.5,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: "#7A828C",
    marginBottom: 5,
  },
  eckZeile: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E6E8EB",
    paddingVertical: 3,
  },
  eckWert: { fontFamily: "Helvetica-Bold" },
  textblock: { marginTop: 12 },
  fuss: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#E6E8EB",
    paddingTop: 5,
    fontSize: 6.5,
    color: "#7A828C",
    lineHeight: 1.45,
  },
});

export function ExposeFactsheet({ objekt, branding, bilder }: ExposeDaten) {
  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const alle = eckdaten(objekt);
  const links = alle.filter((_, i) => i % 2 === 0);
  const rechts = alle.filter((_, i) => i % 2 === 1);
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);

  const objektText = kuerzen(objekt.beschreibung_objekt, 520);
  const lageText = kuerzen(objekt.beschreibung_lage, 320);

  return (
    <Document
      title={`Kurzexposé ${objekt.titel ?? objekt.bezeichnung}`}
      author={branding.firmenname}
      creator="ImmoOffice.ai"
      producer="ImmoOffice.ai"
    >
      <Page size="A4" style={stile.seite}>
        <View style={stile.kopf}>
          <Text style={[stile.firma, { color: branding.farbePrimaer }]}>
            {branding.firmenname}
          </Text>
          <Text style={stile.kennung}>
            Kurzexposé · Objekt {objekt.objektnummer}
          </Text>
        </View>

        <View style={stile.oben}>
          <View style={stile.spalteBild}>
            {titelbild ? (
              <Image
                style={stile.bild}
                src={{ data: titelbild.daten, format: titelbild.format }}
              />
            ) : (
              <View
                style={[stile.bild, { backgroundColor: branding.farbePrimaer }]}
              />
            )}
          </View>

          <View style={stile.spalteText}>
            <Text style={stile.titel}>
              {kuerzen(objekt.titel ?? objekt.bezeichnung, 70)}
            </Text>
            <Text style={stile.ort}>
              {kategorieName(objekt)} · {ortszeile(objekt)}
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
              <Text style={stile.preisLabel}>{preis.label}</Text>
              <Text style={[stile.preisWert, { color: branding.farbePrimaer }]}>
                {preis.wert}
              </Text>
            </View>
          </View>
        </View>

        <View style={stile.bloecke}>
          <View style={stile.block}>
            <Text style={stile.ueberschrift}>Eckdaten</Text>
            {links.map((e) => (
              <View key={e.bezeichnung} style={stile.eckZeile}>
                <Text>{e.bezeichnung}</Text>
                <Text style={stile.eckWert}>{e.wert}</Text>
              </View>
            ))}
          </View>
          <View style={stile.block}>
            <Text style={stile.ueberschrift}>&nbsp;</Text>
            {rechts.map((e) => (
              <View key={e.bezeichnung} style={stile.eckZeile}>
                <Text>{e.bezeichnung}</Text>
                <Text style={stile.eckWert}>{e.wert}</Text>
              </View>
            ))}
          </View>
          <View style={stile.block}>
            <Text style={stile.ueberschrift}>Energieausweis</Text>
            {energiedaten(objekt).map((e) => (
              <View key={e.bezeichnung} style={stile.eckZeile}>
                <Text>{e.bezeichnung}</Text>
                <Text style={stile.eckWert}>{e.wert}</Text>
              </View>
            ))}
          </View>
        </View>

        {(objektText || lageText) && (
          <View style={stile.textblock}>
            <View style={stile.bloecke}>
              {objektText && (
                <View style={stile.block}>
                  <Text style={stile.ueberschrift}>Das Objekt</Text>
                  <Text>{objektText}</Text>
                </View>
              )}
              {lageText && (
                <View style={stile.block}>
                  <Text style={stile.ueberschrift}>Lage</Text>
                  <Text>{lageText}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <KiVermerk
          texteKiErzeugt={objekt.texte_ki_erzeugt}
          bilderKiBearbeitet={bildBearbeitet}
          style={{ marginTop: 10 }}
        />

        <View style={stile.fuss} fixed>
          <Text>{kontaktzeile(branding)}</Text>
          <Text>{HAFTUNG}</Text>
        </View>
      </Page>
    </Document>
  );
}
