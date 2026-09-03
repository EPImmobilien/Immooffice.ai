"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { zeitpunkt } from "@/lib/format";
import { EREIGNIS_BEZEICHNUNG, RUECKRUF_EREIGNISSE, type RueckrufEreignis } from "@/lib/schnittstelle/ereignisse";
import {
  rueckrufErneut,
  zielAendern,
  zielAnlegen,
  zielGeheimnisErneuern,
  zielLoeschen,
  type SchnittstellenErgebnis,
} from "@/server/schnittstelle-aktionen";

import { Einmalanzeige } from "./Einmalanzeige";
import type { RueckrufZeile, ZielZeile } from "./typen";

function EreignisWahl({ gewaehlt, praefix }: { gewaehlt?: string[]; praefix: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[13px] font-medium text-text">Ereignisse</legend>
      {RUECKRUF_EREIGNISSE.map((e) => (
        <label key={e} htmlFor={`${praefix}-${e}`} className="flex items-center gap-2 text-[13px] text-text">
          <input id={`${praefix}-${e}`} type="checkbox" name="ereignisse" value={e} defaultChecked={gewaehlt ? gewaehlt.includes(e) : true} />
          {EREIGNIS_BEZEICHNUNG[e]} <code className="font-mono text-[11px] text-gedaempft">{e}</code>
        </label>
      ))}
    </fieldset>
  );
}

const STATUS: Record<RueckrufZeile["status"], { text: string; ton: "neutral" | "erfolg" | "fehler" }> = {
  offen: { text: "Offen", ton: "neutral" },
  zugestellt: { text: "Zugestellt", ton: "erfolg" },
  fehler: { text: "Gescheitert", ton: "fehler" },
};

function ZielKarte({ ziel, rueckrufe }: { ziel: ZielZeile; rueckrufe: RueckrufZeile[] }) {
  const [aendern, aendernAktion, aendert] = useActionState<SchnittstellenErgebnis, FormData>(zielAendern, {});
  const [geheim, geheimAktion, erneuert] = useActionState<SchnittstellenErgebnis, FormData>(zielGeheimnisErneuern, {});
  const [loeschen, loeschenAktion, loescht] = useActionState<SchnittstellenErgebnis, FormData>(zielLoeschen, {});
  const [erneut, erneutAktion, plant] = useActionState<SchnittstellenErgebnis, FormData>(rueckrufErneut, {});

  return (
    <div className="rounded-[var(--radius)] border border-linie bg-flaeche p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-medium text-text">{ziel.bezeichnung}</p>
          <p className="mt-0.5 font-mono text-[12px] break-all text-gedaempft">{ziel.url}</p>
        </div>
        <div className="flex gap-1.5">
          <Marke ton={ziel.aktiv ? "erfolg" : "warnung"}>{ziel.aktiv ? "Aktiv" : "Pausiert"}</Marke>
          {ziel.fehler_zaehler > 0 && <Marke ton="fehler">{ziel.fehler_zaehler} Fehler in Folge</Marke>}
        </div>
      </div>
      {ziel.letzter_fehler && <p className="mt-2 text-[12px] text-fehler">Letzter Fehler: {ziel.letzter_fehler}</p>}
      {geheim.geheimnis && <div className="mt-3"><Einmalanzeige wert={geheim.geheimnis} bezeichnung="Neues Geheimnis" /></div>}

      <form action={aendernAktion} className="mt-4 space-y-3">
        <input type="hidden" name="id" value={ziel.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld id={`zb-${ziel.id}`} beschriftung="Bezeichnung">
            <Eingabe name="bezeichnung" defaultValue={ziel.bezeichnung} maxLength={120} />
          </Feld>
          <Feld id={`zu-${ziel.id}`} beschriftung="Adresse (https)">
            <Eingabe name="url" type="url" defaultValue={ziel.url} />
          </Feld>
        </div>
        <EreignisWahl gewaehlt={ziel.ereignisse} praefix={`z-${ziel.id}`} />
        <label htmlFor={`aktiv-${ziel.id}`} className="flex items-center gap-2 text-[13px] text-text">
          <input id={`aktiv-${ziel.id}`} type="checkbox" name="aktiv" value="1" defaultChecked={ziel.aktiv} />
          Rückrufe an dieses Ziel zustellen
        </label>
        {aendern.fehler && <Hinweis ton="fehler">{aendern.fehler}</Hinweis>}
        {aendern.erfolg && <Hinweis ton="erfolg">{aendern.erfolg}</Hinweis>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variante="sekundaer" groesse="klein" laedt={aendert}>Änderungen speichern</Button>
        </div>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        <form action={geheimAktion}>
          <input type="hidden" name="id" value={ziel.id} />
          <Button type="submit" variante="leise" groesse="klein" laedt={erneuert}>Geheimnis erneuern</Button>
        </form>
        <form
          action={loeschenAktion}
          onSubmit={(e) => {
            if (!window.confirm("Dieses Rückrufziel löschen? Offene Rückrufe dazu werden verworfen.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={ziel.id} />
          <Button type="submit" variante="gefahr" groesse="klein" laedt={loescht}>Löschen</Button>
        </form>
      </div>
      {(geheim.fehler || loeschen.fehler || erneut.fehler) && (
        <Hinweis ton="fehler" className="mt-2">{geheim.fehler ?? loeschen.fehler ?? erneut.fehler}</Hinweis>
      )}
      {erneut.erfolg && <Hinweis ton="erfolg" className="mt-2">{erneut.erfolg}</Hinweis>}

      {rueckrufe.length > 0 && (
        <div className="mt-4 border-t border-linie pt-3">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-gedaempft uppercase">Letzte Zustellungen</p>
          <ul className="space-y-1.5">
            {rueckrufe.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <span className="text-text">
                  {EREIGNIS_BEZEICHNUNG[r.ereignis as RueckrufEreignis] ?? r.ereignis} · {zeitpunkt(r.erstellt_am)}
                  {r.antwort_status ? ` · HTTP ${r.antwort_status}` : ""}
                  {r.versuche > 0 ? ` · ${r.versuche} ${r.versuche === 1 ? "Versuch" : "Versuche"}` : ""}
                  {r.status === "offen" ? ` · nächster Versuch ${zeitpunkt(r.naechster_versuch_am)}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <Marke ton={STATUS[r.status].ton}>{STATUS[r.status].text}</Marke>
                  {r.status === "fehler" && (
                    <form action={erneutAktion}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variante="leise" groesse="klein" laedt={plant}>Erneut</Button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RueckrufZiele({ ziele, rueckrufe, verschluesselungFehlt }: { ziele: ZielZeile[]; rueckrufe: RueckrufZeile[]; verschluesselungFehlt: boolean }) {
  const [neu, neuAktion, legtAn] = useActionState<SchnittstellenErgebnis, FormData>(zielAnlegen, {});

  return (
    <div className="space-y-5">
      {verschluesselungFehlt && (
        <Hinweis ton="warnung">Der Verschlüsselungsschlüssel fehlt — Rückrufziele lassen sich erst anlegen, wenn er gesetzt ist (docs/ANLEITUNG.md, Abschnitt 6).</Hinweis>
      )}
      {neu.geheimnis && <Einmalanzeige wert={neu.geheimnis} bezeichnung="Geheimnis des Rückrufziels" />}

      <form action={neuAktion} className="space-y-3 rounded-[var(--radius)] border border-dashed border-linie p-4">
        <p className="text-[13px] font-medium text-text">Neues Rückrufziel</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld id="neu-ziel-bez" beschriftung="Bezeichnung" pflicht>
            <Eingabe name="bezeichnung" maxLength={120} placeholder="CRM des Unternehmens" />
          </Feld>
          <Feld id="neu-ziel-url" beschriftung="Adresse (https)" pflicht hinweis="Erhält eine POST-Anfrage je Ereignis, signiert mit dem Geheimnis">
            <Eingabe name="url" type="url" placeholder="https://beispiel.de/rueckruf" />
          </Feld>
        </div>
        <EreignisWahl praefix="neu-ziel" />
        {neu.fehler && <Hinweis ton="fehler">{neu.fehler}</Hinweis>}
        <Button type="submit" laedt={legtAn} disabled={verschluesselungFehlt}>Rückrufziel anlegen</Button>
      </form>

      {ziele.length === 0 ? (
        <p className="text-[13px] text-gedaempft">Noch kein Rückrufziel angelegt.</p>
      ) : (
        <div className="space-y-3">
          {ziele.map((z) => <ZielKarte key={z.id} ziel={z} rueckrufe={rueckrufe.filter((r) => r.ziel_id === z.id).slice(0, 8)} />)}
        </div>
      )}
    </div>
  );
}
