/**
 * Automatische Zuordnung eingehender Nachrichten (docs/AUTONOMIE.md P3):
 * Kontakt ueber den Absender, Objekt ueber Objektnummer oder Anschrift.
 *
 * Ab AUTO_SCHWELLE wird direkt zugeordnet, darunter nur vorgeschlagen — die
 * Entscheidung bleibt beim Menschen, und jede automatische Zuordnung ist als
 * solche gekennzeichnet (`zuordnung_art = 'automatisch'`). Vorbild ist die
 * Zuordnungslogik der Referenz (P8); die Umsetzung ist eigenstaendig.
 */

export interface ObjektIndexEintrag {
  id: string;
  objektnummer: string;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  status: string;
}

export interface KontaktIndexEintrag {
  id: string;
  email: string | null;
}

export interface ObjektTreffer {
  objektId: string;
  /** 0–100 */
  konfidenz: number;
  grund: string;
}

/** Ab hier wird ohne Rueckfrage zugeordnet. */
export const AUTO_SCHWELLE = 90;
/** Darunter gibt es nicht einmal einen Vorschlag. */
export const VORSCHLAG_SCHWELLE = 50;

const GENERISCHE_STRASSEN = new Set(["strasse", "weg", "platz", "ring", "allee", "gasse", "damm", "ufer"]);

/** Vergleichsform: Kleinbuchstaben, Umlaute aufgeloest, „Str.“ → „strasse“, nur Wortzeichen. */
export function normalisieren(wert: string | null | undefined): string {
  return (wert ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\bstr\.?(?=\s|$)/g, "strasse")
    .replace(/(\S)str\.(?=\s|$)/g, "$1strasse")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function statusBonus(status: string): number {
  if (status === "aktiv" || status === "reserviert") return 2;
  if (status === "verkauft" || status === "vermietet" || status === "archiviert" || status === "zurueckgezogen") return -10;
  return 0;
}

function begrenzen(wert: number): number {
  return Math.max(0, Math.min(100, Math.round(wert)));
}

/**
 * Objekt im Text erkennen. Reihenfolge: ausdrueckliche Objektnummer
 * („Objekt 0042“, „Objekt-Nr. 0042“, „#0042“), dann eine Objektnummer als
 * eigenstaendiges Wort (nur wenn sie nicht rein numerisch ist), dann Strasse
 * mit Hausnummer, Ort und Postleitzahl.
 */
export function objektErkennen(text: string, objekte: ObjektIndexEintrag[]): ObjektTreffer | null {
  const roh = text ?? "";
  if (roh.trim() === "" || objekte.length === 0) return null;

  const nachNummer = new Map<string, ObjektIndexEintrag>();
  for (const o of objekte) {
    const n = o.objektnummer.trim().toLowerCase();
    if (n) nachNummer.set(n, o);
  }

  // 1) Ausdrueckliche Nennung mit Schluesselwort.
  const ausdruecklich =
    /(?:objekt|immobilie|immo|obj|objektnummer|objekt-?nr|angebot)\W{0,4}(?:nummer|nr\.?|no\.?|id)?\W{0,3}#?([a-z0-9][a-z0-9_/-]{0,24})/gi;
  const knapp = /(?:^|[\s(,;:])(?:nr\.?|nummer|#)\W{0,2}([a-z0-9][a-z0-9_/-]{0,24})/gi;
  for (const re of [ausdruecklich, knapp]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(roh)) !== null) {
      const kandidat = (m[1] ?? "").replace(/[._/-]+$/, "").toLowerCase();
      const o = nachNummer.get(kandidat);
      if (o) {
        return {
          objektId: o.id,
          konfidenz: begrenzen(96 + statusBonus(o.status)),
          grund: `Objektnummer ${o.objektnummer} im Text`,
        };
      }
    }
  }

  // 2) Objektnummer als eigenstaendiges Wort — nur, wenn sie nicht rein
  //    numerisch ist (eine „0001“ steht auch in jeder Kontonummer).
  const norm = ` ${normalisieren(roh)} `;
  for (const [nummer, o] of nachNummer) {
    if (nummer.length < 4 || /^\d+$/.test(nummer)) continue;
    const token = normalisieren(nummer);
    if (token && norm.includes(` ${token} `)) {
      return {
        objektId: o.id,
        konfidenz: begrenzen(92 + statusBonus(o.status)),
        grund: `Objektnummer ${o.objektnummer} im Text`,
      };
    }
  }

  // 3) Anschrift.
  const kandidaten: Array<{ o: ObjektIndexEintrag; punkte: number; grund: string }> = [];
  for (const o of objekte) {
    const strasse = normalisieren(o.strasse);
    if (strasse.length < 4 || GENERISCHE_STRASSEN.has(strasse)) continue;
    const pos = norm.indexOf(` ${strasse} `);
    if (pos < 0) continue;

    let punkte = 60;
    let grund = o.strasse ?? strasse;
    const hausnummer = normalisieren(o.hausnummer).replace(/\s+/g, "");
    if (hausnummer) {
      const danach = norm.slice(pos + strasse.length + 2, pos + strasse.length + 26);
      const hm = /^(\d+\s?[a-z]?)(?=\s|$)/.exec(danach);
      if (hm && (hm[1] ?? "").replace(/\s+/g, "") === hausnummer) {
        punkte = 88;
        grund += ` ${o.hausnummer}`;
      } else if (hm) {
        punkte = 25; // andere Hausnummer — mit hoher Wahrscheinlichkeit ein anderes Objekt
      }
    }
    const ort = normalisieren(o.ort);
    if (ort && norm.includes(` ${ort} `)) {
      punkte += 4;
      grund += `, ${o.ort}`;
    }
    const plz = (o.plz ?? "").trim();
    if (plz && roh.includes(plz)) punkte += 4;

    kandidaten.push({ o, punkte: punkte + statusBonus(o.status), grund });
  }

  if (kandidaten.length === 0) return null;
  kandidaten.sort((a, b) => b.punkte - a.punkte);
  const bester = kandidaten[0]!;
  if (bester.punkte < VORSCHLAG_SCHWELLE) return null;

  const gleichwertig = kandidaten.filter((k) => k.punkte >= bester.punkte - 3);
  if (gleichwertig.length > 1 && bester.punkte < 85) {
    return {
      objektId: bester.o.id,
      konfidenz: begrenzen(Math.min(bester.punkte, VORSCHLAG_SCHWELLE)),
      grund: `${bester.grund} (mehrere Objekte in dieser Straße)`,
    };
  }
  return { objektId: bester.o.id, konfidenz: begrenzen(Math.min(93, bester.punkte)), grund: bester.grund };
}

/** Kontakt ueber die Absenderadresse — exakt, ohne Gross-/Kleinschreibung. */
export function kontaktErkennen(adresse: string | null | undefined, kontakte: KontaktIndexEintrag[]): string | null {
  const gesucht = (adresse ?? "").trim().toLowerCase();
  if (!gesucht) return null;
  for (const k of kontakte) {
    if (k.email && k.email.trim().toLowerCase() === gesucht) return k.id;
  }
  return null;
}

export interface Zuordnung {
  kontaktId: string | null;
  objektId: string | null;
  zuordnungArt: "automatisch" | null;
  vorschlag: ObjektTreffer | null;
}

/** Zuordnung fuer eine Nachricht bestimmen: Treffer ab Schwelle, sonst Vorschlag. */
export function zuordnen(
  absender: string | null,
  betreff: string | null,
  text: string | null,
  objekte: ObjektIndexEintrag[],
  kontakte: KontaktIndexEintrag[],
): Zuordnung {
  const kontaktId = kontaktErkennen(absender, kontakte);
  const treffer = objektErkennen(`${betreff ?? ""}\n${(text ?? "").slice(0, 4000)}`, objekte);
  if (treffer && treffer.konfidenz >= AUTO_SCHWELLE) {
    return { kontaktId, objektId: treffer.objektId, zuordnungArt: "automatisch", vorschlag: treffer };
  }
  return { kontaktId, objektId: null, zuordnungArt: null, vorschlag: treffer };
}
