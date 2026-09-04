import type { Metadata } from "next";

import { Modulkacheln, ZurueckZurUebersicht } from "@/components/Modulkacheln";
import { Seitenkopf } from "@/components/Seitenkopf";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { MODULSEITEN } from "@/lib/kacheln";

const SEITE = MODULSEITEN["ki_agenten"]!;

export const metadata: Metadata = { title: SEITE.titel };

/** Modulseite „KI-Agenten" — Kacheln wie in der Referenz (src/lib/kacheln.ts). */
export default async function KiAgentenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "exposes", "lesen", sitzung.uebersteuerung);
  return (
    <>
      <Seitenkopf titel={SEITE.titel} beschreibung={SEITE.beschreibung} />
      <Modulkacheln kacheln={SEITE.kacheln} />
      <ZurueckZurUebersicht />
    </>
  );
}
