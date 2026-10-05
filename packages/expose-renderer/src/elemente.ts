// ============================================================================
// Die Elementtypen des Baukastens
// ----------------------------------------------------------------------------
// Jeder Typ ist eine Funktion, die ein Element der Vorlage in
// Zeichenschritte umsetzt. Die Masse stehen in der Vorlage, nicht hier —
// hier steht, wie aus Masszahlen und Daten eine Seite wird.
//
// Zwei Regeln gelten durchgehend:
//
//   Der Rahmen ist (x, y, b, h), Ursprung unten links. Ein Text haengt
//   nicht am Rahmen, sondern an seiner GRUNDLINIE, und die liegt auf der
//   Oberkante des Rahmens: grundlinie = y + h. So steht in der Vorlage
//   dieselbe Zahl, die die Prototypen an T() uebergeben, und der Editor
//   hat trotzdem einen Rahmen zum Anfassen.
//
//   Ein fehlender Wert laesst die Zeile oder das Element entfallen. Kein
//   "null", kein leeres Label, keine Null-Flaeche. Dass etwas entfallen
//   ist, steht in den Warnungen.
// ============================================================================

import type { Element, ElementTyp } from "./schema";
import type { Umgebung } from "./umgebung";
import { ankerArt, ankerX, warne } from "./umgebung";
import { farbe } from "./stil";
import type { FarbRef } from "./schema";
import { satzRegeln } from "./stil";
import { ersetze, liste, wert, zahlDe } from "./werte";
import type { PfadSchritt, RGBA } from "./schritte";
import { verdichten } from "./text";

type Zeichner = (el: Element, u: Umgebung) => void;

// ------------------------------------------------------------------ Hilfen

function zahl(el: Element, name: string, vorgabe: number): number {
  const v = el[name];
  return typeof v === "number" ? v : vorgabe;
}

function zeichenkette(el: Element, name: string): string | undefined {
  const v = el[name];
  return typeof v === "string" ? v : undefined;
}

function wahr(el: Element, name: string, vorgabe = false): boolean {
  const v = el[name];
  return typeof v === "boolean" ? v : vorgabe;
}

function farbRef(el: Element, name: string, u: Umgebung, deckkraft = 1): RGBA | null {
  const v = el[name];
  if (v === undefined || v === null) return null;
  return farbe(v as FarbRef, u.palette, deckkraft);
}

function stilVon(el: Element, u: Umgebung, name = "stil", vorgabe?: string) {
  const s = zeichenkette(el, name) ?? vorgabe;
  if (s === undefined) {
    throw new Error(`Element ${el.id}: "${name}" fehlt und hat keine Vorgabe.`);
  }
  return u.stil(s);
}

/** Text eines Elements: Platzhalter ersetzt, Versalien angewandt. */
function inhalt(el: Element, u: Umgebung, gross: boolean,
                name = "inhalt"): string | undefined {
  const roh = zeichenkette(el, name);
  if (roh === undefined) return undefined;
  const t = ersetze(u.daten, roh);
  if (t === undefined) return undefined;
  return gross ? t.toLocaleUpperCase("de-DE") : t;
}

/** Ein Rechteck mit Fuellung, Strich und optionalem Eckradius. */
function flaeche(el: Element, u: Umgebung, x: number, y: number, b: number,
                 h: number, fuell: RGBA | null, strich: RGBA | null): void {
  u.blatt.rect(x, y, b, h, fuell, strich, zahl(el, "eckradius", 0),
               zahl(el, "linienbreite", 0.6));
}

// --------------------------------------------------------------------- text

/**
 * Freitext mit Platzhaltern. Eine Zeile oder ein umbrochener Absatz, auf
 * Wunsch in zwei oder drei Spalten.
 *
 * `zeilenschritt` ueberschreibt die Zeilenhoehe des Stils. Die Vorlagen
 * brauchen das: der Cover-Titel von Raster steht in 27 Punkt und springt
 * um 32, nicht um das 1,45-fache.
 */
const text: Zeichner = (el, u) => {
  if (el.drehung) { gedreht(el, u, textOhneDrehung); return; }
  textOhneDrehung(el, u);
};

/**
 * Ein gedrehtes Element. Gedreht wird um den Punkt, an dem das ungedrehte
 * Element ansetzt — bei einem Text also um seinen Zeilenanfang auf der
 * Grundlinie. Innen rechnet das Element dann wieder bei (0, 0), und die
 * Vorlage nennt nur den Drehpunkt und den Winkel.
 */
function gedreht(el: Element, u: Umgebung, zeichner: Zeichner): void {
  // Innen rechnet das Element bei (0, 0): x = 0, und y so, dass
  // y + h = 0 ist — die Grundlinie liegt also genau im Drehpunkt.
  const anker = { ...el, x: 0, y: -el.h } as Element;
  const grad = el.drehung === 270 ? -90 : el.drehung ?? 0;
  const dx = ankerX(el, "links");
  const dy = el.y + el.h;
  const r = (grad * Math.PI) / 180;
  u.blatt.gruppe(null,
    [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), dx, dy],
    (b) => {
      zeichner(anker, { ...u, blatt: b });
    });
}

const textOhneDrehung: Zeichner = (el, u) => {
  const s = stilVon(el, u);
  const t = inhalt(el, u, s.grossbuchstaben);
  if (t === undefined) {
    warne(u, "fehlender_wert", el, `Text entfaellt: "${zeichenkette(el, "inhalt") ?? ""}"`);
    return;
  }
  const spalten = Math.max(1, Math.min(3, zahl(el, "spalten", 1)));
  const abstand = zahl(el, "spaltenabstand", 24);
  const spaltenbreite = (el.b - abstand * (spalten - 1)) / spalten;
  const blocksatz = wahr(el, "blocksatz", s.ausrichtung === "block");
  const regeln = satzRegeln(u.vorlage.stil.farben.ableitung, blocksatz);
  const schritt = zahl(el, "zeilenschritt", s.zeilenhoehe);
  // Bei einem gedrehten Element ist der Rahmen auf (0,0) verschoben; die
  // Hoehe bleibt, damit die Grundlinie dieselbe Rechnung hat.

  // Einzeiler: genau ein T(), mit der Ausrichtung des Stils. Das ist der
  // haeufigste Fall und er darf nicht durch den Umbruch laufen — ein
  // Umbruch wuerde bei "rechts" die Zeile anders setzen.
  if (wahr(el, "einzeilig", false) || (spalten === 1 && !t.includes("\n") &&
      u.blatt.sw(t, s.schnitt, s.groesse, s.sperrung) <= el.b)) {
    u.blatt.T(ankerX(el, s.ausrichtung), el.y + el.h, t, s.schnitt, s.groesse,
              s.farbe, s.sperrung, ankerArt(s.ausrichtung));
    return;
  }

  const maxZeilen = zahl(el, "max_zeilen", 0);
  const hoeheFrei = el.h;
  const v = wahr(el, "verdichten", true)
    ? verdichten(metrik(u, s.schnitt), t, spaltenbreite,
                 hoeheFrei * spalten, s.groesse, s.minGroesse,
                 schritt / s.groesse, regeln)
    : { groesse: s.groesse, zeilenhoehe: schritt, passt: true,
        zeilen: u.blatt.umbrechen(t, s.schnitt, s.groesse, spaltenbreite, regeln) };

  if (v.groesse < s.groesse - 1e-9) {
    warne(u, "verdichtet", el,
          `Von ${s.groesse} auf ${v.groesse} Punkt verdichtet, damit der Text in ` +
          `den Rahmen passt.`);
  }
  if (!v.passt) {
    warne(u, "gekuerzt", el,
          `Der Text passt auch bei ${v.groesse} Punkt nicht in den Rahmen und ` +
          `wird abgeschnitten. Rahmen groesser machen oder Text kuerzen.`);
  }

  let zeilen = v.zeilen;
  if (maxZeilen > 0 && zeilen.length > maxZeilen) {
    zeilen = zeilen.slice(0, maxZeilen);
    warne(u, "gekuerzt", el, `Auf ${maxZeilen} Zeilen gekuerzt.`);
  }

  // Wie viele Zeilen in eine Spalte passen. Bei "haelfte" teilt sich der
  // Text gleichmaessig, bei "fliessend" laeuft Spalte 1 voll.
  const proSpalte = zeichenkette(el, "aufteilung") === "fliessend"
    ? Math.max(1, Math.floor(v.zeilenhoehe > 0 ? el.h / v.zeilenhoehe : zeilen.length))
    : Math.ceil(zeilen.length / spalten);

  for (let sp = 0; sp < spalten; sp++) {
    const teil = zeilen.slice(sp * proSpalte, (sp + 1) * proSpalte);
    if (!teil.length) continue;
    const x = el.x + sp * (spaltenbreite + abstand);
    let y = el.y + el.h;
    let letzterAbsatz = teil[0].absatz;
    for (const zeile of teil) {
      if (zeile.absatz !== letzterAbsatz) {
        y -= v.zeilenhoehe * regeln.absatzFaktor;
        letzterAbsatz = zeile.absatz;
      }
      setzeZeile(u, zeile, x, y, spaltenbreite, s, v.groesse, regeln.blocksatz);
      y -= v.zeilenhoehe;
    }
  }
};

function metrik(u: Umgebung, schnitt: string) {
  // Blatt haelt die Metriken; der Umweg vermeidet eine zweite Ladeliste.
  return (u.blatt as unknown as {
    schriften: Map<string, import("./schrift").Metrik>;
  }).schriften.get(schnitt)!;
}

function setzeZeile(u: Umgebung, zeile: { woerter: string[]; letzte: boolean },
                    x: number, y: number, breite: number,
                    s: { schnitt: string; sperrung: number; farbe: RGBA },
                    groesse: number, blocksatz: boolean): void {
  const dehnen = blocksatz && !zeile.letzte && zeile.woerter.length > 1;
  if (!dehnen) {
    u.blatt.T(x, y, zeile.woerter.join(" "), s.schnitt, groesse, s.farbe, s.sperrung);
    return;
  }
  const summe = zeile.woerter.reduce(
    (a, w) => a + u.blatt.sw(w, s.schnitt, groesse), 0);
  const lueck = (breite - summe) / (zeile.woerter.length - 1);
  let xx = x;
  for (const w of zeile.woerter) {
    u.blatt.T(xx, y, w, s.schnitt, groesse, s.farbe, s.sperrung);
    xx += u.blatt.sw(w, s.schnitt, groesse) + lueck;
  }
}

// --------------------------------------------------------------------- form

/** Rechteck, Linie, Kreis, Ellipse, Dreieck oder freier Pfad. */
const form: Zeichner = (el, u) => {
  const art = zeichenkette(el, "form") ?? "rechteck";
  const deckkraft = zahl(el, "deckkraft", 1);
  const fuell = farbRef(el, "fuell", u, deckkraft);
  const strich = farbRef(el, "strich", u, deckkraft);
  const lb = zahl(el, "linienbreite", 0.6);

  const verlauf = el["verlauf"] as
    { von: FarbRef; nach: FarbRef; richtung?: string } | undefined;
  if (verlauf) {
    const von = farbe(verlauf.von, u.palette, deckkraft);
    const nach = farbe(verlauf.nach, u.palette, deckkraft);
    const abwaerts = verlauf.richtung !== "oben";
    u.blatt.gruppe([["rect", el.x, el.y, el.b, el.h]], [1, 0, 0, 1, 0, 0], (b) => {
      b.verlauf(el.x, abwaerts ? el.y + el.h : el.y,
                el.x, abwaerts ? el.y : el.y + el.h, [von, nach]);
    });
    return;
  }

  switch (art) {
    case "rechteck":
      flaeche(el, u, el.x, el.y, el.b, el.h, fuell, strich);
      return;
    case "linie":
      u.blatt.linie(el.x, el.y, el.x + el.b, el.y + el.h,
                    strich ?? [0, 0, 0, 1], lb,
                    (el["strichmuster"] as number[] | undefined) ?? null);
      return;
    case "kreis":
      u.blatt.kreis(el.x + el.b / 2, el.y + el.h / 2, Math.min(el.b, el.h) / 2,
                    fuell, strich, lb);
      return;
    case "ellipse":
      u.blatt.ellipse(el.x, el.y, el.x + el.b, el.y + el.h, fuell, strich);
      return;
    case "dreieck": {
      const spitze = zeichenkette(el, "spitze") ?? "oben";
      const p: PfadSchritt[] = spitze === "unten"
        ? [["moveTo", el.x, el.y + el.h], ["lineTo", el.x + el.b, el.y + el.h],
           ["lineTo", el.x + el.b / 2, el.y], ["close"]]
        : [["moveTo", el.x, el.y], ["lineTo", el.x + el.b, el.y],
           ["lineTo", el.x + el.b / 2, el.y + el.h], ["close"]];
      u.blatt.pfad(p, fuell, strich, lb);
      return;
    }
    case "pfad": {
      const punkte = (el["punkte"] as number[][] | undefined) ?? [];
      if (punkte.length < 2) {
        warne(u, "unbekannt", el, "Pfad ohne Punkte.");
        return;
      }
      const p: PfadSchritt[] = [["moveTo", punkte[0][0], punkte[0][1]]];
      for (const pt of punkte.slice(1)) p.push(["lineTo", pt[0], pt[1]]);
      if (wahr(el, "geschlossen", true)) p.push(["close"]);
      u.blatt.pfad(p, fuell, strich, lb);
      return;
    }
    default:
      warne(u, "unbekannt", el, `Unbekannte Form "${art}".`);
  }
};

// ----------------------------------------------------------------- datenfeld

/** Ein gebundener Wert mit Label. Fehlt der Wert, entfaellt beides. */
const datenfeld: Zeichner = (el, u) => {
  const feldName = zeichenkette(el, "feld");
  if (feldName === undefined) {
    warne(u, "unbekannt", el, "Datenfeld ohne Feld.");
    return;
  }
  const w = wert(u.daten, feldName);
  if (w === undefined) {
    warne(u, "fehlender_wert", el, `${feldName} ist leer — das Feld entfaellt.`);
    return;
  }
  const sw = stilVon(el, u, "stil_wert");
  const label = zeichenkette(el, "label");
  const einheit = zeichenkette(el, "einheit");
  const text = einheit ? `${w} ${einheit}` : w;

  if (label !== undefined) {
    const sl = stilVon(el, u, "stil_label");
    const yl = el.y + el.h - zahl(el, "label_versatz", 0);
    u.blatt.T(ankerX(el, sl.ausrichtung), yl,
              sl.grossbuchstaben ? label.toLocaleUpperCase("de-DE") : label,
              sl.schnitt, sl.groesse, sl.farbe, sl.sperrung,
              ankerArt(sl.ausrichtung));
  }
  const yw = el.y + el.h - zahl(el, "wert_versatz", 0);
  u.blatt.T(ankerX(el, sw.ausrichtung), yw, text, sw.schnitt, sw.groesse,
            sw.farbe, sw.sperrung, ankerArt(sw.ausrichtung));
};

// ------------------------------------------------------------------ kennzahl

type KennzahlEintrag = { label?: string; wert?: string; einheit?: string };

/**
 * Grosse Zahl, Einheit, Label — einmal oder als Leiste.
 *
 * Varianten:
 *   "einzeln"  eine Kennzahl im Rahmen
 *   "leiste"   n Spalten im Rahmen, mit Trennstrichen zwischen ihnen
 *              (die Kennzahlenleiste auf dem Raster-Cover)
 *   "kacheln"  n Kacheln mit eigenem Hintergrund
 */
const kennzahl: Zeichner = (el, u) => {
  const variante = zeichenkette(el, "variante") ?? "leiste";
  const eintraege = (el["eintraege"] as KennzahlEintrag[] | undefined) ?? [];
  const gefuellt: { label?: string; wert: string }[] = [];
  for (const e of eintraege) {
    const w = e.wert === undefined ? undefined : ersetze(u.daten, e.wert);
    if (w === undefined) {
      warne(u, "fehlender_wert", el, `Kennzahl "${e.label ?? ""}" entfaellt.`);
      continue;
    }
    gefuellt.push({ label: e.label, wert: e.einheit ? `${w} ${e.einheit}` : w });
  }
  if (!gefuellt.length) return;

  const hintergrund = farbRef(el, "hintergrund", u);
  const rahmen = farbRef(el, "rahmen", u);
  if (hintergrund || rahmen) flaeche(el, u, el.x, el.y, el.b, el.h, hintergrund, rahmen);

  const sWert = stilVon(el, u, "stil_wert");
  const sLabel = stilVon(el, u, "stil_label");
  const sLetzt = zeichenkette(el, "stil_wert_letzter")
    ? u.stil(zeichenkette(el, "stil_wert_letzter")!) : sWert;
  const polster = zahl(el, "polster", 18);
  const yWert = el.y + zahl(el, "wert_grundlinie", el.h * 0.6);
  const yLabel = el.y + zahl(el, "label_grundlinie", el.h * 0.35);

  if (variante === "einzeln") {
    const e = gefuellt[0];
    u.blatt.T(el.x, yWert, e.wert, sWert.schnitt, sWert.groesse, sWert.farbe,
              sWert.sperrung);
    if (e.label) {
      u.blatt.T(el.x, yLabel,
                sLabel.grossbuchstaben ? e.label.toLocaleUpperCase("de-DE") : e.label,
                sLabel.schnitt, sLabel.groesse, sLabel.farbe, sLabel.sperrung);
    }
    return;
  }

  const spalten = zahl(el, "spalten", gefuellt.length);
  const sb = el.b / spalten;
  const trenner = farbRef(el, "trenner", u);
  const trennerOben = zahl(el, "trenner_oben", 20);
  const trennerUnten = zahl(el, "trenner_unten", 20);
  const trennerBreite = zahl(el, "trenner_breite", 0.8);

  gefuellt.forEach((e, i) => {
    const x = el.x + i * sb + polster;
    if (i > 0 && trenner) {
      u.blatt.linie(el.x + i * sb, el.y + trennerUnten,
                    el.x + i * sb, el.y + el.h - trennerOben,
                    trenner, trennerBreite);
    }
    const s = i === gefuellt.length - 1 ? sLetzt : sWert;
    u.blatt.T(x, yWert, e.wert, s.schnitt, s.groesse, s.farbe, s.sperrung);
    if (e.label) {
      u.blatt.T(x, yLabel,
                sLabel.grossbuchstaben ? e.label.toLocaleUpperCase("de-DE") : e.label,
                sLabel.schnitt, sLabel.groesse, sLabel.farbe, sLabel.sperrung);
    }
  });
};

// ------------------------------------------------------------- faktentabelle

type Zeilenvorgabe = { label: string; feld?: string; wert?: string; einheit?: string };

/**
 * Liste gebundener Felder. Zeilen ohne Wert entfallen, und die Hoehe je
 * Zeile ergibt sich aus der Zahl der UEBRIGEN Zeilen — eine Tabelle mit
 * zwoelf statt fuenfzehn Angaben fuellt denselben Rahmen.
 *
 * Darstellung: "zebra" (jede zweite Zeile hinterlegt), "linie" (Trennlinie
 * unter der Zeile), "punktlinie", "ohne".
 */
const faktentabelle: Zeichner = (el, u) => {
  const vorgaben = (el["zeilen"] as Zeilenvorgabe[] | undefined) ?? [];
  const zeilen: { label: string; wert: string }[] = [];
  for (const z of vorgaben) {
    const roh = z.feld !== undefined ? wert(u.daten, z.feld)
              : z.wert !== undefined ? ersetze(u.daten, z.wert) : undefined;
    if (roh === undefined) continue;
    zeilen.push({ label: z.label, wert: z.einheit ? `${roh} ${z.einheit}` : roh });
  }
  if (!zeilen.length) {
    warne(u, "fehlender_wert", el, "Keine einzige Angabe gefuellt — Tabelle entfaellt.");
    return;
  }

  const sLabel = stilVon(el, u, "stil_label");
  const sWert = stilVon(el, u, "stil_wert");
  const art = zeichenkette(el, "darstellung") ?? "zebra";
  const polster = zahl(el, "polster", 12);
  const zh = zahl(el, "zeilenhoehe", 0) || el.h / zeilen.length;
  const versatz = zahl(el, "grundlinie_versatz", 3);
  const flaecheFarbe = farbRef(el, "zebra_farbe", u);
  const linie = farbRef(el, "linien_farbe", u);

  let y = el.y + el.h;
  zeilen.forEach((z, i) => {
    if (art === "zebra" && i % 2 === 0 && flaecheFarbe) {
      u.blatt.rect(el.x, y - zh, el.b, zh, flaecheFarbe, null,
                   zahl(el, "eckradius", 0));
    }
    const mitte = y - zh / 2 - versatz;
    u.blatt.T(el.x + polster, mitte, z.label, sLabel.schnitt, sLabel.groesse,
              sLabel.farbe, sLabel.sperrung);
    u.blatt.T(el.x + el.b - polster, mitte, z.wert, sWert.schnitt, sWert.groesse,
              sWert.farbe, sWert.sperrung, "r");
    if (linie && (art === "linie" || art === "punktlinie")) {
      u.blatt.linie(el.x, y - zh, el.x + el.b, y - zh, linie,
                    zahl(el, "linienbreite", 0.5),
                    art === "punktlinie" ? [0.6, 2.6] : null);
    }
    y -= zh;
  });
};

// ----------------------------------------------------------------- raumliste

/** Raeume mit Flaeche und Summe. Quelle ist objekt.raumaufteilung. */
const raumliste: Zeichner = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.raumaufteilung";
  const roh = liste(u.daten, quelle) as { name?: string; flaeche?: number | string;
                                          ebene?: string }[];
  const ebene = zeichenkette(el, "ebene");
  const raeume = roh.filter((r) => r && r.name && (ebene === undefined || r.ebene === ebene));
  if (!raeume.length) {
    warne(u, "fehlender_wert", el, "Keine Raeume erfasst — die Liste entfaellt.");
    return;
  }

  const sName = stilVon(el, u, "stil_name");
  const sFlaeche = stilVon(el, u, "stil_flaeche");
  const sSumme = zeichenkette(el, "stil_summe")
    ? u.stil(zeichenkette(el, "stil_summe")!) : sFlaeche;
  const zh = zahl(el, "zeilenhoehe", 19);
  const linie = farbRef(el, "linien_farbe", u);
  const einheit = zeichenkette(el, "einheit") ?? "m²";

  let y = el.y + el.h;
  let summe = 0;
  for (const r of raeume) {
    const f = Number(String(r.flaeche ?? "").replace(",", "."));
    const text = Number.isFinite(f) ? `${zahlDe(f, 1)} ${einheit}` : undefined;
    u.blatt.T(el.x, y, String(r.name), sName.schnitt, sName.groesse, sName.farbe,
              sName.sperrung);
    if (text !== undefined) {
      u.blatt.T(el.x + el.b, y, text, sFlaeche.schnitt, sFlaeche.groesse,
                sFlaeche.farbe, sFlaeche.sperrung, "r");
      summe += f;
    }
    if (linie) {
      u.blatt.linie(el.x, y - zahl(el, "linien_versatz", 6), el.x + el.b,
                    y - zahl(el, "linien_versatz", 6), linie,
                    zahl(el, "linienbreite", 0.5));
    }
    y -= zh;
  }
  if (wahr(el, "mit_summe", true) && summe > 0) {
    const ys = y - zahl(el, "summe_versatz", 2);
    u.blatt.T(el.x, ys, zeichenkette(el, "summe_label") ?? "Summe", sSumme.schnitt,
              sSumme.groesse, sSumme.farbe, sSumme.sperrung);
    u.blatt.T(el.x + el.b, ys, `${zahlDe(summe, 1)} ${einheit}`, sSumme.schnitt,
              sSumme.groesse, sSumme.farbe, sSumme.sperrung, "r");
  }
};

// ----------------------------------------------------------------- distanzen

/** Entfernungen als Balken, Punktlinie oder Wegezeiten-Tabelle. */
const distanzen: Zeichner = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.lage_distanzen";
  const roh = liste(u.daten, quelle) as { ziel?: string; name?: string;
                                          km?: number; minuten?: number }[];
  type Entfernung = { name: string; km?: number; minuten?: number };
  const eintraege: Entfernung[] = [];
  for (const d of roh) {
    const name = d.ziel ?? d.name;
    if (!name) continue;
    eintraege.push({ name, km: d.km, minuten: d.minuten });
  }
  if (!eintraege.length) {
    warne(u, "fehlender_wert", el, "Keine Entfernungen erfasst — das Element entfaellt.");
    return;
  }

  const sName = stilVon(el, u, "stil_name");
  const sWert = stilVon(el, u, "stil_wert");
  const art = zeichenkette(el, "darstellung") ?? "balken";
  const zh = zahl(el, "zeilenhoehe", 24);
  const balkenHoehe = zahl(el, "balken_hoehe", 3);
  const balkenVersatz = zahl(el, "balken_versatz", 8);
  const spur = farbRef(el, "spur_farbe", u);
  const balken = farbRef(el, "balken_farbe", u);
  const grund = farbRef(el, "linien_farbe", u);
  const groesste = Math.max(...eintraege.map((d) => d.km ?? 0), 0.1);

  let y = el.y + el.h;
  for (const d of eintraege) {
    u.blatt.T(el.x, y, d.name, sName.schnitt, sName.groesse, sName.farbe,
              sName.sperrung);
    const text = d.km !== undefined ? `${zahlDe(d.km, 1)} km`
               : d.minuten !== undefined ? `${zahlDe(d.minuten, 0)} min`
               : undefined;
    if (text !== undefined) {
      u.blatt.T(el.x + el.b, y, text, sWert.schnitt, sWert.groesse, sWert.farbe,
                sWert.sperrung, "r");
    }
    if (art === "balken" && d.km !== undefined && spur && balken) {
      const r = zahl(el, "balken_radius", balkenHoehe / 2);
      u.blatt.rect(el.x, y - balkenVersatz, el.b, balkenHoehe, spur, null, r);
      u.blatt.rect(el.x, y - balkenVersatz,
                   Math.max((el.b * d.km) / groesste, zahl(el, "balken_min", 4)),
                   balkenHoehe, balken, null, r);
    } else if (art === "punktlinie" && grund) {
      u.blatt.linie(el.x, y - balkenVersatz, el.x + el.b, y - balkenVersatz,
                    grund, 0.6, [0.6, 2.6]);
    }
    y -= zh;
  }
};

// ---------------------------------------------------------------- highlights

/** Drei bis sechs Highlights als Karten oder nummerierte Liste. */
const highlights: Zeichner = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.expose_highlights";
  const roh = liste(u.daten, quelle);
  type Punkt = { titel: string; text?: string };
  const eintraege: Punkt[] = [];
  for (const h of roh) {
    if (typeof h === "string") { if (h.trim()) eintraege.push({ titel: h }); continue; }
    const o = h as { titel?: string; text?: string };
    if (o.titel) eintraege.push({ titel: o.titel, text: o.text });
  }
  if (!eintraege.length) {
    warne(u, "fehlender_wert", el, "Keine Highlights erfasst — das Element entfaellt.");
    return;
  }

  const sNummer = zeichenkette(el, "stil_nummer")
    ? u.stil(zeichenkette(el, "stil_nummer")!) : undefined;
  const sTitel = stilVon(el, u, "stil_titel");
  const sText = zeichenkette(el, "stil_text")
    ? u.stil(zeichenkette(el, "stil_text")!) : undefined;
  const art = zeichenkette(el, "darstellung") ?? "karten";
  const abstand = zahl(el, "abstand", 10);
  const polster = zahl(el, "polster", 14);
  const fuell = farbRef(el, "hintergrund", u);
  const rahmen = farbRef(el, "rahmen", u);
  const regeln = satzRegeln(u.vorlage.stil.farben.ableitung, false);

  if (art === "karten") {
    const spalten = zahl(el, "spalten", eintraege.length);
    const kb = (el.b - abstand * (spalten - 1)) / spalten;
    eintraege.slice(0, spalten).forEach((h, i) => {
      const x = el.x + i * (kb + abstand);
      if (fuell || rahmen) {
        u.blatt.rect(x, el.y, kb, el.h, fuell, rahmen, zahl(el, "eckradius", 10),
                     zahl(el, "linienbreite", 0.8));
      }
      let y = el.y + el.h - zahl(el, "nummer_versatz", 30);
      if (sNummer) {
        u.blatt.T(x + polster, y, String(i + 1).padStart(2, "0"), sNummer.schnitt,
                  sNummer.groesse, sNummer.farbe, sNummer.sperrung);
      }
      y = el.y + el.h - zahl(el, "titel_versatz", 52);
      u.blatt.T(x + polster, y, h.titel, sTitel.schnitt, sTitel.groesse,
                sTitel.farbe, sTitel.sperrung);
      if (h.text && sText) {
        u.blatt.absatz(x + polster, y - zahl(el, "text_versatz", 14), h.text,
                       kb - 2 * polster, sText.schnitt, sText.groesse,
                       sText.zeilenhoehe, sText.farbe, regeln);
      }
    });
    return;
  }

  // Nummerierte Liste, eine Zeile je Highlight.
  const zh = zahl(el, "zeilenhoehe", 24);
  let y = el.y + el.h;
  eintraege.forEach((h, i) => {
    if (sNummer) {
      u.blatt.T(el.x, y, String(i + 1).padStart(2, "0"), sNummer.schnitt,
                sNummer.groesse, sNummer.farbe, sNummer.sperrung);
    }
    const x = el.x + zahl(el, "einzug", 24);
    u.blatt.T(x, y, h.titel, sTitel.schnitt, sTitel.groesse, sTitel.farbe,
              sTitel.sperrung);
    y -= zh;
  });
};

// --------------------------------------------------------------- ausstattung

/** Ausstattungspunkte als Checkliste, Gruppen oder nummeriert. */
const ausstattung: Zeichner = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.beschreibung_ausstattung_expose";
  const roh = wert(u.daten, quelle);
  const punkte = (roh ?? "").split("\n").map((z) => z.trim()).filter(Boolean);
  if (!punkte.length) {
    warne(u, "fehlender_wert", el, "Keine Ausstattungspunkte — das Element entfaellt.");
    return;
  }

  const s = stilVon(el, u, "stil_punkt");
  const spalten = Math.max(1, zahl(el, "spalten", 2));
  const abstand = zahl(el, "spaltenabstand", 20);
  const sb = (el.b - abstand * (spalten - 1)) / spalten;
  const zh = zahl(el, "zeilenhoehe", 34);
  const fuell = farbRef(el, "hintergrund", u);
  const haken = farbRef(el, "haken_farbe", u);
  const hakenInnen = farbRef(el, "haken_innen", u) ?? [1, 1, 1, 1];
  const art = zeichenkette(el, "darstellung") ?? "checkliste";
  const polster = zahl(el, "polster", 10);
  const einzug = zahl(el, "einzug", 28);

  punkte.forEach((p, i) => {
    const sp = i % spalten;
    const reihe = Math.floor(i / spalten);
    const x = el.x + sp * (sb + abstand);
    const y = el.y + el.h - reihe * zh;
    if (fuell) {
      u.blatt.rect(x, y - zh + zahl(el, "kachel_luft", 4), sb,
                   zh - zahl(el, "kachel_luft", 4) * 2 + 2, fuell, null,
                   zahl(el, "eckradius", 6));
    }
    if (art === "checkliste" && haken) {
      hakenZeichnen(u, x + polster, y - zahl(el, "haken_versatz", 10), haken,
                    hakenInnen, zahl(el, "haken_groesse", 9));
    }
    u.blatt.T(x + einzug, y - zahl(el, "text_versatz", 8), p, s.schnitt, s.groesse,
              s.farbe, s.sperrung);
  });
};

function hakenZeichnen(u: Umgebung, x: number, y: number, aussen: RGBA,
                       innen: RGBA, groesse: number): void {
  const g = groesse;
  u.blatt.rect(x, y, g, g, aussen, null, g * 0.278);
  u.blatt.pfad(
    [["moveTo", x + g * 0.2444, y + g * 0.5111],
     ["lineTo", x + g * 0.4333, y + g * 0.3111],
     ["lineTo", x + g * 0.7667, y + g * 0.7111]],
    null, innen, g * 0.1333);
}

// --------------------------------------------------------------------- bild

/**
 * Ein Bildslot. Fehlt das Bild, zeichnet der Renderer einen Platzhalter —
 * und sagt es in den Warnungen. Die gezeichneten Haeuser und Villen der
 * Prototypen sind laut Auftrag ausdruecklich NUR Platzhalter; im Produkt
 * stehen dort Objektfotos. Darum wird hier kein Haus gemalt, sondern ein
 * ruhiger Rahmen mit Beschriftung.
 */
const bild: Zeichner = (el, u) => {
  const slot = el["slot"] as { art?: string; nr?: number } | undefined;
  const schluessel = bildSchluessel(slot);
  const quelle = schluessel ? wert(u.daten, schluessel) : undefined;
  const radius = zahl(el, "eckradius", 0);

  // Der Rahmen wird immer maskiert, auch beim Platzhalter. Ein Foto im
  // Modus "cover" laeuft sonst ueber die Kante, und der Vergleich mit den
  // Prototypen erkennt den Bildrahmen daran, dass dort eine Maske steht.
  const maske: PfadSchritt[] = radius
    ? [["roundRect", el.x, el.y, el.b, el.h, radius]]
    : [["rect", el.x, el.y, el.b, el.h]];
  if (quelle !== undefined) {
    u.blatt.gruppe(maske, [1, 0, 0, 1, 0, 0], (b) => {
      b.bild(el.x, el.y, el.b, el.h, quelle,
             (zeichenkette(el, "fuellmodus") as "cover" | "contain") ?? "cover");
    });
  } else {
    warne(u, "fehlendes_bild", el,
          `Kein Bild fuer ${slot?.art ?? "diesen Slot"} — Platzhalter gesetzt.`);
    const fuell = farbRef(el, "platzhalter_farbe", u)
      ?? farbe({ palette: "surf" }, u.palette);
    u.blatt.gruppe(maske, [1, 0, 0, 1, 0, 0], (b) => {
      b.rect(el.x, el.y, el.b, el.h, fuell, null, radius);
    });
  }

  const label = inhalt(el, u, false, "label");
  if (label !== undefined && zeichenkette(el, "stil_label")) {
    const s = u.stil(zeichenkette(el, "stil_label")!);
    const t = s.grossbuchstaben ? label.toLocaleUpperCase("de-DE") : label;
    const lb = u.blatt.sw(t, s.schnitt, s.groesse, s.sperrung)
      + zahl(el, "label_luft", 18);
    const lx = el.x + zahl(el, "label_x", 10);
    const ly = el.y + zahl(el, "label_y", 10);
    const fuell = farbRef(el, "label_hintergrund", u, zahl(el, "label_deckkraft", 0.82));
    if (fuell) {
      u.blatt.rect(lx, ly, lb, zahl(el, "label_hoehe", 15), fuell, null,
                   zahl(el, "label_radius", 7.5));
    }
    u.blatt.T(lx + zahl(el, "label_polster", 9), ly + zahl(el, "label_grundlinie", 5.2),
              t, s.schnitt, s.groesse, s.farbe, s.sperrung);
  }
};

function bildSchluessel(slot: { art?: string; nr?: number } | undefined): string | undefined {
  if (!slot?.art) return undefined;
  switch (slot.art) {
    case "titelbild": return "objekt.hauptbild_url";
    case "foto": return `bild.foto.${slot.nr ?? 1}`;
    case "grundriss": return `bild.grundriss.${slot.nr ?? 1}`;
    case "lageplan": return "bild.lageplan";
    case "ansprechpartner": return "ansprechpartner.foto";
    case "logo": return "firma.logo";
    case "asset": return "bild.asset";
    default: return undefined;
  }
}

// ----------------------------------------------------------------------- qr

const qr: Zeichner = (el, u) => {
  const roh = zeichenkette(el, "inhalt") ?? "{{objekt.expose_qr_url}}";
  const ziel = ersetze(u.daten, roh);
  if (ziel === undefined) {
    warne(u, "fehlender_wert", el, "Kein Ziel fuer den QR-Code — er entfaellt.");
    return;
  }
  u.blatt.qr(el.x, el.y, el.b, el.h, ziel, farbRef(el, "farbe", u));
};

// ------------------------------------------------------------------ Register

export const ELEMENTE: Partial<Record<ElementTyp, Zeichner>> = {
  text, form, datenfeld, kennzahl, faktentabelle, raumliste, distanzen,
  highlights, ausstattung, bild, qr,
};
