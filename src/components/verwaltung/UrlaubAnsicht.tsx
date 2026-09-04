"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum } from "@/lib/format";
import { BUNDESLAENDER, arbeitstage, type Bundesland } from "@/lib/verwaltung/feiertage";
import { URLAUB_STATUS, type Bilanz, type UrlaubAntrag } from "@/lib/verwaltung/urlaub";
import { mitarbeiterKontingentSpeichern, urlaubBeantragen, urlaubEntscheiden, urlaubHinweisSenden, urlaubStornieren, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

function Meldung({ z }: { z: VerwaltungErgebnis }) { return <>{z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}{z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}</>; }

export interface UrlaubZeile {
  benutzer: { id: string; name: string; eintritt: string | null; urlaubstage_jahr: number; urlaub_uebertrag: number; urlaub_staffel: Record<string, number> | null; bundesland: string | null; rolle: string };
  bilanz: Bilanz;
  naechster: UrlaubAntrag | null;
  hinweis: { gesendet_am: string; resttage: number } | null;
}

/** Urlaub (Referenz: Admin → Urlaub, Mitarbeiter → Antrag): Bilanz je Person, Anträge, Entscheidung, Kontingente, Hinweise. */
export function UrlaubAnsicht({ jahr, eigeneId, zeilen, offene, istVerwaltung }: { jahr: number; eigeneId: string; zeilen: UrlaubZeile[]; offene: Array<UrlaubAntrag & { name: string; ueberschneidungen: string[] }>; istVerwaltung: boolean }) {
  const eigene = zeilen.find((z) => z.benutzer.id === eigeneId);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <a href={`/urlaub?jahr=${jahr - 1}`} className="rounded-[var(--radius)] border border-linie px-2 py-1">‹</a><span className="font-medium">{jahr}</span><a href={`/urlaub?jahr=${jahr + 1}`} className="rounded-[var(--radius)] border border-linie px-2 py-1">›</a>
      </div>
      {eigene && <BilanzKarte z={eigene} jahr={jahr} eigene />}
      <Karte>
        <KarteKopf><KarteTitel>Urlaub beantragen</KarteTitel><KarteBeschreibung>Arbeitstage werden automatisch ohne Wochenende und Feiertage gezählt. Die Verwaltung entscheidet und sieht den Antrag als Aufgabe.</KarteBeschreibung></KarteKopf>
        <KarteInhalt><AntragFormular eigeneId={eigeneId} zeilen={zeilen} istVerwaltung={istVerwaltung} /></KarteInhalt>
      </Karte>
      {eigene && eigene.bilanz.eintraege.length > 0 && (
        <Karte><KarteKopf><KarteTitel>Meine Anträge {jahr}</KarteTitel></KarteKopf><KarteInhalt><AntragListe antraege={eigene.bilanz.eintraege} darfStornieren /></KarteInhalt></Karte>
      )}
      {istVerwaltung && (
        <>
          <Karte>
            <KarteKopf><KarteTitel>Offene Anträge</KarteTitel><KarteBeschreibung>Überschneidungen mit anderen Abwesenheiten sind markiert.</KarteBeschreibung></KarteKopf>
            <KarteInhalt className="space-y-2 text-[13px]">
              {offene.length === 0 && <p className="text-gedaempft">Keine offenen Anträge.</p>}
              {offene.map((a) => <Entscheidung key={a.id} a={a} />)}
            </KarteInhalt>
          </Karte>
          <Karte>
            <KarteKopf><KarteTitel>Team-Übersicht {jahr}</KarteTitel><KarteBeschreibung>Anspruch, genommen, offen, Rest — und Resturlaub-Hinweise vor dem Verfall am 31. März.</KarteBeschreibung></KarteKopf>
            <KarteInhalt className="space-y-3">{zeilen.map((z) => <BilanzKarte key={z.benutzer.id} z={z} jahr={jahr} verwaltung />)}</KarteInhalt>
          </Karte>
        </>
      )}
    </div>
  );
}

function BilanzKarte({ z, jahr, eigene, verwaltung }: { z: UrlaubZeile; jahr: number; eigene?: boolean; verwaltung?: boolean }) {
  const b = z.bilanz;
  const [offen, setOffen] = useState(false);
  const [zh, hinweis, laeuftH] = useActionState<VerwaltungErgebnis, FormData>(urlaubHinweisSenden, {});
  return (
    <div className="rounded-[var(--radius)] border border-linie p-3 text-[13px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{eigene ? "Mein Urlaub" : z.benutzer.name}{b.anteilig ? <span className="ml-2 text-[11px] text-gedaempft">anteilig ({b.monate}/12 Monate)</span> : null}</p>
          <p className="text-[12px] text-gedaempft">Anspruch {b.jahresanspruch}{b.uebertrag > 0 ? ` + Übertrag ${b.uebertrag}${b.nachFrist ? ` (davon ${b.uebertragGenutzt} genutzt, ${b.uebertragVerfallen} verfallen am ${datum(b.uebertragFrist)})` : ` (bis ${datum(b.uebertragFrist)})`}` : ""} = <strong>{b.anspruch}</strong> · genommen {b.genehmigt} · beantragt {b.beantragt} · <strong>Rest {b.rest}</strong>{z.naechster ? ` · nächster Urlaub ${datum(z.naechster.von)}` : ""}</p>
          {z.hinweis && <p className="text-[11px] text-gedaempft">Resturlaub-Hinweis gesendet {datum(z.hinweis.gesendet_am)} ({z.hinweis.resttage} Tage)</p>}
        </div>
        {verwaltung && (
          <div className="flex flex-wrap gap-2">
            <form action={hinweis}><input type="hidden" name="benutzer_id" value={z.benutzer.id} /><input type="hidden" name="jahr" value={jahr} /><input type="hidden" name="resttage" value={b.rest} /><Button type="submit" groesse="klein" variante="sekundaer" disabled={laeuftH || b.rest <= 0}>Hinweis senden</Button></form>
            <Button type="button" groesse="klein" variante="leise" onClick={() => setOffen(!offen)}>Kontingent</Button>
          </div>
        )}
      </div>
      <Meldung z={zh} />
      {offen && verwaltung && <KontingentFormular b={z.benutzer} jahr={jahr} />}
      {verwaltung && b.eintraege.length > 0 && <div className="mt-2"><AntragListe antraege={b.eintraege} darfStornieren /></div>}
    </div>
  );
}

function AntragListe({ antraege, darfStornieren }: { antraege: UrlaubAntrag[]; darfStornieren: boolean }) {
  return (
    <ul className="space-y-1 text-[12px]">
      {antraege.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2">
          <span>{datum(a.von)}{a.bis !== a.von ? ` – ${datum(a.bis)}` : ""} · {a.arbeitstage} Tage</span>
          <Marke ton={a.status === "genehmigt" ? "erfolg" : a.status === "beantragt" ? "warnung" : "neutral"}>{URLAUB_STATUS[a.status]}</Marke>
          {a.bemerkung && <span className="text-gedaempft">{a.bemerkung}</span>}
          {darfStornieren && (a.status === "beantragt" || (a.status === "genehmigt" && a.von >= new Date().toISOString().slice(0, 10))) && <form action={urlaubStornieren} onSubmit={(e) => { if (!confirm("Antrag stornieren?")) e.preventDefault(); }}><input type="hidden" name="id" value={a.id} /><button type="submit" className="text-gedaempft hover:text-fehler">stornieren</button></form>}
        </li>
      ))}
    </ul>
  );
}

function AntragFormular({ eigeneId, zeilen, istVerwaltung }: { eigeneId: string; zeilen: UrlaubZeile[]; istVerwaltung: boolean }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(urlaubBeantragen, {});
  const [benutzer, setBenutzer] = useState(eigeneId);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const land = (zeilen.find((x) => x.benutzer.id === benutzer)?.benutzer.bundesland as Bundesland | null) ?? null;
  const tage = von && (bis || von) ? arbeitstage(von, bis || von, land).length : 0;
  return (
    <form action={aktion} className="flex flex-wrap items-end gap-3 text-[13px]">
      {istVerwaltung && zeilen.length > 1 ? <Feld id="ua-benutzer" beschriftung="Für"><Auswahl id="ua-benutzer" name="benutzer_id" value={benutzer} onChange={(e) => setBenutzer(e.target.value)}>{zeilen.map((x) => <option key={x.benutzer.id} value={x.benutzer.id}>{x.benutzer.name}</option>)}</Auswahl></Feld> : <input type="hidden" name="benutzer_id" value={eigeneId} />}
      <Feld id="ua-von" beschriftung="Von" pflicht><Eingabe id="ua-von" name="von" type="date" value={von} onChange={(e) => setVon(e.target.value)} required /></Feld>
      <Feld id="ua-bis" beschriftung="Bis"><Eingabe id="ua-bis" name="bis" type="date" value={bis} onChange={(e) => setBis(e.target.value)} min={von} /></Feld>
      <Feld id="ua-bem" beschriftung="Bemerkung"><Eingabe id="ua-bem" name="bemerkung" maxLength={500} /></Feld>
      <p className="pb-2 text-gedaempft">{tage > 0 ? `${tage} Arbeitstag(e)` : ""}</p>
      {istVerwaltung && <label className="flex items-center gap-1 pb-2"><input type="checkbox" name="direkt_genehmigen" value="1" /> direkt genehmigen</label>}
      <Button type="submit" disabled={laeuft || tage === 0}>{laeuft ? "…" : "Antrag stellen"}</Button>
      <div className="w-full"><Meldung z={z} /></div>
    </form>
  );
}

function Entscheidung({ a }: { a: UrlaubAntrag & { name: string; ueberschneidungen: string[] } }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(urlaubEntscheiden, {});
  return (
    <div className="rounded-[var(--radius)] border border-linie p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{a.name}: {datum(a.von)}{a.bis !== a.von ? ` – ${datum(a.bis)}` : ""} · {a.arbeitstage} Tage</p>{a.bemerkung && <p className="text-[12px] text-gedaempft">{a.bemerkung}</p>}{a.ueberschneidungen.length > 0 && <p className="text-[12px] text-warnung">Gleichzeitig abwesend: {a.ueberschneidungen.join(", ")}</p>}</div>
        <form action={aktion} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={a.id} />
          <Textfeld name="antwort" rows={1} placeholder="Antwort (optional)" maxLength={500} className="min-w-[200px]" aria-label="Antwort" />
          <Button type="submit" name="status" value="genehmigt" groesse="klein" disabled={laeuft}>Genehmigen</Button>
          <Button type="submit" name="status" value="abgelehnt" groesse="klein" variante="sekundaer" disabled={laeuft}>Ablehnen</Button>
        </form>
      </div>
      <Meldung z={z} />
    </div>
  );
}

function KontingentFormular({ b, jahr }: { b: UrlaubZeile["benutzer"]; jahr: number }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(mitarbeiterKontingentSpeichern, {});
  return (
    <form action={aktion} className="mt-3 flex flex-wrap items-end gap-2 border-t border-linie pt-3">
      <input type="hidden" name="benutzer_id" value={b.id} />
      <Feld id={`kt-eintritt-${b.id}`} beschriftung="Eintritt"><Eingabe id={`kt-eintritt-${b.id}`} name="eintritt" type="date" defaultValue={b.eintritt ?? ""} /></Feld>
      <Feld id={`kt-tage-${b.id}`} beschriftung="Tage / Jahr"><Eingabe id={`kt-tage-${b.id}`} name="urlaubstage_jahr" inputMode="decimal" defaultValue={b.urlaubstage_jahr} className="w-20" /></Feld>
      <Feld id={`kt-ueb-${b.id}`} beschriftung="Übertrag (manuell)"><Eingabe id={`kt-ueb-${b.id}`} name="urlaub_uebertrag" inputMode="decimal" defaultValue={b.urlaub_uebertrag} className="w-20" /></Feld>
      <Feld id={`kt-st-${b.id}`} beschriftung={`Staffel ${jahr}`}><Eingabe id={`kt-st-${b.id}`} name={`staffel_${jahr}`} inputMode="decimal" defaultValue={b.urlaub_staffel?.[String(jahr)] ?? ""} className="w-20" /></Feld>
      <Feld id={`kt-st2-${b.id}`} beschriftung={`Staffel ${jahr + 1}`}><Eingabe id={`kt-st2-${b.id}`} name={`staffel_${jahr + 1}`} inputMode="decimal" defaultValue={b.urlaub_staffel?.[String(jahr + 1)] ?? ""} className="w-20" /></Feld>
      <Feld id={`kt-land-${b.id}`} beschriftung="Bundesland"><Auswahl id={`kt-land-${b.id}`} name="bundesland" defaultValue={b.bundesland ?? ""}><option value="">bundesweit</option>{Object.entries(BUNDESLAENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
      <Button type="submit" groesse="klein" disabled={laeuft}>Speichern</Button>
      <Meldung z={z} />
    </form>
  );
}
