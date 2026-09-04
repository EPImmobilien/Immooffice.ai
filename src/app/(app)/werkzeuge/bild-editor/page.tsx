import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { BildEditor } from "@/components/werkzeuge/BildEditor";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { BILD_BUCKET } from "@/lib/bilder";
import { bildKiVerfuegbar } from "@/lib/ki/bild";
import { markeUrl } from "@/lib/marke";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bild-Editor" };

export default async function BildEditorSeite({ searchParams }: { searchParams: Promise<{ objekt?: string; bild?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const objektId = p.objekt && /^[0-9a-f-]{36}$/.test(p.objekt) ? p.objekt : null;
  const [{ data: objekte }, { data: bilder }, { data: branding }] = await Promise.all([
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    objektId ? supabase.from("objekt_bilder").select("id, pfad, titel, art, original_id, bearbeitung, ki_bearbeitet").eq("objekt_id", objektId).order("reihenfolge") : Promise.resolve({ data: [] }),
    supabase.from("mandant_branding").select("logo_pfad").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  const liste = (bilder ?? []) as Array<{ id: string; pfad: string; titel: string | null; art: string; original_id: string | null; bearbeitung: string | null; ki_bearbeitet: boolean }>;
  const verweise = new Map<string, string>();
  if (liste.length > 0) {
    const { data: signiert } = await supabase.storage.from(BILD_BUCKET).createSignedUrls(liste.map((b) => b.pfad), 60 * 30);
    for (const e of signiert ?? []) if (e.signedUrl && e.path) verweise.set(e.path, e.signedUrl);
  }
  const logoUrl = branding?.logo_pfad ? markeUrl(process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "", branding.logo_pfad as string) : null;
  return (
    <>
      <Seitenkopf titel="Bild-Editor" beschreibung="Zuschneiden, Größe, Drehen, Korrekturen, Weichzeichnen/Verpixeln, Text und Logo, RAW-Entwicklung — KI-Bearbeitung als gekennzeichnete Version.">
        <Link href="/werkzeuge" className="text-[13px] text-akzent hover:underline">Alle Werkzeuge</Link>
      </Seitenkopf>
      <BildEditor
        objekte={(objekte ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}` }))}
        objektId={objektId}
        bilder={liste.map((b) => ({ id: b.id, url: verweise.get(b.pfad) ?? "", titel: b.titel, art: b.art, original_id: b.original_id, bearbeitung: b.bearbeitung, ki_bearbeitet: b.ki_bearbeitet }))}
        startBildId={p.bild && /^[0-9a-f-]{36}$/.test(p.bild) ? p.bild : null}
        logoUrl={logoUrl}
        kiVerfuegbar={bildKiVerfuegbar()}
        darfAendern={hatRecht(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung)}
      />
    </>
  );
}
