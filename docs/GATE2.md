# Gate 2 — Mandantenfähigkeit und Selbstregistrierung

*Stand 29.09.2026. Der Auftrag vom 14.09.2026 setzt drei Freigabepunkte;
dies ist der zweite: **Ende Phase 3, Mandantenfähigkeit und
Selbstregistrierung nachgewiesen.***

Dieses Papier sagt, was geprüft ist, wie es geprüft ist und was noch offen
steht. Es behauptet nichts, was nicht in `npm run check` nachläuft.

---

## 1. Mandantenfähigkeit

### Was die Grenze zieht

| Ebene | Wie | Migration |
|---|---|---|
| Tabellen | Eine **restriktive** Richtlinie auf jeder der 176 Mandantentabellen, mit UND verknüpft — keine der 546 vorhandenen Richtlinien kann sie aufheben | `fork_07` |
| Dateispeicher | Das erste Pfadsegment ist die Mandantenkennung, ebenfalls restriktiv | `fork_09` |
| Datenbankfunktionen | 17 `SECURITY DEFINER`-Funktionen nehmen eine Kennung von außen entgegen; jede prüft sie über `mandant_sichern()` | `fork_14` |
| Eindeutigkeit | Namen, die zwei Mandanten mit demselben Recht führen wollen, sind je Mandant eindeutig statt plattformweit | `fork_17`, `fork_23`, `fork_28` |
| Fehlende Zuordnung | Ein Wächter füllt `mandant_id` aus dem Elternsatz an 19 Tabellen | `fork_22`, `fork_27` |

30 fork-eigene Migrationen insgesamt.

### Der Nachweis

**`tests/mandant-rundumschlag.sql`** — die entscheidende Prüfung. Zwei
Mandanten, in **jede** der 176 Mandantentabellen eine Zeile für jeden, dann
als Chef des einen unter RLS nachzählen:

> **159 von 176 Mandantentabellen wirklich geprüft. Keine einzige fremde
> Zeile sichtbar.**

- 3 Tabellen sind vom Rechtemodell der Vorlage ohnehin verdeckt — sie
  beweisen nichts und werden getrennt gezählt.
- 14 ließen sich nicht mit Testdaten füllen und werden **namentlich
  ausgegeben**: über sie sagt der Test nichts. Vor allem die
  `mail_*`-Tabellen, die ein echtes Postfach voraussetzen.

Gezählt wird auch die **eigene** Zeile. Ein Test, der nur „sieht nichts
Fremdes" prüft, leuchtet auch dann grün, wenn die Richtlinien alles
verbieten.

### Die Endpunkte

RLS gilt nicht für den `service_role`, und den benutzen fast alle der 118
Edge Functions. Sie müssen die Grenze selbst ziehen. Zwei Prüflisten führen
darüber Buch, beide Teil von `npm run check`:

| Liste | Umfang | Stand |
|---|---|---|
| `tests/funktionen-oeffentlich.py` | 28 Funktionen **ohne** JWT-Prüfung | 24 abgesichert, 4 unbedenklich, **0 offen** |
| `tests/funktionen-angemeldet.py` | 63 Funktionen **mit** JWT-Prüfung und `service_role` | 62 abgesichert, 1 unbedenklich, **0 offen** |

Dazu `tests/oeffentlich-insert-mandant.py`: keine Einfügung eines
öffentlichen Endpunkts mehr ohne Mandanten.

### Was dabei gefunden wurde

Die Liste steht vollständig in `docs/ENTSCHEIDUNGEN.md`. Die schwersten
Funde, damit das Gewicht klar ist:

| Fund | Was möglich war |
|---|---|
| `credentials-anzeigen` | Der FTP- oder Portalzugang eines fremden Maklers **im Klartext** |
| `expose-pruefen` | **Jede Datei jedes Mandanten** lesen — Eimer und Pfad kamen aus dem Anfragekörper |
| `push-antworten`, `mail-senden` | Post über das Postfach eines fremden Maklers verschicken; bei `push-antworten` ging der zitierte Text der fremden Mail mit hinaus |
| `suchkriterien-newsletter` | Ein Klick des einen Chefs verschickte die Newsletter **aller** Makler und legte ihm deren Empfängerlisten vor |
| `expose-freigabe` | Ein fremdes Impressum unter dem Exposé; ein Download setzte die Newsletter-Zustimmung am Kontakt eines fremden Mandanten |
| `termin-serie`, `eigentuemer-loeschen` | Die beiden Fälle, in denen **Löschen** über die Grenze möglich war |

---

## 2. Selbstregistrierung

### Wie sie läuft

1. **Konto**: `auth.signUp()` — der normale Weg von Supabase.
   Bestätigungsmail und Passwortregeln sind damit die von Supabase und keine
   nachgebauten. Firmenname und Name reisen als Anmeldedaten des Kontos mit.
2. **Bestätigung** der E-Mail-Adresse durch den Anmeldenden.
3. **Mandant**: beim ersten Anmelden ruft die Oberfläche
   `registrierung_abschliessen()`. Die Funktion legt in **einer Transaktion**
   an: Mandant, Profil als `chef`, Standort `standard` und die vier
   Einstellungszeilen. Ein halb angelegter Mandant wäre schlimmer als keiner.

Kein Trigger auf `auth.users`: der liefe **vor** der Bestätigung, und jede
unbestätigte Anmeldung hätte einen Mandanten hinterlassen.

### Der Nachweis

**`tests/selbstregistrierung.sql`**, zehn Prüfungen. Nicht möglich:

- ein Aufruf ohne Anmeldung
- ein Aufruf ohne bestätigte E-Mail-Adresse
- ein **zweiter** Mandant für dasselbe Konto
- der **Beitritt** zu einem vorhandenen Mandanten — die Mandantenkennung
  kommt nie von außen
- dass ein eingeladener Mitarbeiter sich zum Chef eines eigenen Mandanten
  macht

Gegen das echte Projekt durchgespielt und wieder aufgeräumt: Slug, Rolle
`chef`, ein Standort, 4 von 4 Einstellungszeilen, zweiter Aufruf liefert
denselben Mandanten, danach keine Reste.

---

## 3. Was für Gate 2 noch offen ist

Nichts davon lässt sich von der Entwicklungsseite erledigen — es braucht
Zugangsdaten oder Entscheidungen des Betreibers.

| Punkt | Ohne ihn passiert |
|---|---|
| **Supabase → Authentication → Email → „Enable email signups"** einschalten | Niemand kann sich registrieren |
| **Bestätigung der E-Mail-Adresse eingeschaltet lassen** | Registrierung wird abgewiesen (mit Absicht) |
| **Eigener SMTP-Zugang in Supabase** | Bestätigungsmails über den eingebauten Versand, wenige je Stunde |
| **`RESEND_API_KEY`**, Absenderdomain `immooffice.ai` | Keine Mail aus der Anwendung geht hinaus |
| **Workspace-gebundener `ANTHROPIC_API_KEY`** | Jeder der 41 KI-Aufrufe antwortet mit einem Fehler |
| **`PORTAL_URL`, `EXPOSE_FREIGABE_BASIS`** | Links führen auf die Platzhalterdomain `immooffice.example` |
| **Produktions-Deploy der Oberfläche** | Es gibt nur Entwürfe; die Registrierung ist nicht erreichbar |
| **Demo-Passwort ändern** | — |

Einzelheiten in `docs/OFFEN.md`.

---

## 4. Was Gate 2 ausdrücklich **nicht** behauptet

- **Keine vollständige DSGVO-Konformität.** Offene juristische Punkte sind
  als solche markiert.
- **Der Absender ist noch plattformweit.** Die Edge Functions lesen
  Firmenname und Absenderadresse aus Umgebungsvariablen, nicht aus
  `firma_stammdaten` des Mandanten (Punkt 1 in `docs/OFFEN.md`, Phase 2.4).
  Das ist kein Leck — die Mail geht an den Richtigen —, aber sie trägt den
  falschen Absender.
- **Die 14 nicht gefüllten Tabellen** im Rundumschlag sind nicht geprüft,
  sondern nur benannt.
- **Der öffentliche Eimer bleibt öffentlich.** Fünf Buckets liefert Supabase
  ohne Prüfung aus; der Pfad beginnt mit einer uuid und ist nicht zu erraten,
  aber wer die Adresse hat, kommt an die Datei (`fork_09`, `docs/OFFEN.md`).
