import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { SuchprofilFormular } from "../SuchprofilFormular";

export const metadata: Metadata = { title: "Neues Suchprofil" };

export default async function NeuesSuchprofilSeite() {
  const sitzung = await sitzungErzwingen();
  if (!hatRecht(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung)) redirect("/suchprofile");

  const supabase = await serverClient();
  const { data } = await supabase
    .from("kontakte")
    .select("id, vorname, nachname, firma")
    .is("geloescht_am", null)
    .order("nachname", { nullsFirst: false });

  const kontakte = (data ?? []).map((k) => ({
    id: k.id,
    name:
      [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Ohne Namen",
  }));

  if (kontakte.length === 0) {
    return (
      <>
        <Seitenkopf titel="Neues Suchprofil" />
        <Karte>
          <KarteInhalt className="py-14 text-center">
            <p className="text-sm font-medium text-text">Noch keine Kontakte</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-gedaempft">
              Ein Suchprofil gehört immer zu einem Interessenten. Legen Sie
              zuerst einen Kontakt an.
            </p>
            <Link href="/kontakte/neu" className={buttonKlassen({ className: "mt-5" })}>
              Kontakt anlegen
            </Link>
          </KarteInhalt>
        </Karte>
      </>
    );
  }

  return (
    <>
      <Seitenkopf
        titel="Neues Suchprofil"
        beschreibung="Nach dem Anlegen wird sofort im Bestand gesucht."
      />
      <SuchprofilFormular kontakte={kontakte} />
    </>
  );
}
