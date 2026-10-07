// ============================================================================
// CSV-Import: Kontakte ins Adressbuch, Objekte in den Bestand
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_81), Handarbeit, klassische Laufzeit.
//
// Der Weg ist in drei Schritten, und keiner wird übersprungen:
//
//   1. Datei lesen — Trennzeichen (; , Tab) wird erkannt, Anführungszeichen
//      nach RFC 4180, UTF-8 mit oder ohne BOM.
//   2. Spalten zuordnen — die Kopfzeile wird gegen bekannte Namen gelegt
//      („E-Mail", „Mail", „email"), der Nutzer sieht und ändert die
//      Zuordnung. Was er nicht zuordnet, wird nicht importiert.
//   3. Vorschau und Prüfung — jede Zeile wird gegen die Pflichtfelder der
//      Tabelle geprüft (Kontakt: Nachname oder Firma; Objekt: Vertragsart),
//      Dubletten (E-Mail bzw. Objekt-Nr./Anschrift) werden gezeigt und
//      übersprungen. Erst dann wird geschrieben, in Blöcken, mit Bericht.
//
// Die Mandantenzuordnung macht die Datenbank (Vorgabewert mandant_id,
// RLS). Der Import schreibt mit dem Konto des Angemeldeten, nie mit einem
// Dienstschlüssel — was er nicht anlegen dürfte, legt auch der Import nicht
// an. Keine KI, keine Ratespiele: eine Zahl, die sich nicht lesen lässt,
// bleibt leer und steht im Bericht.
// ============================================================================
(function () {
  "use strict";

  var CI = (typeof window !== "undefined" && window.IMMO_CI) || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", muted: "#7A828C", danger: "#c0392b", success: "#1e7e34",
  };
  var E = typeof React !== "undefined" ? React.createElement : null;

  // --- CSV lesen ---------------------------------------------------------------
  function trennzeichen(text) {
    var kopf = text.split(/\r?\n/)[0] || "";
    var z = { ";": 0, ",": 0, "\t": 0 };
    var inAnf = false;
    for (var i = 0; i < kopf.length; i++) {
      var c = kopf[i];
      if (c === '"') inAnf = !inAnf;
      else if (!inAnf && z[c] !== undefined) z[c]++;
    }
    return z["\t"] > z[";"] && z["\t"] > z[","] ? "\t" : z[","] > z[";"] ? "," : ";";
  }
  function csvLesen(text, trenner) {
    if (text.charCodeAt(0) === 65279) text = text.slice(1);
    trenner = trenner || trennzeichen(text);
    var zeilen = [], zeile = [], feld = "", inAnf = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inAnf) {
        if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inAnf = false; }
        else feld += c;
      } else if (c === '"') inAnf = true;
      else if (c === trenner) { zeile.push(feld); feld = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        zeile.push(feld); feld = "";
        if (zeile.some(function (f) { return f.trim() !== ""; })) zeilen.push(zeile);
        zeile = [];
      } else feld += c;
    }
    zeile.push(feld);
    if (zeile.some(function (f) { return f.trim() !== ""; })) zeilen.push(zeile);
    if (!zeilen.length) return { kopf: [], zeilen: [], trenner: trenner };
    var kopf = zeilen[0].map(function (k) { return k.trim(); });
    return { kopf: kopf, zeilen: zeilen.slice(1), trenner: trenner };
  }

  // --- Werte lesen ---------------------------------------------------------------
  function leer(w) { return w === null || w === undefined || String(w).trim() === ""; }
  function text(w) { return leer(w) ? null : String(w).trim(); }
  function zahl(w) {
    if (leer(w)) return null;
    var s = String(w).replace(/[€\s]/g, "").replace(/m²|qm|m2/i, "");
    // 1.234,56 (deutsch) · 249.000 (deutsch, Tausenderpunkte) · 1,234.56 (englisch) · 1234.56 · 1234,56
    if (/,\d{1,2}$/.test(s) || (s.indexOf(",") >= 0 && s.indexOf(".") < 0)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else s = s.replace(/,/g, "");
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function ganz(w) { var n = zahl(w); return n === null ? null : isNaN(n) ? NaN : Math.round(n); }
  function jaNein(w) {
    if (leer(w)) return null;
    var s = String(w).trim().toLowerCase();
    if (["ja", "j", "true", "1", "x", "yes", "wahr"].indexOf(s) >= 0) return true;
    if (["nein", "n", "false", "0", "no", "falsch", "-"].indexOf(s) >= 0) return false;
    return NaN;
  }
  function vertragsart(w) {
    if (leer(w)) return null;
    var s = String(w).trim().toLowerCase();
    if (/kauf|verkauf|sale/.test(s) && /miet|rent/.test(s)) return "beides";
    if (/beides|both/.test(s)) return "beides";
    if (/kauf|verkauf|sale/.test(s)) return "verkauf";
    if (/miet|rent|vermiet/.test(s)) return "vermietung";
    return NaN;
  }
  var STATUS = ["akquise", "vorbereitung", "vermarktung", "reserviert", "verkauft", "vermietet", "archiviert"];
  function status(w) {
    if (leer(w)) return null;
    var s = String(w).trim().toLowerCase();
    if (STATUS.indexOf(s) >= 0) return s;
    if (/aktiv|vermarkt|angebot|online/.test(s)) return "vermarktung";
    if (/reserv/.test(s)) return "reserviert";
    if (/verkauft|sold/.test(s)) return "verkauft";
    if (/vermietet/.test(s)) return "vermietet";
    if (/archiv|inaktiv/.test(s)) return "archiviert";
    if (/akqui/.test(s)) return "akquise";
    if (/vorbereit/.test(s)) return "vorbereitung";
    return NaN;
  }
  function rollen(w) {
    if (leer(w)) return null;
    var bekannt = (typeof KONTAKT_ROLLEN !== "undefined" && Array.isArray(KONTAKT_ROLLEN)) ? KONTAKT_ROLLEN : [];
    var r = [];
    String(w).split(/[;,|/]/).forEach(function (t) {
      var s = t.trim().toLowerCase();
      if (!s) return;
      var treffer = bekannt.filter(function (k) { return k.id === s || String(k.label || "").toLowerCase() === s; })[0];
      if (treffer) { r.push(treffer.id); return; }
      var ascii = s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z_]/g, "");
      var t2 = bekannt.filter(function (k) { return k.id === ascii; })[0];
      r.push(t2 ? t2.id : "sonstiges");
    });
    return r.length ? Array.from(new Set(r)) : null;
  }
  function anrede(w) {
    if (leer(w)) return null;
    var s = String(w).trim().toLowerCase();
    if (/^(herr|hr|mr|m)\.?$/.test(s)) return "Herr";
    if (/^(frau|fr|mrs|ms|w|f)\.?$/.test(s)) return "Frau";
    if (/^(firma|fa|company)\.?$/.test(s)) return "Firma";
    return String(w).trim();
  }

  // --- Zielfelder je Art ----------------------------------------------------------
  // [Feld, Anzeige, Leser, Synonyme fuer die automatische Zuordnung]
  var FELDER = {
    kontakte: [
      ["anrede", "Anrede", anrede, ["anrede", "salutation", "title"]],
      ["titel", "Titel", text, ["titel", "akad. titel", "akademischer titel"]],
      ["vorname", "Vorname", text, ["vorname", "first name", "firstname", "given name"]],
      ["nachname", "Nachname", text, ["nachname", "name", "last name", "lastname", "surname", "familienname"]],
      ["firma", "Firma", text, ["firma", "unternehmen", "company", "organisation", "organization"]],
      ["rollen", "Rolle(n)", rollen, ["rolle", "rollen", "typ", "kategorie", "art", "role"]],
      ["email", "E-Mail", text, ["e-mail", "email", "mail", "e-mail-adresse", "emailadresse"]],
      ["telefon", "Telefon", text, ["telefon", "tel", "tel.", "phone", "festnetz", "telefonnummer"]],
      ["mobil", "Mobil", text, ["mobil", "handy", "mobile", "mobiltelefon", "cell"]],
      ["strasse", "Straße (mit Hausnummer)", text, ["straße", "strasse", "street", "adresse", "anschrift"]],
      ["plz", "PLZ", text, ["plz", "postleitzahl", "zip", "postal code"]],
      ["ort", "Ort", text, ["ort", "stadt", "city", "wohnort"]],
      ["land", "Land", text, ["land", "country"]],
      ["beruf", "Beruf", text, ["beruf", "position", "job", "tätigkeit"]],
      ["notiz", "Notiz", text, ["notiz", "notizen", "bemerkung", "bemerkungen", "kommentar", "notes"]],
    ],
    immobilien: [
      ["immo_nr", "Objekt-Nr.", text, ["objekt-nr.", "objekt-nr", "objektnr", "objektnummer", "immo_nr", "nr", "id", "kennung"]],
      ["bezeichnung", "Bezeichnung (intern)", text, ["bezeichnung", "objekt", "objektbezeichnung", "name"]],
      ["objekttitel", "Titel (Exposé)", text, ["titel", "objekttitel", "überschrift", "headline"]],
      ["vertragsart", "Vertragsart (Verkauf/Vermietung)", vertragsart, ["vertragsart", "vermarktungsart", "art", "kauf/miete", "angebotsart"]],
      ["objektart", "Objektart", text, ["objektart", "objekttyp", "typ", "immobilienart", "kategorie"]],
      ["status", "Status", status, ["status", "stand", "phase"]],
      ["strasse", "Straße", text, ["straße", "strasse", "street"]],
      ["hausnummer", "Hausnummer", text, ["hausnummer", "hausnr", "hausnr.", "nr."]],
      ["plz", "PLZ", text, ["plz", "postleitzahl", "zip"]],
      ["ort", "Ort", text, ["ort", "stadt", "city"]],
      ["ortsteil", "Ortsteil", text, ["ortsteil", "stadtteil", "lage"]],
      ["wohnflaeche", "Wohnfläche (m²)", zahl, ["wohnfläche", "wohnflaeche", "wfl", "wohnfl.", "fläche", "living area"]],
      ["nutzflaeche", "Nutzfläche (m²)", zahl, ["nutzfläche", "nutzflaeche", "nfl"]],
      ["grundstueck", "Grundstück (m²)", zahl, ["grundstück", "grundstueck", "grundstücksfläche", "grdst", "plot"]],
      ["zimmer", "Zimmer", zahl, ["zimmer", "zimmeranzahl", "räume", "rooms"]],
      ["schlafzimmer", "Schlafzimmer", zahl, ["schlafzimmer", "bedrooms"]],
      ["badezimmer", "Badezimmer", zahl, ["badezimmer", "bäder", "bathrooms"]],
      ["baujahr", "Baujahr", ganz, ["baujahr", "bj", "year built"]],
      ["etage", "Etage", text, ["etage", "geschoss", "stockwerk", "floor"]],
      ["angebotspreis", "Angebotspreis (€)", zahl, ["angebotspreis", "kaufpreis", "preis", "price"]],
      ["kaltmiete", "Kaltmiete (€)", zahl, ["kaltmiete", "miete", "nettokaltmiete", "rent"]],
      ["nebenkosten", "Nebenkosten (€)", zahl, ["nebenkosten", "nk"]],
      ["heizkosten", "Heizkosten (€)", zahl, ["heizkosten"]],
      ["hausgeld", "Hausgeld (€)", zahl, ["hausgeld"]],
      ["kaution", "Kaution", text, ["kaution", "deposit"]],
      ["provision_aussen", "Provision (außen)", text, ["provision", "käuferprovision", "courtage", "provision außen"]],
      ["verfuegbar_ab", "Verfügbar ab", text, ["verfügbar ab", "verfuegbar_ab", "bezugsfrei ab", "frei ab"]],
      ["energie_klasse", "Energieklasse", text, ["energieklasse", "energieeffizienzklasse", "effizienzklasse"]],
      ["energie_kennwert", "Energiekennwert", zahl, ["energiekennwert", "endenergiebedarf", "endenergieverbrauch", "kennwert"]],
      ["heizungsart", "Heizungsart", text, ["heizung", "heizungsart", "heizungstyp"]],
      ["zustand", "Zustand", text, ["zustand", "objektzustand"]],
      ["vermietet", "Vermietet (ja/nein)", jaNein, ["vermietet", "vermietet?"]],
      ["beschreibung_objekt", "Objektbeschreibung", text, ["objektbeschreibung", "beschreibung", "description"]],
      ["beschreibung_lage", "Lagebeschreibung", text, ["lagebeschreibung", "lage (text)"]],
      ["beschreibung_ausstattung", "Ausstattung", text, ["ausstattung", "ausstattungsbeschreibung"]],
      ["notizen", "Notizen (intern)", text, ["notizen", "notiz", "bemerkung", "interne notiz"]],
    ],
  };

  function norm(s) { return String(s || "").toLowerCase().replace(/[\s_\-\.]+/g, " ").trim(); }
  function zuordnen(art, kopf) {
    var belegt = {};
    var z = {};
    FELDER[art].forEach(function (f) {
      var syn = f[3].map(norm);
      for (var i = 0; i < kopf.length; i++) {
        if (belegt[i]) continue;
        var k = norm(kopf[i]);
        if (k === norm(f[0]) || syn.indexOf(k) >= 0) { z[f[0]] = i; belegt[i] = true; return; }
      }
    });
    // zweite Runde: Teiltreffer (z. B. "E-Mail (geschäftlich)")
    FELDER[art].forEach(function (f) {
      if (z[f[0]] !== undefined) return;
      var syn = f[3].map(norm).filter(function (s) { return s.length >= 4; });
      for (var i = 0; i < kopf.length; i++) {
        if (belegt[i]) continue;
        var k = norm(kopf[i]);
        if (syn.some(function (s) { return k.indexOf(s) === 0 || k.indexOf(" " + s) >= 0; })) { z[f[0]] = i; belegt[i] = true; return; }
      }
    });
    return z;
  }

  // Zeile -> Datensatz + Fehlerliste. `standard` liefert Werte fuer fehlende
  // Spalten (z. B. Vertragsart aus der Auswahl).
  function zeileLesen(art, felder, zuordnung, zeile, standard) {
    var satz = {}, fehler = [];
    felder.forEach(function (f) {
      var idx = zuordnung[f[0]];
      if (idx === undefined) return;
      var roh = zeile[idx];
      var w = f[2](roh);
      if (typeof w === "number" && isNaN(w)) { fehler.push(f[1] + ": „" + String(roh).trim() + "“ nicht lesbar"); return; }
      if (w !== null) satz[f[0]] = w;
    });
    Object.keys(standard || {}).forEach(function (k) { if (satz[k] === undefined && standard[k] !== null && standard[k] !== undefined && standard[k] !== "") satz[k] = standard[k]; });
    if (art === "kontakte") {
      if (!satz.nachname && !satz.firma) fehler.push("weder Nachname noch Firma");
      if (!satz.rollen) satz.rollen = ["sonstiges"];
      if (satz.firma && !satz.nachname) satz.personen_typ = "firma";
      satz.quelle = "csv-import";
    } else {
      if (!satz.vertragsart) fehler.push("Vertragsart fehlt (Verkauf/Vermietung)");
      if (!satz.bezeichnung) {
        var teile = [satz.strasse, satz.hausnummer].filter(Boolean).join(" ");
        satz.bezeichnung = [teile, satz.ort].filter(Boolean).join(", ") || satz.objekttitel || satz.immo_nr || null;
        if (!satz.bezeichnung) fehler.push("keine Bezeichnung, Anschrift oder Objekt-Nr.");
      }
      if (!satz.status) satz.status = "vorbereitung";
      satz.quelle = "csv-import";
    }
    return { satz: satz, fehler: fehler };
  }

  // Dubletten-Schluessel
  function schluessel(art, s) {
    if (art === "kontakte") return s.email ? "mail:" + String(s.email).toLowerCase() : null;
    if (s.immo_nr) return "nr:" + String(s.immo_nr).toLowerCase();
    var a = [s.strasse, s.hausnummer, s.plz].filter(Boolean).map(function (x) { return String(x).toLowerCase().replace(/\s+/g, " ").trim(); }).join("|");
    return a && s.strasse ? "adr:" + a : null;
  }

  // Fuer Tests ohne Browser.
  var API = { csvLesen: csvLesen, zuordnen: zuordnen, zeileLesen: zeileLesen, schluessel: schluessel, zahl: zahl, vertragsart: vertragsart, FELDER: FELDER };

  // --- Die Oberflaeche ----------------------------------------------------------
  var feld = { width: "100%", padding: "7px 9px", border: "1px solid " + CI.border, borderRadius: 7, fontSize: 13, boxSizing: "border-box" };
  var knopf = { background: CI.blau, color: "#fff", border: "1px solid " + CI.blau, borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  var knopfLeer = Object.assign({}, knopf, { background: "#fff", color: CI.blau, borderColor: CI.border });

  function ImmoCsvImport(p) {
    var art = p.art === "immobilien" ? "immobilien" : "kontakte";
    var felder = FELDER[art];
    var dZ = React.useState(null), datei = dZ[0], setzeDatei = dZ[1];
    var zZ = React.useState({}), zuordnung = zZ[0], setzeZuordnung = zZ[1];
    var sZ = React.useState({ vertragsart: "verkauf", status: "vorbereitung" }), standard = sZ[0], setzeStandard = sZ[1];
    var dubZ = React.useState(true), dublettenAus = dubZ[0], setzeDublettenAus = dubZ[1];
    var vZ = React.useState(null), vorhanden = vZ[0], setzeVorhanden = vZ[1];
    var lZ = React.useState(false), laeuft = lZ[0], setzeLaeuft = lZ[1];
    var bZ = React.useState(null), bericht = bZ[0], setzeBericht = bZ[1];
    var fZ = React.useState(""), fehler = fZ[0], setzeFehler = fZ[1];

    // Bestehende Schluessel laden (Dubletten)
    React.useEffect(function () {
      if (!window._sb) return;
      var weg = false;
      (art === "kontakte"
        ? window._sb.from("kontakte").select("email").not("email", "is", null)
        : window._sb.from("immobilien").select("immo_nr, strasse, hausnummer, plz"))
        .then(function (r) {
          if (weg || r.error) return;
          var m = {};
          (r.data || []).forEach(function (x) {
            var k = schluessel(art, art === "kontakte" ? { email: x.email } : x);
            if (k) m[k] = true;
            if (art === "immobilien") { var k2 = schluessel(art, { strasse: x.strasse, hausnummer: x.hausnummer, plz: x.plz }); if (k2) m[k2] = true; }
          });
          setzeVorhanden(m);
        });
      return function () { weg = true; };
    }, [art]);

    function dateiWaehlen(ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      setzeFehler(""); setzeBericht(null);
      var leser = new FileReader();
      leser.onload = function () {
        try {
          var text = String(leser.result || "");
          var g = csvLesen(text);
          if (!g.kopf.length) throw new Error("Die Datei ist leer oder hat keine Kopfzeile.");
          if (g.zeilen.length > 5000) throw new Error("Höchstens 5.000 Zeilen je Datei — bitte aufteilen.");
          setzeDatei({ name: f.name, kopf: g.kopf, zeilen: g.zeilen, trenner: g.trenner });
          setzeZuordnung(zuordnen(art, g.kopf));
        } catch (e) { setzeFehler(e.message || String(e)); setzeDatei(null); }
      };
      leser.onerror = function () { setzeFehler("Die Datei ließ sich nicht lesen."); };
      leser.readAsText(f, "UTF-8");
    }

    // Vorschau: alle Zeilen lesen, zaehlen
    var pruefung = React.useMemo(function () {
      if (!datei) return null;
      var gesehen = {};
      var gut = [], schlecht = [], dubletten = [];
      datei.zeilen.forEach(function (z, i) {
        var r = zeileLesen(art, felder, zuordnung, z, standard);
        if (r.fehler.length) { schlecht.push({ nr: i + 2, fehler: r.fehler, satz: r.satz }); return; }
        var k = schluessel(art, r.satz);
        if (k && (gesehen[k] || (vorhanden && vorhanden[k]))) { dubletten.push({ nr: i + 2, satz: r.satz, grund: gesehen[k] ? "doppelt in der Datei" : "schon vorhanden" }); if (dublettenAus) return; }
        if (k) gesehen[k] = true;
        gut.push({ nr: i + 2, satz: r.satz });
      });
      return { gut: gut, schlecht: schlecht, dubletten: dubletten };
    }, [datei, zuordnung, standard, vorhanden, dublettenAus, art]);

    async function importieren() {
      if (!pruefung || !pruefung.gut.length) return;
      setzeLaeuft(true); setzeFehler("");
      var angelegt = 0, fehlgeschlagen = [];
      var saetze = pruefung.gut.map(function (g) { return Object.assign({}, g.satz, { ersteller_id: p.user && p.user.id || null }); });
      for (var i = 0; i < saetze.length; i += 100) {
        var block = saetze.slice(i, i + 100);
        var r = await window._sb.from(art).insert(block).select("id");
        if (r.error) {
          // Block einzeln nachholen, damit eine kaputte Zeile nicht 99 gute mitreisst
          for (var j = 0; j < block.length; j++) {
            var e = await window._sb.from(art).insert(block[j]).select("id");
            if (e.error) fehlgeschlagen.push({ nr: pruefung.gut[i + j].nr, fehler: e.error.message }); else angelegt++;
          }
        } else angelegt += (r.data || []).length;
      }
      try { if (typeof logAction === "function") await logAction("import", art, "", "CSV-Import " + (datei && datei.name || ""), { anzahl: angelegt, uebersprungen: pruefung.dubletten.length, fehler: fehlgeschlagen.length }); } catch (e) { /* Protokoll ist Pflicht, aber kein Grund zum Abbruch */ }
      setzeLaeuft(false);
      setzeBericht({ angelegt: angelegt, fehlgeschlagen: fehlgeschlagen, uebersprungen: dublettenAus ? pruefung.dubletten.length : 0, unlesbar: pruefung.schlecht.length });
      if (angelegt && typeof p.fertig === "function") { try { p.fertig(angelegt); } catch (e) { /* die Seite laedt beim naechsten Oeffnen neu */ } }
    }

    var ueberschrift = art === "kontakte" ? "Kontakte aus CSV importieren" : "Objekte aus CSV importieren";
    var kopfzelle = { textAlign: "left", fontSize: 11, color: CI.muted, textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 8px", borderBottom: "1px solid " + CI.border, whiteSpace: "nowrap" };
    var zelle = { padding: "5px 8px", borderBottom: "1px solid " + CI.border, fontSize: 12.5, whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" };
    var zugeordnet = felder.filter(function (f) { return zuordnung[f[0]] !== undefined; });

    return E("div", { "data-csv-import": art, style: { position: "fixed", inset: 0, zIndex: 8000, background: "rgba(27,42,71,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } },
      E("div", { style: { background: CI.card, borderRadius: 12, width: "100%", maxWidth: 980, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" } },
        E("div", { style: { padding: "16px 22px 10px", borderBottom: "1px solid " + CI.border, display: "flex", alignItems: "center", gap: 12 } },
          E("h2", { style: { margin: 0, fontSize: 18, color: CI.blau, flex: 1 } }, ueberschrift),
          E("button", { type: "button", style: knopfLeer, onClick: p.schliessen }, "Schließen")),
        E("div", { style: { padding: "14px 22px", overflowY: "auto", flex: 1, fontSize: 13.5 } },
          fehler ? E("div", { style: { color: CI.danger, marginBottom: 10 } }, fehler) : null,

          bericht ? E("div", null,
            E("div", { style: { fontSize: 16, fontWeight: 700, color: CI.success, marginBottom: 8 } }, bericht.angelegt + (art === "kontakte" ? " Kontakte" : " Objekte") + " angelegt."),
            bericht.uebersprungen ? E("div", { style: { color: CI.muted } }, bericht.uebersprungen + " Dubletten übersprungen.") : null,
            bericht.unlesbar ? E("div", { style: { color: CI.muted } }, bericht.unlesbar + " Zeilen nicht lesbar (siehe Prüfung) — nicht importiert.") : null,
            bericht.fehlgeschlagen.length ? E("div", { style: { marginTop: 8 } }, E("strong", null, bericht.fehlgeschlagen.length + " Zeilen hat die Datenbank abgelehnt:"),
              bericht.fehlgeschlagen.slice(0, 20).map(function (f, i) { return E("div", { key: i, style: { fontSize: 12.5, color: CI.danger } }, "Zeile " + f.nr + ": " + f.fehler); })) : null,
            E("button", { type: "button", style: Object.assign({}, knopf, { marginTop: 14 }), onClick: p.schliessen }, "Fertig"))

          : !datei ? E("div", null,
            E("p", { style: { color: CI.muted, lineHeight: 1.7, marginTop: 0 } },
              "Eine CSV-Datei mit Kopfzeile (Trennzeichen ; , oder Tab, UTF-8). Die Spalten ordnen Sie im nächsten Schritt zu — nichts wird geraten, nichts stillschweigend verworfen. "
              + (art === "kontakte" ? "Pflicht je Zeile: Nachname oder Firma. Dubletten erkennt der Import an der E-Mail-Adresse." : "Pflicht je Zeile: Vertragsart (oder eine Vorgabe unten). Dubletten erkennt der Import an Objekt-Nr. oder Straße + Hausnummer + PLZ.")),
            E("input", { type: "file", accept: ".csv,text/csv,text/plain", onChange: dateiWaehlen }),
            E("details", { style: { marginTop: 14, fontSize: 12.5, color: CI.muted } }, E("summary", null, "Welche Spalten werden erkannt?"),
              E("div", { style: { marginTop: 6, lineHeight: 1.7 } }, felder.map(function (f) { return f[1]; }).join(" · "))))

          : E("div", null,
            E("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10, color: CI.muted, fontSize: 12.5 } },
              E("span", null, E("strong", null, datei.name), " · " + datei.zeilen.length + " Zeilen · " + datei.kopf.length + " Spalten · Trenner „" + (datei.trenner === "\t" ? "Tab" : datei.trenner) + "“"),
              E("button", { type: "button", style: Object.assign({}, knopfLeer, { padding: "3px 9px" }), onClick: function () { setzeDatei(null); setzeZuordnung({}); } }, "Andere Datei")),

            E("div", { style: { fontWeight: 700, margin: "10px 0 6px" } }, "1. Spalten zuordnen"),
            E("div", { style: { display: "grid", gap: "6px 14px", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))" } },
              felder.map(function (f) {
                return E("label", { key: f[0], style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 } },
                  E("span", { style: { width: 150, color: zuordnung[f[0]] !== undefined ? CI.blau : CI.muted, fontWeight: zuordnung[f[0]] !== undefined ? 600 : 400 } }, f[1]),
                  E("select", { style: Object.assign({}, feld, { flex: 1 }), value: zuordnung[f[0]] === undefined ? "" : String(zuordnung[f[0]]),
                    onChange: function (e) { var n = Object.assign({}, zuordnung); if (e.target.value === "") delete n[f[0]]; else n[f[0]] = Number(e.target.value); setzeZuordnung(n); } },
                    [E("option", { key: "", value: "" }, "— nicht importieren —")].concat(datei.kopf.map(function (k, i) { return E("option", { key: i, value: String(i) }, k || ("Spalte " + (i + 1))); }))));
              })),
            art === "immobilien" ? E("div", { style: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, alignItems: "center" } },
              E("label", null, "Vertragsart, wenn die Spalte fehlt: ",
                E("select", { style: Object.assign({}, feld, { width: "auto", display: "inline-block" }), value: standard.vertragsart, onChange: function (e) { setzeStandard(Object.assign({}, standard, { vertragsart: e.target.value })); } },
                  E("option", { value: "verkauf" }, "Verkauf"), E("option", { value: "vermietung" }, "Vermietung"), E("option", { value: "beides" }, "beides"), E("option", { value: "" }, "— keine Vorgabe —"))),
              E("label", null, "Status, wenn die Spalte fehlt: ",
                E("select", { style: Object.assign({}, feld, { width: "auto", display: "inline-block" }), value: standard.status, onChange: function (e) { setzeStandard(Object.assign({}, standard, { status: e.target.value })); } },
                  STATUS.map(function (s) { return E("option", { key: s, value: s }, s); })))) : null,
            E("label", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12.5 } },
              E("input", { type: "checkbox", checked: dublettenAus, onChange: function (e) { setzeDublettenAus(e.target.checked); } }),
              "Dubletten überspringen" + (vorhanden ? "" : " (Bestand wird noch geladen …)")),

            pruefung ? E("div", null,
              E("div", { style: { fontWeight: 700, margin: "16px 0 6px" } }, "2. Prüfung"),
              E("div", { style: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 } },
                E("span", { style: { color: CI.success, fontWeight: 600 } }, pruefung.gut.length + " importierbar"),
                E("span", { style: { color: pruefung.dubletten.length ? CI.gold : CI.muted } }, pruefung.dubletten.length + " Dubletten" + (dublettenAus ? " (werden übersprungen)" : " (werden trotzdem angelegt)")),
                E("span", { style: { color: pruefung.schlecht.length ? CI.danger : CI.muted } }, pruefung.schlecht.length + " nicht lesbar")),
              pruefung.schlecht.length ? E("div", { style: { marginTop: 6, fontSize: 12.5, color: CI.danger, maxHeight: 120, overflowY: "auto" } },
                pruefung.schlecht.slice(0, 30).map(function (s) { return E("div", { key: s.nr }, "Zeile " + s.nr + ": " + s.fehler.join("; ")); }),
                pruefung.schlecht.length > 30 ? E("div", null, "… und " + (pruefung.schlecht.length - 30) + " weitere") : null) : null,

              E("div", { style: { fontWeight: 700, margin: "16px 0 6px" } }, "3. Vorschau (erste " + Math.min(8, pruefung.gut.length) + " von " + pruefung.gut.length + ")"),
              !zugeordnet.length ? E("div", { style: { color: CI.danger } }, "Keine Spalte zugeordnet.")
              : E("div", { style: { overflowX: "auto", border: "1px solid " + CI.border, borderRadius: 8 } },
                E("table", { style: { borderCollapse: "collapse", minWidth: "100%" } },
                  E("thead", null, E("tr", null, [E("th", { key: "#", style: kopfzelle }, "Zeile")].concat(zugeordnet.map(function (f) { return E("th", { key: f[0], style: kopfzelle }, f[1]); })))),
                  E("tbody", null, pruefung.gut.slice(0, 8).map(function (g) {
                    return E("tr", { key: g.nr }, [E("td", { key: "#", style: Object.assign({}, zelle, { color: CI.muted }) }, g.nr)].concat(zugeordnet.map(function (f) {
                      var w = g.satz[f[0]]; return E("td", { key: f[0], style: zelle, title: w == null ? "" : String(w) }, w == null ? "" : Array.isArray(w) ? w.join(", ") : typeof w === "boolean" ? (w ? "ja" : "nein") : String(w)); })));
                  })))),

              E("div", { style: { display: "flex", gap: 8, marginTop: 16, alignItems: "center", flexWrap: "wrap" } },
                E("button", { type: "button", style: knopf, disabled: laeuft || !pruefung.gut.length || !zugeordnet.length, onClick: importieren },
                  laeuft ? "Importiert …" : pruefung.gut.length + (art === "kontakte" ? " Kontakte anlegen" : " Objekte anlegen")),
                E("span", { style: { fontSize: 12, color: CI.muted } }, "Angelegt wird im eigenen Haus, mit Ihrem Konto. Ein Import lässt sich nicht gesammelt zurücknehmen — Vorschau bitte prüfen."))) : null))));
  }

  // Der Knopf, der das Fenster oeffnet — wird von den Seiten eingesetzt.
  function ImmoCsvImportKnopf(p) {
    var oZ = React.useState(false), offen = oZ[0], setzeOffen = oZ[1];
    return E(React.Fragment, null,
      E("button", { type: "button", onClick: function () { setzeOffen(true); }, title: "Aus einer CSV-Datei importieren",
        style: Object.assign({}, knopfLeer, p.style || {}) }, "CSV-Import"),
      offen ? E(ImmoCsvImport, { art: p.art, user: p.user, fertig: p.fertig, schliessen: function () { setzeOffen(false); } }) : null);
  }

  if (typeof window !== "undefined") {
    window.ImmoCsvImport = ImmoCsvImport;
    window.ImmoCsvImportKnopf = ImmoCsvImportKnopf;
    window.ImmoCsvImportApi = API;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
