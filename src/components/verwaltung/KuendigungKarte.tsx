"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { datum } from "@/lib/format";
import { kuendigungZuruecknehmen, mandantKuendigen, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

/** Selbstkuendigung (docs/AUTONOMIE.md A3): Export anbieten, dann Loeschung in 30 Tagen vormerken. */
export function KuendigungKarte({ gekuendigtAm, loeschungAm, istInhaber }: { gekuendigtAm: string | null; loeschungAm: string | null; istInhaber: boolean }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(mandantKuendigen, {});
  return (
    <div className="space-y-3 text-[13px]">
      <p>Vor der Kündigung empfehlen wir den vollständigen Export: <a href="/api/export" className="text-akzent hover:underline">Tabellen und OpenImmo (ZIP)</a> · <a href="/api/export?dokumente=1" className="text-akzent hover:underline">mit allen Dokumenten und Bildern</a>.</p>
      {gekuendigtAm ? (
        <div className="space-y-2">
          <Hinweis ton="warnung" titel="Kündigung vorgemerkt">Gekündigt am {datum(gekuendigtAm)}. Alle Daten werden am {loeschungAm ? datum(loeschungAm) : "Stichtag"} endgültig gelöscht. Bis dahin bleibt der Zugang im Lesemodus nutzbar.</Hinweis>
          {istInhaber && <form action={kuendigungZuruecknehmen}><Button type="submit" variante="sekundaer" groesse="klein">Kündigung zurücknehmen</Button></form>}
        </div>
      ) : istInhaber ? (
        <form action={aktion} className="space-y-3 rounded-[var(--radius)] border border-fehler/30 p-3">
          <p className="font-medium">Unternehmen kündigen</p>
          <p className="text-gedaempft">Das Abo endet zum Laufzeitende, alle Daten des Unternehmens werden 30 Tage nach der Kündigung gelöscht. Gesetzliche Aufbewahrung (z. B. Rechnungen) liegt in Ihrer Verantwortung — nutzen Sie den Export.</p>
          <Feld id="kd-grund" beschriftung="Grund (optional)"><Textfeld id="kd-grund" name="grund" rows={2} maxLength={1000} /></Feld>
          <Feld id="kd-best" beschriftung="Zur Bestätigung KÜNDIGEN eintippen" pflicht><Eingabe id="kd-best" name="bestaetigung" required autoComplete="off" /></Feld>
          {z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}
          {z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}
          <Button type="submit" variante="gefahr" groesse="klein" disabled={laeuft}>{laeuft ? "…" : "Kündigen"}</Button>
        </form>
      ) : <p className="text-gedaempft">Kündigen kann nur der Unternehmensinhaber.</p>}
    </div>
  );
}
