import { NextResponse } from "next/server";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { exportMoeglich, exportPruefen } from "@/lib/openimmo/pruefung";
import type { Ausstattungsmerkmal, OpenImmoObjekt } from "@/lib/openimmo/typen";
import { openImmoXml } from "@/lib/openimmo/xml";
import { serverClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * OpenImmo-Export eines Objekts als XML.
 *
 * Der produktive Uebertragungsweg zu den Portalen folgt in Phase 2
 * (OPENIMMO_MAPPING.md, Abschnitt 14). Hier entsteht bereits das
 * schema-orientierte Dokument, damit es gegen die offizielle XSD und gegen die
 * Portale geprueft werden kann.
 */
export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sitzung = await sitzungLaden();
  if (!sitzung) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }
  rechtErzwingen(sitzung.rolle, "objekte", "lesen");

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

  const xml = openImmoXml({
    objekte: [
      {
        objekt: objekt as OpenImmoObjekt,
        ausstattung: (merkmale ?? []) as Ausstattungsmerkmal[],
        modus,
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

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="openimmo-${objekt.objektnummer}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
