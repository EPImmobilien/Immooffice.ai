"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { KUNDEN_ART, type KundenArt } from "@/lib/portal/typen";
import { kundeEinladen, type PortalErgebnis } from "@/server/portal-aktionen";

export interface EinladenVorgabe {
  art?: KundenArt;
  anzeigename?: string;
  email?: string;
  telefon?: string;
  kontakt_id?: string;
  objekt_ids?: string[];
  projekt_id?: string;
  einheit_id?: string;
}

/**
 * Zugang anlegen und einladen — fuer Eigentuemer/Kaeufer (mit Objekten) oder
 * fuer ein Neubau-Projekt (Interessent, Kaeufer; optional mit Einheit).
 */
export function KundeEinladen({
  vorgabe,
  objekte,
  einheiten,
  mitarbeiter,
  eigeneId,
  kompakt = false,
}: {
  vorgabe?: EinladenVorgabe;
  objekte: Array<{ id: string; bezeichnung: string }>;
  einheiten?: Array<{ id: string; we_nr: string }>;
  mitarbeiter: Array<{ id: string; name: string }>;
  eigeneId: string;
  kompakt?: boolean;
}) {
  const [zustand, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(kundeEinladen, {});
  const v = vorgabe ?? {};
  const [art, setArt] = useState<KundenArt>(v.art ?? (v.projekt_id ? "interessent" : "eigentuemer"));
  const [gewaehlt, setGewaehlt] = useState<string[]>(v.objekt_ids ?? []);
  const [kopiert, setKopiert] = useState(false);
  const projekt = Boolean(v.projekt_id);
  const arten = projekt ? (["interessent", "kaeufer"] as KundenArt[]) : (["eigentuemer", "kaeufer"] as KundenArt[]);

  if (zustand.erfolg && zustand.link) {
    return (
      <div className="space-y-3">
        <Hinweis ton="erfolg" titel="Zugang angelegt">{zustand.erfolg}</Hinweis>
        <Feld id="ke-link" beschriftung="Zugangslink des Kunden" hinweis="Der Link ist der Zugang — bitte nur an den Kunden weitergeben.">
          <div className="flex gap-2">
            <Eingabe id="ke-link" readOnly value={zustand.link} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variante="sekundaer" onClick={() => { void navigator.clipboard?.writeText(zustand.link ?? "").then(() => setKopiert(true)); }}>{kopiert ? "Kopiert" : "Kopieren"}</Button>
          </div>
        </Feld>
        {zustand.id && !projekt && <a href={`/kundenbereich/${zustand.id}`} className="text-[13px] text-akzent hover:underline">Zur Kundenakte</a>}
      </div>
    );
  }

  return (
    <form action={aktion} className="space-y-3">
      {v.projekt_id && <input type="hidden" name="projekt_id" value={v.projekt_id} />}
      {v.kontakt_id && <input type="hidden" name="kontakt_id" value={v.kontakt_id} />}
      {gewaehlt.map((id) => <input key={id} type="hidden" name="objekt_ids" value={id} />)}
      <div className={`grid gap-3 ${kompakt ? "" : "md:grid-cols-2"}`}>
        <Feld id="ke-art" beschriftung="Rolle"><Auswahl id="ke-art" name="art" value={art} onChange={(e) => setArt(e.target.value as KundenArt)}>{arten.map((a) => <option key={a} value={a}>{KUNDEN_ART[a]}</option>)}</Auswahl></Feld>
        <Feld id="ke-ap" beschriftung="Ansprechpartner"><Auswahl id="ke-ap" name="ansprechpartner_id" defaultValue={eigeneId}>{mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Auswahl></Feld>
        <Feld id="ke-name" beschriftung="Name" pflicht><Eingabe id="ke-name" name="anzeigename" defaultValue={v.anzeigename ?? ""} required maxLength={200} placeholder="Vor- und Nachname" /></Feld>
        <Feld id="ke-email" beschriftung="E-Mail" pflicht><Eingabe id="ke-email" name="email" type="email" defaultValue={v.email ?? ""} required maxLength={200} /></Feld>
        <Feld id="ke-telefon" beschriftung="Telefon"><Eingabe id="ke-telefon" name="telefon" defaultValue={v.telefon ?? ""} maxLength={60} /></Feld>
        {projekt && einheiten && einheiten.length > 0 && (
          <Feld id="ke-einheit" beschriftung="Wohnung (optional)"><Auswahl id="ke-einheit" name="einheit_id" defaultValue={v.einheit_id ?? ""}><option value="">— keine —</option>{einheiten.map((e) => <option key={e.id} value={e.id}>{e.we_nr}</option>)}</Auswahl></Feld>
        )}
      </div>
      {!projekt && (
        <fieldset className="rounded-[var(--radius)] border border-linie p-3">
          <legend className="px-1 text-[12px] font-medium text-gedaempft">Objekte, die der Kunde sieht</legend>
          {objekte.length === 0 && <p className="text-[12px] text-gedaempft">Keine Objekte vorhanden.</p>}
          <div className="grid max-h-48 gap-1 overflow-auto md:grid-cols-2">
            {objekte.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={gewaehlt.includes(o.id)} onChange={(e) => setGewaehlt((alt) => (e.target.checked ? [...alt, o.id] : alt.filter((x) => x !== o.id)))} />
                <span className="truncate">{o.bezeichnung}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      <Button type="submit" disabled={laeuft}>{laeuft ? "Legt an …" : "Zugang anlegen und einladen"}</Button>
      <p className="text-[12px] text-gedaempft">Der Kunde erhält einen persönlichen Zugangslink per E-Mail (sofern ein Mail-Dienst eingerichtet ist) — sonst erscheint der Link hier zum Weitergeben.</p>
    </form>
  );
}
