"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { zeitpunkt } from "@/lib/format";
import { BEREICH_BEZEICHNUNG, BEREICHE, RECHT_BEZEICHNUNG, type Recht } from "@/lib/schnittstelle/schluessel";
import { schluesselAendern, schluesselAnlegen, schluesselWiderrufen, type SchnittstellenErgebnis } from "@/server/schnittstelle-aktionen";

import { Einmalanzeige } from "./Einmalanzeige";
import type { SchluesselZeile } from "./typen";

const RECHTE: Recht[] = ["keine", "lesen", "schreiben"];

function RechteWahl({ vorgabe, praefix }: { vorgabe?: Partial<Record<string, Recht>>; praefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {BEREICHE.map((b) => (
        <Feld key={b} id={`${praefix}-${b}`} beschriftung={BEREICH_BEZEICHNUNG[b]}>
          <Auswahl name={`recht_${b}`} defaultValue={vorgabe?.[b] ?? "schreiben"}>
            {RECHTE.map((r) => (
              <option key={r} value={r}>{RECHT_BEZEICHNUNG[r]}</option>
            ))}
          </Auswahl>
        </Feld>
      ))}
    </div>
  );
}

function SchluesselKarte({ zeile }: { zeile: SchluesselZeile }) {
  const [aendern, aendernAktion, aendert] = useActionState<SchnittstellenErgebnis, FormData>(schluesselAendern, {});
  const [widerruf, widerrufAktion, widerruft] = useActionState<SchnittstellenErgebnis, FormData>(schluesselWiderrufen, {});
  const widerrufen = zeile.widerrufen_am !== null;

  return (
    <div className="rounded-[var(--radius)] border border-linie bg-flaeche p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-medium text-text">
            {zeile.bezeichnung} <code className="ml-1 font-mono text-[12px] text-gedaempft">{zeile.praefix}…</code>
          </p>
          <p className="mt-0.5 text-[12px] text-gedaempft">
            Angelegt {zeitpunkt(zeile.erstellt_am)}
            {zeile.zuletzt_verwendet_am ? ` · zuletzt verwendet ${zeitpunkt(zeile.zuletzt_verwendet_am)}` : " · noch nicht verwendet"}
            {` · ${zeile.ratenlimit_pro_minute} Anfragen/Minute`}
          </p>
        </div>
        <Marke ton={widerrufen ? "fehler" : "erfolg"}>{widerrufen ? `Widerrufen ${zeitpunkt(zeile.widerrufen_am)}` : "Aktiv"}</Marke>
      </div>

      {!widerrufen && (
        <div className="mt-4 space-y-3">
          <form action={aendernAktion} className="space-y-3">
            <input type="hidden" name="id" value={zeile.id} />
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Feld id={`bez-${zeile.id}`} beschriftung="Bezeichnung">
                <Eingabe name="bezeichnung" defaultValue={zeile.bezeichnung} maxLength={120} />
              </Feld>
              <Feld id={`lim-${zeile.id}`} beschriftung="Anfragen je Minute">
                <Eingabe name="ratenlimit" type="number" min={1} max={6000} defaultValue={zeile.ratenlimit_pro_minute} />
              </Feld>
            </div>
            <RechteWahl vorgabe={zeile.rechte} praefix={`r-${zeile.id}`} />
            {aendern.fehler && <Hinweis ton="fehler">{aendern.fehler}</Hinweis>}
            {aendern.erfolg && <Hinweis ton="erfolg">{aendern.erfolg}</Hinweis>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variante="sekundaer" groesse="klein" laedt={aendert}>Änderungen speichern</Button>
            </div>
          </form>
          <form
            action={widerrufAktion}
            onSubmit={(e) => {
              if (!window.confirm("Diesen Schlüssel endgültig widerrufen? Das lässt sich nicht rückgängig machen.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={zeile.id} />
            {widerruf.fehler && <Hinweis ton="fehler" className="mb-2">{widerruf.fehler}</Hinweis>}
            <Button type="submit" variante="gefahr" groesse="klein" laedt={widerruft}>Widerrufen</Button>
          </form>
        </div>
      )}
    </div>
  );
}

export function SchluesselVerwaltung({ schluessel }: { schluessel: SchluesselZeile[] }) {
  const [neu, neuAktion, legtAn] = useActionState<SchnittstellenErgebnis, FormData>(schluesselAnlegen, {});

  return (
    <div className="space-y-5">
      {neu.schluessel && <Einmalanzeige wert={neu.schluessel} bezeichnung="Neuer API-Schlüssel" />}

      <form action={neuAktion} className="space-y-3 rounded-[var(--radius)] border border-dashed border-linie p-4">
        <p className="text-[13px] font-medium text-text">Neuen Schlüssel anlegen</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <Feld id="neu-bezeichnung" beschriftung="Bezeichnung" pflicht hinweis="Wofür der Schlüssel ist, z. B. „Website-Anbindung“">
            <Eingabe name="bezeichnung" maxLength={120} placeholder="Website-Anbindung" />
          </Feld>
          <Feld id="neu-limit" beschriftung="Anfragen je Minute">
            <Eingabe name="ratenlimit" type="number" min={1} max={6000} defaultValue={600} />
          </Feld>
        </div>
        <RechteWahl praefix="neu" />
        {neu.fehler && <Hinweis ton="fehler">{neu.fehler}</Hinweis>}
        <Button type="submit" laedt={legtAn}>Schlüssel anlegen</Button>
      </form>

      {schluessel.length === 0 ? (
        <p className="text-[13px] text-gedaempft">Noch kein Schlüssel angelegt.</p>
      ) : (
        <div className="space-y-3">{schluessel.map((z) => <SchluesselKarte key={z.id} zeile={z} />)}</div>
      )}
    </div>
  );
}
