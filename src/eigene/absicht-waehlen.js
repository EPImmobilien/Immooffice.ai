// ============================================================================
// Antwort-Absicht wählen — der Knopf vor dem KI-Entwurf
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, Handarbeit, klassische Laufzeit (CLAUDE.md).
//
// Ansage des Betreibers vom 06.10.2026: „dass wir mit Klick auf den Button
// auswählen können, was für eine Antwort verschickt werden soll. Zum
// Beispiel eine Zusage, Absage etc."
//
// Vorher gab es genau eine Absicht: „antworte irgendwie passend". Jetzt
// wählt der Makler zuerst, was die Mail erreichen soll, und der Entwurf
// richtet sich danach.
//
// Die Liste kommt von der Funktion (aktion: "absichten") und steht NICHT
// hier. Sie liegt dort neben ihrer Wirkung; zwei Listen liefen irgendwann
// auseinander, und dann hieße ein Knopf „Absage", während die Anweisung
// dahinter etwas anderes sagt.
//
// Die Auswahl merkt sich die Software je Browser — wer den ganzen Tag
// Anfragen beantwortet, will nicht jedes Mal dasselbe anklicken. Sie wird
// trotzdem jedes Mal angezeigt: eine Absage, die versehentlich als Zusage
// hinausgeht, ist kein Komfortproblem.
// ============================================================================
(function () {
  "use strict";

  var CI = window.IMMO_CI || {
    blau: "#1B2A47", gold: "#B5934F", bg: "#FAFAFA", card: "#FFFFFF",
    border: "#E6E8EB", ink: "#1B2A47", muted: "#7A828C",
    shadow: "0 2px 12px rgba(27,42,71,0.06)",
  };
  var SPEICHER = "immo.absicht.zuletzt";

  // Einmal geholt, dann behalten: die Liste ändert sich zwischen zwei
  // Mails nicht.
  var liste = null;

  async function holen() {
    if (liste) return liste;
    try {
      var a = await window._sb.functions.invoke("mail-ki-vorschlag", {
        body: { aktion: "absichten" },
      });
      if (a.data && a.data.ok && Array.isArray(a.data.absichten) && a.data.absichten.length) {
        liste = a.data.absichten;
      }
    } catch (f) { /* ohne Liste geht es ohne Auswahl weiter */ }
    return liste;
  }

  function zuletzt() {
    try { return window.localStorage.getItem(SPEICHER) || "frei"; } catch (f) { return "frei"; }
  }
  function merken(k) {
    try { window.localStorage.setItem(SPEICHER, k); } catch (f) { /* egal */ }
  }

  /**
   * Zeigt die Auswahl und ruft `weiter(schluessel)` mit der Entscheidung.
   *
   * Lässt sich die Liste nicht holen, wird NICHT abgebrochen: dann läuft es
   * wie vorher, mit der offenen Absicht. Ein Werkzeug, das wegen einer
   * fehlgeschlagenen Nebenabfrage gar nicht mehr arbeitet, ist schlimmer
   * als eines ohne Auswahl.
   */
  async function waehlen(weiter) {
    var absichten = await holen();
    if (!absichten) { weiter("frei"); return; }

    var huelle = document.createElement("div");
    huelle.setAttribute("role", "dialog");
    huelle.setAttribute("aria-modal", "true");
    huelle.setAttribute("aria-label", "Was soll die Antwort erreichen?");
    huelle.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;"
      + "align-items:center;justify-content:center;background:rgba(12,22,40,.45);"
      + "padding:20px";

    var tafel = document.createElement("div");
    tafel.style.cssText = "background:" + CI.card + ";border-radius:12px;max-width:620px;"
      + "width:100%;max-height:82vh;overflow:auto;padding:22px;box-shadow:0 12px 40px rgba(12,22,40,.3)";

    var kopf = document.createElement("h3");
    kopf.textContent = "Was soll die Antwort erreichen?";
    kopf.style.cssText = "margin:0 0 4px;font-size:18px;color:" + CI.blau;
    tafel.appendChild(kopf);

    var unter = document.createElement("p");
    unter.textContent = "Der Entwurf richtet sich danach. Ändern können Sie ihn hinterher immer.";
    unter.style.cssText = "margin:0 0 16px;font-size:13.5px;color:" + CI.muted;
    tafel.appendChild(unter);

    var gitter = document.createElement("div");
    gitter.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px";

    function schliessen() {
      document.removeEventListener("keydown", taste);
      if (huelle.parentNode) huelle.parentNode.removeChild(huelle);
    }
    function taste(e) {
      if (e.key === "Escape") { schliessen(); }
    }

    var vorige = zuletzt();
    absichten.forEach(function (a) {
      var k = document.createElement("button");
      k.type = "button";
      var istVorige = a.schluessel === vorige;
      k.style.cssText = "text-align:left;padding:12px 14px;border-radius:8px;cursor:pointer;"
        + "font-family:inherit;background:" + (istVorige ? CI.bg : CI.card)
        + ";border:1px solid " + (istVorige ? CI.gold : CI.border);
      var titel = document.createElement("div");
      titel.textContent = a.name;
      titel.style.cssText = "font-weight:600;font-size:14.5px;color:" + CI.blau;
      var hinweis = document.createElement("div");
      hinweis.textContent = a.hinweis || "";
      hinweis.style.cssText = "font-size:12.5px;color:" + CI.muted + ";margin-top:3px;line-height:1.45";
      k.appendChild(titel);
      k.appendChild(hinweis);
      k.addEventListener("click", function () {
        merken(a.schluessel);
        schliessen();
        weiter(a.schluessel);
      });
      gitter.appendChild(k);
    });
    tafel.appendChild(gitter);

    var abbrechen = document.createElement("button");
    abbrechen.type = "button";
    abbrechen.textContent = "Abbrechen";
    abbrechen.style.cssText = "margin-top:16px;background:none;border:1px solid " + CI.border
      + ";border-radius:6px;padding:8px 16px;font-family:inherit;font-size:13.5px;cursor:pointer;color:"
      + CI.muted;
    abbrechen.addEventListener("click", schliessen);
    tafel.appendChild(abbrechen);

    huelle.appendChild(tafel);
    huelle.addEventListener("click", function (e) { if (e.target === huelle) schliessen(); });
    document.addEventListener("keydown", taste);
    document.body.appendChild(huelle);
    var erster = gitter.querySelector("button");
    if (erster) erster.focus();
  }

  window.ImmoAbsichtWaehlen = waehlen;
})();
