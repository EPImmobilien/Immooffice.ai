import type { Metadata } from "next";

import { TarifWahl, type PreisZeile, type TarifZeile } from "@/components/abo/TarifWahl";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { stripeClient, stripeIstTestmodus } from "@/lib/stripe/client";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Abo und Credits" };

const HERKUNFT: Record<string, string> = {
  inklusiv: "Monatskontingent",
  uebertrag: "Übertrag aus dem Vormonat",
  gekauft: "Zusatzpaket",
  test: "Testguthaben",
  gutschrift: "Gutschrift",
};

const RICHTUNG: Record<string, string> = {
  zubuchung: "Gutschrift",
  reservierung: "Reserviert",
  verbrauch: "Verbraucht",
  freigabe: "Freigegeben",
  erstattung: "Erstattet",
};

const ABO_STATUS: Record<string, { text: string; ton: "neutral" | "erfolg" | "warnung" | "fehler" }> = {
  test: { text: "Testphase", ton: "warnung" },
  aktiv: { text: "Aktiv", ton: "erfolg" },
  zahlung_offen: { text: "Zahlung offen", ton: "warnung" },
  gekuendigt: { text: "Gekündigt", ton: "neutral" },
  gesperrt: { text: "Gesperrt", ton: "fehler" },
};

/**
 * Abo und Credits (docs/AUTONOMIE.md Abschnitt 4).
 *
 * Der Abo-Zustand kommt aus der Datenbank, die ihn ausschliesslich ueber den
 * Stripe-Webhook erfaehrt. Diese Seite zeigt und leitet weiter — sie
 * entscheidet nichts.
 */
export default async function CreditsSeite({ searchParams }: { searchParams: Promise<{ buchung?: string }> }) {
  const [{ buchung }, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  const supabase = await serverClient();
  const darfBuchen = hatRecht(sitzung.rolle, "abrechnung", "aendern", sitzung.uebersteuerung);

  const [guthaben, chargen, buchungen, tarife, preise, abo, zustand] = await Promise.all([
    supabase.rpc("credits_verfuegbar"),
    supabase.from("credit_konto").select("id, herkunft, menge, verbraucht, reserviert, gueltig_bis").order("gueltig_bis", { ascending: true, nullsFirst: false }),
    supabase.from("credit_buchungen").select("id, richtung, aktion, menge, bemerkung, erstellt_am").order("erstellt_am", { ascending: false }).limit(25),
    supabase.from("tarife").select("schluessel, name, preis_monat_netto, preis_jahr_netto, enthaltene_benutzer, credits_monat, stripe_preis_monat, stripe_preis_jahr").eq("aktiv", true).order("reihenfolge"),
    supabase.from("preise").select("schluessel, bezeichnung, art, intervall, netto, credits, stripe_preis_id").order("reihenfolge"),
    supabase.from("abonnements").select("status, intervall, zusatznutzer, stripe_kunde_id, laufend_bis, gekuendigt_zum, zahlung_fehlgeschlagen_am, tarife(schluessel, name)").eq("mandant_id", sitzung.mandantId).maybeSingle(),
    supabase.rpc("mandant_zustand"),
  ]);

  const credits = typeof guthaben.data === "number" ? guthaben.data : 0;
  const aboZeile = abo.data as unknown as {
    status: string;
    intervall: "monat" | "jahr";
    zusatznutzer: number;
    stripe_kunde_id: string | null;
    laufend_bis: string | null;
    gekuendigt_zum: string | null;
    zahlung_fehlgeschlagen_am: string | null;
    tarife: { schluessel: string; name: string } | null;
  } | null;
  const z = (Array.isArray(zustand.data) ? zustand.data[0] : null) as {
    schreibbar: boolean;
    lesemodus_seit: string | null;
    loeschung_geplant_am: string | null;
    benutzer_limit: number;
  } | null;

  const status = ABO_STATUS[aboZeile?.status ?? sitzung.aboStatus] ?? ABO_STATUS["test"]!;
  const stripeAktiv = stripeClient() !== null;

  const tarifZeilen: TarifZeile[] = (tarife.data ?? []).map((t) => ({
    schluessel: t.schluessel as string,
    name: t.name as string,
    preis_monat_netto: Number(t.preis_monat_netto),
    preis_jahr_netto: Number(t.preis_jahr_netto),
    enthaltene_benutzer: t.enthaltene_benutzer as number,
    credits_monat: t.credits_monat as number,
    buchbar: Boolean(t.stripe_preis_monat && t.stripe_preis_jahr),
  }));
  const preisZeilen: PreisZeile[] = (preise.data ?? []).map((p) => ({
    schluessel: p.schluessel as string,
    bezeichnung: p.bezeichnung as string,
    art: p.art as PreisZeile["art"],
    intervall: (p.intervall as PreisZeile["intervall"]) ?? null,
    netto: Number(p.netto),
    credits: (p.credits as number | null) ?? null,
    buchbar: Boolean(p.stripe_preis_id),
  }));

  return (
    <>
      <Seitenkopf
        titel="Abo und Credits"
        beschreibung={
          aboZeile?.status === "aktiv" && aboZeile.tarife
            ? `${sitzung.mandantName} · ${aboZeile.tarife.name}, ${aboZeile.intervall === "jahr" ? "jährlich" : "monatlich"}${aboZeile.laufend_bis ? ` · läuft bis ${datum(aboZeile.laufend_bis)}` : ""}`
            : `${sitzung.mandantName} · Testphase bis ${datum(sitzung.testphaseBis)}`
        }
      >
        <Marke ton={status.ton}>{status.text}</Marke>
      </Seitenkopf>

      {buchung === "erfolg" && (
        <Hinweis ton="erfolg" className="mb-5" titel="Vielen Dank">
          Die Buchung ist bei Stripe abgeschlossen. Sobald die Bestätigung eintrifft
          — meist innerhalb weniger Sekunden — erscheint sie hier.
        </Hinweis>
      )}
      {buchung === "abgebrochen" && (
        <Hinweis ton="info" className="mb-5">Die Buchung wurde abgebrochen. Es wurde nichts berechnet.</Hinweis>
      )}
      {z && !z.schreibbar && (
        <Hinweis ton="warnung" className="mb-5" titel="Lesemodus">
          {z.lesemodus_seit ? "Die Testphase ist beendet. " : ""}
          Ansehen und Exportieren funktionieren weiterhin; Anlegen und Ändern erst wieder mit einem Tarif.
          {z.loeschung_geplant_am ? ` Ohne Tarif werden die Daten am ${datum(z.loeschung_geplant_am)} gelöscht.` : ""}
        </Hinweis>
      )}
      {aboZeile?.status === "zahlung_offen" && (
        <Hinweis ton="warnung" className="mb-5" titel="Zahlung offen">
          Die letzte Zahlung ist fehlgeschlagen. Bitte prüfen Sie das Zahlungsmittel im
          Abrechnungsportal — bis zur Klärung bleibt der Zugang nutzbar.
        </Hinweis>
      )}
      {aboZeile?.gekuendigt_zum && aboZeile.status === "aktiv" && (
        <Hinweis ton="info" className="mb-5">Das Abo ist gekündigt und endet am {datum(aboZeile.gekuendigt_zum)}.</Hinweis>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Karte className="lg:col-span-1">
          <KarteKopf><KarteTitel>Guthaben</KarteTitel></KarteKopf>
          <KarteInhalt>
            <p className="zahl font-titel text-4xl font-semibold text-text">{credits}</p>
            <p className="mt-1 text-[13px] text-gedaempft">verfügbare Credits</p>
            <div className="mt-5 space-y-2">
              {(chargen.data ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-linie pb-2 last:border-0">
                  <span className="text-[13px]">
                    {HERKUNFT[c.herkunft] ?? c.herkunft}
                    <span className="block text-[11px] text-gedaempft">
                      {c.gueltig_bis ? `gültig bis ${datum(c.gueltig_bis)}` : "unbefristet"}
                    </span>
                  </span>
                  <span className="zahl text-[13px] font-medium">
                    {c.menge - c.verbraucht - c.reserviert} / {c.menge}
                  </span>
                </div>
              ))}
              {(chargen.data ?? []).length === 0 && <p className="text-[13px] text-gedaempft">Noch kein Guthaben gebucht.</p>}
            </div>
            {z && (
              <p className="mt-4 text-[12px] text-gedaempft">
                Benutzerplätze: {z.benutzer_limit}
                {aboZeile && aboZeile.zusatznutzer > 0 ? ` (davon ${aboZeile.zusatznutzer} zusätzlich gebucht)` : ""}
              </p>
            )}
          </KarteInhalt>
        </Karte>

        <Karte className="lg:col-span-2">
          <KarteKopf><KarteTitel>Buchungen</KarteTitel></KarteKopf>
          <KarteInhalt>
            {(buchungen.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-gedaempft">Noch keine Buchungen vorhanden.</p>
            ) : (
              <ul className="divide-y divide-linie">
                {(buchungen.data ?? []).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        {RICHTUNG[b.richtung] ?? b.richtung}
                        {b.aktion ? ` · ${b.aktion}` : ""}
                      </span>
                      <span className="block text-[12px] text-gedaempft">
                        {datum(b.erstellt_am)}{b.bemerkung ? ` · ${b.bemerkung}` : ""}
                      </span>
                    </span>
                    <span className="zahl text-[13px] font-medium">
                      {["zubuchung", "freigabe", "erstattung"].includes(b.richtung) ? "+" : "−"}
                      {b.menge}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[12px] text-gedaempft">Das Ledger ist unveränderbar. Jede Buchung bleibt dauerhaft nachvollziehbar.</p>
          </KarteInhalt>
        </Karte>
      </div>

      <Karte className="mt-5">
        <KarteKopf>
          <KarteTitel>Tarif und Pakete</KarteTitel>
          <KarteBeschreibung>
            Sieben Tage kostenlos testen, danach ein Tarif Ihrer Wahl. Kein
            automatisches Berechnen ohne Ihre ausdrückliche Buchung.
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt>
          {darfBuchen ? (
            <TarifWahl
              tarife={tarifZeilen}
              preise={preisZeilen}
              aktuellerTarif={aboZeile?.status === "aktiv" || aboZeile?.status === "zahlung_offen" ? (aboZeile.tarife?.schluessel ?? null) : null}
              aktuellesIntervall={aboZeile?.intervall ?? null}
              hatKunde={Boolean(aboZeile?.stripe_kunde_id)}
              stripeAktiv={stripeAktiv}
              testmodus={stripeIstTestmodus()}
            />
          ) : (
            <p className="text-[13px] text-gedaempft">
              Tarif und Pakete bucht der Inhaber oder ein Zugang mit dem Recht „Abrechnung ändern“.
            </p>
          )}
        </KarteInhalt>
      </Karte>
    </>
  );
}
