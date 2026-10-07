// ============================================================================
// handwerker-portal — Maengel fuer den Handwerker, ohne Anmeldung (fork_85)
// ============================================================================
// Eigene Function des Forks. Auftrag „Bautraeger v2", Abschnitt D:
// „Handwerker-Link (ohne Login, nur eigene Maengel): Termin geplant,
// erledigt mit Pflicht-Foto, Rueckfrage -> Status + verlauf + Wiedervorlage
// ‚pruefen' an Bauleitung."
//
// Der Token IST der Nachweis, und er benennt genau eine Zeile:
//   * projekt_kontakte.portal_token  -> alle offenen Maengel dieses
//     Handwerkers in diesem Projekt (die Sammelmail verlinkt ihn),
//   * projekt_maengel.handwerker_token -> genau dieser eine Mangel.
// Aus der Zeile kommt der Mandant (handwerker_token / portal_token sind je
// Mandant eindeutig, weil weltweit eindeutig); alles Weitere ist auf
// diesen Mandanten und dieses Projekt begrenzt. Personendaten des Kaeufers
// gehen nicht hinaus — der Handwerker sieht Einheit, Raum, Mangel, Frist.
//
// GET  ?token=…                   -> Liste
// POST {token, mangel_id, aktion: termin|erledigt|rueckfrage, datum?, text?, fotos?: [dataurl]}
// Jede Aktion: Status, Verlauf, Projekt-Aktivitaet, Glocke; „erledigt" ohne
// Foto wird abgewiesen; „erledigt" und „rueckfrage" legen ein To-do fuer
// die Bauleitung an (Wiedervorlage „pruefen" / „Rueckfrage beantworten").
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { antwort, cors, dienst, datumDe, heute, glocke, aktivitaet, verlauf, bytesAus, endung, sicher } from "./bautraeger.ts";

const OFFEN = ["offen", "beauftragt", "termin_geplant", "gemeldet_erledigt"];

async function geltung(db: any, token: string) {
  if (!/^[0-9a-f]{24,64}$/i.test(token)) return null;
  const { data: hk } = await db.from("projekt_kontakte").select("id, projekt_id, mandant_id, gewerk, firma, name, aktiv").eq("portal_token", token).maybeSingle();
  if (hk) return hk.aktiv === false ? null : { art: "handwerker" as const, kontakt: hk, mandant: String(hk.mandant_id), projekt: String(hk.projekt_id), mangelId: null as string | null };
  const { data: m } = await db.from("projekt_maengel").select("id, projekt_id, mandant_id, projekt_kontakt_id").eq("handwerker_token", token).maybeSingle();
  if (!m) return null;
  let kontakt: any = null;
  if (m.projekt_kontakt_id) { const { data: k } = await db.from("projekt_kontakte").select("id, projekt_id, mandant_id, gewerk, firma, name, aktiv").eq("id", m.projekt_kontakt_id).maybeSingle(); kontakt = k; }
  return { art: "mangel" as const, kontakt, mandant: String(m.mandant_id), projekt: String(m.projekt_id), mangelId: String(m.id) };
}

async function maengelFuer(db: any, g: NonNullable<Awaited<ReturnType<typeof geltung>>>) {
  let q = db.from("projekt_maengel")
    .select("id, titel, beschreibung, raum, gewerk, frist, nachfrist, status, termin_am, foto_pfade, erledigt_fotos, verlauf, created_at, einheit_id, kategorie")
    .eq("projekt_id", g.projekt).eq("mandant_id", g.mandant).order("frist", { ascending: true, nullsFirst: false });
  q = g.art === "mangel" ? q.eq("id", g.mangelId) : q.eq("projekt_kontakt_id", g.kontakt.id).in("status", [...OFFEN, "geprueft_erledigt", "abgelehnt"]);
  const { data } = await q;
  const liste: any[] = data || [];
  const einheitIds = Array.from(new Set(liste.map((m) => m.einheit_id).filter(Boolean)));
  const we = new Map<string, string>();
  if (einheitIds.length) { const { data: e } = await db.from("projekt_einheiten").select("id, we_nr, geschoss").in("id", einheitIds).eq("mandant_id", g.mandant); for (const x of e || []) we.set(x.id, `WE ${x.we_nr}${x.geschoss ? " · " + x.geschoss : ""}`); }
  const aus = [];
  for (const m of liste) {
    const fotos: string[] = [];
    for (const p of (m.foto_pfade || []).slice(0, 8)) { const { data: s } = await db.storage.from("projekt-dateien").createSignedUrl(p, 3600); if (s?.signedUrl) fotos.push(s.signedUrl); }
    const erledigt: string[] = [];
    for (const p of (m.erledigt_fotos || []).slice(0, 8)) { const { data: s } = await db.storage.from("projekt-dateien").createSignedUrl(p, 3600); if (s?.signedUrl) erledigt.push(s.signedUrl); }
    aus.push({ id: m.id, titel: m.titel, beschreibung: m.beschreibung, raum: m.raum, gewerk: m.gewerk, frist: m.frist, nachfrist: m.nachfrist, status: m.status,
      termin_am: m.termin_am, einheit: we.get(m.einheit_id) || null, fotos, erledigt_fotos: erledigt, kategorie: m.kategorie,
      // Der Verlauf fuer den Handwerker: nur, was ihn betrifft — keine internen Notizen der Verwaltung.
      verlauf: (Array.isArray(m.verlauf) ? m.verlauf : []).filter((v: any) => ["angelegt", "beauftragt", "erinnerung", "mahnung", "termin", "erledigt_gemeldet", "rueckfrage", "antwort", "status", "geprueft", "abgelehnt", "zurueck"].includes(String(v.was))).slice(-12) });
  }
  return aus;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = dienst();
  try {
    let token = "", body: Record<string, any> = {};
    if (req.method === "GET") token = String(new URL(req.url).searchParams.get("token") || "").trim();
    else { body = await req.json().catch(() => ({})); token = String(body.token || "").trim(); }
    const g = await geltung(db, token);
    if (!g) return antwort({ ok: false, fehler: "Dieser Link ist ungültig oder nicht mehr aktiv." }, 404);
    const { data: projekt } = await db.from("projekte").select("id, name, ort, strasse, plz, mandant_id").eq("id", g.projekt).maybeSingle();
    if (!projekt || projekt.mandant_id !== g.mandant) return antwort({ ok: false, fehler: "Projekt nicht gefunden." }, 404);
    const { data: firma } = await db.from("firma_stammdaten").select("firma_name, marken_name, telefon, email").eq("mandant_id", g.mandant).eq("aktiv", true).order("sortierung", { ascending: true }).limit(1).maybeSingle();
    const kopf = { projekt: { name: projekt.name, ort: projekt.ort, strasse: projekt.strasse, plz: projekt.plz },
      handwerker: g.kontakt ? { firma: g.kontakt.firma, name: g.kontakt.name, gewerk: g.kontakt.gewerk } : null,
      bautraeger: firma ? { name: firma.marken_name || firma.firma_name, telefon: firma.telefon, email: firma.email } : null };

    if (req.method === "GET") return antwort({ ok: true, ...kopf, maengel: await maengelFuer(db, g) });

    const aktion = String(body.aktion || "");
    const mangelId = String(body.mangel_id || g.mangelId || "");
    if (!mangelId) return antwort({ ok: false, fehler: "mangel_id fehlt." }, 400);
    const { data: m } = await db.from("projekt_maengel").select("*").eq("id", mangelId).eq("projekt_id", g.projekt).eq("mandant_id", g.mandant).maybeSingle();
    if (!m || (g.art === "handwerker" && m.projekt_kontakt_id !== g.kontakt.id) || (g.art === "mangel" && m.id !== g.mangelId)) {
      return antwort({ ok: false, fehler: "Dieser Mangel gehört nicht zu Ihrem Link." }, 403);
    }
    if (!OFFEN.includes(m.status)) return antwort({ ok: false, fehler: "Dieser Mangel ist bereits geprüft oder abgelehnt." }, 409);
    const wer = (g.kontakt?.firma || g.kontakt?.name || "Handwerker") as string;
    const text = String(body.text || "").trim().slice(0, 2000);
    let einheitText = "";
    if (m.einheit_id) { const { data: e } = await db.from("projekt_einheiten").select("we_nr").eq("id", m.einheit_id).maybeSingle(); if (e) einheitText = `WE ${e.we_nr}`; }
    const zustaendig = m.erstellt_von || null;   // Bauleitung = wer den Mangel erfasst hat; sonst die Chefs ueber die Glocke
    const todoAn = async (titel: string, prio: string, beschreibung: string) => {
      const { data: t } = await db.from("todos").insert({ mandant_id: g.mandant, titel, beschreibung, typ: "aufgabe", status: "offen", prioritaet: prio,
        faellig_am: heute(), ersteller_id: zustaendig, zustaendig_id: zustaendig, team_sichtbar: true, tags: ["mangel", "neubau"], quelle: "system",
        daten: { mangel_id: m.id, projekt_id: g.projekt, einheit_id: m.einheit_id || null } }).select("id").single();
      if (t) await db.from("todo_verknuepfung").insert([{ mandant_id: g.mandant, todo_id: t.id, objekt_typ: "mangel", objekt_id: m.id, label: m.titel.slice(0, 120) },
        ...(m.einheit_id ? [{ mandant_id: g.mandant, todo_id: t.id, objekt_typ: "einheit", objekt_id: m.einheit_id, label: einheitText }] : [])]);
      return t?.id || null;
    };

    if (aktion === "termin") {
      const datum = String(body.datum || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return antwort({ ok: false, fehler: "Bitte ein Datum angeben." }, 400);
      await db.from("projekt_maengel").update({ status: "termin_geplant", termin_am: datum }).eq("id", m.id);
      await verlauf(db, m.id, wer, "termin", `Termin ${datumDe(datum)}${text ? " — " + sicher(text) : ""}`);
      await aktivitaet(db, g.mandant, g.projekt, m.zugang_id || null, "mangel_termin", { mangel_id: m.id, titel: m.titel, datum, handwerker: wer });
      await glocke(db, g.mandant, "mangel_termin", `Termin geplant: ${m.titel}`, `${wer} kommt am ${datumDe(datum)}${einheitText ? " · " + einheitText : ""}.`, "projekt_maengel", m.id, zustaendig);
      return antwort({ ok: true, status: "termin_geplant" });
    }
    if (aktion === "erledigt") {
      const fotos: string[] = Array.isArray(body.fotos) ? body.fotos : (body.foto ? [body.foto] : []);
      const pfade: string[] = [];
      for (let i = 0; i < Math.min(fotos.length, 6); i++) {
        const f = bytesAus(String(fotos[i])); if (!f || !/^image\//.test(f.mime)) continue;
        const pfad = `maengel/${g.projekt}/${m.id}/erledigt-${Date.now()}-${i + 1}.${endung(f.mime)}`;
        const { error } = await db.storage.from("projekt-dateien").upload(pfad, f.bytes, { contentType: f.mime, upsert: true });
        if (!error) pfade.push(pfad);
      }
      if (!pfade.length) return antwort({ ok: false, fehler: "Zur Erledigung gehört mindestens ein Foto." }, 400);
      await db.from("projekt_maengel").update({ status: "gemeldet_erledigt", erledigt_fotos: [...(m.erledigt_fotos || []), ...pfade] }).eq("id", m.id);
      await verlauf(db, m.id, wer, "erledigt_gemeldet", `${pfade.length} Foto(s)${text ? " — " + sicher(text) : ""}`);
      await aktivitaet(db, g.mandant, g.projekt, m.zugang_id || null, "mangel_erledigt_gemeldet", { mangel_id: m.id, titel: m.titel, fotos: pfade.length, handwerker: wer });
      const todoId = await todoAn(`Erledigung prüfen: ${m.titel}${einheitText ? " (" + einheitText + ")" : ""}`, "wichtig",
        `${wer} meldet den Mangel als erledigt (${pfade.length} Foto(s)). Prüfen und auf „geprüft erledigt“ setzen oder zurückgeben.`);
      await glocke(db, g.mandant, "mangel_erledigt_gemeldet", `Erledigt gemeldet: ${m.titel}`, `${wer}${einheitText ? " · " + einheitText : ""} — bitte prüfen.`, "projekt_maengel", m.id, zustaendig);
      return antwort({ ok: true, status: "gemeldet_erledigt", todo_id: todoId });
    }
    if (aktion === "rueckfrage") {
      if (!text) return antwort({ ok: false, fehler: "Bitte die Rückfrage eintragen." }, 400);
      await verlauf(db, m.id, wer, "rueckfrage", sicher(text));
      await aktivitaet(db, g.mandant, g.projekt, m.zugang_id || null, "mangel_rueckfrage", { mangel_id: m.id, titel: m.titel, handwerker: wer });
      const todoId = await todoAn(`Rückfrage ${wer}: ${m.titel}${einheitText ? " (" + einheitText + ")" : ""}`, "wichtig", sicher(text));
      await glocke(db, g.mandant, "mangel_rueckfrage", `Rückfrage: ${m.titel}`, `${wer}: ${sicher(text).slice(0, 200)}`, "projekt_maengel", m.id, zustaendig);
      return antwort({ ok: true, status: m.status, todo_id: todoId });
    }
    return antwort({ ok: false, fehler: "Unbekannte Aktion." }, 400);
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("handwerker-portal:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
