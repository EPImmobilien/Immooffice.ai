"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum, euro } from "@/lib/format";
import { MWST_SAETZE, nettoAusBrutto, RECHNUNG_MAIL_VORLAGEN, RECHNUNG_STATUS, rechnungMail, summen, type Kunde, type Position, type Rechnung, type RechnungMailVorlage } from "@/lib/rechnungen";
import { rechnungBezahlt, rechnungLoeschen, rechnungNotiz, rechnungSpeichern, rechnungStellen, rechnungStornieren, type RechnungErgebnis } from "@/server/rechnungen-aktionen";

/**
 * Rechnung bearbeiten (Kachel 14 der Referenz): Empfaenger, Daten, Positionen
 * mit Netto/Brutto-Umrechnung, Summen je Steuersatz. Nach dem Stellen ist
 * alles schreibgeschuetzt — es bleiben Storno, Zahlungseingang, Notiz, PDF
 * und der Versand ueber das Postfach.
 */

export interface AbsenderKurz { id: string; name: string; typ: string; kleinunternehmer: boolean; standard_mwst: number; aktiv: boolean }
export interface ObjektKurz { id: string; objektnummer: string; bezeichnung: string }
export interface VertragKurz { id: string; titel: string }
type PositionEntwurf = Pick<Position, "beschreibung" | "menge" | "einheit" | "einzelpreis_netto" | "mwst_satz">;

const TON: Record<Rechnung["status"], "neutral" | "warnung" | "erfolg" | "info"> = { entwurf: "neutral", gestellt: "warnung", bezahlt: "erfolg", storniert: "info" };

function zahl(w: string): number {
  const t = w.trim();
  if (t === "") return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}
function de(n: number, stellen = 2): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

export function RechnungFormular({ rechnung, positionen: start, absender, kunden, objekte, vertraege, bezuege, heute, mailAbsender, mailFirma, darfAendern, darfFreigeben }: {
  rechnung: Rechnung;
  positionen: Position[];
  absender: AbsenderKurz[];
  kunden: Kunde[];
  objekte: ObjektKurz[];
  vertraege: VertragKurz[];
  bezuege: { stornoVon: { id: string; nummer: string | null } | null; storniertDurch: { id: string; nummer: string | null } | null };
  heute: string;
  mailAbsender: string;
  mailFirma: string;
  darfAendern: boolean;
  darfFreigeben: boolean;
}) {
  const r = rechnung;
  const gesperrt = r.status !== "entwurf" || !darfAendern;
  const [felder, setFelder] = useState({
    absender_id: r.absender_id ?? "", kunde_id: r.kunde_id ?? "", objekt_id: r.objekt_id ?? "", vertrag_id: r.vertrag_id ?? "",
    empfaenger_anrede: r.empfaenger_anrede ?? "", empfaenger_name: r.empfaenger_name, empfaenger_zusatz: r.empfaenger_zusatz ?? "", empfaenger_strasse: r.empfaenger_strasse ?? "", empfaenger_plz: r.empfaenger_plz ?? "", empfaenger_ort: r.empfaenger_ort ?? "", empfaenger_land: r.empfaenger_land, empfaenger_email: r.empfaenger_email ?? "", empfaenger_ust_id: r.empfaenger_ust_id ?? "",
    ausstellungsdatum: r.ausstellungsdatum, leistung_von: r.leistung_von ?? "", leistung_bis: r.leistung_bis ?? "", zahlungsziel_tage: String(r.zahlungsziel_tage), einleitung: r.einleitung ?? "", schluss: r.schluss ?? "",
  });
  const [pos, setPos] = useState<PositionEntwurf[]>(start.map((p) => ({ beschreibung: p.beschreibung, menge: p.menge, einheit: p.einheit, einzelpreis_netto: p.einzelpreis_netto, mwst_satz: p.mwst_satz })));
  const [mailVorlage, setMailVorlage] = useState<RechnungMailVorlage>("standard");
  const [speichern, speichernAktion, speichert] = useActionState<RechnungErgebnis, FormData>(rechnungSpeichern, {});
  const [stellen, stellenAktion, stellt] = useActionState<RechnungErgebnis, FormData>(rechnungStellen, {});
  const [storno, stornoAktion, storniert] = useActionState<RechnungErgebnis, FormData>(rechnungStornieren, {});
  const [bezahlt, bezahltAktion, bucht] = useActionState<RechnungErgebnis, FormData>(rechnungBezahlt, {});
  const [notiz, notizAktion, notiert] = useActionState<RechnungErgebnis, FormData>(rechnungNotiz, {});

  const setzen = (k: keyof typeof felder, v: string) => setFelder((alt) => ({ ...alt, [k]: v }));
  const aktuellerAbsender = absender.find((a) => a.id === felder.absender_id) ?? null;
  const s = summen(pos);
  const kundeWaehlen = (id: string) => {
    const k = kunden.find((x) => x.id === id);
    setFelder((alt) => ({ ...alt, kunde_id: id, ...(k ? { empfaenger_anrede: k.anrede ?? "", empfaenger_name: k.name, empfaenger_zusatz: k.zusatz ?? "", empfaenger_strasse: k.strasse ?? "", empfaenger_plz: k.plz ?? "", empfaenger_ort: k.ort ?? "", empfaenger_land: k.land, empfaenger_email: k.email ?? "", empfaenger_ust_id: k.ust_id ?? "" } : {}) }));
  };
  const posSetzen = (i: number, p: Partial<PositionEntwurf>) => setPos((alt) => alt.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const mail = rechnungMail(mailVorlage, r, mailAbsender, mailFirma);
  const mailLink = `/postfach?${new URLSearchParams({ neu: "1", an: felder.empfaenger_email, betreff: mail.betreff, text: mail.text, anhang_art: "rechnung", anhang_id: r.id }).toString()}`;
  const faellig = r.faellig_am ?? null;
  const ueberfaellig = r.status === "gestellt" && faellig !== null && faellig < heute;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Marke ton={TON[r.status]}>{RECHNUNG_STATUS[r.status]}</Marke>
        {r.typ === "storno" && <Marke ton="info">Storno-Rechnung</Marke>}
        {r.ist_test && <Marke ton="warnung">Testrechnung — zählt nicht im Nummernkreis</Marke>}
        {ueberfaellig && <Marke ton="fehler">Überfällig seit {datum(faellig)}</Marke>}
        {bezuege.stornoVon && <Link href={`/rechnungen/${bezuege.stornoVon.id}`} className="text-[13px] text-akzent hover:underline">Storno zu {bezuege.stornoVon.nummer ?? "Rechnung"}</Link>}
        {bezuege.storniertDurch && <Link href={`/rechnungen/${bezuege.storniertDurch.id}`} className="text-[13px] text-akzent hover:underline">Storniert durch {bezuege.storniertDurch.nummer ?? "Storno-Rechnung"}</Link>}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={`/api/dokumente/rechnung/${r.id}?format=pdf`} target="_blank" rel="noreferrer" className={buttonKlassen({ variante: "sekundaer" })}>PDF{r.status === "entwurf" ? "-Vorschau" : ""}</a>
        {r.status === "entwurf" && <a href={`/api/dokumente/rechnung/${r.id}?format=docx`} className={buttonKlassen({ variante: "sekundaer" })}>Word</a>}
        {r.status !== "entwurf" && (
          <>
            <Auswahl aria-label="Mailvorlage" value={mailVorlage} onChange={(e) => setMailVorlage(e.target.value as RechnungMailVorlage)} className="w-auto">
              {(Object.keys(RECHNUNG_MAIL_VORLAGEN) as RechnungMailVorlage[]).map((k) => <option key={k} value={k}>{RECHNUNG_MAIL_VORLAGEN[k].bezeichnung}</option>)}
            </Auswahl>
            <Link href={mailLink} className={buttonKlassen({ variante: "leise" })}>Per E-Mail senden</Link>
          </>
        )}
      </div>

      {(speichern.fehler || stellen.fehler || storno.fehler || bezahlt.fehler) && <Hinweis ton="fehler">{speichern.fehler ?? stellen.fehler ?? storno.fehler ?? bezahlt.fehler}</Hinweis>}
      {(speichern.erfolg || stellen.erfolg || bezahlt.erfolg) && <Hinweis ton="erfolg">{stellen.erfolg ?? bezahlt.erfolg ?? speichern.erfolg}</Hinweis>}

      <form action={speichernAktion} className="space-y-5">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="positionen" value={JSON.stringify(pos)} />
        {(["absender_id", "kunde_id", "objekt_id", "vertrag_id"] as const).map((k) => <input key={k} type="hidden" name={k} value={felder[k]} />)}

        <div className="grid gap-5 lg:grid-cols-2">
          <Karte>
            <KarteKopf><KarteTitel>Absender und Bezug</KarteTitel><KarteBeschreibung>Der Absender bestimmt Nummernkreis, Bankverbindung und Steuerangaben.</KarteBeschreibung></KarteKopf>
            <KarteInhalt className="grid gap-3">
              <Feld id="re-absender" beschriftung="Rechnungsabsender" pflicht>
                <Auswahl value={felder.absender_id} disabled={gesperrt} onChange={(e) => setzen("absender_id", e.target.value)}>
                  <option value="">— wählen —</option>
                  {absender.filter((a) => a.aktiv || a.id === felder.absender_id).map((a) => <option key={a.id} value={a.id}>{a.name}{a.typ === "persoenlich" ? " (persönlich)" : ""}</option>)}
                </Auswahl>
              </Feld>
              {aktuellerAbsender?.kleinunternehmer && <Hinweis>Kleinunternehmer nach § 19 UStG — Positionen ohne Umsatzsteuer.</Hinweis>}
              <Feld id="re-objekt" beschriftung="Objekt">
                <Auswahl value={felder.objekt_id} disabled={gesperrt} onChange={(e) => setzen("objekt_id", e.target.value)}>
                  <option value="">— ohne —</option>
                  {objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}
                </Auswahl>
              </Feld>
              <Feld id="re-vertrag" beschriftung="Vertrag">
                <Auswahl value={felder.vertrag_id} disabled={gesperrt} onChange={(e) => setzen("vertrag_id", e.target.value)}>
                  <option value="">— ohne —</option>
                  {vertraege.map((v) => <option key={v.id} value={v.id}>{v.titel}</option>)}
                </Auswahl>
              </Feld>
            </KarteInhalt>
          </Karte>

          <Karte>
            <KarteKopf><KarteTitel>Empfänger</KarteTitel><KarteBeschreibung>Aus dem Kundenstamm übernehmen oder frei eintragen — die Anschrift wird mit der Rechnung eingefroren.</KarteBeschreibung></KarteKopf>
            <KarteInhalt className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-4">
                <Feld id="re-kunde" beschriftung="Kunde">
                  <Auswahl value={felder.kunde_id} disabled={gesperrt} onChange={(e) => kundeWaehlen(e.target.value)}>
                    <option value="">— frei eintragen —</option>
                    {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}{k.ort ? `, ${k.ort}` : ""}</option>)}
                  </Auswahl>
                </Feld>
              </div>
              <Feld id="re-anrede" beschriftung="Anrede"><Auswahl name="empfaenger_anrede" value={felder.empfaenger_anrede} disabled={gesperrt} onChange={(e) => setzen("empfaenger_anrede", e.target.value)}><option value="">—</option><option value="Frau">Frau</option><option value="Herr">Herr</option><option value="Firma">Firma</option></Auswahl></Feld>
              <div className="sm:col-span-3"><Feld id="re-name" beschriftung="Name / Firma" pflicht><Eingabe name="empfaenger_name" value={felder.empfaenger_name} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_name", e.target.value)} /></Feld></div>
              <div className="sm:col-span-4"><Feld id="re-zusatz" beschriftung="Zusatz (z. B. Ansprechpartner, Abteilung)"><Eingabe name="empfaenger_zusatz" value={felder.empfaenger_zusatz} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_zusatz", e.target.value)} /></Feld></div>
              <div className="sm:col-span-4"><Feld id="re-strasse" beschriftung="Straße, Hausnummer"><Eingabe name="empfaenger_strasse" value={felder.empfaenger_strasse} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_strasse", e.target.value)} /></Feld></div>
              <Feld id="re-plz" beschriftung="PLZ"><Eingabe name="empfaenger_plz" value={felder.empfaenger_plz} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_plz", e.target.value)} /></Feld>
              <div className="sm:col-span-2"><Feld id="re-ort" beschriftung="Ort"><Eingabe name="empfaenger_ort" value={felder.empfaenger_ort} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_ort", e.target.value)} /></Feld></div>
              <Feld id="re-land" beschriftung="Land"><Eingabe name="empfaenger_land" value={felder.empfaenger_land} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_land", e.target.value)} /></Feld>
              <div className="sm:col-span-2"><Feld id="re-email" beschriftung="E-Mail" hinweis="Für den Versand aus dem Postfach"><Eingabe name="empfaenger_email" type="email" value={felder.empfaenger_email} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_email", e.target.value)} /></Feld></div>
              <div className="sm:col-span-2"><Feld id="re-ustid" beschriftung="USt-IdNr. des Empfängers"><Eingabe name="empfaenger_ust_id" value={felder.empfaenger_ust_id} readOnly={gesperrt} onChange={(e) => setzen("empfaenger_ust_id", e.target.value)} /></Feld></div>
            </KarteInhalt>
          </Karte>
        </div>

        <Karte>
          <KarteKopf><KarteTitel>Rechnungsdaten</KarteTitel></KarteKopf>
          <KarteInhalt className="grid gap-3 sm:grid-cols-4">
            <Feld id="re-datum" beschriftung="Rechnungsdatum" pflicht><Eingabe name="ausstellungsdatum" type="date" value={felder.ausstellungsdatum} readOnly={gesperrt} onChange={(e) => setzen("ausstellungsdatum", e.target.value)} /></Feld>
            <Feld id="re-lvon" beschriftung="Leistung von"><Eingabe name="leistung_von" type="date" value={felder.leistung_von} readOnly={gesperrt} onChange={(e) => setzen("leistung_von", e.target.value)} /></Feld>
            <Feld id="re-lbis" beschriftung="Leistung bis"><Eingabe name="leistung_bis" type="date" value={felder.leistung_bis} readOnly={gesperrt} onChange={(e) => setzen("leistung_bis", e.target.value)} /></Feld>
            <Feld id="re-ziel" beschriftung="Zahlungsziel (Tage)" hinweis={r.faellig_am ? `Fällig am ${datum(r.faellig_am)}` : "0 = sofort fällig"}><Eingabe name="zahlungsziel_tage" inputMode="numeric" value={felder.zahlungsziel_tage} readOnly={gesperrt} onChange={(e) => setzen("zahlungsziel_tage", e.target.value)} /></Feld>
            <div className="sm:col-span-2"><Feld id="re-einleitung" beschriftung="Einleitung" hinweis="Leer = Standardtext des Absenders"><Textfeld name="einleitung" rows={3} value={felder.einleitung} readOnly={gesperrt} onChange={(e) => setzen("einleitung", e.target.value)} /></Feld></div>
            <div className="sm:col-span-2"><Feld id="re-schluss" beschriftung="Schlusstext" hinweis="Leer = Standardtext des Absenders"><Textfeld name="schluss" rows={3} value={felder.schluss} readOnly={gesperrt} onChange={(e) => setzen("schluss", e.target.value)} /></Feld></div>
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Positionen</KarteTitel><KarteBeschreibung>Einzelpreise netto. Über „Brutto“ rechnet die Position aus einem Bruttobetrag zurück.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead><tr className="text-left text-gedaempft"><th className="w-8 py-1 pr-2 font-medium">#</th><th className="py-1 pr-2 font-medium">Beschreibung</th><th className="w-20 py-1 pr-2 font-medium">Menge</th><th className="w-24 py-1 pr-2 font-medium">Einheit</th><th className="w-32 py-1 pr-2 font-medium">Einzelpreis netto</th><th className="w-20 py-1 pr-2 font-medium">USt</th><th className="w-32 py-1 pr-2 font-medium">Brutto</th><th className="w-28 py-1 text-right font-medium">Netto</th><th className="w-10"></th></tr></thead>
                <tbody>
                  {pos.map((p, i) => (
                    <tr key={i} className="border-t border-linie align-top">
                      <td className="py-2 pr-2 text-gedaempft">{i + 1}</td>
                      <td className="py-2 pr-2"><Textfeld aria-label={`Beschreibung Position ${i + 1}`} rows={2} value={p.beschreibung} readOnly={gesperrt} onChange={(e) => posSetzen(i, { beschreibung: e.target.value })} /></td>
                      <td className="py-2 pr-2"><Eingabe aria-label={`Menge Position ${i + 1}`} inputMode="decimal" defaultValue={de(p.menge, 0)} readOnly={gesperrt} onBlur={(e) => posSetzen(i, { menge: zahl(e.target.value) || 1 })} /></td>
                      <td className="py-2 pr-2"><Eingabe aria-label={`Einheit Position ${i + 1}`} value={p.einheit ?? ""} readOnly={gesperrt} placeholder="pauschal" onChange={(e) => posSetzen(i, { einheit: e.target.value || null })} /></td>
                      <td className="py-2 pr-2"><Eingabe aria-label={`Einzelpreis Position ${i + 1}`} inputMode="decimal" key={`n-${i}-${p.einzelpreis_netto}`} defaultValue={de(p.einzelpreis_netto)} readOnly={gesperrt} onBlur={(e) => posSetzen(i, { einzelpreis_netto: Math.round(zahl(e.target.value) * 100) / 100 })} /></td>
                      <td className="py-2 pr-2">
                        <Auswahl aria-label={`Steuersatz Position ${i + 1}`} value={String(p.mwst_satz)} disabled={gesperrt || Boolean(aktuellerAbsender?.kleinunternehmer)} onChange={(e) => posSetzen(i, { mwst_satz: Number(e.target.value) })}>
                          {MWST_SAETZE.map((m) => <option key={m} value={m}>{m} %</option>)}
                        </Auswahl>
                      </td>
                      <td className="py-2 pr-2"><Eingabe aria-label={`Bruttobetrag Position ${i + 1}`} inputMode="decimal" key={`b-${i}-${p.einzelpreis_netto}`} defaultValue={de(Math.round(p.einzelpreis_netto * (1 + p.mwst_satz / 100) * 100) / 100)} readOnly={gesperrt} onBlur={(e) => { const b = zahl(e.target.value); if (b > 0 || e.target.value.trim() !== "") posSetzen(i, { einzelpreis_netto: nettoAusBrutto(b, p.mwst_satz) }); }} /></td>
                      <td className="py-2 text-right tabular-nums">{euro(Math.round(p.menge * p.einzelpreis_netto * 100) / 100, true)}</td>
                      <td className="py-2 text-right">{!gesperrt && <button type="button" aria-label={`Position ${i + 1} entfernen`} onClick={() => setPos((alt) => alt.filter((_, j) => j !== i))} className="text-gedaempft hover:text-fehler">✕</button>}</td>
                    </tr>
                  ))}
                  {pos.length === 0 && <tr><td colSpan={9} className="py-4 text-center text-gedaempft">Noch keine Positionen.</td></tr>}
                </tbody>
              </table>
            </div>
            {!gesperrt && <Button type="button" variante="sekundaer" onClick={() => setPos((alt) => [...alt, { beschreibung: "", menge: 1, einheit: null, einzelpreis_netto: 0, mwst_satz: aktuellerAbsender?.kleinunternehmer ? 0 : (aktuellerAbsender?.standard_mwst ?? 19) }])}>Position hinzufügen</Button>}
            <div className="ml-auto w-full max-w-xs space-y-1 text-[13px]">
              <div className="flex justify-between"><span className="text-gedaempft">Netto</span><span className="tabular-nums">{euro(s.netto, true)}</span></div>
              {s.jeSatz.filter((z) => z.satz > 0).map((z) => <div key={z.satz} className="flex justify-between"><span className="text-gedaempft">USt {z.satz} %</span><span className="tabular-nums">{euro(z.mwst, true)}</span></div>)}
              <div className="flex justify-between border-t border-linie pt-1 font-semibold"><span>Brutto</span><span className="tabular-nums">{euro(s.brutto, true)}</span></div>
            </div>
          </KarteInhalt>
        </Karte>

        {!gesperrt && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={speichert}>{speichert ? "Speichert …" : "Entwurf speichern"}</Button>
            <span className="text-[12px] text-gedaempft">Erst speichern, dann stellen — beim Stellen wird die Nummer vergeben und die Rechnung festgeschrieben.</span>
          </div>
        )}
      </form>

      {r.status === "entwurf" && darfFreigeben && (
        <Karte>
          <KarteKopf><KarteTitel>Rechnung stellen</KarteTitel><KarteBeschreibung>Vergibt die nächste fortlaufende Nummer, friert Inhalt und Absender ein und legt das PDF ab (GoBD). Danach ist nur noch ein Storno möglich.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            <form action={stellenAktion}><input type="hidden" name="id" value={r.id} /><Button type="submit" disabled={stellt}>{stellt ? "Stellt …" : r.ist_test ? "Testrechnung stellen" : "Rechnung stellen"}</Button></form>
          </KarteInhalt>
        </Karte>
      )}

      {r.status === "gestellt" && darfAendern && (
        <Karte>
          <KarteKopf><KarteTitel>Zahlungseingang</KarteTitel></KarteKopf>
          <KarteInhalt>
            <form action={bezahltAktion} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={r.id} />
              <Feld id="re-bez-am" beschriftung="Bezahlt am"><Eingabe name="bezahlt_am" type="date" defaultValue={heute} /></Feld>
              <Feld id="re-bez-betrag" beschriftung="Betrag" hinweis={`Leer = ${euro(r.brutto, true)}`}><Eingabe name="bezahlt_betrag" inputMode="decimal" placeholder={de(r.brutto)} /></Feld>
              <Button type="submit" disabled={bucht}>{bucht ? "Bucht …" : "Als bezahlt vermerken"}</Button>
            </form>
          </KarteInhalt>
        </Karte>
      )}
      {r.status === "bezahlt" && <Hinweis ton="erfolg">Bezahlt am {datum(r.bezahlt_am)}{r.bezahlt_betrag !== null ? ` — ${euro(r.bezahlt_betrag, true)}` : ""}.</Hinweis>}

      {(r.status === "gestellt" || r.status === "bezahlt") && r.typ === "rechnung" && darfFreigeben && (
        <Karte>
          <KarteKopf><KarteTitel>Stornieren</KarteTitel><KarteBeschreibung>Erzeugt eine Storno-Rechnung mit eigener Nummer und negativen Positionen; die Originalrechnung bleibt unverändert erhalten.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            <form action={stornoAktion} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={r.id} />
              <Feld id="re-storno-grund" beschriftung="Stornogrund" pflicht><Eingabe name="grund" required placeholder="z. B. falscher Betrag" /></Feld>
              <Button type="submit" variante="sekundaer" disabled={storniert}>{storniert ? "Storniert …" : "Storno-Rechnung erzeugen"}</Button>
            </form>
          </KarteInhalt>
        </Karte>
      )}

      {r.status !== "entwurf" && (
        <Karte>
          <KarteKopf><KarteTitel>Interne Notiz</KarteTitel></KarteKopf>
          <KarteInhalt>
            <form action={notizAktion} className="space-y-2">
              <input type="hidden" name="id" value={r.id} />
              {notiz.erfolg && <Hinweis ton="erfolg">{notiz.erfolg}</Hinweis>}
              <Textfeld name="notiz" rows={2} defaultValue={r.notiz ?? ""} aria-label="Interne Notiz" readOnly={!darfAendern} />
              {darfAendern && <Button type="submit" variante="sekundaer" disabled={notiert}>Notiz speichern</Button>}
            </form>
          </KarteInhalt>
        </Karte>
      )}

      {(r.status === "entwurf" || r.ist_test) && darfAendern && (
        <form action={rechnungLoeschen} className="pt-2">
          <input type="hidden" name="id" value={r.id} />
          <Button type="submit" variante="leise">{r.ist_test && r.status !== "entwurf" ? "Testrechnung löschen" : "Entwurf löschen"}</Button>
        </form>
      )}
    </div>
  );
}
