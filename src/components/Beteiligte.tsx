"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { KONTAKTROLLEN, type Kontaktrolle } from "@/lib/kontakt-begriffe";
import {
  beteiligtenEntfernen,
  beteiligtenVerknuepfen,
} from "@/server/beteiligte-aktionen";

/**
 * Beteiligte eines Objekts.
 *
 * Die Auswahlliste enthaelt die Kontakte des Mandanten. Bei sehr vielen
 * Kontakten waere eine Suche besser als eine Liste — solange es eine Auswahl
 * ist, ist sie aber ohne Zusatzabfrage bedienbar, und eine Suche, die erst bei
 * dreitausend Kontakten gebraucht wird, waere heute Aufwand ohne Nutzen.
 */

export interface Beteiligung {
  id: string;
  rolle: Kontaktrolle;
  anteil: number | null;
  kontakt: {
    id: string;
    vorname: string | null;
    nachname: string | null;
    firma: string | null;
    email: string | null;
    telefon: string | null;
  } | null;
}

export interface KontaktWahl {
  id: string;
  name: string;
}

function anzeigename(kontakt: Beteiligung["kontakt"]): string {
  if (!kontakt) return "Unbekannt";
  const person = [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ");
  return person || kontakt.firma || "Ohne Namen";
}

export function Beteiligte({
  objektId,
  beteiligungen,
  kontakte,
  darfAendern,
}: {
  objektId: string;
  beteiligungen: Beteiligung[];
  kontakte: KontaktWahl[];
  darfAendern: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [rolle, setRolle] = useState<Kontaktrolle>("eigentuemer");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setFehler(null);
    starten(async () => {
      const ergebnis = await beteiligtenVerknuepfen(daten);
      if (ergebnis.fehler) {
        setFehler(ergebnis.fehler);
        return;
      }
      setOffen(false);
    });
  }

  // Nach Rolle gruppieren: „Eigentümer" und „Interessent" sind
  // unterschiedliche Fragen, und in einer flachen Liste stehen sie
  // durcheinander.
  const gruppen = new Map<Kontaktrolle, Beteiligung[]>();
  for (const b of beteiligungen) {
    const liste = gruppen.get(b.rolle);
    if (liste) liste.push(b);
    else gruppen.set(b.rolle, [b]);
  }

  return (
    <div className="space-y-4">
      {beteiligungen.length === 0 ? (
        <p className="text-[13px] text-gedaempft">
          Noch keine Beteiligten verknüpft.
        </p>
      ) : (
        <div className="space-y-3">
          {[...gruppen.entries()].map(([r, liste]) => (
            <div key={r}>
              <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-gedaempft">
                {KONTAKTROLLEN[r]}
              </p>
              <ul className="divide-y divide-linie">
                {liste.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {b.kontakt ? (
                          <Link
                            href={`/kontakte/${b.kontakt.id}`}
                            className="text-[14px] text-text underline decoration-linie-stark underline-offset-2 hover:decoration-akzent"
                          >
                            {anzeigename(b.kontakt)}
                          </Link>
                        ) : (
                          <span className="text-[14px] text-gedaempft">
                            {anzeigename(b.kontakt)}
                          </span>
                        )}
                        {b.anteil !== null && (
                          <Marke>
                            {String(b.anteil).replace(".", ",")} %
                          </Marke>
                        )}
                      </div>
                      {(b.kontakt?.telefon || b.kontakt?.email) && (
                        <p className="mt-0.5 text-[12px] text-gedaempft">
                          {[b.kontakt.telefon, b.kontakt.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>

                    {darfAendern && (
                      <form action={beteiligtenEntfernen} className="shrink-0">
                        <input type="hidden" name="verknuepfung_id" value={b.id} />
                        <Button type="submit" variante="leise" groesse="klein">
                          Entfernen
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {darfAendern && !offen && kontakte.length > 0 && (
        <Button
          type="button"
          variante="sekundaer"
          groesse="klein"
          onClick={() => setOffen(true)}
        >
          Beteiligten verknüpfen
        </Button>
      )}

      {darfAendern && kontakte.length === 0 && (
        <p className="text-[12px] text-gedaempft">
          Legen Sie zuerst einen{" "}
          <Link
            href="/kontakte/neu"
            className="underline decoration-linie-stark underline-offset-2 hover:decoration-akzent"
          >
            Kontakt
          </Link>{" "}
          an.
        </p>
      )}

      {offen && (
        <form
          action={absenden}
          className="space-y-3 rounded-[var(--radius)] border border-linie bg-flaeche p-3"
        >
          <input type="hidden" name="objekt_id" value={objektId} />

          <Feld beschriftung="Kontakt" id="bet-kontakt">
            <Auswahl name="kontakt_id" required defaultValue="">
              <option value="" disabled>
                Bitte wählen
              </option>
              {kontakte.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Auswahl>
          </Feld>

          <div className="grid gap-3 sm:grid-cols-2">
            <Feld beschriftung="Rolle" id="bet-rolle">
              <Auswahl
                name="rolle"
                value={rolle}
                onChange={(e) => setRolle(e.target.value as Kontaktrolle)}
              >
                {Object.entries(KONTAKTROLLEN).map(([wert, name]) => (
                  <option key={wert} value={wert}>
                    {name}
                  </option>
                ))}
              </Auswahl>
            </Feld>

            {/* Nur bei Eigentuemern: Ein Anteil bei einem Notar oder
                Dienstleister ergibt keinen Sinn und stiftet Verwirrung. */}
            {rolle === "eigentuemer" && (
              <Feld
                beschriftung="Anteil in Prozent"
                id="bet-anteil"
                hinweis="Optional, z. B. bei Erbengemeinschaft"
              >
                <Eingabe
                  type="number"
                  name="anteil"
                  min={0}
                  max={100}
                  step="0.01"
                />
              </Feld>
            )}
          </div>

          {fehler && (
            <Hinweis ton="fehler" className="text-[13px]">
              {fehler}
            </Hinweis>
          )}

          <div className="flex gap-2">
            <Button type="submit" groesse="klein" disabled={laeuft}>
              {laeuft ? "Speichert …" : "Verknüpfen"}
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
    </div>
  );
}
