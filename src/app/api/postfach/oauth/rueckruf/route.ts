import { NextResponse } from "next/server";

import { verschluesseln } from "@/integrationen/kern/zugangsdaten";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { abrufAnstossen } from "@/lib/postfach/anstossen";
import { codeEintauschen, fehlerText, kontoAdresse, oauthKonfig, statePruefen } from "@/lib/postfach/oauth";
import type { OAuthZugang } from "@/lib/postfach/typen";
import { serverClient } from "@/lib/supabase/server";

/**
 * Rueckruf nach der Anmeldung bei Microsoft oder Google (docs/AUTONOMIE.md P2).
 *
 * Der signierte Zustand bindet den Rueckruf an Benutzer und Mandant der
 * Sitzung; Tokens werden verschluesselt gespeichert und nie ausgegeben.
 * Redirect-URI beim Anbieter: <NEXT_PUBLIC_APP_URL>/api/postfach/oauth/rueckruf
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const basis = (process.env["NEXT_PUBLIC_APP_URL"] ?? url.origin).replace(/\/+$/, "");
  const zurueck = (fehler?: string) =>
    NextResponse.redirect(
      `${basis}/einstellungen/postfaecher?${fehler ? `fehler=${encodeURIComponent(fehler)}` : "verbunden=1"}`,
    );

  if (url.searchParams.get("error")) return zurueck("Die Anmeldung beim Anbieter wurde abgebrochen.");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return zurueck("Der Rückruf des Anbieters ist unvollständig.");

  const absicht = statePruefen(state);
  if (!absicht) return zurueck("Die Anmeldung ist abgelaufen oder ungültig. Bitte erneut verbinden.");

  const sitzung = await sitzungLaden();
  if (!sitzung || sitzung.benutzerId !== absicht.benutzerId || sitzung.mandantId !== absicht.mandantId) {
    return zurueck("Die Anmeldung gehört zu einer anderen Sitzung. Bitte erneut verbinden.");
  }

  const konfig = oauthKonfig(absicht.art);
  if (!konfig) return zurueck("Dieser Anbieter ist nicht eingerichtet.");

  try {
    const tokens = await codeEintauschen(konfig, code, `${basis}/api/postfach/oauth/rueckruf`);
    if (!tokens.refreshToken) {
      return zurueck("Der Anbieter hat kein dauerhaftes Zugriffsrecht erteilt. Bitte beim Verbinden den Zugriff bestätigen.");
    }
    const adresse = await kontoAdresse(absicht.art, tokens.accessToken);
    if (!adresse) return zurueck("Die Adresse des Kontos konnte nicht gelesen werden.");

    const zugang: OAuthZugang = {
      art: absicht.art,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      gueltigBis: tokens.gueltigBis,
    };

    const supabase = await serverClient();
    const { data, error } = await supabase
      .from("postfaecher")
      .insert({
        mandant_id: sitzung.mandantId,
        benutzer_id: absicht.unternehmen ? null : sitzung.benutzerId,
        anbieter: absicht.art,
        adresse: adresse.toLowerCase(),
        zugangsdaten: verschluesseln(JSON.stringify(zugang), sitzung.mandantId),
        status: "aktiv",
        erstellt_von: sitzung.benutzerId,
      })
      .select("id")
      .single();
    if (error || !data) {
      return zurueck(
        error?.code === "23505"
          ? "Dieses Postfach ist bereits verbunden."
          : "Das Postfach konnte nicht gespeichert werden. Fehlen Rechte oder der Verschlüsselungsschlüssel?",
      );
    }

    await abrufAnstossen(supabase, data.id as string, `oauth-${sitzung.benutzerId.slice(0, 8)}`);
    return zurueck();
  } catch (e) {
    return zurueck(fehlerText(e));
  }
}
