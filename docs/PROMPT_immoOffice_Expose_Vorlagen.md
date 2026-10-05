# Auftrag: Drei Exposé-Vorlagen in immoOffice.ai einbauen

Arbeite autonom, ohne Rückfragen (siehe docs/AUTONOMIE.md). Halte dich an docs/NEUTRALITAET.md: nirgends „Engfer“, „E&P“ oder E&P-Daten, auch nicht in Code-Kommentaren, Defaults oder Seed-Daten.

## Ziel

Makler in immoOffice.ai sollen für jedes Objekt ein Exposé-PDF in einer von drei Vorlagen erzeugen können:

| Schlüssel | Name | Charakter | Farbe 1 | Farbe 2 |
|---|---|---|---|---|
| `raster` | Raster (Standard) | modern, weiche Karten, Plus Jakarta Sans | Primär | Akzent |
| `signature` | Signature (Luxus) | Magazin-Stil, Papierton, Cormorant Garamond + Plus Jakarta Sans | Dunkelton | Metallakzent |
| `studio` | Studio (grafisch) | Swiss-Stil, Signalflächen, Archivo Condensed | Signalfarbe | Dunkelton |

Die Design-Referenz liegt unter `reference/expose-vorlagen/`:
- `immoOffice_expose_generator.py` (Raster), `immoOffice_luxus_generator.py` (Signature), `immoOffice_studio_generator.py` (Studio): ReportLab-Prototypen mit Beispieldaten. Maße, Abstände, Schriftgrößen, Farbableitung (`theme()`) und Seitenaufbau sind verbindlich und 1:1 zu übernehmen.
- Die zugehörigen PDFs zeigen das Soll-Ergebnis.

Die Bildplatzhalter (gezeichnete Häuser/Villa/Fassaden), die stilisierten Karten und Grundrisse in den Prototypen sind NUR Platzhalter. Im Produkt kommen dort echte Objektfotos, der generierte Lageplan und die hochgeladenen Grundrisse hin. Fehlt ein Bild, entfällt der Bildbereich bzw. die Seite (siehe Seitenlogik).

## Phase 0: Bestand prüfen (nicht überspringen)

1. Prüfe im Repo und im Supabase-Projekt `immooffice` (ref `usguiggfciavwzkdfjgt`), ob die Exposé-Erzeugung aus dem Fork bereits existiert (Edge Function `expose-pdf-erzeugen`, Exposé-Reiter in der Objektseite, Felder wie `expose_slogan`, `expose_highlights`, `lage_distanzen`, `raumaufteilung`, `expose_titelbild_id`, `expose_ausschliessen`, Tabelle `finanzierungs_annahmen`).
2. Halte das Ergebnis kurz in `docs/EXPOSE_VORLAGEN_STAND.md` fest und baue auf dem Vorhandenen auf. Alles, was das Fork-Exposé an Logik schon kann (Bildladen mit `_web.jpg`-Cache, Lageplan-Generator, Distanzen per Overpass, Courtage-Parser, Zeichenbreiten-Cache gegen CPU-Limit, Debug-Tabelle), wird wiederverwendet und nicht neu erfunden.
3. Das bisherige Fork-Exposé-Layout ist das alte E&P-Design und darf in immoOffice NICHT mehr ausgeliefert werden. Es wird durch die drei Vorlagen ersetzt.

## Phase 1: Datenbank (Migration `expose_vorlagen`)

An `firma_stammdaten` (Mandanten-Ebene):
- `expose_vorlage text default 'raster'` mit check in ('raster','signature','studio')
- `expose_farben jsonb default '{}'`: optionale Überschreibung je Vorlage, z. B. `{"raster":{"f1":"#0F4C5C","f2":"#E8915A"},"signature":{...},"studio":{...}}`. Leer bedeutet: Farbe 1 = `ci_primaer`, Farbe 2 = `ci_akzent`. Ausnahme Studio: Farbe 1 = `ci_akzent`, Farbe 2 = `ci_primaer`.
- `expose_rechtsanhang boolean default true`

An `immobilien` (alles nullable, Objekt-Ebene):
- `expose_vorlage text`: Override je Objekt, null = Mandanten-Default
- `expose_zitat text`: Prolog-Zitat (Signature) bzw. Pull-Quote (Raster)
- `expose_titel_zeilen jsonb`: optional manuell umbrochener Covertitel (Signature 2 Zeilen, Studio bis 3 Zeilen); sonst automatischer Umbruch
- `expose_ausstattung_gruppen jsonb`: `[{"titel":"Architektur","punkte":[...]}]` für Signature; fehlt es, wird die normale Ausstattung in 4 Blöcke verteilt
- `expose_preis_auf_anfrage boolean default false`
- `expose_wege jsonb`: Wegezeiten (Studio) `[{"ziel":"S-Bahn","fuss":7,"rad":3,"auto":3}]`; fehlt es, Minuten aus `lage_distanzen` ableiten (zu Fuß 12 min/km, Rad 4 min/km, Auto 2 min/km + 1, gerundet)

RLS wie bestehende Spalten der Tabellen. TypeScript-Typen neu generieren, falls verwendet.

## Phase 2: Schriften

1. Lade die Variable Fonts aus github.com/google/fonts (ofl/plusjakartasans, ofl/cormorantgaramond inkl. Italic, ofl/archivo) und erzeuge mit fontTools-Instancer statische TTFs: genau die Schnitte, die in den Prototypen registriert werden (`Jak-*`, `Corm-*`, `Arch-*`). Wichtig: Name-Tabelle je Instanz eindeutig setzen (nameID 1/4/6), sonst verwechselt pdf-lib die Schnitte.
2. Lege die TTFs im Repo unter `assets/fonts/expose/` ab und lade sie in den Storage-Bucket `branding-assets/expose-fonts/` (Bucket anlegen, falls nicht vorhanden). Die Function lädt sie von dort und cached sie.
3. Mandanten-Schriften: Bei **Raster** ersetzt eine hinterlegte Mandanten-Schrift (`ci_font` bzw. die Schriften aus der Branding-Einstellung) die Plus Jakarta Sans vollständig. Bei **Signature** und **Studio** ersetzt sie nur die Fließtext- und Labelschrift, die Headline-Schrift (Cormorant bzw. Archivo Condensed) bleibt fest, weil sie das Design trägt.

## Phase 3: Edge Function

- Eine Function `expose-pdf-erzeugen` (bestehende erweitern) mit Body `{immobilie_id, modus:"pdf", vorlage?:string, vorschau?:boolean}`.
- Vorlagenwahl: Body > `immobilien.expose_vorlage` > `firma_stammdaten.expose_vorlage` > `raster`.
- Code-Struktur: gemeinsamer Kern (Datenladen, Bilder, Fonts, Text-Helfer mit Zeichenbreiten-Cache, Blocksatz, Umbruch, `theme()`-Farbableitung mit `mix()` exakt wie im Python) plus je Vorlage ein Modul `vorlagen/raster.ts`, `vorlagen/signature.ts`, `vorlagen/studio.ts`.
- Farben: `theme()` je Vorlage 1:1 aus dem Python übernehmen, inkl. Studio-Automatik für Text auf heller Signalfarbe (Luminanz > 0,62 → Dunkelton).
- Logo: Mandanten-Logos (hell/dunkel) aus dem `branding`-Bucket. Auf dunklen Flächen das helle Logo, sonst das dunkle. Kein Logo hinterlegt: Firmenname als Wortmarke in der Headline-Schrift.
- Bilder: proportional füllen und beschneiden (cover-fit per Clipping), wie im Fork. Titelbild = `expose_titelbild_id`, Rest in Reihenfolge, `expose_ausschliessen` beachten.
- Verlaufs-Scrim (Signature-Cover, Kontaktseite): pdf-lib kann keine Alpha-Verläufe. Daher übereinanderliegende Rechtecke mit kleinem Alpha (wie `scrim()` im Python) oder ein vorab erzeugtes PNG mit Alpha-Verlauf einbetten.
- QR-Code: Link auf das Web-Exposé des Objekts bzw. die Website des Mandanten, als Vektor-Rechtecke.
- Seitenlogik: Seiten ohne Daten entfallen (keine Grundrisse → keine Grundrissseite; keine Energiedaten → Energieblock weg, Seite wird verdichtet; Mietobjekt → keine Nebenkosten/Rendite/Käuferprovision; `provisionsfrei` → keine Courtage-Zeilen; `expose_preis_auf_anfrage` → „auf Anfrage“, keine Kostenrechnung). Seitenzahlen und Kapitelnummern werden nach dem tatsächlichen Seitenplan vergeben.
- Rechtsanhang: wenn `expose_rechtsanhang`, nach der Kontaktseite eine Seite im jeweiligen Vorlagen-Stil mit Widerrufsbelehrung und Muster-Widerrufsformular. Die Texte kommen aus den Vertragsvorlagen des Mandanten, sonst neutrale Muster-Texte mit Hinweis „Muster ohne rechtliche Gewähr“. Für Mietobjekte entfällt der Anhang.
- Ergebnis wie bisher in Storage plus `immobilie_datei` (doktyp Exposé). Bei `vorschau:true` stattdessen nur ein signierter Link mit 1 h Gültigkeit, ohne Dateieintrag.
- CPU-Budget beachten (Fork-Erfahrung: Worker-Kill bei ca. 8 s CPU): Fonts nicht subsetten, Bilder über den `_web.jpg`-Cache, Zeichenbreiten cachen.

## Phase 4: Oberfläche

1. **Einstellungen → Branding / Exposé:**
   - Kachelauswahl der drei Vorlagen mit Vorschaubild. Die Vorschaubilder als PNG aus den Referenz-PDFs erzeugen und unter `assets/expose-vorlagen/` ablegen.
   - Pro Vorlage zwei Farbwähler, vorbelegt aus der CI; „Auf CI zurücksetzen“.
   - Schalter Rechtsanhang.
   - Knopf „Beispiel-PDF ansehen“: Vorschau mit Demo-Daten „Musterhaus Immobilien GmbH“ in den aktuellen Farben.
2. **Objektseite → Exposé-Reiter:**
   - Dropdown „Vorlage“ (Mandanten-Default vorausgewählt).
   - Felder je nach gewählter Vorlage einblenden: Zitat, Titelzeilen, Ausstattungsgruppen-Editor (4 Gruppen à n Punkte), „Preis auf Anfrage“, Wegezeiten-Editor mit Knopf „Aus Distanzen berechnen“.
   - Knöpfe „Vorschau“ und „Exposé erzeugen“.
3. Rechte: Wer Exposés erzeugen darf, folgt dem bestehenden Rechte-System. Die Mandanten-Einstellungen sind nur für die Rolle `chef` bzw. Admin.

## Phase 5: Test und Abnahme

1. Lege im Demo-Mandanten drei Testobjekte an: Einfamilienhaus (Kauf), Villa mit „Preis auf Anfrage“, Penthouse-ETW (Kauf, vermietbar mit Miete). Erzeuge je Objekt alle drei Vorlagen und dazu je eine Variante mit heller Signal- bzw. Primärfarbe (Kontrastprüfung).
2. Prüfe die PDFs visuell, indem du die Seiten rendern lässt und die PNGs ansiehst:
   - keine Überläufe
   - Textfarbe auf Farbflächen lesbar
   - Seiten entfallen korrekt
   - Neutralitäts-Gate: Suche im Code und in den PDF-Texten nach „Engfer“, „E&P“, „engferundpartner“ ergibt null Treffer
3. Committen, pushen (Netlify baut per GitHub), Function deployen. Danach in `docs/EXPOSE_VORLAGEN_STAND.md` eintragen, was erledigt ist, wo die Test-PDFs liegen und was offen bleibt.
