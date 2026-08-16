#!/usr/bin/env python3
"""
Wirtschaftlichkeits- und GuV-Modell fuer ImmoOffice.ai (Master-Prompt Abschnitt 17).

Saemtliche Eingangsgroessen stehen im Block ANNAHMEN. Preise, Tarifmix, Kunden-
zahlen, Kuendigungsquoten, Credit-Auslastung und Kosten lassen sich dort aendern,
ohne eine Formel anzufassen.

Aufruf:  python3 scripts/guv-modell.py            -> Bericht auf stdout
         python3 scripts/guv-modell.py --markdown -> Abschnitte fuer PRICING_AND_GUV.md

Alle Betraege sind NETTO in Euro, ohne Umsatzsteuer.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field

# ===========================================================================
# ANNAHMEN — hier aendern, nirgends sonst
# ===========================================================================

# --- Tarife (Abschnitt 14) -------------------------------------------------
TARIFE = {
    "Starter":      {"monat": 29.99,  "jahr": 299.90,  "nutzer": 1,  "credits": 300},
    "Professional": {"monat": 99.99,  "jahr": 999.90,  "nutzer": 3,  "credits": 1500},
    "Business":     {"monat": 199.99, "jahr": 1999.90, "nutzer": 10, "credits": 4000},
}
TARIFMIX = {"Starter": 0.55, "Professional": 0.35, "Business": 0.10}

ZUSATZNUTZER_MONAT = 14.99
ZUSATZNUTZER_JAHR = 149.90
# Angenommene Zahl zusaetzlich gebuchter Nutzer je Mandant und Tarif.
ZUSATZNUTZER_JE_MANDANT = {"Starter": 0.10, "Professional": 0.30, "Business": 0.60}

CREDIT_PAKETE = [
    {"name": "Klein",  "credits": 250,  "preis": 9.99},
    {"name": "Mittel", "credits": 1000, "preis": 29.99},
    {"name": "Gross",  "credits": 3000, "preis": 69.99},
]
# Anteil der Mandanten, die pro Monat ein Zusatzpaket kaufen.
PAKETKAUF_QUOTE = 0.12
PAKETKAUF_DURCHSCHNITT = 29.99  # entspricht dem mittleren Paket

# --- Zahlungsweise ---------------------------------------------------------
ANTEIL_JAHRESZAHLER = 0.30  # Rest zahlt monatlich

# --- Credits ---------------------------------------------------------------
CREDIT_AUSLASTUNG = 0.60  # Abschnitt 17

# Variable Kosten je Credit. Herleitung siehe PRICING_AND_GUV.md, Abschnitt
# „Kosten je Aktion“. ANNAHME — vor Produktivbetrieb an realen Rechnungen
# nachzumessen. Sicherheitspuffer ist bereits enthalten.
KOSTEN_JE_CREDIT = 0.0073
KOSTEN_JE_CREDIT_WORSTCASE = 0.0095  # ueberdurchschnittlich viele Bildbearbeitungen
SICHERHEITSPUFFER = 0.20  # bereits in KOSTEN_JE_CREDIT eingerechnet

# --- Weitere variable Kosten je Mandant und Monat --------------------------
STRIPE_PROZENT = 0.020
STRIPE_FIX_JE_ZAHLUNG = 0.25
STORAGE_JE_MANDANT = 0.50
MAIL_JE_MANDANT = 0.10

# --- Fixkosten (Abschnitt 17) ---------------------------------------------
FIXKOSTEN = {
    "Hosting und Datenbank": 150.0,
    "KI-Textgenerierung": 150.0,
    "Bildgenerierung/Homestaging": 150.0,
    "E-Signaturen": 50.0,
    "Zahlungsabwicklung": 50.0,
    "Support und Weiterentwicklung": 250.0,
    "Marketing und Vertrieb": 250.0,
    "Personal": 250.0,
}
ERSTENTWICKLUNG = 1500.0

# Die Positionen KI-Text, Bildgenerierung und Zahlungsabwicklung sind laut
# Abschnitt 17 zusaetzlich nutzungsabhaengig. Um sie nicht doppelt zu zaehlen,
# gelten sie als Sockel: erst wenn die nutzungsabhaengigen Kosten den Sockel
# uebersteigen, wird der Mehrbetrag zusaetzlich angesetzt.
SOCKEL_NUTZUNGSABHAENGIG = (
    FIXKOSTEN["KI-Textgenerierung"]
    + FIXKOSTEN["Bildgenerierung/Homestaging"]
    + FIXKOSTEN["Zahlungsabwicklung"]
)

# --- Szenarien -------------------------------------------------------------
SZENARIEN = {
    "konservativ": {"ende": [20, 50, 90],   "churn": 0.035},
    "realistisch": {"ende": [35, 100, 220], "churn": 0.025},
    "ambitioniert": {"ende": [60, 200, 450], "churn": 0.020},
}

# Marketingbudget als Grundlage der Akquisekosten.
CAC_BUDGET_ANTEIL = 1.0  # gesamtes Marketing- und Vertriebsbudget


# ===========================================================================
# MODELL
# ===========================================================================

@dataclass
class Monat:
    nummer: int
    kunden: float
    neukunden: float
    abgaenge: float
    mrr: float = 0.0
    umsatz_abo: float = 0.0
    umsatz_zusatznutzer: float = 0.0
    umsatz_pakete: float = 0.0
    kosten_ki: float = 0.0
    kosten_stripe: float = 0.0
    kosten_sonst_variabel: float = 0.0
    fixkosten: float = 0.0
    einmalkosten: float = 0.0
    umsatz_je_tarif: dict = field(default_factory=dict)

    @property
    def umsatz(self) -> float:
        return self.umsatz_abo + self.umsatz_zusatznutzer + self.umsatz_pakete

    @property
    def variable_kosten(self) -> float:
        return self.kosten_ki + self.kosten_stripe + self.kosten_sonst_variabel

    @property
    def rohertrag(self) -> float:
        return self.umsatz - self.variable_kosten

    @property
    def ergebnis(self) -> float:
        return self.rohertrag - self.fixkosten - self.einmalkosten


def monatspreis(tarif: str) -> float:
    """Durchschnittlicher Monatserloes unter Beruecksichtigung der Jahreszahler."""
    t = TARIFE[tarif]
    return (
        ANTEIL_JAHRESZAHLER * (t["jahr"] / 12.0)
        + (1 - ANTEIL_JAHRESZAHLER) * t["monat"]
    )


def zusatznutzer_erloes(tarif: str) -> float:
    anzahl = ZUSATZNUTZER_JE_MANDANT[tarif]
    preis = (
        ANTEIL_JAHRESZAHLER * (ZUSATZNUTZER_JAHR / 12.0)
        + (1 - ANTEIL_JAHRESZAHLER) * ZUSATZNUTZER_MONAT
    )
    return anzahl * preis


def kundenverlauf(ende: list[int], churn: float, monate: int) -> list[Monat]:
    """
    Bestand linear zwischen den Jahresendwerten. Aus Bestandsaenderung und
    Kuendigungen ergibt sich die noetige Neukundenzahl — so wird der Churn
    sichtbar, statt im Nettowachstum unterzugehen.
    """
    verlauf: list[Monat] = []
    vorher = 0.0
    for m in range(1, monate + 1):
        jahr = (m - 1) // 12
        start = ende[jahr - 1] if jahr > 0 else 0.0
        ziel = ende[jahr]
        anteil = ((m - 1) % 12 + 1) / 12.0
        kunden = start + (ziel - start) * anteil

        abgaenge = vorher * churn
        neukunden = max(0.0, kunden - vorher + abgaenge)
        verlauf.append(Monat(m, kunden, neukunden, abgaenge))
        vorher = kunden
    return verlauf


def rechne(szenario: str, monate: int = 36,
           kosten_je_credit: float = KOSTEN_JE_CREDIT) -> list[Monat]:
    cfg = SZENARIEN[szenario]
    verlauf = kundenverlauf(cfg["ende"], cfg["churn"], monate)

    for m in verlauf:
        umsatz_abo = 0.0
        umsatz_zn = 0.0
        credits = 0.0
        je_tarif: dict[str, float] = {}

        for tarif, anteil in TARIFMIX.items():
            mandanten = m.kunden * anteil
            erloes = mandanten * monatspreis(tarif)
            zn = mandanten * zusatznutzer_erloes(tarif)
            umsatz_abo += erloes
            umsatz_zn += zn
            credits += mandanten * TARIFE[tarif]["credits"] * CREDIT_AUSLASTUNG
            je_tarif[tarif] = erloes + zn

        m.umsatz_abo = umsatz_abo
        m.umsatz_zusatznutzer = umsatz_zn
        m.umsatz_je_tarif = je_tarif
        m.umsatz_pakete = m.kunden * PAKETKAUF_QUOTE * PAKETKAUF_DURCHSCHNITT
        m.mrr = m.umsatz

        # Zusatzpakete erzeugen zusaetzlichen Credit-Verbrauch.
        paket_credits = (
            m.kunden * PAKETKAUF_QUOTE * 1000 * CREDIT_AUSLASTUNG
        )
        m.kosten_ki = (credits + paket_credits) * kosten_je_credit

        zahlungen = m.kunden * (1 - ANTEIL_JAHRESZAHLER) + m.kunden * ANTEIL_JAHRESZAHLER / 12.0
        zahlungen += m.kunden * PAKETKAUF_QUOTE
        m.kosten_stripe = m.umsatz * STRIPE_PROZENT + zahlungen * STRIPE_FIX_JE_ZAHLUNG
        m.kosten_sonst_variabel = m.kunden * (STORAGE_JE_MANDANT + MAIL_JE_MANDANT)

        # Nutzungsabhaengige Kosten gegen den Fixkostensockel verrechnen.
        nutzung = m.kosten_ki + m.kosten_stripe
        mehrbedarf = max(0.0, nutzung - SOCKEL_NUTZUNGSABHAENGIG)
        m.fixkosten = sum(FIXKOSTEN.values())
        m.kosten_ki = 0.0
        m.kosten_stripe = 0.0
        m.kosten_sonst_variabel += mehrbedarf

        m.einmalkosten = ERSTENTWICKLUNG if m.nummer == 1 else 0.0

    return verlauf


def deckungsbeitrag_je_tarif(kosten_je_credit: float = KOSTEN_JE_CREDIT) -> dict:
    """Rohertrag je Mandant und Monat, ohne Fixkostenumlage."""
    ergebnis = {}
    for tarif, t in TARIFE.items():
        erloes = monatspreis(tarif) + zusatznutzer_erloes(tarif)
        credits = t["credits"] * CREDIT_AUSLASTUNG
        variabel = (
            credits * kosten_je_credit
            + erloes * STRIPE_PROZENT
            + STRIPE_FIX_JE_ZAHLUNG
            + STORAGE_JE_MANDANT
            + MAIL_JE_MANDANT
        )
        # Wirtschaftliche Obergrenze: wie viele Credits traegt der Tarif, bevor
        # der Rohertrag auf null faellt?
        max_credits = (erloes - (erloes * STRIPE_PROZENT + STRIPE_FIX_JE_ZAHLUNG
                                 + STORAGE_JE_MANDANT + MAIL_JE_MANDANT)) / kosten_je_credit
        ergebnis[tarif] = {
            "erloes": erloes,
            "variabel": variabel,
            "db": erloes - variabel,
            "marge": (erloes - variabel) / erloes,
            "max_credits": max_credits,
            "inklusiv": t["credits"],
        }
    return ergebnis


def paket_margen(kosten_je_credit: float = KOSTEN_JE_CREDIT) -> list[dict]:
    aus = []
    for p in CREDIT_PAKETE:
        kosten = p["credits"] * kosten_je_credit + p["preis"] * STRIPE_PROZENT + STRIPE_FIX_JE_ZAHLUNG
        aus.append({
            **p,
            "kosten": kosten,
            "db": p["preis"] - kosten,
            "marge": (p["preis"] - kosten) / p["preis"],
            "preis_je_credit": p["preis"] / p["credits"],
        })
    return aus


def kennzahlen(szenario: str, verlauf: list[Monat]) -> dict:
    cfg = SZENARIEN[szenario]
    churn = cfg["churn"]

    # ARPA im ersten vollen Jahr
    j1 = verlauf[:12]
    arpa = sum(m.umsatz / m.kunden for m in j1 if m.kunden > 0) / len(
        [m for m in j1 if m.kunden > 0]
    )

    db = deckungsbeitrag_je_tarif()
    db_gewichtet = sum(db[t]["db"] * a for t, a in TARIFMIX.items())
    erloes_gewichtet = sum(db[t]["erloes"] * a for t, a in TARIFMIX.items())
    bruttomarge = db_gewichtet / erloes_gewichtet

    # CAC: Marketingbudget je gewonnenem Kunden, ueber die ersten 24 Monate
    neukunden = sum(m.neukunden for m in verlauf[:24])
    budget = FIXKOSTEN["Marketing und Vertrieb"] * CAC_BUDGET_ANTEIL * 24
    cac = budget / neukunden if neukunden else float("nan")

    lebensdauer = 1 / churn  # Monate
    ltv = db_gewichtet * lebensdauer

    # Break-even: erster Monat mit positivem Ergebnis ohne Einmalkosten
    be_monat = next((m.nummer for m in verlauf if m.rohertrag - m.fixkosten > 0), None)
    be_kunden = next(
        (m.kunden for m in verlauf if m.rohertrag - m.fixkosten > 0), None
    )
    # Rechnerisch: Fixkosten / Deckungsbeitrag je Mandant
    be_rechnerisch = sum(FIXKOSTEN.values()) / db_gewichtet

    # Kumulierter Cashflow
    kumuliert = 0.0
    amortisation = None
    for m in verlauf:
        kumuliert += m.ergebnis
        if amortisation is None and kumuliert > 0:
            amortisation = m.nummer

    return {
        "arpa": arpa,
        "db_gewichtet": db_gewichtet,
        "bruttomarge": bruttomarge,
        "cac": cac,
        "ltv": ltv,
        "ltv_cac": ltv / cac if cac else float("nan"),
        "lebensdauer": lebensdauer,
        "be_monat": be_monat,
        "be_kunden": be_kunden,
        "be_rechnerisch": be_rechnerisch,
        "amortisation": amortisation,
        "kumuliert_36": kumuliert,
    }


# ===========================================================================
# AUSGABE
# ===========================================================================

def eur(x: float) -> str:
    return f"{x:,.2f}".replace(",", " ").replace(".", ",")


def prozent(x: float) -> str:
    return f"{x * 100:.1f}".replace(".", ",") + " %"


def zahl(x: float, stellen: int = 4) -> str:
    return f"{x:.{stellen}f}".replace(".", ",")


def tabelle_24_monate(szenario: str) -> str:
    verlauf = rechne(szenario, 24)
    zeilen = [
        "| Monat | Kunden | Neu | Abgang | Umsatz | Variable Kosten | Fixkosten | Ergebnis | Kumuliert |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    kum = 0.0
    for m in verlauf:
        kum += m.ergebnis
        zeilen.append(
            f"| {m.nummer} | {m.kunden:.0f} | {m.neukunden:.1f} | {m.abgaenge:.1f} "
            f"| {eur(m.umsatz)} | {eur(m.variable_kosten)} | {eur(m.fixkosten + m.einmalkosten)} "
            f"| {eur(m.ergebnis)} | {eur(kum)} |"
        )
    return "\n".join(zeilen)


def tabelle_jahre() -> str:
    zeilen = [
        "| Szenario | Jahr | Kunden Ende | Umsatz | Variable Kosten | Fixkosten | Ergebnis | ARR Ende |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name in SZENARIEN:
        verlauf = rechne(name, 36)
        for jahr in range(3):
            teil = verlauf[jahr * 12:(jahr + 1) * 12]
            umsatz = sum(m.umsatz for m in teil)
            var = sum(m.variable_kosten for m in teil)
            fix = sum(m.fixkosten + m.einmalkosten for m in teil)
            zeilen.append(
                f"| {name} | {jahr + 1} | {teil[-1].kunden:.0f} | {eur(umsatz)} "
                f"| {eur(var)} | {eur(fix)} | {eur(umsatz - var - fix)} "
                f"| {eur(teil[-1].mrr * 12)} |"
            )
    return "\n".join(zeilen)


def bericht() -> str:
    teile = []
    teile.append("## Jahresuebersicht je Szenario\n")
    teile.append(tabelle_jahre())

    teile.append("\n\n## Deckungsbeitrag je Tarif (je Mandant und Monat)\n")
    db = deckungsbeitrag_je_tarif()
    zeilen = [
        "| Tarif | Erloes | Variable Kosten | Deckungsbeitrag | Marge | Inklusiv-Credits | Wirtschaftliche Obergrenze |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for t, w in db.items():
        obergrenze = f"{w['max_credits']:,.0f}".replace(",", ".")
        zeilen.append(
            f"| {t} | {eur(w['erloes'])} | {eur(w['variabel'])} | {eur(w['db'])} "
            f"| {prozent(w['marge'])} | {w['inklusiv']} | {obergrenze} |"
        )
    teile.append("\n".join(zeilen))

    teile.append("\n\n## Credit-Pakete\n")
    zeilen = [
        "| Paket | Credits | Preis | Variable Kosten | Deckungsbeitrag | Marge | Preis je Credit |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for p in paket_margen():
        zeilen.append(
            f"| {p['name']} | {p['credits']} | {eur(p['preis'])} | {eur(p['kosten'])} "
            f"| {eur(p['db'])} | {prozent(p['marge'])} "
            f"| {zahl(p['preis_je_credit'])} € |"
        )
    teile.append("\n".join(zeilen))

    teile.append("\n\n## Kennzahlen je Szenario\n")
    zeilen = [
        "| Szenario | Churn/Monat | ARPA | DB je Mandant | Bruttomarge | CAC | LTV | LTV/CAC | Break-even | Amortisation |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name in SZENARIEN:
        v = rechne(name, 36)
        k = kennzahlen(name, v)
        be = f"Monat {k['be_monat']}" if k["be_monat"] else "nicht erreicht"
        am = f"Monat {k['amortisation']}" if k["amortisation"] else "nicht erreicht"
        zeilen.append(
            f"| {name} | {prozent(SZENARIEN[name]['churn'])} | {eur(k['arpa'])} "
            f"| {eur(k['db_gewichtet'])} | {prozent(k['bruttomarge'])} | {eur(k['cac'])} "
            f"| {eur(k['ltv'])} | {k['ltv_cac']:.1f} | {be} | {am} |"
        )
    teile.append("\n".join(zeilen))

    k = kennzahlen("realistisch", rechne("realistisch", 36))
    teile.append(
        f"\n\nRechnerischer Break-even: **{k['be_rechnerisch']:.1f} Mandanten** "
        f"(Fixkosten {eur(sum(FIXKOSTEN.values()))} / Deckungsbeitrag {eur(k['db_gewichtet'])})."
    )

    teile.append("\n\n## Monatliche GuV, realistisches Szenario, Monate 1-24\n")
    teile.append(tabelle_24_monate("realistisch"))

    teile.append("\n\n## Sensitivitaet\n")
    zeilen = [
        "| Veraenderung | DB je Mandant | Bruttomarge | Break-even (Mandanten) |",
        "|---|---:|---:|---:|",
    ]

    def zeile(label: str, kjc: float, preisfaktor: float = 1.0) -> str:
        global TARIFE
        original = {t: dict(v) for t, v in TARIFE.items()}
        for t in TARIFE:
            TARIFE[t]["monat"] = original[t]["monat"] * preisfaktor
            TARIFE[t]["jahr"] = original[t]["jahr"] * preisfaktor
        db = deckungsbeitrag_je_tarif(kjc)
        dbg = sum(db[t]["db"] * a for t, a in TARIFMIX.items())
        erl = sum(db[t]["erloes"] * a for t, a in TARIFMIX.items())
        be = sum(FIXKOSTEN.values()) / dbg
        for t in TARIFE:
            TARIFE[t].update(original[t])
        return f"| {label} | {eur(dbg)} | {prozent(dbg/erl)} | {be:.1f} |"

    zeilen.append(zeile("Basis", KOSTEN_JE_CREDIT))
    zeilen.append(zeile("Worst Case Bildbearbeitung", KOSTEN_JE_CREDIT_WORSTCASE))
    zeilen.append(zeile("API-Kosten verdoppelt", KOSTEN_JE_CREDIT * 2))
    zeilen.append(zeile("API-Kosten verfuenffacht", KOSTEN_JE_CREDIT * 5))
    zeilen.append(zeile("Preise -10 %", KOSTEN_JE_CREDIT, 0.90))
    zeilen.append(zeile("Preise +10 %", KOSTEN_JE_CREDIT, 1.10))
    teile.append("\n".join(zeilen))

    teile.append("\n\n### Churn-Sensitivitaet (realistisches Szenario)\n")
    zeilen = ["| Churn/Monat | Lebensdauer | LTV | LTV/CAC |", "|---:|---:|---:|---:|"]
    original = SZENARIEN["realistisch"]["churn"]
    for c in (0.015, 0.020, 0.025, 0.030, 0.040, 0.050):
        SZENARIEN["realistisch"]["churn"] = c
        k = kennzahlen("realistisch", rechne("realistisch", 36))
        zeilen.append(
            f"| {prozent(c)} | {k['lebensdauer']:.0f} Monate | {eur(k['ltv'])} | {k['ltv_cac']:.1f} |"
        )
    SZENARIEN["realistisch"]["churn"] = original
    teile.append("\n".join(zeilen))

    return "\n".join(teile)


if __name__ == "__main__":
    text = bericht()
    if "--markdown" not in sys.argv:
        print("ImmoOffice.ai — Wirtschaftlichkeitsmodell (alle Betraege netto)\n")
    print(text)
