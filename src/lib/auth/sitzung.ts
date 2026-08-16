import { redirect } from "next/navigation";

import { serverClient } from "@/lib/supabase/server";

import type { Rolle } from "./rechte";

export interface Sitzung {
  benutzerId: string;
  mandantId: string;
  name: string;
  email: string;
  rolle: Rolle;
  mandantName: string;
  aboStatus: string;
  testphaseBis: string;
}

/**
 * Laedt den angemeldeten Benutzer samt Mandant.
 *
 * `null`, wenn niemand angemeldet ist oder das Konto noch zu keinem
 * Unternehmen gehoert (zwischen Registrierung und Anlage des Mandanten).
 */
export async function sitzungLaden(): Promise<Sitzung | null> {
  const supabase = await serverClient();

  // getUser() prueft das Token beim Auth-Server. getSession() liest nur das
  // Cookie und ist serverseitig nicht vertrauenswuerdig.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("benutzer")
    .select(
      "id, mandant_id, name, email, rolle, mandanten(name, abo_status, testphase_bis)",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  const mandant = data.mandanten as unknown as {
    name: string;
    abo_status: string;
    testphase_bis: string;
  } | null;

  return {
    benutzerId: data.id,
    mandantId: data.mandant_id,
    name: data.name,
    email: data.email,
    rolle: data.rolle as Rolle,
    mandantName: mandant?.name ?? "",
    aboStatus: mandant?.abo_status ?? "test",
    testphaseBis: mandant?.testphase_bis ?? "",
  };
}

/**
 * Wie `sitzungLaden`, leitet aber weiter statt `null` zu liefern.
 *
 * Fuer jede Seite im angemeldeten Bereich. Die Middleware schuetzt bereits vor
 * dem Aufruf; diese zweite Pruefung ist Absicht — verlassen wir uns nur auf
 * die Middleware, oeffnet ein Fehler in deren Pfadliste den gesamten Bereich.
 */
export async function sitzungErzwingen(): Promise<Sitzung> {
  const sitzung = await sitzungLaden();

  if (!sitzung) {
    const supabase = await serverClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Angemeldet, aber ohne Unternehmen: Registrierung abschliessen.
    redirect(user ? "/registrieren/unternehmen" : "/anmelden");
  }

  return sitzung;
}
