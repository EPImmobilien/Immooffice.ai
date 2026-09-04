import Link from "next/link";

import { ChecklisteAnlegen } from "@/components/checklisten/ChecklisteAnlegen";
import { Marke } from "@/components/ui/Status";
import { fortschritt, type Checkliste, type Punkt, type Vorlage } from "@/lib/checklisten";
import { serverClient } from "@/lib/supabase/server";

/**
 * Checklisten zu einem Bezug (Objekt, Kontakt, Lead, Vertrag) — auf dessen
 * Seite eingebettet: Fortschritt je Liste, Anlegen aus Vorlage.
 */
export async function ChecklisteKarte({ bezug, darfAnlegen, heute }: { bezug: { objekt_id?: string; kontakt_id?: string; lead_id?: string; vertrag_id?: string }; darfAnlegen: boolean; heute: string }) {
  const supabase = await serverClient();
  let abfrage = supabase.from("checklisten").select("id, name, bereich, vorlage_id, objekt_id, kontakt_id, lead_id, vertrag_id, zustaendig_id, abgeschlossen_am, erstellt_am, punkte:checklisten_punkte(status, pflicht, faellig_am)").order("erstellt_am", { ascending: false });
  if (bezug.objekt_id) abfrage = abfrage.eq("objekt_id", bezug.objekt_id);
  else if (bezug.kontakt_id) abfrage = abfrage.eq("kontakt_id", bezug.kontakt_id);
  else if (bezug.lead_id) abfrage = abfrage.eq("lead_id", bezug.lead_id);
  else if (bezug.vertrag_id) abfrage = abfrage.eq("vertrag_id", bezug.vertrag_id);
  const [{ data: listen }, { data: vorlagen }] = await Promise.all([abfrage, supabase.from("checklisten_vorlagen").select("id, name, bereich, beschreibung, ist_standard, aktiv").eq("aktiv", true).order("bereich").order("name")]);
  const zeilen = (listen ?? []) as unknown as Array<Checkliste & { punkte: Pick<Punkt, "status" | "pflicht" | "faellig_am">[] }>;
  return (
    <div className="space-y-3">
      {zeilen.length === 0 ? <p className="text-[13px] text-gedaempft">Noch keine Checkliste.</p> : (
        <ul className="divide-y divide-linie">
          {zeilen.map((c) => {
            const f = fortschritt(c.punkte, heute);
            return (
              <li key={c.id} className="py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/checklisten/${c.id}`} className="text-text hover:underline">{c.name}</Link>
                  <Marke ton={c.abgeschlossen_am ? "erfolg" : f.ueberfaellig > 0 ? "fehler" : "info"}>{c.abgeschlossen_am ? "abgeschlossen" : `${f.erledigt}/${f.gesamt}`}</Marke>
                  {f.ueberfaellig > 0 && !c.abgeschlossen_am && <Marke ton="fehler">{f.ueberfaellig} überfällig</Marke>}
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-flaeche-gedaempft"><div className={`h-1.5 rounded-full ${c.abgeschlossen_am ? "bg-erfolg" : "bg-akzent"}`} style={{ width: `${f.prozent}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
      {darfAnlegen && (vorlagen ?? []).length > 0 && <ChecklisteAnlegen vorlagen={(vorlagen ?? []) as Vorlage[]} bezug={bezug} />}
    </div>
  );
}
