import type { Metadata } from "next";
import Link from "next/link";

import { AufnahmeFormular } from "@/components/AufnahmeFormular";
import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Neue Objektaufnahme" };

export default async function NeueAufnahmeSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "anlegen", sitzung.uebersteuerung);

  const supabase = await serverClient();
  const { data: kontakte } = await supabase
    .from("kontakte")
    .select("id, vorname, nachname, firma")
    .is("geloescht_am", null)
    .order("nachname", { ascending: true })
    .limit(500);

  return (
    <>
      <Seitenkopf
        titel="Neue Objektaufnahme"
        beschreibung="Der Termin beim Eigentümer. Nur die Bezeichnung ist Pflicht — alles andere kann später folgen."
      >
        <Link href="/aufnahmen" className={buttonKlassen({ variante: "sekundaer" })}>
          Abbrechen
        </Link>
      </Seitenkopf>

      <AufnahmeFormular
        kontakte={(kontakte ?? []).map((k) => ({
          id: k.id,
          name:
            [k.vorname, k.nachname].filter(Boolean).join(" ") ||
            k.firma ||
            "Ohne Namen",
        }))}
      />
    </>
  );
}
