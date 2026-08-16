/**
 * Bildmarke „Schluesselloch-Turm“ als Komponente.
 *
 * Bewusst inline und nicht als <img>: So folgt die Marke dem Farbmodus, laesst
 * sich in Kopfzeilen und Ladezustaenden einfaerben und verursacht keine
 * zusaetzliche Anfrage. Die Geometrie ist identisch mit assets/brand/ —
 * Aenderungen gehoeren in scripts/build-brand.py und dann hierher.
 */
export function Bildmarke({
  className,
  turm = "var(--f-primaer)",
  akzent = "var(--marke-gold)",
}: {
  className?: string;
  turm?: string;
  akzent?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="ImmoOffice.ai"
    >
      <path fill={turm} d="M16 55V26a16 16 0 0 1 32 0v29Z" />
      <path
        fill={akzent}
        d="M12 57h40a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z"
      />
      <path
        fill={akzent}
        d="M32 19a7.5 7.5 0 0 0-4.1 13.78L25.4 46h13.2l-2.5-13.22A7.5 7.5 0 0 0 32 19Z"
      />
    </svg>
  );
}

/**
 * Vollstaendige Sperrung aus Bildmarke und Wortmarke.
 *
 * Die Wortmarke wird hier als Text in Poppins gesetzt statt als Pfad: In der
 * Anwendung ist die Schrift ohnehin geladen, der Text bleibt so waehlbar,
 * durchsuchbar und skaliert mit den Systemeinstellungen. Die Pfadfassung in
 * assets/brand/ ist fuer alles ausserhalb der Anwendung gedacht — PDF, E-Mail,
 * Fremdsysteme.
 */
export function Wortmarke({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Bildmarke className="size-7 shrink-0" />
      <span className="font-titel text-[19px] leading-none font-semibold tracking-tight text-text">
        ImmoOffice
        <span className="text-akzent">.ai</span>
      </span>
    </span>
  );
}
