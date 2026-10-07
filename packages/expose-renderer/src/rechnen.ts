// ============================================================================
// Die Beispielrechnung eines Exposés
// ----------------------------------------------------------------------------
// Nebenkosten, Finanzierung, Rendite. Die Formeln stehen HIER und nur hier:
// vorher rechnete die Edge Function sie im Satz, mitten im Zeichnen. Damit
// konnte die Vorschau im Browser andere Zahlen zeigen als das PDF — und
// zwei Betraege fuer denselben Posten sind keine Rundungsfrage, sondern ein
// falsches Dokument beim Interessenten.
//
// Gerechnet wird nur, was sich rechnen laesst. Ohne Kaufpreis gibt es keine
// Grunderwerbsteuer, und dann fehlt der Wert — er ist nicht null und nicht
// "0 €". Fehlende Werte lassen Zeilen und ganze Elemente entfallen; so
// steht in keinem Expose eine erfundene Zahl.
//
// Keine Rundung auf dem Weg: gerechnet wird mit den vollen Betraegen,
// gerundet wird erst beim Setzen (werte.ts). Wer zwischendurch rundet,
// bekommt eine Summe, die nicht der Summe ihrer gedruckten Zeilen
// entspricht.
// ============================================================================

/** Die Annahmen des Mandanten aus finanzierungs_annahmen. */
export type Annahmen = {
  notar_prozent?: number | string | null;
  zinssatz?: number | string | null;
  tilgung?: number | string | null;
  eigenkapital_prozent?: number | string | null;
  hinweis?: string | null;
};

const VORGABE = {
  notar: 2.0,
  zins: 3.9,
  tilgung: 2.0,
  eigenkapital: 20,
  courtage: 3.57,
  hinweis: "Unverbindliche Beispielrechnung, keine Finanzierungsberatung. "
         + "Konditionen abhängig von Bonität und Anbieter.",
};

/**
 * Grunderwerbsteuer nach Bundesland, abgeleitet aus den ersten beiden
 * Stellen der Postleitzahl.
 *
 * Steht am Objekt ein Satz, gilt der. Diese Tabelle ist der Rueckfall —
 * und sie ist eine Annahme: Postleitzahlen folgen keinen Landesgrenzen.
 * Darum nennt die Vorlage den Satz im Text ("Grunderwerbsteuer 6,5 %"),
 * damit ein falscher Satz auffaellt, statt still in der Summe zu stecken.
 */
export function grunderwerbsteuerSatz(plz: unknown): number {
  const p = parseInt(String(plz ?? "").slice(0, 2), 10);
  if (!isFinite(p)) return 6.0;
  if ([17, 18, 19].includes(p)) return 6.0;
  if ([20, 21, 22].includes(p)) return 5.5;
  if ([23, 24, 25].includes(p)) return 6.5;
  if ([26, 27, 28, 29, 30, 31, 37, 38, 49].includes(p)) return 5.0;
  if ([10, 12, 13].includes(p)) return 6.0;
  if ([3, 14, 15, 16].includes(p)) return 6.5;
  if ([6, 39].includes(p)) return 5.0;
  if ([1, 2, 4, 8, 9].includes(p)) return 5.5;
  if ([7, 98, 99].includes(p)) return 6.5;
  if (p >= 32 && p <= 59) return 6.5;
  if (p >= 60 && p <= 65) return 6.0;
  if (p >= 66 && p <= 67) return 6.5;
  if (p >= 68 && p <= 79) return 5.0;
  if (p >= 80 && p <= 97) return 3.5;
  return 6.0;
}

/**
 * Der Courtagesatz als Zahl, aus einem Freitextfeld.
 *
 * provision_aussen ist Text, weil dort alles stehen kann: "3,57 %",
 * "3,57", "provisionsfrei", "nach Vereinbarung". Eine Zahl kommt nur
 * zurueck, wenn das Feld auch wirklich eine nennt — "nach Vereinbarung"
 * ergibt keine 0 €, sondern keinen Posten.
 */
export function courtageSatz(v: unknown): number | undefined {
  const s = (v == null ? "" : String(v)).trim();
  if (!s) return undefined;
  const nurZahl = /^[\d.,\s%]+$/.test(s);
  const m = s.replace(",", ".").match(/\d+(\.\d+)?/);
  if (m && (s.includes("%") || nurZahl)) {
    const z = parseFloat(m[0]);
    return Number.isFinite(z) ? z : undefined;
  }
  return undefined;
}

function zahl(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) ? n : undefined;
}

function istKauf(immo: Record<string, unknown>): boolean {
  const v = String(immo["vertragsart"] ?? "").toLowerCase();
  if (!v) return true;
  return !/miet|vermiet|pacht/.test(v);
}

/**
 * Alle rechnung.*-Werte fuer ein Objekt.
 *
 * Zurueck kommt eine flache Zuordnung; was nicht errechenbar war, steht
 * nicht darin. Formatiert wird nichts — ausser dem Courtagesatz, den die
 * Vorlagen mitten im Satz nennen ("Käuferprovision 3,57 %") und der
 * darum als Text gebraucht wird.
 */
export function rechnen(immo: Record<string, unknown>,
                        annahmen?: Annahmen | null): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  const a = annahmen ?? {};
  const kauf = istKauf(immo);

  const notarSatz = zahl(a.notar_prozent) ?? VORGABE.notar;
  const zinsSatz = zahl(a.zinssatz) ?? VORGABE.zins;
  const tilgSatz = zahl(a.tilgung) ?? VORGABE.tilgung;
  const ekSatz = zahl(a.eigenkapital_prozent) ?? VORGABE.eigenkapital;
  d["rechnung.notar_satz"] = notarSatz;
  d["rechnung.zinssatz"] = zinsSatz;
  d["rechnung.tilgung"] = tilgSatz;
  d["rechnung.eigenkapital_prozent"] = ekSatz;
  d["rechnung.hinweis"] = (a.hinweis && String(a.hinweis).trim()) || VORGABE.hinweis;

  // Die laufenden Kosten summiert die Rechnung, nicht das Element: die
  // Vorlage zeigt die Summe an anderer Stelle als die Liste.
  const laufend = immo["laufende_kosten"];
  if (Array.isArray(laufend)) {
    let summe = 0, gezaehlt = 0;
    for (const p of laufend as { betrag?: unknown }[]) {
      const b = zahl(p?.betrag);
      if (b === undefined) continue;
      summe += b; gezaehlt++;
    }
    if (gezaehlt) d["rechnung.laufende_summe"] = summe;
  }

  const preis = zahl(immo["angebotspreis"]);
  const flaeche = zahl(immo["wohnflaeche"]) ?? zahl(immo["nutzflaeche"]);
  if (preis !== undefined && flaeche) d["rechnung.preis_pro_qm"] = preis / flaeche;

  // Ab hier nur fuer einen Kauf mit Preis. Bei einer Vermietung gibt es
  // keine Grunderwerbsteuer, und ohne Preis gibt es nichts zu rechnen.
  if (!kauf || preis === undefined) return d;

  const grestSatz = zahl(immo["grunderwerbsteuer_satz"])
    ?? grunderwerbsteuerSatz(immo["plz"]);
  const grest = preis * grestSatz / 100;
  const notar = preis * notarSatz / 100;
  // provisionsfrei schlaegt den Satz: steht der Schalter, entsteht dem
  // Kaeufer keine Courtage, auch wenn im Textfeld noch ein Satz steht.
  const frei = immo["provisionsfrei"] === true;
  const courtProz = frei ? 0 : (courtageSatz(immo["provision_aussen"]) ?? VORGABE.courtage);
  const court = preis * courtProz / 100;
  const gesamt = preis + grest + notar + court;

  d["rechnung.kaufpreis"] = preis;
  d["rechnung.grunderwerbsteuer_satz"] = grestSatz;
  d["rechnung.grunderwerbsteuer"] = grest;
  d["rechnung.notar"] = notar;
  if (courtProz > 0) {
    d["rechnung.courtage"] = court;
    d["rechnung.courtage_satz"] = courtProz.toFixed(2).replace(".", ",") + " %";
  }
  d["rechnung.gesamtaufwand"] = gesamt;

  const posten: { name: string; betrag: number }[] = [
    { name: "Kaufpreis", betrag: preis },
    { name: "Grunderwerbsteuer", betrag: grest },
    { name: "Notar & Grundbuch", betrag: notar },
  ];
  if (courtProz > 0) posten.push({ name: "Käuferprovision", betrag: court });
  d["rechnung.posten"] = posten;

  const ek = gesamt * ekSatz / 100;
  d["rechnung.eigenkapital"] = ek;
  d["rechnung.darlehen"] = gesamt - ek;
  d["rechnung.monatsrate"] = (gesamt - ek) * (zinsSatz + tilgSatz) / 100 / 12;

  // Rendite nur mit einer Miete. Die Ist-Miete zuerst: sie ist die, die
  // wirklich fliesst. Die Soll-Miete ist eine Erwartung.
  const miete = zahl(immo["miete_ist"]) ?? zahl(immo["kaltmiete"])
    ?? zahl(immo["miete_soll"]);
  // Eine Miete von 0 ist keine Miete, sondern ein leeres Feld: eine Rendite
  // von "0,00 %" und eine "Marktmiete 0 €" im Exposé waeren falsche Zahlen.
  if (miete !== undefined && miete > 0) {
    const jahr = miete * 12;
    const nichtUmlage = zahl(immo["hausgeld_nicht_umlagefaehig"]) ?? 0;
    d["rechnung.bruttorendite"] = jahr / preis * 100;
    d["rechnung.nettorendite"] = (jahr - nichtUmlage * 12) / gesamt * 100;
    if (jahr > 0) d["rechnung.kaufpreisfaktor"] = preis / jahr;
  }
  return d;
}
