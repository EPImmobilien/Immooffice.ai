/**
 * Text aus HTML-Mails (P4: gespeichert wird nur Text, nie HTML) und kleine
 * Texthelfer fuer Vorschau und Antwortentwurf.
 *
 * Bewusst ohne Bibliothek: Blockelemente werden zu Zeilenumbruechen, Listen
 * zu Aufzaehlungen, Links behalten ihr Ziel, alles andere faellt weg.
 */

const ENTITAETEN: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  euro: "€", hellip: "…", ndash: "–", mdash: "—", laquo: "«", raquo: "»",
  bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", copy: "©", reg: "®",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", aacute: "á", acirc: "â", ccedil: "ç",
  iacute: "í", oacute: "ó", ocirc: "ô", uacute: "ú", ntilde: "ñ", aring: "å", oslash: "ø",
  Eacute: "É", Agrave: "À", sect: "§", deg: "°", middot: "·", bull: "•", trade: "™",
};

export function entitaetenAufloesen(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (ganz: string, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1] === "x" || code[1] === "X";
      const n = hex ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ganz;
    }
    return ENTITAETEN[code] ?? ganz;
  });
}

export function htmlZuText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/\r\n?/g, "\n");
  // Zeilenumbrueche im Quelltext sind in HTML bedeutungslos.
  s = s.replace(/[ \t]*\n[ \t]*/g, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // Absaetze und Bloecke trennen mit Leerzeile, Zeilen (li, tr, div) nur mit Umbruch.
  s = s.replace(/<\/(p|h[1-6]|blockquote|pre|table|ul|ol)>/gi, "\n\n");
  s = s.replace(/<\/(div|tr|li|section|article|header|footer)>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "- ");
  s = s.replace(/<\/(td|th)>/gi, "\t");
  s = s.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_ganz: string, ziel: string, inhalt: string) => {
    const beschriftung = inhalt.replace(/<[^>]+>/g, "").trim();
    if (!beschriftung || beschriftung === ziel) return ziel;
    return /^(https?:|mailto:)/i.test(ziel) ? `${beschriftung} (${ziel})` : beschriftung;
  });
  s = s.replace(/<[^>]+>/g, "");
  s = entitaetenAufloesen(s);
  s = s.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** Einzeilige Vorschau fuer Listen. */
export function vorschau(text: string | null | undefined, laenge = 200): string | null {
  if (!text) return null;
  const eine = text.replace(/\s+/g, " ").trim();
  if (eine === "") return null;
  return eine.length <= laenge ? eine : `${eine.slice(0, laenge - 1).trimEnd()}…`;
}

/**
 * Zitierten Teil einer Antwort abschneiden — fuer Vorschau und KI-Entwurf
 * zaehlt nur, was der Absender selbst geschrieben hat.
 */
export function zitatAbschneiden(text: string): string {
  const marker = [
    /^-{2,}\s*(Original(nachricht| Message)|Ursprüngliche Nachricht|Urspruengliche Nachricht)\s*-{2,}$/im,
    /^Am .{5,160} schrieb .{1,160}:$/m,
    /^On .{5,160} wrote:$/m,
    /^Von: .+$/m,
    /^From: .+$/m,
    /^>/m,
  ];
  let ende = text.length;
  for (const m of marker) {
    const treffer = m.exec(text);
    if (treffer && treffer.index < ende) ende = treffer.index;
  }
  return text.slice(0, ende).trim();
}

/** Anzeigename aus einer Adresse, falls kein Name mitkommt. */
export function nameAusAdresse(adresse: string): string {
  const lokal = adresse.split("@")[0] ?? adresse;
  return lokal
    .split(/[._-]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(" ");
}
