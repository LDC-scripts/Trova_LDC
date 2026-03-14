// LDC Keys — Service Worker v5.2
const CACHE_NAME = 'ldc-keys-v5.2';

// File da mettere in cache al primo avvio
const FILES_TO_CACHE = [
  './',
  './index.html'
];

// Installazione: mette in cache i file statici
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Attivazione: elimina cache vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: rete first con fallback cache
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Il CSV di Google Sheets e il proxy vanno sempre dalla rete
  // Se fallisce, non usiamo la cache SW (il CSV è gestito da localStorage nell'app)
  if (url.includes('docs.google.com') || url.includes('corsproxy.io') ||
      url.includes('fonts.googleapis.com') || url.includes('unpkg.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('', { status: 503, statusText: 'Offline' })
      )
    );
    return;
  }

  // Per tutto il resto (HTML, CSS, JS statici):
  // prova la rete, aggiorna la cache, fallback alla cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
