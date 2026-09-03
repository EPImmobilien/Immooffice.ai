"use client";

import { Button } from "@/components/ui/Button";
import { sozialAnmelden } from "@/server/auth-aktionen";

export interface SozialeAnbieter {
  google: boolean;
  microsoft: boolean;
}

/** Welche Anbieter im Dashboard eingerichtet und per Umgebung freigeschaltet sind. */
export function sozialeAnmeldung(umgebung: Record<string, string | undefined> = process.env): SozialeAnbieter {
  return {
    google: umgebung["NEXT_PUBLIC_ANMELDUNG_GOOGLE"] === "1",
    microsoft: umgebung["NEXT_PUBLIC_ANMELDUNG_MICROSOFT"] === "1",
  };
}

/**
 * Schaltflaechen „Anmelden mit Google/Microsoft“ (docs/AUTONOMIE.md Phase 4).
 * Erscheinen nur, wenn der Anbieter freigeschaltet ist — eine Schaltflaeche,
 * hinter der nichts passiert, waere schlimmer als keine.
 */
export function SozialAnmeldung({
  google,
  microsoft,
  weiter,
  aktion = "anmelden",
}: SozialeAnbieter & { weiter: string; aktion?: "anmelden" | "registrieren" }) {
  if (!google && !microsoft) return null;
  const verb = aktion === "registrieren" ? "Weiter mit" : "Anmelden mit";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[12px] text-gedaempft" aria-hidden="true">
        <span className="h-px flex-1 bg-linie" />
        oder
        <span className="h-px flex-1 bg-linie" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {google && (
          <form action={sozialAnmelden}>
            <input type="hidden" name="anbieter" value="google" />
            <input type="hidden" name="weiter" value={weiter} />
            <Button type="submit" variante="sekundaer" className="w-full">{verb} Google</Button>
          </form>
        )}
        {microsoft && (
          <form action={sozialAnmelden}>
            <input type="hidden" name="anbieter" value="microsoft" />
            <input type="hidden" name="weiter" value={weiter} />
            <Button type="submit" variante="sekundaer" className="w-full">{verb} Microsoft</Button>
          </form>
        )}
      </div>
      {aktion === "registrieren" && (
        <p className="text-[12px] leading-relaxed text-gedaempft">
          Beim ersten Mal legen Sie danach Ihr Unternehmen an; eine Einladung wird übernommen.
        </p>
      )}
    </div>
  );
}
