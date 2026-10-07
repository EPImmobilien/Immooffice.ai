// ============================================================================
// Plattform-Admin — Katalog, Mandanten, Zahlen, Protokoll
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_52), Handarbeit, klassische Laufzeit.
//
// Der Bereich des Betreibers, nicht des Maklers. Sichtbar nur, wenn der
// Angemeldete in `plattform_admins` steht — und das entscheidet nicht diese
// Datei, sondern die Edge Function `plattform-admin`. Was hier ausgeblendet
// ist, ist Bequemlichkeit; die Sperre steht im Server.
//
// Was hier NICHT zu sehen ist: fachliche Daten der Mandanten. Keine
// Immobilie, kein Kontakt, keine Mail. CLAUDE.md: „Plattform-Administratoren
// erhalten keinen automatischen Zugriff auf Mandantendaten." Zu sehen ist
// die Vertragsbeziehung — Tarif, Status, Fristen, Verbrauch —, also genau
// das, womit der Betreiber seine eigenen Rechnungen schreibt.
//
// Jede Änderung steht hinterher im Protokoll, mit Person, Zeit und Grund.
// Das Protokoll lässt sich nicht bereinigen; ein Trigger verweigert
// Änderung und Löschung.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };
  var E = React.createElement;

  function geld(cent) {
    return (Number(cent || 0) / 100).toLocaleString("de-DE",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }
  function euro(betrag) {
    return Number(betrag || 0).toLocaleString("de-DE",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }
  function zahl(n) { return Number(n || 0).toLocaleString("de-DE"); }
  function datum(w) {
    if (!w) return "—";
    try { return new Date(w).toLocaleDateString("de-DE"); } catch (e) { return String(w); }
  }
  function zeit(w) {
    if (!w) return "—";
    try { return new Date(w).toLocaleString("de-DE"); } catch (e) { return String(w); }
  }

  async function ruf(aktion, mehr) {
    var a = await window._sb.functions.invoke("plattform-admin",
      { body: Object.assign({ aktion: aktion }, mehr || {}) });
    if (a.error) throw a.error;
    if (a.data && a.data.ok === false) throw new Error(a.data.fehler || "Unbekannter Fehler");
    return a.data || {};
  }

  // --- CSV fuer Excel (fork_69) ---------------------------------------------
  // UTF-8 mit BOM, Semikolon, deutsche Zahlen — sonst oeffnet Excel die
  // Datei in einer Spalte und macht aus 12,5 den 12. Mai. Jede Tabelle
  // des Betreiberbereichs exportiert ueber diese eine Funktion.
  function csvExport(dateiname, spalten, zeilen) {
    function z(w) {
      if (w === null || w === undefined) return "";
      if (typeof w === "number") return String(w).replace(".", ",");
      if (typeof w === "boolean") return w ? "ja" : "nein";
      var s = String(w);
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { try { s = new Date(s).toLocaleString("de-DE"); } catch (e) { /* roh */ } }
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var kopf = spalten.map(function (s) { return z(s[0]); }).join(";");
    var koerper = zeilen.map(function (r) {
      return spalten.map(function (s) { return z(typeof s[1] === "function" ? s[1](r) : r[s[1]]); }).join(";");
    });
    var blob = new Blob(["\ufeff" + [kopf].concat(koerper).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = dateiname; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function sortiere(zeilen, feld, richtung) {
    if (!feld) return zeilen;
    var k = richtung === "ab" ? -1 : 1;
    return zeilen.slice().sort(function (a, b) {
      var x = a[feld], y = b[feld];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * k;
      return String(x).localeCompare(String(y), "de") * k;
    });
  }
  function Ampel(p) {
    var w = p.wert;
    if (w === null || w === undefined) return E("span", { style: { color: CI.muted } }, "—");
    var farbe = w >= 70 ? CI.success : w >= 40 ? CI.gold : CI.danger;
    return E("span", { title: "Gesundheitswert " + w + " von 100", style: {
      display: "inline-block", minWidth: 34, textAlign: "center", padding: "2px 6px",
      borderRadius: 10, background: farbe, color: "#fff", fontSize: 12, fontWeight: 600 } }, w);
  }
  function mb(bytes) { return (Number(bytes || 0) / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " MB"; }

  var kasten = {
    background: CI.card, border: "1px solid " + CI.border, borderRadius: 10,
    padding: 18, marginBottom: 16,
  };
  var knopf = {
    background: CI.blau, color: "#fff", border: "1px solid " + CI.blau,
    padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", borderRadius: 7,
  };
  var knopfLeer = Object.assign({}, knopf, { background: "#fff", color: CI.blau, borderColor: CI.border });
  var feld = {
    border: "1px solid " + CI.border, borderRadius: 6, padding: "6px 8px",
    fontSize: 13, fontFamily: "inherit", color: CI.blau, width: "100%", boxSizing: "border-box",
  };
  var zelle = { padding: "8px 10px", borderBottom: "1px solid " + CI.border, fontSize: 13, textAlign: "left" };
  var kopfzelle = Object.assign({}, zelle, {
    fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
    color: CI.muted, fontWeight: 600,
  });

  function Ueberschrift(t) {
    return E("div", { style: {
      fontSize: 11, fontWeight: 700, color: CI.gold, letterSpacing: "0.08em",
      textTransform: "uppercase", marginBottom: 12,
    } }, t);
  }

  // --- Zahlen ---------------------------------------------------------------
  // Pfeil und Prozent zum Vorzeitraum. Ohne Vorwert (vor dem ersten
  // Schnappschuss) steht da nichts — eine erfundene Null waere eine Luege.
  function Vergleich(p) {
    if (p.vorher === null || p.vorher === undefined || !isFinite(p.vorher)) return null;
    var diff = Number(p.jetzt) - Number(p.vorher);
    if (!p.vorher && !diff) return null;
    var pct = p.vorher ? Math.round(diff / Math.abs(Number(p.vorher)) * 100) : null;
    var gut = p.umgekehrt ? diff <= 0 : diff >= 0;
    return E("span", { style: { fontSize: 12, fontWeight: 600, color: diff === 0 ? CI.muted : gut ? CI.success : CI.danger, marginLeft: 8 } },
      (diff > 0 ? "▲ " : diff < 0 ? "▼ " : "= ") + (pct !== null ? Math.abs(pct) + " %" : zahl(Math.abs(diff))));
  }
  // Gestapelte Balken ohne Bibliothek: SVG, eine Spalte je Monat, eine
  // Farbe je Tarif. Reicht fuer zwoelf Monate und ist in jeder Breite lesbar.
  var FARBEN = ["#1B2A47", "#B5934F", "#5B7DB1", "#C9AE72", "#7A828C", "#2F6F4E", "#A33A3A"];
  function Stapelbalken(p) {
    var reihen = p.reihen || [];
    if (!reihen.length) return E("div", { style: { fontSize: 13, color: CI.muted } }, p.leer || "Noch keine Tageswerte — der erste Schnappschuss kommt heute Nacht.");
    var schluessel = {};
    reihen.forEach(function (r) { Object.keys(r).forEach(function (k) { if (k !== p.x) schluessel[k] = true; }); });
    var serien = Object.keys(schluessel);
    var max = Math.max.apply(null, reihen.map(function (r) { return serien.reduce(function (s, k) { return s + Math.max(0, Number(r[k] || 0)); }, 0); }).concat([1]));
    var B = 640, H = 180, l = 8, b = Math.max(14, Math.floor((B - 2 * l) / reihen.length) - 6);
    return E("div", null,
      E("svg", { viewBox: "0 0 " + B + " " + (H + 28), style: { width: "100%", height: "auto", display: "block" } },
        reihen.map(function (r, i) {
          var x = l + i * (b + 6), y = H, teile = serien.map(function (k, j) {
            var h = Math.max(0, Number(r[k] || 0)) / max * (H - 10);
            y -= h;
            return E("rect", { key: k, x: x, y: y, width: b, height: h, fill: FARBEN[j % FARBEN.length] },
              E("title", null, r[p.x] + " · " + k + ": " + (p.format ? p.format(r[k]) : zahl(r[k]))));
          });
          return E("g", { key: i }, teile,
            E("text", { x: x + b / 2, y: H + 16, fontSize: 10, textAnchor: "middle", fill: CI.muted }, String(r[p.x]).slice(2)));
        })),
      E("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: CI.muted, marginTop: 6 } },
        serien.map(function (k, j) {
          return E("span", { key: k }, E("span", { style: { display: "inline-block", width: 10, height: 10, background: FARBEN[j % FARBEN.length], marginRight: 4, borderRadius: 2 } }), k);
        })));
  }
  function prozent(x) { return x === null || x === undefined ? "—" : Math.round(Number(x) * 100) + " %"; }

  function Zahlen(p) {
    var d = p.daten;
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Zahlen …");
    var status = d.abos_nach_status || {};
    var v = d.vorher || {};
    var kacheln = [
      ["MRR (netto)", geld(d.mrr_cent), E(Vergleich, { jetzt: d.mrr_cent, vorher: v.mrr_cent }), "ARR " + geld(d.arr_cent || 0)],
      ["Zahlende Mandanten", zahl(d.zahlende !== undefined ? d.zahlende : (status.aktiv || 0) + (status.gekuendigt || 0)),
        E(Vergleich, { jetzt: d.zahlende, vorher: v.zahlende }),
        Object.keys(d.je_tarif || {}).map(function (k) { return k + " " + zahl(d.je_tarif[k].zahlende); }).join(" · ") || "—"],
      ["Neu / gekündigt", zahl(d.neu_zahlend || 0) + " / " + zahl(d.gekuendigt || 0), null,
        zahl(d.kuendigung_vorgemerkt || 0) + " vorgemerkt · Quote " + prozent(d.kuendigungsquote)],
      ["Aktive Testkonten", zahl(d.test_aktiv !== undefined ? d.test_aktiv : status.test || 0), E(Vergleich, { jetzt: d.test_aktiv, vorher: v.test_aktiv }),
        "Umwandlung " + prozent(d.umwandlungsquote) + " (" + zahl(d.test_beendet || 0) + " beendet)"],
      ["Gründerplätze", zahl(d.gruender_belegt || 0) + " / " + zahl(d.gruender_plaetze || 50), null, zahl(d.gruender_frei) + " frei"],
      ["KI-Kosten", euro(d.ki_kosten_eur), null, zahl(d.buchungen_ohne_kosten) + " Buchungen ohne Kostenangabe"],
      ["Deckungsbeitrag", d.deckungsbeitrag_eur !== undefined ? euro(d.deckungsbeitrag_eur) : "—", null,
        "Marge " + prozent(d.marge) + " — ohne Stripe-Gebühren und Pauschale (Schritt 4)"],
      ["Zahlungen offen", zahl(d.zahlung_offen || 0), E(Vergleich, { jetzt: d.zahlung_offen, vorher: v.zahlung_offen, umgekehrt: true }), "fehlgeschlagen, nicht erledigt"],
      ["Support / Technik", (d.support_offen === null || d.support_offen === undefined ? "—" : zahl(d.support_offen)) + " / " + zahl(d.technikfehler_24h || 0), null,
        "offene Anfragen (Schritt 8) / Fehler 24 h"],
    ];
    return E("div", null,
      E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 8 } },
        "Zeitraum " + zahl(d.zeitraum_tage) + " Tage · Vergleich mit den " + zahl(d.zeitraum_tage) + " Tagen davor"),
      E("div", { style: { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 18 } },
        kacheln.map(function (k, i) {
          return E("div", { key: i, style: kasten },
            E("div", { style: { fontSize: 11, color: CI.muted, letterSpacing: "0.06em", textTransform: "uppercase" } }, k[0]),
            E("div", { style: { fontSize: 24, fontWeight: 700, color: CI.blau, margin: "6px 0 4px" } }, k[1], k[2]),
            E("div", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.5 } }, k[3]));
        })),
      E("div", { style: kasten },
        Ueberschrift("Heute zu tun"),
        (d.zu_tun || []).length
          ? (d.zu_tun || []).map(function (z, i) {
              return E("div", { key: i, style: { display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid " + CI.border, fontSize: 13 } },
                E("span", { style: { fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: CI.muted, minWidth: 80 } }, z.art.replace("_", " ")),
                E("span", { style: { flex: 1 } }, z.text),
                p.oeffnen ? E("button", { type: "button", style: knopfLeer, onClick: function () { p.oeffnen(z.mandant_id); } }, "Öffnen") : null);
            })
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Nichts offen.")),
      E("div", { style: kasten },
        Ueberschrift("MRR-Verlauf, 12 Monate, nach Tarif"),
        E(Stapelbalken, { reihen: d.verlauf || [], x: "monat", format: geld })),
      E("div", { style: kasten },
        Ueberschrift("Verbrauch nach Aktion (" + zahl(d.zeitraum_tage) + " Tage)"),
        !(d.je_aktion || []).length
          ? E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch nichts verbraucht.")
          : E("table", { style: { width: "100%", borderCollapse: "collapse" } },
              E("thead", null, E("tr", null,
                E("th", { style: kopfzelle }, "Aktion"),
                E("th", { style: Object.assign({}, kopfzelle, { textAlign: "right" }) }, "Credits"),
                E("th", { style: Object.assign({}, kopfzelle, { textAlign: "right" }) }, "Anbieterkosten"),
                E("th", { style: Object.assign({}, kopfzelle, { textAlign: "right" }) }, "ohne Kostenangabe"))),
              E("tbody", null, d.je_aktion.map(function (a) {
                return E("tr", { key: a.aktion },
                  E("td", { style: zelle }, a.aktion),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, zahl(a.credits)),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, a.mit ? euro(a.kosten) : "—"),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", color: CI.muted }) }, zahl(a.ohne)));
              }))),
        E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.6, marginTop: 12 } },
          "„Ohne Kostenangabe" + "“" + " heisst: der Anbieter nennt keinen Preis je Aufruf "
          + "(Anthropic liefert Token) oder der Dollarkurs fehlt. Diese Buchungen "
          + "zählen beim Verbrauch mit, bei den Kosten nicht — eine geschätzte "
          + "Zahl wäre hier schlimmer als eine fehlende.")));
  }

  // --- Kosten & Marge (fork_72) ------------------------------------------------
  function Kosten(p) {
    var d = p.daten;
    var fZ = React.useState({ bezeichnung: "", betrag: "" }), form = fZ[0], setzeForm = fZ[1];
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Kosten …");
    var g = d.gesamt || {};
    var darf = p.rolle === "owner" || p.rolle === "admin";
    var ergebnis = Number(g.deckung_cent || 0) - Number(d.fixkosten_cent || 0);
    function ampel(ist, ziel) {
      if (ist === null || ist === undefined || !ziel) return E("span", { style: { color: CI.muted } }, "—");
      var abw = (Number(ist) - Number(ziel)) / Number(ziel);
      var farbe = Math.abs(abw) <= 0.2 ? CI.success : Math.abs(abw) <= 0.5 ? CI.gold : CI.danger;
      return E("span", { style: { color: farbe, fontWeight: 600 } }, (abw >= 0 ? "+" : "") + Math.round(abw * 100) + " %");
    }
    async function fixSpeichern() {
      try { await ruf("fixkosten_speichern", { bezeichnung: form.bezeichnung, betrag_cent: Math.round(Number(String(form.betrag).replace(",", ".")) * 100) });
        setzeForm({ bezeichnung: "", betrag: "" }); p.melden("Gespeichert."); p.neuLaden(); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
    }
    return E("div", null,
      E("div", { style: { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 18 } },
        [["Erlös (anteilig)", geld(g.erloes_cent || 0), zahl(d.tage) + " Tage, MRR auf den Zeitraum"],
         ["KI-Kosten", euro(g.ki_eur || 0), "Summe ki_kosten_eur gebuchter Buchungen"],
         ["Stripe-Gebühren", geld(g.gebuehr_cent || 0), d.gebuehr_geschaetzt ? "GESCHÄTZT (" + d.gebuehr_prozent + " % + " + geld(d.gebuehr_fix_cent) + ") — echte Werte mit Schritt 6" : "aus Balance Transactions"],
         ["Infrastruktur", geld(g.pauschale_cent || 0), geld(d.pauschale_cent) + " je zahlendem Mandanten und Monat"],
         ["Deckungsbeitrag", geld(g.deckung_cent || 0), g.erloes_cent ? "Marge " + Math.round(Number(g.deckung_cent) / Number(g.erloes_cent) * 100) + " %" : "—"],
         ["Ergebnis vor Personal & Miete", geld(ergebnis), "Deckungsbeitrag minus " + geld(d.fixkosten_cent || 0) + " Fixkosten (anteilig)"]].map(function (k, i) {
          return E("div", { key: i, style: kasten },
            E("div", { style: { fontSize: 11, color: CI.muted, letterSpacing: "0.06em", textTransform: "uppercase" } }, k[0]),
            E("div", { style: { fontSize: 22, fontWeight: 700, color: CI.blau, margin: "6px 0 4px" } }, k[1]),
            E("div", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.5 } }, k[2]));
        })),
      E("div", { style: kasten },
        Ueberschrift("KI-Kosten je Tag"),
        E(Stapelbalken, { reihen: (d.je_tag || []).map(function (t) { return { tag: String(t.tag).slice(5), "EUR": Number(t.eur) }; }), x: "tag", format: euro, leer: "Keine gebuchten KI-Kosten im Zeitraum." })),
      E("div", { style: kasten },
        Ueberschrift("Ist-Kosten je Credit — Ziel " + euro(d.ziel_je_credit_eur) + " (Ampel bei > 20 % Abweichung)"),
        (d.je_aktion || []).length
          ? E("table", { style: { width: "100%", borderCollapse: "collapse" } },
              E("thead", null, E("tr", null, ["Aktion", "Credits", "KI-Kosten", "Ist je Credit", "Abweichung", "konfiguriert (Credits/Aufruf)"].map(function (h, i) {
                return E("th", { key: i, style: Object.assign({}, kopfzelle, i ? { textAlign: "right" } : {}) }, h); }))),
              E("tbody", null, d.je_aktion.map(function (a) {
                return E("tr", { key: a.aktion },
                  E("td", { style: zelle }, a.aktion),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, zahl(a.credits)),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, a.mit_kosten ? euro(a.eur) : "—"),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, a.ist_je_credit !== null && a.ist_je_credit !== undefined ? euro(a.ist_je_credit) : "—"),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, ampel(a.ist_je_credit, d.ziel_je_credit_eur)),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", color: CI.muted }) }, a.konfiguriert !== null && a.konfiguriert !== undefined ? zahl(a.konfiguriert) : "—"));
              })))
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine Buchungen im Zeitraum.")),
      E("div", { style: kasten },
        Ueberschrift("Je Anbieter und Modell"),
        (d.je_anbieter || []).length
          ? (d.je_anbieter || []).map(function (a, i) {
              return E("div", { key: i, style: { fontSize: 13, padding: "3px 0" } }, a.anbieter + " · " + a.modell + ": " + euro(a.eur || 0) + " · " + zahl(a.credits) + " Credits · " + zahl(a.buchungen) + " Buchungen");
            })
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch keine Buchung trägt Anbieter und Modell — die Spalten gibt es seit fork_72; die KI-Steuerung (Schritt 9) setzt sie zentral.")),
      E("div", { style: kasten },
        Ueberschrift("Deckungsbeitrag je Tarif"),
        E("table", { style: { width: "100%", borderCollapse: "collapse" } },
          E("thead", null, E("tr", null, ["Tarif", "Mandanten", "Erlös", "KI", "Gebühr*", "Pauschale", "Deckung", "Marge"].map(function (h, i) {
            return E("th", { key: i, style: Object.assign({}, kopfzelle, i ? { textAlign: "right" } : {}) }, h); }))),
          E("tbody", null, (d.je_tarif || []).map(function (t) {
            return E("tr", { key: t.tarif },
              E("td", { style: zelle }, t.tarif),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, zahl(t.mandanten)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(t.erloes_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, euro(t.ki_eur)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(t.gebuehr_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(t.pauschale_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right", fontWeight: 600 }) }, geld(t.deckung_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, t.erloes_cent ? Math.round(t.deckung_cent / t.erloes_cent * 100) + " %" : "—"));
          })))),
      E("div", { style: kasten },
        E("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          Ueberschrift("Deckungsbeitrag je Mandant"),
          E("button", { type: "button", style: Object.assign({}, knopfLeer, { marginLeft: "auto", marginBottom: 12 }), onClick: function () {
            csvExport("deckungsbeitrag.csv", [["Mandant", "name"], ["Tarif", "tarif"],
              ["Erloes EUR", function (r) { return r.erloes_cent / 100; }], ["KI EUR", "ki_eur"],
              ["Gebuehr EUR (geschaetzt)", function (r) { return r.gebuehr_cent / 100; }],
              ["Pauschale EUR", function (r) { return r.pauschale_cent / 100; }],
              ["Deckung EUR", function (r) { return r.deckung_cent / 100; }], ["ueber Kostengrenze", "ueber_grenze"]], d.je_mandant || []); } }, "CSV")),
        E("div", { style: { overflowX: "auto" } }, E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 760 } },
          E("thead", null, E("tr", null, ["Mandant", "Tarif", "Erlös", "KI", "Gebühr*", "Pauschale", "Deckung", ""].map(function (h, i) {
            return E("th", { key: i, style: Object.assign({}, kopfzelle, i > 1 ? { textAlign: "right" } : {}) }, h); }))),
          E("tbody", null, (d.je_mandant || []).map(function (j) {
            return E("tr", { key: j.mandant_id, style: j.ueber_grenze ? { background: "#fff7e6" } : null },
              E("td", { style: zelle }, j.name, j.ueber_grenze ? E("span", { style: { fontSize: 11, color: "#6b4e13", marginLeft: 6 } }, "über Kostengrenze") : null),
              E("td", { style: zelle }, j.tarif || "—"),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(j.erloes_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, euro(j.ki_eur)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(j.gebuehr_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(j.pauschale_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right", fontWeight: 600, color: j.deckung_cent < 0 ? CI.danger : CI.blau }) }, geld(j.deckung_cent)),
              E("td", { style: zelle }, p.oeffnen ? E("button", { type: "button", style: knopfLeer, onClick: function () { p.oeffnen(j.mandant_id); } }, "Öffnen") : null));
          })))),
        E("p", { style: { fontSize: 11.5, color: CI.muted, marginTop: 10 } },
          "* Gebühr geschätzt, bis die Stripe-Balance-Transactions gespiegelt sind (Schritt 6). Warnliste: KI-Kosten über " + zahl(d.warnung_prozent) + " % des Erlöses.")),
      E("div", { style: kasten },
        Ueberschrift("Monatliche Fixkosten"),
        (d.fixkosten || []).map(function (f) {
          return E("div", { key: f.id, style: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0", borderBottom: "1px solid " + CI.border } },
            E("span", { style: { flex: 1, color: f.aktiv ? CI.blau : CI.muted } }, f.bezeichnung + (f.aktiv ? "" : " (inaktiv)")),
            E("span", null, geld(f.betrag_cent) + " / Monat"),
            darf ? E("button", { type: "button", style: knopfLeer, onClick: function () {
              ruf("fixkosten_speichern", { id: f.id, bezeichnung: f.bezeichnung, betrag_cent: f.betrag_cent, aktiv: !f.aktiv }).then(p.neuLaden).catch(function (e) { p.melden(e.message, "fehler"); }); } }, f.aktiv ? "Deaktivieren" : "Aktivieren") : null,
            darf ? E("button", { type: "button", style: knopfLeer, onClick: function () {
              if (!window.confirm("„" + f.bezeichnung + "“ löschen?")) return;
              ruf("fixkosten_loeschen", { id: f.id }).then(p.neuLaden).catch(function (e) { p.melden(e.message, "fehler"); }); } }, "Löschen") : null);
        }),
        darf ? E("div", { style: { display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr auto", alignItems: "end", marginTop: 10 } },
          E("input", { style: feld, placeholder: "Bezeichnung (Hosting, Werkzeuge, Versicherung …)", value: form.bezeichnung,
            onChange: function (e) { setzeForm(Object.assign({}, form, { bezeichnung: e.target.value })); } }),
          E("input", { style: feld, placeholder: "EUR je Monat", value: form.betrag,
            onChange: function (e) { setzeForm(Object.assign({}, form, { betrag: e.target.value })); } }),
          E("button", { type: "button", style: knopf, disabled: form.bezeichnung.trim().length < 2 || !form.betrag, onClick: fixSpeichern }, "Hinzufügen")) : null));
  }

  // --- Umsatz & Abos (fork_70) ------------------------------------------------
  function Umsatz(p) {
    var d = p.daten;
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Umsatz …");
    var vt = d.verteilung || { je_tarif: {} };
    var kohorten = Object.keys(d.kohorten || {}).sort();
    return E("div", null,
      E("div", { style: { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 18 } },
        [["Monatlich / jährlich", zahl(vt.monat || 0) + " / " + zahl(vt.jahr || 0)],
         ["Gründerkunden", zahl(vt.gruender || 0)],
         ["Je Tarif", Object.keys(vt.je_tarif || {}).map(function (k) { return k + " " + zahl(vt.je_tarif[k]); }).join(" · ") || "—"],
         ["Tagesschnappschüsse", zahl(d.schnappschuesse || 0)]].map(function (k, i) {
          return E("div", { key: i, style: kasten },
            E("div", { style: { fontSize: 11, color: CI.muted, letterSpacing: "0.06em", textTransform: "uppercase" } }, k[0]),
            E("div", { style: { fontSize: 20, fontWeight: 700, color: CI.blau, marginTop: 6 } }, k[1]));
        })),
      E("div", { style: kasten },
        Ueberschrift("MRR-Bewegung je Monat (Wasserfall)"),
        (d.wasserfall || []).length
          ? E("div", { style: { overflowX: "auto" } }, E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 640 } },
              E("thead", null, E("tr", null, ["Monat", "Neu", "Erweiterung", "Verkleinerung", "Kündigung", "Netto"].map(function (h, i) {
                return E("th", { key: i, style: Object.assign({}, kopfzelle, i ? { textAlign: "right" } : {}) }, h); }))),
              E("tbody", null, d.wasserfall.map(function (w) {
                return E("tr", { key: w.monat },
                  E("td", { style: zelle }, w.monat),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", color: CI.success }) }, geld(w.neu)),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", color: CI.success }) }, geld(w.erweiterung)),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", color: CI.danger }) }, geld(w.verkleinerung)),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", color: CI.danger }) }, geld(w.kuendigung)),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", fontWeight: 600 }) }, geld(w.netto)));
              }))))
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch keine zwei Monate mit Schnappschüssen.")),
      E("div", { style: kasten },
        Ueberschrift("Kohorten — Verbleib nach Startmonat"),
        kohorten.length
          ? E("table", { style: { width: "100%", borderCollapse: "collapse" } },
              E("thead", null, E("tr", null, ["Startmonat", "Größe", "nach 1", "nach 3", "nach 6", "nach 12"].map(function (h, i) {
                return E("th", { key: i, style: Object.assign({}, kopfzelle, i ? { textAlign: "right" } : {}) }, h); }))),
              E("tbody", null, kohorten.map(function (k) {
                var c = d.kohorten[k];
                return E("tr", { key: k }, E("td", { style: zelle }, k),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, zahl(c.groesse)),
                  ["1", "3", "6", "12"].map(function (n) {
                    return E("td", { key: n, style: Object.assign({}, zelle, { textAlign: "right" }) },
                      c.groesse ? Math.round(c.nach[n] / c.groesse * 100) + " %" : "—");
                  }));
              })))
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch keine Kohorte.")),
      E("div", { style: kasten },
        Ueberschrift("Credit-Pakete je Monat"),
        Object.keys(d.pakete || {}).length
          ? Object.keys(d.pakete).sort().map(function (m) {
              return E("div", { key: m, style: { fontSize: 13, padding: "3px 0" } }, m + ": " + zahl(d.pakete[m].anzahl) + " Pakete · " + zahl(d.pakete[m].credits) + " Credits");
            })
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine Pakete im letzten Jahr. Umsatz je Paket kommt mit den Rechnungen (Schritt 6).")),
      E("div", { style: kasten },
        Ueberschrift("Mindestlaufzeit endet in den nächsten 30 Tagen"),
        (d.mindestlaufzeit || []).length
          ? (d.mindestlaufzeit || []).map(function (m) {
              return E("div", { key: m.mandant_id, style: { fontSize: 13, padding: "4px 0", display: "flex", gap: 8, alignItems: "center" } },
                E("span", { style: { flex: 1 } }, m.name + " · " + (m.tarif || "") + " · bis " + datum(m.bis)),
                p.oeffnen ? E("button", { type: "button", style: knopfLeer, onClick: function () { p.oeffnen(m.mandant_id); } }, "Öffnen") : null);
            })
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine.")),
      E("div", { style: kasten },
        Ueberschrift("Kündigung vorgemerkt"),
        (d.vorgemerkt || []).length
          ? (d.vorgemerkt || []).map(function (m) {
              return E("div", { key: m.mandant_id, style: { fontSize: 13, padding: "4px 0", display: "flex", gap: 8, alignItems: "center" } },
                E("span", { style: { flex: 1 } }, m.name + " · gekündigt " + datum(m.gekuendigt_am) + " · wirksam " + datum(m.wirksam)),
                p.oeffnen ? E("button", { type: "button", style: knopfLeer, onClick: function () { p.oeffnen(m.mandant_id); } }, "Öffnen") : null);
            })
          : E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine.")));
  }

  // --- Mandanten ------------------------------------------------------------
  function Mandanten(p) {
    var gZ = React.useState(null), geschenk = gZ[0], setzeGeschenk = gZ[1];
    var aZ = React.useState({ credits: 100, grund: "" }), form = aZ[0], setzeForm = aZ[1];
    var bZ = React.useState(false), busy = bZ[0], setzeBusy = bZ[1];
    var sZ = React.useState(""), suche = sZ[0], setzeSuche = sZ[1];
    var fZ = React.useState(""), filter = fZ[0], setzeFilter = fZ[1];
    var oZ = React.useState({ feld: "name", richtung: "auf" }), sort = oZ[0], setzeSort = oZ[1];
    if (!p.daten) return E("div", { style: { color: CI.muted } }, "Lade Mandanten …");
    var bald = Date.now() + 3 * 86400000;
    var zeilen = sortiere(p.daten.filter(function (m) {
      var s = suche.trim().toLowerCase();
      if (s && !((m.name || "").toLowerCase().indexOf(s) >= 0 || (m.slug || "").toLowerCase().indexOf(s) >= 0
                 || String(m.id).toLowerCase().indexOf(s) >= 0)) return false;
      if (filter === "risiko") return (m.gesundheit !== null && m.gesundheit < 40) || !!m.zahlung_fehler_seit;
      if (filter === "test_bald") return m.status === "test" && m.testphase_bis && new Date(m.testphase_bis).getTime() < bald;
      if (filter === "zahlung") return !!m.zahlung_fehler_seit;
      return true;
    }), sort.feld, sort.richtung);
    function kopf(titel, feld) {
      var an = sort.feld === feld;
      return E("th", { key: feld || titel, style: Object.assign({}, kopfzelle, { cursor: feld ? "pointer" : "default", whiteSpace: "nowrap" }),
        onClick: feld ? function () { setzeSort({ feld: feld, richtung: an && sort.richtung === "auf" ? "ab" : "auf" }); } : null },
        titel + (an ? (sort.richtung === "auf" ? " ▲" : " ▼") : ""));
    }

    async function schenken() {
      setzeBusy(true);
      try {
        await ruf("credits_schenken", {
          mandant_id: geschenk.id, credits: Number(form.credits), grund: form.grund,
        });
        setzeGeschenk(null);
        setzeForm({ credits: 100, grund: "" });
        p.neuLaden();
      } catch (f) { p.melden(f.message || String(f)); }
      setzeBusy(false);
    }

    var schnell = [["", "Alle"], ["risiko", "Risiko"], ["test_bald", "Test endet bald"], ["zahlung", "Zahlung offen"]];
    return E("div", null,
      E("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 } },
        E("input", { style: Object.assign({}, feld, { width: 260 }), value: suche, placeholder: "Firmenname, Kürzel oder Mandanten-ID",
          onChange: function (e) { setzeSuche(e.target.value); } }),
        schnell.map(function (f) {
          var an = filter === f[0];
          return E("button", { key: f[0], type: "button", onClick: function () { setzeFilter(f[0]); },
            style: Object.assign({}, knopfLeer, an ? { background: CI.blau, color: "#fff", borderColor: CI.blau } : {}) }, f[1]);
        }),
        E("span", { style: { fontSize: 12, color: CI.muted, marginLeft: "auto" } }, zeilen.length + " von " + p.daten.length),
        E("button", { type: "button", style: knopfLeer, onClick: function () {
          csvExport("mandanten.csv", [["Firma", "name"], ["Mandanten-ID", "id"], ["Tarif", "tarif_name"],
            ["Status", "status"], ["Zugriff", "zugriff"], ["Nutzer", "nutzer"], ["Credits", "saldo"],
            ["MRR netto EUR", function (r) { return Number(r.mrr_cent || 0) / 100; }],
            ["Letzter Login", "letzter_login"], ["Aktive Nutzer 14 Tage", "aktive_14"],
            ["Onboarding von 8", "onboarding"], ["Gesundheit", "gesundheit"], ["Erstellt am", "erstellt_am"]], zeilen); } }, "CSV")),
      E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
        E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 1100 } },
          E("thead", null, E("tr", null,
            kopf("Haus", "name"), kopf("Tarif", "tarif_name"), kopf("Status", "status"), kopf("Zugriff", "zugriff"),
            kopf("Nutzer", "nutzer"), kopf("Credits", "saldo"), kopf("Monatserlös", "mrr_cent"),
            kopf("Letzter Login", "letzter_login"), kopf("Gesundheit", "gesundheit"), kopf("Fristen", null), kopf("", null))),
          E("tbody", null, zeilen.map(function (m) {
            return E("tr", { key: m.id },
              E("td", { style: zelle },
                E("div", { style: { fontWeight: 600, color: CI.blau } }, m.name),
                E("div", { style: { fontSize: 11, color: CI.muted } },
                  "seit " + datum(m.erstellt_am) + (m.gruenderpreis ? " · Gründerpreis" : ""))),
              E("td", { style: zelle }, m.tarif_name || "—",
                m.intervall ? E("div", { style: { fontSize: 11, color: CI.muted } },
                  m.intervall === "jahr" ? "jährlich" : "monatlich") : null),
              E("td", { style: zelle }, m.status || "—",
                m.zahlung_fehler_seit ? E("div", { style: { fontSize: 11, color: CI.danger } },
                  "Zahlung offen seit " + datum(m.zahlung_fehler_seit)) : null),
              E("td", { style: Object.assign({}, zelle, {
                color: m.zugriff === "voll" ? CI.success
                  : m.zugriff === "nur_lesen" ? CI.gold : CI.danger, fontWeight: 600,
              }) }, m.zugriff),
              E("td", { style: zelle }, zahl(m.nutzer)
                + (m.zusatznutzer ? " (+" + zahl(m.zusatznutzer) + ")" : "")),
              E("td", { style: zelle }, zahl(m.saldo)),
              E("td", { style: zelle }, m.mrr_cent ? geld(m.mrr_cent) : "—"),
              E("td", { style: Object.assign({}, zelle, { fontSize: 12 }) },
                m.letzter_login ? datum(m.letzter_login) : E("span", { style: { color: CI.muted } }, "nie"),
                E("div", { style: { fontSize: 11, color: CI.muted } }, zahl(m.aktive_14 || 0) + " aktiv · " + zahl(m.onboarding || 0) + "/8")),
              E("td", { style: zelle }, E(Ampel, { wert: m.gesundheit })),
              E("td", { style: Object.assign({}, zelle, { fontSize: 11.5, color: CI.muted }) },
                m.testphase_bis && m.status === "test" ? "Test bis " + datum(m.testphase_bis) : null,
                m.cancel_at ? E("div", null, "endet " + datum(m.cancel_at)) : null,
                m.mindestlaufzeit_bis ? E("div", null, "Mindestlaufzeit bis " + datum(m.mindestlaufzeit_bis)) : null),
              E("td", { style: zelle },
                E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                  E("button", { type: "button", style: knopfLeer,
                    onClick: function () { p.oeffnen(m.id); } }, "Öffnen"),
                  E("button", { type: "button", style: knopfLeer,
                    onClick: function () { setzeGeschenk(m); } }, "Credits"))));
          })))),
      E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7 } },
        "Diese Liste zeigt die Vertragsbeziehung, nicht die Arbeit der Häuser. "
        + "Objekte, Kontakte, Mails und Dateien eines Mandanten sind von hier "
        + "aus nicht erreichbar — auch nicht für einen Plattform-Administrator."),

      geschenk ? E("div", { style: {
        position: "fixed", inset: 0, background: "rgba(18,32,59,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16,
      } },
        E("div", { style: Object.assign({}, kasten, { maxWidth: 460, width: "100%", marginBottom: 0 }) },
          Ueberschrift("Credits gutschreiben"),
          E("div", { style: { fontSize: 14, color: CI.blau, marginBottom: 12 } }, geschenk.name),
          E("label", { style: { fontSize: 12, color: CI.muted, display: "block", marginBottom: 4 } }, "Anzahl"),
          E("input", { type: "number", min: 1, max: 100000, value: form.credits, style: feld,
            onChange: function (e) { setzeForm(Object.assign({}, form, { credits: e.target.value })); } }),
          E("label", { style: { fontSize: 12, color: CI.muted, display: "block", margin: "12px 0 4px" } },
            "Grund — steht im Protokoll und lässt sich nicht löschen"),
          E("textarea", { rows: 3, value: form.grund, style: Object.assign({}, feld, { resize: "vertical" }),
            placeholder: "z. B. Ausgleich für den Ausfall am 12.11.",
            onChange: function (e) { setzeForm(Object.assign({}, form, { grund: e.target.value })); } }),
          E("div", { style: { display: "flex", gap: 8, marginTop: 14 } },
            E("button", { type: "button", style: knopf, disabled: busy || String(form.grund).trim().length < 5,
              onClick: schenken }, busy ? "Schreibt …" : "Gutschreiben"),
            E("button", { type: "button", style: knopfLeer, disabled: busy,
              onClick: function () { setzeGeschenk(null); } }, "Abbrechen")),
          E("p", { style: { fontSize: 11.5, color: CI.muted, marginTop: 10, lineHeight: 1.6 } },
            "Gutgeschriebene Credits sind zwölf Monate gültig und werden nach "
            + "den Inklusiv-Credits verbraucht."))) : null);
  }

  // --- Ein Mandant im Einzelnen ----------------------------------------------
  // Alles, was der Betreiber zu einem Haus wissen und ändern können muss —
  // und nichts darüber hinaus. Was das Haus mit der Software TUT, steht
  // hier nicht; dafür gibt es den Supportzugriff, und der ist befristet,
  // begründet und für den Kunden nachlesbar.
  function MandantTafel(p) {
    var eZ = React.useState({}), entwurf = eZ[0], setzeEntwurf = eZ[1];
    var gZ = React.useState(""), grund = gZ[0], setzeGrund = gZ[1];
    var bZ = React.useState(""), busy = bZ[0], setzeBusy = bZ[1];
    var lZ = React.useState(""), loeschwort = lZ[0], setzeLoeschwort = lZ[1];
    var sZ = React.useState({ grund: "", schreiben: false }), sup = sZ[0], setzeSup = sZ[1];
    var d = p.daten;
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Mandant …");
    var m = d.mandant, a = d.abo || {};

    function feldwert(name, aus) {
      return Object.prototype.hasOwnProperty.call(entwurf, name) ? entwurf[name] : aus;
    }
    function setzen(name, w) {
      var n = {}; n[name] = w;
      setzeEntwurf(Object.assign({}, entwurf, n));
    }
    async function speichern() {
      setzeBusy("speichern");
      try {
        var r = await ruf("mandant_speichern", Object.assign({}, entwurf,
          { mandant_id: m.id, grund: grund }));
        setzeEntwurf({}); setzeGrund("");
        p.melden(r.stripe_laeuft
          ? "Gespeichert. ACHTUNG: dieser Mandant hat ein laufendes "
            + "Stripe-Abo — der nächste Webhook überschreibt den Vertragsstand "
            + "wieder mit dem, was Stripe meldet."
          : "Gespeichert.", r.stripe_laeuft ? "warnung" : "ok");
        p.neuLaden();
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }
    async function loeschen() {
      setzeBusy("loeschen");
      try {
        await ruf("mandant_loeschen",
          { mandant_id: m.id, grund: grund, bestaetigung: loeschwort });
        p.melden("„" + m.name + "\u201c wurde mit allen Daten gelöscht.", "ok");
        p.zurueck();
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }
    async function supportStarten() {
      setzeBusy("support");
      try {
        var r = await ruf("support_start",
          { mandant_id: m.id, grund: sup.grund, schreiben: sup.schreiben });
        p.melden("Supportzugriff läuft bis "
          + zeit(r.sitzung && r.sitzung.gueltig_bis)
          + (sup.schreiben ? " — MIT Schreibrecht." : " — nur lesend.")
          + " Der Mandant kann den Zugriff nachlesen.", "warnung");
        setzeSup({ grund: "", schreiben: false });
        p.supportNeu();
        p.neuLaden();
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }

    var geaendert = Object.keys(entwurf).length > 0;
    var tarife = (p.katalog && p.katalog.tarife) || [];
    var md = d.metadaten || null, onb = (md && md.onboarding) || {};
    var nZ = React.useState(""), notiz = nZ[0], setzeNotiz = nZ[1];
    var abZ = React.useState(null), abzug = abZ[0], setzeAbzug = abZ[1];
    var rolle = p.rolle || "admin";

    function testPlus(tage) {
      var basis = m.testphase_bis && new Date(m.testphase_bis).getTime() > Date.now()
        ? new Date(m.testphase_bis) : new Date();
      basis.setDate(basis.getDate() + tage);
      setzen("testphase_bis", basis.toISOString().slice(0, 10));
    }
    async function notizSpeichern() {
      if (!notiz.trim()) return;
      setzeBusy("notiz");
      try { await ruf("notiz_anlegen", { mandant_id: m.id, text: notiz }); setzeNotiz(""); p.neuLaden(); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }
    async function abziehen() {
      setzeBusy("abzug");
      try {
        await ruf("credits_abziehen", { mandant_id: m.id, credits: Number(abzug.credits), grund: abzug.grund });
        setzeAbzug(null); p.melden("Abgezogen."); p.neuLaden();
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }
    var onbListe = [["Logo hochgeladen", onb.logo ? true : false, null], ["Farben gesetzt", !!onb.farben, null],
      ["Schrift gewählt", !!onb.schrift, null], ["Erstes Objekt angelegt", !!onb.objekt_am, onb.objekt_am],
      ["Erstes Exposé erzeugt", !!onb.expose_am, onb.expose_am], ["Erste E-Signatur", !!onb.signatur_am, onb.signatur_am],
      ["Postfach verbunden", !!onb.postfach_am, onb.postfach_am], ["Mitarbeiter eingeladen", !!onb.mitarbeiter_am, onb.mitarbeiter_am]];

    return E("div", null,
      E("button", { type: "button", style: knopfLeer, onClick: p.zurueck },
        "\u2190 Zurück zur Liste"),
      E("div", { style: Object.assign({}, kasten, { marginTop: 14 }) },
        Ueberschrift("Haus"),
        E("div", { style: { fontSize: 20, fontWeight: 700, color: CI.blau, marginBottom: 4 } },
          m.name),
        E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 14 } },
          m.slug + " · angelegt am " + datum(m.erstellt_am) + " · Zugriff: " + d.zugriff),
        E("div", { style: { display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" } },
          E("div", null,
            E("label", { style: { fontSize: 12, color: CI.muted, display: "block" } }, "Name"),
            E("input", { style: feld, value: feldwert("name", m.name),
              onChange: function (e) { setzen("name", e.target.value); } })),
          E("div", null,
            E("label", { style: { fontSize: 12, color: CI.muted, display: "block" } }, "Tarif"),
            E("select", { style: feld, value: feldwert("tarif", a.tarif || ""),
              onChange: function (e) { setzen("tarif", e.target.value); } },
              E("option", { value: "" }, "— keiner —"),
              tarife.filter(function (t) { return !t.ist_zusatznutzer; }).map(function (t) {
                return E("option", { key: t.schluessel, value: t.schluessel }, t.name);
              }))),
          E("div", null,
            E("label", { style: { fontSize: 12, color: CI.muted, display: "block" } }, "Abo-Status"),
            E("select", { style: feld, value: feldwert("abo_status", a.status || ""),
              onChange: function (e) { setzen("abo_status", e.target.value); } },
              ["", "test", "aktiv", "gekuendigt", "zahlung_offen", "abgelaufen"]
                .map(function (w) { return E("option", { key: w, value: w }, w || "— unverändert —"); }))),
          E("div", null,
            E("label", { style: { fontSize: 12, color: CI.muted, display: "block" } }, "Testphase bis"),
            E("input", { type: "date", style: feld,
              value: String(feldwert("testphase_bis", m.testphase_bis) || "").slice(0, 10),
              onChange: function (e) { setzen("testphase_bis", e.target.value || null); } })),
          E("div", null,
            E("label", { style: { fontSize: 12, color: CI.muted, display: "block" } }, "Zusatznutzer"),
            E("input", { type: "number", min: 0, style: feld,
              value: feldwert("zusatznutzer", a.zusatznutzer || 0),
              onChange: function (e) { setzen("zusatznutzer", e.target.value); } })),
          E("div", null,
            E("label", { style: { fontSize: 12, color: CI.muted, display: "block" } }, "Mindestlaufzeit bis"),
            E("input", { type: "date", style: feld,
              value: String(feldwert("mindestlaufzeit_bis", a.mindestlaufzeit_bis) || "").slice(0, 10),
              onChange: function (e) { setzen("mindestlaufzeit_bis", e.target.value || null); } }))),
        E("label", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13.5 } },
          E("input", { type: "checkbox", checked: !!feldwert("gesperrt", !!m.gesperrt_am),
            onChange: function (e) { setzen("gesperrt", e.target.checked); } }),
          "Gesperrt — der Zugang ist sofort zu, für alle im Haus"),
        m.gesperrt_am ? E("div", { style: { fontSize: 12, color: CI.danger, marginTop: 4 } },
          "Gesperrt seit " + datum(m.gesperrt_am)
          + (m.gesperrt_grund ? ": " + m.gesperrt_grund : "")) : null,
        E("div", { style: { display: "flex", gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" } },
          E("span", { style: { fontSize: 12, color: CI.muted } }, "Testphase verlängern:"),
          [7, 14, 30].map(function (tg) {
            return E("button", { key: tg, type: "button", style: knopfLeer, onClick: function () { testPlus(tg); } }, "+" + tg + " Tage");
          })),
        geaendert ? E("div", { style: { marginTop: 14 } },
          E("label", { style: { fontSize: 12, color: CI.muted, display: "block", marginBottom: 4 } },
            "Grund — steht im Protokoll"),
          E("input", { style: feld, value: grund,
            onChange: function (e) { setzeGrund(e.target.value); } }),
          E("button", { type: "button", style: Object.assign({}, knopf, { marginTop: 10 }),
            disabled: !!busy || grund.trim().length < 5, onClick: speichern },
            busy === "speichern" ? "Speichert …" : "Änderungen speichern")) : null,
        a.stripe_customer_id || a.stripe_subscription_id
          ? E("p", { style: { fontSize: 11.5, color: CI.muted, marginTop: 12, lineHeight: 1.6 } },
              "Dieser Mandant hat ein Konto bei Stripe. Was hier gesetzt wird, "
              + "ist der Vertragsstand in der Datenbank — der nächste Webhook "
              + "überschreibt ihn mit dem, was Stripe meldet. Dauerhafte "
              + "Änderungen gehören deshalb nach Stripe.")
          : null),

      md ? E("div", { style: kasten },
        Ueberschrift("Onboarding und Nutzung — nur Zählwerte"),
        E("div", { style: { display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" } },
          onbListe.map(function (o) {
            return E("div", { key: o[0], style: { fontSize: 13 } },
              E("span", { style: { color: o[1] ? CI.success : CI.muted, marginRight: 6 } }, o[1] ? "✓" : "○"),
              o[0], o[2] ? E("span", { style: { fontSize: 11, color: CI.muted } }, " · " + datum(o[2])) : null);
          })),
        E("div", { style: { display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontSize: 12.5, color: CI.muted } },
          Object.keys(md.zaehlwerte || {}).map(function (k) {
            return E("span", { key: k }, E("strong", { style: { color: CI.blau } }, zahl(md.zaehlwerte[k])), " " + k);
          })),
        Object.keys(md.module || {}).length ? E("div", { style: { marginTop: 12 } },
          E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 4 } }, "Aktionen je Modul, letzte 30 Tage"),
          E("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5 } },
            Object.keys(md.module).sort(function (a, b) { return md.module[b] - md.module[a]; }).map(function (k) {
              return E("span", { key: k, style: { background: CI.bg, border: "1px solid " + CI.border, borderRadius: 6, padding: "2px 8px" } },
                k + " " + zahl(md.module[k]));
            }))) : null,
        E("div", { style: { marginTop: 12 } },
          E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 4 } }, "Speicher je Bucket"),
          Object.keys(md.speicher || {}).length
            ? E("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5 } },
                Object.keys(md.speicher).map(function (k) { return E("span", { key: k }, k + ": " + mb(md.speicher[k])); }))
            : E("span", { style: { fontSize: 12.5, color: CI.muted } }, "nichts abgelegt"))) : null,

      E("div", { style: kasten },
        Ueberschrift("Credits"),
        E("div", { style: { fontSize: 24, fontWeight: 700, color: CI.blau } },
          zahl(d.saldo), E("span", { style: { fontSize: 13, fontWeight: 400, color: CI.muted } }, " verfügbar"),
          (rolle === "owner" || rolle === "admin") ? E("button", { type: "button", style: Object.assign({}, knopfLeer, { marginLeft: 12 }),
            onClick: function () { setzeAbzug({ credits: 10, grund: "" }); } }, "Abziehen") : null),
        abzug ? E("div", { style: { marginTop: 10, display: "grid", gap: 8, gridTemplateColumns: "120px 1fr auto auto", alignItems: "end" } },
          E("input", { type: "number", min: 1, style: feld, value: abzug.credits,
            onChange: function (e) { setzeAbzug(Object.assign({}, abzug, { credits: e.target.value })); } }),
          E("input", { style: feld, value: abzug.grund, placeholder: "Grund — steht im Ledger und im Audit-Log",
            onChange: function (e) { setzeAbzug(Object.assign({}, abzug, { grund: e.target.value })); } }),
          E("button", { type: "button", style: knopf, disabled: !!busy || abzug.grund.trim().length < 5, onClick: abziehen },
            busy === "abzug" ? "Zieht ab …" : "Abziehen"),
          E("button", { type: "button", style: knopfLeer, onClick: function () { setzeAbzug(null); } }, "Abbrechen")) : null,
        (d.konten || []).length
          ? E("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 10 } },
              E("thead", null, E("tr", null, ["Topf", "Gutgeschrieben", "Verbraucht", "Gültig bis", "Herkunft"]
                .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
              E("tbody", null, d.konten.map(function (k, i) {
                return E("tr", { key: i },
                  E("td", { style: zelle }, k.quelle),
                  E("td", { style: zelle }, zahl(k.credits)),
                  E("td", { style: zelle }, zahl(k.verbraucht)),
                  E("td", { style: zelle }, k.gueltig_bis ? datum(k.gueltig_bis) : "—"),
                  E("td", { style: Object.assign({}, zelle, { fontSize: 11.5, color: CI.muted }) },
                    k.referenz || "—"));
              })))
          : E("div", { style: { fontSize: 13, color: CI.muted, marginTop: 8 } }, "Keine Töpfe.")),

      E("div", { style: kasten },
        Ueberschrift("Konten im Haus (" + zahl((d.nutzer || []).length)
          + " von " + zahl(d.nutzer_limit) + ")"),
        E("table", { style: { width: "100%", borderCollapse: "collapse" } },
          E("thead", null, E("tr", null, ["Name", "Adresse", "Rolle", "Funktion", "Letzter Login"]
            .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
          E("tbody", null, (d.nutzer || []).map(function (n) {
            return E("tr", { key: n.id },
              E("td", { style: zelle }, n.name || "—"),
              E("td", { style: zelle }, n.email),
              E("td", { style: zelle }, n.role),
              E("td", { style: zelle }, n.funktion || "—"),
              E("td", { style: Object.assign({}, zelle, { fontSize: 12 }) }, n.letzter_login ? zeit(n.letzter_login) : "nie"));
          })))),

      E("div", { style: kasten },
        Ueberschrift("Notizen des Betreibers"),
        E("div", { style: { display: "flex", gap: 8 } },
          E("input", { style: feld, value: notiz, placeholder: "Interne Notiz — der Mandant sieht sie nie",
            onChange: function (e) { setzeNotiz(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") notizSpeichern(); } }),
          E("button", { type: "button", style: knopf, disabled: !!busy || !notiz.trim(), onClick: notizSpeichern }, "Notieren")),
        (d.notizen || []).map(function (n) {
          return E("div", { key: n.id, style: { fontSize: 13, padding: "8px 0", borderBottom: "1px solid " + CI.border } },
            E("div", { style: { fontSize: 11, color: CI.muted } }, zeit(n.erstellt_am)), n.text);
        })),

      E("div", { style: kasten },
        Ueberschrift("Verlauf — was Betreiber an diesem Haus getan haben"),
        (d.verlauf || []).length ? (d.verlauf || []).map(function (v) {
          return E("div", { key: v.id, style: { fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid " + CI.border } },
            E("span", { style: { color: CI.muted } }, zeit(v.erstellt_am) + " · " + (v.rolle || "") + " · "),
            E("strong", null, v.aktion),
            v.begruendung ? E("span", { style: { color: CI.muted } }, " — " + v.begruendung) : null);
        }) : E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch nichts.")),

      E("div", { style: kasten },
        Ueberschrift("In dieses Haus hineinsehen"),
        E("p", { style: { fontSize: 13, color: CI.muted, lineHeight: 1.7, marginTop: 0 } },
          "Ein Supportzugriff gilt befristet, verlangt einen Grund, steht im "
          + "Protokoll — und der Mandant kann ihn selbst nachlesen. Ohne "
          + "Schreibrecht wird nur gelesen; auch gelöscht werden kann dann "
          + "nichts."),
        E("input", { style: feld, value: sup.grund,
          placeholder: "Grund, z. B. „Kunde meldet fehlende Bilder (Ticket 214)"
            + "\u201c",
          onChange: function (e) { setzeSup(Object.assign({}, sup, { grund: e.target.value })); } }),
        E("label", { style: { display: "flex", alignItems: "center", gap: 8, margin: "10px 0", fontSize: 13.5 } },
          E("input", { type: "checkbox", checked: sup.schreiben,
            onChange: function (e) { setzeSup(Object.assign({}, sup, { schreiben: e.target.checked })); } }),
          "Auch ändern dürfen (nur, wenn der Kunde darum gebeten hat)"),
        E("button", { type: "button", style: knopf,
          disabled: !!busy || sup.grund.trim().length < 5, onClick: supportStarten },
          busy === "support" ? "Beginnt …" : "Supportzugriff beginnen"),
        (d.sitzungen || []).length
          ? E("div", { style: { marginTop: 14 } },
              E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 6 } },
                "Bisherige Zugriffe"),
              (d.sitzungen || []).map(function (sz) {
                return E("div", { key: sz.id, style: { fontSize: 12.5, color: CI.muted, padding: "3px 0" } },
                  zeit(sz.begonnen_am) + " · " + (sz.schreiben ? "lesen und ändern" : "nur lesen")
                  + " · " + sz.grund);
              }))
          : null),

      E("div", { style: Object.assign({}, kasten, { borderColor: "#e8c4c0" }) },
        Ueberschrift("Haus löschen"),
        E("p", { style: { fontSize: 13, color: CI.muted, lineHeight: 1.7, marginTop: 0 } },
          "Alles geht mit: Objekte, Kontakte, Mails, Dateien, Rechnungen und "
          + "das Credit-Ledger. Rückgängig gibt es nicht. Zur Bestätigung den "
          + "Namen des Hauses eintragen."),
        E("input", { style: feld, value: loeschwort, placeholder: m.name,
          onChange: function (e) { setzeLoeschwort(e.target.value); } }),
        E("input", { style: Object.assign({}, feld, { marginTop: 8 }), value: grund,
          placeholder: "Grund — steht im Protokoll, auch nach dem Löschen",
          onChange: function (e) { setzeGrund(e.target.value); } }),
        E("button", { type: "button",
          style: Object.assign({}, knopf, { marginTop: 10, background: CI.danger, borderColor: CI.danger }),
          disabled: !!busy || loeschwort !== m.name || grund.trim().length < 5,
          onClick: loeschen },
          busy === "loeschen" ? "Löscht …" : "Unwiderruflich löschen")));
  }

  // --- Konten über alle Mandanten ---------------------------------------------
  function Konten(p) {
    var gZ = React.useState(""), grund = gZ[0], setzeGrund = gZ[1];
    var bZ = React.useState(""), busy = bZ[0], setzeBusy = bZ[1];
    var fZ = React.useState(""), filter = fZ[0], setzeFilter = fZ[1];
    if (!p.daten) return E("div", { style: { color: CI.muted } }, "Lade Konten …");

    async function setzen(n, an) {
      setzeBusy(n.id);
      try {
        await ruf("admin_setzen", { benutzer_id: n.id, an: an, grund: grund });
        p.melden(an ? "Plattform-Recht vergeben." : "Plattform-Recht entzogen.");
        setzeGrund("");
        p.neuLaden();
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }

    async function passwort(n) {
      if (!window.confirm("Eine Zurücksetzen-Mail an " + n.email + " senden?")) return;
      setzeBusy(n.id);
      try {
        var r = await ruf("passwort_zuruecksetzen", { benutzer_id: n.id, grund: grund });
        p.melden("Die Mail ist an " + r.an + " unterwegs.");
        setzeGrund("");
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }

    var suche = filter.trim().toLowerCase();
    var zeilen = p.daten.filter(function (n) {
      if (!suche) return true;
      return [n.name, n.email, n.haus].some(function (w) {
        return String(w || "").toLowerCase().indexOf(suche) >= 0;
      });
    });

    return E("div", null,
      E("div", { style: { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" } },
        E("input", { style: Object.assign({}, feld, { maxWidth: 280 }), value: filter,
          placeholder: "Name, Adresse oder Haus",
          onChange: function (e) { setzeFilter(e.target.value); } }),
        E("input", { style: Object.assign({}, feld, { maxWidth: 360 }), value: grund,
          placeholder: "Grund für eine Rechteänderung — steht im Protokoll",
          onChange: function (e) { setzeGrund(e.target.value); } })),
      E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
        E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 760 } },
          E("thead", null, E("tr", null, ["Name", "Adresse", "Haus", "Rolle", "Plattform", ""]
            .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
          E("tbody", null, zeilen.map(function (n) {
            return E("tr", { key: n.id },
              E("td", { style: zelle }, n.name || "—"),
              E("td", { style: zelle }, n.email),
              E("td", { style: zelle }, n.haus || "—"),
              E("td", { style: zelle }, n.role),
              E("td", { style: Object.assign({}, zelle, {
                color: n.plattform_admin ? CI.gold : CI.muted,
                fontWeight: n.plattform_admin ? 700 : 400,
              }) }, n.plattform_admin ? "Administrator" : "—"),
              E("td", { style: zelle },
                E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                  E("button", { type: "button", style: knopfLeer,
                    disabled: !!busy || grund.trim().length < 5,
                    onClick: function () { setzen(n, !n.plattform_admin); } },
                    n.plattform_admin ? "Recht entziehen" : "Zum Administrator machen"),
                  E("button", { type: "button", style: knopfLeer,
                    disabled: !!busy || grund.trim().length < 5,
                    onClick: function () { passwort(n); } },
                    "Passwort zurücksetzen"))));
          })))),
      E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7 } },
        "Ein Plattform-Administrator pflegt den Katalog und verwaltet die "
        + "Häuser. In die Daten eines Hauses sieht er damit NICHT — dafür "
        + "braucht es einen Supportzugriff, und der ist befristet, begründet "
        + "und für den Kunden nachlesbar. Die Zurücksetzen-Mail geht immer an "
        + "die hinterlegte Adresse, nie an eine andere: sonst liesse sich mit "
        + "dieser Aktion ein Konto übernehmen."));
  }

  // --- Katalog ---------------------------------------------------------------
  // p.zusatz(zeile): ein kurzer Text unter der Schluesselspalte (fork_73: Ist-Kosten je Credit).
  function Katalogtabelle(p) {
    var eZ = React.useState({}), entwurf = eZ[0], setzeEntwurf = eZ[1];
    var bZ = React.useState(""), busy = bZ[0], setzeBusy = bZ[1];

    function wert(zeile, spalte) {
      var k = zeile[p.schluessel] + ":" + spalte;
      return Object.prototype.hasOwnProperty.call(entwurf, k) ? entwurf[k] : zeile[spalte];
    }
    function setzen(zeile, spalte, w) {
      var n = {}; n[zeile[p.schluessel] + ":" + spalte] = w;
      setzeEntwurf(Object.assign({}, entwurf, n));
    }
    function geaendert(zeile) {
      return p.spalten.some(function (s) {
        return Object.prototype.hasOwnProperty.call(entwurf, zeile[p.schluessel] + ":" + s[0]);
      });
    }
    async function speichern(zeile) {
      setzeBusy(zeile[p.schluessel]);
      var werte = {};
      p.spalten.forEach(function (s) {
        var k = zeile[p.schluessel] + ":" + s[0];
        if (!Object.prototype.hasOwnProperty.call(entwurf, k)) return;
        werte[s[0]] = s[1] === "zahl" ? Number(entwurf[k])
          : s[1] === "schalter" ? !!entwurf[k]
          : s[1] === "json" ? (function () {
              try { return JSON.parse(entwurf[k]); } catch (e) { return undefined; }
            })()
          : entwurf[k];
      });
      if (werte.merkmale === undefined) delete werte.merkmale;
      try {
        var r = await ruf("katalog_speichern", {
          tabelle: p.tabelle, schluessel: zeile[p.schluessel], werte: werte,
        });
        var rest = {};
        Object.keys(entwurf).forEach(function (k) {
          if (k.indexOf(zeile[p.schluessel] + ":") !== 0) rest[k] = entwurf[k];
        });
        setzeEntwurf(rest);
        p.melden(r.stripe_noetig
          ? "Gespeichert. Der Preis gilt bei Stripe erst nach einem Lauf von "
            + "scripts/stripe-einrichten.mjs — laufende Abos bleiben auf ihrem "
            + "alten Preis."
          : "Gespeichert.", r.stripe_noetig ? "warnung" : "ok");
        p.neuLaden();
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
      setzeBusy("");
    }

    return E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
      E("div", { style: { padding: "16px 18px 0" } }, Ueberschrift(p.titel)),
      E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 760 } },
        E("thead", null, E("tr", null,
          E("th", { style: kopfzelle }, p.schluesselName || "Schlüssel"),
          p.spalten.map(function (s) { return E("th", { key: s[0], style: kopfzelle }, s[2]); }),
          E("th", { style: kopfzelle }, ""))),
        E("tbody", null, (p.zeilen || []).map(function (z) {
          return E("tr", { key: z[p.schluessel] },
            E("td", { style: Object.assign({}, zelle, { fontFamily: "ui-monospace, monospace", fontSize: 12 }) },
              z[p.schluessel],
              p.zusatz ? E("div", { style: { fontFamily: "inherit", fontSize: 11, color: CI.muted, marginTop: 2 } }, p.zusatz(z)) : null),
            p.spalten.map(function (s) {
              var w = wert(z, s[0]);
              return E("td", { key: s[0], style: zelle },
                s[1] === "schalter"
                  ? E("input", { type: "checkbox", checked: !!w,
                      onChange: function (e) { setzen(z, s[0], e.target.checked); } })
                  : E("input", {
                      type: s[1] === "zahl" ? "number" : "text",
                      value: w === null || w === undefined ? ""
                        : (s[1] === "json" ? JSON.stringify(w) : w),
                      style: Object.assign({}, feld, { minWidth: s[1] === "zahl" ? 90 : 150 }),
                      onChange: function (e) { setzen(z, s[0], e.target.value); } }));
            }),
            E("td", { style: zelle },
              geaendert(z)
                ? E("button", { type: "button", style: knopf, disabled: !!busy,
                    onClick: function () { speichern(z); } },
                    busy === z[p.schluessel] ? "…" : "Speichern")
                : null));
        }))));
  }

  // Die Preissektion, wie die Landingpage sie zeichnet (src/eigene/abrechnung.js
  // liest dieselben Felder). Vorschau VOR dem Speichern: die Tabelle oben
  // aendert den Entwurf, hier steht, was der Kunde saehe.
  function Preisvorschau(p) {
    var tarife = (p.tarife || []).filter(function (t) { return !t.ist_zusatznutzer && t.aktiv; })
      .sort(function (a, b) { return (a.sortierung || 0) - (b.sortierung || 0); });
    var addon = (p.tarife || []).find(function (t) { return t.ist_zusatznutzer; });
    return E("div", { style: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" } },
      tarife.map(function (t) {
        return E("div", { key: t.schluessel, style: { border: "1px solid " + (t.empfohlen ? CI.gold : CI.border), borderRadius: 10, padding: 14, background: "#fff", position: "relative" } },
          t.empfohlen ? E("div", { style: { position: "absolute", top: -9, right: 10, background: CI.gold, color: "#fff", fontSize: 10, padding: "1px 8px", borderRadius: 8, fontWeight: 700 } }, "EMPFOHLEN") : null,
          E("div", { style: { fontWeight: 700, color: CI.blau, fontSize: 15 } }, t.name),
          E("div", { style: { fontSize: 22, fontWeight: 700, color: CI.blau, margin: "6px 0 2px" } }, geld(t.preis_monat_cent), E("span", { style: { fontSize: 11, fontWeight: 400, color: CI.muted } }, " / Monat netto")),
          E("div", { style: { fontSize: 11, color: CI.muted } }, "oder " + geld(t.preis_jahr_cent) + " / Jahr"),
          E("div", { style: { fontSize: 12, marginTop: 8 } }, zahl(t.inkl_nutzer) + " Nutzer inkl. · " + zahl(t.credits_monat) + " Credits/Monat"),
          t.hinweis ? E("div", { style: { fontSize: 11.5, color: CI.muted, marginTop: 4 } }, t.hinweis) : null,
          addon ? E("div", { style: { fontSize: 11, color: CI.muted, marginTop: 6 } }, "Zusatznutzer " + geld(addon.preis_monat_cent) + " / Monat") : null);
      }));
  }

  function Gutscheine(p) {
    var gZ = React.useState(null), liste = gZ[0], setzeListe = gZ[1];
    var fZ = React.useState({ code: "", art: "prozent", wert: 10, dauer: "einmalig", monate: 3, gueltig_bis: "", max_einloesungen: "", tarife: "" }), form = fZ[0], setzeForm = fZ[1];
    var darf = ["owner", "admin", "finanzen"].indexOf(p.rolle) >= 0;
    function laden() { ruf("gutscheine").then(function (d) { setzeListe(d); }).catch(function (f) { p.melden(f.message, "fehler"); }); }
    React.useEffect(function () { laden(); }, []);
    async function speichern() {
      try {
        var r = await ruf("gutschein_speichern", Object.assign({}, form, { wert: Number(form.wert), monate: Number(form.monate) || null,
          max_einloesungen: form.max_einloesungen ? Number(form.max_einloesungen) : null,
          tarife: form.tarife ? form.tarife.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : null }));
        p.melden(r.stripe_coupon_id ? "Gespeichert, Stripe-Coupon " + r.stripe_coupon_id : "Gespeichert (ohne Stripe-Coupon — kein Schlüssel).");
        setzeForm(Object.assign({}, form, { code: "" })); laden();
      } catch (f) { p.melden(f.message || String(f), "fehler"); }
    }
    if (!liste) return E("div", { style: { fontSize: 13, color: CI.muted } }, "Lade Gutscheine …");
    return E("div", null,
      liste.gutscheine.length ? E("div", { style: { overflowX: "auto" } }, E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 700 } },
        E("thead", null, E("tr", null, ["Code", "Rabatt", "Dauer", "gültig bis", "Einlösungen", "Tarife", "Stripe", ""].map(function (h, i) { return E("th", { key: i, style: kopfzelle }, h); }))),
        E("tbody", null, liste.gutscheine.map(function (g) {
          return E("tr", { key: g.code, style: g.aktiv ? null : { opacity: 0.5 } },
            E("td", { style: Object.assign({}, zelle, { fontFamily: "monospace", fontWeight: 600 }) }, g.code),
            E("td", { style: zelle }, g.art === "prozent" ? g.wert + " %" : geld(g.wert)),
            E("td", { style: zelle }, g.dauer === "monate" ? g.monate + " Monate" : g.dauer),
            E("td", { style: zelle }, g.gueltig_bis ? datum(g.gueltig_bis) : "—"),
            E("td", { style: zelle }, zahl(g.einloesungen) + (g.max_einloesungen ? " / " + zahl(g.max_einloesungen) : "")),
            E("td", { style: Object.assign({}, zelle, { fontSize: 12 }) }, (g.tarife || []).join(", ") || "alle"),
            E("td", { style: Object.assign({}, zelle, { fontSize: 11 }) }, g.stripe_coupon_id
              ? E("a", { href: "https://dashboard.stripe.com/" + (liste.stripe_modus === "test" ? "test/" : "") + "coupons/" + g.stripe_coupon_id, target: "_blank", rel: "noopener" }, "In Stripe öffnen")
              : E("span", { style: { color: CI.muted } }, "kein Coupon")),
            E("td", { style: zelle }, darf ? E("button", { type: "button", style: knopfLeer, onClick: function () {
              ruf("gutschein_speichern", Object.assign({}, g, { aktiv: !g.aktiv })).then(laden).catch(function (e) { p.melden(e.message, "fehler"); }); } }, g.aktiv ? "Deaktivieren" : "Aktivieren") : null));
        })))) : E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch kein Gutschein."),
      darf ? E("div", { style: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "end", marginTop: 12 } },
        E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Code"), E("input", { style: feld, value: form.code, placeholder: "WILLKOMMEN10", onChange: function (e) { setzeForm(Object.assign({}, form, { code: e.target.value.toUpperCase() })); } })),
        E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Art"), E("select", { style: feld, value: form.art, onChange: function (e) { setzeForm(Object.assign({}, form, { art: e.target.value })); } }, E("option", { value: "prozent" }, "Prozent"), E("option", { value: "betrag" }, "Betrag (Cent)"))),
        E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Wert"), E("input", { type: "number", style: feld, value: form.wert, onChange: function (e) { setzeForm(Object.assign({}, form, { wert: e.target.value })); } })),
        E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Dauer"), E("select", { style: feld, value: form.dauer, onChange: function (e) { setzeForm(Object.assign({}, form, { dauer: e.target.value })); } }, E("option", { value: "einmalig" }, "einmalig"), E("option", { value: "monate" }, "X Monate"), E("option", { value: "dauerhaft" }, "dauerhaft"))),
        form.dauer === "monate" ? E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Monate"), E("input", { type: "number", style: feld, value: form.monate, onChange: function (e) { setzeForm(Object.assign({}, form, { monate: e.target.value })); } })) : null,
        E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "gültig bis"), E("input", { type: "date", style: feld, value: form.gueltig_bis, onChange: function (e) { setzeForm(Object.assign({}, form, { gueltig_bis: e.target.value })); } })),
        E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "max. Einlösungen"), E("input", { type: "number", style: feld, value: form.max_einloesungen, onChange: function (e) { setzeForm(Object.assign({}, form, { max_einloesungen: e.target.value })); } })),
        E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "nur Tarife (Komma)"), E("input", { style: feld, value: form.tarife, placeholder: "leer = alle", onChange: function (e) { setzeForm(Object.assign({}, form, { tarife: e.target.value })); } })),
        E("button", { type: "button", style: knopf, disabled: form.code.length < 3 || !(Number(form.wert) > 0), onClick: speichern }, "Anlegen")) : null);
  }

  function Katalog(p) {
    if (!p.daten) return E("div", { style: { color: CI.muted } }, "Lade Katalog …");
    var gemeinsam = { melden: p.melden, neuLaden: p.neuLaden };
    var istJeCredit = {};
    ((p.kosten && p.kosten.je_aktion) || []).forEach(function (a) { istJeCredit[a.aktion] = a.ist_je_credit; });
    var uZ = React.useState({ tarif: "", grund: "" }), um = uZ[0], setzeUm = uZ[1];
    async function umstellen() {
      if (!window.confirm("Bestandskunden werden auf den aktuellen Preis umgestellt. Informationspflicht: Preisänderungen sind den Kunden vorher mitzuteilen (Vertrag/AGB, in der Regel mit Frist). Fortfahren?")) return;
      try { var r = await ruf("tarif_umstellen", { tarif: um.tarif, grund: um.grund });
        p.melden(r.ergebnis.length + " Abo(s) bearbeitet: " + r.ergebnis.filter(function (x) { return x.ok; }).length + " ok", "warnung"); setzeUm({ tarif: "", grund: "" }); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
    }
    return E("div", null,
      E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 8 } },
        "Stripe: " + (p.stripeModus === "test" ? "TESTMODUS" : p.stripeModus === "live" ? "LIVE" : "nicht verbunden")
        + " · Preisänderungen legen bei Stripe einen NEUEN Price an; laufende Abos behalten den alten."),
      E("div", { style: kasten }, Ueberschrift("So sieht die Preissektion der Landingpage aus"), E(Preisvorschau, { tarife: p.daten.tarife })),
      E(Katalogtabelle, Object.assign({}, gemeinsam, {
        titel: "Tarife", tabelle: "plattform_tarife", schluessel: "schluessel",
        zeilen: p.daten.tarife,
        spalten: [["name", "text", "Name"], ["preis_monat_cent", "zahl", "Monat (Cent)"],
          ["preis_jahr_cent", "zahl", "Jahr (Cent)"], ["inkl_nutzer", "zahl", "Nutzer"],
          ["credits_monat", "zahl", "Credits/Monat"], ["hinweis", "text", "Hinweis"],
          ["empfohlen", "schalter", "Empfohlen"], ["aktiv", "schalter", "Aktiv"]],
      })),
      E(Katalogtabelle, Object.assign({}, gemeinsam, {
        titel: "Was eine KI-Aktion kostet", tabelle: "plattform_credit_preise",
        schluessel: "aktion", schluesselName: "Aktion", zeilen: p.daten.credit_preise,
        spalten: [["name", "text", "Name"], ["credits", "zahl", "Credits"],
          ["beschreibung", "text", "Beschreibung"], ["aktiv", "schalter", "Aktiv"]],
        zusatz: function (zeile) { return istJeCredit[zeile.aktion] !== undefined && istJeCredit[zeile.aktion] !== null
          ? "Ist je Credit " + euro(istJeCredit[zeile.aktion]) + " (" + zahl(p.tage || 30) + " Tage)" : "Ist je Credit: keine Kostenangabe"; },
      })),
      E(Katalogtabelle, Object.assign({}, gemeinsam, {
        titel: "Credit-Pakete", tabelle: "plattform_credit_pakete", schluessel: "schluessel",
        zeilen: p.daten.credit_pakete,
        spalten: [["name", "text", "Name"], ["credits", "zahl", "Credits"],
          ["preis_cent", "zahl", "Preis (Cent)"], ["gueltig_monate", "zahl", "Gültig (Monate)"],
          ["aktiv", "schalter", "Aktiv"]],
      })),
      E(Katalogtabelle, Object.assign({}, gemeinsam, {
        titel: "Fristen, Grenzen, Sätze", tabelle: "plattform_werte", schluessel: "schluessel",
        zeilen: p.daten.werte,
        spalten: [["wert", "json", "Wert"], ["beschreibung", "text", "Beschreibung"]],
      })),
      E("div", { style: kasten }, Ueberschrift("Gutscheine"), E(Gutscheine, { rolle: p.rolle, melden: p.melden })),
      p.rolle === "owner" ? E("div", { style: kasten },
        Ueberschrift("Bestandskunden auf den aktuellen Preis umstellen"),
        E("p", { style: { fontSize: 12.5, color: CI.muted, marginTop: 0 } },
          "Nur ausdrücklich und nie still. Kunden sind vorher zu informieren; der Grund mit dem Datum der Information steht im Audit-Log."),
        E("div", { style: { display: "grid", gap: 8, gridTemplateColumns: "1fr 2fr auto", alignItems: "end" } },
          E("select", { style: feld, value: um.tarif, onChange: function (e) { setzeUm(Object.assign({}, um, { tarif: e.target.value })); } },
            [E("option", { key: "", value: "" }, "— Tarif —")].concat((p.daten.tarife || []).filter(function (t) { return !t.ist_zusatznutzer; }).map(function (t) { return E("option", { key: t.schluessel, value: t.schluessel }, t.name); }))),
          E("input", { style: feld, value: um.grund, placeholder: "Grund, z. B. „Kunden am 01.10. informiert, Umstellung zum 01.11.“", onChange: function (e) { setzeUm(Object.assign({}, um, { grund: e.target.value })); } }),
          E("button", { type: "button", style: Object.assign({}, knopf, { background: CI.danger, borderColor: CI.danger }), disabled: !um.tarif || um.grund.length < 10, onClick: umstellen }, "Umstellen"))) : null,
      E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7 } },
        "Preise sind Nettobeträge in Cent. Eine Preisänderung wirkt sofort auf der Website und im Kundenbereich. "
        + "Ist Stripe verbunden, entsteht dort beim Speichern ein neuer Price; laufende Abos bleiben auf ihrem alten — "
        + "so ist es bei Stripe gewollt und rechtlich das Richtige. Produkte, die bei Stripe noch fehlen, legt "
        + "scripts/stripe-einrichten.mjs an (Workflow \u201eStripe einrichten\u201c)."));
  }

  // --- Zahlungen (fork_74) ----------------------------------------------------
  function stripeLink(modus, art, id) {
    if (!id) return null;
    return E("a", { href: "https://dashboard.stripe.com/" + (modus === "test" ? "test/" : "") + art + "/" + id, target: "_blank", rel: "noopener",
      style: { fontSize: 11, color: CI.blau, whiteSpace: "nowrap" } }, "In Stripe öffnen");
  }
  function Zahlungen(p) {
    var d = p.daten;
    var mZ = React.useState(new Date().toISOString().slice(0, 7)), monat = mZ[0], setzeMonat = mZ[1];
    var fZ = React.useState("offen"), filter = fZ[0], setzeFilter = fZ[1];
    var eZ = React.useState(null), erst = eZ[0], setzeErst = eZ[1];
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Zahlungen …");
    var darfErstatten = p.rolle === "owner" || p.rolle === "finanzen";
    var darfStripe = ["owner", "admin", "finanzen"].indexOf(p.rolle) >= 0;
    var rechnungen = (d.rechnungen || []).filter(function (r) {
      return filter === "alle" ? true : filter === "offen" ? r.status === "open" || r.status === "uncollectible"
        : filter === "bezahlt" ? r.status === "paid" : r.art === "gutschrift" || r.status === "void";
    });
    async function erinnern(r) {
      try { var x = await ruf("zahlung_erinnern", { rechnung_id: r.rechnung_id, mandant_id: r.mandant_id }); p.melden(x.meldung); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
    }
    async function erstatten() {
      try { var x = await ruf("erstatten", { rechnung_id: erst.id, mandant_id: erst.mandant_id, grund: erst.grund,
          betrag_cent: erst.betrag ? Math.round(Number(String(erst.betrag).replace(",", ".")) * 100) : null });
        p.melden("Erstattung " + x.refund + " ausgelöst."); setzeErst(null); p.neuLaden(); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
    }
    async function exportieren() {
      try { var x = await ruf("buchhaltung", { monat: monat });
        csvExport("buchhaltung-" + monat + ".csv", [["Belegart", "belegart"], ["Belegnummer", "belegnummer"], ["Belegdatum", "belegdatum"],
          ["Mandant", "mandant"], ["Mandanten-ID", "mandant_id"], ["Netto EUR", "netto_eur"], ["USt EUR", "ust_eur"], ["Brutto EUR", "brutto_eur"],
          ["USt-Satz %", "ust_satz"], ["Reverse Charge", "reverse_charge"], ["Zahlungsstatus", "status"], ["Bezahlt am", "bezahlt_am"],
          ["Gebuehr EUR", "gebuehr_eur"], ["Stripe-ID", "stripe_id"], ["Waehrung", "waehrung"]], x.zeilen);
        p.melden(x.zeilen.length + " Belege exportiert."); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
    }
    async function abgleich() {
      p.melden("Abgleich läuft …", "warnung");
      try { var x = await ruf("abgleich_jetzt"); p.melden(x.ok ? "Abgleich fertig." : "Abgleich mit Fehler: " + (x.ergebnis && x.ergebnis.fehler), x.ok ? "ok" : "fehler"); p.neuLaden(); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
    }
    var s = d.summen || {};
    return E("div", null,
      E("div", { style: { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 18 } },
        [["Fehlgeschlagen offen", zahl((d.fehlgeschlagen || []).length), "Sperre nach " + zahl(d.frist_tage) + " Tagen"],
         ["Offen", geld(s.offen_cent || 0), "Rechnungen im Zeitraum"],
         ["Bezahlt", geld(s.bezahlt_cent || 0), zahl(s.anzahl || 0) + " Belege"],
         ["Gutschriften", geld(s.gutschriften_cent || 0), "negativ im Netto"],
         ["Stripe-Gebühren", geld(s.gebuehren_cent || 0), "aus Balance Transactions (Abgleich)"]].map(function (k, i) {
          return E("div", { key: i, style: kasten },
            E("div", { style: { fontSize: 11, color: CI.muted, letterSpacing: "0.06em", textTransform: "uppercase" } }, k[0]),
            E("div", { style: { fontSize: 22, fontWeight: 700, color: CI.blau, margin: "6px 0 4px" } }, k[1]),
            E("div", { style: { fontSize: 11.5, color: CI.muted } }, k[2]));
        })),
      E("div", { style: kasten },
        Ueberschrift("Fehlgeschlagene Zahlungen"),
        (d.fehlgeschlagen || []).length ? E("div", { style: { overflowX: "auto" } }, E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 760 } },
          E("thead", null, E("tr", null, ["Mandant", "Mahnstufe", "Seit", "Betrag", "Tage bis Sperre", "Nächster Versuch", "", ""].map(function (h, i) { return E("th", { key: i, style: kopfzelle }, h); }))),
          E("tbody", null, d.fehlgeschlagen.map(function (f) {
            return E("tr", { key: f.mandant_id, style: f.tage_bis_sperre <= 3 ? { background: "#fdf2f2" } : null },
              E("td", { style: zelle }, E("button", { type: "button", style: Object.assign({}, knopfLeer, { padding: "3px 8px" }), onClick: function () { p.oeffnen(f.mandant_id); } }, f.name)),
              E("td", { style: zelle }, zahl(f.mahnstufe)),
              E("td", { style: zelle }, datum(f.seit)),
              E("td", { style: zelle }, f.offen_cent ? geld(f.offen_cent) : "—"),
              E("td", { style: Object.assign({}, zelle, { fontWeight: 600, color: f.tage_bis_sperre <= 3 ? CI.danger : CI.blau }) }, zahl(f.tage_bis_sperre)),
              E("td", { style: zelle }, f.naechster_versuch ? zeit(f.naechster_versuch) : "—"),
              E("td", { style: zelle }, darfStripe ? stripeLink(d.stripe_modus, "customers", f.stripe_kunde_id) : null),
              E("td", { style: zelle }, f.rechnung_id ? E("button", { type: "button", style: knopfLeer, onClick: function () { erinnern(f); } }, "Erinnerung senden") : null));
          })))) : E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine.")),
      E("div", { style: kasten },
        E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 } },
          Ueberschrift("Rechnungen"),
          [["offen", "Offen"], ["bezahlt", "Bezahlt"], ["erstattet", "Gutschriften / storniert"], ["alle", "Alle"]].map(function (f) {
            return E("button", { key: f[0], type: "button", onClick: function () { setzeFilter(f[0]); },
              style: Object.assign({}, knopfLeer, { marginBottom: 12 }, filter === f[0] ? { background: CI.blau, color: "#fff", borderColor: CI.blau } : {}) }, f[1]);
          })),
        rechnungen.length ? E("div", { style: { overflowX: "auto" } }, E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 820 } },
          E("thead", null, E("tr", null, ["Nummer", "Mandant", "Datum", "Art", "Netto", "USt", "Brutto", "Status", "Gebühr", "", ""].map(function (h, i) { return E("th", { key: i, style: kopfzelle }, h); }))),
          E("tbody", null, rechnungen.map(function (r) {
            return E("tr", { key: r.id },
              E("td", { style: Object.assign({}, zelle, { fontFamily: "monospace", fontSize: 12 }) }, r.nummer || r.id),
              E("td", { style: zelle }, r.name),
              E("td", { style: zelle }, datum(r.erstellt_am)),
              E("td", { style: zelle }, r.art),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(r.netto_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, geld(r.steuer_cent)),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right", fontWeight: 600 }) }, geld(r.brutto_cent)),
              E("td", { style: zelle }, r.status),
              E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) }, r.gebuehr_cent !== null && r.gebuehr_cent !== undefined ? geld(r.gebuehr_cent) : "—"),
              E("td", { style: zelle }, darfStripe ? stripeLink(d.stripe_modus, "invoices", r.id) : null),
              E("td", { style: zelle }, darfErstatten && r.status === "paid" && r.art !== "gutschrift"
                ? E("button", { type: "button", style: knopfLeer, onClick: function () { setzeErst({ id: r.id, mandant_id: r.mandant_id, grund: "", betrag: "" }); } }, "Erstatten") : null));
          })))) : E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine Rechnungen in dieser Auswahl."),
        erst ? E("div", { style: { marginTop: 12, display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr auto auto", alignItems: "end" } },
          E("input", { style: feld, value: erst.grund, placeholder: "Grund — steht im Audit-Log", onChange: function (e) { setzeErst(Object.assign({}, erst, { grund: e.target.value })); } }),
          E("input", { style: feld, value: erst.betrag, placeholder: "Teilbetrag EUR (leer = voll)", onChange: function (e) { setzeErst(Object.assign({}, erst, { betrag: e.target.value })); } }),
          E("button", { type: "button", style: Object.assign({}, knopf, { background: CI.danger, borderColor: CI.danger }), disabled: erst.grund.trim().length < 5, onClick: erstatten }, "Erstattung auslösen"),
          E("button", { type: "button", style: knopfLeer, onClick: function () { setzeErst(null); } }, "Abbrechen")) : null),
      E("div", { style: kasten },
        Ueberschrift("Export für die Buchhaltung"),
        E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          E("input", { type: "month", style: Object.assign({}, feld, { width: 170 }), value: monat, onChange: function (e) { setzeMonat(e.target.value); } }),
          E("button", { type: "button", style: knopf, onClick: exportieren }, "Monats-CSV"),
          E("span", { style: { fontSize: 12, color: CI.muted } }, "UTF-8 mit BOM, Semikolon, deutsche Zahlen — Struktur siehe docs/ADMIN.md (DATEV-kompatibel)."))),
      E("div", { style: kasten },
        E("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
          Ueberschrift("Stripe-Abgleich"),
          E("button", { type: "button", style: Object.assign({}, knopfLeer, { marginLeft: "auto", marginBottom: 12 }), onClick: abgleich }, "Jetzt abgleichen")),
        (d.abgleich || []).length ? E("table", { style: { width: "100%", borderCollapse: "collapse" } },
          E("thead", null, E("tr", null, ["Datum", "Bereich", "Zeitraum", "Stripe", "Abbild", "Abweichung"].map(function (h, i) { return E("th", { key: i, style: kopfzelle }, h); }))),
          E("tbody", null, d.abgleich.map(function (g) {
            var k = g.kennungen || {};
            return E("tr", { key: g.id, style: g.abweichung ? { background: "#fff7e6" } : null },
              E("td", { style: zelle }, g.datum),
              E("td", { style: zelle }, g.bereich),
              E("td", { style: zelle }, g.zeitraum),
              E("td", { style: zelle }, zahl(g.stripe_anzahl) + (g.stripe_cent ? " · " + geld(g.stripe_cent) : "")),
              E("td", { style: zelle }, zahl(g.spiegel_anzahl) + (g.spiegel_cent ? " · " + geld(g.spiegel_cent) : "")),
              E("td", { style: Object.assign({}, zelle, { fontSize: 12 }) }, g.fehler ? E("span", { style: { color: CI.danger } }, g.fehler)
                : g.abweichung ? ("nur bei Stripe: " + ((k.nur_stripe || []).join(", ") || "—") + " · nur im Abbild: " + ((k.nur_spiegel || []).join(", ") || "—"))
                : E("span", { style: { color: CI.success } }, "stimmt")));
          }))) : E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch kein Abgleich — läuft täglich um 03:10 Uhr, oder jetzt.")));
  }

  // --- Funktionen & Tarife (fork_73) ---------------------------------------
  function Funktionen(p) {
    var d = p.daten;
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Funktionsschalter …");
    var darf = p.rolle === "owner" || p.rolle === "admin";
    var an = {};
    (d.tarif_features || []).forEach(function (x) { an[x.tarif + ":" + x.feature] = true; });
    function schalte(felder) { ruf("feature_speichern", felder).then(p.neuLaden).catch(function (e) { p.melden(e.message, "fehler"); }); }
    return E("div", null,
      E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
        E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 640 } },
          E("thead", null, E("tr", null, [E("th", { key: "f", style: kopfzelle }, "Funktion"), E("th", { key: "s", style: kopfzelle }, "Standard")]
            .concat((d.tarife || []).map(function (t) { return E("th", { key: t.schluessel, style: Object.assign({}, kopfzelle, { textAlign: "center" }) }, t.name); })))),
          E("tbody", null, (d.features || []).map(function (f) {
            return E("tr", { key: f.schluessel },
              E("td", { style: zelle }, E("div", { style: { fontWeight: 600, color: CI.blau } }, f.name), E("div", { style: { fontSize: 11, color: CI.muted } }, f.schluessel + (f.beschreibung ? " · " + f.beschreibung : ""))),
              E("td", { style: zelle }, E("input", { type: "checkbox", checked: !!f.standard_an, disabled: !darf, onChange: function (e) { schalte({ feature: f.schluessel, standard_an: e.target.checked }); } }), " an"),
              (d.tarife || []).map(function (t) {
                var ein = f.standard_an || !!an[t.schluessel + ":" + f.schluessel];
                return E("td", { key: t.schluessel, style: Object.assign({}, zelle, { textAlign: "center" }) },
                  f.standard_an ? E("span", { title: "Standard an — gilt für alle Tarife", style: { color: CI.success } }, "✓")
                    : E("input", { type: "checkbox", checked: ein, disabled: !darf, onChange: function (e) { schalte({ feature: f.schluessel, tarif: t.schluessel, an: e.target.checked }); } }));
              }));
          })))),
      E("div", { style: kasten },
        Ueberschrift("Ausnahmen je Mandant"),
        (d.mandant_features || []).length ? (d.mandant_features || []).map(function (x) {
          return E("div", { key: x.mandant_id + x.feature, style: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0", borderBottom: "1px solid " + CI.border } },
            E("span", { style: { flex: 1 } }, x.mandant_name + " · " + x.feature + ": " + (x.an ? "AN" : "AUS") + (x.bis ? " bis " + datum(x.bis) : "") + (x.notiz ? " — " + x.notiz : "")),
            darf ? E("button", { type: "button", style: knopfLeer, onClick: function () { schalte({ feature: x.feature, mandant_id: x.mandant_id, entfernen: true }); } }, "Entfernen") : null);
        }) : E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine Ausnahmen. Ausnahmen setzt man in der Mandantenansicht (Beta-Module für einzelne Häuser)."),
        E("p", { style: { fontSize: 11.5, color: CI.muted, marginTop: 10 } },
          "Reihenfolge der Entscheidung: Ausnahme des Hauses (befristbar) → Tarif → Standard. Gesperrte Module zeigen im Portal einen Upgrade-Hinweis, sie verschwinden nicht.")));
  }

  // --- Systemzustand ----------------------------------------------------------
  function System(p) {
    var d = p.daten;
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Systemzustand …");
    var cron = d.cron || [];
    var kaputt = cron.filter(function (j) { return Number(j.fehler_24h) > 0; });
    var still = cron.filter(function (j) {
      return j.aktiv && Number(j.laeufe_24h) === 0;
    });
    return E("div", null,
      E("div", { style: { display: "grid", gap: 14,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 18 } },
        [
          ["Zeitplan-Jobs", zahl(cron.length), "angelegt"],
          ["Mit Fehlern (24 h)", zahl(kaputt.length),
            kaputt.length ? "nachsehen" : "nichts zu tun"],
          ["Still (24 h)", zahl(still.length),
            "aktiv, aber kein Lauf — kann richtig sein, wenn der Takt länger ist"],
          ["Oberflächenfehler", zahl((d.fehler || []).reduce(function (a, f) {
            return a + Number(f.anzahl || 0); }, 0)), "in " + zahl(d.tage) + " Tagen"],
        ].map(function (k, i) {
          return E("div", { key: i, style: kasten },
            E("div", { style: { fontSize: 11, color: CI.muted, letterSpacing: "0.06em", textTransform: "uppercase" } }, k[0]),
            E("div", { style: { fontSize: 26, fontWeight: 700, color: CI.blau, margin: "6px 0 4px" } }, k[1]),
            E("div", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.5 } }, k[2]));
        })),

      E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
        E("div", { style: { padding: "16px 18px 0" } }, Ueberschrift("Zeitplan-Jobs")),
        d.cron_fehler
          ? E("div", { style: { padding: "0 18px 16px", fontSize: 13, color: CI.danger } },
              d.cron_fehler)
          : E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 700 } },
              E("thead", null, E("tr", null, ["Job", "Takt", "Aktiv", "Letzter Lauf", "Ausgang", "Läufe 24 h", "Fehler 24 h"]
                .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
              E("tbody", null, cron.map(function (j) {
                var schlimm = Number(j.fehler_24h) > 0;
                return E("tr", { key: j.jobname },
                  E("td", { style: zelle }, j.jobname),
                  E("td", { style: Object.assign({}, zelle, { fontFamily: "ui-monospace, monospace", fontSize: 11.5 }) }, j.zeitplan),
                  E("td", { style: zelle }, j.aktiv ? "ja" : "nein"),
                  E("td", { style: zelle }, j.letzter_lauf ? zeit(j.letzter_lauf) : "—"),
                  E("td", { style: Object.assign({}, zelle, {
                    color: j.letzter_stand === "succeeded" ? CI.success
                      : j.letzter_stand ? CI.danger : CI.muted,
                  }) }, j.letzter_stand || "—"),
                  E("td", { style: zelle }, zahl(j.laeufe_24h)),
                  E("td", { style: Object.assign({}, zelle, {
                    color: schlimm ? CI.danger : CI.muted,
                    fontWeight: schlimm ? 700 : 400,
                  }) }, zahl(j.fehler_24h)));
              })))),

      E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
        E("div", { style: { padding: "16px 18px 0" } },
          Ueberschrift("Oberflächenfehler der letzten " + zahl(d.tage) + " Tage")),
        d.fehler_fehler
          ? E("div", { style: { padding: "0 18px 16px", fontSize: 13, color: CI.danger } },
              d.fehler_fehler)
          : !(d.fehler || []).length
            ? E("div", { style: { padding: "0 18px 16px", fontSize: 13, color: CI.muted } },
                "Nichts gemeldet.")
            : E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 700 } },
                E("thead", null, E("tr", null, ["Haus", "Schlüssel", "Quelle", "Anzahl", "Offen", "Zuletzt"]
                  .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
                E("tbody", null, d.fehler.map(function (f, i) {
                  return E("tr", { key: i },
                    E("td", { style: zelle }, f.mandant_name || "—"),
                    E("td", { style: Object.assign({}, zelle, { fontFamily: "ui-monospace, monospace", fontSize: 11.5 }) },
                      f.schluessel),
                    E("td", { style: Object.assign({}, zelle, { fontSize: 11.5, color: CI.muted }) }, f.quelle),
                    E("td", { style: zelle }, zahl(f.anzahl)),
                    E("td", { style: zelle }, zahl(f.offen)),
                    E("td", { style: zelle }, zeit(f.zuletzt)));
                })))),
      E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7 } },
        "Der Wortlaut einer Fehlermeldung und ihre Stapelspur stehen hier "
        + "NICHT: dort steht, woran ein Kunde gerade gearbeitet hat. Wer ihn "
        + "braucht, beginnt beim betroffenen Haus einen Supportzugriff — "
        + "befristet, begründet und für den Kunden nachlesbar."));
  }

  // --- Protokoll -------------------------------------------------------------
  function Protokoll(p) {
    if (!p.daten) return E("div", { style: { color: CI.muted } }, "Lade Protokoll …");
    if (!p.daten.length) return E("div", { style: kasten }, "Noch nichts geschehen.");
    return E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
      E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 760 } },
        E("thead", null, E("tr", null, ["Zeit", "Aktion", "Gegenstand", "Einzelheiten"]
          .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
        E("tbody", null, p.daten.map(function (z) {
          return E("tr", { key: z.id },
            E("td", { style: Object.assign({}, zelle, { whiteSpace: "nowrap" }) }, zeit(z.erstellt_am)),
            E("td", { style: zelle }, z.aktion),
            E("td", { style: Object.assign({}, zelle, { fontFamily: "ui-monospace, monospace", fontSize: 11.5 }) },
              z.gegenstand || "—"),
            E("td", { style: Object.assign({}, zelle, { fontSize: 11.5, color: CI.muted }) },
              z.einzelheiten && z.einzelheiten.grund
                ? z.einzelheiten.grund
                : JSON.stringify(z.einzelheiten || {}).slice(0, 160)));
        }))));
  }

  // --- Das Ganze -------------------------------------------------------------
  // --- Admins & Rollen (fork_68) --------------------------------------------
  // Nur owner aendert etwas; alle anderen sehen die Liste. Deaktiviert statt
  // geloescht, damit das Audit-Log weiter sagt, wer es war.
  var ROLLEN_TEXT = {
    owner: "alles, auch Admins, Preise, endgültige Löschungen",
    admin: "alles außer Admins verwalten und endgültig löschen",
    support: "Mandanten ansehen, Test verlängern, Credits bis 500, Supportzugriff",
    finanzen: "Umsatz, Rechnungen, Zahlungen; keine Eingriffe",
  };
  function Admins(p) {
    var liste = p.daten || [];
    var fZ = React.useState({ benutzer_id: "", rolle: "support", grund: "" }), form = fZ[0], setzeForm = fZ[1];
    var darf = p.rolle === "owner";
    React.useEffect(function () { if (darf && !p.konten) p.neuLaden(); }, []);

    async function setzen(id, an, rolle, grund) {
      try { await ruf("admin_setzen", { benutzer_id: id, an: an, rolle: rolle, grund: grund });
        p.melden(an ? "Gespeichert." : "Deaktiviert."); p.neuLaden(); }
      catch (f) { p.melden(f.message || String(f), "fehler"); }
    }

    return E("div", null,
      E(Ueberschrift, { text: "Plattform-Administratoren" }),
      E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
        E("table", { style: { width: "100%", borderCollapse: "collapse" } },
          E("thead", null, E("tr", null, ["Konto", "Rolle", "Status", "Seit", "Notiz", ""].map(function (k) {
            return E("th", { key: k, style: kopfzelle }, k); }))),
          E("tbody", null, liste.map(function (a) {
            return E("tr", { key: a.benutzer_id },
              E("td", { style: zelle }, E("div", null, a.name || "—"),
                E("div", { style: { fontSize: 11, color: CI.muted } }, a.email || a.benutzer_id)),
              E("td", { style: zelle }, darf && a.aktiv
                ? E("select", { style: feld, value: a.rolle, onChange: function (ev) {
                    var g = window.prompt("Grund für die Rollenänderung:"); if (!g) return;
                    setzen(a.benutzer_id, true, ev.target.value, g); } },
                    ["owner", "admin", "support", "finanzen"].map(function (r) {
                      return E("option", { key: r, value: r }, r); }))
                : E("span", null, a.rolle),
                E("div", { style: { fontSize: 11, color: CI.muted } }, ROLLEN_TEXT[a.rolle] || "")),
              E("td", { style: zelle }, a.aktiv ? "aktiv" : E("span", { style: { color: CI.muted } }, "deaktiviert")),
              E("td", { style: zelle }, datum(a.erstellt_am)),
              E("td", { style: Object.assign({}, zelle, { fontSize: 12, color: CI.muted }) }, a.notiz || ""),
              E("td", { style: zelle }, darf && a.aktiv
                ? E("button", { type: "button", style: knopfLeer, onClick: function () {
                    var g = window.prompt("Grund für die Deaktivierung:"); if (!g) return;
                    setzen(a.benutzer_id, false, a.rolle, g); } }, "Deaktivieren")
                : (darf && !a.aktiv ? E("button", { type: "button", style: knopfLeer, onClick: function () {
                    var g = window.prompt("Grund für die Reaktivierung:"); if (!g) return;
                    setzen(a.benutzer_id, true, a.rolle, g); } }, "Reaktivieren") : null)));
          })))),
      darf ? E("div", { style: kasten },
        E("div", { style: { fontWeight: 600, fontSize: 14, marginBottom: 10, color: CI.blau } }, "Betreiber ernennen"),
        E("div", { style: { display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 8, alignItems: "end" } },
          E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Konto"),
            E("select", { style: feld, value: form.benutzer_id, onChange: function (ev) {
              setzeForm(Object.assign({}, form, { benutzer_id: ev.target.value })); } },
              [E("option", { key: "", value: "" }, "— wählen —")].concat((p.konten || []).map(function (k) {
                return E("option", { key: k.id, value: k.id }, (k.name || "") + " <" + (k.email || "") + ">"); })))),
          E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Rolle"),
            E("select", { style: feld, value: form.rolle, onChange: function (ev) {
              setzeForm(Object.assign({}, form, { rolle: ev.target.value })); } },
              ["owner", "admin", "support", "finanzen"].map(function (r) { return E("option", { key: r, value: r }, r); }))),
          E("div", null, E("label", { style: { fontSize: 11, color: CI.muted } }, "Grund"),
            E("input", { style: feld, value: form.grund, onChange: function (ev) {
              setzeForm(Object.assign({}, form, { grund: ev.target.value })); } })),
          E("button", { type: "button", style: knopf, disabled: !form.benutzer_id || form.grund.length < 5,
            onClick: function () { setzen(form.benutzer_id, true, form.rolle, form.grund);
              setzeForm({ benutzer_id: "", rolle: "support", grund: "" }); } }, "Ernennen"))) : null,
      E("div", { style: { fontSize: 12, color: CI.muted } },
        "Mindestens ein aktiver Owner bleibt immer bestehen — die Datenbank lässt das Gegenteil nicht zu. "
        + "Jede Änderung steht im Audit-Log."));
  }

  // --- Zweiter Faktor (fork_68) ---------------------------------------------
  // Supabase fuehrt die Stufe der Anmeldung: aal1 = Passwort, aal2 = Passwort
  // und bestaetigter zweiter Faktor. Der Betreiberbereich verlangt aal2 —
  // die Edge Function weist alles andere ab, diese Tafel fuehrt nur hin.
  function ZweiterFaktor(p) {
    var sZ = React.useState({ lade: true }), stand = sZ[0], setzeStand = sZ[1];
    var cZ = React.useState(""), code = cZ[0], setzeCode = cZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];

    React.useEffect(function () {
      var mfa = window._sb.auth.mfa;
      mfa.listFactors().then(function (r) {
        var totp = ((r.data && r.data.totp) || []).filter(function (f) { return f.status === "verified"; });
        if (totp.length) { setzeStand({ lade: false, faktor: totp[0], bestaetigen: true }); return; }
        // Noch kein Faktor: einen anlegen — Supabase liefert QR-Code und Geheimnis.
        return mfa.enroll({ factorType: "totp", friendlyName: "immoOffice Betreiber" })
          .then(function (e) {
            if (e.error) throw e.error;
            setzeStand({ lade: false, neu: e.data, bestaetigen: false });
          });
      }).catch(function (f) { setzeStand({ lade: false }); setzeFehler(f.message || String(f)); });
    }, []);

    async function bestaetigen() {
      setzeFehler("");
      var mfa = window._sb.auth.mfa;
      var faktorId = stand.neu ? stand.neu.id : stand.faktor.id;
      try {
        var ch = await mfa.challenge({ factorId: faktorId });
        if (ch.error) throw ch.error;
        var v = await mfa.verify({ factorId: faktorId, challengeId: ch.data.id, code: code.trim() });
        if (v.error) throw v.error;
        p.fertig();
      } catch (f) { setzeFehler(f.message || String(f)); }
    }

    if (stand.lade) return E("div", { style: kasten }, "Zweiter Faktor wird geprüft …");
    return E("div", { style: Object.assign({}, kasten, { maxWidth: 520 }) },
      E("h3", { style: { margin: "0 0 8px", fontSize: 16, color: CI.blau } },
        stand.neu ? "Zweiten Faktor einrichten" : "Zweiten Faktor bestätigen"),
      E("p", { style: { fontSize: 13, color: CI.muted, margin: "0 0 14px" } },
        "Der Betreiberbereich ist nur mit einem zweiten Faktor erreichbar. "
        + (stand.neu
          ? "Scannen Sie den Code mit einer Authenticator-App (z. B. Microsoft Authenticator, Google Authenticator, 1Password) und geben Sie die sechs Ziffern ein."
          : "Geben Sie die sechs Ziffern aus Ihrer Authenticator-App ein.")),
      stand.neu ? E("div", { style: { textAlign: "center", marginBottom: 12 } },
        E("img", { src: stand.neu.totp.qr_code, alt: "QR-Code", style: { width: 180, height: 180 } }),
        E("div", { style: { fontSize: 11, color: CI.muted, wordBreak: "break-all", marginTop: 6 } },
          "Geheimnis von Hand: ", stand.neu.totp.secret)) : null,
      E("div", { style: { display: "flex", gap: 8 } },
        E("input", { style: Object.assign({}, feld, { letterSpacing: "0.3em", fontSize: 18, textAlign: "center" }),
          value: code, inputMode: "numeric", autoComplete: "one-time-code", maxLength: 6,
          placeholder: "000000", onChange: function (ev) { setzeCode(ev.target.value.replace(/\D/g, "")); },
          onKeyDown: function (ev) { if (ev.key === "Enter") bestaetigen(); } }),
        E("button", { type: "button", style: knopf, onClick: bestaetigen, disabled: code.length !== 6 }, "Bestätigen")),
      fehler ? E("div", { style: { color: CI.danger, fontSize: 13, marginTop: 10 } }, fehler) : null);
  }

  function ImmoPlattform() {
    var rZ = React.useState("zahlen"), reiter = rZ[0], setzeReiter = rZ[1];
    var dZ = React.useState({}), daten = dZ[0], setzeDaten = dZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    var mZ = React.useState(null), meldung = mZ[0], setzeMeldung = mZ[1];
    var oZ = React.useState(null), offen = oZ[0], setzeOffen = oZ[1];
    var supZ = React.useState(null), support = supZ[0], setzeSupport = supZ[1];
    // Die sechs Zustaende oben sind die der Vorlage und bleiben die ERSTEN
    // sechs Hooks — tests/plattform-admin.js setzt sie der Reihe nach.
    // Wer bin ich hier — und muss erst der zweite Faktor her?
    var wZ = React.useState({ lade: true }), wer = wZ[0], setzeWer = wZ[1];
    var werLaden = React.useCallback(function () {
      ruf("wer").then(function (d) { setzeWer({ lade: false, rolle: d.rolle, mfa_pflicht: d.mfa_pflicht, stripe_modus: d.stripe_modus || null }); })
        .catch(function (f) {
          var mfa = /Zweiter Faktor/.test(f.message || "");
          setzeWer({ lade: false, mfa: mfa, fehler: mfa ? "" : (f.message || String(f)) });
        });
    }, []);
    React.useEffect(function () { werLaden(); }, [werLaden]);

    // Sitzungssperre: nach N Minuten ohne Eingabe (Plattformwert
    // betreiber_sitzung_minuten, Start 30) faellt die Tafel in den
    // Anfangszustand zurueck und fragt den zweiten Faktor erneut ab.
    var gesperrtZ = React.useState(false), gesperrt = gesperrtZ[0], setzeGesperrt = gesperrtZ[1];
    React.useEffect(function () {
      var minuten = Number(window.IMMO_BETREIBER_SITZUNG_MINUTEN || 30);
      var zuletzt = Date.now();
      var merk = function () { zuletzt = Date.now(); };
      ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach(function (ev) {
        window.addEventListener(ev, merk, { passive: true });
      });
      var uhr = setInterval(function () {
        if (Date.now() - zuletzt > minuten * 60000) setzeGesperrt(true);
      }, 15000);
      return function () {
        clearInterval(uhr);
        ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach(function (ev) {
          window.removeEventListener(ev, merk);
        });
      };
    }, []);

    var tZ = React.useState(30), tage = tZ[0], setzeTage = tZ[1];
    var laden = React.useCallback(function (welcher, id) {
      var aktion = welcher === "zahlen" ? "uebersicht"
        : welcher === "umsatz" ? "umsatz"
        : welcher === "kosten" ? "kosten"
        : welcher === "funktionen" ? "features"
        : welcher === "zahlungen" ? "zahlungen"
        : welcher === "mandanten" ? "mandanten"
        : welcher === "katalog" ? "katalog"
        : welcher === "konten" ? "nutzer"
        : welcher === "system" ? "system"
        : welcher === "admins" ? "admin_liste"
        : welcher === "mandant" ? "mandant" : "protokoll";
      ruf(aktion, welcher === "mandant" ? { mandant_id: id } : (welcher === "zahlen" || welcher === "kosten" || welcher === "zahlungen") ? { tage: tage } : null).then(function (d) {
        var n = {};
        n[welcher] = welcher === "mandanten" ? d.mandanten
          : welcher === "admins" ? d.admins
          : welcher === "konten" ? d.nutzer
          : welcher === "protokoll" ? d.eintraege : d;
        setzeDaten(function (alt) { return Object.assign({}, alt, n); });
      }).catch(function (f) { setzeFehler(f.message || String(f)); });
    }, [tage]);

    var supportLaden = React.useCallback(function () {
      ruf("support_stand").then(function (d) { setzeSupport(d.sitzung || null); })
        .catch(function () { /* ohne Anzeige laeuft der Rest weiter */ });
    }, []);

    React.useEffect(function () {
      setzeFehler("");
      if (offen) laden("mandant", offen); else laden(reiter);
      supportLaden();
    }, [reiter, offen, laden, supportLaden]);

    // Der Katalog wird fuer die Tarifauswahl in der Mandantentafel gebraucht.
    React.useEffect(function () {
      if (offen && !daten.katalog) laden("katalog");
      // Der Katalog zeigt die Ist-Kosten je Credit neben dem Preis.
      if (reiter === "katalog" && !daten.kosten) laden("kosten");
    }, [offen, reiter, daten.katalog, daten.kosten, laden]);

    function melden(text, art) { setzeMeldung({ text: text, art: art || "ok" }); }

    async function supportBeenden() {
      try { await ruf("support_ende"); setzeSupport(null);
        melden("Supportzugriff beendet."); }
      catch (f) { melden(f.message || String(f), "fehler"); }
    }

    if (wer.lade) return E("div", { style: kasten }, "Betreiberbereich wird geöffnet …");
    if (gesperrt) return E("div", { style: Object.assign({}, kasten, { maxWidth: 520 }) },
      E("h3", { style: { margin: "0 0 8px", fontSize: 16, color: CI.blau } }, "Sitzung gesperrt"),
      E("p", { style: { fontSize: 13, color: CI.muted } },
        "Im Betreiberbereich war eine Weile keine Eingabe. Bitte erneut öffnen."),
      E("button", { type: "button", style: knopf, onClick: function () {
        setzeGesperrt(false); setzeWer({ lade: true }); werLaden(); } }, "Erneut öffnen"));
    if (wer.mfa) return E(ZweiterFaktor, { fertig: function () {
      // Das Token traegt jetzt aal2 — die Funktion laesst herein.
      setzeWer({ lade: true }); werLaden(); } });
    if (wer.fehler) return E("div", { style: Object.assign({}, kasten, { color: CI.danger }) }, wer.fehler);

    // Welche Reiter eine Rolle sieht. Ausgeblendet ist Bequemlichkeit; die
    // Schranke steht in der Funktion.
    var rolle = wer.rolle || "admin";
    var alleReiter = [["zahlen", "Übersicht", ["owner", "admin", "support", "finanzen"]],
      ["umsatz", "Umsatz & Abos", ["owner", "admin", "finanzen"]],
      ["kosten", "Kosten & Marge", ["owner", "admin", "finanzen"]],
      ["zahlungen", "Zahlungen", ["owner", "admin", "finanzen"]],
      ["funktionen", "Funktionen", ["owner", "admin", "support", "finanzen"]],
      ["mandanten", "Mandanten", ["owner", "admin", "support", "finanzen"]],
      ["konten", "Konten", ["owner", "admin", "support"]],
      ["katalog", "Katalog", ["owner", "admin", "support", "finanzen"]],
      ["system", "System", ["owner", "admin"]],
      ["admins", "Admins", ["owner", "admin", "support", "finanzen"]],
      ["protokoll", "Audit-Log", ["owner", "admin", "support", "finanzen"]]];
    var reiterListe = alleReiter.filter(function (r) { return r[2].indexOf(rolle) >= 0; });

    return E("div", null,
      E("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 } },
        E("span", { style: { fontSize: 11, color: CI.muted } }, "Zeitraum:"),
        [[7, "7 Tage"], [30, "30 Tage"], [90, "90 Tage"], [365, "12 Monate"]].map(function (z) {
          var an = tage === z[0];
          return E("button", { key: z[0], type: "button", onClick: function () { setzeTage(z[0]); },
            style: Object.assign({}, knopfLeer, { padding: "4px 10px", fontSize: 12 },
              an ? { background: CI.blau, color: "#fff", borderColor: CI.blau } : {}) }, z[1]);
        }),
        E("input", { type: "number", min: 1, max: 365, style: Object.assign({}, feld, { width: 70, padding: "4px 8px", fontSize: 12 }),
          value: tage, title: "frei, in Tagen", onChange: function (e) { var n = Number(e.target.value); if (n >= 1 && n <= 365) setzeTage(n); } }),
        E("span", { style: { fontSize: 11, color: CI.muted, marginLeft: "auto" } }, "Rolle: " + rolle)),
      // Ein laufender Supportzugriff muss sichtbar sein, immer. Wer vergisst,
      // dass er in fremden Daten steht, haelt sie fuer seine eigenen.
      support ? E("div", { "data-support-band": "1", style: {
        background: "#fff7e6", border: "1px solid #f0dcb0", color: "#6b4e13",
        padding: "10px 14px", marginBottom: 16, fontSize: 13.5, borderRadius: 8,
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      } },
        E("strong", null, "Supportzugriff läuft"),
        E("span", null, (support.mandant_name || support.mandant_id)
          + " · " + (support.schreiben ? "lesen und ändern" : "nur lesen")
          + " · bis " + zeit(support.gueltig_bis)),
        E("button", { type: "button", style: knopfLeer, onClick: supportBeenden },
          "Jetzt beenden")) : null,
      E("div", { style: { display: "flex", borderBottom: "1px solid " + CI.border, marginBottom: 20, flexWrap: "wrap" } },
        reiterListe.map(function (r) {
          var an = reiter === r[0] && !offen;
          return E("button", { key: r[0], type: "button",
            onClick: function () { setzeOffen(null); setzeReiter(r[0]); },
            style: {
              background: "transparent", border: "none", padding: "10px 16px", fontSize: 14,
              fontWeight: an ? 600 : 400, color: an ? CI.blau : CI.muted,
              borderBottom: an ? "2px solid " + CI.blau : "2px solid transparent",
              cursor: "pointer", fontFamily: "inherit",
            } }, r[1]);
        })),
      fehler ? E("div", { style: {
        background: "#fdf2f2", border: "1px solid #e8c4c0", color: CI.danger,
        padding: "10px 14px", marginBottom: 16, fontSize: 13, borderRadius: 8,
      } }, fehler) : null,
      meldung ? E("div", { style: {
        background: meldung.art === "fehler" ? "#fdf2f2" : meldung.art === "warnung" ? "#fff7e6" : "#e9f6ec",
        border: "1px solid " + (meldung.art === "fehler" ? "#e8c4c0" : meldung.art === "warnung" ? "#f0dcb0" : "#bfe3c8"),
        color: meldung.art === "fehler" ? CI.danger : meldung.art === "warnung" ? "#6b4e13" : CI.success,
        padding: "10px 14px", marginBottom: 16, fontSize: 13, borderRadius: 8,
      } }, meldung.text) : null,

      offen ? E(MandantTafel, { daten: daten.mandant, katalog: daten.katalog, rolle: rolle,
            melden: melden, supportNeu: supportLaden,
            neuLaden: function () { laden("mandant", offen); },
            zurueck: function () { setzeOffen(null); laden("mandanten"); } })
        : reiter === "zahlen" ? E(Zahlen, { daten: daten.zahlen, oeffnen: function (id) { setzeOffen(id); } })
        : reiter === "umsatz" ? E(Umsatz, { daten: daten.umsatz, oeffnen: function (id) { setzeOffen(id); } })
        : reiter === "kosten" ? E(Kosten, { daten: daten.kosten, rolle: rolle, melden: melden, neuLaden: function () { laden("kosten"); },
            oeffnen: function (id) { setzeOffen(id); } })
        : reiter === "mandanten" ? E(Mandanten, { daten: daten.mandanten, melden: melden,
            oeffnen: function (id) { setzeOffen(id); },
            neuLaden: function () { laden("mandanten"); } })
        : reiter === "konten" ? E(Konten, { daten: daten.konten, melden: melden,
            neuLaden: function () { laden("konten"); } })
        : reiter === "katalog" ? E(Katalog, { daten: daten.katalog, kosten: daten.kosten, tage: tage, rolle: rolle,
            stripeModus: wer.stripe_modus, melden: melden, neuLaden: function () { laden("katalog"); } })
        : reiter === "zahlungen" ? E(Zahlungen, { daten: daten.zahlungen, rolle: rolle, melden: melden, neuLaden: function () { laden("zahlungen"); },
            oeffnen: function (id) { setzeOffen(id); } })
        : reiter === "funktionen" ? E(Funktionen, { daten: daten.funktionen, rolle: rolle, melden: melden, neuLaden: function () { laden("funktionen"); } })
        : reiter === "system" ? E(System, { daten: daten.system })
        : reiter === "admins" ? E(Admins, { daten: daten.admins, konten: daten.konten, rolle: rolle,
            melden: melden, neuLaden: function () { laden("admins"); if (rolle === "owner") laden("konten"); } })
        : E(Protokoll, { daten: daten.protokoll }));
  }

  window.ImmoPlattform = ImmoPlattform;
})();
