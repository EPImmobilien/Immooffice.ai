"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis, KiKennzeichen, Marke } from "@/components/ui/Status";
import {
  fehlendeAngaben,
  RAUM_VORSCHLAEGE,
  rollen,
  SCHLUESSEL_ARTEN,
  SCHRITTE,
  TYPEN,
  ZAEHLER_ARTEN,
  ZUSTAENDE,
  type Protokoll,
  type Zaehler,
} from "@/lib/verkauf/uebergabe";
import { uebergabeAbschliessen, uebergabeLoeschen, uebergabeSpeichern, zaehlerFotoAuslesen, type VerkaufErgebnis } from "@/server/verkauf-aktionen";

import { Unterschriftsfeld } from "./Unterschriftsfeld";

function neueId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  id: string;
  start: Protokoll;
  status: "entwurf" | "abgeschlossen";
  darfAendern: boolean;
  darfFreigeben: boolean;
  kiVerfuegbar: boolean;
}

/** Uebergabeprotokoll in sieben Schritten (docs/FUNKTIONSABGLEICH.md V1). */
export function UebergabeAssistent({ id, start, status, darfAendern, darfFreigeben, kiVerfuegbar }: Props) {
  const [p, setP] = useState<Protokoll>(start);
  const [schritt, setSchritt] = useState<number>(1);
  const [speichern, speichernAktion, speichert] = useActionState<VerkaufErgebnis, FormData>(uebergabeSpeichern, {});
  const [abschluss, abschlussAktion, schliesst] = useActionState<VerkaufErgebnis, FormData>(uebergabeAbschliessen, {});
  const [foto, fotoAktion, liest] = useActionState<VerkaufErgebnis, FormData>(zaehlerFotoAuslesen, {});
  const [fotoUebernommen, setFotoUebernommen] = useState<string | null>(null);
  const [fotoZiel, setFotoZiel] = useState<string>("");
  const gesperrt = status === "abgeschlossen" || !darfAendern;
  const r = rollen(p);
  const fehlt = fehlendeAngaben(p);

  // Ergebnis der Fotoauslesung einmalig in den Zaehler uebernehmen
  if (foto.fotoPfad && fotoUebernommen !== foto.fotoPfad && fotoZiel) {
    setFotoUebernommen(foto.fotoPfad);
    const w = foto.werte ?? {};
    setP((alt) => ({
      ...alt,
      zaehler: alt.zaehler.map((z) => z.id === fotoZiel ? {
        ...z,
        foto_pfad: foto.fotoPfad ?? z.foto_pfad,
        nummer: w["zaehlernummer"] ?? z.nummer,
        stand: w["stand"] ?? z.stand,
        einheit: w["einheit"] ?? z.einheit,
        art: w["art"] && w["art"] in ZAEHLER_ARTEN ? (w["art"] as string) : z.art,
        ki_gelesen: Boolean(foto.kiVerwendet && (w["stand"] || w["zaehlernummer"])),
      } : z),
    }));
  }

  const setzen = (aend: Partial<Protokoll>) => setP((alt) => ({ ...alt, ...aend }));
  const zaehlerAendern = (zid: string, aend: Partial<Zaehler>) => setP((alt) => ({ ...alt, zaehler: alt.zaehler.map((z) => (z.id === zid ? { ...z, ...aend } : z)) }));

  function beteiligter(rolle: "uebergeber" | "uebernehmer", bezeichnung: string) {
    const b = p[rolle];
    return (
      <div className="grid gap-3 rounded-[var(--radius)] border border-linie p-3 sm:grid-cols-6">
        <div className="sm:col-span-6 flex items-center justify-between">
          <p className="text-[13px] font-medium text-text">{bezeichnung}</p>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={gesperrt} checked={b.anwesend} onChange={(e) => setzen({ [rolle]: { ...b, anwesend: e.target.checked } })} /> anwesend</label>
        </div>
        <div className="sm:col-span-3"><Feld id={`${rolle}-name`} beschriftung="Name" pflicht><Eingabe disabled={gesperrt} value={b.name} onChange={(e) => setzen({ [rolle]: { ...b, name: e.target.value } })} /></Feld></div>
        <div className="sm:col-span-3"><Feld id={`${rolle}-vertreter`} beschriftung="Vertreten durch (optional)"><Eingabe disabled={gesperrt} value={b.vertreter} onChange={(e) => setzen({ [rolle]: { ...b, vertreter: e.target.value } })} /></Feld></div>
        <div className="sm:col-span-3"><Feld id={`${rolle}-strasse`} beschriftung="Straße, Nr."><Eingabe disabled={gesperrt} value={b.strasse} onChange={(e) => setzen({ [rolle]: { ...b, strasse: e.target.value } })} /></Feld></div>
        <Feld id={`${rolle}-plz`} beschriftung="PLZ"><Eingabe disabled={gesperrt} value={b.plz} onChange={(e) => setzen({ [rolle]: { ...b, plz: e.target.value } })} /></Feld>
        <div className="sm:col-span-2"><Feld id={`${rolle}-ort`} beschriftung="Ort"><Eingabe disabled={gesperrt} value={b.ort} onChange={(e) => setzen({ [rolle]: { ...b, ort: e.target.value } })} /></Feld></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Schritte" className="flex flex-wrap gap-1.5">
        {SCHRITTE.map((s) => (
          <button key={s.nr} type="button" onClick={() => setSchritt(s.nr)} className={`rounded-[var(--radius)] border px-3 py-1.5 text-[12px] ${schritt === s.nr ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft hover:text-text"}`}>
            {s.nr}. {s.titel}
          </button>
        ))}
      </nav>

      {status === "abgeschlossen" && <Hinweis ton="erfolg">Dieses Protokoll ist abgeschlossen und unveränderlich.</Hinweis>}

      {schritt === 1 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><Feld id="u-bez" beschriftung="Bezeichnung" pflicht><Eingabe disabled={gesperrt} value={p.bezeichnung} onChange={(e) => setzen({ bezeichnung: e.target.value })} /></Feld></div>
            <Feld id="u-datum" beschriftung="Datum" pflicht><Eingabe type="date" disabled={gesperrt} value={p.datum ?? ""} onChange={(e) => setzen({ datum: e.target.value || null })} /></Feld>
            <Feld id="u-zeit" beschriftung="Uhrzeit"><Eingabe type="time" disabled={gesperrt} value={p.uhrzeit ?? ""} onChange={(e) => setzen({ uhrzeit: e.target.value || null })} /></Feld>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><Feld id="u-adresse" beschriftung="Objektadresse" pflicht><Eingabe disabled={gesperrt} value={p.objekt.adresse} onChange={(e) => setzen({ objekt: { ...p.objekt, adresse: e.target.value } })} /></Feld></div>
            <Feld id="u-etage" beschriftung="Etage"><Eingabe disabled={gesperrt} placeholder="z. B. 2. OG" value={p.objekt.etage} onChange={(e) => setzen({ objekt: { ...p.objekt, etage: e.target.value } })} /></Feld>
            <Feld id="u-lage" beschriftung="Lage"><Eingabe disabled={gesperrt} placeholder="links, rechts, Mitte" value={p.objekt.lage} onChange={(e) => setzen({ objekt: { ...p.objekt, lage: e.target.value } })} /></Feld>
          </div>
          {beteiligter("uebergeber", r.uebergeber)}
          {beteiligter("uebernehmer", r.uebernehmer)}
        </div>
      )}

      {schritt === 2 && (
        <div className="space-y-3">
          {p.schluessel.length === 0 && <p className="text-[13px] text-gedaempft">Noch kein Schlüssel erfasst.</p>}
          {p.schluessel.map((s) => (
            <div key={s.id} className="grid gap-3 rounded-[var(--radius)] border border-linie p-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Feld id={`s-art-${s.id}`} beschriftung="Art">
                <Auswahl disabled={gesperrt} value={s.art} onChange={(e) => setP((alt) => ({ ...alt, schluessel: alt.schluessel.map((x) => x.id === s.id ? { ...x, art: e.target.value } : x) }))}>
                  {Object.entries(SCHLUESSEL_ARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Auswahl>
              </Feld></div>
              <Feld id={`s-anz-${s.id}`} beschriftung="Anzahl"><Eingabe type="number" min={0} max={99} disabled={gesperrt} value={s.anzahl} onChange={(e) => setP((alt) => ({ ...alt, schluessel: alt.schluessel.map((x) => x.id === s.id ? { ...x, anzahl: Number(e.target.value) || 0 } : x) }))} /></Feld>
              <div className="sm:col-span-2"><Feld id={`s-bem-${s.id}`} beschriftung="Bemerkung"><Eingabe disabled={gesperrt} value={s.bemerkung} onChange={(e) => setP((alt) => ({ ...alt, schluessel: alt.schluessel.map((x) => x.id === s.id ? { ...x, bemerkung: e.target.value } : x) }))} /></Feld></div>
              {!gesperrt && <div className="flex items-end"><Button type="button" variante="leise" groesse="klein" onClick={() => setP((alt) => ({ ...alt, schluessel: alt.schluessel.filter((x) => x.id !== s.id) }))}>Entfernen</Button></div>}
            </div>
          ))}
          {!gesperrt && <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setP((alt) => ({ ...alt, schluessel: [...alt.schluessel, { id: neueId(), art: "haustuer", anzahl: 1, bemerkung: "" }] }))}>Schlüssel hinzufügen</Button>}
        </div>
      )}

      {schritt === 3 && (
        <div className="space-y-3">
          {p.zaehler.length === 0 && <p className="text-[13px] text-gedaempft">Noch kein Zähler erfasst.</p>}
          {p.zaehler.map((z) => (
            <div key={z.id} className="space-y-3 rounded-[var(--radius)] border border-linie p-3">
              <div className="grid gap-3 sm:grid-cols-5">
                <Feld id={`z-art-${z.id}`} beschriftung="Zähler">
                  <Auswahl disabled={gesperrt} value={z.art} onChange={(e) => zaehlerAendern(z.id, { art: e.target.value, einheit: ZAEHLER_ARTEN[e.target.value]?.einheit ?? z.einheit })}>
                    {Object.entries(ZAEHLER_ARTEN).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
                  </Auswahl>
                </Feld>
                <Feld id={`z-nr-${z.id}`} beschriftung="Zählernummer"><Eingabe disabled={gesperrt} value={z.nummer} onChange={(e) => zaehlerAendern(z.id, { nummer: e.target.value })} /></Feld>
                <Feld id={`z-stand-${z.id}`} beschriftung="Stand"><Eingabe disabled={gesperrt} inputMode="decimal" value={z.stand} onChange={(e) => zaehlerAendern(z.id, { stand: e.target.value, ki_gelesen: false })} /></Feld>
                <Feld id={`z-einheit-${z.id}`} beschriftung="Einheit"><Eingabe disabled={gesperrt} value={z.einheit} onChange={(e) => zaehlerAendern(z.id, { einheit: e.target.value })} /></Feld>
                <div className="flex items-end gap-2">
                  {z.ki_gelesen && <KiKennzeichen art="erzeugt" />}
                  {!gesperrt && <Button type="button" variante="leise" groesse="klein" onClick={() => setP((alt) => ({ ...alt, zaehler: alt.zaehler.filter((x) => x.id !== z.id) }))}>Entfernen</Button>}
                </div>
              </div>
              {!gesperrt && (
                <form action={fotoAktion} className="flex flex-wrap items-end gap-2" onSubmit={() => setFotoZiel(z.id)}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="mit_ki" value={kiVerfuegbar ? "1" : "0"} />
                  <Feld id={`z-foto-${z.id}`} beschriftung={`Foto${kiVerfuegbar ? " — Werte per KI auslesen (1 Credit)" : " ablegen"}`}>
                    <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" capture="environment" className="block text-[13px]" />
                  </Feld>
                  <Button type="submit" variante="sekundaer" groesse="klein" laedt={liest && fotoZiel === z.id}>{kiVerfuegbar ? "Foto + auslesen" : "Foto speichern"}</Button>
                  {z.foto_pfad && <span className="text-[12px] text-gedaempft">Foto abgelegt</span>}
                </form>
              )}
            </div>
          ))}
          {foto.fehler && <Hinweis ton="fehler">{foto.fehler}</Hinweis>}
          {foto.erfolg && <Hinweis ton={foto.kiVerwendet ? "info" : "warnung"}>{foto.erfolg}</Hinweis>}
          {!gesperrt && <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setP((alt) => ({ ...alt, zaehler: [...alt.zaehler, { id: neueId(), art: "strom", nummer: "", stand: "", einheit: "kWh", foto_pfad: null, ki_gelesen: false }] }))}>Zähler hinzufügen</Button>}
        </div>
      )}

      {schritt === 4 && (
        <div className="space-y-3">
          {p.raeume.length === 0 && <p className="text-[13px] text-gedaempft">Noch kein Raum erfasst.</p>}
          {p.raeume.map((x) => (
            <div key={x.id} className="grid gap-3 rounded-[var(--radius)] border border-linie p-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Feld id={`r-name-${x.id}`} beschriftung="Raum"><Eingabe disabled={gesperrt} list="raum-vorschlaege" value={x.name} onChange={(e) => setP((alt) => ({ ...alt, raeume: alt.raeume.map((y) => y.id === x.id ? { ...y, name: e.target.value } : y) }))} /></Feld></div>
              <Feld id={`r-zustand-${x.id}`} beschriftung="Zustand">
                <Auswahl disabled={gesperrt} value={x.zustand} onChange={(e) => setP((alt) => ({ ...alt, raeume: alt.raeume.map((y) => y.id === x.id ? { ...y, zustand: e.target.value } : y) }))}>
                  {Object.entries(ZUSTAENDE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Auswahl>
              </Feld>
              <div className="sm:col-span-3"><Feld id={`r-maengel-${x.id}`} beschriftung="Mängel, Schäden, Besonderheiten"><Textfeld rows={2} disabled={gesperrt} value={x.maengel} onChange={(e) => setP((alt) => ({ ...alt, raeume: alt.raeume.map((y) => y.id === x.id ? { ...y, maengel: e.target.value } : y) }))} /></Feld></div>
              {!gesperrt && <div className="sm:col-span-6"><Button type="button" variante="leise" groesse="klein" onClick={() => setP((alt) => ({ ...alt, raeume: alt.raeume.filter((y) => y.id !== x.id) }))}>Raum entfernen</Button></div>}
            </div>
          ))}
          <datalist id="raum-vorschlaege">{RAUM_VORSCHLAEGE.map((n) => <option key={n} value={n} />)}</datalist>
          {!gesperrt && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setP((alt) => ({ ...alt, raeume: [...alt.raeume, { id: neueId(), name: "", zustand: "gut", maengel: "", foto_pfade: [] }] }))}>Raum hinzufügen</Button>
              <Button type="button" variante="leise" groesse="klein" onClick={() => setP((alt) => ({ ...alt, raeume: [...alt.raeume, ...RAUM_VORSCHLAEGE.slice(0, 6).map((n) => ({ id: neueId(), name: n, zustand: "gut", maengel: "", foto_pfade: [] }))] }))}>Standardräume einfügen</Button>
            </div>
          )}
          <p className="text-[12px] text-gedaempft">Fotos zu Räumen legen Sie über die Unterlagen des Objekts ab (Art „Übergabefoto“); das Protokoll verweist darauf.</p>
        </div>
      )}

      {schritt === 5 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Feld id="so-rm" beschriftung="Rauchmelder (Anzahl)"><Eingabe type="number" min={0} disabled={gesperrt} value={p.sonstiges.rauchmelder_anzahl ?? ""} onChange={(e) => setzen({ sonstiges: { ...p.sonstiges, rauchmelder_anzahl: e.target.value === "" ? null : Number(e.target.value) } })} /></Feld>
          <Feld id="so-rmf" beschriftung="Rauchmelder Funktion">
            <Auswahl disabled={gesperrt} value={p.sonstiges.rauchmelder_funktion} onChange={(e) => setzen({ sonstiges: { ...p.sonstiges, rauchmelder_funktion: e.target.value as "ja" | "nein" | "nicht_geprueft" } })}>
              <option value="nicht_geprueft">nicht geprüft</option><option value="ja">geprüft, in Ordnung</option><option value="nein">nicht in Ordnung</option>
            </Auswahl>
          </Feld>
          <Feld id="so-schimmel" beschriftung="Schimmel">
            <Auswahl disabled={gesperrt} value={p.sonstiges.schimmel} onChange={(e) => setzen({ sonstiges: { ...p.sonstiges, schimmel: e.target.value as "nein" | "ja" | "nicht_geprueft" } })}>
              <option value="nicht_geprueft">nicht geprüft</option><option value="nein">nicht festgestellt</option><option value="ja">festgestellt</option>
            </Auswahl>
          </Feld>
          {p.sonstiges.schimmel === "ja" && <div className="sm:col-span-3"><Feld id="so-wo" beschriftung="Wo?"><Eingabe disabled={gesperrt} value={p.sonstiges.schimmel_wo} onChange={(e) => setzen({ sonstiges: { ...p.sonstiges, schimmel_wo: e.target.value } })} /></Feld></div>}
          <label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" disabled={gesperrt} checked={p.sonstiges.hausordnung_uebergeben} onChange={(e) => setzen({ sonstiges: { ...p.sonstiges, hausordnung_uebergeben: e.target.checked } })} /> Hausordnung übergeben</label>
          <label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" disabled={gesperrt} checked={p.sonstiges.anleitungen_uebergeben} onChange={(e) => setzen({ sonstiges: { ...p.sonstiges, anleitungen_uebergeben: e.target.checked } })} /> Bedienungsanleitungen übergeben</label>
          <div className="sm:col-span-3"><Feld id="so-sonder" beschriftung="Sonderabreden"><Textfeld rows={4} disabled={gesperrt} value={p.sonstiges.sonderabreden} onChange={(e) => setzen({ sonstiges: { ...p.sonstiges, sonderabreden: e.target.value } })} /></Feld></div>
        </div>
      )}

      {schritt === 6 && (
        <div className="grid gap-5 sm:grid-cols-2">
          {(["uebergeber", "uebernehmer"] as const).map((rolle) => (
            <div key={rolle} className="space-y-2">
              <Feld id={`us-name-${rolle}`} beschriftung={`Name ${rolle === "uebergeber" ? r.uebergeber : r.uebernehmer}`}>
                <Eingabe disabled={gesperrt} value={p.unterschriften[rolle]?.name ?? p[rolle].name} onChange={(e) => setzen({ unterschriften: { ...p.unterschriften, [rolle]: { name: e.target.value, bild: p.unterschriften[rolle]?.bild ?? null, zeit: p.unterschriften[rolle]?.zeit ?? null } } })} />
              </Feld>
              {gesperrt ? (
                p.unterschriften[rolle]?.bild ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.unterschriften[rolle]!.bild!} alt="Unterschrift" className="h-24 rounded-[var(--radius)] border border-linie bg-flaeche object-contain" />
                ) : <p className="text-[13px] text-gedaempft">Keine Unterschrift.</p>
              ) : (
                <Unterschriftsfeld
                  bezeichnung={rolle === "uebergeber" ? r.uebergeber : r.uebernehmer}
                  wert={p.unterschriften[rolle]?.bild ?? null}
                  onChange={(bild) => setzen({ unterschriften: { ...p.unterschriften, [rolle]: { name: p.unterschriften[rolle]?.name ?? p[rolle].name, bild, zeit: bild ? new Date().toISOString() : null } } })}
                />
              )}
            </div>
          ))}
          <p className="sm:col-span-2 text-[12px] text-gedaempft">Unterschriften auf dem Bildschirm sind einfache elektronische Signaturen (Art. 3 Nr. 10 eIDAS). Vor dem Unterschreiben speichern Sie das Protokoll; nach dem Abschluss ist es unveränderlich.</p>
        </div>
      )}

      {schritt === 7 && (
        <div className="space-y-4">
          {fehlt.length > 0 ? (
            <Hinweis ton="warnung" titel="Noch nicht ausgefüllt"><ul className="list-disc pl-5">{fehlt.map((f) => <li key={f}>{f}</li>)}</ul></Hinweis>
          ) : (
            <Hinweis ton="erfolg">Alle Pflichtangaben sind vorhanden.</Hinweis>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={`/api/dokumente/uebergabe/${id}?format=pdf`} target="_blank" rel="noreferrer" className={buttonKlassen({ variante: "sekundaer" })}>PDF öffnen</a>
            <a href={`/api/dokumente/uebergabe/${id}?format=docx`} className={buttonKlassen({ variante: "sekundaer" })}>Word herunterladen</a>
          </div>
          {status === "entwurf" && darfFreigeben && (
            <form action={abschlussAktion}>
              <input type="hidden" name="id" value={id} />
              {abschluss.fehler && <Hinweis ton="fehler" className="mb-2">{abschluss.fehler}</Hinweis>}
              {abschluss.erfolg && <Hinweis ton="erfolg" className="mb-2">{abschluss.erfolg}</Hinweis>}
              <Button type="submit" laedt={schliesst} disabled={fehlt.length > 0}>Protokoll abschließen</Button>
              <p className="mt-2 text-[12px] text-gedaempft">Bitte vorher speichern — der Abschluss prüft den gespeicherten Stand.</p>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <div className="flex gap-2">
          <Button type="button" variante="leise" groesse="klein" disabled={schritt === 1} onClick={() => setSchritt((s) => Math.max(1, s - 1))}>Zurück</Button>
          <Button type="button" variante="leise" groesse="klein" disabled={schritt === SCHRITTE.length} onClick={() => setSchritt((s) => Math.min(SCHRITTE.length, s + 1))}>Weiter</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {speichern.fehler && <Marke ton="fehler">{speichern.fehler}</Marke>}
          {speichern.erfolg && <Marke ton="erfolg">{speichern.erfolg}</Marke>}
          {status === "entwurf" && darfAendern && (
            <>
              <form action={speichernAktion}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="protokoll" value={JSON.stringify(p)} />
                <Button type="submit" laedt={speichert}>Speichern</Button>
              </form>
              <form action={uebergabeLoeschen} onSubmit={(e) => { if (!window.confirm("Dieses Protokoll wirklich löschen?")) e.preventDefault(); }}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" variante="gefahr" groesse="klein">Löschen</Button>
              </form>
            </>
          )}
          <Link href="/uebergaben" className="text-[13px] text-akzent hover:underline">Zur Übersicht</Link>
        </div>
      </div>
      <p className="text-[12px] text-gedaempft">{TYPEN[p.typ]} · {r.uebergeber} → {r.uebernehmer}</p>
    </div>
  );
}
