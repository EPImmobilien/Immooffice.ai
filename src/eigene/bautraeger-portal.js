// ============================================================================
// Bauträger-Paket v2 — Handwerker-Link, QR-Scan, Tiefenlinks (fork_85/86)
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, klassische Laufzeit. Läuft beim Laden der Seite
// und wertet die Adresse aus:
//
//   ?handwerker=<token>  Der Handwerker hat kein Konto. Statt der Anwendung
//                        erscheint eine eigene, schlichte Seite mit genau
//                        seinen Mängeln (Function handwerker-portal). Er
//                        meldet Termin, Erledigung mit Pflicht-Foto oder
//                        eine Rückfrage. Mobil zuerst.
//   ?qr=<token>          QR-Code an der Wohnungstür. Nicht angemeldet: nur
//                        Projekt und Wohnungsnummer (Function einheit-qr)
//                        und die Bitte, sich anzumelden. Angemeldet (auch
//                        nach dem Anmelden): die Wohnungsakte öffnet sich.
//   ?akte=<einheit_id>   Aus Push oder Mail an die Verwaltung — gleiche
//                        Wirkung wie der Scan, nur mit Kennung statt Token.
//
// Die Anwendung selbst weiss davon nur über window._immoNeubauStart
// (FORK-Regeln an ImmobilienPage und NeubauProjekteBereich).
// ============================================================================
(function () {
  "use strict";
  var B = window.ImmoBT, E = React.createElement, CI = B.CI;
  var params = new URLSearchParams(location.search);
  var handwerkerToken = (params.get("handwerker") || "").trim();
  var qrToken = (params.get("qr") || "").trim();
  var akteId = (params.get("akte") || "").trim();
  var FN = function () { var u = (window._sb && window._sb.functionsUrl) || (window.IMMO_SUPABASE_URL ? window.IMMO_SUPABASE_URL + "/functions/v1" : ""); return u; };

  // Die öffentlichen Functions ohne Anmeldung rufen — supabase-js würde den
  // anon-Schlüssel mitschicken, das ist für GET mit Token in Ordnung.
  async function oeffentlich(name, query, body) {
    var basis = FN(); if (!basis) throw new Error("Supabase-Adresse unbekannt.");
    var kopf = { "Content-Type": "application/json" };
    var key = window.IMMO_SUPABASE_KEY || (window._sb && window._sb.supabaseKey);
    if (key) { kopf.apikey = key; kopf.Authorization = "Bearer " + key; }
    var r = await fetch(basis + "/" + name + (query ? "?" + query : ""), body ? { method: "POST", headers: kopf, body: JSON.stringify(body) } : { headers: kopf });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok || d.ok === false) throw new Error(d.fehler || d.error || ("Fehler " + r.status));
    return d;
  }

  // --- Handwerker-Seite --------------------------------------------------------------------------
  function HandwerkerMangel(p) {
    var m = p.mangel;
    var aZ = React.useState(null), aktion = aZ[0], setzeAktion = aZ[1];
    var wZ = React.useState({ datum: "", text: "", fotos: [] }), w = wZ[0], setzeW = wZ[1];
    var lZ = React.useState(false), laeuft = lZ[0], setzeLaeuft = lZ[1];
    var offen = window.IMMO_MANGEL_OFFEN.indexOf(m.status) >= 0;
    async function senden(art) {
      setzeLaeuft(true);
      try {
        var body = { token: p.token, mangel_id: m.id, aktion: art, datum: w.datum || null, text: w.text || "", fotos: w.fotos };
        var r = await oeffentlich("handwerker-portal", null, body);
        B.hinweis(art === "termin" ? "Termin gemeldet — danke." : art === "erledigt" ? "Erledigung gemeldet — die Bauleitung prüft." : "Rückfrage ist bei der Bauleitung.");
        setzeAktion(null); setzeW({ datum: "", text: "", fotos: [] }); p.neuLaden();
        void r;
      } catch (e) { B.hinweis(e.message || String(e), true); }
      setzeLaeuft(false);
    }
    var knopfKlein = Object.assign({}, B.knopfLeer, { fontSize: 13, padding: "9px 12px", flex: 1 });
    return E("div", { style: Object.assign({}, B.karte, { marginBottom: 12 }) },
      E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 } }, E(B.StatusAbzeichen, { status: m.status }), m.einheit ? E("span", { style: { fontWeight: 700, color: CI.blau } }, m.einheit) : null, m.raum ? E("span", { style: B.klein }, m.raum) : null),
      E("div", { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, m.titel),
      m.beschreibung ? E("div", { style: { fontSize: 13.5, whiteSpace: "pre-wrap", marginBottom: 6 } }, m.beschreibung) : null,
      E("div", { style: { fontSize: 13, color: m.frist && m.frist < B.heute() && offen ? CI.danger : CI.muted, marginBottom: 8 } }, m.frist ? "Frist: " + B.datumDe(m.frist) : "", m.nachfrist ? " · Nachfrist: " + B.datumDe(m.nachfrist) : "", m.termin_am ? " · Ihr Termin: " + B.datumDe(m.termin_am) : ""),
      m.fotos && m.fotos.length ? E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 } }, m.fotos.map(function (u, i) { return E("a", { key: i, href: u, target: "_blank", rel: "noopener" }, E("img", { src: u, alt: "", style: { width: 84, height: 84, objectFit: "cover", borderRadius: 8 } })); })) : null,
      m.erledigt_fotos && m.erledigt_fotos.length ? E("div", { style: { fontSize: 12.5, color: CI.muted, marginBottom: 8 } }, "Ihre Erledigungsfotos: ", m.erledigt_fotos.length) : null,
      (m.verlauf || []).length ? E("details", { style: { marginBottom: 8 } }, E("summary", { style: Object.assign({}, B.klein, { cursor: "pointer" }) }, "Verlauf (" + m.verlauf.length + ")"),
        m.verlauf.slice().reverse().map(function (v, i) { return E("div", { key: i, style: { fontSize: 12, padding: "2px 0" } }, B.zeitDe(v.am), " · ", v.wer, " · ", v.was === "status" ? (window.IMMO_MANGEL_STATUS[v.nach] || [v.nach])[0] : v.was, v.text ? " — " + v.text : ""); })) : null,
      offen ? E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
        E("button", { type: "button", style: knopfKlein, onClick: function () { setzeAktion(aktion === "termin" ? null : "termin"); } }, "📅 Termin melden"),
        E("button", { type: "button", style: Object.assign({}, knopfKlein, { background: "#1e7e34", borderColor: "#1e7e34", color: "#fff" }), onClick: function () { setzeAktion(aktion === "erledigt" ? null : "erledigt"); } }, "✓ Erledigt (mit Foto)"),
        E("button", { type: "button", style: knopfKlein, onClick: function () { setzeAktion(aktion === "rueckfrage" ? null : "rueckfrage"); } }, "? Rückfrage")) : E("div", { style: B.klein }, m.status === "geprueft_erledigt" ? "Geprüft und erledigt — danke." : "Dieser Mangel ist abgeschlossen."),
      aktion ? E("div", { style: { marginTop: 10, padding: 10, background: "#fbf7ee", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 } },
        aktion === "termin" ? E("input", { type: "date", style: B.feld, value: w.datum, min: B.heute(), onChange: function (e) { setzeW(Object.assign({}, w, { datum: e.target.value })); } }) : null,
        aktion === "erledigt" ? E("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
          E("label", { style: Object.assign({}, B.knopfLeer, { display: "inline-block", fontSize: 13 }) }, "📷 Foto aufnehmen *", E("input", { type: "file", accept: "image/*", capture: "environment", multiple: true, style: { display: "none" }, onChange: async function (e) { var neu = []; for (var i = 0; i < e.target.files.length; i++) neu.push(await B.fotoAlsDataUrl(e.target.files[i])); setzeW(Object.assign({}, w, { fotos: w.fotos.concat(neu) })); e.target.value = ""; } })),
          w.fotos.map(function (u, i) { return E("img", { key: i, src: u, alt: "", style: { width: 60, height: 60, objectFit: "cover", borderRadius: 6 } }); })) : null,
        E("textarea", { style: Object.assign({}, B.feld, { minHeight: 56 }), placeholder: aktion === "rueckfrage" ? "Ihre Frage an die Bauleitung *" : "Bemerkung (optional)", value: w.text, onChange: function (e) { setzeW(Object.assign({}, w, { text: e.target.value })); } }),
        E("button", { type: "button", style: Object.assign({}, B.knopf, { padding: "11px 14px" }), disabled: laeuft || (aktion === "termin" && !w.datum) || (aktion === "erledigt" && !w.fotos.length) || (aktion === "rueckfrage" && !w.text.trim()), onClick: function () { senden(aktion); } }, laeuft ? "… wird gesendet" : "Absenden")) : null);
  }
  function HandwerkerSeite(p) {
    var dZ = React.useState(null), daten = dZ[0], setzeDaten = dZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    var laden = React.useCallback(function () { oeffentlich("handwerker-portal", "token=" + encodeURIComponent(p.token)).then(setzeDaten).catch(function (e) { setzeFehler(e.message || String(e)); }); }, [p.token]);
    React.useEffect(function () { laden(); }, [laden]);
    var offen = daten ? daten.maengel.filter(function (m) { return window.IMMO_MANGEL_OFFEN.indexOf(m.status) >= 0; }) : [];
    var erledigt = daten ? daten.maengel.filter(function (m) { return window.IMMO_MANGEL_OFFEN.indexOf(m.status) < 0; }) : [];
    return E("div", { style: { minHeight: "100vh", background: CI.bg, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: CI.blau } },
      E("div", { style: { background: CI.blau, color: "#fff", padding: "14px 16px" } },
        E("div", { style: { fontSize: 12, opacity: 0.8 } }, daten && daten.bautraeger ? daten.bautraeger.name : "Mängelliste"),
        E("div", { style: { fontSize: 18, fontWeight: 700 } }, daten ? daten.projekt.name + (daten.projekt.ort ? " · " + daten.projekt.ort : "") : "…"),
        daten && daten.handwerker ? E("div", { style: { fontSize: 13, opacity: 0.9 } }, (daten.handwerker.firma || daten.handwerker.name || "") + (daten.handwerker.gewerk ? " · " + daten.handwerker.gewerk : "")) : null),
      E("div", { style: { padding: 14, maxWidth: 720, margin: "0 auto" } },
        fehler ? E("div", { style: Object.assign({}, B.karte, { color: CI.danger }) }, fehler) : !daten ? E("div", { style: B.klein }, "Lädt …") :
          E("div", null,
            E("div", { style: { fontSize: 13.5, marginBottom: 10 } }, offen.length ? offen.length + " offene " + (offen.length === 1 ? "Mangel" : "Mängel") + " — bitte Termin, Erledigung (mit Foto) oder Rückfrage melden." : "Keine offenen Mängel. Danke!"),
            offen.map(function (m) { return E(HandwerkerMangel, { key: m.id, mangel: m, token: p.token, neuLaden: laden }); }),
            erledigt.length ? E("details", { style: { marginTop: 10 } }, E("summary", { style: Object.assign({}, B.klein, { cursor: "pointer" }) }, erledigt.length + " abgeschlossen"), erledigt.map(function (m) { return E(HandwerkerMangel, { key: m.id, mangel: m, token: p.token, neuLaden: laden }); })) : null,
            daten.bautraeger ? E("div", { style: Object.assign({}, B.klein, { marginTop: 16 }) }, "Fragen: ", daten.bautraeger.name, daten.bautraeger.telefon ? " · " + daten.bautraeger.telefon : "", daten.bautraeger.email ? " · " + daten.bautraeger.email : "") : null)));
  }

  // --- QR ohne Anmeldung: Hinweis über der Anmeldung -------------------------------------------------
  function QrHinweis(p) {
    var dZ = React.useState(null), d = dZ[0], setzeD = dZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    React.useEffect(function () { oeffentlich("einheit-qr", "token=" + encodeURIComponent(p.token)).then(setzeD).catch(function (e) { setzeFehler(e.message || String(e)); }); }, [p.token]);
    if (!d && !fehler) return null;
    return E("div", { style: { position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10040, background: "#fff", color: CI.blau, borderRadius: 10, padding: "10px 16px", boxShadow: "0 8px 30px rgba(0,0,0,.25)", fontSize: 13.5, maxWidth: "92vw", textAlign: "center" } },
      fehler ? E("span", null, "QR-Code: ", fehler) : E("span", null, E("b", null, d.projekt ? d.projekt.name : ""), " · WE ", d.we_nr, d.geschoss ? " · " + d.geschoss : "", E("div", { style: B.klein }, "Bitte anmelden — danach öffnet sich die Wohnungsakte.")));
  }

  // --- Start -----------------------------------------------------------------------------------------------
  function wurzel(id) { var k = document.getElementById(id); if (!k) { k = document.createElement("div"); k.id = id; document.body.appendChild(k); } return k; }
  function starten() {
    if (handwerkerToken) {
      var w = wurzel("immo-handwerker"); w.style.cssText = "position:fixed;inset:0;z-index:10060;overflow:auto;background:" + CI.bg;
      ReactDOM.createRoot(w).render(E(HandwerkerSeite, { token: handwerkerToken }));
      document.title = "Mängelliste";
      return;
    }
    if (!qrToken && !akteId) return;
    var hinweisWurzel = null;
    if (qrToken) { hinweisWurzel = ReactDOM.createRoot(wurzel("immo-qr-hinweis")); hinweisWurzel.render(E(QrHinweis, { token: qrToken })); }
    // Sobald die Anwendung läuft und jemand angemeldet ist: Einheit auflösen, Neubau öffnen.
    var versuche = 0;
    var t = setInterval(async function () {
      versuche++;
      if (versuche > 1200) { clearInterval(t); return; }   // 10 Minuten
      if (typeof window.epNavigiere !== "function" || !window._currentUserId || !window._sb) return;
      clearInterval(t);
      try {
        var q = window._sb.from("projekt_einheiten").select("id, projekt_id");
        var r = qrToken ? await q.eq("qr_token", qrToken).maybeSingle() : await q.eq("id", akteId).maybeSingle();
        if (!r.data) { B.hinweis("Diese Einheit ist in Ihrem Haus nicht bekannt.", true); return; }
        window._immoNeubauStart = { projekt_id: r.data.projekt_id, einheit_id: r.data.id };
        if (hinweisWurzel) { try { hinweisWurzel.unmount(); } catch (e) { /* weg */ } }
        try { history.replaceState(null, "", location.pathname); } catch (e) { /* egal */ }
        window.epNavigiere("immobilien");
      } catch (e) { B.hinweis("Wohnungsakte nicht erreichbar: " + (e.message || e), true); }
    }, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", starten); else starten();
})();
