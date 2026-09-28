"use server";

import { serverClient } from "@/lib/supabase/server";

/**
 * Unterschrift ueber den oeffentlichen Link.
 *
 * Die Pruefung liegt vollstaendig in der Datenbank: `vertrag_unterzeichnen`
 * entscheidet, ob der Token gilt und ob der Vertrag noch zur Unterschrift
 * offen ist. Hier wird nichts davon nachgebildet — eine zweite Pruefung im
 * Anwendungscode koennte von der ersten abweichen.
 *
 * Auch der Fingerabdruck entsteht dort und nicht hier: Ein vom Browser
 * mitgeschickter Hash waere die Behauptung des Unterzeichners darueber, was er
 * gesehen hat, und damit wertlos als Nachweis.
 */

export interface UnterschriftErgebnis {
  fehler?: string;
}

const GRUENDE: Record<string, string> = {
  eingabe: "Bitte prüfen Sie Name und E-Mail-Adresse.",
  unbekannt:
    "Dieser Vertrag steht nicht mehr zur Unterschrift bereit. Bitte wenden Sie sich an den Absender.",
};

export async function unterzeichnen(
  formular: FormData,
): Promise<UnterschriftErgebnis> {
  const token = String(formular.get("token") ?? "").trim();
  if (!/^[a-z0-9]{16,64}$/.test(token)) {
    return { fehler: "Ungültiger Link." };
  }

  // Ohne ausdrueckliche Zustimmung entsteht keine Unterschrift.
  if (formular.get("zustimmung") !== "ja") {
    return { fehler: "Bitte bestätigen Sie, dass Sie den Text gelesen haben." };
  }

  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("vertrag_unterzeichnen", {
    p_token: token,
    p_name: String(formular.get("name") ?? ""),
    p_email: String(formular.get("email") ?? ""),
  });

  const antwort = data as { ok?: boolean; grund?: string } | null;

  if (error || !antwort?.ok) {
    const grund = antwort?.grund;
    return {
      fehler:
        (grund ? GRUENDE[grund] : undefined) ??
        "Die Unterschrift konnte nicht übermittelt werden.",
    };
  }

  return {};
}
