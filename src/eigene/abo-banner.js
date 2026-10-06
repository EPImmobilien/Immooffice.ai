// ============================================================================
// Das Band über der Anwendung: Testphase, Zahlung, Sperre, knappe Credits
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_53), Handarbeit, klassische Laufzeit.
//
// Es gibt genau vier Lagen, in denen jemand etwas erfahren MUSS, bevor er
// sie merkt, indem etwas nicht mehr geht:
//
//   1. Die Testphase läuft aus. Sieben Tage vorher wird es sichtbar.
//   2. Eine Zahlung ist offen. Die Frist läuft, und danach ist Schluss.
//   3. Der Zugang ist auf Lesen beschränkt oder gesperrt.
//   4. Die Credits gehen zur Neige (unter dem im Katalog gesetzten Anteil).
//
// Darunter: nichts. Ein Band, das immer da ist, liest niemand mehr — und
// dann auch nicht an dem Tag, an dem es zählt.
//
// Das Band ENTSCHEIDET NICHTS. Es zeigt, was `abo-verwalten` geantwortet
// hat. Wer es wegklickt, klickt die Anzeige weg, nicht die Lage; bei einer
// Sperre lässt es sich gar nicht wegklicken.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", card: "#FFFFFF", border: "#E6E8EB",
    muted: "#7A828C", danger: "#c0392b", success: "#1e7e34",
  };
  var E = React.createElement;
  var SPEICHER = "immo_abo_band_zu";

  function tageBis(w) {
    if (!w) return null;
    var d = Math.ceil((new Date(w).getTime() - Date.now()) / 86400000);
    return isFinite(d) ? d : null;
  }
  function datum(w) {
    try { return new Date(w).toLocaleDateString("de-DE"); } catch (e) { return String(w); }
  }

  /** Welche Lage gilt — und nur die dringendste wird gezeigt. */
  function lage(stand) {
    if (!stand) return null;
    var a = stand.abo || null;
    if (stand.zugriff === "gesperrt") {
      return { art: "sperre", schliessbar: false, ton: "rot",
        text: "Der Zugang ist gesperrt. Bitte wählen Sie einen Tarif oder "
          + "prüfen Sie Ihre Zahlung.", knopf: "Zu Abo & Abrechnung" };
    }
    if (stand.zugriff === "nur_lesen") {
      return { art: "lesen", schliessbar: false, ton: "rot",
        text: "Nur noch Lesezugriff: Ihre Daten bleiben erhalten, aber es "
          + "lässt sich nichts Neues mit der KI erzeugen.",
        knopf: "Tarif wählen" };
    }
    if (a && a.status === "zahlung_offen") {
      return { art: "zahlung", schliessbar: false, ton: "gelb",
        text: "Eine Zahlung ist offen. Bitte das Zahlungsmittel prüfen — "
          + "sonst wird der Zugang nach Ablauf der Frist eingeschränkt.",
        knopf: "Zahlungsmittel prüfen" };
    }
    var rest = a && a.status === "test" ? tageBis(stand.testphase_bis) : null;
    if (rest !== null && rest <= 7) {
      return { art: "test" + rest, schliessbar: rest > 2, ton: rest <= 2 ? "gelb" : "blau",
        text: rest <= 0
          ? "Die Testphase endet heute."
          : "Die Testphase endet in " + rest + " " + (rest === 1 ? "Tag" : "Tagen")
            + " (am " + datum(stand.testphase_bis) + "). Es wird nichts "
            + "automatisch abgebucht.",
        knopf: "Tarif wählen" };
    }
    if (stand.credits_knapp) {
      return { art: "credits", schliessbar: true, ton: "gelb",
        text: "Nur noch " + Number(stand.saldo || 0).toLocaleString("de-DE")
          + " Credits. Danach lässt sich nichts Neues mit der KI erzeugen.",
        knopf: "Credits nachkaufen" };
    }
    return null;
  }

  // --- Supportzugriff: das Band, das nicht fehlen darf ---------------------
  // Wer vergisst, dass er gerade in den Daten eines Kunden steht, haelt sie
  // fuer seine eigenen — und aendert dort etwas, was er in seinem eigenen
  // Haus aendern wollte. Deshalb steht es ueber jeder Seite, in der Farbe,
  // die auffaellt, und es laesst sich nicht wegklicken.
  function ImmoSupportBand() {
    var sZ = React.useState(null), sitzung = sZ[0], setzeSitzung = sZ[1];
    React.useEffect(function () {
      if (!window.IMMO_PLATTFORM_ADMIN || !window._sb) return;
      var weg = false;
      function fragen() {
        window._sb.functions.invoke("plattform-admin", { body: { aktion: "support_stand" } })
          .then(function (a) {
            if (weg || !a || !a.data || a.data.ok === false) return;
            setzeSitzung(a.data.sitzung || null);
          })
          .catch(function () { /* ohne Band laeuft der Rest weiter */ });
      }
      fragen();
      // Eine Sitzung laeuft von selbst ab. Das Band muss dann verschwinden,
      // sonst behauptet es etwas, das nicht mehr gilt.
      var uhr = setInterval(fragen, 60000);
      return function () { weg = true; clearInterval(uhr); };
    }, []);
    if (!sitzung) return null;
    return E("div", { "data-support-band": "1", style: {
      background: "#6b2f2f", color: "#fff", fontSize: 13.5,
      padding: "9px 16px", display: "flex", gap: 12, alignItems: "center",
      flexWrap: "wrap", justifyContent: "center",
    } },
      E("strong", null, "Supportzugriff"),
      E("span", null, "Sie sehen gerade die Daten von "
        + (sitzung.mandant_name || "einem anderen Haus")
        + " \u2014 " + (sitzung.schreiben ? "lesen und ändern" : "nur lesen")
        + ". Grund: " + sitzung.grund));
  }

  function ImmoAboBanner(p) {
    var sZ = React.useState(null), stand = sZ[0], setzeStand = sZ[1];
    var zZ = React.useState(""), zu = zZ[0], setzeZu = zZ[1];

    var laden = React.useCallback(function () {
      if (!window._sb || !window.IMMO_MANDANT_ID) return;
      window._sb.functions.invoke("abo-verwalten", { body: { aktion: "stand" } })
        .then(function (a) {
          if (!a || !a.data || a.data.ok === false) return;
          // `credits_knapp` rechnet die Funktion, nicht diese Datei: der
          // Anteil steht im Katalog (warnung_rest_prozent) und wird gegen
          // das Monatskontingent des Tarifs gerechnet — und den Tarif
          // bekommt ein Mitarbeiter mit Absicht nicht zu sehen.
          setzeStand(a.data);
        })
        .catch(function () { /* ohne Band ist die Anwendung nicht kaputt */ });
    }, []);

    React.useEffect(function () {
      laden();
      try { setzeZu(window.localStorage.getItem(SPEICHER) || ""); } catch (e) { /* egal */ }
      // Wenn ein KI-Aufruf an fehlenden Credits oder am Abo scheitert,
      // meldet das die Hülle um functions.invoke. Dann lohnt ein neuer Blick.
      function horchen() { laden(); }
      window.addEventListener("immo-credits", horchen);
      return function () { window.removeEventListener("immo-credits", horchen); };
    }, [laden]);

    var l = lage(stand);
    if (!l) return null;
    if (l.schliessbar && zu === l.art) return null;

    var farben = l.ton === "rot"
      ? { hg: "#fdf2f2", linie: "#e8c4c0", text: CI.danger }
      : l.ton === "gelb"
        ? { hg: "#fff7e6", linie: "#f0dcb0", text: "#6b4e13" }
        : { hg: "#f3f6fb", linie: "#d7e0ef", text: CI.blau };

    return E("div", { "data-abo-band": l.art, style: {
      background: farben.hg, borderBottom: "1px solid " + farben.linie,
      color: farben.text, fontSize: 13.5, padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      justifyContent: "center",
    } },
      E("span", null, l.text),
      p && p.onNavigate
        ? E("button", { type: "button",
            onClick: function () { p.onNavigate("einstellungen"); },
            style: {
              background: "transparent", border: "1px solid " + farben.linie,
              color: farben.text, padding: "5px 12px", fontSize: 12.5,
              fontWeight: 600, borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
            } }, l.knopf)
        : null,
      l.schliessbar
        ? E("button", { type: "button", aria: "Hinweis schliessen",
            onClick: function () {
              setzeZu(l.art);
              try { window.localStorage.setItem(SPEICHER, l.art); } catch (e) { /* egal */ }
            },
            style: {
              background: "transparent", border: 0, color: farben.text,
              fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "0 4px",
              opacity: 0.6,
            } }, "×")
        : null);
  }

  window.ImmoAboBanner = ImmoAboBanner;
  window.ImmoSupportBand = ImmoSupportBand;
})();
