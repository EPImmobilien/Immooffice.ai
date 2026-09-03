/**
 * Anmeldung ueber Google und Microsoft (docs/AUTONOMIE.md Phase 4):
 * Welche Anbieter im Supabase-Dashboard eingerichtet und per Umgebung
 * freigeschaltet sind. Bewusst ohne "use client" — die Seiten lesen das auf
 * dem Server und reichen es der Schaltflaechen-Komponente als Props weiter.
 */
export interface SozialeAnbieter {
  google: boolean;
  microsoft: boolean;
}

export function sozialeAnmeldung(umgebung: Record<string, string | undefined> = process.env): SozialeAnbieter {
  return {
    google: umgebung["NEXT_PUBLIC_ANMELDUNG_GOOGLE"] === "1",
    microsoft: umgebung["NEXT_PUBLIC_ANMELDUNG_MICROSOFT"] === "1",
  };
}
