import type { Metadata } from "next";
import Link from "next/link";

import { AbsenderVerwaltung } from "@/components/rechnungen/AbsenderVerwaltung";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { nummerVorschau, type Absender } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rechnungsabsender" };

export default async function AbsenderSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: roh }, { data: benutzer }] = await Promise.all([
    supabase.from("rechnungs_absender").select("*").order("typ").order("sortierung").order("erstellt_am"),
    supabase.from("benutzer").select("id, name").eq("mandant_id", sitzung.mandantId).order("name"),
  ]);
  const absender = (roh ?? []).map((a) => ({ ...a, naechste_nummer: Number(a.naechste_nummer), zahlungsziel_tage: Number(a.zahlungsziel_tage), standard_mwst: Number(a.standard_mwst) })) as unknown as Absender[];
  const infos = await Promise.all(absender.map(async (a) => {
    const { data } = await supabase.rpc("rechnung_startnummer_info", { p_absender: a.id });
    const i = (data ?? {}) as { gestellt?: number; editierbar?: boolean };
    return [a.id, { gestellt: i.gestellt ?? 0, editierbar: i.editierbar ?? true, naechste: nummerVorschau(a) }] as const;
  }));

  return (
    <>
      <Seitenkopf titel="Rechnungsabsender" beschreibung="Firmen- und persönliche Absender mit eigenem Nummernkreis, Steuerangaben und Bankverbindung.">
        <Link href="/rechnungen" className="text-[13px] text-akzent hover:underline">Zu den Rechnungen</Link>
      </Seitenkopf>
      <AbsenderVerwaltung
        absender={absender}
        info={Object.fromEntries(infos)}
        benutzer={(benutzer ?? []).map((b) => ({ id: b.id as string, name: b.name as string }))}
        darfAendern={hatRecht(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung)}
        darfLoeschen={hatRecht(sitzung.rolle, "rechnungen", "loeschen", sitzung.uebersteuerung)}
      />
    </>
  );
}
