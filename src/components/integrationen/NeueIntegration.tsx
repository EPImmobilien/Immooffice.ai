"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import type { ConnectorBeschreibung } from "@/integrationen/kern/beschreibung";
import { FAEHIGKEIT_BEZEICHNUNG } from "@/integrationen/kern/registry";
import { integrationAnlegen, type IntegrationsErgebnis } from "@/server/integrations-aktionen";

const RICHTUNGEN = [
  { wert: "holen", text: "Nur holen — Daten aus dem System übernehmen" },
  { wert: "senden", text: "Nur senden — eigene Daten ins System übertragen" },
  { wert: "beide", text: "Beide Richtungen — letzte Änderung gewinnt" },
] as const;

const INTERVALLE = [
  { wert: "manuell", text: "Nur von Hand" },
  { wert: "15min", text: "Alle 15 Minuten" },
  { wert: "stuendlich", text: "Stündlich" },
  { wert: "taeglich", text: "Täglich" },
] as const;

/**
 * Formular fuer eine neue Verbindung. Die Felder kommen aus der Registry —
 * ein neuer Connector braucht hier keine Aenderung.
 */
export function NeueIntegration({ beschreibungen }: { beschreibungen: ConnectorBeschreibung[] }) {
  const waehlbar = beschreibungen.filter((b) => b.anmeldung !== "keine");
  const [anbieter, setAnbieter] = useState(waehlbar.find((b) => b.verfuegbar)?.id ?? waehlbar[0]?.id ?? "");
  const [zustand, aktion, laeuft] = useActionState<IntegrationsErgebnis, FormData>(integrationAnlegen, {});
  const gewaehlt = waehlbar.find((b) => b.id === anbieter);

  return (
    <form action={aktion} className="space-y-4">
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="System" id="i-anbieter">
          <Auswahl name="anbieter" value={anbieter} onChange={(e) => setAnbieter(e.target.value)}>
            {waehlbar.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.verfuegbar ? "" : " (ab Phase 4)"}
              </option>
            ))}
          </Auswahl>
        </Feld>
        <Feld beschriftung="Bezeichnung" id="i-bezeichnung" hinweis="Wie die Verbindung in der Liste heißt">
          <Eingabe name="bezeichnung" maxLength={120} placeholder={gewaehlt?.name ?? ""} />
        </Feld>
      </div>

      {gewaehlt && (
        <div className="rounded-[var(--radius)] border border-linie bg-flaeche-gedaempft p-3 text-[12px] text-gedaempft">
          <p>{gewaehlt.beschreibung}</p>
          {gewaehlt.faehigkeiten.length > 0 && (
            <p className="mt-1">
              Kann: {gewaehlt.faehigkeiten.map((f) => FAEHIGKEIT_BEZEICHNUNG[f]).join(" · ")}
            </p>
          )}
        </div>
      )}

      {gewaehlt?.anmeldefelder.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {gewaehlt.anmeldefelder.map((feld) => (
            <Feld
              key={feld.schluessel}
              beschriftung={feld.beschriftung}
              id={`i-zd-${feld.schluessel}`}
              pflicht
              {...(feld.hinweis ? { hinweis: feld.hinweis } : {})}
            >
              <Eingabe
                name={`zd_${feld.schluessel}`}
                type={feld.geheim ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                className="zahl"
              />
            </Feld>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Richtung" id="i-richtung">
          <Auswahl name="richtung" defaultValue="holen">
            {RICHTUNGEN.map((r) => (
              <option key={r.wert} value={r.wert}>{r.text}</option>
            ))}
          </Auswahl>
        </Feld>
        <Feld beschriftung="Takt" id="i-intervall" hinweis="Automatische Läufe folgen, sobald der Zeitplan aktiv ist">
          <Auswahl name="intervall" defaultValue="manuell">
            {INTERVALLE.map((i) => (
              <option key={i.wert} value={i.wert}>{i.text}</option>
            ))}
          </Auswahl>
        </Feld>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" laedt={laeuft} disabled={!gewaehlt?.verfuegbar}>
          Verbindung prüfen und speichern
        </Button>
        <p className="text-[12px] text-gedaempft">
          Vor dem Speichern wird die Verbindung geprüft. Zugangsdaten werden verschlüsselt abgelegt und nie wieder angezeigt.
        </p>
      </div>
    </form>
  );
}
