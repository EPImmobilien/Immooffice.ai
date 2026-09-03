import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { Abschnitt, Briefkopf, Dokument } from "./struktur";

/**
 * Dokument-PDF mit Briefkopf des Mandanten. Schrift: Helvetica (im Renderer
 * enthalten), damit Vertraege auch ohne die Exposé-Schriften entstehen.
 */
const stil = StyleSheet.create({
  seite: { paddingTop: 56, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10, fontFamily: "Helvetica", color: "#1B2A47", lineHeight: 1.45 },
  kopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#E6E8EB" },
  kopfText: { fontSize: 8.5, color: "#7A828C", lineHeight: 1.35 },
  kopfFirma: { fontSize: 10, color: "#1B2A47", fontFamily: "Helvetica-Bold" },
  logo: { maxHeight: 34, maxWidth: 140, objectFit: "contain" },
  titel: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  untertitel: { fontSize: 10, color: "#7A828C", marginBottom: 16 },
  ueberschrift: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  absatz: { marginBottom: 5 },
  tabelle: { marginTop: 4, marginBottom: 6, borderWidth: 1, borderColor: "#E6E8EB" },
  zeile: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E6E8EB" },
  zelle: { flex: 1, paddingVertical: 3, paddingHorizontal: 5, fontSize: 9 },
  kopfzelle: { flex: 1, paddingVertical: 3, paddingHorizontal: 5, fontSize: 8.5, fontFamily: "Helvetica-Bold", backgroundColor: "#FAFAFA" },
  unterschriften: { flexDirection: "row", gap: 24, marginTop: 18 },
  feld: { flex: 1 },
  unterschriftBild: { height: 44, objectFit: "contain", objectPositionX: 0 },
  linie: { borderTopWidth: 1, borderTopColor: "#1B2A47", marginTop: 40, paddingTop: 3, fontSize: 8.5, color: "#7A828C" },
  fuss: { position: "absolute", left: 56, right: 56, bottom: 28, fontSize: 7.5, color: "#7A828C", borderTopWidth: 1, borderTopColor: "#E6E8EB", paddingTop: 5 },
});

function AbschnittAnsicht({ a }: { a: Abschnitt }) {
  return (
    <View break={a.neueSeite ?? false}>
      {a.ueberschrift && <Text style={stil.ueberschrift}>{a.ueberschrift}</Text>}
      {(a.absaetze ?? []).map((t, i) => (
        <Text key={i} style={stil.absatz}>{t === "" ? " " : t}</Text>
      ))}
      {a.tabelle && a.tabelle.zeilen.length > 0 && (
        <View style={stil.tabelle}>
          <View style={stil.zeile}>
            {a.tabelle.spalten.map((s, i) => <Text key={i} style={stil.kopfzelle}>{s}</Text>)}
          </View>
          {a.tabelle.zeilen.map((z, i) => (
            <View key={i} style={stil.zeile} wrap={false}>
              {z.map((w, j) => <Text key={j} style={stil.zelle}>{w}</Text>)}
            </View>
          ))}
        </View>
      )}
      {a.unterschriften && (
        <View style={stil.unterschriften} wrap={false}>
          {a.unterschriften.map((u, i) => (
            <View key={i} style={stil.feld}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf kennt kein alt */}
              {u.bild ? <Image src={u.bild} style={stil.unterschriftBild} /> : <View style={{ height: 44 }} />}
              <Text style={stil.linie}>{u.bezeichnung}{u.name ? ` — ${u.name}` : ""}{u.zeit ? ` · ${new Date(u.zeit).toLocaleString("de-DE")}` : ""}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function DokumentPdf({ dokument, kopf }: { dokument: Dokument; kopf: Briefkopf }) {
  return (
    <Document title={dokument.titel} author={kopf.firmenname} creator="ImmoOffice.ai">
      <Page size="A4" style={stil.seite}>
        <View style={stil.kopf} fixed>
          <View>
            <Text style={stil.kopfFirma}>{kopf.firmenname}</Text>
            {kopf.zeile2 ? <Text style={stil.kopfText}>{kopf.zeile2}</Text> : null}
            {kopf.zeile3 ? <Text style={stil.kopfText}>{kopf.zeile3}</Text> : null}
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf kennt kein alt */}
          {kopf.logo ? <Image src={kopf.logo} style={stil.logo} /> : null}
        </View>
        <Text style={stil.titel}>{dokument.titel}</Text>
        {dokument.untertitel ? <Text style={stil.untertitel}>{dokument.untertitel}</Text> : null}
        {dokument.abschnitte.map((a, i) => <AbschnittAnsicht key={i} a={a} />)}
        <Text style={stil.fuss} fixed render={({ pageNumber, totalPages }) => `${dokument.fussnote ? `${dokument.fussnote} · ` : ""}Seite ${pageNumber} von ${totalPages} · erstellt mit ImmoOffice.ai`} />
      </Page>
    </Document>
  );
}
