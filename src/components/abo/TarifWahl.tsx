"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { abrechnungsportalOeffnen, paketKaufen, tarifBuchen, type AboErgebnis } from "@/server/abo-aktionen";

export interface TarifZeile {
  schluessel: string;
  name: string;
  preis_monat_netto: number;
  preis_jahr_netto: number;
  enthaltene_benutzer: number;
  credits_monat: number;
  buchbar: boolean;
}

export interface PreisZeile {
  schluessel: string;
  bezeichnung: string;
  art: "zusatznutzer" | "credit_paket";
  intervall: "monat" | "jahr" | null;
  netto: number;
  credits: number | null;
  buchbar: boolean;
}

const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/**
 * Tarif waehlen, Zusatzbenutzer, Credit-Pakete, Abrechnungsportal.
 *
 * Alle Preise netto zuzueglich Umsatzsteuer (S8). Die Buchung selbst laeuft
 * bei Stripe; hier wird nur gewaehlt und weitergeleitet. Ohne Stripe-Preis
 * bleibt eine Schaltflaeche gesperrt — mit Hinweis, nicht stumm.
 */
export function TarifWahl({
  tarife,
  preise,
  aktuellerTarif,
  aktuellesIntervall,
  hatKunde,
  stripeAktiv,
  testmodus,
}: {
  tarife: TarifZeile[];
  preise: PreisZeile[];
  aktuellerTarif: string | null;
  aktuellesIntervall: "monat" | "jahr" | null;
  hatKunde: boolean;
  stripeAktiv: boolean;
  testmodus: boolean;
}) {
  const [intervall, setIntervall] = useState<"monat" | "jahr">(aktuellesIntervall ?? "monat");
  const [zusatz, setZusatz] = useState(0);
  const [buchung, buchen, bucht] = useActionState<AboErgebnis, FormData>(tarifBuchen, {});
  const [paket, kaufen, kauft] = useActionState<AboErgebnis, FormData>(paketKaufen, {});
  const [portal, oeffnen, oeffnet] = useActionState<AboErgebnis, FormData>(async (v) => abrechnungsportalOeffnen(v), {});

  const zusatzPreis = preise.find((p) => p.art === "zusatznutzer" && p.intervall === intervall);
  const pakete = preise.filter((p) => p.art === "credit_paket");

  return (
    <div className="space-y-6">
      {!stripeAktiv && (
        <Hinweis ton="info">
          Die Abrechnung ist noch nicht freigeschaltet. Tarife und Preise sehen Sie
          bereits; buchen können Sie, sobald der Testmodus eingerichtet ist
          (docs/ANLEITUNG.md, Abschnitt 8).
        </Hinweis>
      )}
      {stripeAktiv && testmodus && (
        <Hinweis ton="warnung">
          Stripe läuft im <strong>Testmodus</strong>: Es wird nichts berechnet. Testkarte
          4242 4242 4242 4242, beliebiges Datum in der Zukunft, beliebige Prüfziffer.
        </Hinweis>
      )}
      {(buchung.fehler || paket.fehler || portal.fehler) && (
        <Hinweis ton="fehler">{buchung.fehler ?? paket.fehler ?? portal.fehler}</Hinweis>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <Feld beschriftung="Abrechnung" id="abo-intervall" hinweis="Jährlich = zehn Monatsbeiträge, zwei Monate geschenkt">
          <Auswahl value={intervall} onChange={(e) => setIntervall(e.target.value === "jahr" ? "jahr" : "monat")}>
            <option value="monat">Monatlich</option>
            <option value="jahr">Jährlich</option>
          </Auswahl>
        </Feld>
        <Feld
          beschriftung="Zusätzliche Benutzer"
          id="abo-zusatz"
          hinweis={zusatzPreis ? `${euro(zusatzPreis.netto)} je Benutzer und ${intervall === "jahr" ? "Jahr" : "Monat"}` : "Preis folgt"}
        >
          <Eingabe type="number" min={0} max={50} value={zusatz} onChange={(e) => setZusatz(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} className="zahl w-28" />
        </Feld>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tarife.map((t) => {
          const preis = intervall === "jahr" ? t.preis_jahr_netto : t.preis_monat_netto;
          const aktuell = aktuellerTarif === t.schluessel;
          return (
            <form key={t.schluessel} action={buchen} className="flex flex-col rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
              <input type="hidden" name="tarif" value={t.schluessel} />
              <input type="hidden" name="intervall" value={intervall} />
              <input type="hidden" name="zusatznutzer" value={zusatz} />
              <div className="flex items-center justify-between">
                <p className="font-titel text-[15px] font-semibold text-text">{t.name}</p>
                {aktuell && <Marke ton="erfolg">Ihr Tarif</Marke>}
              </div>
              <p className="zahl mt-3 font-titel text-2xl font-semibold text-text">{euro(preis)}</p>
              <p className="text-[12px] text-gedaempft">{intervall === "jahr" ? "jährlich" : "monatlich"}, netto zzgl. USt.</p>
              <ul className="mt-4 flex-1 space-y-1 text-[13px] text-gedaempft">
                <li>{t.enthaltene_benutzer} Benutzer enthalten</li>
                <li className="zahl">{t.credits_monat.toLocaleString("de-DE")} Credits monatlich</li>
                {zusatz > 0 && zusatzPreis && (
                  <li className="zahl">+ {zusatz} × {euro(zusatzPreis.netto)} Zusatzbenutzer</li>
                )}
              </ul>
              <Button type="submit" className="mt-5" laedt={bucht} disabled={!stripeAktiv || !t.buchbar || aktuell} variante={aktuell ? "sekundaer" : "primaer"}>
                {aktuell ? "Gebucht" : hatKunde ? "Wechseln" : "Buchen"}
              </Button>
              {!t.buchbar && stripeAktiv && <p className="mt-2 text-[11px] text-gedaempft">Preis bei Stripe noch nicht hinterlegt.</p>}
            </form>
          );
        })}
      </div>

      {hatKunde && (
        <form action={oeffnen} className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-linie p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text">Zahlungsmittel, Rechnungen, Tarifwechsel, Kündigung</p>
            <p className="text-[12px] text-gedaempft">Im Abrechnungsportal von Stripe — Rechnungen mit ausgewiesener Umsatzsteuer, Kündigung zum Ende des Abrechnungszeitraums.</p>
          </div>
          <Button type="submit" variante="sekundaer" laedt={oeffnet} disabled={!stripeAktiv}>
            Abrechnungsportal öffnen
          </Button>
        </form>
      )}

      <div>
        <p className="mb-2 text-[12px] font-semibold tracking-wide text-gedaempft uppercase">Credit-Pakete</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {pakete.map((p) => (
            <form key={p.schluessel} action={kaufen} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-linie bg-flaeche p-4">
              <input type="hidden" name="paket" value={p.schluessel} />
              <div>
                <p className="zahl text-[15px] font-semibold text-text">{(p.credits ?? 0).toLocaleString("de-DE")} Credits</p>
                <p className="text-[12px] text-gedaempft">{euro(p.netto)} netto · 12 Monate gültig</p>
              </div>
              <Button type="submit" variante="sekundaer" groesse="klein" laedt={kauft} disabled={!stripeAktiv || !p.buchbar}>
                Kaufen
              </Button>
            </form>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-gedaempft">
        Alle Preise netto zuzüglich gesetzlicher Umsatzsteuer; Angebot ausschließlich
        für Unternehmer. Rechnungen stellt Stripe im Namen von ImmoOffice.ai aus.
        Kostenlos bleiben PDF-Export, Web-Exposé ohne neue KI-Erstellung, manuelle
        Bearbeitung und erneute Downloads.
      </p>
    </div>
  );
}
