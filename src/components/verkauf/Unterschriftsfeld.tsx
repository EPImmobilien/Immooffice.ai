"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * Unterschrift auf dem Bildschirm (Maus, Finger, Stift). Liefert ein PNG als
 * Data-URL — klein genug fuer die Datenbank und fuer PDF/Word.
 */
export function Unterschriftsfeld({ bezeichnung, wert, onChange }: { bezeichnung: string; wert: string | null; onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zeichnet, setZeichnet] = useState(false);
  const [leer, setLeer] = useState(true);

  function punkt(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1B2A47";
    const p = punkt(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    setZeichnet(true); setLeer(false);
  }
  function bewegen(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = punkt(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  function ende() {
    if (!zeichnet) return;
    setZeichnet(false);
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL("image/png"));
  }
  function loeschen() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setLeer(true);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-text">{bezeichnung}</p>
      {wert && leer ? (
        <div className="rounded-[var(--radius)] border border-linie bg-flaeche p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wert} alt={`Unterschrift ${bezeichnung}`} className="h-24 w-full object-contain object-left" />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="h-32 w-full touch-none rounded-[var(--radius)] border border-linie bg-flaeche"
          onPointerDown={start}
          onPointerMove={bewegen}
          onPointerUp={ende}
          onPointerLeave={ende}
          aria-label={`Unterschriftsfeld ${bezeichnung}`}
        />
      )}
      <div className="flex gap-2">
        <Button type="button" variante="leise" groesse="klein" onClick={loeschen}>{wert ? "Unterschrift löschen" : "Feld leeren"}</Button>
      </div>
    </div>
  );
}
