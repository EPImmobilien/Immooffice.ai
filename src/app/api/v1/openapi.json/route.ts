import { NextResponse } from "next/server";

import { openapiDokument } from "@/lib/schnittstelle/openapi";

export const runtime = "nodejs";

/** Oeffentliche Beschreibung der Schnittstelle — enthaelt keine Daten. */
export function GET(request: Request) {
  const basis = (process.env["NEXT_PUBLIC_APP_URL"] ?? new URL(request.url).origin).replace(/\/+$/, "");
  return NextResponse.json(openapiDokument(basis), { headers: { "Cache-Control": "public, max-age=300" } });
}
