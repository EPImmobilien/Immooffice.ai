"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { globalSuchen, type Treffer } from "@/server/verwaltung-aktionen";

const ART: Record<string, string> = { objekt: "Objekt", kontakt: "Kontakt", projekt: "Projekt", vertrag: "Vertrag", aufgabe: "Aufgabe", termin: "Termin", rechnung: "Rechnung", kunde: "Kundenbereich" };

/** Globale Suche (Referenz: Strg+K-Suchfenster) ueber Objekte, Kontakte, Projekte, Verträge, Aufgaben, Termine, Rechnungen, Kundenzugänge. */
export function Suche() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [aktiv, setAktiv] = useState(0);
  const [laedt, setLaedt] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const zaehler = useRef(0);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOffen((o) => !o); }
      if (e.key === "Escape") setOffen(false);
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  useEffect(() => {
    if (!offen) return;
    const t = setTimeout(() => feld.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [offen]);

  const suchen = useCallback((q: string) => {
    const nr = ++zaehler.current;
    if (q.trim().length < 2) { setTreffer([]); setLaedt(false); return; }
    setLaedt(true);
    void globalSuchen(q).then((liste) => { if (nr === zaehler.current) { setTreffer(liste); setAktiv(0); setLaedt(false); } });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => suchen(text), 180);
    return () => clearTimeout(t);
  }, [text, suchen]);

  const oeffnen = (t: Treffer) => { setOffen(false); setText(""); router.push(t.pfad); };

  return (
    <>
      <button type="button" onClick={() => setOffen(true)} title="Suche (Strg+K)" aria-label="Suche öffnen" className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-linie px-2.5 py-1 text-[12px] text-gedaempft hover:text-text">
        <span aria-hidden>⌕</span><span className="hidden md:inline">Suchen</span><kbd className="hidden rounded border border-linie px-1 text-[10px] md:inline">Strg K</kbd>
      </button>
      {offen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]" onClick={() => setOffen(false)} role="presentation">
          <div className="w-full max-w-xl rounded-[var(--radius-gross)] border border-linie bg-flaeche shadow-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Suche">
            <input
              ref={feld} value={text} onChange={(e) => setText(e.target.value)} placeholder="Objekt, Kontakt, Projekt, Vertrag, Aufgabe, Termin, Rechnung …"
              className="w-full rounded-t-[var(--radius-gross)] border-b border-linie bg-transparent px-4 py-3 text-[14px] outline-none"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setAktiv((a) => Math.min(treffer.length - 1, a + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setAktiv((a) => Math.max(0, a - 1)); }
                if (e.key === "Enter" && treffer[aktiv]) oeffnen(treffer[aktiv]);
              }}
              aria-label="Suchbegriff"
            />
            <ul className="max-h-80 overflow-auto py-1 text-[13px]" role="listbox">
              {text.trim().length < 2 && <li className="px-4 py-2 text-gedaempft">Mindestens zwei Zeichen eingeben. Pfeiltasten wählen, Enter öffnet.</li>}
              {text.trim().length >= 2 && !laedt && treffer.length === 0 && <li className="px-4 py-2 text-gedaempft">Keine Treffer.</li>}
              {treffer.map((t, i) => (
                <li key={`${t.art}-${t.id}`} role="option" aria-selected={i === aktiv}>
                  <button type="button" onClick={() => oeffnen(t)} onMouseEnter={() => setAktiv(i)} className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === aktiv ? "bg-akzent-schwach" : ""}`}>
                    <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-gedaempft">{ART[t.art] ?? t.art}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.titel}</span>{t.untertitel && <span className="block truncate text-[11px] text-gedaempft">{t.untertitel}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
