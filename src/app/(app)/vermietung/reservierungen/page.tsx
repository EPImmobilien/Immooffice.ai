import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Reservierungen } from "@/components/vermietung/Reservierungen";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { RESERVIERUNG_STATUS, type ReservierungStatus, type ReservierungZeile } from "@/lib/vermietung/reservierungen";

export const metadata: Metadata = { title: "Reservierungen" };

export default async function ReservierungenSeite({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  let abfrage = supabase.from("reservierungen").select("id, status, reserviert_bis, gebuehr, gebuehr_anrechenbar, gebuehr_bezahlt_am, notizen, aufhebungsgrund, erstellt_am, vertrag_id, objekt:objekte(id, objektnummer, bezeichnung, status), kontakt:kontakte(id, vorname, nachname, firma)").order("erstellt_am", { ascending: false }).limit(300);
  if (p.status && p.status in RESERVIERUNG_STATUS) abfrage = abfrage.eq("status", p.status);
  const [{ data: liste }, { data: objekte }, { data: kontakte }] = await Promise.all([
    abfrage,
    supabase.from("objekte").select("id, objektnummer, bezeichnung, status").is("geloescht_am", null).in("status", ["vorbereitung", "aktiv", "reserviert"]).order("objektnummer").limit(300),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
  ]);

  return (
    <>
      <Seitenkopf titel="Reservierungen" beschreibung="Objekt für einen Interessenten sperren, Reservierungsvereinbarung erzeugen, Objektstatus folgt automatisch.">
        <Link href="/vermietung" className="text-[13px] text-akzent hover:underline">Zur Vermietung</Link>
      </Seitenkopf>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/vermietung/reservierungen" className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${!p.status ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Alle</Link>
        {(Object.keys(RESERVIERUNG_STATUS) as ReservierungStatus[]).map((s) => (
          <Link key={s} href={`/vermietung/reservierungen?status=${s}`} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${p.status === s ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{RESERVIERUNG_STATUS[s]}</Link>
        ))}
      </div>
      <Reservierungen
        heute={new Date().toISOString().slice(0, 10)}
        zeilen={(liste ?? []) as unknown as ReservierungZeile[]}
        objekte={(objekte ?? []) as { id: string; objektnummer: string; bezeichnung: string; status: string }[]}
        kontakte={((kontakte ?? []) as { id: string; vorname: string | null; nachname: string | null; firma: string | null }[]).map((k) => ({ id: k.id, name: [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Kontakt" }))}
        darfAnlegen={hatRecht(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung)}
        darfAendern={hatRecht(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung)}
      />
    </>
  );
}
