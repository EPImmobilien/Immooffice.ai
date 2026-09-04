import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TerminDetail } from "@/components/kalender/TerminDetail";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { TERMIN_FELDER, type KalenderTermin, type Mitarbeiter } from "@/lib/kalender/typen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Termin" };

export default async function TerminSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: t }, { data: benutzer }, { data: objekte }, { data: kontakte }, { data: ich }] = await Promise.all([
    supabase.from("termine").select(TERMIN_FELDER).eq("id", id).is("geloescht_am", null).maybeSingle(),
    supabase.from("benutzer").select("id, name, kalender_farbe").eq("mandant_id", sitzung.mandantId).eq("aktiv", true).order("name"),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("kontakte").select("id, vorname, nachname, firma, email").is("geloescht_am", null).order("nachname").limit(500),
    supabase.from("benutzer").select("besichtigung_dauer_min, fahrzeit_aktiv").eq("id", sitzung.benutzerId).maybeSingle(),
  ]);
  if (!t) notFound();
  const termin = t as unknown as KalenderTermin;
  const mitarbeiter: Mitarbeiter[] = (benutzer ?? []).map((b) => ({ id: b.id as string, name: b.name as string, farbe: (b.kalender_farbe as string | null) ?? null }));
  return (
    <>
      <Seitenkopf titel={termin.titel} beschreibung={[termin.objekt ? `${termin.objekt.objektnummer} ${termin.objekt.bezeichnung}` : null, termin.kontakt ? [termin.kontakt.vorname, termin.kontakt.nachname].filter(Boolean).join(" ") : null, mitarbeiter.find((m) => m.id === termin.zustaendig_id)?.name ?? null].filter(Boolean).join(" · ") || "Termin"}>
        <Link href="/kalender" className="text-[13px] text-akzent hover:underline">Zum Kalender</Link>
      </Seitenkopf>
      <TerminDetail
        key={`${id}-${termin.abgesagt_am ?? ""}-${termin.bestaetigt_am ?? ""}`}
        termin={termin}
        mitarbeiter={mitarbeiter}
        objekte={(objekte ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}` }))}
        kontakte={(kontakte ?? []).map((k) => ({ id: k.id as string, bezeichnung: [k.vorname, k.nachname].filter(Boolean).join(" ") + (k.firma ? ` (${k.firma as string})` : ""), email: (k.email as string | null) ?? null }))}
        benutzerId={sitzung.benutzerId}
        standardDauer={Number(ich?.besichtigung_dauer_min ?? 60)}
        darfAendern={hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung)}
        fahrzeitAktiv={ich?.fahrzeit_aktiv !== false}
      />
    </>
  );
}
