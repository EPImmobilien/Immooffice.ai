// auth-mail (fork_88): die Anmelde-Mails von Supabase, deutsch und im Namen
// der Firma. Statische Pruefungen — Signatur ist Pflicht, Mandant aus dem
// Profil, deutsche Texte je Anlass, kein Platzhalter-Absender.
const fs = require('fs');
let fehler = 0, n = 0;
function melde(name, ok, bem) { n++; if (!ok) { fehler++; console.log('  [FEHLER] ' + name + (bem ? ' — ' + bem : '')); } }
const q = fs.readFileSync('supabase/eigene/auth-mail/index.ts', 'utf8');
melde('Signatur wird gegen AUTH_HOOK_SECRET geprueft, Zeitstempel hoechstens 5 Minuten alt', /AUTH_HOOK_SECRET/.test(q) && /webhook-signature/.test(q) && /TOLERANZ_S = 5 \* 60/.test(q));
melde('ohne gueltige Signatur passiert nichts (401 vor jeder Arbeit)', /if \(!\(await signaturGueltig\(req, body\)\)\) return antwort\(\{ error: \{ http_code: 401/.test(q));
melde('Vergleich der Signatur in konstanter Zeit', /zeitkonstantGleich/.test(q));
melde('Mandant aus dem Profil des Nutzers, nie aus dem Koerper', /from\("profiles"\)\.select\("mandant_id"\)\.eq\("id", user\.id\)/.test(q) && !/body\.mandant|daten\.mandant/.test(q));
melde('Marke der Firma: Name, Logo (signiert, privater Bucket), Farbe', /branding-assets/.test(q) && /createSignedUrl\(f\.logo_pfad, 60 \* 60 \* 24 \* 30\)/.test(q) && /ci_primaer/.test(q));
melde('ohne Mandant neutral als immoOffice, kein Platzhalter-Absender', /"immoOffice"/.test(q) && !/immooffice\.example/.test(q));
for (const art of ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'reauthentication']) melde('deutscher Text fuer ' + art, new RegExp('\\b' + art + ': \\{ betreff: "').test(q));
melde('Link auf /auth/v1/verify mit token_hash, Typ und Rueckkehradresse', /auth\/v1\/verify\?token=\$\{encodeURIComponent\(tokenHash\)\}&type=/.test(q));
melde('Code steht in der Mail, wenn Supabase einen liefert', /ed\.token \? String\(ed\.token\)/.test(q));
melde('Antwort an Supabase: {} bei Erfolg, error.http_code bei Fehler', /return antwort\(\{\}\);/.test(q) && /error: \{ http_code: 500/.test(q));
melde('HTML-Mail und Textfassung', /opts\.html/.test(fs.readFileSync('supabase/eigene-beilagen/_bautraeger/bautraeger.ts', 'utf8')) && /html\(m,/.test(q));
melde('config: kein JWT (Supabase ruft mit Signatur)', /\[functions\.auth-mail\]\nverify_jwt = false/.test(fs.readFileSync('supabase/config.toml', 'utf8')));
melde('Gate kennt den Hook', /'auth-mail': \('webhook-signature'/.test(fs.readFileSync('tests/funktionen-oeffentlich.py', 'utf8')));
melde('Beilage geht an auth-mail', /'auth-mail',\s*#/.test(fs.readFileSync('scripts/neutralisieren-funktionen.py', 'utf8')));
melde('AUTH_HOOK_SECRET dokumentiert', /AUTH_HOOK_SECRET/.test(fs.readFileSync('.env.example', 'utf8')) && /AUTH_HOOK_SECRET/.test(fs.readFileSync('docs/SECRETS.md', 'utf8')));
melde('Anleitung mit Rueckfall-Vorlagen vorhanden', fs.existsSync('docs/AUTH_MAILS.md') && /Send Email Hook/.test(fs.readFileSync('docs/AUTH_MAILS.md', 'utf8')) && /Confirm signup/.test(fs.readFileSync('docs/AUTH_MAILS.md', 'utf8')));
if (fehler) { console.log(`  ${fehler} von ${n} Pruefungen gescheitert.`); process.exit(1); }
console.log(`  [ok] ${n} Pruefungen: auth-mail prueft die Signatur, nimmt den Mandanten aus dem Profil\n       und schreibt deutsch im Namen der Firma.`);
