import type { Dokument } from "@/lib/dokument/struktur";

import { berechnen, m2, teilAnrechenbar, teilGrundflaeche, TEILART, type Wohnflaechenblatt } from "./wohnflaeche";

/** Wohnflaechenberechnung als Dokument (PDF/Word) — je Geschoss eine Tabelle, Summen, Rechtsgrundlage. */
export function wohnflaecheAlsDokument(blatt: Wohnflaechenblatt, datum: string, ersteller: string): Dokument {
  const e = berechnen(blatt);
  const dok: Dokument = {
    titel: "Wohnflächenberechnung",
    ...([blatt.bezeichnung, blatt.adresse].filter(Boolean).length > 0 ? { untertitel: [blatt.bezeichnung, blatt.adresse].filter(Boolean).join(" · ") } : {}),
    abschnitte: [
      { ueberschrift: "Grundlage", absaetze: [`Berechnung nach der Wohnflächenverordnung (WoFlV): Grundflächen nach lichten Maßen (§ 3 Abs. 4). Anrechnung nach § 4: lichte Höhe ab 2 m voll, 1 m bis unter 2 m zur Hälfte, unter 1 m nicht; unbeheizte Wintergärten und Schwimmbäder zur Hälfte; Balkone, Loggien, Dachgärten und Terrassen in der Regel zu einem Viertel, höchstens zur Hälfte. Zubehörräume (§ 2 Abs. 3) zählen nicht zur Wohnfläche.`, `Stand: ${datum} · erstellt von ${ersteller}`] },
    ],
    fussnote: "Die Berechnung beruht auf den eingetragenen Maßen. Für eine verbindliche Aussage ist ein Aufmaß vor Ort durch einen Sachverständigen erforderlich.",
  };
  for (const g of blatt.geschosse) {
    const ergG = e.geschosse.find((x) => x.id === g.id);
    const zeilen: string[][] = [];
    for (const r of g.raeume) {
      const ergR = ergG?.raeume.find((x) => x.id === r.id);
      for (const [i, t] of r.teile.entries()) {
        const mass = t.laenge !== null && t.breite !== null ? `${t.laenge.toLocaleString("de-DE")} × ${t.breite.toLocaleString("de-DE")}` : "direkt";
        zeilen.push([i === 0 ? r.name : "", t.bezeichnung || (i === 0 ? "" : `Teil ${i + 1}`), mass, m2(teilGrundflaeche(t)), `${TEILART[t.art].faktor * 100} %${t.abzug ? " (Abzug)" : ""}`, m2(teilAnrechenbar(t))]);
      }
      zeilen.push(["", `Summe ${r.name}`, "", m2(ergR?.grundflaeche ?? 0), "", m2(ergR?.wohnflaeche ?? 0)]);
    }
    dok.abschnitte.push({ ueberschrift: `${g.name} — ${m2(ergG?.wohnflaeche ?? 0)}`, tabelle: { spalten: ["Raum", "Teilfläche", "Maße (m)", "Grundfläche", "Anrechnung", "Wohnfläche"], zeilen } });
  }
  dok.abschnitte.push({ ueberschrift: "Ergebnis", absaetze: [`Gesamte Grundfläche: ${m2(e.grundflaeche)}`, `Wohnfläche nach WoFlV: ${m2(e.wohnflaeche)}`, ...(blatt.hinweis ? [blatt.hinweis] : [])] });
  return dok;
}
