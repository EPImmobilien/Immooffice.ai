import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Hinweis } from "@/components/ui/Status";
import { BewerberVerwaltung, type Bewerber } from "@/components/verwaltung/BewerberVerwaltung";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bewerber" };

/** Bewerber und Einstellungstests (Chef-Bereich). Masterprompt: entfaellt — auf Weisung 1:1, streichbar. */
export default async function BewerberSeite() {
  const sitzung = await sitzungErzwingen();
  if (sitzung.rolle !== "inhaber" && sitzung.rolle !== "administrator") {
    return <><Seitenkopf titel="Bewerber" /><Hinweis ton="warnung">Nur die Verwaltung sieht Bewerber.</Hinweis></>;
  }
  const supabase = await serverClient();
  const { data } = await supabase.from("bewerbungen").select("id, vorname, nachname, email, position, status, gestartet_am, abgeschlossen_am, antworten, punkte, max_punkte, empfehlung, freitext, chef_note, chef_kommentar, gueltig_bis, erstellt_am").order("erstellt_am", { ascending: false });
  return (
    <>
      <Seitenkopf titel="Bewerber" beschreibung="Einstellungstest per Link (Rechnen, Immobilienwissen, Kundenkontakt, Textverständnis), automatische Auswertung mit Empfehlung, Ihre Bewertung.">
        <Link href="/einstellungen" className="text-[13px] text-akzent hover:underline">Einstellungen</Link>
      </Seitenkopf>
      <Hinweis ton="info" className="mb-4">Hinweis zum Rahmen: Der Masterprompt streicht das Bewerber-Modul ersatzlos; es ist auf Weisung des Auftraggebers (1:1-Übernahme) gebaut und als Ganzes streichbar (E-2026-09-03-36). Die Fragen sind eigene Formulierungen.</Hinweis>
      <BewerberVerwaltung liste={(data ?? []) as unknown as Bewerber[]} />
    </>
  );
}
