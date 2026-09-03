import type { Metadata } from "next";
import Link from "next/link";

import { buttonKlassen } from "@/components/ui/Button";
import { Hinweis } from "@/components/ui/Status";
import { ROLLEN_BEZEICHNUNG } from "@/lib/auth/rechte";
import { einladungAnsehen } from "@/lib/einladung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";

import { EinladungFormular } from "./EinladungFormular";

export const metadata: Metadata = { title: "Einladung" };

const ZUSTAND_TEXT: Record<string, string> = {
  abgelaufen: "Die Einladung ist abgelaufen. Bitten Sie um eine neue.",
  eingeloest: "Diese Einladung wurde bereits eingelöst.",
  widerrufen: "Die Einladung wurde zurückgenommen. Bitten Sie um eine neue.",
  unbekannt: "Dieser Link ist ungültig. Bitte prüfen Sie, ob er vollständig kopiert wurde.",
};

/**
 * Landeseite eines Einladungslinks (docs/AUTONOMIE.md R3).
 *
 * Drei Faelle:
 *   - nicht angemeldet: zeigt, wer einlaedt, und fuehrt zur Registrierung
 *     mit Token (oder zur Anmeldung, falls das Konto schon besteht)
 *   - angemeldet ohne Unternehmen: Name eingeben, beitreten
 *   - angemeldet mit Unternehmen: Hinweis, dass ein Konto genau einem
 *     Unternehmen gehoert
 *
 * Bewusst kein `sitzungErzwingen`: Das wuerde ein Konto ohne Mandant zur
 * Unternehmensanlage schicken — hier soll es stattdessen beitreten.
 */
export default async function EinladungSeite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await serverClient();
  const [einladung, { data: auth }] = await Promise.all([
    einladungAnsehen(supabase, token),
    supabase.auth.getUser(),
  ]);

  if (einladung.zustand !== "ok" || !einladung.unternehmen || !einladung.email || !einladung.rolle) {
    return (
      <>
        <h1 className="font-titel text-2xl font-semibold text-text">Einladung</h1>
        <Hinweis ton="warnung" className="mt-5" titel="Dieser Link ist nicht mehr gültig">
          {ZUSTAND_TEXT[einladung.zustand] ?? ZUSTAND_TEXT["unbekannt"]}
        </Hinweis>
        <p className="mt-5 text-[13px] text-gedaempft">
          <Link href="/anmelden" className="font-medium text-akzent hover:underline">
            Zur Anmeldung
          </Link>
        </p>
      </>
    );
  }

  const user = auth.user;
  let hatUnternehmen = false;
  if (user) {
    const { data } = await supabase.from("benutzer").select("id").eq("id", user.id).maybeSingle();
    hatUnternehmen = Boolean(data);
  }

  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">
        Einladung von {einladung.unternehmen}
      </h1>
      <p className="mt-1.5 mb-6 text-sm text-gedaempft">
        Für <span className="text-text">{einladung.email}</span> als{" "}
        {ROLLEN_BEZEICHNUNG[einladung.rolle]}.
        {einladung.gueltig_bis ? ` Gültig bis ${datum(einladung.gueltig_bis)}.` : ""}
      </p>

      {!user && (
        <div className="space-y-4">
          <Link href={`/registrieren?einladung=${token}`} className={buttonKlassen({ className: "w-full" })}>
            Konto anlegen und beitreten
          </Link>
          <p className="text-center text-[13px] text-gedaempft">
            Sie haben mit dieser Adresse bereits ein Konto?{" "}
            <Link
              href={`/anmelden?weiter=/einladung/${token}`}
              className="font-medium text-akzent underline-offset-2 hover:underline"
            >
              Anmelden und beitreten
            </Link>
          </p>
        </div>
      )}

      {user && hatUnternehmen && (
        <Hinweis ton="info" titel="Sie gehören bereits zu einem Unternehmen">
          Ein Konto gehört genau einem Unternehmen. Um dieser Einladung zu
          folgen, melden Sie sich ab und legen Sie mit der eingeladenen Adresse
          ein neues Konto an.
        </Hinweis>
      )}

      {user && !hatUnternehmen && (
        <EinladungFormular token={token} kontoEmail={user.email ?? ""} eingeladeneEmail={einladung.email} />
      )}
    </>
  );
}
