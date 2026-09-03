"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { selbstauskunftEinreichen, type SelbstauskunftErgebnis } from "@/server/selbstauskunft-oeffentlich";

/** Oeffentliches Formular — freiwillige Angaben, klar als solche gekennzeichnet. */
export function SelbstauskunftFormular({ token }: { token: string }) {
  const [zustand, aktion, laeuft] = useActionState<SelbstauskunftErgebnis, FormData>(selbstauskunftEinreichen, {});
  if (zustand.erfolg) {
    return <Hinweis ton="erfolg" titel="Vielen Dank">Ihre Selbstauskunft ist eingegangen. Wir melden uns bei Ihnen.</Hinweis>;
  }
  return (
    <form action={aktion} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div className="hidden" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>

      <fieldset className="grid gap-3 sm:grid-cols-6">
        <legend className="mb-2 text-[13px] font-semibold text-text">Zur Person</legend>
        <Feld id="sa-anrede" beschriftung="Anrede">
          <Auswahl name="anrede" defaultValue=""><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option><option value="Familie">Familie</option></Auswahl>
        </Feld>
        <div className="sm:col-span-2"><Feld id="sa-vorname" beschriftung="Vorname"><Eingabe name="vorname" autoComplete="given-name" /></Feld></div>
        <div className="sm:col-span-3"><Feld id="sa-nachname" beschriftung="Nachname" pflicht><Eingabe name="nachname" autoComplete="family-name" required /></Feld></div>
        <div className="sm:col-span-3"><Feld id="sa-email" beschriftung="E-Mail" pflicht><Eingabe name="email" type="email" autoComplete="email" required /></Feld></div>
        <div className="sm:col-span-3"><Feld id="sa-telefon" beschriftung="Telefon"><Eingabe name="telefon" type="tel" autoComplete="tel" /></Feld></div>
        <div className="sm:col-span-2"><Feld id="sa-personen" beschriftung="Einziehende Personen"><Eingabe name="personen_anzahl" type="number" min={1} max={20} /></Feld></div>
        <div className="sm:col-span-2"><Feld id="sa-einzug" beschriftung="Gewünschter Einzug"><Eingabe name="einzug_ab" type="date" /></Feld></div>
        <div className="sm:col-span-2"><Feld id="sa-haustiere" beschriftung="Haustiere"><Eingabe name="haustiere" placeholder="keine / Katze / …" /></Feld></div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-6">
        <legend className="mb-2 text-[13px] font-semibold text-text">Beruf und Einkommen (freiwillig)</legend>
        <div className="sm:col-span-3"><Feld id="sa-beruf" beschriftung="Beruf"><Eingabe name="beruf" /></Feld></div>
        <div className="sm:col-span-3"><Feld id="sa-arbeitgeber" beschriftung="Arbeitgeber"><Eingabe name="arbeitgeber" /></Feld></div>
        <div className="sm:col-span-2"><Feld id="sa-einkommen" beschriftung="Nettoeinkommen monatlich (€)" hinweis="Haushalt gesamt"><Eingabe name="einkommen_netto" inputMode="decimal" /></Feld></div>
        <div className="sm:col-span-2"><Feld id="sa-schufa" beschriftung="Bonitätsauskunft vorhanden?">
          <Auswahl name="schufa_vorhanden" defaultValue=""><option value="">keine Angabe</option><option value="ja">ja</option><option value="nein">nein</option></Auswahl>
        </Feld></div>
        <div className="sm:col-span-2"><Feld id="sa-kaution" beschriftung="Kaution kann geleistet werden?">
          <Auswahl name="kann_kaution_leisten" defaultValue=""><option value="">keine Angabe</option><option value="ja">ja</option><option value="nein">nein</option></Auswahl>
        </Feld></div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-6">
        <legend className="mb-2 text-[13px] font-semibold text-text">Bisheriges Mietverhältnis (freiwillig)</legend>
        <div className="sm:col-span-3"><Feld id="sa-vermieter" beschriftung="Derzeitiger Vermieter"><Eingabe name="derzeitiger_vermieter" /></Feld></div>
        <div className="sm:col-span-2"><Feld id="sa-seit" beschriftung="Mietverhältnis seit"><Eingabe name="mietverhaeltnis_seit" placeholder="z. B. 2019" /></Feld></div>
        <div className="sm:col-span-1"><Feld id="sa-raucher" beschriftung="Raucher?">
          <Auswahl name="raucher" defaultValue=""><option value="">—</option><option value="ja">ja</option><option value="nein">nein</option></Auswahl>
        </Feld></div>
        <div className="sm:col-span-6"><Feld id="sa-mitteilung" beschriftung="Mitteilung"><Textfeld name="mitteilung" rows={4} /></Feld></div>
      </fieldset>

      <div className="space-y-2 text-[13px] text-text">
        <label className="flex items-start gap-2"><input type="checkbox" name="angaben_bestaetigt" value="1" className="mt-0.5" /> Ich bestätige, dass die Angaben wahrheitsgemäß sind.</label>
        <label className="flex items-start gap-2"><input type="checkbox" name="datenschutz" value="1" className="mt-0.5" required /> Ich stimme zu, dass meine Angaben zur Prüfung meiner Anfrage gespeichert und verarbeitet werden. Sie werden nach Abschluss der Vermietung gelöscht, sofern kein Mietvertrag zustande kommt.</label>
      </div>
      <p className="text-[12px] text-gedaempft">Angaben zu Beruf, Einkommen und bisherigem Mietverhältnis sind freiwillig; ohne sie kann die Prüfung länger dauern. Fragen nach Familienplanung, Religion oder Gesundheit werden nicht gestellt.</p>
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      <Button type="submit" laedt={laeuft}>Selbstauskunft absenden</Button>
    </form>
  );
}
