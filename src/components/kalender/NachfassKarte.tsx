import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { datum } from "@/lib/format";
import { nachfassEntscheiden } from "@/server/kalender-aktionen";

export interface NachfassZeile {
  id: string;
  termin_id: string;
  betreff: string;
  text: string;
  faellig_am: string;
  kontakt: { vorname: string | null; nachname: string; email: string | null } | null;
  objekt: { objektnummer: string; bezeichnung: string } | null;
  termin: { titel: string; beginnt_am: string } | null;
}

/**
 * Nachfass-Vorschlaege auf der Startseite (Referenz: „Nach 3 Tagen nachfassen
 * — Freigabe im Dashboard"): Mailentwurf ansehen und senden, ueberspringen
 * (Kunde hat sich gemeldet o. ae.) oder verwerfen.
 */
export function NachfassKarte({ zeilen }: { zeilen: NachfassZeile[] }) {
  if (zeilen.length === 0) return null;
  return (
    <Karte className="mb-7" data-tutorial="nachfassen">
      <KarteKopf>
        <KarteTitel>Nachfassen nach Besichtigung</KarteTitel>
        <KarteBeschreibung>Drei Tage nach einer Besichtigung liegt hier ein Mailentwurf. Senden öffnet das Postfach mit dem Text; hat sich der Kunde schon gemeldet, überspringen.</KarteBeschreibung>
      </KarteKopf>
      <KarteInhalt>
        <ul className="divide-y divide-linie">
          {zeilen.map((z) => (
            <li key={z.id} className="py-3 text-[13px]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-text">{z.kontakt ? [z.kontakt.vorname, z.kontakt.nachname].filter(Boolean).join(" ") : "Ohne Kontakt"}{z.objekt ? <span className="text-gedaempft"> · {z.objekt.objektnummer} {z.objekt.bezeichnung}</span> : null}</p>
                  <p className="text-[12px] text-gedaempft">{z.termin ? <Link href={`/kalender/${z.termin_id}`} className="hover:underline">{z.termin.titel} am {datum(z.termin.beginnt_am)}</Link> : null} · fällig {datum(z.faellig_am)}{z.kontakt?.email ? "" : " · Kontakt ohne E-Mail-Adresse"}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <form action={nachfassEntscheiden}><input type="hidden" name="id" value={z.id} /><input type="hidden" name="aktion" value="senden" /><Button type="submit" groesse="klein" disabled={!z.kontakt?.email}>Ansehen und senden</Button></form>
                  <form action={nachfassEntscheiden}><input type="hidden" name="id" value={z.id} /><input type="hidden" name="aktion" value="ueberspringen" /><Button type="submit" variante="sekundaer" groesse="klein">Überspringen (Kunde hat sich gemeldet)</Button></form>
                  <form action={nachfassEntscheiden}><input type="hidden" name="id" value={z.id} /><input type="hidden" name="aktion" value="verwerfen" /><Button type="submit" variante="leise" groesse="klein">Verwerfen</Button></form>
                </div>
              </div>
              <details className="mt-1.5"><summary className="cursor-pointer text-[12px] text-akzent">Entwurf ansehen</summary><pre className="mt-1 whitespace-pre-wrap rounded-[var(--radius)] border border-linie bg-hintergrund p-2 text-[12px] text-text">{z.betreff}{"\n\n"}{z.text}</pre></details>
            </li>
          ))}
        </ul>
      </KarteInhalt>
    </Karte>
  );
}
