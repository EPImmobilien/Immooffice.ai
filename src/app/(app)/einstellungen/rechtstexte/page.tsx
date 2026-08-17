import type { Metadata } from "next";

import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { RechtstexteFormular } from "./RechtstexteFormular";

export const metadata: Metadata = { title: "Rechtstexte" };

export interface RechtstexteDaten {
  impressum: string | null;
  datenschutztext: string | null;
  widerrufsbelehrung: string | null;
  rechtstexte_sonstige: string | null;
}

export default async function RechtstexteSeite() {
  const sitzung = await sitzungErzwingen();

  const supabase = await serverClient();
  const { data } = await supabase
    .from("mandant_branding")
    .select("impressum, datenschutztext, widerrufsbelehrung, rechtstexte_sonstige")
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  return (
    <RechtstexteFormular
      texte={(data ?? {}) as RechtstexteDaten}
      schreibbar={hatRecht(sitzung, "einstellungen", "aendern")}
    />
  );
}
