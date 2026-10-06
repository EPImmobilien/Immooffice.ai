// ============================================================================
// Exposé-Vorlagen — Liste, Kopie, Vorschau
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS. Diese Datei ist Handarbeit und wird NICHT von
// scripts/oberflaeche-zerlegen.py erzeugt — die Vorlage kennt den Baukasten
// nicht. scripts/bauen.py setzt sie als eigenen <script>-Block in
// dist/index.html ein, vor dem Anwendungsskript.
//
// Klassische Laufzeit wie der Rest der Oberflaeche: React.createElement,
// kein Modulsystem, kein Buendler (CLAUDE.md).
//
// Gezeichnet wird mit demselben Renderer, den die Edge Function benutzt
// (window.ImmoExpose aus packages/expose-renderer). Das ist der Kern des
// Auftrags: "So sehen Vorschau und Ergebnis garantiert gleich aus."
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    danger: "#c0392b", success: "#1e7e34", shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };
  var SERIF = window.IMMO_FONT_SERIF || "'Cormorant Garamond', serif";

  // --- Schriften ----------------------------------------------------------
  // Sie liegen neben der Auslieferung (dist/schriften/expose/, von
  // scripts/bauen.py dorthin gelegt). Einmal geladen, bleiben sie liegen:
  // zwanzig Schnitte sind ein Megabyte, und der Nutzer blaettert zwischen
  // den Vorlagen hin und her.
  var schriftCache = new Map();

  function schnitteIn(vorlage) {
    var raus = new Set();
    (function sammle(x) {
      if (Array.isArray(x)) { x.forEach(sammle); return; }
      if (!x || typeof x !== "object") return;
      if (typeof x.familie === "string" && typeof x.schnitt === "string") {
        try { raus.add(window.ImmoExpose.schnittName(x)); } catch (e) { /* meldet der Renderer */ }
      }
      Object.keys(x).forEach(function (k) { sammle(x[k]); });
    })(vorlage);
    return Array.from(raus);
  }

  function schriftenLaden(namen) {
    return Promise.all(namen.map(function (name) {
      if (schriftCache.has(name)) return [name, schriftCache.get(name)];
      return fetch("schriften/expose/" + name + ".ttf").then(function (r) {
        if (!r.ok) throw new Error("Die Schrift " + name + " ist nicht ausgeliefert "
          + "(dist/schriften/expose/" + name + ".ttf fehlt).");
        return r.arrayBuffer();
      }).then(function (buf) {
        var m = window.ImmoExpose.metrikLesen(new Uint8Array(buf), name);
        schriftCache.set(name, m);
        return [name, m];
      });
    })).then(function (paare) {
      var map = new Map();
      paare.forEach(function (p) { map.set(p[0], p[1]); });
      return map;
    });
  }

  // --- Beispieldaten fuer die Vorschau ------------------------------------
  // Wer eine Vorlage gestaltet, hat kein Objekt vor sich. Die Werte sind
  // darum erfunden — und sie sind als Beispiel GEKENNZEICHNET, in der
  // Oberflaeche wie in den Daten. In ein ausgeliefertes Exposé kommt
  // niemals etwas davon: dort rechnet dieselbe Aufbereitung mit der Zeile
  // des echten Objekts.
  var BEISPIEL_OBJEKT = {
    immo_nr: "MUSTER-001", objekttitel: "Beispielwohnung mit Dachterrasse",
    objektart: "Wohnung", vertragsart: "kauf", strasse: "Beispielweg",
    hausnummer: "1", plz: "20095", ort: "Musterstadt", ortsteil: "Hafenviertel",
    adresse_freigeben: true, wohnflaeche: 112, nutzflaeche: 14, grundstueck: 0,
    zimmer: 3, schlafzimmer: 2, badezimmer: 2, etage: "4. OG", etagen_gesamt: 5,
    baujahr: 2021, modernisierung_jahr: 2021, zustand: "neuwertig",
    unterkellert: true, heizungsart: "Fernwärme", energie_traeger: "Fernwärme",
    energieausweis_typ: "Bedarfsausweis", energie_kennwert: 38.5,
    energie_klasse: "A+", energie_gueltig_bis: "2035-04-30",
    angebotspreis: 589000, hausgeld: 285, hausgeld_nicht_umlagefaehig: 95,
    provision_aussen: "3,57 %", miete_ist: 1450, verfuegbar_ab: "sofort",
    stellplatz_art: "Tiefgarage", stellplatz_anzahl: 1,
    expose_slogan: "Beispielzeile für die Vorschau",
    expose_zitat: "Hier steht ein Zitat aus dem Exposé.",
    beschreibung_objekt: "Dies ist ein Beispieltext. Er zeigt, wie der "
      + "Fließtext in dieser Vorlage läuft, wie breit die Spalte ist und wo "
      + "er umbricht.\n\nEin zweiter Absatz, damit auch der Absatzabstand zu "
      + "sehen ist. Im Exposé steht hier die Objektbeschreibung des Objekts.",
    beschreibung_lage: "Beispieltext zur Lage. Er füllt die Lagespalte, damit "
      + "sichtbar wird, wie viel Text die Seite trägt.",
    beschreibung_ausstattung_expose: "Fußbodenheizung\nEinbauküche\n"
      + "Dachterrasse\nTiefgarage\nAufzug\nGäste-WC",
    expose_highlights: [
      { zeile1: "Dachterrasse", zeile2: "32 m² nach Süden" },
      { zeile1: "Neubau", zeile2: "Erstbezug 2021" },
      { zeile1: "Tiefgarage", zeile2: "mit Ladepunkt" },
      { zeile1: "Aufzug", zeile2: "bis in die Wohnung" },
    ],
    lage_distanzen: [
      { label: "Bushaltestelle", wert: "0,3 km" }, { label: "Kindergarten", wert: "0,6 km" },
      { label: "Grundschule", wert: "0,9 km" }, { label: "Einkaufen", wert: "0,4 km" },
      { label: "Zentrum", wert: "1,8 km" }, { label: "Autobahn", wert: "3,2 km" },
    ],
    expose_wege: [
      { ziel: "Bahnhof", fuss: 12, rad: 5, auto: 3 },
      { ziel: "Innenstadt", fuss: 22, rad: 9, auto: 6 },
      { ziel: "Flughafen", fuss: null, rad: 35, auto: 18 },
    ],
    raumaufteilung: [
      { name: "Wohnen/Essen", flaeche: 38.5, ebene: "eg" },
      { name: "Küche", flaeche: 9.8, ebene: "eg" },
      { name: "Bad", flaeche: 8.4, ebene: "eg" },
      { name: "Schlafen", flaeche: 16.2, ebene: "og" },
      { name: "Kind", flaeche: 13.1, ebene: "og" },
    ],
    laufende_kosten: [
      { name: "Grundsteuer", betrag: 38 }, { name: "Versicherung", betrag: 54 },
      { name: "Strom", betrag: 65 }, { name: "Wasser", betrag: 48 },
    ],
    expose_ausstattung_gruppen: [
      { titel: "Küche", punkte: ["Kochinsel", "Naturstein", "Vollausstattung"] },
      { titel: "Bad", punkte: ["Regendusche", "Fußbodenheizung"] },
      { titel: "Außen", punkte: ["Dachterrasse", "Pergola"] },
      { titel: "Technik", punkte: ["Photovoltaik", "Ladepunkt"] },
    ],
    expose_energie_hinweis: "Beispielhinweis zur Energie. Im Exposé steht hier, "
      + "was am Objekt gepflegt ist.",
    expose_qr_url: "https://beispiel.example/expose/MUSTER-001",
    expose_rendite: true, expose_nebenkosten: true,
  };
  var BEISPIEL_FIRMA = {
    firma_name: "Beispiel Immobilien GmbH", marken_name: "Beispiel",
    marken_linie: "Immobilien", strasse: "Beispielstraße 1", plz: "20095",
    ort: "Musterstadt", telefon: "040 000000", email: "info@beispiel.example",
    web: "beispiel.example", registergericht: "AG Musterstadt", hrb: "HRB 00000",
    ust_id: "DE000000000", geschaeftsfuehrer: "Vorname Nachname",
  };
  var BEISPIEL_AP = {
    name: "Vorname Nachname", funktion: "Immobilienmaklerin",
    telefon: "040 000000", mobil: "0170 0000000", email: "name@beispiel.example",
  };

  function beispielDaten(firma) {
    // Die Marke des eigenen Mandanten, wenn sie bekannt ist: wer eine
    // Vorlage gestaltet, will seine Farben sehen und nicht die der
    // Beispielfirma.
    var f = {};
    Object.keys(BEISPIEL_FIRMA).forEach(function (k) { f[k] = BEISPIEL_FIRMA[k]; });
    if (firma) {
      ["firma_name", "marken_name", "marken_linie", "strasse", "plz", "ort",
       "telefon", "email", "web", "registergericht", "hrb", "ust_id",
       "geschaeftsfuehrer"].forEach(function (k) {
        if (firma[k]) f[k] = firma[k];
      });
    }
    return window.ImmoExpose.aufbereiten({
      immobilie: BEISPIEL_OBJEKT, firma: f, ansprechpartner: BEISPIEL_AP,
      annahmen: { notar_prozent: 2.0, zinssatz: 3.9, tilgung: 2.0, eigenkapital_prozent: 20 },
    });
  }

  // --- QR-Code ------------------------------------------------------------
  // qrcode-generator liegt in der Oberflaeche schon bereit (window.qrcode).
  function qrFeld(inhalt) {
    if (typeof window.qrcode !== "function") return null;
    var q = window.qrcode(0, "M");
    q.addData(String(inhalt));
    q.make();
    var n = q.getModuleCount(), raus = [];
    for (var r = 0; r < n; r++) {
      var zeile = [];
      for (var c = 0; c < n; c++) zeile.push(!!q.isDark(r, c));
      raus.push(zeile);
    }
    return raus;
  }

  // --- Eine Vorlage als PDF -----------------------------------------------
  function pdfBauen(vorlage, daten, marke) {
    if (!window.ImmoExpose) return Promise.reject(new Error("Der Renderer ist nicht geladen."));
    if (!window.PDFLib) return Promise.reject(new Error("pdf-lib ist nicht geladen."));
    if (!window.fontkit) return Promise.reject(new Error("fontkit ist nicht geladen."));
    var namen = schnitteIn(vorlage);
    if (!namen.length) return Promise.reject(new Error("Die Vorlage nennt keine Schrift."));
    return schriftenLaden(namen).then(function (schriften) {
      var erg = window.ImmoExpose.rendern({
        vorlage: vorlage, daten: daten, schriften: schriften, marke: marke || {},
      });
      return window.ImmoExpose.zuPdf({
        seiten: erg.seiten, schriften: schriften,
        titel: "Vorschau " + (vorlage.name || ""), qr: qrFeld,
      }, { PDFLib: window.PDFLib, fontkit: window.fontkit }).then(function (bytes) {
        return { bytes: bytes, warnungen: erg.warnungen, seiten: erg.seiten };
      });
    });
  }

  // --- Oberflaeche --------------------------------------------------------
  var e = React.createElement;

  function knopf(text, onClick, art, aus) {
    var farben = {
      haupt: { background: CI.blau, color: "#fff", border: "1px solid " + CI.blau },
      zweit: { background: "#fff", color: CI.blau, border: "1px solid " + CI.border },
      gefahr: { background: "#fff", color: CI.danger, border: "1px solid " + CI.border },
    };
    return e("button", {
      onClick: onClick, disabled: !!aus,
      style: Object.assign({
        padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
        cursor: aus ? "default" : "pointer", opacity: aus ? 0.5 : 1,
      }, farben[art || "zweit"]),
    }, text);
  }


  // --- Die festen Texte einer Vorlage ------------------------------------
  // Welche Texte kann der Makler aendern? Alle, die in der VORLAGE stehen
  // und nicht aus den Daten kommen: Kapitelzeilen, Ueberschriften,
  // Rechtshinweise, die Beschriftung einer Tabellenspalte. Was ein
  // Platzhalter liefert ({{objekt.wohnflaeche}}), gehoert dem Objekt und
  // bleibt stehen — der Makler kann es umstellen, aber nicht ueberschreiben.
  //
  // Gesucht wird am Dokument selbst, nicht an einer gepflegten Liste: eine
  // Liste waere am Tag nach der naechsten Vorlagenaenderung falsch.
  var TEXTFELDER = ["inhalt", "label", "titel", "text", "zeile1", "zeile2",
                    "fahne_text", "einheit", "nachsatz", "unterzeile"];

  function texteSammeln(dokument) {
    var raus = [];
    (dokument && dokument.seiten || []).forEach(function (seite, si) {
      (function gehe(x, pfad) {
        if (Array.isArray(x)) {
          x.forEach(function (v, i) { gehe(v, pfad.concat([i])); });
          return;
        }
        if (!x || typeof x !== "object") return;
        TEXTFELDER.forEach(function (feld) {
          if (typeof x[feld] !== "string" || x[feld] === "") return;
          raus.push({
            seite: si, seiten_id: seite.id, seiten_name: seite.name || seite.id,
            element: x.id || (pfad.length ? pfad.join(".") : "?"),
            pfad: pfad.concat([feld]), feld: feld, wert: x[feld],
          });
        });
        Object.keys(x).forEach(function (k) {
          if (TEXTFELDER.indexOf(k) >= 0) return;
          gehe(x[k], pfad.concat([k]));
        });
      })(seite.elemente || [], ["elemente"]);
    });
    return raus;
  }

  /** Eine Kopie des Dokuments mit geaenderten Texten. */
  function texteEinsetzen(dokument, aenderungen) {
    var neu = JSON.parse(JSON.stringify(dokument));
    Object.keys(aenderungen).forEach(function (schluessel) {
      var teile = schluessel.split("\u0000");
      var si = Number(teile[0]);
      var ziel = neu.seiten[si];
      var pfad = JSON.parse(teile[1]);
      for (var i = 0; i < pfad.length - 1; i++) ziel = ziel[pfad[i]];
      ziel[pfad[pfad.length - 1]] = aenderungen[schluessel];
    });
    return neu;
  }

  function ExposeVorlagen(props) {
    var user = props.user || {};
    var zustand = React.useState({ lade: true, liste: [], fehler: "" });
    var daten = zustand[0], setDaten = zustand[1];
    var gewaehltS = React.useState(null);
    var gewaehlt = gewaehltS[0], setGewaehlt = gewaehltS[1];
    var vorschauS = React.useState({ url: "", laeuft: false, fehler: "", warnungen: [], seiten: 0 });
    var vorschau = vorschauS[0], setVorschau = vorschauS[1];
    var firmaS = React.useState(null);
    var firma = firmaS[0], setFirma = firmaS[1];
    var arbeitS = React.useState("");
    var arbeit = arbeitS[0], setArbeit = arbeitS[1];
    // Offene Textaenderungen, Schluessel: Seitennummer \0 Pfad als JSON.
    var entwurfS = React.useState({});
    var entwurf = entwurfS[0], setEntwurf = entwurfS[1];
    var texteOffenS = React.useState(false);
    var texteOffen = texteOffenS[0], setTexteOffen = texteOffenS[1];

    var laden = React.useCallback(function () {
      setDaten({ lade: true, liste: [], fehler: "" });
      window._sb.from("expose_vorlagen")
        .select("id,mandant_id,name,beschreibung,basis,version,ist_standard,archiviert,geaendert_am,dokument")
        .order("mandant_id", { ascending: true, nullsFirst: true })
        .order("name", { ascending: true })
        .then(function (a) {
          if (a.error) { setDaten({ lade: false, liste: [], fehler: a.error.message }); return; }
          setDaten({ lade: false, liste: a.data || [], fehler: "" });
        });
    }, []);

    React.useEffect(function () {
      laden();
      // Der Briefkopf des eigenen Mandanten: seine Farben stehen in der
      // Vorschau, wenn die Vorlage ci.primaer/ci.akzent benutzt.
      window._sb.from("firma_stammdaten")
        .select("firma_name,marken_name,marken_linie,strasse,plz,ort,telefon,email,web,"
                + "registergericht,hrb,ust_id,geschaeftsfuehrer,ci_primaer,ci_akzent")
        .order("sortierung").limit(1).maybeSingle()
        .then(function (a) { if (a.data) setFirma(a.data); });
    }, [laden]);

    // Eine andere Vorlage heisst: andere Texte. Ein Entwurf, der zur
    // vorigen gehoerte, darf nicht in die naechste rutschen.
    React.useEffect(function () {
      // Nur leeren, wenn etwas drinsteht: ein neues leeres Objekt waere eine
      // neue Abhaengigkeit, und die Vorschau zeichnete jedes Mal zweimal.
      setEntwurf(function (alt) { return Object.keys(alt).length ? {} : alt; });
    }, [gewaehlt]);

    // Die Vorschau entsteht neu, sobald eine andere Vorlage gewaehlt wird.
    React.useEffect(function () {
      if (!gewaehlt) return;
      var reihe = (daten.liste || []).filter(function (v) { return v.id === gewaehlt; })[0];
      if (!reihe || !reihe.dokument) return;
      var alt = vorschau.url;
      setVorschau({ url: "", laeuft: true, fehler: "", warnungen: [], seiten: 0 });
      if (alt) try { URL.revokeObjectURL(alt); } catch (x) {}
      var marke = firma ? { primaer: firma.ci_primaer || undefined, akzent: firma.ci_akzent || undefined } : {};
      // Mit den offenen Aenderungen: wer eine Ueberschrift tippt, soll sie
      // sehen, bevor er speichert.
      var offen = Object.keys(entwurf).length;
      var dok = offen ? texteEinsetzen(reihe.dokument, entwurf) : reihe.dokument;
      // Beim Tippen nicht bei jedem Anschlag zeichnen: ein Durchlauf
      // dauert knapp eine Sekunde, und zehn Buchstaben waeren zehn
      // Durchlaeufe, von denen neun niemand sieht.
      var abgebrochen = false;
      var zeit = setTimeout(function () {
        pdfBauen(dok, beispielDaten(firma), marke).then(function (r) {
          if (abgebrochen) return;
          var url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
          setVorschau({ url: url, laeuft: false, fehler: "", warnungen: r.warnungen, seiten: r.seiten.length });
        }).catch(function (f) {
          if (abgebrochen) return;
          setVorschau({ url: "", laeuft: false, fehler: String(f && f.message || f), warnungen: [], seiten: 0 });
        });
      }, offen ? 600 : 0);
      return function () { abgebrochen = true; clearTimeout(zeit); };
      // eslint-disable-next-line
    }, [gewaehlt, firma, daten.liste, entwurf]);

    function kopieAnlegen(reihe) {
      var name = window.prompt("Name der neuen Vorlage", reihe.name + " (Kopie)");
      if (!name) return;
      setArbeit("kopie");
      // mandant_id setzt die Datenbank selbst (Vorgabewert
      // aktuelle_mandant_id). Eine Vorlage ohne Mandanten waere eine
      // Systemvorlage, und die darf hier niemand anlegen — die
      // Mandantengrenze aus fork_37 weist das auch ab.
      window._sb.from("expose_vorlagen").insert({
        name: name, beschreibung: reihe.beschreibung,
        basis: reihe.basis || "leer", dokument: reihe.dokument,
      }).select("id").single().then(function (a) {
        setArbeit("");
        if (a.error) { window.alert("Kopie nicht angelegt: " + a.error.message); return; }
        laden();
        setGewaehlt(a.data && a.data.id);
      });
    }

    function umbenennen(reihe) {
      var name = window.prompt("Neuer Name", reihe.name);
      if (!name || name === reihe.name) return;
      setArbeit("name");
      window._sb.from("expose_vorlagen").update({ name: name, geaendert_am: new Date().toISOString() })
        .eq("id", reihe.id).then(function (a) {
          setArbeit("");
          if (a.error) { window.alert("Nicht umbenannt: " + a.error.message); return; }
          laden();
        });
    }

    function standardSetzen(reihe) {
      // Hoechstens eine Standardvorlage je Mandant — die Datenbank erzwingt
      // das mit einem eindeutigen Index. Darum erst alle zuruecksetzen.
      setArbeit("standard");
      window._sb.from("expose_vorlagen").update({ ist_standard: false })
        .eq("ist_standard", true).then(function () {
          return window._sb.from("expose_vorlagen")
            .update({ ist_standard: true, geaendert_am: new Date().toISOString() })
            .eq("id", reihe.id);
        }).then(function (a) {
          setArbeit("");
          if (a && a.error) { window.alert("Nicht gesetzt: " + a.error.message); return; }
          laden();
        });
    }

    /**
     * Die geaenderten Texte speichern.
     *
     * Erst die bisherige Fassung in die Historie, dann die neue in die
     * Vorlage — in dieser Reihenfolge: bricht der zweite Schritt ab, steht
     * in der Historie eine Fassung zu viel, und das ist harmlos. Umgekehrt
     * waere die alte Fassung weg.
     */
    function texteSpeichern(reihe) {
      var offen = Object.keys(entwurf);
      if (!offen.length) return;
      setArbeit("texte");
      var neuesDokument = texteEinsetzen(reihe.dokument, entwurf);
      window._sb.from("expose_vorlagen_versionen").insert({
        vorlage_id: reihe.id, version: reihe.version || 1,
        dokument: reihe.dokument, geaendert_von: user.id || null,
      }).then(function () {
        return window._sb.from("expose_vorlagen").update({
          dokument: neuesDokument,
          version: (reihe.version || 1) + 1,
          geaendert_am: new Date().toISOString(),
        }).eq("id", reihe.id);
      }).then(function (a) {
        setArbeit("");
        if (a && a.error) { window.alert("Nicht gespeichert: " + a.error.message); return; }
        setEntwurf({});
        laden();
      });
    }

    function archivieren(reihe, zurueck) {
      if (!zurueck && !window.confirm("„" + reihe.name + "“ archivieren? "
        + "Objekte, die sie benutzen, fallen auf die Standardvorlage zurück.")) return;
      setArbeit("archiv");
      window._sb.from("expose_vorlagen")
        .update({ archiviert: !zurueck, ist_standard: false })
        .eq("id", reihe.id).then(function (a) {
          setArbeit("");
          if (a.error) { window.alert("Nicht geändert: " + a.error.message); return; }
          laden();
        });
    }

    var system = (daten.liste || []).filter(function (v) { return !v.mandant_id; });
    var eigene = (daten.liste || []).filter(function (v) { return v.mandant_id && !v.archiviert; });
    var archiv = (daten.liste || []).filter(function (v) { return v.mandant_id && v.archiviert; });

    function karte(reihe, art) {
      var aktiv = gewaehlt === reihe.id;
      var seiten = reihe.dokument && Array.isArray(reihe.dokument.seiten)
        ? reihe.dokument.seiten.length : 0;
      return e("div", {
        key: reihe.id,
        onClick: function () { setGewaehlt(reihe.id); },
        style: {
          background: CI.card, border: "1px solid " + (aktiv ? CI.blau : CI.border),
          borderRadius: 10, padding: "12px 14px", marginBottom: 10, cursor: "pointer",
          boxShadow: aktiv ? CI.shadow : "none",
        },
      }, [
        e("div", { key: "k", style: { display: "flex", alignItems: "baseline", gap: 8 } }, [
          e("span", { key: "n", style: { fontFamily: SERIF, fontSize: 17, color: CI.ink } }, reihe.name),
          reihe.ist_standard ? e("span", {
            key: "s", style: {
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#fff",
              background: CI.gold, padding: "2px 6px", borderRadius: 4,
            },
          }, "STANDARD") : null,
          art === "system" ? e("span", {
            key: "sy", style: { fontSize: 10, color: CI.muted, letterSpacing: "0.08em" },
          }, "SYSTEMVORLAGE") : null,
        ]),
        e("div", { key: "b", style: { fontSize: 12, color: CI.muted, marginTop: 2 } },
          (reihe.beschreibung || "") + (seiten ? "  ·  " + seiten + " Seiten" : "")),
        e("div", { key: "a", style: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" } },
          art === "system"
            ? [knopf("Kopie anlegen", function (ev) { ev.stopPropagation(); kopieAnlegen(reihe); },
                     "haupt", arbeit === "kopie")]
            : art === "eigen"
              ? [
                  knopf("Kopie", function (ev) { ev.stopPropagation(); kopieAnlegen(reihe); }, "zweit", !!arbeit),
                  knopf("Umbenennen", function (ev) { ev.stopPropagation(); umbenennen(reihe); }, "zweit", !!arbeit),
                  reihe.ist_standard ? null
                    : knopf("Als Standard", function (ev) { ev.stopPropagation(); standardSetzen(reihe); }, "zweit", !!arbeit),
                  knopf("Archivieren", function (ev) { ev.stopPropagation(); archivieren(reihe, false); }, "gefahr", !!arbeit),
                ].filter(Boolean)
              : [knopf("Wieder aktiv", function (ev) { ev.stopPropagation(); archivieren(reihe, true); }, "zweit", !!arbeit)]),
      ]);
    }

    function abschnitt(titel, hinweis, reihen, art) {
      if (!reihen.length) return null;
      return e("div", { key: art, style: { marginBottom: 22 } }, [
        e("div", { key: "t", style: {
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
          color: CI.muted, marginBottom: 8, textTransform: "uppercase",
        } }, titel),
        hinweis ? e("div", { key: "h", style: { fontSize: 12, color: CI.muted, marginBottom: 10, lineHeight: 1.5 } }, hinweis) : null,
        e("div", { key: "l" }, reihen.map(function (r) { return karte(r, art); })),
      ]);
    }


    // --- Die Texte der gewaehlten Vorlage ---------------------------------
    var gewaehlteReihe = (daten.liste || []).filter(function (v) { return v.id === gewaehlt; })[0];
    var eigenGewaehlt = !!(gewaehlteReihe && gewaehlteReihe.mandant_id);

    function textFeld(eintrag) {
      var schluessel = eintrag.seite + "\u0000" + JSON.stringify(eintrag.pfad);
      var wert = Object.prototype.hasOwnProperty.call(entwurf, schluessel)
        ? entwurf[schluessel] : eintrag.wert;
      var geaendert = Object.prototype.hasOwnProperty.call(entwurf, schluessel)
        && entwurf[schluessel] !== eintrag.wert;
      var zeilen = Math.min(4, Math.max(1, Math.ceil(wert.length / 46)));
      return e("div", { key: schluessel, style: { marginBottom: 10 } }, [
        e("div", { key: "l", style: {
          fontSize: 10.5, color: CI.muted, marginBottom: 3,
          display: "flex", justifyContent: "space-between", gap: 8,
        } }, [
          e("span", { key: "a" }, eintrag.element + (eintrag.feld === "inhalt" ? "" : "  ·  " + eintrag.feld)),
          geaendert ? e("span", { key: "b", style: { color: CI.gold, fontWeight: 700 } }, "geändert") : null,
        ]),
        e("textarea", {
          key: "f", value: wert, rows: zeilen,
          onChange: function (ev) {
            var neu = {};
            Object.keys(entwurf).forEach(function (k) { neu[k] = entwurf[k]; });
            neu[schluessel] = ev.target.value;
            setEntwurf(neu);
          },
          style: {
            width: "100%", boxSizing: "border-box", padding: "7px 9px",
            border: "1px solid " + (geaendert ? CI.gold : CI.border),
            borderRadius: 7, fontSize: 12.5, lineHeight: 1.45, resize: "vertical",
            fontFamily: "inherit", color: CI.ink, background: "#fff",
          },
        }),
      ]);
    }

    function texteBereich() {
      if (!gewaehlteReihe) return null;
      if (!eigenGewaehlt) {
        return e("div", { key: "systemhinweis", style: {
          background: "#fff8e6", border: "1px solid #f0e0b8", borderRadius: 8,
          padding: "10px 12px", fontSize: 12.5, lineHeight: 1.6, marginTop: 14,
        } }, "Systemvorlagen gehören der Plattform und lassen sich nicht ändern. "
           + "Lege eine Kopie an — in ihr sind alle Texte frei bearbeitbar.");
      }
      var eintraege = texteSammeln(gewaehlteReihe.dokument);
      var offen = Object.keys(entwurf).filter(function (k) { return true; }).length;
      if (!texteOffen) {
        return e("div", { key: "zu", style: { marginTop: 14 } },
          knopf("Texte bearbeiten (" + eintraege.length + ")",
                function () { setTexteOffen(true); }, "haupt", false));
      }
      var nachSeite = [];
      eintraege.forEach(function (x) {
        var letzte = nachSeite[nachSeite.length - 1];
        if (!letzte || letzte.seite !== x.seite) {
          nachSeite.push({ seite: x.seite, name: x.seiten_name, eintraege: [x] });
        } else letzte.eintraege.push(x);
      });
      return e("div", { key: "texte", style: {
        marginTop: 14, border: "1px solid " + CI.border, borderRadius: 10,
        background: CI.card, padding: "14px 16px",
      } }, [
        e("div", { key: "kopf", style: {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, marginBottom: 8,
        } }, [
          e("div", { key: "t", style: {
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
            color: CI.muted, textTransform: "uppercase",
          } }, "Texte der Vorlage"),
          e("div", { key: "k", style: { display: "flex", gap: 6 } }, [
            offen ? knopf("Speichern", function () { texteSpeichern(gewaehlteReihe); },
                          "haupt", arbeit === "texte") : null,
            offen ? knopf("Verwerfen", function () { setEntwurf({}); }, "zweit", !!arbeit) : null,
            knopf("Schließen", function () { setTexteOffen(false); }, "zweit", false),
          ].filter(Boolean)),
        ]),
        e("div", { key: "h", style: { fontSize: 12, color: CI.muted, lineHeight: 1.55, marginBottom: 12 } },
          "Hier stehen die Texte, die in der VORLAGE stehen und damit für jedes "
          + "Objekt gelten: Kapitelzeilen, Überschriften, Hinweise. Was in "
          + "doppelten geschweiften Klammern steht, ist ein Platzhalter — er "
          + "wird beim Erzeugen durch die Angabe des Objekts ersetzt und "
          + "entfällt, wenn sie fehlt. Die Vorschau rechts zeigt die Änderung, "
          + "bevor du speicherst."),
        offen ? e("div", { key: "w", style: {
          background: "#fff8e6", border: "1px solid #f0e0b8", borderRadius: 7,
          padding: "7px 10px", fontSize: 12, marginBottom: 12,
        } }, offen + (offen === 1 ? " Änderung ist" : " Änderungen sind")
           + " noch nicht gespeichert.") : null,
        e("div", { key: "l", style: { maxHeight: "52vh", overflowY: "auto" } },
          nachSeite.map(function (gruppe) {
            return e("div", { key: "s" + gruppe.seite, style: { marginBottom: 16 } }, [
              e("div", { key: "n", style: {
                fontSize: 11, fontWeight: 700, color: CI.ink, marginBottom: 6,
                borderBottom: "1px solid " + CI.border, paddingBottom: 4,
              } }, (gruppe.seite + 1) + "  ·  " + gruppe.name),
              e("div", { key: "f" }, gruppe.eintraege.map(textFeld)),
            ]);
          })),
      ]);
    }

    var warnArten = {};
    (vorschau.warnungen || []).forEach(function (w) {
      warnArten[w.art] = (warnArten[w.art] || 0) + 1;
    });

    return e("div", { style: { display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" } }, [
      // --- links: die Vorlagen ---
      e("div", { key: "liste", style: { flex: "1 1 380px", minWidth: 340 } }, [
        daten.fehler ? e("div", { key: "f", style: {
          background: "#fdecea", border: "1px solid #f5c6cb", color: CI.danger,
          padding: "10px 12px", borderRadius: 8, fontSize: 12.5, marginBottom: 14,
        } }, daten.fehler) : null,
        daten.lade ? e("div", { key: "l", style: { color: CI.muted, fontSize: 13 } }, "Vorlagen werden geladen …") : null,
        abschnitt("Systemvorlagen", "Sie gehören der Plattform und lassen sich "
          + "nicht ändern. Eine Kopie gehört dir und ist frei bearbeitbar.", system, "system"),
        abschnitt("Eigene Vorlagen", "", eigene, "eigen"),
        abschnitt("Archiv", "", archiv, "archiv"),
        texteBereich(),
        !daten.lade && !system.length && !eigene.length ? e("div", { key: "leer", style: {
          background: "#fff8e6", border: "1px solid #f0e0b8", borderRadius: 8,
          padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6,
        } }, "Es ist keine Vorlage hinterlegt. Die drei Systemvorlagen kommen mit "
           + "der Migration fork_38 in die Datenbank.") : null,
      ]),
      // --- rechts: die Vorschau ---
      e("div", { key: "vorschau", style: { flex: "1 1 460px", minWidth: 380 } }, [
        e("div", { key: "kopf", style: {
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginBottom: 8, gap: 10,
        } }, [
          e("div", { key: "t", style: {
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
            color: CI.muted, textTransform: "uppercase",
          } }, "Vorschau mit Beispieldaten"),
          vorschau.url ? e("a", {
            key: "a", href: vorschau.url, download: "Vorschau.pdf",
            style: { fontSize: 12, color: CI.blau, fontWeight: 600 },
          }, "PDF herunterladen") : null,
        ]),
        e("div", { key: "hinweis", style: { fontSize: 12, color: CI.muted, marginBottom: 10, lineHeight: 1.5 } },
          "Die Werte sind Beispiele. Im Exposé stehen dort die Angaben des "
          + "Objekts; fehlt eine, entfällt die Zeile — erfunden wird nichts."),
        !gewaehlt ? e("div", { key: "nichts", style: {
          border: "1px dashed " + CI.border, borderRadius: 10, padding: "40px 20px",
          textAlign: "center", color: CI.muted, fontSize: 13,
        } }, "Eine Vorlage wählen, um sie zu sehen.") : null,
        vorschau.laeuft ? e("div", { key: "laeuft", style: {
          border: "1px solid " + CI.border, borderRadius: 10, padding: "40px 20px",
          textAlign: "center", color: CI.muted, fontSize: 13,
        } }, "Vorschau wird gezeichnet …") : null,
        vorschau.fehler ? e("div", { key: "fehler", style: {
          background: "#fdecea", border: "1px solid #f5c6cb", color: CI.danger,
          padding: "10px 12px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
        } }, vorschau.fehler) : null,
        vorschau.url ? e("iframe", {
          key: "rahmen", src: vorschau.url, title: "Vorschau",
          style: {
            width: "100%", height: "70vh", minHeight: 420, border: "1px solid " + CI.border,
            borderRadius: 10, background: "#fff",
          },
        }) : null,
        vorschau.url ? e("div", { key: "zahl", style: { fontSize: 12, color: CI.muted, marginTop: 8 } },
          vorschau.seiten + " Seiten"
          + (Object.keys(warnArten).length
            ? "  ·  " + Object.keys(warnArten).map(function (a) {
                return warnArten[a] + " × " + ({
                  fehlendes_bild: "fehlendes Bild", fehlender_wert: "fehlender Wert",
                  fehlendes_zeichen: "fehlendes Zeichen", verdichtet: "verdichtet",
                  gekuerzt: "gekürzt", unbekannt: "unbekannt",
                }[a] || a);
              }).join(", ")
            : "")) : null,
        // Die Befunde im Klartext: ein fehlendes Bild ist bei Beispieldaten
        // normal, ein unbekannter Platzhalter ein Fehler in der Vorlage.
        (vorschau.warnungen || []).filter(function (w) { return w.art === "unbekannt"; })
          .slice(0, 6).map(function (w, i) {
            return e("div", { key: "u" + i, style: {
              fontSize: 12, color: CI.danger, marginTop: 6, lineHeight: 1.5,
            } }, (w.seite ? w.seite + ": " : "") + w.text);
          }),
      ]),
    ]);
  }

  window.ImmoExposeVorlagen = ExposeVorlagen;
})();
