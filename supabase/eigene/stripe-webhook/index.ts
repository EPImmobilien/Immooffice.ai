// ============================================================================
// stripe-webhook — hier entsteht der maßgebliche Abo-Stand
// ============================================================================
// Eigene Funktion des Forks (fork_47). CLAUDE.md: „Abo-Status niemals allein
// dem Frontend glauben" und „Stripe-Webhooks idempotent verarbeiten."
//
// Beides ist hier kein Grundsatz, sondern Bauweise:
//
//   * `mandant_abo` hat für Angemeldete KEINE Schreibrichtlinie. Was dort
//     steht, hat diese Funktion geschrieben, und sonst niemand.
//   * Die Ereigniskennung ist der Primärschlüssel von `stripe_ereignisse`.
//     Der zweite Einfügeversuch scheitert — und genau daran erkennt die
//     Funktion, dass sie dieses Ereignis schon hatte. Kein Zählerstand, kein
//     Zeitfenster, keine Vermutung: eine Sperre in der Datenbank.
//
// ---------------------------------------------------------------------------
// WARUM DIE SIGNATUR SELBST GEPRÜFT WIRD
// ---------------------------------------------------------------------------
// Dieser Endpunkt ist öffentlich (verify_jwt = false) — Stripe bringt kein
// Supabase-Token mit. Die Echtheit hängt damit allein an der Signatur im Kopf
// `stripe-signature`. Sie wird hier nachgerechnet, mit Zeitfenster gegen
// Wiedereinspielung. Ohne gültige Signatur passiert NICHTS, nicht einmal ein
// Protokolleintrag — sonst könnte jeder die Tabelle vollschreiben.
//
// Gerechnet wird mit der Web-Crypto-API statt mit dem Stripe-SDK: das SDK
// zöge eine große Abhängigkeit in jede Funktion, und die Prüfung ist
// dreißig Zeilen HMAC.
//
// ---------------------------------------------------------------------------
// TEST- ODER LIVEMODUS — ABER NIE GEMISCHT
// ---------------------------------------------------------------------------
// Seit dem Live-Gang (Weisung des Betreibers, 07.10.2026) laufen beide
// Modi. Die Sperre ist jetzt eine andere: ein Ereignis muss zum Modus des
// hinterlegten Schlüssels passen. Ein Testereignis an einem Live-System
// (oder umgekehrt) wird abgewiesen — sonst schriebe eine Testkarte echte
// Credits gut.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const antwort = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Fünf Minuten. Stripe empfiehlt das; älter heißt: entweder eine sehr lange
// Leitung oder eine aufgezeichnete Anfrage, die noch einmal gespielt wird.
const TOLERANZ_SEKUNDEN = 300;

function gleich(a: string, b: string): boolean {
  // Zeichenweiser Vergleich mit fester Laufzeit. Ein früher Abbruch verriete
  // über die Dauer, wie viele Zeichen gestimmt haben.
  if (a.length !== b.length) return false;
  let ungleich = 0;
  for (let i = 0; i < a.length; i++) ungleich |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ungleich === 0;
}

async function signaturGueltig(roh: string, kopf: string, geheim: string): Promise<boolean> {
  const teile: Record<string, string[]> = {};
  for (const stueck of String(kopf || "").split(",")) {
    const [k, v] = stueck.split("=");
    if (!k || !v) continue;
    (teile[k.trim()] = teile[k.trim()] || []).push(v.trim());
  }
  const t = teile.t?.[0];
  const v1 = teile.v1 || [];
  if (!t || !v1.length) return false;

  const alter = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(alter) || alter > TOLERANZ_SEKUNDEN) return false;

  const schluessel = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(geheim),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign(
    "HMAC", schluessel, new TextEncoder().encode(`${t}.${roh}`));
  const erwartet = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  return v1.some((k) => gleich(k, erwartet));
}

// ---------------------------------------------------------------------------
// API-FASSUNG
// ---------------------------------------------------------------------------
// Der Webhook-Endpunkt bei Stripe ist auf 2025-12-15.clover festgelegt
// (dieselbe Fassung senden abo-checkout und abo-verwalten). Seit der
// Basil-Fassung liegen drei Dinge woanders als vorher:
//   * die Periode eines Abos an den Positionen (items.data[].current_period_*)
//   * der Preis einer Rechnungszeile unter pricing.price_details.price
//   * das Abo einer Rechnung unter parent.subscription_details
// Die Helfer unten lesen beide Formen. Ein Endpunkt, den jemand auf eine
// ältere Fassung zurückstellt, bricht damit nicht still.
const STRIPE_VERSION = "2025-12-15.clover";

function periode(abo: any): { von: unknown; bis: unknown } {
  const pos = abo?.items?.data?.[0] || {};
  return {
    von: abo?.current_period_start ?? pos.current_period_start,
    bis: abo?.current_period_end ?? pos.current_period_end,
  };
}
function zeilenPreis(z: any): string | null {
  const p = z?.pricing?.price_details?.price ?? z?.price?.id ?? z?.price;
  return typeof p === "string" ? p : (p?.id ?? null);
}
function rechnungsAbo(r: any): string | null {
  const s = r?.parent?.subscription_details?.subscription ?? r?.subscription;
  return typeof s === "string" ? s : (s?.id ?? null);
}
// Woher eine Rechnung kommt. Nur Abo-Rechnungen tragen Tarif-Credits;
// eine Paket-Rechnung (billing_reason "manual") schreibt nur das Paket gut.
function ausAbo(r: any): boolean {
  return String(r?.billing_reason || "").startsWith("subscription") || !!rechnungsAbo(r);
}

function jetzt() { return new Date().toISOString(); }
function ausStripeZeit(sek: unknown): string | null {
  const n = Number(sek);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

async function wert(db: any, schluessel: string, vorgabe: number): Promise<number> {
  const { data } = await db.from("plattform_werte").select("wert")
    .eq("schluessel", schluessel).maybeSingle();
  const n = Number(data?.wert);
  return Number.isFinite(n) ? n : vorgabe;
}

/** Welcher Mandant? Aus den Metadaten, sonst über die Stripe-Kundenkennung. */
async function mandantFinden(db: any, obj: any): Promise<string | null> {
  const ausMeta = obj?.metadata?.mandant_id
    || obj?.parent?.subscription_details?.metadata?.mandant_id
    || obj?.subscription_details?.metadata?.mandant_id;
  if (typeof ausMeta === "string" && ausMeta) return ausMeta;
  const kunde = obj?.customer;
  if (typeof kunde === "string" && kunde) {
    const { data } = await db.from("mandant_abo").select("mandant_id")
      .eq("stripe_customer_id", kunde).maybeSingle();
    if (data?.mandant_id) return data.mandant_id;
  }
  const abo = rechnungsAbo(obj) ?? obj?.id;
  if (typeof abo === "string" && abo.startsWith("sub_")) {
    const { data } = await db.from("mandant_abo").select("mandant_id")
      .eq("stripe_subscription_id", abo).maybeSingle();
    if (data?.mandant_id) return data.mandant_id;
  }
  return null;
}

/** Tarif und Zusatznutzer aus den Positionen eines Abos. */
function ausPositionen(abo: any, tarife: any[]): { tarif: string | null; intervall: string; zusatz: number } {
  let tarif: string | null = null;
  let intervall = "monat";
  let zusatz = 0;
  for (const p of abo?.items?.data || []) {
    const preisId = p?.price?.id;
    const menge = Number(p?.quantity ?? 1);
    const treffer = tarife.find((t) =>
      t.stripe_price_monat_id === preisId || t.stripe_price_jahr_id === preisId);
    if (!treffer) continue;
    if (treffer.ist_zusatznutzer) { zusatz += menge; continue; }
    tarif = treffer.schluessel;
    intervall = treffer.stripe_price_jahr_id === preisId ? "jahr" : "monat";
  }
  return { tarif, intervall, zusatz };
}

/** Steuer einer Rechnung — neue Form (total_taxes) und alte (tax). */
function steuer(r: any): number {
  if (Array.isArray(r?.total_taxes)) {
    return r.total_taxes.reduce((s: number, x: any) => s + Number(x?.amount ?? 0), 0);
  }
  return Number(r?.tax ?? 0);
}

/**
 * Eine Rechnung in `stripe_rechnungen` schreiben. Abgelegt werden Beträge,
 * Nummer, Status und die Stripe-Links — keine Positionen, keine Zahlungsdaten.
 * Upsert über die Rechnungskennung: jedes spätere Ereignis derselben
 * Rechnung überschreibt den Stand, nichts entsteht doppelt.
 */
async function rechnungSpiegeln(db: any, mandant: string, r: any) {
  if (!r?.id || String(r.object) !== "invoice") return;
  const brutto = Number(r.total ?? 0);
  const st = steuer(r);
  await db.from("stripe_rechnungen").upsert({
    id: String(r.id),
    mandant_id: mandant,
    art: ausAbo(r) ? "abo" : "einmal",
    nummer: r.number || null,
    status: String(r.status || ""),
    waehrung: String(r.currency || "eur"),
    netto_cent: brutto - st,
    steuer_cent: st,
    brutto_cent: brutto,
    bezahlt_cent: Number(r.amount_paid ?? 0),
    offen_cent: Number(r.amount_remaining ?? 0),
    reverse_charge: JSON.stringify(r?.total_taxes ?? []).includes("reverse_charge"),
    stripe_abo_id: rechnungsAbo(r),
    stripe_kunde_id: typeof r.customer === "string" ? r.customer : null,
    rechnung_url: r.hosted_invoice_url || null,
    pdf_url: r.invoice_pdf || null,
    erstellt_am: ausStripeZeit(r.created),
    bezahlt_am: ausStripeZeit(r?.status_transitions?.paid_at),
    geaendert_am: jetzt(),
  }, { onConflict: "mandant_id,id" });
}

/** Gutschrift (Erstattung über Stripe) — als negative Zeile neben der Rechnung. */
async function gutschriftSpiegeln(db: any, mandant: string, g: any) {
  if (!g?.id) return;
  const brutto = Number(g.total ?? 0);
  const st = steuer(g);
  await db.from("stripe_rechnungen").upsert({
    id: String(g.id),
    mandant_id: mandant,
    art: "gutschrift",
    nummer: g.number || null,
    status: String(g.status || ""),
    waehrung: String(g.currency || "eur"),
    netto_cent: -(brutto - st),
    steuer_cent: -st,
    brutto_cent: -brutto,
    bezahlt_cent: 0,
    offen_cent: 0,
    reverse_charge: false,
    bezug_rechnung_id: typeof g.invoice === "string" ? g.invoice : null,
    stripe_kunde_id: typeof g.customer === "string" ? g.customer : null,
    pdf_url: g.pdf || null,
    erstellt_am: ausStripeZeit(g.created),
    geaendert_am: jetzt(),
  }, { onConflict: "mandant_id,id" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const geheim = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const schluessel = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!geheim) return antwort({ ok: false, fehler: "STRIPE_WEBHOOK_SECRET fehlt." }, 500);
  const liveSystem = schluessel.startsWith("sk_live_");
  if (schluessel && !liveSystem && !schluessel.startsWith("sk_test_")) {
    return antwort({ ok: false, fehler: "STRIPE_SECRET_KEY muss mit sk_test_ oder sk_live_ beginnen." }, 500);
  }

  const roh = await req.text();
  const kopf = req.headers.get("stripe-signature") || "";
  if (!(await signaturGueltig(roh, kopf, geheim))) {
    // Kein Protokolleintrag: wer keine gültige Signatur hat, soll auch
    // keine Zeile schreiben können.
    return antwort({ ok: false, fehler: "Signatur ungueltig." }, 400);
  }

  let ereignis: any;
  try { ereignis = JSON.parse(roh); } catch { return antwort({ ok: false }, 400); }
  if (ereignis?.api_version && ereignis.api_version !== STRIPE_VERSION) {
    // Kein Abbruch — die Helfer lesen beide Formen. Aber sichtbar machen:
    // der Endpunkt sollte auf dieselbe Fassung gestellt sein.
    console.warn(`stripe-webhook: Ereignis in Fassung ${ereignis.api_version}, erwartet ${STRIPE_VERSION}`);
  }
  if (schluessel && Boolean(ereignis?.livemode) !== liveSystem) {
    return antwort({ ok: false, fehler: liveSystem
      ? "Testereignis an einem Live-System abgewiesen."
      : "Live-Ereignis an einem Testsystem abgewiesen." }, 400);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- Die Sperre gegen Doppelverarbeitung -------------------------------
  // Der Primärschlüssel IST die Sperre. Scheitert das Einfügen, hatten wir
  // das Ereignis schon — dann wird mit 200 geantwortet, damit Stripe
  // aufhört, es erneut zuzustellen.
  const { error: schonDa } = await db.from("stripe_ereignisse").insert({
    id: String(ereignis.id), typ: String(ereignis.type || ""), nutzlast: ereignis,
  });
  if (schonDa) {
    if (String(schonDa.code) === "23505") {
      return antwort({ ok: true, doppelt: true, id: ereignis.id });
    }
    console.error("stripe-webhook: Protokoll nicht geschrieben:", schonDa.message);
    return antwort({ ok: false, fehler: schonDa.message }, 500);
  }

  const abschluss = async (fehler?: string) => {
    await db.from("stripe_ereignisse")
      .update({ verarbeitet_am: jetzt(), fehler: fehler || null })
      .eq("id", String(ereignis.id));
  };

  try {
    const obj = ereignis?.data?.object || {};
    const typ = String(ereignis.type || "");
    const { data: tarife } = await db.from("plattform_tarife").select("*");
    const mandant = await mandantFinden(db, obj);

    if (!mandant) {
      // Kein Mandant zuzuordnen: nicht raten. Der Eintrag bleibt mit Grund
      // stehen und lässt sich nachsehen.
      await abschluss("Kein Mandant zuzuordnen.");
      return antwort({ ok: true, ohne_mandant: true });
    }

    const setze = async (felder: Record<string, unknown>) => {
      await db.from("mandant_abo")
        .upsert({ mandant_id: mandant, ...felder, geaendert_am: jetzt() },
                { onConflict: "mandant_id" });
    };

    switch (typ) {
      // --- Der Abschluss --------------------------------------------------
      case "checkout.session.completed": {
        // Nur die Kennungen — der Status kommt mit dem Abo-Ereignis. Bei
        // einem Paketkauf (mode "payment") gibt es kein Abo; dann darf die
        // Kennung eines laufenden Abos NICHT mit null überschrieben werden.
        const felder: Record<string, unknown> = {};
        if (typeof obj.customer === "string") felder.stripe_customer_id = obj.customer;
        if (obj.mode === "subscription" && typeof obj.subscription === "string") {
          felder.stripe_subscription_id = obj.subscription;
        }
        if (Object.keys(felder).length) await setze(felder);
        break;
      }

      // --- Das Abo entsteht oder ändert sich ------------------------------
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const { tarif, intervall, zusatz } = ausPositionen(obj, tarife || []);
        const p = periode(obj);
        const von = ausStripeZeit(p.von);
        const bis = ausStripeZeit(p.bis);

        const { data: vorher } = await db.from("mandant_abo")
          .select("mindestlaufzeit_bis, status, gruenderpreis").eq("mandant_id", mandant).maybeSingle();

        // Die Mindestlaufzeit entsteht EINMAL, mit der ersten bezahlten
        // Periode. Ein späteres Upgrade verlängert sie nicht — der Kunde
        // hat sich auf sechs Monate eingelassen, nicht auf sechs ab jedem
        // Tarifwechsel.
        let mindest = vorher?.mindestlaufzeit_bis ?? null;
        if (!mindest && von && obj.status === "active") {
          const monate = await wert(db, "mindestlaufzeit_monate", 6);
          const d = new Date(von);
          d.setMonth(d.getMonth() + monate);
          mindest = d.toISOString();
        }

        const gekuendigt = obj.cancel_at_period_end === true || !!obj.cancel_at;
        const status = obj.status === "active" || obj.status === "trialing"
          ? (gekuendigt ? "gekuendigt" : "aktiv")
          : obj.status === "past_due" || obj.status === "unpaid" ? "zahlung_offen"
          : obj.status === "canceled" ? "abgelaufen" : "zahlung_offen";

        const lesezugriffTage = await wert(db, "lesezugriff_tage", 30);
        const endet = ausStripeZeit(obj.cancel_at) || (gekuendigt ? bis : null);

        await setze({
          tarif, intervall, status, zusatznutzer: zusatz,
          stripe_subscription_id: typeof obj.id === "string" ? obj.id : null,
          stripe_customer_id: typeof obj.customer === "string" ? obj.customer : null,
          periode_von: von, periode_bis: bis,
          mindestlaufzeit_bis: mindest,
          cancel_at: endet,
          gekuendigt_am: gekuendigt ? jetzt() : null,
          lesezugriff_bis: endet
            ? new Date(new Date(endet).getTime() + lesezugriffTage * 86400000).toISOString()
            : null,
          zahlung_fehler_seit: status === "zahlung_offen" ? jetzt() : null,
        });
        await db.from("mandanten").update({ abo_status: status }).eq("id", mandant);
        break;
      }

      // --- Das Abo endet ---------------------------------------------------
      case "customer.subscription.deleted": {
        const lesezugriffTage = await wert(db, "lesezugriff_tage", 30);
        await setze({
          status: "abgelaufen",
          cancel_at: jetzt(),
          lesezugriff_bis: new Date(Date.now() + lesezugriffTage * 86400000).toISOString(),
          // Der Gründerpreis ist weg, und zwar endgültig: „solange das Abo
          // ununterbrochen läuft". Der PLATZ bleibt verbraucht — sonst wäre
          // „die ersten 50 Kunden" eine Drehtür.
          gruenderpreis: false,
        });
        await db.from("mandanten").update({ abo_status: "abgelaufen" }).eq("id", mandant);
        break;
      }

      // --- Bezahlt: Credits zuteilen ---------------------------------------
      case "invoice.paid": {
        await rechnungSpiegeln(db, mandant, obj);

        // Gekaufte Credit-Pakete: je Position einmal. Die Referenz trägt
        // Rechnung und Zeile — dieselbe Zeile schreibt nie zweimal gut.
        for (const z of obj?.lines?.data || []) {
          const preisId = zeilenPreis(z);
          if (!preisId) continue;
          const { data: paket } = await db.from("plattform_credit_pakete")
            .select("*").eq("stripe_price_id", preisId).maybeSingle();
          if (!paket) continue;
          const menge = Number(z.quantity ?? 1);
          const gueltig = new Date();
          gueltig.setMonth(gueltig.getMonth() + paket.gueltig_monate);
          await db.rpc("credits_gutschreiben", {
            p_mandant: mandant, p_quelle: "paket",
            p_credits: paket.credits * menge,
            p_gueltig_bis: gueltig.toISOString(),
            p_referenz: "paket:" + String(obj.id) + ":" + String(z.id),
          });
        }

        // Alles Weitere gilt nur für Abo-Rechnungen. Eine Paket-Rechnung
        // darf weder den Abo-Status anfassen noch Tarif-Credits auslösen —
        // sonst brächte jeder Paketkauf ein Monatskontingent obendrauf.
        if (!ausAbo(obj)) break;

        await setze({ status: "aktiv", zahlung_fehler_seit: null });
        await db.from("mandanten").update({ abo_status: "aktiv" }).eq("id", mandant);

        // Tarif-Credits gibt es für den Beginn einer Periode: Abschluss und
        // Verlängerung. Eine Nachberechnung beim Wechsel nach oben
        // (subscription_update) bringt KEIN zweites Monatskontingent; das
        // grössere kommt mit der nächsten Periode.
        const grund = String(obj.billing_reason || "");
        const periodeBeginnt = grund === "subscription_create" || grund === "subscription_cycle";

        const von = ausStripeZeit(obj.period_start) || jetzt();
        const bis = ausStripeZeit(obj.period_end);
        const { data: abo } = await db.from("mandant_abo")
          .select("tarif, intervall").eq("mandant_id", mandant).maybeSingle();
        const t = (tarife || []).find((x: any) => x.schluessel === abo?.tarif);
        if (periodeBeginnt && t?.credits_monat > 0) {
          // Beim Jahresabo gilt die Zuteilung einen Monat, nicht ein Jahr:
          // „Bei Jahresabo monatliche Zuteilung". Den Rest holt der
          // monatliche Lauf.
          const gueltigBis = abo?.intervall === "jahr"
            ? new Date(new Date(von).getTime() + 31 * 86400000).toISOString()
            : bis;
          await db.rpc("credits_gutschreiben", {
            p_mandant: mandant, p_quelle: "tarif", p_credits: t.credits_monat,
            p_gueltig_bis: gueltigBis,
            p_referenz: "rechnung:" + String(obj.id),
          });
        }

        // Der Gründerplatz wird bei der ERSTEN bezahlten Abo-Rechnung
        // vergeben. (Den Rabatt selbst hat die Kasse nur angehängt, solange
        // Plätze frei waren; die Funktion vergibt höchstens einen je Mandant.)
        const mitGruender = grund === "subscription_create";
        if (mitGruender && abo?.tarif === String((await db.from("plattform_werte").select("wert")
              .eq("schluessel", "gruender_tarif").maybeSingle()).data?.wert ?? "starter")
              .replace(/"/g, "")) {
          await db.rpc("gruender_platz_vergeben", { p_mandant: mandant });
        }
        break;
      }

      // --- Rechnungen spiegeln (Grundlage für Betreiber-Ansicht, Export) ----
      case "invoice.finalized":
      case "invoice.voided":
      case "invoice.marked_uncollectible": {
        await rechnungSpiegeln(db, mandant, obj);
        break;
      }

      case "credit_note.created": {
        await gutschriftSpiegeln(db, mandant, obj);
        break;
      }

      // --- Zahlung gescheitert ---------------------------------------------
      case "invoice.payment_failed": {
        await rechnungSpiegeln(db, mandant, obj);
        // Ein gescheiterter Paketkauf ist kein Zahlungsverzug im Abo.
        if (!ausAbo(obj)) break;
        const { data: abo } = await db.from("mandant_abo")
          .select("zahlung_fehler_seit").eq("mandant_id", mandant).maybeSingle();
        const frist = await wert(db, "zahlung_frist_tage", 14);
        const seit = abo?.zahlung_fehler_seit || jetzt();
        await setze({
          status: "zahlung_offen",
          zahlung_fehler_seit: seit,
          lesezugriff_bis: new Date(new Date(seit).getTime()
            + (frist + await wert(db, "lesezugriff_tage", 30)) * 86400000).toISOString(),
        });
        await db.from("mandanten").update({ abo_status: "zahlung_offen" }).eq("id", mandant);
        break;
      }

      default:
        // Alles andere wird protokolliert und nicht verarbeitet. Stripe
        // schickt viel; was wir nicht brauchen, soll auch nichts ändern.
        break;
    }

    await abschluss();
    return antwort({ ok: true, typ, mandant });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("stripe-webhook:", grund);
    await abschluss(grund);
    // 500, damit Stripe es noch einmal versucht. Der Protokolleintrag
    // bleibt stehen — der zweite Anlauf findet ihn und tut nichts. Das ist
    // der eine Fall, in dem die Sperre im Weg stünde; deshalb wird der
    // Eintrag beim Fehler wieder freigegeben.
    await db.from("stripe_ereignisse").delete().eq("id", String(ereignis.id));
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
