import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { sitzungAktualisieren } from "@/lib/supabase/middleware";

/**
 * Sicherheits-Middleware (Master-Prompt Abschnitt 16).
 *
 * Die Content-Security-Policy wird hier gesetzt und nicht in next.config.ts,
 * weil sie je Anfrage eine frische Nonce braucht.
 *
 * Hintergrund: Next.js liefert seinen Startcode als INLINE-Skripte aus. Eine
 * Policy mit `script-src 'self'` blockiert genau diese Skripte — die Seite
 * rendert dann zwar, hydratisiert aber nie, und keine Schaltflaeche reagiert.
 * Der uebliche Ausweg `'unsafe-inline'` haette den Schutz gegen
 * Cross-Site-Scripting weitgehend aufgehoben. Deshalb: Nonce je Anfrage,
 * ergaenzt um `strict-dynamic`, damit von Next nachgeladene Bundles ohne
 * Pflege einer Positivliste erlaubt bleiben.
 */
export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const produktion = process.env.NODE_ENV === "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const richtlinien = [
    "default-src 'self'",
    // 'strict-dynamic' laesst Skripte zu, die von einem erlaubten Skript
    // geladen werden; 'self' bleibt als Rueckfallebene fuer aeltere Browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${produktion ? "" : " 'unsafe-eval'"}`,
    // Tailwind liefert eine externe Datei aus; Next setzt jedoch weiterhin
    // einzelne Stile inline. Fuer Stile ist das Risiko deutlich geringer.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(produktion ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  // Next liest die Nonce aus der Content-Security-Policy der ANFRAGE und setzt
  // sie automatisch an seine eigenen Skript-Elemente. Steht die Policy nur an
  // der Antwort, bleiben die Skripte ohne Nonce — und werden blockiert.
  const kopfzeilen = new Headers(request.headers);
  kopfzeilen.set("Content-Security-Policy", richtlinien);
  kopfzeilen.set("x-nonce", nonce);

  const basis = NextResponse.next({ request: { headers: kopfzeilen } });

  // Sitzung auffrischen und geschuetzte Routen absichern. Liefert entweder die
  // Basisantwort zurueck oder eine Weiterleitung.
  const antwort = await sitzungAktualisieren(request, basis);

  antwort.headers.set("Content-Security-Policy", richtlinien);
  antwort.headers.set("X-Content-Type-Options", "nosniff");
  antwort.headers.set("X-Frame-Options", "DENY");
  antwort.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  antwort.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  if (produktion) {
    antwort.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  // Vorschau- und Branch-Deployments duerfen nicht in den Index geraten.
  // Bewusst hier und nicht in netlify.toml: Dort gelten Kopfzeilen fuer alle
  // Kontexte, ein pauschales noindex haette auch die Produktion getroffen.
  // Die Produktion steuert ihre Indexierung ueber die Metadaten je Seite —
  // der angemeldete Bereich bleibt ausgeschlossen, oeffentliche Web-Exposés
  // sollen dagegen auffindbar sein.
  if (process.env.NEXT_PUBLIC_UMGEBUNG === "vorschau") {
    antwort.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return antwort;
}

export const config = {
  matcher: [
    /*
     * Alles ausser statischen Dateien und Bildern. Diese brauchen keine CSP
     * und wuerden sonst unnoetig dynamisch ausgeliefert.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|marke/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
