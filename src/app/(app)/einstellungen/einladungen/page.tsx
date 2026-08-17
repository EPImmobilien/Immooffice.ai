import type { Metadata } from "next";

import { Button } from "@/components/ui/Button";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { ROLLEN_BEZEICHNUNG, hatRecht, type Rolle } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { einladungWiderrufen } from "@/server/einstellungen-aktionen";

import { EinladungFormular } from "./EinladungFormular";
import { EinladungErneuern } from "./EinladungErneuern";

export const metadata: Metadata = { title: "Einladungen" };

type Zustand = "offen" | "eingeloest" | "widerrufen" | "abgelaufen";

function zustandErmitteln(e: {
  eingeloest_am: string | null;
  widerrufen_am: string | null;
  gueltig_bis: string;
}): Zustand {
  if (e.widerrufen_am) return "widerrufen";
  if (e.eingeloest_am) return "eingeloest";
  if (new Date(e.gueltig_bis) < new Date()) return "abgelaufen";
  return "offen";
}

const ZUSTAND_MARKE: Record<Zustand, { ton: "erfolg" | "warnung" | "neutral"; text: string }> = {
  offen: { ton: "warnung", text: "offen" },
  eingeloest: { ton: "erfolg", text: "angenommen" },
  widerrufen: { ton: "neutral", text: "widerrufen" },
  abgelaufen: { ton: "neutral", text: "abgelaufen" },
};

export default async function EinladungenSeite() {
  const sitzung = await sitzungErzwingen();
  const darfAnlegen = hatRecht(sitzung, "einstellungen", "anlegen");
  const darfAendern = hatRecht(sitzung, "einstellungen", "aendern");

  const supabase = await serverClient();
  const { data } = await supabase
    .from("einladungen")
    .select("id, email, rolle, gueltig_bis, erstellt_am, eingeloest_am, widerrufen_am")
    .order("erstellt_am", { ascending: false });

  const einladungen = data ?? [];

  return (
    <div className="space-y-5">
      {darfAnlegen && (
        <EinladungFormular darfInhaberRolle={sitzung.rolle === "inhaber"} />
      )}

      <Karte>
        <KarteKopf>
          <KarteTitel>Bisherige Einladungen</KarteTitel>
          <KarteBeschreibung>
            Der Link wird nur beim Anlegen angezeigt. Gespeichert wird
            ausschließlich seine Prüfsumme.
          </KarteBeschreibung>
        </KarteKopf>

        {einladungen.length === 0 ? (
          <KarteInhalt className="py-12 text-center text-[13px] text-gedaempft">
            Noch niemand eingeladen.
          </KarteInhalt>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-linie bg-flaeche-gedaempft text-[13px]">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-gedaempft">
                    E-Mail
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-gedaempft">
                    Rolle
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-gedaempft">
                    Zustand
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium text-gedaempft">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {einladungen.map((e) => {
                  const zustand = zustandErmitteln(e);
                  const marke = ZUSTAND_MARKE[zustand];

                  return (
                    <tr key={e.id} className="border-b border-linie last:border-b-0">
                      <td className="px-4 py-3">
                        <p className="text-text">{e.email}</p>
                        <p className="text-[12px] text-gedaempft">
                          {zustand === "offen"
                            ? `gültig bis ${datum(e.gueltig_bis)}`
                            : `eingeladen am ${datum(e.erstellt_am)}`}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text">
                        {ROLLEN_BEZEICHNUNG[e.rolle as Rolle]}
                      </td>
                      <td className="px-4 py-3">
                        <Marke ton={marke.ton}>{marke.text}</Marke>
                      </td>
                      <td className="px-4 py-3">
                        {darfAendern && (zustand === "offen" || zustand === "abgelaufen") && (
                          <div className="flex flex-wrap justify-end gap-2">
                            <EinladungErneuern id={e.id} email={e.email} />
                            <form action={einladungWiderrufen}>
                              <input type="hidden" name="einladung_id" value={e.id} />
                              <Button type="submit" variante="leise" groesse="klein">
                                Widerrufen
                              </Button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <Hinweis ton="info" titel="Noch kein automatischer Versand">
        ImmoOffice.ai verschickt die Einladung derzeit nicht selbst — der
        E-Mail-Versand ist noch nicht eingerichtet. Geben Sie den Link auf einem
        Weg weiter, dem Sie vertrauen. Angenommen werden kann er nur von genau
        der eingeladenen Adresse.
      </Hinweis>
    </div>
  );
}
