// ============================================================================
// maengel-fristen — der taegliche Lauf ueber die Fristen (fork_85)
// ============================================================================
// Eigene Function des Forks. Auftrag „Bautraeger v2", Abschnitt D:
//   * Frist minus drei Tage ohne Rueckmeldung -> Erinnerung an den
//     Handwerker (automatisch).
//   * Frist ueberschritten -> zweite Erinnerung an den Handwerker und ein
//     To-do „Mahnung" fuer die Verwaltung. Die Mahnung mit Nachfrist ist ein
//     ENTWURF im To-do (entwurf_betreff/entwurf_text/empfaenger_email, wie
//     die Vorlage Entwuerfe fuehrt) — es sei denn, das Projekt hat
//     „Mahnung automatisch senden" gesetzt; dann geht sie gleich hinaus.
//   * Alles landet im Verlauf des Mangels und als Vermerk.
//
// Cron: 06:20 taeglich (fork_85), Aufruf mit dem anon-Schluessel wie bei
// allen Laeufen der Vorlage. Ein Lauf hat keinen Mandanten: er liest die
// faelligen Maengel ALLER Mandanten und arbeitet je Zeile im Mandanten
// dieser Zeile weiter (tests/dienstschluessel-mandant.py, BEABSICHTIGT).
// Wiederholbar: erinnert_am und mahnung_am verhindern Doppelversand.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { antwort, cors, dienst, appAdresse, tokenNeu, datumDe, heute, tageDazu, mailen, glocke, vermerk, aktivitaet, verlauf, verwaltung, firmenName } from "./bautraeger.ts";

const OFFEN = ["offen", "beauftragt", "termin_geplant"];
const NACHFRIST_TAGE = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = dienst();
  const stichtag = heute();
  const bald = tageDazu(stichtag, 3);
  const app = appAdresse();
  let erinnert = 0, gemahnt = 0, entwuerfe = 0, uebersprungen = 0;
  try {
    // Alle Mandanten: faellige Maengel mit Frist (BEABSICHTIGT, je Zeile weiter im Mandanten der Zeile).
    const { data: liste, error } = await db.from("projekt_maengel")
      .select("id, mandant_id, projekt_id, einheit_id, zugang_id, titel, beschreibung, raum, gewerk, frist, nachfrist, status, projekt_kontakt_id, erinnert_am, mahnung_am, erstellt_von, todo_id, handwerker_token")
      .in("status", OFFEN).not("frist", "is", null).lte("frist", bald).limit(500);
    if (error) throw error;
    for (const m of liste || []) {
      const mandant = String(m.mandant_id);
      if (!mandant) { uebersprungen++; continue; }
      const { data: projekt } = await db.from("projekte").select("id, name, mahnung_automatisch, mandant_id").eq("id", m.projekt_id).eq("mandant_id", mandant).maybeSingle();
      if (!projekt) { uebersprungen++; continue; }
      let hk: any = null, mail: string | null = null;
      if (m.projekt_kontakt_id) {
        const { data } = await db.from("projekt_kontakte").select("id, gewerk, firma, name, email, portal_token, kontakt_id").eq("id", m.projekt_kontakt_id).eq("mandant_id", mandant).maybeSingle();
        hk = data; mail = hk?.email || null;
        if (hk && !mail && hk.kontakt_id) { const { data: k } = await db.from("kontakte").select("email").eq("id", hk.kontakt_id).maybeSingle(); mail = k?.email || null; }
        if (hk && !hk.portal_token) { hk.portal_token = tokenNeu(); await db.from("projekt_kontakte").update({ portal_token: hk.portal_token }).eq("id", hk.id); }
      }
      const link = app && hk?.portal_token ? `${app}/?handwerker=${hk.portal_token}` : (app && m.handwerker_token ? `${app}/?handwerker=${m.handwerker_token}` : null);
      let einheitText = "";
      if (m.einheit_id) { const { data: e } = await db.from("projekt_einheiten").select("we_nr").eq("id", m.einheit_id).maybeSingle(); if (e) einheitText = `WE ${e.we_nr}`; }
      const firma = await firmenName(db, mandant);
      const anrede = `Guten Tag${hk?.name ? " " + hk.name : ""},`;
      const gruss = firma ? `Mit freundlichen Grüßen\n${firma}` : "Mit freundlichen Grüßen";
      const wo = `${projekt.name}${einheitText ? " · " + einheitText : ""}${m.raum ? " · " + m.raum : ""}`;

      // --- Frist ueberschritten: zweite Erinnerung + Mahnung ----------------------------
      if (m.frist < stichtag && !m.mahnung_am) {
        const nachfrist = m.nachfrist || tageDazu(stichtag, NACHFRIST_TAGE);
        if (mail && m.status !== "termin_geplant") {
          const r = await mailen(db, mandant, mail, hk?.firma || hk?.name || null, `Erinnerung: Frist überschritten — ${m.titel}`,
            [anrede, "", `die Frist zur Beseitigung des Mangels „${m.titel}" (${wo}) ist am ${datumDe(m.frist)} abgelaufen. Uns liegt keine Rückmeldung vor.`,
             link ? `\nBitte melden Sie Termin oder Erledigung über Ihren Link:\n${link}` : "", "", gruss].join("\n"));
          await verlauf(db, m.id, "system", "erinnerung", r.ok ? `2. Erinnerung an ${mail} (Frist überschritten)` : `2. Erinnerung nicht gesendet: ${r.grund}`);
        }
        const betreff = `Mahnung: Mangelbeseitigung „${m.titel}" — Nachfrist bis ${datumDe(nachfrist)}`;
        const mahnText = [anrede, "",
          `Sie wurden mit der Beseitigung des Mangels „${m.titel}" (${wo}) beauftragt. Die vereinbarte Frist (${datumDe(m.frist)}) ist abgelaufen, eine Erledigung liegt uns nicht vor.`,
          `Wir setzen Ihnen hiermit eine Nachfrist bis zum ${datumDe(nachfrist)}. Nach fruchtlosem Ablauf behalten wir uns vor, den Mangel auf Ihre Kosten durch ein anderes Unternehmen beseitigen zu lassen.`,
          link ? `\nTermin, Erledigung (mit Foto) oder Rückfragen über Ihren Link:\n${link}` : "", "", gruss].join("\n");
        let gesendet = false;
        if (projekt.mahnung_automatisch && mail) {
          const r = await mailen(db, mandant, mail, hk?.firma || hk?.name || null, betreff, mahnText);
          gesendet = r.ok;
          await verlauf(db, m.id, "system", "mahnung", r.ok ? `Mahnung automatisch an ${mail}, Nachfrist ${datumDe(nachfrist)}` : `Mahnung nicht gesendet: ${r.grund}`);
        }
        const leute = await verwaltung(db, mandant, [m.erstellt_von]);
        const zustaendig = m.erstellt_von || leute[0]?.id || null;
        const { data: t } = await db.from("todos").insert({
          mandant_id: mandant, titel: `${gesendet ? "Mahnung gesendet" : "Mahnung freigeben"}: ${m.titel}${einheitText ? " (" + einheitText + ")" : ""}`,
          beschreibung: gesendet ? `Mahnung mit Nachfrist bis ${datumDe(nachfrist)} ist automatisch an ${mail} gegangen (Projekteinstellung).`
            : `Frist ${datumDe(m.frist)} überschritten. Entwurf prüfen und senden; Nachfrist ${datumDe(nachfrist)}.${mail ? "" : " Für den Handwerker ist keine E-Mail-Adresse hinterlegt."}`,
          typ: "aufgabe", status: gesendet ? "erledigt" : "offen", prioritaet: "dringend", faellig_am: stichtag,
          ersteller_id: zustaendig, zustaendig_id: zustaendig, team_sichtbar: true, tags: ["mangel", "mahnung", "neubau"], quelle: "system",
          entwurf_betreff: gesendet ? null : betreff, entwurf_text: gesendet ? null : mahnText, empfaenger_email: gesendet ? null : mail, empfaenger_name: gesendet ? null : (hk?.firma || hk?.name || null),
          erledigt_am: gesendet ? new Date().toISOString() : null,
          daten: { mangel_id: m.id, projekt_id: m.projekt_id, einheit_id: m.einheit_id || null, nachfrist },
        }).select("id").single();
        if (t) await db.from("todo_verknuepfung").insert([{ mandant_id: mandant, todo_id: t.id, objekt_typ: "mangel", objekt_id: m.id, label: m.titel.slice(0, 120) },
          ...(m.einheit_id ? [{ mandant_id: mandant, todo_id: t.id, objekt_typ: "einheit", objekt_id: m.einheit_id, label: einheitText }] : [])]);
        await db.from("projekt_maengel").update({ mahnung_am: new Date().toISOString(), nachfrist }).eq("id", m.id);
        if (!gesendet) await verlauf(db, m.id, "system", "mahnung_entwurf", `Mahnung als Entwurf zur Freigabe (To-do), Nachfrist ${datumDe(nachfrist)}`);
        await glocke(db, mandant, "mangel_frist_ueberschritten", `Frist überschritten: ${m.titel}`, `${wo} — Frist ${datumDe(m.frist)}. ${gesendet ? "Mahnung ist raus." : "Mahnung als Entwurf im To-do."}`, "projekt_maengel", m.id, null);
        await aktivitaet(db, mandant, m.projekt_id, m.zugang_id || null, "mangel_mahnung", { mangel_id: m.id, titel: m.titel, nachfrist, automatisch: gesendet });
        const { data: einheit } = m.einheit_id ? await db.from("projekt_einheiten").select("immobilie_id").eq("id", m.einheit_id).maybeSingle() : { data: null };
        await vermerk(db, mandant, { immobilie_id: einheit?.immobilie_id || null, typ: "mangel", titel: `Mahnung ${gesendet ? "gesendet" : "vorbereitet"}: ${m.titel}`, text: `${wo} — Nachfrist ${datumDe(nachfrist)}`, ref_tabelle: "projekt_maengel", ref_id: m.id });
        gesendet ? gemahnt++ : entwuerfe++;
        continue;
      }
      // --- Drei Tage vor der Frist ohne Rueckmeldung: Erinnerung -------------------------------
      if (m.frist <= bald && m.frist >= stichtag && !m.erinnert_am && m.status !== "termin_geplant") {
        let gesendet = false;
        if (mail) {
          const r = await mailen(db, mandant, mail, hk?.firma || hk?.name || null, `Erinnerung: Mangel „${m.titel}" bis ${datumDe(m.frist)}`,
            [anrede, "", `zur Erinnerung: der Mangel „${m.titel}" (${wo}) ist bis zum ${datumDe(m.frist)} zu beseitigen. Uns liegt noch keine Rückmeldung vor.`,
             link ? `\nTermin oder Erledigung bitte über Ihren Link melden:\n${link}` : "", "", gruss].join("\n"));
          gesendet = r.ok;
          await verlauf(db, m.id, "system", "erinnerung", r.ok ? `Erinnerung an ${mail} (Frist ${datumDe(m.frist)})` : `Erinnerung nicht gesendet: ${r.grund}`);
        } else {
          await verlauf(db, m.id, "system", "erinnerung", "Keine Erinnerung möglich: kein Handwerker oder keine E-Mail-Adresse");
          await glocke(db, mandant, "mangel_ohne_handwerker", `Frist naht, kein Handwerker: ${m.titel}`, `${wo} — Frist ${datumDe(m.frist)}. Bitte Gewerk/Handwerker zuordnen.`, "projekt_maengel", m.id, m.erstellt_von || null);
        }
        await db.from("projekt_maengel").update({ erinnert_am: new Date().toISOString() }).eq("id", m.id);
        if (gesendet) erinnert++;
      }
    }
    return antwort({ ok: true, stichtag, geprueft: (liste || []).length, erinnert, gemahnt, entwuerfe, uebersprungen });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("maengel-fristen:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
