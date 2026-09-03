"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum, euro } from "@/lib/format";
import { RESERVIERUNG_STATUS, type ReservierungStatus, type ReservierungZeile } from "@/lib/vermietung/reservierungen";
import { reservierungAnlegen, reservierungStatus, type VermietungErgebnis } from "@/server/vermietung-aktionen";

const TON: Record<ReservierungStatus, "neutral" | "info" | "warnung" | "erfolg" | "fehler"> = { angefragt: "info", aktiv: "warnung", abgelaufen: "neutral", aufgehoben: "fehler", abgeschlossen: "erfolg" };

/**
 * Reservierungen (docs/FUNKTIONSABGLEICH.md, Referenz „Reservierungen“):
 * Objekt fuer einen Interessenten sperren, Vereinbarung als Vertrag erzeugen,
 * Objektstatus folgt (reserviert → aktiv/verkauft) ueber Datenbank-Trigger.
 */
export function Reservierungen({ zeilen, objekte, kontakte, darfAnlegen, darfAendern, heute }: { heute: string; zeilen: ReservierungZeile[]; objekte: { id: string; objektnummer: string; bezeichnung: string; status: string }[]; kontakte: { id: string; name: string }[]; darfAnlegen: boolean; darfAendern: boolean }) {
  const [neu, neuAktion, legtAn] = useActionState<VermietungErgebnis, FormData>(reservierungAnlegen, {});
  const [erg, statusAktion, wechselt] = useActionState<VermietungErgebnis, FormData>(reservierungStatus, {});
  const jetzt = new Date(heute).getTime();
  const in28Tagen = new Date(jetzt + 28 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      {darfAnlegen && (
        <Karte>
          <KarteKopf>
            <KarteTitel>Reservierung anlegen</KarteTitel>
            <KarteBeschreibung>Mit Status „Aktiv“ wird das Objekt sofort als reserviert geführt; Portale erhalten den Status beim nächsten Export. Die Reservierungsvereinbarung entsteht als Vertrag und kann per Signaturlink unterschrieben werden.</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={neuAktion} className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Feld id="rs-objekt" beschriftung="Objekt" pflicht><Auswahl name="objekt_id" defaultValue="" required><option value="">— wählen —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}{o.status === "reserviert" ? " (bereits reserviert)" : ""}</option>)}</Auswahl></Feld></div>
              <div className="sm:col-span-2"><Feld id="rs-kontakt" beschriftung="Interessent"><Auswahl name="kontakt_id" defaultValue=""><option value="">— ohne —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
              <Feld id="rs-status" beschriftung="Status"><Auswahl name="status" defaultValue="aktiv"><option value="aktiv">Aktiv</option><option value="angefragt">Angefragt</option></Auswahl></Feld>
              <Feld id="rs-bis" beschriftung="Reserviert bis" hinweis="Läuft danach automatisch ab"><Eingabe name="reserviert_bis" type="date" defaultValue={in28Tagen} /></Feld>
              <Feld id="rs-gebuehr" beschriftung="Reservierungsgebühr (€)" hinweis="Moderat wählen, § 307 BGB"><Eingabe name="gebuehr" type="number" min={0} step="0.01" defaultValue="0" /></Feld>
              <Feld id="rs-anrechenbar" beschriftung="Auf Provision anrechnen"><Auswahl name="gebuehr_anrechenbar" defaultValue="1"><option value="1">ja</option><option value="0">nein</option></Auswahl></Feld>
              <div className="sm:col-span-3"><Feld id="rs-notiz" beschriftung="Notiz"><Textfeld name="notizen" rows={1} /></Feld></div>
              <div className="flex items-end"><Button type="submit" laedt={legtAn}>Reservieren</Button></div>
            </form>
            {neu.fehler && <Hinweis ton="fehler" className="mt-3">{neu.fehler}</Hinweis>}
            {neu.erfolg && <Hinweis ton="erfolg" className="mt-3">{neu.erfolg}</Hinweis>}
          </KarteInhalt>
        </Karte>
      )}

      {erg.fehler && <Hinweis ton="fehler">{erg.fehler}</Hinweis>}
      {erg.erfolg && <Hinweis ton="erfolg">{erg.erfolg}</Hinweis>}

      {zeilen.length === 0 ? (
        <Hinweis>Keine Reservierungen.</Hinweis>
      ) : (
        <div className="space-y-2">
          {zeilen.map((r) => {
            const name = r.kontakt ? [r.kontakt.vorname, r.kontakt.nachname].filter(Boolean).join(" ") || r.kontakt.firma || "Interessent" : "ohne Interessent";
            const laeuftAb = r.status === "aktiv" && r.reserviert_bis && new Date(r.reserviert_bis).getTime() - jetzt < 7 * 86_400_000;
            return (
              <div key={r.id} className="rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {r.objekt ? <Link href={`/objekte/${r.objekt.id}`} className="text-sm font-medium text-text hover:underline">{r.objekt.objektnummer} · {r.objekt.bezeichnung}</Link> : <p className="text-sm font-medium text-text">Objekt entfernt</p>}
                  <Marke ton={TON[r.status]}>{RESERVIERUNG_STATUS[r.status]}</Marke>
                  {laeuftAb && <Marke ton="warnung">läuft bald ab</Marke>}
                  {r.gebuehr > 0 && <Marke ton={r.gebuehr_bezahlt_am ? "erfolg" : "neutral"}>{euro(r.gebuehr)} {r.gebuehr_bezahlt_am ? `bezahlt ${datum(r.gebuehr_bezahlt_am)}` : "offen"}{r.gebuehr_anrechenbar ? ", anrechenbar" : ""}</Marke>}
                </div>
                <p className="mt-0.5 text-[13px] text-gedaempft">
                  {[r.kontakt ? <Link key="k" href={`/kontakte/${r.kontakt.id}`} className="hover:underline">{name}</Link> : name, r.reserviert_bis ? `bis ${datum(r.reserviert_bis)}` : "ohne Enddatum", `angelegt ${datum(r.erstellt_am)}`, r.aufhebungsgrund ? `Grund: ${r.aufhebungsgrund}` : null].filter(Boolean).map((t, i) => <span key={i}>{i > 0 ? " · " : ""}{t}</span>)}
                </p>
                {r.notizen && <p className="mt-1 text-[13px] text-text">{r.notizen}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.vertrag_id && <Link href={`/vertraege/${r.vertrag_id}`} className="text-[12px] text-akzent hover:underline">Reservierungsvereinbarung</Link>}
                  {darfAendern && r.status === "angefragt" && <Statusknopf id={r.id} status="aktiv" text="Aktivieren" aktion={statusAktion} laedt={wechselt} />}
                  {darfAendern && r.gebuehr > 0 && !r.gebuehr_bezahlt_am && (r.status === "aktiv" || r.status === "angefragt") && (
                    <form action={statusAktion} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={r.status} />
                      <input type="hidden" name="gebuehr_bezahlt_am" value={heute} />
                      <Button type="submit" variante="leise" groesse="klein" laedt={wechselt}>Gebühr als bezahlt vermerken</Button>
                    </form>
                  )}
                  {darfAendern && r.status === "aktiv" && <Statusknopf id={r.id} status="abgeschlossen" text="Abgeschlossen (verkauft)" aktion={statusAktion} laedt={wechselt} />}
                  {darfAendern && (r.status === "aktiv" || r.status === "angefragt") && (
                    <form action={statusAktion} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="aufgehoben" />
                      <Eingabe name="grund" placeholder="Grund der Aufhebung" className="h-8 w-48 text-[12px]" />
                      <Button type="submit" variante="gefahr" groesse="klein" laedt={wechselt}>Aufheben</Button>
                    </form>
                  )}
                  {darfAendern && r.status === "abgelaufen" && <Statusknopf id={r.id} status="aktiv" text="Verlängern (wieder aktiv)" aktion={statusAktion} laedt={wechselt} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Statusknopf({ id, status, text, aktion, laedt }: { id: string; status: ReservierungStatus; text: string; aktion: (f: FormData) => void; laedt: boolean }) {
  return (
    <form action={aktion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variante="sekundaer" groesse="klein" laedt={laedt}>{text}</Button>
    </form>
  );
}
