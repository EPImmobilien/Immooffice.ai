"use client";

import { useEffect } from "react";

/**
 * Registriert den Service Worker (PWA: Startbildschirm, Offline-Seite).
 * Nur im Produktionsbetrieb — im Entwicklungsmodus stoert ein Worker beim
 * Nachladen. Kein eigenes Skript-Element, damit die CSP-Nonce nicht noetig ist.
 */
export function PwaRegistrierung() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
  }, []);
  return null;
}
