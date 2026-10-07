// ============================================================================
// Abo & Abrechnung — was gilt, was es kostet, was noch da ist
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_51), Handarbeit, klassische Laufzeit
// (CLAUDE.md). Steht als Reiter in den Einstellungen und damit hinter der
// Chef-Schranke der Seite.
//
// Drei Dinge sind hier keine Gestaltungsfrage:
//
//   * Diese Tafel ENTSCHEIDET NICHTS. Sie zeigt, was `abo-verwalten`
//     geantwortet hat, und schickt zu Stripe. Der Abo-Stand kommt aus der
//     Datenbank, und dorthin schreibt ihn ausschliesslich der Webhook —
//     CLAUDE.md: „Abo-Status niemals allein dem Frontend glauben."
//   * Preise stehen nicht in dieser Datei. Sie kommen aus demselben
//     Katalog, aus dem auch die Rechnung entsteht.
//   * Vor einer Kündigung steht das DATUM, auf das sie fällt — gerechnet
//     vom Server, nicht hier. Wer sechs Monate Mindestlaufzeit hat, soll
//     das sehen, bevor er klickt, und nicht danach.
//
// Was hier bewusst FEHLT: ein Weg, den eigenen Tarif, den Saldo oder die
// Laufzeit zu ändern. Beides geht nur über Stripe und den Webhook. Ein
// Formular, das es anders könnte, wäre eine Lücke, kein Komfort.
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
  function zahl(n) { return Number(n || 0).toLocaleString("de-DE"); }
  function datum(w) {
    if (!w) return "—";
    try { return new Date(w).toLocaleDateString("de-DE",
      { day: "2-digit", month: "long", year: "numeric" }); }
    catch (e) { return String(w); }
  }
  function tageBis(w) {
    if (!w) return null;
    var d = Math.ceil((new Date(w).getTime() - Date.now()) / 86400000);
    return isFinite(d) ? d : null;
  }

  async function abo(aktion, mehr) {
    var a = await window._sb.functions.invoke("abo-verwalten",
      { body: Object.assign({ aktion: aktion }, mehr || {}) });
    if (a.error) throw a.error;
    if (a.data && a.data.ok === false) throw new Error(a.data.fehler || "Unbekannter Fehler");
    return a.data || {};
  }
  async function kasse(koerper) {
    var a = await window._sb.functions.invoke("abo-checkout", { body: koerper });
    if (a.error) throw a.error;
    if (a.data && a.data.ok === false) throw new Error(a.data.fehler || "Unbekannter Fehler");
    if (!a.data || !a.data.url) throw new Error("Die Kasse hat keine Adresse geliefert.");
    // Gleiches Fenster: ein neuer Tab wird auf dem Telefon oft geblockt,
    // und Stripe bringt den Kunden selbst zurueck.
    window.location.href = a.data.url;
  }

  // --- Bausteine ----------------------------------------------------------
  function Kasten(eigenschaften) {
    return E("div", { style: {
      background: CI.card, border: "1px solid " + CI.border, borderRadius: 10,
      padding: 18, marginBottom: 16, boxShadow: CI.shadow,
    } }, eigenschaften.children);
  }
  function Ueberschrift(text) {
    return E("div", { style: {
      fontSize: 11, fontWeight: 700, color: CI.gold, letterSpacing: "0.08em",
      textTransform: "uppercase", marginBottom: 12,
    } }, text);
  }
  function Zeile(name, wert, fett) {
    return E("div", { style: {
      display: "flex", justifyContent: "space-between", gap: 16,
      padding: "7px 0", borderBottom: "1px solid " + CI.border, fontSize: 13.5,
    } },
      E("span", { style: { color: CI.muted } }, name),
      E("span", { style: { color: CI.blau, fontWeight: fett ? 700 : 500, textAlign: "right" } }, wert));
  }
  var knopf = {
    background: CI.blau, color: "#fff", border: "1px solid " + CI.blau,
    padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", borderRadius: 7,
  };
  var knopfLeer = Object.assign({}, knopf, { background: "#fff", color: CI.blau, borderColor: CI.border });
  var knopfWarn = Object.assign({}, knopfLeer, { color: CI.danger, borderColor: "#e8c4c0" });

  // --- Die Tafel ----------------------------------------------------------
  function ImmoAbrechnung() {
    var sZ = React.useState(null), stand = sZ[0], setzeStand = sZ[1];
    var kZ = React.useState(null), katalog = kZ[0], setzeKatalog = kZ[1];
    var lZ = React.useState(true), laedt = lZ[0], setzeLaedt = lZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];
    var mZ = React.useState(""), meldung = mZ[0], setzeMeldung = mZ[1];
    var aZ = React.useState(""), arbeit = aZ[0], setzeArbeit = aZ[1];
    var tZ = React.useState("monat"), takt = tZ[0], setzeTakt = tZ[1];

    var laden = React.useCallback(async function () {
      setzeFehler("");
      try { setzeStand(await abo("stand")); }
      catch (f) { setzeFehler("Der Abrechnungsstand liess sich nicht laden: " + (f.message || f)); }
      setzeLaedt(false);
    }, []);

    React.useEffect(function () {
      laden();
      // Der Katalog kommt aus der oeffentlichen Funktion — dieselbe, die
      // auch die Website liest. Zwei Quellen fuer einen Preis waeren eine
      // zu viel.
      window._sb.functions.invoke("tarife-oeffentlich", { method: "GET" })
        .then(function (a) { if (a && a.data && a.data.ok) setzeKatalog(a.data); })
        .catch(function () { /* ohne Katalog bleibt der Stand lesbar */ });
      // Nach der Rueckkehr von Stripe steht der neue Stand oft erst ein
      // paar Sekunden spaeter in der Datenbank: der Webhook laeuft
      // nebenher. Deshalb einmal nachfassen.
      var p = new URLSearchParams(window.location.search || "");
      if (p.get("abo") === "ok") {
        setzeMeldung("Danke. Der Vorgang wird gerade verbucht — das dauert "
          + "einen Augenblick.");
        var uhr = setTimeout(laden, 4000);
        return function () { clearTimeout(uhr); };
      }
    }, [laden]);

    async function tun(name, fn, erfolg) {
      setzeArbeit(name); setzeFehler(""); setzeMeldung("");
      try {
        await fn();
        if (erfolg) setzeMeldung(erfolg);
        await laden();
      } catch (f) { setzeFehler(f.message || String(f)); }
      setzeArbeit("");
    }

    if (laedt) return E("div", { style: { padding: 20, color: CI.muted } }, "Lade Abrechnung …");

    var a = (stand && stand.abo) || null;
    var zugriff = (stand && stand.zugriff) || "gesperrt";
    var saldo = (stand && stand.saldo) || 0;
    var nutzer = (stand && stand.nutzer) || { ist: 0, limit: 0 };
    var konten = (stand && stand.konten) || [];
    var testTage = tageBis(stand && stand.testphase_bis);

    // --- Der Zustand in einem Satz ---------------------------------------
    var band = null;
    if (zugriff === "gesperrt") {
      band = { farbe: CI.danger, hg: "#fdf2f2",
        text: "Der Zugang ist gesperrt. Bitte wählen Sie einen Tarif oder "
          + "prüfen Sie Ihre Zahlung." };
    } else if (zugriff === "nur_lesen") {
      band = { farbe: CI.gold, hg: "#fff7e6",
        text: "Nur noch Lesezugriff. Ihre Daten bleiben erhalten; neue "
          + "KI-Erzeugung ist nicht mehr möglich." };
    } else if (a && a.status === "zahlung_offen") {
      band = { farbe: CI.gold, hg: "#fff7e6",
        text: "Eine Zahlung ist offen. Bitte das Zahlungsmittel im "
          + "Kundenportal prüfen — bis dahin arbeiten Sie normal weiter." };
    } else if (a && a.status === "test" && testTage !== null) {
      band = { farbe: testTage <= 7 ? CI.gold : CI.blau, hg: testTage <= 7 ? "#fff7e6" : "#f3f6fb",
        text: testTage > 0
          ? "Testphase: noch " + testTage + " Tag" + (testTage === 1 ? "" : "e")
            + " bis zum " + datum(stand.testphase_bis) + "."
          : "Die Testphase ist abgelaufen." };
    } else if (a && a.cancel_at) {
      band = { farbe: CI.gold, hg: "#fff7e6",
        text: "Gekündigt zum " + datum(a.cancel_at) + ". Bis dahin ändert "
          + "sich nichts." };
    }

    // --- Credits ----------------------------------------------------------
    var creditTeil = E(Kasten, null, [
      Ueberschrift("Credits"),
      E("div", { key: "saldo", style: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 } },
        E("span", { style: { fontSize: 34, fontWeight: 700, color: saldo > 0 ? CI.blau : CI.danger } }, zahl(saldo)),
        E("span", { style: { color: CI.muted, fontSize: 13 } }, "verfügbar")),
      konten.length
        ? E("div", { key: "toepfe" }, konten.map(function (k, i) {
            return E("div", { key: i, style: {
              display: "flex", justifyContent: "space-between", fontSize: 12.5,
              color: CI.muted, padding: "4px 0",
            } },
              E("span", null, k.quelle === "tarif" ? "aus dem Tarif"
                : k.quelle === "test" ? "aus der Testphase" : "gekauft"),
              E("span", null, zahl(k.rest) + (k.gueltig_bis
                ? " · gültig bis " + datum(k.gueltig_bis) : "")));
          }))
        : E("div", { key: "leer", style: { fontSize: 12.5, color: CI.muted } },
            "Keine Credits vorhanden."),
      E("p", { key: "was", style: { fontSize: 12.5, color: CI.muted, lineHeight: 1.6, marginTop: 12 } },
        "Ein Credit ist eine interne Nutzungseinheit, kein Euro-Guthaben. "
        + "Verbraucht wird er, wenn die KI etwas erzeugt. PDF-Export, "
        + "Web-Exposé ohne neue KI und erneute Downloads kosten nichts. "
        + "Bricht ein Auftrag ab, kommen die Credits von selbst zurück."),
      katalog && katalog.credit_pakete && katalog.credit_pakete.length
        ? E("div", { key: "pakete", style: { marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" } },
            katalog.credit_pakete.map(function (p) {
              return E("button", { key: p.schluessel, type: "button",
                disabled: !!arbeit,
                onClick: function () { tun("paket:" + p.schluessel, function () {
                  return kasse({ paket: p.schluessel }); }); },
                style: knopfLeer },
                zahl(p.credits) + " Credits · " + geld(p.preis_cent));
            }))
        : null,
      katalog
        ? E("div", { key: "netto", style: { fontSize: 11.5, color: CI.muted, marginTop: 8 } },
            "Nettopreise zzgl. " + zahl(katalog.ust_prozent) + " % USt. "
            + "Gekaufte Credits sind 12 Monate gültig und werden nach den "
            + "Inklusiv-Credits verbraucht, die ältesten zuerst.")
        : null,
    ]);

    // --- Kein Abo: die Tarifwahl ------------------------------------------
    function Tarifwahl() {
      if (!katalog || !katalog.tarife) {
        return E(Kasten, null, [
          Ueberschrift("Tarif wählen"),
          E("div", { key: "x", style: { fontSize: 13, color: CI.muted } },
            "Die Tarife liessen sich gerade nicht laden. Bitte später erneut "
            + "versuchen."),
        ]);
      }
      return E(Kasten, null, [
        Ueberschrift(a && a.tarif ? "Tarif wechseln" : "Tarif wählen"),
        E("div", { key: "takt", style: { display: "inline-flex", gap: 4, padding: 4,
          border: "1px solid " + CI.border, borderRadius: 8, marginBottom: 14 } },
          [["monat", "Monatlich"], ["jahr", "Jährlich"]].map(function (t) {
            return E("button", { key: t[0], type: "button",
              onClick: function () { setzeTakt(t[0]); },
              style: Object.assign({}, knopfLeer, {
                background: takt === t[0] ? CI.blau : "#fff",
                color: takt === t[0] ? "#fff" : CI.muted,
                borderColor: takt === t[0] ? CI.blau : "transparent",
              }) }, t[1]);
          })),
        E("div", { key: "karten", style: { display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" } },
          katalog.tarife.map(function (t) {
            var cent = takt === "jahr" ? t.preis_jahr_cent : t.preis_monat_cent;
            // Läuft schon ein Abo, wird gewechselt statt neu gekauft — eine
            // zweite Kasse hiesse zweimal bezahlen. Höher gilt sofort,
            // niedriger zum Periodenende; das entscheidet der Server.
            var laeuft = !!(a && a.laeuft);
            var ist = a && a.tarif === t.schluessel && a.status !== "test"
              && (!laeuft || (a.intervall || "monat") === takt);
            return E("div", { key: t.schluessel, style: {
              border: "1px solid " + (t.empfohlen ? CI.gold : CI.border),
              borderRadius: 9, padding: 14,
            } },
              E("div", { style: { fontWeight: 700, color: CI.blau, fontSize: 15 } }, t.name),
              E("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 8 } }, t.hinweis || ""),
              E("div", { style: { fontSize: 22, fontWeight: 700, color: CI.blau } },
                geld(cent),
                E("span", { style: { fontSize: 12, fontWeight: 400, color: CI.muted } },
                  takt === "jahr" ? " / Jahr" : " / Monat")),
              E("div", { style: { fontSize: 12, color: CI.muted, margin: "6px 0 12px" } },
                zahl(t.inkl_nutzer) + " Nutzer · " + zahl(t.credits_monat) + " Credits/Monat"),
              E("button", { type: "button", disabled: ist || !!arbeit,
                onClick: function () {
                  if (!laeuft) {
                    tun("tarif:" + t.schluessel, function () {
                      return kasse({ tarif: t.schluessel, intervall: takt }); });
                    return;
                  }
                  if (!window.confirm("Zu " + t.name + " (" + (takt === "jahr" ? "jährlich" : "monatlich")
                    + ") wechseln?\n\nEin höherer Tarif gilt sofort und wird anteilig "
                    + "abgerechnet. Ein niedrigerer gilt ab dem Ende der laufenden Periode.")) return;
                  tun("tarif:" + t.schluessel, async function () {
                    var r = await abo("tarif_wechseln", { tarif: t.schluessel, intervall: takt });
                    setzeMeldung(r.wirksam === "sofort"
                      ? "Gewechselt zu " + t.name + ". Die Differenz wird anteilig abgerechnet."
                      : "Wechsel zu " + t.name + " vorgemerkt ab " + datum(r.wirksam_ab) + ".");
                  });
                },
                style: Object.assign({}, ist ? knopfLeer : knopf,
                  { width: "100%", opacity: ist ? 0.6 : 1, cursor: ist ? "default" : "pointer" }) },
                ist ? "Ihr Tarif" : (arbeit === "tarif:" + t.schluessel
                  ? (laeuft ? "Wechselt …" : "Öffnet Kasse …")
                  : (laeuft ? "Wechseln" : "Wählen"))));
          })),
        E("div", { key: "fuss", style: { fontSize: 11.5, color: CI.muted, marginTop: 12, lineHeight: 1.6 } },
          "Nettopreise zzgl. " + zahl(katalog.ust_prozent) + " % USt. · "
          + "Mindestlaufzeit " + zahl(katalog.mindestlaufzeit_monate) + " Monate. "
          + "Bezahlt wird bei Stripe; immoOffice.ai speichert keine Kartendaten."),
      ]);
    }

    // --- Laufender Vertrag -------------------------------------------------
    function Vertrag() {
      var endet = a.cancel_at;
      return E(Kasten, null, [
        Ueberschrift("Ihr Abo"),
        Zeile("Tarif", (a.tarif_name || a.tarif || "—")
          + (a.gruenderpreis ? " (Gründerpreis)" : ""), true),
        Zeile("Abrechnung", a.intervall === "jahr" ? "jährlich" : "monatlich"),
        Zeile("Status", a.status === "aktiv" ? "aktiv"
          : a.status === "test" ? "Testphase"
          : a.status === "gekuendigt" ? "gekündigt"
          : a.status === "zahlung_offen" ? "Zahlung offen" : a.status),
        Zeile("Nutzer", zahl(nutzer.ist) + " von " + zahl(nutzer.limit)
          + (a.zusatznutzer ? " (davon " + zahl(a.zusatznutzer) + " zugebucht)" : "")),
        a.periode_bis ? Zeile("Laufende Periode bis", datum(a.periode_bis)) : null,
        a.mindestlaufzeit_bis ? Zeile("Mindestlaufzeit bis", datum(a.mindestlaufzeit_bis)) : null,
        endet ? Zeile("Endet am", datum(endet), true) : null,
        E("div", { key: "knoepfe", style: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 } },
          a.hat_zahlungsmittel
            ? E("button", { type: "button", disabled: !!arbeit,
                onClick: function () { tun("portal", async function () {
                  var r = await abo("portal");
                  if (r.url) window.location.href = r.url;
                }); }, style: knopfLeer },
                arbeit === "portal" ? "Öffnet …" : "Zahlungsmittel & Rechnungen")
            : null,
          endet
            ? E("button", { type: "button", disabled: !!arbeit,
                onClick: function () {
                  if (!window.confirm("Die Kündigung zurücknehmen? Das Abo "
                    + "läuft dann wie bisher weiter.")) return;
                  tun("widerrufen", function () { return abo("widerrufen"); },
                    "Die Kündigung wurde zurückgenommen.");
                }, style: knopfLeer },
                "Kündigung zurücknehmen")
            : a.status === "aktiv"
              ? E("button", { type: "button", disabled: !!arbeit,
                  onClick: function () {
                    // Das Datum rechnet der Server; hier wird nur gefragt.
                    // Eine zweite Rechnung in der Oberflaeche koennte ein
                    // anderes Ergebnis zeigen als die, die gilt.
                    if (!window.confirm("Das Abo kündigen?\n\nDer genaue "
                      + "Endtermin wird gleich angezeigt — es gilt der "
                      + "spätere von Periodenende und Mindestlaufzeit. Bis "
                      + "dahin ändert sich nichts.")) return;
                    tun("kuendigen", async function () {
                      var r = await abo("kuendigen");
                      setzeMeldung("Gekündigt zum " + datum(r.endet_am)
                        + " (" + (r.grund || "") + "). Bis dahin ändert sich nichts.");
                    });
                  }, style: knopfWarn },
                  arbeit === "kuendigen" ? "Kündigt …" : "Abo kündigen")
              : null),
      ]);
    }

    // --- Zusatznutzer -------------------------------------------------------
    function Zusatznutzer() {
      var addon = katalog && katalog.zusatznutzer;
      var preis = addon && (a.intervall === "jahr" ? addon.preis_jahr_cent : addon.preis_monat_cent);
      return E(Kasten, null, [
        Ueberschrift("Weitere Nutzer"),
        E("div", { key: "t", style: { fontSize: 13.5, color: CI.blau, marginBottom: 6 } },
          zahl(nutzer.ist) + " von " + zahl(nutzer.limit) + " Plätzen belegt."),
        E("div", { key: "p", style: { fontSize: 12.5, color: CI.muted, lineHeight: 1.6, marginBottom: 12 } },
          preis
            ? "Jeder weitere Nutzer kostet " + geld(preis)
              + (a.intervall === "jahr" ? " im Jahr" : " im Monat")
              + " netto. Änderungen werden anteilig abgerechnet."
            : "Weitere Nutzer sind zubuchbar. Änderungen werden anteilig abgerechnet."),
        E("div", { key: "k", style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          E("button", { type: "button", disabled: !!arbeit,
            onClick: function () {
              tun("zusatz+", function () {
                return abo("zusatznutzer", { anzahl: Number(a.zusatznutzer || 0) + 1 });
              }, "Ein weiterer Platz wurde gebucht.");
            }, style: knopf }, "Einen Platz dazubuchen"),
          Number(a.zusatznutzer || 0) > 0
            ? E("button", { type: "button", disabled: !!arbeit,
                onClick: function () {
                  tun("zusatz-", function () {
                    return abo("zusatznutzer", { anzahl: Number(a.zusatznutzer || 0) - 1 });
                  }, "Ein Platz wurde abgegeben.");
                }, style: knopfLeer }, "Einen Platz abgeben")
            : null),
      ]);
    }

    return E("div", null,
      band ? E("div", { style: {
        background: band.hg, borderLeft: "3px solid " + band.farbe,
        padding: "12px 16px", marginBottom: 16, fontSize: 13.5, color: CI.blau,
        borderRadius: "0 8px 8px 0",
      } }, band.text) : null,
      fehler ? E("div", { style: {
        background: "#fdf2f2", border: "1px solid #e8c4c0", color: CI.danger,
        padding: "10px 14px", marginBottom: 16, fontSize: 13, borderRadius: 8,
      } }, fehler) : null,
      meldung ? E("div", { style: {
        background: "#e9f6ec", border: "1px solid #bfe3c8", color: CI.success,
        padding: "10px 14px", marginBottom: 16, fontSize: 13, borderRadius: 8,
      } }, meldung) : null,

      creditTeil,
      a && a.status !== "test" && a.tarif ? E(Vertrag, null) : null,
      // Plaetze dazubuchen geht nur im laufenden Stripe-Abo. In der
      // Testphase gibt es noch keines, und ein Knopf, der dann scheitert,
      // waere schlechter als keiner.
      a && a.status !== "test" && a.tarif && a.hat_zahlungsmittel
        ? E(Zusatznutzer, null) : null,
      // Tarifwahl: ohne Abo zum Abschliessen, mit laufendem Abo zum Wechseln.
      // Ist es gekündigt, erst die Kündigung zurücknehmen — sonst entstünde
      // neben dem auslaufenden ein zweites Abo.
      !a || !a.laeuft || !a.cancel_at ? E(Tarifwahl, null) : null,

      E("div", { style: { fontSize: 11.5, color: CI.muted, lineHeight: 1.7, marginTop: 8 } },
        "Alle Beträge sind Nettopreise zzgl. Umsatzsteuer. Rechnungen und "
        + "Zahlungsmittel liegen bei unserem Zahlungsdienstleister; "
        + "Kartendaten werden hier nicht gespeichert. Der hier gezeigte Stand "
        + "kommt aus der Datenbank und wird vom Zahlungsdienstleister "
        + "gemeldet — nicht aus dieser Ansicht."));
  }

  window.ImmoAbrechnung = ImmoAbrechnung;
})();
