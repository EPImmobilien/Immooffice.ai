import type { Metadata } from "next";

import { AnmeldeFormular } from "./AnmeldeFormular";

export const metadata: Metadata = { title: "Anmelden" };

export default async function AnmeldenSeite({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string }>;
}) {
  const { weiter } = await searchParams;

  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">Anmelden</h1>
      <p className="mt-1.5 mb-7 text-sm text-gedaempft">
        Willkommen zurück bei ImmoOffice.ai.
      </p>
      <AnmeldeFormular weiter={weiter ?? ""} />
    </>
  );
}
