"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { zeitpunkt } from "@/lib/format";
import { ANFRAGE_QUELLEN, ANFRAGE_STATUS, bewertungVorschlag, type AnfrageStatus, type AnfrageZeile, type Antwortvorlage } from "@/lib/vermietung/anfragen";
import { nachrichtSenden, type PostfachErgebnis } from "@/server/postfach-aktionen";
import { anfrageAlsKontakt, anfrageAntwortEntwerfen, anfrageAntwortVermerken, anfrageLoeschen, anfrageSpeichern, mietvertragAnlegen, type VermietungErgebnis } from "@/server/vermietung-aktionen";

interface Props {
  anfrage: AnfrageZeile & { objekt_ref: { id: string; objektnummer: string; bezeichnung: string; titel: string | null; kaltmiete: number | null } | null };
  objekte: { id: string; objektnummer: string; bezeichnung: string; kaltmiete: number | null }[];
  vorlagen: Antwortvorlage[];
  postfaecher: { id: string; adresse: string; anzeigename: string | null }[];
  darfAendern: boolean;
  darfVertrag: boolean;
  darfSenden: boolean;
}

function JaNein({ name, wert, disabled }: { name: string; wert: boolean | null; disabled: boolean }) {
  return (
    <Auswahl name={name} defaultValue={wert === null ? "" : wert ? "ja" : "nein"} disabled={disabled}>
      <option value="">keine Angabe</option><option value="ja">ja</option><option value="nein">nein</option>
    </Auswahl>
  );
}

/** Eine Mietanfrage: Angaben, Bewertung, Status, Antworten aus Vorlagen, Mietvertrag. */
export function AnfrageDetail({ anfrage: a, objekte, vorlagen, postfaecher, darfAendern, darfVertrag, darfSenden }: Props) {
  const [speichern, speichernAktion, speichert] = useActionState<VermietungErgebnis, FormData>(anfrageSpeichern, {});
  const [kontakt, kontaktAktion, verknuepft] = useActionState<VermietungErgebnis, FormData>(anfrageAlsKontakt, {});
  const [entwurf, entwurfAktion, entwirft] = useActionState<VermietungErgebnis, FormData>(anfrageAntwortEntwerfen, {});
  const [vermerk, vermerkAktion, vermerkt] = useActionState<VermietungErgebnis, FormData>(anfrageAntwortVermerken, {});
  const [versand, versandAktion, sendet] = useActionState<PostfachErgebnis, FormData>(nachrichtSenden, {});
  const [vertrag, vertragAktion, legtAn] = useActionState<VermietungErgebnis, FormData>(mietvertragAnlegen, {});
  const [vorlage, setVorlage] = useState(vorlagen[0]?.schluessel ?? "eingang");
  const [termin, setTermin] = useState(a.besichtigung_am ? a.besichtigung_am.slice(0, 16) : "");
  const [objektId, setObjektId] = useState(a.objekt_id ?? "");
  const kaltmiete = objekte.find((o) => o.id === objektId)?.kaltmiete ?? a.objekt_ref?.kaltmiete ?? null;
  const vorschlag = bewertungVorschlag(a, kaltmiete);
  const gewaehlteVorlage = vorlagen.find((v) => v.schluessel === vorlage);
  const gesperrt = !darfAendern;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <Karte>
          <KarteKopf>
            <KarteTitel>Angaben</KarteTitel>
            <KarteBeschreibung>{ANFRAGE_QUELLEN[a.quelle]} · eingegangen {zeitpunkt(a.eingegangen_am)}{a.email_eingang?.betreff ? ` · E-Mail „${a.email_eingang.betreff}“` : ""}</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={speichernAktion} className="grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="id" value={a.id} />
              <Feld id="a-anrede" beschriftung="Anrede"><Auswahl name="anrede" defaultValue={a.anrede ?? ""} disabled={gesperrt}><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option><option value="Familie">Familie</option><option value="Eheleute">Eheleute</option></Auswahl></Feld>
              <div className="sm:col-span-2"><Feld id="a-vorname" beschriftung="Vorname"><Eingabe name="vorname" defaultValue={a.vorname ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="a-nachname" beschriftung="Nachname" pflicht><Eingabe name="nachname" defaultValue={a.nachname} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="a-email" beschriftung="E-Mail"><Eingabe name="email" type="email" defaultValue={a.email ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="a-telefon" beschriftung="Telefon"><Eingabe name="telefon" defaultValue={a.telefon ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-4"><Feld id="a-objekt" beschriftung="Mietobjekt"><Auswahl name="objekt_id" value={objektId} onChange={(e) => setObjektId(e.target.value)} disabled={gesperrt}><option value="">— ohne —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl></Feld></div>
              <div className="sm:col-span-2"><Feld id="a-status" beschriftung="Status"><Auswahl name="status" defaultValue={a.status} disabled={gesperrt}>{(Object.keys(ANFRAGE_STATUS) as AnfrageStatus[]).map((s) => <option key={s} value={s}>{ANFRAGE_STATUS[s]}</option>)}</Auswahl></Feld></div>
              <Feld id="a-personen" beschriftung="Personen"><Eingabe name="personen_anzahl" type="number" min={1} max={20} defaultValue={a.personen_anzahl ?? ""} disabled={gesperrt} /></Feld>
              <div className="sm:col-span-2"><Feld id="a-einzug" beschriftung="Einzug ab"><Eingabe name="einzug_ab" type="date" defaultValue={a.einzug_ab ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="a-besichtigung" beschriftung="Besichtigung am"><Eingabe name="besichtigung_am" type="datetime-local" defaultValue={a.besichtigung_am ? a.besichtigung_am.slice(0, 16) : ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="a-beruf" beschriftung="Beruf"><Eingabe name="beruf" defaultValue={a.beruf ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-3"><Feld id="a-arbeitgeber" beschriftung="Arbeitgeber"><Eingabe name="arbeitgeber" defaultValue={a.arbeitgeber ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-2"><Feld id="a-einkommen" beschriftung="Nettoeinkommen (€/Monat)"><Eingabe name="einkommen_netto" inputMode="decimal" defaultValue={a.einkommen_netto ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-2"><Feld id="a-schufa" beschriftung="Bonitätsauskunft"><JaNein name="schufa_vorhanden" wert={a.schufa_vorhanden} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-2"><Feld id="a-kaution" beschriftung="Kaution möglich"><JaNein name="kann_kaution_leisten" wert={a.kann_kaution_leisten} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-2"><Feld id="a-haustiere" beschriftung="Haustiere"><Eingabe name="haustiere" defaultValue={a.haustiere ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-2"><Feld id="a-raucher" beschriftung="Raucher"><JaNein name="raucher" wert={a.raucher} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-2"><Feld id="a-seit" beschriftung="Mietverhältnis seit"><Eingabe name="mietverhaeltnis_seit" defaultValue={a.mietverhaeltnis_seit ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-6"><Feld id="a-vermieter" beschriftung="Derzeitiger Vermieter"><Eingabe name="derzeitiger_vermieter" defaultValue={a.derzeitiger_vermieter ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-6"><Feld id="a-mitteilung" beschriftung="Mitteilung des Interessenten"><Textfeld name="mitteilung" rows={4} defaultValue={a.mitteilung ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-4"><Feld id="a-notizen" beschriftung="Interne Notizen"><Textfeld name="notizen" rows={3} defaultValue={a.notizen ?? ""} disabled={gesperrt} /></Feld></div>
              <div className="sm:col-span-2">
                <Feld id="a-bewertung" beschriftung="Bewertung (1–5)" hinweis={`Vorschlag: ${vorschlag.punkte} — ${vorschlag.gruende.join("; ")}`}>
                  <Eingabe name="bewertung" type="number" min={1} max={5} defaultValue={a.bewertung ?? vorschlag.punkte} disabled={gesperrt} />
                </Feld>
                <label className="mt-2 flex items-center gap-2 text-[13px] text-text"><input type="checkbox" name="angaben_bestaetigt" value="1" defaultChecked={a.angaben_bestaetigt} disabled={gesperrt} /> Angaben bestätigt</label>
              </div>
              {speichern.fehler && <Hinweis ton="fehler" className="sm:col-span-6">{speichern.fehler}</Hinweis>}
              {speichern.erfolg && <Hinweis ton="erfolg" className="sm:col-span-6">{speichern.erfolg}</Hinweis>}
              {!gesperrt && <div className="sm:col-span-6 flex flex-wrap gap-2"><Button type="submit" laedt={speichert}>Speichern</Button></div>}
            </form>
          </KarteInhalt>
        </Karte>

        {a.antwort_verlauf.length > 0 && (
          <Karte>
            <KarteKopf><KarteTitel>Bisherige Antworten</KarteTitel></KarteKopf>
            <KarteInhalt>
              <ul className="divide-y divide-linie text-[13px]">
                {a.antwort_verlauf.map((v, i) => <li key={i} className="py-2"><span className="text-text">{v.betreff}</span> <span className="text-gedaempft">· {zeitpunkt(v.zeitpunkt)} · {v.weg}</span></li>)}
              </ul>
            </KarteInhalt>
          </Karte>
        )}
      </div>

      <div className="space-y-5">
        <Karte>
          <KarteKopf><KarteTitel>Antworten</KarteTitel><KarteBeschreibung>Vorlage wählen, Text prüfen, über das Postfach senden oder im E-Mail-Programm öffnen. Der Status folgt der Vorlage.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="space-y-3">
            <form action={entwurfAktion} className="space-y-2">
              <input type="hidden" name="id" value={a.id} />
              <Feld id="ant-vorlage" beschriftung="Vorlage"><Auswahl name="vorlage" value={vorlage} onChange={(e) => setVorlage(e.target.value)}>{vorlagen.map((v) => <option key={v.schluessel} value={v.schluessel}>{v.bezeichnung}</option>)}</Auswahl></Feld>
              {gewaehlteVorlage?.mit_termin && <Feld id="ant-termin" beschriftung="Termin"><Eingabe name="termin" type="datetime-local" value={termin} onChange={(e) => setTermin(e.target.value)} /></Feld>}
              <Button type="submit" variante="sekundaer" groesse="klein" laedt={entwirft}>Text erzeugen</Button>
              {entwurf.fehler && <Hinweis ton="fehler">{entwurf.fehler}</Hinweis>}
            </form>
            {entwurf.text && (
              <div className="space-y-2">
                {darfSenden && postfaecher.length > 0 ? (
                  <form action={versandAktion} className="space-y-2">
                    <input type="hidden" name="an" value={a.email ?? ""} />
                    <Feld id="ant-postfach" beschriftung="Senden über"><Auswahl name="postfach_id" defaultValue={postfaecher[0]?.id}>{postfaecher.map((p) => <option key={p.id} value={p.id}>{p.anzeigename ? `${p.anzeigename} — ${p.adresse}` : p.adresse}</option>)}</Auswahl></Feld>
                    <Feld id="ant-betreff" beschriftung="Betreff"><Eingabe name="betreff" defaultValue={entwurf.betreff} /></Feld>
                    <Feld id="ant-text" beschriftung="Text"><Textfeld name="text" rows={10} defaultValue={entwurf.text} /></Feld>
                    {versand.fehler && <Hinweis ton="fehler">{versand.fehler}</Hinweis>}
                    {versand.erfolg && <Hinweis ton="erfolg">{versand.erfolg}</Hinweis>}
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" laedt={sendet} disabled={!a.email}>Über Postfach senden</Button>
                      <a href={`mailto:${encodeURIComponent(a.email ?? "")}?subject=${encodeURIComponent(entwurf.betreff ?? "")}&body=${encodeURIComponent(entwurf.text)}`} className={buttonKlassen({ variante: "sekundaer" })}>E-Mail-Programm</a>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[13px] font-medium text-text">Betreff: {entwurf.betreff}</p>
                    <pre className="whitespace-pre-wrap rounded-[var(--radius)] border border-linie bg-flaeche p-3 text-[13px] text-text">{entwurf.text}</pre>
                    <a href={`mailto:${encodeURIComponent(a.email ?? "")}?subject=${encodeURIComponent(entwurf.betreff ?? "")}&body=${encodeURIComponent(entwurf.text)}`} className={buttonKlassen({ variante: "sekundaer" })}>Im E-Mail-Programm öffnen</a>
                  </div>
                )}
                {darfAendern && (
                  <form action={vermerkAktion} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="vorlage" value={vorlage} />
                    <input type="hidden" name="betreff" value={entwurf.betreff ?? ""} />
                    <input type="hidden" name="termin" value={termin} />
                    <input type="hidden" name="weg" value={darfSenden && postfaecher.length > 0 ? "postfach" : "mailto"} />
                    <Button type="submit" variante="leise" groesse="klein" laedt={vermerkt}>Als gesendet vermerken</Button>
                    {vermerk.erfolg && <Marke ton="erfolg">{vermerk.erfolg}</Marke>}
                    {vermerk.fehler && <Marke ton="fehler">{vermerk.fehler}</Marke>}
                  </form>
                )}
              </div>
            )}
            {!a.email && <p className="text-[12px] text-gedaempft">Ohne E-Mail-Adresse ist nur das Kopieren des Textes möglich.</p>}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Weiter</KarteTitel></KarteKopf>
          <KarteInhalt className="space-y-3">
            {a.kontakt_id ? (
              <Link href={`/kontakte/${a.kontakt_id}`} className={buttonKlassen({ variante: "sekundaer", groesse: "klein" })}>Zum Kontakt</Link>
            ) : darfAendern ? (
              <form action={kontaktAktion}>
                <input type="hidden" name="id" value={a.id} />
                <Button type="submit" variante="sekundaer" groesse="klein" laedt={verknuepft}>Als Kontakt anlegen</Button>
                {kontakt.erfolg && <Marke ton="erfolg" className="ml-2">{kontakt.erfolg}</Marke>}
                {kontakt.fehler && <Marke ton="fehler" className="ml-2">{kontakt.fehler}</Marke>}
              </form>
            ) : null}
            {darfVertrag && (
              <form action={vertragAktion}>
                <input type="hidden" name="mietanfrage_id" value={a.id} />
                <input type="hidden" name="objekt_id" value={objektId} />
                <Button type="submit" groesse="klein" laedt={legtAn}>Mietvertrag erstellen</Button>
                {vertrag.fehler && <Marke ton="fehler" className="ml-2">{vertrag.fehler}</Marke>}
              </form>
            )}
            {darfAendern && (
              <form action={anfrageLoeschen} onSubmit={(e) => { if (!window.confirm("Diese Anfrage löschen? Die Angaben des Interessenten werden entfernt.")) e.preventDefault(); }}>
                <input type="hidden" name="id" value={a.id} />
                <Button type="submit" variante="gefahr" groesse="klein">Anfrage löschen</Button>
              </form>
            )}
            <p className="text-[12px] text-gedaempft">Angaben aus der Selbstauskunft sind personenbezogen. Nach Absage oder Vermietung löschen — spätestens nach sechs Monaten.</p>
          </KarteInhalt>
        </Karte>
      </div>
    </div>
  );
}
