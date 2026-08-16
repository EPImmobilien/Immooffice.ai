# OpenImmo-Feldmapping

**Stand:** 16.08.2026 · Master-Prompt Abschnitt 7 · Phase 0 (Entwurf für Gate A)
Zielformat: **OpenImmo 1.2.7**

> **Verbindlicher Vorbehalt.** Dieser Entwurf beruht auf der gängigen Struktur von
> OpenImmo 1.2.7. Vor dem produktiven Export wird jedes Element gegen die **offizielle
> XSD** des OpenImmo e. V. geprüft und der Export automatisiert schema-validiert
> (Abschnitt 19). Elementnamen, Aufzählungswerte und Pflichtfelder gelten erst nach
> dieser Prüfung als bestätigt. Wo unten „prüfen“ steht, ist die Abbildung fachlich
> klar, die exakte Schreibweise aber noch zu bestätigen.

---

## 1. Warum das Datenmodell dem Format folgt

Abschnitt 7 stellt fest, dass der OpenImmo-Export das wichtigste Wechselkriterium für
deutsche Makler ist. Deshalb entsteht das Objektmodell **entlang der OpenImmo-Feldlogik**
und nicht umgekehrt.

Die Referenz zeigt, was sonst passiert: Ihr Objektmodell ist fachlich reich, verliert
beim Export aber an mehreren Stellen Information — es fehlen Geokoordinaten, ein
strukturierter Ausstattungskatalog und eine saubere Zustandsklassifikation. Die
Ausstattung liegt dort ausschließlich als Freitext vor; OpenImmo verlangt einzelne
Merkmale. Ein verlustfreier Export wäre daraus nicht erzeugbar.

## 2. Dokumentrahmen

```xml
<openimmo>
  <uebertragung art="ONLINE" umfang="VOLL" modus="NEU"
                sendersoftware="ImmoOffice.ai" senderversion="…"
                techn_email="…" timestamp="…"/>
  <anbieter>
    <anbieternr>…</anbieternr>
    <firma>…</firma>
    <openimmo_anid>…</openimmo_anid>
    <immobilie>…</immobilie>
  </anbieter>
</openimmo>
```

| OpenImmo | Quelle | Anmerkung |
|---|---|---|
| `uebertragung/@art` | fest `ONLINE` | |
| `uebertragung/@modus` | abgeleitet | `NEU` bei Erstübertragung, sonst `CHANGE`; `DELETE` beim Zurückziehen — siehe `objekt_veroeffentlichung.status` |
| `uebertragung/@umfang` | fest `VOLL` | Teilübertragungen sind nicht vorgesehen |
| `anbieter/firma` | `mandant_branding.firmenname` | |
| `anbieter/openimmo_anid` | Portalzugang des Mandanten | je Portal, verschlüsselt hinterlegt |

**Mandantenbezug:** Jeder Export enthält ausschließlich Objekte **eines** Mandanten. Die
Anbieterkennung stammt aus dessen Portalzugang. Ein mandantenübergreifender Export ist
technisch ausgeschlossen.

## 3. Objektkategorie

| OpenImmo | Quelle | Abbildung |
|---|---|---|
| `objektkategorie/nutzungsart/@WOHNEN` | `objekte.nutzungsart` | `wohnen`, `gemischt` → `true` |
| `objektkategorie/nutzungsart/@GEWERBE` | `objekte.nutzungsart` | `gewerbe`, `gemischt` → `true` |
| `objektkategorie/nutzungsart/@ANLAGE` | `objekte.nutzungsart` | `anlage` → `true` |
| `objektkategorie/vermarktungsart/@KAUF` | `objekte.vermarktungsart` | `kauf`, `kauf_miete` → `true` |
| `objektkategorie/vermarktungsart/@MIETE_PACHT` | `objekte.vermarktungsart` | `miete`, `kauf_miete` → `true` |
| `objektkategorie/objektart/*` | `objektkategorie` + `objektart` | Tabelle unten |

### Objektarten

`objektkategorie` bestimmt das Element, `objektart` das Typattribut:

| ImmoOffice `objektkategorie` | OpenImmo-Element | Typattribut aus `objektart` |
|---|---|---|
| `wohnung` | `<wohnung wohnungtyp="…"/>` | ETAGE · ERDGESCHOSS · DACHGESCHOSS · MAISONETTE · PENTHOUSE · SOUTERRAIN · LOFT · APARTMENT |
| `haus` | `<haus haustyp="…"/>` | EINFAMILIENHAUS · DOPPELHAUSHAELFTE · REIHENHAUS · REIHENENDHAUS · MEHRFAMILIENHAUS · VILLA · BUNGALOW · BAUERNHAUS |
| `grundstueck` | `<grundstueck grundst_typ="…"/>` | WOHNEN · GEWERBE · LAND_FORSTWIRTSCHAFT |
| `gewerbe` | `<buero_praxen>`, `<einzelhandel>`, `<hallen_lager_prod>`, `<gastgewerbe>` | je nach Feinart |
| `anlage` | `<zinshaus_renditeobjekt zins_typ="…"/>` | |
| `sonstige` | `<sonstige sonstige_typ="…"/>` | z. B. Garage, Stellplatz, Ferienimmobilie |

Die Referenz führte drei widersprüchliche Objektart-Listen nebeneinander. ImmoOffice.ai
hat **eine** Liste, und sie ist genau diese Abbildungstabelle.

## 4. Geografie

| OpenImmo | Quelle |
|---|---|
| `geo/plz`, `geo/ort`, `geo/strasse`, `geo/hausnummer` | gleichnamige Felder |
| `geo/land/@iso_land` | `objekte.land`, ISO-3166-Alpha-3, Vorgabe `DEU` |
| `geo/geokoordinaten/@breitengrad` · `@laengengrad` | `objekte.lat` · `lon` |
| `geo/etage`, `geo/anzahl_etagen`, `geo/wohnungsnr` | `etage`, `etagen_gesamt`, `wohnungsnummer` |
| `geo/regionaler_zusatz` | `objekte.ortsteil` |

Ist `adresse_veroeffentlichen = false`, werden Straße und Hausnummer **nicht** übertragen
und `verwaltung_objekt/objektadresse_freigeben` steht auf `false`. Postleitzahl und Ort
bleiben, sonst ist das Objekt nicht auffindbar.

## 5. Preise

| OpenImmo | Quelle | Bedingung |
|---|---|---|
| `preise/kaufpreis` | `kaufpreis` | Vermarktungsart Kauf |
| `preise/kaltmiete` | `kaltmiete` | Vermarktungsart Miete |
| `preise/warmmiete` | `warmmiete` | Miete |
| `preise/nebenkosten` | `nebenkosten` | |
| `preise/heizkosten` | `heizkosten` | |
| `preise/hausgeld` | `hausgeld` | Eigentumswohnung |
| `preise/kaution` | `kaution` | Miete |
| `preise/mietertrag` | `miete_ist` | Anlageobjekt |
| `preise/provisionspflichtig` | abgeleitet aus `courtage_frei` | invertiert |
| `preise/aussen_courtage` | `provision_kaeufer` | |
| `preise/innen_courtage` | `provision_verkaeufer` | |
| `preise/courtage_hinweis` | `provision_hinweis` | Schreibweise prüfen |

`kaufpreis_auf_anfrage = true` unterdrückt den Betrag; das entsprechende
OpenImmo-Attribut ist zu prüfen. Beträge werden mit Punkt als Dezimaltrenner und ohne
Tausendertrennung ausgegeben.

## 6. Flächen

| OpenImmo | Quelle |
|---|---|
| `flaechen/wohnflaeche` | `wohnflaeche` |
| `flaechen/nutzflaeche` | `nutzflaeche` |
| `flaechen/gesamtflaeche` | `gesamtflaeche` |
| `flaechen/grundstuecksflaeche` | `grundstuecksflaeche` |
| `flaechen/anzahl_zimmer` | `zimmer` |
| `flaechen/anzahl_schlafzimmer` | `schlafzimmer` |
| `flaechen/anzahl_badezimmer` | `badezimmer` |
| `flaechen/anzahl_balkone` | `anzahl_balkone` |
| `flaechen/anzahl_terrassen` | `anzahl_terrassen` |
| `flaechen/anzahl_stellplaetze` | `stellplatz_anzahl` |

## 7. Ausstattung

Speist sich aus `objekt_ausstattung` (`merkmal`, `wert`). Der Katalog ist genau auf die
OpenImmo-Elemente ausgelegt — deshalb ist die Tabelle strukturiert und nicht Freitext:

| OpenImmo | Merkmal | Art |
|---|---|---|
| `ausstattung/bad/@…` | `bad_dusche`, `bad_wanne`, `bad_fenster`, `bad_bidet` | Flag |
| `ausstattung/kueche/@EBK` | `kueche_ebk` | Flag |
| `ausstattung/boden/@…` | `boden_parkett`, `boden_fliesen`, `boden_laminat` … | Flag |
| `ausstattung/heizungsart/@…` | `heizung_zentral`, `heizung_fussboden`, `heizung_ofen` … | Flag |
| `ausstattung/befeuerung/@…` | `befeuerung_gas`, `befeuerung_oel`, `befeuerung_fernwaerme` … | Flag |
| `ausstattung/fahrstuhl/@PERSONEN` | `fahrstuhl` | Flag |
| `ausstattung/stellplatzart/@…` | aus `stellplatz_art` | Flag |
| `ausstattung/moebliert/@moeb` | `moebliert` | Wert |
| `ausstattung/kamin`, `gartennutzung`, `rollstuhlgerecht`, `barrierefrei` | gleichnamig | Flag |

## 8. Zustand und Energieausweis

| OpenImmo | Quelle |
|---|---|
| `zustand_angaben/baujahr` | `baujahr` |
| `zustand_angaben/letztemodernisierung` | `letzte_modernisierung` |
| `zustand_angaben/zustand/@zustand_art` | `zustand` |
| `zustand_angaben/alter/@alter_attr` | abgeleitet aus `baujahr` |
| `zustand_angaben/energiepass/epart` | `energieausweis_typ` → `BEDARF` \| `VERBRAUCH` |
| `zustand_angaben/energiepass/energieverbrauchkennwert` | `energie_kennwert`, wenn Verbrauchsausweis |
| `zustand_angaben/energiepass/endenergiebedarf` | `energie_kennwert`, wenn Bedarfsausweis |
| `zustand_angaben/energiepass/wertklasse` | `energie_klasse` |
| `zustand_angaben/energiepass/primaerenergietraeger` | `energie_traeger` |
| `zustand_angaben/energiepass/baujahr` | `energie_baujahr_anlage` |
| `zustand_angaben/energiepass/gueltig_bis` | `energie_gueltig_bis` |
| `zustand_angaben/energiepass/mitwarmwasser` | `energie_warmwasser_enthalten` |

**Fachlich wichtig:** Der Kennwert gehört je nach Ausweistyp in ein *anderes* Element.
Die Portale lehnen Objekte ab, bei denen Typ und Element nicht zusammenpassen. Ein Test
sichert genau diesen Fall ab (Abschnitt 19). Da die Angaben nach GEG in Anzeigen
pflichtig sind, blockiert eine fehlende Angabe die Veröffentlichung mit einem
verständlichen Hinweis — die Prüfung findet **vor** dem Export statt.

## 9. Freitexte

| OpenImmo | Quelle |
|---|---|
| `freitexte/objekttitel` | `objekte.titel` |
| `freitexte/dreizeiler` | Kurzbeschreibung aus dem Exposé |
| `freitexte/lage` | `beschreibung_lage` |
| `freitexte/ausstatt_beschr` | `beschreibung_ausstattung` |
| `freitexte/objektbeschreibung` | `beschreibung_objekt` |
| `freitexte/sonstige_angaben` | `beschreibung_sonstiges` |

KI-erzeugte Texte werden **nur nach Freigabe** exportiert (Abschnitt 8). Nicht
freigegebene Texte blockieren die Veröffentlichung.

## 10. Anhänge

| OpenImmo | Quelle |
|---|---|
| `anhaenge/anhang/@gruppe` | `objekt_datei.art` → `TITELBILD` · `BILD` · `GRUNDRISS` · `DOKUMENTE` |
| `anhaenge/anhang/anhangtitel` | `objekt_datei.titel` |
| `anhaenge/anhang/format` | aus `mimetype` |
| `anhaenge/anhang/daten/pfad` | Dateiname im Übertragungspaket |

Reihenfolge nach `objekt_datei.reihenfolge`; `ist_titelbild` bestimmt `TITELBILD`.

**KI-Kennzeichnung im Export.** Abschnitt 10 verlangt, dass die Kennzeichnung KI-
bearbeiteter Bilder auch in Exporten erhalten bleibt. OpenImmo kennt dafür kein Feld.
Umsetzung deshalb zweifach: sichtbar als Bildvermerk im exportierten Bild selbst und
zusätzlich im `anhangtitel`. Der Vermerk ist nicht abschaltbar.

## 11. Technische Verwaltung

| OpenImmo | Quelle |
|---|---|
| `verwaltung_techn/objektnr_intern` | `objekte.objektnummer` |
| `verwaltung_techn/objektnr_extern` | `objekte.id` |
| `verwaltung_techn/aktion/@aktionart` | aus `objekt_veroeffentlichung.status` |
| `verwaltung_techn/stand_vom` | `objekte.geaendert_am` |
| `verwaltung_objekt/objektadresse_freigeben` | `adresse_veroeffentlichen` |
| `verwaltung_objekt/verfuegbar_ab` | `verfuegbar_ab` |

## 12. Übertragung

OpenImmo wird als ZIP übertragen: `openimmo.xml` plus alle Anhänge. Übertragungswege je
Portal (FTP, SFTP, HTTP-Schnittstelle) werden in Phase 2 je Portalvertrag festgelegt —
sie unterscheiden sich und setzen einen Vertrag zwischen Mandant und Portal voraus.

Zugangsdaten der Portale gehören dem **Mandanten**, nicht der Plattform. Sie werden
verschlüsselt gespeichert (`supabase_vault`) und sind für andere Mandanten und für
Plattform-Administratoren nicht lesbar.

## 13. Prüfungen

| Prüfung | Zeitpunkt |
|---|---|
| Schema-Validierung gegen die offizielle XSD | Bei jedem Export, automatisiert |
| Pflichtfelder je Objektart vollständig | Vor Veröffentlichung, mit Hinweis in der Oberfläche |
| Energieangaben passend zum Ausweistyp | Vor Veröffentlichung |
| Texte freigegeben | Vor Veröffentlichung |
| Mindestens ein Bild vorhanden | Vor Veröffentlichung |
| Kein mandantenfremdes Objekt im Paket | Test, Abschnitt 19 |

## 14. Phasen

- **Phase 1:** Datenmodell entlang dieser Abbildung, Exportgerüst mit XML-Erzeugung und
  Schema-Validierung, Vollständigkeitsprüfung in der Oberfläche.
  **Stand:** umgesetzt. XML-Erzeugung in `src/lib/openimmo/xml.ts`,
  Vollständigkeitsprüfung in `src/lib/openimmo/pruefung.ts`, Ausgabe über
  `/api/openimmo/<objekt-id>`, Anzeige der Bereitschaft auf der Objektseite.
  Offen bleibt die Prüfung gegen die offizielle XSD (siehe Vorbehalt oben).
- **Phase 2:** produktive Übertragung an ImmoScout24, Immowelt und Kleinanzeigen samt
  Rückmeldungen und Protokoll je Portal.
