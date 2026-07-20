const CACHE = 'scopegate-__CACHE_VERSION__';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/source/app/style.css',
  '/source/app/app.js',
  '/source/app/scan.js',
  '/source/app/state.js',
  '/source/shared/permissions.js',
  '/source/shared/file-bridge.js',
  '/source/assets/images/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
