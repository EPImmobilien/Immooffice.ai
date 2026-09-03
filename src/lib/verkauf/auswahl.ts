import "server-only";

import type { KontaktWahl, ObjektWahl } from "@/components/verkauf/MaklervertragFormular";
import { serverClient } from "@/lib/supabase/server";

/** Auswahllisten fuer die Vertragsvorlagen. */
export async function auswahlLaden() {
  const supabase = await serverClient();
  const [{ data: objekte }, { data: kontakte }] = await Promise.all([
    supabase.from("objekte").select("id, objektnummer, bezeichnung, strasse, hausnummer, plz, ort, kaufpreis, kaltmiete, objektkategorie, vermarktungsart").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("kontakte").select("id, anrede, vorname, nachname, firma, strasse, hausnummer, plz, ort, email").is("geloescht_am", null).order("nachname").limit(1000),
  ]);
  return {
    objekte: (objekte ?? []) as ObjektWahl[],
    kontakte: ((kontakte ?? []) as Array<{ id: string; anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null; email: string | null }>).map((k) => ({
      id: k.id,
      name: [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Ohne Namen",
      strasse: k.strasse, hausnummer: k.hausnummer, plz: k.plz, ort: k.ort, email: k.email, anrede: k.anrede,
    })) as KontaktWahl[],
  };
}

