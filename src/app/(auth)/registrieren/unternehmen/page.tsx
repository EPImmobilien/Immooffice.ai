import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { sitzungLaden } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { UnternehmenFormular } from "./UnternehmenFormular";

export const metadata: Metadata = { title: "Unternehmen anlegen" };

export default async function UnternehmenSeite() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/anmelden");

  // Wer bereits zu einem Unternehmen gehoert, hat hier nichts zu tun.
  const sitzung = await sitzungLaden();
  if (sitzung) redirect("/dashboard");

  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">
        Unternehmen anlegen
      </h1>
      <p className="mt-1.5 mb-7 text-sm text-gedaempft">
        Noch ein Schritt, dann kann es losgehen.
      </p>
      <UnternehmenFormular />
    </>
  );
}
