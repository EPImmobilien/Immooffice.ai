import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  AbschnittTitel,
  Bildkachel,
  Eckdatenraster,
  Fliesstext,
  Fusszeile,
  Titelzeilen,
} from "./bausteine";
import {
  eckdaten,
  energiedaten,
  HAFTUNG,
  KiVermerk,
  kategorieName,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import { schriftenBereitstellen } from "./schriften";
import { ABSTAND, FARBE, GROESSE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 2: „Modern, minimalistisch" (Abschnitt 8).
 *
 * Gegenentwurf zur klassischen Vorlage: kein Kopfbereich mit Anschrift,
 * stattdessen ein grosszuegiger Titelblock ueber dem Bild, breite Raender und
 * nur die vier wichtigsten Kennzahlen. Dieselben Bausteine, andere Haltung —
 * kein umgefaerbter Aufguss.
 */

const stile = StyleSheet.create({
  seite: {
    paddingTop: 58,
    paddingBottom: 66,
    paddingHorizontal: 58,
    fontFamily: SCHRIFT.text,
  },
  marke: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  strich: { height: 2, width: 44, marginTop: 30, marginBottom: 16 },
  ort: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.klein,
    color: FARBE.gedaempft,
    marginTop: 8,
  },
  preiszeile: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 26,
    marginBottom: 26,
  },
  preisLabel: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    marginRight: 12,
  },
  preisWert: { fontFamily: SCHRIFT.titel, fontSize: GROESSE.gross, fontWeight: 600 },
  block: { marginBottom: ABSTAND.block },
  bildreihe: { flexDirection: "row", marginHorizontal: -5, marginBottom: ABSTAND.block },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 5 },
  fuss: { position: "absolute", bottom: 30, left: 58, right: 58 },
});

export function ExposeModern({ objekt, branding, bilder }: ExposeDaten) {
  schriftenBereitstellen();

  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const weitere = bilder.slice(1, 4);
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);
  const primaer = branding.farbePrimaer;
  const akzent = branding.farbeAkzent;

  return (
    <Document
      title={objekt.titel ?? objekt.bezeichnung}
      author={branding.firmenname}
      creator="ImmoOffice.ai"
      producer="ImmoOffice.ai"
    >
      <Page size="A4" style={[stile.seite, { color: primaer }]}>
        <Text style={[stile.marke, { color: primaer, letterSpacing: gesperrt(GROESSE.winzig) }]}>
          {branding.firmenname}
        </Text>

        <View style={[stile.strich, { backgroundColor: akzent }]} />
        <Titelzeilen
          text={objekt.titel ?? objekt.bezeichnung}
          breite={479}
          groesse={Math.round(GROESSE.riesig * 0.86)}
          farbe={primaer}
        />
        <Text style={stile.ort}>
          {kategorieName(objekt)} · {ortszeile(objekt)}
        </Text>

        <View style={stile.preiszeile}>
          <Text style={[stile.preisLabel, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
            {preis.label}
          </Text>
          <Text style={[stile.preisWert, { color: primaer }]}>{preis.wert}</Text>
        </View>

        {titelbild && (
          <View style={stile.block}>
            <Bildkachel bild={titelbild} hoehe={252} akzent={akzent} />
          </View>
        )}

        <View style={stile.block}>
          <Eckdatenraster daten={eckdaten(objekt).slice(0, 4)} primaer={primaer} spalten={4} />
        </View>

        {objekt.beschreibung_objekt && (
          <View style={stile.block}>
            <AbschnittTitel text="Das Objekt" akzent={akzent} />
            <Fliesstext text={objekt.beschreibung_objekt} farbe={primaer} />
          </View>
        )}

        <Fusszeile branding={branding} haftung={HAFTUNG} style={stile.fuss} />
      </Page>

      <Page size="A4" style={[stile.seite, { color: primaer }]}>
        {weitere.length > 0 && (
          <View style={stile.bildreihe}>
            {weitere.map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Bildkachel bild={bild} hoehe={118} akzent={akzent} />
              </View>
            ))}
          </View>
        )}

        {objekt.beschreibung_ausstattung && (
          <View style={stile.block}>
            <AbschnittTitel text="Ausstattung" akzent={akzent} />
            <Fliesstext text={objekt.beschreibung_ausstattung} farbe={primaer} />
          </View>
        )}

        {objekt.beschreibung_lage && (
          <View style={stile.block}>
            <AbschnittTitel text="Lage" akzent={akzent} />
            <Fliesstext text={objekt.beschreibung_lage} farbe={primaer} />
          </View>
        )}

        <View style={stile.block}>
          <AbschnittTitel text="Energieausweis" akzent={akzent} />
          <Eckdatenraster daten={energiedaten(objekt)} primaer={primaer} />
        </View>

        <KiVermerk
          texteKiErzeugt={objekt.texte_ki_erzeugt}
          bilderKiBearbeitet={bildBearbeitet}
        />

        <Fusszeile branding={branding} haftung={HAFTUNG} style={stile.fuss} />
      </Page>
    </Document>
  );
}
