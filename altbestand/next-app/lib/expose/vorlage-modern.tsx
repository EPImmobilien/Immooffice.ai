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
  kategorieName,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import { schriftenBereitstellen } from "./schriften";
import { ABSTAND, FARBE, GROESSE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 2: „Modern, minimalistisch" (Abschnitt 8), A4 quer.
 *
 * Gegenentwurf zur klassischen Vorlage: Dort stehen Bild und Angaben
 * nebeneinander, hier liegt das Bild als breite Bahn ueber der ganzen Seite
 * und die Angaben darunter in einer Zeile. Kein Kopfbereich mit Anschrift,
 * breite Raender, nur die vier wichtigsten Kennzahlen.
 */

const INHALT = 762;

const stile = StyleSheet.create({
  seite: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontFamily: SCHRIFT.text,
  },
  marke: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  unterBild: { flexDirection: "row", marginTop: 24 },
  spalteTitel: { width: "52%", paddingRight: 30 },
  spalteDaten: { width: "48%" },
  ort: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.klein,
    color: FARBE.gedaempft,
    marginTop: 8,
  },
  // Label ueber dem Betrag, nicht daneben: Bei `alignItems: "baseline"` legt
  // sich die kleine Beschriftung auf die Grundlinie der grossen Zahl und
  // erscheint dadurch unter ihr.
  preiszeile: { marginBottom: 16 },
  preisLabel: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  preisWert: { fontFamily: SCHRIFT.titel, fontSize: GROESSE.gross, fontWeight: 600 },
  zweispalten: { flexDirection: "row", marginHorizontal: -16 },
  spalte: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 16 },
  block: { marginBottom: ABSTAND.block },
  bildreihe: { flexDirection: "row", marginHorizontal: -7, marginBottom: 22 },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 7 },
  fuss: { position: "absolute", bottom: 28, left: 40, right: 40 },
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
      <Page size="A4" orientation="landscape" style={[stile.seite, { color: primaer }]}>
        <Text style={[stile.marke, { color: primaer, letterSpacing: gesperrt(GROESSE.winzig) }]}>
          {branding.firmenname}
        </Text>

        {titelbild && <Bildkachel bild={titelbild} hoehe={300} akzent={akzent} />}

        <View style={stile.unterBild}>
          <View style={stile.spalteTitel}>
            <Titelzeilen
              text={objekt.titel ?? objekt.bezeichnung}
              breite={INHALT * 0.52 - 30}
              groesse={GROESSE.gross}
              maxZeilen={2}
              farbe={primaer}
            />
            <Text style={stile.ort}>
              {kategorieName(objekt)} · {ortszeile(objekt)}
            </Text>
          </View>

          <View style={stile.spalteDaten}>
            <View style={stile.preiszeile}>
              <Text style={[stile.preisLabel, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
                {preis.label}
              </Text>
              <Text style={[stile.preisWert, { color: primaer }]}>{preis.wert}</Text>
            </View>
            <Eckdatenraster daten={eckdaten(objekt).slice(0, 4)} primaer={primaer} spalten={2} />
          </View>
        </View>

        <Fusszeile
          branding={branding}
          haftung={HAFTUNG}
          kiTexte={objekt.texte_ki_erzeugt}
          kiBilder={bildBearbeitet}
          style={stile.fuss}
        />
      </Page>

      <Page size="A4" orientation="landscape" style={[stile.seite, { color: primaer }]}>
        {weitere.length > 0 && (
          <View style={stile.bildreihe}>
            {weitere.map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Bildkachel bild={bild} hoehe={210} akzent={akzent} />
              </View>
            ))}
          </View>
        )}

        <View style={stile.zweispalten}>
          <View style={stile.spalte}>
            {objekt.beschreibung_objekt && (
              <View style={stile.block}>
                <AbschnittTitel text="Das Objekt" akzent={akzent} />
                <Fliesstext text={objekt.beschreibung_objekt} farbe={primaer} />
              </View>
            )}
            {objekt.beschreibung_ausstattung && (
              <View style={stile.block}>
                <AbschnittTitel text="Ausstattung" akzent={akzent} />
                <Fliesstext text={objekt.beschreibung_ausstattung} farbe={primaer} />
              </View>
            )}
          </View>

          <View style={stile.spalte}>
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
          </View>
        </View>

        <Fusszeile
          branding={branding}
          haftung={HAFTUNG}
          kiTexte={objekt.texte_ki_erzeugt}
          kiBilder={bildBearbeitet}
          style={stile.fuss}
        />
      </Page>
    </Document>
  );
}
