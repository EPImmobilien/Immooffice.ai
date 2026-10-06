#!/usr/bin/env python3
"""Erzeugt die Social-Media-Vorlagen aus EINER Beschreibung.

Der Betreiber hat am 06.10.2026 drei Entwurfssaetze geliefert — Raster,
Signature und Studio, dieselben drei Handschriften wie beim Exposé-Baukasten.
Sie werden hier nicht als Bilder nachgebaut, sondern in dieselbe Sprache
uebersetzt, in der auch die Exposé-Vorlagen stehen: eine Vorlage ist ein
JSON-Dokument mit Format, Stil und Seiten, gezeichnet vom vorhandenen
Renderer. Damit gelten fuer sie dieselben Dinge wie fuer ein Exposé — CI des
Mandanten, Logo, echte Objektdaten, Vorschau und Export aus derselben
Schrittliste.

Warum erzeugt und nicht von Hand geschrieben: es sind sechs Dateien mit
zusammen ueber zweihundert Elementen, und die drei Handschriften teilen sich
die Rechnung (Raender, Rasterschritte, Bildkaesten). Von Hand liefen sie beim
ersten Nachziehen auseinander.

    python3 scripts/social-vorlagen.py            # schreibt die Dateien
    python3 scripts/social-vorlagen.py --pruefen  # vergleicht nur

Masse in Punkt, Ursprung unten links — wie im Exposé-Baukasten. Ein
Instagram-Beitrag ist 1080x1350 Pixel; bei zwei Pixeln je Punkt sind das
540x675. Die Story ist 1080x1920, also 540x960.
"""
import argparse
import json
import os
import sys

STAMM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(STAMM, "packages", "expose-renderer", "vorlagen")

FEED_B, FEED_H = 540.0, 675.0
STORY_B, STORY_H = 540.0, 960.0


def jak(s):
    return {"familie": "jakarta", "schnitt": s}


def corm(s):
    return {"familie": "cormorant", "schnitt": s}


def arch(s):
    return {"familie": "archivo", "schnitt": s}


# ---------------------------------------------------------------------------
# Die drei Handschriften
# ---------------------------------------------------------------------------
# Jede Ableitung hat ihr eigenes Farbvokabular (siehe farben.ts): Raster
# kennt p/a/ink/surf, Signature d/a/paper/onD, Studio s/paper/text/tint.
# Deshalb steht hier je Handschrift eine Zuordnung von SEMANTISCHEN Namen auf
# die Namen der Palette. Die Seiten unten benutzen nur die semantischen —
# sonst muesste jede Seite dreimal geschrieben werden.
HANDSCHRIFT = {
    "raster": {
        "ableitung": "raster",
        "name": "Raster",
        "beschreibung": "Hell, sachlich, viel Weissraum. Karten mit weichen "
                        "Ecken, Kennzahlen in einer Leiste.",
        "f": {"grund": "weiss", "auf": "ink", "leise": "muted", "akzent": "a",
              "marke": "p", "band": "surf", "linie": "line", "dunkel": "pdark",
              "auf_akzent": "weiss", "auf_band": "ink"},
        "rund": 18,
        "stile": {
            "marke":        {"schrift": jak("ExtraBold"), "groesse": 13, "farbe": "p", "sperrung": 1.2},
            "marke_zusatz": {"schrift": jak("Medium"), "groesse": 7, "farbe": "muted",
                             "sperrung": 2.4, "grossbuchstaben": True},
            "pille":        {"schrift": jak("Bold"), "groesse": 9, "farbe": "weiss",
                             "sperrung": 1.6, "grossbuchstaben": True},
            "bild_label":   {"schrift": jak("SemiBold"), "groesse": 7, "farbe": "pdark",
                             "sperrung": 1.2, "grossbuchstaben": True},
            "augenbraue":   {"schrift": jak("Bold"), "groesse": 9, "farbe": "a",
                             "sperrung": 2.0, "grossbuchstaben": True},
            "titel":        {"schrift": jak("ExtraBold"), "groesse": 28, "farbe": "ink",
                             "sperrung": -0.6, "min_groesse": 17},
            "titel_zwei":   {"schrift": jak("ExtraBold"), "groesse": 28, "farbe": "ink",
                             "sperrung": -0.6, "min_groesse": 17},
            "unterzeile":   {"schrift": jak("Medium"), "groesse": 12, "farbe": "muted"},
            "preis":        {"schrift": jak("ExtraBold"), "groesse": 26, "farbe": "a", "sperrung": -0.4},
            "kz_wert":      {"schrift": jak("ExtraBold"), "groesse": 18, "farbe": "p", "sperrung": -0.3},
            "kz_wert_letzter": {"schrift": jak("ExtraBold"), "groesse": 18, "farbe": "a", "sperrung": -0.3},
            "kz_label":     {"schrift": jak("SemiBold"), "groesse": 6.5, "farbe": "muted",
                             "sperrung": 1.6, "grossbuchstaben": True},
            "punkt":        {"schrift": jak("Medium"), "groesse": 13, "farbe": "ink"},
            "kontakt_name": {"schrift": jak("ExtraBold"), "groesse": 18, "farbe": "p"},
            "kontakt_zeile": {"schrift": jak("Medium"), "groesse": 12, "farbe": "muted"},
            "fuss":         {"schrift": jak("SemiBold"), "groesse": 8.5, "farbe": "muted",
                             "sperrung": 1.4, "grossbuchstaben": True},
            "tab_label":    {"schrift": jak("SemiBold"), "groesse": 9.5, "farbe": "muted",
                             "sperrung": 1.2, "grossbuchstaben": True},
            "tab_wert":     {"schrift": jak("Bold"), "groesse": 13, "farbe": "ink",
                             "ausrichtung": "rechts"},
            "hl_nummer":    {"schrift": jak("ExtraBold"), "groesse": 11, "farbe": "a", "sperrung": 0.4},
            "hl_titel":     {"schrift": jak("Bold"), "groesse": 14, "farbe": "ink"},
            "hl_text":      {"schrift": jak("Regular"), "groesse": 11.5, "farbe": "muted"},
            "ap_name":      {"schrift": jak("ExtraBold"), "groesse": 18, "farbe": "p"},
            "ap_funktion":  {"schrift": jak("Medium"), "groesse": 10, "farbe": "muted",
                             "sperrung": 1.4, "grossbuchstaben": True},
            "ap_label":     {"schrift": jak("SemiBold"), "groesse": 8, "farbe": "muted",
                             "sperrung": 1.2, "grossbuchstaben": True},
            "ap_wert":      {"schrift": jak("Medium"), "groesse": 11.5, "farbe": "ink"},
        },
    },
    "signature": {
        "ableitung": "signature",
        "name": "Signature",
        "beschreibung": "Dunkel, zurueckhaltend, Serifenschrift. Das Bild "
                        "traegt die ganze Flaeche, ein feiner Rahmen fasst sie.",
        "f": {"grund": "d", "auf": "onD", "leise": "onDm", "akzent": "a",
              "marke": "onD", "band": "d", "linie": "a", "dunkel": "ink",
              "auf_akzent": "d", "auf_band": "onD"},
        "rund": 0,
        "stile": {
            "marke":        {"schrift": corm("Medium"), "groesse": 19, "farbe": "onD",
                             "sperrung": 6.0, "grossbuchstaben": True,
                             "ausrichtung": "mitte", "min_groesse": 11},
            "marke_zusatz": {"schrift": jak("Light"), "groesse": 6.4, "farbe": "a",
                             "sperrung": 4.0, "grossbuchstaben": True, "ausrichtung": "mitte"},
            "pille":        {"schrift": jak("Medium"), "groesse": 7, "farbe": "a",
                             "sperrung": 3.2, "grossbuchstaben": True, "ausrichtung": "mitte"},
            "bild_label":   {"schrift": jak("Light"), "groesse": 6.4, "farbe": "onDm",
                             "sperrung": 1.6, "grossbuchstaben": True},
            "augenbraue":   {"schrift": jak("Medium"), "groesse": 6.8, "farbe": "a",
                             "sperrung": 3.4, "grossbuchstaben": True, "ausrichtung": "mitte"},
            "titel":        {"schrift": corm("Light"), "groesse": 40, "farbe": "onD",
                             "sperrung": -0.4, "ausrichtung": "mitte", "min_groesse": 22},
            "titel_zwei":   {"schrift": corm("LightItalic"), "groesse": 40, "farbe": "onD",
                             "sperrung": -0.4, "ausrichtung": "mitte", "min_groesse": 22},
            "unterzeile":   {"schrift": corm("Regular"), "groesse": 17, "farbe": "onDm",
                             "ausrichtung": "mitte"},
            "preis":        {"schrift": corm("Medium"), "groesse": 24, "farbe": "onD",
                             "ausrichtung": "mitte"},
            "kz_wert":      {"schrift": corm("Medium"), "groesse": 19, "farbe": "onD",
                             "ausrichtung": "mitte"},
            "kz_wert_letzter": {"schrift": corm("Medium"), "groesse": 19, "farbe": "a",
                                "ausrichtung": "mitte"},
            "kz_label":     {"schrift": jak("Light"), "groesse": 6.0, "farbe": "a",
                             "sperrung": 2.6, "grossbuchstaben": True, "ausrichtung": "mitte"},
            "punkt":        {"schrift": corm("Regular"), "groesse": 16, "farbe": "onD",
                             "ausrichtung": "mitte"},
            "kontakt_name": {"schrift": corm("Medium"), "groesse": 22, "farbe": "onD",
                             "ausrichtung": "mitte"},
            "kontakt_zeile": {"schrift": jak("Light"), "groesse": 10, "farbe": "a",
                              "sperrung": 1.6, "ausrichtung": "mitte"},
            "fuss":         {"schrift": jak("Light"), "groesse": 7.4, "farbe": "onDm",
                             "sperrung": 2.6, "grossbuchstaben": True, "ausrichtung": "mitte"},
            "tab_label":    {"schrift": jak("Light"), "groesse": 8.5, "farbe": "a",
                             "sperrung": 2.2, "grossbuchstaben": True},
            "tab_wert":     {"schrift": corm("Regular"), "groesse": 15, "farbe": "onD",
                             "ausrichtung": "rechts"},
            "hl_nummer":    {"schrift": jak("Light"), "groesse": 9, "farbe": "a", "sperrung": 2.0},
            "hl_titel":     {"schrift": corm("Medium"), "groesse": 16, "farbe": "onD"},
            "hl_text":      {"schrift": jak("Light"), "groesse": 10.5, "farbe": "onDm"},
            "ap_name":      {"schrift": corm("Medium"), "groesse": 20, "farbe": "onD"},
            "ap_funktion":  {"schrift": jak("Light"), "groesse": 8.5, "farbe": "a",
                             "sperrung": 2.6, "grossbuchstaben": True},
            "ap_label":     {"schrift": jak("Light"), "groesse": 7.5, "farbe": "a",
                             "sperrung": 1.8, "grossbuchstaben": True},
            "ap_wert":      {"schrift": jak("Light"), "groesse": 11, "farbe": "onD"},
        },
    },
    "studio": {
        "ableitung": "studio",
        "name": "Studio",
        "beschreibung": "Farbfeld, schmale Versalien, harte Kanten. Die "
                        "Kennzahlen stehen in einem schwarzen Balken.",
        "f": {"grund": "s", "auf": "paper", "leise": "tint2", "akzent": "paper",
              "marke": "paper", "band": "text", "linie": "rule", "dunkel": "text",
              "auf_akzent": "text", "auf_band": "paper"},
        "rund": 0,
        "stile": {
            "marke":        {"schrift": arch("Bold"), "groesse": 15, "farbe": "paper", "sperrung": -0.4},
            "marke_zusatz": {"schrift": arch("Medium"), "groesse": 6.4, "farbe": "paper",
                             "sperrung": 2.6, "grossbuchstaben": True},
            "pille":        {"schrift": arch("Bold"), "groesse": 8.5, "farbe": "paper",
                             "sperrung": 2.0, "grossbuchstaben": True},
            "bild_label":   {"schrift": arch("Medium"), "groesse": 7, "farbe": "paper",
                             "sperrung": 1.4, "grossbuchstaben": True},
            "augenbraue":   {"schrift": arch("Bold"), "groesse": 9, "farbe": "paper",
                             "sperrung": 2.2, "grossbuchstaben": True},
            "titel":        {"schrift": arch("CondBlack"), "groesse": 52, "farbe": "paper",
                             "sperrung": -1.0, "grossbuchstaben": True, "min_groesse": 28},
            "titel_zwei":   {"schrift": arch("CondBlack"), "groesse": 52, "farbe": "paper",
                             "sperrung": -1.0, "grossbuchstaben": True, "min_groesse": 28},
            "unterzeile":   {"schrift": arch("Regular"), "groesse": 13, "farbe": "paper"},
            "preis":        {"schrift": arch("CondXB"), "groesse": 30, "farbe": "paper", "sperrung": -0.6},
            "kz_wert":      {"schrift": arch("CondXB"), "groesse": 21, "farbe": "paper", "sperrung": -0.4},
            "kz_wert_letzter": {"schrift": arch("CondXB"), "groesse": 21, "farbe": "s_auf_d",
                                "sperrung": -0.4},
            "kz_label":     {"schrift": arch("Medium"), "groesse": 6.4, "farbe": "tint2",
                             "sperrung": 1.8, "grossbuchstaben": True},
            "punkt":        {"schrift": arch("Medium"), "groesse": 13.5, "farbe": "paper"},
            "kontakt_name": {"schrift": arch("Bold"), "groesse": 19, "farbe": "paper"},
            "kontakt_zeile": {"schrift": arch("Regular"), "groesse": 12, "farbe": "paper"},
            "fuss":         {"schrift": arch("Medium"), "groesse": 8.5, "farbe": "paper",
                             "sperrung": 1.6, "grossbuchstaben": True},
            "tab_label":    {"schrift": arch("Medium"), "groesse": 9, "farbe": "tint2",
                             "sperrung": 1.6, "grossbuchstaben": True},
            "tab_wert":     {"schrift": arch("Bold"), "groesse": 14, "farbe": "paper",
                             "ausrichtung": "rechts"},
            "hl_nummer":    {"schrift": arch("CondXB"), "groesse": 13, "farbe": "paper"},
            "hl_titel":     {"schrift": arch("Bold"), "groesse": 15, "farbe": "paper"},
            "hl_text":      {"schrift": arch("Regular"), "groesse": 11.5, "farbe": "tint2"},
            "ap_name":      {"schrift": arch("Bold"), "groesse": 19, "farbe": "paper"},
            "ap_funktion":  {"schrift": arch("Medium"), "groesse": 9.5, "farbe": "tint2",
                             "sperrung": 1.8, "grossbuchstaben": True},
            "ap_label":     {"schrift": arch("Medium"), "groesse": 8, "farbe": "tint2",
                             "sperrung": 1.4, "grossbuchstaben": True},
            "ap_wert":      {"schrift": arch("Regular"), "groesse": 11.5, "farbe": "paper"},
        },
    },
}


# ---------------------------------------------------------------------------
# Bausteine
# ---------------------------------------------------------------------------
# Jeder gibt eine Liste von Elementen zurueck. Sie kennen die Handschrift nur
# ueber `h` — Farbnamen und Rundungen kommen von dort, nie aus dem Text.

def flaeche(id_, h, x, y, b, hh, farbe, rund=0):
    e = {"id": id_, "typ": "form", "gesperrt": True, "x": x, "y": y, "b": b, "h": hh,
         "form": "rechteck", "fuell": farbe}
    if rund:
        e["eckradius"] = rund
    return e


def bild(id_, h, x, y, b, hh, rund=None, label=True):
    """Das Objektfoto. Fehlt es, zeichnet der Renderer einen Platzhalter —
    besser als eine leere Flaeche, in der niemand sieht, dass etwas fehlt."""
    e = {"id": id_, "typ": "bild", "gesperrt": True, "x": x, "y": y, "b": b, "h": hh,
         "slot": {"art": "titelbild"}, "fuellmodus": "cover",
         "platzhalter_farbe": h["f"]["band"]}
    if rund is None:
        rund = h["rund"]
    if rund:
        e["eckradius"] = rund
    if label:
        e["label"] = "{{objekt.hauptbild_url.titel}}"
        e["stil_label"] = "bild_label"
        e["label_hintergrund"] = "weiss" if h["ableitung"] == "raster" else "keiner"
    return e


def text(id_, stil, x, y, b, hh, inhalt, **mehr):
    e = {"id": id_, "typ": "text", "x": x, "y": y, "b": b, "h": hh,
         "stil": stil, "inhalt": inhalt}
    e.update(mehr)
    return e


def pille(id_, h, x, y, b, hh, inhalt, fuell=None):
    """Der Hinweis auf dem Bild: NEU IM ANGEBOT, VERKAUFT, RESERVIERT."""
    aus = []
    if h["ableitung"] != "signature":
        aus.append(flaeche(id_ + "-grund", h, x, y, b, hh,
                           fuell or h["f"]["akzent"],
                           hh / 2 if h["ableitung"] == "raster" else 0))
    aus.append(text(id_, "pille", x + 14, y + hh / 2 - 4.5, b - 28, 9, inhalt,
                    einzeilig=True))
    return aus


def marke(id_, h, x, y, b, hh, mit_kasten=True):
    """Logo und Markenname. Der Name steht nur da, wenn kein breites Logo
    hinterlegt ist — sonst staende beides nebeneinander."""
    aus = []
    if mit_kasten and h["ableitung"] != "signature":
        aus.append(flaeche(id_ + "-kasten", h, x, y, b, hh,
                           "weiss" if h["ableitung"] == "raster" else h["f"]["band"],
                           10 if h["ableitung"] == "raster" else 0))
    ton = "dunkel" if h["ableitung"] == "raster" else "hell"
    aus.append({
        "id": id_ + "-logo", "typ": "bild",
        "x": x + 14, "y": y + hh / 2 - 11, "b": b - 28, "h": 22,
        "slot": {"art": "logo", "ton": ton}, "fuellmodus": "contain",
        "ausrichtung": "mitte" if h["ableitung"] == "signature" else "links",
        "sichtbar_wenn": {"vorhanden": "firma.logo." + ton},
    })
    aus.append(text(id_ + "-name", "marke", x + 14, y + hh / 2 - 2, b - 28, 13,
                    "{{firma.marken_name}}", einzeilig=True,
                    sichtbar_wenn={"nicht": {"vorhanden": "firma.logo." + ton}}))
    aus.append(text(id_ + "-zusatz", "marke_zusatz", x + 14, y + hh / 2 - 13, b - 28, 7,
                    "{{firma.linie?}}", einzeilig=True,
                    sichtbar_wenn={"nicht": {"vorhanden": "firma.logo." + ton}}))
    return aus


def kennzahlen(id_, h, x, y, b, hh, eintraege, hintergrund=None):
    e = {"id": id_, "typ": "kennzahl", "gesperrt": True,
         "x": x, "y": y, "b": b, "h": hh,
         "variante": "leiste", "spalten": len(eintraege), "polster": 16,
         # Der Trenner MUSS aus der Palette der jeweiligen Handschrift
         # kommen. "line" gibt es nur bei Raster; bei Studio heisst dieselbe
         # Farbe "rule". Ein Name, den die Palette nicht kennt, laesst das
         # ganze Element ohne Text liegen — der Hintergrund steht dann da,
         # die Zahlen fehlen, und es sieht nach einem Fehler im Inhalt aus.
         "trenner": h["f"]["linie"], "trenner_oben": 16, "trenner_unten": 16,
         "trenner_breite": 0.8,
         "wert_grundlinie": hh - 32, "label_grundlinie": hh - 52,
         "stil_wert": "kz_wert", "stil_wert_letzter": "kz_wert_letzter",
         "stil_label": "kz_label", "eintraege": eintraege}
    if hintergrund:
        e["hintergrund"] = hintergrund
        if h["rund"]:
            e["eckradius"] = 12
    return e


def marke_mitte(id_, h, y, b=440, hoehe=24, mit_strich=True):
    """Signature setzt die Marke als Satz in die Mitte. Hat der Mandant ein
    Logo hinterlegt, gilt das Logo — ein Haus, das ein Zeichen hat, will es
    auch benutzen. Dann entfallen Wortmarke, Strich und Zusatzzeile."""
    x = (FEED_B - b) / 2
    da = {"vorhanden": "firma.logo.hell"}
    aus = [{
        "id": id_ + "-logo", "typ": "bild", "x": x, "y": y - 2, "b": b, "h": hoehe + 6,
        "slot": {"art": "logo", "ton": "hell"}, "fuellmodus": "contain",
        "ausrichtung": "mitte", "sichtbar_wenn": da,
    }]
    aus.append(text(id_, "marke", x, y, b, 20, "{{firma.marken_name}}",
                    einzeilig=True, sichtbar_wenn={"nicht": da}))
    if mit_strich:
        aus.append({"id": id_ + "-strich", "typ": "form", "gesperrt": True,
                    "x": FEED_B / 2 - 24, "y": y - 12, "b": 48, "h": 0,
                    "form": "linie", "strich": "a", "linienbreite": 0.7,
                    "sichtbar_wenn": {"nicht": da}})
        aus.append(text(id_ + "-zusatz", "marke_zusatz", x, y - 30, b, 7,
                        "{{firma.linie?}}", einzeilig=True,
                        sichtbar_wenn={"nicht": da}))
    return aus


def fakten(id_, h, x, y, b, hh):
    """Die Zahlen des Objekts. Zebra nur bei Raster — auf dunklem Grund
    waere der Wechsel ein Flimmern."""
    e = {"id": id_, "typ": "faktentabelle", "x": x, "y": y, "b": b, "h": hh,
         "zeilenhoehe": 36, "polster": 12, "grundlinie_versatz": 3,
         "stil_label": "tab_label", "stil_wert": "tab_wert",
         "zeilen": [
             {"label": "Wohnfläche", "feld": "objekt.wohnflaeche"},
             {"label": "Grundstück", "feld": "objekt.grundstueck"},
             {"label": "Zimmer", "feld": "objekt.zimmer"},
             {"label": "Baujahr", "feld": "objekt.baujahr"},
             {"label": "Zustand", "feld": "objekt.zustand"},
             {"label": "Verfügbar ab", "feld": "objekt.verfuegbar_ab"},
             {"label": "Kaufpreis", "feld": "objekt.preis"},
         ]}
    if h["ableitung"] == "raster":
        e["darstellung"] = "zebra"
        e["zebra_farbe"] = "surf"
        e["eckradius"] = 6
    else:
        e["darstellung"] = "ohne"
    return e


def besonderes(id_, h, x, y, b, hh):
    """Die Highlights des Objekts — vom Makler gepflegt, nicht erfunden."""
    e = {"id": id_, "typ": "highlights", "x": x, "y": y, "b": b, "h": hh,
         "darstellung": "karten", "spalten": 1, "abstand": 10, "polster": 16,
         "nummer_versatz": 26, "titel_versatz": 48, "text_versatz": 16,
         "stil_nummer": "hl_nummer", "stil_titel": "hl_titel", "stil_text": "hl_text"}
    if h["ableitung"] == "raster":
        e["eckradius"] = 10
        e["hintergrund"] = "surf"
    elif h["ableitung"] == "signature":
        e["rahmen"] = "a"
        e["linienbreite"] = 0.6
    else:
        e["hintergrund"] = "text"
    return e


def kontakt(id_, h, x, y, b, hh):
    e = {"id": id_, "typ": "kontaktkarte", "x": x, "y": y, "b": b, "h": hh,
         "foto_radius": 40, "foto_x": 64, "foto_y": hh / 2,
         "foto_platzhalter": h["f"]["band"],
         "text_x": 128, "name_versatz": 38, "funktion_abstand": 16,
         "kontakt_abstand": 24, "kontakt_zeilenhoehe": 16, "kontakt_spalte": 52,
         "stil_name": "ap_name", "stil_funktion": "ap_funktion",
         "stil_kontakt_label": "ap_label", "stil_kontakt_wert": "ap_wert",
         "kontakte": [
             {"label": "Telefon", "feld": "ansprechpartner.telefon"},
             {"label": "Mobil", "feld": "ansprechpartner.mobil"},
             {"label": "E-Mail", "feld": "ansprechpartner.email"},
         ]}
    if h["ableitung"] == "raster":
        e["hintergrund"] = "surf"
        e["eckradius"] = 14
    return e


VIER = [
    {"label": "Wohnfläche", "wert": "{{objekt.wohnflaeche}}"},
    {"label": "Zimmer", "wert": "{{objekt.zimmer}}"},
    {"label": "Grundstück", "wert": "{{objekt.grundstueck}}"},
    {"label": "Kaufpreis", "wert": "{{objekt.preis}}"},
]
DREI = [
    {"label": "Wohnfläche", "wert": "{{objekt.wohnflaeche}}"},
    {"label": "Zimmer", "wert": "{{objekt.zimmer}}"},
    {"label": "Kaufpreis", "wert": "{{objekt.preis}}"},
]


# ---------------------------------------------------------------------------
# Die Seiten
# ---------------------------------------------------------------------------
# Jede Handschrift hat ihre eigene Anordnung — das ist der Unterschied
# zwischen den dreien, nicht nur die Farbe. Die Masse stehen bewusst als
# Zahlen da und nicht in Formeln: man soll sie im Entwurf wiederfinden.

def seite(id_, name, elemente):
    # "leer" ist der neutrale Seitentyp des Schemas — eine Social-Kachel ist
    # keine Expos\u00e9-Seite mit fester Rolle.
    return {"id": id_, "typ": "leer", "name": name, "ohne_fuss": True,
            "elemente": [e for e in elemente if e]}


# --- Raster -----------------------------------------------------------------
def raster_post(h, verkauft):
    B, H = FEED_B, FEED_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus.append(bild("foto", h, 12, 243, B - 24, 420))
    if verkauft:
        aus.append({"id": "foto-scrim", "typ": "form", "gesperrt": True,
                    "x": 12, "y": 243, "b": B - 24, "h": 420,
                    "form": "scrim", "farbe": "schwarz", "staerke": 0.45,
                    "richtung": "unten", "eckradius": h["rund"]})
    aus += pille("hinweis", h, 28, 614, 175, 30,
                 "Verkauft" if verkauft else "Neu im Angebot",
                 h["f"]["dunkel"] if verkauft else None)
    aus += marke("marke", h, B - 28 - 158, 608, 158, 42)
    aus.append(text("augenbraue", "augenbraue", 24, 224, B - 48, 10,
                    "{{objekt.objektart}}  ·  {{objekt.ortsteil?}}", einzeilig=True))
    aus.append(text("titel", "titel", 24, 126, B - 48, 72,
                    "{{objekt.objekttitel}}",
                    zeilenschritt=33, verdichten=True, max_zeilen=2))
    aus.append(kennzahlen("kz", h, 12, 20, B - 24, 96,
                          DREI if verkauft else VIER, h["f"]["band"]))
    return seite("verkauft" if verkauft else "neu",
                 "Verkauft" if verkauft else "Neu im Angebot", aus)


def raster_karussell(h, nr):
    B, H = FEED_B, FEED_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus += marke("marke", h, 24, H - 66, 158, 42)
    if nr == 1:
        aus.append(bild("foto", h, 12, 180, B - 24, 420))
        aus.append(text("augenbraue", "augenbraue", 24, 150, B - 48, 10,
                        "{{objekt.objektart}}  ·  {{objekt.plz_ort}}", einzeilig=True))
        aus.append(text("titel", "titel", 24, 72, B - 48, 68,
                        "{{objekt.objekttitel}}",
                        zeilenschritt=33, verdichten=True, max_zeilen=2))
        aus.append(text("fuss", "fuss", 24, 36, B - 48, 10,
                        "Alle Angaben im Exposé", einzeilig=True))
        return seite("kar_1", "Karussell 1 — Titel", aus)
    if nr == 2:
        aus.append(text("ueber", "augenbraue", 24, H - 110, B - 48, 10,
                        "Die Zahlen", einzeilig=True))
        aus.append(fakten("fakten", h, 24, 90, B - 48, H - 220))
        return seite("kar_2", "Karussell 2 — Zahlen", aus)
    if nr == 3:
        aus.append(text("ueber", "augenbraue", 24, H - 110, B - 48, 10,
                        "Das Besondere", einzeilig=True))
        aus.append(besonderes("highlights", h, 24, 70, B - 48, H - 200))
        return seite("kar_3", "Karussell 3 — Highlights", aus)
    aus.append(text("ueber", "augenbraue", 24, H - 110, B - 48, 10,
                    "Fragen? Gern.", einzeilig=True))
    aus.append(kontakt("kontakt", h, 24, 230, B - 48, 160))
    aus.append({"id": "qr", "typ": "qr", "x": B / 2 - 48, "y": 92, "b": 96, "h": 96,
                "inhalt": "{{objekt.expose_qr_url}}", "farbe": h["f"]["auf"]})
    aus.append(text("qr-text", "fuss", 24, 62, B - 48, 10,
                    "Exposé scannen", einzeilig=True))
    return seite("kar_4", "Karussell 4 — Kontakt", aus)


def raster_story(h, verkauft):
    B, H = STORY_B, STORY_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus.append(bild("foto", h, 0, 330, B, H - 330, rund=0))
    if verkauft:
        aus.append({"id": "foto-scrim", "typ": "form", "gesperrt": True,
                    "x": 0, "y": 330, "b": B, "h": H - 330,
                    "form": "scrim", "farbe": "schwarz", "staerke": 0.45,
                    "richtung": "unten"})
    # Marke oben rechts, Hinweis oben links — wie beim Beitrag. Unten am
    # Bild steht schon die Bildunterschrift; dort waere die Pille das zweite
    # Etikett auf derselben Kante.
    aus += marke("marke", h, B - 28 - 170, H - 96, 170, 46)
    aus += pille("hinweis", h, 28, H - 90, 175, 30,
                 "Verkauft" if verkauft else "Neu im Angebot",
                 h["f"]["dunkel"] if verkauft else None)
    aus.append(text("augenbraue", "augenbraue", 28, 292, B - 56, 10,
                    "{{objekt.objektart}}  ·  {{objekt.ortsteil?}}", einzeilig=True))
    aus.append(text("titel", "titel", 28, 186, B - 56, 82,
                    "{{objekt.objekttitel}}",
                    zeilenschritt=36, verdichten=True, max_zeilen=2))
    aus.append(kennzahlen("kz", h, 16, 40, B - 32, 110, DREI if verkauft else VIER,
                          h["f"]["band"]))
    return seite("verkauft" if verkauft else "neu",
                 "Verkauft" if verkauft else "Neu im Angebot", aus)


# --- Signature --------------------------------------------------------------
def signature_post(h, verkauft):
    """Das Bild traegt die ganze Flaeche, ein Abdunkler von unten macht den
    Text lesbar, ein feiner Goldrahmen fasst alles. Nichts steht in einer
    Box — der Entwurf lebt von der Ruhe."""
    B, H = FEED_B, FEED_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus.append(bild("foto", h, 0, 0, B, H, rund=0, label=False))
    aus.append({"id": "abdunkler", "typ": "form", "gesperrt": True,
                "x": 0, "y": 0, "b": B, "h": H,
                "form": "scrim", "farbe": "schwarz",
                "staerke": 0.88 if verkauft else 0.82, "richtung": "unten"})
    aus.append({"id": "rahmen", "typ": "form", "gesperrt": True,
                "x": 18, "y": 18, "b": B - 36, "h": H - 36,
                "form": "rechteck", "strich": "a", "linienbreite": 0.7})
    aus += marke_mitte("marke", h, H - 92)
    aus.append(text("augenbraue", "augenbraue", 50, 228, B - 100, 8,
                    ("Verkauft" if verkauft else "Neu im Angebot")
                    + "  ·  {{objekt.objektart}}", einzeilig=True))
    aus.append(text("titel", "titel", 40, 120, B - 80, 76,
                    "{{objekt.objekttitel}}",
                    zeilenschritt=44, verdichten=True, max_zeilen=2))
    aus.append({"id": "trenner", "typ": "form", "gesperrt": True,
                "x": B / 2 - 28, "y": 104, "b": 56, "h": 0,
                "form": "linie", "strich": "a", "linienbreite": 0.7})
    aus.append(text("preis", "preis", 40, 70, B - 80, 26,
                    "{{objekt.preis}}", einzeilig=True))
    aus.append(text("fuss", "fuss", 40, 40, B - 80, 8,
                    "{{objekt.plz_ort}}  ·  {{objekt.wohnflaeche}}"
                    "  ·  {{objekt.grundstueck}}", einzeilig=True))
    return seite("verkauft" if verkauft else "neu",
                 "Verkauft" if verkauft else "Neu im Angebot", aus)


def signature_karussell(h, nr):
    B, H = FEED_B, FEED_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus.append({"id": "rahmen", "typ": "form", "gesperrt": True,
                "x": 18, "y": 18, "b": B - 36, "h": H - 36,
                "form": "rechteck", "strich": "a", "linienbreite": 0.7})
    aus += marke_mitte("marke", h, H - 86, mit_strich=False)
    if nr == 1:
        aus.append(bild("foto", h, 44, 232, B - 88, 300, rund=0, label=False))
        aus.append(text("augenbraue", "augenbraue", 50, 196, B - 100, 8,
                        "{{objekt.objektart}}  ·  {{objekt.plz_ort}}", einzeilig=True))
        aus.append(text("titel", "titel", 40, 112, B - 80, 76,
                        "{{objekt.objekttitel}}",
                        zeilenschritt=40, verdichten=True, max_zeilen=2))
        aus.append(text("fuss", "fuss", 40, 62, B - 80, 8,
                        "Alle Angaben im Exposé", einzeilig=True))
        return seite("kar_1", "Karussell 1 — Titel", aus)
    if nr == 2:
        aus.append(text("ueber", "augenbraue", 50, H - 142, B - 100, 8,
                        "Die Zahlen", einzeilig=True))
        aus.append(fakten("fakten", h, 54, 86, B - 108, H - 250))
        return seite("kar_2", "Karussell 2 — Zahlen", aus)
    if nr == 3:
        aus.append(text("ueber", "augenbraue", 50, H - 142, B - 100, 8,
                        "Das Besondere", einzeilig=True))
        aus.append(besonderes("highlights", h, 54, 70, B - 108, H - 234))
        return seite("kar_3", "Karussell 3 — Highlights", aus)
    aus.append(text("ueber", "augenbraue", 50, H - 142, B - 100, 8,
                    "Fragen? Gern.", einzeilig=True))
    aus.append(kontakt("kontakt", h, 54, 250, B - 108, 160))
    aus.append({"id": "qr", "typ": "qr", "x": B / 2 - 48, "y": 110, "b": 96, "h": 96,
                "inhalt": "{{objekt.expose_qr_url}}", "farbe": h["f"]["auf"]})
    aus.append(text("qr-text", "fuss", 40, 80, B - 80, 8,
                    "Exposé scannen", einzeilig=True))
    return seite("kar_4", "Karussell 4 — Kontakt", aus)


def signature_story(h, verkauft):
    B, H = STORY_B, STORY_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus.append(bild("foto", h, 0, 0, B, H, rund=0, label=False))
    aus.append({"id": "abdunkler", "typ": "form", "gesperrt": True,
                "x": 0, "y": 0, "b": B, "h": H,
                "form": "scrim", "farbe": "schwarz",
                "staerke": 0.88 if verkauft else 0.82, "richtung": "unten"})
    aus.append({"id": "rahmen", "typ": "form", "gesperrt": True,
                "x": 22, "y": 22, "b": B - 44, "h": H - 44,
                "form": "rechteck", "strich": "a", "linienbreite": 0.7})
    aus += marke_mitte("marke", h, H - 130)
    aus.append(text("augenbraue", "augenbraue", 50, 292, B - 100, 8,
                    ("Verkauft" if verkauft else "Neu im Angebot")
                    + "  ·  {{objekt.objektart}}", einzeilig=True))
    aus.append(text("titel", "titel", 40, 174, B - 80, 84,
                    "{{objekt.objekttitel}}",
                    zeilenschritt=46, verdichten=True, max_zeilen=2))
    aus.append({"id": "trenner", "typ": "form", "gesperrt": True,
                "x": B / 2 - 28, "y": 156, "b": 56, "h": 0,
                "form": "linie", "strich": "a", "linienbreite": 0.7})
    aus.append(text("preis", "preis", 40, 118, B - 80, 26,
                    "{{objekt.preis}}", einzeilig=True))
    aus.append(text("fuss", "fuss", 40, 84, B - 80, 8,
                    "{{objekt.plz_ort}}  ·  {{objekt.wohnflaeche}}"
                    "  ·  {{objekt.grundstueck}}", einzeilig=True))
    return seite("verkauft" if verkauft else "neu",
                 "Verkauft" if verkauft else "Neu im Angebot", aus)


# --- Studio -----------------------------------------------------------------
def studio_post(h, verkauft):
    """Ein Farbfeld, ein Bild mit harten Kanten, eine schmale Versalzeile,
    ein schwarzer Balken unten. Nichts ist rund."""
    B, H = FEED_B, FEED_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus.append(bild("foto", h, 142, 300, B - 142, 345, rund=0, label=False))
    if verkauft:
        aus.append({"id": "foto-scrim", "typ": "form", "gesperrt": True,
                    "x": 142, "y": 300, "b": B - 142, "h": 345,
                    "form": "scrim", "farbe": "schwarz", "staerke": 0.5,
                    "richtung": "unten"})
    aus += marke("marke", h, 0, 603, 142, 42)
    aus += pille("hinweis", h, 142, 314, 170, 28,
                 "Verkauft" if verkauft else "Neu im Angebot", h["f"]["band"])
    aus.append(text("titel", "titel", 28, 108, B - 56, 168,
                    "{{objekt.objekttitel}}",
                    zeilenschritt=56, verdichten=True, max_zeilen=3))
    aus.append(text("unterzeile", "unterzeile", 28, 96, B - 56, 14,
                    "{{objekt.zimmer}} Zimmer  ·  {{objekt.wohnflaeche}}"
                    "  ·  {{objekt.ortsteil?}}", einzeilig=True))
    aus.append(kennzahlen("kz", h, 0, 0, B, 84, DREI if verkauft else VIER,
                          h["f"]["band"]))
    return seite("verkauft" if verkauft else "neu",
                 "Verkauft" if verkauft else "Neu im Angebot", aus)


def studio_karussell(h, nr):
    B, H = FEED_B, FEED_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus += marke("marke", h, 0, H - 56, 142, 42)
    if nr == 1:
        aus.append(bild("foto", h, 28, 250, B - 56, 330, rund=0, label=False))
        aus.append(text("titel", "titel", 28, 112, B - 56, 120,
                        "{{objekt.objekttitel}}",
                        zeilenschritt=52, verdichten=True, max_zeilen=2))
        aus.append(text("unterzeile", "unterzeile", 28, 80, B - 56, 14,
                        "{{objekt.plz_ort}}", einzeilig=True))
        aus.append(flaeche("balken", h, 0, 0, B, 56, h["f"]["band"]))
        aus.append(text("fuss", "fuss", 28, 22, B - 56, 10,
                        "Alle Angaben im Exposé", einzeilig=True))
        return seite("kar_1", "Karussell 1 — Titel", aus)
    if nr == 2:
        aus.append(text("ueber", "augenbraue", 28, H - 110, B - 56, 10,
                        "Die Zahlen", einzeilig=True))
        aus.append(fakten("fakten", h, 28, 90, B - 56, H - 220))
        return seite("kar_2", "Karussell 2 — Zahlen", aus)
    if nr == 3:
        aus.append(text("ueber", "augenbraue", 28, H - 110, B - 56, 10,
                        "Das Besondere", einzeilig=True))
        aus.append(besonderes("highlights", h, 28, 70, B - 56, H - 200))
        return seite("kar_3", "Karussell 3 — Highlights", aus)
    aus.append(text("ueber", "augenbraue", 28, H - 110, B - 56, 10,
                    "Fragen? Gern.", einzeilig=True))
    aus.append(kontakt("kontakt", h, 28, 230, B - 56, 160))
    aus.append({"id": "qr", "typ": "qr", "x": B / 2 - 48, "y": 92, "b": 96, "h": 96,
                "inhalt": "{{objekt.expose_qr_url}}", "farbe": h["f"]["auf"]})
    aus.append(text("qr-text", "fuss", 28, 62, B - 56, 10,
                    "Exposé scannen", einzeilig=True))
    return seite("kar_4", "Karussell 4 — Kontakt", aus)


def studio_story(h, verkauft):
    B, H = STORY_B, STORY_H
    aus = [flaeche("grund", h, 0, 0, B, H, h["f"]["grund"])]
    aus.append(bild("foto", h, 0, 420, B, 460, rund=0, label=False))
    if verkauft:
        aus.append({"id": "foto-scrim", "typ": "form", "gesperrt": True,
                    "x": 0, "y": 420, "b": B, "h": 460,
                    "form": "scrim", "farbe": "schwarz", "staerke": 0.5,
                    "richtung": "unten"})
    aus += marke("marke", h, 0, H - 56, 142, 42)
    aus += pille("hinweis", h, 28, 434, 170, 28,
                 "Verkauft" if verkauft else "Neu im Angebot", h["f"]["band"])
    aus.append(text("titel", "titel", 28, 218, B - 56, 174,
                    "{{objekt.objekttitel}}",
                    zeilenschritt=58, verdichten=True, max_zeilen=3))
    aus.append(text("unterzeile", "unterzeile", 28, 196, B - 56, 14,
                    "{{objekt.zimmer}} Zimmer  ·  {{objekt.wohnflaeche}}"
                    "  ·  {{objekt.ortsteil?}}", einzeilig=True))
    aus.append(kennzahlen("kz", h, 0, 54, B, 100, DREI if verkauft else VIER,
                          h["f"]["band"]))
    return seite("verkauft" if verkauft else "neu",
                 "Verkauft" if verkauft else "Neu im Angebot", aus)


SEITENBAU = {
    "raster":    (raster_post, raster_karussell, raster_story),
    "signature": (signature_post, signature_karussell, signature_story),
    "studio":    (studio_post, studio_karussell, studio_story),
}


def vorlage(schluessel, art):
    h = HANDSCHRIFT[schluessel]
    post, karussell, story = SEITENBAU[schluessel]
    if art == "feed":
        b, hh = FEED_B, FEED_H
        seiten = [post(h, False), post(h, True)] + [karussell(h, n) for n in (1, 2, 3, 4)]
        name = h["name"] + " — Beitrag & Karussell"
        beschr = ("Beitrag 1080×1350 für Feed und Karussell. " + h["beschreibung"])
    else:
        b, hh = STORY_B, STORY_H
        seiten = [story(h, False), story(h, True)]
        name = h["name"] + " — Story"
        beschr = ("Story 1080×1920 für Instagram, Facebook und WhatsApp. "
                  + h["beschreibung"])
    return {
        "schema": 1,
        "name": name,
        "beschreibung": beschr,
        "basis": schluessel,
        "format": {"breite": b, "hoehe": hh, "ausrichtung": "hoch"},
        "stil": {
            "farben": {"f1": "ci.primaer", "f2": "ci.akzent",
                       "ableitung": h["ableitung"]},
            "schriften": {
                "headline": h["stile"]["titel"]["schrift"],
                "text": h["stile"]["unterzeile"]["schrift"],
                "label": h["stile"]["kz_label"]["schrift"],
            },
            "textstile": h["stile"],
        },
        "seiten": seiten,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pruefen", action="store_true",
                   help="nur vergleichen, nichts schreiben")
    a = p.parse_args()

    abweichung = 0
    for schluessel in ("raster", "signature", "studio"):
        for art in ("feed", "story"):
            datei = os.path.join(ZIEL, "social-%s-%s.json" % (schluessel, art))
            inhalt = json.dumps(vorlage(schluessel, art), ensure_ascii=False,
                                indent=2) + "\n"
            if a.pruefen:
                alt = ""
                if os.path.exists(datei):
                    with open(datei, encoding="utf-8") as f:
                        alt = f.read()
                if alt != inhalt:
                    abweichung += 1
                    print("[ABWEICHUNG] %s — scripts/social-vorlagen.py "
                          "erzeugt etwas anderes." % os.path.basename(datei))
            else:
                with open(datei, "w", encoding="utf-8") as f:
                    f.write(inhalt)
                n = sum(len(s["elemente"]) for s in json.loads(inhalt)["seiten"])
                print("%-34s %d Seiten, %d Elemente"
                      % (os.path.basename(datei),
                         len(json.loads(inhalt)["seiten"]), n))
    if a.pruefen:
        if abweichung:
            print("\n%d Datei(en) weichen ab. `python3 scripts/social-vorlagen.py` "
                  "laufen lassen." % abweichung)
            return 1
        print("[ok] Die sechs Social-Vorlagen stimmen mit dem Erzeuger ueberein.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
