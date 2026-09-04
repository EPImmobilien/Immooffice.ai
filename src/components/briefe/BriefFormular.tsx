"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum } from "@/lib/format";
import type { Brief } from "@/lib/rechnungen";
import { briefAlsVersendet, briefErstellen, briefLoeschen, briefSpeichern, type BriefErgebnis } from "@/server/briefe-aktionen";

const STATUS: Record<Brief["status"], string> = { entwurf: "Entwurf", erstellt: "PDF erstellt", versendet: "Versendet" };
const TON: Record<Brief["status"], "neutral" | "info" | "erfolg"> = { entwurf: "neutral", erstellt: "info", versendet: "erfolg" };

/** Geschaeftsbrief: Empfaenger, Betreff, Anrede, Text, Gruss und Unterzeichner — PDF auf Briefpapier, Versand per Post oder Postfach. */
export function BriefFormular({ brief, absender, objekte, kontakte, darfAendern, darfLoeschen }: { brief: Brief; absender: Array<{ id: string; name: string }>; objekte: Array<{ id: string; bezeichnung: string }>; kontakte: Array<{ id: string; bezeichnung: string }>; darfAendern: boolean; darfLoeschen: boolean }) {
  const b = brief;
  const [speichern, speichernAktion, speichert] = useActionState<BriefErgebnis, FormData>(briefSpeichern, {});
  const [erstellen, erstellenAktion, erstellt] = useActionState<BriefErgebnis, FormData>(briefErstellen, {});
  const [versendet, versendetAktion, vermerkt] = useActionState<BriefErgebnis, FormData>(briefAlsVersendet, {});
  const [email, setEmail] = useState(b.empfaenger_email ?? "");
  const mailLink = `/postfach?${new URLSearchParams({ neu: "1", an: email, betreff: b.betreff, text: `${b.anrede}\n\n${b.text}\n\n${b.grussformel}\n${b.unterzeichner ?? ""}`.trim(), anhang_art: "brief", anhang_id: b.id }).toString()}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Marke ton={TON[b.status]}>{STATUS[b.status]}</Marke>
        {b.versendet_am && <span className="text-[13px] text-gedaempft">versendet am {datum(b.versendet_am)}</span>}
        <a href={`/api/dokumente/brief/${b.id}?format=pdf`} target="_blank" rel="noreferrer" className={buttonKlassen({ variante: "sekundaer" })}>PDF</a>
        <a href={`/api/dokumente/brief/${b.id}?format=docx`} className={buttonKlassen({ variante: "sekundaer" })}>Word</a>
        <Link href={mailLink} className={buttonKlassen({ variante: "leise" })}>Per E-Mail senden</Link>
      </div>
      {(speichern.fehler || erstellen.fehler || versendet.fehler) && <Hinweis ton="fehler">{speichern.fehler ?? erstellen.fehler ?? versendet.fehler}</Hinweis>}
      {(speichern.erfolg || erstellen.erfolg || versendet.erfolg) && <Hinweis ton="erfolg">{versendet.erfolg ?? erstellen.erfolg ?? speichern.erfolg}</Hinweis>}

      <form action={speichernAktion} className="space-y-5">
        <input type="hidden" name="id" value={b.id} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Karte>
            <KarteKopf><KarteTitel>Empfänger</KarteTitel></KarteKopf>
            <KarteInhalt className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3"><Feld id="br-name" beschriftung="Name / Behörde / Firma" pflicht><Eingabe name="empfaenger_name" required defaultValue={b.empfaenger_name} readOnly={!darfAendern} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="br-zusatz" beschriftung="Zusatz (Abteilung, Ansprechpartner)"><Eingabe name="empfaenger_zusatz" defaultValue={b.empfaenger_zusatz ?? ""} readOnly={!darfAendern} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="br-strasse" beschriftung="Straße, Hausnummer"><Eingabe name="empfaenger_strasse" defaultValue={b.empfaenger_strasse ?? ""} readOnly={!darfAendern} /></Feld></div>
              <Feld id="br-plz" beschriftung="PLZ"><Eingabe name="empfaenger_plz" defaultValue={b.empfaenger_plz ?? ""} readOnly={!darfAendern} /></Feld>
              <div className="sm:col-span-2"><Feld id="br-ort" beschriftung="Ort"><Eingabe name="empfaenger_ort" defaultValue={b.empfaenger_ort ?? ""} readOnly={!darfAendern} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="br-email" beschriftung="E-Mail (für den Versand aus dem Postfach)"><Eingabe name="empfaenger_email" type="email" value={email} readOnly={!darfAendern} onChange={(e) => setEmail(e.target.value)} /></Feld></div>
            </KarteInhalt>
          </Karte>
          <Karte>
            <KarteKopf><KarteTitel>Bezug und Briefpapier</KarteTitel></KarteKopf>
            <KarteInhalt className="grid gap-3">
              <Feld id="br-absender" beschriftung="Absender / Briefpapier"><Auswahl name="absender_id" defaultValue={b.absender_id ?? ""} disabled={!darfAendern}><option value="">— Firmendaten —</option>{absender.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Auswahl></Feld>
              <Feld id="br-kontakt" beschriftung="Kontakt"><Auswahl name="kontakt_id" defaultValue={b.kontakt_id ?? ""} disabled={!darfAendern}><option value="">— ohne —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}</Auswahl></Feld>
              <Feld id="br-objekt" beschriftung="Objekt"><Auswahl name="objekt_id" defaultValue={b.objekt_id ?? ""} disabled={!darfAendern}><option value="">— ohne —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
              <Feld id="br-datum" beschriftung="Datum"><Eingabe name="datum" type="date" defaultValue={b.datum} readOnly={!darfAendern} /></Feld>
            </KarteInhalt>
          </Karte>
        </div>
        <Karte>
          <KarteKopf><KarteTitel>Brieftext</KarteTitel><KarteBeschreibung>Platzhalter wie „…“ bitte ersetzen. Der Text erscheint auf dem Briefpapier mit Anschriftfeld, Datum und Unterschriftszeile.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Feld id="br-betreff" beschriftung="Betreff" pflicht><Eingabe name="betreff" required defaultValue={b.betreff} readOnly={!darfAendern} /></Feld></div>
            <div className="sm:col-span-2"><Feld id="br-anrede" beschriftung="Anrede"><Eingabe name="anrede" defaultValue={b.anrede} readOnly={!darfAendern} /></Feld></div>
            <div className="sm:col-span-2"><Feld id="br-text" beschriftung="Text" pflicht><Textfeld name="text" rows={14} defaultValue={b.text} readOnly={!darfAendern} /></Feld></div>
            <Feld id="br-gruss" beschriftung="Grußformel"><Eingabe name="grussformel" defaultValue={b.grussformel} readOnly={!darfAendern} /></Feld>
            <div className="grid gap-3 sm:grid-cols-2">
              <Feld id="br-unterz" beschriftung="Unterzeichner"><Eingabe name="unterzeichner" defaultValue={b.unterzeichner ?? ""} readOnly={!darfAendern} /></Feld>
              <Feld id="br-funktion" beschriftung="Funktion"><Eingabe name="unterzeichner_funktion" defaultValue={b.unterzeichner_funktion ?? ""} readOnly={!darfAendern} placeholder="Geschäftsführer" /></Feld>
            </div>
          </KarteInhalt>
        </Karte>
        {darfAendern && <Button type="submit" disabled={speichert}>{speichert ? "Speichert …" : "Speichern"}</Button>}
      </form>

      {darfAendern && (
        <div className="flex flex-wrap gap-2">
          <form action={erstellenAktion}><input type="hidden" name="id" value={b.id} /><Button type="submit" variante="sekundaer" disabled={erstellt}>{erstellt ? "Erstellt …" : "PDF erstellen und ablegen"}</Button></form>
          {b.status !== "versendet" && <form action={versendetAktion}><input type="hidden" name="id" value={b.id} /><Button type="submit" variante="leise" disabled={vermerkt}>Als per Post versendet vermerken</Button></form>}
          {darfLoeschen && <form action={briefLoeschen}><input type="hidden" name="id" value={b.id} /><Button type="submit" variante="leise">Brief löschen</Button></form>}
        </div>
      )}
    </div>
  );
}
