import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  Abschnitt,
  AbschnittTitel,
  Bildkachel,
  Eckdatenraster,
  Fliesstext,
  Fusszeile,
  Kopfzeile,
  Preisblock,
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
 * Vorlage 1: „Klassisch, ausführlich" (Abschnitt 8), A4 quer.
 *
 * Querformat, weil ein Exposé am Bildschirm gelesen wird und Objektfotos
 * quer aufgenommen sind. Im Hochformat blieb neben einem Foto in voller
 * Breite kaum Hoehe fuer Text; quer stehen Bild und Angaben nebeneinander,
 * und das Bild darf so gross sein, wie es die Sache verdient.
 *
 * Die Seitenaufteilung ist fest: Seite 1 Objekt und Eckdaten, Seite 2 Texte
 * und Ausstattung, Seite 3 nur weitere Ansichten — und die dritte Seite
 * entsteht nur, wenn es sie zu fuellen gibt.
 */

// A4 quer: 842 × 595 pt. Inhaltsbreite bei 40 pt Rand ringsum: 762 pt.
const INHALT = 762;

const stile = StyleSheet.create({
  seite: {
    paddingTop: 38,
    paddingBottom: 66,
    paddingHorizontal: 40,
    fontFamily: SCHRIFT.text,
  },
  reihe: { flexDirection: "row", marginTop: 20 },
  spalteText: { width: "39%", paddingRight: 26 },
  spalteBild: { width: "61%" },
  kategorie: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  ort: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.text,
    color: FARBE.gedaempft,
    marginTop: 6,
    marginBottom: 18,
  },
  dreispalten: { flexDirection: "row", marginHorizontal: -13, marginTop: 20 },
  drittel: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 13 },
  bildreihe: { flexDirection: "row", marginHorizontal: -7, marginTop: 18 },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 7 },
  fuss: { position: "absolute", bottom: 24, left: 40, right: 40 },
});

export function ExposeKlassisch({ objekt, branding, bilder }: ExposeDaten) {
  schriftenBereitstellen();

  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  // Alle weiteren Aufnahmen auf eine eigene Seite. Vorher standen drei davon
  // auf der Textseite und liessen sie um wenige Punkte ueberlaufen — mit einer
  // vierten, fast leeren Seite als Folge. Eine eigene Bildseite ist ohnehin
  // die bessere Buehne: Dort duerfen die Aufnahmen gross sein.
  const galerie = bilder.slice(1, 7);
  // Drei Aufnahmen je Seite, dafuer in voller Groesse. Sechs auf einer Seite
  // haetten jede auf Briefmarkengroesse gedrueckt — und genau darum ging es
  // bei der Umstellung auf Querformat nicht.
  const bildseiten: (typeof galerie)[] = [];
  for (let i = 0; i < galerie.length; i += 3) bildseiten.push(galerie.slice(i, i + 3));
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
        <Kopfzeile
          branding={branding}
          objektnummer={objekt.objektnummer}
          primaer={primaer}
          akzent={akzent}
        />

        <View style={stile.reihe}>
          <View style={stile.spalteText}>
            <Text style={[stile.kategorie, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
              {kategorieName(objekt)}
            </Text>
            <Titelzeilen
              text={objekt.titel ?? objekt.bezeichnung}
              breite={INHALT * 0.39 - 26}
              groesse={GROESSE.gross}
              farbe={primaer}
            />
            <Text style={stile.ort}>{ortszeile(objekt)}</Text>

            <Preisblock
              label={preis.label}
              wert={preis.wert}
              primaer={primaer}
              akzent={akzent}
            />

            <View style={{ marginTop: 20 }}>
              <AbschnittTitel text="Eckdaten" akzent={akzent} />
              <Eckdatenraster daten={eckdaten(objekt)} primaer={primaer} spalten={2} />
            </View>
          </View>

          <View style={stile.spalteBild}>
            {titelbild && <Bildkachel bild={titelbild} hoehe={404} akzent={akzent} />}
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
        <Kopfzeile
          branding={branding}
          objektnummer={objekt.objektnummer}
          primaer={primaer}
          akzent={akzent}
        />

        <View style={stile.dreispalten}>
          {objekt.beschreibung_objekt && (
            <View style={stile.drittel}>
              <AbschnittTitel text="Das Objekt" akzent={akzent} />
              <Fliesstext text={objekt.beschreibung_objekt} farbe={primaer} />
            </View>
          )}
          {objekt.beschreibung_ausstattung && (
            <View style={stile.drittel}>
              <AbschnittTitel text="Ausstattung" akzent={akzent} />
              <Fliesstext text={objekt.beschreibung_ausstattung} farbe={primaer} />
            </View>
          )}
          {objekt.beschreibung_lage && (
            <View style={stile.drittel}>
              <AbschnittTitel text="Lage" akzent={akzent} />
              <Fliesstext text={objekt.beschreibung_lage} farbe={primaer} />
            </View>
          )}
        </View>

        <View style={{ marginTop: ABSTAND.block }}>
          <Abschnitt titel="Energieausweis" akzent={akzent}>
            <Eckdatenraster daten={energiedaten(objekt)} primaer={primaer} />
          </Abschnitt>
        </View>

        <Fusszeile
          branding={branding}
          haftung={HAFTUNG}
          kiTexte={objekt.texte_ki_erzeugt}
          kiBilder={bildBearbeitet}
          style={stile.fuss}
        />
      </Page>

      {bildseiten.map((seite, nr) => (
        <Page
          key={nr}
          size="A4"
          orientation="landscape"
          style={[stile.seite, { color: primaer }]}
        >
          <Kopfzeile
            branding={branding}
            objektnummer={objekt.objektnummer}
            primaer={primaer}
            akzent={akzent}
          />
          <View style={{ marginTop: 18 }}>
            <AbschnittTitel
              text={nr === 0 ? "Weitere Ansichten" : "Weitere Ansichten (Fortsetzung)"}
              akzent={akzent}
            />
            <View style={[stile.bildreihe, { marginTop: 6 }]}>
              {seite.map((bild, i) => (
                <View key={i} style={stile.bildfeld}>
                  <Bildkachel bild={bild} hoehe={372} akzent={akzent} mitTitel />
                </View>
              ))}
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
      ))}
    </Document>
  );
}
