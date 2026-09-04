"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { DOKUMENTARTEN } from "@/lib/dokumente";
import { zeitpunkt } from "@/lib/format";
import {
  anhangUebernehmen,
  antwortEntwerfen,
  nachrichtGelesen,
  nachrichtSenden,
  nachrichtZuordnen,
  type PostfachErgebnis,
} from "@/server/postfach-aktionen";
import { nachrichtAlsLead, type AkquiseErgebnis } from "@/server/akquise-aktionen";
import { aufgabeAusNachricht, terminAusNachricht, type ArbeitsErgebnis } from "@/server/arbeitsmittel-aktionen";
import { nachrichtAlsAnfrage, type VermietungErgebnis } from "@/server/vermietung-aktionen";

import {
  adresseAnzeigen,
  kontaktName,
  type AnhangZeile,
  type KontaktKurz,
  type NachrichtDetailZeile,
  type ObjektKurz,
  type PostfachZeile,
} from "./typen";

interface Props {
  nachricht: NachrichtDetailZeile;
  anhaenge: AnhangZeile[];
  objekt: ObjektKurz | null;
  kontakt: KontaktKurz | null;
  vorschlag: ObjektKurz | null;
  objekte: ObjektKurz[];
  kontakte: KontaktKurz[];
  postfaecher: PostfachZeile[];
  darfSenden: boolean;
  darfAendern: boolean;
  kiVerfuegbar: boolean;
}

function antwortBetreff(betreff: string | null): string {
  const b = (betreff ?? "").trim();
  return /^(re|aw):/i.test(b) ? b : `Re: ${b}`;
}

/**
 * Eine Nachricht: Kopf, Zuordnung, Text, Anhaenge, Antwort. Keine Ordner,
 * keine Regeln — das bleibt beim Anbieter (P3).
 */
export function NachrichtDetail({ nachricht, anhaenge, objekt, kontakt, vorschlag, objekte, kontakte, postfaecher, darfSenden, darfAendern, kiVerfuegbar }: Props) {
  const [zuordnung, zuordnen, ordnetZu] = useActionState<PostfachErgebnis, FormData>(nachrichtZuordnen, {});
  const [versand, senden, sendet] = useActionState<PostfachErgebnis, FormData>(nachrichtSenden, {});
  const [entwurf, entwerfen, entwirft] = useActionState<PostfachErgebnis, FormData>(antwortEntwerfen, {});
  const [anfrage, alsAnfrage, uebernimmt] = useActionState<VermietungErgebnis, FormData>(nachrichtAlsAnfrage, {});
  const [lead, alsLead, uebernimmtLead] = useActionState<AkquiseErgebnis, FormData>(nachrichtAlsLead, {});
  const [aufgabe, alsAufgabe, uebernimmtAufgabe] = useActionState<ArbeitsErgebnis, FormData>(aufgabeAusNachricht, {});
  const [antwortOffen, setAntwortOffen] = useState(false);
  // Ein neuer Entwurf oeffnet die Antwort und ersetzt den Text (Textarea wird per key neu aufgebaut).
  const antwortSichtbar = antwortOffen || Boolean(entwurf.entwurf);

  // Beim Oeffnen als gelesen markieren — serverseitig, damit die Liste stimmt.
  useEffect(() => {
    if (nachricht.gelesen || !darfAendern) return;
    const fd = new FormData();
    fd.set("nachricht_id", nachricht.id);
    fd.set("gelesen", "1");
    void nachrichtGelesen(fd);
  }, [nachricht.id, nachricht.gelesen, darfAendern]);

  const sendbar = postfaecher.filter((p) => p.status !== "getrennt");
  const eingang = nachricht.ordner === "eingang";

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-titel text-[17px] font-semibold text-text">{nachricht.betreff ?? "(ohne Betreff)"}</h2>
          <div className="flex gap-1">
            {eingang ? <Marke ton="info">Eingang</Marke> : <Marke>Gesendet</Marke>}
            {nachricht.zuordnung_art === "automatisch" && <Marke ton="akzent">automatisch zugeordnet</Marke>}
          </div>
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
          <dt className="text-gedaempft">Von</dt>
          <dd className="text-text">{nachricht.von_adresse ? adresseAnzeigen({ adresse: nachricht.von_adresse, name: nachricht.von_name }) : "—"}</dd>
          <dt className="text-gedaempft">An</dt>
          <dd className="text-text">{nachricht.an.map(adresseAnzeigen).join(", ") || "—"}</dd>
          {nachricht.cc.length > 0 && (
            <>
              <dt className="text-gedaempft">Kopie</dt>
              <dd className="text-text">{nachricht.cc.map(adresseAnzeigen).join(", ")}</dd>
            </>
          )}
          <dt className="text-gedaempft">Datum</dt>
          <dd className="text-text">{zeitpunkt(nachricht.gesendet_am)}</dd>
        </dl>
        {darfAendern && (
          <div className="flex flex-wrap items-center gap-2">
            <form action={nachrichtGelesen}>
              <input type="hidden" name="nachricht_id" value={nachricht.id} />
              <input type="hidden" name="gelesen" value={nachricht.gelesen ? "0" : "1"} />
              <Button type="submit" variante="leise" groesse="klein">
                {nachricht.gelesen ? "Als ungelesen markieren" : "Als gelesen markieren"}
              </Button>
            </form>
            {nachricht.ordner === "eingang" && (
              <form action={alsAnfrage}>
                <input type="hidden" name="nachricht_id" value={nachricht.id} />
                <Button type="submit" variante="leise" groesse="klein" laedt={uebernimmt}>Als Mietanfrage übernehmen</Button>
              </form>
            )}
            {nachricht.ordner === "eingang" && (
              <form action={alsLead}>
                <input type="hidden" name="nachricht_id" value={nachricht.id} />
                <Button type="submit" variante="leise" groesse="klein" laedt={uebernimmtLead}>Als Akquise-Lead übernehmen</Button>
              </form>
            )}
            {nachricht.ordner === "eingang" && (
              <form action={alsAufgabe}>
                <input type="hidden" name="nachricht_id" value={nachricht.id} />
                <Button type="submit" variante="leise" groesse="klein" laedt={uebernimmtAufgabe}>Als Aufgabe übernehmen</Button>
              </form>
            )}
            {nachricht.ordner === "eingang" && (
              <form action={terminAusNachricht} onSubmit={(e) => { const m = window.getSelection()?.toString().trim() ?? ""; (e.currentTarget.elements.namedItem("markiert") as HTMLInputElement).value = m; }}>
                <input type="hidden" name="nachricht_id" value={nachricht.id} />
                <input type="hidden" name="markiert" value="" />
                <Button type="submit" variante="leise" groesse="klein" title="Datum und Uhrzeit werden aus der markierten Textstelle oder dem ganzen Text erkannt">Als Termin übernehmen</Button>
              </form>
            )}
            {aufgabe.fehler && <span className="text-[12px] text-fehler">{aufgabe.fehler}</span>}
            {aufgabe.erfolg && aufgabe.id && (
              <Link href={`/aufgaben/${aufgabe.id}`} className="text-[12px] text-akzent hover:underline">{aufgabe.erfolg} Zur Aufgabe</Link>
            )}
            {lead.fehler && <span className="text-[12px] text-fehler">{lead.fehler}</span>}
            {lead.erfolg && lead.id && (
              <Link href={`/akquise/leads/${lead.id}`} className="text-[12px] text-akzent hover:underline">{lead.erfolg} Zum Lead</Link>
            )}
            {anfrage.fehler && <span className="text-[12px] text-fehler">{anfrage.fehler}</span>}
            {anfrage.erfolg && anfrage.id && (
              <Link href={`/vermietung/anfragen/${anfrage.id}`} className="text-[12px] text-akzent hover:underline">{anfrage.erfolg} Zur Anfrage</Link>
            )}
          </div>
        )}
      </header>

      <section className="rounded-[var(--radius)] border border-linie bg-flaeche-gedaempft p-3">
        <h3 className="text-[13px] font-semibold text-text">Zuordnung</h3>
        <p className="mt-1 text-[13px] text-text">
          Objekt:{" "}
          {objekt ? (
            <Link href={`/objekte/${objekt.id}`} className="text-akzent hover:underline">
              {objekt.objektnummer} · {objekt.bezeichnung}
            </Link>
          ) : (
            <span className="text-gedaempft">keins</span>
          )}
          {" · "}Kontakt:{" "}
          {kontakt ? (
            <Link href={`/kontakte/${kontakt.id}`} className="text-akzent hover:underline">
              {kontaktName(kontakt)}
            </Link>
          ) : (
            <span className="text-gedaempft">keiner</span>
          )}
        </p>
        {!objekt && vorschlag && darfAendern && (
          <form action={zuordnen} className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <input type="hidden" name="nachricht_id" value={nachricht.id} />
            <input type="hidden" name="objekt_id" value={vorschlag.id} />
            <input type="hidden" name="kontakt_id" value={kontakt?.id ?? ""} />
            <span>
              Vorschlag: <strong>{vorschlag.objektnummer} · {vorschlag.bezeichnung}</strong>
              {nachricht.objekt_vorschlag_konfidenz !== null && ` (${nachricht.objekt_vorschlag_konfidenz} %`}
              {nachricht.objekt_vorschlag_grund ? `, ${nachricht.objekt_vorschlag_grund})` : nachricht.objekt_vorschlag_konfidenz !== null ? ")" : ""}
            </span>
            <Button type="submit" groesse="klein" variante="sekundaer" disabled={ordnetZu}>Übernehmen</Button>
          </form>
        )}
        {darfAendern && (
          <form action={zuordnen} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="nachricht_id" value={nachricht.id} />
            <Feld beschriftung="Objekt" id={`z-objekt-${nachricht.id}`}>
              <Auswahl name="objekt_id" defaultValue={objekt?.id ?? ""}>
                <option value="">— kein Objekt —</option>
                {objekte.map((o) => (
                  <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>
                ))}
              </Auswahl>
            </Feld>
            <Feld beschriftung="Kontakt" id={`z-kontakt-${nachricht.id}`}>
              <Auswahl name="kontakt_id" defaultValue={kontakt?.id ?? ""}>
                <option value="">— kein Kontakt —</option>
                {kontakte.map((k) => (
                  <option key={k.id} value={k.id}>{kontaktName(k)}{k.email ? ` (${k.email})` : ""}</option>
                ))}
              </Auswahl>
            </Feld>
            <Button type="submit" variante="sekundaer" disabled={ordnetZu}>Zuordnen</Button>
          </form>
        )}
        {zuordnung.fehler && <Hinweis ton="fehler" className="mt-2">{zuordnung.fehler}</Hinweis>}
        {zuordnung.erfolg && <Hinweis ton="erfolg" className="mt-2">{zuordnung.erfolg}</Hinweis>}
      </section>

      <section>
        {nachricht.inhalt_entfernt_am ? (
          <Hinweis>Der Inhalt wurde nach Ablauf der Aufbewahrungsfrist entfernt; Betreff, Datum und Zuordnung bleiben erhalten.</Hinweis>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-text">{nachricht.text ?? ""}</pre>
        )}
      </section>

      {anhaenge.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-text">Anhänge</h3>
          <ul className="space-y-2">
            {anhaenge.map((a) => (
              <AnhangZeileAnsicht key={a.id} anhang={a} objekte={objekte} vorgabeObjekt={objekt?.id ?? ""} darfAendern={darfAendern} />
            ))}
          </ul>
        </section>
      )}

      {eingang && darfSenden && sendbar.length > 0 && (
        <section className="space-y-3 rounded-[var(--radius)] border border-linie p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-text">Antworten</h3>
            {!antwortSichtbar && (
              <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setAntwortOffen(true)}>Antwort schreiben</Button>
            )}
          </div>

          <form action={entwerfen} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="nachricht_id" value={nachricht.id} />
            <div className="min-w-[240px] flex-1">
              <Feld beschriftung="Stichpunkte für den Entwurf" id={`e-stich-${nachricht.id}`} hinweis={kiVerfuegbar ? "KI-Entwurf — kostet Credits, wird gekennzeichnet und bleibt editierbar." : "Ohne KI-Zugang entsteht ein höflicher Rahmen aus Ihren Stichpunkten."}>
                <Eingabe name="stichpunkte" maxLength={1000} placeholder="z. B. Besichtigung Samstag 11 Uhr anbieten, Exposé anhängen" />
              </Feld>
            </div>
            <Button type="submit" variante="sekundaer" disabled={entwirft}>{entwirft ? "Entwurf entsteht …" : "Entwurf erstellen"}</Button>
          </form>
          {entwurf.fehler && <Hinweis ton="fehler">{entwurf.fehler}</Hinweis>}
          {entwurf.entwurf && (
            <p className="text-[12px] text-gedaempft">
              {entwurf.kiVerwendet ? <Marke ton="akzent">KI-Entwurf — bitte prüfen</Marke> : <Marke>Entwurf ohne KI</Marke>}
              {" "}{entwurf.quelle}{entwurf.credits ? ` · ${entwurf.credits} Credits` : ""}
            </p>
          )}

          {antwortSichtbar && (
            <form action={senden} className="space-y-3">
              <input type="hidden" name="antwort_auf" value={nachricht.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Feld beschriftung="Über Postfach" id={`a-pf-${nachricht.id}`}>
                  <Auswahl name="postfach_id" defaultValue={sendbar.some((p) => p.id === nachricht.postfach_id) ? nachricht.postfach_id : sendbar[0]?.id}>
                    {sendbar.map((p) => (
                      <option key={p.id} value={p.id}>{p.anzeigename ? `${p.anzeigename} <${p.adresse}>` : p.adresse}</option>
                    ))}
                  </Auswahl>
                </Feld>
                <Feld beschriftung="An" id={`a-an-${nachricht.id}`} pflicht>
                  <Eingabe name="an" defaultValue={nachricht.von_adresse ?? ""} required />
                </Feld>
              </div>
              <Feld beschriftung="Kopie (optional)" id={`a-cc-${nachricht.id}`}>
                <Eingabe name="cc" placeholder="mehrere Adressen mit Komma" />
              </Feld>
              <Feld beschriftung="Betreff" id={`a-betreff-${nachricht.id}`} pflicht>
                <Eingabe name="betreff" defaultValue={antwortBetreff(nachricht.betreff)} required maxLength={500} />
              </Feld>
              <Feld beschriftung="Text" id={`a-text-${nachricht.id}`} pflicht>
                <Textfeld key={entwurf.entwurf ?? "leer"} name="text" rows={10} defaultValue={entwurf.entwurf ?? ""} required />
              </Feld>
              {versand.fehler && <Hinweis ton="fehler">{versand.fehler}</Hinweis>}
              {versand.erfolg && <Hinweis ton="erfolg">{versand.erfolg}</Hinweis>}
              <div className="flex gap-2">
                <Button type="submit" disabled={sendet}>{sendet ? "Wird gesendet …" : "Senden"}</Button>
                <Button type="button" variante="leise" onClick={() => setAntwortOffen(false)}>Abbrechen</Button>
              </div>
            </form>
          )}
        </section>
      )}
    </article>
  );
}

function AnhangZeileAnsicht({ anhang, objekte, vorgabeObjekt, darfAendern }: { anhang: AnhangZeile; objekte: ObjektKurz[]; vorgabeObjekt: string; darfAendern: boolean }) {
  const [zustand, uebernehmen, laeuft] = useActionState<PostfachErgebnis, FormData>(anhangUebernehmen, {});
  const groesse = anhang.bytes ? `${Math.max(1, Math.round(anhang.bytes / 1024))} KB` : "";
  return (
    <li className="rounded-[var(--radius)] border border-linie p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="text-text">
          {anhang.dateiname} <span className="text-gedaempft">{[anhang.mime, groesse].filter(Boolean).join(" · ")}</span>
        </span>
        {anhang.dokument_id && <Marke ton="erfolg">in den Unterlagen</Marke>}
      </div>
      {!anhang.dokument_id && darfAendern && (
        <form action={uebernehmen} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <input type="hidden" name="anhang_id" value={anhang.id} />
          <Feld beschriftung="Zum Objekt" id={`u-objekt-${anhang.id}`}>
            <Auswahl name="objekt_id" defaultValue={vorgabeObjekt} required>
              <option value="">— Objekt wählen —</option>
              {objekte.map((o) => (
                <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>
              ))}
            </Auswahl>
          </Feld>
          <Feld beschriftung="Art" id={`u-art-${anhang.id}`}>
            <Auswahl name="art" defaultValue="sonstiges">
              {Object.entries(DOKUMENTARTEN).map(([wert, text]) => (
                <option key={wert} value={wert}>{text}</option>
              ))}
            </Auswahl>
          </Feld>
          <Button type="submit" variante="sekundaer" disabled={laeuft}>{laeuft ? "Übernimmt …" : "In Unterlagen übernehmen"}</Button>
        </form>
      )}
      {zustand.fehler && <Hinweis ton="fehler" className="mt-2">{zustand.fehler}</Hinweis>}
      {zustand.erfolg && <Hinweis ton="erfolg" className="mt-2">{zustand.erfolg}</Hinweis>}
    </li>
  );
}
