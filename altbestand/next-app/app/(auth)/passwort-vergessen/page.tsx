import type { Metadata } from "next";

import { PasswortVergessenFormular } from "./PasswortVergessenFormular";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function PasswortVergessenSeite() {
  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">
        Passwort vergessen
      </h1>
      <p className="mt-1.5 mb-7 text-sm text-gedaempft">
        Wir schicken Ihnen einen Link, mit dem Sie ein neues Passwort setzen
        können.
      </p>
      <PasswortVergessenFormular />
    </>
  );
}
