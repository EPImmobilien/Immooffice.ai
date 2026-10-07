// firma-ermitteln (fork_82): Die Function liest, sie schreibt nicht; jeder
// Wert braucht einen Beleg; interne Ziele sind gesperrt; die Oberflaeche
// uebernimmt nur ins Formular. Und die Pfad-Verweise kennen ihre Ziele.
const fs = require('fs');
let fehler = 0, n = 0;
function melde(name, ok, bem) { n++; if (!ok) { fehler++; console.log('  [FEHLER] ' + name + (bem ? ' — ' + bem : '')); } }
const q = fs.readFileSync('supabase/eigene/firma-ermitteln/index.ts', 'utf8');
melde('rechnet ueber die Beilage ab (Notschalter, Tageslimit, Modellwahl)', /kiAbrechnen\(req, "firma_ermitteln"/.test(q));
melde('gibt die Reservierung frei, wenn die Website nicht laedt', /abr\.freigeben\("website nicht erreichbar"\)/.test(q));
melde('schreibt in keine Tabelle (kein Supabase-Client ausser der Beilage)', !/createClient|\.rpc\(|\.insert\(|\.update\(|\.upsert\(/.test(q));
melde('ohne Beleg kein Wert', /wert && beleg \? wert : null/.test(q));
melde('keine internen Ziele (localhost, IP, .local)', /localhost/.test(q) && /\.local/.test(q) && /\[\\d\.\]\+/.test(q));
melde('Antwort nur nach Weiterleitung auf erlaubte Adresse', /erlaubteAdresse\(r\.url\)/.test(q));
melde('Modell aus der KI-Steuerung', /abr\.modell\(MODELL\)/.test(q));
melde('Systemprompt verbietet Raten', /Nichts ergaenzen, nichts raten/.test(q));
melde('Marke: Farben werden gewichtet, Papier und Tinte fallen heraus', /s >= 0\.12 && l > 0\.08 && l < 0\.92/.test(q));
melde('Marke: theme-color und Markenvariablen zaehlen mehr', /theme-color/.test(q) && /primary\|primär\|primaer\|brand/.test(q));
melde('Marke: Schriften ohne Icon-Fonts und Systemschriften', /SYSTEM_SCHRIFTEN/.test(q) && /icon\|awesome/.test(q));
melde('Logo-Modus: nur Bilder, hoechstens 3 MB', /image\\\/\(png\|jpeg/.test(q) && /3 \* 1024 \* 1024/.test(q));
melde('Logo-Modus: ohne KI und ohne Reservierung', /modus \|\| ""\) === "logo"[\s\S]{0,400}bildHolen/.test(q));
const ui = fs.readFileSync('src/eigene/firma-ermitteln.js', 'utf8');
melde('Oberflaeche schreibt nicht selbst in firma_stammdaten', !/from\("firma_stammdaten"\)\.(update|insert|upsert)/.test(ui));
melde('Vorhandenes wird nicht ungefragt ueberschrieben', /&& !f\[k\]/.test(ui));
melde('Beleg steht neben jedem Vorschlag', /x\.beleg/.test(ui));
melde('Logo geht denselben Weg wie der Upload: branding-assets, Pfad logos/, Freistellen angeboten', /branding-assets/.test(ui) && /"logos\/" \+/.test(ui) && /ImmoLogoFreistellen\.oeffnen/.test(ui));
melde('Farben und Schrift landen als ci_primaer/ci_akzent/ci_font im Formular', /w\.ci_primaer/.test(ui) && /w\.ci_akzent/.test(ui) && /w\.ci_font/.test(ui));
const pf = fs.readFileSync('src/eigene/pfad.js', 'utf8');
for (const ziel of ['einstellungen/firma', 'einstellungen/abrechnung', 'einstellungen/supportzugriffe', 'marketing', 'posteingang']) {
  melde('Pfad bekannt: ' + ziel, pf.includes('"' + ziel + '"'));
}
const zer = fs.readFileSync('scripts/oberflaeche-zerlegen.py', 'utf8');
melde('Einstellungen lesen den Reiter aus dem Pfad', /window\._immoEinstellungenReiter \|\| "firma"/.test(zer));
melde('Beilage credits.ts liegt bei firma-ermitteln', /'firma-ermitteln',\s*#/.test(fs.readFileSync('scripts/neutralisieren-funktionen.py', 'utf8')));
melde('verify_jwt steht fest', /\[functions\.firma-ermitteln\]\nverify_jwt = true/.test(fs.readFileSync('supabase/config.toml', 'utf8')));
if (fehler) { console.log(`  ${fehler} von ${n} Pruefungen gescheitert.`); process.exit(1); }
console.log(`  [ok] ${n} Pruefungen: firma-ermitteln liest nur mit Beleg und schreibt nicht; die Oberflaeche\n       uebernimmt ins Formular; Pfad-Verweise kennen ihre Ziele.`);
