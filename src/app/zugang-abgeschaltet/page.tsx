import type { Metadata } from "next";

import { Wortmarke } from "@/components/Marke";
import { Button } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { abmelden } from "@/server/auth-aktionen";

export const metadata: Metadata = {
  title: "Zugang abgeschaltet",
  robots: { index: false, follow: false },
};

/**
 * Eigene Seite statt einer Weiterleitung auf die Anmeldung.
 *
 * Das Konto ist angemeldet — die Middleware schickt es von der Anmeldeseite
 * sofort wieder aufs Dashboard, und das Dashboard hierher zurueck. Hier steht
 * stattdessen, was los ist, und die Abmeldung beendet die Sitzung wirklich.
 */
export default function ZugangAbgeschaltetSeite() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <div className="mb-7">
        <Wortmarke />
      </div>

      <Karte>
        <KarteInhalt className="space-y-4 py-10 text-center">
          <h1 className="font-titel text-xl font-semibold text-text">
            Dieser Zugang ist abgeschaltet
          </h1>
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-gedaempft">
            Ihr Konto besteht weiterhin, ist aber für die Nutzung gesperrt.
            Wenden Sie sich an die Verwaltung Ihres Unternehmens — dort lässt
            sich der Zugang wieder freischalten.
          </p>
          <form action={abmelden}>
            <Button type="submit" variante="sekundaer">
              Abmelden
            </Button>
          </form>
        </KarteInhalt>
      </Karte>
    </main>
  );
}
