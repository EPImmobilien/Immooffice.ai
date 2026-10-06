// ============================================================================
// Welche Exposé-Vorlage nimmt DIESES Objekt?
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Bis hierher entschied das die Software: zuerst die Vorlage am Objekt
// (expose_vorlage_id), sonst die Standardvorlage des Mandanten, sonst eine
// Systemvorlage. Wer am Objekt nichts gesetzt hatte — und das war der
// Normalfall, denn es gab keine Stelle, an der man es setzen konnte —, bekam
// immer dieselbe Vorlage. Am 06.10.2026 kam darum die Ansage: man soll
// "beim Expose erzeugen sich die Vorlage direkt auswaehlen koennen, also
// nicht dass es eine Standardvorlage gibt".
//
// Diese Ansicht ist diese Stelle. Sie steht neben dem Knopf, der das PDF
// erzeugt, und schreibt die Wahl sofort an das Objekt — nicht in ein
// Formular, das man noch speichern muss: wer eine Vorlage waehlt und dann
// auf "Erstellen" drueckt, erwartet genau diese Vorlage.
//
// Die Liste kommt aus expose_vorlagen. Was dort sichtbar ist, entscheidet
// die Datenbank (RLS, fork_37): die eigenen Vorlagen des Mandanten und die
// Systemvorlagen. Diese Ansicht filtert nichts nach Mandant — sie koennte
// es auch nicht verlaesslich, und eine Rechtepruefung im Browser waere
// keine.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };

  // Die Wahl je Objekt, damit der Knopf daneben sie lesen kann, ohne dass
  // die Anwendung dafuer einen eigenen Zustand fuehren muss. Keine
  // Zwischenspeicherung von Rechten: hier steht nur, was der Nutzer gerade
  // ausgewaehlt hat; gelten lassen muss es die Funktion.
  var wahl = {};

  var liste = null;        // zuletzt geladene Vorlagen
  var laeuft = null;       // laufende Abfrage, damit sie nicht doppelt geht

  function vorlagenLaden(frisch) {
    if (liste && !frisch) return Promise.resolve(liste);
    if (laeuft) return laeuft;
    laeuft = window._sb.from("expose_vorlagen")
      .select("id,name,beschreibung,basis,mandant_id,ist_standard,archiviert")
      .eq("archiviert", false)
      .then(function (antwort) {
        laeuft = null;
        if (antwort.error) throw antwort.error;
        var reihen = (antwort.data || []).slice();
        // Eigene Vorlagen zuerst, danach die Systemvorlagen; innerhalb der
        // Gruppe nach Namen. Die Standardvorlage bleibt in ihrer Gruppe —
        // sie ist eine Vorlage wie die anderen und steht nicht mehr
        // automatisch oben, weil sie nicht mehr automatisch genommen wird.
        reihen.sort(function (a, b) {
          var ea = a.mandant_id ? 0 : 1, eb = b.mandant_id ? 0 : 1;
          if (ea !== eb) return ea - eb;
          return String(a.name || "").localeCompare(String(b.name || ""), "de");
        });
        liste = reihen;
        return reihen;
      }, function (f) { laeuft = null; throw f; });
    return laeuft;
  }

  function Vorlagenwahl(props) {
    var R = React;
    var objektId = props.immobilieId || null;
    var vorgabe = props.vorlageId || "";

    var zustand = R.useState({ stand: "laedt", reihen: [], fehler: "" });
    var daten = zustand[0], setDaten = zustand[1];
    var gewaehltZ = R.useState(vorgabe);
    var gewaehlt = gewaehltZ[0], setGewaehlt = gewaehltZ[1];
    var hinweisZ = R.useState("");
    var hinweis = hinweisZ[0], setHinweis = hinweisZ[1];

    // Die Wahl des Objekts gilt auch ausserhalb dieser Ansicht. Sie wird
    // bei jedem Durchgang mitgeschrieben, nicht nur beim Wechsel: die
    // Ansicht kann neu entstehen, waehrend dasselbe Objekt offen bleibt.
    if (objektId) wahl[objektId] = gewaehlt || null;

    R.useEffect(function () {
      var weg = false;
      vorlagenLaden().then(function (reihen) {
        if (weg) return;
        setDaten({ stand: "da", reihen: reihen, fehler: "" });
      }, function (f) {
        if (weg) return;
        setDaten({ stand: "fehler", reihen: [], fehler: f.message || String(f) });
      });
      return function () { weg = true; };
    }, []);

    // Wechselt das Objekt, gilt dessen Vorlage — nicht die des vorigen.
    R.useEffect(function () { setGewaehlt(vorgabe); setHinweis(""); },
                [objektId, vorgabe]);

    function waehlen(id) {
      setGewaehlt(id);
      setHinweis("");
      if (!objektId) return;
      // Sofort an das Objekt schreiben. Scheitert es, bleibt die Auswahl
      // im Feld stehen und der Hinweis sagt, dass sie nicht gespeichert
      // ist — stillschweigend verschlucken waere das Schlimmere.
      window._sb.from("immobilien")
        .update({ expose_vorlage_id: id || null })
        .eq("id", objektId)
        .then(function (antwort) {
          if (antwort && antwort.error) {
            setHinweis("Nicht gespeichert: " + (antwort.error.message || "unbekannt"));
            return;
          }
          setHinweis(id ? "gespeichert" : "");
          if (props.onGewaehlt) props.onGewaehlt(id || null);
        }, function (f) {
          setHinweis("Nicht gespeichert: " + (f.message || String(f)));
        });
    }

    var e = R.createElement;
    var kasten = {
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      marginBottom: 10,
    };
    var feld = {
      padding: "7px 10px", border: "1px solid " + CI.border, borderRadius: 6,
      background: "#fff", color: CI.ink, fontSize: 12.5, minWidth: 230,
      fontFamily: "inherit",
    };

    if (daten.stand === "laedt") {
      return e("div", { style: kasten },
        e("span", { style: { fontSize: 12, color: CI.muted } }, "Vorlagen werden geladen…"));
    }
    if (daten.stand === "fehler") {
      return e("div", { style: kasten },
        e("span", { style: { fontSize: 12, color: CI.danger } },
          "Die Vorlagen konnten nicht geladen werden: " + daten.fehler));
    }

    var eigene = daten.reihen.filter(function (r) { return !!r.mandant_id; });
    var system = daten.reihen.filter(function (r) { return !r.mandant_id; });
    var option = function (r) {
      return e("option", { key: r.id, value: r.id },
        r.name + (r.ist_standard ? " (Standard des Hauses)" : ""));
    };

    return e("div", { style: kasten }, [
      e("label", {
        key: "l", htmlFor: "immo-expose-vorlagenwahl",
        style: { fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
                 color: CI.muted },
      }, "Vorlage"),
      e("select", {
        key: "s", id: "immo-expose-vorlagenwahl", value: gewaehlt, style: feld,
        "data-immo-vorlagenwahl": "1",
        onChange: function (ev) { waehlen(ev.target.value); },
      }, [
        e("option", { key: "leer", value: "" }, "— bitte wählen —"),
        eigene.length
          ? e("optgroup", { key: "eigene", label: "Eigene Vorlagen" }, eigene.map(option))
          : null,
        system.length
          ? e("optgroup", { key: "system", label: "Systemvorlagen" }, system.map(option))
          : null,
      ]),
      hinweis
        ? e("span", {
            key: "h",
            style: {
              fontSize: 11.5,
              color: hinweis === "gespeichert" ? CI.success : CI.danger,
            },
          }, hinweis === "gespeichert" ? "✓ am Objekt gespeichert" : hinweis)
        : null,
      !gewaehlt
        ? e("span", { key: "o", style: { fontSize: 11.5, color: CI.muted } },
            "Ohne Auswahl wird kein Exposé erzeugt.")
        : null,
    ]);
  }

  Vorlagenwahl.gewaehlt = function (objektId) {
    return (objektId && wahl[objektId]) || null;
  };
  // Nach dem Anlegen oder Kopieren einer Vorlage im Editor ist die Liste
  // veraltet. Der Editor ruft das auf; ohne wuerde eine frisch angelegte
  // Vorlage am Objekt erst nach dem Neuladen auftauchen.
  Vorlagenwahl.neuLaden = function () { liste = null; return vorlagenLaden(true); };

  window.ImmoExposeVorlagenwahl = Vorlagenwahl;
})();
