// ============================================================================
// Die Angaben des Betreibers für die Website
// ----------------------------------------------------------------------------
// EINE Stelle für alles, was das Haus betrifft: Impressum, Kontakt, Adresse
// der Anwendung. Die Seiten lesen von hier — niemand muss HTML anfassen, um
// eine Telefonnummer zu ändern.
//
// Solange die Pflichtfelder leer sind, zeigt jede Seite einen sichtbaren
// Hinweis, und .github/workflows/website-ausliefern.yml lässt NUR eine
// Vorschau zu, keine Produktion. Grund: eine öffentliche Website eines
// Unternehmens braucht in Deutschland ein Impressum (§ 5 DDG, früher TMG).
// Eine Seite mit erfundenen oder fehlenden Angaben online zu stellen wäre
// schlechter, als sie noch nicht online zu stellen.
//
// ERFINDEN IST KEINE OPTION. Hier steht nichts Ausgedachtes; was fehlt,
// bleibt leer und fällt auf.
// ============================================================================
window.IMMO_WEB = {
  // --- Pflicht für die Produktion -------------------------------------
  firma: "E&P Immobilien Schwerin GmbH",
  strasse: "Am Vögenteich 26r",
  plz_ort: "18055 Rostock",
  vertreten_durch: "Lasse Engfer",
  email: "",              // Kontaktadresse
  telefon: "",            // mit Vorwahl

  // --- Freiwillig ------------------------------------------------------
  registergericht: "",    // "Amtsgericht Musterstadt"
  hrb: "",                // "HRB 12345"
  ust_id: "",             // "DE123456789"
  aufsichtsbehoerde: "",  // bei erlaubnispflichtiger Tätigkeit (§ 34c GewO)

  // --- Wohin der Anmelde-Knopf führt -----------------------------------
  // Die ausgelieferte Oberfläche. Später die eigene Domain.
  anwendung: "https://app.immooffice.ai",

  // --- Woher die Preise kommen -----------------------------------------
  // Der öffentliche, nur lesende Endpunkt `tarife-oeffentlich`. Er liefert
  // den Stand aus plattform_tarife — damit zeigt die Website, was auch
  // abgerechnet wird, und niemand muss HTML anfassen, um einen Preis zu
  // ändern. Leer gelassen bleiben die Rückfallwerte im HTML stehen; sie
  // können dann vom Katalog abweichen.
  preise: "https://usguiggfciavwzkdfjgt.supabase.co/functions/v1/tarife-oeffentlich",
};
