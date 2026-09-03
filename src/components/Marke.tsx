/**
 * Bildmarke „Schluesselloch im Goldkreis“ als Komponente.
 *
 * Bewusst inline und nicht als <img>: So folgt die Marke dem Farbmodus und
 * verursacht keine zusaetzliche Anfrage. Die Geometrie ist identisch mit
 * public/marke/ — Aenderungen dort und hier gemeinsam pflegen.
 */
export function Bildmarke({
  className,
  schluessel = "#FFFFFF",
}: {
  className?: string;
  schluessel?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="ImmoOffice.ai">
      <defs>
        <linearGradient id="marke-gold" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#B5934F" />
          <stop offset="1" stopColor="#C9AE72" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#marke-gold)" />
      <path
        fill={schluessel}
        d="M32 16.8a9.3 9.3 0 0 0-4.35 17.55L23.9 51.8h16.2l-3.75-17.45A9.3 9.3 0 0 0 32 16.8Z"
      />
    </svg>
  );
}

/**
 * Wortmarke: „immo“, die Bildmarke als O, „ffice“ und „.ai“ in Gold.
 *
 * Der Text wird in Poppins gesetzt statt als Pfad: In der Anwendung ist die
 * Schrift ohnehin geladen, der Text bleibt waehlbar und skaliert mit den
 * Systemeinstellungen. Die Pfadfassung in public/marke/ ist fuer alles
 * ausserhalb der Anwendung gedacht — PDF, E-Mail, Fremdsysteme.
 */
export function Wortmarke({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <span className="font-titel text-[19px] leading-none font-semibold tracking-tight text-text">
        immo
      </span>
      <Bildmarke className="mx-[1px] size-[19px] shrink-0" />
      <span className="font-titel text-[19px] leading-none font-semibold tracking-tight text-text">
        ffice<span className="text-akzent">.ai</span>
      </span>
    </span>
  );
}
