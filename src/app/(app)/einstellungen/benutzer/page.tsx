import type { Metadata } from "next";
import Link from "next/link";

import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import { ROLLEN_BEZEICHNUNG, hatRecht, uebersteuerungLesen, type Rolle } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Benutzer" };

function abweichungenZaehlen(roh: unknown): number {
  const uebersteuerung = uebersteuerungLesen(roh);
  return Object.values(uebersteuerung).reduce(
    (summe, aktionen) => summe + Object.keys(aktionen ?? {}).length,
    0,
  );
}

export default async function BenutzerSeite() {
  const sitzung = await sitzungErzwingen();
  const darfEinladen = hatRecht(sitzung, "einstellungen", "anlegen");

  const supabase = await serverClient();
  const { data } = await supabase
    .from("benutzer")
    .select("id, name, email, rolle, funktion, aktiv, rechte_uebersteuerung, letzter_login_am")
    .order("name");

  const benutzer = data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-gedaempft">
          {benutzer.length === 1
            ? "1 Benutzer im Unternehmen"
            : `${benutzer.length} Benutzer im Unternehmen`}
        </p>
        {darfEinladen && (
          <Link href="/einstellungen/einladungen" className={buttonKlassen({ groesse: "klein" })}>
            Benutzer einladen
          </Link>
        )}
      </div>

      <Karte>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-linie bg-flaeche-gedaempft text-[13px]">
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-gedaempft">
                  Name
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-gedaempft">
                  Rolle
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-gedaempft">
                  Zugang
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-gedaempft">
                  <span className="sr-only">Bearbeiten</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {benutzer.map((b) => {
                const abweichungen = abweichungenZaehlen(b.rechte_uebersteuerung);

                return (
                  <tr key={b.id} className="border-b border-linie last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text">
                        {b.name}
                        {b.id === sitzung.benutzerId && (
                          <span className="ml-2 text-[12px] font-normal text-gedaempft">
                            (Sie)
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] text-gedaempft">
                        {b.email}
                        {b.funktion ? ` · ${b.funktion}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-text">
                        {ROLLEN_BEZEICHNUNG[b.rolle as Rolle]}
                      </p>
                      {abweichungen > 0 && (
                        <p className="text-[12px] text-gedaempft">
                          {abweichungen === 1
                            ? "1 Recht abweichend"
                            : `${abweichungen} Rechte abweichend`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {b.aktiv ? (
                        <Marke ton="erfolg">aktiv</Marke>
                      ) : (
                        <Marke ton="neutral">abgeschaltet</Marke>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/einstellungen/benutzer/${b.id}`}
                        className={buttonKlassen({ variante: "sekundaer", groesse: "klein" })}
                      >
                        Bearbeiten
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {benutzer.length === 0 && (
          <KarteInhalt className="py-12 text-center text-[13px] text-gedaempft">
            Noch keine Benutzer.
          </KarteInhalt>
        )}
      </Karte>
    </div>
  );
}
