# Preise und Wirtschaftlichkeit

**Stand:** 16.08.2026 · Master-Prompt Abschnitte 14 und 17
**Alle Beträge sind Nettobeträge in Euro, ohne Umsatzsteuer.**

> Die Zahlenteile dieses Dokuments werden von `scripts/guv-modell.py` erzeugt.
> Preise, Tarifmix, Kundenzahlen, Kündigungsquoten, Credit-Auslastung und Kosten
> stehen dort im Block `ANNAHMEN` und lassen sich ändern, ohne eine Formel
> anzufassen (Vorgabe aus Abschnitt 17). Neu erzeugen mit:
>
> ```bash
> python3 scripts/guv-modell.py --markdown
> ```

---

## 1. Öffentliche Preisübersicht

Diese Tabelle ist der Stand für die Außendarstellung. Sie enthält **keine** internen
Kosten und keine Margen (Abschnitt 17).

| Tarif | Benutzer | Monatlich | Jährlich | Credits/Monat |
|---|---:|---:|---:|---:|
| Starter | 1 | 29,99 € | 299,90 € | 300 |
| Professional | 3 | 99,99 € | 999,90 € | 1.500 |
| Business | 10 | 199,99 € | 1.999,90 € | 4.000 |
| Enterprise | individuell | auf Anfrage | auf Anfrage | individuell |

Zusätzlicher Benutzer: 14,99 € monatlich beziehungsweise 149,90 € jährlich.
Das Jahresabo entspricht zehn Monatsbeiträgen — zwei Monate Preisvorteil.

| Credit-Paket | Credits | Preis |
|---|---:|---:|
| Klein | 250 | 9,99 € |
| Mittel | 1.000 | 29,99 € |
| Groß | 3.000 | 69,99 € |

Testphase: 7 Tage, ein Benutzer, 100 Credits, keine Abbuchung ohne ausdrückliche
Tarifwahl und gültiges Zahlungsmandat.

## 2. Credits je Aktion

| Aktion | Credits |
|---|---:|
| einzelner KI-Text oder Textvariante | 2 |
| vollständige Exposé-Texterstellung | 10 |
| Marketingtext / Social-Media-Paket | 5 |
| einfache Bildoptimierung | 10 |
| umfangreiche Bildbearbeitung oder Homestaging | 30 |
| Grundrissvisualisierung | 30 |
| versendeter Signaturvorgang je Dokumentenpaket | 5 |
| **PDF-Export bestehender Inhalte** | **0** |
| **Web-Exposé-Veröffentlichung ohne neue KI-Erstellung** | **0** |

Ein Credit ist eine interne Nutzungseinheit, kein Euro-Guthaben.

## 3. Herleitung der variablen Kosten

> **Diese Werte sind Annahmen, keine Ist-Zahlen.** Sie beruhen auf den
> Größenordnungen aktueller Anbieterpreise für Text- und Bildmodelle und sind vor
> dem Produktivbetrieb an realen Abrechnungen nachzumessen. Abschnitt 17 verlangt
> ausdrücklich, keine fehlenden Ist-Zahlen zu erfinden — deshalb ist die Herleitung
> hier offengelegt und im Modell an **einer** Stelle änderbar.

| Aktion | Credits | Angenommene Kosten | Kosten je Credit |
|---|---:|---:|---:|
| KI-Text, kurz | 2 | 0,012 € | 0,0060 € |
| Exposé-Text vollständig | 10 | 0,060 € | 0,0060 € |
| Bildoptimierung einfach | 10 | 0,060 € | 0,0060 € |
| Homestaging / Grundriss | 30 | 0,200 € | 0,0067 € |
| Signaturvorgang | 5 | 0,020 € | 0,0040 € |

Angenommene Nutzungsverteilung der verbrauchten Credits: 45 % Text, 45 % Bild,
10 % Signatur und Sonstiges. Daraus folgt ein gewichteter Wert von rund
**0,0061 € je Credit**; mit dem geforderten Sicherheitspuffer von 20 % rechnet das
Modell mit **0,0073 € je Credit**.

Für den Worst Case — überdurchschnittlich viele hochwertige Bildbearbeitungen —
rechnet das Modell mit **0,0095 € je Credit**.

Weitere variable Kosten je Mandant und Monat: Zahlungsabwicklung 2,0 % zuzüglich
0,25 € je Zahlung, Speicher 0,50 €, E-Mail 0,10 €.

## 4. Anmerkung zu den Fixkosten

Die Kostentabelle aus Abschnitt 17 nennt als Summe 1.250 €. Die aufgeführten
Einzelpositionen ergeben addiert jedoch **1.300 €**:

150 + 150 + 150 + 50 + 50 + 250 + 250 + 250 = 1.300

Das Modell rechnet mit der Summe der Einzelpositionen (1.300 €), weil diese
konkreter sind als der Gesamtwert. **Diese Abweichung ist zu klären** — sie ändert
den rechnerischen Break-even um knapp einen Mandanten.

Die Positionen KI-Textgenerierung, Bildgenerierung und Zahlungsabwicklung (zusammen
350 €) sind laut Abschnitt 17 zugleich nutzungsabhängig. Um sie nicht doppelt zu
zählen, behandelt das Modell sie als Sockel: Erst wenn der tatsächliche Verbrauch
diese 350 € übersteigt, wird der Mehrbetrag zusätzlich als variable Kosten angesetzt.
Deshalb erscheinen die variablen Kosten in den ersten Monaten sehr niedrig — sie sind
im Fixkostensockel bereits enthalten.

## 5. Annahmen im Überblick

| Annahme | Wert | Herkunft |
|---|---|---|
| Tarifmix | 55 % Starter, 35 % Professional, 10 % Business | Abschnitt 17 |
| Credit-Auslastung | 60 % | Abschnitt 17 |
| Sicherheitspuffer auf API-Kosten | 20 % | Abschnitt 17 |
| Kundenentwicklung | linear zwischen den Jahresendwerten | Abschnitt 17 |
| Anteil Jahreszahler | 30 % | **eigene Annahme** |
| Kündigungsquote je Monat | 3,5 % / 2,5 % / 2,0 % je Szenario | **eigene Annahme** |
| Zusatznutzer je Mandant | 0,1 / 0,3 / 0,6 je Tarif | **eigene Annahme** |
| Credit-Paketkäufe | 12 % der Mandanten je Monat, im Mittel 29,99 € | **eigene Annahme** |
| Enterprise-Umsätze | nicht modelliert | vorsichtige Betrachtung, Abschnitt 17 |

Enterprise bleibt bewusst außen vor: Ohne Preis lässt sich kein belastbarer Beitrag
rechnen. Jeder Enterprise-Abschluss verbessert das Ergebnis gegenüber diesem Modell.

---

# 6. Ergebnisse des Modells

_Erzeugt von `scripts/guv-modell.py`. Nicht von Hand bearbeiten._

## Jahresuebersicht je Szenario

| Szenario | Jahr | Kunden Ende | Umsatz | Variable Kosten | Fixkosten | Ergebnis | ARR Ende |
|---|---:|---:|---:|---:|---:|---:|---:|
| konservativ | 1 | 20 | 9 704,14 | 78,00 | 17 100,00 | -7 473,86 | 17 915,33 |
| konservativ | 2 | 50 | 32 471,54 | 261,20 | 15 600,00 | 16 610,34 | 44 788,33 |
| konservativ | 3 | 90 | 64 196,60 | 2 339,44 | 15 600,00 | 46 257,17 | 80 618,99 |
| realistisch | 1 | 35 | 16 982,24 | 136,50 | 17 100,00 | -254,26 | 31 351,83 |
| realistisch | 2 | 100 | 62 890,27 | 2 302,27 | 15 600,00 | 44 988,00 | 89 576,65 |
| realistisch | 3 | 220 | 147 801,48 | 10 855,91 | 15 600,00 | 121 345,57 | 197 068,63 |
| ambitioniert | 1 | 60 | 29 112,41 | 339,66 | 17 100,00 | 11 672,75 | 53 745,99 |
| ambitioniert | 2 | 200 | 121 674,95 | 8 194,51 | 15 600,00 | 97 880,44 | 179 153,30 |
| ambitioniert | 3 | 450 | 300 455,02 | 26 406,08 | 15 600,00 | 258 448,94 | 403 094,93 |


## Deckungsbeitrag je Tarif (je Mandant und Monat)

| Tarif | Erloes | Variable Kosten | Deckungsbeitrag | Marge | Inklusiv-Credits | Wirtschaftliche Obergrenze |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 29,91 | 2,76 | 27,15 | 90,8 % | 300 | 3.899 |
| Professional | 99,26 | 9,41 | 89,86 | 90,5 % | 1500 | 13.209 |
| Business | 198,53 | 22,34 | 176,19 | 88,7 % | 4000 | 26.536 |


## Credit-Pakete

| Paket | Credits | Preis | Variable Kosten | Deckungsbeitrag | Marge | Preis je Credit |
|---|---:|---:|---:|---:|---:|---:|
| Klein | 250 | 9,99 | 2,27 | 7,72 | 77,2 % | 0,0400 € |
| Mittel | 1000 | 29,99 | 8,15 | 21,84 | 72,8 % | 0,0300 € |
| Gross | 3000 | 69,99 | 23,55 | 46,44 | 66,4 % | 0,0233 € |


## Kennzahlen je Szenario

| Szenario | Churn/Monat | ARPA | DB je Mandant | Bruttomarge | CAC | LTV | LTV/CAC | Break-even | Amortisation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| konservativ | 3,5 % | 74,65 | 64,00 | 90,1 % | 88,20 | 1 828,66 | 20.7 | Monat 11 | Monat 20 |
| realistisch | 2,5 % | 74,65 | 64,00 | 90,1 % | 48,29 | 2 560,13 | 53.0 | Monat 7 | Monat 13 |
| ambitioniert | 2,0 % | 74,65 | 64,00 | 90,1 % | 25,38 | 3 200,16 | 126.1 | Monat 4 | Monat 8 |


Rechnerischer Break-even: **20.3 Mandanten** (Fixkosten 1 300,00 / Deckungsbeitrag 64,00).


## Monatliche GuV, realistisches Szenario, Monate 1-24

| Monat | Kunden | Neu | Abgang | Umsatz | Variable Kosten | Fixkosten | Ergebnis | Kumuliert |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3 | 2.9 | 0.0 | 217,72 | 1,75 | 2 800,00 | -2 584,03 | -2 584,03 |
| 2 | 6 | 3.0 | 0.1 | 435,44 | 3,50 | 1 300,00 | -868,06 | -3 452,09 |
| 3 | 9 | 3.1 | 0.1 | 653,16 | 5,25 | 1 300,00 | -652,09 | -4 104,17 |
| 4 | 12 | 3.1 | 0.2 | 870,88 | 7,00 | 1 300,00 | -436,12 | -4 540,29 |
| 5 | 15 | 3.2 | 0.3 | 1 088,61 | 8,75 | 1 300,00 | -220,14 | -4 760,43 |
| 6 | 18 | 3.3 | 0.4 | 1 306,33 | 10,50 | 1 300,00 | -4,17 | -4 764,61 |
| 7 | 20 | 3.4 | 0.4 | 1 524,05 | 12,25 | 1 300,00 | 211,80 | -4 552,81 |
| 8 | 23 | 3.4 | 0.5 | 1 741,77 | 14,00 | 1 300,00 | 427,77 | -4 125,04 |
| 9 | 26 | 3.5 | 0.6 | 1 959,49 | 15,75 | 1 300,00 | 643,74 | -3 481,30 |
| 10 | 29 | 3.6 | 0.7 | 2 177,21 | 17,50 | 1 300,00 | 859,71 | -2 621,59 |
| 11 | 32 | 3.6 | 0.7 | 2 394,93 | 19,25 | 1 300,00 | 1 075,68 | -1 545,91 |
| 12 | 35 | 3.7 | 0.8 | 2 612,65 | 21,00 | 1 300,00 | 1 291,65 | -254,26 |
| 13 | 40 | 6.3 | 0.9 | 3 016,99 | 24,25 | 1 300,00 | 1 692,74 | 1 438,48 |
| 14 | 46 | 6.4 | 1.0 | 3 421,33 | 27,50 | 1 300,00 | 2 093,83 | 3 532,31 |
| 15 | 51 | 6.6 | 1.1 | 3 825,67 | 39,70 | 1 300,00 | 2 485,96 | 6 018,28 |
| 16 | 57 | 6.7 | 1.3 | 4 230,01 | 80,89 | 1 300,00 | 2 849,12 | 8 867,39 |
| 17 | 62 | 6.8 | 1.4 | 4 634,35 | 122,08 | 1 300,00 | 3 212,27 | 12 079,66 |
| 18 | 68 | 7.0 | 1.6 | 5 038,69 | 163,27 | 1 300,00 | 3 575,42 | 15 655,08 |
| 19 | 73 | 7.1 | 1.7 | 5 443,03 | 204,46 | 1 300,00 | 3 938,57 | 19 593,64 |
| 20 | 78 | 7.2 | 1.8 | 5 847,36 | 245,65 | 1 300,00 | 4 301,72 | 23 895,36 |
| 21 | 84 | 7.4 | 2.0 | 6 251,70 | 286,83 | 1 300,00 | 4 664,87 | 28 560,23 |
| 22 | 89 | 7.5 | 2.1 | 6 656,04 | 328,02 | 1 300,00 | 5 028,02 | 33 588,25 |
| 23 | 95 | 7.6 | 2.2 | 7 060,38 | 369,21 | 1 300,00 | 5 391,17 | 38 979,42 |
| 24 | 100 | 7.8 | 2.4 | 7 464,72 | 410,40 | 1 300,00 | 5 754,32 | 44 733,74 |


## Sensitivitaet

| Veraenderung | DB je Mandant | Bruttomarge | Break-even (Mandanten) |
|---|---:|---:|---:|
| Basis | 64,00 | 90,1 % | 20.3 |
| Worst Case Bildbearbeitung | 62,56 | 88,1 % | 20.8 |
| API-Kosten verdoppelt | 59,23 | 83,4 % | 21.9 |
| API-Kosten verfuenffacht | 44,91 | 63,2 % | 28.9 |
| Preise -10 % | 57,35 | 89,2 % | 22.7 |
| Preise +10 % | 70,66 | 90,8 % | 18.4 |


### Churn-Sensitivitaet (realistisches Szenario)

| Churn/Monat | Lebensdauer | LTV | LTV/CAC |
|---:|---:|---:|---:|
| 1,5 % | 67 Monate | 4 266,88 | 81.5 |
| 2,0 % | 50 Monate | 3 200,16 | 63.7 |
| 2,5 % | 40 Monate | 2 560,13 | 53.0 |
| 3,0 % | 33 Monate | 2 133,44 | 45.9 |
| 4,0 % | 25 Monate | 1 600,08 | 37.0 |
| 5,0 % | 20 Monate | 1 280,06 | 31.7 |


---

# 7. Einordnung der Ergebnisse

Dieser Abschnitt ist bewusst nicht generiert. Er ordnet ein, was die Zahlen oben
aussagen — und was nicht.

## 7.1 Die Deckungsbeiträge sind belastbar

Rund 90 % Bruttomarge je Mandant sind für Software dieser Art plausibel. Auch die
Sensitivitätsrechnung stützt das: Selbst bei **verfünffachten** API-Kosten bleibt die
Marge bei 63 % und der Break-even steigt nur von 20 auf 29 Mandanten. Die
Credit-Preise sind damit nicht knapp kalkuliert, sondern haben erheblichen Puffer.

Auch der Worst Case aus Abschnitt 17 — überdurchschnittlich viele hochwertige
Bildbearbeitungen — kostet nur rund zwei Prozentpunkte Marge. Der Grund: Selbst wenn
ein Starter-Kunde seine 300 Inklusiv-Credits vollständig in Homestaging umsetzt,
entstehen etwa 2,00 € Kosten bei 29,99 € Erlös.

Die wirtschaftliche Obergrenze je Tarif liegt weit über dem Inklusivkontingent — beim
Starter bei rund 3.900 Credits gegenüber 300 enthaltenen. Erst ab dem Dreizehnfachen
des Kontingents würde ein Mandant unrentabel. Das Risiko einer Übernutzung ist damit
gering; die Begrenzung auf ein Kontingent dient eher der Erwartungssteuerung als dem
Kostenschutz.

## 7.2 Die Akquisekennzahlen sind **nicht** belastbar

Ein LTV/CAC-Verhältnis von 53 im realistischen Szenario ist kein realistisches
Ergebnis, sondern eine direkte Folge der Vorgabe. Der CAC ergibt sich hier allein aus
dem gesetzten Marketingbudget von 250 € monatlich, geteilt durch die vorgegebene
Kundenzahl. Beides sind Vorgaben aus Abschnitt 17, keine Marktbeobachtungen.

**Die eigentliche Frage kehrt sich damit um:** Nicht „was kostet ein Kunde?“, sondern
„reichen 250 € im Monat, um 35 Maklerbetriebe im ersten Jahr zu gewinnen?“ Im
deutschen B2B-Softwaremarkt liegen die Akquisekosten für einen Kunden dieser
Größenordnung erfahrungsgemäß eher im dreistelligen Bereich. Bei 250 € Monatsbudget
und einem angenommenen CAC von 300 € wären rund zehn Neukunden im Jahr finanzierbar,
nicht fünfunddreißig.

Das Modell rechnet die Vorgabe korrekt durch. Die Kundenzahlen der Szenarien sind
jedoch als **Ziel** zu lesen, nicht als Ergebnis des Marketingbudgets. Wer sie
erreichen will, braucht entweder ein höheres Budget, einen wesentlichen Anteil
Empfehlungsgeschäft oder Direktvertrieb, dessen Zeitaufwand in den 250 € „Personal“
nicht enthalten ist.

**Empfehlung:** Vor Gate B sollten CAC-Annahme und Marketingbudget gemeinsam
festgelegt werden. Bis dahin sind LTV, CAC und LTV/CAC als rechnerische Größen zu
behandeln, nicht als Planungsgrundlage.

## 7.3 Break-even

Der rechnerische Break-even liegt bei rund **20 Mandanten**. Das ist die belastbarste
Aussage dieses Modells, weil sie nur von Preisen, Kosten und Tarifmix abhängt — alles
Größen, die feststehen oder eng eingegrenzt sind.

Alle drei Szenarien erreichen diese Schwelle im ersten Jahr. Der Unterschied liegt im
Zeitpunkt: Monat 4 im ambitionierten, Monat 7 im realistischen, Monat 11 im
konservativen Szenario.

## 7.4 Die 1.500 € Erstentwicklung

Abschnitt 17 bezeichnet diese Zahl selbst als Modellannahme für die
Wirtschaftlichkeitsrechnung, nicht als Maßstab für den Umfang der Phasen. Das ist
zutreffend und wird hier ausdrücklich bestätigt: **Der in den Abschnitten 5 bis 16
beschriebene Funktionsumfang ist mit 1.500 € nicht herstellbar.** Die ehrliche
Aufwandsschätzung je Phase steht in [`docs/UMSETZUNGSPLAN.md`](docs/UMSETZUNGSPLAN.md).

Für die Cashflow-Betrachtung ist der Betrag ohne große Wirkung: Er verschiebt die
Amortisation im realistischen Szenario um etwa einen Monat. Würde man stattdessen den
tatsächlichen Entwicklungsaufwand ansetzen, verschöbe sich die Amortisation um Jahre —
das ist die eigentlich relevante Aussage.

## 7.5 Was das Modell nicht abbildet

- **Enterprise-Umsätze** — mangels Preis nicht bezifferbar; jeder Abschluss verbessert
  das Ergebnis.
- **Umsatzsteuer** — durchlaufender Posten, alle Beträge sind Nettobeträge.
- **Zahlungsausfälle** — bei Lastschrift und Karte im B2B-Bereich vorhanden, hier
  nicht angesetzt.
- **Kostensteigerungen über die Zeit** — Preise und Kosten bleiben nominal konstant.
  Die Sensitivitätsrechnung deckt die Bandbreite ab.
- **Saisonalität** des Immobilienmarkts.
