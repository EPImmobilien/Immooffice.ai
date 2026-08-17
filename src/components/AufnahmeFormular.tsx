"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import {
  ZUSTANDSFELDER,
  ZUSTANDSNOTEN,
  type Objektaufnahme,
} from "@/lib/aufnahme";
import { DOKUMENTARTEN, type Dokumentart } from "@/lib/dokumente";
import { OBJEKTKATEGORIEN, VERMARKTUNGSARTEN } from "@/lib/objekt-begriffe";
import {
  aufnahmeAnlegen,
  aufnahmeSpeichern,
} from "@/server/aufnahme-aktionen";

/**
 * Formular der Objektaufnahme.
 *
 * Die Reihenfolge folgt dem Termin, nicht der Datenbank: zuerst wo und mit wem,
 * dann die Kerndaten, dann der Rundgang durch das Haus, dann was noch fehlt.
 * Ein Formular in Spaltenreihenfolge der Tabelle waere fuer den Nutzer eine
 * Zumutung — er steht in der Wohnung und arbeitet die Liste von oben ab.
 *
 * Nur die Bezeichnung ist Pflicht. Beim ersten Termin ist vieles noch
 * unbekannt, und ein Formular, das dann nicht speichert, wird nicht benutzt.
 */
export function AufnahmeFormular({
  aufnahme,
  kontakte,
}: {
  /** Fehlt beim Anlegen. */
  aufnahme?: Objektaufnahme;
  kontakte: { id: string; name: string }[];
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [laeuft, starten] = useTransition();

  const bearbeiten = aufnahme !== undefined;
  const offen = new Set(aufnahme?.unterlagen_offen ?? []);

  function absenden(daten: FormData) {
    setFehler(null);
    setGespeichert(false);
    starten(async () => {
      const ergebnis = bearbeiten
        ? await aufnahmeSpeichern(daten)
        : await aufnahmeAnlegen(daten);
      // Beim Anlegen leitet die Aktion weiter; hierher kommt nur ein Fehler.
      if (ergebnis?.fehler) setFehler(ergebnis.fehler);
      else if (bearbeiten) setGespeichert(true);
    });
  }

  return (
    <form action={absenden} className="space-y-6">
      {bearbeiten && (
        <input type="hidden" name="aufnahme_id" value={aufnahme.id} />
      )}

      <section className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
        <h2 className="text-[15px] font-semibold text-text">Termin und Objekt</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Feld beschriftung="Bezeichnung" id="a-bezeichnung">
            <Eingabe
              name="bezeichnung"
              required
              maxLength={200}
              defaultValue={aufnahme?.bezeichnung ?? ""}
              placeholder="ETW Rosenweg 12"
            />
          </Feld>

          <Feld beschriftung="Aufgenommen am" id="a-datum">
            <Eingabe
              type="date"
              name="aufgenommen_am"
              defaultValue={
                aufnahme?.aufgenommen_am ?? new Date().toISOString().slice(0, 10)
              }
            />
          </Feld>
        </div>

        <Feld
          beschriftung="Eigentümer"
          id="a-kontakt"
          hinweis="Optional — beim ersten Termin oft noch nicht erfasst"
        >
          <Auswahl name="kontakt_id" defaultValue={aufnahme?.kontakt_id ?? ""}>
            <option value="">Noch nicht zugeordnet</option>
            {kontakte.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Auswahl>
        </Feld>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-3">
            <Feld beschriftung="Straße" id="a-strasse">
              <Eingabe name="strasse" defaultValue={aufnahme?.strasse ?? ""} />
            </Feld>
          </div>
          <Feld beschriftung="Nummer" id="a-hausnummer">
            <Eingabe name="hausnummer" defaultValue={aufnahme?.hausnummer ?? ""} />
          </Feld>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Feld beschriftung="PLZ" id="a-plz">
            <Eingabe name="plz" defaultValue={aufnahme?.plz ?? ""} />
          </Feld>
          <div className="sm:col-span-3">
            <Feld beschriftung="Ort" id="a-ort">
              <Eingabe name="ort" defaultValue={aufnahme?.ort ?? ""} />
            </Feld>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Feld beschriftung="Kategorie" id="a-kategorie">
            <Auswahl
              name="objektkategorie"
              defaultValue={aufnahme?.objektkategorie ?? ""}
            >
              <option value="">Noch offen</option>
              {Object.entries(OBJEKTKATEGORIEN).map(([wert, name]) => (
                <option key={wert} value={wert}>
                  {name}
                </option>
              ))}
            </Auswahl>
          </Feld>

          <Feld beschriftung="Vermarktung" id="a-vermarktung">
            <Auswahl
              name="vermarktungsart"
              defaultValue={aufnahme?.vermarktungsart ?? ""}
            >
              <option value="">Noch offen</option>
              {Object.entries(VERMARKTUNGSARTEN).map(([wert, name]) => (
                <option key={wert} value={wert}>
                  {name}
                </option>
              ))}
            </Auswahl>
          </Feld>
        </div>
      </section>

      <section className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
        <h2 className="text-[15px] font-semibold text-text">Kerndaten</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Feld beschriftung="Wohnfläche in m²" id="a-wohnflaeche">
            <Eingabe
              type="number"
              step="0.01"
              name="wohnflaeche"
              defaultValue={aufnahme?.wohnflaeche ?? ""}
            />
          </Feld>
          <Feld beschriftung="Grundstück in m²" id="a-grundstueck">
            <Eingabe
              type="number"
              step="0.01"
              name="grundstuecksflaeche"
              defaultValue={aufnahme?.grundstuecksflaeche ?? ""}
            />
          </Feld>
          <Feld beschriftung="Zimmer" id="a-zimmer">
            <Eingabe
              type="number"
              step="0.5"
              name="zimmer"
              defaultValue={aufnahme?.zimmer ?? ""}
            />
          </Feld>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Feld beschriftung="Baujahr" id="a-baujahr">
            <Eingabe
              type="number"
              name="baujahr"
              defaultValue={aufnahme?.baujahr ?? ""}
            />
          </Feld>
          <Feld beschriftung="Etage" id="a-etage">
            <Eingabe
              type="number"
              name="etage"
              defaultValue={aufnahme?.etage ?? ""}
            />
          </Feld>
          <Feld
            beschriftung="Preisvorstellung in €"
            id="a-preis"
            hinweis="Aussage des Eigentümers, keine Bewertung"
          >
            <Eingabe
              type="number"
              step="0.01"
              name="preisvorstellung"
              defaultValue={aufnahme?.preisvorstellung ?? ""}
            />
          </Feld>
        </div>
      </section>

      <section className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
        <div>
          <h2 className="text-[15px] font-semibold text-text">Zustand</h2>
          <p className="mt-1 text-[12.5px] text-gedaempft">
            Vier Stufen statt Schulnoten: Ein Blick auf ein Dach gibt keine
            feinere Beurteilung her. „Unbekannt“ ist kein Mangel, sondern eine
            offene Frage.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {ZUSTANDSFELDER.map(({ feld, bezeichnung }) => (
            <Feld key={feld} beschriftung={bezeichnung} id={`a-${feld}`}>
              <Auswahl name={feld} defaultValue={aufnahme?.[feld] ?? "unbekannt"}>
                {Object.entries(ZUSTANDSNOTEN).map(([wert, name]) => (
                  <option key={wert} value={wert}>
                    {name}
                  </option>
                ))}
              </Auswahl>
            </Feld>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Feld beschriftung="Heizungsart" id="a-heizungsart">
            <Eingabe
              name="heizungsart"
              defaultValue={aufnahme?.heizungsart ?? ""}
              placeholder="Gasbrennwert, Wärmepumpe …"
            />
          </Feld>
          <Feld beschriftung="Baujahr der Heizung" id="a-heizungbaujahr">
            <Eingabe
              type="number"
              name="heizung_baujahr"
              defaultValue={aufnahme?.heizung_baujahr ?? ""}
            />
          </Feld>
        </div>
      </section>

      <section className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
        <div>
          <h2 className="text-[15px] font-semibold text-text">
            Fehlende Unterlagen
          </h2>
          <p className="mt-1 text-[12.5px] text-gedaempft">
            Aus jeder Auswahl entsteht bei der Übernahme eine Aufgabe. So erzeugt
            der Termin die Arbeit, die aus ihm folgt.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(DOKUMENTARTEN) as Dokumentart[]).map((art) => (
            <label
              key={art}
              className="flex items-center gap-2 text-[13px] text-text"
            >
              <input
                type="checkbox"
                name="unterlagen_offen"
                value={art}
                defaultChecked={offen.has(art)}
                className="size-4 rounded border-linie-stark accent-akzent"
              />
              {DOKUMENTARTEN[art]}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
        <h2 className="text-[15px] font-semibold text-text">Notizen</h2>
        <Feld
          beschriftung="Beobachtungen und Absprachen"
          id="a-notizen"
          hinweis="Wandert bei der Übernahme in den internen Vermerk des Objekts"
        >
          <Textfeld name="notizen" rows={5} defaultValue={aufnahme?.notizen ?? ""} />
        </Feld>
      </section>

      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
      {gespeichert && <Hinweis ton="erfolg">Die Aufnahme wurde gespeichert.</Hinweis>}

      <div className="flex gap-2">
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Speichert …" : bearbeiten ? "Änderungen speichern" : "Aufnahme anlegen"}
        </Button>
      </div>
    </form>
  );
}
