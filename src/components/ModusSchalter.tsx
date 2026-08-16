"use client";

import * as React from "react";

import { Button } from "@/components/ui/Button";

const SPEICHER_SCHLUESSEL = "immooffice-modus";
const EREIGNIS = "immooffice:modus-geaendert";

type Wahl = "system" | "hell" | "dunkel";

function gespeicherteWahl(): Wahl {
  try {
    const wert = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (wert === "hell" || wert === "dunkel") return wert;
  } catch {
    // Privater Modus ohne Speicherzugriff: Systemeinstellung gilt weiter.
  }
  return "system";
}

/** Meldet Aenderungen der Systemeinstellung und der eigenen Auswahl. */
function abonnieren(benachrichtigen: () => void) {
  const abfrage = window.matchMedia("(prefers-color-scheme: dark)");
  abfrage.addEventListener("change", benachrichtigen);
  window.addEventListener(EREIGNIS, benachrichtigen);
  return () => {
    abfrage.removeEventListener("change", benachrichtigen);
    window.removeEventListener(EREIGNIS, benachrichtigen);
  };
}

/** Welcher Modus ist gerade tatsaechlich sichtbar? */
function sichtbarerModus(): "hell" | "dunkel" {
  const gesetzt = document.documentElement.dataset["modus"];
  if (gesetzt === "hell" || gesetzt === "dunkel") return gesetzt;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dunkel"
    : "hell";
}

/**
 * Umschalter zwischen Hell- und Dunkelmodus.
 *
 * Ohne ausdrueckliche Wahl gilt die Systemeinstellung — das entscheidet allein
 * CSS (siehe globals.css), weshalb der Modus schon vor dem ersten Frame stimmt
 * und nicht an geladenem JavaScript haengt. Dieser Schalter setzt lediglich
 * `data-modus` am <html> und merkt sich die Wahl lokal.
 *
 * Der sichtbare Modus ist Zustand ausserhalb von React (DOM-Attribut plus
 * Systemeinstellung); er wird deshalb ueber useSyncExternalStore gelesen statt
 * in einem Effekt nachgehalten.
 */
export function ModusSchalter({ className }: { className?: string }) {
  const modus = React.useSyncExternalStore(
    abonnieren,
    sichtbarerModus,
    // Serverseitig ist die Systemeinstellung unbekannt. Hell ist der neutrale
    // Ausgangswert; nach der Hydration korrigiert sich die Anzeige selbst.
    () => "hell" as const,
  );

  // Gespeicherte Wahl auf das Dokument anwenden. Reiner DOM-Seiteneffekt.
  React.useEffect(() => {
    const wahl = gespeicherteWahl();
    if (wahl !== "system") {
      document.documentElement.dataset["modus"] = wahl;
      window.dispatchEvent(new Event(EREIGNIS));
    }
  }, []);

  function umschalten() {
    const neu = modus === "dunkel" ? "hell" : "dunkel";
    document.documentElement.dataset["modus"] = neu;
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, neu);
    } catch {
      // Auswahl gilt dann nur fuer diese Sitzung.
    }
    window.dispatchEvent(new Event(EREIGNIS));
  }

  const dunkel = modus === "dunkel";
  const beschriftung = dunkel
    ? "Zum Hellmodus wechseln"
    : "Zum Dunkelmodus wechseln";

  return (
    <Button
      variante="sekundaer"
      groesse="klein"
      onClick={umschalten}
      aria-label={beschriftung}
      title={beschriftung}
      className={className}
    >
      <svg
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {dunkel ? (
          <>
            <circle cx="10" cy="10" r="3.6" />
            <path d="M10 1.6v2M10 16.4v2M18.4 10h-2M3.6 10h-2M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4M15.9 15.9l-1.4-1.4M5.5 5.5 4.1 4.1" />
          </>
        ) : (
          <path d="M16.5 11.8A7 7 0 1 1 8.2 3.5a5.6 5.6 0 0 0 8.3 8.3Z" />
        )}
      </svg>
      <span className="sr-only">{beschriftung}</span>
    </Button>
  );
}
