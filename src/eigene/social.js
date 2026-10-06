// ============================================================================
// Social-Media-Beiträge aus dem Objekt — Baukasten statt Bildbearbeitung
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_56), Handarbeit, klassische Laufzeit.
//
// Der Betreiber hat am 06.10.2026 drei Entwurfssätze geliefert. Sie liegen
// als Vorlagen in derselben Sprache wie die Exposés (`art = 'social'`) und
// werden von demselben Renderer gezeichnet. Diese Tafel ist nur das
// Bedienteil davor: Objekt wählen, Handschrift wählen, ansehen, speichern.
//
// Drei Dinge, die hier keine Gestaltungsfrage sind:
//
//   * Es wird NICHTS erfunden. Jede Zahl auf dem Bild kommt aus dem Objekt;
//     fehlt eine, bleibt die Stelle leer und der Renderer meldet es. Ein
//     Beitrag, der eine Wohnfläche dazudichtet, wäre Werbung mit falschen
//     Angaben — CLAUDE.md: keine erfundenen Objektdaten.
//   * Es kostet keine Credits. Hier entsteht nichts durch KI, sondern
//     dasselbe Dokument in anderem Format. CLAUDE.md zählt den Export
//     bestehender Inhalte ausdrücklich zu den kostenfreien Aktionen.
//   * Die Bilder tragen die Marke des Mandanten, nicht die der Plattform:
//     Farben, Logo und Firmenname kommen aus seinen Stammdaten.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", muted: "#7A828C", danger: "#c0392b", success: "#1e7e34",
  };
  var E = React.createElement;

  // 1080 x 1350 Bildpunkte bei 540 x 675 Punkten Seite — zwei Bildpunkte je
  // Punkt. Instagram rechnet in Pixeln, der Baukasten in Punkten.
  var EXPORT = 2;

  function bildLaden(url) {
    return new Promise(function (fertig) {
      if (!url) return fertig(null);
      var b = new Image();
      b.crossOrigin = "anonymous";
      b.onload = function () { fertig(b); };
      b.onerror = function () { fertig(null); };
      b.src = url;
    });
  }

  /**
   * Objekt, Firma, Ansprechpartner und Bilder holen.
   *
   * Dieselben Quellen wie `expose-pdf-erzeugen` — und das ist keine
   * Bequemlichkeit: stuenden hier andere, zeigte der Beitrag etwas anderes
   * als das Exposé desselben Objekts.
   *
   * `quellen.bilder` bildet einen Bildslot auf eine KENNUNG ab (den
   * Storage-Pfad), und die Leinwand bildet dieselbe Kennung auf das
   * geladene Bild ab. Zwei Schritte, weil der Renderer selbst nie ein Bild
   * anfasst — er rechnet nur, wohin es gehoert.
   */
  async function stoffHolen(immobilieId) {
    var sb = window._sb;
    var o = await sb.from("immobilien").select("*").eq("id", immobilieId).maybeSingle();
    if (o.error) throw o.error;
    if (!o.data) throw new Error("Das Objekt wurde nicht gefunden.");
    var im = o.data;

    var f = await sb.from("firma_stammdaten").select("*")
      .eq("aktiv", true).order("sortierung").limit(1).maybeSingle();
    var firma = f.data || {};
    var ap = null;
    if (im.zustaendig_id) {
      var p = await sb.from("profiles").select("*").eq("id", im.zustaendig_id).maybeSingle();
      ap = p.data || null;
    }

    // --- Bilder ------------------------------------------------------------
    var bildWerte = {};
    var bilder = new Map();

    var d = await sb.from("immobilie_datei")
      .select("id, storage_path, titel, kategorie, doktyp, oeffentlich, "
              + "speicher_typ, expose_ausschliessen, sortierung")
      .eq("immobilie_id", immobilieId).order("sortierung");
    var fotos = (d.data || []).filter(function (x) {
      return x.kategorie === "foto" && x.oeffentlich && x.doktyp !== "Energieskala"
        && x.speicher_typ === "supabase" && x.expose_ausschliessen !== true;
    });
    var titel = (im.expose_titelbild_id
      && fotos.filter(function (x) { return x.id === im.expose_titelbild_id; })[0])
      || fotos[0] || null;
    if (titel && titel.storage_path) {
      // Die Web-Fassung zuerst: sie ist fuer genau diesen Zweck da und
      // schon klein. Gibt es sie nicht, tut es das Original.
      var web = titel.storage_path.replace(/\.[^/.]+$/, "") + "_web.jpg";
      var geladen = null;
      for (var i = 0; i < 2 && !geladen; i++) {
        var pfad = i === 0 ? web : titel.storage_path;
        try {
          var sig = await sb.storage.from("immobilie-dateien")
            .createSignedUrl(pfad, 600);
          if (sig.data && sig.data.signedUrl) geladen = await bildLaden(sig.data.signedUrl);
        } catch (e) { /* naechster Versuch */ }
      }
      if (geladen) {
        bildWerte["objekt.hauptbild_url"] = titel.storage_path;
        bilder.set(titel.storage_path, geladen);
      }
    }

    if (firma.logo_pfad) {
      try {
        var lsig = await sb.storage.from("branding-assets")
          .createSignedUrl(String(firma.logo_pfad), 600);
        var logo = lsig.data && lsig.data.signedUrl
          ? await bildLaden(lsig.data.signedUrl) : null;
        if (logo) {
          // Dieselbe Datei fuer beide Toene: die Vorlagen fordern je nach
          // Grund "hell" oder "dunkel" an, und ein Mandant hinterlegt eine
          // Datei. Die eigens weiss gerechnete Fassung baut nur die Edge
          // Function; hier zaehlt, dass ueberhaupt das richtige Zeichen steht.
          bilder.set("logo", logo);
          bildWerte["firma.logo.hell"] = "logo";
          bildWerte["firma.logo.dunkel"] = "logo";
        }
      } catch (e) { /* ohne Logo steht der Markenname da */ }
    }

    var daten = window.ImmoExpose.aufbereiten({
      immobilie: im, firma: firma, ansprechpartner: ap || {},
      bilder: bildWerte,
      annahmen: { notar_prozent: 2.0, zinssatz: 3.9, tilgung: 2.0,
                  eigenkapital_prozent: 20 },
    });
    return { daten: daten, immobilie: im, firma: firma, bilder: bilder };
  }

  function dateiname(immobilie, vorlage, seite) {
    var teile = [
      String(immobilie.immo_nr || immobilie.id).slice(0, 24),
      String(vorlage.basis || "vorlage"),
      String(seite.id || "seite"),
    ];
    return teile.join("-").replace(/[^A-Za-z0-9_-]+/g, "-") + ".png";
  }

  function ImmoSocial(props) {
    var vZ = React.useState([]), vorlagen = vZ[0], setzeVorlagen = vZ[1];
    var oZ = React.useState([]), objekte = oZ[0], setzeObjekte = oZ[1];
    var wZ = React.useState(""), wahlObjekt = wZ[0], setzeWahlObjekt = wZ[1];
    var tZ = React.useState(""), wahlVorlage = tZ[0], setzeWahlVorlage = tZ[1];
    var sZ = React.useState(null), seiten = sZ[0], setzeSeiten = sZ[1];
    var lZ = React.useState(false), laedt = lZ[0], setzeLaedt = lZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    var hZ = React.useState([]), hinweise = hZ[0], setzeHinweise = hZ[1];
    var kZ = React.useState(null), stoff = kZ[0], setzeStoff = kZ[1];

    React.useEffect(function () {
      var weg = false;
      Promise.all([
        window._sb.from("expose_vorlagen")
          .select("id, name, beschreibung, basis, dokument, mandant_id")
          .eq("art", "social").eq("archiviert", false)
          .order("mandant_id", { nullsFirst: false }).order("name"),
        window._sb.from("immobilien")
          .select("id, bezeichnung, immo_nr, ort, vermarktungsstatus")
          .order("created_at", { ascending: false }).limit(200),
      ]).then(function (r) {
        if (weg) return;
        setzeVorlagen((r[0].data) || []);
        setzeObjekte((r[1].data) || []);
        if ((r[0].data || []).length) setzeWahlVorlage(r[0].data[0].id);
      }).catch(function (f) { setzeFehler(f.message || String(f)); });
      return function () { weg = true; };
    }, []);

    async function zeichnen() {
      setzeLaedt(true); setzeFehler(""); setzeSeiten(null); setzeHinweise([]);
      try {
        var vorlage = vorlagen.filter(function (v) { return v.id === wahlVorlage; })[0];
        if (!vorlage) throw new Error("Bitte eine Vorlage wählen.");
        if (!wahlObjekt) throw new Error("Bitte ein Objekt wählen.");
        if (!window.ImmoExpose || !window.ImmoExposeWerkzeug) {
          throw new Error("Der Renderer ist nicht geladen.");
        }
        var d = await stoffHolen(wahlObjekt);
        var dok = vorlage.dokument;
        var namen = window.ImmoExposeWerkzeug.schnitteIn(dok);
        var schriften = await window.ImmoExposeWerkzeug.schriftenLaden(namen);
        var erg = window.ImmoExpose.rendern({
          vorlage: dok, daten: d.daten, schriften: schriften,
          marke: {
            primaer: d.firma.ci_primaer || undefined,
            akzent: d.firma.ci_akzent || undefined,
          },
        });
        setzeSeiten(erg.seiten);
        setzeStoff({ bilder: d.bilder, vorlage: vorlage, immobilie: d.immobilie });
        // Fehlende Werte sind keine Panne, sondern eine Ansage: was im
        // Objekt nicht gepflegt ist, steht auch nicht auf dem Bild.
        var gezaehlt = {};
        (erg.warnungen || []).forEach(function (w) {
          gezaehlt[w.art] = (gezaehlt[w.art] || 0) + 1;
        });
        setzeHinweise(Object.keys(gezaehlt).map(function (k) {
          return { art: k, anzahl: gezaehlt[k] };
        }));
      } catch (f) { setzeFehler(f.message || String(f)); }
      setzeLaedt(false);
    }

    function malen(canvas, seite) {
      if (!canvas || !seite || !stoff) return;
      try {
        window.ImmoExposeLeinwand.zeichne(canvas, seite, {
          massstab: 320 / seite.breite,
          bilder: stoff.bilder,
          qr: window.ImmoExposeWerkzeug.qrFeld,
        });
      } catch (e) { /* die Kachel bleibt leer, die Liste daneben nicht */ }
    }

    function speichern(seite) {
      // Fuer den Export ein eigenes Canvas in voller Groesse: das in der
      // Ansicht ist klein und traegt ausserdem das Geraeteverhaeltnis.
      var c = document.createElement("canvas");
      var dpr = window.devicePixelRatio || 1;
      window.ImmoExposeLeinwand.zeichne(c, seite, {
        massstab: EXPORT / dpr, bilder: stoff.bilder,
        qr: window.ImmoExposeWerkzeug.qrFeld,
      });
      c.toBlob(function (blob) {
        if (!blob) return;
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = dateiname(stoff.immobilie, stoff.vorlage, seite);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }, "image/png");
    }

    var feld = {
      border: "1px solid " + CI.border, borderRadius: 8, padding: "8px 10px",
      fontSize: 13.5, fontFamily: "inherit", color: CI.blau, background: "#fff",
      minWidth: 200,
    };
    var knopf = {
      background: CI.blau, color: "#fff", border: "1px solid " + CI.blau,
      padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
      fontFamily: "inherit", borderRadius: 8,
    };
    var knopfLeer = Object.assign({}, knopf,
      { background: "#fff", color: CI.blau, borderColor: CI.border });

    return E("div", null,
      E("p", { style: { fontSize: 13.5, color: CI.muted, lineHeight: 1.7, marginTop: 0 } },
        "Beitrag, Karussell und Story aus den Daten des Objekts — in der "
        + "Handschrift, die auch das Exposé trägt, mit Ihren Farben und Ihrem "
        + "Logo. Es wird nichts dazugedichtet: was im Objekt fehlt, bleibt auf "
        + "dem Bild leer. Kostet keine Credits."),

      E("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" } },
        E("select", { style: feld, value: wahlObjekt,
          onChange: function (e) { setzeWahlObjekt(e.target.value); } },
          E("option", { value: "" }, "— Objekt wählen —"),
          objekte.map(function (o) {
            return E("option", { key: o.id, value: o.id },
              (o.immo_nr ? o.immo_nr + " · " : "") + (o.bezeichnung || "ohne Bezeichnung")
              + (o.ort ? " · " + o.ort : ""));
          })),
        E("select", { style: feld, value: wahlVorlage,
          onChange: function (e) { setzeWahlVorlage(e.target.value); } },
          vorlagen.map(function (v) {
            return E("option", { key: v.id, value: v.id },
              v.name + (v.mandant_id ? " (eigene)" : ""));
          })),
        E("button", { type: "button", style: knopf, disabled: laedt || !wahlObjekt,
          onClick: zeichnen }, laedt ? "Zeichnet …" : "Vorschau erzeugen")),

      fehler ? E("div", { style: {
        background: "#fdf2f2", border: "1px solid #e8c4c0", color: CI.danger,
        padding: "10px 14px", marginBottom: 16, fontSize: 13, borderRadius: 8,
      } }, fehler) : null,

      hinweise.length ? E("div", { style: {
        background: "#fff7e6", border: "1px solid #f0dcb0", color: "#6b4e13",
        padding: "10px 14px", marginBottom: 16, fontSize: 13, borderRadius: 8,
      } },
        hinweise.map(function (h) {
          return h.art === "fehlender_wert"
            ? h.anzahl + " Angabe" + (h.anzahl === 1 ? "" : "n") + " fehlt im Objekt "
              + "und bleibt deshalb leer. "
            : h.art === "fehlendes_bild"
              ? h.anzahl + "× kein Bild hinterlegt. "
              : h.anzahl + "× " + h.art + ". ";
        })) : null,

      seiten ? E("div", { style: {
        display: "grid", gap: 20,
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      } }, seiten.map(function (s, i) {
        return E("div", { key: i, style: {
          background: CI.card, border: "1px solid " + CI.border,
          borderRadius: 12, padding: 14,
        } },
          E("div", { style: { fontSize: 12.5, fontWeight: 600, color: CI.blau, marginBottom: 8 } },
            s.name || ("Seite " + (i + 1))),
          E("canvas", { ref: function (c) { malen(c, s); },
            style: { width: "100%", height: "auto", display: "block",
                     border: "1px solid " + CI.border, borderRadius: 8 } }),
          E("button", { type: "button", style: Object.assign({}, knopfLeer, { marginTop: 10 }),
            onClick: function () { speichern(s); } },
            "Als PNG speichern (" + Math.round(s.breite * EXPORT) + "×"
            + Math.round(s.hoehe * EXPORT) + ")"));
      })) : null,

      seiten ? E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7, marginTop: 18 } },
        "Die Bilder entstehen in Ihrem Browser und werden nirgends "
        + "zwischengespeichert. Wer einen Beitrag ändern will, ändert das "
        + "Objekt oder die Vorlage — nicht das fertige Bild.") : null);
  }

  window.ImmoSocial = ImmoSocial;
})();
