"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { cn } from "@/lib/cn";
import { zeitpunkt } from "@/lib/format";
import {
  AKTIVITAETSTYPEN,
  HANDEINTRAG,
  verlaufsgruppe,
  type Aktivitaetstyp,
  type Verlaufseintrag,
} from "@/lib/verlauf";
import { verlaufEintragen } from "@/server/verlauf-aktionen";

/**
 * Verlauf zu einem Objekt oder Kontakt.
 *
 * Zur Auswahl stehen nur die Typen aus `HANDEINTRAG`. „Status geändert" oder
 * „Unterlage hinzugefügt" entstehen ausschliesslich aus dem System — sie hier
 * anzubieten hiesse, das Faelschen des Verlaufs zu erlauben, und ein
 * handgeschriebener Eintrag waere von einem echten nicht zu unterscheiden.
 *
 * Es gibt bewusst keine Schaltflaeche zum Aendern oder Loeschen. Das ist keine
 * fehlende Funktion: Die Datenbank hat dafuer keine Berechtigung, weil ein
 * Verlauf, den man glaetten kann, als Nachweis wertlos ist.
 */

const PUNKTFARBE: Record<ReturnType<typeof verlaufsgruppe>, string> = {
  system: "bg-linie-stark",
  veroeffentlichung: "bg-akzent",
  kontakt: "bg-info",
  notiz: "bg-gedaempft",
};

export function Verlauf({
  eintraege,
  objektId,
  kontaktId,
  darfSchreiben,
}: {
  eintraege: Verlaufseintrag[];
  objektId?: string;
  kontaktId?: string;
  darfSchreiben: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  function absenden(formular: FormData) {
    setFehler(null);
    starten(async () => {
      const ergebnis = await verlaufEintragen(formular);
      if (ergebnis.fehler) {
        setFehler(ergebnis.fehler);
        return;
      }
      setOffen(false);
    });
  }

  return (
    <div className="space-y-4">
      {darfSchreiben && !offen && (
        <Button
          type="button"
          variante="sekundaer"
          groesse="klein"
          onClick={() => setOffen(true)}
        >
          Eintrag hinzufügen
        </Button>
      )}

      {offen && (
        <form action={absenden} className="space-y-3 rounded-[var(--radius)] border border-linie bg-flaeche p-3">
          {objektId && <input type="hidden" name="objekt_id" value={objektId} />}
          {kontaktId && <input type="hidden" name="kontakt_id" value={kontaktId} />}

          <Feld beschriftung="Art" id="verlauf-typ">
            <Auswahl name="typ" defaultValue="notiz">
              {HANDEINTRAG.map((typ) => (
                <option key={typ} value={typ}>
                  {AKTIVITAETSTYPEN[typ]}
                </option>
              ))}
            </Auswahl>
          </Feld>

          <Feld beschriftung="Text" id="verlauf-text">
            <Textfeld
              name="beschreibung"
              rows={3}
              required
              placeholder="Was ist passiert?"
            />
          </Feld>

          {fehler && (
            <Hinweis ton="fehler" className="text-[13px]">
              {fehler}
            </Hinweis>
          )}

          <div className="flex gap-2">
            <Button type="submit" groesse="klein" disabled={laeuft}>
              {laeuft ? "Speichert …" : "Eintragen"}
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
      )}

      {eintraege.length === 0 ? (
        <p className="text-[13px] text-gedaempft">Noch kein Verlauf vorhanden.</p>
      ) : (
        <ol className="space-y-0">
          {eintraege.map((eintrag, i) => (
            <li key={eintrag.id} className="relative flex gap-3 pb-4">
              {/* Verbindungslinie zwischen den Punkten, beim letzten weggelassen. */}
              {i < eintraege.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[3.5px] top-3 h-full w-px bg-linie"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  PUNKTFARBE[verlaufsgruppe(eintrag.typ)],
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-text">{eintrag.beschreibung}</p>
                <p className="mt-0.5 text-[12px] text-gedaempft">
                  {AKTIVITAETSTYPEN[eintrag.typ]} · {zeitpunkt(eintrag.erstellt_am)}
                  {eintrag.benutzer?.name && ` · ${eintrag.benutzer.name}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Typen, die die Oberflaeche kennt. Fuer Tests der Vollstaendigkeit. */
export const ANGEBOTENE_TYPEN: readonly Aktivitaetstyp[] = HANDEINTRAG;
