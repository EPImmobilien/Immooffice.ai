import Link from "next/link";

import { Wortmarke } from "@/components/Marke";
import { ModusSchalter } from "@/components/ModusSchalter";

/** Rahmen fuer Anmeldung und Registrierung. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-grund">
      <header className="border-b border-linie bg-flaeche">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link href="/" aria-label="Zur Startseite">
            <Wortmarke />
          </Link>
          <ModusSchalter />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t border-linie px-6 py-5">
        <p className="mx-auto max-w-5xl text-[13px] text-gedaempft">
          Ihre Daten werden in der EU verarbeitet (Frankfurt am Main).
        </p>
      </footer>
    </div>
  );
}
