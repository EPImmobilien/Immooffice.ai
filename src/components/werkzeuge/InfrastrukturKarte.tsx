"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Hinweis } from "@/components/ui/Status";
import { zeitpunkt } from "@/lib/format";
import { entfernungText, KATEGORIEN, type Infrastruktur } from "@/lib/werkzeuge/infrastruktur";
import { infrastrukturErmittelnAktion, type WerkzeugErgebnis } from "@/server/werkzeuge-aktionen";

/** Entfernungen zu Kita, Schule, Einkauf, Arzt, Haltestelle, Bahnhof, Autobahn, Park — aus OpenStreetMap, am Objekt gespeichert. */
export function InfrastrukturKarte({ objektId, infrastruktur, darfAendern }: { objektId: string; infrastruktur: Infrastruktur | null; darfAendern: boolean }) {
  const [zustand, aktion, laeuft] = useActionState<WerkzeugErgebnis, FormData>(infrastrukturErmittelnAktion, {});
  const i = zustand.infrastruktur ?? infrastruktur;
  return (
    <div className="space-y-2 text-[13px]">
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      {i && i.einrichtungen.length > 0 ? (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto_auto]">
          {i.einrichtungen.map((e) => (
            <div key={e.kategorie} className="contents">
              <dt className="text-gedaempft">{KATEGORIEN[e.kategorie].bezeichnung}{e.name ? <span className="text-text"> · {e.name}</span> : null}</dt>
              <dd className="tabular-nums text-text">{entfernungText(e.entfernung_m)}</dd>
              <dd className="tabular-nums text-gedaempft">{e.gehminuten} Min zu Fuß</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-gedaempft">{i ? "Keine Einrichtungen im Umkreis gefunden." : "Noch nicht ermittelt."}</p>
      )}
      {i && <p className="text-[12px] text-gedaempft">Quelle: OpenStreetMap (Luftlinie) · ermittelt {zeitpunkt(i.ermittelt_am)}</p>}
      {darfAendern && <form action={aktion}><input type="hidden" name="objekt_id" value={objektId} /><Button type="submit" variante="sekundaer" groesse="klein" disabled={laeuft}>{laeuft ? "Ermittelt …" : i ? "Neu ermitteln" : "Entfernungen ermitteln"}</Button></form>}
    </div>
  );
}
