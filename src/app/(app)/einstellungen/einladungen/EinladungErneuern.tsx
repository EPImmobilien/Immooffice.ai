"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Hinweis } from "@/components/ui/Status";
import {
  einladungErneuern,
  type EinstellungenErgebnis,
} from "@/server/einstellungen-aktionen";

import { Einladungslink } from "./Einladungslink";

/**
 * Erzeugt einen neuen Link für eine bestehende Einladung.
 *
 * Nötig, weil der Klartext nirgends gespeichert ist: Ein verlorener Link lässt
 * sich nicht wiederherstellen, nur ersetzen. Der bisherige gilt danach nicht
 * mehr.
 */
export function EinladungErneuern({ id, email }: { id: string; email: string }) {
  const [zustand, aktion, laeuft] = useActionState<EinstellungenErgebnis, FormData>(
    einladungErneuern,
    {},
  );

  return (
    <>
      <form action={aktion}>
        <input type="hidden" name="einladung_id" value={id} />
        <Button type="submit" variante="sekundaer" groesse="klein" laedt={laeuft}>
          Neuer Link
        </Button>
      </form>

      {(zustand.fehler || zustand.einladungslink) && (
        <div className="w-full">
          {zustand.fehler ? (
            <Hinweis ton="fehler">{zustand.fehler}</Hinweis>
          ) : (
            <>
              <p className="mb-1.5 text-[12px] text-gedaempft">Neuer Link für {email}</p>
              <Einladungslink adresse={zustand.einladungslink!} />
            </>
          )}
        </div>
      )}
    </>
  );
}
