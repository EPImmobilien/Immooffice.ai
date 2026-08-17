import { NextResponse } from "next/server";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { euro, flaeche, zahl } from "@/lib/format";
import { formatFinden, motivSvg, type MarketingInhalt } from "@/lib/marketing/vorlagen";
import { OBJEKTKATEGORIEN, istMiete } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Marketingmotiv als SVG.
 *
 * Kostet keine Credits: Das Layout entsteht deterministisch aus vorhandenen
 * Daten. Kostenpflichtig sind allein KI-Texte und KI-Bilder (Abschnitt 14).
 */
export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ objektId: string; format: string }> },
) {
  const { objektId, format: formatSchluessel } = await params;

  const sitzung = await sitzungLaden();
  if (!sitzung) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }
  rechtErzwingen(sitzung.rolle, "marketing", "lesen", sitzung.uebersteuerung);

  const format = formatFinden(formatSchluessel);
  if (!format) {
    return NextResponse.json({ fehler: "Unbekanntes Format." }, { status: 404 });
  }

  const supabase = await serverClient();
  const { data: objekt } = await supabase
    .from("objekte")
    .select("*")
    .eq("id", objektId)
    .eq("mandant_id", sitzung.mandantId)
    .is("geloescht_am", null)
    .maybeSingle();

  if (!objekt) {
    return NextResponse.json({ fehler: "Objekt nicht gefunden." }, { status: 404 });
  }

  const { data: branding } = await supabase
    .from("mandant_branding")
    .select("firmenname, farbe_primaer, farbe_akzent, telefon, web")
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();

  const miete = istMiete(objekt.vermarktungsart);

  const eckdaten: MarketingInhalt["eckdaten"] = [];
  if (objekt.wohnflaeche !== null) {
    eckdaten.push({ bezeichnung: "Wohnfläche", wert: flaeche(objekt.wohnflaeche) });
  } else if (objekt.nutzflaeche !== null) {
    eckdaten.push({ bezeichnung: "Nutzfläche", wert: flaeche(objekt.nutzflaeche) });
  }
  if (objekt.zimmer !== null) {
    eckdaten.push({ bezeichnung: "Zimmer", wert: zahl(objekt.zimmer) });
  }
  if (objekt.grundstuecksflaeche !== null) {
    eckdaten.push({ bezeichnung: "Grundstück", wert: flaeche(objekt.grundstuecksflaeche) });
  }
  if (objekt.baujahr !== null) {
    eckdaten.push({ bezeichnung: "Baujahr", wert: String(objekt.baujahr) });
  }

  const inhalt: MarketingInhalt = {
    kopfzeile: miete ? "Zu vermieten" : "Zu verkaufen",
    titel: objekt.titel || objekt.bezeichnung,
    ort:
      [objekt.plz, objekt.ort].filter(Boolean).join(" ") ||
      (OBJEKTKATEGORIEN[objekt.objektkategorie as keyof typeof OBJEKTKATEGORIEN] ?? ""),
    eckdaten,
    preis: miete ? `${euro(objekt.kaltmiete)}` : euro(objekt.kaufpreis),
    preisLabel: miete ? "Kaltmiete monatlich" : "Kaufpreis",
    firmenname: branding?.firmenname || sitzung.mandantName,
    kontakt: branding?.telefon || branding?.web || "",
    farbePrimaer: branding?.farbe_primaer || "#1B2A47",
    farbeAkzent: branding?.farbe_akzent || "#B5934F",
    // Kennzeichnung bleibt auch im Marketingmaterial erhalten (Abschnitt 10).
    ...(objekt.texte_ki_erzeugt ? { kiHinweis: "Text KI-erzeugt" } : {}),
  };

  const svg = motivSvg(format, inhalt);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
