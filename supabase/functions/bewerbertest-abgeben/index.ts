// ============================================================================
// Edge Function: bewerbertest-abgeben  (v4)
// Oeffentlich (Token-Auth). Auto-Bewertung Teil 2a/2b/3, KI-Vorbewertung
// Teil 1/4/5 (claude-sonnet-4-6), Profil aus Teil 6.
// v4: Teil 6 ausgebaut (m1-m12) – Profil jetzt mit 7 Dimensionen:
//     realitaetsbild, resilienz, emotionale_intelligenz, integritaet,
//     teamfaehigkeit, selbstorganisation, fuehrungspotenzial.
// Der Kandidat bekommt KEINE Punkte zurueck – nur eine Bestaetigung.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonErr(status: number, msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deutsche Zahleneingaben tolerant parsen: "13.744,50", "13744.5", "4,25 %", "28925€"
function parseZahl(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[€%\s]/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function naheBei(ist: number | null, soll: number, toleranz: number): boolean {
  return ist !== null && Math.abs(ist - soll) <= toleranz;
}

const LOESUNG_2A: Record<string, string> = { f1: "b", f2: "b", f3: "c", f4: "b", f5: "c" };
const LOESUNG_2B: Record<string, string> = { t1: "c", t2: "b", t3: "b", t4: "b", t5: "b" };

const KI_SYSTEM = `Du bist Pruefer bei Musterhaus Immobilien GmbH  und bewertest den Einstellungstest eines Makler-Bewerbers. Bewerte streng, aber fair. Rechtschreibung und Sorgfalt zaehlen viel – das ist unser wichtigstes Kriterium. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Zaeune, ohne Text davor oder danach.`;

function kiPromptBauen(a: Record<string, string>): string {
  return `Bewerte die folgenden Freitext-Antworten. Gib NUR dieses JSON zurueck:\n{"teil1":{"punkte":0,"begruendung":"..."},"s1":{"punkte":0,"begruendung":"..."},"s2":{"punkte":0,"begruendung":"..."},"s3":{"punkte":0,"begruendung":"..."},"k1":{"punkte":0,"begruendung":"..."},"r3_einordnung_kommentar":"...","motivation":{"zusammenfassung":"...","realitaetsbild":"...","resilienz":"...","emotionale_intelligenz":"...","integritaet":"...","teamfaehigkeit":"...","selbstorganisation":"...","fuehrungspotenzial":"...","staerken":["..."],"offene_punkte":["..."],"interview_fragen":["..."]}}\n\n=== TEIL 1: FEHLERSUCHE (max 12 Punkte, je gefundenem Fehler 2) ===\nDer Bewerber sollte in einem Exposé-Entwurf Fehler finden. Loesungsschluessel (6 Fehler):\n1. Titel "Warnemuende" vs. Text "Markgrafenheide" (Ortswiderspruch)\n2. "Sehr geehrter Frau" (Grammatik)\n3. Wohnflaeche 142 m² im Text vs. 124 m² in den Eckdaten\n4. "vier grosszuegige Zimmer" vs. 3-Zimmer-Wohnung\n5. "Terasse" statt "Terrasse"\n6. Kaufpreis 397.000 vs. 379.000 Euro UND "30. Februar" (existiert nicht) – je 1 Punkt\nZaehle nur tatsaechlich benannte Fehler, sinngemaesse Beschreibung reicht. Erfundene "Fehler" geben keinen Abzug, aber auch keine Punkte.\nANTWORT DES BEWERBERS:\n${a.teil1_antwort || "(leer)"}\n\n=== TEIL 4: SITUATIONEN (je max 6 Punkte) ===\nS1 – Interessent will ohne unterschriebenen Objektnachweis besichtigen. Erwartet: freundlich aber klar KEINE Besichtigung ohne Unterschrift; Sinn erklaeren, Kunde halten. Nachgeben = max 2 Punkte.\nANTWORT S1:\n${a.s1 || "(leer)"}\n\nS2 – Namensfehler in versendetem Dokument entdeckt, Kaeufer hat schon unterschrieben. Erwartet: Fehler aktiv ansprechen, Vorgang korrigiert neu aufsetzen, alle transparent informieren. Vertuschen/aussitzen = 0-1 Punkte.\nANTWORT S2:\n${a.s2 || "(leer)"}\n\nS3 – Eigentuemerin will 80.000 Euro ueber der fundierten Einschaetzung (Wettbewerber hat es versprochen). Erwartet: ehrlich bleiben, mit Daten begruenden, Folgen ueberhoehter Preise erklaeren (Liegezeit, Preisspirale), Auftrag nicht um jeden Preis. Einfach zusagen = 0-1 Punkte.\nANTWORT S3:\n${a.s3 || "(leer)"}\n\n=== TEIL 5: E-MAIL (max 18 Punkte) ===\nSituation: Besichtigung 2 Std. vorher wegen Erkrankung des Eigentuemers abgesagt; Interessent hatte Urlaub genommen, droht mit schlechter Bewertung und Abwanderung.\nKriterien: Ton verstaendnisvoll und souveraen, nicht unterwuerfig, keine Floskel-Kaskade (bis 6 P); konkretes Angebot / neuer Termin (bis 4 P); fehlerfreie Rechtschreibung und Grammatik (bis 5 P); angemessene Laenge, keine Roman-Entschuldigung (bis 3 P). Fehlende Anrede oder fehlender Gruss: Abzug.\nANTWORT K1:\n${a.k1 || "(leer)"}\n\n=== ZUSATZ (keine Punkte) ===\nRenditefrage-Einordnung des Bewerbers (ein Satz, nur kurz kommentieren, ob die Einordnung fuer einen Kapitalanleger nachvollziehbar ist):\n${a.r3_einordnung || "(leer)"}\n\n=== TEIL 6: MOTIVATION, HALTUNG & AMBITION (KEINE PUNKTE – Profil, entscheidungsrelevant) ===\nErstelle aus den folgenden 12 Antworten ein sachliches, arbeitsplatzbezogenes Profil als Gespraechsleitfaden. Sei KRITISCH: Viele Bewerber unterschaetzen den Maklerberuf ("Tuer aufschliessen, dickes Geld verdienen") – pruefe, ob der Bewerber ein realistisches Bild hat, echte emotionale Intelligenz zeigt, integer handelt und zu sich selbst ehrlich ist. Floskeln, auswendig klingende Bewerbungsphrasen und ausweichende Antworten benennst du klar. Widersprueche ZWISCHEN den Antworten (z.B. "Kundenbeziehung ist mir alles" in M1, aber reine Abschlussfixierung in M3/M6) sprichst du ausdruecklich an. KEINE Persoenlichkeitsdiagnostik, keine Spekulation ueber Psyche oder Privatleben – nur, was aus den Antworten fuer die Maklertaetigkeit ablesbar ist.\nBefuelle im JSON unter "motivation" (je Dimension 1-2 Saetze, konkret, mit Bezug auf die Antworten):\n- "zusammenfassung": 3-5 Saetze Gesamteindruck inkl. klarer Einschaetzung, ob der Bewerber fuer den Beruf gedacht ist oder ein Klischeebild hat.\n- "realitaetsbild": versteht er/sie, was der Beruf wirklich verlangt (M1, M12)?\n- "resilienz": Umgang mit Durststrecke und Ablehnung am Telefon (M2, M5) – konkrete Strategien oder Durchhalteparolen?\n- "emotionale_intelligenz": Empathie und Fingerspitzengefuehl (M3, M4) – geht er/sie auf Menschen ein oder nur auf den Abschluss?\n- "integritaet": das Feuchtigkeitsschaden-Dilemma (M6) – erwartet wird Offenlegung trotz Provisionsverlust (Aufklaerungspflicht, Haftungsrisiko arglistiges Verschweigen); wer verschweigen wuerde oder herumlaviert, ist fuer uns nicht tragbar – das klar benennen.\n- "teamfaehigkeit": Kollegen-Konflikt (M7) – direkte, faire Klaerung vs. Eskalation vs. Wegducken.\n- "selbstorganisation": Wochenstruktur und ehrliche Selbstkenntnis der eigenen Schwaechen (M8).\n- "fuehrungspotenzial": Ambition und realistische Selbsteinschaetzung (M9, M10, M11); "will sofort fuehren, sieht keine Luecken" ist ein Warnsignal, ehrliche Luecken sind positiv.\n- "staerken": 2-4 Stichpunkte. "offene_punkte": 2-4 Stichpunkte fuers Gespraech. "interview_fragen": 3-4 konkrete Nachfragen, die an den schwaechsten Stellen ansetzen.\nSind Antworten leer oder nichtssagend, sage das ehrlich.\nM1 – Realitaetscheck (drei muehsamste Aufgaben, warum trotzdem):\n${a.m1 || "(leer)"}\nM2 – Drei Monate ohne Abschluss, Woche 1 vs. Woche 12:\n${a.m2 || "(leer)"}\nM3 – EQ-Szenario Trennungsverkauf (weinende Eigentuemerin, draengender Mann):\n${a.m3 || "(leer)"}\nM4 – EQ-Szenario schlechte Nachricht (Elternhaus weniger wert als eingeplant):\n${a.m4 || "(leer)"}\nM5 – Akquise-Anruf, Verkaeufer blafft ab ("der Zehnte heute"), 20 Sekunden woertlich + Anrufe pro Woche:\n${a.m5 || "(leer)"}\nM6 – Integritaets-Dilemma: verschwiegener Feuchtigkeitsschaden kurz vor Notartermin:\n${a.m6 || "(leer)"}\nM7 – Kollege uebernimmt betreuten Interessenten und kassiert die Provision:\n${a.m7 || "(leer)"}\nM8 – Ideale Arbeitswoche Mo-Sa ohne Kontrolle + woran der Plan erfahrungsgemaess scheitert:\n${a.m8 || "(leer)"}\nM9 – Letzte kritische Rueckmeldung und was sich tatsaechlich geaendert hat:\n${a.m9 || "(leer)"}\nM10 – Team-/Standortfuehrung: was bringt er/sie mit, was fehlt ehrlicherweise:\n${a.m10 || "(leer)"}\nM11 – Fuenf-Jahres-Bild + woran man es nach zwoelf Monaten merkt:\n${a.m11 || "(leer)"}\nM12 – Abend-/Samstagstermine, schwankendes Einkommen, persoenliche Grenze:\n${a.m12 || "(leer)"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const token = (body.token || "").trim();
    const antworten = body.antworten;
    if (!token) return jsonErr(400, "token fehlt");
    if (!antworten || typeof antworten !== "object") return jsonErr(400, "antworten fehlen");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: einladung, error } = await admin
      .from("bewerber_einladungen").select("*").eq("token", token).maybeSingle();
    if (error || !einladung) return jsonErr(404, "Dieser Link ist ungültig.");
    if (einladung.status === "abgeschlossen") return jsonErr(409, "Der Test wurde bereits abgegeben.");
    if (einladung.status === "widerrufen") return jsonErr(410, "Dieser Link wurde zurückgezogen.");

    // ---- Auto-Bewertung Teil 2a / 2b ----
    const details: Record<string, unknown> = {};
    let p2a = 0, p2b = 0;
    for (const [id, richtig] of Object.entries(LOESUNG_2A)) {
      const ok = antworten[id] === richtig; if (ok) p2a += 2;
      details[id] = { gewaehlt: antworten[id] || null, richtig, punkte: ok ? 2 : 0 };
    }
    for (const [id, richtig] of Object.entries(LOESUNG_2B)) {
      const ok = antworten[id] === richtig; if (ok) p2b += 2;
      details[id] = { gewaehlt: antworten[id] || null, richtig, punkte: ok ? 2 : 0 };
    }

    // ---- Auto-Bewertung Teil 3 ----
    // r2 = Rueckwaertsrechnung: 350.000 / (1 - 0,0238) = 358.533,09 → aufgerundet 358.534.
    // Toleranz 2 akzeptiert 358.533 und 358.534 (Rundungsrichtung nicht bestrafen).
    let p3 = 0;
    const r1b = parseZahl(antworten.r1_brutto), r1n = parseZahl(antworten.r1_netto);
    const r2g = parseZahl(antworten.r2_gesamt), r3r = parseZahl(antworten.r3_rendite);
    const b1 = naheBei(r1b, 13744.5, 1), b2 = naheBei(r1n, 11550, 1);
    const b3 = naheBei(r2g, 358534, 2), b4 = naheBei(r3r, 4.25, 0.06);
    if (b1) p3 += 2; if (b2) p3 += 2; if (b3) p3 += 4; if (b4) p3 += 4;
    details.r1_brutto = { eingabe: antworten.r1_brutto || null, soll: 13744.5, punkte: b1 ? 2 : 0 };
    details.r1_netto = { eingabe: antworten.r1_netto || null, soll: 11550, punkte: b2 ? 2 : 0 };
    details.r2_gesamt = { eingabe: antworten.r2_gesamt || null, soll: 358534, punkte: b3 ? 4 : 0 };
    details.r3_rendite = { eingabe: antworten.r3_rendite || null, soll: 4.25, punkte: b4 ? 4 : 0 };

    // ---- KI-Vorbewertung Teil 1 / 4 / 5 + Profil Teil 6 ----
    let ki: Record<string, any> | null = null;
    let kiFehler: string | null = null;
    const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (API_KEY) {
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 3600,
            system: KI_SYSTEM,
            messages: [{ role: "user", content: kiPromptBauen(antworten) }],
          }),
        });
        if (!resp.ok) { kiFehler = `Anthropic ${resp.status}: ` + (await resp.text()).slice(0, 200); }
        else {
          const data = await resp.json();
          const text = (data?.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
          ki = JSON.parse(text);
          if (ki) ki._usage = data?.usage || null;
        }
      } catch (e) { kiFehler = e instanceof Error ? e.message : String(e); }
    } else { kiFehler = "ANTHROPIC_API_KEY nicht gesetzt"; }

    const clamp = (v: unknown, max: number) => {
      const n = typeof v === "number" ? v : parseZahl(v as string);
      return n === null ? 0 : Math.max(0, Math.min(max, n));
    };
    const p1 = ki ? clamp(ki.teil1?.punkte, 12) : 0;
    const p4 = ki ? clamp(ki.s1?.punkte, 6) + clamp(ki.s2?.punkte, 6) + clamp(ki.s3?.punkte, 6) : 0;
    const p5 = ki ? clamp(ki.k1?.punkte, 18) : 0;

    // ---- Gesamt & Empfehlung (Teil 6 zaehlt NICHT) ----
    const quer = !!einladung.quereinsteiger;
    const maxPunkte = quer ? 70 : 80;
    const gesamt = p1 + p2b + p3 + p4 + p5 + (quer ? 0 : p2a);
    const koSorgfalt = ki !== null && p1 < 6;
    let empfehlung: string | null = null;
    if (ki) {
      const pct = (gesamt / maxPunkte) * 100;
      empfehlung = koSorgfalt ? "kein_match" : pct >= 80 ? "sehr_gut" : pct >= 65 ? "gespraech" : "kein_match";
    }

    const { error: insErr } = await admin.from("bewerber_antworten").insert({
      einladung_id: einladung.id,
      antworten,
      punkte_auto: { teil2a: p2a, teil2b: p2b, teil3: p3, details },
      ki_bewertung: ki ? { ...ki, teil1_punkte: p1, teil4_punkte: p4, teil5_punkte: p5, model: "claude-sonnet-4-6" } : { fehler: kiFehler },
      gesamt_punkte: ki ? gesamt : null,
      max_punkte: maxPunkte,
      ko_sorgfalt: koSorgfalt,
      empfehlung,
    });
    if (insErr) return jsonErr(500, "Antworten konnten nicht gespeichert werden: " + insErr.message);

    await admin.from("bewerber_einladungen")
      .update({ status: "abgeschlossen", abgeschlossen_am: new Date().toISOString() })
      .eq("id", einladung.id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("bewerbertest-abgeben Fehler:", e);
    return jsonErr(500, e instanceof Error ? e.message : String(e));
  }
});
