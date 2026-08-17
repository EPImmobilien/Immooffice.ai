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
import type { ExposeBild, ExposeDaten } from "./typen";

/**
 * Vorlage 3: „Bildstark, Premium“ (Abschnitt 8).
 *
 * Das Bild traegt die Vorlage. Erste Seite: randlose Aufnahme mit
 * eingeblendetem Titel, danach ganzseitige Bildtafeln, Texte und Eckdaten in
 * ruhigen Bloecken dazwischen.
 *
 * Ohne Bilder ergaebe die Vorlage keinen Sinn — sie faellt dann auf einen
 * getoenten Titelblock zurueck, statt eine leere Seite zu drucken. Das ist
 * bewusst so: Ein Exposé darf nicht kaputtgehen, nur weil Bilder fehlen.
 */

const stile = StyleSheet.create({
  seite: {
    fontSize: 10,
    lineHeight: 1.6,
    color: "#1B2A47",
    fontFamily: "Helvetica",
  },
  inhaltsseite: { paddingTop: 48, paddingBottom: 58, paddingHorizontal: 52 },
  vollbild: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" },
  // Dunkler Verlaufsersatz: Ein halbtransparenter Balken haelt den Titel
  // lesbar, egal wie hell das Foto ist.
  titelband: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 52,
    paddingTop: 34,
    paddingBottom: 44,
  },
  marke: {
    position: "absolute",
    top: 44,
    left: 52,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
  titelGross: {
    fontSize: 27,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    lineHeight: 1.18,
  },
  titelOrt: { fontSize: 11, color: "#FFFFFF", opacity: 0.85, marginTop: 8 },
  titelPreis: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 16 },
  ersatzKopf: { paddingTop: 150, paddingHorizontal: 52 },
  ueberschrift: {
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  absatz: { textAlign: "justify", marginBottom: 14 },
  zweispaltig: { flexDirection: "row", marginHorizontal: -14 },
  spalte: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 14 },
  eckZeile: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E6E8EB",
    paddingVertical: 5,
  },
  eckLabel: { color: "#7A828C" },
  eckWert: { fontFamily: "Helvetica-Bold" },
  // Die Hoehen sind so gewaehlt, dass Bildtafel, Textblock und Bildzeile
  // zusammen auf eine Seite passen. Ein Bild kann nicht ueber einen
  // Seitenumbruch laufen — waere die Tafel groesser, rutschte die Zeile
  // darunter auf eine neue Seite und liesse eine halbleere zurueck.
  tafel: { width: "100%", height: 230, objectFit: "cover", marginBottom: 6 },
  halbtafel: { width: "100%", height: 150, objectFit: "cover" },
  bildzeile: { flexDirection: "row", marginHorizontal: -5, marginTop: 10 },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 5 },
  bildunterschrift: { fontSize: 7.5, color: "#7A828C", marginTop: 3 },
  fuss: {
    position: "absolute",
    bottom: 28,
    left: 52,
    right: 52,
    fontSize: 7,
    color: "#7A828C",
    lineHeight: 1.5,
  },
});

function Unterschrift({ bild }: { bild: ExposeBild }) {
  const teile = [bild.titel, bild.kiBearbeitet ? "digital bearbeitet" : null]
    .filter(Boolean)
    .join(" · ");
  if (!teile) return null;
  return <Text style={stile.bildunterschrift}>{teile}</Text>;
}

export function ExposePremium({ objekt, branding, bilder }: ExposeDaten) {
  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const tafel = bilder[1];
  const reihe = bilder.slice(2, 6);
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);

  return (
    <Document
      title={objekt.titel ?? objekt.bezeichnung}
      author={branding.firmenname}
      creator="ImmoOffice.ai"
      producer="ImmoOffice.ai"
    >
      {/* Titelseite */}
      <Page
        size="A4"
        style={[
          stile.seite,
          titelbild ? {} : { backgroundColor: branding.farbePrimaer },
        ]}
      >
        {titelbild && (
          <Image
            style={stile.vollbild}
            src={{ data: titelbild.daten, format: titelbild.format }}
          />
        )}

        <Text style={stile.marke}>{branding.firmenname}</Text>

        <View
          style={[
            stile.titelband,
            titelbild ? { backgroundColor: "#1B2A47", opacity: 0.92 } : {},
          ]}
        >
          <Text style={stile.titelGross}>{objekt.titel ?? objekt.bezeichnung}</Text>
          <Text style={stile.titelOrt}>
            {kategorieName(objekt)} · {ortszeile(objekt)}
          </Text>
          <Text style={[stile.titelPreis, { color: branding.farbeAkzent }]}>
            {preis.label}: {preis.wert}
          </Text>
        </View>
      </Page>

      {/* Inhalt */}
      <Page size="A4" style={[stile.seite, stile.inhaltsseite]}>
        {tafel && (
          <View>
            <Image
              style={stile.tafel}
              src={{ data: tafel.daten, format: tafel.format }}
            />
            <Unterschrift bild={tafel} />
          </View>
        )}

        <View style={{ marginTop: tafel ? 22 : 0 }}>
          <Text style={[stile.ueberschrift, { color: branding.farbeAkzent }]}>
            Das Objekt
          </Text>
          <View style={stile.zweispaltig}>
            <View style={stile.spalte}>
              {objekt.beschreibung_objekt && (
                <Text style={stile.absatz}>{objekt.beschreibung_objekt}</Text>
              )}
              {objekt.beschreibung_lage && (
                <Text style={stile.absatz}>{objekt.beschreibung_lage}</Text>
              )}
            </View>
            <View style={stile.spalte}>
              {eckdaten(objekt).map((e) => (
                <View key={e.bezeichnung} style={stile.eckZeile}>
                  <Text style={stile.eckLabel}>{e.bezeichnung}</Text>
                  <Text style={stile.eckWert}>{e.wert}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {reihe.length > 0 && (
          <View style={stile.bildzeile}>
            {reihe.slice(0, 2).map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Image
                  style={stile.halbtafel}
                  src={{ data: bild.daten, format: bild.format }}
                />
                <Unterschrift bild={bild} />
              </View>
            ))}
          </View>
        )}

        <View style={stile.fuss} fixed>
          <Text>
            {kontaktzeile(branding)} · Objekt {objekt.objektnummer}
          </Text>
          <Text>{HAFTUNG}</Text>
        </View>
      </Page>

      {/* Ausstattung, weitere Bilder und Energieausweis */}
      <Page size="A4" style={[stile.seite, stile.inhaltsseite]}>
        {objekt.beschreibung_ausstattung && (
          <View style={{ marginBottom: 22 }}>
            <Text style={[stile.ueberschrift, { color: branding.farbeAkzent }]}>
              Ausstattung
            </Text>
            <Text style={stile.absatz}>{objekt.beschreibung_ausstattung}</Text>
          </View>
        )}

        {reihe.slice(2).length > 0 && (
          <View style={stile.bildzeile}>
            {reihe.slice(2).map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Image
                  style={stile.halbtafel}
                  src={{ data: bild.daten, format: bild.format }}
                />
                <Unterschrift bild={bild} />
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 26 }}>
          <Text style={[stile.ueberschrift, { color: branding.farbeAkzent }]}>
            Energieausweis
          </Text>
          {energiedaten(objekt).map((e) => (
            <View key={e.bezeichnung} style={stile.eckZeile}>
              <Text style={stile.eckLabel}>{e.bezeichnung}</Text>
              <Text style={stile.eckWert}>{e.wert}</Text>
            </View>
          ))}
        </View>

        <KiVermerk
          texteKiErzeugt={objekt.texte_ki_erzeugt}
          bilderKiBearbeitet={bildBearbeitet}
          style={{ marginTop: 18 }}
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
