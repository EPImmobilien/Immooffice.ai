"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { nachrichtSenden, type PostfachErgebnis } from "@/server/postfach-aktionen";

import type { PostfachZeile } from "./typen";

/** Neue Nachricht ueber ein verbundenes Postfach (P5). */
export function NeueNachricht({ postfaecher, an }: { postfaecher: PostfachZeile[]; an?: string | undefined }) {
  const [zustand, aktion, laeuft] = useActionState<PostfachErgebnis, FormData>(nachrichtSenden, {});
  const sendbar = postfaecher.filter((p) => p.status !== "getrennt");
  if (sendbar.length === 0) return <Hinweis ton="warnung">Kein sendefähiges Postfach verbunden.</Hinweis>;

  return (
    <form action={aktion} className="space-y-3">
      <h2 className="font-titel text-[17px] font-semibold text-text">Neue Nachricht</h2>
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      {zustand.erfolg && <Hinweis ton="erfolg">{zustand.erfolg}</Hinweis>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld beschriftung="Über Postfach" id="n-postfach">
          <Auswahl name="postfach_id" defaultValue={sendbar[0]?.id}>
            {sendbar.map((p) => (
              <option key={p.id} value={p.id}>{p.anzeigename ? `${p.anzeigename} <${p.adresse}>` : p.adresse}</option>
            ))}
          </Auswahl>
        </Feld>
        <Feld beschriftung="An" id="n-an" pflicht hinweis="mehrere Adressen mit Komma">
          <Eingabe name="an" required defaultValue={an ?? ""} />
        </Feld>
      </div>
      <Feld beschriftung="Kopie (optional)" id="n-cc">
        <Eingabe name="cc" />
      </Feld>
      <Feld beschriftung="Betreff" id="n-betreff" pflicht>
        <Eingabe name="betreff" required maxLength={500} />
      </Feld>
      <Feld beschriftung="Text" id="n-text" pflicht>
        <Textfeld name="text" rows={10} required />
      </Feld>
      <Button type="submit" disabled={laeuft}>{laeuft ? "Wird gesendet …" : "Senden"}</Button>
    </form>
  );
}
