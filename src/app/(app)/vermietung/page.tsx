import type { Metadata } from "next";
import Link from "next/link";

import { Kachel } from "@/components/Kachel";
import { Seitenkopf } from "@/components/Seitenkopf";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Vermietung" };

/** Vermietung — Mietanfragen, Mietvertraege, Reservierungen, Uebergaben (Referenz-Kachel 7). */
export default async function VermietungSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [anfragen, neu, mietvertraege, reservierungen, uebergaben] = await Promise.all([
    supabase.from("mietanfragen").select("id", { count: "exact", head: true }),
    supabase.from("mietanfragen").select("id", { count: "exact", head: true }).eq("status", "neu"),
    supabase.from("mietvertraege").select("id", { count: "exact", head: true }),
    supabase.from("reservierungen").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
    supabase.from("uebergabeprotokolle").select("id", { count: "exact", head: true }).eq("kontext", "vermietung"),
  ]);

  return (
    <>
      <Seitenkopf titel="Vermietung" beschreibung="Mietanfragen mit Antwortvorlagen, Selbstauskunft, Mietverträge mit Unterschrift, Reservierungen und Übergaben." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kachel daten={{ titel: "Mietanfragen", hinweis: "Aus Portalen, dem Web-Exposé und dem Selbstauskunft-Formular — mit Bewertung und Antwortvorlagen", pfad: "/vermietung/anfragen", zahl: neu.count ?? 0, zahlHinweis: `neu von ${anfragen.count ?? 0}`, symbol: "kontakte" }} />
        <Kachel daten={{ titel: "Mietverträge", hinweis: "Wohnraummietvertrag aus Vorlage, Neubau-Klausel, PDF und Word, Unterschrift über den Signaturlink", pfad: "/vermietung/mietvertraege", zahl: mietvertraege.count ?? 0, zahlHinweis: "Verträge", symbol: "vertraege" }} />
        <Kachel daten={{ titel: "Reservierungen", hinweis: "Bestand reservieren, Vereinbarung erzeugen, Objektstatus folgt automatisch", pfad: "/vermietung/reservierungen", zahl: reservierungen.count ?? 0, zahlHinweis: "aktiv", symbol: "objekte" }} />
        <Kachel daten={{ titel: "Übergaben", hinweis: "Einzug und Auszug mit Zählerständen, Schlüsseln und Unterschriften", pfad: "/uebergaben", zahl: uebergaben.count ?? 0, zahlHinweis: "Protokolle", symbol: "aufgaben" }} />
      </div>
      <p className="mt-6 text-[12px] text-gedaempft">
        Selbstauskunft-Links und Antwortvorlagen verwalten Sie unter <Link href="/vermietung/anfragen" className="text-akzent hover:underline">Mietanfragen</Link>.
      </p>
    </>
  );
}
