import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  eckdaten,
  HAFTUNG,
  KiVermerk,
  kategorieName,
  kuerzen,
  kontaktzeile,
  ortszeile,
  preisAngabe,
} from "./gemeinsam";
import type { ExposeDaten } from "./typen";

/**
 * Vorlage 5: „Schaufensteraushang“ (Abschnitt 8), A4 oder A3.
 *
 * Wird aus einem Meter Entfernung gelesen, nicht in der Hand. Alles ist
 * deshalb eine Stufe groesser, und es steht nur das darauf, was aus der
 * Distanz erkennbar sein muss: Bild, Titel, drei Kennzahlen, Preis, Kontakt.
 * Beschreibungstexte fehlen bewusst — sie waeren aus dieser Entfernung nicht
 * lesbar und wuerden nur die Flaeche fuellen.
 *
 * Die Groessen skalieren mit dem Format, damit A3 kein aufgeblasenes A4 ist.
 */

export type Aushangformat = "a4" | "a3";

function stileFuer(faktor: number) {
  return StyleSheet.create({
    seite: {
      paddingTop: 34 * faktor,
      paddingBottom: 30 * faktor,
      paddingHorizontal: 34 * faktor,
      color: "#1B2A47",
      fontFamily: "Helvetica",
    },
    marke: {
      fontSize: 10 * faktor,
      letterSpacing: 2 * faktor,
      textTransform: "uppercase",
      marginBottom: 10 * faktor,
    },
    kopfzeile: {
      fontSize: 13 * faktor,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.2 * faktor,
      textTransform: "uppercase",
      marginBottom: 14 * faktor,
    },
    bild: {
      width: "100%",
      height: 300 * faktor,
      objectFit: "cover",
      marginBottom: 20 * faktor,
    },
    titel: {
      fontSize: 26 * faktor,
      fontFamily: "Helvetica-Bold",
      lineHeight: 1.16,
    },
    ort: { fontSize: 13 * faktor, color: "#7A828C", marginTop: 6 * faktor },
    kennzahlen: {
      flexDirection: "row",
      marginTop: 22 * faktor,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: "#E6E8EB",
      paddingVertical: 14 * faktor,
    },
    kennzahl: { flexGrow: 1, flexBasis: 0 },
    kennLabel: {
      fontSize: 9 * faktor,
      letterSpacing: 0.8 * faktor,
      textTransform: "uppercase",
      color: "#7A828C",
    },
    kennWert: {
      fontSize: 18 * faktor,
      fontFamily: "Helvetica-Bold",
      marginTop: 4 * faktor,
    },
    preisband: {
      marginTop: 24 * faktor,
      paddingVertical: 16 * faktor,
      paddingHorizontal: 20 * faktor,
      borderLeftWidth: 6 * faktor,
    },
    preisLabel: {
      fontSize: 10 * faktor,
      letterSpacing: 1 * faktor,
      textTransform: "uppercase",
      color: "#7A828C",
    },
    preisWert: {
      fontSize: 32 * faktor,
      fontFamily: "Helvetica-Bold",
      marginTop: 4 * faktor,
    },
    fuss: {
      position: "absolute",
      bottom: 30 * faktor,
      left: 34 * faktor,
      right: 34 * faktor,
    },
    kontakt: {
      fontSize: 12 * faktor,
      fontFamily: "Helvetica-Bold",
    },
    klein: {
      fontSize: 7 * faktor,
      color: "#7A828C",
      marginTop: 5 * faktor,
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
  // A3 ist flaechenmaessig doppelt so gross; die Wurzel haelt die
  // Schriftgroessen im richtigen Verhaeltnis zur Flaeche.
  const faktor = format === "a3" ? Math.SQRT2 : 1;
  const stile = stileFuer(faktor);

  const preis = preisAngabe(objekt);
  const titelbild = bilder[0];
  const kennzahlen = eckdaten(objekt).slice(0, 3);
  const bildBearbeitet = bilder.some((b) => b.kiBearbeitet);

  const kopfzeile = objekt.vermarktungsart === "miete" ? "Zu vermieten" : "Zu verkaufen";

  return (
    <Document
      title={`Aushang ${objekt.titel ?? objekt.bezeichnung}`}
      author={branding.firmenname}
      creator="ImmoOffice.ai"
      producer="ImmoOffice.ai"
    >
      <Page size={format === "a3" ? "A3" : "A4"} style={stile.seite}>
        <Text style={[stile.marke, { color: branding.farbePrimaer }]}>
          {branding.firmenname}
        </Text>
        <Text style={[stile.kopfzeile, { color: branding.farbeAkzent }]}>
          {kopfzeile}
        </Text>

        {titelbild ? (
          <Image
            style={stile.bild}
            src={{ data: titelbild.daten, format: titelbild.format }}
          />
        ) : (
          <View style={[stile.bild, { backgroundColor: branding.farbePrimaer }]} />
        )}

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
                <Text style={stile.kennWert}>{e.wert}</Text>
              </View>
            ))}
          </View>
        )}

        <View
          style={[
            stile.preisband,
            { borderLeftColor: branding.farbeAkzent, backgroundColor: "#FAFAFA" },
          ]}
        >
          <Text style={stile.preisLabel}>{preis.label}</Text>
          <Text style={[stile.preisWert, { color: branding.farbePrimaer }]}>
            {preis.wert}
          </Text>
        </View>

        <View style={stile.fuss} fixed>
          <Text style={[stile.kontakt, { color: branding.farbePrimaer }]}>
            {kontaktzeile(branding)}
          </Text>
          <KiVermerk
            texteKiErzeugt={objekt.texte_ki_erzeugt}
            bilderKiBearbeitet={bildBearbeitet}
            style={{ fontSize: 7 * faktor }}
          />
          <Text style={stile.klein}>
            Objekt {objekt.objektnummer} · {HAFTUNG}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
