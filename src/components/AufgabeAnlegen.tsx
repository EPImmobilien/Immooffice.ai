"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { PRIORITAETEN, TERMINARTEN } from "@/lib/arbeitsmittel";
import { aufgabeAnlegen, terminAnlegen } from "@/server/arbeitsmittel-aktionen";

/**
 * Formular fuer eine neue Aufgabe oder einen neuen Termin.
 *
 * Aufklappbar statt auf einer eigenen Seite: Eine Aufgabe entsteht im
 * Vorbeigehen, meist waehrend man ein Objekt ansieht. Ein Seitenwechsel mit
 * anschliessendem Zurueck waere fuer drei Felder unangemessen.
 */
export function AufgabeAnlegen({
  objektId,
  kontaktId,
  /** „termin" bietet zusaetzlich Zeitpunkt, Dauer und Ort. */
  art = "aufgabe",
}: {
  objektId?: string;
  kontaktId?: string;
  art?: "aufgabe" | "termin";
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();
  const formular = useRef<HTMLFormElement>(null);

  const istTermin = art === "termin";

  function absenden(daten: FormData) {
    setFehler(null);
    starten(async () => {
      const ergebnis = istTermin
        ? await terminAnlegen(daten)
        : await aufgabeAnlegen(daten);
      if (ergebnis.fehler) {
        setFehler(ergebnis.fehler);
        return;
      }
      formular.current?.reset();
      setOffen(false);
    });
  }

  if (!offen) {
    return (
      <Button
        type="button"
        variante="sekundaer"
        groesse="klein"
        onClick={() => setOffen(true)}
      >
        {istTermin ? "Termin anlegen" : "Aufgabe anlegen"}
      </Button>
    );
  }

  return (
    <form
      ref={formular}
      action={absenden}
      className="space-y-3 rounded-[var(--radius)] border border-linie bg-flaeche p-3"
    >
      {objektId && <input type="hidden" name="objekt_id" value={objektId} />}
      {kontaktId && <input type="hidden" name="kontakt_id" value={kontaktId} />}

      <Feld beschriftung={istTermin ? "Anlass" : "Aufgabe"} id="am-titel">
        <Eingabe
          name="titel"
          required
          maxLength={300}
          placeholder={
            istTermin ? "Besichtigung Familie Sommer" : "Energieausweis anfordern"
          }
        />
      </Feld>

      {istTermin ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld beschriftung="Beginn" id="am-beginn">
              <Eingabe type="datetime-local" name="beginnt_am" required />
            </Feld>
            <Feld beschriftung="Dauer" id="am-dauer">
              <Auswahl name="dauer_minuten" defaultValue="60">
                <option value="30">30 Minuten</option>
                <option value="45">45 Minuten</option>
                <option value="60">1 Stunde</option>
                <option value="90">1,5 Stunden</option>
                <option value="120">2 Stunden</option>
              </Auswahl>
            </Feld>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Feld beschriftung="Art" id="am-art">
              <Auswahl name="art" defaultValue="besichtigung">
                {Object.entries(TERMINARTEN).map(([wert, name]) => (
                  <option key={wert} value={wert}>
                    {name}
                  </option>
                ))}
              </Auswahl>
            </Feld>
            <Feld beschriftung="Ort" id="am-ort" hinweis="Optional">
              <Eingabe name="ort" maxLength={300} placeholder="Vor Ort" />
            </Feld>
          </div>

          <Feld beschriftung="Notiz" id="am-notiz" hinweis="Optional">
            <Textfeld name="notiz" rows={2} />
          </Feld>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld beschriftung="Fällig am" id="am-faellig" hinweis="Optional">
              <Eingabe type="date" name="faellig_am" />
            </Feld>
            <Feld beschriftung="Priorität" id="am-prio">
              <Auswahl name="prioritaet" defaultValue="mittel">
                {Object.entries(PRIORITAETEN).map(([wert, name]) => (
                  <option key={wert} value={wert}>
                    {name}
                  </option>
                ))}
              </Auswahl>
            </Feld>
          </div>

          <Feld beschriftung="Notiz" id="am-beschreibung" hinweis="Optional">
            <Textfeld name="beschreibung" rows={2} />
          </Feld>
        </>
      )}

      {fehler && (
        <Hinweis ton="fehler" className="text-[13px]">
          {fehler}
        </Hinweis>
      )}

      <div className="flex gap-2">
        <Button type="submit" groesse="klein" disabled={laeuft}>
          {laeuft ? "Speichert …" : "Speichern"}
        </Button>
        <Button
          type="button"
          variante="leise"
          groesse="klein"
          onClick={() => setOffen(false)}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
