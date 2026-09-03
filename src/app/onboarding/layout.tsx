import Link from "next/link";

import { Wortmarke } from "@/components/Marke";
import { ModusSchalter } from "@/components/ModusSchalter";
import { Button } from "@/components/ui/Button";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { abmelden } from "@/server/auth-aktionen";

/**
 * Rahmen des Onboarding-Assistenten: ohne Seitennavigation, damit nichts vom
 * Weg ablenkt. Wer angemeldet ist, kommt hierher; wer nicht, wird von
 * `sitzungErzwingen` zur Anmeldung geleitet.
 */
export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sitzung = await sitzungErzwingen();

  return (
    <div className="flex min-h-screen flex-col bg-grund">
      <header className="border-b border-linie bg-flaeche">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Link href="/dashboard" aria-label="Zum Dashboard">
            <Wortmarke />
          </Link>
          <div className="flex items-center gap-3">
            <p className="hidden text-[12px] text-gedaempft sm:block">
              {sitzung.name} · {sitzung.mandantName}
            </p>
            <ModusSchalter />
            <form action={abmelden}>
              <Button type="submit" variante="leise" groesse="klein">
                Abmelden
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-linie px-6 py-5">
        <p className="mx-auto max-w-3xl text-[13px] text-gedaempft">
          Alles hier lässt sich später unter Einstellungen ändern.
        </p>
      </footer>
    </div>
  );
}
