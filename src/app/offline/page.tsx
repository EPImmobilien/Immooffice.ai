import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

/** Offline-Seite der PWA: wird vom Service Worker gezeigt, wenn das Netz fehlt. */
export default function OfflineSeite() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
      <p className="text-[11px] uppercase tracking-[0.12em] text-gedaempft">ImmoOffice.ai</p>
      <h1 className="mt-2 text-lg font-semibold text-text">Keine Verbindung</h1>
      <p className="mt-2 text-[13px] text-gedaempft">Ihre Daten liegen sicher auf dem Server und werden nicht auf dem Gerät gespeichert. Sobald das Netz wieder da ist, laden Sie die Seite einfach neu.</p>
      <a href="/dashboard" className="mt-6 inline-block rounded-[var(--radius)] bg-primaer px-4 py-2 text-[13px] text-white">Erneut versuchen</a>
    </main>
  );
}
