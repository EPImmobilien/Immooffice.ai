// ============================================================================
// testphase-erinnerung — rechtzeitig sagen, dass die Testphase endet
// ============================================================================
// Eigene Funktion des Forks (fork_53). Läuft einmal am Tag aus dem Zeitplan.
//
// Drei Meldungen, gerechnet in VERBLEIBENDEN Tagen und nicht in
// vergangenen: sieben, zwei und null. Bei der voreingestellten Testphase von
// 28 Tagen ist das Tag 21, 26 und 28 — ändert der Betreiber die Länge im
// Plattform-Admin, wandern die Meldungen mit. Eine feste Zahl „Tag 21" wäre
// bei einer vierzehntägigen Testphase die dritte Mail nach dem Ende.
//
// Jede Meldung geht EINMAL. Festgehalten wird das in `abo_erinnerungen`;
// der Eindeutigkeitsschlüssel (Mandant, Art) ist die Sperre, nicht eine
// Abfrage davor — zwei gleichzeitige Läufe würden sich sonst gegenseitig
// nicht sehen.
//
// KEINE stillschweigende Verlängerung und keine Abofalle: die Testphase
// endet von selbst, es wird nichts abgebucht, und genau das steht auch in
// der Mail. Was danach gilt, steht ebenfalls darin — Lesezugriff für die im
// Katalog gesetzte Frist, damit niemand seine Daten verliert.
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

function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md).");
}

function htmlSicher(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Die drei Stufen: verbleibende Tage, Kennung, Betreff. */
const STUFEN = [
  { tage: 7, art: "test_7", dringend: false },
  { tage: 2, art: "test_2", dringend: false },
  { tage: 0, art: "test_0", dringend: true },
];

function text(stufe: { tage: number; dringend: boolean }, firma: string,
              bis: string, lesetage: number, portal: string) {
  const datum = new Date(bis).toLocaleDateString("de-DE",
    { day: "2-digit", month: "long", year: "numeric" });
  const betreff = stufe.tage === 0
    ? "Ihre Testphase endet heute"
    : stufe.tage === 2
      ? "Noch zwei Tage Testphase"
      : "Noch eine Woche Testphase";

  const zeilen = [
    `Guten Tag,`,
    ``,
    stufe.tage === 0
      ? `die Testphase von ${firma} endet heute, am ${datum}.`
      : `die Testphase von ${firma} endet am ${datum} — das ist in `
        + `${stufe.tage} ${stufe.tage === 1 ? "Tag" : "Tagen"}.`,
    ``,
    `Es wird nichts automatisch abgebucht und nichts stillschweigend `
      + `verlängert. Wenn Sie weiterarbeiten möchten, wählen Sie bis dahin `
      + `einen Tarif — dann geht es ohne Unterbrechung weiter.`,
    ``,
    `Tun Sie es nicht, bleiben Ihre Daten zunächst erhalten: ${lesetage} Tage `
      + `lang können Sie alles lesen und exportieren, nur nichts Neues mit `
      + `der KI erzeugen. Erst danach wird der Zugang geschlossen.`,
    ``,
    `Tarif wählen: ${portal}`,
    ``,
    `Mit freundlichen Grüßen`,
    `Ihr Team von immoOffice.ai`,
  ];
  const roh = zeilen.join("\n");
  const html = "<div style=\"font-family:system-ui,-apple-system,'Segoe UI',"
    + "Roboto,sans-serif;font-size:15px;line-height:1.65;color:#1B2A47\">"
    + zeilen.map((z) => z
        ? `<p style="margin:0 0 12px">${htmlSicher(z).replace(
            portal, `<a href="${htmlSicher(portal)}" style="color:#B5934F">${htmlSicher(portal)}</a>`)}</p>`
        : "").join("")
    + "</div>";
  return { betreff, text: roh, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const probelauf = await req.json().then((b) => !!b?.probelauf).catch(() => false);
    const portal = (Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL")).replace(/\/$/, "");
    const absender = Deno.env.get("SMTP_FROM_EMAIL") || immoFehlt("SMTP_FROM_EMAIL");
    const resend = Deno.env.get("RESEND_API_KEY") || immoFehlt("RESEND_API_KEY");

    const { data: werte } = await db.from("plattform_werte").select("schluessel, wert");
    const w: Record<string, unknown> = {};
    for (const z of werte || []) w[z.schluessel] = z.wert;
    const lesetage = Number(w.lesezugriff_tage ?? 30);

    // Alle Mandanten in der Testphase mit einem Ende in der Zukunft oder
    // heute. Das Fenster ist ein ganzer Tag: der Lauf kommt einmal täglich,
    // und `testphase_bis` trägt eine Uhrzeit.
    const { data: mandanten } = await db.from("mandanten")
      .select("id, name, testphase_bis")
      .eq("abo_status", "test")
      .not("testphase_bis", "is", null);

    const jetzt = Date.now();
    const ergebnis: Array<Record<string, unknown>> = [];

    for (const m of mandanten || []) {
      const rest = Math.ceil((new Date(m.testphase_bis).getTime() - jetzt) / 86400000);
      const stufe = STUFEN.find((s) => s.tage === rest);
      if (!stufe) continue;

      // Wer schon einen Tarif hat, bekommt keine Erinnerung mehr — auch
      // wenn die Testphase formal noch läuft.
      const { data: abo } = await db.from("mandant_abo")
        .select("status").eq("mandant_id", m.id).maybeSingle();
      if (abo && abo.status !== "test") continue;

      // Die Sperre gegen Doppelversand: der Schlüssel, nicht eine Abfrage.
      const { error: schon } = await db.from("abo_erinnerungen")
        .insert({ mandant_id: m.id, art: stufe.art });
      if (schon) {
        if (schon.code === "23505") continue;   // schon geschickt
        console.error("abo_erinnerungen:", schon.message);
        continue;
      }

      // Die Chefs des Hauses. Abrechnung ist Chefsache; ein Mitarbeiter
      // kann mit der Nachricht nichts anfangen.
      const { data: chefs } = await db.from("profiles")
        .select("email, name").eq("mandant_id", m.id).eq("role", "chef");
      const adressen = (chefs || []).map((c) => String(c.email || "")).filter(Boolean);
      if (!adressen.length) {
        ergebnis.push({ mandant: m.id, stufe: stufe.art, versand: "kein Chef mit Adresse" });
        continue;
      }

      const mail = text(stufe, String(m.name || "Ihrem Haus"),
        String(m.testphase_bis), lesetage, portal);

      if (probelauf) {
        ergebnis.push({ mandant: m.id, stufe: stufe.art, an: adressen, betreff: mail.betreff,
                        versand: "probelauf" });
        // Im Probelauf die Sperre wieder lösen, sonst bliebe die echte
        // Meldung aus.
        await db.from("abo_erinnerungen").delete()
          .eq("mandant_id", m.id).eq("art", stufe.art);
        continue;
      }

      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + resend, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `immoOffice.ai <${absender}>`,
            to: adressen, subject: mail.betreff, text: mail.text, html: mail.html,
          }),
        });
        const roh = await r.text();
        if (!r.ok) throw new Error(`Resend ${r.status}: ${roh.slice(0, 300)}`);
        await db.from("abo_erinnerungen")
          .update({ gesendet_am: new Date().toISOString(), empfaenger: adressen.length })
          .eq("mandant_id", m.id).eq("art", stufe.art);
        ergebnis.push({ mandant: m.id, stufe: stufe.art, an: adressen.length, versand: "gesendet" });
      } catch (e) {
        const grund = e instanceof Error ? e.message : String(e);
        // Die Sperre wieder lösen: eine Meldung, die nicht hinausging, darf
        // nicht als erledigt gelten.
        await db.from("abo_erinnerungen").delete()
          .eq("mandant_id", m.id).eq("art", stufe.art);
        console.error("testphase-erinnerung:", grund);
        ergebnis.push({ mandant: m.id, stufe: stufe.art, versand: "fehler", grund });
      }
    }

    return antwort({ ok: true, geprueft: (mandanten || []).length, ergebnis });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("testphase-erinnerung:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
