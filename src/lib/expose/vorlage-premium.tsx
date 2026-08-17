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
  kategorieName,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import { schriftenBereitstellen } from "./schriften";
import { FARBE, GROESSE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 3: „Bildstark, Premium" (Abschnitt 8), A4 quer.
 *
 * Das Bild traegt die Vorlage: eine randlose Titelseite ueber die volle
 * Flaeche, darunter ein Titelband, danach grosse Bildtafeln. Im Querformat
 * kommt das erst richtig zur Geltung — eine randlose Aufnahme im Kinoformat
 * statt eines hochkant beschnittenen Ausschnitts.
 *
 * Wichtig zur Umsetzung: Die Titelseite ist als Flex-Spalte gebaut, NICHT mit
 * absolut gesetzten Elementen. Der erste Versuch legte Bild und Titelband
 * absolut uebereinander — die PDF-Erzeugung nahm sie trotzdem in den
 * Seitenfluss auf, das Bild fuellte Seite eins allein, und der Titel landete
 * auf einer zweiten, sonst leeren Seite. Mit `flexGrow` fuer den Bildbereich
 * und wachsender Hoehe fuer das Band ist die Aufteilung eindeutig.
 *
 * Ohne Bilder faellt die Titelseite auf eine getoente Flaeche zurueck, statt
 * eine leere Seite zu drucken.
 */

const INHALT = 738;
/**
 * Titelseite: feste Aufteilung statt Rechnung.
 *
 * Erst hatte der Bildbereich `flexGrow` — das Bild fuellte die Seite und schob
 * das Band auf eine zweite. Dann wurde die Bandhoehe aus der Zeilenzahl
 * berechnet; die Schaetzung lag mal vier Punkt zu niedrig, mal vierzehn zu
 * hoch, und beides genuegt fuer eine ueberzaehlige Seite.
 *
 * Jetzt sind beide Hoehen fest und ergeben zusammen genau die Seite. Der Titel
 * ist auf zwei Zeilen begrenzt und passt damit immer in das Band; bleibt eine
 * Zeile uebrig, ist unten etwas mehr Luft — auf einer Titelseite kein Verlust.
 */
const SEITENHOEHE = 595;
const BAND_HOEHE = 196;
const BILD_HOEHE = SEITENHOEHE - BAND_HOEHE;
const TITELBREITE = INHALT * 0.68;

const stile = StyleSheet.create({
  titelseite: { flexDirection: "column", fontFamily: SCHRIFT.text },
  bildbereich: { position: "relative" },
  vollbild: { width: "100%", height: "100%", objectFit: "cover" },
  markeAufBild: {
    position: "absolute",
    top: 36,
    left: 52,
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.fein,
    fontWeight: 600,
    textTransform: "uppercase",
    color: FARBE.weiss,
  },
  // `width: "100%"` ist hier nicht schmueckend: Ohne die ausdrueckliche
  // Breite misst die PDF-Erzeugung den Inhalt in diesem Flex-Aufbau falsch.
  titelband: { width: "100%", height: BAND_HOEHE, paddingHorizontal: 52, paddingTop: 26 },
  bandreihe: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
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
    marginTop: 12,
  },
  titelPreisLabel: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    textAlign: "right",
  },
  titelPreis: {
    fontFamily: SCHRIFT.titel,
    fontSize: GROESSE.gross,
    fontWeight: 600,
    textAlign: "right",
    marginTop: 4,
  },

  inhalt: {
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: SCHRIFT.text,
  },
  block: { marginBottom: 16 },
  reihe: { flexDirection: "row" },
  spalteBild: { width: "58%", paddingRight: 28 },
  spalteText: { width: "42%" },
  bildreihe: { flexDirection: "row", marginHorizontal: -8 },
  bildfeld: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 8 },
  fuss: { position: "absolute", bottom: 28, left: 52, right: 52 },
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
      <Page size="A4" orientation="landscape" style={stile.titelseite}>
        <View
          style={[
            stile.bildbereich,
            { height: BILD_HOEHE },
            titelbild ? {} : { backgroundColor: primaer },
          ]}
        >
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
          <View style={stile.bandreihe}>
            <View style={{ width: "68%" }}>
              <Text style={[stile.kategorie, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
                {kategorieName(objekt)}
              </Text>
              <Titelzeilen
                text={objekt.titel ?? objekt.bezeichnung}
                breite={TITELBREITE}
                groesse={GROESSE.riesig}
                maxZeilen={2}
                farbe={FARBE.weiss}
              />
              <Text style={stile.titelOrt}>{ortszeile(objekt)}</Text>
            </View>

            <View style={{ width: "30%" }}>
              <Text style={[stile.titelPreisLabel, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
                {preis.label}
              </Text>
              <Text style={[stile.titelPreis, { color: FARBE.weiss }]}>{preis.wert}</Text>
            </View>
          </View>
        </View>
      </Page>

      <Page size="A4" orientation="landscape" style={[stile.inhalt, { color: primaer }]}>
        <View style={stile.reihe}>
          <View style={stile.spalteBild}>
            {tafel && <Bildkachel bild={tafel} hoehe={402} akzent={akzent} mitTitel />}
          </View>
          <View style={stile.spalteText}>
            <View style={stile.block}>
              <AbschnittTitel text="Das Objekt" akzent={akzent} />
              {objekt.beschreibung_objekt && (
                <Fliesstext text={objekt.beschreibung_objekt} farbe={primaer} />
              )}
            </View>
            <View>
              <AbschnittTitel text="Eckdaten" akzent={akzent} />
              <Eckdatenraster daten={eckdaten(objekt)} primaer={primaer} spalten={2} />
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

      <Page size="A4" orientation="landscape" style={[stile.inhalt, { color: primaer }]}>
        {reihe.length > 0 && (
          <View style={[stile.bildreihe, stile.block]}>
            {reihe.slice(0, 3).map((bild, i) => (
              <View key={i} style={stile.bildfeld}>
                <Bildkachel bild={bild} hoehe={196} akzent={akzent} mitTitel />
              </View>
            ))}
          </View>
        )}

        <View style={stile.reihe}>
          <View style={[stile.spalteBild, { width: "50%" }]}>
            {objekt.beschreibung_ausstattung && (
              <View style={stile.block}>
                <AbschnittTitel text="Ausstattung" akzent={akzent} />
                <Fliesstext text={objekt.beschreibung_ausstattung} farbe={primaer} />
              </View>
            )}
          </View>
          <View style={[stile.spalteText, { width: "50%" }]}>
            {objekt.beschreibung_lage && (
              <View style={stile.block}>
                <AbschnittTitel text="Lage" akzent={akzent} />
                <Fliesstext text={objekt.beschreibung_lage} farbe={primaer} />
              </View>
            )}
          </View>
        </View>

        <View style={stile.block}>
          <AbschnittTitel text="Energieausweis" akzent={akzent} />
          <Eckdatenraster daten={energiedaten(objekt)} primaer={primaer} />
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
