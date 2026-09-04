"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { TERMINARTEN } from "@/lib/arbeitsmittel";
import { datum as datumFormat, zeitpunkt } from "@/lib/format";
import { fahrzeitText } from "@/lib/kalender/fahrzeit";
import { serieText } from "@/lib/kalender/serie";
import type { KalenderTermin, Mitarbeiter } from "@/lib/kalender/typen";
import { berlin } from "@/lib/kalender/zeit";
import { terminAbsagen } from "@/server/arbeitsmittel-aktionen";
import { fahrzeitBerechnen, terminBestaetigungVorbereiten, terminBestaetigungVorlage, terminBestaetigungVorschlag, terminLoeschen, type KalenderErgebnis } from "@/server/kalender-aktionen";
import { Textfeld } from "@/components/ui/Feld";
import { KiKennzeichen } from "@/components/ui/Status";

import { TerminFormular, terminStart } from "./TerminFormular";

/** Detailseite eines Termins: bearbeiten, Serie, Fahrzeit, Bestaetigung, Absage, Loeschen. */
export function TerminDetail({ termin, mitarbeiter, objekte, kontakte, benutzerId, standardDauer, darfAendern, fahrzeitAktiv, kiVerfuegbar = false }: { termin: KalenderTermin; mitarbeiter: Mitarbeiter[]; objekte: Array<{ id: string; bezeichnung: string }>; kontakte: Array<{ id: string; bezeichnung: string; email: string | null }>; benutzerId: string; standardDauer: number; darfAendern: boolean; fahrzeitAktiv: boolean; kiVerfuegbar?: boolean }) {
  const t = termin;
  const [fz, fzAktion, rechnet] = useActionState<KalenderErgebnis, FormData>(fahrzeitBerechnen, {});
  const [best, bestAktion, bereitet] = useActionState<KalenderErgebnis, FormData>(terminBestaetigungVorbereiten, {});
  const [vorschlag, vorschlagAktion, erzeugt] = useActionState<KalenderErgebnis, FormData>(terminBestaetigungVorschlag, {});
  const [vorlage, vorlageAktion, laedtVorlage] = useActionState<KalenderErgebnis, FormData>(terminBestaetigungVorlage, {});
  const [textOffen, setTextOffen] = useState(Boolean(t.bestaetigung_text));
  const bestText = vorschlag.text ?? vorlage.text ?? t.bestaetigung_text ?? "";
  const ersteller = mitarbeiter.find((m) => m.id === t.erstellt_von)?.name ?? null;
  const fahrzeit = fz.fahrzeit ?? t.fahrzeit;
  const b = berlin(t.beginnt_am);
  const e = berlin(t.endet_am);
  const kontaktMail = t.kontakt?.email ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Marke ton="akzent">{TERMINARTEN[t.art]}</Marke>
        {t.abgesagt_am && <Marke ton="fehler">Abgesagt am {datumFormat(t.abgesagt_am)}</Marke>}
        {t.serie_id && <Marke>Serie: {serieText(t.serie_regel)}</Marke>}
        {t.privat && <Marke ton="warnung">Privat</Marke>}
        {t.extern_quelle && <Marke ton="info">Aus {t.extern_quelle === "google" ? "Google Kalender" : "Outlook"}</Marke>}
        {t.bestaetigt_am && <Marke ton="erfolg">Bestätigung gesendet {datumFormat(t.bestaetigt_am)}</Marke>}
        {t.erinnert_am && <Marke ton="info">Erinnert {zeitpunkt(t.erinnert_am)}</Marke>}
        {t.nachgefasst_am && <Marke ton="info">Nachfass-Vorschlag erzeugt</Marke>}
        {t.erinnerung_kunde_am && <Marke ton={t.erinnerung_kunde_grund ? "neutral" : "erfolg"}>{t.erinnerung_kunde_grund ? `Kundenerinnerung übersprungen: ${t.erinnerung_kunde_grund}` : `Kunde erinnert ${zeitpunkt(t.erinnerung_kunde_am)}`}</Marke>}
        {t.lead_id && <Link href={`/akquise/leads/${t.lead_id}`} className="text-[12px] text-akzent hover:underline">Akquise-Lead</Link>}
        {ersteller && <span className="text-[12px] text-gedaempft">Erstellt von {ersteller}</span>}
        <span className="text-[13px] text-gedaempft">{t.ganztags ? `${b.datum.split("-").reverse().join(".")} ganztägig` : `${b.datum.split("-").reverse().join(".")}, ${b.zeit}–${e.zeit} Uhr`}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/dokumente/termin/${t.id}`} className={buttonKlassen({ variante: "sekundaer" })}>Kalenderdatei (.ics)</a>
        {t.objekt_id && <Link href={`/objekte/${t.objekt_id}`} className={buttonKlassen({ variante: "leise" })}>Zum Objekt</Link>}
        {t.kontakt_id && <Link href={`/kontakte/${t.kontakt_id}`} className={buttonKlassen({ variante: "leise" })}>Zum Kontakt</Link>}
      </div>

      {darfAendern && !t.extern_quelle && (
        <Karte>
          <KarteKopf><KarteTitel>Termin bearbeiten</KarteTitel></KarteKopf>
          <KarteInhalt><TerminFormular start={terminStart(t)} mitarbeiter={mitarbeiter} objekte={objekte} kontakte={kontakte} benutzerId={benutzerId} standardDauer={standardDauer} /></KarteInhalt>
        </Karte>
      )}
      {t.extern_quelle && <Hinweis>Dieser Termin stammt aus dem verbundenen {t.extern_quelle === "google" ? "Google-" : "Outlook-"}Kalender und wird dort gepflegt. Notiz, Ort und Zeiten kommen beim nächsten Abgleich mit.</Hinweis>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Karte>
          <KarteKopf><KarteTitel>Fahrzeit</KarteTitel><KarteBeschreibung>Anfahrt vom vorherigen Termin oder der Startadresse, Rückfahrt zum nächsten — im Kalender als Schraffur.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="space-y-2 text-[13px]">
            {fz.fehler && <Hinweis ton="fehler">{fz.fehler}</Hinweis>}
            {fahrzeit ? (
              <>
                {fahrzeit.hin && <p>🚗 <strong>{fahrzeitText(fahrzeit.hin.min)}</strong> Anfahrt ab {fahrzeit.hin.aus_termin ? `„${fahrzeit.hin.aus_termin}“ · ` : ""}{fahrzeit.hin.von}{fahrzeit.hin.km !== null ? ` (${String(fahrzeit.hin.km).replace(".", ",")} km)` : ""}</p>}
                {fahrzeit.rueck && <p>🏁 <strong>{fahrzeitText(fahrzeit.rueck.min)}</strong> Rückfahrt {fahrzeit.rueck.zu_termin ? `zu „${fahrzeit.rueck.zu_termin}“ · ` : ""}{fahrzeit.rueck.nach}{fahrzeit.rueck.km !== null ? ` (${String(fahrzeit.rueck.km).replace(".", ",")} km)` : ""}</p>}
                <p className="text-[12px] text-gedaempft">Startpunkt: {fahrzeit.basis || "—"}{fahrzeit.puffer_min ? ` · inkl. ${fahrzeit.puffer_min} Min Puffer` : ""}{(fahrzeit.hin?.quelle === "schaetzung" || fahrzeit.rueck?.quelle === "schaetzung") ? " · geschätzt aus der Luftlinie (kein Routendienst eingerichtet)" : ""} · berechnet {zeitpunkt(fahrzeit.berechnet_am)}</p>
              </>
            ) : (
              <p className="text-gedaempft">{fahrzeitAktiv ? "Noch nicht berechnet." : "Fahrzeiten sind in Ihren Kalender-Einstellungen ausgeschaltet."}</p>
            )}
            {darfAendern && !t.ganztags && (
              <form action={fzAktion}><input type="hidden" name="id" value={t.id} /><Button type="submit" variante="sekundaer" groesse="klein" disabled={rechnet}>{rechnet ? "Berechnet …" : fahrzeit ? "Neu berechnen" : "Fahrzeit berechnen"}</Button></form>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Terminbestätigung</KarteTitel><KarteBeschreibung>Text prüfen oder per KI formulieren lassen, dann öffnet das Postfach mit Text und Kalenderdatei; der Versand wird am Termin vermerkt.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="space-y-2 text-[13px]">
            {best.fehler && <Hinweis ton="fehler">{best.fehler}</Hinweis>}
            {vorschlag.fehler && <Hinweis ton="fehler">{vorschlag.fehler}</Hinweis>}
            {t.bestaetigt_am ? <p className="text-gedaempft">Gesendet am {zeitpunkt(t.bestaetigt_am)}.</p> : kontaktMail ? <p className="text-gedaempft">An {kontaktMail}.</p> : <p className="text-gedaempft">Der Termin hat keinen Kontakt mit E-Mail-Adresse.</p>}
            {kontaktMail && !t.abgesagt_am && (
              <form action={bestAktion} className="space-y-2">
                <input type="hidden" name="id" value={t.id} />
                {textOffen && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {(vorschlag.kiVerwendet || (!vorschlag.text && !vorlage.text && t.bestaetigung_text)) && <KiKennzeichen art="erzeugt" />}
                      {vorschlag.hinweis && <span className="text-[12px] text-gedaempft">{vorschlag.hinweis}</span>}
                    </div>
                    <Textfeld name="text" rows={9} key={bestText} defaultValue={bestText} aria-label="Text der Bestätigung" />
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {!textOffen && <Button type="submit" variante="leise" groesse="klein" formAction={vorlageAktion} disabled={laedtVorlage} onClick={() => setTextOffen(true)}>Text ansehen</Button>}
                  {darfAendern && <Button type="submit" variante="sekundaer" groesse="klein" formAction={vorschlagAktion} onClick={() => setTextOffen(true)} disabled={erzeugt}>{erzeugt ? "Formuliert …" : textOffen ? `Vorschlag neu erzeugen${kiVerfuegbar ? " (KI, 1 Credit)" : ""}` : `Text per KI formulieren${kiVerfuegbar ? " (1 Credit)" : ""}`}</Button>}
                  <Button type="submit" variante="sekundaer" groesse="klein" disabled={bereitet}>{t.bestaetigt_am ? "Erneut senden" : "Bestätigung vorbereiten"}</Button>
                </div>
              </form>
            )}
          </KarteInhalt>
        </Karte>
      </div>

      {darfAendern && (
        <div className="flex flex-wrap items-center gap-2">
          {!t.abgesagt_am && !t.extern_quelle && <form action={terminAbsagen}><input type="hidden" name="termin_id" value={t.id} /><Button type="submit" variante="leise" groesse="klein">Absagen (bleibt sichtbar)</Button></form>}
          <form action={terminLoeschen}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="umfang" value="dieser" /><Button type="submit" variante="leise" groesse="klein">{t.serie_id ? "Nur diesen Termin löschen" : "Termin löschen"}</Button></form>
          {t.serie_id && <form action={terminLoeschen}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="umfang" value="folgende" /><Button type="submit" variante="leise" groesse="klein">Diesen und alle folgenden löschen</Button></form>}
        </div>
      )}
    </div>
  );
}
