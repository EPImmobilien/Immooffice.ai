"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum } from "@/lib/format";
import { KUNDEN_ART, type KundenArt } from "@/lib/portal/typen";
import { kundeAusKontaktEinladen, type PortalErgebnis } from "@/server/portal-aktionen";

/**
 * Am Kontakt: bestehende Zugaenge zum Kundenbereich anzeigen oder den
 * Kontakt als Eigentuemer/Kaeufer einladen (Objekte laut Kontaktrolle).
 */
export function KontaktZugang({ kontaktId, zugaenge, hatEmail, darfAendern }: { kontaktId: string; zugaenge: Array<{ id: string; art: KundenArt; aktiv: boolean; angenommen_am: string | null; eingeladen_am: string }>; hatEmail: boolean; darfAendern: boolean }) {
  const [z, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(kundeAusKontaktEinladen, {});
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="space-y-2 text-[13px]">
      {zugaenge.length === 0 && !z.id && <p className="text-gedaempft">Dieser Kontakt hat noch keinen Zugang zum Kundenbereich.</p>}
      {zugaenge.map((k) => (
        <p key={k.id}><Link href={`/kundenbereich/${k.id}`} className="text-akzent hover:underline">{KUNDEN_ART[k.art]}-Zugang</Link> <Marke ton={k.aktiv ? (k.angenommen_am ? "erfolg" : "warnung") : "fehler"}>{!k.aktiv ? "gesperrt" : k.angenommen_am ? "aktiv" : "eingeladen"}</Marke> <span className="text-[11px] text-gedaempft">{datum(k.eingeladen_am)}</span></p>
      ))}
      {z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}
      {z.link && <div className="flex gap-2"><Eingabe readOnly value={z.link} onFocus={(e) => e.currentTarget.select()} aria-label="Zugangslink" /><Button type="button" groesse="klein" variante="sekundaer" onClick={() => { void navigator.clipboard?.writeText(z.link ?? "").then(() => setKopiert(true)); }}>{kopiert ? "Kopiert" : "Kopieren"}</Button></div>}
      {z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}
      {darfAendern && !z.id && (
        hatEmail ? (
          <form action={aktion} className="flex flex-wrap gap-2">
            <input type="hidden" name="kontakt_id" value={kontaktId} />
            {!zugaenge.some((k) => k.art === "eigentuemer") && <Button type="submit" name="art" value="eigentuemer" groesse="klein" disabled={laeuft}>Als Eigentümer einladen</Button>}
            {!zugaenge.some((k) => k.art === "kaeufer") && <Button type="submit" name="art" value="kaeufer" groesse="klein" variante="sekundaer" disabled={laeuft}>Als Käufer einladen</Button>}
          </form>
        ) : <p className="text-[12px] text-gedaempft">Für eine Einladung braucht der Kontakt eine E-Mail-Adresse.</p>
      )}
      <p className="text-[11px] text-gedaempft">Login, Passwort und Objektfreigaben werden im Kundenbereich verwaltet — hier stehen nur die Stammdaten.</p>
    </div>
  );
}
