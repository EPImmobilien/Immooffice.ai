import Link from "next/link";

import { Wortmarke } from "@/components/Marke";
import { ModusSchalter } from "@/components/ModusSchalter";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";

/** Oeffentliche Einstiegsseite. */
export default function Startseite() {
  return (
    <div className="flex min-h-screen flex-col bg-grund">
      <header className="border-b border-linie bg-flaeche">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Wortmarke />
          <ModusSchalter />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <h1 className="font-titel text-3xl font-semibold text-text">
          Maklersoftware für Objekte, Exposés und Wertermittlung
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-gedaempft">
          Objekte, Kontakte und Exposés in einer Anwendung — mit Datenhaltung in
          Deutschland und einem Datenmodell, das den Portalexport von Anfang an
          mitdenkt.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/anmelden" className={buttonKlassen({ groesse: "gross" })}>
            Anmelden
          </Link>
          <Link
            href="/registrieren"
            className={buttonKlassen({ variante: "sekundaer", groesse: "gross" })}
          >
            Neues Unternehmen: 7 Tage kostenlos testen
          </Link>
        </div>

        <div className="mt-8">
          <Hinweis ton="info" titel="Stand: Abnahmefassung">
            Immobilien, Adressbuch, Termine, ToDos, Verkauf, Vermietung,
            Exposé-Schmiede, Marketing, Werkzeuge, Akquise, Postfach,
            Kundenbereich, Rechnungen, Arbeitszeit und Admin sind bedienbar.
            Bereits registrierte Adressen melden sich über „Anmelden" an.
          </Hinweis>
        </div>

        <Karte className="mt-6">
          <KarteInhalt className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text">Styleguide</p>
              <p className="mt-0.5 text-[13px] text-gedaempft">
                Design-Tokens und Kernkomponenten im Hell- und Dunkelmodus
              </p>
            </div>
            <Link href="/styleguide" className={buttonKlassen()}>
              Styleguide öffnen
            </Link>
          </KarteInhalt>
        </Karte>
      </main>

      <footer className="border-t border-linie px-6 py-5">
        <p className="mx-auto max-w-3xl text-[13px] text-gedaempft">
          ImmoOffice.ai · Daten werden in der EU verarbeitet (Frankfurt am Main)
        </p>
      </footer>
    </div>
  );
}
