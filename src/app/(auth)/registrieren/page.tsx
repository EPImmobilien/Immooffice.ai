import type { Metadata } from "next";

import { RegistrierFormular } from "./RegistrierFormular";

export const metadata: Metadata = { title: "Registrieren" };

export default function RegistrierenSeite() {
  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">
        Kostenlos testen
      </h1>
      <p className="mt-1.5 mb-7 text-sm text-gedaempft">
        7 Tage unverbindlich, ohne Zahlungsdaten.
      </p>
      <RegistrierFormular />
    </>
  );
}
