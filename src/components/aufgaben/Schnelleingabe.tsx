"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Marke } from "@/components/ui/Status";
import { PRIORITAETEN, schnelleingabeParsen, WIEDERHOLUNGEN } from "@/lib/arbeitsmittel";
import { datum } from "@/lib/format";
import { aufgabeAnlegen } from "@/server/arbeitsmittel-aktionen";

interface Spracherkennung { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start(): void; stop(): void }

/**
 * Schnelleingabe (Referenz „per Spracheingabe … in Sekunden"): ein Feld,
 * Vorschau der erkannten Frist, Prioritaet, Tags und Wiederholung; optional
 * Diktat ueber die Spracherkennung des Browsers. Alles bleibt editierbar.
 */
export function Schnelleingabe({ heute, zustaendigId, objektId, kontaktId, leadId }: { heute: string; zustaendigId?: string; objektId?: string; kontaktId?: string; leadId?: string }) {
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [hoert, setHoert] = useState(false);
  const sprache = useSyncExternalStore(() => () => undefined, () => { const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition); }, () => false);
  const [laeuft, starten] = useTransition();
  const erkennung = useRef<Spracherkennung | null>(null);
  const vorschau = text.trim() ? schnelleingabeParsen(text, new Date(heute)) : null;

  function diktieren() {
    const w = window as unknown as { SpeechRecognition?: new () => Spracherkennung; webkitSpeechRecognition?: new () => Spracherkennung };
    const Klasse = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Klasse) return;
    if (hoert) { erkennung.current?.stop(); setHoert(false); return; }
    const r = new Klasse();
    r.lang = "de-DE";
    r.interimResults = false;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim(); if (t) setText((alt) => (alt ? `${alt} ${t}` : t)); };
    r.onend = () => setHoert(false);
    erkennung.current = r;
    r.start();
    setHoert(true);
  }

  function absenden(daten: FormData) {
    setFehler(null);
    starten(async () => {
      const e = await aufgabeAnlegen(daten);
      if (e.fehler) { setFehler(e.fehler); return; }
      setText("");
    });
  }

  return (
    <form action={absenden} className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-3">
      <input type="hidden" name="schnell" value={text} />
      {zustaendigId && <input type="hidden" name="zustaendig_id" value={zustaendigId} />}
      {objektId && <input type="hidden" name="objekt_id" value={objektId} />}
      {kontaktId && <input type="hidden" name="kontakt_id" value={kontaktId} />}
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Was ist zu tun? — z. B. „Energieausweis anfordern morgen !! #unterlagen“ oder „Notiz: Flyer-Idee“"
          aria-label="Schnelleingabe"
          className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border border-linie-stark bg-flaeche px-3 text-sm text-text placeholder:text-gedaempft"
        />
        {sprache && <Button type="button" variante={hoert ? "gefahr" : "leise"} groesse="klein" onClick={diktieren}>{hoert ? "Aufnahme beenden" : "Diktieren"}</Button>}
        <Button type="submit" groesse="klein" disabled={!text.trim() || laeuft}>{laeuft ? "Speichert …" : "Anlegen"}</Button>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-gedaempft">
        {vorschau ? (
          <>
            <span className="text-text">{vorschau.titel || "…"}</span>
            {vorschau.typ === "notiz" && <Marke ton="info">Notiz</Marke>}
            {vorschau.faellig_am && <Marke ton="warnung">fällig {datum(vorschau.faellig_am)}</Marke>}
            {vorschau.prioritaet !== "mittel" && <Marke ton={vorschau.prioritaet === "hoch" ? "akzent" : "neutral"}>{PRIORITAETEN[vorschau.prioritaet]}</Marke>}
            {vorschau.tags.map((t) => <Marke key={t}>#{t}</Marke>)}
            {vorschau.wiederholung && <Marke ton="info">{WIEDERHOLUNGEN[vorschau.wiederholung]}</Marke>}
          </>
        ) : (
          <span>Erkannt werden heute, morgen, Wochentage, „in 2 Wochen“, 12.10., „!!“ für hohe Priorität, #tags, täglich/wöchentlich/monatlich und „Notiz:“.</span>
        )}
      </p>
      {fehler && <p className="mt-1 text-[12px] text-fehler">{fehler}</p>}
    </form>
  );
}
