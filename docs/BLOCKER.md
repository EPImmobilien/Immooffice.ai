# Blocker

Verlangt von [`docs/AUTONOMIE.md`](AUTONOMIE.md), Abschnitt 0.5: Ein Problem kommt
erst hierher, wenn es **dreimal** nicht behoben werden konnte. Dann geht die
Arbeit mit dem nächsten Paket weiter.

Jeder Eintrag: Datum · Arbeitspaket · Problem · die drei Versuche · was jetzt
nötig ist.

---

## Offen

*Keine Einträge.* Was auf fehlende Zugangsdaten zurückgeht, steht nicht hier,
sondern in [`docs/ZUGAENGE_FEHLEND.md`](ZUGAENGE_FEHLEND.md) — das ist kein
Blocker, sondern eine Wartestellung.

## Erledigt

*Keine Einträge.*

## Akquise-Radar: automatisches Auslesen von Immobilienportalen

**Stand:** offen (rechtlich). **Betrifft:** Paket A2, `/akquise/radar`.

Die Referenz liest Privatinserate aus Portalen. In ImmoOffice.ai bleibt das
Radar eine manuelle Sammlung (Erfassung von Hand oder über die Schnittstelle),
weil das automatisierte Auslesen in der Regel gegen die Nutzungsbedingungen
der Portale verstößt und urheber-, datenbank- und wettbewerbsrechtlich nicht
geklärt ist; die Ansprache von Privatanbietern unterliegt § 7 UWG.

**Nötig zur Auflösung:** anwaltliche Bewertung je Portal oder ein
lizenzierter Datenlieferant mit vertraglicher Erlaubnis. Erst danach wird ein
Import-Connector gebaut.
