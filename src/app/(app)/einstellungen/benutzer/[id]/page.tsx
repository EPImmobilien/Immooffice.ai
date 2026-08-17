import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonKlassen } from "@/components/ui/Button";
import { hatRecht, uebersteuerungLesen, type Rolle } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { BenutzerFormular } from "./BenutzerFormular";

export const metadata: Metadata = { title: "Benutzer bearbeiten" };

export default async function BenutzerBearbeitenSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();

  const supabase = await serverClient();
  const { data } = await supabase
    .from("benutzer")
    .select("id, name, email, rolle, telefon, funktion, aktiv, rechte_uebersteuerung")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/einstellungen/benutzer"
        className={buttonKlassen({ variante: "leise", groesse: "klein" })}
      >
        Zurück zur Übersicht
      </Link>

      <BenutzerFormular
        benutzer={{
          id: data.id,
          name: data.name,
          email: data.email,
          rolle: data.rolle as Rolle,
          telefon: data.telefon,
          funktion: data.funktion,
          aktiv: data.aktiv,
          uebersteuerung: uebersteuerungLesen(data.rechte_uebersteuerung),
        }}
        istManSelbst={data.id === sitzung.benutzerId}
        // Nur der Inhaber darf die Inhaberrolle vergeben oder entziehen. Die
        // Datenbank setzt das ebenfalls durch; hier bleibt die Auswahl
        // erst gar nicht anklickbar.
        darfInhaberRolle={sitzung.rolle === "inhaber"}
        darfEntfernen={
          hatRecht(sitzung, "einstellungen", "loeschen") && data.id !== sitzung.benutzerId
        }
        schreibbar={hatRecht(sitzung, "einstellungen", "aendern")}
      />
    </div>
  );
}
