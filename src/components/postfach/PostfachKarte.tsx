"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { zeitpunkt } from "@/lib/format";
import { ANBIETER_BEZEICHNUNG } from "@/lib/postfach/typen";
import {
  freigabeEntfernen,
  freigabeSetzen,
  postfachAbrufen,
  postfachAendern,
  postfachLoeschen,
  postfachTrennen,
  type PostfachErgebnis,
} from "@/server/postfach-aktionen";

import type { BenutzerKurz, FreigabeZeile, PostfachZeile } from "./typen";

const STATUS: Record<PostfachZeile["status"], { text: string; ton: "neutral" | "erfolg" | "warnung" | "fehler" }> = {
  neu: { text: "Neu", ton: "neutral" },
  aktiv: { text: "Verbunden", ton: "erfolg" },
  fehler: { text: "Fehler", ton: "fehler" },
  getrennt: { text: "Getrennt", ton: "warnung" },
};

const INTERVALLE = [
  { wert: 5, text: "Alle 5 Minuten" },
  { wert: 15, text: "Alle 15 Minuten" },
  { wert: 60, text: "Stündlich" },
  { wert: 1440, text: "Täglich" },
];

interface Props {
  postfach: PostfachZeile;
  freigaben: FreigabeZeile[];
  benutzer: BenutzerKurz[];
  istVerwaltung: boolean;
  eigenes: boolean;
}

export function PostfachKarte({ postfach, freigaben, benutzer, istVerwaltung, eigenes }: Props) {
  const [zustand, aendern, speichert] = useActionState<PostfachErgebnis, FormData>(postfachAendern, {});
  const status = STATUS[postfach.status];
  const verwaltbar = eigenes || (postfach.benutzer_id === null && istVerwaltung);
  const unternehmen = postfach.benutzer_id === null;
  const freigegeben = new Set(freigaben.map((f) => f.benutzer_id));
  const benutzerName = new Map(benutzer.map((b) => [b.id, b.name]));

  return (
    <Karte>
      <KarteKopf className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <KarteTitel>{postfach.anzeigename ? `${postfach.anzeigename} — ${postfach.adresse}` : postfach.adresse}</KarteTitel>
          <p className="mt-1 text-[12px] text-gedaempft">
            {ANBIETER_BEZEICHNUNG[postfach.anbieter]} · {unternehmen ? "Unternehmenspostfach" : "Persönliches Postfach"}
            {postfach.letzter_abruf_am ? ` · letzter Abruf ${zeitpunkt(postfach.letzter_abruf_am)}` : " · noch nicht abgerufen"}
          </p>
        </div>
        <Marke ton={status.ton}>{status.text}</Marke>
      </KarteKopf>
      <KarteInhalt className="space-y-4">
        {postfach.fehler_text && postfach.status === "fehler" && (
          <Hinweis ton="fehler">{postfach.fehler_text}{postfach.fehler_zaehler > 1 ? ` (${postfach.fehler_zaehler} Fehlversuche — der Abstand wird gestreckt)` : ""}</Hinweis>
        )}

        {postfach.status !== "getrennt" && (
          <div className="flex flex-wrap gap-2">
            <form action={postfachAbrufen}>
              <input type="hidden" name="postfach_id" value={postfach.id} />
              <Button type="submit" variante="sekundaer" groesse="klein">Jetzt abrufen</Button>
            </form>
          </div>
        )}

        {verwaltbar && postfach.status !== "getrennt" && (
          <form action={aendern} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="postfach_id" value={postfach.id} />
            <Feld beschriftung="Anzeigename" id={`pf-name-${postfach.id}`}>
              <Eingabe name="anzeigename" defaultValue={postfach.anzeigename ?? ""} maxLength={120} />
            </Feld>
            <Feld beschriftung="Abruf" id={`pf-int-${postfach.id}`}>
              <Auswahl name="intervall_minuten" defaultValue={String(postfach.intervall_minuten)}>
                {INTERVALLE.map((i) => (
                  <option key={i.wert} value={i.wert}>{i.text}</option>
                ))}
              </Auswahl>
            </Feld>
            <Button type="submit" variante="sekundaer" disabled={speichert}>Speichern</Button>
            <label className="inline-flex items-center gap-1.5 text-[13px] text-text sm:col-span-3">
              <input type="checkbox" name="signatur_anhaengen" value="1" defaultChecked={postfach.signatur_anhaengen} />
              Signatur aus Profil und Erscheinungsbild an gesendete Nachrichten anhängen
            </label>
            {zustand.fehler && <Hinweis ton="fehler" className="sm:col-span-3">{zustand.fehler}</Hinweis>}
            {zustand.erfolg && <Hinweis ton="erfolg" className="sm:col-span-3">{zustand.erfolg}</Hinweis>}
          </form>
        )}

        {unternehmen && istVerwaltung && postfach.status !== "getrennt" && (
          <section className="space-y-2 rounded-[var(--radius)] border border-linie p-3">
            <h4 className="text-[13px] font-semibold text-text">Freigaben</h4>
            {freigaben.length === 0 ? (
              <p className="text-[12px] text-gedaempft">Noch niemand freigegeben — nur Inhaber und Administratoren sehen dieses Postfach.</p>
            ) : (
              <ul className="space-y-1">
                {freigaben.map((f) => (
                  <li key={f.benutzer_id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span>{benutzerName.get(f.benutzer_id) ?? f.benutzer_id} · {f.darf_senden ? "lesen und senden" : "nur lesen"}</span>
                    <form action={freigabeEntfernen}>
                      <input type="hidden" name="postfach_id" value={postfach.id} />
                      <input type="hidden" name="benutzer_id" value={f.benutzer_id} />
                      <Button type="submit" variante="leise" groesse="klein">Entfernen</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={freigabeSetzen} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="postfach_id" value={postfach.id} />
              <div className="min-w-[200px] flex-1">
                <Feld beschriftung="Kollegin oder Kollege" id={`pf-frei-${postfach.id}`}>
                  <Auswahl name="benutzer_id" required defaultValue="">
                    <option value="">— wählen —</option>
                    {benutzer.filter((b) => !freigegeben.has(b.id)).map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.email})</option>
                    ))}
                  </Auswahl>
                </Feld>
              </div>
              <label className="inline-flex items-center gap-1.5 pb-2 text-[13px] text-text">
                <input type="checkbox" name="darf_senden" value="1" defaultChecked /> darf senden
              </label>
              <Button type="submit" variante="sekundaer" groesse="klein">Freigeben</Button>
            </form>
          </section>
        )}

        {verwaltbar && (
          <div className="flex flex-wrap gap-2 border-t border-linie pt-3">
            {postfach.status !== "getrennt" ? (
              <form
                action={postfachTrennen}
                onSubmit={(e) => {
                  if (!window.confirm("Postfach trennen? Gespiegelte Nachrichten ohne Zuordnung werden gelöscht; zugeordnete bleiben anonymisiert im Verlauf.")) e.preventDefault();
                }}
              >
                <input type="hidden" name="postfach_id" value={postfach.id} />
                <Button type="submit" variante="gefahr" groesse="klein">Trennen</Button>
              </form>
            ) : (
              <form action={postfachLoeschen}>
                <input type="hidden" name="postfach_id" value={postfach.id} />
                <Button type="submit" variante="gefahr" groesse="klein">Endgültig entfernen</Button>
              </form>
            )}
          </div>
        )}
      </KarteInhalt>
    </Karte>
  );
}
