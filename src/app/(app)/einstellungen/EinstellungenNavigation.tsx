"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const EINTRAEGE = [
  { pfad: "/einstellungen", bezeichnung: "Unternehmen" },
  { pfad: "/einstellungen/rechtstexte", bezeichnung: "Rechtstexte" },
  { pfad: "/einstellungen/benutzer", bezeichnung: "Benutzer" },
  { pfad: "/einstellungen/einladungen", bezeichnung: "Einladungen" },
];

/** Reiter innerhalb der Einstellungen. */
export function EinstellungenNavigation() {
  const pfad = usePathname();

  return (
    <nav aria-label="Bereiche der Einstellungen" className="mb-5 border-b border-linie">
      <ul className="-mb-px flex flex-wrap gap-1">
        {EINTRAEGE.map((eintrag) => {
          // "/einstellungen" ist Praefix aller anderen Pfade und darf deshalb
          // nur bei genauer Uebereinstimmung als aktiv gelten.
          const aktiv =
            eintrag.pfad === "/einstellungen"
              ? pfad === eintrag.pfad
              : pfad === eintrag.pfad || pfad.startsWith(`${eintrag.pfad}/`);

          return (
            <li key={eintrag.pfad}>
              <Link
                href={eintrag.pfad}
                aria-current={aktiv ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2 text-[13px] transition-colors",
                  aktiv
                    ? "border-akzent font-medium text-akzent"
                    : "border-transparent text-gedaempft hover:text-text",
                )}
              >
                {eintrag.bezeichnung}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
