#!/usr/bin/env python3
"""Erzeugt packages/expose-renderer/vorlagen/buehne.json — die Systemvorlage
„Bühne" (A4 quer), portiert aus reference/expose-vorlagen/
immoOffice_buehne_generator.py (ReportLab-Prototyp vom 07.10.2026).

Die drei älteren Vorlagen liegen als handgeschriebenes JSON vor. Bühne
hat ein Raster aus vielen gleichartigen Karten, Pillen und Kacheln; die
Maße stehen hier als Rechnung, nicht als 300 abgeschriebene Zahlen. Wer
die Vorlage ändern will, ändert dieses Skript und lässt es laufen —
danach scripts/expose-systemvorlagen.py für die Migration.

Maße in Punkt, Ursprung links unten, wie im Renderer. Der Prototyp rechnet
genauso (ReportLab), deshalb lassen sich seine Koordinaten übernehmen.

    python3 scripts/expose-vorlage-buehne.py
"""
import json
import os

STAMM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(STAMM, "packages", "expose-renderer", "vorlagen", "buehne.json")

W, H = 841.89, 595.28      # A4 quer
M = 34                     # Seitenrand des Prototyps
R = 16                     # Eckenradius Bilder/Karten

HEAD = {"familie": "bricolage", "schnitt": "ExtraBold"}
HEAD_B = {"familie": "bricolage", "schnitt": "Bold"}
HEAD_M = {"familie": "bricolage", "schnitt": "Medium"}
TXT = {"familie": "dmsans", "schnitt": "Regular"}
TXT_M = {"familie": "dmsans", "schnitt": "Medium"}
TXT_B = {"familie": "dmsans", "schnitt": "Bold"}


def st(schrift, groesse, farbe, **mehr):
    s = {"schrift": schrift, "groesse": groesse, "farbe": farbe}
    s.update(mehr)
    return s


# Die Schriftstile — Namen wie im Prototyp (label, para, pill …), damit man
# die Stellen wiederfindet.
TEXTSTILE = {
    "marke": st(HEAD, 12.5, "ink", min_groesse=7),
    "marke_hell": st(HEAD, 12, "onD", min_groesse=7),
    "label": st(TXT_B, 6.8, "muted", sperrung=0.8, grossbuchstaben=True),
    "label_hell": st(TXT_B, 6.8, "onDm", sperrung=0.8, grossbuchstaben=True),
    "label_onA": st(TXT_B, 7, "onA", sperrung=0.8, grossbuchstaben=True),
    "label_kapitel": st(TXT_B, 6.8, "muted", sperrung=0.8, grossbuchstaben=True),
    "kapitel_nr": st(TXT_B, 7.5, "onA"),
    "kapitel_titel": st(HEAD, 30, "ink", min_groesse=18),
    "kapitel_titel_hell": st(HEAD, 38, "onD", min_groesse=20),
    "kapitel_titel_akzent": st(HEAD, 38, "aAufD", min_groesse=20),
    "seite_pill": st(TXT_B, 7, "onD"),
    "fuss": st(TXT, 7, "muted", min_groesse=5),
    "cover_pill_a": st(TXT_B, 7.8, "onA"),
    "cover_pill_d": st(TXT_M, 7.8, "ink"),
    "cover_nr": st(TXT_M, 7.5, "ink"),
    "cover_titel": st(HEAD, 31, "ink", zeilen=33, min_groesse=20),
    "cover_slogan": st(TXT, 11, "text", min_groesse=8),
    "cover_adresse": st(TXT_M, 8.2, "muted", min_groesse=6),
    "sticker_label": st(TXT_B, 7, "onA", sperrung=0.8, grossbuchstaben=True, ausrichtung="mitte"),
    "sticker_preis": st(HEAD, 21, "onA", ausrichtung="mitte", min_groesse=12),
    "sticker_unter": st(TXT_M, 8, "onA", ausrichtung="mitte", min_groesse=6),
    "bild_label": st(TXT_M, 6.6, "ink"),
    "kz_label": st(TXT_B, 6.5, "muted", sperrung=0.8, grossbuchstaben=True),
    "kz_label_erster": st(TXT_B, 6.5, "onA", sperrung=0.8, grossbuchstaben=True),
    "kz_wert": st(HEAD, 21, "ink", min_groesse=12),
    "kz_wert_erster": st(HEAD, 21, "onA", min_groesse=12),
    "fakt_label": st(TXT, 8.2, "muted"),
    "fakt_wert": st(TXT_B, 8.2, "ink"),
    "hl_text": st(TXT_M, 8, "ink"),
    "fliesstext": st(TXT, 10, "text", zeilen=16, min_groesse=8),
    "lage_text": st(TXT, 9.2, "text", zeilen=14, min_groesse=7.5),
    "zitat_zeichen": st(HEAD, 40, "a"),
    "zitat": st(HEAD_B, 16, "onD", zeilen=20, min_groesse=11),
    "aus_nummer": st(HEAD, 11, "aT"),
    "aus_titel": st(HEAD_B, 13, "ink"),
    "aus_punkt": st(TXT_M, 7.8, "ink"),
    "band_titel": st(HEAD, 17, "onD"),
    "gr_ebene": st(HEAD_B, 17, "aT", min_groesse=11),
    "raum_name": st(TXT, 8.6, "text"),
    "raum_flaeche": st(TXT_B, 8.6, "ink"),
    "raum_summe": st(TXT_B, 8.6, "onA"),
    "raum_summe_wert": st(HEAD, 10, "onA"),
    "kleingedruckt": st(TXT, 6.8, "muted", zeilen=9.5),
    "karte_quelle": st(TXT, 5.5, "muted"),
    "dist_name": st(TXT_B, 8.4, "ink"),
    "dist_wert": st(TXT, 7, "muted"),
    "dist_minuten": st(HEAD, 9, "onA"),
    "tacho_klasse": st(TXT_B, 9, "weiss"),
    "tacho_wert": st(HEAD, 30, "ink"),
    "tacho_einheit": st(TXT_M, 8, "muted"),
    "en_klasse": st(HEAD, 56, "onA"),
    "en_urteil": st(HEAD_B, 14, "onA", ausrichtung="rechts"),
    "en_hinweis": st(TXT, 8.4, "onA", ausrichtung="rechts"),
    "kosten_name": st(TXT, 8.2, "text"),
    "kosten_wert": st(TXT_B, 9.4, "ink"),
    "kosten_summe": st(HEAD_B, 11, "ink"),
    "kosten_summe_wert": st(HEAD, 12, "aT"),
    "donut_label": st(TXT_B, 6.8, "muted", sperrung=0.8, grossbuchstaben=True),
    "donut_wert": st(HEAD, 15, "ink"),
    "rate_wert": st(HEAD, 38, "aAufD", min_groesse=20),
    "rate_unter": st(TXT, 8.6, "onDm"),
    "fin_label": st(TXT, 8.2, "onDm"),
    "fin_wert": st(TXT_B, 8.4, "onD"),
    "fuss_hell": st(TXT, 7.2, "onDm", zeilen=10),
    "ap_label": st(TXT_B, 6.8, "muted", sperrung=0.8, grossbuchstaben=True),
    "ap_name": st(HEAD, 18, "ink", min_groesse=12),
    "ap_funktion": st(TXT, 8.4, "muted"),
    "ap_k_label": st(TXT_B, 7.6, "aT"),
    "ap_k_wert": st(TXT_M, 8.4, "ink"),
    "qr_label": st(TXT_M, 7.2, "muted", ausrichtung="mitte"),
    "ablauf": st(TXT_M, 8.2, "onD"),
    "impressum": st(TXT, 6.8, "onDm", zeilen=9),
    "recht": st(TXT, 6.4, "onDm", zeilen=8.6),
}

KLASSEN = [
    {"name": "A+", "grenze": 30, "farbe": "#1E8A3C"}, {"name": "A", "grenze": 50, "farbe": "#4BA33A"},
    {"name": "B", "grenze": 75, "farbe": "#8DBF3A"}, {"name": "C", "grenze": 100, "farbe": "#C9D43A"},
    {"name": "D", "grenze": 130, "farbe": "#F2D12F"}, {"name": "E", "grenze": 160, "farbe": "#F2A72F"},
    {"name": "F", "grenze": 200, "farbe": "#EE7A2B"}, {"name": "G", "grenze": 250, "farbe": "#E5482A"},
    {"name": "H", "grenze": 300, "farbe": "#C42727"},
]


def text(id_, x, y, b, h, stil, inhalt, ausrichtung=None, **mehr):
    """Die Ausrichtung ist Sache des STILS, nicht des Elements — der
    Renderer liest sie nur dort. Wer hier eine nennt, bekommt eine
    abgeleitete Stilfassung („kapitel_nr@mitte"), einmal angelegt."""
    if ausrichtung and TEXTSTILE[stil].get("ausrichtung") != ausrichtung:
        abgeleitet = f"{stil}@{ausrichtung}"
        TEXTSTILE.setdefault(abgeleitet, dict(TEXTSTILE[stil], ausrichtung=ausrichtung))
        stil = abgeleitet
    e = {"id": id_, "typ": "text", "x": x, "y": y, "b": b, "h": h, "stil": stil, "inhalt": inhalt}
    e.update(mehr)
    e.setdefault("einzeilig", True)
    return e


def absatz(id_, x, y, b, h, stil, inhalt, **mehr):
    e = {"id": id_, "typ": "text", "x": x, "y": y, "b": b, "h": h, "stil": stil, "inhalt": inhalt,
         "einzeilig": False, "blocksatz": True, "verdichten": True}
    e.update(mehr)
    return e


def rr(id_, x, y, b, h, fuell, r=R, **mehr):
    e = {"id": id_, "typ": "form", "x": x, "y": y, "b": b, "h": h, "form": "rechteck",
         "fuell": fuell, "eckradius": r}
    e.update(mehr)
    return e


def kreis(id_, cx, cy, r, fuell, **mehr):
    e = {"id": id_, "typ": "form", "x": cx - r, "y": cy - r, "b": 2 * r, "h": 2 * r,
         "form": "kreis", "fuell": fuell}
    e.update(mehr)
    return e


def bild(id_, x, y, b, h, slot, label, r=R, **mehr):
    e = {"id": id_, "typ": "bild", "x": x, "y": y, "b": b, "h": h, "slot": slot,
         "fuellmodus": "cover", "eckradius": r, "platzhalter_farbe": "ph",
         "stil_label": "bild_label", "label_hintergrund": "weiss", "label_deckkraft": 0.85,
         "label_x": 10, "label_y": 10, "label_hoehe": 15, "label_radius": 7.5,
         "label_luft": 14, "label_polster": 7, "label_grundlinie": 4.8}
    if label is not None:
        e["label"] = label
    else:
        # Beschriftung aus dem Bildtitel, wie der Prototyp sie zeigt
        # ("Bild 02 · Strassenansicht") — folgt auf wiederholten Seiten der
        # Nummer, die gerade gilt.
        e["label_vom_slot"] = True
    e.update(mehr)
    return e


def pill(id_, x, y, b, h, fuell, stil, inhalt, polster=10, **mehr):
    """Eine Pille ist Fläche plus Text: zwei Elemente."""
    f = rr(id_ + "-flaeche", x, y, b, h, fuell, h / 2)
    t = text(id_, x + polster, y + h / 2 - TEXTSTILE[stil]["groesse"] * 0.34, b - 2 * polster, 0, stil, inhalt)
    for k in ("sichtbar_wenn",):
        if k in mehr:
            f[k] = mehr[k]; t[k] = mehr[k]
    return [f, t]


def rahmen(nr):
    """Seitenzahl-Pille rechts unten, Fußzeile links — wie x.rahmen()."""
    return [
        rr("fuss-seite-flaeche", W - M - 64, 14, 64, 17, "d", 8.5),
        text("fuss-seite", W - M - 64, 14 + 8.5 - 7 * 0.34, 64, 0, "seite_pill",
             "{{seite.nummer_zweistellig}} / {{seite.gesamt_zweistellig}}", ausrichtung="mitte"),
        text("fuss-firma", M, 19, 400, 0, "fuss", "{{firma.name}}  ·  Exposé {{objekt.immo_nr}}"),
    ]


def ueberschrift(x, y, nr, titel, sub, breit=400, hell=False):
    """Nummern-Pille, Label daneben, Titel darunter — wie x.ueberschrift()."""
    aus = [
        rr("kapitel-nr-flaeche", x, y, 30, 17, "a", 8.5),
        text("kapitel-nr", x, y + 8.5 - 7.5 * 0.34, 30, 0, "kapitel_nr", nr, ausrichtung="mitte"),
        text("kapitel-label", x + 38, y + 5.5, 300, 0, "label_kapitel", sub),
        text("kapitel-titel", x, y - 36, breit, 0, "kapitel_titel_hell" if hell else "kapitel_titel", titel),
    ]
    return aus


def seite(id_, typ, name, elemente, **mehr):
    # Jede Seite steht auf dem Papierton der Palette (im Prototyp
    # x.seite() → c.setFillColor(F["paper"]) + rect). Weiss auf Weiss ist
    # keine Karte.
    s = {"id": id_, "typ": typ, "name": name, "hintergrund": {"art": "farbe", "farbe": "paper"}}
    s.update(mehr)
    s["elemente"] = elemente
    return s


# ------------------------------------------------------------------- Seiten
def cover():
    pw, ph = 470, 214
    py = M + ph - 36
    e = [
        bild("cover-bild", 0, 0, W, H, {"art": "titelbild"}, None, r=0, gesperrt=True),
        # Logo-Pille: weiß, 186 x 30, oben links
        rr("cover-logo-flaeche", M, H - M - 30, 186, 30, "weiss", 15,
           sichtbar_wenn={"oder": [{"vorhanden": "firma.logo.hell"}, {"vorhanden": "firma.marken_name"}]}),
        {"id": "cover-logo", "typ": "bild", "x": M + 14, "y": H - M - 26, "b": 158, "h": 22,
         "slot": {"art": "logo", "ton": "hell"}, "fuellmodus": "contain", "ausrichtung": "links",
         "sichtbar_wenn": {"vorhanden": "firma.logo.hell"}},
        text("cover-marke", M + 14, H - M - 19.5, 158, 10, "marke", "{{firma.marken_name}}",
             sichtbar_wenn={"nicht": {"vorhanden": "firma.logo.hell"}}),
        # Objektnummer-Pille rechts oben
        rr("cover-nr-flaeche", W - M - 120, H - M - 26, 120, 22, "weiss", 11, deckkraft=0.85),
        text("cover-nr", W - M - 120, H - M - 26 + 11 - 7.5 * 0.34, 120, 0, "cover_nr",
             "Exposé {{objekt.immo_nr}}", ausrichtung="mitte"),
        # Titel-Panel
        rr("cover-panel", M, M, pw, ph, "weiss", 22),
        *pill("cover-art", M + 24, py, 76 - 6, 20, "a", "cover_pill_a", "{{objekt.vermarktung_pille}}"),
        *pill("cover-objektart", M + 24 + 76, py, 110, 20, "softD", "cover_pill_d", "{{objekt.objektart}}"),
        # Der Renderer setzt die erste Grundlinie an die OBERKANTE des
        # Rahmens (y + h). Erste Zeile 38 unter der Pille, zweite 33 tiefer.
        absatz("cover-titel", M + 24, py - 38 - 66, pw - 48, 66, "cover_titel",
               "{{objekt.objekttitel}}", blocksatz=False, zeilenschritt=33, max_zeilen=2),
        text("cover-slogan", M + 24, py - 38 - 33 - 30, pw - 48, 0, "cover_slogan", "{{objekt.expose_slogan}}"),
        text("cover-adresse", M + 24, M + 22, pw - 48, 0, "cover_adresse", "{{objekt.adresse}}, {{objekt.plz_ort}}",
             sichtbar_wenn={"feld": "objekt.adresse_freigeben", "gleich": True}),
    ]
    # Preis-Sticker: Kreis plus drei gedrehte Zeilen (8 Grad), wie der Prototyp
    cx, cy, r = W - M - 92, M + 150, 78
    e.append(kreis("sticker", cx, cy, r, "a"))
    import math
    def gedreht(id_, dy, stil, inhalt, breite=150):
        # Drehpunkt ist der Zeilenanfang; der Text ist mittig gesetzt, also
        # beginnt die Zeile bei -breite/2 — gedreht um 8 Grad um die Mitte.
        a = math.radians(8)
        x0 = cx + (-breite / 2) * math.cos(a) - dy * math.sin(a)
        y0 = cy + (-breite / 2) * math.sin(a) + dy * math.cos(a)
        return text(id_, x0, y0, breite, 0, stil, inhalt, drehung=8)
    e += [
        gedreht("sticker-label", 22, "sticker_label", "Kaufpreis"),
        gedreht("sticker-preis", -6, "sticker_preis", "{{objekt.preis}}"),
        gedreht("sticker-unter", -28, "sticker_unter", "{{objekt.wohnflaeche}} · {{objekt.zimmer}} Zimmer"),
    ]
    return seite("cover", "cover", "Titelseite", e, ohne_fuss=True)


def blick():
    pw = 300
    rx = M + pw + 26
    rw = W - M - rx
    y = H - M - 18 - 50          # Unterkante der Überschrift
    e = [bild("blick-bild", M, 44, pw, H - 44 - M, {"art": "foto", "nr": 1}, "{{bild.foto.1.titel}}")]
    e += ueberschrift(rx, H - M - 18, "01", "Auf einen Blick", "Die Eckdaten", rw)
    gw = (rw - 20) / 3
    gh = 64
    e.append({"id": "eckdaten", "typ": "kennzahl", "x": rx, "y": y - 10 - 2 * gh - 10, "b": rw, "h": 2 * gh + 10,
              "variante": "kacheln", "spalten": 3, "abstand": 10, "kachel_hoehe": gh, "kachel_fuell": "weiss",
              "kachel_fuell_erster": "a", "eckradius": 14, "polster": 14, "label_grundlinie": gh - 20,
              "wert_grundlinie": 15, "stil_label": "kz_label", "stil_label_erster": "kz_label_erster",
              "stil_wert": "kz_wert", "stil_wert_erster": "kz_wert_erster",
              "eintraege": [
                  {"label": "Kaufpreis", "wert": "{{objekt.preis}}"},
                  {"label": "Wohnfläche", "wert": "{{objekt.wohnflaeche}}"},
                  {"label": "Grundstück", "wert": "{{objekt.grundstueck}}"},
                  {"label": "Zimmer", "wert": "{{objekt.zimmer}}"},
                  {"label": "Baujahr", "wert": "{{objekt.baujahr}}"},
                  {"label": "Energie", "wert": "{{objekt.energie_klasse}}"},
              ]})
    fy = y - 10 - 2 * gh - 10 - 22
    rh, luft = 23, 4
    zeilen = 6
    e.append({"id": "fakten", "typ": "faktentabelle", "x": rx, "y": fy + 6 - zeilen * (rh + luft) + luft, "b": rw,
              "h": zeilen * (rh + luft), "darstellung": "pillen", "spalten": 2, "spaltenabstand": 10,
              "zeilenhoehe": rh + luft, "zeilenabstand": luft, "zebra_farbe": "softD", "polster": 12,
              "wert_tiefer": 0, "stil_label": "fakt_label", "stil_wert": "fakt_wert",
              "zeilen": [
                  {"label": "Objektart", "feld": "objekt.objektart"},
                  {"label": "Nutzfläche", "feld": "objekt.nutzflaeche"},
                  {"label": "Schlafzimmer", "feld": "objekt.schlafzimmer"},
                  {"label": "Badezimmer", "feld": "objekt.badezimmer"},
                  {"label": "Etagen", "feld": "objekt.etagen_gesamt"},
                  {"label": "Keller", "feld": "objekt.unterkellert"},
                  {"label": "Modernisierung", "feld": "objekt.modernisierung_jahr"},
                  {"label": "Zustand", "feld": "objekt.zustand"},
                  {"label": "Heizung", "feld": "objekt.heizungsart"},
                  {"label": "Stellplätze", "feld": "objekt.stellplatz"},
                  {"label": "Verfügbar", "feld": "objekt.verfuegbar_ab"},
                  {"label": "Käuferprovision", "feld": "objekt.provision_aussen"},
              ]})
    hy = fy - zeilen * (rh + luft) - 44
    e.append(text("hl-label", rx, hy + 34, 300, 0, "label", "Highlights",
                  sichtbar_wenn={"vorhanden": "objekt.expose_highlights"}))
    e.append({"id": "highlights", "typ": "highlights", "x": rx, "y": 44, "b": rw, "h": hy + 22 - 44,
              "darstellung": "pills", "pill_hoehe": 22, "pill_polster": 10, "pill_abstand": 6,
              "zeilenabstand": 6, "hintergrund": "weiss", "rahmen": "a", "linienbreite": 1,
              "punkt_farbe": "a", "punkt_radius": 4.5, "punkt_einzug": 22, "stil_titel": "hl_text"})
    e += rahmen("01")
    return seite("blick", "auf_einen_blick", "Auf einen Blick", e)


def objekt():
    lw = 400
    y = H - M - 18 - 50
    e = ueberschrift(M, H - M - 18, "02", "Das Haus", "Objektbeschreibung", lw)
    e[-1]["sichtbar_wenn"] = {"nicht": {"vorhanden": "objekt.ueberschrift_objektbeschreibung"}}
    e.append(text("kapitel-titel-eigen", M, H - M - 18 - 36, lw, 0, "kapitel_titel",
                  "{{objekt.ueberschrift_objektbeschreibung}}",
                  sichtbar_wenn={"vorhanden": "objekt.ueberschrift_objektbeschreibung"}))
    zy = M + 6
    e.append(absatz("objekt-text", M, zy + 96 + 20, lw, y - 8 - (zy + 96 + 20), "fliesstext",
                    "{{objekt.beschreibung_objekt}}", spalten=2, spaltenabstand=18, aufteilung="fliessend"))
    # Zitat-Karte
    Z = {"vorhanden": "objekt.expose_zitat"}
    e += [
        rr("zitat-karte", M, zy, lw, 96, "d", 18, sichtbar_wenn=Z),
        text("zitat-zeichen", M + 22, zy + 62, 30, 0, "zitat_zeichen", "„", sichtbar_wenn=Z),
        absatz("zitat", M + 50, zy + 56 - 20 - 4, lw - 74, 20 + 20 + 4, "zitat", "{{objekt.expose_zitat}}",
               blocksatz=False, zeilenschritt=20, max_zeilen=2, sichtbar_wenn=Z),
    ]
    bx = M + lw + 26
    bw = W - M - bx
    sw, sh = 150, 120
    e += [
        bild("objekt-bild", bx + 40, 44, bw - 40, H - 44 - M, {"art": "foto", "nr": 2}, "{{bild.foto.2.titel}}"),
        rr("detail-rahmen", bx - 6, 70 - 6, sw + 12, sh + 12, "paper", R + 4,
           sichtbar_wenn={"vorhanden": "bild.foto.3"}),
        bild("detail-bild", bx, 70, sw, sh, {"art": "foto", "nr": 3}, "{{bild.foto.3.titel}}",
             sichtbar_wenn={"vorhanden": "bild.foto.3"}),
    ]
    e += rahmen("02")
    return seite("objekt", "beschreibung", "Objektbeschreibung", e)


def ausstattung():
    y = H - M - 18 - 50
    gap = 12
    ch = 196
    e = ueberschrift(M, H - M - 18, "03", "Ausstattung", "Was das Haus mitbringt")
    G = {"vorhanden": "objekt.expose_ausstattung_gruppen"}
    e.append({"id": "gruppen", "typ": "ausstattung", "x": M, "y": y - 10 - ch, "b": W - 2 * M, "h": ch,
              "darstellung": "chips", "spalten": 4, "spaltenabstand": gap, "karten_farbe": "weiss",
              "eckradius": 18, "nummer_kreis": "soft", "nummer_radius": 12, "nummer_x": 26, "nummer_y": 26,
              "titel_x": 46, "polster": 14, "erste_zeile": 66, "chip_farbe": "softD", "chip_hoehe": 20,
              "chip_polster": 10, "chip_abstand": 5, "chip_zeile": 26,
              "stil_nummer": "aus_nummer", "stil_titel": "aus_titel", "stil_punkt": "aus_punkt",
              "sichtbar_wenn": G})
    # Ohne Gruppen: die Punkte als Checkliste in derselben Karte
    e.append(rr("aus-karte", M, y - 10 - ch, W - 2 * M, ch, "weiss", 18, sichtbar_wenn={"nicht": G}))
    e.append({"id": "aus-liste", "typ": "ausstattung", "x": M + 18, "y": y - 10 - ch + 14, "b": W - 2 * M - 36,
              "h": ch - 28, "darstellung": "checkliste", "spalten": 3, "spaltenabstand": 16, "zeilenhoehe": 26,
              "haken_farbe": "a", "haken_innen": "weiss", "haken_groesse": 9, "haken_versatz": 1, "polster": 0,
              "einzug": 18, "text_versatz": -0.5, "stil_punkt": "aus_punkt", "sichtbar_wenn": {"nicht": G}})
    by = M + 4
    bh = y - 10 - ch - 14 - by
    bw = (W - 2 * M - gap) / 2
    e += [
        bild("aus-bild-1", M, by, bw, bh, {"art": "foto", "nr": 4}, "{{bild.foto.4.titel}}"),
        bild("aus-bild-2", M + bw + gap, by, bw, bh, {"art": "foto", "nr": 5}, "{{bild.foto.5.titel}}"),
    ]
    e += rahmen("03")
    return seite("ausstattung", "ausstattung", "Ausstattung", e)


def bilder():
    top, bot, g = H - M, M + 6, 10
    h = top - bot
    c1, c3 = 250, 220
    c2 = W - 2 * M - c1 - c3 - 2 * g
    e = [
        rr("band", M, top - 40, 170, 40, "d", 14),
        text("band-titel", M + 16, top - 26, 150, 0, "band_titel", "Impressionen"),
        bild("imp-1", M, bot, c1, h - 50, {"art": "foto", "nr": 6}, "{{bild.foto.6.titel}}"),
        bild("imp-2", M + c1 + g, bot + (h - g) * 0.45 + g, c2, (h - g) * 0.55, {"art": "foto", "nr": 7}, "{{bild.foto.7.titel}}"),
        bild("imp-3", M + c1 + g, bot, c2, (h - g) * 0.45, {"art": "foto", "nr": 8}, "{{bild.foto.8.titel}}"),
        bild("imp-4", M + c1 + c2 + 2 * g, bot, c3, h, {"art": "foto", "nr": 9}, "{{bild.foto.9.titel}}"),
    ]
    e += rahmen("04")
    return seite("bilder", "bildseite", "Impressionen", e, sichtbar_wenn={"vorhanden": "bild.foto.6"})


def bilder_mehr():
    e = [
        rr("band", M, H - M - 40, 170, 40, "d", 14),
        text("band-titel", M + 16, H - M - 26, 150, 0, "band_titel", "Impressionen"),
        {"id": "galerie", "typ": "galerie", "x": M, "y": M + 6, "b": W - 2 * M, "h": H - M - 40 - 10 - (M + 6),
         "layout": "2x2", "anpassen": True, "max_bilder": 4, "abstand": 10, "ab_nr": 11, "eckradius": R,
         "platzhalter_farbe": "ph", "stil_label": "bild_label", "label_hintergrund": "weiss", "label_deckkraft": 0.85,
         "label_x": 10, "label_y": 10, "label_hoehe": 15, "label_radius": 7.5, "label_luft": 14,
         "label_polster": 7, "label_grundlinie": 4.8},
    ]
    e += rahmen("04")
    return seite("bilder-mehr", "bildseite", "Impressionen", e,
                 wiederholen={"feld": "objekt.fotoliste", "pro_seite": 4, "ab": 11})


def grundriss(nr, ebene, plan_nr, id_, sichtbar):
    lw = 236
    y = H - M - 18 - 50
    label = "Erdgeschoss" if ebene == "eg" else "Obergeschoss"
    e = ueberschrift(M, H - M - 18, nr, "Grundriss", "Raumaufteilung")
    e.append(text("gr-ebene", M, y - 14, lw, 0, "gr_ebene", label))
    e.append({"id": "raumliste", "typ": "raumliste", "x": M, "y": M + 40, "b": lw, "h": y - 46 - (M + 40),
              "ebene": ebene, "darstellung": "pillen", "zeilen_flaeche": "weiss", "zeilenhoehe": 29,
              "pille_hoehe": 24, "pille_versatz": 9.5, "polster": 12, "mit_summe": True, "summe_flaeche": "a",
              "summe_hoehe": 28, "summe_radius": 14, "summe_versatz": 12, "summe_polster": 12,
              "summe_grundlinie": 10, "summe_label": "Summe " + label, "stil_name": "raum_name",
              "stil_flaeche": "raum_flaeche", "stil_summe": "raum_summe", "stil_summe_wert": "raum_summe_wert",
              "sichtbar_wenn": {"vorhanden": "objekt.raumaufteilung"}})
    e.append(text("gr-hinweis", M, M + 14, lw, 0, "kleingedruckt",
                  "Grundriss nicht maßstabsgetreu. Flächen ca.-Angaben nach WoFlV."))
    px, py = M + lw + 22, 44
    pw, ph = W - M - px, H - M - py
    e += [
        rr("plan-karte", px, py, pw, ph, "weiss", 20),
        {"id": "plan", "typ": "bild", "x": px + 40, "y": py + 40, "b": pw - 80, "h": ph - 80,
         "slot": {"art": "grundriss", "nr": plan_nr}, "fuellmodus": "contain", "platzhalter_farbe": "weiss"},
    ]
    e += rahmen(nr)
    return seite(id_, "grundriss", "Grundriss " + label, e, sichtbar_wenn=sichtbar)


def grundriss_mehr():
    lw = 236
    y = H - M - 18 - 50
    e = ueberschrift(M, H - M - 18, "06", "Grundriss", "Weitere Ebene")
    e.append(text("gr-hinweis", M, M + 14, lw, 0, "kleingedruckt",
                  "Grundriss nicht maßstabsgetreu. Flächen ca.-Angaben nach WoFlV."))
    px, py = M + lw + 22, 44
    pw, ph = W - M - px, H - M - py
    e += [
        rr("plan-karte", px, py, pw, ph, "weiss", 20),
        {"id": "plan", "typ": "bild", "x": px + 40, "y": py + 40, "b": pw - 80, "h": ph - 80,
         "slot": {"art": "grundriss", "nr": 3}, "fuellmodus": "contain", "platzhalter_farbe": "weiss",
         "label_vom_slot": True, "stil_label": "bild_label", "label_hintergrund": "softD", "label_deckkraft": 1,
         "label_x": 0, "label_y": -26, "label_hoehe": 17, "label_radius": 8.5, "label_luft": 18,
         "label_polster": 9, "label_grundlinie": 5.5},
    ]
    e += rahmen("06")
    return seite("grundriss-mehr", "grundriss", "Grundriss", e,
                 wiederholen={"feld": "objekt.grundrissliste", "pro_seite": 1, "ab": 3})


def lage():
    mw, mx, my, mh = 420, M, 44, H - 44 - M
    rx = mx + mw + 26
    rw = W - M - rx
    y = H - M - 18 - 50
    e = [{"id": "karte", "typ": "karte", "x": mx, "y": my, "b": mw, "h": mh, "eckradius": R,
          "platzhalter_farbe": "softD", "quellenhinweis": "© OpenStreetMap-Mitwirkende",
          "stil_quelle": "karte_quelle", "quelle_x": 10, "quelle_y": 8}]
    e += ueberschrift(rx, H - M - 18, "07", "Die Lage", "{{objekt.plz_ort}}", rw)
    e.append(absatz("lage-text", rx, y - 6 - 112, rw, 112, "lage_text", "{{objekt.beschreibung_lage}}"))
    D = {"vorhanden": "objekt.lage_distanzen"}
    e.append(text("dist-label", rx, y - 6 - 112 - 18, rw, 0, "label", "Zu Fuß ab Haustür (ca.)", sichtbar_wenn=D))
    e.append({"id": "distanzen", "typ": "distanzen", "x": rx, "y": 44, "b": rw, "h": y - 6 - 112 - 18 - 14 - 44,
              "darstellung": "minuten", "spalten": 2, "spaltenabstand": 12, "zeilenhoehe": 36, "karten_hoehe": 30,
              "karten_farbe": "weiss", "eckradius": 15, "kreis_farbe": "a", "kreis_radius": 11, "kreis_x": 15,
              "text_x": 33, "name_hoch": 1.5, "wert_tief": 8.5, "stil_name": "dist_name", "stil_wert": "dist_wert",
              "stil_minuten": "dist_minuten", "sichtbar_wenn": D})
    e += rahmen("07")
    return seite("lage", "lage", "Lage", e)


def energie():
    y = H - M - 18 - 50
    kw, ky = 470, M + 4
    kh = y - 10 - ky
    e = ueberschrift(M, H - M - 18, "08", "Energie", "Angaben nach GEG")
    e += [
        rr("tacho-karte", M, ky, kw, kh, "weiss", 20),
        {"id": "tacho", "typ": "energieskala", "x": M, "y": ky, "b": kw, "h": kh, "darstellung": "tacho",
         "mitte_hoehe": 96, "radius": 178, "ring_breite": 30, "luecke_grad": 1.6, "nadel_farbe": "ink",
         "nadel_breite": 3, "nadel_abstand": 24, "nabe_radius": 8, "wert_tief": 34, "einheit_tief": 50,
         "einheit": "kWh/(m²·a)", "klassen": KLASSEN, "stil_klasse": "tacho_klasse", "stil_wert": "tacho_wert",
         "stil_einheit": "tacho_einheit", "stil_grenze": "tacho_einheit", "stil_fahne": "tacho_wert"},
    ]
    rx = M + kw + 22
    rw = W - M - rx
    K = {"vorhanden": "objekt.energie_klasse"}
    e += [
        rr("klasse-karte", rx, y - 10 - 110, rw, 110, "a", 20, sichtbar_wenn=K),
        text("klasse-label", rx + 20, y - 34, 200, 0, "label_onA", "Effizienzklasse", sichtbar_wenn=K),
        text("klasse", rx + 20, y - 100, 120, 0, "en_klasse", "{{objekt.energie_klasse}}", sichtbar_wenn=K),
        text("klasse-urteil", rx + 140, y - 66, rw - 160, 0, "en_urteil", "{{objekt.energie_klasse_urteil}}"),
        text("klasse-hinweis", rx + 140, y - 82, rw - 160, 0, "en_hinweis", "{{objekt.energie_klasse_hinweis}}"),
    ]
    rows = 5
    e.append({"id": "energie-fakten", "typ": "faktentabelle", "x": rx, "y": y - 10 - 110 - 16 - rows * 31 + 5,
              "b": rw, "h": rows * 31, "darstellung": "pillen", "zeilenhoehe": 31, "zeilenabstand": 5,
              "zebra_farbe": "weiss", "polster": 14, "stil_label": "fakt_label", "stil_wert": "fakt_wert",
              "zeilen": [
                  {"label": "Ausweisart", "feld": "objekt.energieausweis_typ"},
                  {"label": "Energieträger", "feld": "objekt.energie_traeger"},
                  {"label": "Baujahr Gebäude", "feld": "objekt.baujahr"},
                  {"label": "Baujahr Wärmeerzeuger", "feld": "objekt.energie_baujahr_anlage"},
                  {"label": "Gültig bis", "feld": "objekt.energie_gueltig_kurz"},
              ]})
    e.append(text("energie-hinweis", rx, ky + 22, rw, 0, "kleingedruckt",
                  "Der vollständige Energieausweis liegt zur Besichtigung vor."))
    e += rahmen("08")
    return seite("energie", "energie", "Energie", e,
                 sichtbar_wenn={"oder": [{"vorhanden": "objekt.energie_kennwert"}, {"vorhanden": "objekt.energie_klasse"}]})


def kosten():
    y = H - M - 18 - 50
    kw, ky = 460, M + 4
    kh = y - 10 - ky
    e = ueberschrift(M, H - M - 18, "09", "Kosten & Finanzierung", "Transparent gerechnet", 460)
    e += [
        rr("kosten-karte", M, ky, kw, kh, "weiss", 20),
        {"id": "kostenrechnung", "typ": "kostenrechnung", "x": M + 22, "y": ky, "b": kw - 44, "h": kh,
         "darstellung": "donut", "donut_radius": 88, "donut_breite": 26, "donut_x": 98, "legende_x": 204,
         "legende_hoch": 62, "zeilenhoehe": 32, "einzug": 16, "punkt_radius": 5, "linien_farbe": "line",
         "linienbreite": 0.6, "linien_versatz": 12, "mit_summe": True, "summe_versatz": 6,
         "summe_label": "Gesamtaufwand", "mitte_label": "Gesamt", "mitte_label_hoch": 8, "mitte_wert_tief": 12,
         "farben": ["d", "a", "aSoft", "dSoft"], "stil_name": "kosten_name", "stil_wert": "kosten_wert",
         "stil_summe": "kosten_summe", "stil_summe_wert": "kosten_summe_wert", "stil_mitte_label": "donut_label",
         "stil_mitte_wert": "donut_wert",
         "posten": [
             {"label": "Kaufpreis", "feld": "rechnung.kaufpreis"},
             {"label": "Grunderwerbsteuer {{rechnung.grunderwerbsteuer_satz}}", "feld": "rechnung.grunderwerbsteuer"},
             {"label": "Notar & Grundbuch ca. {{rechnung.notar_satz}}", "feld": "rechnung.notar"},
             {"label": "Käuferprovision {{rechnung.courtage_satz}}", "feld": "rechnung.courtage"},
         ]},
    ]
    rx = M + kw + 22
    rw = W - M - rx
    e += [
        rr("fin-karte", rx, ky, rw, kh, "d", 20),
        text("rate-label", rx + 22, ky + kh - 30, 200, 0, "label_hell", "Ihre Rate ca."),
        text("rate", rx + 22, ky + kh - 78, rw - 44, 0, "rate_wert", "{{rechnung.monatsrate}}"),
        text("rate-unter", rx + 22, ky + kh - 96, rw - 44, 0, "rate_unter", "pro Monat, Zins und Tilgung"),
        {"id": "fin-angaben", "typ": "faktentabelle", "x": rx + 16, "y": ky + kh - 130 - 4 * 31 + 5, "b": rw - 32,
         "h": 4 * 31, "darstellung": "pillen", "zeilenhoehe": 31, "zeilenabstand": 5, "zebra_farbe": "dsoft",
         "polster": 14, "stil_label": "fin_label", "stil_wert": "fin_wert",
         "zeilen": [
             {"label": "Eigenkapital {{rechnung.eigenkapital_prozent}}", "feld": "rechnung.eigenkapital"},
             {"label": "Darlehen", "feld": "rechnung.darlehen"},
             {"label": "Sollzins (Annahme)", "feld": "rechnung.zinssatz", "einheit": "p. a."},
             {"label": "Tilgung", "feld": "rechnung.tilgung", "einheit": "p. a."},
         ]},
        absatz("fin-hinweis", rx + 22, ky + 20, rw - 44, 22, "fuss_hell",
               "Beispielrechnung ohne Gewähr. Gern vermitteln wir einen unabhängigen Finanzierungsberater.",
               blocksatz=False, verdichten=False),
    ]
    e += rahmen("09")
    return seite("kosten", "kosten", "Kosten & Finanzierung", e,
                 sichtbar_wenn={"und": [{"feld": "objekt.vermarktung", "gleich": "kauf"},
                                        {"vorhanden": "rechnung.kaufpreis"}]})


def kontakt():
    kx, ky, kw, kh = M, 196, 400, 150
    e = [
        rr("grund", 0, 0, W, H, "d", 0),
        kreis("kreis-akzent", W - 120, H - 60, 210, "a", deckkraft=0.9, ueberstand=True),
        bild("stimmung", W - M - 250, H - M - 250, 250, 250, {"art": "foto", "nr": 10}, None, r=125,
             sichtbar_wenn={"vorhanden": "bild.foto.10"}),
        rr("kapitel-nr-flaeche", M, H - M - 18, 30, 17, "a", 8.5),
        text("kapitel-nr", M, H - M - 18 + 8.5 - 7.5 * 0.34, 30, 0, "kapitel_nr", "10", ausrichtung="mitte"),
        text("titel-1", M, H - M - 66, 420, 0, "kapitel_titel_hell", "Lust auf eine"),
        text("titel-2", M, H - M - 106, 420, 0, "kapitel_titel_akzent", "Besichtigung?"),
        rr("ap-karte", kx, ky, kw, kh, "weiss", 22),
        {"id": "ap", "typ": "kontaktkarte", "x": kx + 20, "y": ky, "b": kw - 40, "h": kh, "foto_radius": 42,
         "foto_x": 42, "foto_y": kh / 2, "foto_platzhalter": "softD", "text_x": 104, "name_versatz": 52,
         "funktion_abstand": 14, "kontakt_abstand": 38, "kontakt_zeilenhoehe": 14, "kontakt_spalte": 34,
         "stil_name": "ap_name", "stil_funktion": "ap_funktion", "stil_kontakt_label": "ap_k_label",
         "stil_kontakt_wert": "ap_k_wert",
         "kontakte": [{"label": "Tel.", "feld": "ansprechpartner.telefon"},
                      {"label": "Mobil", "feld": "ansprechpartner.mobil"},
                      {"label": "Mail", "feld": "ansprechpartner.email"}]},
        text("ap-label", kx + 124, ky + kh - 30, 200, 0, "ap_label", "Ihr Ansprechpartner"),
        rr("qr-karte", kx + kw + 14, ky, 150, kh, "weiss", 22),
        {"id": "qr", "typ": "qr", "x": kx + kw + 14 + 25, "y": ky + 30, "b": 100, "h": 100,
         "inhalt": "{{objekt.expose_qr_url}}", "farbe": "d"},
        text("qr-label", kx + kw + 14, ky + 16, 150, 0, "qr_label", "Web-Exposé öffnen"),
        {"id": "ablauf", "typ": "highlights", "x": M, "y": 150, "b": W - 2 * M, "h": 24, "darstellung": "pills",
         "nummern": True, "pill_hoehe": 24, "pill_polster": 12, "pill_abstand": 8, "hintergrund": "dsoft2",
         "stil_titel": "ablauf",
         "eintraege": ["Unterlagen anfordern", "Besichtigen", "Finanzierung klären", "Notartermin"]},
        {"id": "logo", "typ": "bild", "x": M, "y": 68, "b": 150, "h": 20, "slot": {"art": "logo", "ton": "dunkel"},
         "fuellmodus": "contain", "ausrichtung": "links", "sichtbar_wenn": {"vorhanden": "firma.logo.dunkel"}},
        text("marke", M, 72, 300, 0, "marke_hell", "{{firma.marken_name}}",
             sichtbar_wenn={"nicht": {"vorhanden": "firma.logo.dunkel"}}),
        text("firma", M, 58, 520, 0, "impressum",
             "{{firma.name}} · {{firma.adresse}} · Tel. {{firma.telefon?}} · {{firma.web?}}"),
        text("hrb", M, 48, 520, 0, "impressum", "{{firma.impressum_zeile}}"),
        absatz("hinweis", M, 14, W - 2 * M - 280, 22, "recht",
               "Alle Angaben beruhen auf Informationen des Eigentümers und erfolgen ohne Gewähr. Irrtum und "
               "Zwischenverkauf vorbehalten. Mit KI bearbeitete Bilder sind gekennzeichnet. "
               "Käuferprovision: {{objekt.provision_aussen}}, fällig mit notariellem Kaufvertrag.",
               blocksatz=False, verdichten=False),
    ]
    return seite("kontakt", "kontakt", "Kontakt", e, ohne_fuss=True)


VORLAGE = {
    "schema": 1,
    "name": "Bühne",
    "beschreibung": "A4 quer, bildgetrieben, weiche Formen. Bricolage Grotesque und DM Sans.",
    "basis": "buehne",
    "format": {"breite": W, "hoehe": H, "ausrichtung": "quer"},
    "stil": {
        "farben": {"f1": "ci.primaer", "f2": "ci.akzent", "ableitung": "buehne"},
        "schriften": {"headline": HEAD, "text": TXT, "label": TXT_B},
        "raster": {"spalten": 12, "rand": M, "abstand": 10},
        "textstile": TEXTSTILE,
    },
    "seiten": [
        cover(), blick(), objekt(), ausstattung(), bilder(), bilder_mehr(),
        grundriss("05", "eg", 1, "grundriss-eg",
                  {"oder": [{"vorhanden": "bild.grundriss.1"}, {"vorhanden": "objekt.raumaufteilung"}]}),
        grundriss("06", "og", 2, "grundriss-og", {"vorhanden": "bild.grundriss.2"}),
        grundriss_mehr(), lage(), energie(), kosten(), kontakt(),
    ],
}


def main():
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump(VORLAGE, f, ensure_ascii=False, indent=2)
        f.write("\n")
    n = sum(len(s["elemente"]) for s in VORLAGE["seiten"])
    print(f"[ok] {ZIEL}: {len(VORLAGE['seiten'])} Seiten, {n} Elemente.")


if __name__ == "__main__":
    main()
