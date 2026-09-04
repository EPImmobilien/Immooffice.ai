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

## Rechnungen: GoBD-Konformität als Ganzes

**Stand:** offen (rechtlich/organisatorisch). **Betrifft:** Paket R1, `/rechnungen`.

Die Software erzwingt Unveränderlichkeit, fortlaufende Nummern, Storno als
Gegenrechnung und legt das gestellte PDF ab (E-2026-09-04-47). Vollständige
GoBD-Konformität wird **nicht** behauptet: Sie umfasst auch Aufbewahrung
über zehn Jahre, eine Verfahrensdokumentation des Mandanten, einen
Datenzugriff für die Betriebsprüfung (Z3-Export) und ab 2028 die
Ausstellungspflicht für E-Rechnungen (XRechnung/ZUGFeRD).

**Nötig zur Auflösung:** steuerberaterliche Prüfung des Ablaufs je Mandant;
danach Export für die Betriebsprüfung und E-Rechnungsformat als eigenes
Paket.
