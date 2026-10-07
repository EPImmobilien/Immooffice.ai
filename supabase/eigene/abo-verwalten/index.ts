// ============================================================================
// abo-verwalten — Stand, Zahlungsmittel, Kündigung, Zusatznutzer
// ============================================================================
// Eigene Funktion des Forks (fork_47).
//
// Die Kündigung läuft BEWUSST nicht über das Stripe-Kundenportal, sondern
// hier. Grund: die Mindestlaufzeit. Stripe kennt sie nicht; es würde zum
// Periodenende kündigen, auch wenn noch vier Monate offen sind. Das Portal
// bleibt für Zahlungsmittel und Rechnungen zuständig — dort richtet es
// keinen Schaden an.
//
// Aktionen:
//   stand        — was gilt gerade (Tarif, Nutzer, Credits, Fristen)
//   portal       — Stripe-Kundenportal öffnen (Zahlungsmittel, Rechnungen)
//   kuendigen    — zum spätestmöglichen der beiden Termine
//   widerrufen   — eine Kündigung zurücknehmen, solange sie nicht wirkt
//   zusatznutzer — Anzahl im laufenden Abo ändern
//   tarif_wechseln — höherer Tarif sofort (anteilig abgerechnet), niedrigerer
//                  zum Ende der laufenden Periode (Subscription Schedule)
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

// Feste API-Fassung — dieselbe wie in abo-checkout und im Webhook.
const STRIPE_VERSION = "2026-08-26.dahlia";

async function stripe(pfad: string, felder?: Record<string, string>, methode = "POST") {
  const schluessel = Deno.env.get("STRIPE_SECRET_KEY") || immoFehlt("STRIPE_SECRET_KEY");
  if (!schluessel.startsWith("sk_test_") && !schluessel.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY muss mit sk_test_ oder sk_live_ beginnen.");
  }
  const r = await fetch("https://api.stripe.com/v1/" + pfad, {
    method: methode,
    headers: {
      Authorization: "Bearer " + schluessel,
      "Stripe-Version": STRIPE_VERSION,
      ...(felder ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: felder ? new URLSearchParams(felder).toString() : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || ("Stripe: " + r.status));
  return d;
}

/**
 * Die Rücksprungadresse für Stripe. Ein Secret ist schnell falsch getippt —
 * ohne https://, mit Leerzeichen, in Anführungszeichen, mit Schrägstrich am
 * Ende. Stripe antwortet darauf nur „Not a valid URL", und der Kunde sieht
 * „Edge Function returned a non-2xx status code". Hier wird geglättet, was
 * eindeutig ist, und mit Klartext abgebrochen, was es nicht ist.
 */
function portalAdresse(): string {
  let a = String(Deno.env.get("PORTAL_URL") || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!a) immoFehlt("PORTAL_URL");
  if (!/^https?:\/\//i.test(a)) a = "https://" + a;
  try {
    const u = new URL(a);
    if (!u.hostname.includes(".") && u.hostname !== "localhost") throw new Error("ohne Domain");
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    throw new Error(`PORTAL_URL ist keine gültige Adresse („${a}"). Erwartet z. B. https://app.example.de`);
  }
}

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
    const { data: profil } = await db.from("profiles")
      .select("role, mandant_id").eq("id", u.user.id).maybeSingle();
    if (!profil?.mandant_id) return antwort({ ok: false, fehler: "Kein Mandant." }, 403);
    const mandant = profil.mandant_id;
    const istChef = profil.role === "chef";

    const body = await req.json().catch(() => ({}));
    const aktion = String(body.aktion || "stand");

    const { data: abo } = await db.from("mandant_abo").select("*").eq("mandant_id", mandant).maybeSingle();

    // --- Stand -------------------------------------------------------------
    // Den darf auch ein Mitarbeiter sehen: der Credit-Saldo steht in der
    // Kopfzeile, und wer KI benutzt, muss wissen, woran er ist. Die
    // Vertragsdaten bleiben dem Chef vorbehalten.
    if (aktion === "stand") {
      const [{ data: saldo }, { data: zugriff }, { data: limit }, konten, tarif] = await Promise.all([
        db.rpc("credits_saldo", { p_mandant: mandant }),
        db.rpc("abo_zugriff", { p_mandant: mandant }),
        db.rpc("nutzer_limit", { p_mandant: mandant }),
        db.from("credit_konten")
          .select("quelle, credits, verbraucht, gueltig_bis")
          .eq("mandant_id", mandant).order("gueltig_bis", { nullsFirst: false }),
        abo?.tarif
          ? db.from("plattform_tarife").select("*").eq("schluessel", abo.tarif).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const { count: nutzer } = await db.from("profiles")
        .select("id", { count: "exact", head: true }).eq("mandant_id", mandant);
      const { data: m } = await db.from("mandanten")
        .select("testphase_bis, abo_status, gesperrt_am").eq("id", mandant).maybeSingle();

      // Sind die Credits knapp? „Knapp" ist kein Gefühl: der Anteil steht im
      // Katalog (warnung_rest_prozent) und wird gegen das Monatskontingent
      // des Tarifs gerechnet. Gerechnet wird HIER und nicht in der
      // Oberfläche — sonst bräuchte jede Ansicht den Tarif, und ein
      // Mitarbeiter bekommt ihn mit Absicht nicht zu sehen.
      const { data: w } = await db.from("plattform_werte")
        .select("wert").eq("schluessel", "warnung_rest_prozent").maybeSingle();
      const anteil = Number(String(w?.wert ?? "10").replace(/"/g, "")) || 10;
      const monatskontingent = Number((tarif as { data?: { credits_monat?: number } })?.data?.credits_monat ?? 0);
      const knapp = monatskontingent > 0
        && Number(saldo ?? 0) < Math.ceil(monatskontingent * anteil / 100);

      return antwort({
        ok: true,
        zugriff, saldo, credits_knapp: knapp,
        nutzer: { ist: nutzer || 0, limit },
        testphase_bis: m?.testphase_bis || null,
        konten: (konten.data || []).map((k: any) => ({
          quelle: k.quelle, rest: k.credits - k.verbraucht, gueltig_bis: k.gueltig_bis,
        })),
        abo: istChef && abo ? {
          tarif: abo.tarif, tarif_name: (tarif as any)?.data?.name || null,
          intervall: abo.intervall, status: abo.status,
          zusatznutzer: abo.zusatznutzer, gruenderpreis: abo.gruenderpreis,
          periode_bis: abo.periode_bis,
          mindestlaufzeit_bis: abo.mindestlaufzeit_bis,
          cancel_at: abo.cancel_at, gekuendigt_am: abo.gekuendigt_am,
          zahlung_fehler_seit: abo.zahlung_fehler_seit,
          hat_zahlungsmittel: !!abo.stripe_customer_id,
          // Läuft ein Stripe-Abo? Dann wechselt die Tarifwahl den Tarif,
          // statt eine zweite Kasse zu öffnen.
          laeuft: !!abo.stripe_subscription_id
            && ["aktiv", "gekuendigt", "zahlung_offen"].includes(String(abo.status)),
        } : null,
      });
    }

    if (!istChef) return antwort({ ok: false, fehler: "Nur die Chef-Rolle." }, 403);
    if (!abo) return antwort({ ok: false, fehler: "Kein Abo." }, 404);

    const zurueck = portalAdresse();

    // --- Kundenportal ------------------------------------------------------
    if (aktion === "portal") {
      if (!abo.stripe_customer_id) return antwort({ ok: false, fehler: "Noch kein Zahlungsmittel." }, 400);
      // Die Portal-Konfiguration erlaubt NUR Zahlungsmittel, Rechnungs-
      // adresse, USt-IdNr. und Rechnungen — Kündigung und Tarifwechsel sind
      // dort abgeschaltet, sonst liesse sich die Mindestlaufzeit umgehen.
      // Ihre Kennung steht im Katalog (plattform_werte), weil sie je
      // Stripe-Konto verschieden ist.
      const { data: konf } = await db.from("plattform_werte").select("wert")
        .eq("schluessel", "stripe_portal_konfiguration").maybeSingle();
      const konfId = String(konf?.wert ?? "").replace(/"/g, "");
      const s = await stripe("billing_portal/sessions", {
        customer: abo.stripe_customer_id,
        return_url: zurueck + "/?abo=zurueck",
        ...(konfId.startsWith("bpc_") ? { configuration: konfId } : {}),
      });
      return antwort({ ok: true, url: s.url });
    }

    // --- Kündigung ---------------------------------------------------------
    if (aktion === "kuendigen") {
      if (!abo.stripe_subscription_id) return antwort({ ok: false, fehler: "Kein laufendes Abo." }, 400);
      // Der spätere der beiden Termine. Das ist die ganze Regel:
      // Mindestlaufzeit, wenn sie noch läuft — sonst das Periodenende.
      const periode = abo.periode_bis ? new Date(abo.periode_bis).getTime() : Date.now();
      const mindest = abo.mindestlaufzeit_bis ? new Date(abo.mindestlaufzeit_bis).getTime() : 0;
      const ende = new Date(Math.max(periode, mindest));

      // Hängt ein vorgemerkter Tarifwechsel am Abo (Subscription Schedule),
      // nimmt Stripe kein cancel_at an. Der Wechsel entfällt mit der
      // Kündigung ohnehin — also zuerst lösen.
      const laufend = await stripe("subscriptions/" + abo.stripe_subscription_id, undefined, "GET");
      if (laufend?.schedule) {
        const sid = typeof laufend.schedule === "string" ? laufend.schedule : laufend.schedule.id;
        await stripe("subscription_schedules/" + sid + "/release", {});
      }
      await stripe("subscriptions/" + abo.stripe_subscription_id, {
        cancel_at: String(Math.floor(ende.getTime() / 1000)),
      });
      // Der Webhook schreibt den Stand gleich noch einmal; hier wird er nur
      // vorweggenommen, damit die Oberfläche das Datum sofort zeigen kann.
      await db.from("mandant_abo").update({
        status: "gekuendigt", gekuendigt_am: new Date().toISOString(),
        cancel_at: ende.toISOString(), geaendert_am: new Date().toISOString(),
      }).eq("mandant_id", mandant);

      return antwort({
        ok: true, endet_am: ende.toISOString(),
        grund: mindest > periode
          ? "Ende der Mindestlaufzeit" : "Ende der laufenden Abrechnungsperiode",
      });
    }

    // --- Kündigung zurücknehmen -------------------------------------------
    if (aktion === "widerrufen") {
      if (!abo.stripe_subscription_id) return antwort({ ok: false, fehler: "Kein laufendes Abo." }, 400);
      await stripe("subscriptions/" + abo.stripe_subscription_id, {
        cancel_at: "", cancel_at_period_end: "false",
      });
      await db.from("mandant_abo").update({
        status: "aktiv", gekuendigt_am: null, cancel_at: null,
        geaendert_am: new Date().toISOString(),
      }).eq("mandant_id", mandant);
      return antwort({ ok: true });
    }

    // --- Zusatznutzer -------------------------------------------------------
    if (aktion === "zusatznutzer") {
      if (!abo.stripe_subscription_id) return antwort({ ok: false, fehler: "Kein laufendes Abo." }, 400);
      const anzahl = Math.max(0, Math.min(500, Number(body.anzahl ?? 0)));

      const { data: addon } = await db.from("plattform_tarife")
        .select("*").eq("ist_zusatznutzer", true).eq("aktiv", true).maybeSingle();
      const preisId = abo.intervall === "jahr" ? addon?.stripe_price_jahr_id : addon?.stripe_price_monat_id;
      if (!preisId) return antwort({ ok: false, fehler: "Zusatznutzer bei Stripe nicht angelegt." }, 409);

      // Weniger Zusatznutzer, als Menschen im Haus sind, geht nicht — sonst
      // stünde jemand morgen vor einer Anwendung, die ihn nicht mehr kennt.
      const { count: ist } = await db.from("profiles")
        .select("id", { count: "exact", head: true }).eq("mandant_id", mandant);
      const { data: tarif } = await db.from("plattform_tarife")
        .select("inkl_nutzer").eq("schluessel", abo.tarif).maybeSingle();
      const neuesLimit = Number(tarif?.inkl_nutzer ?? 0) + anzahl;
      if (neuesLimit < (ist || 0)) {
        return antwort({ ok: false, fehler:
          `Im Haus arbeiten ${ist} Personen; ${neuesLimit} Plätze wären zu wenig. `
          + `Bitte zuerst Zugänge entfernen.` }, 409);
      }

      const vorhanden = await stripe("subscriptions/" + abo.stripe_subscription_id, undefined, "GET");
      const position = (vorhanden.items?.data || []).find((p: any) => p?.price?.id === preisId);

      if (position && anzahl === 0) {
        await stripe("subscription_items/" + position.id, { proration_behavior: "create_prorations" }, "DELETE");
      } else if (position) {
        await stripe("subscription_items/" + position.id, {
          quantity: String(anzahl), proration_behavior: "create_prorations",
        });
      } else if (anzahl > 0) {
        await stripe("subscription_items", {
          subscription: abo.stripe_subscription_id, price: preisId,
          quantity: String(anzahl), proration_behavior: "create_prorations",
        });
      }
      // Den Stand schreibt der Webhook; hier nur die Antwort.
      return antwort({ ok: true, zusatznutzer: anzahl, nutzer_limit: neuesLimit });
    }

    // --- Tarif wechseln ----------------------------------------------------
    // Höher: sofort, anteilig abgerechnet (always_invoice — der Kunde zahlt
    // die Differenz gleich und hat den grösseren Tarif sofort). Niedriger:
    // erst zum Ende der laufenden Periode, sonst bekäme er Geld für eine
    // Leistung zurück, die er schon genutzt hat. Die Mindestlaufzeit bleibt,
    // wie sie ist — sie entstand mit der ersten Periode, nicht mit jedem
    // Wechsel.
    if (aktion === "tarif_wechseln") {
      if (!abo.stripe_subscription_id) return antwort({ ok: false, fehler: "Kein laufendes Abo." }, 400);
      if (abo.cancel_at) {
        return antwort({ ok: false, fehler:
          "Das Abo ist gekündigt. Bitte zuerst die Kündigung zurücknehmen." }, 409);
      }
      const { data: alle } = await db.from("plattform_tarife").select("*");
      const tarife = alle || [];
      const ziel = tarife.find((t: any) => t.schluessel === String(body.tarif || "")
        && t.aktiv && !t.ist_zusatznutzer);
      if (!ziel) return antwort({ ok: false, fehler: "Unbekannter Tarif." }, 400);
      const altIntervall = abo.intervall === "jahr" ? "jahr" : "monat";
      const neuIntervall = body.intervall === "jahr" ? "jahr" : body.intervall === "monat" ? "monat" : altIntervall;
      if (ziel.schluessel === abo.tarif && neuIntervall === altIntervall) {
        return antwort({ ok: false, fehler: "Das ist bereits Ihr Tarif." }, 400);
      }
      const neuPreis = neuIntervall === "jahr" ? ziel.stripe_price_jahr_id : ziel.stripe_price_monat_id;
      const addon = tarife.find((t: any) => t.ist_zusatznutzer && t.aktiv);
      const addonNeu = neuIntervall === "jahr" ? addon?.stripe_price_jahr_id : addon?.stripe_price_monat_id;
      if (!neuPreis || (abo.zusatznutzer > 0 && !addonNeu)) {
        return antwort({ ok: false, fehler: "Der Tarif ist bei Stripe noch nicht angelegt." }, 409);
      }

      // Reicht der neue Tarif für alle, die schon im Haus arbeiten?
      const { count: ist } = await db.from("profiles")
        .select("id", { count: "exact", head: true }).eq("mandant_id", mandant);
      const limitNeu = Number(ziel.inkl_nutzer ?? 0) + Number(abo.zusatznutzer ?? 0);
      if (limitNeu < (ist || 0)) {
        return antwort({ ok: false, fehler:
          `Im Haus arbeiten ${ist} Personen; ${ziel.name} hat mit den zugebuchten `
          + `Plätzen ${limitNeu}. Bitte zuerst Plätze dazubuchen oder Zugänge entfernen.` }, 409);
      }

      // Monatswert vergleichen, damit auch ein Wechsel des Takts richtig
      // eingeordnet wird.
      const monatswert = (t: any, iv: string) =>
        iv === "jahr" ? Number(t?.preis_jahr_cent ?? 0) / 12 : Number(t?.preis_monat_cent ?? 0);
      const alt = tarife.find((t: any) => t.schluessel === abo.tarif);
      const hoeher = monatswert(ziel, neuIntervall) >= monatswert(alt, altIntervall);

      const laufend = await stripe("subscriptions/" + abo.stripe_subscription_id, undefined, "GET");
      const tarifPreise = new Set(tarife.filter((t: any) => !t.ist_zusatznutzer)
        .flatMap((t: any) => [t.stripe_price_monat_id, t.stripe_price_jahr_id]).filter(Boolean));
      const addonPreise = new Set([addon?.stripe_price_monat_id, addon?.stripe_price_jahr_id].filter(Boolean));
      const positionen = laufend.items?.data || [];
      const tarifPos = positionen.find((p: any) => tarifPreise.has(p?.price?.id));
      const addonPos = positionen.find((p: any) => addonPreise.has(p?.price?.id));
      if (!tarifPos) return antwort({ ok: false, fehler: "Der Tarif im Abo ist nicht zuzuordnen." }, 409);

      if (hoeher) {
        if (laufend.schedule) {
          // Ein vorgemerkter Wechsel nach unten wird vom Wechsel nach oben
          // überholt.
          const sid = typeof laufend.schedule === "string" ? laufend.schedule : laufend.schedule.id;
          await stripe("subscription_schedules/" + sid + "/release", {});
        }
        const felder: Record<string, string> = {
          "items[0][id]": tarifPos.id,
          "items[0][price]": neuPreis,
          proration_behavior: "always_invoice",
          "metadata[mandant_id]": mandant,
        };
        if (addonPos && addonNeu && addonPos.price.id !== addonNeu) {
          felder["items[1][id]"] = addonPos.id;
          felder["items[1][price]"] = addonNeu;
        }
        // Der Gründerpreis gilt nur im Gründertarif und entfällt beim
        // Wechsel endgültig (Auftrag). Ein leerer Wert leert die Liste.
        if (abo.gruenderpreis) felder.discounts = "";
        await stripe("subscriptions/" + abo.stripe_subscription_id, felder);
        return antwort({ ok: true, wirksam: "sofort", tarif: ziel.schluessel, intervall: neuIntervall });
      }

      // Nach unten: zum Periodenende über einen Zeitplan. Phase 0 ist das,
      // was gerade läuft; Phase 1 der neue Tarif; danach gibt der Zeitplan
      // das Abo wieder frei, und es läuft normal weiter.
      let plan: any;
      if (laufend.schedule) {
        const sid = typeof laufend.schedule === "string" ? laufend.schedule : laufend.schedule.id;
        plan = await stripe("subscription_schedules/" + sid, undefined, "GET");
      } else {
        plan = await stripe("subscription_schedules", { from_subscription: abo.stripe_subscription_id });
      }
      const jetzt = plan.current_phase || plan.phases?.[0];
      const ph0 = (plan.phases || []).find((p: any) =>
        p.start_date === jetzt?.start_date) || plan.phases?.[0];
      if (!ph0) return antwort({ ok: false, fehler: "Laufende Phase nicht gefunden." }, 409);

      const f: Record<string, string> = {
        end_behavior: "release",
        "phases[0][start_date]": String(ph0.start_date),
        "phases[0][end_date]": String(ph0.end_date),
        "phases[0][proration_behavior]": "none",
        "phases[1][proration_behavior]": "none",
        "phases[1][duration][interval]": neuIntervall === "jahr" ? "year" : "month",
        "phases[1][duration][interval_count]": "1",
        "phases[1][metadata][mandant_id]": mandant,
      };
      (ph0.items || []).forEach((it: any, i: number) => {
        f[`phases[0][items][${i}][price]`] = typeof it.price === "string" ? it.price : it.price?.id;
        f[`phases[0][items][${i}][quantity]`] = String(it.quantity ?? 1);
      });
      (ph0.discounts || []).forEach((d: any, i: number) => {
        const c = typeof d.coupon === "string" ? d.coupon : d.coupon?.id;
        if (c) f[`phases[0][discounts][${i}][coupon]`] = c;
      });
      f["phases[1][items][0][price]"] = neuPreis;
      f["phases[1][items][0][quantity]"] = "1";
      if (Number(abo.zusatznutzer ?? 0) > 0 && addonNeu) {
        f["phases[1][items][1][price]"] = addonNeu;
        f["phases[1][items][1][quantity]"] = String(abo.zusatznutzer);
      }
      await stripe("subscription_schedules/" + plan.id, f);
      const ab = new Date(Number(ph0.end_date) * 1000).toISOString();
      return antwort({ ok: true, wirksam: "periodenende", wirksam_ab: ab,
        tarif: ziel.schluessel, intervall: neuIntervall });
    }

    return antwort({ ok: false, fehler: "Unbekannte Aktion." }, 400);
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("abo-verwalten:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
