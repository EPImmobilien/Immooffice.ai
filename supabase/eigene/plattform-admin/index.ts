// ============================================================================
// plattform-admin — der Betreiberblick: Katalog, Mandanten, Zahlen
// ============================================================================
// Eigene Funktion des Forks (fork_52).
//
// WAS HIER NICHT HERAUSGEHT, und das ist die wichtigste Zeile dieser Datei:
// fachliche Daten der Mandanten. Keine Immobilie, kein Kontakt, keine Mail,
// keine Datei. CLAUDE.md: „Plattform-Administratoren erhalten keinen
// automatischen Zugriff auf Mandantendaten; Supportzugriff nur protokolliert
// und nach dem Prinzip der geringsten Rechte."
//
// Was herausgeht, ist die Vertragsbeziehung: Name des Hauses, Tarif, Status,
// Fristen, Nutzerzahl, Credit-Saldo, Verbrauch. Das sind die Daten, mit denen
// der Betreiber seine eigenen Rechnungen schreibt — ohne sie liesse sich
// kein Abonnement führen. Die Grenze verläuft also nicht bei „Daten über
// einen Mandanten", sondern bei „Daten AUS einem Mandanten".
//
// Jede schreibende Aktion steht im Protokoll (`plattform_protokoll`), mit
// Person, Zeit, Gegenstand und Begründung. Eine Gutschrift ohne Grund wird
// abgewiesen — nicht aus Förmlichkeit: wer in einem halben Jahr fragt, warum
// ein Haus 2000 Credits geschenkt bekam, soll eine Antwort finden.
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

/** Monatsäquivalent eines Preises — ein Jahrespreis zählt mit einem Zwölftel. */
function jeMonat(cent: number, intervall: string) {
  return intervall === "jahr" ? Math.round(Number(cent || 0) / 12) : Number(cent || 0);
}

// Welche Spalten eine Katalogtabelle ändern lässt. Eine Liste und keine
// Durchreiche: sonst liesse sich über dieselbe Aktion `stripe_price_id`
// setzen, und damit zeigte ein Tarif auf ein fremdes Produkt.
const AENDERBAR: Record<string, string[]> = {
  plattform_tarife: ["name", "sortierung", "aktiv", "empfohlen", "preis_monat_cent",
    "preis_jahr_cent", "inkl_nutzer", "credits_monat", "merkmale", "hinweis"],
  plattform_credit_preise: ["name", "credits", "beschreibung", "sortierung", "aktiv"],
  plattform_credit_pakete: ["name", "credits", "preis_cent", "gueltig_monate",
    "sortierung", "aktiv"],
  plattform_werte: ["wert", "beschreibung"],
};
const SCHLUESSELSPALTE: Record<string, string> = {
  plattform_tarife: "schluessel",
  plattform_credit_preise: "aktion",
  plattform_credit_pakete: "schluessel",
  plattform_werte: "schluessel",
};

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

    const { data: admin } = await db.from("plattform_admins")
      .select("benutzer_id").eq("benutzer_id", u.user.id).maybeSingle();
    if (!admin) return antwort({ ok: false, fehler: "Kein Plattform-Administrator." }, 403);

    const body = await req.json().catch(() => ({}));
    const aktion = String(body.aktion || "uebersicht");

    const protokoll = async (was: string, gegenstand: string, einzelheiten: unknown) => {
      await db.from("plattform_protokoll").insert({
        benutzer_id: u.user.id, aktion: was, gegenstand,
        einzelheiten: einzelheiten as Record<string, unknown>,
      });
    };

    // --- Der Katalog --------------------------------------------------------
    if (aktion === "katalog") {
      const [tarife, preise, pakete, werte] = await Promise.all([
        db.from("plattform_tarife").select("*").order("sortierung"),
        db.from("plattform_credit_preise").select("*").order("sortierung"),
        db.from("plattform_credit_pakete").select("*").order("sortierung"),
        db.from("plattform_werte").select("*").order("schluessel"),
      ]);
      return antwort({
        ok: true, tarife: tarife.data || [], credit_preise: preise.data || [],
        credit_pakete: pakete.data || [], werte: werte.data || [],
      });
    }

    if (aktion === "katalog_speichern") {
      const tabelle = String(body.tabelle || "");
      const spalten = AENDERBAR[tabelle];
      if (!spalten) return antwort({ ok: false, fehler: "Unbekannte Tabelle." }, 400);
      const schluessel = String(body.schluessel || "");
      if (!schluessel) return antwort({ ok: false, fehler: "Kein Schluessel." }, 400);

      const neu: Record<string, unknown> = {};
      for (const s of spalten) {
        if (Object.prototype.hasOwnProperty.call(body.werte || {}, s)) neu[s] = body.werte[s];
      }
      if (!Object.keys(neu).length) return antwort({ ok: false, fehler: "Nichts zu aendern." }, 400);
      neu.geaendert_am = new Date().toISOString();
      // `geaendert_von` führt NUR plattform_tarife. Die übrigen drei
      // Katalogtabellen haben die Spalte nicht, und ein Update darauf
      // scheitert mit „column does not exist" — eine Zeile, die beim Lesen
      // des Codes richtig aussieht und beim ersten Klick bricht.
      if (tabelle === "plattform_tarife") neu.geaendert_von = u.user.id;

      const spalte = SCHLUESSELSPALTE[tabelle];
      const { data: vorher } = await db.from(tabelle).select("*").eq(spalte, schluessel).maybeSingle();
      const { error } = await db.from(tabelle).update(neu).eq(spalte, schluessel);
      if (error) return antwort({ ok: false, fehler: error.message }, 400);

      await protokoll("katalog_geaendert", `${tabelle}:${schluessel}`, { vorher, nachher: neu });
      // Ein geänderter Preis gilt erst bei Stripe, wenn dort ein neuer Preis
      // angelegt wurde. Das sagt die Antwort, statt es den Betreiber
      // herausfinden zu lassen.
      const stripeNoetig = tabelle === "plattform_tarife"
        ? ("preis_monat_cent" in neu || "preis_jahr_cent" in neu)
        : tabelle === "plattform_credit_pakete" ? ("preis_cent" in neu) : false;
      return antwort({ ok: true, stripe_noetig: stripeNoetig });
    }

    // --- Die Mandanten ------------------------------------------------------
    // NUR Vertragsdaten. Die Auswahl der Spalten ist die Grenze; sie steht
    // hier und nicht in einer Ansicht, die jemand erweitern koennte.
    if (aktion === "mandanten") {
      const { data: mandanten } = await db.from("mandanten")
        .select("id, name, slug, abo_status, testphase_bis, gesperrt_am, erstellt_am")
        .order("erstellt_am");
      const { data: abos } = await db.from("mandant_abo")
        .select("mandant_id, tarif, intervall, status, zusatznutzer, gruenderpreis, "
          + "periode_bis, mindestlaufzeit_bis, cancel_at, zahlung_fehler_seit, stripe_customer_id");
      const { data: tarife } = await db.from("plattform_tarife").select("*");
      const { data: profile } = await db.from("profiles").select("mandant_id");

      const nachMandant = new Map<string, Record<string, unknown>>();
      for (const a of abos || []) nachMandant.set(String(a.mandant_id), a);
      const nutzerZahl = new Map<string, number>();
      for (const p of profile || []) {
        const k = String(p.mandant_id || "");
        if (k) nutzerZahl.set(k, (nutzerZahl.get(k) || 0) + 1);
      }
      const tarifNach = new Map<string, Record<string, unknown>>();
      for (const t of tarife || []) tarifNach.set(String(t.schluessel), t);

      const zeilen = [];
      for (const m of mandanten || []) {
        const a = nachMandant.get(String(m.id)) || null;
        const t = a ? tarifNach.get(String(a.tarif)) : null;
        const addon = (tarife || []).find((x: Record<string, unknown>) => x.ist_zusatznutzer);
        const [{ data: saldo }, { data: zugriff }] = await Promise.all([
          db.rpc("credits_saldo", { p_mandant: m.id }),
          db.rpc("abo_zugriff", { p_mandant: m.id }),
        ]);
        // Monatserlös dieses Hauses, netto. Ein Abo in der Testphase zählt
        // nicht mit — es ist noch kein Umsatz.
        let mrr = 0;
        if (a && (a.status === "aktiv" || a.status === "gekuendigt") && t) {
          mrr = jeMonat(Number(t.preis_monat_cent), "monat");
          if (a.intervall === "jahr") mrr = jeMonat(Number(t.preis_jahr_cent), "jahr");
          if (Number(a.zusatznutzer || 0) > 0 && addon) {
            const p = a.intervall === "jahr"
              ? jeMonat(Number(addon.preis_jahr_cent), "jahr")
              : Number(addon.preis_monat_cent);
            mrr += p * Number(a.zusatznutzer);
          }
        }
        zeilen.push({
          id: m.id, name: m.name, slug: m.slug,
          erstellt_am: m.erstellt_am, testphase_bis: m.testphase_bis,
          gesperrt_am: m.gesperrt_am, zugriff, saldo: Number(saldo ?? 0),
          nutzer: nutzerZahl.get(String(m.id)) || 0,
          tarif: a?.tarif || null, tarif_name: t?.name || null,
          intervall: a?.intervall || null, status: a?.status || null,
          zusatznutzer: a?.zusatznutzer || 0, gruenderpreis: !!a?.gruenderpreis,
          periode_bis: a?.periode_bis || null,
          mindestlaufzeit_bis: a?.mindestlaufzeit_bis || null,
          cancel_at: a?.cancel_at || null,
          zahlung_fehler_seit: a?.zahlung_fehler_seit || null,
          zahlt: !!a?.stripe_customer_id,
          mrr_cent: mrr,
        });
      }
      return antwort({ ok: true, mandanten: zeilen });
    }

    // --- Die Zahlen ---------------------------------------------------------
    if (aktion === "uebersicht") {
      const seit = new Date(Date.now() - 30 * 86400000).toISOString();
      const [{ data: verbrauch }, { data: frei }, { data: abos }, { data: tarife }] =
        await Promise.all([
          db.from("credit_buchungen")
            .select("aktion, credits, ki_kosten_eur, status, erstellt_am")
            .gte("erstellt_am", seit).in("status", ["gebucht"]),
          db.rpc("gruender_plaetze_frei"),
          db.from("mandant_abo").select("tarif, intervall, status, zusatznutzer"),
          db.from("plattform_tarife").select("*"),
        ]);

      const tarifNach = new Map<string, Record<string, unknown>>();
      for (const t of tarife || []) tarifNach.set(String(t.schluessel), t);
      const addon = (tarife || []).find((x: Record<string, unknown>) => x.ist_zusatznutzer);

      let mrr = 0;
      const nachStatus: Record<string, number> = {};
      for (const a of abos || []) {
        nachStatus[String(a.status)] = (nachStatus[String(a.status)] || 0) + 1;
        if (a.status !== "aktiv" && a.status !== "gekuendigt") continue;
        const t = tarifNach.get(String(a.tarif));
        if (!t) continue;
        mrr += a.intervall === "jahr"
          ? jeMonat(Number(t.preis_jahr_cent), "jahr")
          : Number(t.preis_monat_cent);
        if (Number(a.zusatznutzer || 0) > 0 && addon) {
          mrr += (a.intervall === "jahr"
            ? jeMonat(Number(addon.preis_jahr_cent), "jahr")
            : Number(addon.preis_monat_cent)) * Number(a.zusatznutzer);
        }
      }

      // Verbrauch und Anbieterkosten, nach Aktion. Die Kostenspalte ist oft
      // leer (nicht jeder Anbieter nennt einen Preis) — deshalb wird sie
      // getrennt gezählt und nicht stillschweigend als Null gerechnet.
      const jeAktion = new Map<string, { credits: number; kosten: number; mit: number; ohne: number }>();
      let credits = 0, kosten = 0, ohneKosten = 0;
      for (const b of verbrauch || []) {
        const k = String(b.aktion);
        const e = jeAktion.get(k) || { credits: 0, kosten: 0, mit: 0, ohne: 0 };
        e.credits += Number(b.credits || 0);
        credits += Number(b.credits || 0);
        if (b.ki_kosten_eur === null || b.ki_kosten_eur === undefined) { e.ohne++; ohneKosten++; }
        else { e.kosten += Number(b.ki_kosten_eur); e.mit++; kosten += Number(b.ki_kosten_eur); }
        jeAktion.set(k, e);
      }

      return antwort({
        ok: true,
        mrr_cent: mrr,
        abos_nach_status: nachStatus,
        gruender_frei: Number(frei ?? 0),
        zeitraum_tage: 30,
        credits_verbraucht: credits,
        ki_kosten_eur: Math.round(kosten * 1e6) / 1e6,
        buchungen_ohne_kosten: ohneKosten,
        je_aktion: Array.from(jeAktion.entries())
          .map(([aktion, e]) => ({ aktion, ...e, kosten: Math.round(e.kosten * 1e6) / 1e6 }))
          .sort((a, b) => b.credits - a.credits),
      });
    }

    // --- Credits gutschreiben (Kulanz, Störung, Erstattung) -----------------
    if (aktion === "credits_schenken") {
      const mandant = String(body.mandant_id || "");
      const anzahl = Math.floor(Number(body.credits || 0));
      const grund = String(body.grund || "").trim();
      if (!mandant) return antwort({ ok: false, fehler: "Kein Mandant." }, 400);
      if (!(anzahl > 0) || anzahl > 100000) {
        return antwort({ ok: false, fehler: "Anzahl zwischen 1 und 100000." }, 400);
      }
      // Ohne Grund nicht. Wer in einem halben Jahr fragt, warum ein Haus
      // 2000 Credits bekam, soll eine Antwort finden.
      if (grund.length < 5) {
        return antwort({ ok: false, fehler:
          "Bitte einen Grund angeben — er steht im Protokoll." }, 400);
      }
      // Eigene Referenz je Vorgang: `credits_gutschreiben` ist darüber
      // idempotent, ein doppelter Klick schenkt also nicht zweimal.
      const referenz = "kulanz:" + mandant + ":" + (body.vorgang || crypto.randomUUID());
      const { error } = await db.rpc("credits_gutschreiben", {
        p_mandant: mandant, p_quelle: "paket", p_credits: anzahl,
        p_gueltig_bis: new Date(Date.now() + 365 * 86400000).toISOString(),
        p_referenz: referenz,
      });
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      await protokoll("credits_geschenkt", mandant, { credits: anzahl, grund, referenz });
      return antwort({ ok: true, referenz });
    }

    // --- Das Protokoll ------------------------------------------------------
    if (aktion === "protokoll") {
      const { data } = await db.from("plattform_protokoll")
        .select("*").order("erstellt_am", { ascending: false }).limit(100);
      return antwort({ ok: true, eintraege: data || [] });
    }

    return antwort({ ok: false, fehler: "Unbekannte Aktion." }, 400);
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("plattform-admin:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
