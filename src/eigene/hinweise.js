// ============================================================================
// Hinweise des Betreibers im Portal: Ankündigungen und Rechtstexte
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_78), Handarbeit, klassische Laufzeit.
//
//   * ImmoAnkuendigungBand — Hinweise, die der Betreiber ins Portal stellt:
//     Info, neue Funktion, Warnung, Wartung (mit Countdown). Schliessbar nur,
//     wenn der Betreiber es erlaubt; das Wegklicken merkt sich der Browser.
//   * ImmoRechtstextSperre — eine neue AGB-/AVV-Fassung mit Zustimmungspflicht
//     legt sich für den Chef über die Anwendung, bis er zugestimmt hat.
//     Mitarbeiter sehen nichts davon: Zustimmen ist Chefsache.
//
// Was hier steht, hat die Datenbank entschieden (meine_ankuendigungen(),
// rechtstexte_offen()). Die Zustimmung selbst ist eine Zeile in
// rechtstext_zustimmungen, die nur ein chef anlegen kann (RLS).
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", muted: "#7A828C", danger: "#c0392b", success: "#1e7e34",
  };
  var E = React.createElement;
  var SPEICHER = "immo_hinweise_zu";

  function zeit(w) { try { return new Date(w).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return String(w || ""); } }
  function dauer(ms) {
    if (ms <= 0) return "jetzt";
    var min = Math.round(ms / 60000);
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    if (h < 48) return h + " h" + (m ? " " + m + " min" : "");
    return Math.round(h / 24) + " Tagen";
  }
  function gelesen() { try { return JSON.parse(window.localStorage.getItem(SPEICHER) || "[]"); } catch (e) { return []; } }

  // --- Ankündigungen ----------------------------------------------------------
  function ImmoAnkuendigungBand() {
    var lZ = React.useState([]), liste = lZ[0], setzeListe = lZ[1];
    var zZ = React.useState(gelesen()), zu = zZ[0], setzeZu = zZ[1];
    var tZ = React.useState(Date.now()), jetzt = tZ[0], setzeJetzt = tZ[1];
    React.useEffect(function () {
      if (!window._sb) return;
      var weg = false;
      function laden() {
        window._sb.rpc("meine_ankuendigungen").then(function (r) { if (!weg && !r.error) setzeListe(r.data || []); }).catch(function () {});
      }
      laden();
      var uhr = setInterval(laden, 5 * 60000);
      var tick = setInterval(function () { setzeJetzt(Date.now()); }, 30000);
      return function () { weg = true; clearInterval(uhr); clearInterval(tick); };
    }, []);
    function schliessen(id) {
      var n = zu.concat([id]).slice(-50);
      setzeZu(n);
      try { window.localStorage.setItem(SPEICHER, JSON.stringify(n)); } catch (e) { /* egal */ }
    }
    var sichtbar = liste.filter(function (a) { return !(a.schliessbar && zu.indexOf(a.id) >= 0); });
    if (!sichtbar.length) return null;
    var farben = { info: ["#eef2f8", CI.blau], neue_funktion: ["#e9f6ec", CI.success], warnung: ["#fdf2f2", CI.danger], wartung: ["#fff7e6", "#6b4e13"] };
    return E("div", { "data-ankuendigungen": "1" }, sichtbar.map(function (a) {
      var f = farben[a.typ] || farben.info;
      var von = new Date(a.von).getTime(), bis = a.bis ? new Date(a.bis).getTime() : null;
      var countdown = a.typ === "wartung"
        ? (von > jetzt ? "Wartung in " + dauer(von - jetzt) + " (" + zeit(a.von) + ")" : bis ? "Wartung läuft — voraussichtlich bis " + zeit(a.bis) : "Wartung läuft")
        : null;
      return E("div", { key: a.id, style: { background: f[0], color: f[1], fontSize: 13.5, padding: "8px 16px",
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center", borderBottom: "1px solid " + CI.border } },
        E("strong", null, a.titel),
        countdown ? E("span", { style: { fontWeight: 600 } }, countdown) : null,
        E("span", { style: { whiteSpace: "pre-wrap" } }, a.text),
        a.schliessbar ? E("button", { type: "button", title: "Ausblenden", onClick: function () { schliessen(a.id); },
          style: { border: "none", background: "transparent", color: f[1], cursor: "pointer", fontSize: 16, padding: "0 4px" } }, "×") : null);
    }));
  }

  // --- Rechtstexte: Zustimmung vor dem Weiterarbeiten -----------------------------
  function ImmoRechtstextSperre() {
    var oZ = React.useState(null), offen = oZ[0], setzeOffen = oZ[1];
    var cZ = React.useState(false), chef = cZ[0], setzeChef = cZ[1];
    var hZ = React.useState(false), haken = hZ[0], setzeHaken = hZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    React.useEffect(function () {
      if (!window._sb) return;
      var weg = false;
      window._sb.rpc("aktuelle_rolle").then(function (r) { if (!weg) setzeChef(r.data === "chef"); }).catch(function () {});
      window._sb.rpc("rechtstexte_offen").then(function (r) { if (!weg && !r.error) setzeOffen(r.data || []); }).catch(function () {});
      return function () { weg = true; };
    }, []);
    if (!chef || !offen || !offen.length) return null;
    var t = offen[0];
    var NAME = { agb: "Allgemeine Geschäftsbedingungen", avv: "Auftragsverarbeitungsvertrag", datenschutz: "Datenschutzerklärung", impressum: "Impressum" };
    async function zustimmen() {
      setzeFehler("");
      try {
        var r = await window._sb.from("rechtstext_zustimmungen").insert({ rechtstext_id: t.id, mandant_id: window.IMMO_MANDANT_ID || undefined });
        if (r.error && r.error.code !== "23505") throw r.error;
        setzeHaken(false);
        setzeOffen(offen.slice(1));
      } catch (f) { setzeFehler(f.message || String(f)); }
    }
    return E("div", { "data-rechtstext-sperre": "1", style: { position: "fixed", inset: 0, zIndex: 9000, background: "rgba(27,42,71,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } },
      E("div", { style: { background: CI.card, borderRadius: 12, maxWidth: 760, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" } },
        E("div", { style: { padding: "18px 22px 10px", borderBottom: "1px solid " + CI.border } },
          E("div", { style: { fontSize: 11, color: CI.muted, letterSpacing: "0.06em", textTransform: "uppercase" } }, "Neue Fassung — Zustimmung erforderlich"),
          E("h2", { style: { margin: "4px 0 2px", fontSize: 18, color: CI.blau } }, (NAME[t.art] || t.art) + " · Version " + t.version),
          E("div", { style: { fontSize: 12.5, color: CI.muted } }, "Gültig ab " + new Date(t.gueltig_ab).toLocaleDateString("de-DE") + (offen.length > 1 ? " · danach noch " + (offen.length - 1) + " weitere" : "")),
          t.aenderungshinweis ? E("div", { style: { marginTop: 8, fontSize: 13, background: "#fff7e6", border: "1px solid #f0dcb0", borderRadius: 8, padding: "8px 12px" } },
            E("strong", null, "Was sich ändert: "), t.aenderungshinweis) : null),
        E("div", { style: { padding: "14px 22px", overflowY: "auto", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", flex: 1 } }, t.text),
        E("div", { style: { padding: "12px 22px 18px", borderTop: "1px solid " + CI.border } },
          E("label", { style: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, marginBottom: 10 } },
            E("input", { type: "checkbox", checked: haken, onChange: function (e) { setzeHaken(e.target.checked); } }),
            E("span", null, "Ich habe die neue Fassung gelesen und stimme ihr für mein Haus zu. Die Zustimmung wird mit Zeitpunkt und Version gespeichert.")),
          fehler ? E("div", { style: { color: CI.danger, fontSize: 13, marginBottom: 8 } }, fehler) : null,
          E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
            E("button", { type: "button", disabled: !haken, onClick: zustimmen, style: { background: CI.blau, color: "#fff", border: "1px solid " + CI.blau,
              borderRadius: 7, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: haken ? "pointer" : "default", opacity: haken ? 1 : 0.6 } }, "Zustimmen"),
            E("button", { type: "button", onClick: function () { try { window._sb.auth.signOut(); } catch (e) { /* egal */ } window.location.reload(); },
              style: { background: "#fff", color: CI.muted, border: "1px solid " + CI.border, borderRadius: 7, padding: "9px 14px", fontSize: 13, cursor: "pointer" } }, "Nicht zustimmen und abmelden"),
            E("span", { style: { fontSize: 12, color: CI.muted } }, "Ohne Zustimmung lässt sich die Anwendung nicht weiter nutzen.")))));
  }

  window.ImmoAnkuendigungBand = ImmoAnkuendigungBand;
  window.ImmoRechtstextSperre = ImmoRechtstextSperre;
})();
