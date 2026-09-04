"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { zeitpunkt } from "@/lib/format";
import { PALETTE } from "@/lib/kalender/typen";
import { kalenderEinstellungenSpeichern, kalenderSyncJetzt, kalenderSyncSchalten, kalenderTokenErneuern, type KalenderErgebnis } from "@/server/kalender-aktionen";

export interface SyncPostfach { id: string; adresse: string; anbieter: string; kalender_sync: boolean; zustand: { letzter_abgleich?: string; hinaus?: number; herein?: number; geloescht?: number; fehler?: string[] } | null }

/** Persoenliche Kalender-Einstellungen, ICS-Abo, Abgleich mit Google/Microsoft. */
export function KalenderEinstellungen({ einstellungen, token, basisUrl, postfaecher, routendienst }: { einstellungen: { start_adresse: string | null; besichtigung_dauer_min: number; fahrzeit_puffer_min: number; fahrzeit_aktiv: boolean; kalender_farbe: string | null }; token: string; basisUrl: string; postfaecher: SyncPostfach[]; routendienst: boolean }) {
  const [e, eAktion, speichert] = useActionState<KalenderErgebnis, FormData>(kalenderEinstellungenSpeichern, {});
  const [tok, tokAktion, erneuert] = useActionState<KalenderErgebnis, FormData>(kalenderTokenErneuern, {});
  const [sync, syncAktion, gleichtAb] = useActionState<KalenderErgebnis, FormData>(kalenderSyncJetzt, {});
  const aktuellerToken = tok.token ?? token;
  const feed = `${basisUrl}/api/kalender/${aktuellerToken}`;
  return (
    <div className="space-y-5">
      <Karte>
        <KarteKopf><KarteTitel>Kalender & Fahrzeiten</KarteTitel><KarteBeschreibung>Persönliche Vorgaben: Startadresse für Fahrzeiten, Standarddauer von Besichtigungen, Ihre Farbe im Teamkalender.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          <form action={eAktion} className="grid gap-3 sm:grid-cols-4">
            {e.fehler && <div className="sm:col-span-4"><Hinweis ton="fehler">{e.fehler}</Hinweis></div>}
            {e.erfolg && <div className="sm:col-span-4"><Hinweis ton="erfolg">{e.erfolg}</Hinweis></div>}
            <div className="sm:col-span-4"><Feld id="ke-start" beschriftung="Startadresse für Fahrzeiten" hinweis="Leer = Firmenanschrift"><Eingabe name="start_adresse" defaultValue={einstellungen.start_adresse ?? ""} placeholder="Musterstraße 1, 60311 Frankfurt am Main" /></Feld></div>
            <Feld id="ke-dauer" beschriftung="Besichtigung dauert (Min)"><Eingabe name="besichtigung_dauer_min" inputMode="numeric" defaultValue={String(einstellungen.besichtigung_dauer_min)} /></Feld>
            <Feld id="ke-puffer" beschriftung="Puffer je Fahrt (Min)"><Eingabe name="fahrzeit_puffer_min" inputMode="numeric" defaultValue={String(einstellungen.fahrzeit_puffer_min)} /></Feld>
            <Feld id="ke-farbe" beschriftung="Meine Farbe im Kalender">
              <div className="flex items-center gap-2">
                <input type="color" name="kalender_farbe" defaultValue={einstellungen.kalender_farbe ?? PALETTE[0]} className="h-9 w-12 cursor-pointer rounded border border-linie bg-flaeche" aria-label="Farbe" />
                <span className="text-[12px] text-gedaempft">Team sieht Termine in dieser Farbe</span>
              </div>
            </Feld>
            <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" name="fahrzeit_aktiv" value="1" defaultChecked={einstellungen.fahrzeit_aktiv} className="h-4 w-4 accent-akzent" />Fahrzeiten im Kalender anzeigen</label></div>
            <div className="sm:col-span-4"><p className="text-[12px] text-gedaempft">{routendienst ? "Routendienst eingerichtet — Fahrzeiten kommen aus der Straßenroute." : "Kein Routendienst eingerichtet (ROUTING_API_KEY) — Fahrzeiten werden aus der Luftlinie geschätzt und so gekennzeichnet."}</p></div>
            <div className="sm:col-span-4"><Button type="submit" disabled={speichert}>{speichert ? "Speichert …" : "Speichern"}</Button></div>
          </form>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf><KarteTitel>Kalender-Abo (ICS)</KarteTitel><KarteBeschreibung>Diese Adresse in Apple Kalender, Google Kalender oder Outlook als Abonnement eintragen — Ihre Termine erscheinen dort schreibgeschützt und aktualisieren sich selbst. Die Adresse ist ein Geheimnis: wer sie kennt, sieht Ihre Termine.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-2">
          {tok.erfolg && <Hinweis ton="erfolg">{tok.erfolg}</Hinweis>}
          <Eingabe readOnly value={feed} aria-label="Abo-Adresse" onFocus={(ev) => ev.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <a href={feed.replace(/^https?:/, "webcal:")} className="rounded-[var(--radius)] border border-linie bg-flaeche px-3 py-1.5 text-[13px] hover:border-akzent/50">In Kalender-App öffnen (webcal)</a>
            <form action={tokAktion}><Button type="submit" variante="leise" disabled={erneuert}>Adresse erneuern (alte sperren)</Button></form>
          </div>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf><KarteTitel>Abgleich mit Google Kalender / Outlook</KarteTitel><KarteBeschreibung>Über ein verbundenes Microsoft-365- oder Google-Postfach: Ihre Termine wandern in den dortigen Kalender, dort angelegte Termine erscheinen hier. Läuft mit jedem Postfach-Abruf.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          {sync.fehler && <Hinweis ton="fehler">{sync.fehler}</Hinweis>}
          {sync.erfolg && <Hinweis ton="erfolg">{sync.erfolg}</Hinweis>}
          {postfaecher.length === 0 && <Hinweis>Kein Microsoft-365- oder Google-Postfach verbunden. Unter Einstellungen → Postfächer verbinden; beim Verbinden wird die Kalender-Berechtigung mit angefragt.</Hinweis>}
          {postfaecher.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-linie bg-hintergrund px-4 py-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text">{p.adresse} <Marke>{p.anbieter === "google" ? "Google" : "Microsoft 365"}</Marke> {p.kalender_sync ? <Marke ton="erfolg">Abgleich an</Marke> : <Marke>Abgleich aus</Marke>}</p>
                <p className="text-[12px] text-gedaempft">{p.zustand?.letzter_abgleich ? `Zuletzt ${zeitpunkt(p.zustand.letzter_abgleich)} · ${p.zustand.hinaus ?? 0} hinaus, ${p.zustand.herein ?? 0} herein${p.zustand.fehler?.length ? ` · Fehler: ${p.zustand.fehler[0]}` : ""}` : "Noch nicht abgeglichen."}</p>
              </div>
              <form action={kalenderSyncSchalten}><input type="hidden" name="postfach_id" value={p.id} /><input type="hidden" name="an" value={p.kalender_sync ? "0" : "1"} /><Button type="submit" variante="sekundaer" groesse="klein">{p.kalender_sync ? "Ausschalten" : "Einschalten"}</Button></form>
              <form action={syncAktion}><input type="hidden" name="postfach_id" value={p.id} /><Button type="submit" groesse="klein" disabled={gleichtAb}>{gleichtAb ? "Gleicht ab …" : "Jetzt abgleichen"}</Button></form>
            </div>
          ))}
        </KarteInhalt>
      </Karte>
    </div>
  );
}
