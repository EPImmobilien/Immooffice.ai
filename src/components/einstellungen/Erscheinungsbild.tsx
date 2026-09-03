"use client";

import { useState, useTransition } from "react";

import type { Branding } from "@/components/einstellungen/Stammdaten";
import { Farben, LogoFeld, Schriften } from "@/components/onboarding/OnboardingFormular";
import { Button } from "@/components/ui/Button";
import { Hinweis } from "@/components/ui/Status";
import { erscheinungsbildSpeichern } from "@/server/einstellungen-aktionen";

/**
 * Logo, Farben und Schriften (docs/AUTONOMIE.md B1–B6).
 *
 * Die Felder sind dieselben Bauteile wie im Onboarding (Schritte 4–6), damit
 * Kontrastpruefung, Vorschau und Schriftenliste nur einmal existieren. Was
 * hier gespeichert wird, wirkt sofort in Exposés, PDF, Web-Exposé,
 * Marketingmotiven und in der Kopfzeile der Anwendung.
 */
export function Erscheinungsbild({
  branding,
  mandantId,
  supabaseUrl,
}: {
  branding: Branding | null;
  mandantId: string;
  supabaseUrl: string;
}) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await erscheinungsbildSpeichern(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    });
  }

  const firmenname = branding?.firmenname ?? "";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <LogoFeld
          variante="hell"
          titel="Logo für helle Flächen"
          hinweis="PNG, JPEG, WebP oder SVG, bis 2 MB. Ein Logo mit durchsichtigem Hintergrund wirkt auf farbigen Flächen besser."
          pfad={branding?.logo_pfad ?? null}
          mandantId={mandantId}
          supabaseUrl={supabaseUrl}
        />
        <LogoFeld
          variante="dunkel"
          titel="Logo für dunkle Flächen"
          hinweis="Optional. Fehlt es, wird die helle Fassung auf dunklem Grund mit weißer Fläche hinterlegt."
          pfad={branding?.logo_invers_pfad ?? null}
          mandantId={mandantId}
          supabaseUrl={supabaseUrl}
        />
      </div>

      <form action={absenden} className="space-y-6 border-t border-linie pt-5">
        <Farben b={branding} firmenname={firmenname} />
        <div className="border-t border-linie pt-5">
          <Schriften b={branding} firmenname={firmenname} />
        </div>

        {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Speichert …" : "Farben und Schriften speichern"}
        </Button>
      </form>
    </div>
  );
}
