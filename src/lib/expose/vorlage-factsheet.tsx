import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  AbschnittTitel,
  Bildkachel,
  Eckdatenraster,
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
  kuerzen,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import { schriftenBereitstellen } from "./schriften";
import { FARBE, GROESSE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 4: „Kurzexposé / Factsheet" (Abschnitt 8).
 *
 * Genau eine Seite — das ist die Eigenschaft, die diese Vorlage ausmacht.
 * Deshalb werden die Texte hier hart begrenzt statt umbrochen: Ein Factsheet,
 * das auf Seite zwei laeuft, ist kein Factsheet mehr. Gekuerzt wird sichtbar
 * mit Auslassung, damit niemand einen abgeschnittenen Satz fuer den ganzen
 * Text haelt.
 */

const stile = StyleSheet.create({
  seite: {
    paddingTop: 38,
    paddingBottom: 52,
    paddingHorizontal: 40,
    fontFamily: SCHRIFT.text,
  },
  oben: { flexDirection: "row", marginHorizontal: -9, marginTop: 20 },
  spalteBild: { width: "45%", paddingHorizontal: 9 },
  spalteText: { width: "55%", paddingHorizontal: 9 },
  kategorie: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  ort: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.fein,
    color: FARBE.gedaempft,
    marginTop: 4,
    marginBottom: 12,
  },
  platzhalter: { height: 148, borderRadius: 2 },
  block: { marginTop: 18 },
  spalten: { flexDirection: "row", marginHorizontal: -9 },
  spalte: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 9 },
  text: { fontFamily: SCHRIFT.text, fontSize: GROESSE.fein, lineHeight: 1.55 },
  fuss: { position: "absolute", bottom: 24, left: 40, right: 40 },
});

export function ExposeFactsheet({ objekt, branding, bilder }: ExposeDaten) {
  schriftenBereitstellen();

  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);
  const primaer = branding.farbePrimaer;
  const akzent = branding.farbeAkzent;

  const objektText = kuerzen(objekt.beschreibung_objekt, 430);
  const lageText = kuerzen(objekt.beschreibung_lage, 300);

  return (
    <Document
      title={`Kurzexposé ${objekt.titel ?? objekt.bezeichnung}`}
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

        <View style={stile.oben}>
          <View style={stile.spalteBild}>
            {titelbild ? (
              <Bildkachel bild={titelbild} hoehe={148} akzent={akzent} />
            ) : (
              <View style={[stile.platzhalter, { backgroundColor: primaer }]} />
            )}
          </View>

          <View style={stile.spalteText}>
            <Text style={[stile.kategorie, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
              {kategorieName(objekt)}
            </Text>
            <Titelzeilen
              text={objekt.titel ?? objekt.bezeichnung}
              breite={265}
              groesse={GROESSE.mittel}
              maxZeilen={3}
              farbe={primaer}
            />
            <Text style={stile.ort}>{ortszeile(objekt)}</Text>
            <Preisblock
              label={preis.label}
              wert={preis.wert}
              primaer={primaer}
              akzent={akzent}
            />
          </View>
        </View>

        <View style={stile.block}>
          <AbschnittTitel text="Eckdaten" akzent={akzent} />
          <Eckdatenraster daten={eckdaten(objekt)} primaer={primaer} spalten={4} />
        </View>

        <View style={stile.block}>
          <AbschnittTitel text="Energieausweis" akzent={akzent} />
          <Eckdatenraster daten={energiedaten(objekt)} primaer={primaer} />
        </View>

        {(objektText || lageText) && (
          <View style={[stile.block, stile.spalten]}>
            {objektText && (
              <View style={stile.spalte}>
                <AbschnittTitel text="Das Objekt" akzent={akzent} />
                <Text style={stile.text}>{objektText}</Text>
              </View>
            )}
            {lageText && (
              <View style={stile.spalte}>
                <AbschnittTitel text="Lage" akzent={akzent} />
                <Text style={stile.text}>{lageText}</Text>
              </View>
            )}
          </View>
        )}

        <KiVermerk
          texteKiErzeugt={objekt.texte_ki_erzeugt}
          bilderKiBearbeitet={bildBearbeitet}
          style={{ marginTop: 14 }}
        />

        <Fusszeile branding={branding} haftung={HAFTUNG} style={stile.fuss} />
      </Page>
    </Document>
  );
}
