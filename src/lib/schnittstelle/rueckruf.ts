import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { entschluesseln } from "@/integrationen/kern/zugangsdaten";

/**
 * Ausgehende Rueckrufe (docs/AUTONOMIE.md 5.4): objekt.angelegt,
 * kontakt.angelegt, termin.angelegt. Jede Lieferung ist mit HMAC-SHA256 ueber
 * `<zeit>.<koerper>` signiert; der Empfaenger prueft mit seinem Geheimnis.
 */

export const RUECKRUF_EREIGNISSE = ["objekt.angelegt", "kontakt.angelegt", "termin.angelegt"] as const;
export type RueckrufEreignis = (typeof RUECKRUF_EREIGNISSE)[number];
export const EREIGNIS_BEZEICHNUNG: Record<RueckrufEreignis, string> = {
  "objekt.angelegt": "Objekt angelegt",
  "kontakt.angelegt": "Kontakt angelegt",
  "termin.angelegt": "Termin angelegt",
};

export function geheimnisErzeugen(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function rueckrufSignatur(geheimnis: string, zeit: number, koerper: string): string {
  return createHmac("sha256", geheimnis).update(`${zeit}.${koerper}`).digest("hex");
}

/** Wert des Kopfes X-ImmoOffice-Signatur: `t=<unix>,v1=<hmac>` */
export function signaturKopf(geheimnis: string, zeit: number, koerper: string): string {
  return `t=${zeit},v1=${rueckrufSignatur(geheimnis, zeit, koerper)}`;
}

/** Fuer Empfaenger und Tests: Signatur pruefen, Zeitfenster fuenf Minuten. */
export function signaturPruefen(geheimnis: string, kopf: string, koerper: string, jetzt: number = Math.floor(Date.now() / 1000), toleranzSekunden = 300): boolean {
  const teile = Object.fromEntries(kopf.split(",").map((t) => t.split("=", 2) as [string, string]));
  const zeit = Number(teile["t"]);
  const v1 = teile["v1"] ?? "";
  if (!Number.isInteger(zeit) || Math.abs(jetzt - zeit) > toleranzSekunden) return false;
  const erwartet = rueckrufSignatur(geheimnis, zeit, koerper);
  const a = Buffer.from(v1);
  const b = Buffer.from(erwartet);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface Lieferung {
  id: string;
  ereignis: string;
  zeitpunkt: string;
  daten: Record<string, unknown>;
}

export function lieferungBauen(r: { id: string; ereignis: string; erstellt_am: string; nutzlast: Record<string, unknown> }): Lieferung {
  return { id: r.id, ereignis: r.ereignis, zeitpunkt: r.erstellt_am, daten: r.nutzlast };
}

interface RueckrufZeile {
  id: string;
  mandant_id: string;
  ziel_id: string;
  ereignis: string;
  nutzlast: Record<string, unknown>;
  erstellt_am: string;
  versuche: number;
}

/**
 * Faellige Rueckrufe zustellen (Arbeiter). Ein Ziel, das nicht antwortet,
 * blockiert die anderen nicht: je Lieferung zehn Sekunden, das Ergebnis
 * entscheidet die Datenbank (Wiederholung mit wachsendem Abstand).
 */
export async function rueckrufeZustellen(
  supabase: SupabaseClient,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  optionen: { maxAnzahl?: number; zeitbudgetMs?: number; jetzt?: () => Date } = {},
): Promise<{ zugestellt: number; gescheitert: number }> {
  const start = Date.now();
  const budget = optionen.zeitbudgetMs ?? 8_000;
  const jetzt = optionen.jetzt ?? (() => new Date());
  const ergebnis = { zugestellt: 0, gescheitert: 0 };

  const { data, error } = await supabase.rpc("rueckrufe_beanspruchen", { p_anzahl: optionen.maxAnzahl ?? 20 });
  if (error) throw new Error(error.message);
  const faellig = (data as RueckrufZeile[] | null) ?? [];
  if (faellig.length === 0) return ergebnis;

  const zielIds = [...new Set(faellig.map((r) => r.ziel_id))];
  const { data: ziele } = await supabase
    .from("rueckruf_ziele")
    .select("id, mandant_id, url, geheimnis_verschluesselt, aktiv")
    .in("id", zielIds);
  const zielVon = new Map((ziele ?? []).map((z) => [z.id as string, z]));

  for (const r of faellig) {
    if (Date.now() - start > budget) break;
    const ziel = zielVon.get(r.ziel_id);
    if (!ziel || !ziel.aktiv) {
      await supabase.rpc("rueckruf_ergebnis", { p_id: r.id, p_ok: false, p_status: null, p_fehler: "Ziel ist inaktiv oder geloescht." });
      ergebnis.gescheitert += 1;
      continue;
    }
    let ok = false;
    let status: number | null = null;
    let fehler: string | null = null;
    try {
      const geheimnis = entschluesseln(ziel.geheimnis_verschluesselt as string, ziel.mandant_id as string);
      const koerper = JSON.stringify(lieferungBauen(r));
      const zeit = Math.floor(jetzt().getTime() / 1000);
      const abbruch = new AbortController();
      const timer = setTimeout(() => abbruch.abort(), 10_000);
      try {
        const antwort = await fetchFn(ziel.url as string, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "ImmoOffice.ai-Rueckruf/1",
            "X-ImmoOffice-Ereignis": r.ereignis,
            "X-ImmoOffice-Lieferung": r.id,
            "X-ImmoOffice-Signatur": signaturKopf(geheimnis, zeit, koerper),
          },
          body: koerper,
          signal: abbruch.signal,
          redirect: "manual",
        });
        status = antwort.status;
        ok = antwort.status >= 200 && antwort.status < 300;
        if (!ok) fehler = `HTTP ${antwort.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      fehler = e instanceof Error ? (e.name === "AbortError" ? "Zeitueberschreitung (10 s)" : e.message.slice(0, 200)) : "unbekannter Fehler";
    }
    await supabase.rpc("rueckruf_ergebnis", { p_id: r.id, p_ok: ok, p_status: status, p_fehler: fehler });
    if (ok) ergebnis.zugestellt += 1;
    else ergebnis.gescheitert += 1;
  }
  return ergebnis;
}
