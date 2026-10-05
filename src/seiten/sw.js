/*
 * ImmoOffice – Service Worker für den Offline-Zugriff.
 *
 * Hält die Hülle des Portals (index.html und die Bibliotheken von den CDNs)
 * im Browser-Zwischenspeicher, damit die App auch ohne Netz startet und die
 * Offline-Mappe (IndexedDB) anzeigen kann. Datenzugriffe auf Supabase werden
 * NICHT zwischengespeichert — sie laufen unverändert durch.
 *
 * Die Marke 20261005-1348 setzt portal/bauen.py bei jeder Auslieferung neu;
 * dadurch wird der alte Zwischenspeicher ersetzt, sobald der Nutzer online
 * die neue Fassung geladen hat. [
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js",
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Marcellus&display=swap",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Marcellus&display=swap",
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css"
] ersetzt bauen.py durch die Liste
 * der Skript- und Stylesheet-Adressen aus dem Kopf der index.html.
 */
const STAND = "__IMMO_STAND__";
const CACHE = "immooffice-" + STAND;
const HUELLE = ["./", "./index.html"];
const CDN = [
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js",
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Marcellus&display=swap",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Marcellus&display=swap",
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css"
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "alcdn.msauth.net",
                   "fonts.googleapis.com", "fonts.gstatic.com", "unpkg.com"];

self.addEventListener("install", (ereignis) => {
  ereignis.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Hülle muss klappen; einzelne CDN-Dateien dürfen scheitern (werden beim ersten Aufruf nachgeholt)
    await cache.addAll(HUELLE);
    await Promise.all(CDN.map(async (url) => {
      try {
        const antwort = await fetch(url, { mode: "cors" });
        if (antwort.ok) await cache.put(url, antwort);
      } catch (e) { /* offline beim Installieren – später */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter((n) => n.startsWith("immooffice-") && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (ereignis) => {
  if (ereignis.data && ereignis.data.typ === "skipWaiting") self.skipWaiting();
});

function istHuelle(url) {
  if (url.origin !== self.location.origin) return false;
  const pfad = url.pathname.replace(/\/+$/, "");
  return pfad === "" || pfad.endsWith("/index.html");
}

async function netzZuerst(anfrage, cacheSchluessel, zeitlimitMs) {
  const cache = await caches.open(CACHE);
  try {
    const steuer = new AbortController();
    const uhr = setTimeout(() => steuer.abort(), zeitlimitMs);
    const antwort = await fetch(anfrage, { signal: steuer.signal });
    clearTimeout(uhr);
    if (antwort && antwort.ok) cache.put(cacheSchluessel, antwort.clone());
    return antwort;
  } catch (e) {
    const gespeichert = await cache.match(cacheSchluessel);
    if (gespeichert) return gespeichert;
    throw e;
  }
}

async function cacheZuerst(anfrage) {
  const cache = await caches.open(CACHE);
  const gespeichert = await cache.match(anfrage.url);
  if (gespeichert) return gespeichert;
  const antwort = await fetch(anfrage);
  if (antwort && (antwort.ok || antwort.type === "opaque")) cache.put(anfrage.url, antwort.clone());
  return antwort;
}

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== "GET") return;
  let url;
  try { url = new URL(anfrage.url); } catch (e) { return; }

  // Öffentliche Seiten mit Token (Exposé-Freigabe, Rundgang) gehören nicht zur App-Hülle:
  // unverändert durchlassen und nie als index.html zwischenspeichern.
  if (/(^|[?&])(expose|rundgang)=/.test(url.search) || /\/(freigabe|rundgang|objekt|sonnenverlauf)\.html$/.test(url.pathname)) return;
  // Die Seite selbst: frisch vom Netz, sonst aus dem Zwischenspeicher
  if (anfrage.mode === "navigate" || istHuelle(url)) {
    ereignis.respondWith(netzZuerst(anfrage, "./index.html", 8000).catch(() => caches.match("./index.html")));
    return;
  }
  // Bibliotheken: aus dem Zwischenspeicher, sonst laden und merken
  if (CDN_HOSTS.includes(url.hostname)) {
    ereignis.respondWith(cacheZuerst(anfrage).catch(() => fetch(anfrage)));
    return;
  }
  // Alles andere (Supabase, Karten, Bilder) unverändert
});
