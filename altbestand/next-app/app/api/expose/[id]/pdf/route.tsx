import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { exposeBilderLaden } from "@/lib/expose/bilder-laden";
import { logoLaden } from "@/lib/expose/logo-laden";
import type { ExposeBranding, ExposeObjekt } from "@/lib/expose/typen";
import { STANDARDVORLAGE, vorlageFinden } from "@/lib/expose/vorlagen";
import { serverClient } from "@/lib/supabase/server";

// @react-pdf/renderer benoetigt Node-APIs; die Edge-Laufzeit reicht nicht.
export const runtime = "nodejs";

/**
 * PDF-Export eines Exposés in einer der fuenf Vorlagen (Abschnitt 8).
 *
 * Kostet KEINE Credits (Abschnitt 8 und 14): Nur die KI-Erstellung ist
 * kostenpflichtig, der Export bestehender Inhalte beliebig oft kostenfrei.
 * Auch der Wechsel der Vorlage ist deshalb frei — er erzeugt keinen neuen
 * Inhalt, sondern setzt vorhandenen anders.
 */
export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sitzung = await sitzungLaden();
  if (!sitzung) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }
  rechtErzwingen(sitzung.rolle, "exposes", "lesen", sitzung.uebersteuerung);

  const gewuenscht =
    new URL(anfrage.url).searchParams.get("vorlage") ?? STANDARDVORLAGE;
  const vorlage = vorlageFinden(gewuenscht);
  if (!vorlage) {
    return NextResponse.json(
      { fehler: "Unbekannte Vorlage." },
      { status: 400 },
    );
  }

  const supabase = await serverClient();

  // RLS beschraenkt bereits auf den eigenen Mandanten; der zusaetzliche Filter
  // schuetzt auch bei einer fehlerhaften Policy.
  const { data: objekt } = await supabase
    .from("objekte")
    .select("*")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .is("geloescht_am", null)
    .maybeSingle();

  if (!objekt) {
    return NextResponse.json({ fehler: "Objekt nicht gefunden." }, { status: 404 });
  }

  const { data: branding } = await supabase
    .from("mandant_branding")
    .select("*")
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  const marke: ExposeBranding = {
    firmenname: branding?.firmenname || sitzung.mandantName,
    logo: await logoLaden(supabase, branding?.logo_pfad),
    // Vorbelegung mit der Plattformfarbwelt, solange der Mandant nichts
    // hinterlegt hat (Abschnitt 5).
    farbePrimaer: branding?.farbe_primaer || "#1B2A47",
    farbeAkzent: branding?.farbe_akzent || "#B5934F",
    strasse: branding?.strasse ?? null,
    plz: branding?.plz ?? null,
    ort: branding?.ort ?? null,
    telefon: branding?.telefon ?? null,
    email: branding?.email ?? null,
    web: branding?.web ?? null,
    impressum: branding?.impressum ?? null,
  };

  // Bilder und Erzeugung getrennt abgesichert, aber mit einer Antwort: Ohne
  // diese Behandlung schlug ein Fehler als allgemeine Serverfehlerseite durch —
  // der Download blieb ohne Erklaerung leer, und in welchem Schritt es klemmte,
  // war von aussen nicht zu erkennen.
  let puffer: Buffer;
  try {
    const bilder = await exposeBilderLaden(supabase, id, vorlage.bilder);
    puffer = await renderToBuffer(
      vorlage.bauen({ objekt: objekt as ExposeObjekt, branding: marke, bilder }),
    );
  } catch (fehler) {
    console.error("[Exposé] PDF-Erzeugung fehlgeschlagen", {
      objekt: id,
      vorlage: vorlage.schluessel,
      fehler,
    });
    return NextResponse.json(
      {
        fehler:
          "Das PDF konnte nicht erzeugt werden. Bitte versuchen Sie es erneut — " +
          "bleibt es dabei, ist der Fehler im Server-Protokoll vermerkt.",
      },
      { status: 500 },
    );
  }

  const dateiname = `Expose-${objekt.objektnummer}-${vorlage.schluessel}.pdf`;

  return new NextResponse(new Uint8Array(puffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${dateiname}"`,
      "Cache-Control": "no-store",
    },
  });
}
