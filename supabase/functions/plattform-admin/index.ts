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
// Welche Rolle welche Aktion rufen darf (fork_68). Nicht aufgefuehrte
// Aktionen: nur owner und admin. Die vier Rollen und ihr Zuschnitt stehen
// in docs/ADMIN.md.
const ROLLEN: Record<string, string[]> = {
  wer:                    ["owner", "admin", "support", "finanzen"],
  umsatz:                 ["owner", "admin", "finanzen"],
  kosten:                 ["owner", "admin", "finanzen"],
  fixkosten_speichern:    ["owner", "admin"],
  fixkosten_loeschen:     ["owner", "admin"],
  uebersicht:             ["owner", "admin", "support", "finanzen"],
  mandanten:              ["owner", "admin", "support", "finanzen"],
  mandant:                ["owner", "admin", "support", "finanzen"],
  katalog:                ["owner", "admin", "support", "finanzen"],
  protokoll:              ["owner", "admin", "support", "finanzen"],
  system:                 ["owner", "admin"],
  nutzer:                 ["owner", "admin", "support"],
  katalog_speichern:      ["owner", "admin"],
  credits_schenken:       ["owner", "admin", "support"],
  credits_abziehen:       ["owner", "admin"],
  notiz_anlegen:          ["owner", "admin", "support"],
  mandant_speichern:      ["owner", "admin", "support"],
  mandant_loeschen:       ["owner"],
  admin_setzen:           ["owner"],
  admin_liste:            ["owner", "admin", "support", "finanzen"],
  passwort_zuruecksetzen: ["owner", "admin", "support"],
  support_start:          ["owner", "admin", "support"],
  support_ende:           ["owner", "admin", "support"],
  support_stand:          ["owner", "admin", "support", "finanzen"],
};

/** Die Anmeldestufe aus dem Token: "aal1" oder "aal2". Ohne Pruefung der
 *  Signatur — die hat getUser() gerade gemacht; hier wird nur gelesen. */
function tokenStufe(jwt: string): string {
  try {
    const teil = jwt.split(".")[1] || "";
    const json = atob(teil.replace(/-/g, "+").replace(/_/g, "/"));
    return String(JSON.parse(json).aal || "aal1");
  } catch { return "aal1"; }
}

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
      .select("benutzer_id, rolle, aktiv").eq("benutzer_id", u.user.id).maybeSingle();
    if (!admin || !admin.aktiv) return antwort({ ok: false, fehler: "Kein Plattform-Administrator." }, 403);
    const rolle = String(admin.rolle || "admin");

    // Zweiter Faktor (fork_68). Supabase schreibt die Stufe der Anmeldung in
    // das Token: "aal1" ist Passwort, "aal2" ist Passwort UND bestaetigter
    // zweiter Faktor. Die Pflicht ist ein Plattformwert, damit der Betreiber
    // sich nicht aussperrt, bevor TOTP eingerichtet ist — und damit sie sich
    // ohne Ausrollen abschalten laesst, wenn jemand den Zugang verliert.
    const { data: mfaWert } = await db.from("plattform_werte")
      .select("wert").eq("schluessel", "betreiber_mfa_pflicht").maybeSingle();
    const mfaPflicht = mfaWert ? mfaWert.wert === true : true;
    if (mfaPflicht && tokenStufe(kopf) !== "aal2") {
      return antwort({ ok: false, mfa: true, fehler:
        "Zweiter Faktor erforderlich. Bitte TOTP einrichten oder bestaetigen." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const aktion = String(body.aktion || "uebersicht");

    // Die Rollenschranke steht VOR der Aktion, nicht in ihr. Was nicht in
    // der Liste steht, duerfen nur owner und admin — ein Versehen sperrt
    // also zu viel, nie zu wenig.
    const erlaubt = ROLLEN[aktion] || ["owner", "admin"];
    if (!erlaubt.includes(rolle)) {
      return antwort({ ok: false, fehler:
        `Die Rolle "${rolle}" darf das nicht (${aktion}).` }, 403);
    }

    // Jede schreibende Aktion ins Audit-Log: wer (mit Rolle), was, woran,
    // warum, von wo. `vorher`/`nachher` dort, wo es einen Zustand gibt.
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 300) || null;
    const protokoll = async (was: string, gegenstand: string, einzelheiten: unknown,
                             stand?: { typ?: string; vorher?: unknown; nachher?: unknown }) => {
      const e = (einzelheiten || {}) as Record<string, unknown>;
      await db.from("plattform_protokoll").insert({
        benutzer_id: u.user.id, aktion: was, gegenstand,
        einzelheiten: e,
        rolle, ziel_typ: stand?.typ || null, ziel_id: gegenstand || null,
        vorher: stand?.vorher ?? null, nachher: stand?.nachher ?? null,
        begruendung: typeof e.grund === "string" ? e.grund : null,
        ip, user_agent: userAgent,
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
      // Letzter Login, aktive Nutzer, Onboarding, Gesundheit — aus einer
      // Datenbankfunktion, die nur ZAEHLT (fork_69). Die Fachtabellen
      // bleiben dieser Function verschlossen, auch zum Zaehlen.
      const { data: kennzahlen } = await db.rpc("plattform_mandanten_kennzahlen");
      const kzNach = new Map<string, Record<string, unknown>>();
      for (const k of (kennzahlen || []) as Record<string, unknown>[]) kzNach.set(String(k.mandant_id), k);

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
          letzter_login: kzNach.get(String(m.id))?.letzter_login || null,
          aktive_14: Number(kzNach.get(String(m.id))?.aktive_14 || 0),
          onboarding: Number(kzNach.get(String(m.id))?.onboarding || 0),
          aktionen_30: Number(kzNach.get(String(m.id))?.aktionen_30 || 0),
          gesundheit: kzNach.has(String(m.id)) ? Number(kzNach.get(String(m.id))?.gesundheit || 0) : null,
        });
      }
      return antwort({ ok: true, mandanten: zeilen });
    }

    // --- Die Zahlen ---------------------------------------------------------
    if (aktion === "wer") {
      return antwort({ ok: true, rolle, mfa_pflicht: mfaPflicht });
    }

    if (aktion === "uebersicht") {
      // Zeitraum aus der Leiste: 7 / 30 / 90 / 365 Tage. Vergleich mit dem
      // ebenso langen Zeitraum davor — aus den Tagesschnappschuessen
      // (fork_70). Vor dem ersten Schnappschuss gibt es keinen Vergleich,
      // und dann steht da auch keiner.
      const tage = Math.max(1, Math.min(365, Math.floor(Number(body.tage || 30))));
      const seit = new Date(Date.now() - tage * 86400000).toISOString();
      const heute = new Date().toISOString().slice(0, 10);
      const tagVor = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
      const [{ data: verbrauch }, { data: frei }, { data: mrrZeilen }, { data: abos },
             { data: kz }, { data: schnapp }, { data: gruender }, { data: kennzahlen }] =
        await Promise.all([
          db.from("credit_buchungen")
            .select("aktion, credits, ki_kosten_eur, status, zeitpunkt")
            .gte("zeitpunkt", seit).in("status", ["gebucht"]),
          db.rpc("gruender_plaetze_frei"),
          db.rpc("plattform_mrr_je_mandant"),
          db.from("mandant_abo").select("mandant_id, tarif, intervall, status, zahlung_fehler_seit, cancel_at, testphase_ende:periode_bis, mindestlaufzeit_bis"),
          db.from("plattform_kennzahlen_tag").select("datum, kennzahl, tarif, wert")
            .in("datum", [tagVor(tage), tagVor(2 * tage)]),
          db.from("plattform_mandanten_tag").select("datum, mandant_id, zahlend, status, mrr_cent")
            .gte("datum", tagVor(2 * tage)),
          db.from("plattform_werte").select("schluessel, wert").in("schluessel", ["gruender_plaetze", "kosten_warnung_prozent"]),
          db.rpc("plattform_mandanten_kennzahlen"),
        ]);
      const mrrNach = (mrrZeilen || []) as Record<string, unknown>[];
      let mrr = 0; const jeTarif: Record<string, { zahlende: number; mrr_cent: number }> = {};
      let zahlende = 0;
      for (const z of mrrNach) {
        if (!z.zahlend) continue;
        zahlende++; mrr += Number(z.mrr_cent || 0);
        const k = String(z.tarif || "?");
        jeTarif[k] = jeTarif[k] || { zahlende: 0, mrr_cent: 0 };
        jeTarif[k].zahlende++; jeTarif[k].mrr_cent += Number(z.mrr_cent || 0);
      }
      const nachStatus: Record<string, number> = {};
      for (const a of abos || []) nachStatus[String(a.status)] = (nachStatus[String(a.status)] || 0) + 1;

      // Vorzeitraum aus dem Schnappschuss von vor `tage` Tagen.
      const wert = (datum: string, k: string, tarif = "") => {
        const z = (kz || []).find((x) => x.datum === datum && x.kennzahl === k && x.tarif === tarif);
        return z ? Number(z.wert) : null;
      };
      const vor = tagVor(tage);
      const vorher = { mrr_cent: wert(vor, "mrr_cent"), zahlende: wert(vor, "zahlende"),
                       test_aktiv: wert(vor, "test_aktiv"), zahlung_offen: wert(vor, "zahlung_offen") };

      // Bewegungen im Zeitraum aus den Mandantenschnappschuessen: wer am
      // Anfang nicht zahlte und am Ende zahlt, ist neu; umgekehrt gekuendigt.
      const anfang = new Map<string, Record<string, unknown>>(), endeTag = new Map<string, Record<string, unknown>>();
      for (const s of schnapp || []) {
        if (s.datum === vor) anfang.set(String(s.mandant_id), s);
        if (s.datum === heute || s.datum === tagVor(1)) endeTag.set(String(s.mandant_id), s);
      }
      let neu = 0, gekuendigt = 0, testBeendet = 0, umgewandelt = 0;
      for (const [id, e] of endeTag) {
        const a = anfang.get(id);
        if (e.zahlend && !(a && a.zahlend)) neu++;
        if (!e.zahlend && a && a.zahlend) gekuendigt++;
        if (a && a.status === "test" && e.status !== "test") { testBeendet++; if (e.zahlend) umgewandelt++; }
      }
      const kuendigungsquote = vorher.zahlende ? gekuendigt / Number(vorher.zahlende) : null;
      const umwandlungsquote = testBeendet ? umgewandelt / testBeendet : null;

      // Verbrauch und Anbieterkosten, nach Aktion.
      const jeAktion = new Map<string, { credits: number; kosten: number; mit: number; ohne: number }>();
      let credits = 0, kosten = 0, ohneKosten = 0;
      for (const b of verbrauch || []) {
        const k = String(b.aktion);
        const e = jeAktion.get(k) || { credits: 0, kosten: 0, mit: 0, ohne: 0 };
        e.credits += Number(b.credits || 0); credits += Number(b.credits || 0);
        if (b.ki_kosten_eur === null || b.ki_kosten_eur === undefined) { e.ohne++; ohneKosten++; }
        else { e.kosten += Number(b.ki_kosten_eur); e.mit++; kosten += Number(b.ki_kosten_eur); }
        jeAktion.set(k, e);
      }
      // Deckungsbeitrag im Zeitraum: Erloes (MRR anteilig) minus KI-Kosten.
      // Stripe-Gebuehren und Infrastrukturpauschale kommen mit Schritt 4.
      const erloes = mrr * tage / 30 / 100;
      const deckung = erloes - kosten;

      const plaetze = Number((gruender || []).find((w) => w.schluessel === "gruender_plaetze")?.wert ?? 50);
      const zahlungOffen = (abos || []).filter((a) => a.zahlung_fehler_seit).length;
      const kuendigungVorgemerkt = (abos || []).filter((a) => a.status === "gekuendigt" && a.cancel_at && new Date(String(a.cancel_at)) > new Date()).length;

      // Heute zu tun — mit dem Mandanten als Ziel; die Tafel verlinkt.
      const { data: mandantenNamen } = await db.from("mandanten").select("id, name, testphase_bis, abo_status");
      const name = new Map((mandantenNamen || []).map((m) => [String(m.id), m]));
      const zuTun: { art: string; mandant_id: string; text: string }[] = [];
      for (const m of mandantenNamen || []) {
        if (m.abo_status === "test" && m.testphase_bis && new Date(String(m.testphase_bis)).getTime() < Date.now() + 3 * 86400000) {
          zuTun.push({ art: "test_endet", mandant_id: String(m.id), text: `${m.name}: Test endet ${String(m.testphase_bis).slice(0, 10)}` });
        }
      }
      for (const a of abos || []) {
        if (a.zahlung_fehler_seit) zuTun.push({ art: "zahlung", mandant_id: String(a.mandant_id),
          text: `${name.get(String(a.mandant_id))?.name || a.mandant_id}: Zahlung offen seit ${String(a.zahlung_fehler_seit).slice(0, 10)}` });
      }
      const { data: sitzungen } = await db.from("support_sitzungen").select("mandant_id, gueltig_bis")
        .is("beendet_am", null).gt("gueltig_bis", new Date().toISOString());
      for (const s of sitzungen || []) zuTun.push({ art: "support", mandant_id: String(s.mandant_id),
        text: `${name.get(String(s.mandant_id))?.name || s.mandant_id}: Supportzugriff laeuft bis ${String(s.gueltig_bis).slice(11, 16)}` });
      for (const k of (kennzahlen || []) as Record<string, unknown>[]) {
        if (k.gesundheit !== null && Number(k.gesundheit) < 40) zuTun.push({ art: "risiko", mandant_id: String(k.mandant_id),
          text: `${name.get(String(k.mandant_id))?.name || k.mandant_id}: Gesundheit ${k.gesundheit}` });
      }

      // MRR-Verlauf: je Monat der letzte Schnappschuss, gestapelt nach Tarif.
      const { data: verlauf } = await db.from("plattform_kennzahlen_tag").select("datum, tarif, wert")
        .eq("kennzahl", "mrr_cent").neq("tarif", "").gte("datum", tagVor(370)).order("datum");
      const monate = new Map<string, Record<string, number>>();
      for (const v of verlauf || []) {
        const mon = String(v.datum).slice(0, 7);
        const e = monate.get(mon) || {};
        e[String(v.tarif)] = Number(v.wert); // spaeterer Tag ueberschreibt frueheren
        monate.set(mon, e);
      }
      const { count: technikfehler } = await db.from("fehler_protokoll")
        .select("id", { count: "exact", head: true }).gte("created_at", tagVor(1));

      return antwort({
        ok: true, tage, stand: heute,
        mrr_cent: mrr, arr_cent: mrr * 12, zahlende, je_tarif: jeTarif,
        abos_nach_status: nachStatus,
        neu_zahlend: neu, gekuendigt, kuendigung_vorgemerkt: kuendigungVorgemerkt, kuendigungsquote,
        test_aktiv: nachStatus.test || 0, test_beendet: testBeendet, umwandlungsquote,
        gruender_belegt: mrrNach.filter((z) => z.gruenderpreis).length, gruender_plaetze: plaetze,
        gruender_frei: Number(frei ?? 0),
        zeitraum_tage: tage,
        credits_verbraucht: credits,
        ki_kosten_eur: Math.round(kosten * 1e6) / 1e6,
        buchungen_ohne_kosten: ohneKosten,
        erloes_eur: Math.round(erloes * 100) / 100, deckungsbeitrag_eur: Math.round(deckung * 100) / 100,
        marge: erloes > 0 ? deckung / erloes : null,
        zahlung_offen: zahlungOffen, support_offen: null, technikfehler_24h: Number(technikfehler || 0),
        vorher, zu_tun: zuTun,
        verlauf: Array.from(monate.entries()).map(([monat, t]) => ({ monat, ...t })),
        je_aktion: Array.from(jeAktion.entries())
          .map(([aktion, e]) => ({ aktion, ...e, kosten: Math.round(e.kosten * 1e6) / 1e6 }))
          .sort((a, b) => b.credits - a.credits),
      });
    }

    // --- Kosten & Marge (fork_71) -----------------------------------------
    // Alles aus einer Datenbankfunktion; die Edge Function reicht nur den
    // Zeitraum durch und haengt die Namen der Haeuser an.
    if (aktion === "kosten") {
      const tage = Math.max(1, Math.min(365, Math.floor(Number(body.tage || 30))));
      const bis = new Date().toISOString().slice(0, 10);
      const von = new Date(Date.now() - (tage - 1) * 86400000).toISOString().slice(0, 10);
      const [{ data: k, error }, { data: namen }] = await Promise.all([
        db.rpc("plattform_kosten", { p_von: von, p_bis: bis }),
        db.from("mandanten").select("id, name"),
      ]);
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      const name = new Map((namen || []).map((m) => [String(m.id), m.name]));
      const kk = (k || {}) as Record<string, unknown>;
      kk.je_mandant = ((kk.je_mandant as Record<string, unknown>[]) || []).map((j) => ({ ...j, name: name.get(String(j.mandant_id)) || j.mandant_id }));
      return antwort({ ok: true, ...kk });
    }
    if (aktion === "fixkosten_speichern") {
      const bez = String(body.bezeichnung || "").trim();
      const betrag = Math.max(0, Math.floor(Number(body.betrag_cent || 0)));
      if (bez.length < 2) return antwort({ ok: false, fehler: "Bezeichnung fehlt." }, 400);
      const zeile: Record<string, unknown> = { bezeichnung: bez.slice(0, 120), betrag_cent: betrag,
        aktiv: body.aktiv !== false, notiz: body.notiz ? String(body.notiz).slice(0, 500) : null,
        geaendert_am: new Date().toISOString() };
      let vorher: unknown = null;
      if (body.id) {
        const { data: v } = await db.from("plattform_fixkosten").select("*").eq("id", String(body.id)).maybeSingle();
        vorher = v;
        const { error } = await db.from("plattform_fixkosten").update(zeile).eq("id", String(body.id));
        if (error) return antwort({ ok: false, fehler: error.message }, 400);
      } else {
        const { error } = await db.from("plattform_fixkosten").insert(zeile);
        if (error) return antwort({ ok: false, fehler: error.message }, 400);
      }
      await protokoll("fixkosten_geaendert", String(body.id || bez), { bezeichnung: bez, betrag_cent: betrag },
                      { typ: "fixkosten", vorher, nachher: zeile });
      return antwort({ ok: true });
    }
    if (aktion === "fixkosten_loeschen") {
      const id = String(body.id || "");
      if (!id) return antwort({ ok: false, fehler: "Keine Kennung." }, 400);
      const { data: vorher } = await db.from("plattform_fixkosten").select("*").eq("id", id).maybeSingle();
      const { error } = await db.from("plattform_fixkosten").delete().eq("id", id);
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      await protokoll("fixkosten_geloescht", id, {}, { typ: "fixkosten", vorher, nachher: null });
      return antwort({ ok: true });
    }

    // --- Umsatz & Abos (fork_70) ------------------------------------------
    if (aktion === "umsatz") {
      const heute = new Date();
      const [{ data: schnapp }, { data: mrrZeilen }, { data: abos }, { data: pakete }, { data: namen }] = await Promise.all([
        db.from("plattform_mandanten_tag").select("datum, mandant_id, tarif, intervall, status, zahlend, mrr_cent, gruenderpreis")
          .gte("datum", new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)).order("datum"),
        db.rpc("plattform_mrr_je_mandant"),
        db.from("mandant_abo").select("mandant_id, tarif, intervall, status, gruenderpreis, cancel_at, mindestlaufzeit_bis, gekuendigt_am"),
        db.from("credit_konten").select("mandant_id, credits, erstellt_am").eq("quelle", "paket")
          .gte("erstellt_am", new Date(Date.now() - 365 * 86400000).toISOString()),
        db.from("mandanten").select("id, name"),
      ]);
      const name = new Map((namen || []).map((m) => [String(m.id), m.name]));
      // Letzter Schnappschuss je Monat je Mandant.
      const jeMonatMandant = new Map<string, Map<string, Record<string, unknown>>>();
      for (const s of schnapp || []) {
        const mon = String(s.datum).slice(0, 7);
        if (!jeMonatMandant.has(mon)) jeMonatMandant.set(mon, new Map());
        jeMonatMandant.get(mon)!.set(String(s.mandant_id), s);
      }
      const monate = Array.from(jeMonatMandant.keys()).sort();
      // Wasserfall: Neu / Erweiterung / Verkleinerung / Kuendigung / netto je Monat.
      const wasserfall = monate.map((mon, i) => {
        const jetzt = jeMonatMandant.get(mon)!, davor = i > 0 ? jeMonatMandant.get(monate[i - 1])! : new Map();
        let neu = 0, erweiterung = 0, verkleinerung = 0, kuendigung = 0;
        for (const [id, s] of jetzt) {
          const v = davor.get(id);
          const m1 = v ? Number(v.mrr_cent) : 0, m2 = Number(s.mrr_cent);
          if (m2 > 0 && m1 === 0) neu += m2;
          else if (m2 > m1) erweiterung += m2 - m1;
          else if (m2 < m1 && m2 > 0) verkleinerung += m1 - m2;
          else if (m2 === 0 && m1 > 0) kuendigung += m1;
        }
        for (const [id, v] of davor) if (!jetzt.has(id) && Number(v.mrr_cent) > 0) kuendigung += Number(v.mrr_cent);
        return { monat: mon, neu, erweiterung, verkleinerung: -verkleinerung, kuendigung: -kuendigung,
                 netto: neu + erweiterung - verkleinerung - kuendigung };
      });
      // Kohorten: Startmonat (erster zahlender Schnappschuss) x Verbleib.
      const start = new Map<string, string>();
      for (const s of schnapp || []) if (s.zahlend && !start.has(String(s.mandant_id))) start.set(String(s.mandant_id), String(s.datum).slice(0, 7));
      const kohorten: Record<string, { groesse: number; nach: Record<string, number> }> = {};
      const monIdx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
      for (const [id, sm] of start) {
        kohorten[sm] = kohorten[sm] || { groesse: 0, nach: { "1": 0, "3": 0, "6": 0, "12": 0 } };
        kohorten[sm].groesse++;
        for (const n of [1, 3, 6, 12]) {
          const ziel = monate.find((m) => monIdx(m) === monIdx(sm) + n);
          if (ziel && jeMonatMandant.get(ziel)!.get(id)?.zahlend) kohorten[sm].nach[String(n)]++;
        }
      }
      const zahlend = ((mrrZeilen || []) as Record<string, unknown>[]).filter((z) => z.zahlend);
      const verteilung = { monat: zahlend.filter((z) => z.intervall === "monat").length,
                           jahr: zahlend.filter((z) => z.intervall === "jahr").length,
                           gruender: zahlend.filter((z) => z.gruenderpreis).length,
                           je_tarif: {} as Record<string, number> };
      for (const z of zahlend) verteilung.je_tarif[String(z.tarif)] = (verteilung.je_tarif[String(z.tarif)] || 0) + 1;
      const in30 = new Date(Date.now() + 30 * 86400000);
      const mindestlaufzeit = (abos || []).filter((a) => a.mindestlaufzeit_bis && new Date(String(a.mindestlaufzeit_bis)) <= in30 && new Date(String(a.mindestlaufzeit_bis)) >= heute)
        .map((a) => ({ mandant_id: a.mandant_id, name: name.get(String(a.mandant_id)) || a.mandant_id, bis: a.mindestlaufzeit_bis, tarif: a.tarif }));
      const vorgemerkt = (abos || []).filter((a) => a.status === "gekuendigt" && a.cancel_at)
        .map((a) => ({ mandant_id: a.mandant_id, name: name.get(String(a.mandant_id)) || a.mandant_id, wirksam: a.cancel_at, gekuendigt_am: a.gekuendigt_am, tarif: a.tarif }));
      const paketeJeMonat: Record<string, { anzahl: number; credits: number }> = {};
      for (const p of pakete || []) {
        const mon = String(p.erstellt_am).slice(0, 7);
        paketeJeMonat[mon] = paketeJeMonat[mon] || { anzahl: 0, credits: 0 };
        paketeJeMonat[mon].anzahl++; paketeJeMonat[mon].credits += Number(p.credits || 0);
      }
      return antwort({ ok: true, wasserfall, kohorten, verteilung, mindestlaufzeit, vorgemerkt,
                       pakete: paketeJeMonat, schnappschuesse: (schnapp || []).length });
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
      // Die Rolle support darf bis 500 gutschreiben — mehr ist eine
      // Entscheidung, keine Kulanz.
      if (rolle === "support" && anzahl > 500) {
        return antwort({ ok: false, fehler:
          "Die Rolle support darf hoechstens 500 Credits gutschreiben." }, 403);
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

    // --- Credits abziehen (fork_69) ----------------------------------------
    // Das Gegenstueck zur Gutschrift: aelteste Toepfe zuerst, nie unter null,
    // jede Buchung mit Quelle `betreiber` und Grund im Ledger. Nur owner und
    // admin — das steht in ROLLEN und noch einmal in der Datenbankfunktion.
    if (aktion === "credits_abziehen") {
      const mandant = String(body.mandant_id || "");
      const anzahl = Math.floor(Number(body.credits || 0));
      const grund = String(body.grund || "").trim();
      if (!mandant) return antwort({ ok: false, fehler: "Kein Mandant." }, 400);
      if (!(anzahl > 0) || anzahl > 100000) {
        return antwort({ ok: false, fehler: "Anzahl zwischen 1 und 100000." }, 400);
      }
      if (grund.length < 5) {
        return antwort({ ok: false, fehler:
          "Bitte einen Grund angeben — er steht im Ledger und im Protokoll." }, 400);
      }
      const referenz = "abzug:" + mandant + ":" + (body.vorgang || crypto.randomUUID());
      const { data: saldoVorher } = await db.rpc("credits_saldo", { p_mandant: mandant });
      const { error } = await db.rpc("credits_abziehen", {
        p_mandant: mandant, p_credits: anzahl, p_grund: grund, p_referenz: referenz,
      });
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      await protokoll("credits_abgezogen", mandant, { credits: anzahl, grund, referenz },
                      { typ: "mandant", vorher: { saldo: saldoVorher },
                        nachher: { saldo: Number(saldoVorher || 0) - anzahl } });
      return antwort({ ok: true, referenz });
    }

    // --- Notiz des Betreibers (fork_69) -----------------------------------
    if (aktion === "notiz_anlegen") {
      const mandant = String(body.mandant_id || "");
      const text = String(body.text || "").trim();
      if (!mandant) return antwort({ ok: false, fehler: "Kein Mandant." }, 400);
      if (!text) return antwort({ ok: false, fehler: "Leere Notiz." }, 400);
      const { error } = await db.from("plattform_notizen")
        .insert({ betrifft_mandant_id: mandant, admin_id: u.user.id, text: text.slice(0, 4000) });
      if (error) return antwort({ ok: false, fehler: error.message }, 400);
      await protokoll("notiz_angelegt", mandant, { laenge: text.length }, { typ: "mandant" });
      return antwort({ ok: true });
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
      const [{ data: saldo }, { data: zugriff }, { data: limit }, { data: metadaten },
             { data: notizen }, { data: verlauf }] = await Promise.all([
        db.rpc("credits_saldo", { p_mandant: id }),
        db.rpc("abo_zugriff", { p_mandant: id }),
        db.rpc("nutzer_limit", { p_mandant: id }),
        // Onboarding, Zaehlwerte, Logins, Module, Speicher — nur Metadaten (fork_69).
        db.rpc("plattform_mandant_metadaten", { p_mandant: id }),
        db.from("plattform_notizen").select("id, admin_id, text, erstellt_am")
          .eq("betrifft_mandant_id", id).order("erstellt_am", { ascending: false }).limit(100),
        // Der Verlauf: alles, was Betreiber an diesem Haus getan haben.
        db.from("plattform_protokoll").select("id, erstellt_am, benutzer_id, rolle, aktion, einzelheiten, begruendung")
          .eq("gegenstand", id).order("erstellt_am", { ascending: false }).limit(100),
      ]);
      // Die Logins je Konto an die Konten haengen (Name/E-Mail kommen aus
      // profiles, der Zeitpunkt aus der Funktion).
      const loginNach = new Map<string, unknown>();
      for (const l of ((metadaten as Record<string, unknown>)?.logins as Record<string, unknown>[] || [])) {
        loginNach.set(String(l.id), l.letzter_login);
      }
      return antwort({
        ok: true, mandant: m, abo,
        nutzer: (nutzer || []).map((n) => ({ ...n, letzter_login: loginNach.get(String(n.id)) || null })),
        konten: konten || [],
        buchungen: buchungen || [], erinnerungen: erinnerungen || [],
        sitzungen: sitzungen || [],
        saldo: Number(saldo ?? 0), zugriff, nutzer_limit: Number(limit ?? 0),
        metadaten: metadaten || null, notizen: notizen || [], verlauf: verlauf || [],
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
      // support: Testphase verlaengern ja — Name, Sperre, Tarif, Abo nein.
      if (rolle === "support") {
        const fremd = Object.keys(body).filter((k) =>
          !["aktion", "mandant_id", "grund", "testphase_bis"].includes(k));
        if (fremd.length) {
          return antwort({ ok: false, fehler:
            "Die Rolle support darf nur die Testphase verlaengern." }, 403);
        }
        // Hoechstens 30 Tage ueber heute hinaus.
        const bis = body.testphase_bis ? new Date(body.testphase_bis).getTime() : 0;
        if (!bis || bis > Date.now() + 30 * 86400000) {
          return antwort({ ok: false, fehler:
            "Verlaengerung um hoechstens 30 Tage ab heute." }, 400);
        }
      }

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

      await protokoll("mandant_geaendert", id, { mandant: m, abo: a, grund },
                      { typ: "mandant", vorher, nachher: { ...vorher, ...m, abo: a } });
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
      const { data: admins } = await db.from("plattform_admins").select("benutzer_id").eq("aktiv", true);
      const nameVon = new Map((mandanten || []).map((m) => [String(m.id), m.name]));
      const istAdmin = new Set((admins || []).map((a) => String(a.benutzer_id)));
      return antwort({ ok: true, nutzer: (data || []).map((p) => ({
        ...p, haus: nameVon.get(String(p.mandant_id)) || null,
        plattform_admin: istAdmin.has(String(p.id)),
      })) });
    }

    // --- Plattform-Recht vergeben und entziehen ----------------------------
    if (aktion === "admin_liste") {
      const { data: admins } = await db.from("plattform_admins")
        .select("benutzer_id, rolle, aktiv, notiz, erstellt_am, erstellt_von");
      const ids = (admins || []).map((a) => String(a.benutzer_id));
      const { data: profile } = ids.length
        ? await db.from("profiles").select("id, name, email").in("id", ids)
        : { data: [] };
      const pv = new Map((profile || []).map((p) => [String(p.id), p]));
      return antwort({ ok: true, admins: (admins || []).map((a) => ({
        ...a, name: pv.get(String(a.benutzer_id))?.name || null,
        email: pv.get(String(a.benutzer_id))?.email || null,
      })) });
    }

    // Admins ernennen, Rolle aendern, deaktivieren — nur owner (fork_68).
    // Deaktiviert statt geloescht: das Audit-Log soll weiter zeigen, wer
    // damals gehandelt hat. Den letzten aktiven Owner schuetzt die
    // Datenbank selbst (Trigger plattform_admins_letzter_owner).
    if (aktion === "admin_setzen") {
      const nutzerId = String(body.benutzer_id || "");
      const an = !!body.an;
      const grund = String(body.grund || "").trim();
      const neueRolle = String(body.rolle || "admin");
      if (!nutzerId) return antwort({ ok: false, fehler: "Kein Konto." }, 400);
      if (grund.length < 5) return antwort({ ok: false, fehler: "Bitte einen Grund angeben." }, 400);
      if (!["owner", "admin", "support", "finanzen"].includes(neueRolle)) {
        return antwort({ ok: false, fehler: "Unbekannte Rolle." }, 400);
      }
      const { data: vorher } = await db.from("plattform_admins")
        .select("benutzer_id, rolle, aktiv").eq("benutzer_id", nutzerId).maybeSingle();
      if (an) {
        const { error } = await db.from("plattform_admins")
          .upsert({ benutzer_id: nutzerId, rolle: neueRolle, aktiv: true,
                    notiz: grund.slice(0, 300), erstellt_von: vorher ? undefined : u.user.id },
                  { onConflict: "benutzer_id" });
        if (error) return antwort({ ok: false, fehler: error.message.includes("letzte aktive Owner")
          ? "Das ist der letzte aktive Owner. Erst einen zweiten ernennen." : error.message }, 409);
      } else {
        if (!vorher) return antwort({ ok: false, fehler: "Kein Betreiber." }, 404);
        const { error } = await db.from("plattform_admins")
          .update({ aktiv: false, notiz: grund.slice(0, 300) }).eq("benutzer_id", nutzerId);
        if (error) return antwort({ ok: false, fehler: error.message.includes("letzte aktive Owner")
          ? "Das ist der letzte Plattform-Administrator mit Owner-Rolle. Erst einen "
            + "zweiten ernennen, sonst kommt niemand mehr in diesen Bereich." : error.message }, 409);
        // Laufende Sitzungen enden mit dem Recht. Die Datenbankfunktion
        // prueft das ohnehin bei jedem Zugriff; hier wird es auch sichtbar.
        await db.from("support_sitzungen")
          .update({ beendet_am: new Date().toISOString() })
          .eq("admin_id", nutzerId).is("beendet_am", null);
      }
      await protokoll(an ? (vorher ? "admin_rolle_geaendert" : "admin_ernannt") : "admin_deaktiviert",
                      nutzerId, { grund, rolle: an ? neueRolle : null },
                      { typ: "plattform_admin", vorher,
                        nachher: an ? { benutzer_id: nutzerId, rolle: neueRolle, aktiv: true }
                                    : { ...(vorher || {}), aktiv: false } });
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
