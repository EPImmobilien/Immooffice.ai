// ============================================================================
// Exposé — die Zeichenschritte auf ein Canvas malen
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Der Renderer baut keine PDF-Operatoren, sondern eine Liste von Schritten.
// packages/expose-renderer/src/schritte.ts nennt dafuer drei Gruende; der
// zweite ist dieser: "Dieselbe Liste kann die Vorschau im Browser auf ein
// Canvas malen, ohne ein PDF zu bauen."
//
// Genau das passiert hier. Warum nicht einfach das PDF im Rahmen zeigen —
// das tut die Vorschau ja schon: weil man in ein PDF nicht hineinfassen
// kann. Der Editor muss wissen, wo ein Rahmen liegt, ihn anfassen und
// verschieben koennen, und dafuer braucht er dieselbe Seite als Flaeche,
// auf der er selbst rechnet.
//
// Gemalt wird aus DERSELBEN Schrittliste, die auch ins PDF geht. Es gibt
// also keine zweite Fassung der Seite, die auseinanderlaufen koennte —
// nur zwei Ausgaenge desselben Weges.
//
// Masse in Punkt, Ursprung unten links, Farben als [r,g,b,a] in 0..1.
// Das Canvas rechnet andersherum (Ursprung oben links, y nach unten);
// die Umrechnung steht an genau einer Stelle, in zeichne().
// ============================================================================
(function () {
  "use strict";

  /** [r,g,b,a] in 0..1 -> CSS. */
  function css(f) {
    if (!f) return null;
    var r = Math.round(f[0] * 255), g = Math.round(f[1] * 255), b = Math.round(f[2] * 255);
    var a = f.length > 3 ? f[3] : 1;
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  /** Die Schriften als Webschriften anmelden, damit das Canvas sie kennt. */
  var angemeldet = new Set();
  function schriftAnmelden(name, bytes) {
    if (angemeldet.has(name)) return Promise.resolve(name);
    if (typeof FontFace !== "function" || !document.fonts) return Promise.resolve(null);
    var f = new FontFace("ImmoX-" + name, bytes);
    return f.load().then(function (geladen) {
      document.fonts.add(geladen);
      angemeldet.add(name);
      return name;
    }).catch(function () { return null; });
  }

  function familie(schnitt) { return '"ImmoX-' + schnitt + '"'; }

  /** Einen Pfad aus Pfadschritten in den aktuellen Kontext legen. */
  function pfadLegen(ctx, schritte) {
    ctx.beginPath();
    for (var i = 0; i < schritte.length; i++) {
      var s = schritte[i];
      switch (s[0]) {
        case "moveTo": ctx.moveTo(s[1], s[2]); break;
        case "lineTo": ctx.lineTo(s[1], s[2]); break;
        case "curveTo": ctx.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]); break;
        case "close": ctx.closePath(); break;
        case "rect": ctx.rect(s[1], s[2], s[3], s[4]); break;
        case "roundRect":
          // Von Hand, weil roundRect() nicht ueberall da ist.
          runder(ctx, s[1], s[2], s[3], s[4], s[5]);
          break;
        case "circle": ctx.moveTo(s[1] + s[3], s[2]); ctx.arc(s[1], s[2], s[3], 0, Math.PI * 2); break;
        case "ellipse": {
          var mx = (s[1] + s[3]) / 2, my = (s[2] + s[4]) / 2;
          var rx = Math.abs(s[3] - s[1]) / 2, ry = Math.abs(s[4] - s[2]) / 2;
          ctx.moveTo(mx + rx, my);
          ctx.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2);
          break;
        }
      }
    }
  }

  function runder(ctx, x, y, b, h, r) {
    var rr = Math.min(r, Math.abs(b) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + b - rr, y);
    ctx.quadraticCurveTo(x + b, y, x + b, y + rr);
    ctx.lineTo(x + b, y + h - rr);
    ctx.quadraticCurveTo(x + b, y + h, x + b - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  /** Text: das Canvas setzt von oben, die Seite von unten. Also kurz drehen. */
  function text(ctx, s) {
    if (!s.farbe) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, -1);
    ctx.fillStyle = css(s.farbe);
    ctx.font = s.groesse + "px " + familie(s.schnitt) + ", serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    if (s.sperrung && "letterSpacing" in ctx) {
      ctx.letterSpacing = s.sperrung + "px";
      ctx.fillText(s.text, 0, 0);
      ctx.letterSpacing = "0px";
    } else if (s.sperrung) {
      // Zeichen fuer Zeichen, wenn der Browser keine Sperrung kann.
      var x = 0;
      for (var i = 0; i < s.text.length; i++) {
        var z = s.text[i];
        ctx.fillText(z, x, 0);
        x += ctx.measureText(z).width + s.sperrung;
      }
    } else {
      ctx.fillText(s.text, 0, 0);
    }
    ctx.restore();
  }

  function fuellenUndStreichen(ctx, s) {
    if (s.fuell) { ctx.fillStyle = css(s.fuell); ctx.fill(); }
    if (s.strich) {
      ctx.strokeStyle = css(s.strich);
      ctx.lineWidth = s.linienbreite || 0.6;
      ctx.stroke();
    }
  }

  function bild(ctx, s, bilder) {
    var quelle = bilder && bilder.get ? bilder.get(s.quelle) : null;
    if (!quelle) {
      // Kein Bild da: eine ruhige Flaeche, damit der Rahmen sichtbar
      // bleibt. Der Renderer setzt im PDF an dieser Stelle denselben
      // Platzhalter; hier faerbt ihn der Editor etwas kraeftiger, damit
      // man den leeren Rahmen findet.
      ctx.fillStyle = "rgba(0,0,0,0.055)";
      ctx.fillRect(s.x, s.y, s.b, s.h);
      return;
    }
    var bb = quelle.naturalWidth || quelle.width || 1;
    var hh = quelle.naturalHeight || quelle.height || 1;
    var skala = s.fuellmodus === "contain"
      ? Math.min(s.b / bb, s.h / hh) : Math.max(s.b / bb, s.h / hh);
    var zb = bb * skala, zh = hh * skala;
    var zx = s.x + (s.b - zb) / 2, zy = s.y + (s.h - zh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x, s.y, s.b, s.h);
    ctx.clip();
    ctx.translate(zx, zy + zh);
    ctx.scale(1, -1);
    try { ctx.drawImage(quelle, 0, 0, zb, zh); } catch (e) { /* kaputtes Bild */ }
    ctx.restore();
  }

  function qr(ctx, s, qrErzeuger) {
    if (!qrErzeuger) return;
    var gitter;
    try { gitter = qrErzeuger(s.inhalt); } catch (e) { return; }
    if (!gitter || !gitter.length) return;
    var n = gitter.length;
    var w = Math.min(s.b, s.h) / n;
    ctx.fillStyle = css(s.farbe) || "#000";
    for (var z = 0; z < n; z++) {
      for (var sp = 0; sp < n; sp++) {
        if (!gitter[z][sp]) continue;
        // Die Zeilen des Gitters laufen von oben; die Seite rechnet von
        // unten. Darum von hinten durchzaehlen.
        ctx.fillRect(s.x + sp * w, s.y + (n - 1 - z) * w, w + 0.2, w + 0.2);
      }
    }
  }

  function verlauf(ctx, s) {
    var g = ctx.createLinearGradient(s.x0, s.y0, s.x1, s.y1);
    var stellen = s.stellen || null;
    for (var i = 0; i < s.farben.length; i++) {
      var p = stellen ? stellen[i] : (s.farben.length === 1 ? 0 : i / (s.farben.length - 1));
      g.addColorStop(Math.max(0, Math.min(1, p)), css(s.farben[i]));
    }
    ctx.fillStyle = g;
    // Ein Verlauf fuellt, was gerade beschnitten ist — im Renderer ist das
    // immer ein Rahmen, der vorher als Maske gesetzt wurde.
    ctx.fillRect(Math.min(s.x0, s.x1) - 2000, Math.min(s.y0, s.y1) - 2000, 4000, 4000);
  }

  function schritt(ctx, s, opt) {
    ctx.save();
    var m = s.matrix || [1, 0, 0, 1, 0, 0];
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    switch (s.art) {
      case "text": text(ctx, s); break;
      case "rechteck":
        ctx.beginPath(); ctx.rect(s.x, s.y, s.b, s.h); fuellenUndStreichen(ctx, s); break;
      case "rundrechteck":
        ctx.beginPath(); runder(ctx, s.x, s.y, s.b, s.h, s.r); fuellenUndStreichen(ctx, s); break;
      case "linie":
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
        ctx.strokeStyle = css(s.strich) || "#000";
        ctx.lineWidth = s.linienbreite || 0.6;
        if (s.strichmuster && ctx.setLineDash) ctx.setLineDash(s.strichmuster);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        break;
      case "kreis":
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); fuellenUndStreichen(ctx, s); break;
      case "ellipse":
        ctx.beginPath(); pfadLegen(ctx, [["ellipse", s.x1, s.y1, s.x2, s.y2]]);
        fuellenUndStreichen(ctx, s); break;
      case "pfad":
        pfadLegen(ctx, s.schritte); fuellenUndStreichen(ctx, s); break;
      case "verlauf": verlauf(ctx, s); break;
      case "radialverlauf": {
        var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        for (var i = 0; i < s.farben.length; i++) {
          var p = s.stellen ? s.stellen[i]
            : (s.farben.length === 1 ? 0 : i / (s.farben.length - 1));
          g.addColorStop(Math.max(0, Math.min(1, p)), css(s.farben[i]));
        }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "bild": bild(ctx, s, opt.bilder); break;
      case "qr": qr(ctx, s, opt.qr); break;
      case "gruppe":
        if (s.maske) { pfadLegen(ctx, s.maske); ctx.clip(); }
        for (var k = 0; k < s.schritte.length; k++) schritt(ctx, s.schritte[k], opt);
        break;
      case "maske":
        // Flache Liste: eine Maske gilt bis zum Ende der Seite. Im
        // verschachtelten Fall kommt sie als "gruppe" und ist sauber
        // begrenzt; hier bleibt nur, sie zu setzen.
        pfadLegen(ctx, s.schritte); ctx.clip();
        break;
      default: break;
    }
    ctx.restore();
  }

  /**
   * Eine Seite auf ein Canvas malen.
   *
   * `opt.massstab` ist Bildpunkte je Punkt der Seite (1 = Originalgroesse).
   * `opt.bilder` ist eine Map von Bildquelle auf ein geladenes Bild,
   * `opt.qr` eine Funktion, die aus einem Text ein Modulgitter macht.
   */
  function zeichne(canvas, seitenbild, opt) {
    opt = opt || {};
    var massstab = opt.massstab || 1;
    var dpr = (window.devicePixelRatio || 1);
    var breite = seitenbild.breite, hoehe = seitenbild.hoehe;
    canvas.width = Math.round(breite * massstab * dpr);
    canvas.height = Math.round(hoehe * massstab * dpr);
    canvas.style.width = (breite * massstab) + "px";
    canvas.style.height = (hoehe * massstab) + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Hier und nur hier wird aus "von unten" ein "von oben".
    ctx.setTransform(massstab * dpr, 0, 0, -massstab * dpr, 0, hoehe * massstab * dpr);
    for (var i = 0; i < seitenbild.schritte.length; i++) {
      schritt(ctx, seitenbild.schritte[i], opt);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  window.ImmoExposeLeinwand = {
    zeichne: zeichne, schriftAnmelden: schriftAnmelden, familie: familie, css: css,
  };
})();
