# Neutralität — Blockliste und Gate

**Verbindlich.** Gilt für `dist/index.html`, `src/**`, `supabase/functions/**`,
`supabase/migrations/**`, `assets/**` und jede erzeugte Datei (PDF, DOCX, XML,
E-Mail).

immoOffice.ai ist ein Fork der E&P World. Der Fork darf **an keiner Stelle**
erkennen lassen, woher er stammt. Alles Firmenbezogene kommt zur Laufzeit aus
`firma_stammdaten` des jeweiligen Mandanten — nicht aus dem Code.

## 1. Blockliste (Build bricht bei Treffer ab)

Geprüft wird ohne Rücksicht auf Groß- und Kleinschreibung.

### Namen und Marken
```
Engfer
E&P
EP World
EPWorld
epworld
Engfer & Partner
engferundpartner
```

### Kennungen des Referenzsystems
```
yazwkzzjiquprtjpurur          Supabase-Ref der Referenz
epworld.netlify.app           Auslieferung der Referenz
```

### Anschrift, Kontakt, Register
Konkrete Werte stehen **nicht** in dieser Datei — sie würden sie selbst zur
Fundstelle machen. Das Gate liest sie aus `scripts/neutral-muster.txt`, die
nicht versioniert ist. Geprüft werden: Straße, Ort, Telefon- und Faxnummern,
E-Mail-Adressen und Domains, IBAN, USt-IdNr., Handelsregisternummer,
Registergericht, Geschäftsführer- und Mitarbeiternamen,
Sachverständigen-Registriernummer.

### Fremdmarken, die mit dem Referenzbetrieb verbunden sind
```
sipgate        Telefonie der Referenz — entfällt
Yodeck         Shop-TV der Referenz — entfällt
JotForm        kein Kennzeichen der Referenz, sondern ein Fremdprodukt
               wie onOffice. Nur der Sync auf das Konto der Referenz
               entfällt (Cron-Job, zwei Edge Functions). Tabelle
               jotform_formulare und die Spalten in mietanfragen
               bleiben — Phase 9 verbietet das Entfernen.
Sprengnetter   Bewertungsschnittstelle der Referenz — entfällt
```

## 2. Was **kein** Treffer ist

Diese Begriffe bleiben erlaubt, weil sie Fachbegriffe oder legitime Partner
sind und nicht auf die Referenz verweisen:

`onOffice` · `Propstack` · `FlowFact` · `ImmoScout24` · `Immowelt` ·
`Kleinanzeigen` · `OpenImmo` · `Microsoft 365` · `Google` · `Resend` ·
`Stripe` · `Supabase` · `Netlify` · `CARTO` · `Montserrat` · `Poppins`

## 3. Code-Identifier

Nicht nur Zeichenketten, auch Namen im Code werden umbenannt. Beispiele aus der
Referenz und ihre Entsprechung:

| Referenz | immoOffice.ai |
|---|---|
| `EngferLeft`, `EngferLogo` | `MarkeLinks`, `MarkeLogo` |
| `EP_TOKEN`, `EP_EXPOSE_MODE` | `FREIGABE_TOKEN`, `FREIGABE_MODUS` |
| `window._ep…`, `window.__ep…` | `ep`-Bus in `src/10-basis/bus.js` |

Der Bus-Name `ep` selbst ist **kein** Treffer: Er steht für „eigenes Portal"
und ist in `src/10-basis/bus.js` so dokumentiert. Eine Umbenennung hätte jeden
Aufrufer im Fork berührt, ohne die Herkunft weniger sichtbar zu machen.

## 4. Herkunft von Firmenangaben

| Angabe | Quelle zur Laufzeit |
|---|---|
| Firmenname, Rechtsform, Register | `firma_stammdaten` |
| Anschrift, Telefon, E-Mail, Web | `firma_stammdaten` |
| Logo, Signaturbild | Bucket `branding/{firma_id}/…` |
| Primär-/Akzentfarbe, Schrift | `firma_stammdaten.ci_primaer`, `ci_akzent`, `ci_font` |
| Provisionssätze, Standardtexte | `firma_stammdaten` |
| Vertrags-, Mail-, Marketingvorlagen | neutrale Musterfassungen, je Mandant überschreibbar |

Fehlt ein Logo, tritt eine Wortmarke aus dem Firmennamen an seine Stelle. Fehlen
Farben, gilt die Plattform-CI.

**Musterfirma für Demo und Bildschirmfotos:** „Musterhaus Immobilien GmbH".

## 5. Rechtstexte

Vertrags-, Widerrufs- und Datenschutztexte der Referenz werden **ersetzt**, nicht
übernommen. Musterfassungen tragen im Fuß „Muster ohne rechtliche Gewähr".
Platzhalter `[[BETREIBER]]` darf nicht live gehen — das Gate vor Stripe-Live
prüft das.

## 6. Ausführung

```bash
npm run neutral      # nur das Gate
npm run check        # Build + Syntax + Smoke + Gate + tests/mandant.sql
```

Das Gate ist Teil von `npm run check`. Kein Commit ohne grünes `check`.


## Nachtrag 14.09.2026 — was der Schema-Export konkret ergeben hat

Die Blockliste ist keine Vorsichtsmaßnahme; im Schema der Vorlage standen
tatsächlich Kennzeichen. Gefunden und ersetzt (vollständige Liste mit Begründung
je Stelle in `scripts/neutralisieren.py`):

| Ort | Art |
|---|---|
| `firma_stammdaten` | 13 Spalten-Standardwerte: Firmenname, Anschrift, E-Mail, Registergericht, HRB, Geschäftsführer, Steuernummer, USt-IdNr., Bank, IBAN, BIC, Grußformel |
| `kosten_saetze` | Büroanschrift und Bürokoordinaten als Standardwert |
| `provision_tracker` | Vorname eines Mitarbeiters als Standardwert |
| `vertraege`, `objektnachweise`, `reservierungen_neubau` | Standort der Referenz als Standardwert |
| `mail_eingang_anfrage_vorfilter()` | Maildomain der Referenz fest im Code |
| `portal_importbericht_auswerten()` | Anzeigen-Pfad des Kleinanzeigen-Kontos der Referenz |
| `rechnung_vorlage_aus_objektnachweis()` | Auswahl des Absenders über den Firmennamen |
| drei Funktionen, 33 Cron-Jobs | URL des fremden Supabase-Projekts, dazu dessen anon-Schlüssel im Klartext |

**Keine erfundenen Ersatzdaten.** Wo es keine sinnvolle Vorbelegung gibt —
Anschrift, Bankverbindung, Steuernummern —, entfällt der Standardwert, statt
eine Musteradresse oder eine Fantasie-IBAN einzusetzen. Nur beim Firmennamen
steht ein erkennbarer Platzhalter, weil die Spalte `not null` ist.
