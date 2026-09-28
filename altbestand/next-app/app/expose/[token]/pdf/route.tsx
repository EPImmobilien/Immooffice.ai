import { renderToBuffer } from "@react-pdf/renderer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { BILD_BUCKET } from "@/lib/bilder";
import { logoLaden } from "@/lib/expose/logo-laden";
import type { ExposeBild, ExposeBranding, ExposeObjekt } from "@/lib/expose/typen";
import { vorlageFinden } from "@/lib/expose/vorlagen";
import { serverClient } from "@/lib/supabase/server";
import { passwortCookieName } from "@/server/web-expose-oeffentlich";

export const runtime = "nodejs";

/**
 * PDF-Download aus einem oeffentlichen Web-Expose.
 *
 * Nur erreichbar, wenn der Makler den Download ausdruecklich freigegeben hat.
 * Die Pruefung des Tokens laeuft ueber dieselbe Datenbankfunktion wie der
 * Seitenaufruf — Widerruf, Ablauf und Passwortschutz wirken hier genauso.
 *
 * Der Aufruf zaehlt bewusst NICHT in die Statistik: Er ist ein Download, kein
 * Seitenaufruf, und wuerde die Zahl sonst verdoppeln.
 */
export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-z0-9]{16,64}$/.test(token)) {
    return new NextResponse("Nicht gefunden", { status: 404 });
  }

  const kekse = await cookies();
  const passwort = kekse.get(await passwortCookieName(token))?.value ?? null;

  const supabase = await serverClient();
  const { data } = await supabase.rpc("web_expose_oeffnen", {
    p_token: token,
    p_passwort: passwort,
    p_zaehlen: false,
  });

  const antwort = data as {
    zustand?: string;
    download_erlaubt?: boolean;
    objekt?: ExposeObjekt & { objektnummer: string };
    anbieter?: Record<string, string | null>;
    bilder?: { pfad: string; titel: string | null; art: string; mime: string | null; ki_bearbeitet: boolean }[];
  } | null;

  if (antwort?.zustand !== "ok" || !antwort.objekt) {
    // Bewusst 404 statt einer Erklaerung: Ein abgelaufener und ein nie
    // existierender Link sollen sich von aussen nicht unterscheiden lassen.
    return new NextResponse("Nicht gefunden", { status: 404 });
  }

  if (!antwort.download_erlaubt) {
    return new NextResponse("Für dieses Exposé ist kein Download freigegeben.", {
      status: 403,
    });
  }

  const marke = antwort.anbieter ?? {};
  const branding: ExposeBranding = {
    firmenname: marke["firmenname"] || "Immobilienangebot",
    // Auch im oeffentlichen PDF. Der Bucket ist oeffentlich lesbar, das Laden
    // gelingt hier also ohne Anmeldung.
    logo: await logoLaden(supabase, marke["logo_pfad"]),
    farbePrimaer: marke["farbe_primaer"] || "#1B2A47",
    farbeAkzent: marke["farbe_akzent"] || "#B5934F",
    strasse: marke["strasse"] ?? null,
    plz: marke["plz"] ?? null,
    ort: marke["ort"] ?? null,
    telefon: marke["telefon"] ?? null,
    email: marke["email"] ?? null,
    web: marke["web"] ?? null,
    impressum: marke["impressum"] ?? null,
  };

  // Feste Vorlage: Besucher sollen keine Wahl treffen muessen, und die
  // klassische Fassung enthaelt alle Angaben.
  const vorlage = vorlageFinden("klassisch")!;

  const auswahl = (antwort.bilder ?? [])
    .filter((b) => b.mime === "image/jpeg" || b.mime === "image/png")
    .slice(0, vorlage.bilder);

  let puffer: Buffer;
  try {
    const bilder: ExposeBild[] = [];
    for (const bild of auswahl) {
      const { data: datei } = await supabase.storage
        .from(BILD_BUCKET)
        .download(bild.pfad);
      if (!datei) continue;
      bilder.push({
        daten: Buffer.from(await datei.arrayBuffer()),
        format: bild.mime === "image/png" ? "png" : "jpg",
        titel: bild.titel,
        art: bild.art,
        kiBearbeitet: bild.ki_bearbeitet,
      });
    }

    puffer = await renderToBuffer(
      vorlage.bauen({ objekt: antwort.objekt, branding, bilder }),
    );
  } catch (fehler) {
    // Der Fehlertext bleibt unverfaenglich: Diese Seite ist oeffentlich, und
    // Interna gehoeren nicht in eine Antwort an unbekannte Besucher.
    console.error("[Web-Exposé] PDF-Erzeugung fehlgeschlagen", { token, fehler });
    return new NextResponse(
      "Das PDF konnte gerade nicht erzeugt werden. Bitte versuchen Sie es später erneut.",
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(puffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Expose-${antwort.objekt.objektnummer}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
