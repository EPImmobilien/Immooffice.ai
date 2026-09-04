"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { TERMINARTEN } from "@/lib/arbeitsmittel";
import { nachrichtSenden, type PostfachErgebnis } from "@/server/postfach-aktionen";

import type { PostfachZeile } from "./typen";

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/**
 * Neue Nachricht ueber ein verbundenes Postfach (P5). Mit „Termin einfuegen"
 * (Referenz): Datum und Uhrzeit als Text in die Mail, auf Wunsch gleich als
 * Kalendereintrag mit Kalenderdatei im Anhang.
 */
export function NeueNachricht({ postfaecher, an, betreff, text, anhang, nachfassId }: { postfaecher: PostfachZeile[]; an?: string | undefined; betreff?: string | undefined; text?: string | undefined; anhang?: { art: "rechnung" | "brief" | "termin"; id: string; bezeichnung: string } | undefined; nachfassId?: string | undefined }) {
  const [zustand, aktion, laeuft] = useActionState<PostfachErgebnis, FormData>(nachrichtSenden, {});
  const [terminOffen, setTerminOffen] = useState(false);
  const [terminDatum, setTerminDatum] = useState("");
  const [terminZeit, setTerminZeit] = useState("10:00");
  const [eintragen, setEintragen] = useState(true);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sendbar = postfaecher.filter((p) => p.status !== "getrennt");
  if (sendbar.length === 0) return <Hinweis ton="warnung">Kein sendefähiges Postfach verbunden.</Hinweis>;

  const terminEinfuegen = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(terminDatum)) return;
    const d = new Date(`${terminDatum}T12:00:00`);
    const zeile = `Terminvorschlag: ${WOCHENTAG[d.getDay()]}, ${terminDatum.split("-").reverse().join(".")} um ${terminZeit} Uhr`;
    const ta = textRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? ta.value.length;
    const vorher = ta.value.slice(0, pos);
    const nachher = ta.value.slice(pos);
    ta.value = `${vorher}${vorher && !vorher.endsWith("\n") ? "\n" : ""}${zeile}\n${nachher}`;
    ta.focus();
  };

  return (
    <form action={aktion} className="space-y-3">
      <h2 className="font-titel text-[17px] font-semibold text-text">Neue Nachricht</h2>
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      {zustand.erfolg && <Hinweis ton="erfolg">{zustand.erfolg}</Hinweis>}
      {nachfassId && !zustand.erfolg && <Hinweis ton="info">Nachfass-Mail nach der Besichtigung — mit dem Versand ist der Vorschlag auf der Startseite erledigt.<input type="hidden" name="nachfass_id" value={nachfassId} /></Hinweis>}
      {anhang && !zustand.erfolg && (
        <Hinweis ton="info">Anhang: {anhang.bezeichnung}{anhang.art === "termin" ? "" : " (PDF)"} wird mitgesendet.<input type="hidden" name="anhang_art" value={anhang.art} /><input type="hidden" name="anhang_id" value={anhang.id} /></Hinweis>
      )}
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
        <Eingabe name="betreff" required maxLength={500} defaultValue={betreff ?? ""} />
      </Feld>
      <Feld beschriftung="Text" id="n-text" pflicht>
        <Textfeld ref={textRef} name="text" rows={10} required defaultValue={text ?? ""} />
      </Feld>

      <div className="rounded-[var(--radius)] border border-linie bg-hintergrund p-3 text-[13px]">
        {!terminOffen ? (
          <button type="button" className="text-akzent hover:underline" onClick={() => setTerminOffen(true)}>📅 Termin einfügen</button>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-gedaempft">Datum und Uhrzeit als Text einfügen — und optional gleich in den Kalender eintragen (Kalenderdatei hängt dann an).</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <Feld id="n-tdatum" beschriftung="Datum"><Eingabe type="date" name="termin_datum" value={terminDatum} onChange={(e) => setTerminDatum(e.target.value)} /></Feld>
              <Feld id="n-tzeit" beschriftung="Uhrzeit"><Eingabe type="time" name="termin_zeit" value={terminZeit} onChange={(e) => setTerminZeit(e.target.value)} step={300} /></Feld>
              <Feld id="n-tart" beschriftung="Art"><Auswahl name="termin_art" defaultValue="besichtigung">{Object.entries(TERMINARTEN).map(([w, n]) => <option key={w} value={w}>{n}</option>)}</Auswahl></Feld>
              <Feld id="n-tdauer" beschriftung="Dauer (Min)"><Eingabe name="termin_dauer" inputMode="numeric" defaultValue="60" /></Feld>
            </div>
            <Feld id="n-ttitel" beschriftung="Titel im Kalender (optional, sonst der Betreff)"><Eingabe name="termin_titel" maxLength={300} placeholder="z. B. Besichtigung Familie Sommer" /></Feld>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variante="sekundaer" groesse="klein" onClick={terminEinfuegen} disabled={!terminDatum}>Als Text einfügen</Button>
              <label className="flex items-center gap-2"><input type="hidden" name="termin_eintragen" value={eintragen ? "1" : "0"} /><input type="checkbox" checked={eintragen} onChange={(e) => setEintragen(e.target.checked)} className="h-4 w-4 accent-akzent" />Beim Senden auch in den Kalender eintragen</label>
              <button type="button" className="text-[12px] text-gedaempft hover:underline" onClick={() => { setTerminOffen(false); setTerminDatum(""); }}>× Termin entfernen</button>
            </div>
          </div>
        )}
      </div>

      <Button type="submit" disabled={laeuft}>{laeuft ? "Wird gesendet …" : "Senden"}</Button>
    </form>
  );
}
