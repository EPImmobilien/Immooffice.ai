import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { FinanzierungFormular, KennzahlenFormular, type Finanzierung, type Kennzahl } from "@/components/verwaltung/KennzahlenFormular";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kennzahlen und Finanzierung" };

/** Firmenkennzahlen je Jahr und Finanzierungsannahmen (Referenz: Admin → Kennzahlen / Finanzierung). */
export default async function KennzahlenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "lesen", sitzung.uebersteuerung);
  const darfAendern = sitzung.rolle === "inhaber" || sitzung.rolle === "administrator";
  const supabase = await serverClient();
  const [{ data: kennzahlen }, { data: finanzierung }] = await Promise.all([
    supabase.from("firma_kennzahlen").select("*").order("jahr", { ascending: false }),
    supabase.from("finanzierungs_annahmen").select("*").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  const zeilen = ((kennzahlen ?? []) as Array<Record<string, unknown>>).map((k) => ({
    jahr: Number(k["jahr"]), objekte_vermittelt: k["objekte_vermittelt"] == null ? null : Number(k["objekte_vermittelt"]), erzielungsquote: k["erzielungsquote"] == null ? null : Number(k["erzielungsquote"]),
    vermarktungsdauer_schnitt: k["vermarktungsdauer_schnitt"] == null ? null : Number(k["vermarktungsdauer_schnitt"]), google_anzahl: k["google_anzahl"] == null ? null : Number(k["google_anzahl"]), google_schnitt: k["google_schnitt"] == null ? null : Number(k["google_schnitt"]),
    fakten: (k["fakten"] as string[] | null) ?? [], aktiv: Boolean(k["aktiv"]),
  })) as Kennzahl[];
  const fin = finanzierung ? { zinssatz: Number(finanzierung.zinssatz), tilgung: Number(finanzierung.tilgung), eigenkapital_prozent: Number(finanzierung.eigenkapital_prozent), notar_prozent: Number(finanzierung.notar_prozent), grunderwerbsteuer_prozent: Number(finanzierung.grunderwerbsteuer_prozent), hinweis: (finanzierung.hinweis as string | null) ?? null } as Finanzierung : null;
  return (
    <>
      <Seitenkopf titel="Kennzahlen und Finanzierung" beschreibung="Jährlich gepflegte Unternehmenskennzahlen für Wertindikation und Exposé; Annahmen für Finanzierungsbeispiele.">
        <Link href="/einstellungen" className="text-[13px] text-akzent hover:underline">Einstellungen</Link>
      </Seitenkopf>
      <div className="space-y-5">
        <Karte><KarteKopf><KarteTitel>Kennzahlen je Jahr</KarteTitel><KarteBeschreibung>Vermittelte Objekte, Erzielungsquote, Vermarktungsdauer, Bewertungen und Fakten — Angaben liegen in Ihrer Verantwortung.</KarteBeschreibung></KarteKopf><KarteInhalt><KennzahlenFormular zeilen={zeilen} darfAendern={darfAendern} /></KarteInhalt></Karte>
        <Karte><KarteKopf><KarteTitel>Finanzierungsannahmen</KarteTitel><KarteBeschreibung>Unverbindliche Rechenbeispiele; die Konditionen legt die Bank fest.</KarteBeschreibung></KarteKopf><KarteInhalt><FinanzierungFormular werte={fin} darfAendern={darfAendern} /></KarteInhalt></Karte>
      </div>
    </>
  );
}
