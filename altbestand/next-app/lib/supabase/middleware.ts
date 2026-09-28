import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { supabaseUmgebung } from "./umgebung";

/**
 * Routen, die ohne Anmeldung erreichbar sind.
 *
 * `/passwort-vergessen` muss hier stehen — wer sein Passwort vergessen hat, ist
 * gerade NICHT angemeldet. Ohne den Eintrag landet er auf der Anmeldeseite und
 * damit in einer Schleife.
 *
 * `/auth` ist der Ruecklaeufer aller Mail-Links: Bestaetigung, Einladung,
 * Passwort neu. Er wird ebenfalls ohne Sitzung aufgerufen — die Sitzung entsteht
 * ja erst dort.
 *
 * `/passwort-neu` steht bewusst NICHT hier. Diese Seite ist nur mit der Sitzung
 * erreichbar, die der Wiederherstellungslink erzeugt hat — das ist der Nachweis,
 * dass der Aufrufer Zugriff auf das Postfach hat.
 */
const OEFFENTLICH = [
  "/",
  "/anmelden",
  "/registrieren",
  "/passwort-vergessen",
  "/auth",
  "/styleguide",
  "/expose",
  // Der Unterschriftslink geht an die Gegenseite. Ohne Eintrag hier landet ein
  // Vertragspartner auf der Anmeldung eines Programms, das er nicht benutzt.
  "/vertrag",
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
