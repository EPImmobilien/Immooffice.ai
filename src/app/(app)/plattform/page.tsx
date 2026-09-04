import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlattformAnsicht, type PlattformDaten } from "@/components/plattform/PlattformAnsicht";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Hinweis } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { dienstClient } from "@/lib/supabase/dienst";
import { istPlattformAdmin } from "@/server/plattform-aktionen";

export const metadata: Metadata = { title: "Plattform" };

/**
 * Plattform-Administration (Masterprompt 15, docs/AUTONOMIE.md A1–A3). Nur fuer
 * plattform_admins; Fremde bekommen 404, damit die Existenz nicht sichtbar ist.
 * Es werden ausschliesslich Metadaten gelesen — keine Objekte, Kontakte, Dokumente.
 */
export default async function PlattformSeite() {
  await sitzungErzwingen();
  const admin = await istPlattformAdmin().catch(() => false);
  if (!admin) notFound();
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    return (
      <>
        <Seitenkopf titel="Plattform" beschreibung="Betreiberbereich: Mandanten, Tarife, Credits, Limits, Jobs, Support, Audit, Systemzustand." />
        <Hinweis ton="warnung">Der Betreiberbereich liest Metadaten aller Mandanten und braucht dafür den Dienstschlüssel der Datenbank. Bitte <code>SUPABASE_SERVICE_ROLE_KEY</code> als Umgebungsvariable hinterlegen (nur serverseitig, siehe <code>docs/ANLEITUNG.md</code>, Abschnitt 4) und neu bauen.</Hinweis>
      </>
    );
  }
  const dienst = dienstClient();
  const monat = new Date().toISOString().slice(0, 7);
  const [mandanten, benutzer, abos, tarife, preise, creditPreise, einstellungen, jobs, rueckrufe, stripe, support, audit, konten, buchungen, integrationen, jobsFehler, aktivitaet] = await Promise.all([
    dienst.from("mandanten").select("id, name, slug, abo_status, testphase_bis, gesperrt_am, gesperrt_grund, gekuendigt_am, loeschung_geplant_am, erstellt_am").order("erstellt_am", { ascending: false }).limit(500),
    dienst.from("benutzer").select("mandant_id").eq("aktiv", true),
    dienst.from("abonnements").select("mandant_id, intervall, status, tarife(name, preis_monat_netto, preis_jahr_netto)"),
    dienst.from("tarife").select("schluessel, name, preis_monat_netto, preis_jahr_netto, enthaltene_benutzer, credits_monat, aktiv").order("reihenfolge"),
    dienst.from("preise").select("schluessel, bezeichnung, art, netto, credits, aktiv").order("reihenfolge"),
    dienst.from("credit_preise").select("aktion, bezeichnung, credits").order("aktion"),
    dienst.from("plattform_einstellungen").select("schluessel, wert, beschreibung, geaendert_am").order("schluessel"),
    dienst.from("jobs").select("id, mandant_id, art, status, versuche, fehler_text, erstellt_am").eq("status", "fehler").order("erstellt_am", { ascending: false }).limit(50),
    dienst.from("rueckrufe").select("id, mandant_id, ereignis, status, versuche, fehler_text, erstellt_am").eq("status", "fehler").order("erstellt_am", { ascending: false }).limit(50),
    dienst.from("stripe_ereignisse").select("id, typ, status, erstellt_am").order("erstellt_am", { ascending: false }).limit(30),
    dienst.from("support_freigaben").select("id, mandant_id, gueltig_bis, widerrufen_am, erstellt_am").order("erstellt_am", { ascending: false }).limit(50),
    dienst.from("audit_log").select("id, mandant_id, aktion, ziel_art, erstellt_am, details").in("aktion", ["mandant_gesperrt", "mandant_reaktiviert", "mandant_gekuendigt", "mandant_kuendigung_zurueckgenommen", "support_zugriff_gewaehrt", "support_zugriff_widerrufen", "datenexport"]).order("erstellt_am", { ascending: false }).limit(100),
    dienst.from("credit_konto").select("mandant_id, menge, verbraucht, reserviert, gueltig_bis"),
    dienst.from("credit_buchungen").select("mandant_id, richtung, menge, kosten_cent, erstellt_am").gte("erstellt_am", `${monat}-01`),
    dienst.from("integrationen").select("mandant_id").eq("aktiv", true),
    dienst.from("jobs").select("mandant_id").eq("status", "fehler"),
    dienst.from("audit_log").select("mandant_id, erstellt_am").order("erstellt_am", { ascending: false }).limit(2000),
  ]);
  const zaehle = (liste: Array<Record<string, unknown>> | null, id: string) => (liste ?? []).filter((x) => x["mandant_id"] === id).length;
  const abo = (id: string) => (abos.data ?? []).find((a) => a.mandant_id === id) as { intervall?: string; tarife?: { name?: string; preis_monat_netto?: number; preis_jahr_netto?: number } | { name?: string; preis_monat_netto?: number; preis_jahr_netto?: number }[] } | undefined;
  const tarifVon = (id: string) => { const a = abo(id); const t = Array.isArray(a?.tarife) ? a?.tarife[0] : a?.tarife; return { name: t?.name ?? null, intervall: a?.intervall ?? null, netto: a?.intervall === "jahr" ? Number(t?.preis_jahr_netto ?? 0) / 12 : Number(t?.preis_monat_netto ?? 0) }; };
  const daten: PlattformDaten = {
    mandanten: ((mandanten.data ?? []) as Array<Record<string, unknown>>).map((m) => {
      const id = m["id"] as string;
      const t = tarifVon(id);
      const konto = ((konten.data ?? []) as Array<Record<string, unknown>>).filter((k) => k["mandant_id"] === id);
      const letzte = ((aktivitaet.data ?? []) as Array<Record<string, unknown>>).find((a) => a["mandant_id"] === id);
      return {
        id, name: m["name"] as string, slug: m["slug"] as string, abo_status: m["abo_status"] as string, testphase_bis: (m["testphase_bis"] as string | null) ?? null,
        gesperrt_am: (m["gesperrt_am"] as string | null) ?? null, gesperrt_grund: (m["gesperrt_grund"] as string | null) ?? null, gekuendigt_am: (m["gekuendigt_am"] as string | null) ?? null,
        loeschung_geplant_am: (m["loeschung_geplant_am"] as string | null) ?? null, erstellt_am: m["erstellt_am"] as string,
        benutzer: zaehle(benutzer.data as Array<Record<string, unknown>> | null, id), tarif: t.name, intervall: t.intervall,
        credits_verbraucht: ((buchungen.data ?? []) as Array<Record<string, unknown>>).filter((b) => b["mandant_id"] === id && b["richtung"] === "verbrauch").reduce((s, b) => s + Number(b["menge"] ?? 0), 0),
        credits_verfuegbar: konto.filter((k) => !k["gueltig_bis"] || (k["gueltig_bis"] as string) >= new Date().toISOString()).reduce((s, k) => s + Number(k["menge"] ?? 0) - Number(k["verbraucht"] ?? 0) - Number(k["reserviert"] ?? 0), 0),
        letzte_aktivitaet: (letzte?.["erstellt_am"] as string | null) ?? null,
        integrationen: zaehle(integrationen.data as Array<Record<string, unknown>> | null, id), jobs_fehler: zaehle(jobsFehler.data as Array<Record<string, unknown>> | null, id),
      };
    }),
    tarife: ((tarife.data ?? []) as Array<Record<string, unknown>>).map((t) => ({ schluessel: t["schluessel"] as string, name: t["name"] as string, preis_monat_netto: Number(t["preis_monat_netto"]), preis_jahr_netto: Number(t["preis_jahr_netto"]), enthaltene_benutzer: Number(t["enthaltene_benutzer"]), credits_monat: Number(t["credits_monat"]), aktiv: Boolean(t["aktiv"]) })),
    preise: ((preise.data ?? []) as Array<Record<string, unknown>>).map((p) => ({ schluessel: p["schluessel"] as string, bezeichnung: p["bezeichnung"] as string, art: p["art"] as string, netto: Number(p["netto"]), credits: p["credits"] == null ? null : Number(p["credits"]), aktiv: Boolean(p["aktiv"]) })),
    creditPreise: ((creditPreise.data ?? []) as Array<Record<string, unknown>>).map((c) => ({ aktion: c["aktion"] as string, bezeichnung: c["bezeichnung"] as string, credits: Number(c["credits"]) })),
    einstellungen: ((einstellungen.data ?? []) as Array<Record<string, unknown>>).map((e) => ({ schluessel: e["schluessel"] as string, wert: e["wert"], beschreibung: (e["beschreibung"] as string | null) ?? null, geaendert_am: e["geaendert_am"] as string })),
    jobs: (jobs.data ?? []) as PlattformDaten["jobs"],
    rueckrufe: (rueckrufe.data ?? []) as PlattformDaten["rueckrufe"],
    stripe: (stripe.data ?? []) as PlattformDaten["stripe"],
    support: (support.data ?? []) as PlattformDaten["support"],
    audit: (audit.data ?? []) as PlattformDaten["audit"],
    kosten: {
      monat,
      api_cent: ((buchungen.data ?? []) as Array<Record<string, unknown>>).reduce((s, b) => s + Number(b["kosten_cent"] ?? 0), 0),
      umsatz_netto: ((mandanten.data ?? []) as Array<Record<string, unknown>>).filter((m) => m["abo_status"] === "aktiv").reduce((s, m) => s + tarifVon(m["id"] as string).netto, 0),
    },
  };
  return (
    <>
      <Seitenkopf titel="Plattform" beschreibung="Betreiberbereich: Mandanten, Tarife, Credits, Limits, Jobs, Support, Audit, Systemzustand. Es werden ausschließlich Metadaten gezeigt — Inhalte der Mandanten bleiben verschlossen (Supportzugriff nur nach Freigabe, protokolliert)." />
      <Hinweis ton="info" className="mb-4">Jede Aktion hier wird im Audit-Log des betroffenen Mandanten protokolliert. Preise und Credit-Werte gelten sofort für neue Buchungen und Aufträge.</Hinweis>
      <PlattformAnsicht {...daten} />
    </>
  );
}
