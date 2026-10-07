// ============================================================================
// Funktionsschalter in der Anwendung (fork_73)
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS, klassische Laufzeit. Laedt einmal nach der
// Anmeldung `meine_features()` — die Datenbank entscheidet (Ausnahme des
// Hauses, Tarif, Standard) — und sagt der Oberflaeche, welche Kachel
// gesperrt ist. Gesperrt heisst: die Kachel bleibt stehen, traegt ein
// "Upgrade"-Zeichen und oeffnet beim Klick einen Hinweis statt des Moduls.
// So verlangt es der Auftrag ("Upgrade-Hinweis statt zu verschwinden").
//
// Die Sperre hier ist Bequemlichkeit, keine Sicherheit: was ein Haus nicht
// darf, prueft der Server (hat_feature in den Funktionen, Schritt 9).
// ============================================================================
(function () {
  "use strict";
  var stand = null; // { schluessel: an }

  // Kachel -> Funktionsschalter. Nur, wo die Zuordnung eindeutig ist; eine
  // Kachel ohne Eintrag ist nie gesperrt.
  var KACHEL = { kundenportal: "kundenportal", akquise: "akquise", ki_agenten: "ki_text",
                 mcp_connector: "mcp_connector" };

  function laden() {
    if (!window._sb) return;
    window._sb.rpc("meine_features").then(function (r) {
      if (r.error || !Array.isArray(r.data)) return;
      var n = {};
      r.data.forEach(function (f) { n[f.schluessel] = !!f.an; });
      stand = n;
    }).catch(function () { /* ohne Stand ist nichts gesperrt */ });
  }

  function darf(kachelId) {
    var f = KACHEL[kachelId];
    if (!f || !stand) return true;
    return stand[f] !== false;
  }

  function hinweis(kachelId) {
    var alt = document.getElementById("immo-feature-hinweis");
    if (alt) alt.remove();
    var box = document.createElement("div");
    box.id = "immo-feature-hinweis";
    box.setAttribute("role", "dialog");
    box.style.cssText = "position:fixed;inset:0;background:rgba(18,32,59,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px";
    var karte = document.createElement("div");
    karte.style.cssText = "background:#fff;border-radius:10px;max-width:420px;width:100%;padding:22px;font-family:inherit;color:#1B2A47;box-shadow:0 20px 60px rgba(0,0,0,.3)";
    karte.innerHTML = '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#B5934F;font-weight:700;margin-bottom:8px">Nicht im Tarif enthalten</div>'
      + '<div style="font-size:15px;font-weight:600;margin-bottom:8px">Dieses Modul ist in Ihrem Tarif nicht freigeschaltet.</div>'
      + '<div style="font-size:13px;color:#7A828C;line-height:1.6">Ein Upgrade schaltet es sofort frei. Sie finden die Tarife unter <strong>Abo &amp; Abrechnung</strong>. Ist das ein Irrtum, hilft der Support.</div>'
      + '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button type="button" data-schliessen style="background:#1B2A47;color:#fff;border:1px solid #1B2A47;padding:8px 14px;border-radius:7px;font-weight:600;cursor:pointer;font-family:inherit">Verstanden</button></div>';
    karte.querySelector("[data-schliessen]").onclick = function () { box.remove(); };
    box.onclick = function (e) { if (e.target === box) box.remove(); };
    box.appendChild(karte);
    document.body.appendChild(box);
  }

  // Das "Upgrade"-Zeichen an gesperrten Kacheln: ein Attribut aus dem
  // Erzeuger (scripts/oberflaeche-zerlegen.py), die Gestalt von hier.
  var stil = document.createElement("style");
  stil.textContent = '.ep-kachel[data-immo-gesperrt]{opacity:.72}'
    + '.ep-kachel[data-immo-gesperrt]::after{content:"Upgrade";position:absolute;top:10px;right:10px;'
    + 'background:#B5934F;color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;'
    + 'padding:2px 8px;border-radius:8px;text-transform:uppercase}';
  document.head.appendChild(stil);

  window.ImmoFeature = { darf: darf, hinweis: hinweis, laden: laden,
    stand: function () { return stand; } };

  // Nach jeder Anmeldung neu laden; beim Abmelden vergessen.
  var versuche = 0;
  (function warten() {
    if (window._sb && window._sb.auth) {
      window._sb.auth.onAuthStateChange(function (ereignis) {
        if (ereignis === "SIGNED_OUT") { stand = null; return; }
        laden();
      });
      laden();
    } else if (versuche++ < 50) setTimeout(warten, 200);
  })();
})();
