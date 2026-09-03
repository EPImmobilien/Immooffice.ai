"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import type { Antwortvorlage } from "@/lib/vermietung/anfragen";
import { antwortvorlageSpeichern, selbstauskunftLinkAnlegen, selbstauskunftLinkSchalten, type VermietungErgebnis } from "@/server/vermietung-aktionen";

interface LinkZeile { id: string; bezeichnung: string; url: string; aktiv: boolean; objekt: string | null }

/** Selbstauskunft-Links und Antwortvorlagen. */
export function AnfragenWerkzeuge({ objekte, links, vorlagen, darfAnlegen, istVerwaltung }: { objekte: { id: string; objektnummer: string; bezeichnung: string }[]; links: LinkZeile[]; vorlagen: Antwortvorlage[]; darfAnlegen: boolean; istVerwaltung: boolean }) {
  const [neu, neuAktion, legtAn] = useActionState<VermietungErgebnis, FormData>(selbstauskunftLinkAnlegen, {});
  const [vorlage, vorlageAktion, speichert] = useActionState<VermietungErgebnis, FormData>(antwortvorlageSpeichern, {});
  const [gewaehlt, setGewaehlt] = useState(vorlagen[0]?.schluessel ?? "eingang");
  const aktuelle = vorlagen.find((v) => v.schluessel === gewaehlt) ?? vorlagen[0];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Karte>
        <KarteKopf>
          <KarteTitel>Selbstauskunft-Formular</KarteTitel>
          <KarteBeschreibung>Ein Link je Objekt oder ein allgemeiner Link. Interessenten füllen die Mieterselbstauskunft ohne Konto aus; das Ergebnis erscheint hier als Anfrage.</KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="space-y-3">
          {links.length === 0 ? <p className="text-[13px] text-gedaempft">Noch kein Link.</p> : (
            <ul className="divide-y divide-linie">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="text-text">{l.bezeichnung}{l.objekt ? ` · ${l.objekt}` : ""} {!l.aktiv && <Marke ton="warnung">deaktiviert</Marke>}</p>
                    <code className="block truncate font-mono text-[11px] text-gedaempft">{l.url}</code>
                  </div>
                  {darfAnlegen && (
                    <form action={selbstauskunftLinkSchalten}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="aktiv" value={l.aktiv ? "0" : "1"} />
                      <Button type="submit" variante="leise" groesse="klein">{l.aktiv ? "Deaktivieren" : "Aktivieren"}</Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {neu.link && <Hinweis ton="erfolg">Neuer Link: <code className="font-mono text-[12px] break-all select-all">{neu.link}</code></Hinweis>}
          {neu.fehler && <Hinweis ton="fehler">{neu.fehler}</Hinweis>}
          {darfAnlegen && (
            <form action={neuAktion} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Feld id="sl-bez" beschriftung="Bezeichnung"><Eingabe name="bezeichnung" placeholder="Selbstauskunft" /></Feld>
              <Feld id="sl-objekt" beschriftung="Objekt"><Auswahl name="objekt_id" defaultValue=""><option value="">allgemein</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer}</option>)}</Auswahl></Feld>
              <Button type="submit" variante="sekundaer" laedt={legtAn}>Link anlegen</Button>
            </form>
          )}
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Antwortvorlagen</KarteTitel>
          <KarteBeschreibung>Platzhalter: {"{anrede} {name} {objekt} {termin} {absender} {firma} {link}"}. Vorgaben lassen sich je Unternehmen überschreiben.</KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="space-y-3">
          <Feld id="av-wahl" beschriftung="Vorlage">
            <Auswahl value={gewaehlt} onChange={(e) => setGewaehlt(e.target.value)}>{vorlagen.map((v) => <option key={v.schluessel} value={v.schluessel}>{v.bezeichnung}</option>)}</Auswahl>
          </Feld>
          {aktuelle && (
            <form key={aktuelle.schluessel} action={vorlageAktion} className="space-y-2">
              <input type="hidden" name="schluessel" value={aktuelle.schluessel} />
              <Feld id="av-betreff" beschriftung="Betreff"><Eingabe name="betreff" defaultValue={aktuelle.betreff} readOnly={!istVerwaltung} /></Feld>
              <Feld id="av-text" beschriftung="Text"><Textfeld name="text" rows={9} defaultValue={aktuelle.text} readOnly={!istVerwaltung} /></Feld>
              {vorlage.fehler && <Hinweis ton="fehler">{vorlage.fehler}</Hinweis>}
              {vorlage.erfolg && <Hinweis ton="erfolg">{vorlage.erfolg}</Hinweis>}
              {istVerwaltung && <Button type="submit" variante="sekundaer" groesse="klein" laedt={speichert}>Vorlage speichern</Button>}
            </form>
          )}
        </KarteInhalt>
      </Karte>
    </div>
  );
}
