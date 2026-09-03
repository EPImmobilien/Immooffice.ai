"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { ROLLEN, ROLLEN_BEZEICHNUNG, type Rolle } from "@/lib/auth/rechte";
import { datum } from "@/lib/format";
import { einladungErstellen, einladungZuruecknehmen } from "@/server/einladungs-aktionen";

export interface EinladungZeile {
  id: string;
  email: string;
  rolle: Rolle;
  gueltig_bis: string;
  eingeloest_am: string | null;
  widerrufen_am: string | null;
  erstellt_am: string;
}

/** Spalten und Filter fuer offene Einladungen — an einer Stelle, fuer alle Seiten. */
export const EINLADUNG_SPALTEN = "id, email, rolle, gueltig_bis, eingeloest_am, widerrufen_am, erstellt_am";

/**
 * Einladungen anlegen und zuruecknehmen.
 *
 * Der Link erscheint EINMAL nach dem Anlegen. Das ist kein Komfortmangel,
 * sondern Absicht: Der Klartext-Token liegt nirgends gespeichert. Sobald der
 * Transaktionsmail-Dienst eingerichtet ist, geht der Link zusaetzlich per
 * E-Mail (docs/ZUGAENGE_FEHLEND.md).
 */
export function Einladungen({
  einladungen,
  eigeneRolle,
}: {
  einladungen: EinladungZeile[];
  eigeneRolle: Rolle;
}) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [laeuft, starten] = useTransition();
  // Einmal beim Aufbau, nicht bei jedem Rendern: Die Liste soll nicht in
  // dem Moment umspringen, in dem eine Einladung waehrend des Lesens ablaeuft.
  const [jetzt] = useState(() => Date.now());

  function anlegen(daten: FormData) {
    setMeldung(null);
    setLink(null);
    setKopiert(false);
    starten(async () => {
      const ergebnis = await einladungErstellen(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else {
        if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
        if (ergebnis.link) setLink(ergebnis.link);
      }
    });
  }

  function zuruecknehmen(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await einladungZuruecknehmen(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    });
  }

  async function kopieren() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
    } catch {
      // Ohne Zwischenablage (etwa ohne HTTPS) bleibt das Textfeld zum Markieren.
    }
  }

  // Nur der Inhaber vergibt die Inhaberrolle — die Datenbank weist es ohnehin
  // ab; die Auswahl zeigt es gar nicht erst an.
  const rollen = ROLLEN.filter((r) => r !== "inhaber" || eigeneRolle === "inhaber");

  return (
    <div className="space-y-5">
      <form action={anlegen} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Feld beschriftung="E-Mail-Adresse" id="einladung-email">
          <Eingabe type="email" name="email" required placeholder="kollegin@unternehmen.de" disabled={laeuft} />
        </Feld>
        <Feld beschriftung="Rolle" id="einladung-rolle">
          <Auswahl name="rolle" defaultValue="makler" disabled={laeuft}>
            {rollen.map((rolle) => (
              <option key={rolle} value={rolle}>
                {ROLLEN_BEZEICHNUNG[rolle]}
              </option>
            ))}
          </Auswahl>
        </Feld>
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Legt an …" : "Einladen"}
        </Button>
      </form>

      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      {link && (
        <div className="space-y-2 rounded-[var(--radius)] border border-akzent/40 bg-akzent-schwach p-3">
          <p className="text-[12px] font-medium text-text">Einladungslink — nur jetzt sichtbar</p>
          <div className="flex gap-2">
            <Eingabe readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="zahl text-[12px]" />
            <Button type="button" variante="sekundaer" onClick={kopieren}>
              {kopiert ? "Kopiert" : "Kopieren"}
            </Button>
          </div>
        </div>
      )}

      {einladungen.length > 0 && (
        <ul className="divide-y divide-linie border-t border-linie">
          {einladungen.map((e) => {
            const abgelaufen = new Date(e.gueltig_bis).getTime() < jetzt;
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] text-text">{e.email}</p>
                    <Marke>{ROLLEN_BEZEICHNUNG[e.rolle]}</Marke>
                    {abgelaufen && <Marke ton="fehler">Abgelaufen</Marke>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-gedaempft">
                    {abgelaufen ? "Lief ab am" : "Gültig bis"} {datum(e.gueltig_bis)}
                  </p>
                </div>
                <form action={zuruecknehmen}>
                  <input type="hidden" name="einladung_id" value={e.id} />
                  <Button type="submit" variante="leise" groesse="klein" disabled={laeuft}>
                    Zurücknehmen
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[12px] text-gedaempft">
        Einladungen gelten sieben Tage und nur für die angegebene Adresse. Ein
        Konto gehört genau einem Unternehmen.
      </p>
    </div>
  );
}
