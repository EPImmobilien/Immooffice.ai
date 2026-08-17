import { NextResponse } from "next/server";

import { sicheresZiel } from "@/lib/auth/ziel";
import { serverClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Ruecklaeufer aller Auth-Links: E-Mail-Bestaetigung, Einladung, Passwort neu.
 *
 * Bis hierher gab es diese Route nicht. Ein Bestaetigungslink landete deshalb
 * auf einer Seite, die die mitgeschickten Merkmale nicht auswerten konnte —
 * serverseitig sind sie ueber ein Adressfragment ohnehin nicht erreichbar.
 *
 * Zwei Wege werden angenommen, weil Supabase je nach Vorlage den einen oder den
 * anderen schickt:
 *   `code`       — der uebliche Weg; wird gegen eine Sitzung getauscht
 *   `token_hash` — bei angepasster Mailvorlage; wird direkt geprueft
 */

export async function GET(anfrage: Request) {
  const adresse = new URL(anfrage.url);
  const code = adresse.searchParams.get("code");
  const tokenHash = adresse.searchParams.get("token_hash");
  const typ = adresse.searchParams.get("type");

  // Das Ziel kommt aus der Adresszeile. Ohne Pruefung waere diese Route eine
  // offene Weiterleitung — ein Link, der auf der eigenen Adresse beginnt und auf
  // einer fremden endet.
  const ziel = sicheresZiel(adresse.searchParams.get("next"));

  const supabase = await serverClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(ziel, adresse.origin));
  } else if (tokenHash && typ) {
    const { error } = await supabase.auth.verifyOtp({
      type: typ as "recovery" | "email" | "invite" | "email_change",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(ziel, adresse.origin));
  }

  // Bewusst dieselbe Meldung fuer jeden Fehlschlag. Ob ein Link abgelaufen ist,
  // schon benutzt wurde oder nie existierte, ist fuer den Nutzer dieselbe
  // Handlung — und die Unterscheidung waere eine Auskunft ueber fremde Konten.
  return NextResponse.redirect(
    new URL("/anmelden?fehler=link", adresse.origin),
  );
}
