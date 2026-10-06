// ============================================================================
// Schreibstil aus den eigenen Mails — Einwilligung, Lernen, Widerruf
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Ansage des Betreibers vom 06.10.2026: „dass wir die letzten 20, 30
// versendeten Mails analysieren, um den spezifischen Schreibstil
// rauszufinden — das aber wirklich nur unter der Prämisse, dass die Kunden
// dem zustimmen."
//
// Diese Tafel ist die Stelle, an der zugestimmt wird. Drei Dinge sind
// deshalb keine Gestaltungsfrage:
//
//   * Der Einwilligungstext steht VOLLSTÄNDIG da, bevor der Knopf kommt.
//     Nicht hinter „Details anzeigen", nicht als Link. Wer einwilligt, muss
//     gelesen haben können, worin.
//   * Der Text kommt von der Funktion, nicht aus dieser Datei. Gespeichert
//     wird genau der Wortlaut, dem zugestimmt wurde — zwei Fassungen, eine
//     angezeigt und eine gespeichert, wären schlimmer als keine.
//   * Der Widerruf steht gleich daneben, nicht drei Klicks weiter. Art. 7
//     Abs. 3 DSGVO: der Widerruf muss so einfach sein wie die Erteilung.
//
// Die rechtliche Würdigung steht in docs/DATENSCHUTZ-STILANALYSE.md. Sie
// ersetzt keine Rechtsberatung, und ob die Verarbeitung im Einzelfall
// zulässig ist, entscheidet der Mandant.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };

  async function rufen(aktion) {
    var antwort = await window._sb.functions.invoke("mail-stil-lernen", {
      body: { aktion: aktion },
    });
    if (antwort.error) throw antwort.error;
    if (antwort.data && antwort.data.ok === false) {
      throw new Error(antwort.data.fehler || "Unbekannter Fehler");
    }
    return antwort.data || {};
  }

  function ImmoMailStil() {
    var standZustand = React.useState(null);
    var stand = standZustand[0], setzeStand = standZustand[1];
    var ladenZustand = React.useState(true);
    var laedt = ladenZustand[0], setzeLaedt = ladenZustand[1];
    var arbeitZustand = React.useState(null);
    var arbeit = arbeitZustand[0], setzeArbeit = arbeitZustand[1];
    var meldungZustand = React.useState(null);
    var meldung = meldungZustand[0], setzeMeldung = meldungZustand[1];
    var profilZustand = React.useState(null);
    var profil = profilZustand[0], setzeProfil = profilZustand[1];

    React.useEffect(function () {
      var weg = false;
      rufen("stand").then(function (d) { if (!weg) { setzeStand(d); setzeLaedt(false); } })
        .catch(function (f) {
          if (!weg) { setzeMeldung({ art: "fehler", text: String(f.message || f) }); setzeLaedt(false); }
        });
      return function () { weg = true; };
    }, []);

    async function tun(aktion, arbeitstext) {
      setzeMeldung(null);
      setzeArbeit(arbeitstext);
      try {
        var d = await rufen(aktion);
        if (aktion === "lernen" && d.profil_text) setzeProfil(d.profil_text);
        if (aktion === "widerrufen") setzeProfil(null);
        setzeStand(await rufen("stand"));
        setzeMeldung({
          art: "ok",
          text: aktion === "lernen"
            ? "Fertig — " + d.mails_ausgewertet + " eigene Mails ausgewertet."
            : aktion === "widerrufen" ? "Widerrufen. Das Profil ist gelöscht."
            : "Einwilligung gespeichert.",
        });
      } catch (f) {
        setzeMeldung({ art: "fehler", text: String(f.message || f) });
      } finally {
        setzeArbeit(null);
      }
    }

    var kasten = {
      background: CI.card, border: "1px solid " + CI.border, borderRadius: 10,
      padding: 18, marginTop: 16, boxShadow: CI.shadow,
    };
    var knopf = function (farbe) {
      return {
        background: farbe, color: "#fff", border: "none", borderRadius: 6,
        padding: "9px 18px", fontWeight: 600, cursor: arbeit ? "wait" : "pointer",
        fontFamily: "inherit", fontSize: 14, opacity: arbeit ? 0.6 : 1,
      };
    };

    var eingewilligt = stand && stand.eingewilligt;
    var zuWenige = stand && stand.mails_verfuegbar < stand.mindestens;

    return React.createElement("div", { style: kasten },
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
      },
        React.createElement("span", { style: { fontSize: 20 } }, "✍️"),
        React.createElement("h3", { style: { margin: 0, fontSize: 17, color: CI.blau } },
          "Ihr Schreibstil für KI-Antworten")),
      React.createElement("p", {
        style: { color: CI.muted, fontSize: 13.5, margin: "6px 0 14px", lineHeight: 1.6 },
      }, "Die KI-Antwortentwürfe können in Ihrem eigenen Ton schreiben statt in "
       + "einem allgemeinen. Dafür werden Ihre letzten bis zu 30 selbst "
       + "versendeten Mails ausgewertet — geschwärzt, und nur mit Ihrer "
       + "Einwilligung."),

      laedt ? React.createElement("div", { style: { color: CI.muted } }, "Wird geladen …") :
      React.createElement("div", null,
        eingewilligt ? React.createElement("div", {
          style: {
            padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13.5,
            background: "rgba(30,126,52,.07)", border: "1px solid rgba(30,126,52,.3)",
          },
        },
          React.createElement("strong", null, "Eingewilligt"),
          stand.eingewilligt_am
            ? " am " + new Date(stand.eingewilligt_am).toLocaleDateString("de-DE") : "",
          stand.gelernt_am
            ? React.createElement("div", { style: { marginTop: 4, color: CI.muted } },
                "Stil gelernt am " + new Date(stand.gelernt_am).toLocaleDateString("de-DE")
                + " aus " + stand.mails_ausgewertet + " Mails.")
            : React.createElement("div", { style: { marginTop: 4, color: CI.muted } },
                "Noch nichts gelernt.")) : null,

        // Der Einwilligungstext steht vollstaendig da. Nicht eingeklappt.
        !eingewilligt ? React.createElement("pre", {
          style: {
            whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5,
            lineHeight: 1.65, background: CI.bg, padding: 14, borderRadius: 8,
            border: "1px solid " + CI.border, margin: "0 0 14px", color: CI.ink,
          },
        }, (stand && stand.einwilligung_text) || "") : null,

        zuWenige ? React.createElement("div", {
          style: { fontSize: 13, color: CI.muted, marginBottom: 12 },
        }, "Derzeit sind " + stand.mails_verfuegbar + " eigene Mails vorhanden; "
         + "für ein brauchbares Profil braucht es mindestens " + stand.mindestens
         + ".") : null,

        React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
        },
          !eingewilligt ? React.createElement("button", {
            type: "button", disabled: !!arbeit,
            onClick: function () { tun("einwilligen", "…"); },
            style: knopf(CI.blau),
          }, "Einwilligen") : null,
          eingewilligt ? React.createElement("button", {
            type: "button", disabled: !!arbeit || zuWenige,
            onClick: function () { tun("lernen", "Mails werden ausgewertet …"); },
            style: Object.assign({}, knopf(CI.gold), zuWenige ? { opacity: 0.5, cursor: "not-allowed" } : {}),
          }, stand.gelernt_am ? "Neu lernen" : "Stil jetzt lernen") : null,
          eingewilligt ? React.createElement("button", {
            type: "button", disabled: !!arbeit,
            onClick: function () { tun("widerrufen", "…"); },
            style: {
              background: "none", border: "1px solid " + CI.border, borderRadius: 6,
              padding: "9px 18px", fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14, color: CI.danger,
            },
          }, "Einwilligung widerrufen") : null,
          arbeit ? React.createElement("span", {
            style: { fontSize: 13.5, color: CI.muted },
          }, arbeit) : null,
          meldung ? React.createElement("span", {
            style: {
              fontSize: 13.5,
              color: meldung.art === "ok" ? CI.success : CI.danger,
            },
          }, meldung.text) : null),

        profil ? React.createElement("details", { style: { marginTop: 16 } },
          React.createElement("summary", {
            style: { cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: CI.blau },
          }, "Was dabei herausgekommen ist"),
          React.createElement("pre", {
            style: {
              whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13,
              lineHeight: 1.6, background: CI.bg, padding: 14, borderRadius: 8,
              border: "1px solid " + CI.border, marginTop: 10, color: CI.ink,
            },
          }, profil)) : null,

        React.createElement("p", {
          style: { fontSize: 12.5, color: CI.muted, marginTop: 16, marginBottom: 0, lineHeight: 1.6 },
        }, "Ausgewertet werden ausschließlich Mails, die Sie selbst versendet "
         + "haben. Namen, Anschriften, Rufnummern, Beträge und Datumsangaben "
         + "werden vorher unkenntlich gemacht; gespeichert wird nur das "
         + "Stilprofil, nicht die Mails. Arbeitgeber mit Angestellten sollten "
         + "vorher prüfen lassen, ob eine Einwilligung hier der richtige Weg "
         + "ist — im Arbeitsverhältnis gelten eigene Regeln.")));
  }

  window.ImmoMailStil = ImmoMailStil;
})();
