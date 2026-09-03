"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import type { ConnectorBeschreibung } from "@/integrationen/kern/beschreibung";
import { zeitpunkt } from "@/lib/format";
import {
  integrationEinstellen,
  integrationLoeschen,
  syncStarten,
  verbindungPruefen,
  type IntegrationsErgebnis,
} from "@/server/integrations-aktionen";

export interface IntegrationZeile {
  id: string;
  anbieter: string;
  bezeichnung: string;
  richtung: "holen" | "senden" | "beide";
  intervall: string;
  status: "neu" | "aktiv" | "fehler" | "pausiert";
  letzter_sync_am: string | null;
  fehler_text: string | null;
  erstellt_am: string;
}

export interface LaufZeile {
  id: string;
  integration_id: string;
  richtung: string;
  ausloeser: string;
  status: "laeuft" | "fertig" | "fehler" | "abgebrochen";
  gestartet_am: string;
  beendet_am: string | null;
  angelegt: number;
  geaendert: number;
  uebersprungen: number;
  fehler: Array<{ typ: string; fremd_id: string | null; meldung: string }>;
  konflikte: Array<{ typ: string; lokal_id: string; fremd_id: string; grund: string }>;
}

const STATUS: Record<IntegrationZeile["status"], { text: string; ton: "neutral" | "erfolg" | "fehler" | "warnung" }> = {
  neu: { text: "Neu", ton: "neutral" },
  aktiv: { text: "Verbunden", ton: "erfolg" },
  fehler: { text: "Fehler", ton: "fehler" },
  pausiert: { text: "Pausiert", ton: "warnung" },
};

const LAUF_STATUS: Record<LaufZeile["status"], { text: string; ton: "neutral" | "erfolg" | "fehler" | "warnung" | "info" }> = {
  laeuft: { text: "Läuft", ton: "info" },
  fertig: { text: "Fertig", ton: "erfolg" },
  fehler: { text: "Fehler", ton: "fehler" },
  abgebrochen: { text: "Abgebrochen", ton: "warnung" },
};

const RICHTUNG_TEXT: Record<string, string> = { holen: "holen", senden: "senden", beide: "beide Richtungen" };
const INTERVALL_TEXT: Record<string, string> = { manuell: "von Hand", "15min": "alle 15 Min.", stuendlich: "stündlich", taeglich: "täglich" };

export function IntegrationenUebersicht({
  integrationen,
  laeufe,
  laufend,
  beschreibungen,
  darfAendern,
}: {
  integrationen: IntegrationZeile[];
  laeufe: LaufZeile[];
  laufend: string[];
  beschreibungen: ConnectorBeschreibung[];
  darfAendern: boolean;
}) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler" | "info"; text: string } | null>(null);
  const [laeuft, starten] = useTransition();
  const [offen, setOffen] = useState<string | null>(null);

  function ausfuehren(aktion: (d: FormData) => Promise<IntegrationsErgebnis>, daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await aktion(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    });
  }

  if (integrationen.length === 0) {
    return <p className="text-[13px] text-gedaempft">Noch kein System verbunden. Eine OpenImmo-Datei können Sie oben jederzeit übernehmen.</p>;
  }

  return (
    <div className="space-y-4">
      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      <ul className="divide-y divide-linie">
        {integrationen.map((i) => {
          const beschreibung = beschreibungen.find((b) => b.id === i.anbieter);
          const eigeneLaeufe = laeufe.filter((l) => l.integration_id === i.id);
          const status = STATUS[i.status];
          const inArbeit = laufend.includes(i.id);
          const istDatei = i.anbieter === "openimmo";

          return (
            <li key={i.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-medium text-text">{i.bezeichnung}</p>
                    <Marke>{beschreibung?.name ?? i.anbieter}</Marke>
                    <Marke ton={status.ton}>{status.text}</Marke>
                    {inArbeit && <Marke ton="info">Abgleich läuft</Marke>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-gedaempft">
                    {RICHTUNG_TEXT[i.richtung] ?? i.richtung} · {INTERVALL_TEXT[i.intervall] ?? i.intervall} · letzter Abgleich{" "}
                    {i.letzter_sync_am ? zeitpunkt(i.letzter_sync_am) : "noch nie"}
                  </p>
                  {i.fehler_text && <p className="mt-1 text-[12px] text-fehler">{i.fehler_text}</p>}
                </div>

                {darfAendern && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!istDatei && (
                      <form action={(d) => ausfuehren(verbindungPruefen, d)}>
                        <input type="hidden" name="integration_id" value={i.id} />
                        <Button type="submit" variante="sekundaer" groesse="klein" disabled={laeuft}>Verbindung prüfen</Button>
                      </form>
                    )}
                    {!istDatei && (
                      <form action={(d) => ausfuehren(syncStarten, d)}>
                        <input type="hidden" name="integration_id" value={i.id} />
                        <Button type="submit" groesse="klein" disabled={laeuft || inArbeit}>Jetzt abgleichen</Button>
                      </form>
                    )}
                    <Button type="button" variante="leise" groesse="klein" onClick={() => setOffen(offen === i.id ? null : i.id)}>
                      {offen === i.id ? "Schließen" : "Einstellungen"}
                    </Button>
                  </div>
                )}
              </div>

              {offen === i.id && darfAendern && (
                <div className="mt-3 space-y-3 rounded-[var(--radius)] border border-linie p-3">
                  <form action={(d) => ausfuehren(integrationEinstellen, d)} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="integration_id" value={i.id} />
                    <label className="text-[12px] text-gedaempft">
                      Bezeichnung
                      <Eingabe name="bezeichnung" defaultValue={i.bezeichnung} maxLength={120} className="mt-1" />
                    </label>
                    <label className="text-[12px] text-gedaempft">
                      Richtung
                      <Auswahl name="richtung" defaultValue={i.richtung} className="mt-1" disabled={istDatei}>
                        <option value="holen">Nur holen</option>
                        <option value="senden">Nur senden</option>
                        <option value="beide">Beide Richtungen</option>
                      </Auswahl>
                    </label>
                    <label className="text-[12px] text-gedaempft">
                      Takt
                      <Auswahl name="intervall" defaultValue={i.intervall} className="mt-1" disabled={istDatei}>
                        <option value="manuell">Von Hand</option>
                        <option value="15min">Alle 15 Minuten</option>
                        <option value="stuendlich">Stündlich</option>
                        <option value="taeglich">Täglich</option>
                      </Auswahl>
                    </label>
                    <Button type="submit" variante="sekundaer" disabled={laeuft}>Speichern</Button>
                  </form>
                  <form
                    action={(d) => {
                      if (window.confirm("Integration entfernen? Übernommene Objekte und Kontakte bleiben erhalten.")) ausfuehren(integrationLoeschen, d);
                    }}
                  >
                    <input type="hidden" name="integration_id" value={i.id} />
                    <Button type="submit" variante="gefahr" groesse="klein" disabled={laeuft}>Integration entfernen</Button>
                  </form>
                </div>
              )}

              {eigeneLaeufe.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {eigeneLaeufe.slice(0, 5).map((l) => (
                    <Lauf key={l.id} lauf={l} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Lauf({ lauf }: { lauf: LaufZeile }) {
  const [details, setDetails] = useState(false);
  const status = LAUF_STATUS[lauf.status];
  const hatDetails = lauf.fehler.length > 0 || lauf.konflikte.length > 0;

  return (
    <li className="rounded-[var(--radius)] bg-flaeche-gedaempft px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <Marke ton={status.ton}>{status.text}</Marke>
        <span className="text-text">{zeitpunkt(lauf.gestartet_am)}</span>
        <span className="text-gedaempft">
          {RICHTUNG_TEXT[lauf.richtung] ?? lauf.richtung} · {lauf.angelegt} neu · {lauf.geaendert} geändert · {lauf.uebersprungen} unverändert
          {lauf.fehler.length > 0 && ` · ${lauf.fehler.length} Fehler`}
          {lauf.konflikte.length > 0 && ` · ${lauf.konflikte.length} Konflikte`}
        </span>
        {hatDetails && (
          <button type="button" className="ml-auto text-akzent underline-offset-2 hover:underline" onClick={() => setDetails(!details)}>
            {details ? "Weniger" : "Einzelheiten"}
          </button>
        )}
      </div>
      {details && (
        <div className="mt-2 space-y-1">
          {lauf.fehler.slice(0, 50).map((f, i) => (
            <p key={`f${i}`} className="text-fehler">
              {f.typ}
              {f.fremd_id ? ` ${f.fremd_id}` : ""}: {f.meldung}
            </p>
          ))}
          {lauf.konflikte.slice(0, 50).map((k, i) => (
            <p key={`k${i}`} className="text-warnung">
              {k.typ} {k.fremd_id}: {k.grund}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}
