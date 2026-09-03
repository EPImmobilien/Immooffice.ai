import Link from "next/link";
import { redirect } from "next/navigation";

import { Wortmarke } from "@/components/Marke";
import { ModusSchalter } from "@/components/ModusSchalter";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/Button";
import { Marke } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { ROLLEN_BEZEICHNUNG, sichtbareModule } from "@/lib/auth/rechte";
import { mandantenStil } from "@/lib/branding/stil";
import { serverClient } from "@/lib/supabase/server";
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

  // Offenes Onboarding: Die Verwaltung wird in den Assistenten geleitet, bis
  // Firmierung, Anschrift und Impressum stehen (docs/AUTONOMIE.md O1). Alle
  // anderen Rollen arbeiten weiter — sie koennen das Onboarding nicht
  // erledigen und sollen nicht davor stehen bleiben.
  if (
    !sitzung.onboardingAbgeschlossen &&
    (sitzung.rolle === "inhaber" || sitzung.rolle === "administrator")
  ) {
    redirect(`/onboarding/${Math.min(Math.max(sitzung.onboardingSchritt, 1), 8)}`);
  }

  // Erscheinungsbild des Mandanten (docs/AUTONOMIE.md B4/B6): Kopfzeile,
  // Hauptschaltflaechen und Akzente tragen die Farben des Unternehmens. Die
  // Werte werden als CSS-Variablen auf den Rahmen gesetzt — kein Neuladen,
  // kein Skript. Die Anmeldeseite bleibt im Plattformdesign.
  const supabase = await serverClient();
  const { data: marke } = await supabase
    .from("mandant_branding")
    .select("farbe_primaer, farbe_akzent")
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  const stil = mandantenStil(marke?.farbe_primaer ?? null, marke?.farbe_akzent ?? null);

  // Lesemodus (docs/AUTONOMIE.md S3): Die Datenbank erzwingt ihn; der Rahmen
  // sagt nur, warum gerade nichts gespeichert werden kann.
  const { data: zustandRoh } = await supabase.rpc("mandant_zustand");
  const zustand = (Array.isArray(zustandRoh) ? zustandRoh[0] : null) as
    | { schreibbar: boolean; loeschung_geplant_am: string | null }
    | null;
  const lesemodus = zustand ? !zustand.schreibbar : false;

  return (
    <div className="min-h-screen bg-grund" style={stil}>
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

        <main className="min-w-0 flex-1">
          {lesemodus && (
            <div className="mb-5 rounded-[var(--radius)] border border-warnung/25 bg-warnung-schwach px-4 py-3 text-[13px] text-warnung">
              <span className="font-medium">Lesemodus.</span> Ansehen und Exportieren
              funktionieren; Anlegen und Ändern erst wieder mit einem Tarif
              {zustand?.loeschung_geplant_am
                ? ` — ohne Tarif werden die Daten am ${new Date(zustand.loeschung_geplant_am).toLocaleDateString("de-DE")} gelöscht`
                : ""}
              .{" "}
              <Link href="/credits" className="underline underline-offset-2">
                Tarif wählen
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
