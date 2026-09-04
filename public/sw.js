/* ImmoOffice.ai — Service Worker (PWA-Grundgeruest, docs/SCOPE.md).
 * Strategie: Netz zuerst. Nur die Offline-Seite und die Marke liegen im Cache;
 * fachliche Daten werden nie gecacht (Mandantentrennung, Aktualitaet).
 */
const VERSION = "immooffice-v1";
const OFFLINE = "/offline";
const VORAB = [OFFLINE, "/manifest.webmanifest", "/marke/immooffice-icon-dunkel.svg", "/marke/app-icon-192.png"];

self.addEventListener("install", (ereignis) => {
  ereignis.waitUntil(caches.open(VERSION).then((c) => c.addAll(VORAB)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil(
    caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== "GET") return;
  const url = new URL(anfrage.url);
  if (url.origin !== self.location.origin) return;
  // Seitenaufrufe: Netz, sonst Offline-Seite
  if (anfrage.mode === "navigate") {
    ereignis.respondWith(fetch(anfrage).catch(() => caches.match(OFFLINE).then((r) => r || new Response("Offline", { status: 503 }))));
    return;
  }
  // Marke und Manifest: Cache zuerst
  if (VORAB.includes(url.pathname)) {
    ereignis.respondWith(caches.match(anfrage).then((r) => r || fetch(anfrage)));
  }
});
