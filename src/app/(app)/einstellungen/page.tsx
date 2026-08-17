import type { Metadata } from "next";

import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { UnternehmenFormular } from "./UnternehmenFormular";

export const metadata: Metadata = { title: "Unternehmen" };

export interface BrandingDaten {
  firmenname: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  web: string | null;
  farbe_primaer: string | null;
  farbe_akzent: string | null;
  mail_absender_name: string | null;
  mail_absender_adresse: string | null;
}

export default async function UnternehmenSeite() {
  const sitzung = await sitzungErzwingen();

  const supabase = await serverClient();
  const { data } = await supabase
    .from("mandant_branding")
    .select(
      "firmenname, strasse, hausnummer, plz, ort, telefon, email, web, " +
        "farbe_primaer, farbe_akzent, mail_absender_name, mail_absender_adresse",
    )
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  return (
    <UnternehmenFormular
      name={sitzung.mandantName}
      branding={(data ?? {}) as BrandingDaten}
      schreibbar={hatRecht(sitzung, "einstellungen", "aendern")}
    />
  );
}
