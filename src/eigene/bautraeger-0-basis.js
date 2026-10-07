// ============================================================================
// Bauträger-Paket v2 — Grundlagen (fork_84–86)
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, klassische Laufzeit. Gemeinsame Konstanten und
// Hilfen für die drei anderen Module (bautraeger-protokoll.js,
// bautraeger-cockpit.js, bautraeger-portal.js). Liegt alphabetisch vor ihnen
// und wird deshalb zuerst eingesetzt (scripts/bauen.py sortiert).
//
//   * IMMO_NEUBAU_TYPEN — die drei Protokolltypen des Neubaus (Auftrag A1).
//   * IMMO_MABV — die 13 Bauabschnitte nach § 3 Abs. 2 MaBV mit den
//     Höchstsätzen der Verordnung; nur Text und Zahl, keine Rechnung.
//   * ImmoBT — Namensraum mit Datum, Aufruf einer Function (mit lesbarem
//     Fehler), Foto→DataURL, Diktat (MediaRecorder → notiz-transkribieren),
//     Hinweis, und kleinen Bausteinen (Knopf, Feld, Karte, Abzeichen).
// ============================================================================
(function () {
  "use strict";
  var CI = window.IMMO_CI || { blau: "#1B2A47", blauDark: "#12203B", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF", border: "#E6E8EB", muted: "#7A828C", danger: "#c0392b", success: "#1e7e34" };
  var E = React.createElement;

  window.IMMO_NEUBAU_TYPEN = [
    { id: "neubau_vorabnahme", label: "Vorabnahme", subtitle: "Begehung vor der Abnahme", farbe: "#c17a2a" },
    { id: "neubau_abnahme", label: "Abnahme", subtitle: "Übergabe an den Käufer", farbe: "#2da14b" },
    { id: "neubau_nachabnahme", label: "Nachabnahme", subtitle: "Prüfung der Mängelbeseitigung", farbe: "#1B2A47" }
  ];
  // § 3 Abs. 2 MaBV — Bauabschnitte und Höchstsätze (in % des Gesamtpreises).
  // Der Kaufvertrag bündelt sie zu höchstens sieben Raten; welche, trägt die
  // Verwaltung je Rate ein (projekt_zahlungsplan.abschnitte).
  window.IMMO_MABV = [
    { nr: 1, name: "Beginn der Erdarbeiten", prozent: 30 },
    { nr: 2, name: "Rohbaufertigstellung einschließlich Zimmererarbeiten", prozent: 28 },
    { nr: 3, name: "Herstellung der Dachflächen und Dachrinnen", prozent: 5.6 },
    { nr: 4, name: "Rohinstallation der Heizungsanlagen", prozent: 2.1 },
    { nr: 5, name: "Rohinstallation der Sanitäranlagen", prozent: 2.1 },
    { nr: 6, name: "Rohinstallation der Elektroanlagen", prozent: 2.1 },
    { nr: 7, name: "Fenstereinbau einschließlich Verglasung", prozent: 7 },
    { nr: 8, name: "Innenputz (ohne Beiputzarbeiten)", prozent: 4.2 },
    { nr: 9, name: "Estrich", prozent: 2.1 },
    { nr: 10, name: "Fliesenarbeiten im Sanitärbereich", prozent: 2.8 },
    { nr: 11, name: "Bezugsfertigkeit und Zug-um-Zug-Übergabe", prozent: 8.4 },
    { nr: 12, name: "Fassadenarbeiten", prozent: 2.1 },
    { nr: 13, name: "Vollständige Fertigstellung", prozent: 3.5 }
  ];
  window.IMMO_GEWERKE_STANDARD = ["Rohbau", "Dach", "Fenster / Türen", "Elektro", "Sanitär / Heizung", "Estrich", "Fliesen", "Maler", "Bodenbelag / Parkett", "Trockenbau", "Schreiner / Innentüren", "Schlosser", "Außenanlagen", "Reinigung", "Sonstiges"];
  window.IMMO_MANGEL_STATUS = {
    offen: ["Offen", "#c17a2a"], beauftragt: ["Beauftragt", "#1B2A47"], termin_geplant: ["Termin geplant", "#2b6cb0"],
    gemeldet_erledigt: ["Erledigt gemeldet", "#7a5c00"], geprueft_erledigt: ["Geprüft erledigt", "#1e7e34"], abgelehnt: ["Abgelehnt", "#7A828C"],
    in_bearbeitung: ["In Bearbeitung", "#1B2A47"], erledigt: ["Erledigt", "#1e7e34"]
  };
  window.IMMO_MANGEL_OFFEN = ["offen", "beauftragt", "termin_geplant", "gemeldet_erledigt", "in_bearbeitung"];

  // Vorbelegung für den Protokoll-Editor (vom Editor einmal gelesen, FORK-Regel fork_84).
  window.ImmoProtokollVorbelegung = function () { var v = window._immoProtokollVorbelegung; window._immoProtokollVorbelegung = null; return v || {}; };

  var knopf = { background: CI.blau, color: "#fff", border: "1px solid " + CI.blau, borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  var knopfLeer = Object.assign({}, knopf, { background: "#fff", color: CI.blau, borderColor: CI.border });
  var knopfGold = Object.assign({}, knopf, { background: CI.gold, borderColor: CI.gold });
  var knopfRot = Object.assign({}, knopfLeer, { color: CI.danger, borderColor: "#e5c5c2" });
  var feld = { padding: "8px 10px", border: "1px solid " + CI.border, borderRadius: 7, fontSize: 13, boxSizing: "border-box", width: "100%", fontFamily: "inherit", background: "#fff" };
  var karte = { background: CI.card, border: "1px solid " + CI.border, borderRadius: 10, padding: 14 };
  var klein = { fontSize: 11.5, color: CI.muted };

  function datumDe(d) {
    if (!d) return "";
    var x = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00" : d) : d;
    return isNaN(x.getTime()) ? String(d) : x.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function zeitDe(d) { if (!d) return ""; var x = new Date(d); return isNaN(x.getTime()) ? "" : x.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function heute() { return new Date().toISOString().slice(0, 10); }
  function tageDazu(iso, n) { var d = new Date((iso || heute()) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function euro(n) { return n == null || n === "" ? "–" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
  function hinweis(text, fehler) { if (typeof window.epHinweis === "function") window.epHinweis(text, !!fehler); else if (fehler) alert(text); }

  // Function rufen; Fehlertext aus dem Antwortkörper holen (supabase-js versteckt ihn in error.context).
  async function rufen(name, body) {
    var a = await window._sb.functions.invoke(name, { body: body || {} });
    if (a.error) {
      var t = a.error.message || String(a.error);
      try { var k = a.error.context && await a.error.context.json(); if (k && (k.fehler || k.error)) t = k.fehler || k.error; } catch (e) { /* Rahmen */ }
      throw new Error(t);
    }
    if (!a.data || a.data.ok === false) throw new Error((a.data && (a.data.fehler || a.data.error)) || "Keine Antwort.");
    return a.data;
  }
  async function signiert(pfad) {
    if (!pfad) return null;
    var r = await window._sb.storage.from("projekt-dateien").createSignedUrl(pfad, 3600);
    return r.data && r.data.signedUrl || null;
  }
  // Foto verkleinern (Hilfe der Vorlage, 1600 px) und als DataURL zurückgeben.
  async function fotoAlsDataUrl(file) {
    var f = file;
    try { if (typeof uebergabeBildKomprimieren === "function") f = await uebergabeBildKomprimieren(file, 1600); } catch (e) { f = file; }
    return new Promise(function (ok, nein) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = nein; r.readAsDataURL(f); });
  }
  function dataUrlZuFile(dataUrl, name) {
    var m = /^data:([^;,]+)(?:;[^,]*?)?;base64,([\s\S]*)$/.exec(dataUrl); if (!m) return null;
    var bin = atob(m[2]), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return new File([out], name, { type: m[1] });
  }

  // Diktat: aufnehmen, transkribieren (notiz-transkribieren, Whisper). Gibt {start, stop, laeuft} über einen Hook.
  function useDiktat(fertig) {
    var lZ = React.useState(false), laeuft = lZ[0], setzeLaeuft = lZ[1];
    var vZ = React.useState(false), verarbeitet = vZ[0], setzeVerarbeitet = vZ[1];
    var ref = React.useRef(null);
    async function start() {
      if (!navigator.mediaDevices || !window.MediaRecorder) { hinweis("Diktat wird von diesem Browser nicht unterstützt.", true); return; }
      try {
        var strom = await navigator.mediaDevices.getUserMedia({ audio: true });
        var mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
        var rec = mime ? new MediaRecorder(strom, { mimeType: mime }) : new MediaRecorder(strom);
        var teile = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) teile.push(e.data); };
        rec.onstop = async function () {
          strom.getTracks().forEach(function (t) { t.stop(); });
          setzeLaeuft(false); setzeVerarbeitet(true);
          try {
            var blob = new Blob(teile, { type: rec.mimeType || mime || "audio/webm" });
            var b64 = await new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1]); }; r.readAsDataURL(blob); });
            var a = await window._sb.functions.invoke("notiz-transkribieren", { body: { audio_base64: b64, mime_type: blob.type } });
            if (a.error) throw new Error(a.error.message || "Transkription fehlgeschlagen");
            var text = a.data && (a.data.transkript || a.data.text || a.data.transcript) || "";
            if (!text) throw new Error("Nichts verstanden — bitte noch einmal.");
            fertig(String(text));
          } catch (e) { hinweis(e.message || String(e), true); }
          setzeVerarbeitet(false);
        };
        rec.start(); ref.current = rec; setzeLaeuft(true);
      } catch (e) { hinweis("Mikrofon nicht verfügbar: " + (e.message || e), true); }
    }
    function stop() { try { ref.current && ref.current.state !== "inactive" && ref.current.stop(); } catch (e) { /* schon aus */ } }
    return { start: start, stop: stop, laeuft: laeuft, verarbeitet: verarbeitet };
  }

  function Abzeichen(p) { return E("span", { style: Object.assign({ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: (p.farbe || CI.muted) + "1a", color: p.farbe || CI.muted, border: "1px solid " + (p.farbe || CI.muted) + "55", whiteSpace: "nowrap" }, p.style || {}) }, p.children); }
  function StatusAbzeichen(p) { var s = window.IMMO_MANGEL_STATUS[p.status] || [p.status, CI.muted]; return E(Abzeichen, { farbe: s[1], style: p.style }, s[0]); }
  function Kopf(p) { return E("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 } }, E("div", { style: { fontSize: 15, fontWeight: 700, color: CI.blau } }, p.titel), p.children ? E("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, p.children) : null); }
  function Leer(p) { return E("div", { style: { padding: 14, color: CI.muted, fontSize: 13, textAlign: "center", border: "1px dashed " + CI.border, borderRadius: 8 } }, p.children); }

  // Gewerk-Auswahl: feste Liste des Projekts + Gewerke der Handwerker + Standard; eigene Eingabe bleibt möglich (ComboSelect der Vorlage).
  function gewerkeListe(projekt, kontakte) {
    var l = [];
    (projekt && projekt.gewerke || []).forEach(function (g) { if (g && l.indexOf(g) < 0) l.push(g); });
    (kontakte || []).forEach(function (k) { if (k.gewerk && l.indexOf(k.gewerk) < 0) l.push(k.gewerk); });
    if (!l.length) l = window.IMMO_GEWERKE_STANDARD.slice();
    return l;
  }
  function GewerkWahl(p) {
    var liste = gewerkeListe(p.projekt, p.kontakte);
    if (typeof ComboSelect === "function") {
      return E(ComboSelect, { value: p.value || "", onChange: function (e) { p.onChange(e.target.value); }, style: Object.assign({}, feld, p.style || {}), placeholder: "Anderes Gewerk …" },
        E("option", { value: "" }, "— Gewerk —"), liste.map(function (g) { return E("option", { key: g, value: g }, g); }));
    }
    return E("select", { value: p.value || "", onChange: function (e) { p.onChange(e.target.value); }, style: Object.assign({}, feld, p.style || {}) },
      E("option", { value: "" }, "— Gewerk —"), liste.map(function (g) { return E("option", { key: g, value: g }, g); }));
  }

  // Standardplan: die 13 MaBV-Abschnitte zu sieben Raten gebuendelt (Summe 100 %).
  // Was der Kaufvertrag anders vorsieht, aendert die Verwaltung je Rate.
  window.IMMO_RATEN_STANDARD = [
    { nr: 1, bezeichnung: "Beginn der Erdarbeiten", abschnitte: [1] },
    { nr: 2, bezeichnung: "Rohbau und Dach", abschnitte: [2, 3] },
    { nr: 3, bezeichnung: "Rohinstallationen und Fenster", abschnitte: [4, 5, 6, 7] },
    { nr: 4, bezeichnung: "Innenputz, Estrich, Fliesen", abschnitte: [8, 9, 10] },
    { nr: 5, bezeichnung: "Bezugsfertigkeit und Übergabe", abschnitte: [11] },
    { nr: 6, bezeichnung: "Fassade", abschnitte: [12] },
    { nr: 7, bezeichnung: "Vollständige Fertigstellung", abschnitte: [13] }
  ];
  function ratenProzent(abschnitte) { return Math.round((abschnitte || []).reduce(function (s, a) { return s + ((window.IMMO_MABV[a - 1] || {}).prozent || 0); }, 0) * 10) / 10; }

  // Grundriss mit Markierungen. marker: [{x, y, label, farbe}] als Anteile 0–1; onClick(pos) setzt eine neue Stelle.
  function GrundrissBild(p) {
    var ref = React.useRef(null);
    function klick(e) {
      if (!p.onClick || !ref.current) return;
      var r = ref.current.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      p.onClick({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    }
    return E("div", { style: Object.assign({ position: "relative", display: "inline-block", maxWidth: "100%", lineHeight: 0, cursor: p.onClick ? "crosshair" : "default", border: "1px solid " + CI.border, borderRadius: 8, overflow: "hidden", background: "#fff" }, p.style || {}) },
      E("img", { ref: ref, src: p.url, alt: "Grundriss", onClick: klick, style: { maxWidth: "100%", maxHeight: p.maxHeight || 520, display: "block" } }),
      (p.marker || []).map(function (m, i) { return E("div", { key: i, title: m.label || "", style: { position: "absolute", left: (m.x * 100) + "%", top: (m.y * 100) + "%", transform: "translate(-50%, -50%)", width: 26, height: 26, borderRadius: 999, background: (m.farbe || CI.danger), color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, boxShadow: "0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,.35)", pointerEvents: "none" } }, m.label || "×"); }));
  }
  // Grundriss als Datei vorbereiten: Bilder bleiben, PDF wird mit pdf.js (Seite 1) zu PNG.
  async function grundrissAlsPng(file) {
    if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return file;
    if (typeof pdfjsLib === "undefined") throw new Error("PDF-Anzeige nicht geladen — bitte den Grundriss als Bild (PNG/JPG) hochladen.");
    var daten = new Uint8Array(await file.arrayBuffer());
    var pdf = await pdfjsLib.getDocument({ data: daten }).promise;
    var seite = await pdf.getPage(1);
    var vp = seite.getViewport({ scale: 2 });
    var canvas = document.createElement("canvas"); canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await seite.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    var blob = await new Promise(function (ok) { canvas.toBlob(ok, "image/png"); });
    return new File([blob], file.name.replace(/\.pdf$/i, "") + ".png", { type: "image/png" });
  }

  window.ImmoBT = {
    GrundrissBild: GrundrissBild, grundrissAlsPng: grundrissAlsPng, ratenProzent: ratenProzent,
    CI: CI, E: E, knopf: knopf, knopfLeer: knopfLeer, knopfGold: knopfGold, knopfRot: knopfRot, feld: feld, karte: karte, klein: klein,
    datumDe: datumDe, zeitDe: zeitDe, heute: heute, tageDazu: tageDazu, euro: euro, hinweis: hinweis, rufen: rufen, signiert: signiert,
    fotoAlsDataUrl: fotoAlsDataUrl, dataUrlZuFile: dataUrlZuFile, useDiktat: useDiktat,
    Abzeichen: Abzeichen, StatusAbzeichen: StatusAbzeichen, Kopf: Kopf, Leer: Leer, GewerkWahl: GewerkWahl, gewerkeListe: gewerkeListe,
    neueId: function () { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
  };
})();
