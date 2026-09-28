import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { KONTAKTROLLEN } from "@/lib/kontakt-begriffe";

export const metadata: Metadata = { title: "Kontakte" };

export default async function KontakteSeite() {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const { data: kontakte } = await supabase
    .from("kontakte")
    .select("id, anrede, vorname, nachname, firma, email, telefon, ort, kontakt_rollen(rolle)")
    .is("geloescht_am", null)
    .order("nachname", { ascending: true, nullsFirst: false });

  const darfAnlegen = hatRecht(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung);
  const liste = kontakte ?? [];

  return (
    <>
      <Seitenkopf
        titel="Kontakte"
        beschreibung={liste.length === 1 ? "1 Kontakt" : `${liste.length} Kontakte`}
      >
        {darfAnlegen && (
          <Link href="/kontakte/neu" className={buttonKlassen()}>
            Kontakt anlegen
          </Link>
        )}
      </Seitenkopf>

      {liste.length === 0 ? (
        <Karte>
          <KarteInhalt className="py-14 text-center">
            <p className="text-sm font-medium text-text">Noch keine Kontakte</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-gedaempft">
              Eigentümer, Interessenten und Dienstleister werden hier gemeinsam
              geführt — eine Person kann mehrere Rollen haben.
            </p>
            {darfAnlegen && (
              <Link href="/kontakte/neu" className={buttonKlassen({ className: "mt-5" })}>
                Ersten Kontakt anlegen
              </Link>
            )}
          </KarteInhalt>
        </Karte>
      ) : (
        <div className="space-y-2">
          {liste.map((kontakt) => {
            const name =
              [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") ||
              kontakt.firma ||
              "Ohne Namen";
            const rollen = (kontakt.kontakt_rollen ?? []) as { rolle: string }[];

            return (
              <Link
                key={kontakt.id}
                href={`/kontakte/${kontakt.id}`}
                className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-gedaempft">
                      {[kontakt.firma !== name ? kontakt.firma : null, kontakt.ort]
                        .filter(Boolean)
                        .join(" · ") || "Keine weiteren Angaben"}
                    </p>
                    {rollen.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {rollen.map((r) => (
                          <Marke key={r.rolle} ton="akzent">
                            {KONTAKTROLLEN[r.rolle as keyof typeof KONTAKTROLLEN]}
                          </Marke>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[13px] text-gedaempft">
                    {kontakt.email && <p className="truncate">{kontakt.email}</p>}
                    {kontakt.telefon && <p className="zahl truncate">{kontakt.telefon}</p>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
