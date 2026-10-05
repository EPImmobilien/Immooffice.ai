# Exposé-Vorlagen — Stand

Auftrag: drei Exposé-Vorlagen (`raster`, `signature`, `studio`) in
immoOffice.ai. Design-Referenz: `reference/expose-vorlagen/` (nicht
versioniert), drei ReportLab-Prototypen mit den zugehörigen PDFs.

## Phase 0 — was schon da ist (05.10.2026)

Die Exposé-Erzeugung des Forks existiert und ist umfangreich. Sie wird
**wiederverwendet, nicht neu gebaut.**

### Edge Function `expose-pdf-erzeugen`

1.835 Zeilen, rund 110 Funktionen. Vorhanden und zu übernehmen:

| Baustein | Was er leistet |
|---|---|
| Bildladen | bevorzugt die Web-Fassung `…_web.jpg`, sonst das Original; erzeugt sie bei Bedarf und legt sie ab |
| Lageplan | erzeugt automatisch einen Lageplan und legt ihn als `immobilie_datei` (Kategorie `lageplan`) ab |
| Distanzen | Overpass über **vier** Spiegel, mit Rückfall |
| Courtage | Parser für die Provisionsangaben |
| Zeichenbreiten | Zwischenspeicher gegen das CPU-Limit der Laufzeit |
| `expose_debug` | Schritt-für-Schritt-Protokoll in einer eigenen Tabelle |

### Felder, die es schon gibt

`immobilien`: `expose_slogan`, `expose_highlights`, `lage_distanzen`,
`raumaufteilung`, `expose_titelbild_id`, `provisionsfrei`, `vertragsart`.
`immobilie_datei`: `expose_ausschliessen`, `expose_final`.
Tabellen: `finanzierungs_annahmen`, `expose_debug`, `expose_freigaben`.

In der Oberfläche steht der Exposé-Reiter der Objektseite (26 Fundstellen
der genannten Felder).

### Was fehlte und mit `fork_34` dazukommt

`immobilien`: `expose_vorlage`, `expose_zitat`, `expose_titel_zeilen`,
`expose_ausstattung_gruppen`, `expose_preis_auf_anfrage`, `expose_wege`.
`firma_stammdaten`: `expose_vorlage`, `expose_farben`,
`expose_rechtsanhang`.

### Das alte Layout

Das bisherige Layout der Function ist das Design der Vorlage und wird nach
dem Auftrag **nicht mehr ausgeliefert**. Es wird durch die drei Vorlagen
ersetzt, nicht neben ihnen behalten.

## Phase 1 — Datenbank

`fork_34`, angewendet am 05.10.2026.

**Zur Nummer:** angewendet wurde sie als `fork_33_expose_vorlagen`. Am
selben Tag hat der nächtliche Abgleich `fork_33a` bis `fork_33c` belegt, und
zwar früher. Die Datei heißt deshalb `fork_34`; in
`supabase_migrations.schema_migrations` steht weiter der Name von damals. Eine
angewendete Migration wird nicht umbenannt.

## Phasen 2 bis 5

Noch offen. Wird hier fortgeschrieben.
