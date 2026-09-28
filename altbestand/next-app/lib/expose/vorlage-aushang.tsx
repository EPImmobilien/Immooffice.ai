import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { Bildkachel } from "./bausteine";
import {
  eckdaten,
  HAFTUNG,
  KI_BILDVERMERK,
  KI_TEXTVERMERK,
  kategorieName,
  kontaktzeile,
  kuerzen,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import { schriftenBereitstellen } from "./schriften";
import { FARBE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 5: „Schaufensteraushang" (Abschnitt 8), A4 oder A3.
 *
 * Wird aus einem Meter Entfernung gelesen, nicht in der Hand. Alles ist
 * deshalb eine Stufe groesser, und es steht nur das darauf, was aus der
 * Distanz erkennbar sein muss: Bild, Titel, drei Kennzahlen, Preis, Kontakt.
 * Beschreibungstexte fehlen bewusst — sie waeren aus dieser Entfernung nicht
 * lesbar und wuerden nur die Flaeche fuellen.
 *
 * Der Preis sitzt in einem vollflaechigen Band in der Hausfarbe. Auf einem
 * Aushang ist er die Angabe, die von weitem ankommen muss; ein zarter Kasten
 * wie im Exposé traegt ueber diese Entfernung nicht.
 *
 * Die Groessen skalieren mit dem Format, damit A3 kein aufgeblasenes A4 ist.
 */

export type Aushangformat = "a4" | "a3";

function stileFuer(f: number) {
  return StyleSheet.create({
    seite: {
      paddingTop: 40 * f,
      paddingBottom: 34 * f,
      paddingHorizontal: 40 * f,
      fontFamily: SCHRIFT.text,
    },
    kopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    marke: {
      fontFamily: SCHRIFT.titel,
      fontSize: 11 * f,
      fontWeight: 600,
    },
    kopfzeile: {
      fontFamily: SCHRIFT.text,
      fontSize: 9 * f,
      fontWeight: 600,
      textTransform: "uppercase",
    },
    strich: { height: 2.5 * f, marginTop: 10 * f, marginBottom: 22 * f },
    bild: { marginBottom: 24 * f },
    platzhalter: { height: 300 * f, borderRadius: 2 },
    titel: {
      fontFamily: SCHRIFT.titel,
      fontSize: 27 * f,
      fontWeight: 600,
      lineHeight: 1.14,
    },
    ort: { fontFamily: SCHRIFT.text, fontSize: 12 * f, color: FARBE.gedaempft, marginTop: 7 * f },
    kennzahlen: {
      flexDirection: "row",
      marginTop: 24 * f,
      borderTopWidth: 1,
      borderTopColor: FARBE.linie,
      paddingTop: 16 * f,
    },
    kennzahl: { flexGrow: 1, flexBasis: 0 },
    kennLabel: { fontFamily: SCHRIFT.text, fontSize: 8.5 * f, color: FARBE.gedaempft },
    kennWert: { fontFamily: SCHRIFT.titel, fontSize: 17 * f, fontWeight: 600, marginTop: 4 * f },
    preisband: {
      marginTop: 26 * f,
      paddingVertical: 18 * f,
      paddingHorizontal: 22 * f,
    },
    preisLabel: {
      fontFamily: SCHRIFT.text,
      fontSize: 9 * f,
      fontWeight: 600,
      textTransform: "uppercase",
    },
    preisWert: {
      fontFamily: SCHRIFT.titel,
      fontSize: 31 * f,
      fontWeight: 600,
      color: FARBE.weiss,
      marginTop: 4 * f,
    },
    fuss: { position: "absolute", bottom: 32 * f, left: 40 * f, right: 40 * f },
    kontakt: { fontFamily: SCHRIFT.titel, fontSize: 11 * f, fontWeight: 600 },
    klein: {
      fontFamily: SCHRIFT.text,
      fontSize: 6.5 * f,
      color: FARBE.gedaempft,
      marginTop: 6 * f,
      lineHeight: 1.4,
    },
  });
}

export function ExposeAushang({
  objekt,
  branding,
  bilder,
  format = "a4",
}: ExposeDaten & { format?: Aushangformat }) {
  schriftenBereitstellen();

  // A3 ist flaechenmaessig doppelt so gross; die Wurzel haelt die
  // Schriftgroessen im richtigen Verhaeltnis zur Flaeche.
  const f = format === "a3" ? Math.SQRT2 : 1;
  const stile = stileFuer(f);

  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const kennzahlen = eckdaten(objekt).slice(0, 3);
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);
  const primaer = branding.farbePrimaer;
  const akzent = branding.farbeAkzent;

  const kopfzeile = objekt.vermarktungsart === "miete" ? "Zu vermieten" : "Zu verkaufen";

  return (
    <Document
      title={`Aushang ${objekt.titel ?? objekt.bezeichnung}`}
      author={branding.firmenname}
      creator="ImmoOffice.ai"
      producer="ImmoOffice.ai"
    >
      <Page size={format === "a3" ? "A3" : "A4"} style={[stile.seite, { color: primaer }]}>
        <View style={stile.kopf}>
          <Text style={[stile.marke, { color: primaer }]}>{branding.firmenname}</Text>
          <Text style={[stile.kopfzeile, { color: akzent, letterSpacing: gesperrt(9 * f) }]}>
            {kopfzeile}
          </Text>
        </View>
        <View style={[stile.strich, { backgroundColor: akzent }]} />

        <View style={stile.bild}>
          {titelbild ? (
            <Bildkachel bild={titelbild} hoehe={300 * f} akzent={akzent} />
          ) : (
            <View style={[stile.platzhalter, { backgroundColor: primaer }]} />
          )}
        </View>

        {/* Zwei Zeilen sind das Maximum: Ab der dritten schiebt der Titel das
            Preisband auf eine zweite Seite, und ein zweiseitiger Aushang ist
            keiner. */}
        <Text style={stile.titel}>
          {kuerzen(objekt.titel ?? objekt.bezeichnung, 62)}
        </Text>
        <Text style={stile.ort}>
          {kategorieName(objekt)} · {ortszeile(objekt)}
        </Text>

        {kennzahlen.length > 0 && (
          <View style={stile.kennzahlen}>
            {kennzahlen.map((e) => (
              <View key={e.bezeichnung} style={stile.kennzahl}>
                <Text style={stile.kennLabel}>{e.bezeichnung}</Text>
                <Text style={[stile.kennWert, { color: primaer }]}>{e.wert}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[stile.preisband, { backgroundColor: primaer }]}>
          <Text style={[stile.preisLabel, { color: akzent, letterSpacing: gesperrt(9 * f) }]}>
            {preis.label}
          </Text>
          <Text style={stile.preisWert}>{preis.wert}</Text>
        </View>

        <View style={stile.fuss} fixed>
          <Text style={[stile.kontakt, { color: primaer }]}>{kontaktzeile(branding)}</Text>
          {(objekt.texte_ki_erzeugt || bildBearbeitet) && (
            <Text style={stile.klein}>
              {[
                objekt.texte_ki_erzeugt ? KI_TEXTVERMERK : null,
                bildBearbeitet ? KI_BILDVERMERK : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </Text>
          )}
          <Text style={stile.klein}>
            Objekt {objekt.objektnummer} · {HAFTUNG}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
