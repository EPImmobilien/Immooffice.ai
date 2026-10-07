// ============================================================================
// ki-assistent v1 — Claude mit Werkzeugen im eigenen Büro (fork_83)
// ----------------------------------------------------------------------------
// Eigene Funktion des Forks. Ersetzt für das Chat-Fenster die übernommene
// Funktion claude-chat, die nur reden konnte: hier darf Claude lesen, was der
// Nutzer sehen darf, und Entwürfe anlegen.
//
// Body (wie claude-chat, damit das Chat-Fenster unverändert bleibt):
//   { messages: [{role, content}, ...], system_context?, user_info? }
//   -> { ok: true, antwort, angelegt: [{art, id, titel}], credits }
//   -> { ok: false, error }
//
// RECHTE: Jeder Datenzugriff läuft über einen Client MIT DEM JWT DES
// AUFRUFERS. Es gilt also RLS genau wie in der Oberfläche — Mandantentrennung,
// Rollen, „nur eigene Vorlagen". Der Dienstschlüssel wird in dieser Datei
// nicht benutzt; nur die Credit-Beilage (credits.ts) bucht mit ihm.
//
// ENTWÜRFE, NIE VERSAND: Die Werkzeuge legen an — Mail-Vorlage, Brief im
// Status „entwurf", ToDo-Kette. Nichts wird verschickt, unterschrieben oder
// veröffentlicht. Löschen und Ändern bestehender Sätze kann der Assistent
// nicht.
//
// KEINE ERFUNDENEN DATEN (CLAUDE.md, KI-Regeln): Die Systemvorgabe verlangt
// Platzhalter in eckigen Klammern für alles, was nicht aus den Daten kommt.
// Vertragstexte tragen den Pflichthinweis auf anwaltliche Prüfung.
//
// CREDITS: Eine Nachricht des Nutzers ist ein Auftrag, egal wie viele
// Werkzeugrunden Claude dafür braucht (Aktion ki_assistent). Reserviert wird
// vor dem ersten Modellaufruf, gebucht nach dem letzten; bricht etwas ab,
// gibt der catch-Zweig frei.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
// --- Credits (fork_49) ---------------------------------------------------
// Die Abrechnung liegt als Beilage im Ordner dieser Funktion; die Quelle
// steht in supabase/eigene-beilagen/_credits/credits.ts. Sie reserviert
// VOR dem Aufruf und gibt bei einem Fehler von selbst zurueck.
import { kiAbrechnen, abgelehnt } from "./credits.ts";
import type { Abrechnung } from "./credits.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Vorgabe, falls im Plattform-Admin (plattform_ki_einstellungen) nichts steht.
const MODELL_VORGABE = Deno.env.get("KI_ASSISTENT_MODELL") || "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
// So viele Modellaufrufe darf ein Auftrag höchstens auslösen. Ein Auftrag,
// der mehr braucht, hängt in einer Schleife.
const MAX_RUNDEN = 8;
const MAX_VERLAUF = 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ------------------------------------------------------------ Systemvorgabe
const SYSTEM = `Du bist der KI-Assistent in der Maklersoftware eines Immobilienbüros.
Du arbeitest MIT DEN DATEN DES BÜROS über Werkzeuge: du kannst Objekte, Kontakte,
E-Mail-Vorlagen und die Firmenangaben lesen und Entwürfe anlegen —
E-Mail-Vorlagen, Briefe/Dokumente und ToDo-Ketten.

So arbeitest du:
- Wenn der Nutzer etwas angelegt haben will, LEG ES AN (Werkzeug aufrufen), statt den Text nur in den Chat zu schreiben. Danach sag kurz, was angelegt wurde und wo es liegt.
- Brauchst du Objekt- oder Kontaktdaten, such sie mit den Werkzeugen. Gibt es mehrere Treffer, frag nach, welcher gemeint ist.
- ERFINDE NICHTS. Was nicht in den Daten steht (Preise, Flächen, Namen, Termine, Fristen), setzt du als Platzhalter in eckigen Klammern, z. B. [Besichtigungstermin], und nennst die Platzhalter am Ende deiner Antwort.
- Alles, was du anlegst, ist ein ENTWURF. Du verschickst nichts, unterschreibst nichts, veröffentlichst nichts, löschst nichts. Das sagst du auch so, wenn jemand danach fragt.
- Verträge und rechtliche Texte: Du darfst Entwürfe schreiben. Jeder solche Entwurf endet mit dem Satz: "Hinweis: Dieser Entwurf ist keine Rechtsberatung und muss vor der Verwendung anwaltlich geprüft werden." Bezeichne nichts als rechtssicher. Eine elektronische Unterschrift in dieser Software ist eine einfache elektronische Signatur, keine qualifizierte.
- Wertermittlung: Du nennst keine Werte. Dafür gibt es das Bewertungsmodul mit offenen Rechenblättern.
- E-Mail-Vorlagen: Anrede und Gruß gehören in den Text. Für Felder, die später je Empfänger gefüllt werden, nimm Platzhalter in eckigen Klammern wie [Anrede], [Objektadresse].
- Lehnt die Datenbank etwas ab (fehlende Rechte), sag das dem Nutzer schlicht — z. B. dass ToDo-Ketten nur die Geschäftsleitung anlegen darf.

Sprache: Deutsch, knapp, freundlich, Sie-Form, solange der Nutzer nicht duzt. Keine Romane.`;

// ------------------------------------------------------------- Werkzeuge
const WERKZEUGE = [
  {
    name: "objekte_suchen",
    description: "Sucht Objekte (Immobilien) des Büros nach Adresse, Ort, Objektnummer oder Titel. Liefert höchstens 10 Treffer mit Eckdaten.",
    input_schema: {
      type: "object",
      properties: { suchtext: { type: "string", description: "Straße, Ort, Objektnummer oder Teil des Titels. Leer = die zuletzt geänderten Objekte." } },
    },
  },
  {
    name: "objekt_lesen",
    description: "Liest ein Objekt vollständig: Flächen, Preise, Energie, Beschreibungstexte, Provision.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Kennung aus objekte_suchen" } },
      required: ["id"],
    },
  },
  {
    name: "kontakte_suchen",
    description: "Sucht Kontakte im Adressbuch nach Name, Firma, E-Mail oder Ort. Höchstens 10 Treffer.",
    input_schema: {
      type: "object",
      properties: { suchtext: { type: "string" } },
      required: ["suchtext"],
    },
  },
  {
    name: "mail_vorlagen_auflisten",
    description: "Listet die vorhandenen E-Mail-Vorlagen (Titel, Kategorie, Betreff), damit nichts doppelt angelegt wird und der Stil passt.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "firma_lesen",
    description: "Liest Name, Anschrift und Kontaktdaten der eigenen Firma — für Briefköpfe und Signaturen.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "mail_vorlage_anlegen",
    description: "Legt eine neue E-Mail-Vorlage an. Sie erscheint im Posteingang unter den Vorlagen des Nutzers.",
    input_schema: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Kurzer Name der Vorlage, z. B. 'Absage nach Besichtigung'" },
        kategorie: { type: "string", description: "z. B. Interessenten, Eigentümer, Vermietung, Allgemein" },
        betreff: { type: "string" },
        text: { type: "string", description: "Der vollständige Mailtext mit Anrede und Gruß, Platzhalter in eckigen Klammern" },
        geteilt: { type: "boolean", description: "Für das ganze Team sichtbar (Standard: nein)" },
      },
      required: ["titel", "betreff", "text"],
    },
  },
  {
    name: "brief_entwurf_anlegen",
    description: "Legt einen Brief oder ein Dokument (auch einen Vertragsentwurf) im Modul Briefe als Entwurf an. Von dort wird es im Firmendesign als PDF ausgegeben.",
    input_schema: {
      type: "object",
      properties: {
        betreff: { type: "string" },
        brieftext: { type: "string", description: "Der vollständige Text ohne Briefkopf. Absätze mit Leerzeilen." },
        empfaenger_name: { type: "string" },
        empfaenger_zusatz: { type: "string" },
        empfaenger_strasse: { type: "string" },
        empfaenger_plz_ort: { type: "string" },
        grussformel: { type: "string", description: "z. B. 'Mit freundlichen Grüßen'" },
      },
      required: ["betreff", "brieftext"],
    },
  },
  {
    name: "todo_kette_anlegen",
    description: "Legt eine ToDo-Kette (wiederverwendbarer Ablauf mit Schritten und Fristen) an. Nur die Geschäftsleitung darf das.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        beschreibung: { type: "string" },
        bezug_typ: { type: "string", enum: ["immobilie", "kontakt"], description: "Woran die Kette später hängt" },
        schritte: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titel: { type: "string" },
              beschreibung: { type: "string" },
              offset_tage: { type: "integer", description: "Tage nach dem Start bzw. nach dem Vorgänger" },
              offset_ab: { type: "string", enum: ["start", "vorgaenger"] },
              prioritaet: { type: "string", enum: ["niedrig", "normal", "hoch"] },
            },
            required: ["titel"],
          },
        },
      },
      required: ["name", "schritte"],
    },
  },
];

type Angelegt = { art: string; id: string; titel: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kurz = (s: unknown, n: number) => String(s ?? "").slice(0, n);
// Für .or()-Filter: Komma und Klammern trennen dort Bedingungen.
const suchwort = (s: unknown) => String(s ?? "").replace(/[,()*%\\]/g, " ").trim().slice(0, 80);

// Führt ein Werkzeug aus — immer mit dem Client des Nutzers, also unter RLS.
async function werkzeug(
  // `rls` ist der Client MIT DEM JWT DES NUTZERS — kein Dienstschluessel.
  rls: SupabaseClient, nutzer: string, name: string, e: Record<string, unknown>, angelegt: Angelegt[],
): Promise<unknown> {
  switch (name) {
    case "objekte_suchen": {
      let q = rls.from("immobilien")
        .select("id, immo_nr, bezeichnung, objekttitel, strasse, hausnummer, plz, ort, objektart, vertragsart, status, wohnflaeche, zimmer, angebotspreis, kaltmiete")
        .order("updated_at", { ascending: false }).limit(10);
      const w = suchwort(e.suchtext);
      if (w) q = q.or(["immo_nr", "bezeichnung", "objekttitel", "strasse", "ort", "plz"].map((f) => `${f}.ilike.*${w}*`).join(","));
      const { data, error } = await q;
      if (error) return { fehler: error.message };
      return { treffer: data };
    }
    case "objekt_lesen": {
      if (!UUID.test(String(e.id || ""))) return { fehler: "Ungültige Kennung." };
      const { data, error } = await rls.from("immobilien")
        .select("id, immo_nr, bezeichnung, objekttitel, strasse, hausnummer, plz, ort, ortsteil, objektart, objekttyp, vertragsart, status, wohnflaeche, nutzflaeche, grundstueck, zimmer, schlafzimmer, badezimmer, etage, baujahr, modernisierung_jahr, zustand, angebotspreis, kaltmiete, nebenkosten, heizkosten, kaution, hausgeld, provision_aussen, provisionsfrei, verfuegbar_ab, energieausweis_typ, energie_kennwert, energie_klasse, energie_traeger, heizungsart, beschreibung_objekt, beschreibung_lage, beschreibung_ausstattung, beschreibung_sonstiges")
        .eq("id", e.id).maybeSingle();
      if (error) return { fehler: error.message };
      return data ?? { fehler: "Nicht gefunden oder keine Berechtigung." };
    }
    case "kontakte_suchen": {
      const w = suchwort(e.suchtext);
      if (!w) return { fehler: "Suchtext fehlt." };
      // Nur, was für Anschreiben gebraucht wird: Datensparsamkeit gegenüber
      // dem KI-Anbieter (CLAUDE.md, KI-Regeln).
      const { data, error } = await rls.from("kontakte")
        .select("id, anrede, titel, vorname, nachname, firma, email, strasse, plz, ort, rollen")
        .or(["vorname", "nachname", "firma", "email", "ort"].map((f) => `${f}.ilike.*${w}*`).join(","))
        .limit(10);
      if (error) return { fehler: error.message };
      return { treffer: data };
    }
    case "mail_vorlagen_auflisten": {
      const { data, error } = await rls.from("mail_vorlagen")
        .select("titel, kategorie, betreff").order("titel").limit(100);
      if (error) return { fehler: error.message };
      return { vorlagen: data };
    }
    case "firma_lesen": {
      // Bank, Steuernummer und Rechnungsfelder bleiben draussen: ein Brief
      // braucht sie nicht, und an den KI-Anbieter geht nur das Noetige.
      const { data, error } = await rls.from("firma_stammdaten")
        .select("firma_name, marken_name, strasse, plz, ort, telefon, email, web, geschaeftsfuehrer, registergericht, hrb")
        .order("sortierung", { ascending: true }).limit(1).maybeSingle();
      if (error) return { fehler: error.message };
      return data ?? { fehler: "Keine Firmenangaben hinterlegt." };
    }
    case "mail_vorlage_anlegen": {
      const zeile = {
        benutzer_id: nutzer,
        titel: kurz(e.titel, 200) || "Neue Vorlage",
        kategorie: kurz(e.kategorie, 80) || null,
        betreff: kurz(e.betreff, 300),
        text: kurz(e.text, 20000),
        geteilt: e.geteilt === true,
      };
      const { data, error } = await rls.from("mail_vorlagen").insert(zeile).select("id, titel").single();
      if (error) return { fehler: error.message };
      angelegt.push({ art: "E-Mail-Vorlage", id: data.id, titel: data.titel });
      return { ok: true, id: data.id, wo: "Posteingang → Vorlagen" };
    }
    case "brief_entwurf_anlegen": {
      const zeile = {
        created_by: nutzer,
        betreff: kurz(e.betreff, 300),
        brieftext: kurz(e.brieftext, 60000),
        empfaenger_name: kurz(e.empfaenger_name, 200) || null,
        empfaenger_zusatz: kurz(e.empfaenger_zusatz, 200) || null,
        empfaenger_strasse: kurz(e.empfaenger_strasse, 200) || null,
        empfaenger_plz_ort: kurz(e.empfaenger_plz_ort, 200) || null,
        grussformel: kurz(e.grussformel, 120) || null,
        datum: new Date().toISOString().slice(0, 10),
        status: "entwurf",
      };
      const { data, error } = await rls.from("briefe").insert(zeile).select("id, betreff").single();
      if (error) return { fehler: error.message };
      angelegt.push({ art: "Brief-Entwurf", id: data.id, titel: data.betreff });
      return { ok: true, id: data.id, wo: "Briefe (Status Entwurf)" };
    }
    case "todo_kette_anlegen": {
      const schritte = Array.isArray(e.schritte) ? e.schritte.slice(0, 40) : [];
      if (!schritte.length) return { fehler: "Mindestens ein Schritt nötig." };
      const bezug = e.bezug_typ === "immobilie" || e.bezug_typ === "kontakt" ? e.bezug_typ : null;
      const { data: v, error } = await rls.from("todo_vorlage")
        .insert({ name: kurz(e.name, 200), beschreibung: kurz(e.beschreibung, 2000) || null, bezug_typ: bezug, aktiv: true })
        .select("id, name").single();
      if (error) return { fehler: error.message };
      const zeilen = schritte.map((s: Record<string, unknown>, i: number) => ({
        vorlage_id: v.id, nr: i + 1,
        titel: kurz(s.titel, 200) || `Schritt ${i + 1}`,
        beschreibung: kurz(s.beschreibung, 2000) || null,
        offset_tage: Number.isFinite(Number(s.offset_tage)) ? Math.max(0, Math.round(Number(s.offset_tage))) : 0,
        offset_ab: s.offset_ab === "vorgaenger" ? "vorgaenger" : "start",
        vorgaenger_nr: s.offset_ab === "vorgaenger" && i > 0 ? i : null,
        prioritaet: ["niedrig", "normal", "hoch"].includes(String(s.prioritaet)) ? s.prioritaet : "normal",
      }));
      const { error: f2 } = await rls.from("todo_vorlage_schritt").insert(zeilen);
      if (f2) {
        // Eine Kette ohne Schritte ist schlimmer als keine.
        await rls.from("todo_vorlage").delete().eq("id", v.id);
        return { fehler: f2.message };
      }
      angelegt.push({ art: "ToDo-Kette", id: v.id, titel: v.name });
      return { ok: true, id: v.id, schritte: zeilen.length, wo: "ToDos → Arbeitsketten" };
    }
  }
  return { fehler: `Unbekanntes Werkzeug ${name}.` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return antwort({ ok: false, error: "Nur POST." }, 405);
  if (!ANTHROPIC_API_KEY) return antwort({ ok: false, error: "ANTHROPIC_API_KEY fehlt." }, 500);

  const body: Record<string, unknown> | null = await req.json().catch(() => null);
  if (!body) return antwort({ ok: false, error: "Ungültiger Körper." }, 400);
  const verlauf = Array.isArray(body.messages) ? body.messages : [];
  const nachrichten = verlauf
    .filter((m: { role?: string; content?: unknown }) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .slice(-MAX_VERLAUF)
    .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 20000) }));
  // Die Anthropic-API verlangt: erste Nachricht vom Nutzer, letzte auch.
  while (nachrichten.length && nachrichten[0].role !== "user") nachrichten.shift();
  if (!nachrichten.length || nachrichten[nachrichten.length - 1].role !== "user") {
    return antwort({ ok: false, error: "Keine Frage." }, 400);
  }

  // Der Client des Nutzers: jede Abfrage unter seinem JWT, also unter RLS.
  const kopf = req.headers.get("Authorization") || "";
  const rls = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: kopf } }, auth: { persistSession: false },
  });

  let system = SYSTEM;
  const info = body.user_info as { name?: string; role?: string } | undefined;
  if (info?.name) system += `\n\nAngemeldet: ${kurz(info.name, 100)}`;
  if (typeof body.system_context === "string" && body.system_context) {
    system += `\n\nWo der Nutzer gerade ist: ${kurz(body.system_context, 2000)}`;
  }
  system += `\n\nHeute ist der ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}.`;

  let credits: Abrechnung | null = null;
  const abr = await kiAbrechnen(req, "ki_assistent", null);
  if (!abr.ok) return abgelehnt(abr, cors);
  credits = abr;
  const auftrag: Abrechnung = abr;

  try {
    const modell = auftrag.modell(MODELL_VORGABE);
    const angelegt: Angelegt[] = [];
    const gespraech: Array<{ role: string; content: unknown }> = [...nachrichten];
    let text = "";
    let eingabe = 0, ausgabe = 0;

    for (let runde = 0; runde < MAX_RUNDEN; runde++) {
      const r = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modell, max_tokens: auftrag.maxTokens(MAX_TOKENS),
          system, tools: WERKZEUGE, messages: gespraech,
        }),
      });
      const daten = await r.json().catch(() => null);
      if (!r.ok || !daten) throw new Error(`Anbieter ${r.status}: ${kurz(daten?.error?.message, 300)}`);
      eingabe += Number(daten.usage?.input_tokens || 0);
      ausgabe += Number(daten.usage?.output_tokens || 0);

      const inhalt = Array.isArray(daten.content) ? daten.content : [];
      text = inhalt.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
      const aufrufe = inhalt.filter((b: { type: string }) => b.type === "tool_use");
      if (daten.stop_reason !== "tool_use" || !aufrufe.length) break;

      gespraech.push({ role: "assistant", content: inhalt });
      const ergebnisse = [];
      for (const a of aufrufe) {
        let erg: unknown;
        try {
          erg = await werkzeug(rls, auftrag.nutzer, a.name, (a.input || {}) as Record<string, unknown>, angelegt);
        } catch (f) {
          erg = { fehler: String((f as Error)?.message || f) };
        }
        ergebnisse.push({ type: "tool_result", tool_use_id: a.id, content: JSON.stringify(erg).slice(0, 30000) });
      }
      gespraech.push({ role: "user", content: ergebnisse });
      if (runde === MAX_RUNDEN - 1) text = text || "Der Auftrag war zu umfangreich für einen Schritt. Bitte teilen Sie ihn auf.";
    }

    await auftrag.buchen(null, `ki-assistent: ${eingabe} ein / ${ausgabe} aus, ${angelegt.length} angelegt`, "anthropic", modell);
    const gebucht = auftrag.credits;
    credits = null;

    if (angelegt.length) {
      text += "\n\n" + angelegt.map((a) => `✔ ${a.art} angelegt: „${a.titel}"`).join("\n");
    }
    return antwort({ ok: true, antwort: text || "Erledigt.", angelegt, credits: gebucht });
  } catch (f) {
    console.error("ki-assistent:", (f as Error)?.message || f);
    if (credits) await credits.freigeben(String((f as Error)?.message || f).slice(0, 200));
    return antwort({ ok: false, error: "Der Assistent ist gerade nicht erreichbar. Es wurden keine Credits verbraucht." }, 502);
  }
});
