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

    // --- Ein Mandant im Einzelnen ------------------------------------------
    // Wieder NUR die Vertragsbeziehung. Dazu die Konten des Hauses (Name,
    // Adresse, Rolle) — ohne sie liesse sich ein Kunde nicht betreuen, und
    // sie sind das, was der Betreiber ohnehin in seiner eigenen
    // Rechnungsstellung führt.
    if (aktion === "mandant") {
      const id = String(body.mandant_id || "");
      if (!id) return antwort({ ok: false, fehler: "Kein Mandant." }, 400);
      const [{ data: m }, { data: abo }, { data: nutzer }, { data: konten },
             { data: buchungen }, { data: erinnerungen }, { data: sitzungen }] =
        await Promise.all([
          db.from("mandanten").select("*").eq("id", id).maybeSingle(),
          db.from("mandant_abo").select("*").eq("mandant_id", id).maybeSingle(),
          db.from("profiles").select("id, name, email, role, funktion, stufe").eq("mandant_id", id),
          db.from("credit_konten")
            .select("quelle, credits, verbraucht, gueltig_von, gueltig_bis, referenz, erstellt_am")
            .eq("mandant_id", id).order("erstellt_am", { ascending: false }).limit(50),
          db.from("credit_buchungen")
            .select("aktion, credits, quelle, status, ki_kosten_eur, erstellt_am")
            .eq("mandant_id", id).order("erstellt_am", { ascending: false }).limit(50),
          db.from("abo_erinnerungen").select("*").eq("mandant_id", id),
          db.from("support_sitzungen").select("*").eq("mandant_id", id)
            .order("begonnen_am", { ascending: false }).limit(20),
        ]);
      if (!m) return antwort({ ok: false, fehler: "Unbekannter Mandant." }, 404);
      const [{ data: saldo }, { data: zugriff }, { data: limit }] = await Promise.all([
        db.rpc("credits_saldo", { p_mandant: id }),
        db.rpc("abo_zugriff", { p_mandant: id }),
        db.rpc("nutzer_limit", { p_mandant: id }),
      ]);
      return antwort({
        ok: true, mandant: m, abo, nutzer: nutzer || [], konten: konten || [],
        buchungen: buchungen || [], erinnerungen: erinnerungen || [],
        sitzungen: sitzungen || [],
        saldo: Number(saldo ?? 0), zugriff, nutzer_limit: Number(limit ?? 0),
      });
    }

    // --- Einen Mandanten verwalten -----------------------------------------
    // Hier wird der VERTRAGSSTAND gesetzt, nicht der von Stripe. Beides kann
    // auseinandergehen, und dann gilt, was Stripe meldet: der Webhook
    // überschreibt diese Werte beim nächsten Ereignis. Deshalb steht in der
    // Antwort, ob bei Stripe ein Abo läuft — wer dort einen Vertrag hat,
    // ändert ihn dort und nicht hier.
    if (aktion === "mandant_speichern") {
      const id = String(body.mandant_id || "");
      const grund = String(body.grund || "").trim();
      if (!id) return antwort({ ok: false, fehler: "Kein Mandant." }, 400);
      if (grund.length < 5) {
        return antwort({ ok: false, fehler:
          "Bitte einen Grund angeben — er steht im Protokoll." }, 400);
      }
      const { data: vorher } = await db.from("mandanten").select("*").eq("id", id).maybeSingle();
      if (!vorher) return antwort({ ok: false, fehler: "Unbekannter Mandant." }, 404);

      const m: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim().length >= 2) {
        m.name = body.name.trim().slice(0, 120);
      }
      if (body.testphase_bis !== undefined) {
        m.testphase_bis = body.testphase_bis ? new Date(body.testphase_bis).toISOString() : null;
      }
      if (body.gesperrt !== undefined) {
        m.gesperrt_am = body.gesperrt ? new Date().toISOString() : null;
        m.gesperrt_grund = body.gesperrt ? grund.slice(0, 500) : null;
        m.abo_status = body.gesperrt ? "gesperrt"
          : (vorher.abo_status === "gesperrt" ? "aktiv" : vorher.abo_status);
      }
      if (Object.keys(m).length) {
        m.geaendert_am = new Date().toISOString();
        const { error } = await db.from("mandanten").update(m).eq("id", id);
        if (error) return antwort({ ok: false, fehler: error.message }, 400);
      }

      // Der Tarif: im Abo, nicht am Mandanten.
      const a: Record<string, unknown> = {};
      if (typeof body.tarif === "string" && body.tarif) {
        const { data: t } = await db.from("plattform_tarife")
          .select("schluessel, ist_zusatznutzer").eq("schluessel", body.tarif).maybeSingle();
        if (!t || t.ist_zusatznutzer) return antwort({ ok: false, fehler: "Unbekannter Tarif." }, 400);
        a.tarif = body.tarif;
      }
      if (typeof body.abo_status === "string"
          && ["test", "aktiv", "gekuendigt", "zahlung_offen", "abgelaufen"].includes(body.abo_status)) {
        a.status = body.abo_status;
      }
      if (body.zusatznutzer !== undefined) {
        a.zusatznutzer = Math.max(0, Math.min(500, Number(body.zusatznutzer) || 0));
      }
      if (body.mindestlaufzeit_bis !== undefined) {
        a.mindestlaufzeit_bis = body.mindestlaufzeit_bis
          ? new Date(body.mindestlaufzeit_bis).toISOString() : null;
      }
      let stripeLaeuft = false;
      if (Object.keys(a).length) {
        const { data: abo } = await db.from("mandant_abo")
          .select("stripe_subscription_id").eq("mandant_id", id).maybeSingle();
        stripeLaeuft = !!abo?.stripe_subscription_id;
        a.geaendert_am = new Date().toISOString();
        const { error } = await db.from("mandant_abo")
          .upsert({ mandant_id: id, ...a }, { onConflict: "mandant_id" });
        if (error) return antwort({ ok: false, fehler: error.message }, 400);
      }

      await protokoll("mandant_geaendert", id, { vorher, mandant: m, abo: a, grund });
      return antwort({ ok: true, stripe_laeuft: stripeLaeuft });
    }

    // --- Einen Mandanten loeschen ------------------------------------------
    // Das Schwerste, was dieser Bereich kann: alles geht mit — Objekte,
    // Kontakte, Mails, Dateien, Ledger. Deshalb drei Sperren: ein Grund, der
    // ausgeschriebene Name des Hauses als Bestaetigung, und ein Protokoll,
    // das bleibt. Rueckgaengig gibt es nicht.
    if (aktion === "mandant_loeschen") {
      const id = String(body.mandant_id || "");
      const grund = String(body.grund || "").trim();
      const bestaetigung = String(body.bestaetigung || "").trim();
      const { data: m } = await db.from("mandanten").select("*").eq("id", id).maybeSingle();
      if (!m) return antwort({ ok: false, fehler: "Unbekannter Mandant." }, 404);
      if (grund.length < 5) {
        return antwort({ ok: false, fehler: "Bitte einen Grund angeben." }, 400);
      }
      if (bestaetigung !== m.name) {
        return antwort({ ok: false, fehler:
          `Zur Bestätigung bitte den Namen des Hauses eingeben: „${m.name}".` }, 400);
      }
      const { count: nutzer } = await db.from("profiles")
        .select("id", { count: "exact", head: true }).eq("mandant_id", id);
      // Erst ins Protokoll, dann loeschen: nachher ist die Kennung weg, und
      // ein Protokolleintrag, der das Loeschen nicht ueberlebt, ist keiner.
      await protokoll("mandant_geloescht", id,
        { name: m.name, slug: m.slug, nutzer: nutzer || 0, grund });
      const { error } = await db.from("mandanten").delete().eq("id", id);
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      return antwort({ ok: true, name: m.name });
    }

    // --- Konten ueber alle Mandanten ---------------------------------------
    if (aktion === "nutzer") {
      const { data } = await db.from("profiles")
        .select("id, name, email, role, mandant_id");
      const { data: mandanten } = await db.from("mandanten").select("id, name");
      const { data: admins } = await db.from("plattform_admins").select("benutzer_id");
      const nameVon = new Map((mandanten || []).map((m) => [String(m.id), m.name]));
      const istAdmin = new Set((admins || []).map((a) => String(a.benutzer_id)));
      return antwort({ ok: true, nutzer: (data || []).map((p) => ({
        ...p, haus: nameVon.get(String(p.mandant_id)) || null,
        plattform_admin: istAdmin.has(String(p.id)),
      })) });
    }

    // --- Plattform-Recht vergeben und entziehen ----------------------------
    if (aktion === "admin_setzen") {
      const nutzerId = String(body.benutzer_id || "");
      const an = !!body.an;
      const grund = String(body.grund || "").trim();
      if (!nutzerId) return antwort({ ok: false, fehler: "Kein Konto." }, 400);
      if (grund.length < 5) return antwort({ ok: false, fehler: "Bitte einen Grund angeben." }, 400);
      // Sich selbst das Recht zu entziehen ist erlaubt — aber nicht, wenn
      // danach niemand mehr eines hat. Dann kaeme niemand mehr hinein.
      if (!an) {
        const { count } = await db.from("plattform_admins")
          .select("benutzer_id", { count: "exact", head: true });
        if ((count || 0) <= 1) {
          return antwort({ ok: false, fehler:
            "Das ist der letzte Plattform-Administrator. Erst einen zweiten "
            + "ernennen, sonst kommt niemand mehr in diesen Bereich." }, 409);
        }
      }
      if (an) {
        const { error } = await db.from("plattform_admins")
          .upsert({ benutzer_id: nutzerId, notiz: grund.slice(0, 300) },
                  { onConflict: "benutzer_id" });
        if (error) return antwort({ ok: false, fehler: error.message }, 400);
      } else {
        await db.from("plattform_admins").delete().eq("benutzer_id", nutzerId);
        // Laufende Sitzungen enden mit dem Recht. Die Datenbankfunktion
        // prueft das ohnehin bei jedem Zugriff; hier wird es auch sichtbar.
        await db.from("support_sitzungen")
          .update({ beendet_am: new Date().toISOString() })
          .eq("admin_id", nutzerId).is("beendet_am", null);
      }
      await protokoll(an ? "admin_ernannt" : "admin_entzogen", nutzerId, { grund });
      return antwort({ ok: true });
    }

    // --- Ein Konto wieder hineinlassen -------------------------------------
    // Der haeufigste Supportfall ueberhaupt: jemand kommt nicht mehr rein.
    // Verschickt wird eine Zuruecksetzen-Mail an die hinterlegte Adresse —
    // NICHT an eine, die im Aufruf steht. Sonst liesse sich mit dieser
    // Aktion jedes Konto auf eine fremde Adresse umleiten.
    if (aktion === "passwort_zuruecksetzen") {
      const nutzerId = String(body.benutzer_id || "");
      const grund = String(body.grund || "").trim();
      if (!nutzerId) return antwort({ ok: false, fehler: "Kein Konto." }, 400);
      if (grund.length < 5) return antwort({ ok: false, fehler: "Bitte einen Grund angeben." }, 400);
      const { data: profil } = await db.from("profiles")
        .select("email, name").eq("id", nutzerId).maybeSingle();
      if (!profil?.email) return antwort({ ok: false, fehler: "Konto ohne Adresse." }, 404);
      const zurueck = (Deno.env.get("PORTAL_URL") || "").replace(/\/$/, "");
      const { error } = await db.auth.resetPasswordForEmail(String(profil.email),
        zurueck ? { redirectTo: zurueck } : undefined);
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      await protokoll("passwort_zuruecksetzen", nutzerId,
        { an: profil.email, grund });
      return antwort({ ok: true, an: profil.email });
    }

    // --- Supportzugriff ----------------------------------------------------
    if (aktion === "support_start") {
      const id = String(body.mandant_id || "");
      const grund = String(body.grund || "").trim();
      const schreiben = !!body.schreiben;
      if (!id) return antwort({ ok: false, fehler: "Kein Mandant." }, 400);
      if (grund.length < 5) {
        return antwort({ ok: false, fehler:
          "Bitte einen Grund angeben — der Mandant kann ihn nachlesen." }, 400);
      }
      const { data: w } = await db.from("plattform_werte")
        .select("wert").eq("schluessel", "support_dauer_minuten").maybeSingle();
      const minuten = Math.max(5, Math.min(240,
        Number(String(w?.wert ?? "60").replace(/"/g, "")) || 60));
      // Nur eine Sitzung auf einmal. Zwei gleichzeitige waeren in der
      // Datenbank nicht entscheidbar — sie nimmt die juengste, und das waere
      // eine Regel, die niemand sieht.
      await db.from("support_sitzungen")
        .update({ beendet_am: new Date().toISOString() })
        .eq("admin_id", u.user.id).is("beendet_am", null);
      const { data: neu, error } = await db.from("support_sitzungen").insert({
        admin_id: u.user.id, mandant_id: id, grund: grund.slice(0, 500),
        schreiben,
        gueltig_bis: new Date(Date.now() + minuten * 60000).toISOString(),
      }).select("id, gueltig_bis, schreiben").single();
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      await protokoll("support_begonnen", id,
        { grund, schreiben, minuten, sitzung: neu?.id });
      return antwort({ ok: true, sitzung: neu });
    }

    if (aktion === "support_ende") {
      const { data: offen } = await db.from("support_sitzungen")
        .select("id, mandant_id").eq("admin_id", u.user.id).is("beendet_am", null);
      await db.from("support_sitzungen")
        .update({ beendet_am: new Date().toISOString() })
        .eq("admin_id", u.user.id).is("beendet_am", null);
      for (const s of offen || []) {
        await protokoll("support_beendet", String(s.mandant_id), { sitzung: s.id });
      }
      return antwort({ ok: true, beendet: (offen || []).length });
    }

    if (aktion === "support_stand") {
      const { data } = await db.from("support_sitzungen")
        .select("id, mandant_id, grund, schreiben, begonnen_am, gueltig_bis")
        .eq("admin_id", u.user.id).is("beendet_am", null)
        .gt("gueltig_bis", new Date().toISOString())
        .order("begonnen_am", { ascending: false }).limit(1).maybeSingle();
      if (!data) return antwort({ ok: true, sitzung: null });
      const { data: m } = await db.from("mandanten")
        .select("name").eq("id", data.mandant_id).maybeSingle();
      return antwort({ ok: true, sitzung: { ...data, mandant_name: m?.name || null } });
    }

    // --- Systemzustand ------------------------------------------------------
    // Laufen die Hintergrundjobs, und wo brennt es in den Oberflächen?
    //
    // Die Fehlerübersicht gibt Meldung und Stapelspur NICHT heraus — dort
    // steht, woran ein Kunde gerade gearbeitet hat. Sie sagt, wie oft welcher
    // Fehler in welchem Haus auftrat, und das ist die Frage. Wer den Wortlaut
    // braucht, beginnt einen Supportzugriff.
    if (aktion === "system") {
      const tage = Math.max(1, Math.min(90, Number(body.tage ?? 7)));
      const [{ data: cron, error: cFehler }, { data: fehlerliste, error: fFehler }] =
        await Promise.all([
          db.rpc("cron_zustand"),
          db.rpc("fehler_uebersicht", { p_tage: tage }),
        ]);
      // Die beiden Funktionen gibt es erst seit fork_55. Fehlen sie, soll
      // der Bereich trotzdem aufgehen und sagen, was fehlt.
      return antwort({
        ok: true, tage,
        cron: cron || [], cron_fehler: cFehler?.message || null,
        fehler: fehlerliste || [], fehler_fehler: fFehler?.message || null,
      });
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
