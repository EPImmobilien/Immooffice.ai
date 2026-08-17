import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

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
 * Vorlage 3: „Bildstark, Premium" (Abschnitt 8).
 *
 * Das Bild traegt die Vorlage: eine randlose Titelseite, darunter ein
 * Titelband, danach grosse Bildtafeln.
 *
 * Wichtig zur Umsetzung: Die Titelseite ist als Flex-Spalte gebaut, NICHT mit
 * absolut gesetzten Elementen. Der erste Versuch legte Bild und Titelband
 * absolut uebereinander — die PDF-Erzeugung nahm sie trotzdem in den
 * Seitenfluss auf, das Bild fuellte Seite eins allein, und der Titel landete
 * auf einer zweiten, sonst leeren Seite. Mit `flexGrow` fuer den Bildbereich
 * und fester Hoehe fuer das Band ist die Aufteilung eindeutig.
 *
 * Ohne Bilder faellt die Titelseite auf eine getoente Flaeche zurueck, statt
 * eine leere Seite zu drucken.
 */

const stile = StyleSheet.create({
  titelseite: { flexDirection: "column", fontFamily: SCHRIFT.text },
  bildbereich: { flexGrow: 1, position: "relative" },
  vollbild: { width: "100%", height: "100%", objectFit: "cover" },
  markeAufBild: {
    position: "absolute",
    top: 40,
    left: 48,
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.fein,
    fontWeight: 600,
    textTransform: "uppercase",
    color: FARBE.weiss,
  },
  // `width: "100%"` ist hier nicht schmueckend: Ohne die ausdrueckliche
  // Breite misst die PDF-Erzeugung den Titel in diesem Flex-Aufbau ohne
  // Zeilenumbruch. Das Band wird dann nur eine Zeile hoch, der Titel malt
  // aber zwei — und die Ortszeile lag mitten im Titel.
  titelband: { width: "100%", paddingHorizontal: 48, paddingTop: 30, paddingBottom: 34 },
  kategorie: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  titelOrt: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.klein,
    color: FARBE.weiss,
    opacity: 0.8,
    marginTop: 14,
  },
  titelPreis: {
    fontFamily: SCHRIFT.titel,
    fontSize: GROESSE.mittel,
    fontWeight: 600,
    marginTop: 18,
  },

  inhalt: {
    paddingTop: 48,
    paddingBottom: 66,
    paddingHorizontal: 52,
    fontFamily: SCHRIFT.text,
  },
  block: { marginBottom: ABSTAND.block },
  spalten: { flexDirection: "row", marginHorizontal: -14 },
  spalte: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 14 },
  bildreihe: { flexDirection: "row", marginHorizontal: -6 },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 6 },
  fuss: { position: "absolute", bottom: 30, left: 52, right: 52 },
});

export function ExposePremium({ objekt, branding, bilder }: ExposeDaten) {
  schriftenBereitstellen();

  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const tafel = bilder[1];
  const reihe = bilder.slice(2, 6);
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
      <Page size="A4" style={stile.titelseite}>
        <View style={[stile.bildbereich, titelbild ? {} : { backgroundColor: primaer }]}>
          {titelbild && (
            <Image
              style={stile.vollbild}
              src={{ data: titelbild.daten, format: titelbild.format }}
            />
          )}
          <Text style={[stile.markeAufBild, { letterSpacing: gesperrt(GROESSE.fein) }]}>
            {branding.firmenname}
          </Text>
        </View>

        <View style={[stile.titelband, { backgroundColor: primaer }]}>
          <Text style={[stile.kategorie, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
            {kategorieName(objekt)}
          </Text>
          <Titelzeilen
            text={objekt.titel ?? objekt.bezeichnung}
            breite={499}
            groesse={GROESSE.riesig}
            maxZeilen={3}
            farbe={FARBE.weiss}
          />
          <Text style={stile.titelOrt}>{ortszeile(objekt)}</Text>
          <Text style={[stile.titelPreis, { color: akzent }]}>
            {preis.label}: {preis.wert}
          </Text>
        </View>
      </Page>

      <Page size="A4" style={[stile.inhalt, { color: primaer }]}>
        {tafel && (
          <View style={stile.block}>
            <Bildkachel bild={tafel} hoehe={246} akzent={akzent} mitTitel />
          </View>
        )}

        <View style={stile.spalten}>
          <View style={stile.spalte}>
            <AbschnittTitel text="Das Objekt" akzent={akzent} />
            {objekt.beschreibung_objekt && (
              <Fliesstext text={objekt.beschreibung_objekt} farbe={primaer} />
            )}
          </View>
          <View style={stile.spalte}>
            <AbschnittTitel text="Eckdaten" akzent={akzent} />
            <Eckdatenraster daten={eckdaten(objekt)} primaer={primaer} spalten={2} />
          </View>
        </View>

        <Fusszeile branding={branding} haftung={HAFTUNG} style={stile.fuss} />
      </Page>

      <Page size="A4" style={[stile.inhalt, { color: primaer }]}>
        {reihe.length > 0 && (
          <View style={[stile.bildreihe, stile.block]}>
            {reihe.slice(0, 2).map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Bildkachel bild={bild} hoehe={162} akzent={akzent} mitTitel />
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

        {reihe.slice(2).length > 0 && (
          <View style={[stile.bildreihe, stile.block]}>
            {reihe.slice(2).map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Bildkachel bild={bild} hoehe={162} akzent={akzent} mitTitel />
              </View>
            ))}
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
