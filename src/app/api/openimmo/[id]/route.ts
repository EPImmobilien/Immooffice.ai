import { NextResponse } from "next/server";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { openImmoAnhaengeLaden } from "@/lib/openimmo/anhaenge-laden";
import { exportMoeglich, exportPruefen } from "@/lib/openimmo/pruefung";
import type { Ausstattungsmerkmal, OpenImmoObjekt } from "@/lib/openimmo/typen";
import { openImmoXml } from "@/lib/openimmo/xml";
import { zipPacken } from "@/lib/openimmo/zip";
import { serverClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * OpenImmo-Export eines Objekts.
 *
 * Ohne Parameter entsteht das reine XML zur Pruefung. Mit `?paket=1` entsteht
 * das Uebertragungspaket: dasselbe XML samt Bilddateien in einem ZIP-Archiv —
 * so, wie die Portale es erwarten. Der produktive Uebertragungsweg folgt in
 * Phase 2 (OPENIMMO_MAPPING.md, Abschnitt 14).
 */
export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const alsPaket = new URL(anfrage.url).searchParams.get("paket") === "1";

  const sitzung = await sitzungLaden();
  if (!sitzung) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }
  rechtErzwingen(sitzung, "objekte", "lesen");

  const supabase = await serverClient();

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

  // Der Export wird blockiert, solange Pflichtangaben fehlen. Eine Ablehnung
  // durch das Portal ist fuer den Makler deutlich muehsamer als ein Hinweis.
  const befunde = exportPruefen(objekt as OpenImmoObjekt);
  if (!exportMoeglich(befunde)) {
    return NextResponse.json(
      {
        fehler: "Der Export ist noch nicht möglich.",
        befunde: befunde.filter((b) => b.schwere === "fehler"),
      },
      { status: 422 },
    );
  }

  const [{ data: branding }, { data: zugang }, { data: merkmale }, { data: veroeff }] =
    await Promise.all([
      supabase
        .from("mandant_branding")
        .select("firmenname, email, telefon")
        .eq("mandant_id", sitzung.mandantId)
        .maybeSingle(),
      supabase
        .from("portal_zugang")
        .select("anbieternummer, openimmo_anid")
        .eq("mandant_id", sitzung.mandantId)
        .eq("kanal", "immoscout24")
        .maybeSingle(),
      supabase
        .from("objekt_ausstattung")
        .select("merkmal, wert")
        .eq("objekt_id", id),
      supabase
        .from("objekt_veroeffentlichung")
        .select("uebertragungen")
        .eq("objekt_id", id)
        .eq("kanal", "immoscout24")
        .maybeSingle(),
    ]);

  // Erstuebertragung meldet NEU, jede weitere CHANGE.
  const modus = (veroeff?.uebertragungen ?? 0) > 0 ? "CHANGE" : "NEU";

  // Ohne Paket wuerden die Anhaenge auf Dateien verweisen, die nicht
  // mitgeliefert werden. Sie stehen deshalb nur im Paket im XML.
  const paket = alsPaket
    ? await openImmoAnhaengeLaden(supabase, id, objekt.objektnummer)
    : null;

  const xml = openImmoXml({
    objekte: [
      {
        objekt: objekt as OpenImmoObjekt,
        ausstattung: (merkmale ?? []) as Ausstattungsmerkmal[],
        modus,
        ...(paket ? { anhaenge: paket.anhaenge } : {}),
      },
    ],
    anbieter: {
      firmenname: branding?.firmenname || sitzung.mandantName,
      anbieternummer: zugang?.anbieternummer ?? null,
      openimmoAnid: zugang?.openimmo_anid ?? null,
      email: branding?.email ?? null,
      telefon: branding?.telefon ?? null,
      ansprechpartner: sitzung.name,
    },
    zeitstempel: new Date().toISOString().slice(0, 19),
  });

  if (!paket) {
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="openimmo-${objekt.objektnummer}.xml"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Der Zeitstempel wird einmal gebildet und fuer XML wie Archiv verwendet,
  // damit beide zusammenpassen.
  const archiv = zipPacken(
    [
      { name: `openimmo-${objekt.objektnummer}.xml`, daten: Buffer.from(xml, "utf8") },
      ...paket.dateien,
    ],
    new Date(),
  );

  return new NextResponse(new Uint8Array(archiv), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="openimmo-${objekt.objektnummer}.zip"`,
      "Cache-Control": "no-store",
      // Damit die Oberflaeche melden kann, dass etwas fehlt, statt es zu
      // verschweigen.
      "X-Anhaenge": String(paket.anhaenge.length),
      "X-Anhaenge-Ausgelassen": String(paket.ausgelassen),
    },
  });
}
