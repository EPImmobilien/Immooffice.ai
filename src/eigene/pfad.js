// ============================================================================
// Pfad-Verweise: „→ Einstellungen › Firma & Impressum" — als Link, nicht als Prosa
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS (fork_82), klassische Laufzeit.
//
// Wo die Anwendung sagt, dass etwas eingestellt werden muss, soll daneben
// stehen, WO — und ein Klick soll hinfuehren. Ein Satz wie „unter
// Einstellungen → Vorgaben" ist ein Pfad zum Abtippen; ein Link ist einer.
//
//   window.ImmoPfad.zu("einstellungen/firma")   navigiert (Seite + Reiter)
//   window.ImmoPfad.name("einstellungen/firma") -> "Einstellungen › Firma & Impressum"
//   window.ImmoPfadLink({ ziel, text? })        React-Element „→ Einstellungen › …"
//
// Der Reiter der Einstellungen wird ueber window._immoEinstellungenReiter
// uebergeben; die Seite liest ihn beim Oeffnen einmal und loescht ihn.
// ============================================================================
(function () {
  "use strict";
  var PFADE = {
    "einstellungen/firma": ["einstellungen", "firma", "Einstellungen › Firma & Impressum"],
    "einstellungen/gesellschaften": ["einstellungen", "gesellschaften", "Einstellungen › Gesellschaften"],
    "einstellungen/standorte": ["einstellungen", "standorte", "Einstellungen › Standorte"],
    "einstellungen/belegnummern": ["einstellungen", "belegnummern", "Einstellungen › Belegnummern"],
    "einstellungen/zahlung": ["einstellungen", "zahlung", "Einstellungen › Zahlung & Freigabe"],
    "einstellungen/signatur": ["einstellungen", "signatur", "Einstellungen › Signatur & Texte"],
    "einstellungen/vorgaben": ["einstellungen", "vorgaben", "Einstellungen › Vorgaben"],
    "einstellungen/vertragsvorlagen": ["einstellungen", "vertragsvorlagen", "Einstellungen › Vertragsvorlagen"],
    "einstellungen/abrechnung": ["einstellungen", "abrechnung", "Einstellungen › Abo & Abrechnung"],
    "einstellungen/supportzugriffe": ["einstellungen", "supportzugriffe", "Einstellungen › Support-Zugriffe"],
    "marketing": ["marketing", null, "Marketing › Logos & Vorlagen"],
    "expose_vorlagen": ["expose_vorlagen", null, "Exposé-Vorlagen"],
    "posteingang": ["posteingang", null, "Posteingang › Postfach verbinden"],
    "admin": ["admin", null, "Admin-Bereich › Mitarbeiter"],
    "hilfe": ["hilfe", null, "Hilfe & Support"],
    "plattform": ["plattform", null, "Plattform (Betreiber)"],
  };
  function eintrag(ziel) { return PFADE[ziel] || [String(ziel).split("/")[0], null, String(ziel)]; }
  function name(ziel) { return eintrag(ziel)[2]; }
  function zu(ziel) {
    var e = eintrag(ziel);
    if (e[1]) { try { window._immoEinstellungenReiter = e[1]; } catch (x) { /* egal */ } }
    if (typeof window.epNavigiere === "function") window.epNavigiere(e[0]);
    else window.location.hash = "#" + e[0];
  }
  function ImmoPfadLink(p) {
    var E = React.createElement;
    return E("a", { href: "#" + eintrag(p.ziel)[0], "data-pfad": p.ziel,
      onClick: function (ev) { ev.preventDefault(); zu(p.ziel); },
      style: Object.assign({ color: "#1B2A47", fontWeight: 600, textDecoration: "underline", textDecorationColor: "#B5934F", whiteSpace: "nowrap" }, p.style || {}) },
      "→ " + (p.text || name(p.ziel)));
  }
  // Fuer Stellen ohne React (innerHTML): ein <a data-pfad> wird beim Klick aufgeloest.
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest("a[data-pfad]");
    if (!a || a.getAttribute("data-pfad-react") === "1") return;
    ev.preventDefault(); zu(a.getAttribute("data-pfad"));
  });
  window.ImmoPfad = { zu: zu, name: name, PFADE: PFADE,
    html: function (ziel, text) { return '<a href="#" data-pfad="' + ziel + '" style="color:#1B2A47;font-weight:600;text-decoration:underline;text-decoration-color:#B5934F">→ ' + (text || name(ziel)) + "</a>"; } };
  window.ImmoPfadLink = ImmoPfadLink;
})();
