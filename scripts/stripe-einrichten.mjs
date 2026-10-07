// ============================================================================
// Legt bei Stripe an, was der Katalog beschreibt — und schreibt die
// Kennungen zurück in die Datenbank.
// ----------------------------------------------------------------------------
// Aufruf:
//     STRIPE_SECRET_KEY=sk_test_… \
//     SUPABASE_URL=https://…supabase.co \
//     SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/stripe-einrichten.mjs [--trocken]
//
// TEST ODER LIVE. Mit `sk_live_…` legt das Skript den echten Katalog an —
// dafür muss zusätzlich `--live` angegeben sein, damit es nicht aus
// Versehen passiert.
//
// IDEMPOTENT. Das Skript darf beliebig oft laufen:
//   * Produkte werden über `metadata.immo_schluessel` wiedergefunden, nicht
//     über den Namen — einen Namen ändert man, eine Kennung nicht.
//   * Preise sind bei Stripe unveränderlich. Stimmt der Betrag nicht mehr,
//     wird ein NEUER Preis angelegt und der alte stillgelegt. Bestehende
//     Abos laufen auf ihrem alten Preis weiter; das ist bei Stripe so
//     gewollt und auch rechtlich das Richtige — ein laufender Vertrag wird
//     nicht im Vorbeigehen teurer.
//   * Der Gründer-Coupon wird nur angelegt, wenn es ihn noch nicht gibt.
//     `max_redemptions` lässt sich nachträglich ohnehin nicht ändern.
//
// Was das Skript NICHT tut: Preise erfinden. Alles kommt aus
// `plattform_tarife` und `plattform_credit_pakete`. Wer etwas ändern will,
// ändert es dort (oder im Plattform-Admin) und lässt das Skript laufen.
// ============================================================================

const TROCKEN = process.argv.includes("--trocken");

const SCHLUESSEL = process.env.STRIPE_SECRET_KEY || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const DIENST = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function abbruch(text) {
  console.error("\nABBRUCH: " + text);
  process.exit(1);
}

if (!SCHLUESSEL) abbruch("STRIPE_SECRET_KEY fehlt.");
const LIVE = SCHLUESSEL.startsWith("sk_live_");
if (!LIVE && !SCHLUESSEL.startsWith("sk_test_")) abbruch("STRIPE_SECRET_KEY muss mit sk_test_ oder sk_live_ beginnen.");
if (LIVE && !process.argv.includes("--live")) {
  abbruch("Live-Schlüssel erkannt. Zur Bestätigung mit --live aufrufen.");
}
if (!SUPABASE_URL || !DIENST) abbruch("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen.");

// --- Stripe ------------------------------------------------------------------
// Dieselbe feste API-Fassung wie in den Edge Functions und am Webhook-Endpunkt.
const STRIPE_VERSION = "2025-12-15.clover";
// Steuerkategorie für Stripe Tax: „Software as a service (SaaS) – business use".
const STEUERKATEGORIE = "txcd_10103001";
// Diese Ereignisse braucht der Webhook (docs/BILLING.md, Abschnitt 4).
const EREIGNISSE = [
  "checkout.session.completed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.finalized", "invoice.paid", "invoice.payment_failed",
  "invoice.voided", "invoice.marked_uncollectible",
  "credit_note.created",
];

async function stripe(pfad, felder, methode = "POST") {
  const r = await fetch("https://api.stripe.com/v1/" + pfad, {
    method: methode,
    headers: {
      Authorization: "Bearer " + SCHLUESSEL,
      "Stripe-Version": STRIPE_VERSION,
      ...(felder ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: felder ? new URLSearchParams(felder).toString() : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${pfad}: ${d?.error?.message || r.status}`);
  return d;
}

// --- Supabase ----------------------------------------------------------------
async function db(tabelle, suche = "", methode = "GET", koerper = null) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabelle}${suche}`, {
    method: methode,
    headers: {
      apikey: DIENST, Authorization: "Bearer " + DIENST,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: koerper ? JSON.stringify(koerper) : undefined,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${tabelle}: ${d?.message || r.status}`);
  return d;
}

/** Produkt über die eigene Kennung finden — der Name darf sich ändern. */
async function produkt(schluessel, name) {
  const suche = await stripe(
    `products/search?query=${encodeURIComponent(`metadata['immo_schluessel']:'${schluessel}'`)}`,
    undefined, "GET");
  if (suche.data?.length) {
    const p = suche.data[0];
    if ((p.name !== name || p.tax_code !== STEUERKATEGORIE) && !TROCKEN) {
      await stripe("products/" + p.id, { name, tax_code: STEUERKATEGORIE });
      console.log(`  Produkt nachgezogen: ${schluessel} → "${name}"`);
    }
    return p;
  }
  if (TROCKEN) { console.log(`  [trocken] Produkt anlegen: ${schluessel}`); return { id: "prod_trocken" }; }
  const neu = await stripe("products", {
    name, "metadata[immo_schluessel]": schluessel, tax_code: STEUERKATEGORIE,
  });
  console.log(`  Produkt angelegt: ${schluessel}`);
  return neu;
}

/**
 * Preis sicherstellen. Bei Stripe ist ein Preis unveränderlich — stimmt der
 * Betrag nicht mehr, entsteht ein neuer und der alte wird stillgelegt.
 */
async function preis(produktId, cent, intervall, schluessel) {
  const liste = await stripe(
    `prices?product=${produktId}&active=true&limit=100`, undefined, "GET");
  const passend = (liste.data || []).find((p) =>
    p.unit_amount === cent
    && p.currency === "eur"
    && p.tax_behavior === "exclusive"
    && (intervall ? p.recurring?.interval === intervall : !p.recurring));
  if (passend) return passend;

  if (TROCKEN) {
    console.log(`  [trocken] Preis anlegen: ${schluessel} ${(cent / 100).toFixed(2)} €`
      + (intervall ? ` / ${intervall}` : " einmalig"));
    return { id: "price_trocken" };
  }

  // Alte Preise desselben Takts stilllegen — sonst sammeln sich mit jeder
  // Preisänderung Karteileichen, und niemand weiss mehr, welcher gilt.
  for (const alt of liste.data || []) {
    const selberTakt = intervall ? alt.recurring?.interval === intervall : !alt.recurring;
    if (selberTakt) {
      await stripe("prices/" + alt.id, { active: "false" });
      console.log(`  Alten Preis stillgelegt: ${alt.id} (${(alt.unit_amount / 100).toFixed(2)} €)`);
    }
  }

  const neu = await stripe("prices", {
    product: produktId,
    currency: "eur",
    unit_amount: String(cent),
    // NETTO. CLAUDE.md: „Preise sind Nettopreise zzgl. USt."
    tax_behavior: "exclusive",
    ...(intervall ? { "recurring[interval]": intervall } : {}),
    "metadata[immo_schluessel]": schluessel,
    // Der lookup_key wandert mit: der neue Preis übernimmt ihn vom alten.
    lookup_key: "immo:" + schluessel,
    transfer_lookup_key: "true",
  });
  console.log(`  Preis angelegt: ${schluessel} ${(cent / 100).toFixed(2)} €`
    + (intervall ? ` / ${intervall}` : " einmalig"));
  return neu;
}

async function main() {
  console.log(`Stripe-Einrichtung (${LIVE ? "LIVE" : "Testmodus"})\n` + "=".repeat(40));
  if (TROCKEN) console.log("TROCKENLAUF — es wird nichts angelegt.\n");

  // --- Tarife ----------------------------------------------------------------
  const tarife = await db("plattform_tarife", "?aktiv=eq.true&order=sortierung");
  for (const t of tarife) {
    console.log(`\n${t.name} (${t.schluessel})`);
    const p = await produkt("tarif:" + t.schluessel, "immoOffice.ai — " + t.name);
    const monat = await preis(p.id, t.preis_monat_cent, "month", t.schluessel + ":monat");
    const jahr = await preis(p.id, t.preis_jahr_cent, "year", t.schluessel + ":jahr");
    if (!TROCKEN) {
      await db("plattform_tarife", `?schluessel=eq.${t.schluessel}`, "PATCH", {
        stripe_product_id: p.id,
        stripe_price_monat_id: monat.id,
        stripe_price_jahr_id: jahr.id,
        geaendert_am: new Date().toISOString(),
      });
    }
  }

  // --- Credit-Pakete ---------------------------------------------------------
  const pakete = await db("plattform_credit_pakete", "?aktiv=eq.true&order=sortierung");
  for (const k of pakete) {
    console.log(`\n${k.name} (${k.schluessel})`);
    const p = await produkt("paket:" + k.schluessel, "immoOffice.ai — " + k.name);
    const einmal = await preis(p.id, k.preis_cent, null, k.schluessel);
    if (!TROCKEN) {
      await db("plattform_credit_pakete", `?schluessel=eq.${k.schluessel}`, "PATCH", {
        stripe_price_id: einmal.id, geaendert_am: new Date().toISOString(),
      });
    }
  }

  // --- Gründer-Coupon --------------------------------------------------------
  const werte = await db("plattform_werte", "?select=schluessel,wert");
  const w = Object.fromEntries(werte.map((z) => [z.schluessel, z.wert]));
  const plaetze = Number(w.gruender_plaetze ?? 50);
  const rabatt = Number(w.gruender_rabatt_cent ?? 1000);
  const gruenderTarif = String(w.gruender_tarif ?? "starter").replace(/"/g, "");
  const name = "GRUENDER";

  console.log(`\nGründerpreis`);
  let coupon = null;
  try {
    coupon = await stripe("coupons/" + name, undefined, "GET");
    console.log(`  Coupon besteht: ${coupon.id}, `
      + `${coupon.times_redeemed}/${coupon.max_redemptions ?? "∞"} eingelöst`);
  } catch {
    if (TROCKEN) {
      console.log(`  [trocken] Coupon anlegen: ${(rabatt / 100).toFixed(2)} € dauerhaft, `
        + `${plaetze}×, nur ${gruenderTarif}`);
    } else {
      // Frisch lesen: beim ersten Lauf stand die Produktkennung oben noch
      // nicht in der Datenbank — ohne sie gälte der Coupon für ALLES.
      const [tarif] = await db("plattform_tarife", `?schluessel=eq.${gruenderTarif}`);
      if (!tarif?.stripe_product_id) abbruch("Gründertarif ohne Stripe-Produkt — Coupon nicht angelegt.");
      coupon = await stripe("coupons", {
        id: name,
        amount_off: String(rabatt),
        currency: "eur",
        duration: "forever",
        max_redemptions: String(plaetze),
        name: `Gründerpreis (erste ${plaetze})`,
        // Nur auf diesen einen Tarif. Ohne das gälte er auch für
        // Zusatznutzer und Credit-Pakete.
        ...(tarif?.stripe_product_id ? { "applies_to[products][0]": tarif.stripe_product_id } : {}),
      });
      console.log(`  Coupon angelegt: ${(rabatt / 100).toFixed(2)} € dauerhaft, `
        + `${plaetze}×, nur ${gruenderTarif}`);
    }
  }

  // --- Kundenportal ----------------------------------------------------------
  // Nur Zahlungsmittel, Rechnungsdaten und Rechnungen. Kündigung und
  // Tarifwechsel sind AUS — beides läuft über abo-verwalten, weil Stripe die
  // Mindestlaufzeit nicht kennt.
  console.log(`\nKundenportal`);
  const portalFelder = {
    "business_profile[headline]": "immoOffice.ai — Zahlungsmittel und Rechnungen",
    "features[payment_method_update][enabled]": "true",
    "features[invoice_history][enabled]": "true",
    "features[customer_update][enabled]": "true",
    "features[customer_update][allowed_updates][0]": "name",
    "features[customer_update][allowed_updates][1]": "email",
    "features[customer_update][allowed_updates][2]": "address",
    "features[customer_update][allowed_updates][3]": "tax_id",
    "features[subscription_cancel][enabled]": "false",
    "features[subscription_update][enabled]": "false",
    "metadata[immo_schluessel]": "portal",
  };
  const vorhandenePortale = await stripe("billing_portal/configurations?active=true&limit=100", undefined, "GET");
  let portal = (vorhandenePortale.data || []).find((k) => k.metadata?.immo_schluessel === "portal");
  if (TROCKEN) {
    console.log(`  [trocken] Portal-Konfiguration ${portal ? "nachziehen" : "anlegen"}`);
  } else {
    portal = portal
      ? await stripe("billing_portal/configurations/" + portal.id, portalFelder)
      : await stripe("billing_portal/configurations", portalFelder);
    await db("plattform_werte", "?schluessel=eq.stripe_portal_konfiguration", "PATCH",
      { wert: portal.id, geaendert_am: new Date().toISOString() });
    console.log(`  Portal-Konfiguration: ${portal.id} (ohne Kündigung, ohne Tarifwechsel)`);
  }

  console.log("\n" + "=".repeat(40));
  console.log("Fertig. Noch zu setzen (Supabase → Edge Functions → Secrets):");
  console.log("  STRIPE_SECRET_KEY        " + (LIVE ? "sk_live_…" : "sk_test_…"));
  console.log("  STRIPE_WEBHOOK_SECRET    whsec_… (aus dem Webhook-Endpunkt)");
  console.log("  STRIPE_COUPON_GRUENDER   " + name);
  console.log("\nWebhook-Endpunkt bei Stripe anlegen auf:");
  console.log("  " + SUPABASE_URL + "/functions/v1/stripe-webhook");
  console.log("  API-Fassung: " + STRIPE_VERSION);
  console.log("  Ereignisse:  " + EREIGNISSE.join(",\n               "));
}

main().catch((f) => abbruch(f.message));
