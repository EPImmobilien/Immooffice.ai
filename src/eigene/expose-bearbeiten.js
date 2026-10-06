// ============================================================================
// Exposé-Vorlagen — Felder festlegen
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md):
// React.createElement, kein Modulsystem, kein Buendler, keine fremde
// Bibliothek fuer das Ziehen. Zeigerereignisse reichen.
//
// Was hier geht: eine Seite der Vorlage als Flaeche sehen, ein Feld
// anfassen, verschieben, an den Griffen groesser ziehen, ein neues Text-
// oder Bildfeld setzen, eines loeschen, die Reihenfolge aendern und jeden
// Wert auch als Zahl eintragen.
//
// Die Flaeche malt src/eigene/expose-leinwand.js aus DERSELBEN Schrittliste,
// die auch ins PDF geht. Es gibt also keine zweite Fassung der Seite, die
// auseinanderlaufen koennte — was hier steht, steht nachher im Exposé.
//
// Masse: Punkt, Ursprung unten links (so steht es im Dokument und im PDF).
// Das Browserfenster rechnet von oben; die Umrechnung steht in zweiRaeume().
// ============================================================================
(function () {
  "use strict";

  var e = React.createElement;

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };

  // Ein Punkt Raster. Feiner laesst sich mit der Maus ohnehin nicht zielen,
  // und ein halber Punkt Versatz sieht man im Druck nicht — im Dokument
  // aber schon, und dort stoert er beim naechsten Vergleich.
  var RASTER = 1;
  // Bis hierhin faengt eine Kante die andere ein.
  var FANG = 3;

  function runden(v) { return Math.round(v / RASTER) * RASTER; }

  /** Tief kopieren — das Dokument wird nie an Ort und Stelle geaendert. */
  function kopie(x) { return JSON.parse(JSON.stringify(x)); }

  /** Welche Felder ein Element dieses Typs sinnvoll fuehrt. */
  var SLOT_ARTEN = [
    ["foto", "Foto (Nummer)"],
    ["titelbild", "Titelbild"],
    ["foto_kategorie", "Foto nach Kategorie"],
    ["grundriss", "Grundriss (Nummer)"],
    ["lageplan", "Lageplan"],
    ["ansprechpartner", "Foto des Ansprechpartners"],
    ["logo", "Logo"],
  ];

  function zweiRaeume(seite, massstab) {
    // Seitenkoordinaten (unten links) <-> Bildschirm (oben links).
    return {
      nachOben: function (x, y, b, h) {
        return {
          left: x * massstab,
          top: (seite.hoehe - y - h) * massstab,
          width: b * massstab,
          height: h * massstab,
        };
      },
      nachUnten: function (px, py) {
        return { x: px / massstab, y: seite.hoehe - py / massstab };
      },
    };
  }

  function zahlFeld(label, wert, onWert, schritt) {
    return e("label", { key: label, style: { display: "block", flex: "1 1 60px" } }, [
      e("div", { key: "l", style: { fontSize: 10, color: CI.muted, marginBottom: 2 } }, label),
      e("input", {
        key: "i", type: "number", value: Math.round(Number(wert) * 10) / 10,
        step: schritt || 1,
        onChange: function (ev) {
          var v = Number(ev.target.value);
          if (Number.isFinite(v)) onWert(v);
        },
        style: {
          width: "100%", boxSizing: "border-box", padding: "5px 7px",
          border: "1px solid " + CI.border, borderRadius: 6, fontSize: 12,
        },
      }),
    ]);
  }

  function knopf(text, onClick, art, aus) {
    var farben = {
      haupt: { background: CI.blau, color: "#fff", border: "1px solid " + CI.blau },
      zweit: { background: "#fff", color: CI.blau, border: "1px solid " + CI.border },
      gefahr: { background: "#fff", color: CI.danger, border: "1px solid " + CI.border },
    };
    return e("button", {
      key: text, onClick: onClick, disabled: !!aus, title: text,
      style: Object.assign({
        padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
        cursor: aus ? "default" : "pointer", opacity: aus ? 0.45 : 1,
      }, farben[art || "zweit"]),
    }, text);
  }

  /**
   * Die Bearbeitungsflaeche.
   *
   * props:
   *   dokument   die Vorlage, wie sie gerade aussieht
   *   seite      Nummer der Seite im Dokument
   *   setSeite   Seitenwechsel melden
   *   aendern    neues Dokument melden (der Aufrufer haelt den Entwurf)
   *   bild       { seitenbild, warnungen } der gezeichneten Seite oder null
   *   bilder,qr  fuer die Leinwand
   */
  function ExposeBearbeiten(props) {
    var dokument = props.dokument;
    var seiten = (dokument && dokument.seiten) || [];
    var si = Math.max(0, Math.min(props.seite || 0, seiten.length - 1));
    var seite = seiten[si];

    var auswahlS = React.useState(null);
    var auswahl = auswahlS[0], setAuswahl = auswahlS[1];
    var massstabS = React.useState(0.62);
    var massstab = massstabS[0], setMassstab = massstabS[1];
    var ziehenS = React.useState(null);
    var ziehen = ziehenS[0], setZiehen = ziehenS[1];
    var hilfeS = React.useState([]);          // Fanglinien, nur zum Anzeigen
    var hilfe = hilfeS[0], setHilfe = hilfeS[1];

    var leinwand = React.useRef(null);
    var flaeche = React.useRef(null);

    var format = (dokument && dokument.format) || { breite: 595.28, hoehe: 841.89 };
    var raeume = zweiRaeume(format, massstab);

    // --- Zeichnen ---------------------------------------------------------
    React.useEffect(function () {
      var c = leinwand.current;
      if (!c) return;
      var bild = props.bild;
      if (!bild) {
        // Die Seite entfaellt mit den Beispieldaten (eine Bedingung trifft
        // nicht zu). Bearbeiten laesst sie sich trotzdem — also ein leeres
        // Blatt, damit die Rahmen irgendwo liegen koennen.
        c.width = Math.round(format.breite * massstab);
        c.height = Math.round(format.hoehe * massstab);
        c.style.width = (format.breite * massstab) + "px";
        c.style.height = (format.hoehe * massstab) + "px";
        var ctx = c.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        return;
      }
      try {
        window.ImmoExposeLeinwand.zeichne(c, bild, {
          massstab: massstab, bilder: props.bilder, qr: props.qr,
        });
      } catch (f) { /* die Flaeche bleibt leer, die Liste daneben nicht */ }
    }, [props.bild, massstab, format.breite, format.hoehe]);

    function elemente() { return (seite && seite.elemente) || []; }
    function gewaehltesElement() {
      return elemente().filter(function (el) { return el.id === auswahl; })[0] || null;
    }

    function schreibe(aendern) {
      var neu = kopie(dokument);
      aendern(neu.seiten[si]);
      props.aendern(neu);
    }

    function setzeMasse(id, masse) {
      schreibe(function (s) {
        s.elemente.forEach(function (el) {
          if (el.id !== id) return;
          Object.keys(masse).forEach(function (k) { el[k] = masse[k]; });
        });
      });
    }

    // --- Fangen ------------------------------------------------------------
    // Kanten der anderen Elemente und der Seitenrand. Ohne das rutscht
    // jedes verschobene Feld um ein, zwei Punkt gegen seine Nachbarn, und
    // die Seite franst aus.
    function kanten(ausser) {
      var xs = [0, format.breite, 36, format.breite - 36];
      var ys = [0, format.hoehe, 36, format.hoehe - 36];
      elemente().forEach(function (el) {
        if (el.id === ausser) return;
        xs.push(el.x, el.x + el.b);
        ys.push(el.y, el.y + el.h);
      });
      return { xs: xs, ys: ys };
    }

    function fange(wert, liste) {
      var beste = null, abstand = FANG;
      liste.forEach(function (k) {
        var d = Math.abs(k - wert);
        if (d <= abstand) { abstand = d; beste = k; }
      });
      return beste;
    }

    // --- Ziehen ------------------------------------------------------------
    function beginnZiehen(ev, el, art) {
      if (el.gesperrt) return;
      ev.preventDefault();
      ev.stopPropagation();
      setAuswahl(el.id);
      var start = { x: ev.clientX, y: ev.clientY };
      setZiehen({ id: el.id, art: art, start: start,
                  masse: { x: el.x, y: el.y, b: el.b, h: el.h } });
    }

    React.useEffect(function () {
      if (!ziehen) return;
      function bewegen(ev) {
        var dx = (ev.clientX - ziehen.start.x) / massstab;
        var dy = -(ev.clientY - ziehen.start.y) / massstab;   // Bildschirm nach unten
        var m = ziehen.masse;
        var neu = { x: m.x, y: m.y, b: m.b, h: m.h };
        if (ziehen.art === "verschieben") {
          neu.x = m.x + dx; neu.y = m.y + dy;
        } else {
          if (ziehen.art.indexOf("l") >= 0) { neu.x = m.x + dx; neu.b = m.b - dx; }
          if (ziehen.art.indexOf("r") >= 0) { neu.b = m.b + dx; }
          if (ziehen.art.indexOf("u") >= 0) { neu.y = m.y + dy; neu.h = m.h - dy; }
          if (ziehen.art.indexOf("o") >= 0) { neu.h = m.h + dy; }
        }
        neu.b = Math.max(4, neu.b);
        neu.h = Math.max(4, neu.h);
        // Fangen: nur beim Verschieben an beiden Kanten, beim Ziehen an der
        // Kante, die der Griff bewegt.
        var k = kanten(ziehen.id);
        var linien = [];
        if (!ev.altKey) {
          var fx = fange(neu.x, k.xs);
          var fx2 = fange(neu.x + neu.b, k.xs);
          if (fx !== null) { if (ziehen.art === "verschieben") neu.x = fx; else { neu.b += neu.x - fx; neu.x = fx; } linien.push(["x", fx]); }
          else if (fx2 !== null) { if (ziehen.art === "verschieben") neu.x = fx2 - neu.b; else neu.b = fx2 - neu.x; linien.push(["x", fx2]); }
          var fy = fange(neu.y, k.ys);
          var fy2 = fange(neu.y + neu.h, k.ys);
          if (fy !== null) { if (ziehen.art === "verschieben") neu.y = fy; else { neu.h += neu.y - fy; neu.y = fy; } linien.push(["y", fy]); }
          else if (fy2 !== null) { if (ziehen.art === "verschieben") neu.y = fy2 - neu.h; else neu.h = fy2 - neu.y; linien.push(["y", fy2]); }
        }
        setHilfe(linien);
        setzeMasse(ziehen.id, {
          x: runden(neu.x), y: runden(neu.y),
          b: runden(neu.b), h: runden(neu.h),
        });
      }
      function loslassen() { setZiehen(null); setHilfe([]); }
      window.addEventListener("pointermove", bewegen);
      window.addEventListener("pointerup", loslassen);
      return function () {
        window.removeEventListener("pointermove", bewegen);
        window.removeEventListener("pointerup", loslassen);
      };
      // eslint-disable-next-line
    }, [ziehen, massstab, dokument, si]);

    // --- Tastatur ----------------------------------------------------------
    React.useEffect(function () {
      function taste(ev) {
        if (!auswahl) return;
        var ziel = ev.target && ev.target.tagName;
        if (ziel === "INPUT" || ziel === "TEXTAREA" || ziel === "SELECT") return;
        var el = gewaehltesElement();
        if (!el || el.gesperrt) return;
        var schritt = ev.shiftKey ? 10 : 1;
        var dx = 0, dy = 0;
        if (ev.key === "ArrowLeft") dx = -schritt;
        else if (ev.key === "ArrowRight") dx = schritt;
        else if (ev.key === "ArrowUp") dy = schritt;
        else if (ev.key === "ArrowDown") dy = -schritt;
        else if (ev.key === "Delete" || ev.key === "Backspace") {
          ev.preventDefault(); loeschen(); return;
        } else return;
        ev.preventDefault();
        setzeMasse(el.id, { x: runden(el.x + dx), y: runden(el.y + dy) });
      }
      window.addEventListener("keydown", taste);
      return function () { window.removeEventListener("keydown", taste); };
      // eslint-disable-next-line
    }, [auswahl, dokument, si]);

    // --- Elemente anlegen, loeschen, umsortieren --------------------------
    function naechsteKennung(vorsatz) {
      var n = 1;
      var vergeben = {};
      seiten.forEach(function (s) {
        (s.elemente || []).forEach(function (el) { vergeben[el.id] = true; });
      });
      while (vergeben[vorsatz + "-" + n]) n++;
      return vorsatz + "-" + n;
    }

    function hinzu(art) {
      var stile = Object.keys((dokument.stil && dokument.stil.textstile) || {});
      var neu = art === "text"
        ? {
            id: naechsteKennung("text"), typ: "text",
            x: 36, y: format.hoehe / 2, b: 240, h: 16,
            stil: stile[0] || "fliesstext", inhalt: "Neuer Text",
          }
        : {
            id: naechsteKennung("bild"), typ: "bild",
            x: 36, y: format.hoehe / 2 - 160, b: 240, h: 160,
            slot: { art: "foto", nr: 1 }, fuellmodus: "cover",
          };
      schreibe(function (s) { s.elemente.push(neu); });
      setAuswahl(neu.id);
    }

    function loeschen() {
      var el = gewaehltesElement();
      if (!el || el.gesperrt) return;
      if (!window.confirm("Feld „" + el.id + "“ von dieser Seite entfernen?")) return;
      schreibe(function (s) {
        s.elemente = s.elemente.filter(function (x) { return x.id !== el.id; });
      });
      setAuswahl(null);
    }

    function verdoppeln() {
      var el = gewaehltesElement();
      if (!el) return;
      var neu = kopie(el);
      neu.id = naechsteKennung(String(el.typ));
      neu.x = el.x + 10; neu.y = el.y - 10;
      delete neu.gesperrt;
      schreibe(function (s) { s.elemente.push(neu); });
      setAuswahl(neu.id);
    }

    function schieben(richtung) {
      var el = gewaehltesElement();
      if (!el) return;
      schreibe(function (s) {
        var i = s.elemente.findIndex(function (x) { return x.id === el.id; });
        var j = i + richtung;
        if (i < 0 || j < 0 || j >= s.elemente.length) return;
        var t = s.elemente[i]; s.elemente[i] = s.elemente[j]; s.elemente[j] = t;
      });
    }

    // --- Die Eigenschaften des gewaehlten Feldes ---------------------------
    function eigenschaften() {
      var el = gewaehltesElement();
      if (!el) {
        return e("div", { key: "nichts", style: {
          fontSize: 12, color: CI.muted, lineHeight: 1.6,
        } }, "Kein Feld gewählt. Klick eines auf der Seite an — oder leg mit "
           + "„Textfeld“ beziehungsweise „Bildfeld“ ein neues an. Pfeiltasten "
           + "verschieben um einen Punkt, mit Umschalt um zehn; Alt beim "
           + "Ziehen schaltet das Einrasten aus.");
      }
      var stile = Object.keys((dokument.stil && dokument.stil.textstile) || {});
      var slot = el.slot || {};
      var zeilen = [
        e("div", { key: "kopf", style: {
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          gap: 8, marginBottom: 8,
        } }, [
          e("span", { key: "a", style: { fontSize: 12.5, fontWeight: 700, color: CI.ink } },
            el.id),
          e("span", { key: "b", style: { fontSize: 11, color: CI.muted } }, el.typ),
        ]),
        el.gesperrt ? e("div", { key: "sperr", style: {
          background: "#fff8e6", border: "1px solid #f0e0b8", borderRadius: 6,
          padding: "6px 9px", fontSize: 11.5, lineHeight: 1.5, marginBottom: 8,
        } }, "Dieses Feld ist in der Vorlage gesperrt: es trägt die Gestaltung "
           + "der Seite und lässt sich nicht verschieben oder löschen. Die "
           + "Sperre lässt sich unten aufheben.") : null,
        e("div", { key: "masse", style: { display: "flex", gap: 6, marginBottom: 8 } }, [
          zahlFeld("x", el.x, function (v) { setzeMasse(el.id, { x: v }); }),
          zahlFeld("y", el.y, function (v) { setzeMasse(el.id, { y: v }); }),
          zahlFeld("Breite", el.b, function (v) { setzeMasse(el.id, { b: Math.max(4, v) }); }),
          zahlFeld("Höhe", el.h, function (v) { setzeMasse(el.id, { h: Math.max(4, v) }); }),
        ]),
      ];

      if (typeof el.inhalt === "string") {
        zeilen.push(e("label", { key: "inhalt", style: { display: "block", marginBottom: 8 } }, [
          e("div", { key: "l", style: { fontSize: 10, color: CI.muted, marginBottom: 2 } },
            "Text  ·  {{…}} sind Platzhalter"),
          e("textarea", {
            key: "i", value: el.inhalt, rows: 3,
            onChange: function (ev) { setzeMasse(el.id, { inhalt: ev.target.value }); },
            style: {
              width: "100%", boxSizing: "border-box", padding: "6px 8px",
              border: "1px solid " + CI.border, borderRadius: 6, fontSize: 12,
              lineHeight: 1.45, resize: "vertical", fontFamily: "inherit",
            },
          }),
        ]));
      }

      if (stile.length && (el.typ === "text" || el.stil)) {
        zeilen.push(e("label", { key: "stil", style: { display: "block", marginBottom: 8 } }, [
          e("div", { key: "l", style: { fontSize: 10, color: CI.muted, marginBottom: 2 } }, "Textstil"),
          e("select", {
            key: "s", value: el.stil || "",
            onChange: function (ev) { setzeMasse(el.id, { stil: ev.target.value }); },
            style: {
              width: "100%", padding: "5px 7px", border: "1px solid " + CI.border,
              borderRadius: 6, fontSize: 12,
            },
          }, stile.map(function (n) { return e("option", { key: n, value: n }, n); })),
        ]));
      }

      if (el.typ === "bild") {
        zeilen.push(e("div", { key: "slot", style: { marginBottom: 8 } }, [
          e("div", { key: "l", style: { fontSize: 10, color: CI.muted, marginBottom: 2 } },
            "Welches Bild"),
          e("select", {
            key: "s", value: slot.art || "foto",
            onChange: function (ev) {
              var art = ev.target.value;
              var neu = { art: art };
              if (art === "foto" || art === "grundriss") neu.nr = slot.nr || 1;
              if (art === "foto_kategorie") { neu.kategorie = slot.kategorie || "wohnen"; neu.nr = slot.nr || 1; }
              if (art === "logo") neu.ton = slot.ton || "hell";
              setzeMasse(el.id, { slot: neu });
            },
            style: {
              width: "100%", padding: "5px 7px", border: "1px solid " + CI.border,
              borderRadius: 6, fontSize: 12, marginBottom: 6,
            },
          }, SLOT_ARTEN.map(function (a) {
            return e("option", { key: a[0], value: a[0] }, a[1]);
          })),
          (slot.art === "foto" || slot.art === "grundriss" || slot.art === "foto_kategorie")
            ? e("div", { key: "nr", style: { display: "flex", gap: 6 } }, [
                zahlFeld("Nummer", slot.nr || 1, function (v) {
                  var n = kopie(slot); n.nr = Math.max(1, Math.round(v));
                  setzeMasse(el.id, { slot: n });
                }),
                slot.art === "foto_kategorie" ? e("label", { key: "kat", style: { flex: "2 1 120px" } }, [
                  e("div", { key: "l", style: { fontSize: 10, color: CI.muted, marginBottom: 2 } }, "Kategorie"),
                  e("input", {
                    key: "i", type: "text", value: slot.kategorie || "",
                    onChange: function (ev) {
                      var n = kopie(slot); n.kategorie = ev.target.value;
                      setzeMasse(el.id, { slot: n });
                    },
                    style: {
                      width: "100%", boxSizing: "border-box", padding: "5px 7px",
                      border: "1px solid " + CI.border, borderRadius: 6, fontSize: 12,
                    },
                  }),
                ]) : null,
              ].filter(Boolean))
            : null,
          slot.art === "logo" ? e("select", {
            key: "ton", value: slot.ton || "hell",
            onChange: function (ev) {
              var n = kopie(slot); n.ton = ev.target.value;
              setzeMasse(el.id, { slot: n });
            },
            style: {
              width: "100%", padding: "5px 7px", border: "1px solid " + CI.border,
              borderRadius: 6, fontSize: 12,
            },
          }, [
            e("option", { key: "h", value: "hell" }, "für helle Flächen (Logo wie hochgeladen)"),
            e("option", { key: "d", value: "dunkel" }, "für dunkle Flächen (weiße Fassung)"),
          ]) : null,
          e("label", { key: "fuell", style: { display: "block", marginTop: 6 } }, [
            e("div", { key: "l", style: { fontSize: 10, color: CI.muted, marginBottom: 2 } }, "Füllung"),
            e("select", {
              key: "s", value: el.fuellmodus || "cover",
              onChange: function (ev) { setzeMasse(el.id, { fuellmodus: ev.target.value }); },
              style: {
                width: "100%", padding: "5px 7px", border: "1px solid " + CI.border,
                borderRadius: 6, fontSize: 12,
              },
            }, [
              e("option", { key: "c", value: "cover" }, "Rahmen füllen (beschneiden)"),
              e("option", { key: "n", value: "contain" }, "ganz zeigen (Rand bleibt frei)"),
            ]),
          ]),
        ]));
      }

      if (el.sichtbar_wenn) {
        zeilen.push(e("div", { key: "bed", style: {
          fontSize: 11, color: CI.muted, lineHeight: 1.5, marginBottom: 8,
          background: CI.bg, border: "1px solid " + CI.border, borderRadius: 6,
          padding: "6px 8px",
        } }, "Dieses Feld erscheint nur unter einer Bedingung: "
           + JSON.stringify(el.sichtbar_wenn)));
      }

      zeilen.push(e("label", { key: "gesperrt", style: {
        display: "flex", alignItems: "center", gap: 6, fontSize: 11.5,
        color: CI.muted, marginBottom: 10,
      } }, [
        e("input", {
          key: "c", type: "checkbox", checked: !!el.gesperrt,
          onChange: function (ev) { setzeMasse(el.id, { gesperrt: ev.target.checked || undefined }); },
        }),
        e("span", { key: "t" }, "gesperrt (nicht verschiebbar, nicht löschbar)"),
      ]));

      zeilen.push(e("div", { key: "knoepfe", style: { display: "flex", gap: 6, flexWrap: "wrap" } }, [
        knopf("Verdoppeln", verdoppeln, "zweit", false),
        knopf("Nach vorn", function () { schieben(1); }, "zweit", false),
        knopf("Nach hinten", function () { schieben(-1); }, "zweit", false),
        knopf("Löschen", loeschen, "gefahr", !!el.gesperrt),
      ]));
      return zeilen;
    }

    // --- Die Rahmen ueber der Flaeche --------------------------------------
    function rahmen() {
      return elemente().map(function (el) {
        var o = raeume.nachOben(el.x, el.y, el.b, el.h);
        var aktiv = el.id === auswahl;
        var griffe = aktiv && !el.gesperrt
          ? ["lo", "o", "ro", "r", "ru", "u", "lu", "l"].map(function (art) {
              var pos = {
                lo: { left: -4, top: -4 }, o: { left: "50%", top: -4, marginLeft: -4 },
                ro: { right: -4, top: -4 }, r: { right: -4, top: "50%", marginTop: -4 },
                ru: { right: -4, bottom: -4 }, u: { left: "50%", bottom: -4, marginLeft: -4 },
                lu: { left: -4, bottom: -4 }, l: { left: -4, top: "50%", marginTop: -4 },
              }[art];
              return e("div", {
                key: art,
                onPointerDown: function (ev) { beginnZiehen(ev, el, art); },
                style: Object.assign({
                  position: "absolute", width: 8, height: 8, background: "#fff",
                  border: "1.5px solid " + CI.blau, borderRadius: 2,
                  cursor: "pointer", zIndex: 3,
                }, pos),
              });
            })
          : [];
        return e("div", {
          key: el.id,
          onPointerDown: function (ev) { beginnZiehen(ev, el, "verschieben"); },
          onClick: function (ev) { ev.stopPropagation(); setAuswahl(el.id); },
          title: el.id + " · " + el.typ,
          style: {
            position: "absolute", left: o.left, top: o.top,
            width: o.width, height: o.height,
            border: "1px " + (aktiv ? "solid " + CI.blau : "dashed rgba(27,42,71,0.28)"),
            background: aktiv ? "rgba(27,42,71,0.06)" : "transparent",
            cursor: el.gesperrt ? "not-allowed" : "move",
            boxSizing: "border-box", zIndex: aktiv ? 2 : 1,
          },
        }, griffe);
      });
    }

    function fanglinien() {
      return hilfe.map(function (l, i) {
        var waage = l[0] === "y";
        return e("div", {
          key: "f" + i,
          style: Object.assign({
            position: "absolute", background: CI.gold, zIndex: 4, pointerEvents: "none",
          }, waage
            ? { left: 0, right: 0, top: (format.hoehe - l[1]) * massstab, height: 1 }
            : { top: 0, bottom: 0, left: l[1] * massstab, width: 1 }),
        });
      });
    }

    // --- Zusammenbauen -----------------------------------------------------
    return e("div", { style: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" } }, [
      e("div", { key: "flaeche", style: { flex: "0 0 auto" } }, [
        e("div", { key: "leiste", style: {
          display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8,
        } }, [
          e("select", {
            key: "seite", value: String(si),
            onChange: function (ev) { setAuswahl(null); props.setSeite(Number(ev.target.value)); },
            style: {
              padding: "6px 8px", border: "1px solid " + CI.border, borderRadius: 7,
              fontSize: 12, maxWidth: 230,
            },
          }, seiten.map(function (s, i) {
            return e("option", { key: s.id || i, value: String(i) },
                     (i + 1) + "  ·  " + (s.name || s.id));
          })),
          knopf("Textfeld", function () { hinzu("text"); }, "haupt", false),
          knopf("Bildfeld", function () { hinzu("bild"); }, "haupt", false),
          e("span", { key: "zoom", style: { display: "flex", gap: 4, alignItems: "center", marginLeft: 4 } }, [
            knopf("−", function () { setMassstab(Math.max(0.3, massstab - 0.12)); }, "zweit", false),
            e("span", { key: "z", style: { fontSize: 11.5, color: CI.muted, minWidth: 38, textAlign: "center" } },
              Math.round(massstab * 100) + " %"),
            knopf("+", function () { setMassstab(Math.min(1.6, massstab + 0.12)); }, "zweit", false),
          ]),
        ]),
        e("div", {
          key: "blatt", ref: flaeche,
          onClick: function () { setAuswahl(null); },
          style: {
            position: "relative", width: format.breite * massstab,
            height: format.hoehe * massstab, border: "1px solid " + CI.border,
            borderRadius: 4, background: "#fff", boxShadow: CI.shadow,
            userSelect: "none", touchAction: "none", overflow: "hidden",
          },
        }, [
          e("canvas", { key: "c", ref: leinwand, style: {
            position: "absolute", left: 0, top: 0, pointerEvents: "none",
          } }),
        ].concat(rahmen()).concat(fanglinien())),
        !props.bild ? e("div", { key: "leer", style: {
          fontSize: 11.5, color: CI.muted, marginTop: 6, lineHeight: 1.5, maxWidth: 420,
        } }, "Diese Seite entfällt bei den Beispieldaten — eine Bedingung trifft "
           + "nicht zu. Die Felder lassen sich trotzdem festlegen; im Exposé "
           + "erscheint die Seite, sobald die Angabe da ist.") : null,
      ]),
      e("div", { key: "rechts", style: {
        flex: "1 1 280px", minWidth: 260, background: CI.card,
        border: "1px solid " + CI.border, borderRadius: 10, padding: "14px 16px",
      } }, [
        e("div", { key: "t", style: {
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
          color: CI.muted, textTransform: "uppercase", marginBottom: 10,
        } }, "Feld"),
      ].concat(eigenschaften())),
    ]);
  }

  window.ImmoExposeBearbeiten = ExposeBearbeiten;
})();
