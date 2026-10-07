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
    function uebernehmen() {
      var w = {};
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
        (vorschlag.logos || []).length ? E("div", { style: { fontSize: 12, color: CI.muted, marginTop: 8 } },
          "Logo-Kandidaten auf der Website: ", vorschlag.logos.map(function (u, i) { return E("a", { key: i, href: u, target: "_blank", rel: "noopener", style: { color: CI.blau, marginRight: 8 } }, "Bild " + (i + 1)); }),
          " — Logos werden nicht automatisch übernommen (Freistellung, Web-Variante): ", window.ImmoPfadLink ? E(window.ImmoPfadLink, { ziel: "marketing" }) : null) : null,
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
