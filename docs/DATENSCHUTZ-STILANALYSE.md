# Stilanalyse aus eigenen Mails — datenschutzrechtliche Würdigung

**Stand 06.10.2026. Das ist keine Rechtsberatung.** Es ist die Einschätzung,
auf der die technische Umsetzung beruht, damit nachvollziehbar ist, warum
sie so gebaut ist. Ob die Verarbeitung im Einzelfall zulässig ist,
entscheidet der Mandant als Verantwortlicher — und das sollte er anwaltlich
prüfen lassen, bevor er die Funktion einschaltet.

Anlass: „dass wir die letzten 20, 30 versendeten Mails analysieren, um den
spezifischen Schreibstil rauszufinden — das aber wirklich nur unter der
Prämisse, dass die Kunden dem zustimmen, und da musst du
datenschutztechnisch das bitte prüfen." (Betreiber, 06.10.2026)

## 1. Worum es geht

Aus den zuletzt versendeten Mails eines Nutzers wird ein Profil seines
**Schreibstils** abgeleitet — Anrede, Tonfall, Satzlänge, wiederkehrende
Wendungen, Grußformel. Dieses Profil ersetzt den bisher fest verdrahteten
Stil in den KI-Antwortentwürfen.

## 2. Wer ist wofür verantwortlich

| | Wer |
|---|---|
| Verantwortlicher (Art. 4 Nr. 7 DSGVO) | **der Mandant** — es sind seine Postfächer und seine Korrespondenz |
| Auftragsverarbeiter (Art. 28) | die Plattform |
| Unterauftragsverarbeiter | der KI-Anbieter |

Daraus folgt: es braucht einen **Auftragsverarbeitungsvertrag** zwischen
Mandant und Plattform, und der KI-Anbieter muss darin als
Unterauftragsverarbeiter benannt sein. Beides liegt noch nicht vor —
`docs/OFFEN.md`.

## 3. Welche Daten betroffen sind

Versendete Mails enthalten personenbezogene Daten **Dritter**: Namen,
Anschriften, Telefonnummern, Mailadressen der Empfänger, dazu
Objektanschriften, Kaufpreise, Terminangaben. Teils auch Daten, die nach
Art. 9 besonders geschützt sein können (Gesundheit, Familienstand), wenn ein
Interessent so etwas von sich aus schreibt.

Für einen **Schreibstil** braucht man nichts davon.

## 4. Der entscheidende Punkt: die Zweckänderung

Die Mails wurden erhoben, um **Korrespondenz zu führen**. Sie auszuwerten,
um ein Stilprofil zu bilden, ist ein **anderer Zweck** (Art. 5 Abs. 1
lit. b, Zweckbindung). Das ist der eigentliche rechtliche Knackpunkt — nicht
die Speicherung.

Zwei Wege wären denkbar:

- **Berechtigtes Interesse (Art. 6 Abs. 1 lit. f).** Vertretbar, aber nicht
  risikofrei: die betroffenen Dritten rechnen nicht damit, dass ihre
  Korrespondenz für ein KI-Training ausgewertet wird, und eine
  Interessenabwägung müsste dokumentiert werden.
- **Einwilligung.** Nicht der Dritten — die sind nicht erreichbar —,
  sondern des **Nutzers**, dessen Mails es sind.

Umgesetzt ist der zweite Weg, flankiert durch Datenminimierung, die den
ersten überhaupt erst vertretbar macht.

## 5. Was die Technik leistet

### 5.1 Einwilligung je Nutzer, nicht je Mandant

Die Einwilligung erteilt die Person selbst, für ihr eigenes Postfach. Der
Chef kann sie **nicht** für seine Leute erteilen. Das ist in der Datenbank
erzwungen: die RLS-Richtlinie auf `mail_stilprofil` lässt nur
`benutzer_id = auth.uid()` zu.

Gespeichert wird der **Wortlaut**, dem zugestimmt wurde — nicht nur ein
Häkchen. Art. 7 Abs. 1 verlangt den Nachweis, und der heutige Text ist nicht
der von damals.

### 5.2 Widerruf löscht

Der Widerruf (Art. 7 Abs. 3) setzt nicht nur ein Kennzeichen, er **löscht
das Profil**. Ein Profil, das nach dem Widerruf noch dasteht und „nur nicht
mehr benutzt wird", ist weiterhin gespeichert und damit weiterhin eine
Verarbeitung.

### 5.3 Datenminimierung vor der Übermittlung

Bevor irgendetwas den Server verlässt, werden ersetzt: Mailadressen, Links,
Telefonnummern, Beträge, Postleitzahl + Ort, Anschriften, Datums- und
Zeitangaben, IBAN, Namen nach „Herr/Frau/Familie", Objekt- und
Aktenzeichen, dazu jede verbliebene Ziffernfolge ab vier Stellen.
Zusätzlich fallen zitierte Vorgängermails und der Signaturblock weg.

Die Schwärzung ist bewusst **grob und übervorsichtig**: lieber ein Wort zu
viel geschwärzt als eine Anschrift zu wenig. `tests/mail-stil.js` prüft sie
Zeile für Zeile — wenn dort eine Nummer durchrutscht, geht sie an einen
Anbieter.

Das setzt CLAUDE.md um: „Personenbezogene Daten an KI-Anbieter auf das
Minimum reduzieren."

### 5.4 Nur eigene Mails

Gelesen wird `mail_versendet` mit `versendet_von_user_id` = die Person
selbst. Nicht die Mails der Kollegen, nicht der Posteingang. Fremde Mails
wären ein anderer Verantwortlicher und ein anderer Zweck.

Automatisch erzeugte Mails sind ausgenommen — sie sind der Stil einer
Vorlage, nicht der eines Menschen.

### 5.5 Gespeichert wird nur das Profil

Keine Mailtexte, keine Ausschnitte, keine Beispielsätze mit Inhalt. Der
Auftrag an das Modell verbietet ausdrücklich, Inhaltliches in das Profil zu
übernehmen.

## 6. Was die Technik NICHT leisten kann

**Das Beschäftigtenverhältnis.** Gehört das Postfach einem Angestellten, ist
die Einwilligung nach § 26 Abs. 2 BDSG nur wirksam, wenn sie **freiwillig**
ist — und daran bestehen im Arbeitsverhältnis strukturelle Zweifel. Dass
niemand sie für einen anderen erteilen kann, ist notwendig, aber nicht
hinreichend. Hinzu kommen kann eine **Mitbestimmung des Betriebsrats**
(§ 87 Abs. 1 Nr. 6 BetrVG): eine Einrichtung, die geeignet ist, Verhalten
oder Leistung zu überwachen. Ein Stilprofil aus den eigenen Mails ist nah
genug daran, dass die Frage gestellt werden muss.

→ **Ein Mandant mit Angestellten sollte vor dem Einschalten Betriebsrat und
Anwalt fragen.** Die Software kann das nicht für ihn klären.

**Die Information der Dritten.** Art. 13/14 verlangen Transparenz gegenüber
den Betroffenen — also den Empfängern der Mails. Das gehört in die
Datenschutzerklärung des Mandanten. Die Plattform kann sie nicht für ihn
schreiben.

**Die Rechtsgrundlage selbst.** Die Einwilligung des Nutzers deckt seine
eigenen Daten. Für die Daten der Dritten in seinen Mails bleibt es bei einer
Abwägung nach lit. f — plausibel, weil nach der Schwärzung kaum noch
Personenbezug übrig ist, aber eben eine Abwägung, die der Verantwortliche
treffen und dokumentieren muss.

**Ort der Verarbeitung.** Der KI-Anbieter sitzt außerhalb der EU. CLAUDE.md
verlangt, den Provider-Layer austauschbar zu halten, damit EU-Residenz ohne
Architekturänderung möglich ist. Das ist hier eingehalten (ein `fetch` an
einer Stelle), aber es ist eine Möglichkeit und kein erreichter Zustand.

## 7. Was nicht behauptet wird

Dass die Verarbeitung damit zulässig **ist**. CLAUDE.md: „Keine vollständige
DSGVO-Konformität behaupten; offene juristische Punkte markieren." Die
offenen Punkte sind Abschnitt 6 und der fehlende AV-Vertrag.

## 8. Checkliste vor dem Einschalten

- [ ] Auftragsverarbeitungsvertrag zwischen Mandant und Plattform
- [ ] KI-Anbieter als Unterauftragsverarbeiter benannt
- [ ] Verzeichnis von Verarbeitungstätigkeiten ergänzt (Art. 30)
- [ ] Abwägung nach Art. 6 Abs. 1 lit. f dokumentiert
- [ ] Datenschutzerklärung des Mandanten ergänzt
- [ ] bei Angestellten: Betriebsrat beteiligt, § 26 BDSG geprüft
- [ ] Löschfristen festgelegt (das Profil altert mit den Mails)
