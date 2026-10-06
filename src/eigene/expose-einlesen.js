// ============================================================================
// Exposé — eine Vorlage aus einem fremden PDF nachbauen
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Wozu: ein Makler, der seit Jahren ein eigenes Exposé-Design benutzt, soll
// es mitbringen koennen. Er laedt sein PDF hoch, und daraus entsteht eine
// Vorlage, die er im Editor weiterbearbeitet.
//
// Der Kern ist AUSLESEN, nicht Raten. Ein PDF ist kein Bild: es traegt
// jeden Textlauf mit Ort, Groesse und Farbe, jedes gefuellte Rechteck, jede
// Linie und jedes Bild mit seinem Rahmen. pdf.js liefert beides — die
// Textschicht (getTextContent) und die Zeichenschicht (getOperatorList).
// Beides zusammen ergibt die Elemente unserer Vorlage; gerechnet wird in
// Punkt, Ursprung unten links, genau wie im Dokument.
//
// Im BROWSER und nicht in einer Edge Function. Grund steht im Kopf von
// supabase/functions/parse-expose/index.ts: "Fix gegen Status 546 /
// Memory-Limit". Ein Exposé mit vierzig Fotos sprengt den Speicher einer
// Deno-Funktion; der Browser hat damit kein Problem, und die Datei muss
// fuer diesen Schritt gar nicht erst hochgeladen werden.
//
// Was diese Stufe NICHT tut: Platzhalter setzen (aus "123 m²" wird noch
// nicht {{objekt.wohnflaeche}}), Bilder zu Slots machen, die Marke
// zuordnen. Das ist Stufe 2. Hier geht es um die Frage, die man nur an
// einem echten Kundenexposé beantworten kann: wie weit traegt die
// Geometrie?
// ============================================================================
(function () {
  "use strict";

  // --- Matrizen ----------------------------------------------------------
  // PDF rechnet mit [a,b,c,d,e,f]; dieselbe Form wie unsere Schritte.
  function mal(m1, m2) {
    return [
      m1[0] * m2[0] + m1[1] * m2[2],
      m1[0] * m2[1] + m1[1] * m2[3],
      m1[2] * m2[0] + m1[3] * m2[2],
      m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
      m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
    ];
  }
  function anwenden(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  function hex(r, g, b) {
    var z = function (v) {
      var n = Math.max(0, Math.min(255, Math.round(v)));
      return (n < 16 ? "0" : "") + n.toString(16);
    };
    return "#" + z(r) + z(g) + z(b);
  }

  // --- Schriftzuordnung --------------------------------------------------
  // Wir liefern zwanzig Schnitte. Ein fremdes Exposé benutzt Montserrat,
  // Lato, eine Hausschrift. Aus dem PDF laesst sich die Datei technisch oft,
  // lizenzrechtlich meist nicht herausziehen — also der naechstliegende
  // eigene Schnitt, und der Name des Originals bleibt am Stil stehen, damit
  // niemand raten muss, was dort einmal stand.
  var SERIFEN = /(cormorant|garamond|georgia|times|serif|playfair|minion|baskerville|didot|bodoni|merriweather|lora|spectral)/i;
  var SCHMAL = /(condensed|cond\b|narrow|oswald|impact|anton|barlowsemicondensed)/i;
  var GROTESK_HART = /(archivo|roboto|helvetica|arial|inter|barlow|din|futura)/i;

  function gewicht(name) {
    var n = String(name || "").toLowerCase();
    if (/(black|heavy|ultra|extrabold|extra bold|800|900)/.test(n)) return "ExtraBold";
    if (/(semibold|demibold|600)/.test(n)) return "SemiBold";
    if (/(bold|700)/.test(n)) return "Bold";
    if (/(medium|500)/.test(n)) return "Medium";
    if (/(thin|hairline|100|200)/.test(n)) return "Light";
    if (/(light|300)/.test(n)) return "Light";
    return "Regular";
  }

  function schriftZuordnen(name) {
    var n = String(name || "");
    var kursiv = /(italic|oblique)/i.test(n);
    var g = gewicht(n);
    if (SERIFEN.test(n)) {
      // Cormorant hat die Kursiven, aber kein Bold.
      var cs = { ExtraBold: "SemiBold", Bold: "SemiBold" }[g] || g;
      if (kursiv) {
        var ci = { Light: "LightItalic", Regular: "RegularItalic",
                   Medium: "MediumItalic", SemiBold: "MediumItalic" }[cs] || "RegularItalic";
        return { familie: "cormorant", schnitt: ci };
      }
      return { familie: "cormorant", schnitt: cs };
    }
    if (SCHMAL.test(n)) {
      return { familie: "archivo", schnitt: g === "Regular" ? "CondXB" : "CondBlack" };
    }
    if (GROTESK_HART.test(n)) {
      var as = { ExtraBold: "Bold" }[g] || g;
      return { familie: "archivo", schnitt: as };
    }
    return { familie: "jakarta", schnitt: g };
  }

  // --- Die Zeichenschicht lesen ------------------------------------------
  // Gelaufen wird die Operatorliste mit einem Zustandsstapel, wie es ein
  // PDF-Betrachter auch tut: Matrix, Fuellfarbe, Strichfarbe. Was dabei
  // herauskommt, sind Flaechen, Linien, Bilder — und die Farbe, die beim
  // Setzen eines Textes gerade galt.
  function zeichenschicht(pdfjsLib, opListe) {
    var OPS = pdfjsLib.OPS;
    var zustand = { m: [1, 0, 0, 1, 0, 0], fuell: [0, 0, 0], strich: [0, 0, 0], lb: 1 };
    var stapel = [];
    var flaechen = [], linien = [], bilder = [], textlaeufe = [];
    var EINS = [1, 0, 0, 1, 0, 0];
    var tm = EINS.slice(), tlm = EINS.slice(), durchschuss = 0;

    function kopie(z) {
      return { m: z.m.slice(), fuell: z.fuell.slice(), strich: z.strich.slice(), lb: z.lb };
    }
    function graue(g) { var v = g * 255; return [v, v, v]; }
    function cmyk(c, m, y, k) {
      return [255 * (1 - Math.min(1, c + k)), 255 * (1 - Math.min(1, m + k)),
              255 * (1 - Math.min(1, y + k))];
    }

    var pfad = null;      // { punkte: [[x,y]...], rechtecke: [[x,y,b,h]...] }

    for (var i = 0; i < opListe.fnArray.length; i++) {
      var fn = opListe.fnArray[i];
      var a = opListe.argsArray[i] || [];
      if (fn === OPS.save) { stapel.push(kopie(zustand)); continue; }
      if (fn === OPS.restore) { if (stapel.length) zustand = stapel.pop(); continue; }
      if (fn === OPS.transform) { zustand.m = mal([a[0], a[1], a[2], a[3], a[4], a[5]], zustand.m); continue; }
      // pdf.js reicht RGB in 0..255 durch, Grau und CMYK dagegen in 0..1.
      // Deshalb wird nur dort umgerechnet, und alles im Zustand steht
      // einheitlich in 0..255.
      if (fn === OPS.setFillRGBColor) { zustand.fuell = [a[0], a[1], a[2]]; continue; }
      if (fn === OPS.setFillGray) { zustand.fuell = graue(a[0]); continue; }
      if (fn === OPS.setFillCMYKColor) { zustand.fuell = cmyk(a[0], a[1], a[2], a[3]); continue; }
      if (fn === OPS.setStrokeRGBColor) { zustand.strich = [a[0], a[1], a[2]]; continue; }
      if (fn === OPS.setStrokeGray) { zustand.strich = graue(a[0]); continue; }
      if (fn === OPS.setStrokeCMYKColor) { zustand.strich = cmyk(a[0], a[1], a[2], a[3]); continue; }
      if (fn === OPS.setLineWidth) { zustand.lb = a[0]; continue; }

      if (fn === OPS.constructPath) {
        pfad = { punkte: [], rechtecke: [] };
        var ops = a[0] || [], ko = a[1] || [], z = 0;
        for (var k = 0; k < ops.length; k++) {
          var o = ops[k];
          if (o === OPS.moveTo || o === OPS.lineTo) {
            pfad.punkte.push([ko[z], ko[z + 1]]); z += 2;
          } else if (o === OPS.curveTo) {
            pfad.punkte.push([ko[z + 4], ko[z + 5]]); z += 6;
          } else if (o === OPS.curveTo2 || o === OPS.curveTo3) {
            pfad.punkte.push([ko[z + 2], ko[z + 3]]); z += 4;
          } else if (o === OPS.rectangle) {
            pfad.rechtecke.push([ko[z], ko[z + 1], ko[z + 2], ko[z + 3]]); z += 4;
          } else if (o === OPS.closePath) { /* nichts */ }
        }
        continue;
      }

      var fuellt = fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke
        || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
      var streicht = fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fillStroke
        || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
      if ((fuellt || streicht) && pfad) {
        var farbeF = hex(zustand.fuell[0], zustand.fuell[1], zustand.fuell[2]);
        var farbeS = hex(zustand.strich[0], zustand.strich[1], zustand.strich[2]);
        if (fuellt) {
          for (var r = 0; r < pfad.rechtecke.length; r++) {
            var rr = pfad.rechtecke[r];
            var p1 = anwenden(zustand.m, rr[0], rr[1]);
            var p2 = anwenden(zustand.m, rr[0] + rr[2], rr[1] + rr[3]);
            flaechen.push({
              x: Math.min(p1[0], p2[0]), y: Math.min(p1[1], p2[1]),
              b: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]), farbe: farbeF,
            });
          }
          // Ein gefuellter Pfad ohne Rechtecke: als umschliessender Kasten.
          // Gerundete Ecken und Wellen gehen dabei verloren; die Flaeche
          // steht aber an der richtigen Stelle, und das ist mehr als nichts.
          if (!pfad.rechtecke.length && pfad.punkte.length > 2) {
            var xs = [], ys = [];
            for (var q = 0; q < pfad.punkte.length; q++) {
              var pp = anwenden(zustand.m, pfad.punkte[q][0], pfad.punkte[q][1]);
              xs.push(pp[0]); ys.push(pp[1]);
            }
            var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
            var miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
            if (maxx - minx > 1 && maxy - miny > 1) {
              flaechen.push({ x: minx, y: miny, b: maxx - minx, h: maxy - miny,
                              farbe: farbeF, gerundet: true });
            }
          }
        }
        if (streicht && pfad.punkte.length >= 2) {
          for (var l = 0; l + 1 < pfad.punkte.length; l++) {
            var s1 = anwenden(zustand.m, pfad.punkte[l][0], pfad.punkte[l][1]);
            var s2 = anwenden(zustand.m, pfad.punkte[l + 1][0], pfad.punkte[l + 1][1]);
            if (Math.abs(s1[0] - s2[0]) < 0.2 && Math.abs(s1[1] - s2[1]) < 0.2) continue;
            linien.push({ x1: s1[0], y1: s1[1], x2: s2[0], y2: s2[1],
                          farbe: farbeS, lb: Math.max(0.2, zustand.lb) });
          }
        }
        pfad = null;
        continue;
      }

      if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject
          || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
        // Ein Bild wird in das Einheitsquadrat gezeichnet und von der
        // Matrix an seinen Platz gebracht.
        var e1 = anwenden(zustand.m, 0, 0), e2 = anwenden(zustand.m, 1, 1);
        bilder.push({
          x: Math.min(e1[0], e2[0]), y: Math.min(e1[1], e2[1]),
          b: Math.abs(e2[0] - e1[0]), h: Math.abs(e2[1] - e1[1]),
        });
        continue;
      }

      // --- Textzustand, wie ihn ein PDF-Betrachter fuehrt ---------------
      // Der Ort eines Textlaufs steht nicht nur in Tm (setTextMatrix),
      // sondern wird auch mit Td/TD/T* fortgeschrieben. Wer nur Tm liest,
      // bekommt bei jedem Erzeuger, der mit Td arbeitet, immer denselben
      // Punkt — und damit fuer jede Zeile dieselbe Farbe.
      if (fn === OPS.beginText) { tm = EINS.slice(); tlm = EINS.slice(); continue; }
      if (fn === OPS.setTextMatrix) {
        tlm = [a[0], a[1], a[2], a[3], a[4], a[5]]; tm = tlm.slice(); continue;
      }
      if (fn === OPS.setLeading) { durchschuss = a[0]; continue; }
      if (fn === OPS.setLeadingMoveText) {
        durchschuss = -a[1]; tlm = mal([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm.slice(); continue;
      }
      if (fn === OPS.moveText) {
        tlm = mal([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm.slice(); continue;
      }
      if (fn === OPS.nextLine) {
        tlm = mal([1, 0, 0, 1, 0, -durchschuss], tlm); tm = tlm.slice(); continue;
      }
      if (fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
        tlm = mal([1, 0, 0, 1, 0, -durchschuss], tlm); tm = tlm.slice();
      }
      if (fn === OPS.showText || fn === OPS.showSpacedText
          || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
        // Die Farbe wird am ORT festgehalten, nicht an der Reihenfolge.
        // Ein showText kann mehrere Textstuecke erzeugen (pdf.js trennt an
        // Unterschneidungen), und dann laufen Zaehler auseinander: auf der
        // Datenseite eines echten Exposés waren es 42 Aufrufe und 44
        // Stuecke — ab dem ersten Versatz stand jede Farbe falsch.
        var o = anwenden(mal(tm, zustand.m), 0, 0);
        textlaeufe.push({ x: o[0], y: o[1],
                          farbe: hex(zustand.fuell[0], zustand.fuell[1], zustand.fuell[2]) });
        continue;
      }
    }
    return { flaechen: flaechen, linien: linien, bilder: bilder, textlaeufe: textlaeufe };
  }

  // --- Die Textschicht zu Zeilen buendeln --------------------------------
  /**
   * Die wirklichen Schriftnamen.
   *
   * getTextContent() nennt nur "sans-serif" oder "serif" — das ist die
   * Familie, mit der der Browser zeichnen wuerde, nicht die Schrift im
   * Dokument. Der echte Name steht in den aufgeloesten Objekten der Seite,
   * unter demselben Schluessel. Ohne ihn wuerde jede Schrift eines fremden
   * Exposés bei uns zu Plus Jakarta Sans Regular — und die Zuordnung waere
   * keine Zuordnung, sondern eine Einbahnstrasse.
   */
  function schriftnamen(seite, textinhalt) {
    var raus = {};
    var stile = (textinhalt && textinhalt.styles) || {};
    Object.keys(stile).forEach(function (schluessel) {
      var name = "";
      try {
        if (seite.commonObjs && seite.commonObjs.has(schluessel)) {
          var o = seite.commonObjs.get(schluessel);
          if (o && typeof o.name === "string") name = o.name;
        }
      } catch (e) { /* dann bleibt die allgemeine Familie */ }
      // pdf.js haengt eine laufende Nummer an ("Arch-Bold-9156").
      raus[schluessel] = name.replace(/-\d+$/, "") || stile[schluessel].fontFamily || "";
    });
    return raus;
  }

  /** Die Farbe des Textlaufs, der an dieser Stelle beginnt. */
  function farbeAn(laeufe, x, y) {
    var beste = null, abstand = Infinity;
    for (var i = 0; i < laeufe.length; i++) {
      var l = laeufe[i];
      if (Math.abs(l.y - y) > 0.8) continue;
      if (x < l.x - 0.8) continue;
      var d = x - l.x;
      if (d < abstand) { abstand = d; beste = l; }
    }
    return beste ? beste.farbe : "#000000";
  }

  function zeilenBauen(textinhalt, laeufe, namen) {
    var stuecke = [];
    var luecke = false;
    for (var i = 0; i < textinhalt.items.length; i++) {
      var it = textinhalt.items[i];
      if (typeof it.str !== "string" || !it.str.length) continue;
      // pdf.js setzt das Leerzeichen zwischen zwei Woertern als EIGENES
      // Stueck. Wer es wegwirft, bekommt "DIEDATEN." — genau so stand es
      // beim ersten Versuch auf dem Papier.
      if (!it.str.trim()) { luecke = true; continue; }
      var t = it.transform;
      var groesse = Math.hypot(t[0], t[1]) || Math.abs(t[3]) || 10;
      var gedreht = Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01;
      var stil = (textinhalt.styles || {})[it.fontName] || {};
      var echterName = (namen && namen[it.fontName]) || stil.fontFamily || it.fontName || "";
      stuecke.push({
        text: it.str, x: t[4], y: t[5], breite: it.width || 0, groesse: groesse,
        schriftname: echterName, gedreht: gedreht,
        farbe: farbeAn(laeufe, t[4], t[5]), luecke: luecke,
      });
      luecke = false;
    }
    stuecke.sort(function (a, b) {
      if (Math.abs(a.y - b.y) > 1.2) return b.y - a.y;
      return a.x - b.x;
    });
    var zeilen = [];
    for (var s = 0; s < stuecke.length; s++) {
      var st = stuecke[s];
      var letzte = zeilen[zeilen.length - 1];
      var passt = letzte
        && !letzte.gedreht && !st.gedreht
        && Math.abs(letzte.y - st.y) <= Math.max(1.2, st.groesse * 0.18)
        && Math.abs(letzte.groesse - st.groesse) < 0.6
        && letzte.farbe === st.farbe
        && st.x - (letzte.x + letzte.breite) < st.groesse * 1.2
        && st.x >= letzte.x - 0.5;
      if (passt) {
        var abstand = st.x - (letzte.x + letzte.breite);
        letzte.text += ((st.luecke || abstand > st.groesse * 0.14) ? " " : "") + st.text;
        letzte.breite = (st.x + st.breite) - letzte.x;
      } else {
        zeilen.push({
          text: st.text, x: st.x, y: st.y, breite: st.breite, groesse: st.groesse,
          schriftname: st.schriftname, gedreht: st.gedreht, farbe: st.farbe,
        });
      }
    }
    return zeilen;
  }

  // --- Eine Seite in Elemente verwandeln ---------------------------------
  function seiteBauen(nr, masse, schicht, zeilen, stilBuch, befund) {
    var elemente = [];
    var kennung = function (vorsatz) { return vorsatz + "-" + nr + "-" + (elemente.length + 1); };

    // Flaechen zuerst: sie liegen hinten. Winzige und seitengrosse weisse
    // Flaechen fliegen raus — das eine ist Rauschen, das andere der
    // Papierhintergrund, den unsere Vorlage ohnehin hat.
    for (var f = 0; f < schicht.flaechen.length; f++) {
      var fl = schicht.flaechen[f];
      if (fl.b < 1.5 || fl.h < 1.5) continue;
      var fastGanz = fl.b > masse.breite * 0.98 && fl.h > masse.hoehe * 0.98;
      if (fastGanz && (fl.farbe === "#ffffff" || fl.farbe === "#fefefe")) continue;
      elemente.push({
        id: kennung("flaeche"), typ: "form", form: "rechteck",
        x: r2(fl.x), y: r2(fl.y), b: r2(fl.b), h: r2(fl.h), fuell: fl.farbe,
      });
    }

    // Linien: nur waagerechte und senkrechte. Schraege Striche sind in
    // einem Expose fast immer Teil einer Zeichnung, nicht der Gestaltung.
    for (var l = 0; l < schicht.linien.length; l++) {
      var li = schicht.linien[l];
      var waage = Math.abs(li.y1 - li.y2) < 0.6;
      var senk = Math.abs(li.x1 - li.x2) < 0.6;
      if (!waage && !senk) { befund.schraegeLinien++; continue; }
      var laenge = Math.hypot(li.x2 - li.x1, li.y2 - li.y1);
      if (laenge < 3) continue;
      elemente.push({
        id: kennung("linie"), typ: "form", form: "linie",
        x: r2(Math.min(li.x1, li.x2)), y: r2(Math.min(li.y1, li.y2)),
        b: r2(waage ? laenge : 0), h: r2(waage ? 0 : laenge),
        strich: li.farbe, linienbreite: r2(li.lb),
      });
    }

    // Bilder: der Groesse nach. Das groesste der ersten Seite ist das
    // Titelbild, alle anderen werden durchnummerierte Fotos. Welches Bild
    // wirklich wohin gehoert, entscheidet der Makler im Editor — hier wird
    // nur ein brauchbarer Vorschlag gemacht.
    var sortiert = schicht.bilder.slice().sort(function (a, b) { return (b.b * b.h) - (a.b * a.h); });
    for (var b = 0; b < sortiert.length; b++) {
      var bi = sortiert[b];
      if (bi.b < 8 || bi.h < 8) { befund.winzigeBilder++; continue; }
      befund.bilder++;
      elemente.push({
        id: kennung("bild"), typ: "bild",
        x: r2(bi.x), y: r2(bi.y), b: r2(bi.b), h: r2(bi.h),
        slot: (nr === 1 && b === 0) ? { art: "titelbild" }
                                    : { art: "foto", nr: befund.fotoNummer++ },
        fuellmodus: "cover",
      });
    }

    // Text zuletzt: er liegt vorn.
    for (var z = 0; z < zeilen.length; z++) {
      var ze = zeilen[z];
      var stil = stilBuch.nimm(ze);
      var h = Math.max(4, ze.groesse);
      elemente.push({
        id: kennung("text"), typ: "text",
        x: r2(ze.x), y: r2(ze.y - h), b: r2(Math.max(8, ze.breite) + ze.groesse * 0.3),
        h: r2(h), stil: stil, inhalt: ze.text, einzeilig: true,
      });
      if (ze.gedreht) befund.gedrehteTexte++;
    }

    return {
      id: "s" + nr, typ: "leer", name: "Seite " + nr, ohne_fuss: true,
      elemente: elemente,
    };
  }

  function r2(v) { return Math.round(v * 100) / 100; }

  // --- Das Stilbuch ------------------------------------------------------
  // Jede Kombination aus Schnitt, Groesse und Farbe wird einmal zu einem
  // Textstil. So steht am Ende eine ueberschaubare Liste in der Vorlage,
  // und wer die Hausschrift spaeter tauscht, tauscht sie an einer Stelle.
  function stilBuch() {
    var stile = {}, bekannt = {}, zaehler = 0, quellen = {};
    return {
      nimm: function (zeile) {
        var s = schriftZuordnen(zeile.schriftname);
        var groesse = Math.round(zeile.groesse * 10) / 10;
        var schluessel = s.familie + "|" + s.schnitt + "|" + groesse + "|" + zeile.farbe;
        if (bekannt[schluessel]) return bekannt[schluessel];
        zaehler++;
        var name = "t" + zaehler;
        stile[name] = { schrift: s, groesse: groesse, farbe: zeile.farbe };
        quellen[name] = zeile.schriftname || "(ohne Namen)";
        bekannt[schluessel] = name;
        return name;
      },
      stile: stile,
      quellen: quellen,
    };
  }

  // --- Farben der Marke --------------------------------------------------
  // Die zwei am haeufigsten benutzten kraeftigen Farben werden zu f1 und
  // f2. Das ist noch keine Markenzuordnung (die kommt in Stufe 2), aber es
  // sorgt dafuer, dass die Palette der Vorlage zum Dokument passt.
  function markenfarben(alleFarben) {
    var zaehlung = {};
    alleFarben.forEach(function (f) { zaehlung[f] = (zaehlung[f] || 0) + 1; });
    var sortiert = Object.keys(zaehlung).filter(function (f) {
      if (f === "#000000" || f === "#ffffff") return false;
      var r = parseInt(f.slice(1, 3), 16), g = parseInt(f.slice(3, 5), 16), bl = parseInt(f.slice(5, 7), 16);
      var max = Math.max(r, g, bl), min = Math.min(r, g, bl);
      // Nur BUNTE Farben. Grau und Schwarz sind in einem Exposé die Farbe
      // des Lauftexts und der Haarlinien, nicht die Farbe der Marke. Wer
      // sie zur Markenfarbe macht, bindet spaeter den Fliesstext an die
      // Akzentfarbe des Mandanten — und die Ueberschrift wird golden.
      return (max - min) > 18;
    }).sort(function (a, b) { return zaehlung[b] - zaehlung[a]; });
    return [sortiert[0] || "#1B2A47", sortiert[1] || "#B5934F"];
  }


  // ======================================================================
  // STUFE 2 — aus Geometrie wird eine Vorlage
  // ----------------------------------------------------------------------
  // Stufe 1 hat jede Flaeche, Linie, jedes Bild und jede Textzeile mit
  // ihren Massen uebernommen. Was dabei entsteht, ist ein genauer Nachbau
  // EINES Exposés: die Werte des Objekts stehen als Text darin.
  //
  // Eine Vorlage ist das noch nicht. Stufe 2 macht daraus eine:
  //
  //   1. Platzhalter: steht im PDF "112,5 m²" und ist das die Wohnflaeche
  //      des Objekts, wird daraus {{objekt.wohnflaeche}}.
  //   2. Bildfelder: welches Bild ist das Logo, welches das Portraet,
  //      welches ein Grundriss? Das sagt die Seite, auf der es steht.
  //   3. Marke: die beiden Hausfarben des Dokuments werden zu f1 und f2
  //      und, wenn sie zum CI des Mandanten passen, an das CI gebunden.
  //
  // Geraten wird dabei zwangslaeufig. Darum gilt fuer jeden Schritt: er
  // schlaegt vor, er entscheidet nicht. Was er getan hat, steht im Befund,
  // und auf der Bearbeitungsflaeche ist jedes Feld noch zu aendern.
  // ======================================================================

  /** Vergleichsform: Leerraum zusammengezogen, Sonderzeichen vereinheitlicht. */
  function vergleichsform(t) {
    return String(t == null ? "" : t)
      .replace(/ /g, " ")
      .replace(/[‐-―]/g, "-")
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function maskieren(t) {
    return String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Die Werte des Vergleichsobjekts, nach Laenge sortiert.
   *
   * Lang zuerst: sonst ersetzt "Hamburg" das Wort im Ortsteil "Hamburg-Altona"
   * und der laengere Treffer kommt nie zustande. Werte unter vier Zeichen
   * bleiben aussen vor — eine "3" steht in jedem Exposé zwanzigmal, und
   * neunzehnmal ist sie nicht die Zimmerzahl.
   */
  function vergleichswerte(daten) {
    var raus = [];
    var W = window.ImmoExpose && window.ImmoExpose.wert;
    Object.keys(daten || {}).forEach(function (schluessel) {
      if (/^bild\./.test(schluessel)) return;
      if (/\.titel$/.test(schluessel)) return;
      if (schluessel === "objekt.ki_bilder") return;
      var roh = daten[schluessel];
      if (roh == null || typeof roh === "object" || typeof roh === "boolean") return;
      var wert = W ? W(daten, schluessel) : String(roh);
      if (wert === undefined || wert === null) return;
      var v = vergleichsform(wert);
      if (v.length < 4) return;
      raus.push({ schluessel: schluessel, wert: v });
    });
    raus.sort(function (a, b) { return b.wert.length - a.wert.length; });
    return raus;
  }

  /**
   * Zeilen, die zusammen einen Absatz bilden: gleicher Textstil, gleicher
   * linker Rand, dicht untereinander.
   *
   * Gebraucht wird das fuer die langen Texte. Die Objektbeschreibung steht
   * im PDF als zwanzig einzelne Zeilen; keine davon gleicht dem Feldwert.
   * Erst zusammengesetzt tun sie es.
   */
  function absaetze(elemente) {
    var raus = [];
    var lauf = null;
    var schliessen = function () {
      if (lauf && lauf.teile.length > 1) raus.push(lauf);
      lauf = null;
    };
    for (var i = 0; i < elemente.length; i++) {
      var el = elemente[i];
      if (el.typ !== "text" || el.gesperrt || typeof el.inhalt !== "string") { schliessen(); continue; }
      if (lauf) {
        var vor = lauf.teile[lauf.teile.length - 1];
        var zeilenhoehe = Math.max(vor.h, el.h);
        var abstand = (vor.y + vor.h) - (el.y + el.h);
        var passt = lauf.stil === el.stil
          && Math.abs(el.x - lauf.x) < 2.5
          && abstand > 0 && abstand < zeilenhoehe * 2.4;
        if (passt) { lauf.teile.push(el); continue; }
        schliessen();
      }
      lauf = { stil: el.stil, x: el.x, teile: [el] };
    }
    schliessen();
    return raus;
  }

  /**
   * Setzt Platzhalter in ein eingelesenes Dokument.
   *
   * @param {object} dokument  wird an Ort und Stelle geaendert
   * @param {object} daten     aufbereitete Daten des Vergleichsobjekts
   * @returns {{platzhalter: number, felder: string[], absaetze: number,
   *            warnungen: string[]}}
   */
  function platzhalterSetzen(dokument, daten, opt) {
    opt = opt || {};
    var werte = vergleichswerte(daten);
    var befund = { platzhalter: 0, felder: [], absaetze: 0, warnungen: [] };
    if (!werte.length) {
      befund.warnungen.push("Das Vergleichsobjekt hat keine verwertbaren Angaben — "
        + "ohne sie laesst sich kein Platzhalter erkennen.");
      return befund;
    }
    var gefunden = {};
    var lang = werte.filter(function (w) { return w.wert.length >= 60; });

    (dokument.seiten || []).forEach(function (seite) {
      // 1. Die langen Texte zuerst: sie fassen mehrere Zeilen zu einem
      //    Feld zusammen und veraendern die Elementliste.
      var weg = {};
      absaetze(seite.elemente || []).forEach(function (lauf) {
        var ganz = vergleichsform(lauf.teile.map(function (t) { return t.inhalt; }).join(" "));
        for (var i = 0; i < lang.length; i++) {
          if (gefunden[lang[i].schluessel]) continue;
          if (ganz.indexOf(lang[i].wert) !== 0 && ganz.indexOf(lang[i].wert) < 0) continue;
          var erstes = lauf.teile[0], letztes = lauf.teile[lauf.teile.length - 1];
          var breite = 0;
          lauf.teile.forEach(function (t) { breite = Math.max(breite, t.b); });
          erstes.inhalt = "{{" + lang[i].schluessel + "}}";
          erstes.b = breite;
          erstes.h = (erstes.y + erstes.h) - letztes.y;
          erstes.y = letztes.y;
          erstes.einzeilig = false;
          erstes.verdichten = true;
          // Der Rest des Absatzes entfaellt: der Platzhalter bringt den
          // ganzen Text mit, und der Umbruch ist Sache des Renderers.
          lauf.teile.slice(1).forEach(function (t) { weg[t.id] = true; });
          gefunden[lang[i].schluessel] = true;
          befund.platzhalter++;
          befund.absaetze++;
          break;
        }
      });
      if (Object.keys(weg).length) {
        seite.elemente = (seite.elemente || []).filter(function (el) { return !weg[el.id]; });
      }

      // 2. Jede einzelne Zeile gegen jeden Wert.
      (seite.elemente || []).forEach(function (el) {
        if (el.typ !== "text" || el.gesperrt || typeof el.inhalt !== "string") return;
        if (/\{\{/.test(el.inhalt)) return;
        var text = el.inhalt;
        for (var i = 0; i < werte.length; i++) {
          var w = werte[i];
          if (w.wert.length >= 60) continue;           // schon als Absatz versucht
          var muster = new RegExp(maskieren(w.wert).replace(/ /g, "\\s+"), "i");
          var vorher = text;
          text = vergleichsform(text).replace(muster, "{{" + w.schluessel + "}}");
          if (text !== vergleichsform(vorher)) {
            befund.platzhalter++;
            gefunden[w.schluessel] = true;
          }
        }
        if (text !== el.inhalt) el.inhalt = text;
      });
    });

    befund.felder = Object.keys(gefunden).sort();
    if (!befund.platzhalter) {
      befund.warnungen.push("Kein Platzhalter erkannt. Zeigt dieses PDF wirklich "
        + "das gewaehlte Objekt? Sonst stehen die Werte als Text in der Vorlage "
        + "und muessen auf der Flaeche ersetzt werden.");
    }
    return befund;
  }

  // --- Bildfelder erkennen -----------------------------------------------
  // Welches Bild wohin gehoert, sagt die Seite: auf einer Grundrissseite
  // sind die grossen Bilder Grundrisse, auf der Kontaktseite ist das
  // hochkante kleine Bild das Portraet, und ein kleines Bild oben am Rand
  // ist in neun von zehn Faellen das Logo.
  function slotsVerfeinern(seiten, format) {
    var befund = { logo: 0, portraet: 0, grundriss: 0, lageplan: 0 };
    var hoehe = (format && format.hoehe) || 841.89;
    var grundrissNr = 1;
    seiten.forEach(function (seite) {
      var text = (seite.elemente || []).filter(function (el) { return el.typ === "text"; })
        .map(function (el) { return String(el.inhalt || ""); }).join(" ").toLowerCase();
      var istGrundriss = /grundriss|wohnfl(ä|ae)chenberechnung|raumaufteilung/.test(text);
      var istLage = /\blage\b|umgebung|standort|infrastruktur|entfernung/.test(text);
      var istKontakt = /ansprechpartner|ihr kontakt|kontaktieren|ihre maklerin|ihr makler|sprechen sie/.test(text);
      var bilder = (seite.elemente || []).filter(function (el) { return el.typ === "bild"; });
      bilder.forEach(function (el) {
        var verh = el.b / Math.max(1, el.h);
        var oben = (el.y + el.h) > hoehe * 0.86;
        var klein = el.b <= 170 && el.h <= 60;
        var quadratisch = el.b <= 70 && el.h <= 70 && verh > 0.5 && verh < 2;
        // Logo: klein und oben, oder klein und unten in der Fusszone.
        if ((klein || quadratisch) && (oben || el.y < hoehe * 0.12)) {
          el.slot = { art: "logo", ton: dunklerGrund(seite, el) ? "dunkel" : "hell" };
          el.fuellmodus = "contain";
          el.ausrichtung = el.x < (format.breite || 595.28) * 0.3 ? "links" : "mitte";
          befund.logo++;
          return;
        }
        if (istKontakt && verh < 0.95 && el.h <= 260 && el.h >= 50) {
          el.slot = { art: "ansprechpartner" };
          befund.portraet++;
          return;
        }
        if (istGrundriss && el.b * el.h > 12000) {
          el.slot = { art: "grundriss", nr: grundrissNr++ };
          el.fuellmodus = "contain";
          befund.grundriss++;
          return;
        }
        if (istLage && !befund.lageplan && el.b * el.h > 20000) {
          el.slot = { art: "lageplan" };
          befund.lageplan++;
        }
      });
    });
    return befund;
  }

  /** Liegt hinter diesem Rahmen eine dunkle Flaeche? */
  function dunklerGrund(seite, rahmen) {
    var treffer = null;
    (seite.elemente || []).forEach(function (el) {
      if (el.typ !== "form" || el.form !== "rechteck") return;
      if (typeof el.fuell !== "string" || el.fuell.charAt(0) !== "#") return;
      if (el.x > rahmen.x + 1 || el.y > rahmen.y + 1) return;
      if (el.x + el.b < rahmen.x + rahmen.b - 1) return;
      if (el.y + el.h < rahmen.y + rahmen.h - 1) return;
      treffer = el.fuell;              // spaeter heisst weiter vorn
    });
    if (!treffer) return false;
    var r = parseInt(treffer.slice(1, 3), 16), g = parseInt(treffer.slice(3, 5), 16),
        b = parseInt(treffer.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  }

  // --- Die Marke binden --------------------------------------------------
  /**
   * Bindet die beiden Hausfarben des Dokuments an die Palette und, wenn sie
   * zum CI des Mandanten passen, an das CI selbst.
   *
   * Der Sinn: das hochgeladene Exposé IST das Design des Mandanten, seine
   * Farben sind dessen Markenfarben. Stehen sie als Hexwerte in jedem
   * Element, ist die Vorlage von seinem CI abgeschnitten — wer sein Blau
   * aendert, muesste jedes Feld anfassen. Als Verweis auf die Palette
   * folgt sie dem CI von selbst.
   *
   * Nur bei Naehe zum CI: ist das CI nicht gesetzt oder eine voellig
   * andere Farbe, bleiben die Hexwerte stehen. Dann sieht die Vorlage aus
   * wie das PDF — und das ist wichtiger.
   */
  function markeZuordnen(dokument, marke) {
    var befund = { f1: null, f2: null, an_ci: false, ersetzt: 0, warnungen: [] };
    var farben = dokument.stil && dokument.stil.farben;
    if (!farben) return befund;
    befund.f1 = farben.f1;
    befund.f2 = farben.f2;
    var nah = function (a, b) {
      if (typeof a !== "string" || typeof b !== "string") return false;
      if (a.charAt(0) !== "#" || b.charAt(0) !== "#") return false;
      var z = function (h, i) { return parseInt(h.slice(i, i + 2), 16); };
      return Math.sqrt(Math.pow(z(a, 1) - z(b, 1), 2) + Math.pow(z(a, 3) - z(b, 3), 2)
        + Math.pow(z(a, 5) - z(b, 5), 2)) < 60;
    };
    var primaer = marke && marke.primaer, akzent = marke && marke.akzent;
    // Die Zuordnung darf tauschen: die haeufigste Farbe des Dokuments muss
    // nicht die Primaerfarbe des Mandanten sein.
    if (nah(farben.f1, primaer) || nah(farben.f2, akzent)) {
      if (nah(farben.f1, primaer)) farben.f1 = "ci.primaer";
      if (nah(farben.f2, akzent)) farben.f2 = "ci.akzent";
      befund.an_ci = true;
    } else if (nah(farben.f1, akzent) || nah(farben.f2, primaer)) {
      if (nah(farben.f1, akzent)) farben.f1 = "ci.akzent";
      if (nah(farben.f2, primaer)) farben.f2 = "ci.primaer";
      befund.an_ci = true;
    } else if (primaer || akzent) {
      befund.warnungen.push("Die Farben des PDF (" + befund.f1 + ", " + befund.f2
        + ") liegen nicht beim CI des Mandanten — sie bleiben als feste Werte "
        + "stehen, damit die Vorlage aussieht wie das PDF.");
    }

    // Jede Stelle, die genau eine der beiden Farben nennt, verweist
    // kuenftig auf die Palette. "p" und "a" sind die Namen, die die
    // Ableitung "raster" dafuer fuehrt.
    var tausch = {};
    tausch[String(befund.f1).toLowerCase()] = "p";
    tausch[String(befund.f2).toLowerCase()] = "a";
    var ersetze = function (v) {
      if (typeof v !== "string") return v;
      var t = tausch[v.toLowerCase()];
      if (!t) return v;
      befund.ersetzt++;
      return t;
    };
    Object.keys(dokument.stil.textstile || {}).forEach(function (name) {
      var st = dokument.stil.textstile[name];
      st.farbe = ersetze(st.farbe);
    });
    (dokument.seiten || []).forEach(function (seite) {
      (seite.elemente || []).forEach(function (el) {
        if (el.fuell !== undefined) el.fuell = ersetze(el.fuell);
        if (el.strich !== undefined) el.strich = ersetze(el.strich);
      });
    });
    return befund;
  }

  // --- Schriften der Vorlage ---------------------------------------------
  // stil.schriften nennt die drei Rollen headline / text / label. Sie
  // stehen in der Vorlage nicht zur Zierde: "ci.font" und die Ersatzschrift
  // haengen daran. Abgeleitet werden sie aus dem Dokument selbst — die
  // groesste Schrift ist die Ueberschrift, die haeufigste der Lauftext.
  function schriftenAbleiten(dokument) {
    var stile = (dokument.stil && dokument.stil.textstile) || {};
    var zaehlung = {};
    (dokument.seiten || []).forEach(function (seite) {
      (seite.elemente || []).forEach(function (el) {
        if (el.typ !== "text" || !el.stil) return;
        var laenge = String(el.inhalt || "").length;
        zaehlung[el.stil] = (zaehlung[el.stil] || 0) + Math.max(1, laenge);
      });
    });
    var namen = Object.keys(stile);
    if (!namen.length) return null;
    var haeufigster = namen.slice().sort(function (a, b) {
      return (zaehlung[b] || 0) - (zaehlung[a] || 0);
    })[0];
    var groesster = namen.slice().sort(function (a, b) {
      return (stile[b].groesse || 0) - (stile[a].groesse || 0);
    })[0];
    var kopie = function (s) { return { familie: s.familie, schnitt: s.schnitt }; };
    dokument.stil.schriften = {
      headline: kopie(stile[groesster].schrift),
      text: kopie(stile[haeufigster].schrift),
      label: kopie(stile[haeufigster].schrift),
    };
    return { headline: groesster, text: haeufigster };
  }

  /**
   * Ein PDF einlesen.
   *
   * @param {ArrayBuffer} daten
   * @param {{name?: string, maxSeiten?: number}} opt
   * @returns {Promise<{dokument: object, befund: object}>}
   */
  function ausPdf(daten, opt) {
    opt = opt || {};
    var pdfjsLib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
    if (!pdfjsLib) {
      return Promise.reject(new Error(
        "pdf.js ist nicht geladen. Die Anwendung bringt es mit — bitte die "
        + "Seite neu laden."));
    }
    var befund = {
      seiten: 0, texte: 0, flaechen: 0, linien: 0, bilder: 0, stile: 0,
      gedrehteTexte: 0, schraegeLinien: 0, winzigeBilder: 0, fotoNummer: 1,
      schriften: {}, warnungen: [],
      // Stufe 2, gleich mitgemacht: Bildfelder, Marke, Schriftrollen.
      slots: null, marke: null, schriftrollen: null,
    };
    var buch = stilBuch();
    var alleFarben = [];
    var seiten = [];
    var format = null;

    var auftrag = { data: daten, isEvalSupported: false };
    // Ohne diese Quelle warnt pdf.js bei jedem PDF, das eine der vierzehn
    // Standardschriften benutzt (Helvetica, Times, Courier). Gelesen wird
    // davon nur die Metrik; die Vorlage bekommt ohnehin unsere Schnitte.
    var schriftquelle = opt.standardFontDataUrl
      || "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/";
    if (schriftquelle) auftrag.standardFontDataUrl = schriftquelle;
    return pdfjsLib.getDocument(auftrag).promise
      .then(function (pdf) {
        var grenze = Math.min(pdf.numPages, opt.maxSeiten || 24);
        if (pdf.numPages > grenze) {
          befund.warnungen.push("Das PDF hat " + pdf.numPages + " Seiten; "
            + "eingelesen werden die ersten " + grenze + ".");
        }
        var kette = Promise.resolve();
        var _loop = function (nr) {
          kette = kette.then(function () {
            return pdf.getPage(nr).then(function (seite) {
              var sicht = seite.getViewport({ scale: 1 });
              var masse = { breite: r2(sicht.width), hoehe: r2(sicht.height) };
              if (!format) format = masse;
              return Promise.all([seite.getOperatorList(), seite.getTextContent()])
                .then(function (paar) {
                  var schicht = zeichenschicht(pdfjsLib, paar[0]);
                  // Erst die Operatorliste, dann die Namen: vorher sind die
                  // Schriftobjekte der Seite noch nicht aufgeloest.
                  var namen = schriftnamen(seite, paar[1]);
                  var zeilen = zeilenBauen(paar[1], schicht.textlaeufe, namen);
                  befund.texte += zeilen.length;
                  befund.flaechen += schicht.flaechen.length;
                  befund.linien += schicht.linien.length;
                  schicht.flaechen.forEach(function (f) { alleFarben.push(f.farbe); });
                  zeilen.forEach(function (z) {
                    alleFarben.push(z.farbe);
                    var n = z.schriftname || "(ohne Namen)";
                    befund.schriften[n] = (befund.schriften[n] || 0) + 1;
                  });
                  seiten.push(seiteBauen(nr, masse, schicht, zeilen, buch, befund));
                });
            });
          });
        };
        for (var nr = 1; nr <= grenze; nr++) _loop(nr);
        return kette.then(function () { return pdf; });
      })
      .then(function () {
        befund.seiten = seiten.length;
        befund.stile = Object.keys(buch.stile).length;
        if (!befund.texte && befund.bilder) {
          befund.warnungen.push(
            "In diesem PDF steht kein Text, nur Bilder — es ist vermutlich als "
            + "Bild exportiert oder eingescannt. Dann lassen sich nur die "
            + "Bildrahmen uebernehmen, keine Schrift und keine Maße.");
        }
        if (befund.gedrehteTexte) {
          befund.warnungen.push(befund.gedrehteTexte
            + " gedrehte Textzeilen wurden waagerecht uebernommen.");
        }
        if (befund.schraegeLinien) {
          befund.warnungen.push(befund.schraegeLinien
            + " schräge Linien wurden weggelassen.");
        }
        var mf = markenfarben(alleFarben);
        var stile = buch.stile;
        if (!Object.keys(stile).length) {
          stile.t1 = { schrift: { familie: "jakarta", schnitt: "Regular" },
                       groesse: 10, farbe: "#000000" };
        }
        // --- Stufe 2, soweit sie ohne Vergleichsobjekt geht ------------
        befund.slots = slotsVerfeinern(seiten, format || { breite: 595.28, hoehe: 841.89 });

        var dokument = {
          schema: 1,
          name: opt.name || "Eingelesene Vorlage",
          beschreibung: "Aus einem PDF nachgebaut. Schriften sind zugeordnet, "
            + "nicht übernommen.",
          // "leer" ist die einzige Basis neben den drei Hausvorlagen, die die
          // Datenbank erlaubt (fork_37) — und sie stimmt: diese Vorlage
          // stammt von keiner von ihnen ab. Woher sie wirklich kommt, steht
          // unten in "herkunft".
          basis: "leer",
          format: {
            breite: (format || { breite: 595.28 }).breite,
            hoehe: (format || { hoehe: 841.89 }).hoehe,
            ausrichtung: (format && format.breite > format.hoehe) ? "quer" : "hoch",
          },
          stil: {
            farben: { f1: mf[0], f2: mf[1], ableitung: "raster" },
            schriften: {
              headline: { familie: "jakarta", schnitt: "Bold" },
              text: { familie: "jakarta", schnitt: "Regular" },
              label: { familie: "jakarta", schnitt: "Medium" },
            },
            textstile: stile,
            raster: { spalten: 12, rand: 36, abstand: 12 },
          },
          seiten: seiten,
          // Woher die Vorlage kommt und was dabei zugeordnet wurde. Nicht
          // Zierde: wer spaeter eine Schrift tauscht, muss wissen, was im
          // Original stand.
          herkunft: {
            art: "pdf", datei: opt.name || "", eingelesen_am: new Date().toISOString(),
            schriften_im_pdf: befund.schriften, zuordnung: buch.quellen,
            farben_im_pdf: [mf[0], mf[1]],
          },
        };
        // Die Marke binden und die drei Schriftrollen ableiten — beides
        // braucht das fertige Dokument.
        befund.marke = markeZuordnen(dokument, opt.marke || {});
        befund.schriftrollen = schriftenAbleiten(dokument);
        (befund.marke.warnungen || []).forEach(function (w) { befund.warnungen.push(w); });
        return { dokument: dokument, befund: befund };
      });
  }

  window.ImmoExposeEinlesen = {
    ausPdf: ausPdf,
    // Stufe 2, zweiter Teil: er braucht ein Vergleichsobjekt und wird
    // darum einzeln aufgerufen, wenn der Nutzer eines gewaehlt hat.
    platzhalterSetzen: platzhalterSetzen,
    markeZuordnen: markeZuordnen,
    slotsVerfeinern: slotsVerfeinern,
    schriftZuordnen: schriftZuordnen,
    verfuegbar: function () { return !!(window.pdfjsLib || window["pdfjs-dist/build/pdf"]); },
  };
})();
