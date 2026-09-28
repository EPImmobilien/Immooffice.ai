// Die Rechnung hinter dem Fuellen der Vorlagen.
//
// Geprueft wird hier, was ohne Browser pruefbar ist — und das ist genau der
// Teil, an dem es schiefgeht:
//
//   immoTrefferInLaeufen   Word zerlegt einen Satz in mehrere <w:t>-Laeufe,
//                          gern mitten im Wort. Die markierte Stelle steht im
//                          XML also selten am Stueck. Welche Laeufe der
//                          Treffer beruehrt und was vorn und hinten
//                          stehenbleibt, entscheidet sich hier.
//
//   immoZeilenUmbrechen    Umbruch auf die Breite des markierten Kastens.
//   immoPasstEs            Verkleinern bis zur Untergrenze; was dann nicht
//                          passt, kommt auf eine Anlage.
//
// NICHT geprueft: das Setzen der XML-Knoten und das Stempeln selbst. Dafuer
// braeuchte es einen Browser mit DOMParser und pdf-lib.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const quelle = fs.readFileSync(path.join(__dirname, "..", "src", "app", "anwendung.js"), "utf8");

// Nur die drei Funktionen aus der Oberflaeche holen. Die ganze Datei
// auszufuehren ginge nicht — sie erwartet React, einen Browser und ein
// angemeldetes Supabase.
function hole(name) {
  const start = quelle.indexOf("\nfunction " + name + "(");
  if (start < 0) throw new Error("Funktion " + name + " steht nicht in src/app/anwendung.js.");
  // Bis zur naechsten Funktion auf Spaltenebene.
  const rest = quelle.slice(start + 1);
  const ende = rest.search(/\n(?:async )?function [A-Za-z0-9_]+\s*\(/);
  return rest.slice(0, ende < 0 ? undefined : ende);
}

const kasten = { console };
vm.createContext(kasten);
for (const n of ["immoTrefferInLaeufen", "immoZeilenUmbrechen", "immoPasstEs"]) {
  vm.runInContext(hole(n), kasten);
}
const { immoTrefferInLaeufen, immoZeilenUmbrechen, immoPasstEs } = kasten;

const befund = [];
const pruefe = (text, bedingung, bemerkung) =>
  befund.push({ text, gut: bedingung === true, bemerkung: bemerkung || "" });

// --- 1) Der Treffer liegt in einem einzigen Lauf --------------------------
{
  const e = immoTrefferInLaeufen(["Dauer von 6 Monaten"], "6", 0, 1);
  pruefe("Treffer in einem Lauf",
    !!e.fund && e.fund.von === 0 && e.fund.bis === 0
      && e.fund.vorne === "Dauer von " && e.fund.hinten === " Monaten",
    JSON.stringify(e.fund));
}

// --- 2) Der Treffer reicht ueber mehrere Laeufe ---------------------------
// Genau der Fall, der die alte Ersetzung scheitern liess: Word hat den Satz
// nach der Rechtschreibpruefung zerschnitten.
{
  const e = immoTrefferInLaeufen(["Dauer von ", "6 Mo", "naten"], "6 Monaten", 0, 1);
  pruefe("Treffer ueber drei Laeufe",
    !!e.fund && e.fund.von === 1 && e.fund.bis === 2
      && e.fund.vorne === "" && e.fund.hinten === "",
    JSON.stringify(e.fund));
}

// --- 3) Mitten im Wort zerschnitten ---------------------------------------
{
  const e = immoTrefferInLaeufen(["Herr Mus", "termann wohnt"], "Mustermann", 0, 1);
  pruefe("Treffer mitten im Wort zerschnitten",
    !!e.fund && e.fund.von === 0 && e.fund.bis === 1
      && e.fund.vorne === "Herr " && e.fund.hinten === " wohnt",
    JSON.stringify(e.fund));
}

// --- 4) Das zweite Vorkommen ----------------------------------------------
// "Musterstadt" steht dreimal im Vertrag; gemeint ist der Ort der
// Unterzeichnung, nicht die Anschrift.
{
  const texte = ["Musterstadt, den ", "1. Mai. Anschrift: Musterstadt. ", "Musterstadt."];
  const eins = immoTrefferInLaeufen(texte, "Musterstadt", 0, 1);
  const zwei = immoTrefferInLaeufen(texte, "Musterstadt", 0, 2);
  const drei = immoTrefferInLaeufen(texte, "Musterstadt", 0, 3);
  pruefe("Das erste, zweite und dritte Vorkommen sind unterscheidbar",
    !!eins.fund && !!zwei.fund && !!drei.fund
      && eins.fund.von === 0 && zwei.fund.von === 1 && drei.fund.von === 2,
    [eins.fund && eins.fund.von, zwei.fund && zwei.fund.von, drei.fund && drei.fund.von].join(", "));
}

// --- 5) Ueber Absaetze hinweg wird weitergezaehlt -------------------------
// Der Absatz kennt nur seine eigenen Laeufe; die Zaehlung laeuft ueber das
// ganze Dokument. Waere das falsch, traefe die Ersetzung den falschen Satz.
{
  const ersterAbsatz = immoTrefferInLaeufen(["Musterstadt"], "Musterstadt", 0, 2);
  const zweiterAbsatz = immoTrefferInLaeufen(["Musterstadt"], "Musterstadt",
    ersterAbsatz.gesehen, 2);
  pruefe("Die Zaehlung laeuft ueber Absatzgrenzen hinweg",
    ersterAbsatz.fund === null && ersterAbsatz.gesehen === 1
      && !!zweiterAbsatz.fund,
    "erster Absatz: " + ersterAbsatz.gesehen + ", zweiter trifft: " + !!zweiterAbsatz.fund);
}

// --- 6) Steht die Stelle nicht mehr da, wird nichts angefasst -------------
{
  const e = immoTrefferInLaeufen(["Ein ganz anderer Text"], "Dauer von 6 Monaten", 0, 1);
  pruefe("Fehlende Stelle liefert keinen Treffer", e.fund === null, "kein Fund");
}

// --- 7) Umbruch auf die Breite des Kastens --------------------------------
// Eine Schrift, bei der jedes Zeichen genau so breit ist wie die Groesse —
// damit laesst sich die Rechnung im Kopf nachvollziehen.
const schrift = { widthOfTextAtSize: (t, g) => t.length * g };
{
  const zeilen = immoZeilenUmbrechen("Anna Beispiel Musterweg", schrift, 10, 140);
  pruefe("Umbruch auf die Kastenbreite",
    zeilen.length === 2 && zeilen[0] === "Anna Beispiel" && zeilen[1] === "Musterweg",
    JSON.stringify(zeilen));
}
{
  const zeilen = immoZeilenUmbrechen("Erbengemeinschaft\n\nErbe 1: Anna", schrift, 10, 400);
  pruefe("Ein Absatzwechsel bleibt ein Absatzwechsel",
    zeilen.length === 3 && zeilen[1] === "", JSON.stringify(zeilen));
}
{
  // Ein Wort, das allein schon zu breit ist, wird NICHT zerschnitten. Ein in
  // der Mitte gebrochener Name waere schlimmer als ein Ueberstand.
  const zeilen = immoZeilenUmbrechen("Donaudampfschifffahrt", schrift, 10, 50);
  pruefe("Ein zu breites Wort wird nicht zerschnitten",
    zeilen.length === 1, JSON.stringify(zeilen));
}

// --- 8) Verkleinern, bis es passt ----------------------------------------
{
  const feld = { breite: 100, hoehe: 40, schriftgroesse: 11, mindest_schriftgroesse: 7 };
  const passt = immoPasstEs("Anna Beispiel", schrift, feld);
  pruefe("Was passt, bleibt in der Ausgangsgroesse",
    !!passt && passt.groesse === 11, passt ? "Groesse " + passt.groesse : "passt nicht");
}
{
  // Dreizehn Zeichen bei Groesse 11 waeren 143 Punkte breit — zu viel fuer
  // 100. Bei 7 sind es 91, und eine Zeile von 8,4 Punkten passt in 12.
  const feld = { breite: 100, hoehe: 12, schriftgroesse: 11, mindest_schriftgroesse: 7 };
  const passt = immoPasstEs("Anna Beispiel", schrift, feld);
  pruefe("Zu breit heisst: kleiner setzen",
    !!passt && passt.groesse < 11 && passt.zeilen.length === 1,
    passt ? "Groesse " + passt.groesse : "passt nicht");
}
{
  // Eine Erbengemeinschaft in einem Kasten fuer einen Namen. Auch bei 7
  // Punkten braucht das mehr Hoehe als da ist — das gehoert auf eine Anlage.
  const feld = { breite: 100, hoehe: 12, schriftgroesse: 11, mindest_schriftgroesse: 7 };
  const viele = "Erbe 1: Anna Beispiel\nErbe 2: Bernd Beispiel\nErbe 3: Clara Beispiel";
  pruefe("Was auch klein nicht passt, kommt auf die Anlage",
    immoPasstEs(viele, schrift, feld) === null, "kein Ergebnis — also Anlage");
}
{
  // Die Untergrenze ist eine Grenze, keine Empfehlung.
  const feld = { breite: 100, hoehe: 12, schriftgroesse: 11, mindest_schriftgroesse: 11 };
  pruefe("Ohne Spielraum wird gar nicht erst verkleinert",
    immoPasstEs("Anna Beispiel", schrift, feld) === null, "kein Ergebnis");
}

// --- Bericht --------------------------------------------------------------
let schlecht = 0;
befund.forEach((b, i) => {
  if (!b.gut) schlecht++;
  console.log(`  ${b.gut ? "[ok]    " : "[FEHLER]"} ${i + 1}. ${b.text}`
    + (b.bemerkung ? `  —  ${b.bemerkung}` : ""));
});
if (schlecht) {
  console.log(`\n[FEHLER] ${schlecht} von ${befund.length} Pruefungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`\n[ok] Alle ${befund.length} Pruefungen bestanden.`);
console.log("     NICHT geprueft: das Setzen der XML-Knoten und das Stempeln —");
console.log("     dafuer braeuchte es einen Browser mit DOMParser und pdf-lib.");
