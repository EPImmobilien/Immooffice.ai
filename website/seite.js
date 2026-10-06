// ============================================================================
// Die Bewegung auf der Website
// ----------------------------------------------------------------------------
// Vier Dinge, handgeschrieben, ohne Bibliothek:
//   1. die Kopfzeile schrumpft beim Scrollen,
//   2. das Menü auf dem Telefon,
//   3. die Slideshow (automatisch, mit Pfeilen, Punkten, Tastatur und Wischen),
//   4. Abschnitte, die beim Scrollen erscheinen.
//
// Alles hält sich an prefers-reduced-motion: wer im Betriebssystem "weniger
// Bewegung" eingestellt hat, bekommt dieselbe Seite, nur ohne Automatik und
// ohne Einblenden. Und alles funktioniert ohne JavaScript weiter — dann steht
// die erste Folie da und die Abschnitte sind sichtbar.
// ============================================================================
(function () {
  "use strict";

  var ruhig = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- 1. Kopfzeile -------------------------------------------------------
  var kopf = document.querySelector("header");
  if (kopf) {
    // Eigener Name, nicht "pruefen": var ist funktions-, nicht blockweit.
    // Ein zweites "pruefen" weiter unten waere dieselbe Variable, und die
    // Zuweisung hier haette die untere Funktion ueberschrieben — die
    // Abschnitte waeren nie erschienen. Genau das war einmal der Fall.
    var kopfPruefen = function () {
      kopf.classList.toggle("geschrumpft", window.scrollY > 20);
    };
    kopfPruefen();
    window.addEventListener("scroll", kopfPruefen, { passive: true });
  }

  // --- 2. Menü auf dem Telefon -------------------------------------------
  var knopf = document.querySelector(".menuknopf");
  var nav = document.querySelector("header nav");
  if (knopf && nav) {
    knopf.addEventListener("click", function () {
      var offen = nav.classList.toggle("offen");
      knopf.setAttribute("aria-expanded", offen ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("offen");
        knopf.setAttribute("aria-expanded", "false");
      }
    });
  }

  // --- 3. Slideshow -------------------------------------------------------
  var schau = document.querySelector("[data-schau]");
  if (schau) {
    var band = schau.querySelector(".band");
    var folien = Array.prototype.slice.call(band.children);
    var punkte = schau.querySelector(".punkte");
    var zaehler = schau.querySelector(".zaehler");
    var jetzt = 0;
    var uhr = null;
    var WECHSEL = 7000;

    folien.forEach(function (f, i) {
      f.setAttribute("role", "group");
      f.setAttribute("aria-roledescription", "Folie");
      f.setAttribute("aria-label", (i + 1) + " von " + folien.length);
      var p = document.createElement("button");
      p.type = "button";
      p.setAttribute("role", "tab");
      p.setAttribute("aria-label", "Folie " + (i + 1));
      p.addEventListener("click", function () { zeige(i, true); });
      punkte.appendChild(p);
    });

    function zeige(i, vonHand) {
      jetzt = (i + folien.length) % folien.length;
      band.style.transform = "translateX(" + (-100 * jetzt) + "%)";
      Array.prototype.forEach.call(punkte.children, function (p, n) {
        p.setAttribute("aria-selected", n === jetzt ? "true" : "false");
      });
      folien.forEach(function (f, n) {
        // Was nicht zu sehen ist, soll auch nicht vorgelesen und nicht mit
        // der Tabulatortaste erreichbar sein.
        f.setAttribute("aria-hidden", n === jetzt ? "false" : "true");
        f.querySelectorAll("a, button").forEach(function (b) {
          b.tabIndex = n === jetzt ? 0 : -1;
        });
      });
      if (zaehler) {
        zaehler.textContent = String(jetzt + 1).padStart(2, "0") + " / "
          + String(folien.length).padStart(2, "0");
      }
      if (vonHand) starten();
    }

    function starten() {
      if (ruhig) return;
      clearInterval(uhr);
      uhr = setInterval(function () { zeige(jetzt + 1); }, WECHSEL);
    }
    function anhalten() { clearInterval(uhr); }

    schau.querySelector("[data-vor]").addEventListener("click", function () { zeige(jetzt + 1, true); });
    schau.querySelector("[data-zurueck]").addEventListener("click", function () { zeige(jetzt - 1, true); });

    schau.addEventListener("mouseenter", anhalten);
    schau.addEventListener("mouseleave", starten);
    schau.addEventListener("focusin", anhalten);
    schau.addEventListener("focusout", starten);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) anhalten(); else starten();
    });

    schau.setAttribute("tabindex", "0");
    schau.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { zeige(jetzt + 1, true); e.preventDefault(); }
      if (e.key === "ArrowLeft") { zeige(jetzt - 1, true); e.preventDefault(); }
    });

    // Wischen auf dem Telefon.
    var startX = null, startY = null;
    schau.addEventListener("touchstart", function (e) {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      anhalten();
    }, { passive: true });
    schau.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      // Nur waagerechtes Wischen zaehlt — sonst blaettert die Seite weiter,
      // sobald jemand scrollt.
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        zeige(jetzt + (dx < 0 ? 1 : -1), true);
      } else { starten(); }
      startX = startY = null;
    }, { passive: true });

    zeige(0);
    starten();
  }

  // --- 4. Filter des Modul-Katalogs ---------------------------------------
  // 27 Bereiche auf einmal sind eine Wand. Der Filter blendet aus, was
  // gerade nicht gefragt ist — er laedt nichts nach. Ohne JavaScript steht
  // alles da, und das ist die richtige Rueckfallebene: lieber alles sehen
  // als nichts.
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-filter]"));
  var module = Array.prototype.slice.call(document.querySelectorAll(".modul[data-gruppe]"));
  if (chips.length && module.length) {
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var wahl = chip.getAttribute("data-filter");
        chips.forEach(function (c) {
          var an = c === chip;
          c.classList.toggle("an", an);
          c.setAttribute("aria-pressed", an ? "true" : "false");
        });
        module.forEach(function (m) {
          var zeigen = wahl === "alle" || m.getAttribute("data-gruppe") === wahl;
          // hidden statt display:none im Stil: so faellt der Bereich auch
          // aus dem Vorlesefluss und aus der Tabulator-Reihenfolge.
          if (zeigen) m.removeAttribute("hidden"); else m.setAttribute("hidden", "");
        });
        // Was gerade sichtbar geworden ist, soll auch erscheinen.
        if (typeof planen === "function") planen();
      });
      chip.setAttribute("aria-pressed", chip.classList.contains("an") ? "true" : "false");
    });
  }

  // --- 5. Erscheinen beim Scrollen ---------------------------------------
  // Bewusst ueber die Scroll-Position und nicht ueber einen
  // IntersectionObserver: der meldet nur, was den Blick WIRKLICH kreuzt.
  // Wer im Menue auf einen Punkt springt, mit der Ende-Taste ans Seitenende
  // geht oder die Seite an einer gespeicherten Stelle wieder oeffnet,
  // ueberspringt dabei Abschnitte — und die blieben unsichtbar. Genau das
  // hat tests/website-browser.js gefunden.
  var kandidaten = Array.prototype.slice.call(document.querySelectorAll(".auf"));
  if (!kandidaten.length) return;
  if (ruhig) {
    kandidaten.forEach(function (k) { k.classList.add("da"); });
    return;
  }
  function pruefen() {
    var hoehe = window.innerHeight || document.documentElement.clientHeight;
    kandidaten = kandidaten.filter(function (k) {
      var kasten = k.getBoundingClientRect();
      // Alles, was im Blick ist ODER schon daran vorbei — also auch das,
      // was bei einem Sprung uebergangen wurde.
      if (kasten.top < hoehe * 0.92) { k.classList.add("da"); return false; }
      return true;
    });
  }
  // Gebremst ueber die Uhr, NICHT ueber requestAnimationFrame mit einem
  // "schon geplant"-Schalter: faellt der erste Frame aus — und das tut er,
  // wenn die Seite in einem Hintergrund-Tab geoeffnet wird —, bleibt der
  // Schalter stehen und es erscheint nie wieder etwas. Genau das hat
  // tests/website-browser.js gefunden, und zwar an einer Stelle, an der
  // man es im eigenen Browser nie bemerkt haette.
  var zuletzt = 0;
  function planen() {
    var jetzt = Date.now();
    if (jetzt - zuletzt < 80) return;
    zuletzt = jetzt;
    pruefen();
  }
  window.addEventListener("scroll", planen, { passive: true });
  window.addEventListener("resize", planen);
  window.addEventListener("hashchange", planen);
  window.addEventListener("load", pruefen);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pruefen();
  });
  pruefen();
})();
