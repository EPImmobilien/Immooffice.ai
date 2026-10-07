// ============================================================================
// Firmendaten aus der Website übernehmen — und das Band, das daran erinnert
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_82), klassische Laufzeit.
//
//   * ImmoFirmaErmitteln — steht in Einstellungen › Firma & Impressum über
//     jedem Firmensatz: Website eintragen, „Aus Website übernehmen", der
//     Vorschlag erscheint FELD FÜR FELD mit dem Beleg von der Seite und
//     einem Häkchen. Übernommen wird in das Formular, gespeichert mit dem
//     normalen „Speichern" — kein zweiter Schreibweg.
//   * ImmoEinrichtungBand — zeigt dem Chef eines neuen Hauses, was noch
//     fehlt (Firmendaten, Logo, Postfach), jeweils mit dem Pfad dorthin.
//
// Die Function firma-ermitteln liefert nur, was wörtlich auf der Website
// steht; jeder Wert hat seinen Beleg, sonst kommt er nicht. Das Formular
// bleibt die Instanz, die entscheidet.
// ============================================================================
(function () {
  "use strict";
  var CI = window.IMMO_CI || { blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF", border: "#E6E8EB", muted: "#7A828C", danger: "#c0392b", success: "#1e7e34" };
  var E = React.createElement;
  var NAMEN = { firma_name: "Firmenname", rechtsform: "Rechtsform", strasse: "Straße", plz: "PLZ", ort: "Ort", land: "Land", telefon: "Telefon", fax: "Fax",
    email: "E-Mail", web: "Website", registergericht: "Registergericht", hrb: "HRB", ust_id: "USt-IdNr.", geschaeftsfuehrer: "Geschäftsführung",
    aufsichtsbehoerde: "Aufsichtsbehörde (§ 34c)", kammer: "Kammer", steuernummer: "Steuernummer" };
  var knopf = { background: CI.blau, color: "#fff", border: "1px solid " + CI.blau, borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  var knopfLeer = Object.assign({}, knopf, { background: "#fff", color: CI.blau, borderColor: CI.border });
  var feld = { padding: "7px 9px", border: "1px solid " + CI.border, borderRadius: 7, fontSize: 13, boxSizing: "border-box" };

  function ImmoFirmaErmitteln(p) {
    var f = p.firma || {};
    var wZ = React.useState(f.web || ""), web = wZ[0], setzeWeb = wZ[1];
    var lZ = React.useState(false), laeuft = lZ[0], setzeLaeuft = lZ[1];
    var vZ = React.useState(null), vorschlag = vZ[0], setzeVorschlag = vZ[1];
    var hZ = React.useState({}), haken = hZ[0], setzeHaken = hZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    var oZ = React.useState(false), offen = oZ[0], setzeOffen = oZ[1];
    var leerFelder = ["strasse", "plz", "ort", "telefon", "email"].filter(function (k) { return !f[k]; }).length;

    async function holen() {
      setzeLaeuft(true); setzeFehler(""); setzeVorschlag(null);
      try {
        var a = await window._sb.functions.invoke("firma-ermitteln", { body: { website: web } });
        if (a.error) {
          var t = a.error.message || String(a.error);
          try { var k = a.error.context && await a.error.context.json(); if (k && k.fehler) t = k.fehler; } catch (e) { /* Rahmen */ }
          throw new Error(t);
        }
        if (!a.data || a.data.ok === false) throw new Error((a.data && a.data.fehler) || "Keine Antwort.");
        setzeVorschlag(a.data);
        var h = {};
        Object.keys(a.data.felder || {}).forEach(function (k) {
          var x = a.data.felder[k];
          // Vorbelegt, wo ein Wert mit Beleg kam und das Feld im Formular leer ist — Vorhandenes überschreibt der Vorschlag nicht ungefragt.
          h[k] = !!(x && x.wert) && !f[k];
        });
        setzeHaken(h);
      } catch (x) { setzeFehler(x.message || String(x)); }
      setzeLaeuft(false);
    }
    var mZ = React.useState({ primaer: true, akzent: true, font: true }), markeHaken = mZ[0], setzeMarkeHaken = mZ[1];
    var wahlZ = React.useState({}), wahl = wahlZ[0], setzeWahl = wahlZ[1]; // vom Nutzer umgesetzte Farb-/Schriftwahl
    var logoZ = React.useState(""), logoLaeuft = logoZ[0], setzeLogoLaeuft = logoZ[1];
    function markeWert(k) {
      var m = vorschlag && vorschlag.marke || {};
      if (k === "primaer") return wahl.primaer || (m.farben && m.farben.primaer) || null;
      if (k === "akzent") return wahl.akzent || (m.farben && m.farben.akzent) || null;
      return wahl.font || (m.schriften && m.schriften.vorschlag) || null;
    }
    // Ein Logo der Website ins Haus holen: die Function laedt das Bild (die
    // Oberflaeche darf fremde Bilder nicht lesen), dann derselbe Weg wie beim
    // Hochladen — Freistellen anbieten, in branding-assets ablegen, Pfad ins
    // Formular. Gespeichert wird mit "Speichern".
    async function logoUebernehmen(url) {
      setzeLogoLaeuft(url); setzeFehler("");
      try {
        var a = await window._sb.functions.invoke("firma-ermitteln", { body: { modus: "logo", url: url } });
        if (a.error || !a.data || a.data.ok === false) throw new Error((a.data && a.data.fehler) || (a.error && a.error.message) || "Bild nicht ladbar.");
        var bin = atob(a.data.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var mime = a.data.mime === "image/jpg" ? "image/jpeg" : a.data.mime;
        var endung = mime === "image/svg+xml" ? "svg" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : /icon/.test(mime) ? "ico" : "png";
        var datei = new File([bytes], "logo-website." + endung, { type: mime });
        var hochzuladen = datei;
        if (window.ImmoLogoFreistellen && endung !== "svg" && endung !== "ico") {
          var frei = await window.ImmoLogoFreistellen.oeffnen(datei);
          if (frei === "abbruch") { setzeLogoLaeuft(""); return; }
          if (frei && frei.blob) { hochzuladen = frei.blob; endung = frei.endung || "png"; mime = "image/png"; }
        }
        var pfad = "logos/" + (f.id || "neu") + "-" + Date.now() + "." + endung;
        var r = await window._sb.storage.from("branding-assets").upload(pfad, hochzuladen, { upsert: false, contentType: mime });
        if (r.error) throw r.error;
        if (typeof p.uebernehmen === "function") p.uebernehmen({ logo_pfad: pfad });
        try { if (typeof logAction === "function") await logAction("upload", "logo", f.id, f.firma_name || "", { pfad: pfad, quelle: url }); } catch (e) { /* egal */ }
      } catch (x) { setzeFehler("Logo: " + (x.message || String(x))); }
      setzeLogoLaeuft("");
    }
    function uebernehmen() {
      var w = {};
      if (vorschlag && vorschlag.marke) {
        if (markeHaken.primaer && markeWert("primaer")) w.ci_primaer = markeWert("primaer");
        if (markeHaken.akzent && markeWert("akzent")) w.ci_akzent = markeWert("akzent");
        if (markeHaken.font && markeWert("font")) w.ci_font = markeWert("font");
      }
      Object.keys(haken).forEach(function (k) { if (haken[k] && vorschlag.felder[k] && vorschlag.felder[k].wert && k in NAMEN && k !== "rechtsform" && k !== "steuernummer") w[k] = vorschlag.felder[k].wert; });
      if (haken.steuernummer && vorschlag.felder.steuernummer && vorschlag.felder.steuernummer.wert) w.steuernummer = vorschlag.felder.steuernummer.wert;
      if (typeof p.uebernehmen === "function") p.uebernehmen(w);
      setzeOffen(false); setzeVorschlag(null);
    }
    return E("div", { "data-firma-ermitteln": "1", style: { border: "1px solid " + CI.border, borderLeft: "3px solid " + CI.gold, borderRadius: 8, padding: "10px 14px", margin: "6px 0 14px", background: "#fffdf7" } },
      E("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } },
        E("div", { style: { fontSize: 13, flex: "1 1 260px" } },
          E("strong", null, "Aus der Website übernehmen"),
          E("span", { style: { color: CI.muted } }, leerFelder ? " — " + leerFelder + " Pflichtfelder sind noch leer. " : " — ", "Startseite und Impressum werden gelesen; jeder Vorschlag zeigt seinen Beleg.")),
        E("input", { style: Object.assign({}, feld, { width: 240 }), placeholder: "www.ihre-firma.de", value: web, onChange: function (e) { setzeWeb(e.target.value); },
          onKeyDown: function (e) { if (e.key === "Enter" && web.trim()) { setzeOffen(true); holen(); } } }),
        E("button", { type: "button", style: knopf, disabled: laeuft || !web.trim(), onClick: function () { setzeOffen(true); holen(); } }, laeuft ? "Liest …" : "Aus Website übernehmen")),
      fehler ? E("div", { style: { color: CI.danger, fontSize: 13, marginTop: 8 } }, fehler) : null,
      offen && vorschlag ? E("div", { style: { marginTop: 10 } },
        E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 6 } },
          "Gelesen: " + (vorschlag.quellen || []).join(", ") + (vorschlag.impressum_gefunden ? "" : " — kein Impressum gefunden, nur die Startseite") + " · " + vorschlag.gefunden + " Angaben gefunden."),
        (vorschlag.hinweise || []).map(function (h, i) { return E("div", { key: i, style: { fontSize: 12.5, color: "#6b4e13", background: "#fff7e6", border: "1px solid #f0dcb0", borderRadius: 6, padding: "4px 8px", marginBottom: 4 } }, h); }),
        E("table", { style: { borderCollapse: "collapse", width: "100%" } },
          E("tbody", null, Object.keys(NAMEN).map(function (k) {
            var x = (vorschlag.felder || {})[k] || {};
            if (!x.wert) return null;
            return E("tr", { key: k, style: { borderBottom: "1px solid " + CI.border } },
              E("td", { style: { padding: "5px 6px", width: 28 } }, E("input", { type: "checkbox", checked: !!haken[k], onChange: function (e) { var n = Object.assign({}, haken); n[k] = e.target.checked; setzeHaken(n); } })),
              E("td", { style: { padding: "5px 6px", fontSize: 12.5, color: CI.muted, width: 150 } }, NAMEN[k] + (f[k] ? " (ersetzt „" + String(f[k]).slice(0, 24) + "“)" : "")),
              E("td", { style: { padding: "5px 6px", fontSize: 13, fontWeight: 600 } }, x.wert),
              E("td", { style: { padding: "5px 6px", fontSize: 11.5, color: CI.muted, fontStyle: "italic" } }, x.beleg ? "„" + x.beleg + "“" : ""));
          }))),
        // --- Marke: Farben, Schriften, Logo --------------------------------------
        vorschlag.marke ? E("div", { style: { marginTop: 14, borderTop: "1px solid " + CI.border, paddingTop: 10 } },
          E("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 6 } }, "Marke von der Website"),
          E("div", { style: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" } },
            // Farben
            E("div", null,
              E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 4 } }, "Farben im Stylesheet (nach Gewicht) — anklicken setzt Primär, Umschalt+Klick Akzent"),
              E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, ((vorschlag.marke.farben || {}).liste || []).map(function (c) {
                var istP = markeWert("primaer") === c.hex, istA = markeWert("akzent") === c.hex;
                return E("button", { key: c.hex, type: "button", title: c.hex + " · " + c.treffer + "×", onClick: function (ev) { var n = Object.assign({}, wahl); if (ev.shiftKey) n.akzent = c.hex; else n.primaer = c.hex; setzeWahl(n); },
                  style: { width: 34, height: 34, borderRadius: 8, background: c.hex, cursor: "pointer", border: istP ? "3px solid " + CI.blau : istA ? "3px solid " + CI.gold : "1px solid " + CI.border, position: "relative" } },
                  istP ? E("span", { style: { position: "absolute", bottom: -16, left: 0, fontSize: 9, color: CI.blau, fontWeight: 700 } }, "Primär") : istA ? E("span", { style: { position: "absolute", bottom: -16, left: 0, fontSize: 9, color: CI.gold, fontWeight: 700 } }, "Akzent") : null);
              })),
              E("div", { style: { marginTop: 22, fontSize: 12.5, display: "flex", gap: 14, flexWrap: "wrap" } },
                E("label", null, E("input", { type: "checkbox", checked: !!markeHaken.primaer, onChange: function (e) { setzeMarkeHaken(Object.assign({}, markeHaken, { primaer: e.target.checked })); } }), " Primärfarbe ", E("code", null, markeWert("primaer") || "—")),
                E("label", null, E("input", { type: "checkbox", checked: !!markeHaken.akzent, onChange: function (e) { setzeMarkeHaken(Object.assign({}, markeHaken, { akzent: e.target.checked })); } }), " Akzentfarbe ", E("code", null, markeWert("akzent") || "—")))),
            // Schriften
            E("div", null,
              E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 4 } }, "Schriften (font-family, Google Fonts, @font-face)"),
              ((vorschlag.marke.schriften || {}).liste || []).length ? E("div", null, (vorschlag.marke.schriften.liste || []).map(function (sf) {
                return E("label", { key: sf.name, style: { display: "block", fontSize: 13, padding: "2px 0" } },
                  E("input", { type: "radio", name: "immo-font-" + (f.id || "x"), checked: markeWert("font") === sf.name, onChange: function () { setzeWahl(Object.assign({}, wahl, { font: sf.name })); } }),
                  " ", E("span", { style: { fontFamily: "'" + sf.name + "', system-ui, sans-serif" } }, sf.name), E("span", { style: { color: CI.muted, fontSize: 11.5 } }, " · " + sf.treffer + "×"));
              }), E("label", { style: { display: "block", fontSize: 12.5, marginTop: 4 } }, E("input", { type: "checkbox", checked: !!markeHaken.font, onChange: function (e) { setzeMarkeHaken(Object.assign({}, markeHaken, { font: e.target.checked })); } }), " Schriftfamilie übernehmen"),
                E("div", { style: { fontSize: 11.5, color: CI.muted, marginTop: 4 } }, "Die Schrift muss im Browser bzw. für PDFs verfügbar sein — Google Fonts werden geladen, Hausschriften nicht."))
              : E("div", { style: { fontSize: 12.5, color: CI.muted } }, "Keine Schriftangabe gefunden.")),
            // Logos
            E("div", null,
              E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 4 } }, "Logo-Kandidaten — „Übernehmen“ holt das Bild, bietet Freistellen an und legt es ab"),
              ((vorschlag.marke.logos || []).length ? E("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, vorschlag.marke.logos.map(function (l) {
                return E("div", { key: l.url, style: { border: "1px solid " + CI.border, borderRadius: 8, padding: 6, width: 150, background: "repeating-conic-gradient(#f3f3f3 0 25%, #fff 0 50%) 0 0/16px 16px" } },
                  E("img", { src: l.url, alt: "", style: { maxWidth: 136, maxHeight: 60, display: "block", margin: "0 auto 6px", objectFit: "contain" }, onError: function (ev) { ev.target.style.opacity = 0.2; } }),
                  E("div", { style: { fontSize: 10.5, color: CI.muted, lineHeight: 1.3, minHeight: 26 } }, l.grund),
                  E("button", { type: "button", style: Object.assign({}, knopfLeer, { padding: "4px 8px", fontSize: 12, width: "100%", marginTop: 4 }), disabled: !!logoLaeuft, onClick: function () { logoUebernehmen(l.url); } },
                    logoLaeuft === l.url ? "Holt …" : "Übernehmen"));
              })) : E("div", { style: { fontSize: 12.5, color: CI.muted } }, "Kein Logo-Kandidat gefunden — unter ", window.ImmoPfadLink ? E(window.ImmoPfadLink, { ziel: "marketing" }) : "Marketing", " hochladen."))))) : null,
        E("div", { style: { display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" } },
          E("button", { type: "button", style: knopf, onClick: uebernehmen, disabled: !Object.keys(haken).some(function (k) { return haken[k]; }) }, "Angehakte ins Formular übernehmen"),
          E("button", { type: "button", style: knopfLeer, onClick: function () { setzeOffen(false); setzeVorschlag(null); } }, "Verwerfen"),
          E("span", { style: { fontSize: 12, color: CI.muted } }, "Danach unten „Speichern“ — erst dann ist es gespeichert."))) : null);
  }

  // --- Das Band fuer neue Haeuser -------------------------------------------------
  function ImmoEinrichtungBand() {
    var sZ = React.useState(null), stand = sZ[0], setzeStand = sZ[1];
    var zZ = React.useState(false), zu = zZ[0], setzeZu = zZ[1];
    React.useEffect(function () {
      if (!window._sb) return;
      var weg = false;
      try { if (window.sessionStorage.getItem("immo_einrichtung_zu") === "1") { setzeZu(true); return; } } catch (e) { /* egal */ }
      Promise.all([
        window._sb.rpc("aktuelle_rolle"),
        window._sb.from("firma_stammdaten").select("id, firma_name, strasse, plz, ort, email, telefon, logo_pfad").eq("aktiv", true).order("sortierung").limit(1),
        window._sb.from("mail_postfaecher").select("id", { count: "exact", head: true }),
      ]).then(function (r) {
        if (weg) return;
        if (r[0].data !== "chef") return;
        var f = (r[1].data || [])[0] || {};
        var fehlt = [];
        if (!f.strasse || !f.plz || !f.ort) fehlt.push({ text: "Firmenanschrift (Impressum, Rechnungen, Exposés)", ziel: "einstellungen/firma" });
        if (!f.email || !f.telefon) fehlt.push({ text: "Kontaktdaten der Firma", ziel: "einstellungen/firma" });
        if (!f.logo_pfad) fehlt.push({ text: "Logo (Exposés, Mails, Web-Exposé)", ziel: "marketing" });
        if (!r[2].error && r[2].count === 0) fehlt.push({ text: "Postfach verbinden", ziel: "posteingang" });
        setzeStand(fehlt);
      }).catch(function () {});
      return function () { weg = true; };
    }, []);
    if (zu || !stand || !stand.length) return null;
    return E("div", { "data-einrichtung-band": "1", style: { background: "#fffdf7", borderBottom: "1px solid #f0dcb0", color: CI.blau, fontSize: 13, padding: "8px 16px",
      display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center" } },
      E("strong", null, "Einrichtung: " + stand.length + " Punkt" + (stand.length > 1 ? "e" : "") + " offen"),
      stand.map(function (s, i) { return E("span", { key: i }, s.text + " ", window.ImmoPfadLink ? E(window.ImmoPfadLink, { ziel: s.ziel }) : null); }),
      E("button", { type: "button", title: "Für diese Sitzung ausblenden", onClick: function () { setzeZu(true); try { window.sessionStorage.setItem("immo_einrichtung_zu", "1"); } catch (e) { /* egal */ } },
        style: { border: "none", background: "transparent", color: CI.muted, cursor: "pointer", fontSize: 16 } }, "×"));
  }

  window.ImmoFirmaErmitteln = ImmoFirmaErmitteln;
  window.ImmoEinrichtungBand = ImmoEinrichtungBand;
})();
