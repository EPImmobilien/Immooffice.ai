// ============================================================================
// Stripe-Integrationsplan: hält der Code, was docs/BILLING.md 4a zusagt?
// ----------------------------------------------------------------------------
// Ohne Stripe-Schlüssel lässt sich keine echte Kasse öffnen. Geprüft wird
// deshalb am Quelltext — und zwar genau die Stellen, an denen am 07.10.2026
// Fehler gefunden wurden. Jede Prüfung nennt den Fehler, den sie verhindert.
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const wurzel = path.join(__dirname, "..");
const lies = (p) => fs.readFileSync(path.join(wurzel, p), "utf8");

const kasse = lies("supabase/eigene/abo-checkout/index.ts");
const verwalten = lies("supabase/eigene/abo-verwalten/index.ts");
const webhook = lies("supabase/eigene/stripe-webhook/index.ts");
const seed = lies("scripts/stripe-einrichten.mjs");

let fehler = 0, n = 0;
function pruefe(was, ok) {
  n++;
  if (!ok) { fehler++; console.log("  [FEHLER] " + was); }
}

// --- Die Kopien sind dieselben ------------------------------------------------
for (const f of ["abo-checkout", "abo-verwalten", "stripe-webhook"]) {
  pruefe(`${f}: supabase/functions ist byte-gleich mit supabase/eigene`,
    lies(`supabase/eigene/${f}/index.ts`) === lies(`supabase/functions/${f}/index.ts`));
}

// --- Feste API-Fassung, überall dieselbe -------------------------------------
const fassung = /STRIPE_VERSION = "(\d{4}-\d{2}-\d{2}\.[a-z]+)"/;
const fassungen = [kasse, verwalten, webhook, seed]
  .map((q) => (q.match(fassung) || [])[1]).filter(Boolean);
pruefe("Kasse, Verwaltung und Seed senden eine feste Stripe-Version",
  [kasse, verwalten, seed].every((q) => /"Stripe-Version": STRIPE_VERSION/.test(q)));
pruefe("Webhook, Kasse, Verwaltung und Seed nennen dieselbe Fassung",
  fassungen.length === 4 && new Set(fassungen).size === 1);

// --- Kasse ---------------------------------------------------------------------
pruefe("Kasse: Stripe Tax an", /"automatic_tax\[enabled\]": "true"/.test(kasse));
pruefe("Kasse: Stripe Tax nirgends ausgeschaltet", !/"automatic_tax\[enabled\]": "false"/.test(kasse));
pruefe("Kasse: USt-IdNr. wird abgefragt", /"tax_id_collection\[enabled\]": "true"/.test(kasse));
pruefe("Kasse: Anschrift darf an den Kunden geschrieben werden (sonst lehnt Stripe tax_id_collection ab)",
  /"customer_update\[address\]": "auto"/.test(kasse) && /"customer_update\[name\]": "auto"/.test(kasse));
pruefe("Kasse: Karte und SEPA-Lastschrift",
  /"card"/.test(kasse) && /"sepa_debit"/.test(kasse));
pruefe("Kasse: flexible Abrechnung", /billing_mode\]\[type\]": "flexible"/.test(kasse));
pruefe("Kasse: Paketrechnung mit gültigem Parameter invoice_creation[enabled] (Fehler vom 07.10.)",
  /"invoice_creation\[enabled\]": "true"/.test(kasse) && !/invoice_creation: "true"/.test(kasse));
pruefe("Kasse: zweite Kasse bei laufendem Abo wird abgewiesen",
  /Es läuft bereits ein Abo/.test(kasse));
pruefe("Kasse: Aktionscode nur ohne festen Rabatt (Stripe lehnt beides zugleich ab)",
  /if \(!felder\["discounts\[0\]\[coupon\]"\]\) felder\.allow_promotion_codes/.test(kasse));

// --- Webhook -------------------------------------------------------------------
const paid = webhook.slice(webhook.indexOf('case "invoice.paid"'),
  webhook.indexOf('case "invoice.finalized"'));
pruefe("Webhook: Tarif-Credits nur bei Periodenbeginn (Paketkauf brachte ein Monatskontingent mit)",
  /subscription_create/.test(paid) && /subscription_cycle/.test(paid) && /periodeBeginnt &&/.test(paid));
pruefe("Webhook: Paket-Rechnung fasst den Abo-Status nicht an",
  paid.indexOf("if (!ausAbo(obj)) break;") > -1
  && paid.indexOf("if (!ausAbo(obj)) break;") < paid.indexOf('status: "aktiv"'));
pruefe("Webhook: Paketkauf überschreibt die Abo-Kennung nicht mit null",
  /obj\.mode === "subscription" && typeof obj\.subscription === "string"/.test(webhook)
  && !/stripe_subscription_id: typeof obj\.subscription === "string" \? obj\.subscription : null/.test(webhook));
pruefe("Webhook: Zeilenpreis in neuer Form (pricing.price_details.price)",
  /pricing\?\.price_details\?\.price/.test(webhook));
pruefe("Webhook: Abo-Periode auch an den Positionen",
  /items\?\.data\?\.\[0\]/.test(webhook) && /current_period_start/.test(webhook));
pruefe("Webhook: Rechnungen werden gespiegelt, je Mandant",
  /from\("stripe_rechnungen"\)\.upsert/.test(webhook) && /onConflict: "mandant_id,id"/.test(webhook));
for (const e of ["invoice.finalized", "invoice.voided", "invoice.marked_uncollectible", "credit_note.created"]) {
  pruefe(`Webhook verarbeitet ${e}`, webhook.includes(`case "${e}"`));
  pruefe(`Seed nennt ${e} für den Endpunkt`, seed.includes(`"${e}"`));
}

// --- Verwaltung ------------------------------------------------------------------
pruefe("Verwaltung: Tarifwechsel vorhanden", /aktion === "tarif_wechseln"/.test(verwalten));
pruefe("Verwaltung: höher sofort mit always_invoice",
  /proration_behavior: "always_invoice"/.test(verwalten));
pruefe("Verwaltung: niedriger über Subscription Schedule",
  /subscription_schedules/.test(verwalten) && /end_behavior: "release"/.test(verwalten));
pruefe("Verwaltung: Kündigung löst einen vorgemerkten Wechsel",
  verwalten.indexOf("/release") > -1
  && verwalten.indexOf("/release") < verwalten.indexOf("cancel_at: String(Math.floor"));
pruefe("Verwaltung: Kundenportal mit eigener Konfiguration",
  /stripe_portal_konfiguration/.test(verwalten) && /configuration: konfId/.test(verwalten));

// --- Modus: Test oder Live, nie gemischt (Live-Gang 07.10.2026) -------------------
for (const [name, q] of [["Kasse", kasse], ["Verwaltung", verwalten], ["Webhook", webhook], ["Seed", seed]]) {
  pruefe(`${name}: nimmt sk_test_ und sk_live_, sonst nichts`,
    /startsWith\("sk_test_"\)/.test(q) && /startsWith\("sk_live_"\)/.test(q));
}
pruefe("Webhook: Ereignis muss zum Modus des Schlüssels passen",
  /Boolean\(ereignis\?\.livemode\) !== liveSystem/.test(webhook));
pruefe("Seed: Live-Katalog nur mit ausdrücklichem --live",
  /LIVE && !process\.argv\.includes\("--live"\)/.test(seed));

// --- Seed -------------------------------------------------------------------------
pruefe("Seed: Portal ohne Kündigung und ohne Tarifwechsel",
  /subscription_cancel\]\[enabled\]": "false"/.test(seed)
  && /subscription_update\]\[enabled\]": "false"/.test(seed));
pruefe("Seed: Steuerkategorie an jedem Produkt", /tax_code: STEUERKATEGORIE/.test(seed));
pruefe("Seed: Gründer-Coupon liest die Produktkennung frisch (sonst ohne Tarifbeschränkung)",
  /const \[tarif\] = await db\("plattform_tarife"/.test(seed));

if (fehler) {
  console.log(`  ${fehler} von ${n} Prüfungen zum Stripe-Plan nicht bestanden.`);
  process.exit(1);
}
console.log(`  [ok] ${n} Prüfungen zum Stripe-Integrationsplan: feste API-Fassung,`);
console.log("       Steuer, SEPA, Paketrechnung, Tarifwechsel, Portal — und die");
console.log("       drei Fehler vom 07.10.2026 bleiben behoben.");
