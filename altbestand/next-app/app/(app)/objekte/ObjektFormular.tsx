"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import {
  Karte,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import {
  ENERGIEAUSWEISTYPEN,
  ENERGIEKLASSEN,
  NUTZUNGSARTEN,
  OBJEKTARTEN,
  OBJEKTKATEGORIEN,
  OBJEKTSTATUS,
  VERMARKTUNGSARTEN,
  istKauf,
  istMiete,
} from "@/lib/objekt-begriffe";
import { objektSpeichern, type ObjektErgebnis } from "@/server/objekt-aktionen";

export interface ObjektWerte {
  id?: string;
  bezeichnung?: string | null;
  titel?: string | null;
  vermarktungsart?: string | null;
  objektkategorie?: string | null;
  objektart?: string | null;
  nutzungsart?: string | null;
  status?: string | null;
  strasse?: string | null;
  hausnummer?: string | null;
  plz?: string | null;
  ort?: string | null;
  wohnflaeche?: number | null;
  nutzflaeche?: number | null;
  grundstuecksflaeche?: number | null;
  zimmer?: number | null;
  baujahr?: number | null;
  kaufpreis?: number | null;
  kaltmiete?: number | null;
  nebenkosten?: number | null;
  hausgeld?: number | null;
  energieausweis_typ?: string | null;
  energie_kennwert?: number | null;
  energie_klasse?: string | null;
  beschreibung_objekt?: string | null;
  beschreibung_ausstattung?: string | null;
  beschreibung_lage?: string | null;
}

/** Zahlen in deutscher Schreibweise vorbelegen. */
function wert(w: number | null | undefined): string {
  if (w === null || w === undefined) return "";
  return String(w).replace(".", ",");
}

export function ObjektFormular({ objekt }: { objekt?: ObjektWerte }) {
  const [zustand, aktion, laeuft] = useActionState<ObjektErgebnis, FormData>(
    objektSpeichern,
    {},
  );

  // Von diesen beiden Feldern haengt ab, welche weiteren Felder sinnvoll sind
  // (Abschnitt 7: dynamische, von Objekt- und Vermarktungsart abhaengige Felder).
  const [kategorie, setKategorie] = useState(
    objekt?.objektkategorie ?? "wohnung",
  );
  const [vermarktung, setVermarktung] = useState(
    objekt?.vermarktungsart ?? "kauf",
  );

  const fehlerZu = (feld: string) => zustand.feldFehler?.[feld];
  const istGrundstueck = kategorie === "grundstueck";
  const istGewerbe = kategorie === "gewerbe";

  return (
    <form action={aktion} className="space-y-5">
      {objekt?.id && <input type="hidden" name="id" value={objekt.id} />}

      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Speichern nicht möglich">
          {zustand.fehler}
        </Hinweis>
      )}

      <Karte>
        <KarteKopf>
          <KarteTitel>Stammdaten</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Feld
              id="bezeichnung"
              beschriftung="Objektbezeichnung"
              pflicht
              hinweis="Interne Bezeichnung, erscheint nicht im Exposé."
              {...(fehlerZu("bezeichnung") ? { fehler: fehlerZu("bezeichnung")! } : {})}
            >
              <Eingabe
                name="bezeichnung"
                defaultValue={objekt?.bezeichnung ?? ""}
                placeholder="z. B. ETW Rosenweg 12"
              />
            </Feld>
          </div>

          <div className="sm:col-span-2">
            <Feld
              id="titel"
              beschriftung="Exposé-Titel"
              hinweis="Öffentlich sichtbar. Kann per KI erzeugt werden."
            >
              <Eingabe
                name="titel"
                defaultValue={objekt?.titel ?? ""}
                placeholder="Lichtdurchflutete 3-Zimmer-Wohnung mit Südbalkon"
              />
            </Feld>
          </div>

          <Feld id="vermarktungsart" beschriftung="Vermarktungsart" pflicht>
            <Auswahl
              name="vermarktungsart"
              value={vermarktung}
              onChange={(e) => setVermarktung(e.target.value)}
            >
              {Object.entries(VERMARKTUNGSARTEN).map(([w, b]) => (
                <option key={w} value={w}>{b}</option>
              ))}
            </Auswahl>
          </Feld>

          <Feld id="objektkategorie" beschriftung="Objektkategorie" pflicht>
            <Auswahl
              name="objektkategorie"
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
            >
              {Object.entries(OBJEKTKATEGORIEN).map(([w, b]) => (
                <option key={w} value={w}>{b}</option>
              ))}
            </Auswahl>
          </Feld>

          <Feld id="objektart" beschriftung="Objektart">
            <Auswahl name="objektart" defaultValue={objekt?.objektart ?? ""}>
              <option value="">Bitte wählen</option>
              {(OBJEKTARTEN[kategorie as keyof typeof OBJEKTARTEN] ?? []).map(
                (art) => (
                  <option key={art} value={art}>{art}</option>
                ),
              )}
            </Auswahl>
          </Feld>

          <Feld id="nutzungsart" beschriftung="Nutzungsart" pflicht>
            <Auswahl name="nutzungsart" defaultValue={objekt?.nutzungsart ?? "wohnen"}>
              {Object.entries(NUTZUNGSARTEN).map(([w, b]) => (
                <option key={w} value={w}>{b}</option>
              ))}
            </Auswahl>
          </Feld>

          <Feld id="status" beschriftung="Vermarktungsstatus" pflicht>
            <Auswahl name="status" defaultValue={objekt?.status ?? "akquise"}>
              {Object.entries(OBJEKTSTATUS).map(([w, b]) => (
                <option key={w} value={w}>{b}</option>
              ))}
            </Auswahl>
          </Feld>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Adresse</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-6">
          <div className="sm:col-span-4">
            <Feld id="strasse" beschriftung="Straße">
              <Eingabe name="strasse" defaultValue={objekt?.strasse ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-2">
            <Feld id="hausnummer" beschriftung="Hausnummer">
              <Eingabe name="hausnummer" defaultValue={objekt?.hausnummer ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-2">
            <Feld
              id="plz"
              beschriftung="Postleitzahl"
              {...(fehlerZu("plz") ? { fehler: fehlerZu("plz")! } : {})}
            >
              <Eingabe name="plz" inputMode="numeric" defaultValue={objekt?.plz ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-4">
            <Feld id="ort" beschriftung="Ort">
              <Eingabe name="ort" defaultValue={objekt?.ort ?? ""} />
            </Feld>
          </div>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Flächen und Räume</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {!istGrundstueck && (
            <Feld id="wohnflaeche" beschriftung="Wohnfläche in m²">
              <Eingabe
                name="wohnflaeche"
                inputMode="decimal"
                defaultValue={wert(objekt?.wohnflaeche)}
              />
            </Feld>
          )}
          {(istGewerbe || istGrundstueck || kategorie === "anlage") && (
            <Feld id="nutzflaeche" beschriftung="Nutzfläche in m²">
              <Eingabe
                name="nutzflaeche"
                inputMode="decimal"
                defaultValue={wert(objekt?.nutzflaeche)}
              />
            </Feld>
          )}
          {kategorie !== "wohnung" && (
            <Feld id="grundstuecksflaeche" beschriftung="Grundstück in m²">
              <Eingabe
                name="grundstuecksflaeche"
                inputMode="decimal"
                defaultValue={wert(objekt?.grundstuecksflaeche)}
              />
            </Feld>
          )}
          {!istGrundstueck && (
            <>
              <Feld id="zimmer" beschriftung="Zimmer">
                <Eingabe
                  name="zimmer"
                  inputMode="decimal"
                  defaultValue={wert(objekt?.zimmer)}
                />
              </Feld>
              <Feld id="baujahr" beschriftung="Baujahr">
                <Eingabe
                  name="baujahr"
                  inputMode="numeric"
                  defaultValue={wert(objekt?.baujahr)}
                />
              </Feld>
            </>
          )}
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Preise</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {istKauf(vermarktung) && (
            <Feld id="kaufpreis" beschriftung="Kaufpreis in €">
              <Eingabe
                name="kaufpreis"
                inputMode="decimal"
                defaultValue={wert(objekt?.kaufpreis)}
              />
            </Feld>
          )}
          {istMiete(vermarktung) && (
            <Feld id="kaltmiete" beschriftung="Kaltmiete in €">
              <Eingabe
                name="kaltmiete"
                inputMode="decimal"
                defaultValue={wert(objekt?.kaltmiete)}
              />
            </Feld>
          )}
          <Feld id="nebenkosten" beschriftung="Nebenkosten in €">
            <Eingabe
              name="nebenkosten"
              inputMode="decimal"
              defaultValue={wert(objekt?.nebenkosten)}
            />
          </Feld>
          {kategorie === "wohnung" && (
            <Feld id="hausgeld" beschriftung="Hausgeld in €">
              <Eingabe
                name="hausgeld"
                inputMode="decimal"
                defaultValue={wert(objekt?.hausgeld)}
              />
            </Feld>
          )}
        </KarteInhalt>
      </Karte>

      {!istGrundstueck && (
        <Karte>
          <KarteKopf>
            <KarteTitel>Energieausweis</KarteTitel>
          </KarteKopf>
          <KarteInhalt className="grid gap-5 sm:grid-cols-3">
            <Feld
              id="energieausweis_typ"
              beschriftung="Art des Ausweises"
              hinweis="Pflichtangabe für die Veröffentlichung."
            >
              <Auswahl
                name="energieausweis_typ"
                defaultValue={objekt?.energieausweis_typ ?? ""}
              >
                <option value="">Bitte wählen</option>
                {Object.entries(ENERGIEAUSWEISTYPEN).map(([w, b]) => (
                  <option key={w} value={w}>{b}</option>
                ))}
              </Auswahl>
            </Feld>
            <Feld id="energie_kennwert" beschriftung="Kennwert in kWh/(m²·a)">
              <Eingabe
                name="energie_kennwert"
                inputMode="decimal"
                defaultValue={wert(objekt?.energie_kennwert)}
              />
            </Feld>
            <Feld id="energie_klasse" beschriftung="Energieeffizienzklasse">
              <Auswahl
                name="energie_klasse"
                defaultValue={objekt?.energie_klasse ?? ""}
              >
                <option value="">Bitte wählen</option>
                {ENERGIEKLASSEN.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Auswahl>
            </Feld>
          </KarteInhalt>
        </Karte>
      )}

      <Karte>
        <KarteKopf>
          <KarteTitel>Beschreibungen</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="space-y-5">
          <Feld id="beschreibung_objekt" beschriftung="Objektbeschreibung">
            <Textfeld
              name="beschreibung_objekt"
              defaultValue={objekt?.beschreibung_objekt ?? ""}
            />
          </Feld>
          <Feld id="beschreibung_ausstattung" beschriftung="Ausstattung">
            <Textfeld
              name="beschreibung_ausstattung"
              defaultValue={objekt?.beschreibung_ausstattung ?? ""}
            />
          </Feld>
          <Feld id="beschreibung_lage" beschriftung="Lage">
            <Textfeld
              name="beschreibung_lage"
              defaultValue={objekt?.beschreibung_lage ?? ""}
            />
          </Feld>
        </KarteInhalt>
      </Karte>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" laedt={laeuft}>
          {objekt?.id ? "Änderungen speichern" : "Objekt anlegen"}
        </Button>
        <Link
          href={objekt?.id ? `/objekte/${objekt.id}` : "/objekte"}
          className={buttonKlassen({ variante: "sekundaer" })}
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
