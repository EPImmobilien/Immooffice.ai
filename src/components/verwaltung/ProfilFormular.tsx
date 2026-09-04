"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { BUNDESLAENDER } from "@/lib/verwaltung/feiertage";
import { profilSpeichern, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

export interface ProfilWerte {
  name: string;
  titel: string | null;
  funktion: string | null;
  telefon: string | null;
  email: string;
  bundesland: string | null;
  fotoUrl: string | null;
  signaturUrl: string | null;
  eintritt: string | null;
  urlaubstage_jahr: number;
}

/** Eigenes Profil (Referenz: Admin → Profil): Titel, Funktion, Telefon, Foto, Signaturbild. */
export function ProfilFormular({ werte }: { werte: ProfilWerte }) {
  const [z, aktion, laeuft] = useActionState<VerwaltungErgebnis, FormData>(profilSpeichern, {});
  return (
    <form action={aktion} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Feld id="pr-name" beschriftung="Name" pflicht><Eingabe id="pr-name" name="name" defaultValue={werte.name} required maxLength={200} /></Feld>
        <Feld id="pr-titel" beschriftung="Titel" hinweis="z. B. Dipl.-Kfm., Immobilienökonom (ebs)"><Eingabe id="pr-titel" name="titel" defaultValue={werte.titel ?? ""} maxLength={60} /></Feld>
        <Feld id="pr-funktion" beschriftung="Funktion" hinweis="Erscheint in Signatur und Kundenbereich"><Eingabe id="pr-funktion" name="funktion" defaultValue={werte.funktion ?? ""} maxLength={120} placeholder="Immobilienmaklerin" /></Feld>
        <Feld id="pr-telefon" beschriftung="Telefon"><Eingabe id="pr-telefon" name="telefon" defaultValue={werte.telefon ?? ""} maxLength={60} /></Feld>
        <Feld id="pr-email" beschriftung="E-Mail (Anmeldung)"><Eingabe id="pr-email" value={werte.email} readOnly /></Feld>
        <Feld id="pr-land" beschriftung="Bundesland (Feiertage)"><Auswahl id="pr-land" name="bundesland" defaultValue={werte.bundesland ?? ""}><option value="">— bundesweite Feiertage —</option>{Object.entries(BUNDESLAENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-linie p-3">
          <p className="mb-2 text-[12px] font-medium">Profilfoto</p>
          <div className="flex items-center gap-3">
            {werte.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- oeffentlicher Marken-Bucket
              <img src={werte.fotoUrl} alt="" className="h-16 w-16 rounded-full border border-linie object-cover" />
            ) : <div className="flex h-16 w-16 items-center justify-center rounded-full border border-linie bg-hintergrund text-[11px] text-gedaempft">kein Foto</div>}
            <div className="space-y-1 text-[12px]">
              <input name="foto" type="file" accept="image/jpeg,image/png,image/webp" className="text-[12px]" />
              {werte.fotoUrl && <label className="flex items-center gap-1 text-gedaempft"><input type="checkbox" name="foto_entfernen" value="1" /> Foto entfernen</label>}
            </div>
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-linie p-3">
          <p className="mb-2 text-[12px] font-medium">Signaturbild (Unterschrift)</p>
          <div className="flex items-center gap-3">
            {werte.signaturUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- oeffentlicher Marken-Bucket
              <img src={werte.signaturUrl} alt="" className="h-12 max-w-[160px] border border-linie bg-white object-contain p-1" />
            ) : <div className="flex h-12 w-32 items-center justify-center border border-linie bg-hintergrund text-[11px] text-gedaempft">keine Signatur</div>}
            <div className="space-y-1 text-[12px]">
              <input name="signatur" type="file" accept="image/jpeg,image/png,image/webp" className="text-[12px]" />
              {werte.signaturUrl && <label className="flex items-center gap-1 text-gedaempft"><input type="checkbox" name="signatur_entfernen" value="1" /> entfernen</label>}
              <p className="text-gedaempft">Für Übergabeprotokolle und Briefe — ersetzt keine qualifizierte elektronische Signatur.</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[12px] text-gedaempft">Eintritt {werte.eintritt ? werte.eintritt.split("-").reverse().join(".") : "—"} · {werte.urlaubstage_jahr} Urlaubstage je Jahr — Kontingent pflegt die Verwaltung.</p>
      {z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}
      {z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}
      <Button type="submit" disabled={laeuft}>{laeuft ? "Speichert …" : "Profil speichern"}</Button>
    </form>
  );
}
