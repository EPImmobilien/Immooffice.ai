import type { Metadata } from "next";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
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

export default async function CreditsSeite() {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const [guthaben, chargen, buchungen, tarife] = await Promise.all([
    supabase.rpc("credits_verfuegbar"),
    supabase
      .from("credit_konto")
      .select("id, herkunft, menge, verbraucht, reserviert, gueltig_bis")
      .order("gueltig_bis", { ascending: true, nullsFirst: false }),
    supabase
      .from("credit_buchungen")
      .select("id, richtung, aktion, menge, bemerkung, erstellt_am")
      .order("erstellt_am", { ascending: false })
      .limit(25),
    supabase.from("tarife").select("*").order("reihenfolge"),
  ]);

  const credits = typeof guthaben.data === "number" ? guthaben.data : 0;

  return (
    <>
      <Seitenkopf
        titel="Abo und Credits"
        beschreibung={`${sitzung.mandantName} · Testphase bis ${datum(sitzung.testphaseBis)}`}
      />

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
              {(chargen.data ?? []).length === 0 && (
                <p className="text-[13px] text-gedaempft">Noch kein Guthaben gebucht.</p>
              )}
            </div>
          </KarteInhalt>
        </Karte>

        <Karte className="lg:col-span-2">
          <KarteKopf>
            <KarteTitel>Buchungen</KarteTitel>
          </KarteKopf>
          <KarteInhalt>
            {(buchungen.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-gedaempft">
                Noch keine Buchungen vorhanden.
              </p>
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
            <p className="mt-4 text-[12px] text-gedaempft">
              Das Ledger ist unveränderbar. Jede Buchung bleibt dauerhaft nachvollziehbar.
            </p>
          </KarteInhalt>
        </Karte>
      </div>

      <h2 className="mt-8 mb-3 text-[12px] font-semibold tracking-wide text-gedaempft uppercase">
        Tarife
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {(tarife.data ?? []).map((t) => (
          <Karte key={t.id}>
            <KarteInhalt>
              <div className="flex items-center justify-between">
                <p className="font-titel text-[15px] font-semibold">{t.name}</p>
                {sitzung.aboStatus === "test" && <Marke ton="neutral">nicht gebucht</Marke>}
              </div>
              <p className="zahl mt-3 font-titel text-2xl font-semibold">
                {Number(t.preis_monat_netto).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
              </p>
              <p className="text-[12px] text-gedaempft">monatlich, netto zzgl. USt.</p>
              <ul className="mt-4 space-y-1 text-[13px] text-gedaempft">
                <li>{t.enthaltene_benutzer} {t.enthaltene_benutzer === 1 ? "Benutzer" : "Benutzer"}</li>
                <li className="zahl">{t.credits_monat.toLocaleString("de-DE")} Credits monatlich</li>
                <li className="zahl">
                  {Number(t.preis_jahr_netto).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} jährlich
                </li>
              </ul>
            </KarteInhalt>
          </Karte>
        ))}
      </div>

      <Hinweis ton="info" className="mt-5">
        Die Buchung eines Tarifs über Stripe folgt im weiteren Verlauf von Phase 1.
        Vor dem Livebetrieb der Abrechnung steht Gate B.
      </Hinweis>
    </>
  );
}
