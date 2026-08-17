import type { Metadata } from "next";
import Link from "next/link";

import { Wortmarke } from "@/components/Marke";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { ROLLEN_BEZEICHNUNG, type Rolle } from "@/lib/auth/rechte";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { AnnahmeFormular } from "./AnnahmeFormular";

export const metadata: Metadata = {
  title: "Einladung",
  // Einladungslinks gehören nicht in Suchmaschinen.
  robots: { index: false, follow: false },
};

interface Einladung {
  zustand: string;
  unternehmen: string | null;
  email: string | null;
  rolle: string | null;
}

const ZUSTAND_TEXT: Record<string, string> = {
  unbekannt: "Dieser Einladungslink ist ungültig.",
  abgelaufen: "Diese Einladung ist abgelaufen. Bitten Sie um einen neuen Link.",
  widerrufen: "Diese Einladung wurde zurückgezogen.",
  eingeloest: "Diese Einladung wurde bereits angenommen.",
};

export default async function EinladungSeite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await serverClient();
  const { data } = await supabase.rpc("einladung_ansehen", { p_token: token });

  const einladung = (Array.isArray(data) ? data[0] : data) as Einladung | undefined;
  const zustand = einladung?.zustand ?? "unbekannt";

  const sitzung = await sitzungLaden();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <div className="mb-7">
        <Wortmarke />
      </div>

      {zustand !== "ok" ? (
        <Karte>
          <KarteInhalt className="space-y-4 py-10 text-center">
            <p className="text-sm font-medium text-text">
              {ZUSTAND_TEXT[zustand] ?? ZUSTAND_TEXT["unbekannt"]}
            </p>
            <Link href="/anmelden" className={buttonKlassen({ variante: "sekundaer" })}>
              Zur Anmeldung
            </Link>
          </KarteInhalt>
        </Karte>
      ) : (
        <>
          <h1 className="font-titel text-2xl font-semibold text-text">
            Einladung zu {einladung?.unternehmen}
          </h1>
          <p className="mt-1.5 mb-7 text-sm text-gedaempft">
            Sie wurden als{" "}
            <strong className="font-medium text-text">
              {ROLLEN_BEZEICHNUNG[(einladung?.rolle ?? "makler") as Rolle]}
            </strong>{" "}
            eingeladen.
          </p>

          {sitzung ? (
            // Wer bereits zu einem Unternehmen gehoert, kann keiner weiteren
            // Einladung folgen: Ein Konto gehoert zu genau einem Mandanten.
            <Karte>
              <KarteInhalt className="space-y-4">
                <Hinweis ton="warnung" titel="Bereits einem Unternehmen zugeordnet">
                  Ihr Konto gehört zu {sitzung.mandantName}. Ein Konto kann nur
                  zu einem Unternehmen gehören. Melden Sie sich ab und
                  registrieren Sie sich mit der eingeladenen Adresse
                  {einladung?.email ? ` (${einladung.email})` : ""}.
                </Hinweis>
                <Link href="/dashboard" className={buttonKlassen({ variante: "sekundaer" })}>
                  Zur Übersicht
                </Link>
              </KarteInhalt>
            </Karte>
          ) : user ? (
            <AnnahmeFormular token={token} email={einladung?.email ?? ""} />
          ) : (
            <Karte>
              <KarteInhalt className="space-y-4">
                <p className="text-[13px] text-gedaempft">
                  Melden Sie sich zunächst mit{" "}
                  <strong className="font-medium text-text">{einladung?.email}</strong>{" "}
                  an. Besteht dafür noch kein Konto, legen Sie es zuerst an —
                  die Einladung bleibt bestehen.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/anmelden?weiter=${encodeURIComponent(`/einladung/${token}`)}`}
                    className={buttonKlassen()}
                  >
                    Anmelden
                  </Link>
                  <Link
                    href={`/registrieren?weiter=${encodeURIComponent(`/einladung/${token}`)}`}
                    className={buttonKlassen({ variante: "sekundaer" })}
                  >
                    Konto anlegen
                  </Link>
                </div>
              </KarteInhalt>
            </Karte>
          )}
        </>
      )}
    </main>
  );
}
