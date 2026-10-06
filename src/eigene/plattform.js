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
  function Zahlen(p) {
    var d = p.daten;
    if (!d) return E("div", { style: { color: CI.muted } }, "Lade Zahlen …");
    var status = d.abos_nach_status || {};
    return E("div", null,
      E("div", { style: { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 18 } },
        [
          ["Monatserlös (netto)", geld(d.mrr_cent), "aus laufenden Abos; ein Jahresabo zählt mit einem Zwölftel"],
          ["Zahlende Abos", zahl((status.aktiv || 0) + (status.gekuendigt || 0)), zahl(status.test || 0) + " in der Testphase"],
          ["Credits in " + zahl(d.zeitraum_tage) + " Tagen", zahl(d.credits_verbraucht), "verbraucht, über alle Mandanten"],
          ["Anbieterkosten", euro(d.ki_kosten_eur), zahl(d.buchungen_ohne_kosten) + " Buchungen ohne Kostenangabe"],
          ["Gründerplätze frei", zahl(d.gruender_frei), "von der im Katalog gesetzten Zahl"],
        ].map(function (k, i) {
          return E("div", { key: i, style: kasten },
            E("div", { style: { fontSize: 11, color: CI.muted, letterSpacing: "0.06em", textTransform: "uppercase" } }, k[0]),
            E("div", { style: { fontSize: 26, fontWeight: 700, color: CI.blau, margin: "6px 0 4px" } }, k[1]),
            E("div", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.5 } }, k[2]));
        })),
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
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right" }) },
                    a.mit ? euro(a.kosten) : "—"),
                  E("td", { style: Object.assign({}, zelle, { textAlign: "right", color: CI.muted }) },
                    zahl(a.ohne)));
              }))),
        E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.6, marginTop: 12 } },
          "„Ohne Kostenangabe" + "“" + " heisst: der Anbieter nennt keinen Preis je Aufruf "
          + "(Anthropic liefert Token) oder der Dollarkurs fehlt. Diese Buchungen "
          + "zählen beim Verbrauch mit, bei den Kosten nicht — eine geschätzte "
          + "Zahl wäre hier schlimmer als eine fehlende.")));
  }

  // --- Mandanten ------------------------------------------------------------
  function Mandanten(p) {
    var gZ = React.useState(null), geschenk = gZ[0], setzeGeschenk = gZ[1];
    var aZ = React.useState({ credits: 100, grund: "" }), form = aZ[0], setzeForm = aZ[1];
    var bZ = React.useState(false), busy = bZ[0], setzeBusy = bZ[1];
    if (!p.daten) return E("div", { style: { color: CI.muted } }, "Lade Mandanten …");
    var zeilen = p.daten;

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

    return E("div", null,
      E("div", { style: Object.assign({}, kasten, { padding: 0, overflowX: "auto" }) },
        E("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 900 } },
          E("thead", null, E("tr", null,
            ["Haus", "Tarif", "Status", "Zugriff", "Nutzer", "Credits", "Monatserlös", "Fristen", ""]
              .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
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

      E("div", { style: kasten },
        Ueberschrift("Credits"),
        E("div", { style: { fontSize: 24, fontWeight: 700, color: CI.blau } },
          zahl(d.saldo), E("span", { style: { fontSize: 13, fontWeight: 400, color: CI.muted } }, " verfügbar")),
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
          E("thead", null, E("tr", null, ["Name", "Adresse", "Rolle", "Funktion"]
            .map(function (t, i) { return E("th", { key: i, style: kopfzelle }, t); }))),
          E("tbody", null, (d.nutzer || []).map(function (n) {
            return E("tr", { key: n.id },
              E("td", { style: zelle }, n.name || "—"),
              E("td", { style: zelle }, n.email),
              E("td", { style: zelle }, n.role),
              E("td", { style: zelle }, n.funktion || "—"));
          })))),

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
                E("button", { type: "button", style: knopfLeer,
                  disabled: !!busy || grund.trim().length < 5,
                  onClick: function () { setzen(n, !n.plattform_admin); } },
                  n.plattform_admin ? "Recht entziehen" : "Zum Administrator machen")));
          })))),
      E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7 } },
        "Ein Plattform-Administrator pflegt den Katalog und verwaltet die "
        + "Häuser. In die Daten eines Hauses sieht er damit NICHT — dafür "
        + "braucht es einen Supportzugriff, und der ist befristet, begründet "
        + "und für den Kunden nachlesbar."));
  }

  // --- Katalog ---------------------------------------------------------------
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
              z[p.schluessel]),
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

  function Katalog(p) {
    if (!p.daten) return E("div", { style: { color: CI.muted } }, "Lade Katalog …");
    var gemeinsam = { melden: p.melden, neuLaden: p.neuLaden };
    return E("div", null,
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
      E("p", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7 } },
        "Preise sind Nettobeträge in Cent. Eine Preisänderung wirkt sofort auf "
        + "der Website und im Kundenbereich; bei Stripe entsteht sie erst mit "
        + "dem nächsten Lauf von scripts/stripe-einrichten.mjs, und laufende "
        + "Abos bleiben auf ihrem alten Preis — so ist es bei Stripe gewollt "
        + "und rechtlich das Richtige."));
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
  function ImmoPlattform() {
    var rZ = React.useState("zahlen"), reiter = rZ[0], setzeReiter = rZ[1];
    var dZ = React.useState({}), daten = dZ[0], setzeDaten = dZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    var mZ = React.useState(null), meldung = mZ[0], setzeMeldung = mZ[1];
    var oZ = React.useState(null), offen = oZ[0], setzeOffen = oZ[1];
    var supZ = React.useState(null), support = supZ[0], setzeSupport = supZ[1];

    var laden = React.useCallback(function (welcher, id) {
      var aktion = welcher === "zahlen" ? "uebersicht"
        : welcher === "mandanten" ? "mandanten"
        : welcher === "katalog" ? "katalog"
        : welcher === "konten" ? "nutzer"
        : welcher === "system" ? "system"
        : welcher === "mandant" ? "mandant" : "protokoll";
      ruf(aktion, welcher === "mandant" ? { mandant_id: id } : null).then(function (d) {
        var n = {};
        n[welcher] = welcher === "mandanten" ? d.mandanten
          : welcher === "konten" ? d.nutzer
          : welcher === "protokoll" ? d.eintraege : d;
        setzeDaten(function (alt) { return Object.assign({}, alt, n); });
      }).catch(function (f) { setzeFehler(f.message || String(f)); });
    }, []);

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
    }, [offen, daten.katalog, laden]);

    function melden(text, art) { setzeMeldung({ text: text, art: art || "ok" }); }

    async function supportBeenden() {
      try { await ruf("support_ende"); setzeSupport(null);
        melden("Supportzugriff beendet."); }
      catch (f) { melden(f.message || String(f), "fehler"); }
    }

    var reiterListe = [["zahlen", "Zahlen"], ["mandanten", "Mandanten"],
      ["konten", "Konten"], ["katalog", "Katalog"], ["system", "System"],
      ["protokoll", "Protokoll"]];

    return E("div", null,
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

      offen ? E(MandantTafel, { daten: daten.mandant, katalog: daten.katalog,
            melden: melden, supportNeu: supportLaden,
            neuLaden: function () { laden("mandant", offen); },
            zurueck: function () { setzeOffen(null); laden("mandanten"); } })
        : reiter === "zahlen" ? E(Zahlen, { daten: daten.zahlen })
        : reiter === "mandanten" ? E(Mandanten, { daten: daten.mandanten, melden: melden,
            oeffnen: function (id) { setzeOffen(id); },
            neuLaden: function () { laden("mandanten"); } })
        : reiter === "konten" ? E(Konten, { daten: daten.konten, melden: melden,
            neuLaden: function () { laden("konten"); } })
        : reiter === "katalog" ? E(Katalog, { daten: daten.katalog, melden: melden,
            neuLaden: function () { laden("katalog"); } })
        : reiter === "system" ? E(System, { daten: daten.system })
        : E(Protokoll, { daten: daten.protokoll }));
  }

  window.ImmoPlattform = ImmoPlattform;
})();
