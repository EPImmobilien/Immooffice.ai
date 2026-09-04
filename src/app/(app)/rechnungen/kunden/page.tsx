import type { Metadata } from "next";
import Link from "next/link";

import { KundenVerwaltung } from "@/components/rechnungen/KundenVerwaltung";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import type { Kunde } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rechnungskunden" };

export default async function KundenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: kunden }, { data: rechnungen }, { data: kontakte }] = await Promise.all([
    supabase.from("rechnungskunden").select("id, kontakt_id, anrede, name, zusatz, strasse, plz, ort, land, email, ust_id").order("name").limit(1000),
    supabase.from("rechnungen").select("kunde_id").not("kunde_id", "is", null).limit(5000),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
  ]);
  const anzahl = new Map<string, number>();
  for (const r of rechnungen ?? []) anzahl.set(r.kunde_id as string, (anzahl.get(r.kunde_id as string) ?? 0) + 1);
  return (
    <>
      <Seitenkopf titel="Rechnungskunden" beschreibung="Rechnungsanschriften — unabhängig vom Kontaktstamm, damit Rechnungen an Firmen, Hausverwaltungen oder Erbengemeinschaften gehen können.">
        <Link href="/rechnungen" className="text-[13px] text-akzent hover:underline">Zu den Rechnungen</Link>
      </Seitenkopf>
      <KundenVerwaltung
        kunden={((kunden ?? []) as unknown as Kunde[]).map((k) => ({ ...k, anzahl: anzahl.get(k.id) ?? 0 }))}
        kontakte={(kontakte ?? []).map((k) => ({ id: k.id as string, bezeichnung: [k.vorname, k.nachname].filter(Boolean).join(" ") + (k.firma ? ` (${k.firma as string})` : "") }))}
        darfAendern={hatRecht(sitzung.rolle, "rechnungen", "anlegen", sitzung.uebersteuerung)}
        darfLoeschen={hatRecht(sitzung.rolle, "rechnungen", "loeschen", sitzung.uebersteuerung)}
      />
    </>
  );
}
