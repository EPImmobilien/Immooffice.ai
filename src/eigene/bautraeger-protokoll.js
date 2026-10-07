// ============================================================================
// Bauträger-Paket v2 — das Übergabeprotokoll im Neubau-Modus (fork_84/85)
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, klassische Laufzeit. Vier Haken im vorhandenen
// Protokoll-Editor (FORK-Regeln in scripts/oberflaeche-zerlegen.py):
//
//   * ImmoProtokollVerknuepfung — Schritt Stammdaten: Objekt, Projekt,
//     Einheit, Käufer und Kontakte per Suchfeld wählen; Adresse, Namen und
//     Anschriften füllen sich, der Freitext bleibt als Rückfall. Ohne
//     Objekt-Bezug schlägt der Adressabgleich Objekte vor — nichts
//     automatisch (Auftrag A1).
//   * ImmoRaumMaengel — Schritt Räume: „+ Mangel“ je Raum als strukturierter
//     Eintrag (Titel, Text per Diktat, Fotos, Gewerk → Handwerker, Frist).
//     Im Neubau werden die Einträge beim Abschluss zu projekt_maengel; bei
//     Miete/Verkauf aus dem Bestand bleiben sie die Mangelliste im Protokoll.
//   * ImmoAbnahmeAbschluss — Schritt Abschluss: speichert, erzeugt das PDF
//     (die Hilfe der Vorlage) und ruft abnahme-abschliessen; danach „An
//     Käufer senden“ als Composer-Entwurf (Mails an Käufer nie automatisch).
//   * ImmoMaengelInsPdf — zeichnet die Mängel eines Raums ins Protokoll-PDF.
// ============================================================================
(function () {
  "use strict";
  var B = window.ImmoBT, E = React.createElement, CI = B.CI;
  var zeile = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 10 };
  var etikett = { fontSize: 11.5, color: CI.muted, fontWeight: 600, marginBottom: 4, display: "block" };

  // Projekt samt Handwerkern einmal laden; die Räume- und Abschluss-Schritte brauchen beides.
  var projektCache = {};
  async function projektLaden(id) {
    if (!id) return null;
    if (projektCache[id] && Date.now() - projektCache[id].zeit < 120000) return projektCache[id].wert;
    var r = await Promise.all([
      window._sb.from("projekte").select("id, name, ort, strasse, plz, gewerke, frist_standard_tage, mahnung_automatisch").eq("id", id).maybeSingle(),
      window._sb.from("projekt_kontakte").select("id, gewerk, firma, name, email, telefon, aktiv, kontakt_id").eq("projekt_id", id).order("sortierung")
    ]);
    var wert = r[0].data ? Object.assign({}, r[0].data, { kontakte: (r[1].data || []).filter(function (k) { return k.aktiv !== false; }) }) : null;
    projektCache[id] = { zeit: Date.now(), wert: wert };
    return wert;
  }
  var einheitCache = {};
  async function einheitLaden(id) {
    if (!id) return null;
    if (einheitCache[id] && Date.now() - einheitCache[id].zeit < 120000) return einheitCache[id].wert;
    var r = await window._sb.from("projekt_einheiten").select("id, we_nr, grundriss_datei, sonderleistungen, raeume").eq("id", id).maybeSingle();
    var wert = r.data || null;
    if (wert && wert.grundriss_datei) wert.grundriss_url = await B.signiert(wert.grundriss_datei);
    einheitCache[id] = { zeit: Date.now(), wert: wert };
    return wert;
  }
  function anschrift(k) { return k ? [[k.strasse].filter(Boolean).join(" "), [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join("\n") : ""; }
  function kName(k) { return k ? ([k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "") : ""; }

  // ---------------------------------------------------------------------------
  function ImmoProtokollVerknuepfung(p) {
    var d = p.data, setFeld = p.setFeld;
    var pZ = React.useState([]), projekte = pZ[0], setzeProjekte = pZ[1];
    var eZ = React.useState([]), einheiten = eZ[0], setzeEinheiten = eZ[1];
    var zZ = React.useState([]), zugaenge = zZ[0], setzeZugaenge = zZ[1];
    var kZ = React.useState({}), kontakte = kZ[0], setzeKontakte = kZ[1];
    var vZ = React.useState([]), vorschlaege = vZ[0], setzeVorschlaege = vZ[1];
    var oZ = React.useState(!!(d.projekt_id || d.immobilie_id || (d.kontakt_ids || []).length)), offen = oZ[0], setzeOffen = oZ[1];
    var hatObjektSuche = typeof ObjektSuchfeld === "function", hatKontaktSuche = typeof KontaktSuchfeld === "function";

    React.useEffect(function () {
      var aktiv = true;
      window._sb.from("projekte").select("id, name, ort, strasse, plz, status").order("name").then(function (r) { if (aktiv) setzeProjekte(r.data || []); });
      return function () { aktiv = false; };
    }, []);
    React.useEffect(function () {
      var aktiv = true;
      if (!d.projekt_id) { setzeEinheiten([]); return; }
      window._sb.from("projekt_einheiten").select("id, we_nr, geschoss, zimmer, wohnflaeche, immobilie_id, raeume, status").eq("projekt_id", d.projekt_id).order("sortierung").then(function (r) { if (aktiv) setzeEinheiten(r.data || []); });
      return function () { aktiv = false; };
    }, [d.projekt_id]);
    React.useEffect(function () {
      var aktiv = true;
      if (!d.einheit_id) { setzeZugaenge([]); return; }
      window._sb.from("projekt_zugaenge").select("id, anzeigename, email, rolle, kontakt_id, telefon").eq("einheit_id", d.einheit_id).in("rolle", ["kaeufer", "reserviert"]).then(function (r) { if (aktiv) setzeZugaenge(r.data || []); });
      return function () { aktiv = false; };
    }, [d.einheit_id]);
    React.useEffect(function () {
      var fehlen = (d.kontakt_ids || []).filter(function (id) { return !kontakte[id]; });
      if (!fehlen.length) return;
      var aktiv = true;
      window._sb.from("kontakte").select("id, vorname, nachname, firma, strasse, plz, ort, email, telefon").in("id", fehlen).then(function (r) {
        if (!aktiv) return; var n = Object.assign({}, kontakte); (r.data || []).forEach(function (k) { n[k.id] = k; }); setzeKontakte(n);
      });
      return function () { aktiv = false; };
    }, [(d.kontakt_ids || []).join(",")]);
    // Adressabgleich: nur ein Vorschlag, nie eine Zuordnung.
    React.useEffect(function () {
      var aktiv = true;
      if (d.immobilie_id || !d.objekt_adresse || d.objekt_adresse.trim().length < 4) { setzeVorschlaege([]); return; }
      var t = setTimeout(function () {
        window._sb.rpc("objekte_zu_adresse", { p_adresse: d.objekt_adresse }).then(function (r) { if (aktiv) setzeVorschlaege(r.data || []); });
      }, 500);
      return function () { aktiv = false; clearTimeout(t); };
    }, [d.objekt_adresse, d.immobilie_id]);

    async function projektWaehlen(id) {
      setFeld("projekt_id", id || null); setFeld("einheit_id", null); setFeld("zugang_id", null);
      if (!id) { if (String(d.protokoll_typ || "").indexOf("neubau_") === 0) setFeld("protokoll_typ", "einzug"); return; }
      var pr = await projektLaden(id);
      if (!pr) return;
      if (String(d.protokoll_typ || "").indexOf("neubau_") !== 0) setFeld("protokoll_typ", "neubau_abnahme");
      setFeld("frist_standard_tage", pr.frist_standard_tage || 14);
      if (!d.vermieter_name) {
        var f = await window._sb.from("firma_stammdaten").select("firma_name, marken_name, strasse, plz, ort").eq("aktiv", true).order("sortierung").limit(1).maybeSingle();
        if (f.data) { setFeld("vermieter_name", f.data.firma_name || f.data.marken_name || ""); setFeld("vermieter_anschrift", anschrift(f.data)); }
      }
      if (!d.objekt_adresse) setFeld("objekt_adresse", [[pr.strasse].filter(Boolean).join(" "), [pr.plz, pr.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "));
    }
    function einheitWaehlen(id) {
      setFeld("einheit_id", id || null); setFeld("zugang_id", null);
      var e = einheiten.find(function (x) { return x.id === id; }); if (!e) return;
      var pr = projekte.find(function (x) { return x.id === d.projekt_id; }) || {};
      setFeld("objekt_adresse", [[pr.strasse].filter(Boolean).join(" "), [pr.plz, pr.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "));
      setFeld("objekt_lage", "WE " + e.we_nr + (e.geschoss ? ", " + e.geschoss : ""));
      if (e.immobilie_id && !d.immobilie_id) setFeld("immobilie_id", e.immobilie_id);
      if ((!d.raeume || !d.raeume.length) && e.raeume && e.raeume.length) {
        setFeld("raeume", e.raeume.map(function (n) { return { id: Date.now() + Math.random(), name: n, notizen: "", foto_data_urls: [], foto_pfade: [], maengel: [] }; }));
      }
    }
    async function zugangWaehlen(id) {
      setFeld("zugang_id", id || null);
      var z = zugaenge.find(function (x) { return x.id === id; }); if (!z) return;
      if (z.anzeigename) setFeld("mieter_name", z.anzeigename);
      if (z.kontakt_id) {
        if ((d.kontakt_ids || []).indexOf(z.kontakt_id) < 0) setFeld("kontakt_ids", (d.kontakt_ids || []).concat([z.kontakt_id]));
        var k = await window._sb.from("kontakte").select("id, vorname, nachname, firma, strasse, plz, ort").eq("id", z.kontakt_id).maybeSingle();
        if (k.data) { setFeld("mieter_anschrift", anschrift(k.data)); if (!z.anzeigename) setFeld("mieter_name", kName(k.data)); }
      }
    }
    function kontaktDazu(id, k) {
      if (!id || (d.kontakt_ids || []).indexOf(id) >= 0) return;
      setFeld("kontakt_ids", (d.kontakt_ids || []).concat([id]));
      if (k) { var n = Object.assign({}, kontakte); n[id] = k; setzeKontakte(n); if (!d.mieter_name) { setFeld("mieter_name", kName(k)); setFeld("mieter_anschrift", anschrift(k)); } }
    }
    React.useEffect(function () { if (d.einheit_id && !d.zugang_id && zugaenge.length === 1) zugangWaehlen(zugaenge[0].id); }, [zugaenge.length, d.einheit_id]);

    var projekt = projekte.find(function (x) { return x.id === d.projekt_id; });
    var einheitSatz = einheiten.find(function (x) { return x.id === d.einheit_id; });
    var sZ = React.useState([]), sonder = sZ[0], setzeSonder = sZ[1];
    React.useEffect(function () { var aktiv = true; if (!d.einheit_id) { setzeSonder([]); return; } einheitLaden(d.einheit_id).then(function (x) { if (aktiv) setzeSonder(x && Array.isArray(x.sonderleistungen) ? x.sonderleistungen : []); }); return function () { aktiv = false; }; }, [d.einheit_id]);
    void einheitSatz;
    return E("div", { style: Object.assign({}, B.karte, { padding: 12 }) },
      E("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }, onClick: function () { setzeOffen(!offen); } },
        E("div", { style: { fontSize: 13.5, fontWeight: 700, color: CI.blau } }, "🔗 Verknüpfungen", d.projekt_id ? E(B.Abzeichen, { farbe: "#2da14b", style: { marginLeft: 8 } }, "Neubau" + (projekt ? " · " + projekt.name : "")) : null),
        E("div", { style: B.klein }, [d.immobilie_id ? "Objekt" : null, d.einheit_id ? "Einheit" : null, d.zugang_id ? "Käufer" : null, (d.kontakt_ids || []).length ? (d.kontakt_ids || []).length + " Kontakt(e)" : null].filter(Boolean).join(" · ") || "Objekt, Projekt, Einheit, Kontakte wählen — Adresse und Namen füllen sich", " ", offen ? "▴" : "▾")),
      offen ? E("div", { style: { marginTop: 12, display: "flex", flexDirection: "column", gap: 12 } },
        E("div", { style: zeile },
          E("div", null, E("label", { style: etikett }, "Objekt (CRM)"),
            hatObjektSuche ? E(ObjektSuchfeld, { value: d.immobilie_id || "", onChange: function (id, o) { setFeld("immobilie_id", id || null); if (o && !d.objekt_adresse) setFeld("objekt_adresse", [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")); }, placeholder: "Objekt suchen …", style: B.feld })
              : E("input", { style: B.feld, value: d.immobilie_id || "", onChange: function (e) { setFeld("immobilie_id", e.target.value || null); }, placeholder: "Objekt-ID" })),
          E("div", null, E("label", { style: etikett }, "Neubau-Projekt"),
            E("select", { style: B.feld, value: d.projekt_id || "", onChange: function (e) { projektWaehlen(e.target.value); } },
              E("option", { value: "" }, "— kein Projekt (Bestand) —"), projekte.map(function (x) { return E("option", { key: x.id, value: x.id }, x.name + (x.ort ? " · " + x.ort : "")); }))),
          d.projekt_id ? E("div", null, E("label", { style: etikett }, "Einheit"),
            E("select", { style: B.feld, value: d.einheit_id || "", onChange: function (e) { einheitWaehlen(e.target.value); } },
              E("option", { value: "" }, "— Einheit wählen —"), einheiten.map(function (x) { return E("option", { key: x.id, value: x.id }, "WE " + x.we_nr + (x.geschoss ? " · " + x.geschoss : "") + (x.zimmer ? " · " + x.zimmer + " Zi." : "")); }))) : null,
          d.einheit_id ? E("div", null, E("label", { style: etikett }, "Käufer (Portalzugang)"),
            E("select", { style: B.feld, value: d.zugang_id || "", onChange: function (e) { zugangWaehlen(e.target.value); } },
              E("option", { value: "" }, zugaenge.length ? "— Käufer wählen —" : "— kein Käufer an dieser Einheit —"), zugaenge.map(function (z) { return E("option", { key: z.id, value: z.id }, (z.anzeigename || z.email) + (z.rolle === "reserviert" ? " (reserviert)" : "")); }))) : null),
        E("div", null, E("label", { style: etikett }, "Kontakte aus dem Adressbuch (Käufer, Mieter, Eigentümer)"),
          E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 } }, (d.kontakt_ids || []).map(function (id) {
            var k = kontakte[id];
            return E("span", { key: id, style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 999, background: "#f1f3f6", border: "1px solid " + CI.border, fontSize: 12 } },
              k ? kName(k) : "…", E("button", { type: "button", onClick: function () { setFeld("kontakt_ids", (d.kontakt_ids || []).filter(function (x) { return x !== id; })); }, style: { border: "none", background: "none", cursor: "pointer", color: CI.muted, padding: 0 } }, "×"));
          })),
          hatKontaktSuche ? E(KontaktSuchfeld, { value: "", onChange: function (id, k) { kontaktDazu(id, k); }, placeholder: "Kontakt hinzufügen …", style: B.feld, immobilieId: d.immobilie_id || undefined }) : null),
        vorschlaege.length ? E("div", { style: { padding: 10, background: "#fbf7ee", border: "1px solid #e3cfa6", borderRadius: 8, fontSize: 12.5 } },
          E("div", { style: { fontWeight: 600, marginBottom: 6 } }, "Zur Adresse passt vielleicht ein Objekt — übernehmen?"),
          vorschlaege.slice(0, 3).map(function (v) { return E("div", { key: v.id, style: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "3px 0" } },
            E("span", null, v.bezeichnung, " · ", [v.strasse, v.hausnummer].filter(Boolean).join(" "), ", ", [v.plz, v.ort].filter(Boolean).join(" ")),
            E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { padding: "4px 10px", fontSize: 12 }), onClick: function () { setFeld("immobilie_id", v.id); } }, "Übernehmen")); })) : null,
        d.einheit_id && sonder.length ? E("div", { style: { padding: 10, background: "#f1f8f1", border: "1px solid #cfe3cf", borderRadius: 8, fontSize: 12.5 } },
          E("div", { style: { fontWeight: 600, marginBottom: 4 } }, "Vereinbarte Sonderleistungen laut Kaufvertrag (" + sonder.length + ") — bei der Abnahme prüfen"),
          sonder.map(function (s, i) { return E("div", { key: i, style: { padding: "2px 0" } }, s.erledigt ? "☑ " : "☐ ", s.text, s.betrag ? " (" + B.euro(s.betrag) + ")" : ""); })) : null,
        d.projekt_id ? E("div", { style: zeile },
          E("div", null, E("label", { style: etikett }, "Standardfrist für Mängel (Tage)"),
            E("input", { type: "number", min: 1, max: 180, style: B.feld, value: d.frist_standard_tage || 14, onChange: function (e) { setFeld("frist_standard_tage", parseInt(e.target.value, 10) || 14); } }))) : null
      ) : null);
  }

  // ---------------------------------------------------------------------------
  function MangelFormular(p) {
    var neubau = !!p.projekt, kontakte = p.projekt && p.projekt.kontakte || [];
    var mZ = React.useState(p.wert || { id: B.neueId(), titel: "", beschreibung: "", gewerk: "", projekt_kontakt_id: null, frist: neubau ? B.tageDazu(B.heute(), p.fristTage || 14) : null, kategorie: "", foto_data_urls: [] }), m = mZ[0], setzeM = mZ[1];
    var kZ = React.useState(false), kiLaeuft = kZ[0], setzeKi = kZ[1];
    var aendern = function (patch) { setzeM(function (x) { return Object.assign({}, x, patch); }); };
    var diktat = B.useDiktat(async function (text) {
      if (!neubau) { aendern({ titel: m.titel || text.slice(0, 80), beschreibung: (m.beschreibung ? m.beschreibung + "\n" : "") + text }); return; }
      setzeKi(true);
      try {
        var r = await B.rufen("mangel-text", { text: text, gewerke: B.gewerkeListe(p.projekt, kontakte), raum: p.raumName || "" });
        var patch = { titel: r.titel || text.slice(0, 80), beschreibung: r.beschreibung || "", kategorie: r.kategorie || m.kategorie };
        if (r.gewerk) { patch.gewerk = r.gewerk; var hk = kontakte.find(function (k) { return k.gewerk === r.gewerk; }); if (hk && !m.projekt_kontakt_id) patch.projekt_kontakt_id = hk.id; }
        aendern(patch);
      } catch (e) { aendern({ titel: m.titel || text.slice(0, 80), beschreibung: text }); B.hinweis("KI nicht erreichbar — Diktat als Text übernommen (" + (e.message || e) + ")", true); }
      setzeKi(false);
    });
    function gewerkSetzen(g) { var patch = { gewerk: g }; var hk = kontakte.find(function (k) { return k.gewerk === g; }); patch.projekt_kontakt_id = hk ? hk.id : null; aendern(patch); }
    async function fotos(e) {
      var dateien = Array.from(e.target.files || []); if (!dateien.length) return;
      var neu = [];
      for (var i = 0; i < dateien.length; i++) { try { neu.push(await B.fotoAlsDataUrl(dateien[i])); } catch (x) { /* weiter */ } }
      aendern({ foto_data_urls: (m.foto_data_urls || []).concat(neu) });
      e.target.value = "";
    }
    var handwerker = kontakte.filter(function (k) { return !m.gewerk || k.gewerk === m.gewerk; });
    var gZ = React.useState(false), grundrissOffen = gZ[0], setzeGrundrissOffen = gZ[1];
    return E("div", { style: { border: "1px solid " + CI.gold, borderRadius: 10, padding: 12, background: "#fffdf8", display: "flex", flexDirection: "column", gap: 10 } },
      p.grundrissUrl ? E("div", null,
        E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: function () { setzeGrundrissOffen(!grundrissOffen); } }, m.grundriss_position ? "📍 Stelle im Grundriss ändern" : "📍 Im Grundriss markieren"),
        m.grundriss_position ? E("span", { style: Object.assign({}, B.klein, { marginLeft: 8 }) }, "Markiert (nur für Gewerke sichtbar, nicht im Käufer-Protokoll)") : null,
        grundrissOffen ? E("div", { style: { marginTop: 8 } }, E("div", { style: Object.assign({}, B.klein, { marginBottom: 4 }) }, "Auf die Stelle im Grundriss tippen."),
          E(B.GrundrissBild, { url: p.grundrissUrl, marker: m.grundriss_position ? [Object.assign({ label: "×" }, m.grundriss_position)] : [], onClick: function (pos) { aendern({ grundriss_position: pos }); setzeGrundrissOffen(false); } })) : null) : null,
      E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
        E("button", { type: "button", onClick: diktat.laeuft ? diktat.stop : diktat.start, disabled: diktat.verarbeitet || kiLaeuft,
          style: Object.assign({}, diktat.laeuft ? B.knopfRot : B.knopfLeer, { fontSize: 12 }) }, diktat.laeuft ? "■ Aufnahme beenden" : diktat.verarbeitet ? "… wird transkribiert" : kiLaeuft ? "… KI formuliert" : "🎙 Diktieren"),
        E("span", { style: B.klein }, neubau ? "Diktat → Text, Gewerk-Vorschlag (KI, 1 Credit)" : "Diktat → Text")),
      E("div", null, E("label", { style: etikett }, "Mangel (Titel) *"), E("input", { style: B.feld, value: m.titel, onChange: function (e) { aendern({ titel: e.target.value }); }, placeholder: "z. B. Kratzer im Parkett vor der Balkontür" })),
      E("div", null, E("label", { style: etikett }, "Beschreibung"), E("textarea", { style: Object.assign({}, B.feld, { minHeight: 60, resize: "vertical" }), value: m.beschreibung, onChange: function (e) { aendern({ beschreibung: e.target.value }); } })),
      E("div", { style: zeile },
        E("div", null, E("label", { style: etikett }, "Gewerk"), E(B.GewerkWahl, { projekt: p.projekt, kontakte: kontakte, value: m.gewerk, onChange: gewerkSetzen })),
        neubau ? E("div", null, E("label", { style: etikett }, "Handwerker"),
          E("select", { style: B.feld, value: m.projekt_kontakt_id || "", onChange: function (e) { aendern({ projekt_kontakt_id: e.target.value || null }); } },
            E("option", { value: "" }, handwerker.length ? "— später zuordnen —" : "— kein Handwerker für dieses Gewerk —"),
            handwerker.map(function (k) { return E("option", { key: k.id, value: k.id }, (k.firma || k.name || "?") + (k.gewerk ? " · " + k.gewerk : "") + (k.email ? "" : " (ohne E-Mail)")); }))) : null,
        neubau ? E("div", null, E("label", { style: etikett }, "Frist"), E("input", { type: "date", style: B.feld, value: m.frist || "", onChange: function (e) { aendern({ frist: e.target.value || null }); } })) : null,
        E("div", null, E("label", { style: etikett }, "Kategorie"),
          E("select", { style: B.feld, value: m.kategorie || "", onChange: function (e) { aendern({ kategorie: e.target.value }); } },
            E("option", { value: "" }, "—"), E("option", { value: "optisch" }, "Optisch"), E("option", { value: "funktion" }, "Funktion"), E("option", { value: "sicherheit" }, "Sicherheit"), E("option", { value: "unvollstaendig" }, "Unvollständig")))),
      E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
        E("label", { style: Object.assign({}, B.knopfLeer, { fontSize: 12, display: "inline-block" }) }, "📷 Foto", E("input", { type: "file", accept: "image/*", capture: "environment", multiple: true, style: { display: "none" }, onChange: fotos })),
        (m.foto_data_urls || []).map(function (u, i) { return E("span", { key: i, style: { position: "relative", display: "inline-block" } },
          E("img", { src: u, alt: "", style: { width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid " + CI.border } }),
          E("button", { type: "button", onClick: function () { aendern({ foto_data_urls: m.foto_data_urls.filter(function (_, j) { return j !== i; }) }); }, style: { position: "absolute", top: -6, right: -6, border: "none", borderRadius: 999, background: CI.danger, color: "#fff", width: 18, height: 18, fontSize: 11, cursor: "pointer", lineHeight: "18px", padding: 0 } }, "×")); })),
      E("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
        E("button", { type: "button", style: B.knopfLeer, onClick: p.abbrechen }, "Abbrechen"),
        E("button", { type: "button", style: B.knopf, disabled: !m.titel.trim(), onClick: function () { p.fertig(m); } }, p.wert ? "Übernehmen" : "Mangel aufnehmen")));
  }

  function ImmoRaumMaengel(p) {
    var raum = p.raum, pr = p.protokoll || {}, liste = raum.maengel || [];
    var pZ = React.useState(null), projekt = pZ[0], setzeProjekt = pZ[1];
    var fZ = React.useState(null), form = fZ[0], setzeForm = fZ[1];   // null | "neu" | id
    var gZ = React.useState(null), einheit = gZ[0], setzeEinheit = gZ[1];
    React.useEffect(function () { var aktiv = true; if (!pr.projekt_id) { setzeProjekt(null); return; } projektLaden(pr.projekt_id).then(function (x) { if (aktiv) setzeProjekt(x); }); return function () { aktiv = false; }; }, [pr.projekt_id]);
    React.useEffect(function () { var aktiv = true; if (!pr.einheit_id) { setzeEinheit(null); return; } einheitLaden(pr.einheit_id).then(function (x) { if (aktiv) setzeEinheit(x); }); return function () { aktiv = false; }; }, [pr.einheit_id]);
    var grundrissUrl = einheit && einheit.grundriss_url || null;
    function speichern(m) {
      var neu = form === "neu" ? liste.concat([m]) : liste.map(function (x) { return x.id === m.id ? m : x; });
      p.aendern({ maengel: neu }); setzeForm(null);
    }
    var hk = function (id) { var k = projekt && projekt.kontakte.find(function (x) { return x.id === id; }); return k ? (k.firma || k.name) : null; };
    return E("div", { style: { marginBottom: 10 } },
      E("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: liste.length ? 6 : 0 } },
        E("div", { style: { fontSize: 12.5, fontWeight: 700, color: CI.blau } }, "Mängel", liste.length ? " (" + liste.length + ")" : ""),
        form ? null : E("button", { type: "button", onClick: function () { setzeForm("neu"); }, style: Object.assign({}, B.knopfGold, { fontSize: 12, padding: "5px 10px" }) }, "+ Mangel")),
      liste.map(function (m) {
        if (form === m.id) return E("div", { key: m.id, style: { marginBottom: 8 } }, E(MangelFormular, { wert: m, projekt: projekt, grundrissUrl: grundrissUrl, raumName: raum.name, fristTage: pr.frist_standard_tage, fertig: speichern, abbrechen: function () { setzeForm(null); } }));
        return E("div", { key: m.id, style: { display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", border: "1px solid " + CI.border, borderRadius: 8, marginBottom: 6, background: "#fff" } },
          E("div", { style: { flex: 1, minWidth: 0 } },
            E("div", { style: { fontWeight: 600, fontSize: 13 } }, m.titel, m.db_id ? E(B.Abzeichen, { farbe: "#1e7e34", style: { marginLeft: 8 } }, "angelegt") : null),
            E("div", { style: B.klein }, [m.gewerk, hk(m.projekt_kontakt_id), m.frist ? "Frist " + B.datumDe(m.frist) : null, (m.foto_data_urls || m.foto_pfade || []).length ? (m.foto_data_urls || m.foto_pfade).length + " Foto(s)" : null, m.grundriss_position ? "📍 im Grundriss" : null].filter(Boolean).join(" · ")),
            m.beschreibung ? E("div", { style: { fontSize: 12.5, marginTop: 3, whiteSpace: "pre-wrap" } }, m.beschreibung) : null),
          m.db_id ? null : E("div", { style: { display: "flex", gap: 4 } },
            E("button", { type: "button", onClick: function () { setzeForm(m.id); }, style: Object.assign({}, B.knopfLeer, { padding: "3px 8px", fontSize: 11.5 }) }, "Ändern"),
            E("button", { type: "button", onClick: function () { p.aendern({ maengel: liste.filter(function (x) { return x.id !== m.id; }) }); }, style: Object.assign({}, B.knopfRot, { padding: "3px 8px", fontSize: 11.5 }) }, "×")));
      }),
      form === "neu" ? E(MangelFormular, { projekt: projekt, grundrissUrl: grundrissUrl, raumName: raum.name, fristTage: pr.frist_standard_tage, fertig: speichern, abbrechen: function () { setzeForm(null); } }) : null);
  }

  // ---------------------------------------------------------------------------
  function alleMaengel(d) { var aus = []; (d.raeume || []).forEach(function (r) { (r.maengel || []).forEach(function (m) { aus.push(Object.assign({ raum: r.name }, m)); }); }); return aus; }

  function ImmoAbnahmeAbschluss(p) {
    var d = p.data;
    var lZ = React.useState(false), laeuft = lZ[0], setzeLaeuft = lZ[1];
    var eZ = React.useState(null), ergebnis = eZ[0], setzeErgebnis = eZ[1];
    var pdfRef = React.useRef(null);
    var zZ = React.useState(null), zugang = zZ[0], setzeZugang = zZ[1];
    var sZ = React.useState(false), gesendet = sZ[0], setzeGesendet = sZ[1];
    React.useEffect(function () { var aktiv = true; if (!d.zugang_id) { setzeZugang(null); return; } window._sb.from("projekt_zugaenge").select("id, anzeigename, email, kontakt_id").eq("id", d.zugang_id).maybeSingle().then(function (r) { if (aktiv) setzeZugang(r.data || null); }); return function () { aktiv = false; }; }, [d.zugang_id]);
    var maengel = alleMaengel(d), neue = maengel.filter(function (m) { return !m.db_id; });
    var typ = (window.IMMO_NEUBAU_TYPEN.find(function (x) { return x.id === d.protokoll_typ; }) || {}).label || "Abnahme";
    var fehlt = p.fehlt || [];
    var abgeschlossen = !!d.abgeschlossen_am;

    async function abschliessen() {
      if (!p.speichern) { B.hinweis("Speichern nicht verfügbar.", true); return; }
      setzeLaeuft(true); setzeErgebnis(null);
      try {
        var satz = await p.speichern(true);
        if (!satz || !satz.id) throw new Error("Das Protokoll ließ sich nicht speichern.");
        var pdf = await p.pdfErzeugen(satz);
        var dataUrl = pdf.output("datauristring");
        pdfRef.current = dataUrl;
        var name = (typ + "_" + (d.objekt_lage || d.objekt_adresse || "Protokoll") + "_" + (d.uebergabe_datum || B.heute()) + ".pdf").replace(/[^\w.\-äöüÄÖÜß ]+/g, "_");
        var r = await B.rufen("abnahme-abschliessen", { protokoll_id: satz.id, pdf_base64: dataUrl, pdf_name: name });
        setzeErgebnis(r);
        var neu = await window._sb.from("uebergabeprotokoll").select("*").eq("id", satz.id).single();
        if (neu.data) Object.keys(neu.data).forEach(function (k) { p.setFeld(k, neu.data[k]); });
        B.hinweis(typ + " abgeschlossen — " + r.maengel + " Mängel angelegt, " + r.handwerker_mails + " Handwerker-Mail(s).");
      } catch (e) { B.hinweis("Abschluss fehlgeschlagen: " + (e.message || e), true); }
      setzeLaeuft(false);
    }
    async function anKaeufer() {
      if (!zugang || !zugang.email) { B.hinweis("Der Käufer hat keine E-Mail-Adresse am Portalzugang.", true); return; }
      try {
        if (d.pdf_datei_id) await window._sb.from("projekt_dateien").update({ freigegeben: true, freigegeben_am: new Date().toISOString(), freigegeben_von: window._currentUserId || null }).eq("id", d.pdf_datei_id);
        var dataUrl = pdfRef.current;
        if (!dataUrl && p.pdfErzeugen) { var pdf = await p.pdfErzeugen(d); dataUrl = pdf.output("datauristring"); }
        var datei = dataUrl ? B.dataUrlZuFile(dataUrl, typ + "protokoll.pdf") : null;
        var text = "Guten Tag " + (zugang.anzeigename || "") + ",\n\nanbei erhalten Sie das Protokoll der " + typ + " vom " + B.datumDe(d.uebergabe_datum) + (d.objekt_lage ? " (" + d.objekt_lage + ")" : "") + ".\n" +
          (maengel.length ? "Die festgehaltenen Mängel (" + maengel.length + ") sind an die zuständigen Gewerke beauftragt; den Stand sehen Sie jederzeit in Ihrem Kundenbereich.\n" : "Es wurden keine Mängel festgehalten.\n") + "\nMit freundlichen Grüßen";
        window._epMailAn = { an: zugang.email, name: zugang.anzeigename || "", betreff: typ + "protokoll " + (d.objekt_lage || "") + " vom " + B.datumDe(d.uebergabe_datum), text: text, anhaenge: datei ? [datei] : [], immobilie_id: d.immobilie_id || null };
        if (d.projekt_id) await window._sb.from("projekt_aktivitaeten").insert({ projekt_id: d.projekt_id, zugang_id: d.zugang_id, typ: "protokoll_an_kaeufer", details: { protokoll_id: p.protokollId, typ: d.protokoll_typ } });
        if (d.immobilie_id || zugang.kontakt_id) await window._sb.from("vermerke").insert({ immobilie_id: d.immobilie_id || null, kontakt_id: zugang.kontakt_id || null, typ: "abnahme", titel: typ + "protokoll an Käufer gesendet", text: "Per E-Mail an " + zugang.email + " (Composer).", ref_tabelle: "uebergabeprotokoll", ref_id: p.protokollId || null, benutzer_id: window._currentUserId || null, quelle: "manuell" });
        setzeGesendet(true);
        if (typeof window.setView === "function") window.setView("posteingang");
      } catch (e) { B.hinweis("Versand nicht vorbereitet: " + (e.message || e), true); }
    }

    return E("div", { style: Object.assign({}, B.karte, { borderColor: CI.gold }) },
      E(B.Kopf, { titel: "🏗 " + typ + " abschließen" }, abgeschlossen ? E(B.Abzeichen, { farbe: "#1e7e34" }, "abgeschlossen " + B.zeitDe(d.abgeschlossen_am)) : null),
      E("div", { style: { fontSize: 13, lineHeight: 1.6 } },
        E("div", null, maengel.length ? maengel.length + " Mängel in " + (d.raeume || []).filter(function (r) { return (r.maengel || []).length; }).length + " Räumen" + (neue.length && abgeschlossen ? ", davon " + neue.length + " neu" : "") : "Keine Mängel festgehalten."),
        E("div", { style: B.klein }, "Beim Abschluss: PDF in die Projektdateien (noch nicht freigegeben), Mängel als Vorgänge mit Frist und To-do, Sammelmail je Handwerker, Glocke/Push an die Verwaltung. Der Käufer bekommt das Protokoll erst mit „An Käufer senden“.")),
      fehlt.length ? E("div", { style: Object.assign({}, B.klein, { color: CI.danger, marginTop: 6 }) }, "Vorher fehlt: " + fehlt.join(", ")) : null,
      E("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 } },
        E("button", { type: "button", onClick: abschliessen, disabled: laeuft || fehlt.length > 0 || (abgeschlossen && !neue.length), style: Object.assign({}, B.knopfGold, { opacity: laeuft || fehlt.length || (abgeschlossen && !neue.length) ? 0.5 : 1 }) },
          laeuft ? "… wird abgeschlossen" : abgeschlossen ? (neue.length ? "Nachgetragene Mängel verteilen" : "Abgeschlossen") : typ + " abschließen & verteilen"),
        abgeschlossen && d.zugang_id ? E("button", { type: "button", onClick: anKaeufer, style: B.knopf }, gesendet ? "✓ Entwurf im Posteingang" : "✉ An Käufer senden (Entwurf)") : null),
      ergebnis ? E("div", { style: { marginTop: 10, padding: 10, background: "#f1f8f1", border: "1px solid #cfe3cf", borderRadius: 8, fontSize: 12.5 } },
        E("div", null, "✓ ", ergebnis.maengel, " Mängel angelegt · ", ergebnis.handwerker_mails, " Handwerker-Mail(s)", ergebnis.pdf_datei_id ? " · PDF abgelegt" : ""),
        (ergebnis.mail_hinweise || []).map(function (h, i) { return E("div", { key: i, style: { color: "#7a5c00" } }, "⚠ ", h); })) : null);
  }

  // ---------------------------------------------------------------------------
  // Ins PDF (Hilfe der Vorlage): doc = jsPDF, raum, y, s(hoehe) = Seitenumbruch-Wächter, breite = Textbreite.
  function ImmoMaengelInsPdf(doc, raum, y, s, breite) {
    var liste = raum && raum.maengel || [];
    if (!liste.length) return y;
    s(8); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Mängel (" + liste.length + "):", 22, y); y += 5; doc.setFont("helvetica", "normal");
    liste.forEach(function (m, i) {
      var kopf = (i + 1) + ". " + (m.titel || "") + [m.gewerk ? " — " + m.gewerk : "", m.frist ? ", Frist " + B.datumDe(m.frist) : ""].join("");
      var zeilen = doc.splitTextToSize(kopf, breite - 6);
      zeilen.forEach(function (z) { s(5); doc.text(z, 24, y); y += 4.5; });
      if (m.beschreibung) { doc.setTextColor(80, 80, 80); doc.splitTextToSize(m.beschreibung, breite - 10).forEach(function (z) { s(5); doc.text(z, 28, y); y += 4.2; }); doc.setTextColor(0, 0, 0); }
      var fotos = m.foto_data_urls || [];
      if (fotos.length && typeof epPdfBildEinpassen === "function") {
        var b = 40, h = 30, x = 28, n = 0;
        fotos.slice(0, 6).forEach(function (f) { if (n > 0 && n % 3 === 0) { y += h + 3; x = 28; } s(h + 4); try { epPdfBildEinpassen(doc, f, x, y, b, h); } catch (e) { /* kein Bild */ } x += b + 3; n++; });
        y += h + 3;
      }
      y += 1.5;
    });
    return y;
  }

  window.ImmoProtokollVerknuepfung = ImmoProtokollVerknuepfung;
  window.ImmoRaumMaengel = ImmoRaumMaengel;
  window.ImmoAbnahmeAbschluss = ImmoAbnahmeAbschluss;
  window.ImmoMaengelInsPdf = ImmoMaengelInsPdf;
  window.ImmoBT.projektLaden = projektLaden;
  window.ImmoBT.alleMaengel = alleMaengel;
  window.ImmoBT.einheitLaden = einheitLaden;
})();
