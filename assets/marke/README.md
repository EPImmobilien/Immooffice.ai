# Die Marke von immoOffice.ai

`quelle/` ist die Lieferung, **unverändert**. `assets/marke/` ist das, was
Anwendung und Website wirklich benutzen; erzeugt wird es mit

```bash
python3 scripts/marke-aufbereiten.py          # die SVGs
python3 scripts/marke-aufbereiten.py --icons  # zusätzlich die PNG-Icons
```

**Nichts hier von Hand bearbeiten.** `npm run check` erzeugt die Dateien neu
und vergleicht; eine Handänderung fällt dort auf und ist beim nächsten Lauf
wieder weg. Änderungen gehören in `scripts/marke-aufbereiten.py`.

## Was erzeugt wird

| Datei | Wofür |
|---|---|
| `immooffice-logo.svg` | Logo auf hellem Grund — der Normalfall |
| `immooffice-logo-invers.svg` | Logo auf dunklem Grund |
| `immooffice-logo-weiss.svg` | einfarbig weiß |
| `immooffice-logo-schwarz.svg` | einfarbig schwarz, Fax und Graustufendruck |
| `immooffice-logo-auf-navy.svg` | mit eigener dunkler Fläche |
| `immooffice-logo-auf-weiss.svg` | mit eigener heller Fläche |
| `immooffice-bildmarke.svg` | Haus und Netz, quadratisch, ohne Wortmarke |
| `immooffice-bildmarke-invers.svg` | dieselbe auf dunklem Grund |
| `immooffice-haus.svg` | nur das Haus — für kleine Größen |
| `immooffice-haus-invers.svg` | dasselbe auf dunklem Grund |
| `icons/*.png` | Favicon und Touch-Icons, 16 bis 180 px |

Unter etwa 48 px wird das Netz-Motiv zu einem Fleck. Deshalb bekommen
`favicon-16` und `favicon-32` das Haus allein, die größeren Icons die ganze
Bildmarke.

## Drei Dinge, die das Skript tut

1. **Farben auf die Plattform-CI.** Die Lieferung trägt Blau `#263159` und
   Gold `#D4A567`. Das sind genau die beiden Farben, die am 28.09.2026 als
   Kennzeichen des Referenzunternehmens entfernt worden sind. Entscheidung
   des Auftraggebers vom 06.10.2026: die **Form** der Lieferung gilt, die
   **Farben** bleiben die der Plattform — `#1B2A47` und `#B5934F`.
   Getauscht werden zwei Füllwerte; an der Zeichnung ändert sich nichts.
2. **Die Bildmarke wird herausgeschnitten** — über den `viewBox`-Ausschnitt,
   nicht über die Pfaddaten. Haus und Netz enden bei x=401, die Wortmarke
   beginnt bei x=438; dazwischen liegt kein einziger Punkt.
3. **Die Zahlen werden gekürzt.** Die Lieferung schreibt jeden Punkt als
   `145.00,12.00`. Ohne die bedeutungslosen Nullen ist dieselbe Zeichnung
   halb so groß — das zählt, weil die Anwendung eine einzige `index.html`
   ist.

## Die Druckdateien

`quelle/*.pdf` sind die CMYK-Druckdateien der Lieferung. Sie tragen die
**Farben der Lieferung**, nicht die der Plattform — umfärben lassen sie
sich hier nicht verlässlich.

> **Vor dem ersten Druckauftrag:** entweder einen neuen Export in
> `#1B2A47` / `#B5934F` anfordern, oder bewusst entscheiden, dass im Druck
> die Farben der Lieferung gelten. Beides ist vertretbar; stillschweigend
> auseinanderlaufen darf es nicht.

Die Lieferung selbst merkt zum Druck an: Konturen aus einer Bildvorlage
nachgezeichnet, alle Schriftzüge sind Pfade, CMYK rechnerisch umgerechnet
und nicht für ein Papierprofil zertifiziert, keine Beschnittzugabe, keine
PDF/X-Zertifizierung. Das endgültige Layout muss die Druckerei mit ihrem
Zielprofil ausgeben.
