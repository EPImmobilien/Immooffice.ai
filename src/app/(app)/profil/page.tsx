import type { Metadata } from "next";

import { Seitenkopf } from "@/components/Seitenkopf";
import { ROLLEN_BEZEICHNUNG } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { ProfilFormular } from "./ProfilFormular";

export const metadata: Metadata = { title: "Mein Profil" };

/**
 * Das eigene Profil steht bewusst ausserhalb der Einstellungen: Es gehoert
 * nicht zum Modul `einstellungen`, sondern jedem Benutzer — auch dem
 * Nur-Lese-Zugang.
 */
export default async function ProfilSeite() {
  const sitzung = await sitzungErzwingen();

  const supabase = await serverClient();
  const { data } = await supabase
    .from("benutzer")
    .select("name, telefon, funktion")
    .eq("id", sitzung.benutzerId)
    .maybeSingle();

  return (
    <>
      <Seitenkopf
        titel="Mein Profil"
        beschreibung={`${sitzung.mandantName} · ${ROLLEN_BEZEICHNUNG[sitzung.rolle]}`}
      />
      <ProfilFormular
        profil={{
          name: data?.name ?? sitzung.name,
          telefon: data?.telefon ?? null,
          funktion: data?.funktion ?? null,
        }}
        email={sitzung.email}
      />
    </>
  );
}
