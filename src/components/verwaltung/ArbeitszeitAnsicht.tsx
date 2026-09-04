"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { uhrzeit } from "@/lib/format";
import { TAG_ARTEN, stundenText, type Monatsbilanz, type Wochenmodell } from "@/lib/verwaltung/arbeitszeit";
import { feierabendNachtragen, tagNachtragen, wochenmodellLoeschen, wochenmodellSpeichern, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

function Meldung({ z }: { z: VerwaltungErgebnis }) { return <>{z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}{z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}</>; }

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Arbeitszeit-Monat (Referenz: Arbeitszeit): Soll/Ist je Tag, Nachtragen, Wochenmodelle (Verwaltung). */
export function ArbeitszeitAnsicht({ jahr, monat, benutzerId, bilanz, modelle, team, istVerwaltung }: {
  jahr: number; monat: number; benutzerId: string; bilanz: Monatsbilanz; modelle: Wochenmodell[];
  team: Array<{ id: string; name: string }>; istVerwaltung: boolean;
}) {
  const [nachtrag, setNachtrag] = useState<string | null>(null);
  const vor = monat === 1 ? `${jahr - 1}-12` : `${jahr}-${String(monat - 1).padStart(2, "0")}`;
  const nach = monat === 12 ? `${jahr + 1}-01` : `${jahr}-${String(monat + 1).padStart(2, "0")}`;
  const monatName = new Date(Date.UTC(jahr, monat - 1, 1)).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px]">
          <Link href={`/arbeitszeit?monat=${vor}&benutzer=${benutzerId}`} className="rounded-[var(--radius)] border border-linie px-2 py-1 hover:text-text">‹</Link>
          <span className="font-medium">{monatName}</span>
          <Link href={`/arbeitszeit?monat=${nach}&benutzer=${benutzerId}`} className="rounded-[var(--radius)] border border-linie px-2 py-1 hover:text-text">›</Link>
        </div>
        {istVerwaltung && team.length > 1 && (
          <form method="get" action="/arbeitszeit" className="flex items-center gap-2 text-[13px]">
            <input type="hidden" name="monat" value={`${jahr}-${String(monat).padStart(2, "0")}`} />
            <Auswahl name="benutzer" defaultValue={benutzerId} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Mitarbeiter" className="w-auto">{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Auswahl>
          </form>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-[13px]">
        {[["Soll", stundenText(bilanz.soll)], ["Ist", stundenText(bilanz.ist)], ["Saldo", stundenText(bilanz.saldo)], ["Urlaub / Krank", `${bilanz.urlaubstage} / ${bilanz.kranktage} Tage`], ["Offene Tage", String(bilanz.offene)]].map(([l, v]) => (
          <div key={l} className={`rounded-[var(--radius)] border p-3 ${l === "Offene Tage" && bilanz.offene > 0 ? "border-warnung bg-warnung-schwach" : l === "Saldo" && bilanz.saldo < 0 ? "border-linie" : "border-linie bg-flaeche"}`}><p className="text-[11px] uppercase tracking-wide text-gedaempft">{l}</p><p className="font-titel text-lg font-semibold">{v}</p></div>
        ))}
      </div>
      <Karte>
        <KarteKopf><KarteTitel>Tage</KarteTitel><KarteBeschreibung>Kommen/Gehen-Paare zählen, Lücken sind Pause. Ein Tag ohne Feierabend zählt nicht und ist als „offen“ markiert — bitte nachtragen.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-gedaempft"><th className="py-1 pr-2">Tag</th><th className="py-1 pr-2">Soll</th><th className="py-1 pr-2">Ist</th><th className="py-1 pr-2">Art</th><th className="py-1 pr-2">Stempel</th><th className="py-1 pr-2">Bemerkung</th><th /></tr></thead><tbody>
            {bilanz.zeilen.map((z) => (
              <tr key={z.datum} className={`border-t border-linie ${z.wochenende || z.feiertag ? "text-gedaempft" : ""} ${z.offen && !z.art ? "bg-warnung-schwach" : ""}`}>
                <td className="py-1 pr-2 whitespace-nowrap">{WOCHENTAGE[new Date(`${z.datum}T12:00:00Z`).getUTCDay()]} {z.datum.slice(8)}.{z.datum.slice(5, 7)}.{z.feiertag ? <span className="ml-1 text-[11px]">{z.feiertag}</span> : null}</td>
                <td className="py-1 pr-2">{z.soll > 0 ? stundenText(z.soll) : "—"}</td>
                <td className="py-1 pr-2">{z.ist > 0 ? stundenText(z.ist) : z.offen ? <Marke ton="warnung">offen</Marke> : "—"}</td>
                <td className="py-1 pr-2">{z.art ? <Marke ton={z.art === "urlaub" ? "akzent" : z.art === "krank" ? "warnung" : "neutral"}>{TAG_ARTEN[z.art]}</Marke> : ""}</td>
                <td className="py-1 pr-2 text-[11px] text-gedaempft">{z.paare.map((p) => `${uhrzeit(p.von)}–${uhrzeit(p.bis)}`).join(", ")}{z.offen ? ` ${uhrzeit(z.offen)}–?` : ""}</td>
                <td className="py-1 pr-2 text-[12px]">{z.bemerkung}</td>
                <td className="py-1 text-right"><button type="button" className="text-[12px] text-akzent hover:underline" onClick={() => setNachtrag(nachtrag === z.datum ? null : z.datum)}>{z.offen && !z.art ? "Feierabend nachtragen" : "Nachtragen"}</button></td>
              </tr>
            ))}
          </tbody></table></div>
          {nachtrag && <NachtragFormular datum={nachtrag} benutzerId={benutzerId} offen={bilanz.zeilen.find((z) => z.datum === nachtrag)?.offen ?? null} onFertig={() => setNachtrag(null)} />}
        </KarteInhalt>
      </Karte>
      <Karte>
        <KarteKopf><KarteTitel>Wochenmodell</KarteTitel><KarteBeschreibung>Sollstunden je Wochentag ab einem Datum; das jüngste passende Modell gilt.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3 text-[13px]">
          {modelle.length === 0 && <p className="text-gedaempft">Kein Wochenmodell — ohne Modell gibt es kein Soll.</p>}
          {modelle.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-linie px-2 py-1">
              <span>ab {m.gueltig_ab.split("-").reverse().join(".")} · Mo {m.stunden_mo} · Di {m.stunden_di} · Mi {m.stunden_mi} · Do {m.stunden_do} · Fr {m.stunden_fr} · Sa {m.stunden_sa} · So {m.stunden_so} <span className="text-gedaempft">= {Number(m.stunden_mo) + Number(m.stunden_di) + Number(m.stunden_mi) + Number(m.stunden_do) + Number(m.stunden_fr) + Number(m.stunden_sa) + Number(m.stunden_so)} h/Woche</span></span>
              {istVerwaltung && <form action={wochenmodellLoeschen}><input type="hidden" name="id" value={m.id} /><button type="submit" className="text-gedaempft hover:text-fehler">Löschen</button></form>}
            </div>
          ))}
          {istVerwaltung && <ModellFormular benutzerId={benutzerId} />}
        </KarteInhalt>
      </Karte>
    </div>
  );
}

function NachtragFormular({ datum, benutzerId, offen, onFertig }: { datum: string; benutzerId: string; offen: string | null; onFertig: () => void }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(tagNachtragen, {});
  const [zf, feierabend, laeuftF] = useActionState<VerwaltungErgebnis, FormData>(feierabendNachtragen, {});
  const [art, setArt] = useState("arbeit");
  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius)] border border-linie bg-hintergrund p-3 text-[13px]">
      <p className="font-medium">{datum.split("-").reverse().join(".")}</p>
      {offen && (
        <form action={feierabend} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="datum" value={datum} /><input type="hidden" name="benutzer_id" value={benutzerId} />
          <Feld id={`fa-${datum}`} beschriftung={`Feierabend (Kommen ${uhrzeit(offen)})`}><Eingabe id={`fa-${datum}`} name="zeit" type="time" defaultValue="17:00" /></Feld>
          <Button type="submit" groesse="klein" disabled={laeuftF}>Feierabend nachtragen</Button>
          <Button type="submit" name="verwerfen" value="1" groesse="klein" variante="leise" disabled={laeuftF}>Stempel verwerfen</Button>
          <Meldung z={zf} />
        </form>
      )}
      <form action={aktion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="datum" value={datum} /><input type="hidden" name="benutzer_id" value={benutzerId} />
        <Feld id={`na-art-${datum}`} beschriftung="Art"><Auswahl id={`na-art-${datum}`} name="art" value={art} onChange={(e) => setArt(e.target.value)}>{Object.entries(TAG_ARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
        {art === "arbeit" && <>
          <Feld id={`na-von-${datum}`} beschriftung="Von"><Eingabe id={`na-von-${datum}`} name="von" type="time" /></Feld>
          <Feld id={`na-bis-${datum}`} beschriftung="Bis"><Eingabe id={`na-bis-${datum}`} name="bis" type="time" /></Feld>
          <Feld id={`na-std-${datum}`} beschriftung="oder Stunden"><Eingabe id={`na-std-${datum}`} name="stunden" inputMode="decimal" placeholder="7,5" className="w-24" /></Feld>
        </>}
        <Feld id={`na-bem-${datum}`} beschriftung="Bemerkung"><Eingabe id={`na-bem-${datum}`} name="bemerkung" maxLength={500} /></Feld>
        {offen && <input type="hidden" name="stempel_verwerfen" value="1" />}
        <Button type="submit" groesse="klein" disabled={laeuft}>Speichern</Button>
        <Button type="submit" name="loeschen" value="1" groesse="klein" variante="leise" disabled={laeuft}>Eintrag entfernen</Button>
        <Button type="button" groesse="klein" variante="leise" onClick={onFertig}>Schließen</Button>
        <Meldung z={z} />
      </form>
    </div>
  );
}

function ModellFormular({ benutzerId }: { benutzerId: string }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(wochenmodellSpeichern, {});
  return (
    <form action={aktion} className="flex flex-wrap items-end gap-2 border-t border-linie pt-3">
      <input type="hidden" name="benutzer_id" value={benutzerId} />
      <Feld id="wm-ab" beschriftung="Gültig ab" pflicht><Eingabe id="wm-ab" name="gueltig_ab" type="date" required /></Feld>
      {(["mo", "di", "mi", "do", "fr", "sa", "so"] as const).map((t) => <Feld key={t} id={`wm-${t}`} beschriftung={t.toUpperCase()}><Eingabe id={`wm-${t}`} name={`stunden_${t}`} inputMode="decimal" defaultValue={t === "sa" || t === "so" ? 0 : 8} className="w-16" /></Feld>)}
      <Button type="submit" groesse="klein" disabled={laeuft}>Modell speichern</Button>
      <Meldung z={z} />
    </form>
  );
}
