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
import { satzRegeln, schnittName } from "./stil";
import { ersetze, formatiere, liste, wert, zahlDe } from "./werte";
import { feld } from "./felder";
import type { PfadSchritt, RGBA } from "./schritte";
import { verdichten } from "./text";

type Zeichner = (el: Element, u: Umgebung) => void;

// ------------------------------------------------------------------ Hilfen

function zahl(el: Element, name: string, vorgabe: number): number {
  const v = el[name];
  return typeof v === "number" ? v : vorgabe;
}

/**
 * Was die Bildslots dieser Seite zu ihrer Nummer dazuzaehlen (fork_64).
 *
 * Auf einer Seite, die sich wiederholt, zeigt der zweite Durchgang die
 * naechsten Bilder und nicht noch einmal dieselben. rendern.ts legt den
 * Versatz in die Daten; hier wird er gelesen. Null auf jeder nicht
 * wiederholten Seite — und damit aendert sich fuer alle bisherigen Seiten
 * nichts.
 */
function laufVersatz(u: Umgebung): number {
  const v = u.daten["lauf.versatz"];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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

/** Wendet die Versalien eines Textstils an. */
function gross(s: { grossbuchstaben: boolean }, t: string): string {
  return s.grossbuchstaben ? t.toLocaleUpperCase("de-DE") : t;
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
  // Ein LEERER Vorgabetext ist kein fehlender Wert, sondern ein freier
  // Platz: die Vorlage haelt den Rahmen bereit, und was darin steht,
  // schreibt der Makler je Objekt (expose_overrides.texte). Eine
  // Arbeitsanweisung als Vorgabe ("Beschreiben Sie hier …") stand sonst im
  // fertigen PDF — am 06.10.2026 zweimal in der Luxusvorlage.
  const roh = zeichenkette(el, "inhalt");
  if (roh !== undefined && roh.trim() === "") return;
  const t = inhalt(el, u, s.grossbuchstaben);
  if (t === undefined) {
    warne(u, "fehlender_wert", el, `Text entfaellt: "${zeichenkette(el, "inhalt") ?? ""}"`);
    return;
  }
  // "saetze": an Satzgrenzen umbrechen statt an der Spaltenbreite. Das
  // Zitat der Luxusvorlage steht so — zwei Saetze, zwei Zeilen, gleich
  // gewichtet. Ein Umbruch nach Breite traefe die Stelle nur zufaellig.
  const text = zeichenkette(el, "umbruch") === "saetze"
    ? t.replace(/([.!?])\s+/g, "$1\n") : t;
  const spalten = Math.max(1, Math.min(3, zahl(el, "spalten", 1)));
  const abstand = zahl(el, "spaltenabstand", 24);
  const spaltenbreite = (el.b - abstand * (spalten - 1)) / spalten;
  const blocksatz = wahr(el, "blocksatz", s.ausrichtung === "block");
  const regeln = satzRegeln(u.vorlage.stil.farben.ableitung, blocksatz);
  // Einzug der ersten Zeilen — fuer die Initiale, die bei Signature in
  // den Absatz hineinragt.
  regeln.einzug = zahl(el, "einzug", 0);
  regeln.einzugZeilen = zahl(el, "einzug_zeilen", 0);
  const schritt = zahl(el, "zeilenschritt", s.zeilenhoehe);
  // Bei einem gedrehten Element ist der Rahmen auf (0,0) verschoben; die
  // Hoehe bleibt, damit die Grundlinie dieselbe Rechnung hat.

  // Einzeiler: genau ein T(), mit der Ausrichtung des Stils. Das ist der
  // haeufigste Fall und er darf nicht durch den Umbruch laufen — ein
  // Umbruch wuerde bei "rechts" die Zeile anders setzen.
  if (wahr(el, "einzeilig", false) || (spalten === 1 && !t.includes("\n") &&
      u.blatt.sw(t, s.schnitt, s.groesse, s.sperrung) <= el.b)) {
    // Eine Zeile, die breiter ist als ihr Rahmen, lief bisher einfach
    // weiter — ueber den Nachbarn, ueber das Bild, ueber den Seitenrand.
    // Am 06.10.2026 im Betrieb gesehen: der Markenname eines Mandanten ist
    // laenger als der, gegen den die Vorlage vermessen wurde, und stand
    // quer ueber dem Titelbild. Die Vorlage KANN das nicht wissen; der
    // Renderer kann es messen. Also verkleinern statt ueberlaufen — bis zur
    // Mindestgroesse des Stils, danach bleibt nur die Warnung.
    let groesse = s.groesse;
    let sperrung = s.sperrung;
    if (el.b > 0) {
      let br = u.blatt.sw(t, s.schnitt, groesse, sperrung);
      if (br > el.b) {
        const min = Math.min(s.minGroesse, s.groesse);
        // Erster Schuss proportional, danach in kleinen Schritten: die
        // Sperrung skaliert mit, sonst steht sie bei kleiner Schrift zu weit.
        const faktor = Math.max(min / s.groesse, el.b / br);
        groesse = s.groesse * faktor;
        sperrung = s.sperrung * faktor;
        br = u.blatt.sw(t, s.schnitt, groesse, sperrung);
        while (br > el.b && groesse > min + 1e-9) {
          groesse = Math.max(min, groesse - 0.2);
          sperrung = s.sperrung * (groesse / s.groesse);
          br = u.blatt.sw(t, s.schnitt, groesse, sperrung);
        }
        if (br > el.b) {
          // Auch bei der kleinsten erlaubten Groesse zu breit: dann wird
          // gekuerzt und nicht ueberlaufen. Eine Fusszeile, die den
          // Objekttitel traegt, kann jede Laenge bekommen — am 06.10.2026
          // stand dort ein 76 Zeichen langer Titel, der bei 4,3 Punkt immer
          // noch ueber den Rand lief. Drei Punkte sagen dem Leser, dass da
          // mehr stand; eine Zeile ueber dem Seitenrand sagt ihm nichts.
          let gekuerzt = t;
          while (gekuerzt.length > 1
                 && u.blatt.sw(gekuerzt + "…", s.schnitt, groesse, sperrung) > el.b) {
            gekuerzt = gekuerzt.slice(0, -1);
          }
          gekuerzt = gekuerzt.replace(/[\s,;:–-]+$/, "") + "…";
          warne(u, "gekuerzt", el,
                `Die Zeile passt auch bei ${groesse.toFixed(1)} Punkt nicht in ihren `
                + `Rahmen (${br.toFixed(0)} statt ${el.b.toFixed(0)} Punkt) und wurde `
                + `gekuerzt. Rahmen breiter machen oder Text kuerzen.`);
          u.blatt.T(ankerX(el, s.ausrichtung), el.y + el.h, gekuerzt, s.schnitt,
                    groesse, s.farbe, sperrung, ankerArt(s.ausrichtung));
          return;
        } else {
          warne(u, "verdichtet", el,
                `Von ${s.groesse} auf ${groesse.toFixed(1)} Punkt verkleinert, damit `
                + `die Zeile in ihren Rahmen passt.`);
        }
      }
    }
    u.blatt.T(ankerX(el, s.ausrichtung), el.y + el.h, t, s.schnitt, groesse,
              s.farbe, sperrung, ankerArt(s.ausrichtung));
    return;
  }

  const maxZeilen = zahl(el, "max_zeilen", 0);
  const hoeheFrei = el.h;
  // (maxZeilen steht absichtlich vor der Verdichtung: sie rechnet damit.)
  // Der Absatzabstand steht am Element, wenn die Vorlage ihn nennt — und
  // die Verdichtung muss mit demselben Wert rechnen wie das Zeichnen.
  const festeLuft = el["absatzabstand"] as number | undefined;
  const v = wahr(el, "verdichten", true)
    ? verdichten(metrik(u, s.schnitt), text, spaltenbreite,
                 hoeheFrei * spalten, s.groesse, s.minGroesse,
                 schritt / s.groesse, regeln,
                 typeof festeLuft === "number" ? festeLuft : undefined,
                 maxZeilen)
    : { groesse: s.groesse, zeilenhoehe: schritt, passt: true,
        zeilen: u.blatt.umbrechen(text, s.schnitt, s.groesse, spaltenbreite, regeln) };

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

  // Der Text wird in SCHLITZE zerlegt: jede Zeile einer, jeder
  // Absatzwechsel einer. Das ist nicht Formalismus, sondern das Verhalten
  // der Prototypen: ihr wrap() liefert die Leerzeile zwischen zwei
  // Absaetzen als eigenen Eintrag, und die zweispaltige
  // Objektbeschreibung teilt die Liste in der Mitte — Leerzeilen
  // mitgezaehlt. Wer nur die Zeilen zaehlt, teilt eine Zeile zu spaet.
  const absatzLuft = zahl(el, "absatzabstand", v.zeilenhoehe * regeln.absatzFaktor);
  type Schlitz = { zeile?: typeof zeilen[number]; luft: number };
  const schlitze: Schlitz[] = [];
  let letzterAbsatz = zeilen.length ? zeilen[0].absatz : 0;
  for (const zeile of zeilen) {
    if (zeile.absatz !== letzterAbsatz) {
      schlitze.push({ luft: absatzLuft });
      letzterAbsatz = zeile.absatz;
    }
    schlitze.push({ zeile, luft: v.zeilenhoehe });
  }

  const proSpalte = zeichenkette(el, "aufteilung") === "fliessend"
    ? Math.max(1, Math.floor(v.zeilenhoehe > 0 ? el.h / v.zeilenhoehe : schlitze.length))
    : Math.ceil(schlitze.length / spalten);

  let weggelassen = 0;
  for (let sp = 0; sp < spalten; sp++) {
    const teil = schlitze.slice(sp * proSpalte, (sp + 1) * proSpalte);
    if (!teil.length) continue;
    const x = el.x + sp * (spaltenbreite + abstand);
    let y = el.y + el.h;
    for (const schlitz of teil) {
      if (schlitz.zeile) {
        // Eine Zeile, deren Grundlinie unter den Rahmen rutscht, wird NICHT
        // gezeichnet. Vorher lief sie weiter: ueber die Fusszeile, ueber
        // die Seitenzahl, am 06.10.2026 im Betrieb ueber beides. Die
        // Warnung sagte das auch ("wird abgeschnitten") — abgeschnitten
        // wurde aber nichts, und damit war die Warnung eine Luege.
        //
        // Wegzulassen ist schlecht; uebereinanderzudrucken ist schlechter:
        // der Text ist dann auch weg, und die Seite dazu. Die richtige
        // Loesung ist der Fliesstext ueber Seitengrenzen (Seite.fliessend
        // im Schema) — bis dahin faellt die Zeile weg und sagt es.
        if (y < el.y - 0.01) {
          weggelassen++;
        } else {
          setzeZeile(u, schlitz.zeile, x + schlitz.zeile.einzug, y,
                     spaltenbreite - schlitz.zeile.einzug, s, v.groesse,
                     regeln.blocksatz);
        }
      }
      y -= schlitz.luft;
    }
  }
  if (weggelassen) {
    warne(u, "gekuerzt", el,
          `${weggelassen} Zeile${weggelassen === 1 ? "" : "n"} passt${weggelassen === 1 ? "" : "en"} `
          + `nicht mehr in den Rahmen und ${weggelassen === 1 ? "wurde" : "wurden"} weggelassen. `
          + `Rahmen groesser machen, Text kuerzen oder die Schrift kleiner stellen.`);
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
                    s: { schnitt: string; sperrung: number; farbe: RGBA;
                         ausrichtung?: string },
                    groesse: number, blocksatz: boolean): void {
  const dehnen = blocksatz && !zeile.letzte && zeile.woerter.length > 1;
  if (!dehnen) {
    // Auch ein umbrochener Text kann mittig oder rechtsbuendig stehen —
    // das Zitat der Luxusvorlage steht zentriert ueber zwei Zeilen.
    const aus = s.ausrichtung ?? "links";
    const anker = aus === "mitte" ? x + breite / 2 : aus === "rechts" ? x + breite : x;
    u.blatt.T(anker, y, zeile.woerter.join(" "), s.schnitt, groesse, s.farbe,
              s.sperrung, ankerArt(aus));
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
    case "scrim": {
      // Ein weicher Abdunkler ueber einem Foto, damit Text darauf lesbar
      // bleibt. Der Prototyp legt dafuer Flaechen mit kleinem Alpha
      // uebereinander statt einen Verlauf zu zeichnen — gestuft, aber ohne
      // die Streifen, die ein grober Verlauf im Druck zeigt. Dieselbe
      // Rechnung, damit die Vorschau dasselbe zeigt.
      const stufen = Math.max(1, zahl(el, "stufen", 60));
      const grund = (el["farbe"] as FarbRef | undefined) ?? "schwarz";
      const staerke = Math.min(zahl(el, "staerke", 0.85), 1) / stufen * 1.6;
      const abwaerts = zeichenkette(el, "richtung") === "unten";
      for (let i = 0; i < stufen; i++) {
        const hh = el.h * (1 - i / stufen);
        u.blatt.rect(el.x, abwaerts ? el.y + el.h - hh : el.y, el.b, hh,
                     farbe(grund, u.palette, staerke), null, 0);
      }
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

type KennzahlEintrag = {
  label?: string;
  /** Fester Text mit Platzhaltern. */
  wert?: string;
  /** Oder ein Feld — dann entscheidet `format`, wie es gesetzt wird. */
  feld?: string;
  /**
   * Ueberschreibt den Typ des Katalogs. Eine Kennzahl zeigt die Flaeche
   * als blosse Zahl ("386") und die Einheit daneben in eigener Schrift;
   * der Katalog wuerde "386 m²" liefern und die Einheit staende zweimal.
   */
  format?: import("./felder").FeldTyp;
  stellen?: number;
  einheit?: string;
};

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
  const gebunden = zeichenkette(el, "feld");
  const eintraege: KennzahlEintrag[] = gebunden
    ? (liste(u.daten, gebunden) as { label?: string; name?: string;
        bezeichnung?: string; betrag?: number; wert?: string; einheit?: string }[])
        .map((e) => ({
          label: e.label ?? e.name ?? e.bezeichnung,
          wert: e.betrag !== undefined
            ? `${zahlDe(Number(e.betrag), zahl(el, "stellen", 0), true)}` : e.wert,
          einheit: e.einheit ?? zeichenkette(el, "einheit"),
        }))
    : ((el["eintraege"] as KennzahlEintrag[] | undefined) ?? []);

  const gefuellt: { label?: string; wert: string; einheit?: string }[] = [];
  for (const e of eintraege) {
    const w = e.feld !== undefined
      ? (e.format !== undefined
          ? formatiere(u.daten[e.feld], e.format, e.stellen)
          : wert(u.daten, e.feld))
      : e.wert === undefined ? undefined : ersetze(u.daten, e.wert);
    if (w === undefined) {
      warne(u, "fehlender_wert", el, `Kennzahl "${e.label ?? ""}" entfaellt.`);
      continue;
    }
    gefuellt.push({
      label: e.label,
      wert: e.einheit && variante !== "gitter" ? `${w} ${e.einheit}` : w,
      einheit: e.einheit,
    });
  }
  if (!gefuellt.length) return;

  const hintergrund = farbRef(el, "hintergrund", u);
  const rahmen = farbRef(el, "rahmen", u);
  if (hintergrund || rahmen) flaeche(el, u, el.x, el.y, el.b, el.h, hintergrund, rahmen);

  const sWert = stilVon(el, u, "stil_wert");
  const sLabel = stilVon(el, u, "stil_label");
  // Eine Leiste hebt oft einen Wert hervor — bei Raster den letzten
  // (Kaufpreis rechts), bei Studio den ersten (Kaufpreis links).
  const sLetzt = zeichenkette(el, "stil_wert_letzter")
    ? u.stil(zeichenkette(el, "stil_wert_letzter")!) : sWert;
  const sErst = zeichenkette(el, "stil_wert_erster")
    ? u.stil(zeichenkette(el, "stil_wert_erster")!) : null;
  const polster = zahl(el, "polster", 18);
  // Bei "leiste" und "einzeln" zaehlen die Grundlinien von der Unterkante
  // des Elements; bei "kacheln" von der Unterkante der jeweiligen Kachel.
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

  // Gitter: grosse Zahl, Einheit unmittelbar daneben, Label darunter,
  // Haarlinien zwischen den Spalten. Die Einheit ist dabei ein eigener
  // Satz in eigener Groesse und Farbe — "112" gross, "m²" klein daneben.
  // Darum kann sie nicht Teil des Werts sein.
  if (variante === "gitter") {
    const spalten = Math.max(1, zahl(el, "spalten", 3));
    const zh = zahl(el, "zeilenhoehe", 104);
    const sb = el.b / spalten;
    const einzug = zahl(el, "einzug", 14);
    const sEinheit = zeichenkette(el, "stil_einheit")
      ? u.stil(zeichenkette(el, "stil_einheit")!) : null;
    const trenner = farbRef(el, "trenner", u);
    gefuellt.forEach((e, i) => {
      const spalte = i % spalten;
      const reihe = Math.floor(i / spalten);
      const x = el.x + spalte * sb;
      const y = el.y + el.h - reihe * zh;
      if (spalte > 0 && trenner) {
        u.blatt.linie(x, y - zh + zahl(el, "trenner_unten", 14),
                      x, y - zahl(el, "trenner_oben", 6), trenner,
                      zahl(el, "trenner_breite", 1));
      }
      const xx = x + (spalte > 0 ? einzug : 0);
      const yWert = y - zahl(el, "wert_versatz", 62);
      const breite = u.blatt.T(xx, yWert, e.wert, sWert.schnitt, sWert.groesse,
                               sWert.farbe, sWert.sperrung);
      if (e.einheit && sEinheit) {
        u.blatt.T(xx + breite + zahl(el, "einheit_abstand", 4), yWert, e.einheit,
                  sEinheit.schnitt, sEinheit.groesse, sEinheit.farbe,
                  sEinheit.sperrung);
      }
      if (e.label) {
        u.blatt.T(xx, y - zahl(el, "label_versatz", 82),
                  sLabel.grossbuchstaben ? e.label.toLocaleUpperCase("de-DE") : e.label,
                  sLabel.schnitt, sLabel.groesse, sLabel.farbe, sLabel.sperrung);
      }
    });
    return;
  }

  // Kacheln: jede Kennzahl in eigenem Rahmen, von oben nach unten
  // gefuellt. So stehen die Energieangaben und die laufenden Kosten.
  if (variante === "kacheln") {
    const spalten = Math.max(1, zahl(el, "spalten", 2));
    const abstand = zahl(el, "abstand", 10);
    const kb = (el.b - abstand * (spalten - 1)) / spalten;
    const kh = zahl(el, "kachel_hoehe", 64);
    const kFuell = farbRef(el, "kachel_fuell", u);
    const kStrich = farbRef(el, "kachel_strich", u);
    gefuellt.forEach((e, i) => {
      const sp = i % spalten;
      const reihe = Math.floor(i / spalten);
      const x = el.x + sp * (kb + abstand);
      const unten = el.y + el.h - reihe * (kh + abstand) - kh;
      // Die erste Kachel darf hervorgehoben sein — die wichtigste Zahl
      // steht dann auf der Signalflaeche.
      const ersteFuell = i === 0 ? farbRef(el, "kachel_fuell_erster", u) : null;
      const sErstWert = i === 0 && zeichenkette(el, "stil_wert_erster")
        ? u.stil(zeichenkette(el, "stil_wert_erster")!) : sWert;
      const sErstLabel = i === 0 && zeichenkette(el, "stil_label_erster")
        ? u.stil(zeichenkette(el, "stil_label_erster")!) : sLabel;
      if (ersteFuell || kFuell || kStrich) {
        u.blatt.rect(x, unten, kb, kh, ersteFuell ?? kFuell, kStrich,
                     zahl(el, "eckradius", 8), zahl(el, "linienbreite", 0.8));
      }
      if (e.label) {
        u.blatt.T(x + polster, unten + zahl(el, "label_grundlinie", 38),
                  sErstLabel.grossbuchstaben
                    ? e.label.toLocaleUpperCase("de-DE") : e.label,
                  sErstLabel.schnitt, sErstLabel.groesse, sErstLabel.farbe,
                  sErstLabel.sperrung);
      }
      u.blatt.T(x + polster, unten + zahl(el, "wert_grundlinie", 18), e.wert,
                sErstWert.schnitt, sErstWert.groesse, sErstWert.farbe,
                sErstWert.sperrung);
    });
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
    const s = i === 0 && sErst ? sErst
            : i === gefuellt.length - 1 ? sLetzt : sWert;
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
  // Die Zeilen koennen in der Vorlage stehen (Label plus Feld) oder aus
  // einer Liste kommen (Label und Wert schon fertig). Das zweite braucht
  // Studio: dort waehlt der Nutzer auf der Objektseite, welche Angaben
  // ins Expose sollen und in welcher Reihenfolge.
  const gebunden = zeichenkette(el, "feld");
  const vorgaben: Zeilenvorgabe[] = gebunden
    ? (liste(u.daten, gebunden) as { label?: string; wert?: string }[])
        .filter((z) => z && z.label !== undefined)
        .map((z) => ({ label: z.label as string, wert: z.wert }))
    : ((el["zeilen"] as Zeilenvorgabe[] | undefined) ?? []);
  const zeilen: { label: string; wert: string }[] = [];
  for (const z of vorgaben) {
    const roh = z.feld !== undefined ? wert(u.daten, z.feld)
              : z.wert !== undefined ? ersetze(u.daten, z.wert) : undefined;
    if (roh === undefined) continue;
    // Auch das Label darf Platzhalter tragen: "Eigenkapital ({{...}})".
    // Fehlt darin ein Wert, entfaellt die Zeile — ein Label mit einer
    // leeren Klammer ist schlechter als keine Zeile.
    const label = z.label.includes("{{") ? ersetze(u.daten, z.label) : z.label;
    if (label === undefined) continue;
    zeilen.push({ label, wert: z.einheit ? `${roh} ${z.einheit}` : roh });
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

  // Gestapelt: Label ueber dem Wert, beide am linken Rand. So steht das
  // Preis-Panel der Raster-Vorlage und die Angabenliste von Signature.
  if (art === "gestapelt") {
    let y = el.y + el.h;
    for (const z of zeilen) {
      u.blatt.T(el.x, y - zahl(el, "label_versatz", 0), gross(sLabel, z.label),
                sLabel.schnitt, sLabel.groesse, sLabel.farbe, sLabel.sperrung);
      u.blatt.T(el.x, y - zahl(el, "wert_versatz", 14), z.wert, sWert.schnitt,
                sWert.groesse, sWert.farbe, sWert.sperrung);
      y -= zh;
    }
    return;
  }

  // Mehrspaltig wird SPALTENWEISE gefuellt: erst die linke Spalte ganz,
  // dann die rechte. Zeilenweise zu fuellen waere beim Lesen falsch — die
  // Angaben gehoeren der Reihe nach untereinander.
  const spalten = Math.max(1, zahl(el, "spalten", 1));
  const spaltenabstand = zahl(el, "spaltenabstand", 24);
  const sb = (el.b - spaltenabstand * (spalten - 1)) / spalten;
  const jeSpalte = Math.ceil(zeilen.length / spalten);
  const zeilenhoehe = spalten > 1 ? zahl(el, "zeilenhoehe", 25) : zh;

  // Spaltenweise ist die Vorgabe: Angaben gehoeren der Reihe nach
  // untereinander. "zeilenweise" braucht die Energieliste von Studio,
  // wo die Paare nebeneinander gelesen werden.
  const zeilenweise = zeichenkette(el, "fuellung") === "zeilenweise";
  zeilen.forEach((z, i) => {
    const spalte = spalten > 1 ? (zeilenweise ? i % spalten : Math.floor(i / jeSpalte)) : 0;
    const reihe = spalten > 1 ? (zeilenweise ? Math.floor(i / spalten) : i % jeSpalte) : i;
    const x = el.x + spalte * (sb + spaltenabstand);
    const y = el.y + el.h - reihe * zeilenhoehe;
    if (art === "zebra" && reihe % 2 === 0 && flaecheFarbe) {
      u.blatt.rect(x, y - zeilenhoehe, sb, zeilenhoehe, flaecheFarbe, null,
                   zahl(el, "eckradius", 0));
    }
    const grundlinie = spalten > 1 ? y : y - zeilenhoehe / 2 - versatz;
    u.blatt.T(x + polster, grundlinie, gross(sLabel, z.label), sLabel.schnitt,
              sLabel.groesse, sLabel.farbe, sLabel.sperrung);
    u.blatt.T(x + sb - polster, grundlinie - zahl(el, "wert_tiefer", 0), z.wert,
              sWert.schnitt, sWert.groesse, sWert.farbe, sWert.sperrung, "r");
    if (linie && (art === "linie" || art === "punktlinie")) {
      const ly = spalten > 1 ? y - zahl(el, "linien_versatz", 9) : y - zeilenhoehe;
      u.blatt.linie(x, ly, x + sb, ly, linie,
                    zahl(el, "linienbreite", 0.5),
                    art === "punktlinie" ? [0.6, 2.6] : null);
    } else if (linie && art === "fuehrungspunkte") {
      // Die Punktreihe laeuft ZWISCHEN Beschriftung und Wert, nicht unter
      // der Zeile. Sie muss deshalb beide Breiten kennen.
      const lb = u.blatt.sw(gross(sLabel, z.label), sLabel.schnitt, sLabel.groesse,
                            sLabel.sperrung);
      const wb = u.blatt.sw(z.wert, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const luft = zahl(el, "punkt_luft", 8);
      const von = x + polster + lb + luft;
      const bis = x + sb - polster - wb - luft;
      if (bis > von) {
        u.blatt.linie(von, grundlinie + zahl(el, "punkt_hoch", 1), bis,
                      grundlinie + zahl(el, "punkt_hoch", 1), linie,
                      zahl(el, "linienbreite", 0.6), [0.6, 2.6]);
      }
    }
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
    if (linie && zeichenkette(el, "darstellung") === "fuehrungspunkte") {
      // Punktreihe zwischen Raumname und Flaeche, nicht unter der Zeile.
      const nb = u.blatt.sw(String(r.name), sName.schnitt, sName.groesse, sName.sperrung);
      const wb = text === undefined ? 0
        : u.blatt.sw(text, sFlaeche.schnitt, sFlaeche.groesse, sFlaeche.sperrung);
      const luft = zahl(el, "punkt_luft", 8);
      const von = el.x + nb + luft;
      const bis = el.x + el.b - wb - luft;
      if (bis > von) {
        u.blatt.linie(von, y + zahl(el, "punkt_hoch", 2), bis,
                      y + zahl(el, "punkt_hoch", 2), linie,
                      zahl(el, "linienbreite", 0.6), [0.6, 2.6]);
      }
    } else if (linie) {
      u.blatt.linie(el.x, y - zahl(el, "linien_versatz", 6), el.x + el.b,
                    y - zahl(el, "linien_versatz", 6), linie,
                    zahl(el, "linienbreite", 0.5));
    }
    y -= zh;
  }
  if (wahr(el, "mit_summe", true) && summe > 0) {
    const balken = farbRef(el, "summe_flaeche", u);
    const sSummeWert = zeichenkette(el, "stil_summe_wert")
      ? u.stil(zeichenkette(el, "stil_summe_wert")!) : sSumme;
    if (balken) {
      // Die Summe sitzt in einem eigenen Balken statt frei darunter.
      const bh = zahl(el, "summe_hoehe", 26);
      const by = y - zahl(el, "summe_versatz", 14);
      u.blatt.rect(el.x, by, el.b, bh, balken, null, zahl(el, "summe_radius", 0));
      const polster = zahl(el, "summe_polster", 10);
      const ys = by + zahl(el, "summe_grundlinie", 9);
      u.blatt.T(el.x + polster, ys, gross(sSumme, zeichenkette(el, "summe_label") ?? "Summe"),
                sSumme.schnitt, sSumme.groesse, sSumme.farbe, sSumme.sperrung);
      u.blatt.T(el.x + el.b - polster, ys, `${zahlDe(summe, 1)} ${einheit}`,
                sSummeWert.schnitt, sSummeWert.groesse, sSummeWert.farbe,
                sSummeWert.sperrung, "r");
      return;
    }
    const ys = y - zahl(el, "summe_versatz", 2);
    u.blatt.T(el.x, ys, gross(sSumme, zeichenkette(el, "summe_label") ?? "Summe"),
              sSumme.schnitt, sSumme.groesse, sSumme.farbe, sSumme.sperrung);
    u.blatt.T(el.x + el.b, ys, `${zahlDe(summe, 1)} ${einheit}`, sSummeWert.schnitt,
              sSummeWert.groesse, sSummeWert.farbe, sSummeWert.sperrung, "r");
  }
};

// ----------------------------------------------------------------- distanzen

/** Entfernungen als Balken, Punktlinie oder Wegezeiten-Tabelle. */
const distanzen: Zeichner = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.lage_distanzen";
  const roh = liste(u.daten, quelle) as { ziel?: string; name?: string;
                                          km?: number; minuten?: number;
                                          wert?: string }[];
  type Entfernung = { name: string; km?: number; minuten?: number; wert?: string };
  const eintraege: Entfernung[] = [];
  for (const d of roh) {
    const name = d.ziel ?? d.name;
    if (!name) continue;
    eintraege.push({ name, km: d.km, minuten: d.minuten, wert: d.wert });
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

  // "wege": drei Zahlenspalten (zu Fuss, Rad, Auto) statt eines Balkens.
  // Die Spalten stehen in der Vorlage, weil ihre Breite zur Schrift
  // gehoert und nicht zum Datensatz.
  if (art === "wege") {
    const spalten = (el["spalten_x"] as number[] | undefined) ?? [-98, -52, -6];
    const kopf = (el["spaltenkopf"] as string[] | undefined) ?? [];
    const sKopf = zeichenkette(el, "stil_kopf") ? u.stil(zeichenkette(el, "stil_kopf")!) : null;
    const sErste = zeichenkette(el, "stil_wert_erster")
      ? u.stil(zeichenkette(el, "stil_wert_erster")!) : sWert;
    const linieWege = farbRef(el, "linien_farbe", u);
    const zhWege = zahl(el, "zeilenhoehe", 23);
    let yy = el.y + el.h;
    if (sKopf && kopf.length) {
      kopf.forEach((k, i) => {
        u.blatt.T(el.x + el.b + spalten[i], yy, k.toLocaleUpperCase("de-DE"),
                  sKopf.schnitt, sKopf.groesse, sKopf.farbe, sKopf.sperrung, "r");
      });
      yy -= zahl(el, "kopf_abstand", 24);
    }
    const kopflinie = farbRef(el, "kopflinie_farbe", u);
    if (kopflinie) {
      u.blatt.linie(el.x, yy + zahl(el, "kopflinie_versatz", 6), el.x + el.b,
                    yy + zahl(el, "kopflinie_versatz", 6), kopflinie,
                    zahl(el, "kopflinie_breite", 1.2));
      yy -= zahl(el, "nach_kopflinie", 18);
    }
    const felder = (el["felder"] as string[] | undefined) ?? ["fuss", "rad", "auto"];
    for (const d of roh) {
      const name = d.ziel ?? d.name;
      if (!name) continue;
      u.blatt.T(el.x, yy, name, sName.schnitt, sName.groesse, sName.farbe,
                sName.sperrung);
      felder.forEach((f, i) => {
        const v = (d as unknown as Record<string, unknown>)[f];
        if (v === undefined || v === null) return;
        const st = i === 0 ? sErste : sWert;
        u.blatt.T(el.x + el.b + spalten[i], yy, String(v), st.schnitt, st.groesse,
                  st.farbe, st.sperrung, "r");
      });
      if (linieWege) {
        u.blatt.linie(el.x, yy - zahl(el, "linien_versatz", 8), el.x + el.b,
                      yy - zahl(el, "linien_versatz", 8), linieWege,
                      zahl(el, "linienbreite", 0.8));
      }
      yy -= zhWege;
    }
    return;
  }

  let y = el.y + el.h;
  for (const d of eintraege) {
    u.blatt.T(el.x, y, d.name, sName.schnitt, sName.groesse, sName.farbe,
              sName.sperrung);
    // Eine Entfernung kann als Zahl gefuehrt sein (dann rechnet der
    // Renderer die Einheit dazu) oder schon als Text ("1,2 km", "10 Min.").
    const text = d.wert !== undefined ? d.wert
               : d.km !== undefined ? `${zahlDe(d.km, 1)} km`
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
    } else if (art === "fuehrungspunkte" && grund) {
      const nb = u.blatt.sw(d.name, sName.schnitt, sName.groesse, sName.sperrung);
      const wb = text === undefined ? 0
        : u.blatt.sw(text, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const luft = zahl(el, "punkt_luft", 8);
      const von = el.x + nb + luft;
      const bis = el.x + el.b - wb - luft;
      if (bis > von) {
        u.blatt.linie(von, y + zahl(el, "punkt_hoch", 2), bis,
                      y + zahl(el, "punkt_hoch", 2), grund,
                      zahl(el, "linienbreite", 0.6), [0.6, 2.6]);
      }
    }
    y -= zh;
  }
};

// ---------------------------------------------------------------- highlights

/** Drei bis sechs Highlights als Karten oder nummerierte Liste. */
const highlights: Zeichner = (el, u) => {
  // Eintraege koennen in der Vorlage stehen statt im Objekt. Das ist kein
  // Hintertuerchen: "So geht es weiter" und die Hinweiskacheln zu
  // Provision und Grunderwerbsteuer sind fuer jedes Objekt dieselben.
  // Objektdaten dagegen stehen nie in der Vorlage — das waere eine
  // erfundene Angabe.
  const quelle = zeichenkette(el, "feld") ?? "objekt.expose_highlights";
  const roh = (el["eintraege"] as unknown[] | undefined) ?? liste(u.daten, quelle);
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
        const kreis = farbRef(el, "nummer_kreis", u);
        if (kreis) {
          // Die Nummer sitzt in einer gefuellten Scheibe, mittig.
          const r = zahl(el, "nummer_radius", 12);
          const cx = x + zahl(el, "nummer_kreis_x", 26);
          const cy = el.y + el.h - zahl(el, "nummer_kreis_y", 26);
          u.blatt.kreis(cx, cy, r, kreis);
          u.blatt.T(cx, y, String(i + 1), sNummer.schnitt, sNummer.groesse,
                    sNummer.farbe, sNummer.sperrung, "c");
        } else {
          u.blatt.T(x + polster, y, String(i + 1).padStart(2, "0"), sNummer.schnitt,
                    sNummer.groesse, sNummer.farbe, sNummer.sperrung);
        }
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

  // Nummerierte Liste. "fliessend" laesst jedem Eintrag so viel Platz,
  // wie sein Text braucht, haelt aber einen Mindestabstand ein — ein
  // einzeiliges Highlight soll nicht an das naechste stossen.
  const fliessend = art === "nummern_fliessend";
  const zh = zahl(el, "zeilenhoehe", 24);
  const einzug = zahl(el, "einzug", 24);
  const regelnText = satzRegeln(u.vorlage.stil.farben.ableitung, false);
  let y = el.y + el.h;
  eintraege.forEach((h, i) => {
    if (sNummer) {
      const nummer = fliessend ? String(i + 1) : String(i + 1).padStart(2, "0");
      u.blatt.T(el.x, y, nummer, sNummer.schnitt, sNummer.groesse, sNummer.farbe,
                sNummer.sperrung);
    }
    if (fliessend) {
      const unten = u.blatt.absatz(el.x + einzug, y + zahl(el, "text_hoch", 14),
                                   h.titel, el.b - zahl(el, "textbreite_abzug", 56),
                                   sTitel.schnitt, sTitel.groesse, sTitel.zeilenhoehe,
                                   sTitel.farbe, regelnText);
      y = Math.min(y - zahl(el, "mindestabstand", 50),
                   unten - zahl(el, "nachabstand", 26));
      return;
    }
    u.blatt.T(el.x + einzug, y, h.titel, sTitel.schnitt, sTitel.groesse,
              sTitel.farbe, sTitel.sperrung);
    y -= zh;
  });
};

// --------------------------------------------------------------- ausstattung

/** Ausstattungspunkte als Checkliste, Gruppen oder nummeriert. */
const ausstattung: Zeichner = (el, u) => {
  const art0 = zeichenkette(el, "darstellung") ?? "checkliste";
  const quelle = zeichenkette(el, "feld")
    ?? (art0 === "gruppen" ? "objekt.expose_ausstattung_gruppen"
                           : "objekt.beschreibung_ausstattung_expose");
  const roh = art0 === "gruppen" ? undefined : wert(u.daten, quelle);
  const punkte = (roh ?? "").split("\n").map((z) => z.trim()).filter(Boolean);
  if (art0 !== "gruppen" && !punkte.length) {
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
  const art = art0;
  const polster = zahl(el, "polster", 10);
  const einzug = zahl(el, "einzug", 28);

  // Gruppen: die Ausstattung ist nach Themen geordnet ("Architektur",
  // "Technik"), jede Gruppe mit Nummer, Ueberschrift und eigener Liste.
  // Quelle ist objekt.expose_ausstattung_gruppen.
  if (art === "gruppen") {
    const gruppen = (liste(u.daten, zeichenkette(el, "feld") ?? "objekt.expose_ausstattung_gruppen") as
      { titel?: string; punkte?: string[] }[])
      .filter((g) => g && g.titel && Array.isArray(g.punkte) && g.punkte.length);
    if (!gruppen.length) {
      warne(u, "fehlender_wert", el, "Keine Ausstattungsgruppen — das Element entfaellt.");
      return;
    }
    const sNummer = stilVon(el, u, "stil_nummer");
    const sTitel = stilVon(el, u, "stil_titel");
    const gh = zahl(el, "gruppe_hoehe", 230);
    const titelLinie = farbRef(el, "titel_linie_farbe", u);
    const zeilenLinie = farbRef(el, "linien_farbe", u);
    gruppen.forEach((g, i) => {
      const spalte = i % spalten;
      const reihe = Math.floor(i / spalten);
      const x = el.x + spalte * (sb + abstand);
      const y = el.y + el.h - reihe * gh;
      u.blatt.T(x, y - zahl(el, "nummer_hoch", 0), String(i + 1).padStart(2, "0"),
                sNummer.schnitt, sNummer.groesse, sNummer.farbe, sNummer.sperrung);
      u.blatt.T(x + einzug, y + zahl(el, "titel_hoch", 4), gross(sTitel, g.titel!),
                sTitel.schnitt, sTitel.groesse, sTitel.farbe, sTitel.sperrung);
      if (titelLinie) {
        u.blatt.linie(x, y - zahl(el, "titel_linie_tief", 14), x + sb,
                      y - zahl(el, "titel_linie_tief", 14), titelLinie,
                      zahl(el, "titel_linienbreite", 0.6));
      }
      let iy = y - zahl(el, "erste_zeile", 40);
      for (const punkt of g.punkte!) {
        u.blatt.T(x, iy, punkt, s.schnitt, s.groesse, s.farbe, s.sperrung);
        if (zeilenLinie) {
          u.blatt.linie(x, iy - zahl(el, "zeilen_linie_tief", 12), x + sb,
                        iy - zahl(el, "zeilen_linie_tief", 12), zeilenLinie,
                        zahl(el, "linienbreite", 0.4));
        }
        iy -= zh;
      }
    });
    return;
  }

  // Nummeriert: laufende Nummer links, Punkt daneben, Trennlinie
  // darunter — die letzte Zeile einer Spalte kraeftiger.
  if (art === "nummeriert") {
    const sNummer = stilVon(el, u, "stil_nummer");
    const jeSpalte = Math.ceil(punkte.length / spalten);
    const linie = farbRef(el, "linien_farbe", u);
    const schluss = farbRef(el, "schluss_farbe", u) ?? linie;
    punkte.forEach((p, i) => {
      const sp = Math.floor(i / jeSpalte);
      const reihe = i % jeSpalte;
      const x = el.x + sp * (sb + abstand);
      const y = el.y + el.h - reihe * zh;
      u.blatt.T(x, y - zahl(el, "nummer_versatz", 22),
                String(i + 1).padStart(2, "0"), sNummer.schnitt, sNummer.groesse,
                sNummer.farbe, sNummer.sperrung);
      u.blatt.T(x + einzug, y - zahl(el, "text_versatz", 18), p, s.schnitt,
                s.groesse, s.farbe, s.sperrung);
      const letzte = reihe === jeSpalte - 1;
      const strich = letzte ? schluss : linie;
      if (strich) {
        u.blatt.linie(x, y - zahl(el, "linien_versatz", 32), x + sb,
                      y - zahl(el, "linien_versatz", 32), strich,
                      letzte ? zahl(el, "schluss_breite", 1.2)
                             : zahl(el, "linienbreite", 0.8));
      }
    });
    return;
  }

  // Alle Masse zaehlen von der Oberkante der Zeile nach unten — so
  // rechnen die Prototypen, und so bleibt eine Zeile zusammen, wenn der
  // Rahmen sich aendert.
  punkte.forEach((p, i) => {
    const sp = i % spalten;
    const reihe = Math.floor(i / spalten);
    const x = el.x + sp * (sb + abstand);
    const y = el.y + el.h - reihe * zh;
    if (fuell) {
      u.blatt.rect(x, y - zahl(el, "kachel_versatz", 10), sb,
                   zahl(el, "kachel_hoehe", zh - 6), fuell, null,
                   zahl(el, "eckradius", 6));
    }
    if (art === "checkliste" && haken) {
      hakenZeichnen(u, x + polster, y - zahl(el, "haken_versatz", 2), haken,
                    hakenInnen, zahl(el, "haken_groesse", 9));
    }
    u.blatt.T(x + einzug, y - zahl(el, "text_versatz", -0.5), p, s.schnitt,
              s.groesse, s.farbe, s.sperrung);
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

const ANKER_X: Record<string, number> = { links: 0, mitte: 0.5, rechts: 1 };
const ANKER_Y: Record<string, number> = { unten: 0, mitte: 0.5, oben: 1 };

/**
 * Wo ein Bild in seinem Rahmen sitzt. Ohne Angabe mittig — dann wird kein
 * Anker in den Zeichenschritt geschrieben, und die Schritte bleiben die
 * der Prototypen.
 *
 * Wichtig fuer Logos: deren Rahmen ist breit, damit ein Wortzeichen gross
 * genug wird. Ein quadratisches Bildzeichen im selben breiten Rahmen muss
 * aber am Satzrand stehen bleiben und nicht in die Rahmenmitte rutschen.
 */
function bildAnker(el: Element): [number, number] | undefined {
  const x = ANKER_X[zeichenkette(el, "ausrichtung") ?? ""] ?? 0.5;
  const y = ANKER_Y[zeichenkette(el, "vertikal") ?? ""] ?? 0.5;
  return x === 0.5 && y === 0.5 ? undefined : [x, y];
}

/**
 * Ein Bildslot. Fehlt das Bild, zeichnet der Renderer einen Platzhalter —
 * und sagt es in den Warnungen. Die gezeichneten Haeuser und Villen der
 * Prototypen sind laut Auftrag ausdruecklich NUR Platzhalter; im Produkt
 * stehen dort Objektfotos. Darum wird hier kein Haus gemalt, sondern ein
 * ruhiger Rahmen mit Beschriftung.
 */
const bild: Zeichner = (el, u) => {
  const roh = el["slot"] as { art?: string; nr?: number } | undefined;
  // Nur die durchnummerierten Arten wandern mit dem Lauf. Logo,
  // Titelbild, Lageplan und Ansprechpartner haben keine Nummer und
  // bleiben, wo sie sind — auch auf einer wiederholten Seite.
  // "slot_fertig" setzt die Galerie an ihren Kindern: sie hat den Versatz
  // schon eingerechnet, weil sie ihn zum Zaehlen braucht. Ohne diese
  // Klammer kaeme er zweimal drauf — am 07.10.2026 zeigte der vierte
  // Durchgang dadurch Foto 31 statt 19, und das Expose hatte vier graue
  // Kaesten statt vier Bildern.
  const versatz = wahr(el, "slot_fertig", false) ? 0 : laufVersatz(u);
  const slot = (versatz && roh && typeof roh.nr === "number"
                && NUMMERIERT.has(roh.art ?? ""))
    ? { ...roh, nr: roh.nr + versatz }
    : roh;
  const schluessel = bildSchluessel(slot);
  const quelle = schluessel ? wert(u.daten, schluessel) : undefined;
  const radius = zahl(el, "eckradius", 0);

  // Der Rahmen wird immer maskiert, auch beim Platzhalter. Ein Foto im
  // Modus "cover" laeuft sonst ueber die Kante, und der Vergleich mit den
  // Prototypen erkennt den Bildrahmen daran, dass dort eine Maske steht.
  const maske: PfadSchritt[] = radius
    ? [["roundRect", el.x, el.y, el.b, el.h, radius]]
    : [["rect", el.x, el.y, el.b, el.h]];
  const zweck = `bild:${slot?.art ?? "?"}`;
  if (quelle !== undefined) {
    u.blatt.gruppe(maske, [1, 0, 0, 1, 0, 0], (b) => {
      b.bild(el.x, el.y, el.b, el.h, quelle,
             (zeichenkette(el, "fuellmodus") as "cover" | "contain") ?? "cover",
             bildAnker(el));
    }, zweck);
  } else {
    warne(u, "fehlendes_bild", el,
          `Kein Bild fuer ${slot?.art ?? "diesen Slot"} — Platzhalter gesetzt.`);
    const fuell = farbRef(el, "platzhalter_farbe", u)
      ?? farbe({ palette: "surf" }, u.palette);
    u.blatt.gruppe(maske, [1, 0, 0, 1, 0, 0], (b) => {
      b.rect(el.x, el.y, el.b, el.h, fuell, null, radius);
    }, zweck);
  }

  // Ein mit KI bearbeitetes Bild wird gekennzeichnet, sichtbar und im
  // Export. CLAUDE.md laesst dazu keinen Spielraum, und die Kennzeichnung
  // gehoert an das Bild, nicht in eine Fussnote: wer das Expose
  // ueberfliegt, sieht sie dort und nur dort.
  //
  // Welche Bilder bearbeitet sind, sagen die Daten (objekt.ki_bilder) —
  // nicht die Vorlage. Eine Vorlage kann das nicht wissen, und sie darf es
  // auch nicht abschalten koennen.
  if (quelle !== undefined) kiKennzeichnen(el, u, String(quelle));

  // Die Beschriftung darf vom Slot selbst kommen (fork_64). Auf einer
  // wiederholten Seite waere eine fest geschriebene Beschriftung immer die
  // des ersten Durchgangs; sie muss der Nummer folgen, die gerade gilt.
  const mitLabel = (el["label"] === undefined
                    && wahr(el, "label_vom_slot", false) && schluessel)
    ? { ...el, label: `{{${schluessel}.titel?}}` } as Element
    : el;
  const label = inhalt(mitLabel, u, false, "label");
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

/**
 * "MIT KI BEARBEITET" in der oberen Ecke des Bildes.
 *
 * Masse und Schrift stehen hier und nicht in der Vorlage: eine
 * Pflichtkennzeichnung, die der Vorlagenautor kleiner stellen oder
 * wegnehmen kann, ist keine. Die Schrift ist die Beschriftungsschrift der
 * Vorlage, damit das Schild nicht wie ein Fremdkoerper wirkt.
 */
function kiKennzeichnen(el: Element, u: Umgebung, quelle: string): void {
  const liste = u.daten["objekt.ki_bilder"];
  if (!Array.isArray(liste) || !liste.map(String).includes(quelle)) return;
  const s = "MIT KI BEARBEITET";
  const schnitt = schnittName(u.vorlage.stil.schriften.label);
  const groesse = 5.5, sperrung = 1.4;
  const b = u.blatt.sw(s, schnitt, groesse, sperrung);
  const h = 13;
  const x = el.x + 8;
  const y = el.y + el.h - 8 - h;
  u.blatt.rect(x, y, b + 14, h, [0, 0, 0, 0.72], null, 0);
  u.blatt.T(x + 7, y + 4, s, schnitt, groesse, [1, 1, 1, 1], sperrung);
}

/** Bildarten, deren Slotnummer dem Lauf einer wiederholten Seite folgt. */
const NUMMERIERT = new Set(["foto", "grundriss", "foto_kategorie"]);

function bildSchluessel(slot: { art?: string; nr?: number; ton?: string;
                                kategorie?: string } | undefined): string | undefined {
  if (!slot?.art) return undefined;
  switch (slot.art) {
    case "titelbild": return "objekt.hauptbild_url";
    case "foto": return `bild.foto.${slot.nr ?? 1}`;
    case "foto_kategorie": return `bild.kategorie.${slot.kategorie ?? ""}.${slot.nr ?? 1}`;
    case "grundriss": return `bild.grundriss.${slot.nr ?? 1}`;
    case "lageplan": return "bild.lageplan";
    case "ansprechpartner": return "ansprechpartner.foto";
    // Der Ton gehoert in den Schluessel: ein Logo auf dunklem Grund ist
    // eine ANDERE Datei als dasselbe Logo auf hellem. Ohne die
    // Unterscheidung stand auf der dunklen Kontaktseite ein dunkles Logo.
    case "logo": return `firma.logo.${slot.ton === "dunkel" ? "dunkel" : "hell"}`;
    case "asset": return `bild.asset.${(slot as { pfad?: string }).pfad ?? ""}`;
    default: return undefined;
  }
}

// -------------------------------------------------------------- energieskala

type EnergieKlasse = { name: string; grenze: number; farbe: string };

/**
 * Die Skala der Energieeffizienzklassen mit Markierung.
 *
 * Die Klassen und ihre Grenzen stehen in der Vorlage, nicht hier: sie
 * folgen dem Gebaeudeenergiegesetz, und wenn der Gesetzgeber sie aendert,
 * soll man eine Vorlage pflegen und nicht den Renderer neu ausliefern.
 *
 * Die Markierung sitzt da, wo der Kennwert INNERHALB seiner Klasse liegt,
 * nicht in der Klassenmitte — 62,4 kWh/(m²a) steht knapp hinter dem
 * Anfang von B, nicht mittig darin.
 */
const energieskala: Zeichner = (el, u) => {
  const klassen = (el["klassen"] as EnergieKlasse[] | undefined) ?? [];
  if (!klassen.length) {
    warne(u, "unbekannt", el, "Die Skala nennt keine Klassen.");
    return;
  }

  // "stufen": nur die Leiste, die eigene Klasse hervorgehoben, ohne
  // Grenzwerte und ohne Markierung. Das ist die knappe Fassung, die
  // Studio benutzt.
  if (zeichenkette(el, "darstellung") === "stufen") {
    const sKlasse = stilVon(el, u, "stil_klasse");
    const sAktiv = zeichenkette(el, "stil_klasse_aktiv")
      ? u.stil(zeichenkette(el, "stil_klasse_aktiv")!) : sKlasse;
    const eigene = (u.daten[zeichenkette(el, "feld") ?? "objekt.energie_klasse"] ?? "")
      .toString().trim().toLocaleUpperCase("de-DE");
    const bw = el.b / klassen.length;
    const luecke = zahl(el, "luecke", 3);
    klassen.forEach((k, i) => {
      const aktiv = k.name.toLocaleUpperCase("de-DE") === eigene;
      const x = el.x + i * bw;
      u.blatt.rect(x, el.y, bw - luecke, el.h,
                   farbe(aktiv ? (zeichenkette(el, "aktiv_farbe") ?? k.farbe) : k.farbe,
                         u.palette), null, zahl(el, "eckradius", 0));
      const st = aktiv ? sAktiv : sKlasse;
      const hell = (el["helle_klassen"] as string[] | undefined) ?? [];
      const stil = !aktiv && hell.includes(k.name) && zeichenkette(el, "stil_klasse_hell")
        ? u.stil(zeichenkette(el, "stil_klasse_hell")!) : st;
      u.blatt.T(x + (bw - luecke) / 2, el.y + zahl(el, "klasse_grundlinie", 8),
                k.name, stil.schnitt, stil.groesse, stil.farbe, stil.sperrung, "c");
    });
    return;
  }
  // "linie": eine schmale Leiste, die Klassen darunter, die Markierung
  // darueber — ohne Grenzwerte und ohne Fahne. So steht sie im
  // Energiefeld der Luxusvorlage.
  const schmal = zeichenkette(el, "darstellung") === "linie";
  const kennwertRoh = rohzahl(u.daten, zeichenkette(el, "feld") ?? "objekt.energie_kennwert");
  const sKlasse = stilVon(el, u, "stil_klasse");
  const sGrenze = stilVon(el, u, "stil_grenze");
  const bh = zahl(el, "balken_hoehe", 34);
  const luft = zahl(el, "luft", 1);
  const bw = el.b / klassen.length;
  const yBalken = el.y + el.h - bh;

  klassen.forEach((k, i) => {
    const x = el.x + i * bw;
    u.blatt.rect(x + luft, yBalken, bw - 2 * luft, bh,
                 farbe(k.farbe, u.palette), null, zahl(el, "eckradius", schmal ? 0 : 4));
    if (schmal) {
      const erste = i === 0 && zeichenkette(el, "stil_klasse_erste")
        ? u.stil(zeichenkette(el, "stil_klasse_erste")!) : sKlasse;
      u.blatt.T(x + bw / 2, yBalken - zahl(el, "klasse_abstand", 14), k.name,
                erste.schnitt, erste.groesse, erste.farbe, erste.sperrung, "c");
      return;
    }
    u.blatt.T(x + bw / 2, yBalken + zahl(el, "klasse_grundlinie", 12), k.name,
              sKlasse.schnitt, sKlasse.groesse, sKlasse.farbe, sKlasse.sperrung, "c");
    const untergrenze = i === 0 ? 0 : klassen[i - 1].grenze;
    u.blatt.T(x + bw / 2, yBalken - zahl(el, "grenze_abstand", 12),
              zahlDe(untergrenze, 0), sGrenze.schnitt, sGrenze.groesse,
              sGrenze.farbe, sGrenze.sperrung, "c");
  });

  const einheit = schmal ? undefined : zeichenkette(el, "einheit");
  if (einheit) {
    u.blatt.T(el.x + el.b, yBalken - zahl(el, "grenze_abstand", 12), einheit,
              sGrenze.schnitt, sGrenze.groesse, sGrenze.farbe, sGrenze.sperrung, "r");
  }

  if (kennwertRoh === undefined) {
    warne(u, "fehlender_wert", el,
          "Kein Energiekennwert — die Skala steht ohne Markierung.");
    return;
  }
  let marke = el.x;
  let vorige = 0;
  let getroffen = -1;
  for (let i = 0; i < klassen.length; i++) {
    const g = klassen[i].grenze;
    if (kennwertRoh <= g) {
      marke = el.x + i * bw + (bw * (kennwertRoh - vorige)) / (g - vorige);
      getroffen = i;
      break;
    }
    vorige = g;
    if (i === klassen.length - 1) { marke = el.x + el.b; getroffen = i; }
  }
  // Kennwert und Klasse koennen sich widersprechen — beides sind gepflegte
  // Felder, und der Ausweis sagt nur eines davon. Die Markierung folgt dem
  // Kennwert; der Makler soll aber erfahren, dass daneben eine andere Klasse
  // steht. Am 06.10.2026 zeigte dieselbe Immobilie in der einen Vorlage "C"
  // (aus dem Feld) und in der anderen die Markierung bei "A" (aus 46 kWh).
  const genannt = String(u.daten["objekt.energie_klasse"] ?? "").trim()
    .toLocaleUpperCase("de-DE");
  if (genannt && getroffen >= 0
      && klassen[getroffen].name.toLocaleUpperCase("de-DE") !== genannt) {
    warne(u, "gekuerzt", el,
          `Der Kennwert ${zahlDe(kennwertRoh, 0)} liegt in Klasse `
          + `${klassen[getroffen].name}, am Objekt steht aber Klasse ${genannt}. `
          + `Die Markierung folgt dem Kennwert — bitte den Energieausweis pruefen.`);
  }

  const tinte = farbRef(el, "marke_farbe", u) ?? [0, 0, 0, 1];
  const spitze = zahl(el, "marke_spitze", 4);
  const hoehe = zahl(el, "marke_hoehe", 10);
  const halb = zahl(el, "marke_breite", 6);
  u.blatt.pfad(
    [["moveTo", marke, yBalken + bh + spitze],
     ["lineTo", marke - halb, yBalken + bh + spitze + hoehe],
     ["lineTo", marke + halb, yBalken + bh + spitze + hoehe],
     ["close"]], tinte);
  if (schmal) return;
  const fb = zahl(el, "fahne_breite", 104);
  const fh = zahl(el, "fahne_hoehe", 26);
  const fy = yBalken + bh + zahl(el, "fahne_abstand", 18);
  u.blatt.rect(marke - fb / 2, fy, fb, fh, tinte, null, zahl(el, "fahne_radius", 6));
  const sFahne = stilVon(el, u, "stil_fahne");
  const text = zeichenkette(el, "fahne_text") ?? "{{objekt.energie_kennwert}}";
  const beschriftung = ersetze(u.daten, text);
  if (beschriftung !== undefined) {
    u.blatt.T(marke, fy + zahl(el, "fahne_grundlinie", 9), beschriftung,
              sFahne.schnitt, sFahne.groesse, sFahne.farbe, sFahne.sperrung, "c");
  }
};

function rohzahl(daten: Record<string, unknown>, schluessel: string): number | undefined {
  const v = daten[schluessel];
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ------------------------------------------------------------ kostenrechnung

/**
 * Die Nebenkosten eines Kaufs: ein gestapelter Balken, darunter die
 * Posten mit Betrag und zum Schluss der Gesamtaufwand.
 *
 * Gerechnet wird hier nichts. Die Posten kommen fertig aus rechnung.posten
 * — dieselbe Rechnung, die auch die Edge Function benutzt. Zwei
 * Rechenwege fuer denselben Betrag waeren zwei Betraege.
 */
const kostenrechnung: Zeichner = (el, u) => {
  // Die Bezeichnungen stehen in der Vorlage, die Betraege in den Daten.
  // Das muss so herum sein: Raster schreibt "Notar & Grundbuch (ca. 2,0 %)",
  // Studio "Notar & Grundbuch ca. 2,0 %" — dieselbe Zahl, zwei
  // Schreibweisen. Stuende der Text in den Daten, koennte nur eine der
  // beiden Vorlagen recht haben.
  type Posten = { name: string; betrag: number };
  const vorgaben = el["posten"] as { label: string; feld: string }[] | undefined;
  const posten: Posten[] = [];
  if (vorgaben) {
    for (const v of vorgaben) {
      const betrag = Number(u.daten[v.feld]);
      if (!Number.isFinite(betrag)) continue;
      const label = ersetze(u.daten, v.label);
      if (label === undefined) continue;
      posten.push({ name: label, betrag });
    }
  } else {
    for (const p of liste(u.daten, zeichenkette(el, "feld") ?? "rechnung.posten") as
         { name?: string; betrag?: number }[]) {
      if (!p || typeof p.name !== "string" || !Number.isFinite(Number(p.betrag))) continue;
      posten.push({ name: p.name, betrag: Number(p.betrag) });
    }
  }
  if (!posten.length) {
    warne(u, "fehlender_wert", el, "Keine Kostenposten — das Element entfaellt.");
    return;
  }
  const summe = posten.reduce((a, p) => a + Number(p.betrag), 0);
  // Die Farben werden nur gelesen, wenn sie gebraucht werden. Studio
  // zeigt die Posten ohne Balken und ohne Punkte — und seine Palette hat
  // die Farbnamen gar nicht, die eine andere Vorlage hier nennt.
  const farbliste = (el["farben"] as FarbRef[] | undefined) ?? [];
  const braucht = zahl(el, "balken_hoehe", 16) > 0 || zahl(el, "punkt_groesse", 8) > 0;
  if (braucht && !farbliste.length) {
    warne(u, "unbekannt", el,
          "Balken oder Punkte sollen gezeichnet werden, aber die Vorlage nennt " +
          "keine Farben.");
  }
  const farben = farbliste.length
    ? farbliste.map((f) => farbe(f, u.palette))
    : [farbe({ palette: "schwarz" }, u.palette)];

  // Der gestapelte Balken ist nicht Pflicht: Studio zeigt die Posten nur
  // als Liste. balken_hoehe 0 laesst ihn weg.
  const bh = zahl(el, "balken_hoehe", 16);
  const yBalken = el.y + el.h - bh;
  if (bh > 0) {
    let x = el.x;
    posten.forEach((p, i) => {
      const b = (el.b * Number(p.betrag)) / summe;
      u.blatt.rect(x, yBalken, b, bh, farben[i % farben.length], null,
                   zahl(el, "balken_radius", 0));
      x += b;
    });
  }

  const sName = stilVon(el, u, "stil_name");
  const sWert = stilVon(el, u, "stil_wert");
  const zh = zahl(el, "zeilenhoehe", 26);
  const spalte = zahl(el, "wert_spalte", el.b);
  const linie = farbRef(el, "linien_farbe", u);
  const punktGroesse = zahl(el, "punkt_groesse", 8);
  let y = yBalken - zahl(el, "liste_abstand", 30);

  posten.forEach((p, i) => {
    if (punktGroesse > 0) {
      u.blatt.rect(el.x, y - zahl(el, "punkt_versatz", 1), punktGroesse, punktGroesse,
                   farben[i % farben.length], null, zahl(el, "punkt_radius", 2));
    }
    u.blatt.T(el.x + zahl(el, "einzug", 16), y, p.name, sName.schnitt, sName.groesse,
              sName.farbe, sName.sperrung);
    u.blatt.T(el.x + spalte, y, `${zahlDe(Number(p.betrag), 0)} €`, sWert.schnitt,
              sWert.groesse, sWert.farbe, sWert.sperrung, "r");
    if (linie && zeichenkette(el, "darstellung") === "fuehrungspunkte") {
      const nb = u.blatt.sw(p.name, sName.schnitt, sName.groesse, sName.sperrung);
      const betrag = `${zahlDe(Number(p.betrag), 0)} €`;
      const wb = u.blatt.sw(betrag, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const luft = zahl(el, "punkt_luft", 10);
      const von = el.x + zahl(el, "einzug", 16) + nb + luft;
      const bis = el.x + spalte - wb - luft;
      if (bis > von) {
        u.blatt.linie(von, y + zahl(el, "punkt_hoch", 3), bis,
                      y + zahl(el, "punkt_hoch", 3), linie,
                      zahl(el, "linienbreite", 0.6), [0.6, 2.6]);
      }
    } else if (linie) {
      u.blatt.linie(el.x, y - zahl(el, "linien_versatz", 9), el.x + spalte,
                    y - zahl(el, "linien_versatz", 9), linie,
                    zahl(el, "linienbreite", 0.5));
    }
    y -= zh;
  });

  if (wahr(el, "mit_summe", true)) {
    const sSumme = stilVon(el, u, "stil_summe");
    const sSummeWert = zeichenkette(el, "stil_summe_wert")
      ? u.stil(zeichenkette(el, "stil_summe_wert")!) : sSumme;
    const flaeche = farbRef(el, "summe_flaeche", u);
    if (flaeche) {
      const sh = zahl(el, "summe_hoehe", 40);
      const sy = y - zahl(el, "summe_versatz", 30);
      const polster = zahl(el, "summe_polster", 12);
      u.blatt.rect(el.x, sy, el.b, sh, flaeche, null, zahl(el, "summe_radius", 0));
      u.blatt.T(el.x + polster, y - zahl(el, "summe_label_versatz", 14),
                gross(sSumme, zeichenkette(el, "summe_label") ?? "Gesamtaufwand"),
                sSumme.schnitt, sSumme.groesse, sSumme.farbe, sSumme.sperrung);
      u.blatt.T(el.x + el.b - polster, y - zahl(el, "summe_wert_versatz", 16),
                `${zahlDe(summe, 0)} €`, sSummeWert.schnitt, sSummeWert.groesse,
                sSummeWert.farbe, sSummeWert.sperrung, "r");
      return;
    }
    const ys = y - zahl(el, "summe_versatz", 4);
    u.blatt.T(el.x + zahl(el, "einzug", 16), ys,
              gross(sSumme, zeichenkette(el, "summe_label") ?? "Gesamtaufwand"),
              sSumme.schnitt, sSumme.groesse, sSumme.farbe, sSumme.sperrung);
    u.blatt.T(el.x + spalte, ys, `${zahlDe(summe, 0)} €`, sSummeWert.schnitt,
              sSummeWert.groesse, sSummeWert.farbe, sSummeWert.sperrung, "r");
  }
};

// ----------------------------------------------------------------- rendite

/** Brutto, Netto und Faktor als Kacheln. Werte aus rechnung.*. */
const rendite: Zeichner = (el, u) => {
  const kacheln = (el["kacheln"] as
    { label: string; feld: string; einheit?: string; stellen?: number;
      nachsatz?: string }[] | undefined) ?? [];
  const gefuellt: { label: string; wert: string; einheit?: string }[] = [];
  for (const k of kacheln) {
    // "stellen" ueberschreibt die Nachkommastellen des Katalogs: eine
    // Rendite steht hier auf zwei Stellen, sonst auf einer.
    const f = feld(k.feld);
    const w = k.stellen !== undefined && f
      ? formatiere(u.daten[k.feld], f.typ, k.stellen)
      : wert(u.daten, k.feld);
    if (w === undefined) continue;
    gefuellt.push({ label: k.label, wert: k.nachsatz ? w + k.nachsatz : w,
                    einheit: k.einheit });
  }
  if (!gefuellt.length) {
    warne(u, "fehlender_wert", el, "Keine Renditewerte — das Element entfaellt.");
    return;
  }
  const kind: Element = {
    ...el, typ: "kennzahl", variante: "kacheln",
    eintraege: gefuellt.map((k) => ({ label: k.label, wert: k.wert, einheit: k.einheit })),
  } as Element;
  kennzahl(kind, u);
};

// ------------------------------------------------------------- kontaktkarte

/**
 * Der Ansprechpartner: rundes Foto, Name, Funktion, Kontaktzeilen.
 *
 * Fehlt das Foto, bleibt der Kreis als ruhige Flaeche — ohne gemalte
 * Person. Eine gezeichnete Silhouette wuerde aussehen, als sei ein Foto
 * hinterlegt.
 */
const kontaktkarte: Zeichner = (el, u) => {
  // Das Bildfenster ist rund (Raster, Signature) oder rechteckig
  // (Studio). Beides ist derselbe Slot, nur anders beschnitten.
  const eckig = zeichenkette(el, "foto_form") === "rechteck";
  const r = zahl(el, "foto_radius", 46);
  const fx = el.x + zahl(el, "foto_x", 70);
  const fy = el.y + zahl(el, "foto_y", el.h / 2);
  const rahmen = eckig
    ? { x: el.x + zahl(el, "foto_x", 0), y: el.y + zahl(el, "foto_y", 0),
        b: zahl(el, "foto_breite", 150), h: zahl(el, "foto_hoehe", el.h) }
    : { x: fx - r, y: fy - r, b: 2 * r, h: 2 * r };
  const kind: Element = {
    ...el,
    id: `${el.id}-foto`,
    typ: "bild",
    x: rahmen.x, y: rahmen.y, b: rahmen.b, h: rahmen.h,
    eckradius: 0,
    slot: { art: "ansprechpartner" },
    fuellmodus: "cover",
    // Der Anker gilt dem Logo, nicht dem Portraet: ein "links" an der
    // Kontaktkarte darf das Foto nicht in seinem Fenster verschieben.
    ausrichtung: undefined,
    vertikal: undefined,
    platzhalter_farbe: (el["foto_platzhalter"] as unknown) ?? { palette: "surf" },
  } as Element;
  if (eckig) {
    bild(kind, u);
  } else {
    const quelle = wert(u.daten, "ansprechpartner.foto");
    u.blatt.gruppe([["circle", fx, fy, r]], [1, 0, 0, 1, 0, 0], (b) => {
      if (quelle !== undefined) {
        b.bild(rahmen.x, rahmen.y, rahmen.b, rahmen.h, quelle, "cover");
      } else {
        b.rect(rahmen.x, rahmen.y, rahmen.b, rahmen.h,
               farbRef(el, "foto_platzhalter", u) ?? farbe({ palette: "surf" }, u.palette),
               null, 0);
      }
    }, "bild:ansprechpartner");
    if (quelle === undefined) {
      warne(u, "fehlendes_bild", el, "Kein Foto des Ansprechpartners.");
    }
    const ring = farbRef(el, "ring_farbe", u);
    if (ring) {
      u.blatt.kreis(fx, fy, r + zahl(el, "ring_abstand", 5), null, ring,
                    zahl(el, "ring_breite", 0.6));
    }
  }

  const x = el.x + zahl(el, "text_x", 140);
  const sName = stilVon(el, u, "stil_name");
  const name = wert(u.daten, "ansprechpartner.name");
  let y = el.y + el.h - zahl(el, "name_versatz", 40);
  if (name !== undefined) {
    u.blatt.T(sName.ausrichtung === "mitte" ? el.x + el.b / 2 : x, y,
              gross(sName, name), sName.schnitt, sName.groesse, sName.farbe,
              sName.sperrung, ankerArt(sName.ausrichtung));
  } else {
    warne(u, "fehlender_wert", el, "Kein Name des Ansprechpartners.");
  }
  const funktion = wert(u.daten, zeichenkette(el, "feld_funktion") ?? "ansprechpartner.funktion");
  y -= zahl(el, "funktion_abstand", 16);
  if (funktion !== undefined && zeichenkette(el, "stil_funktion")) {
    const s = u.stil(zeichenkette(el, "stil_funktion")!);
    u.blatt.T(s.ausrichtung === "mitte" ? el.x + el.b / 2 : x, y, gross(s, funktion),
              s.schnitt, s.groesse, s.farbe, s.sperrung, ankerArt(s.ausrichtung));
  }

  const zeilen = (el["kontakte"] as { label: string; feld: string }[] | undefined) ?? [];
  const sLabel = stilVon(el, u, "stil_kontakt_label");
  const sWert = stilVon(el, u, "stil_kontakt_wert");
  const zh = zahl(el, "kontakt_zeilenhoehe", 16);
  const wertX = x + zahl(el, "kontakt_spalte", 50);
  y -= zahl(el, "kontakt_abstand", 24);
  // Mittig heisst: Beschriftung UND Wert zusammen zentriert, nicht jedes
  // fuer sich. Sonst stuende der Doppelpunkt mal links, mal rechts von der
  // Mitte und die Spalte flattert.
  const mittig = zeichenkette(el, "kontakt_ausrichtung") === "mitte";
  const luft = zahl(el, "kontakt_luft", 10);
  for (const z of zeilen) {
    const v = wert(u.daten, z.feld);
    if (v === undefined) continue;
    const beschriftung = gross(sLabel, z.label);
    if (mittig) {
      const lb = u.blatt.sw(beschriftung, sLabel.schnitt, sLabel.groesse, sLabel.sperrung);
      const wb = u.blatt.sw(v, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const x0 = el.x + el.b / 2 - (lb + luft + wb) / 2;
      u.blatt.T(x0, y + zahl(el, "label_hoch", 1), beschriftung, sLabel.schnitt,
                sLabel.groesse, sLabel.farbe, sLabel.sperrung);
      u.blatt.T(x0 + lb + luft, y, v, sWert.schnitt, sWert.groesse, sWert.farbe,
                sWert.sperrung);
      y -= zh;
      continue;
    }
    u.blatt.T(x, y, beschriftung, sLabel.schnitt, sLabel.groesse, sLabel.farbe,
              sLabel.sperrung);
    u.blatt.T(wertX, y, v, sWert.schnitt, sWert.groesse, sWert.farbe, sWert.sperrung);
    y -= zh;
  }
};

// --------------------------------------------------------------- rechtstext

/**
 * Mehrere betitelte Textbloecke nebeneinander — Anbieter, Hinweise,
 * Provision.
 *
 * Die Bloecke stehen in der Vorlage, weil sie fuer jedes Objekt dieselben
 * sind; Platzhalter darin werden ersetzt. Ein Block, dessen Text leer
 * bleibt, entfaellt mit seinem Titel: eine Spalte mit Ueberschrift und
 * nichts darunter sieht nach einem Fehler aus, und bei einem
 * Rechtshinweis ist das besonders schlecht.
 */
const rechtstext: Zeichner = (el, u) => {
  const bloecke = (el["bloecke"] as { titel?: string; text: string }[] | undefined) ?? [];
  if (!bloecke.length) {
    warne(u, "unbekannt", el, "Rechtstext ohne Bloecke.");
    return;
  }
  const spalten = Math.max(1, zahl(el, "spalten", bloecke.length));
  const abstand = zahl(el, "spaltenabstand", 15);
  const sb = (el.b - abstand * (spalten - 1)) / spalten;
  const sTitel = zeichenkette(el, "stil_titel")
    ? u.stil(zeichenkette(el, "stil_titel")!) : undefined;
  const sText = stilVon(el, u, "stil_text");
  const regeln = satzRegeln(u.vorlage.stil.farben.ableitung,
                            wahr(el, "blocksatz", false));

  bloecke.forEach((b, i) => {
    const text = ersetze(u.daten, b.text);
    if (text === undefined) {
      warne(u, "fehlender_wert", el,
            `Der Block "${b.titel ?? i + 1}" bleibt leer und entfaellt.`);
      return;
    }
    const x = el.x + (i % spalten) * (sb + abstand);
    let y = el.y + el.h;
    if (b.titel !== undefined && sTitel) {
      u.blatt.T(x, y, gross(sTitel, b.titel), sTitel.schnitt, sTitel.groesse,
                sTitel.farbe, sTitel.sperrung);
      const strich = farbRef(el, "titel_linie", u);
      if (strich) {
        u.blatt.linie(x, y - zahl(el, "titel_linie_tief", 12),
                      x + zahl(el, "titel_linie_breite", 24),
                      y - zahl(el, "titel_linie_tief", 12), strich,
                      zahl(el, "titel_linienbreite", 0.8));
      }
      y -= zahl(el, "titel_abstand", 16);
    }
    // Jede Zeile des Quelltexts ist ein eigener Absatz — so stehen
    // Anschriften untereinander und nicht als Fliesstext.
    for (const absatz of text.split("\n")) {
      y = u.blatt.absatz(x, y, absatz, sb, sText.schnitt, sText.groesse,
                         sText.zeilenhoehe, sText.farbe, regeln);
    }
  });
};

// --------------------------------------------------------- inhaltsverzeichnis

/**
 * Das Verzeichnis der sichtbaren Seiten. Es nennt nur, was im Dokument
 * wirklich steht: entfaellt die Energieseite, weil kein Ausweis vorliegt,
 * steht sie auch hier nicht.
 */
const inhaltsverzeichnis: Zeichner = (el, u) => {
  const eintraege = (u.daten["dokument.seiten"] as
    { nummer: number; name: string }[] | undefined) ?? [];
  const ohne = new Set((el["ohne"] as string[] | undefined) ?? []);
  const sichtbar = eintraege.filter((e) => !ohne.has(e.name));
  if (!sichtbar.length) {
    warne(u, "fehlender_wert", el, "Keine Seiten fuer das Verzeichnis.");
    return;
  }
  const sNummer = stilVon(el, u, "stil_nummer");
  const sName = stilVon(el, u, "stil_name");
  const zh = zahl(el, "zeilenhoehe", 20);
  const spalte = zahl(el, "name_spalte", 30);
  let y = el.y + el.h;
  for (const e of sichtbar) {
    u.blatt.T(el.x, y, String(e.nummer).padStart(2, "0"), sNummer.schnitt,
              sNummer.groesse, sNummer.farbe, sNummer.sperrung);
    u.blatt.T(el.x + spalte, y, e.name, sName.schnitt, sName.groesse, sName.farbe,
              sName.sperrung);
    y -= zh;
  }
};

// -------------------------------------------------------------------- karte

/**
 * Der Lageplan. Technisch ein Bildslot — das Bild erzeugt der vorhandene
 * Lageplan-Generator des Forks, mit dem Ausschnitt, den der Nutzer auf der
 * Objektseite gewaehlt hat.
 *
 * Der Quellenhinweis gehoert zum Element und nicht in ein eigenes
 * Textfeld: er ist bei OpenStreetMap-Karten Pflicht, und ein Hinweis, den
 * man versehentlich loeschen kann, ist keiner.
 */
const karte: Zeichner = (el, u) => {
  const rahmen: Element = {
    ...el,
    slot: (el["slot"] as unknown) ?? { art: "lageplan" },
    fuellmodus: zeichenkette(el, "fuellmodus") ?? "cover",
  } as Element;
  bild(rahmen, u);

  const hinweis = inhalt(el, u, false, "quellenhinweis");
  if (hinweis !== undefined && zeichenkette(el, "stil_quelle")) {
    const s = u.stil(zeichenkette(el, "stil_quelle")!);
    u.blatt.gruppe([["rect", el.x, el.y, el.b, el.h]], [1, 0, 0, 1, 0, 0], (b) => {
      b.T(ankerX(el, s.ausrichtung) - zahl(el, "quelle_x", 10),
          el.y + zahl(el, "quelle_y", 8), hinweis, s.schnitt, s.groesse,
          s.farbe, s.sperrung, ankerArt(s.ausrichtung));
    }, "bild:lageplan");
  }
};

// ------------------------------------------------------------------ galerie

/**
 * Ein Raster aus Bildslots. Die Aufteilungen sind die, die in den drei
 * Vorlagen vorkommen:
 *
 *   "gross_oben"  ein breites Bild oben, zwei gleich grosse darunter
 *   "1+2"         ein hohes Bild links, zwei gestapelte rechts
 *   "2x2"         vier gleich grosse
 *   "reihe"       n gleich breite nebeneinander
 *
 * Die Beschriftungen stehen in der Vorlage — es sind die Vorschlaege der
 * Seitenbibliothek, die ein Nutzer ueberschreibt. Fehlt eine, nimmt der
 * Renderer die Beschriftung des Fotos selbst.
 */
const galerie: Zeichner = (el, u) => {
  const layout = zeichenkette(el, "layout") ?? "gross_oben";
  const g = zahl(el, "abstand", 10);
  // Auf einer wiederholten Seite zeigt die Galerie die naechsten Fotos.
  const abNr = zahl(el, "ab_nr", 1) + laufVersatz(u);
  const beschriftungen = (el["beschriftungen"] as string[] | undefined) ?? [];

  const rahmen: { x: number; y: number; b: number; h: number }[] = [];

  // --- Galerie, die sich nach der Zahl der Bilder richtet (fork_64) -------
  //
  // Eine Seite fuer die ueberzaehligen Fotos weiss nicht, wie viele auf
  // IHREM Durchgang noch kommen: bei fuenfzehn Fotos zeigt die letzte Seite
  // drei und nicht vier. Ein festes 2x2-Raster setzte dort einen grauen
  // Kasten — drei graue Kaesten bei siebzehn Fotos. Deshalb zaehlt diese
  // Galerie erst, was wirklich da ist, und waehlt die Aufteilung danach.
  if (wahr(el, "anpassen", false)) {
    const hoechstens = Math.max(1, zahl(el, "max_bilder", 4));
    let n = 0;
    while (n < hoechstens
           && wert(u.daten, `bild.foto.${abNr + n}`) !== undefined) n++;
    if (n === 0) return;   // Die Seite sollte gar nicht entstanden sein.
    const kb = (el.b - g) / 2;
    const kh = (el.h - g) / 2;
    if (n >= 4) {
      for (const [sx, sy] of [[0, 1], [1, 1], [0, 0], [1, 0]]) {
        rahmen.push({ x: el.x + sx * (kb + g), y: el.y + sy * (kh + g),
                      b: kb, h: kh });
      }
    } else if (n === 3) {
      const gross = el.h * zahl(el, "gross_anteil", 0.46);
      const klein = el.h - gross - g;
      rahmen.push({ x: el.x, y: el.y + el.h - gross, b: el.b, h: gross });
      rahmen.push({ x: el.x, y: el.y, b: kb, h: klein });
      rahmen.push({ x: el.x + kb + g, y: el.y, b: kb, h: klein });
    } else if (n === 2) {
      // Quer nebeneinander, hoch uebereinander: zwei Fotos in einem hohen
      // Rahmen nebeneinander werden zu zwei Streifen.
      if (el.b >= el.h) {
        rahmen.push({ x: el.x, y: el.y, b: kb, h: el.h });
        rahmen.push({ x: el.x + kb + g, y: el.y, b: kb, h: el.h });
      } else {
        rahmen.push({ x: el.x, y: el.y + kh + g, b: el.b, h: kh });
        rahmen.push({ x: el.x, y: el.y, b: el.b, h: kh });
      }
    } else {
      rahmen.push({ x: el.x, y: el.y, b: el.b, h: el.h });
    }
  } else if (layout === "gross_oben") {
    const anteil = zahl(el, "gross_anteil", 0.46);
    const gross = el.h * anteil;
    const klein = el.h - gross - g;
    const kb = (el.b - g) / 2;
    rahmen.push({ x: el.x, y: el.y + el.h - gross, b: el.b, h: gross });
    rahmen.push({ x: el.x, y: el.y, b: kb, h: klein });
    rahmen.push({ x: el.x + kb + g, y: el.y, b: kb, h: klein });
  } else if (layout === "1+2") {
    const anteil = zahl(el, "gross_anteil", 0.5);
    const gb = el.b * anteil - g / 2;
    const kb = el.b - gb - g;
    const kh = (el.h - g) / 2;
    rahmen.push({ x: el.x, y: el.y, b: gb, h: el.h });
    rahmen.push({ x: el.x + gb + g, y: el.y + kh + g, b: kb, h: kh });
    rahmen.push({ x: el.x + gb + g, y: el.y, b: kb, h: kh });
  } else if (layout === "2x2") {
    const kb = (el.b - g) / 2;
    const kh = (el.h - g) / 2;
    for (const [sx, sy] of [[0, 1], [1, 1], [0, 0], [1, 0]]) {
      rahmen.push({ x: el.x + sx * (kb + g), y: el.y + sy * (kh + g), b: kb, h: kh });
    }
  } else {
    const n = Math.max(1, zahl(el, "anzahl", 3));
    const kb = (el.b - g * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      rahmen.push({ x: el.x + i * (kb + g), y: el.y, b: kb, h: el.h });
    }
  }

  rahmen.forEach((r, i) => {
    const kind: Element = {
      ...el,
      id: `${el.id}-${i + 1}`,
      typ: "bild",
      x: r.x, y: r.y, b: r.b, h: r.h,
      slot: { art: "foto", nr: abNr + i },
      slot_fertig: true,
      label: beschriftungen[i] ?? `{{bild.foto.${abNr + i}.titel?}}`,
    } as Element;
    bild(kind, u);
  });
};

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
  highlights, ausstattung, bild, galerie, karte, qr, energieskala,
  kostenrechnung, rendite, kontaktkarte, rechtstext, inhaltsverzeichnis,
};
