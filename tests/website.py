#!/usr/bin/env python3
"""Hält die Website an das, was sie behaupten darf.

Eine Werbeseite ist die Stelle, an der sich Sätze einschleichen, die das
Produkt nicht halten kann — und CLAUDE.md verbietet genau diese Sätze:
keine vollständige DSGVO-Konformität behaupten, Vertragsmuster nie als
rechtssicher bezeichnen, die einfache Signatur nicht als qualifizierte
darstellen, keine Wertermittlung ohne den Pflichthinweis.

Dazu drei handfeste Prüfungen: die Seiten müssen wohlgeformt sein, der
Anmelde-Knopf muss zur Anwendung führen, und es darf keine erfundene
Anschrift im HTML stehen. Die Angaben des Betreibers stehen an genau einer
Stelle (website/konfig.js) — steht eine Adresse zusätzlich im HTML, laufen
beide auseinander.
"""
import html.parser
import pathlib
import re
import sys

STAMM = pathlib.Path(__file__).resolve().parent.parent
SEITE = STAMM / "website"
SEITEN = ["index.html", "impressum.html", "datenschutz.html"]

# Sätze, die niemand schreiben darf. Links das Muster, rechts der Grund und
# — wo es einen gibt — was stattdessen gilt.
VERBOTEN = [
    (r"(100\s*%|vollständig|voll)\s*(dsgvo|datenschutz)[- ]?konform",
     "CLAUDE.md: keine vollständige DSGVO-Konformität behaupten. Was die "
     "Software leistet, darf beschrieben werden; die Konformität des "
     "EINSATZES kann sie nicht erklären."),
    (r"rechtssicher",
     "CLAUDE.md: Vertragsmuster nie ungeprüft als rechtssicher bezeichnen."),
    (r"qualifiziert\w*\s+(elektronisch\w*\s+)?signatur",
     "CLAUDE.md: die eigene einfache Signatur nicht als qualifizierte "
     "darstellen."),
    (r"verkehrswertgutachten",
     "Nur mit dem Pflichthinweis — und der steht in der Ausnahmeliste "
     "unten, wenn er wörtlich dort steht."),
    (r"gutachterlich",
     "Eine Marktpreiseinschätzung ist keine gutachterliche Aussage."),
    (r"\bgratis\b|\bkostenlos\b",
     "Zu billig. Was nichts kostet, heisst hier \"kostenfrei\" und steht in "
     "der Credit-Tabelle mit einer Null daneben — eine Werbezeile ist es "
     "nicht."),
    (r"\b(unbegrenzt|unlimitiert|flat)\b.{0,20}(credit|ki|text|bild)",
     "Credits sind begrenzt, und zwar je Tarif. \"Unbegrenzt\" waere eine "
     "Zusage, die die Abrechnung nicht haelt."),
    (r"ab\s*sofort\s*(kuendbar|kündbar)|jederzeit\s*k(ue|ü)ndbar",
     "Es gibt eine Mindestlaufzeit (plattform_werte.mindestlaufzeit_monate). "
     "\"Jederzeit kuendbar\" waere falsch."),
]

# Wörtliche Ausnahmen: der Pflichthinweis selbst darf (und muss) die Wörter
# enthalten, die oben verboten sind.
# Verglichen wird mit zusammengezogenem Leerraum: im HTML steht derselbe
# Satz mit Zeilenumbruch mittendrin.
ERLAUBT = [
    "ersetzt kein Verkehrswertgutachten nach § 194 BauGB",
    "einfache</strong> elektronische Signatur, keine qualifizierte",
    'Wir behaupten keine „vollständige DSGVO-Konformität"',
]

# --- Der Preisbereich -----------------------------------------------------
# Preise DUERFEN auf der Seite stehen — der Auftrag vom 06.10.2026 verlangt
# den Abschnitt ausdruecklich. Verboten ist nur, sie dort zu PFLEGEN: wer
# einen Preis aendert, aendert ihn im Plattform-Admin, und die Seite holt
# ihn. Was im HTML steht, ist Rueckfall und muss als solcher markiert sein.
#
# Deshalb diese Regel und keine Verbotszeile mehr: jeder Eurobetrag im HTML
# muss im Abschnitt #preise stehen. Ein Preis in der Buehne, in einer
# Modulkachel oder im Fuss ist genau der Fall, der spaeter auseinanderlaeuft,
# weil ihn niemand mitpflegt.
PREIS_PFLICHT = [
    ('id="preise"', "der Preisbereich selbst"),
    ('href="#preise"', "ein Weg dorthin (Navigation)"),
    ("data-preise", "die Marke, an der seite.js den Bereich findet"),
    ("data-betrag", "die Stellen, die der Katalog ueberschreibt"),
    ("data-takt", "der Umschalter Monat/Jahr"),
    ("data-cta", "der Knopf, der Tarif und Takt mitnimmt"),
    ("Nettopreise zzgl.", "der Pflichthinweis auf die Umsatzsteuer"),
    ("Mindestlaufzeit", "die Mindestlaufzeit"),
    ("Ein Credit ist eine interne Nutzungseinheit",
     "was ein Credit ist — CLAUDE.md: kein Euro-Guthaben"),
]


def flach(text: str) -> str:
    return re.sub(r"\s+", " ", text)


class Pruefer(html.parser.HTMLParser):
    LEER = {"meta", "link", "br", "img", "input", "hr", "source", "area"}

    def __init__(self):
        super().__init__()
        self.stapel = []
        self.fehler = []

    def handle_starttag(self, tag, attrs):
        if tag not in self.LEER:
            self.stapel.append(tag)

    def handle_endtag(self, tag):
        if self.stapel and self.stapel[-1] == tag:
            self.stapel.pop()
        elif tag in self.stapel:
            stelle = self.stapel.index(tag)
            self.fehler.append(f"</{tag}> schliesst auch {self.stapel[stelle + 1:]}")
            del self.stapel[stelle:]
        else:
            self.fehler.append(f"</{tag}> ohne Anfang")


def main() -> int:
    if not SEITE.is_dir():
        print("website/ fehlt — nichts zu pruefen.")
        return 0
    fehler = 0
    geprueft = 0

    for name in SEITEN:
        pfad = SEITE / name
        if not pfad.exists():
            print(f"[FEHLER] {name} fehlt.")
            fehler += 1
            continue
        text = pfad.read_text(encoding="utf-8")
        geprueft += 1

        p = Pruefer()
        p.feed(text)
        if p.stapel or p.fehler:
            fehler += 1
            print(f"[FEHLER] {name} ist nicht wohlgeformt: "
                  f"offen {p.stapel}, {p.fehler[:2]}")

        for muster, grund in VERBOTEN:
            for treffer in re.finditer(muster, text, re.IGNORECASE):
                umfeld = flach(text[max(0, treffer.start() - 120):treffer.end() + 120])
                if any(flach(a) in umfeld for a in ERLAUBT):
                    continue
                fehler += 1
                print(f"[FEHLER] {name}: \"{treffer.group(0)}\" — {grund}")

        # Die Angaben des Betreibers stehen in konfig.js, nicht im HTML.
        if name != "konfig.js":
            for muster, was in [
                (r"[A-Za-zÄÖÜäöüß]+(straße|strasse|weg|allee|platz)\s+\d+", "eine Anschrift"),
                (r"\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+", "eine Postleitzahl mit Ort"),
                (r"\+49[\d /-]{6,}", "eine Telefonnummer"),
                (r"[\w.+-]+@(?!beispiel|example)[\w-]+\.[a-z]{2,}", "eine Mailadresse"),
            ]:
                for treffer in re.finditer(muster, text):
                    fehler += 1
                    print(f"[FEHLER] {name} enthaelt {was} im HTML "
                          f"(\"{treffer.group(0)}\") — sie gehoert nach "
                          f"website/konfig.js, sonst stehen zwei Fassungen im Haus.")

        if "konfig.js" not in text:
            fehler += 1
            print(f"[FEHLER] {name} laedt website/konfig.js nicht.")

    # --- Der Preisbereich -------------------------------------------------
    start = (SEITE / "index.html").read_text(encoding="utf-8")
    for marke, was in PREIS_PFLICHT:
        if marke not in start:
            fehler += 1
            print(f"[FEHLER] index.html: {was} fehlt (\"{marke}\").")

    # Jeder Eurobetrag MUSS im Preisbereich stehen.
    anfang = start.find('id="preise"')
    ende = start.find("</section>", anfang) if anfang >= 0 else -1
    for treffer in re.finditer(r"\d[\d.]*,\d\d\s*€|€\s?\d", start):
        if anfang >= 0 and anfang < treffer.start() < ende:
            continue
        fehler += 1
        print(f"[FEHLER] index.html: der Betrag \"{treffer.group(0)}\" steht "
              f"ausserhalb von #preise. Preise gehoeren in den einen "
              f"Abschnitt, der sie aus dem Katalog holt — sonst pflegt sie "
              f"dort niemand mit.")

    # Der Endpunkt gehoert nach konfig.js, nicht ins HTML.
    if re.search(r"functions/v1/tarife-oeffentlich", start):
        fehler += 1
        print("[FEHLER] index.html nennt die Adresse des Preis-Endpunkts "
              "selbst — sie gehoert nach website/konfig.js.")

    # Der Anmelde-Knopf
    if 'id="anmelden-buehne"' not in start or "k.anwendung" not in start:
        fehler += 1
        print("[FEHLER] index.html: der Anmelde-Knopf nimmt die Adresse nicht "
              "aus konfig.js.")

    konfig = (SEITE / "konfig.js").read_text(encoding="utf-8")
    for feld in ["firma", "strasse", "plz_ort", "vertreten_durch", "email",
                 "telefon", "anwendung", "preise"]:
        if not re.search(feld + r"\s*:", konfig):
            fehler += 1
            print(f"[FEHLER] konfig.js fuehrt das Feld \"{feld}\" nicht.")

    # Die Anwendung muss benannt sein — ohne sie fuehrt der Knopf nirgendwohin.
    ziel = re.search(r'anwendung\s*:\s*"([^"]*)"', konfig)
    if not ziel or not ziel.group(1).startswith("http"):
        fehler += 1
        print("[FEHLER] konfig.js: \"anwendung\" nennt keine Adresse.")

    if fehler:
        print(f"\n{fehler} Befund(e).")
        return 1
    offen = [f for f in ["firma", "strasse", "plz_ort", "vertreten_durch",
                         "email", "telefon"]
             if not (re.search(f + r'\s*:\s*"([^"]*)"', konfig) or [""])
             or not re.search(f + r'\s*:\s*"([^"]*)"', konfig).group(1).strip()]
    print(f"[ok] {geprueft} Seiten: wohlgeformt, keine erfundene Anschrift,")
    print("     keine Zusage, die das Produkt nicht halten kann, und jeder")
    print("     Preis im einen Abschnitt, der ihn aus dem Katalog holt.")
    if offen:
        print(f"     HINWEIS: Impressum noch unvollstaendig ({', '.join(offen)}) — "
              f"die\n     Auslieferung laesst dann nur eine Vorschau zu, keine Produktion.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
