import type { Metadata } from "next";

import { SozialAnmeldung, sozialeAnmeldung } from "@/components/SozialAnmeldung";
import { Hinweis } from "@/components/ui/Status";

import { AnmeldeFormular } from "./AnmeldeFormular";

export const metadata: Metadata = { title: "Anmelden" };

export default async function AnmeldenSeite({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string; fehler?: string }>;
}) {
  const { weiter, fehler } = await searchParams;

  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">Anmelden</h1>
      <p className="mt-1.5 mb-7 text-sm text-gedaempft">
        Willkommen zurück bei ImmoOffice.ai.
      </p>
      {fehler === "anbieter" && (
        <Hinweis ton="fehler" className="mb-5" titel="Anmeldung über den Anbieter nicht möglich">
          Die Anmeldung über Google oder Microsoft ist fehlgeschlagen oder nicht eingerichtet. Bitte mit E-Mail-Adresse und Passwort anmelden.
        </Hinweis>
      )}
      <AnmeldeFormular weiter={weiter ?? ""} linkFehler={fehler === "link"} />
      <div className="mt-6">
        <SozialAnmeldung {...sozialeAnmeldung()} weiter={weiter ?? ""} />
      </div>
    </>
  );
}
