import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OnboardingFormular } from "@/components/onboarding/OnboardingFormular";
import { Schrittleiste } from "@/components/onboarding/Schrittleiste";
import { EINLADUNG_SPALTEN, type EinladungZeile } from "@/lib/einladung";
import { Hinweis } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { SCHRITTE, istSchrittNr } from "@/lib/onboarding";
import { serverClient } from "@/lib/supabase/server";
import { supabaseUmgebung } from "@/lib/supabase/umgebung";

export const metadata: Metadata = { title: "Einrichtung" };

/**
 * Ein Schritt des Assistenten (docs/AUTONOMIE.md O1).
 *
 * Die Reihenfolge ist nicht erzwungen: Wer Schritt 6 aufruft, bekommt
 * Schritt 6. Erzwungen wird nur der Abschluss — ohne Pflichtangaben laesst
 * die Datenbankfunktion ihn nicht zu.
 */
export default async function OnboardingSchrittSeite({
  params,
  searchParams,
}: {
  params: Promise<{ schritt: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const [{ schritt: roh }, { fehler }] = await Promise.all([params, searchParams]);
  const nr = Number(roh);
  if (!istSchrittNr(nr)) notFound();

  const sitzung = await sitzungErzwingen();
  // Nur die Verwaltung richtet ein. Alle anderen landen im Dashboard —
  // ohne Fehlermeldung, weil sie nichts falsch gemacht haben.
  if (!hatRecht(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung)) {
    redirect("/dashboard");
  }

  const supabase = await serverClient();
  const { url } = supabaseUmgebung();
  const [{ data: brandingRoh }, { data: einladungen }] = await Promise.all([
    supabase
      .from("mandant_branding")
      .select(
        "firmenname, rechtsform, geschaeftsfuehrer, strasse, hausnummer, plz, ort, telefon, email, web, " +
          "handelsregister, ust_id, aufsichtsbehoerde, impressum, logo_pfad, logo_invers_pfad, " +
          "farbe_primaer, farbe_akzent, schrift_serifenlos, schrift_serifen, signatur_html",
      )
      .eq("mandant_id", sitzung.mandantId)
      .maybeSingle(),
    nr === 8
      ? supabase
          .from("einladungen")
          .select(EINLADUNG_SPALTEN)
          .is("eingeloest_am", null)
          .is("widerrufen_am", null)
          .order("erstellt_am", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const schritt = SCHRITTE.find((s) => s.nr === nr)!;
  const branding = (brandingRoh ?? null) as unknown as OnboardingBranding | null;

  return (
    <div className="space-y-6">
      <Schrittleiste aktuell={nr} erreicht={sitzung.onboardingSchritt} />

      <div>
        <p className="text-[12px] uppercase tracking-[0.14em] text-gedaempft">
          Schritt {nr} von {SCHRITTE.length}
          {schritt.pflicht ? " · Pflicht" : " · Optional"}
        </p>
        <h1 className="mt-1 font-titel text-2xl font-semibold text-text">{schritt.titel}</h1>
        <p className="mt-1 text-sm text-gedaempft">{schritt.kurz}</p>
      </div>

      {fehler && (
        <Hinweis ton="fehler">
          Der Schritt konnte nicht übersprungen werden. Bitte erneut versuchen.
        </Hinweis>
      )}

      <OnboardingFormular
        schritt={nr}
        branding={branding}
        einladungen={(einladungen ?? []) as unknown as EinladungZeile[]}
        mandantId={sitzung.mandantId}
        supabaseUrl={url}
        firmenname={branding?.firmenname ?? sitzung.mandantName}
      />
    </div>
  );
}

export interface OnboardingBranding {
  firmenname: string | null;
  rechtsform: string | null;
  geschaeftsfuehrer: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  web: string | null;
  handelsregister: string | null;
  ust_id: string | null;
  aufsichtsbehoerde: string | null;
  impressum: string | null;
  logo_pfad: string | null;
  logo_invers_pfad: string | null;
  farbe_primaer: string | null;
  farbe_akzent: string | null;
  schrift_serifenlos: string | null;
  schrift_serifen: string | null;
  signatur_html: string | null;
}
