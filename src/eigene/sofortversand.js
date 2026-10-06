// ============================================================================
// Exposé-Sofortversand — die Einstellungen dazu
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Ansage des Betreibers vom 06.10.2026: „wir müssen auf jeden Fall den
// Exposé-Sofortversand reinnehmen … für diesen Sofortversand muss eine
// E-Mail-Adresse hinterlegt sein."
//
// Deshalb steht diese Tafel direkt UNTER den E-Mail-Postfächern: die
// Absenderadresse ist die Bedingung, und wer sie hier nicht findet, hat sie
// eine Zeile höher noch nicht eingerichtet.
//
// Die Tafel entscheidet nichts. Der Schalter liegt in
// portal_einstellungen, und ob tatsächlich etwas hinausgeht, prüft die
// Edge Function expose-sofortversand — Exposé vorhanden, Adresse bekannt,
// nicht schon gesendet, Tageslimit nicht erreicht. Jeder dieser Fälle
// steht mit Grund im Protokoll, und das Protokoll steht hier unten.
//
// Schreiben darf nur die Chef-Rolle. Das ist NICHT diese Datei, sondern die
// Richtlinie portal_einstellungen_chef in der Datenbank — hier wird nur
// nicht angezeigt, was ohnehin abgewiesen würde.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };
  var SCHLUESSEL = "expose_sofortversand";

  var VORGABE = {
    aktiv: false,
    absender_regel: "zustaendig",
    postfach_id: null,
    sperrfrist_stunden: 24,
    max_pro_tag: 200,
    gueltig_tage: 0,
    betreff: "Ihre Anfrage zu {objekt}",
    text: [
      "Guten Tag {anrede},",
      "",
      "vielen Dank für Ihr Interesse an {objekt}.",
      "",
      "Über den folgenden Link erhalten Sie das Exposé und die freigegebenen",
      "Unterlagen — jederzeit abrufbar:",
      "",
      "{link}",
      "",
      "Für Rückfragen stehen wir Ihnen gerne zur Verfügung.",
    ].join("\n"),
  };

  var PLATZHALTER = [
    ["{objekt}", "Nummer und Titel des Objekts"],
    ["{anrede}", "Name des Interessenten, sonst „Damen und Herren“"],
    ["{link}", "der persönliche Exposé-Link"],
    ["{ort}", "Postleitzahl und Ort des Objekts"],
  ];

  function feld(beschriftung, kind, hinweis) {
    return React.createElement("label", {
      style: { display: "block", marginBottom: 14 },
    },
      React.createElement("span", {
        style: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 },
      }, beschriftung),
      kind,
      hinweis ? React.createElement("span", {
        style: { display: "block", fontSize: 12, color: CI.muted, marginTop: 4 },
      }, hinweis) : null);
  }

  function ImmoSofortversand(eigenschaften) {
    var nutzer = eigenschaften && eigenschaften.user;
    var istChef = nutzer && nutzer.role === "chef";

    var zustand = React.useState(VORGABE);
    var cfg = zustand[0], setzeCfg = zustand[1];
    var pfZustand = React.useState([]);
    var postfaecher = pfZustand[0], setzePostfaecher = pfZustand[1];
    var protZustand = React.useState([]);
    var protokoll = protZustand[0], setzeProtokoll = protZustand[1];
    var ladenZustand = React.useState(true);
    var laedt = ladenZustand[0], setzeLaedt = ladenZustand[1];
    var meldungZustand = React.useState(null);
    var meldung = meldungZustand[0], setzeMeldung = meldungZustand[1];
    var offenZustand = React.useState(false);
    var textOffen = offenZustand[0], setzeTextOffen = offenZustand[1];

    React.useEffect(function () {
      var abgebrochen = false;
      (async function () {
        try {
          var e = await window._sb.from("portal_einstellungen")
            .select("wert").eq("schluessel", SCHLUESSEL).maybeSingle();
          var pf = await window._sb.from("mail_postfaecher")
            .select("id, email_adresse, absender_name, aktiv")
            .order("reihenfolge", { ascending: true });
          var pr = await window._sb.from("expose_sofortversand")
            .select("id, email, status, grund, created_at, immobilie_id")
            .order("created_at", { ascending: false }).limit(10);
          if (abgebrochen) return;
          if (e.data && e.data.wert && typeof e.data.wert === "object") {
            setzeCfg(Object.assign({}, VORGABE, e.data.wert));
          }
          setzePostfaecher((pf.data || []).filter(function (p) { return p.aktiv; }));
          setzeProtokoll(pr.data || []);
        } catch (f) {
          if (!abgebrochen) setzeMeldung({ art: "fehler", text: String(f.message || f) });
        } finally {
          if (!abgebrochen) setzeLaedt(false);
        }
      })();
      return function () { abgebrochen = true; };
    }, []);

    function aendern(name, wert) {
      setzeCfg(function (alt) {
        var neu = {};
        for (var k in alt) if (Object.prototype.hasOwnProperty.call(alt, k)) neu[k] = alt[k];
        neu[name] = wert;
        return neu;
      });
      setzeMeldung(null);
    }

    async function sichern() {
      setzeMeldung(null);
      // Einschalten ohne Absenderadresse geht nicht. Das ist keine
      // Schikane: die Funktion würde jeden Versand überspringen und das
      // Protokoll mit demselben Grund füllen. Lieber hier sagen.
      if (cfg.aktiv && !cfg.postfach_id && !postfaecher.length) {
        setzeMeldung({
          art: "fehler",
          text: "Ohne aktives E-Mail-Postfach kann nichts versendet werden. "
              + "Bitte eine Zeile höher ein Postfach verbinden.",
        });
        return;
      }
      try {
        var erg = await window._sb.from("portal_einstellungen").upsert({
          mandant_id: window.IMMO_MANDANT_ID || null,
          schluessel: SCHLUESSEL,
          wert: cfg,
          updated_at: new Date().toISOString(),
        }, { onConflict: "mandant_id,schluessel" });
        if (erg.error) throw erg.error;
        setzeMeldung({ art: "ok", text: "Gespeichert." });
      } catch (f) {
        setzeMeldung({ art: "fehler", text: String(f.message || f) });
      }
    }

    if (!istChef) return null;

    var kasten = {
      background: CI.card, border: "1px solid " + CI.border, borderRadius: 10,
      padding: 18, marginTop: 16, boxShadow: CI.shadow,
    };
    var eingabe = {
      width: "100%", padding: "8px 10px", border: "1px solid " + CI.border,
      borderRadius: 6, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
    };

    return React.createElement("div", { style: kasten },
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
      },
        React.createElement("span", { style: { fontSize: 20 } }, "⚡"),
        React.createElement("h3", {
          style: { margin: 0, fontSize: 17, color: CI.blau },
        }, "Exposé-Sofortversand")),
      React.createElement("p", {
        style: { color: CI.muted, fontSize: 13.5, margin: "6px 0 16px", lineHeight: 1.6 },
      }, "Kommt eine Portal- oder Website-Anfrage herein, wird sie ausgewertet, "
       + "der Kontakt zugeordnet und das Exposé sofort über Ihr Postfach "
       + "verschickt — als persönlicher Link, der rund um die Uhr abrufbar "
       + "ist. Ohne hinterlegte Absenderadresse geht nichts hinaus."),

      laedt ? React.createElement("div", { style: { color: CI.muted } }, "Wird geladen …") :
      React.createElement("div", null,
        React.createElement("label", {
          style: {
            display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
            padding: "10px 12px", borderRadius: 8,
            background: cfg.aktiv ? "rgba(30,126,52,.07)" : CI.bg,
            border: "1px solid " + (cfg.aktiv ? "rgba(30,126,52,.3)" : CI.border),
          },
        },
          React.createElement("input", {
            type: "checkbox", checked: !!cfg.aktiv,
            onChange: function (e) { aendern("aktiv", e.target.checked); },
          }),
          React.createElement("span", { style: { fontWeight: 600 } },
            cfg.aktiv ? "Eingeschaltet" : "Ausgeschaltet"),
          React.createElement("span", { style: { color: CI.muted, fontSize: 13 } },
            cfg.aktiv ? "Anfragen werden sofort beantwortet."
                      : "Es wird nichts automatisch versendet.")),

        !postfaecher.length ? React.createElement("div", {
          style: {
            padding: "10px 12px", borderRadius: 8, marginBottom: 16, fontSize: 13.5,
            background: "rgba(192,57,43,.07)", border: "1px solid rgba(192,57,43,.3)",
            color: CI.danger,
          },
        }, "Kein aktives E-Mail-Postfach. Der Sofortversand braucht eine "
         + "Absenderadresse — eine Zeile höher einzurichten.") : null,

        feld("Wer sendet?",
          React.createElement("select", {
            style: eingabe, value: cfg.absender_regel || "zustaendig",
            onChange: function (e) { aendern("absender_regel", e.target.value); },
          },
            React.createElement("option", { value: "zustaendig" },
              "Wer das Objekt betreut (empfohlen)"),
            React.createElement("option", { value: "fest" },
              "Immer dasselbe Postfach")),
          "Der Interessent antwortet auf diese Mail. Kommt sie aus dem "
          + "Sammelpostfach, muss die Antwort von Hand weitergereicht werden — "
          + "kommt sie von der Person, die das Objekt betreut, ist der Faden "
          + "geknüpft. Hat sie kein eigenes Postfach, greift das des Hauses."),

        feld(cfg.absender_regel === "fest" ? "Postfach" : "Postfach des Hauses (Rückfall)",
          React.createElement("select", {
            style: eingabe, value: cfg.postfach_id || "",
            onChange: function (e) { aendern("postfach_id", e.target.value || null); },
          },
            React.createElement("option", { value: "" }, "Standard-Postfach des Hauses"),
            postfaecher.map(function (p) {
              return React.createElement("option", { key: p.id, value: p.id },
                p.email_adresse + (p.absender_name ? " (" + p.absender_name + ")" : ""));
            })),
          "Jedes Postfach wird je Person verbunden — eine Zeile höher."),

        React.createElement("div", {
          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
        },
          feld("Sperrfrist",
            React.createElement("input", {
              type: "number", min: 1, max: 720, style: eingabe,
              value: cfg.sperrfrist_stunden,
              onChange: function (e) { aendern("sperrfrist_stunden", Number(e.target.value) || 24); },
            }),
            "Stunden. Dieselbe Adresse bekommt zum selben Objekt in dieser Zeit "
            + "nur eine Mail — Portale stellen Anfragen schon mal doppelt zu."),
          feld("Höchstens am Tag",
            React.createElement("input", {
              type: "number", min: 1, max: 5000, style: eingabe,
              value: cfg.max_pro_tag,
              onChange: function (e) { aendern("max_pro_tag", Number(e.target.value) || 200); },
            }),
            "Notbremse. Ohne sie könnte eine Schleife Ihr Postfach leerschießen.")),

        React.createElement("button", {
          type: "button",
          onClick: function () { setzeTextOffen(!textOffen); },
          style: {
            background: "none", border: "none", color: CI.blau, cursor: "pointer",
            padding: 0, fontSize: 13.5, fontWeight: 600, marginBottom: 12,
            fontFamily: "inherit",
          },
        }, (textOffen ? "▾ " : "▸ ") + "Betreff und Text der Mail"),

        textOffen ? React.createElement("div", {
          style: { padding: 14, background: CI.bg, borderRadius: 8, marginBottom: 14 },
        },
          feld("Betreff",
            React.createElement("input", {
              type: "text", style: eingabe, value: cfg.betreff,
              onChange: function (e) { aendern("betreff", e.target.value); },
            })),
          feld("Text",
            React.createElement("textarea", {
              rows: 10, style: Object.assign({}, eingabe, { resize: "vertical" }),
              value: cfg.text,
              onChange: function (e) { aendern("text", e.target.value); },
            })),
          React.createElement("div", { style: { fontSize: 12.5, color: CI.muted } },
            React.createElement("strong", null, "Platzhalter: "),
            PLATZHALTER.map(function (p, i) {
              return React.createElement("span", { key: p[0] },
                i ? " · " : "",
                React.createElement("code", {
                  style: { background: CI.card, padding: "1px 5px", borderRadius: 4 },
                }, p[0]),
                " " + p[1]);
            })),
          React.createElement("p", {
            style: { fontSize: 12.5, color: CI.muted, marginTop: 10, marginBottom: 0, lineHeight: 1.6 },
          }, "Der Provisionshinweis steht nicht in diesem Text, sondern auf der "
           + "Bestätigungsseite am Link — dort muss er hin, damit er den "
           + "Empfänger in Textform erreicht, bevor er das Exposé sieht.")) : null,

        React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 12, marginTop: 6 },
        },
          React.createElement("button", {
            type: "button", onClick: sichern,
            style: {
              background: CI.blau, color: "#fff", border: "none", borderRadius: 6,
              padding: "9px 18px", fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14,
            },
          }, "Speichern"),
          meldung ? React.createElement("span", {
            style: {
              fontSize: 13.5,
              color: meldung.art === "ok" ? CI.success : CI.danger,
            },
          }, meldung.text) : null),

        protokoll.length ? React.createElement("div", { style: { marginTop: 22 } },
          React.createElement("h4", {
            style: { fontSize: 14, margin: "0 0 8px", color: CI.blau },
          }, "Zuletzt"),
          React.createElement("div", { style: { fontSize: 13 } },
            protokoll.map(function (z) {
              var farbe = z.status === "gesendet" ? CI.success
                        : z.status === "fehler" ? CI.danger : CI.muted;
              return React.createElement("div", {
                key: z.id,
                style: {
                  display: "flex", gap: 10, padding: "6px 0",
                  borderBottom: "1px solid " + CI.border,
                },
              },
                React.createElement("span", {
                  style: { color: CI.muted, whiteSpace: "nowrap", minWidth: 120 },
                }, new Date(z.created_at).toLocaleString("de-DE")),
                React.createElement("span", { style: { flex: 1 } }, z.email),
                React.createElement("span", { style: { color: farbe, fontWeight: 600 } },
                  z.status),
                z.grund ? React.createElement("span", {
                  style: { color: CI.muted, flex: 2 },
                }, z.grund) : null);
            })),
          React.createElement("p", {
            style: { fontSize: 12.5, color: CI.muted, marginTop: 8, marginBottom: 0 },
          }, "Auch jeder Fall, in dem NICHTS hinausging, steht hier — mit Grund. "
           + "Ein stiller Nicht-Versand wäre sonst von einem Fehler nicht zu "
           + "unterscheiden.")) : null));
  }

  window.ImmoSofortversand = ImmoSofortversand;
})();
