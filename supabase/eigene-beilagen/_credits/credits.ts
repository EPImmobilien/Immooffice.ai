// ============================================================================
// credits.ts — Credits reservieren, buchen, freigeben
// ============================================================================
// Beilage des Forks (fork_49). Quelle:
// supabase/eigene-beilagen/_credits/credits.ts — sie wird in den Ordner
// jeder KI-Funktion gelegt, die etwas kostet. Wer sie ändert, ändert sie
// DORT; die Kopien in supabase/functions/ entstehen beim Erzeugen neu, und
// tests/credits.js besteht darauf, dass alle byte-gleich sind.
//
// Warum eine Beilage und keine Bibliothek: die Funktionen der Vorlage
// haben keinen gemeinsamen Ordner, und einen einzuführen hiesse, 129
// Funktionen anzufassen. Eine Datei neben die Funktion zu legen ändert
// nichts an ihr.
//
// ---------------------------------------------------------------------------
// Der Ablauf, und warum er so herum ist:
//
//   1. RESERVIEREN, bevor die KI läuft. Nicht danach. Wer erst hinterher
//      abrechnet, hat bei jedem Abbruch — Zeitüberschreitung, abgebrochene
//      Verbindung, neu gestartete Funktion — eine Leistung erbracht und
//      nichts dafür genommen. Und er kann nicht verhindern, dass zehn
//      gleichzeitige Aufrufe denselben Rest ausgeben.
//   2. BUCHEN, wenn der Anbieter geantwortet hat — mit den tatsächlichen
//      Kosten in Euro, soweit sie bekannt sind. Sie sind die Grundlage
//      jeder späteren Preisänderung.
//   3. FREIGEBEN, wenn etwas schiefging. CLAUDE.md: „Fehlgeschlagene
//      KI-Aufträge geben reservierte Credits automatisch frei."
//
// Geprüft wird ausserdem der Abo-Zustand. Ein gesperrter Mandant kommt
// nicht an die KI — und zwar hier, serverseitig, nicht durch einen
// ausgeblendeten Knopf. CLAUDE.md: Rechte werden serverseitig erzwungen.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

/** Was der Aufrufer zurückbekommt, wenn es losgehen darf. */
export interface Abrechnung {
  ok: true;
  vorgang: string;
  mandant: string;
  nutzer: string;
  credits: number;
  /** Nach erfolgreichem KI-Aufruf. `kosten` in Euro, wenn bekannt. */
  buchen: (kosten?: number | null, notiz?: string) => Promise<void>;
  /** Wenn der Aufruf scheitert. Gibt die Credits zurück. */
  freigeben: (grund?: string) => Promise<void>;
}

export interface Abgelehnt {
  ok: false;
  /** 401 nicht angemeldet · 402 Credits fehlen · 403 Abo gesperrt · 500 */
  status: number;
  fehler: string;
  /** Für die Oberfläche: woran es lag, ohne den Text auszuwerten. */
  grund: "anmeldung" | "mandant" | "abo" | "credits" | "fehler";
  saldo?: number;
  benoetigt?: number;
}

export type Ergebnis = Abrechnung | Abgelehnt;

function dienst() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Reserviert die Credits einer Aktion für den angemeldeten Nutzer.
 *
 * @param req      die eingehende Anfrage — der Anmeldekopf wird daraus gelesen
 * @param aktion   Schlüssel aus plattform_credit_preise (z. B. "ki_text")
 * @param referenz optionale Spur, etwa die Objekt-Kennung
 */
export async function kiAbrechnen(
  req: Request,
  aktion: string,
  referenz?: string | null,
): Promise<Ergebnis> {
  const db = dienst();
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return { ok: false, status: 401, grund: "anmeldung", fehler: "Nicht angemeldet." };
  }
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) {
    return { ok: false, status: 401, grund: "anmeldung", fehler: "Nicht angemeldet." };
  }
  const { data: profil } = await db.from("profiles")
    .select("mandant_id").eq("id", u.user.id).maybeSingle();
  const mandant = profil?.mandant_id || null;
  if (!mandant) {
    return { ok: false, status: 403, grund: "mandant", fehler: "Kein Mandant." };
  }

  // Der Abo-Zustand. `nur_lesen` reicht fuer KI nicht: sie erzeugt etwas.
  const { data: zugriff } = await db.rpc("abo_zugriff", { p_mandant: mandant });
  if (zugriff !== "voll") {
    return {
      ok: false, status: 403, grund: "abo",
      fehler: zugriff === "nur_lesen"
        ? "Das Abo ist beendet. Ihre Daten bleiben lesbar; neue KI-Erzeugung "
          + "ist nicht mehr möglich."
        : "Der Zugang ist gesperrt. Bitte prüfen Sie Abo und Zahlung.",
    };
  }

  const { data: kosten } = await db.rpc("credits_kosten", { p_aktion: aktion });
  const { data: vorgang, error } = await db.rpc("credits_reservieren", {
    p_aktion: aktion, p_referenz: referenz ?? null,
    p_mandant: mandant, p_nutzer: u.user.id,
  });

  if (error || !vorgang) {
    // 53400 ist der Code, den credits_reservieren wirft, wenn es nicht
    // reicht. Alles andere ist ein echter Fehler und soll auch so aussehen.
    const zuWenig = String((error as { code?: string } | null)?.code || "") === "53400"
      || /nicht genug credits/i.test(error?.message || "");
    if (zuWenig) {
      const { data: saldo } = await db.rpc("credits_saldo", { p_mandant: mandant });
      return {
        ok: false, status: 402, grund: "credits",
        fehler: `Nicht genug Credits: ${Number(kosten ?? 0)} benötigt, `
          + `${Number(saldo ?? 0)} verfügbar.`,
        saldo: Number(saldo ?? 0), benoetigt: Number(kosten ?? 0),
      };
    }
    console.error("credits_reservieren:", error?.message);
    return {
      ok: false, status: 500, grund: "fehler",
      fehler: "Die Credits liessen sich nicht reservieren.",
    };
  }

  return {
    ok: true,
    vorgang: String(vorgang),
    mandant, nutzer: u.user.id,
    credits: Number(kosten ?? 0),
    async buchen(eur, notiz) {
      const { error: f } = await db.rpc("credits_buchen", {
        p_vorgang: vorgang, p_ki_kosten_eur: eur ?? null, p_notiz: notiz ?? null,
      });
      // Ein Fehler beim Buchen darf das Ergebnis nicht wegwerfen: der Nutzer
      // hat seinen Text. Er steht im Protokoll und faellt beim Abgleich auf.
      if (f) console.error("credits_buchen:", f.message);
    },
    async freigeben(grund) {
      const { error: f } = await db.rpc("credits_freigeben", {
        p_vorgang: vorgang, p_grund: grund ?? null,
      });
      if (f) console.error("credits_freigeben:", f.message);
    },
  };
}

/**
 * Dollar in Euro, mit dem Kurs aus dem Plattform-Admin.
 *
 * Manche Anbieter rechnen in Dollar (Replicate), das Ledger führt Euro. Der
 * Kurs steht in `plattform_werte.usd_eur_kurs` und wird vom Betreiber
 * gepflegt — er gehört nicht in den Code, weil er sich ändert und weil eine
 * fest verdrahtete Zahl irgendwann still falsch ist. Fehlt er, wird NICHTS
 * umgerechnet: lieber keine Kostenangabe als eine erfundene.
 */
export async function inEuro(usd: number | null | undefined): Promise<number | null> {
  if (usd === null || usd === undefined || !isFinite(Number(usd))) return null;
  const { data } = await dienst().from("plattform_werte")
    .select("wert").eq("schluessel", "usd_eur_kurs").maybeSingle();
  const kurs = Number(String(data?.wert ?? "").replace(/"/g, ""));
  if (!kurs || !isFinite(kurs) || kurs <= 0) return null;
  return Math.round(Number(usd) * kurs * 1e6) / 1e6;
}

/** Die Antwort auf eine Ablehnung — überall dieselbe Form. */
export function abgelehnt(a: Abgelehnt, kopf: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: a.fehler, credits_grund: a.grund,
    ...(a.saldo !== undefined ? { credits_saldo: a.saldo, credits_benoetigt: a.benoetigt } : {}),
  }), { status: a.status, headers: { ...kopf, "Content-Type": "application/json" } });
}
