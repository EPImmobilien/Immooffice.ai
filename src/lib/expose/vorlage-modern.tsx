import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  eckdaten,
  energiedaten,
  HAFTUNG,
  KiVermerk,
  kategorieName,
  kontaktzeile,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 2: „Modern, minimalistisch“ (Abschnitt 8).
 *
 * Gegenentwurf zur klassischen Vorlage: viel Weissraum, eine schmale
 * Akzentlinie statt Rahmen, Eckdaten als ruhige Reihe statt als Tabelle.
 * Dieselben Inhalte, andere Haltung — kein umgefaerbter Aufguss.
 */

const stile = StyleSheet.create({
  seite: {
    paddingTop: 56,
    paddingBottom: 62,
    paddingHorizontal: 56,
    fontSize: 9.5,
    lineHeight: 1.65,
    color: "#1B2A47",
    fontFamily: "Helvetica",
  },
  marke: {
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 40,
  },
  strich: { height: 2, width: 44, marginBottom: 16 },
  titel: { fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  ort: { fontSize: 10, color: "#7A828C", marginTop: 6, marginBottom: 28 },
  bild: { width: "100%", height: 250, objectFit: "cover", marginBottom: 28 },
  kennzahlen: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#E6E8EB",
    paddingVertical: 14,
    marginBottom: 28,
  },
  kennzahl: { flexGrow: 1, flexBasis: 0, paddingRight: 10 },
  kennLabel: {
    fontSize: 7,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#7A828C",
  },
  kennWert: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 3 },
  preisZeile: { flexDirection: "row", alignItems: "baseline", marginBottom: 30 },
  preisLabel: {
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#7A828C",
    marginRight: 10,
  },
  preisWert: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  abschnitt: { marginBottom: 22 },
  ueberschrift: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#7A828C",
    marginBottom: 7,
  },
  absatz: { textAlign: "left" },
  bildreihe: { flexDirection: "row", marginHorizontal: -5, marginBottom: 22 },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 5 },
  kleinbild: { width: "100%", height: 118, objectFit: "cover" },
  energie: { flexDirection: "row", flexWrap: "wrap" },
  energiePaar: { width: "33%", paddingRight: 8, marginBottom: 4 },
  fuss: {
    position: "absolute",
    bottom: 30,
    left: 56,
    right: 56,
    fontSize: 7,
    color: "#7A828C",
    lineHeight: 1.5,
  },
});

export function ExposeModern({ objekt, branding, bilder }: ExposeDaten) {
  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  // Genau drei weitere Bilder: Die Reihe soll die Seite fuellen, nicht
  // ausfransen. Bei zwei Bildern werden sie entsprechend breiter.
  const weitere = bilder.slice(1, 4);
  const kennzahlen = eckdaten(objekt).slice(0, 4);
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);

  return (
    <Document
      title={objekt.titel ?? objekt.bezeichnung}
      author={branding.firmenname}
      creator="ImmoOffice.ai"
      producer="ImmoOffice.ai"
    >
      <Page size="A4" style={stile.seite}>
        <Text style={[stile.marke, { color: branding.farbePrimaer }]}>
          {branding.firmenname}
        </Text>

        <View style={[stile.strich, { backgroundColor: branding.farbeAkzent }]} />
        <Text style={stile.titel}>{objekt.titel ?? objekt.bezeichnung}</Text>
        <Text style={stile.ort}>
          {kategorieName(objekt)} · {ortszeile(objekt)}
        </Text>

        {titelbild && (
          <Image
            style={stile.bild}
            src={{ data: titelbild.daten, format: titelbild.format }}
          />
        )}

        {kennzahlen.length > 0 && (
          <View style={stile.kennzahlen}>
            {kennzahlen.map((e) => (
              <View key={e.bezeichnung} style={stile.kennzahl}>
                <Text style={stile.kennLabel}>{e.bezeichnung}</Text>
                <Text style={stile.kennWert}>{e.wert}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={stile.preisZeile}>
          <Text style={stile.preisLabel}>{preis.label}</Text>
          <Text style={[stile.preisWert, { color: branding.farbePrimaer }]}>
            {preis.wert}
          </Text>
        </View>

        {objekt.beschreibung_objekt && (
          <View style={stile.abschnitt}>
            <Text style={stile.ueberschrift}>Das Objekt</Text>
            <Text style={stile.absatz}>{objekt.beschreibung_objekt}</Text>
          </View>
        )}

        {weitere.length > 0 && (
          <View style={stile.bildreihe}>
            {weitere.map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Image
                  style={stile.kleinbild}
                  src={{ data: bild.daten, format: bild.format }}
                />
              </View>
            ))}
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
          <View style={stile.energie}>
            {energiedaten(objekt).map((e) => (
              <View key={e.bezeichnung} style={stile.energiePaar}>
                <Text style={stile.kennLabel}>{e.bezeichnung}</Text>
                <Text>{e.wert}</Text>
              </View>
            ))}
          </View>
        </View>

        <KiVermerk
          texteKiErzeugt={objekt.texte_ki_erzeugt}
          bilderKiBearbeitet={bildBearbeitet}
        />

        <View style={stile.fuss} fixed>
          <Text>
            {kontaktzeile(branding)} · Objekt {objekt.objektnummer}
          </Text>
          <Text>{HAFTUNG}</Text>
        </View>
      </Page>
    </Document>
  );
}
