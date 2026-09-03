"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { OBJEKTARTEN, RADAR_STATUS, type RadarZeile } from "@/lib/akquise/stammdaten";
import { datum, euro } from "@/lib/format";
import { radarErfassen, radarStatus, radarUebernehmen, type AkquiseErgebnis } from "@/server/akquise-aktionen";

/**
 * Akquise-Radar (Referenz „Aus Akquise-Radar"): Privatinserate von Hand
 * erfassen (oder ueber die Schnittstelle) und als Lead uebernehmen. Kein
 * automatisches Auslesen fremder Portale — rechtliche Pruefung offen.
 */
export function RadarWerkzeuge({ zeilen, darfAnlegen, darfAendern }: { zeilen: RadarZeile[]; darfAnlegen: boolean; darfAendern: boolean }) {
  const [erg, aktion, laeuft] = useActionState<AkquiseErgebnis, FormData>(radarErfassen, {});
  const [ueb, uebAktion, uebernimmt] = useActionState<AkquiseErgebnis, FormData>(radarUebernehmen, {});
  return (
    <div className="space-y-5">
      {darfAnlegen && (
        <Karte>
          <KarteKopf><KarteTitel>Inserat erfassen</KarteTitel><KarteBeschreibung>Anschrift und Angaben aus dem Inserat, Quelle und Link. Ein Anruf beim Privatanbieter ist nur mit dessen Einwilligung oder bestehender Geschäftsbeziehung zulässig (§ 7 UWG) — bitte vorher prüfen.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            <form action={aktion} className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Feld id="ra-titel" beschriftung="Titel des Inserats"><Eingabe name="titel" /></Feld></div>
              <div className="sm:col-span-2"><Feld id="ra-strasse" beschriftung="Straße, Nr."><Eingabe name="strasse" /></Feld></div>
              <Feld id="ra-plz" beschriftung="PLZ"><Eingabe name="plz" /></Feld>
              <Feld id="ra-ort" beschriftung="Ort"><Eingabe name="ort" /></Feld>
              <Feld id="ra-objektart" beschriftung="Objektart"><Auswahl name="objektart" defaultValue=""><option value="">—</option>{OBJEKTARTEN.map((o) => <option key={o} value={o}>{o}</option>)}</Auswahl></Feld>
              <Feld id="ra-flaeche" beschriftung="Wohnfläche (m²)"><Eingabe name="wohnflaeche" inputMode="decimal" /></Feld>
              <Feld id="ra-preis" beschriftung="Preis (€)"><Eingabe name="preis" inputMode="decimal" /></Feld>
              <Feld id="ra-anbieter" beschriftung="Anbieter"><Auswahl name="anbieter_typ" defaultValue="privat"><option value="privat">Privat</option><option value="gewerblich">Gewerblich</option><option value="unbekannt">Unbekannt</option></Auswahl></Feld>
              <Feld id="ra-quelle" beschriftung="Quelle"><Eingabe name="quelle" placeholder="Portal, Zeitung, Aushang" /></Feld>
              <Feld id="ra-telefon" beschriftung="Telefon laut Inserat"><Eingabe name="telefon" /></Feld>
              <div className="sm:col-span-3"><Feld id="ra-url" beschriftung="Link"><Eingabe name="url" type="url" /></Feld></div>
              <div className="sm:col-span-2"><Feld id="ra-notiz" beschriftung="Notiz"><Textfeld name="notiz" rows={1} /></Feld></div>
              <div className="flex items-end"><Button type="submit" laedt={laeuft}>Erfassen</Button></div>
              {erg.fehler && <Hinweis ton="fehler" className="sm:col-span-6">{erg.fehler}</Hinweis>}
              {erg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-6">{erg.erfolg}</Hinweis>}
            </form>
          </KarteInhalt>
        </Karte>
      )}
      {ueb.fehler && <Hinweis ton="fehler">{ueb.fehler}</Hinweis>}
      {ueb.erfolg && <Hinweis ton="erfolg">{ueb.erfolg} {ueb.id && <Link href={`/akquise/leads/${ueb.id}`} className="underline">Zum Lead</Link>}</Hinweis>}
      {zeilen.length === 0 ? <Hinweis>Keine Inserate erfasst.</Hinweis> : (
        <ul className="divide-y divide-linie rounded-[var(--radius-gross)] border border-linie bg-flaeche px-4">
          {zeilen.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="text-text">{[r.strasse, [r.plz, r.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || r.titel || "(ohne Adresse)"} {r.anbieter_typ === "privat" && <Marke ton="akzent">Privatanbieter</Marke>} <Marke ton={r.status === "neu" ? "info" : r.status === "uebernommen" ? "erfolg" : "neutral"}>{RADAR_STATUS[r.status]}</Marke></p>
                <p className="text-[11px] text-gedaempft">{[r.titel && r.strasse ? r.titel : null, r.objektart, r.wohnflaeche ? `${r.wohnflaeche} m²` : null, r.preis ? euro(r.preis) : null, r.quelle, datum(r.erstellt_am)].filter(Boolean).join(" · ")}{r.url && <> · <a href={r.url} target="_blank" rel="noreferrer" className="text-akzent hover:underline">Inserat</a></>}</p>
              </div>
              {r.lead_id && <Link href={`/akquise/leads/${r.lead_id}`} className="text-[12px] text-akzent hover:underline">Zum Lead</Link>}
              {darfAnlegen && r.status === "neu" && <form action={uebAktion}><input type="hidden" name="radar_id" value={r.id} /><Button type="submit" variante="sekundaer" groesse="klein" laedt={uebernimmt}>Als Lead übernehmen</Button></form>}
              {darfAendern && r.status === "neu" && <form action={radarStatus}><input type="hidden" name="radar_id" value={r.id} /><input type="hidden" name="status" value="verworfen" /><Button type="submit" variante="leise" groesse="klein">Verwerfen</Button></form>}
              {darfAendern && r.status === "verworfen" && <form action={radarStatus}><input type="hidden" name="radar_id" value={r.id} /><input type="hidden" name="status" value="neu" /><Button type="submit" variante="leise" groesse="klein">Wieder aufnehmen</Button></form>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
