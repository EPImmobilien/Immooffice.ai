import { redirect } from "next/navigation";

import { serverClient } from "@/lib/supabase/server";

import { uebersteuerungLesen, type RechteTraeger, type Rolle, type Uebersteuerung } from "./rechte";

/**
 * `RechteTraeger` ist bewusst mitgeerbt: Damit laesst sich die Sitzung
 * ueberall dort einsetzen, wo ein Recht geprueft wird, und die Abweichungen
 * dieses Benutzers reisen automatisch mit.
 */
export interface Sitzung extends RechteTraeger {
  benutzerId: string;
  mandantId: string;
  name: string;
  email: string;
  rolle: Rolle;
  uebersteuerung: Uebersteuerung;
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
    // Bewusst ein einziges Zeichenkettenliteral: Der Supabase-Client leitet
    // die Typen aus dem Text ab. Zusammengesetzt kennt er sie nicht mehr.
    .select("id, mandant_id, name, email, rolle, rechte_uebersteuerung, aktiv, mandanten(name, abo_status, testphase_bis)")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  // Ein abgeschalteter Zugang ist keine Sitzung. Die Datenbank sieht das
  // genauso — `intern.aktueller_mandant()` liefert dafuer nichts, jede Abfrage
  // bliebe also leer. Hier abzubrechen ist ehrlicher als eine Oberflaeche, in
  // der alles vorhanden, aber alles leer ist.
  if (!data.aktiv) return null;

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
    uebersteuerung: uebersteuerungLesen(data.rechte_uebersteuerung),
    mandantName: mandant?.name ?? "",
    aboStatus: mandant?.abo_status ?? "test",
    testphaseBis: mandant?.testphase_bis ?? "",
  };
}

/**
 * Unterscheidet die beiden Faelle, in denen `sitzungLaden` `null` liefert:
 * ein Konto ohne Unternehmen und ein abgeschalteter Zugang.
 */
async function kontoZustand(): Promise<"ohne_konto" | "ohne_unternehmen" | "abgeschaltet"> {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "ohne_konto";

  const { data } = await supabase
    .from("benutzer")
    .select("aktiv")
    .eq("id", user.id)
    .maybeSingle();

  return data && !data.aktiv ? "abgeschaltet" : "ohne_unternehmen";
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
    const zustand = await kontoZustand();

    if (zustand === "ohne_konto") redirect("/anmelden");

    // Nicht auf die Anmeldeseite: Das Konto ist angemeldet, die Middleware
    // wuerde es von dort sofort aufs Dashboard zurueckschicken. Die eigene
    // Seite erklaert den Zustand und bietet die Abmeldung an.
    if (zustand === "abgeschaltet") redirect("/zugang-abgeschaltet");

    // Angemeldet, aber ohne Unternehmen: Registrierung abschliessen.
    redirect("/registrieren/unternehmen");
  }

  return sitzung;
}
