"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Feld, Textfeld } from "@/components/ui/Feld";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, KiKennzeichen } from "@/components/ui/Status";
import { TEXTSTILE } from "@/lib/ki/typen";
import {
  texteErzeugen,
  type TextErgebnisAnzeige,
} from "@/server/expose-aktionen";

export function TextWerkstatt({
  objektId,
  kiVerfuegbar,
}: {
  objektId: string;
  kiVerfuegbar: boolean;
}) {
  const [zustand, aktion, laeuft] = useActionState<
    TextErgebnisAnzeige,
    FormData
  >(texteErzeugen, {});

  return (
    <Karte>
      <KarteKopf>
        <KarteTitel>Texte erzeugen</KarteTitel>
        <KarteBeschreibung>
          {kiVerfuegbar
            ? "Erzeugt Titel, Objekt-, Ausstattungs- und Lagebeschreibung."
            : "Ohne hinterlegten Modellzugang entsteht ein Entwurf aus den erfassten Objektdaten."}
        </KarteBeschreibung>
      </KarteKopf>

      <KarteInhalt>
        {!kiVerfuegbar && (
          <Hinweis ton="info" titel="Kein Modellzugang hinterlegt" className="mb-5">
            Es wird ein Entwurf ausschließlich aus den erfassten Objektdaten
            erstellt — ohne KI, ohne Credits und ohne KI-Kennzeichnung. Für
            KI-Texte ist <code>OPENAI_API_KEY</code> zu hinterlegen (siehe
            <code> .env.example</code>).
          </Hinweis>
        )}

        {zustand.fehler && (
          <Hinweis ton="fehler" titel="Nicht möglich" className="mb-5">
            {zustand.fehler}
          </Hinweis>
        )}

        {zustand.erfolg && (
          <Hinweis ton="erfolg" titel="Fertig" className="mb-5">
            {zustand.erfolg}
            {zustand.quelle && (
              <span className="mt-1 block text-[12px]">
                Quelle: {zustand.quelle}
                {zustand.kiVerwendet && zustand.credits
                  ? ` · ${zustand.credits} Credits`
                  : " · keine Credits"}
              </span>
            )}
          </Hinweis>
        )}

        {zustand.luecken && zustand.luecken.length > 0 && (
          <Hinweis ton="warnung" titel="Nicht belegte Angaben" className="mb-5">
            <p className="mb-2">
              Diese Angaben fehlen und wurden bewusst <strong>nicht</strong>{" "}
              ergänzt. Bitte vor der Veröffentlichung prüfen:
            </p>
            <ul className="space-y-1">
              {zustand.luecken.map((luecke) => (
                <li key={luecke.feld}>
                  <strong>{luecke.bezeichnung}</strong> — {luecke.hinweis}
                </li>
              ))}
            </ul>
          </Hinweis>
        )}

        <form action={aktion} className="space-y-5">
          <input type="hidden" name="objektId" value={objektId} />

          <Feld id="stil" beschriftung="Textstil">
            <Auswahl name="stil" defaultValue="sachlich">
              {Object.entries(TEXTSTILE).map(([w, b]) => (
                <option key={w} value={w}>
                  {b}
                </option>
              ))}
            </Auswahl>
          </Feld>

          <Feld
            id="stichpunkte"
            beschriftung="Stichpunkte zur Ausstattung"
            hinweis="Nur was hier oder im Objekt steht, wird verwendet. Es wird nichts hinzuerfunden."
          >
            <Textfeld
              name="stichpunkte"
              placeholder="Südbalkon, Einbauküche 2021, Kellerabteil, Stellplatz, Fußbodenheizung"
            />
          </Feld>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" laedt={laeuft}>
              {kiVerfuegbar ? "Texte erzeugen" : "Entwurf erstellen"}
            </Button>
            {kiVerfuegbar && (
              <span className="inline-flex items-center gap-2 text-[12px] text-gedaempft">
                <KiKennzeichen art="erzeugt" />
                10 Credits
              </span>
            )}
          </div>
        </form>
      </KarteInhalt>
    </Karte>
  );
}
