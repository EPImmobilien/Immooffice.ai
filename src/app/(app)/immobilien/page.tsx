import type { Metadata } from "next";

import { Modulkacheln, ZurueckZurUebersicht } from "@/components/Modulkacheln";
import { Seitenkopf } from "@/components/Seitenkopf";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { MODULSEITEN } from "@/lib/kacheln";

const SEITE = MODULSEITEN["immobilien"]!;

export const metadata: Metadata = { title: SEITE.titel };

/** Modulseite „Immobilien" — Kacheln wie in der Referenz (src/lib/kacheln.ts). */
export default async function ImmobilienSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  return (
    <>
      <Seitenkopf titel={SEITE.titel} beschreibung={SEITE.beschreibung} />
      <Modulkacheln kacheln={SEITE.kacheln} />
      <ZurueckZurUebersicht />
    </>
  );
}
