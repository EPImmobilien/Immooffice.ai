import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { supabaseUmgebung } from "./umgebung";

/** Routen, die ohne Anmeldung erreichbar sind. */
const OEFFENTLICH = [
  "/",
  "/anmelden",
  "/registrieren",
  "/styleguide",
  "/expose",
  // Eine Einladung wird angesehen, bevor ein Konto besteht. Die Seite selbst
  // gibt nur preis, wer den Token kennt.
  "/einladung",
];

function istOeffentlich(pfad: string): boolean {
  return OEFFENTLICH.some(
    (route) => pfad === route || pfad.startsWith(`${route}/`),
  );
}

/**
 * Frischt die Sitzung auf und schuetzt den angemeldeten Bereich.
 *
 * Wichtig: Zwischen dem Erzeugen des Clients und `getUser()` darf keine
 * weitere Logik stehen. Sonst laeuft das Auffrischen des Tokens ins Leere und
 * Benutzer werden scheinbar zufaellig abgemeldet.
 */
export async function sitzungAktualisieren(
  request: NextRequest,
  antwort: NextResponse,
): Promise<NextResponse> {
  const { url, anonKey } = supabaseUmgebung();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(zuSetzen) {
        for (const { name, value, options } of zuSetzen) {
          antwort.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pfad = request.nextUrl.pathname;

  if (!user && !istOeffentlich(pfad)) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/anmelden";
    // Nach der Anmeldung zurueck zur urspruenglich gewuenschten Seite.
    ziel.searchParams.set("weiter", pfad);
    return NextResponse.redirect(ziel);
  }

  // Angemeldete Nutzer haben auf den Anmeldeseiten nichts verloren.
  if (user && (pfad === "/anmelden" || pfad === "/registrieren")) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/dashboard";
    ziel.search = "";
    return NextResponse.redirect(ziel);
  }

  return antwort;
}
