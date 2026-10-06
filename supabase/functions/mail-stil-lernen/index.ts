// ============================================================================
// mail-stil-lernen — den eigenen Schreibstil aus den eigenen Mails ableiten
// ============================================================================
// Eigene Funktion des Forks (fork_46). Ansage des Betreibers vom 06.10.2026:
// „dass wir die letzten 20, 30 versendeten Mails analysieren, um den
// spezifischen Schreibstil rauszufinden — das aber wirklich nur unter der
// Prämisse, dass die Kunden dem zustimmen."
//
// Sie ersetzt etwas, das weg muss: in mail-ki-vorschlag stand ein fest
// verdrahtetes Stilprofil EINER BESTIMMTEN PERSON des Referenzunternehmens —
// Vorname, Mobilnummer, Name eines echten Geschäftspartners. Jeder Mandant
// hätte in deren Stil geschrieben. Siehe docs/ENTSCHEIDUNGEN.md.
//
// ---------------------------------------------------------------------------
// VIER REGELN, DIE NICHT VERHANDELBAR SIND
// ---------------------------------------------------------------------------
// 1. OHNE EINWILLIGUNG PASSIERT NICHTS. Nicht „opt-out", nicht „der Chef hat
//    zugestimmt" — die Person selbst, für ihr eigenes Postfach. Im
//    Arbeitsverhältnis ist die Freiwilligkeit einer Einwilligung ohnehin
//    zweifelhaft (§ 26 BDSG); umso wichtiger, dass niemand sie für einen
//    anderen erteilen kann. Die RLS-Richtlinie erzwingt das in der Datenbank.
//
// 2. NUR EIGENE MAILS. Gelesen wird mail_versendet mit
//    versendet_von_user_id = der Person selbst. Nicht die der Kollegen, nicht
//    der Posteingang. Fremde Mails sind ein anderer Zweck und ein anderer
//    Verantwortlicher.
//
// 3. GESCHWÄRZT, BEVOR ETWAS DAS HAUS VERLÄSST. Versendete Mails stecken
//    voller Daten Dritter: Namen, Adressen, Telefonnummern, Kaufpreise,
//    Objektanschriften. Für einen SCHREIBSTIL braucht man nichts davon.
//    Deshalb geht nichts davon hinaus — ersetzt durch Platzhalter. CLAUDE.md:
//    „Personenbezogene Daten an KI-Anbieter auf das Minimum reduzieren."
//    Die Schwärzung ist grob und mit Absicht übervorsichtig: lieber ein Wort
//    zu viel geschwärzt als eine Adresse zu wenig.
//
// 4. GESPEICHERT WIRD NUR DAS PROFIL. Keine Mailtexte, keine Ausschnitte,
//    keine Beispielsätze mit Inhalt. Der Widerruf löscht das Profil.
//
// Die rechtliche Würdigung steht in docs/DATENSCHUTZ-STILANALYSE.md. Sie
// ersetzt keine Rechtsberatung, und ob die Verarbeitung im Einzelfall
// zulässig ist, entscheidet der Mandant als Verantwortlicher.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const antwort = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Wie viele Mails. Der Betreiber hat „20, 30" gesagt; 30 ist genug, um
// Wiederkehrendes zu erkennen, und wenig genug, um es nicht zu übertreiben.
const WIE_VIELE = 30;
const MINDESTENS = 5;
// Kurze Mails tragen keinen Stil („Anbei." / "Passt, danke!"), sehr lange
// sind meist weitergeleitete Fremdtexte.
const MIN_ZEICHEN = 120;
const MAX_ZEICHEN = 4000;

const MODELL = "claude-sonnet-4-6";

// Der Wortlaut, dem zugestimmt wird. Er wird MITGESPEICHERT — wer später
// fragt, worin eingewilligt wurde, soll nicht die heutige Fassung sehen.
// Änderungen hier gelten nur für neue Einwilligungen.
export const EINWILLIGUNG_TEXT = [
  "Ich willige ein, dass ImmoOffice.Ai meine letzten bis zu 30 selbst",
  "versendeten E-Mails auswertet, um daraus ein Profil meines Schreibstils",
  "abzuleiten (Anrede, Tonfall, Satzlänge, wiederkehrende Wendungen,",
  "Grußformel).",
  "",
  "Dabei gilt:",
  "• Ausgewertet werden ausschließlich Mails, die ich selbst versendet habe.",
  "• Namen, Anschriften, Telefonnummern, E-Mail-Adressen, Beträge und",
  "  Datumsangaben werden vor der Auswertung unkenntlich gemacht und nicht",
  "  an den KI-Anbieter übermittelt.",
  "• Gespeichert wird nur das abgeleitete Stilprofil, nicht die Mails und",
  "  keine Textausschnitte daraus.",
  "• Ich kann die Einwilligung jederzeit mit Wirkung für die Zukunft",
  "  widerrufen. Der Widerruf löscht das Profil.",
].join("\n");

// --- Schwärzen --------------------------------------------------------------
// Bewusst in dieser Reihenfolge: das Spezifischste zuerst, damit eine
// Mailadresse nicht vorher als „Wort mit Punkt" zerfällt.
//
// Diese Funktion ist der Kern der Datenminimierung. Sie wird von
// tests/mail-stil.js Zeile für Zeile geprüft — wenn hier eine Nummer
// durchrutscht, geht sie an einen Anbieter.
export function schwaerzen(roh: string): string {
  let t = String(roh || "");

  // Zitierte Vorgängermail und Signaturblock weg: dort steht fremder Text
  // und die eigene Signatur, beides verfälscht den Stil und beides steckt
  // voller Kontaktdaten.
  t = t.split(/^\s*(?:-{2,}\s*$|_{3,}\s*$|Von:\s|Gesendet:\s|Am .{0,40} schrieb)/m)[0];

  const regeln: Array<[RegExp, string]> = [
    [/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g, "[MAIL]"],
    [/https?:\/\/\S+/g, "[LINK]"],
    [/\b(?:\+49|0)[\s/()-]?\d(?:[\s/()-]?\d){5,14}\b/g, "[TELEFON]"],
    [/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\s*(?:€|EUR|Euro)/gi, "[BETRAG]"],
    [/\b\d+(?:[.,]\d+)?\s*(?:€|EUR|Euro)/gi, "[BETRAG]"],
    [/\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß-]+/g, "[ORT]"],
    [/\b[A-ZÄÖÜ][a-zäöüß-]*(?:straße|strasse|str\.|weg|allee|platz|ring|damm|gasse|ufer)\s*\d+\s*[a-zA-Z]?/gi, "[ANSCHRIFT]"],
    [/\b\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\b/g, "[DATUM]"],
    [/\b\d{1,2}:\d{2}\s*(?:Uhr)?/g, "[UHRZEIT]"],
    [/\bDE\d{2}[\s]?(?:\w{4}[\s]?){4}\w{0,4}\b/g, "[IBAN]"],
    // Anreden mit Namen: der Name ist der Teil, der weg muss — die Anrede
    // selbst ist genau das, was der Stil ausmacht, und bleibt.
    [/\b(Herr|Herrn|Frau|Familie)\s+(?:Dr\.\s+|Prof\.\s+)?[A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+)?/g, "$1 [NAME]"],
    // Objektnummern und Aktenzeichen.
    [/\b(?:Nr\.|Objekt-?Nr\.?|Ref\.?-?Nr\.?|Az\.?)\s*[\w./-]+/gi, "[NUMMER]"],
  ];
  for (const [muster, ersatz] of regeln) t = t.replace(muster, ersatz);

  // Was danach noch wie ein längerer Zahlenblock aussieht, ist mit hoher
  // Wahrscheinlichkeit eine Kennung — und für einen Schreibstil nie nötig.
  t = t.replace(/\b\d{4,}\b/g, "[ZAHL]");
  return t.trim();
}

const STIL_AUFTRAG = `Du bekommst mehrere E-Mails, die EINE Person geschrieben hat.
Alle Namen, Adressen, Nummern und Beträge sind bereits durch Platzhalter wie
[NAME] oder [BETRAG] ersetzt — das ist Absicht, du brauchst sie nicht.

Leite daraus ein Profil des SCHREIBSTILS ab. Beschreibe nur, WIE diese Person
schreibt, nie WORÜBER. Gliedere so:

## Anrede
Welche Anreden kommen vor, und wann welche.

## Grußformel
Womit endet die Person, und was steht typischerweise davor.

## Tonfall
Förmlich oder locker, Sie oder du, direkt oder umständlich, Ausrufezeichen,
Emojis, Humor.

## Satzbau
Typische Satzlänge, Absatzlänge, Aufzählungen ja/nein, Aktiv oder Passiv.

## Wiederkehrende Wendungen
Formulierungen, die mehrfach vorkommen. Wörtlich, aber nur, wenn sie KEINEN
Inhalt tragen ("Gerne können wir", "Vielen Dank für Ihre Anfrage").

## Was diese Person NICHT tut
Auffällige Vermeidungen.

REGELN:
- Keine Namen, keine Orte, keine Zahlen, keine Objekte, keine Firmen. Wenn
  dir etwas Inhaltliches auffällt, lass es weg.
- Keine Platzhalter in den Beispielen: eine Wendung mit [NAME] darin ist
  keine Stilwendung, sondern ein Satzrest.
- Was du nicht erkennen kannst, lässt du weg. Nichts erfinden — ein
  erfundener Stil ist schlimmer als keiner.
- Höchstens 400 Wörter.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const kopf = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(kopf);
    if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    const nutzer = u.user.id;
    const { data: profil } = await db.from("profiles")
      .select("role, mandant_id").eq("id", nutzer).maybeSingle();
    if (!profil) return antwort({ ok: false, fehler: "Kein Profil." }, 403);
    const mandant = profil.mandant_id || null;

    const body = await req.json().catch(() => ({}));
    const aktion = String(body.aktion || "stand");

    const laden = async () => {
      const { data } = await db.from("mail_stilprofil").select("*")
        .eq("benutzer_id", nutzer).maybeSingle();
      return data;
    };

    // --- Stand abfragen ---------------------------------------------------
    if (aktion === "stand") {
      const s = await laden();
      // Wie viele Mails stünden überhaupt zur Verfügung? Ohne diese Zahl
      // klickt jemand auf „lernen" und bekommt „zu wenige Mails" — das
      // gehört vorher gesagt.
      const { count } = await db.from("mail_versendet")
        .select("id", { count: "exact", head: true })
        .eq("versendet_von_user_id", nutzer).eq("status", "gesendet");
      return antwort({
        ok: true,
        einwilligung_text: EINWILLIGUNG_TEXT,
        eingewilligt: !!(s?.einwilligung_am && !s?.widerrufen_am),
        eingewilligt_am: s?.einwilligung_am || null,
        gelernt_am: s?.gelernt_am || null,
        mails_ausgewertet: s?.mails_ausgewertet || 0,
        mails_verfuegbar: count || 0,
        mindestens: MINDESTENS,
        hat_profil: !!(s?.profil_text && !s?.widerrufen_am),
        fehler_text: s?.fehler_text || null,
      });
    }

    // --- Einwilligen -------------------------------------------------------
    if (aktion === "einwilligen") {
      const jetzt = new Date().toISOString();
      const { error } = await db.from("mail_stilprofil").upsert({
        mandant_id: mandant, benutzer_id: nutzer,
        einwilligung_am: jetzt, einwilligung_text: EINWILLIGUNG_TEXT,
        widerrufen_am: null, updated_at: jetzt,
      }, { onConflict: "benutzer_id" });
      if (error) return antwort({ ok: false, fehler: error.message }, 500);
      return antwort({ ok: true, eingewilligt: true, eingewilligt_am: jetzt });
    }

    // --- Widerrufen --------------------------------------------------------
    // Der Widerruf LÖSCHT das Profil, er merkt es nicht nur vor. Ein Profil,
    // das nach dem Widerruf noch dasteht und „nur nicht mehr benutzt wird",
    // ist weiterhin gespeichert — und damit weiterhin eine Verarbeitung.
    if (aktion === "widerrufen") {
      const jetzt = new Date().toISOString();
      const { error } = await db.from("mail_stilprofil").update({
        widerrufen_am: jetzt, profil_text: null, mails_ausgewertet: null,
        zeitraum_von: null, zeitraum_bis: null, gelernt_am: null,
        fehler_text: null, updated_at: jetzt,
      }).eq("benutzer_id", nutzer);
      if (error) return antwort({ ok: false, fehler: error.message }, 500);
      return antwort({ ok: true, eingewilligt: false, geloescht: true });
    }

    // --- Lernen ------------------------------------------------------------
    if (aktion !== "lernen") return antwort({ ok: false, fehler: "Unbekannte Aktion." }, 400);

    const stand = await laden();
    if (!stand?.einwilligung_am || stand?.widerrufen_am) {
      return antwort({ ok: false, fehler: "Ohne Einwilligung wird nichts ausgewertet." }, 403);
    }

    const { data: mails } = await db.from("mail_versendet")
      .select("betreff, body_text, body_html, gesendet_am")
      .eq("versendet_von_user_id", nutzer)
      .eq("status", "gesendet")
      // Automatisch erzeugte Mails sind nicht der Stil des Menschen,
      // sondern der Stil einer Vorlage. Sie würden das Profil verwässern.
      .or("automatisch.is.null,automatisch.eq.false")
      .order("gesendet_am", { ascending: false })
      .limit(WIE_VIELE * 3);

    const roh = (mails || [])
      .map((m: any) => String(m.body_text || "").trim()
        || String(m.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((t: string) => t.length >= MIN_ZEICHEN && t.length <= MAX_ZEICHEN);

    const texte = roh.slice(0, WIE_VIELE).map(schwaerzen).filter((t: string) => t.length >= 60);

    if (texte.length < MINDESTENS) {
      const grund = `Zu wenige eigene Mails: ${texte.length} verwertbar, ` +
        `mindestens ${MINDESTENS} nötig.`;
      await db.from("mail_stilprofil")
        .update({ fehler_text: grund, updated_at: new Date().toISOString() })
        .eq("benutzer_id", nutzer);
      return antwort({ ok: false, fehler: grund }, 400);
    }

    const schluessel = Deno.env.get("ANTHROPIC_API_KEY");
    if (!schluessel) return antwort({ ok: false, fehler: "ANTHROPIC_API_KEY fehlt." }, 500);

    const eingabe = texte
      .map((t: string, i: number) => `--- Mail ${i + 1} ---\n${t}`)
      .join("\n\n");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": schluessel,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELL,
        max_tokens: 2000,
        system: STIL_AUFTRAG,
        messages: [{ role: "user", content: eingabe }],
      }),
    });
    if (!r.ok) {
      const grund = `KI-Anbieter: ${r.status}`;
      await db.from("mail_stilprofil")
        .update({ fehler_text: grund, updated_at: new Date().toISOString() })
        .eq("benutzer_id", nutzer);
      return antwort({ ok: false, fehler: grund }, 502);
    }
    const ergebnis = await r.json();
    const profilText = (ergebnis?.content || [])
      .filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    if (!profilText) return antwort({ ok: false, fehler: "Leere Antwort des Anbieters." }, 502);

    const zeiten = (mails || []).map((m: any) => m.gesendet_am).filter(Boolean).sort();
    const jetzt = new Date().toISOString();
    const { error } = await db.from("mail_stilprofil").update({
      profil_text: profilText,
      mails_ausgewertet: texte.length,
      zeitraum_von: zeiten[0] || null,
      zeitraum_bis: zeiten[zeiten.length - 1] || null,
      gelernt_am: jetzt, modell: MODELL, fehler_text: null, updated_at: jetzt,
    }).eq("benutzer_id", nutzer);
    if (error) return antwort({ ok: false, fehler: error.message }, 500);

    return antwort({
      ok: true, gelernt: true, mails_ausgewertet: texte.length,
      gelernt_am: jetzt, profil_text: profilText,
    });
  } catch (e) {
    console.error("mail-stil-lernen:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
