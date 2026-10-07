// ============================================================================
// Hilfe & Support — Anfragen an den Betreiber, Zugriffsanfragen des Supports
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_77), Handarbeit, klassische Laufzeit.
//
// Drei Stücke:
//
//   * ImmoHilfe — die Kachel „Hilfe & Support": eigene Anfragen lesen,
//     neue stellen, antworten, schliessen. Für jeden im Haus.
//   * ImmoSupportZugriffe — Reiter in den Einstellungen (Chef): Anfragen
//     des Supports freigeben oder ablehnen, laufende Zugriffe beenden, und
//     das Protokoll je Sitzung lesen (Seiten, geänderte Zeilen).
//   * ImmoSupportAnfrageBand — das Band über der Anwendung, das dem Chef
//     eine wartende Zugriffsanfrage zeigt. Mit zwei Knöpfen.
//
// Diese Datei ENTSCHEIDET NICHTS. Was der Support sehen darf, entscheidet
// `support_sitzung()` in der Datenbank — und die verlangt eine Freigabe.
// Die Tafel hier schickt nur das Ja oder Nein dorthin.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34",
  };
  var E = React.createElement;

  var kasten = { background: CI.card, border: "1px solid " + CI.border, borderRadius: 10, padding: 18, marginBottom: 16 };
  var knopf = { background: CI.blau, color: "#fff", border: "1px solid " + CI.blau, borderRadius: 7,
    padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  var knopfLeer = Object.assign({}, knopf, { background: "#fff", color: CI.blau, borderColor: CI.border });
  var feld = { width: "100%", padding: "8px 10px", border: "1px solid " + CI.border, borderRadius: 7, fontSize: 13.5, boxSizing: "border-box" };

  var KATEGORIEN = [["frage", "Frage"], ["fehler", "Fehler"], ["abrechnung", "Abrechnung"],
    ["datenuebernahme", "Datenübernahme"], ["sonstiges", "Sonstiges"]];
  var STAND = { offen: "offen", in_arbeit: "in Arbeit", wartet_kunde: "Antwort erhalten", geloest: "gelöst", geschlossen: "geschlossen" };
  var UEBERNAHME = { beauftragt: "beauftragt", datei_erhalten: "Datei erhalten", importiert: "importiert", abgenommen: "abgenommen" };

  function zeit(w) { try { return new Date(w).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return String(w || ""); } }
  function kat(k) { var x = KATEGORIEN.filter(function (a) { return a[0] === k; })[0]; return x ? x[1] : k; }

  // --- Hilfe: Anfragen -------------------------------------------------------
  function ImmoHilfe(p) {
    var lZ = React.useState(null), liste = lZ[0], setzeListe = lZ[1];
    var oZ = React.useState(null), offen = oZ[0], setzeOffen = oZ[1];
    var aZ = React.useState(null), antworten = aZ[0], setzeAntworten = aZ[1];
    var nZ = React.useState(null), neu = nZ[0], setzeNeu = nZ[1];
    var tZ = React.useState(""), text = tZ[0], setzeText = tZ[1];
    var mZ = React.useState(""), meldung = mZ[0], setzeMeldung = mZ[1];

    var laden = React.useCallback(function () {
      if (!window._sb) return;
      window._sb.from("support_anfragen").select("*").order("erstellt_am", { ascending: false }).limit(200)
        .then(function (r) { if (!r.error) setzeListe(r.data || []); else setzeMeldung(r.error.message); });
    }, []);
    React.useEffect(function () { laden(); }, [laden]);

    var antwortenLaden = React.useCallback(function (id) {
      window._sb.from("support_antworten").select("*").eq("anfrage_id", id).order("erstellt_am")
        .then(function (r) { setzeAntworten(r.error ? [] : (r.data || [])); });
    }, []);
    React.useEffect(function () { if (offen) antwortenLaden(offen.id); else setzeAntworten(null); }, [offen && offen.id]);

    async function anlegen() {
      try {
        var r = await window._sb.from("support_anfragen").insert({
          betreff: neu.betreff.trim(), text: neu.text.trim(), kategorie: neu.kategorie, prioritaet: neu.prioritaet,
          mandant_id: window.IMMO_MANDANT_ID || undefined, nutzer_id: p.user && p.user.id }).select("*").single();
        if (r.error) throw r.error;
        setzeNeu(null); setzeMeldung("Anfrage gesendet. Der Support antwortet hier und per E-Mail."); laden(); setzeOffen(r.data);
      } catch (f) { setzeMeldung(f.message || String(f)); }
    }
    async function antworten_() {
      if (!text.trim()) return;
      try {
        var r = await window._sb.from("support_antworten").insert({ anfrage_id: offen.id, text: text.trim(),
          mandant_id: offen.mandant_id, autor_id: p.user && p.user.id, autor_name: p.user && (p.user.name || p.user.email) });
        if (r.error) throw r.error;
        setzeText(""); antwortenLaden(offen.id); laden();
      } catch (f) { setzeMeldung(f.message || String(f)); }
    }
    async function schliessen() {
      try { var r = await window._sb.rpc("support_anfrage_schliessen", { p_id: offen.id }); if (r.error) throw r.error;
        setzeOffen(Object.assign({}, offen, { status: "geschlossen" })); laden(); }
      catch (f) { setzeMeldung(f.message || String(f)); }
    }

    if (liste === null) return E("div", { style: { padding: 24, color: CI.muted } }, "Lade Anfragen …");
    var leer = { betreff: "", text: "", kategorie: "frage", prioritaet: "normal" };
    return E("div", { style: { padding: "0 0 24px" } },
      meldung ? E("div", { style: { fontSize: 13, color: CI.blau, background: "#fff8e6", border: "1px solid #f0dca8", borderRadius: 8, padding: "8px 12px", marginBottom: 12 } },
        meldung, E("button", { type: "button", style: Object.assign({}, knopfLeer, { marginLeft: 10, padding: "2px 8px" }), onClick: function () { setzeMeldung(""); } }, "×")) : null,

      offen ? E("div", { style: kasten },
        E("button", { type: "button", style: knopfLeer, onClick: function () { setzeOffen(null); } }, "← Alle Anfragen"),
        E("h3", { style: { margin: "14px 0 4px", fontSize: 17, color: CI.blau } }, offen.betreff),
        E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 12 } },
          kat(offen.kategorie) + " · " + (STAND[offen.status] || offen.status) + " · gestellt " + zeit(offen.erstellt_am)
          + (offen.kategorie === "datenuebernahme" && offen.uebernahme_status ? " · Übernahme: " + UEBERNAHME[offen.uebernahme_status] : "")),
        E("div", { style: { fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: "10px 12px", background: CI.bg, borderRadius: 8 } }, offen.text),
        (antworten || []).map(function (a) {
          return E("div", { key: a.id, style: { marginTop: 10, padding: "10px 12px", borderRadius: 8,
            background: a.von_betreiber ? "#eef2f8" : "#fff", border: "1px solid " + CI.border } },
            E("div", { style: { fontSize: 11.5, color: CI.muted, marginBottom: 4 } },
              (a.von_betreiber ? "Support" + (a.autor_name ? " (" + a.autor_name + ")" : "") : (a.autor_name || "Sie")) + " · " + zeit(a.erstellt_am)),
            E("div", { style: { fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.6 } }, a.text));
        }),
        offen.status !== "geschlossen" ? E("div", { style: { marginTop: 14 } },
          E("textarea", { style: Object.assign({}, feld, { minHeight: 80 }), value: text, placeholder: "Antwort …",
            onChange: function (e) { setzeText(e.target.value); } }),
          E("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
            E("button", { type: "button", style: knopf, disabled: !text.trim(), onClick: antworten_ }, "Antworten"),
            E("button", { type: "button", style: knopfLeer, onClick: schliessen }, "Anfrage schließen")))
          : E("div", { style: { fontSize: 12.5, color: CI.muted, marginTop: 12 } }, "Diese Anfrage ist geschlossen."))

      : E("div", null,
        E("div", { style: Object.assign({}, kasten, { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }) },
          E("div", null,
            E("div", { style: { fontSize: 15, fontWeight: 700, color: CI.blau } }, "Hilfe & Support"),
            E("div", { style: { fontSize: 12.5, color: CI.muted } }, "Fragen, Fehler, Abrechnung, Datenübernahme — der Support antwortet hier und per E-Mail.")),
          E("button", { type: "button", style: knopf, onClick: function () { setzeNeu(leer); } }, "Neue Anfrage")),

        neu ? E("div", { style: kasten },
          E("div", { style: { fontSize: 14, fontWeight: 600, marginBottom: 10 } }, "Neue Anfrage"),
          E("input", { style: feld, value: neu.betreff, placeholder: "Betreff", onChange: function (e) { setzeNeu(Object.assign({}, neu, { betreff: e.target.value })); } }),
          E("div", { style: { display: "flex", gap: 8, margin: "8px 0" } },
            E("select", { style: feld, value: neu.kategorie, onChange: function (e) { setzeNeu(Object.assign({}, neu, { kategorie: e.target.value })); } },
              KATEGORIEN.map(function (k) { return E("option", { key: k[0], value: k[0] }, k[1]); })),
            E("select", { style: feld, value: neu.prioritaet, onChange: function (e) { setzeNeu(Object.assign({}, neu, { prioritaet: e.target.value })); } },
              E("option", { value: "niedrig" }, "niedrig"), E("option", { value: "normal" }, "normal"), E("option", { value: "hoch" }, "hoch — es geht nichts mehr"))),
          neu.kategorie === "datenuebernahme" ? E("p", { style: { fontSize: 12.5, color: CI.muted, margin: "0 0 8px" } },
            "Datenübernahmen aus einem anderen System sind ein kostenpflichtiges Einrichtungspaket. Schreiben Sie, woher die Daten kommen und wie viele Objekte und Kontakte es sind — der Support meldet sich mit dem Ablauf.") : null,
          E("textarea", { style: Object.assign({}, feld, { minHeight: 120 }), value: neu.text, placeholder: "Was ist passiert, was haben Sie erwartet? Bitte keine Passwörter.",
            onChange: function (e) { setzeNeu(Object.assign({}, neu, { text: e.target.value })); } }),
          E("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
            E("button", { type: "button", style: knopf, disabled: neu.betreff.trim().length < 3 || neu.text.trim().length < 3, onClick: anlegen }, "Senden"),
            E("button", { type: "button", style: knopfLeer, onClick: function () { setzeNeu(null); } }, "Abbrechen"))) : null,

        E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
          !liste.length ? E("div", { style: { padding: 18, fontSize: 13, color: CI.muted } }, "Noch keine Anfrage.")
          : E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 560 } },
            E("thead", null, E("tr", null, ["Betreff", "Art", "Stand", "Gestellt", "Zuletzt"].map(function (t, i) {
              return E("th", { key: i, style: { textAlign: "left", fontSize: 11, color: CI.muted, textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 12px", borderBottom: "1px solid " + CI.border } }, t); }))),
            E("tbody", null, liste.map(function (a) {
              return E("tr", { key: a.id, style: { cursor: "pointer" }, onClick: function () { setzeOffen(a); } },
                E("td", { style: { padding: "9px 12px", borderBottom: "1px solid " + CI.border, fontSize: 13.5, fontWeight: 600, color: CI.blau } }, a.betreff),
                E("td", { style: { padding: "9px 12px", borderBottom: "1px solid " + CI.border, fontSize: 12.5 } }, kat(a.kategorie)),
                E("td", { style: { padding: "9px 12px", borderBottom: "1px solid " + CI.border, fontSize: 12.5,
                  color: a.status === "wartet_kunde" ? CI.gold : a.status === "geloest" || a.status === "geschlossen" ? CI.muted : CI.blau } }, STAND[a.status] || a.status),
                E("td", { style: { padding: "9px 12px", borderBottom: "1px solid " + CI.border, fontSize: 12.5, whiteSpace: "nowrap" } }, zeit(a.erstellt_am)),
                E("td", { style: { padding: "9px 12px", borderBottom: "1px solid " + CI.border, fontSize: 12.5, whiteSpace: "nowrap" } }, zeit(a.aktualisiert_am)));
            })))),
        p.user && p.user.role === "chef" ? E("p", { style: { fontSize: 12, color: CI.muted } },
          "Zugriffsanfragen des Supports auf Ihre Daten stehen unter Einstellungen → Support-Zugriffe. Ohne Ihre Freigabe sieht der Support nichts.") : null));
  }

  // --- Support-Zugriffe (Einstellungen, Chef) ----------------------------------
  function ImmoSupportZugriffe(p) {
    var lZ = React.useState(null), liste = lZ[0], setzeListe = lZ[1];
    var sZ = React.useState(null), gewaehlt = sZ[0], setzeGewaehlt = sZ[1];
    var pZ = React.useState(null), protokoll = pZ[0], setzeProtokoll = pZ[1];
    var mZ = React.useState(""), meldung = mZ[0], setzeMeldung = mZ[1];
    var chef = p.user && p.user.role === "chef";

    var laden = React.useCallback(function () {
      if (!window._sb) return;
      window._sb.rpc("support_zugriffe_meines_hauses").then(function (r) {
        if (r.error) setzeMeldung(r.error.message); else setzeListe(r.data || []);
      });
    }, []);
    React.useEffect(function () { laden(); }, [laden]);
    React.useEffect(function () {
      if (!gewaehlt) { setzeProtokoll(null); return; }
      window._sb.from("support_protokoll").select("*").eq("sitzung_id", gewaehlt).order("zeit")
        .then(function (r) { setzeProtokoll(r.error ? [] : (r.data || [])); });
    }, [gewaehlt]);

    async function entscheiden(id, ja) {
      if (ja && !window.confirm("Dem Support den Zugriff freigeben? Sie können ihn jederzeit beenden; alles, was er tut, steht im Protokoll.")) return;
      try { var r = await window._sb.rpc("support_zugriff_entscheiden", { p_id: id, p_freigeben: ja }); if (r.error) throw r.error;
        setzeMeldung(ja ? "Freigegeben. Die Zeit läuft ab jetzt." : "Abgelehnt."); laden(); }
      catch (f) { setzeMeldung(f.message || String(f)); }
    }
    async function beenden(id) {
      try { var r = await window._sb.rpc("support_zugriff_beenden", { p_id: id }); if (r.error) throw r.error;
        setzeMeldung("Zugriff beendet."); laden(); }
      catch (f) { setzeMeldung(f.message || String(f)); }
    }

    if (liste === null) return E("div", { style: { padding: 20, color: CI.muted } }, "Lade Support-Zugriffe …");
    var offen = liste.filter(function (z) { return z.stand === "angefragt"; });
    var laufend = liste.filter(function (z) { return z.stand === "laeuft"; });
    var rest = liste.filter(function (z) { return z.stand !== "angefragt" && z.stand !== "laeuft"; });
    var farbe = { angefragt: CI.gold, laeuft: CI.danger, beendet: CI.muted, abgelaufen: CI.muted, abgelehnt: CI.muted, verfallen: CI.muted };
    function zeile(z, knoepfe) {
      return E("div", { key: z.id, style: { padding: "10px 0", borderBottom: "1px solid " + CI.border, fontSize: 13 } },
        E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          E("span", { style: { fontWeight: 700, color: farbe[z.stand] || CI.blau } }, z.stand),
          E("span", null, (z.admin_name || z.admin_email || "Support") + " · " + (z.schreiben ? "lesen und ändern" : "nur lesen") + " · " + (z.dauer_minuten >= 60 ? Math.round(z.dauer_minuten / 60) + " h" : z.dauer_minuten + " min")),
          E("span", { style: { color: CI.muted } }, "angefragt " + zeit(z.angefragt_am) + (z.freigegeben_am ? " · freigegeben " + zeit(z.freigegeben_am) : "") + (z.stand === "laeuft" ? " · endet " + zeit(z.gueltig_bis) : "") + (z.beendet_am ? " · beendet " + zeit(z.beendet_am) : ""))),
        E("div", { style: { color: CI.muted, margin: "3px 0 6px" } }, "Grund: " + z.grund),
        E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, knoepfe,
          z.freigegeben_am ? E("button", { type: "button", style: knopfLeer, onClick: function () { setzeGewaehlt(gewaehlt === z.id ? null : z.id); } },
            gewaehlt === z.id ? "Protokoll schließen" : "Protokoll") : null),
        gewaehlt === z.id ? E("div", { style: { marginTop: 8, background: CI.bg, borderRadius: 8, padding: "8px 12px", fontSize: 12.5 } },
          protokoll === null ? "Lade …" : !protokoll.length ? "Noch nichts protokolliert."
          : protokoll.map(function (e) {
              return E("div", { key: e.id, style: { padding: "2px 0", fontFamily: e.art === "aenderung" ? "ui-monospace, monospace" : "inherit" } },
                E("span", { style: { color: CI.muted } }, zeit(e.zeit) + " · "),
                e.art === "seite" ? "Seite " + e.was : "Änderung: " + e.tabelle + " " + e.was + (e.satz_id ? " (" + e.satz_id.slice(0, 8) + "…)" : ""));
            })) : null);
    }
    return E("div", null,
      E("p", { style: { fontSize: 13, color: CI.muted, lineHeight: 1.7, marginTop: 0 } },
        "Der Support von immoOffice.ai sieht Ihre Daten nur, wenn Sie es hier freigeben — befristet, begründet und protokolliert. Jeden Zugriff können Sie vorzeitig beenden; jede aufgerufene Seite und jede geänderte Zeile steht im Protokoll."),
      meldung ? E("div", { style: { fontSize: 13, color: CI.blau, background: "#fff8e6", border: "1px solid #f0dca8", borderRadius: 8, padding: "8px 12px", marginBottom: 12 } }, meldung) : null,
      !chef ? E("p", { style: { fontSize: 12.5, color: CI.muted } }, "Freigeben und beenden kann nur der Chef des Hauses.") : null,
      E("div", { style: kasten }, E("div", { style: { fontSize: 14, fontWeight: 700, color: CI.blau, marginBottom: 6 } }, "Wartet auf Ihre Entscheidung"),
        !offen.length ? E("div", { style: { fontSize: 13, color: CI.muted } }, "Keine offene Anfrage.")
        : offen.map(function (z) { return zeile(z, chef ? [
            E("button", { key: "j", type: "button", style: knopf, onClick: function () { entscheiden(z.id, true); } }, "Freigeben"),
            E("button", { key: "n", type: "button", style: knopfLeer, onClick: function () { entscheiden(z.id, false); } }, "Ablehnen")] : null); })),
      E("div", { style: kasten }, E("div", { style: { fontSize: 14, fontWeight: 700, color: CI.blau, marginBottom: 6 } }, "Läuft gerade"),
        !laufend.length ? E("div", { style: { fontSize: 13, color: CI.muted } }, "Niemand sieht gerade Ihre Daten.")
        : laufend.map(function (z) { return zeile(z, chef ? [E("button", { key: "e", type: "button", style: Object.assign({}, knopf, { background: CI.danger, borderColor: CI.danger }), onClick: function () { beenden(z.id); } }, "Jetzt beenden")] : null); })),
      E("div", { style: kasten }, E("div", { style: { fontSize: 14, fontWeight: 700, color: CI.blau, marginBottom: 6 } }, "Bisherige Zugriffe"),
        !rest.length ? E("div", { style: { fontSize: 13, color: CI.muted } }, "Noch keiner.") : rest.map(function (z) { return zeile(z, null); })));
  }

  // --- Das Band fuer den Chef -----------------------------------------------
  function ImmoSupportAnfrageBand() {
    var oZ = React.useState([]), offen = oZ[0], setzeOffen = oZ[1];
    var cZ = React.useState(false), chef = cZ[0], setzeChef = cZ[1];
    React.useEffect(function () {
      if (!window._sb) return;
      var weg = false;
      window._sb.rpc("aktuelle_rolle").then(function (r) { if (!weg && r.data === "chef") setzeChef(true); }).catch(function () {});
      function fragen() {
        window._sb.rpc("support_zugriffe_meines_hauses").then(function (r) {
          if (weg || r.error) return;
          setzeOffen((r.data || []).filter(function (z) { return z.stand === "angefragt"; }));
        }).catch(function () {});
      }
      fragen();
      var uhr = setInterval(fragen, 60000);
      return function () { weg = true; clearInterval(uhr); };
    }, []);
    async function entscheiden(z, ja) {
      try { var r = await window._sb.rpc("support_zugriff_entscheiden", { p_id: z.id, p_freigeben: ja }); if (r.error) throw r.error;
        setzeOffen(offen.filter(function (x) { return x.id !== z.id; })); }
      catch (f) { window.alert(f.message || String(f)); }
    }
    if (!chef || !offen.length) return null;
    var z = offen[0];
    return E("div", { "data-support-anfrage-band": "1", style: { background: CI.gold, color: "#1B2A47", fontSize: 13.5,
      padding: "9px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center" } },
      E("strong", null, "Support-Zugriff angefragt"),
      E("span", null, (z.admin_name || "Der Support") + " möchte " + (z.schreiben ? "lesen und ändern" : "nur lesen")
        + " (" + (z.dauer_minuten >= 60 ? Math.round(z.dauer_minuten / 60) + " h" : z.dauer_minuten + " min") + "). Grund: " + z.grund),
      E("button", { type: "button", style: Object.assign({}, knopf, { padding: "4px 10px" }), onClick: function () { entscheiden(z, true); } }, "Freigeben"),
      E("button", { type: "button", style: Object.assign({}, knopfLeer, { padding: "4px 10px" }), onClick: function () { entscheiden(z, false); } }, "Ablehnen"));
  }

  window.ImmoHilfe = ImmoHilfe;
  window.ImmoSupportZugriffe = ImmoSupportZugriffe;
  window.ImmoSupportAnfrageBand = ImmoSupportAnfrageBand;
})();
