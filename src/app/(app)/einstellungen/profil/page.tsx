import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { ProfilFormular } from "@/components/verwaltung/ProfilFormular";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { markeUrl } from "@/lib/marke";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mein Profil" };

/** Eigenes Profil (Referenz: Admin → Profil). */
export default async function ProfilSeite() {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  const { data: b } = await supabase.from("benutzer").select("name, titel, funktion, telefon, email, bundesland, foto_pfad, signatur_pfad, eintritt, urlaubstage_jahr").eq("id", sitzung.benutzerId).maybeSingle();
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
  return (
    <>
      <Seitenkopf titel="Mein Profil" beschreibung="Name, Titel, Funktion, Telefon, Profilfoto und Signaturbild — so erscheinen Sie in Signaturen, Dokumenten und im Kundenbereich.">
        <Link href="/einstellungen" className="text-[13px] text-akzent hover:underline">Einstellungen</Link>
      </Seitenkopf>
      <Karte>
        <KarteKopf><KarteTitel>Profil</KarteTitel><KarteBeschreibung>Passwort und Anmeldung ändern Sie über „Passwort vergessen“ auf der Anmeldeseite; Postfächer unter Einstellungen → Postfächer.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          <ProfilFormular werte={{
            name: (b?.name as string) ?? sitzung.name, titel: (b?.titel as string | null) ?? null, funktion: (b?.funktion as string | null) ?? null, telefon: (b?.telefon as string | null) ?? null,
            email: (b?.email as string) ?? sitzung.email, bundesland: (b?.bundesland as string | null) ?? null,
            fotoUrl: b?.foto_pfad ? markeUrl(url, b.foto_pfad as string) : null, signaturUrl: b?.signatur_pfad ? markeUrl(url, b.signatur_pfad as string) : null,
            eintritt: (b?.eintritt as string | null) ?? null, urlaubstage_jahr: Number(b?.urlaubstage_jahr ?? 30),
          }} />
        </KarteInhalt>
      </Karte>
    </>
  );
}
