# Der Plattform-Bereich

Stand 06.10.2026. Der Bereich des Betreibers — nicht des Maklers.

Er erscheint als eigene Kachel, aber nur für Konten, die in
`plattform_admins` stehen. Ob jemand darin steht, entscheidet nicht die
Oberfläche: die Kachel auszublenden ist Bequemlichkeit, die Sperre steht in
der Edge Function `plattform-admin` und prüft dieselbe Liste bei jeder
einzelnen Aktion.

## Die Grenze

CLAUDE.md: „Plattform-Administratoren erhalten keinen automatischen Zugriff
auf Mandantendaten; Supportzugriff nur protokolliert und nach dem Prinzip
der geringsten Rechte."

Diese Grenze verläuft **nicht** bei „Daten über einen Mandanten" — Tarif,
Status, Nutzerzahl und Verbrauch braucht jeder, der Rechnungen schreibt —,
sondern bei **Daten aus einem Mandanten**: keine Immobilie, kein Kontakt,
keine Mail, keine Datei.

`tests/plattform-admin.js` prüft das gegen eine Liste **erlaubter** Tabellen
und nicht gegen eine Liste verbotener. Eine Verbotsliste ist am Tag ihrer
Entstehung vollständig und danach nie wieder.

| Erlaubt | Warum |
|---|---|
| `plattform_*` | das eigene Regal des Betreibers |
| `mandanten`, `mandant_abo` | die Vertragsbeziehung |
| `credit_konten`, `credit_buchungen` | Guthaben und Verbrauch, also Abrechnung |
| `abo_erinnerungen` | welche Fristmeldung schon hinausging |
| `support_sitzungen` | der Zugriff selbst |
| `profiles` | nur, um Konten zu zählen und zu verwalten |

## Die fünf Reiter

**Zahlen.** Monatserlös aus laufenden Abos (ein Jahresabo zählt mit einem
Zwölftel), Abos nach Status, Credit-Verbrauch und Anbieterkosten der letzten
30 Tage, freie Gründerplätze, Verbrauch nach Aktion. Wo der Anbieter keinen
Preis je Aufruf nennt, steht das als eigene Spalte da — eine geschätzte Zahl
wäre schlimmer als eine fehlende.

**Mandanten.** Liste mit Zugriff, Nutzern, Saldo und Monatserlös; je Haus
eine eigene Tafel. Dort lassen sich Name, Tarif, Abo-Status, Testphase,
Zusatznutzer und Mindestlaufzeit setzen, das Haus sperren und entsperren,
Credits gutschreiben — und das Haus löschen. Jede Änderung verlangt einen
Grund.

> Wer bei Stripe ein laufendes Abo hat, bekommt den Hinweis dazu: was hier
> gesetzt wird, ist der Vertragsstand in der Datenbank, und der nächste
> Webhook überschreibt ihn mit dem, was Stripe meldet.

**Konten.** Alle Konten über alle Häuser, mit Suche. Das Plattform-Recht
lässt sich vergeben und entziehen — aber nicht dem letzten, der es hat:
sonst käme niemand mehr in diesen Bereich.

**Katalog.** Tarife, Credit-Preise, Credit-Pakete und die Plattformwerte
(Fristen, Grenzen, Sätze). Änderbar ist nur, was in einer Liste steht; keine
Stripe-Kennung und keine Mandantenzuordnung. Sonst liesse sich über dieselbe
Aktion `stripe_price_id` setzen, und ein Tarif zeigte auf ein fremdes
Produkt.

**System.** Zustand der Zeitplan-Jobs (letzter Lauf, letzter Ausgang, Fehler
der letzten 24 Stunden) und die Oberflächenfehler der Kunden, verdichtet nach
Haus und Schlüssel. **Ohne Wortlaut und Stapelspur** — dort steht, woran ein
Kunde gerade gearbeitet hat.

**Protokoll.** Was ein Plattform-Administrator geändert hat, mit Person,
Zeit, Gegenstand und Vorher/Nachher. Ein Trigger verweigert Änderung und
Löschung; eine Richtlinie allein genügte nicht, weil der Dienstschlüssel sie
umgeht.

## Supportzugriff

Für den Fall, dass ein Kunde anruft und man sehen muss, was er sieht.

Eine Sitzung verlangt einen **Grund**, läuft **von selbst ab** (höchstens
vier Stunden, voreingestellt eine), steht im Protokoll — und **der betroffene
Mandant kann sie nachlesen**. Ein Supportzugriff, den der Betroffene nicht
sehen kann, ist kein protokollierter, sondern ein unbemerkter.

Standardmäßig wird **nur gelesen**. Das Gefälle entsteht an einer Stelle: die
restriktiven Richtlinien benutzten dieselbe Funktion für `using` und
`with check`. Seit fork_54 sind es zwei — `aktuelle_mandant_id()` fürs Sehen,
`mandant_id_schreiben()` fürs Schreiben. Für jeden normalen Nutzer liefern
beide denselben Wert.

In der Anwendung steht während einer Sitzung ein rotes Band über jeder Seite:
in wessen Daten man gerade ist, ob man ändern darf, und warum. Es lässt sich
nicht wegklicken.

### Zwei Dinge, die `tests/supportzugriff.sql` gefunden hat

1. Während einer Sitzung fiel die **eigene Profilzeile** aus der Sicht — und
   fast jede freigebende Richtlinie der Vorlage fragt nach der eigenen Rolle.
   Der Administrator sah: nichts. Die eigene Zeile bleibt jetzt immer
   sichtbar.
2. **`with check` gilt nicht für DELETE.** Eine Lese-Sitzung hätte alles
   löschen können, was sie sehen darf, und die Trennung sah dabei vollständig
   aus. Jede Tabelle mit Mandantentrennung trägt jetzt eine zweite
   restriktive Richtlinie nur fürs Löschen (197 Stück).

22 Prüfungen halten das fest: ohne Sitzung nichts, mit Sitzung genau einer,
nach Ablauf und nach Beendigung nichts, ohne Plattform-Recht nichts — und ein
entzogenes Recht beendet eine laufende Sitzung sofort.

## Wer Administrator ist

Eingetragen wird in `plattform_admins`. Am 06.10.2026 steht dort ein Konto:
das des Betreibers (`info@engferundpartner.de`). Weitere ernennt man im
Reiter **Konten**; jede Ernennung und jeder Entzug steht im Protokoll.

```sql
-- Falls der Bereich einmal für niemanden sichtbar sein sollte:
insert into public.plattform_admins (benutzer_id, notiz)
select id, 'Betreiber' from public.profiles where email = '…';
```
