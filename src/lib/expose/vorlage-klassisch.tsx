import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  Abschnitt,
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
  KiVermerk,
  kategorieName,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import { schriftenBereitstellen } from "./schriften";
import { ABSTAND, FARBE, GROESSE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 1: „Klassisch, ausführlich" (Abschnitt 8).
 *
 * Die Vorlage fuer den Regelfall: alle Angaben, alle Texte, mehrseitig.
 * Das Layout entsteht aus festen Regeln, nicht aus einem Bildmodell
 * (Abschnitt 12). Das Mandanten-Branding kommt als Parameter herein.
 */

const stile = StyleSheet.create({
  seite: {
    paddingTop: ABSTAND.seite,
    paddingBottom: 62,
    paddingHorizontal: ABSTAND.seite,
    fontFamily: SCHRIFT.text,
  },
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
    marginTop: 5,
  },
  bildreihe: { flexDirection: "row", marginHorizontal: -5 },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 5 },
  fuss: { position: "absolute", bottom: 28, left: ABSTAND.seite, right: ABSTAND.seite },
});

export function ExposeKlassisch({ objekt, branding, bilder }: ExposeDaten) {
  schriftenBereitstellen();

  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  // Feste Seitenaufteilung statt freiem Fluss: Seite 1 Objekt, Seite 2 Texte
  // und Ausstattung, Seite 3 nur weitere Ansichten — und die dritte Seite
  // entsteht nur, wenn es sie zu fuellen gibt. Ohne diese Aufteilung schob
  // eine Bildreihe, die nicht mehr auf die Seite passte, sich selbst auf eine
  // sonst leere Folgeseite.
  const weitere = bilder.slice(1);
  const galerie = weitere.slice(3);
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
        <Kopfzeile
          branding={branding}
          objektnummer={objekt.objektnummer}
          primaer={primaer}
          akzent={akzent}
        />

        <View style={{ marginTop: ABSTAND.block }}>
          <Text style={[stile.kategorie, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
            {kategorieName(objekt)}
          </Text>
          <Titelzeilen
            text={objekt.titel ?? objekt.bezeichnung}
            breite={503}
            groesse={GROESSE.gross}
            farbe={primaer}
          />
          <Text style={stile.ort}>{ortszeile(objekt)}</Text>
        </View>

        {titelbild && (
          <View style={{ marginTop: 18 }}>
            <Bildkachel bild={titelbild} hoehe={214} akzent={akzent} />
          </View>
        )}

        <View style={{ marginTop: 18, marginBottom: ABSTAND.block }}>
          <Preisblock
            label={preis.label}
            wert={preis.wert}
            primaer={primaer}
            akzent={akzent}
          />
        </View>

        <Abschnitt titel="Eckdaten" akzent={akzent}>
          <Eckdatenraster daten={eckdaten(objekt)} primaer={primaer} />
        </Abschnitt>

        {objekt.beschreibung_objekt && (
          <Abschnitt titel="Das Objekt" akzent={akzent}>
            <Fliesstext text={objekt.beschreibung_objekt} farbe={primaer} />
          </Abschnitt>
        )}

        <Fusszeile branding={branding} haftung={HAFTUNG} style={stile.fuss} />
      </Page>

      <Page size="A4" style={[stile.seite, { color: primaer }]}>
        <Kopfzeile
          branding={branding}
          objektnummer={objekt.objektnummer}
          primaer={primaer}
          akzent={akzent}
        />

        <View style={{ marginTop: ABSTAND.block }}>
          {objekt.beschreibung_ausstattung && (
            <Abschnitt titel="Ausstattung" akzent={akzent}>
              <Fliesstext text={objekt.beschreibung_ausstattung} farbe={primaer} />
            </Abschnitt>
          )}

          {objekt.beschreibung_lage && (
            <Abschnitt titel="Lage" akzent={akzent}>
              <Fliesstext text={objekt.beschreibung_lage} farbe={primaer} />
            </Abschnitt>
          )}

          {weitere.slice(0, 3).length > 0 && (
            <View style={[stile.bildreihe, { marginBottom: ABSTAND.block }]} wrap={false}>
              {weitere.slice(0, 3).map((bild, i) => (
                <View key={i} style={stile.bildfeld}>
                  <Bildkachel bild={bild} hoehe={104} akzent={akzent} mitTitel />
                </View>
              ))}
            </View>
          )}

          <Abschnitt titel="Energieausweis" akzent={akzent}>
            <Eckdatenraster daten={energiedaten(objekt)} primaer={primaer} />
          </Abschnitt>

          <KiVermerk
            texteKiErzeugt={objekt.texte_ki_erzeugt}
            bilderKiBearbeitet={bildBearbeitet}
          />
        </View>

        <Fusszeile branding={branding} haftung={HAFTUNG} style={stile.fuss} />
      </Page>

      {galerie.length > 0 && (
        <Page size="A4" style={[stile.seite, { color: primaer }]}>
          <Kopfzeile
            branding={branding}
            objektnummer={objekt.objektnummer}
            primaer={primaer}
            akzent={akzent}
          />
          <View style={{ marginTop: ABSTAND.block }}>
            <Abschnitt titel="Weitere Ansichten" akzent={akzent}>
              <View style={stile.bildreihe}>
                {galerie.slice(0, 3).map((bild, i) => (
                  <View key={i} style={stile.bildfeld}>
                    <Bildkachel bild={bild} hoehe={132} akzent={akzent} mitTitel />
                  </View>
                ))}
              </View>
              {galerie.slice(3, 6).length > 0 && (
                <View style={[stile.bildreihe, { marginTop: 12 }]}>
                  {galerie.slice(3, 6).map((bild, i) => (
                    <View key={i} style={stile.bildfeld}>
                      <Bildkachel bild={bild} hoehe={132} akzent={akzent} mitTitel />
                    </View>
                  ))}
                </View>
              )}
            </Abschnitt>
          </View>
          <Fusszeile branding={branding} haftung={HAFTUNG} style={stile.fuss} />
        </Page>
      )}
    </Document>
  );
}
