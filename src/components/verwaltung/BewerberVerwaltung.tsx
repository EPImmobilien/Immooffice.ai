"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum, zeitpunkt } from "@/lib/format";
import { BEWERBER_STATUS, EMPFEHLUNG, FRAGEN, KATEGORIEN, auswerten, type Empfehlung } from "@/lib/verwaltung/bewerber";
import { bewerberBewerten, bewerberEinladen, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

export interface Bewerber {
  id: string; vorname: string; nachname: string; email: string; position: string | null; status: keyof typeof BEWERBER_STATUS;
  gestartet_am: string | null; abgeschlossen_am: string | null; antworten: Record<string, number | null> | null; punkte: number | null; max_punkte: number | null;
  empfehlung: Empfehlung | null; freitext: string | null; chef_note: number | null; chef_kommentar: string | null; gueltig_bis: string; erstellt_am: string;
}

function Meldung({ z }: { z: VerwaltungErgebnis }) { return <>{z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}{z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}</>; }

/** Bewerber und Einstellungstests (Referenz: Chef-Bereich → Bewerber). Masterprompt: entfaellt — auf Weisung 1:1, streichbar. */
export function BewerberVerwaltung({ liste }: { liste: Bewerber[] }) {
  const [z, einladen, laeuft] = useActionState<VerwaltungErgebnis, FormData>(bewerberEinladen, {});
  const [offen, setOffen] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="space-y-4">
      <form action={einladen} className="grid gap-3 rounded-[var(--radius)] border border-linie bg-flaeche p-3 md:grid-cols-4">
        <Feld id="bw-vn" beschriftung="Vorname" pflicht><Eingabe id="bw-vn" name="vorname" required maxLength={100} /></Feld>
        <Feld id="bw-nn" beschriftung="Nachname" pflicht><Eingabe id="bw-nn" name="nachname" required maxLength={100} /></Feld>
        <Feld id="bw-email" beschriftung="E-Mail" pflicht><Eingabe id="bw-email" name="email" type="email" required maxLength={200} /></Feld>
        <Feld id="bw-pos" beschriftung="Position"><Eingabe id="bw-pos" name="position" maxLength={120} placeholder="Immobilienmakler/in" /></Feld>
        <div className="md:col-span-4 flex flex-wrap items-center gap-2">
          <Button type="submit" groesse="klein" disabled={laeuft}>{laeuft ? "…" : "Zum Test einladen"}</Button>
          {z.link && <><Eingabe readOnly value={z.link} onFocus={(e) => e.currentTarget.select()} aria-label="Testlink" className="max-w-md" /><Button type="button" groesse="klein" variante="sekundaer" onClick={() => { void navigator.clipboard?.writeText(z.link ?? "").then(() => setKopiert(true)); }}>{kopiert ? "Kopiert" : "Link kopieren"}</Button></>}
          <Meldung z={z} />
        </div>
      </form>
      <div className="space-y-2 text-[13px]">
        {liste.length === 0 && <p className="text-gedaempft">Noch keine Bewerber eingeladen.</p>}
        {liste.map((b) => (
          <div key={b.id} className="rounded-[var(--radius)] border border-linie bg-flaeche p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{b.vorname} {b.nachname} <Marke ton={b.status === "abgeschlossen" ? "erfolg" : b.status === "gestartet" ? "warnung" : "neutral"}>{BEWERBER_STATUS[b.status]}</Marke>{b.empfehlung && <Marke ton={b.empfehlung === "sehr_gut" ? "erfolg" : b.empfehlung === "gespraech" ? "akzent" : "neutral"} className="ml-1">{EMPFEHLUNG[b.empfehlung]}</Marke>}</p>
                <p className="text-[12px] text-gedaempft">{b.email}{b.position ? ` · ${b.position}` : ""} · eingeladen {datum(b.erstellt_am)}{b.abgeschlossen_am ? ` · abgegeben ${zeitpunkt(b.abgeschlossen_am)}` : b.gueltig_bis < new Date().toISOString() ? " · Link abgelaufen" : ""}{b.punkte != null ? ` · ${b.punkte}/${b.max_punkte} Punkte (${Math.round((b.punkte / (b.max_punkte || 1)) * 100)} %)` : ""}{b.chef_note != null ? ` · Note ${b.chef_note}` : ""}</p>
              </div>
              <button type="button" className="text-[12px] text-akzent hover:underline" onClick={() => setOffen(offen === b.id ? null : b.id)}>{offen === b.id ? "Zuklappen" : "Details"}</button>
            </div>
            {offen === b.id && <Details b={b} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Details({ b }: { b: Bewerber }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(bewerberBewerten, {});
  const a = b.antworten ? auswerten(b.antworten) : null;
  return (
    <div className="mt-3 space-y-3 border-t border-linie pt-3 text-[13px]">
      {a && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {(Object.keys(KATEGORIEN) as Array<keyof typeof KATEGORIEN>).map((k) => <div key={k} className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">{KATEGORIEN[k]}</p><p className="font-medium">{a.jeKategorie[k].punkte}/{a.jeKategorie[k].max}</p></div>)}
          </div>
          <div className="flex flex-wrap gap-1">{FRAGEN.map((f) => { const d = a.details[f.id]; const ok = (d?.punkte ?? 0) > 0; return <span key={f.id} title={`${f.frage} — gewählt: ${d?.gewaehlt != null ? f.antworten[d.gewaehlt] : "—"}; richtig: ${f.antworten[f.richtig]}`} className={`rounded border px-1.5 py-0.5 text-[11px] ${ok ? "border-erfolg text-erfolg" : "border-fehler text-fehler"}`}>{f.id.toUpperCase()} {ok ? "✓" : "✗"}</span>; })}</div>
          {b.freitext && <div><p className="text-[11px] uppercase tracking-wide text-gedaempft">Freitext des Bewerbers</p><p className="whitespace-pre-wrap">{b.freitext}</p></div>}
        </>
      )}
      {!a && <p className="text-gedaempft">Der Test wurde noch nicht abgegeben.</p>}
      <form action={aktion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={b.id} />
        <Feld id={`bn-${b.id}`} beschriftung="Ihre Note (1–6)"><Eingabe id={`bn-${b.id}`} name="chef_note" inputMode="decimal" defaultValue={b.chef_note ?? ""} className="w-20" /></Feld>
        <Feld id={`bk-${b.id}`} beschriftung="Kommentar"><Textfeld id={`bk-${b.id}`} name="chef_kommentar" rows={1} defaultValue={b.chef_kommentar ?? ""} maxLength={2000} className="min-w-[260px]" /></Feld>
        <Button type="submit" groesse="klein" disabled={laeuft}>Bewertung speichern</Button>
        <Button type="submit" name="loeschen" value="1" groesse="klein" variante="leise" disabled={laeuft} onClick={(e) => { if (!confirm("Bewerber und Test endgültig löschen?")) e.preventDefault(); }}>Löschen</Button>
        <Meldung z={z} />
      </form>
    </div>
  );
}
