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
  /** Weitere Pfade, bei denen der Eintrag als aktiv gilt (Unterseiten des Moduls). */
  auch?: string[];
}

/**
 * Hauptnavigation — Reihenfolge und Bezeichnungen wie das Menue der Referenz
 * (E-2026-09-04-56). Die Kacheln der Startseite sind der eigentliche Einstieg;
 * das Menue ist der schnelle Seitenwechsel.
 */
const EINTRAEGE: Eintrag[] = [
  { modul: null, pfad: "/dashboard", bezeichnung: "Übersicht" },
  { modul: "objekte", pfad: "/immobilien", bezeichnung: "Immobilien", auch: ["/objekte", "/projekte", "/aufnahmen", "/portale", "/suchprofile"] },
  { modul: "postfach", pfad: "/postfach", bezeichnung: "Posteingang" },
  { modul: "kalender", pfad: "/aufgaben", bezeichnung: "ToDos", auch: ["/checklisten"] },
  { modul: null, pfad: "/arbeitszeit", bezeichnung: "Arbeitszeit", auch: ["/urlaub"] },
  { modul: "kalender", pfad: "/kalender", bezeichnung: "Termine" },
  { modul: "marketing", pfad: "/marketing", bezeichnung: "Marketing" },
  { modul: "vertraege", pfad: "/verkauf", bezeichnung: "Verkauf", auch: ["/vertraege", "/uebergaben", "/notar"] },
  { modul: "vertraege", pfad: "/vermietung", bezeichnung: "Vermietung" },
  { modul: "wertermittlung", pfad: "/wertermittlung", bezeichnung: "Bewertung" },
  { modul: "exposes", pfad: "/exposes", bezeichnung: "Exposé-Schmiede" },
  { modul: "exposes", pfad: "/ki-agenten", bezeichnung: "KI-Agenten" },
  { modul: "kontakte", pfad: "/kontakte", bezeichnung: "Adressbuch" },
  { modul: "akquise", pfad: "/akquise", bezeichnung: "Akquise" },
  { modul: "portal", pfad: "/kundenbereich", bezeichnung: "Kundenbereich" },
  { modul: "objekte", pfad: "/dokumente", bezeichnung: "Dokumente", auch: ["/briefe"] },
  { modul: "objekte", pfad: "/werkzeuge", bezeichnung: "Werkzeuge" },
  { modul: "rechnungen", pfad: "/rechnungen", bezeichnung: "Rechnungen" },
  { modul: "rechnungen", pfad: "/finanzen", bezeichnung: "Finanzen", auch: ["/auswertungen"] },
  { modul: "einstellungen", pfad: "/admin", bezeichnung: "Admin", auch: ["/einstellungen"] },
  { modul: "abrechnung", pfad: "/credits", bezeichnung: "Abo und Credits" },
  { modul: null, pfad: "/einstellungen/profil", bezeichnung: "Mein Profil" },
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
          const trifft = (p: string) => pfad === p || pfad.startsWith(`${p}/`);
          const profil = pfad.startsWith("/einstellungen/profil");
          const aktiv = eintrag.pfad === "/einstellungen/profil"
            ? profil
            : !profil && (trifft(eintrag.pfad) || (eintrag.auch ?? []).some(trifft));

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
