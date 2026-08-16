/**
 * Icon-System (Master-Prompt Abschnitt 3).
 *
 * Eigene Zeichnungen, bewusst zurueckhaltend: 24er-Raster, durchgehend
 * 1,6 px Strichstaerke, runde Enden, keine Fuellungen. Das haelt die Kacheln
 * ruhig und passt zur geometrischen Bildmarke — statt eines bunten
 * Symbolteppichs, wie ihn Verwaltungsoberflaechen gern entwickeln.
 *
 * `currentColor` ueberall, damit die Symbole dem Farbmodus folgen.
 */

export type SymbolName =
  | "objekte"
  | "kontakte"
  | "suchprofile"
  | "expose"
  | "wertermittlung"
  | "vertraege"
  | "marketing"
  | "kalender"
  | "aufgaben"
  | "auswertungen"
  | "einstellungen"
  | "abrechnung"
  | "portale"
  | "dokumente";

const PFADE: Record<SymbolName, React.ReactNode> = {
  objekte: (
    <>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  kontakte: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.2 19.5c.6-3.1 3-5 5.8-5s5.2 1.9 5.8 5" />
      <path d="M16.2 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17.6 14.9c2 .6 3.4 2.3 3.8 4.6" />
    </>
  ),
  suchprofile: (
    <>
      <circle cx="10.5" cy="10.5" r="6.2" />
      <path d="M15.2 15.2 20.5 20.5" />
      <path d="M8 10.5h5M10.5 8v5" />
    </>
  ),
  expose: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6Z" />
      <path d="M14 3.5V8h5" />
      <path d="M9 12.5h7M9 16h5" />
    </>
  ),
  wertermittlung: (
    <>
      <path d="M4 20V9.5l8-5.5 8 5.5V20" />
      <path d="M4 20h16" />
      <path d="M9.5 16.5v-3.5M12 16.5v-6M14.5 16.5v-2" />
    </>
  ),
  vertraege: (
    <>
      <path d="M6 3.5h12v17H6Z" />
      <path d="M9 8h6M9 11.5h6" />
      <path d="M9 16.5c1.4-1.6 2.6-1.6 3.4 0 .7 1.4 1.8 1.2 2.6-.5" />
    </>
  ),
  marketing: (
    <>
      <path d="M4 9.5v5h3.5l6 4V5.5l-6 4Z" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7" />
      <path d="M7.5 14.5v4.5" />
    </>
  ),
  kalender: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8 14h3v3H8Z" />
    </>
  ),
  aufgaben: (
    <>
      <path d="M9 4.5h6M8 4.5H6.5A1.5 1.5 0 0 0 5 6v13a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V6a1.5 1.5 0 0 0-1.5-1.5H16" />
      <path d="M9 3.5h6v2H9Z" />
      <path d="m8.5 11.5 1.8 1.8 3.7-3.7" />
      <path d="M8.5 17h7" />
    </>
  ),
  auswertungen: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V7M17 20v-9" />
    </>
  ),
  einstellungen: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.2a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.5 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V2.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1Z" />
    </>
  ),
  abrechnung: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </>
  ),
  portale: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5s-1.2 6.1-3.4 8.5c-2.2-2.4-3.4-5.4-3.4-8.5s1.2-6.1 3.4-8.5Z" />
    </>
  ),
  dokumente: (
    <>
      <path d="M4.5 6.5h5l2 2.5h8v11h-15Z" />
      <path d="M4.5 6.5V4.5h5l2 2.5" />
    </>
  ),
};

export function Symbol({
  name,
  className,
}: {
  name: SymbolName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PFADE[name]}
    </svg>
  );
}
