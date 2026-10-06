// ============================================================================
// Logo freistellen — den Hintergrund entfernen
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Fast jedes Logo, das ein Makler zur Hand hat, liegt als JPEG oder als PNG
// mit weisser Flaeche vor. Im Exposé steht es dann auf einer farbigen oder
// dunklen Seite als weisser Kasten. Am 06.10.2026 kam darum die Ansage:
// "das Firmenlogo soll man auch freistellen koennen (Hintergrund
// entfernen)".
//
// Das passiert hier, im Browser, bevor die Datei hochgeladen wird — ohne
// Dienst, ohne KI und ohne dass das Logo das Haus verlaesst. Gerechnet wird
// auf einem Canvas:
//
//   1. Die Hintergrundfarbe wird an den vier Ecken abgelesen.
//   2. Von den Raendern her wird jeder Bildpunkt entfernt, der dieser Farbe
//      nahe genug ist ("Rand"). Weiss INNERHALB eines Buchstabens bleibt
//      damit stehen — ein globaler Austausch wuerde jedes O aushoehlen.
//   3. Wer das doch will (Logo mit Rahmen, Stempel, Wasserzeichen), schaltet
//      auf "alle Flaechen dieser Farbe".
//   4. Am Rand des Entfernten laeuft die Deckkraft weich aus, sonst bleibt
//      ein heller Saum stehen.
//
// Entschieden wird nichts automatisch: der Nutzer sieht das Ergebnis auf
// einem Schachbrett, kann die Schwelle schieben und am Ende auch das
// Original nehmen. Das Original wird nie veraendert — es wird eine neue
// Datei erzeugt (CLAUDE.md: Originale bleiben unveraendert).
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };

  // Mehr als das braucht kein Logo, und es haelt die Rechnung schnell:
  // 1600 Punkte Breite sind im Expose etwa das Fuenffache der groessten
  // Stelle, an der ein Logo steht.
  var MAX_KANTE = 1600;

  /** Abstand zweier Farben, 0 (gleich) bis 441 (Schwarz zu Weiss). */
  function abstand(r1, g1, b1, r2, g2, b2) {
    var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /**
   * Die Hintergrundfarbe: der Mittelwert der vier Ecken, aber nur der
   * Ecken, die untereinander aehnlich sind. Ein Logo, dessen eine Ecke
   * schon Teil des Zeichens ist, verdirbt damit die Messung nicht.
   */
  function grundfarbe(daten, breite, hoehe) {
    var ecken = [[0, 0], [breite - 1, 0], [0, hoehe - 1], [breite - 1, hoehe - 1]];
    var punkte = ecken.map(function (p) {
      var i = (p[1] * breite + p[0]) * 4;
      return [daten[i], daten[i + 1], daten[i + 2], daten[i + 3]];
    });
    // Schon durchsichtige Ecken sagen am deutlichsten, was Hintergrund
    // ist — dann ist das Logo bereits freigestellt.
    var durchsichtig = punkte.filter(function (p) { return p[3] < 16; });
    if (durchsichtig.length >= 3) return null;
    var beste = null;
    for (var i = 0; i < punkte.length; i++) {
      var nahe = punkte.filter(function (q) {
        return abstand(punkte[i][0], punkte[i][1], punkte[i][2], q[0], q[1], q[2]) < 40;
      });
      if (!beste || nahe.length > beste.nahe.length) beste = { nahe: nahe };
    }
    var n = beste.nahe.length;
    return [
      Math.round(beste.nahe.reduce(function (a, p) { return a + p[0]; }, 0) / n),
      Math.round(beste.nahe.reduce(function (a, p) { return a + p[1]; }, 0) / n),
      Math.round(beste.nahe.reduce(function (a, p) { return a + p[2]; }, 0) / n),
    ];
  }

  /**
   * Entfernt den Hintergrund. Gibt die Zahl der entfernten Bildpunkte
   * zurueck, damit die Ansicht sagen kann, ob ueberhaupt etwas passiert
   * ist — eine Schaltflaeche, die nichts tut, aber "fertig" meldet, ist
   * schlimmer als eine, die nichts anbietet.
   */
  function freistellen(ctx, breite, hoehe, einstellung) {
    var bild = ctx.getImageData(0, 0, breite, hoehe);
    var d = bild.data;
    var grund = einstellung.farbe || grundfarbe(d, breite, hoehe);
    if (!grund) return { entfernt: 0, farbe: null };
    var tol = einstellung.toleranz;
    var weich = tol * 1.8 + 12;        // bis hierher laeuft die Kante aus
    var entfernt = 0;

    function setze(i, deckkraft) {
      if (deckkraft <= 0) { if (d[i + 3] !== 0) entfernt++; d[i + 3] = 0; return; }
      var neu = Math.round(d[i + 3] * deckkraft);
      if (neu < d[i + 3]) { d[i + 3] = neu; entfernt++; }
    }

    function anteil(i) {
      // 0 = ganz weg, 1 = bleibt. Dazwischen die weiche Kante.
      var a = abstand(d[i], d[i + 1], d[i + 2], grund[0], grund[1], grund[2]);
      if (a <= tol) return 0;
      if (a >= weich) return 1;
      return (a - tol) / (weich - tol);
    }

    if (einstellung.modus === "alle") {
      for (var i = 0; i < d.length; i += 4) setze(i, anteil(i));
      // getImageData gibt eine Kopie: ohne dieses Zurueckschreiben waere
      // die Rechnung umsonst und das Canvas unveraendert.
      ctx.putImageData(bild, 0, 0);
      return { entfernt: entfernt, farbe: grund };
    }

    // Von den Raendern her fluten. Die Schlange haelt Indizes der
    // Bildpunkte, nicht Koordinaten — das spart bei einem grossen Logo
    // Hunderttausende kleiner Objekte.
    var gesehen = new Uint8Array(breite * hoehe);
    var schlange = new Int32Array(breite * hoehe);
    var kopf = 0, ende = 0;
    var einreihen = function (x, y) {
      if (x < 0 || y < 0 || x >= breite || y >= hoehe) return;
      var p = y * breite + x;
      if (gesehen[p]) return;
      gesehen[p] = 1;
      schlange[ende++] = p;
    };
    for (var x = 0; x < breite; x++) { einreihen(x, 0); einreihen(x, hoehe - 1); }
    for (var y = 0; y < hoehe; y++) { einreihen(0, y); einreihen(breite - 1, y); }

    while (kopf < ende) {
      var p = schlange[kopf++];
      var i2 = p * 4;
      var teil = anteil(i2);
      if (teil >= 1 && d[i2 + 3] > 16) continue;   // hier beginnt das Zeichen
      setze(i2, teil);
      if (teil > 0) continue;                      // weiche Kante: nicht weiter
      var px = p % breite, py = (p - px) / breite;
      einreihen(px + 1, py); einreihen(px - 1, py);
      einreihen(px, py + 1); einreihen(px, py - 1);
    }
    ctx.putImageData(bild, 0, 0);
    return { entfernt: entfernt, farbe: grund };
  }

  /** Datei -> Bildelement. */
  function bildLaden(datei) {
    return new Promise(function (fertig, scheitern) {
      var url = URL.createObjectURL(datei);
      var bild = new Image();
      bild.onload = function () { fertig({ bild: bild, url: url }); };
      bild.onerror = function () {
        URL.revokeObjectURL(url);
        scheitern(new Error("Die Datei lässt sich nicht als Bild lesen."));
      };
      bild.src = url;
    });
  }

  function hex(f) {
    if (!f) return "";
    return "#" + f.map(function (v) {
      return ("0" + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
    }).join("");
  }

  // --- Die Ansicht --------------------------------------------------------

  function Dialog(props) {
    var R = React;
    var e = R.createElement;
    var tolZ = R.useState(32);
    var toleranz = tolZ[0], setToleranz = tolZ[1];
    var modusZ = R.useState("rand");
    var modus = modusZ[0], setModus = modusZ[1];
    var standZ = R.useState({ stand: "laedt", text: "", entfernt: 0, farbe: null });
    var stand = standZ[0], setStand = standZ[1];
    var leinwandZ = R.useState(null);
    var leinwand = leinwandZ[0], setLeinwand = leinwandZ[1];

    // Das Bild wird einmal geladen und bleibt liegen; gerechnet wird bei
    // jedem Schieben neu, aber immer vom Original aus.
    var quelleZ = R.useState(null);
    var quelle = quelleZ[0], setQuelle = quelleZ[1];

    R.useEffect(function () {
      var weg = false;
      bildLaden(props.datei).then(function (geladen) {
        if (weg) { URL.revokeObjectURL(geladen.url); return; }
        setQuelle(geladen);
      }, function (f) {
        if (!weg) setStand({ stand: "fehler", text: f.message || String(f), entfernt: 0, farbe: null });
      });
      return function () { weg = true; };
    }, []);

    R.useEffect(function () {
      if (!quelle || !leinwand) return;
      var bild = quelle.bild;
      var bb = bild.naturalWidth || bild.width;
      var hh = bild.naturalHeight || bild.height;
      if (!bb || !hh) {
        setStand({ stand: "fehler", text: "Das Bild hat keine Größe — ist es eine SVG-Datei ohne Maße?", entfernt: 0, farbe: null });
        return;
      }
      var f = Math.min(1, MAX_KANTE / Math.max(bb, hh));
      var zb = Math.max(1, Math.round(bb * f)), zh = Math.max(1, Math.round(hh * f));
      leinwand.width = zb;
      leinwand.height = zh;
      var ctx = leinwand.getContext("2d");
      ctx.clearRect(0, 0, zb, zh);
      ctx.drawImage(bild, 0, 0, zb, zh);
      var ergebnis;
      try {
        ergebnis = freistellen(ctx, zb, zh, { toleranz: toleranz, modus: modus });
      } catch (fehler) {
        setStand({ stand: "fehler", text: fehler.message || String(fehler), entfernt: 0, farbe: null });
        return;
      }
      setStand({
        stand: "da",
        text: "",
        entfernt: ergebnis.entfernt,
        farbe: ergebnis.farbe,
      });
    }, [quelle, leinwand, toleranz, modus]);

    // Das Ergebnis wird nicht aus dem Canvas gelesen, das die Vorschau
    // zeigt: dort steht eine verkleinerte Fassung. Fuer die Datei wird in
    // voller Groesse neu gerechnet — bis MAX_KANTE, damit ein Foto als
    // Logo nicht vier Megabyte in den Eimer legt.
    function uebernehmen() {
      if (!quelle) return;
      var bild = quelle.bild;
      var bb = bild.naturalWidth || bild.width, hh = bild.naturalHeight || bild.height;
      var f = Math.min(1, MAX_KANTE / Math.max(bb, hh));
      var zb = Math.max(1, Math.round(bb * f)), zh = Math.max(1, Math.round(hh * f));
      var c = document.createElement("canvas");
      c.width = zb; c.height = zh;
      var ctx = c.getContext("2d");
      ctx.drawImage(bild, 0, 0, zb, zh);
      freistellen(ctx, zb, zh, { toleranz: toleranz, modus: modus });
      var fertig = function (blob) {
        props.onFertig(blob ? { blob: blob, endung: "png", freigestellt: true } : null);
      };
      if (c.toBlob) c.toBlob(fertig, "image/png");
      else fertig(null);
    }

    var knopf = function (art) {
      return {
        padding: "9px 15px", borderRadius: 6, fontSize: 13, fontWeight: 600,
        fontFamily: "inherit", cursor: "pointer",
        border: "1px solid " + (art === "haupt" ? CI.gold : CI.border),
        background: art === "haupt" ? CI.gold : "#fff",
        color: art === "haupt" ? CI.blau : CI.blau,
      };
    };
    var schachbrett = "linear-gradient(45deg,#e9e9e9 25%,transparent 25%,transparent 75%,#e9e9e9 75%),"
      + "linear-gradient(45deg,#e9e9e9 25%,transparent 25%,transparent 75%,#e9e9e9 75%)";

    return e("div", {
      style: {
        position: "fixed", inset: 0, zIndex: 9100, background: "rgba(27,42,71,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      },
      onClick: function (ev) { if (ev.target === ev.currentTarget) props.onFertig(null); },
    }, e("div", {
      style: {
        background: "#fff", borderRadius: 10, maxWidth: 560, width: "100%",
        padding: 22, boxShadow: "0 12px 40px rgba(0,0,0,.25)",
        borderTop: "4px solid " + CI.gold, color: CI.ink,
      },
    }, [
      e("div", { key: "t", style: { fontSize: 18, fontWeight: 700, marginBottom: 6 } },
        "Logo freistellen"),
      e("div", { key: "u", style: { fontSize: 13, color: CI.muted, marginBottom: 14, lineHeight: 1.5 } },
        "Der Hintergrund wird durchsichtig gemacht, damit das Logo auch auf "
        + "farbigen und dunklen Exposé-Seiten steht. Das Original bleibt "
        + "unverändert — es entsteht eine neue PNG-Datei."),
      e("div", {
        key: "v",
        style: {
          background: schachbrett, backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 8px 8px", border: "1px solid " + CI.border,
          borderRadius: 6, padding: 10, textAlign: "center", marginBottom: 12,
        },
      }, e("canvas", {
        ref: function (k) { if (k && k !== leinwand) setLeinwand(k); },
        "data-immo-freistellen": "1",
        style: { maxWidth: "100%", maxHeight: 220, display: "inline-block" },
      })),
      stand.stand === "fehler"
        ? e("div", { key: "f", style: { fontSize: 13, color: CI.danger, marginBottom: 12 } },
            stand.text)
        : null,
      e("div", { key: "r", style: { display: "flex", gap: 10, alignItems: "center", marginBottom: 10 } }, [
        e("label", { key: "l", style: { fontSize: 12, color: CI.muted, minWidth: 74 } }, "Schwelle"),
        e("input", {
          key: "i", type: "range", min: 4, max: 140, step: 2, value: toleranz,
          "data-immo-freistellen-toleranz": "1",
          onChange: function (ev) { setToleranz(Number(ev.target.value)); },
          style: { flex: "1 1 auto" },
        }),
        e("span", { key: "w", style: { fontSize: 12, color: CI.ink, minWidth: 28, textAlign: "right" } },
          String(toleranz)),
      ]),
      e("div", { key: "m", style: { display: "flex", gap: 14, alignItems: "center", marginBottom: 6, flexWrap: "wrap" } },
        [["rand", "nur vom Rand her"], ["alle", "alle Flächen dieser Farbe"]].map(function (paar) {
          return e("label", {
            key: paar[0],
            style: { fontSize: 12.5, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" },
          }, [
            e("input", {
              key: "r", type: "radio", name: "immo-freistellen-modus",
              "data-immo-freistellen-modus": paar[0],
              checked: modus === paar[0],
              onChange: function () { setModus(paar[0]); },
            }),
            paar[1],
          ]);
        })),
      e("div", { key: "h", style: { fontSize: 11.5, color: CI.muted, marginBottom: 16, lineHeight: 1.5 } },
        "„Nur vom Rand her" + "“" + " lässt Weiß innerhalb der Buchstaben stehen. "
        + (stand.farbe
            ? "Erkannte Hintergrundfarbe: " + hex(stand.farbe) + ", "
              + stand.entfernt + " Bildpunkte entfernt."
            : "Dieses Bild hat an den Ecken schon einen durchsichtigen Hintergrund.")),
      e("div", { key: "k", style: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" } }, [
        e("button", {
          key: "ab", type: "button", style: knopf("zweit"),
          onClick: function () { props.onFertig("abbruch"); },
        }, "Abbrechen"),
        e("button", {
          key: "or", type: "button", style: knopf("zweit"),
          "data-immo-freistellen-original": "1",
          onClick: function () { props.onFertig(null); },
        }, "Original hochladen"),
        e("button", {
          key: "ue", type: "button", style: knopf("haupt"),
          disabled: stand.stand !== "da" || !stand.entfernt,
          "data-immo-freistellen-uebernehmen": "1",
          onClick: uebernehmen,
        }, "Freigestellt hochladen"),
      ]),
    ]));
  }

  var wurzel = null, kasten = null;

  /**
   * Zeigt den Dialog. Loest auf mit:
   *   { blob, endung, freigestellt: true }  — die freigestellte Datei
   *   null                                  — das Original nehmen
   *   "abbruch"                             — nichts hochladen
   */
  function oeffnen(datei) {
    return new Promise(function (fertig) {
      if (typeof window.ReactDOM === "undefined" || !window.ReactDOM.createRoot
          || typeof document === "undefined") {
        fertig(null);                      // ohne Oberflaeche: Original
        return;
      }
      if (!kasten) {
        kasten = document.createElement("div");
        kasten.id = "immo-logo-freistellen";
        document.body.appendChild(kasten);
        wurzel = window.ReactDOM.createRoot(kasten);
      }
      var schliessen = function (antwort) {
        wurzel.render(null);
        fertig(antwort);
      };
      wurzel.render(React.createElement(Dialog, { datei: datei, onFertig: schliessen }));
    });
  }

  window.ImmoLogoFreistellen = {
    oeffnen: oeffnen,
    // Die Rechnung selbst, damit sie geprueft werden kann, ohne einen
    // Dialog zu oeffnen.
    freistellen: freistellen,
    grundfarbe: grundfarbe,
  };
})();
