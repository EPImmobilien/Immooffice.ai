// ============================================================================
// Postfächer verbinden — Microsoft, Google, IMAP
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Ansage des Betreibers vom 06.10.2026: „dass die Kunden mehrere Postfächer
// anbinden können, sei es jetzt Microsoft oder Gmail oder whatever".
//
// MEHRERE Postfächer konnte die Software schon — die Tabelle hängt an der
// Nutzerkennung, mit Reihenfolge und Standard. Was fehlte, war die
// ANMELDUNG: das Formular darunter fragt Server, Benutzer und Passwort, und
// genau das nehmen Microsoft 365 und Google nicht mehr an. Hier stehen
// deshalb die beiden Knöpfe, die über OAuth2 verbinden.
//
// Diese Ansicht entscheidet nichts selbst. Sie fragt die Funktion
// postfach-anbieter-start, welche Anbieter dieser Betreiber eingerichtet
// hat, und zeigt den Rest als Hinweis — ein Knopf, der zu einer nicht
// eingerichteten Anwendung führt, endet beim Anbieter in einer Fehlerseite,
// die niemand versteht.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };

  var ZEICHEN = { microsoft: "Ⓜ", google: "G", imap: "✉" };

  function PostfachAnbieter(props) {
    var R = React;
    var e = R.createElement;
    var user = props.user || {};

    var standZ = R.useState({ lade: true, anbieter: [], fehler: "" });
    var stand = standZ[0], setStand = standZ[1];
    var meineZ = R.useState([]);
    var meine = meineZ[0], setMeine = meineZ[1];
    var arbeitZ = R.useState("");
    var arbeit = arbeitZ[0], setArbeit = arbeitZ[1];
    var meldungZ = R.useState("");
    var meldung = meldungZ[0], setMeldung = meldungZ[1];

    function anbieterLaden() {
      window._sb.functions.invoke("postfach-anbieter-start", {
        body: { nur_anbieter: true },
      }).then(function (a) {
        var d = a && a.data;
        if (!d || !d.ok) {
          setStand({ lade: false, anbieter: [], fehler:
            (d && d.error) || (a && a.error && a.error.message) || "Unbekannter Fehler" });
          return;
        }
        setStand({ lade: false, anbieter: d.anbieter || [], fehler: "" });
      }, function (f) {
        setStand({ lade: false, anbieter: [], fehler: String((f && f.message) || f) });
      });
    }

    function meineLaden() {
      if (!user.id) return;
      window._sb.from("mail_postfaecher")
        .select("id,email_adresse,anbieter,oauth_fehler,oauth_verbunden_am,aktiv")
        .eq("benutzer_id", user.id)
        .then(function (a) { setMeine((a && a.data) || []); });
    }

    R.useEffect(function () { anbieterLaden(); meineLaden(); }, [user.id]);

    // Nach der Rückkehr vom Anbieter steht das Postfach in der Datenbank,
    // aber diese Ansicht weiß es nicht: der Rückruf landet in einem anderen
    // Fenster. Also beim Zurückkommen nachsehen.
    R.useEffect(function () {
      if (typeof document === "undefined" || !document.addEventListener) return;
      var sichtbar = function () { if (!document.hidden) meineLaden(); };
      document.addEventListener("visibilitychange", sichtbar);
      return function () { document.removeEventListener("visibilitychange", sichtbar); };
    }, [user.id]);

    function verbinden(name, postfachId) {
      setArbeit(name);
      setMeldung("");
      var koerper = { anbieter: name };
      if (postfachId) koerper.postfach_id = postfachId;
      if (typeof location !== "undefined") koerper.weiter_zu = String(location.href);
      window._sb.functions.invoke("postfach-anbieter-start", { body: koerper })
        .then(function (a) {
          setArbeit("");
          var d = a && a.data;
          if (!d || !d.ok || !d.url) {
            setMeldung((d && d.error) || (a && a.error && a.error.message)
              || "Die Verbindung ließ sich nicht starten.");
            return;
          }
          // Ein eigenes Fenster, nicht die laufende Anwendung: wer die
          // Anmeldung beim Anbieter abbricht, soll nicht aus dem Portal
          // geworfen sein. Blockiert der Browser das Fenster, bleibt der
          // Verweis zum Anklicken.
          var fenster = null;
          try { fenster = window.open(d.url, "_blank", "noopener,width=560,height=720"); }
          catch (f) { fenster = null; }
          if (!fenster) setMeldung("Der Browser hat das Fenster blockiert. "
            + "Bitte den Verweis in einem neuen Tab öffnen: " + d.url);
          else setMeldung("Das Fenster zur Anmeldung ist offen. Nach der "
            + "Zustimmung erscheint das Postfach hier in der Liste.");
        }, function (f) {
          setArbeit("");
          setMeldung(String((f && f.message) || f));
        });
    }

    var knopf = function (a) {
      return e("button", {
        key: a.name, type: "button",
        disabled: !a.bereit || arbeit === a.name,
        title: a.bereit ? "" : a.grund,
        "data-immo-anbieter": a.name,
        onClick: function () { verbinden(a.name, null); },
        style: {
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          fontFamily: "inherit", cursor: a.bereit ? "pointer" : "not-allowed",
          background: a.bereit ? "#fff" : "#f4f4f5",
          color: a.bereit ? CI.blau : CI.muted,
          border: "1px solid " + (a.bereit ? CI.border : "#e4e4e7"),
          opacity: arbeit === a.name ? 0.6 : 1,
        },
      }, [
        e("span", { key: "z", style: { fontSize: 15 } }, ZEICHEN[a.name] || "✉"),
        arbeit === a.name ? "wird geöffnet …" : (a.anzeige + " verbinden"),
      ]);
    };

    var kaputte = (meine || []).filter(function (p) {
      return p.anbieter && p.anbieter !== "imap" && p.oauth_fehler;
    });
    var verbundene = (meine || []).filter(function (p) {
      return p.anbieter && p.anbieter !== "imap";
    });

    return e("div", {
      style: {
        background: CI.card, border: "1px solid " + CI.border, borderRadius: 10,
        padding: "14px 16px", marginBottom: 14,
      },
    }, [
      e("div", { key: "t", style: {
        fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
        color: CI.muted, textTransform: "uppercase", marginBottom: 8,
      } }, "Postfach verbinden"),
      e("div", { key: "h", style: { fontSize: 12.5, color: CI.muted, lineHeight: 1.55, marginBottom: 10 } },
        "Du kannst beliebig viele Postfächer anbinden — jedes mit eigener "
        + "Signatur, eines davon als Standard zum Senden. Microsoft 365 und "
        + "Google werden mit deinem Konto verbunden; ein Passwort wird dabei "
        + "nicht eingegeben und nicht gespeichert. Jedes andere Postfach "
        + "(eigener Server, Hoster, Exchange mit IMAP) richtest du unten mit "
        + "Server und Passwort ein."),
      stand.lade
        ? e("div", { key: "l", style: { fontSize: 12.5, color: CI.muted } }, "lädt …")
        : e("div", { key: "k", style: { display: "flex", gap: 8, flexWrap: "wrap" } },
            (stand.anbieter || []).map(knopf)),
      stand.fehler
        ? e("div", { key: "f", style: { fontSize: 12, color: CI.danger, marginTop: 8 } },
            stand.fehler)
        : null,
      // Der eine Satz, der einem Microsoft-Kunden sonst erst beim ersten
      // gescheiterten Versand begegnet. Microsoft liefert Postfaecher mit
      // abgeschaltetem SMTP aus; der Abruf geht trotzdem, das Senden nicht.
      // Besser vorher lesen als hinterher suchen.
      (stand.anbieter || []).some(function (a) { return a.name === "microsoft" && a.bereit; })
        ? e("div", { key: "ms", style: {
            fontSize: 11.5, color: CI.muted, marginTop: 10, lineHeight: 1.55,
            borderLeft: "3px solid " + CI.border, paddingLeft: 9,
          } },
            "Microsoft 365: Das Abrufen der Mails geht sofort. Zum SENDEN muss "
            + "im Microsoft-Konto einmal „Authentifiziertes SMTP“ freigeschaltet "
            + "sein — das macht ein Administrator eures Hauses unter "
            + "admin.microsoft.com → Einstellungen → Organisationseinstellungen → "
            + "Moderne Authentifizierung, und am Postfach selbst unter "
            + "Benutzer → E-Mail-Apps verwalten. Microsoft liefert neue Konten "
            + "mit abgeschaltetem SMTP aus; das lässt sich von hier aus nicht "
            + "ändern.")
        : null,
      // Was der Betreiber noch nicht eingerichtet hat, steht als Grund da —
      // der Nutzer kann daran nichts aendern, soll aber wissen, warum der
      // Knopf grau ist.
      (stand.anbieter || []).filter(function (a) { return !a.bereit; }).length
        ? e("div", { key: "g", style: { fontSize: 11.5, color: CI.muted, marginTop: 8, lineHeight: 1.5 } },
            (stand.anbieter || []).filter(function (a) { return !a.bereit; })
              .map(function (a) { return a.anzeige + ": noch nicht freigeschaltet."; })
              .join(" "))
        : null,
      meldung
        ? e("div", { key: "m", style: {
            fontSize: 12, color: CI.ink, background: "#f4f6fa",
            border: "1px solid " + CI.border, borderRadius: 7,
            padding: "8px 10px", marginTop: 10, lineHeight: 1.5, wordBreak: "break-all",
          } }, meldung)
        : null,
      verbundene.length
        ? e("div", { key: "v", style: { marginTop: 12, fontSize: 12.5, lineHeight: 1.7 } },
            verbundene.map(function (p) {
              return e("div", { key: p.id, style: {
                display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
              } }, [
                e("span", { key: "z" }, ZEICHEN[p.anbieter] || "✉"),
                e("span", { key: "a", style: { color: CI.ink } }, p.email_adresse),
                p.oauth_fehler
                  ? e("span", { key: "f", style: { color: CI.danger, fontSize: 11.5 } },
                      "Verbindung abgelaufen")
                  : e("span", { key: "o", style: { color: CI.success, fontSize: 11.5 } },
                      "verbunden"),
                p.oauth_fehler
                  ? e("button", {
                      key: "n", type: "button",
                      onClick: function () { verbinden(p.anbieter, p.id); },
                      style: {
                        padding: "4px 9px", borderRadius: 6, fontSize: 11.5,
                        fontFamily: "inherit", cursor: "pointer", background: "#fff",
                        color: CI.blau, border: "1px solid " + CI.border,
                      },
                    }, "neu verbinden")
                  : null,
              ]);
            }))
        : null,
      kaputte.length
        ? e("div", { key: "kk", style: { fontSize: 11.5, color: CI.muted, marginTop: 6, lineHeight: 1.5 } },
            "Eine Verbindung läuft ab, wenn das Passwort des Kontos geändert "
            + "wurde oder die Zustimmung zurückgezogen ist. Der Abruf hält "
            + "dann an; die bereits geholten Mails bleiben.")
        : null,
    ]);
  }

  window.ImmoPostfachAnbieter = PostfachAnbieter;
})();
