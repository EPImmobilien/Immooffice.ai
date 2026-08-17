import { redirect } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";

import { EinstellungenNavigation } from "./EinstellungenNavigation";

/**
 * Rahmen der Einstellungen.
 *
 * Der Zugang haengt am Modul `einstellungen` — in der Vorbelegung haben ihn
 * Inhaber und Administrator. Die Pruefung steht hier und zusaetzlich in jeder
 * Serveraktion; die Datenbank prueft ein drittes Mal ueber `ist_verwaltung()`.
 */
export default async function EinstellungenLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sitzung = await sitzungErzwingen();

  if (!hatRecht(sitzung, "einstellungen", "lesen")) redirect("/dashboard");

  return (
    <>
      <Seitenkopf
        titel="Einstellungen"
        beschreibung="Unternehmen, Erscheinungsbild, Benutzer und Einladungen."
      />
      <EinstellungenNavigation />
      {children}
    </>
  );
}
