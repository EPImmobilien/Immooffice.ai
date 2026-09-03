import Link from "next/link";

import { Marke } from "@/components/ui/Status";
import { cn } from "@/lib/cn";
import { zeitpunkt } from "@/lib/format";

import { adresseAnzeigen, type NachrichtZeile, type PostfachZeile } from "./typen";

/**
 * Eingang als Liste. Ungelesenes ist fett, Zuordnung und Anhang stehen als
 * kleine Marken dabei — mehr braucht die Liste nicht, den Rest zeigt das Detail.
 */
export function Nachrichtenliste({
  nachrichten,
  postfaecher,
  aktiveId,
  parameter,
}: {
  nachrichten: NachrichtZeile[];
  postfaecher: PostfachZeile[];
  aktiveId: string | null;
  parameter: Record<string, string>;
}) {
  if (nachrichten.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-gedaempft">Keine Nachrichten — oder der erste Abruf läuft noch.</p>;
  }
  const mehrere = postfaecher.length > 1;
  const postfachName = new Map(postfaecher.map((p) => [p.id, p.anzeigename ?? p.adresse]));

  return (
    <ul className="divide-y divide-linie">
      {nachrichten.map((n) => {
        const ziel = new URLSearchParams({ ...parameter, nachricht: n.id });
        const absender = n.ordner === "gesendet"
          ? `An ${n.an.map(adresseAnzeigen).join(", ") || "—"}`
          : n.von_name || n.von_adresse || "Unbekannt";
        return (
          <li key={n.id}>
            <Link
              href={`/postfach?${ziel.toString()}`}
              className={cn(
                "block px-4 py-3 transition-colors hover:bg-flaeche-gedaempft",
                aktiveId === n.id && "bg-akzent-schwach",
              )}
              aria-current={aktiveId === n.id ? "true" : undefined}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn("truncate text-[13px]", !n.gelesen && n.ordner === "eingang" ? "font-semibold text-text" : "text-text")}>
                  {absender}
                </span>
                <span className="shrink-0 text-[12px] text-gedaempft">{zeitpunkt(n.gesendet_am)}</span>
              </div>
              <p className={cn("truncate text-[13px]", !n.gelesen && n.ordner === "eingang" ? "font-medium text-text" : "text-text")}>
                {n.betreff ?? "(ohne Betreff)"}
              </p>
              <p className="truncate text-[12px] text-gedaempft">{n.vorschau ?? ""}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {n.ordner === "gesendet" && <Marke>Gesendet</Marke>}
                {mehrere && <Marke>{postfachName.get(n.postfach_id) ?? "Postfach"}</Marke>}
                {n.objekt_id && <Marke ton="erfolg">Objekt</Marke>}
                {!n.objekt_id && n.objekt_vorschlag_id && (
                  <Marke ton="warnung">Vorschlag {n.objekt_vorschlag_konfidenz ?? ""} %</Marke>
                )}
                {n.kontakt_id && <Marke ton="info">Kontakt</Marke>}
                {n.hat_anhaenge && <Marke>Anhang</Marke>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
