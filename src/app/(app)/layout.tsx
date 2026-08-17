import Link from "next/link";

import { Wortmarke } from "@/components/Marke";
import { ModusSchalter } from "@/components/ModusSchalter";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/Button";
import { Marke } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { ROLLEN_BEZEICHNUNG, sichtbareModule } from "@/lib/auth/rechte";
import { abmelden } from "@/server/auth-aktionen";

/**
 * Rahmen des angemeldeten Bereichs.
 *
 * `sitzungErzwingen` ist die zweite Schutzebene neben der Middleware
 * (ARCHITECTURE.md, Abschnitt 4). Beide zusammen, damit ein Fehler in der
 * Pfadliste der Middleware nicht den gesamten Bereich oeffnet.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sitzung = await sitzungErzwingen();
  const erlaubteModule = sichtbareModule(sitzung.rolle, sitzung.uebersteuerung);

  return (
    <div className="min-h-screen bg-grund">
      <header className="sticky top-0 z-20 border-b border-linie bg-flaeche">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <Link href="/dashboard" aria-label="Zum Dashboard">
            <Wortmarke />
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] leading-tight font-medium text-text">
                {sitzung.name}
              </p>
              <p className="text-[11px] leading-tight text-gedaempft">
                {sitzung.mandantName} · {ROLLEN_BEZEICHNUNG[sitzung.rolle]}
              </p>
            </div>
            {sitzung.aboStatus === "test" && (
              <Marke ton="warnung" className="hidden md:inline-flex">
                Testphase
              </Marke>
            )}
            <ModusSchalter />
            <form action={abmelden}>
              <Button type="submit" variante="leise" groesse="klein">
                Abmelden
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-5 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 rounded-[var(--radius-gross)] border border-linie bg-flaeche">
            <Navigation erlaubteModule={erlaubteModule} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
