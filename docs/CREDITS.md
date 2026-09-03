# Credits je Aktion

**Maßgeblich ist die Tabelle `credit_preise` in der Datenbank**, nicht diese
Datei und nicht der Code. Die Werte werden über den Plattform-Admin gepflegt
(Masterprompt Abschnitt 14, CLAUDE.md „Credits und Abrechnung“). Diese Datei
dokumentiert die **Startwerte** und die Regeln; Abweichung zwischen Datenbank
und Datei bedeutet: Datenbank gewinnt, Datei nachziehen.

Ein Credit ist eine interne Nutzungseinheit, kein Euro-Guthaben.

## Startwerte

| Aktion (`credit_preise.aktion`) | Bezeichnung | Credits | Herkunft |
|---|---|---:|---|
| `ki_text_einzeln` | Einzelner KI-Text oder Textvariante (Kurztext, Social-Beitrag) | 2 | Kostenmodell |
| `ki_expose_komplett` | Vollständige Exposé-Texterstellung | 10 | Kostenmodell |
| `ki_marketing_paket` | Marketingtext oder Social-Media-Paket | 5 | Kostenmodell |
| `ki_bild_optimierung` | Einfache Bildoptimierung, je Bild | 10 | Kostenmodell |
| `ki_bild_homestaging` | Umfangreiche Bildbearbeitung oder Homestaging, je Bild | 30 | Kostenmodell |
| `ki_grundriss` | Grundrissvisualisierung | 30 | Kostenmodell |
| `ki_wertermittlung_text` | KI-Textbausteine in einer Wertermittlung | 10 | AUTONOMIE S4 |
| `ki_mail_entwurf` | KI-Antwortentwurf zu einer E-Mail | 1 | AUTONOMIE S4 |
| `ki_expose_pruefung` | KI-Prüfung eines Exposés auf Lücken und Widersprüche | 2 | SCOPE C |
| `signatur_versand` | Versendeter Signaturvorgang je Dokumentenpaket | 5 | Kostenmodell |
| `pdf_export` | PDF-Export eines bestehenden Inhalts | **0** | Masterprompt |
| `web_expose` | Web-Exposé-Veröffentlichung ohne neue KI-Erstellung | **0** | Masterprompt |
| `openimmo_export` | OpenImmo-Export | **0** | AUTONOMIE S4 |

Die Zeilen mit Herkunft „AUTONOMIE S4“ und „SCOPE C“ werden mit der Migration
`20260903120000_onboarding_team_audit.sql` in die Tabelle aufgenommen. Die
übrigen Werte stammen aus dem Kostenmodell in
[`PRICING_AND_GUV.md`](../PRICING_AND_GUV.md), Abschnitt 2, und bleiben
unverändert (E-2026-09-03-13).

## Regeln

- **Kostenlos:** PDF-Export bestehender Inhalte, Web-Exposé ohne neue
  KI-Erstellung, manuelle Bearbeitung, erneute Downloads, OpenImmo-Export.
- **Kostenpflichtig:** nur KI-Erstellung und erneute KI-Erzeugung.
- Jede Aktion läuft über `credits_reservieren(aktion, …)` →
  `credits_einloesen` oder `credits_freigeben`. Ein gescheiterter Auftrag gibt
  die Reservierung automatisch frei.
- Kein negativer Saldo. Älteste Chargen zuerst.
- Inklusiv-Credits: Übertrag nur in den unmittelbar folgenden Monat, begrenzt auf
  ein reguläres Monatskontingent. Gekaufte Credits zwölf Monate gültig
  (Masterprompt; die Aussage „verfallen nicht“ in AUTONOMIE S4 ist damit
  überschrieben, weil Ledger-Regeln Architektur sind).
- Testphase: 100 Credits, sieben Tage, ohne Zahlungsmittel.

## Pakete

| Paket | Credits | Preis netto |
|---|---:|---:|
| Klein | 250 | 9,99 € |
| Mittel | 1.000 | 29,99 € |
| Groß | 3.000 | 69,99 € |

Die Pakete aus AUTONOMIE S4 (500 für 19,99 €, 1.000 für 34,99 €) sind **nicht**
übernommen: Die Tabelle `tarife` und das Kostenmodell kennen die drei Pakete
oben, und eine Preisänderung ist eine Freigabe an Gate B, keine Entscheidung
der Entwicklung.
