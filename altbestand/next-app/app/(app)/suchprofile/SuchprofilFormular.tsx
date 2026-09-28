"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { OBJEKTKATEGORIEN, VERMARKTUNGSARTEN } from "@/lib/objekt-begriffe";
import { suchprofilSpeichern, type SuchprofilErgebnis } from "@/server/suchprofil-aktionen";

export function SuchprofilFormular({
  kontakte,
}: {
  kontakte: { id: string; name: string }[];
}) {
  const [zustand, aktion, laeuft] = useActionState<SuchprofilErgebnis, FormData>(
    suchprofilSpeichern,
    {},
  );

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Speichern nicht möglich">{zustand.fehler}</Hinweis>
      )}

      <Karte>
        <KarteKopf><KarteTitel>Wer sucht?</KarteTitel></KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2">
          <Feld id="kontakt_id" beschriftung="Interessent" pflicht>
            <Auswahl name="kontakt_id" defaultValue="">
              <option value="" disabled>Bitte wählen</option>
              {kontakte.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </Auswahl>
          </Feld>
          <Feld id="bezeichnung" beschriftung="Bezeichnung des Profils"
                hinweis="Hilft, wenn jemand mehrere Suchen laufen hat.">
            <Eingabe name="bezeichnung" placeholder="ETW Kiel bis 400.000 €" />
          </Feld>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Ausschlusskriterien</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="space-y-5">
          <Hinweis ton="info">
            Diese Angaben schließen Objekte aus. Wird ein Ort angegeben, erscheinen
            ausschließlich Objekte von dort — ohne Ortsangabe wird überall gesucht.
          </Hinweis>

          <div className="grid gap-5 sm:grid-cols-2">
            <Feld id="vermarktungsart" beschriftung="Vermarktungsart" pflicht>
              <Auswahl name="vermarktungsart" defaultValue="kauf">
                {Object.entries(VERMARKTUNGSARTEN).map(([w, b]) => (
                  <option key={w} value={w}>{b}</option>
                ))}
              </Auswahl>
            </Feld>
            <Feld id="orte" beschriftung="Orte"
                  hinweis="Mehrere durch Komma trennen. Nachbarorte gern ergänzen.">
              <Eingabe name="orte" placeholder="Kiel, Kronshagen, Molfsee" />
            </Feld>
          </div>

          <fieldset>
            <legend className="mb-2 block text-[13px] font-medium text-text">
              Objektkategorien
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5">
              {Object.entries(OBJEKTKATEGORIEN).map(([w, b]) => (
                <label key={w} className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input type="checkbox" name="objektkategorien" value={w}
                         className="size-4 accent-[var(--f-akzent)]" />
                  {b}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-gedaempft">
              Ohne Auswahl werden alle Kategorien berücksichtigt.
            </p>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Feld id="preis_von" beschriftung="Preis ab (€)">
              <Eingabe name="preis_von" inputMode="decimal" />
            </Feld>
            <Feld id="preis_bis" beschriftung="Preis bis (€)"
                  hinweis="Objekte darüber erscheinen nicht.">
              <Eingabe name="preis_bis" inputMode="decimal" placeholder="400.000" />
            </Feld>
          </div>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Wünsche</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="space-y-5">
          <Hinweis ton="info">
            Diese Angaben schließen nichts aus — sie bestimmen die Reihenfolge der
            Treffer. Ein Objekt, das nur knapp danebenliegt, bleibt sichtbar.
          </Hinweis>
          <div className="grid gap-5 sm:grid-cols-4">
            <Feld id="flaeche_von" beschriftung="Fläche ab (m²)">
              <Eingabe name="flaeche_von" inputMode="decimal" />
            </Feld>
            <Feld id="flaeche_bis" beschriftung="Fläche bis (m²)">
              <Eingabe name="flaeche_bis" inputMode="decimal" />
            </Feld>
            <Feld id="zimmer_von" beschriftung="Zimmer ab">
              <Eingabe name="zimmer_von" inputMode="decimal" />
            </Feld>
            <Feld id="zimmer_bis" beschriftung="Zimmer bis">
              <Eingabe name="zimmer_bis" inputMode="decimal" />
            </Feld>
          </div>
          <Feld id="bemerkung" beschriftung="Bemerkung">
            <Textfeld name="bemerkung" placeholder="Balkon wichtig, Erdgeschoss ausgeschlossen" />
          </Feld>
        </KarteInhalt>
      </Karte>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" laedt={laeuft}>Profil anlegen und suchen</Button>
        <Link href="/suchprofile" className={buttonKlassen({ variante: "sekundaer" })}>
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
