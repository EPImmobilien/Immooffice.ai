import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { jobsAusfuehren } from "@/lib/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Netlify laesst Funktionen bis 26 Sekunden laufen; Hintergrundfunktionen
// laenger. Das Zeitbudget unten bleibt darunter, damit ein Lauf nie
// abgeschnitten wird — was liegen bleibt, holt der naechste Aufruf.
export const maxDuration = 26;

/**
 * Worker-Endpunkt (ARCHITECTURE.md Abschnitt 3).
 *
 * Wird minuetlich geweckt — von netlify/functions/jobs-worker.mts oder von
 * pg_cron/pg_net — und arbeitet faellige Auftraege ab. Geschuetzt durch
 * JOB_GEHEIMNIS als Bearer-Token; ohne gueltiges Geheimnis passiert nichts,
 * auch keine Auskunft.
 */
export async function POST(anfrage: Request) {
  const geheimnis = process.env["JOB_GEHEIMNIS"];
  if (!geheimnis || geheimnis.length < 16) {
    return NextResponse.json({ fehler: "Worker nicht eingerichtet." }, { status: 503 });
  }

  const kopf = anfrage.headers.get("authorization") ?? "";
  const geliefert = kopf.startsWith("Bearer ") ? kopf.slice(7).trim() : "";
  const a = Buffer.from(geliefert);
  const b = Buffer.from(geheimnis);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ fehler: "Nicht erlaubt." }, { status: 401 });
  }

  try {
    const ergebnis = await jobsAusfuehren({ zeitbudgetMs: 20_000, maxAnzahl: 5 });
    return NextResponse.json(ergebnis);
  } catch (e) {
    return NextResponse.json(
      { fehler: e instanceof Error ? e.message : "Der Arbeiter ist gescheitert." },
      { status: 500 },
    );
  }
}
