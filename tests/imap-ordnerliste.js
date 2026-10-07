// Liest der Abruf die Ordnerliste JEDES Servers — oder nur die von Microsoft?
//
// Am 07.10.2026 bekam ein frisch angebundenes Strato-Postfach beim Abruf
// null Ordner und null Mails, und der Abruf galt als gelungen. Der Grund:
// der Ausdruck, der die LIST-Antwort liest, kannte Ordnernamen nur OHNE
// Anfuehrungszeichen. Dovecot setzt sie hinein. Microsoft nicht — deshalb
// fiel es an den beiden Microsoft-Postfaechern nie auf.
//
// Diese Probe holt den Ausdruck aus der erzeugten Funktion — nicht aus
// einer Kopie, die auseinanderlaufen koennte — und fuettert ihn mit den
// Zeilen, wie die Server sie wirklich schicken, mitsamt dem "\r".
"use strict";
const fs = require("fs");
const path = require("path");

const quelle = path.join(__dirname, "..", "supabase", "functions", "mail-postfach-pull", "index.ts");
const text = fs.readFileSync(quelle, "utf8");
const treffer = text.match(/const m = line\.match\((\/\^\\\* LIST .*?\/i)\);/);
if (!treffer) {
  console.error("[FEHLER] In mail-postfach-pull/index.ts steht kein LIST-Ausdruck mehr an der erwarteten Stelle.");
  process.exit(1);
}
// Der Ausdruck wird so gebaut, wie ihn die Funktion baut: als Literal.
let ausdruck;
try { ausdruck = eval(treffer[1]); }
catch (e) { console.error("[FEHLER] LIST-Ausdruck nicht lesbar:", e.message); process.exit(1); }

function lies(zeile) {
  const m = zeile.match(ausdruck);
  if (!m) return null;
  return {
    flags: (m[1] || "").split(/\s+/).filter(Boolean),
    delimiter: m[2] || "/",
    name: (m[3] !== undefined ? m[3] : (m[4] || "")).trim(),
  };
}

const proben = [
  ["Microsoft: Name ohne Anfuehrungszeichen",      '* LIST (\\HasNoChildren) "/" INBOX\r',                 { name: "INBOX", delimiter: "/" }],
  ["Dovecot/Strato: Name in Anfuehrungszeichen",   '* LIST (\\HasNoChildren) "." "INBOX"\r',               { name: "INBOX", delimiter: "." }],
  ["Dovecot: Unterordner",                         '* LIST (\\HasNoChildren \\UnMarked) "." "INBOX.Sent"\r', { name: "INBOX.Sent", delimiter: "." }],
  ["Name mit Leerzeichen",                         '* LIST (\\HasNoChildren) "/" "Gesendete Elemente"\r',  { name: "Gesendete Elemente", delimiter: "/" }],
  ["Ohne Zeilenende-Rest",                         '* LIST (\\HasChildren) "/" "Archiv"',                  { name: "Archiv", delimiter: "/" }],
  ["Trenner NIL",                                  '* LIST (\\Noinferiors) NIL "INBOX"\r',                 { name: "INBOX", delimiter: "/" }],
  ["Keine LIST-Zeile",                             'A0003 OK LIST completed\r',                            null],
];

let schlecht = 0;
for (const [titel, zeile, soll] of proben) {
  const ist = lies(zeile);
  let ok;
  if (soll === null) ok = ist === null;
  else ok = !!ist && ist.name === soll.name && ist.delimiter === soll.delimiter;
  if (!ok) {
    schlecht++;
    console.error(`  [FEHLER] ${titel}\n           Zeile: ${JSON.stringify(zeile)}\n           ist:   ${JSON.stringify(ist)}\n           soll:  ${JSON.stringify(soll)}`);
  }
}
if (schlecht) {
  console.error(`${schlecht} von ${proben.length} Ordnerzeilen werden falsch gelesen.`);
  process.exit(1);
}
console.log(`  [ok] ${proben.length} Ordnerzeilen, wie die Server sie schicken — Microsoft ohne,`);
console.log(`       Dovecot mit Anfuehrungszeichen, Namen mit Leerzeichen, NIL als Trenner —`);
console.log(`       werden vom Ausdruck der erzeugten Funktion richtig gelesen.`);
