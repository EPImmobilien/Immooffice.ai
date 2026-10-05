// ============================================================================
// Rendern: aus Vorlage, Daten und Abweichungen werden Seiten
// ----------------------------------------------------------------------------
// Die Reihenfolge ist festgelegt und hat einen Grund:
//
//  1. Abweichungen je Objekt anwenden (ausgeblendete Seiten, getauschte
//     Bilder, ueberschriebene Texte). Sie wirken auf die Vorlage, nicht
//     umgekehrt — eine geaenderte Vorlage soll die Arbeit am Objekt nicht
//     wegwerfen.
//  2. Sichtbarkeit der Seiten pruefen. Erst DANN stehen die Seitenzahlen
//     fest. Zaehlte man vorher, stuende im Fuss "03 / 10", wo zwei Seiten
//     entfallen sind.
//  3. Seiten zeichnen, Element fuer Element, den Seitenfuss zuletzt, damit
//     er nicht von einer Flaeche verdeckt wird.
// ============================================================================

import { Blatt } from "./blatt";
import { ELEMENTE } from "./elemente";
import { vorlagePruefen } from "./pruefen";
import type { Metrik } from "./schrift";
import type { Element, Overrides, Seite, Vorlage } from "./schema";
import type { Seitenbild } from "./schritte";
import type { Marke } from "./stil";
import { paletteFuer, stilAus } from "./stil";
import type { Umgebung, Warnung } from "./umgebung";
import type { Daten } from "./werte";
import { trifftZu } from "./werte";

export type Auftrag = {
  vorlage: Vorlage;
  daten: Daten;
  schriften: Map<string, Metrik>;
  marke?: Marke;
  overrides?: Overrides;
};

export type Ergebnis = {
  seiten: Seitenbild[];
  warnungen: Warnung[];
};

export function rendern(a: Auftrag): Ergebnis {
  const { vorlage } = a;
  const palette = paletteFuer(vorlage, a.marke ?? {});
  const warnungen: Warnung[] = [];
  const daten = { ...a.daten };

  // Erst pruefen, dann zeichnen. Ein unbekannter Platzhalter oder ein
  // Textstil, den die Vorlage nicht hat, hinterlaesst im PDF nur eine
  // Luecke — und eine Luecke sucht man lange.
  for (const b of vorlagePruefen(vorlage)) {
    warnungen.push({
      art: b.schwere === "fehler" ? "unbekannt" : "fehlender_wert",
      seite: b.seite, element: b.element, text: b.text,
    });
  }

  // 1. Abweichungen je Objekt
  const aus = new Set(a.overrides?.seiten_aus ?? []);
  const texte = a.overrides?.texte ?? {};
  const bilder = a.overrides?.bilder ?? {};

  // 2. Welche Seiten erscheinen — und wie oft
  //
  // Eine Seite kann sich wiederholen: "je Grundriss eine Seite". Die
  // Vervielfachung passiert HIER und nicht beim Zeichnen, weil die
  // Seitenzahlen und das Inhaltsverzeichnis sonst die Wiederholungen
  // nicht kennen wuerden.
  const sichtbar: { seite: Seite; lauf?: { nummer: number; gesamt: number } }[] = [];
  for (const seite of vorlage.seiten) {
    if (aus.has(seite.id)) continue;
    if (!trifftZu(daten, seite.sichtbar_wenn)) continue;
    const wdh = seite.wiederholen;
    if (!wdh) { sichtbar.push({ seite }); continue; }
    const quelle = daten[wdh.feld];
    const anzahl = Array.isArray(quelle) ? quelle.length : 0;
    if (anzahl === 0) {
      warnungen.push({
        art: "fehlender_wert", seite: seite.id,
        text: `"${seite.name}" wiederholt sich je Eintrag in ${wdh.feld}, und ` +
              `dort steht nichts — die Seite entfaellt.`,
      });
      continue;
    }
    const proSeite = Math.max(1, wdh.pro_seite ?? 1);
    const seiten = Math.ceil(anzahl / proSeite);
    for (let i = 0; i < seiten; i++) {
      sichtbar.push({ seite, lauf: { nummer: i + 1, gesamt: seiten } });
    }
  }
  const gesamt = sichtbar.length;
  // Das Inhaltsverzeichnis nennt nur, was wirklich im Dokument steht.
  // Darum erst hier, nach der Sichtbarkeitspruefung.
  daten["dokument.seiten"] = sichtbar.map((s, i) => ({
    nummer: i + 1,
    name: s.lauf && s.lauf.gesamt > 1 ? `${s.seite.name} ${s.lauf.nummer}` : s.seite.name,
  }));

  // 3. Zeichnen
  const seiten: Seitenbild[] = [];
  sichtbar.forEach(({ seite, lauf }, i) => {
    const blatt = new Blatt(vorlage.format.breite, vorlage.format.hoehe, a.schriften);
    const u: Umgebung = {
      blatt, daten, palette, vorlage, warnungen,
      seite: { nummer: i + 1, gesamt, name: seite.name, id: seite.id },
      stil: (name: string) => stilAus(vorlage, name, palette),
    };
    // Seitenbezogene Platzhalter. Sie stehen in den Daten, damit kein
    // Element eine Sonderbehandlung braucht.
    daten["seite.nummer"] = i + 1;
    daten["seite.gesamt"] = gesamt;
    daten["seite.name"] = seite.name;
    daten["seite.nummer_zweistellig"] = String(i + 1).padStart(2, "0");
    daten["seite.gesamt_zweistellig"] = String(gesamt).padStart(2, "0");
    // Bei einer wiederholten Seite sagt der Lauf, der wievielte Durchgang
    // es ist. Elemente binden ihre Bildslots daran: {{lauf.nummer}}.
    daten["lauf.nummer"] = lauf ? lauf.nummer : 1;
    daten["lauf.gesamt"] = lauf ? lauf.gesamt : 1;

    if (seite.hintergrund) hintergrundZeichnen(u, seite);

    for (const roh of seite.elemente) {
      const el = mitOverride(roh, texte, bilder);
      zeichneElement(u, el);
    }

    if (!seite.ohne_fuss && vorlage.stil.seitenfuss) {
      for (const el of vorlage.stil.seitenfuss.elemente) zeichneElement(u, el);
    }

    for (const [schnitt, zeichen] of blatt.fehlend) {
      warnungen.push({
        art: "fehlendes_zeichen", seite: seite.id,
        text: `Die Schrift ${schnitt} hat diese Zeichen nicht: ` +
              `${Array.from(zeichen).join(" ")}. Sie fehlen im PDF.`,
      });
    }

    seiten.push({
      breite: vorlage.format.breite,
      hoehe: vorlage.format.hoehe,
      schritte: blatt.schritte,
      id: seite.id,
      name: u.seite.name,
    });
  });

  return { seiten, warnungen };
}

function zeichneElement(u: Umgebung, el: Element): void {
  if (!trifftZu(u.daten, el.sichtbar_wenn)) return;
  const zeichner = ELEMENTE[el.typ];
  if (!zeichner) {
    u.warnungen.push({
      art: "unbekannt", seite: u.seite.id, element: el.id,
      text: `Der Elementtyp "${el.typ}" ist dem Renderer nicht bekannt. ` +
            `Das Element wird nicht gezeichnet.`,
    });
    return;
  }
  try {
    zeichner(el, u);
  } catch (grund) {
    u.warnungen.push({
      art: "unbekannt", seite: u.seite.id, element: el.id,
      text: `${el.typ} liess sich nicht zeichnen: ` +
            `${grund instanceof Error ? grund.message : String(grund)}`,
    });
  }
}

/**
 * Setzt die Abweichungen eines Objekts in das Element ein. Verwaiste
 * Eintraege (Element gibt es nicht mehr) bleiben unberuehrt stehen — sie
 * zu loeschen ist eine Entscheidung des Nutzers, nicht des Renderers.
 */
function mitOverride(el: Element, texte: Record<string, string>,
                     bilder: Record<string, unknown>): Element {
  const t = texte[el.id];
  const b = bilder[el.id];
  if (t === undefined && b === undefined) return el;
  const neu: Element = { ...el };
  if (t !== undefined) neu["inhalt"] = t;
  if (b !== undefined) neu["slot"] = b;
  return neu;
}

function hintergrundZeichnen(u: Umgebung, seite: Seite): void {
  const f = seite.hintergrund!;
  const b = u.vorlage.format.breite;
  const h = u.vorlage.format.hoehe;
  const el: Element = {
    id: `${seite.id}-hintergrund`, typ: "form", x: 0, y: 0, b, h,
  } as Element;
  if (f.art === "farbe") {
    (el as Record<string, unknown>)["form"] = "rechteck";
    (el as Record<string, unknown>)["fuell"] = f.farbe;
  } else if (f.art === "verlauf") {
    (el as Record<string, unknown>)["form"] = "rechteck";
    (el as Record<string, unknown>)["verlauf"] =
      { von: f.von, nach: f.nach, richtung: f.richtung };
  } else if (f.art === "bild" || f.art === "asset") {
    (el as Record<string, unknown>)["typ"] = "bild";
    (el as Record<string, unknown>)["slot"] =
      f.art === "bild" ? f.slot : { art: "asset", pfad: f.pfad };
    (el as Record<string, unknown>)["fuellmodus"] =
      f.art === "bild" ? (f.fuellmodus ?? "cover") : "cover";
  }
  zeichneElement(u, el);
}
