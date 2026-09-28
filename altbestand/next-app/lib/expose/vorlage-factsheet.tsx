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
  kategorieName,
  kuerzen,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import { schriftenBereitstellen } from "./schriften";
import { FARBE, GROESSE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 4: „Kurzexposé / Factsheet" (Abschnitt 8), A4 quer.
 *
 * Genau eine Seite — das ist die Eigenschaft, die diese Vorlage ausmacht.
 * Deshalb werden die Texte hier hart begrenzt statt umbrochen: Ein Factsheet,
 * das auf Seite zwei laeuft, ist kein Factsheet mehr. Gekuerzt wird sichtbar
 * mit Auslassung, damit niemand einen abgeschnittenen Satz fuer den ganzen
 * Text haelt.
 *
 * Im Querformat passt neben ein grosses Bild eine vollstaendige Datenspalte —
 * hochkant musste dafuer das Bild klein bleiben.
 */

const INHALT = 762;

const stile = StyleSheet.create({
  seite: {
    paddingTop: 38,
    paddingBottom: 62,
    paddingHorizontal: 40,
    fontFamily: SCHRIFT.text,
  },
  oben: { flexDirection: "row", marginTop: 20 },
  spalteBild: { width: "50%", paddingRight: 24 },
  spalteText: { width: "50%" },
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
    marginBottom: 14,
  },
  platzhalter: { height: 288, borderRadius: 2 },
  block: { marginTop: 14 },
  spalten: { flexDirection: "row", marginHorizontal: -12, marginTop: 16 },
  spalte: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 12 },
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

  // Die Grenzen sind knapper als hochkant: Im Querformat stehen nur 495 Punkt
  // Hoehe zur Verfuegung, hochkant waren es rund 700. Ein Kurzexposé auf zwei
  // Seiten waere keines mehr, also weichen die Texte.
  const objektText = kuerzen(objekt.beschreibung_objekt, 300);
  const ausstattungText = kuerzen(objekt.beschreibung_ausstattung, 220);
  const lageText = kuerzen(objekt.beschreibung_lage, 220);

  return (
    <Document
      title={`Kurzexposé ${objekt.titel ?? objekt.bezeichnung}`}
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

        <View style={stile.oben}>
          <View style={stile.spalteBild}>
            {titelbild ? (
              <Bildkachel bild={titelbild} hoehe={288} akzent={akzent} />
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
              breite={INHALT * 0.5}
              groesse={GROESSE.mittel}
              maxZeilen={2}
              farbe={primaer}
            />
            <Text style={stile.ort}>{ortszeile(objekt)}</Text>

            <Preisblock
              label={preis.label}
              wert={preis.wert}
              primaer={primaer}
              akzent={akzent}
            />

            <View style={stile.block}>
              <AbschnittTitel text="Eckdaten" akzent={akzent} />
              <Eckdatenraster daten={eckdaten(objekt)} primaer={primaer} spalten={4} />
            </View>
          </View>
        </View>

        <View style={stile.spalten}>
            {objektText && (
              <View style={stile.spalte}>
                <AbschnittTitel text="Das Objekt" akzent={akzent} />
                <Text style={stile.text}>{objektText}</Text>
              </View>
            )}
            {ausstattungText && (
              <View style={stile.spalte}>
                <AbschnittTitel text="Ausstattung" akzent={akzent} />
                <Text style={stile.text}>{ausstattungText}</Text>
              </View>
            )}
            {lageText && (
              <View style={stile.spalte}>
                <AbschnittTitel text="Lage" akzent={akzent} />
                <Text style={stile.text}>{lageText}</Text>
              </View>
            )}
            {/* Der Energieausweis steht in derselben Zeile wie die Texte.
                In der rechten Spalte oben passte er nur, solange die Texte
                kurz blieben — und die Vorlage muss auch mit langen tragen. */}
            <View style={stile.spalte}>
              <AbschnittTitel text="Energieausweis" akzent={akzent} />
              {/* Zwei Spalten statt drei Zeilen: Untereinander war der Block
                  hoeher als die Textspalten daneben und liess die Seite um
                  wenige Punkte ueberlaufen. */}
              <Eckdatenraster daten={energiedaten(objekt)} primaer={primaer} spalten={2} />
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
