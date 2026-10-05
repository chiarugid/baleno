// Service worker: il sito funziona anche offline dopo la prima visita.
// - Pagina (navigazione): prima la rete, così gli aggiornamenti arrivano subito;
//   senza rete si usa la copia salvata di index.html.
// - JS e CSS hanno ?v=<impronta> (scripts/stamp.mjs): sono immutabili, prima la cache.
// L'elenco dei file e la versione sono generati da scripts/stamp.mjs.

// stamp:begin (generato da scripts/stamp.mjs, non modificare)
const VERSION = 'f9f2b7b7fc';
const ASSETS = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./fonts/inter-var.woff2",
  "./css/components.css?v=ca7146b715",
  "./css/layout.css?v=f93779a1c5",
  "./css/tokens.css?v=c00402aab1",
  "./data/cert-examples.js?v=1d844ec1ea",
  "./data/codecs.js?v=66c631ed19",
  "./data/dscp.js?v=34b67bfb81",
  "./data/emodel.js?v=97bf324dba",
  "./data/guides/android-wifi.js?v=7ba0ae0826",
  "./data/guides/wlanreport.js?v=b11f79e2b3",
  "./data/oui.js?v=dbbf3b616a",
  "./data/rf-limits.js?v=8ea60bbd60",
  "./data/sip-codes.js?v=d3b4f51b9b",
  "./js/app.js?v=aef50d3e06",
  "./js/guides.js?v=cd38389b4f",
  "./js/i18n.js?v=ea7aea2e19",
  "./js/lib/asn1.js?v=28c7b2f5e0",
  "./js/lib/x509.js?v=e7ccde0776",
  "./js/tools/certs.js?v=a70430cbbf",
  "./js/tools/cucm.js?v=54d9b2f1ac",
  "./js/tools/dscp.js?v=ad8f49468a",
  "./js/tools/mac.js?v=7e3221ffd2",
  "./js/tools/mos.js?v=38bc38f1d5",
  "./js/tools/rf-chart.js?v=3f8e8f425c",
  "./js/tools/rf-power.js?v=1e85409aaa",
  "./js/tools/sip-codes.js?v=e168fa2e4e",
  "./js/tools/sip-parser.js?v=42663310ca",
  "./js/tools/subnet.js?v=321464fbdb",
  "./js/tools/voip-bw.js?v=92bfe4425c",
  "./js/ui/dashlet.js?v=52dbac7267",
  "./js/ui/dom.js?v=147599b9f3",
  "./js/ui/icons.js?v=325806c005",
  "./js/ui/table.js?v=d2c1a1054c",
  "./js/visits.js?v=0fdddb98ae"
];
// stamp:end

const CACHE = `rebluc-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

// Alla prima attivazione o dopo un aggiornamento: elimina le cache delle versioni precedenti.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('rebluc-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })());
});
