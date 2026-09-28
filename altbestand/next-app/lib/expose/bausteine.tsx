import type { Style } from "@react-pdf/types";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

import { umbrechen } from "@/lib/textumbruch";

import { ABSTAND, FARBE, GROESSE, SCHRIFT, gesperrt } from "./stil";
import type { ExposeBild, ExposeBranding } from "./typen";
import { KI_BILDVERMERK, KI_TEXTVERMERK, type Eckdatum } from "./gemeinsam";

/**
 * Wiederverwendbare Bausteine der Exposé-Vorlagen.
 *
 * Kopf, Fuss, Preisblock, Eckdaten und Bildkacheln sehen in allen fuenf
 * Vorlagen gleich aus. Vorher hatte jede Vorlage ihre eigene Fassung davon —
 * mit dem Ergebnis, dass sich Abstaende und Groessen unbemerkt auseinander
 * entwickelten und die Kennzeichnung KI-bearbeiteter Bilder in der einen
 * Vorlage anders aussah als in der naechsten.
 */

const stile = StyleSheet.create({
  kopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  firma: { fontFamily: SCHRIFT.titel, fontSize: GROESSE.klein, fontWeight: 600 },
  // Hoehe fest, Breite begrenzt: Ein hochkantes Logo wuerde den Kopfbereich
  // sonst in die Hoehe treiben und die Seitenaufteilung verschieben.
  logo: { height: 22, maxWidth: 150, objectFit: "contain" as const },
  anschrift: { fontFamily: SCHRIFT.text, fontSize: GROESSE.winzig, color: FARBE.gedaempft, marginTop: 2 },
  kennung: { fontFamily: SCHRIFT.text, fontSize: GROESSE.winzig, color: FARBE.gedaempft },

  // Die Linie unter dem Kopf traegt das Gold: ein kurzes kraeftiges Stueck,
  // danach ein Haarstrich. Eine durchgehende goldene Linie waere zu laut,
  // gar kein Gold laesst das Dokument farblos wirken.
  linieAussen: { flexDirection: "row", marginTop: 9 },
  linieAkzent: { width: 38, height: 2 },
  linieRest: { flexGrow: 1, height: 2, backgroundColor: FARBE.linie },

  abschnitt: { marginBottom: ABSTAND.block },
  abschnittTitel: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  absatz: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.text,
    lineHeight: 1.62,
    textAlign: "left",
  },

  preisblock: { flexDirection: "row", alignItems: "stretch" },
  preisbalken: { width: 4 },
  preisinhalt: { flexGrow: 1, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: FARBE.flaeche },
  preisLabel: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  preisWert: { fontFamily: SCHRIFT.titel, fontSize: GROESSE.gross, fontWeight: 600, marginTop: 3 },

  raster: { flexDirection: "row", flexWrap: "wrap" },
  zelle: { width: "33.33%", borderTopWidth: 1, borderTopColor: FARBE.linie, paddingTop: 6, paddingBottom: 10, paddingRight: 10 },
  zelleLabel: { fontFamily: SCHRIFT.text, fontSize: GROESSE.winzig, color: FARBE.gedaempft },
  zelleWert: { fontFamily: SCHRIFT.titel, fontSize: GROESSE.klein, fontWeight: 600, marginTop: 3 },

  bildRahmen: { position: "relative" },
  bild: { width: "100%", objectFit: "cover" },
  marke: {
    position: "absolute",
    bottom: 7,
    right: 7,
    paddingVertical: 2.5,
    paddingHorizontal: 5,
    borderRadius: 2,
  },
  markeText: {
    fontFamily: SCHRIFT.text,
    fontSize: GROESSE.winzig * 0.85,
    fontWeight: 600,
    textTransform: "uppercase",
    color: FARBE.weiss,
  },
  bildTitel: { fontFamily: SCHRIFT.text, fontSize: GROESSE.winzig, color: FARBE.gedaempft, marginTop: 4 },

  fuss: { borderTopWidth: 1, borderTopColor: FARBE.linie, paddingTop: 7 },
  fussZeile: { fontFamily: SCHRIFT.text, fontSize: GROESSE.winzig, color: FARBE.gedaempft, lineHeight: 1.5 },
});

export function Kopfzeile({
  branding,
  objektnummer,
  primaer,
  akzent,
}: {
  branding: ExposeBranding;
  objektnummer: string;
  primaer: string;
  akzent: string;
}) {
  const anschrift = [branding.strasse, [branding.plz, branding.ort].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <View>
      <View style={stile.kopf}>
        <View>
          {/* Logo, wenn hinterlegt — sonst die Wortmarke aus dem Firmennamen.
              Feste Hoehe und `objectFit: "contain"`: Ein Logo kommt in jedem
              Seitenverhaeltnis, und ohne diese Vorgabe verzerrt es oder sprengt
              den Kopfbereich. */}
          {branding.logo ? (
            <Image
              style={stile.logo}
              src={{ data: branding.logo.daten, format: branding.logo.format }}
            />
          ) : (
            <Text style={[stile.firma, { color: primaer }]}>{branding.firmenname}</Text>
          )}
          {anschrift !== "" && <Text style={stile.anschrift}>{anschrift}</Text>}
        </View>
        <Text style={stile.kennung}>Objekt {objektnummer}</Text>
      </View>
      <View style={stile.linieAussen}>
        <View style={[stile.linieAkzent, { backgroundColor: akzent }]} />
        <View style={stile.linieRest} />
      </View>
    </View>
  );
}

export function AbschnittTitel({ text, akzent }: { text: string; akzent: string }) {
  return (
    <Text style={[stile.abschnittTitel, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
      {text}
    </Text>
  );
}

export function Abschnitt({
  titel,
  akzent,
  children,
  style,
}: {
  titel: string;
  akzent: string;
  children: React.ReactNode;
  style?: Style;
}) {
  return (
    <View style={[stile.abschnitt, style ?? {}]} wrap={false}>
      <AbschnittTitel text={titel} akzent={akzent} />
      {children}
    </View>
  );
}

export function Fliesstext({ text, farbe }: { text: string; farbe: string }) {
  return <Text style={[stile.absatz, { color: farbe }]}>{text}</Text>;
}

export function Preisblock({
  label,
  wert,
  primaer,
  akzent,
}: {
  label: string;
  wert: string;
  primaer: string;
  akzent: string;
}) {
  return (
    <View style={stile.preisblock}>
      <View style={[stile.preisbalken, { backgroundColor: akzent }]} />
      <View style={stile.preisinhalt}>
        <Text style={[stile.preisLabel, { color: akzent, letterSpacing: gesperrt(GROESSE.winzig) }]}>
          {label}
        </Text>
        <Text style={[stile.preisWert, { color: primaer }]}>{wert}</Text>
      </View>
    </View>
  );
}

/** Eckdaten als Raster mit Haarlinien — bewusst wie ein Datenblatt. */
export function Eckdatenraster({
  daten,
  primaer,
  spalten = 3,
}: {
  daten: Eckdatum[];
  primaer: string;
  spalten?: number;
}) {
  if (daten.length === 0) return null;
  const breite = `${(100 / spalten).toFixed(2)}%`;

  return (
    <View style={stile.raster}>
      {daten.map((e) => (
        <View key={e.bezeichnung} style={[stile.zelle, { width: breite }]}>
          <Text style={stile.zelleLabel}>{e.bezeichnung}</Text>
          <Text style={[stile.zelleWert, { color: primaer }]}>{e.wert}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Bild mit Kennzeichnung.
 *
 * Die Kennzeichnung KI-bearbeiteter Bilder sitzt AUF dem Bild und nicht in
 * einer Fussnote (Abschnitt 11). Eine Fussnote am Seitenende laesst sich beim
 * Betrachten uebersehen; hier steht sie da, wo das Bild ist.
 */
export function Bildkachel({
  bild,
  hoehe,
  akzent,
  mitTitel = false,
}: {
  bild: ExposeBild;
  hoehe: number;
  akzent: string;
  mitTitel?: boolean;
}) {
  return (
    <View>
      <View style={stile.bildRahmen}>
        <Image style={[stile.bild, { height: hoehe }]} src={{ data: bild.daten, format: bild.format }} />
        {bild.kiBearbeitet && (
          <View style={[stile.marke, { backgroundColor: akzent }]}>
            <Text style={[stile.markeText, { letterSpacing: gesperrt(GROESSE.winzig * 0.85) }]}>
              KI-bearbeitet
            </Text>
          </View>
        )}
      </View>
      {mitTitel && bild.titel && <Text style={stile.bildTitel}>{bild.titel}</Text>}
    </View>
  );
}

/**
 * Fusszeile mit Kontakt, Haftungshinweis und KI-Vermerk.
 *
 * Der KI-Vermerk steht hier und nicht im Seitenfluss. Zwei Gruende: Er
 * gehoert zu den Hinweisen, nicht zum Inhalt — und im Fluss war er die
 * Ursache dafuer, dass Seiten um wenige Punkte uebergelaufen sind und eine
 * fast leere Folgeseite entstand. In der festen Fusszeile kann er das nicht
 * mehr und erscheint zugleich auf jeder Seite.
 *
 * Die Kennzeichnung KI-bearbeiteter Bilder traegt zusaetzlich jede
 * Bildkachel als Marke (Abschnitt 11).
 */
export function Fusszeile({
  branding,
  haftung,
  kiTexte = false,
  kiBilder = false,
  style,
}: {
  branding: ExposeBranding;
  haftung: string;
  kiTexte?: boolean;
  kiBilder?: boolean;
  style?: Style;
}) {
  const kontakt = [branding.firmenname, branding.telefon, branding.email, branding.web]
    .filter(Boolean)
    .join(" · ");

  const hinweise = [
    kiTexte ? KI_TEXTVERMERK : null,
    kiBilder ? KI_BILDVERMERK : null,
    haftung,
  ].filter(Boolean) as string[];

  return (
    <View style={[stile.fuss, style ?? {}]} fixed>
      <Text style={stile.fussZeile}>{kontakt}</Text>
      {hinweise.map((zeile, i) => (
        <Text key={i} style={[stile.fussZeile, { marginTop: 2 }]}>
          {zeile}
        </Text>
      ))}
    </View>
  );
}

/**
 * Mehrzeiliger Titel mit selbst bestimmtem Umbruch.
 *
 * Warum nicht einfach ein `<Text>`? Weil die PDF-Erzeugung die Hoehe eines
 * umbrechenden Textes in manchen Flex-Aufbauten mit einer Zeile zu wenig
 * ansetzt. Auf der Premium-Titelseite lag die Ortszeile dadurch mitten im
 * Titel. Eine Zeile je `<Text>` misst dagegen immer richtig — und der Umbruch
 * bleibt nachvollziehbar, statt vom Zufall des Aufbaus abzuhaengen.
 *
 * Eine feste `height` je Zeile waere der naheliegende Weg gewesen und blieb
 * leer: Die PDF-Erzeugung zeichnet den Text dann gar nicht mehr. Noetig ist
 * sie auch nicht — eine einzelne Zeile misst die Engine richtig.
 *
 * Der Zeilenabstand von 1,3 ist die Untergrenze: Bei 1,16 stiessen deutsche
 * Umlaute der Folgezeile an die Oberlaengen der vorigen.
 */
export function Titelzeilen({
  text,
  breite,
  groesse,
  maxZeilen = 3,
  farbe,
  zeilenhoehe = 1.3,
}: {
  text: string;
  breite: number;
  groesse: number;
  maxZeilen?: number;
  farbe: string;
  zeilenhoehe?: number;
}) {
  const zeilen = umbrechen(text, breite, groesse, maxZeilen);

  return (
    <View>
      {zeilen.map((zeile, i) => (
        <Text
          key={i}
          style={{
            fontFamily: SCHRIFT.titel,
            fontSize: groesse,
            fontWeight: 600,
            color: farbe,
            // Der Abstand steht als Rand zwischen den Zeilen, nicht als
            // `lineHeight`: Bei einem einzeiligen Textelement wirkt sich
            // `lineHeight` nicht auf die Aussenhoehe aus, die Zeilen ruecken
            // dann aufeinander.
            marginBottom: i < zeilen.length - 1 ? groesse * (zeilenhoehe - 1) : 0,
          }}
        >
          {zeile}
        </Text>
      ))}
    </View>
  );
}
