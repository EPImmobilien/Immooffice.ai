import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { z } from "zod";

import { dienstClient } from "@/lib/supabase/dienst";

import { problemeAuflisten } from "./schemata";
import { BEREICH_BEZEICHNUNG, rechteParsen, rechtReicht, schluesselAusKopf, schluesselHash, type Bereich, type Rechte } from "./schluessel";

/**
 * Zugang zur Schnittstelle (docs/AUTONOMIE.md 5.4): Schluessel pruefen,
 * Aufruf zaehlen (600 je Minute und Schluessel, je Schluessel einstellbar),
 * Rechte je Bereich, Schreibsperre im Lesemodus.
 *
 * Ein Schluessel ist kein Supabase-Benutzer. Die Route Handler arbeiten
 * deshalb mit der Dienstrolle — und filtern JEDE Abfrage nach dem Mandanten
 * des Schluessels (ressourcen.ts). Das ist die Mandantentrennung dieser Tuer.
 */

export interface ApiKontext {
  schluesselId: string;
  mandantId: string;
  rechte: Rechte;
  schreibbar: boolean;
  limit: number;
  verbraucht: number;
  dienst: SupabaseClient;
}

const KEIN_CACHE = { "Cache-Control": "no-store" };

export function apiFehler(status: number, meldung: string, zusatz: Record<string, unknown> = {}, kopf: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ fehler: meldung, ...zusatz }, { status, headers: { ...KEIN_CACHE, ...kopf } });
}

export function apiAntwort(kontext: ApiKontext, daten: unknown, status = 200): NextResponse {
  return NextResponse.json(daten, {
    status,
    headers: {
      ...KEIN_CACHE,
      "X-RateLimit-Limit": String(kontext.limit),
      "X-RateLimit-Remaining": String(Math.max(0, kontext.limit - kontext.verbraucht)),
    },
  });
}

export function istAntwort<T>(wert: T | NextResponse): wert is NextResponse {
  return wert instanceof NextResponse;
}

export async function apiZugang(request: Request, bereich: Bereich, aktion: "lesen" | "schreiben"): Promise<ApiKontext | NextResponse> {
  const schluessel = schluesselAusKopf(request.headers.get("authorization"));
  if (!schluessel) {
    return apiFehler(401, "Kein gültiger API-Schlüssel. Erwartet: Authorization: Bearer io_…", {}, { "WWW-Authenticate": 'Bearer realm="ImmoOffice.ai"' });
  }

  let dienst: SupabaseClient;
  try {
    dienst = dienstClient();
  } catch {
    return apiFehler(503, "Die Schnittstelle ist auf dem Server nicht eingerichtet.");
  }

  const { data, error } = await dienst.rpc("api_schluessel_pruefen", { p_hash: schluesselHash(schluessel) });
  const zeile = (Array.isArray(data) ? data[0] : null) as
    | { schluessel_id: string; mandant_id: string; rechte: unknown; ratenlimit: number; schreibbar: boolean }
    | null
    | undefined;
  if (error || !zeile) return apiFehler(401, "Der API-Schlüssel ist unbekannt oder widerrufen.");

  const limit = Number(zeile.ratenlimit) > 0 ? Number(zeile.ratenlimit) : 600;
  const { data: anzahl } = await dienst.rpc("api_aufruf_zaehlen", { p_schluessel: zeile.schluessel_id });
  const verbraucht = typeof anzahl === "number" ? anzahl : 1;
  if (verbraucht > limit) {
    const rest = 60 - new Date().getUTCSeconds();
    return apiFehler(429, `Ratenlimit erreicht: höchstens ${limit} Anfragen je Minute für diesen Schlüssel.`, {}, {
      "Retry-After": String(rest),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": "0",
    });
  }

  const rechte = rechteParsen(zeile.rechte);
  if (!rechtReicht(rechte[bereich], aktion)) {
    return apiFehler(403, `Der Schlüssel darf ${BEREICH_BEZEICHNUNG[bereich]} nicht ${aktion === "lesen" ? "lesen" : "schreiben"}.`);
  }
  if (aktion === "schreiben" && !zeile.schreibbar) {
    return apiFehler(403, "Das Unternehmen ist im Lesemodus (keine laufende Testphase, kein aktives Abo). Schreiben ist über die Schnittstelle nicht möglich.");
  }

  return { schluesselId: zeile.schluessel_id, mandantId: zeile.mandant_id, rechte, schreibbar: Boolean(zeile.schreibbar), limit, verbraucht, dienst };
}

/** JSON-Koerper lesen und pruefen; liefert die Daten oder eine 400/422-Antwort. */
export async function koerperLesen<T>(request: Request, schema: z.ZodType<T>): Promise<T | NextResponse> {
  let roh: unknown;
  try {
    roh = await request.json();
  } catch {
    return apiFehler(400, "Der Anfragekörper ist kein gültiges JSON.");
  }
  const geprueft = schema.safeParse(roh);
  if (!geprueft.success) {
    return apiFehler(422, "Die Angaben sind unvollständig oder ungültig.", { probleme: problemeAuflisten(geprueft.error) });
  }
  return geprueft.data;
}

export interface Seitenparameter {
  seite: number;
  groesse: number;
  von: number;
  bis: number;
  geaendertSeit: string | null;
}

export function seitenParameter(url: URL): Seitenparameter {
  const seite = Math.max(1, Math.min(100_000, Number.parseInt(url.searchParams.get("seite") ?? "1", 10) || 1));
  const groesse = Math.max(1, Math.min(200, Number.parseInt(url.searchParams.get("groesse") ?? "50", 10) || 50));
  const seit = url.searchParams.get("geaendert_seit");
  const geaendertSeit = seit && !Number.isNaN(new Date(seit).getTime()) ? new Date(seit).toISOString() : null;
  return { seite, groesse, von: (seite - 1) * groesse, bis: seite * groesse - 1, geaendertSeit };
}
