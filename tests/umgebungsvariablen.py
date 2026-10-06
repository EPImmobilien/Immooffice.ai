#!/usr/bin/env python3
"""Steht jede Umgebungsvariable, die eine Funktion liest, in .env.example?

CLAUDE.md laesst dazu keinen Spielraum: "Keine Geheimnisse im Repository oder
im Client. Nur Umgebungsvariablen, dokumentiert in `.env.example`."

Am 06.10.2026 war das nicht der Fall, und zwar genau dort, wo es am meisten
weh tut: der Mailversand. `.env.example` nannte drei Variablen
(MAIL_API_KEY, MAIL_ABSENDER, MAIL_ABSENDER_NAME), die KEINE Funktion liest —
wer sie setzte, hatte das Gefuehl, den Versand eingerichtet zu haben, und
nichts ging hinaus. Die neun, die der Versand wirklich braucht
(RESEND_API_KEY, MAIL_SECRET_KEY, SMTP_*), standen nirgends.

Darum dieses Tor. Es prueft beide Richtungen:

  * JEDE Variable, die eine Edge Function mit Deno.env.get liest, muss
    dokumentiert sein. Ausgenommen sind die vier, die Supabase der
    Laufzeit selbst mitgibt.
  * Jede dokumentierte Variable muss irgendwo gebraucht werden — von einer
    Funktion, von der Oberflaeche oder vom Altbestand. Was fuer eine
    spaetere Phase vorgesehen ist, steht in GEPLANT und ist damit
    begruendet, nicht bloss uebrig.

Gefunden hat das Tor beim ersten Lauf einen zweiten Fall derselben Art:
VERSCHLUESSELUNG_SCHLUESSEL. Auch dieser Name stand in .env.example und
wurde von nichts gelesen — die beiden echten heissen MAIL_SECRET_KEY und
CREDENTIALS_OBF_SECRET.
"""
import pathlib
import re
import sys

STAMM = pathlib.Path(__file__).resolve().parent.parent
FUNKTIONEN = STAMM / "supabase" / "functions"
BEISPIEL = STAMM / ".env.example"

# Diese vier stellt die Supabase-Laufzeit jeder Funktion von selbst. Eine
# Funktion muss sie also nicht dokumentieren; in .env.example duerfen sie
# trotzdem stehen, denn der Altbestand und die Skripte brauchen sie.
VON_SUPABASE = {
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
}

# Vorgesehen, aber noch nicht gelesen — mit der Phase, in der sie dazukommen.
# Der Eintrag ist die Begruendung: eine dokumentierte Variable, die niemand
# liest, ist sonst ein falsches Versprechen (siehe MAIL_API_KEY).
GEPLANT = {
    "GOOGLE_CLIENT_ID": "Kalender-Synchronisation, Phase 6",
    "GOOGLE_CLIENT_SECRET": "Kalender-Synchronisation, Phase 6",
    "MICROSOFT_CLIENT_ID": "Postfach und Kalender ueber Microsoft 365, Phase 6",
    "MICROSOFT_CLIENT_SECRET": "Postfach und Kalender ueber Microsoft 365, Phase 6",
    "OPENAI_API_KEY": "zweiter KI-Anbieter, Anbieter-Schicht",
    "OPENAI_TEXTMODELL": "zweiter KI-Anbieter, Anbieter-Schicht",
    "OPENAI_BILDMODELL": "zweiter KI-Anbieter, Anbieter-Schicht",
    "OPENAI_DATENREGION": "zweiter KI-Anbieter, Anbieter-Schicht",
    "OPENIMMO_ANBIETERNUMMER": "Portalexport, je Mandant (Phase 6)",
    "STRIPE_SECRET_KEY": "Abrechnung, Phase 5",
    "STRIPE_WEBHOOK_SECRET": "Abrechnung, Phase 5",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": "Abrechnung, Phase 5",
    "NEXT_PUBLIC_APP_URL": "Altbestand (Next.js), kein Produktbestandteil",
    "NEXT_PUBLIC_SUPABASE_URL": "Altbestand (Next.js), kein Produktbestandteil",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "Altbestand (Next.js), kein Produktbestandteil",
}

# Die Oberflaeche bekommt ihre beiden Werte beim Bauen eingesetzt
# (scripts/bauen.py), nicht ueber Deno.env.
VON_DER_OBERFLAECHE = {"IMMO_SUPABASE_URL", "IMMO_SUPABASE_KEY"}

# Dazu alles, was ein Stripe-Preis ist: sie entstehen erst mit den Produkten
# im Stripe-Konto und sind reine Konfiguration.
PREIS_MUSTER = re.compile(r"^STRIPE_PREIS_[A-Z_]+$")


def gelesen() -> dict[str, set[str]]:
    """Variable -> Funktionen, die sie lesen."""
    raus: dict[str, set[str]] = {}
    for datei in sorted(FUNKTIONEN.glob("*/*.ts")):
        text = datei.read_text(encoding="utf-8")
        for name in re.findall(r'Deno\.env\.get\(\s*"([A-Z0-9_]+)"\s*\)', text):
            raus.setdefault(name, set()).add(datei.parent.name)
    return raus


def dokumentiert() -> set[str]:
    text = BEISPIEL.read_text(encoding="utf-8")
    return set(re.findall(r"^([A-Z0-9_]+)=", text, re.M))


def main() -> int:
    if not FUNKTIONEN.is_dir():
        print("supabase/functions fehlt — nichts zu pruefen.")
        return 0
    benutzt = gelesen()
    steht = dokumentiert()
    fehler = 0

    fehlend = sorted(n for n in benutzt if n not in steht and n not in VON_SUPABASE)
    if fehlend:
        fehler = 1
        print("[FEHLER] Diese Variablen liest eine Funktion, aber .env.example")
        print("         nennt sie nicht. Wer das Projekt einrichtet, kann sie")
        print("         nicht kennen:")
        for n in fehlend:
            wer = sorted(benutzt[n])
            print(f"           {n:26s} {', '.join(wer[:3])}"
                  + (f" und {len(wer) - 3} weitere" if len(wer) > 3 else ""))

    verirrt = sorted(
        n for n in steht
        if n not in benutzt and n not in GEPLANT and n not in VON_DER_OBERFLAECHE
        and n not in VON_SUPABASE and not PREIS_MUSTER.match(n)
    )
    if verirrt:
        fehler = 1
        print("[FEHLER] Diese Variablen stehen in .env.example, aber keine")
        print("         Funktion liest sie. Entweder ist der Name falsch — dann")
        print("         richtet ein gesetzter Wert nichts ein und niemand merkt")
        print("         es — oder sie gehoert mit Grund nach GEPLANT in")
        print("         tests/umgebungsvariablen.py:")
        for n in verirrt:
            print(f"           {n}")

    if fehler:
        return 1
    print(f"[ok] {len(benutzt)} Variablen lesen die Funktionen, alle dokumentiert;")
    print(f"     {len(GEPLANT)} weitere sind mit Grund fuer eine spaetere Phase")
    print("     vorgemerkt. Keine erfundenen Namen in .env.example.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
