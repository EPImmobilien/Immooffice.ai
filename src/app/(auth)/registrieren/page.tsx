import type { Metadata } from "next";

import { SozialAnmeldung } from "@/components/SozialAnmeldung";
import { sozialeAnmeldung } from "@/lib/auth/sozial";
import { einladungAnsehen } from "@/lib/einladung";
import { serverClient } from "@/lib/supabase/server";

import { RegistrierFormular } from "./RegistrierFormular";

export const metadata: Metadata = { title: "Registrieren" };

/**
 * Registrierung — mit oder ohne Einladung.
 *
 * Mit `?einladung=<token>` wird die Einladung gelesen und die eingeladene
 * Adresse vorbelegt; ein ungueltiger Token fuehrt zur normalen Registrierung
 * mit einem Hinweis, nicht zu einer Fehlerseite.
 */
export default async function RegistrierenSeite({
  searchParams,
}: {
  searchParams: Promise<{ einladung?: string }>;
}) {
  const { einladung: token } = await searchParams;

  const supabase = await serverClient();
  const einladung = token ? await einladungAnsehen(supabase, token) : null;
  const gueltig = einladung?.zustand === "ok" && einladung.unternehmen && einladung.email;

  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">
        {gueltig ? `Beitritt zu ${einladung.unternehmen}` : "Kostenlos testen"}
      </h1>
      <p className="mt-1.5 mb-7 text-sm text-gedaempft">
        {gueltig
          ? "Legen Sie Ihr Konto an. Nach der Bestätigung der E-Mail-Adresse gehören Sie zum Unternehmen."
          : token
            ? "Der Einladungslink ist ungültig oder abgelaufen. Sie können trotzdem ein eigenes Unternehmen anlegen."
            : "7 Tage unverbindlich, ohne Zahlungsdaten."}
      </p>
      <RegistrierFormular
        {...(gueltig ? { einladung: token!, eingeladeneEmail: einladung.email! } : {})}
      />
      <div className="mt-6">
        <SozialAnmeldung
          {...sozialeAnmeldung()}
          weiter={gueltig ? `/einladung/${token}` : "/registrieren/unternehmen"}
          aktion="registrieren"
        />
      </div>
    </>
  );
}
