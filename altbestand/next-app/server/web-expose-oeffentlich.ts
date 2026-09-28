"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { serverClient } from "@/lib/supabase/server";

/**
 * Server-Aktionen des oeffentlichen Web-Exposes.
 *
 * Alles hier laeuft ohne Anmeldung. Die Pruefung liegt vollstaendig in der
 * Datenbank: `web_expose_oeffnen` und `web_expose_anfrage_senden` entscheiden,
 * ob der Token gilt, ob er widerrufen oder abgelaufen ist und ob das Passwort
 * stimmt. Hier wird nichts davon nachgebildet — eine zweite Pruefung im
 * Anwendungscode koennte von der ersten abweichen.
 */

export interface TorErgebnis {
  fehler?: string;
}

/** Name des Cookies, das das Passwort eines Exposes traegt. */
export async function passwortCookieName(token: string): Promise<string> {
  return `expose_${token}`;
}

/**
 * Prueft das eingegebene Passwort und merkt es fuer die Sitzung vor.
 *
 * Das Cookie ersetzt die Pruefung nicht, es erspart nur die erneute Eingabe:
 * Bei jedem Seitenaufruf laeuft `web_expose_oeffnen` erneut. Ein Widerruf oder
 * ein abgelaufener Link wirken deshalb sofort, auch bei gesetztem Cookie.
 */
export async function exposeOeffnen(
  _vorher: TorErgebnis,
  formular: FormData,
): Promise<TorErgebnis> {
  const token = String(formular.get("token") ?? "").trim();
  const passwort = String(formular.get("passwort") ?? "");

  if (!/^[a-z0-9]{16,64}$/.test(token)) return { fehler: "Ungültiger Link." };
  if (!passwort) return { fehler: "Bitte geben Sie das Passwort ein." };

  const supabase = await serverClient();
  // Der Passwortversuch zaehlt nicht als Aufruf — gezaehlt wird erst die
  // Seite, die der Besucher danach tatsaechlich sieht.
  const { data } = await supabase.rpc("web_expose_oeffnen", {
    p_token: token,
    p_passwort: passwort,
    p_zaehlen: false,
  });

  const zustand = (data as { zustand?: string } | null)?.zustand;

  if (zustand !== "ok") {
    // Bewusst dieselbe Meldung fuer falsches Passwort und ungueltigen Link:
    // Sonst liesse sich ueber die Fehlermeldung herausfinden, welche Links
    // ueberhaupt existieren.
    return { fehler: "Das Passwort ist nicht korrekt." };
  }

  const kekse = await cookies();
  kekse.set(await passwortCookieName(token), passwort, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/expose/${token}`,
    maxAge: 60 * 60 * 8,
  });

  redirect(`/expose/${token}`);
}

export interface AnfrageErgebnis {
  fehler?: string;
  gesendet?: boolean;
}

const GRUENDE: Record<string, string> = {
  eingabe: "Bitte prüfen Sie Name und E-Mail-Adresse.",
  kein_formular: "Für dieses Exposé ist keine Kontaktaufnahme vorgesehen.",
  zu_viele: "Es sind heute bereits sehr viele Anfragen eingegangen. Bitte versuchen Sie es morgen erneut.",
};

/** Nimmt eine Anfrage aus dem Kontaktformular des Web-Exposes entgegen. */
export async function anfrageSenden(
  _vorher: AnfrageErgebnis,
  formular: FormData,
): Promise<AnfrageErgebnis> {
  const token = String(formular.get("token") ?? "").trim();
  if (!/^[a-z0-9]{16,64}$/.test(token)) return { fehler: "Ungültiger Link." };

  // Ohne ausdrueckliche Einwilligung entsteht kein Datensatz (Abschnitt 16).
  if (formular.get("einwilligung") !== "ja") {
    return { fehler: "Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu." };
  }

  const kekse = await cookies();
  const passwort = kekse.get(await passwortCookieName(token))?.value ?? null;

  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("web_expose_anfrage_senden", {
    p_token: token,
    p_passwort: passwort,
    p_name: String(formular.get("name") ?? ""),
    p_email: String(formular.get("email") ?? ""),
    p_telefon: String(formular.get("telefon") ?? ""),
    p_nachricht: String(formular.get("nachricht") ?? ""),
  });

  const antwort = data as { ok?: boolean; grund?: string; zustand?: string } | null;

  if (error || !antwort?.ok) {
    const grund = antwort?.grund;
    return {
      fehler:
        (grund ? GRUENDE[grund] : undefined) ??
        "Die Anfrage konnte nicht übermittelt werden.",
    };
  }

  return { gesendet: true };
}
