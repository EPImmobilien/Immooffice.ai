"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import type { Modul } from "@/lib/auth/rechte";

interface Eintrag {
  modul: Modul | null;
  pfad: string;
  bezeichnung: string;
  /** In v0.1 noch nicht umgesetzt — sichtbar, aber als geplant gekennzeichnet. */
  geplant?: boolean;
}

/**
 * Hauptnavigation nach Abschnitt 6.
 *
 * Noch nicht umgesetzte Module bleiben sichtbar, sind aber deutlich als
 * geplant markiert. Das ist ehrlicher als eine kurze Liste, die den Umfang
 * verschweigt — und macht den Stand des Durchstichs sofort erkennbar.
 */
const EINTRAEGE: Eintrag[] = [
  { modul: null, pfad: "/dashboard", bezeichnung: "Übersicht" },
  { modul: "objekte", pfad: "/objekte", bezeichnung: "Objekte" },
  { modul: "kontakte", pfad: "/kontakte", bezeichnung: "Kontakte" },
  { modul: "kontakte", pfad: "/suchprofile", bezeichnung: "Suchprofile" },
  { modul: "exposes", pfad: "/exposes", bezeichnung: "Exposés" },
  { modul: "objekte", pfad: "/portale", bezeichnung: "Portalexport" },
  { modul: "wertermittlung", pfad: "/wertermittlung", bezeichnung: "Wertermittlung", geplant: true },
  { modul: "vertraege", pfad: "/vertraege", bezeichnung: "Verträge", geplant: true },
  { modul: "marketing", pfad: "/marketing", bezeichnung: "Marketing" },
  { modul: "kalender", pfad: "/kalender", bezeichnung: "Kalender", geplant: true },
  { modul: "kalender", pfad: "/aufgaben", bezeichnung: "Aufgaben", geplant: true },
  { modul: "auswertungen", pfad: "/auswertungen", bezeichnung: "Auswertungen", geplant: true },
  { modul: "einstellungen", pfad: "/einstellungen", bezeichnung: "Einstellungen" },
  { modul: "abrechnung", pfad: "/credits", bezeichnung: "Abo und Credits" },
];

export function Navigation({ erlaubteModule }: { erlaubteModule: Modul[] }) {
  const pfad = usePathname();
  const erlaubt = new Set<string>(erlaubteModule);

  const sichtbar = EINTRAEGE.filter(
    (e) => e.modul === null || erlaubt.has(e.modul),
  );

  return (
    <nav aria-label="Hauptnavigation" className="p-3">
      <ul className="space-y-0.5">
        {sichtbar.map((eintrag) => {
          const aktiv =
            pfad === eintrag.pfad || pfad.startsWith(`${eintrag.pfad}/`);

          return (
            <li key={eintrag.pfad}>
              <Link
                href={eintrag.geplant ? "#" : eintrag.pfad}
                aria-current={aktiv ? "page" : undefined}
                aria-disabled={eintrag.geplant || undefined}
                tabIndex={eintrag.geplant ? -1 : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-[var(--radius)]",
                  "px-3 py-2 text-[13px] transition-colors",
                  eintrag.geplant
                    ? "cursor-default text-gedaempft/60"
                    : aktiv
                      ? "bg-akzent-schwach font-medium text-akzent"
                      : "text-text hover:bg-flaeche-gedaempft",
                )}
              >
                {eintrag.bezeichnung}
                {eintrag.geplant && (
                  <span className="text-[10px] tracking-wide uppercase">
                    geplant
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
