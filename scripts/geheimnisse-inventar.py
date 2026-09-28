#!/usr/bin/env python3
"""Liest aus den Edge Functions, welche Geheimnisse sie brauchen.

`supabase secrets list` sagt, was GESETZT ist. Diese Liste sagt, was GEBRAUCHT
wird — und das ist die Frage, die vor dem ersten Start zaehlt. Jedes
`Deno.env.get("…")` im Quelltext ist ein Eintrag.

Schreibt den Abschnitt zwischen den Marken in docs/SECRETS.md neu. Nicht von
Hand aendern; der naechste Lauf verwirft die Aenderung.

    python3 scripts/geheimnisse-inventar.py          schreibt docs/SECRETS.md
    python3 scripts/geheimnisse-inventar.py --zeigen nur ausgeben
"""
import collections, pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
FUNKTIONEN = WURZEL / 'supabase' / 'functions'
ZIEL = WURZEL / 'docs' / 'SECRETS.md'
AUF = '<!-- INVENTAR-ANFANG -->'
ZU = '<!-- INVENTAR-ENDE -->'

# Die setzt die Plattform selbst in jede Funktion; sie gehoeren nicht auf die
# Liste dessen, was jemand eintragen muss.
VON_SUPABASE = {'SUPABASE_URL', 'SUPABASE_ANON_KEY',
                'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'}

# Wofuer der Wert steht. Was hier fehlt, erscheint ohne Erklaerung — besser
# eine Luecke als eine erfundene Beschreibung.
ZWECK = {
    'ANTHROPIC_API_KEY': 'KI-Texte, Auslese von Unterlagen, Bewertung',
    'RESEND_API_KEY': 'Mailversand ueber Resend',
    'MAIL_SECRET_KEY': 'Schluessel, mit dem die SMTP-Passwoerter der Postfaecher verschluesselt sind',
    'ONOFFICE_TOKEN': 'CRM-Anbindung onOffice — je Mandant (Phase 6)',
    'ONOFFICE_SECRET': 'CRM-Anbindung onOffice, zweiter Teil des Zugangs',
    'PORTAL_URL': 'Adresse, unter der die Anwendung erreichbar ist; steckt in jedem Einladungslink',
    'EXPOSE_FREIGABE_BASIS': 'Adresse der Exposé-Freigabeseite',
    'SMTP_HOST': 'Systemversand ohne Resend',
    'SMTP_PORT': 'wie oben', 'SMTP_USERNAME': 'wie oben', 'SMTP_PASSWORD': 'wie oben',
    'SMTP_FROM_EMAIL': 'Absenderadresse des Systemversands',
    'SMTP_FROM_NAME': 'Absendername des Systemversands',
    'REPLICATE_API_TOKEN': 'Spracherkennung (Whisper) und Bildbearbeitung',
    'CREDENTIALS_OBF_SECRET': 'Schluessel der im Portal hinterlegten Fremdzugaenge',
    'PUSH_HOOK_SECRET': 'schuetzt den Push-Endpunkt gegen fremde Aufrufe',
    'APNS_PRIVATE_KEY': 'Push an die iOS-Huelle', 'APNS_KEY_ID': 'wie oben',
    'APNS_TEAM_ID': 'wie oben', 'APNS_BUNDLE_ID': 'wie oben',
    'APNS_UMGEBUNG': 'wie oben — "sandbox" oder "production"',
    'BUCHHALTUNG_EMAIL': 'Empfaenger weitergeleiteter Rechnungen',
}


def inventar():
    rx = re.compile(r'Deno\.env\.get\(\s*[\'"]([A-Z0-9_]+)[\'"]')
    wo = collections.defaultdict(set)
    for p in sorted(FUNKTIONEN.rglob('*.ts')):
        for m in rx.finditer(p.read_text(encoding='utf-8')):
            wo[m.group(1)].add(p.parent.name)
    return wo


def abschnitt(wo):
    z = ['## Inventar aus dem Quelltext — Stand 28.09.2026', '',
         'Erzeugt von `scripts/geheimnisse-inventar.py` aus jedem',
         '`Deno.env.get("…")` in `supabase/functions/`. Nicht von Hand pflegen.',
         '',
         'Die Liste sagt, was **gebraucht** wird, nicht was gesetzt ist. Fehlt ein',
         'Wert, antwortet die betroffene Funktion mit einem Fehler — sie faellt',
         'nicht stumm aus, aber sie arbeitet auch nicht.', '',
         '| Geheimnis | Funktionen | Wofür |', '|---|---:|---|']
    fremd = {k: v for k, v in wo.items() if k not in VON_SUPABASE}
    for name in sorted(fremd, key=lambda n: (-len(fremd[n]), n)):
        z.append(f'| `{name}` | {len(fremd[name])} | {ZWECK.get(name, "—")} |')
    z += ['',
          f'Dazu {len(wo) - len(fremd)} Werte, die Supabase selbst in jede Funktion '
          'setzt und die niemand eintragen muss: '
          + ', '.join(f'`{n}`' for n in sorted(VON_SUPABASE & set(wo))) + '.',
          '',
          'Eintragen unter *Project Settings → Edge Functions → Secrets* oder mit',
          '`supabase secrets set NAME=wert --project-ref usguiggfciavwzkdfjgt`.']
    return '\n'.join(z)


def main():
    wo = inventar()
    text = abschnitt(wo)
    if '--zeigen' in sys.argv:
        print(text)
        return 0
    alt = ZIEL.read_text(encoding='utf-8')
    neu = f'{AUF}\n{text}\n{ZU}'
    if AUF in alt and ZU in alt:
        a, b = alt.index(AUF), alt.index(ZU) + len(ZU)
        alt = alt[:a] + neu + alt[b:]
    else:
        alt = alt.rstrip('\n') + '\n\n' + neu + '\n'
    ZIEL.write_text(alt, encoding='utf-8')
    fremd = len([k for k in wo if k not in VON_SUPABASE])
    print(f'docs/SECRETS.md: {fremd} einzutragende Geheimnisse aufgenommen.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
