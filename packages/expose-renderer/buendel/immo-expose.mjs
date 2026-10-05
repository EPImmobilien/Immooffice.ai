// Erzeugt von packages/expose-renderer/bauen.mjs — nicht von Hand aendern.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// packages/expose-renderer/src/schrift.ts
function lesePruefer(daten) {
  const d = new DataView(daten.buffer, daten.byteOffset, daten.byteLength);
  return {
    u8: (p) => d.getUint8(p),
    u16: (p) => d.getUint16(p),
    i16: (p) => d.getInt16(p),
    u32: (p) => d.getUint32(p)
  };
}
function tabellen(daten) {
  const r = lesePruefer(daten);
  const anzahl = r.u16(4);
  const verzeichnis = /* @__PURE__ */ new Map();
  for (let i = 0; i < anzahl; i++) {
    const p = 12 + i * 16;
    let kennung = "";
    for (let j = 0; j < 4; j++) kennung += String.fromCharCode(r.u8(p + j));
    verzeichnis.set(kennung, r.u32(p + 8));
  }
  return verzeichnis;
}
function leseCmap(daten, anfang) {
  const r = lesePruefer(daten);
  const unterTabellen = r.u16(anfang + 2);
  let besser = -1;
  let bestePunkte = -1;
  for (let i = 0; i < unterTabellen; i++) {
    const p = anfang + 4 + i * 8;
    const plattform = r.u16(p);
    const kodierung = r.u16(p + 2);
    const versatz = r.u32(p + 4);
    const punkte = plattform === 3 && kodierung === 10 ? 5 : plattform === 3 && kodierung === 1 ? 4 : plattform === 0 ? 3 : 1;
    if (punkte > bestePunkte) {
      bestePunkte = punkte;
      besser = anfang + versatz;
    }
  }
  const zuordnung = /* @__PURE__ */ new Map();
  if (besser < 0) return zuordnung;
  const format = r.u16(besser);
  if (format === 4) {
    const segmente = r.u16(besser + 6) / 2;
    const ende = besser + 14;
    const start = ende + segmente * 2 + 2;
    const delta = start + segmente * 2;
    const bereich = delta + segmente * 2;
    for (let s = 0; s < segmente; s++) {
      const e = r.u16(ende + s * 2);
      const a = r.u16(start + s * 2);
      const dl = r.i16(delta + s * 2);
      const rv = r.u16(bereich + s * 2);
      if (a > e) continue;
      for (let c = a; c <= e && c !== 65536; c++) {
        let g;
        if (rv === 0) {
          g = c + dl & 65535;
        } else {
          const p = bereich + s * 2 + rv + (c - a) * 2;
          if (p + 1 >= daten.byteLength) continue;
          g = r.u16(p);
          if (g !== 0) g = g + dl & 65535;
        }
        if (g !== 0) zuordnung.set(c, g);
      }
    }
  } else if (format === 12) {
    const gruppen = r.u32(besser + 12);
    for (let i = 0; i < gruppen; i++) {
      const p = besser + 16 + i * 12;
      const a = r.u32(p), e = r.u32(p + 4), g = r.u32(p + 8);
      for (let c = a; c <= e; c++) zuordnung.set(c, g + (c - a));
    }
  }
  return zuordnung;
}
function metrikLesen(daten, name) {
  const r = lesePruefer(daten);
  const t = tabellen(daten);
  const head = t.get("head");
  const hhea = t.get("hhea");
  const hmtx = t.get("hmtx");
  const cmap = t.get("cmap");
  if (head === void 0 || hhea === void 0 || hmtx === void 0 || cmap === void 0) {
    throw new Error(`Schrift ${name}: head, hhea, hmtx oder cmap fehlt.`);
  }
  const einheiten = r.u16(head + 18);
  const oben = r.i16(hhea + 4);
  const unten = r.i16(hhea + 6);
  const anzahlBreiten = r.u16(hhea + 34);
  const vorschub = (glyph) => {
    const i = Math.min(glyph, anzahlBreiten - 1);
    return r.u16(hmtx + i * 4);
  };
  const zuordnung = leseCmap(daten, cmap);
  const breiten = /* @__PURE__ */ new Map();
  for (const [code, glyph] of zuordnung) breiten.set(code, vorschub(glyph));
  return { breiten, ersatz: vorschub(0), einheiten, oben, unten, daten, name };
}
function breite(m, s, groesse, sperrung = 0) {
  let summe = 0;
  for (const zeichen of s) {
    const code = zeichen.codePointAt(0);
    summe += m.breiten.get(code) ?? m.ersatz;
  }
  const anzahl = Array.from(s).length;
  return summe * groesse / m.einheiten + sperrung * Math.max(anzahl - 1, 0);
}
function fehlendeZeichen(m, s) {
  const fehlt = /* @__PURE__ */ new Set();
  for (const zeichen of s) {
    const code = zeichen.codePointAt(0);
    if (code === 10 || code === 13) continue;
    if (!m.breiten.has(code)) fehlt.add(zeichen);
  }
  return Array.from(fehlt);
}

// packages/expose-renderer/src/schritte.ts
var EINHEIT = [1, 0, 0, 1, 0, 0];
function flach(schritte, eltern = EINHEIT) {
  const raus = [];
  for (const s of schritte) {
    const m = malMatrix(s.matrix, eltern);
    if (s.art === "gruppe") {
      if (s.maske) {
        raus.push({ art: "maske", schritte: s.maske, matrix: m, zweck: s.zweck });
      }
      raus.push(...flach(s.schritte, m));
    } else {
      raus.push({ ...s, matrix: m });
    }
  }
  return raus;
}
function malMatrix(innen, aussen) {
  const [a, b, c, d, e, f] = aussen;
  const [a2, b2, c2, d2, e2, f2] = innen;
  return [
    a2 * a + b2 * c,
    a2 * b + b2 * d,
    c2 * a + d2 * c,
    c2 * b + d2 * d,
    e2 * a + f2 * c + e,
    e2 * b + f2 * d + f
  ];
}

// packages/expose-renderer/src/text.ts
var SATZ_RASTER = { blocksatz: true, absatzFaktor: 0.55, einzug: 0, einzugZeilen: 0 };
function umbrechen(m, s, groesse, maxBreite, regeln = SATZ_RASTER) {
  const raus = [];
  const absaetze = s.split("\n");
  for (let ai = 0; ai < absaetze.length; ai++) {
    let zeile = [];
    const zeilenDesAbsatzes = [];
    for (const wort of absaetze[ai].split(" ")) {
      const einzug2 = ai === 0 && zeilenDesAbsatzes.length < regeln.einzugZeilen ? regeln.einzug : 0;
      const probe = zeile.concat([wort]).join(" ");
      if (breite(m, probe, groesse) <= maxBreite - einzug2) {
        zeile.push(wort);
      } else {
        zeilenDesAbsatzes.push({ woerter: zeile, letzte: false, einzug: einzug2, absatz: ai });
        zeile = [wort];
      }
    }
    const einzug = ai === 0 && zeilenDesAbsatzes.length < regeln.einzugZeilen ? regeln.einzug : 0;
    zeilenDesAbsatzes.push({ woerter: zeile, letzte: true, einzug, absatz: ai });
    raus.push(...zeilenDesAbsatzes);
  }
  return raus;
}
function hoehe(zeilen, zeilenhoehe, regeln) {
  if (zeilen.length === 0) return 0;
  const absaetze = zeilen[zeilen.length - 1].absatz + 1;
  return zeilen.length * zeilenhoehe + (absaetze - 1) * zeilenhoehe * regeln.absatzFaktor;
}
function setzen(m, zeilen, x, y, maxBreite, groesse, zeilenhoehe, regeln) {
  const raus = [];
  let aktuell = y;
  let letzterAbsatz = zeilen.length ? zeilen[0].absatz : 0;
  for (const zeile of zeilen) {
    if (zeile.absatz !== letzterAbsatz) {
      aktuell -= zeilenhoehe * regeln.absatzFaktor;
      letzterAbsatz = zeile.absatz;
    }
    const spalte = maxBreite - zeile.einzug;
    const dehnen = regeln.blocksatz && !zeile.letzte && zeile.woerter.length > 1;
    if (dehnen) {
      const summe = zeile.woerter.reduce((a, w) => a + breite(m, w, groesse), 0);
      const lueck = (spalte - summe) / (zeile.woerter.length - 1);
      let xx = x + zeile.einzug;
      for (const wort of zeile.woerter) {
        raus.push({ x: xx, y: aktuell, text: wort });
        xx += breite(m, wort, groesse) + lueck;
      }
    } else {
      raus.push({ x: x + zeile.einzug, y: aktuell, text: zeile.woerter.join(" ") });
    }
    aktuell -= zeilenhoehe;
  }
  return { woerter: raus, unten: aktuell };
}
function verdichten(m, s, maxBreite, maxHoehe, groesse, minGroesse, zeilenFaktor, regeln) {
  let g = groesse;
  const schritt = 0.1;
  for (; ; ) {
    const zh = g * zeilenFaktor;
    const zeilen = umbrechen(m, s, g, maxBreite, regeln);
    if (hoehe(zeilen, zh, regeln) <= maxHoehe) {
      return { groesse: g, zeilenhoehe: zh, zeilen, passt: true };
    }
    if (g - schritt < minGroesse - 1e-9) {
      const zeilenMin = umbrechen(m, s, minGroesse, maxBreite, regeln);
      return {
        groesse: minGroesse,
        zeilenhoehe: minGroesse * zeilenFaktor,
        zeilen: zeilenMin,
        passt: false
      };
    }
    g = Math.round((g - schritt) * 10) / 10;
  }
}

// packages/expose-renderer/src/blatt.ts
var Blatt = class _Blatt {
  constructor(breite2, hoehe2, schriften) {
    __publicField(this, "breite", breite2);
    __publicField(this, "hoehe", hoehe2);
    __publicField(this, "schriften", schriften);
    __publicField(this, "schritte", []);
    /** Zeichen, die keine der benutzten Schriften hat. */
    __publicField(this, "fehlend", /* @__PURE__ */ new Map());
    __publicField(this, "matrix", EINHEIT);
  }
  metrik(schnitt) {
    const m = this.schriften.get(schnitt);
    if (!m) {
      throw new Error(
        `Der Schnitt "${schnitt}" ist nicht geladen. Die Vorlage benutzt ihn, aber er steht nicht in ihrer Schriftliste.`
      );
    }
    return m;
  }
  /** Breite einer Zeile in Punkt — sw() der Prototypen. */
  sw(s, schnitt, groesse, sperrung = 0) {
    return breite(this.metrik(schnitt), s, groesse, sperrung);
  }
  /**
   * Eine Zeile setzen — T() der Prototypen, mit derselben Ausrichtung
   * ueber die gemessene Breite. Gibt die Breite zurueck, weil die
   * Prototypen damit weiterrechnen.
   */
  T(x, y, s, schnitt, groesse, farbe2, sperrung = 0, aus = "l") {
    const b = this.sw(s, schnitt, groesse, sperrung);
    let xx = x;
    if (aus === "r") xx -= b;
    else if (aus === "c") xx -= b / 2;
    const fehlt = fehlendeZeichen(this.metrik(schnitt), s);
    if (fehlt.length) {
      const bisher = this.fehlend.get(schnitt) ?? /* @__PURE__ */ new Set();
      for (const z of fehlt) bisher.add(z);
      this.fehlend.set(schnitt, bisher);
    }
    this.schritte.push({
      art: "text",
      x: xx,
      y,
      text: s,
      schnitt,
      groesse,
      sperrung,
      farbe: farbe2,
      matrix: this.matrix
    });
    return b;
  }
  /** Versalien mit Sperrung — caps() bei Signature und Studio. */
  caps(x, y, s, schnitt, groesse, farbe2, sperrung, aus = "l") {
    return this.T(
      x,
      y,
      s.toLocaleUpperCase("de-DE"),
      schnitt,
      groesse,
      farbe2,
      sperrung,
      aus
    );
  }
  rect(x, y, b, h, fuell = null, strich = null, r = 0, linienbreite = 0.6) {
    if (r) {
      this.schritte.push({
        art: "rundrechteck",
        x,
        y,
        b,
        h,
        r,
        fuell,
        strich,
        linienbreite: strich ? linienbreite : null,
        matrix: this.matrix
      });
    } else {
      this.schritte.push({
        art: "rechteck",
        x,
        y,
        b,
        h,
        fuell,
        strich,
        linienbreite: strich ? linienbreite : null,
        matrix: this.matrix
      });
    }
  }
  linie(x1, y1, x2, y2, strich, linienbreite = 0.6, strichmuster = null) {
    this.schritte.push({
      art: "linie",
      x1,
      y1,
      x2,
      y2,
      strich,
      linienbreite,
      strichmuster,
      matrix: this.matrix
    });
  }
  kreis(x, y, r, fuell = null, strich = null, linienbreite = 0.6) {
    this.schritte.push({
      art: "kreis",
      x,
      y,
      r,
      fuell,
      strich,
      linienbreite: strich ? linienbreite : null,
      matrix: this.matrix
    });
  }
  ellipse(x1, y1, x2, y2, fuell = null, strich = null) {
    this.schritte.push({
      art: "ellipse",
      x1,
      y1,
      x2,
      y2,
      fuell,
      strich,
      matrix: this.matrix
    });
  }
  pfad(schritte, fuell = null, strich = null, linienbreite = 0.6) {
    this.schritte.push({
      art: "pfad",
      schritte,
      fuell,
      strich,
      linienbreite: strich ? linienbreite : null,
      matrix: this.matrix
    });
  }
  verlauf(x0, y0, x1, y1, farben, stellen = null) {
    this.schritte.push({
      art: "verlauf",
      x0,
      y0,
      x1,
      y1,
      farben,
      stellen,
      matrix: this.matrix
    });
  }
  bild(x, y, b, h, quelle, fuellmodus = "cover") {
    this.schritte.push({
      art: "bild",
      x,
      y,
      b,
      h,
      quelle,
      fuellmodus,
      matrix: this.matrix
    });
  }
  qr(x, y, b, h, inhalt2, farbe2) {
    this.schritte.push({ art: "qr", x, y, b, h, inhalt: inhalt2, farbe: farbe2, matrix: this.matrix });
  }
  /**
   * Eine Gruppe mit eigener Maske und/oder eigener Matrix. Entspricht
   * saveState / clipPath / … / restoreState bei ReportLab, aber mit
   * sichtbarer Reichweite: das war der Teil, den die Aufzeichnung nicht
   * sehen kann, und darum wird er hier ausdruecklich geklammert.
   */
  gruppe(maske, matrix, inhalt2, zweck) {
    const innen = new _Blatt(this.breite, this.hoehe, this.schriften);
    inhalt2(innen);
    for (const [schnitt, zeichen] of innen.fehlend) {
      const bisher = this.fehlend.get(schnitt) ?? /* @__PURE__ */ new Set();
      for (const z of zeichen) bisher.add(z);
      this.fehlend.set(schnitt, bisher);
    }
    this.schritte.push({
      art: "gruppe",
      maske,
      matrix,
      zweck,
      schritte: innen.schritte
    });
  }
  // ---------------------------------------------------------------- Absatz
  umbrechen(s, schnitt, groesse, maxBreite, regeln) {
    return umbrechen(this.metrik(schnitt), s, groesse, maxBreite, regeln);
  }
  /**
   * Einen Absatz setzen — para() der Prototypen. Gibt die Grundlinie
   * zurueck, auf der es weitergeht.
   */
  absatz(x, y, s, maxBreite, schnitt, groesse, zeilenhoehe, farbe2, regeln) {
    const m = this.metrik(schnitt);
    const zeilen = umbrechen(m, s, groesse, maxBreite, regeln);
    const { woerter, unten } = setzen(
      m,
      zeilen,
      x,
      y,
      maxBreite,
      groesse,
      zeilenhoehe,
      regeln
    );
    for (const w of woerter) {
      if (w.text === "") continue;
      this.T(w.x, w.y, w.text, schnitt, groesse, farbe2);
    }
    return unten;
  }
};

// packages/expose-renderer/src/umgebung.ts
function warne(u, art, element, text2) {
  u.warnungen.push({ art, seite: u.seite.id, element: element?.id, text: text2 });
}
function ankerX(el, ausrichtung) {
  if (ausrichtung === "rechts") return el.x + el.b;
  if (ausrichtung === "mitte") return el.x + el.b / 2;
  return el.x;
}
function ankerArt(ausrichtung) {
  return ausrichtung === "rechts" ? "r" : ausrichtung === "mitte" ? "c" : "l";
}

// packages/expose-renderer/src/farben.ts
function hx(h) {
  let s = String(h).trim().replace(/^#/, "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error(`Keine Farbe: ${h}`);
  return {
    r: parseInt(s.slice(0, 2), 16) / 255,
    g: parseInt(s.slice(2, 4), 16) / 255,
    b: parseInt(s.slice(4, 6), 16) / 255
  };
}
function hex(c) {
  const z = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0");
  return "#" + z(c.r) + z(c.g) + z(c.b);
}
function mix(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  };
}
var WEISS = { r: 1, g: 1, b: 1 };
var SCHWARZ = { r: 0, g: 0, b: 0 };
function helligkeit(c) {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}
function themaRaster(primaer, akzent) {
  const p = hx(primaer), a = hx(akzent);
  const ink0 = mix(p, SCHWARZ, 0.55);
  return {
    p,
    a,
    ink: mix(ink0, hx("#1A1A1A"), 0.6),
    text: hx("#3A3F44"),
    muted: hx("#8A9097"),
    line: mix(p, WEISS, 0.82),
    surf: mix(p, WEISS, 0.93),
    surf2: mix(p, WEISS, 0.86),
    pdark: mix(p, SCHWARZ, 0.25),
    asoft: mix(a, WEISS, 0.8)
  };
}
function themaSignature(dunkel, metall) {
  const d = hx(dunkel), a = hx(metall);
  const paper = mix(mix(WEISS, a, 0.07), d, 0.015);
  return {
    d,
    a,
    paper,
    paper2: mix(paper, d, 0.05),
    ink: mix(d, SCHWARZ, 0.2),
    text: mix(d, paper, 0.18),
    muted: mix(d, paper, 0.52),
    hair: mix(d, paper, 0.8),
    onD: mix(paper, d, 0.08),
    onDm: mix(paper, d, 0.45),
    dline: mix(d, paper, 0.18)
  };
}
function themaStudio(signal, dunkel) {
  const s = hx(signal), d = hx(dunkel);
  return {
    s,
    d,
    // Die eine Automatik, die der Auftrag ausdruecklich nennt: Text auf der
    // Signalflaeche wird dunkel, sobald die Flaeche hell ist. Die Schwelle
    // 0,62 steht so im Prototyp.
    on_s: helligkeit(s) > 0.62 ? d : WEISS,
    paper: hx("#FFFFFF"),
    tint: mix(s, WEISS, 0.88),
    tint2: mix(s, WEISS, 0.74),
    text: mix(d, WEISS, 0.12),
    muted: mix(d, WEISS, 0.48),
    rule: d,
    hair: mix(d, WEISS, 0.84)
  };
}
var VORGABE = {
  raster: { f1: "#0F4C5C", f2: "#E8915A" },
  signature: { f1: "#2B221D", f2: "#B08A5E" },
  studio: { f1: "#2F4BFF", f2: "#111318" }
};
function palette(ableitung, f1, f2) {
  if (ableitung === "raster") return { art: "raster", ...themaRaster(f1, f2) };
  if (ableitung === "signature") return { art: "signature", ...themaSignature(f1, f2) };
  return { art: "studio", ...themaStudio(f1, f2) };
}

// packages/expose-renderer/src/stil.ts
function paletteFuer(vorlage, marke = {}) {
  const ableitung = vorlage.stil.farben.ableitung;
  const f1 = farbQuelle(vorlage.stil.farben.f1, marke) || VORGABE[ableitung].f1;
  const f2 = farbQuelle(vorlage.stil.farben.f2, marke) || VORGABE[ableitung].f2;
  const p = palette(ableitung, f1, f2);
  return { ...p, weiss: WEISS, schwarz: SCHWARZ };
}
function farbQuelle(ref, marke) {
  if (typeof ref === "string") {
    if (ref === "ci.primaer") return marke.primaer ?? "";
    if (ref === "ci.akzent") return marke.akzent ?? "";
    if (ref.startsWith("#")) return ref;
  }
  return "";
}
function farbe(ref, p, deckkraft2 = 1) {
  const c = farbeOhne(ref, p);
  return [c.r, c.g, c.b, deckkraft2];
}
function farbeOhne(ref, p) {
  if (typeof ref === "object" && ref !== null && "mix" in ref) {
    const [a, b, t] = ref.mix;
    if (typeof t !== "number") {
      throw new Error(`mix braucht einen Anteil als Zahl: ${JSON.stringify(ref)}`);
    }
    return mix(farbeOhne(a, p), farbeOhne(b, p), t);
  }
  if (typeof ref === "object" && ref !== null && "palette" in ref) {
    const c = p[ref.palette];
    if (!c) {
      throw new Error(
        `Die Farbe "${ref.palette}" kennt diese Farbableitung nicht. Vorhanden: ${Object.keys(p).sort().join(", ")}.`
      );
    }
    return c;
  }
  if (typeof ref === "string") {
    if (ref.startsWith("#")) return hx(ref);
    const c = p[ref];
    if (c) return c;
    throw new Error(
      `Unbekannter Farbverweis "${ref}". Vorhanden: ${Object.keys(p).sort().join(", ")}, dazu "#RRGGBB".`
    );
  }
  throw new Error(`Unbekannter Farbverweis: ${JSON.stringify(ref)}`);
}
var FAMILIE = {
  jakarta: "Jak",
  cormorant: "Corm",
  archivo: "Arch"
};
function schnittName(ref, ersatz) {
  if (ref === "ci.font") {
    if (ersatz === void 0 || ersatz === "ci.font") {
      throw new Error('"ci.font" ohne Ersatzschrift — die Vorlage muss eine nennen.');
    }
    return schnittName(ersatz);
  }
  const vorne = FAMILIE[ref.familie];
  if (!vorne) throw new Error(`Unbekannte Schriftfamilie "${ref.familie}".`);
  return `${vorne}-${ref.schnitt}`;
}
function textstil(stil, p, textschrift) {
  return {
    schnitt: schnittName(stil.schrift, textschrift),
    groesse: stil.groesse,
    zeilenhoehe: stil.zeilen ?? stil.groesse * 1.45,
    farbe: farbe(stil.farbe, p),
    sperrung: stil.sperrung ?? 0,
    grossbuchstaben: stil.grossbuchstaben ?? false,
    ausrichtung: stil.ausrichtung ?? "links",
    minGroesse: stil.min_groesse ?? stil.groesse * 0.82
  };
}
function stilAus(vorlage, name, p) {
  const s = vorlage.stil.textstile[name];
  if (!s) {
    throw new Error(
      `Der Textstil "${name}" steht nicht in der Vorlage. Vorhanden: ${Object.keys(vorlage.stil.textstile).sort().join(", ")}.`
    );
  }
  return textstil(s, p, vorlage.stil.schriften.text);
}
function satzRegeln(ableitung, blocksatz) {
  const faktor = ableitung === "signature" ? 0.6 : ableitung === "studio" ? 0.5 : 0.55;
  return { blocksatz, absatzFaktor: faktor, einzug: 0, einzugZeilen: 0 };
}

// packages/expose-renderer/src/felder.ts
var O = (spalte) => ({ tabelle: "immobilien", spalte });
var P = (spalte) => ({ tabelle: "profiles", spalte });
var F = (spalte) => ({ tabelle: "firma_stammdaten", spalte });
var GERECHNET = { gerechnet: true };
var OBJEKT = [
  { schluessel: "objekt.immo_nr", name: "Objekt-Nr.", typ: "text", quelle: O("immo_nr") },
  {
    schluessel: "objekt.bezeichnung",
    name: "Interne Bezeichnung",
    typ: "text",
    quelle: O("bezeichnung"),
    hinweis: "Nur für die eigene Verwaltung — im Exposé steht der Objekttitel."
  },
  { schluessel: "objekt.objekttitel", name: "Objekttitel", typ: "text", quelle: O("objekttitel") },
  {
    schluessel: "objekt.expose_titel_zeilen",
    name: "Titel, zeilenweise",
    typ: "liste",
    quelle: O("expose_titel_zeilen"),
    hinweis: "Für Vorlagen, die den Titel in festen Zeilen setzen (Studio)."
  },
  {
    schluessel: "objekt.expose_titel_text",
    name: "Titel als Textblock",
    typ: "mehrzeilig",
    quelle: GERECHNET,
    hinweis: "Die Titelzeilen mit Umbruch dazwischen."
  },
  {
    schluessel: "objekt.untertitel",
    name: "Untertitel",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "Kurzzeile unter dem Titel, aus Zimmern, Fläche und Besonderheit."
  },
  { schluessel: "objekt.expose_slogan", name: "Slogan", typ: "text", quelle: O("expose_slogan") },
  { schluessel: "objekt.expose_zitat", name: "Zitat", typ: "text", quelle: O("expose_zitat") },
  {
    schluessel: "objekt.expose_prolog",
    name: "Prolog",
    typ: "mehrzeilig",
    quelle: GERECHNET,
    hinweis: "Einleitender Text der Luxusvorlage."
  },
  {
    schluessel: "objekt.expose_prolog_initiale",
    name: "Prolog, erster Buchstabe",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "Fuer die Initiale, die in den Absatz hineinragt."
  },
  {
    schluessel: "objekt.expose_prolog_rest",
    name: "Prolog ohne ersten Buchstaben",
    typ: "mehrzeilig",
    quelle: GERECHNET
  },
  {
    schluessel: "objekt.titel_erste_zeile",
    name: "Titel, erste Zeile",
    typ: "text",
    quelle: GERECHNET
  },
  {
    schluessel: "objekt.titel_zweite_zeile",
    name: "Titel, zweite Zeile",
    typ: "text",
    quelle: GERECHNET
  },
  {
    schluessel: "objekt.seeufer_meter",
    name: "Eigenes Ufer in Metern",
    typ: "zahl",
    quelle: GERECHNET,
    stellen: 0,
    hinweis: "Besonderheit am Wasser. Fehlt sie, entfaellt die Kennzahl."
  },
  { schluessel: "objekt.objektart", name: "Objektart", typ: "text", quelle: O("objektart") },
  { schluessel: "objekt.objekttyp", name: "Objekttyp", typ: "text", quelle: O("objekttyp") },
  { schluessel: "objekt.nutzungsart", name: "Nutzungsart", typ: "text", quelle: O("nutzungsart") },
  {
    schluessel: "objekt.vertragsart",
    name: "Vermarktungsart",
    typ: "text",
    quelle: O("vertragsart"),
    hinweis: "Kauf oder Miete. Steuert, welche Seiten erscheinen."
  },
  { schluessel: "objekt.status", name: "Status", typ: "text", quelle: O("status") },
  // Anschrift
  { schluessel: "objekt.strasse", name: "Straße", typ: "text", quelle: O("strasse") },
  { schluessel: "objekt.hausnummer", name: "Hausnummer", typ: "text", quelle: O("hausnummer") },
  { schluessel: "objekt.adresse", name: "Straße und Hausnummer", typ: "text", quelle: GERECHNET },
  { schluessel: "objekt.plz", name: "PLZ", typ: "text", quelle: O("plz") },
  { schluessel: "objekt.ort", name: "Ort", typ: "text", quelle: O("ort") },
  { schluessel: "objekt.ortsteil", name: "Ortsteil", typ: "text", quelle: O("ortsteil") },
  { schluessel: "objekt.plz_ort", name: "PLZ und Ort", typ: "text", quelle: GERECHNET },
  {
    schluessel: "objekt.adresse_freigeben",
    name: "Adresse im Exposé zeigen",
    typ: "ja_nein",
    quelle: O("adresse_freigeben"),
    hinweis: "Ist sie nicht freigegeben, entfallen Straße und Hausnummer — auch auf der Karte."
  },
  // Flaechen und Raeume
  { schluessel: "objekt.wohnflaeche", name: "Wohnfläche", typ: "flaeche", quelle: O("wohnflaeche"), stellen: 0 },
  { schluessel: "objekt.nutzflaeche", name: "Nutzfläche", typ: "flaeche", quelle: O("nutzflaeche"), stellen: 0 },
  { schluessel: "objekt.grundstueck", name: "Grundstücksfläche", typ: "flaeche", quelle: O("grundstueck"), stellen: 0 },
  { schluessel: "objekt.zimmer", name: "Zimmer", typ: "zahl", quelle: O("zimmer"), stellen: 1 },
  { schluessel: "objekt.schlafzimmer", name: "Schlafzimmer", typ: "zahl", quelle: O("schlafzimmer"), stellen: 0 },
  { schluessel: "objekt.badezimmer", name: "Badezimmer", typ: "zahl", quelle: O("badezimmer"), stellen: 0 },
  { schluessel: "objekt.anzahl_balkone", name: "Balkone", typ: "zahl", quelle: O("anzahl_balkone"), stellen: 0 },
  { schluessel: "objekt.anzahl_terrassen", name: "Terrassen", typ: "zahl", quelle: O("anzahl_terrassen"), stellen: 0 },
  { schluessel: "objekt.etage", name: "Etage", typ: "text", quelle: O("etage") },
  { schluessel: "objekt.etagen_gesamt", name: "Etagen im Haus", typ: "zahl", quelle: O("etagen_gesamt"), stellen: 0 },
  { schluessel: "objekt.wohnungsnr", name: "Wohnungsnummer", typ: "text", quelle: O("wohnungsnr") },
  {
    schluessel: "objekt.raumaufteilung",
    name: "Raumaufteilung",
    typ: "liste",
    quelle: O("raumaufteilung"),
    hinweis: "Für das Element „Raumliste“ — Name und Fläche je Raum."
  },
  // Zustand und Technik
  { schluessel: "objekt.baujahr", name: "Baujahr", typ: "jahr", quelle: O("baujahr") },
  {
    schluessel: "objekt.modernisierung_jahr",
    name: "Letzte Modernisierung",
    typ: "jahr",
    quelle: O("modernisierung_jahr")
  },
  { schluessel: "objekt.zustand", name: "Zustand", typ: "text", quelle: O("zustand") },
  { schluessel: "objekt.unterkellert", name: "Keller", typ: "text", quelle: O("unterkellert") },
  { schluessel: "objekt.wintergarten", name: "Wintergarten", typ: "ja_nein", quelle: O("wintergarten") },
  { schluessel: "objekt.heizungsart", name: "Heizungsart", typ: "text", quelle: O("heizungsart") },
  { schluessel: "objekt.befeuerung", name: "Befeuerung", typ: "text", quelle: O("befeuerung") },
  { schluessel: "objekt.fenster", name: "Fenster", typ: "text", quelle: O("fenster") },
  { schluessel: "objekt.fenster_verglasung", name: "Verglasung", typ: "text", quelle: O("fenster_verglasung") },
  { schluessel: "objekt.fenster_baujahr", name: "Baujahr Fenster", typ: "jahr", quelle: O("fenster_baujahr") },
  { schluessel: "objekt.stellplatz_art", name: "Stellplatzart", typ: "text", quelle: O("stellplatz_art") },
  { schluessel: "objekt.stellplatz_anzahl", name: "Stellplätze", typ: "zahl", quelle: O("stellplatz_anzahl"), stellen: 0 },
  {
    schluessel: "objekt.stellplatz",
    name: "Stellplätze (Anzeige)",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "Art und Anzahl in einer Zeile."
  },
  { schluessel: "objekt.verfuegbar_ab", name: "Verfügbar ab", typ: "text", quelle: O("verfuegbar_ab") },
  // Energie
  {
    schluessel: "objekt.energieausweis_typ",
    name: "Art des Energieausweises",
    typ: "text",
    quelle: O("energieausweis_typ")
  },
  {
    schluessel: "objekt.energie_kennwert",
    name: "Energiekennwert",
    typ: "zahl",
    quelle: O("energie_kennwert"),
    stellen: 1,
    hinweis: "In kWh/(m²a). Die Einheit setzt das Element."
  },
  { schluessel: "objekt.energie_klasse", name: "Energieeffizienzklasse", typ: "text", quelle: O("energie_klasse") },
  { schluessel: "objekt.energie_traeger", name: "Wesentlicher Energieträger", typ: "text", quelle: O("energie_traeger") },
  {
    schluessel: "objekt.energie_baujahr_anlage",
    name: "Baujahr der Heizung",
    typ: "jahr",
    quelle: O("energie_baujahr_anlage")
  },
  {
    schluessel: "objekt.energie_warmwasser",
    name: "Warmwasser enthalten",
    typ: "ja_nein",
    quelle: O("energie_warmwasser")
  },
  {
    schluessel: "objekt.energie_gueltig_bis",
    name: "Energieausweis gültig bis",
    typ: "datum",
    quelle: O("energie_gueltig_bis")
  },
  {
    schluessel: "objekt.energie_gueltig_kurz",
    name: "Gültig bis (Monat/Jahr)",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "MM/JJJJ — so steht es in den Vorlagen."
  },
  {
    schluessel: "objekt.expose_energie_hinweis",
    name: "Hinweis zur Energie",
    typ: "mehrzeilig",
    quelle: O("expose_energie_hinweis"),
    hinweis: "Füllt den Kasten „Gut zu wissen“. Bleibt er leer, entfällt der Kasten."
  },
  // Preise
  { schluessel: "objekt.angebotspreis", name: "Angebotspreis", typ: "euro", quelle: O("angebotspreis"), stellen: 0 },
  {
    schluessel: "objekt.expose_preis_auf_anfrage",
    name: "Preis auf Anfrage",
    typ: "ja_nein",
    quelle: O("expose_preis_auf_anfrage"),
    hinweis: "Ist das gesetzt, steht überall „auf Anfrage“ statt einer Zahl."
  },
  {
    schluessel: "objekt.preis",
    name: "Preis (Anzeige)",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "Angebotspreis, oder „auf Anfrage“ — je nach Schalter."
  },
  {
    schluessel: "objekt.marktwert",
    name: "Marktwert",
    typ: "euro",
    quelle: O("marktwert"),
    stellen: 0,
    hinweis: "Interne Einschätzung. Gehört in kein Exposé für Interessenten."
  },
  { schluessel: "objekt.kaltmiete", name: "Kaltmiete", typ: "euro", quelle: O("kaltmiete"), stellen: 0 },
  { schluessel: "objekt.nebenkosten", name: "Nebenkosten", typ: "euro", quelle: O("nebenkosten"), stellen: 0 },
  { schluessel: "objekt.heizkosten", name: "Heizkosten", typ: "euro", quelle: O("heizkosten"), stellen: 0 },
  {
    schluessel: "objekt.warmwasser_in_heizkosten",
    name: "Warmwasser in den Heizkosten",
    typ: "ja_nein",
    quelle: O("warmwasser_in_heizkosten")
  },
  { schluessel: "objekt.warmmiete", name: "Warmmiete", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "objekt.kaution", name: "Kaution", typ: "text", quelle: O("kaution") },
  {
    schluessel: "objekt.kaution_monate",
    name: "Kaution in Monatsmieten",
    typ: "zahl",
    quelle: O("kaution_monate"),
    stellen: 1
  },
  {
    schluessel: "objekt.stellplatzmiete",
    name: "Stellplatzmiete",
    typ: "euro",
    quelle: O("stellplatzmiete"),
    stellen: 0
  },
  {
    schluessel: "objekt.laufende_kosten",
    name: "Laufende Kosten je Monat",
    typ: "liste",
    quelle: O("laufende_kosten"),
    hinweis: "Name und Betrag je Posten. Nichts erfasst, keine Kachel."
  },
  { schluessel: "objekt.hausgeld", name: "Hausgeld", typ: "euro", quelle: O("hausgeld"), stellen: 0 },
  {
    schluessel: "objekt.hausgeld_nicht_umlagefaehig",
    name: "Hausgeld, nicht umlagefähig",
    typ: "euro",
    quelle: O("hausgeld_nicht_umlagefaehig"),
    stellen: 0
  },
  { schluessel: "objekt.provision_aussen", name: "Käuferprovision", typ: "text", quelle: O("provision_aussen") },
  {
    schluessel: "objekt.provision_innen",
    name: "Verkäuferprovision",
    typ: "text",
    quelle: O("provision_innen"),
    hinweis: "Innenprovision. Gehört in kein Exposé für Interessenten."
  },
  { schluessel: "objekt.provisionsfrei", name: "Provisionsfrei", typ: "ja_nein", quelle: O("provisionsfrei") },
  {
    schluessel: "objekt.grunderwerbsteuer_satz",
    name: "Grunderwerbsteuersatz",
    typ: "prozent",
    quelle: O("grunderwerbsteuer_satz"),
    stellen: 1
  },
  // Kapitalanlage
  { schluessel: "objekt.vermietet", name: "Vermietet", typ: "ja_nein", quelle: O("vermietet") },
  { schluessel: "objekt.miete_ist", name: "Ist-Miete", typ: "euro", quelle: O("miete_ist"), stellen: 0 },
  { schluessel: "objekt.miete_soll", name: "Soll-Miete", typ: "euro", quelle: O("miete_soll"), stellen: 0 },
  // Texte
  {
    schluessel: "objekt.ueberschrift_objektbeschreibung",
    name: "Überschrift Objektbeschreibung",
    typ: "text",
    quelle: O("ueberschrift_objektbeschreibung")
  },
  {
    schluessel: "objekt.beschreibung_objekt",
    name: "Objektbeschreibung",
    typ: "mehrzeilig",
    quelle: O("beschreibung_objekt")
  },
  { schluessel: "objekt.ueberschrift_lage", name: "Überschrift Lage", typ: "text", quelle: O("ueberschrift_lage") },
  {
    schluessel: "objekt.beschreibung_lage",
    name: "Lagebeschreibung",
    typ: "mehrzeilig",
    quelle: O("beschreibung_lage")
  },
  {
    schluessel: "objekt.beschreibung_ausstattung",
    name: "Ausstattung",
    typ: "mehrzeilig",
    quelle: O("beschreibung_ausstattung")
  },
  {
    schluessel: "objekt.beschreibung_ausstattung_expose",
    name: "Ausstattung (Exposé-Fassung)",
    typ: "aufzaehlung",
    quelle: O("beschreibung_ausstattung_expose"),
    hinweis: "Eine Zeile je Punkt. Füllt das Element „Ausstattung“."
  },
  {
    schluessel: "objekt.expose_ausstattung_gruppen",
    name: "Ausstattung, gruppiert",
    typ: "liste",
    quelle: O("expose_ausstattung_gruppen")
  },
  {
    schluessel: "objekt.beschreibung_sonstiges",
    name: "Sonstiges",
    typ: "mehrzeilig",
    quelle: O("beschreibung_sonstiges")
  },
  {
    schluessel: "objekt.notizen",
    name: "Interne Notizen",
    typ: "mehrzeilig",
    quelle: O("notizen"),
    hinweis: "Interne Notizen. Gehören in kein Exposé für Interessenten."
  },
  // Listen fuer die zusammengesetzten Elemente
  { schluessel: "objekt.expose_highlights", name: "Highlights", typ: "liste", quelle: O("expose_highlights") },
  { schluessel: "objekt.lage_distanzen", name: "Entfernungen", typ: "liste", quelle: O("lage_distanzen") },
  { schluessel: "objekt.expose_wege", name: "Wegezeiten", typ: "liste", quelle: O("expose_wege") },
  {
    schluessel: "objekt.eckdaten",
    name: "Eckdaten",
    typ: "liste",
    quelle: GERECHNET,
    hinweis: "Die wichtigsten Zahlen als Wert, Einheit und Label."
  },
  {
    schluessel: "objekt.fakten",
    name: "Angaben als Liste",
    typ: "liste",
    quelle: GERECHNET,
    hinweis: "Label und Wert, fertig formatiert — für freie Angabenlisten."
  },
  {
    schluessel: "objekt.energie_angaben",
    name: "Energieangaben als Liste",
    typ: "liste",
    quelle: GERECHNET
  },
  {
    schluessel: "objekt.lage_koordinaten",
    name: "Koordinaten",
    typ: "liste",
    quelle: O("lage_koordinaten"),
    hinweis: "Für die Karte. Keine Koordinaten, keine Karte."
  },
  // Verweise
  { schluessel: "objekt.expose_qr_url", name: "Link für den QR-Code", typ: "text", quelle: O("expose_qr_url") },
  { schluessel: "objekt.rundgang_url", name: "Link zum Rundgang", typ: "text", quelle: O("rundgang_url") },
  { schluessel: "objekt.hauptbild_url", name: "Titelbild", typ: "bild", quelle: O("hauptbild_url") },
  // Schalter, die Seiten ein- und ausblenden
  { schluessel: "objekt.expose_rendite", name: "Renditeseite zeigen", typ: "ja_nein", quelle: O("expose_rendite") },
  {
    schluessel: "objekt.expose_nebenkosten",
    name: "Nebenkostenseite zeigen",
    typ: "ja_nein",
    quelle: O("expose_nebenkosten")
  }
];
var ANSPRECHPARTNER = [
  { schluessel: "ansprechpartner.name", name: "Name", typ: "text", quelle: P("name") },
  { schluessel: "ansprechpartner.titel", name: "Titel", typ: "text", quelle: P("titel") },
  { schluessel: "ansprechpartner.funktion", name: "Funktion", typ: "text", quelle: P("funktion") },
  { schluessel: "ansprechpartner.telefon", name: "Telefon", typ: "text", quelle: P("telefon") },
  { schluessel: "ansprechpartner.mobil", name: "Mobil", typ: "text", quelle: P("mobil") },
  { schluessel: "ansprechpartner.email", name: "E-Mail", typ: "text", quelle: P("email") },
  { schluessel: "ansprechpartner.foto", name: "Foto", typ: "bild", quelle: P("foto_url") }
];
var FIRMA = [
  { schluessel: "firma.name", name: "Firmenname", typ: "text", quelle: F("firma_name") },
  {
    schluessel: "firma.linie",
    name: "Produktlinie",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "Zweite Markenzeile, z. B. fuer ein Premium-Segment."
  },
  {
    schluessel: "firma.marken_name",
    name: "Markenname",
    typ: "text",
    quelle: F("marken_name"),
    hinweis: "Kurzform für Kopf und Fuß. Fehlt sie, nimmt der Renderer den Firmennamen."
  },
  { schluessel: "firma.strasse", name: "Straße", typ: "text", quelle: F("strasse") },
  { schluessel: "firma.plz", name: "PLZ", typ: "text", quelle: F("plz") },
  { schluessel: "firma.ort", name: "Ort", typ: "text", quelle: F("ort") },
  { schluessel: "firma.land", name: "Land", typ: "text", quelle: F("land") },
  { schluessel: "firma.adresse", name: "Anschrift, einzeilig", typ: "text", quelle: GERECHNET },
  { schluessel: "firma.telefon", name: "Telefon", typ: "text", quelle: F("telefon") },
  { schluessel: "firma.fax", name: "Fax", typ: "text", quelle: F("fax") },
  { schluessel: "firma.email", name: "E-Mail", typ: "text", quelle: F("email") },
  { schluessel: "firma.web", name: "Internetseite", typ: "text", quelle: F("web") },
  { schluessel: "firma.geschaeftsfuehrer", name: "Geschäftsführung", typ: "text", quelle: F("geschaeftsfuehrer") },
  { schluessel: "firma.registergericht", name: "Registergericht", typ: "text", quelle: F("registergericht") },
  { schluessel: "firma.hrb", name: "Handelsregisternummer", typ: "text", quelle: F("hrb") },
  { schluessel: "firma.ust_id", name: "USt-IdNr.", typ: "text", quelle: F("ust_id") },
  { schluessel: "firma.steuernummer", name: "Steuernummer", typ: "text", quelle: F("steuernummer") },
  { schluessel: "firma.kammer", name: "Kammer", typ: "text", quelle: F("kammer") },
  { schluessel: "firma.aufsichtsbehoerde", name: "Aufsichtsbehörde", typ: "text", quelle: F("aufsichtsbehoerde") },
  { schluessel: "firma.rechtshinweis", name: "Rechtshinweis", typ: "mehrzeilig", quelle: F("rechtshinweis") },
  {
    schluessel: "firma.impressum_zeile",
    name: "Register- und Steuerzeile",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "Registergericht, HRB und USt-IdNr. in einer Zeile, mit · getrennt."
  },
  { schluessel: "firma.url_impressum", name: "Link zum Impressum", typ: "text", quelle: F("url_impressum") },
  { schluessel: "firma.url_datenschutz", name: "Link zum Datenschutz", typ: "text", quelle: F("url_datenschutz") },
  { schluessel: "firma.url_agb", name: "Link zu den AGB", typ: "text", quelle: F("url_agb") },
  { schluessel: "firma.logo", name: "Logo", typ: "bild", quelle: F("logo_pfad") },
  { schluessel: "firma.ci_primaer", name: "Primärfarbe", typ: "text", quelle: F("ci_primaer") },
  { schluessel: "firma.ci_akzent", name: "Akzentfarbe", typ: "text", quelle: F("ci_akzent") }
];
var RECHNUNG = [
  {
    schluessel: "rechnung.kaufpreis",
    name: "Kaufpreis (Rechnung)",
    typ: "euro",
    quelle: GERECHNET,
    stellen: 0
  },
  {
    schluessel: "rechnung.grunderwerbsteuer_satz",
    name: "Grunderwerbsteuersatz",
    typ: "prozent",
    quelle: GERECHNET,
    stellen: 1,
    hinweis: "Aus dem Objekt, sonst aus dem Bundesland der PLZ."
  },
  { schluessel: "rechnung.grunderwerbsteuer", name: "Grunderwerbsteuer", typ: "euro", quelle: GERECHNET, stellen: 0 },
  {
    schluessel: "rechnung.notar_satz",
    name: "Satz für Notar und Grundbuch",
    typ: "prozent",
    quelle: GERECHNET,
    stellen: 1
  },
  { schluessel: "rechnung.notar", name: "Notar und Grundbuch", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.courtage_satz", name: "Courtagesatz", typ: "text", quelle: GERECHNET },
  { schluessel: "rechnung.courtage", name: "Käufercourtage", typ: "euro", quelle: GERECHNET, stellen: 0 },
  {
    schluessel: "rechnung.posten",
    name: "Kostenposten",
    typ: "liste",
    quelle: GERECHNET,
    hinweis: "Kaufpreis, Grunderwerbsteuer, Notar, Courtage — mit Betrag."
  },
  { schluessel: "rechnung.gesamtaufwand", name: "Gesamtaufwand", typ: "euro", quelle: GERECHNET, stellen: 0 },
  {
    schluessel: "rechnung.laufende_summe",
    name: "Summe laufende Kosten",
    typ: "euro",
    quelle: GERECHNET,
    stellen: 0
  },
  {
    schluessel: "rechnung.eigenkapital_prozent",
    name: "Eigenkapital",
    typ: "prozent",
    quelle: GERECHNET,
    stellen: 0
  },
  { schluessel: "rechnung.eigenkapital", name: "Eigenkapital", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.darlehen", name: "Darlehen", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.zinssatz", name: "Sollzins p. a.", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.tilgung", name: "Anfangstilgung", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.monatsrate", name: "Monatliche Rate", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.bruttorendite", name: "Bruttorendite", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.nettorendite", name: "Nettorendite", typ: "prozent", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.kaufpreisfaktor", name: "Kaufpreisfaktor", typ: "zahl", quelle: GERECHNET, stellen: 1 },
  { schluessel: "rechnung.preis_pro_qm", name: "Preis je m²", typ: "euro", quelle: GERECHNET, stellen: 0 },
  { schluessel: "rechnung.hinweis", name: "Hinweis zur Beispielrechnung", typ: "mehrzeilig", quelle: GERECHNET }
];
var SEITE = [
  {
    schluessel: "dokument.seiten",
    name: "Seiten des Dokuments",
    typ: "liste",
    quelle: GERECHNET,
    hinweis: "Für das Inhaltsverzeichnis: Nummer und Name."
  },
  { schluessel: "seite.nummer", name: "Seitenzahl", typ: "zahl", quelle: GERECHNET, stellen: 0 },
  { schluessel: "seite.gesamt", name: "Seiten insgesamt", typ: "zahl", quelle: GERECHNET, stellen: 0 },
  {
    schluessel: "lauf.nummer",
    name: "Durchgang der Seite",
    typ: "zahl",
    quelle: GERECHNET,
    stellen: 0,
    hinweis: "Bei einer Seite, die sich wiederholt: der wievielte Durchgang."
  },
  {
    schluessel: "lauf.gesamt",
    name: "Durchgänge insgesamt",
    typ: "zahl",
    quelle: GERECHNET,
    stellen: 0
  },
  {
    schluessel: "seite.nummer_zweistellig",
    name: "Seitenzahl, zweistellig",
    typ: "text",
    quelle: GERECHNET,
    hinweis: "Mit fuehrender Null: 02 statt 2."
  },
  {
    schluessel: "seite.gesamt_zweistellig",
    name: "Seiten insgesamt, zweistellig",
    typ: "text",
    quelle: GERECHNET
  },
  { schluessel: "seite.name", name: "Name der Seite", typ: "text", quelle: GERECHNET },
  { schluessel: "datum", name: "Heutiges Datum", typ: "datum", quelle: GERECHNET }
];
var KATALOG = [
  ...OBJEKT,
  ...ANSPRECHPARTNER,
  ...FIRMA,
  ...RECHNUNG,
  ...SEITE
];
function feld(schluessel) {
  return KATALOG.find((f) => f.schluessel === schluessel);
}

// packages/expose-renderer/src/werte.ts
function zahlDe(v, stellen = 0, knapp = false) {
  const negativ = v < 0;
  const gerundet = Math.abs(v).toFixed(stellen);
  let [ganz, bruch] = gerundet.split(".");
  if (knapp && bruch) {
    bruch = bruch.replace(/0+$/, "");
    if (bruch === "") bruch = void 0;
  }
  let mitPunkten = "";
  for (let i = 0; i < ganz.length; i++) {
    if (i > 0 && (ganz.length - i) % 3 === 0) mitPunkten += ".";
    mitPunkten += ganz[i];
  }
  const raus = bruch ? `${mitPunkten},${bruch}` : mitPunkten;
  return negativ ? `−${raus}` : raus;
}
function datumDe(v) {
  if (v == null || v === "") return void 0;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const teile = s.split("T")[0].split("-");
  if (teile.length !== 3) return s;
  return `${teile[2]}.${teile[1]}.${teile[0]}`;
}
function formatiere(roh, typ, stellen) {
  if (roh == null) return void 0;
  if (typeof roh === "string" && roh.trim() === "") return void 0;
  switch (typ) {
    case "text":
    case "mehrzeilig":
    case "aufzaehlung":
      return String(roh);
    case "zahl": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return void 0;
      return zahlDe(n, stellen ?? 0, true);
    }
    case "flaeche": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return void 0;
      return `${zahlDe(n, stellen ?? 0, true)} m²`;
    }
    case "euro": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return void 0;
      return `${zahlDe(n, stellen ?? 0)} €`;
    }
    case "prozent": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return void 0;
      return `${zahlDe(n, stellen ?? 1)} %`;
    }
    case "jahr": {
      const n = Number(roh);
      if (!Number.isFinite(n)) return void 0;
      return String(Math.trunc(n));
    }
    case "datum":
      return datumDe(roh);
    case "ja_nein":
      if (typeof roh === "boolean") return roh ? "ja" : "nein";
      return void 0;
    case "liste":
      return Array.isArray(roh) && roh.length ? String(roh.length) : void 0;
    case "bild":
      return String(roh);
  }
}
function rohwert(daten, schluessel) {
  if (schluessel in daten) return daten[schluessel];
  return void 0;
}
function wert(daten, schluessel) {
  const f = feld(schluessel);
  const roh = rohwert(daten, schluessel);
  if (f === void 0) {
    return roh == null || roh === "" ? void 0 : String(roh);
  }
  return formatiere(roh, f.typ, f.stellen);
}
function liste(daten, schluessel) {
  const roh = rohwert(daten, schluessel);
  return Array.isArray(roh) ? roh : [];
}
var PLATZHALTER = /\{\{\s*([A-Za-z0-9_.]+\??)\s*\}\}/g;
function ersetze(daten, text2) {
  let etwasFehlt = false;
  const raus = text2.replace(PLATZHALTER, (_treffer, schluessel) => {
    const freiwillig = schluessel.endsWith("?");
    const name = freiwillig ? schluessel.slice(0, -1) : schluessel;
    const w = wert(daten, name);
    if (w === void 0) {
      if (!freiwillig) etwasFehlt = true;
      return "";
    }
    return w;
  });
  if (etwasFehlt) return void 0;
  return raus.trim() === "" ? void 0 : raus;
}
function platzhalterIn(text2) {
  const raus = [];
  for (const t of text2.matchAll(PLATZHALTER)) {
    const name = t[1].endsWith("?") ? t[1].slice(0, -1) : t[1];
    if (!raus.includes(name)) raus.push(name);
  }
  return raus;
}
function trifftZu(daten, b) {
  if (b === void 0) return true;
  if ("und" in b) return b.und.every((t) => trifftZu(daten, t));
  if ("oder" in b) return b.oder.some((t) => trifftZu(daten, t));
  if ("nicht" in b) return !trifftZu(daten, b.nicht);
  if ("vorhanden" in b) {
    const roh = rohwert(daten, b.vorhanden);
    if (roh == null) return false;
    if (Array.isArray(roh)) return roh.length > 0;
    if (typeof roh === "string") return roh.trim() !== "";
    if (typeof roh === "boolean") return roh;
    return true;
  }
  if ("gleich" in b) return vergleichbar(rohwert(daten, b.feld)) === vergleichbar(b.gleich);
  if ("ungleich" in b) return vergleichbar(rohwert(daten, b.feld)) !== vergleichbar(b.ungleich);
  if ("groesser" in b) {
    const n = Number(rohwert(daten, b.feld));
    return Number.isFinite(n) && n > b.groesser;
  }
  return true;
}
function vergleichbar(v) {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v).trim().toLocaleLowerCase("de-DE");
}

// packages/expose-renderer/src/elemente.ts
function zahl(el, name, vorgabe) {
  const v = el[name];
  return typeof v === "number" ? v : vorgabe;
}
function zeichenkette(el, name) {
  const v = el[name];
  return typeof v === "string" ? v : void 0;
}
function wahr(el, name, vorgabe = false) {
  const v = el[name];
  return typeof v === "boolean" ? v : vorgabe;
}
function farbRef(el, name, u, deckkraft2 = 1) {
  const v = el[name];
  if (v === void 0 || v === null) return null;
  return farbe(v, u.palette, deckkraft2);
}
function gross(s, t) {
  return s.grossbuchstaben ? t.toLocaleUpperCase("de-DE") : t;
}
function stilVon(el, u, name = "stil", vorgabe) {
  const s = zeichenkette(el, name) ?? vorgabe;
  if (s === void 0) {
    throw new Error(`Element ${el.id}: "${name}" fehlt und hat keine Vorgabe.`);
  }
  return u.stil(s);
}
function inhalt(el, u, gross2, name = "inhalt") {
  const roh = zeichenkette(el, name);
  if (roh === void 0) return void 0;
  const t = ersetze(u.daten, roh);
  if (t === void 0) return void 0;
  return gross2 ? t.toLocaleUpperCase("de-DE") : t;
}
function flaeche(el, u, x, y, b, h, fuell, strich) {
  u.blatt.rect(
    x,
    y,
    b,
    h,
    fuell,
    strich,
    zahl(el, "eckradius", 0),
    zahl(el, "linienbreite", 0.6)
  );
}
var text = (el, u) => {
  if (el.drehung) {
    gedreht(el, u, textOhneDrehung);
    return;
  }
  textOhneDrehung(el, u);
};
function gedreht(el, u, zeichner) {
  const anker = { ...el, x: 0, y: -el.h };
  const grad = el.drehung === 270 ? -90 : el.drehung ?? 0;
  const dx = ankerX(el, "links");
  const dy = el.y + el.h;
  const r = grad * Math.PI / 180;
  u.blatt.gruppe(
    null,
    [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), dx, dy],
    (b) => {
      zeichner(anker, { ...u, blatt: b });
    }
  );
}
var textOhneDrehung = (el, u) => {
  const s = stilVon(el, u);
  const t = inhalt(el, u, s.grossbuchstaben);
  if (t === void 0) {
    warne(u, "fehlender_wert", el, `Text entfaellt: "${zeichenkette(el, "inhalt") ?? ""}"`);
    return;
  }
  const text2 = zeichenkette(el, "umbruch") === "saetze" ? t.replace(/([.!?])\s+/g, "$1\n") : t;
  const spalten = Math.max(1, Math.min(3, zahl(el, "spalten", 1)));
  const abstand = zahl(el, "spaltenabstand", 24);
  const spaltenbreite = (el.b - abstand * (spalten - 1)) / spalten;
  const blocksatz = wahr(el, "blocksatz", s.ausrichtung === "block");
  const regeln = satzRegeln(u.vorlage.stil.farben.ableitung, blocksatz);
  regeln.einzug = zahl(el, "einzug", 0);
  regeln.einzugZeilen = zahl(el, "einzug_zeilen", 0);
  const schritt = zahl(el, "zeilenschritt", s.zeilenhoehe);
  if (wahr(el, "einzeilig", false) || spalten === 1 && !t.includes("\n") && u.blatt.sw(t, s.schnitt, s.groesse, s.sperrung) <= el.b) {
    u.blatt.T(
      ankerX(el, s.ausrichtung),
      el.y + el.h,
      t,
      s.schnitt,
      s.groesse,
      s.farbe,
      s.sperrung,
      ankerArt(s.ausrichtung)
    );
    return;
  }
  const maxZeilen = zahl(el, "max_zeilen", 0);
  const hoeheFrei = el.h;
  const v = wahr(el, "verdichten", true) ? verdichten(
    metrik(u, s.schnitt),
    text2,
    spaltenbreite,
    hoeheFrei * spalten,
    s.groesse,
    s.minGroesse,
    schritt / s.groesse,
    regeln
  ) : {
    groesse: s.groesse,
    zeilenhoehe: schritt,
    passt: true,
    zeilen: u.blatt.umbrechen(text2, s.schnitt, s.groesse, spaltenbreite, regeln)
  };
  if (v.groesse < s.groesse - 1e-9) {
    warne(
      u,
      "verdichtet",
      el,
      `Von ${s.groesse} auf ${v.groesse} Punkt verdichtet, damit der Text in den Rahmen passt.`
    );
  }
  if (!v.passt) {
    warne(
      u,
      "gekuerzt",
      el,
      `Der Text passt auch bei ${v.groesse} Punkt nicht in den Rahmen und wird abgeschnitten. Rahmen groesser machen oder Text kuerzen.`
    );
  }
  let zeilen = v.zeilen;
  if (maxZeilen > 0 && zeilen.length > maxZeilen) {
    zeilen = zeilen.slice(0, maxZeilen);
    warne(u, "gekuerzt", el, `Auf ${maxZeilen} Zeilen gekuerzt.`);
  }
  const absatzLuft = zahl(el, "absatzabstand", v.zeilenhoehe * regeln.absatzFaktor);
  const schlitze = [];
  let letzterAbsatz = zeilen.length ? zeilen[0].absatz : 0;
  for (const zeile of zeilen) {
    if (zeile.absatz !== letzterAbsatz) {
      schlitze.push({ luft: absatzLuft });
      letzterAbsatz = zeile.absatz;
    }
    schlitze.push({ zeile, luft: v.zeilenhoehe });
  }
  const proSpalte = zeichenkette(el, "aufteilung") === "fliessend" ? Math.max(1, Math.floor(v.zeilenhoehe > 0 ? el.h / v.zeilenhoehe : schlitze.length)) : Math.ceil(schlitze.length / spalten);
  for (let sp = 0; sp < spalten; sp++) {
    const teil = schlitze.slice(sp * proSpalte, (sp + 1) * proSpalte);
    if (!teil.length) continue;
    const x = el.x + sp * (spaltenbreite + abstand);
    let y = el.y + el.h;
    for (const schlitz of teil) {
      if (schlitz.zeile) {
        setzeZeile(
          u,
          schlitz.zeile,
          x + schlitz.zeile.einzug,
          y,
          spaltenbreite - schlitz.zeile.einzug,
          s,
          v.groesse,
          regeln.blocksatz
        );
      }
      y -= schlitz.luft;
    }
  }
};
function metrik(u, schnitt) {
  return u.blatt.schriften.get(schnitt);
}
function setzeZeile(u, zeile, x, y, breite2, s, groesse, blocksatz) {
  const dehnen = blocksatz && !zeile.letzte && zeile.woerter.length > 1;
  if (!dehnen) {
    const aus = s.ausrichtung ?? "links";
    const anker = aus === "mitte" ? x + breite2 / 2 : aus === "rechts" ? x + breite2 : x;
    u.blatt.T(
      anker,
      y,
      zeile.woerter.join(" "),
      s.schnitt,
      groesse,
      s.farbe,
      s.sperrung,
      ankerArt(aus)
    );
    return;
  }
  const summe = zeile.woerter.reduce(
    (a, w) => a + u.blatt.sw(w, s.schnitt, groesse),
    0
  );
  const lueck = (breite2 - summe) / (zeile.woerter.length - 1);
  let xx = x;
  for (const w of zeile.woerter) {
    u.blatt.T(xx, y, w, s.schnitt, groesse, s.farbe, s.sperrung);
    xx += u.blatt.sw(w, s.schnitt, groesse) + lueck;
  }
}
var form = (el, u) => {
  const art = zeichenkette(el, "form") ?? "rechteck";
  const deckkraft2 = zahl(el, "deckkraft", 1);
  const fuell = farbRef(el, "fuell", u, deckkraft2);
  const strich = farbRef(el, "strich", u, deckkraft2);
  const lb = zahl(el, "linienbreite", 0.6);
  const verlauf2 = el["verlauf"];
  if (verlauf2) {
    const von = farbe(verlauf2.von, u.palette, deckkraft2);
    const nach = farbe(verlauf2.nach, u.palette, deckkraft2);
    const abwaerts = verlauf2.richtung !== "oben";
    u.blatt.gruppe([["rect", el.x, el.y, el.b, el.h]], [1, 0, 0, 1, 0, 0], (b) => {
      b.verlauf(
        el.x,
        abwaerts ? el.y + el.h : el.y,
        el.x,
        abwaerts ? el.y : el.y + el.h,
        [von, nach]
      );
    });
    return;
  }
  switch (art) {
    case "rechteck":
      flaeche(el, u, el.x, el.y, el.b, el.h, fuell, strich);
      return;
    case "linie":
      u.blatt.linie(
        el.x,
        el.y,
        el.x + el.b,
        el.y + el.h,
        strich ?? [0, 0, 0, 1],
        lb,
        el["strichmuster"] ?? null
      );
      return;
    case "kreis":
      u.blatt.kreis(
        el.x + el.b / 2,
        el.y + el.h / 2,
        Math.min(el.b, el.h) / 2,
        fuell,
        strich,
        lb
      );
      return;
    case "ellipse":
      u.blatt.ellipse(el.x, el.y, el.x + el.b, el.y + el.h, fuell, strich);
      return;
    case "dreieck": {
      const spitze = zeichenkette(el, "spitze") ?? "oben";
      const p = spitze === "unten" ? [
        ["moveTo", el.x, el.y + el.h],
        ["lineTo", el.x + el.b, el.y + el.h],
        ["lineTo", el.x + el.b / 2, el.y],
        ["close"]
      ] : [
        ["moveTo", el.x, el.y],
        ["lineTo", el.x + el.b, el.y],
        ["lineTo", el.x + el.b / 2, el.y + el.h],
        ["close"]
      ];
      u.blatt.pfad(p, fuell, strich, lb);
      return;
    }
    case "scrim": {
      const stufen = Math.max(1, zahl(el, "stufen", 60));
      const grund = el["farbe"] ?? "schwarz";
      const staerke = Math.min(zahl(el, "staerke", 0.85), 1) / stufen * 1.6;
      const abwaerts = zeichenkette(el, "richtung") === "unten";
      for (let i = 0; i < stufen; i++) {
        const hh = el.h * (1 - i / stufen);
        u.blatt.rect(
          el.x,
          abwaerts ? el.y + el.h - hh : el.y,
          el.b,
          hh,
          farbe(grund, u.palette, staerke),
          null,
          0
        );
      }
      return;
    }
    case "pfad": {
      const punkte = el["punkte"] ?? [];
      if (punkte.length < 2) {
        warne(u, "unbekannt", el, "Pfad ohne Punkte.");
        return;
      }
      const p = [["moveTo", punkte[0][0], punkte[0][1]]];
      for (const pt of punkte.slice(1)) p.push(["lineTo", pt[0], pt[1]]);
      if (wahr(el, "geschlossen", true)) p.push(["close"]);
      u.blatt.pfad(p, fuell, strich, lb);
      return;
    }
    default:
      warne(u, "unbekannt", el, `Unbekannte Form "${art}".`);
  }
};
var datenfeld = (el, u) => {
  const feldName = zeichenkette(el, "feld");
  if (feldName === void 0) {
    warne(u, "unbekannt", el, "Datenfeld ohne Feld.");
    return;
  }
  const w = wert(u.daten, feldName);
  if (w === void 0) {
    warne(u, "fehlender_wert", el, `${feldName} ist leer — das Feld entfaellt.`);
    return;
  }
  const sw = stilVon(el, u, "stil_wert");
  const label = zeichenkette(el, "label");
  const einheit = zeichenkette(el, "einheit");
  const text2 = einheit ? `${w} ${einheit}` : w;
  if (label !== void 0) {
    const sl = stilVon(el, u, "stil_label");
    const yl = el.y + el.h - zahl(el, "label_versatz", 0);
    u.blatt.T(
      ankerX(el, sl.ausrichtung),
      yl,
      sl.grossbuchstaben ? label.toLocaleUpperCase("de-DE") : label,
      sl.schnitt,
      sl.groesse,
      sl.farbe,
      sl.sperrung,
      ankerArt(sl.ausrichtung)
    );
  }
  const yw = el.y + el.h - zahl(el, "wert_versatz", 0);
  u.blatt.T(
    ankerX(el, sw.ausrichtung),
    yw,
    text2,
    sw.schnitt,
    sw.groesse,
    sw.farbe,
    sw.sperrung,
    ankerArt(sw.ausrichtung)
  );
};
var kennzahl = (el, u) => {
  const variante = zeichenkette(el, "variante") ?? "leiste";
  const gebunden = zeichenkette(el, "feld");
  const eintraege = gebunden ? liste(u.daten, gebunden).map((e) => ({
    label: e.label ?? e.name ?? e.bezeichnung,
    wert: e.betrag !== void 0 ? `${zahlDe(Number(e.betrag), zahl(el, "stellen", 0), true)}` : e.wert,
    einheit: e.einheit ?? zeichenkette(el, "einheit")
  })) : el["eintraege"] ?? [];
  const gefuellt = [];
  for (const e of eintraege) {
    const w = e.feld !== void 0 ? e.format !== void 0 ? formatiere(u.daten[e.feld], e.format, e.stellen) : wert(u.daten, e.feld) : e.wert === void 0 ? void 0 : ersetze(u.daten, e.wert);
    if (w === void 0) {
      warne(u, "fehlender_wert", el, `Kennzahl "${e.label ?? ""}" entfaellt.`);
      continue;
    }
    gefuellt.push({
      label: e.label,
      wert: e.einheit && variante !== "gitter" ? `${w} ${e.einheit}` : w,
      einheit: e.einheit
    });
  }
  if (!gefuellt.length) return;
  const hintergrund = farbRef(el, "hintergrund", u);
  const rahmen = farbRef(el, "rahmen", u);
  if (hintergrund || rahmen) flaeche(el, u, el.x, el.y, el.b, el.h, hintergrund, rahmen);
  const sWert = stilVon(el, u, "stil_wert");
  const sLabel = stilVon(el, u, "stil_label");
  const sLetzt = zeichenkette(el, "stil_wert_letzter") ? u.stil(zeichenkette(el, "stil_wert_letzter")) : sWert;
  const sErst = zeichenkette(el, "stil_wert_erster") ? u.stil(zeichenkette(el, "stil_wert_erster")) : null;
  const polster = zahl(el, "polster", 18);
  const yWert = el.y + zahl(el, "wert_grundlinie", el.h * 0.6);
  const yLabel = el.y + zahl(el, "label_grundlinie", el.h * 0.35);
  if (variante === "einzeln") {
    const e = gefuellt[0];
    u.blatt.T(
      el.x,
      yWert,
      e.wert,
      sWert.schnitt,
      sWert.groesse,
      sWert.farbe,
      sWert.sperrung
    );
    if (e.label) {
      u.blatt.T(
        el.x,
        yLabel,
        sLabel.grossbuchstaben ? e.label.toLocaleUpperCase("de-DE") : e.label,
        sLabel.schnitt,
        sLabel.groesse,
        sLabel.farbe,
        sLabel.sperrung
      );
    }
    return;
  }
  if (variante === "gitter") {
    const spalten2 = Math.max(1, zahl(el, "spalten", 3));
    const zh = zahl(el, "zeilenhoehe", 104);
    const sb2 = el.b / spalten2;
    const einzug = zahl(el, "einzug", 14);
    const sEinheit = zeichenkette(el, "stil_einheit") ? u.stil(zeichenkette(el, "stil_einheit")) : null;
    const trenner2 = farbRef(el, "trenner", u);
    gefuellt.forEach((e, i) => {
      const spalte = i % spalten2;
      const reihe = Math.floor(i / spalten2);
      const x = el.x + spalte * sb2;
      const y = el.y + el.h - reihe * zh;
      if (spalte > 0 && trenner2) {
        u.blatt.linie(
          x,
          y - zh + zahl(el, "trenner_unten", 14),
          x,
          y - zahl(el, "trenner_oben", 6),
          trenner2,
          zahl(el, "trenner_breite", 1)
        );
      }
      const xx = x + (spalte > 0 ? einzug : 0);
      const yWert2 = y - zahl(el, "wert_versatz", 62);
      const breite2 = u.blatt.T(
        xx,
        yWert2,
        e.wert,
        sWert.schnitt,
        sWert.groesse,
        sWert.farbe,
        sWert.sperrung
      );
      if (e.einheit && sEinheit) {
        u.blatt.T(
          xx + breite2 + zahl(el, "einheit_abstand", 4),
          yWert2,
          e.einheit,
          sEinheit.schnitt,
          sEinheit.groesse,
          sEinheit.farbe,
          sEinheit.sperrung
        );
      }
      if (e.label) {
        u.blatt.T(
          xx,
          y - zahl(el, "label_versatz", 82),
          sLabel.grossbuchstaben ? e.label.toLocaleUpperCase("de-DE") : e.label,
          sLabel.schnitt,
          sLabel.groesse,
          sLabel.farbe,
          sLabel.sperrung
        );
      }
    });
    return;
  }
  if (variante === "kacheln") {
    const spalten2 = Math.max(1, zahl(el, "spalten", 2));
    const abstand = zahl(el, "abstand", 10);
    const kb = (el.b - abstand * (spalten2 - 1)) / spalten2;
    const kh = zahl(el, "kachel_hoehe", 64);
    const kFuell = farbRef(el, "kachel_fuell", u);
    const kStrich = farbRef(el, "kachel_strich", u);
    gefuellt.forEach((e, i) => {
      const sp = i % spalten2;
      const reihe = Math.floor(i / spalten2);
      const x = el.x + sp * (kb + abstand);
      const unten = el.y + el.h - reihe * (kh + abstand) - kh;
      const ersteFuell = i === 0 ? farbRef(el, "kachel_fuell_erster", u) : null;
      const sErstWert = i === 0 && zeichenkette(el, "stil_wert_erster") ? u.stil(zeichenkette(el, "stil_wert_erster")) : sWert;
      const sErstLabel = i === 0 && zeichenkette(el, "stil_label_erster") ? u.stil(zeichenkette(el, "stil_label_erster")) : sLabel;
      if (ersteFuell || kFuell || kStrich) {
        u.blatt.rect(
          x,
          unten,
          kb,
          kh,
          ersteFuell ?? kFuell,
          kStrich,
          zahl(el, "eckradius", 8),
          zahl(el, "linienbreite", 0.8)
        );
      }
      if (e.label) {
        u.blatt.T(
          x + polster,
          unten + zahl(el, "label_grundlinie", 38),
          sErstLabel.grossbuchstaben ? e.label.toLocaleUpperCase("de-DE") : e.label,
          sErstLabel.schnitt,
          sErstLabel.groesse,
          sErstLabel.farbe,
          sErstLabel.sperrung
        );
      }
      u.blatt.T(
        x + polster,
        unten + zahl(el, "wert_grundlinie", 18),
        e.wert,
        sErstWert.schnitt,
        sErstWert.groesse,
        sErstWert.farbe,
        sErstWert.sperrung
      );
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
      u.blatt.linie(
        el.x + i * sb,
        el.y + trennerUnten,
        el.x + i * sb,
        el.y + el.h - trennerOben,
        trenner,
        trennerBreite
      );
    }
    const s = i === 0 && sErst ? sErst : i === gefuellt.length - 1 ? sLetzt : sWert;
    u.blatt.T(x, yWert, e.wert, s.schnitt, s.groesse, s.farbe, s.sperrung);
    if (e.label) {
      u.blatt.T(
        x,
        yLabel,
        sLabel.grossbuchstaben ? e.label.toLocaleUpperCase("de-DE") : e.label,
        sLabel.schnitt,
        sLabel.groesse,
        sLabel.farbe,
        sLabel.sperrung
      );
    }
  });
};
var faktentabelle = (el, u) => {
  const gebunden = zeichenkette(el, "feld");
  const vorgaben = gebunden ? liste(u.daten, gebunden).filter((z) => z && z.label !== void 0).map((z) => ({ label: z.label, wert: z.wert })) : el["zeilen"] ?? [];
  const zeilen = [];
  for (const z of vorgaben) {
    const roh = z.feld !== void 0 ? wert(u.daten, z.feld) : z.wert !== void 0 ? ersetze(u.daten, z.wert) : void 0;
    if (roh === void 0) continue;
    const label = z.label.includes("{{") ? ersetze(u.daten, z.label) : z.label;
    if (label === void 0) continue;
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
  if (art === "gestapelt") {
    let y = el.y + el.h;
    for (const z of zeilen) {
      u.blatt.T(
        el.x,
        y - zahl(el, "label_versatz", 0),
        gross(sLabel, z.label),
        sLabel.schnitt,
        sLabel.groesse,
        sLabel.farbe,
        sLabel.sperrung
      );
      u.blatt.T(
        el.x,
        y - zahl(el, "wert_versatz", 14),
        z.wert,
        sWert.schnitt,
        sWert.groesse,
        sWert.farbe,
        sWert.sperrung
      );
      y -= zh;
    }
    return;
  }
  const spalten = Math.max(1, zahl(el, "spalten", 1));
  const spaltenabstand = zahl(el, "spaltenabstand", 24);
  const sb = (el.b - spaltenabstand * (spalten - 1)) / spalten;
  const jeSpalte = Math.ceil(zeilen.length / spalten);
  const zeilenhoehe = spalten > 1 ? zahl(el, "zeilenhoehe", 25) : zh;
  const zeilenweise = zeichenkette(el, "fuellung") === "zeilenweise";
  zeilen.forEach((z, i) => {
    const spalte = spalten > 1 ? zeilenweise ? i % spalten : Math.floor(i / jeSpalte) : 0;
    const reihe = spalten > 1 ? zeilenweise ? Math.floor(i / spalten) : i % jeSpalte : i;
    const x = el.x + spalte * (sb + spaltenabstand);
    const y = el.y + el.h - reihe * zeilenhoehe;
    if (art === "zebra" && reihe % 2 === 0 && flaecheFarbe) {
      u.blatt.rect(
        x,
        y - zeilenhoehe,
        sb,
        zeilenhoehe,
        flaecheFarbe,
        null,
        zahl(el, "eckradius", 0)
      );
    }
    const grundlinie = spalten > 1 ? y : y - zeilenhoehe / 2 - versatz;
    u.blatt.T(
      x + polster,
      grundlinie,
      gross(sLabel, z.label),
      sLabel.schnitt,
      sLabel.groesse,
      sLabel.farbe,
      sLabel.sperrung
    );
    u.blatt.T(
      x + sb - polster,
      grundlinie - zahl(el, "wert_tiefer", 0),
      z.wert,
      sWert.schnitt,
      sWert.groesse,
      sWert.farbe,
      sWert.sperrung,
      "r"
    );
    if (linie && (art === "linie" || art === "punktlinie")) {
      const ly = spalten > 1 ? y - zahl(el, "linien_versatz", 9) : y - zeilenhoehe;
      u.blatt.linie(
        x,
        ly,
        x + sb,
        ly,
        linie,
        zahl(el, "linienbreite", 0.5),
        art === "punktlinie" ? [0.6, 2.6] : null
      );
    } else if (linie && art === "fuehrungspunkte") {
      const lb = u.blatt.sw(
        gross(sLabel, z.label),
        sLabel.schnitt,
        sLabel.groesse,
        sLabel.sperrung
      );
      const wb = u.blatt.sw(z.wert, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const luft = zahl(el, "punkt_luft", 8);
      const von = x + polster + lb + luft;
      const bis = x + sb - polster - wb - luft;
      if (bis > von) {
        u.blatt.linie(
          von,
          grundlinie + zahl(el, "punkt_hoch", 1),
          bis,
          grundlinie + zahl(el, "punkt_hoch", 1),
          linie,
          zahl(el, "linienbreite", 0.6),
          [0.6, 2.6]
        );
      }
    }
  });
};
var raumliste = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.raumaufteilung";
  const roh = liste(u.daten, quelle);
  const ebene = zeichenkette(el, "ebene");
  const raeume = roh.filter((r) => r && r.name && (ebene === void 0 || r.ebene === ebene));
  if (!raeume.length) {
    warne(u, "fehlender_wert", el, "Keine Raeume erfasst — die Liste entfaellt.");
    return;
  }
  const sName = stilVon(el, u, "stil_name");
  const sFlaeche = stilVon(el, u, "stil_flaeche");
  const sSumme = zeichenkette(el, "stil_summe") ? u.stil(zeichenkette(el, "stil_summe")) : sFlaeche;
  const zh = zahl(el, "zeilenhoehe", 19);
  const linie = farbRef(el, "linien_farbe", u);
  const einheit = zeichenkette(el, "einheit") ?? "m²";
  let y = el.y + el.h;
  let summe = 0;
  for (const r of raeume) {
    const f = Number(String(r.flaeche ?? "").replace(",", "."));
    const text2 = Number.isFinite(f) ? `${zahlDe(f, 1)} ${einheit}` : void 0;
    u.blatt.T(
      el.x,
      y,
      String(r.name),
      sName.schnitt,
      sName.groesse,
      sName.farbe,
      sName.sperrung
    );
    if (text2 !== void 0) {
      u.blatt.T(
        el.x + el.b,
        y,
        text2,
        sFlaeche.schnitt,
        sFlaeche.groesse,
        sFlaeche.farbe,
        sFlaeche.sperrung,
        "r"
      );
      summe += f;
    }
    if (linie && zeichenkette(el, "darstellung") === "fuehrungspunkte") {
      const nb = u.blatt.sw(String(r.name), sName.schnitt, sName.groesse, sName.sperrung);
      const wb = text2 === void 0 ? 0 : u.blatt.sw(text2, sFlaeche.schnitt, sFlaeche.groesse, sFlaeche.sperrung);
      const luft = zahl(el, "punkt_luft", 8);
      const von = el.x + nb + luft;
      const bis = el.x + el.b - wb - luft;
      if (bis > von) {
        u.blatt.linie(
          von,
          y + zahl(el, "punkt_hoch", 2),
          bis,
          y + zahl(el, "punkt_hoch", 2),
          linie,
          zahl(el, "linienbreite", 0.6),
          [0.6, 2.6]
        );
      }
    } else if (linie) {
      u.blatt.linie(
        el.x,
        y - zahl(el, "linien_versatz", 6),
        el.x + el.b,
        y - zahl(el, "linien_versatz", 6),
        linie,
        zahl(el, "linienbreite", 0.5)
      );
    }
    y -= zh;
  }
  if (wahr(el, "mit_summe", true) && summe > 0) {
    const balken = farbRef(el, "summe_flaeche", u);
    const sSummeWert = zeichenkette(el, "stil_summe_wert") ? u.stil(zeichenkette(el, "stil_summe_wert")) : sSumme;
    if (balken) {
      const bh = zahl(el, "summe_hoehe", 26);
      const by = y - zahl(el, "summe_versatz", 14);
      u.blatt.rect(el.x, by, el.b, bh, balken, null, zahl(el, "summe_radius", 0));
      const polster = zahl(el, "summe_polster", 10);
      const ys2 = by + zahl(el, "summe_grundlinie", 9);
      u.blatt.T(
        el.x + polster,
        ys2,
        gross(sSumme, zeichenkette(el, "summe_label") ?? "Summe"),
        sSumme.schnitt,
        sSumme.groesse,
        sSumme.farbe,
        sSumme.sperrung
      );
      u.blatt.T(
        el.x + el.b - polster,
        ys2,
        `${zahlDe(summe, 1)} ${einheit}`,
        sSummeWert.schnitt,
        sSummeWert.groesse,
        sSummeWert.farbe,
        sSummeWert.sperrung,
        "r"
      );
      return;
    }
    const ys = y - zahl(el, "summe_versatz", 2);
    u.blatt.T(
      el.x,
      ys,
      gross(sSumme, zeichenkette(el, "summe_label") ?? "Summe"),
      sSumme.schnitt,
      sSumme.groesse,
      sSumme.farbe,
      sSumme.sperrung
    );
    u.blatt.T(
      el.x + el.b,
      ys,
      `${zahlDe(summe, 1)} ${einheit}`,
      sSummeWert.schnitt,
      sSummeWert.groesse,
      sSummeWert.farbe,
      sSummeWert.sperrung,
      "r"
    );
  }
};
var distanzen = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.lage_distanzen";
  const roh = liste(u.daten, quelle);
  const eintraege = [];
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
  if (art === "wege") {
    const spalten = el["spalten_x"] ?? [-98, -52, -6];
    const kopf = el["spaltenkopf"] ?? [];
    const sKopf = zeichenkette(el, "stil_kopf") ? u.stil(zeichenkette(el, "stil_kopf")) : null;
    const sErste = zeichenkette(el, "stil_wert_erster") ? u.stil(zeichenkette(el, "stil_wert_erster")) : sWert;
    const linieWege = farbRef(el, "linien_farbe", u);
    const zhWege = zahl(el, "zeilenhoehe", 23);
    let yy = el.y + el.h;
    if (sKopf && kopf.length) {
      kopf.forEach((k, i) => {
        u.blatt.T(
          el.x + el.b + spalten[i],
          yy,
          k.toLocaleUpperCase("de-DE"),
          sKopf.schnitt,
          sKopf.groesse,
          sKopf.farbe,
          sKopf.sperrung,
          "r"
        );
      });
      yy -= zahl(el, "kopf_abstand", 24);
    }
    const kopflinie = farbRef(el, "kopflinie_farbe", u);
    if (kopflinie) {
      u.blatt.linie(
        el.x,
        yy + zahl(el, "kopflinie_versatz", 6),
        el.x + el.b,
        yy + zahl(el, "kopflinie_versatz", 6),
        kopflinie,
        zahl(el, "kopflinie_breite", 1.2)
      );
      yy -= zahl(el, "nach_kopflinie", 18);
    }
    const felder = el["felder"] ?? ["fuss", "rad", "auto"];
    for (const d of roh) {
      const name = d.ziel ?? d.name;
      if (!name) continue;
      u.blatt.T(
        el.x,
        yy,
        name,
        sName.schnitt,
        sName.groesse,
        sName.farbe,
        sName.sperrung
      );
      felder.forEach((f, i) => {
        const v = d[f];
        if (v === void 0 || v === null) return;
        const st = i === 0 ? sErste : sWert;
        u.blatt.T(
          el.x + el.b + spalten[i],
          yy,
          String(v),
          st.schnitt,
          st.groesse,
          st.farbe,
          st.sperrung,
          "r"
        );
      });
      if (linieWege) {
        u.blatt.linie(
          el.x,
          yy - zahl(el, "linien_versatz", 8),
          el.x + el.b,
          yy - zahl(el, "linien_versatz", 8),
          linieWege,
          zahl(el, "linienbreite", 0.8)
        );
      }
      yy -= zhWege;
    }
    return;
  }
  let y = el.y + el.h;
  for (const d of eintraege) {
    u.blatt.T(
      el.x,
      y,
      d.name,
      sName.schnitt,
      sName.groesse,
      sName.farbe,
      sName.sperrung
    );
    const text2 = d.wert !== void 0 ? d.wert : d.km !== void 0 ? `${zahlDe(d.km, 1)} km` : d.minuten !== void 0 ? `${zahlDe(d.minuten, 0)} min` : void 0;
    if (text2 !== void 0) {
      u.blatt.T(
        el.x + el.b,
        y,
        text2,
        sWert.schnitt,
        sWert.groesse,
        sWert.farbe,
        sWert.sperrung,
        "r"
      );
    }
    if (art === "balken" && d.km !== void 0 && spur && balken) {
      const r = zahl(el, "balken_radius", balkenHoehe / 2);
      u.blatt.rect(el.x, y - balkenVersatz, el.b, balkenHoehe, spur, null, r);
      u.blatt.rect(
        el.x,
        y - balkenVersatz,
        Math.max(el.b * d.km / groesste, zahl(el, "balken_min", 4)),
        balkenHoehe,
        balken,
        null,
        r
      );
    } else if (art === "punktlinie" && grund) {
      u.blatt.linie(
        el.x,
        y - balkenVersatz,
        el.x + el.b,
        y - balkenVersatz,
        grund,
        0.6,
        [0.6, 2.6]
      );
    } else if (art === "fuehrungspunkte" && grund) {
      const nb = u.blatt.sw(d.name, sName.schnitt, sName.groesse, sName.sperrung);
      const wb = text2 === void 0 ? 0 : u.blatt.sw(text2, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const luft = zahl(el, "punkt_luft", 8);
      const von = el.x + nb + luft;
      const bis = el.x + el.b - wb - luft;
      if (bis > von) {
        u.blatt.linie(
          von,
          y + zahl(el, "punkt_hoch", 2),
          bis,
          y + zahl(el, "punkt_hoch", 2),
          grund,
          zahl(el, "linienbreite", 0.6),
          [0.6, 2.6]
        );
      }
    }
    y -= zh;
  }
};
var highlights = (el, u) => {
  const quelle = zeichenkette(el, "feld") ?? "objekt.expose_highlights";
  const roh = el["eintraege"] ?? liste(u.daten, quelle);
  const eintraege = [];
  for (const h of roh) {
    if (typeof h === "string") {
      if (h.trim()) eintraege.push({ titel: h });
      continue;
    }
    const o = h;
    if (o.titel) eintraege.push({ titel: o.titel, text: o.text });
  }
  if (!eintraege.length) {
    warne(u, "fehlender_wert", el, "Keine Highlights erfasst — das Element entfaellt.");
    return;
  }
  const sNummer = zeichenkette(el, "stil_nummer") ? u.stil(zeichenkette(el, "stil_nummer")) : void 0;
  const sTitel = stilVon(el, u, "stil_titel");
  const sText = zeichenkette(el, "stil_text") ? u.stil(zeichenkette(el, "stil_text")) : void 0;
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
        u.blatt.rect(
          x,
          el.y,
          kb,
          el.h,
          fuell,
          rahmen,
          zahl(el, "eckradius", 10),
          zahl(el, "linienbreite", 0.8)
        );
      }
      let y2 = el.y + el.h - zahl(el, "nummer_versatz", 30);
      if (sNummer) {
        const kreis = farbRef(el, "nummer_kreis", u);
        if (kreis) {
          const r = zahl(el, "nummer_radius", 12);
          const cx = x + zahl(el, "nummer_kreis_x", 26);
          const cy = el.y + el.h - zahl(el, "nummer_kreis_y", 26);
          u.blatt.kreis(cx, cy, r, kreis);
          u.blatt.T(
            cx,
            y2,
            String(i + 1),
            sNummer.schnitt,
            sNummer.groesse,
            sNummer.farbe,
            sNummer.sperrung,
            "c"
          );
        } else {
          u.blatt.T(
            x + polster,
            y2,
            String(i + 1).padStart(2, "0"),
            sNummer.schnitt,
            sNummer.groesse,
            sNummer.farbe,
            sNummer.sperrung
          );
        }
      }
      y2 = el.y + el.h - zahl(el, "titel_versatz", 52);
      u.blatt.T(
        x + polster,
        y2,
        h.titel,
        sTitel.schnitt,
        sTitel.groesse,
        sTitel.farbe,
        sTitel.sperrung
      );
      if (h.text && sText) {
        u.blatt.absatz(
          x + polster,
          y2 - zahl(el, "text_versatz", 14),
          h.text,
          kb - 2 * polster,
          sText.schnitt,
          sText.groesse,
          sText.zeilenhoehe,
          sText.farbe,
          regeln
        );
      }
    });
    return;
  }
  const fliessend = art === "nummern_fliessend";
  const zh = zahl(el, "zeilenhoehe", 24);
  const einzug = zahl(el, "einzug", 24);
  const regelnText = satzRegeln(u.vorlage.stil.farben.ableitung, false);
  let y = el.y + el.h;
  eintraege.forEach((h, i) => {
    if (sNummer) {
      const nummer = fliessend ? String(i + 1) : String(i + 1).padStart(2, "0");
      u.blatt.T(
        el.x,
        y,
        nummer,
        sNummer.schnitt,
        sNummer.groesse,
        sNummer.farbe,
        sNummer.sperrung
      );
    }
    if (fliessend) {
      const unten = u.blatt.absatz(
        el.x + einzug,
        y + zahl(el, "text_hoch", 14),
        h.titel,
        el.b - zahl(el, "textbreite_abzug", 56),
        sTitel.schnitt,
        sTitel.groesse,
        sTitel.zeilenhoehe,
        sTitel.farbe,
        regelnText
      );
      y = Math.min(
        y - zahl(el, "mindestabstand", 50),
        unten - zahl(el, "nachabstand", 26)
      );
      return;
    }
    u.blatt.T(
      el.x + einzug,
      y,
      h.titel,
      sTitel.schnitt,
      sTitel.groesse,
      sTitel.farbe,
      sTitel.sperrung
    );
    y -= zh;
  });
};
var ausstattung = (el, u) => {
  const art0 = zeichenkette(el, "darstellung") ?? "checkliste";
  const quelle = zeichenkette(el, "feld") ?? (art0 === "gruppen" ? "objekt.expose_ausstattung_gruppen" : "objekt.beschreibung_ausstattung_expose");
  const roh = art0 === "gruppen" ? void 0 : wert(u.daten, quelle);
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
  if (art === "gruppen") {
    const gruppen = liste(u.daten, zeichenkette(el, "feld") ?? "objekt.expose_ausstattung_gruppen").filter((g) => g && g.titel && Array.isArray(g.punkte) && g.punkte.length);
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
      u.blatt.T(
        x,
        y - zahl(el, "nummer_hoch", 0),
        String(i + 1).padStart(2, "0"),
        sNummer.schnitt,
        sNummer.groesse,
        sNummer.farbe,
        sNummer.sperrung
      );
      u.blatt.T(
        x + einzug,
        y + zahl(el, "titel_hoch", 4),
        gross(sTitel, g.titel),
        sTitel.schnitt,
        sTitel.groesse,
        sTitel.farbe,
        sTitel.sperrung
      );
      if (titelLinie) {
        u.blatt.linie(
          x,
          y - zahl(el, "titel_linie_tief", 14),
          x + sb,
          y - zahl(el, "titel_linie_tief", 14),
          titelLinie,
          zahl(el, "titel_linienbreite", 0.6)
        );
      }
      let iy = y - zahl(el, "erste_zeile", 40);
      for (const punkt of g.punkte) {
        u.blatt.T(x, iy, punkt, s.schnitt, s.groesse, s.farbe, s.sperrung);
        if (zeilenLinie) {
          u.blatt.linie(
            x,
            iy - zahl(el, "zeilen_linie_tief", 12),
            x + sb,
            iy - zahl(el, "zeilen_linie_tief", 12),
            zeilenLinie,
            zahl(el, "linienbreite", 0.4)
          );
        }
        iy -= zh;
      }
    });
    return;
  }
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
      u.blatt.T(
        x,
        y - zahl(el, "nummer_versatz", 22),
        String(i + 1).padStart(2, "0"),
        sNummer.schnitt,
        sNummer.groesse,
        sNummer.farbe,
        sNummer.sperrung
      );
      u.blatt.T(
        x + einzug,
        y - zahl(el, "text_versatz", 18),
        p,
        s.schnitt,
        s.groesse,
        s.farbe,
        s.sperrung
      );
      const letzte = reihe === jeSpalte - 1;
      const strich = letzte ? schluss : linie;
      if (strich) {
        u.blatt.linie(
          x,
          y - zahl(el, "linien_versatz", 32),
          x + sb,
          y - zahl(el, "linien_versatz", 32),
          strich,
          letzte ? zahl(el, "schluss_breite", 1.2) : zahl(el, "linienbreite", 0.8)
        );
      }
    });
    return;
  }
  punkte.forEach((p, i) => {
    const sp = i % spalten;
    const reihe = Math.floor(i / spalten);
    const x = el.x + sp * (sb + abstand);
    const y = el.y + el.h - reihe * zh;
    if (fuell) {
      u.blatt.rect(
        x,
        y - zahl(el, "kachel_versatz", 10),
        sb,
        zahl(el, "kachel_hoehe", zh - 6),
        fuell,
        null,
        zahl(el, "eckradius", 6)
      );
    }
    if (art === "checkliste" && haken) {
      hakenZeichnen(
        u,
        x + polster,
        y - zahl(el, "haken_versatz", 2),
        haken,
        hakenInnen,
        zahl(el, "haken_groesse", 9)
      );
    }
    u.blatt.T(
      x + einzug,
      y - zahl(el, "text_versatz", -0.5),
      p,
      s.schnitt,
      s.groesse,
      s.farbe,
      s.sperrung
    );
  });
};
function hakenZeichnen(u, x, y, aussen, innen, groesse) {
  const g = groesse;
  u.blatt.rect(x, y, g, g, aussen, null, g * 0.278);
  u.blatt.pfad(
    [
      ["moveTo", x + g * 0.2444, y + g * 0.5111],
      ["lineTo", x + g * 0.4333, y + g * 0.3111],
      ["lineTo", x + g * 0.7667, y + g * 0.7111]
    ],
    null,
    innen,
    g * 0.1333
  );
}
var bild = (el, u) => {
  const slot = el["slot"];
  const schluessel = bildSchluessel(slot);
  const quelle = schluessel ? wert(u.daten, schluessel) : void 0;
  const radius = zahl(el, "eckradius", 0);
  const maske = radius ? [["roundRect", el.x, el.y, el.b, el.h, radius]] : [["rect", el.x, el.y, el.b, el.h]];
  const zweck = `bild:${slot?.art ?? "?"}`;
  if (quelle !== void 0) {
    u.blatt.gruppe(maske, [1, 0, 0, 1, 0, 0], (b) => {
      b.bild(
        el.x,
        el.y,
        el.b,
        el.h,
        quelle,
        zeichenkette(el, "fuellmodus") ?? "cover"
      );
    }, zweck);
  } else {
    warne(
      u,
      "fehlendes_bild",
      el,
      `Kein Bild fuer ${slot?.art ?? "diesen Slot"} — Platzhalter gesetzt.`
    );
    const fuell = farbRef(el, "platzhalter_farbe", u) ?? farbe({ palette: "surf" }, u.palette);
    u.blatt.gruppe(maske, [1, 0, 0, 1, 0, 0], (b) => {
      b.rect(el.x, el.y, el.b, el.h, fuell, null, radius);
    }, zweck);
  }
  const label = inhalt(el, u, false, "label");
  if (label !== void 0 && zeichenkette(el, "stil_label")) {
    const s = u.stil(zeichenkette(el, "stil_label"));
    const t = s.grossbuchstaben ? label.toLocaleUpperCase("de-DE") : label;
    const lb = u.blatt.sw(t, s.schnitt, s.groesse, s.sperrung) + zahl(el, "label_luft", 18);
    const lx = el.x + zahl(el, "label_x", 10);
    const ly = el.y + zahl(el, "label_y", 10);
    const fuell = farbRef(el, "label_hintergrund", u, zahl(el, "label_deckkraft", 0.82));
    if (fuell) {
      u.blatt.rect(
        lx,
        ly,
        lb,
        zahl(el, "label_hoehe", 15),
        fuell,
        null,
        zahl(el, "label_radius", 7.5)
      );
    }
    u.blatt.T(
      lx + zahl(el, "label_polster", 9),
      ly + zahl(el, "label_grundlinie", 5.2),
      t,
      s.schnitt,
      s.groesse,
      s.farbe,
      s.sperrung
    );
  }
};
function bildSchluessel(slot) {
  if (!slot?.art) return void 0;
  switch (slot.art) {
    case "titelbild":
      return "objekt.hauptbild_url";
    case "foto":
      return `bild.foto.${slot.nr ?? 1}`;
    case "grundriss":
      return `bild.grundriss.${slot.nr ?? 1}`;
    case "lageplan":
      return "bild.lageplan";
    case "ansprechpartner":
      return "ansprechpartner.foto";
    case "logo":
      return "firma.logo";
    case "asset":
      return "bild.asset";
    default:
      return void 0;
  }
}
var energieskala = (el, u) => {
  const klassen = el["klassen"] ?? [];
  if (!klassen.length) {
    warne(u, "unbekannt", el, "Die Skala nennt keine Klassen.");
    return;
  }
  if (zeichenkette(el, "darstellung") === "stufen") {
    const sKlasse2 = stilVon(el, u, "stil_klasse");
    const sAktiv = zeichenkette(el, "stil_klasse_aktiv") ? u.stil(zeichenkette(el, "stil_klasse_aktiv")) : sKlasse2;
    const eigene = (u.daten[zeichenkette(el, "feld") ?? "objekt.energie_klasse"] ?? "").toString().trim().toLocaleUpperCase("de-DE");
    const bw2 = el.b / klassen.length;
    const luecke = zahl(el, "luecke", 3);
    klassen.forEach((k, i) => {
      const aktiv = k.name.toLocaleUpperCase("de-DE") === eigene;
      const x = el.x + i * bw2;
      u.blatt.rect(
        x,
        el.y,
        bw2 - luecke,
        el.h,
        farbe(
          aktiv ? zeichenkette(el, "aktiv_farbe") ?? k.farbe : k.farbe,
          u.palette
        ),
        null,
        zahl(el, "eckradius", 0)
      );
      const st = aktiv ? sAktiv : sKlasse2;
      const hell = el["helle_klassen"] ?? [];
      const stil = !aktiv && hell.includes(k.name) && zeichenkette(el, "stil_klasse_hell") ? u.stil(zeichenkette(el, "stil_klasse_hell")) : st;
      u.blatt.T(
        x + (bw2 - luecke) / 2,
        el.y + zahl(el, "klasse_grundlinie", 8),
        k.name,
        stil.schnitt,
        stil.groesse,
        stil.farbe,
        stil.sperrung,
        "c"
      );
    });
    return;
  }
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
    u.blatt.rect(
      x + luft,
      yBalken,
      bw - 2 * luft,
      bh,
      farbe(k.farbe, u.palette),
      null,
      zahl(el, "eckradius", schmal ? 0 : 4)
    );
    if (schmal) {
      const erste = i === 0 && zeichenkette(el, "stil_klasse_erste") ? u.stil(zeichenkette(el, "stil_klasse_erste")) : sKlasse;
      u.blatt.T(
        x + bw / 2,
        yBalken - zahl(el, "klasse_abstand", 14),
        k.name,
        erste.schnitt,
        erste.groesse,
        erste.farbe,
        erste.sperrung,
        "c"
      );
      return;
    }
    u.blatt.T(
      x + bw / 2,
      yBalken + zahl(el, "klasse_grundlinie", 12),
      k.name,
      sKlasse.schnitt,
      sKlasse.groesse,
      sKlasse.farbe,
      sKlasse.sperrung,
      "c"
    );
    const untergrenze = i === 0 ? 0 : klassen[i - 1].grenze;
    u.blatt.T(
      x + bw / 2,
      yBalken - zahl(el, "grenze_abstand", 12),
      zahlDe(untergrenze, 0),
      sGrenze.schnitt,
      sGrenze.groesse,
      sGrenze.farbe,
      sGrenze.sperrung,
      "c"
    );
  });
  const einheit = schmal ? void 0 : zeichenkette(el, "einheit");
  if (einheit) {
    u.blatt.T(
      el.x + el.b,
      yBalken - zahl(el, "grenze_abstand", 12),
      einheit,
      sGrenze.schnitt,
      sGrenze.groesse,
      sGrenze.farbe,
      sGrenze.sperrung,
      "r"
    );
  }
  if (kennwertRoh === void 0) {
    warne(
      u,
      "fehlender_wert",
      el,
      "Kein Energiekennwert — die Skala steht ohne Markierung."
    );
    return;
  }
  let marke = el.x;
  let vorige = 0;
  for (let i = 0; i < klassen.length; i++) {
    const g = klassen[i].grenze;
    if (kennwertRoh <= g) {
      marke = el.x + i * bw + bw * (kennwertRoh - vorige) / (g - vorige);
      break;
    }
    vorige = g;
    if (i === klassen.length - 1) marke = el.x + el.b;
  }
  const tinte = farbRef(el, "marke_farbe", u) ?? [0, 0, 0, 1];
  const spitze = zahl(el, "marke_spitze", 4);
  const hoehe2 = zahl(el, "marke_hoehe", 10);
  const halb = zahl(el, "marke_breite", 6);
  u.blatt.pfad(
    [
      ["moveTo", marke, yBalken + bh + spitze],
      ["lineTo", marke - halb, yBalken + bh + spitze + hoehe2],
      ["lineTo", marke + halb, yBalken + bh + spitze + hoehe2],
      ["close"]
    ],
    tinte
  );
  if (schmal) return;
  const fb = zahl(el, "fahne_breite", 104);
  const fh = zahl(el, "fahne_hoehe", 26);
  const fy = yBalken + bh + zahl(el, "fahne_abstand", 18);
  u.blatt.rect(marke - fb / 2, fy, fb, fh, tinte, null, zahl(el, "fahne_radius", 6));
  const sFahne = stilVon(el, u, "stil_fahne");
  const text2 = zeichenkette(el, "fahne_text") ?? "{{objekt.energie_kennwert}}";
  const beschriftung = ersetze(u.daten, text2);
  if (beschriftung !== void 0) {
    u.blatt.T(
      marke,
      fy + zahl(el, "fahne_grundlinie", 9),
      beschriftung,
      sFahne.schnitt,
      sFahne.groesse,
      sFahne.farbe,
      sFahne.sperrung,
      "c"
    );
  }
};
function rohzahl(daten, schluessel) {
  const v = daten[schluessel];
  if (v === null || v === void 0 || v === "") return void 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : void 0;
}
var kostenrechnung = (el, u) => {
  const vorgaben = el["posten"];
  const posten = [];
  if (vorgaben) {
    for (const v of vorgaben) {
      const betrag = Number(u.daten[v.feld]);
      if (!Number.isFinite(betrag)) continue;
      const label = ersetze(u.daten, v.label);
      if (label === void 0) continue;
      posten.push({ name: label, betrag });
    }
  } else {
    for (const p of liste(u.daten, zeichenkette(el, "feld") ?? "rechnung.posten")) {
      if (!p || typeof p.name !== "string" || !Number.isFinite(Number(p.betrag))) continue;
      posten.push({ name: p.name, betrag: Number(p.betrag) });
    }
  }
  if (!posten.length) {
    warne(u, "fehlender_wert", el, "Keine Kostenposten — das Element entfaellt.");
    return;
  }
  const summe = posten.reduce((a, p) => a + Number(p.betrag), 0);
  const farbliste = el["farben"] ?? [];
  const braucht = zahl(el, "balken_hoehe", 16) > 0 || zahl(el, "punkt_groesse", 8) > 0;
  if (braucht && !farbliste.length) {
    warne(
      u,
      "unbekannt",
      el,
      "Balken oder Punkte sollen gezeichnet werden, aber die Vorlage nennt keine Farben."
    );
  }
  const farben = farbliste.length ? farbliste.map((f) => farbe(f, u.palette)) : [farbe({ palette: "schwarz" }, u.palette)];
  const bh = zahl(el, "balken_hoehe", 16);
  const yBalken = el.y + el.h - bh;
  if (bh > 0) {
    let x = el.x;
    posten.forEach((p, i) => {
      const b = el.b * Number(p.betrag) / summe;
      u.blatt.rect(
        x,
        yBalken,
        b,
        bh,
        farben[i % farben.length],
        null,
        zahl(el, "balken_radius", 0)
      );
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
      u.blatt.rect(
        el.x,
        y - zahl(el, "punkt_versatz", 1),
        punktGroesse,
        punktGroesse,
        farben[i % farben.length],
        null,
        zahl(el, "punkt_radius", 2)
      );
    }
    u.blatt.T(
      el.x + zahl(el, "einzug", 16),
      y,
      p.name,
      sName.schnitt,
      sName.groesse,
      sName.farbe,
      sName.sperrung
    );
    u.blatt.T(
      el.x + spalte,
      y,
      `${zahlDe(Number(p.betrag), 0)} €`,
      sWert.schnitt,
      sWert.groesse,
      sWert.farbe,
      sWert.sperrung,
      "r"
    );
    if (linie && zeichenkette(el, "darstellung") === "fuehrungspunkte") {
      const nb = u.blatt.sw(p.name, sName.schnitt, sName.groesse, sName.sperrung);
      const betrag = `${zahlDe(Number(p.betrag), 0)} €`;
      const wb = u.blatt.sw(betrag, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const luft = zahl(el, "punkt_luft", 10);
      const von = el.x + zahl(el, "einzug", 16) + nb + luft;
      const bis = el.x + spalte - wb - luft;
      if (bis > von) {
        u.blatt.linie(
          von,
          y + zahl(el, "punkt_hoch", 3),
          bis,
          y + zahl(el, "punkt_hoch", 3),
          linie,
          zahl(el, "linienbreite", 0.6),
          [0.6, 2.6]
        );
      }
    } else if (linie) {
      u.blatt.linie(
        el.x,
        y - zahl(el, "linien_versatz", 9),
        el.x + spalte,
        y - zahl(el, "linien_versatz", 9),
        linie,
        zahl(el, "linienbreite", 0.5)
      );
    }
    y -= zh;
  });
  if (wahr(el, "mit_summe", true)) {
    const sSumme = stilVon(el, u, "stil_summe");
    const sSummeWert = zeichenkette(el, "stil_summe_wert") ? u.stil(zeichenkette(el, "stil_summe_wert")) : sSumme;
    const flaeche2 = farbRef(el, "summe_flaeche", u);
    if (flaeche2) {
      const sh = zahl(el, "summe_hoehe", 40);
      const sy = y - zahl(el, "summe_versatz", 30);
      const polster = zahl(el, "summe_polster", 12);
      u.blatt.rect(el.x, sy, el.b, sh, flaeche2, null, zahl(el, "summe_radius", 0));
      u.blatt.T(
        el.x + polster,
        y - zahl(el, "summe_label_versatz", 14),
        gross(sSumme, zeichenkette(el, "summe_label") ?? "Gesamtaufwand"),
        sSumme.schnitt,
        sSumme.groesse,
        sSumme.farbe,
        sSumme.sperrung
      );
      u.blatt.T(
        el.x + el.b - polster,
        y - zahl(el, "summe_wert_versatz", 16),
        `${zahlDe(summe, 0)} €`,
        sSummeWert.schnitt,
        sSummeWert.groesse,
        sSummeWert.farbe,
        sSummeWert.sperrung,
        "r"
      );
      return;
    }
    const ys = y - zahl(el, "summe_versatz", 4);
    u.blatt.T(
      el.x + zahl(el, "einzug", 16),
      ys,
      gross(sSumme, zeichenkette(el, "summe_label") ?? "Gesamtaufwand"),
      sSumme.schnitt,
      sSumme.groesse,
      sSumme.farbe,
      sSumme.sperrung
    );
    u.blatt.T(
      el.x + spalte,
      ys,
      `${zahlDe(summe, 0)} €`,
      sSummeWert.schnitt,
      sSummeWert.groesse,
      sSummeWert.farbe,
      sSummeWert.sperrung,
      "r"
    );
  }
};
var rendite = (el, u) => {
  const kacheln = el["kacheln"] ?? [];
  const gefuellt = [];
  for (const k of kacheln) {
    const f = feld(k.feld);
    const w = k.stellen !== void 0 && f ? formatiere(u.daten[k.feld], f.typ, k.stellen) : wert(u.daten, k.feld);
    if (w === void 0) continue;
    gefuellt.push({
      label: k.label,
      wert: k.nachsatz ? w + k.nachsatz : w,
      einheit: k.einheit
    });
  }
  if (!gefuellt.length) {
    warne(u, "fehlender_wert", el, "Keine Renditewerte — das Element entfaellt.");
    return;
  }
  const kind = {
    ...el,
    typ: "kennzahl",
    variante: "kacheln",
    eintraege: gefuellt.map((k) => ({ label: k.label, wert: k.wert, einheit: k.einheit }))
  };
  kennzahl(kind, u);
};
var kontaktkarte = (el, u) => {
  const eckig = zeichenkette(el, "foto_form") === "rechteck";
  const r = zahl(el, "foto_radius", 46);
  const fx = el.x + zahl(el, "foto_x", 70);
  const fy = el.y + zahl(el, "foto_y", el.h / 2);
  const rahmen = eckig ? {
    x: el.x + zahl(el, "foto_x", 0),
    y: el.y + zahl(el, "foto_y", 0),
    b: zahl(el, "foto_breite", 150),
    h: zahl(el, "foto_hoehe", el.h)
  } : { x: fx - r, y: fy - r, b: 2 * r, h: 2 * r };
  const kind = {
    ...el,
    id: `${el.id}-foto`,
    typ: "bild",
    x: rahmen.x,
    y: rahmen.y,
    b: rahmen.b,
    h: rahmen.h,
    eckradius: 0,
    slot: { art: "ansprechpartner" },
    fuellmodus: "cover",
    platzhalter_farbe: el["foto_platzhalter"] ?? { palette: "surf" }
  };
  if (eckig) {
    bild(kind, u);
  } else {
    const quelle = wert(u.daten, "ansprechpartner.foto");
    u.blatt.gruppe([["circle", fx, fy, r]], [1, 0, 0, 1, 0, 0], (b) => {
      if (quelle !== void 0) {
        b.bild(rahmen.x, rahmen.y, rahmen.b, rahmen.h, quelle, "cover");
      } else {
        b.rect(
          rahmen.x,
          rahmen.y,
          rahmen.b,
          rahmen.h,
          farbRef(el, "foto_platzhalter", u) ?? farbe({ palette: "surf" }, u.palette),
          null,
          0
        );
      }
    }, "bild:ansprechpartner");
    if (quelle === void 0) {
      warne(u, "fehlendes_bild", el, "Kein Foto des Ansprechpartners.");
    }
    const ring = farbRef(el, "ring_farbe", u);
    if (ring) {
      u.blatt.kreis(
        fx,
        fy,
        r + zahl(el, "ring_abstand", 5),
        null,
        ring,
        zahl(el, "ring_breite", 0.6)
      );
    }
  }
  const x = el.x + zahl(el, "text_x", 140);
  const sName = stilVon(el, u, "stil_name");
  const name = wert(u.daten, "ansprechpartner.name");
  let y = el.y + el.h - zahl(el, "name_versatz", 40);
  if (name !== void 0) {
    u.blatt.T(
      sName.ausrichtung === "mitte" ? el.x + el.b / 2 : x,
      y,
      gross(sName, name),
      sName.schnitt,
      sName.groesse,
      sName.farbe,
      sName.sperrung,
      ankerArt(sName.ausrichtung)
    );
  } else {
    warne(u, "fehlender_wert", el, "Kein Name des Ansprechpartners.");
  }
  const funktion = wert(u.daten, zeichenkette(el, "feld_funktion") ?? "ansprechpartner.funktion");
  y -= zahl(el, "funktion_abstand", 16);
  if (funktion !== void 0 && zeichenkette(el, "stil_funktion")) {
    const s = u.stil(zeichenkette(el, "stil_funktion"));
    u.blatt.T(
      s.ausrichtung === "mitte" ? el.x + el.b / 2 : x,
      y,
      gross(s, funktion),
      s.schnitt,
      s.groesse,
      s.farbe,
      s.sperrung,
      ankerArt(s.ausrichtung)
    );
  }
  const zeilen = el["kontakte"] ?? [];
  const sLabel = stilVon(el, u, "stil_kontakt_label");
  const sWert = stilVon(el, u, "stil_kontakt_wert");
  const zh = zahl(el, "kontakt_zeilenhoehe", 16);
  const wertX = x + zahl(el, "kontakt_spalte", 50);
  y -= zahl(el, "kontakt_abstand", 24);
  const mittig = zeichenkette(el, "kontakt_ausrichtung") === "mitte";
  const luft = zahl(el, "kontakt_luft", 10);
  for (const z of zeilen) {
    const v = wert(u.daten, z.feld);
    if (v === void 0) continue;
    const beschriftung = gross(sLabel, z.label);
    if (mittig) {
      const lb = u.blatt.sw(beschriftung, sLabel.schnitt, sLabel.groesse, sLabel.sperrung);
      const wb = u.blatt.sw(v, sWert.schnitt, sWert.groesse, sWert.sperrung);
      const x0 = el.x + el.b / 2 - (lb + luft + wb) / 2;
      u.blatt.T(
        x0,
        y + zahl(el, "label_hoch", 1),
        beschriftung,
        sLabel.schnitt,
        sLabel.groesse,
        sLabel.farbe,
        sLabel.sperrung
      );
      u.blatt.T(
        x0 + lb + luft,
        y,
        v,
        sWert.schnitt,
        sWert.groesse,
        sWert.farbe,
        sWert.sperrung
      );
      y -= zh;
      continue;
    }
    u.blatt.T(
      x,
      y,
      beschriftung,
      sLabel.schnitt,
      sLabel.groesse,
      sLabel.farbe,
      sLabel.sperrung
    );
    u.blatt.T(wertX, y, v, sWert.schnitt, sWert.groesse, sWert.farbe, sWert.sperrung);
    y -= zh;
  }
};
var rechtstext = (el, u) => {
  const bloecke = el["bloecke"] ?? [];
  if (!bloecke.length) {
    warne(u, "unbekannt", el, "Rechtstext ohne Bloecke.");
    return;
  }
  const spalten = Math.max(1, zahl(el, "spalten", bloecke.length));
  const abstand = zahl(el, "spaltenabstand", 15);
  const sb = (el.b - abstand * (spalten - 1)) / spalten;
  const sTitel = zeichenkette(el, "stil_titel") ? u.stil(zeichenkette(el, "stil_titel")) : void 0;
  const sText = stilVon(el, u, "stil_text");
  const regeln = satzRegeln(
    u.vorlage.stil.farben.ableitung,
    wahr(el, "blocksatz", false)
  );
  bloecke.forEach((b, i) => {
    const text2 = ersetze(u.daten, b.text);
    if (text2 === void 0) {
      warne(
        u,
        "fehlender_wert",
        el,
        `Der Block "${b.titel ?? i + 1}" bleibt leer und entfaellt.`
      );
      return;
    }
    const x = el.x + i % spalten * (sb + abstand);
    let y = el.y + el.h;
    if (b.titel !== void 0 && sTitel) {
      u.blatt.T(
        x,
        y,
        gross(sTitel, b.titel),
        sTitel.schnitt,
        sTitel.groesse,
        sTitel.farbe,
        sTitel.sperrung
      );
      const strich = farbRef(el, "titel_linie", u);
      if (strich) {
        u.blatt.linie(
          x,
          y - zahl(el, "titel_linie_tief", 12),
          x + zahl(el, "titel_linie_breite", 24),
          y - zahl(el, "titel_linie_tief", 12),
          strich,
          zahl(el, "titel_linienbreite", 0.8)
        );
      }
      y -= zahl(el, "titel_abstand", 16);
    }
    for (const absatz of text2.split("\n")) {
      y = u.blatt.absatz(
        x,
        y,
        absatz,
        sb,
        sText.schnitt,
        sText.groesse,
        sText.zeilenhoehe,
        sText.farbe,
        regeln
      );
    }
  });
};
var inhaltsverzeichnis = (el, u) => {
  const eintraege = u.daten["dokument.seiten"] ?? [];
  const ohne = new Set(el["ohne"] ?? []);
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
    u.blatt.T(
      el.x,
      y,
      String(e.nummer).padStart(2, "0"),
      sNummer.schnitt,
      sNummer.groesse,
      sNummer.farbe,
      sNummer.sperrung
    );
    u.blatt.T(
      el.x + spalte,
      y,
      e.name,
      sName.schnitt,
      sName.groesse,
      sName.farbe,
      sName.sperrung
    );
    y -= zh;
  }
};
var karte = (el, u) => {
  const rahmen = {
    ...el,
    slot: el["slot"] ?? { art: "lageplan" },
    fuellmodus: zeichenkette(el, "fuellmodus") ?? "cover"
  };
  bild(rahmen, u);
  const hinweis = inhalt(el, u, false, "quellenhinweis");
  if (hinweis !== void 0 && zeichenkette(el, "stil_quelle")) {
    const s = u.stil(zeichenkette(el, "stil_quelle"));
    u.blatt.gruppe([["rect", el.x, el.y, el.b, el.h]], [1, 0, 0, 1, 0, 0], (b) => {
      b.T(
        ankerX(el, s.ausrichtung) - zahl(el, "quelle_x", 10),
        el.y + zahl(el, "quelle_y", 8),
        hinweis,
        s.schnitt,
        s.groesse,
        s.farbe,
        s.sperrung,
        ankerArt(s.ausrichtung)
      );
    }, "bild:lageplan");
  }
};
var galerie = (el, u) => {
  const layout = zeichenkette(el, "layout") ?? "gross_oben";
  const g = zahl(el, "abstand", 10);
  const abNr = zahl(el, "ab_nr", 1);
  const beschriftungen = el["beschriftungen"] ?? [];
  const rahmen = [];
  if (layout === "gross_oben") {
    const anteil = zahl(el, "gross_anteil", 0.46);
    const gross2 = el.h * anteil;
    const klein = el.h - gross2 - g;
    const kb = (el.b - g) / 2;
    rahmen.push({ x: el.x, y: el.y + el.h - gross2, b: el.b, h: gross2 });
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
    const kind = {
      ...el,
      id: `${el.id}-${i + 1}`,
      typ: "bild",
      x: r.x,
      y: r.y,
      b: r.b,
      h: r.h,
      slot: { art: "foto", nr: abNr + i },
      label: beschriftungen[i] ?? `{{bild.foto.${abNr + i}.titel?}}`
    };
    bild(kind, u);
  });
};
var qr = (el, u) => {
  const roh = zeichenkette(el, "inhalt") ?? "{{objekt.expose_qr_url}}";
  const ziel = ersetze(u.daten, roh);
  if (ziel === void 0) {
    warne(u, "fehlender_wert", el, "Kein Ziel fuer den QR-Code — er entfaellt.");
    return;
  }
  u.blatt.qr(el.x, el.y, el.b, el.h, ziel, farbRef(el, "farbe", u));
};
var ELEMENTE = {
  text,
  form,
  datenfeld,
  kennzahl,
  faktentabelle,
  raumliste,
  distanzen,
  highlights,
  ausstattung,
  bild,
  galerie,
  karte,
  qr,
  energieskala,
  kostenrechnung,
  rendite,
  kontaktkarte,
  rechtstext,
  inhaltsverzeichnis
};

// packages/expose-renderer/src/pruefen.ts
var BEKANNTE_FELDER = new Set(KATALOG.map((f) => f.schluessel));
var EIGENE_FELDER = /* @__PURE__ */ new Set([
  "bild.lageplan",
  "bild.asset"
]);
function istBekannt(schluessel) {
  if (BEKANNTE_FELDER.has(schluessel)) return true;
  if (EIGENE_FELDER.has(schluessel)) return true;
  return /^bild\.(foto|grundriss)\.\d+(\.titel)?$/.test(schluessel);
}
function vorlagePruefen(v) {
  const raus = [];
  const stile = new Set(Object.keys(v.stil?.textstile ?? {}));
  if (v.schema !== 1) {
    raus.push({ schwere: "fehler", text: `Unbekannte Schemafassung ${v.schema}. Dieser Renderer kennt 1.` });
  }
  if (!v.format || typeof v.format.breite !== "number" || typeof v.format.hoehe !== "number") {
    raus.push({ schwere: "fehler", text: "Die Vorlage nennt kein Format." });
  }
  if (!Array.isArray(v.seiten) || v.seiten.length === 0) {
    raus.push({ schwere: "fehler", text: "Die Vorlage hat keine Seite." });
    return raus;
  }
  const seitenIds = /* @__PURE__ */ new Set();
  for (const seite of v.seiten) {
    if (!seite.id) {
      raus.push({ schwere: "fehler", text: "Eine Seite hat keine Kennung." });
      continue;
    }
    if (seitenIds.has(seite.id)) {
      raus.push({
        schwere: "fehler",
        seite: seite.id,
        text: `Die Seitenkennung "${seite.id}" kommt zweimal vor. Abweichungen je Objekt wuerden auf die falsche Seite wirken.`
      });
    }
    seitenIds.add(seite.id);
    pruefeSeite(seite, v, stile, raus);
  }
  if (v.stil?.seitenfuss) {
    for (const el of v.stil.seitenfuss.elemente) {
      pruefeElement(el, void 0, v, stile, raus);
    }
  }
  return raus;
}
function pruefeSeite(seite, v, stile, raus) {
  if (!Array.isArray(seite.elemente)) {
    raus.push({
      schwere: "fehler",
      seite: seite.id,
      text: "Die Seite hat keine Elementliste."
    });
    return;
  }
  const ids = /* @__PURE__ */ new Set();
  for (const el of seite.elemente) {
    if (el.id && ids.has(el.id)) {
      raus.push({
        schwere: "fehler",
        seite: seite.id,
        element: el.id,
        text: `Die Elementkennung "${el.id}" kommt auf dieser Seite zweimal vor.`
      });
    }
    if (el.id) ids.add(el.id);
    pruefeElement(el, seite.id, v, stile, raus);
  }
}
function pruefeElement(el, seite, v, stile, raus) {
  const melde = (schwere, text2) => raus.push({ schwere, seite, element: el.id, text: text2 });
  if (!el.id) melde("fehler", "Ein Element hat keine Kennung.");
  if (!ELEMENTE[el.typ]) {
    melde("fehler", `Unbekannter Elementtyp "${el.typ}". Bekannt sind: ${Object.keys(ELEMENTE).sort().join(", ")}.`);
  }
  for (const name of ["x", "y", "b", "h"]) {
    if (typeof el[name] !== "number" || !Number.isFinite(el[name])) {
      melde("fehler", `"${name}" fehlt oder ist keine Zahl.`);
    }
  }
  if (typeof el.b === "number" && el.b <= 0) melde("fehler", "Breite 0 oder kleiner.");
  if (typeof el.h === "number" && el.h < 0) melde("fehler", "Negative Hoehe.");
  if (el.drehung !== void 0 && ![0, 90, 270].includes(el.drehung)) {
    melde("fehler", `Drehung ${el.drehung} — erlaubt sind 0, 90 und 270.`);
  }
  for (const [schluessel, wert2] of Object.entries(el)) {
    if (!schluessel.startsWith("stil") || typeof wert2 !== "string") continue;
    if (!stile.has(wert2)) {
      melde("fehler", `Der Textstil "${wert2}" steht nicht in der Vorlage. Vorhanden: ${[...stile].sort().join(", ")}.`);
    }
  }
  for (const text2 of texteIn(el)) {
    for (const feld2 of platzhalterIn(text2)) {
      if (!istBekannt(feld2)) {
        melde("fehler", `Der Platzhalter {{${feld2}}} ist dem Feldkatalog nicht bekannt. Im PDF bliebe dort eine Luecke.`);
      }
    }
  }
  if (typeof el.x === "number" && typeof el.b === "number" && typeof el.y === "number" && typeof el.h === "number" && v.format) {
    if (el.x < -0.01 || el.y < -0.01 || el.x + el.b > v.format.breite + 0.01 || el.y + el.h > v.format.hoehe + 0.01) {
      melde("hinweis", `Der Rahmen (${el.x}, ${el.y}, ${el.b}, ${el.h}) reicht ueber die Seite hinaus.`);
    }
  }
}
function texteIn(el) {
  const raus = [];
  const sammle = (v) => {
    if (typeof v === "string") {
      if (v.includes("{{")) raus.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) sammle(x);
      return;
    }
    if (v && typeof v === "object") {
      for (const x of Object.values(v)) sammle(x);
    }
  };
  for (const [schluessel, wert2] of Object.entries(el)) {
    if (schluessel === "id" || schluessel === "typ") continue;
    sammle(wert2);
  }
  return raus;
}

// packages/expose-renderer/src/rendern.ts
function rendern(a) {
  const { vorlage } = a;
  const palette2 = paletteFuer(vorlage, a.marke ?? {});
  const warnungen = [];
  const daten = { ...a.daten };
  for (const b of vorlagePruefen(vorlage)) {
    warnungen.push({
      art: b.schwere === "fehler" ? "unbekannt" : "fehlender_wert",
      seite: b.seite,
      element: b.element,
      text: b.text
    });
  }
  const aus = new Set(a.overrides?.seiten_aus ?? []);
  const texte = a.overrides?.texte ?? {};
  const bilder = a.overrides?.bilder ?? {};
  const sichtbar = [];
  for (const seite of vorlage.seiten) {
    if (aus.has(seite.id)) continue;
    if (!trifftZu(daten, seite.sichtbar_wenn)) continue;
    const wdh = seite.wiederholen;
    if (!wdh) {
      sichtbar.push({ seite });
      continue;
    }
    const quelle = daten[wdh.feld];
    const anzahl = Array.isArray(quelle) ? quelle.length : 0;
    if (anzahl === 0) {
      warnungen.push({
        art: "fehlender_wert",
        seite: seite.id,
        text: `"${seite.name}" wiederholt sich je Eintrag in ${wdh.feld}, und dort steht nichts — die Seite entfaellt.`
      });
      continue;
    }
    const proSeite = Math.max(1, wdh.pro_seite ?? 1);
    const seiten2 = Math.ceil(anzahl / proSeite);
    for (let i = 0; i < seiten2; i++) {
      sichtbar.push({ seite, lauf: { nummer: i + 1, gesamt: seiten2 } });
    }
  }
  const gesamt = sichtbar.length;
  daten["dokument.seiten"] = sichtbar.map((s, i) => ({
    nummer: i + 1,
    name: s.lauf && s.lauf.gesamt > 1 ? `${s.seite.name} ${s.lauf.nummer}` : s.seite.name
  }));
  const seiten = [];
  sichtbar.forEach(({ seite, lauf }, i) => {
    const blatt = new Blatt(vorlage.format.breite, vorlage.format.hoehe, a.schriften);
    const u = {
      blatt,
      daten,
      palette: palette2,
      vorlage,
      warnungen,
      seite: { nummer: i + 1, gesamt, name: seite.name, id: seite.id },
      stil: (name) => stilAus(vorlage, name, palette2)
    };
    daten["seite.nummer"] = i + 1;
    daten["seite.gesamt"] = gesamt;
    daten["seite.name"] = seite.name;
    daten["seite.nummer_zweistellig"] = String(i + 1).padStart(2, "0");
    daten["seite.gesamt_zweistellig"] = String(gesamt).padStart(2, "0");
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
        art: "fehlendes_zeichen",
        seite: seite.id,
        text: `Die Schrift ${schnitt} hat diese Zeichen nicht: ${Array.from(zeichen).join(" ")}. Sie fehlen im PDF.`
      });
    }
    seiten.push({
      breite: vorlage.format.breite,
      hoehe: vorlage.format.hoehe,
      schritte: blatt.schritte
    });
  });
  return { seiten, warnungen };
}
function zeichneElement(u, el) {
  if (!trifftZu(u.daten, el.sichtbar_wenn)) return;
  const zeichner = ELEMENTE[el.typ];
  if (!zeichner) {
    u.warnungen.push({
      art: "unbekannt",
      seite: u.seite.id,
      element: el.id,
      text: `Der Elementtyp "${el.typ}" ist dem Renderer nicht bekannt. Das Element wird nicht gezeichnet.`
    });
    return;
  }
  try {
    zeichner(el, u);
  } catch (grund) {
    u.warnungen.push({
      art: "unbekannt",
      seite: u.seite.id,
      element: el.id,
      text: `${el.typ} liess sich nicht zeichnen: ${grund instanceof Error ? grund.message : String(grund)}`
    });
  }
}
function mitOverride(el, texte, bilder) {
  const t = texte[el.id];
  const b = bilder[el.id];
  if (t === void 0 && b === void 0) return el;
  const neu = { ...el };
  if (t !== void 0) neu["inhalt"] = t;
  if (b !== void 0) neu["slot"] = b;
  return neu;
}
function hintergrundZeichnen(u, seite) {
  const f = seite.hintergrund;
  const b = u.vorlage.format.breite;
  const h = u.vorlage.format.hoehe;
  const el = {
    id: `${seite.id}-hintergrund`,
    typ: "form",
    x: 0,
    y: 0,
    b,
    h
  };
  if (f.art === "farbe") {
    el["form"] = "rechteck";
    el["fuell"] = f.farbe;
  } else if (f.art === "verlauf") {
    el["form"] = "rechteck";
    el["verlauf"] = { von: f.von, nach: f.nach, richtung: f.richtung };
  } else if (f.art === "bild" || f.art === "asset") {
    el["typ"] = "bild";
    el["slot"] = f.art === "bild" ? f.slot : { art: "asset", pfad: f.pfad };
    el["fuellmodus"] = f.art === "bild" ? f.fuellmodus ?? "cover" : "cover";
  }
  zeichneElement(u, el);
}

// packages/expose-renderer/src/pdf.ts
var KAPPA = 0.5522847498307933;
async function zuPdf(a, w) {
  const { PDFLib } = w;
  const doc = await PDFLib.PDFDocument.create();
  doc.registerFontkit(w.fontkit);
  if (a.titel) doc.setTitle(a.titel);
  if (a.verfasser) doc.setAuthor(a.verfasser);
  doc.setProducer("immoOffice.ai");
  doc.setCreator("immoOffice.ai");
  const gebraucht = /* @__PURE__ */ new Set();
  for (const seite of a.seiten) sammleSchnitte(seite.schritte, gebraucht);
  const schriften = /* @__PURE__ */ new Map();
  for (const name of gebraucht) {
    const m = a.schriften.get(name);
    if (!m) throw new Error(`Die Schrift "${name}" ist nicht geladen.`);
    schriften.set(name, await doc.embedFont(m.daten, { subset: false }));
  }
  const bilder = /* @__PURE__ */ new Map();
  for (const [pfad, bytes] of a.bilder ?? []) {
    const bild2 = istPng(bytes) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    bilder.set(pfad, { ref: bild2.ref, b: bild2.width, h: bild2.height });
  }
  for (const seite of a.seiten) {
    const blatt = doc.addPage([seite.breite, seite.hoehe]);
    const zustand = { doc, blatt, PDFLib, schriften, bilder, qr: a.qr };
    zeichne(seite.schritte, zustand);
  }
  return doc.save();
}
function sammleSchnitte(schritte, raus) {
  for (const s of schritte) {
    if (s.art === "text") raus.add(s.schnitt);
    else if (s.art === "gruppe") sammleSchnitte(s.schritte, raus);
  }
}
function istPng(b) {
  return b.length > 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
}
function zeichne(schritte, z) {
  const P2 = z.PDFLib;
  for (const s of schritte) {
    if (s.art === "gruppe") {
      z.blatt.pushOperators(P2.pushGraphicsState());
      if (s.matrix[0] !== 1 || s.matrix[1] !== 0 || s.matrix[2] !== 0 || s.matrix[3] !== 1 || s.matrix[4] !== 0 || s.matrix[5] !== 0) {
        z.blatt.pushOperators(P2.concatTransformationMatrix(...s.matrix));
      }
      if (s.maske) {
        pfadOperatoren(s.maske, z);
        z.blatt.pushOperators(P2.clip(), P2.endPath());
      }
      zeichne(s.schritte, z);
      z.blatt.pushOperators(P2.popGraphicsState());
      continue;
    }
    z.blatt.pushOperators(P2.pushGraphicsState());
    const m = s.matrix;
    if (m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1 || m[4] !== 0 || m[5] !== 0) {
      z.blatt.pushOperators(P2.concatTransformationMatrix(...m));
    }
    einzeln(s, z);
    z.blatt.pushOperators(P2.popGraphicsState());
  }
}
function farbOps(z, fuell, strich, linienbreite) {
  const P2 = z.PDFLib;
  if (fuell) {
    z.blatt.pushOperators(P2.setFillingRgbColor(fuell[0], fuell[1], fuell[2]));
    if (fuell[3] < 1) deckkraft(z, fuell[3], "fuell");
  }
  if (strich) {
    z.blatt.pushOperators(P2.setStrokingRgbColor(strich[0], strich[1], strich[2]));
    if (strich[3] < 1) deckkraft(z, strich[3], "strich");
  }
  if (linienbreite != null) z.blatt.pushOperators(P2.setLineWidth(linienbreite));
}
function deckkraft(z, wert2, art) {
  const P2 = z.PDFLib;
  const dict = z.doc.context.obj(
    art === "fuell" ? { Type: "ExtGState", ca: wert2 } : { Type: "ExtGState", CA: wert2 }
  );
  const ref = z.doc.context.register(dict);
  const name = z.blatt.node.newExtGState("GS", ref);
  z.blatt.pushOperators(P2.PDFOperator.of("gs", [name]));
}
function einzeln(s, z) {
  const P2 = z.PDFLib;
  switch (s.art) {
    case "text": {
      const schrift = z.schriften.get(s.schnitt);
      if (!schrift) throw new Error(`Schrift "${s.schnitt}" nicht eingebettet.`);
      const name = z.blatt.node.newFontDictionary(schrift.name, schrift.ref);
      const farbe2 = s.farbe ?? [0, 0, 0, 1];
      if (farbe2[3] < 1) deckkraft(z, farbe2[3], "fuell");
      z.blatt.pushOperators(
        P2.beginText(),
        P2.setFontAndSize(name, s.groesse),
        P2.setCharacterSpacing(s.sperrung),
        P2.setFillingRgbColor(farbe2[0], farbe2[1], farbe2[2]),
        P2.moveText(s.x, s.y),
        P2.showText(schrift.encodeText(s.text)),
        P2.endText()
      );
      return;
    }
    case "rechteck":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      z.blatt.pushOperators(P2.rectangle(s.x, s.y, s.b, s.h));
      malen(z, s.fuell, s.strich);
      return;
    case "rundrechteck":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      rundRechteck(z, s.x, s.y, s.b, s.h, s.r);
      malen(z, s.fuell, s.strich);
      return;
    case "linie":
      farbOps(z, null, s.strich, s.linienbreite);
      if (s.strichmuster) {
        z.blatt.pushOperators(P2.setDashPattern(s.strichmuster, 0));
      }
      z.blatt.pushOperators(P2.moveTo(s.x1, s.y1), P2.lineTo(s.x2, s.y2), P2.stroke());
      return;
    case "kreis":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      kreisbogen(z, s.x, s.y, s.r, s.r);
      malen(z, s.fuell, s.strich);
      return;
    case "ellipse": {
      farbOps(z, s.fuell, s.strich, null);
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      kreisbogen(z, mx, my, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2);
      malen(z, s.fuell, s.strich);
      return;
    }
    case "pfad":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      pfadOperatoren(s.schritte, z);
      malen(z, s.fuell, s.strich);
      return;
    case "maske":
      return;
    case "verlauf":
      verlauf(s, z);
      return;
    case "radialverlauf":
      return;
    case "bild": {
      const bild2 = z.bilder.get(s.quelle);
      if (!bild2) return;
      const name = z.blatt.node.newXObject("Bild", bild2.ref);
      const skalaX = s.b / bild2.b;
      const skalaY = s.h / bild2.h;
      const f = s.fuellmodus === "contain" ? Math.min(skalaX, skalaY) : Math.max(skalaX, skalaY);
      const bb = bild2.b * f;
      const hh = bild2.h * f;
      z.blatt.pushOperators(
        P2.concatTransformationMatrix(
          bb,
          0,
          0,
          hh,
          s.x + (s.b - bb) / 2,
          s.y + (s.h - hh) / 2
        ),
        P2.drawObject(name)
      );
      return;
    }
    case "qr": {
      if (!z.qr) return;
      const felder = z.qr(s.inhalt);
      const n = felder.length;
      if (!n) return;
      const farbe2 = s.farbe ?? [0, 0, 0, 1];
      z.blatt.pushOperators(P2.setFillingRgbColor(farbe2[0], farbe2[1], farbe2[2]));
      const bx = s.b / n;
      const by = s.h / n;
      for (let zeile = 0; zeile < n; zeile++) {
        for (let spalte = 0; spalte < n; spalte++) {
          if (!felder[zeile][spalte]) continue;
          z.blatt.pushOperators(P2.rectangle(
            s.x + spalte * bx,
            s.y + s.h - (zeile + 1) * by,
            bx,
            by
          ));
        }
      }
      z.blatt.pushOperators(P2.fill());
      return;
    }
    case "gruppe":
      return;
  }
}
function malen(z, fuell, strich) {
  const P2 = z.PDFLib;
  if (fuell && strich) z.blatt.pushOperators(P2.fillAndStroke());
  else if (fuell) z.blatt.pushOperators(P2.fill());
  else if (strich) z.blatt.pushOperators(P2.stroke());
  else z.blatt.pushOperators(P2.endPath());
}
function rundRechteck(z, x, y, b, h, r) {
  const P2 = z.PDFLib;
  const rr = Math.min(r, Math.abs(b) / 2, Math.abs(h) / 2);
  const k = rr * KAPPA;
  z.blatt.pushOperators(
    P2.moveTo(x + rr, y),
    P2.lineTo(x + b - rr, y),
    P2.appendBezierCurve(x + b - rr + k, y, x + b, y + rr - k, x + b, y + rr),
    P2.lineTo(x + b, y + h - rr),
    P2.appendBezierCurve(x + b, y + h - rr + k, x + b - rr + k, y + h, x + b - rr, y + h),
    P2.lineTo(x + rr, y + h),
    P2.appendBezierCurve(x + rr - k, y + h, x, y + h - rr + k, x, y + h - rr),
    P2.lineTo(x, y + rr),
    P2.appendBezierCurve(x, y + rr - k, x + rr - k, y, x + rr, y),
    P2.closePath()
  );
}
function kreisbogen(z, cx, cy, rx, ry) {
  const P2 = z.PDFLib;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  z.blatt.pushOperators(
    P2.moveTo(cx + rx, cy),
    P2.appendBezierCurve(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
    P2.appendBezierCurve(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
    P2.appendBezierCurve(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
    P2.appendBezierCurve(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
    P2.closePath()
  );
}
function neuesBetriebsmittel(z, tafel, praefix, ref) {
  const P2 = z.PDFLib;
  const betriebsmittel = z.blatt.node.Resources();
  if (!betriebsmittel) {
    throw new Error("Die Seite hat keine Betriebsmittel — das kann nicht sein.");
  }
  const schluessel = P2.PDFName.of(tafel);
  let unter = betriebsmittel.lookup(schluessel, P2.PDFDict);
  if (!unter) {
    unter = P2.PDFDict.withContext(z.doc.context);
    betriebsmittel.set(schluessel, unter);
  }
  let i = 0;
  let name = P2.PDFName.of(`${praefix}${i}`);
  while (unter.has(name)) {
    i += 1;
    name = P2.PDFName.of(`${praefix}${i}`);
  }
  unter.set(name, ref);
  return name;
}
function pfadOperatoren(schritte, z) {
  const P2 = z.PDFLib;
  for (const t of schritte) {
    switch (t[0]) {
      case "moveTo":
        z.blatt.pushOperators(P2.moveTo(t[1], t[2]));
        break;
      case "lineTo":
        z.blatt.pushOperators(P2.lineTo(t[1], t[2]));
        break;
      case "curveTo":
        z.blatt.pushOperators(P2.appendBezierCurve(t[1], t[2], t[3], t[4], t[5], t[6]));
        break;
      case "close":
        z.blatt.pushOperators(P2.closePath());
        break;
      case "rect":
        z.blatt.pushOperators(P2.rectangle(t[1], t[2], t[3], t[4]));
        break;
      case "roundRect":
        rundRechteck(z, t[1], t[2], t[3], t[4], t[5]);
        break;
      case "circle":
        kreisbogen(z, t[1], t[2], t[3], t[3]);
        break;
      case "ellipse":
        kreisbogen(
          z,
          (t[1] + t[3]) / 2,
          (t[2] + t[4]) / 2,
          Math.abs(t[3] - t[1]) / 2,
          Math.abs(t[4] - t[2]) / 2
        );
        break;
    }
  }
}
function verlauf(s, z) {
  const P2 = z.PDFLib;
  const farben = s.farben;
  if (farben.length < 2) return;
  const funktion = farben.length === 2 ? z.doc.context.obj({
    FunctionType: 2,
    Domain: [0, 1],
    N: 1,
    C0: [farben[0][0], farben[0][1], farben[0][2]],
    C1: [farben[1][0], farben[1][1], farben[1][2]]
  }) : z.doc.context.obj({
    FunctionType: 3,
    Domain: [0, 1],
    Functions: farben.slice(0, -1).map((c, i) => z.doc.context.obj({
      FunctionType: 2,
      Domain: [0, 1],
      N: 1,
      C0: [c[0], c[1], c[2]],
      C1: [farben[i + 1][0], farben[i + 1][1], farben[i + 1][2]]
    })),
    Bounds: s.stellen ?? farben.slice(1, -1).map((_, i) => (i + 1) / (farben.length - 1)),
    Encode: farben.slice(0, -1).flatMap(() => [0, 1])
  });
  const schattierung = z.doc.context.obj({
    ShadingType: 2,
    ColorSpace: "DeviceRGB",
    Coords: [s.x0, s.y0, s.x1, s.y1],
    Function: z.doc.context.register(funktion),
    Extend: [true, true]
  });
  const ref = z.doc.context.register(schattierung);
  const name = neuesBetriebsmittel(z, "Shading", "Verlauf", ref);
  z.blatt.pushOperators(P2.PDFOperator.of("sh", [name]));
}

// packages/expose-renderer/src/schema.ts
var A4 = { breite: 595.28, hoehe: 841.89 };

// packages/expose-renderer/src/zufall.ts
var N = 624;
var M = 397;
var MATRIX = 2567483615;
var OBEN = 2147483648;
var UNTEN = 2147483647;
var Zufall = class _Zufall {
  /** `random.Random(saat)` mit einer nicht negativen ganzen Zahl. */
  constructor(saat) {
    __publicField(this, "zustand", new Uint32Array(N));
    __publicField(this, "stelle", N + 1);
    this.ausFeld(_Zufall.woerter(saat));
  }
  /**
   * CPython streut einen ganzzahligen Startwert nicht direkt ein, sondern
   * zerlegt ihn in 32-Bit-Woerter und ruft init_by_array. Bei den Saaten
   * der Prototypen (kleine positive Zahlen) ist das genau ein Wort — aber
   * ein Wort, nicht die Zahl selbst, und init_by_array ist nicht
   * init_genrand.
   */
  static woerter(saat) {
    let n = Math.abs(Math.trunc(saat));
    if (n === 0) return Uint32Array.from([0]);
    const raus = [];
    while (n > 0) {
      raus.push(n % 4294967296);
      n = Math.floor(n / 4294967296);
    }
    return Uint32Array.from(raus);
  }
  initGenrand(s) {
    const z = this.zustand;
    z[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const v = z[i - 1] ^ z[i - 1] >>> 30;
      z[i] = _Zufall.mal(1812433253, v) + i >>> 0;
    }
    this.stelle = N;
  }
  /** 32-Bit-Multiplikation ohne Genauigkeitsverlust. */
  static mal(a, b) {
    const hoch = (a >>> 16) * (b & 65535) << 16;
    const tief = (a & 65535) * b;
    return hoch + tief >>> 0;
  }
  ausFeld(feld2) {
    this.initGenrand(19650218);
    const z = this.zustand;
    let i = 1;
    let j = 0;
    let k = Math.max(N, feld2.length);
    for (; k > 0; k--) {
      const v = z[i - 1] ^ z[i - 1] >>> 30;
      z[i] = (z[i] ^ _Zufall.mal(1664525, v)) + feld2[j] + j >>> 0;
      i++;
      j++;
      if (i >= N) {
        z[0] = z[N - 1];
        i = 1;
      }
      if (j >= feld2.length) j = 0;
    }
    for (k = N - 1; k > 0; k--) {
      const v = z[i - 1] ^ z[i - 1] >>> 30;
      z[i] = (z[i] ^ _Zufall.mal(1566083941, v)) - i >>> 0;
      i++;
      if (i >= N) {
        z[0] = z[N - 1];
        i = 1;
      }
    }
    z[0] = 2147483648;
    this.stelle = N;
  }
  /** Eine 32-Bit-Zufallszahl, genrand_uint32. */
  wort() {
    const z = this.zustand;
    if (this.stelle >= N) {
      for (let i = 0; i < N; i++) {
        const y2 = (z[i] & OBEN | z[(i + 1) % N] & UNTEN) >>> 0;
        z[i] = (z[(i + M) % N] ^ y2 >>> 1 ^ (y2 & 1 ? MATRIX : 0)) >>> 0;
      }
      this.stelle = 0;
    }
    let y = z[this.stelle++];
    y = (y ^ y >>> 11) >>> 0;
    y = (y ^ y << 7 & 2636928640) >>> 0;
    y = (y ^ y << 15 & 4022730752) >>> 0;
    y = (y ^ y >>> 18) >>> 0;
    return y;
  }
  /** `random.random()` — genrand_res53, 53 Bit aus zwei Woertern. */
  zahl() {
    const a = this.wort() >>> 5;
    const b = this.wort() >>> 6;
    return (a * 67108864 + b) * (1 / 9007199254740992);
  }
};

// packages/expose-renderer/src/index.ts
var SCHNITTE = [
  "Jak-Light",
  "Jak-Regular",
  "Jak-Medium",
  "Jak-SemiBold",
  "Jak-Bold",
  "Jak-ExtraBold",
  "Corm-Light",
  "Corm-Regular",
  "Corm-Medium",
  "Corm-SemiBold",
  "Corm-LightItalic",
  "Corm-RegularItalic",
  "Corm-MediumItalic",
  "Arch-Light",
  "Arch-Regular",
  "Arch-Medium",
  "Arch-SemiBold",
  "Arch-Bold",
  "Arch-CondXB",
  "Arch-CondBlack"
];
export {
  A4,
  ANSPRECHPARTNER,
  ELEMENTE,
  FIRMA,
  KATALOG,
  OBJEKT,
  RECHNUNG,
  SCHNITTE,
  SEITE,
  VORGABE,
  Zufall,
  breite,
  datumDe,
  ersetze,
  farbe,
  fehlendeZeichen,
  feld,
  flach,
  formatiere,
  helligkeit,
  hex,
  hx,
  metrikLesen,
  mix,
  palette,
  paletteFuer,
  platzhalterIn,
  rendern,
  schnittName,
  stilAus,
  textstil,
  trifftZu,
  vorlagePruefen,
  wert,
  zahlDe,
  zuPdf
};
