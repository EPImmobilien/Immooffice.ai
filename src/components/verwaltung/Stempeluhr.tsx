"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { uhrzeit } from "@/lib/format";
import { stundenText, type Stempel } from "@/lib/verwaltung/arbeitszeit";
import { feierabendNachtragen, stempeln, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

/**
 * Stempeluhr (Referenz: Startseite → Kommen/Gehen). Zeigt den Stand von heute,
 * die gestempelten Stunden und vergessene Feierabende der letzten Tage zum
 * Nachtragen.
 */
export function Stempeluhr({ heute, sollHeute, vergessen }: { heute: Stempel[]; sollHeute: number; vergessen: Array<{ datum: string; offen: string; vorschlag: string }> }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(stempeln, {});
  const letzte = heute[heute.length - 1];
  const drin = letzte?.richtung === "kommen";
  const [jetzt, setJetzt] = useState<number>(() => Date.now());
  useEffect(() => { const t = setInterval(() => setJetzt(Date.now()), 30000); return () => clearInterval(t); }, []);
  // Laufende Stunden inkl. offenem Stempel
  let summe = 0; let start: string | null = null;
  for (const s of heute) { if (s.richtung === "kommen") start = start ?? s.zeitpunkt; else if (start) { summe += (new Date(s.zeitpunkt).getTime() - new Date(start).getTime()) / 3600000; start = null; } }
  if (start) summe += (jetzt - new Date(start).getTime()) / 3600000;
  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{drin ? `Eingestempelt seit ${uhrzeit(letzte.zeitpunkt)}` : letzte ? `Ausgestempelt um ${uhrzeit(letzte.zeitpunkt)}` : "Noch nicht eingestempelt"}</p>
          <p className="text-[12px] text-gedaempft">Heute {stundenText(Math.round(summe * 100) / 100)}{sollHeute > 0 ? ` von ${stundenText(sollHeute)} Soll` : ""} · <Link href="/arbeitszeit" className="text-akzent hover:underline">Monat ansehen</Link></p>
        </div>
        <form action={aktion}><Button type="submit" groesse="klein" variante={drin ? "sekundaer" : "primaer"} disabled={laeuft}>{laeuft ? "…" : drin ? "Gehen" : "Kommen"}</Button></form>
      </div>
      {z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}
      {z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}
      {vergessen.map((v) => <Nachtrag key={v.datum} datum={v.datum} offen={v.offen} vorschlag={v.vorschlag} />)}
    </div>
  );
}

function Nachtrag({ datum, offen, vorschlag }: { datum: string; offen: string; vorschlag: string }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(feierabendNachtragen, {});
  if (z.erfolg) return <p className="text-[12px] text-erfolg">{z.erfolg}</p>;
  return (
    <form action={aktion} className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-warnung/40 bg-warnung-schwach px-2 py-1.5 text-[12px]">
      <input type="hidden" name="datum" value={datum} />
      <span>Feierabend am {datum.split("-").reverse().join(".")} fehlt (Kommen {uhrzeit(offen)}).</span>
      <Eingabe name="zeit" type="time" defaultValue={vorschlag} className="w-28" aria-label="Feierabend" />
      <Button type="submit" groesse="klein" disabled={laeuft}>Nachtragen</Button>
      <Button type="submit" name="verwerfen" value="1" groesse="klein" variante="leise" disabled={laeuft}>verwerfen</Button>
      {z.fehler && <span className="text-fehler">{z.fehler}</span>}
    </form>
  );
}
