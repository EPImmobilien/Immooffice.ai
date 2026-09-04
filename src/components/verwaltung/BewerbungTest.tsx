"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { FRAGEN, KATEGORIEN } from "@/lib/verwaltung/bewerber";
import { bewerbungAbgeben, type BewerbungErgebnis } from "@/server/bewerbung-oeffentlich";

/** Oeffentlicher Einstellungstest fuer Bewerber (Token-Link). */
export function BewerbungTest({ token, vorname, nachname, position, unternehmen }: { token: string; vorname: string; nachname: string; position: string | null; unternehmen: string }) {
  const [z, aktion, laeuft] = useActionState<BewerbungErgebnis, FormData>(bewerbungAbgeben, {});
  if (z.erfolg) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <Hinweis ton="erfolg" titel="Test eingegangen">{z.erfolg}</Hinweis>
      </main>
    );
  }
  const kategorien = Object.keys(KATEGORIEN) as Array<keyof typeof KATEGORIEN>;
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-[11px] uppercase tracking-[0.12em] text-gedaempft">{unternehmen}</p>
      <h1 className="font-titel text-2xl font-semibold text-primaer">Einstellungstest{position ? ` · ${position}` : ""}</h1>
      <p className="mt-2 text-[14px]">Guten Tag {vorname} {nachname} — schön, dass Sie sich für {unternehmen} interessieren. Dieser Test hilft uns beiden herauszufinden, ob wir zueinander passen. Er dauert etwa 20 Minuten; bitte beantworten Sie alle Fragen ohne Hilfsmittel.</p>
      <form action={aktion} className="mt-6 space-y-6">
        <input type="hidden" name="token" value={token} />
        {kategorien.map((k) => (
          <section key={k} className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4">
            <h2 className="font-titel text-[15px] font-semibold text-primaer">{KATEGORIEN[k]}</h2>
            <ol className="mt-3 space-y-4 text-[13px]">
              {FRAGEN.filter((f) => f.kategorie === k).map((f, i) => (
                <li key={f.id}>
                  <p className="font-medium">{i + 1}. {f.frage}</p>
                  <div className="mt-1 space-y-1">
                    {f.antworten.map((a, idx) => <label key={idx} className="flex items-start gap-2"><input type="radio" name={`f_${f.id}`} value={idx} required className="mt-0.5" /> <span>{a}</span></label>)}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <section className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4">
          <Feld id="bt-frei" beschriftung="Warum passen Sie zu uns? (frei, max. 4000 Zeichen)"><Textfeld id="bt-frei" name="freitext" rows={5} maxLength={4000} /></Feld>
        </section>
        {z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}
        <Button type="submit" disabled={laeuft} className="w-full">{laeuft ? "Sendet …" : "Test abgeben"}</Button>
        <p className="text-[11px] text-gedaempft">Ihre Angaben werden ausschließlich zur Bewerbung bei {unternehmen} gespeichert und nach Abschluss des Verfahrens gelöscht.</p>
      </form>
    </main>
  );
}
