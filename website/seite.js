// ============================================================================
// Die Bewegung auf der Website
// ----------------------------------------------------------------------------
// Sechs Dinge, handgeschrieben, ohne Bibliothek:
//   1. die Kopfzeile schrumpft beim Scrollen,
//   2. das Menü auf dem Telefon,
//   3. die Slideshow (automatisch, mit Pfeilen, Punkten, Tastatur und Wischen),
//   4. der Filter des Modul-Katalogs,
//   5. der Preisbereich (Stand aus dem Katalog, Monat/Jahr-Umschalter),
//   6. Abschnitte, die beim Scrollen erscheinen.
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
  // 29 Bereiche auf einmal sind eine Wand. Der Filter blendet aus, was
  // gerade nicht gefragt ist — er laedt nichts nach. Ohne JavaScript steht
  // alles da, und das ist die richtige Rueckfallebene: lieber alles sehen
  // als nichts.
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-filter]"));
  var module = Array.prototype.slice.call(document.querySelectorAll(".modul[data-gruppe]"));

  // Schmal zugeklappt, breit offen.
  //
  // Im Markup steht `open`, und zwar mit Absicht: ohne JavaScript ist alles
  // sichtbar, und das ist die richtige Rueckfallebene — lieber alles sehen
  // als nichts aufklappen koennen. Erst hier wird auf dem Telefon
  // zugeklappt, wo 29 ausgeklappte Bereiche 8691 px ergaeben.
  //
  // Umgeschaltet wird NUR beim Wechsel der Breite, nicht bei jedem
  // resize-Ereignis: sonst fiele jedes Aufgeklappte wieder zu, sobald die
  // Adresszeile eines Telefons beim Scrollen ein- oder ausfaehrt. Genau
  // das ist der haeufigste Fehler an solchen Umschaltern.
  var schmal = window.matchMedia("(max-width: 720px)");
  var warSchmal = null;
  function faltenAnpassen() {
    var jetztSchmal = schmal.matches;
    if (jetztSchmal === warSchmal) return;
    warSchmal = jetztSchmal;
    module.forEach(function (m) {
      if (jetztSchmal) m.removeAttribute("open"); else m.setAttribute("open", "");
    });
  }
  if (module.length) {
    faltenAnpassen();
    // addListener ist der alte Name; Safari unter 14 kennt den neuen nicht.
    if (schmal.addEventListener) schmal.addEventListener("change", faltenAnpassen);
    else if (schmal.addListener) schmal.addListener(faltenAnpassen);
  }

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
        // Auf dem Telefon steht man nach dem Filtern sonst mitten in einer
        // Liste, die gerade kuerzer geworden ist — und sieht nichts von dem,
        // was man ausgewaehlt hat.
        // Auf dem Telefon die Filterleiste unter die Kopfzeile holen — und
        // zwar SELBST, nicht dem Browser ueberlassen.
        //
        // Was sonst passiert, ist am 06.10.2026 gemessen worden: beim Tippen
        // bekommt der Knopf den Fokus, der Browser scrollt ihn von sich aus
        // ins Bild, und weil die Seite "scroll-behavior: smooth" hat, wird
        // daraus eine Animation. Ihr Ziel steht aber beim Start fest —
        // berechnet am Layout VOR dem Filtern. Waehrend sie laeuft,
        // verschwinden bis zu zweiundzwanzig Bereiche aus dem Fluss, die
        // Seite wird 1632 px kuerzer, und die Animation landet 70 px zu
        // weit unten: die Filterleiste steht hinter der klebenden
        // Kopfzeile. Man filtert und sieht nicht mehr, wonach.
        //
        // Deshalb: zwei Bilder warten, bis Layout und fremde Animation
        // stehen, dann die Strecke neu rechnen und selbst dorthin.
        if (schmal.matches) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              var leiste = document.querySelector(".chips");
              var kopfzeile = document.querySelector("header");
              if (!leiste) return;
              var hoehe = (kopfzeile ? kopfzeile.getBoundingClientRect().height : 64) + 12;
              var ist = leiste.getBoundingClientRect().top;
              // Im Normalfall — jemand tippt einen Knopf, den er sieht —
              // bleibt die Leiste ohnehin stehen. Dann soll hier NICHTS
              // passieren: ein Ruck um zwanzig Pixel sieht aus wie ein
              // Fehler. Korrigiert wird nur, was wirklich daneben steht.
              if (Math.abs(ist - hoehe) < 40) return;
              window.scrollTo({ top: window.scrollY + ist - hoehe, behavior: "smooth" });
            });
          });
        }
      });
      chip.setAttribute("aria-pressed", chip.classList.contains("an") ? "true" : "false");
    });
  }

  // --- 5. Preise ----------------------------------------------------------
  // Die Preise stehen im Plattform-Admin, nicht hier. Was im HTML steht, ist
  // RUECKFALL: ohne JavaScript, ohne Endpunkt oder bei einem Fehler bleibt
  // es stehen — eine Preisseite ohne Preise waere schlimmer als eine mit dem
  // Stand von gestern.
  //
  // Gerechnet wird aus Cent-Betraegen in data-Attributen, nicht aus dem
  // sichtbaren Text. Sonst muesste der Umschalter "129,99 €" zurueck in eine
  // Zahl lesen, und das geht schief, sobald jemand das Tausenderzeichen
  // aendert.
  var bereich = document.querySelector("[data-preise]");
  if (bereich) preisbereich(bereich);

  function preisbereich(wurzel) {
    var k = window.IMMO_WEB || {};
    var ziel = k.anwendung || "";
    var takt = "monat";

    function geld(cent) {
      return (cent / 100).toLocaleString("de-DE",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    }
    function zahl(n) { return Number(n).toLocaleString("de-DE"); }

    // Der Katalog, wie die Seite ihn gerade kennt: zuerst aus dem Markup,
    // spaeter aus dem Endpunkt ueberschrieben.
    var katalog = { tarife: [], zusatz: null, ust: 19 };
    Array.prototype.forEach.call(wurzel.querySelectorAll("[data-tarif]"), function (karte) {
      katalog.tarife.push({
        schluessel: karte.getAttribute("data-tarif"),
        karte: karte,
        monat: Number(karte.getAttribute("data-monat-cent") || 0),
        jahr: Number(karte.getAttribute("data-jahr-cent") || 0),
      });
    });
    var zusatzkarte = wurzel.querySelector("[data-zusatznutzer]");
    if (zusatzkarte) {
      katalog.zusatz = {
        karte: zusatzkarte,
        monat: Number(zusatzkarte.getAttribute("data-monat-cent") || 0),
        jahr: Number(zusatzkarte.getAttribute("data-jahr-cent") || 0),
      };
    }

    /** Der Anmeldeknopf nimmt Tarif und Takt mit, damit die Anwendung die
     *  Wahl nicht noch einmal abfragen muss. */
    function knopfziel(schluessel) {
      if (!ziel) return "#";
      var trenn = ziel.indexOf("?") === -1 ? "?" : "&";
      return ziel + trenn + "tarif=" + encodeURIComponent(schluessel)
        + "&intervall=" + takt;
    }

    /** Wie viel das Jahr gegenueber zwoelf Monaten spart — gerechnet, nicht
     *  behauptet. Abgerundet: wer 8,3 % spart, soll nicht "9 %" lesen. */
    function sparquote() {
      var beste = 0;
      katalog.tarife.forEach(function (t) {
        if (!t.monat || !t.jahr) return;
        var q = 1 - t.jahr / (t.monat * 12);
        if (q > beste) beste = q;
      });
      return Math.floor(beste * 100);
    }

    function karteZeichnen(eintrag) {
      var karte = eintrag.karte;
      var cent = takt === "jahr" ? eintrag.jahr : eintrag.monat;
      if (!cent) return;
      var betrag = karte.querySelector("[data-betrag]");
      // Nur die Zahl, das Eurozeichen steht als eigene Einheit daneben.
      if (betrag) betrag.textContent = geld(cent).replace(" €", "");
      Array.prototype.forEach.call(karte.querySelectorAll("[data-taktwort]"), function (w) {
        w.textContent = takt === "jahr" ? " / Jahr" : " / Monat";
      });
      var zweit = karte.querySelector("[data-zweitpreis]");
      if (zweit) {
        if (takt === "jahr") {
          // Ehrlich gerechnet und so benannt: der Jahrespreis wird im Ganzen
          // berechnet, der Monatswert ist nur die Einordnung.
          zweit.textContent = "entspricht " + geld(Math.round(eintrag.jahr / 12)) + " im Monat";
        } else if (eintrag.jahr) {
          var q = 1 - eintrag.jahr / (eintrag.monat * 12);
          zweit.textContent = "oder " + geld(eintrag.jahr) + " im Jahr"
            + (q > 0.005 ? " — spart " + Math.floor(q * 100) + " %" : "");
        } else {
          zweit.textContent = "";
        }
      }
    }

    function zeichnen() {
      katalog.tarife.forEach(karteZeichnen);
      if (katalog.zusatz) karteZeichnen(katalog.zusatz);
      var spar = wurzel.querySelector("[data-sparen]");
      if (spar) {
        var q = sparquote();
        if (q > 0) { spar.textContent = "spart " + q + " %"; spar.hidden = false; }
        else spar.hidden = true;
      }
      Array.prototype.forEach.call(wurzel.querySelectorAll("[data-cta]"), function (a) {
        var karte = a.closest ? a.closest("[data-tarif]") : null;
        a.href = knopfziel(karte ? karte.getAttribute("data-tarif") : "starter");
        a.rel = "noopener";
      });
    }

    wurzel.querySelectorAll("[data-takt]").forEach(function (b) {
      b.addEventListener("click", function () {
        takt = b.getAttribute("data-takt") === "jahr" ? "jahr" : "monat";
        wurzel.querySelectorAll("[data-takt]").forEach(function (a) {
          var an = a === b;
          a.classList.toggle("an", an);
          a.setAttribute("aria-pressed", an ? "true" : "false");
        });
        zeichnen();
      });
    });

    zeichnen();

    // --- Der Stand aus dem Katalog ----------------------------------------
    if (!k.preise) return;
    var uhr = setTimeout(function () { uhr = null; }, 6000);
    fetch(k.preise, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!uhr || !d || d.ok !== true) return;  // Rueckfall steht schon da.
        clearTimeout(uhr);
        uebernehmen(d);
      })
      .catch(function () { /* Rueckfall steht schon da. */ });

    /** Text sicher setzen — der Katalog ist vom Betreiber gepflegt, also
     *  Eingabe. In eine Liste geht er nur ueber createElement. */
    function zeile(text, klein) {
      var li = document.createElement("li");
      li.textContent = text;
      if (klein) {
        var s = document.createElement("span");
        s.textContent = klein;
        li.appendChild(s);
      }
      return li;
    }

    function uebernehmen(d) {
      katalog.ust = Number(d.ust_prozent || 19);

      // Tarife: nur die Karten füllen, die es im Markup gibt. Ein neuer
      // Tarif im Admin erscheint hier NICHT von selbst — eine Karte ist
      // Text und Haltung, nicht nur eine Zahl, und die schreibt ein Mensch.
      (d.tarife || []).forEach(function (t) {
        var eintrag = null;
        katalog.tarife.forEach(function (e) { if (e.schluessel === t.schluessel) eintrag = e; });
        if (!eintrag) return;
        eintrag.monat = Number(t.preis_monat_cent || 0);
        eintrag.jahr = Number(t.preis_jahr_cent || 0);
        var karte = eintrag.karte;
        var hin = karte.querySelector("[data-hinweis]");
        if (hin && t.hinweis) hin.textContent = t.hinweis;
        var nutzer = karte.querySelector("[data-nutzer]");
        if (nutzer) nutzer.textContent = zahl(t.inkl_nutzer || 1);
        var credits = karte.querySelector("[data-credits]");
        if (credits) credits.textContent = zahl(t.credits_monat || 0);
        var liste = karte.querySelector("[data-merkmale]");
        if (liste && Array.isArray(t.merkmale) && t.merkmale.length) {
          liste.textContent = "";
          t.merkmale.forEach(function (m) { liste.appendChild(zeile(String(m))); });
        }
      });

      if (katalog.zusatz && d.zusatznutzer) {
        katalog.zusatz.monat = Number(d.zusatznutzer.preis_monat_cent || 0);
        katalog.zusatz.jahr = Number(d.zusatznutzer.preis_jahr_cent || 0);
      }

      // Credit-Pakete
      var pakete = wurzel.querySelector(".paketliste");
      if (pakete && (d.credit_pakete || []).length) {
        pakete.textContent = "";
        d.credit_pakete.forEach(function (p) {
          var li = document.createElement("li");
          var s = document.createElement("span");
          s.textContent = zahl(p.credits) + " Credits";
          var b = document.createElement("b");
          b.textContent = geld(p.preis_cent);
          li.appendChild(s); li.appendChild(b);
          pakete.appendChild(li);
        });
      }

      // Die Credit-Tabelle
      var tabelle = wurzel.querySelector("[data-credittabelle] tbody");
      if (tabelle && (d.credit_preise || []).length) {
        tabelle.textContent = "";
        d.credit_preise.forEach(function (a) {
          var tr = document.createElement("tr");
          var td = document.createElement("td");
          td.textContent = a.name;
          if (a.beschreibung) {
            var s = document.createElement("span");
            // „Kostenfrei" sagt schon die Null in der Spalte daneben. Was
            // uebrig bleibt, faengt wieder gross an — sonst steht da
            // „es entsteht nichts Neues" mitten im Nichts.
            var rest = String(a.beschreibung).replace(/^Kostenfrei\s*[—–-]?\s*/i, "");
            s.textContent = rest.charAt(0).toUpperCase() + rest.slice(1);
            if (s.textContent) td.appendChild(s);
          }
          var tdc = document.createElement("td");
          tdc.textContent = zahl(a.credits);
          tr.appendChild(td); tr.appendChild(tdc);
          tabelle.appendChild(tr);
        });
      }

      // Die Fußzeile mit den Fristen
      var setz = function (wahl, wert) {
        var e = wurzel.querySelector(wahl);
        if (e) e.textContent = String(wert);
      };
      setz("[data-ust]", katalog.ust);
      setz("[data-mindest]", d.mindestlaufzeit_monate);
      setz("[data-test]", d.testphase_tage);
      setz("[data-testcredits]", zahl(d.testphase_credits));

      // Gründerpreis: nur zeigen, wenn wirklich Plätze frei sind.
      var band = wurzel.querySelector("[data-gruender]");
      var g = d.gruender || {};
      if (band && Number(g.frei) > 0) {
        var name = "Starter";
        (d.tarife || []).forEach(function (t) { if (t.schluessel === g.tarif) name = t.name; });
        setz("[data-gruender-satz]",
          "Die ersten " + zahl(g.plaetze) + " Abos im Tarif " + name + " bekommen "
          + geld(g.rabatt_cent) + " im Monat dauerhaft Nachlass — solange das Abo läuft.");
        setz("[data-gruender-frei]", zahl(g.frei));
        band.hidden = false;
        if (typeof planen === "function") planen();
      }

      zeichnen();
    }
  }

  // --- 6. Erscheinen beim Scrollen ---------------------------------------
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
