// ============================================================================
// Bauträger-Paket v2 — Projekt-Cockpit und Wohnungsakte (fork_84–86)
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, klassische Laufzeit. Reiter „Cockpit“ im
// Neubau-Bereich der Vorlage (FORK-Regel in scripts/oberflaeche-zerlegen.py):
//
//   * ImmoNeubauCockpit — Einheiten × Gewerke mit Bautenstand, offene und
//     überfällige Mängel je Einheit/Gewerk/Handwerker, anstehende Abnahmen,
//     anforderbare Raten, Projekteinstellungen (Gewerke, Standardfrist,
//     Mahnung automatisch), QR-Sammeldruck. Alles aus den Verknüpfungen,
//     gelesen unter RLS mit supabase-js — keine eigene Function nötig.
//   * ImmoWohnungsakte — je Einheit: Käufer, CRM-Objekt, Räume, Bautenstand
//     (melden → Vorschlag für den Baufortschritt), Protokolle (Abnahme
//     starten: der Editor der Vorlage, vorbelegt), Termine (Abnahme planen),
//     Mängel, Dokumente, Zahlungsplan mit MaBV-Abschnitten und
//     Zahlungsanforderung als Entwurf, Zeitleiste, QR-Druck A6.
//   * ImmoMaengelTafel — die Mängelliste mit Verlauf, Fotos und den Aktionen
//     der Verwaltung (beauftragen, geprüft erledigt, zurück, ablehnen).
//
// Geld bleibt ein Klick: Zahlungsanforderungen gehen nie automatisch, Mails
// an Käufer nie automatisch (Composer-Entwurf).
// ============================================================================
(function () {
  "use strict";
  var B = window.ImmoBT, E = React.createElement, CI = B.CI;
  var etikett = { fontSize: 11.5, color: CI.muted, fontWeight: 600, marginBottom: 4, display: "block" };
  var zeile = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 10 };
  var th = { textAlign: "left", padding: "6px 8px", fontSize: 11, color: CI.muted, borderBottom: "1px solid " + CI.border, whiteSpace: "nowrap" };
  var td = { padding: "6px 8px", fontSize: 12.5, borderBottom: "1px solid " + CI.border, verticalAlign: "top" };
  var OFFEN = window.IMMO_MANGEL_OFFEN;
  var istOffen = function (m) { return OFFEN.indexOf(m.status) >= 0; };
  var istUeberfaellig = function (m) { return istOffen(m) && m.status !== "gemeldet_erledigt" && m.frist && m.frist < B.heute(); };
  var we = function (e) { return e ? "WE " + e.we_nr + (e.geschoss ? " · " + e.geschoss : "") : "–"; };
  var hkName = function (k) { return k ? (k.firma || k.name || k.gewerk || "?") : null; };
  var typName = function (t) { return (window.IMMO_NEUBAU_TYPEN.find(function (x) { return x.id === t; }) || {}).label || ({ einzug: "Übergabe", auszug: "Rückgabe" }[t] || t); };

  // --- Daten des Projekts, die der Neubau-Bereich der Vorlage nicht lädt -----------------------
  function useProjektDaten(projekt, einheiten) {
    var dZ = React.useState({ maengel: [], protokolle: [], bautenstand: [], zahlungsplan: [], termine: [], raten: [], laedt: true }), daten = dZ[0], setzeDaten = dZ[1];
    var laden = React.useCallback(async function () {
      if (!projekt) return;
      var immoIds = (einheiten || []).map(function (e) { return e.immobilie_id; }).filter(Boolean);
      var r = await Promise.all([
        window._sb.from("projekt_maengel").select("*").eq("projekt_id", projekt.id).order("created_at", { ascending: false }).limit(1000),
        window._sb.from("uebergabeprotokoll").select("id, protokoll_typ, uebergabe_datum, uebergabe_uhrzeit, status, einheit_id, zugang_id, abgeschlossen_am, pdf_datei_id, pdf_pfad, raeume, termin_id, ersteller_id").eq("projekt_id", projekt.id).order("uebergabe_datum", { ascending: false }),
        window._sb.from("projekt_bautenstand").select("*").eq("projekt_id", projekt.id).order("erreicht_am", { ascending: false }),
        window._sb.from("projekt_zahlungsplan").select("*").eq("projekt_id", projekt.id).order("position"),
        window._sb.from("termine").select("id, titel, datum, uhrzeit, ort, art, immobilie_id, kontakt_id, notiz, status").eq("art", "Abnahme").gte("datum", B.tageDazu(B.heute(), -30)).order("datum"),
        window._sb.rpc("rate_anforderbar", { p_projekt: projekt.id })
      ]);
      var termine = (r[4].data || []).filter(function (t) { return (t.notiz || "").indexOf("projekt:" + projekt.id) >= 0 || (t.immobilie_id && immoIds.indexOf(t.immobilie_id) >= 0); });
      setzeDaten({ maengel: r[0].data || [], protokolle: (r[1].data || []).map(function (p) { var x = Object.assign({}, p); x.maengel_anzahl = (x.raeume || []).reduce(function (s, rm) { return s + (rm.maengel || []).length; }, 0); delete x.raeume; return x; }),
        bautenstand: r[2].data || [], zahlungsplan: r[3].data || [], termine: termine, raten: r[5].data || [], laedt: false });
    }, [projekt && projekt.id, (einheiten || []).length]);
    React.useEffect(function () { laden(); }, [laden]);
    return [daten, laden];
  }
  function bautenstandJeEinheit(bautenstand, einheitId) {
    var max = 0; bautenstand.forEach(function (b) { if ((b.einheit_id === einheitId || !b.einheit_id) && b.abschnitt > max) max = b.abschnitt; }); return max;
  }

  // ---------------------------------------------------------------------------
  function MangelZeile(p) {
    var m = p.mangel, kontakte = p.kontakte || [], einheit = (p.einheiten || []).find(function (e) { return e.id === m.einheit_id; });
    var oZ = React.useState(false), offen = oZ[0], setzeOffen = oZ[1];
    var fZ = React.useState(null), fotos = fZ[0], setzeFotos = fZ[1];
    var aZ = React.useState(null), aktion = aZ[0], setzeAktion = aZ[1];   // null | "beauftragen" | "zurueck" | "ablehnen"
    var wZ = React.useState({}), werte = wZ[0], setzeWerte = wZ[1];
    var lZ = React.useState(false), laeuft = lZ[0], setzeLaeuft = lZ[1];
    var hk = kontakte.find(function (k) { return k.id === m.projekt_kontakt_id; });
    React.useEffect(function () {
      if (!offen || fotos) return;
      var aktiv = true;
      Promise.all((m.foto_pfade || []).concat(m.erledigt_fotos || []).slice(0, 12).map(B.signiert)).then(function (u) { if (aktiv) setzeFotos(u.filter(Boolean)); });
      return function () { aktiv = false; };
    }, [offen]);
    async function status(neu, extra) {
      setzeLaeuft(true);
      try {
        var r = await window._sb.from("projekt_maengel").update(Object.assign({ status: neu }, extra || {})).eq("id", m.id);
        if (r.error) throw r.error;
        B.hinweis("Status: " + (window.IMMO_MANGEL_STATUS[neu] || [neu])[0]); setzeAktion(null); p.neuLaden && p.neuLaden();
      } catch (e) { B.hinweis("Nicht gespeichert: " + (e.message || e), true); }
      setzeLaeuft(false);
    }
    async function rufen(aktionName, body) {
      setzeLaeuft(true);
      try {
        var r = await B.rufen("abnahme-abschliessen", Object.assign({ aktion: aktionName, mangel_id: m.id }, body));
        B.hinweis(r.mail ? "Mail an den Handwerker ist raus." : "Gespeichert — keine Mail: " + (r.hinweis || "")); setzeAktion(null); p.neuLaden && p.neuLaden();
      } catch (e) { B.hinweis(e.message || String(e), true); }
      setzeLaeuft(false);
    }
    var handwerker = kontakte.filter(function (k) { return !werte.gewerk || k.gewerk === werte.gewerk; });
    return E("div", { style: { border: "1px solid " + (istUeberfaellig(m) ? "#e5c5c2" : CI.border), borderRadius: 8, marginBottom: 6, background: istUeberfaellig(m) ? "#fff7f6" : "#fff" } },
      E("div", { style: { display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", cursor: "pointer", flexWrap: "wrap" }, onClick: function () { setzeOffen(!offen); } },
        E(B.StatusAbzeichen, { status: m.status }),
        E("div", { style: { flex: 1, minWidth: 160 } },
          E("div", { style: { fontWeight: 600, fontSize: 13 } }, m.titel),
          E("div", { style: B.klein }, [p.mitEinheit && einheit ? we(einheit) : null, m.raum, m.gewerk, hkName(hk), m.quelle === "kunde" ? "Kundenmeldung" : m.quelle === "bauleitung" ? "Bauleitung" : null].filter(Boolean).join(" · "))),
        m.frist ? E("div", { style: { fontSize: 12, color: istUeberfaellig(m) ? CI.danger : CI.muted, whiteSpace: "nowrap" } }, (istUeberfaellig(m) ? "überfällig · " : "Frist ") + B.datumDe(m.frist)) : null,
        m.termin_am ? E("div", { style: { fontSize: 12, color: "#2b6cb0", whiteSpace: "nowrap" } }, "Termin " + B.datumDe(m.termin_am)) : null,
        E("span", { style: B.klein }, offen ? "▴" : "▾")),
      offen ? E("div", { style: { padding: "0 10px 10px", fontSize: 12.5 } },
        m.beschreibung ? E("div", { style: { whiteSpace: "pre-wrap", marginBottom: 8 } }, m.beschreibung) : null,
        m.antwort ? E("div", { style: { marginBottom: 8, color: CI.muted } }, "Antwort an den Käufer: ", m.antwort) : null,
        fotos && fotos.length ? E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 } }, fotos.map(function (u, i) { return E("a", { key: i, href: u, target: "_blank", rel: "noopener" }, E("img", { src: u, alt: "", style: { width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid " + CI.border } })); })) : null,
        (m.verlauf || []).length ? E("div", { style: { marginBottom: 8 } }, E("div", { style: Object.assign({}, etikett, { marginBottom: 2 }) }, "Verlauf"),
          (m.verlauf || []).slice().reverse().slice(0, 12).map(function (v, i) { return E("div", { key: i, style: { fontSize: 12, padding: "2px 0", borderBottom: "1px dotted " + CI.border } }, E("span", { style: { color: CI.muted } }, B.zeitDe(v.am), " · ", v.wer, " · "), E("b", null, v.was === "status" ? (window.IMMO_MANGEL_STATUS[v.nach] || [v.nach])[0] : v.was), v.text ? " — " + v.text : ""); })) : null,
        istOffen(m) ? E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
          E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: function () { setzeWerte({ gewerk: m.gewerk || "", projekt_kontakt_id: m.projekt_kontakt_id || "", frist: m.frist || B.tageDazu(B.heute(), (p.projekt && p.projekt.frist_standard_tage) || 14) }); setzeAktion(aktion === "beauftragen" ? null : "beauftragen"); } }, m.status === "offen" ? "Gewerk zuordnen & beauftragen" : "Neu beauftragen"),
          m.status === "gemeldet_erledigt" ? E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: function () { setzeWerte({ text: "", frist: B.tageDazu(B.heute(), 7) }); setzeAktion(aktion === "zurueck" ? null : "zurueck"); } }, "Zurück an Handwerker") : null,
          E("button", { type: "button", disabled: laeuft, style: Object.assign({}, B.knopf, { fontSize: 12, background: "#1e7e34", borderColor: "#1e7e34" }), onClick: function () { if (confirm("Mangel als geprüft erledigt abschließen?")) status("geprueft_erledigt"); } }, "✓ Geprüft erledigt"),
          E("button", { type: "button", style: Object.assign({}, B.knopfRot, { fontSize: 12 }), onClick: function () { setzeWerte({ text: "" }); setzeAktion(aktion === "ablehnen" ? null : "ablehnen"); } }, "Ablehnen")) : null,
        aktion === "beauftragen" ? E("div", { style: { marginTop: 8, padding: 10, background: "#fbf7ee", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 } },
          E("div", { style: zeile },
            E("div", null, E("label", { style: etikett }, "Gewerk"), E(B.GewerkWahl, { projekt: p.projekt, kontakte: kontakte, value: werte.gewerk, onChange: function (g) { var k = kontakte.find(function (x) { return x.gewerk === g; }); setzeWerte(Object.assign({}, werte, { gewerk: g, projekt_kontakt_id: k ? k.id : "" })); } })),
            E("div", null, E("label", { style: etikett }, "Handwerker *"), E("select", { style: B.feld, value: werte.projekt_kontakt_id || "", onChange: function (e) { setzeWerte(Object.assign({}, werte, { projekt_kontakt_id: e.target.value })); } },
              E("option", { value: "" }, "— wählen —"), handwerker.map(function (k) { return E("option", { key: k.id, value: k.id }, hkName(k) + (k.gewerk ? " · " + k.gewerk : "") + (k.email ? "" : " (ohne E-Mail)")); }))),
            E("div", null, E("label", { style: etikett }, "Frist"), E("input", { type: "date", style: B.feld, value: werte.frist || "", onChange: function (e) { setzeWerte(Object.assign({}, werte, { frist: e.target.value })); } }))),
          E("div", { style: B.klein }, "Die Mail mit Token-Link geht automatisch an den Handwerker (Auftrag D)."),
          E("button", { type: "button", disabled: laeuft || !werte.projekt_kontakt_id, style: B.knopf, onClick: async function () {
            if (werte.gewerk && werte.gewerk !== m.gewerk) await window._sb.from("projekt_maengel").update({ gewerk: werte.gewerk }).eq("id", m.id);
            rufen("mangel_beauftragen", { projekt_kontakt_id: werte.projekt_kontakt_id, frist: werte.frist });
          } }, laeuft ? "…" : "Beauftragen & Mail senden")) : null,
        aktion === "zurueck" ? E("div", { style: { marginTop: 8, padding: 10, background: "#fbf7ee", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 } },
          E("textarea", { style: Object.assign({}, B.feld, { minHeight: 50 }), placeholder: "Begründung für den Handwerker", value: werte.text || "", onChange: function (e) { setzeWerte(Object.assign({}, werte, { text: e.target.value })); } }),
          E("div", { style: zeile }, E("div", null, E("label", { style: etikett }, "Neue Frist"), E("input", { type: "date", style: B.feld, value: werte.frist || "", onChange: function (e) { setzeWerte(Object.assign({}, werte, { frist: e.target.value })); } }))),
          E("button", { type: "button", disabled: laeuft, style: B.knopf, onClick: function () { rufen("mangel_zurueck", { text: werte.text, frist: werte.frist }); } }, "Zurückgeben & Mail senden")) : null,
        aktion === "ablehnen" ? E("div", { style: { marginTop: 8, padding: 10, background: "#fff7f6", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 } },
          E("textarea", { style: Object.assign({}, B.feld, { minHeight: 50 }), placeholder: m.quelle === "kunde" ? "Antwort an den Käufer (sieht er im Kundenportal)" : "Grund", value: werte.text || "", onChange: function (e) { setzeWerte(Object.assign({}, werte, { text: e.target.value })); } }),
          E("button", { type: "button", disabled: laeuft, style: B.knopfRot, onClick: function () { status("abgelehnt", { antwort: werte.text || null }); } }, "Als „kein Mangel“ ablehnen")) : null
      ) : null);
  }

  function ImmoMaengelTafel(p) {
    var fZ = React.useState("offen"), filter = fZ[0], setzeFilter = fZ[1];
    var gZ = React.useState(""), gewerk = gZ[0], setzeGewerk = gZ[1];
    var liste = (p.maengel || []).filter(function (m) { return !p.einheitId || m.einheit_id === p.einheitId; })
      .filter(function (m) { return filter === "alle" ? true : filter === "offen" ? istOffen(m) : filter === "ueberfaellig" ? istUeberfaellig(m) : filter === "pruefen" ? m.status === "gemeldet_erledigt" : !istOffen(m); })
      .filter(function (m) { return !gewerk || m.gewerk === gewerk; });
    var gewerke = []; (p.maengel || []).forEach(function (m) { if (m.gewerk && gewerke.indexOf(m.gewerk) < 0) gewerke.push(m.gewerk); });
    var chip = function (id, text) { return E("button", { key: id, type: "button", onClick: function () { setzeFilter(id); }, style: Object.assign({}, B.knopfLeer, { fontSize: 12, padding: "4px 10px", background: filter === id ? CI.blau : "#fff", color: filter === id ? "#fff" : CI.blau }) }, text); };
    var alle = (p.maengel || []).filter(function (m) { return !p.einheitId || m.einheit_id === p.einheitId; });
    return E("div", null,
      E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } },
        chip("offen", "Offen (" + alle.filter(istOffen).length + ")"), chip("ueberfaellig", "Überfällig (" + alle.filter(istUeberfaellig).length + ")"), chip("pruefen", "Zu prüfen (" + alle.filter(function (m) { return m.status === "gemeldet_erledigt"; }).length + ")"), chip("erledigt", "Erledigt"), chip("alle", "Alle (" + alle.length + ")"),
        gewerke.length ? E("select", { style: Object.assign({}, B.feld, { width: "auto", padding: "4px 8px", fontSize: 12 }), value: gewerk, onChange: function (e) { setzeGewerk(e.target.value); } }, E("option", { value: "" }, "Alle Gewerke"), gewerke.map(function (g) { return E("option", { key: g, value: g }, g); })) : null),
      liste.length ? liste.map(function (m) { return E(MangelZeile, { key: m.id, mangel: m, kontakte: p.kontakte, einheiten: p.einheiten, projekt: p.projekt, neuLaden: p.neuLaden, mitEinheit: !p.einheitId }); }) : E(B.Leer, null, "Keine Mängel in dieser Auswahl."));
  }

  // --- QR-Druck A6 ------------------------------------------------------------------------------------
  function qrLink(e) { return location.origin + location.pathname.replace(/[^/]*$/, "") + "?qr=" + e.qr_token; }
  function qrDruck(einheiten, projekt) {
    var J = window.jspdf && window.jspdf.jsPDF; if (!J || !window.qrcode) { B.hinweis("PDF- oder QR-Bibliothek nicht geladen.", true); return; }
    var doc = new J({ unit: "mm", format: "a6" }), bw = doc.internal.pageSize.getWidth();
    einheiten.forEach(function (e, idx) {
      if (idx > 0) doc.addPage();
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(27, 42, 71); doc.text(projekt.name || "", bw / 2, 16, { align: "center", maxWidth: bw - 16 });
      doc.setFontSize(26); doc.text("WE " + e.we_nr, bw / 2, 30, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(122, 130, 140); doc.text([e.geschoss, e.zimmer ? e.zimmer + " Zimmer" : null, e.wohnflaeche ? Number(e.wohnflaeche).toLocaleString("de-DE") + " m²" : null].filter(Boolean).join(" · "), bw / 2, 37, { align: "center" });
      var q = window.qrcode(0, "M"); q.addData(qrLink(e)); q.make();
      var n = q.getModuleCount(), groesse = 60, zelle = groesse / n, x0 = (bw - groesse) / 2, y0 = 44;
      doc.setFillColor(27, 42, 71);
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) doc.rect(x0 + c * zelle, y0 + r * zelle, zelle + 0.05, zelle + 0.05, "F");
      doc.setFontSize(9); doc.setTextColor(27, 42, 71); doc.text("Scannen: Wohnungsakte, Bautenstand, Mangel, Abnahme", bw / 2, y0 + groesse + 8, { align: "center", maxWidth: bw - 16 });
      doc.setFontSize(7); doc.setTextColor(122, 130, 140); doc.text("Ohne Anmeldung sichtbar: nur Projekt und Wohnungsnummer.", bw / 2, y0 + groesse + 13, { align: "center", maxWidth: bw - 16 });
    });
    doc.save("QR_" + (projekt.name || "Projekt").replace(/[^\w]+/g, "_") + (einheiten.length === 1 ? "_WE" + einheiten[0].we_nr : "_alle") + ".pdf");
  }

  // --- Cockpit -------------------------------------------------------------------------------------
  function ImmoNeubauCockpit(p) {
    var projekt = p.projekt, einheiten = p.einheiten || [], zugaenge = p.zugaenge || [], kontakte = (p.kontakte || []).filter(function (k) { return k.aktiv !== false; });
    var dl = useProjektDaten(projekt, einheiten), daten = dl[0], neuLaden = dl[1];
    var aZ = React.useState(window._immoAkteEinheit || null), akte = aZ[0], setzeAkte = aZ[1];
    var eZ = React.useState(false), einstellungen = eZ[0], setzeEinstellungen = eZ[1];
    var sZ = React.useState({ gewerke: (projekt.gewerke || []).join(", "), frist_standard_tage: projekt.frist_standard_tage || 14, mahnung_automatisch: !!projekt.mahnung_automatisch, qr_hinweis: projekt.qr_hinweis || "" }), einst = sZ[0], setzeEinst = sZ[1];
    var hZ = React.useState({ gewerk: "", kontakt: null }), neuerHk = hZ[0], setzeNeuerHk = hZ[1];
    async function handwerkerAusAdressbuch() {
      var k = neuerHk.kontakt; if (!k || !neuerHk.gewerk) return;
      var r = await window._sb.from("projekt_kontakte").insert({ projekt_id: projekt.id, gewerk: neuerHk.gewerk, firma: k.firma || null, name: [k.vorname, k.nachname].filter(Boolean).join(" ") || null, telefon: k.telefon || k.mobil || null, email: k.email || null, fuer_kunden: false, kontakt_id: k.id, sortierung: kontakte.length + 1 });
      if (r.error) { B.hinweis(r.error.message, true); return; }
      // Im Adressbuch die Rolle „Dienstleister / Handwerk“ ergänzen, wenn sie fehlt.
      var kr = await window._sb.from("kontakte").select("rollen").eq("id", k.id).maybeSingle();
      var rollen = (kr.data && kr.data.rollen) || [];
      if (rollen.indexOf("dienstleister") < 0) await window._sb.from("kontakte").update({ rollen: rollen.concat(["dienstleister"]) }).eq("id", k.id);
      B.hinweis((k.firma || k.nachname) + " als " + neuerHk.gewerk + " hinterlegt" + (k.email ? "." : " — ohne E-Mail, bitte im Adressbuch ergänzen."));
      setzeNeuerHk({ gewerk: "", kontakt: null }); p.neuLaden && p.neuLaden();
    }
    React.useEffect(function () { window._immoAkteEinheit = null; }, []);
    if (akte) {
      var e = einheiten.find(function (x) { return x.id === akte; });
      if (e) return E(ImmoWohnungsakte, { projekt: projekt, einheit: e, einheiten: einheiten, zugaenge: zugaenge, kontakte: kontakte, dateien: p.dateien, user: p.user, daten: daten, neuLaden: function () { neuLaden(); p.neuLaden && p.neuLaden(); }, zurueck: function () { setzeAkte(null); neuLaden(); } });
    }
    var gewerke = B.gewerkeListe(projekt, kontakte).filter(function (g) { return daten.maengel.some(function (m) { return m.gewerk === g; }); });
    var offenJe = function (einheitId, gewerk) { return daten.maengel.filter(function (m) { return istOffen(m) && (!einheitId || m.einheit_id === einheitId) && (!gewerk || m.gewerk === gewerk); }); };
    var kommende = daten.termine.filter(function (t) { return t.datum >= B.heute(); });
    var entwuerfe = daten.protokolle.filter(function (x) { return x.status !== "abgeschlossen"; });
    async function einstellungenSpeichern() {
      var r = await window._sb.from("projekte").update({ gewerke: einst.gewerke.split(",").map(function (s) { return s.trim(); }).filter(Boolean), frist_standard_tage: parseInt(einst.frist_standard_tage, 10) || 14, mahnung_automatisch: !!einst.mahnung_automatisch, qr_hinweis: einst.qr_hinweis || null }).eq("id", projekt.id);
      if (r.error) B.hinweis(r.error.message, true); else { B.hinweis("Einstellungen gespeichert."); setzeEinstellungen(false); p.neuLaden && p.neuLaden(); }
    }
    var kachel = function (zahl, text, farbe) { return E("div", { style: Object.assign({}, B.karte, { textAlign: "center", padding: 12 }) }, E("div", { style: { fontSize: 24, fontWeight: 700, color: farbe || CI.blau } }, zahl), E("div", { style: B.klein }, text)); };
    var leerStart = !daten.laedt && !daten.maengel.length && !daten.protokolle.length && !daten.bautenstand.length;
    return E("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
      leerStart ? E("div", { style: Object.assign({}, B.karte, { borderColor: CI.gold, background: "#fffdf8" }) },
        E("div", { style: { fontSize: 14, fontWeight: 700, color: CI.blau, marginBottom: 6 } }, "So geht es los"),
        E("ol", { style: { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 } },
          E("li", null, "Unter „Gewerke“ die Handwerker mit E-Mail anlegen, unter „Kunden-Zugänge“ den Käufer mit seiner Einheit."),
          E("li", null, "Eine Einheit in der Tabelle unten anklicken (oder „📁 Akte“ im Reiter Einheiten) — das ist die Wohnungsakte."),
          E("li", null, "Dort „📋 Abnahme starten“: Räume durchgehen, je Raum „+ Mangel“ (Diktat, Foto, Gewerk, Frist), unterschreiben, „Abnahme abschließen & verteilen“."),
          E("li", null, "Mängel, Fristen, Handwerker-Rückmeldungen und Raten laufen danach hier im Cockpit zusammen."))) : null,
      E("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 } },
        kachel(offenJe().length, "offene Mängel"), kachel(daten.maengel.filter(istUeberfaellig).length, "überfällig", CI.danger), kachel(daten.maengel.filter(function (m) { return m.status === "gemeldet_erledigt"; }).length, "zu prüfen", "#7a5c00"),
        kachel(kommende.length + entwuerfe.length, "anstehende Abnahmen"), kachel(daten.raten.length, "Raten anforderbar", "#1e7e34")),
      E("div", { style: B.karte },
        E(B.Kopf, { titel: "Einheiten × Gewerke" },
          E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: function () { qrDruck(einheiten.filter(function (e) { return e.qr_token; }), projekt); } }, "⬚ QR-Codes drucken (alle)"),
          E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: function () { setzeEinstellungen(!einstellungen); } }, "⚙ Einstellungen")),
        einstellungen ? E("div", { style: { padding: 10, background: "#fbf7ee", borderRadius: 8, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 } },
          E("div", null, E("label", { style: etikett }, "Gewerke des Projekts (feste Auswahl, mit Komma)"), E("input", { style: B.feld, value: einst.gewerke, onChange: function (e) { setzeEinst(Object.assign({}, einst, { gewerke: e.target.value })); }, placeholder: window.IMMO_GEWERKE_STANDARD.join(", ") })),
          E("div", { style: zeile },
            E("div", null, E("label", { style: etikett }, "Standardfrist Mängel (Tage)"), E("input", { type: "number", min: 1, style: B.feld, value: einst.frist_standard_tage, onChange: function (e) { setzeEinst(Object.assign({}, einst, { frist_standard_tage: e.target.value })); } })),
            E("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 18 } }, E("input", { type: "checkbox", checked: einst.mahnung_automatisch, onChange: function (e) { setzeEinst(Object.assign({}, einst, { mahnung_automatisch: e.target.checked })); } }), "Mahnung mit Nachfrist automatisch senden (sonst Entwurf zur Freigabe)")),
          E("div", null, E("label", { style: etikett }, "Hinweis für die Gewerke am QR-Code (ohne Anmeldung sichtbar, z. B. Bauzeiten, Ansprechpartner, Zufahrt)"), E("textarea", { style: Object.assign({}, B.feld, { minHeight: 56 }), value: einst.qr_hinweis, onChange: function (e) { setzeEinst(Object.assign({}, einst, { qr_hinweis: e.target.value })); } })),
          E("div", null, E("button", { type: "button", style: B.knopf, onClick: einstellungenSpeichern }, "Speichern")),
          E("div", { style: { borderTop: "1px solid " + CI.border, paddingTop: 10, marginTop: 4 } },
            E("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 6 } }, "Handwerker aus dem Adressbuch hinzufügen"),
            E("div", { style: zeile },
              E("div", null, E("label", { style: etikett }, "Gewerk"), E(B.GewerkWahl, { projekt: projekt, kontakte: kontakte, value: neuerHk.gewerk, onChange: function (g) { setzeNeuerHk(Object.assign({}, neuerHk, { gewerk: g })); } })),
              E("div", null, E("label", { style: etikett }, "Kontakt"), typeof KontaktSuchfeld === "function" ? E(KontaktSuchfeld, { value: neuerHk.kontakt ? neuerHk.kontakt.id : "", onChange: function (id, k) { setzeNeuerHk(Object.assign({}, neuerHk, { kontakt: k || null })); }, placeholder: "Firma oder Name suchen …", style: B.feld }) : E("span", { style: B.klein }, "Suchfeld nicht verfügbar")),
              E("div", { style: { display: "flex", alignItems: "flex-end" } }, E("button", { type: "button", style: B.knopf, disabled: !neuerHk.kontakt || !neuerHk.gewerk, onClick: handwerkerAusAdressbuch }, "Hinzufügen"))),
            E("div", { style: Object.assign({}, B.klein, { marginTop: 4 }) }, "Der Kontakt bekommt die Rolle „Dienstleister / Handwerk“ und erhält Aufträge, Erinnerungen und Mahnungen automatisch an seine E-Mail-Adresse."))) : null,
        E("div", { style: { overflowX: "auto" } }, E("table", { style: { width: "100%", borderCollapse: "collapse" } },
          E("thead", null, E("tr", null, E("th", { style: th }, "Einheit"), E("th", { style: th }, "Käufer"), E("th", { style: th }, "Bautenstand"), gewerke.map(function (g) { return E("th", { key: g, style: Object.assign({}, th, { textAlign: "center" }) }, g); }), E("th", { style: Object.assign({}, th, { textAlign: "center" }) }, "offen / überf."), E("th", { style: th }, "Abnahme"), E("th", { style: th }, ""))),
          E("tbody", null, einheiten.map(function (e) {
            var z = zugaenge.find(function (x) { return x.einheit_id === e.id && x.rolle === "kaeufer"; }) || zugaenge.find(function (x) { return x.einheit_id === e.id && x.rolle === "reserviert"; });
            var o = offenJe(e.id), u = o.filter(istUeberfaellig), bs = bautenstandJeEinheit(daten.bautenstand, e.id);
            var pr = daten.protokolle.find(function (x) { return x.einheit_id === e.id; }), t = kommende.find(function (x) { return (x.notiz || "").indexOf("einheit:" + e.id) >= 0 || (e.immobilie_id && x.immobilie_id === e.immobilie_id); });
            return E("tr", { key: e.id, style: { cursor: "pointer" }, onClick: function () { setzeAkte(e.id); } },
              E("td", { style: Object.assign({}, td, { fontWeight: 600 }) }, we(e)),
              E("td", { style: td }, z ? (z.anzeigename || z.email) + (z.rolle === "reserviert" ? " (res.)" : "") : E("span", { style: { color: CI.muted } }, "–")),
              E("td", { style: td }, bs ? E("span", { title: (window.IMMO_MABV[bs - 1] || {}).name }, bs + "/13 ", E("span", { style: B.klein }, (window.IMMO_MABV[bs - 1] || {}).name)) : E("span", { style: { color: CI.muted } }, "–")),
              gewerke.map(function (g) { var n = offenJe(e.id, g); var ue = n.filter(istUeberfaellig).length; return E("td", { key: g, style: Object.assign({}, td, { textAlign: "center", color: ue ? CI.danger : n.length ? CI.blau : CI.muted, fontWeight: n.length ? 700 : 400 }) }, n.length ? n.length + (ue ? " !" : "") : "·"); }),
              E("td", { style: Object.assign({}, td, { textAlign: "center" }) }, E("b", null, o.length), " / ", E("span", { style: { color: u.length ? CI.danger : CI.muted } }, u.length)),
              E("td", { style: td }, t ? E("span", { style: { color: "#2b6cb0" } }, "📅 " + B.datumDe(t.datum) + (t.uhrzeit ? " " + String(t.uhrzeit).slice(0, 5) : "")) : pr ? E("span", null, typName(pr.protokoll_typ) + " " + B.datumDe(pr.uebergabe_datum), pr.status !== "abgeschlossen" ? E(B.Abzeichen, { farbe: "#c17a2a", style: { marginLeft: 4 } }, "Entwurf") : null) : E("span", { style: { color: CI.muted } }, "–")),
              E("td", { style: td }, E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 11.5, padding: "3px 8px" }) }, "Akte →")));
          }))))),
      kontakte.length ? E("div", { style: B.karte }, E(B.Kopf, { titel: "Handwerker" }),
        E("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, kontakte.map(function (k) {
          var o = daten.maengel.filter(function (m) { return istOffen(m) && m.projekt_kontakt_id === k.id; }), u = o.filter(istUeberfaellig);
          return E("div", { key: k.id, style: { padding: "8px 10px", border: "1px solid " + (u.length ? "#e5c5c2" : CI.border), borderRadius: 8, fontSize: 12.5, minWidth: 160 } },
            E("div", { style: { fontWeight: 600 } }, hkName(k)), E("div", { style: B.klein }, k.gewerk, k.email ? "" : " · ohne E-Mail", k.kontakt_id ? " · Adressbuch" : ""),
            E("div", null, E("b", null, o.length), " offen", u.length ? E("span", { style: { color: CI.danger } }, " · " + u.length + " überfällig") : null, k.portal_token ? E("span", { style: B.klein }, " · Link aktiv") : null));
        }))) : null,
      daten.raten.length ? E("div", { style: Object.assign({}, B.karte, { borderColor: "#cfe3cf" }) }, E(B.Kopf, { titel: "Raten anforderbar (alle Bauabschnitte erreicht)" }),
        daten.raten.map(function (r) { var e = einheiten.find(function (x) { return x.id === r.einheit_id; }), z = zugaenge.find(function (x) { return x.id === r.zugang_id; });
          return E("div", { key: r.id, style: { display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid " + CI.border, fontSize: 12.5, flexWrap: "wrap" } },
            E("span", null, E("b", null, "Rate " + r.pos + ": " + r.bezeichnung), " · ", we(e), " · ", z ? (z.anzeigename || z.email) : "", " · Abschnitte " + (r.abschnitte || []).join(", ")),
            E("span", null, E("b", null, B.euro(r.betrag)), " ", E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 11.5, padding: "3px 8px" }), onClick: function () { setzeAkte(r.einheit_id); } }, "Zur Akte →"))); })) : null,
      E("div", { style: B.karte }, E(B.Kopf, { titel: "Mängel im Projekt" }), E(ImmoMaengelTafel, { maengel: daten.maengel, einheiten: einheiten, kontakte: kontakte, projekt: projekt, neuLaden: neuLaden })));
  }

  // --- Wohnungsakte ----------------------------------------------------------------------------------
  function ImmoWohnungsakte(p) {
    var projekt = p.projekt, e = p.einheit, daten = p.daten, kontakte = p.kontakte || [];
    var zugang = (p.zugaenge || []).find(function (x) { return x.einheit_id === e.id && x.rolle === "kaeufer"; }) || (p.zugaenge || []).find(function (x) { return x.einheit_id === e.id && x.rolle === "reserviert"; });
    var eZ = React.useState(null), editor = eZ[0], setzeEditor = eZ[1];   // null | {protokollId} | {neu: true}
    var rZ = React.useState((e.raeume || []).join(", ")), raeumeText = rZ[0], setzeRaeumeText = rZ[1];
    var bZ = React.useState(null), bautenstandForm = bZ[0], setzeBautenstandForm = bZ[1];
    var tZ = React.useState(null), terminForm = tZ[0], setzeTerminForm = tZ[1];
    var fZ = React.useState(null), firma = fZ[0], setzeFirma = fZ[1];
    var kZ = React.useState(null), kontakt = kZ[0], setzeKontakt = kZ[1];
    var zlZ = React.useState([]), zeitleiste = zlZ[0], setzeZeitleiste = zlZ[1];
    var dZ = React.useState([]), dokumente = dZ[0], setzeDokumente = dZ[1];
    var zpZ = React.useState(null), zpForm = zpZ[0], setzeZpForm = zpZ[1];
    var grZ = React.useState(null), grundrissUrl = grZ[0], setzeGrundrissUrl = grZ[1];
    var qhZ = React.useState(e.qr_hinweis || ""), qrHinweis = qhZ[0], setzeQrHinweis = qhZ[1];
    var kvZ = React.useState(null), kvVorschlag = kvZ[0], setzeKvVorschlag = kvZ[1];
    var kvlZ = React.useState(false), kvLaeuft = kvlZ[0], setzeKvLaeuft = kvlZ[1];
    var poZ = React.useState([]), post = poZ[0], setzePost = poZ[1];
    var sonder = Array.isArray(e.sonderleistungen) ? e.sonderleistungen : [];
    React.useEffect(function () { var aktiv = true; if (!e.grundriss_datei) { setzeGrundrissUrl(null); return; } B.signiert(e.grundriss_datei).then(function (u) { if (aktiv) setzeGrundrissUrl(u); }); return function () { aktiv = false; }; }, [e.grundriss_datei]);
    React.useEffect(function () {
      var aktiv = true;
      var mails = [];
      (p.zugaenge || []).filter(function (x) { return x.einheit_id === e.id && x.email; }).forEach(function (x) { mails.push(x.email.toLowerCase()); });
      kontakte.filter(function (k) { return k.email; }).forEach(function (k) { mails.push(k.email.toLowerCase()); });
      var teile = [];
      if (e.immobilie_id) teile.push("immobilie_id.eq." + e.immobilie_id);
      if (mails.length) teile.push("absender_email.in.(" + mails.map(function (m) { return '"' + m.replace(/"/g, "") + '"'; }).join(",") + ")");
      if (!teile.length) { setzePost([]); return; }
      window._sb.from("mail_eingang").select("id, absender_email, absender_name, betreff, gesendet_am, gelesen, immobilie_id").or(teile.join(",")).order("gesendet_am", { ascending: false }).limit(40)
        .then(function (r) { if (aktiv) setzePost(r.data || []); });
      return function () { aktiv = false; };
    }, [e.id, e.immobilie_id, kontakte.length]);
    React.useEffect(function () { window._sb.from("firma_stammdaten").select("firma_name, marken_name, strasse, plz, ort, email, telefon, bank_name, bank_iban, bank_bic").eq("aktiv", true).order("sortierung").limit(1).maybeSingle().then(function (r) { setzeFirma(r.data || null); }); }, []);
    React.useEffect(function () { if (!zugang || !zugang.kontakt_id) { setzeKontakt(null); return; } window._sb.from("kontakte").select("id, vorname, nachname, firma, strasse, plz, ort, email, telefon").eq("id", zugang.kontakt_id).maybeSingle().then(function (r) { setzeKontakt(r.data || null); }); }, [zugang && zugang.kontakt_id]);
    React.useEffect(function () {
      var aktiv = true;
      var zIds = (p.zugaenge || []).filter(function (x) { return x.einheit_id === e.id; }).map(function (x) { return x.id; });
      Promise.all([
        zIds.length ? window._sb.from("projekt_aktivitaeten").select("id, typ, details, created_at, zugang_id").eq("projekt_id", projekt.id).in("zugang_id", zIds).order("created_at", { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
        window._sb.from("projekt_aktivitaeten").select("id, typ, details, created_at, zugang_id").eq("projekt_id", projekt.id).is("zugang_id", null).order("created_at", { ascending: false }).limit(200),
        e.immobilie_id ? window._sb.from("vermerke").select("id, typ, titel, text, created_at").eq("immobilie_id", e.immobilie_id).order("created_at", { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
        window._sb.from("projekt_dateien").select("id, name, pfad, kategorie, created_at, freigegeben, zugang_id, einheit_id, groesse").eq("projekt_id", projekt.id).or("einheit_id.eq." + e.id + (zIds.length ? ",zugang_id.in.(" + zIds.join(",") + ")" : "")).order("created_at", { ascending: false })
      ]).then(function (r) {
        if (!aktiv) return;
        var akt = (r[0].data || []).concat((r[1].data || []).filter(function (a) { return a.details && (a.details.einheit_id === e.id || a.details.einheit === e.we_nr); }));
        var l = akt.map(function (a) { return { am: a.created_at, text: a.typ.replace(/_/g, " ") + (a.details && a.details.titel ? ": " + a.details.titel : "") }; })
          .concat((r[2].data || []).map(function (v) { return { am: v.created_at, text: "Vermerk · " + v.titel + (v.text ? " — " + v.text : "") }; }));
        l.sort(function (a, b) { return a.am < b.am ? 1 : -1; });
        setzeZeitleiste(l.slice(0, 80)); setzeDokumente(r[3].data || []);
      });
      return function () { aktiv = false; };
    }, [e.id, daten.maengel.length, daten.protokolle.length]);

    var maengel = daten.maengel.filter(function (m) { return m.einheit_id === e.id; }), protokolle = daten.protokolle.filter(function (x) { return x.einheit_id === e.id; });
    var bautenstand = daten.bautenstand.filter(function (b) { return b.einheit_id === e.id || !b.einheit_id; }), bs = bautenstandJeEinheit(daten.bautenstand, e.id);
    var termine = daten.termine.filter(function (t) { return (t.notiz || "").indexOf("einheit:" + e.id) >= 0 || (e.immobilie_id && t.immobilie_id === e.immobilie_id); });
    var zahlungsplan = daten.zahlungsplan.filter(function (z) { return z.einheit_id === e.id || (zugang && z.zugang_id === zugang.id); });
    var raten = daten.raten.filter(function (r) { return r.einheit_id === e.id || (zugang && r.zugang_id === zugang.id); });
    var adresse = [[projekt.strasse].filter(Boolean).join(" "), [projekt.plz, projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    var kName = kontakt ? ([kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") || kontakt.firma) : (zugang ? (zugang.anzeigename || zugang.email) : "");

    function protokollStarten(typ, termin) {
      window._immoProtokollVorbelegung = {
        kontext: "verkauf", protokoll_typ: typ || "neubau_abnahme", projekt_id: projekt.id, einheit_id: e.id, zugang_id: zugang ? zugang.id : null,
        kontakt_ids: kontakt ? [kontakt.id] : [], immobilie_id: e.immobilie_id || null, objekt_adresse: adresse, objekt_lage: "WE " + e.we_nr + (e.geschoss ? ", " + e.geschoss : ""),
        vermieter_name: firma ? (firma.firma_name || firma.marken_name || "") : "", vermieter_anschrift: firma ? [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")].filter(Boolean).join("\n") : "",
        mieter_name: kName || "", mieter_anschrift: kontakt ? [kontakt.strasse, [kontakt.plz, kontakt.ort].filter(Boolean).join(" ")].filter(Boolean).join("\n") : "",
        raeume: ((e.raeume && e.raeume.length) ? e.raeume : (typeof UEBERGABE_STANDARDRAEUME !== "undefined" ? UEBERGABE_STANDARDRAEUME : [])).map(function (n) { return { id: Date.now() + Math.random(), name: n, notizen: "", foto_data_urls: [], foto_pfade: [], maengel: [] }; }),
        frist_standard_tage: projekt.frist_standard_tage || 14, termin_id: termin ? termin.id : null,
        uebergabe_datum: termin ? termin.datum : B.heute(), uebergabe_uhrzeit: termin && termin.uhrzeit ? String(termin.uhrzeit).slice(0, 5) : ""
      };
      setzeEditor({ neu: true, typ: typ });
    }
    if (editor && typeof UebergabeprotokollEditor === "function") {
      return E("div", null, E(UebergabeprotokollEditor, { user: p.user, protokollId: editor.protokollId || null, kontext: "verkauf", onZurueck: function () { setzeEditor(null); p.neuLaden(); } }));
    }
    async function raeumeSpeichern() {
      var liste = raeumeText.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var r = await window._sb.from("projekt_einheiten").update({ raeume: liste }).eq("id", e.id);
      if (r.error) B.hinweis(r.error.message, true); else { e.raeume = liste; B.hinweis("Räume gespeichert."); p.neuLaden(); }
    }
    async function objektSetzen(id) {
      var r = await window._sb.from("projekt_einheiten").update({ immobilie_id: id || null }).eq("id", e.id);
      if (r.error) B.hinweis(r.error.message, true); else { e.immobilie_id = id || null; B.hinweis(id ? "CRM-Objekt verknüpft." : "Verknüpfung gelöst."); p.neuLaden(); }
    }
    async function bautenstandMelden() {
      var f = bautenstandForm; if (!f || !f.abschnitt) return;
      try {
        var pfade = [];
        for (var i = 0; i < (f.fotos || []).length; i++) {
          var datei = B.dataUrlZuFile(f.fotos[i], "bautenstand.jpg"); if (!datei) continue;
          var pfad = "bautenstand/" + projekt.id + "/" + Date.now() + "-" + i + ".jpg";
          var up = await window._sb.storage.from("projekt-dateien").upload(pfad, datei, { contentType: datei.type || "image/jpeg" });
          if (!up.error) pfade.push(pfad);
        }
        var r = await window._sb.from("projekt_bautenstand").insert({ projekt_id: projekt.id, einheit_id: f.ganzesHaus ? null : e.id, abschnitt: Number(f.abschnitt), erreicht_am: f.erreicht_am || B.heute(), foto_pfade: pfade, notiz: f.notiz || null, gemeldet_von: p.user && p.user.id || null }).select("id").single();
        if (r.error) throw r.error;
        if (e.immobilie_id) await window._sb.from("vermerke").insert({ immobilie_id: e.immobilie_id, typ: "bautenstand", titel: "Bautenstand: " + (window.IMMO_MABV[Number(f.abschnitt) - 1] || {}).name, text: (f.ganzesHaus ? "Ganzes Haus" : we(e)) + (f.notiz ? " — " + f.notiz : ""), benutzer_id: p.user && p.user.id || null, quelle: "manuell" });
        await window._sb.from("projekt_aktivitaeten").insert({ projekt_id: projekt.id, zugang_id: null, typ: "bautenstand_gemeldet", details: { einheit_id: f.ganzesHaus ? null : e.id, einheit: f.ganzesHaus ? null : e.we_nr, abschnitt: Number(f.abschnitt) } });
        B.hinweis("Bautenstand gemeldet." + (raten.length ? "" : " Raten werden geprüft …"));
        setzeBautenstandForm(Object.assign({}, f, { gemeldet: r.data.id, pfade: pfade }));
        p.neuLaden();
      } catch (x) { B.hinweis("Nicht gespeichert: " + (x.message || x), true); }
    }
    async function alsUpdate(f) {
      var name = (window.IMMO_MABV[Number(f.abschnitt) - 1] || {}).name;
      var r = await window._sb.from("projekt_updates").insert({ projekt_id: projekt.id, titel: "Bautenstand: " + name, text: (f.ganzesHaus ? "Für das gesamte Haus" : "Für " + we(e)) + " ist der Bauabschnitt „" + name + "“ erreicht (" + B.datumDe(f.erreicht_am || B.heute()) + ")." + (f.notiz ? "\n\n" + f.notiz : ""), bilder: f.pfade || [], sichtbarkeit: "interessent", erstellt_von: p.user && p.user.id || null });
      if (r.error) B.hinweis(r.error.message, true); else { B.hinweis("Als Baufortschritt veröffentlicht (Reiter Baufortschritt)."); setzeBautenstandForm(null); p.neuLaden(); }
    }
    async function terminAnlegen() {
      var f = terminForm; if (!f || !f.datum) return;
      var r = await window._sb.from("termine").insert({ titel: "Abnahme " + we(e) + " · " + projekt.name, datum: f.datum, uhrzeit: f.uhrzeit || null, ort: adresse || null, art: "Abnahme", immobilie_id: e.immobilie_id || null, kontakt_id: kontakt ? kontakt.id : null,
        ersteller_id: p.user && p.user.id || null, ersteller_name: p.user && p.user.name || null, teilnehmer: p.user && p.user.id ? [p.user.id] : [], notiz: "Abnahmetermin · projekt:" + projekt.id + " · einheit:" + e.id + (f.notiz ? "\n" + f.notiz : ""), quelle: "manuell" }).select("id").single();
      if (r.error) B.hinweis(r.error.message, true); else { B.hinweis("Abnahmetermin eingetragen."); setzeTerminForm(null); p.neuLaden(); }
    }
    async function zahlungsplanSpeichern() {
      var f = zpForm; if (!f) return;
      var satz = { projekt_id: projekt.id, zugang_id: f.zugang_id || (zugang && zugang.id), einheit_id: e.id, position: Number(f.position) || (zahlungsplan.length + 1), bezeichnung: f.bezeichnung || "Rate " + ((Number(f.position) || zahlungsplan.length + 1)), prozent: f.prozent === "" ? null : Number(f.prozent), betrag: f.betrag === "" ? null : Number(f.betrag), faellig_am: f.faellig_am || null, abschnitte: (f.abschnitte || []).map(Number).sort(function (a, b) { return a - b; }) };
      if (!satz.zugang_id) { B.hinweis("Für den Zahlungsplan braucht die Einheit einen Käufer (Portalzugang).", true); return; }
      if (!f.id && zahlungsplan.length >= 7) { B.hinweis("Höchstens sieben Raten je Käufer (MaBV / Kaufvertrag).", true); return; }
      var r = f.id ? await window._sb.from("projekt_zahlungsplan").update(satz).eq("id", f.id) : await window._sb.from("projekt_zahlungsplan").insert(satz);
      if (r.error) B.hinweis(r.error.message, true); else { B.hinweis("Rate gespeichert."); setzeZpForm(null); p.neuLaden(); }
    }
    async function zahlungsanforderung(r) {
      var J = window.jspdf && window.jspdf.jsPDF; if (!J) { B.hinweis("PDF-Bibliothek fehlt.", true); return; }
      var doc = new J({ unit: "mm", format: "a4" }), y = 20;
      var fn = firma ? (firma.firma_name || firma.marken_name || "") : "";
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(27, 42, 71); doc.text("Zahlungsanforderung", 20, y); y += 10;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
      [fn, adresse, "", "An: " + (kName || "") + (kontakt && kontakt.strasse ? ", " + kontakt.strasse + ", " + [kontakt.plz, kontakt.ort].filter(Boolean).join(" ") : ""), "", "Projekt: " + projekt.name + " · " + we(e), "Datum: " + B.datumDe(B.heute()), "",
        "Sehr geehrte Damen und Herren,", "", "nach § 3 Abs. 2 MaBV und dem Kaufvertrag ist die " + r.pos + ". Rate („" + r.bezeichnung + "“) fällig. Folgende Bauabschnitte sind erreicht:", ""].forEach(function (z) { doc.text(z, 20, y); y += 5.5; });
      (r.abschnitte || []).forEach(function (a) { var m = window.IMMO_MABV[a - 1] || {}; var b = bautenstand.find(function (x) { return x.abschnitt === a; }); doc.text("  • " + a + ". " + (m.name || "") + (b ? " — erreicht am " + B.datumDe(b.erreicht_am) : ""), 20, y); y += 5.5; });
      y += 3; doc.setFont("helvetica", "bold"); doc.text("Fälliger Betrag: " + B.euro(r.betrag) + (r.prozent ? " (" + r.prozent + " %)" : ""), 20, y); y += 8; doc.setFont("helvetica", "normal");
      ["Wir bitten um Überweisung innerhalb von 14 Tagen" + (firma && firma.bank_iban ? " auf das Konto:" : "."), firma && firma.bank_iban ? "  " + [firma.bank_name, "IBAN " + firma.bank_iban, firma.bank_bic ? "BIC " + firma.bank_bic : null].filter(Boolean).join(" · ") : "", "", "Mit freundlichen Grüßen", fn].forEach(function (z) { doc.text(z, 20, y); y += 5.5; });
      doc.setFontSize(8); doc.setTextColor(122, 130, 140); doc.text("Entwurf aus immoOffice — bitte vor dem Versand prüfen. Keine Rechtsberatung; MaBV-Hinweise beziehen sich auf § 3 Abs. 2.", 20, 285);
      var dataUrl = doc.output("datauristring"), datei = B.dataUrlZuFile(dataUrl, "Zahlungsanforderung_Rate" + r.pos + ".pdf");
      if (!zugang || !zugang.email) { doc.save("Zahlungsanforderung_Rate" + r.pos + ".pdf"); B.hinweis("Kein Käufer mit E-Mail — PDF heruntergeladen."); return; }
      window._epMailAn = { an: zugang.email, name: zugang.anzeigename || kName || "", betreff: "Zahlungsanforderung " + r.pos + ". Rate — " + projekt.name + " " + we(e), text: "Guten Tag " + (zugang.anzeigename || "") + ",\n\nanbei erhalten Sie die Zahlungsanforderung für die " + r.pos + ". Rate („" + r.bezeichnung + "“) über " + B.euro(r.betrag) + ". Die zugehörigen Bauabschnitte sind erreicht; Einzelheiten entnehmen Sie bitte dem Anhang.\n\nMit freundlichen Grüßen", anhaenge: datei ? [datei] : [], immobilie_id: e.immobilie_id || null };
      await window._sb.from("projekt_zahlungsplan").update({ angefordert_am: B.heute() }).eq("id", r.id);
      await window._sb.from("projekt_aktivitaeten").insert({ projekt_id: projekt.id, zugang_id: zugang.id, typ: "rate_angefordert", details: { einheit_id: e.id, einheit: e.we_nr, position: r.pos, betrag: r.betrag } });
      if (e.immobilie_id || (kontakt && kontakt.id)) await window._sb.from("vermerke").insert({ immobilie_id: e.immobilie_id || null, kontakt_id: kontakt ? kontakt.id : null, typ: "zahlung", titel: "Zahlungsanforderung Rate " + r.pos + " vorbereitet", text: B.euro(r.betrag) + " — Entwurf im Posteingang", benutzer_id: p.user && p.user.id || null, quelle: "manuell" });
      p.neuLaden();
      if (typeof window.setView === "function") window.setView("posteingang");
    }

    async function grundrissHochladen(ev) {
      var f = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (!f) return;
      try {
        var bild = await B.grundrissAlsPng(f);
        var pfad = "grundrisse/" + projekt.id + "/" + e.id + "/" + Date.now() + "." + (/png/i.test(bild.type) ? "png" : "jpg");
        var up = await window._sb.storage.from("projekt-dateien").upload(pfad, bild, { contentType: bild.type || "image/png" });
        if (up.error) throw up.error;
        var r = await window._sb.from("projekt_einheiten").update({ grundriss_datei: pfad }).eq("id", e.id);
        if (r.error) throw r.error;
        e.grundriss_datei = pfad; setzeGrundrissUrl(await B.signiert(pfad)); B.hinweis("Grundriss hinterlegt."); p.neuLaden();
      } catch (x) { B.hinweis("Grundriss nicht gespeichert: " + (x.message || x), true); }
    }
    async function qrHinweisSpeichern() {
      var r = await window._sb.from("projekt_einheiten").update({ qr_hinweis: qrHinweis || null }).eq("id", e.id);
      if (r.error) B.hinweis(r.error.message, true); else { e.qr_hinweis = qrHinweis; B.hinweis("Hinweis gespeichert."); }
    }
    async function qrUmschalten(d) {
      if (d.zugang_id) { B.hinweis("Persönliche Käuferdateien gehen nie über den QR-Code.", true); return; }
      var r = await window._sb.from("projekt_dateien").update({ qr_sichtbar: !d.qr_sichtbar }).eq("id", d.id);
      if (r.error) B.hinweis(r.error.message, true); else { setzeDokumente(dokumente.map(function (x) { return x.id === d.id ? Object.assign({}, x, { qr_sichtbar: !d.qr_sichtbar }) : x; })); }
    }
    async function unterlageFuerGewerke(ev) {
      var dateien = Array.from(ev.target.files || []); ev.target.value = ""; if (!dateien.length) return;
      for (var i = 0; i < dateien.length; i++) {
        var f = dateien[i], pfad = "gewerke/" + projekt.id + "/" + e.id + "/" + Date.now() + "-" + f.name.replace(/[^\w.\-]+/g, "_");
        var up = await window._sb.storage.from("projekt-dateien").upload(pfad, f, { contentType: f.type || "application/octet-stream" });
        if (up.error) { B.hinweis(up.error.message, true); continue; }
        var r = await window._sb.from("projekt_dateien").insert({ projekt_id: projekt.id, einheit_id: e.id, name: f.name, pfad: pfad, content_type: f.type || null, groesse: f.size, kategorie: "sonstiges", sichtbarkeit: "ausgewaehlt", hochgeladen_von: p.user && p.user.id || null, freigegeben: false, benachrichtigt: true, qr_sichtbar: true }).select("*").single();
        if (r.error) B.hinweis(r.error.message, true); else setzeDokumente([r.data].concat(dokumente));
      }
      B.hinweis("Unterlage für die Gewerke hinterlegt — über QR-Code und Handwerker-Link abrufbar, nicht im Kundenportal.");
    }
    async function standardplan() {
      if (!zugang) { B.hinweis("Für den Zahlungsplan braucht die Einheit einen Käufer (Portalzugang).", true); return; }
      if (zahlungsplan.length) { B.hinweis("Es gibt schon Raten — bitte einzeln bearbeiten.", true); return; }
      var kp = Number(e.kaufpreis) || 0;
      var zeilen = window.IMMO_RATEN_STANDARD.map(function (r) { var pz = B.ratenProzent(r.abschnitte); return { projekt_id: projekt.id, zugang_id: zugang.id, einheit_id: e.id, position: r.nr, bezeichnung: r.bezeichnung, prozent: pz, betrag: kp ? Math.round(kp * pz) / 100 : null, abschnitte: r.abschnitte }; });
      var r = await window._sb.from("projekt_zahlungsplan").insert(zeilen);
      if (r.error) B.hinweis(r.error.message, true); else { B.hinweis("Standardplan mit sieben Raten angelegt" + (kp ? " (Beträge aus dem Kaufpreis)." : " — Kaufpreis fehlt, Beträge bitte nachtragen.")); p.neuLaden(); }
    }
    async function kaufvertragHochladen(ev) {
      var f = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (!f) return;
      if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) { B.hinweis("Bitte den Kaufvertrag als PDF.", true); return; }
      var pfad = "kaufvertraege/" + projekt.id + "/" + e.id + "/" + Date.now() + ".pdf";
      var up = await window._sb.storage.from("projekt-dateien").upload(pfad, f, { contentType: "application/pdf" });
      if (up.error) { B.hinweis(up.error.message, true); return; }
      var r = await window._sb.from("projekt_einheiten").update({ kaufvertrag_datei: pfad }).eq("id", e.id);
      if (r.error) { B.hinweis(r.error.message, true); return; }
      e.kaufvertrag_datei = pfad; B.hinweis("Kaufvertrag hinterlegt. Jetzt „Auslesen“ — der Vorschlag kommt ins Formular."); p.neuLaden();
    }
    async function kaufvertragLesen() {
      if (!e.kaufvertrag_datei) return;
      setzeKvLaeuft(true);
      try {
        var r = await B.rufen("kaufvertrag-lesen", { einheit_id: e.id, pfad: e.kaufvertrag_datei });
        r.haken = { kaufpreis: !!(r.kaufpreis && r.kaufpreis.wert), raten: !!(r.raten && r.raten.length) && !zahlungsplan.length, sonder: !!(r.sonderleistungen && r.sonderleistungen.length) };
        setzeKvVorschlag(r);
      } catch (x) { B.hinweis("Kaufvertrag nicht gelesen: " + (x.message || x), true); }
      setzeKvLaeuft(false);
    }
    async function kaufvertragUebernehmen() {
      var v = kvVorschlag; if (!v) return;
      var patch = { kaufvertrag_daten: { kaufpreis: v.kaufpreis, kaufgegenstand: v.kaufgegenstand, uebergabe_bis: v.uebergabe_bis, fertigstellung_bis: v.fertigstellung_bis, notar: v.notar, urkunde: v.urkunde, vertragsdatum: v.vertragsdatum, raten: v.raten, gelesen_am: new Date().toISOString() } };
      if (v.haken.kaufpreis && v.kaufpreis.wert) patch.kaufpreis = v.kaufpreis.wert;
      if (v.haken.sonder) patch.sonderleistungen = sonder.concat(v.sonderleistungen.filter(function (s) { return !sonder.some(function (a) { return a.text === s.text; }); }));
      var r = await window._sb.from("projekt_einheiten").update(patch).eq("id", e.id);
      if (r.error) { B.hinweis(r.error.message, true); return; }
      Object.assign(e, patch);
      if (v.haken.raten && zugang && !zahlungsplan.length) {
        var zeilen = v.raten.slice(0, 7).map(function (x, i) { return { projekt_id: projekt.id, zugang_id: zugang.id, einheit_id: e.id, position: x.nr || i + 1, bezeichnung: x.bezeichnung || "Rate " + (i + 1), prozent: x.prozent, betrag: x.betrag != null ? x.betrag : (x.prozent && patch.kaufpreis ? Math.round(patch.kaufpreis * x.prozent) / 100 : null), abschnitte: x.abschnitte || [] }; });
        var rz = await window._sb.from("projekt_zahlungsplan").insert(zeilen);
        if (rz.error) B.hinweis("Raten nicht angelegt: " + rz.error.message, true);
      }
      if (e.immobilie_id) await window._sb.from("vermerke").insert({ immobilie_id: e.immobilie_id, kontakt_id: kontakt ? kontakt.id : null, typ: "kaufvertrag", titel: "Kaufvertrag ausgelesen und übernommen", text: [patch.kaufpreis ? "Kaufpreis " + B.euro(patch.kaufpreis) : null, v.raten && v.raten.length ? v.raten.length + " Raten" : null, v.sonderleistungen && v.sonderleistungen.length ? v.sonderleistungen.length + " Sonderleistungen" : null].filter(Boolean).join(" · "), benutzer_id: p.user && p.user.id || null, quelle: "manuell" });
      setzeKvVorschlag(null); B.hinweis("Übernommen."); p.neuLaden();
    }
    async function sonderUmschalten(i) {
      var neu = sonder.map(function (s, j) { return j === i ? Object.assign({}, s, { erledigt: !s.erledigt, erledigt_am: !s.erledigt ? B.heute() : null }) : s; });
      var r = await window._sb.from("projekt_einheiten").update({ sonderleistungen: neu }).eq("id", e.id);
      if (r.error) B.hinweis(r.error.message, true); else { e.sonderleistungen = neu; p.neuLaden(); }
    }
    async function sonderDazu() {
      var text = prompt("Sonderleistung / Sonderwunsch (wird in Akte und Abnahme geführt):", ""); if (!text) return;
      var neu = sonder.concat([{ text: text.trim(), betrag: null, erledigt: false, quelle: "manuell" }]);
      var r = await window._sb.from("projekt_einheiten").update({ sonderleistungen: neu }).eq("id", e.id);
      if (r.error) B.hinweis(r.error.message, true); else { e.sonderleistungen = neu; p.neuLaden(); }
    }
    var abschnitt = function (a) { var m = window.IMMO_MABV[a - 1] || {}; return a + ". " + m.name; };
    var block = function (titel, inhalt, rechts) { return E("div", { style: B.karte }, E(B.Kopf, { titel: titel }, rechts), inhalt); };
    return E("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
      E("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" } },
        E("div", null, E("button", { type: "button", style: B.knopfLeer, onClick: p.zurueck }, "← Cockpit"), E("span", { style: { marginLeft: 12, fontSize: 18, fontWeight: 700, color: CI.blau } }, "Wohnungsakte " + we(e)), E("span", { style: Object.assign({}, B.klein, { marginLeft: 8 }) }, projekt.name)),
        E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
          E("button", { type: "button", style: B.knopfGold, onClick: function () { protokollStarten("neubau_abnahme"); } }, "📋 Abnahme starten"),
          E("button", { type: "button", style: B.knopfLeer, onClick: function () { protokollStarten("neubau_vorabnahme"); } }, "Vorabnahme"),
          E("button", { type: "button", style: B.knopfLeer, onClick: function () { protokollStarten("neubau_nachabnahme"); } }, "Nachabnahme"),
          E("button", { type: "button", style: B.knopfLeer, onClick: function () { setzeBautenstandForm(bautenstandForm ? null : { abschnitt: "", erreicht_am: B.heute(), fotos: [], notiz: "", ganzesHaus: false }); } }, "🏗 Bautenstand melden"),
          E("button", { type: "button", style: B.knopfLeer, onClick: function () { setzeTerminForm(terminForm ? null : { datum: "", uhrzeit: "10:00", notiz: "" }); } }, "📅 Abnahme planen"),
          E("button", { type: "button", style: B.knopfLeer, onClick: function () { qrDruck([e], projekt); } }, "⬚ QR-Code"))),
      E("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 14 } },
        block("Käufer", zugang ? E("div", { style: { fontSize: 13, lineHeight: 1.6 } }, E("div", { style: { fontWeight: 600 } }, kName), E("div", null, zugang.email), kontakt && kontakt.telefon ? E("div", null, kontakt.telefon) : null, kontakt && kontakt.strasse ? E("div", { style: B.klein }, kontakt.strasse, ", ", [kontakt.plz, kontakt.ort].filter(Boolean).join(" ")) : null,
          E("div", { style: B.klein }, "Rolle: " + zugang.rolle + (zugang.kontakt_id ? " · im Adressbuch" : " · kein Adressbuch-Kontakt"))) : E(B.Leer, null, "Kein Käufer zugeordnet — Reiter Kunden-Zugänge.")),
        block("CRM-Objekt", E("div", null, typeof ObjektSuchfeld === "function" ? E(ObjektSuchfeld, { value: e.immobilie_id || "", onChange: function (id) { objektSetzen(id); }, placeholder: "Objekt im Bestand suchen …", style: B.feld }) : E("div", { style: B.klein }, e.immobilie_id || "–"),
          E("div", { style: Object.assign({}, B.klein, { marginTop: 4 }) }, "Verknüpft die Einheit mit dem Objekt im CRM: Vermerke, Termine und Protokolle landen dann an beiden Stellen."))),
        block("Räume (für Abnahme und Protokoll)", E("div", null, E("input", { style: B.feld, value: raeumeText, onChange: function (ev) { setzeRaeumeText(ev.target.value); }, placeholder: (typeof UEBERGABE_STANDARDRAEUME !== "undefined" ? UEBERGABE_STANDARDRAEUME : []).join(", ") }),
          E("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 6, alignItems: "center" } }, E("span", { style: B.klein }, "Mit Komma trennen. Leer = Standardräume."), E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: raeumeSpeichern }, "Speichern"))))),
      E("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 } },
        block("Grundriss & Mängelplan (für Gewerke, nicht im Käufer-Protokoll)", E("div", null,
          grundrissUrl ? E(B.GrundrissBild, { url: grundrissUrl, maxHeight: 420, marker: maengel.filter(function (m) { return m.grundriss_position && istOffen(m); }).map(function (m, i) { return { x: m.grundriss_position.x, y: m.grundriss_position.y, label: String(i + 1), farbe: istUeberfaellig(m) ? CI.danger : CI.blau }; }) }) : E(B.Leer, null, "Noch kein Grundriss. Bild oder PDF hochladen — dann lässt sich jeder Mangel bei der Abnahme im Grundriss markieren."),
          grundrissUrl ? E("ol", { style: { margin: "6px 0 0", paddingLeft: 18, fontSize: 12 } }, maengel.filter(function (m) { return m.grundriss_position && istOffen(m); }).map(function (m) { return E("li", { key: m.id }, m.titel, m.raum ? " · " + m.raum : "", m.gewerk ? " · " + m.gewerk : ""); })) : null,
          E("div", { style: { marginTop: 8 } }, E("label", { style: Object.assign({}, B.knopfLeer, { fontSize: 12, display: "inline-block" }) }, grundrissUrl ? "Grundriss ersetzen" : "📐 Grundriss hochladen", E("input", { type: "file", accept: "image/*,application/pdf", style: { display: "none" }, onChange: grundrissHochladen }))))),
        block("QR-Code dieser Tür: Hinweis für die Gewerke", E("div", null,
          E("textarea", { style: Object.assign({}, B.feld, { minHeight: 70 }), value: qrHinweis, onChange: function (ev) { setzeQrHinweis(ev.target.value); }, placeholder: "z. B. Elektro bitte erst nach Trockenbau; Schlüssel beim Bauleiter; Bauzeiten 7–17 Uhr" }),
          E("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 6, alignItems: "center" } }, E("span", { style: B.klein }, "Ohne Anmeldung sichtbar — einseitig, keine Antwortmöglichkeit. Keine Personendaten eintragen."), E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: qrHinweisSpeichern }, "Speichern"))))),
      bautenstandForm ? E("div", { style: Object.assign({}, B.karte, { borderColor: CI.gold }) }, E(B.Kopf, { titel: "Bautenstand melden (§ 3 Abs. 2 MaBV)" }),
        bautenstandForm.gemeldet ? E("div", null, E("div", { style: { marginBottom: 8, fontSize: 13 } }, "✓ Gemeldet: ", abschnitt(Number(bautenstandForm.abschnitt))), E("div", { style: { display: "flex", gap: 8 } }, E("button", { type: "button", style: B.knopf, onClick: function () { alsUpdate(bautenstandForm); } }, "Als Baufortschritt im Kundenportal veröffentlichen"), E("button", { type: "button", style: B.knopfLeer, onClick: function () { setzeBautenstandForm(null); } }, "Nicht veröffentlichen")))
        : E("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          E("div", { style: zeile },
            E("div", null, E("label", { style: etikett }, "Bauabschnitt *"), E("select", { style: B.feld, value: bautenstandForm.abschnitt, onChange: function (ev) { setzeBautenstandForm(Object.assign({}, bautenstandForm, { abschnitt: ev.target.value })); } }, E("option", { value: "" }, "— wählen —"), window.IMMO_MABV.map(function (m) { return E("option", { key: m.nr, value: m.nr, disabled: bautenstand.some(function (b) { return b.abschnitt === m.nr && (b.einheit_id === e.id || !b.einheit_id); }) }, m.nr + ". " + m.name + " (" + m.prozent + " %)"); }))),
            E("div", null, E("label", { style: etikett }, "Erreicht am"), E("input", { type: "date", style: B.feld, value: bautenstandForm.erreicht_am, onChange: function (ev) { setzeBautenstandForm(Object.assign({}, bautenstandForm, { erreicht_am: ev.target.value })); } })),
            E("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 18 } }, E("input", { type: "checkbox", checked: bautenstandForm.ganzesHaus, onChange: function (ev) { setzeBautenstandForm(Object.assign({}, bautenstandForm, { ganzesHaus: ev.target.checked })); } }), "Gilt für das ganze Haus")),
          E("textarea", { style: Object.assign({}, B.feld, { minHeight: 44 }), placeholder: "Notiz (optional)", value: bautenstandForm.notiz, onChange: function (ev) { setzeBautenstandForm(Object.assign({}, bautenstandForm, { notiz: ev.target.value })); } }),
          E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
            E("label", { style: Object.assign({}, B.knopfLeer, { fontSize: 12, display: "inline-block" }) }, "📷 Foto", E("input", { type: "file", accept: "image/*", capture: "environment", multiple: true, style: { display: "none" }, onChange: async function (ev) { var neu = []; for (var i = 0; i < ev.target.files.length; i++) neu.push(await B.fotoAlsDataUrl(ev.target.files[i])); setzeBautenstandForm(Object.assign({}, bautenstandForm, { fotos: bautenstandForm.fotos.concat(neu) })); ev.target.value = ""; } })),
            bautenstandForm.fotos.map(function (u, i) { return E("img", { key: i, src: u, alt: "", style: { width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid " + CI.border } }); }),
            E("span", { style: { flex: 1 } }), E("button", { type: "button", style: B.knopf, disabled: !bautenstandForm.abschnitt, onClick: bautenstandMelden }, "Melden")))) : null,
      terminForm ? E("div", { style: Object.assign({}, B.karte, { borderColor: CI.gold }) }, E(B.Kopf, { titel: "Abnahme planen" }),
        E("div", { style: zeile }, E("div", null, E("label", { style: etikett }, "Datum *"), E("input", { type: "date", style: B.feld, value: terminForm.datum, onChange: function (ev) { setzeTerminForm(Object.assign({}, terminForm, { datum: ev.target.value })); } })),
          E("div", null, E("label", { style: etikett }, "Uhrzeit"), E("input", { type: "time", style: B.feld, value: terminForm.uhrzeit, onChange: function (ev) { setzeTerminForm(Object.assign({}, terminForm, { uhrzeit: ev.target.value })); } })),
          E("div", null, E("label", { style: etikett }, "Notiz"), E("input", { style: B.feld, value: terminForm.notiz, onChange: function (ev) { setzeTerminForm(Object.assign({}, terminForm, { notiz: ev.target.value })); } }))),
        E("div", { style: { marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" } }, E("span", { style: B.klein }, "Erscheint im Kalender (Art „Abnahme“)" + (kontakt ? " und am Kontakt" : "") + (e.immobilie_id ? " und am Objekt" : "") + "; von dort und hier startet das Protokoll vorbelegt."), E("button", { type: "button", style: B.knopf, disabled: !terminForm.datum, onClick: terminAnlegen }, "Eintragen"))) : null,
      E("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 } },
        block("Bautenstand", E("div", null, E("div", { style: { fontSize: 13, marginBottom: 6 } }, bs ? E("span", null, E("b", null, bs + " / 13"), " — ", (window.IMMO_MABV[bs - 1] || {}).name) : E("span", { style: { color: CI.muted } }, "Noch kein Abschnitt gemeldet")),
          E("div", { style: { display: "flex", gap: 3, marginBottom: 8 } }, window.IMMO_MABV.map(function (m) { var da = bautenstand.some(function (b) { return b.abschnitt === m.nr; }); return E("div", { key: m.nr, title: m.nr + ". " + m.name, style: { flex: 1, height: 10, borderRadius: 3, background: da ? "#1e7e34" : "#eceff3" } }); })),
          bautenstand.slice(0, 6).map(function (b) { return E("div", { key: b.id, style: { fontSize: 12, padding: "3px 0", borderBottom: "1px dotted " + CI.border } }, B.datumDe(b.erreicht_am), " · ", abschnitt(b.abschnitt), b.einheit_id ? "" : " (Haus)", b.notiz ? " — " + b.notiz : ""); }))),
        block("Protokolle & Termine", E("div", null,
          termine.filter(function (t) { return t.datum >= B.heute(); }).map(function (t) { return E("div", { key: t.id, style: { display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid " + CI.border, fontSize: 12.5, alignItems: "center" } }, E("span", null, "📅 ", B.datumDe(t.datum), t.uhrzeit ? " " + String(t.uhrzeit).slice(0, 5) : "", " · ", t.titel), E("button", { type: "button", style: Object.assign({}, B.knopfGold, { fontSize: 11.5, padding: "3px 8px" }), onClick: function () { protokollStarten("neubau_abnahme", t); } }, "Protokoll starten")); }),
          protokolle.map(function (x) { return E("div", { key: x.id, style: { display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid " + CI.border, fontSize: 12.5, alignItems: "center", flexWrap: "wrap" } },
            E("span", null, E("b", null, typName(x.protokoll_typ)), " ", B.datumDe(x.uebergabe_datum), " · ", x.maengel_anzahl, " Mängel ", x.status === "abgeschlossen" ? E(B.Abzeichen, { farbe: "#1e7e34" }, "abgeschlossen") : E(B.Abzeichen, { farbe: "#c17a2a" }, "Entwurf")),
            E("span", { style: { display: "flex", gap: 4 } }, x.pdf_pfad ? E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 11.5, padding: "3px 8px" }), onClick: async function () { var u = await B.signiert(x.pdf_pfad); if (u) window.open(u, "_blank"); } }, "PDF") : null, E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 11.5, padding: "3px 8px" }), onClick: function () { setzeEditor({ protokollId: x.id }); } }, "Öffnen"))); }),
          !termine.length && !protokolle.length ? E(B.Leer, null, "Noch kein Protokoll, kein Termin.") : null))),
      block("Mängel " + we(e), E(ImmoMaengelTafel, { maengel: daten.maengel, einheitId: e.id, einheiten: p.einheiten, kontakte: kontakte, projekt: projekt, neuLaden: p.neuLaden })),
      E("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 } },
        block("Dokumente", E("div", null, dokumente.length ? dokumente.map(function (d) { return E("div", { key: d.id, style: { display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid " + CI.border, fontSize: 12.5, alignItems: "center", flexWrap: "wrap" } },
            E("a", { href: "#", onClick: async function (ev) { ev.preventDefault(); var u = await B.signiert(d.pfad); if (u) window.open(u, "_blank"); }, style: { color: CI.blau } }, d.name),
            E("span", { style: { display: "flex", gap: 6, alignItems: "center" } }, E("span", { style: B.klein }, (d.zugang_id ? "persönlich · " : "") + (d.freigegeben ? "Käufer" : "intern") + " · " + B.datumDe(d.created_at)),
              d.zugang_id ? null : E("button", { type: "button", title: "Über den QR-Code an der Tür ohne Anmeldung abrufbar", onClick: function () { qrUmschalten(d); }, style: Object.assign({}, B.knopfLeer, { fontSize: 11, padding: "2px 7px", background: d.qr_sichtbar ? CI.blau : "#fff", color: d.qr_sichtbar ? "#fff" : CI.blau }) }, d.qr_sichtbar ? "⬚ QR an" : "QR aus"))); }) : E(B.Leer, null, "Keine Dokumente an dieser Einheit."),
          E("div", { style: { marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } }, E("label", { style: Object.assign({}, B.knopfLeer, { fontSize: 12, display: "inline-block" }) }, "＋ Unterlage für die Gewerke", E("input", { type: "file", multiple: true, style: { display: "none" }, onChange: unterlageFuerGewerke })), E("span", { style: B.klein }, "Landet mit „QR an“ ohne Anmeldung am Türcode und im Handwerker-Link — nicht im Kundenportal.")))),
        block("Zahlungsplan (MaBV)", E("div", null,
          zahlungsplan.length ? E("table", { style: { width: "100%", borderCollapse: "collapse" } }, E("thead", null, E("tr", null, E("th", { style: th }, "#"), E("th", { style: th }, "Rate"), E("th", { style: th }, "Abschnitte"), E("th", { style: Object.assign({}, th, { textAlign: "right" }) }, "Betrag"), E("th", { style: th }, "Status"), E("th", { style: th }, ""))),
            E("tbody", null, zahlungsplan.map(function (z) { var r = raten.find(function (x) { return x.id === z.id; }); return E("tr", { key: z.id },
              E("td", { style: td }, z.position), E("td", { style: td }, z.bezeichnung, z.faellig_am ? E("div", { style: B.klein }, "fällig " + B.datumDe(z.faellig_am)) : null), E("td", { style: td }, (z.abschnitte || []).join(", ") || "–"), E("td", { style: Object.assign({}, td, { textAlign: "right" }) }, B.euro(z.betrag), z.prozent ? E("div", { style: B.klein }, z.prozent + " %") : null),
              E("td", { style: td }, z.bezahlt_am ? E(B.Abzeichen, { farbe: "#1e7e34" }, "bezahlt " + B.datumDe(z.bezahlt_am)) : z.angefordert_am ? E(B.Abzeichen, { farbe: "#2b6cb0" }, "angefordert " + B.datumDe(z.angefordert_am)) : r ? E(B.Abzeichen, { farbe: "#1e7e34" }, "anforderbar") : E(B.Abzeichen, { farbe: "#c17a2a" }, z.status)),
              E("td", { style: td }, E("div", { style: { display: "flex", gap: 4 } }, r ? E("button", { type: "button", style: Object.assign({}, B.knopfGold, { fontSize: 11.5, padding: "3px 8px" }), onClick: function () { zahlungsanforderung(r); } }, "Anforderung (Entwurf)") : null,
                z.angefordert_am && !z.bezahlt_am ? E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 11.5, padding: "3px 8px" }), onClick: async function () { await window._sb.from("projekt_zahlungsplan").update({ status: "bezahlt", bezahlt_am: B.heute() }).eq("id", z.id); p.neuLaden(); } }, "Bezahlt") : null,
                E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 11.5, padding: "3px 8px" }), onClick: function () { setzeZpForm({ id: z.id, position: z.position, bezeichnung: z.bezeichnung, prozent: z.prozent == null ? "" : z.prozent, betrag: z.betrag == null ? "" : z.betrag, faellig_am: z.faellig_am || "", abschnitte: z.abschnitte || [], zugang_id: z.zugang_id }); } }, "✎")))); })))
            : E(B.Leer, null, "Noch kein Zahlungsplan. Bis zu sieben Raten; jede bündelt Bauabschnitte nach § 3 Abs. 2 MaBV."),
          E("div", { style: { marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" } }, E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: function () { setzeZpForm(zpForm ? null : { position: zahlungsplan.length + 1, bezeichnung: "", prozent: "", betrag: "", faellig_am: "", abschnitte: [], zugang_id: zugang && zugang.id }); } }, zpForm ? "Abbrechen" : "+ Rate"),
            !zahlungsplan.length ? E("button", { type: "button", style: Object.assign({}, B.knopfGold, { fontSize: 12 }), onClick: standardplan, title: window.IMMO_RATEN_STANDARD.map(function (r) { return r.nr + ". " + r.bezeichnung + " (" + B.ratenProzent(r.abschnitte) + " %)"; }).join("\n") }, "Standardplan: 7 Raten aus 13 Abschnitten") : null),
          zpForm ? E("div", { style: { marginTop: 8, padding: 10, background: "#fbf7ee", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 } },
            E("div", { style: zeile }, E("div", null, E("label", { style: etikett }, "Nr."), E("input", { type: "number", min: 1, max: 7, style: B.feld, value: zpForm.position, onChange: function (ev) { setzeZpForm(Object.assign({}, zpForm, { position: ev.target.value })); } })),
              E("div", null, E("label", { style: etikett }, "Bezeichnung"), E("input", { style: B.feld, value: zpForm.bezeichnung, onChange: function (ev) { setzeZpForm(Object.assign({}, zpForm, { bezeichnung: ev.target.value })); }, placeholder: "z. B. Rohbau fertig" })),
              E("div", null, E("label", { style: etikett }, "Prozent"), E("input", { type: "number", step: "0.1", style: B.feld, value: zpForm.prozent, onChange: function (ev) { var pz = ev.target.value; var patch = { prozent: pz }; if (pz !== "" && e.kaufpreis) patch.betrag = Math.round(Number(e.kaufpreis) * Number(pz)) / 100; setzeZpForm(Object.assign({}, zpForm, patch)); } })),
              E("div", null, E("label", { style: etikett }, "Betrag €"), E("input", { type: "number", step: "0.01", style: B.feld, value: zpForm.betrag, onChange: function (ev) { setzeZpForm(Object.assign({}, zpForm, { betrag: ev.target.value })); } })),
              E("div", null, E("label", { style: etikett }, "Fällig (optional)"), E("input", { type: "date", style: B.feld, value: zpForm.faellig_am, onChange: function (ev) { setzeZpForm(Object.assign({}, zpForm, { faellig_am: ev.target.value })); } }))),
            E("div", null, E("label", { style: etikett }, "Bauabschnitte dieser Rate (MaBV, Summe der Höchstsätze: " + (zpForm.abschnitte || []).reduce(function (s, a) { return s + ((window.IMMO_MABV[a - 1] || {}).prozent || 0); }, 0).toFixed(1) + " %)"),
              E("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } }, window.IMMO_MABV.map(function (m) { var an = (zpForm.abschnitte || []).indexOf(m.nr) >= 0; var belegt = zahlungsplan.some(function (z) { return z.id !== zpForm.id && (z.abschnitte || []).indexOf(m.nr) >= 0; }); return E("button", { key: m.nr, type: "button", disabled: belegt && !an, title: m.name + (belegt ? " — schon in einer anderen Rate" : ""), onClick: function () { setzeZpForm(Object.assign({}, zpForm, { abschnitte: an ? zpForm.abschnitte.filter(function (x) { return x !== m.nr; }) : zpForm.abschnitte.concat([m.nr]) })); }, style: Object.assign({}, B.knopfLeer, { fontSize: 11.5, padding: "3px 8px", background: an ? CI.blau : belegt ? "#f1f3f6" : "#fff", color: an ? "#fff" : belegt ? CI.muted : CI.blau }) }, m.nr + ". " + m.name.split(" ").slice(0, 2).join(" ")); }))),
            E("div", null, E("button", { type: "button", style: B.knopf, onClick: zahlungsplanSpeichern }, "Speichern"))) : null))),
      E("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 } },
        block("Kaufvertrag", E("div", null,
          E("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 } },
            E("label", { style: Object.assign({}, B.knopfLeer, { fontSize: 12, display: "inline-block" }) }, e.kaufvertrag_datei ? "Kaufvertrag ersetzen" : "📄 Kaufvertrag (PDF) hochladen", E("input", { type: "file", accept: "application/pdf", style: { display: "none" }, onChange: kaufvertragHochladen })),
            e.kaufvertrag_datei ? E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: async function () { var u = await B.signiert(e.kaufvertrag_datei); if (u) window.open(u, "_blank"); } }, "Öffnen") : null,
            e.kaufvertrag_datei ? E("button", { type: "button", style: Object.assign({}, B.knopfGold, { fontSize: 12 }), disabled: kvLaeuft, onClick: kaufvertragLesen }, kvLaeuft ? "… liest" : "Auslesen (KI, 3 Credits)") : null),
          e.kaufvertrag_daten ? E("div", { style: { fontSize: 12.5, lineHeight: 1.6 } },
            e.kaufvertrag_daten.kaufpreis && e.kaufvertrag_daten.kaufpreis.wert ? E("div", null, "Kaufpreis laut Vertrag: ", E("b", null, B.euro(e.kaufvertrag_daten.kaufpreis.wert))) : null,
            e.kaufvertrag_daten.uebergabe_bis && e.kaufvertrag_daten.uebergabe_bis.wert ? E("div", null, "Übergabe bis: ", B.datumDe(e.kaufvertrag_daten.uebergabe_bis.wert)) : null,
            e.kaufvertrag_daten.notar && e.kaufvertrag_daten.notar.wert ? E("div", null, "Notar: ", e.kaufvertrag_daten.notar.wert, e.kaufvertrag_daten.urkunde && e.kaufvertrag_daten.urkunde.wert ? " · " + e.kaufvertrag_daten.urkunde.wert : "") : null,
            E("div", { style: B.klein }, "Ausgelesen " + B.zeitDe(e.kaufvertrag_daten.gelesen_am) + " — Vorschlag der KI, im Formular bestätigt.")) : E("div", { style: B.klein }, "Kaufpreis, Raten, Übergabetermin und vereinbarte Sonderleistungen werden ausgelesen und als Vorschlag gezeigt. Nichts wird ungeprüft übernommen."),
          kvVorschlag ? E("div", { style: { marginTop: 8, padding: 10, background: "#fbf7ee", borderRadius: 8, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6 } },
            E("div", { style: { fontWeight: 600 } }, "Vorschlag aus dem Kaufvertrag — übernehmen?"),
            kvVorschlag.kaufpreis && kvVorschlag.kaufpreis.wert ? E("label", { style: { display: "flex", gap: 8 } }, E("input", { type: "checkbox", checked: kvVorschlag.haken.kaufpreis, onChange: function (ev) { setzeKvVorschlag(Object.assign({}, kvVorschlag, { haken: Object.assign({}, kvVorschlag.haken, { kaufpreis: ev.target.checked }) })); } }), E("span", null, "Kaufpreis ", E("b", null, B.euro(kvVorschlag.kaufpreis.wert)), E("div", { style: B.klein }, "Beleg: ", kvVorschlag.kaufpreis.beleg))) : E("div", { style: B.klein }, "Kein Kaufpreis mit Beleg gefunden."),
            kvVorschlag.raten && kvVorschlag.raten.length ? E("label", { style: { display: "flex", gap: 8 } }, E("input", { type: "checkbox", checked: kvVorschlag.haken.raten, disabled: !!zahlungsplan.length || !zugang, onChange: function (ev) { setzeKvVorschlag(Object.assign({}, kvVorschlag, { haken: Object.assign({}, kvVorschlag.haken, { raten: ev.target.checked }) })); } }), E("span", null, kvVorschlag.raten.length + " Raten als Zahlungsplan anlegen" + (zahlungsplan.length ? " (es gibt schon einen Plan)" : !zugang ? " (kein Käufer zugeordnet)" : ""), E("div", { style: B.klein }, kvVorschlag.raten.map(function (r) { return r.nr + ". " + r.bezeichnung + (r.prozent ? " " + r.prozent + " %" : "") + (r.abschnitte && r.abschnitte.length ? " [" + r.abschnitte.join(",") + "]" : ""); }).join(" · ")))) : null,
            kvVorschlag.sonderleistungen && kvVorschlag.sonderleistungen.length ? E("label", { style: { display: "flex", gap: 8 } }, E("input", { type: "checkbox", checked: kvVorschlag.haken.sonder, onChange: function (ev) { setzeKvVorschlag(Object.assign({}, kvVorschlag, { haken: Object.assign({}, kvVorschlag.haken, { sonder: ev.target.checked }) })); } }), E("span", null, kvVorschlag.sonderleistungen.length + " Sonderleistungen in die Liste", E("ul", { style: { margin: "4px 0 0", paddingLeft: 18 } }, kvVorschlag.sonderleistungen.map(function (s, i) { return E("li", { key: i }, s.text, s.betrag ? " (" + B.euro(s.betrag) + ")" : "", E("div", { style: B.klein }, s.beleg)); })))) : E("div", { style: B.klein }, "Keine Sonderleistungen gefunden."),
            (kvVorschlag.hinweise || []).map(function (h, i) { return E("div", { key: i, style: { color: "#7a5c00" } }, "⚠ ", h); }),
            E("div", { style: { display: "flex", gap: 6 } }, E("button", { type: "button", style: B.knopf, onClick: kaufvertragUebernehmen }, "Übernehmen"), E("button", { type: "button", style: B.knopfLeer, onClick: function () { setzeKvVorschlag(null); } }, "Verwerfen"))) : null)),
        block("Sonderleistungen (dürfen nicht untergehen)", E("div", null,
          sonder.length ? sonder.map(function (s, i) { return E("label", { key: i, style: { display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", borderBottom: "1px dotted " + CI.border, fontSize: 12.5, cursor: "pointer" } }, E("input", { type: "checkbox", checked: !!s.erledigt, onChange: function () { sonderUmschalten(i); } }), E("span", { style: { textDecoration: s.erledigt ? "line-through" : "none", color: s.erledigt ? CI.muted : "inherit" } }, s.text, s.betrag ? " (" + B.euro(s.betrag) + ")" : "", E("div", { style: B.klein }, (s.quelle === "kaufvertrag" ? "aus dem Kaufvertrag" : "manuell") + (s.beleg ? " · " + s.beleg : "") + (s.erledigt_am ? " · erledigt " + B.datumDe(s.erledigt_am) : "")))); }) : E(B.Leer, null, "Keine Sonderleistungen hinterlegt. Sie kommen aus dem Kaufvertrag oder von Hand und erscheinen bei der Abnahme."),
          E("div", { style: { marginTop: 8 } }, E("button", { type: "button", style: Object.assign({}, B.knopfLeer, { fontSize: 12 }), onClick: sonderDazu }, "+ Sonderleistung"))),
          null),
        block("Post zu dieser Einheit", post.length ? E("div", null, post.map(function (m) { return E("div", { key: m.id, style: { display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid " + CI.border, fontSize: 12.5, cursor: "pointer", fontWeight: m.gelesen ? 400 : 600 }, onClick: function () { window._epMailOeffnen = m.id; if (typeof window.setView === "function") window.setView("posteingang"); } },
            E("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (m.absender_name || m.absender_email || "?") + " — " + (m.betreff || "(ohne Betreff)")), E("span", { style: Object.assign({}, B.klein, { whiteSpace: "nowrap" }) }, B.datumDe(m.gesendet_am))); })) : E(B.Leer, null, "Keine Mails von Käufer oder Handwerkern dieser Einheit" + (e.immobilie_id ? "." : " — ohne CRM-Objekt werden nur Absenderadressen verglichen.")))),
      block("Zeitleiste", zeitleiste.length ? E("div", null, zeitleiste.map(function (z, i) { return E("div", { key: i, style: { fontSize: 12.5, padding: "4px 0", borderBottom: "1px dotted " + CI.border } }, E("span", { style: { color: CI.muted } }, B.zeitDe(z.am), " · "), z.text); })) : E(B.Leer, null, "Noch nichts geschehen.")));
  }

  window.ImmoMaengelTafel = ImmoMaengelTafel;
  window.ImmoNeubauCockpit = ImmoNeubauCockpit;
  window.ImmoWohnungsakte = ImmoWohnungsakte;
  window.ImmoBT.qrDruck = qrDruck;
})();
